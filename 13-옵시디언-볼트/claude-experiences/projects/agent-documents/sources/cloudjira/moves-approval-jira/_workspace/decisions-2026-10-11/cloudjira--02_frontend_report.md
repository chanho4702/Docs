# 프론트 구현 보고 — decisions-2026-10-11

2026-10-11. 하네스 frontend 단계. T1은 리더 구현이며 이 단계에서는 license·mount를 수정하지 않았다. 기존 미커밋 변경을 보존했고 src 백엔드·금지 문서·forge·git add/commit/push·빌드 명령을 실행하지 않았다.

## T2

PeriodCloseSettings에 기본 새 입력 허용과 수정까지 허용을 제공한다. 기존 INPUT 호출은 `{periodKey,rev}` 그대로다. 수정 허용은 서버 SITE 미리 보기를 받은 뒤 승인·인증·숨김 건수를 표시하고 명시 확인 체크와 trim 1~500자 사유를 요구한다. 이미 REOPENED인 기간도 EDIT로 승격할 수 있다.

실제 소비 계약:

- `previewPeriodReopen({periodKey,rev})` → `{previewToken,periodKey,rev,scope:'SITE',counts:{approvals,certifications,hidden},expiresAt}`.
- `reopenPeriod({periodKey,rev,mode:'EDIT',reason,previewToken})` → `{item,operationId,status,phase,counts,complete}`.
- `continuePeriodReopen({operationId})` → 동일 결과. 사유는 새로 전달하지 않는다.
- `listPeriodCloses`의 item.reopenOperation이 미완료이면 두 시작 버튼과 마감 대신 이어하기를 제공한다. 응답의 미완료 작업도 진행 안내에서 이어갈 수 있다.

완료 문구는 승인·인증 효력 해제와 숨김 해제 예약 완료를 구분한다. 실제 Jira 공개 복구는 비동기라고 안내한다. 오류는 error.code로 공용 번역을 고르며 실행 실패·낡은 미리 보기 뒤 목록을 갱신한다.

캐시는 settings 기간·감사·Workforce와 timesheet·approval·audit·inbox·worklogCert·worklogControl·worklog 접두를 queryKey 팩토리로 무효화한다. 타임시트 `driftKind:'REOPENED'`는 재승인 필요로, 인증 `REOPENED`는 재인증 필요로 표시한다. 재개방 인증은 미인증 필터에 포함한다. `PERIOD_REOPENED` 결재 감사와 상세 타임라인, `HAS_REOPENED` 인증 감사, `HIDE_RELEASE_REQUESTED`/`PERIOD_REOPENED` 통제 이력 번역을 연결했다.

## T3

PolicySettings의 checkbox를 기본 OFF/켜면 APP 정책으로 저장한다. 켤 때 최종 승인자 실패 뒤 앱이 한 번 적용하며 Jira 이력의 작성자는 앱, 실제 승인자는 결재 기록에 보존됨을 안내한다.

기존 saveApprovalSettings는 flat patch를 보내며 백엔드가 payload.patch 또는 payload를 지원하므로 기존 형태를 유지한다. APP 소비는 top-level을 가정하지 않는다. `applyFieldChange`의 실제 `{requestId,apply:{...,appliedBy,applyMode}}`에서 기존 applyNotice(content.apply)가 APP 표식을 가져오며 noticeText를 통해 결정 직후·다시 적용 화면에 함께 표시한다. 상세 적용자·증명서의 `appliedBy:'APP'`를 앱으로 번역한다. `FIELD_APPLIED.reason:'APP_FALLBACK'`은 감사 목록·엑셀·상세 타임라인에서 앱 적용이라고 표시한다.

## T4

공용 utils/userDisplay와 invokeApproval 성공 응답 경계에서 중첩 사용자 DTO를 정규화한다. closedLabel을 `탈퇴한 사용자 {label}`/`Deleted user {label}`로 번역하고 avatarUrl을 비운다. subjectClosedLabel·closedByClosedLabel·reopenedByClosedLabel 등 prefixed 메타도 같은 표시를 쓴다. FieldValue `{value,display,closedLabel}`의 display도 번역하며 원본 id·메타를 보존한다. 비활성화 계정의 기존 이름은 유지한다.

일부 엔트리는 조회가 사전 로드보다 먼저 끝날 수 있어 invokeApproval은 성공 확인 후 i18nReady를 기다린 다음 표시 이름을 캐시에 넣는다. 앱 언어는 현재 Forge context의 초기 locale을 사용한다.

감사 Excel 사람 칸에 이름과 accountId를 함께 남긴다. 결재의 실제 행위자·대리인·요청자·대상자, 인증의 인증자·대상자, 설정 행위자, 워크로그 작성자·행위자, 통제 작성자·관리자, 보관 결재선·이벤트·요청자·대상자, 업무함 요청자·대상자를 보강했다. 서버 users가 부족하면 resolveUsersInChunks로 최대100명씩 보충한다. 보관 이름은 기존 loadUsersByAccountIds 경로를 재사용한다. 이름 조회가 허용되지 않거나 실패하면 id를 보존하는 기존 fallback을 유지한다.

보관 원본 JSON은 복원 가능하게 그대로 보존하고 추가 `감사 계정` 시트에 이름과 Account ID를 대응시킨다. auditAccountIds는 backend 개인정보 JSON 계정 지도와 보존 DTO 별칭(authorId/actorId/subjectId/requesterAccount/delegatorKey/memberKeys/leaderKeys 등), USER 필드 fromValue/toValue/conflictValue를 수집한다. APP·unknown·*·= 특수값은 제외한다. 팀 타임시트 Excel은 기존 별도 displayName/Account ID 열이 이미 있어 유지했다. 인증·통제·이력 record archive는 보강한 공통 workbook 함수를 재사용한다.

USER 필드의 원래 문자열 snapshot은 FE가 tombstone을 알 수 없다. 리더가 FieldChangeService/adapter 응답에 closedLabel 메타를 보충하는 백엔드 작업을 맡았으며 정규화 소비는 준비되어 있다.

## 변경 파일

- 공용: static/ui/src/api/invokeApproval.js, utils/userDisplay.js(신규), utils/__test__/userDisplay.test.js(신규).
- T2: settings/PeriodCloseSettings.jsx와 테스트, timesheet/{PeriodStatusBadge,MyTimesheetPage,TeamMatrixTable}.jsx, worklogCert/certFormat.js, audit/auditModel.js, detail/ApprovalDetail.jsx.
- T3: settings/PolicySettings.jsx, settings/__test__/PolicyFallback.test.jsx(신규), fieldChange/{fieldChangeModel.js,FieldChangeTargetHeader.jsx}, certificate/CertificateSheet.jsx, audit/ApprovalAuditTab.jsx.
- T4: audit/exportAuditExcel.js, worklogHistory/exportWorklogHistoryExcel.js, settings/{exportRetentionExcel,exportRecordArchive}.js, inbox/exportInboxExcel.js, 관련 기존 Excel 테스트 기대값·디렉터리 mock.
- kr/en 양쪽: common.json, policy.json, timesheet.json, worklogCert.json, audit.json, detail.json, worklogControl.json. 생성 번역은 npm run merge로만 갱신했다.

위 목록은 이번 단계의 변경 부분이다. 일부 파일에는 다른 기능의 기존 미커밋 변경이 함께 있으며 이를 되돌리지 않았다.

## 검증

`npm run merge`:

```
locales\ko-KR.json 생성
locales\en-US.json 생성
```

최종 `npm run test:ui -- --runInBand`:

```
Test Suites: 65 passed, 65 total
Tests:       574 passed, 574 total
Snapshots:   0 total
Time:        22.55 s
Ran all test suites.
```

이번 단계 회귀 테스트 추가8건: EDIT 미리 보기·확인·사유·부분 진행1, 이미 재개방/진행 중 버튼1, closed 중첩 표시1, 언어 간 같은 표식/감사 id1, REOPENED 인증 필터1, snapshot 계정 수집1, 정책 APP 저장/경고1, OFF 저장1.

최초 전체 UI에서 새 이름+id 기대값1건과 기존 디렉터리 mock3건이 실패했고 수정 후 전체 통과했다. 새 정책 테스트의 테스트 도구 의존성 부재는 기존 React act/createRoot 방식으로 바꿨고 Atlaskit 버튼은 기존 방식대로 mock했다.

`git diff --check -- static/ui/src locales`: 통과(기존 파일 CRLF 경고만 출력). 프론트 빌드와 최종 backend/merge/UI/forge lint는 모든 에이전트 종료 뒤 리더 단계다. 배포·Jira 실환경 iframe·대량 visibility 실제 복구는 실행하지 않았다.
