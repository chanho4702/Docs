# Moves Workforce 로직 비대화·중복·효율 감사

검사일: 2026-08-05  
교차검증일: 2026-08-05 (전 항목을 실물 코드·실행으로 재확인, 아래 "교차검증 정정" 참조)  
범위: `src/`, `static/ui/src/`, resolver↔frontend 경계, query key, i18n, 테스트, production build  
원칙: 큰 파일 자체보다 책임 수, 변경 이유가 같은 코드의 복제, 외부 호출 횟수, 경계 계약을 우선 판단했다.

## 결론

현재 프로젝트는 기능 수에 비례해 커진 부분도 있지만, **실제로 줄여야 할 중복과 비대한 조정 컴포넌트가 존재한다.**
우선순위는 다음과 같다.

1. 다건 worklog rollback의 실패 미확인과 허위 완료 안내 수정
2. 실패 중인 query-key 계약 복구
3. 브라우저 debug log 제거
4. Level/Role/Skill quick-add 통합(backend 우선)
5. Gantt/Worklog/Assignment의 UI와 orchestration 분리
6. Jira pagination helper 통합(nextPageToken 계열 우선)
7. 사용되지 않는 dashboard bulk 경로와 의존성 정리

전체를 한 번에 재작성하는 방식은 권하지 않는다. 아래 P0/P1부터 characterization test를 추가한 뒤 점진적으로 옮기는 편이 안전하다.

### 교차검증 정정 요약

| 항목 | 초판 서술 | 정정 |
|---|---|---|
| F-01 | "업무 데이터를 노출한다" | 원격 전송 없음(Sentry는 error만). 본인 브라우저 한정 위생 문제 → **P0에서 P1로 강등** |
| F-05 | 순차 호출·rollback 미완료 가능성 | rollback의 삭제 실패를 확인하지 않아 **허위 완료 안내**가 나가는 별도 결함 발견 → **P0 신설** |
| F-06 | "6곳 복제" | 진짜 클론은 3벌+2벌, 나머지 1건은 변형. 전용 페처 격리는 저장소의 명시 정책 |
| F-09 | NaN으로 bucket 접근 실패 | 조용한 오작동이 아니라 TypeError → 위젯 요청이 `{success:false}`로 실패 |
| F-10 | 같은 key에 stale 정책이 갈린다 | staleTime은 observer별 옵션, 캐시는 공유 → 화면 간 값 불일치 불가. **무해, P3 강등** |
| F-11 | "이미 미세하게 갈라졌다" | 차이는 frontend의 null guard 1줄뿐, 계산 결과 차이 0 |
| F-12 | budget이 splitting 제거 전제·1.85MB | **사실 오류.** 커밋 `7a2d381`·`36edce3`으로 이미 950,000B·splitting 유지 기준·warning 전용으로 갱신됨 |

## 실패

### F-00 · P0 · 다건 worklog rollback이 실패를 확인하지 않고 "모두 취소됨"으로 안내한다

- `static/ui/src/pages/myWork/modal/WorklogModal.jsx:312-314` — rollback의 `deleteWorklog` 호출은 `ensureWorklogResult`로 감싸지 않는다.
- 같은 파일 `:33` 주석대로 `executeRequest`는 실패 시 throw 대신 `{ success: false }`를 반환한다. 따라서 삭제가 실패해도 `Promise.all`은 정상 resolve된다.
- `:251`은 이 경우에도 "등록된 항목은 모두 취소되었습니다"를 출력한다.

등록을 실패시킨 원인(네트워크 단절, 권한 회수)이 곧 삭제도 실패시키는 원인이므로, **정확히 문제가 발생한 상황에서만 허위 안내가 나간다.** 사용자는 부분 등록된 worklog가 남아 있는 것을 모른 채 재시도해 중복 등록으로 이어질 수 있다.

수정: rollback 결과를 개별 확인하고, 삭제에 실패한 worklog id를 메시지에 포함해 수동 정리 대상으로 안내한다. 성공 여부에 따라 문구를 분기한다.

### F-01 · P1 · production debug log가 브라우저 console에 입력·응답을 남긴다

- `static/ui/src/pages/myWork/modal/WorklogModal.jsx:109` — markdown이 바뀔 때마다 전체 내용을 `console.log`한다. 사용자 입력 매 키 입력마다 실행되며 워크로그 설명이 브라우저 로그에 남는다.
- `static/ui/src/pages/projectDetail/gantt/GanttChart.jsx:843` — 모든 drag payload를 출력한다.
- `static/ui/src/pages/myWork/WorklogPage.jsx:268` — worklog event 객체 전체를 출력한다.
- `static/ui/src/pages/projectDetail/issue/IssueAddModal.jsx:127`, `:139` — resolver 결과를 출력한다.

위 5건은 frontend에 남아 있는 활성 `console.log`의 **전량**이다(주석 처리된 1건 제외). CRA 기본값상 `drop_console`이 없어 production 번들에도 그대로 남는다.

영향 범위: `GanttChart.jsx:842` 주석이 명시하듯 Sentry는 error만 전송하므로 **이 log는 외부로 전송되지 않는다.** 사용자 본인의 devtools에서만 보이는 위생 문제이며, 데이터 유출로 분류하지 않는다.

수정: production log를 제거한다. 운영 진단이 꼭 필요하면 payload를 싣지 않는 공용 logger를 두고 development 환경에서만 활성화한다.

### F-02 · P1 · query-key factory 계약 테스트가 실패한다

- `static/ui/src/pages/projectDetail/issue/subscription/IssueTypeFilter.jsx:27`
- `static/ui/src/pages/projectDetail/issue/subscription/useIssueOwnership.js:36`

두 위치가 `subscriptionKeys.scope()` 뒤에 배열을 인라인 확장한다. 의미상 키 prefix는 맞지만 저장소의 runtime inline array 금지 계약을 깨고 있다.

수정: `static/ui/src/utils/queryKey/projectKeys.js:114`에 다음 factory를 추가하고 소비처가 사용하도록 한다.

- `subscriptionKeys.issueTypes(projectId, sourceType, sourceId)`
- `subscriptionKeys.ownership(projectId, signature)`

검증: frontend 65 suites 중 1 suite 실패, 1,087 tests 중 1개 실패. 나머지 1,086개는 통과했다.

### F-03 · P1 · Level/Role/Skill quick-add가 프론트와 백엔드에 각각 3벌 존재한다

Frontend Hook:

- `static/ui/src/backoffice/page/level/modal/quickAdd/useLevelQuickAddModal.js:9`
- `static/ui/src/backoffice/page/role/modal/quickAdd/useRoleQuickAddModal.js:9`
- `static/ui/src/backoffice/page/skill/modal/quickAdd/useSkillQuickAddModal.js:9`

세 Hook은 조회, 선택 Set, 전체 선택, mutation, toast, invalidate 흐름이 거의 같다. Modal의 `ItemRow`와 선택 UI도 세 벌이다.

Backend:

- `src/resolver/backoffice/level/LevelService.js:165`
- `src/resolver/backoffice/role/RoleService.js:108`
- `src/resolver/backoffice/skill/SkillService.js:131`

세 bulk-add는 `findAll → existingNames → 순차 save → added/skipped`가 같다.

수정: 거대한 범용 catalog framework를 만들지는 말고, 아래 두 개만 추출한다.

- backend: `addCatalogItemsBulk({ entity, prefix, items, buildRecord })` — 주입 인자 3개, 28~32줄짜리 함수 3벌을 대체한다. **손익이 확실하므로 먼저 한다.**
- frontend: `usePresetQuickAdd({ presets, listKey, listFn, bulkFn, toItem, i18nPrefix })` + `PresetQuickAddModal` — 주입 인자 6개.

Level과 Role은 상수·query key·invoke 이름·i18n prefix만 다른 사실상 동일 코드이고, Skill만 item shape에 `category`가 추가되는 실질 분기가 있다.

frontend 3벌은 각 121~128줄이고 변경 빈도가 낮다. 인자 6개는 추상화 손익분기 언저리이므로, **4번째 도메인이 생기는 시점에 통합해도 늦지 않다.** backend만 먼저 정리하고 frontend는 보류하는 선택이 합리적이다.

### F-04 · P1 · `GanttChart`가 imperative adapter, UI, 편집 상태, overlay를 모두 소유한다

- 파일: `static/ui/src/pages/projectDetail/gantt/GanttChart.jsx`
- 파일 1,313줄, `GanttChart` 함수 1,092줄
- 함수 내부 기준: `useState` 7개, effect 5개, memo 4개, callback 20개, 분기 83개
- `:255-296`에서 최신 callback을 유지하기 위한 ref mirror가 반복된다.
- `:298-350`에서 네 종류 editor 상태와 open/close/submit이 반복된다.
- `:764` 이후 SVAR intercept와 `:991` 이후 DOM overlay 계산이 같은 컴포넌트에 섞인다.

수정 순서:

1. `useLatestRef`로 callback mirror 반복을 줄인다.
2. `useSvarGanttBridge`에 init/intercept를 이동한다.
3. `useGanttMarkerOverlay`에 DOM 측정과 overlay state를 이동한다.
4. editor 네 종류는 `GanttEditors` 또는 단일 discriminated editor state로 이동한다.

SVAR의 imperative API 자체는 복잡할 수밖에 있으므로, 비즈니스 로직까지 범용 Gantt abstraction으로 감싸는 것은 피한다.

분리 형태 주의: 네 조각이 공유하는 상태는 `hostRef`·`apiRef`·`openStateRef` 세 개의 ref뿐이므로 **Hook으로 추출하면** prop drilling이 늘지 않는다. 반면 editor를 **component로** 빼면 open 함수가 column renderer(`columns` memo) 안에서 호출되므로 opener를 다시 위로 노출해야 해 배선이 오히려 늘어난다. `useGanttEditors() → { openers, modals }` 형태가 맞다.

실제 위험은 배선이 아니라 타이밍이다. 이 파일의 effect는 rAF 재시도, MutationObserver, "hostHeight 시점 정합" 같은 의존성 주석이 붙은 DOM 코드다. 분리 과정에서 실행 순서가 바뀌면 marker overlay나 placeholder class 같은 시각 회귀가 조용히 발생할 수 있다. 화면 확인을 전제로 진행한다.

`ref mirror`는 동일 패턴이 18회 반복되며 상태 공유가 없어 `useLatestRef` 치환은 위험이 없다. 여기부터 시작한다.

### F-05 · P1 · `WorklogModal`이 입력 UI와 다건 transaction을 동시에 수행한다

- `static/ui/src/pages/myWork/modal/WorklogModal.jsx:43` — 함수 553줄, local state 14개, await 10개
- `:295-317` — 날짜별 `addWorklog`를 브라우저에서 순차 호출하고 중간 실패 시 생성된 항목을 다시 삭제한다.

문제:

- 기간이 길수록 네트워크 왕복이 날짜 수만큼 직렬로 늘어난다. 1개월 범위(약 20 근무일)면 요청 20회가 순차로 실행되며 진행률 표시 없이 submit spinner만 보인다.
- 브라우저 종료·네트워크 단절 시 rollback이 끝나지 않아 부분 등록 상태가 남을 수 있다. rollback 자체의 실패 미확인 결함은 F-00으로 분리했다.
- simple/range form, validation, permission, Jira 호출, rollback이 한 컴포넌트에 결합돼 있다.

순차 실행이 rate limit 때문이라는 근거는 코드·주석 어디에도 없다. 주석은 "중간 실패 시 성공분 전체 rollback"만 설명하며, backend가 동시성 제어에 `p-limit`을 일관되게 쓰는 것과 대비된다. rollback 대상을 확정하기 쉬운 구조로 택한 것으로 읽는다.

수정:

- UI는 `useWorklogDraft`, `SingleWorklogFields`, `RangeWorklogFields`로 나눈다.
- 다건 등록은 사용자 권한을 유지하는 resolver의 `.asUser()` 경로에서 bounded concurrency와 rollback 결과를 관리하는 것이 적절하다. Queue consumer의 `.asApp()`로 단순 이동하면 권한 모델이 바뀌므로 피한다.

### F-06 · P1 · Jira pagination 구현이 두 계열로 복제돼 있다

"6곳 복제"가 아니라 **진짜 클론 2계열 + 변형 1건**이다.

A계열 — project issue, `nextPageToken` do-while, page size 100, 종료 조건 동일:

- `src/resolver/projectCost/ProjectCostService.js:29`
- `src/resolver/projectProgress/ProjectProgressService.js:28` (A1과 바이트 동일)
- `src/resolver/portfolioDashboard/PortfolioAggregator.js:448` (6번째 인자 `'app'` 하나만 차이. 스케줄 트리거의 401 회피 목적)

B계열 — issue worklog, `startAt`/`total` while, page size 20:

- `src/resolver/utils/worklog/WorklogService.js:209`
- `src/resolver/myWork/MyWorkService.jsx:114` (바이트 동일. 같은 파일이 `isInRange`는 `WorklogService`에서 import하면서 이 함수만 복제해 갔다)

C — 변형이므로 통합 대상에서 제외:

- `src/resolver/issueAnalysis/IssueAnalysisService.js:134` — page size 100, `startAt` 0 시작, `total > 100` 게이트 후 루프. 패턴만 같고 구조가 다르다.

전제: 이 저장소는 **"공통 worklog 경로를 수정하지 말고 기능별 전용 페처로 격리한다"는 명시 정책**을 갖고 있다(`src/api/jira/issue/IssueApi.js:374` 주석). 따라서 B계열 통합은 정책과 충돌할 소지가 있어 우선순위를 낮춘다.

수정: A계열 3곳은 이미 동일한 공용 함수 `getProjectIssuesByFilter`를 호출하므로, 그 위에 `fetchAllProjectIssues({ projectId, coworkerFieldId, as })` 래퍼를 추가하는 것은 공통 경로 변경이 아니다. 여기부터 정리한다. B계열은 `getExtraWorklogs`를 export 한 줄로 공유하는 선에서 그친다.

### F-07 · P1 · dashboard bulk 경로는 미사용인데 유지 비용과 중복 fetch를 만든다

- `src/resolver/projectDashboard/ProjectDashboardService.js:109`의 `getChartDataService`
- `src/resolver/projectDashboard/ProjectDashboardController.js:40`의 `getChartData`

정적 frontend invoke 교차검증에서 `getChartData` 소비처가 없고, Service 호출도 Controller 한 곳뿐이다. dynamic invoke 5곳(`JiraUserSelect`, `ScheduleModal`, `useMyWorklogList`, `ProjectModal`, `useGanttFolderMutations`)의 가능한 값을 모두 확인했고 `getChartData`를 조립할 수 있는 경로는 없다.

dead임을 확증하는 근거: `ProjectDashboardService.js:124-125` 주석이 과거 이 함수가 scope 밖 변수를 참조해 **호출 즉시 ReferenceError였고 frontend가 `getChartDataById`만 써서 발현되지 않았다**고 기록한다. 호출됐다면 터졌을 코드가 무사했다는 것이 미사용의 증거다.

함께 정리할 참조: `ProjectDashboardController.js:3-4`·`:40`, `src/utils/permission/PermissionMap.js:190-191`의 `getChartData` 키, `static/ui/src/utils/queryKey/projectKeys.js:51`의 `dashboardData` 키와 이를 쓰는 `DashboardPage.jsx:159`·`:177`의 `invalidateQueries`(대상 쿼리가 없어 현재 no-op이다).

또한 이 경로를 다시 쓰면 `rows.map()` 안에서 같은 `data_type`의 raw data를 위젯마다 다시 읽는다. 같은 데이터의 pie/bar 위젯이 함께 있으면 role/level/KVS/SQL/worklog fetch가 중복된다.

수정: dynamic invoke 소비처가 없음을 최종 확인한 뒤 endpoint와 Service를 제거한다. 유지해야 한다면 request-scope raw dataset cache를 두고 chart formatting만 위젯별로 수행한다.

### F-08 · P1 · 사용자 단건 조회의 not-found 경로가 null dereference로 끝난다

- `src/resolver/backoffice/user/UserService.js:281-305`

`findByAccountId()`가 빈 결과를 반환하면 `user`는 null이지만 `:303`부터 `user.created_id`를 읽는다. 도메인 에러 대신 `TypeError`가 발생한다. `:288-294`는 `user ? ... : []`로 가드하고 있어 누락이 명백하다.

발생 조건: 유일한 소비처가 `useUserEditModal.js:101`의 사용자 편집 모달이고 `accountId`는 목록 행에서 온다. 정상 흐름에서는 재현되지 않고, 다른 관리자가 동시에 삭제한 직후 stale 목록에서 편집을 여는 경합에서만 발생한다. 그 경우에도 `responseWrapper`가 잡아 모달 로딩 실패로 끝난다. 결함은 실재하나 상시 위험은 아니다.

수정: DB 조회 직후 `USER_NOT_FOUND`를 throw하고 단위 테스트를 추가한다.

### F-09 · P1 · 급여 histogram에 `step === 0` edge case가 있다

- `src/resolver/projectDashboard/ProjectDashboardService.js:282-375`

`:305`의 `min === max` 조기 반환은 전원 동일값만 막는다. 전체 `min !== max`여도 IQR로 outlier를 제거한 `normalValues`가 모두 같은 값일 수 있고, 이때 `:330`의 step이 0, `:349`의 0/0이 `NaN`, `:352`의 `buckets[NaN].count++`가 실패한다.

산식을 그대로 node로 재현해 `[3000,3000,3000,3000,9000]` 입력에서 `TypeError: Cannot read properties of undefined (reading 'count')`를 확인했다. 즉 잘못된 histogram이 조용히 그려지는 것이 아니라 **예외가 발생해 해당 위젯 요청이 `{ success: false }`로 실패한다.**

수정: `normalMin === normalMax`이면 1개 bucket으로 반환하거나 step을 명시적으로 보정한다. `[1, 1, 1, 1, 100]` 같은 skewed sample을 테스트에 추가한다.

### F-10 · P3 · 공휴일 query block이 두 곳에 있다 (동작상 무해)

- `static/ui/src/utils/usePublicHolidayList.js:5` — staleTime 30분
- `static/ui/src/backoffice/page/publicHoliday/usePublicHolidayList.js:11` — staleTime 5분

두 곳은 같은 `backofficeKeys.publicHolidays()` key와 동일한 queryFn을 쓴다. 다만 backoffice 쪽은 데이터 Hook이 아니라 74줄짜리 table 조립 Hook이고 그 안에 query block 13줄이 인라인된 형태다. "Hook 2벌"이 아니라 "query block 1개 중복"이다.

**초판의 "stale 정책이 mount 위치에 따라 달라진다"는 서술은 잘못됐다.** staleTime은 cache entry가 아니라 observer별 옵션이고 cache는 key 단위로 공유된다. 짧은 쪽(5분) observer가 refetch하면 결과가 공유 cache에 반영돼 30분 observer 화면도 함께 갱신된다. 두 화면이 서로 다른 값을 보는 상황은 구조적으로 발생할 수 없고, 최악의 결과는 backoffice 진입 시 background refetch 1회 추가다. `keepPreviousData`가 있어 깜빡임도 없다.

또한 staleTime 차이는 화면 성격 차이(backoffice는 편집 화면이므로 짧게)로 읽을 수 있어, 통일이 반드시 옳다고 보기 어렵다.

수정: 필수 아님. 정리한다면 backoffice Hook이 공용 Hook을 내부 호출하도록 바꾸는 정도로 충분하다.

### F-11 · P2 · 근무일 핵심 산식이 frontend/backend에 복제돼 있다

- `src/utils/workday.js` (76줄)
- `static/ui/src/utils/workday.js` (56줄)

함수 단위 비교 결과 `fmtLocal`·`isWeekend`·`buildHolidayMap`·`workdayValue`·`getMonthMm`는 바이트 동일하다. 차이는 `getWorkdaysInRange`의 frontend 측 null guard 1줄과, 각자의 소비처가 필요로 하는 부가 함수(frontend `getMonthMmByKey`, backend `getMonthMmMap`/`countHolidaysInRange`)뿐이다.

**초판의 "이미 미세하게 갈라졌다"는 표현은 과장이다.** 핵심 산식은 단일하며 계산 결과 차이는 0이다. null guard조차 실질적으로 무의미한데, backend에 null이 들어가면 `new Date('undefinedT00:00:00')`가 Invalid Date가 되어 루프 비교가 항상 false이므로 어차피 0을 반환한다.

다만 산식이 실제로 갈라지면 frontend 표시값과 backend 집계값이 어긋난다(frontend 3곳·backend 4개 Service가 각각 소비). 위험 자체는 실재한다.

수정: **물리적 코드 공유는 하지 않는다.** `static/ui`는 독립 CRA 패키지이고 backend는 Forge가 `src/`를 번들하며, 런타임 코드 공유 선례가 0건이다. 두 파일 합계 132줄·변경 빈도 낮음 대비 빌드 경계를 뚫는 비용이 크다.

대신 frontend jest에서 backend 실물을 import해 공통 함수 5종의 결과를 동일 fixture로 대조하는 동기화 테스트 1개를 둔다. `static/ui/src/backoffice/page/team/__test__/inheritedPermission.test.js:4`가 이미 같은 기법을 쓰는 선례다.

### F-12 · 해소됨 · bundle budget 기준은 이미 갱신됐다

**초판 서술은 사실 오류다.** 검사 당일 커밋 `7a2d381`(게이트 경고 강등)과 `36edce3`(코드 스플리팅 재도입)으로 `static/ui/scripts/check-bundle-budget.js`는 이미 다음 상태다.

- 기준: main gzip **950,000B** (1.85MB 아님)
- 전제: 코드 스플리팅이 **살아 있는** 상태 기준 (제거 전제 아님)
- 정책: 초과 시 warning, 측정 불가 시에만 실패

실측 대조 결과 나머지 수치는 정확하다: JS 190개, main gzip 892,894B, 최대 async chunk 372,869B, 전체 gzip 약 2.43MB.

남은 과제(초판 대비 축소): `asset-manifest.entrypoints` initial 합계와 최대 async chunk를 별도 예산으로 추가하고, 안정화 뒤 warning을 CI gate로 복원한다. 현재 기준값 자체는 실측(892,894B) 대비 6% 여유로 적정하다.

미사용 dependency는 전역 grep으로 **8종 모두 import 0건을 확인**했다: `@atlaskit/breadcrumbs`, `@atlaskit/navigation-system`, `@atlaskit/range`, `@atlaskit/side-nav-items`, `@fullcalendar/list`, `picomatch`, `react-apexcharts`(`App.jsx:26` 주석 1줄이 유일한 언급), frontend `p-limit`(backend `src/`에서는 8개 파일이 실사용하므로 루트 선언은 유지).

CRA 트리셰이킹으로 번들에는 들어가지 않으므로 크기 실해는 없다. `npm install` 시간과 audit 노이즈 수준이며 제거는 안전하다. 부수 조치로 **`CLAUDE.md`의 기술 스택에서 `react-apexcharts` 기재를 삭제한다**(실사용 없음).

### F-13 · P2 · 대형 Service/화면의 책임이 과도하다

- `src/resolver/backoffice/user/UserService.js` 826줄: paging/search, Jira user mapping, CRUD, cascade, queue upload, Excel export, meta count를 함께 담당한다.
- `static/ui/src/pages/resource/assignment/ProjectAssignmentBoard.jsx:52` 함수 481줄, local state 15개: filtering, selection, 3종 membership mutation, 3종 confirm modal, layout을 함께 담당한다.
- `static/ui/src/pages/projectDetail/work/TreeDetailPanel.jsx` 1,087줄: file-local component 분리는 되어 있으나 `RelationSection`만 305줄이다.

수정:

- `UserService`: `UserReadService`, `UserWriteService`, `UserExcelService` 수준으로만 나눈다.
- `ProjectAssignmentBoard`: `useProjectMembershipMutations`와 modal state reducer를 추출한다.
- `TreeDetailPanel`: `IssueDetail`, `FolderDetail`, `RelationSection`, display primitives를 파일로 분리한다. 새 추상화보다 테스트/탐색 가능성 개선이 목적이다.

## 통과

- Backend Jest: 67 suites, 1,074 tests 전체 통과.
- Resolver mapping: literal frontend `invoke` 143종 모두 backend 정의와 매칭. 미등록 invoke 0건.
- i18n: literal `t()` key 1,791종이 `ko-KR`/`en-US` 양쪽에 존재. 누락 0건.
- Production compile: `npm run build:app` 성공. Atlaskit/marklassian source map 경고 3건은 남음.
- 코드 스플리팅: route/tab/work view lazy chunk가 실제 build에서 생성됨.

## 미검증

- `forge lint`: 일반 실행은 124초 timeout, `--verbose` 재실행과 `forge --version`/`forge lint --help`도 출력 없이 timeout. manifest 통과로 추측하지 않는다.
- 실제 Forge 환경에서의 API latency/rate-limit, KVS read-after-write 지연, 브라우저 route chunk 체감 시간은 계측하지 않았다.
- 사용되지 않아 보이는 resolver와 npm dependency는 dynamic invocation/peer dependency 최종 확인 전에는 삭제 대상으로 확정하지 않는다.

## 오탐에서 제외한 항목

- `pages/portfolio/widgets/ChartTableToggle.jsx`, `EmptyState.jsx`, `expandContext.js`는 2줄짜리 이전 import 경로 호환 re-export다. 구현 중복이 아니다. 소비처 이관 후 shim 삭제만 검토한다.
- 두 `StatusBadge`는 이름은 같지만 계약이 다르다(프로젝트 상태 색상 vs generic appearance). 이름만 보고 합치면 API가 더 복잡해진다.
- pagination, rate-limit, 재부모화처럼 순서가 의미 있는 `await` loop는 일괄 `Promise.all`로 바꾸지 않는다. 공용 helper화와 bounded concurrency를 구분해야 한다.

## 권장 실행 순서

1. F-00 rollback 실패 확인 및 안내 문구 수정 (배포 전 필수)
2. F-02 query-key 계약 복구, F-08/F-09 correctness 수정, F-01 log 제거 및 회귀 테스트
3. F-03 backend `addCatalogItemsBulk` 통합 (frontend 3벌은 보류)
4. F-06 A계열 `fetchAllProjectIssues` 래퍼 추가
5. F-04(`useLatestRef` → bridge → overlay → editors 순)/F-05/F-13을 작은 extraction PR로 분리
6. F-07 dead endpoint 제거(참조 5곳 동반 정리), 미사용 dependency 8종 제거, F-11 동기화 테스트 추가
7. F-12 initial/async chunk 예산 추가 후 CI gate 복원

F-10은 동작상 무해하므로 별도 작업으로 잡지 않는다.

