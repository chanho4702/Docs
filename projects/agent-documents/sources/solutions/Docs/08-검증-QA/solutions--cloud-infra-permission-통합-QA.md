# cloud-infra-permission 통합 QA

검증일: 2026-08-24  
범위: `_workspace/contract_cloud-infra-permission.md`와 Spring BE/React FE 정적 교차 대조

| 항목 | 기대(BE 계약) | 실제(FE/BE) | 심각도 | 결과/제안 |
|---|---|---|---|---|
| 현재 사용자 권한 API | `GET /users/me/permissions`는 인증·visitor 검증 뒤 저장된 Role 권한을 payload로 반환 | BE `UserController.java:125`가 `DmovePermissionChecker.getCurrentPermissions()`를 반환. SecurityConfig는 `/users/**`를 인증 요구하고, UserController의 `@VisitorIdCheck`가 적용됨. FE `user-roles.api.ts:54` → `useAuth.ts:35`가 해당 경로를 사용 | 통과 | 관리자 기본 템플릿, 일반 사용자 저장 Role JSON 및 fail-closed가 checker에 구현됨 |
| unwrap 및 payload 타입 | 공통 2단 unwrap 뒤 `DmovePermission[]`를 소비 | axios 1단 + `useDmoveQuery` 2단 unwrap 뒤 배열을 소비하며, FE 선언도 `Promise<DMoveModule[]>` (`user-roles.api.ts:54`), `useDmoveQuery<DMoveModule[]>` (`useAuth.ts:35`)로 정정됨 | 수정 완료 | post-unwrap payload shape와 타입 일치 |
| 권한 식별자 | `cloudInfraMonitoring.awsResources.view` | BE `DmovePermissions.java:25`, `DmovePermissionChecker.java:26`; FE `DmovePermissionsKey.AWS_RESOURCES = "awsResources"` 및 `useAuth.ts:44` feature flatten이 일치 | 통과 | module/feature/action 일치 |
| 기존 Role migration | 모든 기존 Role에 feature를 보존적으로 추가하고 기본 deny | `V27__add_aws_resources_permission.sql`은 기존 module/feature 유무별 append만 수행하고 `view=false`를 부여 | 통과 | 기존 feature 값 미변경 |
| AWS API 권한 강제 | status, regions, VPC, EC2 목록, dashboard, detail 총 6개가 동일 권한 요구 | `CloudInfraController.java:55,72,81,89,98,107` 모두 `requireAwsResourcesView()` 호출. 거부 시 `ForbiddenError` → 기존 HTTP 200/body `code:403` handler | 통과 | test-connection은 기존 admin-only 유지 |
| 메뉴·모바일 메뉴 | 권한 없으면 AWS 진입점 숨김, status도 호출하지 않음 | `SideNav.tsx:99`, `MobileSideNav.tsx:79`가 `awsResources.view`일 때만 메뉴 노출 및 `useCloudStatus(enabled)` 호출 | 통과 | 권한 없는 사용자의 status 호출 차단 |
| route 및 직접 URL | cloud route를 권한으로 보호하고, 권한 보유자는 AWS 미설정 상태를 게이트 처리 | root `PageWrapper`가 `AWS_RESOURCES` 권한을 검사(`routes.tsx:445`). 초기 QA에서 `CloudInfraGate`가 status를 비활성화하는 문제를 발견했으나, `CloudInfraGate.tsx:24`가 `useCloudStatus(true)`로 수정됨 | 수정 완료 | 직접 URL에서도 설정 status 조회·게이트 동작을 재확인 |
| Role 저장 후 갱신 | 저장 후 현재 권한 query를 invalidate하여 재로그인 없이 반영 | `UserRoleUtility.tsx:92`가 `MY_PERMISSIONS` invalidate. `useAuth.ts:80`은 새 권한과 Redux 값을 비교 후 갱신 | 통과 | 현재 브라우저 세션 즉시 반영 |

## 검증 결론

- 계약상 경로, 권한 키, API 6개 enforcement, 403 envelope, 메뉴/route/status gate 및 Role 저장 후 갱신은 일치한다.
- 직접 URL의 status gate 결함 1건은 QA 전달 후 수정되어 클로즈했다.
- post-unwrap TypeScript 타입 불일치 1건도 FE 수정 후 재확인하여 클로즈했다.

## 테스트 공백 권고

- `DmovePermissionCheckerTest`는 권한 판정 단위 테스트를 포함한다.
- 다만 controller 레벨에서 6개 경로 각각이 `view=false`일 때 HTTP 200 + `code:403`을 반환하는 테스트와, FE `CloudInfraGate`가 `useCloudStatus(true)`를 호출하는 테스트 assertion을 추가하면 회귀 방지가 강화된다.
