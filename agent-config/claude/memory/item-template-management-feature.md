---
name: item-template-management-feature
description: "2026-07-20 Zabbix 아이템·템플릿·템플릿그룹 관리 화면 풀스택+키선택기 구현+QA 완료(미커밋). link=host.massadd, -32602 검증실패 401→400 분기, navigate 리마운트 리버트 교훈"
metadata: 
  node_type: memory
  type: project
  originSessionId: 33321b81-2ae8-4894-a5d0-7b7450e47a64
  modified: 2026-07-21T01:36:59.547Z
---

2026-07-20 "Zabbix 관리 > 아이템·템플릿 관리" 신규 화면(메뉴 1개 + 탭 2개) 풀스택 구현+QA 완료. **미커밋**. 범위=양쪽 다 전체 CRUD.

**최종 UX 구조(사용자 피드백 2회 반영):** 초안=탭2(아이템 탭에 호스트/템플릿 스코프 토글)→사용자가 토글 어색 지적→템플릿 중심 드릴다운(아이템 CRUD를 템플릿 상세 안으로)→사용자가 "아이템 생성이 안 보인다"→**최종=탭2 재분리하되 스코프 토글 없이**. 탭1 "아이템 생성 및 관리"=상단 대상 템플릿 단일 Select→그 템플릿 아이템 목록+[+아이템 생성] 상단 1급 액션(드릴다운에 숨기지 말 것)/수정/상태토글/다건삭제. 탭2 "템플릿 관리"=템플릿 목록 CRUD + [관리] 드릴다운(TemplateDetailDrawer: 메타 수정/삭제 + 호스트 link/unlink, 아이템 CRUD는 탭1로 이관). **핵심 교훈: Zabbix 아이템은 템플릿/호스트에 종속 생성(독립 아이템·재할당 API 없음)이라 "아이템 생성"은 항상 대상 템플릿 선택이 선행. 그래도 진입점은 아이템 탭 전면에 둬야 발견성이 산다.** 호스트 직접 아이템 관리는 최종 제거(상속이 정석이라 예외적).

**BE (moveseye-be-spring):** 신규 패키지 `com.dmove.moveseye.zabbix.manage.*` — 컨트롤러 2(`ZabbixItemManageController`/`ZabbixTemplateManageController`), 경로 `/zabbix-manage/**` 14개 EP(아이템 CRUD 6 + 템플릿 CRUD/link/unlink 7 + template-groups 1). 감사로그 범용 테이블 `zabbix_change_log`(Flyway **V12**, entity_type ITEM/TEMPLATE, host_change_log V11과 동일 철학). 권한=`AdminAccessChecker.requireAdmin`(userRole, [[be-dual-maintenance]] §2 순수 admin roleid=null 함정 회피).

**FE (moveseyee_fe):** `types/services/hooks/pages/zabbix-management/item-template-management/*`. queryKey `ITEM_TEMPLATE_QUERY_KEY`(HOST_MANAGE와 분리). 메뉴는 기존 호스트관리와 동일 `isSuperRole` 조건. 아이템 탭은 무스코프 조회 금지 — hostid|templateid 스코프 필수 UI.

**교훈 1 (HIGH, BE):** 템플릿↔호스트 **link/unlink는 전부 host-side로 통일**해야 실 Zabbix에서 실제 반영된다. link=`host.massadd`(hosts+templates, 기존 연결 유지하며 추가). **unlink(clear=false)=`host.massremove`(hosts+templateids)**. template-side(`template.massadd`/`template.massremove`)는 hosts 조합에서 -32602 거부(link)거나 **HTTP 200 no-op(unlink clear=false — 200인데 링크 안 끊김, BUG-3)**이라 쓰면 안 됨. clear=true unlink만 예외로 `host.update{templates_clear}`(상속 엔티티까지 삭제). 즉 link=host.massadd / unlink clear=false=host.massremove / unlink clear=true=host.update templates_clear.

**교훈 2 (MEDIUM, BE, 회귀주의):** `ZabbixClient`가 Zabbix `-32602`/`-32500`을 무조건 INVALID_TOKEN(HTTP 401)로 매핑하던 기존 거동 → 중복키 등 **파라미터 검증실패도 -32602**라서 단순 검증에러가 401로 나가 FE가 무의미한 토큰 refresh/로그아웃 루프. 수정: `isAuthError(data,message)` 마커 분기 — 인증/권한성 메시지(not authori/no permission/session terminated/re-login 등)만 401 유지([[disk-detail-item-family-fallback]] 아닌 CLAUDE.md #9 제한계정 No permissions→401 보존), 그 외 -32602/-32500 검증실패는 HTTP 200 + code:400 + Zabbix 원문. 공용 ZabbixClient라 읽기 경로 회귀 주의했고 테스트로 확인.

**QA 결과:** integration-qa 정적 PASS(HIGH/MED 0). functional-qa 실 Zabbix E2E에서 버그 3건 발견→BE 수정→재검증 전부 PASS. BUG-1(link template.massadd 거부), BUG-2(-32602 검증실패 401 오매핑), BUG-3(unlink clear=false no-op) 모두 host-side 통일·마커 분기로 해소. link 감사로그 LINK/UNLINK 적재·중복키 400·unlink 후 linkedHosts=[] 실측 확인. QA_E2E_ 접두 산출물 전량 클린업(잔여 0, baseline 153 복귀). 계약서 `_workspace/features/zabbix-config/item-template-mgmt/contract_item-template-mgmt.md`, QA `_workspace/qa_·e2e_item-template-mgmt.md`.

**후속 확장(같은 2026-07-20 세션, 사용자 추가 요청):**
- **탭3 "템플릿 그룹" 관리** 추가(전체 CRUD). BE `ZabbixTemplateGroupManageController`, 관리목록은 `GET /zabbix-manage/template-groups/list`(PagedListDto+templateCount)로 **신규 분리** — 기존 select용 `GET /template-groups`(폼 드롭다운, TemplateGroupRefDto[])는 계약 보존 위해 불변 존치(HTTP메서드/literal-vs-pathvar로 충돌 회피). 감사로그 entity_type=TEMPLATE_GROUP(V12 VARCHAR 자유문자열이라 스키마 변경 없음). 삭제 거부(비어있지 않은/마지막 그룹)는 -32602→code:400+원문 노출.
- **아이템 키 선택기/자동완성**(사용자: "Zabbix UI의 key Select 버튼 같은 거"). 핵심 사실: **Zabbix web UI의 key Select 팝업은 API가 아니라 프론트엔드 내장 정적 카탈로그**(item.get 등으로 못 가져옴). 재현책=FE에 카탈로그 내장 + KeyCatalogModal. 보완축=`GET /zabbix-manage/items/keys?templateid|hostid&search`(신규, 스코프의 기존 key_ 제안, ItemKeyDto{key,name,type}).
  - **최종 UX(사용자 2차 피드백 "모달로, 잘 안보인다")**: AutoComplete 드롭다운 제거 → key 필드 옆 [키 선택] 버튼 → **KeyCatalogModal**(탭2: "이 대상의 기존 키"(useItemKeys 조회)/"키 카탈로그"). 자유입력은 Input 유지.
  - **카탈로그=Zabbix 7.0 전체(사용자 제공 원문)**: `src/constants/zabbix-item-keys.ts`(구 zabbix-agent-keys.ts 삭제·일반화), `TZabbixItemKey={key,name,types:number[]}` **274개**. 타입 매핑: 에이전트0/액티브7(공통키 [0,7], 액티브전용 eventlog·log·logrt·mqtt는 [7])/간단검사3(icmp·net서비스·VMware119)/SNMP트랩17/내장5(zabbix[*] 40)/DB모니터11/IPMI12/JMX16. 모달에 **아이템 종류 드롭다운**(폼 type 기본)으로 "종류→키목록" 재현, 60개 표시상한. **"Zabbix 7.0 기준" 태그** 명시. 소스 원본 보존: `_workspace/zabbix-item-keys-catalog-source.md`.
  - **키↔종류 정합(사용자: "종류랑 키 따로 가도 됨?")**: Zabbix에서 key는 type에 종속(안 맞으면 unsupported). 그래서 **키 선택 시 폼 아이템 종류(type)를 자동 맞춤** — 카탈로그 탭은 모달의 "아이템 종류" 드롭다운 선택값으로, "이 대상의 기존 키" 탭은 ItemKeyDto.type(실제 Zabbix type)으로 `form.setFieldsValue({key,type})`. 자유입력 키는 종류 모르니 미변경. type 변경 시 delay 노출·종속아이템 마스터 등 파생필드 자동 재계산. (구 valueType 자동설정 아이디어는 이 type 자동맞춤으로 대체.)
- **구성원 보기 + 탭 점프**(사용자: "템플릿에 어떤 아이템, 그룹에 어떤 템플릿 연결됐는지 안 보임"): 개수(itemCount/templateCount)를 클릭 링크로 → 상세 드로어에서 구성원 읽기전용 목록 → 실제 관리로 점프. 템플릿 상세에 "포함 아이템"(useItemList templateid) + "아이템 탭에서 관리→"(tab=item&templateId 딥링크). 그룹은 신규 TemplateGroupDetailDrawer에 "포함 템플릿"(useTemplateList **groupids 필터**, BE 추가 없음) + "템플릿 관리에서 열기→"(tab=template&templateDetailId → 템플릿 상세 자동 오픈). **탭 activeKey·templateDetailId를 URL state로 승격**(QueryParamKeys.TAB/TEMPLATE_DETAIL_ID, ITEM_TEMPLATE_TABS 공유상수)해 딥링크·리마운트 생존. 드로어 내부 목록은 DmoveTable hasQuery=false(로컬 페이징, 100개 상한)로 리마운트 회피.
- **Select 리버트 버그**(사용자 발견, 수정완료): 아이템 탭 대상 템플릿 선택이 로컬 useState라 목록이 떴다 사라짐 → templateId를 URL state 승격으로 해결. 근본 원인은 [[fe-page-remount-on-navigate]](App.tsx CSSTransition navigate 리마운트).

**참고(다음 세션):**
- ⚠️ **스테일 빌드 반복**: :3000에 옛 빌드가 떠 있어 신규 EP가 500/DB에러를 내는 사례가 이 세션에서만 여러 번. 검증·확인 전 **반드시 최신 소스로 재빌드 후 재기동**하고 신규 EP 200 확인. dev 프로필(5433 test DB)로 띄우면 실 dev DB(5432) 오염 없이 admin/<dev-db-pw>. 공유 dev DB admin 비번은 V10 시드 <dev-db-pw> 아니라 구 `<dev-admin-pw>`(시드가 WHERE NOT EXISTS라 기존계정 미갱신). BE는 `/api/v1` 프리픽스 없이 루트 매핑, FE `VITE_API_URL=http://localhost:3000` 직접 호출. 헤드리스 Playwright는 AntD Tabs/Select 커밋 미반응(하네스 한계) — FE DOM 토스트 육안확인만 잔여.


## 인덱스 상세 이관 (2026-09-02)

인덱스 압축으로 옮겨온 요약 — 본문과 중복될 수 있으며 본문이 우선.

아이템·템플릿 관리 — 2026-07-20 Zabbix 관리>아이템·템플릿 관리(메뉴1+탭2, 양쪽 전체 CRUD) 풀스택+QA 완료(미커밋). BE `/zabbix-manage/**` 14EP+감사로그 V12. 최종UX=탭2(아이템 생성 및 관리/템플릿 관리, 스코프토글 없음, 아이템은 대상템플릿 선택 선행). 교훈: link/unlink 전부 host-side(host.massadd/host.massremove, template.massadd/massremove는 거부or 200 no-op), -32602 검증실패 401→400 메시지 분기(회귀주의)
