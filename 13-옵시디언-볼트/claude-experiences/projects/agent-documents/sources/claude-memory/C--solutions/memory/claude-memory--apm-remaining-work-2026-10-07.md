---
name: apm-remaining-work-2026-10-07
description: "2026-10-07 APM 잔여 작업 인수 — 코덱스 10-06 순위 1~8 뒤 Claude가 c05 보완·APC-07·순위 7 처리, 남은 순위 9~10·11 이후, 코덱스 병행 작업 주의"
metadata:
  node_type: memory
  type: project
  originSessionId: e05d80c9-f57f-4b0d-a549-a1c837b68a1b
  modified: 2026-10-12T06:30:26.155Z
---

2026-10-07 사용자 지시 "다시 apm 개선점이랑 남은작업 파악해 진행하면서 코덱스 의견 들어보고" → `COLLAB.md`를 `SOLO-CLAUDE`로 전환(구현 Claude, 코덱스 검수·의견).

**정본**: 코덱스 10-06 실행표 `_workspace/features/apm/hardening-20261006/plan_apm-priority-execution-20261006.md`(⚠️ `c05bd85`는 표에 미반영) · 23개 우선순위 `moveseye-docs/overview/apm-overall-assessment.md` §3 · 보완 이력 `apm-priority-fixes.md` · 코덱스 착수 전 의견 `_workspace/_archive/features/apm/hardening-20261006/review_apm-remaining-plan-20261007_codex.md`(순위 9~10 미결 4건 권장안·순위 11 설계 순서·V71 포함).

**10-07 완료(BE master ff, 미푸시)**
- `9a35de1`+`ab78f4f` c05 소비자 완전성 보완(1h coverage의 5m 상태 상속·SLO series 미확정 구간 자름 `incompleteFromMs`·todayCell `unknownReason=NOT_MEASURABLE`·RED export `ROLLUP_INCOMPLETE`+게이지 비움·스냅샷 창별 INFO) + APC-07 `max-services @Max(200)`. FE `a1e258e`+`26795a4`(캘린더 측정 불가 별도 series·번다운 각주). 코덱스 1차 반려(🔴1·🟡3) → 전건 반영. 인계 `features/apm/hardening-20261006/review_apm-c05-followup-20261007.md`.
- 순위 7 서버 trace 시간창 ✅ BE `fd4fcfb`(master ff)·FE `dfb0442` — `TraceIngestPipeline` reader 직후·리졸버 전 검사, `receivedAt` 기준 `min(spanDays,traceSummaryDays)`·+300초, `TRACE_TIME_EXPIRED/FUTURE/INVALID`, 정책 setter 주입, 실 PG `ApmTraceTimeWindowIT`. 코덱스 조건부 승인→회귀 보강 반영(배치당 DB 1회 비용은 순위 12로). 인계 `features/apm/hardening-20261006/review_apm-trace-time-window-20261007.md`.
- 순위 9~10 ✅ BE `1c094a1`(master ff)·FE `707bf84`(10-08 커밋) — env 필터 SQL 모집단 단계(`ApmServiceRefLookup.select/Selection/bucketScopeSql`), 그룹 상세·시계열 범위 확인, 내보내기 세 데이터셋 env+`ApmExportTarget.envNorm`+planToken v2(v1 읽기). FE: 전역 화면만 env, 쿼리 키는 원문, `setEnv(next,resetKeys)`, `depSelService`, `useApmRefresh` 통일, `normalizeApmEnv`=BE 이식. 코덱스 BE 반려→승인·FE 보완→조건부→반영. 🔴브라우저 런타임 미검증(dev BE 재기동 필요). FE 구현은 `fe-engineer` 에이전트 위임이 잘 됐음(명세 상세히 + 커밋 금지).

**남은 순서**(코덱스 권고): 순위 9~10 env 필터(계약 `features/apm/hardening-20261006/contract_apm-query-controls-20261006.md`, 권장안: trace env=선택 서비스 환경+involved 유지·개요 RED export에도 env·null UID 합산 금지·planToken v2 지문+v1 병행 읽기) → 순위 11 알람 원자성(APC-01 부분 UNIQUE **V71**·APC-05 Zabbix I/O 트랜잭션 밖·APC-25 observedAt 제거, 한 설계로) → 12~23. 보류: trace retired tombstone(공통 partition 경계), Availability `incompleteFromMs` 응답, 스냅샷 전량 skip 잡 실패 승격.

**Why:** 다음 세션이 09-29 백로그나 APC 표(둘 다 `e55948c` 기준으로 낡음)만 보고 다시 시작하지 않게.

**How to apply:**
- 🔴 코덱스 대화형 세션이 BE 메인 트리에서 병행 작업할 수 있다(10-07 `2b17971` 수신 컨트롤러 → `collector/ingest/receive/*` 리팩터링, 사용자 "코드 정리 중"). BE는 **워크트리 브랜치에서 작업 → `git rebase master` → ff-only** 로만 합친다. `TraceIngestPipeline.ingest(token,payload,receivedAt)` 시그니처는 디스패처가 쓰므로 바꾸지 말 것.
- 코덱스 호출: `codex exec --skip-git-repo-check --sandbox read-only -m gpt-5.6-sol -c 'model_reasoning_effort="high"' -c 'windows.sandbox="unelevated"' - < 프롬프트` (`approvals_reviewer="none"`은 없는 값, `--skip-git-repo-check` 없으면 "Not inside a trusted directory"). 진행 로그는 stderr, 최종 답은 stdout. 10~15분.
- 🔴 Mockito: setUp의 `thenAnswer`가 안에서 다른 mock 메서드를 부르면 뒤의 `when(mock.x(...))`이 그 안쪽 호출에 스텁을 붙인다 → `doAnswer(...).when(mock).x(...)`.
- BE 테스트는 JDK17 + 워크트리에서 `:test --tests`(dev BE :3000이 메인 트리에서 돎). `ApmMetricCoverageReaderIT`·`ApmTraceSchemaIT`는 실 PG, skipped=0 확인할 것.

관련 [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--apm-implementation-progress|apm-implementation-progress]] [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--apm-domain-improvements-backlog|apm-domain-improvements-backlog]] [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--codex-review-handoff|codex-review-handoff]] [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--codex-model-choice|codex-model-choice]] [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--commit-requires-approval|commit-requires-approval]]

**인덱스(MEMORY.md)에서 옮긴 기록**: 순위 11 알람 원자성 1차는 BE `3de55ec`(V74, 10-08 커밋, [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--apm-alert-atomicity-decisions|apm-alert-atomicity-decisions]]). 2차 outbox는 독자 알림 지시 전 착수 금지.
