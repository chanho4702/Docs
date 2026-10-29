---
name: zabbix-web-scenario-mgmt
description: "2026-10-27 Zabbix 관리 > Web 시나리오(유료 Feature WEB_SCENARIO) 구현 — APM 합성 감시와 코드 분리, 계약·검수 경과, 커밋 대기"
metadata:
  node_type: memory
  type: project
  originSessionId: eee4683d-0280-4673-9a67-5cecb7771b95
  modified: 2026-10-27T05:30:48.586Z
---

2026-10-27 Zabbix 관리 > **Web 시나리오** 페이지(`/zabbix-manage/web-scenarios`, FE `/zabbix-management/web-scenario-management`) 구현. 계약 `_workspace/features/zabbix-config/web-scenario/contract_web-scenario.md`.
**ZM-175**(사용자 지정, ZM-93 래핑 티켓과 분리). master 병합·푸시: BE `21358d8` · FE `edf667c` · 발급기 `44bb3e0`. 워크트리 정리 완료.

- **사용자 결정**: APM은 나중에 별도 제품으로 뺀다 → Web 시나리오는 **Zabbix만 제공하는 페이지를 따로**, **유료**. 새 Feature `WEB_SCENARIO`(PREMIUM 기본 포함, BE·발급기 Feature/Edition 동일 사본). `zabbixadmin/`에 두고 `premium.apm..` import 금지.
- 🔴 변경 이력에는 값을 남기지 않는다(프록시 `user:pass@`·헤더·변수·본문·URL 쿼리) — 이름·스칼라만, 소속은 `hostid` 키(호스트별 이력 조회가 읽는 키). 상세 응답은 폼 round-trip 때문에 원문(관리자+유료).
- 🔴 단계 `httpstepid` 보존(빠지면 이력 끊김) — 이름으로 되붙이고 짝 없으면 `is_new` 필수. FE 폼은 열 때 한 번만 채운다(재조회가 편집 중 값을 덮던 반려).
- 🔴 대상 필터는 선택 상자 **하나**(호스트·템플릿·그룹 묶음). 공용 `DmoveTableFilter`의 Select는 `defaultValue`라 URL만 지우면 화면에 남는다 — 사용자 결정.
- 엔진 `ZabbixHttpTestService.countRaw` 추가. 최근 결과 = `web.test.fail`(실패 단계 번호)·`web.test.error`, 키 인용은 Zabbix `quoteItemKeyParam`과 같게.
- 검수: BE 반려→조건부 승인, FE 반려→반려(2회, 사용자에게 물음)→승인.
- 2026-10-27 런타임 실측 통과(생성·수정·단계 id 유지·거부 코드·템플릿·이력 비밀값 0·정리). 🟡 dev의 zabbix-server 호스트 시나리오는 결과가 안 들어옴(기존 8건도 UNKNOWN — 환경 쪽).
- AI 화면 카탈로그 등록 완료(`screens.json` id `zabbix-web-scenario`, AI `f9aa53d`, 64화면). AI 서버 재기동해야 반영.

**Why:** 사용자가 Web 시나리오를 APM과 분리된 유료 기능으로 지정(2026-10-27).
**How to apply:** 이어서 작업할 때 위 워크트리·계약서부터. 관련 [[zabbix-graph-mgmt]] · [[zabbix-wrapper-gaps]] · [[premium-license-design]] · [[review-loop-stop-rule]].
