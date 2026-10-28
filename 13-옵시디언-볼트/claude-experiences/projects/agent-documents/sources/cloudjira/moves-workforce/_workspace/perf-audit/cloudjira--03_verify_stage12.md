# 성능 리팩토링 1·2단계 — 통합 정합성 검증 리포트

- 검증일: 2026-08-12 · 대상: **워킹 트리 미커밋 변경 전체**(`git status` 44개 항목, `develop` 기준 `f6e521c`)
- 입력: `BACKEND_2026-08-12.md` · `FRONTEND_2026-08-12.md`(감사) / `FIX_STAGE1_BACKEND·FRONTEND.md` · `FIX_STAGE2_BACKEND(rev2)·FRONTEND.md`(수정) / `CODEX_REVIEW_RFC187.md`
- 원칙: **성능 수정이 값을 바꾸면 실패다.** 생산자·소비자를 같이 열어 교차 비교했고, 리포트의 주장은 독립 grep 으로 재수집해 대조했다.

---

## 0. 판정 요약

| 항목 | 판정 | 비고 |
|---|---|---|
| A-1 워크로그 페이지 크기 20→100 | **통과** | 결과 집합 동일(루프가 크기 비의존) |
| A-8 `BIN_TO_UUID(col)=?` → `col=UUID_TO_BIN(?)` | **통과** | 파라미터·SELECT·GROUP BY 불변 |
| A-3 대시보드 통계 2종 1패스 통합 | **통과** | 집계·배열 순서·응답 shape 동치. rev2 로 in-flight 합류 달성 |
| A-3 참여자 캐시 무효화 | **통과(잔여 공백 1건 — O-1)** | assignee/coworker 쓰기 2곳 확인. **이슈 편입/해제**는 미무효화 |
| A-7 마스터 사전 5종 캐시 | **조건부 실패 → F-2** | 무효화 22곳은 전수 일치. 다만 **CRUD 목록 읽기까지 캐시**해 read-after-write 가 확률적으로 깨진다 |
| P1-7 폴링 백그라운드 정지 | **통과** | 리스너 1회 등록·정리, 복귀 즉시 1회 |
| P1-9 `/myWork` resolver 2회→1회 | **통과(관찰 2건 — O-2·O-3)** | clip 이 서버 `isInRange` 와 문자 단위 동치 |
| P1-14 사용자 정보 사람 단위 캐시 | **통과** | 반환 shape·필터 규칙 불변, 배치·동시성 로직 정상 |
| P1-4 `getUser` N+1 4곳 벌크화 | **통과** | 표시 필드(`displayName`·`avatarUrls['24x24']`) 모두 bulk 응답에 존재 |
| P1-3 탭 3중 마운트 | **통과** | 탭 12개 prop·`canRender` 1:1 보존 |
| P1-8 검색 디바운스·레이스 | **실패 → F-1** | 캐시 히트 분기에서 로딩 플래그가 **영구 누수** |
| P1-13 표 어댑터 상수 절감 | **통과** | RFC-184 계약 5조항 전부 동치, 조기 종료 반례 없음 |

**게이트 (직접 실행, 최종 코드 기준)**

| 게이트 | 결과 |
|---|---|
| 루트 `npm test` | **70 suites / 1,110 tests 통과** |
| `static/ui` `npm test` | **73 suites / 1,235 tests 통과**(스냅샷 1) |
| `static/ui` `CI=true npm run build` | **성공**(exit 0, eslint 경고 0) |
| `bundle:check` | `gzip 899,163 / 예산 950,000` — `withinBudget: true` |

> 빌드 통과는 shape 정합의 증거가 아니다. 아래 교차 비교가 판정의 근거다.

---

## 1. Codex 리뷰 3건(rev2) 반영 확인

| # | 지적 | 반영 코드 | 검증 결과 |
|---|---|---|---|
| **R1** | A-3 캐시가 **완료된 결과만** 담아 첫 진입의 동시 invoke 를 못 합친다 | `src/api/jira/issue/ProjectParticipantFetcher.js:99-110` | **통과.** `cached = {key, at, promise}` 로 전환, hit 시 `await cached.promise`. 실패는 `catch` 에서 `cached.promise === promise` 확인 후 엔트리 제거 → **실패 미캐시** 확인. 저장된 promise 는 항상 생성자가 await 하므로 unhandled rejection 없음. 지적의 전제(위젯 동시 invoke)도 재확인했다 — `ChartTemplate.js:59-79` 가 위젯마다 독립 `useQuery` 라 첫 마운트에서 병렬 발사된다 |
| **R2** | 담당자/협업자 쓰기 경로에서 참여자 캐시 무효화 누락 | `ProjectUsersService.js:409`, `WorkAssignmentWriter.js:96-98` | **통과(잔여 1건).** 독립 grep 으로 write 경로를 전수했다 — assignee 쓰기 엔드포인트는 `IssueApi.js:474`(`assignIssueApi`) 하나이고 호출부는 `WorkAssignmentWriter.js:86` 유일, coworkers 쓰기는 `mergeIssueProperty(..., {coworkers})` 2곳(`ProjectUsersService.js:408`·`WorkAssignmentWriter.js:92`)뿐이다. **둘 다 무효화가 걸렸다.** `GanttService.js:222`(wbsParent)·`AssignedDateRecorder`(assignedAt)는 통계 입력이 아니라 무관. → 잔여 공백은 **O-1**(이슈 편입/해제) |
| **R3** | `settings` 캐시는 급여 fail-close 경계를 시간 축으로 뚫는다 | `SettingService.js` | **통과(완전 원복).** `git diff` 결과 이 파일의 변경은 **주석 블록 9줄뿐**이고 `getSettingDataService` 는 `customEntityManager(ENTITY).findById("settings")` 직접 조회로 HEAD 와 동일하다. `DictionaryCache` import 없음(`grep` 확인). 캐시 리셋을 넣었던 테스트 2건(`SettingService.test.js`·`SalaryPolicySetting.test.js`)도 워킹 트리에서 사라져 **원복 확인**. 현재 캐시 대상은 role/level/skill/status/holiday **5종** |

> R3 판단에 동의한다. `settings.salaryPolicy` 의 stale 은 **늦게 닫히는 방향**(정책을 LEVEL_BAND 로 바꿔도 최대 60초 개인 급여가 계속 나감)이라, 권한 stale(늦게 열림)과 성질이 다르다. 게다가 `findById` 1건이라 이득도 가장 작았다.

---

## 2. 실패 — 수정 필요

### F-1. (프론트, **중요**) `UserSearchSelect` 기본목록 캐시 분기에서 로딩 플래그 영구 누수

**파일:** `static/ui/src/components/select/UserSearchSelect.jsx:61-69` ↔ `:110-116`

```js
// :61-69  캐시 히트 → seq 만 올리고 즉시 return (loadingRef/setLoading 을 건드리지 않는다)
if (!search && nextPage === 0 && defaultCacheRef.current) {
    reqSeqRef.current += 1;
    ... setOptions(cached.options); return;
}
...
// :110-116  진행 중이던 옛 요청의 finally
} finally {
    if (mySeq === reqSeqRef.current) {   // ← 위에서 seq 가 올라가 이 조건이 거짓
        loadingRef.current = false;
        setLoading(false);
    }
}
```

**재현 경로:** 메뉴 오픈(기본목록 캐시 적재) → 검색어 입력 → 디바운스 발사(`loadingRef=true`) → **입력을 지움** → 디바운스 후 캐시 분기 진입(`reqSeq++`, 즉시 return) → 옛 요청이 뒤늦게 끝나며 `finally` 조건 불일치로 **플래그를 못 내린다.**

**증상:** `loadingRef.current` 가 `true` 로 고정 → `:58` 가드에 걸려 **무한스크롤 페이징이 그 컴포넌트 수명 동안 죽는다.** `loading` state 도 `true` 로 남아 스피너/로딩 표시가 고착된다. 새 검색은 `:57-58` 가드가 페이징 전용이라 계속 발사되므로 **에러 없이 조용히** 기능만 반쯤 죽는다.

**수정:** 캐시 분기에서 진행 중 요청을 무효화할 때 로딩 소유권도 함께 회수한다.

```js
if (!search && nextPage === 0 && defaultCacheRef.current) {
    reqSeqRef.current += 1;
    loadingRef.current = false;   // ← 추가
    setLoading(false);            // ← 추가
    const cached = defaultCacheRef.current;
    ...
}
```

담당: **frontend**

---

### F-2. (백엔드, **중요 — 설계 판단 필요**) A-7 캐시가 백오피스 CRUD 목록 읽기까지 덮어 read-after-write 가 깨진다

**생산자:** `RoleService.js:51` · `LevelService.js:110` · `SkillService.js:75` · `ProjectStatusService.js:95` · `PublicHolidayService.js:49` (전부 `readDictionary(ENTITY, load…)`)
**소비자:** `RoleController.js:15` `getRoleList` → `useRoleList.js:37 invoke('getRoleList')` → `RolePage.jsx:57,68,75` 가 저장 직후 `invalidateQueries(backofficeKeys.roles())` 로 **즉시 재조회**. level/skill/holiday/projectStatus 도 동일 구조(`useLevelQuickAddModal.js:57`, `SkillPage.jsx:66,77,84`, `PublicHolidayPage.jsx:65,76` …).

**문제:** Forge 는 다중 인스턴스라 `invalidateDictionary` 는 **쓰기를 처리한 인스턴스에만** 적용된다. 저장 직후의 재조회가 다른(따뜻한) 인스턴스로 라우팅되면 **방금 추가/수정/삭제한 항목이 목록에 없다** — 최대 60초. 사용자에게는 "저장이 안 됐다"로 보이고, 다시 저장하면 이름 중복 검증(`checkDuplicated`, KVS 직접 조회)에 걸려 **"목록엔 없는데 저장은 거부"** 라는 최악의 조합이 된다.

**근거 — 이 리포가 이미 같은 결론을 문서로 못박아 뒀다.** 수정이 선례로 든 `TeamTreeCache` 는 정확히 이 경로를 **제외**했다:

> `src/resolver/backoffice/team/TeamTreeCache.js:88-90`
> *"팀 CRUD 화면의 읽기 3종(`getTeamList`/`findTeamById`/`getTeamOptions`)은 이 캐시를 쓰지 않는다 — read-after-write 가 깨지기 때문이다(F3). 그 경로들은 `loadTeamIndexFresh()` 를 쓴다."*

즉 A-7 은 선례를 인용하면서 **선례가 배제한 바로 그 경로**를 캐시했다. `TeamTreeCache` 에 남은 캐시 소비자는 "팀 이름 표시"뿐이고 목록 자체가 아니다.

**수정 방향(권고):** 선례와 같은 모양으로 **읽기 경로를 둘로 가른다.** 로더는 이미 `loadRoleList`/`loadLevelList`/… 로 분리돼 있어 변경이 작다.

```js
// 예: RoleService.js
export const getRoleListFreshService = async () => ({ data: await loadRoleList() });          // Controller 전용
export const getRoleListService = async () => ({ data: (await readDictionary(ENTITY, loadRoleList)).map(r => ({...r})) }); // 내부 소비자
// RoleController.js
guardedDefine(resolver, 'getRoleList', () => getRoleListFreshService());
```

- **잃는 것**: 프론트가 직접 부르는 `getRoleList`/`getSkillList` 중복 호출(감사 ①의 permission 제외분·`SkillMultiSelect.jsx:34` 2회)만 캐시 밖으로 나간다.
- **지키는 것**: A-7 이득의 대부분은 **내부 소비자**다 — `UserService.js:153-154`(`roleLevelMap`, 목록 조회마다 2경로), `ResourceManagementService.js:70-74·289·452`, `PortfolioDashboardService.js:164-167`, `ProjectDashboardService.js:215·225`(위젯 W개), `ProjectTeamService.js:226`, `MyTeamAnalysisService.js:106-107`. 이들은 캐시를 그대로 탄다.
- 대안(더 보수적): 5종 캐시를 유지하되 TTL 을 대폭 낮추는 것은 **해결이 아니다** — 재조회는 저장 후 1초 안에 일어나므로 TTL 이 5초여도 깨진다.

**대안 채택 시 필수 조건**: "그대로 간다"고 결정한다면, 그 결정은 A-7 문서의 「수용한 한계 1」에 *"백오피스 CRUD 목록이 저장 직후 옛 값을 보일 수 있다"* 로 **명시**돼야 한다(현재 문구는 "다른 인스턴스는 옛 값을 본다"까지만 적혀 있어, 편집 당사자 화면이 대상이라는 점이 드러나지 않는다).

담당: **backend** (설계 판단 포함)

---

## 3. 관찰 — 판단 필요하나 이번 범위에서 실패로 보지 않은 것

| # | 내용 | 위치 | 권고 |
|---|---|---|---|
| **O-1** | **A-3 잔여 무효화 공백.** 담당자/협업자 외에 **이슈의 프로젝트 편입/해제**도 참여자 통계의 입력 집합을 바꾸는데 무효화가 없다 | `ProjectUsersService.js:280`(편입)·`:295`(해제) · `queue/consumer.js:182` · `SubscriptionSweeper.js:122` | R2 와 같은 부류다. resolver 경로 2곳(`:280`,`:295`)에 `invalidateProjectParticipantIssues()` 한 줄이면 대칭이 맞는다. 큐/스윕은 다른 Forge 함수라 무의미(demoSeed 와 같은 논리) |
| **O-2** | **P1-9 요약 카드 일시 0.** 캘린더를 다른 달로 넘기면 `calendarCoversSummary` 가 false 로 뒤집히며 요약 전용 쿼리가 **그때 처음** 발사된다. 그 사이 `summarySource=undefined` → 요약이 0으로 렌더 | `WorklogPage.jsx:127-152` | 종전에는 요약 쿼리가 진입 시 이미 채워져 이 깜빡임이 없었다. 값 오류는 아니나 체감 회귀다. 직전 요약을 유지(`useRef` 폴백)하거나 로딩 표시로 대체 권고 |
| **O-3** | **P1-9 조회 창 확대의 절단 임계.** 요약이 캘린더(6주) 결과에서 파생되므로, 요약이 의존하는 응답이 더 넓은 창의 단일 요청이 된다. `getIssuesByWorklogAuthor` 는 `maxResults=5000` **단일 요청·`nextPageToken` 루프 없음**(감사 B-1 계열) | `IssueApi.js:241-283` | 절단이 실제로 걸리는 규모에서만 문제이며 **실환경 미검증**. B-1 을 고칠 때 함께 해소된다 |
| **O-4** | P1-14 로 `useUserInfos` 반환 **배열 순서**가 Jira 응답 순 → accountId 오름차순으로 바뀐다. 소비 7곳 중 6곳은 맵 조립이라 무영향, `WorklogModal.jsx:97`(협업자 아바타 나열)만 표시 순서가 달라진다 | — | 값 동일. 수용 가능하면 그대로 |
| **O-5** | P1-4 로 비용 탭 드로어 **첫 오픈** 시 멤버 이름이 bulk 1왕복만큼 늦게 뜬다(그동안 accountId 폴백) | `CostByIssueTable.jsx:56-67` | 탭 진입 즉시 40왕복을 없앤 대가. 감사 수정 방향 그대로 |
| **O-6** | **죽은 쿼리키 3종** 잔존 — `jiraKeys.userMap`, `projectKeys.costUserMap`, `logicalAuditKeys.userMap`(=resourceAnalysis userMap). 계약 테스트는 통과하나 새 코드가 옛 키를 다시 집으면 캐시가 갈린다 | `queryKey/jiraKeys.js:3` 외 | 팩토리에서 제거 + `queryKeyFactories.test.js:29` 단언 정리 |
| **O-7** | `src/trigger/demoSeed.js:70` 이 role/level/status 를 쓰지만 무효화 없음 | — | 웹트리거 = 다른 Forge 함수 = 다른 모듈 인스턴스라 무의미. 문서화돼 있고 **수용 타당** |
| **O-8** | 감사 A-7 이 열거한 7종 중 `permission` 을 캐시하지 않았다 | — | 권한 판정 축이라 **정당한 축소**. 다만 감사가 계산한 `/backoffice/users` permission 3회 절감은 실현되지 않는다(문서상 효과 수치 과대) |
| **O-9** | `projectTeamAnalysisWiring.test.js` 수정(정규식 완화)이 `FIX_STAGE2_FRONTEND.md` 의 변경 파일 목록에 **누락** | — | 리포트 보정. 변경 자체는 P1-3 에 정확히 대응(게이트 구조는 그대로 두고 `<ActivePage …/>` 스프레드만 허용) |
| **O-10** | `.gitignore` 변경(`/Moves_Workforce_사용자_매뉴얼/*`)은 이번 성능 작업과 무관 | — | 무해. 커밋 분리 권고 |
| **O-11** | P1-3 회귀 방어가 **소스 문자열 정적 단언**(`tabMountIdentity.test.js` 6건)이다. 마운트 횟수를 실제로 세지 않는다 | — | 리포에 `@testing-library/react` 가 없어 불가피(리포 관례). 실환경 1회 마운트는 **미검증**(§4) |

---

## 4. 미검증 (추측으로 통과 처리하지 않음)

1. **E2E 전반** — 실제 Jira 사이트에서의 동작 확인 없음.
2. **P1-3 마운트 1회** — 정적 단언만 통과. 리포트가 제시한 확인법(임시 `useEffect` 로그 / DevTools Profiler / `getChartInfo`·`getSummaryData` 진입당 3회→1회)은 **수행되지 않았다.**
3. **Forge 다중 인스턴스 라우팅** — A-3·A-7 캐시의 실제 적중률과 stale 발생 빈도(F-2 위험의 실제 확률 포함)는 배포 환경에서만 측정된다.
4. **성능 수치** — 감사·수정 리포트의 왕복 절감치는 전부 계산값이다. 실호출 계측 없음.
5. **O-3 의 절단 임계** — 워크로그 6주 창에서 `maxResults=5000` 을 실제로 넘기는 데이터셋을 확보하지 못했다.
6. **P1-8 수정 후 재검증** — F-1 은 코드 판독으로 확정했으나, 수정 후의 동작(무한스크롤 복구)은 재실행 필요.

---

## 5. 통과 항목의 근거 (교차 비교 요약)

### A-1 (`MyWorkService.jsx:117-137` · `WorklogService.js:212-232`)
`maxResult` 인자 제거 → 래퍼 기본값 100(`WorklogApi.js:4`) 승계. 루프 종료가 `currentStartAt += logs.length` + `currentStartAt >= res.total` 로 **페이지 크기에 비의존**이라 누적 결과 집합이 동일하다. 두 파일 모두 module-private 헬퍼라 외부 계약 없음.
`WorklogService` 는 `ProjectDashboardService` 도 소비하지만(공통 경로), 변경이 **페이지 크기 하나**이고 결과 보존이라 「워크로그 전용 페처 분리」 규약 위반이 아니다.

### A-8 (`rdb/query/ProjectDashboard.js:16`)
`WHERE p.project_id = UUID_TO_BIN(?)`. 바인딩은 UUID 문자열 1개로 종전과 동일하고(호출부 4곳 전부 문자열), SELECT·GROUP BY·별칭 미변경 → `{project_id, project_name, start_date, end_date, total_member_count, total_salary}` 그대로. `WHERE BIN_TO_UUID(` 잔존 0건 확인.

### A-3 (`ProjectParticipantFetcher.js` · `IssueApi.js:9-115`)
- **집계 동치**: 옛 코드의 `assignee?.accountId || 'unassigned'` / `displayName || 'unassigned'` / `avatarUrls['24x24'] || null` 을 레코드 2단 폴백으로 그대로 재현. coworker 는 `properties[movesRms].coworkers ?? []` 동일, bulk resolve 는 루프 밖 1회 유지.
- **배열 순서**: 페이지 순회 순서 그대로 → 차트 카테고리 순서 불변.
- **내부 소비자 전수**(CLAUDE.md 「서비스 내부 소비자」 교훈): `getAssigneeStats`/`getIssueParticipantStats` 를 부르는 곳은 `ProjectUsersService.js:309·314` 뿐이고, 그 서비스의 소비자는 `ProjectDashboardService.js:274·280` 유일. **Controller 직결 resolver 없음.** 기존 mock(`SalaryPolicyLeak.test.js:172-176`)과도 호환(추가 인자는 optional 후미).
- **권한 누수**: 캐시 키 `viewerId::projectId`, `viewerId` 없으면 캐시 미사용(fail-safe). `principal` 은 `ProjectDashboardController.js:43-45` 에서 두 경로 모두 전달되므로 실제로 채워진다. 검색은 여전히 `as:'user'`.

### A-7 (`DictionaryCache.js` + 5종)
- **무효화 전수 대조(독립 grep)**: `customEntityManager(` 인스턴스화 지점을 전수하고, 5종 엔티티를 다루는 파일에서 `.save(`/`.delete(` 를 모두 뽑아 `invalidateDictionary` 와 1:1 대조했다 → **role 4 · level 4 · skill 4 · status 7 · holiday 3 = 22곳 전부 일치, 누락 0.** `status_link` 쓰기(`:199·206·298·304`)는 캐시 대상이 아니며, `saveStatusOrder`(`:355·365`)도 `:374` 에서 무효화된다. 시드는 `SeedData.js:27` `invalidateAllDictionaries()` 로 덮는다(`addStatusSeed`/`addSettingSeed` 는 `runSeed` 외부 호출자 없음 — 확인).
- **Promise 캐시**: 실패 시 엔트리 제거(`DictionaryCache.js:43-49`) → 실패 미캐시 확인.
- **캐시 오염**: 5종 모두 호출마다 `map(row => ({...row}))` 얕은 복사. 값이 전부 원시 타입이라 얕은 복사로 충분하고, `LevelController.gateLevelBands`(`:24-30`)는 구조 분해로 새 객체를 만들 뿐 원본을 건드리지 않는다.
- **쓰기 검증은 캐시 밖**: `checkDuplicated`(`findByWhere`)·`findById` 전부 KVS 직접 조회 확인.
- 남은 위험은 **F-2**(읽기 경로 선택) 하나다.

### P1-7 (`JobPollingManager.jsx:48-58,124-136` · `jobPolling.js:33-38`)
`visibilitychange` 는 `useEffect(..., [])` 로 **1회 등록 + cleanup 에서 해제** → 중복 등록·누수 없음. 복귀 시 `[...intervalsRef.current.keys()]` 스냅샷 후 순회하므로 `pollJob` 이 `stopPolling` 으로 Map 을 지워도 안전. `pollJobRef` 로 최신 클로저를 보게 해 `t`/`toast` 변경 후에도 옛 본문을 쓰지 않는다. `inFlightRef`·`nextPollAtRef` backoff·`isTerminalJob`·언마운트 정리 전부 불변.

### P1-9 (`useMyWorklogSummary.js:9-41` · `WorklogPage.jsx:127-152`)
서버 필터(`MyWorkService.jsx:96,182`)는 `isInRange(wl.started.substring(0,10), start, end)` = `new Date(...)` 양끝 **inclusive** 비교이고, 워크로그가 0건이면 이슈를 **드롭**한다(`:99,:185`). `clipWorklogsToRange` 는 `started.substring(0,10)` 을 같은 inclusive 범위로 문자열 비교(`YYYY-MM-DD` 사전순=날짜순)하고 빈 이슈를 동일하게 드롭한다 → **동치**. 두 쿼리는 같은 resolver(`getMyCalendarWorklog`)·같은 `normalizedProjectIds`·`mine:true` 라 필터 조건도 같다. 캘린더 6주 창은 이번 달의 **초집합**이므로 clip 후 집합이 정확히 일치한다.
덤으로 정합성이 **좋아진 지점**: 드래그 수정 후 무효화(`WorklogPage.jsx:317`)가 캘린더 키만 지웠는데, 종전에는 요약이 별도 키라 갱신되지 않았다. 파생으로 바뀌며 함께 갱신된다.

### P1-14 / P1-4
- `useUserInfos` 반환은 `{data, isLoading}` 로 **HEAD 와 동일**(`git show HEAD:` 대조). id 정규화 규칙도 동일 — 옛 `fetchBulkUsers` 가 이미 같은 `ACCOUNT_ID_PATTERN` 으로 걸렀으므로 `filter(isValidAccountId)` 이동은 무회귀.
- `mapWithConcurrency`(`useJiraUserInfos.js:33-48`): 공유 커서 방식, `Math.min(limit, len)` 러너 → 빈 입력에서 `Promise.all([])`, off-by-one 없음, 결과 순서 = 입력 순서.
- 배치 창: `flush` 진입 즉시 `pendingWaiters` 를 스냅샷 후 clear 하고 `flushScheduled=false` 로 되돌리므로, **flush 중 도착한 요청이 다음 배치로 정확히 넘어간다**(유실 없음). 청크 실패는 `reject` → 상위 `.catch(() => null)` → `filter(Boolean)` 으로 그 사람만 빠진다(종전 동작). 모든 waiter 가 반드시 settle 된다(성공/실패 양 분기 확인) → 영구 pending 없음.
- 개인 엔트리 `staleTime 10분` + `gcTime 30분`, 집합 쿼리 `staleTime 10분` — 집합이 재실행돼도 개인이 신선하면 왕복 0. 집합 쿼리가 GC 돼도 개인 캐시가 살아 재조립만 한다.
- P1-4 4곳이 userMap 에서 읽는 필드는 `displayName` 과 `UserAvatar`(=`avatarUrls['24x24']`, `displayName`) **뿐**이다(`CostByIssueTable.jsx:122,148` · `SalaryManagementPage.jsx:291` · `ProjectUserPanel.jsx:94` · `ResourceAnalysisTable.jsx:181` · `ResourceAnalysisChart.jsx:323`). 둘 다 `/user/bulk` 응답에 있다(`TaskHistoryTable` 이 같은 경로를 이미 사용). 게이트는 `shouldFetchUserMap` 을 유지한 채 빈 배열을 넘겨 `enabled:false` 와 같은 결과(왕복 0, `isLoading` false)를 만든다.

### P1-3
`git show HEAD:constants/tabs.js` 와 1:1 대조 — 12개 탭 전부 인라인 화살표가 넘기던 prop 이 `props` 객체에 그대로 있고(`project_id`/`toast`/`context`), `canRender`(`canReadCost`·`canReadReport && canReadProject`·`canWriteProject`)·`key`·`label`·i18n 키·순서 모두 불변. `component:` 값 14개 전부 식별자(인라인 화살표 잔존 0건). `CommonTab.jsx:83` 은 `canRender ? <ActivePage {...pageProps}/> : <NoPermissionPage/>` 로 **권한 게이트 구조 유지**. `ToastFlags.js:75-98` 은 `show`/`register` 가 ref 기반 `useCallback([])` 이라 `useMemo([show, register])` 의 의존이 실제로 안정적이고, `FlagUI` element 도 메모 안에 들어가 참조가 고정된다.

### P1-13
- `adaptRows`(`tableSort.js:146-186`): 새 구현의 `sawPresent && numeric` 은 옛 `present.length>0 && present.every(isNumericLike)` 와 동치, 결측 치환(`-Infinity`/`''`)·`needsRewrite` 판정·무변경 시 원본 참조 반환·`sortValue`/`sortKey` 제거 모두 유지 → **RFC-184 §2 계약 5조항 동치**.
- `resolveSortableColumns`(`:92-99`): `sawDistinct=true` 후 계속 돌던 것을 `return true` 로 바꾼 것뿐이라 **결과를 바꾸는 반례가 없다**(한 번 갈리면 이후 행이 무엇이든 결과는 true).
- `EMPTY_ROWS`(`TableSurface.jsx:31`)·`effectiveRows` 메모(`:72-76`): 이 파일에서 rows 를 변형하는 코드가 없고(`sort`/`push` 부재), `adaptRows` 도 새 배열을 만든다 → 공유 상수 오염 없음.
- 기존 54건 + 신규 3건 + 탭 6건 포함 `components/table`·`components/tabs` 4 suites **63 tests 통과**(별도 실행 확인).

---

## 6. 재량 판단 4건 평가

| 판단 | 평가 |
|---|---|
| A-3 에서 KVS 공유 캐시를 기각하고 **메모리 + viewerId 키** | **타당.** 검색이 `as:'user'` 라 결과가 호출자 권한으로 필터링된다 — `projectId` 만으로 KVS 를 공유하면 가시 범위가 섞인다. `viewerId` 누락 시 캐시 미사용(fail-safe)까지 맞다 |
| P1-3 에서 감사 제안(`useMemo(() => ToastFlags(), [])`)을 기각하고 **ToastFlags 내부 수정** | **타당.** 제안대로 하면 2회차 렌더에서 팩토리가 실행되지 않아 내부 `useRef`/`useCallback` 호출 수가 줄어 훅 규칙 위반으로 죽는다. 고칠 수 있는 자리는 내부뿐이고, 한 줄로 호출부 전체가 낫는다 |
| P1-13 "시그니처로 어댑터 스킵" **불성립** 논증 | **타당.** 어댑터 산출물이 그 렌더의 JSX(`content`)를 실어 나르므로 정렬값 시그니처로 재사용하면 내용이 바뀐 표가 **에러 없이** 옛 화면으로 굳는다. `React.memo(DynamicTable)` 기각 근거(`frozenHead` 가 항상 새 참조)도 코드와 일치 |
| 프론트에서 `p-limit` 대신 로컬 `mapWithConcurrency` | **타당.** `static/ui/package.json:65` 는 `p-limit ^7.3.0`(ESM-only)인데 `static/ui/jest.config.js:23` 의 `transformIgnorePatterns` 는 `@forge` 만 허용 → import 시 테스트가 깨진다. 필요한 기능이 "동시 N개"뿐이라 로컬 구현이 합리적(구현도 정확) |

---

## 7. 조치 요약

| 우선 | 항목 | 담당 |
|---|---|---|
| 1 | **F-1** `UserSearchSelect.jsx:61-69` 로딩 플래그 회수 2줄 | frontend |
| 2 | **F-2** A-7 CRUD 목록 읽기를 fresh 경로로 분리(또는 한계를 명시적으로 문서화하고 수용 결정) | backend |
| 3 | **O-1** `ProjectUsersService.js:280·295` 에 참여자 캐시 무효화 추가 | backend |
| 4 | **O-2** `/myWork` 요약 카드 일시 0 완화 | frontend |
| 5 | **O-6/O-9/O-10** 죽은 쿼리키 정리 · 리포트 파일 목록 보정 · `.gitignore` 커밋 분리 | 각 담당 |

배포 전 **E2E(§4)** 는 별도로 필요하다 — 특히 P1-3 마운트 1회와 A-7 캐시의 실환경 stale 거동.
