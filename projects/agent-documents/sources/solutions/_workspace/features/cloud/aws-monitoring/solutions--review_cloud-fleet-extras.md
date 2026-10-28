# 검수 요청 — 플릿 지표 확장(목록·VPC·상세·홈위젯·디스크·스파크·알람·낭비) (2026-08-26)

> 검수자: Codex. **1라운드만** 받는다(사용자 합의). 설계 정본 `_workspace/features/cloud/aws-monitoring/devdesign_cloud-fleet-extras.md`, 계약 `_workspace/features/cloud/aws-monitoring/contract_cloud-monitoring-overview.md` §"목록·상세로의 확장". 선행 작업(P3 플릿 지표 토글)은 커밋됨 — 이번 diff는 그 위에 얹는다.

## 범위 (미커밋 변경)

### BE `moveseye-be-spring` (브랜치 ZM-79)
| 파일 | 변경 |
|---|---|
| `aws/AwsServiceImpl.java` | 5지표(CPU/NetIn/NetOut/DiskRead/DiskWrite) 팬아웃 + `DescribeAlarms` 리전당 1콜, `InstanceMetrics`(cpuSeries 포함)·`FleetMetrics.byInstance/alarmState/alarms`, `instanceMetricsView`/`vpcFleetView`/`fleetComparison` 뷰, `overviewForRegion`의 severity 재판정(CPU≥80 → warning `CPU_HIGH`, 알람 ALARM→critical·INSUFFICIENT_DATA→warning, **상향만** `severityRank`), 목록/VPC/상세 응답에 `metrics`/`fleetMetrics`/`fleetComparison` 필드, overview `alarms`(≤50)·`activeAlarms` |
| `aws/client/AwsReadOnlyGateway.java` | `describeAlarms(region)` 신설(maxRecords 100) |
| `aws/FleetMetricsCache.java` | TTL 10→15분 |
| `home/HomeWidgetType.java` | `CLOUD_FLEET("cloud_fleet", pinned=false, unique=true, adminOnly=false, 6×8)` — 기본 세트 제외 |
| 테스트 | `AwsServiceImplFleetExtrasTest`(신규 6), `AwsServiceImplFleetMetricsTest`(콜 수 갱신), `HomeWidgetCatalogTest`(18종) |

⚠️ 같은 작업 트리에 **다른 세션의 미커밋 변경**이 섞여 있다(`build.gradle.kts`, `cost/CostService`, `host/hostinterface/InterfaceService`, `V13`/`V17` 마이그레이션, `LicenseContractTest`). 이번 검수 대상 아님 — 커밋도 분리한다.

### FE `moveseyee_fe` (master)
| 파일 | 변경 |
|---|---|
| `types/cloud-infra.ts` | `TFleetState`·`TFleetInstanceMetrics`, `TVpc.fleetMetrics?`, `TEc2.metrics?`, `TEc2OperationalDetail.fleetComparison?` |
| `components/Sparkline/Sparkline.tsx` | 신규 공용 SVG 스파크라인(ECharts 아님 — 목록 20행에 canvas 20개 방지) |
| `aws-resources/EC2InstanceList.tsx` | 컬럼 3개(CPU+스파크·네트워크 ↓↑·디스크 R/W) + `renderFleetState`(꺼짐/중지/데이터 없음/강등 문구) |
| `aws-resources/VPCGroupList.tsx` | 평균 CPU(실행 수) 컬럼 |
| `aws-resources/EC2OperationalDetail.tsx` | "리전 평균 대비" Alert(ok) / NOT_CACHED 안내 |
| `aws-resources/EC2Dashboard.tsx` | 낭비 진단 카드(`/cost-estimate` 재사용, 상위 5) |
| `pages/home/widgets/cloud/CloudFleetWidget.tsx` + `registry.tsx` + `constants/homeWidgets.ts` + `types/home.ts` | 홈 위젯 `cloud_fleet` |
| `locales/kr.json`·`en.json`, `setting/CloudInfraInfo.tsx` | 플릿/낭비/알람/위젯 문구, 비용 안내를 5지표·15분·29만으로 갱신 |
| 테스트 | `CloudFleetWidget.test.tsx`(신규 5: 옵트인 꺼짐 안내·CPU 상위/알람/낭비 태그·개요 없음·스파크 2점/1점), `homeWidgetRegistry.test.tsx`(cloud_fleet 카탈로그) |

## 의도 (원칙)
1. **값이 없으면 상태 객체로 답한다** — `{state, reason}`을 목록·VPC·상세 모두에 싣고 FE는 0으로 꾸미지 않는다(꺼짐은 "켜세요", 중지/데이터 없음/강등은 짧은 문구).
2. **추가 팬아웃 없음** — 목록·VPC는 개요와 같은 리전 캐시(1h 창)를 읽고 미스일 때만 개요와 같은 규칙으로 호출. 상세는 **캐시만** 읽는다(1건 때문에 리전 전체를 부르지 않음 → `NOT_CACHED`).
3. **예산** — 인스턴스당 3→5콜 + 리전당 알람 1콜. TTL 10→15분으로 늘려 최악 (20×5+1)×96×30 ≈ 29만/리전/월, 플릿 몫 35만 안(1리전). 2리전이면 소진 → `BUDGET_EXHAUSTED` 강등이 설계된 동작.
4. **알람은 지표와 독립** — DescribeAlarms 실패가 지표를 죽이지 않고(`CLOUDWATCH_ALARMS_UNAVAILABLE`), 옵트인 꺼짐이면 종전대로 `ZERO_COST_MODE`.
5. **재판정은 상향만** — 스냅샷 판정(`Ec2StatusRules`)은 건드리지 않고 플릿 결과로 critical/warning으로만 끌어올린다.

## 🔴 불안한 지점 (여기를 봐 달라)
1. **`instanceMetricsView`의 사유 분기** (`AwsServiceImpl` ~495행): 리전 상태가 `partial/FLEET_CAP`인데 해당 인스턴스는 상한 안에 들었으나 데이터포인트가 없는 경우 → `FLEET_CAP`으로 표시된다(정확히는 NO_DATAPOINTS). 상한 대상 집합을 뷰에 안 넘겨서 생긴 근사. 사용자에게 오안내인지 판단 부탁.
2. ~~`vpcFleetView`의 runningInstances~~ → 자체 확인: `vpcsForRegion`은 리전 전체 `instances`를 넘기고 뷰 안에서 vpcId로 거른다. 문제 없음.
3. ~~severity 재판정 후 카운트~~ → 자체 확인: `switch (severity)` 집계가 재판정(441행) **뒤**에 온다. 문제 없음.
4. **캐시 키 1h 고정**: 목록·VPC·상세는 `DEFAULT_FLEET_RANGE="1h"`로만 읽는다. 개요를 `24h`로만 열어 둔 사용자는 목록에서 캐시 미스 → 1h 팬아웃이 한 번 더 난다(예산 2배 소모 가능). 허용 범위인지 의견.
5. **FE `EC2InstanceList` 정렬**: `fleet_cpu` sorter가 값 없음을 -1로 두어 맨 아래로 보낸다 — DmoveTable이 서버 정렬을 쓰는 경로가 있으면 이 sorter는 무시될 수 있다(클라이언트 정렬만 전제).
6. **홈 위젯 `fleetOff` 판정**: `regions.every(r => r.cloudWatch.reason === "PAID_FEATURE_OFF")` — 리전이 0개(자격증명 없음)면 false라 "no_metric_data"가 뜬다. 자격증명 미설정 안내가 더 맞는지.
7. ~~낭비 카드 i18n~~ → 자체 확인: `cloud_estimate.waste_{UNATTACHED_EBS,UNUSED_EIP,STOPPED_INSTANCE_EBS}` kr/en 모두 존재.

## 검증 / 미검증
- ✅ BE `gradle :test --tests aws.*/home.*/setting.*` green (앱 모듈; `engine-zabbix`엔 해당 테스트 없어 `:test`로 한정해야 함).
- ✅ FE `tsc --noEmit` / eslint(변경 파일) / jest(홈 레지스트리 7·CloudFleetWidget 5·cloud 관련 42) green.
- ✅ BE 전체 `gradle :test` green. FE 전체 jest 1304/1306 — 실패 2건(`TriggerFormDrawer` 토스트·`AiAssistantPage` URL 미러링)은 이번 변경과 무관한 파일이며 waitFor 타임아웃(전체 실행 부하) 양상. 단독 재실행에서도 실패해 **선재 결함/불안정 테스트**로 보인다 — 별도 확인 필요.
- ✅ **실서버(:3000, dev 프로필·Flyway off) 확인 — 커밋 `3a33131` 후 2026-08-26**: 17리전 cloudWatch=ok·alarms=ok(DescribeAlarms 실응답, 활성 알람 0), overview 1h 첫 호출 9.9s → 캐시 적중 2.5s, ec2s `metrics` ok(cpu 1.16%·in 4.18 B/s·out 3.30 B/s·cpuSeries 12점·rangeLabel 1h), vpcs `fleetMetrics`(실행 1대 vpc는 값, 0대 vpc는 cpuAverage null), ec2/detail `fleetComparison` ok(캐시 적중, 0.8s), cost-estimate waste 0건.
  - ⚠️ **발견: `diskRead/WriteBytesPerSecond`가 null** — 실 인스턴스(ec2-tokyo)는 EBS 전용이라 `DiskReadBytes/DiskWriteBytes`(인스턴스 스토어 지표)에 데이터포인트가 없다. Nitro 인스턴스의 EBS I/O는 `EBSReadBytes/EBSWriteBytes`(같은 AWS/EC2 네임스페이스)로 나온다. 기존 상세 시계열(`CloudMetricsService`)도 같은 지표라 선재 제약. null로 정직하게 표시되므로 계약 위반은 아니나, 대부분 고객이 EBS 전용이라 지표 교체를 제안 → **사용자 승인으로 `EBSReadBytes/EBSWriteBytes`로 교체**(플릿 + 상세 시계열 `CloudMetricsService` 둘 다, 응답 키 이름 유지, 추가 콜 0). 재기동 후 실측: 플릿 disk W 35,090 B/s(R 0.0 = 실제 0), `ec2/metrics` diskRead/Write 각 12점. aws 테스트 green.
- ❌ 브라우저 렌더 미확인(Chrome MCP가 localhost를 에러 페이지로만 띄움) — 컬럼 폭·스파크라인 시각은 사용자 확인 필요.

## Codex 1라운드 결과 (2026-08-26) — 판정 "수정 후 커밋" → 전건 반영

| # | 지적 | 반영 |
|---|---|---|
| 🔴1 | `mean()`이 유효값 0개면 `0d`, 네트워크 한쪽 결측을 `0`으로 채워 `networkTop`에 넣음 — NO_DATAPOINTS 원칙 위반 | `mean()` → nullable `Double`(전부 null 통계도 결측), `rate()` 헬퍼, 다섯 지표 전부 null일 때만 NO_DATAPOINTS, **networkTop은 in/out 둘 다 있을 때만**(결측 쪽은 byInstance에 null) |
| 🔴2 | 불안 지점 1 = 실제 결함: FLEET_CAP 리전에서 상한 안 수집·값 없음 인스턴스도 FLEET_CAP으로 표시 | `FleetMetrics.targetIds`(상한 안 조회 집합) 보존 → `instanceMetricsView`가 target이면 NO_DATAPOINTS, 아니면 FLEET_CAP. 리전 사유 근사 제거 |
| 🔴3 | VPC 컬럼이 BUDGET_EXHAUSTED·FLEET_CAP 등도 전부 "no data"로 렌더 | `state==="ok"`/NO_DATAPOINTS/실행 0대만 "no data", 그 외는 `fleet_degraded` + 사유 툴팁 |
| 🔴4 | `wasteMonthlyUsd: null`을 `$0.00`으로 표시(개요 카드·홈 위젯) | null → `-` (요금표 미조회를 낭비 0으로 꾸미지 않음), 위젯 테스트 추가 |
| 🟡 | 정렬에서 결측을 -1/0으로 대입 | `compareNullLast`(EC2 CPU·네트워크, VPC CPU), 네트워크 합계는 둘 다 결측이면 null |
| 🟡 | 테스트 보강(일부 지표 결측·cap 리전 NO_DATAPOINTS·예외 시 release) | `partiallyMissingMetricsStayNull`·`cappedRegionDistinguishesNoDataFromCap` 추가(예외 시 release는 기존 `AwsServiceImplFleetMetricsTest`가 커버) |
| 🟡 | 1h 고정 캐시 → 개요를 6h/24h로 본 뒤 목록 열면 1h 팬아웃 1회 추가 | 의도된 비용으로 계약서에 명시(목록·VPC "1h 창 고정") |

재검증: BE `:test --tests aws.*` green(extras 8), FE tsc·eslint green, jest cloud/home 31 green.

## 후속 (2026-08-26) — CloudWatch 스위치 전역화 (사용자 지적 → A안 채택)
- 지적: 설정 2개 다 껐는데 EC2 목록 배지가 "CloudWatch". 원인: `monitoredBy()`가 CW 가용성(권한·예산)만 보고 스위치를 안 봤고, 상세 시계열(`CloudMetricsService`)도 스위치 무관하게 GetMetricStatistics를 불렀다(계약서에 ⚠️로 적혀 있던 "의도된" 불일치).
- 변경: `paidFeatures.fleetMetrics` = **CloudWatch 호출 전체의 전역 스위치**. BE `monitoredBy` 우선순위에 `cloudwatch-off`(5번째 값) 삽입(agent 뒤·CW 앞), `overview.summary.monitoringCoverage`에 키 추가, `CloudMetricsService.cloudWatchSeries` 첫 줄에서 `disabled/PAID_FEATURE_OFF` 강등(agent 경로 무관). FE `TMonitoringSource`·색 매핑·커버리지 카드·i18n(`cloud_coverage.cloudwatch-off`, `cloud_timeline.degraded_PAID_FEATURE_OFF`), 설정 명칭 "플릿 지표 확장" → **"CloudWatch 지표 수집"** + 설명 전면 교체(3지표 stale 문구도 정리), `cloudwatch_paid_off_notice`·`fleet_off*` 문구 정합.
- 테스트: `AwsServiceImplCoverageTest.switchOffBeatsCloudWatchAvailability`, `CloudMetricsServiceTest.switchOffSkipsCloudWatchButKeepsAgent` 추가. BE aws green, FE tsc·eslint·jest(cloud 24) green.
- 문서: contract overview(⚠️ → 🔴 개정), contract timeline(PAID_FEATURE_OFF 사유), devdesign_cloud-cost-optin D6, devdesign_ec2-monitoring-sources 5값.
- ✅ 실서버(:3001 검증 인스턴스, :3000은 사용자 인스턴스라 미접촉) OFF→ON→원복: OFF = 목록 `monitoredBy=cloudwatch-off`·`metrics disabled/PAID_FEATURE_OFF`, 커버리지 `cloudwatch-off:1`, 17리전 `cloudWatch=disabled/PAID_FEATURE_OFF`, `ec2/metrics disabled/PAID_FEATURE_OFF`(전 series 0점, 호출 0.3s = CW 미호출) / ON = `cloudwatch`·ok·시계열 12점. 설정은 원래값(둘 다 OFF)으로 복원.

## 커밋 계획 (승인 후)
- BE: `#ZM-79 [FEAT] 플릿 지표 확장 — 5지표·알람·목록/VPC/상세 뷰·홈위젯 타입 -2026-08-26` (위 표의 BE 파일만 선별 스테이징)
- FE: `#ZM-79 [FEAT] 플릿 지표를 목록·VPC·상세·홈위젯에 표시 + 낭비 카드 -2026-08-26`
