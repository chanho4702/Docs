# Jira 플랫폼 참고 (2026-10-03)

> 등급: **실측**(dev 사이트에서 확인) / **문서**(공식 문서 확인, 실측 전) / **미검증**(추정). 실측하면 등급을 올리고 날짜를 적는다.

## 목차
1. 모듈
2. 워크로그 REST
3. 권한·검색
4. 엔티티 프로퍼티
5. 이벤트

## 1. 모듈

| 모듈 | 용도 | 등급 |
|---|---|---|
| `jira:timeTrackingProvider` (Preview) | 관리자가 선택하면 기본 Log work 버튼·작업 로그 탭 숨김. 대체 UI 는 `jira:issueAction`·`jira:issueActivity`. 사이트당 하나. display condition `timeTrackingProviderEnabled` | 문서 |
| `jira:globalPage` | 업무함·내 타임시트·팀장 매트릭스 | 문서 |
| `jira:issuePanel` / `jira:issueContext` / `jira:issueAction` | 이슈 화면 진입점 | 문서 |
| `jira:projectSettingsPage` / `jira:adminPage` | 설정 | 문서 |
| `jira:workflowValidator` (함수형) | 전환 차단. team-managed 지원 여부 미확인 | 문서 / 미검증 |
| 트리거 `avi:jira:{created,updated,deleted}:worklog` | 변경 감지 | 문서 |

## 2. 워크로그 REST

| API | 메모 |
|---|---|
| `GET /rest/api/3/issue/{id}/worklog` | 이슈별. `expand=properties` 로 프로퍼티 동봉(타 앱 프로퍼티 포함 여부 미검증) |
| `POST /rest/api/3/worklog/list` `{ids:[…]}` | id 일괄 조회(최대 1000) |
| `GET /rest/api/3/worklog/updated?since=` / `deleted?since=` | 누락 보정 커서. 응답 `values[].worklogId`, `lastPage`, `until` |
| `POST/PUT/DELETE /rest/api/3/issue/{id}/worklog[/{worklogId}]` | 쓰기. asUser 면 작성자가 사용자 |

사용자×기간 워크로그 수집: `search/jql` 로 `worklogAuthor = <accountId> AND worklogDate >= <start> AND worklogDate < <end>` 이슈를 찾고, 이슈별 워크로그를 받아 작성자·`started` 로 다시 거른다(JQL 은 이슈 단위라 다른 사람·다른 기간 워크로그가 섞여 온다). 이슈 수가 많으면 동시성 상한.

## 3. 권한·검색

- `POST /rest/api/3/permissions/check` — `projectPermissions:[{permissions:['BROWSE_PROJECTS'], issues:[…]}]` 로 건별 열람 가능 여부를 한 번에(문서).
- `POST /rest/api/3/search/jql` — 구 `/search` 대체. 페이지는 `nextPageToken`(문서).
- 시간 추적 권한: Work on work items / Edit·Delete own·all worklogs. 기간 조건 없음(문서).

## 4. 엔티티 프로퍼티

- 이슈 `/rest/api/3/issue/{id}/properties/{key}`, 워크로그 `/issue/{id}/worklog/{wid}/properties/{key}`, 사용자 `/rest/api/3/user/properties/{key}?accountId=`, 프로젝트 `/project/{id}/properties/{key}`.
- 값 최대 32KB. **편집 권한자 누구나 쓸 수 있다 → 판정 금지, 서명 검증 후 표시용**.
- 앱이 타 사용자 프로퍼티를 쓸 수 있는지 미검증.
- 워크포스가 쓰는 키: `movesRms`, `movesRmsLink`, `movesDocs`(이슈). 충돌 금지. 이 앱의 키 접두어는 `movesApproval`.

## 5. 이벤트

- 워크로그 이벤트 페이로드에 삭제 시 본문이 실리는지 미검증 → 마지막 스냅샷으로 보완.
- 이벤트 누락률 미검증 → 일일 스윕(`worklog/updated`·`deleted` since)으로 보정.
