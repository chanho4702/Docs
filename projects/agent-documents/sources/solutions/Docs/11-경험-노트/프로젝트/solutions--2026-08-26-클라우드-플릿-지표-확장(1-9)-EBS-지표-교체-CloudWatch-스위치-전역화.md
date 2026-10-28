# 2026-08-26 — 클라우드 플릿 지표 확장(1~9) → EBS 지표 교체 → CloudWatch 스위치 전역화

> 프로젝트 [[projects/moveseye/moveseye|moveseye]] · 설계 `_workspace/designs/devdesign_cloud-fleet-extras.md` · 계약 `_workspace/contract_cloud-monitoring-overview.md` §"목록·상세로의 확장" · 검수 `_workspace/reviews/review_cloud-fleet-extras.md`
> 선행: [[projects/moveseye/2026-08-24-cloud-infra-permission|2026-08-24-cloud-infra-permission]] · AWS 상태 차트화/무과금(`devdesign_cloud-cost-optin.md`) · 소스 매트릭스(`devdesign_ec2-monitoring-sources.md`)
> 커밋(전부 미푸시): BE `3a33131`·`0000d45`·`e6e3199`(ZM-79) / FE `72c531b`·`a8cae71`·`71bf2b0`·`7bc64d2`(master)

## 무엇을 했나

전날 P3(플릿 지표 옵트인 토글)를 커밋한 뒤 사용자가 "토글 켜져 있으면 EC2 목록·VPC에도 보여줘야 하지 않냐" → 제안 11개 중 **1~9 "전부 ㄱㄱ"**(10=AWS 상세 모니터링은 AWS측 유료 설정, 11=CloudWatch로 불가 → 제외).

1. **플릿 지표 확장(1~9)** — GetMetricStatistics 3→**5지표**(CPU·NetIn/Out·디스크 R/W) + 리전당 `DescribeAlarms` 1콜, 캐시 TTL 10→**15분**. EC2 목록 `metrics`(CPU+스파크라인·네트워크·디스크), VPC `fleetMetrics`(실행 수·평균 CPU), 상세 `fleetComparison`(리전 평균 대비, **캐시 전용**), 홈 위젯 `cloud_fleet`, CPU≥80/알람 재판정, 낭비 진단 카드. Codex 1라운드 검수 → 🔴4·🟡3 전건 반영 후 커밋.
2. **실서버 확인에서 발견** — 디스크 컬럼이 null. `DiskReadBytes/DiskWriteBytes`는 **인스턴스 스토어 전용** 지표라 EBS 전용(Nitro) 인스턴스엔 데이터포인트가 아예 없다. 사용자 승인으로 `EBSReadBytes/EBSWriteBytes`로 교체(플릿 + 기존 상세 시계열 둘 다, 응답 키 이름은 유지) → disk W 35 KB/s·시계열 12점.
3. **사용자 지적 → 스위치 전역화** — "설정 2개 다 껐는데 목록 배지가 CloudWatch?" 원인: `monitoredBy()`가 CW 가용성(권한·예산)만 보고 스위치를 안 봤고, 상세 시계열도 스위치 무관하게 호출했다(계약서에 ⚠️로 "의도된" 불일치라 적혀 있었음). A안 채택: `paidFeatures.fleetMetrics` = **CloudWatch 호출 전체의 스위치**. 커버리지 5번째 값 `cloudwatch-off`, 상세 시계열 `disabled/PAID_FEATURE_OFF`, 설정 명칭 "플릿 지표 확장" → **"CloudWatch 지표 수집"**. :3001 검증 인스턴스로 OFF→ON→원복 실측.

4. **후속 2건(사용자 불만)** — ① "옵션 켰는데 개요에 바로 반영 안 됨": BE는 캐시 없음, **FE 저장 핸들러가 `STATUS`·설정 쿼리만 무효화**하고 전역 `staleTime` 60초 안에 개요로 가면 이전 "꺼짐" 응답 → `CLOUD_INFRAS_QUERY_KEY` 전체 무효화(`71bf2b0`). ② "하위 탭 테이블 죄다 가로 스크롤": `DmoveTable` 기본 `scroll.x=1000`(최소 폭) + 내가 얹은 플릿 컬럼 고정폭 → 인스턴스·VPC 목록을 `tableLayout="fixed"`+`x:"100%"`로, 고정폭 제거(`7bc64d2`).

## 결정과 근거

- **값이 없으면 항상 `{state, reason}` 상태 객체** — 목록·VPC·상세 모두. 0으로 꾸미지 않는다(PAID_FEATURE_OFF / INSTANCE_NOT_RUNNING / FLEET_CAP / NO_DATAPOINTS / CLOUDWATCH_ALARMS_UNAVAILABLE / NOT_CACHED).
- **상세는 캐시만 읽는다** — 상세 1건 때문에 리전 전체(20대×5콜)를 팬아웃하지 않는다. 미스면 `disabled/NOT_CACHED`("개요/목록을 먼저 열면 채워짐"). 목록·VPC는 개요와 같은 리전 캐시(**1h 창 고정**)를 읽고 미스일 때만 같은 규칙으로 호출.
- **예산 재계산** — (20×5+1)×96×30 ≈ **29만 콜/리전/월**, 플릿 몫 35만 안(1리전). 2리전이면 `BUDGET_EXHAUSTED` 강등이 설계된 동작.
- **재판정은 상향만**(`severityRank`: critical>warning>unobserved>healthy). 처음 healthy만 대상으로 짜서 `unobserved`(상태점검 미수집)가 빠졌고 테스트가 잡았다.
- **알람은 지표와 독립** — DescribeAlarms 실패가 지표를 죽이지 않는다. 옵트인 꺼짐이면 종전 `ZERO_COST_MODE`.
- **스파크라인은 SVG 공용 부품**(`components/Sparkline`) — 목록 20행에 ECharts 인스턴스 20개(canvas·리사이즈 옵저버)는 과하다.
- **"껐다"의 뜻은 하나여야 한다** — 스위치가 "플릿 팬아웃만"이면 설정 화면("무과금 모드")과 목록 배지("CloudWatch")가 서로 다른 말을 한다. 기술적으로 거짓이 아니어도(상세 시계열은 실제로 CW를 씀) 고객 문의가 생긴다. 전역 스위치로 통일하고 5번째 배지 값을 추가했다. agent 소스는 무관.

## Codex 1라운드가 잡은 것 (전건 반영)

- 🔴 `mean()`이 유효값 0개면 `0d`, 네트워크 한쪽 결측을 0으로 채워 `networkTop` 산입 → nullable `Double`, `networkTop`은 in/out 둘 다 있을 때만.
- 🔴 저자의 불안 지점 1이 실제 결함: FLEET_CAP 리전에서 상한 안 수집·값 없음 인스턴스도 FLEET_CAP으로 근사 → `FleetMetrics.targetIds` 보존해 NO_DATAPOINTS/FLEET_CAP 구분.
- 🔴 VPC 컬럼이 예산 소진·상한 강등까지 전부 "no data" → 사유별 문구+툴팁.
- 🔴 `wasteMonthlyUsd: null`(요금표 미조회)을 `$0.00`으로 → `-`.
- 🟡 정렬에서 결측을 -1/0 대입 → `compareNullLast`.

## 교훈

- 🔴 **CloudWatch 지표 이름은 인스턴스 종류를 탄다.** `DiskRead/WriteBytes`는 인스턴스 스토어, EBS는 `EBSRead/WriteBytes`(같은 AWS/EC2 네임스페이스, Nitro). 단위 테스트는 mock이라 못 잡고 **실서버에서만** null로 드러났다. 기존 상세 시계열도 같은 지표를 쓰고 있었다(선재 결함).
- 🔴 **"기술적으로 맞는 불일치"도 결함이다.** 계약서에 ⚠️로 적어 둔 것이 면죄부가 아니었다 — 사용자는 설정 화면과 목록을 같이 본다.
- 🔴 **적용된 Flyway 마이그레이션은 주석 한 줄도 건드리면 기동이 죽는다.** `_workspace/designs/` 정리 때 V13/V17 주석의 문서 경로를 따라 고친 흔적(다른 세션, 미커밋)이 체크섬 불일치를 냈다. `git checkout --`으로 되돌려 해소. 스택 맨 아래 `Validate failed`만 보면 된다.
- 🔴 **사용자가 :3000을 직접 띄워 둔 상태**에선 내 검증 인스턴스는 **:3001**(`scratchpad/run_be_3001.ps1`). 그 JVM은 `build/classes` 디렉터리를 클래스패스로 쓰므로 내 gradle 빌드가 디스크의 클래스를 덮는다(이미 로드된 클래스는 안 바뀌지만 지연 로드 클래스가 섞일 수 있음) — 사용자 인스턴스가 떠 있는 동안 gradle 빌드는 자제.
- 검증 스크립트가 설정을 뒤집을 땐 **원래값으로 복원**까지 스크립트에 넣는다(`try/finally`) — 같은 dev DB를 사용자 인스턴스도 보고 있다.
- Java 주석을 끝에 붙이는 패치는 **뒤따르는 쉼표를 삼킨다**(`new X(...)   // 주석,` → 컴파일 에러). 주석은 앞줄에.
- BE 테스트는 `gradlew :test`(앱 모듈 한정) — `test`는 `engine-zabbix`에 해당 테스트가 없어 "No tests found"로 실패.
- FE 전체 jest에 선재 실패 2건(`TriggerFormDrawer`, `AiAssistantPage`) — 이번 변경과 무관, 단독 재실행에서도 실패. 별도 확인 필요.

## 열린 항목

- Codex 권고 "1h 고정 캐시"(개요를 6h/24h로 본 뒤 목록 열면 1h 팬아웃 1회 추가) — 의도된 비용으로 계약서에 명시, 재검토 여지.
- 홈 위젯 `fleetOff` 판정: 리전 0개(자격증명 없음)면 "no_metric_data"가 뜬다 — 자격증명 미설정 안내가 더 맞을 수 있음.
- 브라우저 렌더 미확인(Chrome MCP가 localhost를 에러 페이지로만 띄움) — 컬럼 폭·스파크라인 시각.
- 사용자 :3000 인스턴스는 스위치 전역화 **이전** 코드 — 화면 확인엔 재기동 필요.
