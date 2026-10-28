# MovesEye DB 모니터링 독립 설계 제안

**설계 기준: 2026-10-19.** 저장소와 공식 문서를 읽어 작성한 제안이며, 코드 변경·제품 실행·수집 부하 실측은 하지 않았다. 아래에서 **확인 사실**, **설계 권고**, **실측이 필요한 가정**을 구분한다. Claude의 이번 과제 설계안은 참조하지 않았다.

**권고는 자체 JDBC 폴러를 심층 분석의 기본 경로로 채택하고, Zabbix와 OTel을 선택 가능한 보조 경로로 수용하는 것이다.** PREMIUM의 최소 가치는 인스턴스 카운터를 넘어서, 장애 시점의 활성 세션·대기·SQL·블로킹 관계를 다시 조사할 수 있는 데 두어야 한다.

Zabbix만 연결한 고객에게도 개요 화면은 제공한다. 다만 그 상태를 세션 분석까지 지원하는 것으로 표시하지 않는다. 엔진 이름만으로 지원 여부를 판단하지 않고, **엔진·버전·권한·설정·수집 경로별 실제 기능**을 표시한다.

## 1. 제품 범위와 수집 경로 전수

### 1.1 저장소에서 확인한 출발점

| 확인 사실 | 설계에 미치는 영향 |
|---|---|
| `Feature.DB_MONITORING`과 `/database-monitoring` 스텁이 존재한다 | 라이선스 체계는 재사용하되 수집·조회·관리 API와 백그라운드 작업에도 게이트가 필요하다 |
| APM 설계 §2.4는 앱의 DB 호출과 DB 내부 관측을 구분한다 | 기존 APM “DB 호출 분석”을 복제하지 않고 DB 인스턴스 분석으로 연결한다 |
| APM 메트릭은 허용목록과 서비스 중심 모델을 사용한다 | `postgresql.*`, 세션 ID, SQL ID를 기존 저장소에 그대로 넣는 방식은 맞지 않는다 |
| APM `/v1/logs`는 일반 로그를 수용한 뒤 폐기한다 | DB 수신기가 출력하는 OTLP log 이벤트를 저장하려면 신규 처리 계층이 필요하다 |
| APM의 목표 규모·다중 BE 검증에는 남은 경계가 있다 | DB 부하를 추가하면서 기존 APM 성능까지 함께 검증해야 한다 |

근거: [APM 설계서](/C:/solutions/_workspace/features/apm/core/devdesign_apm.md), [메트릭 허용목록](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/normalize/ApmMetricAllowlist.java), [로그 수신 처리](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/receive/ApmOtlpLogSignalHandler.java:67), [규모 대응 현황](/C:/solutions/moveseye-docs/overview/apm-scale-readiness.md:29).

경쟁 제품에서 채택할 핵심은 화면 개수가 아니라 조사 흐름이다.

| 참고 제품 | 확인한 방향 | MovesEye에 반영할 요소 |
|---|---|---|
| Datadog DBM | 쿼리 통계를 별도 분석 대상으로 제공 | 누적 SQL 통계와 실행 중 세션 샘플을 분리 |
| SolarWinds DPA | 원격 수집과 대기 시간 중심 분석 | DB 서버에 설치하지 않는 기본 경로 |
| MaxGauge | 세션·대기·SQL을 연결하는 사후 분석 | 장애 시점 재생과 SQL 성능 변화 비교 |
| 와탭 DB | 인스턴스 차트에서 활성 세션·락 트리·SQL 상세로 이동 | 시간 선택을 공유하는 조사 화면 |

공식 자료: [Datadog Query Metrics](https://docs.datadoghq.com/database_monitoring/query_metrics/), [SolarWinds DPA](https://www.solarwinds.com/database-performance-analyzer), [엑셈 DB 모니터링](https://ex-em.com/ko/service/database), [와탭 인스턴스 모니터링](https://docs.whatap.io/en/mysql/instance-monitoring). 경쟁사의 성능·오버헤드 홍보 수치는 우리 제품의 보증치로 전용하지 않는다.

### 1.2 데이터 등급

데이터는 단순한 상하 등급보다 다음 다섯 가지 독립 능력으로 표현한다.

| 기호 | 데이터 | 제공하는 답 |
|---|---|---|
| C | 인스턴스 카운터 | 연결 수·처리량·캐시·스토리지·복제 상태가 나쁜가 |
| S | 세션 스냅샷 | 그 시각에 누가 무엇을 실행하거나 기다렸는가 |
| Q | SQL 누적 통계 | 어느 SQL이 실행 시간·CPU·읽기를 많이 사용했는가 |
| P | 실행계획 | 어떤 접근 경로를 사용했거나 사용할 것으로 예상되는가 |
| L | 블로킹 관계 | 누가 누구를 막았으며 영향 범위가 얼마인가 |

Q가 있어도 개별 실행의 지연 분포가 생기지는 않는다. S가 있어도 1초보다 짧은 모든 실행을 기록하지는 못한다. P도 캐시 계획·예상 계획·실행 통계 포함 계획을 구분해야 한다.

### 1.3 경로별 운영 조건

| 경로 | 수집 주체와 저장소 | 필요 권한 | 설치 부담 | Zabbix 버전 의존 |
|---|---|---|---|---|
| **Z1. 공식 agent2 템플릿** | DB에 접속하는 agent2 → Zabbix history/trends → MovesEye 조회 | 템플릿별 모니터링 뷰 접근 | agent2·플러그인·템플릿 배포. 별도 수집 서버 배치도 가능 | 서버·agent2·플러그인·템플릿 조합별 검증 |
| **Z2. 공식 ODBC 템플릿** | Zabbix 서버/프록시가 SQL 실행 → Zabbix | 조회 계정과 대상 뷰 접근 | 서버/프록시에 ODBC 드라이버·DSN. DB 호스트 설치 불필요 | 서버/프록시와 템플릿 버전 의존 |
| **Z3. UserParameter·외부 스크립트** | Agent 또는 프록시의 CLI/스크립트 → Zabbix | DB 조회 및 스크립트 실행 권한 | SQL 파일·CLI·계정 파일 관리 | 자체 템플릿으로 폭넓게 대응 가능하나 검증 필요 |
| **O1. OTel 전용 DB receiver** | 고객 망의 Collector가 DB에 원격 접속 → OTLP → MovesEye PG | receiver별 뷰·확장 권한 | 기존 Collector 활용 가능. DB 접속 방화벽은 별도 | 수집은 무관. Zabbix 알림만 별도 의존 |
| **O2. OTel `sqlquery` receiver** | Collector의 지정 SQL → metrics/logs → MovesEye PG | 지정 SQL 실행에 필요한 권한 | SQL·설정 배포. 지원 드라이버로 제한 | 무관 |
| **J1. BE 내부 JDBC 폴러** | BE 전용 작업자가 DB에 원격 접속 → MovesEye PG | 엔진별 최소 조회 권한 | DB 서버 설치 없음. BE→DB 통신 승인 필요 | 수집은 무관 |
| **J2. 동일 JDBC 폴러의 원격 실행형** | DB 망의 MovesEye 수집 프로세스 → HTTPS → MovesEye PG | J1과 동일 | 수집 서버에 JRE·서비스 설치. 컨테이너 불필요 | 수집은 무관 |
| **Z4. agent2 커스텀 플러그인** | 자체 플러그인이 SQL 실행 → Zabbix, 또는 별도 전송 | 자체 SQL에 맞는 조회 권한 | 바이너리 서명·패키지·플러그인 호환성 관리 | agent2 SDK·통신 규약·템플릿 의존 |
| **E1. 고객 기존 도구 읽기** | DPA·MaxGauge·와탭·OEM 등의 지원 API/내보내기 → 조회 또는 PG 적재 | 도구 API와 데이터 사용 권한 | 신규 DB 접속을 피할 수 있으나 도구별 계약 필요 | 도구가 Zabbix일 때만 의존 |
| **E2. 기존 exporter·로그·관리 유틸리티** | Prometheus exporter, slow log, Query Store, DB 관리 명령 등 → 어댑터 → PG | 파일·API·DB 또는 OS 권한 | 기존 설치 활용 또는 파일 수집기 필요 | 원칙적으로 무관 |

GPU의 “Prometheus 배제” 결정은 DB에 자동 적용하지 않는다. 다만 이번 권고에도 **새 Prometheus 서버 설치는 포함하지 않는다.** 기존 exporter가 있을 때 Collector scrape로 카운터를 받는 정도가 후보이다.

### 1.4 데이터 커버리지와 한계

`조건부`는 SQL·설정·권한·어댑터 구현이 추가로 필요하다는 뜻이다.

| 경로 | C | S | Q | P | L | 판단 |
|---|---|---|---|---|---|---|
| Z1 공식 agent2 | 주력 | 일부 상태·건수 | 표준 심층 분석은 부족 | 부족 | 주로 건수 | 개요·기존 알림 재사용에 적합 |
| Z2 ODBC | 주력 | 조건부 | 조건부 | 조건부 | 조건부 | SQL 실행 능력은 있으나 공식 템플릿이 분석 제품을 완성하지는 않음 |
| Z3 UserParameter | 가능 | 조건부 | 조건부 | 조건부 | 조건부 | 제한적 보완에 적합. 고빈도 심층 수집의 기본값으로는 부적합 |
| O1 전용 receiver | 가능 | 엔진별 이벤트 | 엔진별 이벤트 | 일부 가능 | 일부 블로킹 정보 | 현행 버전 기능을 실제 검증하면 활용 가치가 큼 |
| O2 `sqlquery` | 가능 | 사용자 SQL | 사용자 SQL | 드라이버·SQL에 따름 | 사용자 SQL | 원격 수집 수단이지만 분석 의미는 우리가 구현 |
| J1/J2 JDBC | 가능 | 직접 구현 | 직접 구현 | 엔진별 제한 | 직접 구현 | 공통 계약과 안전장치를 통제하기 좋음 |
| Z4 커스텀 플러그인 | 가능 | 직접 구현 | 직접 구현 | 직접 구현 | 직접 구현 | 개발 책임은 JDBC와 비슷하고 배포 책임은 더 큼 |
| E1 기존 도구 | 도구별 | 도구별 | 도구별 | 도구별 | 도구별 | 공개·지원 인터페이스가 있는 경우만 |
| E2 exporter·로그 | 카운터 강점 | 대체로 부족 | 로그에 포착된 부분집합 | 일부 로그·캐시 | 로그/유틸리티별 | 완전한 실행 이력으로 표시하면 안 됨 |

**“OTel은 카운터만 수집한다”는 판단도 틀리다.** 확인한 0.159.0 문서에는 PostgreSQL·MySQL·SQL Server의 query sample/top query와 Oracle의 세션 대기 이벤트 출력이 있다. 다만 관련 logs 신호는 `development`, Oracle metrics는 `alpha`이다. 문서상 지원과 MovesEye의 지원 인증은 다르다. [PostgreSQL receiver](https://raw.githubusercontent.com/open-telemetry/opentelemetry-collector-contrib/v0.159.0/receiver/postgresqlreceiver/README.md), [MySQL receiver](https://raw.githubusercontent.com/open-telemetry/opentelemetry-collector-contrib/v0.159.0/receiver/mysqlreceiver/README.md), [SQL Server receiver](https://raw.githubusercontent.com/open-telemetry/opentelemetry-collector-contrib/v0.159.0/receiver/sqlserverreceiver/README.md), [Oracle receiver](https://raw.githubusercontent.com/open-telemetry/opentelemetry-collector-contrib/v0.159.0/receiver/oracledbreceiver/README.md).

Zabbix도 “6.0 지원” 한 줄로 끝내면 안 된다. MSSQL 공식 문서는 agent2 6.0.27과 플러그인 패치 수준에 따른 조건을 명시한다. 출시 시 지원표는 정확한 조합으로 고정한다. [Zabbix MSSQL 통합](https://www.zabbix.com/integrations/mssql).

## 2. 엔진별 데이터 소스 매트릭스

아래 오버헤드는 상대적 위험 평가다. 고객 워크로드에서 측정한 수치가 아니다. 공통 원칙은 **가벼운 세션 조회 1초, 인스턴스 카운터 10~30초, SQL 누적 통계 30~60초, 계획은 제한적으로 수집**하는 것이다.

| 엔진 | 가능한 데이터 소스 | 안 되거나 별도 조건인 것 | 권한·변경 | 오버헤드와 구현 주의 |
|---|---|---|---|---|
| **Oracle** | `V$SESSION`, `V$SQLSTATS`, 필요 시 `V$SQL`, `V$SYSTEM_EVENT`, `V$LOCK`, `V$SQL_PLAN`; RAC는 검증된 `GV$` 변형 | 자체 샘플링 전 과거는 복구 불가. ASH/AWR·SQL Monitor는 별도 라이선스 영역. 계획의 실제 행 수는 항상 존재하지 않음 | `CREATE SESSION`과 필요한 `V_$…` 객체별 SELECT. PDB·RAC 범위를 분리 | 세션을 먼저 조회하고 SQL/계획을 비동기로 보강. 대규모 `V$SQL` 전체 스캔을 1초마다 실행하지 않음 |
| **SQL Server** | `sys.dm_exec_requests`, `sessions`, `waiting_tasks`, `query_stats`, SQL text/plan DMF, 잠금 DMV; 선택적으로 Query Store | 캐시 퇴출·재시작으로 SQL 통계 소실. Query Store 미사용이면 장기 계획 이력 없음. 짧은 실행은 세션 샘플에서 누락 | 2019 이하 주요 DMV는 `VIEW SERVER STATE`, 2022 이상은 `VIEW SERVER PERFORMANCE STATE`; 세부 기능별 추가 권한 | 계획 XML 매초 수집 금지. 병렬 task와 request를 중복 집계하지 않음 |
| **MySQL** | `performance_schema` digest·threads·현재 statement, processlist, InnoDB transaction, `data_locks`, `data_lock_waits`, metadata locks | 계측·consumer 비활성 시 공백. digest 포화·초기화 시 통계 누락. digest 문자열만으로 실행계획 재생 불가 | 필요한 P_S 테이블 SELECT, 전 세션 조회에 맞는 권한, 복제 조회 권한을 별도 구성 | statement/wait 계측 확대는 메모리·CPU 비용 증가. 전체 잠금 목록보다 대기 관계 우선 |
| **MariaDB** | P_S digest·threads, processlist, 버전별 `INNODB_TRX`, `INNODB_LOCKS/LOCK_WAITS`, metadata lock 계측 | MySQL 8의 `data_locks` SQL을 그대로 적용 불가. P_S 비활성 고객이 존재 | 테이블별 SELECT·필요한 `PROCESS` 등. 계측 활성화와 재기동 여부 확인 | MySQL 호환을 이유로 같은 어댑터 분기를 생략하지 않음 |
| **PostgreSQL** | `pg_stat_activity`, `pg_locks`, `pg_blocking_pids()`, `pg_stat_statements`, 복제·WAL 통계 | `pg_stat_statements`만으로 계획·실행별 p95를 얻지 못함. 타 backend의 실제 계획을 일반 SQL로 가져오는 기능은 아님 | CONNECT, `pg_read_all_stats` 또는 검토된 wrapper. 확장 preload·설치에는 DBA 작업과 경우에 따라 재시작 | `track_io_timing`, planning 추적, `auto_explain`은 각각 추가 비용. 잠금 전체 조인과 통계 조회 주기를 제한 |
| **Tibero** | 버전별 `V$SESSION`, `V$SQLSTATS`, `V$SQL`, `V$SYSTEM_EVENT`, `V$WAITER_SESSION`, `V$LOCK`; TAC 범위 별도 | Oracle receiver·SQL의 무수정 호환은 보장 불가. 계획·대기 열의 의미를 버전별 확인해야 함 | 연결 및 해당 성능 뷰 접근. 최소 권한 스크립트는 검증 전 미확정 | Oracle 어댑터의 일부 구조는 공유 가능하지만 SQL과 상태 판정은 별도 |
| **CUBRID** | `SHOW TRANSACTION TABLES`, 버전별 SHOW 통계, broker 상태·slow SQL, `statdump`, `lockdb`, `plandump` | JDBC 하나로 모든 세션·락·전역 SQL 누적 통계를 얻는다고 보장할 수 없음 | SQL 조회 권한과 관리 명령용 OS/DB 권한을 분리. 최소 권한은 실측 필요 | 명령 출력 파싱·버전 변경 부담. 고빈도 명령 실행 대신 수집 프로세스 또는 지원 API 검토 |
| **Altibase** | `V$SESSION`, `V$STATEMENT`, `V$SYSSTAT`, 이벤트 통계, `V$LOCK`, `V$LOCK_WAIT`, SQL plan cache 뷰 | 단일 세션=단일 statement 가정 불가. statement·계획 캐시 이력을 영구 실행 통계로 취급 불가 | 필요한 성능 뷰 접근. 고객 버전에서 최소 권한 조합 확인 필요 | 메모리·디스크 영역과 GC·체크포인트를 구분. statement별 수집량 제한 |

주요 근거는 다음과 같다.

| 엔진 | 공식 근거와 적용 범위 |
|---|---|
| Oracle | [`V$SQLSTATS`](https://docs.oracle.com/en/database/oracle/oracle-database/19/refrn/V-SQLSTATS.html)는 SQL별 성능 통계의 근거이다. 뷰 존재가 모든 Oracle 기능의 사용 권리를 뜻하지는 않는다 |
| SQL Server | [`sys.dm_exec_query_stats`](https://learn.microsoft.com/en-us/sql/relational-databases/system-dynamic-management-views/sys-dm-exec-query-stats-transact-sql)는 완료 쿼리·캐시 수명·2022 권한 변경을 명시한다 |
| MySQL/MariaDB | [MySQL 잠금 테이블](https://dev.mysql.com/doc/refman/8.0/en/performance-schema-data-locks-table.html), [MariaDB P_S 설정](https://mariadb.com/docs/server/reference/system-tables/performance-schema/performance-schema-system-variables)을 따로 적용한다 |
| PostgreSQL | [`pg_stat_statements`](https://www.postgresql.org/docs/16/pgstatstatements.html), [통계 시스템](https://www.postgresql.org/docs/16/monitoring-stats.html)이 확장·권한·상태 의미의 기준이다 |
| 국내 엔진 | [Tibero Dynamic View](https://technet.tmax.co.kr/upload/download/online/tibero/pver-20240502-000002/reference/ch_dynamic_view.html), [CUBRID SHOW](https://www.cubrid.org/manual/en/11.2/sql/query/show.html), [Altibase Performance Views](https://manual.altibase.com/7.3/en/ref/general/3.-The-Data-Dictionary/Performance-Views/)에서 출발한다. 실제 고객 버전의 기능 동등성은 아직 모른다 |

### 2.1 Oracle 라이선스 경계

**SE2에서 불가능한 것은 Diagnostics/Tuning Pack 활용이지, 자체 세션 모니터링 전체가 아니다.** SE2는 해당 Pack의 제공 대상이 아니며, EE도 설치돼 있다는 이유만으로 사용권이 생기지 않는다. `CONTROL_MANAGEMENT_PACK_ACCESS` 값도 구매 증빙이 아니다. [Oracle 라이선스 문서](https://docs.oracle.com/en/database/oracle/oracle-database/19/dblic/Licensing-Information.html).

| 프로필 | 기본 정책 |
|---|---|
| `ORACLE_BASE` | 검토한 `V$SESSION`·SQL 통계·대기·잠금 조회 SQL만 허용 |
| `ORACLE_DIAGNOSTICS` | 고객의 계약·에디션 확인 후 별도 승인한 ASH/AWR 가져오기만 허용 |
| `ORACLE_TUNING` | 별도 확장 과제. 기본 제품에서 SQL Monitor·튜닝 API를 호출하지 않음 |

기본 패키지는 `V$ACTIVE_SESSION_HISTORY`, `X$ASH`, AWR 관련 API, `V$SQL_MONITOR` 등에 접근하지 않는다. `DBA_HIST_*`에는 공식 예외도 있으므로 “전부 유료 뷰”라고 설명하지 않되, 제품 기본 SQL은 보수적으로 사용하지 않는다. 조회 가능 여부를 시험하려고 제한 기능을 호출하는 방식도 금한다.

### 2.2 공통 통계 의미

SQL별 실행 횟수·시간·읽기는 대부분 누적값이다. 시작 시각, 재시작, reset, 캐시 퇴출을 고려해 차분을 계산한다. 음수가 나오면 0으로 덮지 않고 **새 통계 구간**으로 표시한다.

또한 엔진들의 CPU time, elapsed time, wait time은 동일 정의가 아니다. 공통 화면에는 비교 가능한 값만 올리고 원래 단위·출처를 보존한다. PostgreSQL의 `active`이면서 `wait_event`가 없는 상태를 실제 CPU 사용 시간으로 단정해서는 안 된다.

## 3. 권고 아키텍처

### 3.1 기본 구조와 선택 이유

```text
DB 인스턴스
 ├─ JDBC 폴러: BE 내부 또는 DB 망의 원격 실행형
 │    └─ 세션·SQL·대기·락·계획 → DB 전용 수집 계약
 ├─ 기존 Zabbix → 카운터 조회 어댑터
 └─ 선택한 OTel receiver → DB 전용 OTLP 어댑터
                         ↓
           정규화·마스킹·중복 방지·품질 판정
                         ↓
       MovesEye PostgreSQL의 DB 전용 테이블·롤업
                         ↓
            조회 API·화면·알람 이벤트
```

| 선택 | 찬성 근거 | 비용·반대 근거 | 결론 |
|---|---|---|---|
| JDBC 기본 | DB 서버 설치 불필요, 국내 엔진 드라이버 수용, SQL·권한·주기·마스킹 통제 | 드라이버·SQL·차분·실패 처리를 직접 유지 | 심층 분석 기본값 |
| OTel 기본 | 기존 운영 경험, 전송·큐·서비스 설치 재사용 | 엔진별 기능 차이, 발전 중인 이벤트 계약, 원문·계획 처리 검증 필요 | 검증된 프로필을 선택 지원 |
| Zabbix 기본 | 설치 기반과 기존 운영 체계 활용 | 고빈도 관계형 데이터·시점 재생에 추가 모델 필요 | 카운터와 인프라 연결 담당 |
| 커스텀 agent2 | 기존 Agent 승인 활용 가능 | 자체 개발에 플러그인 배포·호환성까지 추가 | 특별 고객 요구 때만 |
| 기존 상용 도구 기본 | 중복 수집 회피 | API·사용권·데이터 해상도를 통제하기 어려움 | 고객별 확장 |

JDBC 폴러는 요청 처리 스레드에서 실행하지 않는다. 전용 executor·연결 풀·작업 예산을 사용하고, 대상 DB 장애가 HTTP API나 MovesEye 저장소 연결 풀을 고갈시키지 않도록 분리한다.

기본 배치는 BE 내부다. BE에서 DB망으로 접속할 수 없는 고객에게는 **동일 코어의 원격 실행형**을 제공한다. 원격형은 systemd/Windows 서비스로 실행하며, 마스킹한 데이터만 HTTPS로 송신한다. 별도 저장 DB를 설치하지 않고 용량 제한 파일 큐를 사용한다.

### 3.2 APM 재사용 범위

| 구성요소 | 재사용할 부분 | 새로 필요한 부분 |
|---|---|---|
| Collector 관리 | 바이너리 안내·설정 다운로드·연결 진단·상태 표시 패턴 | DB 접속 검사·권한 보고서·DB별 수집 프로필 |
| OTLP | JSON 파싱·gzip·크기 제한·일시 실패 응답 원칙 | `/db-monitoring/otlp/v1/{metrics,logs}`와 DB 전용 이벤트 처리 |
| 저장·롤업 | 파티션 관리·배치 실행·dirty bucket 관리 경험 | DB 인스턴스·SQL·대기 중심 스키마와 집계 의미 |
| 실시간 표시 | 제한된 갱신·송신 큐·백프레셔 설계 | DB 시점 조회 API와 세션/블로킹 화면 |
| 라이선스 | 공통 entitlement 판정 | DB 수신·조회·폴러 실행에 `DB_MONITORING` 적용 |
| 알람 | 상태 전이·재시도·브리지 구현 경험 | DB 규칙·대상·중복 억제·배달 상태 |

APM 경로에 DB 데이터를 태우면 `Feature.APM`에 종속될 위험이 있다. **DB 모니터링 구매 고객이 APM을 구매하지 않아도 DB 수집은 동작해야 한다.** 앱→DB 상관 기능만 두 기능의 보유·접근권을 함께 검사한다.

### 3.3 1초 활성 세션 샘플링

샘플링은 **DB에 실제 접속하는 JDBC 작업자**에서 한다. 원격 실행형이면 DB망 안에서 수행한다. Collector를 선택한 고객은 해당 receiver가 같은 의미·주기·완전성을 제공한다고 검증된 경우에만 동등 프로필로 인정한다.

| 항목 | 정책 |
|---|---|
| 대상 | 실행 중·대기 중 세션, 장기 트랜잭션, 필요한 idle blocker |
| 세션 키 | 인스턴스·부팅 구간·세션 ID·로그인/생성 시각. 엔진별 serial/transaction/request 식별자 보강 |
| 1초 조회 | 상태·대기·SQL 식별자·블로커 등 가벼운 열 위주 |
| 보강 조회 | SQL 텍스트·객체명·계획은 캐시와 별도 예산 사용 |
| 지연 | 목표 간격을 넘긴 작업은 겹쳐 실행하지 않음. 밀린 tick을 몰아서 따라잡지 않음 |
| 상한 | 반환 행·실행 시간·동시 접속·송신 바이트 제한. 잘림을 품질 정보로 기록 |

**샘플링은 실행 이력이 아니다.** 1초 이하 쿼리는 놓칠 수 있다. 짧은 고빈도 SQL은 Q 통계로 보완하고, 개별 지연은 APM 또는 승인한 로그 수집으로 조사한다. 샘플에 나타나지 않았다는 이유로 실행되지 않았다고 판단하지 않는다.

AAS는 관측한 활성 세션 수를 시간 가중하여 계산한다. 실패한 30초를 정상 0으로 채우지 않고 관측률을 함께 표시한다. 긴 수집 공백을 마지막 상태로 연장하지 않는다. 샘플 기반 active seconds와 엔진 누적 elapsed time은 별도 지표로 유지한다.

### 3.4 SQL·바인드·계획 보호

| 데이터 | 기본 정책 |
|---|---|
| SQL 텍스트 | 방언을 이해하는 정규화기로 리터럴 제거. 주석은 제거하고 승인한 상관 필드만 추출 |
| 바인드 값 | 기본 수집 금지. 바인드 이름·형식 정도만 허용 |
| 파싱 실패 | 원문 저장 대신 SQL ID·해시와 실패 상태만 전송 |
| 실행계획 | predicate·XML·JSON 내부 상수도 마스킹 |
| 사용자·클라이언트 | 업무상 필요한 최소 정보만 유지. 사용자명은 선택적으로 가명화 |
| 원문 보존 | 별도 권한·감사·짧은 보존의 opt-in. 기존 마스킹 자료를 소급 복원하지 못함 |

마스킹은 **디스크 큐·네트워크 전송 전** 수행하고 BE에서도 재검사한다. 정규식 두 개로 Oracle q-quote, PostgreSQL dollar-quote, escape·주석·JSON·바이너리 리터럴까지 안전하게 처리한다고 주장하지 않는다.

기본 모니터링은 임의 SQL을 재실행하지 않는다. `EXPLAIN ANALYZE` 자동 실행도 금지한다. PostgreSQL 계획은 승인한 `auto_explain` 로그, 고객 제공 계획 또는 제한된 예상 계획 경로를 별도로 설계한다. OTel PostgreSQL receiver도 Top Query의 계획 획득을 위해 추가 explain 작업과 제한 설정을 갖고 있으므로, 기본 활성화 전에 확인해야 한다. [receiver 계획 수집 설정](https://raw.githubusercontent.com/open-telemetry/opentelemetry-collector-contrib/v0.159.0/receiver/postgresqlreceiver/README.md).

### 3.5 비밀번호와 수집 권한

JDBC 계정은 PG에 **복호화 가능한 인증 암호화**로 저장한다. 해시만으로는 DB에 접속할 수 없다. AES-GCM 같은 방식에 key ID를 붙이고, 마스터 키는 PG 밖의 보호 파일·OS 비밀 저장소·고객 기존 Vault 중에서 공급한다. Vault 설치는 강제하지 않는다.

키 백업·교체·복호화 실패 진단도 제품 범위다. PG 덤프와 암호화 키를 같은 백업 권한으로 무방비하게 묶으면 보호 효과가 작아진다.

Collector yaml에는 비밀번호 대신 `${env:…}` 등을 사용한다. 환경변수도 비밀 저장소 자체는 아니므로 서비스 계정·파일 ACL·덤프·진단 번들의 노출 경로를 통제한다. 원격 폴러는 로컬 secret reference를 지원해 BE가 비밀번호를 보유하지 않는 구성도 허용한다.

### 3.6 인스턴스 식별·상관·알람

**DB 인스턴스의 정본은 MovesEye UUID**다. IP·포트나 Zabbix hostid를 PK로 쓰지 않는다.

| 연결 대상 | 모델 |
|---|---|
| DB 클러스터·물리 노드·논리 DB/PDB | 계층과 멤버십을 분리. failover endpoint와 현재 물리 노드를 구분 |
| Zabbix 호스트 | `(datasource_id, hostid)` 외부 링크. OS 호스트·DB 논리 호스트 역할을 구분 |
| APM 서비스 | 서비스 UUID↔DB endpoint/namespace의 다대다 관계 |
| SQL | 엔진 native ID와 MovesEye fingerprint를 함께 저장. 생성 알고리즘 버전 포함 |

APM의 `server.address`, `server.port`, `db.namespace`와 구형 속성을 매핑한다. NAT·VIP·프록시·DNS alias에는 관리자 확인이 필요하다. IP 일치만으로 자동 확정하지 않는다.

SQL fingerprint가 같아도 특정 span과 특정 세션이 같은 실행이라는 증거는 아니다. 초기에는 **서비스·DB·시간대의 상관**을 제공한다. trace context 전파나 session tagging이 검증된 경우에만 실행 단위 연결을 표시한다.

알람은 DB 전용 이벤트를 PG에 먼저 기록하고 transactional outbox로 배달한다. Zabbix 7은 기존 `history.push` 브리지 경험을 활용하고, 6.0은 `zabbix_sender`/trapper 경로를 제공한다. 10051 통신 승인을 받을 수 없으면 배달 불가 상태를 분명히 표시한다. [`history.push` 도입](https://www.zabbix.com/documentation/7.0/en/manual/introduction/whatsnew700), [6.0 sender](https://www.zabbix.com/documentation/6.0/en/manpages/zabbix_sender).

기존 Vault에는 독자 알림 방향도 기록돼 있다. 따라서 신규 DB 도메인을 현재 APM 브리지 클래스에 직접 종속시키기보다 배달 어댑터를 둔다. [관련 결정 기록](/C:/Users/DMOVE/claude-experiences/projects/moveseye/2026-10-01-apm-domain-review-sweep.md:18).

## 4. 기능 범위 티어

티어는 PREMIUM 안의 구현 우선순위다. 별도 과금 등급을 새로 만들자는 제안은 아니다.

| 티어 | 기능 | 요구 데이터·경로 | 출시 판단 |
|---|---|---|---|
| **필수** | 인스턴스 목록·가용성·연결 수·처리량·용량·복제 상태 | C, Z1/Z2/O1/J | 엔진별 지원 항목 명시 |
| **필수** | 1초 활성 세션·장기 트랜잭션·대기 분포 | S, J 또는 검증한 O1/O2 | 카운터 프로필과 구별 |
| **필수** | 시점 선택·세션/SQL/대기 사후 조사 | S 저장·롤업 | 원시 보존 범위 명시 |
| **필수** | Top SQL: 실행 수·총/평균 시간·CPU·읽기 | Q, J/O/승인한 기존 도구 | 없는 지표는 미지원 |
| **필수** | 블로킹 트리·idle blocker·영향 세션 수 | S+L | 단순 잠금 건수로 대체 불가 |
| **필수** | 수집 지연·권한 부족·잘림·통계 reset 표시 | 모든 경로 | 값 0과 수집 실패 구분 |
| **필수** | 알람·복구·통지 실패·감사·마스킹 | 공통 기반 | Zabbix 6/7 경로 검증 |
| **권장** | 계획 표시·계획 변경과 성능 비교 | P+Q | 엔진별 계획 종류 구분 |
| **권장** | SQL·대기·부하의 기간 비교 | Q/S 롤업 | 동일 기준의 비교만 |
| **권장** | 복제·백업 지연·스토리지 증가 분석 | C+엔진별 보강 | 단순 임계치 이상 제공 |
| **권장** | deadlock 원인 자료 | 이벤트/로그/엔진 기능 | 1초 락 조회만으로 보장 불가 |
| **차별** | APM 느린 호출→DB 대기·락으로 연결 | APM+DB 링크 | 추정/확정 연결 구분 |
| **차별** | 보안팀 제출용 권한·통신·수집 SQL 보고서 | J/O 관리 기능 | 설치형 시장의 실제 도입 비용 감소 |
| **차별** | 장애 구간 증거 묶음 | SQL·세션·락·품질·관련 인프라 | 원문 없는 반출 지원 |

자동 세션 종료·자동 인덱스 생성·자동 SQL 변경은 초기 범위에서 제외한다. 조회용 계정의 승인 범위를 크게 바꾸고, 모니터링 제품의 운영 책임도 달라지기 때문이다.

## 5. 데이터 모델·보존·용량

### 5.1 테이블 골자

| 테이블군 | 핵심 필드·의미 | 기본 보존 |
|---|---|---|
| `db_instance`, `db_endpoint`, `db_external_link` | UUID·엔진·버전·클러스터·namespace·외부 연결 | 등록 수명 |
| `db_collection_profile`, `db_capability` | 수집 경로·주기·권한 결과·기능·SQL 패키지 버전 | 현재 및 변경 이력 |
| `db_credential` | 암호문/secret reference·key ID | 등록 수명 |
| `db_sample_batch` | 인스턴스·collector epoch·sequence·시각·성공/잘림·행 수 | 상세 7일, 품질 집계 180일 |
| `db_session_sample` | 세션 키·SQL 키·상태·대기·블로커·경과 시간 | 원시 24시간 |
| `db_query_dimension` | native ID·fingerprint·정규화 SQL·알고리즘 버전 | 마지막 관측 후 30일 |
| `db_query_stat_1m/5m/1h` | 실행·시간·CPU·읽기 차분·reset/coverage | 7/30/180일 |
| `db_wait_dimension`, `db_activity_1m/5m/1h` | native wait·공통 분류·sample seconds·관측률 | 7/30/180일 |
| `db_lock_edge`, `db_lock_incident` | waiter→blocker·객체·first/last seen·영향 범위 | edge 24시간, incident 30일 |
| `db_plan` | SQL·plan hash·종류·마스킹 계획·관측 시각 | 마지막 관측 후 30일 |
| `db_metric_1m/5m/1h` | instance counter·gauge·출처 | 7/30/180일 |
| `db_alert_rule/event/outbox` | 조건·状態 전이·根拠・배달 재시도 | 이벤트 180일 |

세션 행마다 SQL 텍스트·사용자명·대기명·계획 JSON을 반복 저장하지 않는다. 숫자 surrogate key와 차원 테이블을 사용한다. 위 보존 기간은 시작값이며 고객 디스크 예산으로 제한한다.

대량 시계열은 시간 파티션과 JDBC batch/COPY 계열 적재를 사용한다. JPA 엔티티 수천만 개를 생성해 저장하지 않는다. 정리 작업은 대량 DELETE보다 파티션 제거를 우선하며, 라이선스 만료 후에도 보존 정리는 계속한다.

### 5.2 50개 인스턴스·1초 샘플링 용량

연결 세션 수가 아니라 **실제로 보존하는 활성/관심 세션 수 A**가 변수다.

`하루 행 수 = 50 × A × 86,400`

| 가정 | 하루 세션 행 | 행당 200~350B일 때 |
|---|---:|---:|
| 평균 A=20 | 8,640만 | 17.3~30.2GB/일 |
| 평균 A=100 | 4억 3,200만 | 86.4~151.2GB/일 |
| 연결 세션 500개를 모두 저장 | 21억 6,000만 | 432~756GB/일 |

200~350B는 heap·최소 인덱스를 포함하려는 **미검증 가정**이다. WAL·복제·백업·여유 공간은 제외했다. 유휴 세션을 전부 매초 저장하는 설계는 채택하지 않는다.

SQL 통계도 작지 않다.

| 항목 | 가정 | 대략적인 저장량 |
|---|---|---|
| SQL 1분 통계 | 인스턴스당 분당 200행 | 하루 1,440만 행, 250~400B라면 7일 25~40GB |
| 세션 활동 1분 집계 | 인스턴스당 분당 100개 그룹 | 하루 720만 행 |
| SQL 장기 롤업 | 5분·1시간별 SQL 수가 유지된다는 가정 | 대략 수십 GB, 실제 cardinality에 좌우 |
| 계획·잠금·차원 | SQL 변화율·장애 빈도에 좌우 | 고정치 제시 불가, 별도 quota 필요 |

이 중간 가정에서 **DB 모니터링 보존 데이터만 100~200GB 수준의 예산**을 먼저 검토한다. 운영 디스크는 WAL·백업·재집계 여유를 포함해 더 커야 하며 기존 APM 저장량도 별도 합산한다. 이는 하드웨어 보증치가 아니다.

Top 200을 **누적 총시간으로 먼저 잘라서 차분**하면 새로 악화된 SQL을 놓칠 수 있다. 가능하면 더 넓은 통계 집합의 기준값을 유지하고 차분 후 순위를 정한다. 스캔 상한으로 잘랐다면 전체 Top SQL이라는 표현을 쓰지 않는다.

### 5.3 정확성과 품질

수집 batch에는 `collector_epoch`, sequence, 대상·관측 시각, 잘림 여부를 넣는다. 원격 재전송은 같은 batch ID를 유지하고 영수증과 적재를 원자적으로 처리한다. HA는 인스턴스별 수집 lease로 이중 폴링을 막는다.

분당 평균은 단순 평균의 평균으로 계산하지 않는다. SQL 평균 시간은 `총 시간 차분/실행 수 차분`, AAS는 유효 관측 시간을 반영한다. 원시 상세가 삭제돼도 집계는 남을 수 있지만, 오래된 집계 차트에서 개별 세션을 복원할 수 있다고 표시하지 않는다.

모든 조회·내보내기는 `complete/partial/unsupported`, 관측률, 마지막 성공 시각을 함께 제공해야 한다. watermark가 전진했다는 사실만으로 데이터가 완전하다고 판단하지 않는다.

## 6. 화면·메뉴와 Phase

### 6.1 메뉴 골자

| 메뉴 | 주요 내용 |
|---|---|
| **DB 개요** | 인스턴스·엔진·상태·부하·복제·수집 품질, 지원 프로필 |
| **실시간 관제** | 다중 인스턴스 부하와 선택 인스턴스의 활성 세션·대기 |
| **성능 분석** | 기간·시점 선택, 대기→SQL→세션 drill-down, 기간 비교 |
| **SQL 분석** | Top SQL, SQL 상세, 통계 추이, 계획과 변경 |
| **잠금·트랜잭션** | 현재/과거 블로킹 트리, 장기 트랜잭션, deadlock 자료 |
| **알람** | DB 이벤트·원인 지표·복구·통지 상태 |
| **관리** | 등록·계정·권한 검사·수집기·보존·마스킹·외부 링크 |

공통 시간 선택은 차트·세션·락 트리에 함께 적용한다. 실시간 갱신을 멈추면 조사 시각을 고정한다. 기본 FE 갱신은 3~5초로 시작하고, 수집 주기 1초와 화면 갱신 주기를 혼동하지 않는다.

등록 마법사는 엔진·경로 선택→연결→권한 검사→기능 미리보기→보존 예산→수집 시작 순서다. 단순 접속 성공을 “설정 완료”로 표시하지 않는다.

### 6.2 개발 단계와 사람-일

BE·FE·QA·DBA 협업을 포함한 합산 추정이다. 고객 승인 대기와 시험용 상용 DB 조달 기간은 제외한다.

| Phase | 산출물·종료 조건 | 사람-일 |
|---|---|---:|
| **P0. 실측·계약** | 수집 SQL·권한·마스킹·용량 실험, 지원 버전 후보, 이벤트 계약 | 15~25 |
| **P1. 공통 기반** | 등록·비밀정보·JDBC 실행기·원격형·수신·품질·PG 파티션·개요 | 45~65 |
| **P2. PostgreSQL·MySQL/MariaDB** | 세션·대기·SQL·락, 사후 조회, 권한/설정 저하 모드 | 60~85 |
| **P3. Oracle·SQL Server** | 라이선스 경계·계획·버전별 DMV, 주요 클러스터 구성 | 65~95 |
| **P4. 출시 검증** | 50개 인스턴스 복합 부하·APM 회귀·장애 복구·폐쇄망 설치·Zabbix 6/7 알림 | 30~45 |
| **기본 GA 합계** | 4대 계열의 인증된 프로필 | **215~315** |
| **P5. 국내 엔진 확장** | Tibero 우선, Altibase·CUBRID는 각각 독립 인증 | 60~100 |
| **P6. 심화** | 계획 변화·APM 상관 고도화·기존 도구·고급 분석 | 30~50 |

지원 범위 전체는 약 **305~465 사람-일**이다. BE 2명·FE 1명·QA 1명과 부분 참여 DBA를 가정해도 기본 GA는 대략 4~6개월 규모로 보는 것이 현실적이다. 실제 일정은 Oracle·SQL Server 검증 환경과 보안 승인에 좌우된다.

P2를 제한된 엔진 대상으로 먼저 제공할 수는 있다. 다만 “DB 모니터링 전체 지원 완료”라고 부르지 않는다. 기존 APM 작업과 인력을 공유한다면 두 과제의 일정 충돌을 반영해야 한다.

## 7. 착수 전 반드시 실측할 항목

다음 다섯 항목을 P0의 출시 판단 자료로 만든다.

| # | 실측 | 통과 기준의 형태 |
|---|---|---|
| **1** | 엔진별 최소 계정으로 C/S/Q/L 조회, 계획은 별도 검사 | 다른 사용자 세션까지 보이는지 확인. 부족한 권한·재시작·설정 변경을 정확히 보고 |
| **2** | 낮은 부하·높은 부하·세션 폭증에서 1초 수집 비교 | 목표 DB CPU·p95·잠금 영향과 수집 지연 측정. 1초 유지 실패 시 상한·주기 조정 기준 확정 |
| **3** | 0.159.0 receiver의 실제 출력·SQL·마스킹·잘림·계획 동작 | 문서가 아닌 fixture로 기능 인증. 원문이 큐·로그·전송에 남지 않는지 확인 |
| **4** | 50개 인스턴스 상당의 PG 적재·조회·롤업과 기존 APM 동시 부하 | 실제 bytes/row·WAL·IOPS·보존 정리·장애 복구 측정. 제품 성능 목표 확정 |
| **5** | 재시작·reset·failover·중복 전송·망단절·Zabbix 6/7 배달 | 잘못된 SQL 급증·가짜 정상·이중 알람 없이 품질 저하와 복구를 표시 |

일반적인 “수집 오버헤드 1% 미만” 같은 숫자를 먼저 약속하지 않는다. 1초 수집도 엔진별·버전별로 인증하며, 부하 때문에 주기를 늘렸다면 화면과 데이터에 그 사실을 남긴다.

## 8. Claude가 틀리기 쉬운 지점

다음은 상대 설계의 실제 오류를 주장하는 것이 아니라, 이번 과제에서 손쉽게 내리기 쉬운 결론의 취약점이다.

| 쉬운 결론 | 깨지는 이유 | 대조할 질문 |
|---|---|---|
| **“APM Collector에 receiver만 추가하면 된다”** | 일반 DB log 이벤트는 현행 APM에서 저장되지 않는다. 허용목록·서비스 귀속·라이선스도 다르다 | DB 전용 수신·이벤트 모델·저장·권한 비용이 들어 있는가 |
| **“OTel은 카운터뿐이니 전부 새로 만든다”** | 확인한 버전에도 query sample·Top Query 등이 있다 | 기존 기능을 fixture로 검증하고 부족분만 구현하는가 |
| **“Zabbix 공식 템플릿이면 유료 기능으로 충분하다”** | 상태·건수와 장애 시점의 세션/SQL/락 재구성은 다르다 | 실제로 어느 저장소에서 과거 관계를 복원하는가 |
| **“agent2가 있으니 설치 승인은 해결된다”** | 새 플러그인·계정·통신·SQL 접근은 별도 승인 대상이다 | DB 서버 설치 없는 원격 경로가 있는가 |
| **“Oracle ASH를 읽으면 쉽다”** | Diagnostics Pack과 SE2 제약이 있다 | 제한 기능을 호출하지 않는 기본 SQL 패키지가 있는가 |
| **“1초 샘플이면 SQL 실행을 전부 안다”** | 짧은 실행·수집 공백·행 상한·일시적 락을 놓친다 | SQL 누적 통계와 샘플의 의미를 분리했는가 |
| **“SQL ID나 fingerprint로 APM과 정확히 연결된다”** | 다른 실행·스키마·프록시가 섞일 수 있다 | 추정 상관과 전파된 실행 식별자를 구분하는가 |
| **“계획은 EXPLAIN으로 가져오면 된다”** | 원문·권한·리터럴·환경이 필요하고 실제 계획과 다를 수 있다 | 예상/캐시/실행 계획을 구분하고 재실행을 통제하는가 |
| **“PostgreSQL이면 롤업으로 해결된다”** | 매초 원시 데이터와 SQL cardinality는 먼저 적재 비용을 만든다 | 행 수·인덱스·WAL·보존·APM 동시 부하가 계산됐는가 |
| **“알람 브리지는 그대로 재사용한다”** | 6.0에는 `history.push`가 없고 배달 성공과 판정 성공도 다르다 | 버전별 배달·실패 표시·중복 억제가 설계됐는가 |
| **“국내 DB는 JDBC만 바꾸면 된다”** | 드라이버 접속과 진단 데이터의 의미 호환은 별개다 | 엔진별 SQL·권한·계측·계획·클러스터 검증 일정이 있는가 |

이 제안의 가장 큰 부담은 JDBC 기반 진단 어댑터를 직접 유지해야 한다는 점이다. P0에서 OTel이 특정 엔진의 필요한 안전성·완전성·운영성을 충족한다면 해당 프로필의 기본 경로를 바꾸는 것이 합리적이다. 다만 그 판단 기준은 재사용 코드의 양이 아니라 **고객이 장애 시점의 원인을 얼마나 정확히 조사할 수 있는가**여야 한다.