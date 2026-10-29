# 원문 보기: user-claude/hooks/notify-stop.ps1

[[projects/moves-approval-harness-claude-codex-settings-2026-10-29|프로젝트 설정 기록]]

- 원본: `C:\Users\DMOVE\.claude\hooks\notify-stop.ps1`
- 보관 방식: `byte-identical`
- 보관본 SHA-256: `aea85af93d44c22ee3a516a4987185d42c8ea32e5f31c4b8017e79bf317b047d`

[스냅샷 파일](../user-claude/hooks/notify-stop.ps1)

`````powershell
# Claude Code Stop hook: 답변 완료 시 윈도우 토스트 알림 (세션 이름 포함)
$raw = [Console]::In.ReadToEnd()

$data = $null
try { $data = $raw | ConvertFrom-Json } catch {}

# 디버깅용: 마지막 페이로드 저장
try { $raw | Out-File -FilePath "$env:USERPROFILE\.claude\hooks\last-stop-payload.json" -Encoding utf8 } catch {}

$name = $null
if ($data) {
    foreach ($key in 'session_name', 'sessionName', 'title', 'session_title') {
        $prop = $data.PSObject.Properties[$key]
        if ($prop -and $prop.Value) { $name = [string]$prop.Value; break }
    }
    if (-not $name -and $data.cwd) { $name = Split-Path $data.cwd -Leaf }
    if (-not $name -and $data.session_id) {
        $id = [string]$data.session_id
        if ($id.Length -gt 8) { $id = $id.Substring(0, 8) }
        $name = $id
    }
}
if (-not $name) { $name = 'Claude Code' }

$safeName = [System.Security.SecurityElement]::Escape($name)

[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null

$toastXml = @"
<toast duration="short">
  <visual>
    <binding template="ToastGeneric">
      <text>Claude Code 답변 완료</text>
      <text>세션: $safeName</text>
    </binding>
  </visual>
</toast>
"@

$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml($toastXml)
$toast = New-Object Windows.UI.Notifications.ToastNotification($xml)
$appId = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show($toast)
`````
