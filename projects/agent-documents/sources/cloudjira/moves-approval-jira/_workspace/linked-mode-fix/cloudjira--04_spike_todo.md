# linked-mode-fix — 실측 목록 (승인 앱 몫, backend 1회차 작성)

| # | 항목 | 확인 방법 | 결과 |
|---|---|---|---|
| V1 | 이슈 신호(rms.policy I:) 최초 검증 직후 같은 요청 안에서 ctl PUT(asApp) 성공 | 새 연결 이슈(ARS-14 류) 화면 열기 → `workforce_publish` 의 `account_id='I:{id}', doc_key='ctl'` 행 `pending=0`·`published_at` 갱신 + REST `GET /rest/api/3/issue/{id}/properties/movesApproval.ctl` 200 | 미검증 |
| V2 | 워크포스가 채운 `movesRms.org` 를 5분(ORG_MAX_AGE_MS) 안에 수신 | Tom Kim 이 워크포스 열기 → 5분 뒤 승인 앱 설정 "내 Workforce 결재자 구성" `isWorkforceTeamLead:true` | 미검증 |
| V5 | 설정 화면이 채워진 `leaders`·`ledTeams`·팀 탭 `memberKeys` 표시 | 스크린샷 | 미검증 |
| V6 | `listDue(now,200)` 밖으로 밀린 ctl 행 | 개발 사이트 due 행 수 확인, 일일 스윕 로그 | 미검증 |
| R3 | ARS-14 작업 로그 상세 → 승인 요청: 후보에 본인(팀장) 포함, 기본 승인자 = 상위 팀장(없으면 본인) 자동 선택 | 터널 실측 | 미검증 |
| R1-b | 설정 "전체 재게시(ALL)" 뒤 KVS `approval:link:ctlScan` 삭제 → 다음 일일 스윕에서 ctl·flows 전량 touch | 스윕 후 `workforce_publish` ctl 행 `updated_at` | 미검증 |
