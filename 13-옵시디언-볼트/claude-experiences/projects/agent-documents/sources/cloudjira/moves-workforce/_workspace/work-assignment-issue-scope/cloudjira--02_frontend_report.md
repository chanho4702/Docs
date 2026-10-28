# P0-2 Frontend 계약 검증 보고 — `assignWorkItem` Issue 소속 검증

## 결론

프런트엔드 소스 변경은 필요하지 않았다. 기존 `useAssignWorkItem(projectId)`와 두 호출 지점이 강화된 백엔드 계약을 이미 충족하며, 성공 응답 소비와 캐시 패치 경로도 변경되지 않았다.

## 호출 계약 확인

| 호출 지점 | RMS 프로젝트 ID | Issue 식별자 | 결과 소비 |
| --- | --- | --- | --- |
| `pages/projectDetail/assignment/AssignmentPage.jsx` | 페이지의 `project_id`를 hook 인자로 전달 | 선택 QueueItem의 `issueId`, `issueKey`를 함께 전달 | `res.content`의 `item`, `previous`를 `patchAssignmentCache`에 전달 |
| `pages/resource/assignment/modal/WorkPickerModal.jsx` | 선택 카드의 `project.projectId`를 hook 인자로 전달 | 선택 QueueItem의 `issueId`, `issueKey`를 함께 전달 | `res.content`로 board 캐시와 프로젝트 지표 캐시를 패치 |

QueueItem은 backend `WorkAssignmentIssueFetcher`에서 `issue.id`를 문자열 `issueId`로, `issue.key`를 `issueKey`로 함께 생성한다. 따라서 두 UI 호출은 canonical Issue를 검증하는 P0-2 backend 입력 `{ projectId, issueId, issueKey, ... }`와 호환된다.

## 응답/오류 계약

- 성공: hook은 `invoke('assignWorkItem', payload)`의 `res.success`와 `res.content`를 확인한 후 `res.content`를 반환한다. backend의 `{ issueId, issueKey, applied, item, previous }` shape를 그대로 소비한다.
- 실패: `success: false`이면 error code를 가진 `Error`를 throw한다. 새 `PERMISSION_PROJECT_SCOPE_DENIED`도 기존 mutation error 경로로 전달되며, 실패 시 cache patch는 실행되지 않는다.
- Query key: 기존 `assignmentKeys.board(projectId)` 팩토리를 계속 사용하며 인라인 key는 없다.
- i18n: 신규 화면 문구나 번역 키가 필요 없으며, locale source와 생성 locale 파일을 수정하지 않았다.

## 변경 파일

없음. 이 단계는 backend 응답 계약과 기존 UI 호출의 정합성 검증만 수행했다.

## 검증

```text
cd static/ui
npm test -- --runInBand src/pages/projectDetail/assignment/__test__ src/pages/resource/assignment/__test__
PASS 7 suites, 105 tests

CI=true npm run build
PASS (optimized build 생성 확인)

npm run bundle:check
PASS main.e135c3a3.js: gzip 435,982 bytes / budget 950,000 bytes
```

빌드의 `prebuild` 단계에서 locale merge도 실행되었다. Node의 `MODULE_TYPELESS_PACKAGE_JSON` 경고만 발생했으며 build 실패나 번역 변경은 없었다.
