param(
  [string]$SourcePath = 'EFISCO-UPDATER.exe',
  [switch]$AllowPending,
  [switch]$KeepSignedCopy
)

$ErrorActionPreference = 'Stop'

function Assert-Condition {
  param([bool]$Condition, [string]$Message)
  if (-not $Condition) { throw $Message }
}

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$source = Join-Path $root $SourcePath
$signer = Join-Path $root 'ci\sign-windows-binary.ps1'

Assert-Condition (Test-Path -LiteralPath $source -PathType Leaf) "Arquivo de teste ausente: $source"
Assert-Condition (Test-Path -LiteralPath $signer -PathType Leaf) "Script de assinatura ausente: $signer"

$tempRoot = if ($env:RUNNER_TEMP) {
  Join-Path $env:RUNNER_TEMP 'e-fisco-code-signing-test'
} else {
  Join-Path ([System.IO.Path]::GetTempPath()) 'e-fisco-code-signing-test'
}

if (Test-Path -LiteralPath $tempRoot) {
  Remove-Item -LiteralPath $tempRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null

$testFile = Join-Path $tempRoot ([System.IO.Path]::GetFileName($source))
Copy-Item -LiteralPath $source -Destination $testFile -Force

try {
  $beforeHash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash

  if ($AllowPending) {
    & $signer -Path $testFile -AllowPending
  } else {
    & $signer -Path $testFile
  }

  $signature = Get-AuthenticodeSignature -LiteralPath $testFile

  if ($signature.Status -eq 'Valid') {
    $afterSourceHash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash
    Assert-Condition ($beforeHash -eq $afterSourceHash) 'Arquivo-fonte foi alterado durante o teste de assinatura'
    Assert-Condition ($null -ne $signature.TimeStamperCertificate) 'Copia assinada sem timestamp'
    Write-Output 'CODE_SIGNING_TEST_RESULT=SIGNED_AND_VERIFIED'
    Write-Output "CODE_SIGNING_TEST_FILE=$testFile"
  } elseif ($AllowPending) {
    Write-Output 'CODE_SIGNING_TEST_RESULT=PENDING'
  } else {
    throw "Teste de assinatura nao produziu assinatura valida: $($signature.Status)"
  }
}
finally {
  if (-not $KeepSignedCopy -and (Test-Path -LiteralPath $tempRoot)) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force
    Write-Output 'CODE_SIGNING_TEST_CLEANUP=OK'
  }
}
