검토를 마쳤습니다. 결론부터 정리합니다.

## 확실한 결함 (수정 권장)

**1. 테이블 미생성 스킵(`null`)이 영구 FAILED가 된다 — `src/resolver/project/ProjectDeletionService.js:152`**
`deleteProjectTeamsByProjectSafe` / `deleteSubscriptionsByProjectSafe`는 테이블이 없으면 "건너뛴다"는 계약으로 `null`을 돌려준다 (`ProjectTeamRepository.js:179,186`, `ProjectSubscriptionRepository.js:267,275`). 서비스는 `result == null`을 "실행 안 됨"으로 보고 `PROJECT_DELETION_SQL_STEP_FAILED`를 던진다. 판정이 결정적이라 `retryable: true`여도 재시도마다 같은 결과라서 프로젝트가 `DELETING`에 영구히 갇힌다. 실제 SQL 오류는 이미 Safe 래퍼가 throw로 전파하므로 `null`은 스킵 외 의미가 없다.
최소 수정: 두 액션을 `async () => (await deleteProjectTeamsByProjectSafe(projectId)) ?? 0` 형태로 감싸 스킵을 완료로 취급. `__test__/ProjectDeletionService.test.js:174`는 이 오동작을 고정한 테스트라 함께 바꿔야 한다.

**2. 프로퍼티 삭제 HTTP 오류가 코드 분류에서 빠진다 — `ProjectDeletionService.js:59`**
`safeErrorCode` 정규식은 `APP_FIELD_WRITE_4xx`만 허용한다. `deleteIssueProperty`는 `ISSUE_PROPERTY_DELETE_4xx`로 던지므로(`IssuePropertyApi.js:96`) 403·429가 전부 `PROJECT_DELETION_UNLINK_FAILED`로 뭉개진다. 프론트 `deletionErrorKey`가 permission/rateLimit 안내 대신 일반 "jira"를 보여준다.
최소 수정:
```js
.match(/^(?:APP_FIELD_WRITE_|ISSUE_PROPERTY_DELETE_)?([45]\d{2})$/)
```

**3. 자동 이어가기 타이머가 렌더마다 초기화된다 — `static/ui/src/pages/project/ProjectList.jsx:147`**
effect 의존성에 `deleteProjectMutation` 객체를 넣었는데 TanStack Query v5의 `useMutation` 반환값은 매 렌더 새 객체다. ProjectList가 다시 그려질 때마다(목록 refetch·포커스 복귀 등) 2.5초 타이머가 취소·재장전된다. 진행은 되지만 지연되고, 잦은 리렌더에서는 밀린다.
최소 수정: 의존성을 `[deletionStatus?.projectId, deletionStatus?.status, deleteProjectMutation.isPending, deleteProjectMutation.mutate]`로 바꾼다 (`mutate`는 안정 참조).

## 확인했고 문제 없음

- **페이지네이션·커서 재개**: 페이지마다 upsert 후 checkpoint, upsert는 PK 멱등, 커서 미전진 가드 있음. 완료 시 `discoverCursor=''` → 재개 시 `|| null` 처리 정상.
- **이동 이슈 메타데이터 보호**: 프로퍼티 삭제 전·후 2회 probe, `MOVED`는 프로퍼티 삭제 없이 DONE. 팀 관리형은 `reconcileIssues` 검색으로 인덱스 지연 회피.
- **lease·권한**: 토큰 일치 시에만 release, 획득 후 체크포인트 재조회, 55초 > 15초 예산. 멤버십 삭제 뒤에도 `requested_by` 폴백으로 read·write 모두 통과 (`:170`).
- **완료 재시도**: COMPLETED 툼스톤은 lease 후 즉시 반환, `COMPLETED_WITH_WARNINGS`는 캐시 단계로 직행.
- **에러 전파**: Jira 응답 본문·SQL 문은 `last_error_code`에 저장되지 않고 숫자 HTTP 코드만 남는다.

## Sentry 관측성 평가

현재 `static/ui/src/index.js:18`은 `consoleLoggingIntegration(error)`와 기본 전역 예외 캡처뿐이다. 백엔드 `responseWrapper`가 모든 예외를 `{success:false}`로 resolve하므로 프론트에서는 예외가 발생하지 않고, 삭제 `FAILED`/`BLOCKED_JIRA_ACCESS`/`COMPLETED_WITH_WARNINGS`는 `success:true` 봉투라 Sentry에 아무것도 남지 않는다. 삭제 경로는 `console.error`도 호출하지 않는다.

백엔드 로그 없이 안전하게 잡는 방법:

- **프론트 전용 헬퍼 추가** (`static/ui/src/utils/observability.js`): `captureHandledFailure(resolver, {code, stage, status, projectId})`가 `Sentry.captureMessage`를 `level:'warning'`, `tags:{resolver, code, stage, status}`, `fingerprint:[resolver, code]`로 보낸다. `error.message`·`cause`는 절대 넣지 않는다. `SqlError` 메시지에는 쿼리 문과 파라미터가, Jira 오류에는 응답 본문이 들어 있다.
- **호출 지점**: `ProjectList.jsx` onSuccess/onError와 `useKanbanMutations.js:274,294`. `success:false`이거나 status가 위 세 종단 상태일 때만 보낸다. `projectDeletionState.js`는 순수 함수로 두는 편이 낫다.
- **중복 억제**: 2.5초 폴링마다 같은 상태가 반복되므로 `prev`와 비교해 `(projectId, status, code)`가 바뀔 때만 캡처한다.
- **init 보강**: `beforeSend`에서 `extra`·`contexts`의 `message`/`cause`/`query` 키를 제거하고, `sendDefaultPii: true`는 IP·계정 수집이 필요한지 재검토한다.
- **후속 과제**: `invoke`를 한 번 감싸 모든 `success:false`를 `{resolver, code}` 태그로 보내면 다른 resolver도 같은 가시성을 얻는다. 다만 import 전면 교체가 필요하므로 삭제 경로부터 적용하는 것이 안전하다.
