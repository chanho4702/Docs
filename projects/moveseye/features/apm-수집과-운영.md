---
type: feature-map
tags: [moveseye, feature-map, apm, ingest, otel, rollup, alert, retention, archive]
updated: 2026-10-19
---

# APM 수집·운영 — 수집기·OTLP·롤업·알람·보존·아카이브·허용목록·회복력·배치

> 기능 지도 [[무브스아이-기능-지도]] · 허브 [[moveseye]] · 링크는 `C:\solutions` 로컬 파일(file://)이라 이 PC에서만 열린다. 읽기용 사본은 [[2026-10-07-docs-reading-repo]].

**한 줄** — 수집기·토큰·설치 가이드, OTLP·RUM 수신, 라이브 스팬, 1분 집계·롤업(완전성·늦은 롤업·누적 정확성), 알람 규칙·SLO·합성 감시·알람 원자성·채널 중립 전송, 보존·내보내기·콜드 아카이브(ZM-156), 커스텀 지표 허용목록(ZM-155), 수집 회복력(ZM-122), 배치 10종, 자체 텔레메트리.

**상태** — 현행(#ZM-122 축). 회복력(09-29)·데드락 수정(09-28~30)·하드닝 5~8(10-06)·OTLP 컨트롤러 분리(10-07)·알람 원자성 1차 V74(10-08)·콜드 아카이브 V69(10-02)·허용목록 V81(10-19) master. 알람 채널 중립화 브랜치(V76~V80) 진행 중.

## 정본 문서 (moveseye-docs)
- [APM 수집과 운영(상세 가이드)](../../agent-documents/sources/solutions/moveseye-docs/guides/features/solutions--APM-%EC%88%98%EC%A7%91%EA%B3%BC-%EC%9A%B4%EC%98%81.md)
- [수집기 설치(화면 가이드)](../../agent-documents/sources/solutions/moveseye-docs/guides/pages/%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81/solutions--%EC%88%98%EC%A7%91%EA%B8%B0-%EC%84%A4%EC%B9%98.md)
- [APM 콜드 아카이브(기능 문서, ZM-156)](../../agent-documents/sources/solutions/moveseye-docs/features/solutions--APM-%EC%BD%9C%EB%93%9C-%EC%95%84%EC%B9%B4%EC%9D%B4%EB%B8%8C.md)
- [APM 커스텀 지표 허용목록(기능 문서, ZM-155)](../../agent-documents/sources/solutions/moveseye-docs/features/solutions--APM-%EC%BB%A4%EC%8A%A4%ED%85%80-%EC%A7%80%ED%91%9C-%ED%97%88%EC%9A%A9%EB%AA%A9%EB%A1%9D.md)
- [APM 규모 대응 준비도](../../agent-documents/sources/solutions/moveseye-docs/overview/solutions--apm-scale-readiness.md)
- [APM 우선순위별 보완 이력](../../agent-documents/sources/solutions/moveseye-docs/overview/solutions--apm-priority-fixes.md)
- [설치·배포 가이드(아카이브 볼륨·PG 15)](../../agent-documents/sources/solutions/moveseye-docs/operations/solutions--%EC%84%A4%EC%B9%98-%EB%B0%B0%ED%8F%AC-%EA%B0%80%EC%9D%B4%EB%93%9C.md)

## 설계·기획 (_workspace)
- [devdesign_apm-ingest-resilience](../../agent-documents/sources/solutions/_workspace/features/apm/ingest-resilience/solutions--devdesign_apm-ingest-resilience.md)
- [devdesign_apm-retention-policy](../../agent-documents/sources/solutions/_workspace/features/apm/retention/solutions--devdesign_apm-retention-policy.md)
- [devdesign_apm-cold-archive](../../agent-documents/sources/solutions/_workspace/features/apm/cold-archive/solutions--devdesign_apm-cold-archive.md)
- [devdesign_apm-metric-allowlist-extension](../../agent-documents/sources/solutions/_workspace/features/apm/metric-allowlist/solutions--devdesign_apm-metric-allowlist-extension.md)
- [devdesign_data-archiving(공통 기반 원설계 I7)](../../agent-documents/sources/solutions/_workspace/features/platform/data-archiving/solutions--devdesign_data-archiving.md)
- [plan_apm-priority-execution-20261006](../../agent-documents/sources/solutions/_workspace/features/apm/hardening-20261006/solutions--plan_apm-priority-execution-20261006.md)
- [apm-alert-atomicity-20261008](../../agent-documents/sources/solutions/_workspace/features/apm/alerts/solutions--apm-alert-atomicity-20261008.md)
- [apm-alert-delivery-redesign-20261010](../../agent-documents/sources/solutions/_workspace/features/apm/alerts/solutions--apm-alert-delivery-redesign-20261010.md)
- [apm-alert-unit5-6-design-20261011](../../agent-documents/sources/solutions/_workspace/features/apm/alerts/solutions--apm-alert-unit5-6-design-20261011.md)
- [apm-legacy-hold-rt3-20261010](../../agent-documents/sources/solutions/_workspace/features/apm/alerts/solutions--apm-legacy-hold-rt3-20261010.md)
- [apm-archive-integrity-20261006](../../agent-documents/sources/solutions/_workspace/features/apm/hardening-20261006/solutions--apm-archive-integrity-20261006.md)
- [apm-cumulative-correctness-20261006](../../agent-documents/sources/solutions/_workspace/features/apm/hardening-20261006/solutions--apm-cumulative-correctness-20261006.md)
- [apm-late-rollup-20261006](../../agent-documents/sources/solutions/_workspace/features/apm/hardening-20261006/solutions--apm-late-rollup-20261006.md)
- [apm-rollup-completeness-20261006](../../agent-documents/sources/solutions/_workspace/features/apm/hardening-20261006/solutions--apm-rollup-completeness-20261006.md)
- [apm-trace-reclassification-20261006](../../agent-documents/sources/solutions/_workspace/features/apm/hardening-20261006/solutions--apm-trace-reclassification-20261006.md)
- [backlog_apm-improvements-2026-09-29](../../agent-documents/sources/solutions/_workspace/features/apm/deadlock-fixes/solutions--backlog_apm-improvements-2026-09-29.md)
- [backlog_apm-full-review-2026-09-28](../../agent-documents/sources/solutions/_workspace/features/apm/full-review-20260928/solutions--backlog_apm-full-review-2026-09-28.md)
- [backlog_apm-collector-tokens-and-extension](../../agent-documents/sources/solutions/_workspace/features/apm/backlog/solutions--backlog_apm-collector-tokens-and-extension.md)
- [status_apm-backlog-reconcile-20261010](../../agent-documents/sources/solutions/_workspace/features/apm/backlog/solutions--status_apm-backlog-reconcile-20261010.md)
- [deferred_apm-retention-policy](../../agent-documents/sources/solutions/_workspace/features/apm/retention/solutions--deferred_apm-retention-policy.md)
- [apm-scope-reestimate](../../agent-documents/sources/solutions/_workspace/features/apm/backlog/solutions--apm-scope-reestimate.md)

## 계약 (_workspace/contract_*)
- [contract_apm-cold-archive](../../agent-documents/sources/solutions/_workspace/features/apm/cold-archive/solutions--contract_apm-cold-archive.md)
- [contract_apm-metric-allowlist](../../agent-documents/sources/solutions/_workspace/features/apm/metric-allowlist/solutions--contract_apm-metric-allowlist.md)
- [contract_apm-alert-channels](../../agent-documents/sources/solutions/_workspace/features/apm/alerts/solutions--contract_apm-alert-channels.md)
- [contract_apm-alert-zabbix-apply](../../agent-documents/sources/solutions/_workspace/features/apm/alerts/solutions--contract_apm-alert-zabbix-apply.md)
- [contract_apm-hardening-20261006](../../agent-documents/sources/solutions/_workspace/features/apm/hardening-20261006/solutions--contract_apm-hardening-20261006.md)
- [contract_apm-archive-integrity-20261006](../../agent-documents/sources/solutions/_workspace/features/apm/hardening-20261006/solutions--contract_apm-archive-integrity-20261006.md)
- [contract_apm-cumulative-correctness-20261006](../../agent-documents/sources/solutions/_workspace/features/apm/hardening-20261006/solutions--contract_apm-cumulative-correctness-20261006.md)
- [contract_apm-ingest-time-window-20261006](../../agent-documents/sources/solutions/_workspace/features/apm/hardening-20261006/solutions--contract_apm-ingest-time-window-20261006.md)
- [contract_apm-late-rollup-20261006](../../agent-documents/sources/solutions/_workspace/features/apm/hardening-20261006/solutions--contract_apm-late-rollup-20261006.md)
- [contract_apm-trace-reclassification-20261006](../../agent-documents/sources/solutions/_workspace/features/apm/hardening-20261006/solutions--contract_apm-trace-reclassification-20261006.md)
- [contract_report-management-apm-split](../../agent-documents/sources/solutions/_workspace/features/infra/report-management/solutions--contract_report-management-apm-split.md)

## 보고·검수·QA 증거
- [zm-156_apm-cold-archive(설계 보고)](../../agent-documents/sources/solutions/_workspace/features/apm/cold-archive/solutions--zm-156_apm-cold-archive.md)
- [zm-156_be-cold-archive](../../agent-documents/sources/solutions/_workspace/features/apm/cold-archive/solutions--zm-156_be-cold-archive.md)
- [zm-156_fe-cold-archive](../../agent-documents/sources/solutions/_workspace/features/apm/cold-archive/solutions--zm-156_fe-cold-archive.md)
- [zm-155_apm-metric-allowlist-extension](../../agent-documents/sources/solutions/_workspace/features/apm/metric-allowlist/solutions--zm-155_apm-metric-allowlist-extension.md)
- [zm-155_be-metric-allowlist](../../agent-documents/sources/solutions/_workspace/features/apm/metric-allowlist/solutions--zm-155_be-metric-allowlist.md)
- [zm-155_fe-metric-allowlist](../../agent-documents/sources/solutions/_workspace/features/apm/metric-allowlist/solutions--zm-155_fe-metric-allowlist.md)
- [README_zm-151-156(스프린트 지도)](../../agent-documents/sources/solutions/_workspace/planning/sprint-zm-151-156/solutions--README_zm-151-156.md)
- [summary_zm-151-156 쉬운 요약](../../agent-documents/sources/solutions/_workspace/planning/sprint-zm-151-156/solutions--summary_zm-151-156_%EC%89%AC%EC%9A%B4-%EC%9A%94%EC%95%BD.md)
- [report_apm-full-review-2026-09-28](../../agent-documents/sources/solutions/_workspace/features/apm/full-review-20260928/solutions--report_apm-full-review-2026-09-28.md)
- [review_zm-156-be/fe-cold-archive](../../agent-documents/sources/solutions/_workspace/features/apm/cold-archive/solutions--review_zm-156-be-cold-archive.md)
- [review_zm-155-be/fe-metric-allowlist](../../agent-documents/sources/solutions/_workspace/features/apm/metric-allowlist/solutions--review_zm-155-be-metric-allowlist.md)
- [review_apm-ingest-resilience_zm-122](../../agent-documents/sources/solutions/_workspace/features/apm/ingest-resilience/solutions--review_apm-ingest-resilience_zm-122.md)
- [review_apm-metric1m-deadlock](../../agent-documents/sources/solutions/_workspace/features/apm/deadlock-fixes/solutions--review_apm-metric1m-deadlock.md)
- [review_apm-rum-collectorlog-deadlock](../../agent-documents/sources/solutions/_workspace/features/apm/deadlock-fixes/solutions--review_apm-rum-collectorlog-deadlock.md)
- [review_apm-alert-atomicity-20261008](../../agent-documents/sources/solutions/_workspace/features/apm/alerts/solutions--review_apm-alert-atomicity-20261008.md)
- [review_apm-alert-unit1~7](../../agent-documents/sources/solutions/_workspace/features/apm/alerts/solutions--review_apm-alert-unit1-history-20261010.md)
- [review_apm-legacy-hold-rt3-be](../../agent-documents/sources/solutions/_workspace/features/apm/alerts/solutions--review_apm-legacy-hold-rt3-be-20261011.md)
- [review_apm-trace-time-window](../../agent-documents/sources/solutions/_workspace/features/apm/hardening-20261006/solutions--review_apm-trace-time-window-20261007.md)
- [review_apm-overall-20261006-claude](../../agent-documents/sources/solutions/_workspace/features/apm/hardening-20261006/solutions--review_apm-overall-20261006-claude.md)
- [review_apm-cumulative-design-claude](../../agent-documents/sources/solutions/_workspace/features/apm/hardening-20261006/solutions--review_apm-cumulative-design-20261006-claude.md)
- [review_apm-late-rollup-design-claude](../../agent-documents/sources/solutions/_workspace/features/apm/hardening-20261006/solutions--review_apm-late-rollup-design-20261006-claude.md)
- [qa_apm-hardening-20261006](../../agent-documents/sources/solutions/_workspace/features/apm/hardening-20261006/solutions--qa_apm-hardening-20261006.md)
- [qa_apm-archive-integrity-fe](../../agent-documents/sources/solutions/_workspace/features/apm/hardening-20261006/solutions--qa_apm-archive-integrity-fe-20261006.md)
- [qa_apm-cumulative-fe](../../agent-documents/sources/solutions/_workspace/features/apm/hardening-20261006/solutions--qa_apm-cumulative-fe-20261006.md)
- [qa_apm-late-rollup-fe](../../agent-documents/sources/solutions/_workspace/features/apm/hardening-20261006/solutions--qa_apm-late-rollup-fe-20261006.md)

## 경험 노트 (Vault)
[[2026-09-15-apm-install-guide-and-fe-polish]] · [[2026-09-17-apm-retention-policy-design]] · [[2026-09-28-apm-ingest-resilience]] · [[2026-09-28-apm-full-review]] · [[2026-09-28-apm-metric1m-deadlock]] · [[2026-09-30-apm-rum-collectorlog-deadlock]] · [[2026-10-01-apm-domain-review-sweep]] · [[2026-10-06-apm-hardening-scale]] · [[2026-10-06-apm-hardening-stage5-8]] · [[2026-10-07-otlp-controller-split]] · [[2026-10-08-apm-alert-atomicity]] · [[2026-10-12-apm-alert-channel-neutral-delivery]] · [[2026-10-02-zm156-apm-cold-archive]] · [[2026-10-19-zm155-apm-custom-metric-allowlist]] · [[2026-09-16-apm-observability-backlogs]] · [[otel-collector-pitfalls]] · [[concurrent-upsert-lock-order]] · [[shared-it-db-worktree-collision]] · [[2026-10-28-runtime-verification-and-actor-fix]]

## 열린 항목
- 알람 채널 중립화 6b → 8 DEAD 회복 → 병합(Flyway V76~V80 out-of-order 재번호 결정)
- 독자 알림 창구(메일·웹훅) 대기
- 156 실서버 아카이브 볼륨 마운트·S6 런타임
- 155 런타임·2차 차원 선택
- 전체 검토 🔴6 백로그·R2′ 출시 게이트

## 이웃 영역
[[apm-조회와-분석]] · [[이벤트와-알림]] · [[설정과-운영-기반]]
