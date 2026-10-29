---
title: Moves Approval — 하네스·Claude·Codex 설정 보관
date: 2026-10-29
project: moves-approval-confluence
type: configuration-snapshot
tags:
  - moves-approval
  - harness
  - claude
  - codex
  - obsidian
---

# Moves Approval 하네스·Claude·Codex 설정

`C:\CloudJira\moves-approval`에 관련된 프로젝트 지침, 사용자 설정, 하네스·스킬·플러그인 정의, Orca hook, Claude 프로젝트 메모리를 2026-10-29 기준으로 보관했다. **활성 파일은 그대로 두고 Obsidian에 스냅샷을 추가했다.**

- 프로젝트: Confluence Cloud 승인 앱. `moves-approval-jira`와 다른 저장소.
- 브랜치: `audit/deep-review-2026-10-28`
- HEAD: `b0e1cbb3621357c71723a20a244916004621131e`
- 보관: 원본 자료 **1,524개**, `SKILL.md` **113개**, 같은 실체를 가리키는 경로 별칭 **56개**. 약 **18.6 MB**이며 아래 보기용 노트는 별도다.
- 1,514개는 바이트 단위로 동일, 2개는 필요한 설정만 JSON으로 추출, 8개는 토큰 형태의 문자열을 마스킹했다. 마스킹에는 문서 예제도 포함될 수 있다.
- 관련 분석: [[moves-approval-confluence-deep-audit-2026-10-28]]

## 자료 열기

- [전체 파일·스킬·플러그인 목록](../evidence/moves-approval-agent-settings-2026-10-29/README.md)
- [설정·hook 원문을 Obsidian에서 읽기](../evidence/moves-approval-agent-settings-2026-10-29/views/index.md)
- [원본 경로·SHA-256·가공 방식 기록](../evidence/moves-approval-agent-settings-2026-10-29/manifest.json)

## 이 프로젝트에 있는 것과 없는 것

| 범위 | 확인한 자료 | 의미 |
|---|---|---|
| 프로젝트 | [AGENTS.md](../evidence/moves-approval-agent-settings-2026-10-29/project/AGENTS.md) | 작업 규칙, 보안 불변식, 검증·배포·커밋 규칙 |
| 프로젝트 | [CLAUDE.md](../evidence/moves-approval-agent-settings-2026-10-29/project/CLAUDE.md) | 아키텍처·도메인·디렉터리 규약의 기준 문서 |
| 프로젝트 | [.claude/settings.local.json](../evidence/moves-approval-agent-settings-2026-10-29/views/project__claude__settings.local.json.md) | `Bash(tail *)`, `Bash(ps *)` 허용 2개 |
| 프로젝트 | `.codex/`, `.agents/`, `.claude/agents/`, `.claude/skills/` 없음 | 전용 에이전트·오케스트레이터 하네스는 구성돼 있지 않음 |
| 프로젝트 | `.claude/settings.json`, `.mcp.json`, `CLAUDE.local.md` 없음 | 별도 공유 Claude 설정·프로젝트 MCP 파일 없음 |
| 사용자 Codex | `~/.codex/AGENTS.md`, `config.toml`, `hooks.json`, `rules/default.rules` | 공통 지침·저장된 기본값·hook·명령 규칙 |
| 사용자 Claude | `~/.claude/CLAUDE.md`, `settings.json`, `.claude.json`의 해당 프로젝트 항목 | 공통 지침·모델·플러그인·hook·MCP·신뢰 기록 |
| 추가 발견 | `C:\CloudJira\.claude\settings.local.json`, `~/.claude/settings.local.json`, `~/AGENTS.md` | 발견 자료로 보관. 이 프로젝트에 자동 상속된다고 단정하지 않음 |

Codex의 전역 `AGENTS.md`와 프로젝트 지침은 작업 지침을 구성하며, 경로상 더 가까운 지침이 구체적인 범위를 담당한다. 설정 파일에 저장된 기본값은 실행 옵션·프로파일·관리 정책 등에 의해 달라질 수 있다. 따라서 이 기록은 **디스크에서 확인한 설정**과 **실제 실행 여부 미검증 항목**을 구분한다. [Codex AGENTS.md 문서](https://learn.chatgpt.com/docs/agent-configuration/agents-md), [Codex 설정 문서](https://learn.chatgpt.com/docs/config-file/config-basic)

Claude의 공식 사용자 설정은 `~/.claude/settings.json`이고 프로젝트 설정은 저장소의 `.claude/settings.json` 및 `.claude/settings.local.json`이다. 홈·상위 폴더에서 별도로 발견한 `settings.local.json`은 파일 존재만으로 현재 세션 적용을 입증하지 않는다. [Claude 설정 범위·우선순위](https://code.claude.com/docs/en/settings)

## 프로젝트 작업 규칙

원문을 함께 보관했으며, 이후 작업에서 특히 지켜야 할 내용은 다음과 같다.

- 설명은 한국어. 아키텍처·도메인 규약은 `CLAUDE.md`를 기준으로 삼는다.
- resolver는 `guardedDefine`, `PermissionMap`, `CONTROLLER_REGISTRARS`를 함께 등록한다.
- `SELF` 변경은 `context.accountId`를 SQL 소유자 조건까지 전달한다. CAS는 `rev = rev + 1`, 승인 변경은 `decision_type='PENDING'` 조건을 지킨다.
- 목록 데이터는 `filterVisiblePages`, REST는 `asUser()`가 기본이다. `asApp()` 예외는 원문의 허용 경로로 제한된다.
- 트리거는 throw하지 않고 실패를 리컨실로 넘긴다. 배치 미완주 시 watermark를 전진시키지 않는다.
- 코드 변경 검증 순서는 backend test → UI test → UI build → `forge lint`다.
- 에이전트가 파일을 쓰는 동안 빌드·배포하지 않는다. 커밋·푸시는 요청받을 때만 하고 `Co-Authored-By`를 넣지 않는다.

이번 작업은 Vault 문서 보관뿐이므로 애플리케이션 테스트·빌드·배포를 수행하지 않았다.

## Codex 설정

[설정 전체 보기](../evidence/moves-approval-agent-settings-2026-10-29/views/user-codex__config.filtered.json.md) · [공통 지침](../evidence/moves-approval-agent-settings-2026-10-29/user-codex/AGENTS.md) · [명령 규칙](../evidence/moves-approval-agent-settings-2026-10-29/views/user-codex__rules__default.rules.md)

| 항목 | 저장된 값 |
|---|---|
| 모델 | `gpt-5.6-sol` |
| reasoning | `medium` |
| approvals reviewer | `user` |
| 프로젝트 신뢰 | `C:\CloudJira\moves-approval` → `trusted` |
| Windows sandbox | `elevated` |
| `features.js_repl` | `false` |
| notify | `codex-computer-use.exe`의 `turn-ended` 호출 |
| MCP | `node_repl`, `startup_timeout_sec=120` |
| node_repl 브라우저 backend | `chrome,iab,mcpapps` |
| 경험 기록 | `C:\Users\DMOVE\Codex-experiences\` |
| 명령 규칙 | `default.rules`의 `prefix_rule` 205개 |

모델·sandbox·허용 규칙은 저장된 값이며 현재 대화의 실효 설정을 뜻하지 않는다. `config.toml`은 모든 공통 설정을 보존하되, 다른 프로젝트의 trust 항목을 제외하고 JSON으로 변환했다. **이 JSON을 `config.toml`에 그대로 덮어쓰면 안 된다.** MCP의 실행 파일·환경 변수 이름·경로는 보관했지만 실제 인증 환경 변수 값은 수집하지 않았다.

설정에 명시적으로 활성화된 플러그인은 12개다.

| marketplace | 플러그인 |
|---|---|
| `harness-marketplace` | `harness` |
| `openai-bundled` | `browser`, `chrome`, `codex-app-tools`, `unified-computer-use`, `computer-use`, `visualize` |
| `openai-primary-runtime` | `documents`, `pdf`, `spreadsheets`, `presentations`, `template-creator` |

`notion`, `pages`, `sites`, `work-pets`, `plugin-management`, `openai-templates`는 캐시에 있는 정의도 보관했다. **캐시 존재와 `config.toml`의 명시적 활성화는 서로 다른 상태다.** 전체 플러그인 표에는 이를 구분해 기록했다.

## Claude 설정

[settings.json 전체](../evidence/moves-approval-agent-settings-2026-10-29/views/user-claude__settings.json.md) · [공통 지침](../evidence/moves-approval-agent-settings-2026-10-29/user-claude/CLAUDE.md) · [선별한 MCP·프로젝트 설정](../evidence/moves-approval-agent-settings-2026-10-29/views/user-claude__claude.filtered.json.md)

| 항목 | 저장된 값 |
|---|---|
| 모델 | `fable` — 파일의 식별자 그대로 기록, 다른 모델명으로 추정하지 않음 |
| 언어 / 테마 | `korean` / `dark` |
| 업데이트 채널 | `latest` |
| 위험 모드 안내 생략 | `skipDangerousModePermissionPrompt=true` |
| 활성 플러그인 | `harness@harness-marketplace`, `claude-mem-cowork@thedotmack` |
| 전역 MCP | `notion`: `https://mcp.notion.com/mcp` |
| 프로젝트 MCP | `.claude.json`의 해당 프로젝트 `mcpServers={}` |
| 프로젝트 신뢰 | `hasTrustDialogAccepted=true` |
| 경험 기록 | `C:\Users\DMOVE\claude-experiences\` |

홈의 `.claude/settings.local.json`에는 과거 작업에서 누적된 allow 항목 55개가 있다. 별도 보관했지만 공식 사용자 설정인 `settings.json`과 구분했다. 상위 `C:\CloudJira`의 local 설정에는 다른 프로젝트 의존성을 조회하는 PowerShell 허용 항목 1개가 있다.

`.claude.json` 원본에는 계정·인증·다른 프로젝트 상태도 있어 원본 전체를 복사하지 않았다. 전역 MCP와 현재 프로젝트의 도구·MCP·신뢰 관련 필드만 추렸다.

## 하네스·스킬 적용 관계

| 위치 | 확인 상태 |
|---|---|
| Codex harness 플러그인 | **2.1.0**, 설정에서 활성화 |
| Claude harness 플러그인 | **1.2.0**, 사용자 범위 설치·활성화 |
| Claude `claude-mem-cowork` | **0.1.3**, 사용자 범위 설치·활성화 |
| `~/.agents/skills` | 공용 skill 정의와 참고 자료 보관 |
| `~/.claude/skills` | 직접 설치, 공용 경로 junction, `skills-main`, synced 스킬 보관 |
| `~/.codex/skills` | system 스킬, `figma-generate-design` 등 보관 |
| 이 프로젝트 전용 하네스 | 없음. `AGENTS.md`와 `CLAUDE.md`가 프로젝트 작업 규칙을 제공 |

공용 주요 스킬은 `archify`, `frontend-design`, `fullstack-developer`, `harness`, `mcp-builder`, `orchestration`이다. 플러그인 하네스와 별개로 사용자 스킬 경로에 `harness/SKILL.md` 사본도 있다. 출처·버전이 다른 정의를 하나로 합치지 않고 원래 경로를 보존했다.

Claude 설치 목록의 `harness`에는 사용자 범위 외에 marketplace 디렉터리를 가리키는 project 범위 기록도 있다. 그 project 경로는 이 저장소가 아니므로 이 저장소 전용 하네스로 계산하지 않았다.

**`approval-harness`는 `C:\CloudJira\moves-approval-jira`의 하네스다.** 이 프로젝트 메모리에 등장하지만 Confluence 저장소의 활성 하네스라는 뜻은 아니다. [구분 근거 메모리](../evidence/moves-approval-agent-settings-2026-10-29/project-memory/jira-approval-repo.md)

## Hook·Orca 연결

[Codex hooks.json](../evidence/moves-approval-agent-settings-2026-10-29/views/user-codex__hooks.json.md) · [Claude hooks 포함 설정](../evidence/moves-approval-agent-settings-2026-10-29/views/user-claude__settings.json.md) · [Orca Claude hook](../evidence/moves-approval-agent-settings-2026-10-29/views/hooks-orca__claude-hook-impl.cmd.md) · [Orca Codex hook](../evidence/moves-approval-agent-settings-2026-10-29/views/hooks-orca__codex-hook.cmd.md)

| 호출 주체 | 등록 이벤트 | 연결 |
|---|---|---|
| Codex | `PreToolUse`, `PermissionRequest`, `PostToolUse`, `UserPromptSubmit`, `SubagentStart`, `SubagentStop`, `Stop` | Claude 호환 hook 래퍼와 `codex-hook.cmd` 둘 다 등록, timeout 10초 |
| Codex | `SessionStart`, `Interrupt` | `codex-hook.cmd`, 각각 10초·3초 |
| Claude | `Stop`, `UserPromptSubmit`, `StopFailure`, `SubagentStart`, `SubagentStop`, `TeammateIdle`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest`, `SessionStart`, `PostCompact`, `SessionEnd` | `claude-hook.cmd`, timeout 10초 |
| Claude | `Stop` | Windows 완료 알림 `notify-stop.ps1` 추가 등록, async·20초 |
| Claude statusLine | 상태 줄 갱신 | `claude-statusline.cmd` 또는 shell 래퍼 |
| Claude 메모리 플러그인 | `SessionStart`, `UserPromptSubmit`, `PostToolUse`, `PreToolUse(Task/Agent)`, `SubagentStop`, `Stop`, `SessionEnd` | `scripts/cmem-hook.mjs`의 context·관찰·요약 등 처리 |

Orca 스크립트는 `127.0.0.1`의 환경 변수 지정 포트로 이벤트를 전달하도록 작성돼 있다. `ORCA_AGENT_HOOK_TOKEN`, `ORCA_PANE_KEY` 같은 실행 환경이 없으면 조기에 종료하는 분기가 있다. 변수 이름은 스냅샷에 남기고 실제 값은 수집하지 않았다. hook을 실행하거나 서버 전송 여부를 시험하지 않았다.

Claude의 완료 알림 스크립트는 마지막 payload를 `~/.claude/hooks/last-stop-payload.json`에 쓰도록 돼 있다. 스크립트만 보관했고 payload 파일은 제외했다. Codex 폴더에도 같은 이름의 알림 스크립트가 있지만 현재 `hooks.json`에서는 해당 파일을 호출하지 않는다.

`claude-mem-cowork`의 로컬 `config.json`은 `apiBase=https://cmem.ai`, `apiKey`는 빈 문자열이다. 코드에는 환경 변수 등 다른 설정원도 있으므로, 이것만으로 연결·미연결 상태를 확정하지 않았다. 플러그인 정의와 코드만 보관했다.

## 프로젝트 메모리와 차이점

Claude의 `~/.claude/projects/C--CloudJira-moves-approval/memory`에 있던 세 문서를 보관했다.

- [MEMORY.md](../evidence/moves-approval-agent-settings-2026-10-29/project-memory/MEMORY.md)
- [Jira 저장소 구분](../evidence/moves-approval-agent-settings-2026-10-29/project-memory/jira-approval-repo.md)
- [Marketplace 출시 상태](../evidence/moves-approval-agent-settings-2026-10-29/project-memory/marketplace-launch-status.md)

확인된 차이점은 다음과 같다. 이번에는 기록만 했고 활성 설정은 변경하지 않았다.

1. **경험 저장소 분리**: Codex 지침은 `Codex-experiences`, Claude 지침은 `claude-experiences`를 가리킨다. 이번 기록은 사용자가 지정한 Codex Vault에 모았다.
2. **하네스 정의 차이**: Codex 플러그인 2.1.0, Claude 플러그인 1.2.0, 사용자 경로의 별도 스킬이 함께 존재한다. 어느 정의를 실행했는지 출처를 남겨야 한다.
3. **과거 메모리의 날짜**: 출시 메모리는 주로 2026-10-20~22 상태다. 이후 작업의 현재 배포 상태를 대신하는 문서로 쓰지 않는다.
4. **등록과 실행의 구분**: hook·MCP·플러그인 등록 사실은 확인했지만 실행 중 세션에서 모두 활성화됐는지는 시험하지 않았다.

## 보관 범위와 검증

설정, 지침, 스킬 본문, 텍스트 참고 자료·스크립트, 관련 플러그인 manifest·hook, 프로젝트 메모리를 보관했다. 인증 파일, 실제 토큰, 대화/세션/로그/DB, 브라우저 프로필, 바이너리·이미지·폰트 assets, 설치 의존 패키지, test/eval/example/build 산출물은 제외했다. 따라서 설치 환경 전체를 즉시 복원하는 배포 번들은 아니다.

각 파일은 원본과 보관본 SHA-256을 기록하고 대조했다. 원문 그대로인 파일과 선별·마스킹한 파일을 manifest에서 구분한다. Markdown 보기용 사본은 `views-manifest.json`으로 따로 관리한다. 수집 도중 원본이 바뀌지 않았는지도 검사했다.

프로젝트의 브랜치와 HEAD는 유지했고 애플리케이션 파일 수정, 커밋, 푸시, 배포는 하지 않았다. INDEX와 이전 심층 분석 노트에 이 기록을 연결했다.
