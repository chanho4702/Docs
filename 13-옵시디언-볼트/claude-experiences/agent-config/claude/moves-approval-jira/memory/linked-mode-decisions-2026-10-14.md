---
name: linked-mode-decisions-2026-10-14
description: "2026-10-14 사용자 결정 — 워크포스 Jira 이슈 패널 제거, 팀장 본인 결재 허용(위 팀장 없으면), W-8a 는 본인 org 문서 asUser 경로로"
metadata:
  node_type: memory
  type: project
  originSessionId: 4b2db3b4-8d9f-459e-a8ae-6678a2d27fe8
  modified: 2026-10-14T06:23:55.684Z
---

2026-10-14 ARS-14 실측 뒤 사용자가 확정한 것 (작업 slug `linked-mode-fix`, `_workspace/linked-mode-fix/`):

- **워크포스의 Jira 이슈 패널(jira:issueActivity·issueContext)은 없애도 된다.** 연동 모드 입력 창구는 승인 앱 이슈 화면 + 워크포스 앱 내부 화면만.
- **팀장은 본인 결재가 가능해야 한다.** 팀장의 결재는 위 팀장, 위가 없으면 본인(설계 W-8a/Q16). 팀원 기본 승인자 = 소속 팀장.
- W-8a(팀 구조 게시)는 워크포스가 **본인 `movesRms.org` 를 asUser 로 쓰는 기존 경로**에 팀 칸을 채우는 방식. 앱의 타 사용자 프로퍼티 쓰기(G1 미검증)는 쓰지 않는다.

- **워크포스 앱 내부 입력을 다시 연다**(slug `workforce-input-reopen`). "진입점이 하나였으면"(10-13)의 뜻은 "Jira 패널에서만 하지 말자"였고, 승인 앱 하나로 묶은 linked-mode-ux ① 은 오해. 단 워크포스는 저장 전에 승인 앱 규칙(작성 기간·사전 승인·승인분/마감 잠금)을 판정해야 하며 우회 복원은 금지.

**Why:** 승인 앱 ctl 문서는 일일 스윕에서만 등록돼 연결 직후 패널이 중복됐고, 워크포스가 팀 구조를 게시하지 않아 `isWorkforceTeamLead` 가 항상 false 였다(Tom Kim 문서 leads 비어 있음 실측).
**How to apply:** 자기 승인·기본 승인자 로직을 손댈 때 이 결정을 전제로. 워크포스 이슈 패널을 되살리자는 제안은 하지 않는다. 관련: [[worklog-certification-model]]
