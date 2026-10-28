---
type: feature-map
tags: [moveseye, feature-map, apm, ui, trace, realtime, export]
updated: 2026-10-19
---

# APM 조회·분석 — 개요·서비스·트레이스·에러·서비스 맵·실시간 관제·RUM·리포트·자기설명·내보내기

> 기능 지도 [[무브스아이-기능-지도]] · 허브 [[moveseye]] · 링크는 `C:\solutions` 로컬 파일(file://)이라 이 PC에서만 열린다. 읽기용 사본은 [[2026-10-07-docs-reading-repo]].

**한 줄** — APM 개요·서비스·트레이스·에러(장애 및 에러 메뉴)·DB·외부 호출·서비스 맵·메시징·실시간 관제(X-View)·요청 걸림·RUM·리포트·대시보드 위젯, 조회 자원 상한, 화면 자기설명(빈 값 이유), 기간 지정 내보내기, env 필터.

**상태** — 현행(#ZM-122). P1~P5 완주(08-31~09-28), ZM-152 자기설명·ZM-154 내보내기(09-28), UX 검수·격리 수정(10-01), c05·env 필터(10-07), 장애 및 에러 메뉴(10-10). 전부 미푸시 다수.

## 정본 문서 (moveseye-docs)
- [APM 조회와 분석(상세 가이드)](file:///C:/solutions/moveseye-docs/guides/features/APM-조회와-분석.md)
- [애플리케이션 모니터링(화면 가이드)](file:///C:/solutions/moveseye-docs/guides/pages/모니터링/애플리케이션-모니터링.md)
- [APM 화면 자기설명(기능 문서, ZM-152)](file:///C:/solutions/moveseye-docs/features/APM-화면-자기설명.md)
- [APM 데이터 내보내기(기능 문서, ZM-154)](file:///C:/solutions/moveseye-docs/features/APM-데이터-내보내기.md)
- [APM 쉽게 설명](file:///C:/solutions/moveseye-docs/overview/apm-explained.md)
- [OpenTelemetry 쉽게 설명](file:///C:/solutions/moveseye-docs/overview/opentelemetry-explained.md)
- [APM 부족점 리포트](file:///C:/solutions/moveseye-docs/overview/apm-gap-report.md)
- [APM 전반 평가(우선순위 23)](file:///C:/solutions/moveseye-docs/overview/apm-overall-assessment.md)
- [APM 우선순위별 보완 이력](file:///C:/solutions/moveseye-docs/overview/apm-priority-fixes.md)
- [APM 규모 대응 준비도](file:///C:/solutions/moveseye-docs/overview/apm-scale-readiness.md)

## 설계·기획 (_workspace)
- [devdesign_apm(v3.1 정본)](file:///C:/solutions/_workspace/features/apm/core/devdesign_apm.md)
- [devdesign_apm-screens-wbs](file:///C:/solutions/_workspace/features/apm/core/devdesign_apm-screens-wbs.md)
- [devdesign_apm-service-map-v2](file:///C:/solutions/_workspace/features/apm/core/devdesign_apm-service-map-v2.md)
- [devdesign_apm-realtime](file:///C:/solutions/_workspace/features/apm/realtime/devdesign_apm-realtime.md)
- [devdesign_apm-realtime-ux](file:///C:/solutions/_workspace/features/apm/realtime/devdesign_apm-realtime-ux.md)
- [devdesign_apm-live](file:///C:/solutions/_workspace/features/apm/realtime/devdesign_apm-live.md)
- [devdesign_apm-live-active-extension](file:///C:/solutions/_workspace/features/apm/realtime/devdesign_apm-live-active-extension.md)
- [devdesign_apm-dashboards](file:///C:/solutions/_workspace/features/apm/dashboards/devdesign_apm-dashboards.md)
- [devdesign_apm-data-export](file:///C:/solutions/_workspace/features/apm/data-export/devdesign_apm-data-export.md)
- [apm-query-controls-20261006](file:///C:/solutions/_workspace/features/apm/hardening-20261006/apm-query-controls-20261006.md)
- [apm-incidents-menu-20261008](file:///C:/solutions/_workspace/features/apm/alerts/apm-incidents-menu-20261008.md)
- [backlog_apm-comprehension-and-ai](file:///C:/solutions/_workspace/features/apm/backlog/backlog_apm-comprehension-and-ai.md)
- [issue_apm-raw-text-exposure](file:///C:/solutions/_workspace/features/apm/backlog/issue_apm-raw-text-exposure.md)
- [APM 파이프라인 도식(archify)](file:///C:/solutions/_workspace/features/apm/core/diagram_apm-pipeline.html)
- [arch_apm-otel-pipeline.html](file:///C:/solutions/_workspace/features/apm/core/arch_apm-otel-pipeline.html)

## 계약 (_workspace/contract_*)
- [contract_apm(종합)](file:///C:/solutions/_workspace/features/apm/core/contract_apm.md)
- [contract_apm-read-api](file:///C:/solutions/_workspace/features/apm/core/contract_apm-read-api.md)
- [contract_apm-p3](file:///C:/solutions/_workspace/features/apm/core/contract_apm-p3.md)
- [contract_apm-p4](file:///C:/solutions/_workspace/features/apm/core/contract_apm-p4.md)
- [contract_apm-p5-live](file:///C:/solutions/_workspace/features/apm/realtime/contract_apm-p5-live.md)
- [contract_apm-dashboards](file:///C:/solutions/_workspace/features/apm/dashboards/contract_apm-dashboards.md)
- [contract_apm-data-export](file:///C:/solutions/_workspace/features/apm/data-export/contract_apm-data-export.md)
- [contract_apm-query-controls-20261006](file:///C:/solutions/_workspace/features/apm/hardening-20261006/contract_apm-query-controls-20261006.md)
- [contract_apm-query-resource-limits](file:///C:/solutions/_workspace/features/apm/hardening-20261006/contract_apm-query-resource-limits.md)
- [contract_zm-152-self-explain-be](file:///C:/solutions/_workspace/features/apm/self-explain/contract_zm-152-self-explain-be.md)
- [contract_apm-raw-text-policy-20261006](file:///C:/solutions/_workspace/features/apm/hardening-20261006/contract_apm-raw-text-policy-20261006.md)

## 보고·검수·QA 증거
- [zm-152_screen-self-explaining](file:///C:/solutions/_workspace/features/apm/self-explain/zm-152_screen-self-explaining.md)
- [zm-152_be-self-explain](file:///C:/solutions/_workspace/features/apm/self-explain/zm-152_be-self-explain.md)
- [zm-152_fe-contract-integration](file:///C:/solutions/_workspace/features/apm/self-explain/zm-152_fe-contract-integration.md)
- [zm-154_apm-data-export(BE)](file:///C:/solutions/_workspace/features/apm/data-export/zm-154_apm-data-export.md)
- [zm-154_apm-data-export-fe](file:///C:/solutions/_workspace/features/apm/data-export/zm-154_apm-data-export-fe.md)
- [zm-154_be-followup](file:///C:/solutions/_workspace/features/apm/data-export/zm-154_be-followup.md)
- [zm-154_fe-followup](file:///C:/solutions/_workspace/features/apm/data-export/zm-154_fe-followup.md)
- [zm-152-154-156_runtime-check](file:///C:/solutions/_workspace/planning/sprint-zm-151-156/zm-152-154-156_runtime-check.md)
- [review_apm-p1·p1-r2·p1-r3](file:///C:/solutions/_workspace/features/apm/core/review_apm-p1.md)
- [review_apm-p2-w1~w3](file:///C:/solutions/_workspace/features/apm/core/review_apm-p2-w1.md)
- [review_apm-p3-w1~w3](file:///C:/solutions/_workspace/features/apm/core/review_apm-p3-w1.md)
- [review_apm-p4-be/fe](file:///C:/solutions/_workspace/features/apm/core/review_apm-p4-be_claude.md)
- [review_apm-p51~p56](file:///C:/solutions/_workspace/features/apm/realtime/review_apm-p51-s1-be_claude.md)
- [review_apm-realtime-design r1~r3b](file:///C:/solutions/_workspace/features/apm/realtime/review_apm-realtime-design_claude-r1.md)
- [review_apm-realtime-ux](file:///C:/solutions/_workspace/features/apm/realtime/review_apm-realtime-ux_claude-r1.md)
- [review_apm-query-controls-be/fe](file:///C:/solutions/_workspace/features/apm/hardening-20261006/review_apm-query-controls-be-20261007.md)
- [review_apm-incidents-menu-be/fe](file:///C:/solutions/_workspace/features/apm/alerts/review_apm-incidents-menu-be-20261008.md)
- [review_apm-c05-followup](file:///C:/solutions/_workspace/features/apm/hardening-20261006/review_apm-c05-followup-20261007.md)
- [review_zm-152-be/fe](file:///C:/solutions/_workspace/features/apm/self-explain/review_zm-152-be-self-explain.md)
- [review_zm-154-be/fe](file:///C:/solutions/_workspace/features/apm/data-export/review_zm-154-be-followup.md)
- [review_apm-live-stream-props](file:///C:/solutions/_workspace/features/apm/realtime/review_apm-live-stream-props.md)

## 경험 노트 (Vault)
[[2026-08-26-apm-design]] · [[2026-08-31-apm-p1-implementation]] · [[2026-09-02-apm-p2-traces]] · [[2026-09-15-apm-dashboards]] · [[2026-09-23-apm-p5-realtime]] · [[2026-10-01-apm-ux-review]] · [[2026-10-01-apm-ux-isolated-fix]] · [[2026-10-07-apm-remaining-work-priorities]] · [[2026-10-10-apm-incidents-menu]] · [[2026-10-12-apm-daily-users-ip-hash]] · [[2026-09-22-zm151-156-backlog-sprint]] · [[2026-09-15-apm-confluence-guide]] · [[2026-10-05-documentation-apm-overview]] · [[2026-10-06-apm-overall-review]] · [[2026-09-16-apm-observability-backlogs]]

## 열린 항목
- 152·154 v2 런타임 실측(재기동 + 임시 계정)
- 원문 노출 틈 티켓(`issue_apm-raw-text-exposure.md`)
- 오늘 사용자 수(IP 해시) 보류
- 출시 게이트 R2′ CPU 재측·SharedWorker 결정

## 이웃 영역
[[apm-수집과-운영]] · [[홈과-공통-화면-틀]] · [[AI-어시스턴트와-MCP]]
