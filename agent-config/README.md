# agent-config — Claude Code · Codex 설정 사본 (다른 PC 복원용)

2026-10-29 작성(같은 날 CloudJira Forge 리포 2개 추가). `~/.claude`·`~/.codex`·`C:\solutions\.claude`·`C:\CloudJira\*\.claude`에 흩어진 설정을 한곳에 모았다.
새 PC에서는 아래 표대로 **같은 경로에 되돌려 놓기만** 하면 된다. 비밀값(로그인 토큰·DB 비밀번호)은 전부 뺐다.

> ⚠️ 이 폴더는 Obsidian Sync가 숨김 폴더를 건너뛰기 때문에 `.claude`·`.codex` 대신 `claude/`·`codex/` 이름을 쓴다.
> Vault 안에서 이 폴더를 옮기지 말 것 — Obsidian이 md 안의 `[[링크]]`를 자동으로 고쳐 버린다.

## 복원 표

| 이 폴더 | 새 PC 경로 | 비고 |
|---|---|---|
| `claude/user/CLAUDE.md` | `~/.claude/CLAUDE.md` | 한국어·옵시디언 규칙 |
| `claude/user/settings.json` | `~/.claude/settings.json` | 🔴 훅 명령이 `C:/Users/DMOVE/...` 절대경로 — 사용자명이 다르면 치환. Orca 훅 12개는 Orca 설치 전엔 지워도 됨 |
| `claude/user/settings.local.json` | `~/.claude/settings.local.json` | 권한 허용목록 |
| `claude/user/hooks/notify-stop.ps1` | `~/.claude/hooks/` | 완료 알림 훅(settings.json Stop) |
| `claude/user/skills/*` | `~/.claude/skills/` | archify·harness·mcp-builder·orchestration·frontend-design·fullstack-developer. `synced/`·`skills-main`은 제외(로그인하면 자동) |
| `claude/memory/*.md` | `~/.claude/projects/C--solutions/memory/` | 136개. 작업 루트가 `C:\solutions`여야 슬러그 `C--solutions`가 맞는다. `<dev-db-pw>`·`<dev-admin-pw>`는 마스킹 자리 |
| `claude/mcp-servers.json` | `~/.claude.json`의 `mcpServers` 항목 | 파일 통째로 덮지 말고 `claude mcp add --transport http notion https://mcp.notion.com/mcp` 식으로 다시 등록 |
| `claude/solutions/agents/*` | `C:\solutions\.claude\agents\` | 하네스 에이전트 4개(be/fe-engineer·integration/functional-qa) |
| `claude/solutions/skills/*` | `C:\solutions\.claude\skills\` | fullstack-feature·api-contract-sync |
| `claude/solutions/settings.local.json` | `C:\solutions\.claude\settings.local.json` | 허용목록(비밀값 포함 항목 30건 제거) |
| `claude/solutions/CLAUDE.md`·`COLLAB.md` | `C:\solutions\` | 루트 규약 — `_pc-migration-2026-10-28/repo-root/`와 같은 것 |
| `claude/moveseye-be-spring/settings.local.json` | `C:\solutions\moveseye-be-spring\.claude\` | 11건 제거 |
| `claude/moveseyee_fe/settings.local.json` | `C:\solutions\moveseyee_fe\.claude\` | |
| `claude/moves-approval-jira/agents/*` | `C:\CloudJira\moves-approval-jira\.claude\agents\` | Jira 승인 앱 하네스 에이전트 4개(feature-architect·backend-engineer·frontend-engineer·integration-verifier) |
| `claude/moves-approval-jira/skills/*` | `C:\CloudJira\moves-approval-jira\.claude\skills\` | 오케스트레이터 `approval-harness` + 단계 스킬 4개(feature-design·forge-backend-dev(+references/jira-platform.md)·forge-frontend-dev·integration-verify) |
| `claude/moves-approval-jira/CLAUDE.md`·`AGENTS.md` | `C:\CloudJira\moves-approval-jira\` | 리포 루트 규약. **AGENTS.md 는 Codex(`codex exec`)도 읽는 작업 규칙**(스타일·불변식·보안·검증·배포·커밋). 둘은 git 추적 파일이라 clone 하면 따라오지만, 작업 트리 미커밋 상태(2026-10-28)를 반영한 최신본은 여기 |
| `claude/moves-approval-jira/autopilot/*` | `C:\CloudJira\moves-approval-jira\scripts\autopilot\` | 무인 실행기 `run.ps1`(회차마다 `claude -p` 한 Phase, 한도면 `codex exec` 인계) + Claude·Codex 회차 프롬프트 |
| `claude/moves-approval-jira/memory/*.md` | `~/.claude/projects/C--CloudJira-moves-approval-jira/memory/` | 16개(MEMORY.md 포함). 작업 루트가 `C:\CloudJira\moves-approval-jira`여야 슬러그가 맞는다. Codex 검수 명령·모델 비용·채널 결정·인수인계 |
| `claude/moves-workforce/agents/*`·`skills/*` | `C:\CloudJira\moves-workforce\.claude\` | 워크포스 하네스(에이전트 4개, 오케스트레이터 `feature-harness` + 단계 스킬 4개). `.claude/worktrees/`는 제외 |
| `claude/moves-workforce/CLAUDE.md`·`AGENTS.md` | `C:\CloudJira\moves-workforce\` | 리포 루트 규약(git 추적) |
| `claude/moves-workforce/settings.local.json` | `C:\CloudJira\moves-workforce\.claude\` | 허용목록(제거 0건) |
| `claude/moves-workforce/memory/*.md` | `~/.claude/projects/C--CloudJira-moves-workforce/memory/` | 82개(feedback_*·project_*·reference_*) |
| `codex/AGENTS.md` | `~/.codex/AGENTS.md` | 한국어·`Codex-experiences` Vault 규칙 |
| `codex/config.portable.toml` | `~/.codex/config.toml`에 **병합** | 모델·trust 프로젝트·sandbox·harness 마켓·플러그인·desktop만. 기계 고유 항목(notify·node_repl·hooks.state)은 새 PC의 Codex 앱이 다시 만든다 |
| `codex/config.toml` | 참고용 원본 | 그대로 덮어쓰면 옛 PC 경로가 섞이니 쓰지 말 것 |
| `codex/hooks.json`·`codex/hooks/` | `~/.codex/` | Orca 훅 + notify-stop. 🔴 절대경로 치환 |
| `codex/rules/default.rules` | `~/.codex/rules/` | 명령 허용 규칙(1건 제거) |
| `codex/skills/figma-generate-design` | `~/.codex/skills/` | `.system/`은 제외(앱이 관리) |

## CloudJira Forge 리포(승인·워크포스)에서 Codex 는 어떻게 걸려 있나

- 프로젝트 전용 Codex 설정 파일은 없다. Codex 가 읽는 것은 **리포 루트 `AGENTS.md`**(위 표)와 `codex/config.portable.toml` 의 `[projects."C:\\CloudJira\\moves-approval-jira"]`·`moves-workforce`·`moves-approval`·`moves-rms` trust 항목뿐.
- 검수는 Claude 세션이 리포 디렉터리에서 직접 띄운다(`node C:/Claude/node_modules/@openai/codex/bin/codex.js exec --skip-git-repo-check -m gpt-6-astra -c model_reasoning_effort="xhigh" -s read-only -c approval_policy=never - < prompt.md`, stdin 리다이렉트 필수, 한 번에 하나). 모델 선택 규칙은 `claude/moves-approval-jira/memory/codex-model-cost.md`, stdin 함정은 `codex-exec-stdin.md`.
- 하네스 호출 규칙(서브에이전트 순차 파이프라인, `_workspace/<slug>/` 산출물, Phase 0~6)은 `claude/moves-approval-jira/skills/approval-harness/SKILL.md` 가 정본이고, CLAUDE.md "하네스" 절이 트리거를 적는다.

## 플러그인은 복사하지 않는다

- Claude: `settings.json`의 `enabledPlugins`·`extraKnownMarketplaces`가 있으니 새 PC에서 `/plugin`으로 `harness@harness-marketplace`·`claude-mem-cowork@thedotmack`를 다시 설치.
- Codex: `config.portable.toml`의 `[marketplaces.harness-marketplace]`·`[plugins.*]`로 같은 효과. 나머지 openai-bundled·primary-runtime은 앱 내장.

## 넣지 않은 것(직접 옮기거나 재발급)

- `~/.claude/.credentials.json`, `~/.codex/auth.json` → 새 PC에서 로그인.
- `~/.claude.json` 전체(세션 상태 섞임), `~/.claude/projects/*` 세션 로그, `~/.codex/*.sqlite`·`sessions/`.
- BE `.env`·라이선스 개인키·도커 DB → `projects/moveseye/2026-10-28-pc-migration-handoff.md` §3.

## 다시 내보내기

`tools/export_agent_config.py`를 `python -I`로 실행하면 `claude/`·`codex/` 생성물 폴더를 지우고 다시 만든다(README·tools 는 남김, 원본 경로는 스크립트 상단 상수). 허용목록·rules에서 `qwe123|password|PGPASSWORD|root_token|이력서` 패턴을 거르고, 메모리 사본의 `Admin@123`·`qwe123` 는 `<dev-admin-pw>`·`<dev-db-pw>` 로 자동 치환하며, 결과에 비밀값이 남았는지 검사해 출력한다. 마지막 실행(2026-10-29) 결과 505개 파일, 비밀값 검사 적중은 이 README 의 패턴 설명 줄과 mcp-builder 스킬 문서의 예시 토큰 줄 2개뿐(실값 아님).
