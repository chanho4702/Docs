# worklog-history 프론트 보고서 (Phase 4)

> 작성: frontend-engineer · 2026-10-04 · autopilot 무인 회차 · 재작업 회차 0(최초)
> 입력: `01_architect_design.md`(§2·§7·§8·§11.2), `02_backend_report.md`(실제 shape·D1~D14 우선), 백엔드 실제 코드(`src/resolver/worklogHistory/*`, `src/domain/timesheet/worklogHistory.js` `historyItemOf`·`maskForViewer`·`commentViewOf`, `WorklogHistoryService.parseSearch`, `WorklogHistoryRetentionService`, `SettingsService.listProjects`)
> forge 명령·git 쓰기 없음. **백엔드(src/) 무변경.**

## 검증 결과

| 대상 | 기준선(Phase 3 끝) | 지금 |
|---|---|---|
| `npm run merge` | — | 성공(`ko-KR.json`·`en-US.json` 생성, 두 언어 키 집합 일치) |
| UI `npm run test:ui -- --runInBand` | 27 suites / 203 tests | **31 suites / 240 tests 전부 통과** (+4 suites / +37 tests) |
| 백엔드 `npx jest --runInBand` | 72 / 966 | **72 suites / 966 tests 전부 통과**(무변경 확인) |
| `npm run build:ui` | — | **성공(exit 0)**. "Compiled with warnings" 는 기존과 같은 node_modules 경고뿐(`@atlaskit/analytics-next-stable-react-context` source map 없음, `@atlaskit/react-select` postcss-calc). 엔트리 증가: settings 49.03 kB(+3.21), inbox 46.61 kB(+1.38 — 업무함 안 SettingsPanel), modal 23.25 kB(+2.18), worklog 8.93 kB(-5 B, 탭은 이미 lazy 청크) |

## 엔트리

추가 없음(설계 §7.1). `worklog`(탭)·`modal`(승인 상세)·`settings`(설정) 기존 엔트리 안에서 끝난다 → craco ENTRIES·public html·manifest 세 곳 변경 없음.
감사 검색 화면만 `settings` 엔트리 안에서 `React.lazy` + `importWithReloadOnce` 로 지연 로드(날짜 선택기·검색 Select 를 설정 첫 화면이 받지 않게, 배포 직후 사라진 청크는 1회 reload).

## 구현 파일

신규
- `static/ui/src/features/worklogHistory/historyFormat.js` — 순수 표시 규칙(`fieldsOf`·`commentText`·`valueText`·`changeText`·`personName`·`issueText`·종류 로젠지 색). `formatDuration`(worklog/durationInput)·`formatStarted`(worklog/worklogTime) 재사용
- `.../worklogHistory/HistoryChange.jsx` — 한 필드 "이전 → 이후"/한쪽 값, 설명(가림·빈 설명·잘림 툴팁·원문 펼침)
- `.../worklogHistory/WorklogHistoryList.jsx` — 공용 렌더러(탭 펼침·타임시트 섹션·감사 검색): 종류 로젠지, 출처(SWEEP = 경고색 로젠지 + "중간 변경 누락 가능" 툴팁), 승인 후/제출 후 배지·행 강조, 제한 공개, 행위자(PersonAvatar, null = 알 수 없음), 기준선 안내, 공개 범위 변경
- `.../worklogHistory/WorklogHistoryPanel.jsx` — 탭에서 펼친 워크로그 하나의 `getWorklogHistory`(펼친 동안만 조회) + `historyErrorText`(error.code 분기)
- `.../worklogHistory/TimesheetHistorySection.jsx` — 승인 상세 섹션: 승인 후 변경 N건 요약, hiddenCount·truncated 안내
- `.../worklogHistory/exportWorklogHistoryExcel.js` — 시트 빌더 공용 + `exportAuditHistoryExcel`(limit 200 반복, 10,000행 상한·capped, 뺀 건수 시트 머리) + `exportExpiredHistoryExcel`(끝까지 받고 파일 생성 **뒤에만** confirm)
- `static/ui/src/features/settings/WorklogHistoryAuditSettings.jsx` — 설정 > 워크로그 이력(관리자 감사 검색 + 엑셀)
- `static/ui/src/features/settings/worklogHistoryAuditModel.js` — 순수 입력 모델(기본 최근 30일, `to` 배타 = 종료일 다음 날 0시, 366일 상한)
- `static/ui/src/features/settings/WorklogHistoryRetentionSection.jsx` — 데이터 관리 > 워크로그 이력 보관 + `purgeAllExported`(remaining 0 까지 반복)
- `locales/{kr,en}/worklogHistory.json`
- 테스트: `features/worklogHistory/__test__/{historyFormat.test.js, WorklogHistoryList.test.jsx, worklogHistoryI18n.test.js}`, `features/settings/__test__/WorklogHistorySettings.test.jsx`

변경
- `static/ui/src/utils/queryKey/approvalKeys.js` — `worklogHistoryKeys{all,worklog,timesheet,audit}`, `settingsKeys.worklogHistoryRetention()`(설계 §7.3 그대로)
- `static/ui/src/features/worklog/WorklogTab.jsx` — 행 버튼 "수정 N회"/"이력"/"이력 접기", 표 아래 이력 패널, 상단 "{date}부터 기록" 안내, `refresh` 가 `worklogKeys.all` + `worklogHistoryKeys.all` 함께 무효화(삭제·대화상자 닫힘·새로고침). `historyButtonOf` export
- `static/ui/src/features/timesheet/TimesheetSnapshotSection.jsx` — 요약 아래 `<TimesheetHistorySection requestId timeZone=detail.timeZone/>`(ApprovalDetail 무변경)
- `static/ui/src/features/settings/SettingsPage.jsx` — 탭 `worklogHistory`(audit 다음, `SettingsPanel`·`SettingsPage` 두 목록 모두)
- `static/ui/src/features/settings/DataSettings.jsx` — `RetentionSection` 아래 `WorklogHistoryRetentionSection`
- `static/ui/src/features/settings/TimesheetPolicySettings.jsx` — 정책 키 2(`worklogHistoryEnabled`·`worklogHistoryKeepComment`)를 `TIMESHEET_POLICY_KEYS`·`DEFAULTS`·`toTimesheetPatch` 에 추가, 체크박스 2 + 원문 보관 켤 때 용량 경고
- `static/ui/src/features/worklog/__test__/WorklogTab.test.jsx` — 이력 케이스 5건 추가(기존 5건 무변경)
- `locales/{kr,en}/policy.json`(`settings.tab.worklogHistory`, `audit.action.historyExport/historyPurge`), `locales/{kr,en}/data.json`(`worklogHistory.*`)

## 소비한 resolver·실제 shape (전부 `invokeApproval` 가 벗긴 `content`)

| 화면 | resolver | payload | 소비 경로 | 쿼리키 |
|---|---|---|---|---|
| 작업 로그 탭 | `getIssueWorklogs`(기존) | `{issueId, offset}` | `pages[0].history.{enabled,since}`, `worklogs[].history` = `null`/없음(D12)/`{changeCount,entryCount,lastChangedAt}` | `worklogKeys.issue` |
| 탭 펼침 | `getWorklogHistory` | `{issueId, worklogId}` | `enabled`·`since`·`items[]`·`truncated`·`users` | `worklogHistoryKeys.worklog(issueId, worklogId)` |
| 승인 상세 | `getTimesheetWorklogHistory` | `{requestId}` | `items[]`(afterApproval·afterSubmission·issue)·`hiddenCount`·`truncated`·`afterApprovalCount`·`users` | `worklogHistoryKeys.timesheet(requestId)` |
| 설정 > 워크로그 이력 | `listWorklogHistory` | `{from, to, accountId?, projectId?, kinds?, sources?, limit:50, cursor?}` (엑셀은 `limit:200`) | `items`·`hiddenCount`·`nextCursor`·`users`(쪽마다 병합) | `worklogHistoryKeys.audit(appliedFilters)` (useInfiniteQuery) |
| 설정 > 필터 | `listProjects`(기존) · `searchUsers`(기존) | `{q}` / `q` | `items[].{id,key,name}` / `items[].{accountId,displayName}` | `settingsKeys.projects({q,purpose})` · `userKeys.search('worklogHistory:'+q)` |
| 데이터 관리 | `getWorklogHistoryRetention` | `{}` | `months`·`monthOptions`·`expiredCount`·`oldestChangedAt`·`purgeableCount`·`lastExport.{cutoff,count}` | `settingsKeys.worklogHistoryRetention()` |
| 〃 | `saveApprovalSettings` | `{worklogHistoryRetentionMonths: number}` | 응답 = 전체 정책 → `settingsKeys.policy()` 에 set | 성공 뒤 retention·storage 무효화 |
| 〃 | `exportExpiredWorklogHistory` | `{cursor?, cutoff?}` | `cutoff`·`items`·`users`·`nextCursor`(null 까지) | — |
| 〃 | `confirmWorklogHistoryExport` | `{cutoff, count}` | 응답(HistoryRetentionView)으로 retention 키를 바로 set | 이후 retention·storage 무효화 |
| 〃 | `purgeExportedWorklogHistory` | `{}` | `deleted` 합산, `remaining>0 && deleted>0` 이면 다시 | 이후 retention·storage 무효화 |
| 타임시트 정책 | `getApprovalSettings`·`saveApprovalSettings`(기존) | patch 에 `worklogHistoryEnabled`·`worklogHistoryKeepComment`(boolean) | — | `settingsKeys.policy()` |

계약 차이 반영:
- **D8** 이력 없음 = 빈 뷰 → 펼침은 빈 문구("기록된 변경이 없습니다" / since 있으면 "{date}부터 기록"). 에러로 보지 않는다(테스트).
- **D9** `{changeCount:0, entryCount:0, lastChangedAt:null}` → 버튼 없음. `null` 도 버튼 없음(둘 다 테스트). Q75 대로 `changeCount>0` "수정 N회", 아니고 `entryCount>0` "이력".
- **D10** `since` = 처음 켠 시각(startedAt) — 그대로 표시. 다시 켠 시각은 응답에 없어 표시하지 않음.
- **D11** `head` 는 서버가 표식을 벗겨 주므로 `headTruncated` 일 때 화면이 `…` 를 붙이고 "앞부분만 보관" 툴팁.
- **D12** `history`·`worklogs[].history` 가 아예 없을 수 있음 → `?? null` 로 같은 취급.
- `UPDATED` 는 started·seconds 를 앞뒤 모두 싣지만 표시는 `changed` 비트가 참인 필드만(테스트로 단언). `comment` 는 객체일 때만 그린다.
- 가림(`masked:true`)은 제한 공개·열람 불가 이슈를 구분하지 않으므로 문구를 두 경우를 아우르게 했다(설계 §8.1 문안 "공개 범위가 제한된…"에서 확장).
- 에러 분기(전부 `error.code`): `PERMISSION_TARGET_VIEW_DENIED` → `worklogHistory.error.denied`(공용 문구가 "승인 대상"이라 이력 전용 문장), `INVALID_TARGET` + `cause.field ∈ {from,to}` → 기간 문구, 그 밖 `error.<code>`(`WORKLOG_NOT_FOUND`·`REQUEST_NOT_FOUND`·`RETENTION_EXPORT_REQUIRED`·`STORAGE_NOT_READY` 기존 키). 새 에러 코드 없음.

## 설계와 다른 점(프론트)

| # | 설계 | 구현 | 이유 |
|---|---|---|---|
| F1 | 탭 행 "아래로 펼쳐" | 펼친 워크로그 **하나**의 이력을 **표 바로 아래** 패널로(제목 "변경 이력 · 작성자 · 시작") | DynamicTable(CursorPagingTable)이 행 사이 펼침 행을 지원하지 않는다 — Q78 |
| F2 | 감사 검색 DynamicTable | 공용 `WorklogHistoryList` + "더 보기"(불러온 건수 표시) | "이전 → 이후"·설명 펼침을 표 칸에 넣으면 행 높이가 들쭉날쭉하고, 설계 §7.2 가 이미 목록 렌더러를 세 화면 공용으로 둔다. 총건수 없음·서버 정렬은 CursorPagingTable 과 같은 원칙 |
| F3 | 사용자 필터 `UserPickerDialog` | `searchUsers` 검색 Select(단일, 지울 수 있음 — DelegationPanel 과 같은 방식) | UserPickerDialog 는 다중 선택 추가용 모달이라 단일 필터에 맞지 않는다 |
| F4 | 키 `data.worklogHistory.purge` "내보낸 이력 삭제" | "내보낸 {count}건 삭제" + 추가 키 `expiredNone`·`oldest` | 결재 기록 보관 섹션과 같은 정보량 |
| F5 | i18n 신규 키 | §8 키 전부 + 추가: `tab.panelTitle/disabled/emptySince/truncated`, `restricted`, `issue.hidden`, `list.empty`, `label.author/actor`, `error.denied`, `audit.filter.userPlaceholder/projectPlaceholder`, `audit.loading`, `policy.section/keepCommentWarning` | 화면 문자열 하드코딩 금지 |

무효화: 모달(승인 상세)은 결정 직후 닫히고 iframe 마다 QueryClient 가 따로라, 모달 안에서 `worklogHistoryKeys.timesheet` 를 따로 지울 필요가 없다(다시 열면 새로 받는다). 업무함·타임시트 화면은 이 키를 쓰지 않는다.

## 테스트(신규 37)

- `historyFormat.test.js`(7): `fieldsOf`(UPDATED 는 changed 비트만 / CREATED·DELETED 한쪽), `commentText`(가림·빈·잘림·원문), `changeText`, `personName`(null=알 수 없음), `issueText`(visible=false 가림), 엑셀 행 값(출처·종류·가림·id 보존)
- `WorklogHistoryList.test.jsx`(8): 빈 목록, 종류·출처·이전→이후·안 바뀐 필드 숨김, **SWEEP 툴팁**, **가림·빈 설명·잘림 툴팁·행위자 null**, 원문 펼침, 기준선 안내·삭제 이전 값, 타임시트 섹션(afterApproval 요약·hidden·truncated·이슈 표시), 빈 이력·권한 거부 문구
- `worklogHistoryI18n.test.js`(2): 화면이 부르는 키(리터럴 + 템플릿 동적 키 + 재사용 에러 코드)가 kr·en 원본 사전에 모두 있는지
- `WorklogTab.test.jsx`(+5): D9·D12·null 버튼 없음 / 수정 N회 / 이력, enabled=false 면 since 안내 숨김, 펼칠 때만 조회·**D8 빈 이력**·접기, 항목 렌더, 권한 거부 문구
- `WorklogHistorySettings.test.jsx`(15): 입력 모델(기본 30일·배타 to·빈 조건 생략·366일 초과/역순/형식 오류), 쿼리키 팩토리, 감사 화면(첫 조회 payload·hiddenCount·더 보기 커서, 종류·출처 필터 재조회, INVALID_TARGET field=to 문구), 엑셀(200 단위·10,000 상한 capped·hidden 합계, 보관 내보내기 끝까지 받은 뒤 confirm, 무기한이면 confirm 없음), 보관 섹션(purge 반복, 내보낸 적 없음 경고·보관 기간 saveApprovalSettings, 삭제 확인·RETENTION_EXPORT_REQUIRED 문구), 정책 patch 키 2(보관 기간은 미포함)

## 미검증(04_spike_todo.md 에 추가)

- **H20** `jira:issueActivity` 탭 iframe 이 표 아래 이력 패널만큼 높이를 따라 늘어나는가(잘림·이중 스크롤)
- **H21** 설정 탭 11개로 업무함 사이드바 안 Tabs 가 넘치는가
- 그 밖 화면 동작은 실측 전: 엑셀 다운로드(`<a download>`)는 기존 결재 기록 내보내기와 같은 경로라 새 위험 없음.

## 새 질문

- **Q78** 작업 로그 탭의 이력 펼침 위치(기본: 표 아래 패널 하나)
- **Q79** 감사 검색 엑셀의 시각 기준(기본: 내보낸 사람 브라우저 타임존 — 기존 엑셀과 같음)

## 백엔드 요청

없음. 실제 shape 으로 세 화면·보관 흐름을 모두 채울 수 있었다.
(참고: `getWorklogHistory` 응답에 워크로그 `issue` 가 null 이라 탭 패널 제목은 탭 목록의 작성자·시작으로 만든다 — 계약대로.)
