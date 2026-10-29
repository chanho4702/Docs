# 원문 보기: user-codex/config.filtered.json

[[projects/moves-approval-harness-claude-codex-settings-2026-10-29|프로젝트 설정 기록]]

- 원본: `C:\Users\DMOVE\.codex\config.toml`
- 보관 방식: `filtered-json`
- 보관본 SHA-256: `faf9fa4f6cd96e59a19f3ff70280a1e5ae6ac5a6a2b7f70d8a716dcea83c242c`
- 참고: TOML 의미를 JSON으로 변환. 다른 프로젝트 trust 항목 제외. 그대로 config.toml에 덮어쓸 수 없음

[스냅샷 파일](../user-codex/config.filtered.json)

`````json
{
  "model": "gpt-5.6-sol",
  "model_reasoning_effort": "medium",
  "approvals_reviewer": "user",
  "notify": [
    "C:\\Users\\DMOVE\\AppData\\Local\\OpenAI\\Codex\\runtimes\\cua_node\\e8c74e7ee9bd567e\\bin\\node_modules\\@oai\\sky\\bin\\windows\\codex-computer-use.exe",
    "turn-ended"
  ],
  "projects": {
    "C:\\CloudJira\\moves-approval": {
      "trust_level": "trusted"
    }
  },
  "windows": {
    "sandbox": "elevated"
  },
  "marketplaces": {
    "openai-bundled": {
      "source_type": "local",
      "source": "\\\\?\\C:\\Users\\DMOVE\\.codex\\.tmp\\bundled-marketplaces\\openai-bundled"
    },
    "harness-marketplace": {
      "last_updated": "2026-07-31T04:46:21Z",
      "last_revision": "cceac68ea1d0ad198ef4b7b906cd238375836387",
      "source_type": "git",
      "source": "https://github.com/revfactory/harness.git"
    },
    "openai-primary-runtime": {
      "source_type": "local",
      "source": "\\\\?\\C:\\Users\\DMOVE\\.cache\\codex-runtimes\\codex-primary-runtime\\plugins\\openai-primary-runtime"
    }
  },
  "plugins": {
    "browser@openai-bundled": {
      "enabled": true
    },
    "visualize@openai-bundled": {
      "enabled": true
    },
    "harness@harness-marketplace": {
      "enabled": true
    },
    "documents@openai-primary-runtime": {
      "enabled": true
    },
    "pdf@openai-primary-runtime": {
      "enabled": true
    },
    "spreadsheets@openai-primary-runtime": {
      "enabled": true
    },
    "presentations@openai-primary-runtime": {
      "enabled": true
    },
    "template-creator@openai-primary-runtime": {
      "enabled": true
    },
    "chrome@openai-bundled": {
      "enabled": true
    },
    "codex-app-tools@openai-bundled": {
      "enabled": true
    },
    "unified-computer-use@openai-bundled": {
      "enabled": true
    },
    "computer-use@openai-bundled": {
      "enabled": true
    }
  },
  "features": {
    "js_repl": false
  },
  "mcp_servers": {
    "node_repl": {
      "args": [],
      "command": "C:\\Users\\DMOVE\\AppData\\Local\\OpenAI\\Codex\\runtimes\\cua_node\\e8c74e7ee9bd567e\\bin\\node_repl.exe",
      "env_vars": [
        "BROWSER_USE_ACCESS_EXECUTOR_ID",
        "BROWSER_USE_ACCESS_PIPE_PATH",
        "BROWSER_USE_ACCESS_VERIFYING_IDENTITY",
        "CODEX_WINDOWS_REGISTERED_CORE"
      ],
      "startup_timeout_sec": 120,
      "env": {
        "NODE_REPL_NATIVE_PIPE_CONNECT_TIMEOUT_MS": "1000",
        "NODE_REPL_NODE_MODULE_DIRS": "C:\\Users\\DMOVE\\AppData\\Local\\OpenAI\\Codex\\runtimes\\cua_node\\e8c74e7ee9bd567e\\bin\\node_modules",
        "NODE_REPL_NODE_PATH": "C:\\Users\\DMOVE\\AppData\\Local\\OpenAI\\Codex\\runtimes\\cua_node\\e8c74e7ee9bd567e\\bin\\node.exe",
        "NODE_REPL_TRUSTED_CODE_PATHS": "C:\\Users\\DMOVE\\.codex;C:\\Users\\DMOVE\\AppData\\Local\\OpenAI\\Codex\\runtimes\\cua_node\\e8c74e7ee9bd567e\\bin\\node_modules",
        "CODEX_HOME": "C:\\Users\\DMOVE\\.codex",
        "BROWSER_USE_AVAILABLE_BACKENDS": "chrome,iab,mcpapps",
        "BROWSER_USE_TINYSKY_ENABLED": "1",
        "NODE_REPL_INSTRUCTIONS_USE_CASE_BROWSER": "",
        "NODE_REPL_INSTRUCTIONS_USE_CASE_CHROME": "",
        "BROWSER_USE_CODEX_APP_BUILD_FLAVOR": "prod",
        "BROWSER_USE_CODEX_APP_VERSION": "26.1023.50603",
        "NODE_REPL_TRUSTED_SERVICES": "{\"browser\":\"C:/Users/DMOVE/.codex/plugins/cache/openai-bundled/browser/26.1023.50603/scripts/browser-service.mjs\",\"sky\":\"@oai/sky/service\"}",
        "SKY_CUA_NATIVE_PIPE": "1",
        "SKY_CUA_NATIVE_PIPE_DIRECTORY": "\\\\.\\pipe\\codex-computer-use-e64b11d7-ace8-433e-91a7-f8d5c1bc31ea",
        "CODEX_CLI_PATH": "C:\\Users\\DMOVE\\AppData\\Local\\OpenAI\\Codex\\bin\\08d187884f2330d1\\codex.exe",
        "NODE_REPL_UNTRUSTED_ENV_ALLOWLIST": "CODEX_WINDOWS_REGISTERED_CORE",
        "NODE_REPL_INSTRUCTIONS_USE_CASE_COMPUTER_USE": ""
      }
    }
  },
  "shell_environment_policy": {
    "set": {
      "NODE_REPL_TRUSTED_BROWSER_CLIENT_SHA256S": "aa6d8ffe273c2a7b1b20105a35ae49f69bdb4f025640807a31bcb47f8b67b92b"
    }
  },
  "desktop": {
    "conversationDetailMode": "STEPS_COMMANDS",
    "ambient-suggestions-enabled": true,
    "followUpQueueMode": "queue"
  },
  "hooks": {
    "state": {
      "C:\\Users\\DMOVE\\.codex\\hooks.json:pre_tool_use:0:0": {
        "enabled": true,
        "trusted_hash": "sha256:e8a9fdab23e8b755ab29693a29456243e7ad9e747a553b8d730bb81a41cd7e10"
      },
      "C:/Users/DMOVE/.codex/hooks.json:pre_tool_use:0:0": {
        "enabled": true,
        "trusted_hash": "sha256:e8a9fdab23e8b755ab29693a29456243e7ad9e747a553b8d730bb81a41cd7e10"
      },
      "C:\\Users\\DMOVE\\.codex\\hooks.json:permission_request:0:0": {
        "enabled": true,
        "trusted_hash": "sha256:2b8ccbb0e8c229c87a151ee58dde1ffe8d0dc0e9c55d743ad52268704ffc35a4"
      },
      "C:/Users/DMOVE/.codex/hooks.json:permission_request:0:0": {
        "enabled": true,
        "trusted_hash": "sha256:2b8ccbb0e8c229c87a151ee58dde1ffe8d0dc0e9c55d743ad52268704ffc35a4"
      },
      "C:\\Users\\DMOVE\\.codex\\hooks.json:post_tool_use:0:0": {
        "enabled": true,
        "trusted_hash": "sha256:39ff69d5d0a190923398c8764b750b821099ed795848468079bd64e61371fd4e"
      },
      "C:/Users/DMOVE/.codex/hooks.json:post_tool_use:0:0": {
        "enabled": true,
        "trusted_hash": "sha256:39ff69d5d0a190923398c8764b750b821099ed795848468079bd64e61371fd4e"
      },
      "C:\\Users\\DMOVE\\.codex\\hooks.json:user_prompt_submit:0:0": {
        "enabled": true,
        "trusted_hash": "sha256:8aa6867a49c4fd19fc46c9b457799b8dd80242e82082fb36a373a6238ef21d5c"
      },
      "C:/Users/DMOVE/.codex/hooks.json:user_prompt_submit:0:0": {
        "enabled": true,
        "trusted_hash": "sha256:8aa6867a49c4fd19fc46c9b457799b8dd80242e82082fb36a373a6238ef21d5c"
      },
      "C:\\Users\\DMOVE\\.codex\\hooks.json:stop:0:0": {
        "enabled": true,
        "trusted_hash": "sha256:66e5e25c89bde9cf7d3fd53428019de5740c5cadc612f6b1b3cf4f28dd27845d"
      },
      "C:/Users/DMOVE/.codex/hooks.json:stop:0:0": {
        "enabled": true,
        "trusted_hash": "sha256:66e5e25c89bde9cf7d3fd53428019de5740c5cadc612f6b1b3cf4f28dd27845d"
      },
      "C:\\Users\\DMOVE\\.codex\\hooks.json:subagent_start:0:0": {
        "enabled": true,
        "trusted_hash": "sha256:3b1d942c7c35b7891ef658305a22aec4a3d469cc6274a5ba41be6201a7127dfe"
      },
      "C:/Users/DMOVE/.codex/hooks.json:subagent_start:0:0": {
        "enabled": true,
        "trusted_hash": "sha256:3b1d942c7c35b7891ef658305a22aec4a3d469cc6274a5ba41be6201a7127dfe"
      },
      "C:\\Users\\DMOVE\\.codex\\hooks.json:subagent_stop:0:0": {
        "enabled": true,
        "trusted_hash": "sha256:351bf38d73a24f65b44cde44d795403a80ff2aa870532c59bf1b4becd54f4732"
      },
      "C:/Users/DMOVE/.codex/hooks.json:subagent_stop:0:0": {
        "enabled": true,
        "trusted_hash": "sha256:351bf38d73a24f65b44cde44d795403a80ff2aa870532c59bf1b4becd54f4732"
      },
      "C:\\Users\\DMOVE\\.codex\\hooks.json:pre_tool_use:1:0": {
        "trusted_hash": "sha256:5b8592e83a29f25c77106c18b57ce9449e71e4e5814a158bd26cc7b8fed9fd2e"
      },
      "C:\\Users\\DMOVE\\.codex\\hooks.json:permission_request:1:0": {
        "trusted_hash": "sha256:f901f6e8b03793e4f01de5c851270a1a6fbfe97fbc36e77ef4e9377db0e5377a"
      },
      "C:\\Users\\DMOVE\\.codex\\hooks.json:post_tool_use:1:0": {
        "trusted_hash": "sha256:9c6d96437bd9b29f5cf838284f914e61e62b32a7a59f23055dcb2819d104085b"
      },
      "C:\\Users\\DMOVE\\.codex\\hooks.json:session_start:0:0": {
        "trusted_hash": "sha256:0c32282f733521105a0aa480c00ab6df8be3152f080687225ff55f3a2249c649"
      },
      "C:\\Users\\DMOVE\\.codex\\hooks.json:user_prompt_submit:1:0": {
        "trusted_hash": "sha256:68cd1c2f4cde8759c8b0fc780820bdbf6aac61017b814040e7d6d28a03922776"
      },
      "C:\\Users\\DMOVE\\.codex\\hooks.json:subagent_start:1:0": {
        "trusted_hash": "sha256:8ea4d28711bb50119cdbcdda17ddaacc909eae808bd02749af2ea32c25e55efe"
      },
      "C:\\Users\\DMOVE\\.codex\\hooks.json:subagent_stop:1:0": {
        "trusted_hash": "sha256:8ee7033ba8b69fb4f7e496d597de32372fd1109669bec03bb1b8223776bb1baf"
      },
      "C:\\Users\\DMOVE\\.codex\\hooks.json:stop:1:0": {
        "trusted_hash": "sha256:bf31303da990339b190c41a2a11285fba2222d15d7362805ca439e7b09dabb9a"
      },
      "C:\\Users\\DMOVE\\.codex\\hooks.json:interrupt:0:0": {
        "trusted_hash": "sha256:0c18d28c81ca1a112735842498634cd09eca4250fd027dc6a948f347b1196e06"
      }
    }
  },
  "tui": {
    "screen_reader_detection_done": true,
    "model_availability_nux": {
      "gpt-6-astra": 1,
      "gpt-6.1-sol": 4
    }
  }
}
`````
