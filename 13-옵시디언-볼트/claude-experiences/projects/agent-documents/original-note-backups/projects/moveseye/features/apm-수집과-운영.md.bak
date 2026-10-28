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
- [APM 수집과 운영(상세 가이드)](file:///C:/solutions/moveseye-docs/guides/features/APM-수집과-운영.md)
- [수집기 설치(화면 가이드)](file:///C:/solutions/moveseye-docs/guides/pages/모니터링/수집기-설치.md)
- [APM 콜드 아카이브(기능 문서, ZM-156)](file:///C:/solutions/moveseye-docs/features/APM-콜드-아카이브.md)
- [APM 커스텀 지표 허용목록(기능 문서, ZM-155)](file:///C:/solutions/moveseye-docs/features/APM-커스텀-지표-허용목록.md)
- [APM 규모 대응 준비도](file:///C:/solutions/moveseye-docs/overview/apm-scale-readiness.md)
- [APM 우선순위별 보완 이력](file:///C:/solutions/moveseye-docs/overview/apm-priority-fixes.md)
- [설치·배포 가이드(아카이브 볼륨·PG 15)](file:///C:/solutions/moveseye-docs/operations/설치-배포-가이드.md)

## 설계·기획 (_workspace)
- [devdesign_apm-ingest-resilience](file:///C:/solutions/_workspace/features/apm/ingest-resilience/devdesign_apm-ingest-resilience.md)
- [devdesign_apm-retention-policy](file:///C:/solutions/_workspace/features/apm/retention/devdesign_apm-retention-policy.md)
- [devdesign_apm-cold-archive](file:///C:/solutions/_workspace/features/apm/cold-archive/devdesign_apm-cold-archive.md)
- [devdesign_apm-metric-allowlist-extension](file:///C:/solutions/_workspace/features/apm/metric-allowlist/devdesign_apm-metric-allowlist-extension.md)
- [devdesign_data-archiving(공통 기반 원설계 I7)](file:///C:/solutions/_workspace/features/platform/data-archiving/devdesign_data-archiving.md)
- [plan_apm-priority-execution-20261006](file:///C:/solutions/_workspace/features/apm/hardening-20261006/plan_apm-priority-execution-20261006.md)
- [apm-alert-atomicity-20261008](file:///C:/solutions/_workspace/features/apm/alerts/apm-alert-atomicity-20261008.md)
- [apm-alert-delivery-redesign-20261010](file:///C:/solutions/_workspace/features/apm/alerts/apm-alert-delivery-redesign-20261010.md)
- [apm-alert-unit5-6-design-20261011](file:///C:/solutions/_workspace/features/apm/alerts/apm-alert-unit5-6-design-20261011.md)
- [apm-legacy-hold-rt3-20261010](file:///C:/solutions/_workspace/features/apm/alerts/apm-legacy-hold-rt3-20261010.md)
- [apm-archive-integrity-20261006](file:///C:/solutions/_workspace/features/apm/hardening-20261006/apm-archive-integrity-20261006.md)
- [apm-cumulative-correctness-20261006](file:///C:/solutions/_workspace/features/apm/hardening-20261006/apm-cumulative-correctness-20261006.md)
- [apm-late-rollup-20261006](file:///C:/solutions/_workspace/features/apm/hardening-20261006/apm-late-rollup-20261006.md)
- [apm-rollup-completeness-20261006](file:///C:/solutions/_workspace/features/apm/hardening-20261006/apm-rollup-completeness-20261006.md)
- [apm-trace-reclassification-20261006](file:///C:/solutions/_workspace/features/apm/hardening-20261006/apm-trace-reclassification-20261006.md)
- [backlog_apm-improvements-2026-09-29](file:///C:/solutions/_workspace/features/apm/deadlock-fixes/backlog_apm-improvements-2026-09-29.md)
- [backlog_apm-full-review-2026-09-28](file:///C:/solutions/_workspace/features/apm/full-review-20260928/backlog_apm-full-review-2026-09-28.md)
- [backlog_apm-collector-tokens-and-extension](file:///C:/solutions/_workspace/features/apm/backlog/backlog_apm-collector-tokens-and-extension.md)
- [status_apm-backlog-reconcile-20261010](file:///C:/solutions/_workspace/features/apm/backlog/status_apm-backlog-reconcile-20261010.md)
- [deferred_apm-retention-policy](file:///C:/solutions/_workspace/features/apm/retention/deferred_apm-retention-policy.md)
- [apm-scope-reestimate](file:///C:/solutions/_workspace/features/apm/backlog/apm-scope-reestimate.md)

## 계약 (_workspace/contract_*)
- [contract_apm-cold-archive](file:///C:/solutions/_workspace/features/apm/cold-archive/contract_apm-cold-archive.md)
- [contract_apm-metric-allowlist](file:///C:/solutions/_workspace/features/apm/metric-allowlist/contract_apm-metric-allowlist.md)
- [contract_apm-alert-channels](file:///C:/solutions/_workspace/features/apm/alerts/contract_apm-alert-channels.md)
- [contract_apm-alert-zabbix-apply](file:///C:/solutions/_workspace/features/apm/alerts/contract_apm-alert-zabbix-apply.md)
- [contract_apm-hardening-20261006](file:///C:/solutions/_workspace/features/apm/hardening-20261006/contract_apm-hardening-20261006.md)
- [contract_apm-archive-integrity-20261006](file:///C:/solutions/_workspace/features/apm/hardening-20261006/contract_apm-archive-integrity-20261006.md)
- [contract_apm-cumulative-correctness-20261006](file:///C:/solutions/_workspace/features/apm/hardening-20261006/contract_apm-cumulative-correctness-20261006.md)
- [contract_apm-ingest-time-window-20261006](file:///C:/solutions/_workspace/features/apm/hardening-20261006/contract_apm-ingest-time-window-20261006.md)
- [contract_apm-late-rollup-20261006](file:///C:/solutions/_workspace/features/apm/hardening-20261006/contract_apm-late-rollup-20261006.md)
- [contract_apm-trace-reclassification-20261006](file:///C:/solutions/_workspace/features/apm/hardening-20261006/contract_apm-trace-reclassification-20261006.md)
- [contract_report-management-apm-split](file:///C:/solutions/_workspace/features/infra/report-management/contract_report-management-apm-split.md)

## 보고·검수·QA 증거
- [zm-156_apm-cold-archive(설계 보고)](file:///C:/solutions/_workspace/features/apm/cold-archive/zm-156_apm-cold-archive.md)
- [zm-156_be-cold-archive](file:///C:/solutions/_workspace/features/apm/cold-archive/zm-156_be-cold-archive.md)
- [zm-156_fe-cold-archive](file:///C:/solutions/_workspace/features/apm/cold-archive/zm-156_fe-cold-archive.md)
- [zm-155_apm-metric-allowlist-extension](file:///C:/solutions/_workspace/features/apm/metric-allowlist/zm-155_apm-metric-allowlist-extension.md)
- [zm-155_be-metric-allowlist](file:///C:/solutions/_workspace/features/apm/metric-allowlist/zm-155_be-metric-allowlist.md)
- [zm-155_fe-metric-allowlist](file:///C:/solutions/_workspace/features/apm/metric-allowlist/zm-155_fe-metric-allowlist.md)
- [README_zm-151-156(스프린트 지도)](file:///C:/solutions/_workspace/planning/sprint-zm-151-156/README_zm-151-156.md)
- [summary_zm-151-156 쉬운 요약](file:///C:/solutions/_workspace/planning/sprint-zm-151-156/summary_zm-151-156_쉬운-요약.md)
- [report_apm-full-review-2026-09-28](file:///C:/solutions/_workspace/features/apm/full-review-20260928/report_apm-full-review-2026-09-28.md)
- [review_zm-156-be/fe-cold-archive](file:///C:/solutions/_workspace/features/apm/cold-archive/review_zm-156-be-cold-archive.md)
- [review_zm-155-be/fe-metric-allowlist](file:///C:/solutions/_workspace/features/apm/metric-allowlist/review_zm-155-be-metric-allowlist.md)
- [review_apm-ingest-resilience_zm-122](file:///C:/solutions/_workspace/features/apm/ingest-resilience/review_apm-ingest-resilience_zm-122.md)
- [review_apm-metric1m-deadlock](file:///C:/solutions/_workspace/features/apm/deadlock-fixes/review_apm-metric1m-deadlock.md)
- [review_apm-rum-collectorlog-deadlock](file:///C:/solutions/_workspace/features/apm/deadlock-fixes/review_apm-rum-collectorlog-deadlock.md)
- [review_apm-alert-atomicity-20261008](file:///C:/solutions/_workspace/features/apm/alerts/review_apm-alert-atomicity-20261008.md)
- [review_apm-alert-unit1~7](file:///C:/solutions/_workspace/features/apm/alerts/review_apm-alert-unit1-history-20261010.md)
- [review_apm-legacy-hold-rt3-be](file:///C:/solutions/_workspace/features/apm/alerts/review_apm-legacy-hold-rt3-be-20261011.md)
- [review_apm-trace-time-window](file:///C:/solutions/_workspace/features/apm/hardening-20261006/review_apm-trace-time-window-20261007.md)
- [review_apm-overall-20261006-claude](file:///C:/solutions/_workspace/features/apm/hardening-20261006/review_apm-overall-20261006-claude.md)
- [review_apm-cumulative-design-claude](file:///C:/solutions/_workspace/features/apm/hardening-20261006/review_apm-cumulative-design-20261006-claude.md)
- [review_apm-late-rollup-design-claude](file:///C:/solutions/_workspace/features/apm/hardening-20261006/review_apm-late-rollup-design-20261006-claude.md)
- [qa_apm-hardening-20261006](file:///C:/solutions/_workspace/features/apm/hardening-20261006/qa_apm-hardening-20261006.md)
- [qa_apm-archive-integrity-fe](file:///C:/solutions/_workspace/features/apm/hardening-20261006/qa_apm-archive-integrity-fe-20261006.md)
- [qa_apm-cumulative-fe](file:///C:/solutions/_workspace/features/apm/hardening-20261006/qa_apm-cumulative-fe-20261006.md)
- [qa_apm-late-rollup-fe](file:///C:/solutions/_workspace/features/apm/hardening-20261006/qa_apm-late-rollup-fe-20261006.md)

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
