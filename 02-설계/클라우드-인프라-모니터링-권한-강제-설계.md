---
title: 클라우드 인프라 모니터링 권한 강제 설계
doc_type: design
audience: [개발, 운영, QA]
status: draft
owner: MovesEye 팀
baseline: 2026-08-24
source_of_truth: C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/user/domain/Role.java; C:/solutions/moveseyee_fe/src/hooks/useAuth.ts; C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/aws/CloudInfraController.java
reviewed_at: 2026-08-24
review_cycle: implementation start
deployment_scope: source design only; unimplemented
---

# 클라우드 인프라 모니터링 권한 강제 설계

## 1. 결정 요약

클라우드 인프라 모니터링의 AWS 리소스 조회를 기존 `dmovePermission` 체계로 보호한다.

- 권한 모듈은 기존 `cloudInfraMonitoring`을 유지한다.
- 해당 모듈에 신규 feature `awsResources`를 추가하고, `view`를 AWS 리소스 조회의 유일한 허용 조건으로 쓴다.
- 프론트엔드는 메뉴·라우트·상태 조회를 이 권한으로 제어한다.
- 백엔드는 `/cloud-infras/**`의 민감한 조회 API를 같은 권한으로 직접 차단한다.
- `ADMIN`과 `SUPER_ADMIN`은 기존 관리자 규약대로 항상 허용한다.
- 설정 저장과 연결 테스트는 관리자 전용을 유지한다.

이 문서는 구현 전 설계 초안이다. 현재 배포 동작이나 권한 강제가 완료되었다는 뜻이 아니다.

## 2. 배경과 문제

현재 AWS 자격증명이 있으면 사이드바에 클라우드 메뉴가 노출되고, VPC·EC2·CloudWatch 조회 API는 인증과 visitor 검증만 거친다. 일반 로그인 사용자가 직접 URL 또는 API를 호출해도 클라우드 자산 식별 정보와 운영 지표를 조회할 수 있다.

대상 정보에는 EC2 인스턴스 ID·이름·상태·가용 영역, VPC ID·CIDR·소유 계정 ID, Security Group 이름, CPU·네트워크·디스크 지표가 포함된다. 이는 일반 서버 모니터링과 동등한 운영 데이터이므로 명시적인 조회 권한 경계가 필요하다.

현재 `cloudInfraMonitoring` 모듈에는 `hostGroupCI`, `serverMonitoringCI`, `networkMonitoringCI`만 정의되어 있으며, AWS VPC·EC2 화면은 이 feature들을 사용하지 않는다. 또한 FE의 `useAuth`는 현재 사용자가 가진 `Role.dmovePermission`이 아니라 `UserType`별 `DmovePermissions.of(type)` 기본값을 조회한다. 따라서 Role 편집 화면에서 조정한 권한이 런타임 접근 제어에 사용되지 않는다.

## 3. 범위

### 포함

- AWS 리소스 메뉴, 라우트, API의 `awsResources.view` 권한 검사
- Role에 저장된 `dmovePermission`을 기준으로 한 FE/BE 권한 판정 경로
- 기존 Role 데이터에 신규 feature를 안전하게 보강하는 migration 또는 startup migration
- 허용·거부·관리자 우회의 자동 검증

### 제외

- AWS credential 저장 방식 변경
- AWS API 수집 캐시, pagination, 리전별 실패 표기 개선
- Azure/GCP 등 다중 클라우드 provider 구현
- `hostGroupCI` 등 기존 미사용 feature의 정리

## 4. 권한 모델

### 4.1 권한 식별자

```text
module:  cloudInfraMonitoring
feature: awsResources
action:  view
```

`awsResources`는 VPC, EC2 목록·대시보드·상세 지표를 함께 보호한다. 화면별로 분리하지 않는 이유는 현재 기능이 읽기 전용 AWS 리소스 조회 한 단위이며, EC2 상세만 따로 감추면 목록의 인스턴스 식별 정보가 그대로 노출되기 때문이다.

향후 비용 관리나 클라우드 설정은 별도 feature로 분리한다. 기존 `cloudInfraInfo`는 설정 권한이며 `awsResources`를 대신하지 않는다.

### 4.2 기본값과 기존 Role 보강

| 대상 | `awsResources.view` 기본값 | 이유 |
|---|---:|---|
| `SUPER_ADMIN`, `ADMIN` | `true` | 기존 관리자 우회 규약과 일치 |
| 일반 Role | `false` | 기존 AWS 데이터의 무의식적 전체 공개를 막는 deny-by-default |
| 기존 Role에 feature 누락 | `false` | 누락은 허용으로 해석하지 않음 |

신규 Role 템플릿(`DmovePermissions.of`)에도 같은 feature를 추가한다. 이미 저장된 Role의 `dmove_permission` JSON에는 신규 feature가 없으므로, 배포 시 일회성 데이터 migration으로 각 Role의 `cloudInfraMonitoring` 모듈에 `awsResources`를 삽입한다. 기존 feature와 사용자가 조정한 값은 변경하지 않는다.

운영 전 관리자는 AWS 접근이 필요한 Role에만 `awsResources.view=true`를 부여한다.

## 5. 런타임 권한 판정

### 5.1 단일 판정 서비스

BE에 `DmovePermissionChecker`를 둔다.

```text
requireView(currentUser, "cloudInfraMonitoring", "awsResources")
```

판정 순서는 다음과 같다.

1. 인증된 `TokenUserInfo`에서 현재 `User`를 찾는다.
2. `User.refRole`로 `Role`을 찾고 `Role.dmovePermission`을 읽는다.
3. `ADMIN` 또는 `SUPER_ADMIN`이면 허용한다.
4. 그 외에는 module·feature가 존재하고 `view=true`일 때만 허용한다.
5. Role, module, feature가 없거나 조회에 실패하면 `ForbiddenError("Access Denied")`로 거부한다.

`@RolesGuarded`와 `@Roles`는 사용하지 않는다. 이는 `roleid`와 `UserRole` enum만 비교하므로 Role에 저장된 feature 단위 권한을 표현할 수 없고, 순수 admin의 `roleid=null` 문제도 있다.

### 5.2 API 적용 범위

| API | 요구 권한 | 비고 |
|---|---|---|
| `GET /cloud-infras/status` | `awsResources.view` | credential source/default region도 운영 구성 정보이므로 보호 |
| `GET /cloud-infras/regions` | `awsResources.view` | 리전 선택 목록 |
| `GET /cloud-infras/vpcs` | `awsResources.view` | VPC·CIDR·owner 정보 |
| `GET /cloud-infras/ec2s` | `awsResources.view` | EC2·Security Group 정보 |
| `GET /cloud-infras/ec2-dashboard` | `awsResources.view` | 리소스 집계 |
| `GET /cloud-infras/ec2` | `awsResources.view` | CloudWatch 상세 지표 |
| `POST /cloud-infras/test-connection` | 관리자 | 현행 `AdminAccessChecker` 유지 |
| `GET/POST /settings/cloud-infra` | 관리자 | 현행 관리자 정책 유지 |

권한 거부는 기존 `ForbiddenError` 규약을 사용한다. 이 서비스는 HTTP 200 body code `403`으로 표현하는 기존 응답 envelope를 유지한다. HTTP 상태를 새로 바꾸지 않는다.

## 6. FE 설계

### 6.1 권한 데이터의 정본 전환

현재 `GET /users/role/permission?type=...&platform=DMOVE`는 Role별 저장 값이 아니라 `DmovePermissions.of(type)`을 반환한다. 이 endpoint를 호출자 권한 판단에 계속 사용하면 Role UI에서 `awsResources`를 꺼도 화면과 API 접근이 달라진다.

따라서 로그인 사용자를 위한 `GET /users/me/permissions`를 추가한다. 응답은 현재 Role의 `dmovePermission`을 flat feature map 또는 기존 `DMoveModule[]` 형태로 제공한다. 권한을 변경한 뒤에는 재로그인 없이 다음 권한 refetch 시 반영되도록 해당 query를 invalidate한다.

`GET /users/role/permission`은 Role 생성·편집 화면에서만 기본 템플릿을 보여주는 용도로 유지한다.

### 6.2 화면 동작

1. `DmovePermissionsKey`에 `AWS_RESOURCES = "awsResources"`를 추가한다.
2. `useAuth`는 `/users/me/permissions` 응답으로 Redux `permissions`를 채운다.
3. `SideNav`의 클라우드 메뉴는 `permissions.awsResources.view`가 true인 경우에만 노출한다.
4. `useCloudStatus`는 `awsResources.view`가 false이면 호출하지 않는다.
5. `/cloud-infra-monitoring/**` 모든 route는 `PageWrapper`의 `permissionKey` 또는 동등한 route guard로 보호한다.
6. 직접 URL 진입 중 권한이 없으면 403 안내 또는 제품 표준 404 경로로 보낸다. API 오류를 빈 화면으로 처리하지 않는다.

AWS 자격증명 미설정과 권한 없음은 분리한다.

| 상태 | 메뉴/화면 처리 |
|---|---|
| 권한 없음 | 메뉴 미노출, 직접 접근 차단 |
| 권한 있음 + AWS 미설정 | 메뉴는 disabled, 설정 안내 표시 |
| 권한 있음 + AWS 설정됨 | 정상 노출·조회 |

## 7. BE 설계

1. `RoleRepository`와 `UserRepository`를 사용하는 `DmovePermissionChecker`를 구현한다.
2. `CloudInfraController`의 status·AWS 리소스 조회 메서드에 `@CurrentUser TokenUserInfo`를 받고 checker를 호출한다.
3. `DmovePermissions.of`의 `cloudInfraMonitoring` 모듈에 `awsResources`를 추가한다.
4. Role JSON을 보강하는 Flyway migration을 추가한다. JSONB 배열에서 모듈·feature가 없을 때만 append해야 하며, 재실행해도 중복 삽입되지 않아야 한다.
5. Role 수정 요청은 전달된 `dmovePermission` 전체를 저장하므로, FE Role 편집 화면이 신규 feature를 렌더링·보존하는지 함께 검증한다.

## 8. 검증 기준

### BE

- 일반 Role + `awsResources.view=false`: 모든 보호 API가 `403` envelope를 반환한다.
- 일반 Role + `awsResources.view=true`: `/status`, regions, VPC, EC2, dashboard, detail이 checker를 통과한다.
- `ADMIN`, `SUPER_ADMIN`: Role JSON 값과 무관하게 보호 API를 통과한다.
- Role·module·feature 누락: fail closed로 거부한다.
- 연결 테스트와 설정 API는 일반 Role을 계속 거부한다.

### FE

- 권한 없는 사용자에게 클라우드 메뉴와 AWS status 요청이 나타나지 않는다.
- 권한 없는 사용자가 직접 URL로 진입해도 AWS API를 요청하지 않고 표준 접근 거부 화면으로 이동한다.
- 권한 있는 사용자만 기존 cloud gating 상태를 조회한다.
- Role 편집 화면에서 `cloudInfraMonitoring > awsResources` 토글을 저장하고 다시 열었을 때 값이 보존된다.

### 회귀

- 기존 모니터링·설정 권한의 메뉴 노출과 API 동작이 변하지 않는다.
- AWS 자격증명 미설정 시 `CLOUD_NOT_CONFIGURED` 안내 동작은 권한 있는 사용자에게만 유지된다.

## 9. 구현 순서

1. Role JSON migration과 `DmovePermissions.of`에 `awsResources` 추가
2. 현재 사용자 기준 permissions endpoint와 `DmovePermissionChecker` 구현
3. `CloudInfraController`의 보호 API 연결 및 controller/service test 추가
4. FE enum·`useAuth`·SideNav·route guard·Role 편집 UI 연결
5. BE↔FE 계약 문서 작성, 통합 QA, 권한 조합 E2E 수행

## 10. 롤백

문제 발생 시 새 FE 메뉴 guard만 제거해서 우회하지 않는다. BE 차단을 제거하면 다시 AWS 자산 정보가 전 사용자에게 노출된다.

긴급 롤백이 필요하면 migration 데이터는 유지하고, `awsResources.view=true`를 필요한 Role에만 한시적으로 부여한다. 배포 코드 롤백은 FE와 BE를 같은 릴리스 단위로 수행한다.

## 11. 구현 전 확인 사항

- 기존 운영 Role 중 AWS 리소스 조회가 필요한 Role 목록과 초기 허용 대상을 확정한다.
- Role JSONB migration의 실제 데이터 형태를 staging DB에서 검증한다.
- MCP token이 `/cloud-infras/**`에 접근 가능한지와 적용할 scope를 별도로 결정한다. 본 설계의 기본은 browser 세션과 동일하게 `awsResources.view`가 없으면 거부다.

## 변경 이력

| 날짜 | 변경 |
|---|---|
| 2026-08-24 | 초안 작성: AWS 리소스 조회를 기존 Role `dmovePermission` 기반으로 강제하는 설계 |
