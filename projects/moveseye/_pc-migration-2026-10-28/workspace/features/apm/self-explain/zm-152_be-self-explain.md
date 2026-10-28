# ZM-152 화면 자기설명 — BE 요청 8건 구현 보고

> 작성 2026-09-28 · BE `moveseye-be-spring` · 워크트리 `C:\worktrees\zm-152-be`(브랜치 `ZM-152-be`, master `3f731d5` 기준) · 🔴 **미커밋**(사용자 승인 대기)
> 명세 정본: [`zm-152_screen-self-explaining.md`](zm-152_screen-self-explaining.md) §1·§5·§6 · 계약: [`./contract_zm-152-self-explain-be.md`](contract_zm-152-self-explain-be.md) · 검수 인계: [`./review_zm-152-be-self-explain.md`](review_zm-152-be-self-explain.md)

## 0. 한 줄 요약

8건 모두 **응답 필드 추가**(새 EP 2개 포함)로 구현했다. 마이그레이션 없음. 기존 필드의 의미·형태는 그대로이고, 바뀐 record마다 이전 시그니처의 호환 생성자를 남겼다. 5번(폐기 서비스 축)은 지시대로 DB 없이 **프로세스 메모리 카운터**로 최소 구현했고 그 한계를 응답과 계약에 실었다.

| # | 상태 | 요지 |
|---|---|---|
| 1 | ✅ 완료 | 런타임 `absentSlots` |
| 2 | ✅ 완료 | red-series `activeRequestsObserved`(창 안) + `activeRequestsLastSeenMs`(최근 7일), 상세 `activeRequestsLastSeenMs` |
| 3 | ✅ 완료 | 🆕 `GET /apm/settings/retention`(view) — 잡 옵션 실제 유효값 + 승격 상수와의 대조 |
| 4 | ✅ 완료 | 트레이스·예외·DB·의존·서비스 맵 9개 EP에 `oldestAvailableMs` |
| 5 | 🟡 부분(설계상 한계) | 🆕 `GET /apm/ingest/drops/by-service`(view) — 메모리 카운터, 재기동 초기화·메트릭 신호만 |
| 6 | ✅ 완료 | 서비스 행·상세·개요 totals `requests`·`received` (홈 위젯 제외) |
| 7 | ✅ 완료 | SLO `unknownReason` |
| 8 | ✅ 완료 | 인스턴스 행 `metricsAvailable` |

## 1. 바꾼 파일

### 신규 — 운영 6
| 파일 | 내용 |
|---|---|
| `premium/apm/core/batch/retention/ApmRetentionDays.java` | `apm_retention` 잡 옵션 19키의 **단일 정본**(키·기본값·`from(SchedulerSetting)`·`oldestAvailableMs`). RUM 상수 3개 노출 |
| `premium/apm/core/batch/retention/ApmRetentionPolicy.java` | 조회용 유효 일수 — `scheduler_setting`을 **JDBC**로 읽음, 60초 캐시, 실패 시 기본값+`configured=false`, `attach(dto, with, table)` null 안전 |
| `premium/apm/collector/setting/ApmRetentionDto.java` | `GET /apm/settings/retention` 응답(표별 일수 + `resolutions[]` 승격 상수 대조·`mismatch`) |
| `premium/apm/collector/ingest/drop/ApmServiceDropTally.java` | 서비스×사유×메트릭×신호 메모리 카운터(키 상한 10,000·overflow·startedAt) |
| `premium/apm/collector/drops/ApmServiceDropSummaryDto.java` | `GET /apm/ingest/drops/by-service` 응답 |
| `premium/apm/collector/drops/ApmServiceDropSummaryService.java` | 위 조립(서비스 지정/전체, 404, 상한) |

### 수정 — 운영 32
| 파일 | 내용 |
|---|---|
| `core/batch/retention/ApmRetentionJob.java` | 🔴 옵션 파싱을 `ApmRetentionDays.from(setting)`으로 교체(기본값 상수 이동, 동작 불변). `jobKey()`도 상수 참조 |
| `core/metric/ApmMetricStore.java` | `lastBucketOf`(max bucket) · `activeRequestsLastSeenMs`(1m 최근 7일) · `servicesWithData`(VALUES×EXISTS 한 질의) |
| `collector/ingest/drop/ApmIngestDropStatRecorder.java` | `serviceTally` 필드 + `recordForService` 2종(DB 안 씀) |
| `collector/ingest/store/MetricIngestor.java` | `NOT_ALLOWLISTED`·`ROUTE_OVERFLOW`·`CUMULATIVE_FIRST_SKIPPED` 옆에 `recordForService` |
| `collector/ingest/store/ApmMetric1mStore.java` | `BOUNDS_CONFLICT`·`REBUCKETED`·`RAW_BOUNDS` 옆에 `recordForService` |
| `collector/ingest/status/ApmIngestStatusController.java` | 🆕 `GET /apm/ingest/drops/by-service`(`requireRead`) |
| `collector/setting/ApmSettingController.java` | 🆕 `GET /apm/settings/retention`(`requireRead`) |
| `service/runtime/RuntimeSlotMap.java` · `ApmRuntimeSeriesDto.java` | `absentReasons(family, present)` · `absentSlots` 필드·상수·호환 생성자 |
| `service/red/ApmRedSeriesDto.java` · `ApmSeriesQueryService.java` | 관측 2필드 + 6인자 호환 생성자 · `buildRed`(서비스 RED만)·`runtime`(부재 사유) |
| `service/list/ApmServiceRowDto.java` · `ApmServiceDetailDto.java` · `ApmServiceQueryService.java` | `requests`·`received`(행·상세), 상세 `activeRequestsLastSeenMs`, 인스턴스 `metricsAvailable` 전달 |
| `service/instance/ApmInstanceRowDto.java` | `metricsAvailable` + 19인자 호환 생성자 |
| `overview/ApmOverviewDto.java` · `ApmOverviewQueryService.java` | `Totals.requests`·`received` + 5인자 호환 생성자 · `Window` 내부 record |
| `slo/ApmSloRowDto.java` · `ApmSloCalculator.java` · `ApmSloService.java` | `unknownReason` 필드·판정 함수·조립 |
| 집계 DTO 7 — `trace/query/ApmTraceListDto`·`ApmScatterDto`·`ApmAggSeriesDto`, `trace/errors/ApmErrorGroupsDto`, `trace/dbquery/ApmDbQueryGroupsDto`, `trace/dependency/ApmDependenciesDto`, `servicemap/ApmServiceMapDto` | `oldestAvailableMs` + 호환 생성자 + `withOldestAvailableMs` |
| 컨트롤러 5 — `ApmTraceController`·`ApmErrorController`·`ApmDbQueryController`·`ApmDependencyController`·`ApmServiceMapController` | `ApmRetentionPolicy` 주입, 9개 EP 응답에 `retention.attach(...)` |

### 테스트 — 신규 9 · 수정 7 · 계약 표본 14
| 파일 | 건수 | 내용 |
|---|---|---|
| 🆕 `core/batch/retention/ApmRetentionPolicyTest` | 9 | 옵션 우선·깨진 값 기본값·행 없음·빈 옵션·실패/깨진 JSON·60초 캐시·경계 계산·attach null·0일 보정·시드 기본값 |
| 🆕 `collector/setting/ApmRetentionDtoTest` | 2 | 기본값 `mismatch=false`, 1m 단축 시 `mismatch=true` |
| 🆕 `service/runtime/RuntimeSlotMapAbsentTest` | 6 | JVM·.NET·unknown·전부 있음·순서 + 🔴 `ingestible == 허용목록` 일치 |
| 🆕 `service/red/ApmSeriesSelfExplainTest` | 5 | 런타임 빈 응답도 사유·겹침 없음 / red-series 관측 true·never / 엔드포인트 시계열 null·미조회 |
| 🆕 `service/list/ApmServiceSelfExplainTest` | 6 | 0건+수신·수신 없음·합계(목록=상세)·액티브 마지막 관측·인스턴스 `metricsAvailable` true/false·빈 인스턴스 |
| 🆕 `overview/ApmOverviewTotalsSelfExplainTest` | 4 | 0건+수신·수신 없음·합계·대상 없음=null |
| 🆕 `collector/ingest/drop/ApmServiceDropTallyTest` | 4 | 누적·정렬·센티널/0건 무시·키 상한 overflow·recorder DB 미접촉 |
| 🆕 `collector/drops/ApmServiceDropSummaryServiceTest` | 4 | 지정 서비스·폐기 없음 total 0·404·전체 정렬(지워진 서비스 제외) |
| 🆕 `slo/ApmSloUnknownReasonTest` | 5 | 비UNKNOWN null·NO_REQUESTS·NOT_MEASURABLE·OUT_OF_RETENTION·null 측정 |
| `ApmAdminAccessMvcTest` | +2 | view 전용 사용자가 retention·by-service 통과(설정 값은 403 유지) / 권한 없으면 403 |
| `ApmReadAccessMvcTest` | +1 | 트레이스·예외 목록 응답의 `oldestAvailableMs` = 지금 − 7일/90일 |
| `core/metric/ApmMetricStoreIT` | +2 | 🔴 실 PG에서 `servicesWithData`(센티널·빈 창)·`lastBucketOf`/`activeRequestsLastSeenMs` |
| `MetricIngestorTest` | 검증 1줄 | `recordForService`가 `record`와 같은 횟수로 불린다 |
| `ApmContractFixtures`·`ApmCollectorApiMvcTest`·`ApmOverviewQueryServiceTest` | 호출처 | 생성자 인자 추가, 표본에 새 필드 값(관측·absentSlots·totals·oldest) |
| `src/test/resources/apm/contract/*.json` 14 | — | 새 키만 추가(값 변경 없음). 각 파일의 기존 서식(Jackson / 2칸 JSON) 유지 |

변경 합계: 추적 파일 53 수정(+751/−166) + 신규 15 = **68파일**.

## 2. 항목별 구현과 한계

### #1 런타임 부재 사유
`RuntimeSlotMap.absentReasons(family, slots.keySet())` — 이 패밀리의 슬롯 중 응답에 없는 것마다 바인딩 `ingestible`이 전부 false면 `NOT_INGESTIBLE`, 아니면 `NOT_RECEIVED`. 데이터가 한 점도 없어 빈 `slots`로 돌아가는 경로에도 붙인다. `service.runtime`이 수신 허용목록(`collector`)을 직접 import하지 않도록 `Binding.ingestible`을 쓰고, 둘이 같은지는 테스트가 고정한다(현재 전 패밀리 일치 확인).
- 한계: 보존 밖 창도 `NOT_RECEIVED`(세 번째 코드 없음 — 명세 값 2개 준수).

### #2 액티브 요청 관측
- 창 안: `buildRed`가 이미 읽는 게이지 표본으로 `activeRequestsObserved`(추가 질의 없음).
- 창 밖: `apm_metric_1m`에서 `max(bucket_start) where service_id=? and metric='http.server.active_requests' and bucket_start >= now−7일` 1회. 인덱스 선두 두 열 + 역방향이라 스캔이 아니다(EXPLAIN은 미실시 — 검수 포인트).
- 둘 다 **서비스 전체 RED에만**. 엔드포인트·인스턴스 시계열은 null이고 질의하지 않는다.
- 상세는 창 안 여부가 기존 `activeRequests != null`로 이미 갈려 `activeRequestsLastSeenMs`만 추가.
- 기준 7일 = `ApmResolution.M1` 상수. 명세 권장("창 안 + 보존기간 안 둘 다")을 따랐다.

### #3 유효 보존 일수
- `ApmRetentionDays` 추출 → **잡과 조회가 같은 해석**. 잡의 19개 `optionInt` 줄을 스크립트로 1:1 치환(키 이름 = 필드 이름).
- 🔴 `SchedulerSettingRepository`를 주입했더니 `LicenseArchitectureTest` A3(premium → app 리포지토리 금지)에 걸렸다 → `ApmErrorGroupExporter`와 같이 JdbcTemplate(`select options::text …`) + Jackson 파싱 → `SchedulerSetting` 빌더로 담아 같은 `optionInt` 해석.
- 권한: `GET /apm/settings`(edit)를 넓히지 않고 새 EP(view).
- `ApmResolution`(승격 판정)은 **바꾸지 않았다** — 바꾸면 시계열 step이 달라진다. `resolutions[].mismatch`로 드러낸다.
- 한계: 60초 캐시(옵션 저장 직후 최대 1분 늦음). RUM은 옵션이 없어 상수 노출.

### #4 보존 경계
`oldestAvailableMs = 서버 지금 − 유효 일수(원천 표)`. 보수적 경계(파티션 DROP은 하루 덜 지운다). 조회 서비스는 손대지 않고 **컨트롤러 마지막 한 곳**에서 `retention.attach`로 붙였다(`empty()` 등 반환 경로가 많아서). 같은 DTO를 쓰는 다른 EP(배포 새 오류 등)는 null = "계산 안 함".

### #5 폐기 통계 서비스 축 — 🔴 조사 결과와 한계
**조사**: `apm_ingest_drop_stat` 자연키가 `(token_id, reason, metric_name, signal)`라 서비스 축이 없다. `ROUTE_OVERFLOW`만 `metric_name`에 `@svc:{id}` 접미로 서비스를 싣는다(`ApmDropMetricKey`). 폐기 지점을 전수 확인한 결과 **서비스가 정해진 곳**은 메트릭 경로 6곳뿐이다 — `MetricIngestor.toRow`의 `NOT_ALLOWLISTED`·`ROUTE_OVERFLOW`·`CUMULATIVE_FIRST_SKIPPED`, `ApmMetric1mStore`의 `BOUNDS_CONFLICT`·`REBUCKETED`·`RAW_BOUNDS`. 귀속 실패·승인 대기·거절(서비스를 모름), 신호 미지원(컨트롤러), 트레이스 속성/원문 SQL(스팬 여러 개를 키별로 합산 — 서비스 축 소실)은 서비스를 알 수 없다.
**구현**: 기존 카운터 구조로는 서비스별 집계 불가 → 지시대로 **메모리 카운터 + 서비스 축**. 기존 `record(...)` 호출은 한 글자도 안 바꾸고 옆에 `recordForService(...)`를 한 줄씩 더했다(기존 테스트의 `verify(record)`·`verifyNoInteractions` 불변).
**한계**(응답·계약에 명시): 재기동 시 0부터(`countingSinceMs`) · 인스턴스 로컬 · 메트릭 신호만 · 키 상한 10,000(`overflowCount`) · `total`은 사유 단위가 섞인 합. 영속화가 필요하면 `apm_ingest_drop_stat`에 `service_id` 열(자연키 변경) 또는 별도 테이블 — 후속 결정 사항.

### #6 요청 0건 vs 수신 없음
`requests`(0 포함)는 이미 계산하던 합을 싣기만. `received`는 `servicesWithData` — `(values (?::bigint),…) v(id) where exists(select 1 from <조회 해상도 표> …)` 한 질의(서비스 수백이어도 왕복 1회). 인스턴스 `lastSeenAt`을 쓰지 않은 이유: 인스턴스 행은 30일 미수신이면 지워져 과거 창에서 거짓 false.
- 한계: 5m/1h 롤업 지연으로 "최근 몇 분만"이 승격된 창은 드물게 false 가능. 홈 위젯 `traffic-totals`·`totals.prev`에는 안 실었다.

### #7 SLO UNKNOWN 사유
`status == UNKNOWN`일 때만: 측정 없음 → `NOT_MEASURABLE`, 잰 구간 없음 → `OUT_OF_RETENTION`, `requests == 0` → `NO_REQUESTS`, 그 밖 → `NOT_MEASURABLE`. 롤링 창(7·30일) < 1h 보존(400일)이라 `OUT_OF_RETENTION`은 현재 사실상 안 나온다. 시계열·캘린더 칸에는 미적용.

### #8 인스턴스 지표 가능 여부
기존 판정식 `choose(from,to,60)==M1`을 변수로 꺼내 행마다 싣는다(판정 규칙 불변 — 7일 프리셋 경계 동작 그대로). 응답이 배열이라 행 단위.

## 3. 테스트 결과(실제 실행)

| 실행 | 결과 |
|---|---|
| `.\gradlew.bat build -x test` (전 모듈) | ✅ BUILD SUCCESSFUL |
| `:test`, IT 끔(`IT_DB_URL=…:1/`) — 앱 전체 | ✅ **4,179건, 실패 0, skip 450**(IT 전부 skip) · 4m 5s |
| 〃 APM 패키지만 | ✅ 2,086건, 실패 0, skip 307 |
| `:test --tests "com.dmove.moveseye.premium.apm.*"`, **IT 포함**(도커 5433) | ✅ **2,093건, 실패 0, skip 0** — IT 25클래스 313건 전부 실행(`ApmMetricStoreIT` 17 · `ApmRetentionJobIT` 12 · `ApmSchemaIT` 20 · `ApmExportIT` 12 · 트레이스 IT 38 등) · 4m 19s |

- 첫 실행에서 계약 표본 테스트 14건이 예상대로 실패(새 키) → 테스트 리포트의 "실제" JSON으로 표본을 다시 썼다(파일별 기존 서식 유지, 새 키만 diff).
- 두 번째 전체 실행에서 `LicenseArchitectureTest` A3 1건 실패(리포지토리 의존) → JDBC로 교체 후 전체 통과.
- IT 실행 전 `java.exe` 확인: 다른 워크트리 gradle test worker 없음(데몬 2 + BE 앱 1).

### 3-1. IT 포함 실행
- skip 0 = 도커 5433이 붙어 IT가 실제로 돌았다(시간 0 아님). `ApmRetentionJobIT`가 옵션 파싱 리팩터 경로를 실DB로 통과, `ApmMetricStoreIT` 신규 2건이 `servicesWithData`(VALUES×EXISTS·센티널 제외)·`lastBucketOf`·`activeRequestsLastSeenMs` SQL을 실 PG에서 통과.
- ℹ️ 메모리에 "master 기존 실패"로 적혀 있던 `ApmSchemaIT`(V65 시드 9행 vs 8)는 이번 기준(`3f731d5`)에서 **통과**했다 — 이미 고쳐진 것으로 보인다.

## 4. 뒤집힌 전제

1. **"기존 카운터 구조로 서비스별 집계가 가능한가"** → 불가. 서비스 축은 `ROUTE_OVERFLOW` 접미 하나뿐이고, 트레이스 쪽 폐기는 키별 합산이라 서비스가 사라진다.
2. **"premium 코드가 스케줄러 리포지토리를 쓸 수 있다"** → ArchUnit A3가 막는다. 잡은 `SchedulerSetting`을 인자로 받을 뿐 리포지토리를 안 쓴다.
3. **"`ApmResolution`의 보존이 유효값"** → 아니다. 상수 사본이고 이번에도 동작 불변을 위해 그대로 뒀다. 유효값은 새 EP가 준다.
4. **"보존 경계 = 정확한 삭제 시점"** → 파티션 DROP은 하루 덜 지운다. `oldestAvailableMs`는 "이 이후는 확실히 있다"는 보수적 경계.

## 5. 미해결 · 후속

1. **FE 연동**(별도 과제): `apmRetention.ts` 상수 → `GET /apm/settings/retention`, `apmEmptyReason`에 `received`·`activeRequestsLastSeenMs`·`absentSlots`·`unknownReason`·`metricsAvailable` 반영, 폐기 경로에 by-service. 타입은 옵셔널 추가 권장.
2. **#5 영속화 결정** — 재기동 초기화가 문제면 DB 서비스 축(자연키 변경 or 별도 테이블).
3. **`ApmResolution`을 유효 일수로 승격 판정** — 동작 변경이라 별도 결정(`mismatch`가 true인 설치본이 생기면 필요).
4. **7일 프리셋 인스턴스 경계**(명세 §6-2) — `covers()` 여유 폭 or FE 프리셋 조정, 결정 필요.
5. 홈 위젯 `traffic-totals`에 `requests`/`received` 필요 여부.
6. `servicesWithData`·`lastBucketOf` EXPLAIN 실측(운영 규모) — 검수 포인트 2·3.
7. 런타임 실측(dev BE에 올린 뒤 FE 없이 curl로 새 필드 확인) 미실시 — BE 재기동은 사용자 요청 시에만.
8. 커밋 미실시 — 선별 add 필요(`git add -A` 금지). 커밋 메시지 초안: `#ZM-152 [FEAT] 화면 자기설명 BE 8건 — 런타임 부재 사유·액티브 요청 관측·유효 보존 EP·보존 경계·서비스별 폐기 요약(메모리)·요청0건/수신없음·SLO UNKNOWN 사유·인스턴스 지표 가능 -2026-09-28`

## 6. 코덱스 반영 (v1 — 2026-09-28)

검수 원문 `_archive/features/apm/self-explain/review_zm-152-be-self-explain_codex.md`(판정 "수정 후 재검수"). 필수 R1~R4·권장 R5~R6 **6건 전부 반영**, 같은 워크트리·미커밋.

| # | 지적 | 반영 |
|---|---|---|
| R1 | 0 이하 보존 일수가 응답만 1일로 보정되고 배치는 원값(음수면 미래 기준 삭제 가능) | `ApmRetentionDays.opt()`에서 0 이하 → 기본값 + WARN(키=값마다 1회). 배치·응답이 같은 양수. 🔴 **양수 설정은 삭제 범위 불변** — 19키 전부 고유 양수값이 배치 인자로 그대로 가는지 단언(`ApmRetentionNormalizationTest#positiveValuesUnchanged`). 바뀌는 것은 0·음수 설정 설치본뿐이고, 그 경우 이전보다 **덜** 지운다 |
| R2 | 예외 경계가 `errorGroup1hDays`만 봄(본체 `errorGroupDays`가 짧으면 자식까지 이미 삭제) | `min(errorGroup1hDays, errorGroupDays)` — `ApmRetentionDays#errorGroupVisibleDays`, 보존 EP 필드 추가 |
| R3 | DB 쿼리도 같은 구조 | `min(dbQuery5mDays, dbQueryGroupDays)`. 외부 의존·서비스 맵은 본체 테이블·연쇄 삭제가 없어(파티션 DROP만) 변경 불필요 — `ApmRetentionService` 전 단계 점검 |
| R4 | SLO 측정 계획이 고정 400일만 봐 보존을 줄인 설치본에서 `OUT_OF_RETENTION`이 안 나옴 | `ApmSloCalculator`에 보존 정책 주입, `measureBatch`가 유효 `rollup1hDays` 경계로 자르고 `Measured.retentionClipped` 전달, `unknownReason`이 요청 수보다 먼저 판정. 기본 설정에서 기존 SLO 테스트 50건 불변 |
| R5 | 메모리 카운터 상한이 동시 삽입에 뚫림·lastSeen 퇴행 | CAS 자리 예약 + `LongAdder` + `accumulateAndGet(max)`, 동시 시작 테스트 |
| R6 | OUT_OF_RETENTION 테스트가 손으로 만든 `Measured`라 결함 미검출 | 실제 `measureBatch()` + 보존 정책 경로로 교체. **변이 확인**: R4를 끄면(`clipped=false`) 2건 실패 → 되돌려 통과 |

### 6-1. 반영 후 테스트
| 실행 | 결과 |
|---|---|
| `:test` 앱 전체, IT 끔 | ✅ **4,188건, 실패 0, skip 452**(IT) · 6m 51s |
| R6 변이 실행(`ApmSloUnknownReasonTest`, R4 비활성) | ❌ 7건 중 2건 실패(의도) → 원복 |
| APM 패키지 IT 포함(도커 5433, zm-154 워크트리 테스트 종료를 405초 기다린 뒤) | 2,100건 중 **2,098 통과**, IT 313건 전부 실행·통과 · 실패 2 = `ApmCollectorLiveRuntimeTest`(아래 §6-2, 환경성) |

### 6-2. IT 포함 실행
- IT 313건 skip 0·실패 0 — `ApmRetentionJobIT` 12(정규화 리팩터 경로), `ApmMetricStoreIT` 17, SLO·트레이스 IT 포함.
- 실패 2건은 `ApmCollectorLiveRuntimeTest`(실제 otelcol 바이너리를 띄우는 테스트)의 **임시 디렉터리 정리 단계** `FileSystemException: collector.log — 다른 프로세스가 사용 중`이다. Windows에서 수집기 프로세스가 로그 파일을 늦게 놓아 `@TempDir` 삭제가 실패한 것으로, 이번 변경(보존·SLO·폐기 카운터)과 코드 경로가 겹치지 않는다. **같은 클래스만 단독 재실행 → 통과**(BUILD SUCCESSFUL). 직전 IT 포함 실행(코덱스 반영 전)에서도 통과했었다.

### 6-3. 뒤집힌 전제(추가)
- "보존 일수 옵션은 늘 양수" → 아니었다. 잡이 0·음수를 그대로 삭제 인자로 썼다(R1 이전부터 있던 잠재 결함, 이번 추출로 드러남).
- "예외·DB 화면의 보존은 버킷 표 하나로 결정" → 본체 삭제가 자식을 끌고 간다(R2·R3).
