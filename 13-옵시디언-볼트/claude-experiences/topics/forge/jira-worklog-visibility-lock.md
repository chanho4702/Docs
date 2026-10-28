# Jira 워크로그 visibility 를 잠금으로 쓰기 (2026-10-08)

**문제**: Jira 에 워크로그 쓰기 검증 훅이 없어 "마감 후 수정 금지"를 사전 차단할 수 없다고 봤다(권한 스킴 회수만 가능).

**발견**: 워크로그 `visibility` 는 조회만이 아니라 **수정·삭제·해제까지** 막는다. PUT/DELETE 문서 권한 조건에 "visibility 가 걸린 워크로그는 그 그룹·역할 구성원이어야 한다"가 `Edit all worklogs` 와 별개로 들어 있다. Forge 앱은 모든 프로젝트의 `atlassian-addons-project-access` 역할 구성원이고, 이 역할은 **시스템 역할이라 관리자도 사람을 못 넣는다**. 따라서 앱이 asApp 으로 이 역할 가시성을 걸면 사람 전원이 손을 못 대고 앱만 풀 수 있다.

**실측으로 확인한 함정**
- 설정자도 구성원이어야 한다 → 사람 자격(asUser·Postman)으로는 400. 재현이 안 되는 게 정상.
- 그룹 가시성은 Jira 기본 설정("프로젝트 역할만")에서 꺼져 있다 → 역할 경로만.
- 전역 `GET /rest/api/3/role` 에 같은 이름 역할이 여러 개 → `GET /project/{key}/role` 에서 id 를 잡는다.
- 팀 관리형 역할명은 `Administrator`(단수), 회사 관리형은 `Administrators`.
- 무료 플랜은 역할 명단 편집 불가.
- 구성원 본인에게는 숨겨지지 않는다 → 숨김은 역할 밖 계정에서만 관측.
- API 토큰은 Basic(이메일:토큰). Bearer 로 보내면 익명 처리돼 404 "Issue does not exist".

**대가**: 잠긴 건은 asUser 조회에서 사라지므로 **앱의 워크로그 읽기 경로 전부를 asApp 으로** 바꾸고 스코프 판정으로 다시 닫아야 한다. 앱 제거 전 전체 해제 절차 필수(제거되면 아무도 못 본다). 같은 역할의 다른 앱(Tempo 등)은 본다.

**미실측**: 잠긴 뒤 `timespent` 합계 포함 여부, 작성자 GET/PUT/DELETE 실제 코드(404 예상).

**사고 교훈**: 검증 스크립트는 **선행 단계 실패 시 반드시 멈추게** 쓴다(역할 추가 실패 뒤 그대로 내려가 남의 워크로그를 지웠다). 삭제가 섞인 시퀀스는 자체 생성한 프로브 데이터만 대상으로 한다. 웹트리거 모듈 추가도 `MAJOR_VERSION_RULE`(RoA 신호)을 밟는다.

관련: [[2026-09-29-worklog-governance-analysis]] · [[forge-marketplace-review-and-remote]] · [[2026-09-30-collab-mode]]
