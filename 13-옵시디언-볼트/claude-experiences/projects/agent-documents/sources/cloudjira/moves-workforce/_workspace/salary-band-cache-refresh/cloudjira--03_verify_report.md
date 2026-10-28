# Integration verification report

## 통과

### 1. mutation 성공 callback 연결

- `static/ui/src/backoffice/page/level/LevelPage.jsx:28`에서 `handleLevelMutationSuccess`가 `invalidateSalaryBandViews(queryClient)`를 호출한다.
- 동일 callback이 등록·편집·quick-add modal에 각각 연결된다: `LevelPage.jsx:66`, `:75`, `:80`.
- 회귀 테스트가 helper 호출과 세 callback 연결 수를 고정한다: `static/ui/src/utils/queryKey/salaryBandInvalidation.test.js`.

### 2. 실패 응답에서 cache 무효화 방지

- 등록: `useLevelRegistrationModal.js:26`에서 `!res.success`이면 return, 성공 경로 `:54`에서만 부모 callback 호출.
- 수정: `useLevelEditModal.js:74`에서 실패 return, 성공 경로 `:99`에서만 호출.
- 삭제: 같은 파일 `:108`에서 실패 return, 성공 경로 `:119`에서만 호출.
- quick-add: `useLevelQuickAddModal.js:48`에서 실패 return, 성공 경로 `:59`에서만 호출.

따라서 resolver가 transport-level로 resolve됐지만 business 응답이 실패한 경우에는 관련 cache를 잘못 버리지 않는다.

### 3. query key prefix 교차 일치

| helper 무효화 | factory 정의 | 실제 소비 query | 판정 |
|---|---|---|---|
| `backofficeKeys.levels()` | `backofficeKeys.js:9` → `['levels']` | 등급 목록/설정 밴드 경고 | 통과 |
| `userKeys.all` | `userKeys.js:2` → `['users']` | `UserListPaging.jsx:31`의 `userKeys.list(...)`; row `levelBand`는 `:94` | 통과 |
| `projectKeys.salaryAll()` | `projectKeys.js:67` → `['projectSalary']` | `SalaryManagementPage.jsx:75`의 `projectKeys.salary(projectId,page)` | 통과 |
| `projectKeys.costAll()` | `projectKeys.js:66` → `['projectCost']` | `useProjectCostSummary.js:37` | 통과 |
| `projectKeys.summaryAll()` | `projectKeys.js:68` → `['getSummaryData']` | `SummaryPanel.jsx:16` | 통과 |

prefix가 page/project suffix 앞부분과 정확히 일치하므로 모든 변형 query가 무효화된다. 인라인 query key는 추가하지 않았다.

### 4. 자동 검증

- targeted query-key tests: 3 suites / 6 tests 통과
- root/backend 전체: 65 suites / 1,057 tests 통과
- frontend 전체: 64 suites / 1,074 tests 통과
- production build 및 bundle budget 통과
- `forge lint --verbose`: exit code 0 통과
- `git diff --check`: whitespace error 없음

## 실패

없음.

## 미검증

- 실제 Forge development 배포 환경에서 급여 밴드 수정 후 인력 관리 화면이 네트워크 재조회·리렌더되는 수동 E2E는 수행하지 않았다. 배포/설치 요청이 없었으므로 로컬 코드 계약, test, build, lint까지만 검증했다.
- 별도 브라우저 tab/window 간 QueryClient cache 동기화는 이번 범위가 아니다. 이번 수정은 동일 SPA QueryClient 내의 화면 전환 및 활성 query 갱신을 보장한다.

## 최종 판정

요구사항에 대한 코드·계약·자동 검증은 통과했다. 배포 환경 수동 E2E만 미검증이다.

