# 검수 인계 — APM 1m 적재 배치 UPSERT 데드락 제거

- **작성**: Claude, 2026-09-28
- **레포/브랜치**: `moveseye-be-spring` / `master` (미커밋)
- **관련 메모리**: [[apm-implementation-progress]], [[apm-collector-redaction-log-body]]

---

## 범위 (무엇을 바꿨나)

수신 15초 주기에 같은 1분·같은 파티션으로 **동시에** 들어온 두 OTLP 요청이 `apm_metric_1m` 배치 UPSERT에서 서로 반대 순서로 행 잠금을 잡아 **PostgreSQL `deadlock detected`** 로 한쪽이 죽던 문제를 제거했다.

**증상(2026-09-28 실측 로그)**:
```
ERROR ... APM OTLP 적재 실패(token=4): 저장 0행(포인트 166건)
Caused by: PessimisticLockingFailureException ... deadlock detected
  Where: while inserting index tuple (12601,5) in relation "apm_metric_1m_p20260923"
```
- 문제 행은 `otelcol_exporter_queue_capacity`(수집기 자기 텔레메트리, `service_id=0`) — 저차원 메트릭이 소수 행에 몰려 경합이 특히 잦다.
- 데이터 손실은 아니었다: `stored=0` → 503 → exporter 재전송(덧셈 UPSERT지만 저장 0이라 중복 가산 없음). 다만 ERROR 로그·재전송 낭비.

**변경 파일 (2건, +52줄, 신규 파일·마이그레이션 없음)**:
| 파일 | 변경 |
|---|---|
| `.../collector/ingest/store/ApmMetric1mStore.java` | `Comparator` import + `BATCH_LOCK_ORDER` 상수 신설 + `store()`에서 `batch.sort(BATCH_LOCK_ORDER)` 1줄 |
| `.../collector/ingest/store/ApmMetric1mStoreTest.java` | 정렬 순서 검증 테스트 `batchIsSortedByPkForDeterministicLockOrder` 추가 |

---

## 의도 (왜 이렇게 했나)

**핵심**: 모든 인스턴스·모든 트랜잭션이 **동일한 순서로 행 잠금을 획득**하면 교착의 전제(순환 대기)가 사라진다 → 교착 대신 잠깐 직렬화.

- `store()`의 `batch`는 원래 `LinkedHashMap` 도착 순서 그대로였다(정렬 없음, 예전 `ApmMetric1mStore.java:352`). 도착 순서는 요청마다 달라 두 배치가 같은 행 묶음을 반대로 잠글 수 있었다.
- 정렬 키 = PK 전순서 `(serviceId, instanceId, metric, dimsHash, bucketStart)`. **필드 순서는 PK 컬럼 순서와 무관하게 결정적이기만 하면 되고, 모든 프로세스가 같은 비교자를 쓰는 것이 요점**이다.
- `UPSERT`와 뒤따르는 `NULLIFY_HISTOGRAM`(`nullifyConflicted`)이 **같은 `batch` 리스트 순서**로 돌므로, `store()`에서 한 번 정렬하면 두 배치 경로의 교착이 함께 잡힌다.

**버린 대안**:
- ① 데드락 예외 캐치 후 재시도 — 근본 원인(순서 불일치)을 안 없애고 증상만 완화. 재시도 폭풍 여지.
- ② UPSERT를 행별 단건으로 쪼개기 — 처리량 급감(분당 1만 행 설계에 역행).
- ③ 격리수준/락 힌트 조정 — 과함. 정렬 한 줄로 충분.

---

## 중점 확인 요청 (스스로 불안한 지점)

1. **🔴 정렬만으로 데드락이 완전히 사라지는가.** 같은 트랜잭션(=한 배치) 안에서 모든 행을 정렬된 순서로 잠그므로 두 배치 간 순환은 불가능하다는 게 내 논리다. 다만 `boundsIdForFamily`가 배치 도중 `apm_hist_bounds`에 `INSERT ... ON CONFLICT`를 별도로 친다(다른 테이블) — 이 경로가 별도 락 순서를 만들어 교착에 낄 여지가 있는지 봐 달라. (내 판단: `store()` 안에서 UPSERT **이전**에 다 끝나므로 무관하지만 확신 못 함.)
2. **🔴 `NULLIFY_HISTOGRAM`도 안전한가.** 같은 정렬된 `batch`를 순회해 `conflicted`(부분집합, 상대 순서 보존)로 만든 뒤 별도 `batchUpdate`를 친다. 부분집합이라도 정렬 순서가 보존되니 안전하다고 봤는데 맞는지.
3. **🟡 정렬 비용.** 정상 배치 수백 행 규모 O(n log n) — 무시 가능하다고 봤다. 분당 1만 행 상한에서도 괜찮은지.
4. **🟡 `bucketStart`(LocalDateTime) `thenComparing`** — non-null 보장(PK 필드, `bind`가 null 체크 없이 씀)이라 NPE 없다고 봤다. 확인 바람.

---

## 검증 현황

**통과**:
- 컴파일: `:compileJava` (JDK17) 성공.
- 단위 테스트: `:test --tests ApmMetric1mStoreTest` 전건 통과. 신규 테스트가 도착 순서(inst-3→1→2)와 무관하게 정렬 순서(1→2→3)로 바인딩됨을 `InOrder`로 검증.

**런타임 검증(2026-09-29, DB 레벨 결정적 재현)**:
- BE 재기동 없이(당시 레포에 타 세션 미커밋 변경 존재) docker DB(5433)에 `apm_metric_1m`과 동일 복합 PK + 동일 `ON CONFLICT DO UPDATE` 임시 테이블로 두 커넥션 A/B 실험.
- 🔴 **반대 순서(A:X→Y, B:Y→X) → `deadlock detected` 재현** — 운영 로그와 동일 형태(`while inserting index tuple ... in relation`), 진 트랜잭션은 통째 ROLLBACK(= 운영의 `stored=0`→503).
- ✅ **같은 순서=정렬 → 데드락 없음, 둘 다 COMMIT**(각 count 2, 유실 0). 정렬이 교착을 없애고 직렬화만 함을 실증.
- 임시 테이블 DROP 정리 완료.

**앱 레벨 부하 시험(2026-09-29)**:
- 러닝 :3000 BE에 임시 ingest 토큰 심고, `service.name=otelcol-contrib` 자기텔레메트리 14메트릭을 **정방향/역방향 순서로 동시 POST**(반대순서 잠금 유도). 600요청(300쌍, conc=6) → **200×589 · 429×11 · 503(데드락) 0건.** (429=admission 상한 정상 백프레셔.)
- ⚠️ 러닝 BE가 admission(429)을 도는 것으로 보아 ZM-122 회복력(내 fix의 후손) 포함 = **이미 fix된 빌드**라 앱 레벨 pre-fix 재현은 불가 → 그 몫은 위 DB 레벨 결정적 재현이 대신 증명.
- 테스트 데이터·토큰 전부 정리 완료(잔여 0).

**검증 못 함(잔여)**:
- 🟡 앱 레벨 **pre-fix** 재현(정렬 제거 빌드로 동일 부하)은 러닝 BE 교체가 필요해 미실시 — DB 레벨 결정적 재현으로 갈음.

---

## 검수 결과 (Codex, gpt-5.6-sol high, 2026-09-28)

> ⚠️ Codex 샌드박스가 프로세스를 못 띄워(`helper_unknown_error: setup refresh had errors`) 1차 검수는 "판정 보류". diff + 관련 미변경 코드(store 흐름·resolveBounds·boundsIdForFamily·nullifyConflicted·PkKey)를 **인라인 번들**로 재첨부해 2차 검수 완료.

**핵심 4항목 전부 🟢** — 최종 판정: **승인**

1. 🟢 정렬만으로 데드락 제거 성립(PK 5필드 전순서 → 겹치는 행 같은 순서 잠금). 🟢 `apm_hist_bounds` SELECT/INSERT는 merge 루프에서 UPSERT **이전**에 끝나고 별도 테이블 개별 autocommit이라 잠금 순서에 끼지 않음.
2. 🟢 `NULLIFY_HISTOGRAM`은 정렬된 batch의 부분수열이라 순서 보존 → 안전.
3. 🟢 비용 O(n log n)(병합 후 고유 PK만), String/LocalDateTime 자연 순서는 JVM 간 동일·DB collation 무관.
4. 🟢 제시 경로에서 NPE 없음(PK 5필드 non-null).

**🟡 지적 2건 (승인 차단 아님) — 처리:**

- [x] 🟡 **주석 범위** ("모든 데드락"으로 오해될 여지) → store() 라인 주석을 **"이 경로의 동시 배치 UPSERT 잠금 순서를 통일한다"** 로 좁힘. (반영 완료)
- [x] 🟡 **테스트 검출 범위** (instanceId 단일 축만 확인) → 테스트 2건 추가: `serviceIdIsPrimarySortKey`(serviceId 최우선), `sortFallsThroughAllPkFields`(metric→dimsHash→bucketStart 폴백 tie-break 전부 검증). `--rerun-tasks` 전건 통과. (반영 완료)
  - Codex가 추가 권장한 나머지 2건은 **기존 테스트로 이미 커버**되어 미추가:
    - NULLIFY bind 순서 → 같은 정렬 batch에서 파생(로직상 자명) + `conflictedRowIsNullifiedAfterUpsert`가 NULLIFY 경로 존재를 검증.
    - merge 유지(같은 PK 1행) → 기존 `mergesSamePkInBatch`가 검증.
  - 🟡 NPE 방어 경계(향후 nullable Row) 추가는 **범위 밖**으로 판단해 미반영 — PK/conflict key라 null이면 정렬 이전에 UPSERT가 이미 실패하며, 방어를 넣는다면 `Row` 생성/`store()` 진입 지점 거부가 맞다(별도 과제).

**결론**: 승인 + 🟡 2건 반영 완료. 커밋 진행 가능.
