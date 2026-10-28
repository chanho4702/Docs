## N1~N9 반영 판정

| N# | 닫힘/부분/미반영 | 근거(파일:줄) |
|---|---|---|
| N1 | 닫힘 | `ApmCustomMetricGate.java:391-425,430-441` — 실패 시 `loadedAtMs`를 갱신하지 않고 마지막 성공 후 정확히 60초 초과 시 닫으며, 재시도는 별도 5초 간격이다. `ApmCustomMetricGateTest.java:341-380`에서 주입 시계로 60초/60.001초와 재시도를 검증한다. |
| N2 | 부분 | `ApmCustomMetricGate.java:267-291` — 캐시 TTL 1분은 원장 7일보다 충분히 짧고, 빈 자리가 있으면 신규 이름을 DB로 보낸다. 그러나 캐시가 가득 찬 경우 캐시의 다른 자리들이 아직 유효한지 확인하지 않고 신규 이름을 접으며, `ApmCustomMetricIT.java:176-193`도 TTL을 완전히 지난 뒤에만 원장을 재확인한다. 또한 커밋 전 캐시 공개 결함(M1)이 남았다. |
| N3 | 부분 | `ApmCustomMetricGate.java:299-358` — 서비스당 락·조회·다중 행 `ON CONFLICT`로 최대 3문장이다. `ApmCustomMetricGateTest.java:152-176`이 3문장/캐시 재사용을 단언한다. 다만 `MetricIngestPipeline.java:71-75,182-189`처럼 첫 수신에서만 규칙을 읽으며 기동 preload는 없다. |
| N4 | 닫힘 | `ApmCustomMetricGate.java:251-258`에서 `TreeMap`으로 서비스 ID를 정렬한다. `ApmCustomMetricGateTest.java:179-195`가 락 순서를, `ApmCustomMetricIT.java:203-238`이 역순 입력 동시 배치를 검증한다. 서비스별 트랜잭션 분리는 하지 않아 DB 배치 원자성은 유지된다. |
| N5 | 닫힘 | `ApmCustomMetricGate.java:455-481,492-498` — 규칙 `id·updated_at` 변경 및 경고 해제 시 `foldWatch`, 버전, pending warning을 초기화한다. `ApmCustomMetricGateTest.java:277-289`에 버전 변경 초기화 검증이 있다. |
| N6 | 닫힘 | `ApmCustomMetricSeriesService.java:67-79,88-92` — `ceil(created_at, step)` 이전 칸을 제거하고 경계와 정확히 일치할 때만 해당 칸을 포함한다. `ApmCustomMetricSeriesServiceTest.java:123-147`이 지난 세대 칸 제거를 검증한다. |
| N7 | 부분 | `V81__apm_custom_metric_rule.sql:31-40`과 `ApmCustomMetricGate.java:338-358`에는 규칙 ID·버전이 없고, CAS도 세대가 아니라 자리 만료 여부만 본다. `(service_id, metric_name)` 원장으로 종류 혼합 자체는 막았지만, 요구된 옛 규칙 세대 폐기는 구현되지 않았고 잘못된 종류가 기존 자리를 계속 갱신하는 결함(M2)이 있다. |
| N8 | 닫힘 | `ApmCustomMetricRuleService.java:79-87,133-150` — `isEnabled()` 기준으로 ACTIVE+WARN을 세고 DISABLED를 제외한다. `ApmCustomMetricRuleServiceTest.java:218-233`이 3개 enabled 규칙 예산을 검증한다. |
| N9 | 닫힘 | `V81__apm_custom_metric_rule.sql:43-45`에 `last_seen_at` 인덱스가 있고, `ApmRetentionService.java:74-87`이 전역 삭제하며 `ApmRetentionJob.java:150-155`가 독립 단계로 호출한다. 기존 보존 삭제 범위는 변경하지 않고 새 테이블만 추가로 삭제한다. |

## 새 결함

- M1 · 필수 · `ApmCustomMetricGate.java:336-364`, `ApmMetricBatchWriter.java:27-37`, `MetricIngestor.java:172-188` · 원장 UPSERT 결과가 배치 커밋 전에 JVM 캐시에 공개된다 · 이후 적재 실패로 트랜잭션이 롤백되어도 캐시는 최대 60초 동안 해당 자리를 `STORE`로 승인한다. 다른 노드는 DB에서 별도 50석을 배정할 수 있어 서비스당 실제 시계열이 상한을 넘을 수 있다 · 현재 배치의 판정에는 지역 `Admissions`만 쓰고, 공유 `seatCache`는 `afterCommit`에서만 게시하며 rollback 시 게시하지 않는 IT를 추가한다.

- M2 · 필수 · `ApmCustomMetricGate.java:209-217,323-329,350-358` · 종류가 다른 폐기 포인트도 기존 자리의 `last_seen_at`을 갱신한다 · 원장 종류와 관측 종류 비교 전에 touch를 예약하고, 실제 종류 불일치는 나중에 `KIND_UNSUPPORTED`로 버린다. 재등록된 새 세대가 다른 종류를 보내면 옛 종류 자리가 영구히 만료되지 않을 수 있다 · admission CAS에 규칙 ID·버전을 포함해 옛 세대 갱신을 거부하고, 최소한 종류 불일치 포인트는 touch하지 않도록 한다.

- M3 · 권장 · `ApmCustomMetricSeriesService.java:95-108` · 시계열 조회의 자리 종류 질의가 만료된 admission 행까지 사용한다 · 규칙 목록 요약은 살아 있는 자리만 보지만 시계열 API는 보존 배치가 실행될 때까지 만료된 종류를 반환해 두 API가 불일치한다 · `last_seen_at >= now-ADMISSION_WINDOW` 조건을 추가하고, 만료된 경우 저장 행 추론으로 내려가는 테스트를 추가한다.

## 판정

수정 후 재검수

이유 1: 롤백된 자리 캐시가 DB 원장을 우회해 실제 카디널리티 상한을 깨뜨릴 수 있는 필수 결함이 있다.  
이유 2: N3의 기동 preload와 N7의 규칙 세대 CAS가 구현되지 않았고, 종류 불일치 포인트가 옛 자리를 영구 갱신한다.

확인하지 못한 것:

- 요청에 따라 빌드와 테스트는 실행하지 않았다.
- 실제 PostgreSQL의 lock wait·교착 타이밍과 쿼리 실행 계획은 측정하지 않았다.
- 운영 부하에서 첫 cold 배치 지연 및 다중 서비스 배치 처리량은 측정하지 않았다.