# FIX STAGE3 — 프론트엔드 (P1-5, P1-2)

- 대상 감사: `_workspace/perf-audit/FRONTEND_2026-08-12.md`
- 범위: **P1-5(간트 인라인 편집 전량 재조회)**, **P1-2(자원관리 숨김 탭 선로드)** 두 건만
- 병행 작업 회피: 번들 분리(WorklogPage·FullCalendar·MarkdownEditor)·백엔드(queue/permission) 파일은 미접촉

## 개정 이력

| rev | 날짜 | 내용 |
|-----|------|------|
| rev1 | 2026-08-12 | P1-5 invalidate 3건 제거 + P1-2 오탐 판정·근거 고정 |
| **rev2** | 2026-08-12 | **Codex 리뷰(`CODEX_REVIEW_STAGE3.md`) 중요 2건 반영** — ① 전체 스냅샷 롤백 경합 → **필드 단위 롤백**, ② plannedMd 의 서버 파생값 `progress` 미갱신 → **서버 산식으로 재계산**. `useGanttMutations.js` 외 미접촉 |

---

## P1-5 — 간트 인라인 편집 3종의 전량 재조회 제거 (수정함)

`static/ui/src/pages/projectDetail/gantt/useGanttMutations.js`

| 훅 | 제거한 것 | 대체 |
|----|-----------|------|
| `useUpdateAssignee` | `onSettled → invalidateQueries(ganttKeys.data)` (구 :443-445) | 기존 낙관 패치를 최종 상태로. 낙관값이 이미 간트 계약 shape(`{accountId, displayName, avatarUrl}`)으로 정규화돼 있어 "shape 안전망"이 필요 없다 |
| `useUpdateCoworkers` | `onSettled → invalidateQueries` (구 :511-513) | 낙관 패치 유지. **규약 위반 해소** — write 경로가 `updateProjectIdField → setAppFieldValueForIssues`(앱 커스텀필드)이고 `ganttKeys.data` 재조회는 JQL search 라, write 직후 invalidate 는 인덱스 지연으로 옛 값을 캐시에 박제한다(GANTT.md §6 / CLAUDE.md) |
| `useUpdatePlannedMd` | `onSettled → invalidateQueries` (구 :584-586) | 낙관값을 **실제로 write 하는 시간값에서 역산**하도록 변경. 신설 헬퍼 `plannedHours(md, rate)`(`:37-40`)를 mutationFn 과 onMutate 가 공유 → 캐시값 = 서버 저장값 |

- `onMutate`(cancelQueries + prev 스냅샷) / `onError` **롤백 경로는 3개 모두 그대로 보존**했다.
- 정렬 대상 모범: 같은 파일 `useSetParent`/`useSetLink`(서버 확정 응답 부분 패치, invalidate 금지)와 `useGanttFolderMutations.js:16-21`.

### 낙관값이 서버 응답을 대체할 수 있는 근거 (교차 확인)

- **assignee**: `assignIssue`(Jira PUT)는 본문을 반환하지 않는다(`''`) → 패치할 서버 응답 자체가 없다. 낙관 매핑이 `GanttMapper.js:134-140`의 서버 shape과 키가 같다.
- **coworkers**: `updateProjectIdFieldService`(`src/resolver/projectIssue/ProjectUsersService.js:272-288`)는 **아무 값도 반환하지 않는다**(`content` 없음) → 서버 응답 패치가 불가능하다. 대신 낙관값(select 옵션 value `{accountId, displayName, avatarUrls:{'24x24'}}`, `ProjectIssueAssignSelect.jsx:9-12`)이 소비처 `AvatarStack.jsx:25-26`이 읽는 키를 모두 갖춰 서버 shape과 **렌더 동등**임을 확인했다.
  - 잔여 차이 1건(무해): 서버 user 객체에 있는 `emailAddress`가 낙관값엔 없어 아바타 툴팁의 보조줄이 다음 자연 재조회 전까지 비어 보인다. 표시 항목 자체는 동일.
- **plannedMd**: write 는 `${round(md*rate*10)/10}h`, 기존 낙관은 `round(md*rate*3600)`초라 0.1h 반올림만큼 **어긋날 수 있었다**(invalidate 가 가려주던 부분). 두 값을 `plannedHours` 단일 출처로 묶어 제거했다.
- 파생값(처리율 `progressPercent`, `aggregateprogress`)은 서버 재계산분이라 다음 자연 재조회(탭 재진입/새로고침)에서 따라온다 — `useSetParent`와 동일 정책.

### rev2 — Codex 리뷰 반영 2건

**① 전체 스냅샷 롤백 경합 제거 (필드 단위 롤백)**

지적대로 rev1 은 세 훅 모두 `onMutate` 에서 **쿼리 전체**를 스냅샷하고 `onError` 에서 통째로 복원했다. invalidate 를 걷어낸 뒤로는 이 경합이 자연 재조회 전까지 남는다 — 담당자 편집 실패의 늦은 `onError` 가 그 사이 성공한 계획 MD 편집의 낙관값까지 되돌린다.

- 신설 `snapshotFields(old, match, fields)` (`:62-69`) — "그 이슈의 그 필드"만 저장하고 `{ found, prev }` 를 반환. `found=false`(대상 task 부재)면 롤백을 건너뛴다.
- `onError` 는 `patchTask`/`patchTaskByIssueId`(`:38-48`, issueId 매칭판 신설)로 **그 필드만** 되돌린다.
  - `useUpdateAssignee` `:477-481` / `:501-508` — `['assignee']`
  - `useUpdateCoworkers` `:557-561` / `:573-580` — `['coworkers']`
  - `useUpdatePlannedMd` `:638-642` / `:665-672` — `['originalEstimateSeconds','progress']`(아래 ②로 progress 도 패치 대상이 됐다)
- **onError-only invalidate 는 채택하지 않았다.** 대안으로 제시된 그 방식은 안전하긴 하나, 실패가 권한 거부처럼 **연속으로 재현되는 경로**(같은 이슈를 다시 편집)에서는 최고비용 resolver 전량 재조회가 그대로 되살아난다. 필드 단위 롤백은 코드 증가가 헬퍼 2개(약 20줄)뿐이고 경합을 원인에서 없앤다. `cancelQueries`(진행 중 재조회가 낙관값을 덮는 것 방지)는 3개 모두 유지.
- 남은 한계(의도): 동일 이슈의 **동일 필드**를 동시에 두 번 편집하면 마지막 실패가 자기가 뜬 prev 로 되돌린다. 셀 편집 UI 상 같은 셀의 중복 인플라이트는 실사용 경로가 아니라 그대로 둔다.

**② plannedMd 의 `progress` 재계산 (서버 산식 미러)**

`progress` 는 orig 를 **분모로** 쓰는 서버 파생값이라, 계획을 줄이면 서버는 100% 인데 막대는 옛 % 로 남는다(옛 invalidate 가 가려주던 것).

- **산식 출처: `src/resolver/gantt/GanttMapper.js:65-76` (`computeProgress`)** — `done` 이면 1, 그 외 `orig>0 && spent!=null` 이면 `round(min(spent/orig,1)*100)/100`, 아니면 `null`. 이를 그대로 미러한 `computeProgressLocal(statusKey, orig, spent)` 를 `:85-92` 에 두고 출처 파일:라인을 주석에 박았다.
- **spent 출처**: `mutationFn` 이 remaining 을 얻으려고 **이미 부르는** 단건 GET(`executeRequest('getIssue', {fields:'timetracking'})`)의 `timeSpentSeconds` 를 반환값으로 올린다(`:632`). 추가 호출 0건이고, **단건 GET 은 search 가 아니라서 인덱스 지연과 무관**하다(§6 의 금지 대상은 write 직후 search/JQL 재조회다).
- `onSuccess`(`:652-663`)에서 새 `originalEstimateSeconds` + 캐시의 `statusKey` + 위 spent 로 `progress` 를 확정 패치한다. `onMutate` 는 종전대로 orig 만 즉시 반영(막대 %는 응답 도착 시 확정) — 낙관 시점엔 spent 를 알 수 없어 추정하면 오히려 틀린 %가 깜빡인다.
- 그리드 "처리율" 컬럼(`progressPercent` = `aggregateprogress.percent`)은 **하위 이슈 롤업**이라 로컬 재계산 대상이 아니다. 다음 자연 재조회에서 따라온다(주석에 명시).
- 부수: `mutationFn` 반환값이 `result` → `{ timeSpentSeconds }` 로 바뀌었다. 호출부는 `.mutate()` 만 쓰고 `.data` 를 소비하는 곳이 없음을 확인했다(`GanttPage.jsx:269,274,278`, `ProjectTreeView.jsx:261,413`).

### 의도적 invalidate 잔존 목록

**`useGanttMutations.js` 안에는 남은 `invalidateQueries` 가 0건이다.** 간트 계열에서 의도적으로 유지한 invalidate 는 아래뿐이며 이번 범위와 무관하다.

| 위치 | 유지 사유 |
|------|-----------|
| `useGanttFolderMutations.js` 폴더 5종(생성/수정/삭제/이동/링크) | 앱 DB(Forge SQL) 전용 경로라 **Jira 인덱스 지연이 없다**. 단, 이 파일도 `ganttKeys.data` 전량 invalidate 는 쓰지 않고 응답 기반 부분 패치를 우선한다(`:16-21`, `:79`) |
| `useSetParent` / `useSetLink` / `useSetFolderLink` / `useUpdateSchedule` | 원래부터 invalidate 없음(서버 확정 응답 패치) — 변경 없음 |

- 문서 동기화: `src/resolver/gantt/GANTT.md` §4-3 표의 "`onSettled` invalidate(shape 안전망)" 행을 새 정책으로 갱신(해당 파일은 `.gitignore:72`로 미추적 문서).

---

## P1-2 — 자원관리 숨김 탭 선로드 (**오탐**: 코드 수정 불필요, 근거 고정)

감사 전제 — "Atlaskit `TabPanel` 이 children 을 무조건 렌더하므로 4개 탭 훅이 동시 실행된다" — 는 **성립하지 않는다.**

감사는 `@atlaskit/tabs/dist/cjs/components/tab-panel.js` 만 확인했고 상위 `tabs.js` 를 보지 않았다. `TabPanel` 은 자기가 렌더될 때 children 을 그대로 내보내는 게 맞지만, **`Tabs` 가 방문한 패널만 렌더한다**:

`node_modules/@atlaskit/tabs/dist/esm/components/tabs.js:74-97`
```js
var visited = useRef(new Set([selected]));
if (!visited.current.has(selected)) visited.current.add(selected);
...
// If a panel has already been visited, don't unmount it
Array.from(visited.current).map(function (tabIndex) { ... tabPanels[tabIndex] ... })
```

즉 요구된 동작(첫 선택 전 미렌더 + 방문 후 유지, 전환 시 언마운트 없음)이 **이미 라이브러리 기본 동작**이다. 설치본은 18.3.4 단일본이다(`npm ls @atlaskit/tabs` — 중첩 설치 없음).

### 실측 검증

jsdom 렌더로 직접 확인했다(조건부 탭을 끼워 `ResourcePage` 와 동일 구조로 구성):

- 진입 시 마운트: `['mount:overview']` — 숨김 탭 3개는 **마운트되지 않음** → `getPortfolioDashboard`·`getAssignmentProjectMetrics`·`getAssignmentProjectCards`·`getTeamAnalyticsScope` 는 진입 시 호출되지 않는다. 숨김 ECharts 6개도 생성되지 않는다.
- 4번째 탭 방문 후 첫 탭 복귀: `['mount:overview','mount:assignment']` — **언마운트 이벤트 0건**. `ResizablePanels` 폭·스크롤 등 패널 상태는 보존된다(무회귀).
- 조건부(`showTeamAnalytics`) 패널이 껴 있어도 인덱스 정렬이 맞는다(`Children.toArray` 가 `false` 를 걸러 Tab/TabPanel 순서가 1:1 유지).

`invoke` 실행 경로도 재확인했다 — 위 4개 resolver 호출은 전부 숨김 탭 컴포넌트 내부 훅(`teamAnalytics/hooks/useTeamAnalyticsData.js:68,85`, `assignment/useAssignmentProjectCards.js:21`, `assignment/useAssignmentProjectMetrics.js:23`)에만 있고, `prefetchQuery` 는 앱 전역에 0건이다.

### 그래서 한 일

수동 `selected`/`visited` 게이트를 새로 구현하면 라이브러리 동작과 중복될 뿐이고, 조건부 탭 때문에 인덱스 정렬을 손으로 맞춰야 해 오히려 회귀 위험만 생긴다. 대신 **전제를 고정**했다.

- `static/ui/src/pages/resource/__test__/resourceTabsLazyMount.test.js` (신규, 2 케이스) — Atlaskit 업그레이드로 이 동작이 깨지면 즉시 실패한다.
- `static/ui/src/pages/resource/ResourcePage.jsx:16-25` — 왜 수동 게이트를 두지 않는지 근거 주석(재감사 시 같은 오탐 반복 방지).

> P1-2 의 소규모 사례로 적힌 `IssueAddModal.jsx:207-211`(모달 오픈만으로 `SubscriptionTab` 마운트)은 **같은 원인이 아닐 수 있다** — 그 화면은 `Tabs` 를 통하지 않을 가능성이 있으므로 별건으로 재확인 필요. 이번 범위 밖이라 손대지 않았다.

---

## 변경 파일

| 파일 | 라인 | 내용 |
|------|------|------|
| `static/ui/src/pages/projectDetail/gantt/useGanttMutations.js` | `:38-48` | `patchTaskByIssueId` 신설(협업자 롤백/패치용 issueId 매칭) **[rev2]** |
| 〃 | `:50-71` | `snapshotFields` + `matchByKey` 신설 — 필드 단위 롤백 스냅샷 **[rev2]** |
| 〃 | `:73-76` | `plannedHours(md, rate)` 헬퍼 신설(write 값 ↔ 낙관값 단일 출처) |
| 〃 | `:78-92` | `computeProgressLocal` 신설 — 백엔드 `GanttMapper.js:65-76` 산식 미러 **[rev2]** |
| 〃 | `:437-450` | `useUpdateAssignee` 전략 주석 갱신 + `onSettled` 제거(구 :443-445) |
| 〃 | `:477-481`, `:501-508` | `useUpdateAssignee` 필드 단위 스냅샷/롤백 **[rev2]** |
| 〃 | `:511-524` | `useUpdateCoworkers` 전략 주석 갱신(규약 위반 사유 명시) + `onSettled` 제거(구 :511-513) |
| 〃 | `:557-566`, `:573-580` | `useUpdateCoworkers` 필드 단위 스냅샷/롤백 + `patchTaskByIssueId` 사용 **[rev2]** |
| 〃 | `:585-604` | `useUpdatePlannedMd` 주석 갱신(invalidate 가 대신하던 ①②를 명시) + `onSettled` 제거(구 :584-586) |
| 〃 | `:632` | `mutationFn` 이 `{ timeSpentSeconds }` 반환(기존 GET 재사용, 추가 호출 0) **[rev2]** |
| 〃 | `:638-642`, `:665-672` | `useUpdatePlannedMd` 필드 단위 스냅샷/롤백(`originalEstimateSeconds`+`progress`) **[rev2]** |
| 〃 | `:645-663` | 낙관값 `plannedHours` 역산 + `onSuccess` 에서 `progress` 확정 재계산 **[rev2]** |
| `static/ui/src/pages/resource/ResourcePage.jsx` | `:19-27` | 수동 lazy 게이트를 두지 않는 근거 주석(코드 동작 변경 없음) |
| `static/ui/src/pages/resource/__test__/resourceTabsLazyMount.test.js` | 신규 | 탭 마운트 계약 회귀 테스트 2건 |
| `src/resolver/gantt/GANTT.md` | §4-3 표 | 3개 훅의 낙관 갱신 정책 행 갱신(미추적 문서) |

## 검증 (rev2 기준 재실행)

- `cd static/ui && npx jest` → **74 suites / 1237 tests 전부 통과** (신규 2건 포함)
- `cd static/ui && CI=true npm run build` → **성공**(Compiled with warnings — node_modules 소스맵 경고, 기존과 동일). `bundle:check` = `{"file":"static/js/main.69dc0010.js","rawBytes":1577446,"gzipBytes":432906,"budgetBytes":950000,"withinBudget":true}`
  - 빌드 트리에는 병행 작업(WorklogPage 번들 분리)의 변경이 함께 들어 있었다 — main gzip 432KB 는 그 작업 효과가 반영된 수치다.
- i18n: **신규 키 없음** → `npm run merge` 불필요(단, `prebuild` 가 build 시 자동 실행됨)
