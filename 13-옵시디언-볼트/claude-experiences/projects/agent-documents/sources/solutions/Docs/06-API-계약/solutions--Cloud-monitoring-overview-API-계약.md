# Cloud monitoring overview API 계약

## GET `/cloud-infras/overview`

권한은 `cloudInfraMonitoring.awsResources.view`이다. `ADMIN`, `SUPER_ADMIN`은 기존 권한 검사 규칙에 따라 허용한다. 미허용 시 기존 계약대로 HTTP 200, body `code: 403`이다. AWS 자격증명이 없으면 `CLOUD_NOT_CONFIGURED` 오류를 반환한다.

### Query

| 이름 | 규칙 |
|---|---|
| `regions` | 쉼표로 분리한 AWS region. 생략 시 접근 가능한 전체 region, 최대 20개 |
| `range` | 생략 또는 `1h`, `6h`, `24h`, `7d`; 기본 `1h` |
| `from`, `to` | UTC ISO-8601 쌍. `range`와 배타, 둘 중 하나만 전송 불가, 최대 7일 |

잘못된 query는 HTTP 200 + `code: 400`, `errorCode: INVALID_QUERY`다. CloudWatch period는 서버가 `1h=60`, `6h=300`, `24h=900`, `7d=3600`초로 선택한다.

### 성공 payload (`data`)

```ts
type CloudOverview = {
  summary: { totalInstances: number; healthyInstances: number; warningInstances: number;
    criticalInstances: number; unobservedInstances: number; stoppedInstances: number;
    activeAlarms: number; lastCollectedAt: string; };
  collection: { regions: Array<{ region: string;
    ec2: CollectionState; cloudWatch: CollectionState; alarms: CollectionState; }>; };
  riskResources: Array<{ instanceId: string; instanceName: string; region: string;
    availabilityZone: string | null; state: string | null; statusCheck: string | null;
    cpuAverage: number | null; memoryAverage: null; alarmState: string | null;
    severity: 'critical' | 'warning' | 'unobserved' | 'stopped'; reasons: string[]; }>;
  trends: { instanceStates: []; cpuTop: CpuTop[]; networkTop: NetworkTop[]; };
  alarms: Alarm[];
};
// 2026-08-26(P3): 'disabled' 추가 — 실패가 아니라 "의도적 미수집". reason 열거값은 §수집과 실패 규칙 참조.
type CollectionState = { state: 'ok' | 'partial' | 'unavailable' | 'disabled'; lastCollectedAt: string | null; reason: CollectionReason | null };
type CollectionReason =
  | 'EC2_UNAVAILABLE'            // ec2: 리전 EC2 조회 실패 (unavailable)
  | 'PAID_FEATURE_OFF'           // cloudWatch: 플릿 지표 옵트인 꺼짐 (disabled) — 설정에서 켤 수 있음
  | 'ZERO_COST_MODE'             // alarms: 정책상 수집하지 않음 (disabled) — Zabbix 트리거가 대체
  | 'BUDGET_EXHAUSTED'           // cloudWatch: 월 호출 예산(플릿 몫) 소진 (disabled) — 다음 달 자동 재개
  | 'CLOUDWATCH_ACCESS_DENIED'   // cloudWatch: 권한 거부 (unavailable) — 리전 단위 10분 캐시
  | 'CLOUDWATCH_UNAVAILABLE'     // cloudWatch: 그 밖의 서비스/전송 오류 (unavailable)
  | 'FLEET_CAP'                  // cloudWatch: 리전당 20대 상한 초과분 미수집 (partial) — 실패 아님
  | 'NO_DATAPOINTS'              // cloudWatch: 데이터포인트 없는 인스턴스를 상위 목록에서 제외 (partial) — 실패 아님
  // 2026-08-26(확장): 아래 셋은 리전 collection이 아니라 인스턴스/VPC/상세 단위 FleetState에서만 나온다.
  | 'CLOUDWATCH_ALARMS_UNAVAILABLE' // alarms: DescribeAlarms 실패 (unavailable) — 지표 수집과 독립
  | 'INSTANCE_NOT_RUNNING'       // metrics: 중지/종료 인스턴스라 지표 없음 (disabled)
  | 'NOT_CACHED';                // fleetComparison: 리전 캐시에 없음 (unavailable) — 개요/목록을 먼저 열면 채워짐
type CpuTop = { instanceId: string; instanceName: string; region: string; average: number; unit: 'percent' };
type NetworkTop = { instanceId: string; instanceName: string; region: string; inBytesPerSecond: number; outBytesPerSecond: number; totalBytesPerSecond: number };
type Alarm = { alarmArn: string | null; name: string; region: string; state: 'ALARM' | 'INSUFFICIENT_DATA'; stateUpdatedAt: string | null; resourceId: string | null; reason: string | null };
```

`instanceStates` 시계열은 AWS EC2 API가 과거 상태 이력을 제공하지 않아 1차에는 빈 배열이다. FE는 이를 “미수집”으로 표현하고 0 데이터/정상 차트로 대체하지 않는다.

## 수집과 실패 규칙

- EC2 상태/Status Check, Alarm, CPU/Network는 리전 단위로 독립 수집한다. 한 리전 오류가 다른 리전을 지우지 않는다.
- 실패 또는 지표 부재를 `0`, `healthy`로 변환하지 않는다. `collection.regions[].*.state/reason`으로 표시한다.
- CPU/Network(`cpuTop`/`networkTop`)는 **플릿 지표 옵트인(`paidFeatures.fleetMetrics`)이 켜진 경우에만** 수집한다(2026-08-26 P3). 꺼짐이면 `cloudWatch=disabled/PAID_FEATURE_OFF`, 두 배열은 빈 배열.
  - 호출은 `GetMetricData`(첫 콜부터 과금, 게이트웨이 미허용)가 아니라 **`GetMetricStatistics`**(프리티어 월 100만) — 실행 중 인스턴스당 **5콜**(CPUUtilization Average · NetworkIn/Out · **EBSReadBytes/EBSWriteBytes** **Sum**, bytes/sec = Sum/period — 🔴 `DiskRead/WriteBytes`는 인스턴스 스토어 지표라 EBS 전용(Nitro) 인스턴스엔 데이터포인트가 없다, 실서버 실측 2026-08-26) + 리전당 `DescribeAlarms` 1콜(2026-08-26 확장, 3콜→5콜).
  - 폭주 방지: 리전당 **20대** 상한(초과분 `partial/FLEET_CAP`) · 리전×시간창 **15분 캐시** · 월 예산(50만)의 **70%** 까지만 플릿이 예약(나머지는 상세 시계열 몫) → 소진 시 `disabled/BUDGET_EXHAUSTED`. 최악 (20×5+1)×96×30 ≈ **29만 콜/리전/월**.
  - 캐시 키: 기본 range(`1h/6h/24h/7d`)는 `region|label`(창이 밀려도 적중), **`custom`은 `region|custom|<from ISO>|<to ISO>`(Instant 전체 정밀도 — DTO가 소수초 입력을 허용)** — 다른 시간창의 결과를 되돌려 주지 않는다. `Setting(CLOUD)` 저장(자격증명·옵트인 변경) 시 캐시 전체 무효화 — **트랜잭션 커밋 뒤**(afterCommit)에 비운다(커밋 전에 비우면 그 틈의 요청이 이전 설정으로 stale 결과를 다시 캐시한다; 롤백이면 유지). 무효화는 **세대(generation)** 를 올리며, 조회는 AWS 호출 전에 세대를 캡처해 같은 세대일 때만 저장한다 — 저장 직전에 시작된 요청이 저장 뒤에 옛 결과를 다시 캐시하는 경쟁을 막는다. 캐시되는 것은 `ok`/`partial` 결과뿐(강등은 매번 재판정).
  - 데이터포인트가 없는 인스턴스는 상위 목록에서 **제외**하고 `partial/NO_DATAPOINTS`로 표시한다 — 0으로 꾸미지 않는다. 다섯 지표 중 **일부만** 결측이면 그 값만 `null`(통계값이 전부 null인 데이터포인트도 결측), `networkTop`은 in/out **둘 다** 있는 인스턴스만 싣는다(한쪽을 0으로 채우면 total이 거짓). 상한 리전에서 "값 없음"의 사유는 상한 안 조회 대상이면 `NO_DATAPOINTS`, 상한 밖이면 `FLEET_CAP`이다(리전 사유로 근사하지 않는다).
  - 🔴 **`partial` 중 `FLEET_CAP`·`NO_DATAPOINTS`는 실패가 아니라 제한 안내다.** FE는 `unavailable`(및 그 외 `partial`)만 "수집 실패"로 경고하고, `disabled`는 사유별 안내(info)로 렌더링한다. 여러 리전의 사유가 다르면 `BUDGET_EXHAUSTED > PAID_FEATURE_OFF > 그 외` 순으로 대표 안내를 고른다.
  - `alarms`(2026-08-26 확장): 옵트인이 **켜진** 리전은 `DescribeAlarms`(리전당 1콜, 프리티어) 결과 — `ALARM` → 인스턴스 `critical`, `INSUFFICIENT_DATA` → `warning`, 이유 `CLOUDWATCH_ALARM`. 조회 실패는 `unavailable/CLOUDWATCH_ALARMS_UNAVAILABLE`로 지표 수집과 **독립**(지표는 그대로 온다). 꺼진 리전은 종전대로 `disabled/ZERO_COST_MODE`. 개요 `alarms` 배열은 상태 ALARM·INSUFFICIENT_DATA만, 최대 50건.
  - 재판정은 **상향만** 허용한다(critical > warning > unobserved > stopped). CPU 평균 80% 이상은 `warning`+`CPU_HIGH` — 상태점검 미수집(`unobserved`) 인스턴스도 대상이다.
  - 🔴 **2026-08-26 개정(사용자 결정): `paidFeatures.fleetMetrics`는 CloudWatch 호출 전체의 전역 스위치다.** 꺼짐이면 개요/목록 팬아웃뿐 아니라 상세 시계열(`/ec2/metrics`)도 `disabled/PAID_FEATURE_OFF`(빈 series)이고, `monitoringCoverage`·목록 `monitoredBy`는 5번째 값 **`cloudwatch-off`**로 답한다(권한·예산이 멀쩡해도 `cloudwatch`라 하지 않는다 — 설정 화면 "무과금 모드"와 목록이 다른 말을 하던 문제). 우선순위: `unmonitored`(중지) > `zabbix-agent` > `cloudwatch-off` > `cloudwatch` > `unavailable`. Zabbix agent 경로는 스위치와 무관하게 동작한다.
- `critical`: Status Check 실패 또는 Alarm `ALARM`; `warning`: CPU 평균 80% 이상, `pending`, Alarm `INSUFFICIENT_DATA`; `unobserved`: Status Check 미수집; `stopped`: 별도 집계. 우선순위는 critical > warning > unobserved > stopped다.
- Memory는 1차 미수집(`null`)이다. CWAgent 없는 것을 인스턴스 비정상으로 판단하지 않는다.

## 목록·상세로의 확장 (2026-08-26, devdesign_cloud-fleet-extras)

같은 리전 캐시(1h 창)를 읽어 목록·VPC·상세에도 지표를 싣는다. 값이 없을 때는 **항상 상태 객체**로 답하고 0으로 채우지 않는다.

```ts
type FleetState = { state: 'ok' | 'partial' | 'unavailable' | 'disabled'; reason: CollectionReason | null };

// EC2 목록 items[].metrics — 옵트인 꺼짐 disabled/PAID_FEATURE_OFF, 중지 disabled/INSTANCE_NOT_RUNNING,
// 값 없음 partial/FLEET_CAP|NO_DATAPOINTS, 리전 강등은 그 리전의 state/reason 그대로. 값 필드는 state==='ok'일 때만 실린다.
type FleetInstanceMetrics = FleetState & {
  rangeLabel?: '1h';
  cpuAverage?: number | null; cpuSeries?: Array<[number, number]>;   // [epochSec, percent] — 스파크라인용
  inBytesPerSecond?: number | null; outBytesPerSecond?: number | null;
  diskReadBytesPerSecond?: number | null; diskWriteBytesPerSecond?: number | null;
};
// VPC 목록 items[].fleetMetrics — 소속 실행 인스턴스 수는 옵트인과 무관하게 항상, cpuAverage는 값 있는 인스턴스만 평균(없으면 null)
type VpcFleetMetrics = FleetState & { runningInstances: number; cpuAverage: number | null };
// EC2 운영 상세 fleetComparison — 캐시만 읽는다(AWS 호출 없음). 캐시 미스면 disabled/NOT_CACHED
type FleetComparison = FleetState & { rangeLabel?: '1h'; instanceCpu?: number | null; regionCpuAverage?: number | null; regionRunningCount?: number };
```

- 목록·VPC 응답은 **캐시 미스면 AWS를 호출**한다(개요와 같은 예산·상한 규칙, 1h 창 고정). 상세의 `fleetComparison`만 캐시 전용이라 미스면 `disabled/NOT_CACHED` — 개요/목록을 한 번 열면 TTL(15분) 안에 채워진다.
- 홈 위젯 `cloud_fleet`(기본 세트 제외·대시보드당 1개·6×8)은 개요(range=1h)와 `/cost-estimate`(EC2 API, 무료)를 그대로 쓴다.

## FE 요청사항

- envelope의 `data`를 `CloudOverview`로 언랩한다.
- `collection` 상태 배지/사유를 항상 렌더링한다. 빈 `cpuTop/networkTop`은 0 차트가 아니라 미수집/데이터 없음이다.
- 메뉴/route gate는 기존 `DmovePermissionsKey.AWS_RESOURCES`를 그대로 사용한다.
