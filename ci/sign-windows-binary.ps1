param(
  [Parameter(Mandatory = $true)]
  [string]$Path,
  [string]$Thumbprint = $env:SSL_COM_CERT_THUMBPRINT,
  [string]$TimestampUrl,
  [string]$SignToolPath,
  [switch]$AllowPending
)

$ErrorActionPreference = 'Stop'

function Assert-Condition {
  param([bool]$Condition, [string]$Message)
  if (-not $Condition) { throw $Message }
}

function Resolve-SignTool {
  param([string]$ExplicitPath)

  if (-not [string]::IsNullOrWhiteSpace($ExplicitPath)) {
    if (Test-Path -LiteralPath $ExplicitPath -PathType Leaf) {
      return (Resolve-Path -LiteralPath $ExplicitPath).Path
    }
    return $null
  }

  $command = Get-Command signtool.exe -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }

  foreach ($root in @(
    'C:\Program Files (x86)\Windows Kits\10\bin',
    'C:\Program Files\Windows Kits\10\bin'
  )) {
    if (-not (Test-Path -LiteralPath $root -PathType Container)) { continue }

    $versions = @(Get-ChildItem -LiteralPath $root -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending)
    foreach ($versionDir in $versions) {
      foreach ($arch in @('x64','x86')) {
        $candidate = Join-Path $versionDir.FullName "$arch\signtool.exe"
        if (Test-Path -LiteralPath $candidate -PathType Leaf) {
          return $candidate
        }
      }
    }
  }

  return $null
}

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$modelPath = Join-Path $root 'ci\code-signing-model.json'
Assert-Condition (Test-Path -LiteralPath $modelPath -PathType Leaf) 'code-signing-model.json ausente'
$model = Get-Content -LiteralPath $modelPath -Raw | ConvertFrom-Json

if ([string]::IsNullOrWhiteSpace($TimestampUrl)) {
  $TimestampUrl = [string]$model.timestamping.providerEndpoint
}

Assert-Condition ($model.timestamping.required -eq $true) 'Timestamp deve permanecer obrigatorio'
Assert-Condition ([string]$model.timestamping.protocol -eq 'RFC3161') 'Timestamp deve usar RFC3161'
Assert-Condition ([string]$model.timestamping.digest -eq 'SHA256') 'Timestamp digest deve ser SHA256'
Assert-Condition (-not [string]::IsNullOrWhiteSpace($TimestampUrl)) 'Timestamp URL ausente'

$target = Resolve-Path -LiteralPath $Path -ErrorAction SilentlyContinue
if (-not $target) {
  throw "Arquivo para assinatura ausente: $Path"
}

$normalizedThumbprint = if ($Thumbprint) { ($Thumbprint -replace '\s','').ToUpperInvariant() } else { '' }
$resolvedSignTool = Resolve-SignTool $SignToolPath

$cert = $null
if (-not [string]::IsNullOrWhiteSpace($normalizedThumbprint)) {
  foreach ($store in @('Cert:\CurrentUser\My','Cert:\LocalMachine\My')) {
    if (-not (Test-Path $store)) { continue }
    $found = Get-ChildItem $store | Where-Object { $_.Thumbprint -eq $normalizedThumbprint } | Select-Object -First 1
    if ($found) {
      $cert = $found
      break
    }
  }
}

$missing = @()
if ([string]::IsNullOrWhiteSpace($resolvedSignTool)) { $missing += 'signtool' }
if ([string]::IsNullOrWhiteSpace($normalizedThumbprint)) { $missing += 'thumbprint' }
elseif (-not $cert) { $missing += 'certificate' }

if ($missing.Count -gt 0) {
  if ($AllowPending) {
    Write-Output 'CODE_SIGNING_OPERATION=PENDING'
    Write-Output "CODE_SIGNING_MISSING=$($missing -join ',')"
    Write-Output "CODE_SIGNING_TIMESTAMP_URL=$TimestampUrl"
    Write-Output 'CODE_SIGNING_FILE_DIGEST=SHA256'
    Write-Output 'CODE_SIGNING_TIMESTAMP_DIGEST=SHA256'
    return
  }
  throw "Pre-requisitos de assinatura ausentes: $($missing -join ', ')"
}

$ekuOids = @($cert.EnhancedKeyUsageList | ForEach-Object { $_.ObjectId.Value })
Assert-Condition ($ekuOids -contains '1.3.6.1.5.5.7.3.3') 'Certificado selecionado nao possui EKU Code Signing'
Assert-Condition ([bool]$cert.HasPrivateKey) 'Certificado selecionado nao possui binding com chave privada/HSM'

Write-Output "CODE_SIGNING_TARGET=$($target.Path)"
Write-Output "CODE_SIGNING_TIMESTAMP_URL=$TimestampUrl"
Write-Output "CODE_SIGNING_TOOL=$resolvedSignTool"

& $resolvedSignTool sign /fd sha256 /tr $TimestampUrl /td sha256 /sha1 $normalizedThumbprint $target.Path
if ($LASTEXITCODE -ne 0) {
  throw "SignTool sign falhou com exit code $LASTEXITCODE"
}

& $resolvedSignTool verify /pa /all $target.Path
if ($LASTEXITCODE -ne 0) {
  throw "SignTool verify falhou com exit code $LASTEXITCODE"
}

$signature = Get-AuthenticodeSignature -LiteralPath $target.Path
Assert-Condition ($signature.Status -eq 'Valid') "Authenticode invalido apos assinatura: $($signature.Status)"
Assert-Condition ($null -ne $signature.SignerCertificate) 'SignerCertificate ausente apos assinatura'
Assert-Condition ($signature.SignerCertificate.Thumbprint -eq $normalizedThumbprint) 'Thumbprint do signer divergente'
Assert-Condition ($null -ne $signature.TimeStamperCertificate) 'Timestamp RFC3161 ausente apos assinatura'

Write-Output 'CODE_SIGNING_OPERATION=SIGNED'
Write-Output "CODE_SIGNING_SIGNER_THUMBPRINT=$($signature.SignerCertificate.Thumbprint)"
Write-Output "CODE_SIGNING_TIMESTAMPER_SUBJECT=$($signature.TimeStamperCertificate.Subject)"
Write-Output 'CODE_SIGNING_SIGNATURE_VALIDATION=OK'
