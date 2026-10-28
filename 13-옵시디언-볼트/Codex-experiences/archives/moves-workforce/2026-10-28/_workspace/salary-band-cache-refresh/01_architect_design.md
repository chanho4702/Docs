# 급여 밴드 cache refresh 설계

## 1. 결론

`LevelPage`의 성공 callback이 `backofficeKeys.levels()`만 무효화하는 것이 직접 원인이다. 인력 관리 목록은 `userKeys.list(...)` 아래에 캐시되고 각 row의 `levelBand`를 표시하므로, 급여 밴드 저장 후에도 `userKeys.all` prefix가 유효한 기존 데이터로 남는다.

수정은 backend 응답이나 DB가 아니라 frontend TanStack Query cache 경계에 한정한다. 기존 `SalaryPolicySetting`이 정책 전환 후 무효화하는 salary 소비 cache 패턴을 재사용한다.

## 2. 기존 패턴 조사

| 생산/변경 지점 | 현재 무효화 | 실제 소비 query | 문제 |
|---|---|---|---|
| `static/ui/src/backoffice/page/level/LevelPage.jsx` | `backofficeKeys.levels()` | `userKeys.list(...)` | 인력 관리 `levelBand` row가 갱신되지 않음 |
| 동일 | 동일 | `projectKeys.salary(projectId, page)` | 프로젝트 급여 범위·대표 급여가 낡을 수 있음 |
| 동일 | 동일 | `projectKeys.cost(projectId)` / `projectKeys.summary(projectId)` | `salaryRepresentative` 기반 계산 결과가 낡을 수 있음 |
| `SalaryPolicySetting.jsx` | levels/users/projectSalary/projectCost/summary prefix 전부 | 동일 소비처 | 재사용할 수 있는 검증된 선례 |

## 3. 영향 범위

- frontend: query key factory 기반 공통 invalidation helper 추가, `LevelPage` 성공 callback에서 호출
- frontend test: 정확한 prefix 다섯 개가 무효화되는지 회귀 테스트
- backend/resolver/DB/manifest/i18n: 변경 없음

## 4. 경계면 계약

이번 수정은 resolver 응답 shape를 변경하지 않는다.

| 경계 | 입력 | 성공 결과/후속 동작 | 소비처 |
|---|---|---|---|
| 기존 `addLevel` / `updateLevel` / `deleteLevel` | 기존 payload 유지 | 기존 `{ success: true, ... }`; modal이 `onSuccess()` 호출 | `LevelPage` |
| `invalidateSalaryBandViews(queryClient)` 신규 frontend helper | TanStack `QueryClient` 호환 객체 | 아래 다섯 prefix에 대해 `invalidateQueries({queryKey})` 호출 | level 생성·수정·삭제 성공 callback |

무효화해야 할 query key 계약:

1. `backofficeKeys.levels()` → `['levels']`
2. `userKeys.all` → `['users']`
3. `projectKeys.salaryAll()` → `['projectSalary']`
4. `projectKeys.costAll()` → `['projectCost']`
5. `projectKeys.summaryAll()` → `['getSummaryData']`

부분 키가 아니라 prefix factory를 사용해 모든 page/project 변형을 포함한다. 전체 QueryClient cache 무효화는 하지 않는다.

## 5. 구현 설계

1. `static/ui/src/utils/queryKey/` 아래에 salary band 변경의 파급 cache를 한 곳에 모은 helper를 둔다.
2. helper는 기존 `backofficeKeys`, `userKeys`, `projectKeys` factory만 조합하며 새 cache identity를 만들지 않는다.
3. `LevelPage`의 등록/편집/quick-add modal에 전달하는 세 `onSuccess`가 한 callback을 공유하도록 정리한다.
4. mutation 응답이 `success:false`인 경우 modal hook이 `onSuccess`를 호출하지 않는 기존 계약을 유지한다.
5. i18n/화면 표시는 바꾸지 않는다.

## 6. 테스트 설계

- helper에 mock QueryClient를 전달해 위 다섯 query key를 각각 정확히 한 번 받는지 검증한다.
- `LevelPage`가 성공 callback에서 helper를 호출하는 연결을 검증한다. 컴포넌트 단위 mock 비용이 과하면 source contract test로 연결 누락을 방지할 수 있으나, 가능하면 callback을 export 가능한 순수 함수로 두고 단위 테스트한다.
- 기존 query key contract test와 전체 frontend test/build를 실행한다.

## 7. 구현 체크리스트

- [ ] frontend helper와 회귀 테스트
- [ ] `LevelPage` 성공 callback 연결
- [ ] root test, frontend test, frontend build
- [ ] Forge lint(코드 변경이지만 앱 정합성 확인용; manifest 변경 없음)

