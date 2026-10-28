# AWS 클라우드 모니터링 무과금 모드 계약

- status: implemented
- baseline: 2026-08-24
- source_of_truth: `moveseye-be-spring/src/main/java/com/dmove/moveseye/aws/client/AwsReadOnlyGateway.java`
- reviewed_at: 2026-08-24

## 원칙

> **개정(2026-08-24, features/cloud/aws-monitoring/contract_aws-status-timeline.md)**: `cloudwatch:GetMetricStatistics`는 프리티어(월 100만) 內 · 월 예산 가드 전제 하에 허용한다. 아래 "CloudWatch 지표·알람 미사용" 문구는 GetMetricData 계열(첫 콜부터 과금)에 대한 것으로 유지된다.

클라우드 화면은 EC2/VPC `Describe*` 조회와 CloudTrail Event history `LookupEvents`만 사용한다. CloudWatch 지표·알람 및 Cost Explorer 요청은 수행하지 않는다. AWS 자격증명·`awsResources.view` 권한·기존 EC2/VPC 상세 및 CloudTrail API는 그대로 유지한다.

AWS SDK 호출은 `AwsReadOnlyGateway`에만 둔다. `AwsServiceImpl`은 AWS 모델을 DMOVE 응답으로 조립하고 오류를 변환할 뿐 SDK client/request를 만들지 않는다. 게이트웨이의 각 메서드 Javadoc에는 해당 AWS 공식 API Reference URL을 출처로 남긴다.

### AWS 공식 출처

- [EC2 DescribeInstances](https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_DescribeInstances.html)
- [EC2 DescribeInstanceStatus](https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_DescribeInstanceStatus.html)
- [EC2 DescribeVpcs](https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_DescribeVpcs.html)
- [EC2 DescribeSubnets](https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_DescribeSubnets.html)
- [EC2 DescribeRouteTables](https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_DescribeRouteTables.html)
- [EC2 DescribeInternetGateways](https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_DescribeInternetGateways.html)
- [EC2 DescribeNatGateways](https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_DescribeNatGateways.html)
- [EC2 DescribeSecurityGroups](https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_DescribeSecurityGroups.html)
- [EC2 DescribeVolumes](https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_DescribeVolumes.html)
- [CloudTrail LookupEvents](https://docs.aws.amazon.com/awscloudtrail/latest/APIReference/API_LookupEvents.html)

## `GET /cloud-infras/overview`

- 권한: `cloudInfraMonitoring.awsResources.view`
- 입력: 기존 `regions`, `range`, `from`, `to`를 계속 허용·검증한다. 범위 값은 하위호환용이며 무과금 상태 요약에는 영향을 주지 않는다.
- 수집: 리전별 `DescribeInstances`, `DescribeInstanceStatus`.

응답 `data`의 주요 구조:

```ts
{
  summary: {
    totalInstances: number; healthyInstances: number; warningInstances: number;
    criticalInstances: number; unobservedInstances: number; stoppedInstances: number;
    activeAlarms: 0; lastCollectedAt: string;
  };
  collection: {
    regions: Array<{
      region: string;
      ec2: { state: 'ok' | 'unavailable'; lastCollectedAt: string | null; reason: string | null };
      cloudWatch: { state: 'disabled'; lastCollectedAt: null; reason: 'ZERO_COST_MODE' };
      alarms: { state: 'disabled'; lastCollectedAt: null; reason: 'ZERO_COST_MODE' };
    }>;
  };
  riskResources: Array<{
    instanceId: string; instanceName: string; region: string; availabilityZone: string | null;
    state: string | null; statusCheck: string | null; cpuAverage: null; memoryAverage: null;
    alarmState: null; severity: 'critical' | 'warning' | 'unobserved' | 'stopped'; reasons: string[];
  }>;
  trends: { instanceStates: []; cpuTop: []; networkTop: [] };
  alarms: [];
}
```

위험 등급은 Status Check 실패=`critical`, `pending`=`warning`, Status Check 미수집=`unobserved`, `stopped`=`stopped`만 사용한다. CPU·네트워크·알람을 근거로 한 위험 판단은 하지 않는다.

## 레거시 `GET /cloud-infras/ec2`

기존 `ec2Info`, `cpu`, `memory`, `networkIn`, `networkOut`, `networkPacketsIn`, `networkPacketsOut`, `diskRead`, `diskWrite` 키를 보존한다. 여덟 지표 배열은 모두 빈 배열이며 다음 수집 상태를 추가한다.

```ts
collection: { state: 'disabled', reason: 'ZERO_COST_MODE' }
```

따라서 기존 화면은 응답 파싱 오류 없이 빈 차트 상태를 표현해야 하며, 자동 재시도를 하지 않는다.
