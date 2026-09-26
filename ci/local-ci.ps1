param(
  [switch]$SkipBuild,
  [switch]$KeepNodeModules,
  [string]$NodeVersion = '24.18.1'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$packagePath = Join-Path $root 'package.json'
$lockPath = Join-Path $root 'package-lock.json'
$nodeModulesPath = Join-Path $root 'node_modules'
$distPath = Join-Path $root 'dist'
$nodeModulesExistedBefore = Test-Path -LiteralPath $nodeModulesPath
$lockHashBefore = (Get-FileHash -LiteralPath $lockPath -Algorithm SHA256).Hash
$npmPath = $null

function Write-Step {
  param([string]$Name)
  Write-Output ''
  Write-Output ('=== ' + $Name + ' ===')
}

function Invoke-Checked {
  param(
    [string]$FilePath,
    [string[]]$Arguments,
    [string]$Label
  )

  & $FilePath @Arguments
  $exitCode = $LASTEXITCODE

  if ($exitCode -ne 0) {
    throw "$Label falhou com exit code $exitCode"
  }
}

function Ensure-PortableNode {
  param([string]$Version)

  $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
  $npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue

  if ($nodeCommand -and $npmCommand) {
    Write-Output ('NODE_SOURCE=PATH')
    Write-Output ('NODE_PATH=' + $nodeCommand.Source)
    return $npmCommand.Source
  }

  $toolRoot = Join-Path $env:LOCALAPPDATA 'e-fisco-ci\tooling'
  $nodeFolderName = "node-v$Version-win-x64"
  $nodeHome = Join-Path $toolRoot $nodeFolderName
  $portableNpm = Join-Path $nodeHome 'npm.cmd'

  if (Test-Path -LiteralPath $portableNpm -PathType Leaf) {
    $env:PATH = $nodeHome + [IO.Path]::PathSeparator + $env:PATH
    Write-Output ('NODE_SOURCE=PORTABLE_CACHE')
    Write-Output ('NODE_HOME=' + $nodeHome)
    return $portableNpm
  }

  New-Item -ItemType Directory -Path $toolRoot -Force | Out-Null

  $zipName = "$nodeFolderName.zip"
  $downloadRoot = Join-Path $env:TEMP ('e-fisco-local-ci-node-' + [guid]::NewGuid().ToString('N'))
  $zipPath = Join-Path $downloadRoot $zipName
  $checksumsPath = Join-Path $downloadRoot 'SHASUMS256.txt'
  $baseUrl = "https://nodejs.org/dist/v$Version"

  New-Item -ItemType Directory -Path $downloadRoot -Force | Out-Null

  try {
    Write-Step "Baixando Node.js $Version"
    Invoke-WebRequest -UseBasicParsing -Uri "$baseUrl/$zipName" -OutFile $zipPath
    Invoke-WebRequest -UseBasicParsing -Uri "$baseUrl/SHASUMS256.txt" -OutFile $checksumsPath

    $checksumLine = Get-Content -LiteralPath $checksumsPath |
      Where-Object { $_ -match ('\s' + [regex]::Escape($zipName) + '$') } |
      Select-Object -First 1

    if (-not $checksumLine) {
      throw "Checksum oficial não encontrado para $zipName"
    }

    $expectedHash = ($checksumLine -split '\s+')[0].ToUpperInvariant()
    $actualHash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToUpperInvariant()

    if ($actualHash -ne $expectedHash) {
      throw "SHA-256 do Node.js divergente: $actualHash != $expectedHash"
    }

    Write-Output 'NODE_ARCHIVE_SHA256=OK'

    if (Test-Path -LiteralPath $nodeHome) {
      Remove-Item -LiteralPath $nodeHome -Recurse -Force
    }

    Expand-Archive -LiteralPath $zipPath -DestinationPath $toolRoot -Force
  }
  finally {
    Remove-Item -LiteralPath $downloadRoot -Recurse -Force -ErrorAction SilentlyContinue
  }

  if (-not (Test-Path -LiteralPath $portableNpm -PathType Leaf)) {
    throw "npm portátil não encontrado após extrair Node.js $Version"
  }

  $env:PATH = $nodeHome + [IO.Path]::PathSeparator + $env:PATH
  Write-Output ('NODE_SOURCE=PORTABLE_DOWNLOAD')
  Write-Output ('NODE_HOME=' + $nodeHome)
  return $portableNpm
}

Push-Location $root
try {
  Write-Step 'Toolchain local'
  $npmPath = Ensure-PortableNode -Version $NodeVersion

  Invoke-Checked -FilePath (Join-Path (Split-Path $npmPath -Parent) 'node.exe') -Arguments @('--version') -Label 'node --version'
  Invoke-Checked -FilePath $npmPath -Arguments @('--version') -Label 'npm --version'

  $env:npm_config_audit = 'false'
  $env:npm_config_fund = 'false'

  Write-Step 'Instalação limpa'
  Invoke-Checked -FilePath $npmPath -Arguments @('ci','--no-audit','--no-fund') -Label 'npm ci'

  Write-Step 'Guardrails da pipeline local'
  Invoke-Checked -FilePath $npmPath -Arguments @('run','test:ci') -Label 'test:ci'

  Write-Step 'Testes unitários'
  Invoke-Checked -FilePath $npmPath -Arguments @('run','test:unit') -Label 'test:unit'

  Write-Step 'Testes de integração'
  Invoke-Checked -FilePath $npmPath -Arguments @('run','test:integration') -Label 'test:integration'

  Write-Step 'Testes de banco'
  Invoke-Checked -FilePath $npmPath -Arguments @('run','test:db') -Label 'test:db'

  Write-Step 'Testes fiscais'
  Invoke-Checked -FilePath $npmPath -Arguments @('run','test:fiscal') -Label 'test:fiscal'

  Write-Step 'Testes de arquitetura'
  Invoke-Checked -FilePath $npmPath -Arguments @('run','test:architecture') -Label 'test:architecture'

  Write-Step 'Self-test Fase 1'
  Invoke-Checked -FilePath $npmPath -Arguments @('run','phase1:selftest') -Label 'phase1:selftest'

  Write-Step 'Self-test Fase 2 DB'
  Invoke-Checked -FilePath $npmPath -Arguments @('run','phase2:db-selftest') -Label 'phase2:db-selftest'

  Write-Step 'Suíte completa'
  Invoke-Checked -FilePath $npmPath -Arguments @('test') -Label 'npm test'

  if (-not $SkipBuild) {
    Write-Step 'Build NSIS local'

    if (Test-Path -LiteralPath $distPath) {
      Remove-Item -LiteralPath $distPath -Recurse -Force
    }

    Invoke-Checked -FilePath $npmPath -Arguments @('run','dist') -Label 'npm run dist'

    Write-Step 'Validação do release local'
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'validate-release.ps1') -DistPath 'dist'
    if ($LASTEXITCODE -ne 0) {
      throw "validate-release.ps1 falhou com exit code $LASTEXITCODE"
    }
  }
  else {
    Write-Output 'LOCAL_BUILD=SKIPPED'
  }

  $lockHashAfter = (Get-FileHash -LiteralPath $lockPath -Algorithm SHA256).Hash
  if ($lockHashAfter -ne $lockHashBefore) {
    throw 'package-lock.json foi alterado durante a pipeline local'
  }

  Write-Output 'PACKAGE_LOCK_UNCHANGED=True'
  Write-Output 'REMOTE_UPLOAD=False'
  Write-Output 'LOCAL_CI=OK'
}
finally {
  Pop-Location

  if (-not $KeepNodeModules -and -not $nodeModulesExistedBefore -and (Test-Path -LiteralPath $nodeModulesPath)) {
    Remove-Item -LiteralPath $nodeModulesPath -Recurse -Force -ErrorAction SilentlyContinue
  }
}
