# E2E 런타임 검증 — 호스트 분류(device_type) + 태그 CRUD + 일괄 지정

- 검증자: functional-qa, 2026-07-21 (앱 실제 기동, 런타임 행위)
- 계약: `_workspace/features/zabbix-config/classification-tags/contract_host-classification-tags.md` / 정적 QA: `_workspace/features/zabbix-config/classification-tags/qa_host-classification-tags.md`(integration-qa PASS)
- BE: `moveseye-be-spring` **clean build 후** :3000 재기동("Started MoveseyeApplication", 13s) — stale build 아님, 신규 EP 실서빙 확인
- FE: `moveseyee_fe` vite :5173 (HMR 최신 코드)
- 환경 제약: **dev Zabbix 실 호스트 1개**("Zabbix server", hostid=10084)만 존재 → 다중 호스트 일괄은 실호스트1+가짜id 조합으로 검증. 자산 스냅샷은 74건(별개 테이블).
- 인증: `POST /auth/login {username:admin,password:<dev-admin-pw>}` → **accessToken은 body가 아니라 쿠키(Set-Cookie)**로 내려옴(과거 `.data.token` 아님 — 검증 시 주의). Bearer로 재사용 시 200.
- 산출물: `_hct_api.mjs`/`_hct_api_result.json`(S1~S7), `_hct_bulk.mjs`(S6 실호스트), `_hct_asset.mjs`(S8), `_hct_ui.cjs`/`_hct_ui_result.json`(DOM), 스크린샷 `e2e-hct-01-list-bulk.png`

## 결과 요약표

| # | 시나리오 | 결과 | 근거(레벨) |
|---|----------|------|-----------|
| 1 | 목록 조회 + 분류 컬럼 렌더 | **PASS** | API: 전 항목 tags[]/deviceType(6종) 보유 · UI: "Type" 컬럼 + "Not classified" 배지 |
| 2 | 수정 폼 분류 변경(→server) 저장·반영 | **PASS** | API PUT 200, 재조회 deviceType=server · UI: Device type Select 존재 |
| 3 | **[최우선 회귀] 타 태그 보존** | **PASS** | env=prod가 분류변경·태그CRUD·미분류 전 과정에서 보존 |
| 4 | 임의 태그 CRUD(추가/수정/삭제) | **PASS** | role web→api→삭제 정상, device_type 태그 1개 유지(중복 없음) |
| 5 | 미지정(notClassified) 저장 | **PASS** | device_type 태그 삭제, deviceType=notClassified, env 보존 |
| 6 | 일괄 분류 지정 + 부분실패 | **PASS** | 실호스트 bulk 반영·타태그 보존 · success/failed 분리 · UI 툴바 노출 |
| 7 | 에러 경로 | **PASS** | INVALID_DEVICE_TYPE / HOST_IDS_REQUIRED 모두 HTTP200+code400+errorCode |
| 8 | 자산 반영(syncOne) | **PASS** | /assets deviceType가 notClassified→database 동기 반영 후 복원 |

**HIGH/버그 0건. 태그 보존 회귀 통과.** 전 시나리오 런타임 PASS.

---

## 시나리오별 상세

### S1 목록 + 분류 컬럼 — PASS
- API `GET /hosts/manage`: `allHaveTagsDeviceType=true`, deviceType 분포 `{notClassified:1}`, 모든 항목 6종 문자열.
- UI(DOM): 헤더 `["","Host","Groups","Type","IP:Port","Proxy","Templates","Status","Agent","Actions"]` — 분류 컬럼("Type") 렌더. 1행 태그 `["Zabbix servers","Not classified","Up"]` = 그룹 태그 + **분류 배지("Not classified")** + agent 배지. rowCount=1(실호스트 수 일치).

### S2 분류 변경 저장 — PASS
- `PUT /hosts/manage/10084` deviceType=server → http200/code200, 응답 tags에 `{device_type:server}` 포함, 재조회 deviceType=server.
- UI: 수정 Drawer에 "Device type" 폼항목 = Select(값 "Not classified" 프리필). "Tags" 폼항목 별도 존재. 분류가 태그 편집 UI와 분리됨(계약 §5).

### S3 타 태그 보존 [최우선 회귀] — PASS
- 10084에 `env=prod` 외래 태그 부여 + deviceType=server 저장 → 재조회 tags `["device_type=server","env=prod"]`.
- **env=prod가 소실되지 않음**(전체교체 함정 회피 확인). device_type 태그 정확히 1개.
- 이후 S4 태그CRUD·S5 미분류 전 과정에서도 env=prod 지속 보존(`env_preserved_through_crud=true`, `env_still_there=true`).

### S4 임의 태그 CRUD — PASS
- 추가 role=web → 재조회 포함. 수정 web→api → `role=api` 있고 `role=web` 없음. 삭제 → role 태그 소멸.
- 전 과정 device_type 태그 **정확히 1개**(중복 노출 없음). env=prod 보존.
- UI: 폼 tags 프리필은 device_type 제외(HostFormDrawer round-trip), 저장 시 deviceType 필드 별도 전송 — 서버 재조립 확인.

### S5 미지정 저장 — PASS
- deviceType=notClassified 저장 → 재조회 `device_type` 태그 **삭제됨**, deviceType="notClassified", env=prod 잔존. 목록 표시 "Not classified".

### S6 일괄 지정 + 부분실패 — PASS (실호스트 `_hct_bulk.mjs`)
- `PATCH /hosts/manage/device-type {hostIds:["10084"],deviceType:"network"}` → 200, `success:["10084"]`, 재조회 deviceType=network, 외래 태그 `team=infra` 보존.
- **부분실패**: `{hostIds:["10084","99999999"],deviceType:"security"}` → 200, `success:["10084"]` + `failed:[{hostid:"99999999",reason:"HOST_NOT_FOUND"}]`, 실호스트 반영(security), team 보존.
- 일괄 미분류: → device_type 태그 삭제, team 보존.
- UI: 행 체크박스 선택 시 일괄 툴바 노출(버튼 "Apply"/"Clear" 출현, 선택 인디케이터 true).

### S7 에러 경로 — PASS
- bulk 잘못된 deviceType("bogus_type"): http200 / code400 / errorCode=`INVALID_DEVICE_TYPE`.
- bulk 빈 hostIds([]): http200 / code400 / errorCode=`HOST_IDS_REQUIRED`.
- PUT 잘못된 deviceType: http200 / code400 / errorCode=`INVALID_DEVICE_TYPE`.
- 부분실패 failed[] 반환 확인(위 S6). FE onSuccess(failed 요약 warning)/onError(throw) 분리 소비는 정적QA에서 확인됨.

### S8 자산 반영 — PASS
- `/assets`(74건 스냅샷) 도달. 10084 자산 deviceType가 bulk(database) 후 `notClassified→database` 반영(create/update/bulk 말미 `assetSyncService.syncOne` 동작), 복원 후 notClassified. 자산은 live 호스트(1)와 별개 스냅샷 테이블(74)임 확인.

---

## 정리
- 테스트로 변경한 10084 상태는 **전부 원복**(최종 `deviceType=notClassified, tags=[]` 확인). 잔여 테스트 태그 없음.
- BE :3000 / FE :5173 검증 후 상태(BE는 clean build 재기동본 유지 중 — 필요 시 종료).

## 재현 명령
```
node C:/solutions/_workspace/_hct_api.mjs      # S1~S7 (자동 원복 포함)
node C:/solutions/_workspace/_hct_bulk.mjs     # S6 실호스트 일괄/부분실패
node C:/solutions/_workspace/_hct_asset.mjs    # S8 자산 동기 반영
node C:/solutions/_workspace/_hct_ui.cjs       # DOM 어서션(컬럼/폼/툴바)
```
