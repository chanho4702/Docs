**판정: 현재 작업 트리 전체의 커밋은 보류합니다. 모듈 분리 자체는 타당하지만, 수집 코어에 현재 인터페이스만으로 재현 가능한 🔴 4건이 남았습니다.**

이번에도 보류이므로 **범위 축소를 권고합니다.** 다음 커밋은 HEAD에 이미 들어간 코어의 **모듈 이동·빌드 연결**로 한정하고, 새 `runtime/local` 구현과 그에 의존하는 계약 변경은 별도 안정화 커밋으로 분리하는 방안입니다. PG writer·디스크 큐 구현까지 이번 커밋에 요구하는 것은 아닙니다.

코드·문서·Git index는 수정하지 않았습니다. 빌드와 테스트도 재실행하지 않았으며, 아래 재현은 **소스에서 구성한 결정적 입력·실행 순서**입니다. 기존 테스트 실행 기록과 신규 결함의 실행 검증을 구분했습니다.

**1. 확인 범위와 검증 기록**

- 브랜치 `ZM-172`, HEAD `94c9115` 확인.
- 파일 단위 `git status --porcelain -uall`: rename 24건(`R` 19·`RM` 5), 일반 수정 7건, untracked 24건.
- `git diff HEAD --stat`: tracked 기준 33파일, `+338/-184`. **untracked 구현은 이 통계에 포함되지 않습니다.**
- 모듈 소스는 **main 36파일·test 9파일**입니다. 요청문의 “rename 36건·test 10파일”과는 다릅니다. HEAD에 있던 이동 대상은 main 21파일·test 3파일입니다.
- 모듈 JUnit XML: **124건, 실패·오류·skip 0**. 2026-10-26 11:12 KST 기록이며, 런타임 27건·ArchUnit 3건·LiveIT 3건을 포함합니다.
- app DBM XML: **ArchUnit 2건 통과**, 같은 날 11:17 KST 기록.
- LiveIT 출력에서 PostgreSQL **16.15** 확인.
- 기존 `bootJar` 내부의 `BOOT-INF/lib/dbm-collector-core-0.0.1.jar` 확인. app의 `BOOT-INF/classes`에는 코어 클래스 중복이 없습니다.
- 계약서의 **FE 요청사항은 없음**입니다.

표의 파일 좌표는 다음 약칭을 사용합니다. `R:329`는 해당 파일의 329행입니다.

| 약칭 | 파일 |
|---|---|
| R | [CollectorRuntime.java](file:///C:/worktrees/zm-172-be/dbm-collector-core/src/main/java/com/dmove/moveseye/premium/dbm/collector/core/runtime/CollectorRuntime.java) |
| W | [InMemoryBatchWriter.java](file:///C:/worktrees/zm-172-be/dbm-collector-core/src/main/java/com/dmove/moveseye/premium/dbm/collector/core/local/InMemoryBatchWriter.java) |
| L | [InMemoryLeaseClient.java](file:///C:/worktrees/zm-172-be/dbm-collector-core/src/main/java/com/dmove/moveseye/premium/dbm/collector/core/local/InMemoryLeaseClient.java) |
| B | [BatchWriter.java](file:///C:/worktrees/zm-172-be/dbm-collector-core/src/main/java/com/dmove/moveseye/premium/dbm/collector/core/spi/BatchWriter.java) |
| C | [CheckpointStore.java](file:///C:/worktrees/zm-172-be/dbm-collector-core/src/main/java/com/dmove/moveseye/premium/dbm/collector/core/spi/CheckpointStore.java) |
| A | [EngineAdapter.java](file:///C:/worktrees/zm-172-be/dbm-collector-core/src/main/java/com/dmove/moveseye/premium/dbm/collector/core/runtime/EngineAdapter.java) |
| T | [CollectorRuntimeTest.java](file:///C:/worktrees/zm-172-be/dbm-collector-core/src/test/java/com/dmove/moveseye/premium/dbm/collector/core/runtime/CollectorRuntimeTest.java) |
| AM | [모듈 DbmCoreArchitectureTest.java](file:///C:/worktrees/zm-172-be/dbm-collector-core/src/test/java/com/dmove/moveseye/premium/dbm/collector/core/DbmCoreArchitectureTest.java) |
| AA | [app DbmCoreArchitectureTest.java](file:///C:/worktrees/zm-172-be/src/test/java/com/dmove/moveseye/premium/dbm/DbmCoreArchitectureTest.java) |
| K | [contract_db-monitoring.md](../../../../features/premium/db-monitoring/solutions--contract_db-monitoring.md) |
| D | [devdesign_db-monitoring.md](../../../../features/premium/db-monitoring/solutions--devdesign_db-monitoring.md) |

**2. 7차 N1~N16 반영 판정**

| 7차 # | 판정 | 근거(파일:행) | 남은 조치 | 이월 가능? |
|---|---|---|---|---|
| **N1** | **해소 — 현재 시험 구현의 저장 실패 경로** | W:76~82에서 checkpoint 저장 성공 후에만 `seen/accepted`를 변경. T:727~732는 저장 전 실패, T:743~765는 미수락·옛 checkpoint·최종 합 150을 확인. T:325~346은 커밋 후 ACK 유실·전진된 checkpoint를 별도로 확인 | 동일 키 재시도로 `seen` 미잔존까지 직접 단언하면 더 명확함. J1 실제 트랜잭션·J2 crash 원자성은 아직 증명되지 않음. ACK별 Javadoc 정합성은 V8-8 참조 | **PG 원자성은 WS-2, 파일·큐 crash는 P3b**. 계약 문구 정리는 이번 계약 커밋 |
| **N2** | **해소했지만 새 결함** | W:91~107에서 SHA-256으로 변경했으나 W:97의 입력 직렬화가 타입·구분자를 보존하지 않음. T:770~781은 `"Aa"`/`"BB"`만 검사 | **V8-1**: 다른 payload가 같은 digest 입력을 만드는 문제 수정 | **현재 writer를 포함하면 불가** |
| **N3** | **해소** | R:365에서 실행 lease만 제거, R:649에서 `ownership`을 반납 대상으로 선택. 실패 시 R:655~659에서 상태 보존. 성공 뒤 R:663~667에서 참조 제거. T:786~802 확인 | halt·denial·fencing 후 반납 실패 조합의 테스트 보강은 가능. 원래 seq 초기화 경로는 닫힘 | 추가 조합 시험은 WS-2 가능 |
| **N4** | **부분 해소** | R:180~188의 동일 버전 유지, R:227의 최종 denied 반영, T:807~829 확인. 그러나 오래된 진행 중 config 응답도 거부 상태를 변경할 수 있음 | **V8-2**: config 응답 적용과 denial 전이를 실행 세대에 묶기 | **불가** |
| **N5** | **부분 해소** | R:408~414에서 AUTH 정지를 FAILED 쓰기보다 먼저 게시하고 R:393~403에서 접속 전 확인. 그러나 R:329의 버전 불일치 비교가 오래된 조회로 최신 AUTH 정지를 해제함 | **V8-4**: 자동 재개를 해당 정지 세대와 자격증명 증가 조건에 묶기 | **불가** |
| **N6** | **부분 해소** | R:194·301·394·517에서 실행 세대 검사. halt·denial은 R:597·613에서 증가. 원래의 “다음 대상 B 시작” 경로는 차단됨 | **V8-3**: 진행 중 writer 반환 후 **같은 대상의 다음 kind**를 시작하는 경계에는 검사 없음 | **불가** |
| **N7** | **부분 해소** | R:297~315에서 대상별 현재 mono/wall을 due·lease 판정에 사용. R:399에서 접속 직전 현재 시각 확인. R:427에서 kind별 관측 시각 취득. T:834~851 확인 | **V8-3**: 접속·writer 지연 후 다음 채집 시작 경계에서도 유효성 확인 필요 | **불가** |
| **N8** | **부분 해소 — 생성자 수정, 계약 불일치 잔존** | B:174~186이 REJECTED·CONFLICT 사유를 필수화. 모든 `Reason`에 허용 status가 있음. 그러나 K:69는 CONFLICT에 `(없음)`을 허용하고, K:68은 EXPIRED를 필수처럼 표시 | **V8-8**: 계약을 실제 허용 집합과 일치시키기. 잘못된 writer 결과 생성 예외와 일시 장애의 구분은 WS-2에서 확정 | 계약 정렬은 **이번**, writer 프로토콜 오류 분류는 WS-2 |
| **N9** | **해소 — 코드** | A:70~81에서 observedAt override 제거. R:427·463·465가 같은 관측 스냅샷을 checkpoint·배치에 사용 | K:54와 T:257의 “어댑터 시각 사용” 문구 삭제 | 문구는 이번 정리 |
| **N10** | **해소** | R:423은 `connectFailures`만 초기화. R:552·559·566은 쓰기 성공 계열에서 `writeFailures` 초기화. R:572~573에서 별도 증가. T:856~871에서 5→10→20초 확인 | 늦은 옛 응답이 새 상태의 실패 횟수에 영향을 주는 문제는 V8-5 | 해당 후속은 WS-2 가능 |
| **N11** | **해소** | R:270은 현재 유효기간 검사, R:271은 sentinel을 먼저 분기. T:876~888 확인 | `leased`는 로컬 시계 기준 유효성이지 서버 소유권 재조회 결과는 아님. 현재 모델 설명과 부합 | 추가 조치 없음 |
| **N12** | **해소** | [ConfigSource.java:49](C:/worktrees/zm-172-be/dbm-collector-core/src/main/java/com/dmove/moveseye/premium/dbm/collector/core/spi/ConfigSource.java:49)의 `Set.copyOf`, null은 빈 집합 | 원본 Set 변경·반환 Set 변경 거부 시험을 추가할 수 있으나 구현 자체는 명확함 | 시험 보강 이월 가능 |
| **N13** | **해소** | [env_p0-test-db.md:65](C:/solutions/_workspace/features/premium/db-monitoring/env_p0-test-db.md:65)가 `adapter.pg.*`를 선택. 71행은 REQUIRED와 별도 게이트 포함 조건을 명시. 실제 XML에 게이트 1건 실행 확인 | LiveIT 단일 클래스만 선택하면 게이트가 빠지는 구조는 남지만, 문서 명령의 누락은 해결됨 | 게이트 통합은 후속 가능 |
| **N14** | **해소 — 지적된 불변식** | A:73~81에서 quality·FAILED/SKIPPED checkpoint·행 null 검증. R:431~458의 채집 경계가 생성 예외를 FAILED로 전환. B:111·175에서 status 필수화 | 깊은 불변성·행 스키마·품질 수치 범위는 별도 문제이며 typed schema 단계에서 확정 | **WS-2·WS-3 가능** |
| **N15** | **부분 해소** | R:548·585~587이 옛 CONFLICT로 새 lease를 null로 만드는 원래 경로는 차단. 하지만 `sameLease`는 그 분기에서만 사용됨 | **V8-5**: 옛 RETRY_LATER의 새 상태 백오프, 옛 ACK의 실패 횟수 초기화 등은 여전히 가능. “다르면 진단만”이라는 설명도 과장 | **WS-2 가능**, 현재 완료 표시는 정정 |
| **N16** | **해소 — 코드** | R:169~171에서 halt 상태의 tick도 `releaseAll()` 수행. R:654~659에서 반납 실패 상태 유지 | halt→release 실패→다음 halt tick 성공의 직접 테스트는 없음 | WS-2 조립 전 보강 가능 |

N3의 반납 경로는 `disabled/삭제 → drop`, `writer denial/halt → releaseAll → drop`, `config denial → releaseAll → drop`, `halt 상태의 후속 tick → releaseAll → drop`으로 연결됩니다. `ownership=null`은 반납 성공 뒤에만 설정되며, fencing 분기는 실행 lease만 제거하므로 현재 코드에서 두 처리가 충돌하는 경로는 확인하지 못했습니다.

N4의 **같은 `configVersion`에서 정책만 변경된 경우**는 계속 거부 상태를 유지합니다. 현 계약의 의도에 맞으며 자동 반복 접속 결함은 아닙니다. 재허용은 config 버전 증가 또는 명시적 `clearDenial()`이 필요합니다. `clearDenial()` 후 같은 버전에서 writer가 다시 거부하면 다시 멈춥니다. 관리자가 반복해서 해제하지 않는 한 자동 루프는 없습니다. 이 운영 조건은 WS-1 설정 저장 경로에서 보장해야 합니다.

**3. 모듈 분리 점검**

| 항목 | 판정 | 근거 | 조치 |
|---|---|---|---|
| main 의존 방향 | **OK** | [모듈 build.gradle.kts:29](C:/worktrees/zm-172-be/dbm-collector-core/build.gradle.kts:29)의 프로덕션 의존은 비어 있음. 루트에는 코어로 향하는 `implementation`만 있고 반대 방향 없음. main import에서도 외부 라이브러리 참조 없음 | 현재 분리 유지 |
| test BOM·pgjdbc의 main 유입 | **OK** | BOM은 `testImplementation`, pgjdbc는 `testRuntimeOnly`. test 구성은 main 구성을 상속하며 역방향으로 main에 유입시키지 않음. 별도의 `extendsFrom` 오염 설정도 없음 | 선언 그래프 기준 OK. 이번 검수에서 dependency 태스크 재실행은 하지 않음. [Gradle 구성 규칙](https://docs.gradle.org/current/userguide/java_plugin.html#sec:java_plugin_and_dependency_management) |
| app ArchUnit의 코어 import | **OK** | AA:31~33은 classpath의 `premium.dbm`을 읽으므로 의존 모듈의 코어도 대상. AA:42·54가 코어 클래스를 규칙의 출발점에서 제외 | 모듈 jar에 있다는 이유로 빠지는 구성은 아님. [ArchUnit import 설명](https://www.archunit.org/userguide/html/000_Index.html#_importing_classes) |
| app 규칙의 범위 | **🟡** | AA:33이 `premium.dbm`만 읽음. 다른 app 패키지에서 `core.local`을 사용하는 경우까지 차단하는 규칙은 아님 | 현재 소비자 3파일은 범위 안. 전역 보호가 필요하면 실제 코어 의존 클래스만 대상으로 보강 |
| 모듈 전체가 core 패키지인지 검사 | **🟡** | **AM:43에서 core 패키지만 import한 뒤 AM:51에서 core 패키지인지 검사**. 다른 패키지의 독립 클래스가 섞여도 검사 집합에 들어오지 않음 | V8-6. 모듈 main output 전체를 import하도록 수정 |
| allowlist와 “미사용 의존도 차단” 주장 | **🟡** | AM:58~65는 클래스의 실제 의존을 검사함. AM:26~27의 “아직 안 쓰는 라이브러리도 막힘”은 성립하지 않음 | 미사용 Gradle 의존까지 막으려면 별도 구성 검사. 아니면 설명을 실제 보장 범위로 축소 |
| 스레드·실행기 규칙 | **🟡** | AM:71~78은 **생성 금지가 아니라 해당 타입 의존 금지**. `Atomic*`·locks는 허용하지만 `Thread.currentThread().interrupt()`도 금지됨 | V8-7. 실행기 생성·스케줄·스레드 시작 금지와 interrupt 복원을 구분. 현재 코어 위반은 없음 |
| Docker COPY 순서 | **OK** | [Dockerfile:12](C:/worktrees/zm-172-be/Dockerfile:12)에서 모듈 스크립트 선복사, 20행에서 모듈 소스 복사, 22행에서 bootJar | 모듈 누락으로 구성 실패하는 문제 없음 |
| bootJar 포함·중복 | **OK** | 기존 JAR 내부에 코어 jar 134,002바이트 존재. app classes의 코어 중복 0 | 런타임 패키징 구조 정상. Docker 빌드 재실행은 미실시 |
| Gradle `test` 범위 | **OK — 명령 구별 필요** | 루트에서 **`gradlew test`는 하위 프로젝트의 같은 이름 태스크도 선택**. **`gradlew :test`는 루트 태스크만 지정**. 루트 `:test`가 코어 `:test`에 의존하는 것은 아님 | 문서의 모듈 태스크 지정은 맞음. [Gradle 태스크 선택 규칙](https://docs.gradle.org/current/userguide/multi_project_builds_intermediate.html) |
| 실제 Bitbucket 테스트 실행 | **🟡** | [bitbucket-pipelines.yml:12](file:///C:/worktrees/zm-172-be/bitbucket-pipelines.yml%3A12)는 Docker build만 실행. Dockerfile은 `bootJar -x test`. **현재 배포 파이프라인은 모듈뿐 아니라 전체 테스트를 실행하지 않음** | 분리로 새로 생긴 회귀는 아님. WS-2 통합 전 명시적인 테스트 단계 추가 |
| 패키지 접두 유지 | **OK** | `com.dmove.moveseye.premium` 접두 자체가 Spring 의존·HTTP API 노출·라이선스 게이트를 만들지는 않음 | 지금 rename할 근거 없음. 난독화·외부 SDK 공개 범위는 P3b 패키징 때 판단. 배포 라이선스 적합성 자체는 **미확인** |
| J1 구현을 app에 배치 | **OK** | 루트 build:38~42, 모듈 README:65~67, D:183이 일치. app에서 PG writer·lease·checkpoint, Spring 조립·Flyway를 소유하고 코어 SPI를 구현하는 방향 | WS-1 레지스트리와 WS-2 조립에 적합. 실제 조립 코드는 아직 없어 실행 검증은 미확인 |
| P3b→P0 분리 시점 변경 | **OK / 문서 잔여 🟡** | D:183은 수정됨. 그러나 [app package-info.java:13](C:/worktrees/zm-172-be/src/main/java/com/dmove/moveseye/premium/dbm/package-info.java:13)은 여전히 “P3b에서 물리 분리” | 모듈 이동 커밋에서 남은 설명 정정 |

**모듈화 때문에 새로 발생한 main 클래스패스 오염이나 패키징 결함은 확인하지 못했습니다.** 남은 모듈 문제의 중심은 실제 코드 배치가 아니라, 자동 검사가 보장한다고 설명한 범위와 실제 검사 범위의 차이입니다.

**4. 새로 확인한 결함과 잔여 경로**

아래 🔴는 PG writer·J2 큐가 구현돼야만 발생하는 가정이 아닙니다. 현재 `BatchWriter`·`ConfigSource`·`SecretResolver`에 지연 훅을 넣거나 입력만 바꾸면 구성 가능한 경로입니다. 다만 이번 읽기 전용 검수에서는 Java 재현 테스트를 추가·실행하지 않았습니다.

| # | 심각도 | 파일:행 | 지적 | 재현 | 고칠 코드(핵심만) | 이월 가능? |
|---|---|---|---|---|---|---|
| **V8-1** | **🔴** | W:91~99 | **SHA-256 이전 직렬화가 충돌한다.** 해시 알고리즘 교체만으로 payload 동등성이 확보되지 않음 | 같은 키·quality·policy에서 `{"x":1}`과 `{"x":"1"}`은 모두 `{x=1␟}`로 변환. 문자열만으로도 `{"x":"a\u001fy=b"}`와 `{"x":"a","y":"b"}`가 같은 입력을 만듦. 두 번째 쓰기는 DUPLICATE | 지원 값 타입을 제한하고 타입·길이·경계를 보존하는 canonical encoding 사용. 시험 writer라면 불변 payload의 구조적 동등성 직접 비교도 가능 | **현재 writer 포함 시 불가**. runtime/local을 커밋에서 제외하면 후속 안정화로 이동 |
| **V8-2** | **🔴** | R:166~188, 609~613 | **오래된 config 조회가 최신 writer denial을 지운다.** generation 검사는 제어 상태 변경보다 뒤에 있음 | SLOW가 c1을 읽고 반환 대기 → FAST는 c2에서 writer 거부를 받아 denial(c2)·generation 증가·반납 완료 → SLOW의 c1 반환 → 버전이 다르다는 이유로 denial 삭제 → SLOW 자신은 세대 검사로 중단되지만 다음 tick은 다시 수집 | config 조회 후 제어 상태 적용 전에 실행 세대 검증. denial·출처·버전·generation을 하나의 원자적 상태 전이로 관리. “다른 버전”과 “거부 이후 새로 확인한 허용 설정”을 구분 | **불가** |
| **V8-3** | **🔴** | R:405, 426~440, 548~568 | **접속 후·다음 kind 시작 전 실행 허가를 확인하지 않는다.** 늦은 ACK가 오면 중단된 tick도 다음 SQL을 시작함 | SESSION을 정상 커밋한 writer가 ACK 반환 전에 시계를 31초 전진 → ACCEPTED 반환 → 이미 만료됐는데 LOCK `checkpointKey/collect` 실행. 또는 ACK 대기 중 다른 레인이 halt·releaseAll 완료 → ACK 후 LOCK 채집 실행. 쓰기 단계에서야 차단 | 각 kind의 채집 시작 전 generation·dropped·suspended·lease 확인. 긴 checkpoint 준비 뒤 `collect` 직전에도 재확인. 옛 결과에서 `CONTINUE`할 때 중단 상태 확인 | **불가** |
| **V8-4** | **🔴** | R:286~301, 323~333, 408~412 | **오래된 자격증명 조회가 더 최신 AUTH 실패를 재개시킨다.** `!=`는 버전 증가를 뜻하지 않음 | AUTH(v1) 정지 → SLOW가 v1 조회 후 반환 대기 → 자격증명 v2로 변경 → FAST가 자동 재개 후 v2도 AUTH 실패, 정지 버전=2 → SLOW의 v1 반환 → `1 != 2`라 정지 해제 → v2로 다시 접속 | 조회 전 정지 세대·실패 버전을 캡처하고 조회 후 그대로인지 확인. 증가한 credentialVersion일 때만 재개. 늦은 실패 게시·접속에도 해당 자격증명 세대를 검증 | **불가** |
| **V8-5** | **🟡** | R:548~602 | **`sameLease`가 전체 결과 반영을 보호하지 않는다.** “다르면 진단만”이라는 설명과 다름 | token1 응답 대기 → 다른 레인이 token2 획득·정상 쓰기 → token1의 RETRY_LATER 도착 → token2 상태에 `writeFailures/backoff` 설정. 옛 ACCEPTED는 새 실패 횟수를 초기화할 수 있음 | 시도별 통계와 현재 실행 제어 상태 변경을 분리. 후자는 target 상태·실행 세대·lease 일치 조건으로 제한. 전역 REJECTED의 예외 정책은 명시 | **WS-2 가능**. 현재 테스트로 전체 해결을 주장하면 안 됨 |
| **V8-6** | **🟡** | AM:40~53 | **모듈 패키지 경계 테스트가 검사 대상을 미리 필터링해 위반을 놓친다.** | 모듈 main에 core와 무관한 `com.example.Unrelated` 클래스가 있어도 `importPackages(CORE_PKG)`에 들어오지 않아 규칙이 통과 | 모듈의 `sourceSets.main.output.classesDirs` 전체를 import하고 모든 클래스의 패키지를 검사 | **모듈 분리 커밋에서 수정 권고**. 현재 외부 패키지 혼입은 없음 |
| **V8-7** | **🟡** | AM:69~80 | 스레드 규칙이 정당한 interrupt 복원도 막고, 실행 모델 소유 여부를 정확히 표현하지 못함 | 코어에서 `Thread.currentThread().interrupt()`만 사용해도 Thread 의존으로 실패. 반면 목록에 없는 비동기 생성 API까지 전부 막는 규칙은 아님 | 생성자·`start`·실행기 factory·암묵적 비동기 실행 호출을 겨냥하고 interrupt 복원은 허용 | **WS-2 가능**, 현재 설명은 “의존 금지”로 정확히 표시 |
| **V8-8** | **🟡** | B:144~146·215~218, K:54·68~74·126·280 | **계약·완료 표시가 코드와 어긋난다.** CONFLICT null 허용, EXPIRED 사유 필수 여부, 제거된 observedAt override, “옛 결과는 코드로 닫음” 등이 잔존 | B 생성자는 무사유 CONFLICT를 거부하지만 K:69는 허용. B는 EXPIRED_WINDOW 무사유를 허용하지만 K:68은 EXPIRED만 표기. B:215는 모든 ACK에서 배치와 checkpoint가 durable이라고 하나 EXPIRED는 저장하지 않는 ACK | 결과별 저장·checkpoint·ACK 의미를 나눠 적고 실제 생성자 집합에 맞춤. §4의 미검증/잔여 경로 표시 수정 | **이번 계약 커밋에서 정리**. 실제 PG·큐 구현은 이월 |

V8-1은 SHA-256 자체의 충돌을 찾아야 하는 문제가 아닙니다. **서로 다른 payload를 해시 전에 같은 문자열로 만들기 때문에** 확정적으로 같은 digest가 나옵니다. `"Aa"`/`"BB"` 회귀 시험 통과만으로 이 경로는 검증되지 않습니다.

V8-3에서는 이미 시작한 SQL을 강제로 취소하라고 요구하는 것이 아닙니다. **중단·만료가 완료된 뒤 아직 시작하지 않은 다음 SQL을 호출하는 경로**를 막아야 합니다. writer의 fencing은 잘못된 적재를 막지만, 대상 DB에 대한 불필요한 폴링까지 막지는 않습니다.

**5. 커밋 경계와 후속 조치**

**현재 전체 작업 트리의 필수 수정은 V8-1~V8-4입니다.** 각각 멱등 판정, 거부 상태 유지, 신규 채집 시작 허가, AUTH 재개 조건에 해당합니다. `local` 시험 구현·SPI 지연 훅으로 확인할 수 있으므로 PG writer나 J2 큐 구현까지 기다릴 이유가 없습니다.

현재 범위를 그대로 커밋하려면 다음 순서가 적절합니다.

1. **V8-2·V8-4**: 전역 제어 상태와 대상 AUTH 상태의 세대를 명확히 하고, 늦은 조회가 최신 결정을 덮지 못하게 수정.
2. **V8-3**: 채집 시작 경계에 현재 실행 허가 검사 추가.
3. **V8-1**: payload 비교를 타입·경계가 보존되는 방식으로 수정.
4. **V8-6·V8-8**: 모듈 경계 검사와 계약·증명 문구 정렬.
5. 위 네 🔴 경로를 직접 단언하는 테스트 후 모듈 테스트·app ArchUnit·bootJar 확인. 기존 124+2건 통과는 보존하되 새 경합의 검증을 대신하지 않음.

다만 **6·7차에 이어 이번도 보류이므로, 같은 전체 범위의 수정·재검수를 다시 반복하는 것보다 커밋 분리가 낫습니다.**

| 커밋 | 범위 | 판정 |
|---|---|---|
| **다음 3차 커밋** | HEAD에 이미 커밋된 main 21파일·test 3파일의 모듈 이동, Gradle 연결, Docker COPY, 경계 검사, 이동 설명. 새 runtime/local 및 그 전용 계약 변경은 제외 | **범위 축소안으로 권고**. 분리된 실제 diff·검증 결과 확인 후 승인 가능. 현재 작업 트리 전체를 승인한다는 뜻은 아님 |
| **후속 안정화 커밋** | `runtime/local`, 확장 SPI 모델, N1~N16 보완, V8-1~V8-4 수정·직접 시험, 해당 계약 | 필수 결함 해소 후 검수 |

3차 커밋 제목 예시는 다음과 같습니다.

`#ZM-172 [FEAT] DB 모니터링 수집 코어를 독립 Gradle 모듈로 분리`

**이번 커밋에 요구하지 않는 작업**은 다음과 같습니다.

| 시점 | 이월 항목 | 통과 조건 |
|---|---|---|
| **WS-2** | J1 PG writer·lease·checkpoint | fencing 검증과 인계가 경합하지 않는 잠금 또는 동등한 원자적 SQL, 배치·영수증·checkpoint 동일 트랜잭션, rollback·커밋 결과 불명 시험 |
| **WS-2** | V8-5의 늦은 결과 처리, scheduler 종료·레인 직렬 실행·pool 조립 | 옛 결과의 현재 상태 변경 정책 확정, 종료 후 새 작업 방지, lane별 비중첩 보장 |
| **WS-1·WS-2** | config·credential 버전 증가, 수동 재개 연결 | 정책/허가 복구와 자격증명 저장 경로가 재개 조건을 실제로 충족 |
| **WS-2** | 상태 EP·경보·CI 테스트 단계 | `closeFailures`·실패 상태 소비, 모듈 테스트 포함 실행 |
| **WS-2·WS-3** | typed rows·깊은 불변성·native별 checkpoint 규약 | 지원 값·null 표현·native 식별·reset·quota 확정 |
| **P3b / R11** | durable 큐·파일 crash 원자성·복구·손실 메타 | 큐 append와 checkpoint의 복구 일관성, crash 시점별 시험. 현재 파일 저장 순서 변경을 그 증거로 사용하지 않음 |
| **P3b** | J2 패키징·난독화·드라이버 배포·OS 인증 | 동일 코어 jar 소비와 실제 배포 구성 검증. 패키지 접두 변경은 현재 필수 사항 아님 |

**모듈 분리는 진행할 수 있는 방향입니다. 보류 대상은 모듈 이동 자체가 아니라, 아직 닫히지 않은 런타임 경로까지 “제어 규칙 검증 완료”로 묶어 올리는 현재 커밋 범위입니다.**