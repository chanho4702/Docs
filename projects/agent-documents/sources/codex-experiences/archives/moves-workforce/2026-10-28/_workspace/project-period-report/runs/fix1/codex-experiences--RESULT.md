# RFC-200 교차 리뷰 수정 결과

2026-09-08. **지정 범위 코드·테스트 수정은 쓰기 도구로 반영했으나 실행 검증은 미완료다.** Windows 프로세스 초기화 오류 `0xc0000142`(`-1073741502`) 때문에 Jest, 파일 재조회, 최종 diff 검증을 실행하지 못했다. 테스트 통과로 간주하지 않는다. 빌드·커밋·배포는 하지 않았다.

요청에는 4건이라고 되어 있으나 번호는 1~3이다. 열거된 요구를 워크로그 조회, 이슈 조회·openTotal, purge 조건, 프론트 캐시의 네 묶음으로 처리했다. 그 외 기능 변경은 하지 않았다.

## 변경 파일

백엔드:
- `src/resolver/projectPeriodReport/PeriodIssueFetcher.js`
- `src/resolver/projectPeriodReport/PeriodReportCalculator.js`
- `src/resolver/projectPeriodReport/ProjectPeriodReportService.js`
- `src/resolver/projectPeriodReport/__test__/PeriodIssueFetcher.test.js`
- `src/resolver/projectPeriodReport/__test__/PeriodReportCalculator.test.js`
- `src/resolver/projectPeriodReport/__test__/ProjectPeriodReportService.test.js`

프론트:
- `static/ui/src/pages/projectDetail/periodReport/ActivitySection.jsx`
- `static/ui/src/pages/projectDetail/periodReport/toMarkdown.js`
- `static/ui/src/pages/projectDetail/periodReport/PeriodReportPage.jsx`
- `static/ui/src/pages/projectDetail/periodReport/usePeriodReport.js`
- `static/ui/src/utils/queryKey/periodReportKeys.js`
- `static/ui/src/pages/projectDetail/periodReport/usePeriodReport.test.js`
- `static/ui/src/pages/projectDetail/periodReport/openTotal.test.jsx` (신규)

작업 기록:
- `_workspace/project-period-report/runs/fix1/RESULT.md`
- 같은 디렉터리의 `baseline.json`: 코드 수정 전 파일 해시.

## 항목별 처리

### 1. 워크로그 조회 범위

`PeriodIssueFetcher` 안에 기간 전용 `GET /rest/api/3/issue/{key}/worklog` 호출을 두었다. 공용 `WorklogApi`는 변경하지 않았다. 검색은 `fields=summary`만 사용하고 인라인 worklog는 사용하지 않는다.

모든 페이지에 epoch ms `startedAfter`, `startedBefore`를 전달한다. 시작은 KST 시작일 00:00에서 1일 전, 종료는 KST 종료일 다음 날 00:00에서 1일 후다. 받은 기록은 기존 KST 기간 재필터를 유지한다. `startAt=0`, `maxResults=100`부터 실제 반환 개수로 페이징하며 정상 0건, 중복 ID, 잘못된 offset·total, 빈 중간 페이지를 구분한다. 기존 동시성 5를 유지한다.

### 2. 용도별 이슈 검색과 openTotal

전체 프로젝트 과거 이슈 스캔을 다음 세 JQL로 나눴다. 각각 기존 100건 및 `nextPageToken` 순회를 유지한다.

- 신규: `created >= start-1d AND created <= end+1d`
- 완료: `resolved >= start-1d AND resolved <= end+1d AND statusCategory = Done`
- 마감 초과: `duedate <= end AND statusCategory != Done`

세 검색 결과를 이슈 key로 중복 제거해 기존 calculator의 `issues` 입력에 전달한다. 신규·완료의 KST 재필터와 마감 초과 판정은 유지한다.

미완료 합계는 `POST /rest/api/3/search/approximate-count`에 프로젝트 조건과 `statusCategory != Done AND created <= end`를 전달한다. 모든 Jira 호출은 `as: 'user'`다. 카운트 실패·누락·잘못된 응답은 `null`, 정상 0은 0으로 보존한다. 이슈·워크로그 조회 실패는 기존처럼 전체 리포트 실패로 전파한다.

calculator는 별도 `openTotal` 입력을 응답에 전달하며 좁혀진 이슈 후보로 합계를 재계산하지 않는다. 기존 서비스는 `...fetched`를 전달하므로 추가 수정이 필요 없다. 응답 shape는 `issues.openTotal: number | null` 외 불변이다. `ActivitySection`과 Markdown은 null인 항목만 숨기고 0은 표시한다.

### 3. 캡처와 purge

INSERT 결과가 `inserted: false`이고 `ALREADY_CAPTURED`도 아니면 해당 건을 captured에 넣지 않는다. `DELETING` 전환 등 INSERT 0행이 이에 해당한다.

실제 INSERT된 `(projectId, periodType)`만 별도 Map에 기록하고, 전체 캡처 단계가 끝난 다음 해당 조합별 한 번만 purge한다. 기존 캡처·duplicate-key 경합은 purge 대상이 아니다. 이미 캡처된 건의 capturedCount 계산은 기존 의미를 유지한다. 예외 또는 테이블 unavailable이면 purge로 넘어가지 않는다.

### 4. 프론트 캐시

페이지에서 accountId와 비용 읽기 boolean만 scope에 전달한다. 키 팩토리도 `{ accountId, canReadCost }`만 투영하여 permissions/team 객체의 무관한 변화로 키가 달라지지 않게 했다. 사용자·비용 권한 변경에 따른 키 분리는 유지한다.

훅의 `staleTime`은 300000ms, `gcTime`과 `refetchOnMount: 'always'`는 제거했다. queryKeyContract를 포함한 지정 테스트 범위의 실행은 아래 환경 오류로 미검증이다.

번역 키 추가·삭제가 없어 locales 변경 및 merge는 하지 않았다. 보호 대상으로 지정된 다른 세션 파일과 `ResourceWorklogFetcher.js`, `PortfolioAggregator.js`의 버킷 로직은 수정하지 않았다.

## 테스트 결과

요청한 순서대로 시도했으며 테스트를 병렬 실행하지 않았다. PowerShell의 npm.ps1 실행 정책을 피하도록 같은 명령의 Windows 실행 파일인 npx.cmd를 사용했다.

1. 앱 루트 `C:/CloudJira/moves-workforce`에서 `npx.cmd jest --runInBand src/resolver/projectPeriodReport src/api`: **미실행/미검증**. 프로세스 생성 전 setup helper가 `-1073741502`로 종료했다.
2. `C:/CloudJira/moves-workforce/static/ui`에서 `npx.cmd jest --maxWorkers=2 src/pages/projectDetail/periodReport src/utils/queryKey`: **미실행/미검증**. 동일한 프로세스 초기화 오류.
3. 앱 루트에서 cmd 및 sandbox 밖 실행으로 백엔드 명령을 재시도: **미실행/미검증**. exit `-1073741502`, Jest 출력 없음.
4. `git diff --check`: 프로세스 초기화 오류로 **미검증**.

수정한 회귀 테스트는 용도별 101건 페이지 순회·중복 제거, 인라인 무시·기간 파라미터·KST 경계, 정상 빈 워크로그·불완전 페이지·동시성, 카운트 null/0/숫자, INSERT 0행·중복 경합·실제 INSERT 조합 purge, 키 분리·불필요한 scope 변화 무시, 실제 UI와 Markdown의 null/0/3 처리를 다룬다. 기존 계산·캡처 회귀도 유지했다.

## 남은 우려

- **실행 환경 복구 후 지정한 두 Jest 명령과 최종 diff/보호 파일 비교가 필요하다.** 현재 통과한 suite/test 수는 보고할 수 없다.
- 수정 중 일반 Update File·PowerShell·Node 프로세스가 실패했다. 전문을 확보한 대상 파일에 한해 Add File 방식으로 다시 썼고 도구는 성공을 반환했다. 최종 디스크 재읽기는 미검증이므로 파일 내용·인코딩·의도한 변경 범위를 다시 확인해야 한다.
- 실 Jira의 `startedAfter`/`startedBefore` 및 approximate-count 호출, 대형 프로젝트의 25초 invoke 내 완료 여부는 미검증이다. 조회 후보는 줄었지만 기간 활동량이나 마감 초과 이슈 자체가 매우 많으면 호출량은 여전히 커질 수 있다.
- 기존 서버 캐시 TTL 중에는 이전 방식으로 계산한 리포트가 남을 수 있다. 별도 캐시 마이그레이션은 요청 범위에 포함하지 않았다.
- 기존의 현재 상태 기반 근사와 보류된 워크로그 버킷 KST 불일치는 그대로다.
