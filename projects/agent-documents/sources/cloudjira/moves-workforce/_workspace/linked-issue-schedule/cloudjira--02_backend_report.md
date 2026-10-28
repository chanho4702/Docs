# W-3 워크포스 설정 백엔드 구현 보고

2026-10-12 · 브랜치 RFC-220 · 범위: 설계 §17 W-3만.

W-3 구현과 관련 회귀는 완료했다. 전체 Jest 완료 기준은 형제 승인 앱의 W-1 계약 미동기화로 미충족이다. 형제 저장소는 사용자 지시에 따라 수정하지 않았다.

## 변경 파일

- 권한: `src/permission/TeamLeadAuthority.js` 신규, `permissionGuard.js`, `TeamLeadFieldPolicy.js`, `PermissionMap.js`.
- 등록: `src/index.js`, 신규 `src/resolver/approvalLink/IssueApprovalSettingController.js`.
- 설정: 신규 `src/resolver/approvalLink/IssueApprovalSettingService.js`, `IssueMembership.js`의 일괄 `filterMembers`.
- 서명: 신규 `src/integration/approval/issueSetting.js`, `kbDoc.js`, `controlDoc.js`의 검증된 `rx` 투영.
- 게시: `src/resolver/approvalLink/ApprovalLinkSignals.js`, `ApprovalLinkAdminService.js`, `IssueWorklogControlService.js`의 접속 시 kb 갱신 및 기존 GET에 설정 프로퍼티 동봉.
- KVS 설정: `manifest.yml`, `src/resolver/backoffice/setting/SettingDefaults.js`, `SettingService.js`, `SettingController.js`, `src/resolver/backoffice/publicHoliday/PublicHolidayController.js`.
- 오류 코드: `src/utils/errors/ErrorCodes.js`.
- asApp 예외: `AGENTS.md` ⑧에 설계 §13의 issue/kb PUT/GET 추가.
- 기존 W-1의 `src/integration/approval/contract.js`, `vectors.json`은 내용 유지, LF로 정리.

## 실제 계약 및 경계

- `listIssueApprovalSettings({projectId,cursor?,filter?})`: `{items,nextCursor,canEdit,approvalPresent,approvalLinkRecommended}`. 상태 필터는 해당 페이지 내에서 적용한다. setting은 `{s,e,pa,by,rev,at}`이며 원문·서명은 반환하지 않는다.
- `saveIssueApprovalSettings({projectId,items})`: `{results:[{issueId,result,rev}],kbStale}`. 최대 50건, 중복·날짜·expectedRev·keep 입력 검증, PUT 동시 최대 5, 검색 응답으로 현재값·소속을 함께 확인하고 쓰기 뒤 대조한다.
- Controller → guardedDefine → PermissionMap 및 CONTROLLER_REGISTRARS 등록. 저장 권한은 grant 없는 projectTargets 팀장 축과 allowlist이며, 서비스의 assertLeads는 관리자·자원 권한을 우회 조건으로 쓰지 않는다.
- leadProjectIds는 leadingTeamKeys만 사용해 직속 팀원 projectusers와 직속 project_team 프로젝트의 합집합을 구한다. principal 누락·조회 실패는 닫힌다. 감사용 tk는 계약에서 허용한 null이다.
- 소속 검증·목록·쓰기 뒤 검색은 asUser, issue/kb 서명 게시만 asApp이다.
- 해제는 NONE 게시 후 설정 비우기, 재연결은 값 있는 자기 설정 비우기 성공 후 신호 게시. 구 kid 설정을 새 kid·새 rev로 재서명한다.
- approvalLinkMode는 string ON/OFF, 기본 OFF. rx 감지 시 OFF면 권장 표시용 boolean을 반환한다.
- 유휴 스케줄·SQL 경로를 변경하지 않았다. 신규 권한 SQL은 승인 설정 호출 경로에만, kb 갱신은 mutation·관리자 게시·이슈 접속에만 연결했다.

## 테스트

신규 테스트:

- `src/permission/__test__/TeamLeadAuthority.test.js`
- `src/integration/approval/__test__/issueSetting.test.js`
- `src/resolver/approvalLink/__test__/IssueApprovalSettingService.test.js`
- `src/resolver/approvalLink/__test__/ApprovalLinkSettingSignals.test.js`
- `src/resolver/approvalLink/__test__/ApprovalLinkResign.test.js`
- `src/resolver/approvalLink/__test__/KbMutationPublishing.test.js`
- `src/resolver/backoffice/setting/__test__/ApprovalLinkMode.test.js`

기존 `IssueMembership.test.js`와 `test/permission/teamLead.contract.test.js`에 일괄 조회·projectTargets·allowlist 계약을 추가했다. W1~W10, W2′·W6′·W9′·W29·W32 관련 동작을 검증했다.

- 최종 `npx jest --runInBand --silent`: 168 suites 통과, 1 suite 실패; 2,273 tests 통과, 2 tests 실패.
- 범위 회귀 `npx jest src/permission src/resolver/approvalLink src/integration/approval src/resolver/backoffice/setting/__test__/ApprovalLinkMode.test.js test/permission/teamLead.contract.test.js --runInBand --silent`: 20 suites 통과, 1 suite 실패; 303 tests 통과, 2 tests 실패.
- 두 실패는 모두 기존 `vectors.test.js`의 형제 저장소 원본 바이트 비교(contract.js, vectors.json). 승인 앱 파일에는 rms.issue/rms.kb 및 ch/rx 확장이 아직 없다. LF 수정 후에도 내용 차이가 남는다. 지문·서명 벡터 및 W-3 테스트는 통과했다. 테스트 생략·완화 없이 실패를 유지했다.
- `git diff --check` 오류 없음.

## 설계와 코드 차이 및 판단

- 설계의 조회 startDate는 기존 워크포스 코드의 고정 `customfield_10015`를 사용한다. 승인 앱 ctl.sf에 의존하면 ctl이 없거나 다른 필드를 가리킬 때 워크포스 Jira 시작일과 달라진다.
- 기존 `validateHolidayWorkRatio`는 임의의 0~1 소수를 허용하나 rms.kb 계약은 정수 %만 허용한다. 0.333처럼 정확히 표현 불가능한 비율은 반올림해 계산 입력을 바꾸지 않고 게시 실패·kbStale로 알린다.
- kb 갱신 대상은 구독 목록만으로 BOARD·단건 연결을 찾을 수 없어 기존 연결 이슈 JQL을 페이지 조회하고 Jira 프로젝트를 중복 제거한다. 동기 게시는 앞 50개로 제한하며 나머지는 접속 시 갱신한다.
- projectTargets의 SQL 계산은 비동기 guard에서 하고 기존 동기 isTeamLeadOver에 계산한 집합을 전달한다. 기존 account/team 축의 동기 호출 계약을 유지했다.
- 쓰기 뒤 대조도 asUser 일괄 검색을 사용한다. 저장 전에 확인한 조회자 열람 범위를 유지하며, 재조회 실패·문서 불일치는 CONFLICT로 닫는다.

기존 번역 변경과 보호 대상으로 지정한 미추적 파일은 수정하지 않았다. git add/commit/push 및 Forge 명령은 실행하지 않았다.
