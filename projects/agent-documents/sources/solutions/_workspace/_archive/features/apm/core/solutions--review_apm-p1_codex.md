요약: 🔴 수신 본문 8MB 제한이 `byte[]` 역직렬화 뒤에 적용되어, 큰 요청의 메모리 점유를 막지 못합니다.  
요약: 🟡 Zabbix 기존 호스트·아이템을 소유 태그 없이 재사용할 수 있고, 액션 진단은 `owner` 태그명만 보고 오탐할 수 있습니다.  
요약: 그 외 OTLP 상태코드, 차분·롤업, 라이선스 게이팅, 조회·FE `step`/URL 상태는 요청 계약과 대체로 일치합니다. 테스트는 요청대로 실행하지 않았습니다.

| # | 심각도(🔴/🟡/🟢) | 파일:라인 | 문제 | 왜 문제인가 | 권고 |
|---|---|---|---|---|---|
| 1 | 🔴 | `moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/ApmOtlpController.java:135,197-205` | `@RequestBody byte[]`가 본문 전체를 메모리로 읽은 뒤에야 8MB를 검사한다. | 압축 해제 후 상한은 지키지만, 압축되지 않은 대형 본문이나 대형 gzip 원문은 컨트롤러 진입 전에 힙을 점유한다. “8MB 압축 폭탄 방어”가 요청 수신 경계의 하드 리밋이 아니다. | `Content-Length`를 먼저 거부하고, 서버 request-size 제한을 8MB로 설정하거나 `InputStream` 스트리밍·상한 복사 방식으로 변경하라. |
| 2 | 🟡 | `moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:198-204,242-249` | 이름·키만 같은 기존 Zabbix 호스트/아이템을 소유 태그 확인 없이 재사용한다. | 고객이 만든 동명 `MovesEye APM` 호스트 또는 동명 key가 있으면 APM 값이 고객 객체로 push될 수 있다. 삭제는 안전해도 데이터 정합성과 소유 경계가 깨진다. | 기존 객체를 찾을 때 `owner=moveseye-apm` 태그까지 검증하고, 미소유 동명 객체면 오류로 표시하거나 별도 충돌 처리하라. |
| 3 | 🟡 | `moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:651-657` | 액션 진단이 event-tag 조건의 태그명 `owner`만 확인한다. | `owner=다른값` 조건도 APM 액션으로 집계될 수 있어 “알림 액션 있음” 배지가 거짓 양성이 된다. | Zabbix 응답의 태그값 필드까지 확인하여 `owner=moveseye-apm`인 조건만 집계하라. |
| 4 | 🟢 | `moveseye-be-spring/logs/` | 런타임 로그 디렉터리가 미추적 상태다. | 기능 소스와 무관한 산출물이 커밋에 섞일 위험이 있다. | 커밋 대상에서 제외하고 `.gitignore` 적용 여부를 확인하라. |

### §3 불안한 지점 16건 판정

| # | 판정 | 근거 |
|---|---|---|
| 1 | 허용 | `MetricIngestor`는 저장 0행인 장애만 `ApmIngestUnavailableException`으로 올려 503 처리하고, 일부 저장 뒤 장애는 덧셈 UPSERT 재전송 중복을 피하려 200+WARN으로 처리한다. |
| 2 | 허용 | 카운터 적재는 `count=Math.round(delta.sum)`, `sum=delta.sum`으로 분리하며, 구현 주석과 계약 모두 `sum`을 정본으로 둔다. |
| 3 | 허용 | CUMULATIVE 히스토그램의 min/max를 차분하지 않고 그대로 저장한다. 이는 시리즈 전체 범위라는 한계를 코드 주석으로 명시한 설계상 제약이다. |
| 4 | 허용 | 첫 CUMULATIVE 관측은 startTime 기준 120초 이내만 전체값을 수용하고, 그 외는 `CUMULATIVE_FIRST_SKIPPED`으로 폐기하면서 상태는 기억한다. |
| 5 | 허용 | `ApmPercentiles.SAMPLE_WARNING_THRESHOLD=20`이며 p50/p95/p99과 함께 `sampleWarning`을 계산한다. |
| 6 | 허용 | 가용성은 5m 롤업 대신 `apm_metric_1m`을 직접 읽어 최근 롤업 LAG 구간을 STALE로 오판하지 않는다. |
| 7 | 허용 | 프로비저닝·push 부분 실패는 binding 오류와 WARN 요약으로 남기고, 전량 프로비저닝 실패만 Scheduler 실패로 전환한다. |
| 8 | 허용 | 가용성 분모는 `firstSeenAt` 이후 칸만 세며, 수집기 무수신 구간은 STALE 대신 UNKNOWN으로 분리한다. |
| 9 | 허용 | route 집합은 서비스별로 워밍 후 상한에 도달하면 새 route만 `__other__`로 접고 기존 route를 축출하지 않는다. |
| 10 | 허용(제약 명시) | 서비스별 token 축 부재는 `ApmStatusJudge`에 전역 수집기 판정 한계로 명시되어 있다. 여러 collector 중 하나만 끊긴 경우 STALE이 될 수 있는 설계상 한계다. |
| 11 | 허용 | `FeatureInterceptor`는 메서드 `@LicenseExempt`를 우선 통과시키고, A3은 앱 내부 Repository만 대상으로 좁혔으며 A5-c는 허용 OTLP 클래스의 면제 메서드를 전수 검사한다. |
| 12 | 허용 | `OtlpMetricsParser`의 공용 패키지 위치는 `CLAUDE.md`와 `OtelArchitectureTest`의 방향 규칙으로 제한되고, APM은 `OtlpMetricsReader`를 사용한다. |
| 13 | 허용 | `apmEpochMs()`의 초→ms 보정, URL 기반 시간/탭 상태, `GlobalSearch`의 `userRoleAdminOnly` 필터, null RPS 표시 규칙을 확인했다. |
| 14 | 허용 | 알람 규칙·이력·Zabbix 상태 API와 FE 화면은 관리자 축을 `AdminAccessChecker`/`useIsUserRoleAdmin`으로 사용하고, 이벤트 표시는 `thresholdUnit`을 사용한다. |
| 15 | 보류 | `drops.count`의 누적·`lastSeenAt` 필터 규약 및 config의 `no-store`/raw-SQL WARN은 코드상 반영됐다. 다만 생성 YAML의 실제 Collector 기동은 요청서에도 미검증으로 남아 있다. |
| 16 | 보류 | APM 테스트 파일은 추가되어 있으나, 요청 조건에 따라 실제 실행하지 않았으므로 기존 워크스페이스 하위 영향과 테스트 고정력은 실행 근거 없이 확정할 수 없다. |

### 커밋 전 반드시 고쳐야 할 것

- [ ] OTLP 수신의 요청 본문 크기를 컨트롤러 진입 전/스트리밍 단계에서 8MB로 제한한다.
- [ ] Zabbix 호스트·아이템 재사용 시 `owner=moveseye-apm` 소유 태그를 검증하고, 미소유 동명 객체를 사용하지 않는다.
- [ ] Zabbix 액션 진단에서 `owner` 태그명뿐 아니라 값 `moveseye-apm`까지 대조한다.
- [ ] 미추적 `logs/`가 커밋에 포함되지 않게 정리한다.
