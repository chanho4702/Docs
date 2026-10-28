# 협업 워크로그 조회 보완 보고서

- 기준: 2026-09-30, HEAD `bad31d94a6b137c6baaf8bcb2433884978c4fad2` + 현재 작업 트리.
- 작업 경로: `C:\CloudJira\moves-workforce`.
- 담당 범위: `CollabWorklogFetcher`의 검색 상한·공유 요청 예산 경계와 기존 집계 캐시 교체. `forge-backend-dev` 스킬 적용.
- 기존 사용자 변경 및 다른 작업자 변경 보존. 커밋·푸시·배포·설치·DB 조작 없음.

## 수정

1. `getProjectWorklogsAsApp`가 이슈 1,000건에 도달했고 다음 검색 커서가 있으면 `truncated:true`로 반환한다. 정확히 1,000건이고 다음 커서가 없으면 `false`를 유지한다.
2. Jira 검색 응답이 남은 상한보다 많은 이슈를 반환한 경우에도 잘린 항목을 감지해 `truncated:true`로 반환한다. 검색 페이지마다 최대 잔여 상한까지만 누적한다.
3. 마지막 검색 요청의 `maxResults`를 잔여 상한으로 제한하고 수집 직전 배열 전체 복사를 제거했다. 기본 100건 페이지, 1,000이슈 상한, 300회 공유 요청 예산, 워커 5개는 유지한다.
4. 수정 전 `truncated:false` 집계가 10분 캐시에서 재생되지 않도록 `Collab:v2:Date:` / `Collab:v2:UserDate:` 키로 전환했다. 앱/사용자 캐시 분리와 TTL 10분을 유지한다. 기존 캐시는 직접 삭제하지 않으며 기존 TTL로 만료된다.

변경 파일:

- `src/api/jira/worklog/CollabWorklogFetcher.js`
- `src/api/jira/worklog/__test__/CollabWorklogFetcher.test.js` — 신규 경계 테스트 11건.
- `src/resolver/projectDashboard/__test__/DashboardCollabCacheKeys.test.js` — v2 키 기대값 및 이전 잘못된 캐시 무시 회귀 2건. 리더가 소유권 확대 승인.

`src/resolver/projectCollab/__test__/CollabWorklogServices.test.js`는 수정 없이 기존 회귀만 실행했다.

## 응답·권한 계약

- 페처: `{ worklogs: Array, truncated: boolean }`. 집계 함수: `{ rows: Array, truncated: boolean }`. 기존 필드·DTO 유지.
- 직접 소비자는 `aggregateCollabWorklogsByDate`, `aggregateCollabWorklogsByUserDate`이며, `ProjectDashboardService.getChartDataset`의 `heatmap` / `lineStack` 분기가 집계 결과를 사용한다. 절단 시 기존 `chartData.truncated:true` 전달 경로가 동작한다.
- 실제 resolver는 `getChartDataById`, `getChartData`다. `ProjectDashboardController`의 `guardedDefine` 등록, `src/index.js`의 `CONTROLLER_REGISTRARS` → `registerProjectDashboardController`, `PermissionMap`의 `R('DASHBOARD', 'detail')` 정책을 확인했다. 신규 resolver·권한·scope 변경 없음.
- `getChartDataById` 성공은 `{ success:true, dashboard_id, chartData }`, 오류는 공통 가드의 `{ success:false, error:{name,code,message,cause} }`다. 이번 수정은 성공 응답의 기존 절단 판정만 바로잡는다.
- 서비스가 `principal`을 받아 `resolveCollabReadAuthority`를 판정한 뒤 앱 집계 경로를 선택하는 기존 구조를 유지했다. 페처의 `as:'app'`, 프로젝트 JQL, 제한 공개 `visibility` 제외, 기간·작성자별 워크로그 필터, DTO 축소는 유지했다.
- 공용 `collectRangeWorklogsAsApp`, 비협업 `WorklogService` / `WorklogApi`, 캘린더·이슈 워크로그 서비스는 변경하지 않았다. 사용자별 전역 Promise 공유나 캐시 TTL 연장을 추가하지 않았다.

## 검증

통과:

```powershell
npm test -- --runInBand src/api/jira/worklog/__test__/CollabWorklogFetcher.test.js src/resolver/projectCollab/__test__/CollabWorklogServices.test.js src/resolver/projectDashboard/__test__/DashboardCollabCacheKeys.test.js
```

- 작업 디렉토리: `C:\CloudJira\moves-workforce`.
- 최종 실행: exit 0, 3 suites / 41 tests 통과, 12.476초. 터미널 세션 `53480`, 최종 출력 chunk `6f905e`. 별도 로그 파일은 생성하지 않았다.
- 999건, 1,000건 완결, 1,000건 + 다음 커서, 1,001건 단일 페이지 초과의 커서 유무, 짧은 페이지 뒤 잔여 상한 요청을 검증했다.
- 검색 요청 300회에서 완결과 다음 페이지 잔존을 구분했다. 검색 1회 + 추가 워크로그 299회로 정확히 완결되는 경우와 1회 초과가 필요한 경우를 검증했다.
- `visibility`·작성자·기간 필터와 `as:'app'`, 이전 10분 집계 캐시의 잘못된 `truncated:false` 미재사용을 검증했다.
- `git diff --check -- src/api/jira/worklog/CollabWorklogFetcher.js src/resolver/projectDashboard/__test__/DashboardCollabCacheKeys.test.js` 통과. Git의 LF→CRLF 안내만 존재한다.

실패: 없음.

미검증: 실제 Jira 설치에서의 응답 시간·원격 데이터, frontend 전체 테스트·CI 빌드·Forge lint·전체 backend 테스트. 리더가 전체 변경을 모아 통합 검증한다. 기존 요청 예산·상한은 유지하므로 대규모 프로젝트에서는 절단 자체가 발생할 수 있으며, 이제 그 사실을 숨기지 않는다.

## 남길 경험

상한 도달은 곧 절단을 뜻하지 않는다. 정확한 경계 완료와 다음 커서 잔존, 서버가 요청 크기를 초과해 반환한 페이지, 공유 요청 예산 소진을 각각 검증해야 한다. 반환 메타 오류를 수정할 때는 기존 응답 캐시에도 오류가 남는지 확인해야 한다. Obsidian 경험 노트 반영은 리더의 통합 기록에 인계한다.
