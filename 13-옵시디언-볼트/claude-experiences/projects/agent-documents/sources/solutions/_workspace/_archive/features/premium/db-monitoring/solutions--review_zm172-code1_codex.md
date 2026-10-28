**그대로 검수 통과시키기는 어렵습니다.** 실제 SQL 리터럴 누출, PG 권한 오판정, TLS 기본값 위반, 라이선스 형식 검증 우회가 확인됐습니다. 작업 이력으로 브랜치에 남기는 것은 가능하지만, 후속 수집·저장 구현의 안전한 기반으로 승인해서는 안 됩니다.

요청한 `84ca94c`·`62fdab3`의 파일을 기준으로 검수했습니다. 현재 HEAD는 각각 다른 해시지만 두 요청 커밋과 파일 트리는 동일했습니다. **파일 수정·빌드·Gradle 테스트는 하지 않았습니다.** 소스를 메모리에서 실행한 재현, JDBC mock, 로컬 pgjdbc 42.7.4·java-jwt 4.4.0 검사와 공식 소스 대조를 수행했습니다. 실제 DB·브라우저 E2E는 미확인입니다.

참고로 `SqlLiteralMaskerTest`는 **parameterized fixture 35개 + 일반 테스트 4개 = 39건**입니다. 기존 fixture 35개의 기대 출력은 메모리 실행에서 모두 일치했습니다. 아래 결함은 그 밖의 입력에서 재현됐습니다.

파일 위치는 다음을 기준으로 적었습니다.

- 마스킹: [collector/core/masking](C:/worktrees/zm-172-be/src/main/java/com/dmove/moveseye/premium/dbm/collector/core/masking)
- 접속: [collector/core/jdbc](C:/worktrees/zm-172-be/src/main/java/com/dmove/moveseye/premium/dbm/collector/core/jdbc)
- PG 검사: [PgCapabilityChecker.java](C:/worktrees/zm-172-be/src/main/java/com/dmove/moveseye/premium/dbm/collector/core/adapter/pg/PgCapabilityChecker.java)
- SPI: [collector/core/spi](C:/worktrees/zm-172-be/src/main/java/com/dmove/moveseye/premium/dbm/collector/core/spi)
- 발급기 파일은 별도 표시했습니다.

**1. 검수 결과**

🔴는 리터럴 누출·잘못된 분류·설계 계약 불일치에 해당합니다. 아직 실행 구현이 없는 SPI 공백은 현재 장애와 구분해 설명했습니다.

| # | 심각도 | 파일:행 | 지적 | 재현/근거 | 고칠 코드(핵심만) |
|---|---|---|---|---|---|
| 1 | 🔴 | `SqlLiteralMasker.java:297,503,507` | **유니코드 달러 태그 안의 문자열이 그대로 샌다.** | PG 입력 `SELECT $😀$private value$😀$` → 현재 **`OK`, 입력 그대로**. 기대 `SELECT ?`. 결합 문자 태그 `$á$private value$á$`도 동일. `Character.isLetterOrDigit(char)`는 PG lexer의 비ASCII 허용 범위와 다르다. | PG 전용 달러 태그 문자 규칙을 구현하고, 해석이 불확실한 `$...` 경로는 `FAILED`로 종료. 일반 식별자 판정 함수를 그대로 재사용하지 말 것. |
| 2 | 🔴 | `SqlLiteralMasker.java:325` | **바이너리·신규 숫자 표기에서 값 일부가 남는다.** | MySQL `SELECT 0b101010` → `SELECT ?b101010`, 기대 `SELECT ?`. PG 16+ `SELECT 1_234, 0b1010, 0o777` → `SELECT ?_234, ?b1010, ?o777`, 기대 `SELECT ?, ?, ?`. | 방언·버전별 숫자 토큰을 끝까지 소비. binary/octal/underscore 지원. |
| 3 | 🔴 | `SqlDialect.java:16,17`; `SqlLiteralMasker.java:114,217` | **서버 문자열 설정을 고정 가정해 리터럴이 샌다.** | PG `standard_conforming_strings=off`: `SELECT 'a\'secret\'b'` → **`SELECT ?secret\?`**, 기대 `SELECT ?`. MySQL `NO_BACKSLASH_ESCAPES`: `SELECT 'a\' AS x, 'secret' -- '` → **`SELECT ?secret?`**, 기대 `SELECT ? AS x, ?`. | 대상의 실제 문자열 설정을 scanner 옵션으로 전달. 세션별 설정을 확정할 수 없다면 모드에 따라 해석이 달라지는 입력은 폐기. |
| 4 | 🔴 | `SqlLiteralMasker.java:239`; `mask():62` | 잘린 Oracle q-quote가 `FAILED` 계약을 깨고 예외를 던진다. | `SELECT q'` → 현재 `StringIndexOutOfBoundsException`; 기대 `FAILED`, `text=null`, `fingerprint=null`, `UNTERMINATED_STRING`. `nq'`도 같은 경계. | `qQuote()` 시작에 `if (i >= n) throw new Unterminated(...)`. |
| 5 | 🔴 | `SqlLiteralMasker.java:43,465` | **marginalia 값 뒤의 일반 주석까지 저장한다.** | `SELECT 1 /*application:billing secret password=abcd*/` → text `SELECT ?`, tags **`{application=billing secret password=abcd}`**. 기대 tags `{application=billing}` 또는 해당 비정형 태그 폐기. 일반 주석 부분은 저장하면 안 된다. | marginalia 문법·값 종료 규칙을 명시하고 그 범위만 추출. 현재 `[^,]*` 제거. 승인 키만으로 값의 나머지 주석을 승인하지 말 것. |
| 6 | 🔴 | `SqlLiteralMasker.java:438`; `SqlCommandType.java:16` | 명령 유형을 잘못 분류한다. | PG `WITH update AS (SELECT 1) SELECT * FROM update` → 현재 `UPDATE`, 기대 `SELECT`. `update`는 허용되는 CTE 이름이다. PG `BEGIN`도 현재 `PROCEDURE`, 기대 `TRANSACTION`. | CTE 이름·컬럼 목록·본문을 건너뛴 뒤 본문 명령을 선택. `BEGIN`은 방언별 분류. |
| 7 | 🔴 | `PgCapabilityChecker.java:51` | **정상 권한 계정도 항상 `monitor=false`가 된다.** | SQL이 `pg_has_role(...)::text`이므로 참은 **`"true"`**다. 코드는 `"t"`와 비교한다. mock에서 정상 권한 응답을 주면 `S=MISSING`, `Q=MISSING`, `C=RECOMMENDED`. | `ResultSet.getBoolean()` 사용. 최소 수정은 `Boolean.parseBoolean(...)`. |
| 8 | 🔴 | `PgCapabilityChecker.java:52,76` | `MEMBER`를 실제 사용 가능한 권한으로 오인한다. | #7 수정 후 드러난다. `NOINHERIT` 계정도 `MEMBER=true`일 수 있다. 다른 사용자 세션이 없는 순간에는 hidden count가 0이라 `S=OK`를 줄 수 있다. 기대 실제 상속되지 않은 권한은 `MISSING`. | `pg_has_role(...,'USAGE')`로 유효 권한 검사. hidden count는 보조 증거로만 사용. |
| 9 | 🔴 | `PgCapabilityChecker.java:82,185` | 단위가 붙은 query-size 설정을 0으로 바꿔 권고를 누락한다. | `SHOW track_activity_query_size` 결과 `1kB` → `parseLong()`이 0 반환 → 현재 `S=OK`. 기대 `RECOMMENDED`와 현재 1024 bytes 표시. mock 재현 완료. | `pg_settings.setting`·`unit`을 읽거나 단위 변환. 파싱 실패를 실제 0으로 취급하지 말 것. |
| 10 | 🔴 | `PgCapabilityChecker.java:132` | 통계 수집이 꺼져 있어도 “Top SQL 수집 가능”으로 판정한다. | `pg_stat_statements.track=none`, `.max=10000`, `track_io_timing=on` → 현재 `Q=OK`. 기대 설정 누락/비활성 상태와 활성화 안내. `compute_query_id=off`도 확인하지 않는다. | `none`을 명시 분기. PG 14+ query-id 활성 조건도 검사. `DISABLED`가 제품 관리자 OFF만 뜻한다면 엔진 설정 누락에는 `MISSING` 사용. |
| 11 | 🔴 | `PgCapabilityChecker.java:121` | 확장 초기화 실패를 읽기 권한 문제로 잘못 안내한다. | 확장 객체는 있으나 preload가 안 된 경우 조회가 `55000` 등으로 실패한다. 현재 모든 예외를 “뷰를 읽을 권한이 없습니다”로 변환한다. mock 재현 완료. 기대 preload·재시작 안내. | `42501`, `55000`, `42P01`, 연결 실패 등을 구별해 원인별 상태·문구 생성. |
| 12 | 🔴 | `ConnectionSpec.java:45`; `DbmConnectionRequest.java:38`; `JdbcConnector.java:51` | **TLS 기본값이 §5.1과 다르다.** | 설계는 PG 기본 `verify-full`, 검증 ON이다. 현재 생략 시 `REQUIRE` → `sslmode=require`, 인증서·호스트 검증 없음. 예외적인 경고 경로도 없다. | 기본 `VERIFY_FULL`. `REQUIRE`는 명시적 선택과 경고를 동반하도록 계약화. |
| 13 | 🔴 | `JdbcConnector.java:29`; `ConnectionSpec.java:35` | **DB 이름으로 JDBC 속성을 주입해 TLS·타임아웃을 끌 수 있다.** | database=`postgres?sslmode=disable&socketTimeout=0&options=`. 요청 tls가 `VERIFY_FULL`이어도 pgjdbc 파싱 결과 **sslmode=disable, socketTimeout=0, options=빈 값**. 로컬 42.7.4에서 확인. | URL 구조 필드와 속성을 분리. DB 이름을 드라이버 규칙대로 인코딩하고 host도 구조 검증. URL 속성 주입을 허용하지 말 것. |
| 14 | 🔴 | `JdbcConnector.java:149` | 접속 실패 분류가 실제 실패 유형을 놓친다. | 아래 분류 재현표 참조. PG TLS 거부가 `NETWORK`, `SQLTimeoutException`이 `OTHER`, timeout 문구가 있는 `ConnectException`이 `NETWORK`, `nextException`의 인증 오류가 `OTHER`. | 엔진 문맥을 받고 typed exception·SQLSTATE·vendor code·cause·nextException을 순회. 깊이와 순환 방어 포함. |
| 15 | 🔴 | `LicenseKeyVerifier.java:140` | **형식 오류가 무제한 또는 다른 상한으로 통과한다.** | java-jwt 4.4.0: 문자열 `"10"`·`"abc"`·boolean·배열 → `asInt()==null`; `1.5→1`, `-0.5→0`, `4294967296→0`. 현재 음수 검사만으로 D17을 보장하지 못한다. | **누락만** 호환 허용. 존재하면 JSON 정수 타입·정수성·0 이상·Integer 범위를 엄격하게 검사. 명시적 null도 누락과 구별. |
| 16 | 🔴 | 발급기 `LicenseIssuerCore.java:64,119`; `LicenseIssuer.java:131,152`; `issue.html:165` | **신규 키 명시 필수라는 D17을 위반한다.** | 폼 공란·CLI 옵션 생략·`Request(...,null)` 모두 상한 없는 신규 키를 발급한다. “기존 키 누락 허용”을 “신규 발급 생략 허용”으로 확장했다. | 신규 `Request.maxDbTargets` 필수화, 폼 `required`, CLI 필수 옵션/프롬프트. 무제한 신규 상품이 필요하면 별도 표현을 설계에서 먼저 확정. |
| 17 | 🔴 | `BatchWriter.java:20` | **배치 계약에 시간·관측 노드·fencing 메타데이터가 빠져 있다.** | `policyVersion`은 있지만 `node_id`, 원시 채집 시각, offset·보정 버전·`clock_uncertain`, 해당 배치의 fencing token·generation이 없다. `CollectorClock`·`Lease`에 존재하는 값이 배치에 보존되지 않는다. §3.6·§5.1·§5.2 계약과 불일치. | 배치 metadata에 명시 필드 추가. tick 시점 snapshot을 배치와 함께 고정하고 재전송 때 변경하지 않기. |
| 18 | 🟡 | `SqlLiteralMasker.java:325` | 숫자와 식별자의 경계가 훼손된다. | MySQL `SELECT 123abc, t.123abc FROM t` → 현재 `SELECT ?abc, t?abc FROM t`; 기대 식별자 원형 유지. `.name`처럼 다음 글자가 문자인 경우는 보존되지만, 숫자로 시작하는 qualified identifier는 깨진다. | 방언별 숫자/식별자 우선순위 적용. `.`를 무조건 숫자의 일부로 탐욕 소비하지 말 것. |
| 19 | 🟡 | `SqlLiteralMasker.java:42,459,480,483` | 태그 경계·디코드·문자 길이 처리가 불완전하다. | `1application='secret'`에서 승인 키 `application`을 잘라 추출. `%ZZ`는 실패 후 원문 값 저장. SQLCOMMENTER 하나가 있으면 같은 주석의 marginalia 전부 무시. `a×127+😀`는 마지막 UTF-16 code unit이 `D83D`인 깨진 값으로 잘린다. | 키 경계 검증, 실패 태그 폐기, 형식 혼용 정책 명시, surrogate 경계 보정 또는 code point 기준 길이 제한. |
| 20 | 🟡 | `DbmCoreArchitectureTest.java:33,49` | 현재 의존은 깨끗하지만 테스트가 경계를 완전히 강제하지 못한다. | Jackson·다른 JDBC 구현·HTTP client 등이 blacklist 밖이다. JUL·`System.Logger`·직접 출력도 통과. `startsWith("…core")`는 `…coreevil`도 허용한다. | 현재 허용 집합인 JDK+정확한 core namespace 중심의 allowlist. 로깅/직접 I/O 규칙은 별도 명시. 패키지 비교는 `equals(core) || startsWith(core+".")`. |
| 21 | 🟡 | `BatchWriter.java:28,35` | `Map<String,Object>`는 wire·보호·멱등 계약을 컴파일 시점에 잃게 한다. | 원문 SQL·bind·임의 객체·잘못된 숫자 단위가 들어갈 수 있다. record도 rows/map의 불변성을 보장하지 않아 enqueue 뒤 변경 및 payload hash 불일치가 가능하다. `BatchQuality` 역시 문서의 품질 3축을 표현하지 못한다. | kind별 typed row와 명시 schema/version, 보호된 SQL 타입, immutable snapshot. 보호 검사는 실제 큐 진입 직전에 수행. |
| 22 | 🟡 | `CheckpointStore.java:28`; `BatchWriter.java:59` | 큐 append와 checkpoint 전진의 원자성을 인터페이스가 드러내지 않는다. | 두 메서드를 독립 호출하면 crash 사이에 배치 또는 baseline 한쪽만 남을 수 있다. Javadoc의 “한 fsync”만으로 구현을 묶을 수 없다. | `append(batch, checkpointDelta)` 등 공통 durable commit 경계 또는 명시 복구 프로토콜. 아직 구현이 없어 실제 손실 여부는 미확인. |
| 23 | 🟡 | `ConfigSource.java:35`; `CollectorClock.java:13` | snapshot 불변식과 원자적 clock capture가 없다. | Denial과 실행 설정을 함께 넣을 수 있다. config snapshot에 assignment generation이 없다. now/raw/offset/version을 개별 호출하면 보정 갱신 사이의 서로 다른 상태를 조합할 수 있다. | 허용/거부 결과를 분리하거나 생성자 불변식 검증. `ClockReading capture()` 형태로 시각·보정 snapshot 제공. |
| 24 | 🟡 | `PgCapabilityChecker.java:114,156` | 제한 계정·버전별 capability를 충분히 확인하지 않는다. | 확장 미설치 시 `SHOW shared_preload_libraries`가 권한 오류면 Q가 `ERROR`가 된다. C는 database/bgwriter count만 확인하고 replication·wal·io 가능을 안내한다. PG17 checkpointer 검사는 없다. | 제한된 설정 조회 실패를 독립 처리. 실제 사용하는 view/column과 버전별 capability 검사. 검사하지 않은 기능까지 “가능”으로 쓰지 말 것. |
| 25 | 🟡 | `CapabilityItem.java:32`; `CapabilityReport.java:37` | S·C·L 전체 필수 및 등록 차단은 설계에서 명시적으로 확인되지 않는다. | v2.1은 필수/권고 분리를 요구하지만, 해당 세 등급을 전부 필수로 고정하는 표는 찾지 못했다. “MISSING이면 해당 탭 OFF”와 “등록 불가”도 다른 정책이다. 빈 items에는 `requiredSatisfied()==true`. | 등급별 필수 정책을 설계·계약서에 고정. 필요한 등급의 존재와 유일성도 검사. 현재 컨트롤러가 실제 등록을 막는 것은 아니다. |
| 26 | 🟡 | `JdbcConnector.java:94,104`; `ConnectionSpec.java:56` | 비밀번호 삭제의 보장 수준을 과하게 설명한다. | `props.remove()`는 참조만 제거한다. 생성된 `String`과 드라이버 내부 복사본은 지우지 못한다. `test()`의 finally는 open 실패에도 char[]를 지우지만, 직접 `open()`을 부르는 계약은 호출자 책임이다. | “원본 char[] zeroize, String 복사본의 즉시 삭제는 보장하지 못함”으로 명시. 호출자 finally를 유지. |
| 27 | 🟡 | `DbmConnectionRequest.java:22,49,57` | `toString()`만으로 요청 비밀번호 보호를 보장할 수 없다. | String 원본은 남고, Jackson 직렬화·request body logging은 `toString()`을 거치지 않는다. 현재 password Swagger 예시나 명시적 body logger는 발견하지 못했지만, 인프라 로그는 미확인. 검증 실패 시 생성된 char[] 처리도 점검 필요. | password에 `WRITE_ONLY`·Schema `WRITE_ONLY/password`, body logging 제외 정책과 검증. `toString` 제외는 유지. |
| 28 | 🟡 | `DbmTargetToolController.java:41`; `DbmErrors.java:13`; `ErrorCode.java:870` | 접속 실패 응답 계약과 DBM 오류 enum이 이중으로 존재한다. | 현재 접속 실패는 `success/code=200/data.ok=false`. `DBM_AUTH_FAILED`·`DBM_CONNECTION_FAILED`는 사용되지 않는다. 주석의 “400/503이면 FE 분기 축이 사라진다”는 사실이 아니다. errorCode/data로도 분기 가능하다. | 도구 실행 결과와 API 실패를 명확히 구별해 계약서에 고정. 미사용 enum은 용도 명시 또는 정리. DB 인증 오류를 실제 HTTP 401로 바꾸지 말 것. |
| 29 | 🟡 | `DbmTargetToolController.java:37,58` | 임시 관리자 게이트의 종료 조건을 코드 주석 외에 고정해야 한다. | 현재 admin은 DBM 권한 없이 가능하고, 위임받은 DBM 운영자는 불가능하다. 권한 검사 자체는 접속보다 먼저 수행한다. | DBM 권한 좌표·backfill이 들어오는 **WS-1의 같은 변경**에서 `requireEdit(DB_MONITORING)`로 교체하고 권한 조합 테스트. |
| 30 | 🟡 | `premium/dbm/package-info.java:8,23`; 설계 §17.2 | `api/` 배치는 일반 패키지 규칙과 설계 골격이 충돌한다. | §0.5는 기능 하위 레이어 분할을 피하라고 하지만 §17.2는 명시적으로 `api/`를 제시한다. package-info는 파이프라인 분할 근거를 설명하므로 단순 위반으로 단정하기 어렵다. | 현재 도구는 `target/`에 둘 수 있다. `api/`를 유지한다면 설계상 예외임을 명시하고 전체 DBM DTO 집합으로 커지지 않게 제한. |
| 31 | 🟡 | `engine-api/.../ErrorCode.java:864`; 설계 §17.2 | “engine-api 무수정” 문구와 실제 변경이 다르다. | 다만 모듈 가이드는 `common/exception`을 engine 계약이 아닌 **이동된 app 레거시 커널**로 명시하고, GPU/APM도 같은 선례다. 수집 포트 침범은 아니다. | 설계의 무수정 범위를 engine 포트·계약으로 한정하고 공용 오류 enum 예외를 기록. |
| 32 | 🟡 | `JdbcConnector.java:68,75` | 후속 엔진 TLS 구현은 아직 완성되지 않았다. | MSSQL REQUIRE 조합은 맞지만 VERIFY_CA와 FULL이 모두 호스트 검증까지 수행한다. Oracle은 tls 값과 무관하게 TCP URL이다. **현재 두 엔진은 unavailable이라 실행되지는 않는다.** | 지원 모드 의미를 명시하고 Oracle TCPS·truststore 구현 전 available을 켜지 말 것. |
| 33 | 🟢 | `DbmTargetToolController.java:44`; `LicenseArchitectureTest.java:113` | premium 컨트롤러의 현재 기본 경계는 맞는다. | premium 내부, `@RequiresFeature(DB_MONITORING)`, `@VisitorIdCheck`, `ApiResult` 사용. app repository 직접 참조 없음. A2~A4에 어긋나는 의존은 발견하지 못했다. | 유지. 다만 전체 ArchUnit 실행 통과를 확인한 것은 아니다. |
| 34 | 🟢 | `LicenseKeyPayload.java:32`; 라이선스 테스트 4개 | payload 생성자 변경 누락과 계약 상수 drift는 발견하지 못했다. | 확인된 생성자 호출 7곳 모두 11인자 형태로 갱신. `LicenseClaims`는 package 선언 제외 동일. 양쪽 ContractTest의 **검증 내용은 동일**하지만 AssertJ/JUnit 문법·주석은 다르다. | 형식 오류·0·실제 발급 키 왕복 테스트 추가. |
| 35 | 🟢 | `License.java:49`; `SignedKeyLicenseProvider.java:144` | maxDbTargets snapshot 컬럼이 없는 것 자체는 현재 결함이 아니다. | 서명 키 원문이 저장되고 provider가 재검증한다. DB 컬럼을 정본으로 삼지 않는 기존 원칙에 맞는다. 다만 현재 공개 LicenseStatus에는 상한이 전달되지 않는다. | 후속 admission/usage API에서 검증된 상한을 제공. 키 교체와 활성화 검사는 동일 잠금 경계로 연결. |

PG의 비ASCII 달러 태그와 숫자 표기는 PostgreSQL의 실제 [lexer 소스](https://raw.githubusercontent.com/postgres/postgres/REL_17_STABLE/src/backend/parser/scan.l)와 대조했습니다. MySQL의 `0b`는 공식 [bit literal 문법](https://dev.mysql.com/doc/refman/8.0/en/bit-value-literals.html)이며, 숫자로 시작하는 식별자도 [허용되는 문법](https://dev.mysql.com/doc/refman/8.0/en/identifiers.html?ff=nopfpls)입니다.

PG boolean의 `"t"` 출력과 `boolean::text`의 `"true"` 출력은 서로 다릅니다. 이는 [booltext 구현](https://raw.githubusercontent.com/postgres/postgres/REL_17_STABLE/src/backend/utils/adt/bool.c)에 명시돼 있습니다. `MEMBER`와 `USAGE`의 차이도 [공식 권한 함수 문서](https://www.postgresql.org/docs/16/functions-info.html)에 설명돼 있습니다.

**마스킹 재현에서 구분해야 할 사항**

사용자가 지정한 의심 입력 중 다음은 현재 구현이 올바르게 처리합니다. 이를 결함으로 계산하지 않았습니다.

| 입력/조건 | 현재 결과 | 판정 |
|---|---|---|
| PG `SELECT E'a\\' AS v, 'secret'` — SQL 원문에 backslash 두 개 | `SELECT ? AS v, ?` | backslash 짝수 개 뒤 quote 종료를 올바르게 처리 |
| PG `SELECT E'a\'secret'` | `SELECT ?` | escaped quote 처리 정상 |
| MySQL `SELECT "a\"b", 'it''s'` | `SELECT ?, ?` | 기본 SQL mode에서 정상 |
| MSSQL `SELECT [a]]b]` | 식별자 그대로 | `]]` escape 처리 정상 |
| Oracle `q'!it's a secret!'`, `nq'!hi' secret!'` | 각각 `?` | 기본 대응 구분자도 처리 정상 |
| `$1`, `:1`, `@p`, `?` | 그대로 | 확인한 정상 bind/변수 입력에서 숫자 리터럴로 바뀌지 않음 |
| PG `$1$secret$1$` | `FAILED` | `$1$`는 유효한 PG 달러 태그가 아님. “숫자 태그 문자열 누출”로 분류하면 오탐 |
| PG `$a$b$secret$a$b$` | `?b$` | 실제 구분자는 `$a$`다. 뒤의 `b$`는 문자열 밖의 토큰이므로 전체를 하나의 태그로 보면 안 됨 |
| PG·MSSQL 중첩 블록 주석 | 전체 제거 | 두 방언 모두 nested comment 지원 |
| MySQL·Oracle 중첩처럼 보이는 주석 | 첫 `*/`에서 종료 | 해당 방언에 nested comment를 적용하지 않는 것은 맞음 |
| 한글 식별자 `한글열`, `값` | 그대로 | 일반 한글은 `Character.isLetter`로 처리됨. 문제는 그보다 넓은 PG lexer 문자 범위 |
| 문자열 안의 여러 공백 | 문자열 전체를 `?`로 치환 | 마스킹 뒤 바깥 공백 정규화가 문자열 값을 훼손하는 문제는 없음 |
| `WITH x AS ((SELECT 1)) UPDATE ...` | `UPDATE` | 정상 중첩 괄호의 깊이 계산은 맞음. #6은 깊이 0의 **CTE 이름을 명령으로 읽는 오류** |

`$1$`처럼 잘못된 입력이 모두 폐기되는 것은 아닙니다. 예를 들어 `SELECT $1$`는 현재 `OK`로 남습니다. 다만 이 scanner는 완전한 SQL parser가 아니므로 모든 문법 오류 검증을 요구하기보다는, **리터럴 경계가 불확실한 숫자·달러 토큰을 안전하게 폐기하는 범위**를 명확히 정하는 것이 좋습니다.

**JdbcConnector 분류 재현 및 드라이버 대조**

| 입력 예외 | 현재 분류 | 기대 |
|---|---|---|
| `SQLException("The server does not support SSL.", "08004")` | `NETWORK` | `TLS` |
| `SQLTimeoutException("Login timed out", "HYT00")` | `OTHER` | `TIMEOUT` |
| `SQLException("Connection timed out","08001", new ConnectException("Connection timed out"))` | `NETWORK` | `TIMEOUT` |
| 바깥 `HY000`, `nextException`에 `28000/1045` | `OTHER` | `AUTH` |

첫 번째는 합성 입력만의 문제가 아닙니다. pgjdbc는 서버가 TLS를 거부할 때 SSLException 원인 없이 `08004`인 PSQLException을 발생시키는 [실제 경로](https://raw.githubusercontent.com/pgjdbc/pgjdbc/REL42.7.4/pgjdbc/src/main/java/org/postgresql/core/v3/ConnectionFactoryImpl.java)가 있습니다. 원인 체인 우선 자체가 잘못이라기보다, **특정 원인을 발견하자마자 반환하고 나머지 증거를 버리는 방식**이 문제입니다.

드라이버 관련 나머지 판정은 다음과 같습니다.

- **PG 속성 이름은 맞습니다.** `loginTimeout`, `options`, `readOnly`, `ApplicationName`은 pgjdbc 42.x의 실제 속성입니다. 다만 `readOnly`는 계정 권한이나 SQL 허용목록을 대신하지 않습니다. URL 속성이 Properties보다 우선하는 것도 [공식 계약](https://jdbc.postgresql.org/documentation/use/?lang=en)입니다.
- **MariaDB 3.x 값도 맞습니다.** `disable`, `trust`, `verify-ca`, `verify-full`을 지원합니다. `trust`는 암호화만 하고 서버 신원을 검증하지 않습니다. [MariaDB TLS 문서](https://mariadb.com/docs/connectors/mariadb-connector-j/using-tls-ssl-with-mariadb-java-connector)
- **MSSQL REQUIRE 조합은 맞습니다.** `encrypt=true;trustServerCertificate=true`는 검증 없는 암호화입니다. false로 두면 서버 이름 검증도 수행하므로 현재 VERIFY_CA는 사실상 FULL에 가깝습니다. [Microsoft JDBC TLS 문서](https://learn.microsoft.com/en-us/sql/connect/jdbc/understanding-ssl-support?view=sql-server-ver17)
- **MySQL 1045/28000은 맞습니다.**
- **MSSQL 18456의 SQLSTATE를 S0001 하나로 고정하면 안 됩니다.** Microsoft JDBC 기본 경로는 서버의 error state에 따라 `Sxxxx`를 구성하며, XOPEN 모드에서는 `08001`로 매핑합니다. 현재 구현은 error code 18456을 확인하므로 이 부분은 처리하지만 테스트의 S0001 하나로 드라이버 동작을 검증했다고 볼 수 없습니다. [Microsoft JDBC 구현](https://raw.githubusercontent.com/microsoft/mssql-jdbc/v12.8.1/src/main/java/com/microsoft/sqlserver/jdbc/SQLServerException.java)
- **Oracle 12514는 vendor code로 분류하는 현재 접근이 맞습니다.** 서비스 미등록이라는 의미도 맞습니다. 다만 실제 번들 예정 ojdbc 버전의 SQLState가 항상 66000인지에 대한 실연동 검증은 **미확인**입니다. 현재 테스트는 직접 만든 SQLException이므로 이를 인증하지 못합니다. [Oracle ORA-12514 설명](https://docs.oracle.com/en/database/oracle/oracle-database/26/netag/ora-12514-listener-does-not-currently-know-service-requested-connect-descriptor.html)

**PG capability에서 추가로 주의할 점**

`SHOW pg_stat_statements.track`의 예외는 바깥 catch에서 처리되므로 그대로 컨트롤러까지 전파되지는 않습니다. 그러나 “예외가 안 난다”와 “올바른 원인·상태를 준다”는 다릅니다. 현재는 앞선 count 실패를 전부 권한 문제로 바꿔 실제 미로드 원인을 가립니다.

`<insufficient privilege>` 카운트는 **현재 존재하는 다른 세션이 가려졌다는 양성 증거**로는 쓸 수 있습니다. 0이라는 결과는 권한이 충분하다는 증거가 아닙니다. 또한 query text가 숨겨지는 원인이 권한 이외의 소스 상태인지도 분리해야 합니다.

`pg_stat_statements.track=all`일 때 PG14+의 `toplevel`을 언급하는 방향은 맞습니다. 다만 서버 버전만으로 설치된 extension view schema까지 확정하지 말고 실제 컬럼을 확인하는 편이 안전합니다. `track=none`, query-id 비활성 조건은 현재 빠져 있습니다. [PG 통계 확장 문서](https://www.postgresql.org/docs/16/pgstatstatements.html)

PG17에서 `pg_stat_bgwriter` 자체가 사라진 것은 아닙니다. 따라서 현재 `count(*)`가 PG17 때문에 즉시 깨진다고 지적하면 오탐입니다. **checkpointer 지표가 별도 view로 이동했는데 검사 범위와 안내가 이를 반영하지 못한다**는 것이 정확한 지적입니다. [PG17 통계 view](https://www.postgresql.org/docs/17/monitoring-stats.html)

**API·라이선스·규약 판단**

접속 테스트가 HTTP 200 + 성공 envelope + `ok=false`를 반환하는 선택은 **가능합니다**. “접속 테스트 작업은 완료됐고 대상 접속이 실패했다”는 모델로 일관되게 계약하면 됩니다. 현재 FE axios의 자동 refresh도 실제 HTTP 401을 기준으로 하므로 body 401만으로 refresh가 발생한다고 단정할 수 없습니다.

다만 이 기능의 계약서는 확인한 DBM 폴더에 없었습니다. FE에는 다음 두 응답을 분명히 구분해 전달해야 합니다.

- API 입력·라이선스·권한 오류: `status=error`, body code/errorCode.
- 정상 실행된 접속 테스트의 실패: `status=success`, `data.ok=false`, `failure`, 안전한 message.

존재 여부 노출은 HTTP 200 여부로 해결되지 않습니다. 현재 관리자·라이선스 검사가 접속보다 먼저라 즉각적인 비인가 노출은 발견하지 못했습니다. DBM 위임 권한으로 전환할 때도 이 순서를 유지하고, 접속 진단을 볼 수 있는 권한 범위를 함께 고정해야 합니다.

라이선스 형식 검증은 특히 우선 수정해야 합니다. java-jwt의 [4.4.0 `asInt()` 구현](https://raw.githubusercontent.com/auth0/java-jwt/4.4.0/lib/src/main/java/com/auth0/jwt/impl/JsonNodeClaim.java)은 숫자가 아닌 클레임에 예외를 던지지 않고 null을 반환합니다. 로컬 JAR에서도 다음을 확인했습니다.

| 서명 payload의 `maxDbTargets` 값 | `asInt()` 결과 | 현재 검증 결과 | D17 기대 |
|---|---:|---|---|
| 누락 | null | 제한 없음 | 허용 |
| `"10"` / `"abc"` | null | 제한 없음 | 거부 |
| `true` / `[]` / `null` | null | 제한 없음 | 형식 오류 거부 |
| `1.5` | 1 | 상한 1 | 거부 |
| `-0.5` | 0 | 상한 0 | 거부 |
| `4294967296` | 0 | 상한 0 | 범위 오류 거부 |
| `0` | 0 | 상한 0 | 허용 |
| `-1` | -1 | 거부 | 거부 |

이는 임의 사용자가 서명을 위조할 수 있다는 뜻은 아닙니다. **유효하게 서명된 잘못된 형식의 키를 제품이 안전하게 거부하지 못한다**는 문제입니다.

발급기 OGNL의 `!= null ? ... : ...` 삼항식은 0을 공란으로 취급하지 않으므로 적절합니다. 새 삼항식 자체의 문법 결함은 발견하지 못했으며 템플릿 렌더링 실검증은 미확인입니다. CLI의 잘못된 정수·범위 초과는 예외로 발급을 중단하므로 무제한으로 조용히 바꾸지는 않습니다. 다만 `--db-targets`만 주면 `"true"`가 들어가 stack trace로 종료되는 등 사용자 오류 처리가 거칠습니다. compact 생성자의 음수 검증은 적절하지만 **신규 null 금지 조건이 빠졌습니다.**

테스트 패키지는 새 DBM 테스트 세 개 모두 프로덕션 경계와 맞습니다. 라이선스 crypto 테스트가 상위 `license`에 있는 것은 기존 배치 부채이며 이번 필드 추가로 새로 생긴 문제는 아닙니다. 한국어 주석은 전반적으로 의도와 Phase를 잘 설명하지만, 아래 문장은 수정해야 합니다.

- “형식 오류는 `asInt()`가 던지는 RuntimeException” — 실제 동작과 다름.
- “임시 접속 뒤 비밀번호를 지운다” — String·드라이버 복사본까지 지운다는 인상을 줌.
- “400/503이면 FE 분기 축이 사라진다” — 사실과 다름.
- `rawHash`의 “원문 복원 불가” — 저엔트로피 입력의 사전 추측까지 막는 보장은 아니므로 “원문 대신 hash만 저장”이 정확함.

**2. fixture 보강 제안**

아래는 SQL 원문 표기입니다. Java 테스트 문자열에서는 backslash를 한 번 더 escape해야 합니다. `FAILED`는 `text=null`, `fingerprint=null`, 실패 사유 존재를 뜻합니다.

| 방언 | 입력 | 기대 | 이유 |
|---|---|---|---|
| PG | `SELECT E'a\\' AS v, 'secret'` | `SELECT ? AS v, ?` | backslash 짝수 개 뒤 quote |
| PG | `SELECT E'a\'secret'` | `SELECT ?` | escaped quote와 끝 quote |
| PG | `SELECT $😀$private value$😀$` | `SELECT ?` | 실제 PG 태그 문자 범위, 현재 누출 |
| PG | `SELECT $á$private value$á$` — `a` 뒤 U+0301 | `SELECT ?` | 결합 문자 태그, 현재 누출 |
| PG | `SELECT $한글$비밀 값$한글$` | `SELECT ?` | 한글 태그 정상 경로 |
| PG 16+ | `SELECT 1_234, 0b1010, 0o777, 0x_FF` | `SELECT ?, ?, ?, ?` | 신규 정수 표기 전체 마스킹 |
| PG | `SELECT $1, :1, @p, ?, 42` | `SELECT $1, :1, @p, ?, ?` | bind 보존과 실제 숫자 구별 |
| PG | `WITH update AS (SELECT 1) SELECT * FROM update` | text `WITH update AS (SELECT ?) SELECT * FROM update`, type `SELECT` | CTE 이름 오분류 |
| PG | `WITH x AS ((SELECT 1)) DELETE FROM t USING x` | text `WITH x AS ((SELECT ?)) DELETE FROM t USING x`, type `DELETE` | 괄호 깊이 회귀 방지 |
| PG, strings OFF | `SELECT 'a\'secret\'b'` | `SELECT ?` 또는 해당 모드 미지원 시 `FAILED` | 모드 불확실 입력의 누출 방지 |
| MySQL | `SELECT 0b101010, b'101', X'FF'` | `SELECT ?, ?, ?` | prefix binary와 quoted binary 비교 |
| MySQL | `SELECT "a\"b", 'it''s'` | `SELECT ?, ?` | double quote escape와 doubled quote |
| MySQL | `SELECT 123abc, t.123abc FROM t WHERE v=.5` | `SELECT 123abc, t.123abc FROM t WHERE v=?` | 숫자 시작 식별자·점 경계 |
| MySQL | `SELECT 1e FROM t` | `SELECT 1e FROM t` | 불완전 지수처럼 보이는 허용 식별자 |
| MySQL | `SELECT _utf8mb4'비밀', @p1, ?` | `SELECT _utf8mb4?, @p1, ?` | 문자셋 introducer와 변수 |
| MySQL, NO_BACKSLASH_ESCAPES | `SELECT 'a\' AS x, 'secret' -- '` | `SELECT ? AS x, ?` 또는 `FAILED` | 현재 `secret` 누출 재현 |
| MySQL | `SELECT /* outer /* inner */ 'secret'` | `SELECT ?` | 첫 종료자로 끝나는 비중첩 주석 |
| MSSQL | `SELECT [a]]b], N'비밀'` | `SELECT [a]]b], ?` | escaped bracket 식별자 |
| MSSQL | `SELECT [a]]b` | `FAILED` | escape 뒤 식별자 미종료 |
| MSSQL | `SELECT 0x, 0x00FF, @p1` | `SELECT ?, ?, @p1` | 빈 binary와 정상 binary |
| MSSQL | `/* outer /* inner */ still */ SELECT 'secret'` | `SELECT ?` | MSSQL 중첩 주석 |
| MSSQL | `SELECT N'it''s', @p, ?, 12` | `SELECT ?, @p, ?, ?` | Unicode literal·bind·숫자 |
| MSSQL | `BEGIN TRANSACTION` | text 유지, type `TRANSACTION` | BEGIN 방언별 분류 |
| Oracle | `SELECT q'!it's secret!', nq'!한글!' FROM dual` | `SELECT ?, ? FROM dual` | 임의 구분자·national q-quote |
| Oracle | `SELECT q'(a ' b)', q'<x>' FROM dual` | `SELECT ?, ? FROM dual` | 대응 구분자와 내부 quote |
| Oracle | `SELECT q'` | `FAILED` | 현재 IndexOutOfBounds 경로 |
| Oracle | `SELECT nq'` | `FAILED` | national q-quote 경계 |
| Oracle | `SELECT :1, :name, 1.2e-3, N'비밀' FROM dual` | `SELECT :1, :name, ?, ? FROM dual` | 숫자 bind와 지수 literal |
| Oracle | `SELECT "한글""열", 'a  b' FROM dual` | `SELECT "한글""열", ? FROM dual` | quote 식별자·문자열 내부 공백 |
| Oracle | `SELECT /* outer /* inner */ 'secret' FROM dual` | `SELECT ? FROM dual` | Oracle 비중첩 주석 |

태그·실패 정책 fixture도 별도로 필요합니다.

| 방언 | 입력 | 기대 | 이유 |
|---|---|---|---|
| 공통 | `SELECT 1 /*application:billing secret password=abcd*/` | text `SELECT ?`; tags `{application=billing}` 또는 비정형 태그 폐기 | 주석 나머지 미보존 |
| 공통 | `SELECT 1 /*1application='secret'*/` | tags `{}` | 승인 키의 부분 문자열 매칭 금지 |
| 공통 | `SELECT 1 /*application='%ZZ'*/` | text `SELECT ?`; 해당 태그 폐기 | decode 실패 시 원문 보존 금지 정책 |
| 공통 | `SELECT 1 /*application='%FF'*/` | 해당 태그 폐기 | 잘못된 UTF-8의 replacement 문자 수용 여부 |
| 공통 | `SELECT 1 /*application='x',controller:y*/` | 혼용 지원 시 두 태그, 미지원 시 명시된 폐기 결과 | 현재 조용한 형식 우선순위 고정 방지 |
| 공통 | application 값이 `a×127 + 😀` | 깨진 surrogate 없음 | 기존 UTF-16 길이 상한 유지 시 `a×127`; code point 상한 채택 시 emoji까지 보존 |
| PG | `SELECT 1e` | `FAILED` 정책 권고 | 잘린 지수와 식별자 조각 구별 |
| PG | `SELECT 0xG` | `FAILED` 정책 권고 | 잘못된 radix 값의 조각 보존 방지 |

기존 `RESIDUE` 정규식은 #2의 `?b1010`, `?_234`를 잡지 못합니다. 문자·underscore 뒤 숫자를 식별자 일부로 제외하기 때문입니다. **정규식 보호망만 확대하기보다 입력 토큰별 기대 출력과 비밀 sentinel 잔존 검사를 함께 두는 편이 좋습니다.** escaped identifier 제거용 테스트 정규식도 실제 tokenizer와 동등한 검증기는 아닙니다.

**3. 종합 및 다음 커밋 순서**

**이 커밋은 작업 이력으로 남겨도 되지만, 수정 없이 검수 완료로 표시하거나 수집·저장 경로에 연결하는 것은 승인하지 않습니다.** 인터페이스 6종을 먼저 분리하고 PG 전용 클래스를 직접 참조하지 않은 방향은 적절합니다. 다만 그 경계 안의 보호·분류 계약이 아직 안전하지 않습니다.

다음 순서로 고치는 것이 좋습니다.

1. **마스킹 누출 차단:** 유니코드 달러 태그, binary·radix·underscore 숫자, 문자열 모드 차이, 주석 태그의 일반 텍스트 보존. Oracle 잘린 입력도 반드시 `FAILED`로 수렴.
2. **라이선스 검증·발급 정책:** JSON 타입·정수성·범위 엄격 검증, 신규 발급 상한 필수화. 0·누락·문자열·소수·초과 정수의 실제 서명 키 테스트.
3. **접속 보안:** 기본 VERIFY_FULL, URL 속성 주입 차단, TLS/timeout 실패 분류 수정.
4. **PG capability:** `"true"` 오류부터 수정한 뒤 USAGE, 단위 파싱, track/query-id/preload 원인 분류와 제한 계정 테스트.
5. **SPI 계약 보강:** 배치의 node·lease·clock metadata, immutable typed rows, 큐/checkpoint durable 경계. 후속 폴러 구현 전에 닫아야 합니다.
6. **API 계약·권한·문구 정리:** 도구 실패 응답을 계약서에 고정하고, WS-1 권한 도입과 함께 임시 admin 게이트를 교체.

이번 검수에서 저장 직전 검사, 금지 bind 소스 차단, 큐·로그 원문 0, 메모리/파일 구현만의 코어 구동을 완료했다고 판단하지는 않았습니다. 해당 실행 경로가 아직 없는 **첫 코드 조각의 후속 DoD**로 남아 있습니다.