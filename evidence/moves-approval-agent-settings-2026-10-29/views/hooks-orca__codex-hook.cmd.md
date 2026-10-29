# 원문 보기: hooks-orca/codex-hook.cmd

[[projects/moves-approval-harness-claude-codex-settings-2026-10-29|프로젝트 설정 기록]]

- 원본: `C:\Users\DMOVE\.orca\agent-hooks\codex-hook.cmd`
- 보관 방식: `byte-identical`
- 보관본 SHA-256: `bd458175c57c6ff52fdca11af680039ff7322773d70c5859343df4e941cdccb3`
- 참고: 실행하지 않은 정적 스냅샷. 환경 변수 이름은 보존, 실제 값은 수집하지 않음

[스냅샷 파일](../hooks-orca/codex-hook.cmd)

`````bat
@echo off
setlocal
if defined ORCA_AGENT_HOOK_ENDPOINT if exist "%ORCA_AGENT_HOOK_ENDPOINT%" call "%ORCA_AGENT_HOOK_ENDPOINT%" 2>nul
if "%ORCA_AGENT_HOOK_PORT%"=="" exit /b 0
if "%ORCA_AGENT_HOOK_TOKEN%"=="" exit /b 0
if "%ORCA_PANE_KEY%"=="" exit /b 0
"%SystemRoot%\System32\curl.exe" -sS -X POST "http://127.0.0.1:%ORCA_AGENT_HOOK_PORT%/hook/codex" --connect-timeout 0.5 --max-time 1.5 -H "Content-Type: application/x-www-form-urlencoded" -H "X-Orca-Agent-Hook-Token: %ORCA_AGENT_HOOK_TOKEN%" --data-urlencode "paneKey=%ORCA_PANE_KEY%" --data-urlencode "tabId=%ORCA_TAB_ID%" --data-urlencode "launchToken=%ORCA_AGENT_LAUNCH_TOKEN%" --data-urlencode "worktreeId=%ORCA_WORKTREE_ID%" --data-urlencode "env=%ORCA_AGENT_HOOK_ENV%" --data-urlencode "version=%ORCA_AGENT_HOOK_VERSION%" --data-urlencode "payload@-" >nul 2>&1
exit /b 0
:orca_agent_hook_drain_stdin
"%SystemRoot%\System32\more.com" >nul 2>nul
exit /b 0
`````
