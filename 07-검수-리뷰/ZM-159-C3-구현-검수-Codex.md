# ZM-159 C3 구현 검수 — Codex

## 0. 판정 (커밋 가능 / 수정 후 커밋 / 재작업)

**수정 후 커밋. 현재 상태의 C3 커밋은 보류한다.**

분할·창 확정 구조는 유지할 수 있다. 다만 **거짓 완전성 판정, 예산 검사 누락, 응답 초과 후 수신 중단 실패**를 먼저 수정해야 한다. 필수 수정은 §4의 **C3-R1~R7**이다.

- 검수 범위: 요청서의 C3 **7파일**. `ZabbixClient.java`는 **`8df357d` 대비 diff**로 확인했다.
- 파일 생성·수정, 빌드·테스트는 수행하지 않았다. 요청서의 테스트 통과 수치는 **구현자 보고**다.
- 아래 반례의 ‘실제’는 **현재 코드의 정적 분기 추적 결과**이며 실행 재현 결과가 아니다.
- 이전 지적: **R5 해소, R6 부분 해소**.

## 1. 중점 확인 1~7

### 1. 완전성 판정의 구멍 — 수정 필요

**정상 배열 응답·정확한 결과 고유 키·고정된 데이터셋을 전제로 한 창×ID 분할에서는 누락 반례를 발견하지 못했다.**

초과 창을 폐기하고 재조회하며, FILTER의 `seen`은 창 확정 시점에만 갱신한다. 따라서 앞 청크에서 읽었던 행을 재조회 때 잘못 버리던 경로는 막혀 있다. `coveredTo`도 창 확정 후에만 전진한다. 근거: [ZabbixQueryExecutor.java:207](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixQueryExecutor.java:207), [창 확정:238](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixQueryExecutor.java:238).

그러나 다음 구멍이 있다.

- **비배열 응답을 빈 결과로 바꾼다.** `countOutput=true`나 객체 응답이 들어오면 행을 버리고 `complete=true`가 된다. [비배열 처리:411](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixQueryExecutor.java:411).
- **count·커서 마지막 호출의 deadline 초과를 놓친다.** §2 반례 A.
- 커서는 정상적인 고유 ID 오름차순 응답이면 `마지막+1` 경계가 적절하다. 다만 **전진 검증보다 consumer 호출이 먼저**여서 반복 페이지를 소비자에게 중복 전달한 뒤 `NO_PROGRESS`를 반환한다. [커서 처리:284](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixQueryExecutor.java:284).
- 재조회 행도 `rowsSeen`에 포함하는 것은 보수적인 예산 정책이다. 그 자체로 거짓 완전을 만들지는 않지만, **초과 페이지에서는 행 예산 검사를 건너뛴다.**

### 2. 무한 루프·폭주 — 호출 수는 제한되지만 전체 종료 보장은 불충분

RPC가 반환한다는 전제에서는 `beforeCall()`이 모든 반복 경로의 호출 수를 제한한다. 양수 시간 범위의 분할은 창 길이 또는 ID 수를 줄이며, 긴 기간×1초 창도 지연 생성한다. `Long.MAX_VALUE` 끝점의 다음 창 생성도 차단한다. 근거: [창 생성:163](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixQueryExecutor.java:163), [호출 수 제한:460](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixQueryExecutor.java:460).

다만 **“예산으로 반드시 제때 멈춘다”는 판정은 불가**하다.

- 넘친 페이지를 계속 분할하면 행 예산 초과 후에도 RPC가 이어진다.
- deadline은 실행 중인 RPC를 중단하지 않는다.
- 응답 초과 후 `close()`가 남은 본문을 계속 소비하는 경로가 있어, 끝나지 않는 chunked 응답에서는 호출 자체가 반환하지 않을 수 있다.
- ID 중복 제거·전체 ID 청크 구성도 각각 예산 시작 또는 첫 검사보다 앞에 있다. 시간 창 지연 생성이 모든 준비 작업의 비용까지 제한하는 것은 아니다.

### 3. `ZabbixClient` 회귀 — 일부 보존, 전송·오류 처리 수정 필요

**보존된 부분**

- JSON-RPC 인증 오류의 `UnauthorizedError(INVALID_TOKEN)` 판정과 일반 RPC 오류의 메시지 선택은 동일하다. [ZabbixClient.java:139](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixClient.java:139).
- 본문 길이 0은 `null`로 귀결된다. [본문 처리:188](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixClient.java:188).
- `metrics.record()`는 바깥 `finally`에 남아 성공·실패를 기록한다. 단, 본문 종료 처리가 막히면 기록도 반환 시점까지 지연된다. [계측:101](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixClient.java:101).

**회귀·한계**

- HTTP 오류 본문이 최종 `ApiError` 메시지에서 사라진다.
- 종전 converter가 지원하던 **HTTP charset에 따른 비 Unicode 디코딩**이 없어졌다. UTF-8 및 UTF-16/32 자동 감지와는 구분해야 한다.
- 정상적인 유한 응답에서는 연결 반환 경로가 있다. 그러나 **상한 초과 즉시 연결을 중단하는 경로는 없다.** `close()`의 본문 소진 때문에 반환이 지연될 수 있다.
- JSON 한 개를 읽었다고 HTTP 본문 끝까지 계수한 것은 아니다. 후행 공백을 포함한 chunked 본문은 상한 검사를 우회할 수 있다.

### 4. `LimitedInputStream` 경계 — 기본 계수는 적절하나 통합 보장 부족

[ZabbixClient.java:218](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixClient.java:218) 기준:

| 입력/연산 | 정적 판정 |
|---|---|
| 정확히 상한 바이트 후 EOF | 허용. EOF는 계수하지 않는다. |
| 상한+1바이트를 실제 `read()` | `ApiError` 발생. 배열 읽기도 남은 양+1까지만 탐지한다. |
| 한 바이트 `read()` 반복 | 바이트마다 계수하므로 우회 없음. |
| `skip(n)` | 남은 상한까지만 이동·계수한다. 상한 이후에는 0을 반환하며, 자체적으로 추가 바이트를 탐지하지는 않는다. |
| 오류 본문 절단 모드 | 상한에서 EOF처럼 반환한다. 다만 `read(buffer, off, 0)`도 상한 도달 후에는 `-1`을 반환하는 작은 계약 위반이 있다. |

**스트림 계수의 정확성과 전체 HTTP 응답 제한은 별개**다. §2의 E·F가 후자를 깨뜨린다. 기존 6개 테스트에는 정확히 상한·상한+1, `skip`, 단일 바이트 읽기, 느린 응답 종료 검증이 없다. [ZabbixClientBoundedReadTest.java:83](C:/worktrees/zm-159-be/engine-zabbix/src/test/java/com/dmove/moveseye/zabbix/client/ZabbixClientBoundedReadTest.java:83).

### 5. `ZabbixCallLimits` — 생성·동시성은 적절, 설정 계약 불일치

- public `Environment` 생성자에 `@Autowired`가 명시되어 private builder 생성자와 선택이 충돌하지 않는다. [ZabbixCallLimits.java:66](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixCallLimits.java:66).
- `defaults()`는 네 전역 값을 채우고, `environment=null`이면 메서드 기본 정책으로 분기한다. [defaults:87](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixCallLimits.java:87).
- 메서드 이름의 `.`은 직접 문자열 키로 조회하므로 문제를 발견하지 못했다. `ConcurrentHashMap.computeIfAbsent`와 불변 `MethodPolicy` 조합도 적절하다. [정책 조회:97](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixCallLimits.java:97).
- **설계는 `policies.<method>`, 구현은 `policy.<method>`**다. 설계대로 설정하면 조용히 기본값을 쓴다.
- 기동 시 검증은 기본 등록 **7개 메서드**만 대상으로 한다. 미등록 메서드의 잘못된 설정은 첫 `policy()` 호출까지 발견되지 않는다. “모든 잘못된 설정은 기동 실패”라는 설명과 다르다.

### 6. Lombok — 생성 코드 구성은 적절, 컬렉션 불변성은 별도

`@Value @Builder(toBuilder=true)`와 `@Builder.Default`의 `rows=List.of()`, `reason=NONE` 구성에서 명백한 문제를 발견하지 못했다. private 생성자의 builder 호출도 가능하며, package 접근 시계 setter는 생성자 주입 대상에 추가되지 않는다. 근거: [ZabbixScanResult.java:20](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixScanResult.java:20), [시계 필드:59](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixQueryExecutor.java:59).

다만 **`@Value`는 전달받은 List를 불변으로 만들지 않는다.** `listByIds`는 `List.copyOf`를 적용하지만 `listMapsByIds`와 외부 builder 경로는 그렇지 않다. 결과 객체가 깊은 불변 객체라는 보장은 없다.

### 7. C5~C7 이행 가능성 — 기반은 있으나 추가 API 필요

raw `JsonNode` 소비형 순회는 출발점으로 사용할 수 있다. 그러나 typed 변환, 복합 중복 키, ID 분할×커서의 공통 예산, 전역 정렬·top-N, 단일 호스트의 대량 아이템 조회는 보완이 필요하다. 구체적인 이관 목록은 §5에 정리했다.

Executor를 사용하는 서비스가 아직 없는 것은 **요청된 C3 범위와 일치**하며 결함으로 보지 않는다.

## 2. 반례

아래 ‘실제’는 실행하지 않고 코드로 추적한 결과다.

| 번호 | 입력 | 예상 | 실제 |
|---|---|---|---|
| **A — 마지막 RPC 시간 초과** | `deadlineMs=1000`. `countByIds(event.get, eventids=["1"], EXCLUSIVE)`의 유일한 RPC가 1,500ms 후 `"1"` 반환. 또는 `scanByCursor(pageSize=3)`의 첫 RPC가 같은 시간 후 `[]` 반환. | `complete=false`, `BUDGET_TIME`. | 두 경로 모두 **`complete=true`**. 호출 후 시간 검사가 없다. |
| **B — consumer 시간 초과** | 창 하나·행 하나. RPC는 10ms에 끝나고 consumer 처리 후 시각이 1,500ms. deadline은 1,000ms. | 완료 판정 전 시간 초과 확인. | `scanWindows`도 **`complete=true`**. 마지막 consumer 이후 검사 없음. |
| **C — 행 예산 우회** | `history.get`, ID 하나, `[0,7]`, `windowSeconds=8`, `maxRows=3`, `maxTotalRows=3`. 초 0에 `ns`가 서로 다른 4행. | 첫 응답 4행에서 `BUDGET_ROWS`, RPC 1회. | `[0,7]→[0,3]→[0,1]→[0,0]` 재조회. **RPC 4회, `rowsSeen=16`, `NO_PROGRESS`**. |
| **D — 비배열을 빈 완전 결과로 처리** | `listByIds(event.get, eventids=["1"], EXCLUSIVE)`, `base.countOutput=true`, 응답 `"1"`. 또는 `preservekeys=true`로 비어 있지 않은 객체 응답. | 지원하지 않는 요청/응답을 거부하거나 올바르게 처리. | **행 0개, `rowsSeen=0`, `complete=true`**. 값이 사라진다. |
| **E — 종료성 실패** | 상한 256바이트. chunked 응답이 상한을 넘긴 뒤에도 30초보다 짧은 간격으로 계속 데이터를 보내며 종료 chunk를 보내지 않음. | 초과를 감지하면 수신을 중단하고 예외 반환·연결 해제. | 예외 처리 중 일반 `close()`가 나머지 본문을 소진하려 한다. **호출이 반환하지 않고 연결을 계속 점유할 수 있다.** |
| **F — 전체 본문 상한 우회** | chunked 첫 chunk에 256바이트 미만의 완결된 JSON-RPC 응답. 뒤늦게 후행 공백 1MiB와 종료 chunk 전송. 기본 `ObjectMapper`. | 총 본문이 상한을 넘으므로 크기 초과 오류. | JSON 파싱이 먼저 끝나고 후행 공백은 하위 스트림 종료 과정에서 소비될 수 있다. **크기 오류 없이 정상 결과 반환 가능**. |
| **G — HTTP 오류 메시지 회귀** | HTTP 500, 본문 `upstream exploded`. | 종전처럼 `ApiError` 메시지에 상태와 본문 포함. | **`500 Internal Server Error`만 남고 본문 누락**. 기존 테스트도 `"500"`만 검사한다. |
| **H — RPC 행 정책 우회** | `event.get.maxRows=10000`, `CursorScan.pageSize=20000`. | 정책 상한으로 제한하거나 요청 거부. | 그대로 **`limit=20000`** 전송. |
| **I — 설정 무시** | 설계에 적힌 `zabbix.call.policies.trend.get.max-ids=1`. | ID를 1개씩 전송. | 설정을 읽지 않아 **기본 500** 사용. |

## 3. 이전 지적(R5·R6) 해소 여부

| 지적 | 판정 | 근거 |
|---|---|---|
| **R5 — `MockEnvironment` 의존성 및 Template 목 NPE** | **정적으로 해소됨** | `StandardEnvironment`·`MapPropertySource`로 교체했고, 실제 `ZabbixApiTemplate(client, MAPPER)`를 구성한다. [환경 구성:113](C:/worktrees/zm-159-be/engine-zabbix/src/test/java/com/dmove/moveseye/zabbix/client/ZabbixQueryExecutorTest.java:113), [Template 구성:129](C:/worktrees/zm-159-be/engine-zabbix/src/test/java/com/dmove/moveseye/zabbix/client/ZabbixQueryExecutorTest.java:129). 테스트 실행은 하지 않았다. |
| **R6 — 창 선생성·마지막 호출 deadline 누락** | **부분 해소, 종결 불가** | 창 지연 생성과 `Long.MAX_VALUE` 종료는 반영됐다. `scanWindows`에는 호출 직후 검사가 추가됐다. 그러나 **count·커서에는 없고, consumer 이후 완료 검사도 없다.** 추가 테스트는 `listByIds` 경로만 검증한다. [추가 테스트:488](C:/worktrees/zm-159-be/engine-zabbix/src/test/java/com/dmove/moveseye/zabbix/client/ZabbixQueryExecutorTest.java:488). |

R6의 실제 실행 시간 제한도 남아 있다. Client는 고정 30초 응답 timeout을 사용하고 논리 조회의 남은 deadline을 전달받지 않는다. [ZabbixClient.java:70](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixClient.java:70).

## 4. 결함 (🔴/🟡/🟢, 근거, 수정안)

**C3-R1~R7은 커밋 전 필수 수정이다.**

### 🔴 C3-R1 — 예상하지 않은 응답을 빈 완전 결과로 승인

- **근거:** [목록 변환:411](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixQueryExecutor.java:411), [예약 파라미터 검사:132](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixQueryExecutor.java:132). count도 [119행](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixQueryExecutor.java:119)에서 실패를 0으로 만드는 기존 `parseCount`를 재사용한다.
- **영향:** 반례 D. 잘못된 요청·응답을 정상적인 데이터 부재로 오인해 캐시·총계에 사용할 수 있다.
- **수정안:** 보호 층에서는 목록의 `countOutput` 등 비호환 옵션을 거부하고 배열 shape를 엄격히 검사한다. count도 유효한 비음수 정수인지 검증한다. 기존 동작 보존용 Template의 관대한 변환과 분리한다.

### 🔴 C3-R2 — 시간 예산 초과 후 `complete=true`

- **근거:** [count 반환:119](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixQueryExecutor.java:119), [커서 완료:284](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixQueryExecutor.java:284), [consumer·완료:240](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixQueryExecutor.java:240).
- **영향:** 반례 A·B. R6 미해소 부분이다.
- **수정안:** 모든 RPC 직후와 최종 완료 직전에 공통 시간 검사를 적용한다. 실행 시간 상한까지 보장하려면 남은 deadline을 전송 계층의 timeout·취소에 연결해야 한다.

### 🟡 C3-R3 — 넘친 페이지에서 행 예산 검사 생략

- **근거:** [ZabbixQueryExecutor.java:202](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixQueryExecutor.java:202). 행 예산 검사는 226행인데 초과 분기는 그 전에 `break`·`continue`·`return`한다.
- **영향:** 반례 C. 예산을 넘긴 뒤에도 재조회를 계속하며 중단 사유도 달라진다.
- **수정안:** `rowsSeen` 갱신 직후, 분할 판단보다 먼저 예산을 검사한다. `capReached`도 해당 응답의 크기를 반영한 뒤 종료 결과에 싣는다.

### 🔴 C3-R4 — 응답 상한이 전체 본문과 즉시 중단을 보장하지 못함

- **근거:** [ZabbixClient.java:185](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixClient.java:185), [readTree·close:188](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixClient.java:188).
- **의존 코드 확인:** 로컬 [Spring 6.1.14 소스](C:/Users/DMOVE/.gradle/caches/modules-2/files-2.1/org.springframework/spring-web/6.1.14/99951d6aad6ac9d57c7d6e7940536154d7b227e4/spring-web-6.1.14-sources.jar)의 `DefaultRestClient:518`, `HttpComponentsClientHttpResponse:82`는 종료 시 응답을 닫고 남은 entity를 소비한다. [HttpClient 5.3.1 소스](C:/Users/DMOVE/.gradle/caches/modules-2/files-2.1/org.apache.httpcomponents.client5/httpclient5/5.3.1/f92faa79e977f3e025649f4336ef0be374078556/httpclient5-5.3.1-sources.jar)의 `ResponseEntityProxy:126`도 스트림을 닫아 나머지를 소비한 후 연결을 반환한다.
- **영향:** 반례 E·F. 메모리 계수는 제한해도 수신·연결 점유의 종료성이 깨진다.
- **수정안:** 초과 시 원래 요청/연결을 **abort·discard**하여 본문 소진을 막는다. 성공 판정 전에는 HTTP 본문 끝까지 제한된 계수 경로로 확인한다. 느린 chunked 초과, 후행 공백, 오류 후 정상 호출의 풀 회복을 검증해야 한다.

### 🟡 C3-R5 — HTTP 오류 본문·문자 인코딩 회귀

- **근거:** [예외 생성:173](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixClient.java:173), [최종 메시지 변환:130](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixClient.java:130), [본문 파싱:189](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixClient.java:189).
- **영향:** 반례 G. 또한 `Content-Type: application/json; charset=ISO-8859-1`에서 `é`를 해당 인코딩으로 보낸 본문은 종전 converter가 읽을 수 있었지만 현재 직접 파싱은 실패할 수 있다.
- **수정안:** 제한된 오류 본문을 charset에 맞게 해석하고 메시지를 명시하는 exception factory overload를 사용한다. 성공 본문도 종전 charset 처리를 보존한다. UTF-8 전용으로 계약을 좁힌다면 의도적 변경으로 명시해야 한다.
- **테스트 공백:** [오류 테스트:117](C:/worktrees/zm-159-be/engine-zabbix/src/test/java/com/dmove/moveseye/zabbix/client/ZabbixClientBoundedReadTest.java:117)는 본문 보존을 주장하지만 실제 assertion은 상태 숫자만 확인한다.

### 🟡 C3-R6 — 커서 `pageSize`로 메서드별 행 상한 우회

- **근거:** [ZabbixQueryExecutor.java:265](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixQueryExecutor.java:265). 양수 여부만 검사한다.
- **영향:** 반례 H. “RPC 1회 크기는 정책 이하”라는 보호 계약을 호출자가 우회한다.
- **수정안:** 정책보다 큰 `pageSize`를 거부하거나 정책값으로 제한한다. 요청별 `maxTotalRows`도 0·음수 검증을 추가한다.

### 🟡 C3-R7 — 설정 키·기동 검증 범위 불일치

- **근거:** [설계 §0.1:13](../02-%EC%84%A4%EA%B3%84/ZM-159-%EB%8C%80%EC%9A%A9%EB%9F%89-%ED%98%B8%EC%B6%9C-%EB%B0%A9%EC%96%B4-%EA%B0%9C%EB%B0%9C-%EC%84%A4%EA%B3%84-v1.md)의 `policies`와 [구현:106](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixCallLimits.java:106)의 `policy`가 다르다. [기동 검증:73](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixCallLimits.java:73)은 기본 등록 메서드만 순회한다.
- **영향:** 반례 I. `policy.user.get.max-rows=-1` 같은 미등록 메서드 설정도 기동 시에는 통과한다.
- **수정안:** 설정 키를 하나로 통일한다. 설정된 정책 전체를 기동 시 검증하거나, 지원 메서드와 지연 검증 범위를 계약에 명확히 제한한다.

### 🟢 보완 — 결과 객체와 스트림의 작은 계약 정리

- `ZabbixScanResult.rows`에 대한 방어적 복사를 일관되게 적용한다. `@Value`만으로 List 불변성이 보장되지 않는다.
- 오류 본문 절단 모드에서도 길이 0인 `read`는 0을 반환하도록 정리한다.
- FILTER의 키 누락을 조용히 허용하면 중복 제거가 보장되지 않는다. 커서 키 검증·전진 검사도 consumer 전달 전에 수행하는 편이 적절하다.

## 5. C5~C7로 넘길 API 보완 목록

| 적용 단계 | 필요한 보완 | 현재 근거·제약 |
|---|---|---|
| **C5 — trend·typed 서비스** | `Function<JsonNode,T>` 기반 매퍼 또는 메타데이터를 보존하는 결과 변환 API. 기간 조회의 typed 소비형도 제공. | 현재 [listMapsByIds:73](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixQueryExecutor.java:73)만 별도 변환한다. 변환 때 `complete/reason/covered/calls/rowsSeen` 누락을 막아야 한다. |
| **C5 — trend 병합** | `sortfield` 없이 조회하고 `(itemid, clock)` 기준 병합·정렬. 진행 중인 현재 버킷의 캐시 제외. | 창 순서와 ID 청크 순서는 전역 정렬을 보장하지 않는다. |
| **C6 — history** | 변환 전 `(itemid, clock, ns)` 보존. 필요하면 복합 key extractor 제공. | 현재 raw `JsonNode`는 `ns`를 보존하지만 [기존 HistoryPoint 변환:55](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/timeseries/history/ZabbixHistoryServiceImpl.java:55)은 버린다. `dedupField` 하나로는 복합 키를 표현할 수 없다. |
| **C6 — 이벤트 커서×ID** | ID 분할과 커서 순회가 **하나의 예산·중복 제거 상태**를 공유하는 API. 빈 대상도 명시적으로 표현. | [CursorScan:348](C:/worktrees/zm-159-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixQueryExecutor.java:348)에는 ID 축이 없다. 바깥 반복에서 커서를 각각 호출하면 논리 조회의 예산이 매번 초기화된다. |
| **C6 — 전역 순서·top-N** | 정렬 키와 동점 키를 명시한 병합·최종 절단 계약. | `eventid ASC` 순회는 기존 `clock DESC` 계약을 그대로 대체하지 못한다. 청크별 top-N의 단순 연결도 부정확하다. |
| **C6 — 완전성 전달** | C4 중립 결과 타입으로 메타데이터 전달, 불완전 캐시 금지, 부분 total 표시. | raw 결과를 기존 List 반환형으로만 내리면 C3의 완전성 정보가 사라진다. |
| **C7 — H2~H4 집계** | 기간별 count/reduce와 FILTER 결과의 고유 ID 집계. 받은 행 예산과 실제 보유 행 예산의 의미 구분. | `countByIds`는 EXCLUSIVE만 지원한다. FILTER count 단순 합산은 계속 금지해야 한다. |
| **C7 — N1·호스트별 item.get** | 지원되는 ID 열거·페이지 계약 또는 조회 범위 축소 전략. | 호스트 하나에 50,001개 아이템이면 hostids를 더 나눌 수 없어 `NO_PROGRESS`다. 현 기반만으로 전체 목록 완전 조회를 보장할 수 없다. |
| **C5~C7 공통** | 읽기 메서드·시간 필터·커서 지원 여부를 명시하는 capability 검증. | 현재 `method`는 임의 문자열이며 읽기 전용 제약은 주석뿐이다. `WindowScan`의 `from/to`도 양방향 짝 검증이 필요하다. |