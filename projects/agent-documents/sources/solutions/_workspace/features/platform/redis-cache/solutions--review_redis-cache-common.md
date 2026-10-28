# 검수 요청 — Redis 읽기-통과 캐시 공통화 + 스탬피드 방어 (redis-cache-common)

- 요청: Claude · 2026-09-23 · 사용자 지시 "백엔드 레디스 강화 작업 — 설계했던 거(스탬피드 방어) + 공통화"
- 이슈 번호: **ZM-168**(https://dmove.atlassian.net/browse/ZM-168, 설명에 작업 요약 기재)
- 대상: ✅ **master ff 병합 완료(2026-09-23)** — 커밋 **`66f916e`(구현)·`e82b2da`(검수 반영)**, master `2339a2d` 위로 리베이스 후 병합(파일 겹침 0). 병합본 컴파일 + 관련 277건 통과(임시 워크트리에서 확인). 워크트리·브랜치 제거, 미푸시. FE 변경 없음(응답 계약 불변). 사용 가이드: [`../../../guides/guide_redis-cache.md`](../../../guides/guide_redis-cache.md).
- 설계 근거: 메모리 `redis-improvement-backlog`(2026-09-19 조사) — 후보 1(스탬피드 방어) + 후보 4(신규 캐시부터 공통 방식)를 한 번에. 후보 2·3(인스턴스 간 single-flight·pub/sub)은 설치형 1벌 배포 결정으로 보류 유지.

## 범위

### 신규
| 파일 | 내용 |
|---|---|
| `common/cache/RedisCache.java` | `getOrLoad(key, type, ttl, loader)` · `reload(key, ttl, loader)`(refresh=true) · `evict(key)`. 내부: 읽기 실패 → 미스(warn), 역직렬화 실패(`cause instanceof JsonProcessingException`) → **키 삭제 + 미스**, 미스 채우기는 `SingleFlightExecutor.run("redisCache:"+key, …)`로 합침(리더 double-check 읽기 1회 포함), 로더 null → 저장 안 함, 쓰기 실패 → warn 후 값 반환, 로더 예외 → 그대로 전파(합류자 포함) |
| `test/common/cache/RedisCacheTest.java` | 10건: 히트/미스/double-check/null 미저장/읽기 장애=미스(del 없음)/깨진 값 evict+재적재/쓰기 실패 삼킴/로더 예외 전파+미저장/reload 읽기 생략/**동시 미스 8건에 로더 1회** |
| `test/common/cache/RedisCacheStubs.java` | 호출처 단위 테스트용 `passthrough(mock)` — 모든 `getOrLoad`/`reload`가 로더를 실행(lenient). 히트는 키별 `when(...).thenReturn`으로 덮음 |

### 호출처 교체(동작 계약 불변, 복붙 `readCache/writeCache` 제거)
| 파일 | 전 | 후 | 비고 |
|---|---|---|---|
| `home/HomeService` | readCache/writeCache 각자 try/catch | `getOrLoad(HOME_SUMMARY:{scope}, HomeSummaryDto, 60, …)` | 필드 `RedisClientService`→`RedisCache` |
| `home/HomeSystemStatusService` | 동일 | `getOrLoad(HOME_SYSTEM_STATUS, …, 30, …)` | `RedisClientService`는 PING·세션 수 실측용으로 **유지**, `RedisCache` 추가 |
| `asset/dashboard/AssetLiveStatusResolver` | 동일 + 실패 시 null 반환(캐시 안 함) | `getOrLoad(ASSET_LIVE_STATUS:{scope}, LiveSnapshot, 60, load(...))` — 로더 null이면 헬퍼가 저장 안 함 | 본문을 `load()`로 추출 |
| `zabbixadmin/overview/ZabbixOverviewService.cached` | refresh면 읽기 생략 후 덮어쓰기 | `refresh ? reload : getOrLoad` | 새로고침 연타도 진행 중 계산에 합류 |
| `event/EventService.visibleHostIds` | `get`/`set` **try/catch 없음** | `getOrLoad(EVENT_VISIBLE_HOSTS:{principal}, String[], 60, …)` | 🔴 행위 변화: 예전엔 Redis 읽기 예외가 그대로 올라가 목록·벨이 500 → 이제 미스로 격리 |
| `event/ProblemTagFilterGuard` | `"1"/"0"` 문자열 캐시 + 이중 try/catch | `getOrLoad(EVENT_TAG_FILTERS_ACTIVE, Boolean, 300, …)` + 바깥 try/catch(fail-closed 유지) | 저장 표현 `"\"1\""`→`true`. 업그레이드 직후 남은 옛 값은 Boolean 파싱 실패 → 헬퍼가 지우고 재감지(자가 복구) |

### 테스트 갱신
- `HomeServiceTest`(7) · `HomeSystemStatusServiceTest`(9) · `EventServiceTest`(46) · `ProblemTagFilterGuardTest`(4): `@Mock RedisCache` + `@BeforeEach RedisCacheStubs.passthrough`. `verify(redis).set(key, any, ttl)`는 `verify(redisCache).getOrLoad(key, type, ttl, any())`로, 히트는 `when(getOrLoad(eq(key), eq(type), anyLong(), any())).thenReturn(cached)`로. "재저장 안 함"·"읽기 실패 폴백" 검증은 `RedisCacheTest`로 이관.
- 결과: 대상 6클래스 79건 통과. 전체 `:test` — 아래 "검증" 참조.

### 문서
- `CLAUDE.md` §3 주의사항 **14번** 신설(공통 헬퍼 사용 규약·키 권한 축·인스턴스 간 미보장·테스트 스텁).

## 의도 (선택 · 버린 대안)
- **JVM 로컬 single-flight(기존 `SingleFlightExecutor`) 재사용, Redis 분산 락 미사용** — 09-19 설계 메모는 `acquireLock` 재사용을 적었으나 같은 메모의 결정(설치형 1벌, 다중 인스턴스 시나리오 없음)에 따르면 인스턴스 안 합류로 충분하고, 락 방식은 비리더가 폴링·대기해야 해 요청마다 Redis 왕복이 는다. HA 요구가 실제로 나오면 이 클래스 안에서만 확장(호출처 무수정).
- **Spring Cache 추상화(`@Cacheable`) 미도입** — 기존 6곳이 전부 "키에 사용자 스코프·null 미저장·refresh" 같은 조건을 손으로 다루고 있어 애노테이션으로 옮기면 SpEL 키·`unless` 로 흩어진다. 명시적 헬퍼 하나가 이 코드베이스 관례(수동 `RedisClientService`)와 맞다.
- **리더 double-check 읽기** — 미스를 본 뒤 `run()`에 들어오기 전에 직전 리더가 채운 창을 닫는다. 비용은 미스당 GET 1회(원본 Zabbix 콜 대비 무시).
- **역직렬화 실패만 `del`** — Redis 장애(연결 예외)에서 `del`을 시도하면 또 예외라 구분했다(`cause instanceof JsonProcessingException`). `evict`도 예외를 삼킨다.
- **null 미저장** — `AssetLiveStatusResolver`의 "실패=null" 계약을 헬퍼가 그대로 보존. 실패를 TTL 동안 고정하면 복구 뒤에도 빈 화면.

## 중점 확인 요청
1. **합류자의 예외 공유** — `SingleFlightExecutor` 규약대로 리더의 로더 예외가 합류자에게도 전파된다. 홈 요약은 `safe*`로 내부 격리돼 있어 문제없지만, `ZabbixOverviewService`(집계기 예외)·`EventService.visibleHostIds`(인벤토리 예외)에서 "동시 요청 N건이 한 번의 실패를 함께 받는" 것이 기존(각자 실패)과 비교해 수용 가능한지.
2. **`ProblemTagFilterGuard` 저장 표현 변경**(`"1"`→`true`) — 업그레이드 직후 최대 5분(옛 TTL) 동안 옛 값이 남아 있는 창에서 "파싱 실패→evict→재감지"가 fail-closed 경로(감지 실패 시 true)와 섞여 의도치 않은 결과를 내는 순서가 있는지.
3. **single-flight 키 충돌** — `"redisCache:"+key` 접두어로 차트 증분(ZM-143) 키와 분리했다. 기존 키들이 사용자 축을 다 갖고 있는지(HOME_SUMMARY·ASSET_LIVE_STATUS·EVENT_VISIBLE_HOSTS는 scope/principal, HOME_SYSTEM_STATUS·zbxOverview·EVENT_TAG_FILTERS_ACTIVE는 의도된 공용) 재확인.
4. **`reload`가 진행 중 `getOrLoad` 계산에 합류하는 것** — 새로고침을 눌렀는데 직전 자동 갱신의 결과를 받을 수 있다(수 초 이내 값). 화면 계약("refresh=true면 새로 잰다")과 어긋난다고 볼지.
5. **`HomeSystemStatusService`가 `RedisClientService`와 `RedisCache`를 둘 다 가진 것** — 실측(PING)과 캐시의 역할 분리로 뒀는데 검수자가 보기에 혼란스러운지.

## 검증
- 대상 테스트: `RedisCacheTest` 10 · `SingleFlightExecutorTest` 3 · `EventServiceTest` 46 · `ProblemTagFilterGuardTest` 4 · `HomeServiceTest` 7 · `HomeSystemStatusServiceTest` 9 → **79/79 통과**(`gradlew :test --tests …`, JDK 17).
- 전체 `:test`(도커 IT DB 포함): **4104건 중 4103 통과, 1 실패 = `ApmSchemaIT`(`apm_setting` 행 수 기대 8·실측 9)**. 이 변경과 무관한 **master 기존 실패** — V65(`baed6ee`, 09-22)가 `revoked_token_retention_days` 행을 시드했는데 테스트(마지막 수정 09-07)가 8을 고정. ZM-122 소관이라 여기서 손대지 않음(별도 한 줄 수정 필요).
- 런타임 실측: 미실시(BE 재기동은 사용자 명시 요청 시에만 — 메모리 `no-be-restart-without-ask`).

---

## 검수 결과 (Codex, gpt-5.6-sol high, 2026-09-23)

### 판정

조건부 승인 — 권한 스코프와 기존 실패 시맨틱은 보존됐지만, 일반 조회와 `reload`의 flight 공유가 명시적 refresh를 생략할 수 있어 보완이 필요하다.

### 결함

- [x] 🟡 강제 새로고침이 일반 조회 결과·예외에 합류함 — [RedisCache.java:68](C:/worktrees/redis-cache/src/main/java/com/dmove/moveseye/common/cache/RedisCache.java:68), [RedisCache.java:83](C:/worktrees/redis-cache/src/main/java/com/dmove/moveseye/common/cache/RedisCache.java:83) — `getOrLoad`와 `reload` 모두 `singleFlight.run(FLIGHT_PREFIX + key, ...)`를 사용한다. 따라서 `reload`가 일반 miss 계산뿐 아니라 double-check에서 발견한 캐시 값이나 일반 계산의 예외까지 그대로 받을 수 있어 “캐시를 무시하고 다시 조회” 계약이 보장되지 않는다 — 일반 flight가 끝난 뒤 강제 계산을 한 번 수행하되 동시 `reload`끼리는 합치는 방식으로 실행 종류를 구분하고 경합 테스트를 추가한다.

- [x] 🟡 멈춘 리더가 같은 키의 모든 요청을 무기한 대기시킴 — [SingleFlightExecutor.java:37](C:/worktrees/redis-cache/src/main/java/com/dmove/moveseye/common/concurrent/SingleFlightExecutor.java:37) — 합류자는 제한 없는 `existing.join()`을 호출한다. 정상 예외와 `Error`는 완료 처리되지만, loader가 반환하지 않으면 future와 키가 영구 잔류한다 — 모든 concrete loader의 외부 호출·DB deadline을 명시적으로 보장하거나 follower 대기에 제한을 둔다.

- [x] 🟡 실제 JSON 왕복과 구 캐시 마이그레이션이 테스트되지 않음 — [RedisCacheTest.java:36](C:/worktrees/redis-cache/src/test/java/com/dmove/moveseye/common/cache/RedisCacheTest.java:36), [ProblemTagFilterGuardTest.java:48](C:/worktrees/redis-cache/src/test/java/com/dmove/moveseye/event/ProblemTagFilterGuardTest.java:48) — `RedisClientService`를 mock하고 Boolean hit도 직접 `true`로 반환하므로 실제 `ObjectMapper`의 Boolean·`String[]`·record DTO 왕복 및 옛 JSON 문자열 `"1"`/`"0"`의 parse 실패→삭제→재감지 경로를 검증하지 않는다 — 실제 `RedisClientService`와 저장소 stub을 연결한 round-trip 및 legacy raw-value 테스트를 추가한다.

- [x] 🟢 동시 미스 테스트가 100ms sleep에 의존함 — [RedisCacheTest.java:164](C:/worktrees/redis-cache/src/test/java/com/dmove/moveseye/common/cache/RedisCacheTest.java:164), [RedisCacheTest.java:172](C:/worktrees/redis-cache/src/test/java/com/dmove/moveseye/common/cache/RedisCacheTest.java:172) — follower가 실제로 flight에 합류했는지 확인하지 않고 `Thread.sleep(100)` 후 리더를 해제한다. 느린 CI에서는 follower가 늦게 실행돼 간헐적으로 loader가 추가 호출될 수 있고, latch/Future 대기에도 timeout이 없다 — follower 준비 barrier와 제한 시간 `await/get`을 사용한다.

- [x] 🟢 변경 호출처 2곳의 회귀 테스트가 없음 — [AssetLiveStatusResolver.java:71](C:/worktrees/redis-cache/src/main/java/com/dmove/moveseye/asset/dashboard/AssetLiveStatusResolver.java:71), [ZabbixOverviewService.java:268](C:/worktrees/redis-cache/src/main/java/com/dmove/moveseye/zabbixadmin/overview/ZabbixOverviewService.java:268) — Asset 테스트는 resolver 자체를 mock하며, Overview에는 `reload/getOrLoad` 분기 테스트가 없다. 광범위한 `RedisCacheStubs.passthrough`도 키·타입·TTL 검증이 없는 테스트에서는 잘못된 호출을 숨긴다 — Asset의 null 미저장·사용자 키와 Overview의 refresh 경합·실패 격리 테스트를 추가한다.

### 중점 확인 요청 답변

1. **합류자의 예외 공유**: 일반 miss끼리의 공유는 허용 가능하다. `RuntimeException`과 `Error` 모두 future에 완료되고 `finally`에서 키가 제거되어 정상 예외 경로의 영구 대기나 낡은 future 재사용은 없다. Home은 내부 `safe*`, Asset은 상위 live-section 격리, Overview 통합 응답은 degraded 처리, ProblemTagFilterGuard는 fail-closed를 유지한다. Event의 inventory 예외도 종전처럼 전파된다. 단, 무기한 loader와 `reload`의 일반 flight 합류는 위 결함에 해당한다.

2. **`"1"/"0"` → Boolean**: 기본 Jackson에서는 옛 JSON 문자열 값이 Boolean 역직렬화에 실패하고, `RedisClientService`가 직접 원인으로 `JsonProcessingException`을 감싸므로 `RedisCache`가 키를 지운 뒤 재감지한다. 재감지가 실패하면 바깥 catch가 `true`를 반환해 fail-closed다. 잘못된 `false`가 노출되는 창은 확인되지 않았다. 다만 이 경로의 실물 테스트가 없다.

3. **single-flight 키 충돌·권한 축**: 차트 키와는 `redisCache:` 접두어로 분리된다. `HOME_SUMMARY`와 `ASSET_LIVE_STATUS`는 사용자 scope, `EVENT_VISIBLE_HOSTS`는 `ctx.principal()`을 포함한다. `HOME_SYSTEM_STATUS`는 관리자 전용 scheduler를 캐시 밖에서 붙이며, Overview는 관리자 전용 서비스 계정 데이터, 태그 필터는 설치본 전역 설정이므로 공용 키가 타당하다. 현재 호출처에서 권한 우회는 발견되지 않았다.

4. **`reload`와 진행 중 `getOrLoad` 합류**: 엄격한 refresh 계약에는 어긋난다. 대개 직전에 시작한 fresh 계산을 받지만, double-check cache hit 또는 일반 flight 실패에도 합류할 수 있어 캐시 우회·재시도를 보장하지 않는다. 수정 조건이다.

5. **HomeSystemStatusService의 두 Redis 의존성**: 적절하다. `RedisClientService`는 Redis 자체의 `PING`·세션 수 실측 대상이고, `RedisCache`는 결과 캐싱 정책이다. 필드 주석도 역할을 구분하며 중복 추상화가 아니다.

### 확인한 것(문제 없음)

- ProblemTagFilterGuard의 fail-closed, Asset의 실패 시 `null`, Home 계열의 부분 실패, Event inventory 실패 전파는 보존됐다.
- Boolean, `String[]`, record DTO는 현재 `RedisClientService`의 JSON `set/get` 계약과 구조적으로 호환된다.
- 관련 파일에서 남은 복제 `readCache/writeCache`, 불필요한 import, 명백한 죽은 코드는 발견되지 않았다.
- `git diff --check`는 깨끗하고 작업 트리 변경도 없다. 읽기 전용 검수이므로 테스트는 재실행하지 않았으며 요청서의 79/79 결과를 확인했다.

## 반영 (Claude, 2026-09-23, 2차 커밋)

| 지적 | 반영 | 근거·테스트 |
|---|---|---|
| 🟡1 reload가 일반 조회 flight에 합류 | `reload`는 별도 flight 키 `redisCache:reload:{key}`를 쓴다 — 진행 중 일반 계산(double-check 히트·예외 포함)에 합류하지 않고 스스로 다시 잰다. 동시 새로고침끼리는 여전히 합쳐진다. 코덱스 제안("일반 flight 종료 후 강제 1회")보다 단순하고 계약("캐시 무시하고 다시 잰다")을 직접 만족 | `RedisCacheTest.reloadDoesNotJoinInFlightGetOrLoad` — 일반 조회 진행 중 reload → 로더 2회, "forced" 반환 |
| 🟡2 멈춘 리더에 합류자 무기한 대기 | `SingleFlightExecutor.run(key, supplier, Duration joinTimeout)` 오버로드 신설 — 합류자는 제한까지만 `get(timeout)`으로 기다리고 초과하면 **스스로 실행**(warn 로그). `RedisCache`는 `JOIN_TIMEOUT=30s` 사용. 기존 2인자 `run`(차트 증분 ZM-143)은 무제한 그대로 — 회귀 없음 | `SingleFlightExecutorTest.joinTimeoutFallsBackToOwnExecution`(200ms 뒤 자기 실행) · `joinWithTimeoutStillPropagatesLeaderFailure`(제한 있어도 리더 예외 원형 전파). 로더 자체의 외부 호출 deadline은 이 티켓 범위 밖(ZabbixClient 타임아웃 소관) |
| 🟡3 실제 JSON 왕복·구 값 마이그레이션 미검증 | `RedisCacheRoundTripTest` 신설 — 실제 `RedisClientService` + 실제 `ObjectMapper` + 인메모리 `StringRedisTemplate` 대역 | Boolean·String[]·record DTO 왕복 3건 · 옛 `"\"1\""` → 파싱 실패 → 삭제 → 재계산·`false` 저장 · **`ProblemTagFilterGuard` 실물**로 옛 값 있을 때 재감지 결과 우선 + 재감지 실패 시 fail-closed(키 없음) · null 미저장 |
| 🟢4 동시 미스 테스트 sleep 의존 | `Thread.sleep(100)` 제거 — 합류자 스레드를 모아 전원이 `WAITING/TIMED_WAITING`(리더 future에 매달림)이 될 때까지 폴링(5초 상한), `get/await` 전부 5초 제한 | `RedisCacheTest.concurrentMissesShareOneLoad` |
| 🟢5 Asset·Overview 회귀 테스트 없음 | `AssetLiveStatusResolverTest` 5건(실제 `RedisCache`+mock 클라이언트: 빈 대상·미스 저장 키/TTL·히트·🔴소스 장애 null 미저장·Redis 장애 격리) · `ZabbixOverviewServiceTest` 3건(그룹별 키·TTL 60/300·refresh→reload, 반대 경로 미호출) | 두 파일 신설 |

- 검증: 대상 11클래스 120건 통과(신규 4클래스 25건 포함). 전체 `:test` 재실행 4121건 중 3 실패 → 단독 재실행에서 `FlywayMigrationSmokeIT`·`ApmSchemaIT` V43 케이스는 **통과**(다른 세션이 같은 도커 IT DB `moveseye_it`을 V67 워크트리로 동시 사용해 생긴 가짜 실패 — 마이그레이션 67≠66·`apm_hist_bounds` 중복 키), 남은 실패는 master 기존 `ApmSchemaIT` 8≠9 하나뿐.
