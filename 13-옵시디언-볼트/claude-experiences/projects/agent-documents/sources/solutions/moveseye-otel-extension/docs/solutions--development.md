# 개발 가이드

[프로젝트 소개](../solutions--README.md) · [설계 문서](solutions--design.md)

## 1. 개발 환경 준비

JDK 17을 설치하고 `JAVA_HOME`에 설치 위치를 지정합니다. Gradle은 포함된 Wrapper를 사용합니다.
실제 Agent 연동 시험에는 OpenTelemetry Java Agent `2.31.1` JAR가 별도로 필요합니다.
일반 단위 테스트에는 Agent를 JVM에 연결할 필요가 없습니다.

아래 명령은 모두 프로젝트 루트에서 실행합니다.

```powershell
java -version
.\gradlew.bat --version
.\gradlew.bat test build
```

Linux/macOS에서는 `./gradlew`를 사용합니다. 의존성을 이미 내려받았다면 `--offline`을 붙일 수 있습니다.
Wrapper 배포본 자체가 없으면 `--offline`만으로 최초 다운로드를 피할 수 없습니다.

## 2. 빌드 산출물

| 대상 | 빌드 명령(Windows) | 산출물 |
|---|---|---|
| 확장 | `.\gradlew.bat :jar` | `build/libs/moveseye-otel-extension-0.2.0.jar` |
| 시험 서버 | `.\gradlew.bat :testapp:bootJar` | `testapp/build/libs/moveseye-otel-poc-testapp.jar` |
| 부하 생성기 | `.\gradlew.bat :loadgen:jar` | `loadgen/build/libs/moveseye-otel-poc-loadgen.jar` |
| 전체 검증·빌드 | `.\gradlew.bat test build` | 각 프로젝트의 `build/` |

확장 의존성의 `compileOnly`는 의도적인 설정입니다. 런타임 OTel 클래스는 Agent가 제공합니다.
확장 JAR에 OTel 라이브러리를 함께 넣으면 클래스 로더 간 타입 불일치가 생길 수 있습니다.

## 3. 코드를 읽는 순서

1. [Customizer](file:///C:/solutions/moveseye-otel-extension/src/main/java/com/dmove/moveseye/otel/active/instrumentation/MovesEyeInstrumenterCustomizerProvider.java): 어떤 계측 유형에 리스너를 붙이는지 확인합니다.
2. [요청 리스너](file:///C:/solutions/moveseye-otel-extension/src/main/java/com/dmove/moveseye/otel/active/instrumentation/ActiveRequestOperationMetrics.java): 시작·제외·종료 처리와 상세 수집 분기를 읽습니다.
3. [추적기](file:///C:/solutions/moveseye-otel-extension/src/main/java/com/dmove/moveseye/otel/active/tracking/ActiveRequestTracker.java): 토큰 소유권과 슬롯 회수, 만료, 스냅샷을 읽습니다.
4. [공유 상태](file:///C:/solutions/moveseye-otel-extension/src/main/java/com/dmove/moveseye/otel/active/tracking/ActiveRequestState.java): 설정과 흐름 카운터, 진단 출력을 확인합니다.
5. [출력 리스너](file:///C:/solutions/moveseye-otel-extension/src/main/java/com/dmove/moveseye/otel/active/export/ActiveRequestMetricsAgentListener.java): metric 등록과 목록 생성을 읽습니다.

### 변경 목적별 위치

| 변경 목적 | 확인할 코드 | 함께 검증할 항목 |
|---|---|---|
| 제외 경로·느림 기준·상한 | `ActiveRequestState` | 기본값, 경계값, README 설정표 |
| 요청 시작·종료 처리 | `ActiveRequestOperationMetrics` | Context 전파, 예외, 드롭·만료 후 종료 |
| 추적 자료구조 | `ActiveRequestTracker` | 용량 상한, 중복 종료, CAS 소유권, 할당량 |
| 하위 작업 수집 | `ActiveRequestChildOperationMetrics` | 목록 비활성 시 미등록, 병렬·중첩 의미 |
| 새 metric 또는 필드 | `ActiveRequestMetricsAgentListener`, `ActiveRequestListBody` | 수신 시스템 계약, 단위, 속성값, 크기 제한 |
| 경로·SQL 표시 | `PathMasker`, `ChildOperationDescription` | 마스킹, 긴 입력, JSON 이스케이프 |
| Agent 버전 | 루트 `build.gradle.kts`, SPI 구현 | API/BOM 조합, reflection, 실제 Agent 전송 |

## 4. 단위 테스트

```powershell
.\gradlew.bat test
.\gradlew.bat :test --tests '*ActiveRequestTrackerTest'
.\gradlew.bat :test --tests '*RequestCollectionModeTest'
```

`build/reports/tests/test/index.html`에서 결과를 확인합니다. `UP-TO-DATE`라면 기존 결과를 재사용한 것입니다.
실제 재실행이 필요할 때만 `--rerun-tasks`를 사용합니다.

| 테스트 | 검증 범위 |
|---|---|
| `ActiveRequestTrackerTest` | 동시 추적 상한, 구간 경계, 만료, 중복·늦은 종료, 슬롯 회수 |
| `ActiveRequestListTest` | 오래된 요청 선별, 참조 해제, 목록 크기 설정 |
| `PathMaskerTest`, `ChildOperationDescriptionTest` | 경로 마스킹과 설명 길이 제한 |
| `ActiveRequestListBodyTest`, `ActiveRequestEmitListTest` | 목록 JSON과 실제 SDK 로그 출력 |
| `AgentServiceRegistrationTest` | SPI 파일에서 두 진입점 발견 |
| `RequestCollectionModeTest` | 상세 켬·끔·잘못된 설정·metrics 비활성·진단 모드 |
| `TrackerContentionBenchTest` | 선택 실행하는 맵·배열 비교 |

`RequestCollectionModeTest`는 설정별로 독립 JVM을 생성합니다. 공유 상태가 기동 시 한 번 초기화되므로
같은 JVM에서 system property만 바꾸어 서로 다른 기동 조건을 흉내 내지 않습니다.
Gradle이 `moveseye.test.classpath`를 전달하며 IDE에서는 `java.class.path`를 사용합니다.

설정이나 전역 SDK 상태를 변경하는 테스트는 종료 시 복원해야 합니다.
실제 Agent와 Collector 연결 성공은 단위 테스트만으로 보장되지 않습니다.

## 5. 실제 요청 시험

Agent JAR를 프로젝트의 `lib/opentelemetry-javaagent.jar`에 준비했다고 가정합니다.
해당 디렉터리는 배치 예시이며 사용 환경에 맞게 변경할 수 있습니다.

```powershell
.\gradlew.bat build
.\scripts\run-p1.ps1 -JavaHome $env:JAVA_HOME -AgentJar (Resolve-Path './lib/opentelemetry-javaagent.jar').Path
.\scripts\run-p2.ps1 -JavaHome $env:JAVA_HOME -AgentJar (Resolve-Path './lib/opentelemetry-javaagent.jar').Path
```

스크립트의 기본 경로에 의존하지 않도록 두 인자를 명시합니다. 스크립트는 시험용 서버 프로세스를 시작·종료하고
`build/poc-results/`에 결과와 로그를 저장합니다. 개발용 환경에서 실행합니다.

| 도구 | 목적 |
|---|---|
| `run-p1.ps1` | 정상·예외·클라이언트 취소·타임아웃·비동기·스트리밍의 수명주기 확인 |
| `run-p2.ps1` | 확장 적용 여부, 집계 조건, 높은 동시성, 포화, Collector 단절 조건 비교 |

시험 서버의 `/normal`, `/error`, `/delay`, `/async`, `/timeout`, `/stream`, `/cancel` 경로가 각 조건을 만듭니다.
`/poc/runtime`은 진단값을 제공하며 `/poc/shutdown`은 시험 서버 종료용입니다.

현재 P2의 일반 시나리오는 traces/metrics exporter를 끄고, logs exporter도 비활성화합니다.
따라서 P2 결과는 실제 OTLP 목록 전송까지 포함한 제품 전체 오버헤드와 구분해야 합니다.

## 6. 성능 변경을 검증하는 방법

요청마다 실행되는 코드와 주기 집계·전송 코드를 나누어 측정합니다.

| 구간 | 확인할 비용 |
|---|---|
| 요청 시작·종료 | 추가 객체, Context 연결, 슬롯 탐색, 공유 변수 경합 |
| DB·외부 호출 | 호출당 하위 작업 객체와 Context 생성 |
| 스냅샷 | 전체 슬롯 순회, 오래된 요청 선별, TTL 회수 |
| 목록 출력 | 마스킹, JSON 생성, 로그 큐와 네트워크 전송 |

자료구조 비교는 다음 명령으로 실행합니다.

```powershell
.\gradlew.bat :test '-Dmoveseye.bench=true' --tests '*Bench*'
```

벤치마크 수치는 호출 지연의 p99와 같지 않습니다. 포화 조건에서는 추적 성공률이 다른 두 실행을
속도만으로 비교하지 않습니다. 더 많은 요청을 버려서 빨라진 것인지 확인해야 합니다.

서비스 수준 비교에서는 같은 Agent 버전·샘플링·exporter·부하를 유지하고 다음 항목을 함께 기록합니다.

- 처리량과 응답 지연(p50/p95/p99)
- CPU 사용량, 요청당 할당량, GC 시간
- 추적 성공·누락·만료 건수
- 상세 목록 켬/끔, 요청당 DB·외부 호출 횟수
- 정상 Collector와 단절 조건의 차이

### 0.2.0 상세 수집 개선의 확인 결과

2026-10-07 개발 환경의 JDK 17에서 변경 전후 소스를 각각 컴파일해 리스너 할당량을 비교했습니다.
HTTP 요청마다 DB 하위 작업 10회를 실행하고, 20,000요청씩 7회 중 앞 2회를 워밍업으로 제외했습니다.
`ThreadMXBean`으로 측정한 나머지 5회의 요청당 할당량은 모두 아래 값이었습니다.

| 조건 | 변경 전 | 변경 후 |
|---|---:|---:|
| 상세 목록 끔 (`list.size=0`) | 984 bytes/request | 96 bytes/request |
| 상세 목록 켬 (`list.size=30`) | 984 bytes/request | 976 bytes/request |

이는 확장 리스너 경로의 할당량입니다. 서버 전체 메모리, CPU, 응답 속도 개선율로 해석하지 않습니다.
해당 일회성 비교의 원시 산출물은 배포 소스에 포함하지 않으며, 위 값은 환경에 독립적인 보장값이 아닙니다.
같은 수치를 재현하는 전용 벤치마크는 현재 프로젝트에 포함되어 있지 않습니다.

## 7. 수정 시 유지해야 할 조건

- 토큰 객체의 소유권과 종료·만료 CAS 규칙을 유지합니다. 단순 토큰 풀링은 늦은 종료와 재사용 문제를 다시 만들 수 있습니다.
- 제외 경로는 상세 목록을 꺼도 판정해야 합니다.
- `list.size=0`에서는 메서드·trace/span 조회 및 하위 작업 리스너 등록을 생략합니다.
- 집계 실패를 정상적인 0건으로 기록하지 않습니다.
- 요청 경로에서 마스킹·JSON 생성·파일 I/O를 수행하지 않습니다.
- metric 이름, 속성값, 로그 필드 의미를 바꿀 때 수신 시스템과 함께 계약을 갱신합니다.
- Agent 진입점 패키지를 바꾸면 `META-INF/services`와 SPI 테스트도 갱신합니다.

## 8. 배포 전 확인

1. `test build`로 테스트와 JAR 생성을 확인합니다.
2. `jar tf build/libs/moveseye-otel-extension-0.2.0.jar`로 SPI 파일과 확장 클래스가 포함됐는지 확인합니다.
3. 대상 Agent와 함께 시험 서버를 실행하고 정상·비동기·오류·긴 요청의 시작과 종료를 확인합니다.
4. 실제 Collector에서 metric과 목록 log가 도착하고 서비스 식별 Resource가 맞는지 확인합니다.
5. 목록을 껐을 때 metric은 유지되고 목록은 나오지 않는지 확인합니다.
6. Collector 단절, 추적 포화, 재시작 시 업무 요청에 미치는 영향을 확인합니다.

확장 버전은 루트 `build.gradle.kts`에서 관리합니다. 변경 시 README의 JAR 예시와
`scripts/run-p1.ps1`, `scripts/run-p2.ps1`의 확장 JAR 이름도 함께 갱신합니다.

## 9. 문제 해결

| 증상 | 우선 확인할 사항 |
|---|---|
| 확장이 로드되지 않음 | `-javaagent`, `otel.javaagent.extensions`, SPI 대상 클래스, Agent 버전 |
| metric이 없음 | HTTP_SERVER 계측 존재, `metrics.enabled`, Agent metrics exporter, 초기화 경고 로그 |
| 건수만 있고 목록이 없음 | `list.size`, logs exporter, Collector 로그 경로, 목록 등록 실패 로그 |
| 갱신 주기가 느림 | 전용 meter 구성 실패에 따른 기본 주기 사용, 로그 exporter 지연 |
| 진행 중 요청이 누락됨 | 제외 경로, `dropped_recent`, TTL 만료, Context 전파 |
| 오래된 요청의 작업 설명이 비어 있음 | 지원되는 하위 계측 여부, 목록 수집 설정, 병렬·중첩 작업 제한 |
| 진단 파일이 즉시 안 생김 | `output`, 집계 주기, `write-every-snapshot`; 기본값에서는 종료 시 기록 |

지원 범위와 현재 제한은 [설계 문서](solutions--design.md)의 마지막 절을 확인합니다.
