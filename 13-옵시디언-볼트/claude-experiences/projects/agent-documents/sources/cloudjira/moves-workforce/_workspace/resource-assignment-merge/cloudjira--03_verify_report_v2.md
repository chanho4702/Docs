# 자원관리 재편 v2 (resource-assignment-merge) — 통합 정합성 검증 리포트

- **일자**: 2026-07-23
- **브랜치**: RFC-160
- **검증자**: integration-verifier (v2 전면 재검증 — v1 결과 무효, 권한 OR 3건만 회귀 확인)
- **입력**: `requirement_v2.md` / `01_architect_design_v2.md`(계약) / `02_backend_report_v2.md` / `02_frontend_report_v2.md` + 실제 소스
- **결론**: **통합 계약 위반 0건.** N1/N2 shape·다중 shape 조인·flag 단일 원천·낙관 패치 전이 판정·권한 미러링·invalidate 경계 모두 정합. 백엔드 326/326, 신규 프론트 순수함수 21/21, 빌드 통과. 프론트 테스트 1개 무관 스위트 실패(RFC-169 환경성) — E 참조.

---

## 통과 (PASS)

### A. 경계면 교차 (N1/N2) — PASS

**N1 `getAssignmentProjectCards`** (생산: `AssignmentProjectService.js:61-101` ↔ 소비: `useAssignmentProjectCards.js` → `ProjectCard.jsx`)

| Card 필드 | 생산 (서비스) | 소비 (ProjectCard) | 판정 |
|---|---|---|---|
| projectId | `r.project_id`(uuid) | `card.projectId`(key·onSelect) | ✅ |
| projectName | `r.project_name ?? null` | `card.projectName ?? '-'` | ✅ |
| statusKey/statusName/statusColor | statusKey 있을 때만 KVS map 조회, 미매칭 null | `card.statusName &&`(null 가드), `card.statusColor \|\| neutral` | ✅ |
| startDate/endDate | `toYmd(...)` | `[startDate,endDate].filter(Boolean)` | ✅ |
| requiredSkills[{id,name}] | skill_id → `{id, name: skillNameMap.get(id) ?? id}`, 없으면 `[]` | `card.requiredSkills?.length && .map(s.name)` | ✅ 항상 배열 |

- `useAssignmentProjectCards` `res.content` 정확 unwrap + `res.success` 체크(:22). ✅

**N2 `getAssignmentProjectMetrics`** (생산: `AssignmentProjectService.js:108-134` ↔ 소비: `useAssignmentProjectMetrics.js`(metricMap) → `ProjectCard`/`ProjectCardList`)

| 필드 | 생산 | 소비 | 판정 |
|---|---|---|---|
| metrics[].projectId | `getActiveProjectsRepository` uuid | `metricMap.set(m.projectId)` → `metricMap.get(card.projectId)` | ✅ 조인 키 동일 체계 |
| unassignedCount/dueSoonCount/overdueCount | `aggregateOpenFlags` | `metricVal('unassignedCount'...)` | ✅ |
| Metric.truncated | 프로젝트당 1500 초과 | `metric?.truncated && *툴팁` | ✅ |
| meta.projectsTruncated | 활성 80 초과 | `meta?.projectsTruncated && SectionMessage` | ✅ |
| meta.dueSoonDays/generatedAt/projectsScanned | 서비스 조립 | (툴팁/참고) | ✅ |

- **조인 키 projectId(uuid) 정합**: N1 `r.project_id`, N2 `fetchAllProjectMetrics(rows.map(project_id))`, `SkillMappingQuery.SELECT_SKILLS_BY_PROJECTS` `BIN_TO_UUID(project_id)` — 셋 다 동일 uuid 문자열. Map 병합 성립. ✅
- **비차단 hydrate**: N1 먼저 렌더, `metricVal`가 metric null → `isMetricsPending? '-' : 0`(ProjectCard:45-48). 부분 성공(Jira 실패)=0으로 옴. ✅
- **board/pool/assign 무변경**: `useWorkAssignmentBoard/Pool/useAssignWorkItem/patchAssignmentCache` git diff **0**(reused, 무수정). `useAssignWorkItem`은 `res.content`(AssignResult) 반환(:43). 기존 소비 경로 회귀 없음. ✅

### B. 다중 shape 조인 (mergeMatch) — PASS (ScopeSplitCell 유형 정밀 점검)

`hydratePeople`가 **people(전사)** 와 **candidate(board/pool)** 두 shape을 조인. `CompanyResourceTable`이 읽는 **전 필드**를 유래별로 대조:

| 컬럼/필드 | 유래 shape | 읽는 코드 | 생산 확인 |
|---|---|---|---|
| accountId·avatarUrls·displayName·roleName·levelName·util·utilBand·skills | **people** | `p.X` (CompanyResourceTable:111-123, 69-71) | `useResourceOverview.people` — ✅ 존재 |
| todo/inProgress/done·spent/remaining·completionRate | **loadMap** | `load?.X` (:128-135) | `useResourceLoadSummary`, accountId 조인 — ✅ |
| isMember | **candidate** | `match.isMember`(:58) | `toMatchInfo: c?.isMember === true`, `EMPTY_MATCH.isMember=false` — ✅ |
| matchedSkills·missingSkills | **candidate** | `match.matchedSkills/.missingSkills`(:62-65) | `toMatchInfo` 배열 보장 — ✅ |
| score·matchedCount·requiredCount | **candidate** | `match.score/.matchedCount/.requiredCount`(:75-83) | `toMatchInfo` — ✅ |
| signals | **candidate** | `match.signals`(:89) | `toMatchInfo: c.signals 그대로`(재계산 0) — ✅ |
| company | **candidate** | `match.company`(:89) | `toMatchInfo: c?.company ?? null` — ✅ |

- **오표기 0**: people 필드는 전부 `p.X`, match 필드는 전부 `p.match.X`로 읽어 shape 교차 없음. 읽는 8개 match 필드가 **모두** `MatchInfo`(toMatchInfo)와 `EMPTY_MATCH` 양쪽에 실재 → 옵셔널 체이닝이 삼키는 조용한 오값 없음.
- **board vs pool candidate 차이**: `toMatchInfo`가 양쪽에서 동일 서브셋만 추출. pool 후보의 `project.*`(전부 0/null)는 **`toMatchInfo`가 애초에 읽지 않으므로** 조인 후 오값 불가. board 멤버(isMember true) ⋈ pool 비멤버(isMember false), 겹치면 board 우선(`buildMatchMap`가 pool 먼저·board 덮어씀 :53-59). ✅
- **신호 재계산 금지**: `sortHydratedRows`는 표시 순서만(score desc→util asc→name), signals/coverage 불변. `GapSignalBadge`는 렌더 전용. ✅
- **셸 배선 정합**: `ProjectAssignmentBoard:66` `buildMatchMap(board.board, {candidates: pool.candidates})` — `useWorkAssignmentBoard`가 `board: data`(content, `.candidates` 보유)를 반환(:37)하므로 **멤버 후보 조인 유실 없음**(board.board.candidates 읽힘). ✅

### C. flag 규칙 단일 원천 — PASS
- `AssignmentMetricsFetcher.js:20-21`이 `normalizeIssue`+`computeQueueFlags`를 **import 재사용**(복제 0).
- **판정 입력이 board 경로와 동일**: 카드 경로 `aggregateOpenFlags`는 `computeQueueFlags({assignee:n.assigneeRef, coworkers:n.coworkerAccountIds, dueDate, estimates})`(:51-60). board 경로 `toQueueItem`은 `computeQueueFlags({assignee:n.assigneeRef, coworkers:(객체배열), ...})`(IssueFetcher:159-166). `computeQueueFlags:66-67`은 `coworkers.length`만 보므로 **문자열배열/객체배열이 UNASSIGNED 판정에 동치** → 이원화 없음. ✅
- **coworker 프로퍼티 실제 페치**: fetcher가 `properties:[MOVES_PROPERTY_KEY]` 요청(:101) → `normalizeIssue`가 coworkers 읽음(:97). 프로퍼티 누락 시 전부 오탐 UNASSIGNED 될 위험을 회피. ✅
- **fieldsByKeys 함정 회피**: fields=`[status,statusCategory,duedate,assignee]` — 앱 커스텀필드 없음, 스코프는 JQL 술어 `moves_RMS_projectId = "<uuid>"`. ✅
- **공통 페처 무수정**: `AssignmentMetricsFetcher.js` 신규 격리. 기존 페처(ResourceLoad/WorkAssignmentIssue/Gantt/Bulk/ByUser) 무접촉. ✅

### D. 낙관 패치 정합 (patchProjectMetric) — PASS (전이 판정 핵심)
- `unassignedDelta`(patchProjectMetric.js:36-42)는 **전이**로 판정: `before && !after → -1`, `!before && after → +1`, else `0`.
- **요청 핵심 케이스 — "이미 담당자 있던 이슈의 협업자 추가"**: previous에 assignee 있음 → `wasUnassigned=false`(before=false), item에 assignee 유지 → `isUnassignedNow=false`(after=false) → **delta 0, unassignedCount 불변**. ✅ 정확.
- 진짜 미배정 → 배정: before=true, after=false → -1 ✅. 담당 해제: before=false, after=true → +1 ✅.
- **판정 근거 필드**: `previous.flags` 우선, 없으면 `previous.{assigneeAccountId, coworkerAccountIds}`(둘 다 `toPrevious`에 존재), `item.flags` 우선(`toQueueItem`에 존재) — AssignResult 실 shape과 일치. `useAssignWorkItem`이 `res.content`(AssignResult) 반환 → `patchProjectMetric(result.item/previous)` 정합.
- **패치 경로**: `WorkPickerModal:63-64` `setQueryData(projectMetrics, patchProjectMetric)` — invalidate 아님. `Math.max(0, ...)` 하한 방어. 변화 없으면 원본 참조 유지(리렌더 억제). ✅

### E. 기존 항목 — 부분 PASS

**권한** — PASS
| 대상 | 서버 grant | 프론트 게이트 | 판정 |
|---|---|---|---|
| N1/N2 조회 | `getAssignmentProjectCards/Metrics` OR[PROJECT r, RESOURCE_MANAGEMENT r] `list`(PermissionMap:243-244) | 진입 `canRead('RESOURCE_MANAGEMENT')`(ResourcePage:15) → 서버 OR 통과 | ✅ |
| 배정 실행 | `assignWorkItem` OR[PROJECT w, RESOURCE_MANAGEMENT **w**](기구현·유지) | `canAssign = canWriteProject \|\| canWriteResource`(Board:38) → CompanyResourceTable 버튼 | ✅ write 미러링 |
| 요구스킬 편집 | `setProjectSkills` W PROJECT | `canWrite('PROJECT')`(RequiredSkillEditor) | ✅ |
- guardedDefine 2건 `WorkAssignmentController:30-34`(`({principal})=>svc(principal)`), `src/index.js` 무변경(기존 register 안). 계약 테스트 1건 추가. **프로젝트 상세 회귀 없음**: v2는 AssignmentPage를 렌더하지 않고 board/pool/assign 훅·순수함수만 import 재사용(무수정). ✅

**invalidate 경계** — PASS
- assign 경로 `invalidateQueries` **0건**: `useAssignWorkItem`(setQueryData board 패치) + `WorkPickerModal`(setQueryData projectMetrics 낙관 패치)뿐. `assignmentKeys.cards/projectMetrics` 팩토리(assignmentKeys.js:16-17), `refetchOnWindowFocus:false`(N2, useAssignmentProjectMetrics:31).
- 스킬 저장 경로만 invalidate: `RequiredSkillEditor`가 `resourceKeys.projectSkills/projectMatch` invalidate(SQL write, 인덱스 지연 없음 — 안전). v2 ProjectModal은 `onSaved` 미전달(카드는 N1 자연 반영). ✅

**제거/이동** — PASS
- v1 `ProjectAssignmentTab.jsx` **파일 부재 확인**(디스크 삭제), 전역 grep 참조 **0**.
- `AllocationGraph`/`allocationGraphOption`/`useResourceAllocation`/`AllocationFilters` → 인력 현황 탭 하단 `AllocationGraphSection`(온디맨드 마운트, `graphOpen`)로 이동. `ResourceOverviewTab:150-156` 토글(`resource.allocation.section`) + 드로어 연결. **배정 탭엔 관계도 없음**(요구 준수).
- `AllocationFilters.jsx` git 복원 확인(존재), `AllocationTab.jsx` 삭제(D), `match/`는 RequiredSkillEditor 1파일만.
- 재사용 파일 git diff **0**(AllocationGraph/option/useResourceAllocation/board·pool·assign 훅/patchAssignmentCache). ✅

**실행** — 부분 PASS
| 항목 | 결과 | 판정 |
|---|---|---|
| 루트 `npm test` | **17 suites / 326 tests 통과**(신규 `AssignmentMetricsFetcher.test.js` 11 + 권한 계약 1) — 326 기준 일치 | ✅ |
| static/ui `npm test` | 18 passed / **1 failed suite** / 19 total, **215 passed** | ⚠️ 아래 |
| 신규 v2 순수함수 스위트 | `mergeMatch.test.js`+`patchProjectMetric.test.js` = **2 suites / 21 tests 통과** | ✅ |
| `npm run build` | **Compiled with warnings** — node_modules 소스맵 + merge.js module-type 경고뿐, **신규 코드 경고 0, dangling import 0**, prebuild merge 실행 | ✅ |
| i18n kr/en 대칭 | resource.json **113키 완전 대칭**(kr==en), project.json `modal.requiredSkills` 양쪽, merge → ko-KR/en-US 반영 확인 | ✅ |
| 사용 키 전수 | assignment.projects/card/people/col/picker/external·allocation.section/empty/filter — 코드 사용 키 전부 존재 | ✅ |

**프론트 1개 스위트 실패 — 본 기능 무관(환경성)**: `static/ui/src/pages/projectDetail/issue/workListQuery.test.js` → *Unable to establish a connection with the Custom UI bridge*. `@forge/bridge` 미mock, 커밋 `073ac74 #RFC-169` 소속으로 resource-assignment-merge 변경 집합 밖. **회귀 아님**(v1 검증에서도 동일 실패 관측). 다만 **02_frontend_report_v2 의 "234 tests 통과" 주장과 실제 215 통과는 불일치**(그 스위트 ~19 테스트가 로드 실패로 미실행). 기록 위해 명시.

---

## 미검증 (E2E — 배포 후 실환경 필요)

1. **관계도 조인 키 실데이터** — `useResourceAllocation`의 projects[].projectId/links[].projectId(uuid) ↔ 인력 현황 관계도. (v2에선 배정 탭 아닌 인력 현황 탭. 코드 정합이나 실데이터 1회 확인.)
2. **N2 지표 정확도** — 카드 미배정/임박/지연 수가 선택 프로젝트 board.queue 카운트와 일치(flag 단일 원천이므로 이론상 일치, 실 Jira 데이터로 확인).
3. **부분 성공/상한** — 프로젝트별 Jira 실패 시 0 표기, MAX_OPEN_ISSUES(1500)/MAX_ACTIVE_PROJECTS(80) 초과 시 truncated 표기.
4. **낙관 패치 실동작** — 배정 성공 시 좌측 카드 미배정 수 즉시 -1, 협업자 추가는 불변, staleTime 후 서버값 정합.
5. **RESOURCE read-only vs write** — read만: 카드/지표/테이블 표시·[배정] 비활성(툴팁), write: 배정 성공.
6. **MEMBER_ONLY scope** — N1/N2가 `scopedProjectIds`로 소속 프로젝트만 카드/지표 표기.

### E2E 체크리스트 (v2 관점)
- [ ] RESOURCE_MANAGEMENT read only 계정: `/resource` → [프로젝트 배정] 진입 즉시 **좌 카드 목록 + 우 전사 인력 테이블 동시 표시**(빈 화면 없음), 지표는 배경 hydrate 후 채워짐(그 전 '-')
- [ ] 위 계정: 우측 [배정] 버튼 비활성 + `selectPrompt`/`noWritePermission` 툴팁
- [ ] 프로젝트 카드 클릭 → 우측 테이블 적합도(fit)·신호(signal) 컬럼 활성 + score desc 재정렬, 카드 하이라이트
- [ ] RESOURCE_MANAGEMENT write 계정: 인원 [배정] → WorkPickerModal(board.queue, 미배정 우선) → 작업 선택 → [담당자 지정]/[협업자 추가] → 확인 → 성공, 좌측 카드 미배정 -1
- [ ] 이미 담당자 있는 이슈에 협업자 추가 → 카드 미배정 수 **불변**
- [ ] 비멤버(외부) 인원 배정 시 `warn.notMember` 경고, "외부" 칩 표기
- [ ] 프로젝트 수정 모달(ProjectModal editId): 요구 스킬 편집 섹션 노출·저장, 신규 등록 모달엔 미노출
- [ ] 인력 현황 탭 하단 `배정 관계도` 토글 → 그래프 렌더, 노드 클릭 → 드로어. 배정 탭엔 관계도 없음
- [ ] 프로젝트 상세 작업 배정 탭(AssignmentPage) 정상 동작(회귀 없음)
- [ ] 한/영 전환 시 카드 지표 라벨·컬럼·모달 문구 정상

---

## 사소 관찰 (수정 불요)
- `RequiredSkillEditor.jsx:51` 인라인 주석 "통합 탭: board invalidate"는 v1 잔재(docblock 상단은 정정됨). `onSaved`는 옵셔널·하위호환, ProjectModal 미전달 → no-op. **실패 아님.**
- 설계 §3 문서가 테이블명을 `skill_mapping`으로 적었으나 **실제 코드는 올바른 기존 테이블 `project_skills` 사용**(SkillMappingQuery:46-50, setProjectSkills와 동일). 문서 노이즈, 코드 정상. **실패 아님.**
- 프로젝트 선택 시 board+pool 어디에도 없는 전사 인원은 `EMPTY_MATCH`(isMember:false) → "외부" 칩 + fit '-'. 비멤버 표기라 의미상 타당, 조용한 오값 아님. **실패 아님.**
- N2는 탭 로드 시 활성 프로젝트 전량 배경 스캔(선택 무관)이나 MAX_ACTIVE_PROJECTS=80·p-limit(4)·열린이슈만으로 상한. 설계 의도된 lazy hydrate. **실패 아님.**

---

## 종합
- **통합 계약 위반 0건.** N1/N2 shape·조인 키(projectId uuid)·다중 shape 조인(people⋈candidate, 오표기 0)·flag 단일 원천(computeQueueFlags 재사용, coworker 프로퍼티 포함)·낙관 패치 전이 판정(협업자 추가 불변)·권한 write 미러링·invalidate 경계·제거/이동 전부 정합.
- **backend/frontend 재작업 불요.** E의 프론트 테스트 실패는 본 기능 무관(RFC-169 환경성) — 02_frontend_report_v2의 234 통과 주장과 실제 215 통과는 기록상 불일치로 남긴다.
- 잔여는 E2E(실권한·실 Jira 데이터) 6건.

---

# §증분 검증 — 사용자 피드백 개편 (2026-07-23, incremental)

- **범위**: v2 기반검증(위) 통과분은 회귀 확인만, 신규 변경분(N1 전체확장+isClosed+category, N2 열린프로젝트만, isProjectClosed 위임 리팩터, projectCardFilter/ProjectFilterBar/카드리디자인/ProjectDetailPanel+buildAssignedRoster/skillGroups/theme) 집중.
- **결론**: **신규 변경분 계약 위반 0건.** isClosed/category 경계·위임 리팩터 behavior 무변경·buildAssignedRoster 다중 shape·디폴트 필터식 타임존 전부 정합. 백엔드 331/331, 프론트 assignment 7스위트/102 통과, 빌드 통과.

## 통과 (PASS)

### 1. 경계면 — `isClosed`/`category` 생산↔소비 + N2 열린프로젝트 한정 — PASS

| 경계면 | 생산 (백엔드) | 소비 (프론트) | 판정 |
|---|---|---|---|
| `Card.isClosed` | `isTerminalStatus({statusKey, statusName})` **status-only**(AssignmentProjectService:94) | `ProjectCard:55` `card.isClosed===true` → dimmed(opacity .6)+종료 배지. 일정오버는 `isOverdue`로 **별도** 판정 | ✅ 두 조건 독립 |
| `Card.requiredSkills[].category` | `skillMetaMap`(KVS `{name,category}`), 미해석 `''`(:76,84) | `SkillGroupChips`→`groupSkillsByCategory`(''→'기타' 그룹) | ✅ 항상 string |
| **N2 닫힌 프로젝트 제외** | `rows.filter(!isTerminalStatus(...))`(:125-132) → 최종상태 프로젝트 metric 미생성 | `ProjectCard:70` `metricPending = !metric && (isMetricsPending \|\| closed)` → **닫힌 카드 지표 '-'** | ✅ 경계 정확 일치 |
| `meta.projectsScanned` | 열린 프로젝트 수만 카운트(fetchAllProjectMetrics targets) | 목록 안내 | ✅ |

- **핵심 정합**: N2가 최종상태 프로젝트를 안 도므로 그 카드엔 Metric이 영영 안 온다 → 프론트가 `closed`를 `metricPending`에 포함시켜 **'0'이 아닌 '-'** 로 표기. 로딩실패와 구분되는 정상 표기. ✅
- **비-닫힘·부분성공(Jira 실패)**: metric은 `{...0}`로 옴 → `metric` 존재 → 실제 0 표기(‑ 아님). 백엔드 부분성공 계약과 일치. ✅
- **일정오버지만 비-최종상태 프로젝트**: N2 포함(:124 주석) → 지표 정상. `ProjectCard`는 `over && !closed`로 오버 배지. ✅

### 2. `isProjectClosed` 위임 리팩터 — 내부 소비자 회귀 없음 — PASS

- **behavior 무변경 확인**(git diff): `isTerminalStatus`가 기존 두 status if-검사(`TERMINAL_STATUS_KEYS.has` + `TERMINAL_NAME_RE.test`)를 **축자 추출**, `isProjectClosed`는 `isTerminalStatus(...) \|\| (endYmd && endYmd<todayYmd)`로 동일 로직. 라인 재배열뿐 판정 불변.
- **내부 소비자 전수 grep**:
  - `ResourceManagementService.js:242` `closed: isProjectClosed({statusKey,statusName,endDate}, todayYmd)` — 로컬 함수, 시그니처·동작 불변 ✅ (resource-allocation `getResourceAllocationGraphService` 경로)
  - `ResourceManagementService.js:374` `isProjectClosedByEndDate(row.end_date)` = `ResourceMatch.isProjectClosed`(별칭, **무변경**, 자체 테스트 8건 그대로) — 리팩터와 무관 ✅
  - 신규 외부 소비자: `AssignmentProjectService`가 `isTerminalStatus` import(N1 isClosed·N2 필터) ✅
- 신규 테스트 `isTerminalStatus.test.js` 5건(키/한영 이름/진행/무값/endDate 무시)으로 status-only 판정 고정. 기존 `ResourceMatch.test.js`·자원관리 회귀 0.

### 3. `buildAssignedRoster` 다중 shape 조인 — PASS (ScopeSplitCell 유형 정밀)

| RosterRow 필드 | 유래 shape | 읽는 코드 | 생산 확인 |
|---|---|---|---|
| displayName·avatarUrls·roleName·levelName | **people** | `p?.X`(buildAssignedRoster:28-31), 미조인 시 accountId/null 폴백 | `useResourceOverview.people` — ✅ |
| assignedCount·todoCount·inProgressCount·doneCount·spentSeconds·remainingSeconds·completionRate | **projectLoad** | `r.X`(:33-39) | `aggregateProjectLoad`(WorkAssignmentIssueFetcher:210-256) **정확히 이 8필드 생산** — ✅ |

- **오독 0**: people 필드는 `p`에서만, load 필드는 `r`에서만. ProjectLoadRow는 이름/아바타 없음(accountId뿐) → people 조인으로 채움. 교차 읽기 없음.
- **소비처 `ProjectDetailPanel`**: `r.avatarUrls['24x24']/displayName/roleName/levelName`(people), `r.todoCount/.../completionRate`(load) — 전부 RosterRow에 실재. `buildTaskSummary`는 metric(N2) 우선, 미도착 시 `queue.flags` 폴백(닫힌/미도착 프로젝트도 board.queue로 요약 가능). ✅
- 정렬 assignedCount desc→이름. 수치 재계산 없음(projectLoad 값 그대로). ✅

### 4. 디폴트 필터식 `!isClosed && !(endDate<today)` — PASS (endDate null·타임존)

- `isLiveCard = !card.isClosed && !isOverdue(card, today)`(projectCardFilter:39-40).
- `isOverdue = !!card?.endDate && card.endDate < today`(:19-20) — **endDate null/빈값 → false**(오버 아님) 안전 처리. ✅
- **타임존 함정 없음**: `todayYmd()`는 로컬 `getFullYear/Month/Date`로 'yyyy-MM-dd' 생성, `card.endDate`도 'yyyy-MM-dd'(백엔드 `toYmd` substring). **날짜-온리 문자열의 사전식 비교**라 Date 파싱·UTC 변환 없음 → tz drift 불가(ISO yyyy-MM-dd는 사전식=연대순). ✅
- `dDayOf`는 endDate·today 둘 다 `Date.UTC(y,m-1,d)`로 파싱해 일수차 → 양변 동일 UTC 기준, tz 흔들림 없음(:26-36). ✅
- `filterProjectCards`: includeInactive=false 디폴트→live만, statusKeys 멀티, search 부분일치(trim·lowercase). deriveStatusOptions distinct+라벨정렬. ✅

### 5. 실행 + 무변경 회귀 — 부분 PASS

| 항목 | 결과 | 판정 |
|---|---|---|
| 루트 `npm test` | **18 suites / 331 tests 통과**(신규 `isTerminalStatus.test.js` 5) — 331 기준 일치 | ✅ |
| static/ui `npm test` | 19 passed / **1 failed suite**(무관) / 20 total, **229 passed** | ⚠️ 아래 |
| assignment 스위트(신규 순수함수 포함) | **7 suites / 102 tests 통과**(`projectDesign.test.js`가 buildAssignedRoster·projectCardFilter·skillGroups 커버, mergeMatch·patchProjectMetric 회귀 0) | ✅ |
| `npm run build` | **Compiled with warnings** — node_modules 소스맵뿐, `Failed to compile`/`Module not found`/`Attempted import error` **0**(theme.js tealFill/Border/Tint 등 named export 정상 해석) | ✅ |
| i18n kr/en 대칭 | resource.json **126키 완전 대칭**(kr==en), 신규 사용 키 **29개 전수 존재**(card.dday*/*Label, detail.*, filter.*, skill.uncategorized), merge → ko-KR/en-US 반영 | ✅ |
| **invalidate 경계 무변경** | `assignment/` 전역 `invalidateQueries` **0건**(grep) — assign 패치(setQueryData)만 유지 | ✅ |
| board/pool/assign 훅·캐시패치 | git diff 0(무수정 재사용), matchMap/hydratePeople/sortHydratedRows 무변경 | ✅ |

**프론트 1개 스위트 실패 — 본 기능 무관(기저 검증과 동일)**: `projectDetail/issue/workListQuery.test.js`(`@forge/bridge` 미mock, RFC-169). resource-assignment-merge 변경 밖. **02_frontend_report_v2 갱신본의 248 통과 주장 vs 실제 229 통과**(그 스위트 19건 미실행)는 기저 검증(215 vs 234)과 동일 원인의 불일치 — 기록 위해 재명시.

## 미검증 (E2E — 배포 후)
1. **전체 프로젝트 카드 표시** — 종료·일정오버 프로젝트가 "포함" 토글 시 나타나고 디폴트 뷰에서 숨는지(실 프로젝트 데이터).
2. **닫힌 카드 지표 '-'** — 최종상태 프로젝트 카드가 N2 배치에서 빠져 지표 자리 '-'(0 아님)로 뜨는지.
3. **isTerminalStatus 실 status 매칭** — 운영 project_status_key/이름이 `status-done`/종료계열 정규식에 정확히 걸리는지(커스텀 상태명 다양성).
4. **ProjectDetailPanel roster** — projectLoad⋈people 조인이 실 배정 인원·부하로 정확히 뜨는지, 닫힌 프로젝트 선택 시 queue 폴백 요약.
5. **디폴트 필터 로컬 today** — 브라우저 타임존별 오늘 경계에서 일정오버 판정.

### E2E 체크리스트 (증분)
- [ ] 진입 시 좌측 카드 = 디폴트로 살아있는(비종료·비오버) 프로젝트만, "종료/일정오버 포함" 토글 → 전량(종료=dimmed+배지, 오버=red 기간+배지)
- [ ] 상태 멀티필터·이름 검색 동작, 필터로 선택 프로젝트 사라지면 상세패널 닫힘
- [ ] 종료 프로젝트 카드 지표 3종 '-'(로딩 아님), 비종료는 실제 수치(0 포함)
- [ ] 카드 요구스킬이 직군(category) 그룹으로 묶여 표기, 미분류는 '기타'
- [ ] 프로젝트 선택 → 좌측 하단 상세패널(작업요약 타일 + 배정 인원 명단 아바타/직무/부하/완수율바)
- [ ] 배정 후 좌측 카드 미배정 -1(낙관 패치) + 상세패널 요약 반영
- [ ] 틸 테마(선택 보더/틴트, 완수율바) 적용
