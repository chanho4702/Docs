# 원문 보기: user-claude/settings.json

[[projects/moves-approval-harness-claude-codex-settings-2026-10-29|프로젝트 설정 기록]]

- 원본: `C:\Users\DMOVE\.claude\settings.json`
- 보관 방식: `byte-identical`
- 보관본 SHA-256: `ffac42fc2dd3ceab6660ef933a1f8ffdfe97435d04509de173202fff8f52aceb`

[스냅샷 파일](../user-claude/settings.json)

`````json
{
  "model": "fable",
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "powershell.exe -NoProfile -ExecutionPolicy Bypass -File \"C:/Users/DMOVE/.claude/hooks/notify-stop.ps1\"",
            "timeout": 20,
            "statusMessage": "완료 알림 전송 중...",
            "async": true
          }
        ]
      },
      {
        "hooks": [
          {
            "type": "command",
            "command": "C:/Users/DMOVE/.orca/agent-hooks/claude-hook.cmd",
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
            "command": "C:/Users/DMOVE/.orca/agent-hooks/claude-hook.cmd",
            "timeout": 10
          }
        ]
      }
    ],
    "StopFailure": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "C:/Users/DMOVE/.orca/agent-hooks/claude-hook.cmd",
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
            "command": "C:/Users/DMOVE/.orca/agent-hooks/claude-hook.cmd",
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
            "command": "C:/Users/DMOVE/.orca/agent-hooks/claude-hook.cmd",
            "timeout": 10
          }
        ]
      }
    ],
    "TeammateIdle": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "C:/Users/DMOVE/.orca/agent-hooks/claude-hook.cmd",
            "timeout": 10
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "C:/Users/DMOVE/.orca/agent-hooks/claude-hook.cmd",
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
            "command": "C:/Users/DMOVE/.orca/agent-hooks/claude-hook.cmd",
            "timeout": 10
          }
        ]
      }
    ],
    "PostToolUseFailure": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "C:/Users/DMOVE/.orca/agent-hooks/claude-hook.cmd",
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
            "command": "C:/Users/DMOVE/.orca/agent-hooks/claude-hook.cmd",
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
            "command": "C:/Users/DMOVE/.orca/agent-hooks/claude-hook.cmd",
            "timeout": 10
          }
        ]
      }
    ],
    "PostCompact": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "C:/Users/DMOVE/.orca/agent-hooks/claude-hook.cmd",
            "timeout": 10
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "C:/Users/DMOVE/.orca/agent-hooks/claude-hook.cmd",
            "timeout": 10
          }
        ]
      }
    ]
  },
  "statusLine": {
    "type": "command",
    "command": "if [ -z \"${HOME-}\" ]; then case \"${OSTYPE-}\" in msys*|cygwin*|win32*) if [ -z \"${ORCA_AGENT_HOOK_PORT-}\" ] || [ -z \"${ORCA_AGENT_HOOK_TOKEN-}\" ] || [ -z \"${ORCA_PANE_KEY-}\" ]; then exit 0; fi; { command -p cat 2>/dev/null || cat; } >/dev/null 2>&1 || : ;; *) { command -p cat 2>/dev/null || cat; } >/dev/null 2>&1 || : ;; esac; else case \"${OSTYPE-}\" in msys*|cygwin*|win32*) if [ -f \"${HOME-}/.orca/agent-hooks/claude-statusline.cmd\" ]; then case \"${HOME-}\" in *\\&*|*\\^*|*\\(*|*\\)*|*\\;*|*,*|*=*|*%*|*\\!*) if [ -f \"${SYSTEMROOT-}/System32/WindowsPowerShell/v1.0/powershell.exe\" ]; then \"${SYSTEMROOT-}/System32/WindowsPowerShell/v1.0/powershell.exe\" -NoProfile -EncodedCommand JABQAHIAbwBnAHIAZQBzAHMAUAByAGUAZgBlAHIAZQBuAGMAZQA9ACcAUwBpAGwAZQBuAHQAbAB5AEMAbwBuAHQAaQBuAHUAZQAnADsAIAB0AHIAeQAgAHsAIABTAGUAdAAtAEUAeABlAGMAdQB0AGkAbwBuAFAAbwBsAGkAYwB5ACAALQBTAGMAbwBwAGUAIABQAHIAbwBjAGUAcwBzACAALQBFAHgAZQBjAHUAdABpAG8AbgBQAG8AbABpAGMAeQAgAEIAeQBwAGEAcwBzACAALQBGAG8AcgBjAGUAIAAtAEUAcgByAG8AcgBBAGMAdABpAG8AbgAgAFMAaQBsAGUAbgB0AGwAeQBDAG8AbgB0AGkAbgB1AGUAIAB9ACAAYwBhAHQAYwBoACAAewB9ADsAIAAkAGgAbwBtAGUAUABhAHQAaAAgAD0AIAAkAGUAbgB2ADoASABPAE0ARQAgAC0AcgBlAHAAbABhAGMAZQAgACcAXgAvACgAWwBBAC0AWgBhAC0AegBdACkALwAnACwAIAAnACQAMQA6AC8AJwA7ACAAJABzAGMAcgBpAHAAdABQAGEAdABoACAAPQAgAEoAbwBpAG4ALQBQAGEAdABoACAAJABoAG8AbQBlAFAAYQB0AGgAIAAnAC4AbwByAGMAYQBcAGEAZwBlAG4AdAAtAGgAbwBvAGsAcwBcAGMAbABhAHUAZABlAC0AcwB0AGEAdAB1AHMAbABpAG4AZQAuAGMAbQBkACcAOwAgAGkAZgAgACgAVABlAHMAdAAtAFAAYQB0AGgAIAAtAEwAaQB0AGUAcgBhAGwAUABhAHQAaAAgACQAcwBjAHIAaQBwAHQAUABhAHQAaAAgAC0AUABhAHQAaABUAHkAcABlACAATABlAGEAZgApACAAewAgACYAIAAkAHMAYwByAGkAcAB0AFAAYQB0AGgAOwAgAGUAeABpAHQAIAAkAEwAQQBTAFQARQBYAEkAVABDAE8ARABFACAAfQA7ACAAaQBmACAAKAAtAG4AbwB0ACAAJABlAG4AdgA6AE8AUgBDAEEAXwBBAEcARQBOAFQAXwBIAE8ATwBLAF8AUABPAFIAVAAgAC0AbwByACAALQBuAG8AdAAgACQAZQBuAHYAOgBPAFIAQwBBAF8AQQBHAEUATgBUAF8ASABPAE8ASwBfAFQATwBLAEUATgAgAC0AbwByACAALQBuAG8AdAAgACQAZQBuAHYAOgBPAFIAQwBBAF8AUABBAE4ARQBfAEsARQBZACkAIAB7ACAAZQB4AGkAdAAgADAAIAB9ADsAIABbAEMAbwBuAHMAbwBsAGUAXQA6ADoASQBuAC4AUgBlAGEAZABUAG8ARQBuAGQAKAApACAAfAAgAE8AdQB0AC0ATgB1AGwAbAA7ACAAZQB4AGkAdAAgADAA; else if [ -z \"${ORCA_AGENT_HOOK_PORT-}\" ] || [ -z \"${ORCA_AGENT_HOOK_TOKEN-}\" ] || [ -z \"${ORCA_PANE_KEY-}\" ]; then exit 0; fi; { command -p cat 2>/dev/null || cat; } >/dev/null 2>&1 || :; fi ;; *) \"${HOME-}/.orca/agent-hooks/claude-statusline.cmd\" ;; esac; else if [ -z \"${ORCA_AGENT_HOOK_PORT-}\" ] || [ -z \"${ORCA_AGENT_HOOK_TOKEN-}\" ] || [ -z \"${ORCA_PANE_KEY-}\" ]; then exit 0; fi; { command -p cat 2>/dev/null || cat; } >/dev/null 2>&1 || :; fi ;; *) if [ -f \"${HOME-}/.orca/agent-hooks/claude-statusline.sh\" ] && [ -r \"${HOME-}/.orca/agent-hooks/claude-statusline.sh\" ] && [ -x \"${HOME-}/.orca/agent-hooks/claude-statusline.sh\" ]; then /bin/sh \"${HOME-}/.orca/agent-hooks/claude-statusline.sh\"; else { command -p cat 2>/dev/null || cat; } >/dev/null 2>&1 || :; fi ;; esac; fi"
  },
  "enabledPlugins": {
    "harness@harness-marketplace": true,
    "claude-mem-cowork@thedotmack": true
  },
  "extraKnownMarketplaces": {
    "harness-marketplace": {
      "source": {
        "source": "github",
        "repo": "revfactory/harness"
      }
    },
    "thedotmack": {
      "source": {
        "source": "github",
        "repo": "thedotmack/claude-mem"
      }
    }
  },
  "language": "korean",
  "autoUpdatesChannel": "latest",
  "skipDangerousModePermissionPrompt": true,
  "theme": "dark"
}
`````
