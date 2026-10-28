# Datadog Database Monitoring 전수 조사 — "무엇을 볼 수 있나" + v1.1 설계 대조 (2026-10-22)

- 목적: 사용자 지시 "Datadog DBM 문서를 보면서 DB 모니터링 설계 + 무엇을 볼 수 있는지 정리, 코덱스와 협의". 2026-10-19 조사(`research_db-monitoring-2026-10-19.md` §1-1)는 Datadog을 한 표로 요약했을 뿐이라, 이번엔 **화면·데이터·엔진별 수집·운영 수치**를 문서 전수로 뽑고 설계 v1.1과 항목별로 대조한다.
- 출처(2026-10-22 열람, 모두 docs.datadoghq.com/database_monitoring/ 하위 또는 integrations-core 저장소):
  개요 `/` · `query_metrics/` · `query_samples/` · `database_hosts/` · `data_collected/` · `recommendations/` · `schema_explorer/` · `troubleshooting/` · `agent_integration_overhead/` · `connect_dbm_and_apm/` · `guide/`(sql_deadlock · sql_extended_events · sql_alwayson · parameterized_queries · tag_database_statements · database_identifier · build_apps_with_dbm_api) · `setup_{postgres,mysql,sql_server,oracle}/selfhosted/` + 각 `troubleshooting/` · `integrations/oracle/` · integrations-core `postgres|mysql|sqlserver` `conf.yaml.example`·`metadata.csv` · datadog-agent `oracle.d/conf.yaml.example`.
- 이 문서는 **기록**이다. 결정은 `devdesign_db-monitoring.md`(v1.2, 코덱스 협의 뒤 작성)에, 코덱스 협의 원문은 `_archive/…/consult_datadog-gap_codex.md`에.
- 🔴 **정정 이력(2026-10-22 코덱스 협의 §C 반영)**: ① "Datadog은 RAC에서 `GV$`를 안 쓴다" → **"노드별로 `V$`를 조회하고 `GV$`는 필요한 경우에만(인터커넥트 최소화)"**(RAC 페이지 원문 재확인). "노드마다 Agent" → 한 설정에 노드별 `server` 항목. ② system_health 읽기 권한: 2022+는 `VIEW SERVER PERFORMANCE STATE`. 2012·2014 데드락 "불가"는 **Datadog 조회 SQL의 `AT TIME ZONE` 제약**이지 엔진 한계가 아님. Datadog 폴백은 `event_file` target 우선, 없으면 ring_buffer. ③ PG `pg_stat_statements`는 **서버 전체 DB 통계·대표 텍스트를 한 DB 접속으로 조회**할 수 있다 — DB별 접속은 relation·schema·로컬 카탈로그 작업에만 필요. ④ Oracle 실행 row 통계는 `STATISTICS_LEVEL=ALL` 외에 `GATHER_PLAN_STATISTICS` 힌트로도 채워진다. ⑤ MariaDB는 Datadog도 별도 지원표(Agent 7.61+, 플랜 JSON 필드 누락, 블로킹 기본 OFF·5.7식 컬럼, 데드락 카운트 0 고정, 클러스터 태그 없음, `dbms_flavor:mariadb`). ⑥ 오버헤드 수치는 Agent CPU와 DB 쿼리 CPU가 별도 항목이며 PG 벤치의 샘플 주기는 10s.

---

## 1. 제품이 보여주는 것 — 화면 단위

### 1.1 Databases 페이지(인스턴스 목록 + 상세 패널)
| 요소 | 내용 |
|---|---|
| 목록 | 호스트/클러스터 행. 정렬·필터: 발화 중 알람·쿼리 볼륨 등. 클릭 → 상세 패널(활성 연결 그래프 포함) |
| **Group into clusters** | 호스트 태그로 토폴로지가 보이면 클러스터 묶음 토글. RDS(`dbclusteridentifier`) · PG 물리 복제(`system_identifier`, Agent 7.58+, 이름은 `cluster_name` 설정값→primary 이름→system_identifier) · MySQL 일반 복제(`cluster_uuid`, 7.68+, 그룹 복제 제외). 클러스터 행은 멤버 합산값 |
| 탭 **Top Queries** | 최대 지속·평균 지연 등으로 정렬. 쿼리 클릭 → 인사이트·평균 지연 그래프·실행계획·블로킹 활동·실행 호스트·호출 서비스 |
| 탭 **Stored Procedures**(SQL Server만) | 프로시저별 평균 지속·logical reads/writes 등, 펼치면 내부 SQL |
| 탭 **Metrics** | 시스템 헬스·쿼리 활동·블로킹·함수 성능 등 |
| 탭 **Active Connections** | 지금 실행 중인 쿼리(라이브). 클릭 → 이벤트 속성·연관 트레이스 |
| 탭 **Schema** | DB·테이블·컬럼·타입·FK·인덱스 전략 탐색 |
| 탭 **Blocking Queries** | 블로킹 쿼리 지속 시간·실행 수·대기 쿼리 수 시각화, 검색·필터, 행 클릭 상세 |
| 탭 **Calling Services** | 이 호스트를 호출한 APM 서비스: 배포 시각·호스트당 RPS·DB 쿼리 수 → 서비스 APM 페이지 |
| 탭 **Configuration** | 인스턴스 파라미터(`collect_settings`, 기본 600s). 오설정 발견용 |
| 탭 **Deadlocks**(SQL Server) | Queries 탭 안. 희생자(victim)/생존 프로세스 + 데드락 다이어그램 링크 |
| **AlwaysOn Clusters** 뷰(SQL Server) | AG별 P/S 노드 색 상태, 상태 필터(Reverting·Not Synchronizing), log/redo/secondary lag 시계열, Historical Synchronization States, Replicas 탭, Metrics 탭 |
| 엔진별 지원 | Top Queries·Active Connections·Blocking Queries: PG·MSSQL·MySQL·Oracle 전부. Stored Procedures: MSSQL만. 클러스터 그룹핑: RDS·PG·MySQL만 |

### 1.2 Query Metrics(정규화 쿼리 누적 통계)
- **상위 200개**(총 시간 기준) / 수집 간격(기본 10s, MSSQL 60s)마다 — 간격마다 200이므로 기간 전체 추적 수는 더 많다. 밖은 **"Other Queries"** 로 묶이고, 쿼리는 추적↔Other 사이를 오갈 수 있다.
- 기본 열 **Requests · Average latency · Total time · Percent time**, 엔진별 추가(**Rows/Query** 등). 열 선택·정렬.
- 검색 태그 / **Group by 최대 3개**(host·env·datacenter…) / 패싯: 서비스·호스트·환경 + DB(PG `database`·`user`, MySQL `schema`) + 인프라 태그.
- 단일 쿼리 필터는 **`query_signature`**(정규화 텍스트 해시, 호스트 간 일관)로 — `query` 태그는 200자 절단이라 유일하지 않다.
- **Query Details**: 전체 정규화 텍스트 · 모든 실행 호스트 태그 합집합 · Metrics 탭(이 쿼리 vs 나머지 전체 평균 지연·DB 시간 점유) · **Explain Plans**(연속 수집 → 한 쿼리에 복수 플랜, 정규화해 분리 비교, cost/JSON, "View All Samples for This Plan") · **Hosts Running This Query** 탭.
- 보존 **15개월**. 일회성·빠른 쿼리는 여기 안 나오고 Samples(15일)에만.
- 워크플로 예: "쿼리 필터 → host로 group → Percent time 정렬 = 어느 호스트 부하인가", "Rows/Query 정렬 = 샤딩 불균형".
- 쿼리 메트릭 이름: `postgresql.queries.*`(17) · `mysql.queries.*`(20) · `sqlserver.queries.*`(19) + `sqlserver.procedures.*`(7) · Oracle은 메트릭 이름이 아니라 DBM 인테이크로만. 전체 목록 §2.5.

### 1.3 Query Samples(실행 중/최근 쿼리 스냅샷)
- 특정 시각에 **무엇이 돌고 있었나**. 전수 아님 — "비율"을 보여준다. 정규화 쿼리 수 **상한 없음**(샘플링은 느리거나 잦은 쿼리 우대) → 메트릭 없이 샘플만 있는 쿼리가 생길 수 있다.
- 패싯: 서비스·소스·호스트·duration / **클라이언트 IP·포트**(네트워크) / DB명·**explain plan cost 슬라이더**·**indexes**·row count 슬라이더·statement·user / 엔진별.
- **Explain plan cost**: 무단위 상대값 — Datadog 문서는 "대략 블록/페이지 접근에 대응"이라 쓰지만 **엔진별 optimizer 비용 단위이며 엔진 간·다른 optimizer 설정 간 직접 비교 불가**(코덱스 정정). "8.5가 8.7보다 빠르다"고 못 한다 — 같은 비용대 쿼리의 큰 편차를 본다.
- **Indexes 패싯**: 쿼리가 쓴 인덱스로 필터 → 일주일 범위에서 카운트 오름차순 = 거의 안 쓰는 인덱스 후보.
- **Sample Details**: Source/Host/Client IP 타일 → 호스트 대시보드·네트워크 트래픽 링크. 실행 수·지속·rows 그래프(현재 샘플 선 표시, top 쿼리만 그려짐). Explain Plan 섹션: 현재 샘플 duration·cost vs 기간 내 **평균·p90**. 플랜 노드마다 startup cost·total cost·plan rows·plan width.
- **Visualize as** list / timeseries / top list / table(예: Statement별 평균 duration, p90·p99 duration으로 "가끔만 느린 쿼리", p75 + 평균 plan cost 표) · Export.
- 보존 **15일**. API 필드: `db.statement·query_signature·wait_event·wait_event_type(Lock·IPC…)·rows`.

### 1.4 Explain Plans
- 샘플(in-flight) 쿼리에 대해 **연속 수집**(PG·MySQL은 `datadog.explain_statement` SECURITY DEFINER 함수/프로시저, MSSQL은 플랜 캐시, Oracle은 `V$SQL_PLAN_STATISTICS_ALL`).
- 쿠터: `explained_queries_per_hour_per_query` 60 · `samples_per_hour_per_query` 15(플랜당). PG 12+ `explain_parameterized_queries: true`(prepared statement도 설명). PG `auto_explain`(로그 경유)은 선택.
- 플랜은 정규화·`plan.signature`(같은 쿼리의 다른 플랜 구분)·`plan.cost`·JSON 원문(`plan.definition`). "플랜이 시간에 따라 어떻게 바뀌나" 추적.
- 설명 불가: BEGIN·COMMIT·SHOW·USE·ALTER. 가능: SELECT·UPDATE·INSERT·DELETE·REPLACE. prepared statement 플랜은 실제 플랜과 다를 수 있음을 명시.

### 1.5 Schemas(스키마 추적) — PG·MSSQL·MySQL
- `collect_schemas`(PG는 Agent 7.80+에서 기본 ON — **`dbm: true`인 DBM/Data Observability 활성 인스턴스에 한함**, MSSQL·MySQL 기본 OFF), **600s**, PG `max_tables` 300·`max_columns` 50·`max_query_duration` 60s / MSSQL `max_tables` 300·`collect_views`·`max_views` 1000 / MySQL `max_execution_time` 60s. PG `INHERITS` 파티션은 자식마다 1개로 셈.
- **Tables overview**: 테이블명으로 묶어 `# Variants`(호스트 간 정의 차이 수) · `# Instances` · `# Columns` · DB·스키마·호스트.
- **Variant 패널 4절**: Definition(컬럼·인덱스·FK) · Table Instances · **Metrics**(크기·seq scan 등, 7일) · **Queries and Changes**(이 테이블을 건드린 쿼리 + 스키마 변경 이력, 7일).
- **Metrics overview 10종**: 인스턴스 수 · 가장 빨리 변하는(%·bytes) · 가장 많이 접근 · 가장 큰 · live rows 최다 · 인덱스 크기 최대 · Access Exclusive Lock 보유 · dead rows 최다 · last vacuum age 최장 · last autovacuum age 최장.
- **스키마 추천**: PK 없음·비효율 인덱스 등, 영향 설명 + 제안 SQL.
- MySQL은 `REFERENCES` 권한으로 메타데이터만(데이터 미열람). 컬럼 통계는 PG `datadog.column_statistics()`(`pg_stats`, 3600s, `max_tables` 500, 기본 OFF).

### 1.6 Recommendations(9종, SQL Server엔 없음)
| 종류 | 정의 | 기준 | 엔진 |
|---|---|---|---|
| Missing Index | 플랜의 비싼 seq scan → 인덱스 제안 | 플랜 분석 | Mongo·MySQL·Oracle·PG |
| Unused Index | 최근 어떤 플랜에도 안 나타난 인덱스 | "최근" 미정의 | 동일 |
| Long Running Query | 지속 시간 한도 초과 | **30초** | 동일 |
| High Row Count | 결과 행 수 과다 | 미공개 | 동일 |
| High Impact Blocker | 다른 쿼리 대기 시간을 많이 유발 | 미공개 | Mongo·MySQL·Oracle |
| Query Regression | 총 지속 시간 급증 | 미공개 | Mongo·MySQL |
| High Disk Queue Depth / Low Disk Space | I/O 대기 과다 / 디스크 부족 | 미공개 | Mongo·MySQL·Oracle·PG(RDS만) |
| Function in Filter | 필터 컬럼에 함수 → seq scan | — | Mongo |
심각도 산출 → 즉시/비동기 처리 구분. (스키마 추천은 §1.5 별도.)

### 1.7 APM 연동(connect_dbm_and_apm)
- **SQL 주석 전파**(sqlcommenter/marginalia 형식 `/*key='val',key2='val2'*/`). 모드 `full`(트레이스 ID까지 → 샘플↔트레이스 상호 이동) / `service`(서비스명만 → 어느 서비스가 부하를 주나) / `disabled`. Oracle+Java 1.67+ `dynamic_service`: 주석 대신 **`V$SESSION.ACTION`에 서비스 해시 기록**(SQL 텍스트 불변 → SQL Plan Baseline 보존).
- 엔진×언어: PG·MySQL(Go·Java·.NET·Node·PHP·Python·Ruby) · MSSQL(Java·.NET, Go는 service만) · Oracle(Java, Go는 service만).
- 보이는 것 — DBM: 호스트 활성 연결을 **호출 서비스별 분해**, 서비스로 호스트 필터, 샘플에 APM 배지(트레이스 안에서 샘플·플랜·이력 보기). APM: 서비스 페이지 **Databases 절**(하류 DB 호스트·부하), **Queries 탭**(지연 이상치·에러·트레이스), 트레이스에서 **explain plan·대기 이벤트·평균 지연·최근 플랜**.
- 부작용 명시: MSSQL `context_info` 덮어쓰기(라운드트립 +1), Oracle `V$SESSION.ACTION` 덮어쓰기, PG prepared statement `Application` 속성 덮어쓰기, RDS Proxy 핀닝, 서비스명이 DB에 저장되는 프라이버시.

### 1.8 그 밖의 기능
| 기능 | 내용 |
|---|---|
| **Custom metrics** `custom_queries` | 고객 테이블에서 비즈니스 카운터·큐 깊이 등 수집(`metric_prefix`·`columns{name,type: gauge/count/monotonic_count/tag}`·`collection_interval`, Oracle은 `pdb` 지정). **Oracle은 "추가 비용·수수료가 발생할 수 있다" 경고** |
| Prebuilt dashboards | 엔진별 DB+시스템 지표 결합 대시보드, 복제·확장 가능 |
| **SQL Server Agent Jobs** | `agent_jobs.enabled`(기본 off, 15s, `history_row_limit` 10000) — msdb SELECT 필요(2016+, 7.57+) |
| **SQL Server 데드락** | XE 세션 `datadog`(`sqlserver.xml_deadlock_report`, ring_buffer 1024KB, `ALLOW_SINGLE_EVENT_LOSS`, dispatch 30s). **세션이 없으면 `system_health` 기본 세션에서 읽는다(폴백)**. `collect_deadlocks`(기본 off, 600s, `max_deadlocks` 100). 2012·2014는 `AT TIME ZONE` 미지원으로 불가 |
| **SQL Server 쿼리 완료·에러**(7.67+) | XE 세션 `datadog_query_completions`(`rpc_completed`·`sql_batch_completed`·`module_end`, **duration > 1s** 필터) · `datadog_query_errors`(`error_reported` severity≥11·`attention`=타임아웃). 액션 `sql_text·database_name·username·client_app_name·client_hostname·session_id·request_id`. ring_buffer **1024KB 초과 금지**, 수집 간격 10s, **최근 1000 이벤트/간격**. `collect_raw_query_statement`와 결합 시 원문 수집 |
| **파라미터 값 캡처**(opt-in) | `collect_raw_query_statement.enabled`(기본 off) — PG·MSSQL, 직접 실행·함수·프로시저(7.64+), **prepared statement는 MSSQL만**(XE 완료 이벤트 필요, 7.67+), PG prepared는 불가(서버가 자리표시자로 치환). 열람은 RBAC 권한 "Database Monitoring Parameterized Queries Read". 위험 문구: "비밀번호·PII 포함 가능" |
| **문장 태깅** | 앱이 SQL 주석으로 `key='val'` 태그 → Samples·Explain Plans 필터·Propagated Tags 표시(PG·MySQL·MSSQL) |
| **database_identifier** | 인스턴스 식별자 템플릿 `$resolved_hostname`(기본) / `$port`·`$instance_name`·`$cdb_name`·`$env`·태그 키. **식별자 1개 = 과금 호스트 1개**. 프록시 경유 시 `reported_hostname` |
| **DBM API** | 쿼리 메트릭 = `POST /api/v2/query/scalar`(`sum:postgresql.queries.time{…} by {query_signature,host,service}`) · 샘플/플랜 = `POST /api/v1/logs-analytics/list?type=databasequery`(`dbm_type:activity` / `dbm_type:plan`, `@db.query_signature`, limit 1000). 조인 키 `query_signature`·`database_instance` |
| 로그 연계 | PG `log_line_prefix`·`auto_explain`(JSON), MySQL slow log — 로그 제품 연동(원문 노출 경고) |

---

## 2. 데이터 수집 — 엔진별 사실

### 2.1 공통 운영 제약
- Agent는 **DB 호스트에 직접 접속**(프록시·LB·pgbouncer·리스너 경유 금지 — 접속 노드가 바뀌면 메트릭 부정확). Agent 1대 ≤ **30 인스턴스**(권장 운영 규모, 강제 상한 아님). AlwaysOn은 레플리카마다 Agent 설치 권고. RAC는 **노드마다 설정 항목**을 두고 노드별 `V$`를 조회하며 **`GV$`는 필요한 경우에만**(인터커넥트 트래픽 최소화), 결과는 프론트에서 집계. `rac_cluster` 태그로 묶음.
- 오버헤드 벤치(Agent EC2 c5.xlarge 4vCPU / DB RDS db.m5.large 2vCPU, TPC-C 20 warehouse, Agent 7.50.2~7.53.0). **두 주체를 분리해서 읽을 것**: ① **Agent 프로세스** CPU·RSS·네트(PG ~1%·300MiB·30KB/s↓30↑ / MySQL ~2% / MSSQL ~1% / Oracle ~0.2%·270MiB·6KB/s↓4↑) ② **DB 측 쿼리 CPU time**(PG·MySQL·MSSQL ~1%, Oracle ~0.2%). 벤치 주기는 PG 쿼리 샘플 **10s**(기본 1s 아님)·MySQL 샘플 1s·MSSQL activity 10s·Oracle 10s — 우리 5s 세션 샘플링의 보증 근거가 아니다(R2가 측정).
- 보존: 쿼리 메트릭 15개월 · 샘플 15일. 메트릭 "두 번째 10초 간격부터" 나타남.
- 난독화: 바인드·리터럴 → `?`(Agent에서, 인테이크 전). **난독화 안 함**: 스키마명(테이블·컬럼·인덱스·DB)·주석·로그. 옵션 `obfuscation_mode`(`obfuscate_and_normalize`)·`replace_digits`·`collect_metadata/tables/commands/comments`·`keep_sql_alias`·`keep_null/boolean/positional_parameter/trailing_semicolon/identifier_quotation/json_path`·`replace_bind_parameter`(`@P1`·`:param1`→`?`)·`keep_dollar_quoted_func`.

### 2.2 기본 수집 주기·상한(conf.yaml.example)
| 항목 | PostgreSQL | MySQL/MariaDB | SQL Server | Oracle |
|---|---|---|---|---|
| 세션/활동 샘플 | `query_samples.collection_interval` **1s**, `query_activity.payload_row_limit` **3500**(초과 시 최장 트랜잭션 우선) | **1s**, `events_statements_row_limit` 5000, `collect_blocking_queries` false | query_activity 10s(벤치) | **`min_collection_interval` 10s** = 세션 샘플 간격 |
| 쿼리 통계 | `query_metrics.collection_interval` **10s**(전 인스턴스 동일 값 강제) | **10s**, `only_query_recent_statements` false | **60s**, `dm_exec_query_stats_row_limit` 10000, `lookback_window` 2×간격, `samples_per_hour_per_query` 4 | 60s(벤치), `query_metrics` requires samples |
| 플랜 | 60/h/query, 15 samples/h/plan, `explain_parameterized_queries` true | 60/h/query, 15/h/plan, 스키마별 `explain_statement` 프로시저 | `collect_plans` true(캐시) | `execution_plans.enabled` true(requires metrics) |
| 프로시저 | — | — | `procedure_metrics` 60s, row_limit 10000 | — |
| 설정 스냅샷 | `collect_settings` **600s** on, `ignored_settings_patterns ['plpgsql%']` | 600s on(`global_variables`) | 600s on(`sys.configurations`) | — |
| 스키마 | 600s, 300 tables/50 cols, 7.80+ on | 600s off, `max_execution_time` 60 | 600s off, views 1000 | — |
| 컬럼 통계 | 3600s off, 500 tables | — | — | — |
| 테이블스페이스 | — | — | — | `tablespaces.collection_interval` **600s** |
| 인덱스 | `relations`(≤300) + `collect_bloat_metrics` off | `index_metrics.enabled` true, `limit` 1000 | `index_usage_metrics` on 300s | — |
| 기타 on/off | `collect_wal_metrics`(10+ on)·`collect_count_metrics` on·`collect_function_metrics` off·`collect_activity_metrics` off·`collect_database_size_metrics` on·`collect_checksum_metrics` off(12+)·`collect_buffercache_metrics` off(pg_buffercache) | `options.replication`(dbm면 true)·`extra_status_metrics`(dbm면 true)·`extra_innodb_metrics`·`galera_cluster`·`schema_size_metrics`·`table_size_metrics`·`system_table_size_metrics`(무거움)·`extra_performance_metrics`(무거움) | `ao_metrics`·`fci_metrics`·`db_fragmentation_metrics`(300s)·`master_files_metrics`·`primary/secondary_log_shipping_metrics`·`task_scheduler_metrics`·`tempdb_file_space_usage_metrics` on·`xe_metrics`·`table_size_metrics`·`agent_jobs`(15s) | `shared_memory`·`sysmetrics`·`processes`·`resource_manager` on, **`query_samples.active_session_history` false("선택 라이선스 필요, 비용 발생 가능")**, `agent_sql_trace`(dbms_monitor) |
| 데드락/XE | — | — | `collect_deadlocks` off 600s max 100 · `collect_xe` 10s max 1000 | — |

### 2.3 엔진별 전제·권한·소스
| 엔진 | 버전 | DB 측 전제(재시작·설치) | 권한 | 샘플 소스 | 통계 소스 | 플랜 | 특기 |
|---|---|---|---|---|---|---|---|
| **PostgreSQL** 9.6~18 | Agent 7.36.1+ | `shared_preload_libraries=pg_stat_statements`(**재시작**), `track_activity_query_size=4096`(기본 1024 절단), 권고 `pg_stat_statements.track=ALL`·`.max=10000`·`.track_utility=off`·`track_io_timing=on`. 모든 DB에 `CREATE EXTENSION pg_stat_statements` | `pg_monitor` + `CREATE SCHEMA datadog` + **SECURITY DEFINER 함수 2개**(`datadog.explain_statement`·`datadog.column_statistics`) — DB 측 객체 생성 필요. PG15+ `ALTER ROLE datadog INHERIT`. 9.6은 뷰 래퍼 함수 2개 추가 | `pg_stat_activity` | `pg_stat_statements` | `EXPLAIN (FORMAT JSON)` read-only 트랜잭션, prepared는 generic plan | 관계 메트릭은 DB마다 별도 instance(접속) 필요. `rdsadmin`·`azure_maintenance` 무시. `search_path`를 모니터 유저에 설정해야 플랜 가능 |
| **MariaDB** 10.5~13(별도 setup 페이지) | 7.36.1+(플랜은 **7.61.0+**), `dbms_flavor:mariadb` | **P_S 기본 OFF**(MySQL과 다름) → 설정 필수. consumer `events_waits_current` 기본 OFF | MySQL과 동일 grant + `REFERENCES`(테이블 메타 가시성) | MySQL과 동일. 블로킹 수집은 `collect_blocking_queries` 기본 OFF·**5.7식 컬럼**(8.0 컬럼 없음) | digest 동일(prepared statement 통계는 10.5.2+) | MySQL과 동일 프로시저. **JSON에 `cost_info`·`rows_examined_per_scan`·`rows_produced_per_join`·`used_columns` 누락** | 데드락 카운트 미갱신(0 고정) · `errors_raised` 없음 · InnoDB 메트릭 19종 버전별 미제공 · 함수형 인덱스 없음 · **클러스터 태그 미수집** |
| **MySQL** 5.6~9 | 7.36.1+ | `performance_schema=ON`, `max_digest_length`·`performance_schema_max_digest_length`·`performance_schema_max_sql_text_length`=4096, consumer `events_statements_current`·`events_waits_current` ON(필수), `history_long` 권고 | `REPLICATION CLIENT`·`PROCESS`·`SELECT ON performance_schema.*`, **`MAX_USER_CONNECTIONS 5`**, 인덱스는 `SELECT ON mysql.innodb_index_stats`, 스키마는 `REFERENCES`. `datadog.explain_statement`(스키마마다) + `datadog.enable_events_statements_consumers()`(런타임 consumer 켜기, 재시작 회피) 프로시저 | `performance_schema.threads`+`events_statements_current/history(_long)` | `events_statements_summary_by_digest`(가득 차면 truncate 권고) | `EXPLAIN FORMAT=json` 프로시저 | `schema` 태그는 default DB가 있을 때만. Cloud SQL <16GB 불가 |
| **SQL Server** 2012~2025 | 7.41+ | 없음(기본). 데드락·완료/에러는 **XE 세션 생성**(선택; 데드락은 `system_health` 폴백) | `CONNECT ANY DATABASE`·`VIEW SERVER STATE`(≤2019) / **2022+는 `dm_xe_session_targets` 등에 `VIEW SERVER PERFORMANCE STATE`**·`VIEW ANY DEFINITION`, msdb SELECT(Agent Jobs·Log Shipping) | `dm_exec_requests`+`dm_exec_sessions`… | `dm_exec_query_stats`, `dm_exec_procedure_stats` | 플랜 캐시 | 2012: `CONNECT ANY DATABASE` 없음→DB마다 USER 생성. 2012·2014 데드락은 **Datadog 조회 SQL의 `AT TIME ZONE` 제약으로 미지원**(엔진에 deadlock XE가 없는 게 아님). AG는 레플리카마다 Agent(리스너 경유는 호스트 상관 끊김). `user` 태그는 Activity에만(메트릭·플랜에는 없음) |
| **Oracle** 11g~21c | 7.53+ | **sysdba가 `dd_session` 뷰 생성**(`x$ksuse`·`x$kslwt`·`x$ksled`·`v$sql`·`v$containers`·`v$sqlcommand`) — DB 측 객체 | `CREATE SESSION` + SELECT: `V_$SESSION·V_$DATABASE·V_$INSTANCE·V_$SQLSTATS·V_$SQL·V_$SQL_PLAN_STATISTICS_ALL·V_$PROCESS·V_$SQLCOMMAND·V_$DATAFILE·V_$SYSMETRIC·V_$SGAINFO·V_$OSSTAT·V_$PARAMETER·V_$PGASTAT·DBA_FEATURE_USAGE_STATISTICS·V_$ASM_DISKGROUP·V_$RSRCMGRMETRIC·V_$DATAGUARD_CONFIG·V_$DATAGUARD_STATS·V_$LOCK·GV_$LOCK` + CDB: `V_$CONTAINERS·V_$CON_SYSMETRIC·V_$PDBS·CDB_SERVICES·CDB_TABLESPACE_USAGE_METRICS·CDB_TABLESPACES·V_$TRANSACTION·V_$LOCKED_OBJECT·DBA_OBJECTS·CDB_DATA_FILES·DBA_DATA_FILES`. 조건부 `EXECUTE ON sys.dbms_lob`, PDB 커스텀 쿼리는 `SET CONTAINER`. **`DBA_HIST_*`·ASH grant 없음** | `dd_session`(10s) — 컬럼: sid·serial#·username·status·osuser·machine·program·sql_id·force_matching_signature·plan_hash·sql_exec_start·prev_*·in_(hard_)parse·module·action·client_info·client_identifier·logon_time·blocking_*·final_blocking_*·state·event·wait_class·wait_time_micro·sql_text·sql_fulltext·pdb_name | `V$SQLSTATS` | `V$SQL_PLAN_STATISTICS_ALL` | CDB 루트에만 접속(PDB 직접 금지), C## 공통 유저 + `CONTAINER_DATA=ALL`. RAC는 노드별 설정·`V$` 조회, `GV$`는 필요 시만. `HOST_NAME` null(ADB)이면 `reported_hostname`. ASH는 **옵션**(`active_session_history: false`) |

### 2.4 트러블슈팅 문서가 드러내는 "안 보이는 이유"(우리 capability 검사 항목 후보)
- PG: 확장 미로드/미생성/`search_path` 밖 · `pg_monitor` 없음 · 상위 200 밖("Other Queries") · `track_utility`·`track` · `pg_stat_statements.max` 부족(ARRAY·컬럼 순서 변동이 churn) · **두 간격 연속 실행 전엔 메트릭 없음** · `track_activity_query_size` 절단(`ARRAY[ ?`로 끝남) · explain 함수 부재 · extended protocol(PG<12는 simple protocol 강제: pgx `PreferSimpleProtocol`, JDBC `preferQueryMode=simple`) · 설명 불가 문장 · 커스텀 `db` 태그가 DB를 병합.
- MySQL: `performance_schema` off · consumer off · digest 테이블 포화 · `events_waits_current` off면 activity 없음 · `schema` 태그 default DB 의존 · `REFERENCES` 없으면 테이블 안 보임.
- MSSQL: 2012/2014 데드락 `AT TIME ZONE` 오류 · 드라이버(MSOLEDBSQL19 암호화 기본값·`TrustServerCertificate`) · `sysjobs` SELECT.
- Oracle: "table or view does not exist"=grant 누락 · 실행계획 쿼리 수초/PGA·temp 누수(에이전트 버전 이슈) · `V$INSTANCE.HOST_NAME` null.

### 2.5 쿼리 단위 메트릭 전수(metadata.csv)
- **PG 17**: `count·time·rows·blk_read_time·blk_write_time·shared_blks_{hit,read,dirtied,written}·local_blks_{hit,read,dirtied,written}·temp_blks_{read,written}` + `duration.{max,sum}`(user·db·app 단위 활동). 기타 가족: activity·bgwriter(10)·buffercache(5)·checksums·conflicts(5)·control·function(3)·index_*·io(10, pg_stat_io)·locks·replication(8)·replication_slot(12)·sessions(7)·slru(7)·snapshot·subscription(6)·toast·transactions(4)·vacuum·wal(8)·wal_receiver(5)·archiver·recovery_prefetch·cluster_vacuum·create_index·analyze.
- **MySQL 20**: `count·time·errors·lock_time·rows_{affected,examined,sent}·created_tmp_{disk_,}tables·no_index_used·no_good_index_used·select_{full_join,full_range_join,range,range_check,scan}·sort_{merge_passes,range,rows,scan}`. 기타: innodb(101)·performance(80)·galera(15)·replication(14)·myisam·net·info(schema/table size)·index(4)·binlog.
- **MSSQL 19 + 프로시저 7**: `count·time·worker_time(CPU)·logical_{reads,writes}·physical_reads·rows·spills·memory_grant·used_memory_grant·ideal_memory_grant·dop·reserved_threads·used_threads·clr_time·columnstore_segment_{reads,skips}` + `duration.{max,sum}`; procedures `count·time·worker_time·logical_reads/writes·physical_reads·spills`. 기타: stats(9)·buffer(5)·memory(11)·**ao(20)**·fci(2)·database(23)·files(10)·tempdb(5)·index(4)·agent(4)·scheduler(5)·task(4)·server(6)·log_shipping(6)·locks.deadlocks.
- **Oracle 88(전부 gauge, 쿼리 메트릭은 메트릭이 아님)**: tablespace(5)·process pga(5)·asm_diskgroup(3)·resource_manager(2)·data_guard apply/transport lag·session_count·active_sessions(_on_cpu)·logons·hard_parses·buffer_cachehit_ratio·redo_generated·os_load·host_cpu_utilization·physical_*(15)·gc_*(4)·shared_memory.size·pga_cache_hit…

---

## 3. 한 장 요약 — "Datadog DBM으로 볼 수 있는 것"
1. **지금 무엇이 도나**(Active Connections, 1~10s 스냅샷, 사용자·클라이언트 IP·서비스·대기 이벤트·블로커).
2. **어느 SQL이 시간을 먹나**(Top 200 정규화 쿼리, Requests·평균 지연·총 시간·점유율·Rows, 호스트·서비스·태그 3단 그룹, 15개월).
3. **같은 쿼리인데 왜 가끔 느린가**(샘플 duration/cost vs 평균·p90, 플랜 변화, 인덱스 사용 여부, p99 분포).
4. **누가 누구를 막나**(블로킹 쿼리 지속·대기 수·체인, MSSQL 데드락 그래프).
5. **인스턴스는 건강한가**(엔진별 카운터 80~250종: 연결·버퍼·WAL/redo·복제 지연·tempdb·AG 동기화·테이블스페이스·ASM·Data Guard).
6. **구조가 어떻게 바뀌었나**(스키마 추적: 테이블 변형·컬럼·인덱스·FK·크기·dead rows·vacuum age·테이블별 쿼리·변경 이력).
7. **설정이 바뀌었나/잘못됐나**(Configuration 탭, 600s).
8. **어느 서비스 때문인가**(APM 주석 전파 → 호출 서비스·트레이스↔샘플).
9. **무엇을 고쳐야 하나**(추천 9종 + 스키마 추천 — 우리는 비범위).
10. **운영 이벤트**(MSSQL Agent Jobs, 쿼리 에러·타임아웃·1초 초과 완료 이벤트, 로그 연동).

---

## 4. v1.1 설계 대조 — 격차 목록(G) · 제안
표기: ✅ 이미 있음 · ◐ 부분 · ✖ 없음. "제안"은 Claude 1차 안 — 코덱스 협의(§5) 뒤 v1.2에 확정.

| G | Datadog | v1.1 | 제안(1차) | 비용·위험 |
|---|---|---|---|---|
| G1 | Configuration 탭(설정 스냅샷 600s, 기본 ON) | ◐ 파라미터 스냅샷 **P3** | 수집·표시는 **P1b로 앞당김**(쿼리 1개/10분, 저장 작음), 변경 diff 알람은 P3 유지 | 낮음 |
| G2 | Schema 추적(테이블 변형·컬럼·인덱스·FK·테이블 메트릭 10종·변경 이력·테이블↔쿼리) | ✖ | **P3 신설 WS "스키마·객체 스냅샷"**: 600s, 상한 300 tables/50 cols, 변경 감지, 테이블 통계(PG `pg_stat_user_tables`·MSSQL `dm_db_index_usage_stats`·MySQL `innodb_index_stats`). PG는 **DB마다 접속** 필요(slow 레인 순회·동시 1) | 중. MySQL `REFERENCES` 추가 권한, 접속 수 ↑ |
| G3 | Stored Procedures 메트릭(MSSQL `dm_exec_procedure_stats`) | ✖ | **P2 MSSQL 어댑터에 포함**(같은 델타 체계, `dbm_proc_stat_1m/1h`) — 국내 MSSQL 고객은 프로시저 중심 | 낮음 |
| G4 | 인덱스 사용 통계·Samples의 indexes 패싯·Unused/Missing Index 추천 | ✖(추천 비범위) | 추천은 비범위 유지. **데이터로서** 인덱스 사용 카운터(P3, G2와 묶음)와 Top SQL의 `no_index_used`(MySQL) · `select_scan` · 플랜 seq scan 노드 수 표시. "30일 스캔 0 인덱스 목록"은 **Q23** | 낮음~중 |
| G5 | 쿼리 완료(>1s)·에러·타임아웃 이벤트(MSSQL XE) · MySQL `errors` 메트릭 | ✖ | MySQL digest `SUM_ERRORS`는 Q 열로 **P1b 포함**. MSSQL XE는 **고객 DBA가 세션을 만드는 선택 기능**(P3, 기본 OFF, 승인 항목 3번째로 분리 표기). 읽기는 `dm_xe_session_targets` ring_buffer | XE = DB 측 객체. 원칙 1(승인 항목 2개) 예외 → 명시 |
| G6 | 데드락 그래프(MSSQL) — **`system_health` 세션 폴백**(`event_file` target 우선, 없으면 ring_buffer) | ◐ P3 후보 | **P2 MSSQL 어댑터에 포함(조건부)**: 기존 `system_health`의 `xml_deadlock_report`를 **전용 객체 생성 없이** 읽기. 권한 `VIEW SERVER STATE`(≤2019) / **`VIEW SERVER PERFORMANCE STATE`(2022+)**. ring_buffer는 영속 이력이 아니라 **재시작·덮어쓰기·XML 잘림·유실**이 있으므로 `(세션, 이벤트 timestamp, 내용 해시)` 중복 제거 + completeness 제한 표시. 600s·100건은 보장값 아님. Azure SQL DB(system_health 없음)·RDS·MI는 별도 인증(**Q28**). PG `pg_stat_database.deadlocks`·MySQL `innodb.deadlocks` 카운터 P1b, `SHOW ENGINE INNODB STATUS` 최근 데드락 텍스트(마스킹) P3 | 중(플랫폼 분기·중복 제거·유실 표시). 코덱스 🔴 수정 반영 |
| G7 | 플랜: in-flight 샘플을 **SECURITY DEFINER 함수**로 연속 EXPLAIN, 60/h/query·15/h/plan, prepared도 generic plan | ◐ PG는 "승인 시 EXPLAIN, 기본 OFF" | 🔴 **PG `EXPLAIN`(ANALYZE 없이)도 실행기 `ExecCheckPermissions`를 거쳐 그 문장이 요구하는 테이블 권한을 검사**한다 — `pg_monitor`·`pg_read_all_stats`만으로는 타인 업무 테이블 SELECT의 EXPLAIN이 불가(코덱스 PG17 소스 확인). `pg_read_all_data`(14+)면 SELECT는 가능하나 전 데이터 읽기 권한. MySQL `EXPLAIN`도 **그 문장을 실행할 권한과 동일** 요구. 1차 제안이던 SECURITY DEFINER 선택 패키지는 **코덱스 반대(임의 SQL을 받는 권한 상승 함수 = 모니터링 계정 이상의 실행 능력 위임, EXPLAIN도 계획 단계에 IMMUTABLE 함수 평가 가능)** → **채택: GA 자동 플랜은 Oracle·SQL Server 캐시 플랜만. PG·MySQL/MariaDB 재계획은 GA 제외, 별도 "DB 변경 프로필"로 Q26**. v1.1 §4 PG/MySQL P 열의 "승인 시 EXPLAIN" 삭제. prepared statement는 `force_generic_plan`만으로 타 세션 문장을 설명할 수 없음(SQL·타입·role·search_path 문맥 필요) | GA 구현·심사 부담 감소, 엔진별 플랜 지원표 명시 필요 |
| G8 | Top 200 밖 **"Other Queries"** 묶음(총량 보존) | ◐ activity만 `__other__`, stat은 Q19 배지 | `dbm_query_stat_1m`에도 `__other__` 행(Σ 전체 − Σ TopN) 저장 → "전체 DB 시간 중 TopN 점유율" 계산 가능 | 낮음 |
| G9 | 쿼리 통계 10s 간격(MSSQL 60s) | 60s | 유지(1m 버킷이 바닥). MSSQL과 동일 | — |
| G10 | SQL 주석 태그(sqlcommenter) → 서비스·route 패싯, Oracle `V$SESSION.ACTION` 서비스 해시 | ◐ APM 상관은 시간 상관, 전파 P5+ | **P3: 세션 SQL 텍스트의 `/*key='val'*/` 주석 파싱**(토크나이저 부산물)→ `dbm_dimension_text(kind=TAG)` 축 + Oracle `MODULE/ACTION/CLIENT_IDENTIFIER` 열 저장(이미 V$SESSION). **APM 쪽 주석 주입**(OTel JDBC 계측에 sqlcommenter 유무 확인)은 별도 과제 **Q24** | 낮음(파싱) / 중(주입) |
| G11 | Calling Services · 활성 연결의 서비스별 분해 | ◐ P3 시간 상관 | G10 태그가 있으면 **P3에서 세션→서비스 분해** 가능. 없으면 `program`/`client host` 분해로 대체 표시 | G10 의존 |
| G12 | 클러스터 그룹핑(PG `system_identifier`, MySQL `cluster_uuid`, RDS) | ◐ `dbm_node.role`만 | `dbm_cluster`(derived): PG `pg_control_system().system_identifier`, MySQL `@@server_uuid`+`SHOW REPLICA STATUS` source, MSSQL AG 이름, Oracle `DB_UNIQUE_NAME`/`DBID`. 개요 화면 "클러스터로 묶기" 토글 **P2** | 낮음 |
| G13 | AlwaysOn 뷰(AG P/S 상태·sync state 이력·log send/redo queue·lag) | ◐ "AG" 한 단어 | P2 MSSQL C에 `ao.*` 20종 상당 명시(`dm_hadr_*`) + 상세 "AG 탭"(상태 이력·레플리카·큐). Data Guard(`V$DATAGUARD_STATS` apply/transport lag)·PG 복제 슬롯·MySQL replica 상태를 **"복제 탭" 공통 모델**로 | 중 |
| G14 | SQL Server Agent Jobs(실패·지속·이력) | ✖(백업 age P3) | P3 선택(msdb SELECT 추가 권한, `sysjobs`·`sysjobhistory`) — 백업 age와 같은 WS | 낮음 |
| G15 | Oracle 카운터 범위: Data Guard·ASM·PGA/SGA·Resource Manager·PDB별 `V$CON_SYSMETRIC`·`V$PGASTAT`·`V$SGAINFO`·`V$PROCESS` | ◐ `V$SYSMETRIC·V$SYSSTAT·V$RESOURCE_LIMIT·DBA_TABLESPACE_USAGE_METRICS·V$OSSTAT` | 허용목록에 **객체별 조건부 추가**(19c Licensing 문서상 Diagnostics/Tuning Pack 제한 객체 아님 — 코덱스 대조): `V_$CON_SYSMETRIC·V_$PDBS·V_$CONTAINERS`(CDB capability) · `V_$PGASTAT·V_$SGAINFO·V_$PROCESS`(메모리) · `V_$DATAGUARD_STATS·V_$DATAGUARD_CONFIG`(DG capability, 역할·freshness 확인) · **`V_$ASM_DISKGROUP_STAT`**(`V$ASM_DISKGROUP`은 매 조회 disk discovery — Oracle 문서가 모니터링 금지 권고) · `V_$RSRCMGRMETRIC`(plan 없어도 값 일부 존재 — "미사용=미지원" 처리 금지) · `V_$LOCKED_OBJECT`(객체명 해석에 카탈로그 추가) · `V_$PARAMETER`(G1, 설정값 보호). RAC: Datadog도 **노드별 `V$` + 필요 시 `GV$`** → Q3는 "노드별 대상 + G12 묶음 + `V$SESSION.BLOCKING_INSTANCE/BLOCKING_SESSION`(`BLOCKING_SESSION_STATUS='VALID'`일 때만) 표기, 원격 세션 조인은 INSTANCE_NUMBER→노드 매핑·SERIAL#·시차 확인 뒤 가능하고 실패 시 **unresolved**" — `GV$` 불필요 선언 금지(**Q29**) | 중(객체별 검증·에디션 분기·RAC 조인 검증). 1차 제안의 "GV$ 안 쓴다"는 **오류**였음 |
| G16 | PG 카운터 가족 30+(replication_slot·wal·io(16+)·bgwriter·sessions(14+)·conflicts·archiver·buffercache·checksums·vacuum progress·subscription) | ◐ "허용목록 상수 60개" 미열거 | v1.2 부록 B에 **엔진별 카운터 허용목록 열거**(PG≈70·MySQL≈60·MSSQL≈70·Oracle≈50). 선택(무거운 것): `pg_database_size`·relation 통계·`pg_buffercache` | 문서 작업 |
| G17 | MySQL Q 열 20종(rows_examined·tmp_disk_tables·no_index_used·sort_merge_passes·errors·lock_time) | ◐ "엔진별 extra" | `dbm_query_stat.extra` jsonb 키 목록을 엔진별로 고정·문서화, 화면은 비교 가능한 공통 열 + 엔진 열 | 낮음 |
| G18 | MSSQL Q 열(worker_time·logical/physical reads·spills·memory grant·dop·clr) | ◐ | 동일 | 낮음 |
| G19 | 난독화기가 **메타데이터**(테이블·명령·주석)를 부산물로 추출 | ✖ | 토크나이저가 `tables[]·command·comments[]`를 함께 내보내도록 범위 확장(P1a) → G2 테이블↔쿼리, 명령 유형 필터, G10 태그 | 낮음(이미 토큰 단계) |
| G20 | 원문 캡처 opt-in + RBAC(`collect_raw_query_statement`, PG prepared 불가) | ✅ `keep_raw_sql`·`DBM_RAW_SQL_VIEW` | 문구 보강: "PG prepared statement 값은 서버가 치환해 원문에도 없다" | — |
| G21 | 활동 상한 PG 3500행(초과 시 최장 트랜잭션 우선) | 1,000행, blocker→대기→활성 | 유지(R2로 검증), 기본값 1,000→**2,000** 검토 | R2 |
| G22 | 오버헤드 벤치(CPU ~1%, Oracle 0.2%) | R2 "CPU +1% 미만" | 벤치 조건(TPC-C 20wh·2vCPU) 참고치로 R2 보고서 양식에 포함 | — |
| G23 | DB 자동 발견(`database_autodiscovery`)·DB별 접속 | ◐ namespace 모델 | 🔴 정정: PG **Q 통계·대표 텍스트는 확장이 설치된 한 DB에서 서버 전체를 조회**한다(DB별 접속 불필요). DB별 접속이 필요한 것은 `pg_stat_user_tables/indexes`·`pg_statio_*`·함수 통계·테이블/컬럼/인덱스/FK 정의·OID 이름 해석·relation 크기. 설계: **발견과 수집 분리**(`datallowconn`+CONNECT 가능+시스템 DB 제외+include/exclude, 신규 DB는 후보만) · **기본 수집 DB 상한 10**(전 DB 자동 활성화 금지, 50 DB는 규모 프로필로 인증 — **Q27**) · namespace 작업은 대상당 동시 1·DB당 예산(예 3s)·순회 총예산(예 10분당 20s)·전역 동시성, 넘기면 cursor 이어가기 + DB별 `last_success_at`·부분 표시 · 접속은 fast/slow 외 namespace 1개(대상당 최대 3) · `300 tables` 상한은 **대상 전체 기준** | 중. 코덱스 🔴 수정 반영 |
| G24 | **식별자 1 = 과금 호스트 1** | 라이선스 `maxHosts` 자리만(프리미엄 §7.1 M3) | **Q22**: DB_MONITORING 상한 단위(대상 수 `maxDbTargets`?)를 클레임에 둘지, 1차 강제 여부 | 라이선스 발급기 동반 변경 |
| G25 | 샘플은 정규화 쿼리 상한 없음 | 세션 raw 48h ✅ | — | — |
| G26 | Custom metrics(`custom_queries`, 비즈니스 카운터) | ✖ | **Q25**: "사용자 정의 읽기 SQL 메트릭"(DBM_ADMIN 승인·타임아웃·간격 ≥60s·반환 행 상한·결과만 저장) P3 후보. Oracle은 Datadog도 비용 경고 → 기본 비활성 | 중(임의 SQL 실행 = 보안 심사 쟁점) |
| G27 | 보존 15개월/15일 | 1h 180일 / raw 48h | 유지. 1h 롤업 365일 옵션은 디스크 예산 안에서(Q18) | — |
| G28 | Oracle 플랜 = `V$SQL_PLAN_STATISTICS_ALL`(실행 통계 포함) | `V$SQL_PLAN`, STATISTICS_ALL은 옵션 | 유지. 실행 row 통계는 `STATISTICS_LEVEL=ALL` **또는** `GATHER_PLAN_STATISTICS` 힌트 등으로 채워지며, 없으면 estimated rows만 — 화면에서 estimated/actual 구분 | — |
| G29 | Blocking Queries 시계열(지속·실행 수·대기 수) | ✅ `dbm_lock_incident` | 화면에 "블로커 SQL별 유발 대기 시간 합" 지표 추가(High Impact Blocker를 **데이터**로) | 낮음 |
| G30 | Long Running Query 30s | `LONG_TX` | 규칙 `LONG_QUERY`(세션 경과 > t, 기본 30s) 추가 — 트랜잭션과 별개 | 낮음 |
| G31 | Query Regression·플랜 변경 | ✅ P3 | — | — |
| G32 | 접속 제약(프록시·LB 금지, 노드마다 Agent) | ✅ endpoint 우선순위 + `boot_epoch` 노드 전환 감지 | 우리가 더 유연함을 문서에 명시(VIP 허용, 노드 전환 시 통계 구간 분리) | — |
| G33 | PG 권고 설정 점검(`track=ALL`·`track_utility`·`max`·`track_io_timing`·PG15 INHERIT) · MySQL `MAX_USER_CONNECTIONS 5`·digest 4096 | ◐ 일부 | capability 검사에 **"권고 설정" 등급(RECOMMENDED)** 추가, 계정 스크립트에 연결 수 상한(MySQL `MAX_USER_CONNECTIONS 5`, Oracle 프로파일 `SESSIONS_PER_USER 5`) | 낮음 |
| G34 | "두 간격 뒤에야 메트릭" · digest 테이블 포화 · `pg_stat_statements.max` churn | ◐ checkpoint 첫 관측 partial | 포화·churn 감지 지표(`dbm_capability` detail: digest 사용률, `pg_stat_statements` dealloc 수) P1b | 낮음 |
| G35 | Oracle ASH **옵션**(`active_session_history: false`, 라이선스 경고) | Q4 "v1 제외" | Datadog 선례와 동일 → **Q4 추천을 "P5 `ORACLE_DIAGNOSTICS` 프로필(기본 OFF, 라이선스 확인 체크박스)"로 구체화** | — |
| G36 | MySQL consumer 런타임 토글 프로시저 | "가이드만" | 유지. 선택 스크립트로 제공(DB 측 객체, 고객 선택) | — |
| G37 | Oracle `DBA_FEATURE_USAGE_STATISTICS` grant | 없음 | **채택하지 않음** — 우리는 팩 사용 여부를 "읽어서 확인"하지 않고 호출 객체로 보증(D5). 읽기만 해도 되지만 고객 질문을 부른다 | — |
| G38 | DBM API(query_signature 조인·plan.definition) | `/dbm/**` | 외부 연동용 `query_signature`(=fingerprint) 노출·플랜 JSON 반환 유지 | — |

**원칙 1(승인 항목 2개: 계정+포트) 충돌 정리** — Datadog은 세 엔진에서 DB 측 객체(PG 함수 2·MySQL 프로시저 2·Oracle 뷰 1·MSSQL XE 세션 0~3)를 요구한다. 1차 제안은 "객체가 필요한 기능을 선택 패키지(승인 항목 3)로 분리"였으나 **코덱스 반대 → 철회**: 별도 승인 경로를 새로 만드는 제품 결정이고 "기본 OFF"로 심사·업그레이드·취약점 책임이 줄지 않는다. **v1.2 결정**: GA는 **"MovesEye 전용 함수·뷰·프로시저·XE 세션 생성 없음"**(문구 — "DB 측 객체 0개"는 `pg_stat_statements` 확장·consumer 설정 전제를 가리므로 쓰지 않음). PG/MySQL 재계획 플랜·MSSQL 완료/에러 XE·consumer 자동 토글은 **GA 비범위 + Q26/Q28**. capability 화면은 "GA 미지원 기능(엔진 차이)"으로 표시.

---

## 5. 코덱스 협의(2026-10-22, gpt-6.1-sol/high, 읽기 전용)
원문 `_workspace/_archive/features/premium/db-monitoring/consult_datadog-gap_codex.md`. 요지:
- 총평 "핵심 격차는 채택, Datadog의 설치·권한 모델은 따라가지 않음". G1~G38 판정 집계 **🔴 11 · 🟡 19 · 🟢 8**(G6·G7·G8·G12·G15·G19·G23·G25·G26·G32·G36이 🔴). 추가 G39~G49 중 🔴 7(G40~G43·G45~G48) · 🟡 4. 사실 오류 표 15건(🔴 9·🟡 6) 별도.
- **2차 검수**(`review_db-monitoring-v1.2_codex.md`, 같은 날): v1.2 델타 정합 — 🔴 C1~C9(EXPLAIN 잔존·레인별 노드 검증·`≥` 점유율·quota/overflow 델타·`toplevel` 키·membership scope·용량 재산식·프로시저 캐시 수명·Oracle 객체명 허용목록) + 🟡 12 → **전건 반영**. 이 조사 기록도 §1.3 plan cost·§1.5 조건·§2.1 CPU 주체 분리·§2.3 MSSQL 권한/2012 특기·MariaDB 행 분리를 정정.
- 🔴 즉시 고친 것: PG Q 수집과 DB별 객체 수집 분리(G23) · GA 자동 플랜 = Oracle·MSSQL 캐시만(G7) · RAC `GV$` 오류 정정(G15) · MSSQL Q 통계의 실행 사용자 미가용(G41) · 원칙 1 "선택 패키지" 철회.
- 놓친 격차 **G39~G49** 추가(호스트별 Rows/Query · client IP·포트 구조화 · MSSQL Q user 부재 · 샘플 백분위 의미 · 샘플링 편향 vs 결정적 잘림 · 알람 정렬 · MariaDB 별도 표 · 부분 스키마 스냅샷의 변경 감지 · 클러스터 합산 규칙 · PG `toplevel` 중복 집계 · 진단 preset) — 전부 v1.2 §15에 반영.
- 새 Q22~Q30 문구 제안 → v1.2 §13. 공수 **+29~50 사람-일**(GA 270~355 → 299~405, 라이선스 상한 강제 최소 구현 포함, 임의 SQL·권한 상승 패키지·XE·로그 플랜 제외).
- 저장: 카운터 확대·프로시저 통계·스키마 이력을 기존 "기타 5~10GB"에 흡수 가정 금지 → R4에 세 테이블군 추가.
- 반영표(G별 채택/수정/보류)는 `devdesign_db-monitoring.md` v1.2 §15.
