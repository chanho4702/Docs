# DB 모니터링 시장·수집 경로 조사 기록 (2026-10-19)

> `devdesign_db-monitoring.md` 설계의 근거 자료. 3갈래 조사(상용 제품 / 오픈·표준 수집 경로 / 국내 시장)를 조사 에이전트가 수행한 결과를 그대로 보존한다. 설계서는 이 파일을 인용하고, 이 파일은 고치지 않는다.

---

# Part A. 상용 DBM 제품 기능 매트릭스

조사일 2026-10-19. 공식 문서 우선, 가격은 공개 페이지가 동적 렌더라 확인 못 한 항목은 "미확인"으로 표기.

## 1. 제품별 요약

### 1-1. Datadog Database Monitoring
| 항목 | 내용 |
|---|---|
| 엔진 | Postgres, MySQL/MariaDB, Oracle(RAC·Exadata·ADB 포함), SQL Server, MongoDB, DocumentDB, ClickHouse ([docs](https://docs.datadoghq.com/database_monitoring/)) |
| 수집 | Datadog Agent가 DB 사용자로 **직접 접속**(프록시·pgbouncer·LB 경유 금지, Agent 1대당 ≤30 인스턴스 권장). SQL Server는 Agent를 DB 호스트에 설치 권장(호스트 지표 상관). Oracle은 CDB 루트에만 접속해 PDB를 조회 ([PG](https://docs.datadoghq.com/database_monitoring/setup_postgres/selfhosted/), [SQL Server](https://docs.datadoghq.com/database_monitoring/setup_sql_server/selfhosted/), [Oracle](https://docs.datadoghq.com/database_monitoring/setup_oracle/selfhosted/)) |
| 권한 | PG: `pg_monitor` 롤 + `pg_stat_statements`(모든 DB에 CREATE EXTENSION, `shared_preload_libraries` 재시작) + `track_activity_query_size=4096` + `datadog` 스키마에 `SECURITY DEFINER` 함수(`explain_statement`, `column_statistics`). SQL Server: `VIEW SERVER STATE`, `CONNECT ANY DATABASE`, `VIEW ANY DEFINITION`(+Agent 잡은 msdb SELECT). Oracle: `CREATE SESSION` + V$ 뷰 25종 SELECT + sysdba가 만든 `dd_session` 뷰(x$ksuse·x$kslwt 기반) — **DBA_HIST/ASH는 grant 목록에 없음** |
| 화면 | Query Metrics(정규화 쿼리 top 200/호스트, Requests·Avg latency·Total time·% time·Rows, 태그 3개까지 그룹) · Query Samples(실행 중/최근 쿼리 스냅샷, 1초 간격, 사용자·클라이언트 IP·서비스·인덱스·plan cost) · Explain Plans(샘플 비용을 평균·p90과 비교) · Databases 페이지(Active Connections, Blocking queries 시각화, Schema 탐색기, Calling services, 복제 토폴로지 클러스터 그룹핑) · Recommendations(Missing/Unused Index, Long Running Query, High Impact Blocker, Query Regression, High Row Count 등 9종) ([query_metrics](https://docs.datadoghq.com/database_monitoring/query_metrics/), [query_samples](https://docs.datadoghq.com/database_monitoring/query_samples/), [database_hosts](https://docs.datadoghq.com/database_monitoring/database_hosts/), [recommendations](https://docs.datadoghq.com/database_monitoring/recommendations/)) |
| 수치 | 쿼리 메트릭 10초 간격·보존 15개월, 샘플 보존 15일, 리터럴 `?` 난독화(스키마명·주석은 미난독화), 오버헤드 "쿼리 시간·CPU 1% 미만" ([data_collected](https://docs.datadoghq.com/database_monitoring/data_collected/)) |
| 베낄 점 | **Query Samples + Explain Plan 결합**, Recommendations 탭(점검 결과를 "다음 행동"으로), 클라이언트 IP/서비스/사용자별 샘플 귀속, `replace_digits`로 파티션 테이블 쿼리 롤업 |
| 가격 | **DB 호스트 단위**(시간별 카운트, 상위 1% 스파이크 제외 high-watermark). 정규화 쿼리는 호스트당 200개 풀. 공개 단가는 동적 페이지라 미확인 — 3rd-party 집계는 연간 약정 $70/호스트/월·온디맨드 $84 ([billing](https://docs.datadoghq.com/account_management/billing/pricing/), [3rd-party](https://www.cloudzero.com/blog/datadog-pricing/)) |

### 1-2. New Relic (Infra On-Host Integration + "Database Performance Monitoring")
| 항목 | 내용 |
|---|---|
| 엔진 | 심층 쿼리 분석: MySQL, PostgreSQL, SQL Server(자체 호스팅 + RDS/Aurora). 2025-07 GA. 별도 NRDOT(OTel) 경로는 프리뷰 ([what's new](https://docs.newrelic.com/whats-new/2025/07/whats-new-07-24-db-query-performance-monitoring/), [OTel PG](https://docs.newrelic.com/docs/opentelemetry/database/postgresql/introduction/)) |
| 수집 | Infra Agent의 OHI(nri-postgresql 등)를 **DB 호스트에 설치**, DB 사용자로 접속. APM 에이전트 불필요 |
| 권한 | PG: `pg_stat_statements` + `pg_read_all_stats` 롤. MySQL: `SELECT ON performance_schema.*`, wait 데이터는 `UPDATE ON performance_schema.setup_consumers`(RDS 재시작 시 consumer 리셋을 재활성화하기 위해) ([PG](https://docs.newrelic.com/docs/infrastructure/host-integrations/host-integrations-list/postgresql/postgresql-integration/), [MySQL](https://docs.newrelic.com/docs/opentelemetry/db360/mysql/hosted/)) |
| 화면 | Slow queries(정규화 텍스트·실행수·avg elapsed·disk r/w) · Wait events(이벤트명·카테고리·총 대기·연관 쿼리) · Blocking sessions(blocked/blocking PID·쿼리) · Individual queries · Execution plans(노드 타입·cost·row estimate). `QUERY_MONITORING_RESPONSE_TIME_THRESHOLD`(기본 1ms), 메트릭당 레코드 상한 20 |
| 베낄 점 | 쓰기문 plan을 DML 권한 없이 수집하는 프로시저 옵션; 임계값·상한으로 전송량 통제 |
| 가격 | 별도 DBM SKU 없음 — 플랫폼 ingest(GB)+사용자 과금에 포함 |

### 1-3. Dynatrace (Databases app + ActiveGate extensions)
| 항목 | 내용 |
|---|---|
| 엔진 | PostgreSQL, MySQL, MSSQL, Oracle, MariaDB, SAP HANA, DB2 등 Extensions 2.0 ([Databases](https://docs.dynatrace.com/docs/observe/infrastructure-observability/databases)) |
| 수집 | **ActiveGate에서 원격(agentless)** JDBC 접속. OneAgent는 호스트 지표만 담당(DB 호스트에 깔려 있으면 자동 상관) |
| 권한 | Oracle: `CREATE SESSION` + V$/GV$/CDB_ 뷰 SELECT(또는 `SELECT_CATALOG_ROLE`), 실행계획은 `V$SQL_PLAN`·`DBMS_XPLAN.DISPLAY_CURSOR`. CDB는 `container_data=all`. SQL Server: `VIEW SERVER STATE`(2022+ 성능 카운터는 `VIEW SERVER PERFORMANCE STATE`), Query Store 뷰는 `VIEW DATABASE STATE` ([Oracle ext](https://docs.dynatrace.com/docs/observe/infrastructure-observability/databases/extensions/oracle-database), [SQL Server ext](https://docs.dynatrace.com/docs/ingest-from/extensions/supported-extensions/sql-server)) |
| 화면 | Overview(health score) · Explorer(인스턴스 표: CPU·메모리·active sessions·user calls) · Databases/Tables/Indexes 뷰(미사용·문제 인덱스 플래그) · Statement performance(CPU/디스크/wait 기준 필터 + 실행계획) · Blocking queries & deadlocks(lock contention) · Alert templates. Oracle 피처셋: Top SQL(5분 주기, 로그로 적재·마스킹 규칙), waitEvents(클래스별/top 20), Sessions(active·blocked·deadlocks), Tablespaces(50% 초과만/전체), RAC, Data Guard, ASM |
| 베낄 점 | **피처셋 단위 on/off**로 고객이 수집 범위·비용을 고름("tablespaces(detailed)"처럼 상세판 분리); health score 단일 지표; 수집 데이터 포인트 공식 공개(`55×인스턴스+7×DB+…`) |
| 가격 | 확장 자체는 무료, **ingest 과금**(DDU 또는 DPS metrics·logs) |

### 1-4. SolarWinds Database Performance Analyzer (DPA)
| 항목 | 내용 |
|---|---|
| 엔진 | Oracle(SE/EE·RAC·Exadata), SQL Server, SAP ASE, DB2, MySQL/Percona/MariaDB, PostgreSQL/EDB, SAP HANA + RDS/Aurora/Azure SQL/Cloud SQL ([versions](https://documentation.solarwinds.com/en/success_center/dpa/content/dpa-database-versions-you-can-monitor.htm)) |
| 수집 | **DPA 서버에서 agentless 원격 폴링**, 자체 repository DB에 저장. 등록 시에만 특권 사용자(Oracle DBA/SYS, SQL Server sysadmin) 필요 — 모니터링 유저 생성·패키지 설치 후 특권 자격은 저장 안 함. Oracle은 "성능 최적화 스크립트(SYS 스키마 객체)" vs "축소 권한 스크립트" 선택 ([Oracle 등록](https://documentation.solarwinds.com/en/success_center/dpa/content/dpa-register-an-oracle-database.htm)) |
| 화면 | **Wait-time 중심**(Response Time Analysis): 일→시간→Top SQL→wait type 드릴다운, 쿼리별 wait type 분해 · Anomaly detection(90일 시간별 wait를 ML 학습, 최소 3일, 예측치+2σ warning/+3σ critical, 10분 갱신) · Blocking/Deadlock 계층 분석 · Table Tuning Advisor / Query Advisor(인덱스 기회) · Baselines ([anomalies](https://documentation.solarwinds.com/en/success_center/dpa/content/dpa-about-wait-time-anomalies.htm), [datasheet](https://connection.com/media/uhchgyq2/cnxn-solarwinds-dpa-ds.pdf)) |
| 베낄 점 | "오늘 이 시간대가 평소보다 느린가"를 wait-time 예측 밴드로 보여주는 **시간별 이상탐지 히트맵**; 모든 분석의 공통 분모가 wait time |
| 가격 | **인스턴스 단위 영구/구독 라이선스**. 공개 참고가: SQL Server·Oracle SE $1,995/인스턴스, Oracle EE·DB2·ASE $3,495(출시 시점), 리셀러 MSRP Oracle EE $2,125/인스턴스(50~74 tier), Azure SQL DB $165/DB ([thwack](https://thwack.solarwinds.com/discussion/144169/performance-optimization-for-every-database-instance), [SHI](https://www.publicsector.shidirect.com/product/50542529/SolarWinds-Database-Performance-Analyzer-for-Oracle-EE,-DB2,-or-ASE)) |

### 1-5. Redgate Monitor (구 SQL Monitor)
| 항목 | 내용 |
|---|---|
| 엔진 | SQL Server 2008R2+, PostgreSQL 10+, Oracle 19c+, MySQL 8+, MongoDB 6+, Azure SQL/MI, RDS/Aurora ([product](https://www.red-gate.com/products/redgate-monitor/)) |
| 수집 | 자체 호스팅 Base Monitor가 원격 수집(또는 SaaS 에디션) |
| 화면 | SQL Server Overview: Top queries · Tracked queries · Top Waits · Top procedures · Current activity · Tempdb · **Blocking Processes overview**(총 블로킹 시간 top 10, 체인 헤드 → 블로킹 체인 시각화) · Indexes · Query executions · Query waits trend. 알림 "Deadlocks (Extended Events)"가 deadlock graph를 캡처해 세션·쿼리·객체를 표로 정리. PG wait events(`pg_stat_activity` 기반 Lock/LWLock/IO/Client). Estate: 구성·패치·백업·디스크·라이선스 ([overview](https://documentation.red-gate.com/monitor/sql-server-overview-239668177.html), [blocking](https://documentation.red-gate.com/monitor/blocking-processes-overview-239668409.html), [deadlocks](https://www.red-gate.com/hub/product-learning/redgate-monitor/monitoring-troubleshooting-deadlocks)) |
| 베낄 점 | **Tracked queries**(특정 쿼리를 고정 추적), 배포(Flyway) 이벤트를 성능 타임라인에 오버레이, Estate(패치·백업·구성 드리프트) |
| 가격 | **서버 단위/연**(1-4·5-9·10-19·20+ 티어). 서버=물리/VM/클러스터 노드/PaaS 인스턴스, Azure SQL DB 5개=1 라이선스 ([licensing](https://documentation.red-gate.com/monitor/overview-and-licensing/licensing)) |

### 1-6. Quest Foglight for Databases (+ SQL Performance Investigator)
| 항목 | 내용 |
|---|---|
| 엔진 | Oracle, SQL Server, DB2, SAP ASE, MySQL, PostgreSQL, MongoDB, Cassandra 등(8.0). PI 애드온은 Oracle·SQL Server 중심, PostgreSQL PI 2024-12 추가 ([Quest news](https://www.quest.com/news/?p=2152461), [KB](https://support.quest.com/kb/4260863/)) |
| 수집 | agentless(원격 에이전트가 수집, "단일 모니터링 인스턴스로 수백 DB") |
| 화면 | PI: **다차원 드릴다운**(SQL·사용자·프로그램·머신·DB·세션 등 차원을 자유 교차, Lock 리소스 선택 시 전 차원이 lock 관점으로 필터) · **Change tracking**(실행계획·구성·스키마 변경을 성능 타임라인에 겹침) · 베이스라인 비교 · lock 분석 ([SQL Server 가이드](https://support.quest.com/fr-fr/technical-documents/foglight-for-sql-server-cartridge-/6.0.0.10/user-guide/40), [PI datasheet](https://origin.quest.com/documents/quest-foglight-sql-performance-investigator-datasheet-146099.pdf)) |
| 베낄 점 | **"무엇이 바뀌었나" 변경 트랙 오버레이**, 다차원 pivot |
| 가격 | 비공개(영업 문의), 인스턴스 기반 |

### 1-7. Percona Monitoring and Management (PMM) — 오픈소스 베이스라인
| 항목 | 내용 |
|---|---|
| 엔진 | MySQL/MariaDB/Percona, PostgreSQL, MongoDB(+ProxySQL, HAProxy) |
| 수집 | pmm-agent(클라이언트, slow log 읽으려면 DB 호스트 필수) → pmm-server(VictoriaMetrics+ClickHouse+Grafana) |
| 권한 | MySQL: `SELECT, PROCESS, REPLICATION CLIENT, RELOAD`(8.x는 `BACKUP_ADMIN` 추가), `MAX_USER_CONNECTIONS 10`. QAN 소스: `perfschema`(권장: MySQL 5.6+/MariaDB) vs `slowlog`(권장: Percona Server/PXC, `long_query_time=0`+`log_slow_rate_limit` 샘플링) — 둘 동시 금지. PG: **SUPERUSER 요구**(RDS는 `rds_superuser`), `pg_stat_statements` 또는 Percona `pg_stat_monitor`(히스토그램·예제·bucket 집계·plan, 단 `pgsm_enable_query_plan=off` 권고) ([MySQL](https://docs.percona.com/percona-monitoring-and-management/3/install-pmm/install-pmm-client/connect-database/mysql/mysql.html), [PG](https://docs.percona.com/percona-monitoring-and-management/3/install-pmm/install-pmm-client/connect-database/postgresql.html)) |
| 화면 | QAN: Filters(Environment·Cluster·Replication Set·Database·Schema·Node·Service·**Client Host·User Name**·Command Type·Application·Plan Summary + 쿼리 주석 기반 커스텀 키) · Overview(fingerprint별 load/count/latency sparkline) · Details(MySQL query time 분해: lock·IO·InnoDB queue·row-lock, Examples, Explain(MySQL/Mongo), Tables, Plan(pg_stat_monitor)). 1분 수집. 1,000 테이블 초과 시 tablestats 자동 비활성 ([filters](https://docs.percona.com/percona-monitoring-and-management/3/use/qan/panels/filters.html), [details](https://docs.percona.com/percona-monitoring-and-management/3/use/qan/panels/details.html)) |
| 베낄 점 | **다차원 필터 패널**(특히 client host·user·DB), MySQL 쿼리 시간 분해 바, 라벨 기반 접근제어로 "볼 수 있는 쿼리" 제한 |
| 가격 | 무료(AGPL), Percona 지원 구독 |

### 1-8. Grafana Cloud Database Observability / SigNoz (OTel 계열)
| 항목 | Grafana Cloud DB O11y | SigNoz |
|---|---|---|
| 엔진 | MySQL 8+(MariaDB 미지원), PostgreSQL + RDS/Aurora/Azure/Cloud SQL. 2026-04 GA ([intro](https://grafana.com/docs/grafana-cloud/monitor-applications/database-observability/introduction.md), [GA](https://grafana.com/whats-new/2026-04-02-database-observability-now-generally-available/)) | PG, MySQL, Mongo, SQL Server, Redis, ClickHouse 등 메트릭 대시보드 ([docs](https://signoz.io/docs/database-monitoring)) |
| 수집 | Alloy: exporter(`pg_stat_statements`/Performance Schema) + 컬렉터 `query_samples`·`query_details`·`schema_details`·`explain_plans`(Loki 로그로 적재). MySQL은 `performance_schema_max_digest_length=4096`, 모니터링 유저에 `UPDATE ON performance_schema.setup_actors` | OTel Collector receiver / Prometheus exporter + 애플리케이션 trace의 DB span |
| 화면 | Monitor/Investigate/Optimize — 쿼리 RED 메트릭, 샘플(기본 파라미터 redaction), wait events, explain(SELECT만), 스키마 | 메트릭·슬로우로그·DB 호출 span 집계. **전용 Top SQL 화면 없음** |
| 가격 | **host-hour 과금**(3rd-party 집계 Pro $0.07/host-hour ≈ $51/호스트/월, Free 2,232 host-hours) | OSS 무료 / Cloud ingest 과금 |

## 2. 종합

### 2-1. Table stakes — 전 제품 공통(유료 기능이면 고객이 당연히 기대)
1. **인스턴스 헬스 오버뷰 + 호스트 지표 상관**(CPU·메모리·디스크·연결 수·버퍼/캐시 히트·TPS).
2. **Top SQL(정규화/fingerprint)** — 리터럴을 `?`로 치환해 묶고 Total time·Calls·Avg latency·Rows·% of total로 정렬. 상한(Datadog 200/호스트, New Relic 20/메트릭)으로 폭주 방어.
3. **활성 세션/현재 활동**(pg_stat_activity, sys.dm_exec_requests, V$SESSION) + **블로킹 체인**(누가 누구를 막나). Redgate·DPA·Datadog·Dynatrace 전부 "블로킹 트리" 시각화 보유.
4. **Wait event 분석**(쿼리별 또는 인스턴스별). DPA는 이것이 중심축, 나머지는 보조 축.
5. **실행계획(explain plan)** 보기 — 최소 샘플 1건에 대해.
6. **복제 지연·tablespace/디스크 성장·연결 수 상한·슬로우 쿼리 로그**에 대한 **알림 템플릿**.
7. **시간 범위 비교/히스토리**(최소 수주 보존; Datadog 메트릭 15개월·샘플 15일).

### 2-2. 차별화 요소 — 일부만 보유
| 차별화 | 보유 제품 |
|---|---|
| Query sample ↔ explain plan 결합, 샘플 비용을 p90/평균과 비교, 플랜 변경 추적 | Datadog, New Relic(일부), Grafana |
| Recommendations(미사용/누락 인덱스, 쿼리 회귀, 장기 실행, 고충격 블로커) | Datadog(9종), Dynatrace(인덱스 플래그), DPA(Table/Query Advisor) |
| Wait-time **ML 이상탐지**(시간별 예측 밴드) | DPA |
| 변경 트랙(plan·config·schema·배포 이벤트) 오버레이 | Quest PI, Redgate(Flyway 배포) |
| 다차원 pivot/필터(client host·user·program·DB) | PMM QAN, Quest PI, Datadog(태그 3개) |
| Deadlock graph 캡처·시각화(Extended Events / 로그) | Redgate, Datadog(SQL Server), Dynatrace(Sessions 피처셋) |
| 특정 쿼리 고정 추적(Tracked queries) | Redgate |
| 수집 피처셋 on/off로 비용·부하 조절 | Dynatrace, Datadog(`collect_schemas` 등) |
| 스키마 탐색기(테이블·컬럼·FK·인덱스) + column statistics | Datadog, Dynatrace, Grafana |
| Estate 관리(패치·백업·구성 드리프트·라이선스) | Redgate |
| 쿼리 텍스트 접근 통제(라벨 기반/마스킹) | PMM(LBAC), Dynatrace(마스킹 규칙), Grafana(기본 redaction) |

### 2-3. 수집 방식이 고객 DB에 지우는 권한·오버헤드
| 엔진 | 필요 설정·권한 | 함정 |
|---|---|---|
| **PostgreSQL** | `pg_stat_statements`(모든 제품 공통; `shared_preload_libraries` 변경 = **재시작**), `pg_monitor`/`pg_read_all_stats` 롤, `track_activity_query_size` 2048~4096(기본 1024면 긴 쿼리 잘림), 선택 `track_io_timing`, `auto_explain`(실제 EXPLAIN ANALYZE는 로그 경유). explain은 `SECURITY DEFINER` 함수 또는 superuser | PMM은 SUPERUSER 요구 — 보안 심사에서 반감. `pg_database_size()`는 수천 릴레이션에서 느림(Datadog이 끄는 옵션 제공). pg_stat_statements는 wait event가 없어 `pg_stat_activity` 1초 폴링 필요 |
| **MySQL/MariaDB** | `performance_schema=ON`(시작 시), `statements_digest` consumer, `performance_schema_max_digest_length`/`max_sql_text_length` 4096, 권한 `SELECT, PROCESS, REPLICATION CLIENT`(+8.x `BACKUP_ADMIN`), wait 데이터는 `setup_consumers` UPDATE | RDS는 재시작/페일오버마다 consumer 리셋 → 모니터링 유저에 UPDATE 권한 주어 자동 재활성. slow log 방식은 `long_query_time=0`이면 I/O 부담 → 샘플링 필수. perfschema는 메모리 사용↑. MariaDB ≤10.5.7은 Example/Explain 기본 누락 |
| **SQL Server** | `VIEW SERVER STATE`(2022+ 성능 카운터는 `VIEW SERVER PERFORMANCE STATE`), `VIEW ANY DEFINITION`, `CONNECT ANY DATABASE`(2014+), Query Store는 `VIEW DATABASE STATE`, deadlock은 Extended Events 세션/`system_health`, Agent 잡은 msdb SELECT | 2012는 DB별 유저 매핑 필요. Redgate 포럼에 **모니터링 쿼리 자체가 tempdb 데드락 유발** 사례 — 수집 쿼리에 NOLOCK/짧은 트랜잭션 설계 필요 |
| **Oracle** | `CREATE SESSION` + V$ 뷰 SELECT(`V$SESSION, V$SQLSTATS, V$SQL, V$SQL_PLAN_STATISTICS_ALL, V$SYSMETRIC, V$OSSTAT, V$LOCK, V$TRANSACTION, V$DATAFILE`, `DBA_TABLESPACE_USAGE_METRICS` 등) 또는 `SELECT_CATALOG_ROLE`, 실행계획은 `DBMS_XPLAN.DISPLAY_CURSOR`. CDB는 `C##` 유저+`container_data=all` | **Diagnostics Pack 함정**: `DBA_HIST_*`(6개 예외 제외)·`V$ACTIVE_SESSION_HISTORY`·AWR/ADDM은 EE 전용 유료 팩이며 조회만 해도 `DBA_FEATURE_USAGE_STATISTICS`에 사용이 기록된다 ([Oracle doc](https://docs.oracle.com/cd/E63000_01/OEMLI/db_mgmt.htm), [Tanel Poder](https://blog.tanelpoder.com/2009/05/06/free-dba_hist-awr-views-in-11g/)). Datadog·Dynatrace의 공개 grant 목록은 **V$ 뷰만** 쓰고 ASH/DBA_HIST를 피한다(Datadog은 x$ 기반 `dd_session` 뷰로 자체 ASH 유사 샘플링). 우리도 **V$SESSION 자체 폴링으로 ASH를 대체**하고 `CONTROL_MANAGEMENT_PACK_ACCESS=NONE` 환경에서도 동작하도록 설계해야 한다. DPA는 SYS 스키마 객체를 쓰는 "성능 최적화" vs "축소 권한" 두 스크립트를 제공 |

### 2-4. 설계 시사점(조사 에이전트 의견)
- **수집 토폴로지**: 국내 온프레 고객은 DB 호스트에 에이전트 설치를 꺼린다 → DPA/Dynatrace식 **중앙 원격 폴링(agentless, 모니터링 전용 읽기 계정)**이 기본, 호스트 지표는 기존 Zabbix 에이전트와 상관. 슬로우로그가 필요한 MySQL만 Zabbix agent 로그 아이템으로 보조.
- **최소 기능(1차)**: 인스턴스 헬스 + Top SQL(fingerprint) + 활성 세션/블로킹 트리 + wait 분해 + 샘플 1건의 explain + 복제/tablespace 알림. 이것이 7개 제품 공통분모.
- **차별화 후보(2차)**: Zabbix 이벤트·호스트 지표와 같은 타임라인 위의 **변경 오버레이**(Quest식), DPA식 **wait-time 시간대 히트맵**, PMM식 **client host·user 필터**.
- **패키징**: 시장 표준은 **DB 인스턴스(호스트) 단위**. Datadog $70/호스트/월, Grafana ≈$51, DPA $2k~3.5k/인스턴스(영구), Redgate 서버/연.
- **고객 DB 부담 고지**: 엔진별 "필요 권한·재시작 여부·오라클 팩 비사용" 체크리스트를 설치 가이드에 명시. Oracle은 **Diagnostics Pack 미사용 보증**이 영업 포인트가 된다.

---

# Part B. 오픈·표준 수집 경로 (Zabbix 7.0 LTS + otelcol-contrib 0.159.x 전제)

## 요약 (한 줄)
Zabbix 공식 DB 템플릿은 **전부 인스턴스 집계치**만 제공하며 Top SQL·세션 단위 데이터는 **없다**(전 엔진 확인). 쿼리 단위 데이터는 (1) 이미 보유한 otelcol-contrib의 DB receiver `events`(2025~2026년에 추가, 0.159.x에 모두 포함), (2) Spring BE 자체 JDBC poller, (3) agent 2 `*.custom.query` 중 하나로만 가능하다. Oracle은 **ASH/AWR = Diagnostics Pack 유료**이며, Zabbix 공식 Oracle 템플릿 2종 자체가 `V$ACTIVE_SESSION_HISTORY`를 쓴다는 함정이 있다.

## A. Zabbix 공식 DB 템플릿

### A-1. 템플릿 목록 (`templates/db`, 브랜치별)
7.0 브랜치 25개: cassandra_jmx, clickhouse_http, cockroachdb_http, gridgain_jmx, ignite_jmx, influxdb_http, mongodb, mongodb_cluster, mssql_agent2, mssql_odbc, mysql_agent, mysql_agent2, mysql_agent2_active, mysql_agent_active, mysql_odbc, oracle_agent2, oracle_odbc, postgresql_agent, postgresql_agent2, postgresql_agent2_active, postgresql_agent_active, postgresql_odbc, redis, tidb_http, yugabytedb_http. 7.4 브랜치도 동일 25개. 6.0 브랜치는 21개(`*_active` 4종 없음). Elasticsearch는 `templates/app/elasticsearch_http`.
- https://github.com/zabbix/zabbix/tree/release/7.0/templates/db , https://github.com/zabbix/zabbix/tree/release/6.0/templates/db
- 카탈로그: https://www.zabbix.com/integrations/

### A-2. 엔진별 상세

| 엔진 | 수집 변형 | 버전 메모 | 필요 권한 | 제공 메트릭 | 쿼리/세션 단위 |
|---|---|---|---|---|---|
| **MySQL/MariaDB** | agent 2 built-in 플러그인(`mysql.*`), agent UserParameter, ODBC, +active 변형(7.0) | 플러그인은 6.0~7.4 모두 built-in | `GRANT REPLICATION CLIENT, PROCESS, SHOW DATABASES, SHOW VIEW ON *.*`; MariaDB 10.5.9+는 `SLAVE MONITOR` 추가 | status 변수 벌크(connections, threads, QPS, bytes), InnoDB buffer pool 효율, row lock time/waits, 복제(seconds behind master), slow queries/s, DB별 크기 LLD | **없음**(processlist 없음, 집계 thread 수만) |
| **PostgreSQL** | agent 2 **loadable** 플러그인(`pgsql.*`), agent UserParameter, ODBC, +active 변형(7.0) | 플러그인 6.0.10부터 loadable로 분리 | `CREATE USER zbx_monitor ... INHERIT; GRANT pg_monitor TO zbx_monitor;` + pg_hba | bgwriter/checkpoint, WAL·archive, `pg_stat_database` 합계, `pg_stat_activity` **상태별 카운트**, `pg_locks` 모드별 카운트, 복제 lag·standby 수, DB별 LLD(크기·bloat·age·deadlock·slow count), 커스텀 SQL 경로 | **없음**(쿼리 타이밍은 DB별 max/sum/slow-count 집계; `pg_stat_statements` 언급 없음) |
| **Oracle** | agent 2 **built-in** 플러그인(`oracle.*`, Oracle Instant Client 필수), ODBC | 6.0~7.4 모두 built-in. 7.0.19+ TNS 지원 | 다수 `GRANT SELECT ON V_$...` + `SELECT_CATALOG_ROLE`(README가 과도하다고 경고). **`GRANT SELECT ON V_$ACTIVE_SESSION_HISTORY` 포함** | 캐시 히트율, physical I/O, logons, 세션 total/active/inactive·lock rate·장기 lock·concurrency, PGA/SGA, redo/process/datafile 한계, FRA, DB/PDB/tablespace/archive log/ASM LLD | **없음**. 🔴 ODBC 템플릿 `Get system metrics`가 `FROM v$active_session_history ... SYSDATE - 15/1440`로 concurrency rate 산출 → README 명시: "Diagnostics Pack 라이선스 필요" |
| **MSSQL** | agent 2 **loadable** 플러그인(`mssql.*`, 7.0 템플릿은 플러그인 7.0.10+), ODBC(MS ODBC Driver를 서버/프록시에 설치) | 🔴 "7.0 신규" 아님 — 6.0 브랜치에도 존재(플러그인 6.0.39+, Zabbix 6.0.27+) | `GRANT VIEW SERVER STATE`(2017/2019) 또는 `VIEW SERVER PERFORMANCE STATE`(2022), `VIEW ANY DEFINITION`, msdb 일부 | perf counter(access methods, buffer manager, latches, locks, memory, cache, SQL statistics), transactions, logins/s, AG·mirroring·quorum, DB별 상태·파일·로그·백업 age, Agent job, 9개 LLD | **없음**. blocking은 "Number of blocked processes" 집계 + 5분 트리거만 |
| **MongoDB** | agent 2 **loadable** 플러그인(`mongodb.*`) | 6.0.6부터 loadable | `clusterMonitor` | serverStatus(opcounters, connections, cursors, memory, WiredTiger), DB·컬렉션·복제 LLD | **없음** |
| **Redis** | agent 2 **built-in**(`redis.*`) | — | INFO·CONFIG·CLIENT·SLOWLOG 권한(ACL) | INFO 섹션별, keyspace/AOF/replica LLD, **slowlog entries/s** | 명령 단위 없음 |
| **ClickHouse** | HTTP agent(8123) | — | 전용 사용자 | 쿼리 rate, running queries, longest running query time, 연결, 복제 delay, LLD | `system.query_log` 미사용 |

출처: 각 README — `https://raw.githubusercontent.com/zabbix/zabbix/release/7.0/templates/db/<name>/README.md` (mysql_agent2, postgresql_agent2, postgresql_odbc, oracle_agent2, oracle_odbc, mssql_agent2, mssql_odbc, mongodb, redis, clickhouse_http) ; Oracle 플러그인 README: https://raw.githubusercontent.com/zabbix/zabbix/release/7.0/src/go/plugins/oracle/README.md ; Oracle ODBC YAML: https://raw.githubusercontent.com/zabbix/zabbix/release/7.0/templates/db/oracle_odbc/template_db_oracle_odbc.yaml

### A-3. agent 2 플러그인: built-in vs loadable

| 버전 | loadable(별도 패키지) | DB 관련 built-in |
|---|---|---|
| 6.0 | MongoDB(6.0.6+), PostgreSQL(6.0.10+), MSSQL(6.0.39+, 2024 백포트) | MySQL, Oracle, Redis, Memcached |
| 7.0 | Ember+, MongoDB, MSSQL, PostgreSQL | MySQL, Oracle(Instant Client 필요), Redis, Memcached |
| 7.4 | Ember+, MongoDB, MSSQL, **NVIDIA GPU**, PostgreSQL | 동일 |

- https://www.zabbix.com/documentation/7.0/en/manual/extensions/plugins · 7.4에서 `Plugins.*.CustomQueriesPath` 기본 경로 + `CustomQueriesEnabled` 스위치 추가. https://www.zabbix.com/documentation/7.4/en/manual/introduction/whatsnew740

### A-4. 커스텀 SQL 통로(참고)
- agent 2: `mysql.custom.query[...]`, `pgsql.custom.query[...]`, `oracle.custom.query[...]`, `mssql.custom.query[...]` — `.sql` 파일명=queryName, **결과는 JSON 객체 반환**. https://www.zabbix.com/documentation/7.0/en/manual/config/items/itemtypes/zabbix_agent/zabbix_agent2
- ODBC: `db.odbc.select`(1값), `db.odbc.get`(다행·다열 JSON), `db.odbc.discovery`. 서버/프록시 odbc poller+unixODBC+드라이버 필요. https://www.zabbix.com/documentation/7.0/en/manual/config/items/itemtypes/odbc_checks

## B. otelcol-contrib DB receiver (main 기준; 0.159.x 포함)

| receiver | 안정성 metrics / logs | 연결 | 권한 | 쿼리 단위 events |
|---|---|---|---|---|
| `postgresqlreceiver` | beta / development | 원격 `endpoint`, `connect_database` | `pg_stat_database` SELECT; query sample은 `pg_monitor` | `db.server.query_sample`(pg_stat_activity, `max_rows_per_query` 1000), `db.server.top_query`(pg_stat_statements, `top_n_query` 200, `collection_interval` 60s, plan cache), `db.server.query_plan`. traceparent in application_name으로 trace 연동 |
| `sqlserverreceiver` | beta / development | 직접 연결 또는 Windows perf counter | `VIEW SERVER STATE`(≤2019) / `VIEW SERVER PERFORMANCE STATE`(2022+); top_procedure는 `VIEW ANY DEFINITION` | `top_query`(**dm_exec_query_stats + dm_exec_sql_text + dm_exec_query_plan + dm_exec_procedure_stats**, `lookback_time`, `top_query_count` 250), `query_sample`(**dm_exec_requests + dm_exec_sessions + dm_exec_connections + dm_exec_sql_text + dm_exec_input_buffer**: `blocking_session_id`, `wait_type/time/resource`, `cpu_time`, `query_hash`), `top_procedure`, `query_plan` |
| `mysqlreceiver` | beta / development | 원격 | `SHOW GLOBAL STATUS`; query sample은 `performance_schema.*` SELECT | `top_query`(digest, lookback), `query_sample`(100행), `query_plan`(MySQL 8.0+만; MariaDB/5.7 미지원) |
| `oracledbreceiver` | **alpha** / development | `datasource` 또는 endpoint+service | `V$SESSION, V$SYSSTAT, V$RESOURCE_LIMIT, V$OSSTAT, V$SGAINFO, DBA_TABLESPACE*`; events는 `V$SQL, V$SQL_PLAN_STATISTICS_ALL, V$LOCK, V$SESSION_EVENT, DBA_OBJECTS/PROCEDURES` | `query_sample`, `top_query`, `session.wait_sample`, `top_procedure`, `query_plan`. **ASH/DBA_HIST 미사용 → 라이선스 안전** |
| `mongodbreceiver` | beta / development | hosts/replica_set | `clusterMonitor` | `top_query`(system.profile→getLog 폴백), `query_sample`($currentOp) |
| `redisreceiver` | beta / – | endpoint | INFO | 없음 |
| `sqlqueryreceiver` | alpha / development | 드라이버 postgres, mysql, sqlserver, oracle, hdb, tds, clickhouse… | 쿼리 권한 | 임의 SQL → metrics 또는 logs(`tracking_column` 증분) |

- 모두 **원격 접속**(DB 호스트 설치 불필요).
- 추가 시점: SQL Server top query PR #37958(2025-03), query sample #38632(2025-03); v0.128.0에서 `events."db.server.top_query".enabled` 키로 개명 + PG query plan 추가; Oracle·MongoDB·MySQL events는 v0.15x대(2025년 말~2026년 초). 벤더 문서 최소 버전: SQL Server/PG 0.147, MySQL 0.151~0.154 → **0.159.x는 전부 포함**.
- 출처: `https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/main/receiver/<name>/README.md` ; https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/main/receiver/sqlserverreceiver/logs-documentation.md
- **Semantic conventions**: `db.client.operation.duration`(Stable), `db.client.connection.*`(Development). 속성 `db.system.name`(Required), `db.namespace`, `db.collection.name`, `db.operation.name`, `db.query.summary`(저카디널리티), `db.query.text`(Opt-In, 새니타이즈 필수). https://opentelemetry.io/docs/specs/semconv/database/database-metrics/

## C. 엔진이 노출하는 쿼리/세션 단위 소스

| 엔진 | Top SQL(누적) | 활성 세션/대기 | 블로킹 | 비고 |
|---|---|---|---|---|
| **PostgreSQL** | `pg_stat_statements` — `shared_preload_libraries` + **재시작** 필요, `compute_query_id`, `.max` 기본 5000, 리터럴→`$1` 정규화, 타인 쿼리 텍스트는 `pg_read_all_stats`(pg_monitor에 포함) | `pg_stat_activity`: `state`, `wait_event_type/wait_event`, `query`(기본 1024B, `track_activity_query_size`), `query_id`(14+) | `pg_blocking_pids(pid)` 권장. **pg_locks 빈번 조회는 lock manager 잠금 → 성능 영향 경고** | `pg_stat_replication`, `auto_explain`, Percona `pg_stat_monitor` |
| **MySQL/MariaDB** | `performance_schema.events_statements_summary_by_digest`(COUNT_STAR, SUM_TIMER_WAIT, SUM_LOCK_TIME, SUM_ROWS_EXAMINED, SUM_NO_INDEX_USED, QUANTILE_95/99, QUERY_SAMPLE_TEXT; `digests_size` 초과 시 NULL 행 흡수) + `sys` | `performance_schema.threads`/`information_schema.processlist` | `performance_schema.data_locks` + `data_lock_waits`(8.0) | slow log, `SHOW ENGINE INNODB STATUS`, `SHOW REPLICA STATUS` |
| **SQL Server** | `sys.dm_exec_query_stats`(플랜 캐시 수명과 동일 → **evict되면 소멸**) + `dm_exec_sql_text`; `query_hash`; Query Store(영속) | `sys.dm_exec_requests` + `dm_exec_sessions`(`status`, `wait_type/time/resource`, `cpu_time`) | `blocking_session_id`(음수 코드 -2~-5 주의) + `sys.dm_tran_locks`, `sys.dm_os_wait_stats` 누적 | 권한 `VIEW SERVER STATE`(≤2019)/`VIEW SERVER PERFORMANCE STATE`(2022+) |
| **Oracle** | `V$SQLSTATS`(V$SQL보다 빠르고 보존 길다, SQL_ID당 1행) / `V$SQL`, `V$SQL_PLAN` | `V$SESSION`(event, wait_class, blocking_session, status), `V$SESSION_WAIT`, `V$SYSMETRIC` | `V$LOCK`, `DBA_BLOCKERS` | 🔴 **라이선스**: Oracle Licensing Information(19c) — "`V$ACTIVE_SESSION_HISTORY` 및 `X$ASH`는 Diagnostics Pack", "`DBA_HIST_` 접두 뷰 전부 pack 포함(예외 6종)", `DBMS_WORKLOAD_REPOSITORY` 포함. **SE2 = 불가, EE = extra cost**. V$SESSION·V$SQLSTATS·V$SYSMETRIC은 pack 목록에 없음 → 무료 폴링 가능. `CONTROL_MANAGEMENT_PACK_ACCESS=NONE`로 차단 가능 |

출처: https://www.postgresql.org/docs/17/pgstatstatements.html , https://www.postgresql.org/docs/17/monitoring-stats.html , https://www.postgresql.org/docs/17/view-pg-locks.html , https://dev.mysql.com/doc/refman/8.4/en/performance-schema-statement-summary-tables.html , https://learn.microsoft.com/en-us/sql/relational-databases/system-dynamic-management-views/sys-dm-exec-query-stats-transact-sql , https://docs.oracle.com/en/database/oracle/oracle-database/19/refrn/V-SQLSTATS.html , https://docs.oracle.com/en/database/oracle/oracle-database/19/dblic/Licensing-Information.html

**오버헤드·안전 메모**
- 1~5s 간격의 `pg_stat_activity`/`V$SESSION`/`dm_exec_requests` 샘플링은 메모리 뷰 읽기라 저비용(ASH 모사 가능). `pg_locks`·`dm_tran_locks`는 간격을 늘릴 것.
- 누적 뷰(pg_stat_statements, digest, dm_exec_query_stats, V$SQLSTATS)는 **델타 계산 + 리셋/evict 감지**(카운터 감소 시 재기준) 필수.
- 쿼리 텍스트는 리터럴 마스킹(`?`/`$1`) 후 저장, `db.query.summary`로 카디널리티 제어. OTel receiver는 자체 obfuscation 수행. 텍스트 길이 상한(PG 1024B, MySQL 1024B, Oracle SQL_TEXT 1000자) 때문에 EXPLAIN 불가 케이스 존재.

## D. Percona PMM 3 참조 아키텍처
- **Server**: Grafana, `pmm-managed`, QAN API, **VictoriaMetrics**(메트릭), **ClickHouse**(QAN), PostgreSQL(상태). **Client**: `pmm-agent` + exporter들 + `vmagent`.
- **QAN agent**: MySQL=Performance Schema 또는 slow log; PostgreSQL=`pg_stat_statements` 또는 `pg_stat_monitor`; MongoDB=profiler.
- **QAN 화면**: Overview 행 = fingerprint(dimension: Query/Service/Database/Schema/User Name/Client Host), 스파크라인 + 총량 비율 미터. Filters: Environment, Cluster, Database, Schema, Node, Client Host, User Name, Command Type, 쿼리 코멘트 커스텀 필터. Details: 시간 분포 바(query_time, lock_time, blk_read_time, innodb_rec_lock_wait…), Examples(1024자 초과 시 Explain 불가), Explain, Tables, Plan.
- https://docs.percona.com/percona-monitoring-and-management/3/reference/index.html

## E. Prometheus exporter 비교
- `postgres_exporter`: `pg_monitor`; **`stat_statements` 컬렉터는 기본 OFF**(텍스트 120자, 100 statement 상한). `queries.yaml` 확장은 deprecated → sql_exporter 안내.
- `mysqld_exporter`: `perf_schema.eventsstatements`(digest 250개·텍스트 120자·24h).
- `sql_exporter`(burningalchemist): YAML로 쿼리→metric, 다중 DSN.
- Zabbix 관점: HTTP agent + Prometheus 전처리로 스크레이프 가능하나 라벨 카디널리티(쿼리 digest)가 Zabbix 아이템 폭증으로 직결 → 집계치 보조용으로만 적합.

## F. 시사점 — Top SQL·세션을 현실적으로 얻는 경로

전제: Zabbix 경로(템플릿·플러그인·ODBC)는 시계열 숫자 모델이라 **행 단위 표(세션·Top N)** 를 담기에 부적합.

| 경로 | 장점 | 단점 | 적합도(조사 에이전트 의견) |
|---|---|---|---|
| **① OTel receiver events → 기존 OTLP http/json 파이프라인 → Spring BE** | 운영 중인 collector에 설정만 추가; 5종 공통 스키마(`db.server.top_query/query_sample/query_plan`); 원격 접속이라 DB 호스트 무설치; 난독화·플랜 캐시·trace 연동 내장; Oracle ASH 미사용 | logs 시그널 **development** 단계(v0.128 키 개명, v0.129 server.address 제거) → 파서에 버전 핀 필요; Oracle receiver metrics alpha; 샘플 간격·행 수가 receiver 옵션에 묶임; 고객이 Collector 미배포 시 추가 설치 | **1순위** |
| **② Spring BE 자체 JDBC poller** | 샘플 간격·SQL·마스킹·델타 완전 통제(1s ASH-like, blocking chain, 리셋 감지); 라이선스 회피 SQL 직접 선택; collector 없는 고객에도 동작 | JDBC 드라이버 5종 번들(Oracle ojdbc 라이선스 조건), 자격증명 암호화, 풀·타임아웃·장애 격리, 스케일아웃, 난독화 자체 구현, BE가 DB 네트워크에 직접 도달해야 함 | **2순위/보완** |
| **③ agent 2 `*.custom.query` → Zabbix JSON 아이템** | 추가 데몬 없음, 6.0도 지원 | **문자열(JSON) 아이템** → 히스토리 폭증·검색 불가, `.sql` 파일을 호스트마다 배포, Oracle은 Instant Client 전제; BE가 다시 파싱 | **비권장** |

권고 조합(조사 에이전트): ① 인스턴스 집계치는 Zabbix 공식 템플릿(단 **Oracle 템플릿은 ASH 접근 → SE2·팩 미보유 고객 금지** 또는 파생 템플릿) ② Top SQL·세션·블로킹·플랜은 OTel receiver events 1차 ③ JDBC 폴러는 폴백 + 1s 세션 샘플링 한정 ④ 엔진별 최소 권한 가이드.

**미확인/주의**: OTel 각 feature의 정확한 첫 릴리스 번호는 CHANGELOG 전문 미열람. Zabbix 7.0 MSSQL 템플릿 "7.0 신규" 통념은 **오류**(6.0 LTS에도 존재).

---

# Part C. 한국 엔터프라이즈 DB 성능 모니터링 시장

> 조사일 2026-10-19. 공개 웹 자료(벤더 문서·브로슈어·기사) 기준. **공개 RFP 원문은 확보하지 못했고**, MaxGauge의 국산 DB(Altibase·CUBRID·Goldilocks) 지원 여부도 공개 자료로는 확인되지 않았다 — 해당 항목은 "미확인"으로 명시.

## 1. 엑셈 MaxGauge

국내 DBPM 대표 제품. 엑셈 제품군은 exemONE(통합)·MaxGauge(DB)·InterMax(APM)·XAIOps(AIOps) ([ex-em.com](https://www.ex-em.com/)). 금융권 레퍼런스로 국민·우리·하나은행, 카카오뱅크 ([inews24](https://www.inews24.com/view/1003762)).

### 1.1 지원 DBMS (공개 자료로 확인된 범위)

| DBMS | 확인 근거 | 비고 |
|---|---|---|
| Oracle | MaxGauge for Oracle 5.2 출시 기사(2015) — 피크타임 자동 분석·비교, **실행 계획 변경 이력 추적** ([inews24](https://www.inews24.com/view/889727)) | 주력. RAC 지원 |
| MySQL / MariaDB / Aurora | G2 등재 "MFM: MaxGauge for MySQL/MariaDB/Aurora" | 클라우드 포함 |
| PostgreSQL | MaxGauge for CloudDB(PostgreSQL) 2022-02 — Top-N, Vacuum, HA 성능, Object Map, 과거 시점 그룹핑 ([ZDNet](https://zdnet.co.kr/view/?no=20220211105920)) | |
| SQL Server | 일본 법인 제품 라인업 ([itreview.jp](https://www.itreview.jp/products/maxgauge/profile)) | |
| Tibero | **MaxGauge for Tibero 브로슈어** 존재 ([엑셈 PDF](https://s3-ap-northeast-1.amazonaws.com/exemdocuments/maxgauge/bro-MaxGauge_tibero_brochure.pdf)) | 오래된 문서라 현행 범위 재확인 필요 |
| Altibase / CUBRID / Goldilocks / DB2 | **미확인** | 영업 문의 필요 |

### 1.2 시그니처 기능
- **Real-Time Monitor**: 주요 성능 지표·Wait Event·Active Session 실시간, 인스턴스별 Wait Class 추이, Session Elapsed Time 분포
- **System 감시**: 멀티 인스턴스 통합 — 성능정보·Active Session·**Lock Tree**·Error Log·Alarm
- **Session 분석 → SQL 분석(실행계획)**: "Top-Down Approach"(넓은 문제 영역 → 세션 → SQL)
- **Performance Analyzer(로그분석기)**: "수집된 로그 데이터를 시계열로 재현" — **과거 시점 재생**
- **Performance Trend**: 일간/구간 성능 추이, Top Sessions/Session List/Details, Top SQL(CPU Time·Elapsed Time)
- 1분 단위 성능 로깅, SQL 편집/디버깅, 플랜 조회, 오브젝트 조회
- Oracle 버전은 **SGA Memory Direct Access**로 초 단위 세션·SQL·대기이벤트 수집, "DB가 Hang 상태여도 수집 가능"(재판매사 자료, 직접 확인 불가). Tibero 버전은 "API 방식 수집". 요컨대 **MaxGauge는 DB 서버 설치형(에이전트)**.

## 2. WhaTap DB 모니터링

SaaS 기본 + 설치형. 2025 Gartner "Market Guide for Infrastructure Monitoring Tools" 대표 벤더 국내 유일 등재.

### 2.1 아키텍처 — "에이전트는 있지만 DB 서버에는 안 깔아도 된다"
- 수집기는 **DBX 에이전트(Java, JDBC Query 기반)**. "별도 서버에 설치하거나 DB 서버에 설치할 수 있습니다" ([docs](https://docs.whatap.io/oracle/install-agent)). MSSQL 브로슈어는 **"Agentless"** 섹션 — "DB서버에 설치 없이 즉시 적용".
- OS 프로세스 지표가 필요하면 **XOS 부가 에이전트**를 DB 서버에 선택 설치.
- **Oracle Pro**만 예외 — DB 서버에 직접 설치, 수집 주기 **0.05초**(일반 5초) ([docs](https://docs.whatap.io/oracle-pro/monitoring-support)). 즉 "에이전트리스 기본 + 고정밀은 설치형" 2-tier.
- 네트워크: 에이전트→수집서버 TCP 6600 아웃바운드, Proxy 모듈. 전송 암호화.
- **최소 권한**: Oracle `create session` + `select any dictionary`(또는 `v_$sqlarea` 등 개별 grant), kill은 `alter system` 옵션; PostgreSQL `pg_monitor`(+`pg_signal_backend` 옵션) ([docs](https://docs.whatap.io/postgresql/install-agent)); MSSQL `view server state`·`view any definition`·`connect any database`, 플랜은 `showplan`, kill은 `alter any connection` ([docs](https://docs.whatap.io/mssql/install-agent)).

### 2.2 지원 DB·가격 (공식 요금 페이지, 월·VAT 별도)

| 티어 | 요금 | 과금 단위 | DB |
|---|---|---|---|
| 오픈소스 DB | **80,000원** | 서버/VM | MySQL(MariaDB), PostgreSQL(EDB), **CUBRID, Altibase**, Redis, MongoDB |
| 상용 DB | **25,000원** | vCPU/Core | Oracle, MS-SQL, **Tibero**, SingleStore, IBM DB2, SAP ASE |
| Oracle Pro | **50,000원** | vCPU/Core | Oracle(0.05초 수집) |

데이터 보관 1년, 트라이얼 15일. 설치형은 별도 견적 ([whatap.io/pricing](https://www.whatap.io/pricing/)). 국산 DB(Tibero·CUBRID·Altibase)를 **이미 상품 목록에 올려둔 점**이 중요.

### 2.3 기능 매트릭스 (Oracle 브로슈어 2024-04)
Instance List/Monitoring O, Multi-tenant O, **Slow Query X**, Trends·Trends Compare O, **Lock Tree O**, Parallel Query Tree O, **Dead Lock X**, DB Parameter(변경 이력·비교) O, SQL Stat O, Tablespace/SGA O, Daily/Weekly/Monthly Report O, Event O. 분석 메뉴: Trend Comparison, Lock tree, Session History, Wait analysis, **SQL Plan analysis(Plan Change History — 변경 전후 플랜 비교)**, Top SQL Comparison, Database Parameter ([docs](https://docs.whatap.io/en/oracle/analysis-sql)). PostgreSQL은 **과거 시점 모드(최근 3주)**, Active sessions, Lock tree, Slow Query, Top SQL, Topology ([docs](https://docs.whatap.io/en/postgresql/instance-monitoring)).

## 3. 기타 벤더

| 제품 | 실체 | 핵심 사실 |
|---|---|---|
| **티맥스 SysMasterDB 8** | **Tibero 전용**(+PostgreSQL 1.0 별도) | 에이전트 방식, 초단위 수집. 메뉴: Realtime(Session/Instance, **Lock Monitoring**), Analysis(Performance Trend, **Top N**, Heatmap, **History Analysis — All Session Flow·Search SQL Text**), **TPR/ASH Report**, **Changed Plan Analysis**, AI Chatbot. Kill Session은 별도 권한자만 ([docs.tibero.com](https://docs.tibero.com/sysmasterdb/sitemap.md)). PG판은 `pg_stat_statements`·`pg_buffercache` 요구 |
| **엑셈 InterMax** | APM(WAS). DB 전용 아님 | WAS→SQL 연계. MaxGauge와 묶어 "WAS-DB 연계"가 엑셈 세일즈 포인트 |
| **제니퍼소프트** | APM만 | 2016 인터뷰: DB 모니터링은 "SI를 동반해 자사 역량 아니라고 판단" |
| **오픈마루 APM** | APM/K8s | DB 전용 기능 **미확인** |
| DB Artifex(1인 개발) | Oracle 전용 | "DB에 아무것도 설치하지 않는 읽기 전용 접근, SYS 없이 일반 계정" — **에이전트리스·최소권한이 셀링 포인트**라는 시장 신호 |

## 4. 한국 엔터프라이즈가 실제로 쓰는 DB 엔진

### 4.1 공공 — 행안부 「범정부EA 기반 공공부문 정보자원 현황 통계」

| 벤더 | 2023 | 2024 |
|---|---|---|
| Oracle | 63.52% | **62.51%** (2016년 74%) |
| Microsoft(MSSQL) | 16.03% | 14.36% |
| **CUBRID** | 9.13% | **10.58%** |
| **TmaxData(Tibero)** | 8.23% | 9.07% |
| MariaDB | 3.09% | 3.48% |

출처: [byline 2025-09](https://byline.network/2025/09/9086/), [byline 2024-08](https://byline.network/2024/08/0813-2/). PostgreSQL은 상위 5위 밖이나 공공 클라우드 전환 RFP가 "PostgreSQL 기반"을 명시하는 사례 증가.

### 4.2 금융 — 계정계는 여전히 Oracle, 채널·정보계부터 이탈
- 6대 시중은행 모두 ULA 종료 후 개별 라이선스 전환 ([아주경제 2020](https://www.ajunews.com/view/20200128162641502)).
- **KB국민은행 CoreNext 2단계 계정계에 EDB PostgreSQL 채택 — 국내 은행 계정계 첫 사례**; 카카오뱅크 EPAS 전환; EDB 2026-01 "계정계 전환 검토 문의 급증", 단 "DBA 80% 이상이 상용 DB 기술에 머물러".
- **Tibero**: 금융권 80여 레퍼런스(KB국민·우리·신한·농협·하나·신협…), 기업은행 채널계.
- **인메모리(Altibase·Goldilocks)**: 통신·증권 특수 영역, 점유율 수치 없음.

### 4.3 시사점
타깃(캐피탈·보험·제조)의 현실적 우선순위는 **Oracle > MSSQL ≈ MySQL/MariaDB > PostgreSQL(상승) > Tibero(공공·금융 제안 시 체크박스) > CUBRID(공공 한정) > Altibase/Goldilocks(증권·통신 특수)**. Oracle 없이 "DB 모니터링"을 팔 수는 없고, Tibero는 Oracle 호환 뷰(V$ 계열)가 많아 Oracle 커넥터 재사용 여지가 크다(검증 필요).

## 5. 한국형 RFP "DBMS 모니터링" 체크리스트 (추정 재구성)

공개 RFP 원문은 확보되지 않았다. 통합관제 제안자료의 DBMS 요구 항목 + 벤더 기능표 공통 항목 + 금융·공공 보안 규정 기사를 조합한 재구성.

| 구분 | 항목 |
|---|---|
| 실시간 | 인스턴스 가동/접속 상태, 세션(Active/Total), **세션별 Lock 상세·Lock Tree**, **Top SQL 성능 및 SQL 구문**, 쿼리 응답시간, Cache Hit, Wait Event |
| 장애 | DB 접속실패, 서비스 다운, **테이블스페이스 사용율**, Error/Alert Log |
| 사후 분석 | **과거 시점 조회/재생**, 기간 비교, 세션 히스토리, SQL 통계, **실행계획 변경 이력** |
| 알람 | 지표별 임계값, 복합 조건, 채널(메일/SMS/메신저), 이벤트 이력 |
| 리포트 | 일/주/월 정기 리포트, 성능 저하 구간 자동 탐지 리포트 |
| 운영 | 다중 인스턴스 통합 뷰, 이기종 DB 단일 대시보드, 역할 기반 권한(Kill Session 분리) |
| 설치/보안 | 에이전트 설치 여부 명시, **수집 계정 최소 권한 목록 제출**, 전송 암호화, 아웃바운드 단방향·포트 명시, 설치형 운영, 재기동 불필요 |
| 인증 | GS인증(공공), CC — DB 모니터링 제품에 CC가 요구되는지는 미확인 |

## 6. 에이전트 설치형 vs 에이전트리스(원격 JDBC)

| 벤더 | 방식 | 수집 정밀도 |
|---|---|---|
| MaxGauge(Oracle) | DB 서버 설치, SGA Direct Access | 초 단위, DB Hang 시에도 수집 |
| MaxGauge(Tibero) | DB 서버 설치, API 방식 | 실시간 + 1분 로깅 |
| SysMasterDB | 에이전트 | 초 단위 |
| WhaTap(일반) | **원격 JDBC(DBX, 별도 서버 가능)** + 선택 XOS | 5초 |
| WhaTap Oracle Pro | DB 서버 설치 | 0.05초 |
| DB Artifex | 원격 읽기 전용 | 초 단위(주장) |

**시장이 수렴하는 방향**: 신규 진입자(WhaTap)는 에이전트리스를 기본으로 두고 고정밀만 설치형 옵션으로 분리. 전통 강자(MaxGauge·SysMasterDB)는 설치형이지만 "부하 거의 없음"을 반복 강조 — 즉 **고객의 1차 질문이 "DB 서버에 뭘 깔아야 하나, 부하는 얼마인가"**.

**금융권 보안팀 관점의 페인포인트**(업계 통념 기반 추론으로 표기):
- DB 서버(특히 계정계) 에이전트 설치는 변경관리·보안성 검토 대상 → 승인 리드타임 김 → 와탭이 "별도 서버 설치", "재기동 불필요"를 명문화한 이유.
- 수집 계정 권한 심사: `select any dictionary`류 포괄 권한은 거부되기 쉬움 → **개별 `v_$` 뷰 grant 대안** 병기 필요.
- 망분리: 2026-04 전자금융감독규정 시행세칙 개정으로 내부망 SaaS 일부 허용됐지만 대상은 보안 업무 6종 한정 — DB 성능 모니터링 SaaS는 해당 없음. **설치형 전제**, 수집기→서버 통신은 단방향·포트 고정·암호화.
- DBA의 반대 논리는 "성능 영향·장애 시 책임 소재".

## 7. 한국 시장에서 "있어야 한다"고 평가받을 기능 체크리스트

### 필수 (없으면 비교표에서 탈락)
1. **Oracle·MSSQL·MySQL/MariaDB·PostgreSQL** 4종 커넥터.
2. **에이전트리스(원격 JDBC) 기본** — DB 서버 설치 0. "별도 서버/DB 서버 모두 가능" 명시.
3. **수집 계정 최소 권한 스크립트** DB별 제공, 기능별 선택 권한(Kill/Plan) 분리.
4. **실시간 Active Session 목록**(SQL 텍스트·대기 이벤트·경과시간) + 세션 상세.
5. **Lock Tree**(holder/waiter 트리).
6. **Top SQL**(Elapsed/CPU/실행횟수/논리읽기 기준, 기간 선택) + SQL 전문·실행계획.
7. **Wait Event/Wait Class 추이**.
8. **과거 시점 모드**(타임 슬라이더로 과거 세션·Top SQL·지표 재생, 최소 수 주 보존).
9. **지표별 임계값 알람** + 테이블스페이스 사용율·접속실패·서비스 다운 기본 룰.
10. **다중 인스턴스 통합 뷰**(이기종 DB 한 화면) — 기존 호스트 인벤토리와 연결.
11. **전송 암호화·아웃바운드 단방향·포트 고정**, 망분리 운영 가이드.
12. **일/주/월 리포트**.

### 권장 (제안 가점)
- **실행계획 변경 감지(Plan Change History)** + 변경 전후 비교.
- **Tibero 커넥터** — 공공 9%·금융 80여 사. 와탭은 이미 상품화.
- **CUBRID 커넥터** — 공공 제안 체크박스.
- DB 파라미터 변경 이력·비교. Slow Query 로그 연동(MySQL/PG), Dead Lock 감지(경쟁사도 X가 많아 차별 가능). 세션 Kill(권한 분리·감사). 트렌드 기간 비교.

### 차별
- **인프라↔DB 상관 뷰**: 호스트 지표와 DB 대기 이벤트를 같은 타임라인에 — DB 전용 툴은 OS 지표를 위해 부가 에이전트를 요구하지만 우리는 이미 호스트 에이전트(Zabbix)가 있다.
- **APM 트랜잭션 → SQL → DB 세션 연계** — 엑셈이 InterMax+MaxGauge 조합으로 파는 "WAS-DB 연계"를 단일 제품에서.
- **라이선스 단순화**: 와탭은 상용 코어당 2.5만원(월). 코어 수 많은 금융 Oracle 서버에서 "인스턴스/에디션 정액"이 가격 우위 메시지.
- **보안 심사 패키지**: 권한 목록·포트·암호화·비수집 범위(업무 데이터 원문 미수집, 바인드 값 마스킹)를 한 문서로.
- Altibase/Goldilocks는 초기 범위 제외, 플러그인 구조만 확보.

### 조사 한계
- 공개 RFP 원문 미확보 → §5는 재구성. MaxGauge 현행 지원 목록·가격 비공개. 금융권 점유율은 정성 판단. §6 페인포인트는 벤더 문서 구조에서 역추론.
