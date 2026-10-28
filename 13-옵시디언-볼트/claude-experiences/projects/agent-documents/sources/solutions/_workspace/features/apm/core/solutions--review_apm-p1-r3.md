# 검수 요청 — APM P1 3차: 주석 작업이 드러낸 결함 8건 수정 (2026-09-01)

> 코덱스 검수용(COLLAB.md §8). 기준 커밋 BE `ee8ad09`(메뉴→기능 세트 재구성·프로퍼티화·상세 주석) 이후 **미커밋 증분**만. 1·2차 검수는 `review_apm-p1*.md`·`review_apm-p1-r2*.md`에 반영 완료.

## 1. 배경
`ee8ad09`의 상세 주석 작업(145파일)이 코드를 전수 읽으면서 결함 후보 8건을 냈고, 이번 라운드가 전부 "사실"로 판정·수정했다. 전체 `:test` **2123 green**(2101 → +22, IT 포함 skip 0). 분석 문서 `./apm-p1-logic-analysis.md` §12.1 **A22~A29**(A21은 선점돼 한 칸 밀림).

## 2. 수정 표 (새 패키지 경로)
| # | 라벨 | 문제 | 수정 | 위치 |
|---|---|---|---|---|
| 1 | A22 | 화면 "적용 규칙"(`forService`)은 꺼진 서비스별 규칙도 전역 덮개로 침, 배치(`targetsOf`)는 활성만 → 화면≠감시 대상 | 두 판정을 한 문장으로 통일(활성 서비스별만 덮개), DTO에 `effective`·`appliedRuleUid` 신설. 🔴 `GET /apm/services/{uid}/alert-rules`에 같은 kind 두 줄 가능 → FE는 `ruleUid` 키 | `premium/apm/alert/rule/ApmAlertService` |
| 2 | A23 | 개요 `recentAlerts[].kind`가 DB 원문 | `ApmAlertKinds.toWire` + `thresholdUnit` 동봉, 표본 `overview.json` 갱신 | `overview/ApmOverviewQueryService` |
| 3 | A24 | `CanonicalBounds.familyFor`가 단위 무시 → 초 단위 풀 메트릭이 ms 축 | `familyFor(name, unit)` + `pool_s` 패밀리 | `otel/histogram/CanonicalBounds`, `collector/ingest/store/ApmMetric1mStore` |
| 4 | A25 | AI `ReceiveTokenService.hash()`(71자 접두)와 APM `sha256Hex`(64자) 형식 불일치 | APM 내부는 발급·대조 모두 `sha256Hex`라 **실사용 결함 아님**. `matches`가 두 형식 수용 + `hashBare` 신설(형식 통일·컬럼 확장은 하지 않음) | `otel/token/ReceiveTokenService`, `collector/token/ApmReceiveTokenService` |
| 5 | A26 | drops에 `to`만 주면 조용히 최근 1시간 | 두 경계 독립 처리, 계약 §8 명시 | `collector/drops/ApmIngestDropQueryService` |
| 6 | A27 | 서비스 삭제 시 등록 캐시 미무효화(최대 10분) | `afterCommit`에 `ApmRegistrar.clearCache()` | `service/list/ApmServiceQueryService` |
| 7 | A28 | `ApmAvailabilityService.series`만 보존 승격 없음 → 7일 밖 창 전부 STALE/UNKNOWN | 승격 + 1m 꼬리 덧대기, 답할 수 없는 칸은 `status` **키 생략**(UNKNOWN과 다른 뜻) | `service/status/ApmAvailabilityService` |
| 8 | A29 | 설정 `update`가 트랜잭션 안에서 미커밋 값으로 캐시 재적재 | `afterCommit` 이동 + 응답은 DB 행에서 | `core/setting/ApmSettingService` |

## 3. 🔴 불안한 지점(검수 우선)
1. A28의 `coarse` 규칙이 요청 `step<60`에도 걸려 전 칸 `status` 없음 — FE는 `step=300`만 쓴다는 전제. 승격 시 `serviceCells`(DEGRADED 판정)도 상위 단으로 읽는데 5분보다 굵은 단의 DEGRADED가 칸에 붙는 조합은 런타임 미검증.
2. A22 응답 줄 수 변화(같은 kind 두 줄)를 FE가 어떻게 그릴지 — FE 후속 진행 중(`ruleUid` 키·effective 배지).
3. A25는 형식 통일을 하지 않아 두 형식이 공존한다(`matches` 양쪽 수용).
4. 전 항목 런타임(브라우저·실 수신) 미검증 — 단위·IT(실 PG)까지.

## 4. 검수 관점
1. A22 판정 통일이 `evaluate`·`forService`·미리보기·resync 전 경로에서 같은 술어를 쓰는가(한 곳만 고쳐 다시 갈리지 않는가).
2. A28 승격 로직: 1m 보존 경계·5m LAG·`status` 생략 조건이 서로 모순 없는가, 가용성 % 분모가 생략 칸을 빼는가.
3. A24 `pool_s` 도입이 기존 `pool_ms` 행(bounds_id)과 섞여 롤업·조회에서 벡터 합이 깨지는 경로가 없는가(`ApmHistogramMerger`·`ApmHistBoundsCatalog`).
4. A27·A29 `afterCommit` 등록 지점이 트랜잭션 밖 호출(테스트·비트랜잭션 경로)에서도 안전한가(`TransactionSynchronizationManager.isSynchronizationActive` 분기).
5. 테스트가 실제로 검증하는가(특히 afterCommit 롤백 케이스·`step<60` 케이스).

---

## 5. 3차 검수 반영 (2026-09-01, `review_apm-p1-r3_codex.md` 지적 4건)

전체 `:test` **2135 green**(2123 → **+12**, 회귀 0 · skip 0 · IT 포함).

| # | 지적 | 판정 | 반영 | 위치 |
|---|---|---|---|---|
| 1 | 🔴 A28 꼬리 보정이 `receivedCells`만 1m으로 합치고 HTTP `serviceCells`는 상위 롤업만 읽어, 꼬리에서 임계 초과가 `UP`으로 나감 | **사실 — 수정** | 꼬리 HTTP도 **같은 원점(cell index)으로** 1m 재조회해 그 칸을 **대체**(합치면 같은 요청 이중 계산). 꼬리 시작을 **칸 격자에 맞춰 내림**(반 칸만 덮으면 두 단이 섞이고 `answerable` 판정도 반 칸 어긋난다). 이를 위해 `serviceCells`에 `origin/from` 분리 + `cellMs` 판 신설 — 부수적으로 **HTTP 칸과 수신 칸이 다른 자를 쓰던 오차**(창이 칸 폭의 배수가 아니면 창 끝에서 칸 하나가 밀림)도 닫혔다 | `core/metric/ApmMetricStore`, `service/status/ApmAvailabilityService` |
| 2 | 🟡 A27 테스트가 비트랜잭션 폴백만 검증 | **사실 — 보강** | `@Nested WithinTransaction` 3건: **커밋 전 미호출**(+훅 등록 확인) · **커밋 후 호출** · **롤백 시 미호출**. Spring 실제 동기화 레지스트리를 쓰고 커밋/롤백 신호만 손으로 준다. 폴백 테스트 2건은 그대로 유지 | `service/list/ApmServiceDeleteTest` |
| 3 | 🟡 A29 mock 롤백이 실제 DB 롤백을 재현 못 함 | **사실 — IT 신설** | `ApmSettingRollbackIT`(실 PG, `IntegrationTestSupport`) 2건: 예외로 되감은 뒤 **DB 값·캐시 값이 모두 이전 값**인가 / 커밋 시 둘 다 새 값인가. 🔴 핵심은 **트랜잭션 안의 읽기** — 옛 구현은 거기서 미커밋 값을 캐시에 담았다. 기존 mock 테스트에는 "여기서 보는 것은 훅의 시점뿐"이라는 한계를 명시 | `core/setting/ApmSettingRollbackIT`, `ApmSettingServiceTest` |
| 4 | 🟡 계약 `availability24hPct` 정의와 구현 불일치 | **사실 — 구현을 계약에 맞춤** | `pct24h`가 `series`와 **같은 함수(`statusOf`)로** 칸을 판정한다. 분자 `UP+DEGRADED` · 분모 **판정된 칸** · 🔴 **`UNKNOWN`·생략 칸은 분모에서 제외**(수집기 끊김은 앱 책임이 아니다) · 판정된 칸이 0이면 **`null`(모름)**. 배치 HTTP 집계 1질의 추가(서비스 수만큼 왕복 아님). 계약 §5·§7.2-9에 이 정의를 명문화 | `service/status/ApmAvailabilityService`, `service/list/ApmServiceQueryService`, `./contract_apm-read-api.md` |

### 신규 테스트 12건
| 파일 | 건수 | 내용 |
|---|---|---|
| `ApmAvailabilityServiceTest` | +7 | 꼬리 오류율(M5 승격)·꼬리 p95(H1 승격)·꼬리 1m 우선(이중 계산 금지) / `UNKNOWN` 분모 제외·전부 UNKNOWN이면 null·DEGRADED는 안 깎임·문맥 없는 서비스는 생략 |
| `ApmServiceDeleteTest$WithinTransaction` | +3 | 커밋 전·커밋 후·롤백 |
| `ApmSettingRollbackIT` | +2 | 실 PG 롤백/커밋 |

### 결함 검출력 실증(되돌려 보고 확인)
- 꼬리 HTTP 합치기 한 줄을 빼면 → 새 가용성 테스트 **3건 실패**.
- `evictAfterCommit()`을 `evict()`로 되돌리면 → `ApmSettingRollbackIT` **1건 실패**(트랜잭션 안 읽기 지점).

### 🔴 남은 불안한 지점
1. **`pct24h` 캐시 키에 임계가 없다.** 값이 이제 임계·수집기 상태에 의존하는데 키는 (serviceId, 5분 격자)뿐이라, 임계를 바꾸면 **최대 5분** 옛 판정이 남는다(다음 격자에서 자연 소멸, `clear()`로 즉시 해소 가능). 키에 임계를 넣으면 서비스별 키가 흩어져 캐시 효율이 떨어져 이렇게 두었다.
2. **`pct24h` 비용은 실측하지 않았다.** 24h×288칸 HTTP 집계가 배치 1질의로 늘었고(같은 테이블·같은 창·`metric` 필터로 더 좁다) 칸마다 히스토그램 merge가 최대 288회/서비스 돈다 — 목록에 서비스가 수십 개인 실환경 응답시간은 미측정.
3. **꼬리에서 상위 롤업 행을 대체하는 규칙**은 "1m 행이 있는 칸만" 대체다. 과거 창(꼬리에도 1m이 없는 구간)에서는 상위 단 집계가 남는데, 1h 단이 5분 칸에 붙는 조합은 여전히 런타임 미검증(3차 이전 §3-1과 같은 지점).
4. 전 항목 **런타임(브라우저·실 수신) 미검증** — 단위·IT(실 PG)까지다.
