# 기능 실측 메모 (2026-10-20, dev)

| # | 작업 | 화면 | 결과 | resolver 응답(가로챔) |
|---|---|---|---|---|
| F01 | org.teams (AP→WF) | 승인 설정 > 승인 기간·팀 > 팀 "워크포스에서 받은 팀" | **실패** "워크포스가 응답하지 않습니다"(콜드·웜 모두) | `listWorkforceTeams` → `WORKFORCE_UNAVAILABLE`, cause.reason **`ACTOR_NO_ACCESS`** |
| F02 | org.get (AP→WF) | 승인 기간·팀 > 정책 "내 Workforce 결재자 구성" | 표시됨: 내 팀 A-2, 팀장 Rax Yang (캐시일 수 있음 — 72h STALE) | 미확인 |
| F03 | link.resolve (AP→WF) | WORK-104 Work log 탭 | 응답 정상, `linked:false`(비연동 이슈), `linkUnavailable:false` | `getLinkedIssueOverview` success |
| F04 | flows.list 이전 단계 | 워크포스 프로젝트 "approval 연동 테스트" > 작업 관리 | **실패** | `listIssueApprovalSettings` → `ISSUE_SETTING_UNREADABLE` "batchGet failed" |

F01 원인 후보: 워크포스 가드 `resolvePrincipal` → `checkAdministerPermission()` 가 **asUser** `/mypermissions` — webtrigger 안에는 사용자 세션이 없어 실패(스파이크 S2) → 가드 거부 → TeamsReadApi 403 → orgTeams `ACTOR_NO_ACCESS`. apiRoute 경로는 3LO 사용자라 같은 코드가 200.
F04 원인 후보: KVS `batchGet` 이 **없는 키**를 failedKeys 로 돌려줄 가능성(설정이 하나도 없는 프로젝트) — 실측 필요.

## 수정 후 재실측 (워크포스 10.2.0, 승인 앱 5.5.0)
| # | 작업 | 결과 | 근거 |
|---|---|---|---|
| F01 | org.teams | **통과** — 팀 3개(A팀·A-1·A-2), 팀장·팀원 수, 상태 "확인됨" | F01c, `listWorkforceTeams` success, state VERIFIED |
| F04 | 이슈 승인 설정 목록 + flows.list | **통과** — 5개 이슈, `flowsByProject` 수신(결재선 미정의라 options []) | F04b, `listIssueApprovalSettings` success |
| F03 | link.resolve + kb.get (연동 이슈 VODF-2) | **통과** — `linked:true`, `layout:LINKED`, kpi.basis{dayMinutes:480, monthWorkdays:22} | F03b |
| F05 | cert.query | 통과 — My Work 달력 잠금 아이콘, "확인 중 N시간 제외" | F05 |
| F06 | issue.control | 통과 — 승인된 워크로그 모달 "승인됨·수정 불가", 응답 linked/channel OPEN/hidden(작성자 본인분) | F06, `getIssueWorklogControl` |
| F07 | write.judge → write.commit (워크포스 입력, VODF-2 10/20 1h) | **통과** — `createIssueWorklog` `{id:24598, signed:true, approvalStatus:PROCESSING}` | F07a·F07b |
관찰: 워크포스 모달 "Worklog 작성자: 할당되지 않음" 표시(기존 화면 동작인지 확인 필요).
