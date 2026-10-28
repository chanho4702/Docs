# 검수 요청 — ZM-159 독립 결함 4건 (T-A · X1 · X6 · X2+N2)

- 요청: Claude · 2026-09-17 · 사용자 "ㅇㅋㅇㅋ"(결함 4건 먼저 진행)
- BE 워크트리 `C:/worktrees/zm-159-be`(브랜치 `ZM-159`, HEAD `8e289d9` = master) · FE 워크트리 `C:/worktrees/zm-159-fe`(브랜치 `ZM-159`, master `4e4062f` 기준) — **양쪽 미커밋 변경 전부가 이번 범위**
- 근거: `_workspace/features/infra/scale-call-guard/audit_scale-5000-hosts.md`(X1·X2·X6), `_workspace/features/infra/scale-call-guard/tickets_scale-hardening.md`(T-A), 설계 §0.8 수용 기준("T-A 수집 중단/라이선스 차단 중 cleanup 무삭제 · X1 동시 요청 3개 교착 재현→해소 · X2 범례 토글 · N2 timestamp 결합 SUM · X6 101/200/201개 분할")

## 범위
| 결함 | 수정 | 파일 |
|---|---|---|
| **T-A 알람 좀비 삭제** | 티켓의 A-1(응급)만. `problem.get` 결과가 상한(1만)에 닿은 회차는 **되짚기(reconcileResolved) 생략**(보정·증분 모두). 미해소 좀비 삭제(`deleteStaleUnresolvedBefore`)는 **연속 완전 보정 3회 이상 + 마지막 완전 보정 15분 이내**일 때만 — 재기동 직후·Zabbix 장애·라이선스 차단(정리 배치는 계속 돎) 중에는 삭제하지 않음. 해소 30일 정리는 그대로 | `event/EventSyncService` |
| **X1 구성 현황 교착** | `OverviewCallExecutor`에 섹션 풀 분리(`parallelSections`) — 통합 화면의 섹션 6개는 섹션 풀, 섹션 안 count 콜은 콜 풀. 같은 풀 스레드에서 중첩 호출하면 직렬 실행. 대기에 60초 기한(초과 = 실패 → degraded) | `zabbixadmin/overview/OverviewCallExecutor`, `ZabbixOverviewService` |
| **X6 EC2 100대** | `DescribeInstanceStatus` 명시 ID를 100개씩 분할(정적 헬퍼로 빼서 목 클라이언트로 테스트) | `aws/client/AwsReadOnlyGateway` |
| **N2 SUM** | 인덱스 합 → 첫 시리즈 각 시각에 **가장 가까운** 둘째 시리즈 점(허용 = 둘째 간격 아래쪽 중앙값의 절반, 없으면 0). 둘째 시리즈는 인덱스가 아니라 (둘째 타입, 첫 인터페이스)로 찾음 | `host/network/NetworkService` |
| **X2 차트 섞임(FE)** | 증분 병합 키 `type` → `[type, iface]`. 범례 항목을 시리즈 이름(`type - iface`)과 같게 — 종전엔 type만 넣어 범례 중복·토글 불가 | FE `hooks/chart/incrementalChartData.ts`, `hooks/chart/useHandelChartAction.ts` |

## 테스트
- T-A: `EventSyncServiceTest` 신규 4건 + 기존 정리 테스트는 보정 3회 후 호출로 수정.
- X1: `OverviewCallExecutorTest`(신규) — 관리자 3명 × 섹션 6 × 중첩 콜이 끝나는지, 콜 풀 안 중첩이 직렬로 도는지, 실패 보고. **변이 검사**: 섹션 풀 분리와 중첩 직렬화를 둘 다 끄면 두 교착 테스트가 시간 초과로 실패함을 확인(`@Timeout` SEPARATE_THREAD).
- X6: `AwsReadOnlyGatewayInstanceStatusTest` 1/100/101/200/201.
- N2: `NetworkServiceTest` 신규 2건(어긋난 시각·빈 구간, 같은 인터페이스 짝).
- X2: `incrementalChartData.test.ts` 신규 1건(변이 검사 — type만 키로 되돌리면 실패). FE 차트 관련 jest 62 스위트/683 통과, tsc·eslint 통과.

## 중점 확인 요청
1. T-A: 완전성 판정(`size < 1만`)과 카운터 갱신 위치가 맞는가 — 예외 경로, 증분 회차가 카운터에 영향을 주지 않는 것, 다중 인스턴스(스케줄러가 인스턴스마다 도는 경우) 영향. "15분 이내" 기준이 정리 배치(기본 매일 00:00) 시점과 충돌하지 않는가(보정 주기 5분).
2. X1: 다른 교착 경로가 남았는가(예: `templates()`/`items()` 캐시 로딩이 다른 락을 잡는지, 도메인별 단독 엔드포인트). `future.cancel(true)`가 실제 실행을 멈추지 못해 시간 초과 작업이 콜 풀 칸을 계속 차지하는 영향.
3. N2: 허용 간격 규칙이 trends(시간 버킷) 경로·단일 점·중복 시각에서 안전한가. 짝이 없을 때 0을 더하는 기존 규칙 유지가 맞는가.
4. X2: 범례 이름 변경이 다른 차트(인터페이스 없는 차트, type이 빈 시리즈 — 이름이 ""→"VALUE"로 바뀜)에 영향을 주는가. 툴팁·내보내기·드릴다운이 시리즈 이름에 기대는 곳.
5. X6: 중복 ID 제거가 호출자 기대(결과 순서·개수)와 맞는가.

## 출력 형식
- 발견마다 `R번호 · 심각도(필수/권장/참고) · 파일:줄 · 문제 · 재현/근거 · 제안`. 확인 못 한 것은 "추정".

---

## 반영 기록 (2026-09-17, 코덱스 gpt-5.6-sol high → `review_zm-159-defects_codex.md`)
| 번호 | 판정 | 반영 |
|---|---|---|
| R1 필수 | 수용 | 미해소 좀비 삭제를 **정리 배치에서 보정 사이클 안으로 이동**(`cleanupStaleUnresolvedIfHealthy`, 1시간에 한 번) — 판정 상태를 가진 인스턴스가 직접 지우므로 인스턴스 간 공유가 필요 없다. 정리 배치는 해소 30일분만. `recordCompleteFullSync`가 앞선 완전 보정과 15분 넘게 떨어져 있으면 연속을 1부터 다시 센다. `deleteStaleUnresolvedBefore` 반환형 int(삭제 수 로그). 테스트: 3회째 삭제·1시간 내 재삭제 없음·중단 후 재개 시 불허 |
| R2 필수 | 수용 | SUM 둘째 시리즈를 epoch별로 먼저 합침(같은 초는 나중 표본), 허용 간격은 고유 시각의 양수 간격만으로. 테스트: 5초에 중복 3개 |
| R3 권장 | 수용 | `CompletableFuture` → `ExecutorService.submit`의 `Future` — 기한 초과 시 `cancel(true)`가 실행 스레드를 인터럽트. 테스트: 6칸을 막은 작업이 200ms 기한 후 인터럽트되고 다음 요청이 실행됨 |
