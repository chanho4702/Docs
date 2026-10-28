# P0-4 프런트엔드 구현 보고

## 구현 범위

- `static/ui/src/pages/projectDetail/issue/IssueAddModal.jsx`
  - 작업 등록의 `updateProjectIdField` 호출에 현재 상세 프로젝트의 `project_id`를 추가했다.
  - 기존 `value: project_id`는 앱 프로젝트 필드에 기록할 값이고, 새 `project_id`는 서버 권한 범위 검증용 식별자다.
  - 기존 성공/실패 toast, takeover 확인, `recordIssueAssignedDate`, 작업 이력 query invalidation 동작은 변경하지 않았다.
- `static/ui/src/pages/projectDetail/gantt/useGanttMutations.js`
  - `useUpdateCoworkers({ projectId })`의 `updateProjectIdField` 호출에 `project_id: projectId`를 추가했다.
  - 기존 `result.success` 실패 처리, 낙관적 coworkers 갱신 및 오류 rollback을 유지했다.

## 경계면 계약

두 호출 모두 다음 backend 입력 계약을 충족한다.

```js
{
  project_id: string,
  customFieldId: string,
  issueId: string | number | Array<string | number>,
  value: string | string[],
}
```

backend 성공 응답은 `{ success: true }`이고, 기존 코드가 `result.success === false`를 실패로 분기하는 방식은 그대로다. 성공 content가 없는 기존 계약도 유지한다.

## 확인

- `rg`로 `static/ui/src` 전체 `updateProjectIdField` invoke 호출을 확인했다. 대상 호출은 작업 등록과 `useUpdateCoworkers` 두 곳뿐이다.
- `cd static/ui; npm test -- --runInBand` — 통과(exit 0).
- `git diff --check` — 오류 없음.
- `CI=true npm run build` — 실행을 시작했으며, merge 단계의 Node `MODULE_TYPELESS_PACKAGE_JSON` 경고 뒤 optimized build가 진행 중이다. 이 보고서 작성 시점에는 완료 결과를 아직 확정하지 않았다. 번역 키 변경은 없으며, prebuild의 merge는 실행됐다.

## i18n / query key

- 번역 키·query key·Zustand state 추가 없음.
