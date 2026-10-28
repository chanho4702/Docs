# 프론트 구현 보고 — 2026-10-13

## 최종 상태

프론트 구현과 단위·회귀 검증을 마쳤다. 아래 이전 체크포인트의 미완료 항목 1~5는 처리됐다. 코드 수정은 완료했고 빌드·배포·커밋은 root가 전체 에이전트 종료 후 수행한다.

- Approval 전체 UI: **89 suites / 801 tests 통과** (`ui-test-results-final.json`). 그 뒤 사전승인 불필요 조회/분기 제거, 일괄 승인 선택 함수 테스트 2개 추가, 용량 안내 중복 제거 후 관련 **4 suites / 75 tests 통과**. 신규 합계는 803 tests이며 최종 전체 재실행은 root 검증 단계다.
- Workforce UI: **4 suites / 19 tests 통과**. approvalBulk, IssueApprovalBulkModal, IssueApprovalSettingTable, PanelWorklogCreate.
- 양 앱 번역 merge 성공. Approval `git diff --check` 통과(기존 Windows 줄바꿈 경고만).
- 브라우저에서 320/480px 실제 렌더 검증과 빌드 예산 확인은 **아직 수행하지 않았다**. 모든 에이전트 완료 전 빌드 금지 규칙을 따랐다. UI는 기존 Atlaskit/줄바꿈 배치·label·날짜/시간 locale·비동기 오류 피드백을 재사용하며 새 폰트/디자인 라이브러리는 없다.

### 추가 완료 사항

- getWorklogCertification의 `approvalHistoryPage`를 useInfiniteQuery로 연결하여 과거 회차를 20개씩 이어본다. 현재 승인자 이름, 누가 언제 승인/반려했는지, 사유를 표시한다.
- Workforce handoff 페이지에도 건별 요청·소명·승인 이력과 변경 이력 연결. 기존 수정/삭제는 서버 판정 유지.
- 신규 승인 업무함 상세(`WorklogCertificationPanel`)는 approvalModel:1일 때 작업일·시간·승인 상태로 표시한다. 이전 데이터의 읽기 전용 컴포넌트는 보존한다.
- InboxService `worklogApproval:{started,seconds,purpose}` DTO를 소비해 작업 시간과 소명 건을 비교한다. 일괄 처리 성공만 선택 해제하며 실패/미처리는 유지한다. `bulkSelection.test.js`로 부분 실패와 미확인 결과를 검증했다.
- 설정 첫 화면은 ‘기본 승인 규칙’, 기간/팀은 ‘승인 기간 · 팀’, 상세 제한/진단은 고급으로 분리한다. 상태/필드 승인 프로젝트설정 진입점을 제외했다. 과거 직접인증 화면은 조회만 가능하다.
- `manifest.yml`의 `transition-approval-action` 정의는 **주석으로 보존하고 모듈에서 제외**했다. 배포하는 경우 install --upgrade가 필요하다. workflowValidator 모듈은 보존하며 backend의 기능 제외 판정을 따른다.
- 사용자 추가 보관 요청: 관리자 `isAdmin === true` 이후에만 용량 조회, 하루 staleTime/초점 재조회 없음, SQL 스케줄·알림 INSERT 없음. 기본 앱/설정 진입 배너에서 관리로 이동하고 데이터관리 화면에서는 배너가 중복되지 않는다.

### 적용 범위와 검증 유의점

이슈의 고급 정책/과거 인증 원본 코드는 보존했다. 정상 경로의 실제 Forge visibility 적용, Workforce 서명 동기화 지연, 삭제된 Jira 이슈의 조회 제한은 backend/사이트 검증 사항이다. UI 테스트 통과만으로 실제 사이트 잠금을 보장한다고 보고하지 않는다.

변환용 frontend_*.py 파일들은 모두 이미 적용됐으며 재실행하지 않는다. 새 구현은 static/ui/src의 실제 파일과 양 앱 locales에 저장돼 있다. 커밋·푸시·배포는 수행하지 않았다.

## 이전 체크포인트 (작업 이력)

아직 완료 전이다. 빌드·배포·커밋은 하지 않았다. UI 테스트/남은 정리 중이며 재시작해도 아래 파일은 저장되어 있다.

## 반영한 코드
- WorklogApprovalPanel 신규: getWorklogCertification의 canRequest/canChangeApprover/canAppeal에 따라 건별 요청·승인자 변경·소명 필수사유 입력. listWorklogApprovalCandidates 이름 검색. 승인 이벤트 과거 회차 표시, 사용자 이름 해석. 요청 후 승인/업무함/워크로그/이력/타임시트 키 무효화.
- WorklogApprovalStatus: 건별 상태와 수정 불가 표시. WorklogDetailModal에 패널 포함, 이전 직접인증/정책 세부 중복 제거.
- WorklogTab 입력 폼 + 상태표 중심. 사전승인 요청 하위 탭 제거, LinkedWorklogPanel의 KPI/설정 요약 제거. issue 엔트리에서 일반/상태/필드 승인 개요 제외, WorklogTab 사용.
- WorklogDialog createWorklog 정상 생성, 사전승인 분기 제외. 저장 성공과 접수 실패/승인자 부재 별도 피드백. 모달에서 접수 실패 시 재저장 버튼 제거.
- WorklogApprovalSettings 신규: 자동/수동 요청(worklogAutoRequest), 월말 이후 마감일(timesheetAutoCloseDays), 기본 팀장·잠금 고정 규칙 설명, 연동 소유 정책 안내. 고급 폼은 접힘. FeatureSelectionSettings 기본 화면 교체. 설정 메뉴 상태승인 제외·고급 묶음, 인증 탭 제외.
- BulkApproveBar/InboxPage: 일괄승인 성공한 선택만 해제, 실패 선택 유지. 직접인증 메뉴 제외. enabledKinds는 워크로그·타임시트 중심.
- DataSettings/StorageNotice: storage management level 70/85/95에 따른 관리자 안내, 파일 내보내기→확인→정리, 자동삭제 없음. 업무함/설정 진입에서 서버 isAdmin 확인 후 최대 하루 staleTime 조회, SQL 알림행 생성 없음.
- Workforce: IssueApprovalBulkModal/Table/approvalBulk에 wa 설정(자동/수동, closeDays, lockApproved true), 사전승인/결재선 UI 제거. Jira panel 작성은 Approval 안내로 대체, 앱 내부 작성은 유지. WorklogApprovalBadge를 최근 워크로그와 프로젝트 이력에 포함.
- 양쪽 locales kr/en 수정. Approval merge 1회 성공.

## 남은 작업
1. 신규 WorklogApprovalPanel/WorklogApprovalSettings 의미 있는 UI tests 추가. 기존 변경된 UX 기대치 테스트 갱신. WorklogTab 기존 tests는 inline form mock/옛 인증 배지 및 규칙 행 기대치 수정 중.
2. backend가 방금 추가한 approvalHistoryPage pagination을 패널의 '더 보기'로 연결.
3. 현재 승인자 이름 표시 보강(approval.steps 계약 확인), 상태 이벤트 fallback 및 i18n 정리.
4. Workforce UI targeted tests·merge, wa form의 단건 현재값 프리필, 구판 capability 보호 확인.
5. unused import/dead legacy 분기 정리 및 root 최종 전체 tests/build 전에 실패 보고.
6. 실제 320/480px 브라우저 시각 검증 미수행. 기존 UI 프리뷰 환경 가능 여부 확인 필요.

## 검증
- Approval npm run merge 성공.
- 첫 대상 WorklogDetailModal/WorklogTab/WorklogDialog 테스트: Detail 통과, 나머지 합계24 실패/24 통과. 대다수 기존 사전승인/인증/규칙행 기대치와 새 inline 입력 폼 test mock 미비. 수정 후 두 파일 재실행 중.
- 실행 스크립트 frontend_edit.py / frontend_finish.py / frontend_qa.py는 초기 변환용으로 이미 적용됨. **재실행하면 일부 중복 치환되므로 실행하지 말 것.**
- 현재 functions exec cell21에서 frontend_qa.py 실행 뒤 merge + 두 UI suite 돌리는 중(root에는 live cell 접근이 안 될 수 있으니 세션 종료 상태 확인).

## 현재 계약
- standalone worklogAutoRequest default true backend 완료. 연동 wa.autoRequest가 우선.
- getWorklogCertification의 approvalHistory(20회) + approvalHistoryPage {hasMore,nextBeforeRevision}; historyBeforeRevision으로 다음 페이지 요청.
- 저장 후 status PENDING/NEEDS_APPROVER/UNSUBMITTED/CLOSED/SUBMISSION_FAILED; Workforce 직접 저장 PROCESSING.
- getStorageUsage.management {level,usedPercent,threshold,action,automaticDeletion:false,notification:'INLINE',notificationKey}; admin 가드 기존 유지.
