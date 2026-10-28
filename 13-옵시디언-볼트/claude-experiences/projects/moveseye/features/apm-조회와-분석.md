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
- [APM 조회와 분석(상세 가이드)](../../agent-documents/sources/solutions/moveseye-docs/guides/features/solutions--APM-%EC%A1%B0%ED%9A%8C%EC%99%80-%EB%B6%84%EC%84%9D.md)
- [애플리케이션 모니터링(화면 가이드)](../../agent-documents/sources/solutions/moveseye-docs/guides/pages/%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81/solutions--%EC%95%A0%ED%94%8C%EB%A6%AC%EC%BC%80%EC%9D%B4%EC%85%98-%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81.md)
- [APM 화면 자기설명(기능 문서, ZM-152)](../../agent-documents/sources/solutions/moveseye-docs/features/solutions--APM-%ED%99%94%EB%A9%B4-%EC%9E%90%EA%B8%B0%EC%84%A4%EB%AA%85.md)
- [APM 데이터 내보내기(기능 문서, ZM-154)](../../agent-documents/sources/solutions/moveseye-docs/features/solutions--APM-%EB%8D%B0%EC%9D%B4%ED%84%B0-%EB%82%B4%EB%B3%B4%EB%82%B4%EA%B8%B0.md)
- [APM 쉽게 설명](../../agent-documents/sources/solutions/moveseye-docs/overview/solutions--apm-explained.md)
- [OpenTelemetry 쉽게 설명](../../agent-documents/sources/solutions/moveseye-docs/overview/solutions--opentelemetry-explained.md)
- [APM 부족점 리포트](../../agent-documents/sources/solutions/moveseye-docs/overview/solutions--apm-gap-report.md)
- [APM 전반 평가(우선순위 23)](../../agent-documents/sources/solutions/moveseye-docs/overview/solutions--apm-overall-assessment.md)
- [APM 우선순위별 보완 이력](../../agent-documents/sources/solutions/moveseye-docs/overview/solutions--apm-priority-fixes.md)
- [APM 규모 대응 준비도](../../agent-documents/sources/solutions/moveseye-docs/overview/solutions--apm-scale-readiness.md)

## 설계·기획 (_workspace)
- [devdesign_apm(v3.1 정본)](../../agent-documents/sources/solutions/_workspace/features/apm/core/solutions--devdesign_apm.md)
- [devdesign_apm-screens-wbs](../../agent-documents/sources/solutions/_workspace/features/apm/core/solutions--devdesign_apm-screens-wbs.md)
- [devdesign_apm-service-map-v2](../../agent-documents/sources/solutions/_workspace/features/apm/core/solutions--devdesign_apm-service-map-v2.md)
- [devdesign_apm-realtime](../../agent-documents/sources/solutions/_workspace/features/apm/realtime/solutions--devdesign_apm-realtime.md)
- [devdesign_apm-realtime-ux](../../agent-documents/sources/solutions/_workspace/features/apm/realtime/solutions--devdesign_apm-realtime-ux.md)
- [devdesign_apm-live](../../agent-documents/sources/solutions/_workspace/features/apm/realtime/solutions--devdesign_apm-live.md)
- [devdesign_apm-live-active-extension](../../agent-documents/sources/solutions/_workspace/features/apm/realtime/solutions--devdesign_apm-live-active-extension.md)
- [devdesign_apm-dashboards](../../agent-documents/sources/solutions/_workspace/features/apm/dashboards/solutions--devdesign_apm-dashboards.md)
- [devdesign_apm-data-export](../../agent-documents/sources/solutions/_workspace/features/apm/data-export/solutions--devdesign_apm-data-export.md)
- [apm-query-controls-20261006](../../agent-documents/sources/solutions/_workspace/features/apm/hardening-20261006/solutions--apm-query-controls-20261006.md)
- [apm-incidents-menu-20261008](../../agent-documents/sources/solutions/_workspace/features/apm/alerts/solutions--apm-incidents-menu-20261008.md)
- [backlog_apm-comprehension-and-ai](../../agent-documents/sources/solutions/_workspace/features/apm/backlog/solutions--backlog_apm-comprehension-and-ai.md)
- [issue_apm-raw-text-exposure](../../agent-documents/sources/solutions/_workspace/features/apm/backlog/solutions--issue_apm-raw-text-exposure.md)
- [APM 파이프라인 도식(archify)](../../agent-documents/sources/solutions/_workspace/features/apm/core/diagram_apm-pipeline.html)
- [arch_apm-otel-pipeline.html](../../agent-documents/sources/solutions/_workspace/features/apm/core/arch_apm-otel-pipeline.html)

## 계약 (_workspace/contract_*)
- [contract_apm(종합)](../../agent-documents/sources/solutions/_workspace/features/apm/core/solutions--contract_apm.md)
- [contract_apm-read-api](../../agent-documents/sources/solutions/_workspace/features/apm/core/solutions--contract_apm-read-api.md)
- [contract_apm-p3](../../agent-documents/sources/solutions/_workspace/features/apm/core/solutions--contract_apm-p3.md)
- [contract_apm-p4](../../agent-documents/sources/solutions/_workspace/features/apm/core/solutions--contract_apm-p4.md)
- [contract_apm-p5-live](../../agent-documents/sources/solutions/_workspace/features/apm/realtime/solutions--contract_apm-p5-live.md)
- [contract_apm-dashboards](../../agent-documents/sources/solutions/_workspace/features/apm/dashboards/solutions--contract_apm-dashboards.md)
- [contract_apm-data-export](../../agent-documents/sources/solutions/_workspace/features/apm/data-export/solutions--contract_apm-data-export.md)
- [contract_apm-query-controls-20261006](../../agent-documents/sources/solutions/_workspace/features/apm/hardening-20261006/solutions--contract_apm-query-controls-20261006.md)
- [contract_apm-query-resource-limits](../../agent-documents/sources/solutions/_workspace/features/apm/hardening-20261006/solutions--contract_apm-query-resource-limits.md)
- [contract_zm-152-self-explain-be](../../agent-documents/sources/solutions/_workspace/features/apm/self-explain/solutions--contract_zm-152-self-explain-be.md)
- [contract_apm-raw-text-policy-20261006](../../agent-documents/sources/solutions/_workspace/features/apm/hardening-20261006/solutions--contract_apm-raw-text-policy-20261006.md)

## 보고·검수·QA 증거
- [zm-152_screen-self-explaining](../../agent-documents/sources/solutions/_workspace/features/apm/self-explain/solutions--zm-152_screen-self-explaining.md)
- [zm-152_be-self-explain](../../agent-documents/sources/solutions/_workspace/features/apm/self-explain/solutions--zm-152_be-self-explain.md)
- [zm-152_fe-contract-integration](../../agent-documents/sources/solutions/_workspace/features/apm/self-explain/solutions--zm-152_fe-contract-integration.md)
- [zm-154_apm-data-export(BE)](../../agent-documents/sources/solutions/_workspace/features/apm/data-export/solutions--zm-154_apm-data-export.md)
- [zm-154_apm-data-export-fe](../../agent-documents/sources/solutions/_workspace/features/apm/data-export/solutions--zm-154_apm-data-export-fe.md)
- [zm-154_be-followup](../../agent-documents/sources/solutions/_workspace/features/apm/data-export/solutions--zm-154_be-followup.md)
- [zm-154_fe-followup](../../agent-documents/sources/solutions/_workspace/features/apm/data-export/solutions--zm-154_fe-followup.md)
- [zm-152-154-156_runtime-check](../../agent-documents/sources/solutions/_workspace/planning/sprint-zm-151-156/solutions--zm-152-154-156_runtime-check.md)
- [review_apm-p1·p1-r2·p1-r3](../../agent-documents/sources/solutions/_workspace/features/apm/core/solutions--review_apm-p1.md)
- [review_apm-p2-w1~w3](../../agent-documents/sources/solutions/_workspace/features/apm/core/solutions--review_apm-p2-w1.md)
- [review_apm-p3-w1~w3](../../agent-documents/sources/solutions/_workspace/features/apm/core/solutions--review_apm-p3-w1.md)
- [review_apm-p4-be/fe](../../agent-documents/sources/solutions/_workspace/features/apm/core/solutions--review_apm-p4-be_claude.md)
- [review_apm-p51~p56](../../agent-documents/sources/solutions/_workspace/features/apm/realtime/solutions--review_apm-p51-s1-be_claude.md)
- [review_apm-realtime-design r1~r3b](../../agent-documents/sources/solutions/_workspace/features/apm/realtime/solutions--review_apm-realtime-design_claude-r1.md)
- [review_apm-realtime-ux](../../agent-documents/sources/solutions/_workspace/features/apm/realtime/solutions--review_apm-realtime-ux_claude-r1.md)
- [review_apm-query-controls-be/fe](../../agent-documents/sources/solutions/_workspace/features/apm/hardening-20261006/solutions--review_apm-query-controls-be-20261007.md)
- [review_apm-incidents-menu-be/fe](../../agent-documents/sources/solutions/_workspace/features/apm/alerts/solutions--review_apm-incidents-menu-be-20261008.md)
- [review_apm-c05-followup](../../agent-documents/sources/solutions/_workspace/features/apm/hardening-20261006/solutions--review_apm-c05-followup-20261007.md)
- [review_zm-152-be/fe](../../agent-documents/sources/solutions/_workspace/features/apm/self-explain/solutions--review_zm-152-be-self-explain.md)
- [review_zm-154-be/fe](../../agent-documents/sources/solutions/_workspace/features/apm/data-export/solutions--review_zm-154-be-followup.md)
- [review_apm-live-stream-props](../../agent-documents/sources/solutions/_workspace/features/apm/realtime/solutions--review_apm-live-stream-props.md)

## 경험 노트 (Vault)
[[2026-08-26-apm-design]] · [[2026-08-31-apm-p1-implementation]] · [[2026-09-02-apm-p2-traces]] · [[2026-09-15-apm-dashboards]] · [[2026-09-23-apm-p5-realtime]] · [[2026-10-01-apm-ux-review]] · [[2026-10-01-apm-ux-isolated-fix]] · [[2026-10-07-apm-remaining-work-priorities]] · [[2026-10-10-apm-incidents-menu]] · [[2026-10-12-apm-daily-users-ip-hash]] · [[2026-09-22-zm151-156-backlog-sprint]] · [[2026-09-15-apm-confluence-guide]] · [[2026-10-05-documentation-apm-overview]] · [[2026-10-06-apm-overall-review]] · [[2026-09-16-apm-observability-backlogs]]

## 열린 항목
- 152·154 v2 런타임 실측(재기동 + 임시 계정)
- 원문 노출 틈 티켓(`issue_apm-raw-text-exposure.md`)
- 오늘 사용자 수(IP 해시) 보류
- 출시 게이트 R2′ CPU 재측·SharedWorker 결정

## 이웃 영역
[[apm-수집과-운영]] · [[홈과-공통-화면-틀]] · [[AI-어시스턴트와-MCP]]
