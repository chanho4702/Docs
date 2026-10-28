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
- [Zabbix 구성 관리(상세 가이드)](../../agent-documents/sources/solutions/moveseye-docs/guides/features/solutions--Zabbix-%EA%B5%AC%EC%84%B1-%EA%B4%80%EB%A6%AC.md)
- [호스트 관리](../../agent-documents/sources/solutions/moveseye-docs/guides/pages/Zabbix-%EA%B4%80%EB%A6%AC/solutions--%ED%98%B8%EC%8A%A4%ED%8A%B8-%EA%B4%80%EB%A6%AC.md)
- [템플릿 관리](../../agent-documents/sources/solutions/moveseye-docs/guides/pages/Zabbix-%EA%B4%80%EB%A6%AC/solutions--%ED%85%9C%ED%94%8C%EB%A6%BF-%EA%B4%80%EB%A6%AC.md)
- [아이템 관리](../../agent-documents/sources/solutions/moveseye-docs/guides/pages/Zabbix-%EA%B4%80%EB%A6%AC/solutions--%EC%95%84%EC%9D%B4%ED%85%9C-%EA%B4%80%EB%A6%AC.md)
- [트리거 관리](../../agent-documents/sources/solutions/moveseye-docs/guides/pages/Zabbix-%EA%B4%80%EB%A6%AC/solutions--%ED%8A%B8%EB%A6%AC%EA%B1%B0-%EA%B4%80%EB%A6%AC.md)
- [기기분류 관리](../../agent-documents/sources/solutions/moveseye-docs/guides/pages/%EC%84%A4%EC%A0%95/solutions--%EA%B8%B0%EA%B8%B0%EB%B6%84%EB%A5%98-%EA%B4%80%EB%A6%AC.md)
- [수집기(에이전트) 설치](../../agent-documents/sources/solutions/moveseye-docs/guides/pages/%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81/solutions--%EC%88%98%EC%A7%91%EA%B8%B0-%EC%84%A4%EC%B9%98.md)

## 설계·기획 (_workspace)
- [design_trigger-mgmt](../../agent-documents/sources/solutions/_workspace/features/zabbix-config/trigger-mgmt/solutions--design_trigger-mgmt.md)
- [design_config-mgmt-restructure](../../agent-documents/sources/solutions/_workspace/features/zabbix-config/drilldown-restructure/solutions--design_config-mgmt-restructure.md)
- [design_device-classification](../../agent-documents/sources/solutions/_workspace/features/zabbix-config/classification-tags/solutions--design_device-classification.md)
- [design_drilldown-restructure](../../agent-documents/sources/solutions/_workspace/features/events/lld-management/solutions--design_drilldown-restructure.md)
- [devdesign_host-registration](../../agent-documents/sources/solutions/_workspace/features/zabbix-config/host-registration/solutions--devdesign_host-registration.md)
- [devdesign_agent-install-guide](../../agent-documents/sources/solutions/_workspace/features/zabbix-config/agent-install-guide/solutions--devdesign_agent-install-guide.md)
- [devdesign_zabbix-config-overview](../../agent-documents/sources/solutions/_workspace/features/zabbix-config/config-overview/solutions--devdesign_zabbix-config-overview.md)

## 계약 (_workspace/contract_*)
- [contract_item-template-mgmt](../../agent-documents/sources/solutions/_workspace/features/zabbix-config/item-template-mgmt/solutions--contract_item-template-mgmt.md)
- [contract_trigger-mgmt](../../agent-documents/sources/solutions/_workspace/features/zabbix-config/trigger-mgmt/solutions--contract_trigger-mgmt.md)
- [contract_host-classification-tags](../../agent-documents/sources/solutions/_workspace/features/zabbix-config/classification-tags/solutions--contract_host-classification-tags.md)
- [contract_device-classification](../../agent-documents/sources/solutions/_workspace/features/zabbix-config/classification-tags/solutions--contract_device-classification.md)
- [contract_host-registration](../../agent-documents/sources/solutions/_workspace/features/zabbix-config/host-registration/solutions--contract_host-registration.md)
- [contract_macro](../../agent-documents/sources/solutions/_workspace/features/zabbix-config/macro/solutions--contract_macro.md)
- [contract_zabbix-overview](../../agent-documents/sources/solutions/_workspace/features/zabbix-config/config-overview/solutions--contract_zabbix-overview.md)
- [contract_web-scenario](../../agent-documents/sources/solutions/_workspace/features/zabbix-config/web-scenario/solutions--contract_web-scenario.md) — Web 시나리오(유료 WEB_SCENARIO, 10-27)
- [contract_zabbix-managed-marker](../../agent-documents/sources/solutions/_workspace/features/zabbix-config/managed-marker/solutions--contract_zabbix-managed-marker.md)

## 보고·검수·QA 증거
- [review_host-duplicate-name](../../agent-documents/sources/solutions/_workspace/features/zabbix-config/host-registration/solutions--review_host-duplicate-name.md)
- [review_zabbix-config-overview](../../agent-documents/sources/solutions/_workspace/features/zabbix-config/config-overview/solutions--review_zabbix-config-overview.md)
- [review_agent-install-guide](../../agent-documents/sources/solutions/_workspace/features/zabbix-config/agent-install-guide/solutions--review_agent-install-guide.md)

## 경험 노트 (Vault)
[[2026-07-18-host-registration]] · [[2026-07-22-zabbix-usability-menus]] · [[2026-09-22-zm166-host-duplicate-name]] · [[2026-08-19-zabbix-wrapping-and-event-alert]] · [[2026-06-02-zabbix-sync-audit]] · [[zabbix-api-reference]] · [[zabbix-admin-manual-nexen]] · [[zabbix-api-quirks]] · [[zabbix-agent-item-keys]] · [[2026-10-27-zm175-zabbix-web-scenario]]

## 열린 항목
- Zabbix 구성 드릴다운 재구성(A안) 미커밋
- 액션 filter round-trip: get 응답 되돌리면 -32602

## 이웃 영역
[[Zabbix-운영-관리]] · [[인프라-모니터링]] · [[자산과-비용]]
