[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory)]
    [string]$ProjectPath,

    [switch]$Force,
    [switch]$IncludeLocalSettings
)

$ErrorActionPreference = 'Stop'

$vaultRoot = Split-Path -Parent $PSScriptRoot
$sourceRoot = Join-Path $vaultRoot 'projects\moves-workforce-harness\2026-10-29'
$targetRoot = [System.IO.Path]::GetFullPath($ProjectPath)

if (-not (Test-Path -LiteralPath $sourceRoot -PathType Container)) {
    throw "하네스 원본을 찾을 수 없습니다: $sourceRoot"
}

if (-not (Test-Path -LiteralPath $targetRoot -PathType Container)) {
    throw "대상 프로젝트 폴더를 찾을 수 없습니다: $targetRoot"
}

$items = @(
    @{ Source = 'AGENTS.md'; Destination = 'AGENTS.md' },
    @{ Source = 'CLAUDE.md'; Destination = 'CLAUDE.md' },
    @{ Source = 'agents'; Destination = '.agents' },
    @{ Source = 'claude\agents'; Destination = '.claude\agents' },
    @{ Source = 'claude\skills'; Destination = '.claude\skills' },
    @{ Source = 'codex\agents'; Destination = '.codex\agents' }
)

if ($IncludeLocalSettings) {
    $items += @{ Source = 'claude\settings.local.json'; Destination = '.claude\settings.local.json' }
}

foreach ($item in $items) {
    $source = Join-Path $sourceRoot $item.Source
    $destination = Join-Path $targetRoot $item.Destination

    if ((Test-Path -LiteralPath $destination) -and -not $Force) {
        throw "대상에 이미 파일 또는 폴더가 있습니다: $destination (`-Force`로 덮어쓸 수 있습니다.)"
    }

    $parent = Split-Path -Parent $destination
    if ($PSCmdlet.ShouldProcess($destination, "하네스 설정 설치")) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
        Copy-Item -LiteralPath $source -Destination $destination -Recurse -Force:$Force
    }
}

$installedAgents = Join-Path $targetRoot 'AGENTS.md'
if (Test-Path -LiteralPath $installedAgents -PathType Leaf) {
    $agentsText = Get-Content -LiteralPath $installedAgents -Raw -Encoding UTF8
    $portableVaultPath = $vaultRoot.TrimEnd('\') + '\'
    $agentsText = $agentsText.Replace('C:\Users\DMOVE\Codex-experiences\', $portableVaultPath)
    Set-Content -LiteralPath $installedAgents -Value $agentsText -Encoding UTF8
}

Write-Output "Moves Workforce 하네스 설치 완료: $targetRoot"
if (-not $IncludeLocalSettings) {
    Write-Output '.claude/settings.local.json은 PC별 설정이므로 제외했습니다.'
}
