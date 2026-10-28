# period-lock 검증 리포트 (회차 1)

> 작성: integration-verifier · 2026-10-03 · autopilot 무인 회차(Phase 5)
> 기준: `01_architect_design.md`(계약) · 실제 shape: `02_backend_report.md` · 소비: `02_frontend_report.md` · 실제 소스 직접 대조
> forge·git 인덱스 조작 0회. 리포 밖 수정 0.

## 판정: **PASS**

필수 수정(F) 1건 — 처리 완료·재검증 통과. 남은 실패 0. 권고(R) 5건, 미검증은 `04_spike_todo.md` P1~P33 그대로 + 신규 V1.

## 요약  통과 34 / 실패 0(F1 수정 후) / 미검증 3 범주

## 실행 결과 (직접 실행 — 보고서 수치를 믿지 않고 다시 돌림)

| 명령 | 결과 |
|---|---|
| `npm run merge` | 통과 — `locales/ko-KR.json`·`en-US.json` 생성, kr/en 키 집합 차이 0(직접 평탄화 대조) |
| `npm test -- --runInBand` (수정 전) | **46 suites / 529 tests 통과** |
| `npm test -- --runInBand` (F1 수정 후) | **46 suites / 529 tests 통과** |
| `npm run test:ui -- --runInBand` | **17 suites / 140 tests 통과** |
| `npm run build:ui` | exit 0. 산출 html 5개: inbox·modal·settings·projectSettings·**worklog** |
| `forge lint` | 미실행(지시상 금지) → 미검증 |

로그: `_workspace/period-lock/tmp/v_test.log`, `v_test2.log`, `v_testui.log`, `v_build.log`, `v_merge.log`.

## 실패 (필수 수정)

- **F1** [`src/utils/ResponseWrapper.js:13`] `EXPECTED_ERRORS` 가 `'PermissionError'`(클래스 이름)를 담고 있었으나 `PermissionError` 의 `name` 은 `'PermissionDeniedError'`(`src/error/PermissionError.js:9`) → 모든 권한 거부(이번 `WORKLOG_PERMISSION_DENIED` 포함)가 `[RESOLVER]` 예상 밖 오류로 로그됨. 응답 shape·동작 영향 없음.
  → **처리: 집합 값을 `'PermissionDeniedError'` 로 교체(+ 왜 주석 1줄)**. `error.name` 을 분기에 쓰는 코드는 src·static/ui·test 어디에도 없음을 grep 으로 확인. 재실행 46/529 통과. (담당: backend — 검증자가 직접 처리)

## 경계면 표 (생산자 ↔ 소비자, `invokeApproval` 이 `content` 를 벗긴 값 기준)

| resolver | 생산자 | 소비자 | 일치 |
|---|---|---|---|
| `getIssueWorklogs` | `WorklogService.js:97-133` `{issueId,timeZone,unit,worklogs[WorklogView],total,truncated,nextOffset,permissions,lockRanges}` | `WorklogTab.jsx:36-45,85-199` — `pages[].worklogs`, `nextOffset`(Number.isInteger), `truncated`, `timeZone`, `permissions.canLog`, 행 `lock`·`canEdit`·`canDelete`·`visibilityRestricted`·`authorAvatarUrl` | 일치 |
| `getWorklogEditorContext` | `WorklogService.js:135-165` `{issueId,issueKey:null,timeZone,unit,now,permissions,lockRanges,worklog}` | `WorklogDialog.jsx:196-238`, `WorklogForm` 35-55 — `issueKey` 는 확장 컨텍스트 값 사용(D4 반영) | 일치 |
| `createWorklog`/`updateWorklog` | `WorklogService.js:176-219` `{worklog}` | `WorklogDialog.jsx:58-79` `result.worklog.worklogId` | 일치 |
| `deleteWorklog` | `WorklogService.js:221-234` `{worklogId,deleted:true}` | `WorklogTab.jsx:62-72` 응답 무시·목록 무효화 | 일치 |
| `listPeriodCloses` | `PeriodCloseService.js:108-133` `{unit,timeZone,autoCloseDays,now,items,nextBeforePeriodKey}` | `PeriodCloseSettings.jsx:29-36`, `periodCloseModel.nextPeriodClosePage` | 일치(끝 없는 목록 — Q27) |
| `closePeriod`/`reopenPeriod` | `PeriodCloseService.js:161-248` `{item}`, 입력 `rev: int\|null` (`revOf`) | `PeriodCloseSettings.jsx:49-62` `rev: Number.isInteger(item.rev) ? item.rev : null`, 응답 대신 재조회 | 일치 |
| `getMyTimesheet` (+) | `TimesheetService.js:253-297` `close`·`closeDrift`·`lock`·`periods[].closed` | `MyTimesheetPage.jsx:147-159`, `PeriodPicker.jsx:21`, `CloseBadge.jsx` | 일치 |
| `getTeamTimesheetMatrix` (+) | `TimesheetService.js:414-489` `close`·`rows[].closeDriftAt`·`summary.closeDrift` | `TeamTimesheetPage.jsx:149`, `TeamMatrixTable.jsx:91` | 일치 |
| `get/saveApprovalSettings` (+) | 정책 2키 | `TimesheetPolicySettings.jsx` | 일치(계약 테스트 통과) |

에러 분기: `lockText.worklogErrorText` 가 `error.code` 로만 분기하고 `cause`(잠김 `{reasonCode,periodKey,which}`·입력 `{field}`·Jira 400 `{fields}`)는 백엔드 `WorklogService.assertOpen`·`validated`·`WorklogGateway.mapStatus` 의 실제 cause 와 같다. `PeriodCloseSettings` 는 `STALE_CODES` 로 재조회.

## 통과 (점검표)

**등록**
- [x] 신규 8 resolver: `guardedDefine`(WorklogController 5, TimesheetController:51-60 3) + `PermissionMap.js:122-133` + `index.js:45 registerWorklogController` — 계약 테스트 통과
- [x] 프론트 `invokeApproval('fn')` 이름 8개 모두 등록 이름과 같음

**shape**
- [x] `.content` 이중 접근 없음, 시각 epoch ms, SQL 바인딩 `SqlTime.toSqlTimestamp`(`PeriodCloseRepository`)
- [x] 신규 에러 코드 9개 kr/en `error.json` 존재, merge 산출물에도 존재(직접 node 대조). `error.json` 키 집합 = `ErrorCodes` 값 집합(양쪽 extra 0)

**불변식**
- [x] 1 — 엔진 무변경, 마감은 PK `(scope_key, period_key)` + `INSERT IGNORE` 로 기간당 한 행
- [x] 3 — `grep "Date.now|new Date()" src/domain` 은 주석만. `lock.js`·`worklogInput.js` 에 fetch·SQL 없음
- [x] 4 — `PeriodCloseRepository.js:135,147` close/reopen `SET … rev = rev + 1 … WHERE rev = ? AND state = <이전>`
- [x] 6 — `periodCloseAuditId`(scope·period·action·변경 후 rev) 결정적, 감사 `INSERT IGNORE`
- [x] 8 — `WorklogGateway` 는 `asUser` 만 import(테스트 단언). asApp 사용처는 `WorklogCollector`(트리거·스윕, 허용 1번)·`LicenseGuard`(허용 3번)뿐, 신규 asApp 없음
- [x] 9 — 엔티티 프로퍼티 미사용
- [x] 10 — 해당 없음(validator 없음)

**권한 범위**
- [x] 워크로그 5종 `{issue:'view', issueIdKey:'issueId', appAccess:false}` — 가드가 payload issueId 를 숫자 검증 + asUser 열람 확인. 수정·삭제는 `loadOwn` 이 Jira GET 결과의 `issueId === payload.issueId`·작성자 === 호출자를 다시 확인(다른 이슈 id 섞기 우회 차단)
- [x] **잠금 재판정이 Jira 쓰기 전 서버에서**: create `193-195`, update `210-215`(이전 started 는 서버 GET 값), delete `229-232` 모두 `evaluate → assertOpen → gateway.*` 순. 판정 SQL 실패는 throw(fail-close) — 테스트 `WorklogService.test.js:131,145,165,179`
- [x] 남의 워크로그 뷰는 마감만 판정(`judge(mine=false)` → submissions 비움) — 남의 제출 상태 비노출(Q20)
- [x] 마감 3종 읽기·쓰기 모두 `{admin:true}` 대칭. 매트릭스 close drift 는 `TeamScope.membersOf` 결과 accountIds 로만 조회(`TimesheetService.js:426-435`), 마감 목록은 인원 수만(`countByPeriods`)
- [x] **Q22 게이트 면제 범위**: `appAccess:false` 는 PermissionMap 의 워크로그 5항목에만 존재(grep), 가드는 `guard()` 경로만 적용(`permissionGuard.js:55`) — PUBLIC/SELF 경로·admin 경로 무관. 계약 테스트가 `appAccess` 는 `false` 만 + issue 축 동반을 단언. `worklog` 엔트리 부팅 시 다른 resolver 호출 없음(i18n 은 `@forge/bridge i18n`) → 명부 미등록자도 탭이 뜬다. 라이선스 가드(`ResponseWrapper`)는 그대로(Q23 기본 가정)

**프론트·배포 단위**
- [x] 엔트리 `worklog` 3곳: `craco.config.js:33`, `static/ui/public/worklog.html`, `manifest.yml:122` + issueAction·issueActivity `resource: main/worklog`. 빌드 산출 `worklog.html` 확인
- [x] 쿼리키 `worklogKeys`·`settingsKeys.periodCloses*` 팩토리 사용, 신규 `100vh` 0, 화면 하드코딩 문구 0(grep)
- [x] 마이그레이션 `v022_create_approval_period_close_table`, `v023_create_timesheet_close_drift_table` — `migrate.js:62-63` 끝에 append, 번호 연속·기존 이름 무변경. 신규 테이블이라 CREATE(ALTER 규약 해당 없음), 두 Repository 모두 `isTableReady` 프로브
- [x] manifest app id 는 `REPLACE-WITH-forge-register` 유지(Confluence id 아님). scope `write:jira-work` 추가 → 배포 시 `--upgrade` 필수
- [x] 수용 기준 문장 kr/en `timesheet.notice.acceptance` 가 설정·제공자 안내·제출 바에 표시

## 권고 (R — 이번 회차 필수 아님)

- **R1** [`WorklogService.js:229-231`] 삭제 대상 워크로그의 `started` 가 null(손상 응답)이면 `evaluateWorklogLock` 이 시각을 건너뛰어 **허용**한다. 실제로는 Jira 가 started 없는 워크로그를 주지 않겠지만, 쓰기 판정은 fail-close 원칙이므로 `current.started === null` 이면 `WORKLOG_NOT_FOUND` 로 거부하는 1줄 가드를 권한다. (backend)
- **R2** Q30 — 대화상자 저장이 `permissions.canLog/canEditOwn`(mypermissions 키 이름, P15 미검증)에 묶여 있다. 키 이름이 틀리면 사이트 전체 입력 불가. 배포 회차 P15 실측을 최우선으로. (frontend, 결정 대기)
- **R3** `getIssueWorklogs` 는 "더 보기"마다 Jira 에서 최대 1000건을 다시 받아 정렬 후 자른다 — 쪽 수만큼 같은 GET 반복. 워크로그가 많은 이슈에서 지연 가능(P27 과 함께 관찰). (backend)
- **R4** Q27 — `listPeriodCloses` 는 끝이 없다(`nextBeforePeriodKey` 항상 문자열). 하한 결정 후 `null` 을 주면 프론트는 수정 없이 멈춘다. (결정 대기)
- **R5** 백엔드 테스트에 `ErrorCodes ↔ locales/*/error.json` 대조가 없다(이번엔 수동 스크립트로 확인). 계약 테스트로 옮기면 다음 기능에서 누락을 막는다. (backend)

## 미검증

- 플랫폼 실측: `04_spike_todo.md` P1~P33 그대로 유효(배포 회차). 특히 P21(단건 GET `issueId` — 없으면 수정·삭제 전부 NOT_FOUND), P3(displayConditions), P7(scope·작성자), P15(mypermissions 키), P28·P29(확장 컨텍스트·Modal context 위치).
- `forge lint` — 지시로 미실행. manifest 신규 3모듈(`timeTrackingProvider`·`issueAction`·`issueActivity`)과 `displayConditions.timeTrackingProviderEnabled` 스키마 적합성은 lint 로 확인해야 한다.
- **V1(신규)** F1 수정 후 권한 거부가 서버 로그에서 사라지는지 — 배포 후 `forge logs` 로 `[RESOLVER] PermissionDeniedError` 미출력 확인(테스트로는 로그 억제를 단언하지 않는다).

## 열린 질문 (제품 결정 — 추측으로 확정하지 않음)

- Q16~Q30 미회신 그대로(기본 가정으로 구현됨). 검증 관점에서 결정이 시급한 것: **Q23**(라이선스 만료 시 워크로그 입력도 막힘 — 제공자 선택이 남아 있으면 사이트 전체 시간 입력 상실), **Q30**(R2), **Q27**(R4).
