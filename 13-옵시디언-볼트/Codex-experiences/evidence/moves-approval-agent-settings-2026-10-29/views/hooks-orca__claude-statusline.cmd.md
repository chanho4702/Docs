# 원문 보기: hooks-orca/claude-statusline.cmd

[[projects/moves-approval-harness-claude-codex-settings-2026-10-29|프로젝트 설정 기록]]

- 원본: `C:\Users\DMOVE\.orca\agent-hooks\claude-statusline.cmd`
- 보관 방식: `byte-identical`
- 보관본 SHA-256: `b3af78ef62390f8f6ae53e2954e2e038801c1fdd5c88f8d25315432b0f1e1b26`
- 참고: 실행하지 않은 정적 스냅샷. 환경 변수 이름은 보존, 실제 값은 수집하지 않음

[스냅샷 파일](../hooks-orca/claude-statusline.cmd)

`````bat
@echo off
setlocal
if not "%CLAUDE_JOB_DIR%"=="" exit /b 0
if "%ORCA_PANE_KEY%"=="" goto :orca_agent_hook_drain_stdin
set "ORCA_STATUSLINE_PANE_ID=%ORCA_PANE_KEY:~-36%"
set "ORCA_STATUSLINE_PANE_ID=%ORCA_STATUSLINE_PANE_ID::=_%"
set "ORCA_STATUSLINE_PAYLOAD_FILE=%TEMP%\orca-claude-statusline-%ORCA_STATUSLINE_PANE_ID%.tmp"
"%SystemRoot%\System32\more.com" >"%ORCA_STATUSLINE_PAYLOAD_FILE%" 2>nul
set "ORCA_STATUSLINE_STAMP_FILE=%TEMP%\orca-claude-statusline-last-%ORCA_STATUSLINE_PANE_ID%.tmp"
set "ORCA_STATUSLINE_NOW="
set "ORCA_STATUSLINE_TIME=%TIME: =0%"
for /f "tokens=1-3 delims=:.," %%a in ("%ORCA_STATUSLINE_TIME%") do set /a "ORCA_STATUSLINE_NOW=(1%%a %% 100)*3600+(1%%b %% 100)*60+(1%%c %% 100)" 2>nul
set "ORCA_STATUSLINE_LAST="
set "ORCA_STATUSLINE_ELAPSED="
if exist "%ORCA_STATUSLINE_STAMP_FILE%" set /p ORCA_STATUSLINE_LAST=<"%ORCA_STATUSLINE_STAMP_FILE%"
if defined ORCA_STATUSLINE_LAST for /f "delims=0123456789" %%d in ("%ORCA_STATUSLINE_LAST%") do set "ORCA_STATUSLINE_LAST="
if defined ORCA_STATUSLINE_NOW if defined ORCA_STATUSLINE_LAST set /a "ORCA_STATUSLINE_ELAPSED=ORCA_STATUSLINE_NOW-ORCA_STATUSLINE_LAST" 2>nul
if not defined ORCA_STATUSLINE_ELAPSED goto :orca_statusline_probe
if %ORCA_STATUSLINE_ELAPSED% GEQ 0 if %ORCA_STATUSLINE_ELAPSED% LSS 15 goto :orca_statusline_cleanup
:orca_statusline_probe
"%SystemRoot%\System32\findstr.exe" /c:\"rate_limits\" "%ORCA_STATUSLINE_PAYLOAD_FILE%" >nul 2>nul
if errorlevel 1 goto :orca_statusline_cleanup
if defined ORCA_AGENT_HOOK_ENDPOINT if exist "%ORCA_AGENT_HOOK_ENDPOINT%" call "%ORCA_AGENT_HOOK_ENDPOINT%" 2>nul
if "%ORCA_AGENT_HOOK_PORT%"=="" goto :orca_statusline_cleanup
if "%ORCA_AGENT_HOOK_TOKEN%"=="" goto :orca_statusline_cleanup
if defined ORCA_STATUSLINE_NOW (>"%ORCA_STATUSLINE_STAMP_FILE%" echo %ORCA_STATUSLINE_NOW%)
set "ORCA_STATUSLINE_CONFIG_DIR_FIELD=configDir="
if defined CLAUDE_CONFIG_DIR set "ORCA_STATUSLINE_CONFIG_DIR_FIELD=configDir=%CLAUDE_CONFIG_DIR%"
"%SystemRoot%\System32\curl.exe" -sS -X POST "http://127.0.0.1:%ORCA_AGENT_HOOK_PORT%/statusline/claude" --connect-timeout 0.5 --max-time 1.5 -H "Content-Type: application/x-www-form-urlencoded" -H "X-Orca-Agent-Hook-Token: %ORCA_AGENT_HOOK_TOKEN%" --data-urlencode "paneKey=%ORCA_PANE_KEY%" --data-urlencode "%ORCA_STATUSLINE_CONFIG_DIR_FIELD%" --data-urlencode "env=%ORCA_AGENT_HOOK_ENV%" --data-urlencode "version=%ORCA_AGENT_HOOK_VERSION%" --data-urlencode "payload@%ORCA_STATUSLINE_PAYLOAD_FILE%" >nul 2>&1
:orca_statusline_cleanup
del "%ORCA_STATUSLINE_PAYLOAD_FILE%" >nul 2>nul
exit /b 0
:orca_agent_hook_drain_stdin
"%SystemRoot%\System32\more.com" >nul 2>nul
exit /b 0
`````
