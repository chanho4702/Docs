# API 계약 — 호스트 등록 관리 (Host Registration Management)

- 산출: be-engineer, 2026-07-16 · 브랜치 `feature/host-registration` (worktree `_worktrees/hostreg-be`)
- 구현: `moveseye-be-spring` (Spring Boot 3.3) — 컨트롤러 `com.dmove.moveseye.host.manage.HostManageController`
- **springdoc `/v3/api-docs`로 실검증 완료**(격리 도커 DB 5433 기동, 7개 EP·전 DTO 스키마 일치 확인).
- FE base: `/api/v1/hosts/manage` (서버 컨트롤러 매핑은 `/hosts/manage`, FE 프록시가 `/api/v1` 접두).
- 권한: **전 EP 관리자 전용**(`userRole` ∈ {ADMIN, SUPER_ADMIN}). roleid 기반 `@Roles` 미사용.

---

## 0. 공통 응답 래퍼 · 언랩 규칙

모든 응답은 `ApiResult<T>`로 감싸진다:

```jsonc
// 성공
{ "status": "success", "code": 200, "data": <페이로드 T> }
// 실패(대부분 HTTP 200 유지)
{ "status": "error", "code": 400, "message": "HOST_GROUP_REQUIRED", "errorCode": "HOST_GROUP_REQUIRED" }
```

- `status`: `"success"` | `"error"` (소문자 문자열).
- 성공 응답의 `message`/`errorCode`는 생략(NON_NULL). `data`가 페이로드.
- **FE 언랩**: `useDmoveQuery`(axios 인터셉터 + 훅)가 2겹 벗겨 **소비자는 아래 각 EP의 "응답 data(페이로드)"를 직접 수신**한다. `data.data` 접근 금지(과다 언랩). ([[fe-usedmovequery-unwrap]])

### 에러 응답 형태(공통)
| 유형 | HTTP | body |
|------|------|------|
| 권한 거부(비admin) | **200** | `{ status:"error", code:403, message:"Access Denied" }` (errorCode 없음) |
| 비즈니스 에러(ApiError) | **200** | `{ status:"error", code:400, message:"<CODE>", errorCode:"<CODE>" }` |
| Bean Validation 실패(@Valid) | **200** | `{ status:"error", code:400, message:"<필드 메시지>" }` (errorCode 없음, 여러 필드는 `\n` join) |
| 인증 실패(토큰/세션) | **401** | `{ status:"error", code:401, message:... }` (유일하게 실제 상태코드) |

> ⚠️ 403(권한)·404·400 등은 **HTTP 200 + body code**로 내려온다(원본 계약 보존). FE는 상태코드가 아니라 `code`/`status`로 분기.

### 비즈니스 에러코드(errorCode)
| errorCode | 발생 EP | 의미 |
|-----------|---------|------|
| `HOST_GROUP_REQUIRED` | POST, PUT | groupIds/newGroupNames 둘 다 비어 있음 |
| `HOST_PROXY_REQUIRED` | POST, PUT | monitoredBy가 1/2(proxy)인데 proxyId 없음 |
| `HOST_DELETE_CONFIRM_MISMATCH` | DELETE | confirmName이 대상 호스트명과 불일치 |
| `HOST_NOT_FOUND` | GET 단건, PUT, PATCH, DELETE | 대상 hostid가 Zabbix에 없음 |
| `HOST_CREATE_FAILED` | POST | host.create가 hostid를 반환하지 않음 |
| `ZABBIX_API_ERROR` | POST/PUT(그룹 즉석생성 실패 등) | Zabbix 쓰기 실패 |

---

## 1. `GET /hosts/manage` — 관리 호스트 목록

- 권한: admin
- 쿼리 파라미터(@ModelAttribute, 전부 옵셔널):

| 파라미터 | 타입 | 기본 | 설명 |
|----------|------|------|------|
| `keyword` | string | — | 표시명(name) 부분검색. blank=무시 |
| `groupids` | string[] | — | 그룹 필터(복수: `groupids=2&groupids=5`) |
| `status` | integer(0\|1) | — | 0=활성, 1=비활성. 미지정=전체 |
| `limit` | integer | 20 | 페이지 크기(1~200 클램프) |
| `offset` | integer | 0 | 오프셋 |

- 응답 data: **`PagedListDto<ManagedHostDto>`**

```jsonc
{
  "items": [ ManagedHostDto, ... ],
  "total": 42,          // integer — 필터 후 전체 건수(페이지네이션 전)
  "limit": 20,          // integer
  "offset": 0           // integer
}
```

### `ManagedHostDto`
| 필드 | 타입 | nullable | 설명 |
|------|------|----------|------|
| `hostid` | string | no | Zabbix 호스트 ID |
| `host` | string | no | 기술명(agent conf Hostname과 일치해야 함) |
| `name` | string | no | 표시명(visible name) |
| `status` | string | no | `"0"`=활성, `"1"`=비활성 (Zabbix 원시 문자열) |
| `monitoredBy` | string | no | `"0"`=server, `"1"`=proxy, `"2"`=proxy group |
| `proxy` | `ProxyRefDto` | **yes** | monitoredBy=`"0"`이거나 proxyid=`"0"`이면 `null` |
| `agentAvailable` | string | **yes** | 기본 agent 인터페이스 가용성 `"0"`=unknown/`"1"`=available/`"2"`=unavailable. agent 인터페이스 없으면 `null` |
| `groups` | `GroupRefDto[]` | no | 소속 그룹 |
| `interfaces` | `HostInterfaceDto[]` | no | 인터페이스 |
| `templates` | `TemplateRefDto[]` | no | 연결된 템플릿 |

- `ProxyRefDto`: `{ proxyid: string, name: string }` (name은 proxy.get 조인 결과; 해당 proxyid를 못 찾으면 name=null 가능)
- `GroupRefDto`: `{ groupid: string, name: string }`
- `TemplateRefDto`: `{ templateid: string, name: string }`
- `HostInterfaceDto`: `{ interfaceid: string, type: string, main: string, useip: string, ip: string, dns: string, port: string, available: string }` — 값은 Zabbix 원시 문자열. type `"1"`=agent, main `"1"`=기본, useip `"1"`=IP/`"0"`=DNS.

---

## 1-1. `GET /hosts/manage/{hostid}` — 관리 호스트 단건 조회 (2026-07-21 추가)

- 용도: 드릴다운 재구성(A안) — 호스트 상세 **딥링크/새로고침 진입** 시 단건 로드.
- 권한: admin · path: `hostid`(string) · 파라미터 없음
- 동작: 목록(§1)과 **동일한 host.get output/select 구성**으로 `hostids=[hostid]` 조회 후 첫 건 매핑.
- 응답 data: **`ManagedHostDto`** — §1의 ManagedHostDto와 동일 shape(interfaces 포함).
  - ⚠️ `tags`(HostTagDto[])·`deviceType`(항상 6종 중 하나, null 아님) 필드 포함 — 델타 정의는 `features/zabbix-config/classification-tags/contract_host-classification-tags.md` §2.
- 대상 없으면 `HOST_NOT_FOUND`(HTTP 200 + body code 400). 비admin은 HTTP 200 + code 403.
- 경로 매칭: 리터럴 `GET /templates`·`/proxies`가 `/{hostid}`보다 우선(Spring 리터럴 우선) — 충돌 없음.
- 구현: `HostManageController.getOne` → `HostManageService.getOne(hostid)` (서비스 계정 `getSuperAdminToken`, 목록과 동일 경로).

---

## 2. `POST /hosts/manage` — 호스트 생성

- 권한: admin · Content-Type: `application/json`
- 요청 body: **`HostCreateReqDto`**

| 필드 | 타입 | 필수 | 기본 | 설명 |
|------|------|------|------|------|
| `host` | string | **yes**(@NotBlank) | — | 기술명. agent conf Hostname과 일치 필요 |
| `name` | string | no | — | 표시명. 비우면 서버가 host를 표시명으로 취급 |
| `groupIds` | string[] | 조건부 | — | 기존 Zabbix groupid 목록 |
| `newGroupNames` | string[] | 조건부 | — | 즉석 생성할 신규 그룹명. **groupIds/newGroupNames 중 최소 하나 필수** |
| `interface` | `HostInterfaceReqDto` | no* | — | Agent 인터페이스 1개. (*생략 시 인터페이스 없이 생성) |
| `templateIds` | string[] | no | — | 연결할 templateid 목록 |
| `monitoredBy` | integer(0\|1\|2) | no | 0 | 0=server, 1=proxy, 2=proxy group |
| `proxyId` | string | 조건부 | — | monitoredBy가 1/2이면 **필수** |
| `status` | integer(0\|1) | no | 0 | 0=활성, 1=비활성 |

### `HostInterfaceReqDto`
| 필드 | 타입 | 기본 | 설명 |
|------|------|------|------|
| `useip` | integer(0\|1) | 1 | 1=IP 사용, 0=DNS 사용 |
| `ip` | string | — | useip=1일 때 사용 |
| `dns` | string | — | useip=0일 때 사용 |
| `port` | string | `"10050"` | 포트 |

- 동작: `newGroupNames`가 있으면 기존 `HostGroupService.create`로 즉석 생성(로컬에 동명 그룹이 있으면 **재사용**, 멱등) → groupId 합산 → `host.create` → 감사로그(성공 후) → 자산 단건 동기화(`syncOne`, 비치명적).
  - ⚠️ host.create 실패 시 즉석 생성된 신규 그룹은 롤백하지 않고 남는다(무해, 재시도 시 재사용).
- 응답 data: **`ManagedHostDto`** (생성 직후 host.get 재조회 결과) — §1의 ManagedHostDto와 동일 shape.

---

## 3. `PUT /hosts/manage/{hostid}` — 호스트 수정

- 권한: admin · path: `hostid`(string)
- 요청 body: **`HostUpdateReqDto`** = `HostCreateReqDto` 전 필드 + 아래

| 추가 필드 | 타입 | 필수 | 설명 |
|-----------|------|------|------|
| `clearTemplateIds` | string[] | no | **unlink + 수집 데이터 영구 삭제**(templates_clear)할 templateid 목록 |

- 템플릿 규칙: `templateIds` = 수정 후 **연결 유지**할 전체 템플릿 집합(목록에 없는 기존 연결은 unlink, 데이터 보존). `clearTemplateIds`의 템플릿은 unlink + 아이템/데이터 영구 삭제.
- 인터페이스: 기존 기본 agent 인터페이스가 있으면 그 interfaceid로 in-place 수정(재생성 회피).
- 대상 없으면 `HOST_NOT_FOUND`. 그룹/프록시 검증은 POST와 동일.
- 응답 data: **`ManagedHostDto`** (수정 후 재조회).

---

## 4. `PATCH /hosts/manage/{hostid}/status` — 활성/비활성 토글

- 권한: admin · path: `hostid`(string)
- 요청 body: **`HostStatusReqDto`**

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `enabled` | boolean | **yes**(@NotNull) | true=활성(status 0), false=비활성(status 1) |

- 응답 data: **`HostStatusResDto`**

```jsonc
{ "hostid": "10644", "status": "1" }   // status: string, "0"=활성 "1"=비활성(변경 후)
```

- 대상 없으면 `HOST_NOT_FOUND`. 감사로그 ENABLE/DISABLE 기록 + syncOne.

---

## 5. `DELETE /hosts/manage/{hostid}` — 영구 삭제(이중확인)

- 권한: admin · path: `hostid`(string) · Content-Type: `application/json`(body 포함)
- 요청 body: **`HostDeleteReqDto`**

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `confirmName` | string | **yes**(@NotBlank) | 삭제 확인용 호스트명. 대상의 **기술명(host) 또는 표시명(name)** 과 일치해야 함(서버측 재검증) |

- confirmName 불일치 → `HOST_DELETE_CONFIRM_MISMATCH`(host.delete 미실행). 대상 없으면 `HOST_NOT_FOUND`.
- 삭제 성공 시 연결 자산은 건드리지 않음(스냅샷 보존).
- 응답 data: **`HostDeleteResDto`**

```jsonc
{ "hostid": "10644" }
```

---

## 6. `GET /hosts/manage/templates` — 템플릿 검색

- 권한: admin
- 쿼리 파라미터(옵셔널): `keyword`(string, 이름 부분검색), `limit`(integer)
- 응답 data: **`TemplateRefDto[]`**

```jsonc
[ { "templateid": "10001", "name": "Linux by Zabbix agent" }, ... ]
```

---

## 7. `GET /hosts/manage/proxies` — 프록시 목록

- 권한: admin · 파라미터 없음
- 응답 data: **`ProxyRefDto[]`**

```jsonc
[ { "proxyid": "1", "name": "ZabbixProxyDemo" }, ... ]
```

---

## 8. FE 연동 메모

- 그룹 CRUD(호스트 그룹 탭)는 **신규 EP 없음** — 기존 `/users/host-groups`(GET/POST/PUT/DELETE) 재사용. 단 쿼리 키는 `HOST_MANAGE_QUERY_KEY.*`로 신설(레거시 캐시 충돌 방지).
- 라이브체크는 기존 `GET /hosts/{hostid}/livecheck` 재사용(등록/수정 성공 직후 호출).
- 등록 성공 응답의 `agentAvailable`/`interfaces[].available`로 트러블슈팅 UI 구성 가능(livecheck와 병행).
- 모든 상태/가용성/type/useip/main 값은 **문자열**("0"/"1"/"2")이다 — 숫자 비교 시 주의.

---

## 9. dev 사전 검증 실측 결과(Zabbix 7.0.6, dmove.co.kr)

- **쓰기 권한 실효**: super admin(Admin) 토큰으로 `dmove-qa-hostreg-*` 테스트 호스트 host.create→host.get→host.delete 전 왕복 성공(hostid 10749 생성 후 삭제·소멸 확인). **블로커 없음.** dev Zabbix 흔적 정리 완료.
- **프록시 파라미터**: `monitored_by`(정수 0/1/2) + `proxyid`(문자열). server면 proxyid `"0"`. 확인됨.
- **인터페이스**: `{ type:1, main:1, useip:1, ip, dns, port:"10050" }` 형태로 생성 성공.
- **proxy 이름 조인**: host.get `selectProxy`는 응답에 proxy 키를 반환하지 않음(**7.0 미지원**) → `proxy.get`(output[proxyid,name])으로 별도 조회해 proxyid→name 매핑(구현 반영).
- host.get 응답 키: `selectHostGroups`→`hostgroups`(소문자), `selectParentTemplates`→`parentTemplates`, 인터페이스 `available` per-interface.
