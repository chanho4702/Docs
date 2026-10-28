# worklog-control — 실측 관문 목록 (배포 후 dev 사이트)

> 정리: 2026-10-11 리더. 원본은 `02_backend_report.md` §10, 관문 정의는 `01_architect_design.md` §10, 절차는 `codex-review.md` "배포 전 필수 실측".
> 진단 도구(설정 > 워크로그 통제 > 진단)가 자동 부분을 돌리고 결과를 관문 기록으로 남긴다. **B~D 스위치는 해당 관문이 PASS 로 기록돼야 저장된다.**
> 시험 계정: 작성자 A, 다른 사용자 B, A 의 팀장 L, 다른 팀장 L2, Edit/Delete all 보유 관리자 M(제한 대상 역할 비멤버). 통과 기준은 응답 코드가 아니라 **실제 기록 불변**.

## 우선순위 (먼저 해야 방향이 갈린다)
1. G_ROLE — 두 Forge 앱 계정이 제한 대상 역할 멤버인지. 실패하면 visibility 안 전체를 재검토.
2. G_PRESERVE — visibility 만 PUT 해서 다른 값이 보존되는지, null 로 해제되는지.
3. G_BLOCK — A·B·M 이 숨긴 워크로그를 GET/PUT/DELETE 못 하는지(API 토큰 REST 포함).
4. G_POST — 작성 시점에 제한 visibility 를 같이 넣을 수 있는지(안 되면 등록 직후 공백 측정).
5. G_HANDOFF — 워크포스 탭 → 승인 앱 하위 경로 넘김이 실제로 동작하는지.

## 관문 표
| 항목 | 관문 | 비고 |
|---|---|---|
| 앱(Forge) 계정이 `atlassian-addons-project-access` 멤버인가, Edit/Delete all 보유 | G_ROLE | KB 는 Connect 로만 기술 |
| visibility 만 PUT 수용·값 보존·`visibility:null` 로 해제 | G_PRESERVE | 실패하면 후퇴 모드(값 전체 PUT) 미구현 — C 금지로 처리 |
| 제한분에 작성자·관리자 직접 GET/PUT/DELETE 차단 | G_BLOCK | 일반 사용자·토큰·모바일은 수동 |
| asUser POST 에 제한 visibility 동봉 가능 | G_POST | 불가면 POST→PUT 공백 존재 |
| asUser GET 이 숨김분에 404 인지 403 인지 | G_BLOCK | 둘 다 숨김 후보로 처리 |
| 이슈 집계(timespent)·JQL·리포트 | G_AGG | 진단은 asApp timespent 만 자동 |
| `notifyUsers=false` 를 앱이 쓸 수 있나 | G_PRESERVE | |
| 제한 PUT 400 = 닫힌 이슈 | G_PRESERVE(closedIssueId) | D14 |
| asApp PUT 시 author 유지·updateAuthor=앱, asApp DELETE 이벤트 행위자 | G_PRESERVE·G_ORIGIN | 귀속은 op 일치로만 |
| 타 앱 프로퍼티 `expand=properties` 읽기 | G_ORIGIN | 워크포스 출처 증명 전제 |
| Start date 필드 탐색·응답에 칸 존재 여부 | G_FIELD | 칸 없음 = 미해결 |
| `getAppContext().appAri.appId`·`environmentAri.environmentId` 형태, 전역 페이지 하위 경로 | G_HANDOFF | 모르면 ctl `ui.globalPagePath:null` |
| `preUninstall` 실행·55초 | G_RECOVER(수동) | |
| team-managed 프로젝트 | G_TEAM_MANAGED | |
| 워크포스 WF-7~13 | G_WF·G_LINK·G_HANDOFF | 이 하네스 범위 밖 — WF-9 전까지 통제용 연동은 사실상 false, WF-12 전까지 연동 사이트 DELETE 저장 불가 |
| Forge Queue `payload` 크기·delay 900 이하 | — | 사용 지연 90·600초 |

