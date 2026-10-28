# Moves Approval Forge 승인 업무함 (2026-08-26)

## 결정

- `view.createHistory()`가 반환하는 Forge history를 React Router의 저수준 `Router`에 연결했다. Forge bridge의 `listen` callback은 history 패키지 버전에 따라 `location` 또는 `{ location, action }` 형태가 될 수 있어 둘 다 정규화했다.
- 업무함 목록은 `total`을 추정하지 않고 `{ nextCursor, hasMore }`만으로 누적한다. Confluence 페이지 가시성 필터가 SQL 이후에 적용되므로 정확한 총계는 만들 수 없다.
- `getInboxCounts`는 목록 query와 분리했다. `statusCounts`는 권한 필터 전 수치라는 tooltip을 항상 붙이고, count 지연이나 실패가 첫 목록을 막지 않게 했다.
- `confluence:spacePage`에서는 `extension.space.key`를 서버 필터에 강제로 덮어쓴다. 공유 URL의 `space` 파라미터가 다른 값을 담아도 스페이스 컨텍스트 밖으로 넓어지지 않는다.
- 첫 프레임부터 실제 `DynamicTable`과 같은 head/cell 수의 Skeleton 행을 그린다. history/context 부트스트랩 중에도 필터와 표 골격을 함께 유지해 레이아웃 점프를 줄였다.

## 검증과 함정

- React Router의 `unstable_HistoryRouter`는 사용하는 history major의 listener 계약에 민감하다. Forge bridge history를 쓸 때는 `Router`의 `navigator`와 제어된 `location`을 직접 연결하는 어댑터가 안전하다.
- 병렬 태스크가 공용 엔트리와 설정 기능을 동시에 추가하면 통합 build가 일시적으로 missing import에서 실패할 수 있다. 자기 범위 파일을 수정하지 말고 해당 파일이 합쳐진 최신 워크트리에서 다시 검증한다.
- `@testing-library/react`가 설치돼 있어도 peer dependency인 `@testing-library/dom`이 빠질 수 있다. package 범위를 넓히지 않아야 하는 태스크에서는 React DOM `createRoot` + `act`로 회귀 테스트를 독립시킬 수 있다.

## 관련

- [[projects/agent-documents/sources/codex-experiences/topics/codex-experiences--code-splitting-bundle-budget-contract|code-splitting-bundle-budget-contract]]

