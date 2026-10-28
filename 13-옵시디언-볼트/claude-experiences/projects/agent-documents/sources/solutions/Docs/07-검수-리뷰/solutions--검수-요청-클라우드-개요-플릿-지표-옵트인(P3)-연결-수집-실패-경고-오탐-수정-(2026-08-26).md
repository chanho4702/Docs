# 검수 요청: 클라우드 개요 — 플릿 지표 옵트인(P3) 연결 + "수집 실패" 경고 오탐 수정 (2026-08-26)

> BE `moveseye-be-spring`(브랜치 ZM-79) · FE `moveseyee_fe`(master) — **둘 다 미커밋**, 워킹트리에 병행 세션(커버리지 매트릭스)의 미커밋 변경이 같은 파일에 공존한다.
> 선행 설계: `devdesign_cloud-cost-optin.md` §2 P3 · §0 원칙 · D3(꺼짐=disabled 강등)

## 배경 (사용자가 겪은 증상)

설정 > 클라우드 인프라에서 유료 옵션(`costExplorer`·`fleetMetrics`)을 **모두 켰는데** EC2 개요에
"일부 리전 또는 CloudWatch 데이터 수집에 실패했습니다" 경고가 계속 떴고, 1차 수정 뒤엔 "무과금 모드라
수집하지 않습니다"라는 (설정과 모순되는) 안내가 떴다. 추적 결과 두 겹:

1. **FE 오탐**: 경고 조건이 `state ≠ "ok"`라 `disabled`(의도적 미수집)까지 실패로 판정 → 무과금이면 100% 상시 노출.
2. **BE 미연결**: `paidFeatures.fleetMetrics` 토글을 읽는 코드가 **0곳**. `AwsServiceImpl.overview()`가
   토글과 무관하게 `cloudWatch=disabled(ZERO_COST_MODE)`를 하드코딩 → 켜도 아무것도 안 바뀜(설계상 P3 미착수).

## 범위

### BE
| 파일 | 변경 |
|---|---|
| `aws/AwsServiceImpl.java` | `CloudPaidFeatures` 주입. `overview()`가 요청당 1회 `fleetMetricsEnabled()` 판독 → 리전 팬아웃에 전달. **꺼짐**: `cloudWatch=disabled/PAID_FEATURE_OFF`(D3 어휘 — 더 이상 ZERO_COST_MODE 아님), `alarms`는 정책상 항상 `disabled/ZERO_COST_MODE`. **켜짐**: 신규 `fleetMetrics()` — 실행 중 인스턴스(리전당 50대 상한)에 `GetMetricStatistics` 3지표(CPUUtilization·NetworkIn·NetworkOut) 팬아웃, `CloudWatchAvailability.reserve/release` 원자 예약, 권한 거부→`unavailable/CLOUDWATCH_ACCESS_DENIED`(리전 캐시), 예산→`disabled/BUDGET_EXHAUSTED`, 상한 초과→`partial/FLEET_CAP`. 결과로 `trends.cpuTop/networkTop`(상위 5) 채움 + 위험 리소스 행 `cpuAverage` 보강. `OverviewRegion` 레코드에 cpuTop/networkTop 추가 |
| `test/aws/AwsServiceImplFleetMetricsTest.java` (신규) | 꺼짐=PAID_FEATURE_OFF·CW 호출 0 / 켜짐=실행 중만 팬아웃(예약 6·release 0)·cpuTop 내림차순 / 예산 소진 / 403→거부 캐시+미사용 5건 반납 |
| `test/aws/AwsServiceImplCoverageTest.java` | 생성자 인자 추가(paidFeatures mock) |

### FE
| 파일 | 변경 |
|---|---|
| `types/cloud-infra.ts` | `TCloudCollectionState.state`에 `"disabled"` 추가 |
| `EC2Dashboard.tsx` | 경고 조건 = `unavailable` 또는 (`partial` && reason≠FLEET_CAP). 전 리전 cloudWatch disabled면 사유별 info 안내: `PAID_FEATURE_OFF`→"설정에서 켤 수 있음" / `BUDGET_EXHAUSTED`→예산 안내 / 그 외→무과금 안내. `FLEET_CAP`→상한 안내. 수집 상태 카드 태그 색에 disabled 추가 |
| `locales/kr,en.json` | `cloud_overview.cloudwatch_{disabled,paid_off,budget,fleet_cap}_notice` |
| `__tests__/EC2DashboardCollectionNotice.test.tsx` (신규) | 7건 |

## 의도 · 버린 대안

- **GetMetricData(설계 원안) 대신 GetMetricStatistics 팬아웃**: 게이트웨이가 CloudWatch에서 GetMetricStatistics만 허용(GetMetricData는 첫 콜부터 과금 — reference_aws-api-cost.md §3). 설계 P3에도 "규모 작으면 무료 GetMetricStatistics 팬아웃 폴백"이 명시. 프리티어(월 100만) 안에서 무료이고 기존 월 예산 가드(cap 50만)를 그대로 태운다 → 옵트인 토글 켜도 **실제 과금 0**에 가깝다(토글 이름이 "유료"인 것과 어긋나는 점은 아래 불안 #3).
- **알람은 미연결**: 설계 §0.4 "알람은 Zabbix 트리거로 무료 대체(만들지 않음)". `alarms`는 ZERO_COST_MODE 유지.
- **리전당 50대 상한**: 인스턴스 수천 대 계정에서 개요 1회가 수천 콜을 태우지 않게. 초과는 `partial/FLEET_CAP`로 **표시**한다(조용한 절단 금지 — 이벤트 이력 건의 교훈).
- cpuTop 정렬은 전 리전 합친 뒤 상위 5 — 리전별 상위가 아니라 계정 전체 상위.

## 중점 확인 요청 (불안한 지점)

1. 🔴 **개요 1회의 CW 콜 수**: 실행 중 N대 × 3 = 최대 리전당 150콜, 리전 팬아웃(예: 5리전)이면 750콜/조회. FE가 10분 폴링(`TEN_MINUTES`)이라 월 ≈ 750×144×30 ≈ 3.2M — **프리티어 100만·예산 50만을 넘는다**. 예약이 막아 주긴 하지만(BUDGET_EXHAUSTED 강등) 그 뒤엔 상세 시계열까지 같이 죽는다(같은 예산). 캐시(리전·창 단위 5분 TTL)나 폴링 주기 분리가 필요한지 판단 요청. 사용자 계정은 소규모(≤10대)라 당장은 문제없음.
2. 🟡 `NetworkIn/Out` bytes/sec 환산: Average(period당 바이트)/period — CloudWatch 문서상 NetworkIn은 period 동안의 합계 바이트이고 Statistic.AVERAGE는 "데이터포인트 평균"이라 5분 기본 모니터링에서 period=300이면 맞지만, period가 300 배수로 확대될 때(긴 창) 평균×period 관계가 정확한지.
3. 🟡 토글 문구가 "유료 옵션"인데 실제 호출은 프리티어 GetMetricStatistics — 고지 Modal의 예상 비용 계산기(설정 화면)가 GetMetricData 단가($0.01/1,000지표)로 계산하고 있다면 과대 고지. 설정 화면 쪽은 이번 범위 밖.
4. 🟡 `overviewForRegion`이 `monitoredBy()`(커버리지, 병행 세션 작업)와 `fleetMetrics()`를 같은 루프 안팎에서 수행 — 두 기능이 같은 파일에서 동시 편집 중이라 머지 충돌 가능. 로직 간섭은 없는지.
5. 🟢 `partial/FLEET_CAP`을 FE가 실패로 보지 않도록 `isFailure`에서 예외 — 계약서(contract_cloud-monitoring-overview.md)엔 `disabled`·`FLEET_CAP` 어휘가 없다 → 계약서 갱신 필요(FE 요청사항 아님, 계약 보강).

## 검증 현황

- ✅ BE: compileJava·compileTestJava, `AwsServiceImplFleetMetricsTest` 4/4 + `AwsServiceImplCoverageTest` 3/3. **전 모듈 테스트 1376/1376 green**(병행 세션 미커밋분 포함)
- ✅ FE: tsc, eslint(0 warnings), `EC2DashboardCollectionNotice` 7/7, kr/en JSON 유효
- ❌ **실 AWS 런타임 미검증** — dev BE(:3000)는 사용자 요청으로 내려둔 상태. 토글 ON에서 실제 cpuTop이 채워지는지, 403/예산 강등이 실제로 어떻게 보이는지 미실측
- ❌ 브라우저 렌더 미확인(Chrome 확장 localhost 문제 지속)

## 검수 결과

### 판정

1. 🔴 **#1 개요 1회 콜 수·공유 예산 폭주 — 수정 필요**
   - 상한 상태에서 개요 1회는 `50대 × 3지표 × 5리전 = 750콜`이다. FE는 `TEN_MINUTES`로 폴링하므로 화면을 계속 열어 두면 `750 × 144 × 30 = 3,240,000콜/월`이다([EC2Dashboard.tsx:36](../moveseyee_fe/src/pages/cloud-infra-monitoring/aws-resources/EC2Dashboard.tsx#L36), [AwsServiceImpl.java:443-452](../moveseye-be-spring/src/main/java/com/dmove/moveseye/aws/AwsServiceImpl.java#L443)).
   - `reserve()`는 DB 조건부 증가라 동시 요청 상한 우회는 막고([CloudWatchAvailability.java:75-79](../moveseye-be-spring/src/main/java/com/dmove/moveseye/aws/CloudWatchAvailability.java#L75)), 실제 AWS 요청 전에 예약해 50만 상한에서 멈춘다. 그러나 750콜/회 기준 약 **4.6일** 만에 50만에 도달한다. 이후 플릿은 `BUDGET_EXHAUSTED`가 되고, 같은 카운터를 쓰는 상세 시계열(5콜 예약)도 월말까지 함께 불능이다.
   - 현재 리전·기간 키 캐시/TTL은 없고, 10분 폴링과 5분 기본 지표 주기도 맞지 않는다. 최소 5분(권장: 리전+시간창 단위) 캐시 또는 플릿 전용 더 긴 refresh/명시 새로고침으로 먼저 제한해야 한다. 소규모가 **계정 전체 10대**면 약 129,600콜/월이지만, 리전마다 10대면 648,000콜/월로 역시 cap을 넘는다.

2. 🔴 **#2 NetworkIn/NetworkOut bytes/sec 환산 — 장기 구간 값이 과소 계산됨**
   - 구현은 두 네트워크 지표를 `Statistic.AVERAGE`로 받고 결과 평균을 다시 `period`로 나눈다([AwsServiceImpl.java:467-493](../moveseye-be-spring/src/main/java/com/dmove/moveseye/aws/AwsServiceImpl.java#L467)). 1h~24h의 300초 기본 period에서는 EC2 기본 5분 데이터와 우연히 맞을 수 있으나, `resolvePeriodSeconds()`는 7d에서 600초 이상으로 확장한다. 이때 여러 5분 바이트 합계의 **Average / 600**은 실제 rate의 절반(더 긴 period면 그 비율만큼)이다.
   - 네트워크에는 `SUM / period`로 집계하거나, 기본 데이터 간격을 명시해 그 간격으로 정규화해야 한다. 7d/custom 구간 테스트가 없어 이 회귀를 잡지 못한다.

3. 🟡 **#3 ‘유료 옵션’ 고지 — 실제 실행과 불일치**
   - 토글 저장·판독·개요 연결은 정상이다. FE가 `fleetMetricsEnabled`를 명시 전송하고([CloudInfraInfo.tsx:136-143](../moveseyee_fe/src/pages/setting/CloudInfraInfo.tsx#L136)), BE가 `Setting(CLOUD).value.paidFeatures.fleetMetrics`로 저장([CloudInfraInfoDto.java:42-45](../moveseye-be-spring/src/main/java/com/dmove/moveseye/setting/dto/request/CloudInfraInfoDto.java#L42))·판독([CloudPaidFeatures.java:33](../moveseye-be-spring/src/main/java/com/dmove/moveseye/aws/CloudPaidFeatures.java#L33))하여 요청당 한 번 overview에 전달한다([AwsServiceImpl.java:335-340](../moveseye-be-spring/src/main/java/com/dmove/moveseye/aws/AwsServiceImpl.java#L335)).
   - 반면 설정 UI는 아직 `GetMetricData`, ‘지표 5개 × 5분 수집’, `$0.01/1,000`이라는 비용 문구를 보인다([CloudInfraInfo.tsx:332-357](../moveseyee_fe/src/pages/setting/CloudInfraInfo.tsx#L332)). 실제 P3은 화면 조회 때 실행 인스턴스당 `GetMetricStatistics` 3콜이며 reference의 월 100만 API 요청 프리티어 근거와 다르다. 비용 고지 자체는 필요하지만, 호출 방식·산식·예상액을 실제 구현/예산 정책에 맞춰 정정해야 한다.

4. 🟡 **#4 병행 커버리지 변경 간섭 — 컴파일 결합은 맞지만 상태 의미가 충돌**
   - 생성자 보정과 `OverviewRegion` 확장으로 컴파일상 결합은 맞고, stopped는 `fleetMetrics()` 대상에서 제외된다([AwsServiceImpl.java:443-445](../moveseye-be-spring/src/main/java/com/dmove/moveseye/aws/AwsServiceImpl.java#L443)). 전 리전 결과를 합친 뒤 CPU/네트워크를 정렬하고 상위 5개를 취하는 것도 의도에 맞다([AwsServiceImpl.java:346-364](../moveseye-be-spring/src/main/java/com/dmove/moveseye/aws/AwsServiceImpl.java#L346)).
   - 그러나 `monitoredBy()`는 토글 상태를 받지 않고 CW deny/예산만 보고 `cloudwatch`를 부여한다([AwsServiceImpl.java:64-77](../moveseye-be-spring/src/main/java/com/dmove/moveseye/aws/AwsServiceImpl.java#L64)). 그래서 `fleetMetrics=false`여도 개요는 `cloudWatch=disabled/PAID_FEATURE_OFF`인데 커버리지는 `cloudwatch`로 집계된다. 또한 커버리지를 플릿 호출 **전**에 계산하므로 이번 요청의 첫 403/예산 소진도 즉시 반영되지 않는다([AwsServiceImpl.java:396-418](../moveseye-be-spring/src/main/java/com/dmove/moveseye/aws/AwsServiceImpl.java#L396)). 범위 밖 변경이지만 같은 응답에서 상반된 안내가 되므로 조정 또는 커버리지 노출 보류가 필요하다.

5. 🔴 **#5 collection 계약 — SSOT 갱신 필요**
   - FE는 `disabled`와 `FLEET_CAP`을 정상 안내로 처리하도록 맞췄다([EC2Dashboard.tsx:55-67](../moveseyee_fe/src/pages/cloud-infra-monitoring/aws-resources/EC2Dashboard.tsx#L55)). 그러나 계약서의 `CollectionState.state`는 아직 `ok | partial | unavailable`만 허용하고([contract_cloud-monitoring-overview.md:33](../06-API-%EA%B3%84%EC%95%BD/solutions--Cloud-monitoring-overview-API-%EA%B3%84%EC%95%BD.md#L33)), `PAID_FEATURE_OFF`·`BUDGET_EXHAUSTED`·`FLEET_CAP`의 의미/우선순위도 없다. 응답 계약 위반이므로 커밋 전 계약서에 state와 reason 열거값, `partial/FLEET_CAP`은 실패가 아닌 제한 안내라는 규칙을 추가해야 한다.

### 추가 발견

- 🔴 **전송/SDK 예외가 리전 전체를 응답에서 탈락시킨다.** `fleetMetrics()`는 `AwsServiceException`만 강등하고([AwsServiceImpl.java:473-481](../moveseye-be-spring/src/main/java/com/dmove/moveseye/aws/AwsServiceImpl.java#L473)), 연결 timeout 등의 `SdkClientException`은 밖으로 전파한다. 그러면 `runParallel()`이 해당 `OverviewRegion`을 `null`로 바꾸고([AwsServiceImpl.java:84-111](../moveseye-be-spring/src/main/java/com/dmove/moveseye/aws/AwsServiceImpl.java#L84)), collection·summary에서 리전 자체가 사라진다. 계약의 ‘한 리전 오류가 다른 리전을 막지 않음’은 지키지만, 실패 리전을 보존해 보여야 한다는 collection 계약은 깨진다. CW 전송 예외도 `unavailable/CLOUDWATCH_UNAVAILABLE`로 강등해야 한다.

- 🟡 **빈 datapoint를 0으로 표시한다.** `average()`가 빈 목록을 `0d`로 바꾸고([AwsServiceImpl.java:492-493](../moveseye-be-spring/src/main/java/com/dmove/moveseye/aws/AwsServiceImpl.java#L492)), collection은 `ok`가 된다. 기본 모니터링 지연·지표 미발행 때 ‘CPU/트래픽 0’이라는 허위 top 항목이 생긴다. datapoint 없음은 top에서 제외하거나 `partial`/명시적 no-data 상태로 표현해야 한다.

- 🟡 **모든 리전이 disabled일 때 첫 리전 사유만 안내한다.** `cloudWatchDisabledReason = collectionRegions[0]`([EC2Dashboard.tsx:60-66](../moveseyee_fe/src/pages/cloud-infra-monitoring/aws-resources/EC2Dashboard.tsx#L60))라 한 리전은 `PAID_FEATURE_OFF`, 다른 리전은 `BUDGET_EXHAUSTED`여도 첫 배열 순서에 따라 안내가 달라진다. reason 집합을 보고 예산 소진을 우선하거나 리전별 상태 카드에서 사유를 노출해야 한다. 이 조합의 FE 테스트도 없다.

- 🟢 **예약/반납의 AWS service-error 경로와 stopped 제외는 정합하다.** 호출 직전에 `calls`를 증가시키고 finally에서 `planned - calls`를 반납하므로 첫 403이면 실제 1콜만 남긴다([AwsServiceImpl.java:466-483](../moveseye-be-spring/src/main/java/com/dmove/moveseye/aws/AwsServiceImpl.java#L466)). 신규 단위 테스트도 이 경로·토글 off·예산 소진·실행 중만 3콜을 확인한다. 단, 위의 비-`AwsServiceException` 강등은 별도 보강이 필요하다.

종합: 수정 필요

## 반영 내역 (Claude, 2026-08-26 — 1차 검수 후)

- [x] **🔴 #1 콜 수·예산 폭주** — 세 겹으로 제한: ① 리전×시간창(label) **10분 캐시**(`fleetCache`, TTL=FE 폴링 주기 → 리전당 10분에 1회로 수렴, 성공/부분 결과만 캐시) ② 리전당 상한 **50→20대**(설계 P3의 "≤20대") ③ 플릿은 월 예산의 **70%까지만 예약**(`CloudWatchAvailability.reserve(calls, cap)` 오버로드 신설 — 상세 시계열 몫 30% 보존). 최악 20×3×144×30 ≈ **26만/리전/월**, 2리전이면 플릿 몫(35만) 도달 → 플릿만 BUDGET_EXHAUSTED, 상세는 살아 있음. 캐시 히트 테스트 추가.
- [x] **🔴 #2 네트워크 환산** — NetworkIn/Out을 `Statistic.SUM`으로 받고 `mean(sum)/period` = period 길이와 무관한 bytes/sec. 테스트: 300초 period·Sum 300,000 → 1,000 B/s, SUM 통계로 호출됐는지 verify.
- [x] **🔴 #5 계약서** — `contract_cloud-monitoring-overview.md`에 `disabled` 상태 + `CollectionReason` 8종 열거 + "partial 중 FLEET_CAP·NO_DATAPOINTS는 실패 아님" 규칙 + 사유 우선순위 + coverage.cloudwatch 의미 주석 추가. 기존 "GetMetricData 100개 배치" 문구는 실제 구현(GetMetricStatistics 20대·캐시·예산 몫)으로 교체.
- [x] **🔴 추가: SdkClientException 전파로 리전 탈락** — `catch (SdkException)` 추가 → `unavailable/CLOUDWATCH_UNAVAILABLE` 강등, 리전은 collection에 남는다. 테스트(connect timeout) 추가.
- [x] **🟡 추가: 빈 datapoint를 0으로** — 세 지표 모두 비면 상위 목록에서 제외하고 `partial/NO_DATAPOINTS`; CPU만 있으면 cpuTop만, 네트워크만 있으면 networkTop만. `average()`→`mean(points, statistic)`으로 바꾸고 호출부가 빈 목록을 먼저 거른다. FE는 NO_DATAPOINTS를 실패가 아닌 안내로.
- [x] **🟡 추가: 첫 리전 사유만 안내** — reason 집합으로 판정, 우선순위 `BUDGET_EXHAUSTED > PAID_FEATURE_OFF > 그 외`. 혼합 사유 테스트 추가.
- [x] **🟡 #3 설정 화면 고지 불일치** — `cloud_paid.fleet_metrics_desc/_cost`(kr/en + TSX 폴백)를 실제 구현으로 정정: GetMetricStatistics 3지표·프리티어 월 100만·상한 50만의 70%·20대·10분 캐시·최악 26만/리전/월. 도움말의 필요 권한도 `cloudwatch:GetMetricData`→`GetMetricStatistics`.
- [ ] **🟡 #4 coverage.cloudwatch vs 플릿 토글** — 의미가 다르다고 판단해 로직은 미변경: `monitoredBy`의 `cloudwatch`는 **상세 시계열 가용성**(권한·예산, 토글과 무관하게 동작하는 경로)이고 개요 `cloudWatch`는 **플릿 집계 상태**. 계약서에 이 차이를 명시했다(위 #5). "첫 403이 커버리지에 즉시 미반영"은 다음 폴링(10분)에서 거부 캐시로 반영 — 병행 세션 소유 코드라 손대지 않음.

검증: BE `AwsServiceImplFleetMetricsTest` 7/7 + `AwsServiceImplCoverageTest` 3/3 + `CloudMetricsServiceTest` 7/7, compileJava OK. FE tsc·eslint·JSON OK, `EC2DashboardCollectionNotice` **10/10**. BE 전 모듈 **1379/1379 green**(병행 세션 미커밋분 포함).

## 재검수 결과 (Codex)

1. **판정: 화수 제한은 닫혔으나, 캐시 정확성 보완 필요 (🔴).** `20대 × 3지표 × 144회/일 × 30일 = 259,200 calls/리전/월`이다. 동일 `range` 탭은 리전×label 10분 TTL에 수렴하므로 사용자·탭 수가 곱해지지 않는다. 다만 다음 초기 미스·동시 요청·다른 range label에서는 반복 팬아웃이 가능하다. 월 플릿 예산은 `500,000 × 0.7 = 350,000`이며 DB 조건부 예약이므로 실제 AWS 호출은 이 상한(호출 단위 60의 경우 최대 349,980)을 넘지 않는다.
   - 1리전·1 label은 259,200으로 70% 몫에 들어오지만, 2리전은 이론상 518,400이므로 약 20일 후 350,000을 소진하고 `BUDGET_EXHAUSTED`로 강등된다. 4개 range를 동시에 열면 더 빨리 상한에 닿는다. 즉, **예산 폭주는 차단됐지만 다중 리전에서 한 달 내내 플릿 제공이 보장되는 것은 아니다.**
   - 기본 range(`1h/6h/24h/7d`)는 매 요청의 실제 `from/to`가 이동해도 label이 같아 의도대로 적중한다. 그러나 custom 조회는 모두 label=`custom`이다. 동일 리전에서 서로 다른 custom `from/to`를 10분 안에 조회하면 첫 결과를 재사용하는 **잘못된 시간창 데이터**가 반환된다. custom의 정규화된 `from/to`를 키에 포함하거나 custom은 캐시하지 않아야 한다. 현 테스트에도 이 경계가 없다.
   - 캐시는 singleton `AwsServiceImpl`에 있고 자격증명·Cloud 설정 변경 시 무효화 경로가 없다. 동일 리전·label에서 AWS 계정이 바뀌면 최대 10분 동안 이전 계정의 CPU/네트워크 결과가 남는다. 현 설정이 전역 설정이므로 개별 사용자 테넌트 간 오염은 확인되지 않았지만, 자격증명 교체 시 오염은 실재한다. 설정 저장 시 cache clear(또는 credential/config version을 키에 포함)가 필요하다.

2. **판정: #2 환산 수정 적절 (🟢).** CPU는 `AVERAGE`의 평균, NetworkIn/Out은 `SUM`의 평균을 `period`로 나누므로 bytes/sec가 된다. 7d에서 `period=3,600`이어도 `mean(SUM) / 3600`은 정상적인 평균 전송률이다. `SUM 300,000 / 300 = 1,000 B/s` 단위 테스트도 있다.

3. **판정: SdkException 강등과 예약 반납 정합 (🟢).** 호출 시도 직전 `calls++` 후 `AwsServiceException`과 포괄 `SdkException`을 모두 강등하고 `finally`에서 `planned - calls`만큼 반납한다. 첫 호출 실패 시 6건 중 5건을 반납하고 시도된 1건은 보수적으로 남긴다. 전송 실패의 실제 전송 여부를 SDK 단계에서 확정할 수 없으므로 맞는 처리이며, 테스트도 해당 경로를 확인한다.

4. **판정: NO_DATAPOINTS 처리 적절, 동시 사유의 정보 손실은 잔존 (🟡).** CPU만 있으면 `cpuTop`만, 네트워크만 있으면 `networkTop`만 남기고 세 지표가 모두 비었을 때만 `NO_DATAPOINTS`로 제외한다. 0으로 위장하지 않고 FE도 info로 안내한다. `FLEET_CAP + NO_DATAPOINTS`에서 `FLEET_CAP` 우선은 상한 초과분이 전혀 수집되지 않는 더 큰 커버리지 결손이므로 합리적이다. 다만 단일 `reason` 때문에 두 번째 사유는 UI에 나타나지 않는다. 계약에 이 우선순위를 명시하거나 복수 reason 확장 여지는 있으나 커밋 차단 사유는 아니다.

5. **판정: #4 미반영 판단 타당 (🟢).** `summary.monitoringCoverage.cloudwatch`는 상세 시계열의 가용성(권한·예산)이고, 개요의 `collection.cloudWatch`는 fleet opt-in 실행 상태다. 계약서가 이 차이와 `PAID_FEATURE_OFF`와의 동시 반환 가능성을 명시하므로 병행 커버리지 로직을 바꾸지 않은 것은 적절하다.

6. **새 회귀·미비점.** custom 시간창 분리, Cloud 자격증명/설정 변경 후 cache invalidation, 동시 cache miss에서도 예산 상한을 넘지 않는 경계 테스트를 추가해야 한다. `fleetCache`는 만료 entry를 제거하지 않아 임의 리전 문자열이 장기간 누적될 수 있으나, 현재 query 상한 20개와 제공 region 범위에서는 우선순위가 낮다.

종합: 추가 수정 필요

## 2차 반영 내역 (Claude, 2026-08-26 — 재검수 후)

- [x] **🔴 custom 시간창 캐시 오염** — 캐시를 `FleetMetricsCache` 컴포넌트로 분리. 키 규칙: 기본 range(1h/6h/24h/7d)는 `region|label`(창이 밀려도 적중), **custom은 `region|custom|from|to`(초)** — 다른 창은 다른 키. `FleetMetricsCacheTest`(키 규칙·무효화 3건) + `customWindowsDoNotShareCache`(w1·w2·w1 → 팬아웃 2회=12콜) 추가.
- [x] **🔴 자격증명·설정 변경 후 무효화** — `SettingService.storageInfo`가 `SettingType.CLOUD` 저장 시 `fleetMetricsCache.invalidate()`(zabbixConnectionResolver.invalidateCache와 같은 패턴). `invalidationForcesRefetch` 테스트 추가. 전역 설정이라 사용자 간 오염은 없고 계정 교체 시 오염만 해소.
- [x] **만료 항목 누적** — `put()`마다 만료 항목 정리(custom 키가 창마다 달라 쌓이는 것 방지).
- [x] **1리전·1label 26만/월, 2리전 ≥ 플릿 몫(35만)** — 수치는 Codex 계산과 일치. 다중 리전 계정에서 월 내내 플릿이 보장되지 않는 것은 **의도된 강등**(상세 시계열 몫 보존이 우선, 예산 정책 D3). 설정 화면 고지에 "최악 약 26만/리전/월·상한 도달 시 자동 중단"으로 명시. 더 줄이려면 리전당 상한 하향 또는 TTL 연장 — 제품 결정 사항으로 남김.
- [ ] 동시 캐시 미스에서의 예산 초과 경계 테스트 — 예약이 DB 조건부 갱신이라 초과 자체는 불가(기존 `CloudApiBudgetRepository.reserve` 계약); 멀티스레드 테스트는 미작성(기존 `SchedulerLeaseServiceIT` 패턴으로 IT 승격 가능 — 후속).

검증: `AwsServiceImplFleetMetricsTest` 9/9 · `FleetMetricsCacheTest` 3/3 · `AwsServiceImplCoverageTest` 3/3 · `SettingServiceTest` 8/8. BE 전 모듈 **1384/1384 green**.

## 3차 재검수 결과 (Codex)

1. **판정: custom 시간창 오염은 부분적으로만 해소 — 추가 수정 필요 (🔴).** `CloudOverviewQueryDto.resolveTimeRange()`는 `Instant.parse()`를 쓰므로 `2026-08-26T00:00:00.100Z`처럼 소수초가 있는 ISO-8601 입력도 허용하고, 그 `Instant`를 그대로 `GetMetricStatistics`의 start/end에 전달한다. 그러나 `FleetMetricsCache.key()`는 `getEpochSecond()`만 사용한다. 따라서 동일 초 안에서 from 또는 to가 다른 두 custom 창은 서로 다른 요청인데 같은 키가 되어 다시 오염된다. 기본 4종 label 및 `custom` 리터럴 분기는 DTO의 생성 방식과 일치하지만, 초 단위 키는 충분하지 않다. `Instant` 전체(예: `toString()` 또는 epoch second+nano)를 키에 넣고 소수초 경계 테스트를 추가해야 한다.

2. **판정: CLOUD 저장 범위는 자격증명·옵트인 모두 덮지만, 무효화 시점에 경쟁 조건이 있다 (🔴).** `POST /settings/cloud-infra`는 자격증명과 `paidFeatures.fleetMetrics`를 함께 `SettingType.CLOUD`로 저장하므로 `storageInfo()`의 type 분기는 두 변경을 모두 덮는다. 롤백 때 커밋 전 캐시를 비워도 잘못된 값을 노출하지 않고 이후 이전 설정을 다시 조회할 뿐이어서 그 자체는 무해하다. 다만 `invalidate()`가 트랜잭션 **커밋 전** 실행된다. 그 뒤 커밋 전에 다른 overview 요청이 이전 DB 설정으로 팬아웃해 이전 계정 결과를 캐시에 `put()`하면, 커밋 후 재무효화가 없어 그 stale 결과가 TTL 동안 남는다. 무효화는 transaction `afterCommit`에 등록하고, 롤백 시에는 기존 캐시를 유지하도록 바꿔야 한다. 이 경쟁 경로의 테스트도 필요하다.

3. **판정: Bean 구성·순환 의존 없음 (🟢).** 새 의존은 `SettingService → FleetMetricsCache`뿐이고, `FleetMetricsCache`는 다른 Bean/Repository에 의존하지 않는다. AWS 쪽의 `CloudPaidFeatures → SettingRepository` 및 `CloudCredentialsResolver → SettingRepository`는 `SettingService`를 거치지 않으므로 Spring Bean cycle이 형성되지 않는다.

4. **판정: 남은 동시 미스·만료 정리 항목은 단독 커밋 차단 사유 아님 (🟡).** 동시 miss는 동일 결과를 중복 팬아웃할 수 있으나 `CloudApiBudgetRepository.reserve`의 조건부 예약이 예산 상한을 지키는 한 정확성/상한 위반은 아니다. 해당 IT는 후속 보강 대상으로 충분하다. `put()` 시 만료 entry를 정리하는 방식도 새 custom write가 이어지면 수렴하며, 유휴 상태에서 남는 TTL 지난 entry는 메모리 위생 문제일 뿐 현 범위의 차단 사유는 아니다.

5. **새 회귀 확인.** `ok`/`partial`만 캐시하고 강등 결과를 재판정하는 기존 의도는 유지됐다. 다만 1·2번은 각각 기존의 custom 오염 및 자격증명 변경 오염을 소수초/동시 요청 경계에서 재도입하므로, 현재의 정수 초 custom 테스트와 직접 `cache.invalidate()` 테스트만으로는 막히지 않는다. 로컬 재실행은 Gradle wrapper가 배포본 다운로드를 시도했으나 네트워크 권한 거부로 시작하지 못했다.

종합: 추가 수정 필요

## 3차 반영 내역 (Claude, 2026-08-26 — 3차 재검수 후)

- [x] **🔴 custom 키 소수초 충돌** — `FleetMetricsCache.key()`가 custom일 때 `Instant.toString()`(나노초까지)을 그대로 키에 넣는다(`region|custom|<from ISO>|<to ISO>`). `customWindowKeyKeepsSubSecondPrecision` 테스트(100ms 차이 → 다른 키·미적중) 추가.
- [x] **🔴 커밋 전 무효화 경쟁** — `SettingService.invalidateFleetCacheAfterCommit()`: 트랜잭션 동기화가 활성이면 `TransactionSynchronization.afterCommit`에 등록(롤백 시 미실행 → 기존 캐시 유지), 비활성(단위 테스트·비트랜잭션 호출)이면 즉시. `SettingServiceTest`에 두 경로 테스트 추가(커밋 전 `never()` → afterCommit 트리거 후 `invalidate()`).
- [ ] 동시 캐시 미스 경계 IT — Codex 4번 판정대로 차단 사유 아님, 후속.

검증: `FleetMetricsCacheTest` 4/4 · `SettingServiceTest` 10/10 · `AwsServiceImplFleetMetricsTest` 9/9 · `AwsServiceImplCoverageTest` 3/3. BE 전 모듈 **1387/1387 green**.

## 4차 재검수 결과 (Codex)

1. **판정: custom 키 소수초 충돌은 해소됨 (🟢).** `FleetMetricsCache.key()`가 custom 창의 `from`·`to` `Instant` 자체를 문자열로 키에 포함한다. `Instant.toString()`은 해당 Instant의 나노초 정밀도를 보존하므로, `2026-08-26T00:00:00Z`와 `2026-08-26T00:00:00.100Z`는 다른 키가 된다. `FleetMetricsCacheTest.customWindowKeyKeepsSubSecondPrecision`도 100ms 차이 창의 캐시 미적중을 확인한다. 계약서의 custom 키 규칙도 구현과 일치한다.

2. **판정: 커밋 전 무효화 경쟁은 개선됐으나, 캐시 재삽입 경쟁이 남아 추가 수정 필요 (🔴).** 외부 `SettingService.storageInfo()` 호출은 Spring `@Transactional` 프록시를 거치므로 일반적인 실제 저장 트랜잭션에서는 `TransactionSynchronizationManager.isSynchronizationActive()`가 true이고, 등록된 `afterCommit()`은 성공 커밋에서만 `invalidate()`를 실행한다. 따라서 롤백에서는 기존 캐시가 유지되고, 커밋 완료~afterCommit 사이 새 설정으로 계산돼 캐시된 값이 곧 비워지는 짧은 창은 기능적으로 무해하다(불필요한 재조회만 발생).

   그러나 이전 설정을 읽은 overview 요청이 **커밋 전에 cache miss로 시작**해 CloudWatch 팬아웃을 수행하다가, 커밋과 `afterCommit().invalidate()`가 끝난 **뒤에** `AwsServiceImpl.cachedFleetMetrics()`의 `fleetCache.put(...)`에 도달할 수 있다. 현재 캐시는 세대/version 확인 없이 쓰므로 그 요청의 이전 자격증명·옵트인 결과가 다시 TTL 동안 남는다. 이번 afterCommit 순서만으로는 이 in-flight 경로를 막지 못한다. 무효화 세대를 증가시키고 조회 시작 시 세대를 캡처해 `put` 직전에 같은 세대일 때만 저장하는 방식(또는 동등한 write fence)이 필요하다.

3. **판정: 테스트는 핵심 분기를 부분적으로만 검증 (🟡).** 트랜잭션 밖 즉시 무효화와 동기화 활성 시 `afterCommit()` 등록은 확인한다. 다만 현재 `SettingServiceTest`는 동기화를 수동 초기화한 뒤 등록된 callback을 직접 호출할 뿐 실제 Spring 트랜잭션의 commit/rollback lifecycle을 구동하지 않으며, 위의 in-flight 재삽입 경쟁도 재현하지 않는다. 수정 시 실제 트랜잭션 commit·rollback 및 “구세대 요청의 늦은 put은 버림” 회귀 테스트가 필요하다.

4. **새 회귀 확인:** custom 키의 형식은 `Instant`의 표준 문자열 표현 차이만 가질 뿐 동일 Instant에는 결정적이며, 기본 range의 기존 label 기반 적중 규칙도 변하지 않았다. `CLOUD` 저장만 무효화 대상으로 제한돼 ZABBIX/LLM 경로의 동작도 변경하지 않는다.

검증 시도: `FleetMetricsCacheTest`와 `SettingServiceTest`만 대상으로 Gradle test를 실행했으나, sandbox가 Gradle 9.2.1 wrapper 배포본 다운로드를 차단(`SocketException: Permission denied`)하여 실행 결과는 확보하지 못했다.

종합: 추가 수정 필요

## 4차 반영 내역 (Claude, 2026-08-26 — 4차 재검수 후)

- [x] **🔴 in-flight 재삽입 경쟁** — `FleetMetricsCache`에 무효화 세대(`AtomicLong generation`) 도입: `invalidate()`가 세대를 올리고, `put(region, range, value, observedGeneration)`은 조회 시작 시 캡처한 세대와 현재 세대가 같을 때만 저장(put 직후 재확인해 사이에 끼어든 무효화도 되돌림). `AwsServiceImpl.cachedFleetMetrics`는 **AWS 호출 전** `generation()`을 캡처해 put에 넘긴다. 테스트: `FleetMetricsCacheTest.stalePutAfterInvalidationIsDropped`(구세대 put=false·미저장, 새 세대 put=저장) + `AwsServiceImplFleetMetricsTest.inFlightInvalidationDropsLatePut`(팬아웃 도중 `invalidate()` 끼어듦 → 다음 개요가 다시 팬아웃=12콜).
- [ ] **🟡 실제 Spring 트랜잭션 commit/rollback 라이프사이클 테스트** — 단위 테스트는 `TransactionSynchronizationManager` 수동 초기화로 등록·지연을 검증. 실제 프록시 경유 IT는 `IntegrationTestSupport` 패턴으로 후속(도커 DB 필요).

검증: `FleetMetricsCacheTest` 5/5 · `AwsServiceImplFleetMetricsTest` 10/10 · `SettingServiceTest` 10/10 · `AwsServiceImplCoverageTest` 3/3. BE 전 모듈 **1389/1389 green**.

## 5차 재검수 결과 (Codex)

1. **판정: in-flight 재삽입 경쟁은 닫힘 (🟢).** `AwsServiceImpl.cachedFleetMetrics()`가 cache miss 직후, AWS 팬아웃 전에 세대를 캡처하고(`AwsServiceImpl.java:452`), `FleetMetricsCache.put()`은 저장 전과 저장 직후에 캡처 세대와 현재 세대를 비교한다(`FleetMetricsCache.java:73-84`). 따라서 (a) 캡처 → 무효화 → put은 첫 비교에서 버려지고, (b) 캡처 → put 진입 → 무효화 → put 완료는 사후 비교가 방금 쓴 구세대 값을 제거하며, (c) 무효화 → 캡처 → put은 새 세대가 일치하므로 정상 저장된다. 이는 이전 설정으로 시작한 요청이 afterCommit 무효화 뒤 결과를 다시 TTL 동안 남기던 4차 🔴 경로를 차단한다. `stalePutAfterInvalidationIsDropped` 및 팬아웃 중 무효화를 넣어 다음 개요의 재팬아웃(12콜)을 확인하는 `inFlightInvalidationDropsLatePut`도 이 의도를 직접 회귀 검증한다. 계약서의 세대 펜스 설명도 구현과 일치한다.

2. **판정: 사후 `remove(key)`가 새 세대 값을 지울 수 있으나, 현 범위에서는 비차단(🟡).** 같은 키에서 구세대 요청 A가 `entries.put()`을 마친 뒤 무효화가 일어나고, 새 세대 요청 B가 정상 값을 저장한 다음 A가 사후 세대 비교에 실패하면 A의 무조건 `entries.remove(key)`(`FleetMetricsCache.java:81-82`)가 B의 값을 함께 지울 수 있다. 이는 A의 stale 값을 되살리거나 B의 현재 요청 응답을 바꾸지 않는다. 이후 요청만 cache miss가 되어 새 설정으로 재조회하며, `ok`/`partial`만 캐시하고 DB 조건부 예산 예약이 상한을 강제하므로 정확성·예산 상한 위반으로 이어지지 않는다. 즉 캐시 적중률 저하와 일시적 중복 팬아웃 가능성은 남지만 커밋 차단 사유는 아니다. 향후 품질 보강 시 `entries.remove(key, staleEntry)` 또는 key별 조건부 갱신으로 이 불필요한 eviction을 없앨 수 있다.

3. **판정: 실제 Spring 트랜잭션 commit/rollback IT 미작성은 커밋 차단 사유 아님 (🟡).** `afterCommit` 등록 자체는 기존 단위 테스트가 검증하고, 이번 핵심 stale 재삽입은 캐시 단위 테스트와 서비스 팬아웃 회귀 테스트가 독립적으로 덮는다. 실제 프록시·DB를 포함한 lifecycle IT는 설정 저장이 성공 커밋일 때만 세대를 올리고 롤백 때 캐시를 유지한다는 통합 경로의 신뢰도를 높이므로 후속으로 작성할 가치가 있지만, 현재 변경의 정확성을 뒤집는 미검증 경로는 아니다.

4. **새 회귀 확인.** custom의 `Instant` 전체 정밀도 키와 기본 range의 label 기반 적중 규칙은 유지됐다. `invalidate()`가 세대를 먼저 증가시킨 뒤 clear하므로 진행 중 요청은 늦은 저장을 수행할 수 없고, 새 세대 요청은 정상적으로 저장된다. 이번 검수는 요청 범위의 읽기 전용 코드 분석으로 수행했으며, 사용자 지시(쓰기 대상은 요청서만)에 따라 Gradle 재실행은 하지 않았다.

종합: 커밋 가능

## 최종 (Claude, 2026-08-26)

- Codex 5차 **커밋 가능**. 🟡 #2(사후 remove가 새 세대 값 축출)는 승인 후 한 줄로 반영: `entries.remove(key, mine)`(같은 Entry 인스턴스일 때만 제거). `FleetMetricsCacheTest` 5/5 · `AwsServiceImplFleetMetricsTest` 10/10 재확인.
- 🟡 #3 실제 트랜잭션 lifecycle IT — 후속 과제로 남김.
- 🔴 **커밋 순서 주의**: 이 변경은 병행 세션의 **미커밋 신규 파일**(`CloudWatchAvailability.java`·`Ec2ZabbixMatcher.java`, 커버리지 매트릭스 작업)에 컴파일 의존한다 → 그쪽 커밋이 먼저 들어가야 한다. FE도 `EC2Dashboard.tsx`·`kr/en.json`·`types/cloud-infra.ts`에 그쪽 훅크가 섞여 있어 훅크 선별 스테이징 필요.
