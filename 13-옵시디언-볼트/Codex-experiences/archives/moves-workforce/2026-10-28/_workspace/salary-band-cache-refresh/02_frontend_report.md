# Frontend implementation report

## 구현 결과

급여 밴드 mutation 성공 후 등급 목록만 무효화하던 흐름을 관련 소비 화면 전체의 query prefix를 무효화하는 공통 helper로 교체했다.

### 변경 파일

- `static/ui/src/utils/queryKey/salaryBandInvalidation.js`
  - `invalidateSalaryBandViews(queryClient)` 추가
  - 기존 query key factory만 조합해 아래 다섯 prefix를 무효화
- `static/ui/src/backoffice/page/level/LevelPage.jsx`
  - 등록·수정·삭제/quick-add 세 modal이 `handleLevelMutationSuccess`를 공유
  - 성공 시 `invalidateSalaryBandViews(queryClient)` 호출
- `static/ui/src/utils/queryKey/salaryBandInvalidation.test.js`
  - 다섯 prefix 호출 계약 및 세 modal callback 연결 회귀 테스트

## 무효화 query key

1. `backofficeKeys.levels()` → `['levels']`
2. `userKeys.all` → `['users']`
3. `projectKeys.salaryAll()` → `['projectSalary']`
4. `projectKeys.costAll()` → `['projectCost']`
5. `projectKeys.summaryAll()` → `['getSummaryData']`

이 prefix들은 각각 page/project가 붙은 하위 query까지 포함한다. 전체 QueryClient cache 무효화나 인라인 배열 query key는 사용하지 않았다.

## Backend 응답 소비

resolver 응답 shape 변경 없음. 기존 modal hook이 `res.success === true`에서만 부모 `onSuccess()`를 호출하는 계약을 그대로 소비한다.

## i18n

문구/UI 변경이 없어 i18n source key를 추가하지 않았다. production build의 `prebuild`가 기존 merge를 정상 수행했다.

## 검증 결과

- targeted frontend query-key tests: **3 suites, 6 tests 통과**
- 전체 frontend test: **64 suites, 1,074 tests 통과**
- production build: **성공**
  - bundle budget: raw 1,004,063 bytes / budget 1,625,293 bytes, 범위 내
  - 기존 Atlaskit source map/CSS order warning은 남지만 exit code 0
- root/backend test: **65 suites, 1,057 tests 통과**
- `forge lint`: 최초 일반 실행은 124초 timeout, `forge lint --verbose` 재실행은 **exit code 0 통과**

