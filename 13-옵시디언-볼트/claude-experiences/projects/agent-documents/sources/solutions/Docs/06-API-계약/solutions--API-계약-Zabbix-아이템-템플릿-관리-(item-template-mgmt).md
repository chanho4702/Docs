# API 계약 — Zabbix 아이템·템플릿 관리 (item-template-mgmt)

- **대상 화면**: Zabbix 관리 > 아이템·템플릿 관리 (탭 2개: 아이템 / 템플릿)
- **BE**: `moveseye-be-spring` (Spring Boot 3.3), 패키지 `com.dmove.moveseye.zabbix.manage`
- **작성일**: 2026-07-20 (갱신 2026-07-22: §1-1 `sourceTemplate` 응답 필드 + `sourceTemplateId` 필터 파라미터 — §4-11)
- **정본 소스**: 이 파일 + springdoc `/v3/api-docs` (Swagger UI `/api`, dev 프로필만 on)

---

## 0. 공통 규약 (반드시 숙지)

### 응답 공통 래퍼 `ApiResult<T>`
모든 엔드포인트는 아래 래퍼로 감싸 응답한다.

```jsonc
{
  "status": "success",   // 성공 "success" / 실패 "error"
  "code": 200,           // HTTP 의미 코드(성공 200). 실패 시 400/403 등이 body에 실려도 HTTP는 대개 200
  "message": null,       // 성공 시 대개 null, 실패 시 에러코드 문자열
  "errorCode": null,     // 실패 시 에러코드 문자열(= message와 동일값)
  "data": { ... }        // 실제 페이로드(엔드포인트별 아래 참조). NON_NULL: null 필드는 생략됨
  // "syncTime": "..."   // 일부 성공 응답에 주입될 수 있음(무시 가능)
}
```
> FE 소비 규칙(기존 `useDmoveQuery` 관례): axios 인터셉터 + 훅이 2겹 언랩 → **소비자는 `data` 페이로드를 직접 수신**. 즉 목록 EP는 `PagedListDto`(items/total/limit/offset)를 바로 받는다.

### 에러 응답 (⚠️ 계약 보존 — CLAUDE.md §3)
- **비즈니스 에러는 HTTP 200 + body**: `{ status:"error", code:400, message:"<CODE>", errorCode:"<CODE>" }`.
- **권한 거부(403)도 HTTP 200 + body `code:403`** (`message:"Access Denied"`). 401만 실제 HTTP 상태.
- **검증 실패**(Bean Validation): HTTP 200 + `code:400`, `message`는 위반 필드 메시지들을 `\n`으로 join (예: `"name is required\nkey is required"`). `data` 없음.
- Zabbix가 거부한 작업(잘못된 key_/type 조합, 권한 등)은 `code:400`, `message`에 Zabbix가 준 에러 문자열(또는 `ZABBIX_API_ERROR`).

### 권한
- **전 엔드포인트 관리자 전용**. `userRole ∈ {ADMIN, SUPER_ADMIN}` 아니면 `ForbiddenError`(HTTP200 + code:403).
  (roleid 기반 `@RolesGuarded`가 아니라 `AdminAccessChecker.requireAdmin` — 순수 admin roleid=null 함정 회피.)
- 인증: JWT accessToken 쿠키(`withCredentials`) + `@VisitorIdCheck`. FE는 기존 axios 설정 그대로.

### 값 표현 규칙
- Zabbix 원시 문자열 보존: `status`/`type`/`valueType`/`flags`/`monitoredBy` 등 **숫자 의미값도 문자열**("0","1"...)로 내려간다(host-manage 관례).
- 페이징: `limit` 기본 20(1~200 클램프), `offset` 기본 0. **서버가 전체를 조회 후 메모리 윈도잉** → `total`은 필터 적용 후 전체 건수.

---

## 1. 아이템 (탭 1) — base `/zabbix-manage/items`

### 1-1. GET `/zabbix-manage/items` — 목록
Query params (`@ModelAttribute`):

| 파라미터 | 타입 | 옵셔널 | 설명 |
|---|---|---|---|
| `hostid` | string | Y | 이 호스트의 아이템만. `templateid`와 동시 지정 시 hostid 우선 |
| `templateid` | string | Y | 이 템플릿의 아이템만 |
| `sourceTemplateId` | string | Y | **(2026-07-22 추가)** 소스(정의처) 템플릿 필터 — 이 템플릿에서 **상속된** 아이템만 반환. **`hostid` 스코프에서만 유효**(템플릿/전체 스코프에선 무시). `templateid`(스코프 대상)와 다른 축 — 렌즈의 templateids 합집합 필터와도 다름(소스 기준). `total`은 필터 적용 후 건수, 페이징도 필터 후 산정 |
| `search` | string | Y | 아이템명(name)+키(key_) 부분검색(OR). blank=무시 |
| `status` | int | Y | 0=활성,1=비활성. null=전체 |
| `limit` | int | Y | 기본 20, 1~200 |
| `offset` | int | Y | 기본 0 |

**응답 `data` = `PagedListDto<ManagedItemDto>`**:
```jsonc
{ "items": [ ManagedItemDto ], "total": 42, "limit": 20, "offset": 0 }
```

**`ManagedItemDto`**:

| 필드 | 타입 | nullable | 설명 |
|---|---|---|---|
| `itemid` | string | N | Zabbix 아이템 ID |
| `hostid` | string | N | 소속 대상 ID(호스트 또는 템플릿 ID) |
| `hostName` | string | Y | 소속 대상 표시명(호스트/템플릿명) |
| `name` | string | N | 아이템명 |
| `key` | string | N | 아이템 키(Zabbix `key_`) |
| `type` | string | N | 유형(0=agent,2=trapper,3=simple,7=agent active,18=dependent,...) |
| `valueType` | string | N | 값 유형(0=float,1=char,2=log,3=uint,4=text) |
| `status` | string | N | 0=활성,1=비활성 |
| `delay` | string | Y | 수집 주기(예: `1m`) |
| `units` | string | Y | 단위 |
| `lastValue` | string | Y | 최근값 |
| `lastClock` | string | Y | 최근 수집 시각(epoch seconds 문자열) |
| `description` | string | Y | 설명 |
| `flags` | string | N | 0=일반,4=디스커버리 생성 |
| `interfaceid` | string | Y | 인터페이스 ID(0이면 미사용) |
| `templateid` | string | N | 상속 **부모 아이템 ID**(0=로컬 아이템). ⚠️ 템플릿 ID가 아님 — 템플릿 표시는 아래 `sourceTemplate` 사용 |
| `sourceTemplate` | object | Y | **(2026-07-22 additive)** 소스(정의처) 템플릿 `{ templateId: string\|null, templateName: string\|null }` — **`hostid` 스코프 목록의 상속 아이템에만 부착**. 호스트 직접 정의(local)·디스커버리(flags=4) 행, 템플릿 스코프 목록, 상세(1-2)/생성(1-3)/수정(1-4) 응답에서는 **null → JSON 생략**(필드 부재 = local로 간주). 역추적 실패(부모 소실 등) 시 필드가 null인 객체 가능 |

### 1-1b. GET `/zabbix-manage/items/keys` — key 자동완성
> 아이템 생성/수정 폼의 `key` 필드 자동완성 소스. 스코프 내 **이미 등록된 아이템의 key_ 목록**(key 기준 중복 제거)을 반환. `/{itemid}`보다 우선(literal) 매칭되므로 경로 충돌 없음.

Query params:

| 파라미터 | 타입 | 옵셔널 | 설명 |
|---|---|---|---|
| `hostid` | string | 조건 | 이 호스트의 아이템 키. `hostid`/`templateid` 중 **하나 필수**(hostid 우선) |
| `templateid` | string | 조건 | 이 템플릿의 아이템 키 |
| `search` | string | Y | key_ 부분검색. blank=무시 |
| `limit` | int | Y | 상한(기본 50, 1~200 클램프). 중복 제거 후 이 개수만 반환 |

**응답 `data` = `ItemKeyDto[]`** (페이징 래퍼 아님, 단순 배열):

| 필드 | 타입 | nullable | 설명 |
|---|---|---|---|
| `key` | string | N | 아이템 키(key_) |
| `name` | string | Y | 대표 아이템명(같은 key 다수면 첫 항목) |
| `type` | string | Y | 대표 아이템 유형(문자열, 0=agent 등) |

예: `[ { "key": "system.cpu.util", "name": "CPU utilization", "type": "0" }, { "key": "system.cpu.load", "name": "Load average", "type": "0" } ]`
- 에러: `ITEM_TARGET_REQUIRED`(hostid/templateid 모두 없음)

### 1-2. GET `/zabbix-manage/items/{itemid}` — 상세
- Path: `itemid` (string)
- **응답 `data` = `ManagedItemDto`** (위와 동일)
- 없으면 error `ITEM_NOT_FOUND`

### 1-3. POST `/zabbix-manage/items` — 생성
Request body `ItemCreateReqDto` (application/json):

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `hostId` | string | 조건 | 호스트에 생성 시. `hostId`/`templateId` 중 **하나 필수** |
| `templateId` | string | 조건 | 템플릿에 생성 시. hostId와 동시 지정 시 hostId 우선 |
| `name` | string | **Y** | 아이템명 (@NotBlank) |
| `key` | string | **Y** | 아이템 키 key_ (@NotBlank) |
| `type` | int | **Y** | 유형 (@NotNull) |
| `valueType` | int | **Y** | 값 유형 (@NotNull) |
| `delay` | string | N | 폴링형 유형에 필요(예: `1m`, `30s`). trapper/dependent 등은 불필요 |
| `units` | string | N | 단위 |
| `description` | string | N | 설명 |
| `interfaceId` | string | N | 미지정 시 호스트 main agent 인터페이스 **자동 해석**(type∈{0,3,12,13,14,16,20}·호스트 대상일 때). 템플릿 대상은 미설정 |
| `masterItemId` | string | N | 종속 아이템(type=18)의 마스터 아이템 ID |

- **응답 `data` = `ManagedItemDto`** (생성된 아이템)
- 에러: `ITEM_TARGET_REQUIRED`(hostId/templateId 모두 없음), `ITEM_CREATE_FAILED`, 검증 실패, Zabbix 에러

### 1-4. PUT `/zabbix-manage/items/{itemid}` — 수정(부분)
- Path: `itemid`
- Request body `ItemUpdateReqDto` — **null이 아닌 필드만 반영**:

| 필드 | 타입 | 설명 |
|---|---|---|
| `name` | string | 아이템명 |
| `key` | string | 아이템 키 key_ |
| `type` | int | 유형 |
| `valueType` | int | 값 유형 |
| `delay` | string | 수집 주기 |
| `units` | string | 단위 |
| `description` | string | 설명 |
| `interfaceId` | string | 인터페이스 ID |

- **응답 `data` = `ManagedItemDto`** (수정 후)
- 에러: `ITEM_NOT_FOUND`, Zabbix 에러(상속 아이템 제약 위반 등)

### 1-5. PATCH `/zabbix-manage/items/{itemid}/status` — 활성/비활성 토글
- Path: `itemid`
- Request body `ItemStatusReqDto`: `{ "enabled": true }` (boolean, @NotNull)
- **응답 `data` = `ItemStatusResDto`**: `{ "itemid": "23456", "status": "1" }` (0=활성,1=비활성)
- 에러: `ITEM_NOT_FOUND`

### 1-6. DELETE `/zabbix-manage/items` — 삭제(단건/다건)
- Request body `ItemDeleteReqDto`: `{ "itemIds": ["23456","23457"] }` (@NotEmpty). **단건도 원소 1개 배열**로 호출.
- **응답 `data` = `ItemDeleteResDto`**: `{ "itemids": ["23456","23457"], "count": 2 }`
- 에러: `ITEM_IDS_REQUIRED`(빈 배열), 검증 실패

---

## 2. 템플릿 (탭 2) — base `/zabbix-manage`

### 2-1. GET `/zabbix-manage/templates` — 목록
Query params (`@ModelAttribute`):

| 파라미터 | 타입 | 옵셔널 | 설명 |
|---|---|---|---|
| `search` | string | Y | 템플릿 기술명(host) 부분검색. blank=무시 |
| `groupids` | string[] | Y | 템플릿 그룹 ID 필터(복수: `groupids=10&groupids=11`) |
| `limit` | int | Y | 기본 20, 1~200 |
| `offset` | int | Y | 기본 0 |

**응답 `data` = `PagedListDto<ManagedTemplateDto>`**.

**`ManagedTemplateDto`**:

| 필드 | 타입 | nullable | 설명 |
|---|---|---|---|
| `templateid` | string | N | 템플릿 ID |
| `name` | string | N | 기술명(Zabbix `host`) |
| `displayName` | string | N | 표시명(visible name, 없으면 기술명) |
| `description` | string | Y | 설명 |
| `itemCount` | int | N | 포함 아이템 수 |
| `linkedHostCount` | int | N | 연결된 호스트 수 |
| `groups` | `TemplateGroupRefDto[]` | N | 소속 템플릿 그룹 |

**`TemplateGroupRefDto`**: `{ "groupid": string, "name": string }`

### 2-2. GET `/zabbix-manage/templates/{templateid}` — 상세
- Path: `templateid`
- **응답 `data` = `ManagedTemplateDetailDto`**:

| 필드 | 타입 | nullable | 설명 |
|---|---|---|---|
| `templateid` | string | N | 템플릿 ID |
| `name` | string | N | 기술명(host) |
| `displayName` | string | N | 표시명 |
| `description` | string | Y | 설명 |
| `itemCount` | int | N | 포함 아이템 수 |
| `groups` | `TemplateGroupRefDto[]` | N | 소속 템플릿 그룹 |
| `linkedHosts` | `LinkedHostRefDto[]` | N | 연결된 호스트 목록 |
| `parentTemplates` | `TemplateRefDto[]` | N | 상속 부모 템플릿 |

**`LinkedHostRefDto`**: `{ "hostid": string, "name": string }`
**`TemplateRefDto`**: `{ "templateid": string, "name": string }`
> 상세에는 아이템 개수만 담는다. **아이템 목록 자체는 GET `/zabbix-manage/items?templateid={templateid}`** 로 조회.
- 없으면 `TEMPLATE_NOT_FOUND`

### 2-3. POST `/zabbix-manage/templates` — 생성
Request body `TemplateCreateReqDto`:

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `name` | string | **Y** | 기술명(host) (@NotBlank) |
| `displayName` | string | N | 표시명. 비우면 기술명과 동일 |
| `groupIds` | string[] | **Y** | 소속 **템플릿 그룹** ID(최소 1개, @NotEmpty) |
| `description` | string | N | 설명 |
| `linkTemplateIds` | string[] | N | 상속할 부모 템플릿 ID |

- **응답 `data` = `ManagedTemplateDto`** (목록형)
- 에러: 검증 실패, `TEMPLATE_CREATE_FAILED`, Zabbix 에러(중복 host명 등)

### 2-4. PUT `/zabbix-manage/templates/{templateid}` — 수정(부분)
- Path: `templateid`
- Request body `TemplateUpdateReqDto` — null 아닌 필드만 반영:

| 필드 | 타입 | 설명 |
|---|---|---|
| `name` | string | 기술명(host) |
| `displayName` | string | 표시명 |
| `groupIds` | string[] | 주어지면 소속 그룹을 이 집합으로 **교체** |
| `description` | string | 설명 |

- **응답 `data` = `ManagedTemplateDto`**
- 에러: `TEMPLATE_NOT_FOUND`, Zabbix 에러

### 2-5. DELETE `/zabbix-manage/templates` — 삭제(단건/다건)
- Request body `TemplateDeleteReqDto`: `{ "templateIds": ["10001"] }` (@NotEmpty). 단건도 배열.
- **응답 `data` = `TemplateDeleteResDto`**: `{ "templateids": ["10001"], "count": 1 }`
- 에러: `TEMPLATE_IDS_REQUIRED`, Zabbix 에러

### 2-6. POST `/zabbix-manage/templates/{templateid}/link` — 호스트 연결
- Path: `templateid`
- Request body `TemplateLinkReqDto`: `{ "hostIds": ["10644","10645"] }` (@NotEmpty)
- **응답 `data` = `TemplateLinkResDto`**: `{ "templateid": "10001", "hostIds": ["10644","10645"], "linkedHostCount": 7 }`
  (`linkedHostCount` = 작업 후 이 템플릿에 연결된 **총** 호스트 수)
- 에러: `TEMPLATE_NOT_FOUND`, `TEMPLATE_HOST_IDS_REQUIRED`, Zabbix 에러

### 2-7. POST `/zabbix-manage/templates/{templateid}/unlink` — 호스트 해제
- Path: `templateid`
- Request body `TemplateLinkReqDto`: `{ "hostIds": ["10644"], "clear": false }`
  - `clear`(boolean, 기본 false): true면 **unlink and clear**(템플릿이 만든 엔티티까지 호스트에서 제거).
- **응답 `data` = `TemplateLinkResDto`** (2-6과 동일 형태)
- 에러: `TEMPLATE_NOT_FOUND`, `TEMPLATE_HOST_IDS_REQUIRED`, Zabbix 에러

### 2-8. GET `/zabbix-manage/template-groups` — 템플릿 그룹 목록(생성/수정 select용)
Query params:

| 파라미터 | 타입 | 옵셔널 | 설명 |
|---|---|---|---|
| `keyword` | string | Y | 그룹명 부분검색 |
| `limit` | int | Y | 제한 |

- **응답 `data` = `TemplateGroupRefDto[]`**: `[ { "groupid": "10", "name": "Templates/Operating systems" } ]`
> ⚠️ **이 엔드포인트는 select용(폼 드롭다운)이며 계약 불변** — 관리 CRUD 추가로도 shape/경로가 바뀌지 않는다. 관리 목록은 아래 §2-9(별도 축 `/list`)를 사용.

---

## 2-B. 템플릿 그룹 관리 (Zabbix 관리 > 템플릿 그룹) — base `/zabbix-manage/template-groups`

> 호스트 그룹과 대칭인 templategroup CRUD. **기존 select용 GET `/template-groups`(§2-8)와 공존** — 관리 목록은 `/list` 별도 축, 생성/삭제는 같은 경로의 다른 HTTP 메서드(GET select와 충돌 없음).

### 2-9. GET `/zabbix-manage/template-groups/list` — 관리 목록
Query params (`@ModelAttribute`):

| 파라미터 | 타입 | 옵셔널 | 설명 |
|---|---|---|---|
| `search` | string | Y | 그룹명 부분검색. blank=무시 |
| `limit` | int | Y | 기본 20, 1~200 |
| `offset` | int | Y | 기본 0 |

**응답 `data` = `PagedListDto<ManagedTemplateGroupDto>`**.

**`ManagedTemplateGroupDto`**:

| 필드 | 타입 | nullable | 설명 |
|---|---|---|---|
| `groupid` | string | N | 템플릿 그룹 ID |
| `name` | string | N | 그룹명(계층은 `/`) |
| `templateCount` | int | N | 포함 템플릿 수 |

### 2-10. GET `/zabbix-manage/template-groups/{groupid}` — 상세
- Path: `groupid`
- **응답 `data` = `ManagedTemplateGroupDto`** (위와 동일, templateCount 포함)
- 없으면 `TEMPLATE_GROUP_NOT_FOUND`

### 2-11. POST `/zabbix-manage/template-groups` — 생성
- Request body `TemplateGroupCreateReqDto`: `{ "name": "Templates/My Group" }` (@NotBlank)
- **응답 `data` = `ManagedTemplateGroupDto`** (생성된 그룹)
- 에러: 검증 실패, `TEMPLATE_GROUP_CREATE_FAILED`, Zabbix 에러(중복 이름 등)

### 2-12. PUT `/zabbix-manage/template-groups/{groupid}` — 수정(이름 변경)
- Path: `groupid`
- Request body `TemplateGroupUpdateReqDto`: `{ "name": "Templates/Renamed" }` (@NotBlank)
- **응답 `data` = `ManagedTemplateGroupDto`**
- 에러: `TEMPLATE_GROUP_NOT_FOUND`, Zabbix 에러

### 2-13. DELETE `/zabbix-manage/template-groups` — 삭제(단건/다건)
- Request body `TemplateGroupDeleteReqDto`: `{ "groupIds": ["10","11"] }` (@NotEmpty). 단건도 배열.
- **응답 `data` = `TemplateGroupDeleteResDto`**: `{ "groupids": ["10","11"], "count": 2 }`
- 에러: `TEMPLATE_GROUP_IDS_REQUIRED`, **Zabbix 삭제 거부**(템플릿이 남은 그룹 / 템플릿의 마지막 그룹) → code:400 + Zabbix 원본 메시지(예: `Template "X" cannot be without host group.` / `Group "Y" cannot be deleted, because it is used ...`). FE는 이 메시지를 그대로 노출 가능.

---

## 3. 에러 코드 목록

| 코드 | 발생 EP | 의미 |
|---|---|---|
| `ITEM_NOT_FOUND` | item get/update/status | 아이템 없음 |
| `ITEM_TARGET_REQUIRED` | item create | hostId/templateId 둘 다 없음 |
| `ITEM_CREATE_FAILED` | item create | item.create가 itemid 미반환 |
| `ITEM_IDS_REQUIRED` | item delete | itemIds 빈 배열 |
| `TEMPLATE_NOT_FOUND` | template get/update/link/unlink | 템플릿 없음 |
| `TEMPLATE_CREATE_FAILED` | template create | template.create가 templateid 미반환 |
| `TEMPLATE_IDS_REQUIRED` | template delete | templateIds 빈 배열 |
| `TEMPLATE_HOST_IDS_REQUIRED` | template link/unlink | hostIds 빈 배열 |
| `TEMPLATE_GROUP_NOT_FOUND` | template-group get/update | 템플릿 그룹 없음 |
| `TEMPLATE_GROUP_CREATE_FAILED` | template-group create | templategroup.create가 groupid 미반환 |
| `TEMPLATE_GROUP_IDS_REQUIRED` | template-group delete | groupIds 빈 배열 |
| `Access Denied` (code:403) | 전체 | 비관리자 |
| `ZABBIX_API_ERROR` / Zabbix 원문 | 쓰기 EP | Zabbix가 거부(잘못된 파라미터/권한 등) |

> 참고: Bean Validation(@NotBlank/@NotNull/@NotEmpty) 위반은 코드가 아니라 필드 메시지(`name is required`, `key is required`, `type is required`, `valueType is required`, `groupIds is required`, `itemIds is required`, `templateIds is required`, `hostIds is required`, `enabled is required`)가 `\n` join되어 `message`로 온다.

---

## 4. 설계 결정·주의점 (FE·QA 참고)

1. **경로 축**: `/zabbix-manage/**` 신설. 기존 `/hosts/manage/templates`(호스트 등록용 템플릿 **검색**)와 용도·경로 모두 분리 — 중복 없음.
2. **아이템 목록은 host/template로 스코프**해서 호출 권장. 스코프 없이 호출하면 전체 아이템을 서버가 조회 후 윈도잉하므로 대량 응답 위험(FE 탭은 항상 대상 지정).
3. **type/valueType는 정수로 요청, 문자열로 응답**(Zabbix 원시 보존). FE 폼은 정수 전송, 표시·필터는 문자열 매핑 필요.
4. **interfaceid 자동 해석**: 호스트에 agent류 아이템 생성 시 `interfaceId` 생략하면 서버가 호스트 main agent 인터페이스를 채운다. 템플릿 대상은 인터페이스 미설정.
5. **삭제/해제는 되돌릴 수 없음**(수집 데이터 영구 삭제). FE는 이중확인 UX 권장(호스트 삭제 화면 선례).
6. **감사 로그**: 모든 쓰기 작업은 `zabbix_change_log` 테이블(Flyway `V12`)에 기록(entity_type: ITEM/TEMPLATE/**TEMPLATE_GROUP**, action: CREATE/UPDATE/ENABLE/DISABLE/DELETE/LINK/UNLINK). 실패해도 본 작업은 성공 유지(비치명적). 1차는 적재 전용(조회 UI 미제공). ⚠️ entity_type은 자유 문자열(VARCHAR16) 컬럼이라 TEMPLATE_GROUP 값 추가에 **스키마 변경 없음**.
7. 응답 필드명은 host-manage 관례(카멜케이스, 원시 문자열 보존)를 따른다. `key`는 Zabbix `key_`의 FE 친화 명칭.
8. **link/unlink 내부 구현(2026-07-20 BUG-1·BUG-3 수정)**: 연결·해제는 모두 **host-side**로 수행한다. **요청/응답 shape 불변**(FE 영향 없음).
   - link(2-6) = `host.massadd {hosts, templates}` — `template.massadd`는 `hosts` 파라미터를 받지 않아 Zabbix가 -32602로 거부(BUG-1).
   - unlink(2-7) clear=false = `host.massremove {hostids, templateids}` (엔티티 유지 unlink) — `template.massremove {templateids, hostids}`는 실 Zabbix에서 HTTP 200이지만 링크를 실제로 끊지 못하는 no-op이었다(BUG-3).
   - unlink(2-7) clear=true = 각 호스트 `host.update {templates_clear}` (템플릿 상속 엔티티까지 삭제).
9. **Zabbix 에러 → HTTP 상태(2026-07-20 BUG-2 수정)**: Zabbix 파라미터 검증실패(중복 키, 잘못된 값 등)는 **HTTP 200 + code:400 + Zabbix 원본 메시지**로 내려간다(예: `Item with key "..." already exists on "web-01".`). 인증/세션만료/권한부족만 401(FE refresh 유도). FE는 쓰기 EP 에러 시 `message`를 그대로 사용자에게 노출 가능 — 검증실패를 토큰 문제로 오인해 로그아웃되지 않는다.
10-b. **아이템 key 자동완성(2026-07-20 추가)**: §1-1b `GET /zabbix-manage/items/keys`. 조회 전용(감사로그 없음), 관리자 전용. 초안 경로 `/zabbix-manage/item-keys`에서 **아이템 하위 리소스 관례에 맞춰 `/zabbix-manage/items/keys`로 조정**(별도 컨트롤러 불필요, literal이 `/{itemid}`보다 우선이라 충돌 없음). FE ItemFormDrawer는 이 경로를 사용. 응답은 페이징 래퍼가 아니라 `ItemKeyDto[]` 단순 배열(자동완성 특성).
10. **템플릿 그룹 관리(2026-07-20 추가)**: §2-B(2-9~2-13). 기존 select용 GET `/template-groups`(§2-8, `TemplateGroupRefDto[]`)는 **계약 불변으로 존치** — 관리 목록은 templateCount·페이징을 담은 별도 축 `/template-groups/list`로 분리(같은 경로에 관리 필드를 얹지 않아 폼 소비자 무파손). 생성(POST)·삭제(DELETE)는 `/template-groups` 경로에 GET select와 **메서드가 달라 공존**. 그룹 삭제는 Zabbix 제약(비어있지 않은 그룹/마지막 그룹)을 code:400+원문으로 노출.
11. **호스트 스코프 소스 템플릿(2026-07-22 추가)**: §1-1 목록이 `hostid` 스코프일 때 각 행에 `sourceTemplate{templateId,templateName}`을 부착하고, `sourceTemplateId` 파라미터로 소스 템플릿 기준 필터를 지원한다(호스트 관리 드릴다운 아이템 탭 "이 아이템이 어느 템플릿에서 상속됐나" 표시/필터용). 구현은 렌즈의 source 역추적을 공용 헬퍼(`ZabbixSourceTraceHelper`)로 추출해 재사용 — 행의 `templateid`(부모 아이템 id)를 깊이당 1콜 배치로 원본 템플릿까지 역추적(N+1 아님, 상속 행 없으면 콜 0회). **완전 additive**: 기존 필드/파라미터·템플릿 스코프·상세/쓰기 응답·렌즈 계약 모두 불변. 필터는 서버가 호스트 아이템 전량(유계, 수백) resolve 후 적용 → `total` 정확. 읽기 전용이라 감사로그 없음.
    - FE 배선 요약: 응답 필드 `sourceTemplate?: { templateId: string | null, templateName: string | null }`(부재 = 호스트 직접 정의 or 디스커버리), 요청 파라미터 `sourceTemplateId?: string`(hostid와 함께만 의미).
