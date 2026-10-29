# 원문 보기: plugins/codex/openai-bundled/codex-app-tools/26.1023.50603/.mcp.json

[[projects/moves-approval-harness-claude-codex-settings-2026-10-29|프로젝트 설정 기록]]

- 원본: `C:\Users\DMOVE\.codex\plugins\cache\openai-bundled\codex-app-tools\26.1023.50603\.mcp.json`
- 보관 방식: `byte-identical`
- 보관본 SHA-256: `9d168d9dc0ec3aab32f263d9e86f9d0a1e83df9954ffacaa61a4739ae0a01c54`

[스냅샷 파일](../plugins/codex/openai-bundled/codex-app-tools/26.1023.50603/.mcp.json)

`````json
{
  "mcpServers": {
    "codex_app": {
      "command": "cmd.exe",
      "cwd": "C:/Users/DMOVE/.codex/plugins/cache/openai-bundled/codex-app-tools/26.1023.50603",
      "omit_tools_from": [
        "deferred"
      ],
      "args": [
        "/d",
        "/s",
        "/c",
        "call",
        "./scripts/launch_codex_app_tools_mcp.cmd",
        "./server.mjs"
      ],
      "enabled": false,
      "default_tools_approval_mode": "approve",
      "tools": {
        "automation_update": {
          "approval_mode": "prompt"
        },
        "create_thread": {
          "approval_mode": "prompt"
        },
        "send_message_to_thread": {
          "approval_mode": "prompt"
        },
        "fork_thread": {
          "approval_mode": "prompt"
        },
        "handoff_thread": {
          "approval_mode": "prompt"
        },
        "move_thread_to_project": {
          "approval_mode": "prompt"
        }
      },
      "env_vars": [
        "CODEX_APP_TOOLS_PIPE_PATH",
        "CODEX_MCP_NODE_PATH",
        "CODEX_BROWSER_USE_NODE_PATH",
        "CODEX_ELECTRON_RESOURCES_PATH",
        "CODEX_CLI_PATH",
        "XDG_CACHE_HOME",
        "HOME",
        "USERPROFILE",
        "LOCALAPPDATA",
        "PATH"
      ],
      "startup_timeout_sec": 10,
      "tool_timeout_sec": 3600,
      "env": {
        "CODEX_APP_TOOLS_DEFERRED": "0"
      }
    }
  }
}
`````
