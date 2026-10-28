---
tags: [moveseye, authorization, aws, spring]
updated: 2026-08-24
---

# Cloud infrastructure monitoring permission

AWS inventory and CloudWatch data must be protected at the backend, not only by FE menu visibility. The authorization key is `cloudInfraMonitoring.awsResources.view` in the assigned `Role.dmovePermission` JSON.

- `ADMIN` and `SUPER_ADMIN` keep an explicit backend bypass because the historical admin account may not have a linked Zabbix role (`roleid=null`).
- Other users fail closed when their user, linked role, module, or feature is missing.
- Runtime UI authorization must use `GET /users/me/permissions`, which returns the assigned Role JSON. `GET /users/role/permission` is a role-editor template endpoint and cannot reflect per-role customizations.
- Existing roles require a JSONB-preserving Flyway migration that appends `awsResources` with `view=false`; never overwrite the complete permission document when adding a feature.
- Navigation keeps the cloud section hidden without `awsResources.view`, and now exposes `EC2 dashboard → EC2 instances → VPCs` directly. The redundant AWS-only intermediate submenu was removed from both desktop and mobile navigation; `COMPUTE · EC2` and `NETWORK · VPC` headings keep the remaining entries legible without adding a click; command-palette entries carry the same permission key.
- The existing EC2 dashboard is inventory aggregation rather than operational cloud monitoring. The next design reframes it as a cloud overview with risk resources, trend charts, alarms, partial-collection states, and explicit separation of VM health from application health (`_workspace/devdesign_cloud-monitoring-rebuild.md`).

Related: [[projects/moveseye/2026-07-16-auth-hardening|2026-07-16-auth-hardening]], [[projects/moveseye/2026-08-21-monitoring-coverage-api|2026-08-21-monitoring-coverage-api]]

## Cloud overview API (2026-08-24)

## Zero-additional-cost AWS monitoring (2026-08-24)

- AWS SDK 호출은 `aws/client/AwsReadOnlyGateway`로 단일화했다. 서비스 계층은 AWS request/client를 만들지 않으며, 각 gateway 메서드의 Javadoc에서 사용 API와 AWS 공식 Reference URL을 확인한다.
- The operational EC2 detail uses only EC2 `Describe*` calls for status checks, scheduled events, security groups, and EBS volumes. It must not call CloudWatch `GetMetricData`.
- VPC detail exposes subnets, route tables, IGW/NAT, security groups, and attached instances, then derives public-exposure findings locally from those read-only responses.
- CloudTrail Event history via `LookupEvents` is limited to 90 days. Do not silently replace it with a paid Trail, Lake, or data-event store.
- A running old Spring process retains previous exception mapping after a build; verify AWS not-found behavior only after the process restart.

## Free operational detail APIs (2026-08-24)

- EC2/VPC 목록의 상세 진입은 URL 이동이 아니라 우측 Drawer로 전환했다. 기존 상세 라우트는 유지하되 상세 컴포넌트가 선택한 `instanceId`/`vpcId`와 `region`을 props로도 받아 목록 패널과 직접 URL 양쪽에서 재사용된다. 공용 `ResizableDrawer`를 사용해 폭을 드래그로 조절하고 리소스별 폭을 브라우저에 기억한다.
- 패널 내부의 EC2/VPC 상세 테이블은 기본 1000px 가로 스크롤을 쓰지 않고 패널 폭(`100%`)·small density·fixed layout을 사용한다. 긴 식별자와 설명은 필요한 곳에서 ellipsis 처리한다.
- Added permission-protected EC2 operational detail, VPC topology/exposure detail, and CloudTrail Event history APIs. They use only read-only `Describe*` calls and `cloudtrail:LookupEvents`; no `GetMetricData`, Cost Explorer, CloudTrail trail/Lake creation, or polling is introduced.
- CloudTrail Event history is capped to the AWS-provided 90-day management-event window. Its unavailable state is explicit so an empty event list is never misrepresented as "no changes". Contract: `_workspace/contract_aws-free-monitoring.md`.

- Cloud visibility stays inside the existing Monitoring navigation while scope is EC2/VPC/CloudWatch. The first AWS entry is the operational overview; an independent top-level cloud area is deferred until cost, security, and application observability are real product areas.

- 운영 개요는 기존 EC2 상세의 `인스턴스 × 8개 지표` 호출을 재사용하지 않는다. 리전 단위로 EC2/Status Check와 Alarm을 독립 수집하고, CPU/Network는 최대 100 인스턴스의 3개 지표를 하나의 `GetMetricData` 배치로 조회한다.
- 부분 실패는 0 또는 정상으로 변환하지 않고 `collection.regions[].{ec2,cloudWatch,alarms}`의 `ok|partial|unavailable`과 안전한 reason code로 전달한다.
- EC2 API는 과거 상태 시계열을 제공하지 않으므로 `instanceStates`를 억지 0 차트로 만들지 말고 1차에는 빈 배열/미수집으로 계약한다. 상세 계약은 [[projects/moveseye/2026-08-24-cloud-infra-permission|2026-08-24-cloud-infra-permission]] 및 `_workspace/contract_cloud-monitoring-overview.md`를 참조한다.
