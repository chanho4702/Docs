# Autopilot runner for moves-approval-jira (Windows PowerShell 5.1 compatible).
#
# Drives the approval-harness one phase per iteration:
#   - Claude Code headless (claude -p) is the primary worker.
#   - Claude short-window limit (resets within WeeklyThresholdHours): sleep until reset, then resume Claude.
#   - Claude weekly limit (reset farther away, or message mentions "week"): run Codex until the reset time.
# State hand-off between workers is _workspace/PROGRESS.md only.
#
# Control:
#   stop   : create _workspace/autopilot/STOP (runner exits after the current iteration)
#   status : _workspace/autopilot/status.log, per-iteration output in _workspace/autopilot/logs/
#
# Strings are ASCII on purpose: PS 5.1 reads BOM-less UTF-8 as ANSI and breaks Korean literals.

param(
    [string]$Repo = '',
    [int]$IterationTimeoutMin = 180,
    [double]$WeeklyThresholdHours = 6,
    [int]$MaxIdleIterations = 3,
    [int]$MaxConsecutiveErrors = 5,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
if (-not $Repo) { $Repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path }

$ws        = Join-Path $Repo '_workspace'
$auto      = Join-Path $ws 'autopilot'
$logDir    = Join-Path $auto 'logs'
$lockFile  = Join-Path $auto 'runner.lock'
$stopFile  = Join-Path $auto 'STOP'
$progress  = Join-Path $ws 'PROGRESS.md'
$statusLog = Join-Path $auto 'status.log'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$ClaudeExe  = 'claude'
$ClaudeArgs = '-p "Read scripts/autopilot/claude-prompt.md and follow it exactly." --output-format json --dangerously-skip-permissions'
$CodexExe   = 'codex.cmd'
$CodexPrompt = 'Read scripts/autopilot/codex-prompt.md and follow it exactly.'

$LimitRegex = '(?i)(usage limit|rate limit|hit your .{0,20}limit|limit reached|limit will reset|out of (extra )?usage|too many requests|\b429\b)'

function Write-Log([string]$msg) {
    $line = '{0} {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
    Add-Content -Path $statusLog -Value $line -Encoding UTF8
    Write-Host $line
}

function Get-State {
    if (-not (Test-Path $progress)) { return 'MISSING' }
    $m = [regex]::Match((Get-Content $progress -Raw -Encoding UTF8), '\b(RUNNING|BLOCKED|DONE)\b')
    if ($m.Success) { return $m.Groups[1].Value }
    return 'UNKNOWN'
}

function Get-ProgressHash {
    if (-not (Test-Path $progress)) { return '' }
    return (Get-FileHash -Path $progress -Algorithm SHA256).Hash
}

# Returns a local DateTime or $null. Handles "...|<epoch>" and "resets [Oct 7,] 3pm / 15:00".
function Get-ResetTime([string]$text) {
    $now = Get-Date
    $m = [regex]::Match($text, '\|(\d{10})\b')
    if ($m.Success) {
        return ([DateTimeOffset]::FromUnixTimeSeconds([int64]$m.Groups[1].Value)).LocalDateTime
    }
    $rx = '(?i)(?:resets?|try again)\s+(?:at\s+|on\s+|after\s+)?(?:(?<mon>Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(?<day>\d{1,2}),?\s*(?:at\s+)?)?(?<h>\d{1,2})(?::(?<mi>\d{2}))?\s*(?<ap>am|pm)?'
    $m = [regex]::Match($text, $rx)
    if (-not $m.Success) { return $null }
    $h = [int]$m.Groups['h'].Value
    $mi = 0
    if ($m.Groups['mi'].Success) { $mi = [int]$m.Groups['mi'].Value }
    if ($m.Groups['ap'].Success) {
        $ap = $m.Groups['ap'].Value.ToLower()
        if ($ap -eq 'pm' -and $h -lt 12) { $h += 12 }
        if ($ap -eq 'am' -and $h -eq 12) { $h = 0 }
    }
    if ($h -gt 23 -or $mi -gt 59) { return $null }
    if ($m.Groups['mon'].Success) {
        $months = @('jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec')
        $mon = [array]::IndexOf($months, $m.Groups['mon'].Value.Substring(0,3).ToLower()) + 1
        $t = New-Object DateTime ($now.Year, $mon, [int]$m.Groups['day'].Value, $h, $mi, 0)
        if ($t -lt $now.AddDays(-1)) { $t = $t.AddYears(1) }
        return $t
    }
    $t = $now.Date.AddHours($h).AddMinutes($mi)
    if ($t -le $now) { $t = $t.AddDays(1) }
    return $t
}

function Wait-Until([datetime]$until, [string]$why) {
    Write-Log ("sleep until {0:yyyy-MM-dd HH:mm} ({1})" -f $until, $why)
    while ((Get-Date) -lt $until) {
        if (Test-Path $stopFile) { return }
        Start-Sleep -Seconds 60
    }
}

# Runs one iteration. Returns @{ Result = ok|limit|error|timeout; Text = ...; Reset = DateTime|null }
function Invoke-Worker([string]$kind) {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $out = Join-Path $logDir "$stamp-$kind.out.txt"
    $err = Join-Path $logDir "$stamp-$kind.err.txt"
    if ($kind -eq 'claude') {
        $exe = $ClaudeExe; $argLine = $ClaudeArgs
    } else {
        $last = Join-Path $logDir "$stamp-codex.last.txt"
        $exe = $CodexExe
        $argLine = 'exec -C "' + $Repo + '" -s workspace-write -c windows.sandbox=unelevated -c approval_policy=never --skip-git-repo-check -o "' + $last + '" "' + $CodexPrompt + '"'
    }
    if ($DryRun) {
        Write-Log "DRYRUN $exe $argLine"
        return @{ Result = 'ok'; Text = ''; Reset = $null }
    }
    Write-Log "start $kind"
    $p = Start-Process -FilePath $exe -ArgumentList $argLine -WorkingDirectory $Repo `
        -RedirectStandardOutput $out -RedirectStandardError $err -NoNewWindow -PassThru
    $null = $p.Handle   # cache the handle so ExitCode is available after exit
    if (-not $p.WaitForExit($IterationTimeoutMin * 60 * 1000)) {
        & taskkill.exe /PID $p.Id /T /F | Out-Null
        Write-Log "$kind timeout after $IterationTimeoutMin min"
        return @{ Result = 'timeout'; Text = ''; Reset = $null }
    }
    $code = $p.ExitCode
    $text = ''
    if (Test-Path $out) { $text += [string](Get-Content $out -Raw -Encoding UTF8) }
    if (Test-Path $err) { $text += "`n" + [string](Get-Content $err -Raw -Encoding UTF8) }

    $isError = ($code -ne 0)
    if ($kind -eq 'claude') {
        try {
            $j = Get-Content $out -Raw -Encoding UTF8 | ConvertFrom-Json
            if ($j.is_error) { $isError = $true }
        } catch { }
    }
    if (-not $isError) {
        Write-Log "$kind ok (exit $code)"
        return @{ Result = 'ok'; Text = $text; Reset = $null }
    }
    if ($text -match $LimitRegex) {
        $reset = Get-ResetTime $text
        Write-Log ("$kind limit hit (exit $code), reset=" + $(if ($reset) { $reset.ToString('yyyy-MM-dd HH:mm') } else { 'unknown' }))
        return @{ Result = 'limit'; Text = $text; Reset = $reset }
    }
    Write-Log "$kind error (exit $code), see $out / $err"
    return @{ Result = 'error'; Text = $text; Reset = $null }
}

# ---- single-instance lock ----
if (Test-Path $lockFile) {
    $old = (Get-Content $lockFile -Raw).Trim()
    if ($old -and (Get-Process -Id ([int]$old) -ErrorAction SilentlyContinue)) {
        Write-Host "runner already running (pid $old)"; exit 1
    }
}
Set-Content -Path $lockFile -Value $PID
if (Test-Path $stopFile) { Remove-Item $stopFile -Force }

$mode = 'claude'
$claudeBlockedUntil = $null
$limitedSince = $null
$idle = 0
$errors = 0
Write-Log "runner start (repo=$Repo, pid=$PID)"

try {
    :main while ($true) {
        if (Test-Path $stopFile) { Write-Log 'STOP file found, exiting'; break main }
        $state = Get-State
        if ($state -eq 'DONE' -or $state -eq 'BLOCKED') { Write-Log "PROGRESS state=$state, exiting"; break main }

        if ($mode -eq 'codex' -and $claudeBlockedUntil -and (Get-Date) -ge $claudeBlockedUntil) {
            Write-Log 'claude reset time reached, switching back to claude'
            $mode = 'claude'; $limitedSince = $null
        }

        $before = Get-ProgressHash
        $r = Invoke-Worker $mode

        switch ($r.Result) {
            'ok' {
                $errors = 0
                if ($mode -eq 'claude') { $limitedSince = $null }
                if ((Get-ProgressHash) -eq $before) {
                    $idle++
                    Write-Log "PROGRESS.md unchanged ($idle/$MaxIdleIterations)"
                    if ($idle -ge $MaxIdleIterations) { Write-Log 'no progress, exiting'; break main }
                } else { $idle = 0 }
                if ($DryRun) { break main }
            }
            'limit' {
                $errors = 0
                if ($mode -eq 'claude') {
                    $now = Get-Date
                    if ($r.Reset) {
                        $hours = ($r.Reset - $now).TotalHours
                        $weekly = ($r.Text -match '(?i)week') -or ($hours -gt $WeeklyThresholdHours)
                        if ($weekly) {
                            $claudeBlockedUntil = $r.Reset
                            $mode = 'codex'
                            Write-Log ("weekly limit: codex until {0:yyyy-MM-dd HH:mm}" -f $claudeBlockedUntil)
                        } else {
                            Wait-Until $r.Reset.AddMinutes(3) 'claude short-window limit'
                        }
                    } else {
                        if (-not $limitedSince) { $limitedSince = $now }
                        if (($now - $limitedSince).TotalHours -gt $WeeklyThresholdHours) {
                            $claudeBlockedUntil = $now.AddHours($WeeklyThresholdHours)
                            $mode = 'codex'
                            Write-Log 'limit persisted beyond threshold with unknown reset: treating as weekly'
                        } else {
                            Wait-Until $now.AddMinutes(30) 'claude limit, reset unknown'
                        }
                    }
                } else {
                    # Codex limited too: wait for whichever comes first.
                    $until = (Get-Date).AddHours(1)
                    if ($r.Reset -and $r.Reset -lt $until) { $until = $r.Reset }
                    if ($claudeBlockedUntil -and $claudeBlockedUntil -lt $until) { $until = $claudeBlockedUntil }
                    Wait-Until $until 'codex limit'
                }
            }
            default {
                $errors++
                if ($errors -ge $MaxConsecutiveErrors) { Write-Log "$errors consecutive errors, exiting"; break main }
                Wait-Until (Get-Date).AddMinutes(10) "after $($r.Result) ($errors/$MaxConsecutiveErrors)"
            }
        }
    }
} finally {
    Remove-Item $lockFile -Force -ErrorAction SilentlyContinue
    Write-Log 'runner stopped'
}
