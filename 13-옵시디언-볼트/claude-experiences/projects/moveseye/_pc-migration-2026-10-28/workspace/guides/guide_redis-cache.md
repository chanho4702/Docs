# Redis 읽기-통과 캐시 사용 가이드 — `common/redis/RedisCache` (ZM-168)

- 대상 레포: `moveseye-be-spring` · 정본 코드 `src/main/java/com/dmove/moveseye/common/redis/RedisCache.java`
- 도입: 2026-09-23 (#ZM-168, master `66f916e` 구현 · `e82b2da` 코덱스 검수 반영 · `dc68dbe` 패키지 집결). 코덱스(gpt-5.6-sol high) 검수 반영본.
- 규약 한 줄: BE `CLAUDE.md` §3 주의사항 **14번**. 검수 이력: `_workspace/features/platform/redis-cache/review_redis-cache-common.md`.

## 1. 왜 있나

Zabbix 호출은 느리고 비싸서 결과를 Redis에 TTL로 적어 두고 화면은 그걸 읽는다. 이 "읽고, 없으면 계산해 적는" 코드가 서비스 6곳에 각자 복붙돼 있었고, 두 가지 문제가 있었다.

1. **복붙 드리프트** — 한 곳(`EventService.visibleHostIds`)은 실패 격리 `try/catch`가 빠져 Redis가 죽으면 이벤트 목록·벨이 500이었다.
2. **캐시 스탬피드** — TTL이 끝나는 순간 같은 키로 몰린 요청(운영자 여러 명의 자동 새로고침)이 전부 미스를 보고 전부 Zabbix로 나갔다. 홈 요약처럼 요청 1건이 Zabbix 여러 콜을 부르는 캐시에서는 N명 × M콜이 한꺼번에 나간다.

`RedisCache`는 이 흐름의 **단일 정본**이다. 호출처는 "이 키로 값 줘, 없으면 이렇게 계산해" 한 줄만 부른다.

## 2. API

```java
// 있으면 캐시 값, 없으면 loader → ttl초 저장 → 반환
<T> T getOrLoad(String key, Class<T> type, long ttlSeconds, Supplier<T> loader)

// 캐시를 읽지 않고 다시 계산해 덮어쓴다 (화면의 새로고침 = refresh=true)
<T> T reload(String key, long ttlSeconds, Supplier<T> loader)

// 키 삭제 (실패는 삼킨다)
void evict(String key)
```

### 호출 예 (홈 요약)
```java
return redisCache.getOrLoad(CACHE_PREFIX + cacheScope(user), HomeSummaryDto.class, 60, () -> {
    CallerContext ctx = CallerContexts.from(user);
    return new HomeSummaryDto(safeAlarm(ctx), safeInfra(user), safeAsset(), safeMap(ctx), safeRecentReports(user));
});
```

### refresh 분기 (구성 현황)
```java
return refresh
        ? redisCache.reload(key, ttlSeconds, loader)
        : redisCache.getOrLoad(key, type, ttlSeconds, loader);
```

## 3. 보장하는 것 (호출처가 다시 만들지 말 것)

| 성질 | 동작 | 이유 |
|---|---|---|
| 실패 격리 | Redis 읽기 실패 → **미스**로 취급하고 로더 실행. 쓰기 실패 → warn 후 값 반환 | 캐시가 죽었다고 화면이 500이면 안 된다 |
| 깨진 값 자가 복구 | 역직렬화 실패(원인이 `JsonProcessingException`) → **그 키를 삭제**하고 미스 | 안 지우면 TTL 내내 매 요청이 실패→재계산·경고 로그 반복. DTO 스키마 변경·`@Jacksonized` 누락 뒤 배포에서 실제로 났던 결함 |
| 스탬피드 방어 | 같은 키의 동시 미스는 `SingleFlightExecutor`로 합쳐 **로더 1회**. 리더가 되기 직전 한 번 더 읽어(double-check) 직전 리더가 막 채운 값을 재계산하지 않는다 | N명 × M콜 → 1 × M콜 |
| 합류 대기 제한 | 합류자는 **30초**(`JOIN_TIMEOUT`)까지만 기다리고 초과하면 스스로 계산 | 리더의 로더가 행 걸리면(외부 호출) 같은 키 전원이 매달리는 걸 막는다. 합류만 잃고 리더에 묶이지 않는다 |
| reload 분리 | `reload`는 별도 flight 키(`redisCache:reload:`)라 진행 중인 **일반 조회에 합류하지 않는다**. 동시 새로고침끼리만 합쳐진다 | 새로고침이 직전 일반 계산의 double-check 히트나 예외를 받으면 "다시 잰다"는 계약이 깨진다 |
| null 미저장 | 로더가 null을 주면 저장하지 않고 null 반환 | 소스 장애를 TTL 동안 고정하면 복구 뒤에도 빈 화면(자산 라이브의 "실패=null" 계약) |
| 로더 예외 전파 | 로더 예외는 그대로 올라간다(합류자에게도 같은 예외). 저장 없음 | 실패 시맨틱(fail-closed 등)은 호출처가 정한다 |

## 4. 보장하지 않는 것 · 호출처 책임

- 🔴 **키에 권한 축**: 결과를 공유하므로 사용자별 가시 범위가 다른 데이터는 키에 사용자(PK 또는 principal)를 넣어야 한다. 공용 키는 설치본 전역 데이터(시스템 상태·구성 현황·태그 필터 설정)에만. 빠뜨리면 A의 권한으로 조회된 결과를 B가 받는다.
- **인스턴스 간 합류 없음**: single-flight는 JVM 로컬. BE가 여러 대면 대당 1번씩 로더가 돈다. 설치형(고객사당 1벌) 결정(2026-09-19)에 따라 분산 락(`RedisClientService.acquireLock`)은 넣지 않았다 — HA 요구가 실제로 나오면 이 클래스 안에서만 확장(호출처 무수정).
- **제네릭 컬렉션**: `Class<T>`만 받으므로 `List<String>`은 못 넣는다. 배열(`String[].class`)이나 DTO record로 감싼다.
- **저장 표현은 JSON**(`RedisClientService.set`과 동일). 같은 키를 `getRaw`로 읽지 말 것(따옴표가 남는다).
- **로더의 외부 호출 타임아웃**은 로더 소관(ZabbixClient 등). 합류 30초 제한은 "리더가 안 돌아올 때 합류자를 풀어 주는" 장치지, 로더의 데드라인이 아니다.

## 5. 현재 호출처 (6곳)

| 호출처 | 키 | TTL | 비고 |
|---|---|---|---|
| `home/HomeService` | `HOME_SUMMARY:{userId}` | 60s | 사용자 스코프 |
| `home/HomeSystemStatusService` | `HOME_SYSTEM_STATUS` | 30s | 공용. `RedisClientService`는 PING·세션 수 **실측**용으로 따로 보유(역할 분리) |
| `asset/dashboard/AssetLiveStatusResolver` | `ASSET_LIVE_STATUS:{userId}` | 60s | 소스 장애 = null(미저장) |
| `zabbixadmin/overview/ZabbixOverviewService` | `zbxOverview:{domain}:{groupId\|all}` | hosts 60s · 구성물 300s | `refresh` → `reload` |
| `event/EventService.visibleHostIds` | `EVENT_VISIBLE_HOSTS:{principal}` | 60s | `String[]` 저장. 교체 전엔 Redis 장애가 500이었음(행위 변화) |
| `event/ProblemTagFilterGuard` | `EVENT_TAG_FILTERS_ACTIVE` | 300s | `Boolean` 저장(구 `"1"/"0"` 문자열은 파싱 실패→삭제→재감지로 자가 복구). 바깥 `try/catch`로 fail-closed 유지 |

## 6. 테스트 작성법

- **호출처 단위 테스트**: `@Mock RedisCache redisCache` + `@BeforeEach`에서 `RedisCacheStubs.passthrough(redisCache)` — 모든 `getOrLoad`/`reload`가 로더를 실행한다(캐시 없음과 동일, lenient). 히트가 필요한 케이스만 덮어쓴다:
  ```java
  when(redisCache.getOrLoad(eq("HOME_SUMMARY:5"), eq(HomeSummaryDto.class), anyLong(), any())).thenReturn(cached);
  ```
  키·타입·TTL 계약은 `verify(redisCache).getOrLoad(eq(key), eq(Type.class), eq(60L), any())`로 고정한다.
- **캐시 자체 동작**은 `RedisCacheTest`(mock 클라이언트, 11건: 히트/미스/double-check/null/읽기 장애/깨진 값/쓰기 실패/로더 예외/reload/동시 미스 8→1/reload 분리)와 `RedisCacheRoundTripTest`(실제 `RedisClientService`+`ObjectMapper`+인메모리 `StringRedisTemplate` 대역, 6건: Boolean·String[]·record 왕복·구 값 마이그레이션·가드 fail-closed·null)가 본다. 호출처 테스트에서 반복하지 않는다.
- 새 DTO를 캐시에 넣을 때 **왕복이 의심되면**(`@Jacksonized` 빌더·중첩 제네릭) `RedisCacheRoundTripTest`에 케이스를 하나 추가한다 — 깨져도 자가 복구는 되지만 TTL당 1회 재계산이 늘고 경고 로그가 남는다.
- 🔴 전체 `:test`의 IT는 도커 `moveseye_it` DB를 **워크트리끼리 공유**한다. 다른 세션이 IT를 돌리는 동안엔 `FlywayMigrationSmokeIT`(마이그레이션 수 불일치)·`ApmSchemaIT`(중복 키)가 가짜로 깨진다 — 단독 재실행으로 판별.

## 7. 새 캐시를 추가할 때 체크리스트

1. Zabbix에 있는 기능인가, 캐시가 정말 필요한가(호출 빈도 × 비용).
2. 키에 사용자 축이 필요한가(가시 범위가 사용자마다 다른가).
3. TTL — 실시간 축(연결 상태·알람)은 짧게(30~60s), 구성물은 길게(300s). 권한 변경 반영이 TTL만큼 늦는다는 걸 문서화.
4. 로더의 실패 시맨틱 — null(미저장)로 둘지, 예외(전파)로 둘지, 바깥에서 fail-closed로 감쌀지.
5. 새로고침 UI가 있으면 `refresh ? reload : getOrLoad`.
6. 호출처 테스트에 키·타입·TTL `verify` 한 줄.

## 8. 구현 해설 (읽는 순서대로)

의존은 둘뿐이다 — `RedisClientService`(Redis 읽기·쓰기, JSON 직렬화)와 `SingleFlightExecutor`(같은 키의 동시 실행 합치기, `common/concurrent`).

### 8.1 `getOrLoad` 흐름
```java
T hit = read(key, type);                                   // ① 먼저 읽는다 — 히트면 Redis 왕복 1회로 끝
if (hit != null) return hit;
return singleFlight.run("redisCache:" + key, () -> {       // ② 미스는 같은 키끼리 합류(리더 1명, 나머지는 결과 공유)
    T filled = read(key, type);                            // ③ 리더 double-check — run() 직전에 다른 리더가 채웠을 수 있다
    if (filled != null) return filled;
    return loadAndStore(key, ttlSeconds, loader);          // ④ 계산 → null이면 저장 안 함 → 아니면 set(ttl)
}, JOIN_TIMEOUT);
```
- ②가 스탬피드 방어다. `SingleFlightExecutor`는 `ConcurrentHashMap<String, CompletableFuture>`에 `putIfAbsent`로 리더를 정하고, 합류자는 그 future에 매달렸다가 같은 결과(또는 같은 예외)를 받는다. 실행이 끝나면 `finally`에서 키를 지우므로 캐시처럼 낡은 값을 주는 일은 없다.
- ③의 비용은 미스당 GET 1회. 원본(Zabbix 여러 콜) 대비 무시할 수준이고, "미스를 본 뒤 run()에 들어오기 전" 창에서 생기는 중복 계산을 막는다.
- ④ `loadAndStore`: 로더 결과가 null이면 저장하지 않고 null 반환(자산 라이브의 "소스 장애 = null" 계약 보존). `set` 실패는 warn 후 값은 그대로 반환.

### 8.2 실패 격리 — `read`
```java
try {
    return redisClientService.get(key, type);
} catch (Exception e) {
    if (e.getCause() instanceof JsonProcessingException) evict(key);   // 깨진 값만 삭제
    return null;                                                        // 어떤 예외든 미스
}
```
`RedisClientService.get`은 JSON 파싱 실패를 `IllegalStateException(cause=JsonProcessingException)`으로 감싼다. 그 원인을 보고 **파싱 실패만** 키를 지운다 — 연결 장애에서 `del`을 시도하면 또 예외이기 때문. `evict`도 예외를 삼킨다. 로더의 예외는 잡지 않는다(실패 시맨틱은 호출처가 정한다 — 태그 필터 가드의 fail-closed처럼).

### 8.3 `reload`는 flight 키가 다르다
```java
return singleFlight.run("redisCache:reload:" + key, () -> loadAndStore(key, ttlSeconds, loader), JOIN_TIMEOUT);
```
처음엔 일반 조회와 같은 키를 썼고 코덱스 검수(🟡1)가 잡았다 — 같은 키면 새로고침이 진행 중인 일반 계산에 합류해 그 double-check 히트나 예외까지 받아 "캐시를 무시하고 다시 잰다"가 깨진다. 접두어를 나누면 새로고침은 항상 자기 계산을 하고, 새로고침 연타끼리만 합쳐진다.

### 8.4 `SingleFlightExecutor` 합류 대기 제한 (검수 🟡2)
원형은 합류자가 `future.join()`으로 무한 대기했다 — 리더의 외부 호출이 행 걸리면 같은 키 전원이 매달린다. 3인자 오버로드 `run(key, supplier, Duration joinTimeout)`을 추가해 합류자는 `future.get(timeout)`으로 기다리다 `TimeoutException`이면 warn 로그 후 **자기 supplier를 직접 실행**한다(합류 이득만 잃고 리더에 묶이지 않는다). `CompletionException`/`ExecutionException`은 원인(RuntimeException·Error)을 벗겨 원형으로 전파한다. `RedisCache`는 30초, 차트 증분(ZM-143)이 쓰는 2인자 `run`은 무제한 그대로 — 회귀 없음.

### 8.5 호출처 변환 패턴
```java
// 전 — 서비스마다 복붙
HomeSummaryDto cached = readCache(cacheKey);      // try/catch + warn
if (cached != null) return cached;
HomeSummaryDto dto = ...집계...;
writeCache(cacheKey, dto);                         // try/catch + warn
return dto;

// 후
return redisCache.getOrLoad(cacheKey, HomeSummaryDto.class, CACHE_TTL_SECONDS, () -> ...집계...);
```
- 구성 현황: `refresh ? reload(...) : getOrLoad(...)`.
- 태그 필터 가드: 저장값 `"1"/"0"` 문자열 → `Boolean`. 업그레이드 직후 남은 옛 문자열은 Boolean 파싱 실패 → 8.2 경로로 삭제 → 재감지(자가 복구). 바깥 `try/catch`가 로더 예외를 `true`(제한 있음)로 바꿔 fail-closed 유지.
- 이벤트 가시 호스트: 예전엔 `try/catch` 없이 Redis를 읽어 장애 시 목록·벨이 500 → 미스로 격리(공통화가 조용히 고친 행위 변화, 인계서에 명시).

### 8.6 테스트 구조
- `RedisCacheTest`(11): 클라이언트 mock, 헬퍼 로직만. 동시 미스 테스트는 리더를 래치로 붙잡고 합류자 7스레드가 전부 `WAITING`이 될 때까지 폴링한 뒤 풀어 로더 1회를 확인(sleep 의존 없음, 5초 상한).
- `RedisCacheRoundTripTest`(6): 실제 `RedisClientService`+실제 `ObjectMapper`, `StringRedisTemplate`만 `Map` 대역 — Boolean·String[]·record 왕복, 옛 값 마이그레이션, 가드 실물 fail-closed.
- `SingleFlightExecutorTest`(5): 합류·키 정리·예외 전파 + 대기 제한 뒤 자기 실행·제한 있어도 리더 예외 전파.
- 호출처 테스트: `@Mock RedisCache` + `RedisCacheStubs.passthrough`("항상 미스"), 히트만 키로 덮어씀. `AssetLiveStatusResolverTest`(5)는 실제 `RedisCache`+mock 클라이언트로 null 미저장까지 본다.

### 8.7 버린 대안
- Redis 분산 락(`acquireLock`) — 설치형 1벌 배포라 인스턴스 안 합류로 충분, 락은 비리더 폴링·왕복 증가.
- Spring Cache `@Cacheable` — 사용자 스코프 키·null 미저장·refresh가 SpEL로 흩어짐.
- 코덱스 제안 "일반 flight 종료 후 강제 1회" — 별도 flight 키가 더 단순하고 계약을 직접 만족.
