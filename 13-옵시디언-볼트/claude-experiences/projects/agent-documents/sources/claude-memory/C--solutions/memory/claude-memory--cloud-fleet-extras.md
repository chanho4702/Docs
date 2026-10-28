---
name: cloud-fleet-extras
description: "2026-08-26 플릿 지표 확장 — 5지표·알람·목록/VPC/상세 뷰·홈위젯·스파크·낭비 카드. 상태 객체 원칙, 상세는 캐시 전용(NOT_CACHED=disabled), 재판정은 상향만"
metadata: 
  node_type: memory
  type: project
  originSessionId: aa3869c5-a1c1-4fc1-a1a0-8f8f56d27340
  modified: 2026-08-26T06:18:17.231Z
---

2026-08-26 사용자 "전부 ㄱㄱ"로 P3(플릿 지표 토글, `1c76397`/`1b194dc`) 위에 항목 1~9를 얹었다(10=AWS 유료 상세모니터링·11=CloudWatch 불가는 제외 합의). 설계 `_workspace/features/cloud/aws-monitoring/devdesign_cloud-fleet-extras.md`, 계약 `_workspace/features/cloud/aws-monitoring/contract_cloud-monitoring-overview.md` §"목록·상세로의 확장", 검수 `_workspace/features/cloud/aws-monitoring/review_cloud-fleet-extras.md`. 상태: Codex 1라운드 지적 4+3건 반영 후 **커밋 완료** BE `3a33131`(ZM-79)·FE `72c531b`(master), 미푸시. 실서버 확인 완료(17리전 ok, 캐시 9.9→2.5s, 목록/VPC/상세/낭비 전부 정상). 🔴발견: EBS 전용(Nitro) 인스턴스는 `DiskReadBytes/DiskWriteBytes`에 데이터 없음 → 디스크 컬럼 null. 사용자 승인으로 `EBSReadBytes/EBSWriteBytes`로 교체(플릿+상세 시계열 CloudMetricsService, 응답 키 유지) → 재기동 실측 disk W 35 KB/s·시계열 12점. BE `0000d45` 커밋(미푸시). 브라우저 미확인. FE 전체 jest 선재 실패 2건(`TriggerFormDrawer`·`AiAssistantPage`, 이번 변경 무관) 별도 확인 필요.

**결정**
- 인스턴스당 GetMetricStatistics 3→**5콜**(CPU·NetIn/Out·DiskRead/Write) + 리전당 `DescribeAlarms` 1콜. TTL 10→**15분**. 최악 (20×5+1)×96×30 ≈ **29만/리전/월**(플릿 몫 35만 → 2리전이면 BUDGET_EXHAUSTED가 설계된 동작).
- 목록·VPC는 개요와 같은 리전 캐시(**1h 창 고정**) → 미스면 팬아웃. **상세 `fleetComparison`은 캐시만 읽는다**(1건 때문에 리전 전체 안 부름) → 미스는 `disabled/NOT_CACHED`.
- 값 없으면 항상 `{state, reason}` 상태 객체(PAID_FEATURE_OFF·INSTANCE_NOT_RUNNING·FLEET_CAP·NO_DATAPOINTS·CLOUDWATCH_ALARMS_UNAVAILABLE·NOT_CACHED). FE는 0으로 꾸미지 않고 문구(`renderFleetState`).
- 위험 재판정은 **상향만**(`severityRank`: critical>warning>unobserved>healthy) — 처음 healthy만 대상으로 짜서 `unobserved`가 빠졌고 테스트가 잡았다. 알람 실패는 지표와 독립.
- 홈 위젯 `cloud_fleet`은 기본 세트 제외·unique·6×8. 스파크라인은 공용 `components/Sparkline`(SVG, ECharts 금지 — 20행이면 canvas 20개).

**후속(2026-08-26) — CloudWatch 스위치 전역화(D6)**: 사용자가 "설정 다 껐는데 목록 배지가 CloudWatch"를 지적. 원래 `monitoredBy`는 CW 가용성만 보고 상세 시계열도 스위치 무관하게 호출(계약서에 ⚠️로 "의도된" 불일치). A안 채택: `paidFeatures.fleetMetrics` = CW 호출 전체 스위치 → 배지 5번째 값 `cloudwatch-off`, `CloudMetricsService`도 `disabled/PAID_FEATURE_OFF`, 설정 명칭 "CloudWatch 지표 수집". :3001로 OFF/ON 실측 확인, 커밋 BE `e6e3199`·FE `a8cae71`(미푸시). 🔴사용자가 :3000을 직접 띄워 둔 상태에선 내 검증 인스턴스는 **:3001**(`scratchpad/run_be_3001.ps1`), gradle 빌드는 사용자 JVM의 build/classes를 덮으니 자제.

**후속 2(2026-08-26)**: FE `71bf2b0` 설정 저장 시 `CLOUD_INFRAS_QUERY_KEY` 전체 무효화(전엔 STATUS·설정만 → staleTime 60초 안에 개요 가면 이전 "꺼짐" 그대로) · FE `7bc64d2` 인스턴스·VPC 목록 `tableLayout="fixed"`+`scroll x:"100%"`(🔴DmoveTable 기본 `scroll.x=1000`은 최소 폭이라 좁은 컨테이너에서 무조건 가로 스크롤 — 사용자 "가로 스크롤 없애" 지시).

**Why:** 사용자 요구는 "토글 켰으면 목록/VPC에도 보여야" — 추가 AWS 호출 없이(캐시 재사용) 보여주되 예산 상한 안에 두는 것이 핵심 제약.

**How to apply:** 플릿 지표를 다른 화면에 더 실을 때도 `fleetCache.get(region, "1h")`의 `byInstance`만 읽고, 상세류는 캐시 전용으로. BE 테스트는 `gradlew :test`(engine-zabbix에 해당 테스트 없어 `test`는 "No tests found"로 실패). 관련: [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--cloud-aws-gating|cloud-aws-gating]] [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--home-widget-dashboard|home-widget-dashboard]]


## 인덱스 상세 이관 (2026-09-02)

인덱스 압축으로 옮겨온 요약 — 본문과 중복될 수 있으며 본문이 우선.

플릿 지표 확장 — 2026-08-26 P3 위에 항목 1~9(5지표·알람·목록/VPC/상세 뷰·홈위젯 cloud_fleet·스파크·낭비 카드) Codex 1라운드 반영 후 **커밋 완료 BE `3a33131`·FE `72c531b`(미푸시)**, 실서버 확인 OK. 🔴EBS 전용(Nitro) 인스턴스는 DiskRead/WriteBytes 데이터 없음 → EBSRead/WriteBytes로 교체(실측 확인, BE `0000d45` 커밋). 🔴fleetMetrics 스위치=CloudWatch 전역 스위치(D6, 배지 `cloudwatch-off`·상세 시계열도 차단, :3001 실측, 커밋 BE `e6e3199`·FE `a8cae71`). 사용자가 :3000 띄워 두면 검증은 :3001. 후속 FE `71bf2b0`(설정 저장 시 클라우드 쿼리 전부 무효화 — staleTime 60초에 개요 즉시 반영 안 되던 것)·`7bc64d2`(목록 가로 스크롤 제거 — DmoveTable 기본 scroll.x=1000 대신 fixed+100%). 🔴상세 fleetComparison은 캐시 전용(NOT_CACHED=disabled) · 재판정 상향만 · 1h 창 고정 · TTL 15분/최악 29만 콜/리전/월 · BE 테스트는 `:test`(engine-zabbix에 없어 `test`는 실패)
