---
type: feature-map
tags: [moveseye, feature-map, zabbix, config, host, template]
updated: 2026-10-28
---

# Zabbix 구성 관리 — 호스트·템플릿·아이템·트리거·LLD·매크로·분류·태그·등록·에이전트 설치

> 기능 지도 [[무브스아이-기능-지도]] · 허브 [[moveseye]] · 링크는 `C:\solutions` 로컬 파일(file://)이라 이 PC에서만 열린다. 읽기용 사본은 [[2026-10-07-docs-reading-repo]].

**한 줄** — 호스트·호스트 그룹·템플릿·아이템·트리거·LLD·매크로 관리(완전 컨테이너 드릴다운 IA), 분류·태그, 기기분류(DB 관리형), 호스트 등록(첫 Zabbix 쓰기)·중복 이름 안내, 에이전트 설치 가이드, 구성 현황·변경 이력.

**상태** — 현행. ZM-86 묶음(07-22)·호스트 등록(07-18)·ZM-166(09-22). 래핑 원칙: 첫 질문은 "Zabbix에 있나?".

## 정본 문서 (moveseye-docs)
- [Zabbix 구성 관리(상세 가이드)](file:///C:/solutions/moveseye-docs/guides/features/Zabbix-구성-관리.md)
- [호스트 관리](file:///C:/solutions/moveseye-docs/guides/pages/Zabbix-관리/호스트-관리.md)
- [템플릿 관리](file:///C:/solutions/moveseye-docs/guides/pages/Zabbix-관리/템플릿-관리.md)
- [아이템 관리](file:///C:/solutions/moveseye-docs/guides/pages/Zabbix-관리/아이템-관리.md)
- [트리거 관리](file:///C:/solutions/moveseye-docs/guides/pages/Zabbix-관리/트리거-관리.md)
- [기기분류 관리](file:///C:/solutions/moveseye-docs/guides/pages/설정/기기분류-관리.md)
- [수집기(에이전트) 설치](file:///C:/solutions/moveseye-docs/guides/pages/모니터링/수집기-설치.md)

## 설계·기획 (_workspace)
- [design_trigger-mgmt](file:///C:/solutions/_workspace/features/zabbix-config/trigger-mgmt/design_trigger-mgmt.md)
- [design_config-mgmt-restructure](file:///C:/solutions/_workspace/features/zabbix-config/drilldown-restructure/design_config-mgmt-restructure.md)
- [design_device-classification](file:///C:/solutions/_workspace/features/zabbix-config/classification-tags/design_device-classification.md)
- [design_drilldown-restructure](file:///C:/solutions/_workspace/features/events/lld-management/design_drilldown-restructure.md)
- [devdesign_host-registration](file:///C:/solutions/_workspace/features/zabbix-config/host-registration/devdesign_host-registration.md)
- [devdesign_agent-install-guide](file:///C:/solutions/_workspace/features/zabbix-config/agent-install-guide/devdesign_agent-install-guide.md)
- [devdesign_zabbix-config-overview](file:///C:/solutions/_workspace/features/zabbix-config/config-overview/devdesign_zabbix-config-overview.md)

## 계약 (_workspace/contract_*)
- [contract_item-template-mgmt](file:///C:/solutions/_workspace/features/zabbix-config/item-template-mgmt/contract_item-template-mgmt.md)
- [contract_trigger-mgmt](file:///C:/solutions/_workspace/features/zabbix-config/trigger-mgmt/contract_trigger-mgmt.md)
- [contract_host-classification-tags](file:///C:/solutions/_workspace/features/zabbix-config/classification-tags/contract_host-classification-tags.md)
- [contract_device-classification](file:///C:/solutions/_workspace/features/zabbix-config/classification-tags/contract_device-classification.md)
- [contract_host-registration](file:///C:/solutions/_workspace/features/zabbix-config/host-registration/contract_host-registration.md)
- [contract_macro](file:///C:/solutions/_workspace/features/zabbix-config/macro/contract_macro.md)
- [contract_zabbix-overview](file:///C:/solutions/_workspace/features/zabbix-config/config-overview/contract_zabbix-overview.md)
- [contract_web-scenario](file:///C:/solutions/_workspace/features/zabbix-config/web-scenario/contract_web-scenario.md) — Web 시나리오(유료 WEB_SCENARIO, 10-27)
- [contract_zabbix-managed-marker](file:///C:/solutions/_workspace/features/zabbix-config/managed-marker/contract_zabbix-managed-marker.md)

## 보고·검수·QA 증거
- [review_host-duplicate-name](file:///C:/solutions/_workspace/features/zabbix-config/host-registration/review_host-duplicate-name.md)
- [review_zabbix-config-overview](file:///C:/solutions/_workspace/features/zabbix-config/config-overview/review_zabbix-config-overview.md)
- [review_agent-install-guide](file:///C:/solutions/_workspace/features/zabbix-config/agent-install-guide/review_agent-install-guide.md)

## 경험 노트 (Vault)
[[2026-07-18-host-registration]] · [[2026-07-22-zabbix-usability-menus]] · [[2026-09-22-zm166-host-duplicate-name]] · [[2026-08-19-zabbix-wrapping-and-event-alert]] · [[2026-06-02-zabbix-sync-audit]] · [[zabbix-api-reference]] · [[zabbix-admin-manual-nexen]] · [[zabbix-api-quirks]] · [[zabbix-agent-item-keys]] · [[2026-10-27-zm175-zabbix-web-scenario]]

## 열린 항목
- Zabbix 구성 드릴다운 재구성(A안) 미커밋
- 액션 filter round-trip: get 응답 되돌리면 -32602

## 이웃 영역
[[Zabbix-운영-관리]] · [[인프라-모니터링]] · [[자산과-비용]]
