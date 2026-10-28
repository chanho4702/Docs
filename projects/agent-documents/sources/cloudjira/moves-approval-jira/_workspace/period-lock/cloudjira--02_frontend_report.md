# period-lock 프론트 보고서 (Phase 4)

> 작성: frontend-engineer · 2026-10-03 · autopilot 무인 회차 · 회차 1(초판)
> 입력: `01_architect_design.md` §2·§7·§8·§11.2, **`02_backend_report.md`(실제 shape 우선)**, `_workspace/timesheet-approval/03_verify_report.md` R1·R3, `QUESTIONS.md` Q16~Q28(미회신 → 기본 가정)
> 범위: `static/ui/**`, `locales/{kr,en}/**`. **백엔드 `src/**`·`manifest.yml` 무변경.** forge 명령 0회, git 인덱스 조작 0회, 리포 밖 수정 0.

## 검증 결과

```
node locales/script/merge.js       → locales\ko-KR.json, en-US.json 생성(성공 — kr·en 키 집합 동일)
npm run test:ui -- --runInBand     → Test Suites: 17 passed, 17 total / Tests: 140 passed, 140 total
                                     (기준선 12 / 86 → +5 suites, +54 tests)
npm run build:ui                   → exit 0, Compiled with warnings — 전부 node_modules(기준선과 같은 3건:
                                     @atlaskit source map ENOENT 2, @atlaskit/react-select postcss-calc 1). 우리 소스 ESLint 경고 0.
                                     산출 html: inbox / modal / settings / projectSettings / **worklog** (5)
                                     worklog 초기 로드(gzip): 1310(70.8kB, 공유 react 등) + 1571(10.4kB) + worklog(8.9kB) ≈ 90kB.
                                     탭·대화상자는 lazy 청크(importWithReloadOnce) — 탭 첫 로드에 날짜 선택기를 싣지 않는다.
npm test -- --runInBand (백엔드)    → Test Suites: 46 passed, 46 total / Tests: 529 passed, 529 total (유지)
```

빌드 로그 원문: `_workspace/period-lock/tmp/build_ui.log`. 명시적 번들 예산 수치는 리포에 없다(CRA 크기 표만) — 기존 엔트리 증가: settings +11.7kB, inbox +24kB(직전 build 폴더 대비 — 그 폴더가 timesheet 회차 이전 산출물일 수 있어 순증가분은 이보다 작을 수 있다), modal −4.4kB.

정적 대조(`_workspace/period-lock/tmp/check_keys.js`, timesheet 회차 스크립트 확장):
- `static/ui/src` 리터럴 번역 키 전부 ko-KR·en-US 에 있음(누락 0).
- `error.json`(kr·en) 키 집합 = `ErrorCodes` 값 집합 정확히 일치(신규 9 포함).
- 동적 조립 키 묶음(`worklog.lock.reason.*`, `worklog.invalid.*`, `policy.audit.area.periodClose/timesheetTeam`, `policy.audit.action.close/reopen/autoClose`, `timesheet.periodClose.state.*`, `state.expiry.CONTENT_CHANGED`) 누락 0.
- 인라인 쿼리키 신규 0(기존 `DataSettings.jsx:127` 1건은 이번 변경 아님). `100vh` 신규 0.

## 엔트리 `worklog` — 3곳

| 곳 | 상태 |
|---|---|
| `static/ui/craco.config.js` `ENTRIES.worklog = 'entries/worklog.jsx'` | **추가** |
| `static/ui/public/worklog.html` | **추가**(modal.html 복제, title 만) |
| `manifest.yml` `resources[main].entry.worklog: worklog.html` + `jira:issueAction`·`jira:issueActivity` `resource: main/worklog` | 백엔드가 추가 — 확인만 |

`entries/worklog.jsx` 는 `resolveWorklogView(context)`(순수, 테스트)로 분기한다: 우리 Modal 컨텍스트(`mode`)가 있으면 대화상자(탭이 연 Modal 은 `extension.type` 이 탭 값으로 올 수 있어 먼저 본다) → `jira:issueAction` 이면 생성 대화상자 → 그 밖은 탭. Modal 값 위치는 `entries/modal.jsx` 와 같은 후보 순서.

## 변경 파일

**신규**
- `static/ui/src/entries/worklog.jsx`
- `static/ui/public/worklog.html`
- `static/ui/src/features/worklog/`
  - `WorklogTab.jsx` — 작업 로그 탭(CursorPagingTable "더 보기", 남의 것도 표시·버튼은 서버 `canEdit/canDelete`만, 잠금 배지, 공개 범위 제한 표시, 1000건 초과 안내, 새로고침, Log work 버튼(`permissions.canLog`), 수정은 Forge `Modal`(`main/worklog`, `{mode:'edit', issueId, issueKey, worklogId}`), 삭제는 확인 후 `deleteWorklog`)
  - `WorklogDialog.jsx` — 생성·수정 공용(소요 시간 텍스트, DatePicker+TimePicker, 설명 ≤4000, 기간 표시, `lockRanges` 사전 판정으로 저장 비활성 + 사유, 서버 에러 `cause` 표시, 수정 시 "비우면 기존 설명 유지" 안내(Q28), 공개 범위 제한 유지 안내)
  - `DeleteConfirm.jsx`, `LockBadge.jsx`
  - 순수: `durationInput.js`(`'1w 2d 3h 4m'`↔초, 1d=8h·1w=5d, 단위 없으면 분, 분 반올림), `lockPrecheck.js`(반열림, started → previousStarted 순), `worklogTime.js`(로컬 날짜·시각↔epoch, 정책 타임존 기간 키, started 표시), `worklogContext.js`, `lockText.js`(사유·에러 문장)
  - 테스트 `__test__/worklogPure.test.js`, `WorklogTab.test.jsx`, `WorklogDialog.test.jsx`
- `static/ui/src/features/settings/PeriodCloseSettings.jsx`(+ 순수 `periodCloseModel.js`), `TimeTrackingProviderGuide.jsx`, 테스트 `__test__/PeriodCloseSettings.test.jsx`
- `static/ui/src/features/timesheet/CloseBadge.jsx`, 테스트 `__test__/RejectAndSnapshot.test.jsx`
- `locales/{kr,en}/worklog.json`

**수정**
- `static/ui/craco.config.js` — ENTRIES
- `utils/queryKey/approvalKeys.js` — `worklogKeys{all, issue(issueId), editor(issueId, worklogId)}`, `settingsKeys.periodClosesAll()`·`periodCloses(count)`
- `features/settings/TimesheetSettings.jsx` — 정책 → 제공자 안내 → 기간 마감 → 팀
- `features/settings/TimesheetPolicySettings.jsx` — 정책 2키(`timesheetAutoCloseDays` 0..90, `timesheetLockSubmitted`), 저장 후 마감 목록 무효화
- `features/settings/AuditSettings.jsx` — 영역 색 `timesheetTeam`·`periodClose`
- `features/timesheet/MyTimesheetPage.jsx` — 마감 배지, 마감 후 변경 배너, 잠금 안내
- `features/timesheet/PeriodPicker.jsx` — 목록 항목에 `periods[].closed` 이면 "마감됨"
- `features/timesheet/TeamTimesheetPage.jsx` — 헤더 마감 배지, 요약 줄에 `summary.closeDrift`
- `features/timesheet/TeamMatrixTable.jsx` — 상태 칸에 `closeDriftAt` 배지(시각은 툴팁)
- `features/timesheet/exportTeamTimesheetExcel.js` — "마감 후 변경" 열
- `features/timesheet/timesheetFormat.js` — `isoWeekKeyOf` export(기간 키 계산 재사용)
- `features/timesheet/RejectDialog.jsx` — **R1**: 빈 사유면 버튼 비활성 + `error.REJECTION_REASON_REQUIRED` 안내
- `features/timesheet/TimesheetSnapshotSection.jsx`, `features/detail/ApprovalDetail.jsx` — **R3**: `requestStatus` 를 받아 EXPIRED 면 제목 `state.expiry.CONTENT_CHANGED`·본문 `timesheet.detail.driftPending`
- `features/timesheet/__test__/MyTimesheetPage.test.jsx`(+2), `TeamMatrixTable.test.jsx`(+1)
- `locales/{kr,en}/timesheet.json`·`policy.json`·`error.json`

## 소비 resolver ↔ 읽는 응답 경로 (`invokeApproval` 이 `content` 를 벗긴 값 기준)

| 화면 | resolver · 보내는 payload | 읽는 경로 |
|---|---|---|
| WorklogTab | `getIssueWorklogs({issueId, offset})` (첫 쪽 `offset:0`) | `worklogs[].{worklogId, authorDisplayName, authorAvatarUrl, started, timeSpentSeconds, comment, visibilityRestricted, lock.{locked,reasonCode,periodKey}, canEdit, canDelete}`, `nextOffset`(정수면 다음 쪽), `truncated`, `timeZone`, `permissions.canLog` |
| WorklogTab 삭제 | `deleteWorklog({issueId, worklogId})` | 응답 무시, 성공 시 `worklogKeys.all` 무효화 |
| WorklogDialog 열기 | `getWorklogEditorContext({issueId[, worklogId]})` | `issueId`, `timeZone`, `unit`, `now`, `permissions.{canLog, canEditOwn}`, `lockRanges[].{start,end,periodKey,reasonCode}`, `worklog.{worklogId, started, timeSpentSeconds, comment, visibilityRestricted}` — **`issueKey` 는 읽지 않는다**(항상 null, D4) → 확장 컨텍스트 `extension.issue.key` |
| WorklogDialog 저장 | `createWorklog({issueId, started, timeSpentSeconds, comment})` / `updateWorklog({…, worklogId})` | `worklog.worklogId` 만(`view.close` 페이로드) |
| 설정 > 기간 마감 | `listPeriodCloses({count:12[, beforePeriodKey]})` | `items[].{periodKey, start, end, ended, state, closed, auto, closedAt, closedByDisplayName, closedBy, reopenedAt, reopenedByDisplayName, reopenedBy, autoCloseAt, rev, closeDriftCount}`, `nextBeforePeriodKey`, `timeZone`, `autoCloseDays` |
| 설정 > 기간 마감 | `closePeriod({periodKey, rev})` / `reopenPeriod({periodKey, rev})` — `rev` 는 행 값 그대로, 없으면 `null` | 응답 `item` 은 쓰지 않고 목록 재조회(+감사·타임시트 키 무효화) |
| 설정 > 타임시트 정책 | `get/saveApprovalSettings` | + `timesheetAutoCloseDays`, `timesheetLockSubmitted` (patch 로 2키 추가 전송) |
| 내 타임시트 | `getMyTimesheet` | + `close.{closed, auto, autoCloseAt}`, `closeDrift.{detectedAt, kind}`, `lock.{locked, reasonCode}`, `periods[].closed` |
| 팀 타임시트 | `getTeamTimesheetMatrix` | + `close`, `rows[].closeDriftAt`, `summary.closeDrift` |
| 상세 모달 스냅샷 | `getTimesheetDetail` (무변경) | `drift` + 부모의 `approval.status`(R3) |

`nextBeforePeriodKey` 가 항상 문자열(D1)이라 "더 보기"는 **마지막 쪽 `items` 가 비었을 때만** 숨긴다(`periodCloseModel.nextPeriodClosePage`). 현재 백엔드는 count 개를 항상 채우므로 사실상 끝이 없다 — Q27.

## 에러 코드 처리 (분기는 `error.code` 만)

| 코드 | 화면 | 처리 |
|---|---|---|
| `WORKLOG_PERIOD_LOCKED` | 대화상자 저장·탭 삭제 | `cause.reasonCode`→`worklog.lock.reason.<code>`({period}=`cause.periodKey`), `which:'previousStarted'` 면 `worklog.lock.movedFrom` 덧붙임. cause 없으면 `error.WORKLOG_PERIOD_LOCKED`. 대화상자는 컨텍스트 재조회(잠금 구간 갱신), 탭은 목록 재조회 |
| `WORKLOG_INVALID_INPUT` | 대화상자 | `cause.field`(started·timeSpentSeconds·comment) 칸 아래 `worklog.invalid.<field>`, 상단 에러 상자 없음 |
| `WORKLOG_REJECTED_BY_JIRA` | 대화상자·탭 | `error.WORKLOG_REJECTED_BY_JIRA` + `cause.fields` 키 이름 괄호 |
| `WORKLOG_NOT_FOUND`·`WORKLOG_NOT_OWNER` | 대화상자 열기(에러 화면)·저장·삭제 | `error.<code>` |
| `WORKLOG_PERMISSION_DENIED`·`PERMISSION_ISSUE_VIEW_DENIED`·`JIRA_API_FAILED`·`INVALID_TARGET` | 탭·대화상자 | `error.<code>`(탭은 새로고침 버튼 동반) |
| `PERIOD_NOT_ENDED`·`PERIOD_ALREADY_CLOSED`·`PERIOD_NOT_CLOSED`·`CONCURRENT_MODIFICATION` | 기간 마감 | `error.<code>` + 목록 재조회(낡은 상태) |
| `STORAGE_NOT_READY`·`TIMESHEET_PERIOD_INVALID` | 기간 마감 | `error.<code>` |

## i18n 추가 키

- 신규 `worklog.json`(kr·en): 설계 §8.1 전부 + `dialog.commentKeepHint`, `dialog.restrictedKept`. `tab.truncated` 문구를 "최근 1,000건"→"1,000건을 넘어 일부만"으로 바꿈(백엔드는 Jira 가 준 첫 1000건을 started 내림차순 정렬 — "최근"이 보장되지 않는다). `dialog.timeSpentHint` 에 "단위 없으면 분" 추가.
- `timesheet.json`: §8.2 `close.*`, `periodClose.*`, `provider.*`, `settings.autoCloseDays/lockSubmitted`, `notice.acceptance` **교체** + `settings.lockSection`, `periodClose.{autoPolicy, autoOff, empty, column.*}`, `detail.driftPending`(R3). `close.driftBody` 에 `{kind}` 추가. `close.lockedHint` 는 PERIOD_CLOSED 전용 문구로 좁힘(제출·승인 잠금은 `worklog.lock.reason.*` 사용).
- `policy.json`: `audit.area.periodClose`, **`audit.area.timesheetTeam`**(설계 §8.2 메모 확인 — kr·en 모두 없었다), `audit.action.close/reopen/autoClose`.
- `error.json`: 신규 9개.

## 설계와의 차이

| # | 설계 | 구현 | 사유 |
|---|---|---|---|
| F1 | `worklogKeys.issue(issueId, offset)` | `issue(issueId)` — offset 은 useInfiniteQuery 페이지 파라미터 | 쪽마다 키가 갈리면 "더 보기" 누적과 무효화가 어긋난다 |
| F2 | `settingsKeys.periodCloses(beforePeriodKey, count)` | `periodClosesAll()` + `periodCloses(count)`, beforePeriodKey 는 페이지 파라미터 | 같은 이유. 정책 저장 후 접두 무효화용 `periodClosesAll` |
| F3 | WorklogTab 표 DynamicTable 재사용 | `CursorPagingTable`(정렬 꺼짐, "더 보기") | 서버 정렬 + offset 쪽 넘김이라 클라이언트 정렬은 오해를 부른다 |
| F4 | `WorklogRow.jsx` 별도 | 행 렌더를 `WorklogTab` 안 `useMemo` 로 | 표 공용 계약(rows 배열)에 맞춤 |
| F5 | 매트릭스 "마감 후 변경" 열 | 상태 칸 안 배지 + 툴팁(엑셀은 별도 열) | 열 폭 재배분 없이 — 대부분 행이 비어 있다 |
| F6 | 대화상자 시작 일시 | 브라우저 시간대 입력, 기간 표시는 정책 타임존 | Q29 |

## 백엔드 요청 (계약 불일치 — 이번엔 프론트에서 우회하지 않음)

- 없음(필수). 참고: `listPeriodCloses` 가 끝을 알려 주지 않아 "더 보기"가 사실상 무한 — Q27 결정 후 백엔드가 하한에서 `nextBeforePeriodKey: null` 을 주면 프론트는 이미 `typeof === 'string'` 으로 판정하므로 수정 없이 멈춘다.

## 미검증 (UI 실측 필요 — `04_spike_todo.md` P28~P33 추가)

P28 issueActivity/issueAction 컨텍스트 `extension.type`·`issue.key`, P29 탭이 연 Modal 의 context 위치·`onClose`, P30 issueAction iframe 안 날짜·시각 선택기 잘림, P31 브라우저 vs 프로필 시간대, P32 저장 후 이슈 화면 시간 추적 필드 갱신, P33 탭 iframe 안 삭제 확인 모달(P9). 백엔드 P15(mypermissions 키)는 대화상자 저장 비활성과 직결 — Q30.

## 열린 질문

| # | 질문 | 선택지 | 기본 가정(구현) | 권장 |
|---|---|---|---|---|
| Q29 | 대화상자 시작 일시 입력 시간대 | 브라우저 / Forge 컨텍스트 `timezone`(Jira 프로필) | 브라우저 | 프로필 시간대(Jira 기본 화면과 같은 기준) — P31 실측 후 |
| Q30 | `permissions.canLog/canEditOwn` 이 false 일 때 대화상자 저장 | 막음 / 안내만 | 막음(설계 §4.4 규칙) | P15 실측 전까지 안내만이 안전 — 키 이름이 틀리면 사이트 전체 입력 불가 |
| Q27(기존) | 마감 목록 과거 하한 | 없음 / 첫 제출 기간 | 없음(빈 쪽이면 더 보기 숨김) | 첫 제출 기간 |
| Q28(기존) | 수정에서 설명 비우기 | 유지 / 지우기 | 유지 + 화면 안내 | 실측 후 지우기 허용 |

QUESTIONS.md 에 Q29·Q30 추가.
