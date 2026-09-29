$ErrorActionPreference = 'Stop'

function Assert-Condition {
  param([bool]$Condition, [string]$Message)
  if (-not $Condition) { throw $Message }
}

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$modelPath = Join-Path $root 'ci\code-signing-model.json'
$policyPath = Join-Path $root 'ci\code-signing-secrets-policy.json'
$gitignorePath = Join-Path $root '.gitignore'

Assert-Condition (Test-Path -LiteralPath $modelPath -PathType Leaf) 'code-signing-model.json ausente'
Assert-Condition (Test-Path -LiteralPath $policyPath -PathType Leaf) 'code-signing-secrets-policy.json ausente'
Assert-Condition (Test-Path -LiteralPath $gitignorePath -PathType Leaf) '.gitignore ausente'

$model = Get-Content -LiteralPath $modelPath -Raw | ConvertFrom-Json
$policy = Get-Content -LiteralPath $policyPath -Raw | ConvertFrom-Json
$gitignore = Get-Content -LiteralPath $gitignorePath -Raw

Assert-Condition ($model.privateKeyModel.exportable -eq $false) 'Chave privada nao pode ser exportavel'
Assert-Condition ($model.privateKeyModel.storedInRepository -eq $false) 'Chave privada nao pode ficar no repositorio'
Assert-Condition ($model.privateKeyModel.storedAsGitHubSecretPfx -eq $false) 'PFX nao pode ser GitHub secret'
Assert-Condition ($model.ciIntegration.localPrivateKeyRequired -eq $false) 'Runner nao pode exigir chave privada local'
Assert-Condition ($model.ciIntegration.environment -eq 'code-signing-production') 'Environment de assinatura inesperado'
Assert-Condition ($model.ciIntegration.secretsPolicyFile -eq 'ci/code-signing-secrets-policy.json') 'Policy de secrets divergente'

foreach ($pattern in @('*.pfx','*.p12','*.pem','*.key','.env','.env.*')) {
  Assert-Condition ($gitignore -match [regex]::Escape($pattern)) ".gitignore nao protege: $pattern"
}

$requiredSecretNames = @('SSL_COM_USERNAME','SSL_COM_PASSWORD','SSL_COM_TOTP_SECRET')
$actualSecretNames = @($policy.environmentSecrets | ForEach-Object { [string]$_.name })
foreach ($requiredName in $requiredSecretNames) {
  Assert-Condition ($actualSecretNames -contains $requiredName) "Environment secret obrigatorio ausente da policy: $requiredName"
}
Assert-Condition ($actualSecretNames -contains 'SSL_COM_CREDENTIAL_ID') 'Credential ID deve ser classificado como environment secret'

foreach ($entry in @($policy.environmentSecrets)) {
  $props = @($entry.PSObject.Properties.Name)
  Assert-Condition ($props -notcontains 'value') "Secret nao pode conter value no arquivo: $($entry.name)"
}

$trackedOutput = & git -C $root.Path ls-files
if ($LASTEXITCODE -ne 0) { throw "git ls-files falhou: $LASTEXITCODE" }
$tracked = @($trackedOutput | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })

$sensitiveExtensions = @('.pfx','.p12','.pem','.key')
$forbiddenTracked = @(
  $tracked | Where-Object {
    $ext = [System.IO.Path]::GetExtension($_).ToLowerInvariant()
    $ext -in $sensitiveExtensions -or $_ -match '(^|/)master\.key$' -or $_ -match '(^|/)\.env($|\.)'
  }
)
Assert-Condition ($forbiddenTracked.Count -eq 0) ("Material sensivel rastreado pelo git: " + ($forbiddenTracked -join ', '))

$privateKeyMarkers = @(
  '-----BEGIN PRIVATE KEY-----',
  '-----BEGIN ENCRYPTED PRIVATE KEY-----',
  '-----BEGIN RSA PRIVATE KEY-----',
  '-----BEGIN EC PRIVATE KEY-----'
)

$markerHits = @()
foreach ($relative in $tracked) {
  $full = Join-Path $root.Path ($relative.Replace('/', '\'))
  if (-not (Test-Path -LiteralPath $full -PathType Leaf)) { continue }

  $item = Get-Item -LiteralPath $full
  if ($item.Length -gt 2097152) { continue }

  try {
    $text = Get-Content -LiteralPath $full -Raw -ErrorAction Stop
  } catch {
    continue
  }

  foreach ($marker in $privateKeyMarkers) {
    if ($text.Contains($marker)) {
      $markerHits += "$relative::$marker"
    }
  }
}
Assert-Condition ($markerHits.Count -eq 0) ("Marcador de chave privada encontrado em arquivo rastreado: " + ($markerHits -join ', '))

Assert-Condition ($policy.privateKey.custody -eq 'SSL.com cloud HSM') 'Custodia da chave divergente'
Assert-Condition ($policy.privateKey.presentOnGitHubRunner -eq $false) 'Chave privada nao pode estar no runner'
Assert-Condition ($policy.githubActions.pullRequestsMayAccessSigningCredentials -eq $false) 'PR nao pode acessar credenciais'
Assert-Condition ($policy.githubActions.forksMayAccessSigningCredentials -eq $false) 'Fork nao pode acessar credenciais'
Assert-Condition ($policy.runnerEphemeralMaterial.ckaMasterKey.uploadAsArtifact -eq $false) 'master.key nao pode virar artifact'
Assert-Condition ($policy.runnerEphemeralMaterial.ckaMasterKey.cleanupRequired -eq $true) 'master.key deve ser removido ao fim do job'
Assert-Condition ($policy.logging.uploadRawCKALogs -eq $false) 'Logs brutos do CKA nao devem ser publicados'

Write-Output "CODE_SIGNING_SECRET_ENVIRONMENT=$($policy.githubActions.environment)"
Write-Output "CODE_SIGNING_SECRET_COUNT=$($policy.environmentSecrets.Count)"
Write-Output "CODE_SIGNING_TRACKED_FILE_COUNT=$($tracked.Count)"
Write-Output 'CODE_SIGNING_PRIVATE_KEY_IN_RUNNER=False'
Write-Output 'CODE_SIGNING_PFX_ALLOWED=False'
Write-Output 'CODE_SIGNING_SECRET_BOUNDARY=OK'
