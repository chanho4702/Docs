---
name: project-resource-management
description: "자원관리(Resource Management) 페이지 — 인력 부하(가동률)+스킬 매칭, 스킬 마스터 신설, 풀스택 구현+검증 완료"
metadata: 
  node_type: memory
  type: project
  originSessionId: 3025444e-ddd6-44ca-b8e7-fd3ade8d3641
  modified: 2026-07-28T09:08:10.085Z
---

자원관리 페이지(2026-07-08 풀스택 구현+통합검증 완료, E2E 미수행). `_workspace/resource-management/`. 목적: (1) 인력 실적 가동률(부하)로 신규 투입 가능여부 판단, (2) 인력 보유스킬 ↔ 프로젝트 요구스킬 매칭 적합도.

**4대 설계 결정**
- 스킬 데이터 = **스킬 마스터(KVS `skill` 엔티티, id/name/category/description)** + 사용자/프로젝트 매핑은 **SQL 테이블**(`user_skills`, `project_skills`, proficiency/weight 컬럼 예비). role/level 패턴 답습, 백오피스 `/backoffice/skill` 신설 + 8직군 프론트 퀵애드 프리셋(`skillPresets.js`).
- 부하 = **기존 실적 가동률 재사용**. `getRollupMeta().utilizationPeople[{accountId,util}]`(KVS `portfolioRollup:current`, 일배치 산출)을 1회 read만 — 신규 워크로그 페치·공통 페처 수정 0 ([[feedback-worklog-fetch-isolation]] 준수). util=null → utilBand 'unknown' → available=true.
- 매칭 = 프로젝트 요구스킬 자동, 커버리지 `|보유∩요구|/|요구|`, 랭킹 coverage↓→util↑. `ResourceMatch.js` 순수함수(computeCoverage/classifyUtilBand/rankCandidates).
- 페이지 = 자원현황 뷰 최상위 `/resource`(로컬 탭 Overview/Match), 스킬관리 백오피스.

**경계면 컨벤션(주의)**: CRUD·태그 set/get = `res.data`, 조립조회(getResourceOverview/getProjectSkillMatch) = `res.content`, getActiveProjects(재사용) = `res.rows`. resolver 12종.

**권한**: `RESOURCE_MANAGEMENT`(WORKFORCE), `SKILL_MANAGEMENT`(SETTINGS) 2키 + PermissionMap 12매핑, SEED_VERSION 6→7 ([[project-permission-hardening]]). 프로젝트삭제 cascade에 project_skills DELETE 추가 ([[project-forge-sql-no-fk-cascade]]).

**배포 필수**: manifest `skill` 엔티티 + SEED_VERSION 7 → `forge deploy` 안 하면 addSkill 422 ([[project-kvs-entity-manifest-schema]]). SQL v010/v011 마이그레이션 onInstall 멱등.

**조정**: @atlaskit/tag·lozenge 미설치 → 커스텀 SkillChip/StatusBadge로 대체.

## 2026-07-23 재편: [인력 현황 | 프로젝트 배정] 2탭 (resource-assignment-merge)

match(적합도)·allocation(배정현황) 탭을 폐지하고 **프로젝트 배정** 탭으로 통합. `_workspace/resource-assignment-merge/` (v2가 정본 — **v1 셀렉터형은 사용자가 거부**: "프로젝트 선택을 해서 나오는 메뉴는 안 됨", 진입 즉시 양쪽 정보가 보여야 함).

- **구조(v3.1, 2026-07-23 3단 개편)**: [좌 카드목록 | 중 ProjectDetailPanel(선택 시만, 미선택은 2단) | 우 전사 인원] — 세 칼럼 모두 **공용 `components/card/Card` 컴포넌트**(AssignmentPage/WorkQueuePanel과 동일 시각 언어, 제목+건수 헤더·headerRight 검색·sticky 필터 바). 커스텀 PANEL_FRAME 방식은 사용자가 "카드 개안보임"으로 거부. 카드 클릭 시 적합도·재정렬 → [배정] → 작업 선택 모달. **이미 배정된 인력(match.isMember)은 전사 인원에서 행 제외**(비활성 버튼 방식은 거부됨, filter는 ProjectAssignmentBoard rows useMemo — mergeMatch 무수정). roster는 bare 모드에서 flex:1로 칼럼 높이 전부 사용. **roster·전사 인원 렌더링은 `utils/useInfiniteSlice`(IntersectionObserver windowing, 20/30 step)** — CommonTable엔 스크롤 API 없어 windowing으로 구현.
- **카드 지표 = lazy hydrate 2단**: N1 `getAssignmentProjectCards`(SQL 즉시) + N2 `getAssignmentProjectMetrics`(Jira 배치, 프로젝트당 1500·배치 80·p-limit 4). **JQL count 배제 이유: coworker가 이슈 프로퍼티라 count로 미배정 판정 불가.** 지표는 `computeQueueFlags`+`normalizeIssue` import 재사용 — 카드 숫자와 배정 화면 목록이 규칙 단일 원천으로 항상 일치.
- **우측 조인** `mergeMatch.js`: 행 정체성·이름·가동률·부하=people 유래, `match.*`(score/signals/skills)=board·pool candidate 유래 — 필드 출처 표+테스트로 고정(ScopeSplitCell 재발 방지). 신호 프론트 재계산 금지.
- **낙관 패치** `patchProjectMetric`: 미배정수 감소는 **전이 판정**(before&&!after)만 — 담당자 있던 이슈에 협업자 추가 시 불변.
- **권한 OR 확장(기구현·유효)**: getActiveProjects/board=+RESOURCE_MANAGEMENT read, assign·**insertProjectusers**=+RESOURCE_MANAGEMENT **write**(read로 열면 버튼 보이는데 서버 거부). 게이트 미러링 필수. 배포 필요(forge deploy).
- **프로젝트 배정 폴백(v3.3)**: board.queue 0건이면 WorkPickerModal 대신 ConfirmModal→기존 `insertProjectusers` 재사용({project_id, jiraUser:[{value}]}). 멤버십은 SQL이라 board/pool invalidate 허용(Jira 인덱스 지연 규약과 별개). 카드 상태 pill은 공용 lozenge/StatusBadge 필수 — statusColor는 hex가 아니라 색상명이라 CSS 직접 사용 시 투명 버그.
- **배정 인원 명단(v3.4)**: board.projectLoad는 이슈 담당/협업자 집계라 이슈 없는 신규 멤버가 안 뜨는 함정 — roster는 `buildAssignedRoster(memberCandidates, projectLoad, people)` 합집합(멤버∪이슈참여자, isMember 플래그로 구분).
- **배정 취소(v3.5)**: 신규 resolver `removeProjectMemberByAccount({project_id, accountId})` — (project_id,accountId) 복합키 DELETE, 응답 `{success, removed}`(content 래핑 없음), 권한 OR(PROJECT/RESOURCE write)+inherited. 명단 행 canAssign&&isMember만 버튼 노출, 이슈 담당은 해제 안 됨(경고 문구).
- **이동**: 관계도(AllocationGraph)→인력 현황 하단 접이식, 요구 스킬 편집→ProjectModal 수정 폼(신규 등록은 저장 후 수정 — projectId 없어 2단계 커밋 회피). 스킬 저장 경로만 cards invalidate 허용(SQL이라 인덱스 지연 없음).
- 제거: ProjectMatchTab·CandidateRankTable·useProjectSkillMatch·AllocationTab (match/엔 RequiredSkillEditor만 잔존).
- 검증: 백 326 / 프론트 234 통과, 계약 위반 0. **주의: static/ui 테스트는 반드시 `npm test`(jest)로 — `react-scripts test`는 moduleNameMapper를 안 타 @forge/bridge 스위트가 오탐 실패.** E2E 미수행.

## 2026-07-28: 조직 현황 탭 신설 → [인력 현황 | 조직 현황 | 프로젝트 배정] 3탭

전사 조직 관점(팀 계층 + 인원·가동률). P3의 "프로젝트별 팀 분석"과 다름(그쪽은 프로젝트 내 기여). `pages/resource/organization/OrganizationTab.jsx`.

- **UI = `/backoffice/team` 과 같은 골격** (사용자 지시 2026-07-28 — v1 카드+테이블형은 "구리다"고 거부). 좌 트리 / 우 상세 2패널, `PANEL_HEIGHT='80vh'`
  - **`TeamTreePanel` 컴포넌트 + `buildTeamTree`/`flattenTree`/`filterTeamsByKeyword`/`collectParentIds` 를 그대로 재사용** — 롤업 노드를 `getTeamList.content.teams[]` shape 으로 매핑하는 변환 1개만 추가. 조직도가 화면마다 다르게 보이거나 접기·검색이 갈리지 않는다
  - ⚠ `buildTeamTree` 는 `teamKey` 없는 노드를 **버린다** → 팀 미소속은 `'__UNASSIGNED__'` 센티널 키 부여(안 하면 조직도에서 통째로 사라짐)
  - `cycleKeys`/`demotedKeys` 는 `getTeamList` 전용 진단값이라 `/resource` 엔 없다 → 빈 배열
  - 우측 = 요약 헤더(팀장·직속/누적·가중 가동률·부하 밴드) + 팀원 표(팀원/팀/직무/등급/가동률/스킬). **하위 팀 인원 기본 포함 + "직속만" 체크박스**(하위 팀 있을 때만 노출)
  - `SkillTags` 에 개수 제한 prop 없음 → 호출부에서 `.slice(0,3)`

- **새 resolver 0 · 새 조회 0** — `getResourceOverview`가 이미 `people[]`(팀·가동률·스킬)+`teamMeta[]`(계층)를 준다. **같은 쿼리 키를 공유**해 탭 전환 시 네트워크 없음. 백엔드는 3필드만 추가: `people[].investedMd/availMd`(rollup에 이미 있음), `teamMeta[].leaderAccountId`, `content.hasWeightedMetrics`
- **범위 = 전사** (사용자 결정 2026-07-28). `TEAM_ONLY`는 프로젝트 축이지 인원 축이 아니고, 인력현황 탭이 이미 전사 인원을 보여줌 → 조직도만 좁히면 같은 페이지에서 모순. 게이트는 `RESOURCE_MANAGEMENT` read 하나
- **`utils/team/rollupTeamTree.js`** (신규 순수함수, 테스트 30): `aggregateByTeam`(평면) 결과를 계층으로 접는다. 롤업 출처는 여전히 aggregateByTeam 하나
  - ⚠ **계층 가동률은 비율을 더할 수 없다** → `investedMd`/`availMd`를 sumFields로 두고 누적에서 Σ/Σ 재계산. 하위 팀 util의 산술평균은 작은 팀이 큰 팀을 흔든다
  - ⚠ **direct(직속) / total(누적) 분리 필수** — 안 하면 사용자가 표를 세로로 더해 보고 "합이 안 맞는다"고 판단
  - 사이클·고아·이름 모를 팀 방어(루트 승격, 던지지 않음) — P1 O4 전례
  - 팀 단위 가동률을 **밴드로 분류하지 않는다**(서버 `classifyUtilBand` 복제 회피) → 사람 단위 `utilBand` 분포를 센다
  - `descendantKeys(nodes, node)` — 우측 목록 모집단. 인라인이면 조용히 잘못된 모집단을 만든다
- **재무 축 없음** — `people[].salary`를 쓰지 않는다(쓰면 U12 인건비 게이트를 이 화면까지 확장해야 함)
- 🚨 **기존 노출면(이번 변경 아님)**: `getResourceOverview`는 `people[].salary`를 `RESOURCE_MANAGEMENT read`만으로 내려준다 — 인건비 게이트 없음. U12와 같은 계열, 미처리
