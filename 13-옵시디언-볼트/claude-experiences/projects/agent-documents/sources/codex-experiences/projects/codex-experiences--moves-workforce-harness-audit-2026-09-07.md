# Moves Workforce 하네스 감사·개선

2026-09-07, `C:\CloudJira\moves-workforce`, HEAD `6ff54d3`와 기존 미커밋 변경 기준.

## 확인된 문제

- CLAUDE의 변경 이력에는 guardedDefine/권한 범위 보강이 기록돼 있었지만 실제 `.agents/skills`와 `.codex/agents`에는 과거 지침이 남아 있었다. 이력은 현재 파일 상태의 증거가 아니다.
- 오케스트레이터가 `.Codex/skills`, Markdown 에이전트 파일, 과거 Agent/SendMessage 호출·opus 자동 적용을 안내했다. 현재 프로젝트는 `.agents/skills/*/SKILL.md`와 `.codex/agents/*.toml`을 사용한다.
- 선행 에이전트 실패 후 다음 단계 진행, 실제 구현을 계약보다 무조건 우선하는 지침이 미완성·잘못된 계약을 전파할 수 있었다.
- 하네스는 `.gitignore`에서 제외되어 `git status`·일반 `rg --files`만으로 변경을 볼 수 없었다. `rg --files --hidden --no-ignore .agents .codex`와 원본 사본 비교가 필요했다.

## 개선과 검증

- 역할별 TOML은 역할·소유권·입출력·스킬 직접 참조로 줄였다. 상세 구현 규칙은 스킬에 두고 AGENTS에 진입점을 등록했다.
- guardedDefine/CONTROLLER_REGISTRARS/PermissionMap, principal·SELF·급여/팀 범위·형제 resolver·배정 검증, SQL/KVS, asUser, 라우팅·캐시·CI 검증을 동기화했다.
- 현재 도구의 send_message는 유휴 작업을 시작하지 않으므로 followup_task로 재개하도록 구분했다. 호출할 때 실제 세션 도구와 지원 모델을 먼저 확인한다.
- 작은 수정은 필요한 역할만 사용하고, 이전 설계서가 없으면 현재 계약의 간결한 기록으로 대체한다. 필수 선행 실패는 의존 작업을 보류하고 원인을 해결한다.
- UTF-8 BOM이 있으면 공식 quick_validate가 frontmatter를 찾지 못했다. SKILL.md는 BOM 없이 저장하고 구조 검사에 이 사례도 추가했다.
- 구조 검사와 손상 사례 6종, 공식 skill validator 5개, 독립 드라이런 3개+트리거 분류 16개를 확인했다. backend 1,511개, frontend 1,743개 테스트와 CI 빌드 통과. Forge lint는 exit 0이나 PermissionLinter Unknown product로 일부 미검증이다.

## 재사용 지점

- 검사: `.agents/skills/feature-harness/scripts/validate_harness.py` (Python 3.11+, 설치된 Node js-yaml 사용)
- 절차/행동 사례: `.agents/skills/feature-harness/references/`
- 감사 보고서·원본·diff: `_workspace/harness-audit-2026-09-07/`
- 하네스는 로컬 전용 정책을 유지했으며 앱 코드·커밋·푸시·배포 변경은 하지 않았다.

관련: [[projects/agent-documents/sources/codex-experiences/projects/codex-experiences--moves-workforce-documentation-baseline-sync|moves-workforce-documentation-baseline-sync]], [[projects/agent-documents/sources/codex-experiences/topics/codex-experiences--tanstack-query-cross-domain-invalidation|tanstack-query-cross-domain-invalidation]]
