# 계약 — Web 시나리오 관리 (Zabbix 관리 > Web 시나리오, 유료)

- 작성 2026-10-27 · BE 브랜치 `zabbix-web-scenario`(워크트리 `C:\worktrees\zbx-web-be`) · FE 같은 이름(`C:\worktrees\zbx-web-fe`)
- Zabbix `httptest.*` 래핑. Zabbix UI의 Data collection › Hosts/Templates › Web(정의)과 Monitoring › Web(최근 결과)에 해당한다.
- 🔴 **유료 기능** — 라이선스 Feature `WEB_SCENARIO`(PREMIUM 기본 포함). 컨트롤러 `@RequiresFeature(Feature.WEB_SCENARIO)`, FE 라우트 `FeatureGate("WEB_SCENARIO")`.
  미보유면 HTTP 200 + `errorCode: LICENSE_FEATURE_REQUIRED`(기존 게이트 계약).
- 🔴 **APM 합성 감시(`/apm/synthetics`)와 코드 공유 없음** — 이 기능은 `zabbixadmin/`(코어)에 두고 `premium.apm..`을 import하지 않는다. APM을 별도 제품으로 떼어 내도 이 화면은 남는다(사용자 결정 2026-10-27). 가용성·p95·캘린더·한국어 실패 사유는 APM 몫이고 여기엔 없다 — **Zabbix가 기본으로 주는 것만**.
- 전 EP **관리자 전용**(`AdminAccessChecker.requireAdmin`). 로컬 저장 없음, 서비스 계정 토큰, 쓰기는 `zabbix_change_log`(entityType `WEB_SCENARIO`).

## 1. 읽기 전용 규칙

| 구분 | 판정 | 화면 | 쓰기 시 BE |
|---|---|---|---|
| 템플릿 상속 | `templateid ≠ "0"` | `inherited=true`, `sourceTemplateName`(부모 시나리오의 템플릿, 한 단계) | `WEB_SCENARIO_INHERITED_READONLY: 시나리오명` |

상속 시나리오도 **켜기/끄기(status)는 Zabbix가 허용**하지만 이번 범위에서는 막는다(원본 템플릿에서 바꾸는 것이 정본 — 그래프와 같은 규칙). 삭제는 하나라도 상속이면 아무것도 지우지 않는다.

## 2. GET `/zabbix-manage/web-scenarios`

쿼리(건수는 `countOutput`, 행은 이름·httptestid 순으로 페이지 끝까지만 받는다 — 전체 행을 받지 않음): `hostid` | `templateid` | `groupid`(호스트 그룹 — 그 그룹 호스트들의 시나리오) 중 0~1개(우선순위 hostid > templateid > groupid, 없으면 전체 호스트) · `search`(이름 부분일치) · `status`(`0` 사용 / `1` 중지) · `limit`(기본 20, 최대 200) · `offset`.
- 템플릿 대상이 아니면 **호스트 시나리오만**(`templated=false`) — 템플릿 원본과 호스트 복사본이 한 목록에 섞이지 않게.

응답 `PagedListDto<ManagedWebScenarioDto>`:
```json
{ "httptestid": "12", "name": "로그인", "ownerId": "10644", "ownerName": "web-01", "ownerType": "host",
  "delay": "1m", "retries": "1", "status": "0", "stepCount": 3, "agent": "Zabbix",
  "inherited": false, "sourceTemplateName": null, "editable": true,
  "lastCheck": 1761530000, "lastFailedStep": 0, "lastFailedStepName": null, "lastError": null, "lastResult": "OK" }
```
- `ownerType`: `host` | `template`. `status`·`retries`는 Zabbix 원시 문자열.
- 최근 결과(호스트 시나리오만, 템플릿은 전부 null·`lastResult=UNKNOWN`): Zabbix가 시나리오마다 만드는 아이템 `web.test.fail[이름]`(**실패한 단계 번호, 0=성공** — 불리언 아님)·`web.test.error[이름]`의 `lastvalue`/`lastclock`.
  - `lastResult`: `OK`(fail=0) · `FAIL`(fail>0) · `UNKNOWN`(아직 실행 안 됨·아이템 없음·`lastclock=0`) · `DISABLED`(status=1).
  - `lastFailedStepName`: `steps[].no == fail`인 단계 이름(목록은 단계 이름·번호만 가져온다).
  - 아이템 조회는 `item.get` `webitems=true` + `filter.key_`(정확한 키 — Zabbix 프런트엔드 `quoteItemKeyParam`과 같은 규칙 — 이름이 `"`로 시작하거나 쉼표·`]`가 있을 때만 `"…"`로 감싸고 안쪽 `"`는 `\"`). 키는 호스트 안에서만 유일하므로 `(hostid, key)`로 맞춘다.

## 3. GET `/zabbix-manage/web-scenarios/{httptestid}` — 편집 프리필

`ManagedWebScenarioDetailDto`: `summary`(목록 행과 같은 객체) + 정의 전체:
```json
{ "summary": { "...목록 행": "" },
  "authentication": "0", "httpUser": "", "httpPasswordSet": false, "httpProxy": "",
  "verifyPeer": "0", "verifyHost": "0", "sslCertFile": "", "sslKeyFile": "", "sslKeyPasswordSet": false,
  "variables": [{"name": "{user}", "value": "a"}], "headers": [{"name": "Accept", "value": "*/*"}],
  "tags": [{"tag": "svc", "value": "shop"}],
  "steps": [{ "httpstepid": "31", "no": 1, "name": "메인", "url": "https://…", "timeout": "15s",
              "required": "", "statusCodes": "200", "followRedirects": "1", "retrieveMode": "0",
              "postType": "raw", "posts": "", "postFields": [], "queryFields": [], "headers": [], "variables": [] }] }
```
- 🔴 `http_password`·`ssl_key_password`는 **내려가지 않는다**(`…Set`으로 있는지만). Zabbix 7.0 get은 이 둘을 돌려주지만 화면에 비밀값을 싣지 않는다(ZM-100 규약).
- ⚠️ 헤더·변수·본문·`http_proxy`(`user:pass@` 포함 가능)는 상세에 **그대로** 싣는다 — 폼이 전체 교체로 되돌려 보내야 하고, 유료 + 관리자 전용이며 Zabbix 화면과 같은 노출 범위다. 변경 이력에는 남기지 않는다(§4).
- 이름/값 쌍은 **배열**(`[{name,value}]`) — Zabbix 원형 그대로. 같은 이름 헤더 여러 개·순서가 보존된다(APM은 Map이라 잃는다).
- `postType`: `raw`(posts 문자열) | `form`(posts 배열 → `postFields`). 🔴 판정은 `posts`의 **실제 타입**이 정본(`post_type` 코드는 읽기 전용 보조). steps는 `no` 순.
- 없으면 `WEB_SCENARIO_NOT_FOUND`.

## 4. POST `/zabbix-manage/web-scenarios` · PUT `/zabbix-manage/web-scenarios/{httptestid}`

요청은 Zabbix 원본 키(snake) — 그래프 계약과 같은 관례.
```json
{ "hostid": "10644", "name": "로그인", "delay": "1m", "retries": 1, "agent": "Zabbix", "status": 0,
  "authentication": 0, "http_user": "", "http_password": "", "clear_http_password": false, "http_proxy": "",
  "verify_peer": 0, "verify_host": 0, "ssl_cert_file": "", "ssl_key_file": "", "ssl_key_password": "", "clear_ssl_key_password": false,
  "variables": [{"name": "{user}", "value": "a"}], "headers": [], "tags": [{"tag": "svc", "value": "shop"}],
  "steps": [{ "httpstepid": "31", "is_new": false, "no": 1, "name": "메인", "url": "https://…", "timeout": "15s",
              "required": "", "status_codes": "200", "follow_redirects": 1, "retrieve_mode": 0,
              "post_type": "raw", "posts": "", "post_fields": [], "query_fields": [], "headers": [], "variables": [] }] }
```
- 생성: `hostid`|`templateid`·`name`·`steps`(1개 이상) 필수. 응답 = 생성 직후 상세.
- 수정: **보낸 필드만**. `hostid`/`templateid`는 무시(🔴 Zabbix가 소속 이동을 지원하지 않는다 — 옮기려면 지우고 다시 만들어야 하고 이력이 끊긴다).
- 🔴 `steps`·`variables`·`headers`·`tags`는 보내면 **전체 교체**, 안 보내면 유지.
- 🔴 **단계 id 보존**(이력 보호): 수정에서 `steps`를 보낼 때 기존 단계는 `httpstepid`를 그대로 되돌린다. id가 없으면 ① 이름이 같은 기존 단계가 있으면 서버가 id를 되붙이고 ② 없는데 `is_new=true`도 아니면 `WEB_SCENARIO_STEP_ID_REQUIRED: 단계명`. 이 시나리오에 없는 `httpstepid`는 `WEB_SCENARIO_STEP_INVALID: id`. (id를 빼면 Zabbix가 단계를 지우고 새로 만들어 그 단계의 응답 시간 이력이 **오류 없이** 끊긴다.)
- 단계: `name`·`url` 필수(`WEB_SCENARIO_STEP_INVALID: n번 단계`), 이름 중복 금지(결과 아이템 키가 이름을 쓴다), `no` 생략 시 배열 순서(1부터), `no` 중복 금지. `post_type=form`이면 `post_fields`를 `posts` 배열로, `raw`면 `posts` 문자열로 보낸다(Zabbix 쓰기 스키마에 `post_type`이 없다 — 값의 타입이 형식을 정한다).
- 비밀값: `http_password`/`ssl_key_password`는 **비우면 유지, 채우면 교체**, `clear_*=true`면 빈 값으로 지운다.
- 이름/값 쌍은 `name` 빈 행을 버린다. 그 밖의 키(get 응답의 `httptestid`·`templateid`·`uuid` 등)는 받지 않는다(DTO에 없음).
- 오류: `WEB_SCENARIO_TARGET_REQUIRED` · `WEB_SCENARIO_NAME_REQUIRED` · `WEB_SCENARIO_STEPS_REQUIRED` · `WEB_SCENARIO_STEP_INVALID` · `WEB_SCENARIO_STEP_ID_REQUIRED` · `WEB_SCENARIO_INHERITED_READONLY` · `WEB_SCENARIO_NOT_FOUND` · `WEB_SCENARIO_CREATE_FAILED`. Zabbix 거부(이름 중복·delay 형식 등)는 원문.

🔴 변경 이력 payload는 **값을 그대로 남기지 않는다**(이력은 시나리오 삭제 뒤에도 남는다): 소속 `hostid`(호스트별 이력 조회 키) · 스칼라 값 · 비밀번호 `***` · `http_proxy`는 자격 증명을 가린 주소 · 변수·헤더는 **이름만** · 태그 그대로 · 단계는 `httpstepid·no·name·url`(URL의 자격 증명·쿼리 가림)만. 삭제 이력도 `{hostid}`를 남긴다.

## 5. DELETE `/zabbix-manage/web-scenarios`

본문 `{ "ids": ["12"] }` → `{ "ids": [...], "count": n }`(`DiscoveryDeleteResDto`). 빈 목록 `WEB_SCENARIO_IDS_REQUIRED`, 없는 id 포함 `WEB_SCENARIO_NOT_FOUND`, 상속 포함 시 §1 코드로 전부 거부.
🔴 삭제하면 결과 아이템과 이력이 함께 사라진다 — FE 확인창이 이를 알리고 "잠시 멈춤은 중지(status)"를 안내한다.

## 6. 라이선스

- BE·발급기 `Feature`에 `WEB_SCENARIO` 추가(🔴 두 사본 동일 — `LicenseContractTest`), `Edition.PREMIUM` 기본 포함.
- 구버전 제품은 키의 모르는 기능을 무시한다(`LicenseKeyVerifier.parseFeatures` — 경고 로그만). PREMIUM 고객은 키 재발급 없이 새 제품에서 바로 쓴다.
- FE `TLicenseFeature`·`LICENSE_FEATURE_CATALOG`·i18n `license_settings.feature.web_scenario(_desc)`.

## 7. FE

- 경로 `/zabbix-management/web-scenario-management`, Zabbix 관리 메뉴 항목(미보유면 잠금 표시 — 기존 `FeatureLockedLabel`).
- 목록: 대상 선택 상자 **하나**(호스트·템플릿·그룹 묶음, 값 `kind:id`, URL `hostids|templateids|groupids` 중 하나만 — 공용 필터의 선택 상자는 처음 값만 보여 줘서 셋을 따로 두면 지운 필터가 화면에 남는다, 2026-10-27 사용자 결정) · 검색 · 상태 필터 · 최근 결과 배지(OK/FAIL/UNKNOWN/DISABLED, 실패 단계·오류 툴팁) · 마지막 확인 시각. 표는 `maxPageSize=SERVER_PAGE_CAP.ZABBIX_MANAGE`.
- 생성·수정 패널(`ResizableDrawer`): 시나리오 탭(이름·주기·재시도·에이전트·상태·HTTP 프록시·변수·헤더·태그) / 단계 탭(순서 이동·추가·삭제, 단계별 URL·쿼리·본문(raw/form)·헤더·변수·타임아웃·요구 문자열·응답 코드·리다이렉트·가져오기 방식) / 인증 탭(방식·사용자·비밀번호(비우면 유지)·SSL 검증·인증서 파일).
- 상속 시나리오는 읽기 전용 보기.

## 8. 검수·검증 기록

- BE Codex 1차 반려(비밀값이 변경 이력에 남음·전체 id 조회·정렬·호스트 이력 키) → 2차 조건부 승인(모호한 프록시 주소 가림) → 반영.
- FE Codex 1차 반려(상세 재조회가 편집 중 값을 덮음·읽기 전용 단계 버튼·대상 필터 배타·테스트) → 2차 반려(대상 필터 표시) → 사용자 결정(선택 상자 하나) → 3차 승인.
- 런타임 실측(dev Zabbix 7.0.6, 2026-10-27 BE 재기동 후) 통과:
  - 목록: 전체 호스트 시나리오 22건, 최근 결과 OK 1·FAIL 13·UNKNOWN 8. FAIL은 실패 단계 번호·단계명·Zabbix 오류 원문(예: response code "302" did not match "200")이 붙는다.
  - 생성(호스트 10084, 단계 2 — RAW·폼): 비밀번호는 응답에 없음(`httpPasswordSet=true`), 같은 이름 헤더 2개 보존.
  - 수정(순서 바꿈 + 개명 + 새 단계): 기존 단계 id 45·46 유지, 새 단계 47. id 없는 개명은 `WEB_SCENARIO_STEP_ID_REQUIRED`, 남의 id는 `WEB_SCENARIO_STEP_INVALID`, 이름 중복은 Zabbix 원문.
  - 템플릿(10076) 생성: `ownerType=template`·`UNKNOWN`. 템플릿 목록에만 나오고 전체 호스트 목록에는 안 나온다.
  - 변경 이력: 비밀번호·Authorization 헤더·폼 비밀번호·URL 쿼리 토큰이 남은 행 0건, 쿼리는 `?***`, 삭제 이력에 `{hostid}`.
  - 정리: 시험 시나리오 2건 삭제, 남은 것 0.
  - ⚠️ 새로 만든 시나리오(호스트 zabbix-server)는 약 140초 동안 결과가 없어 `UNKNOWN`이었다. 같은 호스트의 기존 시나리오 8건도 `UNKNOWN`이라 그 호스트에서 Web 시나리오가 실행되지 않는 dev 환경 쪽 사정으로 보인다(다른 호스트의 결과는 정상 표시).
