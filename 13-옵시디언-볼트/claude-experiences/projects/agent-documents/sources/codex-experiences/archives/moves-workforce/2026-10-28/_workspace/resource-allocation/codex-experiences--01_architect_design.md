# 프로젝트 인력 배정 현황 (Resource Allocation Graph) 설계서

> 단일 진실 원천. backend/frontend/verifier 는 §2 경계면 계약 표를 기준으로 작업한다.
> 요구: `_workspace/resource-allocation/00_input/requirement.md`
> resource-profile 과 별개 신규 기능이나 같은 `/resource` 도메인 → project_users·isProjectClosed·buildPeoplecontext·ResourceProfileDrawer·rollup 재사용.

---

## 1. 개요 / 영향 범위

`/resource` 에 **"배정 현황" 탭**을 추가하고, ECharts **graph(N:M 이분 관계도)**로 프로젝트↔담당자 배정을 시각화한다. 조회/시각화 전용(배정 편집 없음).

- **백엔드 (`src/resolver/resourceManagement/`)**
  - 신규 resolver `getResourceAllocationGraph` — project_users⋈project 1회 조립 + userMap/status/rollup 재사용. 조립조회 → `res.content`.
  - 신규 쿼리 `ProjectUsersQuery.FIND_ALL_ALLOCATIONS`(활성) / `FIND_ALL_ALLOCATIONS_WITH_CLOSED`(종료 포함).
  - `isProjectClosed(endDate)` 순수함수 재사용(resource-profile v2에서 도입 예정 — 없으면 이 기능에서 신설, 공용화).
- **프론트 (`static/ui/src/pages/resource/`)**
  - `ResourcePage.jsx` 로컬 Tabs 에 3번째 탭 "배정 현황" 추가.
  - 신규 `allocation/` — `AllocationTab`, `AllocationGraph`(ReactECharts graph), `AllocationFilters`, `useResourceAllocation`, graph option 빌더.
  - **ResourceProfileDrawer 재사용**(담당자 노드 클릭 → 드로어).
- **DB**: **마이그레이션 없음**(project_users⋈project 읽기 JOIN 1건 추가).
- **i18n**: `locales/kr/resource.json`·`locales/en/resource.json` 에 `nav/tab`·`allocation.*` 키 추가.
- **권한**: 기존 `RESOURCE_MANAGEMENT` 재사용 + `PermissionMap` read 매핑 1건 추가.

---

## 2. 경계면 계약 (가장 중요)

컨벤션: 조립조회 = **`res.content`**. status 목록 = 기존 `getProjectStatusList`(`res.rows`) 재사용(신규 resolver 아님).

| resolver 함수 | 입력 payload | 응답 shape (success) | 대응 프론트 훅 / 쿼리키 |
|--------------|-------------|----------------------|------------------------|
| `getResourceAllocationGraph` (신규) | `{ includeClosed?: boolean }` (기본 false = 종료 제외) | `{ success, content: { projects, members, links, generatedAt } }` (아래 상세) | `useResourceAllocation({includeClosed})` / `resourceKeys.allocation({includeClosed})` |
| `getProjectStatusList` (재사용) | `{}` | `{ success, rows: [{id, name, color, order}] }` (기존, 변경 없음) | 상태 필터 옵션 로드 |

### 2.1 `getResourceAllocationGraph` content 확정 shape

```jsonc
{
  "projects": [
    {
      "projectId": "uuid",
      "projectName": "string",
      "statusKey": "status-xxx | null",
      "statusName": "진행중 | null",     // status 엔티티(KVS) 라벨
      "statusColor": "green | null",     // status 엔티티 color (상태 배지용, 엣지색 아님)
      "endDate": "2026-12-31 | null",
      "closed": false,                   // isProjectClosed(endDate) — 종료 포함 로드 시 구분용
      "memberCount": 5                   // 이 프로젝트 배정 인원 수
    }
  ],
  "members": [
    {
      "accountId": "string",
      "displayName": "string",
      "avatarUrl": "https://.../48x48 | null", // 노드 image symbol
      "assignedCount": 3,                       // 배정된 distinct 프로젝트 수(중복배정 강조 기준)
      "util": 0.82 | null,                      // rollup 재사용(tooltip 부하 요약)
      "utilBand": "idle|normal|over|red|unknown"
    }
  ],
  "links": [
    { "projectId": "uuid", "accountId": "string", "roleKey": "role-xxx|null", "roleName": "개발자|null" }
  ],
  "generatedAt": "2026-07-21T09:00:00.000Z"
}
```
- **엣지 색 = 프로젝트별**: 백엔드는 색을 지정하지 않는다(팔레트는 프론트가 `projectId` 기준 결정적 매핑 — §4.3). `statusColor` 는 상태 배지용이며 엣지색과 무관.
- **중복 배정**: `members[].assignedCount >= 2` → 프론트가 노드 크기/색 강조(§4.3).
- 필터(상태·프로젝트 다중선택)는 **프론트 클라이언트 필터**(재조회 없음). `includeClosed` 토글만 재조회(종료 프로젝트 대량 로드 방지 — §3.1 근거).

**실패/폴백**: responseWrapper `{ success:false, error }`. userMap(Jira bulk) 실패 시 해당 member `displayName=accountId, avatarUrl=null` 폴백(그래프는 뜬다, throw 안 함). rollup 없으면 `util=null`.

---

## 3. 백엔드 설계

### 3.1 신규 쿼리 — `ProjectUsersQuery`

project_users⋈project 1회 조립(**N+1 없음**). 활성 기본 + 종료 포함 변형 2종:

```sql
-- 활성만(기본): end_date 미종료
FIND_ALL_ALLOCATIONS: `
  SELECT BIN_TO_UUID(pu.project_id) AS project_id,
         p.project_name, p.project_status_key, p.end_date,
         pu.account_id, pu.role_key
  FROM projectusers pu
  JOIN project p ON p.project_id = pu.project_id
  WHERE (p.end_date IS NULL OR p.end_date >= CURDATE())
  ORDER BY p.project_name, pu.account_id
`
-- 종료 포함(includeClosed): end_date 필터 없음 (WHERE 절 제거)
FIND_ALL_ALLOCATIONS_WITH_CLOSED: `... (WHERE 없음) ...`
```
- `INDEX(project_id, account_id)` 활용. 반환 행 = Σ(프로젝트 인원). 수백 프로젝트×수 인원이라도 단일 SQL로 안전.
- 종료 판정은 **`end_date`**(status 엔티티에 종료 플래그 부재 — resource-profile v2 실측). SQL `end_date` 필터로 활성 기본 볼륨 한정.

### 3.2 Service — `getResourceAllocationGraphService({ includeClosed })` (조립조회, `content` 반환)

```
1) rows = executeQuery(includeClosed ? FIND_ALL_ALLOCATIONS_WITH_CLOSED : FIND_ALL_ALLOCATIONS)
2) Promise.all (병렬 조립, 신규 워크로그 페치 없음):
   - userMap(distinctAccountRows)   // getBulkJiraUsersApi bulk 1회 → accountId→{displayName,avatarUrls} (N+1 없음)
   - getRoleListService()           // res.data → roleName 라벨
   - getProjectStatusListService()  // res.rows → statusName/color 라벨
   - getRollupMeta()                // utilizationPeople 1회 read → util(tooltip)
3) 조립:
   projectMap: project_id → { projectId, projectName, statusKey, statusName, statusColor, endDate,
                              closed: isProjectClosed(endDate), memberCount(누적) }
   memberMap:  account_id → { accountId, displayName, avatarUrl(48x48), assignedCount(distinct project),
                              util, utilBand(classifyUtilBand) }
   links: rows.map → { projectId, accountId, roleKey, roleName(roleNameMap) }
4) assignedCount = distinct project 수(중복배정), memberCount = 프로젝트별 distinct account 수
5) return { content: { projects:[...projectMap], members:[...memberMap], links, generatedAt } }
```
- **재사용**: `userMap`(UserService), `getRoleListService`, `getProjectStatusListService`, `getRollupMeta`, `classifyUtilBand`(ResourceMatch). buildPeopleContext 전체를 부르지 않고 필요한 조각만 조립(배정 그래프는 skill/salary 불필요 → 경량).
- **util 결합 근거**: rollup은 KVS 1회 read(신규 페치 아님)라 tooltip 부하 요약에 무료 결합. **완수율은 제외**(getResourceLoadSummary = Jira 배치라 그래프 로드에 과함) — 완수율/진행중 작업은 노드 클릭 시 ResourceProfileDrawer에서 확인.

### 3.3 `isProjectClosed(endDate)` 순수함수
- resource-profile v2에서 도입 예정. 미도입 상태면 이 기능에서 신설(공용 `ResourceProjectStatus.js` 또는 `ResourceMatch.js`), jest 포함:
  `isProjectClosed = (endDate) => endDate != null && new Date(endDate) < todayDateOnly`
- 종료 포함 로드(`includeClosed`) 시 `closed` 플래그 산출에 사용(활성 로드에선 전부 false).

### 3.4 Controller / 등록 / 권한
- `ResourceManagementController.js` — `guardedDefine` 1건 추가:
  ```js
  guardedDefine(resolver, 'getResourceAllocationGraph', ({ payload }) => getResourceAllocationGraphService(payload));
  ```
- `src/index.js` — `registerResourceManagementController` 기존 호출 → **변경 없음**.
- `src/permission/PermissionMap.js` — 추가:
  ```js
  getResourceAllocationGraph: R('RESOURCE_MANAGEMENT'),
  ```

### 3.5 에러 케이스
- 입력 검증 불필요(includeClosed 기본 false). Jira/rollup 실패는 부분 폴백(throw 안 함). SQL 실패만 전파.

---

## 4. 프론트엔드 설계

### 4.1 탭 추가 — `ResourcePage.jsx` (로컬 Tabs)
기존 로컬 `Tabs`(Overview/Match)에 3번째 추가:
```
<Tab>{t('resource.tab.allocation')}</Tab>
...
<TabPanel><AllocationTab /></TabPanel>
```
- `constants/tabs.js` 아님(자원관리는 페이지 내부 로컬 Tabs 확인). 권한 게이트는 페이지 상단 `canRead('RESOURCE_MANAGEMENT')` 그대로 커버.

### 4.2 컴포넌트 트리 (신규)
```
pages/resource/allocation/
  AllocationTab.jsx          // 필터 상태 + 그래프 + 드로어 오케스트레이션
  AllocationFilters.jsx      // 상태 다중선택(getProjectStatusList) + 프로젝트 다중선택 + includeClosed 토글
  AllocationGraph.jsx        // ReactECharts(echarts-for-react) graph series + onEvents
  useResourceAllocation.js   // invoke('getResourceAllocationGraph', {includeClosed}) → res.content
  allocationGraphOption.js   // ECharts option 빌더(components/chart/echart/options 패턴)
```

### 4.3 `AllocationGraph.jsx` — ECharts graph 스펙
- 라이브러리: `echarts-for-react`(기존). 래핑은 `EchartPanel` 재사용 가능(리사이즈 옵저버).
- **레이아웃**: 이분(좌 프로젝트 / 우 담당자) → `series.layout:'none'` + 좌표 수동 배치.
  - 프로젝트 노드: `x=100`, `y = index * gap` (좌열).
  - 담당자 노드: `x=560`, `y = index * gap` (우열).
- **nodes(data)**:
  - 프로젝트: `{ id:'p:'+projectId, name:projectName, category:0, symbol:'roundRect', symbolSize:[label기반], itemStyle.color: projectColor(projectId), label:{show:true} }`
  - 담당자: `{ id:'m:'+accountId, name:displayName, category:1, symbol: avatarUrl?('image://'+avatarUrl):'circle', symbolSize: 30 + (assignedCount>=2 ? assignedCount*6 : 0), itemStyle.borderColor: assignedCount>=2 ? 강조색 : 기본, label:{show:true, position:'right'} }`
- **links**: `{ source:'p:'+projectId, target:'m:'+accountId, lineStyle:{ color: projectColor(projectId), width: 2, opacity:0.7 } }`
- **엣지색/프로젝트색**: `projectColor(projectId)` = 결정적 categorical 팔레트(DMOVE 틸 스케일 PRIMARY #21ADAD 기반 + 확장 categorical). `projects` 인덱스가 아닌 **projectId 해시/정렬 인덱스** 기준 → 상태 필터로 목록이 바뀌어도 프로젝트별 색 안정.
- **emphasis**: `emphasis:{ focus:'adjacency' }` (hover 시 연결 엣지·노드 강조 — 요구 emphasis).
- **tooltip**: `trigger:'item'`, formatter 분기:
  - 담당자 노드 → 이름 + `배정 {assignedCount} 프로젝트` + 프로젝트별 역할 목록 + `가동율 {util%}/{utilBand}`.
  - 프로젝트 노드 → 프로젝트명 + 상태 + `팀원 {memberCount}명`.
  - 엣지 → `프로젝트 — 담당자 (역할)`.
- **클릭 → 드로어**: `onEvents={{ click: (p)=> p.dataType==='node' && p.data.id.startsWith('m:') && openDrawer(accountId) }}`.
- 데이터 매핑: `useResourceAllocation` 의 `content.{projects,members,links}` + 클라이언트 필터 결과 → option 빌더.

### 4.4 필터 (`AllocationFilters.jsx`) — 클라이언트 필터
1. **상태 다중선택**: 옵션 = `getProjectStatusList().rows`(재사용 훅 or 기존 쿼리키). 기본값 = **전체 활성 상태 선택**(= 로드된 projects의 statusKey 집합; `includeClosed=false`라 이미 종료 제외). 선택 상태의 projectId만 통과.
2. **프로젝트 다중선택**: 옵션 = 상태필터 통과한 projects. 선택 시 해당 projectId만.
3. **종료 포함 토글**: on → `useResourceAllocation({includeClosed:true})` 재조회(closed 프로젝트 포함, 노드에 종료 표시).
- 필터는 `projects`/`links`/`members` 를 클라이언트에서 좁혀 option 재계산(연결 없는 member 노드는 제외).

### 4.5 훅 / 쿼리키
- `resourceKeys.allocation = (params) => ["resource", "allocation", params]` 추가(`utils/queryKey/resourceKeys.js`).
- `useResourceAllocation({includeClosed})`: `invoke('getResourceAllocationGraph', { includeClosed })` → `res.content` 검증 후 `{projects, members, links}` 반환. `enabled: canRead`, `staleTime: 5*60*1000`.

### 4.6 드로어 재사용
- `AllocationTab` 에 `const [drawerAccountId, setDrawerAccountId] = useState(null)`.
- 담당자 노드 클릭 → `setDrawerAccountId(accountId)`.
- `<ResourceProfileDrawer isOpen={!!drawerAccountId} accountId={drawerAccountId} onClose={...} />`(resource-profile 산출물 그대로 import). 진행중 작업·부하·경험 확인.

### 4.7 권한
- `usePermissionStore` `canRead('RESOURCE_MANAGEMENT')` — 페이지 게이트 유지. 신규 쓰기 없음.

---

## 5. DB 설계
- **마이그레이션·DDL 변경 없음.** `ProjectUsersQuery` 에 읽기 JOIN 쿼리 2 변형 추가(§3.1). 종료 판정 `end_date`.

---

## 6. i18n 키 목록 (신규)

`locales/kr/resource.json`·`locales/en/resource.json` 추가 후 `cd static/ui && npm run merge`.

| 키 | kr | en |
|----|----|----|
| `tab.allocation` | 배정 현황 | Allocation |
| `allocation.title` | 프로젝트 인력 배정 현황 | Project resource allocation |
| `allocation.description` | 프로젝트별 배정 인력과 중복 배정을 한눈에 | Assignments and cross-project overlaps at a glance |
| `allocation.filter.status` | 진행 상태 | Status |
| `allocation.filter.project` | 프로젝트 | Project |
| `allocation.filter.includeClosed` | 종료 프로젝트 포함 | Include closed |
| `allocation.filter.allStatus` | 전체 상태 | All statuses |
| `allocation.filter.allProject` | 전체 프로젝트 | All projects |
| `allocation.tooltip.assigned` | 배정 {count} 프로젝트 | Assigned to {count} projects |
| `allocation.tooltip.members` | 팀원 {count}명 | {count} members |
| `allocation.tooltip.util` | 가동율 | Utilization |
| `allocation.tooltip.role` | 역할 | Role |
| `allocation.node.overload` | 중복 배정 | Multi-assigned |
| `allocation.empty` | 배정된 인력이 없습니다 | No allocations |
| `allocation.legend.project` | 프로젝트 | Project |
| `allocation.legend.member` | 담당자 | Member |

- util 밴드 라벨은 기존 `resource.band.*` / `resource.util.*` 재사용.

---

## 7. 구현 작업 분해

### Backend
- [ ] `ProjectUsersQuery.FIND_ALL_ALLOCATIONS` / `FIND_ALL_ALLOCATIONS_WITH_CLOSED` 추가(project JOIN, end_date 필터).
- [ ] `isProjectClosed(endDate)` 순수함수(공용, resource-profile v2와 공유) + jest.
- [ ] `ResourceManagementService.getResourceAllocationGraphService({includeClosed})` — 쿼리 1회 + userMap/role/status/rollup 병렬 조립, projects/members/links 구성, `content` 반환, 부분 폴백.
- [ ] `ResourceManagementController` — guardedDefine 1건.
- [ ] `PermissionMap` — `getResourceAllocationGraph: R('RESOURCE_MANAGEMENT')`.
- [ ] `src/index.js` 변경 불필요 확인.

### Frontend
- [ ] `resourceKeys.allocation(params)` 추가.
- [ ] `useResourceAllocation.js`(res.content 소비).
- [ ] `allocationGraphOption.js`(graph series 빌더: 좌표 이분배치·projectColor 팔레트·avatar image symbol·assignedCount 강조·emphasis adjacency·tooltip formatter).
- [ ] `AllocationGraph.jsx`(ReactECharts + onEvents click → 드로어).
- [ ] `AllocationFilters.jsx`(상태/프로젝트 다중선택 + includeClosed 토글, 클라이언트 필터).
- [ ] `AllocationTab.jsx`(오케스트레이션 + ResourceProfileDrawer 재사용).
- [ ] `ResourcePage.jsx` 탭 3번째 추가.
- [ ] i18n 키 추가 후 merge.

---

## 8. 열린 질문 / 가정

1. **필터 방식(클라이언트 vs 서버)**: 상태·프로젝트 필터는 **클라이언트**(재조회 없이 즉각 반응), `includeClosed`만 서버 재조회. 근거: 활성 배정 볼륨은 단일 SQL로 안전하고, 필터 반응성이 UX상 중요. 종료 포함은 볼륨이 커질 수 있어 옵트인 재조회로 분리. 볼륨이 예상보다 크면 서버 파라미터 필터로 전환(계약에 `statusKeys` 추가) — 후속.
2. **엣지 색 팔레트**: 프로젝트별 결정적 색(projectId 정렬 인덱스 기준). 프로젝트 수가 팔레트를 초과하면 색 순환(HSL 분할 생성 권장). DMOVE 틸(#21ADAD) 포함 categorical 팔레트를 프론트 상수로 정의.
3. **레이아웃**: `layout:'none'` 수동 이분배치(좌 프로젝트/우 담당자) 채택. 노드 많을 때 y 겹침은 스크롤/높이 동적 확대로 대응. 대안 `layout:'force'`(자동 분산)는 좌우 고정이 약해 요구(좌/우 이분)와 덜 맞음 — 기각하되 노드 과다 시 재검토.
4. **util만 tooltip 결합, 완수율 제외**: rollup 1회 read는 무료라 util 포함, 완수율(Jira 배치)은 그래프 로드 과부하라 드로어에서 확인. (요구 §"부하 결합(선택)" 취지 준수.)
5. **`isProjectClosed` 소유권**: resource-profile v2와 동일 함수. 두 기능이 병렬 구현되면 한 곳에 신설·공유(중복 정의 주의). verifier가 중복 확인.
6. **avatar image symbol CSP**: ECharts `image://{avatarUrl}` 는 Jira avatar CDN 로드. Forge 프론트(커스텀 UI)에서 외부 이미지 로드 정책 확인 필요 — 차단 시 `circle` symbol + 이니셜 fallback(UserAvatar 패턴)로 대체. 착수 시 실측.
