# API 계약 — 호스트 분류(device_type) + 임의 태그 CRUD

- 산출: be-engineer, 2026-07-20
- 구현: `moveseye-be-spring` — `com.dmove.moveseye.host.manage.*` (컨트롤러 `HostManageController`, 서비스 `HostManageService`)
- **기존 [`features/zabbix-config/host-registration/contract_host-registration.md`](../host-registration/contract_host-registration.md)의 델타**다. 공통 래퍼/언랩/에러 형태/권한(전 EP admin, `userRole` ∈ {ADMIN,SUPER_ADMIN})·기존 필드는 그 문서를 따르고, 여기선 **추가·변경분만** 기술한다.
- 마이그레이션 없음(태그/분류는 Zabbix 태그로만 저장, 감사로그는 기존 host_change_log JSONB에 기록). Flyway 최신 V12 그대로.
- 하위호환: 기존 요청/응답에 **필드 추가만**(제거·rename 없음) → 기존 host-registration FE는 그대로 동작.

---

## 0. 핵심 개념 — device_type 파생 규칙 & 태그 round-trip 전제

### device_type 파생 규칙 (BE 단일화, `DeviceTypeResolver`)
- 유효 분류 6종: `server` / `network` / `security` / `database` / `hardware` / `notClassified`.
- **응답 `deviceType`**: 호스트 태그 중 `device_type` 태그가 **정확히 1개**이고 그 값이 유효 6종이면 그 값, **그 외(0개·2개 이상·미유효값)는 `notClassified`**. → 응답 `deviceType`은 **항상 6종 중 하나(절대 null 아님)**.
- **요청 `deviceType`(편의 필드)**: 최종 저장 태그 = 요청 `tags`에서 `device_type` 태그를 **모두 제거**한 뒤, `deviceType`이 유효하고 `notClassified`가 **아니면** `{tag:"device_type", value:deviceType}` **1개**를 추가한 결과.
  - `null` / `""`(빈값) / `notClassified` → device_type 태그 **없음**(= 미분류로 저장/삭제).
  - 요청 `tags`에 사용자가 `device_type` 태그를 섞어 보내도 **무시**(서버가 제거) → 분류는 항상 `deviceType` 필드가 단독 소스. 중복/다중 device_type 자연 정리됨.
  - 유효성: `null`/빈값 또는 6종만 허용. **그 외 값은 `INVALID_DEVICE_TYPE`(400)** — Zabbix 미호출.

### 태그 전체 교체(round-trip) 전제 — ⚠️ FE 필독
- Zabbix `host.update`의 `tags`는 **전체 교체(replace) 시맨틱**이다. 부분 병합이 아니다.
- 그래서 **수정(PUT)·생성(POST) 폼은 호스트의 모든 태그를 round-trip 해야 한다**: 화면에 현재 전체 태그를 싣고, 사용자가 편집한 전체 목록을 그대로 `tags`로 보낸다. 보낸 목록이 곧 최종 상태.
- **`tags` null vs 빈 배열 구분(PUT에서 중요)**:
  | 요청 `tags` | 의미(PUT) |
  |-------------|-----------|
  | `null`(키 생략) | 태그 **미변경**(현재 태그 보존) — 서버가 `tags`를 Zabbix에 아예 안 넘김 |
  | `[]`(빈 배열) | **모든 태그 삭제** |
  | `[{...}, ...]` | 그 목록으로 **전체 교체** |
  - ⚠️ PUT에서 `tags==null`이면 `deviceType` 필드도 **반영되지 않는다**(태그를 건드리지 않으므로). device_type만 바꾸려면 아래 **일괄 EP**(`PATCH /device-type`)를 쓰거나, PUT 시 전체 `tags`를 함께 보낼 것.
  - POST(생성)에서는 `tags==null`이면 빈 목록으로 취급(단, `deviceType`이 유효하면 device_type 태그 1개는 생성됨).

---

## 1. 변경점 — 요청 DTO에 필드 추가

### `HostCreateReqDto`(POST) / `HostUpdateReqDto`(PUT, 상속) 에 추가

| 추가 필드 | 타입 | 필수 | 설명 |
|-----------|------|------|------|
| `tags` | `HostTagDto[]` | no | 임의 태그 목록(전체 교체). `device_type`은 섞여 와도 서버가 제거. POST: null=태그 없음. PUT: null=미변경/`[]`=전체삭제(위 표) |
| `deviceType` | string | no | 분류 편의 필드. `null`/`""`/`notClassified`=미분류, `server`/`network`/`security`/`database`/`hardware`=해당 분류. 그 외 400 |

### `HostTagDto` (신규 record, 요청·응답 공용)
```jsonc
{ "tag": "env", "value": "prod" }   // value는 빈 문자열 "" 허용. tag가 blank인 항목은 무시됨
```
| 필드 | 타입 | 설명 |
|------|------|------|
| `tag` | string | 태그 키 |
| `value` | string | 태그 값(빈 문자열 허용, null→""로 저장) |

> `HostUpdateReqDto`는 `HostCreateReqDto`를 상속하므로 `tags`/`deviceType`을 자동 보유 + 기존 `clearTemplateIds` 유지.

---

## 2. 변경점 — 응답 DTO `ManagedHostDto`에 필드 추가

(GET 목록·POST·PUT 응답 모두 동일 shape) — 기존 필드 끝에 **2개 추가**:

| 추가 필드 | 타입 | nullable | 설명 |
|-----------|------|----------|------|
| `tags` | `HostTagDto[]` | no | **전체 태그**(device_type 태그 **포함**). 폼 round-trip 소스. 태그 없으면 `[]` |
| `deviceType` | string | no | 파생 분류(위 규칙). **항상 6종 중 하나**(null 아님, 미분류는 `"notClassified"`) |

> FE 표시 팁: 분류 배지는 `deviceType`로, 태그 편집 UI는 `tags`로. 태그 목록에서 `device_type` 항목을 숨기고 싶으면 FE가 `tag==="device_type"`을 필터. 단 **저장 시엔 필터한 목록 + `deviceType` 필드**를 함께 보내면 서버가 재조립한다.

---

## 3. 신규 EP — `PATCH /hosts/manage/device-type` (분류 일괄 변경)

- 권한: admin(`AdminAccessChecker.requireAdmin`) · Content-Type: `application/json`
- 용도: 목록에서 여러 호스트 선택 → 분류만 일괄 지정/해제. **각 호스트의 다른 태그는 보존**(호스트별 현재 태그 fetch → device_type만 교체/제거 → `host.update` 전체 태그 전달).
- 요청 body: **`HostDeviceTypeBulkReqDto`**

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `hostIds` | string[] | **yes** | 대상 Zabbix hostid 목록. blank 항목 제거 후 비면 `HOST_IDS_REQUIRED`(400) |
| `deviceType` | string | no | 파생 규칙과 동일. null/빈값/`notClassified`=device_type 태그 제거(미분류), 6종=해당 값. 그 외 `INVALID_DEVICE_TYPE`(400) |

- **부분 실패 허용**: hostId별 독립 처리. 실패해도 나머지는 진행. 성공 건은 감사로그(action=`UPDATE`, payload `{action:"device-type-bulk", deviceType}`) + `assetSyncService.syncOne`.
- 응답 data: **`HostDeviceTypeBulkResDto`**

```jsonc
{
  "success": ["10644", "10646"],           // 성공한 hostid[]
  "failed":  [ { "hostid": "10645", "reason": "HOST_NOT_FOUND" } ]  // 실패 항목
}
```
| 필드 | 타입 | 설명 |
|------|------|------|
| `success` | string[] | 성공한 hostid 목록 |
| `failed` | `FailedItem[]` | 실패 항목 |
| `failed[].hostid` | string | 실패한 hostid |
| `failed[].reason` | string | 사유(에러코드 문자열 `HOST_NOT_FOUND` 또는 예외 메시지) |

- **선검증(루프 진입 전, 전체 실패로 400)**: `deviceType` 유효성 → `INVALID_DEVICE_TYPE`; `hostIds` 비면 → `HOST_IDS_REQUIRED`. 이 둘은 공통 에러 래퍼(HTTP 200 + code 400)로 나가며 `success/failed` 응답이 아니다.
- 라우팅: 리터럴 `/hosts/manage/device-type`이라 `PUT/DELETE /{hostid}`·`PATCH /{hostid}/status`와 충돌 없음(메서드·구조 상이).

---

## 4. 추가 에러코드(errorCode)

| errorCode | 발생 EP | 의미 |
|-----------|---------|------|
| `INVALID_DEVICE_TYPE` | POST, PUT, PATCH /device-type | deviceType이 null/빈값/6종이 아님 |
| `HOST_IDS_REQUIRED` | PATCH /device-type | hostIds가 비어 있음 |

- 형태는 기존과 동일: **HTTP 200 + `{ status:"error", code:400, message:"<CODE>", errorCode:"<CODE>" }`**. FE는 `code`/`errorCode`로 분기.

---

## 5. FE 연동 요약(알아야 할 것)

1. **응답 필드 2개 추가**: `ManagedHostDto.tags`(HostTagDto[], device_type 포함), `ManagedHostDto.deviceType`(항상 6종 문자열). 타입 추가 시 옵셔널 아님.
2. **저장 시 태그 전체 round-trip**: 편집 폼은 전체 `tags`를 보내야 한다. device_type은 `tags`에 넣지 말고 `deviceType` 필드로 보낼 것(양쪽에 넣어도 서버가 정리하지만 혼란 방지).
3. **PUT에서 `tags` 생략(null) = 태그 미변경**. device_type만 바꾸려면 `PATCH /device-type` 일괄 EP 사용(단건도 hostIds에 1개 넣어 호출 가능) — 다른 태그를 건드리지 않아 안전.
4. **일괄 EP는 부분 실패**를 반환하므로 `failed[]`를 UI에 표시(예: "3건 중 1건 실패: 10645 없음").
5. 값은 여전히 문자열/일반 배열. `deviceType`은 소문자 6종이지만 `notClassified`만 camelCase.
6. **목록 `deviceType` 필터는 BE 미지원**(`ManagedHostListReqDto`에 파라미터 없음) → FE **클라이언트 사이드 필터(현재 페이지 한정)**로 동작. 서버 페이지네이션과 조합돼 페이지를 넘나드는 전역 필터는 되지 않는다. 전역 필터가 필요하면 후속으로 `GET /hosts/manage`에 `deviceType` 쿼리 파라미터 추가 필요(단 `notClassified`는 "태그 없음/다중/미유효" 포함이라 Zabbix 태그 필터로 서버 처리 곤란 — 별도 설계 필요). (integration-qa/functional-qa 확인, 2026-07-21)
