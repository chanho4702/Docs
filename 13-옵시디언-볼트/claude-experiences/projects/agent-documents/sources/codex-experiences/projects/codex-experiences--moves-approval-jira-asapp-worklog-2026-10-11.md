# Jira 워크로그 asApp 생성 검토 — 2026-10-11

사용자는 워크로그 작성에 asApp 사용을 허용했다. 구현 전 타당성 확인 단계이며 코드는 변경하지 않았다.

- 공식 OpenAPI Worklog.author 및 updateAuthor는 readOnly:true. 표준 생성 API로 실제 작업자를 임의 지정하는 설계는 지원되지 않는다.
- asApp은 앱 사용자의 권한으로 요청한다. 일반 사용자의 Work on issues 권한을 없애도 앱이 필요한 권한을 가진 경우 호출 가능한 구조다. 현재 사이트에서 권한 분리 실측은 미완료.
- 일반 사용자 차단과 다른 앱/자동화 차단은 별개. 앱 공용 역할을 허용했다고 우리 앱만 허용된 것은 아니다.
- WorklogCollector.js:147은 Jira author.accountId로 본인 워크로그를 골라낸다. 앱 작성자로 전환하면 실제 작업자 소유권 매핑, 집계, 승인, 이력, Workforce 연동 검토가 필요하다.
- Forge CLI 로그인은 확인했지만 forge install list가 The app is not installed anywhere.를 반환했다. 현재 앱 ID/로그인 기준 설치 대상이 없어서 실제 asApp 생성 시험을 수행하지 못했다.

근거:
- https://dac-static.atlassian.com/cloud/jira/platform/swagger-v3.v3.json
- https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-worklogs/
- https://developer.atlassian.com/platform/forge/apis-reference/fetch-api-product.requestjira/

[[projects/agent-documents/sources/codex-experiences/projects/codex-experiences--moves-approval-jira-hardening-2026-10-10|moves-approval-jira-hardening-2026-10-10]]

## 설계서 작성
저장소 docs/APP-MANAGED-WORKLOG-DESIGN.md에 설계 초안을 작성했다. 사용자에게 Jira 앱 작성자 표시를 수용받았으나 실제 작업자 원장 및 연동 비용은 추가 설명 대상이다. 기존 Forge SQL에 ID 매핑을 두고 Jira 현재 시간과 결합한다. Jira 표준 사람별 통계는 별도 연동 없이는 충족되지 않는다. 코드 구현은 변경하지 않았다.

## properties 우선 개정
사용자는 별도 작업자 원장의 비용을 우려하며 워크로그 자체 저장을 요청했다. docs/WORKLOG-IDENTITY-PROPERTIES-DESIGN.md를 최신안으로 작성하고 1판의 SQL 소유권 원장/매핑 게시물 제안을 대체한다고 명시했다. 최종 worklog ID에 결속된 서명 property가 소유권 근거이며, POST 후 property PUT/재조회가 필요한 두 단계다. 기존 intent/op·통제 SQL은 유지하고, expand와 사람별 후보 검색 비용을 실측 전 절감으로 단정하지 않는다. Jira 기본 작성자 통계 한계는 동일하다.

## 2026-10-12 운영 부담 논의 보존
사용자는 개발 공수보다 저장·API 호출·집계·복구의 지속 비용을 질문했다. docs/WORKLOG-INPUT-CONTROL-DISCUSSION.md에 asUser 화면/서버 통제와 asApp 권한 회수 대안을 비교해 보존했다. asApp 수용은 최종 선택이 아니며 현재 방식은 미확정이다. API 우회 차단이 필수가 아니면 asUser 유지의 추가 부담이 작다. 기존 asApp 설계 상단에도 선택 미확정 상태와 논의 링크를 추가했다. 비용 금액·절감률은 미산정, 과거 개발 일정은 거친 추정으로 구분했다.
