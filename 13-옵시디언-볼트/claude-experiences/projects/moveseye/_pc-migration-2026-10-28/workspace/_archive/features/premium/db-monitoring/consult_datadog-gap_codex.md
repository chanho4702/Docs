**판정은 “핵심 격차는 채택하되, Datadog의 설치·권한 모델까지 따라가지는 않는다”입니다.** 특히 G6·G7·G12·G15·G23·G25는 그대로 설계에 옮기면 지원 범위나 정확성을 과장합니다.

가장 먼저 고칠 부분은 다음입니다.

- 🔴 **PG의 Q 수집과 DB별 객체 수집을 분리**해야 합니다. `pg_stat_statements`의 다른 DB 통계·텍스트를 읽으려고 DB마다 접속할 필요는 없습니다.
- 🔴 **자동 플랜 수집의 GA 범위를 Oracle·SQL Server 캐시로 명시**하는 편을 추천합니다. PG/MySQL의 권한 상승 함수·프로시저는 Q로 남깁니다.
- 🔴 **“Datadog은 RAC에서 GV$를 안 쓴다”는 오류**입니다. 공식 RAC 문서는 필요한 경우 GV$를 조회한다고 명시합니다.
- 🔴 **SQL Server Q 통계를 실행 사용자별로 분해한다고 약속하면 안 됩니다.** 활동 샘플의 사용자와 캐시 누적 통계의 사용자는 가용성이 다릅니다.
- 🟡 Datadog의 기본값·벤치마크·권장 상한은 참고값입니다. MovesEye의 수집·저장 계약을 대신하지 않습니다.

검토 기준은 제공된 **설계 v1.1과 10월 19일 검수 반영 완료 상태**입니다. 기존의 만료 정지·4층 식별·lease·checkpoint·품질 3축은 전제로 삼았습니다. 파일·코드는 변경하지 않았으며, 고객 DB 실측은 수행하지 않았습니다.

---

**A. G1~G38 전건 판정**

단계의 `GA-P1`은 P1a/P1b를 포함합니다. `Q`는 결정·조사 항목이며 구현 확정이 아닙니다. 비용은 **기존 v1.1 대비 변화**입니다.

| G# | 판정 | 단계 | 근거 | 바뀌는 비용·위험 |
|---|---|---|---|---|
| G1 | 🟡 수정 | GA-P1 | 설정 수집·표시를 P1b로 앞당기는 데 동의합니다. 다만 전체 설정 덤프 대신 승인된 키를 수집하고, 인스턴스 설정과 DB·세션별 설정을 구별해야 합니다. | 낮음~중. 경로·접속정보·확장 설정의 민감정보 노출과 스냅샷 보존량 추가. |
| G2 | 🟡 수정 | P3 | 스키마·객체 스냅샷은 유용하지만 정의·변경 이력·relation 통계·쿼리 연결을 한 작업으로 “중간 비용” 처리하기 어렵습니다. 첫 범위는 선택 DB의 테이블·컬럼·인덱스·FK 및 제한된 통계로 줄이고, 잘림을 삭제·변경으로 해석하지 않아야 합니다. | 중~높음. DB 순회·객체 cardinality·변경 비교·추가 권한 필요. |
| G3 | 🟢 동의 | P2 | MSSQL 프로시저 통계는 실사용 가치가 높고 기존 델타 체계를 활용할 수 있습니다. 캐시 수명·재컴파일을 반영하고, 프로시저 통계만으로 내부 SQL 실행 관계를 완전히 복원한다고 약속하지 않습니다. | 낮음~중. 별도 식별·롤업·캐시 초기화 처리 추가. |
| G4 | 🟡 수정 | P3·Q | 인덱스 관측값과 플랜의 scan 표시는 채택할 수 있습니다. “30일 미사용”은 관측 범위·통계 리셋·수집 누락을 증명해야 하므로 Q23으로 유지하며, 인덱스 제거 판단으로 연결하지 않습니다. | 중. 객체 통계·관측 구간 관리 필요. |
| G5 | 🟡 수정 | GA-P1·Q | MySQL digest의 오류 카운터는 P1b에 포함합니다. MSSQL 완료·오류 XE 패키지는 GA에서 제외하고 Q로 남깁니다. `attention`은 클라이언트 취소도 포함하므로 곧바로 “타임아웃”으로 번역하면 안 됩니다. | MySQL 낮음. XE는 DB 변경 승인·이벤트 유실·민감 SQL 처리 비용이 큼. |
| G6 | 🔴 수정 | P2 | 기존 `system_health` 읽기는 채택하되 **권한·배포형태별 조건부 지원**입니다. 2022+ 권한, Azure SQL DB 예외, ring buffer 유실·잘림을 반영해야 하며 600초·100건을 보장값으로 사용하면 안 됩니다. | 중. 플랫폼 분기·중복 제거·유실 표시·XML 보호 처리 추가. |
| G7 | 🔴 수정 | Q·비범위 | PG 권한 문제의 지적은 맞지만 SECURITY DEFINER를 기본 해결책으로 채택하는 데 반대합니다. GA 자동 플랜은 Oracle·MSSQL 캐시로 한정하고 PG/MySQL 재계획 패키지는 Q로 남기는 것을 추천합니다. | GA 구현·심사 부담 감소. 대신 엔진별 플랜 기능 차이를 명시해야 함. |
| G8 | 🔴 수정 | GA-P1 | Q에도 Other를 두는 방향에 동의합니다. 단 `전체−TopN`의 “전체”가 동일한 관측·델타 집합에서 산출됐을 때만 정확하며, 스캔 상한·eviction·초기 관측 손실을 숨기면 안 됩니다. | 낮음~중. 총량·분모 출처와 불완전 상태 필요. |
| G9 | 🟡 수정 | GA-P1 | 60초 기본 유지에 동의합니다. 근거는 부하·통계 churn·제품 요구여야 하며, “1분 버킷이므로 10초 수집이 무의미하다”는 근거는 틀립니다. | 기본 비용 변화 없음. 향후 짧은 진단 주기는 별도 예산. |
| G10 | 🟡 수정 | P2·P3·Q | Oracle 원생 `MODULE/ACTION/CLIENT_IDENTIFIER`는 P2 수집 후보입니다. 주석은 승인된 키만 P3에서 추출하고, OTel JDBC 주석 주입은 실제 지원이 확인되므로 Q24를 버전·호환성 검증 과제로 바꿉니다. | 중. 민감정보·태그 폭증·SQL 캐시 영향·위조 태그 위험. |
| G11 | 🟡 수정 | P3 | 검증된 서비스 태그가 있으면 서비스별 활동 분해가 가능합니다. `program`·client host는 별도 축으로 표시해야 하며 실제 서비스 귀속으로 대체하면 안 됩니다. | 중. 귀속 신뢰도·미분류·복수 서비스 처리 필요. |
| G12 | 🔴 수정 | P2 | 클러스터 그룹은 필요하지만 제안된 키들은 서로 다른 의미입니다. MySQL `server_uuid`는 노드, Oracle `DB_UNIQUE_NAME`은 DG 멤버, MSSQL AG는 인스턴스 전체와 일치하지 않으므로 엔진별 membership 모델이 필요합니다. | “낮음”보다 중간. 오병합·복제 지표 중복 합산 위험. |
| G13 | 🟡 수정 | P2·P3 | P2에는 기존 범위인 복제 상태·지연·queue를 구체화합니다. 엔진 공통 모델은 최소 상태와 원 단위를 보존하고, 완전한 AG 이력 화면·복잡한 토폴로지는 P3로 분리합니다. | 중. bytes·seconds·상태 이력 및 replica별 가시성 차이 처리. |
| G14 | 🟢 동의 | P3 | Agent Jobs는 선택 기능으로 적합합니다. `msdb` 전체 SELECT 대신 실제 사용하는 객체와 권한을 열거하고, Agent가 없는 에디션·서비스를 구별합니다. | 낮음~중. 권한·에디션·job step 메시지 마스킹 추가. |
| G15 | 🔴 수정 | P2 | 추가 뷰들은 19c 기준 Diagnostics/Tuning Pack 객체로 분류되지 않지만 일괄 채택은 부적절합니다. ASM은 `_STAT` 대안을 쓰고, Resource Manager·DG·CDB는 환경별 capability로 분리하며 RAC의 GV$ 미사용 주장을 삭제합니다. | 중. 객체별 검증·에디션 분기·RAC 조인 검증 필요. |
| G16 | 🟡 수정 | GA-P1·P2 | 명시적 카운터 카탈로그에 동의합니다. 다만 “문서 작업”이 아니라 소스·버전·단위·집계 방식·주기·비용을 확정하는 구현 계약이며, 개수를 목표로 늘리면 안 됩니다. | 낮음~중. 카운터 수 증가분만큼 저장 예산 재산정. |
| G17 | 🟢 동의 | GA-P1 | MySQL extra 키를 고정·문서화하는 데 동의합니다. 누적값·게이지·분포값을 구별하고, MariaDB 미지원 필드는 0 대신 unavailable로 처리합니다. | 낮음~중. JSONB·롤업·엔진별 컬럼 비용 증가. |
| G18 | 🟡 수정 | P2 | MSSQL extra 열은 채택하되 memory grant·DOP 등을 모두 누적 카운터처럼 차분하면 안 됩니다. `total/last/min/max` 중 어느 열인지와 가중 평균 산식을 정해야 합니다. | 중. 버전별 열·타입·롤업 의미 검증 필요. |
| G19 | 🔴 수정 | GA-P1·P3 | P1a는 명령 종류와 승인 태그 추출까지만 권합니다. 테이블 lineage를 토크나이저의 저비용 부산물로 약속하기 어렵고, `comments[]` 전체 보존은 기존 보호 정책을 약화합니다. | 중~높음. 방언·CTE·alias·동적 SQL·민감 주석 처리. |
| G20 | 🟡 수정 | GA-P1 | 기존 opt-in 정책은 유지합니다. “PG 서버가 값을 치환해서 없다” 대신 **확장 프로토콜의 SQL 텍스트와 bind 값이 분리되며 현재 소스에서 값을 얻지 못한다**고 써야 합니다. | 문구 중심. 원문 옵션에 대한 과도한 복원 기대 방지. |
| G21 | 🟡 수정 | GA-P1 | 기본 1,000행과 기존 우선순위를 유지합니다. 2,000행 증가는 R2·R4 결과가 있을 때 결정하며 Datadog의 3,500행을 근거로 올리지 않습니다. | 즉시 변화 없음. 상한 증가 시 장애 중 저장·응답 부하 증가. |
| G22 | 🟡 수정 | GA-P1·P2 | 벤치 참고에는 동의하지만 Agent CPU와 DB 쿼리 CPU를 분리해야 합니다. 세션 수집 간격·Agent 버전·하드웨어가 다르므로 MovesEye의 5초 성능 보장 근거가 아닙니다. | 검증 비용 일부 증가. 수치 오인 방지. |
| G23 | 🔴 수정 | GA-P1·P3 | **PG Q 통계·대표 텍스트는 한 DB의 확장 뷰로 서버 전체를 조회할 수 있습니다.** DB별 접속은 relation·schema 등 로컬 카탈로그 작업에 필요하며, 발견된 모든 DB의 자동 수집 기본값에는 반대합니다. | 중. 선택 DB·순회 예산·접속 상한 필요. 중복 Q 수집 방지. |
| G24 | 🟡 수정 | Q → GA-P1 | `maxHosts` 재사용에는 반대하며 `maxDbTargets` 별도 클레임을 권합니다. 과금 단위·기존 키 호환·초과 처리까지 확정해야 하므로 상수 한 줄 추가로 끝나지 않습니다. | 중. 발급기·BE·상태 API·관리 화면·계약 검증 동반 변경. |
| G25 | 🔴 수정 | GA-P1 | “샘플의 정규화 쿼리 종류에 Top 200 제한이 없음”과 “raw 48시간 보존”은 다른 축입니다. v1.1에 무제한 cardinality 대응이 있다고 판정할 수 없으며 차원·텍스트·플랜별 quota가 필요합니다. | 중. dictionary/checkpoint 팽창 및 보존 중단 위험. |
| G26 | 🔴 수정 | Q | 임의 읽기 SQL은 P3 확정 후보가 아니라 별도 보안·제품 결정으로 남깁니다. 우선은 검토된 고정 템플릿이 현실적이며, `SELECT`·timeout·행 상한만으로 안전을 보증할 수 없습니다. | 높음. 권한·부작용·Oracle 팩 접근·메트릭 폭증 위험. |
| G27 | 🟢 동의 | GA-P1·P3 | 현재 보존 범위를 유지합니다. 365일은 실측 용량과 장기 TopN 정책을 함께 검증한 선택 프로필이어야 합니다. | 기본 변화 없음. 저장소 전체 비례가 아니라 롤업별 증가량 산정. |
| G28 | 🟡 수정 | P2 | 기본 `V$SQL_PLAN` 유지에 동의합니다. 실행 통계는 `STATISTICS_LEVEL=ALL` 외에 `GATHER_PLAN_STATISTICS` 등으로도 채워질 수 있으므로 현재 문구는 고쳐야 합니다. | 낮음. estimated rows와 actual rows의 명확한 구분 필요. |
| G29 | 🟡 수정 | GA-P1·P3 | 블로커 영향 지표는 유용합니다. 누적 `wait_ms`를 매 샘플 더하지 말고 시간 가중 관측값으로 계산하며 직접 blocker와 root blocker의 중복 귀속을 구별합니다. | 중. 실행 횟수·유발 대기 시간의 추정 의미 정의 필요. |
| G30 | 🟢 동의 | GA-P1·P2 | `LONG_QUERY`와 `LONG_TX`는 구별할 가치가 있습니다. 로그인·세션 나이가 아니라 현재 실행 시작 시각과 실행 식별을 사용하고 idle 세션을 제외합니다. | 낮음. 엔진별 현재 실행 식별·회복 조건 추가. |
| G31 | 🟢 동의 | P3 | 기존 범위 유지에 동의합니다. 캐시 플랜 변경·새로 만든 예상 플랜 변경·실행 통계 회귀를 같은 사건으로 합치지 않습니다. | 기존 범위. 관측 출처별 정확도 한계 유지. |
| G32 | 🔴 수정 | GA-P1·P2·Q | VIP 지원을 곧바로 우위라고 홍보하면 안 됩니다. 단일 노드 failover endpoint와 읽기 분산 endpoint를 구별하고, 모든 레인에서 물리 노드 식별을 검증해야 합니다. | 중. 레인 간 다른 노드 접속·통계 및 세션 오조인 위험. |
| G33 | 🟡 수정 | GA-P1·P2 | 권고 설정 검사에는 동의하지만 capability 상태와 권고 등급을 분리합니다. `MAX_USER_CONNECTIONS 5`·`SESSIONS_PER_USER 5`는 순회·HA까지 계산한 권장 예시이며 보편 필수값이 아닙니다. | 낮음~중. 고객 설정 변경·프로파일 영향 최소화 필요. |
| G34 | 🟢 동의 | GA-P1 | 포화·deallocation·통계 reset 관측을 추가합니다. 다만 시간 coverage와 별도로 **소스 통계의 가시 범위**를 표시하며, digest 자동 TRUNCATE는 하지 않습니다. | 낮음~중. 소스 누락 진단과 버전별 검사 추가. |
| G35 | 🟡 수정 | P5·Q | ASH 선택 프로필 검토는 유지합니다. 라이선스 확인 체크박스만으로 충분하지 않으며, 기본 프로필과 허용목록·권한·설정을 분리하고 기본 경로의 호출 0건을 유지해야 합니다. | GA 변화 없음. 별도 프로필 인증 비용 발생. |
| G36 | 🔴 수정 | 비범위·Q | “가이드만”을 유지한다면서 권한 상승 토글 프로시저를 제공하는 것은 실질적으로 다릅니다. GA는 고객 DBA가 소비자 설정을 직접 관리하고 MovesEye는 감지·안내만 합니다. | GA 부담 감소. 고객 설정 누락은 capability로 표시. |
| G37 | 🟢 동의 | 비범위 | 제품 grant에 추가하지 않는 데 동의합니다. 단순 조회가 곧 팩 사용이나 과금 발생이라는 뜻은 아니며, 사용 통계와 고객의 라이선스 권리도 동일하지 않습니다. | 변화 없음. 불필요한 권한·잘못된 라이선스 판정 방지. |
| G38 | 🟡 수정 | GA-P1·P2·P3 | fingerprint 검색·마스킹된 구조화 플랜 반환에 동의합니다. `query_signature=우리 fingerprint`를 Datadog과 같은 값이라는 뜻으로 쓰면 안 되며 engine·알고리즘 버전·문맥을 보존해야 합니다. | 낮음~중. API 안정성·권한·페이지/응답 크기 제한 필요. |

**G7 심층 판정 — PG/MySQL EXPLAIN 권한**

**“PG에서 ANALYZE 없는 EXPLAIN도 업무 테이블 권한을 검사한다”는 지적은 맞습니다.** 다만 “참조 테이블 SELECT가 필요”는 SELECT 문을 설명하는 경우의 요약입니다. DML에는 해당 문장이 요구하는 권한이 필요합니다.

PG 17 소스에서 일반 EXPLAIN은 `EXEC_FLAG_EXPLAIN_ONLY`로 `ExecutorStart()`를 호출합니다. 이어지는 `InitPlan()`은 `ExecCheckPermissions()`를 호출하며, 실제 tuple 실행을 생략한다고 이 권한 검사를 생략하지 않습니다. “플래너가 실행하지 않으므로 테이블 권한이 필요 없다”는 해석은 틀립니다. 스키마·함수·RLS 등 다른 검사도 있으므로 모든 권한 검사가 오직 이 시점에만 발생한다는 뜻은 아닙니다. [PG explain.c](https://raw.githubusercontent.com/postgres/postgres/REL_17_STABLE/src/backend/commands/explain.c), [PG execMain.c](https://raw.githubusercontent.com/postgres/postgres/REL_17_STABLE/src/backend/executor/execMain.c)

| 부여 권한 | 타인 업무 테이블을 읽는 SELECT의 EXPLAIN | 판단 |
|---|---|---|
| `pg_read_all_stats`만 | 원칙적으로 불가 | 통계 가시성 권한이며 업무 데이터 SELECT가 아님. |
| `pg_monitor`만 | 원칙적으로 불가 | 모니터링 역할을 포함하지만 업무 테이블 SELECT를 부여하지 않음. |
| `pg_read_all_data` | 일반 SELECT는 가능 | 테이블 SELECT·스키마 USAGE 효과가 있으나 RLS 우회·모든 함수 권한·DML 권한까지 제공하지 않음. |
| 명시적인 schema USAGE + 필요한 SELECT | 해당 범위에서 가능 | 기존 계정에 제한된 읽기 권한을 추가하는 대안. |

`SELECT 1`이나 이미 PUBLIC 읽기가 허용된 객체처럼 **원래 접근 가능한 쿼리까지 EXPLAIN이 불가능하다는 의미는 아닙니다.** [PG predefined roles](https://www.postgresql.org/docs/17/predefined-roles.html)

SECURITY DEFINER 외의 대안도 있습니다.

- **제한된 업무 객체의 SELECT grant:** 기술적으로 가장 단순하지만 모니터링 계정이 실제 데이터를 읽을 수 있게 됩니다.
- **기본 owner 권한을 사용하는 뷰:** 허용된 뷰에 대한 쿼리는 설명할 수 있습니다. 그러나 원래 base table 쿼리를 그대로 설명하는 통로가 아니며, 임의 SQL을 뷰 쿼리로 바꾸면 동일 플랜을 보장할 수 없습니다. 뷰 생성 자체도 DB 변경입니다. [PG CREATE VIEW](https://www.postgresql.org/docs/17/sql-createview.html)
- **`SET ROLE`:** 이미 허용된 역할로 전환하는 수단입니다. 권한 없는 모니터가 임의 사용자를 가장하는 기능이 아니며, 강한 업무 역할로 전환할 수 있다면 그 권한도 실질적으로 위임한 것입니다. [PG SET ROLE](https://www.postgresql.org/docs/17/sql-set-role.html)
- **DBA가 외부에서 얻은 플랜의 수동 제공:** 자동 수집을 포기하는 대신 권한 확대를 피할 수 있습니다. 추후 import 기능으로 검토할 수 있습니다.

또한 `plan_cache_mode=force_generic_plan` 설정만으로 다른 세션의 prepared statement를 설명할 수 있는 것은 아닙니다. 재계획하려면 SQL·파라미터 타입·DB·role·`search_path` 등의 문맥이 필요하고, 결과는 실제 실행 플랜과 다를 수 있습니다.

MySQL은 공식적으로 **설명할 문장을 실행하는 데 필요한 권한과 같은 권한**, 설명 대상 뷰에는 추가 `SHOW VIEW`를 요구합니다. 다른 연결의 `EXPLAIN FOR CONNECTION`도 `PROCESS`만으로 업무 객체 권한을 우회하지 못합니다. [MySQL EXPLAIN](https://dev.mysql.com/doc/refman/8.0/en/explain.html), [MySQL EXPLAIN FOR CONNECTION](https://dev.mysql.com/doc/refman/8.4/en/explain-for-connection.html?ff=nopfpls)

**제품 추천:** GA 문구를 다음처럼 바꾸는 편이 정직합니다.

> 자동 실행계획 수집은 Oracle·SQL Server의 캐시 플랜을 지원합니다. PostgreSQL·MySQL/MariaDB의 재계획 수집은 기본 제공 범위에서 제외하며 별도 권한·DB 변경 프로필로 검토합니다.

캐시 플랜도 해당 실행의 실제 row 통계를 보장하지는 않습니다.

**G6 심층 판정 — system_health**

| 환경 | 기존 세션 읽기 가능성 | 필요한 정정 |
|---|---|---|
| SQL Server 2016~2019 자체 호스팅 | 기본 `system_health`에서 가능 | 관련 DMV 읽기에 `VIEW SERVER STATE`. 세션·target 존재와 실행 상태 확인 필요. |
| SQL Server 2022+ | 가능 | `sys.dm_xe_session_targets`는 `VIEW SERVER PERFORMANCE STATE` 요구. |
| SQL Server 2012·2014 | 엔진 자체는 deadlock XE 수집 가능 | Datadog의 미지원 이유인 `AT TIME ZONE`을 엔진 기능 부재로 해석하면 안 됨. MovesEye GA 인증 범위와는 별개. |
| Azure SQL Managed Instance | 기본 `system_health` 존재 | MI 권한·조회 경로를 별도 인증. |
| Azure SQL Database | 기본 `system_health` 없음 | database-scoped XE가 별도로 필요하므로 기본 무객체 기능으로 보장 불가. |
| RDS SQL Server | 기존 세션 읽기 경로 검토 가능 | AWS의 에디션·target·권한·Multi-AZ 제약을 반영한 별도 인증 필요. |

Microsoft 문서는 2012+에서 `xml_deadlock_report` 사용을 권하며 기본 `system_health`에 포함된다고 설명합니다. 2008에서도 해당 이벤트를 이용한 수집 사례가 Microsoft KB에 있으므로, “2012부터 존재”라고 단정할 근거도 아닙니다. [XE target 권한](https://learn.microsoft.com/en-us/sql/relational-databases/system-dynamic-management-views/sys-dm-xe-session-targets-transact-sql), [Deadlocks guide](https://learn.microsoft.com/en-us/sql/relational-databases/sql-server-deadlocks-guide), [SQL Server 2008 KB](https://support.microsoft.com/en-gb/servicing/sql/sql-server-2008/cumulative-update/kb978629-fix-error-message-when-you-use-the-system-health-extended-event-session-to-capture-a-deadlo)

Azure SQL DB와 MI의 차이는 공식 문서에 명확합니다. RDS는 기본 XE 세션 수정 금지, ring buffer 메모리 상한, 사용자 XE의 failover 후 동작 등 별도 제약이 있습니다. [Microsoft system_health](https://learn.microsoft.com/sql/relational-databases/extended-events/use-the-system-health-session), [AWS RDS XE](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/SQLServer.ExtendedEvents.html)

추가로 다음 계약이 필요합니다.

- ring buffer는 영속 이력이 아니므로 **재시작·덮어쓰기·XML 잘림·이벤트 손실**이 가능합니다.
- 600초마다 최대 100건을 읽으면 그 사이의 전 건을 확보한다는 보장은 없습니다.
- `(source session, event timestamp, content hash 등)`을 이용한 중복 제거와 세션 재시작 처리가 필요합니다.
- 전용 세션을 만들지 않는 대신 수집 completeness를 제한적으로 표시해야 합니다.

**“Datadog의 system_health 폴백” 자체는 확인됩니다.** 다만 현재 공개 구현은 `system_health`에 `event_file` target이 있으면 이를 우선하고 그렇지 않으면 ring buffer를 사용합니다. 조사 기록을 “ring buffer만 읽는 폴백”의 근거로 사용하면 부정확합니다. [Datadog deadlocks.py](https://raw.githubusercontent.com/DataDog/integrations-core/master/sqlserver/datadog_checks/sqlserver/deadlocks.py)

**G15 심층 판정 — Oracle 객체와 RAC**

19c 공식 라이선스 문서의 Diagnostics/Tuning Pack 제한 객체와 대조하면, 질문의 추가 뷰들은 **그 자체의 직접 SELECT가 해당 Pack 기능으로 명시된 객체에 속하지 않습니다.** 이는 “모든 V$는 무료”라는 일반화와 다릅니다. [Oracle 19c Licensing Information](https://docs.oracle.com/en/database/oracle/oracle-database/19/dblic/Licensing-Information.html)

| 추가 객체 | Pack 판정 및 도입 조건 |
|---|---|
| `V_$CON_SYSMETRIC`, `V_$PDBS`, `V_$CONTAINERS` | Diagnostics/Tuning Pack 객체 아님. CDB 버전·container 가시성·공통 사용자 권한을 별도 확인. |
| `V_$PGASTAT`, `V_$SGAINFO`, `V_$PROCESS` | 기본 메모리·프로세스 관측 후보. 목적에 필요한 열과 수집 주기를 한정. |
| `V_$DATAGUARD_STATS`, `V_$DATAGUARD_CONFIG` | Pack 객체 아님. DG 역할·버전별 가시성과 값의 freshness를 확인. DG/Active Data Guard 사용 자격과 이 뷰 조회를 혼동하지 않음. |
| `V_$ASM_DISKGROUP` | Pack 문제보다 **조회 비용 문제**. 주기 수집은 `V_$ASM_DISKGROUP_STAT`로 변경 권고. |
| `V_$RSRCMGRMETRIC` | Pack 객체 아님. Resource Manager 기능의 에디션별 지원과 구분. 값이 없거나 0인 의미도 정의. |
| `V_$LOCKED_OBJECT`, `V_$PARAMETER` | Pack 객체 아님. 전자는 객체명 해석에 추가 카탈로그가 필요할 수 있고 후자는 설정값 보호 필요. |

Oracle은 `V$ASM_DISKGROUP`이 매번 disk discovery를 수행하므로 모니터링 스크립트에 사용하지 말고 `_STAT`을 사용하라고 명시합니다. 이 부분은 **허용목록 승인 전에 변경할 사항**입니다. Resource Manager 메트릭은 plan이 없는 경우에도 일부 값이 제공되므로 “기능 미사용=항상 미지원”으로 처리해서도 안 됩니다. [Oracle ASM view](https://docs.oracle.com/en/database/oracle/oracle-database/19/refrn/V-ASM_DISKGROUP.html), [Oracle Resource Manager metric](https://docs.oracle.com/en/database/oracle/oracle-database/19/refrn/V-RSRCMGRMETRIC.html)

RAC의 경우 **`V$SESSION.BLOCKING_INSTANCE`와 `BLOCKING_SESSION`으로 원격 blocker의 인스턴스 번호·SID를 표시할 수 있습니다.** 단 `BLOCKING_SESSION_STATUS='VALID'`일 때만 유효합니다. [Oracle V$SESSION](https://docs.oracle.com/en/database/oracle/oracle-database/19/refrn/V-SESSION.html)

다른 노드 대상의 샘플과 조인하려면 최소한 다음을 만족해야 합니다.

- 동일 RAC DB·incarnation에 속하는 노드라는 확인.
- `INSTANCE_NUMBER → 관측 node` 매핑.
- 해당 노드의 SID 및 `SERIAL#`·logon time을 포함한 세션 수명 확인.
- 두 샘플의 허용 시차와 노드 재시작 경계 확인.
- 원격 노드에서도 **idle blocker를 보존**하는 수집 정책.

waiter가 알려주는 원격 SID만으로 blocker의 `SERIAL#`나 당시 SQL 실행을 확정할 수는 없습니다. 따라서 **원격 세션 후보 조인은 가능하지만 항상 완전하고 정확한 SQL 조인이 가능한 것은 아닙니다.** 원격 노드 미등록·시간 불일치·SID 재사용이면 unresolved로 남겨야 합니다.

노드별 V$ 수집을 RAC 기본 방식으로 검토할 수는 있지만, 이를 근거로 `GV$` 필요성을 없애거나 RAC 인증을 대체해서는 안 됩니다.

**G2·G23 심층 판정 — PG DB별 접속과 50 DB 비용**

PG 공식 문서는 `pg_stat_statements`가 서버 전체 DB의 통계를 추적하며, 확장 뷰를 설치한 DB에서 이를 조회한다고 설명합니다. 적절한 통계 권한이 있으면 다른 DB·사용자의 대표 SQL 텍스트도 조회할 수 있습니다. 따라서 **“다른 DB의 pg_stat_statements 텍스트 때문에 DB마다 접속”은 오류**입니다. [PG pg_stat_statements](https://www.postgresql.org/docs/17/pgstatstatements.html)

| 작업 | DB별 접속 |
|---|---|
| `pg_stat_activity`, DB별 집계, 서버 복제·WAL 상태 | 일반적으로 한 접속에서 서버 범위 조회 |
| `pg_stat_statements` 통계·대표 텍스트 | 확장이 설치된 한 DB에서 서버 범위 조회 가능 |
| `pg_stat_user_tables/indexes`, `pg_statio_*`, 함수별 통계 | 해당 DB 접속 필요 |
| 테이블·컬럼·인덱스·FK 정의 및 로컬 OID 이름 해석 | 해당 DB 접속 필요 |
| 개별 relation 크기·객체 상세 | 해당 DB 접속 필요 |
| 해당 DB 문맥의 예상 플랜 | 해당 DB 접속 필요. 추가 권한·문맥 문제도 존재 |
| `pg_database_size(db)` | 호출 대상마다 DB를 바꿀 필요 없음. 다만 비용·권한은 별도 |

통계 확장 객체를 모든 DB에 만드는 것은 Datadog 구성이나 다른 기능의 편의를 위한 선택일 수 있으나 **서버 전체 Q 수집의 PostgreSQL 필수 조건은 아닙니다.**

50 DB를 각각 연결한다고 가정하면 순회 시간은 대략 다음과 같습니다.

`Tscan = Σ(connection setup + metadata query + result transfer)`

가령 **가정값**으로 DB당 연결 100ms·조회 50ms이면 약 7.5초입니다. DB당 총 실패 예산이 3초면 50개 장애 DB의 단순 직렬 순회는 150초입니다. 이는 실측값이 아니며, 실제 relation 수·인증·TLS·네트워크에 따라 훨씬 달라집니다.

추천하는 상한·순회 계약은 다음입니다.

1. **자동 발견과 자동 수집을 분리:** `datallowconn`뿐 아니라 CONNECT 가능 여부·시스템 DB·include/exclude를 확인합니다. 신규 DB는 기본적으로 발견 후보입니다.
2. **초기 수집 DB 상한 10개 제안:** 50개 전체 선택은 별도 규모 프로필로 인증합니다. 이 숫자는 제품 정책 제안이며 PG 한계가 아닙니다.
3. **namespace 동시 작업은 대상당 1개:** C/S/Q/L의 기한을 우선하고 namespace 작업은 짧게 나눠 실행합니다.
4. **연결 수를 명시:** 현재 fast/slow 각 1개 외 namespace 접속을 별도로 두면 대상당 최대 3개입니다. DB마다 Hikari pool을 50개 만들면 안 됩니다.
5. **DB당 예산 + 대상 전체 순회 예산 + 전역 동시성**을 함께 둡니다. 예를 들어 DB당 3초 이내·10분당 순회 실행시간 20초부터 검증할 수 있습니다.
6. 예산을 넘기면 cursor를 다음 주기에 이어가고 DB별 `last_success_at`·미수집·부분 수집을 표시합니다.
7. `300 tables`는 **DB당인지 대상 전체인지 명시**합니다. 초기에는 대상 전체 상한이 안전합니다.

P3 namespace 작업이 같은 slow 레인에서 긴 쿼리를 잡고 있으면 Q·카운터를 지연시킵니다. 기존 2레인 설계에 넣을 수는 있지만 **우선순위와 작업 분할 없이 “동시 1”만 추가해서 해결되지는 않습니다.**

**G5·G7·G36 — 세 번째 승인 항목을 만들 것인가**

**GA에서는 만들지 않는 편을 추천합니다.**

선택 패키지를 정직하게 별도 표시하는 접근 자체가 잘못된 것은 아닙니다. 그러나 승인 항목이 두 개라는 약속과 별도 DB 변경 프로필은 서로 다른 도입 경로입니다. “기본 OFF”만으로 보안 심사·업그레이드·취약점 대응 책임이 작아지지는 않습니다.

특히 용어를 바로잡아야 합니다.

> “DB 측 객체 0개” 대신 **“MovesEye 전용 함수·뷰·프로시저·XE 세션 생성 없음”**이라고 쓴다.

PG Q 수집에는 기존 `pg_stat_statements` 설정·확장이 필요하고, 미구성 서버에는 재시작·확장 생성 승인이 필요합니다. 이 전제는 이미 설계에 있지만, 새 “객체 0개” 홍보 문구로 가려서는 안 됩니다.

국내 금융·공공에 대해 **SECURITY DEFINER를 일률적으로 허용하거나 금지하는 통합 기준은 미확인**입니다. 기관별 심사 결과를 단정할 수 없습니다. 기술적으로는 다음과 같이 평가하는 것이 합리적입니다.

- 임의 SQL 문자열을 받는 권한 상승 함수는 고정된 모니터링 뷰보다 검토 범위가 큽니다.
- superuser·업무 소유자 권한으로 실행하면 “모니터링 읽기 계정” 이상의 실행 능력을 위임합니다.
- owner·권한·고정 `search_path`·PUBLIC EXECUTE 철회·입력 문법·timeout·배포/삭제 절차를 제출해야 합니다.
- `EXPLAIN`도 잠금·계획 비용이 있고 PG에서는 계획 단계에 IMMUTABLE 함수가 평가될 수 있습니다. “ANALYZE를 빼면 아무 코드도 실행되지 않는다”는 보증은 성립하지 않습니다. [PG function volatility](https://www.postgresql.org/docs/17/xfunc-volatility.html)

따라서 **Oracle·MSSQL 캐시 플랜은 GA**, PG/MySQL 플랜 함수·완료/오류 XE·consumer 자동 토글은 **Q**가 적절합니다. 고객 요구가 확인되면 별도 변경 프로필을 설계합니다.

**G10 — OTel Java JDBC sqlcommenter**

**지원 여부는 확인됐습니다.** 공식 JDBC instrumentation README에 다음 옵션이 있습니다.

`otel.instrumentation.jdbc.experimental.sqlcommenter.enabled`

기본값은 `false`이며 tracing information을 SQL 주석으로 붙입니다. 문서 자체가 SQL 텍스트를 고유하게 만들어 DB 성능에 영향을 줄 수 있다고 경고합니다. [OTel JDBC instrumentation](https://github.com/open-telemetry/opentelemetry-java-instrumentation/blob/main/instrumentation/jdbc/README.md)

다만 아래는 별개입니다.

- MovesEye가 배포하는 Java Agent 버전에서 지원하는지: **이번 검토에서 미확인**.
- `service.name`·route를 원하는 형식으로 자동 주입하는지: **미확인**.
- prepared statement·connection pool·Oracle baseline·DB 프록시와의 호환성: 인증 필요.
- trace ID를 주석에서 읽는 것과 서비스별 Q 누적 통계를 정확히 나누는 것: 다른 문제.

Q24는 “기능 존재 조사”에서 **실제 배포 버전·전파 키·DB별 부작용을 검증하는 POC**로 바꾸면 됩니다.

**G24 — 라이선스 대상 상한**

**`maxDbTargets`를 별도로 정의하는 쪽을 권합니다. `maxHosts`의 의미는 바꾸지 않습니다.**

현재 코드에서 `MAX_HOSTS`는 자리만 있고 제품이 강제·표시하지 않는다고 명시되어 있습니다. [BE LicenseClaims](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/license/crypto/LicenseClaims.java:50), [라이선스 상태 DTO](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/license/api/dto/LicenseStatusResponseDto.java:14)

추천 단위는 **활성화된 논리 모니터링 대상**입니다.

| 구성 | 추천 계산 |
|---|---|
| PG 인스턴스 하나의 DB 50개 | 1 target. namespace 수집량은 별도 기술 상한 |
| Oracle CDB와 그 PDB들 | 1 target. PDB 범위·부하는 별도 관리 |
| RAC 노드별 동시 수집 | 노드별 target 계산 |
| primary·standby를 모두 수집 | 각각 계산 |
| 한 target의 failover endpoint 여러 개 | 동시에 한 노드만 수집한다면 1 |
| 발견 후보·비활성 대상 | 미계산 |
| 활성화됐지만 DOWN/AUTH_FAILED인 대상 | 계산. 장애를 이용한 상한 우회 방지 |

상한은 상업적 entitlement이고, 연결·행/초·디스크 예산은 기술적 admission control입니다. 두 가지를 혼합하지 않습니다.

변경 범위는 다음입니다.

- 발급기: 발급 요청·웹/CLI 입력·서명 클레임·발급 대장.
- BE: `LicenseClaims`·검증기·payload·저장/상태 모델·용량 판정·등록/활성화 및 폴러 admission.
- API/FE: 허용 수·사용 수·초과 이유 표시.
- 호환 정책: 기존 키의 클레임 누락, malformed 값, 0, 무제한 표현, 하향 갱신 처리.
- HA: 동시 활성화 요청의 원자적 상한 검사.
- 검증: 실제 발급 키를 BE가 읽는 종단 계약 확인.

**4파일 사본 규칙은 유지해야 합니다.** 다만 논리적으로 바뀌는 것은 우선 `LicenseClaims`이며, 기존 `Edition`·`Feature`·`LicenseType`에 새 enum 값을 억지로 추가할 이유는 없습니다. 네 계약 파일의 양쪽 일치를 확인해야 합니다. 현재는 패키지 위치가 달라졌으므로 README의 예전 경로를 그대로 복사하는 명령도 정본으로 삼으면 안 됩니다. [발급기 계약 규칙](C:/solutions/moveseye-license-issuer/README.md:90)

클레임을 넣는다면 **신규 키에는 명시적으로 발급**하되, 기존 키 누락을 갑자기 0으로 해석하면 안 됩니다. 누락 키의 호환 정책과 상한 초과 시 대상 선택 절차는 Q22에서 확정해야 합니다.

**G26 — custom_queries의 최소 가드**

**P3에서 시작한다면 “임의 SQL 편집기”보다 승인된 고정 쿼리 템플릿이 적절합니다.**

읽기 SQL도 데이터 유출·고비용 scan·함수 부작용·DB link·민감 카탈로그 접근을 일으킬 수 있습니다. Oracle 비용은 “custom query면 무조건 유료”가 아니라 **실제로 접근한 객체·기능**의 문제입니다. Datadog도 추가 비용 가능성을 경고합니다. [Datadog Oracle 설정](https://docs.datadoghq.com/database_monitoring/setup_oracle/selfhosted/)

도입 시 최소 가드는 다음입니다.

| 가드 | 최소 요구 |
|---|---|
| 승인 | DBM 관리자와 고객 DBA 검토, SQL 버전/hash 고정, 변경 시 재승인 |
| 권한 | 별도 최소 읽기 역할. Oracle 금지 객체를 읽을 권한 자체를 부여하지 않음 |
| 문법 | 단일 문장·허용된 SELECT 형태. 변경 CTE·다중 문장·동적 실행·승인되지 않은 함수/DB link 차단 |
| 객체 정책 | 금지 목록만이 아니라 owner·객체 허용목록 사용. view·synonym·함수의 간접 의존도 검토 |
| 실행 예산 | 초기 query timeout 1~2초 수준부터 검증, connect/socket timeout 별도, 취소 실패 연결 폐기 |
| 빈도·동시성 | 최소 60초 이상부터, 대상당 동시 1개, 대상·전역 총예산. 기본 수집보다 낮은 우선순위 |
| 결과 | 행·열·총 바이트·문자열 길이·태그 cardinality 상한. 행 상한은 서버 실행 비용 상한이 아님 |
| 값 의미 | metric type·unit·counter reset·NULL 처리 고정. SQL 변경 시 메트릭 의미의 버전 분리 |
| 실패 | 반복 초과 자동 중지, 오류 분류·감사. 실패를 0으로 저장하지 않음 |
| 보호 | 정의 SQL과 예외 메시지의 노출 통제, 결과에 업무 원문·PII를 담지 않도록 승인 |
| 사전 계획 검사 | 지원 엔진에서 DBA의 EXPLAIN 검토를 활용하되 **보안 경계나 비용 보증으로 사용하지 않음** |

임의 사용자 SQL의 EXPLAIN 자체에도 권한·계획 비용·함수 평가 문제가 있습니다. 따라서 모든 엔진에서 자동 EXPLAIN 사전 검사를 통과하면 안전하다고 판정하는 설계는 반대합니다.

---

**B. Claude가 놓친 격차 — G39+**

다음은 §1~§2의 기능·제약 중 §4에서 독립적으로 다루지 않았거나, 기존 제안만으로는 계약이 완성되지 않는 항목입니다.

| 추가 G | 누락된 내용 | 제안 단계와 판정 |
|---|---|---|
| **G39** | **동일 fingerprint의 호스트별 Rows/Query 비교** | 🟡 P3. `Σrows/Σcalls`를 호스트별로 비교하는 흐름 추가. rows는 returned/affected 등 엔진 의미가 다르며, 불균형을 샤딩 문제로 자동 단정하지 않음. |
| **G40** | **client IP·포트의 구조화된 축** | 🔴 GA-P1/P2. v1.1은 client host·client surrogate를 적었지만 IP·포트 구조는 미정. `client_address`, `client_port`, `client_hostname`, transport·가명화 정책을 구별. source가 없으면 NULL. |
| **G41** | **MSSQL Q·플랜의 실행 사용자 귀속 불가** | 🔴 P2. S에는 user가 있어도 Q에는 실행 user가 없을 수 있음. 공통 `userid`를 필수 필드로 만들거나 캐시 문맥 값을 실행 사용자로 채우지 않음. |
| **G42** | **샘플 duration 백분위의 의미** | 🔴 GA-P1·P3. 실행 중 elapsed를 반복 관측한 샘플의 p90/p99는 완료 실행 latency p90/p99가 아님. SQL·세션 편향과 추정량 명칭을 API·화면에서 구별. |
| **G43** | **샘플링 편향과 결정적 잘림의 차이** | 🔴 GA-P1. 주기 샘플은 자연스럽게 긴 실행을 더 자주 포착하고, 상한 우선순위는 추가 편향을 만듦. 진단용 우선 보존 결과를 전체 workload 분포로 외삽하지 않음. |
| **G44** | **Databases 목록의 triggered alerts 정렬** | 🟡 GA-P1b. 활성 알람 수·최고 심각도·블로킹 영향으로 정렬/필터 추가. 목록과 상세가 같은 활성 이벤트 집합을 사용. |
| **G45** | **MariaDB 전용 지원·제약 표** | 🔴 GA-P1b. MySQL과 별도로 버전·P_S 열·락·플랜 필드·복제·오류 카운터를 인증. 미지원 값을 0이나 MySQL 동일 지원으로 표시하지 않음. |
| **G46** | **부분 스키마 스냅샷의 변경 감지 계약** | 🔴 P3. max tables/columns·timeout·권한 변경·선택 DB 변경으로 사라진 객체를 DROP으로 판정하지 않음. snapshot completeness·수집 범위 버전 필요. |
| **G47** | **클러스터 합산의 지표별 규칙** | 🔴 P2·P3. 노드 합산이 가능한 값과 공유 스토리지·복제 대상·비율·지연을 구별. latency는 calls 가중, 비율은 분자/분모 재집계. |
| **G48** | **PG top-level·중첩 statement 중복 집계** | 🔴 GA-P1. `track=ALL` 권고 시 상위 호출과 내부 SQL 시간이 중첩될 수 있음. 지원 버전에서는 `toplevel` 문맥을 보존하고 Q 총량·점유율의 기본 집합을 정의. |
| **G49** | **Prebuilt DB 진단 대시보드** | 🟡 P3. 일반 위젯 제공과 엔진별 진단 preset은 다름. 복제·WAL/redo·temp·메모리 등 검증된 카탈로그를 사용한 기본 화면 묶음을 산출물로 명시. |

MSSQL 사용자 제약은 Datadog 공식 troubleshooting에도 명시되어 있습니다. `user`는 Query Activity·Database Load에는 제공되지만 Query Metrics·Plan Samples에는 제공되지 않습니다. [Datadog SQL Server 제약](https://docs.datadoghq.com/database_monitoring/setup_sql_server/troubleshooting/?lang_pref=en)

MariaDB 공식 문서는 별도 제약을 열거합니다. 지원 Agent는 7.61.0+이며, 플랜 JSON의 일부 필드·클러스터 태그·일부 메트릭이 MySQL과 다릅니다. “MariaDB 플랜 전체 미지원”도 틀린 일반화입니다. [MariaDB 설정](https://docs.datadoghq.com/database_monitoring/setup_mariadb/selfhosted/?lang_pref=en), [MariaDB 제약](https://docs.datadoghq.com/database_monitoring/setup_mariadb/troubleshooting/?lang_pref=en)

예상 후보 중 다음은 새 번호를 붙이지 않았습니다.

- **Oracle `MODULE/ACTION/CLIENT_IDENTIFIER`:** 이미 G10에 있습니다. P2 원생 필드 수집과 P3 서비스 해석을 분리하면 됩니다.
- **PG의 두 간격 규칙:** G34와 기존 checkpoint 계약의 보정입니다. “두 간격 모두 실행돼야만 델타가 존재”는 일반 법칙이 아닙니다. 첫 baseline 뒤 한 번 실행돼도 다음 관측에서 증가량이 생깁니다. Datadog 제품 동작 설명을 우리 폴러 제약으로 복사하면 안 됩니다.
- **PG `auto_explain` 로그 경로:** 누락된 JDBC 소스가 아니라 기존 비범위인 로그 수집 경로입니다. 모듈은 SQL 조회 함수를 제공하지 않고 서버 로그로 플랜을 내보냅니다. 현재 GA에서 비지원임을 명시하고, 추후 별도 프로필로 검토하면 됩니다. 파라미터 로그·실행 통계 overhead도 별도입니다. [PG auto_explain](https://www.postgresql.org/docs/17/auto-explain.html)

---

**C. 사실 오류·과장·설계 근거의 확실성**

| 주장 | 판정 | 수정할 내용 |
|---|---|---|
| **“Datadog도 RAC에서 GV$를 안 쓴다”** | 🔴 명백한 오류 | 공식 RAC 문서는 V$ 중심으로 노드별 수집하되 **필요한 경우 GV$를 조회**한다고 명시. “GV$ 최소화”로 정정. |
| **“RAC 노드마다 Agent가 필요”** | 🔴 표현 오류 | 노드별 모니터링 설정·접속이 필요하다는 뜻과 Agent 프로세스/설치가 노드마다 필요하다는 뜻을 구별. 공식 예시도 한 설정의 복수 node instance를 제시. |
| **system_health 폴백** | 🟢 확인됨 | 현재 공개 구현의 target 선택까지 인용해야 함. event_file 우선 경로를 누락하지 않음. |
| **system_health는 VIEW SERVER STATE만 필요** | 🔴 버전 누락 | SQL Server 2022+의 `VIEW SERVER PERFORMANCE STATE` 반영. |
| **2012·2014는 데드락 수집 불가** | 🔴 범위 오류 | Datadog 조회 SQL의 버전 제약. SQL Server 엔진의 deadlock XE 부재가 아님. |
| **PG 7.80+ schema 기본 ON** | 🟢 확인됨 | PG 탭에 한정하고 DBM/Data Observability 활성화 조건 명시. MovesEye 기본 ON의 근거로 자동 채택하지 않음. |
| **PG 통계·텍스트 때문에 모든 DB 접속 필요** | 🔴 오류 | relation/schema 로컬 작업과 서버 전체 statement 통계 분리. |
| **PG EXPLAIN에는 SELECT가 필요** | 🟡 핵심은 맞음 | SELECT 설명의 요약이며 DML·함수·schema·RLS 문맥까지 구별. |
| **Oracle 실제 row 통계는 statistics_level=ALL일 때만** | 🔴 오류 | `GATHER_PLAN_STATISTICS` 등 다른 수집 경로 존재. |
| **Agent 1개 ≤30 DB** | 🟡 과장 | 공식 문서는 권장 운영 규모이며 강제 제품 상한이 아님. |
| **CPU ~1%, Oracle 0.2%** | 🟡 조건 생략 | Agent CPU와 DB query CPU가 별도. 버전·간격·부하·하드웨어를 붙여야 함. |
| **예상 plan cost는 블록 수에 대응하는 공통 지표** | 🟡 과도한 단순화 | 엔진별 임의 비용 단위. 엔진 간 또는 서로 다른 optimizer 설정 간 직접 비교 금지. |
| **테이블·주석 추출은 이미 토큰이 있으니 저비용** | 🔴 비용 과소 | 명령 분류와 정확한 lineage·민감 태그 추출은 난도가 다름. |
| **Oracle custom_queries는 추가 비용 발생** | 🟡 인용 범위 주의 | 공식 문구는 가능성 경고. 임의 SELECT에 일률적 과금이라는 의미 아님. |
| **MySQL/MariaDB 동일 지원·동일 Agent 최저 버전** | 🔴 부정확 | MariaDB 별도 공식 지원표와 기능 제약 적용. |
| **“선택 패키지이므로 원칙 1과 충돌 해소”** | 🔴 제품 결정 누락 | 별도 승인 경로를 새로 만든다는 뜻. 현 전제에서 자동 확정할 사안 아님. |

RAC 정정은 해석 문제가 아닙니다. 공식 문구가 이미 **“필요한 경우에만 GV$”**라고 명시하고, grant 예시에도 `GV_$LOCK`이 있습니다. [Datadog RAC](https://docs.datadoghq.com/database_monitoring/setup_oracle/rac/), [Oracle grant 예시](https://docs.datadoghq.com/database_monitoring/setup_oracle/rds/)

PG 스키마 기본값은 공식 페이지와 changelog가 일치합니다. 따라서 이 항목을 “미확인”으로 낮출 필요는 없습니다. [Schema explorer](https://docs.datadoghq.com/database_monitoring/schema_explorer/), [Postgres changelog](https://github.com/DataDog/integrations-core/blob/master/postgres/CHANGELOG.md)

오버헤드 수치는 다음 조건이 빠졌습니다. 공식 벤치는 Agent를 EC2 `c5.xlarge`에서, DB를 RDS `db.m5.large`에서 실행했고, PG 샘플 주기는 해당 벤치에서 10초였습니다. Oracle 네트워크도 단일 “6KB/s”가 아니라 양방향 수치입니다. 현재 MovesEye의 5초 샘플링을 이 결과로 인증할 수 없습니다. [Datadog overhead](https://docs.datadoghq.com/database_monitoring/agent_integration_overhead/?tab=postgres), [30 DB 권장](https://docs.datadoghq.com/database_monitoring/troubleshooting/?tab=postgres)

문서 관리상으로도 조사 기록 첫머리는 결정을 “v1.2에 반영”했다고 적었지만 실제 검토한 설계 파일은 v1.1입니다. 검수 확정 전이면 해당 문구는 미래 작업으로 정정하고, 인용에는 **페이지·Agent/check 버전·가능하면 commit**을 남기는 것이 좋습니다.

---

**D. 종합 추천**

**1. v1.2에서 GA(P1a/P1b/P2)에 넣을 것 — 5개**

| 우선 | 작업 묶음 | 범위 |
|---|---|---|
| **1** | **엔진별 수집·권한 계약 확정** | G6·G7·G15·G16·G17·G18·G20·G33. 기본 전용 DB 객체 0, 캐시 플랜 지원표, 카운터/extra의 단위·버전·집계 방식 확정. |
| **2** | **PG 수집 범위·예산 및 Q 총량 정확성** | G8·G23·G25·G34·G48. 서버 Q 1회 수집, namespace 선택·순회 cap, Other 분모·nested 중복·cardinality 관리. |
| **3** | **MSSQL 실사용 진단 최소 세트** | G3·G6·G13·G41. 프로시저 통계, 기존 system_health deadlock, 복제 상태·queue, Q user 미가용 계약. |
| **4** | **원인 조사에 필요한 원생 문맥·운영 표시** | G1·G29·G30·G40·G44. 설정 스냅샷, 장기 실행, 블로커 영향, client 구조, 알람 우선 정렬. Oracle 원생 application 필드 포함. |
| **5** | **대상·토폴로지·라이선스 admission 계약** | G12·G24·G32·G45·G47. 노드/cluster membership의 최소 모델, VIP 지원 조건, MariaDB 별도 표, `maxDbTargets` 정책 확정 후 구현. |

이는 새 화면 다섯 개를 추가하자는 뜻이 아니라, 기존 흐름이 잘못된 값을 보여주지 않도록 **기존 어댑터·모델·목록을 완성하는 다섯 작업 묶음**입니다.

**2. P3로 둘 것**

- 선택 DB의 스키마·인덱스·FK 스냅샷과 제한된 객체 통계. 완전한 lineage·전 엔진 변형 비교는 후속 분리.
- 승인된 SQL 주석 태그 파싱과 신뢰도 있는 서비스 귀속.
- AG 상세 이력·복제 토폴로지 화면.
- SQL Server Agent Jobs·백업 age 선택 기능.
- 엔진별 진단 dashboard preset·Rows/Query 비교.
- 기존 플랜 변경·회귀 분석. 정확한 완료 latency 백분위가 없는 곳은 샘플 기반 지표로 명명.

**3. 비범위·Q로 남길 것**

- GA 비범위: PG/MySQL SECURITY DEFINER 플랜 패키지, 신규 XE 세션 배포, consumer 자동 변경 프로시저.
- Q: 임의 `custom_queries`, OTel SQL 주석 전파, PG 로그 기반 플랜 import/수집, 장기 인덱스 미사용 판정.
- P5·Q4: 별도 Oracle ASH 프로필.
- 기존 비범위 유지: Kill·자동 조치·추천.

**4. 새 Q 문구**

| Q | 제안 문구 | 추천 |
|---|---|---|
| **Q22** | DBM 상한을 `maxDbTargets`로 서명할 것인가? 활성 대상의 계산 단위, 기존 키 누락, 무제한 표현, 하향 갱신·초과 처리 정책은 무엇인가? | 별도 클레임 채택. 신규 발급 명시, 기존 키 호환 보장. |
| **Q23** | “미사용 인덱스” 대신 관측 구간·리셋·누락을 동반한 인덱스 사용 통계를 제공할 것인가? | P3 관측값만. 제거 판단 비범위. |
| **Q24** | 배포 중인 OTel Java Agent의 sqlcommenter 지원, 전파 키, prepared/cache·Oracle·프록시 영향을 어떤 조합으로 인증할 것인가? | 기능 존재는 확인. 버전 고정 POC 후 선택. |
| **Q25** | 사용자 정의 메트릭을 승인된 고정 SQL 템플릿으로 제한할 것인가, 임의 SQL까지 허용할 것인가? | 첫 단계는 템플릿만. 임의 SQL은 보류. |
| **Q26** | GA 자동 플랜을 Oracle·MSSQL 캐시에 한정하고 PG/MySQL 재계획은 별도 변경 프로필로 남길 것인가? | 한정 권고. 엔진별 차이 명시. |
| **Q27** | PG namespace의 기본 선택 수·테이블 cap·연결 수·순회 예산과 50 DB 인증 조건은 무엇인가? | 기본 선택 10 DB부터 검증. 전 DB 자동 활성화 금지. |
| **Q28** | 기본 system_health가 없는 환경의 deadlock은 미지원으로 둘 것인가, 고객 생성 XE를 별도 지원할 것인가? | GA 자체 호스팅 지원부터. 관리형 별도 인증. |
| **Q29** | RAC 노드별 V$ 수집에서 unresolved 원격 blocker를 허용할 것인가, 제한적 GV$ 보강까지 인증할 것인가? | Q3의 하위 검증 항목으로 관리. V$만으로 완전 지원 선언 금지. |
| **Q30** | cluster membership·지표별 합산·샘플 기반 분포의 정확도 계약은 무엇인가? | 합산 규칙과 추정 지표 명칭을 API 계약에 포함. |

Q29는 기존 Q3를 대체하지 않고 검증 범위를 구체화합니다. ASH는 기존 Q4를 유지합니다.

**5. Phase 공수 변화**

아래는 **설계 추정치**입니다. 위의 제한된 추천 범위, 기존 GA 토폴로지, 기존 20~30% 불확실성 반영 방식을 유지한 증감입니다. 전체 Claude 제안 일괄 채택 비용은 아닙니다.

| Phase | 순증 사람-일 | 주된 변화 |
|---|---:|---|
| P0 | **+2~4** | 권한·배포형태·PG 범위·샘플 의미 검증 추가 |
| P1a | **+3~6** | namespace 예산·Q 총량·cardinality·client 문맥. PG 플랜 패키지 제외 효과 반영 |
| P1b | **+2~4** | 설정·오류 카운터·MariaDB 인증·운영 표시 |
| P2 | **+10~16** | 프로시저·deadlock·AG 구체화·Oracle 뷰/RAC·사용자 가시성 |
| P3 | **+8~14** | 제한된 schema snapshot·태그·객체 통계·진단 preset |
| P4 | **+4~6** | 확장 지원표·50 DB·이벤트 유실·추가 보안/용량 검증 |
| **합계** | **+29~50** | **기존 270~355 → 약 299~405 사람-일** |

이 추정은 **라이선스 발급기까지 상한을 실제 강제하는 최소 구현을 포함**하며, 임의 SQL·권한 상승 패키지·완전한 schema lineage·완료/오류 XE·로그 플랜 수집은 제외합니다. 이를 모두 넣는다면 추가 **+20~40 사람-일 이상**을 별도 가설로 잡아 재산정해야 합니다.

저장 예산 150~200GB는 유지할 수 있지만, **카운터 확대·프로시저 통계·schema 이력을 기존 5~10GB 기타 quota 안에 무조건 흡수한다고 가정해서는 안 됩니다.** R4에 세 테이블군을 명시적으로 추가하고, 50 “대상”의 workload·namespace·객체 수를 함께 고정해야 합니다.