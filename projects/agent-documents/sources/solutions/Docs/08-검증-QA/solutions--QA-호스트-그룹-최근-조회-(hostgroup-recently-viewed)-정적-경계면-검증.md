# QA: 호스트 그룹 최근 조회 (hostgroup recently-viewed) — 정적 경계면 검증

검증자: integration-qa / 날짜: 2026-06-19 / 방식: 정적 교차 대조 (런타임 동작은 functional-qa 몫)

전체 판정: **PASS (경계면 shape/문자열/경로/래퍼깊이 정합)**. 이번 변경 범위 내 BE↔FE 불일치 0건.
선재(pre-existing) 리스크 1건과 functional-qa 권고 항목을 하단에 분리 기록.

---

## 항목별 결과

### 1. refType 문자열 일치 — PASS
- BE enum: `RecentlyViewedRefType.HOSTGROUP = 'HOSTGROUP'`
  (`moveseye-be/src/database/models/recently-viewed.entity.ts:14`)
- FE enum: `MonitoringType.HOSTGROUP = "HOSTGROUP"`
  (`moveseyee_fe/src/enums/common.ts:123`)
- 대소문자까지 정확히 동일. mark-view·recently-viewed 양쪽 모두 동일 enum값 전송.
  - recently-viewed 전송: `RecentlyView.tsx:41` `refType: monitoringType` (=HOSTGROUP)
  - mark-view 전송: `HostGroupDetail.tsx:75` `{ refType: MonitoringType.HOSTGROUP }`
- BE DTO `@IsEnum(RecentlyViewedRefType)` (`mark-viewed.dto.ts:10`)가 HOSTGROUP을 유효값으로 허용.

### 2. 응답 item shape 정합 — PASS
- BE HOSTGROUP 분기 반환 필드(`host.service.ts:1716-1720`): `{ hostid: foundGroup.groupid, name: foundGroup.name, createdAt: ISO }`.
  - region/host 필드 **미포함** (계약 §2,§7-1 준수).
- FE 소비(`RecentlyView.tsx:73,76`): `item?.hostid`, `item.name`만 참조.
  - HOSTGROUP 분기에서 `item.region`/`item.host` 참조 **없음** (`isEC2Detail`일 때만 region 사용, `RecentlyView.tsx:74`). undefined 접근 없음. (계약 §7-1 준수)
- FE 타입 `TRecentlyViewedItems`(`types/host-monitoring.ts:96-103`): `hostid`(필수), `name`(필수), `region?`(EC2전용 optional), `createdAt?`(optional).
  - HOSTGROUP 응답이 createdAt을 항상 담지만 타입상 optional → 과소 제약이나 런타임 무해(읽기 측에서 createdAt 미사용). PASS.

### 3. 링크 경로 (groupid 매핑) — PASS
- BE: `hostid` 키에 groupid를 담음(`host.service.ts:1717`, 계약 §3/§4).
- FE: `isHostGroup`일 때 `basePath = PATH_MONITORING.hostGroup`(`RecentlyView.tsx:62-64`),
  링크 `to={`${basePath}/${item?.hostid}?`}`(`RecentlyView.tsx:74`) → `/monitoring/host-group/{groupid}`.
- `PATH_MONITORING.hostGroup = "/monitoring/host-group"`(`routes.ts:28`), 상세 라우트 `/host-group/:id`(`routes.ts:29`)와 정합.

### 4. 쿼리 파라미터 — PASS
- BE recently-viewed query DTO(`mark-viewed.dto.ts` SearchRecentlyViewedReqDto): `refType`(필수), `excludeId`(필수, `@IsNotEmpty`), `limit`/`offset`(BasePageDto, 기본 10/0).
  - `excludeId`는 서비스에서 `filter.excludeId || ''`로 빈값 허용 처리(`host.service.ts:1663`).
- FE 전송(`host-monitoring.api.ts:195-202`): `{ refType, excludeId }` + TParams를 serializer로 전송.
  - 목록(빈값): `excludeId: id ?? instanceId ?? ""` → 목록 컨텍스트에서 `id` 없으면 `""`(`RecentlyView.tsx:43`). BE가 `''` 허용 → 정합.
  - 상세(groupid): host-group 상세에서는 RecentlyView가 렌더되지 않음(상세 페이지는 RecentlyView 미사용 — 아래 §7 참고). 따라서 excludeId=groupid 경로는 현재 화면 구성상 발생 안 함. (정적상 모순 아님)
  - `limit`/`offset`은 FE가 명시 전송하지 않음 → BE 기본값(10/0) 적용. RecentlyView는 상위 3개만 slice하므로 무해. PASS.
- mark-view(`HostGroupDetail.tsx:74-77`): `:id=groupid`, query `refType=HOSTGROUP`, region 생략. 계약 §2/§8 준수.

### 5. 래퍼 깊이 — PASS
- BE: `ApiResult<PaginationResponseDto<item>>` → `data: { items, total }`(`host.controller.ts:165-174`, `host.service.ts:1724-1727`).
- FE 언랩 체인: axios 인터셉터가 ApiResult body 1겹 → useDmoveQuery가 envelope `.data` 1겹(`useDmoveQuery.ts:22-27`) → 소비 시 payload(`{items,total}`) 직접 수신.
- RecentlyView 접근: `recentlyViews?.items?.slice(0,3)`(`RecentlyView.tsx:57`) → payload 레벨에서 `.items` 접근. 깊이 정확(과다/과소 언랩 없음). PASS.
  - 참고: FE 타입 표기는 `TResponse<TRecentlyViewed>`이나 실제 언랩 결과는 `TRecentlyViewed`. 기존 SERVER/NETWORK/EC2와 동일한 타입 표기 관행으로 런타임 무해(메모리 fe-usedmovequery-unwrap와 일치).

### 6. getMonitoringType 판정 정확성 — PASS
- `utils/index.ts:139-155`:
  - SERVER: `currentPath.includes("server-monitoring")` (MONITORING_PATHS.SERVER, `host-monitoring.ts:100`)
  - NETWORK: `currentPath.includes("network-monitoring")`
  - HOSTGROUP: **substring이 아니라 matchPath**로 `PATH_MONITORING.hostGroup`("/monitoring/host-group") / `hostGroupDetail`("/monitoring/host-group/:id")에만 정확 매칭(`utils/index.ts:149-152`).
- 충돌 검토:
  - `/users-roles/host-groups`(복수, `routes.ts:65`)와 substring 충돌 우려 → matchPath 사용으로 회피됨. matchPath는 전체 경로 정확 매칭이라 `/users-roles/host-groups`는 `/monitoring/host-group(/:id)` 패턴에 매칭 안 됨. PASS.
  - `MONITORING_PATHS.HOST_GROUP="host-group"`(`host-monitoring.ts:102`)는 getMonitoringType에서 **사용되지 않음**(matchPath 경유). 미사용 상수이나 무해.
  - server/network substring이 host-group 경로에 포함되지 않음(경로상 독립). PASS.

### 7. mark-view 호출 위치 — PASS (정적), 일부 functional-qa 권고
- HostGroupDetail에서 mark-view 직접 호출(`HostGroupDetail.tsx:71-79`):
  - queryKey: `[SERVER_QUERY_KEY.MARK_VIEW, MonitoringType.HOSTGROUP, id]` — refType별 캐시 분리 적절.
  - queryFn: `getMarkViewHost({ refType: HOSTGROUP }, Number(id))` — region 생략, :id=groupid. 계약 정합.
  - enabled: `!!id` — 그룹 id 있을 때만 호출. 적절.
- 서버/네트워크/EC2 상세는 HeaderDetailInfo에서 mark-view를 호출(주석 `HostGroupDetail.tsx:68-70`). HostGroupDetail은 HeaderDetailInfo를 사용하지 않으므로 직접 호출 — 중복/충돌 없음. 정적상 회귀 없음.

### 8. 회귀 (SERVER/NETWORK/EC2) — PASS
- BE: SERVER/NETWORK 분기(`host.service.ts:1740-1756`) `{hostid,name,host,createdAt}`, EC2 분기(`1758-1775`) `{hostid,name,region}` — HOSTGROUP early-return(`1724`) 이전/이후 기존 로직 그대로 유지. host.get 호출은 HOSTGROUP일 때만 건너뜀(early return), SERVER/NETWORK/EC2는 종전대로 host.get 거침(`1730`). 계약 §7-2 준수.
- FE: RecentlyView의 분기 우선순위 `isEC2Detail → isHostGroup → isServer → (else)NETWORK`(`RecentlyView.tsx:60-69`). HOSTGROUP 분기 삽입이 기존 SERVER/NETWORK/EC2 분기 결과를 바꾸지 않음(상호배타적, monitoringType 단일값). 회귀 없음.
- queryKey 변경(`isServer` → `monitoringType`, diff 확인): SERVER/NETWORK/HOSTGROUP을 모두 구분하므로 캐시 정확도 **개선**(회귀 아님). 기존엔 NETWORK가 `isServer=false`로 한 키에 뭉쳤으나 영향 미미.

---

## 발견된 불일치 (이번 변경 범위)
- **없음.** BE↔FE 경계면 shape/문자열/경로/래퍼깊이 전부 정합. be-engineer / fe-engineer 라우팅 불필요.

## 잔여 리스크 (이번 변경 범위 밖 / 선재)
- **R1 (선재, Low) — RecentlyView.tsx `t` 미import.** `t("recently_view")`(`RecentlyView.tsx:52`)가 `useTranslation`/`i18next` import 없이 사용됨. git 이력상 init 커밋부터 동일(이번 HOSTGROUP 변경이 도입한 회귀 아님 — working tree diff에서 `t` 라인 미수정 확인). 전역 `t` 선언도 없음(`vite-env.d.ts`/eslint globals 미정의). 기존 SERVER/NETWORK 화면에서도 동일 컴포넌트가 렌더되므로, 만약 실제 ReferenceError였다면 기존 기능에서 이미 드러났을 것. **이번 작업 책임 아님**이나, host-group 목록 화면에서 RecentlyView가 실제 렌더링되는지 functional-qa가 확인 시 함께 관찰 권고.

## functional-qa 확인 권고 (런타임 동작 — 정적 검증 불가)
1. **목록↔상세 excludeId 흐름**: host-group 상세에서 RecentlyView가 렌더되지 않으므로(상세는 5탭 구성, RecentlyView 미배치) "현재 보고 있는 그룹 자신 제외"가 화면상 적용되는 지점이 목록뿐. 의도대로 목록에서 직전 조회 그룹들이 노출되고 자기 자신 제외가 동작하는지 런타임 확인.
2. **mark-view → 목록 반영 end-to-end**: HostGroupDetail 진입 시 mark-view 기록 → 목록(테이블/카드뷰) RecentlyView에 해당 그룹이 최근 조회로 노출되는지.
3. **R1 검증**: RecentlyView가 host-group 목록에서 ReferenceError 없이 렌더되는지(`t` 해소 여부 실측).
4. **Zabbix hostgroup.get 매핑**: 삭제된/없는 groupid가 최근 조회에 남은 경우 `hostGroups.some(...)` 필터로 누락 처리(`host.service.ts:1709`)되어 빈 항목이 안 뜨는지.
