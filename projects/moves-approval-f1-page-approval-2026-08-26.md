# Moves Approval F1 페이지 결재 구현 (2026-08-26)

## 경험

- `decideApproval`은 `requestId`만 받으므로 guard가 페이지 권한을 검사할 수 없다. 서비스가 요청을 먼저 복원해 `pageId`를 얻고, `asUser()` 기반 VIEW 권한을 재검증한 뒤에만 승인·반려 CAS를 호출해야 한다.
- 앱 설정 관리자(`isSettingsManager`/`isAdmin`)와 Confluence 관리자(`isConfluenceAdmin`)를 섞으면 설정 권한이 타인의 결재 개입 권한으로 상승한다. 회수는 요청자 본인 또는 `isConfluenceAdmin`만 허용한다.
- `approval_request.dedupe_key`가 UNIQUE이면 승인·반려·회수 같은 종료 CAS에서 key를 `closed:<requestId>`로 바꾸지 않을 경우 다음 재승인 요청이 영구히 `ALREADY_OPEN`에 막힌다. 상태 종료와 dedupe 해제는 같은 CAS UPDATE에 포함해야 한다.
- Forge Modal API는 부모 배너와 별도 iframe/QueryClient를 쓴다. 모달 내부 invalidation만으로는 부모가 갱신되지 않으므로 `view.close({changed:true,...})` payload와 부모 `Modal.onClose`의 `approvalKeys.page(pageId)` invalidation을 함께 사용한다. 관련 일반 패턴은 [[topics/tanstack-query-cross-domain-invalidation]].
- `pageBanner`는 모든 페이지에서 로드되므로 문서 context가 없거나 결재가 없을 때 즉시 `null`을 반환하고, 정적 ADS import는 `Lozenge`와 `Button` 수준으로 제한한다. 검색·표·DateTimePicker는 modal 엔트리로 분리한다.
- Cloud 승인자 선택은 전체 디렉터리 목록이 아니라 두 글자 이상 search-on-typing으로 제한한다. 그룹 선택값은 `group:<id>`로 전달하고 서버에서 구성원 accountId snapshot으로 확장해야 실제 사용자가 결정할 수 있다.

## 검증

- `npx jest --runInBand`: 12 suites, 105 tests 통과
- `npm run test:ui -- --runInBand`: 3 suites, 7 tests 통과
- `npm run build:ui`: 성공(Atlaskit source map 및 react-select 내부 CSS 경고만 존재)
- `npx forge lint`: No issues found
- `git diff --check`: 통과
