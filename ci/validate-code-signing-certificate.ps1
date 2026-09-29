param(
  [string]$Thumbprint,
  [string]$ExpectedOrganizationName,
  [switch]$AllowPending
)

$ErrorActionPreference = 'Stop'

function Assert-Condition {
  param([bool]$Condition, [string]$Message)
  if (-not $Condition) { throw $Message }
}

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$modelPath = Join-Path $root 'ci\code-signing-model.json'
Assert-Condition (Test-Path -LiteralPath $modelPath -PathType Leaf) "Modelo de code signing ausente: $modelPath"

$model = Get-Content -LiteralPath $modelPath -Raw | ConvertFrom-Json
$validation = $model.certificateValidation
Assert-Condition ($null -ne $validation) 'certificateValidation ausente no modelo'

$requiredEku = [string]$validation.requiredEkuOid
$expectedThumbprint = if ($Thumbprint) { $Thumbprint } else { [string]$validation.expectedThumbprint }
$expectedOrganization = if ($ExpectedOrganizationName) { $ExpectedOrganizationName } else { [string]$validation.expectedOrganizationName }

$candidates = @()
foreach ($store in @('Cert:\CurrentUser\My', 'Cert:\LocalMachine\My')) {
  if (-not (Test-Path $store)) { continue }

  foreach ($cert in Get-ChildItem $store) {
    $ekuOids = @($cert.EnhancedKeyUsageList | ForEach-Object { $_.ObjectId.Value })
    if ($ekuOids -notcontains $requiredEku) { continue }

    if (-not [string]::IsNullOrWhiteSpace($expectedThumbprint)) {
      if ($cert.Thumbprint -ne ($expectedThumbprint -replace '\s', '')) { continue }
    }

    $candidates += [pscustomobject]@{
      Store = $store
      Certificate = $cert
    }
  }
}

if ($candidates.Count -eq 0) {
  if ($AllowPending) {
    Write-Output 'CODE_SIGNING_CERTIFICATE_STATUS=PENDING'
    Write-Output 'CODE_SIGNING_CERTIFICATE_FOUND=False'
    Write-Output 'CODE_SIGNING_CERTIFICATE_REASON=certificate-not-issued-or-not-loaded'
    return
  }

  throw 'Certificado de Code Signing nao encontrado no Windows certificate store'
}

Assert-Condition ($candidates.Count -eq 1) "Mais de um certificado de Code Signing candidato encontrado: $($candidates.Count). Configure expectedThumbprint."

$selected = $candidates[0]
$cert = $selected.Certificate
$now = Get-Date

if ([bool]$validation.requireCurrentlyValid) {
  Assert-Condition ($cert.NotBefore -le $now) "Certificado ainda nao valido: $($cert.NotBefore)"
  Assert-Condition ($cert.NotAfter -gt $now) "Certificado expirado: $($cert.NotAfter)"
}

$ekuOids = @($cert.EnhancedKeyUsageList | ForEach-Object { $_.ObjectId.Value })
Assert-Condition ($ekuOids -contains $requiredEku) "EKU Code Signing ausente: $requiredEku"

if ([bool]$validation.requirePrivateKeyBinding) {
  Assert-Condition ([bool]$cert.HasPrivateKey) 'Certificado encontrado sem binding de chave privada/HSM'
}

if ([bool]$validation.identityMustBeConfiguredBeforeStrictValidation) {
  Assert-Condition (-not [string]::IsNullOrWhiteSpace($expectedOrganization)) 'expectedOrganizationName ainda nao configurado no modelo'
}

$subjectOrganization = $null
$match = [regex]::Match($cert.Subject, '(?:^|,\s*)O\s*=\s*("(?:""|[^"])*"|[^,]+)')
if ($match.Success) {
  $subjectOrganization = $match.Groups[1].Value.Trim().Trim('"')
}

Assert-Condition (-not [string]::IsNullOrWhiteSpace($subjectOrganization)) 'subject organizationName (O) ausente no certificado'
Assert-Condition ($subjectOrganization -eq $expectedOrganization) "Identidade divergente: '$subjectOrganization' != '$expectedOrganization'"

$chain = New-Object System.Security.Cryptography.X509Certificates.X509Chain
try {
  $chain.ChainPolicy.RevocationMode = [System.Security.Cryptography.X509Certificates.X509RevocationMode]::Online
  $chain.ChainPolicy.RevocationFlag = [System.Security.Cryptography.X509Certificates.X509RevocationFlag]::EntireChain
  $chain.ChainPolicy.VerificationFlags = [System.Security.Cryptography.X509Certificates.X509VerificationFlags]::NoFlag
  $chain.ChainPolicy.UrlRetrievalTimeout = [TimeSpan]::FromSeconds(30)

  $chainOk = $chain.Build($cert)
  if (-not $chainOk) {
    $statusText = @($chain.ChainStatus | ForEach-Object { "$($_.Status):$($_.StatusInformation.Trim())" }) -join '; '
    throw "Cadeia do certificado invalida: $statusText"
  }

  $chainSubjects = @($chain.ChainElements | ForEach-Object { $_.Certificate.Subject })
  Assert-Condition ($chainSubjects.Count -ge 2) 'Cadeia do certificado incompleta'

  $expectedProvider = [string]$validation.expectedProvider
  if (-not [string]::IsNullOrWhiteSpace($expectedProvider)) {
    $providerSeen = @($chainSubjects | Where-Object { $_ -match [regex]::Escape($expectedProvider) }).Count -gt 0
    Assert-Condition $providerSeen "Cadeia valida, mas nao pertence ao provider esperado: $expectedProvider"
  }

  Write-Output 'CODE_SIGNING_CERTIFICATE_STATUS=VALID'
  Write-Output 'CODE_SIGNING_CERTIFICATE_FOUND=True'
  Write-Output "CODE_SIGNING_CERTIFICATE_STORE=$($selected.Store)"
  Write-Output "CODE_SIGNING_CERTIFICATE_SUBJECT=$($cert.Subject)"
  Write-Output "CODE_SIGNING_CERTIFICATE_ORGANIZATION=$subjectOrganization"
  Write-Output "CODE_SIGNING_CERTIFICATE_ISSUER=$($cert.Issuer)"
  Write-Output "CODE_SIGNING_CERTIFICATE_THUMBPRINT=$($cert.Thumbprint)"
  Write-Output "CODE_SIGNING_CERTIFICATE_SERIAL=$($cert.SerialNumber)"
  Write-Output "CODE_SIGNING_CERTIFICATE_NOT_AFTER=$($cert.NotAfter.ToString('o'))"
  Write-Output "CODE_SIGNING_CERTIFICATE_CHAIN_ELEMENTS=$($chainSubjects.Count)"
  Write-Output 'CODE_SIGNING_CERTIFICATE_VALIDATION=OK'
}
finally {
  $chain.Dispose()
}
