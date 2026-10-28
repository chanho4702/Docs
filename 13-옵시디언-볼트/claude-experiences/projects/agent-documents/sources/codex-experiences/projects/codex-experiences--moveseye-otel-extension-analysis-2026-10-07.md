# MovesEye OTel 확장 분석 — 2026-10-07

대상: C:/solutions/moveseye-otel-extension, 버전 0.2.0. 소스 수정 없이 구조와 구현을 검토했다.

HTTP_SERVER 시작·종료 OperationListener가 Context 토큰과 고정 AtomicReferenceArray로 진행 중 요청을 추적한다. 기본 상한 10,000, 최대 200,000, TTL 10분. 기본 1초 전용 metric reader가 분포와 오래된 요청 최대 30건을 함께 집계한다. 목록은 OTLP 로그로 전송한다. DB/HTTP/RPC 하위 작업 속성은 토큰당 하나만 저장한다.

정적 검토 결과:
- ActiveRequestChildOperationMetrics.onEnd의 token.op 비교와 null 대입은 원자적이지 않다. 병렬 시작이 두 연산 사이에 끼면 새 작업 표시를 지울 수 있다. 중첩 작업 종료 후 바깥 작업을 복원하지도 않는다. 실행 재현은 하지 않았다.
- *_recent 값은 collection 콜백에서 차분 기준을 전진시킨다. 확장 자체에 전송 성공 확인·실패 구간 재전송 로직이 없어 영구 유실된 export 구간의 건수를 다음 구간에 복구하지 않는다.
- PathMasker는 숫자/긴 hex/UUID 모양 구간과 쿼리스트링만 처리한다. 이메일·이름 등 일반 문자열은 남으며 SQL 마스킹은 상위 agent에 의존한다.
- 전용 MeterProvider는 package-private SDK 메서드를 reflection으로 읽고 첫 exporter만 사용한다. agent 업그레이드 및 복수 exporter 구성은 별도 검증이 필요하다.
- README의 aggregate-interval 기본값 1000은 실제 output 미지정 시 0과 다르다. metrics.enabled=false는 상태 파일 output이 없으면 추적도 비활성화한다.

기존 2026-09-23 XML에는 일반 테스트 18건 통과, 벤치마크 1건 생략이 기록되어 있었다. 현재 테스트 실행 결과는 대화 결과를 참조한다. 실제 agent/Collector/BE 통합·부하 시험은 이번 분석에서 재실행하지 않았다.

관련: [[projects/agent-documents/sources/codex-experiences/projects/codex-experiences--moveseye-documentation-apm-overview-2026-10-05|moveseye-documentation-apm-overview-2026-10-05]]

## 2026-10-07 패키지 구조 정리

사용자 요청에 따라 active 단일 패키지를 instrumentation(계측), tracking(상태·집계), export(전송·표시)로 분리했다. 설명 생성은 ChildOperationDescription으로, 독립 초기화 실패 카운터는 ExtensionDiagnostics로 옮겼다. tracking은 OTel 타입에 의존하지 않으며 두 주변 패키지가 tracking에 의존한다. 공개 접근은 내부 패키지 연동에 필요한 메서드·타입으로 제한했고 Token 필드를 다른 패키지에 직접 공개하지 않았다.

META-INF/services 두 진입점 경로를 함께 수정하고 ServiceLoader 검증을 추가했다. 기존 테스트는 책임별로 이동·분리했다. README에 구조도·파일 역할·읽는 순서를 추가하고 기존 설정 설명의 불일치를 수정했다. 원본은 프로젝트 .backups/packages-before-20261007-160327.zip에 보관했다.

검증: gradlew.bat test jar --offline 성공. 일반 테스트 19건 통과, 선택 실행 벤치마크 1건 생략. JAR 안의 SPI 대상 클래스 존재, 이전 패키지 클래스 부재, OTel 라이브러리 클래스 미포함, README 상대 링크 존재를 확인했다. 실제 Agent/Collector 통합 및 부하 시험은 이번 작업에서 실행하지 않았다. 이전 분석의 동시성·전송 유실·마스킹 문제는 구조 정리와 별개로 남아 있다.

## README 일반화

2026-10-07 사용자 요청으로 README를 일반 배포용 안내로 다시 작성했다. 개발자 로컬 절대 경로, 내부 workspace 문서·검증 기록 링크, 특정 배치 관례와 내부 이력을 제거했다. 프로젝트 상대 경로, 예시 app.jar/lib 배치, Windows 및 Linux/macOS 빌드 명령, 명시적인 JavaHome·AgentJar 인자를 사용한다. 목적·개발 환경·빠른 시작·패키지 구조·데이터 형식·설정·검증 도구·관측 범위를 자체 완결적으로 설명한다. 로컬 경로 부재, 상대 링크 존재, 설정 이름과 코드 일치 및 Markdown 코드 블록을 확인했다. README만 변경했으므로 빌드·테스트는 재실행하지 않았다.

## 성능 개선 후보 검토

2026-10-07 코드와 기존 P2 시험 구성을 읽고 개선 후보를 정리했다. 이번에는 구현 변경이나 성능 재측정을 수행하지 않았다.

1. list.size=0이어도 요청 시작 시 trace/span ID·메서드를 읽고, 자식 계측이 Op와 Context를 생성한다. 목록 비활성화 여부를 공통 설정으로 전달하여 상세 정보 수집을 생략하는 경로가 우선 후보다. 경로는 제외 판정에 필요하므로 무조건 생략하지 않는다.
2. startEpochMillis는 현재 Token→Entry로 복사되지만 출력 본문과 집계에서 소비하지 않는다. 요청별 currentTimeMillis 호출과 필드 제거는 작은 비용을 줄일 수 있다.
3. 포화 백오프 창이 끝날 때 여러 스레드가 동시에 전체 배열을 탐색할 수 있다. 포화 경로에서만 전체 탐색자를 제한하는 방안을 추적 누락률과 함께 비교할 필요가 있다.
4. metric 집계와 상세 목록 생성을 다른 주기로 설정할 수 있게 하면 다수 인스턴스에서 JSON·전송·수집기 비용을 낮출 수 있다. 현재 값 변화만으로 송신을 생략하면 수신 측 freshness 판정에 영향을 주므로 heartbeat 유지 계약이 필요하다.
5. 과도하게 큰 max-active는 빈 칸도 매번 순회하므로 비용을 늘린다. 점유가 낮은 대형 배열 최적화는 실제 측정 후 판단한다. 새 자료구조나 토큰 풀링은 우선하지 않는다.

기존 TrackerContentionBenchTest는 추적기 중심이며 실제 Context·문자열 출력·OTLP 비용 전체를 측정하지 않는다. run-p2.ps1의 일반 시나리오는 metrics/traces exporter를 끄고 logs exporter도 항상 none이다. 따라서 과거 P2 숫자를 현재 제품의 전체 오버헤드나 개선율로 제시하지 않는다. 실제 exporter 포함 A/B, 목록 활성/비활성, 자식 호출 수, 포화 조건별 p99·CPU·할당·GC·drop rate 비교가 필요하다.

## 성능 개선 구현 및 Claude 검수 완료

2026-10-07 사용자 승인에 따라 불필요한 상세 수집을 제거했다. ActiveRequestState가 기동 시 list.size를 한 번 확정하고 출력·요청 수집이 공유한다. list.size=0이면 메서드/trace/span 조회와 원문 경로 보관을 생략하고 DB/HTTP/RPC 하위 작업 리스너를 등록하지 않는다. metrics.enabled=false도 상세 수집을 생략하되 output 진단 모드의 건수·경과 추적은 유지한다. 미사용 startEpochMillis 및 요청별 currentTimeMillis 호출과 연결 인자·필드를 제거했다. 1초 전송 주기 및 포화 탐색 알고리즘은 변경하지 않았다.

검증: gradlew.bat test jar --offline 최종 성공. 일반 테스트 24건 통과, 선택 벤치마크 1건 생략. 독립 JVM 테스트 5개가 목록 켬/끔/잘못된 값/지표 끔/지표 끔+진단 출력을 실제 customizer·리스너로 검증한다. Span/메서드 조회 횟수, 상세 보관, 하위 팩토리 등록, 분포, 상한 누락, 느림·오류·정상 종료, 제외 경로, TTL 및 종료를 확인했다. JAR의 SPI 대상 클래스와 OTel 라이브러리 미포함도 확인했다.

JDK 17 ThreadMXBean 할당량 비교: 요청당 DB 하위 작업 10회, 2만 요청씩 7회 중 앞 2회 워밍업 제외. 변경 전/후 소스를 독립 컴파일해 각 모드를 별도 JVM에서 실행. list.size=0은 984→96 bytes/request(측정 5회 동일), list.size=30은 984→976 bytes/request. 확장 리스너 경로의 할당량이며 실제 서버 전체 메모리·CPU·지연 개선율이 아니다. 근거는 프로젝트 .backups/allocation-comparison/results.json과 비교 소스.

Claude CLI 읽기 전용 검수 및 재검수 완료: 제품 코드에서 신규 결함 없음. IDE classpath fallback, metrics=false+output 테스트, Gradle classpath 지연 평가, README 비활성 모드 설명 보완을 반영했다. 두 차례 결과 원본은 .backups/claude-performance-review.json 및 claude-performance-followup.json, 합본은 claude-performance-review.txt. 최종 재검수도 새 문제 없음. 알려진 참고사항은 클라이언트 계측이 먼저 초기화되면 State 배열이 이전보다 일찍 생성될 수 있다는 소규모 기동 비용이다. 실제 Agent/Collector 통합과 서비스 p99 성능 시험은 이번에 수행하지 않았다.

원본 백업: .backups/performance-before-20261007-163726.zip. 변경 diff: .backups/performance-review.diff.

## 최초 커밋과 설계·개발 문서

2026-10-07 사용자의 최초 커밋 요청에 후속 문서 정리 요청을 함께 반영했다. docs/design.md에 구조·수명주기·동시성·전송 계약·성능 선택과 제한을, docs/development.md에 빌드 산출물·변경 위치·테스트·성능 측정·배포 점검을 작성하고 README에서 연결했다. 모든 문서 링크는 프로젝트 상대 경로이며 개발자 로컬 절대 경로를 넣지 않았다. 할당량 수치의 일회성 측정 조건과 재현 벤치 미포함을 구분했다.

기존에 초기화되어 있던 master 저장소에서 최초 커밋 5c87950 생성: '초기 커밋: OTel 요청 추적 확장과 설계·개발 문서'. 48파일 포함. .gitignore는 빌드·백업·IDE·로컬 런타임 JAR·임시 캐시를 제외하고 .gitattributes로 주요 파일 줄바꿈을 관리한다. gradlew는 실행 비트 100755로 기록했다. 문서 상대 링크·로컬 경로 부재·코드 블록 및 git diff --cached --check 통과, 커밋 후 git status 깨끗함. 직전 코드 검증 24건 통과를 유지하며 이번 문서·Git 메타 변경에서는 테스트를 재실행하지 않았다. 원격 push는 수행하지 않았다.

## 멀티 언어 지원과 핵심 로직 보호 검토

2026-10-07 사용자 요청에 대한 설계 검토이며 구현 변경이나 최종 구조 확정은 아니다. 현재 tracking은 OTel 직접 의존성이 없지만 JVM 코드이므로 다른 런타임에서 그대로 실행되지 않는다. 언어별 요청 시작·종료 및 비동기 컨텍스트 어댑터와 공통 데이터 계약을 우선 분리한다. 진행 중 요청 관측은 완료 스팬 수집만으로 대체할 수 없고 샘플링 여부와 무관한 건수, 취소·예외·비동기 종료를 언어별로 검증해야 한다.

보호 대안: 고객 측 최소 추적·집계와 자사 서버 분석을 분리하면 배포하지 않는 분석 코드의 노출을 줄인다. 현재 추적 알고리즘 자체의 공통화·보호가 핵심이면 Rust/C++ native core와 언어별 FFI를 후보로 검토하되 역공학 방지 보장은 없으며 호출 비용, 프로세스 안정성, OS/CPU 배포 비용을 측정해야 한다. 고객 소유 sidecar나 컨테이너로 이동하는 것만으로 비밀성이 확보되지 않는다. Java 난독화는 분석 비용을 높이는 보조 수단이며 SPI·리플렉션 보존과 최종 산출물 통합 검증이 필요하다. 서명은 무결성, 라이선스는 사용 통제 목적이며 코드 은닉과 구별한다. SaaS/온프레미스 배포 조건은 아직 미확정이다.

공식 근거: https://opentelemetry.io/docs/zero-code/ 및 https://opentelemetry.io/docs/concepts/instrumentation/zero-code/ (언어별 계측 방식 차이); https://www.guardsquare.com/manual/configuration/usage (ProGuard/R8의 보호 한계).
