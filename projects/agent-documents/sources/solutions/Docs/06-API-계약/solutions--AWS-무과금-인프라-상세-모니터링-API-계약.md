# AWS 무과금 인프라 상세 모니터링 API 계약

- 상태: 구현 완료 · FE 연동 가능
- 기준일: 2026-08-24
- 권한: 모든 endpoint는 `cloudInfraMonitoring.awsResources.view` 권한을 서버에서 강제한다.
- 공통 gate: AWS 자격증명이 없으면 `CLOUD_NOT_CONFIGURED`를 반환한다. 권한 거부는 기존 공통 계약대로 HTTP 200 body `code: 403`이다.
- 비용 원칙: 아래 endpoint는 **CloudWatch `GetMetricData`·Cost Explorer를 호출하지 않는다**. CloudTrail은 Event history `LookupEvents`만 사용하며 Trail/Lake 생성이나 데이터 이벤트 조회를 하지 않는다.

## 1. EC2 운영 상세

`GET /cloud-infras/ec2/detail?instanceId={id}&region={region}`

- Query: `instanceId`(필수), `region`(필수)
- 응답: `ApiResult.data`

```ts
type Ec2OperationalDetail = {
  instance: {
    instanceId: string; name: string; state: string | null; instanceType: string | null;
    availabilityZone: string | null; vpcId: string | null; subnetId: string | null;
    privateIp: string | null; publicIp: string | null;
  };
  statusChecks: { overall: '2/2 checks passed' | 'status_check_failed' | 'unobserved'; system: string; instance: string };
  scheduledEvents: Array<{ code: string | null; description: string | null; notBefore: string | null; notAfter: string | null }>;
  securityGroups: Array<{ groupId: string; name: string }>;
  volumes: Array<{
    volumeId: string; state: string; sizeGiB: number; encrypted: boolean; volumeType: string;
    attachments: Array<{ device: string; state: string; deleteOnTermination: boolean }>;
  }>;
  collection: { state: 'ok'; region: string; cloudWatchUsed: false };
};
```

- `INSTANCE_NOT_FOUND`: 해당 리전에 EC2가 없거나 AWS가 `InvalidInstanceID.NotFound`를 반환한 경우. AWS SDK 예외가 HTTP 500으로 누수되지 않는다.
- 최소 IAM: `ec2:DescribeInstances`, `ec2:DescribeInstanceStatus`, `ec2:DescribeVolumes`.

## 2. VPC 구성·노출 상세

`GET /cloud-infras/vpcs/detail?vpcId={id}&region={region}`

- Query: `vpcId`(필수), `region`(필수)
- 응답: `ApiResult.data`

```ts
type VpcDetail = {
  vpc: { vpcId: string; region: string; state: string; ipv4Cidr: string; ownerId: string; tenancy: string; name: string };
  subnets: Array<{ subnetId: string; availabilityZone: string; cidr: string; state: string; mapPublicIpOnLaunch: boolean; availableIpAddressCount: number }>;
  routeTables: Array<{
    routeTableId: string;
    associations: Array<{ subnetId: string; main: boolean }>;
    routes: Array<{ destination: string | null; gatewayId: string | null; natGatewayId: string | null; state: string }>;
  }>;
  internetGateways: Array<{ internetGatewayId: string; state: string }>;
  natGateways: Array<{ natGatewayId: string; state: string; subnetId: string; connectivityType: string }>;
  securityGroups: Array<{
    groupId: string; name: string; description: string;
    inbound: Array<{ protocol: string; fromPort: number | null; toPort: number | null; ipv4Cidrs: string[]; ipv6Cidrs: string[] }>;
  }>;
  instances: Ec2OperationalDetail['instance'][];
  exposureFindings: Array<{
    severity: 'critical' | 'warning'; type: 'PUBLIC_IP_AUTO_ASSIGN' | 'PUBLIC_SECURITY_GROUP_INGRESS';
    resourceId: string; message: string; port?: number | null; protocol?: string;
  }>;
  collection: { state: 'ok'; region: string; cloudWatchUsed: false };
};
```

- `VPC_NOT_FOUND`: 해당 리전에 VPC가 없거나 AWS가 `InvalidVpcID.NotFound`를 반환한 경우. AWS SDK 예외가 HTTP 500으로 누수되지 않는다.
- 진단 의미: `mapPublicIpOnLaunch=true`, 또는 Security Group inbound에 `0.0.0.0/0`/`::/0`가 있으면 finding을 낸다. 22/3389/3306/5432/1433/6379은 `critical`, 그 외는 `warning`이다. route table은 원문 구성 데이터를 반환하며, 현재 finding은 route의 도달 가능성까지 추론하지 않는다.
- 최소 IAM: `ec2:DescribeVpcs`, `ec2:DescribeSubnets`, `ec2:DescribeRouteTables`, `ec2:DescribeInternetGateways`, `ec2:DescribeNatGateways`, `ec2:DescribeSecurityGroups`, `ec2:DescribeInstances`.

## 3. CloudTrail Event history

`GET /cloud-infras/cloudtrail/events?region={region}&resourceId={optional}&eventName={optional}&maxResults={optional}`

- Query: `region`(필수), `resourceId`(선택, 최대 256자), `eventName`(선택, 최대 128자), `maxResults`(선택, 기본 50·1~50으로 clamp)
- `resourceId`와 `eventName`을 함께 보내면 AWS `LookupEvents` 제약에 따라 `resourceId`만 적용한다.
- 요청 기간은 서버가 현재 시각 기준 최근 90일로 고정한다. pagination token은 제공하지 않는다.

```ts
type CloudTrailEventHistory = {
  items: Array<{
    eventId: string; eventName: string; eventTime: string | null; username: string | null;
    resources: Array<{ type: string; name: string }>;
    readOnly: string | null; source: string | null;
  }>;
  collection:
    | { state: 'ok'; region: string; retentionDays: 90; nextTokenAvailable: false }
    | { state: 'unavailable'; region: string; reason: 'CLOUDTRAIL_EVENT_HISTORY_UNAVAILABLE'; retentionDays: 90 };
};
```

- partial/unavailable: Event history 미활성 리전, IAM 거부, AWS 오류 시 endpoint 전체를 실패시키지 않고 `items: []` 및 `collection.state='unavailable'`을 반환한다. 따라서 FE는 빈 목록을 “변경 없음”으로 표시하지 말고 수집 불가 안내를 표시해야 한다.
- 최소 IAM: `cloudtrail:LookupEvents`.

## 공통 오류

| 조건 | 응답 |
|---|---|
| 권한 없음 | HTTP 200, body `code: 403` (기존 공통 계약) |
| AWS 연결 미설정 | `CLOUD_NOT_CONFIGURED` |
| 필수 query 누락·길이 위반 | Spring validation error |
| EC2/VPC 없음 | `INSTANCE_NOT_FOUND` / `VPC_NOT_FOUND` |
