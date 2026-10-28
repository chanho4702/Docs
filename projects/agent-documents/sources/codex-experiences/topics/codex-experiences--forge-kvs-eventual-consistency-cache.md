# Forge KVS eventual consistency와 frontend cache

## 경험

Moves Workforce의 급여 밴드는 Custom Entity에 `set`한 뒤 `query().getMany()`로 목록을 다시 읽는다. 화면에서 관련 TanStack Query key를 모두 무효화해도, Forge KVS/Custom Entity query는 eventually consistent이므로 직후 refetch가 변경 전 값을 반환할 수 있다. 그 응답이 다시 `staleTime` 동안 cache되면 사용자는 새로고침 전까지 이전 급여 범위를 보게 된다.

따라서 “저장 성공 후 invalidate”만으로는 read-after-write 정합성을 보장하지 못한다. 이 문제는 [[projects/agent-documents/sources/codex-experiences/topics/codex-experiences--tanstack-query-cross-domain-invalidation|tanstack-query-cross-domain-invalidation]]과 별개의 저장소 일관성 경계다.

## 결정

- mutation 응답에 저장된 정규화 DTO를 포함하고, 직접 갱신 가능한 frontend cache는 `setQueryData`로 먼저 갱신한다.
- 여러 서버 계산 경로가 즉시 동일 값을 읽어야 한다면 strict-consistent `kvs.get`으로 읽을 수 있는 단일/version key 또는 명시적 versioning 전략을 설계한다.
- invalidate/refetch는 다른 화면과 비활성 query를 동기화하는 보조 수단으로 유지한다.
- 공식 문서가 일관성 지연 시간을 보장하지 않으므로 임의의 sleep/retry 횟수를 정합성 계약으로 간주하지 않는다.

## 검증 방법

1. 저장 응답으로 현재 화면 cache가 즉시 바뀌는지 검사한다.
2. refetch가 일시적으로 이전 값을 반환해도 최신 mutation 결과가 역전되지 않는지 검사한다.
3. 별도 resolver의 비용/요약 계산이 변경 직후 어떤 저장 경로를 읽는지 통합 테스트한다.
4. 배포된 Forge 환경에서 read-after-write E2E와 지연 분포를 계측한다.

## 관련 프로젝트

- Moves Workforce: `_workspace/recent-rfc-review/`
