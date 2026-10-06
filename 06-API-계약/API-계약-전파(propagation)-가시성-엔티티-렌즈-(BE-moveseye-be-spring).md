# API 계약 — 전파(propagation) 가시성 + 엔티티 렌즈 (BE: moveseye-be-spring)

- **작성**: be-engineer, 2026-07-21. 설계 정본: `_workspace/designs/design_propagation-lens.md` (확정 D1~D6 반영).
- **범위**: ① 호스트 테이블 강화(additive) ② 템플릿 목록 triggerCount(additive) ③ **신규 읽기 EP 2개**(아이템/트리거 렌즈).
- **쓰기 EP 변경 없음**: 렌즈는 읽기 전용. 수정/삭제/상태토글은 기존 `/zabbix-manage/items`·`/triggers` EP를 그대로 사용
  (드릴다운 계약 `contract_item-template-mgmt.md`·`contract_trigger-mgmt.md` 무변경).
- **권한**: 전 EP 관리자 전용 — `AdminAccessChecker.requireAdmin`(userRole 기준). 거부는 **HTTP 200 + body code:403**(관례).
- **응답 래핑**: 전부 `ApiResult<T>` 표준 래퍼. FE는 useDmoveQuery 언랩 관례대로 payload를 직접 수신.

---

## 1. 기존 EP 변경분 (additive — 기존 필드/타입 불변, 하위호환)

### 1-1. `GET /hosts/manage` (목록) / `GET /hosts/manage/{hostid}` (단건)

**요청(목록) — 쿼리 파라미터 추가**:

| 파라미터 | 타입 | 설명 |
|---|---|---|
| `templateids` | string[] (신규) | 이 템플릿(들)이 연결된 호스트만 (host.get templateids). 복수: `templateids=10001&templateids=10002`. 기존 keyword/groupids/status와 공존(AND) |

**응답 `ManagedHostDto` — 필드 추가(끝에 3개, 목록·단건 동일)**:

| 필드 | 타입 | 설명 |
|---|---|---|
| `itemCount` | number (int) | 이 호스트의 아이템 수(상속·discovered 포함, selectItems:"count") |
| `triggerCount` | number (int) | 트리거 수(selectTriggers:"count") |
| `discoveryCount` | number (int) | 디스커버리 룰 수(selectDiscoveries:"count") |

- 기존 필드(hostid/host/name/status/monitoredBy/proxy/agentAvailable/groups/interfaces/templates/tags/deviceType) 전부 불변.
- 적용 템플릿 이름은 기존 `templates: TemplateRefDto[]`(templateid, name)로 이미 내려감 — FE 컬럼만 추가하면 됨.
- ⚠️ POST/PUT/PATCH(status)/{hostid} 응답도 동일 DTO라 새 3필드가 함께 내려간다(additive).
- 성능: count 모드라 추가 비용 없음(실측 0.35s, +3.6KB).

### 1-2. `GET /zabbix-manage/templates` (목록) — `ManagedTemplateDto` 필드 추가

| 필드 | 타입 | 설명 |
|---|---|---|
| `triggerCount` | number (int, 신규) | 템플릿 포함 트리거 수(selectTriggers:"count") — 렌즈 진입 링크("이 템플릿의 트리거 N개")용 |

- 기존: templateid/name/displayName/description/itemCount/linkedHostCount/groups 불변.
- POST/PUT `/zabbix-manage/templates` 응답(같은 DTO)에도 함께 내려간다.
- `linkedHostCount` = **전파 대상 호스트 수** 의미 부여(FE 표기). 상세 `GET /zabbix-manage/templates/{id}`의
  `linkedHosts`(hostid+name 전체 목록)는 **기존 그대로** — 전파 대상 목록 팝오버/정보탭 소스로 재사용(BE 무변경).

---

## 2. 신규 EP — 엔티티 렌즈 (읽기 전용)

### 공통 사항

- 경로는 `/{itemid}`·`/{triggerid}`보다 **literal 우선 매칭**(`/items/keys` 선례) — 충돌 없음.
- **⚠️ 페이징 방식 변경(2026-07-21 재작성): CAP+truncated → ID-슬라이스 진짜 페이징.**
  1단계에서 정렬된 전체 **ID 목록만** 가볍게 조회(`output:["itemid"|"triggerid"]` + 모든 필터 + sortfield),
  2단계에서 `[offset, offset+limit)` 슬라이스의 ID만 풀 하이드레이트(아이템: lastvalue/lastclock 포함,
  트리거: expandExpression+selectHosts 포함). → **`total` 범위 내 임의 offset 자유 페이징**. FE는 표준
  페이지네이션(total 기반)을 그대로 쓰면 된다. 정렬은 1단계 ID 목록 순서가 기준(하이드레이트 후 원순서 복원 보장).
- **`cap` = ID 목록 안전상한**(설정 `app.lens.cap`, env `LENS_CAP`, 기본 **50,000**) — 진짜 페이징의 한계가
  아니라 초대형 환경 폭주 방어선. `truncated: true`는 **전체가 안전상한을 넘는 희귀 케이스에만**(일반 규모
  2만에선 항상 false). true면 상위 cap건만 탐색 가능 → FE는 그때만 필터 유도 Alert.
- `total`: 안전상한 미만이면 ID 목록 크기 자체(정확값, countOutput 콜 없음). 안전상한 도달 시에만 countOutput으로 보정.
- **`offset + limit > cap`(안전상한) 요청 → 에러 `LENS_OFFSET_EXCEEDS_CAP`** (HTTP 200 + body `code: 400` — 관례).
  일반 페이지 이동에서는 발생하지 않는다(50,000 초과 offset은 truncated 환경에서만 도달 가능).
  **offset이 total을 넘되 안전상한 내면 에러가 아니라 빈 items + 정확한 total**(표준 페이지네이션 시맨틱).
- **viewMode(`view` 파라미터)**: `definition`(**기본**) = 템플릿 원본 정의 + 호스트 다이렉트 원본만
  (상속 사본 제외 `inherited:false` + discovered 제외 `flags:0`). `all` = 전체(상속 사본·discovered 포함, truncated 상시 예상).
  값 미지정/오타는 definition으로 안전 폴백.
- **컨테이너 필터 합집합**: `hostids`와 `templateids`를 동시에 주면 BE가 hostids로 **합집합** 조회한다
  (별도 전달 시 Zabbix AND 시맨틱으로 공집합이 되는 함정 회피). groupids는 AND로 공존.
- 정렬: 아이템 name / 트리거 description 오름차순(Zabbix sortfield) 고정. 정렬 파라미터 없음(1차 범위).

### 2-1. `GET /zabbix-manage/items/lens`

**요청 쿼리 (`ItemLensReqDto`)**:

| 파라미터 | 타입 | 기본 | 설명 |
|---|---|---|---|
| `groupids` | string[] | - | 호스트그룹 필터(복수) |
| `hostids` | string[] | - | 호스트 다건 |
| `templateids` | string[] | - | 템플릿 다건 (hostids와 동시 지정 시 합집합) |
| `search` | string | - | name + key_ 부분일치(OR) |
| `type` | number | - | 아이템 유형(0=agent,2=trapper,3=simple,7=agent active,18=dependent,...) |
| `status` | number | - | 0=활성, 1=비활성 |
| `origin` | string | - | `plain`(flags=0) / `discovered`(flags=4). **view=all일 때만 유효**(definition이면 항상 plain) |
| `view` | string | `definition` | `definition` \| `all` |
| `limit` | number | 20 | 1~200 클램프 |
| `offset` | number | 0 | **total 범위 내 임의값 자유**(ID-슬라이스). offset+limit ≤ 안전상한(50,000)만 지키면 됨 |

**응답 `ApiResult<LensPagedDto<LensItemDto>>`**:

```jsonc
{
  "items": [ /* LensItemDto[] */ ],
  "total": 20440,        // 정확한 전체 건수 — 이 범위 내 임의 offset 페이징 가능
  "limit": 20,
  "offset": 0,
  "truncated": false,    // 전체가 안전상한(cap)을 넘는 희귀 케이스에만 true
  "cap": 50000           // ID 목록 안전상한(app.lens.cap) — 페이징 한계 아님
}
```

**`LensItemDto`** = 기존 `ManagedItemDto` 전 필드(원시 문자열 보존 규칙 동일) + 전파 필드 3종:

| 필드 | 타입 | 설명 |
|---|---|---|
| `itemid` | string | Zabbix 아이템 ID |
| `hostid` | string | 소속 컨테이너 ID(호스트 **또는 템플릿** ID) |
| `hostName` | string\|null | 컨테이너 표시명(호스트/템플릿명) |
| `name` / `key` | string | 아이템명 / key_ |
| `type` / `valueType` / `status` / `flags` | string | Zabbix 원시 문자열(0,1,4...) |
| `delay` / `units` / `description` / `interfaceid` | string\|null | |
| `lastValue` / `lastClock` | string\|null | **2단계 하이드레이트 값**(페이지 행만 풀 조회 시 lastvalue/lastclock 포함 — 1단계 ID 목록에는 미포함) |
| `templateid` | string | 상속 원본 **부모 아이템 ID**(0=원본/로컬). ⚠️ 템플릿 ID가 아님 — 템플릿은 source에서 |
| `containerKind` (신규) | string | `"host"` \| `"template"` — hostid가 가리키는 컨테이너 종류. **FE 행 액션의 scopeType 소스** |
| `source` (신규) | object | 정의처 `{ kind: "local"\|"template"\|"discovery", templateId?: string\|null, templateName?: string\|null }` — local=자기 컨테이너 정의, template=상속 사본(원본 템플릿 역추적, 중첩 방어 포함), discovery=LLD 생성(flags=4). kind=template인데 역추적 실패(경합 삭제)면 templateId/templateName null |
| `propagation` (신규) | object\|null | **템플릿 컨테이너 행만** `{ hostCount: number }` — 이 템플릿(중첩 경유 포함) 연결 호스트 수 = 전파 대상 수. **호스트 다이렉트 행은 null**. 대상 호스트 목록은 행에 없음 → 팝오버는 `GET /zabbix-manage/templates/{id}`의 linkedHosts 재조회 |

### 2-2. `GET /zabbix-manage/triggers/lens`

**요청 쿼리 (`TriggerLensReqDto`)** — 2-1과 동형, `origin`·`type` 대신 `severity`:

| 파라미터 | 타입 | 기본 | 설명 |
|---|---|---|---|
| `groupids` / `hostids` / `templateids` | string[] | - | 2-1과 동일(합집합 규칙 동일) |
| `search` | string | - | description 부분일치 |
| `severity` | number | - | priority 0~5 |
| `status` | number | - | 0=활성, 1=비활성 |
| `view` | string | `definition` | `definition` \| `all` |
| `limit` / `offset` | number | 20 / 0 | 2-1과 동일(임의 offset 자유, 안전상한만 방어) |

**응답 `ApiResult<LensPagedDto<LensTriggerDto>>`** — 컨테이너 구조 2-1과 동일.

**`LensTriggerDto`** = 기존 `ManagedTriggerDto` 전 필드 + 전파 필드 3종:

| 필드 | 타입 | 설명 |
|---|---|---|
| `triggerid` | string | |
| `description` | string | 트리거명 |
| `expression` | string | **expandExpression 적용(사람이 읽는 형태)** — 2단계 하이드레이트에서 페이지 행만 확장 조회(기존 드릴다운 목록과 동일 표현 보장, 단위 테스트로 고정) |
| `priority` / `status` | string | Zabbix 원시 문자열 |
| `templateid` | string | 상속 원본 **부모 트리거 ID**(0=로컬/원본) |
| `inherited` | boolean | templateid != 0 — true면 FE 읽기전용 표시(기존 규칙 동일) |
| `hosts` | TriggerHostRefDto[] | `{hostid, name, status}[]` — 2단계 하이드레이트(selectHosts)에서 채움 |
| `containerKind` (신규) | string | `"host"` \| `"template"` — `hosts[0]` 기준 |
| `source` (신규) | object | 2-1과 동일 시맨틱(상속 사본은 부모 트리거 역추적) |
| `propagation` (신규) | object\|null | 2-1과 동일(템플릿 컨테이너 행만 `{hostCount}`) |

### 에러 코드

| 코드 | HTTP/body | 조건 |
|---|---|---|
| `LENS_OFFSET_EXCEEDS_CAP` | HTTP 200 + body code 400 | offset+limit > **안전상한(50,000)** — 일반 페이징에서는 발생하지 않음. offset > total(안전상한 내)은 에러 아님(빈 items) |
| 403 (body) | HTTP 200 + body code 403 | 비관리자 |
| `INVALID_TOKEN` | HTTP 401 | 인증 실패(관례) |

쓰기 관련 에러는 기존 EP 것 그대로(렌즈 신규 없음).

---

## 3. FE 구현 노트 (계약의 일부)

**⚠️ 2026-07-21 페이징 재작성에 따른 FE 변경 포인트**: ① 페이지네이션을 **표준 total 기반**으로 —
`min(total, cap)` 클램프 제거, 전 구간 페이지 이동 가능. ② truncated Alert는 **안전상한 초과(희귀)에만** —
상시 배너 로직이었다면 제거. ③ LENS_OFFSET_EXCEEDS_CAP 방어용 페이지 상한 로직 제거(정상 흐름에서 미발생).

1. **로딩 UX 유지**: 무필터 첫 페이지(definition 뷰)는 ID 목록 전건 조회가 추가돼 기존과 유사한 수 초대
   (하이드레이트는 페이지 행만이라 싸다). 필터 적용 시 더 빠름. 스켈레톤 + react-query `keepPreviousData` 권장.
2. **truncated 배너(희귀)**: `truncated=true`(전체 > 50,000건 환경)일 때만 "전체 {total}건 중 상위 {cap}건만
   탐색 가능" Alert + 필터 유도. 이때만 페이지네이션을 `cap` 기준으로 제한. 일반 규모에선 항상 false.
3. **행 액션 배선**: scopeType=`containerKind`, scopeId=`hostid`(아이템)/`hosts[0].hostid`(트리거),
   scopeLabel=`hostName`/`hosts[0].name` → 기존 ItemFormDrawer/TriggerFormDrawer/DeleteModal 재사용.
   상속 행(`source.kind=="template"` 또는 트리거 `inherited==true`) 읽기전용 규칙 동일. **생성 버튼 미제공(D3)** — 드릴다운으로 유도.
4. **전파 팝오버**: `propagation.hostCount` 클릭 → `GET /zabbix-manage/templates/{row.hostid}` 상세의 `linkedHosts` 재조회.
5. **view 토글**: 기본 definition. all 전환 시 truncated 상시 + 상속 사본/discovered 노이즈(아이템 48%가 discovered) 유의.
6. 필터 상태는 URL query로(페이지 리마운트 메모리 — navigate마다 로컬 state 소실).

## 4. 검증 상태 / 잔여

- **2026-07-21 페이징 재작성(CAP+truncated → ID-슬라이스)**: `./gradlew build -x test` + `./gradlew test` 그린.
  렌즈 단위테스트 16건(`ZabbixEntityLensServiceTest`): ID-슬라이스 2단계 파이프라인(ID목록 → 슬라이스 → 하이드레이트),
  임의 offset(5000/2000) 정확 페이지, 하이드레이트 역순 응답의 원순서 복원, offset>total 빈 페이지(에러 아님),
  total 정확성(안전상한 미만이면 countOutput 콜 없음), 안전상한 초과 truncated+countOutput 보정, offset+limit>안전상한 거부,
  definition/all/origin 필터 조립, expandExpression·lastvalue 하이드레이트, source 역추적(아이템/트리거),
  컨테이너 합집합, 중첩 전파 BFS.
- **렌즈 EP 실측(2026-07-21, dev 프로필 서버 + 실 Zabbix, 앱 EP 경유)**: 아이템 definition p1 0.9~1.3s /
  offset=5000 0.5s / view=all p1 0.6s / offset이 total 밖 0.6~0.7s(빈 페이지 정상). 트리거 definition p1 0.44s /
  all offset=3000 0.42s. → **ID 목록 요청당 재조회로 충분, TTL 캐시 불도입**(측정 환경 총 ~9천 아이템 —
  2만 규모 외삽해도 ID fetch ~1s대. link/unlink 직후 정합 우선, D4 유지).
- ⚠️ **실서버 확인 권장(functional-qa)**: ① hostids+templateids 동시 지정 시 hostids 합집합 조회가 실 Zabbix에서
  템플릿 ID를 수용하는지(단독 지정 경로는 실측 완료) ② 호스트 카운트 3종 실값 대조.
- D4대로 전파/이름 맵·ID 목록은 요청당 구축(캐시 없음) — link/unlink 직후에도 즉시 정합.
