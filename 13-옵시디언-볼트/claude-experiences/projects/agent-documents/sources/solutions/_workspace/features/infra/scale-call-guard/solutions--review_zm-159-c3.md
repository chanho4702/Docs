# 검수 요청 — ZM-159 C3 대용량 읽기 보호 기반

- 요청: Claude · 2026-09-17 · 워크트리 `C:/worktrees/zm-159-be`(브랜치 `ZM-159`, **미커밋** — C1·C2와 같은 작업 트리에 섞여 있음)
- 설계: `_workspace/features/infra/scale-call-guard/devdesign_zm-159-scale-call-guard.md` v1 §0.1~§0.4·§0.8 · 이전 검수 `review_zm-159_codex-r1.md`(설계), `review_zm-159-c1c2_codex.md`(C1·C2, 이 파일의 R5·R6이 C3 대상)
- **C3 파일 목록(7)**: `engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/`의 `ZabbixClient.java`(수정)·`ZabbixCallLimits.java`·`ZabbixQueryExecutor.java`·`ZabbixScanResult.java`·`ZabbixScanStopReason.java`(신규), 테스트 `client/ZabbixQueryExecutorTest.java`·`client/ZabbixClientBoundedReadTest.java`(신규). 나머지 38파일은 C1·C2(검수 완료분)다.

## 범위
보호 층만 만든다. **아직 어떤 서비스·어댑터도 `ZabbixQueryExecutor`를 쓰지 않는다**(적용은 C5~). 단 `ZabbixClient`의 응답 바이트 상한은 **모든 호출에 즉시 적용**된다.

| 구성 | 내용 |
|---|---|
| `ZabbixCallLimits` | 엔진 모듈에 Spring Boot가 없어 `@ConfigurationProperties` 대신 `Environment`에서 읽고 생성자에서 검증(0 이하·int 초과면 기동 실패). 전역: `max-response-bytes`(64MiB)·`max-total-rows`(50만)·`max-calls`(2,000)·`deadline-ms`(120초). 메서드별 `zabbix.call.policy.{method}.max-ids/max-rows/window-seconds`(기본표 §0.1, 미등록 메서드는 500/10,000/1일). 롬복 `@Getter`·`@Builder(custom)`·`@Value MethodPolicy` |
| `ZabbixQueryExecutor` | `listByIds`/`listMapsByIds`/`scanByIds`(id 분할) · `countByIds`(EXCLUSIVE만) · `scanWindows`(기간 × 선택 id) · `scanByCursor`(eventid 커서). 요청 사양 `IdScan`/`WindowScan`/`CursorScan`(롬복 `@Value @Builder`) |
| 규칙 | 대상 0개 → RPC 0회 · 중복/빈 id 제거 · 요청 `limit = maxRows + 1`로 초과 판정 · 초과 조각은 버리고 **기간 반분 → id 반분 → 둘 다 1이면 NO_PROGRESS** · FILTER 축은 결과 키 중복 제거(**창 확정 시점**에만 기록) · 창은 양 끝 포함·지연 생성 · 예산(받은 행·호출 수·시간 — 호출 전·후 모두 검사) · RPC 예외 전파 · 보호 층이 관리하는 키(limit·분할 id·time_from/till·sortfield 등)를 기준 파라미터에 넣으면 거부 |
| `ZabbixScanResult` | `rows`·`complete`·`capReached`·`reason`·`calls`·`rowsSeen`·`coveredFrom/To`. 불완전이면 covered는 마지막으로 확정된 창까지 |
| `ZabbixClient` | `retrieve().body(JsonNode)` → `exchange(readBounded)`. Content-Length > 상한이면 읽지 않고 `ApiError(ZABBIX_API_ERROR)`, chunked는 세면서 읽다 초과 시 중단. HTTP 오류 상태는 `HttpClientErrorException`/`HttpServerErrorException`(본문 64KiB까지)로 다시 던져 기존 catch(→`ApiError(e.getMessage())`)를 탄다. 빈 본문은 null. 생성자에 `ZabbixCallLimits` 추가 |

## 의도·버린 대안
- 읽기 전용·순차 청크(풀 10 약속 유지). 쓰기 자동 분할은 부분 성공 계약이 없어 제외.
- 초과 조각을 버리는 이유: `limit`으로 잘린 조각은 어떤 행이 빠졌는지 알 수 없다. 창 안의 앞 청크 결과도 창을 쪼개면 다시 읽으므로 **창 단위로 확정 후 전달**한다(소비자는 창 순서대로, 창 안에서는 청크 순서로 받는다).
- 커서 전진 불가 판정: 다음 커서가 이전 커서보다 크지 않으면 중단.
- 응답 크기: 64MiB 기본. 초과는 "쿼리를 좁히거나 설정을 올리라"는 메시지.

## 중점 확인 요청
1. **완전성 판정의 구멍** — `complete=true`인데 실제로 빠진 행이 있을 수 있는 경로(창 분할 + id 분할 조합, FILTER 중복 제거, 커서 경계, `rowsSeen` 예산이 재조회 행까지 세는 것).
2. **무한 루프·폭주** — 분할이 끝나지 않거나 호출 수가 기하급수로 느는 입력(예: 모든 청크가 매번 넘침, 창 크기 1초 × 수십만 창)은 예산으로 반드시 멈추는가.
3. **`ZabbixClient` 변경의 회귀** — 기존 오류 매핑(401 판정·ApiError 메시지), 빈 본문, 문자 인코딩(`readTree(InputStream)`의 자동 감지 vs 종전 메시지 컨버터), 커넥션 반환(예외로 중단할 때 스트림/커넥션이 풀로 돌아가는가), 계측(`metrics.record`)이 유지되는가.
4. `LimitedInputStream`의 경계(정확히 상한 바이트, 상한+1, `skip`, 한 바이트 `read()`).
5. `ZabbixCallLimits`: 두 생성자 + `@Autowired` 선택, `defaults()`(environment null) 경로, 메서드 이름에 `.`이 든 설정 키가 `Environment`에서 기대대로 읽히는가, 캐시(`resolved`) 동시성.
6. 롬복 사용: `@Value @Builder(toBuilder)` + `@Builder.Default`(ZabbixScanResult), `@Builder` private 생성자, `@Setter(PACKAGE)`의 시계 주입.
7. 이 기반으로 C5(trend 분할)·C6(H7·E3 불완전 표시)·C7(H2~H4·N1)을 옮길 때 **API가 모자란 곳**(예: typed 행 매퍼, history `ns` 보존 병합, 전역 정렬·top-N, 호스트 단위 `item.get`의 행 상한).

## 검증 현황
- ✅ `:engine-zabbix:test` **194 통과**(C3 신규 `ZabbixQueryExecutorTest` 26 + `ZabbixClientBoundedReadTest` 6 포함 — 개수는 09-17 전체 재실행 기준)
- ✅ 앱 `compileJava`·`compileTestJava`, `AuthorizationContractIT` 11 통과(현재 작업 트리 = C1+C2+C3, 스프링 구성에 `ZabbixCallLimits`·`ZabbixQueryExecutor` 주입 확인)
- ✅ 변이 검출: FILTER 중복 제거를 읽는 시점으로 되돌림 · 창 경계를 겹치게 함 · 대상 0개여도 호출 · chunked 상한 해제 → 모두 실패 확인
- ❌ 미실시: 앱 전체 `:test` · 실 자빅스 대용량 응답 · 커넥션 풀 반환 실측(예외 중단 후 풀 고갈 여부)

## 검수 결과
(Codex 기록 — 별도 파일 `review_zm-159-c3_codex.md`)

## 반영 기록 (Claude, 2026-09-17) — 코덱스 판정 "수정 후 커밋", 필수 C3-R1~R7

- [x] **R1 비배열·비정수를 빈 완전 결과로 승인** — 보호 층 목록 응답은 배열이 아니면 `ApiError(ZABBIX_API_ERROR: unexpected response …)`. 목록·커서 순회의 기준 파라미터에 `countOutput`·`preservekeys`가 있으면 거부. `countByIds`는 음이 아닌 정수만 인정(`strictCount`, 합계는 `Math.addExact`). FILTER 결과에 중복 제거 키가 없거나 커서 필드가 정수가 아니면 `ApiError`. (관대한 변환은 동작 불변 층 `ZabbixApiTemplate`에만 남긴다.)
- [x] **R2 시간 예산 초과 후 complete** — `countByIds`·`scanByCursor`도 RPC 직후 검사, 커서는 소비자 처리 뒤에도 검사, `scanWindows`는 창 확정(소비자 전달) 뒤에도 검사. 반례 A(count·커서 마지막 호출)·B(느린 소비자) 테스트 고정.
- [x] **R3 넘친 페이지의 행 예산 생략** — 행 예산을 분할 판단보다 먼저 본다. `capReached`도 그 응답을 반영한 뒤 결과에 싣는다. 반례 C(RPC 1회로 BUDGET_ROWS) 고정.
- [x] **R4 응답 상한의 종료성** — 전송을 Spring RestClient에서 **Apache HttpClient 직접 호출(`executeOpen`)**로 바꿨다. 중간에 멈추는 모든 경우 **응답을 닫기 전에 `post.cancel()`** — 닫기가 남은 본문을 소진하지 않고 연결을 버린다. Jackson 자동 닫기를 `CloseShieldInputStream`으로 막고, 파싱 뒤 **본문 끝까지 세며 읽는다**(`drainToEnd`). 반례 E(끝없는 chunked — 3회 연속 초과 후 풀 2개로도 정상 호출 성공, 10초 선점 타임아웃 안에서 0.8초)·F(JSON 뒤 300ms 후 1MiB 공백) 고정. 변이: `cancel` 제거 → E 실패, `drainToEnd` 제거 → F 실패(초판 F 테스트는 파서 선읽기로 우연히 잡혀 변이가 생존 → 전송 지연을 넣어 보강).
- [x] **R5 오류 본문·charset 회귀** — HTTP 4xx·5xx는 종전 `DefaultResponseErrorHandler`와 같은 `상태 사유: "본문"`(빈 본문 `[no body]`, 개행 `<LF>`) 메시지의 `ApiError`. 성공 본문은 charset이 UTF-8/16/32가 아니면 그 charset Reader로 읽는다. I/O 오류는 종전 `I/O error on POST request for "url": …` 형식. 요청 형태(POST·`Content-Type: application/json`·UTF-8·Content-Length 확정·chunked 아님) 테스트 고정. 반례 G·ISO-8859-1 고정.
- [x] **R6 커서 pageSize 우회** — `1..정책 maxRows` 밖이면 거부. 요청별 `maxTotalRows` 0 이하 거부. `from`/`to`는 둘 다 있거나 둘 다 없어야 한다.
- [x] **R7 설정 키·기동 검증** — 키는 단수 `zabbix.call.policy.{method}.*`로 확정하고 설계서를 정정했다. 기본표 메서드 + **설정 원본에 등장하는 모든 메서드**의 정책을 기동 시 검증(`configuredPolicyMethods`, 복수형 `policies`는 인정하지 않음).
- [x] 🟢 `ZabbixScanResult.rows`는 생성자에서 `List.copyOf`(빌더 경로 포함), `reason` null→NONE. 절단 모드 `read(buf, off, 0)`은 0 반환. `skip`은 읽어서 세도록 변경. `listMapsByIds`는 covered 메타데이터까지 보존.
- 검증: `:engine-zabbix:test` **211 통과**. 변이 3건(취소 제거·끝까지 읽기 제거·예산 순서 역전) 모두 검출.
- 남긴 것(이유): RPC 실행 중 deadline 강제 중단(전송 timeout에 남은 예산 연결)은 설계상 C4 이후 과제로 둔다 — 현재는 호출 전·후 판정 + 30초 응답 타임아웃. §5 API 보완 목록은 C5~C7 착수 시 반영.
