# 원문 보기: user-claude/settings.local.json

[[projects/moves-approval-harness-claude-codex-settings-2026-10-29|프로젝트 설정 기록]]

- 원본: `C:\Users\DMOVE\.claude\settings.local.json`
- 보관 방식: `byte-identical`
- 보관본 SHA-256: `994eaf9f8cb7b566efdeb73c8190872dab02b5032f85a8b3e1233381139fa602`

[스냅샷 파일](../user-claude/settings.local.json)

`````json
{
  "permissions": {
    "allow": [
      "Bash(ls -la .claude-plugin/)",
      "Bash(cat .claude-plugin/marketplace.json)",
      "Bash(ls -la skills/)",
      "Bash(cp *)",
      "Read(//c/CloudJira/moves-workforce/.claude/**)",
      "Read(//c/CloudJira/moves-workforce/.claude/skills/**)",
      "Read(//c/CloudJira/moves-workforce/.claude/agents/**)",
      "Read(//c/CloudJira/moves-workforce/**)",
      "Read(//c/CloudJira/moves-workforce/_workspace/**)",
      "Bash(mkdir -p progress-page)",
      "Bash(mv 00_input 01_architect_design.md 02_backend_report.md 02_frontend_report.md 03_verify_report.md progress-page/)",
      "Bash(grep -v \":0$\")",
      "Bash(node -e \"JSON.parse\\(require\\('fs'\\).readFileSync\\('/c/CloudJira/moves-workforce/.claude/settings.local.json'\\)\\); console.log\\('valid JSON'\\)\")",
      "PowerShell(try { Get-Content 'C:\\\\CloudJira\\\\moves-workforce\\\\.claude\\\\settings.local.json' -Raw | ConvertFrom-Json | Out-Null; \"settings.local.json: valid JSON\" } catch { \"INVALID: $_\" })",
      "Bash(git -C /c/Users/DMOVE/claude-experiences status)",
      "Bash(npm run *)",
      "Bash(npm test *)",
      "Read(//c/c/Users/DMOVE/**)",
      "Read(//c/c/Users/DMOVE/claude-experiences/**)",
      "Read(//c/solutions/**)",
      "Bash(ls -la .claude)",
      "Bash(ls CLAUDE.md)",
      "Read(//c/c/solutions/moveseyee_fe/src/services/**)",
      "Read(//c/c/solutions/moveseyee_fe/src/hooks/**)",
      "Bash(npm view *)",
      "Bash(claude update *)",
      "Bash(echo \"---exit:$?---\")",
      "WebSearch",
      "WebFetch(domain:github.com)",
      "PowerShell($c = Get-Command claude -ErrorAction SilentlyContinue; if \\($c\\) { $c.Source; claude --version } else { \"claude CLI not found in PATH\" })",
      "PowerShell(forge *)",
      "PowerShell($paths = @\\(\"$env:ProgramFiles\\\\nodejs\\\\node.exe\", \"${env:ProgramFiles\\(x86\\)}\\\\nodejs\\\\node.exe\", \"$env:LOCALAPPDATA\\\\Programs\\\\nodejs\\\\node.exe\", \"$env:APPDATA\\\\npm\\\\node.exe\"\\); foreach \\($p in $paths\\) { if \\(Test-Path $p\\) { Write-Output \"FOUND: $p\" } }; Write-Output \"--- nvm ---\"; if \\(Test-Path \"$env:APPDATA\\\\nvm\"\\) { Get-ChildItem \"$env:APPDATA\\\\nvm\" -Directory -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name }; Write-Output \"--- where ---\"; try { \\(Get-Command node -ErrorAction Stop\\).Source } catch { \"node not in PATH\" })",
      "PowerShell(Write-Output \"--- volta/fnm ---\"; foreach \\($d in @\\(\"$env:LOCALAPPDATA\\\\Volta\\\\bin\\\\node.exe\", \"$env:LOCALAPPDATA\\\\fnm_multishells\", \"$env:USERPROFILE\\\\scoop\\\\apps\\\\nodejs\"\\)\\) { if \\(Test-Path $d\\) { Write-Output \"FOUND: $d\" } }; Write-Output \"--- winget list node ---\"; try { winget list --name Node -ErrorAction Stop } catch { \"winget query failed\" })",
      "PowerShell(winget list *)",
      "PowerShell(Write-Output \"--- 현재 세션 PATH에 nvm4w 있나? ---\"; if \\($env:Path -like '*nvm4w*'\\) { \"있음\" } else { \"없음 \\(← 이게 원인\\)\" }; Write-Output \"--- node.exe 직접 실행 ---\"; & \"C:\\\\nvm4w\\\\nodejs\\\\node.exe\" -v)",
      "WebFetch(domain:developer.atlassian.com)",
      "Bash(node -e \"console.log\\(require\\('./node_modules/@forge/api/package.json'\\).version\\)\")",
      "PowerShell(claude mcp *)",
      "mcp__claude_ai_Atlassian_Rovo__getConfluencePage",
      "mcp__claude_ai_Atlassian_Rovo__getAccessibleAtlassianResources",
      "mcp__claude_ai_Atlassian_Rovo__fetch",
      "Skill(claude-in-chrome)",
      "Skill(update-config)",
      "Bash(powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:/Users/DMOVE/.claude/hooks/notify-stop.ps1')",
      "Bash(echo \"exit=$?\")",
      "PowerShell($s = Get-Content \"$env:USERPROFILE\\\\.claude\\\\settings.json\" -Raw | ConvertFrom-Json; $s.hooks.Stop[0].hooks[0].command)",
      "WebFetch(domain:openfreemap.org)",
      "PowerShell(powercfg *)",
      "WebFetch(domain:community.developer.atlassian.com)",
      "Bash(npx *)",
      "Bash(npm i *)",
      "Bash(codex --version)",
      "Bash(npm ls *)",
      "Bash(where codex *)",
      "Bash(npm prefix *)"
    ]
  }
}
`````
