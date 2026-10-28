# 백엔드 계약 검증 결과

## 결론

백엔드·DB·KVS·manifest 변경은 필요 없다. 이 기능은 Custom UI의 `@forge/bridge` `requestJira()`가 호출 사용자 권한(`asUser`)으로 Jira Worklog REST API를 직접 호출하는 기존 경로의 form 값만 바꾸는 작업이다.

## 확인한 호출 계약

`static/ui/src/utils/jiraApi/requestJira.js`

| 호출 | HTTP | URI | body |
| --- | --- | --- | --- |
| `executeRequest('addWorklog', body, { issueIdOrKey })` | `POST` | `/rest/api/3/issue/{issueIdOrKey}/worklog` | `{ comment, started, timeSpentSeconds }` |
| `executeRequest('updateWorklog', body, { issueIdOrKey, id })` | `PUT` | `/rest/api/3/issue/{issueIdOrKey}/worklog/{id}` | `{ comment, started, timeSpentSeconds }` |
| calendar drag/drop `updateWorklog` | `PUT` | 동일 | `{ started }` |

시간 범위 UI는 `started`를 시작 시각으로 만들고 `(end - start) * 60`을 `timeSpentSeconds`로 전송하면 된다. Jira API가 저장하는 필드 및 URI는 기존과 동일하다. `204` 응답은 helper가 빈 문자열로 반환하고, HTTP 오류는 `{ success: false, error }`로 resolve하므로 frontend의 `ensureWorklogResult` 처리도 유지해야 한다.

## 권한·scope 확인

- `manifest.yml`에 `read:jira-work`, `write:jira-work` scope가 이미 선언돼 있다.
- `WorklogModal`은 저장 전 `GET /rest/api/3/mypermissions`로 `WORK_ON_ISSUES` 또는 `EDIT_OWN_WORKLOGS`를 확인한다. 확정 거부(`false`)만 차단하며, 최종 인가는 Jira `asUser` 호출이 수행한다.
- `src/index.js`, `PermissionMap.js`, resolver/controller/service/repository에는 Worklog 등록·수정 경로가 없다. 새 resolver를 추가하면 direct `asUser` 권한 모델과 중복되므로 추가하지 않는다.

## 저장소 영향

- Forge SQL/KVS schema 및 migration: 변경 없음.
- `worklog_issue_daily` 집계는 Jira worklog 변경 뒤 기존 수집 흐름으로 갱신된다. 시간 입력 방식 변경만으로 새 저장소 계약이 생기지 않는다.

## 검증

`npm test -- --runInBand` (repository root)

- 110 suites passed
- 1,488 tests passed
- exit code 0

테스트 출력의 `console.error`는 의도적으로 오류 경로를 검증하는 기존 mock 로그이며, 실패는 없다.
