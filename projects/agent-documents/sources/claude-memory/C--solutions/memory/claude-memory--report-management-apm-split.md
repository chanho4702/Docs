---
name: report-management-apm-split
description: "ZM-167 설정>리포트 관리 APM 탭 분리 + APM 전용 보존 설정(V66) — 09-22 ✅ BE 5f6b0b2·FE 34028f2 master 병합(미푸시), 코덱스 BE v2/FE v5 승인, QA 2회 통과, dev DB V66 체크섬 정정"
metadata: 
  node_type: memory
  type: project
  originSessionId: 039051be-9dba-4d6d-ba0f-6b67d4ef1cda
  modified: 2026-09-22T07:53:04.837Z
---

2026-09-22 사용자 "리포트 관리에 APM은 따로 관리하고싶어" → 결정(AskUserQuestion): **같은 화면 안 탭 분리(호스트 그룹/APM) + APM 전용 보존 설정**. `fullstack-feature` 절차로 진행.

- 정본: 계약 `_workspace/features/infra/report-management/contract_report-management-apm-split.md`(🔄에 FE 요청·BE 변경 통보·답변) · 정적 QA `features/infra/report-management/qa_report-management-apm-split.md` · 런타임 QA `features/infra/report-management/e2e_report-management-apm-split.md` · 검수 요청 `features/infra/report-management/review_report-management-apm-split.md`(+`-be_codex.md`·`-fe_codex.md`).
- 위치(미커밋): BE 워크트리 `C:/worktrees/report-apm-be`(브랜치 `report-apm-split`, master `baed6ee`) 수정 9+신규 2 · FE 워크트리 `C:/worktrees/report-apm-fe`(같은 브랜치명, master `d47c0a5`=ZM-161 포함, node_modules 정션) 수정 12+신규 2.
- 설계 요지: `report_retention_setting` **단일 행에 `apm_*` 3열**(V66, 업그레이드 시 기존 값 복사) · `GET/PUT /admin/reports/retention/apm`(같은 3필드 shape, `report/` STANDARD, `@RequiresFeature` 없음) · `runCleanup` 두 스위치 독립(`CleanupResult` record) · FE 탭은 `?tab=`, APM 탭은 `licenseLoading || allowsFeature("APM")`, 목록은 `type` 고정 필터(목록 EP 불변).
- 검증: BE 116건(IT V66 실 PG) · FE jest 40+40·tsc·eslint·계약 게이트 · 정적 QA 차단 0(권장 1 반영: `destroyOnHidden`) · 런타임 QA(:3001 워크트리 BE + Vite 5174, dev DB에 V66 적용됨) 통과, 보존 값 원복.
- 🔴 dev DB(5433)에는 **V66이 이미 적용**돼 있다(functional-qa) — :3000 옛 코드도 DEFAULT 덕에 정상. 병합 후 재기동 시 Flyway가 V66을 건너뛴다(정상).
- 🔴 헤드리스 검증 함정: `.ant-switch` 첫 요소는 헤더 다크 모드 스위치 — 폼 스위치는 `form button#enabled`.
- 미확인: 비관리자 403 런타임(USER 계정 비번 불명)·라이선스 없음 접힘 런타임(dev는 PREMIUM)·V66 값 복사 실측(행 0건).
- ✅ 코덱스 검수 종결(09-22): BE v2 승인(lost update → `PESSIMISTIC_WRITE`+`ON CONFLICT DO NOTHING`, exhaustive switch, V66 복사 IT, `pg_stat_activity` 잠금 대기 확인) · FE v5 승인(빈 `?tab=` 정규화, `useBlocker` dirty 보호, GET 실패 UI, 원격 충돌 Alert, `Modal.useModal`, `setFields` touched 초기화). 런타임 QA 2차 통과. 🔴 **dev DB V66 체크섬 드리프트**(주석 수정) → 다음 BE 기동 전 `flyway repair` 필요(사용자 결정 대기).
- 🔴 교훈: 코덱스 왕복이 FE 5회 — 지적이 계속 "같은 R2(dirty 보호)"의 다른 경로(뒤로가기·라이선스 전환·effect 순서·touched)였다. 상태 보호 기능은 처음부터 **모든 이탈 경로(클릭·POP·강제 전환·언마운트)를 표로 열거**하고 설계해야 왕복이 준다.
- ✅ **종료(09-22)**: Jira **ZM-167** 발급(사용자 위임) · BE master `5f6b0b2` · FE master `34028f2`(미푸시) · dev DB V66 체크섬 정정 완료 · 워크트리·브랜치 정리. 남은 일: 푸시(사용자) · 비관리자 403·라이선스 없음 접힘 런타임은 미실측(IT·jest만) · 후속 후보: 행 전체 링크 접근성(`DmoveTable` 공용), 화면 이탈(pathname 변경) 시 dirty 보호는 전역 정책으로.

관련 [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--report-management-feature|report-management-feature]] [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--zm-151-156-backlog-sprint|zm-151-156-backlog-sprint]] [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--commit-requires-approval|commit-requires-approval]] [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--codex-review-handoff|codex-review-handoff]]
