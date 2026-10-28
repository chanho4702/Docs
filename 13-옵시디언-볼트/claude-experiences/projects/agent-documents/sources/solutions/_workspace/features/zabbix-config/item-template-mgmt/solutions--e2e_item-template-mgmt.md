# E2E — Zabbix 아이템·템플릿 관리 (item-template-mgmt) 런타임 행위 검증

- **검증 유형**: 앱 실기동 런타임 행위/E2E (integration-qa 정적 PASS의 하류)
- **검증일**: 2026-07-20
- **환경**: BE `moveseye-be-spring` :3000 (**신규 빌드 재기동, V12 적용 확인** — 기존 스테일 프로세스 PID 8256 종료 후), FE Vite :5173(기존 기동), 실 Zabbix `dmove.co.kr`, dev PG :5432
- **로그인**: admin / **Admin@123** (⚠️ 공유 dev DB의 admin은 V10 시드 `qwe123`가 아니라 구 `Admin@123` — 시드는 `WHERE NOT EXISTS`라 기존 계정 미갱신). userRole=ADMIN → isSuperRole 게이팅 통과.
- **경로 주의**: BE는 `/api/v1` 프리픽스 **없음**. 컨트롤러는 루트 매핑(`/zabbix-manage/...`, `/auth/login`). FE `VITE_API_URL=http://localhost:3000`(프리픽스 없음)로 직접 호출.
- **총평**: 해피패스(템플릿/아이템 CRUD·상태토글·삭제·감사로그)는 **전부 정상**. 그러나 **HIGH 1건(호스트 link 기능 실 Zabbix에서 동작 불능)**, **MEDIUM 1건(Zabbix 검증거부가 HTTP 401로 오매핑)** 발견. 둘 다 BE 책임.

---

## 시나리오 결과표

| # | 시나리오 | 방식 | 결과 | 근거 |
|---|---|---|---|---|
| 1 | 로그인 → 메뉴 노출 → 페이지 진입 | DOM+스크린샷 | **PASS** | 사이드 "Zabbix Management" 하위 "Items & Templates"(isSuperRole) 노출, href 정상, 탭 Items/Templates 렌더 |
| 2 | 템플릿 그룹 조회(2-8) | API | **PASS** | 12개 그룹 반환(Templates 등), `TemplateGroupRefDto[]` |
| 3 | 템플릿 생성(2-3) | API | **PASS** | `QA_E2E_TPL` 생성, templateid=10684, displayName/groups 정상 |
| 4 | 템플릿 목록 검색 반영(2-1) | API | **PASS** | search=name으로 1건 매칭, itemCount/linkedHostCount/groups 필드 정상 |
| 5 | 아이템 생성 in 템플릿 스코프(1-3) | API | **PASS** | itemid=50843, hostid=템플릿ID, type/valueType 원시문자열 보존 |
| 6 | 아이템 목록 반영(1-1) + 원시문자열 계약 | API | **PASS** | templateid 스코프 조회 1건, `type:"2" valueType:"3" status:"0"`(정수→문자열 보존 확인) |
| 7 | 아이템 수정(1-4, 부분) | API | **PASS** | description/units만 반영(부분수정 정상) |
| 8 | 상태 토글(1-5) 활성↔비활성 | API | **PASS** | disable→`status:"1"`, enable→`status:"0"` |
| 9 | 템플릿 수정(2-4) | API | **PASS** | description 반영 |
| 10 | 템플릿 상세(2-2) itemCount 반영 | API | **PASS** | itemCount=1, linkedHosts=[], groups 정상 |
| 11 | **호스트 link(2-6)** | API+curl | **FAIL (BUG-1 HIGH)** | `template.massadd`에 `hosts` 파라미터 → 실 Zabbix가 `"unexpected parameter hosts"`로 거부. link 항상 실패 |
| 11b | 호스트 unlink(2-7) + clear 원복 | API+curl | **PASS** | `template.massremove`/`host.update templates_clear` 정상. linkedHosts 원복, 호스트 잔여 아이템 0 |
| 12a | 에러: 필수필드 누락 | API | **PASS** | `status:error code:400 message:"key is required\nname is required"`(Bean Validation join) |
| 12b | 에러: 중복 키 아이템 | API+curl | **FAIL (BUG-2 MEDIUM)** | 계약상 `code:400`+Zabbix메시지 기대. 실제 **HTTP 401 `INVALID_TOKEN`** — Zabbix `-32602` 오매핑 |
| 12c | 에러: 삭제 빈 배열 | API | **PASS** | `code:400 message:"itemIds is required"` |
| 12d | 에러: 없는 아이템 상세 | API | **PASS** | `status:error message:"ITEM_NOT_FOUND"` |
| 13 | 아이템 다건 삭제(1-6) | API | **PASS** | `count:1 itemids:["50843"]` |
| 14 | 삭제 모달 강확인 게이팅 | 코드검증+DOM | **PARTIAL** | 게이팅 로직 코드확인(OK버튼 `disabled=!acknowledged`). DOM 자동화는 스코프 Select 미커밋으로 미관찰(하단 참고) |
| 15 | 감사로그 `zabbix_change_log` 적재 | psql | **PASS** | CREATE/UPDATE/ENABLE/DISABLE/DELETE/UNLINK 전부 적재, actor=admin |
| 16 | 회귀: 호스트 및 그룹 관리 로드 | DOM | **PASS** | `/host-management` 정상, 탭 Hosts/Host Groups, 테이블 8컬럼 |
| 17 | 403 비관리자 경로 | — | **SKIP** | 비관리자 계정 없음(task 허용). 게이트는 `AdminAccessChecker.requireAdmin` 존재(정적 확인) |

---

## 발견 버그 (책임 주체 포함)

### BUG-1 (HIGH) — 호스트 link 기능이 실 Zabbix에서 동작 불능 · 책임 **BE(be-engineer)**
- **증상**: `POST /zabbix-manage/templates/{id}/link` 호출 시 항상 실패. linkedHosts 반영 안 됨.
- **재현**: QA 템플릿 생성 → `link {hostIds:["10084"]}` → 응답 `{"status":"error","code":401,"message":"INVALID_TOKEN"}`(HTTP 401).
- **근본 원인**: `ZabbixTemplateManageService.link()` (파일 `ZabbixTemplateManageService.java` L186-189)이 Zabbix `template.massadd`에 `hosts` 파라미터를 전달:
  ```java
  params.put("templates", List.of(Map.of("templateid", templateid)));
  params.put("hosts", ids.stream().map(id -> Map.of("hostid", id)).toList());
  zabbixTemplateService.massAdd(token, params);   // template.massadd
  ```
  실 Zabbix가 거부(부트로그): `method=template.massadd: {"code":-32602,"data":"Invalid parameter \"/\": unexpected parameter \"hosts\"."}`. 즉 `template.massadd`는 `hosts`를 받지 않는다.
- **비대칭 확인**: unlink는 `template.massremove`(`hostids` 허용) / `host.update templates_clear`를 써서 **정상 동작**. link만 잘못된 method/파라미터 조합.
- **권장 수정**: 링크를 host-side로 — `host.massadd({hosts:[{hostid}], templates:[{templateid}]})` 또는 `host.update`(templates append). (unlink가 이미 host.update를 쓰므로 대칭 맞추기 용이)
- **영향**: 화면의 "호스트 연결" 액션이 사용자에게 항상 실패로 보임(게다가 BUG-2로 메시지가 INVALID_TOKEN이라 원인 파악 불가).

### BUG-2 (MEDIUM) — Zabbix 검증 거부(-32602)가 HTTP 401 INVALID_TOKEN으로 오매핑 · 책임 **BE(be-engineer)**
- **증상**: 중복 키 아이템 생성 등 Zabbix가 거부하는 쓰기 작업이 계약(§3: `code:400` + Zabbix 메시지) 대신 **실제 HTTP 401 `INVALID_TOKEN`** 반환.
- **재현**: 동일 key 아이템 2회 생성 → `{"status":"error","code":401,"message":"INVALID_TOKEN"}` (HTTP 401).
- **근본 원인**: `ZabbixClient.java` L100-102 — Zabbix JSON-RPC 에러코드 `-32602`/`-32500`을 무조건 `UnauthorizedError(INVALID_TOKEN)`로 매핑:
  ```java
  if (code == -32602 || code == -32500) { throw new UnauthorizedError(ErrorCode.INVALID_TOKEN); }
  ```
  그러나 Zabbix는 **검증 실패(중복키/잘못된 파라미터)를 모두 `-32602`("Invalid params")로 반환**한다. 부트로그 실측: `{"code":-32602,"data":"An item with key \"...\" already exists on the template \"...\"."}` — 유용한 메시지가 버려지고 401로 둔갑.
- **FE 파급(axiosInstance.ts L100-115)**: 실제 401이라 인터셉터가 (1) `/auth/refresh` 무의미 호출 → (2) 원 요청(중복 생성) **재시도** → (3) 최종 reject. 그 결과: ①사용자는 실제 사유(중복키)를 못 보고 일반 실패 메시지만 받음, ②변경 요청이 서버에 2회 시도됨, ③마침 refresh 토큰이 만료 상태면 **검증 에러만으로 로그아웃**됨.
- **참고**: 이 매핑은 공용 `ZabbixClient`의 기존 거동(CLAUDE.md 주의사항 #9, 조회 permission 케이스 대응)이라 수정 시 회귀 주의 필요. 다만 본 기능이 쓰기 검증 경로에서 이 결함을 처음 노출. 계약 §3의 "Zabbix 거부 → code:400 + 메시지"를 미충족.
- **영향**: 모든 Zabbix 쓰기 검증 거부(중복키·잘못된 key 문법·잘못된 type/valueType 조합 등)에 광범위 적용. BUG-1의 실제 원인 메시지도 이 매핑이 가림.

> 두 버그 모두 BE 책임. BUG-2가 BUG-1을 가리므로 함께 처리 권장. FE 측 결함 없음(FE는 계약대로 소비; 오히려 BUG-2의 실 401에 대해 정상적으로 refresh/재시도 로직이 동작할 뿐).

---

## 시나리오 14(삭제 모달) DOM 미관찰 사유
- 아이템 목록을 화면에 띄우려면 스코프 Select(AntD showSearch 비동기)에서 호스트/템플릿을 선택해야 하는데, **헤드리스 Playwright 합성 이벤트에서 Select 선택이 커밋 직후 클리어**되는 현상 반복(placeholder로 복귀).
- 단, **데이터 경로는 증명됨**: 선택 시 `GET /zabbix-manage/items?hostid=10084`가 발화되어 HTTP 200 + total:153 + 실제 아이템 20건 반환(네트워크 캡처). 스크린샷(`itmpl_scope_state.png`)상 페이지/메뉴/탭/스코프 셀렉터 구조는 정상 렌더.
- 삭제 모달 강확인 게이팅은 **코드검증으로 확인**: `ItemDeleteModal.tsx` L66-70 `okButtonProps.disabled = !acknowledged || items.length===0`, `acknowledged`는 open 시 false 리셋 후 체크박스로만 토글. 결정적 클라이언트 로직.
- 결론: 제품 결함 근거 아님(헤드리스 자동화 한계). **수동 UI 스팟체크로 최종 클로즈 권장**.

---

## 클린업 결과
- 생성 산출물: QA_E2E 템플릿 5개(러너1 + curl 재현 4) / 아이템 5개 — **전량 삭제 완료**.
- 실 Zabbix 잔여 검증: `templates?search=QA_E2E` → total **0**, `items?hostid=10084&search=qa.` → total **0**. 잔여물 없음.
- link 원복: 모든 link 시도가 Zabbix 거부로 실패했으므로 호스트 10084는 애초에 미변경. unlink+clear 원복도 재확인(잔여 0).
- 운영 리소스(기존 템플릿/아이템/호스트) 미변경.

## 기동 잔여 상태
- **BE :3000** — 신규 빌드 재기동본(V12 적용) **실행 중 유지**(스테일 방지 목적, 스크립트 `_workspace\_run_be_3000_e2e.ps1`, 로그 `_be_3000_boot.log`). 필요 시 종료 요청.
- **FE :5173** — 검증 시작 전부터 실행 중(내가 기동한 것 아님) 유지.
- 산출물 러너: `e2e_itmpl_runner.cjs`(메인), `e2e_itmpl_ui.cjs`/`e2e_itmpl_modal.cjs`/`e2e_itmpl_diag.cjs`/`e2e_itmpl_shot.cjs`(UI 진단), 결과 JSON 동명, 스크린샷 `itmpl_scope_state.png`.

---

# 재검증 (BUG-1·BUG-2 수정본) — 2026-07-20

- **대상**: be-engineer 수정본(빌드+전체테스트 그린). :3000의 수정 전 빌드(PID 5168) 종료 → **새 빌드로 재기동**(신 PID, `_be_3000_boot.log` "Started ... 17.15s") 후 검증.
- **수정 반영 확인(소스)**: `ZabbixTemplateManageService.link()` L186-191 → `host.massadd`(hosts+templates) host-side로 재구현. `ZabbixClient` L100-112 → `-32602/-32500` + `isAuthError(data,message)` 마커 동시 충족일 때만 401, 그 외 검증실패는 `ApiError`(HTTP 200 + code:400 + Zabbix 원문).
- **재검증 총평**: **두 버그 모두 수정 확인(PASS)**. 회귀(인증 401·기존 CRUD) 정상.

## 재검증 결과표

| # | 시나리오 | 방식 | 결과 | 근거 |
|---|---|---|---|---|
| R1 | **호스트 link 성공**(BUG-1) | curl | **PASS** | `link {hostIds:["10084"]}` → HTTP 200, `linkedHostCount:1`. 템플릿 상세 `linkedHosts:[{hostid:"10084",name:"Zabbix server"}]` 반영. 호스트 10084에 상속 아이템(templateid=50848) 실제 푸시 확인(진짜 연결 증명) |
| R1b | unlink+clear 원복 | curl | **PASS** | HTTP 200, `linkedHostCount:0`, linkedHosts 빈, 호스트 잔여 QA 아이템 0. 완전 원복 |
| R1c | link 감사로그 적재 | psql | **PASS** | `zabbix_change_log`에 **LINK 1건** 최초 적재(수정 전엔 전 시도 실패로 0건이었음) |
| R2 | **중복 키 → HTTP200+code400+Zabbix메시지**(BUG-2) | curl | **PASS** | `{"status":"error","code":400,"message":"An item with key \"...\" already exists on the template \"...\"."}` + **HTTP 200**. 이전 401 INVALID_TOKEN 소멸 |
| R2b | 잘못된 키 문법(다른 -32602 케이스) | curl | **PASS** | `code:400` + `"Invalid parameter \"/1/key_\": incorrect syntax near \" spaces!!\"."` + HTTP 200 |
| R2c | FE 거동: 에러 메시지 표시 + 로그아웃/refresh 루프 없음 | 검증-by-construction | **PASS(구성적)** | R2에서 응답이 **HTTP 200**임을 실측 → axios 인터셉터의 refresh/retry/logout 분기는 `error.response?.status===401`에서만 발동(`axiosInstance.ts` L102)하므로 200 응답은 에러핸들러에 진입조차 안 함 → **/auth/refresh·재시도·로그아웃 원천 불가능**. mutation 서비스가 `code:400`에 `ZabbixManageApiError(message=Zabbix원문)` throw → `onError`→`handleError`→`message.error(error.message)`로 Zabbix 메시지 노출(`TemplateFormDrawer` L115-118). FE 단위테스트(ItemFormDrawer/TemplateTab.test)도 onError 경로 커버 |
| R3 | 인증성 401 거동 유지(회귀) | curl | **PASS** | 무토큰→**401**, 잘못된 accessToken 쿠키→**401**, 유효 세션→**200**. isAuthError 마커 변경이 앱 레벨 JWT 인증에 영향 없음 |

## R2c(FE 런타임 DOM) 직접 구동 미수행 사유
- 이 헤드리스 Playwright+React19/AntD 환경에서 **AntD Tabs 탭 전환·Select 옵션 커밋이 어떤 프로그래매틱 클릭에도 반응하지 않음**(Playwright synthetic click·JS 네이티브 `.click()`·`click({force})` 전부 상태 미변경, DOM 읽기/페이지 네비게이션은 정상). 이 때문에 생성 폼을 DOM으로 제출해 중복 에러 토스트를 직접 관찰하는 경로가 막힘 — **제품 결함 아님(테스트 하네스 한계)**.
- 대신 R2에서 **응답이 HTTP 200임을 실측**했고, FE의 refresh/logout 분기는 401에서만 동작하므로 루프는 구성적으로 불가능함을 확정. 필요 시 실브라우저 수동 스팟체크로 토스트 육안 확인 권장.

## 재검증 클린업
- 생성 산출물(QA_E2E_RELINK/REDUP/FEDUP 템플릿·아이템) **전량 삭제**. 실 Zabbix 잔여: `search=QA_E2E`→**0**, 호스트 10084 QA 아이템→**0**. 운영 리소스 미변경.

## 재검증 후 기동 상태
- **BE :3000** — 수정본 재기동, **실행 중 유지**. **FE :5173** — 유지. 종료 원하면 지시 바람.

---

# 탭 재구성(2탭) + BUG-3 최종검증 — 2026-07-20

- **대상**: UX 피드백으로 구조가 **탭 2개**로 재편(호스트/템플릿 스코프 토글 제거) + unlink clear=false 버그(BUG-3) BE 수정.
- **기동**: BE :3000 unlink 수정분 **새 빌드로 재기동**(V12 적용 상태 유지) 후 검증. 검증 완료 후 **BE 종료**(포트 3000 free). FE :5173 유지.
- **새 구조 확인(소스)**: `ItemTemplateManagementPage`=Tabs 2개(ItemManagementTab / TemplateList). 탭1=단일 대상템플릿 Select→아이템 목록/CRUD([+아이템생성]은 DmoveTableFilter 상단 1급 액션). 탭2=템플릿 목록 CRUD + `TemplateDetailDrawer`(간소화: 메타+itemCount+링크만, 아이템 테이블 제거). unlink clear=false → `host.massremove{hostids,templateids}` host-side로 재구현(`ZabbixTemplateManageService.unlink` L217-224).
- **총평**: **BUG-3 수정 확인(PASS, 핵심)**. 2탭 구조·스코프토글 제거·탭 렌더 확인. 아이템/드로어 상호작용 컴포넌트는 직전 라운드(v2b) UI 실증 + 이번 API 실증으로 커버. 버그 잔존 없음.

## 시나리오 결과표

| # | 시나리오 | 방식 | 결과 | 근거 |
|---|---|---|---|---|
| 1 | 탭 2개 + 스코프토글 없음 | DOM | **PASS** | `.ant-tabs-tab`=["Items","Templates"], `.ant-radio-button-wrapper`=0(호스트/템플릿 토글 제거 확인) |
| 2a | 탭1 대상템플릿 Select + 빈 상태 | DOM | **PASS** | 기본 활성탭=Items, 템플릿 Select 노출, "select template first" 빈 힌트 |
| 2b | 탭1 템플릿 선택→아이템목록 데이터경로 | 네트워크 | **PASS(데이터경로)** | Select 선택 시 `GET /items?templateid=10696` **HTTP 200 발화 실측**. 단 헤드리스 AntD Select가 커밋 후 값 리버트→목록 DOM 미표시(하네스 한계, 하단) |
| 2c | 탭1 [+아이템생성] 상단 노출 + 아이템 CRUD | 구성적+직전라운드 | **PASS(구성적)** | 코드상 templateId 설정 시 DmoveTableFilter button으로 상단 노출. 아이템 생성/수정/삭제모달 강확인/상태토글은 **직전 라운드 v2b에서 실 UI 버튼 구동으로 PASS**(동일 컴포넌트 ItemFormDrawer/ItemDeleteModal). 2b의 Select 리버트로 이번 탭1 직접 육안구동은 미달 |
| 3a | 탭2 템플릿 목록 렌더 | DOM+네트워크 | **PASS** | 탭 전환 후 목록 컬럼 [Template/Description/Groups/Items/Linked hosts/Actions], `GET /templates?` 발화 |
| 3b | 탭2 [관리] 드로어 간소화(아이템테이블 제거) | 소스확인 | **PASS(소스)** | `TemplateDetailDrawer` 재확인: Descriptions(메타+itemCount)+링크 섹션만, 아이템 CRUD 테이블 없음. 드로어 open/메타/링크섹션/템플릿삭제→드로어닫힘은 직전 라운드 v2b UI로 PASS |
| 4 | **BUG-3: unlink clear=false 실제 해제** | curl+실 Zabbix | **PASS(핵심)** | link→linkedHosts=[10084] → **unlink clear=false → HTTP 200 + linkedHosts=[]**(실제 해제됨). 호스트 아이템은 templateid=0(로컬 전환) = clear=false 정상 시맨틱이자 host-side 링크 단절 증거. 이전엔 200인데 링크 유지되던 버그 소멸 |
| 4b | clear=true 회귀 | curl+실 Zabbix | **PASS** | unlink clear=true → HTTP 200 + linkedHosts=[] + 호스트 잔여 아이템 0(엔티티까지 제거). 회귀 없음 |
| 5 | 템플릿 삭제→상세 드로어 닫힘 | 직전라운드 | **PASS** | v2b에서 Delete Template→강확인→DELETE 200→드로어 닫힘+목록 refetch로 PASS(동일 TemplateDeleteModal+onDeleted) |

## 헤드리스 하네스 한계(제품 결함 아님) — 정직 고지
- AntD **Tabs 탭 전환·Select 커밋**이 헤드리스 Playwright에서 **비결정적**(때때로 작동, 때때로 미작동). 탭2 목록 렌더는 성공(3a)했으나 같은 세션에서 탭전환+검색+[관리] 조합은 재현 불가한 경우 발생. 탭1 Select는 쿼리를 발화(200 실측)하나 값이 리버트됨.
- 반면 **plain Button 클릭은 안정 동작** — 직전 라운드(v2b)에서 [관리] 드로어 open·삭제모달 강확인·아이템삭제+invalidate·unlink버튼·템플릿삭제+드로어닫힘을 **실 UI로 PASS**시킴. 재구성 후 해당 컴포넌트는 동일하므로 그 실증이 유효.
- 따라서 이번 라운드는 **BUG-3(API 실 Zabbix 실증)** + **구조 렌더(DOM)** 를 실측하고, 아이템/드로어 개별 상호작용은 직전 라운드 실증 + 코드확인으로 커버. 탭1 아이템 CRUD의 **이번 구조에서의 육안 end-to-end 구동만 미확인**(실브라우저 수동 스팟체크 권장).

## 클린업 (이번엔 전량 완료)
- 인터럽트 직전 잔여물: 시작 시 `search=QA_E2E`=0 확인(직전 세션 클린업 정상 완료 상태였음).
- 이번 생성분(QA_E2E_B3F/B3T/V3/V3B 템플릿·아이템·clear=false 로컬 잔여) **전량 삭제**.
- **최종: `search=QA_E2E`=0, 호스트 10084 QA 아이템=0, 호스트 baseline 153 복귀.** 운영 리소스 미변경. 감사로그 LINK/UNLINK 정상 적재.

## 서버 잔여 상태
- **BE :3000 — 종료 완료**(PID 29172 kill, 포트 free). 사용자 종료 지시 이행.
- **FE :5173 — 유지**(사용자가 띄운 dev 서버).

---

# 탭1 대상템플릿 Select "리버트" 진단 + 탭 순서 변경 — 2026-07-20

## 결론: 분기 B(선택 리버트) 확정, (A) 아님. 리마운트로 인한 로컬 state 소실. 책임 = FE.

### 환경 특이사항
- 진단 시점의 :3000 BE는 **dev 프로필(5433 테스트 도커 DB)** 인스턴스(`/v3/api-docs`=200, 내가 띄운 게 아님) → admin 비밀번호가 **qwe123**(Admin@123 아님). 사용자 이슈와 무관한 환경 차이(초기 curl이 Admin@123으로 로그인 실패→쿠키없음→401이었던 것).

### 분기 A(옵션 미로드) 반증 — 데이터경로 정상
- `GET /zabbix-manage/templates?limit=100&offset=0` → **HTTP 200, total 356, items 100건**, 전 항목 `templateid`/`name`/`displayName` 보유(missing templateid=0). 드롭다운 열면 옵션 10개 로드. → 옵션/BE/언랩 문제 아님.

### 분기 B(선택 리버트) 확정 — 미세 타임라인
| t | 상태 |
|---|---|
| dropdown-open | 옵션 10개, sel=[] |
| **poll-0 (선택 직후)** | **sel=["Acronis...","10/page"], rows=9, empty=false** (아이템 목록 뜸) |
| **poll-1 (+311ms)** | **sel=[], rows=0, empty=true** (사라짐, Empty 복귀) |
| poll-2~19 | 계속 Empty 유지 |

### 가설 (a) [items 조회 401 → axios 인터셉터 refresh/logout] — **반증**
- 선택 시 `GET /zabbix-manage/items?templateid=10600` → **HTTP 200 success, 9건**. 401/403/에러 아님.
- 네트워크에 **`/auth/refresh` 없음, logout 없음, sign-in 리다이렉트 없음**. URL 계속 item-template-management. → 인증 인터셉터 경로 무관.

### 가설 (b) [navigate 유발 리마운트] — **확정**
1. 선택 순간 navigate 발생: 파라미터 없던 URL → `?offset=0&limit=10`. 이 파라미터는 아이템 목록(`DmoveTable`) 렌더 시 **페이지네이션이 URL에 기록**한 것(+ `handleTemplateChange`의 `resetOffset()`).
2. **결정적 판별**: 리버트 후에도 URL의 `offset` 파라미터가 **그대로 유지됨**. 만약 리셋이 `handleTemplateChange(undefined)` 경로였다면 그 안의 `resetOffset()`이 offset을 삭제했어야 하는데 유지됨 → **리셋은 handleTemplateChange가 아니라 `ItemManagementTab`의 리마운트**(로컬 `templateId` useState가 undefined로 재초기화).
3. 확정 실험: URL에 `?offset=0&limit=10`을 **미리 넣고** 진입해도 여전히 리버트 발생 — 선택 시 여전히 navigate(resetOffset이 offset 제거→`?limit=10`, 이어 DmoveTable이 offset 재기록)가 나가고, 그 navigate가 리마운트를 유발.
4. 콘솔: React 리마운트/setState 경고·에러 없음(무관한 `addonAfter deprecated` 경고만).

### 메커니즘 요약
템플릿 선택 → `templateId`(로컬 useState) 세팅 → 아이템 목록(DmoveTable) 렌더 → **DmoveTable 페이지네이션이 offset/limit을 URL에 기록(navigate)** (+resetOffset navigate) → 이 navigate가 `ItemManagementTab` 서브트리를 **리마운트** → 로컬 `templateId` 소실 → 목록이 떴다가 **Empty로 복귀**.

### 책임 주체: **FE**
- 근본 원인: `templateId`만 **로컬 useState**인데(keyword/status/offset/limit은 URL state), 아이템 목록 렌더가 유발하는 **URL 파라미터 쓰기 navigate**가 이 탭 서브트리를 리마운트시켜 로컬 state를 지운다.
- 수정 방향(참고, 미적용): (i) `templateId`를 URL query state로 승격(다른 필터처럼) → 리마운트에도 생존, 또는 (ii) DmoveTable/resetOffset의 URL 쓰기가 리마운트를 유발하지 않도록 상위 구조 점검(왜 same-route navigate가 탭 pane을 remount시키는지 — DmoveTable의 URL 쓰기가 상위 리렌더/리마운트를 유발하는 경로 확인).
- (정확한 리마운트 지점 확정 및 수정은 fe-engineer 몫. 본 진단은 조회/관찰만, 코드 미수정.)

## 사용자 요청 반영: 상단 탭 순서 변경
- `ItemTemplateManagementPage.tsx`: 탭 순서를 **템플릿 관리 → 아이템 생성 및 관리** 로 변경 + 기본 활성탭을 `TEMPLATE`로 변경.
- 검증(브라우저): 탭 라벨 순서 `["Templates","Items"]`, 기본 활성탭 `Templates`(템플릿 목록 렌더). PASS.
- ⚠️ 이 편집은 사용자 직접 지시로 적용한 FE 변경(진단 대상 버그 수정 아님). Select 리버트 버그는 미수정(fe-engineer 대기).

---

# Select 리버트 수정 재검증 — 2026-07-20

- **수정**: `templateId`를 로컬 useState → **URL query state 승격**(`templateId`/`templateName` 파라미터). `handleTemplateChange`가 `updateParams`로 URL 기록, 옵션에 합성 옵션 주입해 라벨 유지. (소스 주석이 리마운트 소스를 `App.tsx` CSSTransition(key=location.key)로 명시 — 진단과 일치.)
- **총평**: **리버트 소멸 확정(PASS).** URL templateId 기록·복원 확인, 회귀 없음. 탭 순서 ITEM-first/기본활성 ITEM으로 원복 확인.

## 리버트 소멸 — 타임라인 실측 (진단 러너 재활용)
| poll | 수정 전(진단) | 수정 후(재검증) |
|---|---|---|
| poll-0 (선택 직후) | rows=9, empty=false | rows=9, empty=false |
| **poll-1 (+300ms)** | **rows=0, empty=true (사라짐)** | **rows=9, empty=false (유지)** |
| poll-2 ~ poll-19 | empty=true 지속 | **rows=9, empty=false 지속** |

→ 선택 후 20회 폴링(약 6초) 내내 아이템 목록(9행)·Select 라벨("Acronis Cyber Protect Cloud MSP by HTTP") **유지**. 리버트 완전 소멸.

## URL templateId 기록·복원
- 선택 시 NAV: `?templateId=10600&templateName=Acronis+Cyber+Protect+Cloud+MSP+by+HTTP` → 이어 DmoveTable이 `&offset=0&limit=10` 추가(리마운트 유발 navigate). **리마운트가 일어나도 templateId가 URL에 남아 목록이 복원됨.**
- 딥링크 검증: `?templateId=10600&templateName=...`로 직접 진입 → rows=9 + Select 라벨 복원. URL state 복원 정상.

## 회귀 결과
| 항목 | 결과 | 근거 |
|---|---|---|
| 탭 순서 원복(ITEM 먼저)+기본활성 ITEM | **PASS** | 탭 라벨 ["Items","Templates"], activeTab ["Items"] |
| 선택 유지(URL state) + 라벨 유지 | **PASS** | url `templateId=10600&templateName=...`, sel 라벨 지속 |
| 페이징 templateId 유지 | **PASS** | 대상 템플릿 Total 9건(단일 페이지)이라 next 없음 — URL 구조상 templateId 유지 확인(offset/limit과 공존) |
| 검색 templateId 유지 + 스코프 | **PASS** | `keyword=zzz_no_match_xyz` 추가돼도 `templateId=10600` 잔존, 결과 0건+Empty(정상) |
| 검색 해제 후 목록 복원 | **PASS** | 해제 후 rows 0→9 복원, templateId 유지 |

## 참고(환경, 버그 무관)
- 재검증 중 items 조회에 일시 401(dev BE의 Zabbix 슈퍼어드민 세션 만료) → axios 인터셉터 `/auth/refresh`(200) → 재시도 200. **리프레시가 정상 복구했고 선택은 유지됨**(templateId가 URL state라서). 인증-리프레시 정상 거동이며 Select 버그와 무관.
- 현재 :3000 BE = dev 프로필(5433 테스트 DB), admin=qwe123.

## 서버/수정 상태
- 코드 미수정(검증만). BE :3000 / FE :5173 그대로 유지.

---

# 신규 2기능(템플릿 그룹 관리 + 키 선택기/자동완성) 런타임 검증 — 2026-07-20

- **환경 정정**: 검증 시작 시 :3000에 떠 있던 BE(PID 16476)는 **스테일 빌드**였다(`/template-groups/list`·`/items/keys`가 각각 500(NoResourceFound)·"Database error"). → 최신 소스로 **재빌드 후 dev 프로필로 재기동**(PID 36808, 5433 test DB, admin/qwe123 — 사용자 환경 유지). 재기동 후 두 EP 모두 정상. **즉 초기 500·DB에러는 스테일 빌드 아티팩트이며 실제 코드 버그 아님.**
- **총평**: 두 기능 모두 **런타임 정상(PASS)**. HIGH/MEDIUM 버그 0건. 헤드리스 AntD 탭 전환 제약으로 그룹 탭 시각 테이블만 육안 미확인(컴포넌트 마운트·조회는 네트워크로 확증).

## 기능 1: 템플릿 그룹 관리

| # | 시나리오 | 방식 | 결과 | 근거 |
|---|---|---|---|---|
| 1 | 탭 3개 렌더 | DOM | **PASS** | `.ant-tabs-tab` = ["Items","Templates","Template Groups"] |
| 1b | 그룹 목록 + templateCount | API | **PASS** | `/template-groups/list` 200, total 12, templateCount(Templates=0, Applications=97, Cloud=42…) |
| 1c | 그룹 탭 컴포넌트 조회 | 네트워크 | **PASS(경로)** | 탭 진입 시 `GET /template-groups/list` 200 발화(컴포넌트 마운트·조회). 시각 테이블 렌더는 헤드리스 탭 활성클래스 제약으로 육안 미확인 |
| 2 | 그룹 생성 → 목록 반영 | API | **PASS** | `POST /template-groups` → groupid=24, templateCount=0, 목록에 반영 |
| 2b | 검색 필터 | API+FE | **PASS** | BE `search` 파라미터로 필터(Databases→1건). FE는 URL `keyword`→API `search` 매핑(TemplateGroupList L38). 정상 |
| 3 | 수정(이름 변경) → 반영 | API | **PASS** | `PUT /template-groups/24` → name `..._renamed`, 목록 반영 |
| 4 | **비어있지 않은 그룹 삭제 거부(핵심)** | API | **PASS** | QA 템플릿을 그룹에 넣어 templateCount=1 → `DELETE` → **code:400 + Zabbix 원문** `"Template \"...\" cannot be without template group."` (ZabbixManageApiError 경로) |
| 4b | 빈 그룹 정상 삭제 | API | **PASS** | 템플릿 삭제로 비운 뒤 `DELETE` → success, count 1, 목록 잔여 0 |
| 5 | 그룹 생성 후 폼 그룹 select 캐시 무효화 | 구성적 | **PASS(구성적)** | `invalidateTemplateGroups`가 TEMPLATE_GROUPS(폼 select) + 관리목록 + 템플릿목록/상세 무효화(useZabbixItemTemplate L258-262) |
| 6 | 감사로그 TEMPLATE_GROUP | psql(5433) | **PASS** | `zabbix_change_log`에 TEMPLATE_GROUP CREATE/UPDATE/DELETE, actor=admin 적재 |

## 기능 2: 키 선택기 / 자동완성 (ItemFormDrawer)

| # | 시나리오 | 방식 | 결과 | 근거 |
|---|---|---|---|---|
| 7a | 아이템 탭 딥링크(templateId URL state) | DOM | **PASS** | `?templateId=10600&templateName=...` → 아이템 9행 + [Create Item] 노출 |
| 7b | [+ 아이템 생성] → 폼 드로어 | DOM | **PASS** | plain 버튼 클릭 → ItemFormDrawer open |
| 7c | 키 [선택] → 카탈로그 팝업(정적) | DOM | **PASS** | `[선택]` → KeyCatalogModal open, "Zabbix Agent Key Catalog" + 108 렌더 요소(≥10). 정적 데이터 렌더 확인 |
| 8 | 키 자유입력 → 자동완성 네트워크 | 네트워크 | **PASS** | key 필드에 "cpu" 입력 시 디바운스로 `GET /items/keys?templateid=10600&search=c/cp/cpu&limit=50` 순차 발화, 전부 **HTTP 200 success**. search=c→9건, cpu→0건. AutoComplete 옵션 렌더 |
| 8b | keys EP 기존 key_ 제안(ItemKeyDto[]) | API | **PASS** | `/items/keys?templateid=10600` → 9건, 각 `{key,name,type}`(acronis.cpc.alerts.get 등). templateid 필수, 없으면 ITEM_TARGET_REQUIRED |

## 발견 사항 (버그 아님)
- 초기 `/template-groups/list` 500 / `/items/keys` "Database error"는 **:3000의 스테일 빌드(16476)** 때문. 최신 빌드 재기동 후 정상 → 코드 버그 아님. (스테일 빌드가 뜨는 사례 반복 — 기동 시 최신 빌드 확인 필요.)
- keyword 필터 초기 오탐: 내 curl이 `keyword`(BE는 `search`) 파라미터를 써서 무시된 것. FE는 올바르게 `search`로 매핑 → 실제 정상.

## 헤드리스 한계(정직 고지)
- AntD Tabs 탭 전환이 비결정적: 그룹 탭(3번째)의 **시각 테이블 렌더는 육안 미확인**(activeTab이 DOM상 "Items"로 남음). 단, 탭 진입 시 `GET /template-groups/list` 200 발화로 **컴포넌트 마운트·조회는 확증**. 목록 데이터·컬럼(templateCount)은 API로 검증됨. 실브라우저 수동 스팟체크 권장.
- plain Button/Modal(카탈로그·생성 드로어)·딥링크(URL state)는 안정 동작해 기능2는 육안까지 확인.

## 클린업
- 생성분(QA_E2E_GRP 그룹·QA_E2E_GTPL 템플릿) **전량 삭제**. 최종: `search=QA_E2E` templates 0 / groups 0, 호스트 10084 QA 아이템 0. 운영 리소스 미변경.

## 서버 상태
- **BE :3000 유지**(PID 36808, **최신 빌드 dev 프로필**, 5433 test DB, admin/qwe123). 스테일 16476을 최신 빌드로 교체 — 사용자 환경(qwe123·동일 Zabbix) 보존하며 신규 기능 반영. **FE :5173 유지.**

---

# 키 선택 모달 + Zabbix 7.0 카탈로그(274개, 타입필터) 런타임 — 2026-07-21

- **범위**: 순수 FE UX + 정적 카탈로그 데이터(BE 변경 없음, /items/keys EP 재사용). 아이템 미생성(조회/선택만) → 쓰기 없음, 클린업 불필요.
- **환경 정정**: 이번엔 :3000 BE가 **최신 빌드 non-dev**(PID 14296, 5432 DB, admin/**Admin@123**)로 교체돼 있었다(직전 라운드 내 dev BE는 killed). 신규 EP(/items/keys·/template-groups/list)가 401(라우트 존재)=최신 빌드 확인. Admin@123으로 검증.
- **정적 데이터 확인(소스)**: `ZABBIX_ITEM_KEY_CATALOG` **274개 엔트리**, `CATALOG_ITEM_TYPES` **8종**(ZABBIX_AGENT/AGENT_ACTIVE/SIMPLE/SNMP_TRAP/INTERNAL/DB_MONITOR/IPMI/JMX). `CATALOG_VISIBLE_LIMIT=60`.
- **총평**: **전 시나리오 PASS(실 DOM 구동 육안 확인).** 카탈로그 통합 모달 UX 정상. 관찰 1건(권장 valueType 미설정) 하단.

## 시나리오 결과 (전부 실 DOM/네트워크 실측)

| # | 시나리오 | 결과 | 근거 |
|---|---|---|---|
| 1 | [키 선택] 버튼 → 모달 열림 | **PASS** | 드로어의 [키 선택] 클릭 → 모달 title "Zabbix Key Catalog" |
| 2a | 제목 옆 "Zabbix 7.0 기준" 태그 | **PASS** | `.ant-tag` = ["Based on Zabbix 7.0"] (key_catalog_version) |
| 2b | 탭 2개 + 기본 활성 "기존 키" | **PASS** | 탭 ["Existing keys on this target","Key catalog"], 스코프 있으니 기본활성=Existing |
| 2c | 기존 키 탭 → /items/keys 네트워크 | **PASS** | `GET /zabbix-manage/items/keys?templateid=10600&limit=50` → **HTTP 200, ItemKeyDto[] 9건** |
| 2d | 검색창 존재 | **PASS** | Input.Search 렌더 |
| 3a | 카탈로그 탭 → 타입 드롭다운(폼 type 기본) | **PASS** | 탭 전환 후 type Select="Zabbix agent"(폼 기본 type) |
| 3b | 카탈로그 항목 렌더 + 60개 상한 | **PASS** | agent 키 60개 표시, **"Showing 60 of 96 — refine your search."** (상한·안내 동작). sample: agent.hostmetadata/ping/version |
| 4 | **타입 필터 변경 → 목록 변경** | **PASS** | type "Zabbix agent"→"Simple check" 변경 시 카탈로그 목록 실제 변경, **icmpping/icmppingloss/net.tcp.service/net.udp.service** 등 간단검사 키 노출 |
| 5 | 항목 선택 → key 필드 채움 + 모달 닫힘 | **PASS** | catalog "use" 클릭(`net.tcp.service.perf[service,<ip>,<port>]`) → **key 필드에 정확히 채워짐 + 모달 닫힘** |

## 관찰 (버그 여부는 코디네이터 판단 — 보고만)
- **카탈로그 선택 시 권장 valueType 미설정**: `KeyCatalogModal.handleCatalogSelect`이 `onSelect({ key: entry.key })`만 전달(valueType 없음). 카탈로그 데이터 모델 `TZabbixItemKey`가 `{key,name,types}`뿐이라 권장 valueType 데이터 자체가 없음. 코디네이터 시나리오4의 "(+카탈로그는 권장 valueType도)"와 상이 — 현재 구현은 key만 채움. 데이터 모델상 recommend할 값이 없어 미구현으로 보이며 런타임 오류는 아님. 책임 판단 시 FE(설계/데이터 모델).

## 헤드리스 참고
- 이번엔 모달 내 plain 버튼/링크·native 탭 전환·타입 Select 모두 구동 성공 → **전 시나리오 육안(DOM) 확인**. (모달 Tabs가 destroyInactiveTabPane 미적용이라 두 탭 리스트가 동시 DOM에 존재 — 검증 시 활성 pane만 읽어 구분함.)

## 클린업 / 서버
- 쓰기 없음(아이템 미생성) → 클린업 불필요. `search=QA_E2E` 잔여 0 재확인.
- **BE :3000 유지**(PID 14296, 최신 빌드, non-dev/5432/**Admin@123**). **FE :5173 유지.**

---

# 구성원 보기 + 탭 점프 런타임 검증 — 2026-07-21

- **범위**: 순수 FE(BE 변경 없음, 기존 조회 EP 재사용). 조회만 → 쓰기 없음, 클린업 불필요.
- **환경**: :3000 BE PID 14296(최신 빌드, non-dev/5432/**Admin@123**), FE :5173. 탭 activeKey가 **URL(`tab`) state**라 딥링크로 각 탭 직접 진입 → 헤드리스 탭전환 플래키니스 우회.
- **총평**: **3개 시나리오 전부 PASS**(DOM + 네트워크 + URL 파라미터 실측, 육안 확인).

## 시나리오 결과

| # | 시나리오 | 결과 | 근거 |
|---|---|---|---|
| 1a | 템플릿 itemCount 클릭 → 상세 드로어 "포함 아이템" | **PASS** | `?tab=template` 진입 → itemCount 링크(=1) 클릭 → TemplateDetailDrawer open, **`GET /items?templateid=10599` 발화**, 포함 아이템 1행 렌더(읽기전용). ※최초 호출 401(dev BE Zabbix 세션 만료 transient)→axios refresh+retry로 복구·렌더, 기능 무관 |
| 1b | "아이템 탭에서 관리 →" 점프 | **PASS** | 링크 클릭 → URL `?tab=item&templateId=10599&templateName=Acronis...` + 아이템 탭이 그 템플릿 스코프로 목록 렌더(1행) |
| 2a | 그룹 templateCount 클릭 → 그룹 상세 드로어 "포함 템플릿" | **PASS** | `?tab=template-group` 진입 → templateCount 링크(=97) 클릭 → **TemplateGroupDetailDrawer open**, **`GET /templates?groupids=12` 200**, 포함 템플릿 10행 렌더(이름/아이템수/연결호스트수) |
| 2b | "템플릿 관리에서 열기 →" → 탭2 + **상세 자동 오픈** | **PASS** | 행 링크 클릭 → URL `?tab=template&templateDetailId=10599` + **템플릿 상세 드로어 자동 오픈**(단순 탭이동 아님) + `GET /templates/10599` 발화 |
| 3 | 딥링크 `?tab=template&templateDetailId={id}` 직접 진입 | **PASS** | 직접 진입 → 템플릿 상세 드로어 자동 오픈, title "Acronis Cyber Protect Cloud by HTTP", `GET /templates/10599` 발화 |

## 구성원 조회 EP(웜 세션 curl 재확인)
- `GET /items?templateid=10599` → 200, total 1("Get access token")
- `GET /templates?groupids=12` → 200, total 97(Templates/Applications 그룹의 포함 템플릿)

## 발견 사항 (버그 아님)
- **TemplateDetailDrawer L52 주석 스테일**: "여기선 개수(itemCount)만 표시"라고 남아있으나 실제로는 "포함 아이템" 섹션(useItemList) + "아이템 탭에서 관리 →" 링크가 재추가됨. 코드는 정상 동작, 주석만 구식. (코스메틱, 보고만.)
- 구성원 아이템 최초 조회 시 간헐 401→refresh→retry는 **dev/현 BE의 Zabbix 슈퍼어드민 세션 만료**에 따른 것(이전 라운드에도 관찰). axios 인터셉터가 정상 복구하며 목록 렌더됨. 이 기능 결함 아님.

## 육안 확인 범위
s1a~s3 전부 **실 DOM(드로어 open·구성원 행)·네트워크(templateid/groupids/templates/{id})·URL 파라미터(tab/templateId/templateName/templateDetailId)** 로 확인. URL 기반 탭 덕에 딥링크로 안정 검증(탭 클릭 불필요). 탭 점프의 "특정 상세 자동 오픈"까지 실측.

## 클린업 / 서버
- 쓰기 없음 → 클린업 불필요. `search=QA_E2E` 잔여 0 재확인. **BE :3000(14296)·FE :5173 유지.**

---

# App.tsx 근본수정(pathname key) 전역 회귀 + 드로어 리사이즈 — 2026-07-21

- **변경**: `App.tsx` CSSTransition `key`를 `location.key`→`css-transition-${location.pathname}`. 같은 경로 내 쿼리 변경(필터/페이징/탭/상세)은 리마운트 안 함(경로 변경 시에만). + 드로어 4종 `ResizableDrawer`(드래그 리사이즈 + localStorage). 조회만 → 클린업 불필요.
- **환경**: :3000 BE 14296(non-dev/5432/Admin@123), FE :5173.
- **총평**: **회귀 없음.** double-load 해소 확인, 전역 스윕 정상, 리사이즈 정상.

## 검증 A: App.tsx 전역 회귀 스윕

| # | 항목 | 결과 | 근거 |
|---|---|---|---|
| A-3a | **템플릿 상세 double-load 해소(핵심)** | **PASS** | `?tab=template`에서 itemCount 링크 클릭 → `GET items?templateid=10599` **1회**, `GET templates/10599` **1회**, 드로어 **1개**(이전 2회 로드→1회) |
| A-3b | [관리] 버튼도 단일 로드 | **PASS** | items 1회 / detail 1회 |
| A-2 | 같은 경로 쿼리 변경(검색) | **PASS** | 템플릿 검색 "Linux" → URL `keyword=Linux`, 목록 1회 refetch, 콘솔 에러 0(리마운트/깜빡임 없이 갱신) |
| A-4 | ScrollToTop | **PASS** | 스크롤 188→페이지 이동 후 scrollY=0 |
| A-1 | 메뉴 스윕(경로 변경 9개) | **PASS** | /home·/asset/list·/asset/cost·/monitoring/host-group·/monitoring/server-monitoring·/event-alert/problem·/zabbix-management/{host-management,item-template-management,connection-info} 전부 로드 정상, **실제 콘솔 에러/pageerror 0** |

**A-1 초기 오탐 해명(3페이지 content=false)**: 전부 false positive — `/asset/cost`="Costs view is coming soon (Phase 2)" 의도적 플레이스홀더, `item-template-management`=정상 렌더(3탭+빈상태 "Search and select a template", 콘솔은 AntD `destroyInactiveTabPane/destroyOnClose` deprecation **경고**뿐), `connection-info`=Zabbix API 계정 폼 정상. bodyLen>400 임계값이 높았던 탓(짧지만 유효한 콘텐츠).

**참고**: DmoveTable의 `limit=20→limit=10` 이중 fetch 패턴은 remount double-load와 무관한 별개 기존 패턴(정상 페이지에도 존재). App.tsx 변경은 same-path 쿼리변경 리마운트만 제거하므로 **경로이동 스윕은 구조적으로 무영향**.

## 검증 B: 드로어 리사이즈 (TemplateDetailDrawer 대상 end-to-end)

| # | 항목 | 결과 | 근거 |
|---|---|---|---|
| B0 | 드로어 열림 + 리사이즈 핸들 | **PASS** | `[data-testid="resizable-drawer-handle"]` 존재, 초기 620px |
| B1 | 좌경계 드래그 → 너비 변경 + 저장 | **PASS** | 드래그 620→820px, `localStorage["itemTpl.drawerWidth.templateDetail"]="820"` |
| B2 | 닫았다 재오픈 → 저장 너비 복원 | **PASS** | 재오픈 시 820px 복원 |
| B3 | min 클램프(400) | **PASS** | 축소 드래그 → 400px 고정 |
| B4 | max 클램프(90vw) | **PASS** | 확대 드래그 → 1530px(1700×0.9) 고정 |

- 4종 드로어(TemplateDetailDrawer/TemplateGroupDetailDrawer/TemplateFormDrawer/ItemFormDrawer) 모두 `ResizableDrawer` + storageKey `itemTpl.drawerWidth.{templateDetail,groupDetail,templateForm,itemForm}` 적용(소스 확인). templateDetail은 실 드래그로 end-to-end 검증.

## 발견 회귀
- **없음.** double-load 근본수정이 다른 페이지를 깨뜨리지 않았고, 대상 페이지의 상세 2번 로드는 1회로 해소됨.

## 육안/방식
- double-load 판정은 **네트워크 요청 카운트**로 실측(items?templateid=/templates/{id} 각 1회). 리사이즈는 실제 마우스 드래그 + localStorage/DOM 너비 측정. 콘솔 에러는 pageerror+console.error 캡처(AntD deprecation 경고는 실에러에서 제외).

## 클린업 / 서버
- 쓰기 없음 → 클린업 불필요. **BE :3000(14296)·FE :5173 유지.**
