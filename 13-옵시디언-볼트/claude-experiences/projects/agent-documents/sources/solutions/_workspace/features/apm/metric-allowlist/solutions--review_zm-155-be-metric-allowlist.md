# 검수 인계 — ZM-155 BE 메트릭 허용목록 확장 수단 1차

- 요청일 2026-10-13 · 워크트리 `C:\worktrees\zm-155-be` (브랜치 `ZM-155-be`, master `f99621e`) · **미커밋**(diff는 `git -C C:\worktrees\zm-155-be status`)
- 보고 [`./zm-155_be-metric-allowlist.md`](zm-155_be-metric-allowlist.md) · 계약 [`./contract_apm-metric-allowlist.md`](contract_apm-metric-allowlist.md) · 설계 §8 결정 Q1~Q9
- Flyway **V81**(다른 브랜치 V76~V80 점유)

## 1. 범위

관리자가 폐기 통계의 `NOT_ALLOWLISTED` 지표를 화면에서 여는 규칙(이름만·차원 없음) — 규칙 테이블, 수신 ③단계 분기(L5 접힘·L8 자동 정지·히스토그램 거절), 관리 API 6개, 폐기 표 힌트, 서비스별 조회 EP, 수집기 설정 기본값·설치 가이드 재생성 권고, `[APM-ALLOWLIST]` 감사 로그.

## 2. 의도(왜 이렇게)

- **정적 표는 건드리지 않는다** — `ApmMetricAllowlist.find()`는 정적이고 11곳이 읽는다. 커스텀은 `MetricIngestor` ③에서 `find()`가 **비었을 때만** 묻는 별도 빈(`ApmCustomMetricGate`).
- **같은 테이블(Q3)** — 롤업·보존·아카이브가 이름과 무관해 추가 코드 0(IT로 확인).
- **상한은 route 상한의 규칙 승계** — 밀어내기 금지, 1일 워밍, 접어서 저장(손실 아님).
- **등록 판정 함수 1개**(`ApmCustomMetricNamePolicy`)를 등록 API와 폐기 표 힌트가 공유 — 버튼과 서버 판정이 갈리지 않게.
- 새 협력자는 전부 `@Autowired(required=false)` 세터 — 기존 테스트 조립 무수정.

## 3. 버린 대안

| 대안 | 버린 이유 |
|---|---|
| 정적 `ApmMetricAllowlist`를 빈으로 바꿔 규칙 병합 | 11개 소비처(조회·롤업 라벨)까지 흔들림(설계 §4.5) |
| 접힘 대신 초과분 폐기 | 합계가 틀림(설계 §4.3) |
| L5·L8을 `apm_setting` 키로 | 1차엔 닿지 않는 상한, 화면 없음 — 상수 + 응답 `limits` |
| 자동 정지를 배치 트랜잭션 안에서 UPDATE | 배치 롤백 시 정지 판정 소실, 실패 시 정상 배치 503 위험 → 배치 뒤 finally에서 조건부 UPDATE |
| Redis 분산 락으로 L1 경합 | 설치형 금지 → PG advisory xact lock |
| 서버가 생성 yaml에 규칙 이름을 몰래 삽입 | "processors 생략 = 템플릿 그대로" 기존 계약 위반 → 기본값 EP로만 |

## 4. 🔴 중점 확인 요청

1. **기존 지표 경로 불변** — `MetricIngestor` diff가 `spec.isEmpty()` 블록 안과 파티션 준비 필터(`|| isActive`)에만 있는지. `MetricIngestorCustomMetricTest$BuiltinUnchanged`의 비교 방법(행 전 필드 문자열 펼침·`IngestStats` 재귀 비교)이 "바이트 단위"를 충분히 보장하는지. 파티션 준비에 커스텀 날짜가 섞이는 것이 기존 동작에 영향이 없는지.
2. **상한 경계** — L1(20) advisory lock 위치(정책 검사 뒤, 중복·관측·개수 검사 앞), L5 `SeriesSet` 워밍 쿼리(`metric in (규칙 이름)`, `limit 50`)와 트랜잭션 안 실패 재던짐, 접힘 시 차분 키를 **원래 이름**으로 쓰는지(`toCustomRow` → `valuesOf(raw)`).
3. **자동 정지 오탐** — `FoldWindow` 정의(>50% 초과·무트래픽 분 중립·≤50% 분 리셋·수신 시각 기준). 1차에선 L5에 사실상 닿지 않음(L1 20 < L5 50)을 인지한 상태에서, 규칙 삭제·재등록 반복 시 접힘이 생겨 정지까지 가는 경로가 의도대로인지. `applyRules`가 미기록 정지를 덮어 지키는지, 사람이 끈/지운 규칙은 조건부 UPDATE가 0행인지(IT).
4. **캐시 지연** — 다른 노드 최대 30초(Q9). 규칙을 바꾼 노드는 `afterCommit → invalidate` → 다음 배치. 스냅샷 조회 실패 시 이전 스냅샷 유지(최초 실패면 커스텀 없음)가 맞는지. `refreshIfStale`가 배치 트랜잭션 밖에서 불리는지(`MetricIngestPipeline`).
5. **히스토그램 거절** — `CUSTOM_KIND_UNSUPPORTED`가 손실로 세어지고(`lostPoints`) 상한을 소비하지 않는지. 폐기 사유 enum 추가가 FE·AI 쪽 사유 목록에 미치는 영향(FE i18n 필요).
6. **ZM-152 정합 판단** — 런타임 패밀리 접두 등록 거부(`RESERVED`)가 과한지, 그리고 그로 인한 `collector.custommetric → service.runtime.RuntimeSlotMap` 참조 1줄을 허용할지.
7. 수집 범위 밖 판단: 수집기 자기 메트릭(센티널 서비스)은 규칙과 이름이 같아도 커스텀으로 받지 않음.

## 5. 검증 상태

단위 신규 67/67 · APM·라이선스·OTel 회귀 2,257건 중 2건 실패(`ApmCollectorLiveRuntimeTest`, master 기준선에서도 같은 클래스 플래키 확인) · IT 28/28(skip 0). 런타임(:3000)·FE 미검증.

---

## 검수 결과(코덱스 v1) — 판정 "수정 후 재검수" → 2026-10-13 전부 반영, 재검수 요청

전문: [`review_zm-155-be-metric-allowlist_codex.md`](../../../_archive/features/apm/metric-allowlist/review_zm-155-be-metric-allowlist_codex.md) · 반영 상세: 보고서 §10

| | R | 등급 | 지적 | 반영 |
|---|---|---|---|---|
| [x] | R1 | 필수 | 규칙 조회 실패 시 fail-open | 마지막 성공 후 60초 넘으면 스냅샷 비움(fail-closed) + WARN 1회. 내장 지표 무영향 |
| [x] | R2 | 필수 | L5가 재기동·LRU·삭제 후 재등록으로 초기화 | V81에 `apm_custom_metric_admission` 원장, 서비스별 advisory xact lock 아래 원자적 50 검사, 자리 7일 유지 |
| [x] | R3 | 필수 | `foldWatch` 무제한 | 스냅샷 교체 때 정리 + 상한 10,000(`foldWatchOverflow`) + 1시간 만료 |
| [x] | R4 | 권장 | 지연된 정지가 resume·재등록을 다시 정지 | id·`updated_at` CAS, 버전 바뀐 미기록 판정 폐기 |
| [x] | R5 | 권장 | 노드 표본으로 전역 정지 | **정지 → 경고(WARN)로 낮춤**(저장 계속). 시계열 수는 R2 원장이 전역으로 묶음. 이유는 계약 §7·보고서 §10 |
| [x] | R6 | 권장 | 재등록 시 과거 데이터 섞임 | 조회가 규칙 `created_at` 칸 앞을 자름 |
| [x] | R7 | 권장 | GAUGE·SUM 혼합 | `value_kind` 첫 수신 CAS 확정, 불일치는 `CUSTOM_KIND_UNSUPPORTED` |
| [x] | R8 | 권장 | 128자 잘린 접두 통과 | 등록 최대 127자, 128자 `APM_CUSTOM_METRIC_NAME_TRUNCATED`, 폐기 표 `metricNameTruncated` |
| [x] | R9 | 권장 | 감사 로그 커밋 전 | 값 캡처 후 `afterCommit` |
| [x] | R10 | 권장 | 상한 테스트가 축소 경계뿐 | IT: 실제 50/51·재기동 복원·규칙 교체 우회 차단·7일 만료, 경고 CAS. 단위: 50/51·fail-closed·감시 정리 |

### 재검수 중점

1. `ApmCustomMetricGate.ServiceSeats` — DB 호출을 모니터 밖으로 뺀 분할이 경합(같은 이름 동시 첫 수신, 캐시 기록 순서)에서 안전한지.
2. 원장 판정이 배치 트랜잭션 안에 있는 것(롤백 시 자리도 롤백)과 트랜잭션 밖 경로(옛 `ingest()`)에서 advisory lock이 문장 단위로 풀리는 한계의 수용 여부.
3. R5를 "경고로 낮춤"으로 처리한 판단(필요하면 2차에서 전역 집계).
4. 128자 거절(R8)이 "원래 128자인 정상 이름"을 막는 대가의 수용 여부.

---

## 검수 결과(코덱스 v2) — 판정 "수정 후 재검수" → 2026-10-13 N1~N9 전부 반영, 재검수 요청

전문: [`review_zm-155-be-metric-allowlist-v2_codex.md`](../../../_archive/features/apm/metric-allowlist/review_zm-155-be-metric-allowlist-v2_codex.md) · 반영 상세: 보고서 §11

**R 판정(v2)**: R4·R5·R8·R9 닫힘 · R1→N1 · R2→N2·N3·N4·N9 · R3→N5(+만료 주기·엄격 상한) · R6→N6 · R7→N7 · R10→N2·N4 IT

| | N | 등급 | 지적 | 반영 |
|---|---|---|---|---|
| [x] | N1 | 필수 | 실패가 갱신 시각을 밀어 fail-closed가 ~90초 | 실패는 갱신 시각 불변, "마지막 성공 + 60초" 즉시 판정, 재시도 5초 |
| [x] | N2 | 필수 | 만료된 JVM 자리 캐시가 원장 우회 | 캐시는 60초 힌트, 만료 근접·touch 시점·처음 보는 이름은 원장 재판정. IT |
| [x] | N3 | 필수 | 이름마다 SQL 4~5개 | 배치 단위 `prepareBatch` — 서비스당 락·조회·다중 행 UPSERT ≤ 3, 캐시 유효 시 0. SQL 수 단언 |
| [x] | N4 | 필수 | 다중 서비스 배치의 락 순서 교착 | 서비스 ID 오름차순 락. 단위(순서)·IT(교차 순서 동시 실행) |
| [x] | N5 | 권장 | 버전 바뀐 규칙의 접힘 이력 유지 | 스냅샷 교체 때 버전 바뀐 이름의 감시 초기화 |
| [x] | N6 | 필수 | floor 칸에 이전 세대 값 | ceil(created_at) — 다음 완전한 칸부터 |
| [x] | N7 | 필수 | 재등록 전파 창의 kind 혼합 | 종류를 자리 원장(서비스×이름)으로 이동 — 규칙 세대와 무관하게 시계열 종류 고정 |
| [x] | N8 | 권장 | 예산이 WARN 제외 | enabled(ACTIVE+WARN) 기준 |
| [x] | N9 | 권장 | 원장 만료 행 영구 잔존 | `last_seen_at` 인덱스 + 보존 배치 `customMetricSeats` 단계. IT |

### 재검수 중점

1. N7을 "규칙 세대 CAS" 대신 **종류를 자리 원장에 두는** 설계로 푼 판단(시계열 = 서비스×이름).
2. `answerFromCache`의 신뢰 조건(60초 + 만료 여유 + touch 시점)이 N2를 닫는지.
3. N3에서 기동 preload를 넣지 않은 판단(배치가 서비스 단위로 한 번에 로드).
4. `prepareBatch`가 배치 트랜잭션 안에서 서비스 락을 커밋까지 쥐는 대가(같은 서비스의 새 이름 배치 직렬화).

---

## 검수 결과(코덱스 v3) — 판정 "수정 후 재검수" → 2026-10-13 전부 반영, 재검수 요청

전문: [`review_zm-155-be-metric-allowlist-v3_codex.md`](../../../_archive/features/apm/metric-allowlist/review_zm-155-be-metric-allowlist-v3_codex.md) · 반영 상세: 보고서 §12

**N 판정(v3)**: N1·N4·N5·N6·N8·N9 닫힘 · N2·N3·N7 부분 → 아래 반영

| | 항목 | 등급 | 지적 | 반영 |
|---|---|---|---|---|
| [x] | M1 | 필수 | 원장 결과가 커밋 전에 캐시 공개 | `afterCompletion(COMMITTED)`에서만 공개, 판정 시작·롤백 시 그 서비스 캐시 제거. IT(롤백 후 51번째 접힘) |
| [x] | M2 | 필수 | 다른 종류 포인트가 옛 자리 touch | 같은 세대·종류 일치일 때만 touch. 단위 |
| [x] | M3 | 권장 | 조회 EP가 만료 자리 종류 사용 | 살아 있는 자리 조건 통일(`SEAT_RETENTION` core 상수) |
| [x] | N2 | 부분 | 가득 찬 캐시의 다른 자리 유효성 미확인 + M1 | 가득 찬 캐시로 접는 판단은 모든 자리가 신뢰 범위일 때만 + 커밋 후 공개 |
| [x] | N3 | 부분 | 기동 preload 없음 | **의도적 편차**(아래) + 서비스 수 선형 단언(20×3=9) |
| [x] | N7 | 부분 | 옛 규칙 세대 저장 차단 미구현 | 자리에 `rule_id`, 새 세대 자리면 옛 스냅샷 저장 금지(NOT_ALLOWLISTED), 옛 세대 자리는 새 세대가 넘겨받음. 단위 2 + IT |

### N3 의도적 편차 — 기동 preload를 넣지 않는다

| 경우 | 원장 SQL | 근거 |
|---|---|---|
| 처음 보는 서비스(재기동·LRU 축출 포함), 배치 1회 | **3**(락 1 · 살아 있는 자리 조회 1 · 다중 행 UPSERT 1) | 단위 `batchUsesAtMostThreeStatements` |
| 같은 서비스, 캐시 60초 안 | **0** | 같은 테스트 |
| 캐시 만료 후 | 2(새 자리·touch 없음) ~ 3 | 같은 테스트 |
| 서비스 N개가 섞인 cold 배치 | **3N**(서비스 수에 선형, 이름 수와 무관) | 단위 `statementsLinearInServices`(규칙 20 × 서비스 3 = 9) |

preload를 하면 기동 때 **오지 않을 서비스까지** 원장을 읽고(서비스 512 LRU 밖은 어차피 다시 읽는다), 커밋 전 공개 금지(M1) 때문에 preload 결과도 결국 "커밋된 원장 스냅샷"으로만 쓸 수 있어 배치 경로와 같은 비용을 앞당길 뿐이다. 처음 보는 서비스 1회 3문장은 배치 트랜잭션 하나에 묶이므로 이를 받아들인다.

### 재검수 중점

1. `publishAfterCommit` — 판정 시작에 캐시를 비우는 것이 동시 배치(같은 서비스)의 캐시 적중률을 떨어뜨리는 대가(정확성 우선).
2. N7 세대 비교를 `rule_id` 크기(bigserial 단조 증가)로 하는 가정.
3. 재등록 시 새 세대가 종류를 새로 정하는 것(v1.2의 "종류 유지"에서 바뀜) — 조회는 ceil(created_at)로 세대를 분리한다.

---

## 검수 결과(코덱스 v4) — 판정 "수정 후 재검수" → 2026-10-13 P1 반영, 재검수 요청

전문: [`review_zm-155-be-metric-allowlist-v4_codex.md`](../../../_archive/features/apm/metric-allowlist/review_zm-155-be-metric-allowlist-v4_codex.md) · 반영 상세: 보고서 §13

**판정(v4)**: M1·M2·M3·N2·N3 닫힘 · N7 부분 → P1

| | 항목 | 등급 | 지적 | 반영 |
|---|---|---|---|---|
| [x] | P1 | 필수 | 옛 스냅샷 노드가 1세대 자리 캐시로 2세대 전환 뒤에도 저장 | 캐시 적중도 공유 락 아래 원장·규칙 조회로 세대 확인(규칙 테이블 지금 id까지 — 넘겨받기 전에도 차단), 세대 변화 시 자리 캐시 즉시 비움. 단위 2 + IT(실제 캐시를 가진 `oldNode`, 시간 경과 없이 재호출 → `NONE`, 수신 경로에서 `NOT_ALLOWLISTED`·저장 0) |

### N3 표 갱신(의도적 편차는 유지)

| 경우 | 원장 SQL |
|---|---|
| 처음 보는 서비스·캐시 만료 | 2~3(배타 락·조회·필요 시 UPSERT) |
| 캐시 적중(60초 안) | **2**(공유 락·세대 확인 조회) — v3의 0에서 바뀜, P1 정확성 대가 |
| 서비스 N개 cold | 3N(선형) |

### 재검수 중점

1. 공유/배타 advisory lock 혼용의 교착 안전성(같은 오름차순, 공유→배타 승격 없음).
2. `readLedger`의 `union all`(자리 행 + 자리 없는 이름의 규칙 행)이 "규칙 삭제 = NONE", "재등록 = NONE(옛 노드)"을 빠짐없이 덮는지.
3. 캐시 적중 비용 0 → 2문장 전환의 수용 여부.

**칸 정렬 확인(코디네이터 요청)**: 조회 EP의 `ceil(created_at)`·red-series 격자·1m 적재·5m/1h 롤업 모두 서버 기본 시간대 벽시계 기준(epoch 아님). 저장 버킷이 그 기준이라 BE는 유지하고, FE는 경계를 계산하지 말고 응답 `points[].ts`를 쓰도록 계약 §4에 명시.

## 검수 결과(코덱스 v5) — 2026-10-13

- 대상: v4 잔여 P1(옛 노드 캐시 세대 검사). 원문 `review_zm-155-be-metric-allowlist-v5_codex.md`.
- P1 닫힘(캐시 자리가 `ruleId` 보관·비교, 불일치 시 저장 차단, `rule_id` 증가 전제 확인). 새 결함 0. 왕복 5회(v1 10건 → v2 9건 → v3 6건 → v4 1건 → v5 승인).
- **판정: 승인.** 커밋은 사용자 승인 대기. 런타임 미실측(dev DB V81 미적용·다중 노드 미실측). 칸 정렬은 서버 시간대 기준(계약 §4).
