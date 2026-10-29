# 원문 보기: user-codex/hooks.json

[[projects/moves-approval-harness-claude-codex-settings-2026-10-29|프로젝트 설정 기록]]

- 원본: `C:\Users\DMOVE\.codex\hooks.json`
- 보관 방식: `byte-identical`
- 보관본 SHA-256: `2d6eedae310f1955cc42cf98f2140d51d9ff4c813e522b75bc25c8e674852ea4`

[스냅샷 파일](../user-codex/hooks.json)

`````json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "if [ -f 'C:/Users/DMOVE/.orca/agent-hooks/claude-hook.cmd' ]; then 'C:/Users/DMOVE/.orca/agent-hooks/claude-hook.cmd'; else cat >/dev/null 2>&1 || :; fi",
            "timeout": 10
          }
        ]
      },
      {
        "hooks": [
          {
            "type": "command",
            "command": "C:/Users/DMOVE/.orca/agent-hooks/codex-hook.cmd",
            "timeout": 10
          }
        ]
      }
    ],
    "PermissionRequest": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "if [ -f 'C:/Users/DMOVE/.orca/agent-hooks/claude-hook.cmd' ]; then 'C:/Users/DMOVE/.orca/agent-hooks/claude-hook.cmd'; else cat >/dev/null 2>&1 || :; fi",
            "timeout": 10
          }
        ]
      },
      {
        "hooks": [
          {
            "type": "command",
            "command": "C:/Users/DMOVE/.orca/agent-hooks/codex-hook.cmd",
            "timeout": 10
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "if [ -f 'C:/Users/DMOVE/.orca/agent-hooks/claude-hook.cmd' ]; then 'C:/Users/DMOVE/.orca/agent-hooks/claude-hook.cmd'; else cat >/dev/null 2>&1 || :; fi",
            "timeout": 10
          }
        ]
      },
      {
        "hooks": [
          {
            "type": "command",
            "command": "C:/Users/DMOVE/.orca/agent-hooks/codex-hook.cmd",
            "timeout": 10
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "if [ -f 'C:/Users/DMOVE/.orca/agent-hooks/claude-hook.cmd' ]; then 'C:/Users/DMOVE/.orca/agent-hooks/claude-hook.cmd'; else cat >/dev/null 2>&1 || :; fi",
            "timeout": 10
          }
        ]
      },
      {
        "hooks": [
          {
            "type": "command",
            "command": "C:/Users/DMOVE/.orca/agent-hooks/codex-hook.cmd",
            "timeout": 10
          }
        ]
      }
    ],
    "SubagentStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "if [ -f 'C:/Users/DMOVE/.orca/agent-hooks/claude-hook.cmd' ]; then 'C:/Users/DMOVE/.orca/agent-hooks/claude-hook.cmd'; else cat >/dev/null 2>&1 || :; fi",
            "timeout": 10
          }
        ]
      },
      {
        "hooks": [
          {
            "type": "command",
            "command": "C:/Users/DMOVE/.orca/agent-hooks/codex-hook.cmd",
            "timeout": 10
          }
        ]
      }
    ],
    "SubagentStop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "if [ -f 'C:/Users/DMOVE/.orca/agent-hooks/claude-hook.cmd' ]; then 'C:/Users/DMOVE/.orca/agent-hooks/claude-hook.cmd'; else cat >/dev/null 2>&1 || :; fi",
            "timeout": 10
          }
        ]
      },
      {
        "hooks": [
          {
            "type": "command",
            "command": "C:/Users/DMOVE/.orca/agent-hooks/codex-hook.cmd",
            "timeout": 10
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "if [ -f 'C:/Users/DMOVE/.orca/agent-hooks/claude-hook.cmd' ]; then 'C:/Users/DMOVE/.orca/agent-hooks/claude-hook.cmd'; else cat >/dev/null 2>&1 || :; fi",
            "timeout": 10
          }
        ]
      },
      {
        "hooks": [
          {
            "type": "command",
            "command": "C:/Users/DMOVE/.orca/agent-hooks/codex-hook.cmd",
            "timeout": 10
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "C:/Users/DMOVE/.orca/agent-hooks/codex-hook.cmd",
            "timeout": 10
          }
        ]
      }
    ],
    "Interrupt": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "C:/Users/DMOVE/.orca/agent-hooks/codex-hook.cmd",
            "timeout": 3
          }
        ]
      }
    ]
  }
}
`````
