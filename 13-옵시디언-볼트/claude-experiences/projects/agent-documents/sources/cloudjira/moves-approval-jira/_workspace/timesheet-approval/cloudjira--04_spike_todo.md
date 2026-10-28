# timesheet-approval 플랫폼 실측 목록 (미검증) — 초안

> 작성: feature-architect · 2026-10-03 (설계 단계 초안). backend/frontend 가 구현하며 항목을 보태고, 배포 회차에 리더가 확인한다.
> 확인 원칙(AGENTS.md): iframe 클릭은 자동화에서 신뢰할 수 없다 — 결과는 resolver 반환값·DB 상태로 본다. `forge logs` 는 늦으니 트리거는 결과 상태(DB·화면)로 확인한다.
> core-port 의 U1~U16·F1~F6 은 `_workspace/core-port/04_spike_todo.md` 에 그대로 있다. 이 기능이 기대는 것: U2(permissions/check — 상세의 이슈 가시성), U3(bulkfetch), U6/U6b(그룹 가져오기), U7(user/bulk), U11(scope).

| # | 항목 | 설계 위치 | 영향 | 확인 방법 | 실패 시 동작 / 대안 |
|---|---|---|---|---|---|
| T1 | `avi:jira:{created,updated,deleted}:worklog` 이벤트 페이로드에 `worklog.id`(삭제 포함)가 오는가. 그 밖에 어떤 필드가 오는가(issueId·author·started) | `onWorklogChanged` §4.6 | 트리거 감지 | 개발 사이트에서 워크로그 생성·수정·삭제 → `timesheet_submission.drift_detected_at`·요청 상태가 바뀌는지. 페이로드 형태는 트리거가 `Object.keys` 만 로그로 남겨 확인(값은 남기지 않는다) | id 가 없으면 트리거는 no-op, 스윕만으로 감지(지연 ≤ 1시간+). 페이로드에 author·started 가 확실히 오면 created/updated 의 `worklog/list` 1회를 줄일 수 있다(최적화, 필수 아님) |
| T2 | REST·자동화·CSV 가져오기·모바일로 만든 워크로그에도 이벤트가 오는가. 누락률 | §4.6 | 스윕 비중 | REST(`POST issue/{id}/worklog`)로 승인된 기간에 워크로그 추가 → 1분 안에 drift 플래그가 서는지. 자동화 규칙으로도 1회 | 오지 않으면 스윕(시간당)이 잡는다. 수용 기준 문서에 "최대 지연" 명시 |
| T3 | `GET /rest/api/3/worklog/updated?since=` · `/deleted?since=` 를 asApp 으로 부를 때: 페이지 크기(1000), `until`·`lastPage`·`nextPage` 형태, "직전 1분은 반환하지 않음" 동작, 앱이 모든 프로젝트 워크로그를 보는가 | `TimesheetDriftService.sweep` | watermark 정확성 | 스윕 1회 실행 후 `approval_job_state` 의 `ts-worklog-updated` watermark·cursor 값과 반환 건수(스윕 요약 로그)를 본다. 앱이 못 보는 프로젝트(보안 수준)에 워크로그를 넣고 잡히는지 | 형태가 다르면 감지 0건(안전측 — 오탐 없음). 앱이 못 보는 프로젝트는 감지 불가 → 한계로 문서화 |
| T4 | `POST /rest/api/3/worklog/list {ids}` asApp: 상한(문서 1000), 응답의 `issueId`·`author.accountId`·`started`·`timeSpentSeconds` | `WorklogCollector.fetchWorklogsByIdAsApp` | 감지 대조 | 트리거 결과로 확인(T1과 함께). 단위 테스트는 응답 목으로 | 실패 = 해당 묶음 판정 불가 → 건너뜀(오탐 없음). 다음 스윕 재시도는 watermark 미전진으로 보장 |
| T5 | `POST /rest/api/3/search/jql` 에서 `worklogAuthor = currentUser() AND worklogDate >= "…" AND worklogDate <= "…"` 동작, 날짜가 **검색자 타임존**으로 해석되는지, `nextPageToken` 페이지 | `WorklogCollector.collectMine` | 제출 수집 완전성 | 기간 첫날 00:30(현지)·마지막 날 23:30 에 워크로그를 넣고 `getMyTimesheet` 의 `live.entryCount` 에 둘 다 들어오는지. 사용자 프로필 타임존을 UTC 로 바꿔 한 번 더 | 앞뒤 하루 여유로 대부분 흡수. 그래도 빠지면 여유를 2일로 |
| T6 | `GET /rest/api/3/issue/{id}/worklog?startedAfter=&startedBefore=` 의 단위(epoch ms), 경계 포함 여부, `maxResults` 기본·상한, `total` 페이지 | `collectMine` | 수집 | 같은 이슈에 경계 시각 워크로그 2건 → 둘 다 받는지. 100건 넘는 이슈 1개로 페이지 확인 | 경계는 여유 1일 + `normalizeWorklogs` 의 epoch 판정이 정밀 처리 |
| T7 | 워크로그 `started` 문자열 형식(`2026-10-01T09:00:00.000+0900`) | `parseJiraDateTime` | 기간 매핑 | 실제 응답 1건(상세 화면 `entries[].started` 가 기대 epoch 와 같은지) | 파싱 실패 워크로그는 제외되고 지문이 달라진다 → 테스트에 실제 문자열 추가 |
| T8 | Forge nodejs22 런타임의 `Intl.DateTimeFormat({timeZone})` 이 IANA 전체를 지원하는가(full ICU) | `period.js` | 기간 계산 전체 | `getTimesheetContext` 가 `Asia/Seoul`·`America/New_York` 에서 기대 `currentPeriodKey` 를 주는지(정책을 바꿔 가며) | 미지원이면 `isValidTimeZone` 이 false → 설정 저장 거부. 대안: 고정 오프셋 테이블(DST 없는 지역만) |
| T9 | `zlib.deflateRawSync`/`inflateRawSync` 런타임 사용 가능 | `snapshot.js` | 제출 저장 | 첫 제출 성공 + 상세(`getTimesheetDetail`) 에서 entries 복원 | 불가하면 형식 `ts1j`(비압축 JSON)로 — 용량 약 2배(연 +10MB) |
| T10 | `node:async_hooks` `AsyncLocalStorage` 런타임 사용 가능 | `InvocationScope.js`(R3) | 호출량만 | `getIssueApproval` 진단 반환값(테스트 빌드)에 mypermissions 호출 수 1 | 없으면 memo 가 캐시 없이 동작 — 정확성 영향 없음 |
| T11 | 새 scope 없이(`read:jira-work`·`read:jira-user`) 워크로그 이벤트·`worklog/updated|deleted|list`·`search/jql`·`myself` 가 되는가 | manifest §6.1 | 전체 | `forge lint` + 배포 후 각 경로 1회 | 403 이면 해당 경로 fail-close. 필요한 scope 를 추가하고 `--upgrade` |
| T12 | `scheduledTrigger interval: hour` 함수의 실제 실행 시간 한도(25초 가정) | 스윕 예산 20초 | 스윕 완주 | 대량(워크로그 수천 건 변경) 상황에서 `cursor_value` 가 이어지는지 | 예산을 줄이고 커서로 잇는다(설계 그대로) |
| T13 | 이슈 200개·워크로그 2000건 기간의 `getMyTimesheet`·`submitTimesheet` 소요 시간 | 상한값 §4.7 | 25초 한도 | 개발 사이트에 시드 데이터로 측정(resolver 반환값에 elapsedMs 진단을 임시로 싣는다) | 상한을 낮추거나 동시성을 6→10 |
| T14 | 가시성 제한(그룹·역할) 워크로그를 asUser 작성자 본인이 보는가, asApp `worklog/list` 가 돌려주는가 | 지문 일치 | 오탐·누락 | 제한 워크로그 1건 포함 기간 제출 → 아무 변경 없이 스윕 2회 → drift 가 생기지 않아야 한다 | 본인이 못 보면 스냅샷 밖(한계 1). asApp 이 못 보면 그 워크로그 변경 감지 불가 → 문서화 |
| T15 | Forge SQL: `MEDIUMTEXT`, multi-row INSERT 200행, `INSERT … ON DUPLICATE KEY UPDATE request_id = VALUES(request_id)`, `UNIQUE` 컬럼의 NULL 중복 허용 | 스키마 §5.3 | 저장·팀 구성원 | 마이그레이션 적용(첫 resolver 호출) 후 제출 1회·팀 저장 1회(팀장 2팀 겸임) | VALUES() 미지원이면 `ON DUPLICATE KEY UPDATE request_id = ?` 로. NULL 중복이 막히면 `member_slot` 을 `CONCAT('lead:', team_key, ':', account_id)` 로 |
| T16 | `jira:globalPage` 안 사이드바 새 뷰(`timesheet`·`teamTimesheet`) URL 동기화(`view.createHistory`, U9 와 함께) | 프론트 §7.1 | 새로고침 시 탭 유지 | 팀 타임시트 탭에서 새로고침 | 첫 화면으로 떨어짐 — 기능 영향 없음 |
| T17 | 상세 모달에서 팀장(이슈 열람 권한 없는 이슈 포함)이 `getTimesheetDetail` 을 열 때 `issues[].visible=false` 처리 | `getTimesheetDetail` | 불변식 7 | 팀장이 못 보는 프로젝트에 팀원이 워크로그를 남긴 기간을 제출 → 팀장 상세에서 키·제목이 비고 시간만 보이는지 | permissions/check 실패 시 전부 visible=false(fail-close) |

## 설계 단계 판단(실측으로 뒤집힐 수 있는 것)

- 감지 방식은 "워크로그 단위 대조"다. T3·T4 가 예상과 다르면 감지가 **안 되는 쪽**으로만 틀린다(오탐 만료 없음). 반대로 전체 재해시 방식은 T14 에서 오탐이 날 수 있어 택하지 않았다.
- 제출 수집은 asUser JQL + 이슈별 조회다. T5 가 실패하면(예: `worklogAuthor` 미지원) 대안은 `worklog/updated` 가 아니라(사이트 전체라 과다) **이슈 검색 조건을 `assignee`·최근 갱신으로 넓히고 author 로 거르는 것**인데, 누락 위험이 커 실측 전에는 채택하지 않는다.

## backend 구현 중 추가 (2026-10-03, backend-engineer)

| # | 항목 | 코드 위치 | 영향 | 확인 방법 | 실패 시 동작 / 대안 |
|---|---|---|---|---|---|
| T18 | Forge SQL(TiDB)에서 `ALTER TABLE approval_event MODIFY COLUMN event_type VARCHAR(32) NOT NULL` · `approval_notification.kind` 같은 확장이 마이그레이션으로 적용되는가 | `ddl/timesheet.sql.js` v020·v021 | 승인 후 변경 감사 이벤트·알림 저장 | 배포 후 첫 resolver 호출 → `[MIGRATE] applied` 에 v020·v021. 이후 승인된 타임시트 워크로그 수정 → 상세 타임라인에 `CHANGED_AFTER_APPROVAL`, 알림 탭에 항목 | 실패하면 v020 이 마이그레이션 큐를 막는다(뒤 항목 없음). 대안: 이벤트 종류 값을 16자 이하로 줄이는 새 값(예 `CHANGED_APPROVED`)으로 바꾸고 v020·v021 을 no-op CREATE 로 교체(이름은 유지) |
| T19 | `DELETE … WHERE NOT EXISTS (SELECT 1 FROM approval_request r WHERE r.request_id = timesheet_submission.request_id) LIMIT 500` 문법(상관 서브쿼리 + LIMIT) | `TimesheetRepository.deleteOrphans` | 고아 부속 행 정리 | 제출 중 ALREADY_OPEN 을 일부러 내 고아 행을 만든 뒤 1시간+ 지나 스윕 → `[TIMESHEET][sweep]` 요약의 `orphans.submissions` ≥ 1 | 실패는 스윕 로그만 남고 감지는 계속 돈다. 대안: SELECT 로 id 를 모은 뒤 `DELETE … WHERE request_id IN (…)` 2문장 |
| T20 | 워크로그 트리거 이벤트에 `eventType` 필드가 오는가(`avi:jira:deleted:worklog` 구분) | `TimesheetDriftService.handleEvent` | 삭제 이벤트에서 asApp 1회 절약 | `[TIMESHEET][trigger] payload keys` 로그의 `kind` 값 | 없으면 삭제도 created/updated 처럼 worklog/list 를 1회 부른다 → 빈 응답 → current=null → 역참조로 DELETED 감지(정확성 동일, 호출 1회 증가) |
| T21 | 시간당 `timesheet-sweep` 이 하루 `approval-sweep` 과 같은 `approval_job_state` 테이블에서 job_key 만 달리해 겹치지 않는가 | `TimesheetDriftService.acquireLease` | 중복 실행 | 스윕 2회 연속 수동 실행(같은 시각) → 두 번째는 `leased:false` | 겹쳐도 결과는 같다(결정적 이벤트 id·조건부 클레임) |
| T22 | `getTimesheetContext`·`getMyTimesheet` 를 `restrictAccess=true` 사이트에서 팀 구성원(명부 미등록)이 열 수 있는가 | `AppAccess.loadAccess` | 앱 접근 | 승인자 명부에 없는 팀원 계정으로 업무함 → 내 타임시트 | 팀 테이블 미준비면 구성원 허용이 빠진다(관리자 명부만) |

## frontend 구현 중 추가 (2026-10-03, frontend-engineer)

> F 번호는 core-port 의 F1~F6 다음부터 잇는다.

| # | 항목 | 코드 위치 | 영향 | 확인 방법 | 실패 시 동작 / 대안 |
|---|---|---|---|---|---|
| F7 | Jira iframe 안 브라우저의 `Intl.supportedValuesOf('timeZone')` 지원, 정책 타임존으로 기간 범위 표시(`Intl.DateTimeFormat({timeZone})`) | `settings/TimesheetPolicySettings.jsx`, `timesheet/timesheetFormat.periodRangeLabel` | 설정 타임존 선택기·기간 범위 문구 | 설정 > 타임시트에서 타임존 드롭다운이 목록으로 뜨는지, 내 타임시트 기간 범위가 `10월 1일 ~ 10월 31일 (Asia/Seoul)` 처럼 정책 타임존으로 나오는지 | 목록 미지원이면 직접 입력 칸으로 떨어진다(서버가 IANA 검증). 포매터 타임존 실패 시 브라우저 시간대로 그린다(경계 하루 오차 가능 — 표시만) |
| F8 | Atlaskit 모달(반려 대화상자, 팀 편집 + 그 위 사용자 선택 대화상자 중첩)이 `jira:globalPage`·`jira:adminPage` iframe 안에서 잘리지 않고 겹쳐 뜨는가 | `timesheet/RejectDialog.jsx`, `settings/TeamFormModal.jsx` | 반려·팀 편집 | 팀 타임시트에서 반려 열기, 설정 > 타임시트 > 팀 추가 > 사용자 추가 | 높이는 내용이 정한다(100vh 미사용). 잘리면 팀 편집을 Forge `Modal`(별도 리소스)로 옮기는 안 |
| F9 | 타임시트 탭에서 `new Modal({context:{intent:'detail', requestId}})`(issueId 없음)로 연 상세가 TIMESHEET 대상을 그리는가, 닫은 뒤 매트릭스·내 타임시트가 갱신되는가 | `InboxPage.openRequest`, `detail/ApprovalDetail.jsx`(TIMESHEET 분기) | 상세·결정 후 갱신 | 팀장으로 매트릭스 행 클릭 → 상세 승인 → 닫기 → 행 상태가 승인됨으로 | 갱신이 안 되면 onClose 무효화 키(`timesheetKeys.all`) 확인. 모달 iframe 에서 `getTimesheetDetail` 실패 시 섹션만 에러로 보이고 결재는 가능 |
| F10 | 팀 매트릭스 엑셀(`exceljs` 청크)·증명서 PDF(TIMESHEET 분기) 내려받기가 iframe 에서 동작하는가 | `timesheet/exportTeamTimesheetExcel.js`, `certificate/*` | 내보내기 | 팀 타임시트 > 엑셀로 내보내기, 승인된 타임시트 상세 > 결재 증명서 PDF | 업무함 엑셀과 같은 경로라 그쪽이 되면 된다 |
