# 원문 보기: hooks-orca/claude-hook.cmd

[[projects/moves-approval-harness-claude-codex-settings-2026-10-29|프로젝트 설정 기록]]

- 원본: `C:\Users\DMOVE\.orca\agent-hooks\claude-hook.cmd`
- 보관 방식: `byte-identical`
- 보관본 SHA-256: `fbc787a241e7291597d7f5b5cd9f19fa9cf29d93f7185bc5ca325b99ff1ce9ea`
- 참고: 실행하지 않은 정적 스냅샷. 환경 변수 이름은 보존, 실제 값은 수집하지 않음

[스냅샷 파일](../hooks-orca/claude-hook.cmd)

`````bat
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
`````
