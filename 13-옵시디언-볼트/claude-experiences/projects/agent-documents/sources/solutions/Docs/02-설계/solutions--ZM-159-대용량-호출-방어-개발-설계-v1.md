# ZM-159 대용량 호출 방어 — 개발 설계 v1

- 이슈: **ZM-159 「대용량 호출 방어」**(Jira, 작업) · 작성 2026-09-17 · **상태: ✅ 종료(2026-09-21)**
- 📍 **문서 지도**: [`../INDEX_zm-159-scale-call-guard.md`](../00-%EB%AC%B8%EC%84%9C-%EC%A7%80%EB%8F%84/%EB%8C%80%EC%9A%A9%EB%9F%89-%ED%98%B8%EC%B6%9C-%EB%B0%A9%EC%96%B4-%EC%9E%91%EC%97%85%EA%B5%B0-%EB%AC%B8%EC%84%9C-%EC%A7%80%EB%8F%84-%28ZM-159%29.md) — 결과 보고서·검수·다이어그램·남은 일이 전부 여기서 갈린다
- 결과: [`../reports/zm-159_scale-call-guard.md`](../09-%EB%B3%B4%EA%B3%A0%EC%84%9C/ZM-159-%EC%9E%91%EC%97%85-%EB%B3%B4%EA%B3%A0-%EB%8C%80%EC%9A%A9%EB%9F%89-%ED%98%B8%EC%B6%9C-%EB%B0%A9%EC%96%B4-%28%ED%98%B8%EC%8A%A4%ED%8A%B8-5%EC%B2%9C-%EC%95%84%EC%9D%B4%ED%85%9C-1%EC%B2%9C%EB%A7%8C%29.md) · 남은 일: [`../planning/backlog_zm-159-후속.md`](../03-%EA%B8%B0%ED%9A%8D-%EB%B0%B1%EB%A1%9C%EA%B7%B8/ZM-159-%ED%9B%84%EC%86%8D-%EB%82%A8%EC%9D%80-%EC%9E%91%EC%97%85-%EC%A0%95%EB%B3%B8.md)
- 설계 이력: v1(코덱스 r1 필수 8건 반영) → C1~C4·C6·결함 4건(09-17) → C8·C7·H5·범위 설정(09-18) → **C5(09-19, 검수 5회 왕복)**
- 🔴 **v1이 v0보다 우선한다.** 아래 §0이 결정 사항이고, §1~§6(v0 본문)은 §0과 충돌하면 §0을 따른다.

---

## 0. v1 결정 (코덱스 r1 필수 8건 반영)

### 0.1 보장할 상한 — 세 층으로 나눈다 (필수 1)
| 층 | 상한 | 설정 키(`zabbix.call.*`) | 초과 시 |
|---|---|---|---|
| **RPC 1회** | 입력 ID 수 · 반환 행 수(`limit`) · **응답 바이트** | 메서드별 `policy.<method>.max-ids`·`max-rows`·`window-seconds`(단수 `policy` — C3 검수 R7), 전역 `max-response-bytes` | ID는 자동 분할(읽기만). 행은 `capReached`. 바이트 초과는 **읽기를 중단하고 예외**(메모리 보호 — 전송 계층 `ZabbixClient`에서 집행) |
| **논리 조회 1건** | 총 보유 행 · 총 RPC 수 · 전체 시간(deadline) | `max-total-rows`·`max-calls`·`deadline-ms` | 순회 중단 → `complete=false, reason=BUDGET_*` |
| **서비스 전체** | 동시 논리 조회 수 | (후속 — ZM-159 범위 밖, 풀 10 유지) | — |
- **ID 없는 조회도 대상**: `item.get`/`trigger.get`을 스코프 없이 부르는 경로(N1 아이템 관리)는 행 상한+페이지 조회로 막는다. ID 분할로는 막히지 않는다.
- **서브셀렉트(`selectItems` 등)**: 대량 대상에 붙이는 것을 정책으로 금지할 수는 없으므로, 사용처(T-B·LAST_CHECK)를 개별 수정하고 응답 바이트 상한이 최후 방어선이 된다.
- 기본값은 **메서드별**로 둔다(일괄 500 폐기): `trend.get` itemids 500 × 창 24h / `history.get` itemids 200 · rows 100,000 / `event.get`·`problem.get` eventids·objectids 500 · rows 10,000(커서) / `item.get` hostids 50 · rows 50,000.

### 0.2 공통 API — 반환형을 둘로 분리 (필수 2)
- **`ZabbixApiTemplate`(동작 불변 층)** — 기존 호출을 그대로 옮기는 용도. 반환형은 기존과 동일.
  `raw(JsonNode)` · `list(List<Map>)` · `call(TypeReference<T>)`(타입 변환 목록도 이것으로 — null 의미가 기존 `ZabbixClient.call`과 같다) · `object(Map)` · `count(long)` · `firstId(String)` · `exec(void)` · 정적 `parseCount`·`firstId`
  - `raw`는 특수 디코더(history.push 행별 결과·user.get role 정규화·history/trend 파싱·apiinfo.version 문자열)용 탈출구다.
- **`ZabbixQueryExecutor`(보호 층, 커밋 3부터)** — 분할·예산·완전성. 반환형은 `ZabbixScanResult<T>`(롬복 `@Value @Builder`: `rows`, `complete`, `capReached`, `reason`, `calls`, `coveredFrom/To`).
  - 소비형 순회 `scan(spec, Consumer<List<T>> pageConsumer)`를 기본으로 하고, 전체 리스트 반환은 보유 행 상한 안에서만 허용한다(H3 누적 집계용).
  - **쓰기(`*.create/update/delete/mass*`, `history.push`, `event.acknowledge`, `task.create`, `script.execute`, 로그인)는 자동 분할 대상이 아니다.** 부분 성공 계약이 없기 때문이다.
- **빈 대상 ≠ 필터 없음**: `ZabbixParams.putIfNotEmpty`는 "선택 필터"에만 쓴다. 대상 ID 집합을 계산한 결과가 0개면 `ZabbixQueryExecutor`가 **RPC 0회로 빈 완전 결과**를 돌려준다(필터 생략 금지).
- **직접 접근 금지**: `ZabbixClient`를 부르는 곳은 `client/` 패키지(Template·Executor)뿐이다 — **컴파일된 클래스 상수 풀 검사**(`ZabbixClientAccessTest`, 주석·문자열에 속지 않음)로 고정.

### 0.3 분할·병합 규칙 (필수 3)
- **시간 창**: Zabbix 7.0은 `time_from`·`time_till` 양 끝을 포함하므로 **창도 양 끝 포함 `[a, e]`로 만들고 다음 창은 `e+1`에서 시작**한다(구현 `ZabbixQueryExecutor.nextWindow` — 반열림 `[a,b)`+`b-1`과 같은 결과). 창은 **필요할 때 하나씩** 만든다(C3 검수 R6). `from>to`면 RPC 0회·빈 완전 결과, `from==to`는 창 1개, 창 크기 ≤0은 거부, `Long.MAX_VALUE` 경계는 넘침 없이 마지막 창으로 끝낸다.
- **창 정렬**: 창 경계는 정시에 맞추되 **원래 요청 범위를 넓히지 않는다**(첫 창 시작=from, 마지막 창 끝=to). 현재 시각이 걸친 trend 버킷은 미확정으로 보고 캐시하지 않는다.
- **ID 분할**: 입력 ID는 먼저 중복 제거. 결과 고유 ID를 나누는 축(`itemids`·`eventids`·`triggerids`로 자기 객체 조회)은 배타적. **필터 축(`hostids`·`groupids`·`objectids`로 이벤트 조회)은 결과가 겹칠 수 있으므로 결과 고유 키로 병합**한다. `countChunked` 단순 합산은 **배타 축에서만** 허용(API에 `exclusive` 플래그 필수).
- **정렬**: 청크를 이어 붙인 결과는 전역 정렬이 아니다. 전역 순서가 계약이면 병합 후 재정렬(정렬 키+동점 키 명시). 전역 top-N은 병합 후 자른다.
- **이벤트 커서**: `sortfield=eventid ASC` + `eventid_from=마지막+1`(Zabbix 7.0 `event.get`·`problem.get` 문서상 지원 — 설치본 회귀 검증 필요). 한 페이지가 비면 종료.
- **history 같은 초**: 중복 키는 `(itemid, clock, ns)`. `ZabbixHistoryServiceImpl`이 `ns`를 버리므로 보호 층은 `ns`를 보존해 병합하고, 기존 소비자 모델은 바꾸지 않는다. 같은 `(itemid, clock)`에 상한 이상이 몰려 전진 불가면 **ID를 더 쪼개고, 1개 ID에서도 불가하면 `complete=false, reason=NO_PROGRESS`로 종료**(무한 재시도 금지).
- **trend**: `sortfield`를 붙이지 않는다(문서화되지 않음). 병합 후 `(itemid, clock)` 정렬.

### 0.4 완전성 계약 (필수 4)
- 내부: `capReached`(어떤 RPC가 `limit`에 닿음) ≠ `complete`(요청 범위를 끝까지 순회했고 실패·예산 초과가 없음). 페이지를 끝까지 읽었다면 `capReached=true`여도 `complete=true`. `limit+1` 조회로 추가 행 존재를 확인한다. limit 0(무제한)은 비교하지 않는다. 의도적 top-N은 완전성 판정 대상이 아니다.
- **engine-api 중립 결과 타입**(커밋 4): `QueryCompleteness(boolean complete, String reason, Long coveredFrom, Long coveredTo)` + `SeriesResult(List<Series>, QueryCompleteness)` + `AlertHistoryResult(List<Alert>, QueryCompleteness)`. `MetricPort`·`AlertPort`에 **새 메서드 추가**(기존 List 메서드는 유지하되, 보호를 적용하는 소비자는 새 메서드로 함께 이행). `LicenseGuarded*Port` 위임 추가.
- REST: 적용 화면(H7 인터페이스 상태·E3 이력 모드)의 응답에 `completeness{complete, reason}` 추가 → `contract_*.md`·FE 타입 동시 반영. 부분 결과의 `total`은 **정확한 총계처럼 내리지 않는다**(`totalIsExact=false`).
- FE 증분 차트: `coverage==="COMPLETE"`는 서버가 `complete=true`일 때만 내린다. 불완전하면 `PARTIAL` + 커서 비전진(ZM-136 불변식 유지).
- 캐시: `complete=false` 결과는 Redis에 저장하지 않는다.

### 0.5 T-A 삭제 보호 재설계 (필수 5)
- `event_problems` 좀비 정리(`deleteStaleUnresolvedBefore`)는 **"최근 완전 보정 동기화 성공 시각"이 삭제 기준 시각보다 뒤일 때만** 실행한다. 증거는 DB(`scheduler`/`event_sync_state` 한 행: `last_complete_full_sync_at`) — 재기동·다중 인스턴스에서도 유지.
- "완전" = 보정 동기화가 상한 미도달(또는 커서로 끝까지 순회) + 예외 없이 upsert 반영 완료.
- 해소 30일 정리(`deleteResolvedBefore`)는 그대로 둔다(분리).
- 되짚기(ZM-145 복합 커서)는 **유지**한다(무조건 중단 폐기).
- 라이선스 차단 중 cleanup(`BuiltInJobs:114`)도 위 증거 규칙으로 자동 보호된다.
- problem 커서 수집(A-2)은 커밋 분리.

### 0.6 T-B 선행 조건 (필수 6)
- `ZabbixMetricAdapter.queryLatest`의 `LatestValue.epoch`가 항상 `0L`이다(`:191`). T-B 착수 전 `ITEM_OUTPUT`에 `lastclock` 추가 + `ZabbixBasicItem.lastclock` 매핑 + epoch 채움을 먼저 한다. 미수집·unsupported·lastclock 0은 "신선하지 않음".
- T-B는 이번 이슈의 **마지막 별도 커밋**이며, 커버리지 표시 변경은 변경 이력에 명시한다.

### 0.7 범위·순서 (필수 7)
| 커밋 | 내용 | 성격 |
|---|---|---|
| **C1** | `ZabbixApiTemplate`·`ZabbixParams` 도입 + 단순 호출부(목록·개수·ID·실행) 이행 | 동작 불변 |
| **C2** | 특수 호출부(로그인·객체 결과·history.push·user.get 정규화·health) 이행 + `ZabbixClient` 직접 접근 금지 테스트 | 동작 불변 |
| C3 | `ZabbixQueryExecutor`·`ZabbixCallLimits`(검증 포함)·응답 바이트 상한(HttpClient 직접 호출·초과 시 취소) | 보호 기반 |
| **C4** | **`ZabbixMethod` 이넘**(메서드 111개·성격·공식 문서 링크, 버전은 `DOCS_VERSION` 한 곳) + 호출부 전부 이넘으로 + 보호 층은 READ만 분할 + 조사표 대조 테스트(사용자 요청 09-17 "버전 바뀌어도 바꿔 끼우기 쉽게") | 구조 |
| C5 | engine-api 완전성 계약 + LicenseGuarded 위임 | 계약 |
| C6 | **사용자 결정(09-17) "한 번에 다 가져올 일은 없다 — 과하게 하지 말 것"에 따라 '전부 가져오던 곳'만 조회 방식 변경**: AWS 매처(T-B, epoch 선행) · 아이템 관리(호스트 지정 필수, N1) · 리포트·그룹 추이(필요 키만+흘려보내며 집계, H1·H2) · 네트워크·인터페이스 차트(상위 N·trend, H6·H7) · 자산 동기화 host.get 청크 → **힙 실측 후 응답 상한 16MiB로** | 보호 적용 |
| C7 | H7·E3 불완전 표시(BE+FE 계약) | 보호 적용 |
| C8 | H2~H4·N1 집계·목록 | 보호 적용 |
| C9 | H5·H6 배치화(AdaptiveSeriesQuery 48h 전환 유지) | 보호 적용 |
| 별도 | T-A 삭제 보호 / X1 교착 / X2+N2 차트 식별·SUM / X6 AWS 100 / T-B | 독립 결함 |
- **ZM-157로 이관**: `HostService:1017·1121` 캐시 키 권한 축(S2). ZM-159에서 수정하지 않는다.
- **후속 이슈**: E1·E2·C1(DB 풀 — 용량 검증 필요)·B6·AI 정확성·APM.
- **롬복**: 신규 클래스(`ZabbixParams`·`ZabbixScanResult`·`ZabbixCallLimits`·Template·Executor)에 적용. 기존 수동 생성자의 **일괄 치환은 하지 않는다**(설정 주입·초기화 로직 보존, 특히 `ZabbixClient`). 이행하며 생성자가 단순 필드 주입뿐인 서비스 구현은 이미 `@RequiredArgsConstructor`다.
- `lombok.config`(BE 루트): `config.stopBubbling = true`, `lombok.addLombokGeneratedAnnotation = true`. `@Value @Builder`는 package-private 전체 인자 생성자에 주의, 컬렉션 필드는 `@Singular` 대신 `List.copyOf`(대량 복사·누적 의미 회피), 역직렬화가 필요한 타입만 `@Jacksonized`. `@ConfigurationProperties`에는 `@Validated`+`@Positive`/`@Min` 실제 제약을 단다.

### 0.8 수용 기준 (필수 8)
- C1·C2: **요청 본문(메서드·params·auth) + 응답 변환(null·빈 배열·객체·스칼라) + 예외 의미** 동일 — 캡처 스텁 테스트.
- C3~: 중복 host/group 결과 병합 · 동일 초 대량 history(ns) · 정확히 limit개 · limit+1개 · 중간 청크 실패 · 전체 예산 초과 · 빈 대상 RPC 0회 · 시간 창 경계(inclusive) · 전진 불가 종료 · invalid 설정 기동 실패.
- 별도: X1 동시 요청 3개 교착 재현→해소 · T-A 수집 중단/라이선스 차단 중 cleanup 무삭제 · T-B lastclock · X2 범례 토글 · N2 timestamp 결합 SUM · X6 101/200/201개 분할.
- ZM-159 완료 ≠ 목표 규모 수용 완료(부하 시험은 `devdesign_load-test-synthetic-mock.md` 트랙).

---

# (이하 v0 본문 — 참고용)
- 근거: [analysis/audit_scale-5000-hosts.md](../04-%EB%B6%84%EC%84%9D-%EA%B0%90%EC%82%AC/solutions--%EB%8C%80%EC%9A%A9%EB%9F%89-%EB%8C%80%EB%B9%84-%EC%A0%84%EC%88%98-%EA%B0%90%EC%82%AC-%ED%98%B8%EC%8A%A4%ED%8A%B8-5000%EB%8C%80-%EC%95%84%EC%9D%B4%ED%85%9C-1000%EB%A7%8C.md) · [planning/tickets_scale-hardening.md](../03-%EA%B8%B0%ED%9A%8D-%EB%B0%B1%EB%A1%9C%EA%B7%B8/solutions--%EB%8C%80%EC%9A%A9%EB%9F%89-%EB%8C%80%EB%B9%84-%EB%B3%B4%EA%B0%95-%ED%8B%B0%EC%BC%93-%EC%B4%88%EC%95%88-%281%EC%B0%A8-%EC%95%8C%EB%9E%8C-%EC%83%81%ED%95%9C-AWS-%EB%A7%A4%EC%B2%98%29.md)
- 워크트리: BE `C:/worktrees/zm-159-be`(브랜치 `ZM-159`, master `8df357d` 기준). FE·AI는 필요 시 같은 규칙으로 만든다.
- 사용자 지시(09-17): **① 자빅스 REST 호출부를 공통 로직으로 빼서 유틸로 쓰게 ② 롬복 활용 ③ 코덱스 검토 후 ZM-159로 착수**

---

## 1. 목표와 비목표

**목표** — "호스트·아이템·알람 수가 커져도 **자빅스 1회 호출 크기가 설정값을 넘지 않는다**"를 코드 구조로 보장한다.
1. 자빅스 호출 공통부를 한 곳(유틸)으로 모은다 — 반복 코드 제거 + 분할·상한·잘림 판정을 한 곳에서 강제.
2. 감사 🔴 중 **자빅스 1회 호출이 규모에 비례하는 경로**를 그 유틸로 옮긴다.
3. 규모와 무관하게 지금 틀린 것 중 **작고 격리된 것**을 함께 고친다.

**비목표(후속 이슈로 분리)** — 알림 벨 SQL 전환(E1)·읽음 상태 재설계(E2)·공용 스냅샷(R4)·BE 다중 인스턴스 전제(R7)·APM 수신·롤업(C3·C4·수신 7~11)·FE 대량 렌더(F3·F11 등)·AI 결과 크기 상한(A4).
**ZM-157과의 경계** — 권한(`CallerContexts` 미연결 사용자 SYSTEM 매핑 S1, AI 요약 캐시 키)은 **ZM-157 워크트리에서 수정 중**이므로 여기서 건드리지 않는다.

---

## 2. 현행 구조 (코드 확인)

- 모든 호출은 `engine-zabbix/.../client/ZabbixClient.callRaw(method, params, token)` 한 곳을 지난다(풀 10·응답 30초·계측). **분할·상한·잘림 판정은 없다.**
- 호출부 **134곳 / 26파일**(`*ServiceImpl`·`*Adapter`). 반복 패턴:
  - `callRaw` → `isArray` 확인 → `convertValue(List<Map>)` — `ZabbixHostServiceImpl.callRawList`·`ZabbixTemplateServiceImpl.callRawList`에 **같은 private 메서드 두 벌**, 나머지는 인라인.
  - `parseCount`(countOutput) — `ZabbixItemServiceImpl`에 public static으로 두고 다른 패키지가 재사용.
  - `firstId(result, "itemids")` 류 — 파일마다 따로.
  - `if (x != null && !x.isEmpty()) params.put(...)` 파라미터 조립이 파일마다 반복.
- 분할은 `ZabbixAlertAdapter.OBJECTIDS_CHUNK = 500` **한 곳뿐**(로컬 상수).
- `trend.get`(`ZabbixTrendServiceImpl:23`)은 limit·분할 없음. `history.get`(`ZabbixHistoryServiceImpl:47`)은 limit 10만 기본, ASC 정렬이라 잘리면 **최근 구간이 사라진다**.
- 롬복: 모듈 3개 모두 의존성 있음(`build.gradle.kts`), `lombok.config` 없음. `@RequiredArgsConstructor`·`@Slf4j`는 이미 널리 쓰고 `@Builder`는 `HistoryGetParams` 등 일부.

---

## 3. 설계

### 3.1 공통 호출 유틸 — `ZabbixApiTemplate` (신규, `engine-zabbix/.../client/`)

`RestTemplate`처럼 **호출 + 결과 변환 + 분할**을 한 곳에서 제공하는 컴포넌트. 서비스 구현은 `ZabbixClient`를 직접 부르지 않고 이것을 쓴다.

```java
@Component
@RequiredArgsConstructor
public class ZabbixApiTemplate {
    private final ZabbixClient client;
    private final ObjectMapper objectMapper;
    private final ZabbixCallLimits limits;

    // 기본 변환
    public List<Map<String, Object>> list(String method, Object params, String token);
    public <T> List<T> list(String method, Object params, String token, TypeReference<List<T>> type);
    public long count(String method, Object params, String token);          // countOutput 스칼라
    public String firstId(String method, Object params, String token, String idsField); // *.create
    public void exec(String method, Object params, String token);           // 반환 무시(update/delete)

    // 분할 조회 — idParam(itemids/hostids/eventids/objectids/triggerids)을 chunk로 나눠 순서 보존 병합
    public List<Map<String, Object>> listChunked(String method, ZabbixParams base, String idParam,
                                                 Collection<String> ids, String token);
    public long countChunked(...);                                          // 청크 합산
    // 기간 분할 — [from,to]를 window 초 단위로 나눠 호출(trend.get/event.get 스캔용)
    public List<Map<String, Object>> listWindowed(String method, ZabbixParams base, long from, long to,
                                                  long windowSeconds, String token);
}
```

- **잘림 판정 한 곳**: `limit`을 건 호출이 `size >= limit`이면 `ZabbixListResult.truncated=true`로 돌려준다(아래 3.3). 분할 호출은 청크별 판정을 OR로 합친다.
- **청크 크기**: `ZabbixCallLimits`(설정) — 기본 `id-chunk-size=500`(현 알람 어댑터 값과 동일), `trend-window-seconds=86400`, `history-default-limit=100000`, `max-ids-per-call`(방어선, 초과 시 강제 분할).
- **동시성**: 청크는 **순차** 호출한다(풀 10 약속·ZM-133 문구 유지). 병렬화는 이번 범위 밖.

### 3.2 파라미터 빌더 — `ZabbixParams` (신규)

```java
ZabbixParams.of()
    .output("itemid", "key_", "lastvalue")
    .putIfNotEmpty("hostids", hostids)      // null·빈 컬렉션이면 생략
    .filter("key_", keys)
    .search("key_", prefix).startSearch()
    .limit(n)
    .toMap();                                // LinkedHashMap(키 순서 보존 — 기존 요청 본문과 동일)
```
- 목적: `if (x != null && !x.isEmpty()) put` 반복 제거 + **분할 유틸이 기준 파라미터를 복제해 청크 id만 바꿔 끼우는 것**을 안전하게(깊은 복사) 한다.
- 기존 `Map<String,Object>`를 받는 서비스 인터페이스(`getRaw(token, Map)`)는 **바꾸지 않는다**(호출자 app 모듈 수백 곳 영향). 빌더는 `toMap()`으로 기존 인터페이스에 그대로 들어간다.

### 3.3 결과 모델 — 롬복

```java
@Value @Builder
public class ZabbixListResult<T> {        // 엔진 내부용
    @Singular List<T> rows;
    boolean truncated;                     // 어떤 청크든 limit에 닿았는가
    int calls;                             // 실제 호출 수(계측·로그)
}

@Data @Validated
@ConfigurationProperties("zabbix.call")
public class ZabbixCallLimits {            // 설정 바인딩
    private int idChunkSize = 500;
    private long trendWindowSeconds = 86_400;
    private int historyDefaultLimit = 100_000;
    private int maxIdsPerCall = 1_000;
}
```
- 롬복 적용 원칙: **새 코드**는 `@RequiredArgsConstructor`·`@Value`/`@Builder`·`@Slf4j`를 기본으로 쓴다. **손대는 기존 클래스**는 수동 생성자·getter를 롬복으로 치환한다. 손대지 않는 파일은 이번에 바꾸지 않는다(diff 폭 억제).
- `record`로 이미 정의된 모델(engine-api)은 그대로 둔다 — 레코드를 롬복으로 바꾸는 것은 개악.
- `lombok.config` 신설 여부는 검수 질문(Q5).

### 3.4 잘림을 포트 밖으로 알리는 방법 (검수 질문 Q3)

`MetricPort.querySeries/queryTrend`의 반환 `Series`는 proto 계약(`engine-api`)과 짝이라 필드 추가는 계약 변경이다. 후보:
- **A. `Series`/`TrendSeries`에 `truncated` 필드 추가** — 정직하지만 engine-api·proto 주석·LicenseGuarded 래퍼·호출처 전부 영향.
- **B. 호출 결과 래퍼 `SeriesResult(List<Series>, boolean truncated)`를 새 메서드로 추가**(기존 메서드는 위임) — 호출처를 점진 이행.
- **C. 요청 스코프 컨텍스트(ThreadLocal)에 잘림을 기록 → 응답 어드바이스가 `truncated` 필드/헤더로 노출** — 침습 최소, 그러나 비동기·배치 경로에서 누락 위험.
- 초안 추천: **B**(점진 이행 + 명시성). 이번 이슈에서는 인터페이스를 추가하고 **H7 인터페이스 상태 차트·E3 이력 모드**에만 적용.

### 3.5 적용 대상 (이번 이슈)

| 단계 | 대상 | 변경 | 감사 ID |
|---|---|---|---|
| S0 | 26개 `*ServiceImpl`·`*Adapter` | `callRawList`/`parseCount`/`firstId`/인라인 변환 → `ZabbixApiTemplate`. **동작 불변 리팩터**(요청 본문 바이트 동일) | — |
| S1 | `ZabbixTrendServiceImpl` + `ZabbixMetricAdapter.fetchPointsBatched/fetchTrendBuckets` | itemid 청크 × 기간 창 분할 | H1=C5=B1 |
| S1 | `ResourceTrendQuery` 디스크·트래픽 | 계열 전량 조회 후 앱 필터 → **필요한 서브키만 조회**(pused·bytes) | H1 |
| S1 | `ZabbixHistoryServiceImpl` + 메트릭 어댑터 RAW | itemid 청크, 청크별 limit, 잘림 판정 | H7=B2 |
| S1 | `ZabbixMetricAdapter.buildResolver/fetchFamilyItems` | hostids 청크 | B3 |
| S1 | `ZabbixAlertAdapter` fetchRules·fetchByIds·countActive | 로컬 `OBJECTIDS_CHUNK` → 공용 청크 | B4 |
| S1 | `AlertHistoryQuery.ofGroupWindow` 사용처(그룹 알림 추이·리포트) | 기간 창 분할 + 건수는 countOutput | H2 |
| S1 | `HostService` hostgroup-problems(H3)·그룹 문제 상세(H4) | 기간 창 분할 스트리밍 누적 / id distinct + 상한·페이징 | H3·H4 |
| S2 | `InterfaceService`(H7)·`EventService` 이력 모드(E3) | 잘림 결과 노출(3.4 B) | H7·E3 |
| S3 | `NetworkArchitectureService:159` | `problemAggByHost` 1콜 | H5 |
| S3 | `NetworkService.getLineCharts` | 인터페이스×타입 → `querySeries` 1배치 | H6 |
| S3 | `OverviewCallExecutor` | 중첩 제출 교착 제거(자식은 별도 풀/호출 스레드, join 타임아웃) | X1 |
| S3 | `AwsReadOnlyGateway.describeInstanceStatuses` | ID 100개 분할 | X6 |
| S3 | `HostService:1017`·`:1121` 캐시 키 | 권한 축(principal) 포함 | S2(보안) |
| S3 | `EventSyncService` | 상한 도달 회차는 되짚기·좀비 정리 건너뜀(T-A 응급) | 기존 |
| S3 | `application.yml` | `spring.datasource.hikari.maximum-pool-size` 명시(env) | C1 |
| S4 | `Ec2ZabbixMatcher` | 전체 호스트 아이템 조회 제거(T-B) | 기존 |
| FE | `incrementalChartData.ts` | 병합 키 `type+iface` | X2 |

---

## 4. 사이드 이펙트

| 변경 | 영향 | 대응 |
|---|---|---|
| S0 대량 리팩터 | 26파일 동시 수정 → 회귀 위험 | 요청 본문 **바이트 동일**을 기록 테스트(캡처 `ZabbixClient` 스텁)로 고정. 파일 단위 커밋 가능하게 순서화 |
| 분할 | 자빅스 호출 수 증가(청크 수만큼) | 순차 호출로 동시 상한 불변. ZM-133 운영 문서에 "1회 크기 상한" 문구 추가 |
| 분할 병합 | 청크 경계 중복·순서 | id 분할은 겹침 없음. 기간 분할은 `[from, to)` 반열림 + 마지막 창만 닫힘으로 중복 방지, 결과 정렬 재적용 |
| trend 기간 분할 | 시간 버킷이 창 경계에서 잘리지 않나 | trends는 정시 버킷(clock=정시)이라 창을 정시에 맞추면 안전 |
| history 청크별 limit | 청크마다 10만 → 합계는 커질 수 있음 | 전체 상한(`history-total-limit`)을 별도로 두고 넘으면 잘림 표시 |
| 디스크·트래픽 서브키 정밀 조회 | 부분일치에 기대던 키 누락 | 실키 집합으로 동치 테스트(과거 `net.if.in[` 교훈) |
| 잘림 노출(B) | 응답 DTO에 필드 추가 → FE 계약 | `contract_*.md` 갱신·FE 타입 동시 반영 |
| 캐시 키에 principal | 캐시 적중률 하락 | 60초 TTL 유지, 부하는 사용자 수 비례로 증가(R4 공용 스냅샷 이슈에서 해소) |
| T-A 응급 | 상한 도달 중 해소 시각 기록 지연 | 경고 로그 유지, 문서화 |
| hikari 명시 | PG `max_connections` 초과 위험 | 기본값을 보수적으로(예: 20) + env로 조정, 운영 문서 반영 |

## 5. 검증 계획

- **단위**: `ZabbixApiTemplate`(분할 경계 0·1·N·N+1, 잘림 OR, 기간 창 경계, 빈 입력 호출 0), `ZabbixParams`(키 순서·깊은 복사), 교착 재현(스레드 6 포화 시 타임아웃 내 종료).
- **요청 본문 고정**: S0 전후로 대표 호출 20종의 JSON 본문을 캡처 비교(바이트 동일).
- **통합**: 기존 BE `:test` 전체(격리 워크트리, 타 세션 테스트 워커 없을 때 — `moveseye_it` DB 공유 충돌 주의).
- **규모 재현**: 스텁 자빅스로 hostids 5,000·itemids 12만 입력 시 호출 수·1회 크기 단언.
- **런타임**: dev(:3000) 재기동은 사용자 요청 시에만. 필요하면 별도 포트 사본으로.

## 6. 검수 질문 (코덱스)

- Q1. `ZabbixApiTemplate` 하나로 묶는 것이 맞나, 아니면 `ZabbixClient`에 분할을 넣는 것이 맞나(호출부가 `ZabbixClient`를 계속 직접 쓰게 두면 공통화가 무너질 위험).
- Q2. 청크 기본 500·기간 창 1일이 자빅스 7.0 기준으로 적절한가. `item.get`의 hostids 500은 과한가.
- Q3. 잘림 노출 A/B/C 중 선택과 이유.
- Q4. S0(26파일 리팩터)를 S1과 같은 이슈에 넣는 것이 회귀 위험 대비 맞나 — 분리해야 하나.
- Q5. 롬복 적용 범위·`lombok.config`(`lombok.addLombokGeneratedAnnotation`, `copyableAnnotations` 등) 권고.
- Q6. 감사 문서의 🔴 판정 중 과장·오판이 있나, 빠진 🔴가 있나(특히 H1~H7·E1~E3·X1·X6).
- Q7. S3 묶음에 넣으면 안 되는 것(범위 폭주)이나 반드시 넣어야 할 것.

## 변경 이력
| 날짜 | 내용 |
|---|---|
| 2026-09-17 | v0 초안(코덱스 검수 전) |
