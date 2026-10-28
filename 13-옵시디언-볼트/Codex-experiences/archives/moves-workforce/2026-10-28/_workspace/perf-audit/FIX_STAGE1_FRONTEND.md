# 성능 감사 1단계 프론트 수정 — P1-7 / P1-9

대상: `FRONTEND_2026-08-12.md` 의 **P1-7, P1-9 두 건만**. 다른 항목은 손대지 않았다.

## P1-7. 업로드 job 폴링이 백그라운드 탭에서도 지속

| 파일 | 변경 |
|------|------|
| `static/ui/src/polling/jobPolling.js:31-38` | `isDocumentHidden()` 추가 (`typeof document !== 'undefined' && document.hidden === true`) |
| `static/ui/src/polling/JobPollingManager.jsx:20` | `pollJobRef` 추가 — interval·visibilitychange 가 항상 최신 렌더의 poll 본문을 보게 한다 |
| `static/ui/src/polling/JobPollingManager.jsx:48-58` | `visibilitychange` 리스너: 탭 복귀 시 추적 중인 job 전부를 **즉시 1회** 폴링. 키는 스냅샷(`[...keys()]`) 후 순회 — `pollJob` 이 `stopPolling` 으로 Map 을 지울 수 있다 |
| `static/ui/src/polling/JobPollingManager.jsx:60-118` | 기존 interval 본문을 `pollJob(jobId)` 로 추출(로직 무변경, 들여쓰기만 정리) |
| `static/ui/src/polling/JobPollingManager.jsx:124-136` | interval 은 `if (isDocumentHidden()) return;` 후 `pollJobRef.current?.(jobId)` 만 호출 |

불변으로 둔 것: `POLL_INTERVAL_MS=3000`, backoff(`getPollingRetryDelay`)·`MAX_CONSECUTIVE_POLL_FAILURES`,
`isTerminalJob` 완료 판정, `inFlightRef`/`nextPollAtRef` 가드, job 추적(`useJobStore`), 언마운트 정리.

- **숨김 중 완료 job 누락 방지**: 복귀 즉시 1회 폴링이 그 보장이다. 그 1회도 `nextPollAtRef` backoff 는 존중한다(실패 상태에서 backoff 를 깨지 않기 위해). 숨김 가드는 interval 틱에만 두어 복귀 폴링을 막지 않는다.
- 감사가 함께 제안한 "경과 시간별 간격 상향·N회 후 포기"는 폴링 주기 변경이라 지시 범위 밖 → 미적용.

## P1-9. `/myWork` 같은 resolver 2회 호출

| 파일 | 변경 |
|------|------|
| `static/ui/src/pages/myWork/utils/useMyWorklogList.js:7,30` | 옵션 `enabled = true` 추가 → 기존 `enabled` 조건과 AND. 기본값이라 다른 호출부(`MyIssueTable.jsx:29`) 동작은 불변 |
| `static/ui/src/pages/myWork/utils/useMyWorklogSummary.js:3-42` | `clipWorklogsToRange(myWorklogs, startDate, endDate)` 추가 — 워크로그를 날짜 범위(inclusive)로 잘라 낸 동일 shape 반환 |
| `static/ui/src/pages/myWork/WorklogPage.jsx:118-152` | 요약을 캘린더 쿼리 결과에서 파생. 커버 못 할 때만 요약 전용 쿼리 `enabled` |

동작:

```
calendarCoversSummary = startDate <= 이번달1일 && endDate >= 이번달말일   // 'YYYY-MM-DD' 사전순 = 날짜순
  true  → 요약 전용 쿼리 disabled, summary = useMyWorklogSummary(clip(캘린더결과, 이번달))  → invoke 1회
  false → 종전대로 요약 전용 쿼리 enabled                                    → invoke 2회(기존과 동일)
```

### 엣지 케이스 판정

두 범위를 실제로 대조한 결과:

| 상황 | 캘린더 범위 | 판정 |
|------|-------------|------|
| 기본 진입(`initialView='dayGridMonth'`, `FullCalendar.jsx:47`) | 이번 달을 포함하는 6주 그리드(`datesSet` 의 activeStart~activeEnd, end 는 exclusive라 오히려 더 넓다) | **커버 → 파생, invoke 1회** |
| 캘린더를 이전/다음 달로 이동 | 이번 달을 벗어남 | 커버 실패 → 요약 전용 쿼리 유지 |
| `dayGridWeek` 로 전환(headerToolbar 에 존재, `FullCalendar.jsx:71`) | 1주 | 커버 실패 → 요약 전용 쿼리 유지 |
| 최초 렌더(`dateRange` 초기값 = 오늘~오늘) | 1일 | 커버 실패지만 **두 쿼리 모두 `selectedProjectIds.length > 0` 이 필요**하고 프로젝트 목록 로드는 `datesSet` 보다 늦으므로 그 상태로 발사되지 않는다 |
| 표 뷰(`viewMode='table'`) | 마지막 캘린더 범위 유지 | 커버 여부에 따라 위와 동일. 표 데이터는 별도 훅(`mine:false`)이라 무관 |

**월 경계 주(週) 처리 — 표시 값 보존의 핵심.** `useMyWorklogSummary` 의 주간 합계는 월요일 시작이라
이번 주가 지난달에 걸칠 수 있다. 종전 요약 쿼리는 서버(`MyWorkService.processMyIssue` → `isInRange`)가
**이번 달 범위로 워크로그를 이미 걸러** 줬으므로 그 지난달 며칠은 합계에 없었다.
캘린더 결과(6주)를 그대로 넘기면 그 며칠이 더해져 **주간 합계가 종전보다 커진다**.
→ `clipWorklogsToRange` 로 요약 범위를 똑같이 적용해 표시 값을 종전과 일치시켰다.
(종전의 월 경계 주 과소 집계는 성능 수정 범위 밖이라 그대로 보존했다. 별도 판단 필요.)

필터 조건 동일성: author 는 캘린더 쿼리도 `mine:true`(같은 `getMyCalendarWorklog`, 서버가
`author.accountId === accountId` 필터), 프로젝트 선택은 양쪽 다 `normalizedProjectIds` — 그대로다.
파생은 `useMemo`(`WorklogPage.jsx:144-150`).

## 검증

- `cd static/ui && npm test` → **71 suites / 1218 tests 전부 통과** (스냅샷 1 통과)
- `cd static/ui && CI=true npm run build` → **성공**, `bundle:check` `withinBudget: true`
  (`main.js` gzip 898,643 B / 예산 950,000 B)
- i18n 키 추가 없음 → `npm run merge` 불필요(빌드 prebuild 가 실행하긴 함)

## 변경 파일 (이 작업분)

```
static/ui/src/polling/jobPolling.js
static/ui/src/polling/JobPollingManager.jsx
static/ui/src/pages/myWork/WorklogPage.jsx
static/ui/src/pages/myWork/utils/useMyWorklogList.js
static/ui/src/pages/myWork/utils/useMyWorklogSummary.js
```

> `git status` 에 보이는 `src/**`(`MyWorkService.jsx`, `WorklogService.js`, `ProjectDashboard.js`)·`.gitignore`
> 수정은 **이 작업분이 아니다**(동시 진행 중인 백엔드 수정). 확인만 하고 건드리지 않았다.
