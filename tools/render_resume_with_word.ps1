param(
    [Parameter(Mandatory = $true)]
    [string]$InputDocx,

    [Parameter(Mandatory = $true)]
    [string]$OutputPdf
)

$resolvedInput = (Resolve-Path -LiteralPath $InputDocx).Path
$resolvedOutput = [System.IO.Path]::GetFullPath($OutputPdf)
$outputDir = [System.IO.Path]::GetDirectoryName($resolvedOutput)
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null

$word = $null
$document = $null
try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0
    $document = $word.Documents.Open($resolvedInput, $false, $true)
    $document.ExportAsFixedFormat($resolvedOutput, 17)
}
finally {
    if ($null -ne $document) {
        $document.Close(0)
    }
    if ($null -ne $word) {
        $word.Quit()
    }
}

Write-Output $resolvedOutput
