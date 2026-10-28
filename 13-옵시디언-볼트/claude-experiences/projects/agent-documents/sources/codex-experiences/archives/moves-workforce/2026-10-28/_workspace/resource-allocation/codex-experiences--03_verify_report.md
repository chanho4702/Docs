# Resource Allocation Graph — 통합 정합성 검증 리포트

> 검증자: integration-verifier. 방법: 생산자(resolver/service/SQL)↔소비자(invoke 훅/option 빌더/그래프/탭) **양쪽 동시 읽기** 교차 비교 + jest/build.
> 기준: `01_architect_design.md` §2 계약.
> **결론: 경계면 불일치·엣지 dangling·회귀 0건. 전 항목 통과.** 실행 검증(백엔드 229 / 프론트 74 / build) 성공.

---

## 통과 (PASS)

### P1. `getResourceAllocationGraph` shape — projects/members/links/generatedAt 완전 일치
- 생산자: `ResourceManagementService.js:409-416` → `content:{ projects, members, links, generatedAt }`.
  - projects[](`:358-367`): `projectId/projectName/statusKey/statusName/statusColor/endDate/closed/memberCount` (8필드) ✓
  - members[](`:383-390`): `accountId/displayName/avatarUrl(48x48)/assignedCount/util/utilBand` (6필드) ✓
  - links[](`:373-378`): `projectId/accountId/roleKey/roleName` (4필드) ✓
- 소비자: `useResourceAllocation.js:32-35`(`res.success && res.content` 가드 후 `{projects,members,links,generatedAt}`) → `allocationGraphOption.js` + `AllocationGraph.jsx`가 정확 경로 소비. ✓
- **엣지 dangling 없음(핵심)**: option 빌더의 노드 id = `p:${projectId}`(`:72`) / `m:${accountId}`(`:97`), 엣지 source/target = `p:${l.projectId}`/`m:${l.accountId}`(`:128-129`). `AllocationTab.jsx:33-38` 클라이언트 필터가 **fLinks ⊆ fProjects 소속**(`:35` projectIdSet 필터) → **fMembers ⊆ fLinks 참여자**(`:36-37` accountIdSet 필터)로 좁혀, 모든 엣지의 양끝 노드가 반드시 존재. 백엔드 조립도 link push 전 projectMap/memberMap 등록 보장(`:356,380`). dangling 불가. ✓
- ECharts categories 좌우 배치: 프로젝트 `category:0, x:100`(`:76`), 담당자 `category:1, x:600`(`:99`), y=idx*46 이분 배치. ✓

### P2. 중복 배정 강조 — assignedCount 산출 ↔ 강조 로직 일치
- 백엔드: `assignedCount = memberProjects.get(accountId).size`(distinct 프로젝트 수, `:395-396,404-407`). 중복배정 기준.
- 프론트: `overloaded = assignedCount >= 2`(`allocationGraphOption.js:92`) → 노드 크기 `30 + min((n-1)*6, 24)`(`:95`) + 빨강 테두리 `#E34935` width 3(`:106-107`) + 라벨 `(n)` 병기(`:112-113`). 백엔드 산출값과 정합. ✓

### P3. 엣지색 — projectId 결정적 팔레트(필터 순서 무관)
- `projectColor(projectId) = PROJECT_PALETTE[hashString(projectId) % 16]`(`:28-30`). **리스트 인덱스 아닌 projectId 해시** → 상태/프로젝트 필터로 목록이 바뀌어도 프로젝트별 색 고정. ✓
- 동일 매핑을 프로젝트 노드색(`:79`)·엣지색(`:130`)에 적용 → 프로젝트-엣지 색 일관. DMOVE 틸 `#21ADAD` 포함. ✓

### P4. 필터(클라이언트) — 상태·프로젝트 다중선택 + includeClosed 재조회
- 상태/프로젝트: `AllocationFilters.jsx` `@atlaskit/select isMulti`, 옵션은 로드된 projects distinct(`:26-39`). 클라이언트 필터(`AllocationTab.jsx:27-39`, 재조회 없음). ✓
- `includeClosed`: Checkbox → `onChange({includeClosed})`(`:82-86`) → `useResourceAllocation({includeClosed})` 쿼리키 분리(`resourceKeys.allocation({includeClosed})`, `:19`)로 **서버 재조회**. 기본 `false`(활성만, `INITIAL:11`). ✓
- **statusKey null 일관**: 필터·탭 양쪽 `p.statusKey ?? '__none__'`(`AllocationFilters:29,37` ↔ `AllocationTab:29`)로 동일 그룹핑. ✓
- 상태 변경 시 통과 못한 프로젝트 선택 자동 정리(`AllocationFilters:57-62`). ✓

### P5. 드로어 연동 — member 노드 클릭 → ResourceProfileDrawer 재사용(무회귀)
- `AllocationGraph.jsx:51-58` onEvents click → `dataType==='node' && id.startsWith('m:')` → `_accountId ?? id.slice(2)` → `onMemberClick(accountId)`.
- `AllocationTab.jsx:46-53` openMemberDrawer → `ResourceProfileDrawer`(resource-profile 산출물, `:94-100`)에 `accountId/fallbackPerson/canWrite/onClose` 전달. 드로어 시그니처(`ResourceProfileDrawer({isOpen,accountId,fallbackPerson,canWrite,onClose})`)와 정확 일치 → 재사용 회귀 없음. ✓
- `fallbackPerson.avatarUrls={'24x24': avatarUrl}`(`:51`) — 드로어 헤더 `header.avatarUrls?.['24x24']` 경로와 일치(48x48 URL을 24x24 슬롯 사용, 스케일만 다름 — 기능 무해). ✓

### P6. 탭 추가 회귀 — ResourcePage 3번째 탭, Overview/Match 무회귀
- `ResourcePage.jsx:31-52`: TabList 3개(overview/match/allocation) ↔ TabPanel 3개 **순서 일치**(Atlaskit Tabs 인덱스 매칭). ✓
- Overview/Match 탭(`ResourceOverviewTab`/`ProjectMatchTab`) import·렌더 변경 없음 → 회귀 없음. AllocationTab만 추가. ✓

### P7. 백엔드 재사용 정합
- **`isProjectClosed` 중복 정의 없음**: `ResourceManagementService.js:23` `import { isProjectClosed as isProjectClosedByEndDate } from './ResourceMatch'`(순수함수, endDate 인자). 서비스 로컬 `isProjectClosed`(`:158`, status+name+date 복합 객체인자, v1 profile history용)와 **이름 충돌 회피 alias**. allocation은 `isProjectClosedByEndDate(row.end_date)`(`:365`) 사용 — 재사용 정확, 중복 신설 없음. ✓
- **조립 재사용**: `userMap`(bulk 1회, distinct accountId만 `:321-322`) / `getRoleListService`(res.data) / `getProjectStatusListService`(res.rows → statusName+color) / `getRollupMeta`(utilizationPeople util) / `classifyUtilBand` 전부 `Promise.all` 병렬(`:324-336`). ✓
- **INNER JOIN → 배정≥1 프로젝트만**(`FIND_ALL_ALLOCATIONS:144` `JOIN project`) — 무배정 프로젝트/인원 노드 없음. 프론트 empty 처리(`AllocationTab:62,81-84` `projects.length===0 || links.length===0`)와 기대 일치. ✓
- **성능**: 단일 SQL 1회(`:318`) + 병렬 조립 = **N+1 없음**. rollup KVS 1회 read(신규 워크로그 페치 없음). 공통 이슈/워크로그 페처 미수정(allocation 서비스는 fetchInProgress*/fetchAssigned* 미호출 — grep 확인). asApp 미사용(userMap 내부 기존 bulk). ✓

### P8. 권한/등록 — guardedDefine 1 ↔ PermissionMap 1
- 등록: `ResourceManagementController.js:24` `guardedDefine(resolver, 'getResourceAllocationGraph', ({payload}) => getResourceAllocationGraphService(payload))`.
- 맵: `PermissionMap.js:213` `getResourceAllocationGraph: R('RESOURCE_MANAGEMENT')`.
- `test/permission/permissionMap.contract.test.js` PASS → 등록집합 ↔ 맵키 정합(신규 1건 포함). deny-by-default 누락 없음. ✓
- 프론트 게이트: `useResourceAllocation:16` `canRead('RESOURCE_MANAGEMENT')`, 페이지 게이트(`ResourcePage:16-20`). 신규 쓰기 없음. ✓

### P9. i18n — 신규 키 전수 merge 반영
- t() 호출 키 ↔ 로케일 대조: `tab.allocation`, `allocation.{title,description,empty}`, `allocation.filter.{status,project,includeClosed,allStatus}`, `allocation.tooltip.{assigned,members,util,role}`, `allocation.legend.{project,member}`, 재사용 `util.none`/`band.*` — 소스(`kr/en/resource.json`) + merge 산출물(`ko-KR.json:1676-1698`·`en-US.json:1676-1698`) 전부 반영. 누락 0. ✓
- tooltip `.replace('{count}', ...)` 수동 치환(단일 플레이스홀더) 정상 동작. ✓
- `ko-KR.json`/`en-US.json` 직접 수정 아님(merge 재생성). ✓

### P10. 실행 검증
- 백엔드 `npx jest --roots ./src ./test`(worktree 노이즈 제외): **14 suites / 229 tests 통과**, 실패 0. permissionMap.contract 포함. ✓
- 프론트 `CI=true npm test`: **8 suites / 74 tests 통과**(회귀 없음). ✓
- 프론트 `CI=true npm run build`: **Compiled with warnings** — 경고는 사전존재 3rd-party source-map(`@atlaskit/analytics-next-stable-react-context`, `marklassian`)뿐. Module not found/allocation 신규 파일발 에러 0. ✓

---

## 미검증 (NOT VERIFIED) — 배포 후 E2E 필요

- **avatar `image://{avatarUrl}` 실제 CSP 로드**: `AllocationGraph.jsx:22-41` `new Image()` 프로브 → `onload` 성공분만 `avatarOkSet` 승격, `onerror`(CSP/404)면 circle 유지. **정적 로직 정합 확인**(초기 circle → 확인분만 아바타 승격이라 깨진 심볼 없음). Forge iframe CSP에서 Jira avatar CDN 실차단 여부는 코드로 확인 불가 → 코디네이터 지시대로 미검증. fallback(circle+memberColor+이름 라벨)은 항상 동작해 식별성 보장.
- **`userMap` bulk 실응답 / `getRollupMeta` util 실데이터**: 코드 경로·폴백(displayName=accountId, avatarUrl/util=null, `:325-334`)은 정합. 실 Jira/KVS 응답은 배포 환경 필요.

---

## 관찰 사항 (실패 아님, 정보성)

1. **`ResourcePage.jsx:12` 주석 stale**: "로컬 탭 2개"라 되어 있으나 실제 3탭. 코스메틱, 동작 무관.
2. **`statusOptions` '__none__' 라벨**: statusKey null 프로젝트의 옵션 라벨이 `allStatus`("전체 상태")로 폴백(`AllocationFilters:30`) — 다소 오해 소지이나 필터 동작(그룹핑 키 `__none__`)은 정확. 경계면 버그 아님.
3. **미참조 잉여 키**: `allocation.node.overload`, `allocation.filter.allProject`는 로케일에 정의됐으나 현재 코드 미참조(중복배정은 `(n)` 카운트로, allProject placeholder는 filter.project 사용). 무해한 잉여 키.
4. **드로어 fallbackPerson roleName/levelName 부재**: member엔 직무/등급 없어 헤더가 profile 로드 전 `-`/`-` 표기 후 채워짐(온디맨드). 의도된 지연, 무회귀.

---

## 종합 판정

**통과.** `getResourceAllocationGraph` 응답 shape 3배열이 생산자↔소비자 간 필드명·노드 id 매핑까지 완전 일치하며, 클라이언트 필터가 링크·멤버를 살아남은 프로젝트 기준으로 좁혀 **엣지 dangling이 원천 차단**됨. 중복배정 강조·결정적 엣지색·includeClosed 재조회·드로어 재사용·탭 추가가 모두 설계 §2~§4와 정합하고 Overview/Match 회귀 없음. 백엔드는 단일 SQL+병렬 조립(N+1 없음), rollup 1회 read, 공통 페처 미수정, asApp 미사용, `isProjectClosed` alias 재사용(중복 정의 없음), guardedDefine 1↔PermissionMap 1 정합(contract PASS). 재작업 지시 없음. 잔여는 avatar CSP·Jira/KVS 실데이터 E2E(미검증 2건)로만 확정 가능.
