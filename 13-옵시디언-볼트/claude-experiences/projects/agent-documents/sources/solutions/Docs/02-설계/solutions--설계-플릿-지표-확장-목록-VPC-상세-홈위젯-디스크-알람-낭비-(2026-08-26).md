# 설계 — 플릿 지표 확장: 목록·VPC·상세·홈위젯·디스크·알람·낭비 (2026-08-26)

- 작성: Claude · 상태: 구현 착수(사용자 "전부 ㄱㄱ") · 선행: `devdesign_cloud-cost-optin.md` P3, `reviews/review_cloud-fleet-metrics-p3.md`(Codex 5차 커밋 가능)
- 제외: 1분 해상도(AWS 측 유료 설정, 제품 기능 아님) · 메모리/디스크 사용률(CloudWatch 불가 — 에이전트 안내가 답)

## 0. 원칙 (변하지 않는 것)
- 유료 API 없음: CloudWatch는 `GetMetricStatistics`·`DescribeAlarms`(둘 다 프리티어 월 100만 요청 풀)만. 월 예산(50만)·플릿 몫(70%)·리전당 20대·캐시는 그대로.
- 플릿 토글(`paidFeatures.fleetMetrics`) OFF면 **모든 신규 표시는 "꺼짐" 상태**(null + reason `PAID_FEATURE_OFF`)로 내려가고 FE는 "설정에서 켜세요"로 렌더. 숨기지 않는다(켜면 생긴다는 걸 알린다).
- 조용한 절단·0 위장 금지: 데이터 없음은 null/`NO_DATAPOINTS`.

## 1. 항목별 결정

| # | 항목 | 데이터 출처 | 추가 AWS 호출 | 결정 |
|---|---|---|---|---|
| 1 | EC2 목록 CPU·네트워크(·디스크) 컬럼 | 리전 플릿 캐시(`FleetMetricsCache`)의 인스턴스별 값 | 캐시 미스 때만 팬아웃(개요와 동일 규칙) | `/cloud-infras/ec2s` 항목에 `metrics{cpuAverage,inBps,outBps,diskReadBps,diskWriteBps,state,reason}` 추가. 기간은 개요 기본 `1h` 고정(목록에 기간 셀렉터 없음) |
| 2 | VPC 목록 평균 CPU·실행 수 | 같은 캐시 | 동일 | `/cloud-infras/vpcs` 항목에 `runningInstances`, `cpuAverage`(소속 실행 인스턴스 평균, 없으면 null) |
| 3 | CPU≥80% → warning | 개요 플릿 결과 | 0 | 계약서 규칙(“warning: CPU 평균 80% 이상”) 구현. healthy→warning 재분류 + reasons `CPU_HIGH`. 스냅샷 판정(`Ec2StatusRules`)은 건드리지 않음(CPU는 스냅샷에 없음) |
| 4 | 상세 "리전 평균 대비" | 캐시만 읽음(미스면 null — 상세 1건 때문에 팬아웃하지 않음) | 0 | `/cloud-infras/ec2/detail`에 `fleetComparison{instanceCpu, regionCpuAverage, regionRunningCount}` |
| 5 | 홈 위젯 "클라우드 플릿" | `/cloud-infras/overview?range=1h`(BE 캐시) | 0 | 위젯 타입 `cloud_fleet` 1종: CPU 상위 5 + 낭비(미부착 EBS·미사용 EIP) 카운트. 토글 OFF면 잠금 안내 |
| 6 | 디스크 I/O | GetMetricStatistics **`EBSReadBytes`·`EBSWriteBytes`**(Sum/period) — 처음 `DiskRead/WriteBytes`로 짰다가 실서버에서 null 확인: 그 지표는 인스턴스 스토어 전용이라 EBS 전용(Nitro) 인스턴스엔 데이터포인트가 없다 → 사용자 결정으로 교체(상세 시계열 `CloudMetricsService`도 동반 교체) | 인스턴스당 3→**5콜** | 아래 §2 예산 재계산에 따라 캐시 TTL 10→**15분** |
| 7 | 스파크라인 | 같은 조회의 CPU 데이터포인트를 캐시에 보존(추가 호출 0) | 0 | 목록 CPU 컬럼에 1h(5분×12점) 스파크. 7d 별도 조회는 **안 한다**(범위마다 팬아웃이 곱해짐) |
| 8 | CloudWatch 알람 | `DescribeAlarms`(리전당 1콜, 프리티어 풀) | 리전당 1콜/15분 | 토글 ON일 때만. `alarms` 목록·`summary.activeAlarms`·`collection.alarms=ok`. 위험 판정: ALARM→critical, INSUFFICIENT_DATA→warning(계약서 규칙). 정책 결정: 사용자 "전부" 승인으로 채택 — Zabbix 대체 원칙은 유지하되 "고객이 이미 쓰는 알람은 보여준다" |
| 9 | 낭비 진단 카드 | 기존 cost-estimate 응답(미부착 EBS·미사용 EIP) | 0 | 개요에 카드 1개(FE만) |

## 2. 예산 재계산 (5지표 + 알람)
- 인스턴스당 5콜 + 리전당 알람 1콜. 리전당 20대 상한, 캐시 **15분**(FE 폴링 10분보다 길어 리전당 15분에 1회로 수렴).
- 최악: (20×5 + 1) × 96회/일 × 30일 = **290,880/리전/월** → 플릿 몫 350,000 안(1리전). 2리전이면 소진 → `BUDGET_EXHAUSTED` 강등(설계된 동작, 상세 시계열 몫은 보존).
- 예약은 `(targets×5 + 1)`로 한 번에. 알람 호출은 별도 try(실패해도 지표는 살린다).

## 3. 캐시 구조 변경
`FleetMetrics`에 `byInstance: Map<instanceId, InstanceMetrics(cpuAverage, cpuSeries[epoch,value], inBps, outBps, diskReadBps, diskWriteBps)>` 추가. cpuTop/networkTop은 여기서 파생. 목록·VPC·상세는 `fleetCache.get(region, 1h)` → byInstance만 읽는다(miss면 목록/VPC는 팬아웃, 상세는 null).

## 4. 검수
마지막 1라운드(Codex). 요청서: `reviews/review_cloud-fleet-extras.md`.

## 5. 구현 현황 (2026-08-26)
| # | 상태 | 비고 |
|---|---|---|
| 1 | ✅ BE·FE | `metrics` 상태 객체(disabled/PAID_FEATURE_OFF·INSTANCE_NOT_RUNNING, partial/FLEET_CAP·NO_DATAPOINTS). FE 컬럼 3개(CPU+스파크·네트워크 ↓↑·디스크 R/W), 값 없으면 상태 문구 |
| 2 | ✅ BE·FE | `fleetMetrics{runningInstances, cpuAverage}` — runningInstances는 옵트인 무관 |
| 3 | ✅ BE | 재판정은 **상향만**(`severityRank`). 처음엔 healthy만 대상이라 `unobserved`가 빠졌음 → 테스트가 잡아 수정 |
| 4 | ✅ BE·FE | 캐시 미스는 `disabled/NOT_CACHED`(null 아님 — 상태 객체 원칙) |
| 5 | ✅ BE·FE | `HomeWidgetType.CLOUD_FLEET`(기본 세트 제외·unique·6×8) + `CloudFleetWidget` + 레지스트리/카탈로그 테스트 |
| 6 | ✅ BE | 5지표, TTL 15분, 예약 `(targets×5+1)` |
| 7 | ✅ BE·FE | `cpuSeries [epochSec, %]` 캐시 보존, 공용 `components/Sparkline`(SVG, ECharts 아님) |
| 8 | ✅ BE·FE | `AwsReadOnlyGateway.describeAlarms`, 실패는 `CLOUDWATCH_ALARMS_UNAVAILABLE`로 지표와 독립 |
| 9 | ✅ FE | 개요에 낭비 카드(`/cost-estimate` 재사용, 상위 5 + 더보기 문구) |
| 10·11 | ✖ 제외 | 10=AWS측 유료 설정(상세 모니터링), 11=CloudWatch로 불가 — 사용자 합의 |

검증: BE `aws.*/home.*/setting.*` green, FE tsc·eslint·jest(홈 레지스트리 7 + CloudFleetWidget/Sparkline 5) green. **실서버(:3000) 미확인** — 사용자가 다른 작업 중이라 임의 재기동 금지.
