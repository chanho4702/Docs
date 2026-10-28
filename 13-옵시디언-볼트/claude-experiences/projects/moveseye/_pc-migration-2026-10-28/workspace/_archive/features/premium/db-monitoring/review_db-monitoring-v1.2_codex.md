**판정: 현재 v1.2를 그대로 v2 착수본으로 넘기기는 어렵습니다. 🔴 잔존 9건입니다.** 주요 방향은 반영됐지만, §15의 “전건 반영” 표시보다 본문 계약이 덜 완성되어 있습니다.

[설계서 v1.2](/C:/solutions/_workspace/features/premium/db-monitoring/devdesign_db-monitoring.md), [조사 기록](/C:/solutions/_workspace/features/premium/db-monitoring/research_datadog-dbm-2026-10-22.md), [1차 판정](/C:/solutions/_workspace/_archive/features/premium/db-monitoring/consult_datadog-gap_codex.md)을 대조했습니다. 아래에서는 이미 해결된 사항을 재지적하지 않고, 반영 여부와 잔존·신규 충돌만 다룹니다. 파일은 변경하지 않았습니다.

## A. 반영 정합 표

“부분”은 방향은 반영됐으나 관련 본문·모델·운영 계약까지 일치하지 않는 경우입니다. C1~C9는 뒤에서 설명하는 **중복을 제거한 🔴 결함 번호**입니다.

| G# | 판정 | 근거 및 필요한 수정 문장 |
|---|---|---|
| G6 | **부분** | §4 SQL Server 행·§5.8·§11 R9에 조건부 지원, 2022+ 권한, `event_file` 우선, 유실 표시가 반영됨. §6.1 UNIQUE 키에는 관측 노드·XE 세션 수명·해시 기준이 불명확함. **수정:** “중복 제거는 관측 노드와 소스 수명을 구분하고, 동일 이벤트의 정규화된 내용 해시를 사용한다.” 상세 B4. |
| G7 | **부분** | D11·D13·§4 P 열·§4.4·§8.1의 `/explain` 삭제는 일치. 그러나 **§5.5에 `EXPLAIN(예상)은 승인+예산`이 남음**. **수정:** “GA에서는 고객 SQL의 `EXPLAIN` 재계획을 수행하지 않는다. 후속 프로필은 Q26 확정 후 별도 설계한다.” **C1**. |
| G8 | **부분** | §5.4가 동일 관측·델타 집합 조건을 반영했지만, 불완전할 때 점유율을 **“≥”로 표시하는 것은 성립하지 않음**. **수정:** “전체 집합의 완전성이 확인되지 않으면 전체 대비 점유율은 산출하지 않고, 관측 집합 내 비율만 별도 명칭으로 표시한다.” **C3**. |
| G12 | **부분** | §4.6·§6.1에 membership 테이블과 엔진별 근거가 생김. 그러나 AG·DB·인스턴스 범위를 모델에서 구분하지 않아 동일 target 전체 지표가 여러 그룹에 중복 귀속될 수 있음. **수정:** “membership에 엔진별 범위와 namespace/replica 식별을 보존하고 해당 범위의 지표만 집계한다.” **C6**. |
| G15 | **부분** | §4에 `_STAT` 사용·capability 분리, Q3·Q29·R10에 RAC 제한이 반영됨. 다만 `V$LOCKED_OBJECT`로 **객체명**을 제공한다면서 이름 해석 카탈로그는 §4 허용목록에 없음. **수정:** “객체명 해석에 사용하는 카탈로그를 별도 허용목록·grant에 명시하고, 미허용 시 object ID만 반환한다.” **C9**. |
| G19 | **부분** | §5.5에서 P1a를 명령 유형·승인 태그로 축소한 것은 반영됨. 그러나 “주석 전체 보존·테이블 lineage 추출은 P3”는 주석 전체 보존을 후속 확정 범위로 읽게 하며, §12의 “완전 lineage 제외”와도 경계가 불분명함. **수정:** “주석 전체는 보존하지 않는다. P3는 승인 태그와 제한된 객체 연결까지만 포함하며, 완전 lineage는 별도 과제다.” |
| G23 | **부분** | D15·§4.5·§5.8에 서버 Q 1회·선택 DB·접속 1개·순회 예산이 반영됨. §5.1은 여전히 **2개 풀·2레인만** 설명하고, DB당 3초가 연결·TLS·결과 전송을 포함하는지 불명확함. **수정:** “PG namespace 작업은 별도 동시 1개 접속으로 수행하며, DB당 총 경과시간 예산에 연결·인증·조회·전송을 포함한다.” |
| G25 | **부분** | §5.4에 네 종류의 행 수 quota가 추가됨. 그러나 참조 수명 보장·LRU·바이트 예산·overflow 후 델타 처리 사이의 계약이 없음. **수정:** “참조 중 ID는 재사용·삭제하지 않고, 행 수 및 바이트 quota 초과 시 신규 식별 admission을 제한한다. native별 델타 계산 전에 누적값을 overflow 키로 합치지 않는다.” **C4·C7**. |
| G26 | **반영됨** | §10에서 임의 사용자 SQL을 GA 비범위로 명시하고, Q25가 고정 템플릿과 임의 SQL의 제품 결정을 분리함. 최소 가드는 협의 원문을 명시적으로 참조함. |
| G32 | **누락** | §15는 “failover와 읽기 분산 구분·레인별 노드 검증은 §5.1”이라고 완료 처리했으나, **§5.1에 해당 계약이 없음**. §5.8의 사후 노드 변경 설명만으로는 부족함. **수정:** “모든 레인은 접속 시와 재접속 후 물리 노드를 검증하며, 서로 다른 노드의 세션·통계·플랜을 조인하지 않는다. 읽기 분산 endpoint의 GA 지원 여부를 별도로 명시한다.” **C2**. |
| G36 | **반영됨** | D14·§4 MySQL 행·§10이 consumer 자동 변경 프로시저를 제외하고 DBA 설정·감지·안내로 통일됨. |
| G40 | **부분** | §5.3·§6.1에 address·port·hostname·application 및 NULL 처리는 반영됨. 1차에서 구별하도록 한 **transport 축**은 없음. **수정:** “client는 address·port·hostname·transport·application을 별도 필드로 보존하고, 소스에 없는 값은 추정하지 않는다.” |
| G41 | **반영됨** | §4 MSSQL Q 열·§5.4가 실행 사용자 미가용과 NULL 처리를 명시하며, 사용자별 SQL은 S에서만 제공한다고 제한함. |
| G42 | **반영됨** | §5.3·§8.1에 관측 시점 경과 분포와 `observedElapsedP90` 명명이 반영됨. 완료 latency 백분위와 구분됨. |
| G43 | **반영됨** | §5.3이 주기 샘플의 긴 실행 편향과 결정적 우선순위의 추가 편향을 구별하고 workload 외삽을 금지함. |
| G45 | **부분** | §4·R1·WS-7에 MariaDB 별도 인증과 `unavailable` 원칙은 반영됨. 그러나 실제 별도 지원표는 아직 없고, §7.1은 여전히 **전 엔진 데드락 카운터**를 약속함. **수정:** “MariaDB 데드락 규칙은 버전·소스별 인증된 카운터가 있을 때만 활성화하며, 미지원은 unavailable로 표시한다.” |
| G46 | **부분** | §4.5의 잘림≠DROP, §6.1의 completeness·scope는 반영됨. 그러나 **snapshot version과 수집 범위 version이 별개인지 불명확**함. **수정:** “동일 `scope_version`의 완전한 두 snapshot 사이에서만 삭제를 확정하며, 권한·선택 DB·cap 변경 시 범위 version을 변경한다.” |
| G47 | **부분** | §4.6에 가산·가중 평균·비율 재집계·합산 금지가 반영됨. 다만 관측 scope와 대표값 선택 규칙이 없어 적용 결과를 재현할 수 없음. **수정:** “각 metric에 scope·집계 대상·중복 제거 키·대표값 선택 규칙을 정의하고, 서로 다른 scope의 값은 합산하지 않는다.” **C6**. |
| G48 | **부분** | §5.4에 기본 `toplevel=true` 집합이 반영됨. 그러나 **native 식별·checkpoint 문맥에는 `toplevel`이 빠져 있음**. **수정:** “PG native key와 checkpoint key에 `toplevel`을 포함하고, 13 이하에서 `track=all`이면 중첩 구분 불가를 표시한다.” **C5**. |
| 선택 패키지 철회 | **반영됨** | D14·§1.4·§10·조사 §4 말미가 전용 객체 생성 없는 GA와 후속 Q를 구별함. 다만 승인 항목 수 문구는 C의 보완사항 참조. |

**사실 오류 표 대조**

아래 “부분”에는 **설계서는 정정됐지만 조사 기록의 사실 설명 본문에는 이전 표현이 남은 경우**도 포함합니다.

| 1차 사실 판정 대상 | 판정 | 근거 및 수정 |
|---|---|---|
| Datadog RAC는 `GV$` 미사용 | **반영됨** | 조사 정정①·§2.1·G15, 설계 Q3·Q29가 “필요 시 GV$”로 정정됨. |
| RAC 노드마다 Agent 설치 필수 | **반영됨** | 조사 정정①·§2.1이 노드별 설정 항목으로 정정됨. |
| `system_health` 폴백과 `event_file` 우선 | **반영됨** | 조사 정정②·G6, 설계 §4가 우선 경로를 보존함. |
| 권한은 `VIEW SERVER STATE`만 필요 | **부분** | 설계 §4·R9 및 조사 정정②는 수정됐으나 조사 **§2.3 MSSQL 권한 열에는 이전 권한만 기재**됨. **수정:** “≤2019와 2022+ 권한을 분리한다.” |
| SQL Server 2012·2014 데드락 수집 불가 | **부분** | 조사 정정②는 정확하나 **§2.3 특기에는 ‘데드락 불가’가 남음**. **수정:** “Datadog의 해당 조회 SQL은 `AT TIME ZONE` 제약으로 미지원이며 엔진 기능 부재가 아니다.” |
| PG 7.80+ schema 기본 ON | **부분** | 조사 §1.5에 PG 한정은 반영됨. **DBM/Data Observability 활성화 조건**은 빠짐. 해당 조건을 함께 기재할 것. |
| PG 다른 DB 텍스트 때문에 DB마다 접속 | **반영됨** | D15·§4.5·조사 정정③·G23이 정확히 분리함. |
| PG EXPLAIN은 SELECT 권한 필요 | **부분** | D13·조사 G7은 문장별 권한으로 정교해짐. 다만 §4.4의 **“모니터링 계정으로 불가”는 지나치게 절대적**임. **수정:** “통계 역할만으로 타인 업무 객체의 문장 권한을 충족하지 못한다. GA 정책상 재계획은 제공하지 않는다.” |
| Oracle actual rows는 `ALL`일 때만 | **반영됨** | 조사 정정④·G28, 설계 §4·§4.4에 힌트 경로가 추가됨. |
| Agent 1개 30 DB 강제 상한 | **반영됨** | 조사 §2.1에 권장 운영 규모·강제 상한 아님을 명시함. |
| CPU 벤치 수치의 조건·주체 | **부분** | 정정⑥·설계 R2 보강은 정확함. 조사 **§2.1의 CPU 요약은 Agent와 DB 쿼리 비용 구분이 여전히 모호**함. 주체·환경·주기를 같은 표에서 분리할 것. |
| plan cost가 공통 블록 비용 | **부분** | 조사 **§1.3에 ‘블록/페이지 접근 수에 대응’이 남음**. **수정:** “엔진별 optimizer 비용 단위이며 엔진 간·다른 설정 간 직접 비교하지 않는다.” |
| 테이블·주석 추출이 저비용 | **부분** | P1a 축소는 반영됐으나 §5.5의 P3 lineage·주석 전체 보존 범위가 불명확함. 위 G19 수정 적용. |
| Oracle custom query는 일률적 추가 과금 | **반영됨** | 조사 §1.8이 “발생할 수 있다”는 조건부 표현을 유지함. |
| MySQL/MariaDB 동일 지원·최저 Agent 버전 | **부분** | 정정⑤는 분리했지만 조사 **§2.3은 여전히 MySQL/MariaDB를 합치고 Agent 7.36.1+로 표시**함. MariaDB 행을 분리하고 공식 지원 버전·Agent 7.61.0+를 기재할 것. [Datadog MariaDB 설치 문서](https://docs.datadoghq.com/database_monitoring/setup_mariadb/selfhosted/) |
| 선택 패키지이면 원칙 1 충돌 해소 | **반영됨** | 철회가 D14와 조사 §4 말미에 명시됨. |

조사 **머리의 정정 6건과 G6·G7·G15·G23·G28 수정본은 1차 판정의 방향과 일치**합니다. §4의 나머지 옛 제안은 “1차 안”이라고 표시되어 있으므로, 그 존재 자체를 미반영 결함으로 세지 않았습니다.

## B. 중점 확인 요청 1~8 답변

### 1. D13·플랜 지원표·API·화면의 GA 범위 — 🔴

D11·D13·§4·§4.4·§8.1·§8.2는 Oracle·MSSQL 캐시 플랜으로 일치하며, PG·MySQL 사용자에게도 “GA 미지원” 안내가 있습니다. **충돌은 D11이 아니라 §5.5 재실행 행**의 `EXPLAIN 승인+예산` 잔존입니다. §11의 PG 권한 실패 시험도 운영 capability 검사에서 고객 SQL을 재계획하는 뜻으로 읽히지 않도록 격리해야 합니다.

> **수정:** “GA는 Oracle·SQL Server 캐시 플랜만 읽으며 고객 SQL의 `EXPLAIN`을 수행하지 않는다. PG 권한 검증은 P0 격리 fixture에서 수행하고, 운영 capability는 GA 정책에 따라 P=UNSUPPORTED로 보고한다.”

### 2. PG 서버 Q 1회 조회의 권한·namespace 예산 — 🟡

**서버 Q 1회 조회는 맞습니다.** `pg_stat_statements`는 서버 전체 DB를 추적하고 확장 객체가 설치된 DB에서 조회하며, 타 사용자 SQL 텍스트·`queryid` 가시성에는 `pg_read_all_stats` 권한이 필요합니다. 설계의 `pg_monitor`는 그 역할을 포함하지만, 확장 설치 DB의 CONNECT·확장 schema USAGE·객체 SELECT/EXECUTE가 별도 ACL로 제한된 환경도 검사해야 하며 다른 모든 DB의 CONNECT는 이 서버 Q 조회의 필수조건이 아닙니다. [PG 확장 문서](https://www.postgresql.org/docs/17/pgstatstatements.html), [PG 사전 정의 역할](https://www.postgresql.org/docs/17/predefined-roles.html), [PG 권한 문서](https://www.postgresql.org/docs/17/ddl-priv.html)

namespace 10개×3초가 20초를 넘는 것은 cursor 이월로 설명 가능하지만, **§5.1의 2레인 설명과 연결 설정·취소까지 포함한 총예산은 보완이 필요**합니다.

> **수정:** “서버 Q는 통계 확장 DB 한 곳에서 수집하며 타 사용자 텍스트 가시성 권한을 검사한다. PG namespace는 fast/slow와 별도 동시 1개 접속으로 실행하고, 연결·TLS·인증·조회·결과 전송을 포함한 DB당 총예산 3초 및 10분당 총예산 20초를 적용한다. 미완료 순회는 다음 주기로 이월한다.”

### 3. quota·용량·500행 스캔·두 sentinel — 🔴

**500행은 회당 스캔 상한이며 장기 dictionary·checkpoint·plan 크기의 상한이 아닙니다.** 네 quota 사이에 반드시 같은 숫자가 필요한 것은 아니지만, 참조 중 ID 보존과 LRU의 우선순위, 바이트 상한, checkpoint가 없는 Q의 처리 규칙이 빠져 있습니다. `__other__`는 동일 델타 집합에서 TopN 밖의 알려진 합계이고 `__overflow__`는 식별 정보 손실이므로, 후자의 누적 카운터를 하나로 합친 뒤 차분해서는 안 됩니다. §6.2의 용량도 신규 테이블 산식과 맞지 않습니다(C4·C7).

> **수정:** “`__other__`는 관측 집합 내 TopN 외 합계, `__overflow__`는 차원 식별 손실을 뜻한다. native별 차분 후 합산하며 기준값이 없으면 partial로 처리한다. 참조 중 ID는 유지하고 행 수·바이트 quota를 함께 강제한다.”

### 4. 데드락 UNIQUE·`event_file` 권한·JDBC 가능성 — 🟡

`(source_session,event_ts,content_hash)`는 **반복 읽기의 실용적 중복 제거 키로 사용할 수 있지만**, 소스가 XE 세션 이름인지, 관측 노드·재시작 수명을 어떻게 구분하는지, 해시가 어떤 XML 표현을 기준으로 하는지 정의해야 충분합니다. **자체 호스팅 SQL Server의 `event_file`은 JDBC로 서버 측 `sys.fn_xe_file_target_read_file`을 호출해 읽을 수 있으며**, ≤2019는 `VIEW SERVER STATE`, 2022+ 서버 범위 경로는 `VIEW SERVER PERFORMANCE STATE`가 필요합니다. 경로는 DB 서버 측 경로이므로 BE의 파일 마운트·SMB 접근은 필요하지 않지만, DB 서버가 해당 XEL 경로를 읽을 수 있어야 합니다. MI의 `system_health` 특수 경로와 일반 Blob credential 경로는 구별해야 하며, **MovesEye 고객 환경에서의 실제 가용성은 미확인**입니다. [파일 읽기 함수 공식 문서](https://learn.microsoft.com/en-us/sql/relational-databases/system-functions/sys-fn-xe-file-target-read-file-transact-sql?view=sql-server-ver17), [XE target DMV 권한](https://learn.microsoft.com/en-us/sql/relational-databases/system-dynamic-management-objects/sys-dm-xe-session-targets-transact-sql?view=azuresqldb-current)

> **수정:** “기존 `system_health`의 target 경로를 조회하고 서버 측 함수로 읽는다. 중복 제거 키는 관측 노드·소스 수명·UTC 이벤트 시각·정규화된 이벤트 내용 해시로 정의하며, 재조회와 저장은 멱등하게 처리한다. 파일 순회 위치는 별도 checkpoint로 관리한다.”

파일 checkpoint에는 추가 주의가 필요합니다. **`file_offset`은 이벤트별 고유 ID가 아니라 여러 이벤트가 들어갈 수 있는 버퍼 위치**입니다. 행 상한으로 버퍼 일부만 처리하고 그 offset 전체를 완료 처리하면 누락될 수 있습니다. [함수의 offset 설명](https://learn.microsoft.com/en-us/sql/relational-databases/system-functions/sys-fn-xe-file-target-read-file-transact-sql?view=sql-server-ver17)

### 5. membership 근거가 동일 클러스터를 보장하는가 — 🔴

나열한 값들은 유용한 근거지만 **동일 운영 클러스터를 단독 보장하지 않습니다**. PG의 `system_identifier`는 같은 base backup 계통을 확인하는 값이므로 현재 복제 관계까지 확정하는 증거는 아니며, MySQL의 Source UUID는 채널별 관계로 보존해야 합니다. MSSQL `group_id`는 AG 식별자이고 DB replica에는 별도의 `group_database_id`·`replica_id`가 있으므로 target 전체 membership만으로는 범위가 부족합니다. Oracle도 RAC의 동일 `DB_UNIQUE_NAME`과 DG의 서로 다른 멤버 이름을 구별해야 합니다. [PG 식별자 정의](https://www.postgresql.org/docs/17/protocol-replication.html), [MySQL replica 상태](https://dev.mysql.com/doc/refman/8.4/en/show-replica-status.html), [MSSQL DB replica 식별](https://learn.microsoft.com/en-us/sql/relational-databases/system-dynamic-management-objects/sys-dm-hadr-database-replica-states-transact-sql?view=azuresqldb-current), [Oracle DB_UNIQUE_NAME](https://docs.oracle.com/en/database/oracle/oracle-database/19/refrn/DB_UNIQUE_NAME.html)

PG 식별자만으로 현재 membership을 확정하지 말아야 한다는 부분은 위 공식 정의에서 도출한 **설계상 판단**입니다.

> **수정:** “발견 식별자는 membership 후보 근거로 저장한다. 현재 복제 관계·관리자 확인·관측 유효기간으로 membership을 확정하고, AG/DB·복제 채널·RAC/DG 범위를 구분한다. 해당 범위로 필터링된 metric만 집계한다.”

### 6. 기존 키 누락=무제한과 커널·4파일 규칙 — 🟡

**누락=무제한을 용량 정책에만 적용하면 커널과 충돌하지 않습니다.** 기존 `LicenseStatus.allows()`의 상태·Feature 판정을 먼저 통과해야 하므로, 만료되거나 DB_MONITORING이 없는 키를 상한 누락으로 허용해서는 안 됩니다. §9의 `LicenseClaims` 변경 및 enum 세 종류 불변은 맞으며, 네 계약 파일의 양쪽 일치 검사와 실제 발급→BE 검증을 함께 유지해야 합니다. 다만 누락·명시적 null·malformed·0·무제한 표현·하향 갱신은 아직 Q22 결정이 필요합니다. [현재 Feature 판정](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/license/domain/LicenseStatus.java:52), [발급기 계약 규칙](/C:/solutions/moveseye-license-issuer/README.md:90)

> **수정:** “상한 누락 호환 정책은 유효한 기존 키의 용량 판정에만 적용하며 상태·Feature 게이트를 우회하지 않는다. 명시적 값의 오류를 누락으로 취급하지 않는다. 하향 갱신 시 대상 선택·폴러 admission 정책은 Q22로 확정한다.”

### 7. 299~405일과 WBS·R9/R10 — 🟡

**§0.1은 299~405일로 정확히 합산되지만 §12는 297~401일**입니다. 원인은 §12 P0가 R1~R8·20~30일로 남아 있고, §0.1은 R1~R10·22~34일이기 때문입니다. WS-23~25는 추가되어 있으나, 공수에 포함했다는 **발급기까지의 `maxDbTargets` 최소 강제 작업은 WBS에서 추적되지 않습니다**.

| Phase | §0.1 | §12 |
|---|---:|---:|
| P0 | 22~34 | **20~30** |
| P1a | 58~76 | 58~76 |
| P1b | 37~49 | 37~49 |
| P2 | 85~111 | 85~111 |
| P3 | 58~84 | 58~84 |
| P4 | 39~51 | 39~51 |
| **합계** | **299~405** | **297~401** |

> **수정:** “§12 P0는 R1~R10·22~34일로 정정한다. 별도 WS에 발급 입력·서명 클레임·BE 검증/상태 API·원자적 활성화·하향 갱신·관리 화면·실제 발급 키 종단 검증을 배정하며, 기존 추정치 내 포함 범위를 명시한다.”

### 8. 부록 B와 Oracle 호출 허용목록 — 🔴

**부록 B Oracle 행에 열거된 객체 자체는 §4 grant 목록 안에 있습니다.** 그러나 §4의 락 객체명 기능에는 `V$LOCKED_OBJECT`의 `OBJECT_ID`를 이름으로 바꿀 카탈로그가 빠져 있으며, 이 뷰 자체는 객체명을 제공하지 않습니다. §4.1의 “기본 패키지=위 grant 목록 전부”도 선택 capability·옵션 grant까지 기본 목록으로 합치는 표현이라 조정해야 합니다. [Oracle V$LOCKED_OBJECT 열 정의](https://docs.oracle.com/en/database/oracle/oracle-database/19/refrn/V-LOCKED_OBJECT.html)

> **수정:** “Oracle 허용목록은 BASE와 CDB·DG·ASM·RM·ACTUAL_PLAN·OBJECT_NAME capability별로 나눈다. 객체명 해석 카탈로그를 별도 명시하고, 미허용 시 object ID만 제공한다. 각 실행 경로의 실제 호출 객체는 활성화된 프로필의 허용목록 부분집합이어야 한다.”

## C. 새로 생긴 모순·누락

### 🔴 C1. GA 재계획 금지와 §5.5 승인 EXPLAIN의 충돌

- **위치:** D11·D13·§4.4·§8.1 ↔ §5.5 재실행 행.
- **문제:** API에서는 삭제했지만 보호 정책에는 승인 시 실행 가능 경로가 남았습니다. 구현자가 서로 다른 규칙을 선택할 수 있습니다.
- **수정:** B1 문구로 통일하고, R1의 권한 시험은 **격리된 P0 검증**임을 명시합니다.

D11은 이미 “GA에서 EXPLAIN 재계획도 수행하지 않음”으로 고쳐졌으므로 **D11 자체를 다시 고칠 필요는 없습니다.**

### 🔴 C2. G32 완료 표시에 대응하는 레인별 노드 검증이 없음

- **위치:** §15 G32 → §5.1 참조, 실제 설명은 §5.8의 failover 후 노드 변경뿐.
- **문제:** fast가 노드 A, slow가 노드 B에 연결된 상태는 사후 `boot_epoch` 변경 설명만으로 차단되지 않습니다. namespace까지 별도 접속을 추가했으므로 검증 대상도 늘었습니다.
- **수정 문장:**

> “fast·slow·namespace의 모든 접속은 물리 노드와 부팅 수명을 확인한다. 관측 노드가 다르면 해당 배치의 상호 조인을 금지하고 각 소스에 node identity를 기록한다. 읽기 분산 endpoint는 별도 인증 전 GA 미지원으로 표시한다.”

### 🔴 C3. 불완전한 TopN 점유율에 `≥`를 붙일 근거가 없음

- **위치:** §5.4 `__other__`·§15 G8.
- **문제:** 관측된 TopN 시간 80, 나머지 20이면 관측 비율은 80%입니다. 미관측 SQL 시간이 900 더 있다면 실제 전체 대비 비율은 8%이므로 **“≥80%”는 틀립니다**.
- **수정 문장:**

> “`other_complete=false`이면 전체 대비 점유율은 NULL로 반환한다. 필요하면 ‘관측 집합 내 점유율’만 표시하며, 전체 대비 상·하한으로 해석하지 않는다.”

### 🔴 C4. quota 강제 방식이 참조 수명·델타 정확성과 연결되지 않음

- **위치:** §5.4 quota ↔ §6.1 dimension/native 참조 수명 ↔ §6.3 손실 정책.
- **문제:** “참조 끊긴 것부터 LRU”는 참조 중인 항목만으로 quota가 찼을 때 동작을 결정하지 못합니다. 신규 native들을 같은 overflow 키로 합친 뒤 누적값을 차분하면 구성 변화가 가짜 델타·리셋을 만들 수 있습니다.
- **수정 문장:**

> “기존 참조 ID는 보존하며 quota 초과 시 신규 식별 admission을 제한한다. native별 checkpoint가 없는 항목은 baseline/partial로 처리하고, 누적값을 overflow 키로 합친 뒤 차분하지 않는다. 행 수 quota와 별도로 텍스트·플랜·checkpoint의 바이트 예산을 둔다.”

### 🔴 C5. `toplevel` 정책이 식별 키까지 전파되지 않음

- **위치:** §4 PG Q 열·§5.4 `toplevel` 조항 ↔ §5.4 식별 조항·§6.1 `dbm_query_native`.
- **문제:** 지원표에서는 `(dbid,userid,queryid,toplevel)` 문맥을 보존하지만, 모델 문맥은 여전히 `{dbid,userid,schema}`입니다. 중첩 SQL을 드릴다운에 보존하면 같은 queryid의 상위·내부 통계가 같은 native/checkpoint에 충돌할 수 있습니다.
- **수정 문장:**

> “PG native·checkpoint 식별 키는 `dbid,userid,queryid,toplevel`을 포함한다. 기본 총량은 top-level 집합에서만 계산한다. `toplevel`을 제공하지 않는 버전에서 `track=all`이면 중첩 구분 불가를 표시하고 전체 점유율의 완전성을 주장하지 않는다.”

이 조합이 확장 뷰의 실제 행 구분 기준입니다. [PG 공식 행 식별 정의](https://www.postgresql.org/docs/17/pgstatstatements.html)

### 🔴 C6. 클러스터 membership의 범위와 합산 범위가 다름

- **위치:** §4.6·§6.1 cluster/member·부록 B.
- **문제:** AG는 인스턴스 전체가 아닌데 member는 target 수준뿐입니다. 여러 AG에 속한 target의 전체 카운터를 그룹별로 합산하면 중복 귀속되며, 다른 노드에서 재관측한 replica 상태도 중복될 수 있습니다.
- **수정 문장:**

> “membership에 target 외 namespace·replica·복제 채널 범위를 보존한다. metric 카탈로그는 scope·집계 대상·중복 제거 키·대표값 선택 규칙을 정의한다. AG 밖 DB와 인스턴스 공통 지표는 AG 합계에 자동 포함하지 않는다.”

단순히 “가산/가중 평균/비율”을 적은 것만으로는 **어떤 행을 집계할지**가 결정되지 않습니다.

### 🔴 C7. 신규 테이블 +5~8GB가 제시한 workload 가정과 맞지 않음

- **위치:** §6.2 추가 테이블 행·§11 R4 보강.
- **문제:** 제시한 **MSSQL 10대×500 proc**를 매분 저장한다면 다음과 같습니다. 아래 300B는 설계가 Q 통계에 사용한 값을 대입한 **검산용 가정**이며 proc 실측값은 아닙니다.

| 항목 | 산식 | 결과 |
|---|---|---:|
| proc 1m, 7일 | 10×500×1,440×7 | 5,040만 행 |
| 위 행을 300B로 계산 | 5,040만×300B | **15.12GB** |
| proc 1h, 180일 | 10×500×24×180×300B | **6.48GB** |

프로시저만 **21.6GB**가 되는 가정에서 설정·데드락·schema·object 통계까지 +5~8GB에 넣을 수는 없습니다. 변경이 있는 proc만 저장하거나 TopN을 제한한다면 줄어들지만, 그 조건이 없습니다.

또한 dimension 20,000×50대×텍스트 최대 8KiB는 **텍스트 논리 크기만 약 8.19GB**입니다. 실제 압축률은 미확인이므로 기존 기타 전체 5~10GB를 quota로 보증할 근거가 되지 않습니다.

> **수정:** “테이블별 관측/저장 주기·활성 비율·행 상한·평균/최대 바이트·보존을 명시해 재산정한다. 현재 120~153GB 및 운영 150~200GB는 해당 workload에서 R4를 통과하기 전 잠정값이다.”

### 🔴 C8. 새 프로시저 통계 모델에 캐시 수명 식별이 빠짐

- **위치:** §6.1 `dbm_proc_stat_1m/_1h` ↔ §5.4 공통 리셋 조건.
- **문제:** `(dbid,object_id,name)`와 노드 부팅 수명만으로는 프로시저 재컴파일·캐시 재생성을 구분하지 못합니다. 새 캐시 누적값이 이전 값보다 이미 커졌다면 “감소 감지”도 통하지 않습니다.
- **근거:** DMV는 **캐시된 프로시저 플랜별 행**을 반환하며 `plan_handle`·`cached_time`을 제공합니다. [MSSQL 프로시저 통계 정의](https://learn.microsoft.com/en-us/sql/relational-databases/system-dynamic-management-views/sys-dm-exec-procedure-stats-transact-sql?view=sql-server-ver17)
- **수정 문장:**

> “프로시저 checkpoint는 node·dbid·object_id 외 캐시 수명 식별(`plan_handle`,`cached_time` 등)을 포함한다. 캐시 수명 변경 시 baseline을 새로 만들고, 표시용 프로시저 단위 집계는 native별 차분 후 수행한다.”

### 🔴 C9. Oracle 객체명 기능과 닫힌 허용목록이 충돌

- **위치:** §4 Oracle L의 `V$LOCKED_OBJECT(객체명)`·§4.1.
- **문제:** 현재 허용목록만 따르면 object ID는 얻어도 약속한 객체명을 일반적으로 해석할 수 없습니다. 구현자가 카탈로그를 몰래 추가하거나 화면 기능을 누락하게 됩니다.
- **수정:** B8처럼 이름 해석 capability·카탈로그·grant·CDB 문맥을 명시하거나 **object ID만 제공하는 범위로 축소**합니다.

**그 밖의 🟡 보완사항**

| 항목 | 충돌·누락과 수정 |
|---|---|
| namespace 실행 모델 | §4.5는 최대 3개 접속인데 §5.1은 2개 풀만 설명함. namespace 접속의 생성·종료·취소 및 전역 작업 제한을 §5.1에도 명시할 것. 10×3초>20초는 cursor 이월이 있으므로 그 자체는 모순 아님. |
| 공수·WBS | §12 P0를 22~34일·R1~R10으로 수정하고 라이선스 최소 구현을 WS에 배정할 것. 299~405일에 추가 작업을 이중 가산할 필요는 없음. |
| 메뉴 Phase | §8.2 개요의 알람 정렬은 P1b, 클러스터는 P2인데 행 Phase는 P1a뿐임. SQL 분석 캐시 플랜 P2도 Phase 열에서 빠짐. **메뉴 최초 노출과 내부 기능 제공 Phase를 구별**할 것. |
| 태그·lineage 범위 | §0.1·§12 P3의 승인 태그와 P1a 태그 추출은 수집/활용 단계로 구별하면 양립함. §5.5의 “주석 전체 보존”은 삭제하고 제한된 객체 연결과 완전 lineage를 구별할 것. |
| schema 범위 version·상한 | `snapshot_version`과 `scope_version`을 분리할 것. §4.5는 `300 tables·50 columns` 모두 대상 전체 기준으로 읽히므로, **50 columns가 테이블당인지 전체인지**도 명시할 것. |
| MariaDB·알람 | §4의 데드락 미가용 설명과 §7.1 “전 엔진” 규칙을 capability 조건으로 통일할 것. Datadog의 미갱신 제약을 MovesEye JDBC의 모든 가능한 소스에 자동 적용해서도 안 됨. 실제 소스 가용성은 R1에서 확인할 것. [MariaDB 제약](https://docs.datadoghq.com/database_monitoring/setup_mariadb/troubleshooting/) |
| D14·§1.4 원칙 | 전용 객체 생성 없음과 Oracle 호출 객체 기준 원칙은 일치함. 다만 “고객 승인 항목은 계정·포트 둘”은 PG 확장 미구성 시 설정·재시작 승인을 가림. **“엔진 전제가 구성된 환경의 기본 승인 항목”**으로 한정할 것. |
| 데드락 운영 | B4의 소스 수명·해시·파일 checkpoint 규칙을 추가할 것. §7.1의 카운터 증가와 신규 그래프가 같은 사건을 두 번 알리지 않도록 통합 규칙도 명시할 것. |
| 사용자 문맥 | §5.4의 “userid 문맥은 PG·MySQL(스키마)·Oracle(parsing user)”는 서로 다른 의미를 한 축으로 읽게 함. `execution_user`·`parsing_schema/user`·`schema`를 별도 문맥으로 표현할 것. |
| capability 상태 | §4.2 상태는 `OK/MISSING/DISABLED/ERROR`인데 R1 보강은 `P=UNSUPPORTED`를 요구함. GA 정책상 미지원과 권한 누락을 구별하는 상태 계약을 통일할 것. |
| 조사·반영표 정확성 | 조사 §5의 G1~G38 집계는 실제 **🔴11·🟡19·🟢8**과 다름. 추가 G39~G49와 사실 오류를 별도 집계할 것. §15의 “반영하지 않은 항목 없음”은 위 부분·누락 상태로 수정할 것. |

## D. 종합 판정

**v2 착수본 승인 보류입니다. 중복을 제거한 🔴 잔존은 9건(C1~C9)**이며, A의 부분 판정이나 B의 빨간 답변을 별도 건수로 더하지 않았습니다.

해제 조건은 다음입니다.

1. **실행 범위:** EXPLAIN 잔존 조항 제거, 모든 레인의 노드 검증·읽기 분산 endpoint 정책 명시.
2. **정확성:** 불완전 점유율 표시 수정, quota/overflow 델타 계약, `toplevel` 키, membership scope, 프로시저 캐시 수명 반영.
3. **지원·용량:** Oracle 객체명 허용목록 정합, 신규 테이블 산식 재작성.
4. **착수 관리:** §12 공수·라이선스 WS·메뉴 Phase·§15 완료 표시 정정 및 v2 필수 Q 결정.

**P0 실측 준비에 사용할 수는 있습니다.** 고객 DB 권한·성능 실측이 아직 없다는 사실을 결함으로 다시 센 것은 아닙니다. 다만 현재의 상충하는 문장과 식별·집계·용량 계약을 그대로 구현 기준으로 확정해서는 안 됩니다.