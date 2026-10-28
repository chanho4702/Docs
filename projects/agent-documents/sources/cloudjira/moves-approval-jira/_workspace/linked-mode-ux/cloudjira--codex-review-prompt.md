# 검토 요청: 워크포스 연동 모드 UX 통합(linked-mode-ux) — 설계 + 구현 독립 검토 (읽기 전용)

역할: 독립 검토자. **코드·문서를 수정하지 말 것.** 리포 `C:\CloudJira\moves-approval-jira`(승인 앱)와 `C:\CloudJira\moves-workforce`(워크포스)를 직접 읽는다. 두 리포 모두 **작업 트리의 커밋 전 변경이 검토 대상**이다(`git diff`·`git status` 로 범위 확인). 결과는 한국어(코드 식별자는 영어). 근거는 파일:줄 또는 공식 문서 URL.

## 대상
- 요구: `_workspace/linked-mode-ux/00_input/requirement.md` (끝의 "설계 열린 질문에 대한 답" 절이 최종 결정)
- 설계: `_workspace/linked-mode-ux/01_architect_design.md`
- 구현 보고: `02_backend_report.md`(승인 앱 BE, §0 설계와 다른 점 D1~D11), `02_frontend_report.md`(승인 앱 FE), `05_workforce_report.md`(워크포스)
- 사용자 결정 요지: 연동 모드의 워크로그 **쓰기 창구는 승인 앱 하나**(워크포스 화면은 넘김 버튼만). 이슈 화면은 기록·보기·승인 요청·이력 네 가지만, 이슈별 정책 편집은 설정 화면(단독: 승인 앱 프로젝트 설정 / 연동: 워크포스 작업 관리 승인 설정 표). 결재자 표시는 서명된 org 게시물만 원천(워크포스 DB 무증가). 메뉴는 일반/팀장/관리자 세 층.

## 질문 (전부 답할 것)
1. **창구 통일이 실제로 닫혔는가.** 연동 모드·연동 이슈에서 워크포스의 어느 화면·resolver 경로로도 Jira 에 worklog POST/PUT/DELETE 가 나가지 않는지 코드로 추적(마이워크 모달·WorklogPage·캘린더 drop·이슈 패널·행 액션·일괄 입력·드래그·기간 입력, 그리고 서버 `createIssueWorklogService` 의 plain/DIRECT 분기). 판정 실패(조회 실패·연동 확인 불가)가 "직접 쓰기"로 떨어지는 경로가 남았는지. 승인 앱 없는 단독 사용은 깨지지 않았는지.
2. **승인 앱 쪽이 연동 이슈 작성을 여는 변경**(`WorklogControlContext.channel` APP 고정, `linkedInputChannel` 키 삭제)이 통제·탐지(`LINKED_DIRECT_WF`, DELETE 관문, origin 봉투 cap 신호)를 느슨하게 만드는 지점. 설계 §0 Q1 의 "cap 신호를 조회 때도 게시"가 워크포스에 실제로 구현됐는가.
3. **계약 변경(`rms.issue` v2 `pol`/`fl`, `approval.flows`)의 안전성**: 두 리포 contract.js·vectors.json 바이트 동일 여부(실제 해시 계산), 구판 호환 규칙(키 부재 = 미설정, ctl `rx` 토큰으로 쓰기 제한)이 양쪽 롤백 조합(승인 앱만 롤백 / 워크포스만 롤백)에서 어떤 상태를 만드는지 표로. 서명 검증에서 `pol` 닫힌 키 집합·`fl` UUID 검사 누락 경로.
4. **"더 엄한 쪽 적용"**: `stricterSetting(a,b,base)` 와 `linkedWithBase` 가 설계 §6.3 을 만족하는가. 백엔드 보고의 결정 보류 항목(충돌 없는 단일 문서의 `pol` 은 사이트 정책보다 느슨해도 그대로 적용 — Q139-Q1 "팀장 값 우선") 이 보안·운영상 수용 가능한지, 아니면 최소 하한(예: 사이트 `BLOCK` 상한) 은 넘지 못하게 해야 하는지 판단.
5. **권한 범위(불변식 7)**: `listAllApprovals`(admin 축)가 건별 이슈 열람·타임시트 기존 열람 규칙(Q144)을 실제로 다시 좁히는지, `listIssueWorklogExceptions`·`lookupProjectIssue`·`selectIssueWorklogApprovalFlow`(project admin 축, projectId 필수)에서 **다른 프로젝트 이슈 id 를 넣는 우회**가 막히는지, `listWorkforceTeams`(admin)가 수신 캐시 밖의 사용자 프로퍼티를 읽지 않는지, `getPrincipalContext.isAdmin` 이 서버 판정과 같은 원천인지(프론트의 '관리' 묶음 숨김은 UX 이고 가드는 서버 — 둘 다 확인).
6. **SQL·호출량**: 새 테이블·인덱스 없음 주장 검증, `idleSqlBudget` 불변, `listAllApprovals` 최악 8+2N 상한 테스트의 타당성, `touchDocKey`(`WHERE doc_key = ?` 전체 스캔) 비용, 독촉 하루 1회의 결정적 이벤트 id(불변식 6). 유휴 상태에서 새로 생기는 스케줄·큐 작업이 없는지.
7. **프론트 경계면**: resolver 실제 응답 shape(`{success, content}`) ↔ 프론트 소비 지점이 어긋난 곳(특히 `policy.selectedFlow`, `control.channel` 제거, `managedBy`, 감사 `area:'worklogApproval'/action:'bindIssue'` i18n). URL 읽기 호환(`tab=done`→내 이력, 설정 > 기록 → 1차 메뉴, `section`·옛 `setting=`). CRA 엔트리 3곳 규칙·i18n merge 누락.
8. **이슈 화면 원칙 준수**: 승인 앱 이슈 화면(우측 칸·패널·작업 로그 탭·Log work·상세 모달)과 워크포스 이슈 패널에 "이슈별 정책을 편집하는 UI"가 하나라도 남았는가. 남긴 읽기 전용 한 줄의 문구가 사용자에게 "어디 가서 설정하라"를 알려 주는가.
9. **더 단순한 안**: 이번 구현에서 뺄 수 있는 것(예: ④b `approval.flows` 계약 없이 결재선 선택을 승인 앱 프로젝트 설정에만 두기, '승인 관리' 독촉 제외)과 그때 사용자 요구를 어디까지 만족하는지 표로.
10. 두 보고서의 미검증(U-3·U-4·U-5·U-7·V-8·V-9 등)과 설계 §14 중 **배포 전에 반드시 실측해야 하는 최소 집합**과 개발 사이트에서의 실측 절차.

## 출력 형식
- `## 결론` (3~5줄)
- `## 질문별 판정` (1~10, 맞음/틀림/부분 + 근거 파일:줄)
- `## 결함·누락` (심각도 P0/P1/P2, 각 항목에 수정 지시 1~2문장)
- `## 권고안`
- `## 배포 전 필수 실측`
