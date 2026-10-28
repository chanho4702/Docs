# 프로젝트 삭제 무결성 프런트엔드 구현 보고

## 변경 범위

- `ProjectList`는 `deleteProject` 응답의 `content.deletion.completed === true`일 때만 성공 toast와 프로젝트 목록/칸반 cache invalidation을 수행한다.
- 진행 중인 deletion DTO는 `ProjectDeletionStatusModal`로 표시하고, 진행 상태(`PENDING`, `DISCOVERING`, `UNLINKING`, `SQL_CLEANUP`)에서는 다음 bounded advance를 2.5초 뒤 요청한다.
- `FAILED`, `BLOCKED_JIRA_ACCESS`, `COMPLETED_WITH_WARNINGS`는 자동 완료로 처리하지 않고 재시도 버튼을 표시한다. Jira Issue key/summary는 UI에 표시하지 않는다.
- 확인 문구에 Jira Issue는 보존하고 Moves RMS 연결 정보만 해제한다는 정책을 추가했다.
- Kanban 삭제도 완료 응답이 아닐 때 기존 optimistic cache를 복원하고 진행 상태 모달을 연다.
- `projectDeletionKeys.status(projectId)`를 query key factory에 추가했다.
- `deletion_state`가 `DELETING`인 Kanban 카드의 inline title edit은 막는다.

## backend 응답 소비

`deleteProject`의 `{ success, content: { deletion } }`에서 `deletion.completed`를 확인한다. `success: true`만으로는 목록 제거, 성공 toast, route 이동을 수행하지 않는다.

## i18n

- `locales/kr/project.json`, `locales/en/project.json`에 deletion progress/retry/Jira 접근 차단 문구를 추가했다.
- `npm run merge`를 실행했다. 생성 locale 파일은 직접 수정하지 않았다.

## 검증

- `npm run merge`: 실행 완료 (Node module type warning만 출력)
- `npm test -- --runInBand --watch=false`: 실행 완료
- `CI=true npm run build`: prebuild/merge까지 실행됐으나 이 실행 환경에서는 build 명령의 최종 CRA 출력과 exit code가 반환되지 않아 최종 결과는 통합 검증 단계에서 재확인이 필요하다.

## 검증 보정 (2026-08-31)

- `ProjectList.jsx`에서 실제 사용하는 `useMutation`과 `invoke` import를 복구했다. 삭제 흐름이나 응답 소비 로직은 변경하지 않았다.
- `npm test -- --runInBand --watch=false src/components/table/__test__/tableContract.test.js`: 1 suite, 23 tests 통과.
- `CI=true npm run build`: `prebuild`/locale merge와 `craco build`의 optimized production build 시작까지 확인했다. 이 환경은 최종 CRA exit code를 반환하지 않아 빌드 성공 여부는 확정하지 않는다.
