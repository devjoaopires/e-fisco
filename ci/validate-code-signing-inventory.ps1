param(
  [string]$DistPath = 'dist',
  [string]$PolicyPath = 'ci\code-signing-policy.json'
)

$ErrorActionPreference = 'Stop'

function Assert-Condition {
  param([bool]$Condition,[string]$Message)
  if (-not $Condition) { throw $Message }
}

function Normalize-RelativePath {
  param([string]$Path)
  return ($Path -replace '\\', '/').TrimStart('/')
}

function Resolve-PolicyPath {
  param([object]$Entry,[string]$Version)
  if ($Entry.pathTemplate) {
    return Normalize-RelativePath (([string]$Entry.pathTemplate).Replace('${version}', $Version))
  }
  Assert-Condition (-not [string]::IsNullOrWhiteSpace([string]$Entry.path)) 'Entrada de policy sem path/pathTemplate'
  return Normalize-RelativePath ([string]$Entry.path)
}

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$packagePath = Join-Path $root 'package.json'
$policyFullPath = Join-Path $root $PolicyPath

Assert-Condition (Test-Path -LiteralPath $packagePath -PathType Leaf) "package.json ausente: $packagePath"
Assert-Condition (Test-Path -LiteralPath $policyFullPath -PathType Leaf) "Policy de code signing ausente: $policyFullPath"

$package = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json
$policy = Get-Content -LiteralPath $policyFullPath -Raw | ConvertFrom-Json
$version = [string]$package.version

Assert-Condition (-not [string]::IsNullOrWhiteSpace($version)) 'package.json sem version'
Assert-Condition ([int]$policy.schemaVersion -eq 1) 'schemaVersion de code-signing-policy.json inesperado'
Assert-Condition (@($policy.requiredSignedBinaries).Count -gt 0) 'Policy sem requiredSignedBinaries'

$requiredById = @{}
$declaredPaths = @{}

foreach ($entry in @($policy.requiredSignedBinaries)) {
  $id = [string]$entry.id
  Assert-Condition (-not [string]::IsNullOrWhiteSpace($id)) 'Binario obrigatorio sem id'
  Assert-Condition (-not $requiredById.ContainsKey($id)) "id duplicado na policy: $id"
  $relativePath = Resolve-PolicyPath $entry $version
  Assert-Condition (-not $declaredPaths.ContainsKey($relativePath)) "path duplicado na policy: $relativePath"
  $requiredById[$id] = [pscustomobject]@{ Entry = $entry; RelativePath = $relativePath }
  $declaredPaths[$relativePath] = "required:$id"
  $fullPath = Join-Path $root ($relativePath.Replace('/', '\'))
  Assert-Condition (Test-Path -LiteralPath $fullPath -PathType Leaf) "Binario obrigatorio ausente: $relativePath"
}

foreach ($entry in @($policy.thirdPartyBinaries)) {
  $relativePath = Normalize-RelativePath ([string]$entry.path)
  Assert-Condition (-not [string]::IsNullOrWhiteSpace($relativePath)) 'Binario de terceiro sem path'
  Assert-Condition (-not $declaredPaths.ContainsKey($relativePath)) "path duplicado na policy: $relativePath"
  $declaredPaths[$relativePath] = 'third-party'
  $fullPath = Join-Path $root ($relativePath.Replace('/', '\'))
  Assert-Condition (Test-Path -LiteralPath $fullPath -PathType Leaf) "Binario de terceiro declarado mas ausente: $relativePath"
}

$distFullPath = Join-Path $root $DistPath
Assert-Condition (Test-Path -LiteralPath $distFullPath -PathType Container) "Diretorio de build ausente: $distFullPath"

$discoveredDistBinaries = @(
  Get-ChildItem -LiteralPath $distFullPath -Recurse -File -ErrorAction Stop |
    Where-Object { $_.Extension -in '.exe', '.dll' } |
    ForEach-Object {
      Normalize-RelativePath ($_.FullName.Substring($root.Path.Length).TrimStart([char]'\'))
    } |
    Sort-Object -Unique
)

$declaredDistBinaries = @(
  $declaredPaths.Keys | Where-Object { $_ -like 'dist/*' } | Sort-Object -Unique
)

$unclassified = @($discoveredDistBinaries | Where-Object { -not $declaredPaths.ContainsKey($_) })
$declaredDistMissing = @($declaredDistBinaries | Where-Object { $_ -notin $discoveredDistBinaries })

Assert-Condition ($unclassified.Count -eq 0) ("Binarios distribuidos sem classificacao: " + ($unclassified -join ', '))
Assert-Condition ($declaredDistMissing.Count -eq 0) ("Binarios declarados na policy ausentes do dist: " + ($declaredDistMissing -join ', '))

foreach ($item in $requiredById.GetEnumerator()) {
  $entry = $item.Value.Entry
  if (-not [string]::IsNullOrWhiteSpace([string]$entry.sameContentAs)) {
    $sourceId = [string]$entry.sameContentAs
    Assert-Condition ($requiredById.ContainsKey($sourceId)) "sameContentAs referencia id inexistente: $sourceId"
    $leftRelative = $item.Value.RelativePath
    $rightRelative = $requiredById[$sourceId].RelativePath
    $left = Join-Path $root ($leftRelative.Replace('/', '\'))
    $right = Join-Path $root ($rightRelative.Replace('/', '\'))
    $leftHash = (Get-FileHash -LiteralPath $left -Algorithm SHA256).Hash
    $rightHash = (Get-FileHash -LiteralPath $right -Algorithm SHA256).Hash
    Assert-Condition ($leftHash -eq $rightHash) "Conteudo divergente entre $leftRelative e $rightRelative"
  }
}

Write-Output "CODE_SIGNING_POLICY=$PolicyPath"
Write-Output "CODE_SIGNING_REQUIRED_COUNT=$(@($policy.requiredSignedBinaries).Count)"
Write-Output "CODE_SIGNING_THIRD_PARTY_COUNT=$(@($policy.thirdPartyBinaries).Count)"
Write-Output "CODE_SIGNING_DIST_BINARY_COUNT=$($discoveredDistBinaries.Count)"
Write-Output 'CODE_SIGNING_INVENTORY=OK'
