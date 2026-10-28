---
type: feature-map
tags: [moveseye, feature-map, zabbix, operations, discovery, coverage]
updated: 2026-10-28
---

# Zabbix 운영 관리 — 알림 액션·미디어·점검 기간·스크립트·디스커버리·커버리지·래핑 범위

> 기능 지도 [[무브스아이-기능-지도]] · 허브 [[moveseye]] · 링크는 `C:\solutions` 로컬 파일(file://)이라 이 PC에서만 열린다. 읽기용 사본은 [[2026-10-07-docs-reading-repo]].

**한 줄** — 알림 관리(액션·미디어 타입·점검 기간·스크립트), 네트워크 디스커버리, 사용자 알림 수신처, 구성 현황, 모니터링 커버리지(AI 분석), 래핑 범위(지원·미지원 목록).

**상태** — 현행. Zabbix 래핑 잔여 7건 완주(08-19)·커버리지 API(08-21). **프록시·프록시 그룹 관리 구현 중**(10-28, 미커밋 — 검수·실측 대기).

## 정본 문서 (moveseye-docs)
- [Zabbix 운영 관리(상세 가이드)](file:///C:/solutions/moveseye-docs/guides/features/Zabbix-운영-관리.md)
- [데이터 소스 관리](file:///C:/solutions/moveseye-docs/guides/pages/설정/데이터-소스-관리.md)

## 설계·기획 (_workspace)
- [devdesign_discovery](file:///C:/solutions/_workspace/features/zabbix-ops/discovery/devdesign_discovery.md)
- [devdesign_alert-management](file:///C:/solutions/_workspace/features/zabbix-ops/alert-actions-media/devdesign_alert-management.md)
- [tasks_zabbix-proxy-management](file:///C:/solutions/_workspace/features/zabbix-ops/proxy-management/tasks_zabbix-proxy-management.md)

## 계약 (_workspace/contract_*)
- [contract_discovery](file:///C:/solutions/_workspace/features/zabbix-ops/discovery/contract_discovery.md)
- [contract_maintenance](file:///C:/solutions/_workspace/features/zabbix-ops/alert-actions-media/contract_maintenance.md)
- [contract_script](file:///C:/solutions/_workspace/features/zabbix-ops/alert-actions-media/contract_script.md)
- [contract_user-media](file:///C:/solutions/_workspace/features/zabbix-ops/alert-actions-media/contract_user-media.md)
- [contract_monitoring-coverage](file:///C:/solutions/_workspace/features/zabbix-ops/monitoring-coverage/contract_monitoring-coverage.md)
- [contract_alert-management](file:///C:/solutions/_workspace/features/zabbix-ops/alert-actions-media/contract_alert-management.md)
- [contract_proxy](file:///C:/solutions/_workspace/features/zabbix-config/proxy/contract_proxy.md) — 프록시·프록시 그룹(10-28, §0 Zabbix 7.0 실측표)

## 보고·검수·QA 증거
- [review_discovery-design](file:///C:/solutions/_workspace/features/zabbix-ops/discovery/review_discovery-design.md)
- [review_discovery-design-v2](file:///C:/solutions/_workspace/features/zabbix-ops/discovery/review_discovery-design-v2.md)
- [review_proxy-be](file:///C:/solutions/_workspace/features/zabbix-config/proxy/review_proxy-be.md) · [review_proxy-fe](file:///C:/solutions/_workspace/features/zabbix-config/proxy/review_proxy-fe.md)

## 경험 노트 (Vault)
[[2026-08-19-zabbix-wrapping-and-event-alert]] · [[2026-10-28-zabbix-proxy-management]] · [[2026-08-21-monitoring-coverage-api]] · [[2026-08-21-monitoring-coverage-runtime-qa]] · [[zabbix-api-quirks]] · [[zabbix-api-auth]]

## 열린 항목
- Zabbix 래핑 커버리지 후순위 목록(메모리 `zabbix-wrapper-gaps`)
- 커버리지 후속: 조치 링크·AI 권장 조치 구조화·Prometheus 소스

## 이웃 영역
[[Zabbix-구성-관리]] · [[이벤트와-알림]]
