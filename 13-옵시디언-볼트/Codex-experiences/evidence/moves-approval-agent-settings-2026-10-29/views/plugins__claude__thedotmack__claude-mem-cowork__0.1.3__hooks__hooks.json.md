# 원문 보기: plugins/claude/thedotmack/claude-mem-cowork/0.1.3/hooks/hooks.json

[[projects/moves-approval-harness-claude-codex-settings-2026-10-29|프로젝트 설정 기록]]

- 원본: `C:\Users\DMOVE\.claude\plugins\cache\thedotmack\claude-mem-cowork\0.1.3\hooks\hooks.json`
- 보관 방식: `byte-identical`
- 보관본 SHA-256: `74fc090594df5f6be4e5f6e863e2f6aa877e6f5c571c345f141e1353c61614be`

[스냅샷 파일](../plugins/claude/thedotmack/claude-mem-cowork/0.1.3/hooks/hooks.json)

`````json
{
  "description": "Claude-Mem Cowork hooks — thin HTTP shims to cmem.ai (Pro runs the worker/observer server-side)",
  "hooks": {
    "SessionStart": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/cmem-hook.mjs\" context",
            "timeout": 20
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/cmem-hook.mjs\" session-init",
            "timeout": 8
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
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/cmem-hook.mjs\" observation",
            "timeout": 30,
            "async": true
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Task|Agent",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/cmem-hook.mjs\" agent-context",
            "timeout": 15
          }
        ]
      }
    ],
    "SubagentStop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/cmem-hook.mjs\" subagent-stop",
            "timeout": 30,
            "async": true
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/cmem-hook.mjs\" summarize",
            "timeout": 30,
            "async": true
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/cmem-hook.mjs\" session-end",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
`````
