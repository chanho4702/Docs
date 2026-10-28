**종합 판정: 다음 커밋(WS-1)에 앞서 수정이 필요한 🔴 9건입니다.** 핵심은 lease의 잠금 대기 중 시간 판정, 종료 이후 tick 재개, 전역 차원 UPSERT 교착, Top SQL의 집계 범위·완전성, typed 집계의 정보 유실입니다.

코드·DB·문서를 수정하지 않았고 빌드·테스트도 재실행하지 않았습니다. 아래 재현은 **코드와 PostgreSQL 동작에서 도출한 결정적 입력·실행 순서**이며, 이번 세션에서 실행한 재현 시험은 아닙니다.

**검수 범위와 증거**

`git log --oneline 87d8c95..HEAD`와 각 커밋의 `git show --stat`로 다음 범위를 확인했습니다.

| 커밋 | 범위 | 판정 요약 |
|---|---|---|
| `b0b3893` | V90, PG lease·writer·checkpoint | 원자적 저장 구조는 타당. 잠금 대기 뒤에도 오래된 `now()`로 유효성을 판단하는 경로는 🔴 |
| `3f1f1d5` | APM 보존 구현체 공통 추출, V91 | 이번 추출로 발생한 동작 회귀는 확인하지 못함. 운영 규모·삭제 비용은 🟡 |
| `32c72f5` | 폴러 조립, ConfigSource·SecretResolver, 상태 API | 종료 뒤 진행 중 tick이 다시 lease를 얻을 수 있는 경로는 🔴 |
| `10cbb08` | PG 어댑터 | Top SQL의 `toplevel` 기본 범위와 eviction 완전성 판정은 🔴 |
| `6e255e3` | typed 표·저장·보존 | 차원 교착, 노드 혼합, 카운터 간격 유실, DDL 트랜잭션 경계, 참조 중 차원 삭제는 🔴 |

브랜치는 `ZM-172`, HEAD는 `6e255e3`이며 `5d677e3` 위 8커밋입니다. 이전 세 커밋의 기존 지적은 다시 결함으로 집계하지 않았습니다.

검수 도중 다른 작업으로 생긴 미커밋 변경은 제외했습니다. 여기에는 라이선스 관련 파일과 `CodecSecretResolver`, `DbmErrors`, 관련 테스트 및 새 `DbmSecretCodec`이 포함됩니다. **이 보고서는 해당 수정 전 HEAD를 평가합니다.**

XML에서 확인한 수치는 다음과 같습니다.

| XML 범위 | tests | failures/errors/skipped |
|---|---:|---:|
| app `premium.dbm.*` | **40** | 0 / 0 / 0 |
| `ApmArchiveGateArchTest` | 7 | 0 / 0 / 0 |
| `LicenseArchitectureTest` | 10 | 0 / 0 / 0 |
| `dbm-collector-core` | 140 | 0 / 0 / 0 |

요청서의 **DBM 46건과 현재 XML의 40건은 불일치**합니다. app `realTargetCollects` 1건과 코어 `PgEngineAdapterLiveIT` 4건은 현재 XML에서 실제 실행됐습니다. 코어 XML 시각은 2026-10-27 08:27 UTC, app 선별 XML은 같은 날 09:12 UTC입니다.

현재 app XML에는 APM 배치 회귀 테스트 전체 결과가 남아 있지 않습니다. 따라서 문서의 과거 “141건 통과”와 이번에 직접 읽은 XML 증거는 구분합니다.

근거의 파일명은 다음 디렉터리를 기준으로 합니다.

- `PgLeaseClient`·`PgBatchWriter`·`PgCheckpointStore`·`PgConfigSource`·`CodecSecretResolver`·`PgTypedRowStore`: `src/main/java/com/dmove/moveseye/premium/dbm/collector/j1/`
- `Pg*Collector`·`PgSqlText`·`PgEngineAdapter`·`PgServerInfo`·`DeltaWindow`: `dbm-collector-core/src/main/java/com/dmove/moveseye/premium/dbm/collector/core/adapter/pg/`
- `DailyPartitionService`·`RetentionOptions`·`RetentionStepRunner`·`SchedulerOptionsReader`: `src/main/java/com/dmove/moveseye/premium/common/` 아래 해당 패키지
- 모든 행 번호는 검수 대상 HEAD 기준입니다.

---

**1. 요청서 중점 1~9 판정**

| # | 판정 | 근거(파일:행) | 조치 | 이월 |
|---|---|---|---|---|
| 1. lease UPDATE 규칙 | **🔴** | `PgLeaseClient.java:40–67` | 대기 없는 정상 경로의 FREE·동일 run 연장·다른 run 거부·반납 경계는 맞다. 그러나 `now()`는 잠금 획득 시각이 아니다. 대기 중 TTL을 넘기면 만료된 lease를 같은 epoch로 갱신하거나 이미 지난 만료 시각을 반환할 수 있다. **N1** | WS-1 전 |
| 2. writer 원자 경계 | **🔴** | `PgBatchWriter.java:44–50,100–143`; `PgTypedRowStore.java:58–85,254–286` | `FOR SHARE`는 인계 UPDATE와 충돌하고 배치·typed 행·checkpoint는 같은 트랜잭션이다. 다만 유효기간 판정의 오래된 시각(**N1**), 차원 잠금 순서(**N3**), 파티션 준비의 바깥 트랜잭션 참여(**N8**)를 수정해야 한다. | WS-1 전 |
| 3. 사유 매핑 | **OK / 🟡** | `PgBatchWriter.java:90–114,126–143`; 계약 §1.3 | 대상 없음→TARGET_UNASSIGNED, 세대 불일치→GENERATION_MISMATCH, 숫자 아닌 token·COLLECTOR 소유→STALE_LEASE는 모두 대상 lease를 버리는 행동으로 연결돼 현재 흐름상 맞다. EXPIRED_WINDOW 미구현은 J1의 현재 관측만 처리하는 범위에서 수용. 장기 지연 배치 창은 별도 확정 필요. | EXPIRED 창: WS-10·J2 |
| 4. 스키마 | **🔴** | `V90:96–155`; `V92:131–175`; `PgTypedRowStore.java:103–143` | timestamptz와 checkpoint PK는 타당. 배치 무한 증가는 V91로 해소됐고 임시 row 표는 V92에서 제거됐다. 그러나 노드 구분과 카운터 관측 간격이 typed 집계에서 소실된다. **N6·N7** | WS-1 전 V93 |
| 5. IT 공백 | **🟡** | `DbmJ1PgStoreIT.java:68–129,136–245`; `PgTypedRowStoreIT.java:65–220` | 순차 규칙·롤백·멱등·기본 매핑은 검증한다. 동시 acquire, 동일 키 동시 INSERT, 반대 순서 차원 UPSERT, 종료 중 config 대기, 외부 tx 안 파티션 생성은 검증하지 않는다. 600ms sleep은 정상 부하에서 타당하지만 첫 요청이 300ms 이상 밀리면 두 번째 요청의 “아직 유효” 단언은 불안정하다. | 🔴 수정 시험은 수정 커밋에 포함. RTO는 HA 검증 |
| 6. APM 회귀 | **OK / 🟡** | `ApmPartitionService.java:91–139,167–215`; `ApmRetentionPolicy.java:42–74`; `RetentionStepRunner.java:36–68` | 같은 txManager가 공통 DROP과 메트릭 guard에 주입된다. 기존 guard의 REQUIRED 경계·잠금 선택·DDL 문자열·단계 순서·요약·최상위 부분 실패 메시지는 보존됐다. 로거 이름과 예외 cause 계층은 달라졌으므로 “모든 로그가 바이트 단위 동일”은 과장이다. | 추가 필수 수정 없음. 회귀 XML 보관 보강 |
| 7. DBM 보존 판단 | **🟡** | `DbmRetentionService.java:59–87,115–125`; `V90:130–155`; 설계 §6.3 | 디스크 자동 완화 제거는 명시된 설계 결정으로 수용한다. 다만 설치 디스크 감시·용량 실측 없이 운영 규모를 인증할 수는 없다. checkpoint 30일 삭제 후 baseline은 안전하다. 대량 DELETE 비용과 인덱스는 실측 필요. 차원 삭제의 참조 안전성은 별도 **N9** | 성능·롤업: WS-10. N9는 WS-1 전 |
| 8. J1 조립 | **🔴** | `DbmPollerManager.java:124–184`; `PgConfigSource.java:104–170`; `CodecSecretResolver.java:58–84` | 라이선스와 대상 캐시 분리는 타당하다. 그러나 `shutdownNow`와 5초 대기는 tick 종료를 보장하지 않으며 `runtime.shutdown()`은 이후 작업 시작을 금지하지 않는다. **N2**. Codec 형식·캐시 무효화·대상별 격리는 WS-1에서 함께 처리한다. | N2는 WS-1 전. 나머지는 WS-1 |
| 9. 🔴 선정 원칙 | **OK** | 아래 N1~N9의 입력·순서 | 모두 현재 코드에서 구성 가능한 경로로 한정했다. 운영 발생 빈도·성능 한계·다중 버전 실측은 확인하지 못한 것을 명시했다. | — |

`FOR SHARE`가 다른 SHARE와 공존하면서 UPDATE를 막는다는 판단은 [PostgreSQL 행 잠금 문서](https://www.postgresql.org/docs/17/explicit-locking.html#LOCKING-ROWS)에 근거합니다. 다만 이 잠금이 **시간을 진행시키거나 만료 판정을 다시 수행해 주지는 않습니다.**

---

**2. E — PostgreSQL 어댑터 판정**

| # | 판정 | 근거(파일:행) | 조치 | 이월 |
|---|---|---|---|---|
| E1. PG 12~17 SQL·블로커 | **🟡** | `PgSessionCollector.java:35–58`; `PgLockCollector.java:31–46` | 표준 뷰 기준 버전 분기는 정적으로 맞다. S는 자기 pid를 제외하지만 client backend만 남겨 autovacuum·walsender 등 비클라이언트 블로커의 세션 상세를 버린다. L은 blocker를 LEFT JOIN하므로 간선은 남을 수 있다. S에 블로커 보강 조회 또는 “간선만 존재” 표현이 필요하다. LIMIT은 전체 `pg_blocking_pids` 평가 비용을 제한하지 않는다. | WS-1의 수집 격리·WS-4 락 트리, 부하 검증 |
| E2. C baseline·단위 | **🟡**, 저장 경계는 **🔴** | `DeltaWindow.java:44–67`; `PgCounterCollector.java:126–176`; `PgTypedRowStore.java:366–388` | 재시작→새 checkpoint 키→baseline. reset·DB 삭제로 어느 누적 합이 감소하면 C 전체 baseline이며 게이지도 그 관측에서 빠진다. 감소 없이 reset 뒤 값이 따라잡으면 reset을 알아낼 근거는 없다. counter 증가량과 gauge 현재값은 `kind`로 구분해야 한다. 단위 us/ms/B/count는 일관되지만 `intervalMs` 저장 유실은 **N7** | N7은 WS-1 전. reset marker 보강은 WS-1 |
| E3. Q 차분·Top N·checkpoint | **🔴** | `PgQueryStatCollector.java:57–83,135–145,166–234`; `PgCheckpointStore.java:37–45,76–77` | execUs 순 Top N 자체는 계약과 맞으며 calls 중심 순위는 아니다. 새 native·감소 native는 합산에서 제외한다. 그러나 기본 집합의 toplevel 분리와 eviction 완전성이 빠졌다. **N4·N5**. checkpoint 비용은 **8,000행 UPSERT가 아니다**. 아래 설명 참조. | N4·N5는 WS-1 전. 비용 실측은 WS-10 |
| E4. SQL 보호 | **OK / 🟡** | `PgSqlText.java:50–81`; `PgTypedRowStore.java:219–224,254–274` | 실패·설정 미확인 시 원문을 행에 싣지 않는다. fingerprint는 절단 전 마스킹 결과 기준이라 절단 접두어가 같은 SQL도 구분된다. scs 미확인 시 텍스트 전부 omit하는 선택은 보수적으로 타당하다. 다만 rawHash·omit 사유 등이 typed 표에 보존되지 않는 **N10**이 있다. | 보호 규칙 유지. 저장 계약 정렬은 WS-1·WS-6 |
| E5. Connection 캐시 | **현재 OK / 🟡** | `PgEngineAdapter.java:48,84–91`; `DbmPollerManager.java:86–87`; `ConnectionProvider.java`의 `jdbc()` | Map은 synchronizedMap이다. 현재 매 tick 새 JDBC Connection을 열고 닫으므로 물리 PG 재시작을 같은 살아 있는 접속에서 계속 놓치는 경로는 확인하지 못했다. 다만 풀·재연결 프록시를 도입하면 객체 수명과 물리 접속 수명이 달라질 수 있다. get→load→put도 한 원자 연산은 아니다. | 풀 도입 WS-1에서 캐시 수명 재정의 |
| E6. env 게이트 | **🟡** | `PgEngineAdapterLiveIT.java:34`; `DbmPollerManagerIT.java:183`; `PgLiveEnvironmentGateTest.java:14–23` | 이번 XML에는 실제 실행 증거가 있다. env 없는 일반 개발 실행에서 skip 허용은 가능하다. 지원 버전·릴리스 검증에서는 required 게이트와 실제 LiveIT 선택을 함께 강제해야 한다. 기존 파이프라인의 테스트 미실행 문제는 8차의 기존 이월 항목으로 유지한다. | CI·출시 게이트. 새 결함으로 재집계하지 않음 |

PG 버전별 정적 확인 결과는 다음과 같습니다.

| 대상 버전 | S 분기 | Q 분기 | 실측 |
|---|---|---|---|
| 12 | query_id·leader_pid 대체 NULL | total_time, plan·WAL 대체 0, toplevel 대체 true | 이번 XML에는 없음 |
| 13 | leader_pid 사용 | total_exec_time·total_plan_time·WAL | 이번 XML에는 없음 |
| 14 | query_id 사용 | toplevel·info 뷰 | 이번 XML에는 없음 |
| 15·16 | 위 분기 유지 | 위 분기 유지 | **PG16만 실행 확인** |
| 17 | S 분기 유지 | shared/local I/O time 합산, checkpointer 분리 | 이번 XML에는 없음 |

표준 뷰의 열 존재와 분기는 [PG12 통계 문서](https://www.postgresql.org/docs/12/monitoring-stats.html), [PG13 통계 문서](https://www.postgresql.org/docs/13/monitoring-stats.html), [PG14 pg_stat_statements](https://www.postgresql.org/docs/14/pgstatstatements.html), [PG17 pg_stat_statements](https://www.postgresql.org/docs/17/pgstatstatements.html)에 부합합니다. **업그레이드 후 구버전 extension SQL 정의를 그대로 둔 설치본까지 유효하다는 뜻은 아닙니다.** 서버 버전만으로 extension 열 구성을 단정하지 않도록 capability 단계에서 실제 열을 확인하는 편이 안전합니다.

`pg_blocking_pids(integer)`는 병렬 실행 때문에 중복 pid를 반환할 수 있고 prepared transaction 블로커는 pid 0으로 표현합니다. 호출 자체가 잠금 관리자 상태에 접근하므로 세션 수에 따른 비용도 있습니다. [PostgreSQL 함수 문서](https://www.postgresql.org/docs/17/functions-info.html#FUNCTIONS-INFO-SESSION)

checkpoint 비용 추정은 다음과 같이 정정해야 합니다.

- Q checkpoint는 `(target, QUERY_STAT, bootEpoch, "pg_stat_statements")` **한 행**이다.
- 그 행의 `last_values` jsonb에 최대 `500 × 16 + stats_reset`개 항목이 들어간다.
- C도 별도 한 행이다. 앱 end-to-end IT의 checkpoint 2행 단언과 일치한다.
- 따라서 비용은 “8,000행/분/대상 UPSERT”가 아니라 **큰 jsonb 한 행의 반복 직렬화·TOAST·WAL·vacuum 비용**이다.
- 30일 정리는 native 8,000개를 지우는 작업이 아니라 오래된 boot/kind checkpoint 행을 지우는 작업이다. 실제 비용 수치는 미확인이다.

---

**3. F — typed 표 판정**

| # | 판정 | 근거(파일:행) | 조치 | 이월 |
|---|---|---|---|---|
| F1. UPSERT 잠금 순서 | **🔴** | `PgTypedRowStore.java:58–85,254–286,291–317,432–479` | 중복 키 선접기는 있지만 정렬은 없다. 특히 fingerprint 차원은 전역이므로 서로 다른 대상을 수집하는 두 노드도 같은 두 행을 반대 순서로 잠글 수 있다. **N3**. metric·native·Q 사실 UPSERT도 정렬돼 있지 않지만 현재 단일 slow 레인·대상 lease가 동시 진입을 제한한다. | 전역 차원은 WS-1 전. 나머지도 같은 수정에서 정렬 권고 |
| F2. 파티션 준비와 INSERT | **🔴 / 🟡** | `PgBatchWriter.java:97–100`; `DailyPartitionService.java:98–125,155–175` | 정상 J1의 현재 날짜는 DROP 대상과 떨어져 있다. 오래된 관측·다른 TZ·다른 노드의 stale cache에서는 파티션 부재가 가능하다. 부재 시 writer 예외→롤백→RETRY_LATER이며 FAILED 배치를 별도로 남기지는 않는다. 외부 tx에서 호출하면 준비 DDL이 그 tx에 참여하는 **N8**도 있다. | N8은 WS-1 전. 늦은 데이터·캐시 복구는 WS-10·J2 |
| F3. raw PK·멱등·row_count | **OK / 🟡** | `V92:103,125`; `PgBatchWriter.java:126–139`; `PgTypedRowStore.java:93,100,250,361` | 같은 배치 재전송은 batch UNIQUE에서 반환하므로 typed 행 재삽입까지 가지 않는다. row_count UPDATE는 자신이 INSERT한 batch 행을 갱신하며 target SHARE→UPDATE 승격이 아니다. 다만 raw INSERT의 충돌 무시 건수를 세지 않아 실제 저장 수를 과장할 수 있다. **N11** | WS-1과 함께 |
| F4. FK 없는 사실 표 | **🟡** | `V92:18–19,41–69,75–177` | 대량 사실 CASCADE 회피는 타당하다. 삭제 대상 데이터는 raw가 기본 약 2~3일, 1m이 약 7~8일 남을 수 있다. 목록에 없는 target을 조회에서 배제해야 한다. native CASCADE 뒤 사실의 INNER JOIN 소실은 현재 스키마의 실제 결과다. 삭제 후 이력을 제공할지부터 확정해야 한다. | 대상 삭제 계약 WS-1, 조회 WS-4, 롤업 WS-10 |
| F5. 노드·비율·롤업 열 | **🔴 / 🟡** | `V92:131–175`; `PgTypedRowStore.java:103–143,366–428` | metric에는 node_id 자체가 없고 Q PK에도 node가 없다. 동일 분의 전환 전후 값이 합쳐진다. **N6**. C interval 유실은 **N7**. Q의 total exec/calls 평균은 복원 가능하지만 실제 호출 지연 min/max는 없다. samples는 호출 수가 아니다. | N6·N7은 WS-1 전 V93. min/max·롤업 열은 WS-10 |
| F6. 차원 만료·복원 | **🔴 / 🟡** | `PgTypedRowStore.java:62–65,72,80–84`; `DbmRetentionDays.java:41–48`; `DbmRetentionService.java:115–121` | last_seen은 매 UPSERT마다 갱신된다. NULL 처리된 SQL 텍스트는 같은 fingerprint 재등장 시 복원된다. 기본 400일 대 raw 2일·Q 7일은 안전 여유가 크다. 그러나 옵션 간 관계 검증·실제 참조 검사가 없어 양수 단축 옵션으로 참조 중 ID를 삭제할 수 있다. **N9** | N9는 WS-1 전. 쓰기 증폭·텍스트 갱신 정책은 WS-10 |
| F7. 보존 단계 순서·경계 | **OK / 🟡** | `DbmRetentionJob.java:54–62`; `RetentionStepRunner.java:36–68`; `RetentionOptions.java:35–44`; `DailyPartitionService.java:157–168` | partitionsAhead가 예외를 던져도 뒤 단계는 실행되고 마지막에 실패로 반환된다. 0·음수는 기본값으로 정규화된다. 양수 보존에서 오늘 이름의 파티션을 지우지 않는다. 단 **예외 격리이지 무한 잠금 대기 격리는 아니다**. DDL이 반환하지 않으면 뒤 단계도 기다린다. | DDL/잠금 예산은 WS-10 |
| F8. V92 options 병합 | **OK / 🟡** | `V92:183–187`; `V91:13–18` | `old || defaults || old`이므로 기존 키 우선이 맞다. V91 시드 행을 삭제한 설치본에서는 V92 UPDATE가 0건이고 잡도 등록되지 않는다. 정상 V1~V92 설치 경로의 누락은 아니다. | 시드 행 복구·진단은 WS-10 |
| F9. JVM·DB TZ | **🟡** | `DbmPartitionService.java:52–58`; `DailyPartitionService.java:111–112`; `V92:20–21` | 노드·JDBC 세션 TZ 통일이라는 명시된 운영 전제에서는 일치한다. 다른 TZ가 만든 같은 이름의 파티션을 카탈로그 존재만으로 받아들이면 범위 불일치·다른 날짜 파티션 라우팅·중첩 범위 생성 실패가 가능하다. | 운영 전제 검증 WS-1, UTC 경계 전환은 V93 검토 |

F1은 확인한 APM 경험 노트의 구조와 같습니다. [APM 1m 교착 기록](../../../../../../../../moveseye/2026-09-28-apm-metric1m-deadlock.md)에서도 `LinkedHashMap` 선접기만으로는 요청 간 잠금 순서가 보장되지 않았고, conflict 키 정렬로 해결했습니다. PostgreSQL 역시 다중 객체 잠금 순서 통일을 교착 회피의 기본 방안으로 설명합니다. [PostgreSQL 교착 문서](https://www.postgresql.org/docs/17/explicit-locking.html#LOCKING-DEADLOCKS)

---

**4. G — 커밋 전체 횡단 판정**

| # | 판정 | 근거(파일:행) | 조치 | 이월 |
|---|---|---|---|---|
| G1. DROP 게이트 범위 | **🟡** | `ApmArchiveGateArchTest.java:95–134` | 정규식은 Java 원문 전체를 읽으므로 javadoc도 잡는다. SQL migration·코어 모듈 소스·문자열 분할·동적 SQL까지 검사하지 않는다. V92 DROP은 게이트 밖이다. 또한 DBM 껍데기의 dropExpired 호출자를 보존 서비스로 제한하는 별도 규칙은 없다. | WS-10에서 DBM 호출자·guard 규칙 추가 |
| G2. 라이선스 | **OK / 🟡** | `PgConfigSource.java:104–112,190–200`; `DbmRetentionJob.java:65–68`; `DbmPollerController.java:33`; `PgBatchWriter.java:35–36` | ConfigSource는 대상 TTL과 무관하게 매 호출 라이선스를 판정한다. 보존은 만료 후에도 계속된다. 다만 허용 스냅샷을 이미 받은 tick·이미 시작한 writer는 거부 관측 전까지 진행할 수 있다. “만료 시각 이후 커밋 0”은 보장하지 않는다. | 엄격한 쓰기 차단이 요구되면 WS-1에서 writer 재검증 정책 확정 |
| G3. 비밀번호 노출 | **현재 확정 누출 없음 / 🟡** | `CodecSecretResolver.java:69–84`; `DbmPollerManager.java:280–290`; `DbmPollerStatusResponse.java:85–98`; `CollectorRuntime.java:433–447,598–600` | 대상 JDBC 오류는 코어에서 분류 코드로 축약된다. Codec WARN도 값·암호문을 싣지 않는다. 그러나 레인 최상위 예외는 getMessage와 전체 Throwable을 로그·lastError에 넣는다. 현재 경로에서 평문 비밀번호가 도달하는 확정 사례는 찾지 못했지만 “어떤 예외도 비밀값을 포함할 수 없다”는 보장은 없다. | WS-1의 연결 시험·풀 조립과 함께 코드형 오류·sanitization |
| G4. WS-1 선행 계약 | **🔴 / 🟡** | `V90:26–90`; `PgConfigSource.java:60–71,115–170`; `CodecSecretResolver.java:58–84` | typed 스키마의 N6·N7과 수명·동시성 결함을 먼저 수정한다. enabled admission, owner 전환 fencing, credential 버전 원자 증가, commit 후 evict, enc:v2 지원, capability 저장·활성화 검증은 WS-1의 한 흐름으로 묶어야 한다. | 🔴 선행. 나머지는 WS-1 필수 범위 |

라이선스의 **30초 대상 캐시 때문에 반드시 30초 더 수집되는 구조는 아닙니다.** 거부를 읽은 레인이 실행 세대를 바꾸면 다른 레인의 뒤따르는 작업도 차단됩니다. 반면 그 전의 진행 중 작업과 이미 소유권 검사를 통과한 writer는 별개입니다.

HEAD `SignedKeyLicenseProvider.java:110–116`도 캐시된 payload에서 시간 상태를 매 호출 다시 계산하므로 자연 만료에 60초 캐시를 그대로 추가하는 구조는 아닙니다. 이 파일의 미커밋 변경은 평가에 포함하지 않았습니다.

---

**5. 새 결함 표**

| # | 심각도 | 파일:행 | 지적 | 재현: 결정적 입력·순서 | 고칠 코드: 핵심만 | 이월 가능? |
|---|---|---|---|---|---|---|
| **N1** | **🔴** | [PgLeaseClient.java:40](C:/worktrees/zm-172-be/src/main/java/com/dmove/moveseye/premium/dbm/collector/j1/PgLeaseClient.java:40), `55–66`; [PgBatchWriter.java:44](C:/worktrees/zm-172-be/src/main/java/com/dmove/moveseye/premium/dbm/collector/j1/PgBatchWriter.java:44) | **잠금을 기다린 뒤에도 요청/트랜잭션 시작의 `now()`로 만료를 판단한다.** 한 문장에서 시간이 일정하다는 사실이 현재 시각의 정확성을 보장하지 않는다. | lease 만료 E. 다른 tx가 target 잠금을 잡는다. renew 또는 writer를 E 이전에 시작해 대기시킨다. E 이후 잠금을 해제한다. renew는 만료 전 조건을 통과할 수 있고 writer도 live=true로 수락할 수 있다. 같은 run acquire는 만료를 넘겼는데 token/epoch를 유지할 수 있다. | **행 잠금 획득 후 DB 시각을 채취**하여 판정·연장. 잠금 선행 CTE 또는 짧은 잠금 tx로 경계 명시. `clock_timestamp()` 문자열 치환만으로 잠금 선행까지 보장했다고 간주하지 말 것. | **불가, WS-1 전** |
| **N2** | **🔴** | [DbmPollerManager.java:124](C:/worktrees/zm-172-be/src/main/java/com/dmove/moveseye/premium/dbm/collector/DbmPollerManager.java:124), `163–174`; `CollectorRuntime.java:171–218,243–245` | **stop 완료 뒤 진행 중 tick이 새 대상 처리를 시작할 수 있다.** running=false는 tick 허가와 연결되지 않고 runtime.shutdown은 releaseAll만 한다. | tick을 config 조회에서 대기시킨다. stop이 shutdownNow·대기 한도를 지나 releaseAll을 끝낸다. 그 뒤 조회를 반환시킨다. 세대가 그대로여서 target 상태 생성→acquire→채집이 가능하다. 수동 tick은 stop 뒤에도 직접 호출 가능하다. | 종료 시작에서 신규 tick 차단 및 **진행 중 실행 세대 무효화**. 이후 lease 반납. start 시 새 실행 세대로 재개. 진입 시 running 검사만 추가하면 이미 진입한 tick은 해결되지 않는다. | **불가, WS-1 전** |
| **N3** | **🔴** | [PgTypedRowStore.java:254](C:/worktrees/zm-172-be/src/main/java/com/dmove/moveseye/premium/dbm/collector/j1/PgTypedRowStore.java:254), `58–66,265–283` | **전역 fingerprint UPSERT에 잠금 순서가 없다.** 대상별 lease로 보호되지 않는 공유 행이다. | 노드 A는 대상 A에서 `[fpX,fpY]`, 노드 B는 대상 B에서 `[fpY,fpX]`를 저장한다. A가 X, B가 Y를 잠근 뒤 각각 다음 행으로 진행하면 순환 대기한다. 기존 행 UPDATE와 동시 신규 INSERT 모두 대상이다. | fingerprint 정렬 후 배열 생성 또는 INSERT SELECT에 일관된 ORDER BY. 차원 정리 등 다른 다중 행 변경 경로도 같은 순서 또는 SKIP LOCKED 방식으로 정렬. | **불가, WS-1 전** |
| **N4** | **🔴** | [PgQueryStatCollector.java:57](C:/worktrees/zm-172-be/dbm-collector-core/src/main/java/com/dmove/moveseye/premium/dbm/collector/core/adapter/pg/PgQueryStatCollector.java:57), `175–223`; 설계 §5.4 | **기본 Top SQL 집합에 nested 문장이 섞인다.** toplevel은 식별에만 쓰고 Top N·합계에서 필터링하지 않는다. | track=all. 상위 호출 Δexec=100, 내부 SQL Δexec=80. 기본 합계에 180이 들어간다. nested 문장이 스캔 상한·Top N 자리도 점유한다. PG13 이하는 모두 true로 표시해 구분 불가 사실도 소실한다. | 기본 스캔·순위·`__other__`는 toplevel=true 집합으로. nested는 별도 드릴다운. 13 이하 track=all에서는 중첩 미분리와 완전성 제한을 전달. | **불가, WS-1 전** |
| **N5** | **🔴** | `PgQueryStatCollector.java:119–145,215–228`; `DeltaWindow.java:44–67`; `PgTypedRowStore.java:113–147` | **eviction이 있었는데 `otherComplete=true`가 가능하다.** 현재 새·감소 native만 세고, 사라진 native·dealloc 증가를 고려하지 않는다. dealloc 값도 typed 저장에서 버린다. | 입력 snapshot을 previous={A,B}, current={A}, scanCapped=false, A 감소 없음으로 둔다. B가 직전 관측 후 실행되고 퇴출됐어도 excluded=0이어서 complete=true다. 같은 native가 퇴출·재등록 후 옛 값 이상으로 증가한 경우도 감소 검사로 잡지 못한다. | dealloc을 checkpoint에 보관해 증가 감지. 사라진 native와 PG17 stats_since 등 재등록 증거 반영. 불확실 구간은 otherComplete=false. **dealloc마다 전체 baseline으로 버릴 필요는 없다.** | **불가, WS-1 전** |
| **N6** | **🔴** | [V92__dbm_typed_tables.sql:131](C:/worktrees/zm-172-be/src/main/resources/db/migration/V92__dbm_typed_tables.sql:131), `141,149–175`; `PgTypedRowStore.java:106–142` | **같은 분의 서로 다른 물리 노드 통계를 분리할 수 없다.** metric은 node 열 자체가 없고 Q는 충돌 시 최초 node_id를 남긴 채 합산한다. | 같은 target·분에서 A 노드 C/Q 저장→접속점 전환→B 노드의 후속 유효 delta 저장. metric은 같은 PK에 합산된다. Q도 같은 native ID이면 합산되고 node_id는 A로 남는다. | V93에서 노드/통계 구간을 집계 식별에 포함. Q native 식별의 노드 스코프도 함께 결정. 논리 target 합계는 조회에서 명시적으로 계산. | **불가, WS-1 전 V93** |
| **N7** | **🔴** | `PgCounterCollector.java:141–161`; `PgTypedRowStore.java:103–110,366–388`; `V92:131–143` | **C의 intervalMs를 버려 증가량의 관측 기간을 집계에서 복원할 수 없다.** count는 관측 수이지 시간이다. | 같은 분에 value=30, intervalMs=15,000인 관측과 value=30, intervalMs=45,000인 관측을 각각 저장하면 typed 결과는 동일하다. 실제 rate는 다르다. 백오프 후 긴 구간 delta도 끝 시각 한 분에 몰린다. | interval/coverage 합계와 집계 시간 의미를 저장. 분 경계를 넘는 delta의 귀속 규칙 및 rate min/max 의미를 정한다. `count×설정 주기`로 복원하지 말 것. | **불가, WS-1 전 V93** |
| **N8** | **🔴** | `PgBatchWriter.java:38–39,97–100`; `DailyPartitionService.java:90–91,111–115` | **“writer tx 밖”은 “모든 tx 밖”이 아니다.** 외부 Spring tx가 있으면 파티션 DDL이 외부 tx에 참여한다. REQUIRES_NEW writer와 자기 대기가 생긴다. | 아직 없는 날짜를 선택한다. 외부 tx 안에서 writer.write 호출→ensurePartitions가 외부 연결로 PARTITION OF 생성→외부 tx를 suspend하고 내부 REQUIRES_NEW 시작→내부 INSERT가 외부 tx의 부모 표 잠금/미커밋 DDL을 기다린다. 호출 스레드는 내부 반환을 기다려 외부 commit을 못 한다. | 파티션 준비에 NOT_SUPPORTED/독립 커밋 경계를 명시하거나 외부 tx 호출을 입구에서 거부한다. 롤백될 DDL을 known 캐시에 먼저 확정하지 않는다. | **불가, WS-1 전** |
| **N9** | **🔴** | [DbmRetentionDays.java:41](C:/worktrees/zm-172-be/src/main/java/com/dmove/moveseye/premium/dbm/retention/DbmRetentionDays.java:41); [DbmRetentionService.java:115](C:/worktrees/zm-172-be/src/main/java/com/dmove/moveseye/premium/dbm/retention/DbmRetentionService.java:115); `SchedulerSettingService.java:61–75,121–129` | **양수인 보존 옵션만으로 참조 중 차원 ID를 삭제한다.** 400일 기본값의 안전성을 모든 허용 설정의 안전성으로 간주했다. | options에 dimensionIdleDays=1, sessionRawDays=2, queryStat1mDays=7. 1.5일 전 세션·Q 사실과 그 차원을 둔다. 잡 실행 시 사실은 남고 text/native만 삭제된다. 현재 공통 스케줄러 저장 경로가 이 조합을 거부하지 않는다. | ID 삭제에 실제 참조 부재 조건 또는 참조 수명 보장 정책 적용. 개인정보 TTL은 텍스트 제거와 ID 수명 분리. 단순 양수 검증만으로 해결하지 말 것. | **불가, WS-1 전** |
| N10 | 🟡 | `PgSqlText.java:58–81`; `PgTypedRowStore.java:88–147,208–242,401–420` | typed “1:1 매핑” 주장이 실제와 다르다. rawHash·sqlOmitted·maskingFailure·tags·Q dealloc/observedStatements 등이 사라진다. fingerprint가 없는 실패 행의 commandType도 보존되지 않는다. | 해당 키를 포함한 행을 writer에 넣고 typed 표를 조회한다. 배치 집계 품질 외에 해당 정보가 없다. | 필요한 진단·태그 열/차원 추가 또는 계약에 명시적 미저장 범위 표시. | WS-1·WS-6, V93에 저장 자리 권고 |
| N11 | 🟡 | `PgTypedRowStore.java:93,100,250,361`; `PgLockCollector.java:41` | ON CONFLICT DO NOTHING으로 버린 행도 row_count에 포함한다. | 같은 waiter/blocker가 중복된 LOCK rows. PG 함수의 중복 pid도 입력 원인이다. DB에는 1행인데 writer는 rows.size를 반환한다. | 간선 키 선접기 및 실제 INSERT 수 계산. 다중 lock 상세를 한 간선으로 접는 규칙도 명시. | WS-1과 함께 |
| N12 | 🟡 | `DbmPartitionService.java:52–58`; `DailyPartitionService.java:101–112` | 파티션 이름 존재를 실제 범위 일치로 간주한다. 다른 TZ가 생성한 같은 이름의 파티션을 그대로 신뢰한다. | KST가 날짜 D 파티션을 생성한다. UTC 노드가 D 18:00Z 관측을 저장하려 하면 D 파티션의 실제 상한은 D 15:00Z다. 다음 파티션이 있으면 그쪽으로 가고, 없으면 INSERT 실패가 가능하다. 새 UTC 경계 생성은 기존 범위와 겹칠 수 있다. | UTC의 명시적 timestamptz 경계 또는 단일 TZ 강제·검증. 기존 파티션 범위 전환 계획 포함. | 현재 통일 전제를 유지하면 WS-1·WS-10 |
| N13 | 🟡 | `CodecSecretResolver.java:69–84`; `SettingSecretCodec.java:42,117–138`; `V90:43,69–79` | HEAD Codec은 enc:v1만 인식한다. 설계의 enc:v2는 평문으로 취급된다. DECRYPT_FAILED도 V90 CHECK에 없다. | password_enc에 `enc:v2:...` 저장→resolver가 그 문자열을 비밀번호로 반환한다. DECRYPT_FAILED 상태 저장은 CHECK 위반이다. | WS-1 저장·해석 형식을 함께 구현하고 미지원 enc 버전은 해석 실패로 처리. 상태 enum/CHECK는 새 migration으로 확장. | **WS-1과 함께 필수** |
| N14 | 🟡 | `PgConfigSource.java:115–145`; `PgConfigSourceIT.java:100–122` | evict가 진행 중인 load의 캐시 게시를 무효화하지 않는다. 저장 직후 즉시 반영이라는 설명은 동시성까지 보장하지 않는다. | A가 옛 snapshot load 후 반환 대기→설정 commit·evict→B가 새 snapshot 게시→A가 옛 snapshot을 cached에 재게시. | load·evict에 revision 또는 직렬화 적용. DB commit 후 evict. credential·assignment 전파 의미도 함께 확정. | WS-1과 함께 |
| N15 | 🟡 | `V92:153–174`; `PgTypedRowStore.java:138–142` | Q 롤업용 실제 지연 min/max가 없고, 일반 native 행도 두 번째 UPSERT부터 scan_capped=false·excluded_natives=0 등으로 채워져 “플래그는 other만” 계약이 깨진다. | 일반 native를 같은 분에 두 번 저장한다. other_complete는 NULL이지만 다른 플래그는 NULL이 아니게 된다. min/max는 어떤 입력에서도 저장되지 않는다. | other 행 플래그 갱신 조건 분리. 지연 극값의 소스·단위·지원 여부를 정하고 열 추가. | WS-10, V93 권고 |
| N16 | 🟡 | `DbmRetentionService.java:62–68`; `V90:130–131`; `PgCounterCollector.java:95–139` | 배치 만료용 전역 인덱스가 없고 C reset은 값 감소 휴리스틱뿐이다. | 대량 생존 배치에서 expired 조회 실행계획 확인 필요. C는 reset 후 모든 누적값이 이전 이상인 snapshot이면 baseline이 되지 않는다. | `(observed_at,batch_id)` 인덱스·삭제 정렬 검토. C 소스별 stats_reset·DB 집합 변화 marker 보강. | 인덱스/비용 WS-10, reset 보강 WS-1 |

N1에서 `now()`가 트랜잭션 시작 시각이라는 점은 [PostgreSQL 날짜·시간 함수 문서](https://www.postgresql.org/docs/17/functions-datetime.html#FUNCTIONS-DATETIME-CURRENT)에 명시돼 있습니다. “DB 시계 사용” 자체는 맞지만 **잠금 대기 후의 현재 DB 시각**이라는 추가 조건이 필요합니다.

N8은 PostgreSQL DDL이 항상 auto-commit이라는 전제에서 발생합니다. `JdbcTemplate`은 Spring에 바인딩된 연결을 사용하며, `CREATE TABLE … PARTITION OF`는 부모 표에 ACCESS EXCLUSIVE 잠금을 요구합니다. [Spring DataSourceUtils](https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/jdbc/datasource/DataSourceUtils.html), [PostgreSQL 파티션 관리](https://www.postgresql.org/docs/17/ddl-partitioning.html#DDL-PARTITIONING-DECLARATIVE-MAINTENANCE)

N5의 dealloc은 “누적 eviction 횟수”이므로 증가 자체를 품질 증거로 활용해야 합니다. PG17에는 문장별 `stats_since`도 있습니다. **dealloc마다 전체 baseline을 만드는 것과, eviction을 완전성에 반영하는 것은 다른 선택입니다.** [PG17 pg_stat_statements](https://www.postgresql.org/docs/17/pgstatstatements.html)

---

**6. 경합·집계 의미의 추가 판단**

**writer의 멱등 INSERT와 checkpoint 저장은 기본 구조가 맞습니다.**

READ COMMITTED에서 두 writer가 같은 멱등 키를 INSERT하면 UNIQUE 경합에서 직렬화됩니다. 앞 writer가 커밋하면 뒤의 DO NOTHING은 반환 행이 없고, 후속 SELECT는 새 문장 snapshot에서 digest를 읽습니다. 앞 writer가 롤백하면 뒤 writer가 INSERT할 수 있습니다.

`setRollbackOnly()` 뒤 결과를 반환하는 현재 로컬 TransactionTemplate 경로도 정상입니다. batch·typed 행·checkpoint가 같은 커밋이라는 장점은 유지해야 합니다. 다른 kind의 checkpoint는 PK의 kind가 달라 직접 같은 행을 잠그지 않습니다. **이번에 추가된 공유 차원 UPSERT가 그 앞에서 새로운 교착 가능성을 만든 것입니다.**

**1m UPSERT 전체를 APM과 동일한 발생 조건이라고 단정하지는 않습니다.**

현재 C·Q는 한 manager의 단일 slow 레인이 처리하고 다른 노드의 같은 대상 writer는 lease와 target SHARE 잠금으로 인계와 직렬화됩니다. 따라서 metric 두 배치가 APM의 동시 HTTP 수신처럼 항상 겹치는 구조는 아닙니다.

반면 `dbm_query_dimension`은 **대상을 넘는 전역 표**입니다. 서로 다른 대상의 정상 수집만으로 N3이 성립합니다. 이 차이를 이유로 전역 차원 정렬은 🔴, 다른 배치 정렬 보강은 함께 처리할 방어 작업으로 구분했습니다.

**Q의 평균·비율에서 samples를 잘못 쓰면 안 됩니다.**

- 평균 실행 시간: `Σexec_us / Σcalls / 1000`으로 ms 복원 가능.
- 관측 수: `samples`. 호출 수·활성 시간·coverage를 의미하지 않는다.
- native별 `interval_ms`는 그 native가 Top N에 포함된 관측의 기간만 가진다.
- 같은 관측의 여러 native에 동일 interval이 있으므로 SQL 전체 합계에서 interval을 행별 SUM하면 분모가 중복된다.
- Top N에서 빠진 native의 구간 값은 `__other__`에 들어간다. 그 native의 시계열은 0이 아니라 **미보존**일 수 있다.
- 현재 16개 누적 합만으로 실제 호출별 latency min/max나 분포를 만들 수 없다. 관측 구간 평균의 min/max를 만들 경우에도 다른 이름을 써야 한다.

**차원 복원과 개인정보 TTL은 별도 정책이 필요합니다.**

SQL 텍스트 NULL 후 재등장 복원은 구현돼 있습니다. 그러나 기존 텍스트가 이미 있으면 coalesce로 유지하므로 상한을 늘려도 더 긴 텍스트로 갱신되지 않습니다. `text_truncated`도 충돌 시 갱신되지 않아 복원한 텍스트 상태와 어긋날 수 있습니다.

사용자·클라이언트 차원의 짧은 개인정보 TTL을 지원하려면, **텍스트의 삭제와 사실이 참조하는 ID의 삭제를 분리**해야 합니다. 보존 일수를 단순히 크게 고정하는 것만으로 해당 요구를 해결했다고 볼 수 없습니다.

**현재 파티션 DROP 경계는 엄밀한 48시간 DELETE가 아닙니다.**

`day < today - days`이므로 sessionRawDays=2는 오늘과 전전날 날짜까지 남기는 보수적 경계입니다. 정상 TZ 전제에서 오늘 데이터가 DROP되지는 않습니다. 이를 설명하는 “48h 이상, 파티션 경계까지”는 맞습니다.

파티션이 사라진 쓰기는 트랜잭션 전체가 롤백되고 코어가 RETRY_LATER로 처리합니다. C·Q는 다음 성공에서 이전 checkpoint 이후 delta를 다시 계산할 수 있지만 S·L의 해당 관측은 재현할 수 없습니다. J1에는 동일 raw 배치의 durable 재전송 큐가 없습니다.

---

**7. WS-1 착수 전 수정 목록 — 🔴만, 권장 순서**

1. **N2 — 종료 허가부터 닫기.** 종료 시작에서 신규 tick을 막고 진행 중 tick의 실행 세대를 무효화한 뒤 lease를 반납한다. config 대기 중 종료·종료 후 수동 호출·재시작을 직접 검증한다.
2. **N1 — lease·writer의 시간 판정 교정.** 행 잠금 획득 후 DB 시각으로 만료를 판단한다. TTL을 넘기는 잠금 대기 시험을 acquire·renew·writer에 각각 둔다.
3. **N3 — 전역 차원의 conflict 키 잠금 순서 통일.** 두 대상·두 tx의 역순 fingerprint 입력을 직접 검증한다.
4. **N8 — 파티션 준비의 트랜잭션 경계 고정.** 외부 tx 호출 지원 또는 명시적 거부 중 하나를 실제로 보장한다. 공통 서비스 변경 시 APM guard 경계를 유지한다.
5. **N4 — 기본 Top SQL 집합을 toplevel 기준으로 분리.** nested 문장이 스캔 상한·Top N·분모에 섞이지 않게 한다.
6. **N5 — eviction·재등록 불확실성을 완전성에 반영.** dealloc·사라진 native·문장별 통계 시작 증거를 처리한다.
7. **N6 — 노드/통계 구간을 1m 저장 식별에 보존.** V93과 writer를 같이 변경한다.
8. **N7 — 카운터 interval·coverage 의미를 저장.** 지연된 delta의 분 버킷 귀속 및 rate 계산 계약까지 함께 확정한다.
9. **N9 — 참조 중 차원 삭제 차단.** 현재 공통 스케줄러에서 저장 가능한 보존 옵션 조합에도 안전해야 한다.

이 수정들은 WS-1 기능 커밋에 묻기보다 **WS-1 선행 안정화 커밋으로 분리하는 편이 검토하기 쉽습니다.**

---

**8. V93에 함께 넣을 스키마 목록**

V90~V92는 이미 적용된 migration이므로 수정하지 말고 새 migration으로 처리해야 합니다. V93이 이번 조정에 유리한 시점인 것은 맞지만, 이후 열을 추가할 수 없는 마지막 기회는 아닙니다.

| 우선순위 | V93 대상 | 필요한 결정 |
|---|---|---|
| **🔴 N6** | metric의 node/통계 구간 열·집계 PK | 노드가 다른 값을 별도 행으로 보존할 것. Q 사실 PK와 native 식별도 같은 축으로 정렬 |
| **🔴 N7** | metric interval·coverage 열 | 증가량의 측정 기간, 분 경계 밖 구간 귀속, rate 계산에 필요한 분모 보존 |
| **🔴 N9 관련** | 차원 ID 수명과 텍스트 TTL 분리 | 필요하면 텍스트 NULL/tombstone을 지원하도록 구조 변경. 실제 참조 중 ID 삭제 금지 |
| 🟡 N10 | 보호·진단 metadata | sqlOmitted·rawHash·maskingFailure·승인 태그 및 Q source visibility 저장 위치 |
| 🟡 N13 | credential 상태·암호문 형식 | DECRYPT_FAILED CHECK 확장, enc:v2/keyId 저장 계약. credential_version은 저장 tx에서 원자 증가 |
| 🟡 N15 | Q 지연 극값·가용성 | 실제 소스 min/max와 관측 평균 극값을 구분. 미지원 값을 0으로 만들지 않는 표현 |
| 🟡 N16 | 배치 만료 정리 인덱스 | `(observed_at,batch_id)`와 해당 순서 삭제 계획 검토. 대량 기존 데이터의 인덱스 생성 비용 고려 |
| 🟡 | fingerprint 알고리즘 버전 | 향후 algo_ver가 바뀔 때 UNIQUE(fingerprint)만으로 충분한지 결정. 현재 PG·v1만으로 즉시 충돌이 입증된 것은 아님 |

WS-10에서는 여기에 다음이 필요합니다.

| 대상 | 완료 조건 |
|---|---|
| activity·metric·Q의 5m/1h 표 | 합·관측 수·coverage·극값·노드/통계 구간 의미가 보존됨 |
| 롤업 watermark·dirty 처리 | “어디까지 읽었나”와 “완전한가”를 구분하고 재실행 멱등성 확보 |
| raw·1m DROP guard | 활동 1m 생성 전 raw를, 5m 생성 전 1m을 지우지 않음 |
| 차원 참조 보호 | 1h가 400일 남는 동안 native/차원 ID가 먼저 사라지지 않음. 일 파티션의 추가 보존 경계도 고려 |
| 보존 옵션 관계 검증 | 각 옵션을 독립 양수로만 취급하지 않음 |
| Q 분모·Top N 압축 | native별 interval 중복 합산 금지, 미보존 native를 0으로 해석하지 않음 |

**현재 5m/1h와 watermark guard가 없다는 사실 자체는 명시된 WS-10 이월로 수용합니다.** 다만 그 상태에서 “400일 추세 보존 구현 완료”로 표시할 수는 없습니다. WS-1 이후 실제 장기 수집을 시작하고 WS-10이 늦어지면 기존 DROP이 원재료를 지우므로, 나중에 롤업을 구현해도 과거를 복원할 수 없습니다.

---

**9. WS-1에서 함께 닫아야 하는 계약**

| 항목 | 현재 상태와 WS-1 조치 |
|---|---|
| enabled | 등록 기본 false는 맞다. capability·라이선스 admission을 통과하는 활성화 경로와 연결해야 한다. maxDbTargets 클레임 존재만으로 admission이 구현된 것은 아니다. |
| owner_kind·generation | BE/COLLECTOR 필터는 있다. 전환 시 generation 증가와 기존 lease 만료를 한 tx로 처리해야 한다. 세대만 올리고 lease를 그대로 두면 기존 실행의 renew는 실패해도 TTL까지 인계가 지연될 수 있다. |
| endpoint priority | 낮은 priority 하나 선택은 구현됐다. 여러 endpoint 자동 failover는 아니다. P1a CRUD에서 대상당 한 개라는 정책을 검증해야 한다. |
| credential_version | 변경된 비밀번호·계정 정보를 저장하는 tx에서 DB 값 기준으로 증가해야 한다. 읽어서 +1 후 저장하는 경쟁 방식은 피해야 한다. |
| SecretResolver | HEAD의 v1 Codec과 설계 v2의 차이를 저장 경로와 함께 해소해야 한다. String 평문 사본은 현재 한계이며 char[] 전환은 단계적으로 가능하다. |
| capability | 현재 dbm_capability는 폴러 설정 선택에 사용되지 않는다. WS-1이 필수 capability 미충족 활성화를 거부하고 Q 사용 여부·진단 상태를 저장해야 한다. |
| evict | 저장 tx commit 이후 실행해야 한다. 다른 노드는 TTL 전파이므로 “전 노드 즉시”로 설명하면 안 된다. N14의 진행 중 load도 고려해야 한다. |
| 대상 삭제 | 실제 DELETE 후 writer는 target 없음으로 거부되고 renew/acquire도 실패한다. 정상 config 재조회 후 로컬 상태를 버린다. 조회 장애 시 30초 이내 반납은 보장하지 않지만 이미 삭제된 target에 새 batch가 저장되는 경로는 막힌다. |
| 접속점 수정 | 선택 endpoint 내용이 바뀌면 configVersion이 바뀐다. 그러나 그 자체가 진행 중 tick 취소·새 epoch·checkpoint 초기화를 뜻하지 않는다. 어느 변경을 통계 연속성 단절로 볼지 정해야 한다. |
| 권한 | 현재 관리자 전용 status는 AdminAccessChecker 패턴으로 맞다. CRUD·저장형 연결 시험도 같은 관리자/DBM_ADMIN 계약으로 묶어야 한다. |
| 대상별 실행 격리 | 현재 한 레인에서 대상들을 순차 처리한다. 대상 A의 느린 연결이 대상 B를 지연시킬 수 있다. 대상별 워커·풀을 WS-1로 이월한 만큼 해당 작업의 완료 조건에 포함해야 한다. |

**종합**

J1의 **PG lease → 보호된 어댑터 출력 → batch·typed 행·checkpoint 동일 커밋**이라는 큰 구조는 타당합니다. APM 공통 구현체 추출에서도 이번 변경으로 생긴 회귀를 확인하지 못했습니다.

그러나 기존 XML 통과는 이번에 추가된 잠금 순서·종료 경합·집계 식별 문제를 검증하지 않습니다. **N1~N9를 WS-1 전에 수정하고, V93에서 노드·시간·참조 수명을 보존한 뒤 대상 CRUD를 연결하는 것이 이번 검수의 판정입니다.**