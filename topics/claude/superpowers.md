---
type: topic
tags: [topic, superpowers, claude-code, plugin, skill, harness, reference]
created: 2026-05-30
updated: 2026-05-30
---

# Superpowers — Claude Code 스킬 프레임워크 (외부 도구 레퍼런스)

> Jesse Vincent(obra)가 만든 Claude Code 플러그인. "스킬 프레임워크 + 소프트웨어 개발 방법론". 내 [[harness-engineering]] 체계와 같은 계보(skill로 절차지식 주입)이며, **경쟁이 아니라 상호 보완**. 조사일 2026-05-30 기준.

## 한 줄 정의
- **하네스** = 일을 *어떻게 조직·실행하는가*의 골격(Claude Code 자체 + 내가 짠 도메인 파이프라인).
- **Superpowers** = 그 골격 위에 얹는 *절차적 지식(스킬) 패키지 + 규율 방법론*.
- 비유: 하네스는 그릇, Superpowers는 담는 내용물.

## 스펙 (2026-05 기준)
| 항목 | 내용 |
|------|------|
| 제작 | Jesse Vincent (obra), MIT, 무료 |
| 위상 | **2026-01-15 공식 Anthropic Claude Code 마켓플레이스 등재** |
| 설치 | `/plugin install superpowers@claude-plugins-official` (공식)<br>또는 `/plugin marketplace add obra/superpowers-marketplace` → `/plugin install superpowers@superpowers-marketplace` |
| 구성 | 12~20 스킬 + `/brainstorm` `/write-plan` `/execute-plan` 커맨드 + SessionStart 컨텍스트 주입 + skills-search |
| 멀티플랫폼 | Claude Code, Codex CLI/App, Gemini CLI, OpenCode, Cursor, Copilot CLI 등 |

## 스킬 트리 (실제 clone 확인, 총 14개)
> `git clone obra/superpowers` 직접 확인(2026-05-30). 디렉토리는 평면(`skills/<name>/SKILL.md`)이지만 트리거 조건(`Use when…`)으로 개발 라이프사이클 파이프라인을 이룬다.

```
🟢 using-superpowers ........ 진입점: 모든 대화 시작 시. "응답 전에 Skill 도구부터 호출"
│
├─ ① 설계
│   ├─ brainstorming ........ 창작 작업 전 필수. 의도·요구사항·설계 탐색
│   └─ writing-plans ........ 스펙 → 멀티스텝 계획 (코드 만지기 전)
├─ ② 격리
│   └─ using-git-worktrees .. 격리 워크스페이스 생성 (계획 실행 전)
├─ ③ 실행 (셋 중 택1)
│   ├─ subagent-driven-development .. 현재 세션, 독립 작업들
│   ├─ executing-plans ............. 별도 세션 + 리뷰 체크포인트
│   └─ dispatching-parallel-agents . 2+ 독립 작업 병렬
│       ├─ test-driven-development .. 구현 코드 전, RED-GREEN-REFACTOR
│       └─ systematic-debugging ..... 버그/테스트 실패 시 (수정 제안 전)
├─ ④ 검증
│   ├─ requesting-code-review ...... 완료/머지 전 검증 요청
│   ├─ receiving-code-review ....... 리뷰 수용 (맹목적 동의 금지, 기술 검증)
│   └─ verification-before-completion  "완료" 주장 전 — 증거 우선(evidence before assertions)
└─ ⑤ 완료
    └─ finishing-a-development-branch  merge / PR / cleanup 옵션 제시

🔧 메타: writing-skills .... 스킬 작성·편집·검증 (내 harness 메타스킬 대응)
```

**카테고리:** 진입/메타(`using-superpowers`, `writing-skills`) · 설계(`brainstorming`, `writing-plans`) · 격리(`using-git-worktrees`) · 실행(`subagent-driven-development`, `executing-plans`, `dispatching-parallel-agents`, `test-driven-development`, `systematic-debugging`) · 검증(`requesting-code-review`, `receiving-code-review`, `verification-before-completion`) · 완료(`finishing-a-development-branch`)

## 핵심 파이프라인
브레인스토밍(질문으로 스펙 도출) → **git worktree 격리**(클린 테스트 베이스라인) → 2~5분 단위 작업 계획 → **fresh subagent per task** → RED/GREEN TDD → 전문 리뷰어 에이전트 2단계 검증(스펙 준수 → 코드 품질) → 브랜치 완료(merge/PR/discard).
- 철학: "스킬이 있으면 *반드시* 그 스킬을 써라." 자동 트리거 = 권고가 아니라 **강제 워크플로우**.
- YAGNI · DRY · true red/green TDD 강조.

## 내 하네스와의 정렬 (빈칸 = 접목 후보)
> 단계별로 보면 내 하네스는 ③실행·④검증 일부·메타가 이미 정렬돼 있고, **비어있는 칸이 TDD·worktree·완료(branch 통합)**.

| Superpowers 단계 | 내 하네스(moves-workforce) 대응 | 상태 |
|------|------|------|
| ① brainstorming + writing-plans | Phase 2 architect (경계면 계약 설계서) | ✅ 있음 (brainstorming 앞단 보강 여지) |
| ② using-git-worktrees | `_workspace/<feature>/` (산출물만 격리) | ⚠️ 코드 격리 없음 → **접목 후보 ★** |
| ③ subagent-driven-development | Phase 3-4 backend→frontend 순차 dispatch | ✅ 거의 동일 |
| ③ test-driven-development | (없음 — 구현 후 jest 통과) | ❌ **접목 1순위 ★★★** |
| ④ requesting/receiving-code-review | Phase 5 verifier (경계면 교차검증) | ⚠️ 코드품질 리뷰 없음 → 보강 여지 |
| ④ verification-before-completion | verifier "미검증 추측 통과 금지" | ✅ 이미 반영 |
| ⑤ finishing-a-development-branch | (없음) | ❌ 통합 단계 부재 |
| 🔧 writing-skills | `harness` 메타 스킬 | ✅ 동일 계보 |

→ **내 설계가 검증된 셈.** Superpowers는 "도메인 무관 + 규율(TDD/worktree)"이 강하고, 내 것은 "Forge 도메인 깊이 + 오케스트레이션"이 강함. 빈칸(❌⚠️)을 Superpowers 스킬로 메우는 게 접목 전략.

## 접목 우선순위 (가치 높은 순)
1. **`test-driven-development` 주입 ★★★** — 지금 backend/frontend는 구현 후 jest *통과*. TDD 주입 시 테스트 우선 → 경계면 계약을 테스트로 박아 회귀 방지. 내 하네스의 사후검증 약점을 메움.
2. **`using-git-worktrees` ★★★** — `_workspace/<feature>/`(산출물 격리)를 코드까지 확장 → 다기능 진짜 동시 작업. ※ Forge deploy/tunnel이 worktree 경로에서 도는지 확인 필요.
3. **`subagent-driven-development` 방법론 ★★☆** — 내 "리더 중계 순차"를 정형 패턴(fresh subagent + 2단계 리뷰)으로 업그레이드. verifier에 *코드 품질* 리뷰 단계 추가.
4. **`brainstorming` ★★☆** — architect 앞단에 붙여 모호 요구사항 제거.

## 접목 시 주의
- **전부 갈아끼우지 말 것.** Superpowers는 도메인 무관 → Forge 특화 지식(네이밍 비일관·merge 경로·워크로그 N+1 금지)을 대체 못함. **내 오케스트레이터를 상부 조율자로 유지**, Superpowers는 하부 규율 스킬로.
- **자동 트리거 충돌.** Superpowers 스킬은 공격적으로 자동 트리거 → 내 `feature-harness`와 겹치면 둘 다 발동 가능. 설치 후 트리거 경계 점검.
- **권장 도입법:** 먼저 설치만 해서 실제 깔리는 스킬을 본 뒤 취사선택. 전체 채택 금지.

## 사례
- [[moves-workforce]] — 내 하네스가 Superpowers 핵심(subagent-driven + file-relay + verification)에 독립적으로 수렴함을 확인한 케이스.

## 관련 노트
- [[harness-engineering]] — 하네스 구축 노하우(이 노트의 상위 개념). "에이전트(누가)는 내 것, 스킬(어떻게)은 Superpowers" 혼용이 ⑥ 원칙과 일치.
- [[moves-workforce]]

## 출처 (재확인용)
- GitHub: https://github.com/obra/superpowers · https://github.com/obra/superpowers-marketplace
- 저자 블로그(방법론): https://blog.fsck.com/2025/10/09/superpowers/
- Anthropic 공식: https://claude.com/plugins/superpowers
- DeepWiki(설치): https://deepwiki.com/obra/superpowers/2.1-installing-on-claude-code
