# Cloud infrastructure permission contract

## Purpose

AWS resource monitoring is protected by the existing role `dmovePermission` model.

```text
module:  cloudInfraMonitoring
feature: awsResources
action:  view
```

`ADMIN` and `SUPER_ADMIN` are always allowed by the backend. Other users are allowed only when the role currently assigned to the user has `awsResources.view: true`.

## Permission payload

### `GET /users/me/permissions`

Authentication and `x-visitor-id` are required. The endpoint returns the currently logged-in user's *persisted* role permissions, not the `DmovePermissions.of(type)` template.

Success payload (`data` after the common two-level API unwrap):

```ts
type FeaturePermission = {
  name: string;
  view: boolean;
  edit: boolean;
  delete: boolean;
  download: boolean;
};

type DmovePermission = {
  module: string;
  features: FeaturePermission[];
};

type MePermissionsResponse = DmovePermission[];
```

- For `ADMIN` and `SUPER_ADMIN`, the response is the current default permission template, including `cloudInfraMonitoring.awsResources` with `view: true`.
- For other users, it is the assigned `Role.dmovePermission` JSON as stored. A missing user, role, module, or feature is not synthesized and is treated as no permission by the protected APIs.
- `GET /users/role/permission?type={USER|ADMIN|SUPER_ADMIN}&platform=DMOVE` remains the role-editor template endpoint; it does not become the current-user authorization source.

## Protected AWS APIs

Every API below requires `cloudInfraMonitoring.awsResources.view`. A denial uses the existing common error convention: HTTP 200 with body `code: 403` (`Access Denied`).

| Method | Path | Request | Success payload (`data`) |
|---|---|---|---|
| GET | `/cloud-infras/status` | none | existing `CloudStatusDto` unchanged |
| GET | `/cloud-infras/regions` | none | `{ items: string[] }` |
| GET | `/cloud-infras/vpcs` | existing query parameters | existing VPC map unchanged |
| GET | `/cloud-infras/ec2s` | existing query parameters | existing EC2 list map unchanged |
| GET | `/cloud-infras/ec2-dashboard` | existing query parameters | existing dashboard map unchanged |
| GET | `/cloud-infras/ec2` | existing query parameters | existing EC2/CloudWatch map unchanged |

`POST /cloud-infras/test-connection` remains administrator-only; cloud settings APIs remain administrator-only.

## Role template and migration

`GET /users/role/permission` includes `awsResources` under `cloudInfraMonitoring`.

- `USER`: `{ view: false, edit: false, delete: false, download: false }`
- `ADMIN`, `SUPER_ADMIN`: `{ view: true, edit: false, delete: false, download: false }`

Flyway adds the feature to every existing role without changing any existing feature values. Existing non-administrator roles are therefore deny-by-default until an administrator enables `view` through role storage.

## FE request

- Use `/users/me/permissions` for the logged-in user's menu/route authorization. Do not use `/users/role/permission` for runtime authorization.
- Render/hide the AWS cloud menu and guard cloud routes with `cloudInfraMonitoring.awsResources.view`.
