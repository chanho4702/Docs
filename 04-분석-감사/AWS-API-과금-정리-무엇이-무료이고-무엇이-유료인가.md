# AWS API 과금 정리 — 무엇이 무료이고 무엇이 유료인가

- 기준일: 2026-08-24
- 목적: MovesEye 클라우드(AWS) 모니터링이 호출하는 API별 과금 여부를 한 장으로 확정한다. "무과금 모드"의 근거 문서.
- 코드 정본: `moveseye-be-spring/src/main/java/com/dmove/moveseye/aws/client/AwsReadOnlyGateway.java` — **AWS SDK 호출은 이 클래스에만 존재**하므로, 이 문서의 표와 게이트웨이 메서드 목록이 곧 제품의 과금 노출 전부다.
- 관련 계약: `_workspace/contract_aws-zero-cost.md`

---

## 1. 지금 제품이 호출하는 API — 전부 무료 ✅

EC2 API 요청 자체에는 요금이 없다(과금은 리소스 사용량에만 붙는다). CloudTrail **Event history**(최근 90일) 조회도 무료다.

| API | 서비스 | 우리 사용처 | 과금 |
|---|---|---|---|
| `ec2:DescribeRegions` | EC2 | 리전 목록, 연결 테스트(`POST /cloud-infras/test-connection`) | 무료 |
| `ec2:DescribeInstances` | EC2 | 인스턴스 목록·상세·overview | 무료 |
| `ec2:DescribeInstanceStatus` | EC2 | Status Check(위험 판정) | 무료 |
| `ec2:DescribeVpcs` | EC2 | VPC 목록·상세 | 무료 |
| `ec2:DescribeSubnets` | EC2 | VPC 상세(서브넷) | 무료 |
| `ec2:DescribeRouteTables` | EC2 | VPC 상세(라우팅) | 무료 |
| `ec2:DescribeInternetGateways` | EC2 | VPC 상세(IGW·노출 진단) | 무료 |
| `ec2:DescribeNatGateways` | EC2 | VPC 상세 | 무료 |
| `ec2:DescribeSecurityGroups` | EC2 | VPC 상세(보안 진단, 0.0.0.0/0 검사) | 무료 |
| `ec2:DescribeVolumes` | EC2 | EC2 상세(볼륨) | 무료 |
| `cloudtrail:LookupEvents` | CloudTrail | 이벤트 이력 화면(90일 Event history) | 무료 (rate limit 2 TPS 주의) |

> ⚠️ CloudTrail이 무료인 것은 **Event history(90일) 조회**까지다. 트레일(Trail) 생성·S3 적재·CloudTrail Lake는 유료 — 우리는 안 쓴다.

## 2. 조건부 무료 — 다음 단계(차트 복원)에서 쓸 것 🟡

| 항목 | 무료 범위 | 초과 시 | 비고 |
|---|---|---|---|
| `cloudwatch:GetMetricStatistics` | **월 100만 API 요청** (Always Free) | $0.01 / 1,000 요청 | 프리티어 제외 목록(GetMetricData·GetInsightRuleReport·GetMetricWidgetImage)에 **없음** = 포함. 콜 1건 = 지표 1개 × 인스턴스 1개, 호출당 데이터포인트 최대 1,440개 |
| EC2 기본 모니터링 지표 | 무료 (5분 주기) | — | CPU·Network·Disk·StatusCheck. **메모리·디스크 사용률은 없음**(CloudWatch Agent 필요 = 커스텀 지표 유료) |
| `cloudwatch:ListMetrics` 등 기타 CW 조회 | 월 100만 요청 풀에 포함 | $0.01 / 1,000 | |

**예산 감각**: 인스턴스 20대 × 지표 4개 × 5분 폴링 ≈ 월 69만 콜(한도 내). "화면 열 때만 조회" 방식이면 월 수천 콜. 어느 쪽이든 **월 호출 카운터 + 상한 가드 필수** — 고객사 인스턴스 수는 우리가 통제 못 한다.

## 3. 유료 — 제품에서 금지 🔴

`AwsReadOnlyGateway`에 이 API들의 메서드를 만들지 않는 것으로 강제한다. (2026-08-24 기준 코드에 잔존 0건 — SDK 의존성에서 `cloudwatch` 제거, `cloudtrail`만 추가)

| 항목 | 요금 | 과거 사용 여부 |
|---|---|---|
| `cloudwatch:GetMetricData` | $0.01 / 1,000 **지표**(프리티어 제외, 첫 콜부터 과금) | ✅ 구 EC2 상세 차트가 사용 → **제거됨** (레거시 `GET /cloud-infras/ec2`는 빈 배열 + `ZERO_COST_MODE` 반환) |
| `cloudwatch:GetMetricWidgetImage` | 프리티어 제외, 별도 과금 | 미사용 |
| `cloudwatch:GetInsightRuleReport` | 프리티어 제외, 별도 과금 | 미사용 |
| CloudWatch 상세 모니터링(1분 주기) | 커스텀 지표 단가로 인스턴스당 월 ~$2 수준 | 미사용 (활성화 안 함) |
| CloudWatch 알람·대시보드·Logs | 알람 개당·대시보드 개당·GB당 과금 | 미사용 (overview의 `alarms`는 `disabled: ZERO_COST_MODE`) |
| Cost Explorer API (`ce:*`) | **요청당 $0.01** (페이지네이션 요청마다) | 미사용. 리소스 단위 조회는 14일 제약도 있음 |
| CloudWatch Agent 커스텀 지표(메모리 등) | 지표당 월 $0.30~ | 미사용 — 메모리·디스크 사용률은 Zabbix agent 경로로 해결 예정 |

## 4. 운영 원칙

1. **SDK 호출은 `AwsReadOnlyGateway` 단일 창구.** 새 AWS 기능 추가 시 이 문서의 §1·§2에 있는 API만 게이트웨이에 추가할 수 있다. §3의 API를 추가하려면 과금 정책 결정(사용자 승인)이 선행돼야 한다.
2. 게이트웨이 각 메서드 Javadoc에 AWS 공식 API Reference URL을 출처로 남긴다(계약 규칙).
3. `GetMetricStatistics` 도입 시: 월 카운터 + 상한 가드(한도 접근 시 조회 중단·`collection.state` 강등) 없이는 배포하지 않는다.
4. 상태 판정(`GET /cloud-infras/status`)은 AWS를 호출하지 않는다 — 비용·지연 양쪽 이유. 실 호출 확인은 연결 테스트 버튼만.

## 5. 출처 (공식 문서)

- [Amazon CloudWatch Pricing](https://aws.amazon.com/cloudwatch/pricing/) — Free Tier: "1 Million API requests (not including GetMetricData, GetInsightRuleReport and GetMetricWidgetImage)"
- [GetMetricStatistics — CloudWatch API Reference](https://docs.aws.amazon.com/AmazonCloudWatch/latest/APIReference/API_GetMetricStatistics.html) — 파라미터·1,440 포인트 제한·retention 규칙
- [AWS CloudTrail Pricing](https://aws.amazon.com/cloudtrail/pricing/) — Event history(90일) 조회 무료
- [LookupEvents — CloudTrail API Reference](https://docs.aws.amazon.com/awscloudtrail/latest/APIReference/API_LookupEvents.html) — 2 TPS
- [Amazon EC2 API Reference](https://docs.aws.amazon.com/AWSEC2/latest/APIReference/Welcome.html) — API 요청 무과금(리소스 사용량만 과금)
- [AWS Cost Explorer Pricing](https://aws.amazon.com/aws-cost-management/aws-cost-explorer/pricing/) — API 요청당 $0.01
