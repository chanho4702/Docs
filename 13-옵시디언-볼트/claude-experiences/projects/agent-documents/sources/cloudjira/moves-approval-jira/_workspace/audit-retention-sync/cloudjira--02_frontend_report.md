# audit-retention-sync — 프론트 보고서 (1회차)

작성 2026-10-11 · 입력 `00_input/requirement.md`, `01_design_notes.md`, `02_backend_report.md`(shape 정답)
검증: `npm run merge` 통과 · `npm run test:ui -- --runInBand` **60 suites / 549 tests 통과**(착수 전 59 / 522) · `npm run build:ui` 성공(경고는 기존 atlaskit source map·postcss-calc 뿐, `src/` ESLint 경고 0).
`src/`(백엔드) 무수정 · 커밋·배포 안 함 · 엔트리 추가 없음(manifest·craco·public 무변경).

## 1. 소비하는 resolver ↔ 접근 경로

`invokeApproval` 가 `content` 를 벗겨 주므로 아래 경로는 전부 `content` 기준.

| resolver | 화면 | 입력 | 읽는 경로 |
|---|---|---|---|
| `clearForeignWorklog` | 설정 > 워크로그 통제 > 다른 경로 입력 목록 | `{worklogId, reason}` (NFC·trim, 1~500 코드 포인트) | 응답 미사용 → `worklogControlKeys.all` 무효화 |
| `acknowledgeForeignWorklog` (신규) | 같은 목록 "확인" | `{worklogId, reason}` | 〃 |
| `listForeignWorklogs` | 같은 목록 | 무변경 | 가산 `items[].review.{action, at, by, note}` + `users[by].displayName` |
| `listWorklogHistory` | 설정 > 감사 > 워크로그 변경 | 가산 `includeControl:true`, `controlActions?: ControlAction[]`(켰을 때만) | `items[].rowType` 로 행 분기, CONTROL 행 `eventId·action·reasonCode·note·detail.{from,state,fp,gen}·actorAccountId·authorAccountId·issue·workforceLinked·occurredAt`, `nextCursor` 는 **해석 없이 되돌림** |
| `getRecordRetentionOverview` (신규) | 설정 > 데이터 관리 > 기록 보관 | `{}` | `kinds[].{kind, unit, value, options, expiredCount, oldestAt, purgeableCount, lastExport.{cutoff,at,count,by}, exportRequired}` |
| `exportExpiredRecords` (신규) | 〃 "내보내고 삭제 준비" | 첫 호출 `{kind}`, 이후 `{kind, sessionId, cursor}` | kind 별 `requests/approvers/events` · `items` · `batches[].items[]`, `sessionId`, `cutoff`, `nextCursor`(결재는 객체 그대로) |
| `confirmRecordExport` (신규) | 〃 (파일 내려받은 **뒤**) | `{kind, sessionId}` | 응답 미사용 → 개요 무효화 |
| `purgeExportedRecords` (신규) | 〃 삭제(확정 뒤에만 버튼) | `{kind}` 반복 | `deleted`, `remaining`(0 이거나 진행 없으면 멈춤) |
| `downloadRecords` (신규) | 〃 "삭제 없이 내려받기만" | `{kind, from, to, cursor?}` | kind 별 페이지 + `hiddenCount`(결재) + `nextCursor` |
| `setRetentionYears` / `saveApprovalSettings` | 〃 보관 기간 Select | APPROVAL `{years}` · 나머지 정책 키 1개(§3) | 정책 저장 응답 → `settingsKeys.policy()` setQueryData |
| `getApprovalSettings` | 감사 탭 보관 안내 | — | `worklogHistoryLinkedRetentionMonths`, `certificationRetentionYears` |
| `getWorklogHistoryRetention` | 감사 탭 보관 안내 | — | `months` — **이제 일반분**이라 문구를 "워크로그 변경 이력(일반)"으로 |
| `getRetention` | 데이터 관리 하단 안내 | — | `notificationRetentionDays` 만(알림 자동 정리 문구) |
| `getIssueWorklogs` / `getWorklogEditorContext` | 작업 로그 탭·Log work 대화상자 | — | `control.linkUnavailable`, `control.channel` |

에러 분기는 전부 `error.code` + `cause.field`:
- `INVALID_TARGET{field:'reason'}` → `worklogControl.invalid.reason`(controlErrorText 의 INVALID_FIELDS 에 `reason` 추가)
- `INVALID_TARGET{field:'cursor'}`(감사 탭) → `worklogControl.journal.cursorInvalid`(다시 검색 안내)
- `INVALID_TARGET{field:'from'|'to'}`(내려받기) → `data.records.download.rangeInvalid`
- 나머지 `error.<CODE>`(`RETENTION_EXPORT_REQUIRED`·`WORKLOG_CONTROL_STORAGE`·`STORAGE_NOT_READY` 등 기존 키). 신규 에러 코드 없음.

## 2. 요구별 구현

### R1 통제 판단
- `ForeignWorklogList`: "오탐 해제"는 이제 사유 대화상자(`ReasonModal`)를 거쳐야 실행. 새 "확인" 버튼(모든 상태 — 서버가 foreign_state 있는 행이면 받음). 확인 버튼은 사유가 NFC·trim 뒤 1~500 코드 포인트일 때만 켜진다(서버 `normalizeReasonNote` 와 같은 규칙, `worklogControlModel.isReasonValid`). 새 칸 "마지막 관리자 판단" — `review` 의 판단 종류·사람·시각·사유, `null` 이면 대시.
- 감사 > 워크로그 변경: "통제 판단 포함" 체크(`includeControl`), 켜면 판단·조치 종류 10개 체크(`controlActions`) + "종류·출처 조건은 이력 행에만" 안내 + 설정 변경 탭 링크(통제 스위치·관문은 설정 감사에 있음 — 백엔드 §3.4).
  - 쿼리키는 기존 `worklogHistoryKeys.audit(applied)` — `applied` 에 `includeControl` 이 들어가므로 모드 전환 시 쿼리가 새로 시작되어 **옛 형식 커서가 합성 커서 모드로 가지 않는다**. 커서는 받은 값 그대로 되돌릴 뿐 해석하지 않는다.
  - `WorklogHistoryList` 가 `rowType:'CONTROL'` 행을 `ControlLogItem` 으로 그림(키 `eventId`, 서버 정렬 유지). 행위자 null 은 "앱 자동 조치"(알 수 없음 아님), 사유 코드·관리자 사유·detail(이전 상태·확인 당시 상태·참고 사본 지문·세대). 모르는 action·reasonCode 는 원문 코드 표시.
  - 엑셀: `includeControl` 이면 `mixedColumns`(앞에 "구분", 뒤에 사유 코드·관리자 사유·상세). 10,000행 상한·hiddenCount 규칙 그대로.

### R2·R3 기록 보관 5종
- `DataSettings` 의 옛 결재 보관 섹션·`WorklogHistoryRetentionSection` 을 `RecordRetentionSection`(5종 카드)로 교체. `WorklogHistoryRetentionSection.jsx` 삭제(사용처 없음).
- 카드마다: 보관 기간 Select(서버 `options`·`unit`), 기간 경과 건수, 가장 오래된 기록, 마지막 확정(실행자 이름은 디렉터리 조회), `exportRequired` 면 경고 "기간 지난 기록 N건 — 내려받기 필요"(N = `expiredCount − purgeableCount`, 0 하한) + 배지.
- 버튼: **내보내고 삭제 준비**(기간 경과 있을 때) → 끝까지 받아 파일 내려받은 뒤에만 `confirmRecordExport`. **삭제**는 `lastExport` 가 있고 `purgeableCount>0` 일 때만 그려진다(확정 전에는 버튼 자체가 없음) → 한 번 더 확인. **삭제 없이 내려받기만**은 기간 지정(기본 최근 1년, 상한 없음) → `downloadRecords`, 10,000행 상한·capped 안내.
- 인증 Select 옆 "1년 선택지가 없는 이유" 툴팁(작년 문서 재게시 범위와 겹침). 인증 정리 시 게시 문서 불변·기간 마감 권고 문구(백엔드 발견 3).
- 감사 탭 보관 안내: 워크로그 탭은 "일반 N개월 + 워크포스 연결 M개월", 인증 탭은 정책 `certificationRetentionYears`(0 이면 기존 "무기한").
- 정책 화면(작업 로그 정책 패널)의 `historyRetentionMonths` 라벨을 "워크포스 연결분 제외"로(값·저장 경로 무변경).
- 종류별 통합문서: 결재 = 기존 결재 보관 통합문서(`buildApprovalArchiveWorkbook` 로 추출, 4시트), 이력 = 기존 이력 시트, 인증 = 감사 인증 시트 칼럼(`certColumns/certRowValues` 재사용), 통제 이력 = 새 `controlColumns`.

### R4 문구
`workforce.republish.done/doneFailed`, `worklogCert.result.syncNote`, `worklogCert.workforce.dailySync` — "인증하면 수 분 안에, 그 외(정책·연동 재개·재게시)는 다음 일일 동기화". 통제 잠금 지연 문구(`worklog.tab.controlDelay`, `worklogControl.*.delay`)는 인증 게시가 아니라 통제 큐라 그대로 둠.

### R6 `control.linked`
`worklogControlModel.linkStateOf(control)` → `UNAVAILABLE`(linkUnavailable) / `LINKED`(서버 `channel==='WORKFORCE'`) / `NOT_LINKED`. 작업 로그 탭·Log work 대화상자는 이 값으로 워크포스 창구 안내를 띄우고, 불명이면 연동으로 단정하지 않고 경고 "연동 여부 확인 불가"(작성 버튼은 유지 — 창은 서버가 READ_FAILED 로 막고 기존 창 미해결 경고가 함께 뜬다). 화면에서 `control.linked` 를 직접 배지로 쓰던 곳은 없었다(목록의 `item.linked` 는 통제 행 저장값이라 무관).

## 3. 정책 키 저장 경로

| kind | 호출 | payload |
|---|---|---|
| APPROVAL | `setRetentionYears` | `{years}` |
| WORKLOG_HISTORY | `saveApprovalSettings` | `{worklogHistoryRetentionMonths}` |
| WORKLOG_HISTORY_LINKED | 〃 | `{worklogHistoryLinkedRetentionMonths}` |
| CERTIFICATION | 〃 | `{certificationRetentionYears}` |
| CONTROL_LOG | 〃 | `{worklogControlLogRetentionYears}` |

## 4. 쿼리키 (팩토리만)

- 신규 `settingsKeys.recordRetention()` = `['settings','recordRetention']`, `settingsKeys.recordRetentionExporters(ids)`(개요 접두 아래).
- 기간 저장·확정·삭제 뒤 `recordRetention`·`retention`·`worklogHistoryRetention`·`storage` 함께 무효화(감사 탭 보관 안내가 옛 resolver 키로 같은 기록을 읽는다).
- 해제·확인 뒤 `worklogControlKeys.all`.

## 5. 추가·변경 i18n 키 (kr·en 동시, merge 통과)

- `worklogControl`: `invalid.reason`; `foreign.list.description`(문구 변경); `foreign.review.{column, acknowledge, reasonLabel, reasonCount, clearTitle, clearBody, acknowledgeTitle, acknowledgeBody}`; `journal.action.*`(10), `journal.reason.*`(NONE·REUSED·INVALID·PRE_RESTRICTED·CAP·CHANGED·LINKED·APPROVED·CERTIFIED·GONE), `journal.{rowType, rowTypeHistory, appActor, actor, reasonLabel, noteLabel, sheet, include, filter, filterHint, switchHint, switchLink, cursorInvalid}`, `journal.detail.{from,state,fp,gen}`, `journal.column.{occurredAt,action,detail,rowType}`
- `data.records.*`: `title, hint, expired, expiredNone, unlimitedNone, oldest, lastExport, exportRequired, exportRequiredBadge, export, exported, nothingToExport`, `download.{open,hint,from,to,run,running,done,cappedDone,capped,rangeInvalid}`, `kind.<5종>.{title,hint}`, `kind.CERTIFICATION.{noOneYearLabel,noOneYear,purgeNote}`
- `audit.retention`: `worklog`·`worklogUnlimited`(문구 "(일반)"), 신규 `worklogLinked`, `worklogLinkedUnlimited`, `certificationYears`
- `worklog.tab.linkUnavailable`
- `worklogPolicy.key.historyRetentionMonths`(문구 변경)
- `workforce.republish.{done,doneFailed}`, `worklogCert.result.syncNote`, `worklogCert.workforce.dailySync`(문구 변경, R4)

## 6. 테스트

신규 `static/ui/src/features/settings/__test__/RecordRetention.test.jsx`(17): 저장 경로·삭제 버튼 판정·기간 변환·상한 자르기·쿼리키 / 끝까지 받은 뒤 파일 → 확정 순서, 결재 객체 커서, 무기한·세션 변경·중간 실패 시 확정 없음 / purge 반복 / 내려받기 10,000행 capped·확정·삭제 호출 없음 / 인증 묶음 행·hiddenNote / 혼합 엑셀 칼럼 / 섹션 렌더(5종, 내려받기 필요, 확정 전 삭제 버튼 없음, 1년 없음 툴팁, 종류별 setter).
가산: 통제 목록(사유 필수·NFC, 500자 초과, 서버 reason 에러, review 표시·해제 불가 상태에도 확인), 감사 탭(includeControl·controlActions payload, 합성 커서 되돌림, CONTROL 행 렌더, cursor 에러, payload 모델), 작업 로그 탭 linkUnavailable, 모델(사유 정규화·linkStateOf·행 종류 수), i18n 키 대조 대상 파일·동적 키 확장.
삭제: `WorklogHistoryRetentionSection` 렌더 테스트 3건(컴포넌트 삭제).

## 7. 설계와 다른 점 / 판단

1. **보관 내보내기(삭제 준비)에는 10,000행 상한을 두지 않았다.** 서버 세션은 끝까지 받아야(COMPLETE) 확정되므로(`ExportSessionRepository.confirm`) 상한에서 멈추면 삭제가 영영 불가능하다. 10,000행 상한은 "내려받기만"과 감사 엑셀에 적용. 기존 결재·이력 보관 내보내기도 상한이 없었다.
2. 옛 export 함수(`exportRetentionExcel`, `exportExpiredHistoryExcel`)는 화면에서 더 쓰지 않지만 백엔드 옛 resolver 가 남아 있어 함수·테스트는 유지했다(결재 통합문서 빌더는 새 흐름과 공유). 정리하려면 백엔드 옛 resolver 퇴역과 함께.
3. `linkStateOf` 는 연동 판정을 `control.linked` 가 아니라 서버 `channel` 로 본다 — 서버가 판정된 연동일 때만 WORKFORCE 를 주므로 같은 값이고, 화면이 다시 추론하지 않게.

## 8. 백엔드 요청

없음(필요한 값이 전부 응답에 있다). 참고: 개요의 결재 kind 에 옛 `getRetention` 의 `notificationRetentionDays` 가 없어 하단 알림 정리 문구 하나 때문에 `getRetention` 을 한 번 더 부른다 — 개요에 넣어 주면 호출 하나가 준다(선택).

## 9. 변경 파일

신규: `static/ui/src/features/settings/{RecordRetentionSection.jsx, recordRetentionModel.js, exportRecordArchive.js}`, `static/ui/src/features/worklogControl/ReasonModal.jsx`, `static/ui/src/features/worklogHistory/controlLogFormat.js`, `static/ui/src/features/settings/__test__/RecordRetention.test.jsx`
변경: `static/ui/src/features/{audit/AuditPage.jsx, settings/DataSettings.jsx, settings/WorklogHistoryAuditSettings.jsx, settings/worklogHistoryAuditModel.js, settings/exportRetentionExcel.js, worklog/WorklogTab.jsx, worklog/WorklogDialog.jsx, worklogControl/ForeignWorklogList.jsx, worklogControl/worklogControlModel.js, worklogHistory/WorklogHistoryList.jsx, worklogHistory/exportWorklogHistoryExcel.js}`, `static/ui/src/utils/queryKey/approvalKeys.js`, 테스트 6(`AuditTrail`, `WorklogHistorySettings`, `WorklogTab`, `WorklogControlSettings`, `worklogControlModel`, `worklogHistoryI18n`), `locales/{kr,en}/{audit,data,workforce,worklog,worklogCert,worklogControl,worklogPolicy}.json`
삭제: `static/ui/src/features/settings/WorklogHistoryRetentionSection.jsx`
