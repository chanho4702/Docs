---
tags: [moveseye, apm, backend, postgres, deadlock]
updated: 2026-09-28
---

# APM 1m 배치 UPSERT 동시 데드락 제거 (2026-09-28)

## 무슨 일이 있었나

사용자가 BE 로그의 ERROR를 붙여 "왜 이런거?"라고 물음. APM OTLP 메트릭 수신에서 `PessimisticLockingFailureException ... deadlock detected` — `apm_metric_1m_p20260923` 파티션의 인덱스 튜플 삽입 중.

- 두 수신 요청(`nio-3000-exec-4`, `-6`)이 동시에 같은 1분·같은 파티션에 배치 UPSERT를 치다가 서로 반대 순서로 행을 잠가 교착.
- 문제 행은 `otelcol_exporter_queue_capacity`(수집기 자기 텔레메트리, `service_id=0`). 저차원 메트릭이 소수 행에 몰려 경합이 특히 잦다.
- **데이터 손실은 아니었다**: `MetricIngestor`가 `stored=0`일 때 `ApmIngestUnavailableException` → 503 → exporter 재전송. 덧셈 UPSERT지만 저장 0이라 중복 가산 없음. ERROR 로그·재전송 낭비만.

## 진단

`ApmMetric1mStore.store()`(`.../collector/ingest/store/`)가 `LinkedHashMap` 병합 후 배치를 **도착 순서 그대로**(정렬 없음) `jdbc.batchUpdate(UPSERT, ...)`로 보냈다. 한 배치=한 트랜잭션이라 배치 안 행 순서대로 잠금을 획득하는데, 요청마다 순서가 달라 순환 대기가 났다. 기존 병합 로직은 "같은 배치가 DB 왕복으로 자기 자신과 경합"만 막았고 **요청 간 순서**는 보장하지 않았다.

## 수정

UPSERT 직전 `batch.sort(BATCH_LOCK_ORDER)` 1줄. 정렬 키 = PK 전순서 `(serviceId, instanceId, metric, dimsHash, bucketStart)`. 모든 인스턴스·트랜잭션이 같은 순서로 잠그면 교착 대신 직렬화. 같은 `batch` 리스트를 순회하는 `nullifyConflicted`의 `NULLIFY_HISTOGRAM` 배치까지 순서 통일되어 두 경로 교착이 함께 잡힘.

- 변경 2파일 +52줄, 신규 파일·Flyway 마이그레이션 없음.
- 테스트 `ApmMetric1mStoreTest.batchIsSortedByPkForDeterministicLockOrder`: 도착 순서(inst-3→1→2)와 무관하게 정렬 순서(1→2→3)로 바인딩됨을 `InOrder`로 검증.
- `:compileJava`·`:test --tests ApmMetric1mStoreTest` 통과(JDK17).

## 버린 대안

- 데드락 캐치 후 재시도(증상만 완화·재시도 폭풍), 단건 UPSERT(처리량 급감), 격리수준 조정(과함).

## 상태 / 열린 것

- ✅ 커밋 `ad57ea5`(#ZM-122, master **미푸시**). Codex(gpt-5.6-sol high) 검수 **승인** — 핵심 4항목(정렬 유효성·bounds INSERT 무관·NULLIFY 안전·NPE 없음) 전부 🟢, 🟡 2건(주석 범위 좁힘·테스트 축 보강) 반영. 테스트 3건으로 확대(instanceId·serviceId 최우선·5필드 폴백).
- ✅ **런타임 검증(09-29, DB 레벨 결정적 재현)** — BE 재기동 없이(당시 타 세션 미커밋 존재) docker DB(5433)에 apm_metric_1m 동일 PK+동일 UPSERT 임시 테이블로 두 커넥션 A/B. 반대 순서=`deadlock detected` 재현(운영 로그와 동일, 진 트랜잭션 통째 ROLLBACK), 같은 순서=정렬=데드락 없음·둘 다 커밋(유실 0). 정렬이 교착을 없애고 직렬화만 함을 실증. 임시 테이블 정리 완료.
- ✅ **앱 레벨 부하 시험(09-29)** — 러닝 :3000 BE에 임시 ingest 토큰 + `otelcol-contrib` 자기텔레메트리 14메트릭을 정방향/역방향 동시 POST 600건 → 200×589·429×11·**503(데드락) 0건**. 러닝 BE가 admission(429)을 도는 걸로 봐 이미 fix 포함 빌드라 앱 레벨 pre-fix는 못 봄(DB 레벨이 대신 증명). 테스트 데이터·토큰 정리 완료.
- 교훈: OTLP 자기텔레메트리 저장 조건=resource service.name이 otelcol/otelcol- 접두 → service_id=0. 토큰은 apm_receive_token에 bare sha256(평문) 심으면 됨(kind=COLLECTOR·scope=ingest). 한글 라벨은 psql -c에서 cp949로 깨짐 → ASCII.
- 🔴 **Codex 샌드박스가 프로세스를 못 띄웠다**(`helper_unknown_error: setup refresh had errors`) — `git diff`·파일 읽기 전부 실패해 1차 판정 보류. **diff + 관련 미변경 코드(store 흐름·resolveBounds·boundsIdForFamily·nullifyConflicted·PkKey)를 인라인 번들로 재첨부**하고 "명령 실행 금지"를 명시하니 2차에서 정상 검수. 교훈: 코덱스 샌드박스 오류 시 근거를 본문에 첨부.

## 교훈

동시 배치 UPSERT는 conflict 키로 정렬해 잠금 순서를 통일하는 게 근본 해결 — 재사용 노트 [[concurrent-upsert-lock-order]]. 관련 [[2026-09-02-apm-p2-traces]], [[2026-08-31-apm-p1-implementation]].
