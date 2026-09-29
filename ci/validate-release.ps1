param(
  [string]$DistPath = 'dist'
)

$ErrorActionPreference = 'Stop'

function Assert-Condition {
  param(
    [bool]$Condition,
    [string]$Message
  )

  if (-not $Condition) {
    throw $Message
  }
}

function Assert-File {
  param(
    [string]$Path,
    [long]$MinimumBytes = 1
  )

  Assert-Condition (Test-Path -LiteralPath $Path -PathType Leaf) "Arquivo ausente: $Path"

  $item = Get-Item -LiteralPath $Path
  Assert-Condition ($item.Length -ge $MinimumBytes) "Arquivo vazio ou pequeno demais: $Path"

  return $item
}

function Get-Sha512Base64 {
  param(
    [string]$Path
  )

  $stream = [System.IO.File]::OpenRead($Path)
  try {
    $sha512 = [System.Security.Cryptography.SHA512]::Create()
    try {
      $hash = $sha512.ComputeHash($stream)
      return [Convert]::ToBase64String($hash)
    }
    finally {
      $sha512.Dispose()
    }
  }
  finally {
    $stream.Dispose()
  }
}

function Get-YamlScalar {
  param(
    [string]$Text,
    [string]$Key
  )

  $pattern = '(?m)^' + [regex]::Escape($Key) + ':\s*[''"]?([^\r\n''"]+)[''"]?\s*$'
  $match = [regex]::Match($Text, $pattern)

  Assert-Condition $match.Success "Campo ausente em latest.yml: $Key"

  return $match.Groups[1].Value.Trim()
}

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$packagePath = Join-Path $root 'package.json'
$package = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json

$version = [string]$package.version
Assert-Condition (-not [string]::IsNullOrWhiteSpace($version)) 'package.json sem version'

$secretBoundaryValidator = Join-Path $root 'ci\validate-code-signing-secret-boundary.ps1'
Assert-Condition (Test-Path -LiteralPath $secretBoundaryValidator -PathType Leaf) "Validador de fronteira de secrets ausente: $secretBoundaryValidator"
& $secretBoundaryValidator

Assert-Condition ([string]$package.build.directories.output -eq 'dist') 'build.directories.output deve ser dist'
Assert-Condition ([bool]$package.build.asar) 'build.asar deve permanecer habilitado'
Assert-Condition ([string]$package.build.win.artifactName -eq 'e-fisco-Setup-${version}.${ext}') 'artifactName inesperado'
Assert-Condition ([string]$package.build.win.target[0].target -eq 'nsis') 'target Windows deve ser nsis'
Assert-Condition (@($package.build.win.target[0].arch) -contains 'x64') 'target Windows deve incluir x64'
Assert-Condition ([string]$package.scripts.dist -match '--publish\s+never') 'script dist deve impedir publish'

$dist = Join-Path $root $DistPath
Assert-Condition (Test-Path -LiteralPath $dist -PathType Container) "Diretório de build ausente: $dist"

$artifactName = "e-fisco-Setup-$version.exe"
$installerPath = Join-Path $dist $artifactName
$blockmapPath = "$installerPath.blockmap"
$latestPath = Join-Path $dist 'latest.yml'
$unpackedExePath = Join-Path $dist 'win-unpacked\e-fisco.exe'
$appAsarPath = Join-Path $dist 'win-unpacked\resources\app.asar'
$appUpdatePath = Join-Path $dist 'win-unpacked\resources\app-update.yml'

$installer = Assert-File $installerPath 1048576
$null = Assert-File $blockmapPath 1
$null = Assert-File $latestPath 1
$null = Assert-File $unpackedExePath 1048576
$null = Assert-File $appAsarPath 1
$null = Assert-File $appUpdatePath 1

foreach ($relative in @($package.build.asarUnpack)) {
  $unpackedPath = Join-Path $dist ('win-unpacked\resources\app.asar.unpacked\' + [string]$relative)
  $null = Assert-File $unpackedPath 1
}

$latestText = Get-Content -LiteralPath $latestPath -Raw
$latestVersion = Get-YamlScalar $latestText 'version'
$latestArtifact = Get-YamlScalar $latestText 'path'

Assert-Condition ($latestVersion -eq $version) "latest.yml version divergente: $latestVersion != $version"
Assert-Condition ($latestArtifact -eq $artifactName) "latest.yml path divergente: $latestArtifact != $artifactName"

$urlMatch = [regex]::Match($latestText, '(?m)^\s*-\s+url:\s*([^\r\n]+)\s*$')
Assert-Condition $urlMatch.Success 'latest.yml sem files.url'
Assert-Condition ($urlMatch.Groups[1].Value.Trim() -eq $artifactName) 'latest.yml files.url divergente'

$sizeMatch = [regex]::Match($latestText, '(?m)^\s+size:\s*(\d+)\s*$')
Assert-Condition $sizeMatch.Success 'latest.yml sem files.size'
$latestSize = [long]$sizeMatch.Groups[1].Value
Assert-Condition ($latestSize -eq $installer.Length) "latest.yml size divergente: $latestSize != $($installer.Length)"

$shaMatches = [regex]::Matches($latestText, '(?m)^\s*sha512:\s*([^\r\n]+)\s*$')
Assert-Condition ($shaMatches.Count -ge 1) 'latest.yml sem sha512'

$actualSha512 = Get-Sha512Base64 $installerPath
foreach ($match in $shaMatches) {
  Assert-Condition ($match.Groups[1].Value.Trim() -eq $actualSha512) 'latest.yml sha512 divergente do instalador'
}

$inventoryValidator = Join-Path $root 'ci\validate-code-signing-inventory.ps1'
Assert-Condition (Test-Path -LiteralPath $inventoryValidator -PathType Leaf) "Validador de inventario de code signing ausente: $inventoryValidator"
& $inventoryValidator -DistPath $DistPath

Write-Output "RELEASE_VERSION=$version"
Write-Output "RELEASE_INSTALLER=$artifactName"
Write-Output "RELEASE_INSTALLER_BYTES=$($installer.Length)"
Write-Output "RELEASE_SHA512=$actualSha512"
Write-Output "RELEASE_ASAR_UNPACK_COUNT=$(@($package.build.asarUnpack).Count)"
Write-Output 'RELEASE_VALIDATION=OK'
