---
type: project
tags: [moveseye, apm, rollup, export, env-filter, codex, solo-claude]
created: 2026-10-07
updated: 2026-10-08
status: done
---

# 2026-10-07~08 — APM 남은 작업 재파악: 우선순위 표대로 c05·trace 시간창·env 필터 처리 (SOLO-CLAUDE 전환)

- 프로젝트: [[moveseye]] · 선행 [[2026-10-06-apm-overall-review]] · [[2026-10-06-apm-hardening-stage5-8]] · 기능 지도 [[apm-조회와-분석]]
- 사용자 지시: "다시 apm 개선점이랑 남은작업 파악해 진행하면서 코덱스 의견 들어보고" → `COLLAB.md`를 **`SOLO-CLAUDE`**(구현 Claude, 코덱스는 검수·의견)로 전환.
- 정본: 실행표 `_workspace/features/apm/hardening-20261006/plan_apm-priority-execution-20261006.md` · 23개 우선순위 `moveseye-docs/overview/apm-overall-assessment.md` §3 · 보완 이력 `apm-priority-fixes.md` · 착수 전 코덱스 의견 `_archive/features/apm/hardening-20261006/review_apm-remaining-plan-20261007_codex.md` · 메모리 `apm-remaining-work-2026-10-07`

## 완료 (BE master ff, 미푸시)
| 순위 | 내용 | 커밋 |
|---|---|---|
| c05 후속 | 소비자 완전성 보완 — 1h coverage의 5m 상태 상속, SLO series 미확정 구간 `incompleteFromMs`, todayCell `NOT_MEASURABLE`, RED export `ROLLUP_INCOMPLETE` + 게이지 비움, `max-services @Max(200)` | BE `9a35de1`·`ab78f4f` / FE `a1e258e`·`26795a4` |
| 7 | 서버 trace 시간창 — reader 직후·리졸버 전 검사, `receivedAt` 기준 `min(spanDays, traceSummaryDays)` + 300초, `TRACE_TIME_EXPIRED/FUTURE/INVALID`, 실 PG IT | BE `fd4fcfb` / FE `dfb0442` |
| 9~10 | env 필터를 SQL 모집단 단계로(`ApmServiceRefLookup.select`), 그룹 상세·시계열 범위, 내보내기 세 데이터셋 env + planToken v2(v1 읽기 병행). FE 전역 화면만 env, 쿼리 키는 원문, `normalizeApmEnv` = BE 이식 | BE `1c094a1` / FE `707bf84` |

순위 11(알람 원자성)은 [[2026-10-08-apm-alert-atomicity]]로 이어짐.

## 교훈
- 🔴 **코덱스 대화형 세션이 BE 메인 트리에서 병행 작업한다**(10-07 수신 컨트롤러 분리 [[2026-10-07-otlp-controller-split]]). BE는 워크트리 브랜치 → `git rebase master` → ff-only로만 합친다. `TraceIngestPipeline.ingest(token,payload,receivedAt)` 시그니처는 디스패처가 쓰므로 고정.
- Mockito: setUp의 `thenAnswer`가 안에서 다른 mock을 부르면 뒤의 `when(mock.x(...))`이 안쪽 호출에 스텁을 붙인다 → `doAnswer(...).when(mock).x(...)`.
- FE 구현을 `fe-engineer` 에이전트에 위임(명세 상세 + 커밋 금지)한 것이 잘 됐다.
- 다음 세션이 09-29 백로그나 APC 표(둘 다 낡음)만 보고 다시 시작하지 않도록 정본 포인터를 메모리에 못 박았다.

## 관련
[[2026-10-06-apm-overall-review]] · [[2026-10-06-apm-hardening-scale]] · [[2026-10-08-apm-alert-atomicity]] · [[codex-exec-operations]] · [[2026-09-22-zm151-156-backlog-sprint]](ZM-154 planToken v1)
