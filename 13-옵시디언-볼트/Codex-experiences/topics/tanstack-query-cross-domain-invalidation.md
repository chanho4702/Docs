# TanStack Query cross-domain invalidation

## 경험

Moves Workforce에서 급여 밴드(level KVS)를 저장한 뒤 등급 목록 query만 무효화하면, 인력 관리의 `levelBand`와 프로젝트 급여·비용 화면의 파생 값은 이전 cache를 계속 표시했다. 브라우저 새로고침 후 정상화되는 증상은 backend 저장 실패보다 frontend cache invalidation 누락을 먼저 의심할 근거가 된다.

## 결정

하나의 mutation이 여러 도메인 query에 영향을 주면 mutation component마다 key를 흩어 쓰지 않는다. `static/ui/src/utils/queryKey/`에 영향 범위를 표현하는 helper를 두고 기존 factory의 prefix만 조합한다.

급여 밴드 변경의 소비 prefix:

- `backofficeKeys.levels()`
- `userKeys.all`
- `projectKeys.salaryAll()`
- `projectKeys.costAll()`
- `projectKeys.summaryAll()`

## 검증 방법

1. helper 단위 테스트에서 `invalidateQueries({queryKey})` 호출 목록을 정확히 고정한다.
2. mutation 성공 callback이 helper에 실제로 연결됐는지 별도 contract test로 고정한다.
3. query key는 인라인 배열이 아니라 factory를 사용한다.
4. 설정 변경이 응답 shape 또는 계산 결과를 바꾸면 직접 표시 화면뿐 아니라 파생 요약/비용 cache까지 함께 조사한다.

## 관련 프로젝트

- Moves Workforce: `_workspace/salary-band-cache-refresh/`

