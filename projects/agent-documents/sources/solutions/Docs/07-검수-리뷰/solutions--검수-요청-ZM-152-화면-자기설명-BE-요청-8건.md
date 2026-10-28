# 검수 요청 — ZM-152 화면 자기설명 BE 요청 8건

- 요청: Claude · 2026-09-28
- 검수 대상: `moveseye-be-spring` 워크트리 **`C:\worktrees\zm-152-be`** (브랜치 `ZM-152-be`, master `3f731d5` 기준) — 🔴 **미커밋**. `git -C C:\worktrees\zm-152-be diff` + 미추적 15파일(`git status --short | grep '^??'`)이 전부다
- 명세: `_workspace/reports/zm-152_screen-self-explaining.md` §1·§5·§6 · 계약: `_workspace/contract_zm-152-self-explain-be.md` · 작업 보고: `_workspace/reports/zm-152_be-self-explain.md`
- FE는 이번 범위가 아니다(FE master `2c58efb`는 상수·판정 흉내로 동작 중, 이 계약으로 교체 예정)

## 범위

| # | 요청 | 구현 요지 | 주요 파일 |
|---|---|---|---|
| 1 | 런타임 슬롯 부재 사유 | `ApmRuntimeSeriesDto.absentSlots` — `RuntimeSlotMap.absentReasons(family, present)`가 `Binding.ingestible`로 `NOT_INGESTIBLE`/`NOT_RECEIVED` | `service/runtime/RuntimeSlotMap`·`ApmRuntimeSeriesDto`·`service/red/ApmSeriesQueryService#runtime` |
| 2 | 액티브 요청 관측 | red-series `activeRequestsObserved`(창 안 게이지 표본) + `activeRequestsLastSeenMs`(1m 표 최근 7일 `max(bucket_start)`), 상세에도 후자 | `core/metric/ApmMetricStore#lastBucketOf·activeRequestsLastSeenMs`, `ApmRedSeriesDto`, `ApmServiceDetailDto` |
| 3 | 유효 보존 일수 | 🆕 `GET /apm/settings/retention`(**view**). 옵션 키·기본값을 `ApmRetentionDays`로 추출하고 **`ApmRetentionJob`도 그것으로 파싱**하게 바꿈. `ApmRetentionPolicy`가 `scheduler_setting`을 JDBC로 읽음(60초 캐시, 실패=기본값) | `core/batch/retention/ApmRetentionDays·ApmRetentionPolicy·ApmRetentionJob`, `collector/setting/ApmRetentionDto·ApmSettingController` |
| 4 | 보존 경계 | 트레이스·예외·DB·의존·맵 9개 EP 응답에 `oldestAvailableMs` — DTO에 필드 + 호환 생성자 + `withOldestAvailableMs`, **컨트롤러에서** `retention.attach(dto, ...)`로 붙임(null 안전) | 7개 DTO · 5개 컨트롤러 |
| 5 | 폐기 서비스 축 | 🆕 `GET /apm/ingest/drops/by-service`(**view**). DB 무변경 — `ApmIngestDropStatRecorder` 안의 메모리 카운터 `ApmServiceDropTally`(키 상한 10,000). 서비스를 아는 6개 폐기 지점(`MetricIngestor` 3 · `ApmMetric1mStore` 3)에 `recordForService` 한 줄씩 추가(기존 `record` 호출은 그대로) | `collector/ingest/drop/ApmServiceDropTally·ApmIngestDropStatRecorder`, `collector/drops/ApmServiceDropSummary*`, `ApmIngestStatusController` |
| 6 | 요청 0건 vs 수신 없음 | 서비스 행·상세 `requests`·`received`, 개요 `totals.requests`·`received`. `received` = `ApmMetricStore#servicesWithData`(VALUES × EXISTS 한 질의) | `ApmServiceRowDto`·`ApmServiceDetailDto`·`ApmServiceQueryService`·`ApmOverviewDto`·`ApmOverviewQueryService` |
| 7 | SLO UNKNOWN 사유 | `ApmSloRowDto.unknownReason` ← `ApmSloCalculator.unknownReason(status, measured)` | `slo/*` |
| 8 | 인스턴스 지표 가능 | `ApmInstanceRowDto.metricsAvailable` = 기존 판정 `choose(from,to,60)==M1`을 변수로 꺼내 행마다 | `ApmInstanceRowDto`·`ApmServiceQueryService#instanceRows` |

테스트: 신규 9클래스(45건) + 기존 7클래스 수정 + IT 2건 추가(`ApmMetricStoreIT`) + 계약 표본 14파일 갱신. 실행 결과 — 앱 전체 단위 4,179건 실패 0(IT 끔) · APM 패키지 IT 포함 2,093건 실패 0·skip 0(IT 313건 실행).

## 의도 (선택한 설계 · 버린 대안)

- **필드 추가만**: 기존 필드 의미 불변을 위해 record 정식 생성자가 바뀐 곳마다 **이전 시그니처의 호환 생성자**를 남겼다(`ApmRedSeriesDto` 6인자, `ApmInstanceRowDto` 19인자, `ApmRuntimeSeriesDto` 3인자, `Totals` 5인자, 집계 DTO 7종). 호환 생성자가 채우는 기본값(`null`/빈 맵/`true`)이 "계산하지 않음"을 뜻한다.
- **#3 권한**: `GET /apm/settings`를 view로 넓히지 않고 새 EP를 뒀다(넓히면 마스킹·등록 모드가 같이 열린다).
- **#3 승격 판정은 그대로 상수**: `ApmResolution`을 유효 일수로 바꾸면 모든 시계열의 step이 달라질 수 있어(동작 변경) 손대지 않았다. 대신 `resolutions[].mismatch`로 갈림을 드러낸다.
- **#3 JDBC로 읽기**: `SchedulerSettingRepository` 주입은 `LicenseArchitectureTest` A3(premium → app 리포지토리 금지)에 걸려서 `ApmErrorGroupExporter#retentionDays`와 같은 길(JdbcTemplate)을 택했다. 옵션 해석은 엔티티 `SchedulerSetting.optionInt`를 그대로 쓰려고 읽은 JSON을 빌더로 엔티티에 담는다.
- **#4 컨트롤러에서 붙임**: 5개 조회 서비스의 반환 경로(`empty()` 포함)가 많아 서비스마다 넣으면 빠뜨리기 쉽다. 컨트롤러 마지막 한 곳에서 붙이면 경로가 하나다. 조회 서비스 생성자는 바뀌지 않는다(IT·다른 소비자 영향 없음).
- **#5 메모리 카운터**: 지시대로 DB 테이블 신설 없음. 재기동 초기화·인스턴스 로컬·서비스를 아는 메트릭 폐기만이라는 한계를 응답(`source`·`countingSinceMs`·`overflowCount`)과 계약에 싣는다. 버린 것: `apm_ingest_drop_stat.metric_name`에 `@svc:` 접미를 전 사유로 확대 — 기존 `/drops` 행 키가 서비스 수만큼 쪼개져 관리 화면 의미가 바뀐다.
- **#6 received**: 인스턴스 `lastSeenAt` 대신 메트릭 표 EXISTS — 인스턴스 행은 30일 미수신이면 지워져 과거 창에서 거짓 false가 난다.
- **#8**: 응답이 배열이라 최상위 필드를 못 붙여 행마다 같은 값. 7일 프리셋 경계 동작(명세 §6-2)은 바꾸지 않았다.

## 중점 확인 요청

1. **`ApmRetentionJob` 리팩터가 동작 불변인가** — 19개 옵션 키 문자열·기본값이 `ApmRetentionDays.from`과 1:1인지(키를 레코드 필드명과 같게 뒀고 스크립트로 옮겼다). `ApmRetentionJobIT`(12건)가 이 경로를 실DB로 돈다. 특히 `errorGroupDays`·`dbQueryGroupDays`의 기본값(90)과 `receiptDays`(2).
2. **`servicesWithData` SQL** — `(values (?::bigint), …) as v(id)` × `exists(select 1 from <표> where service_id = v.id and bucket_start >= ? and < ?)`가 파티션 프루닝과 인덱스 선두(`service_id`)를 실제로 타는가. 서비스 수백 개 목록에서 비용(EXPLAIN 미실시). 목록 화면 호출마다 1회 추가 질의다.
3. **`lastBucketOf`의 `max(bucket_start)`** — 인덱스 `(service_id, metric, bucket_start)` 역방향 스캔으로 파티션마다 1행에 끝나는가(7일 = 파티션 7~8개). 상세·red-series 호출마다 1회.
4. **`received`의 5m/1h 롤업 지연** — 6시간 초과 창은 5m을 읽는데, 창이 "최근 몇 분" 쪽으로만 치우친 경우 롤업 전이라 false가 날 수 있다. 계약에 적었지만 수용 가능한지.
5. **메모리 카운터 경합** — `ApmServiceDropTally.record`의 `size() >= MAX_KEYS` 판정과 `computeIfAbsent` 사이 경합으로 상한을 약간 넘을 수 있다(허용 오차로 봤다). `lastSeenMs` volatile 비교-대입이 원자적이지 않아 동시 기록 시 약간 이른 값이 남을 수 있다.
6. **`recordForService` 추가 위치** — `ApmMetric1mStore`의 `REBUCKETED`·`RAW_BOUNDS`는 "변형"이지 손실이 아닌데 서비스 요약에도 같이 나간다. 화면이 사유별로 문구를 가르면 문제없지만 `total`(합)은 단위가 섞인다(계약에 명시).
7. **`unknownReason`의 OUT_OF_RETENTION** — `Measured.empty(from, to)`도 `measuredFrom == measuredTo`라, 측정 결과가 비어 들어오는 다른 경로가 있으면 `OUT_OF_RETENTION`으로 오판한다. `row()`에 `measured == null`이 오는 경로는 `NOT_MEASURABLE`로 분리했지만, `measureBatch`의 `toMs <= fromMs` 분기도 같은 모양이다(롤링 창에서는 발생하지 않는다고 판단).
8. **호환 생성자의 기본값** — `ApmInstanceRowDto` 10·19인자 생성자가 `metricsAvailable=true`를 채운다. 운영 코드는 정식 생성자만 쓰도록 바꿨지만, 누락된 호출처가 있으면 보존 밖 창에서 true가 나간다(grep 확인 요청).
9. **ArchUnit·패키지 규칙** — `service.runtime`은 허용목록(`collector`)을 직접 보지 않고 `Binding.ingestible`을 쓰며, 일치는 테스트가 고정한다. `collector.setting → core.batch.retention`, `trace/servicemap 컨트롤러 → core.batch.retention` 의존이 새로 생겼다(방향은 core로). `core.setting → collector.setting` 역방향 줄은 늘리지 않았다.

## 확인 방법

```powershell
$env:JAVA_HOME = "C:\Program Files\Java\jdk-17"; Set-Location C:\worktrees\zm-152-be
$env:IT_DB_URL = "jdbc:postgresql://localhost:1/"   # IT 끄고 단위만
.\gradlew.bat :test
Remove-Item Env:IT_DB_URL                          # IT 포함(다른 워크트리 test worker 없을 때만)
.\gradlew.bat :test --tests "com.dmove.moveseye.premium.apm.*"
```

## 검수 결과(코덱스 v1)

- 원문: `reviews/review_zm-152-be-self-explain_codex.md` — 판정 "수정 후 재검수"(필수 R1~R4, 권장 R5~R6). 같은 워크트리에서 **6건 전부 반영**(미커밋).

| # | 구분 | 반영 | 내용 | 테스트 |
|---|---|---|---|---|
| R1 | 필수 | [x] | `ApmRetentionDays.from()`의 `opt()`가 **0 이하 → 기본값**(+WARN, 키=값마다 1회). 잡·조회가 같은 양수만 본다. 양수는 그대로(동작 불변) | 🆕 `ApmRetentionNormalizationTest` — 0·음수 옵션으로 `ApmRetentionJob.run`의 **배치 인자**(`dropExpiredPartitions(7,30,10)` 등)와 정책의 **응답 경계**(`now−7일`)를 한 테스트에서 함께 단언 · 19키 전부 양수 고유값이 배치로 그대로 가는지 단언. `ApmRetentionPolicyTest`의 "응답만 1일 보정" 단언은 정규화 단언으로 교체 |
| R2 | 필수 | [x] | 예외 목록·시계열 경계 = `ApmRetentionDays.errorGroupVisibleDays()` = `min(errorGroup1hDays, errorGroupDays)`. 보존 EP에도 `errorGroupVisibleDays` 노출 | 역전(7 < 90) — `ApmRetentionNormalizationTest` + `ApmReadAccessMvcTest#reversedGroupRetentionUsesShorter`(실제 응답 JSON) |
| R3 | 필수 | [x] | DB 쿼리 목록·시계열 = `dbQueryVisibleDays()` = `min(dbQuery5mDays, dbQueryGroupDays)` + 보존 EP 노출. 🔍 외부 의존·서비스 맵 점검: `ApmRetentionService`에 본체 테이블·연쇄 삭제가 없다(파티션 DROP만) → 변경 불필요 | 역전(5 < 30) — 위 두 테스트 |
| R4 | 필수 | [x] | `ApmSloCalculator`에 `ApmRetentionPolicy` 주입. `measureBatch`가 창 시작을 유효 `rollup1hDays` 경계로 자르고 `Measured.retentionClipped`(신규 컴포넌트, 5인자 호환 생성자=false)로 전달. `unknownReason`이 **요청 수보다 먼저** 잘림을 보고 `OUT_OF_RETENTION` | 기본 보존에서 기존 `ApmSloCalculatorTest` 28 · `ApmSloServiceTest` 22 전부 불변 통과 |
| R5 | 권장 | [x] | `ApmServiceDropTally` — 새 키는 `AtomicInteger` CAS로 자리 예약(실패=overflow, `putIfAbsent` 경합 패배 시 반납), 카운트 `LongAdder`, `lastSeen`은 `AtomicLong.accumulateAndGet(now, Math::max)` | 🆕 동시 시작 테스트(16스레드 × 새 키 1,000 + 공유 키 뒤섞인 시각): 키 수 ≤ 10,000 · 건수 보존(행+overflow = 32,000) · 공유 키 lastSeen = 최댓값 |
| R6 | 권장 | [x] | `ApmSloUnknownReasonTest`가 **실제 `measureBatch()` + 보존 정책**을 통과: 1h 1일 < 7일 창 → `retentionClipped`·`OUT_OF_RETENTION`, 기본 보존 7·30일 → 잘림 없음·`NO_REQUESTS`, 창 전체 밖 → 조각 없음·`OUT_OF_RETENTION` | 🔴 **변이 확인**: `boolean clipped = false`로 R4를 끄면 R6 테스트 2건 실패(`:74`·`:109`) — 되돌린 뒤 통과 |

재검수 시 볼 곳: `ApmRetentionDays#opt·errorGroupVisibleDays·dbQueryVisibleDays`, `ApmSloCalculator#measureBatch·unknownReason`, `ApmServiceDropTally#record·reserveSlot`, 컨트롤러 2개(`ApmErrorController`·`ApmDbQueryController`)의 메서드 참조.

반영 후 테스트: 앱 전체 단위 4,188건 실패 0(IT 끔) · APM 패키지 IT 포함 2,100건 중 2,098 통과(IT 313 전부 통과), 실패 2는 `ApmCollectorLiveRuntimeTest` 임시 디렉터리 정리의 Windows 파일 잠금(`collector.log` 사용 중) — 단독 재실행 통과, 변경 범위와 무관. R6 변이(R4 비활성) 시 2건 실패 확인.

## 검수 결과(코덱스 v2) — 2026-09-28

- 대상: v1 지적 R1~R6 반영본. 원문 `review_zm-152-be-self-explain-v2_codex.md`.
- R1~R6 전부 닫힘(R1 정규화가 배치·응답 공통, 0은 원래 무기한이 아니라 삭제 범위 불변 · R2/R3 min 규칙 목록·시계열 모두 · R4 유효 H1 경계 반영, 400일 기본에서 계획 불변 · R5 CAS/LongAdder/accumulateAndGet(max) + 16스레드 경합 테스트 · R6 measureBatch 실경로). 새 결함 0.
- **판정: 승인.** 커밋은 사용자 승인 대기.
