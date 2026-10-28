# Storage 프로젝트 사용량 귀속 — Backend 보고

## 구현 범위

- `src/resolver/storage/StorageQuery.js`
  - `PROJECT_ROW_COUNTS`에 누락된 프로젝트 직접 소유 테이블 6개를 추가했습니다.
  - `gantt_folder_link`, `project_skills`, `project_team`, `project_subscription`, `project_deletion`, `project_deletion_issue`
  - 각 SQL은 기존 규약 그대로 `BIN_TO_UUID(project_id) AS project_id`, `COUNT(*) AS cnt`, `GROUP BY project_id`를 사용합니다.
- `src/resolver/storage/__test__/StorageQuery.test.js`
  - 프로젝트 소유 테이블 12개 전체 목록 회귀 검증을 추가했습니다.
  - 새 6개 테이블의 행 수가 `computeProjectBreakdown`에서 프로젝트 `estimatedBytes`와 `rows`로 합산되고 `unassignedBytes`가 감소하는 것을 검증합니다.

## 경계면

`getStorageUsage`의 resolver 이름, 권한 및 응답 DTO는 변경하지 않았습니다.

성공 응답 shape:

```js
{
  success: true,
  content: {
    limitBytes, totalBytes, totalRows, usedPercent, tables,
    projects: [{projectId, name, estimatedBytes, rows}],
    unassignedBytes, generatedAt,
  },
}
```

## 검증

```text
npm test -- --runInBand src/resolver/storage/__test__/StorageService.test.js src/resolver/storage/__test__/StorageQuery.test.js
PASS: 2 suites, 17 tests
```

기존 breakdown fallback 테스트가 의도적으로 `console.error`를 출력하지만 테스트는 통과했습니다.
