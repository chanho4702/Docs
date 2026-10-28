# 검토 요청: 워크로그 통제권 이관 설계 (읽기 전용 독립 검토)

역할: 독립 검토자. **코드·문서를 수정하지 말 것.** 리포 `C:\CloudJira\moves-approval-jira` 와 `C:\CloudJira\moves-workforce` 를 직접 읽고, 결과는 한국어(코드 식별자는 영어). 근거는 파일:줄 또는 공식 문서 URL.

## 대상
- 요구: `_workspace/worklog-control/00_input/requirement.md` (§1 사용자 확정 요구)
- 설계: `_workspace/worklog-control/01_architect_design.md`
- 사용자 결정(설계 반영됨): 고객 권한 스킴을 건드리는 안은 무리 → 워크로그 `visibility` 를 앱 역할(`atlassian-addons-project-access`)로 제한하는 안을 1순위로. 워크포스는 연동 모드에서 asApp 으로 읽되 "내가 쓴 워크로그"만 보여 준다. 연동 이슈의 입력 창구는 워크포스 이슈 탭.

## 질문 (전부 답할 것)
1. **visibility 안이 실제로 "사용자가 Jira 경로로 수정·삭제 못 함"을 보장하는가.** Jira Cloud REST v3 공식 문서(OpenAPI: https://dac-static.atlassian.com/cloud/jira/platform/swagger-v3.v3.json)의 worklog PUT/DELETE/GET 권한 문구를 직접 확인. 작성자 예외 여부, Edit all worklogs 보유자(관리자)는 우회 가능한지, visibility 를 사용자가 다시 풀 수 있는지(PUT 으로 visibility 변경 시 필요한 권한).
2. **Forge 앱 사용자가 `atlassian-addons-project-access` 역할 멤버인지**(KB 가 Connect 기준이라는 설계의 지적), 아니면 visibility 대상으로 쓸 수 있는 다른 그룹/역할이 있는지. 안 되면 이 안 전체가 무너지는지와 대안.
3. 부작용 평가가 충분한가: 이슈 시간 집계(timespent), Jira 검색·리포트, 사용자 권한으로 읽는 다른 앱, 앱 제거 시 고아, 라이선스 만료 시 해제 경로, 승인 앱 팀장 인증 화면·내 타임시트(asUser 읽기) 누락(설계 §4.7). 빠진 것.
4. **불변식 8 예외**(asApp 결과를 작성자 본인에게 반환): 보안상 안전한 조건이 설계에 충분히 명시됐는지. 작성자 판정 우회 가능성(작성자 필드 위조 불가 여부, 워크포스 쪽 판정).
5. 다른 경로 생성 감지(§4.4, 작성 의도 테이블 + 90초 재확인)와 DELETE 모드 안전장치(§4.5 S1~S11): 오탐으로 정상 워크로그를 지울 경로, 경합.
6. 유휴 SQL 0 주장(AGENTS "유휴 비용")이 맞는가 — 새 스케줄/큐 작업 유무, 이벤트 경로 추가 SQL.
7. 기간 창(이슈 Start date~Due date): Start date 필드 탐색 방식의 함정.
8. **더 단순한 안이 있는가**: 예) visibility 는 "확정분(승인·인증)"만, 연동 이슈 전체 제한은 빼기 / 권한 회수안 / 둘 다 안 하고 감지+인증 제외만. 사용자 요구 §1 을 어디까지 만족하는지 표로.
9. 설계의 미검증 V1~V24 중 **배포 전에 반드시 실측해야 하는 최소 집합**과 그 실측 절차(개발 사이트에서 무엇을 해 보면 되는지).

## 출력 형식
- `## 결론` (3~5줄)
- `## 질문별 판정` (1~9, 맞음/틀림/부분 + 근거)
- `## 설계 결함·누락` (심각도 P0/P1/P2)
- `## 권고안` (사용자 요구 대비)
- `## 배포 전 필수 실측`
