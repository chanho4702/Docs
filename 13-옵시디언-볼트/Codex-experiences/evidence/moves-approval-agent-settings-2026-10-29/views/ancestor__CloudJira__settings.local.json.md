# 원문 보기: ancestor/CloudJira/settings.local.json

[[projects/moves-approval-harness-claude-codex-settings-2026-10-29|프로젝트 설정 기록]]

- 원본: `C:\CloudJira\.claude\settings.local.json`
- 보관 방식: `byte-identical`
- 보관본 SHA-256: `9729c283e758a3c9373d698fec2d647ba3cb8d1dafe148b2ca352e0926081418`
- 참고: 상위 폴더에서 발견; 이 프로젝트에서 실제 로드되는지는 미검증

[스냅샷 파일](../ancestor/CloudJira/settings.local.json)

`````json
{
  "permissions": {
    "allow": [
      "PowerShell(foreach \\($p in @\\('moves-workforce\\\\static\\\\ui', 'contents-user-management-jira\\\\static\\\\scheduler'\\)\\) { $pkg = Get-Content \"C:\\\\CloudJira\\\\$p\\\\package.json\" -Raw | ConvertFrom-Json; Write-Output \"=== $p ===\"; Write-Output \"react: $\\($pkg.dependencies.react\\) / react-dom: $\\($pkg.dependencies.'react-dom'\\) / avatar: $\\($pkg.dependencies.'@atlaskit/avatar'\\)\"; $lock = \"C:\\\\CloudJira\\\\$p\\\\package-lock.json\"; if \\(Test-Path $lock\\) { $l = Get-Content $lock -Raw | ConvertFrom-Json; Write-Output \"lock react: $\\($l.packages.'node_modules/react'.version\\) / lock react-dom: $\\($l.packages.'node_modules/react-dom'.version\\)\" } else { Write-Output \"no lockfile\" } })"
    ]
  }
}
`````
