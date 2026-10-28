# 협업 모드 backend 보완

## 상태·응답 계약

- `CollabAccess.describeCollabAccess`: SQL 오류는 `reason:UNAVAILABLE`, `readAuthority:user`. 실제 OFF와 분리했다.
- `getProjectCollabAccessService`: UNAVAILABLE은 `LogicalError(COLLAB_ACCESS_UNAVAILABLE)`를 던져 guardedDefine의 `{success:false,error}` 경로로 전달한다. 정상 content shape 불변.
- `collabAccessError`: 같은 오류 코드로 전용 조회·coverage를 거부한다. coverage의 OFF+writer 예외로 SQL 오류를 우회하지 못한다.
- `resolveCollabReadAuthority`: 간트·대시보드는 계속 user로 제한한다.
- 예외에 원문 SQL·바인딩 accountId를 실어 보내지 않고, CollabAccess의 SQL 원문 진단 로그를 제거했다. 신규 resolver·permission·manifest·schema 변경 없음.

## coverage 캐시·요청 비용

- 사용자 완성 응답 키 `Collab:coverage:v2:<projectId>:<accountId>:reader|writer`. 서버의 현재 권한과 프로젝트 참여 확인 이후 읽는다. TTL 2분 불변. 구 키를 재사용하지 않는다.
- 앱 검색에 이슈가 반환된 프로젝트의 BROWSE는 그 검색 결과로 확인한다. 검색에 없던 구독/본인 전용 프로젝트만 `mypermissions`를 조회한다. 검색에 안 나온 프로젝트를 false로 추정하지 않는다.
- Jira 검색의 BROWSE 및 issue security 필터는 [공식 POST /search/jql 문서](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/#api-rest-api-3-search-jql-post)의 권한 계약을 확인했다.
- 101개 스페이스에 앱이 실제 이슈를 반환하는 테스트에서 앱 권한 재요청 0회를 확인했다. 검색으로 확인되지 않은 구독 스페이스는 최초 100개까지만 확인하고 초과분은 null/truncated로 남긴다.
- 전역 single-flight는 사용자·사이트 컨텍스트를 공유할 위험이 있어 추가하지 않았다. KVS TTL·총 요청 예산·동시성 상한은 유지한다. 실제 운영 지연은 미측정이다.

## 워크로그

`02_worklog_report.md` 참조. 1,000이슈 상한 절단·메모리 보관 상한 및 v2 집계 캐시 키를 적용했다.

## 검증

- `npm test -- --runInBand --testPathPatterns='CollabAccess|ProjectCollabService|CollabCoverageService'`: 3 suites / 43 tests 통과, exit 0.
- unknown-column/timeout 구분, raw SQL 미노출, SQL 장애 시 writer coverage 차단, 권한 승격·회수 시 캐시 분리, 구 캐시 불사용, 불필요 BROWSE 요청 제거를 검증했다.
- 앱 루트 `npm test -- --runInBand`: 144 suites / 1,965 tests 통과, exit 0. 62.745초. 최종 backend 변경이 모두 포함된 상태에서 실행했다.
- 최종 통합 검증 결과는 03_verify_report.md에 기록한다.
