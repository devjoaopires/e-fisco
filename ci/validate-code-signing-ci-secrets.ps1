param(
  [switch]$AllowPending
)

$ErrorActionPreference = 'Stop'

function Assert-Condition {
  param([bool]$Condition, [string]$Message)
  if (-not $Condition) { throw $Message }
}

$requiredSecrets = @(
  'SSL_COM_USERNAME',
  'SSL_COM_PASSWORD',
  'SSL_COM_TOTP_SECRET'
)

$missing = @()
foreach ($name in $requiredSecrets) {
  $value = [Environment]::GetEnvironmentVariable($name, 'Process')
  if ([string]::IsNullOrWhiteSpace($value)) {
    $missing += $name
  }
}

$mode = [Environment]::GetEnvironmentVariable('SSL_COM_MODE', 'Process')
if ([string]::IsNullOrWhiteSpace($mode)) {
  $mode = 'PROD'
}

Assert-Condition ($mode -in @('PROD','TEST')) 'SSL_COM_MODE deve ser PROD ou TEST'

if ($missing.Count -gt 0) {
  if ($AllowPending) {
    Write-Output 'CODE_SIGNING_CI_SECRETS_STATUS=PENDING'
    Write-Output "CODE_SIGNING_CI_SECRETS_MISSING=$($missing -join ',')"
    Write-Output "CODE_SIGNING_CI_MODE=$mode"
    return
  }

  throw "Secrets obrigatorios ausentes: $($missing -join ', ')"
}

foreach ($name in $requiredSecrets) {
  $value = [Environment]::GetEnvironmentVariable($name, 'Process')
  Assert-Condition ($value.Length -ge 1) "Secret vazio: $name"
}

Write-Output 'CODE_SIGNING_CI_SECRETS_STATUS=READY'
Write-Output "CODE_SIGNING_CI_MODE=$mode"
Write-Output "CODE_SIGNING_CI_SECRET_COUNT=$($requiredSecrets.Count)"
Write-Output 'CODE_SIGNING_CI_SECRETS_VALIDATION=OK'
