---
title: 클라우드 모니터링 재구성 설계 및 Claude 인계
status: draft-for-implementation
baseline: 2026-08-24
source_of_truth:
  - moveseyee_fe/src/pages/cloud-infra-monitoring/aws-resources/EC2Dashboard.tsx
  - moveseye-be-spring/src/main/java/com/dmove/moveseye/aws/AwsServiceImpl.java
  - _workspace/contract_cloud-infra-permission.md
reviewed_at: 2026-08-24
owners:
  - FE: Claude
  - BE API/CloudWatch: Codex 또는 BE 담당자
---

# 클라우드 모니터링 재구성

## 1. 결론

현재 화면은 **AWS 인벤토리 조회**다. EC2 개수·타입·상태·Status Check 집계와 EC2/VPC 목록은 제공하지만, 운영자가 첫 화면에서 답해야 하는 아래 질문에는 답하지 못한다.

- 지금 장애나 주의 상태인 리소스가 무엇인가?
- 어느 리전과 인스턴스가 영향을 받는가?
- CPU·네트워크 사용량이 악화 중인가?
- CloudWatch Alarm이 발생했는가?
- VM은 켜져 있지만 실제 애플리케이션은 정상 응답하는가?

따라서 `EC2 대시보드`를 유지·확장하는 방식이 아니라, 최상위 화면을 **클라우드 개요(운영 관제)**로 재정의한다. 기존 EC2/VPC 목록은 그 개요에서 drill-down 하는 인벤토리 화면으로 남긴다.

## 2. 현재 기준선

### 현재 제공 데이터

| 화면 | 실제 제공 정보 | 한계 |
|---|---|---|
| EC2 대시보드 | 리전·타입·인스턴스 상태·EC2 Status Check별 건수 | 시계열·위험 우선순위·알람 없음 |
| EC2 목록 | 인스턴스 상태, AZ, VPC, 보안 그룹 이름, Status Check | 정렬 가능한 운영 위험 신호와 요약 없음 |
| EC2 상세 | CPU, Network In/Out, 패킷, Disk Read/Write, CWAgent 메모리 | 개별 인스턴스에 들어가야만 볼 수 있음; CWAgent 없으면 메모리 없음 |
| VPC 목록 | VPC 상태, CIDR, EC2 수 | Subnet/NAT/Load Balancer/흐름·오류 정보 없음 |

### 현재 데이터 취득의 제약

- EC2 인스턴스 상태와 Status Check는 AWS EC2 API 기반이다.
- CPU·네트워크·디스크는 개별 EC2 상세에서 CloudWatch를 조회한다.
- 메모리는 AWS 기본 EC2 지표가 아니며 CloudWatch Agent(CWAgent)가 설치된 경우에만 제공된다.
- `running` 또는 `2/2 checks passed`는 VM/호스트 건강 신호일 뿐 애플리케이션의 HTTP 응답, 오류율, 지연시간을 의미하지 않는다.

## 3. 제품 목표와 비목표

### 목표

1. 온콜 담당자가 30초 안에 **현재 위험 리소스와 영향 범위**를 찾는다.
2. EC2 목록으로 넘어가지 않아도 위험 원인(상태 검사, CPU, 메모리, 알람)을 본다.
3. 리전과 기간을 일관되게 바꿔 현황·추이·위험 목록을 함께 해석한다.
4. 자산 인벤토리와 애플리케이션 관제를 혼동하지 않는다.

### 비목표

- 1차에서 AWS Console 전체를 복제하지 않는다.
- 1차에서 비용, IAM 보안 감사, CloudTrail 분석, RDS/EKS/ECS 전체를 넣지 않는다.
- 1차에서 애플리케이션 APM을 EC2 상태로 추정하지 않는다.

## 4. 권장 정보 구조

```text
클라우드 모니터링
├─ 개요                         # 1차 핵심: 지금 위험한가?
├─ 인프라
│  ├─ 컴퓨팅 · EC2              # 기존 인스턴스 목록/상세
│  ├─ 네트워크 · VPC            # 기존 VPC, 후속으로 ALB/NLB/NAT/Subnet
│  └─ 스토리지 · EBS            # 후속
├─ 신뢰성
│  ├─ 알람과 이벤트             # 1차: CloudWatch Alarm
│  └─ 애플리케이션 상태         # 2차: Synthetic/APM/SLO
└─ 거버넌스
   ├─ 비용                      # 후속
   └─ 보안                      # 후속
```

메뉴는 리소스 종류가 아니라 운영 질문에 따라 시작한다. 첫 진입점은 반드시 `개요`다.

> **2026-08-24 구현 결정:** 클라우드 기능은 현재 범위(EC2/VPC/CloudWatch)에서는 독립 최상위 메뉴가 아니라 `모니터링` 내부의 AWS 구획으로 제공한다. 개요는 그 구획의 첫 진입 화면이며, 비용·보안·애플리케이션 관제가 확장될 때만 독립 정보 구조를 재검토한다.

## 5. 1차 구현 범위 — 클라우드 개요

### 5.1 화면 구성

#### A. 운영 상태 요약 (상단 고정)

| 카드 | 값 | 클릭 동작 |
|---|---|---|
| 전체 인스턴스 | 선택 리전의 전체 수 | EC2 목록 필터 |
| 정상 | running + Status Check 정상 | EC2 목록 필터 |
| 주의 | CPU/메모리 임계치 초과 또는 Alarm 경고 | 위험 리소스 필터 |
| 장애 | Status Check 실패 또는 Alarm ALARM | 위험 리소스 필터 |
| 활성 알람 | 현재 ALARM 수 | 알람과 이벤트 |

- 카드에는 단순 수뿐 아니라 `지난 1시간 대비 증감` 또는 `새로 발생`을 표시한다.
- 데이터 수집 실패·권한 부족·CWAgent 미설치를 정상 0으로 표시하지 않는다. `수집 불가` 상태와 이유를 명시한다.

#### B. 위험 리소스 우선 목록 (첫 화면의 핵심)

정렬 우선순위: `Status Check 실패` → `CloudWatch Alarm=ALARM` → `CPU/메모리 임계치 초과` → `stopped/pending`.

필수 열:

| 리소스 | 리전/AZ | 상태 | 건강 신호 | 최근 지표 | 위험 사유 | 동작 |
|---|---|---|---|---|---|---|
| 인스턴스 이름 + ID | region / AZ | running 등 | 2/2, 1/2, 0/2 | CPU %, 메모리 % (가능할 때) | Status Check 실패 등 | EC2 상세 |

- 위험 리소스가 없으면 “정상입니다”만 보여주지 말고, 감시 대상 수와 마지막 동기화 시각을 함께 표시한다.
- 기본 상위 10건, 전체 보기 링크 제공.

#### C. 상태 추이와 Top N

1. **인스턴스 상태 추이**: running/stopped/degraded 개수의 시계열
2. **CPU Top 5**: 최근 1시간 평균 CPU가 높은 인스턴스
3. **Network Top 5**: Network In/Out이 높은 인스턴스

차트에는 공통 기간 선택기(`1h`, `6h`, `24h`, `7d`)와 리전 필터를 적용한다. 자동 새로고침은 1분, 사용자가 기간을 과거로 바꾸면 자동 새로고침을 끈다.

#### D. 활성 알람과 최근 변경

1차 최소 구현은 CloudWatch Alarm의 `ALARM`, `INSUFFICIENT_DATA`, `OK` 상태와 전환 시각을 제공한다.

- `ALARM`만 기본 노출하고, `INSUFFICIENT_DATA`는 경고 상태로 구분한다.
- CloudTrail 기반 배포·구성 변경 상관관계는 2차다. 데이터가 없는데 “최근 변경 없음”이라고 표시하지 않는다.

### 5.2 상태 판정 원칙

| 판정 | 기준 | 비고 |
|---|---|---|
| 장애 | EC2 Status Check가 2/2 미만 또는 연결된 CloudWatch Alarm이 ALARM | 우선 노출 |
| 주의 | 설정 가능한 CPU/메모리 임계치 초과, Alarm INSUFFICIENT_DATA | 메모리는 CWAgent 필요 |
| 정상 | 관측 가능한 신호 모두 정상 | 미수집은 정상에 포함 금지 |
| 미수집 | CloudWatch 권한/데이터/CWAgent 없음 | 회색 정보 상태 |

임계치의 초기값은 UI에 하드코딩하지 않는다. 1차는 `CPU 80%`, `Memory 85%`를 시스템 기본값으로 두되, 다음 단계에서 설정 화면 또는 Alarm 기준으로 일원화한다.

## 6. API 계약 초안 (BE 선행 필요)

> 기존 `/cloud-infras/ec2-dashboard`는 호환성을 위해 유지한다. 새 화면은 아래 개요 API를 사용한다.

### GET `/cloud-infras/overview`

Query:

```text
regions=ap-northeast-2,us-east-1
range=1h
```

| 필드 | 규칙 |
|---|---|
| `regions` | 선택 사항. 쉼표 구분 리전 코드이며 URL 인코딩한다. 생략하면 기존 `/cloud-infras/regions`가 반환한 전체 리전을 대상으로 한다. 최대 20개다. |
| `range` | 선택 사항. `1h`, `6h`, `24h`, `7d` 중 하나이며 기본값은 `1h`다. |
| `from` / `to` | `range` 대신 사용할 수 있는 UTC ISO-8601 쌍. 둘 중 하나만 보내거나 `range`와 함께 보내면 400이다. 최대 기간은 7일이다. |
| CloudWatch period | 클라이언트가 보내지 않는다. 서버가 `1h=60초`, `6h=300초`, `24h=900초`, `7d=3600초`로 정한다. |

응답 payload 초안:

```json
{
  "summary": {
    "totalInstances": 42,
    "healthyInstances": 37,
    "warningInstances": 3,
    "criticalInstances": 2,
    "unobservedInstances": 0,
    "stoppedInstances": 0,
    "activeAlarms": 1,
    "lastCollectedAt": "2026-08-24T10:15:00Z"
  },
  "collection": {
    "regions": [
      {
        "region": "ap-northeast-2",
        "ec2": { "state": "ok", "lastCollectedAt": "2026-08-24T10:15:00Z", "reason": null },
        "cloudWatch": { "state": "partial", "lastCollectedAt": "2026-08-24T10:14:00Z", "reason": "CWAGENT_METRIC_NOT_FOUND" },
        "alarms": { "state": "ok", "lastCollectedAt": "2026-08-24T10:15:00Z", "reason": null }
      }
    ]
  },
  "riskResources": [
    {
      "instanceId": "i-...",
      "instanceName": "api-01",
      "region": "ap-northeast-2",
      "availabilityZone": "ap-northeast-2a",
      "state": "running",
      "statusCheck": "1/2 checks failed",
      "cpuAverage": 93.2,
      "memoryAverage": null,
      "alarmState": "ALARM",
      "severity": "critical",
      "reasons": ["EC2_STATUS_CHECK_FAILED", "CLOUDWATCH_ALARM"]
    }
  ],
  "trends": {
    "instanceStates": [
      { "timestamp": "2026-08-24T10:00:00Z", "running": 37, "stopped": 3, "pending": 0, "degraded": 2, "unobserved": 0 }
    ],
    "cpuTop": [
      { "instanceId": "i-...", "instanceName": "api-01", "region": "ap-northeast-2", "average": 93.2, "unit": "percent" }
    ],
    "networkTop": [
      { "instanceId": "i-...", "instanceName": "api-01", "region": "ap-northeast-2", "inBytesPerSecond": 1200000, "outBytesPerSecond": 650000 }
    ]
  },
  "alarms": [
    { "alarmArn": "arn:aws:cloudwatch:...", "name": "api-01-cpu-high", "region": "ap-northeast-2", "state": "ALARM", "stateUpdatedAt": "2026-08-24T10:10:00Z", "resourceId": "i-...", "reason": "Threshold Crossed" }
  ]
}
```

`collection.regions[*].{ec2,cloudWatch,alarms}.state`는 `ok | partial | unavailable` 중 하나다. `reason`은 안전한 오류 코드만 전달하며 AWS credential·내부 예외 문자열은 포함하지 않는다.

### 상태 집계와 위험 우선순위

인스턴스는 **단 하나의** 집계 상태만 가진다. `totalInstances = healthyInstances + warningInstances + criticalInstances + unobservedInstances + stoppedInstances`가 성립해야 하며, `stoppedInstances`는 개요 응답의 summary에 별도 포함한다.

1. `critical`: EC2 Status Check 2/2 미만 또는 연결 Alarm `ALARM`
2. `warning`: critical이 아니면서 CPU/메모리 임계치 초과, `pending`, 또는 Alarm `INSUFFICIENT_DATA`
3. `unobserved`: EC2/CloudWatch 관측 실패로 상태를 판단할 수 없음
4. `healthy`: running, Status Check 2/2, critical/warning 사유 없음, 필요한 CPU 관측 가능
5. `stopped`: 중지된 인스턴스. 기본적으로 장애로 간주하지 않으며 별도 집계한다. 단 Alarm이 있으면 1번 우선순위를 따른다.

CWAgent 메모리 미설치는 CPU/Status Check가 정상인 인스턴스를 `unobserved`로 강등하지 않는다. 해당 필드만 `null` 및 `agent-required`로 표현한다.

### Drill-down 계약

| 개요 동작 | 목적지 | 파라미터 |
|---|---|---|
| 전체/정상/주의/장애 카드 | `/cloud-infra-monitoring/ec2-list` | 1차에는 `regions`만 전달. `health` 필터는 EC2 목록 API 확장과 함께 2차에 추가한다. |
| 위험 리소스 행 | `/cloud-infra-monitoring/ec2-list/:instanceId` | `region=<region>` 필수 |
| CPU/Network Top N 행 | 동일 EC2 상세 | `region=<region>` 필수 |
| 활성 알람 카드 / 전체 보기 | `/cloud-infra-monitoring/alarms` | `regions`, 기본 `state=ALARM` |

`/cloud-infra-monitoring/alarms`는 1차에 새로 추가하는 FE route다. BE Alarm API가 준비되기 전에는 메뉴나 링크를 노출하지 않는다.

### BE 구현 유의사항

- 현행 AWS 조회는 리전별 fan-out이다. 개요 API에서 모든 인스턴스 × 모든 기간 지표를 동기 호출하면 호출량과 지연이 급증한다.
- 1차는 선택 리전과 Top N에 CloudWatch 시계열을 제한하고, 요약과 목록은 EC2 API/Alarm API로 빠르게 반환한다.
- 응답에는 부분 실패를 표현하는 `collection` 상태를 반드시 포함한다. 한 리전 실패가 전체 성공 0건으로 보이면 안 된다.
- `DescribeAlarms` 및 CloudWatch metric 조회 IAM 권한을 문서화하고, 액세스 키·비밀 값은 응답·로그에 절대 포함하지 않는다.
- 기존 `cloudInfraMonitoring.awsResources.view` 권한은 모든 조회 API에 유지한다. 관리자 설정 API와 읽기 권한을 섞지 않는다.

## 7. 애플리케이션 상태는 별도 2차

애플리케이션의 "구동 중"은 EC2 API만으로 판단할 수 없다. 다음 중 하나 이상의 실제 관측 신호가 필요하다.

| 신호 | 확인할 값 | 전제 |
|---|---|---|
| HTTP/TCP Synthetic | 성공률, 응답 시간, 인증서 만료 | 대상 URL/포트 등록 |
| CloudWatch Application Signals | latency, fault, error, dependency, SLO | ADOT/OpenTelemetry 및 CloudWatch Agent 계측 |
| Zabbix 연계 | 프로세스, 포트, 로그, 서비스 상태 | 대상 호스트와 AWS 인스턴스 매핑 |

권장: 2차에서 `애플리케이션 상태`를 별도 메뉴로 만들고, Synthetic 또는 Zabbix 헬스체크를 먼저 제공한다. Application Signals와 SLO는 계측 기반 기능이므로 온보딩 전에는 빈 대시보드 대신 계측 안내 화면을 보여 준다.

## 8. 후속 로드맵

| 단계 | 범위 | 완료 기준 |
|---|---|---|
| 1차 | 개요, 위험 리소스, EC2 상태/CPU/Network 추이, CloudWatch Alarm | 온콜이 한 화면에서 장애 대상과 사유를 찾음 |
| 2차 | Synthetic/Zabbix 기반 앱 상태, ALB/NLB, NAT Gateway, Subnet | VM 건강과 서비스 건강을 구분해 판단 |
| 3차 | EBS/RDS/ECS/EKS, Auto Scaling, 변경 이벤트 | 주요 AWS 리소스의 용량·가용성 관제 |
| 4차 | Cost Explorer/Budgets, Security Hub/CloudTrail | 비용·보안 거버넌스 |

## 9. Claude 작업 지시

### 지금 바로 해도 되는 FE 작업

1. 기존 `EC2Dashboard`를 새 `CloudOverviewPage`로 대체하지 말고, 새 컴포넌트로 준비한다. BE 계약이 합의되기 전에는 mock 또는 기존 API를 억지로 조합하지 않는다.
2. 라우트와 메뉴의 첫 항목을 `개요`로 바꿀 준비를 한다. 단, 기존 EC2 Dashboard URL은 리다이렉트 또는 호환 화면으로 남긴다.
3. 위 5.1의 A~D를 기준으로 loading / empty / partial-failure 상태까지 포함한 UI 구조와 타입을 설계한다.
4. 위험 목록은 표 우선, 차트는 두 번째다. 예쁜 총계 카드만 먼저 구현하면 안 된다.
5. 권한은 `DmovePermissionsKey.AWS_RESOURCES`를 그대로 사용한다. 메뉴 숨김만으로 접근 제어를 대신하지 않는다.

### BE 담당자에게 요청할 계약 사항

- 위 `/cloud-infras/overview` API DTO와 오류/부분 실패 표현을 `_workspace/contract_cloud-monitoring-overview.md`에 확정한다.
- Alarm, CPU/Network 집계, 마지막 수집 시각을 제공할 수 있는지 AWS IAM 권한과 호출 비용을 먼저 확인한다.

## 10. 검증 기준

- `Status Check 1/2` 인스턴스는 위험 목록 최상단에 나타난다.
- CloudWatch metric 또는 CWAgent 메모리가 없을 때 값 `0`이 아닌 `미수집`으로 표시된다.
- AWS 리전 한 곳의 조회 실패가 다른 리전의 데이터를 지우지 않는다.
- 권한 없는 사용자는 메뉴, 주소 직접 진입, `/overview` API 모두 접근할 수 없다.
- `running` 인스턴스만으로 애플리케이션 정상이라는 성공 문구를 표시하지 않는다.

## 11. 참고 자료

- AWS Application Signals: https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-Application-Monitoring-Sections.html
- AWS Application Map: https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/ServiceMap.html
- AWS Service Level Objectives: https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-ServiceLevelObjectives.html
