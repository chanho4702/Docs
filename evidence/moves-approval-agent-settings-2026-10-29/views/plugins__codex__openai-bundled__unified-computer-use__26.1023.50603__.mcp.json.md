# 원문 보기: plugins/codex/openai-bundled/unified-computer-use/26.1023.50603/.mcp.json

[[projects/moves-approval-harness-claude-codex-settings-2026-10-29|프로젝트 설정 기록]]

- 원본: `C:\Users\DMOVE\.codex\plugins\cache\openai-bundled\unified-computer-use\26.1023.50603\.mcp.json`
- 보관 방식: `byte-identical`
- 보관본 SHA-256: `e64067419f3aede48afc0cb5fc9e194d86235584a0b1a966da6b237f5ac63c45`

[스냅샷 파일](../plugins/codex/openai-bundled/unified-computer-use/26.1023.50603/.mcp.json)

`````json
{
  "mcpServers": {
    "cua_repl": {
      "command": "C:\\Users\\DMOVE\\AppData\\Local\\OpenAI\\Codex\\runtimes\\cua_node\\e8c74e7ee9bd567e\\bin\\node.exe",
      "args": [
        "--import",
        "file:///C:/Users/DMOVE/.codex/plugins/cache/openai-bundled/unified-computer-use/26.1023.50603/require-browser-access.mjs",
        "C:\\Users\\DMOVE\\AppData\\Local\\OpenAI\\Codex\\runtimes\\cua_node\\e8c74e7ee9bd567e\\bin\\node_modules\\@oai\\cua-repl\\bin\\cua-repl.mjs"
      ],
      "enabled": true,
      "enabled_tools": [
        "js",
        "js_reset",
        "turn_ended"
      ],
      "omit_tools_from": [
        "code_mode",
        "deferred"
      ],
      "startup_timeout_sec": 120,
      "tools": {
        "js": {
          "output_token_limit": 25000
        }
      },
      "env_vars": [
        "BROWSER_USE_ACCESS_EXECUTOR_ID",
        "BROWSER_USE_ACCESS_PIPE_PATH",
        "BROWSER_USE_ACCESS_VERIFYING_IDENTITY",
        "CODEX_WINDOWS_REGISTERED_CORE"
      ],
      "env": {
        "NODE_REPL_NATIVE_PIPE_CONNECT_TIMEOUT_MS": "1000",
        "NODE_REPL_NODE_MODULE_DIRS": "C:\\Users\\DMOVE\\AppData\\Local\\OpenAI\\Codex\\runtimes\\cua_node\\e8c74e7ee9bd567e\\bin\\node_modules",
        "NODE_REPL_NODE_PATH": "C:\\Users\\DMOVE\\AppData\\Local\\OpenAI\\Codex\\runtimes\\cua_node\\e8c74e7ee9bd567e\\bin\\node.exe",
        "NODE_REPL_TRUSTED_CODE_PATHS": "C:\\Users\\DMOVE\\.codex;C:\\Users\\DMOVE\\AppData\\Local\\OpenAI\\Codex\\runtimes\\cua_node\\e8c74e7ee9bd567e\\bin\\node_modules",
        "CODEX_HOME": "C:\\Users\\DMOVE\\.codex",
        "BROWSER_USE_AVAILABLE_BACKENDS": "chrome,iab,mcpapps",
        "BROWSER_USE_TINYSKY_ENABLED": "1",
        "NODE_REPL_INSTRUCTIONS_USE_CASE_BROWSER": "Control the in-app browser in conjunction with the Browser Plugin.",
        "NODE_REPL_INSTRUCTIONS_USE_CASE_CHROME": "Control the Chrome browser in conjunction with the Chrome Plugin. Prefer this method of controlling Chrome over alternatives (such as Computer Use) unless the user explicitly mentions an alternative.",
        "BROWSER_USE_CODEX_APP_BUILD_FLAVOR": "prod",
        "BROWSER_USE_CODEX_APP_VERSION": "26.1023.50603",
        "NODE_REPL_TRUSTED_SERVICES": "{\"browser\":\"@oai/browser-desktop/service\",\"sky\":\"@oai/sky/service\"}",
        "SKY_CUA_NATIVE_PIPE": "1",
        "SKY_CUA_NATIVE_PIPE_DIRECTORY": "\\\\.\\pipe\\codex-computer-use-e64b11d7-ace8-433e-91a7-f8d5c1bc31ea",
        "CODEX_CLI_PATH": "C:\\Users\\DMOVE\\AppData\\Local\\OpenAI\\Codex\\bin\\08d187884f2330d1\\codex.exe",
        "NODE_REPL_UNTRUSTED_ENV_ALLOWLIST": "CODEX_WINDOWS_REGISTERED_CORE",
        "CUA_REPL_NODE_REPL_PATH": "C:\\Users\\DMOVE\\AppData\\Local\\OpenAI\\Codex\\runtimes\\cua_node\\e8c74e7ee9bd567e\\bin\\node_repl.exe",
        "CUA_REPL_ENABLED_SURFACES": "browser,computer"
      }
    }
  }
}
`````
