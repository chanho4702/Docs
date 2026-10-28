# 검토 요청: 2026-10-14 작업 묶음 — 독립 검토 (읽기 전용)

역할: 독립 검토자. **코드·문서를 수정하지 말 것.** 리포 `C:\CloudJira\moves-approval-jira`(승인 앱)와 `C:\CloudJira\moves-workforce`(워크포스)를 직접 읽는다. 두 리포 모두 **작업 트리의 커밋 전 변경이 검토 대상**이다(`git status`·`git diff`·미추적 파일 포함). 결과는 한국어(코드 식별자는 영어). 근거는 파일:줄 또는 공식 문서 URL. 테스트·빌드는 재실행하지 않아도 되지만, 재실행하지 않았으면 그렇게 적는다.

## 대상 (오늘 한 번에 쌓인 변경 4묶음)
A. **linked-mode-fix** — `_workspace/linked-mode-fix/{00_input/requirement.md,01_architect_design.md,02_backend_report.md,02_workforce_report.md,03_verify_report.md}`. 요지: 워크포스 Jira 이슈 패널·`worklogOwner` 표식 제거, 승인 앱 ctl 즉시 게시(요청당 3건 상한), 워크포스 본인 `movesRms.org` 에 팀 구조(leaderKeys=소속 팀장→가장 가까운 조상 팀장→[], leads 에 하위 팀장 포함), 승인 앱 기본 승인자 "상위 팀장 있으면 그 사람만, 없으면 본인".
B. **workforce-input-reopen** — `_workspace/workforce-input-reopen/{00_input/requirement.md,01_architect_design.md,02_backend_report.md,02_workforce_report.md}` (검증 보고서 03 은 작성 중일 수 있음). 요지: ctl `wr` 신설·`wa` 삭제, 두 리포 바이트 동일 `writeGate.js`(승인 앱 `src/integration/workforce/`, 워크포스 `src/integration/approval/`) + 승인 앱 대조 테스트, 워크포스 저장 전 ALLOW/DENY/DEFER 판정(DEFER = 저장 안 하고 승인 앱으로 넘김), 10분 유예, 기간 일괄 선판정.
C. **B 단계 가동·모달·이력** — 승인 앱 `ApprovalService.decideApproval` 의 `apply` 키를 `APPLY_KINDS` 로 제한 + `static/ui/src/entries/modal.jsx` `APPLY_NOTICE_KINDS`; `src/resolver/worklogCertification/worklogApprovalFacts.js` 공용 enrich(업무함·승인 관리), 엑셀 열 추가·승인 관리 엑셀 신설(`static/ui/src/features/approvalAdmin/exportApprovalAdminExcel.js`, `utils/excel.js` notice 인자); `locales/*/worklogHistory.json` 배지 문구.
E. **workforce-approval-display** — `_workspace/workforce-approval-display/{00_input/requirement.md,01_architect_design.md,02_workforce_report.md,03_verify_report.md}`. 요지: 워크포스 모든 워크로그 표시에 승인 배지, 집계는 월 경계(승인분 항상, 이번 달 UNSUBMITTED·PENDING 포함, 반려·만료·취소·문서 없음 제외, 지난달 승인분만), 원가 확정=승인분/예상=승인분+이번 달 결정 전. 검증 실패 F-1(협업 드로어 행 손실)은 수정 중.
D. 개발 사이트에서 통제 B 단계를 켰다(관문 자동 진단 5개 PASS, 사람 확인 3건은 메모 PASS). 코드 변경은 아니지만 `src/domain/worklogControl/gates.js`·`WorklogControlDiagnostics.js` 의 관문 설계가 "사람 확인을 메모만으로 PASS" 를 허용하는 것이 운영상 적절한지 의견.

## 질문 (전부 답할 것)
1. **B 가 정말 우회를 닫는가.** 워크포스 서버·UI 의 모든 worklog POST/PUT/DELETE 경로를 추적해, `wr` 없음·만료·서명 불량·`wa` 만 있는 구판 ctl·DEFER 사유 각각에서 "직접 쓰기"로 떨어지는 경로가 0 인지. 특히 `IssueWorklogControlService`·`LinkedWriteGate`·캘린더 drop·기간 일괄·10분 유예(출처 서명 자기 검증) 경로. 승인 앱 없는 단독 사용은 깨지지 않는지.
2. **판정 동일성이 실제로 보장되는가.** 승인 앱 대조 테스트(골든·무작위)가 비교하는 "실제 도메인 판정"이 승인 앱 화면 경로(작성·수정·삭제 resolver)가 쓰는 바로 그 함수인지, 아니면 별도 복제본인지. `wr` 생산(`WorklogControlCtl.bodyFor`)의 입력 병합이 승인 앱 화면 판정과 같은 `mergePolicy`·마감 행·예외 목록을 쓰는지. 타임존(`tz`)·주 단위·수동 마감·재개방이 `wr` 에 빠짐없이 실리는지. 빠지면 어떤 입력에서 두 앱 답이 갈리는지 구체 예 1개.
3. **승인 앱 백엔드 보고의 "발견"**: 프로젝트 전체 연동(ctl ALL_ISSUES)인데 이슈만 해제(rms.policy I: ctl NONE)된 경우 두 앱 판정 기준이 갈리는지 워크포스 `controlDoc.js`·`LinkedWriteGate.js` 로 확인. 갈리면 어느 쪽이 맞고 수정 지시.
4. **A 의 팀 구조 계약**: `orgCap.buildOrgTeam` 의 조상 올라가기·하위 팀장 포함이 승인 앱 `TeamScope`(열람 범위)·`candidates`/`requestAutomatically`(결재선)에서 대칭인지(불변식 7). 팀장 A 가 상위 팀장 B 가 있음에도 본인을 승인자로 직접 고를 수 있는 현행(W3)이 "팀장 부재를 자기 승인으로 처리하지 않는다"(CLAUDE.md) 와 충돌하는지, 충돌하면 최소 수정안. 명부(승인 앱 approver registry)와 함께 쓰는 사이트에서 최상위 팀장의 기본 승인자가 명부 팀장이 되는 W4 가 의도된 우선순위인지.
5. **ctl 즉시 게시 상한**(`src/permission/InvocationScope.js` `takeInvocationQuota`)의 요청 범위 저장소가 Forge 런타임 재사용·병렬 resolver 호출에서 누수·경합 없이 동작하는지. 트리거·큐 경로(요청 범위 밖)에서 "기록만" 하는 결정이 ctl 지연을 다시 만들지 않는지(어떤 경로가 해당되는지 나열).
6. **불변식 8·9**: 승인 앱 ctl PUT 은 asApp 게시 경로만인지, 워크포스 org·origin 쓰기는 본인 asUser 만인지, 워크포스가 `wr`·사용자 승인 상태 문서·인증 목록을 **서명 검증 없이** 읽는 지점이 없는지, 승인 앱이 `movesRms.org` 를 수신 캐시 밖에서 직접 믿는 지점이 없는지.
7. **SQL·호출량**: 새 테이블·인덱스·스케줄·consumer 없음 검증. `wr` 생산 SQL(일일 1 + 프로젝트당 4)과 `worklogApprovalFacts` enrich(화면당 ≤1)·승인 관리 엑셀(페이지당 1 + resolveUsers)이 유휴 예산 테스트에 고정됐는지. ctl 본문 30,000B 상한의 근거(Jira 엔티티 프로퍼티 32KB 한도 — 공식 문서 URL)와 서명 봉투 오버헤드 포함 여부.
8. **C 의 회귀**: `APPLY_KINDS` 제한이 필드 변경·상태 변경 모달 동작을 바꾸지 않는지, `WORKLOG_CREATE` 어댑터의 `{apply:null}` 반환이 다른 소비처(일괄 승인 `applyStatus`)에 영향 없는지. `utils/excel.js` notice 인자 추가가 기존 시트(틀 고정·자동필터 행 번호)를 바꾸지 않는지. 승인 관리 엑셀이 권한 범위(`listAllApprovals` 의 가시성 필터)를 그대로 쓰는지.
9. **롤백 조합표**: 승인 앱만 롤백(ctl 에 `wa` 있고 `wr` 없음) / 워크포스만 롤백(`wr` 있는 ctl 을 구판이 어떻게 해석) / 둘 다 — 각 칸에서 입력이 어디로 가는지와 위험.
10. **배포 전 필수 실측 최소 집합**과 개발 사이트 절차(두 보고서의 U-1·U-3~U-7·V-1~V-9·거부 3종·`expand=properties`·워크포스 manifest 모듈 삭제 major 여부·`.gitattributes` eol).
11a. **E 의 월 경계 규칙**이 승인 앱 문서의 start/end·사이트 타임존과 일관되고, 집계 화면들이 같은 `countableSeconds` 를 쓰는지, 새로 승인 판정을 붙인 화면에서 asApp 결과가 사용자 범위를 넘는 곳이 없는지(불변식 8 등가), 원가 확정/예상 분리가 맞는지.
11. **더 단순한 안**: 이번 묶음에서 빼거나 미룰 수 있는 것과 그때 사용자 요구("패널에서만 하지 말자", "팀장 본인 결재", "승인분 수정 불가하되 앱에서는 보임")를 어디까지 만족하는지 표로.

## 출력 형식
- `## 결론` (3~5줄)
- `## 질문별 판정` (1~11, 맞음/틀림/부분 + 근거 파일:줄)
- `## 결함·누락` (심각도 P0/P1/P2, 각 항목에 수정 지시 1~2문장, 담당 리포 표기)
- `## 권고안`
- `## 배포 전 필수 실측`
