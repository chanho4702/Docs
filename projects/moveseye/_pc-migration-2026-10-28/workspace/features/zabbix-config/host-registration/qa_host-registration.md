# QA — 호스트 등록 관리 BE↔FE 경계면 정적 검증

- 검증자: integration-qa (정적 shape 대조 전용, 런타임 미기동)
- 일자: 2026-07-16
- 대상: BE `_worktrees/hostreg-be`(3eedbc6) `host/manage/**` · FE `_worktrees/hostreg-fe`(6fdd60e) `host-manage.*` + `pages/setting/host-management/**`
- 기준: `_workspace/features/zabbix-config/host-registration/contract_host-registration.md`
- 정본 우선순위: BE Java DTO 소스 > 계약서 > FE 타입/사용처

---

## 종합 판정: **PASS** (재검증 2026-07-16, fe 커밋 d9c4224)

- 1차(초판): FAIL — 값 도메인(그룹 ID space) 불일치 HIGH-1.
- 2차(재검증): HIGH-1 **RESOLVED** → shape·값 도메인 전부 정합. 잔여 HIGH/MEDIUM 0, 정보성 LOW 2(monitoredBy 2 미노출 / 에러 세분화 미표시)만 남음.

HIGH 0 · MEDIUM 0 · LOW 2(정보성).

---

## 1. 3자 대조 (7 EP 경로·메서드·요청·응답)

| # | EP | 경로/메서드 | 요청 | 응답 | 판정 |
|---|----|-----------|------|------|------|
| 1 | 목록 | `GET /hosts/manage` | keyword/groupids[]/status/limit/offset (전 옵셔널) | `PagedListDto<ManagedHostDto>` {items,total,limit,offset} | PASS |
| 2 | 생성 | `POST /hosts/manage` | `HostCreateReqDto` | `ManagedHostDto` | PASS (F-1 해소) |
| 3 | 수정 | `PUT /hosts/manage/{hostid}` | `HostUpdateReqDto`(create+clearTemplateIds) | `ManagedHostDto` | PASS (F-1 해소) |
| 4 | 상태 | `PATCH /hosts/manage/{hostid}/status` | `HostStatusReqDto`{enabled} | `HostStatusResDto`{hostid,status} | PASS |
| 5 | 삭제 | `DELETE /hosts/manage/{hostid}` | `HostDeleteReqDto`{confirmName} | `HostDeleteResDto`{hostid} | PASS |
| 6 | 템플릿 | `GET /hosts/manage/templates` | keyword,limit | `TemplateRefDto[]` | PASS |
| 7 | 프록시 | `GET /hosts/manage/proxies` | 없음 | `ProxyRefDto[]` | PASS |

### 필드 단위 (전 필드 일치 확인)
- `ManagedHostDto` 10필드(hostid/host/name/status/monitoredBy/proxy/agentAvailable/groups/interfaces/templates) — 이름·타입·nullable 모두 FE `TManagedHost`와 일치. proxy(nullable), agentAvailable(string|null) 정합. (BE `toManagedHost` L366-395)
- 중첩: `GroupRefDto{groupid,name}`·`TemplateRefDto{templateid,name}`·`ProxyRefDto{proxyid,name(nullable)}`·`HostInterfaceDto{interfaceid,type,main,useip,ip,dns,port,available}`(전부 string) — FE 동명 타입과 완전 일치.
- 요청 `HostCreateReqDto`: `host`(@NotBlank)/name/groupIds/newGroupNames/`interface`(@JsonProperty로 hostInterface 매핑)/templateIds/monitoredBy(기본0)/proxyId/status(기본0) — FE `THostCreateReq` 필드명·옵셔널 일치. `interface` 키 매핑 정합(BE `HostCreateReqDto.java:37`, FE `host-manage.api`는 payload.interface 사용).
- `HostUpdateReqDto`는 create 상속 + `clearTemplateIds` — FE `THostUpdateReq = THostCreateReq & {clearTemplateIds?}` 일치.
- Lombok is-접두 함정 없음: `HostStatusReqDto`는 `Boolean enabled`(wrapper) + 필드명 `enabled` → JSON 키 `enabled`. FE `{enabled:boolean}` 일치. (함정 회피 확인)

---

## 2. 래퍼/언랩 깊이 — PASS

| 경로 | BE | FE 언랩 | 판정 |
|------|----|--------|------|
| 조회(1,6,7) | `ApiResult<T>` | axios 인터셉터 `response.data`(→envelope) + `useDmoveQuery` `envelope.data`(→payload) 2겹 | PASS |
| 뮤테이션(2~5) | `ApiResult<T>` | axios 인터셉터 1겹(→envelope) + service `unwrapEnvelope`가 `envelope.data` 반환/실패 throw | PASS |

- axios 인터셉터가 `response.data`만 반환(`axiosInstance.ts:85`) → envelope 1겹. 소비처는 `data.data` 미접근(과다 언랩 없음). 컴포넌트 접근 `data.items`/`data.total`(HostTab), `created`(TManagedHost 직접) 모두 payload 기준 — 정합.
- 뮤테이션 envelope 실패 판정(`host-manage.api.ts:45-54`): `status==="error" || code!==200` → throw. 403(HTTP200 body code:403)도 `code!==200`으로 포착되어 `HostManageApiError.code=403`. FE onError가 `error.code===HTTP_STATUS.FORBIDDEN`로 분기(HostFormDrawer/HostTab/HostDeleteModal). PASS.

---

## 3. 경로 매칭 충돌 — PASS

- BE: `HostManageController @RequestMapping("/hosts/manage")` 리터럴 세그먼트가 `HostController`의 `/hosts/{groupid}`(1-seg 패턴)·`/hosts/{hostid}/livecheck`(2-seg)보다 Spring `AntPathMatcher` 우선순위상 앞선다(리터럴 > {var}). livecheck 선례와 동일. HostController는 전부 GET, HostManage 뮤테이션은 POST/PUT/PATCH/DELETE라 메서드 레벨 충돌도 없음.
- FE: `axiosInstance` baseURL=`VITE_API_URL`(`/api/v1` 포함) + service baseUrl `"hosts/manage"`(무선행슬래시) → axios combineURLs로 `/api/v1/hosts/manage` 도달. 계약 §서두(FE base `/api/v1/hosts/manage`, 서버 매핑 `/hosts/manage`)와 일치. PASS.

---

## 4. enum/상수 값 — PASS (LOW 1)

- status: FE `HOST_STATUS_NUM{0,1}`(요청) / `HOST_STATUS{"0","1"}`(응답 문자열 비교) — BE 요청 Integer, 응답 String 원값 보존과 정합.
- monitoredBy 응답: FE `MONITORED_BY_STR{"0","1","2"}` — HostTab에서 "2"(proxy group) 표시까지 처리. BE 원값 문자열 보존 정합.
- confirmName: BE `delete()`가 `host`(기술명) 또는 `name`(표시명) 일치 재검증(L198-204). FE HostDeleteModal `isMatch = confirmValue===host.host || ===host.name`(L31-33) — 정책 동일(둘 다 허용).
- action 상수(CREATE/UPDATE/ENABLE/DISABLE/DELETE)는 BE 내부 감사로그 전용(`HostChangeLog.ACTION_*`), FE 노출 없음 — 경계면 무관.
- **LOW-1**: 요청 monitoredBy — HostFormDrawer 폼은 SERVER(0)/PROXY(1) 라디오만 노출(HostFormDrawer.tsx:451-458), PROXY_GROUP(2) 미제공. 계약은 0/1/2 허용이나 생성/수정에서 2를 보낼 수 없음. shape 결함 아님(응답 2는 정상 처리). 설계상 proxy group 2차 범위면 무해 — fe 인지 필요.

---

## 5. 에러 응답 — PASS

- BE 신설 4종 `HOST_GROUP_REQUIRED`/`HOST_PROXY_REQUIRED`/`HOST_DELETE_CONFIRM_MISMATCH`/`HOST_CREATE_FAILED` 모두 `ErrorCode.java:116-119` 존재. `HOST_NOT_FOUND`(L78)·`ZABBIX_API_ERROR`(L81) 기존 재사용 — 계약 에러표 6종 일치.
- FE는 errorCode 문자열을 직접 분기하지 않고 `code===403`만 별도 처리, 그 외는 `action_failed`/`delete_failed` 일반 메시지(HostFormDrawer:191-200 등). envelope의 `errorCode`/`message`는 `HostManageApiError`에 보존되나 UI에서 세분화 미사용 — 계약이 요구하는 shape 가정(code/status 기반 분기)은 충족. PASS.
- **LOW-2**: 비즈니스 에러(HOST_GROUP_REQUIRED 등)가 일반 실패 메시지로만 표시됨(errorCode별 안내 문구 없음). 기능상 무해하나 UX상 원인 미노출 — fe 개선 여지(정보성).

---

## 6. 쿼리 파라미터 직렬화 — PASS

- FE `getHostList`는 `serializerObjParams`(utils/index.ts:324) = `qs.stringify(..., {arrayFormat:"brackets"})` 후 `%5B%5D` 제거(REGEX.BRACKETS, constants/index.ts:27) → `groupids=2&groupids=5`(repeated).
- BE `ManagedHostListReqDto.groupids : List<String>` @ModelAttribute 바인딩 = repeated param 수용. 정합. PASS.
- status(number)/keyword/limit/offset 스칼라 직렬화 정상. templates EP는 plain params{keyword,limit} → @RequestParam 정합.

---

## FAIL 상세

### F-1 [HIGH → RESOLVED · 수정주체 fe] 그룹 ID space 불일치 — 생성/수정 시 잘못된 groupid 전송

> **재검증(fe 커밋 d9c4224): PASS.** 아래 4항 전부 확인.
> 1. 옵션 축 통일: `HostFormDrawer.tsx:102` `value: g.zabbixHostGroupId`. edit 프리필 `:173` `groups: host.groups.map(g => g.groupid)`(자빅스 id) — 두 축 모두 Zabbix groupid로 통일됨.
> 2. THostGroup additive: `user-roles.ts:31-38`에 `zabbixHostGroupId: string` 추가. 소비처(`useHostManage.ts:125`, `HostGroups.tsx`, `HostGroupTab.tsx`, `user-roles.api.ts`)는 전부 read-only(제네릭 타입파라미터/render 콜백)이며 THostGroup 객체 리터럴을 생성하는 곳 없음 → 필수 필드 추가가 레거시 타입을 깨지 않음. BE `HostGroupResponseDto`가 이미 런타임에 `zabbixHostGroupId`를 반환하므로 undefined 위험 없음.
> 3. newGroupNames("new:" prefix) 경로 정합 유지: 기존 옵션 value가 이제 숫자형 자빅스 groupid라 `new:` 접두와 충돌 없음. `buildPayload`의 `NEW_GROUP_PREFIX` 분기 불변 → 기존 선택=groupIds(자빅스 id), 신규=newGroupNames로 정확히 분리.
> 4. 회귀 가드 테스트 2건(`__tests__/HostFormDrawer.test.tsx:146-162`): (a) edit 프리필 라벨("Prod") 표시 — 옵션 value="10"(zabbixHostGroupId)와 프리필 groupid="10" 매칭 검증, (b) 제출 payload `groupIds === ["10"]`(자빅스 id) — 로컬 PK "5" 아님 검증. mock이 `id:"5" ≠ zabbixHostGroupId:"10"`로 의도적 분리해 축 혼동을 감지하도록 구성 — 어서션 타당.
>
> **(이하 초판 기록 — 결함 원인 보존)**


- 기대(BE): `POST/PUT /hosts/manage`의 `groupIds`는 **Zabbix host group id**. BE는 검증 없이 그대로 자빅스에 전달 — `HostManageService.java:113` `params.put("groups", groupIds.stream().map(id -> Map.of("groupid", id))...)`.
- 실제(FE): 그룹 select 옵션 값이 **로컬 DB PK**. `HostFormDrawer.tsx:96-100`
  ```
  const existing = (groupData?.items ?? []).map((g) => ({ label: g.name, value: g.id }));
  ```
  `groupData`는 `useHostManageGroups` → `/users/host-groups` → `HostGroupResponseDto`. 이 DTO는 `id`(로컬 PK, `HostGroupResponseDto.java:14,26 = entity.getId()`)와 `zabbixHostGroupId`(자빅스 id, L16,28)를 **별개**로 노출한다. FE는 자빅스 id가 아닌 `g.id`(로컬 PK)를 groupId로 담아 전송.
- 계약: §2 `groupIds` = "기존 Zabbix groupid 목록". BE `resolveGroupIds`도 신규 그룹은 `zabbixHostGroupId`를 쓴다(L269-283) — 즉 groupId축은 자빅스 id로 통일돼야 함.
- 파급:
  - 로컬 PK ≠ Zabbix groupid(독립 시퀀스) → 생성/수정 시 엉뚱한 그룹 연결 또는 자빅스 groupid 미존재로 `ZABBIX_API_ERROR`.
  - **수정(edit) 모드 내부 모순**: 프리필은 `groups: host.groups.map(g => g.groupid)`(자빅스 id, HostFormDrawer.tsx:168)인데 옵션 value는 로컬 PK → 프리필 값이 어떤 옵션과도 매칭 안 됨(라벨 미표시), 신규 선택분만 로컬 PK로 전송되는 이중 축.
- 근거 위치: FE `HostFormDrawer.tsx:99`(`value: g.id`) · `types/user-roles.ts:31-37`(`THostGroup`에 `zabbixHostGroupId` 필드 부재) ↔ BE `HostGroupResponseDto.java:14-16,26-28` · `HostManageService.java:113`.
- 권장 수정(fe):
  1. `THostGroup`에 `zabbixHostGroupId: string` 추가(BE가 이미 응답에 포함).
  2. `groupOptions`의 `value`를 `g.id` → `g.zabbixHostGroupId`로 교체. 이 한 줄로 edit 프리필(자빅스 groupid)과 옵션 축이 일치되어 프리필 라벨·신규 선택 모두 정합.
- 참고: 목록 필터 `groupids`(HostTab.tsx:94-104)는 `host.groups[].groupid`(자빅스 id)로 옵션을 구성하므로 필터 경로는 정상 — 결함은 등록/수정 폼에 국한.

---

## 이상 없음 확인 항목(회귀 방지 기록)

- livecheck 재사용부(`HostCreateResultStep.tsx`)의 `useDmoveQuery<TResponse<THostLiveCheck>>` + `data.ping.state`/`data.agent.state`/`data.ping.rttMs` 접근은 기존 `HostLiveCheckCell.tsx:84,167-194`와 동일 확립 패턴 — 런타임 정합, 결함 아님.
- `PagedListDto.total`(primitive long) → JSON number ↔ FE `total:number` 정합.
- 인증 헤더: 보호 EP 호출은 `axiosInstance`가 HttpOnly 쿠키(withCredentials) + `x-visitor-id` 자동 주입. BE `@VisitorIdCheck` + `AdminAccessChecker.requireAdmin`(userRole 기준, roleid `@Roles` 회피 — CLAUDE.md §3#2 준수). 정합.
- 쿼리 키 분리: `HOST_MANAGE_QUERY_KEY.*`(queryKey.ts:72-77) 신설로 레거시 캐시 충돌 방지(계약 §8) 준수.
