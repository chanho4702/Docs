# AWS 상태 타임라인 계약 (Phase 1~3)

- status: implemented (BE+FE)
- baseline: 2026-08-24 · 설계: `devdesign_aws-status-timeline.md` · 과금 근거: `reference_aws-api-cost.md`
- 선행 계약 `contract_aws-zero-cost.md`의 **개정**: 금지 목록에서 `GetMetricStatistics`를 제외한다
  (프리티어 월 100만 內, 예산 가드 필수). `GetMetricData`·`GetMetricWidgetImage`·`GetInsightRuleReport`는 계속 금지.

## 수집 (BE 내부)

- `cloud_snapshot` 배치(기본 5분, V28): 리전 팬아웃 `DescribeInstances`+`DescribeInstanceStatus`+VPC 진단
  → `cloud_instance_snapshot`·`cloud_vpc_snapshot` 적재. 자격증명 미설정이면 "skipped: unconfigured"(실패 아님).
- `cloud_snapshot_cleanup` 배치(매일 01:00, `options.retentionDays` 기본 30): 보존 기간 밖 삭제. 라이선스 무관.
- 판정 규칙은 overview와 공유: `Ec2StatusRules`(severity) · `NetworkExposureScanner`(노출 진단).

## 신규 EP (모두 `cloudInfraMonitoring.awsResources.view` + 자격증명 게이트)

### `GET /cloud-infras/ec2/state-history?instanceId&region&from&to`
- 스냅샷 DB만 읽음(AWS 호출 0). from/to는 epoch seconds, 0/생략 시 최근 24h.
- `data`: `{ items: [{runAt(ISO), state, statusCheck, severity}], collection: {state:'ok', source:'snapshot', cloudWatchUsed:false} }`
- severity: `healthy|warning|critical|unobserved|stopped`.

### `GET /cloud-infras/ec2/metrics?instanceId&region&from&to`
- `GetMetricStatistics` 5콜(cpu·networkIn·networkOut·diskReadBytes·diskWriteBytes, AWS/EC2 Average). 🔴 2026-08-26 개정: 디스크 두 키의 원천 지표를 `DiskRead/WriteBytes`(인스턴스 스토어 전용 — EBS 전용 Nitro 인스턴스엔 데이터포인트 없음, 실측) → **`EBSReadBytes/EBSWriteBytes`**로 교체. 응답 키 이름(`diskReadBytes/diskWriteBytes`)은 그대로.
- `data`: `{ items: {cpu:[{time,value}],...5키 고정}, collection }`. 포인트는 **시간순 정렬 보장**(BE가 정렬).
- 🔴 **강등도 200이다**: `collection.state`:
  - `ok` — `periodSeconds`(300 배수 또는 3600 배수, ≤1440 포인트 보장)·`budget:{used,cap}` 포함
  - `unavailable` + `reason: CLOUDWATCH_ACCESS_DENIED`(권한 없음, 10분 재시도 억제) | `CLOUDWATCH_UNAVAILABLE`
  - `disabled` + `reason: BUDGET_EXHAUSTED`(월 상한 — env `CLOUD_METRICS_MONTHLY_CALL_CAP`… 정확히는
    `app.cloud.metrics-monthly-call-cap`, 기본 500,000 = 프리티어의 절반)
  - `disabled` + `reason: PAID_FEATURE_OFF` — 🔴 2026-08-26: 설정 `paidFeatures.fleetMetrics`가 **CloudWatch 전역 스위치**가 됐다. 꺼짐이면 상세 1건도 CW를 부르지 않는다(agent 소스는 무관). FE는 "설정에서 켜세요" 안내(`cloud_timeline.degraded_PAID_FEATURE_OFF`).
  - 강등 시 5개 series 키는 전부 빈 배열로 유지(FE는 키 존재로 분기하지 않는다).
- 예산 카운터: `cloud_api_budget`(V29, month 'yyyy-MM' 행) — 실제 나간 콜 수만큼 원자적 증가(실패 콜 포함).

### `GET /cloud-infras/vpcs/history?vpcId&region&from&to`
- 스냅샷 DB만 읽음. from/to 생략 시 최근 7일.
- `data`: `{ items: [{runAt, criticalCount, warningCount, subnetCount, instanceCount}],
  findingsFirstSeen: [finding + {firstSeenAt(ISO|null), seenFromStart(bool)}], collection }`
- `seenFromStart=true`는 "구간 첫 스냅샷부터 있었음" — 발생 시각으로 단정 금지(FE는 "이전부터"로 표기).

## 변경 EP

### `GET /cloud-infras/overview`
- `trends.instanceStates`가 채워짐: `[{time(ISO), healthy, warning, critical, unobserved, stopped}]`
  (스냅샷 회차별 집계, 조회 range를 따름). `cpuTop`/`networkTop`/`alarms`는 계속 빈 값(무과금 원칙).

## FE 소비 (moveseyee_fe)

- `InstanceTimeline`(신규, EC2 상세 편입): 상태 밴드(markArea) + CloudTrail write 이벤트 markLine +
  성능 3차트(CPU·네트워크·디스크, ECharts). 강등 시 성능 차트 대신 밴드 스트립 + 안내 Alert.
- `EC2Dashboard`: 플릿 상태 추이 스택 차트(`trends.instanceStates`).
- `VPCDetail`: 노출 진단 추이 step 차트 + 기존 진단 표에 "최초 발견" 컬럼.
- 서비스: `getEc2StateHistory`/`getEc2Metrics`/`getVpcHistory`, 쿼리키 `STATE_HISTORY`/`EC2_METRICS`/`VPC_HISTORY`.

## 개정 2 (2026-08-26) — 소스 매트릭스 (devdesign_ec2-monitoring-sources.md)

### `GET /cloud-infras/ec2/metrics` — 소스 선택
- 우선순위 `zabbix-agent(품질 확인) > cloudwatch > 없음`. `collection`에 추가:
  - `source: 'zabbix-agent' | 'cloudwatch'` — 항상 존재(ok일 때). FE는 배지로 노출.
  - `fallbackUsed: boolean` — agent 매칭됐으나 품질 미달(필수 지표 없음/30분 내 포인트 없음/Zabbix 장애)로 CW로 내려온 경우 true.
  - agent일 때: `matchBasis('IP_EXACT'|'INSTANCE_ID_EXACT')`, `zabbixHostid`, `zabbixHostName`, `observedAt`.
- `items` 키 셋 고정 6개: `cpu, memoryUsage, networkIn, networkOut, diskReadBytes, diskWriteBytes`.
  agent 소스는 `cpu`(CPU util %)·`memoryUsage`(메모리 pused %)만 채움(나머지 빈 배열), CW 소스는 `memoryUsage`가 빈 배열.
- 권한 거부 캐시는 리전 단위(`CLOUDWATCH_ACCESS_DENIED`가 다른 리전 조회를 막지 않음).

### `GET /cloud-infras/ec2s` — 커버리지 컬럼
- item에 `monitoredBy: 'zabbix-agent' | 'cloudwatch' | 'unavailable' | 'unmonitored'` 추가.
  판정: agent 매칭+LAST_CHECK 30분 내 → zabbix-agent / stopped → unmonitored / CW 가용(리전 미거부·예산 內) → cloudwatch / 그 외 unavailable. AWS 추가 호출 0.

### `GET /cloud-infras/overview` — 커버리지 집계
- `summary.monitoringCoverage: { 'zabbix-agent': n, cloudwatch: n, unavailable: n, unmonitored: n }` (4키 0-채움).

### 매칭 규칙(BE 내부, `Ec2ZabbixMatcher`)
- Zabbix 호스트는 시스템 컨텍스트로 조회·전역 5분 캐시(사용자 세션 미사용 — 권한 누출 방지).
- INSTANCE_ID_EXACT(호스트명 == instanceId 또는 태그 `aws.instanceId`) > IP_EXACT(ENI 전체 주소 ↔ AGENT 인터페이스, 유일 히트만). 다중 히트·중복 주장은 연결하지 않음. Name 태그 매칭 없음.
- 🔴 온보딩 권장: EC2의 Zabbix 호스트에 태그 `aws.instanceId=<instanceId>`를 붙이면 IP 변동과 무관하게 확정 연결된다.
- (개정 2 보강, 코덱스 검수 반영) 엔진 모델 `HostNetworkInterface.useIp`(Boolean, 기존 생성자 보존) — Zabbix `useip`. 매처는 `useIp==false`(DNS 접속) 인터페이스를 IP 근거에서 제외한다. 매칭 캐시는 조회 실패 시 fail-closed(폐기). CW 예산은 `cloud_api_budget`에 **조건부 원자 예약**(`reserve`)으로 선점 후 호출, 미사용분 반납.
- (개정 2 보강 2) IP_EXACT는 **양방향 유일성**(인스턴스→호스트 1, 호스트 주소→EC2 1)을 스냅샷 배치의 EC2 주소 역색인으로 판정한다. 역색인은 **전 리전 수집 성공 시에만 갱신**되며 부분 실패·재기동 직후엔 콜드(IP 근거 비활성). `/ec2/metrics collection.ipMatchIndexReady`로 상태 노출. 🔴 확정 연결은 Zabbix 호스트 태그 `aws.instanceId` — **필수 권장**(IP 창·콜드와 무관).
- (개정 3, 2026-08-28) `/ec2/metrics` items 키 셋 **7개**: `cpu, memoryUsage, diskUsage, networkIn, networkOut, diskReadBytes, diskWriteBytes`. `diskUsage`는 agent 소스 + 루트 파티션(`/` → `C:` 순) 있을 때만 채움(품질 게이트 대상 아님). agent freshness 허용치는 `app.cloud.agent-freshness-minutes`(env `CLOUD_AGENT_FRESHNESS_MINUTES`, 기본 30) — 커버리지·시계열 게이트 공용.
- (contract_aws-zero-cost 개정) CE `GetCostAndUsage`는 `nextPageToken`을 따라가며 최대 5페이지(페이지마다 요청 1건=$0.01). 예산엔 실제 페이지 수 기록, 상한 도달 시 run 요약에 `TRUNCATED`.
