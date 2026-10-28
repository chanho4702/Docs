# 코덱스 검수 결과 — APM P3 1차 (2026-09-07, BE e386e61 · AI 533d4c0)

검수 결과: **승인 보류**. SLO 알람 조건·롤링 집계·스냅샷 복구에 중대한 결함이 있습니다.  
BE `922a708..e386e61`, AI `d9918ba..533d4c0` 기준이며, FE 라우트는 커밋 `ef951b0`과 대조했습니다.  
파일 수정·테스트 실행은 하지 않았습니다. 아래 행 번호는 대상 커밋 기준이며, 기존 green 보고는 재검증하지 않았습니다.

| # | 심각도 | 레포/파일:라인 | 문제 | 왜 | 권고 |
|---|---|---|---|---|---|
| 1 | 🔴 | BE [ApmSloCalculator.java:348](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/slo/ApmSloCalculator.java:348) | SRE의 서로 다른 알람을 AND로 결합 | `burn1h=10, burn6h=10`인 지속 장애는 발화하지 않는다. SRE는 `(1h·5m 모두 14.4 초과) OR (6h·30m 모두 6 초과)`다. 7일에도 14.4를 사용하면 1시간 예산 소비량은 2%가 아니라 약 8.57%다. [SRE 원문](https://sre.google/workbook/alerting-on-slos/) | 짧은 확인 창과 OR 조합을 반영하고 기간별 기본 임계를 계산. 최대 가능한 burn보다 높은 임계도 검증할 것. 예: target=90%이면 최대 burn=10이라 기본 14.4는 영원히 발화 불가. |
| 2 | 🔴 | BE [ApmSloCalculator.java:173](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/slo/ApmSloCalculator.java:173) | 선언한 롤링 창과 실제 집계 구간 불일치 | 30일은 H1, 7일은 M5 하나만 읽는다. SQL은 `bucket_start >= from`이라 시작 경계의 부분 버킷을 버리고, 롤업은 닫힌 버킷만 생성하므로 최근 구간도 빠진다. 예: 10:37 조회 시 10:00 이후 장애가 30일 버짓에 반영되지 않는다. | 완성된 롤업 본문과 세밀한 경계·최신 구간을 중복 없이 합산. 실제 측정 범위와 지연도 응답에 명시. |
| 3 | 🔴 | BE [ApmSloCalculator.java:245](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/slo/ApmSloCalculator.java:245) | LATENCY의 NULL 히스토그램이 조용히 분모에서 사라짐 | 기존 `ApmHistogramMerger`는 `hist.counts=null` 조각을 제외한다. 롤업의 mixedBounds 행은 실제로 이 형태다. 정상 100건과 측정 불가 9,900건을 섞어도 `requests=100`, SLI=100%가 가능하며 `bounds==null` 가드에 걸리지 않는다. | 요청 수와 측정 가능 수를 분리하고, 누락·혼재 여부를 전달. 표·시계열·스냅샷에 동일한 불완전 데이터 정책 적용. |
| 4 | 🔴 | BE [ApmSloSnapshotService.java:117](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/slo/snapshot/ApmSloSnapshotService.java:117) | 하루 배치 누락 시 진행분이 영구 확정됨 | D일 00:50 진행분 저장 → D+1 확정 배치 실패 → D+2에는 기존 행이라는 이유로 건너뛴다. 이후 캘린더는 50분치를 하루 전체로 표시한다. 대입 멱등성만으로 해결되지 않는다. | `finalized` 또는 측정 종료 시각을 저장하고, 기존 미확정 행도 백필·재확정. |
| 5 | 🔴 | BE [ProblemTagFilterGuard.java:35](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/event/ProblemTagFilterGuard.java:35) | 추가된 이벤트 태그 권한 보호가 실패 시 열림 | 기동 직후 감지 실패 또는 과거 `false` 상태에서 감지 실패가 지속되면 사용자별 태그 검증을 생략한다. 호스트는 보이지만 특정 태그의 알람은 금지된 사용자에게 사본이 노출될 수 있다. | 감지 불명을 `false`와 분리하고 사용자 토큰 검증으로 전환. 검증까지 실패하면 해당 결과를 숨길 것. |
| 6 | 🔴 | BE [ApmAlertService.java:707](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertService.java:707) | Zabbix 삭제 실패 후 재시도에 필요한 식별자까지 삭제 | 예외를 삼킨 뒤 binding·rule을 삭제한다. 남은 Zabbix 트리거가 마지막 양수로 유지되어도 이후 DB 기반 정리 배치가 찾을 수 없다. 정상 경로의 CASCADE 순서는 맞지만 실패 경로는 미완성이다. | 삭제 작업과 외부 객체 ID를 별도 영속 기록으로 남겨 성공할 때까지 재시도. |
| 7 | 🟡 | BE [ApmSloService.java:319](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/slo/ApmSloService.java:319) | 이름만 수정해도 꺼 둔 burn 규칙 재활성화 | 일반 알람 PUT으로 `enabled=false`인 규칙도 `before != null`이면 활성 요청으로 해석한다. `syncSloRule`은 기존 규칙을 무조건 `enabled=true`로 변경한다. | 필드 생략 시 실제 활성 상태 보존. SLO 규칙을 일반 알람 API에서 수정할 수 있는지도 일관되게 정리. |
| 8 | 🟡 | BE [ApmAlertService.java:658](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertService.java:658) | 서비스별 SLO 여러 개가 기존 규칙 조회에서 하나로 축소됨 | 신규 구조는 같은 서비스에 여러 `SLO_BURN`을 허용하지만, 기존 `forService()` 202행은 kind별 `putIfAbsent`다. 실제 평가되는 다른 SLO 규칙이 서비스 상세와 AI 응답에서 사라진다. | SLO 규칙은 `sloId`별로 조회·표시하고 SLO 식별자를 DTO에 포함. |
| 9 | 🟡 | BE [ApmSloService.java:305](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/slo/ApmSloService.java:305) | 설정 변경 전후 스냅샷의 기준을 구분할 수 없음 | target·windowDays뿐 아니라 latencyThresholdMs도 변경 가능하다. 지연 임계를 바꾸면 과거 `good/total`의 의미까지 달라지지만 스냅샷에는 당시 설정이 없다. | 정의 버전과 당시 설정 저장. 과거 값 보존 정책과 재계산 정책을 명시적으로 구분. |
| 10 | 🟡 | BE [ApmSloService.java:425](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/slo/ApmSloService.java:425) | 오늘 캘린더만 일간 버짓을 반환 | 과거 칸은 해당 시점의 7/30일 롤링 버짓인데 오늘은 오늘의 요청만 분모로 계산한다. 월간 예산이 소진됐어도 오늘 실패가 없으면 100%로 표시된다. | 오늘 SLI는 일간으로 유지하되 버짓은 조회 시점의 롤링 창으로 계산. |
| 11 | 🟡 | BE [ApmWidgetService.java:142](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/overview/widget/ApmWidgetService.java:142) | 홈 폴링이 SLO 전량 계산을 반복 | `limit=5`라도 모든 SLO를 계산한 뒤 자른다. SLO 100개면 메트릭 질의만 300회다. 상태·느린 서비스 위젯도 각각 전체 서비스 스파크·24h 가용성까지 조립한다. 실제 지연 정도는 **추정**이다. | 서비스·창별 배치 집계, 짧은 공용 캐시, 위젯 전용 최소 조회 적용. 권한 판정 2회 조회보다 먼저 줄일 비용이다. |
| 12 | 🟡 | AI [AbstractApmTool.java:143](/C:/solutions/moveseye-ai/src/main/java/com/dmove/moveseyeai/tool/apm/AbstractApmTool.java:143) | 모든 소수를 한 자리로 반올림해 작은 이상을 0으로 변환 | `errorRatePct=0.04 → 0.0`, `apdex=0.99 → 1.0`, `apdexDiff=-0.04 → 0.0`. JSON null은 보존하지만 실제 오류·변화를 모델이 정상으로 해석하게 만든다. 추세 평균도 같은 문제다. | 원래 수치 정밀도 유지. 표시용 반올림은 단위별로 적용하고 비영 값을 0으로 만들지 말 것. |
| 13 | 🟡 | AI [ApmDeploymentsTool.java:71](/C:/solutions/moveseye-ai/src/main/java/com/dmove/moveseyeai/tool/apm/ApmDeploymentsTool.java:71) | 지정 deploymentId의 서비스 소속 미검증 | 서비스 A를 조회하면서 B의 deploymentId를 주면 A 목록에 B의 비교·신규 오류를 붙인다. BE 비교 응답의 `serviceUid`도 결과에서 제거하여 불일치가 숨는다. | 비교 응답의 serviceUid를 요청 서비스와 대조하고 불일치를 오류로 반환. |
| 14 | 🟡 | AI [SystemPrompt.java:47](/C:/solutions/moveseye-ai/src/main/java/com/dmove/moveseyeai/chat/engine/SystemPrompt.java:47) | STALE/UNKNOWN을 수집 문제로 단정 | 프로세스 중단도 STALE을 만든다. BE의 UNKNOWN 설명도 “앱 중단인지 수집 중단인지 알 수 없음”인데 프롬프트는 application behaviour를 배제한다. | 수집 진단으로 분기하되 앱·호스트 중단 가능성을 유지하고 확인 전 원인을 단정하지 말 것. |

**불안 4건 판정**

1. **Zabbix push — 조건부 타당, 미해결.** 측정값이 있으면 “위반 시 양수, 아니면 0”과 `last()>0`은 동치이며 THEIRS 차단도 맞습니다. 다만 NULL이면 전송하지 않아 마지막 양수와 열린 이벤트가 유지됩니다. 측정 불가를 복구와 구분해 표시해야 합니다. 임계 `÷2.4·AND`는 #1의 수정 대상입니다. 하한 1은 정책으로 선택할 수 있지만, 실제 코드는 **1도 거절**하며 `>` 비교에서 burn=1이 자동 발화한다는 설명은 틀립니다. 실생성·push 왕복은 미검증입니다.

2. **순환·스냅샷 — 일부 통과, 결함 확정.** 현재 생성자 의존에는 Spring 빈 순환이 없습니다. 기본 SLI·예산·burn 수식, 유한 버킷 보간·단위 변환, +∞ 제외는 계약대로입니다. 순차 재실행의 대입은 맞지만 확정 누락과 설정 기준 혼재는 #4·#9·#10으로 남습니다.

3. **질의·위젯 권한 — 권한 통과, 비용 미해결.** 신규 조회 6개는 view, 쓰기 3개는 edit을 검사합니다. 위젯은 권한 거부를 빈 데이터로 바꾸지 않습니다. 부분 UNIQUE와 서비스→SLO→규칙 CASCADE도 맞습니다. 폴링 비용은 #11이며 성능 실측은 없습니다.

4. **AI — 정적 계약 대체로 통과, 의미 보존 보완 필요.** 쿠키·Bearer·visitor 전달, 403 view/edit·402 안내, ms 변환, 이름 후보 다중 일치 거절, Jackson 3 사용은 맞습니다. 우려했던 `spark`, 이벤트 `attributes`, 배포 DTO 필드도 존재합니다. 등록 11개 라우트와 서비스 탭 10개, 프롬프트의 툴 이름도 일치합니다. 다만 #12~#14가 남고 실 LLM 체인은 미검증입니다. 테스트의 `RoutingGateway`는 인증 문맥을 검증하지 않으며, 라우트 테스트도 실제 FE 파일을 읽는 검증은 아닙니다.

**다음 커밋 전 반드시 고칠 것**

- **#1~#6 우선 수정:** 알람 누락, 집계 누락, 불완전 데이터를 정상으로 표시하는 경로, 스냅샷 확정 누락, 권한 검증 실패, 외부 객체 정리 실패.
- **#7~#10·#12~#14 정합성 수정**, #11에는 계산량 제한 또는 캐시 적용.
- 구현자가 회귀 검증을 추가할 것: 비정렬 롤링 경계·최신 롤업 공백, 실제 Merger의 정상+NULL 혼합, 배치 하루 누락 후 재실행, Zabbix 삭제 실패 후 재시도, 꺼진 규칙 유지, 소수 오류율 보존. 현재 수기 계산·Mockito 중심 테스트는 이 경로들을 입증하지 못합니다.

> ⚠️ #5 `event/ProblemTagFilterGuard.java`는 대상 커밋 e386e61에 포함되지 않은 파일(타 세션 작업 영역) — 이번 반영 범위에서 제외, 해당 세션에 전달 필요.
