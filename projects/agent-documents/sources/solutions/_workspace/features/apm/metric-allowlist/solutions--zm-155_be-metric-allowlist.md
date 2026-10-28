# ZM-155 BE 보고 — 메트릭 허용목록 확장 수단 1차(S2 + S4의 BE)

- 작성 2026-10-13 · 🆕 코덱스 v1 R1~R10 반영 §10 · 코덱스 v2 N1~N9 + FE F1~F5 회신 §11 · 코덱스 v3 §12 · **코덱스 v4 §13** · 워크트리 `C:\worktrees\zm-155-be` (브랜치 `ZM-155-be`, master `f99621e` 기준) · **미커밋**
- 계약 [`./contract_apm-metric-allowlist.md`](contract_apm-metric-allowlist.md) · 검수 인계 [`./review_zm-155-be-metric-allowlist.md`](review_zm-155-be-metric-allowlist.md)
- 설계 [`./devdesign_apm-metric-allowlist-extension.md`](devdesign_apm-metric-allowlist-extension.md) §8 결정 Q1~Q9
- 🔴 **Flyway V81** — 2026-10-13 생성 직전 `git for-each-ref`의 모든 로컬·원격 브랜치와 `git worktree list`의 모든 워크트리(미추적 포함)에서 최대 번호 **V80** 확인(master는 V75). 다른 브랜치가 병합되면 번호 충돌 여부 재확인 필요

---

## 1. 범위 7항목 상태

| # | 항목 | 상태 |
|---|---|---|
| 1 | 규칙 테이블(V81)·L1 20 | ✅ `apm_custom_metric_rule` + PG advisory xact lock으로 상한 경합 직렬화 |
| 2 | 수신 경로(규칙 표·L5 접힘·L8 정지·히스토그램 거절·기존 경로 불변) | ✅ |
| 3 | 관리 API + 폐기 통계 힌트 + 예산 산식 | ✅ |
| 4 | 조회 EP `GET /apm/services/{uid}/custom-metrics` | ✅ |
| 5 | 수집기 설정 생성 `extra` 기본값 + 설치 가이드 재생성 플래그 | ✅ |
| 6 | `[APM-ALLOWLIST]` 감사 로그(`LogSafe`) | ✅ 등록·켜기·끄기·해제·삭제·자동 정지(판정/기록 2줄) |
| 7 | ZM-152 정합 | ✅ 런타임 패밀리 접두 이름 등록 거부(RESERVED) + 사유 설명 갱신. `absentSlots` 코드 변경 없음(아래 §5) |

## 2. 바꾼 파일 (35개 — 수정 13, 신규 22)

**신규(main 13)**
- `db/migration/V81__apm_custom_metric_rule.sql`
- `premium/apm/core/domain/ApmCustomMetricRule.java`·`ApmCustomMetricRuleRepository.java` — 엔티티(상태 = enabled·suspended_at 조합), `OVERFLOW_METRIC="__other__"`
- `premium/apm/collector/ingest/custom/ApmCustomMetricGate.java` — 수신 관문(스냅샷 30초·L5·L8·자동 정지 기록)
- `premium/apm/collector/custommetric/` — `ApmCustomMetricNamePolicy`(등록 가능 이름 판정, 등록 API·폐기 힌트 공용), `ApmCustomMetricRuleService`, DTO 3종(`RuleDto`·`RulesDto`·`ReqDto`)
- `premium/apm/collector/ApmCustomMetricRuleController.java` — `/apm/custom-metrics/rules`
- `premium/apm/service/red/ApmCustomMetricSeriesService.java`·`ApmCustomMetricSeriesDto.java`, `premium/apm/service/ApmServiceCustomMetricController.java`

**수정(main 12)** — 전부 **추가만**(기존 생성자·필드 유지, 새 협력자는 `@Autowired(required=false)` 세터 주입이라 기존 테스트 조립이 그대로 선다)
- `MetricIngestor` — ③ `spec.isEmpty()` 분기 안에서만 관문 호출 + `toCustomRow` + 파티션 준비 필터에 활성 규칙 포함
- `MetricIngestPipeline` — 배치 전 스냅샷 갱신, 배치 후(finally) 자동 정지 기록
- `ApmDropReason` — `CUSTOM_SERIES_OVERFLOW`·`CUSTOM_RULE_SUSPENDED`·`CUSTOM_KIND_UNSUPPORTED`(enum 끝에 추가)
- `ApmIngestDropsDto`·`ApmIngestDropQueryService` — `rows[].customRule`
- `ApmServiceDropSummaryDto` — 사유 목록 설명
- `ApmCollectorConfigDefaultsDto`·`ApmCollectorConfigService` — `processors.filterMetricsExtra`
- `ApmInstallGuideDto`·`ApmInstallGuideService` — `customMetrics` + 조건부 안내
- `ApmSetting` — `KEY_CUSTOM_METRIC_RULES_CHANGED_AT`(워터마크 축)
- `engine-api/.../ErrorCode` — `APM_CUSTOM_METRIC_*` 7종

**테스트(신규 9, 수정 1)**: `ApmCustomMetricGateTest`·`MetricIngestorCustomMetricTest`·`ApmCustomMetricNamePolicyTest`·`ApmCustomMetricRuleServiceTest`·`ApmCustomMetricCollectorSyncTest`·`ApmIngestDropCustomRuleHintTest`·`ApmCustomMetricSeriesServiceTest`·`ApmCustomMetricApiMvcTest`·`ApmCustomMetricIT`(신규) / `ApmRollupJobIT`(케이스 1 추가)

## 3. 상한 동작

| 상한 | 구현 | 경계 테스트 |
|---|---|---|
| L1 규칙 20 | 등록 시 `count() >= 20` 거절, advisory lock 안에서 셈. 끈·정지 규칙도 센다 | 19개→20번째 허용, 20개→21번째 `APM_CUSTOM_METRIC_LIMIT` |
| L5 서비스당 50 | 노드 로컬 `SeriesSet`(route `RouteSet`과 같은 구조): 받은 이름은 빠지지 않음(LRU 금지), 서비스별 첫 판정 때 1m 최근 1일 워밍(트랜잭션 안 실패는 재던짐 — route 워밍과 같다). 초과분은 `__other__` 행으로 접어 **저장**, `CUSTOM_SERIES_OVERFLOW`(폐기 통계 이름 `<metric>@svc:<id>`) | 상한 3에서 3개 STORE·4번째 FOLD·기존 이름 계속 STORE·서비스별 독립 |
| L8 접힘 >50%가 60분 | 규칙별 1분 창(수신 시각 기준). 접힘 우세 분이 처음 나온 분 시작~최근 접힘 우세 분 끝 ≥ 60분이고 그 사이 ≤50% 분이 없으면 정지. 트래픽 없는 분은 중립. 판정 즉시 이 노드는 버리고, 배치 뒤 조건부 UPDATE(`enabled and suspended_at is null`)로 기록 | 60분 정확히 정지 · 정확히 50% 분은 리셋 · 59분+정상 1분 리셋 · 무트래픽 58분 사이도 이어짐 · 재조회해도 미기록 정지 유지 |
| 히스토그램 | `CUSTOM_KIND_UNSUPPORTED`(손실), 상한 소비 없음 | ✅ |

⚠️ 1차는 차원 없음 → 규칙 1개 = 서비스당 시계열 1개라 **L5(50) > L1(20)**, 평상시 접힘·자동 정지는 일어나지 않는다. 걸리는 길은 규칙 삭제·재등록이 반복돼 한 프로세스가 받아 준 이름이 50을 넘을 때뿐이다. 2차(차원 선택)에서 본체가 되는 장치를 1차에 미리 깔아 둔 것.

## 4. 기존 경로 불변 증거

- 코드: 커스텀 분기는 `ApmMetricAllowlist.find()`가 **비었을 때만** 들어간다. 정적 `find()`·11개 소비처는 무수정. 등록 판정이 내장 이름·별칭·`otelcol`을 거부하므로 순서 역전도 불가(이중 방어).
- 테스트 `MetricIngestorCustomMetricTest$BuiltinUnchanged`:
  1. R1 실측 페이로드(앱 31종 + 수집기 자기 메트릭)를 관문 없는 조립과 무관한 규칙이 있는 조립에 각각 넣어 **행 전 필드(배열 포함)를 문자열로 펼쳐 순서까지 동일**, `IngestStats` 재귀 비교 동일.
  2. 픽스처의 허용목록 밖 이름(`jvm.class.loaded`·`http.server.request.body.size`(히스토그램)·`queueSize` 등)을 **전부 규칙으로 열어도** 내장 지표 행은 동일, 내장 쪽 사유 카운트 동일.
- 기존 회귀: APM·라이선스·OTel 단위 테스트 2,257건 중 실패 2건은 `ApmCollectorLiveRuntimeTest`(실제 Collector 바이너리 기동 — 파일 잠금·타임아웃). **master 기준선 임시 워크트리에서도 같은 클래스가 실패**(다른 메서드, 실행마다 바뀜) → 기존 환경성 플래키, 이번 변경과 무관. 기준선 워크트리는 삭제함.

## 5. ZM-152 정합 판단

- `absentSlots`(`RuntimeSlotMap.absentReasons`)는 런타임 바인딩 표만 보고 커스텀 규칙과 무관하다. 다만 비-JVM 런타임 이름(`dotnet.*`·`v8js.*`·`go.*` 등 — `ingestible=false`)을 커스텀으로 열면 ① 런타임 탭이 차원 없는 행을 자기 슬롯 차원 규약으로 **조용히 오독**하고 ② `detect()`의 패밀리 투표를 커스텀 이름이 뒤집는다. → **최소 조정: `RuntimeSlotMap.familyOf(name) != UNKNOWN`인 이름은 등록 거부(`APM_CUSTOM_METRIC_RESERVED`)**. `absentSlots` 코드는 손대지 않음. 대가: `collector.custommetric → service.runtime` 정적 참조 1줄(기존 `collector → service` 방향과 같은 방향).
- 서비스별 폐기 요약(`/apm/ingest/drops/by-service`)은 새 사유를 자동으로 센다(코드 무변경, 스키마 설명만 갱신). `NOT_ALLOWLISTED` 메모리 카운터는 규칙이 켜지는 순간부터 그 이름에 대해 멈춘다.

## 6. 롤업·보존·아카이브 자동 합류

- 롤업 SQL은 `group by service_id, metric, dims_hash`(이름 필터 없음) — **`ApmRollupJobIT.customMetricRollsUpWithoutExtraCode`**: 규칙 이름 2행 + `__other__` 1행을 1m에 넣고 5m(합 12)·1h(합 12)·`__other__`(3) 확인, 진짜 PG.
- 보존(`ApmRetentionService`)·파티션은 테이블 단위, 콜드 아카이브 `metric1m`도 테이블 단위 — 이름 무관(코드 확인, 별도 테스트 없음).

## 7. 테스트 결과(실제 실행)

| 묶음 | 결과 |
|---|---|
| 신규 단위 67건(관문 13·수신 8·이름 정책 23·규칙 서비스 12·수집기 반영 3·폐기 힌트 2·조회 3·MVC 권한 3) | 67/67 통과 |
| APM·라이선스·OTel 단위 회귀(`premium.apm.*Test`·`license.*Test`·`otel.*Test`) | 2,257건 중 2,255 통과, 2건 기존 플래키(§4) |
| IT(도커 5433 `moveseye_it`, 다른 세션 IT 종료 확인 후 1회) | `ApmCustomMetricIT` 2 · `ApmRollupJobIT` 10(신규 1 포함) · `ApmMetricIngestAtomicityIT` 16 — **28/28, skip 0** |
| 컴파일 | `:compileJava`·`:compileTestJava` 성공 |

## 8. 설계와 달라진 점

1. **런타임 패밀리 접두 이름 거부(RESERVED)** — 설계에 없던 금지(§5 이유).
2. **접힘 대상** — 설계는 "차원 값을 `__other__`로"였으나 1차는 차원이 없어 **지표 이름을 `__other__`로** 접는다(서비스당 한 줄로 묶여 시계열 수가 L5+1로 묶인다). 단위가 다른 지표가 섞이므로 조회는 count만 의미(`valueKind:"MIXED"`).
3. **폐기 사유 1개 추가** — `CUSTOM_KIND_UNSUPPORTED`(히스토그램 거절 사유 기록 요구 반영).
4. **L5·L8은 설정이 아니라 코드 상수** — 설계 §6.1은 `apm_setting` 키를 제안했지만 Q2가 값만 정했고 1차는 닿지 않는 상한이라 화면 노출 없이 상수로 둠(응답 `limits`로 내려줌).
5. **이력 테이블 없음**(Q7 결정대로) — 규칙에 `dim_keys`·`max_series`·`kind` 컬럼 없음(Q1).
6. 상태 변경을 PATCH 하나가 아니라 동사 EP(enable/disable/resume)로 분리.
7. 실시간 링버퍼에는 커스텀 지표를 넣지 않는다(SEEN 신호 포함) — 커스텀만 보내는 인스턴스는 실시간 기대 인스턴스 추정에서 빠진다.

## 9. 미해결

- 커밋·FE·런타임(:3000) 실측 없음. dev DB에 V81 미적용.
- 규칙별 "접힘 비율·받아 준 시계열 수·최근 7일 행 수"(설계 §5.3 4단계) 미구현 — 상한·접힘이 노드 로컬 메모리라 다중 노드 합산 방법이 정해져야 한다.
- `CUSTOM_SERIES_OVERFLOW`의 서비스별 분해 필드 없음(`routeOverflow`처럼). 1차에선 사실상 발생하지 않아 보류.
- 폐기 통계 이름은 128자에서 잘려 저장된다 — 128자를 넘던 원래 이름의 잘린 값은 등록은 되지만 수신 이름과 달라 영원히 0건(무해, 화면 안내 여지).
- 다중 노드: L5 상한은 노드마다 따로 세므로 최악 N배까지 받아 줄 수 있다(route와 같은 수용).

---

## 10. 코덱스 반영 (검수 v1 — `../../../_archive/features/apm/metric-allowlist/review_zm-155-be-metric-allowlist_codex.md`, 판정 "수정 후 재검수")

🔴 **위 §1~§9 중 아래와 어긋나는 문장은 이 절이 이긴다**(자동 정지→경고, L5 메모리→DB 원장, 128자 등록 가능→거절).

| R | 등급 | 반영 | 어떻게 |
|---|---|---|---|
| R1 | 필수 | ✅ | 규칙 조회 실패가 마지막 성공 후 **60초(TTL 2회)** 를 넘기면 스냅샷을 비운다(fail-closed) — 커스텀 지표는 `NOT_ALLOWLISTED`. 진입 시 WARN 1회, 복구 시 INFO. 한 번도 못 읽었으면 처음부터 빈 스냅샷. 상수 표 지표는 관문을 거치지 않으므로 무영향(`MetricIngestorCustomMetricTest$BuiltinUnchanged` 유지) |
| R2 | 필수 | ✅ | V81에 **`apm_custom_metric_admission(service_id, metric_name, first_admitted_at, last_seen_at)`** 추가(미커밋이라 번호 유지). 처음 보는 (서비스, 이름)은 배치 트랜잭션 안에서 서비스별 `pg_advisory_xact_lock` → 7일 지난 자리 삭제 → 내 자리/전체 자리 수 확인 → insert. 메모리는 캐시(받은 이름 + 60초 거절 메모, 서비스 512 LRU — 축출돼도 원장에서 다시 답한다). 규칙을 지워도 자리는 마지막 관측 뒤 7일 남는다. 🔴 advisory lock·행 잠금을 JVM 모니터 밖에서 잡도록 나눴다(모니터↔PG 잠금 교착 방지) |
| R3 | 필수 | ✅ | 감시 표: 스냅샷 교체 때 **없는 이름 정리** + 전체 상한 10,000(넘으면 `foldWatchOverflow`만 증가) + 마지막 기록 1시간 지난 항목 만료. 키가 규칙 이름이라 실제 크기는 규칙 수(≤20) 이하. 거절 메모도 서비스당 200 상한 |
| R4 | 권장 | ✅ | 경고 판정에 규칙 id·`updated_at`을 실어 두고, 기록 UPDATE가 `where id = ? and updated_at = ? and enabled and warned_at is null` CAS. 스냅샷 교체 때 버전이 바뀐 미기록 판정은 버린다. 경고 해제는 `updated_at`을 바꾼다 |
| R5 | 권장 | ✅(정책 변경) | **자동 정지 → 경고(`WARN`)로 낮춤** — 데이터는 계속 접혀 저장된다. 이유: 접힘 비율의 전역 집계(분 단위 공유 테이블)를 1차에 넣는 비용 대비, 시계열 수 자체는 R2 원장이 이미 **전역으로** 50에 묶으므로 정지가 막는 위험이 남지 않는다. 사유 `CUSTOM_RULE_SUSPENDED`·`resume` EP 삭제, `clear-warning` EP·`warned_at`/`warn_reason` 컬럼 |
| R6 | 권장 | ✅ | 조회 EP가 규칙마다 `floor(created_at, 해상도)` 앞 칸을 자른다(`received`도 같은 범위). 같은 이름 재등록 시 지난 규칙 데이터가 안 섞인다 |
| R7 | 권장 | ✅ | `value_kind`(GAUGE·UPDOWN·COUNTER) — 첫 수신 때 트랜잭션 안 CAS(`value_kind is null`)로 확정, 다른 종류는 `CUSTOM_KIND_UNSUPPORTED`. 다른 노드가 먼저 정했으면 그 값이 이긴다. 조회는 규칙 종류 우선(없으면 행에서 추정) |
| R8 | 권장 | ✅ | 등록 최대 127자. 정확히 128자는 `APM_CUSTOM_METRIC_NAME_TRUNCATED`(폐기 통계 기록기가 128자에서 자르므로 원래 128자인지 잘린 것인지 가를 수 없다), 폐기 힌트 `NAME_TRUNCATED`, 폐기 표 행에 `metricNameTruncated` |
| R9 | 권장 | ✅ | `[APM-ALLOWLIST]` 감사 로그를 값 캡처 후 `afterCommit`에서만 출력 |
| R10 | 권장 | ✅ | IT `ApmCustomMetricIT.durableAdmissionBoundary` — 진짜 PG에서 50번째 STORE·51번째 FOLD, **새 관문 인스턴스(재기동)** 에서도 51번째 FOLD·기존 이름 STORE, **규칙 교체(다른 이름)** 도 FOLD, 7일 지난 자리를 비우면 새 이름 STORE(총 50 유지). `warningCasIsVersioned` — 버전 CAS 1행/해제 뒤 0행/꺼짐 0행. 단위: 실제 50/51 경계, fail-closed 60초, 감시 표 정리, 버전 바뀐 판정 폐기 |

### 10.1 반영 후 바뀐 파일

- 수정: `V81__apm_custom_metric_rule.sql`(컬럼 교체 + 원장 테이블) · `ApmCustomMetricRule`(WARN·valueKind) · `ApmCustomMetricGate`(전면 재작성) · `MetricIngestor`·`MetricIngestPipeline`(새 API) · `ApmDropReason`(`CUSTOM_RULE_SUSPENDED` 삭제) · `ApmCustomMetricNamePolicy`(NAME_TRUNCATED) · `ApmCustomMetricRuleService`(clearWarning·afterCommit 감사·127자) · DTO 3종 · `ApmCustomMetricRuleController`(`clear-warning`) · `ApmIngestDropsDto`(`metricNameTruncated`) · `ApmServiceDropSummaryDto` · `ApmCustomMetricSeriesService`/`Dto`(R6·R7) · `ErrorCode`(+`APM_CUSTOM_METRIC_NAME_TRUNCATED`)
- 테스트: 관문·수신·정책·규칙 서비스·폐기 힌트·조회·MVC·IT 갱신(파일 수 변화 없음 — 총 35개 그대로)

### 10.2 반영 후 테스트(실제 실행)

| 묶음 | 결과 |
|---|---|
| 커스텀 지표 단위 | **70/70**(관문 15·수신 8·정책 23·규칙 서비스 12·수집기 반영 3·폐기 힌트 2·조회 4·MVC 3) |
| 관련 기존 단위(`MetricIngestorTest`·`MetricIngestPipelineTest`·`ApmIngestDropQueryServiceTest`·`ApmCollectorApiMvcTest`·`ApmInstallGuideServiceTest`·`ApmMetricAllowlistTest` 포함) | 359/359 |
| IT(다른 gradle worker 없음 확인 후 1회) | `ApmCustomMetricIT` 3 · `ApmRollupJobIT` 10 · `ApmMetricIngestAtomicityIT` 16 — **29/29, skip 0** |
| APM·라이선스·OTel 단위 회귀 | **전부 통과, 실패 0**(최근 15분 결과 파일 205개·2,260건 집계. 이번엔 플래키 `ApmCollectorLiveRuntimeTest`도 통과) |

### 10.3 남은 것(반영 후)

- 접힘 경고는 여전히 **노드 표본**이다 — 그래서 정지가 아니라 경고로 낮췄다. 전역 비율이 필요해지면(2차, 차원 선택) 분 단위 공유 집계가 선행돼야 한다.
- 자리 원장 보존 7일은 코드 상수(1m 원시 보존 기본값). 보존 설정을 바꿔도 따라가지 않는다.
- 첫 수신 종류 확정·새 자리 판정은 배치 트랜잭션 안에서 규칙 행·서비스 advisory lock을 커밋까지 쥔다 — 같은 서비스의 새 이름이 동시에 오는 배치끼리 직렬화된다(새 이름일 때만, 이후는 캐시).
- 엔티티 저장(켜기/끄기/해제)은 전체 컬럼 UPDATE라, 같은 순간 기록된 시스템 경고를 사람의 저장이 덮을 수 있다(사람의 결정이 이기는 쪽이라 수용).

---

## 11. 코덱스 v2 반영 (`../../../_archive/features/apm/metric-allowlist/review_zm-155-be-metric-allowlist-v2_codex.md`) + FE 요청 F1~F5

🔴 **§10과 어긋나면 이 절이 이긴다** — 종류는 규칙이 아니라 자리 원장에 있고, 자리 판정은 배치 단위다.

| N | 등급 | 반영 | 어떻게 |
|---|---|---|---|
| N1 | 필수 | ✅ | 실패는 `loadedAtMs`를 밀지 않는다. 실패 중에는 매 호출 "마지막 성공 + 60초"를 먼저 보고 넘었으면 즉시 비운다(재시도 간격 5초와 무관). 테스트: 첫 실패 45초 감지 → 60초 열림·60.001초 닫힘, 재시도 5초 간격·복구 |
| N2 | 필수 | ✅ | 메모리 캐시는 60초짜리 힌트. 그 안에서도 ① 처음 보는 이름 ② 마지막 관측이 "만료 − 캐시 수명"보다 오래된 자리 ③ touch할 때가 된 자리는 반드시 원장(advisory lock 아래)에 다시 묻는다. 새 자리 배정은 항상 원장이 결정한다. IT `expiredCacheDoesNotBypassLedger`: 원장에서 s.0 만료 → 다른 노드가 그 자리로 새 이름 → 옛 노드는 캐시 수명이 지나자 s.0을 접는다(살아 있는 자리 50 유지) |
| N3 | 필수 | ✅ | `prepareBatch` — 배치의 (서비스, 이름, 첫 종류)를 모아 서비스마다 락 1 + 살아 있는 자리 조회 1 + 다중 행 `INSERT … ON CONFLICT` 1(새 자리·touch 함께) = **≤ 3문장**, 캐시가 유효하면 0. 단위 테스트가 20규칙×서비스 1개 cold 배치 = 3문장, 30초 뒤 재배치 = 0문장을 단언. ⚠️ "기동 시 전 서비스 preload"는 하지 않았다 — 배치가 서비스 단위로 한 번에 로드하므로 cold start도 서비스당 3문장이고, 기동 preload는 오지 않을 서비스까지 읽는다 |
| N4 | 필수 | ✅ | 락은 배치 안 서비스 ID **오름차순**(`TreeMap`)으로 한 번씩. 단위 테스트(30·5·17 → 5·17·30 순서), IT `crossOrderedBatchesDoNotDeadlock`(두 트랜잭션이 [1,2]·[2,1]로 동시에 잡고 300ms 유지 → 둘 다 20초 안 완료) |
| N5 | 권장 | ✅ | 스냅샷 교체 때 이름별 감시 버전(id·updated_at)이 바뀌면 그 이름의 접힘 이력을 지운다. 1시간 미사용 만료도 스냅샷 교체 때마다 돈다(R3 부분 지적 해소), 감시 표 삽입은 동기화 블록 안이라 상한이 엄격하다 |
| N6 | 필수 | ✅ | 조회 하한 = `ceil(created_at, 해상도)` — 생성 시각이 든 칸은 버리고 다음 완전한 칸부터(경계에 딱 맞으면 그 칸). 테스트 |
| N7 | 필수 | ✅(설계 변경) | 종류를 **규칙에서 자리 원장(서비스×이름)으로 옮겼다**(`apm_custom_metric_admission.value_kind NOT NULL`, 규칙 테이블의 `value_kind` 삭제 — V81 미커밋이라 번호 유지). 시계열의 정체성이 (서비스, 이름)이므로, 규칙 세대가 바뀌어도·옛 스냅샷 노드여도 살아 있는 자리의 종류를 넘지 못한다. 만료 자리에 다시 배정할 때만 종류·첫 배정 시각을 새로 쓴다. 테스트: 원장 종류가 이긴다, 서비스별 독립 |
| N8 | 권장 | ✅ | 예산 `activeRules` = 켜진 규칙(ACTIVE+WARN). 테스트 갱신 |
| N9 | 권장 | ✅ | V81에 `last_seen_at` 인덱스, `ApmRetentionService.deleteExpiredCustomMetricSeats(7)` + `ApmRetentionJob` 단계 `customMetricSeats`. 판정 경로의 인라인 DELETE는 없앴다(만료 행은 조회 조건으로만 제외). IT로 정리 확인 |

**FE 요청 F1~F5**: F1 계약 §3 머리말 2종 정정 · F2 `activeRules` = ACTIVE+WARN 확정 · F3 그대로(문제없음) · F4 확인 · F5 규칙 DTO에 `seatServices`(자리 가진 서비스 수) + `valueKind`(자리 원장 요약, `MIXED`) 추가, 접힘은 `WARN`/`warnReason`으로, 최근 7일 행 수는 2차(이유: 이름만으로 1m 7일 파티션 전체를 훑는다 — 계약 §8). **권한**: 규칙 관리 EP 6개 = `apm.edit`(`requireEdit`, 관리자 역할 우회 포함), 조회 = `apm.view` — FE 기준과 같다(계약 머리말에 못 박음).

### 11.1 바뀐 파일(이번 회차)

`V81`(종류 컬럼 이동·인덱스) · `ApmCustomMetricRule`(valueKind 제거) · `ApmCustomMetricGate`(전면 재작성: prepareBatch·Admissions·fail-closed 경계·감시 버전) · `MetricIngestor`(배치 후보 수집·prepareBatch 1회·수신 순서 보존) · `ApmCustomMetricRuleService`/`RuleDto`(자리 요약·enabled 예산) · `ApmCustomMetricSeriesService`/`Dto`(ceil·자리 종류) · `ApmRetentionService`·`ApmRetentionJob`(N9 단계) + 테스트(관문·조회·규칙 서비스·MVC·IT). 총 변경 파일 38개(보존 2개 + 보존 요약 테스트 1개 추가).

### 11.2 테스트(실제 실행, 다른 gradle worker 없음 확인)

| 묶음 | 결과 |
|---|---|
| 커스텀 지표 단위(`*CustomMetric*Test`) | **73/73** |
| 관련 기존 단위(수신·파이프라인·폐기·수집기 MVC·설치 가이드·허용목록·보존) | 통과(실패 0) |
| IT | `ApmCustomMetricIT` **5**(등록→수신, 50/51·재기동·규칙 교체·만료, 만료 캐시(N2), 교차 순서 교착(N4)+보존 정리(N9), 경고 CAS) · `ApmRetentionJobIT` 12 · `ApmRollupJobIT` 10 · `ApmMetricIngestAtomicityIT` 16 — **43/43, skip 0** |
| APM·라이선스·OTel 단위 회귀 | 2,265건 중 실패 2 → ① `ApmBatchJobTest.retentionSummary`(보존 요약 문자열이 새 단계 `customMetricSeats`를 몰랐다 — 테스트 갱신 후 통과) ② `ApmCollectorLiveRuntimeTest`(실제 Collector 기동, 기존 플래키 — 단독 재실행 통과). 최종 실패 0 |

### 11.3 남은 것

- 다중 노드 실측 없음(IT는 한 JVM의 두 관문 인스턴스·두 트랜잭션으로 흉내).
- 같은 서비스의 새 이름이 동시에 오는 배치끼리는 서비스 락으로 직렬화된다(새 이름일 때만 — 이후는 60초 캐시).
- 트랜잭션 밖 옛 경로(`MetricIngestor.ingest`, 운영 미사용)에서는 advisory xact lock이 문장 단위로 풀린다.
- 자리 유지 7일은 코드 상수(1m 원시 보존 기본값) — 보존 설정 변경을 따라가지 않는다.

---

## 12. 코덱스 v3 반영 (`../../../_archive/features/apm/metric-allowlist/review_zm-155-be-metric-allowlist-v3_codex.md`)

| 항목 | 반영 | 어떻게 |
|---|---|---|
| M1 필수 | ✅ | 원장 판정 결과를 공유 캐시에 올리는 것을 `afterCompletion(COMMITTED)`로 미뤘다. 판정 시작 시 그 서비스 캐시를 비우고, 롤백이면 다시 비운다. 이번 배치는 지역 `Admissions`만 쓴다. IT `rolledBackSeatIsNotCached`: 50번째 자리를 잡은 배치 롤백 → 다른 노드가 50번째를 가져감 → 롤백된 노드는 원장에 다시 묻고 접는다(원장 50석) |
| M2 필수 | ✅ | touch는 같은 세대·**종류 일치**일 때만 예약한다. 캐시 경로도 종류가 다르면 원장으로 보낸다. 단위 `mismatchedKindDoesNotTouch`(다른 종류 → UPSERT 0, 같은 종류 → 1) |
| M3 권장 | ✅ | 조회 EP 종류 질의에 `last_seen_at >= now-7일`. 7일 상수는 `ApmCustomMetricRule.SEAT_RETENTION`(core)으로 올려 관문·규칙 목록·조회·보존이 같은 값을 읽는다(조회 EP가 수집기 패키지를 import하지 않게) |
| N2 부분 | ✅ | M1과 함께: 캐시는 커밋된 결과만. 추가로 "캐시가 가득 차 새 이름을 접는" 판단은 **캐시의 모든 자리가 아직 믿을 만할 때만**(하나라도 만료 근접이면 원장) |
| N3 부분 | ✅(의도적 편차 명시) | 기동 preload 없음 유지. 근거 수치: 처음 보는 서비스 1회 = 3문장(락·조회·다중 행 UPSERT), 이후 캐시 60초 안 = 0문장, 캐시 만료 후 = 2~3문장. 단위로 규칙 20 × 서비스 1 = 3, × 서비스 3 = **9(선형)** 단언 |
| N7 부분 | ✅ | 자리에 `rule_id`(V81, 미커밋이라 번호 유지). 자리의 세대가 스냅샷보다 새것 → 저장 금지(`NONE` → `NOT_ALLOWLISTED`), 옛것 → 새 세대가 자리를 넘겨받고 종류·첫 배정 시각 재설정. 단위 2건 + IT `oldSnapshotNodeCannotWriteNewGeneration`(실제 삭제 API → 재등록, 새 세대 COUNTER가 GAUGE 자리를 넘겨받고 옛 스냅샷 노드는 NONE) |

### 12.1 테스트(실제 실행, 다른 gradle worker 없음 확인)

| 묶음 | 결과 |
|---|---|
| 커스텀 지표 단위(관문 23 포함) | **79/79** |
| 관련 기존 단위(`MetricIngestorTest`·`MetricIngestPipelineTest`·`ApmBatchJobTest`) | 통과 |
| IT | `ApmCustomMetricIT` **7** · `ApmRetentionJobIT` 12 · `ApmRollupJobIT` 10 · `ApmMetricIngestAtomicityIT` 16 — **45/45, skip 0** |
| APM·라이선스·OTel 단위 회귀 | **2269건 실패 0**(플래키 `ApmCollectorLiveRuntimeTest` 포함 이번 회차 전부 통과) |

변경 파일 수 38개 그대로.

---

## 13. 코덱스 v4 반영 (`../../../_archive/features/apm/metric-allowlist/review_zm-155-be-metric-allowlist-v4_codex.md`) — P1

**지적**: 옛 스냅샷 노드가 1세대 자리를 캐시하면, 다른 노드가 2세대로 넘겨받아도 캐시 적중으로 DB를 안 보고 계속 저장했다(세대 검사가 DB 경로에만 있었다).

**반영**
1. **캐시 적중도 원장에서 세대를 확인한다** — 캐시가 믿을 만한 서비스는 `pg_advisory_xact_lock_shared` + 원장·규칙 조회 1문장(`verifyCached`). 새 자리·세대 이관은 기존 배타 락 경로라 이 배치가 커밋될 때까지 기다린다. 공유 락을 배타로 올리지 않는다(두 배치가 같이 올리면 교착) — 확인이 실패한 이름은 이번 배치에서 접거나(NONE/FOLD) 캐시를 비우고 다음 배치가 배타 경로로 다시 판정한다. 락 순서는 공유·배타 모두 서비스 ID 오름차순(N4 유지).
2. **원장 조회가 규칙 테이블의 지금 id를 함께 본다** — 자리 행에 `r.id`(이름으로 조인)를, 자리 없는 요청 이름에는 규칙만 있는 행을 붙인 `union all` 1문장(`readLedger`). 그래서 옛 노드는 다른 노드가 자리를 **넘겨받기 전에도**, 재등록이 커밋되는 즉시 저장하지 못한다(규칙이 지워졌거나 지금 id ≠ 스냅샷 id → `NONE` → `NOT_ALLOWLISTED`). 배타 경로도 같은 조회를 쓴다.
3. **규칙 재조회(30초)로 세대 변화를 알면 자리 캐시를 즉시 비운다**(`replaceRules`에서 id가 바뀌었거나 사라진 규칙이 있으면 `seatCache.clear()`).

**비용 변화(N3 표 갱신)**: 처음 보는 서비스·캐시 만료 = 배타 락·조회·UPSERT 2~3문장, **캐시 적중 = 공유 락·조회 2문장**(이전 0) — 서비스 수에 선형(규칙 20 × 서비스 3 cold = 9). 세대 정확성을 위해 "캐시 안 0문장"을 포기했다.

**테스트**: 단위 `cachedOldNodeStopsAfterReRegistration`(캐시 적중 상태에서 재등록 → 10초 뒤 같은 노드 `NONE`, 캐시 비움, UPSERT 0) · `generationChangeClearsSeatCache` · `batchUsesAtMostThreeStatements`(cold 3 → 캐시 적중 2 → 만료 2). 흉내 원장을 서비스별 상태를 기억하는 구현으로 바꿨다. IT `oldSnapshotNodeCannotWriteNewGeneration`: **1세대를 실제로 저장해 캐시를 가진 같은 `oldNode`** 를 ① 재등록 직후(넘겨받기 전) ② 새 노드가 COUNTER로 넘겨받은 직후, 시간 경과 없이 다시 호출 → 둘 다 `NONE`. ②는 수신 경로(`MetricIngestor.ingestOnce`)로 넣어 `NOT_ALLOWLISTED` 1건·저장 0행·자리 종류 COUNTER 유지까지 확인. IT 헬퍼는 실제 규칙 행을 넣도록 바꿨다(이제 원장 판정이 규칙 테이블을 본다).

| 묶음 | 결과 |
|---|---|
| 커스텀 지표 단위(관문 25 포함) | **81/81** |
| 관련 기존 단위(`MetricIngestorTest`·`MetricIngestPipelineTest`·`ApmBatchJobTest`) | 통과 |
| IT(다른 gradle worker 없음 확인) | `ApmCustomMetricIT` 7 · `ApmRetentionJobIT` 12 · `ApmRollupJobIT` 10 · `ApmMetricIngestAtomicityIT` 16 — **45/45, skip 0** |
| APM·라이선스·OTel 단위 회귀 | **2271건 실패 0** |

남은 것: 재등록 커밋과 옛 노드 확인 조회 사이의 ms 단위 창(READ COMMITTED 한 문장 안), 실제 다중 노드 실측 없음. 변경 파일 38개 그대로(응답 모양 변화 없음 — 계약 갱신 없음).

**칸 정렬(코디네이터 확인 요청)**: 서버 기본 시간대 기준으로 확정(저장·롤업·red-series·생성 칸 하한 동일). 30분 단위 오프셋 TZ 서버에서는 1h 칸이 epoch와 어긋나므로 FE는 응답 `ts`를 쓴다 — 계약 §4.
