@echo off
setlocal DisableDelayedExpansion
set "ORCA_CLAUDE_HOOK_IMPL=%~dp0claude-hook-impl.cmd"
if not exist "%ORCA_CLAUDE_HOOK_IMPL%" goto :missing_impl
"%ORCA_CLAUDE_HOOK_IMPL%"
:missing_impl
echo {}
if "%ORCA_AGENT_HOOK_PORT%"=="" exit /b 0
if "%ORCA_AGENT_HOOK_TOKEN%"=="" exit /b 0
if "%ORCA_PANE_KEY%"=="" exit /b 0
if not "%CLAUDE_JOB_DIR%"=="" exit /b 0
:orca_agent_hook_drain_stdin
"%SystemRoot%\System32\more.com" >nul 2>nul
exit /b 0
