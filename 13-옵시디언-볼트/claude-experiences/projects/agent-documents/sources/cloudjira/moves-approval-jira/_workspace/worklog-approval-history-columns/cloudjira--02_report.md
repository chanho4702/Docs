# 워크로그 승인 이력 — 일자·소요 열 (2026-10-14)

요청: 승인 이력·엑셀에서 "언제·몇 시간 쌓았는지"가 보이지 않음.

## 바뀐 파일
백엔드
- `src/resolver/worklogCertification/worklogApprovalFacts.js` (신규): `worklogApprovalOf(row, saved)`, `loadWorklogApprovals(rows, load)`, `attachWorklogApprovals(items, load)`. InboxService 의 enrich 로직을 그대로 옮겨 공용화(복사 없음)
- `src/resolver/inbox/InboxService.js`: `enrichWorklogApprovals` 가 `attachWorklogApprovals` 를 호출(동작 동일)
- `src/resolver/approval/ApprovalAdminService.js`: 생성자 주입 `worklogSnapshots`(기본 `worklogCertificationRepository.forExport`), `itemOf` 에 `worklogCreate`·`worklogApproval` 추가, `listAllApprovals` 가 페이지 확정(`page`) 뒤 `loadWorklogApprovals` 를 1회 호출
- 테스트: `ApprovalAdminService.test.js`(4건 추가, shape 기대값 갱신), `ApprovalAdminSqlBudget.test.js`(2건 추가)

프론트
- `static/ui/src/features/worklogApproval/WorklogTargetFacts.jsx` (신규): 대상 아래 "작업 시작 일시 · 소요" 한 줄. InboxTable 의 기존 마크업을 옮긴 것이며, APPEAL 표시와 사전 승인 `worklogSummary` 도 포함
- `static/ui/src/features/inbox/displayDate.js` (신규): InboxTable 의 `displayDate` 를 옮김
- `static/ui/src/features/worklogApproval/worklogApprovalModel.js`: `worklogFactsOf(item)` → `{started, seconds} | null`(worklogApproval 또는 worklogCreate)
- `static/ui/src/features/inbox/InboxTable.jsx`: 공용 컴포넌트 사용(표시 동일)
- `static/ui/src/features/approvalAdmin/ApprovalAdminPage.jsx`: 제목 셀에 `WorklogTargetFacts` 추가(승인 관리는 InboxTable 이 아니라 자체 표라서 자동으로 보이지 않았음)
- `static/ui/src/features/inbox/exportInboxExcel.js`: '종류' 뒤에 열 2개 추가 — `worklogStarted`(라벨 `worklogApproval.snapshot.started`, 값 `isoLocal(started)`, 뷰어 브라우저 시간대), `worklogDuration`(라벨 `worklog.column.timeSpent`, 값 `formatDuration(seconds)`, 표와 같은 함수). 워크로그 종류가 아니거나 값이 없으면 빈 칸. **WORKLOG_CREATE 의 대상 열에 붙이던 `worklogSummary` 는 제거**(열로 분리)
- 테스트: `exportInboxExcel.test.js`(신규), `InboxTable.test.jsx`(+1), `ApprovalAdminPage.test.jsx`(+1)

i18n: 새 키 없음. 기존 `worklogApproval.snapshot.started`("작업 시작 일시"/"Work start time")와 `worklog.column.timeSpent`("소요"/"Time spent")를 재사용. `npm run merge` 통과.

## 실제 응답 shape — listAllApprovals items[]
```
{ requestId, targetKind, title, issueKey, projectKey, status, isOpen, requesterKey,
  currentStep: {order, name, pendingApproverKeys} | null,
  createdAt, updatedAt, expiresAt,
  worklogCreate: {started, timeSpentSeconds, applyStatus} | null,   // WORKLOG_CREATE 만, 어댑터 meta
  worklogApproval: {started, seconds, purpose:'AUTO'|'MANUAL'|'APPEAL'|null} | null, // WORKLOG_CERTIFICATION 만
  canCancel, canRemind }
```
listInbox 의 `worklogApproval` shape 은 변경 없음(워크로그 승인 행에만 키가 있음).

## SQL
- 승인 관리: 보이는 페이지 행 중 WORKLOG_CERTIFICATION 이 있으면 `worklog_certification_request` 1회, 없거나 빈 목록이면 0회. 숨긴 행과 다음 페이지 행은 읽지 않음(테스트로 고정)
- 예산 테스트 실측: 워크로그 승인 행이 페이지를 채울 때 W=4, 합계 14(상한을 `3W+5 ≤ 17` 로 둠). 다른 경우의 기존 상한 `3W+4 ≤ 16` 은 그대로

## 테스트
- `npm test -- --runInBand`: 195 suites / 2935 tests 통과
- `npm run test:ui -- --runInBand`: 93 suites / 819 tests 통과
- `npm run build:ui`(CI 플래그 없음): 성공. 경고는 기존 @atlaskit css 경고만

## 발견·미처리
- (해결됨, 아래 2회차) **승인 관리 화면에는 엑셀 내보내기 버튼이 없다**(grep 결과 `exportInboxExcel` 은 InboxPage 에서만 사용). 그래서 엑셀 열은 업무함·내 이력에만 반영됐다. 승인 관리에도 내보내기가 필요하면 `listAllApprovals` 를 페이지 단위로 끝까지 읽는 별도 내보내기를 만들어야 하며, 범위 결정이 필요하다.
- 엑셀 시작 일시는 기존 `isoLocal`(뷰어 브라우저 시간대)을 사용한다. 사이트 타임존 정책값을 쓰지는 않는다(다른 일시 열과 동일).
- 금지 파일(ApprovalService.js, modal.jsx)과 manifest·SQL 스키마는 건드리지 않았다. forge 명령과 커밋은 실행하지 않았다.

## 2회차 — 승인 관리 엑셀 내보내기 (사용자 결정 반영)

바뀐 파일(프론트만 바뀜. 백엔드 변경 없음)
- `static/ui/src/features/approvalAdmin/exportApprovalAdminExcel.js` (신규): `fetchAllAdminRows(payload)` 는 화면의 `adminPayloadOf` 결과(scope·기간·종류)를 그대로 넘겨 `listAllApprovals` 를 `nextCursor` 가 없을 때까지 읽는다. `MAX_ROWS=5000`. **`PAGE=50`**: 서버 `MAX_LIMIT`가 50이라 업무함의 100은 `INVALID_TARGET` 로 거부되기 때문이다. `hiddenCount` 는 페이지별 값을 합하고 `incomplete` 는 OR 로 묶는다. 사용자 이름은 `resolveUsersInChunks` 로 한 번에 조회한다. `addTableSheet`·`downloadWorkbook`·`paintStatus` 를 재사용한다
- 열 구성: No, 프로젝트(projectKey), 이슈 키, 대상, 종류, 작업 시작 일시, 소요, 상태, 단계(현재 단계 이름), 현재 단계 대기(대기 결재자 "이름 (accountId)"), 요청자, 요청일, 마감(expiresAt), 갱신, Request ID. 업무함 열 가운데 전환·필드 변경·적용·대상자는 `listAllApprovals` 응답에 해당 값이 없어 넣지 않았다
- 시트 제목: `승인 관리 · 진행 중|종료 · from ~ to · 내보낸 시각`. hiddenCount 나 incomplete 가 있으면 제목 아래에 안내 한 줄을 넣는다(`inbox.manage.hidden` + `inbox.manage.incomplete`)
- `static/ui/src/utils/excel.js`: `addTableSheet` 에 선택 인자 `notice` 를 추가했다. 값이 있으면 2행에 안내를 넣고, 헤더·틀 고정·자동필터를 3행으로 옮긴다. 값이 없으면 기존과 같다
- `static/ui/src/features/worklogApproval/worklogExcelColumns.js` (신규): 두 엑셀(업무함·승인 관리)이 함께 쓰는 "작업 시작 일시"·"소요" 열 정의와 셀 값. `exportInboxExcel.js` 도 이것을 쓰도록 바꿨다
- `ApprovalAdminPage.jsx`: 진행 중·종료 버튼 줄 오른쪽에 "엑셀로 내보내기" 버튼(`inbox.export.xlsx`, subtle, `testId=manage-export`). 기간이 잘못돼 payload 가 null 이면 비활성화한다
  - 업무함의 버튼은 AppShell 헤더의 `actions` 에 있다. 하지만 필터 상태가 ApprovalAdminPage 안에 있어서, 같은 헤더 자리에 두려면 상태를 InboxPage 로 끌어올려야 한다. 그래서 페이지 안 상단 오른쪽에 두었다(모양과 라벨은 업무함과 같다)
- i18n: 새 키 없음(모두 기존 키를 재사용)

테스트
- `features/approvalAdmin/__test__/exportApprovalAdminExcel.test.js`(신규 5건): 행 값(워크로그 일시·소요·단계·대기 결재자·요청자·상태), 사전 승인의 두 열, 커서 순회(limit 50·cursor 전달), 5000행 상한과 truncated, hiddenCount 합산·incomplete 안내 행, payload null 이면 호출 안 함
- `ApprovalAdminPage.test.jsx` +1: 버튼이 화면과 같은 payload 를 넘기는지
- `npm run test:ui -- --runInBand`: 94 suites / 825 tests 통과
- `npm run build:ui`: 성공(경고는 기존 node_modules 소스맵·css 경고뿐)
- 백엔드: 이번 회차 변경 없음(1회차 2935 통과 그대로)
- 다른 에이전트가 수정 중인 경로(`src/integration/workforce`, `src/domain/worklogPolicy`, `src/resolver/worklogControl`, `src/resolver/worklogPolicy`)는 건드리지 않았다
