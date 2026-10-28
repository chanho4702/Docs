# 03 — Stage 3 통합 검증 리포트 (2026-08-12)

> **rev2 재검증 완료 (본문 말미 「rev2 재검증」 절이 최종 판정)**
> rev1 의 **F-1(A-4 eventual consistency)은 해소**됐다. rev2 에서 **새 실패 1건(F-2, 워크로그 재시도 무력화)** 을 발견했다.
> rev1 본문은 이력으로 남긴다 — 각 항목의 최종 상태는 말미 표를 볼 것.

- 대상: **워킹 트리 미커밋 변경 전체** (1·2단계 커밋분 `6480e22` 등은 대상 아님)
- 입력: `FIX_STAGE3_BACKEND.md`(A-4·A-6), `FIX_STAGE3_FRONTEND.md`(P1-5·P1-2), `FIX_STAGE3_BUNDLE.md`(P1-1),
  감사 원본 `BACKEND_2026-08-12.md` / `FRONTEND_2026-08-12.md`
- 검증 대상 파일 (git status)

| 상태 | 파일 |
|---|---|
| M | `src/nosql/query/CustomEntityManager.js`, `src/permission/PrincipalResolver.js`, `src/queue/consumer.js` |
| M | `static/ui/src/pages/myWork/WorklogPage.jsx`, `.../myWork/modal/WorklogModal.jsx` |
| M | `static/ui/src/pages/projectDetail/gantt/useGanttMutations.js`, `.../pages/resource/ResourcePage.jsx` |
| ?? | `src/queue/__test__/JobCompletion.test.js`, `static/ui/src/components/{calendar/FullCalendarLazy,markdown/MarkdownEditorLazy}.jsx`, `static/ui/src/pages/resource/__test__/resourceTabsLazyMount.test.js` |

---

## 0. 게이트 직접 실행 결과 — 전부 통과

| 게이트 | 결과 |
|---|---|
| 루트 `npm test` | **71 suites / 1,117 tests 통과** (exit 0) |
| `npx jest test/permission` | **7 suites / 167 tests 통과** ← A-6 절대 조건 |
| `npx jest src/queue/__test__/JobCompletion.test.js` | **7/7 통과** |
| `cd static/ui && CI=true npx jest` | **74 suites / 1,237 tests 통과**(스냅샷 1 포함) |
| `npx jest src/pages/resource/__test__/resourceTabsLazyMount.test.js` | **2/2 통과** |
| `cd static/ui && CI=true npm run build` | **성공** |
| `bundle:check` | `{"file":"static/js/main.f75a3593.js","rawBytes":1576296,"gzipBytes":432478,"budgetBytes":950000,"withinBudget":true}` |
| 빌드 후 워킹 트리 | `locales/ko-KR.json`·`en-US.json` **무변경** — prebuild merge 가 동일 산출물을 냈다(신규 키 없음 확인) |

> 표기 오기 1건: `FIX_STAGE3_BUNDLE.md:100` 은 프론트 "75 suites" 라 적었으나 실측은 **74 suites / 1,237 tests**. 테스트 수는 일치.

---

## 실패 (1건)

### ❌ F-1 [A-4·최상] `checkJobCompletion` 이 **eventually consistent 한 인덱스 쿼리**로 완료를 판정한다 → 마지막 배치에서 job 이 영구히 `RUNNING` 으로 남을 수 있다

- **생산자**: `src/queue/consumer.js:85-90`(uploadUsers) / `:212-214`(backfill) — `jobBatchManager.saveTTL(key, {... done:true})`
- **소비자**: `src/queue/consumer.js:268` — `jobBatchManager.findByWherePaged('jobId', appJobId, 100, total)`
  → `src/nosql/query/CustomEntityManager.js:164-187` — `kvs.entity().query().index().where().getMany()`

**불일치 내용.** Atlassian 공식 문서상 Forge Custom Entity Store 의 **`entity().query` 는 eventually consistent** 이고 **`entity().get` 은 strictly consistent** 이다.
종전 구현은 배치 키마다 `findById`(= `entity().get`, **강한 일관성**)로 점 조회했다. 새 구현은 이 판정을 통째로 **인덱스 쿼리(약한 일관성)** 로 바꿨다.

파괴되는 시나리오 — **마지막 배치의 read-your-own-write**:

1. 마지막(=B번째) 컨슈머가 자기 `job_batch` 레코드를 `saveTTL` 로 쓴다.
2. 곧바로 `findByWherePaged('jobId', …)` 로 인덱스를 스캔한다.
3. 인덱스 반영이 아직 안 됐으면 자기 레코드(또는 임의의 다른 레코드)가 결과에 없다 → `doneBatches.length < total` → `return`.
4. **이 job 을 다시 판정할 주체가 없다.** 모든 배치가 이미 소비됐고, `checkJobCompletion` 은 정상 return 이라 큐 재시도도 걸리지 않는다(`consumer.js` 의 `retryCondition` 은 throw 된 에러만 본다).
5. 결과: `job.status` 가 `RUNNING` 에 고정 → `JobPollingManager.jsx:79` 의 `isTerminalJob` 이 영원히 false → 성공 토스트·`userKeys.lists()` invalidate·서버 job cleanup 이 모두 안 일어나고 폴링이 24h TTL 까지 계속 돈다.
   (사용자 데이터 자체는 이미 `addUsersBulk` 로 적재돼 있으므로 데이터 유실은 아니다. **완료 표시가 유실**된다.)

`FIX_STAGE3_BACKEND.md:66-68` 의 "스캔 실패는 다음 배치가 다시 판정한다"는 논증은 **마지막 배치에는 성립하지 않는다**(다음 배치가 없다). 같은 이유로 스캔이 예외로 실패하는 경로(`consumer.js:269-273`)도 마지막 호출에서는 동일하게 영구 정체다.

> 공정한 단서: 구 구현도 마지막 판정의 `findById` 가 **일시 오류**로 실패하면 같은 상태가 됐다. 다만 그건 드문 장애 경로였고, 지금은 **정상 동작인 인덱스 지연**이 같은 결과를 낸다 — 확률 등급이 다르다. 그래서 "실패"로 분류한다.

**수정 방법 (권고).** 판정의 **경계에서만** 강한 일관성 읽기를 되살린다. 스캔은 그대로 두고, 부족분이 소수일 때만 점 조회로 확인하면 A-4 의 B²→B 이득을 유지한 채 정확성을 복원할 수 있다. 배치 키 형식이 **두 호출 경로에서 동일**함(아래 P-1)이 이 보정의 전제이며, 검증 완료했다.

```js
// src/queue/consumer.js — checkJobCompletion 내부, `if (doneBatches.length < total) return;` 를 대체
const seenIdx = new Set(doneBatches.map(b => b.batchIndex));   // ※ 아래 주 참조
let done = doneBatches;

if (done.length < total) {
    const missing = [];
    for (let i = 0; i < total; i++) {
        if (!scanKeys.has(`${appJobId}-batch-${i}`)) missing.push(i);
    }
    // 인덱스 지연 보정: 부족분이 적을 때만 강한 일관성 점 조회로 확인한다.
    // (많이 비어 있으면 실제로 미완료 — 추가 읽기 없이 그냥 return)
    if (missing.length > CONFIRM_LIMIT) return;               // 예: CONFIRM_LIMIT = 10
    const confirmed = await Promise.all(
        missing.map(i => jobBatchManager.findById(`${appJobId}-batch-${i}`).catch(() => null)),
    );
    if (confirmed.some(b => !b?.done)) return;
    done = [...done, ...confirmed];
}
```

주: 현재 `job_batch` 레코드에는 `batchIndex` 속성이 없으므로 위 보정은 **스캔 결과의 `row.key` 집합**(`scanKeys`)으로 판단해야 한다. `consumer.js:281` 이 이미 `row?.key` 를 읽고 있으므로 그 값을 `seen` Set 에 모아 그대로 재사용하면 된다(`manifest.yml` 변경 불필요 — 새 속성을 추가하지 않는다).

비용: 정상 경로에서 추가 읽기 **0**, 지연이 걸린 마지막 판정 1회에서만 최대 `CONFIRM_LIMIT` 건. B² 회귀 없음.

**담당**: backend.

---

## 통과

### ✅ P-1 [A-4] 두 호출 경로의 배치 키 형식 일치 — 재확인 완료

| 경로 | 키 생성 | 저장 시 `jobId` |
|---|---|---|
| `UserService.js:596` → `consumer.js:85` | `${appJobId}-batch-${index}` (batchIndex 로 재구성) | `jobId: appJobId` ✓ |
| `SubscriptionBackfill.js:146` → `consumer.js:149` | `batchId ?? ${appJobId}-batch-${batchIndex}`, **batchId 자체가 같은 형식**(`SubscriptionBackfill.js:146`) | `jobId: appJobId` ✓ |

`appJobId` 는 양쪽 모두 `job-${crypto.randomUUID()}`(`UserService.js:584`, `SubscriptionBackfill.js:142`) → 다른 job 의 레코드가 인덱스 조회에 섞이지 않는다. `manifest.yml:337-338` 에 `job_batch.indexes: [jobId]` **선언돼 있음**(재배포 불필요).

### ✅ P-2 [A-4] 응답 shape — `findById` ↔ `getMany().results` 차이를 정확히 흡수

`@forge/kvs` 실측 타입(`out/interfaces/types.d.ts:44-52`): `ListResult.results = Result<T>[] = {key, value}[]`.
구 코드는 `findById` 반환값(= value 평면)에서 `b?.done` 을 읽었고, 신 코드는 `consumer.js:279` 의 `const value = row?.value ?? row;` 로 **두 shape 모두** 처리한다. 집계식(`processedCount`/`failCount` 합, `consumer.js:291-292`)과 판정 임계는 글자 그대로 유지됐다. 신규 테스트 mock 도 `{key, value}` 로 실제 shape 을 재현한다(`JobCompletion.test.js:24`).

### ✅ P-3 [A-4] 멱등성 — 재시도 중복 소비로 조기 완결되지 않는다

키가 배치마다 유일해 재시도 저장이 **덮어쓰기**이며, `consumer.js:276-287` 이 `row.key` 기준으로 한 번 더 dedup 한다. 카운터를 도입하지 않은 판단(KVS 무트랜잭션)도 타당. 테스트 `JobCompletion.test.js:148-160` 이 4/5 상태에서 배치 0·1 재소비 후에도 `RUNNING` 유지 + `processed` 중복 미합산을 고정한다. **통과.**

### ✅ P-4 [A-4] `totalBatches` 가드가 기존 정상 경로를 깨지 않는다

`consumer.js:261-263`: `Number(totalBatches)` 후 `Number.isInteger && > 0`. 두 생산자 모두 `chunk(...).length`(양의 정수)를 넣고, 문자열이 와도 `Number()` 로 통과한다. 구 코드의 잠재 버그(`totalBatches === undefined` → `0 < undefined === false` → **처리량 0으로 COMPLETED**)를 막는 개선이며 테스트로 고정(`JobCompletion.test.js:182-192`). **회귀 없음.**

### ✅ P-5 [A-6] 판정 동등성 — 4개 조합 전부 종전과 동일

`PrincipalResolver.js:225-249` 교차 확인.

| 조합 | 종전 | 현재 | 동등 |
|---|---|---|---|
| admin OK + users OK | `isAdmin` → try 안에서 users 조회 → `rows[0].team_key` 로 teamCtx | `Promise.all` 로 미리 받은 `dbUserInfo[0].team_key` | ✓ (`:260-262`) |
| admin OK + users 실패 | try/catch → teamCtx 비움 | `loadUserRows` 가 `[]` 흡수 → `length > 0` 미충족 → teamCtx 비움 | ✓ |
| **admin 실패(throw)** | users 조회 전에 전파 → 가드 fail-close | `Promise.all` 이 그대로 reject → 동일 전파. `loadUserRows` 는 **절대 reject 하지 않으므로**(`:228-231` catch) unhandled rejection 없음 | ✓ |
| 비admin + users 실패 | catch → `dbUserInfo=[]` → 미등록 fail-close | 동일 (`:287-301`) | ✓ |
| 팀장 / 미등록 | `resolveTeamContext` 는 **users 행 확인 뒤에만** 호출 | 호출 위치 불변(`:304`) — §4-1 stale `leaderAccountId` fail-close 유지 | ✓ |

호출 횟수 불변(admin·비admin 모두 `getUserInfoService` 정확히 1회), 분기 순서 불변, `getUserInfoService` 는 순수 read(`UserService.js:825-827` → `findByAccountId`)로 부작용 없음. `test/permission` **167/167 통과**(`principalResolver.test.js` 의 `mockGetTeamIndex).not.toHaveBeenCalled()` 포함).

### ✅ P-6 [P1-5] 낙관 패치 shape ↔ 서버 재조회 shape 동등

| 필드 | 서버(생산자) | 낙관(소비자) | 판정 |
|---|---|---|---|
| `assignee` | `GanttMapper.js:135-139` → `{accountId, displayName, avatarUrl(24x24)}` | `useGanttMutations.js:424-430` 동일 3키로 정규화 | **일치** |
| `coworkers` | `CoworkerResolver.js:32-37` → **Jira raw user**(`avatarUrls` 전 사이즈 + `emailAddress`) | select 옵션 value `{accountId, displayName, avatarUrls:{'24x24'}}`(`ProjectIssueAssignSelect.jsx:9-12`) | **렌더 동등** — 소비처 `GanttGridEditCells.jsx:113` 의 `AvatarStack` 기본 `size='small'`(24px) → `avatarUrls['24x24']` 만 읽는다(`AvatarStack.jsx:25`). 잔여 차이는 `emailAddress`(툴팁 보조줄)뿐 |
| `originalEstimateSeconds` | Jira 저장값 그대로 | `Math.round(plannedHours(md,rate)*3600)` (`:572`) | **왕복 일치** — 아래 |

**plannedHours 왕복 검증(직접 계산).** write 값 `plannedHours(md,rate)=round(md*rate*10)/10` 시간 → 서버 저장 초 = `그 값*3600`. 낙관값도 같은 함수에서 역산하므로 **동일 수**. 표시측 역변환(`GanttGridEditCells.jsx:293-294`, `GanttChart.jsx:142-143`, `TreeDetailPanel.jsx:308-309`,`:380-381`)은 `round((sec/(rate*3600))*10)/10` 로 대칭. 예: md=0.3, rate=7.5 → 2.3h → 8,280s → 표시 0.3 ✓. 구 낙관값(`round(md*rate*3600)`)이 갖던 **0.1h 반올림 오차가 제거**됐다(invalidate 가 가려주던 부분) — 개선.

**롤백 경로 보존**: 3개 훅 모두 `onMutate`(cancelQueries + `prev` 스냅샷) / `onError`(`setQueryData(prev)`) 그대로. 제거된 것은 `onSettled` 뿐(구 :443-445 / :511-513 / :584-586). `useGanttMutations.js` 내 잔여 `invalidateQueries` **0건** 확인.

**두 번째 소비자 확인(리포트 미기재)**: `useUpdateCoworkers`·`useUpdatePlannedMd` 는 간트 외에 **`ProjectTreeView.jsx:116-121`(작업관리 트리 뷰)** 도 쓴다. 두 화면 모두 같은 `ganttKeys.data` 캐시를 읽고, 호출부가 넘기는 인자 shape 도 동일(`GanttChart.jsx:355-359` / `ProjectTreeView.jsx:261` 둘 다 `GanttUserModal` 의 `{accountIds, users}`) → **트리 뷰에도 회귀 없음**. 계층 합계(`ganttAdapter.js:343-369`)는 클라이언트에서 캐시 tasks 로부터 재계산하므로 낙관 패치가 그대로 전파된다.

**GANTT.md 정합**: `src/resolver/gantt/GANTT.md:150` 의 §4-3 표 행이 3개 훅 = "토스트만, **invalidate 금지**(2026-08-12)" 로 갱신됨. §6(`:173`) 의 write-후-search 금지 규약과 모순 없음(오히려 규약 위반을 해소).

### ✅ P-7 [P1-1] main 번들 유출 0 — 빌드 산출물 직접 재검증

내가 직접 빌드한 산출물에서 확인(리포트 수치 재현):

- `build/static/js/main.f75a3593.js` 문자열 검색: `mdxeditor`·`lexical`·`CodeMirror`·`marklassian`·`fc-daygrid`·`fullcalendar`·`Asia/Seoul`·`Antarctica/Vostok` → **전부 0건**
- `build/static/css/main.3097e113.css`: `mdxeditor`·`fc-` → **0건**
- **소스맵 귀속**: `main.f75a3593.js.map` 의 `sources` 1,310개 중 `@fullcalendar|moment-timezone|/moment/|@mdxeditor|lexical|prismjs|marklassian|adf-to-md|@codemirror` 매칭 **0건**
- 청크 실측 gzip: `918.*.chunk.js` 331,197 B / `7530.*.chunk.js` 127,431 B (리포트 331,009 / 127,498 과 오차 범위 일치) — 합 458,628 B 가 main 감소분 466,685 B 의 **98%** 를 설명
- main gzip **432,478 B** / 예산 950,000 B → `withinBudget: true`

### ✅ P-8 [P1-1] ADF 변환 비동기화의 레이스 가드 — 정확

`WorklogModal.jsx:127-145`. 검증한 것:

- 이펙트 본문에서 markdown 블록이 **마지막**이라 `if (!comment) { setMarkdown(''); return; }`(`:130-133`) 의 조기 return 이 뒤 로직을 건너뛰지 않는다.
- `cancelled` 플래그 + `return () => { cancelled = true; }`(`:144`) → deps `[worklogInfo]` 재실행 시 이전 비동기 결과가 다른 워크로그를 덮지 않는다. `.catch` 분기에도 `cancelled` 체크가 있다.
- 코멘트 없는 워크로그(신규 등록)는 `adf-to-md` 를 **아예 받지 않는다**.
- `addWorklog` 가 `async` 로 바뀐 것 → 호출부 `onSubmit`(`:264, :290`)이 이미 `await` 한다. **정합.**
- 모듈 promise 캐시(`:39-56`)로 2회차부터 왕복 없음.

### ✅ P-9 [P1-1] Suspense / ChunkErrorBoundary 배치 — #426 안전

- `FullCalendarLazy.jsx:94-98`, `MarkdownEditorLazy.jsx:61-65` — **각 지점이 자기 Suspense 경계**를 갖고 상위 경계에 의존하지 않는다. `ChunkErrorBoundary`(`components/error/ChunkErrorBoundary.jsx:20`, default export) 로 감싸 청크 404 도 영역 단위로 처리.
- 두 래퍼 모두 대상 모듈을 **정적 import 하지 않는다**(확인) → 청크 재합류 없음.
- fallback 은 스켈레톤(스피너 없음, RFC-178 규약 준수). aria 라벨은 기존 키 `common.loading` 재사용 — `locales/ko-KR.json`·`en-US.json` 양쪽에 **존재 확인**(중첩 경로 `common.loading`).
- `calendarRef` 는 `WorklogPage.jsx:49,500` 에서 **prop 으로 전달만** 하고 역참조하지 않는다 → 청크 도착 전 null deref 없음.
- `App.jsx` 라우트 lazy 구조·`CommonTab.jsx` Suspense 경계 **무변경** 확인.

### ✅ P-10 [P1-1] 1단계 커밋분(P1-9)과의 간섭 없음

`WorklogPage.jsx` 워킹 트리 변경은 **import 1줄 + JSX 태그 1곳**뿐(`git diff` 확인). 1단계 커밋 `6480e22`(워크로그 페이지 크기·폴링·중복 호출)가 건드린 로직과 겹치는 hunk 없음. `WorklogModal.jsx` 변경도 import·변환기 로딩·submit 진입부에 한정.

### ✅ P-11 [P1-2] "숨김 탭 선로드"는 **오탐** — node_modules 에서 직접 재확인

`static/ui/node_modules/@atlaskit/tabs` **18.3.4**, `dist/esm/components/tabs.js:74-104`:

```js
var visited = useRef(new Set([selected]));
if (!visited.current.has(selected)) { visited.current.add(selected); }
...
// If a panel has already been visited, don't unmount it
Array.from(visited.current).map(function (tabIndex) { ... tabPanels[tabIndex] ... });
```

`TabPanel` 이 children 을 무조건 렌더하는 것은 맞으나 **`Tabs` 가 방문한 패널만 렌더**한다 → 진입 시 숨김 탭의 훅/`invoke` 는 실행되지 않고, 방문 후에는 언마운트되지 않는다(패널 상태 보존). 조건부 children 은 `:65-68` 의 `.filter(Boolean)` 이 걸러 Tab/TabPanel 인덱스가 1:1 유지된다. **에이전트 판정 타당 — 코드 수정 불필요가 맞다.**
신규 테스트 `resourceTabsLazyMount.test.js` 2건이 이 전제를 고정하며 통과(단, 아래 O-3 참조). `ResourcePage.jsx:19-27` 의 근거 주석도 실제 동작과 일치.

---

## 미검증 (추측으로 통과 처리하지 않음)

| # | 항목 | 사유 |
|---|---|---|
| U-1 | **`findByWherePaged` 의 실제 커서 페이징 경로** | `JobCompletion.test.js:21-37` 은 `findByWherePaged` 를 **통째로 mock** 하고, 그 mock 은 커서 개념 없이 `i >= all.length` 로 종료한다. 실 구현(`CustomEntityManager.js:171-186`)의 `cursor`/`nextCursor` 분기·`truncated` 플래그·2페이지 이상 경로를 **어떤 테스트도 실행하지 않는다.** `findByWherePaged` 단위 테스트가 리포지토리에 없다(grep 확인) |
| U-2 | 동시 배치 완료 경합(두 컨슈머가 동시에 최종 판정) | 신규 테스트 7건은 전부 `await` 순차 소비다. 분석상 두 판정이 같은 값을 같은 키에 쓰므로 멱등이고 구 구현과 동일한 성질이지만, **테스트로는 고정되지 않았다** |
| U-3 | 스캔 예외 실패 경로(`consumer.js:269-273`) | `findByWherePaged` 가 throw 하는 케이스를 테스트가 만들지 않는다. 또한 F-1 과 같은 이유로 **마지막 배치에서의 실패는 보수적이지 않다**(영구 정체) |
| U-4 | 실 KVS 환경에서의 인덱스 지연 실측 | F-1 의 발생 빈도는 배포 환경에서만 측정 가능. 배치 100개 초과 업로드 1회로 2페이지 경로 + 완료 전이를 함께 확인할 것 |
| U-5 | E2E | `/myWork` 초기 진입(캘린더 스켈레톤→캘린더), 워크로그 모달 열기/저장(기존 코멘트 있는 건), 간트/트리 셀 편집 후 새로고침 시 값 유지 — 모두 배포 후 확인 필요 |

---

## 관찰 (수정 권고, 이번 회차 차단 사유 아님)

- **O-1** `CustomEntityManager.js:164-187` — `for(;;)` 에 **반복 상한이 없다.** 종료는 `!cursor` 또는 `results.length >= maxItems` 뿐이라, 빈 페이지 + 비어 있지 않은 커서가 반복되면 무한 루프다. 기존 `findAllPaged`(`:108-129`)와 동일 패턴이라 **새로 생긴 위험은 아니지만**, 이 함수는 큐 컨슈머(600s invocation)에서 호출되므로 루프 상한(예: `maxItems/pageLimit + 2` 회)을 두는 편이 안전하다.
- **O-2** `PrincipalResolver.js:246-249` — `isAdministrator()` 가 실패해도 users SQL 이 이미 발행된다(버려짐). Jira 장애 시 **모든 guarded resolver 진입이 Forge SQL 을 한 번씩 더 때린다.** 판정에는 영향 없음(리포트도 인지). 감시만.
- **O-3** `resourceTabsLazyMount.test.js:36,41` — 조건부 탭을 `{true && …}` **상수**로 넣어서, 실제 위험 케이스인 **조건부 탭이 숨겨질 때(`showTeamAnalytics === false`)의 인덱스 정렬**은 고정되지 않았다. `false` 변형 케이스 1건을 추가하면 테스트의 명시된 목적("조건부 탭 인덱스 정렬 검증")이 실제로 충족된다.
- **O-4** `TreeDetailPanel.jsx:218` — coworker 아바타를 `c?.avatarUrl`(단수)로 읽는데, 서버/낙관 어느 shape 에도 그 키가 없다(`avatarUrls` 복수뿐). **선행 결함이고 P1-5 로 인한 회귀가 아니다**(양쪽 shape 모두 없으므로 invalidate 유무와 무관). 별건으로 `c?.avatarUrls?.['24x24']` 로 정정 권고.
- **O-5** 범위 밖 선행 버그: `src/resolver/utils/job/JobService.js:67` 이 `item.id` 로 삭제하는데, `getMany().results` 의 항목 키는 `item.key` 다(`:93` 은 올바르게 `key` 사용). `job_fail` 정리가 조용히 실패하고 있을 수 있다. 이번 변경과 무관하나 같은 계열이라 기록.

---

## 판정 요약

| 항목 | 판정 |
|---|---|
| A-4 정확성 | **실패 1건(F-1)** — 인덱스 쿼리의 eventual consistency 로 마지막 배치 완료 판정이 유실될 수 있음. 그 외(키 형식·shape·멱등성·`totalBatches` 가드)는 전부 통과 |
| A-6 판정 동등성 | **통과** — 4개 조합 전부 동일 결과·동일 throw, `test/permission` 167/167 |
| P1-5 | **통과** — 3종 낙관 shape 동등, plannedMd 왕복 일치(오히려 반올림 오차 제거), 롤백 보존, GANTT.md 갱신 정합, 트리 뷰 제2 소비자도 무회귀 |
| P1-1 | **통과** — main 유출 0(문자열·소스맵 2중 확인), 레이스 가드 정확, Suspense/ChunkErrorBoundary 각 지점 자립, 1단계 커밋분과 간섭 없음 |
| P1-2 오탐 판정 | **통과** — node_modules 18.3.4 에서 `visited` 동작 직접 확인, 오탐 판정이 옳다 |
| 게이트 | **전부 통과** (백엔드 71/1117, 권한 167/167, 프론트 74/1237, CI 빌드 성공, 번들 예산 432KB/950KB) |

---
---

# rev2 재검증 (2026-08-12, 최종)

rev1 지적(F-1) + Codex 리뷰 중요 3건 반영분에 대한 **좁은 재검증**. 대상은 `FIX_STAGE3_{BACKEND,FRONTEND,BUNDLE}.md` 의 rev2 섹션과 워킹 트리 전체.

## 게이트 재실행 — 전부 통과

| 게이트 | rev1 | **rev2** |
|---|---|---|
| 루트 `npm test` | 71 / 1,117 | **71 suites / 1,121 tests 통과** (+4 = A-4 신규 케이스) |
| `cd static/ui && npx jest` | 74 / 1,237 | **75 suites / 1,251 tests 통과** (+1 suite / +14 = `commentLoadState.test.js`) |
| `CI=true npm run build` | 성공 | **성공** |
| `bundle:check` | 432,478 B | **432,906 B** / 950,000 B → `withinBudget: true` (**+428 B**, rev2 문서 기재치와 일치) |
| main 유출 재검증 | 0 | **소스맵 sources 1,311개 중 leaked 0** — `mdxeditor`·`lexical`·`marklassian`·`fc-daygrid`·`Asia/Seoul` 문자열 0건. `adf-to-md` 문자열 1건은 **우리 코드의 에러 메시지**(`convertAdfComment` 의 `'adf-to-md returned no markdown result'`)이며 라이브러리 코드가 아니다 |

---

## R-1 [A-4 rev2] 통과 — F-1 해소, 권고한 하이브리드와 일치하고 B² 부활 없음

`src/queue/consumer.js:232-342`.

**① 내 권고와의 일치**: 스캔(`findByWherePaged`) → `doneByKey` Map 구성(`:277-283`) → **결정적 키 `${appJobId}-batch-${i}` 로 누락분 재구성**(`:285-290`) → 상한 이내면 `findById`(strict `get`) 확인(`:296-305`). 03 리포트 F-1 의 수정안과 구조가 같고, **판정을 부른 배치 자신이 strict get 으로 흡수**되므로 read-your-own-write 가 정확히 복구된다. strict 확인에서 `!done` 이면 `return`(`:302`) — 보수 방향 유지.

**② 상한 로직이 초반 판정에서 strict 확인을 정말 건너뛰는가 — 검증됨.**
`:293` 의 `if (missing.length > STRICT_CONFIRM_MAX) return;` 가 strict 블록 **앞**에 있다. 완료 수 `k` 일 때 `missing = total-k` 이므로 strict get 은 `k >= total-10` 인 **종반 11회에서만** 발생하고, 그 총합은 `10+9+…+0 = 55 = STRICT_CONFIRM_MAX×(STRICT_CONFIRM_MAX+1)/2` 로 **상수 상한**이다(문서 주석의 계산과 일치). 초반 판정은 스캔 1페이지 후 즉시 return → **fan-in(B²) 부활 없음**.
B=30 실측 대조: 스캔 30 + 배치 중복가드 findById 30 + strict 55 = 115 (종전 fan-in 930).

**③ 집계 안전성**: `:308` 의 `Array.from({length: total}, (_, i) => doneByKey.get(batchKey(i)))` 는 위 두 경로가 0..total-1 전부를 채운 뒤에만 도달하므로 `undefined` 원소가 생길 수 없다(`missing` 이 정확히 "Map 에 없는 키" 집합이고 각각 set 된다). 스캔이 페이지 경계 중복이나 `slice(0,maxItems)` 로 레코드를 흘려도 **strict 경로가 자가 복구**한다.

**④ 신규 테스트 4케이스가 마지막 배치 read-your-own-write 를 실제로 고정하는가 — 그렇다.**
`JobCompletion.test.js:17` 의 `mockIndexLagKeys` 를 `findByWherePaged` mock 이 필터링(`:29`)하고 `findById` mock 은 필터하지 않아(`:25`) **"인덱스엔 없지만 get 으로는 보이는"** 최종 일관성 상태를 정확히 재현한다.

| 케이스 | 고정하는 것 |
|---|---|
| `:218` 마지막 배치가 인덱스에 아직 안 보여도 strict get 으로 완결 | **F-1 그 자체** — 지연된 레코드의 `processedCount` 까지 정확히 합산됨을 함께 검증 |
| `:229` 전 배치가 지연돼도(임계 이내) 완결 | 최악 지연에서도 정체 없음 |
| `:239` 스캔·get 모두 미존재면 RUNNING 유지 | 오탐 방지 + `findById` 가 **실제로 호출됐음**을 assert |
| `:247` 지연 1건 + 진짜 미도착 1건이 섞이면 완결하지 않음 | 지연과 미완료의 구분 |

추가로 `:184` 의 B=30 케이스가 `pages === 30` / `gets <= 85` 로 **상한 로직을 경계값에서 정확히 고정**한다(strict 가 매 판정마다 돌면 gets 약 465 로 즉시 실패).

**⑤ 두 호출 경로 재확인**: 큐 동시성은 업로드 `concurrencyLimit: 3`(`UserService.js:614`), 백필 `2`(`SubscriptionBackfill.js:171`) — 문서 주석의 근거와 일치하며 `STRICT_CONFIRM_MAX=10` 은 넉넉한 여유다. 백필의 stale 폐기 경로(`consumer.js:167-169`)도 같은 키 형식이라 재구성이 유효하다.

## R-2 [간트 rev2] 통과 — 필드 단위 롤백 3훅 적용, 경합 해소

| 훅 | 스냅샷 | 롤백 | 대상 매칭 |
|---|---|---|---|
| `useUpdateAssignee` | `:476-480` `snapshotFields(…, matchByKey(issueKey), ['assignee'])` | `:501-506` `patchTask(old, issueKey, ctx.prev)` | key/id |
| `useUpdateCoworkers` | `:556-560` `(tk)=>tk.issueId===issueId, ['coworkers']` | `:573-578` `patchTaskByIssueId` | issueId (write 계약과 동일 축) |
| `useUpdatePlannedMd` | `:637-641` `['originalEstimateSeconds','progress']` | `:665-670` `patchTask` | key/id |

**경합 해소 확인**: 종전은 `getQueryData` 전체 스냅샷을 통째로 복원해, 셀 A 실패의 늦은 `onError` 가 그 사이 성공한 셀 B 의 값까지 되돌렸다(invalidate 를 걷어낸 뒤로는 다음 자연 재조회까지 오염 잔존). rev2 는 **대상 task 의 지정 필드만** 되돌리므로 다른 task·다른 필드가 보존된다. `found:false`(대상 부재)면 롤백 자체를 건너뛰어(`:501`,`:573`,`:665`) 없는 task 를 만들어내지 않는다 — `onMutate` 의 패치도 같은 조건에서 no-op 이라 대칭이다.

**`computeProgressLocal` ↔ 서버 산식 직접 대조 — 동일**

| | 서버 `GanttMapper.js:65-76` | 프론트 `useGanttMutations.js:85-92` |
|---|---|---|
| done | `if (statusKey === 'done') return 1;` | 동일 |
| 계산 | `orig != null && orig > 0 && spent != null` → `Math.round(Math.min(spent/orig,1)*100)/100` | **문자 그대로 동일** |
| 그 외 | `null` | `null` |
| statusKey 출처 | `f.statusCategory ?? f.status?.statusCategory` → `.key` (`:97-98`) | `task.statusKey` = 위 값이 그대로 실린 필드 |

즉 산식뿐 아니라 **입력의 의미까지 일치**한다(`statusKey` 가 상태명이 아니라 statusCategory key 임을 확인 — 아니었다면 done 이슈가 1 을 못 받았다). `progress` 는 orig 를 분모로 쓰므로 계획 MD 편집 시 함께 갱신하는 것이 옳고, `spent` 는 `mutationFn` 이 이미 발행하는 **단건 GET**(`getIssue?fields=timetracking`, search 아님 → 인덱스 지연 무관)에서 재사용해 **추가 호출 0**이다.

**mutationFn 반환 shape 변경(`result` → `{timeSpentSeconds}`) 소비처 — 무영향.**
`mutateAsync` 사용처가 앱 전역에 없고(grep), 호출부 5곳 전부 `.mutate(...)` 다(`GanttPage.jsx:269,274,278`, `ProjectTreeView.jsx:261,413`). 반환값을 읽는 곳은 같은 훅의 `onSuccess`(`:648-660`) 뿐이다.

## R-3 [워크로그 rev2] 통과 — 데이터 손실 경로가 구조적으로 차단됨

**3중 가드가 실제로 유일 경로를 막는가 — 그렇다.**

| 층 | 위치 | 막는 것 |
|---|---|---|
| ① 제출 가드 | `WorklogModal.jsx:281-289` `if (!canSubmitWorklog(commentLoad))` | 폼 Enter 등 버튼 외 제출 경로 |
| ② 버튼 비활성 | `:468-474` `isDisabled={!canSubmitWorklog(commentLoad)}` | 일반 클릭 |
| ③ **조립 차단** | `:355-366` `buildComment()` 가 상태 미충족 시 **throw** | 위 둘을 우회한 모든 호출 |

`buildComment` 가 저장 `comment` 를 만드는 **유일한 경로**임을 grep 으로 확인했다 — `WorklogModal.jsx` 의 `comment:` 조립 지점은 `:372`(addWorklog) / `:383`(updateWorklog) / `:393`(addWorklogRange) **세 곳뿐이고 전부 `buildComment()` 를 경유**한다. `markdownToAdf` 직접 호출은 파일에서 사라졌고, 앱 전역 grep 에서도 워크로그 `comment` 를 write 로 조립하는 다른 코드가 없다(myPage 히트 3건은 전부 **읽기/표시**용). throw 는 `onSubmit` 의 try/catch(`:307-334`)가 받아 `worklog.error.saveFailed` 로 표면화 — unhandled rejection 없음.

`convertAdfComment`(`commentLoadState.js:46-52`)가 종전 `|| ''` 를 **throw** 로 바꿔 "실패를 빈 문자열로 삼키는" 원인을 제거했고, `canSubmitWorklog` 는 **화이트리스트**(NONE/READY)라 새 상태가 생겨도 기본이 차단이다. 신규 테스트 14케이스가 이 계약을 고정한다(`__test__/commentLoadState.test.js`).

**무영향 확인**
- **신규 등록**: 코멘트가 없으면 `initialCommentLoad(undefined) === NONE` → 저장 즉시 가능, 에디터도 스켈레톤 없이 바로 렌더(`:698-717` 의 삼항에서 NONE 은 `LazyMarkdownEditor` 분기). 회귀 없음.
- **삭제**: `onDelete`(`:336-352`)는 `comment` 를 다루지 않고 `commentLoad` 게이팅도 받지 않는다 — 본문을 못 읽어도 삭제는 가능하다(의도대로).
- **i18n**: `worklog.error.commentLoading` / `commentLoadFailed` **2키**를 `locales/kr/worklog.json`·`locales/en/worklog.json` 양쪽에 추가하고 merge 반영 확인(`ko-KR.json`·`en-US.json` 에서 값 조회 성공). `ko-KR/en-US` 직접 수정 아님(merge 산출물). `common.button.retry`·`common.loading` 은 기존 키 재사용.

---

## 실패 — F-2 [워크로그 rev2·신규] 변환기 로드 실패 시 **재시도 버튼이 영구히 동작하지 않는다**

- **생산자**: `static/ui/src/pages/myWork/modal/WorklogModal.jsx:51-56` (`loadAdfToMd`) — 실패해도 캐시를 비우지 않는다

```js
let adfToMdPromise = null;
const loadAdfToMd = () => {
    if (!adfToMdPromise) {
        adfToMdPromise = import('adf-to-md');   // <- reject 돼도 이 값이 그대로 남는다
    }
    return adfToMdPromise;
};
```

- **소비자**: `:136-155` 의 effect(`.catch(() => setCommentLoad(FAILED))`) + `:706-712` 의 재시도 버튼(`setCommentReloadKey(k => k+1)`)

**불일치 내용.** 청크 로드가 실패하면 `adfToMdPromise` 에 **rejected promise 가 박제**된다. 재시도 버튼은 `commentReloadKey` 를 올려 effect 를 다시 돌리지만(`:155` deps), `loadAdfToMd()` 가 **같은 rejected promise 를 즉시 돌려주므로** 네트워크를 다시 시도하지 않고 곧바로 `.catch` → `FAILED` 로 되돌아온다. 모듈 스코프 캐시라 **모달을 닫았다 다시 열어도 동일**하다 → 페이지를 새로고침하기 전까지 그 워크로그는 편집 불가 상태로 고착된다.

즉 rev2 가 새로 제공한 **복구 수단이 무력**하다. (데이터 손실 차단이라는 주 목적은 유지되므로 심각도는 중간이다. 다만 사용자에게 "다시 시도"를 제시하고 그것이 절대 성공하지 않는 것은 그대로 두기 어렵다.)
`loadMarkdownToAdf`(`:41-46`)도 같은 구조라, 저장용 변환기가 한 번 실패하면 이후 모든 저장이 같은 rejected promise 로 실패한다.

**수정 방법.** 두 로더 모두 **실패 시 캐시를 해제**한다(성공 캐시는 유지 — webpack 5 는 실패한 청크 기록을 지우므로 재요청이 실제로 나간다).

```js
const loadAdfToMd = () => {
    if (!adfToMdPromise) {
        adfToMdPromise = import('adf-to-md').catch(e => { adfToMdPromise = null; throw e; });
    }
    return adfToMdPromise;
};
// loadMarkdownToAdf 도 동일하게 (import('marklassian').then(m => m.markdownToAdf) 뒤에 같은 catch)
```

> 참고: 변환 자체가 실패한 경우(`convertAdfComment` throw)는 입력이 같으니 재시도해도 결정적으로 다시 실패한다 — 재시도가 의미를 갖는 것은 **일시적 청크 로드 실패**뿐이고, 지금은 그 경우가 캐시에 막혀 있다.

**담당**: frontend.

---

## 관찰 (rev2 추가)

- **O-6** `checkJobCompletion` 이 배치 키 형식 `${appJobId}-batch-${i}` 에 **의존**하게 됐다(`consumer.js:285`). 현재 두 생산자 모두 이 형식이 맞지만(`UserService.js:596`, `SubscriptionBackfill.js:146`), 백필의 `batchId` 생성이 바뀌면 **완료 판정이 조용히 영구 정체**된다(strict get 이 null → RUNNING). rev1 이전 원본 코드도 같은 가정이었으므로 새 결합은 아니나, 생산자 쪽에 계약 테스트 1건을 두거나 `batchIndex` 만으로 키를 만들도록 통일해 고정할 것을 권한다.
- **O-7** `STRICT_CONFIRM_MAX = 10` 잔여 위험: 인덱스에 안 보이는 레코드가 **동시에 10건을 넘으면** 여전히 정체된다. 큐 동시성이 3/2 라 실질 여유가 크고, 넘어서면 다음 재시도·이벤트가 없다는 점은 rev1 과 동일한 한계다. 배포 후 대량 업로드 1회로 실측 권장(U-4 와 동일 항목).
- rev1 의 O-1~O-5 는 **모두 그대로 유효**하다(무한 루프 상한 부재, admin 실패 시 버려지는 SQL, 탭 테스트의 `{true && …}` 상수, `TreeDetailPanel.jsx:218` 선행 결함, `JobService.js:67` 선행 결함).

## 미검증 (rev2 기준 갱신)

| # | 항목 | 상태 |
|---|---|---|
| U-1 | `findByWherePaged` 의 실제 커서 페이징 경로 | **여전히 미검증** — 테스트가 이 함수를 통째로 mock 한다. 단, rev2 의 strict 확인 패스가 스캔 누락을 자가 복구하므로 **위험도는 낮아졌다** |
| U-2 | 동시 배치 완료 경합 | **여전히 미검증**(테스트는 순차 await). 두 판정이 같은 값을 같은 키에 쓰므로 멱등이라는 분석은 유지 |
| U-3 | 스캔 예외 실패 경로 | 미검증. rev2 에서도 마지막 배치의 스캔 예외는 정체로 이어진다(예외는 strict 패스에 도달하지 못하고 `:271` 에서 return) |
| U-4 | 실 KVS 인덱스 지연 실측 | 미검증 — 배포 후 대량 업로드 1회 필요 |
| U-5 | E2E | 미검증. rev2 로 **추가된 경로**도 확인 대상: 기존 코멘트 있는 워크로그 열기(스켈레톤→본문), 계획 MD 편집 후 막대 % 갱신, 셀 A 실패 중 셀 B 성공 시 B 값 보존 |

---

## 최종 판정

| 항목 | rev1 | **rev2 최종** |
|---|---|---|
| A-4 정확성 | 실패(F-1) | **통과** — 권고 하이브리드와 일치, B² 부활 없음(경계값 테스트로 고정), 신규 4케이스가 read-your-own-write 를 실제 재현 |
| A-6 판정 동등성 | 통과 | **통과**(rev2 무변경, `test/permission` 계속 전량 통과) |
| P1-5 간트 | 통과 | **통과** — 필드 단위 롤백 3훅 적용·경합 해소, `computeProgressLocal` 이 서버 산식·입력 모두 동일, 반환 shape 변경 소비처 무영향 |
| P1-1 번들 | 통과 | **통과** — main 유출 0 유지(소스맵 1,311 중 0), +428 B, 예산 내 |
| P1-2 오탐 판정 | 통과 | **통과**(무변경) |
| 워크로그 데이터 손실 차단 | — | **통과** — `buildComment` 단일 경로 + 3중 가드, 신규·삭제 무영향, i18n 2키 반영 |
| 워크로그 재시도 복구 | — | **실패(F-2)** — 모듈 promise 캐시가 실패를 박제해 재시도가 영구 무효 |
| 게이트 | 통과 | **전부 통과** (백엔드 71/1,121, 프론트 75/1,251, CI 빌드 성공, 번들 432,906/950,000) |

**종합: 조건부 통과.** rev1 의 치명 결함(F-1)은 해소됐고 간트·번들·워크로그 손실 차단은 전부 통과다. 남은 것은 **F-2 1건**(로더 2개에 `catch` 로 캐시 해제 — 각 1줄)이며, 이것만 반영하면 Stage 3 는 통과로 전환된다.
