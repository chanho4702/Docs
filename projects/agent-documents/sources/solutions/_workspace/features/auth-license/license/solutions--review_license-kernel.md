# 검수 요청 — 라이선스 0단계 전체 (BE 커널 + FE 게이트 + 배치 lease)

> 작성: Claude · 2026-08-10 착수 / **2026-08-12 최종** · 규약: [COLLAB.md](../../../../solutions--COLLAB.md) §8
> 설계 정본: [devdesign_premium-edition.md](solutions--devdesign_premium-edition.md) v4
> 런타임 기록: [e2e_license-kernel.md](solutions--e2e_license-kernel.md)
>
> **전부 미푸시.** BE `ZM-79` 7건 · FE `master` 2건 · 발급기 `main` 1건
>
> | 커밋 | |
> |---|---|
> | BE | `8cb1944` T3검증 · `eb86507` T4판정 · `b64cd6e` T5게이트 · `4b82bcc` T6실시간 · `5934015` T7배치·ArchUnit · `9a88253` T8결함수정 · `57c63e5` **배치 lease(별건)** |
> | FE | `3fa60fb` 등록·상태 화면(Codex 작업) · `8389c08` **게이트 화면**(Claude) |
> | 발급기 | `6692f69` **웹 UI** |
>
> ✅ **완료 판정 17/19.** 남은 둘은 지금 검증할 수 없다 — 12는 `@RequiresFeature`를 붙인 실제 EP가
> 1단계(GPU)에 가야 생기고, 19의 업셀·실시간차단은 붙일 프리미엄 화면이 아직 없다.

---

## 1. 범위

**라이선스 0단계 BE 커널 전체.** 게이트가 실제로 닫히므로 전 API·전 배치에 영향이 간다.
**FE는 아직 0이다** — 지금 이 상태로 배포하면 화면은 라이선스 오류를 이해하지 못한다.

| 커밋 | 단계 | 내용 |
|---|---|---|
| `8cb1944` | T3 검증 | `LicenseServiceIT` 11건 — 코드만 있고 검증되지 않았던 등록·해지를 실제 DB로 고정 |
| `eb86507` | T4 판정 | `LicenseProvider`·`SignedKeyLicenseProvider`(상태 머신 7분기 + 60초 캐시), `GET /features`, 등록(붙여넣기·파일)·해지 EP, `ErrorCode` 5종 |
| `b64cd6e` | T5 차단 | 인터셉터 2종, 예외 4종, 어노테이션 3종, `WebConfig` 순서, 면제 경로 3곳 |
| `4b82bcc` | T6 실시간 | 엔진 포트 데코레이터 3종 + `LiveQueryGuard` (P17 — `EXPIRED` 유지 / `ARCHIVED` 차단) |
| `5934015` | T7 배치·구조 | 스케줄러 게이팅(`requiresActiveLicense`), ArchUnit 6규칙 |

### 변경 파일

**신규 (main)**
```
license/LicenseProvider.java                  판정 축 인터페이스
license/SignedKeyLicenseProvider.java         상태 머신 + 캐시 (핵심)
license/LicenseController.java                GET /features, POST/DELETE /settings/license
license/LicenseExempt.java                    게이트 화이트리스트
license/AccessModeInterceptor.java            레이어 1 (핵심)
license/FeatureInterceptor.java               레이어 2
license/LicenseGateException.java             예외 공통 부모
license/{LicenseRequired,ReadOnlyMode,FeatureNotLicensed,LiveQueryBlocked}Exception.java
license/{RequiresFeature,ReadOnlyAllowed,MutatingRequest}.java
license/dto/{LicenseStatusResponseDto,LicenseRegisterRequestDto}.java
```

**수정 (main)**
```
license/LicenseKeyVerifier.java               verify() / parse() 분리 ★
config/WebConfig.java                         인터셉터 순서 ★
auth/AuthController.java                      클래스 @LicenseExempt
user/UserController.java                      my-profile · role/permission @LicenseExempt
common/exception/GlobalExceptionHandler.java  게이트 예외 + 키 등록 예외 핸들러
engine-api common/exception/ErrorCode.java    LICENSE_* 9종
```

**신규 (main) — T6·T7**
```
license/guard/{LicenseGuardedMetricPort,LicenseGuardedInventoryPort,
               LicenseGuardedAlertPort,LiveQueryGuard}   포트 데코레이터 (핵심)
```

**수정 (main) — T6·T7**
```
scheduler/SchedulerJob.java        requiresActiveLicense() default true 추가
scheduler/SchedulerManager.java    execute 단일 지점 게이팅 ★
scheduler/BuiltInJobs.java         cleanup 2종만 false
build.gradle.kts                   archunit-junit5:1.3.0
```

**테스트**
```
신규  license/{SignedKeyLicenseProviderTest(15), LicenseControllerIT(17), LicenseGateIT(17),
               LicenseArchitectureTest(6), LicenseTestKeys}
      license/guard/LicenseGuardedPortTest(7)
수정  license/LicenseServiceIT (테스트 키 설정 공유)
      support/IntegrationTestSupport (라이선스 시드) ★
      scheduler/SchedulerManagerTest (게이팅 4건 추가)
```

---

## 2. 의도 — 선택한 것과 버린 것

### 2-1. 정본을 둘로 나눴다

`edition`·`features`·`graceDays`·`customer`는 **키가 정본**(매 판정마다 원문 JWT 재검증), `expiresAt`은 **DB가 정본**(키에 없는 값 — P12).

- **버린 안**: DB 컬럼만 읽기 → 빠르지만 `features` 컬럼을 UPDATE해 기능을 여는 우회가 뚫린다.
- **버린 안**: 키만 읽기 → 만료일이 없어 성립 불가.

`graceDays`도 키를 따르게 했다. DB 컬럼을 늘려 유예를 연장하는 우회를 막기 위함이고, 테스트로 고정했다.

### 2-2. 캐시 60초 + `refresh()`

매 요청 RSA 검증 + DB 조회를 하면 인터셉터가 병목이 된다. 상태 전이는 날짜 단위라 60초 지연은 판정에 영향이 없고, 즉시성이 필요한 등록·해지는 `refresh()`로 캐시를 버린다(§6 판정 2).

- **버린 안**: TTL 없이 영구 캐시 + 이벤트 무효화만 → 시간 경과에 따른 전이(ACTIVE→EXPIRING→GRACE)가 재기동 전까지 안 일어난다.
- **버린 안**: 캐시 없음 → 정확하지만 모든 요청이 RSA 검증을 탄다.

### 2-3. 예외 4종을 나누되 핸들러는 하나

FE가 그릴 화면이 전부 다르지만(잠금/배너/업셀/실시간 차단) 응답으로 바꾸는 방식은 같다. 그래서 `LicenseGateException` 추상 부모를 두고 `@ExceptionHandler`는 한 곳에 뒀다.

`FeatureNotLicensed`만 **402**다. 403(권한 없음 → 관리자에게 요청)과 402(미구매 → 영업 문의)는 사용자가 취할 행동이 다르다.

### 2-4. 기본이 STANDARD, 프리미엄만 명시

`@RequiresFeature`가 없으면 통과. 반대로 했다면 기존 API 수백 개에 표시를 붙여야 했다.

만료 계열에서 프리미엄이 닫히는 데는 **별도 코드가 없다** — `LicenseStatus.allows()`가 보유 여부뿐 아니라 상태(`ACTIVE`·`EXPIRING`·`GRACE`만)까지 보기 때문이다(P4).

### 2-5. `verify()` / `parse()` 분리 ★

`activationDeadline`(기본 발급 후 7일 — M5)은 **미등록 키의 수명**이다. 등록된 라이선스를 매 요청 재검증하는 경로에 같은 조건을 걸면 **등록 8일째에 정상 고객이 통째로 잠긴다**(영구 라이선스도 예외 없음). 등록용 `verify()`와 판정용 `parse()`로 갈랐고, 테스트가 판정 경로에서 `verify()`가 불리면 실패시킨다.

### 2-6. 테스트에도 우회 스위치를 두지 않았다 (P11)

`IntegrationTestSupport`가 **실제 서명된 키를 실제 테이블에** 심어 게이트를 연다.

- **버린 안**: 테스트 프로필에서 게이트 비활성화 → P11 위반이고, 게이트 회귀를 영영 못 잡는다.

### 2-7. 실시간 차단을 API가 아니라 포트에서 (T6)

실시간을 쓰는 화면은 모니터링 전체이고 포트를 지나는 클래스가 20개대다. API마다 표시를 붙이면 반드시 몇 개를 빠뜨리고, 빠진 하나가 곧 "만료 고객이 계속 실시간을 본다"가 된다. 길목이 셋뿐이라 거기서 막는다.

- **버린 안**: API에 `@RequiresLiveQuery` 같은 표시 → 누락 위험이 그대로다.
- **버린 안**: 어댑터 내부에서 검사 → 수집층 중립 원칙(P2-1) 위반.

`acknowledge`에도 검사를 건다. 쓰기 차단은 인터셉터가 이미 하지만, 여기서는 다른 이유(ARCHIVED에서 소스에 나가지 않는다)로 건다 — 겹치는 게 아니라 다른 층위다.

### 2-8. 배치 게이팅 기본값을 `true`로 (T7)

새 배치를 추가하며 잊으면 "만료 고객 서버에서 수집이 계속 도는" 쪽이 아니라 "만료되면 멈추는" 쪽으로 기운다. cleanup만 `false` — 보존 기간 정리까지 멈추면 디스크가 무한정 찬다.

건너뛴 실행은 **이력에 남기지 않는다**. 성공으로 적으면 거짓 성공, 실패로 적으면 만료 기간 내내 알람이다.

---

## 3. 🔴 중점 확인 요청

### R-1. `@LicenseExempt` 누락이 더 있는가 — **가장 불안하다**

면제를 3곳만 걸었다: `AuthController` 전체, `GET /users/my-profile`, `GET /users/role/permission`.

**근거가 얕다.** FE `useAuth.ts` 하나만 읽고 "부팅 시 호출되는 것"을 판단했다. 앱 전역에서 도는 다른 호출(예: **알림 벨 폴링** — 메모리에 선재 이슈로 등재돼 있다, 사이드바 뱃지, 헬스체크)이 있으면 **잠금 화면에서 에러가 계속 쏟아지거나 화면이 안 그려질 수 있다.**

- 확인 요청: 잠금 상태에서 FE가 실제로 부르는 전체 API 목록. 누락된 면제 대상이 있는가?
- 반대 방향도: 면제를 **과하게** 준 것은 없는가? `role/permission`은 조회 전용이라 열어도 잃는 게 없다고 판단했다.

### R-2. `@ReadOnlyAllowed` / `@MutatingRequest` 대상을 전수 조사하지 않았다

지금 **실제 컨트롤러에 붙인 것이 0개**다. 기본 규칙(HTTP 메서드)만으로 돌고 있다.

- 🔴 **판정 14 미확인**: "만료 상태에서 리포트 다운로드 성공, 리포트 생성은 차단". 다운로드가 POST로 구현돼 있으면 **지금 막힌다**. `report` 패키지에서 download/export 키워드를 못 찾았는데, 다른 이름일 수 있다.
- GET인데 실제로는 쓰기인 경로(동기화 트리거, 토큰 재발급 등)가 있는가? 있으면 읽기 전용 고객이 GET으로 계속 쓰기를 한다.
- 자산 동기화·Zabbix 쓰기 경로의 메서드가 규칙과 맞는가?

### R-3. DB 장애 시 판정이 500을 던진다 — 이게 맞는 선택인가

`SignedKeyLicenseProvider.compute()`는 `LicenseKeyException`만 잡아 `INVALID`로 떨어뜨린다. **`DataAccessException`은 전파**되므로 DB가 흔들리면 라이선스 인터셉터에서 500이 나고 **모든 API가 죽는다**.

- 반론: DB가 죽으면 어차피 대부분의 API가 죽으니 별도 처리가 무의미하다.
- 우려: 라이선스 테이블만의 일시적 문제(커넥션 고갈, 락)로 **전 API가 500**이 되는 것은 과하다. 마지막 성공 판정을 stale하게 재사용하는 편이 나은가? 그러면 해지가 지연되는 대신 가용성이 오른다.
- **판단을 요청한다.** 지금은 의도적 미처리다.

### R-4. 다중 인스턴스에서 캐시 60초

인스턴스 A에서 해지해도 B는 최대 60초간 이전 상태로 응답한다. `refresh()`는 로컬 캐시만 지운다.

- 스케줄러 다중 인스턴스 잠금과 같은 게이트(서버 2대 이상)라 지금은 문제가 아니라고 봤다.
- 그 시점에 Redis pub/sub 무효화가 필요한가, 아니면 60초가 허용 가능한가?

### R-5. 게이트를 실제 도메인 EP로 검증하지 않았다

`LicenseGateIT`는 **전용 프로브 컨트롤러**(`/__gate-probe/*`)로 규칙을 검증한다. 규칙 자체는 촘촘히 봤지만, **실제 엔드포인트가 게이트에 걸리는지는 확인하지 않았다** — 오히려 `IntegrationTestSupport` 시드가 모든 기존 IT에서 게이트를 열어 둔다.

- 프로브 방식이 적절한가, 아니면 실제 EP 몇 개(자산 생성·알람 ack)로 확인해야 하는가?
- 특히 **판정 11**(만료 상태에서 알람 ack 차단)은 아직 실제 EP로 확인 안 됐다.

### R-6. `GET /features`에 `@VisitorIdCheck`가 걸려 있다

잠금 화면이 이 응답으로 그려지는데, Redis 세션 대조를 통과해야 한다. 로그인 직후라면 문제없지만 세션이 꼬인 상태에서 잠금 화면 진입이 막힐 여지가 있는가?

### R-7. A5를 설계서 원안대로 못 지켰다 — 이 타협이 맞는가

원안은 `@LicenseExempt`를 `license..`·`auth..`로 제한하는 것이었다. 실제로 붙여 보니 FE 부팅 경로 둘(`GET /users/my-profile`·`/users/role/permission`)이 `user` 패키지에 있었고, 막히면 잠금 화면조차 못 그린다. 패키지로 열면 `user` 전체가 열려서 **메서드 이름 허용 목록**으로 좁혔다.

```java
.orShould().haveName("getUser")        // GET /users/my-profile
.orShould().haveName("getPermission")  // GET /users/role/permission
```

- 🟡 **메서드 이름만 보므로 동명이인이 통과한다.** 다른 클래스에 `getUser`를 만들고 `@LicenseExempt`를 붙이면 규칙이 못 잡는다. 클래스까지 묶어 검사해야 하는가, 아니면 그 정도 우회는 리뷰가 잡을 것으로 보는가?
- 대안: 두 EP를 별도 부트스트랩 컨트롤러(`license` 패키지)로 옮기면 규칙이 원안대로 깨끗해진다. 대신 기존 경로를 유지하려면 컨트롤러만 옮기는 셈이라 `user` 도메인이 쪼개진다. **어느 쪽이 나은가.**

### R-8. 포트 데코레이터가 `@Qualifier` 문자열로 원본을 지목한다 (T6)

```java
public LicenseGuardedMetricPort(@Qualifier("zabbixMetricAdapter") MetricPort delegate, ...)
```

자기 자신도 같은 타입이라 타입만으로는 순환한다. 지금은 소스가 하나뿐이라 문제없고 이름이 틀리면 컨텍스트 로딩이 즉시 실패하지만, **다중 소스(Prometheus)가 들어오면 이 세 줄을 반드시 고쳐야 한다**(라우터가 `@Primary`를 가져가고 데코레이터가 라우터를 감싸는 형태로).

- 더 나은 결합 방식이 있는가? engine-api에 마커 어노테이션을 두는 안도 검토했으나, 다중 소스가 되면 그 마커가 여러 어댑터에 붙어 똑같이 모호해진다고 판단했다.

### R-10. FE 게이트를 `PageWrapper`에 둔 것이 맞는가 (커밋 `8389c08`)

모든 보호 라우트가 지나는 자리라 한 번에 덮이지만, 그만큼 **모든 페이지가 `useLicense()`를 호출**한다
(react-query 캐시라 요청은 1회지만 훅은 매번 돈다).

- 🟡 **로그인 화면도 `PageWrapper`로 감싸져 있어** 인증 전에 `/features`가 나가 401이 났다
  (BE 로그의 `INVALID_TOKEN`). `enabled: isAuthenticated`로 막았다 — `useAuth`가 쓰는 것과 같은 패턴이다.
  **이 방식이 맞는지, 아니면 라우트 트리를 나눠 인증 구역에만 게이트를 걸어야 하는지** 의견을 구한다.
- 잠금 탈출구를 **경로 prefix**(`pathname.startsWith("/setting/license")`)로 판단한다. 더 나은 표현이 있는가?
  (라우트 메타데이터로 표시하는 안도 있었으나 라우트 정의가 배열 리터럴이라 지저분해졌다.)

### R-11. 전역 감지를 인터셉터 대신 3분 폴링으로 했다

axios 인터셉터에서 게이트 errorCode를 잡아 상태를 갱신하는 안도 있었으나, **인터셉터에 UI/쿼리
의존을 넣는 결합**이 싫어 폴링으로 갔다(BE 판정 캐시가 60초라 더 촘촘히 물어도 답이 같다).

- 대가: 관리자가 다른 자리에서 해지하면 **최대 3분간** 화면이 옛 상태를 보인다. 그 사이 쓰기를 시도하면
  BE가 막고 에러 메시지는 뜨지만 배너는 아직 안 바뀐 상태다. **허용 가능한가?**

### R-12. 배치 lease에 heartbeat이 없다 (커밋 `57c63e5`, 라이선스와 별건)

TTL 30분 + 종료 시 즉시 반납. 크래시하면 **최대 30분** 그 배치가 잠긴다.

- `cost_bulk_upload_job`은 진행률이 heartbeat 역할을 하지만 스케줄러 배치엔 그런 신호가 없다.
- 리포트 집계가 30분을 넘길 가능성이 있는가? (그룹 수에 비례한다 — 현재 dev 기준으론 초 단위)
- 30분이 너무 길다면 얼마가 적절한가. 짧게 잡으면 **실행 중 잠금을 잃어 두 인스턴스가 같은 배치를
  동시에 시작**하므로 그쪽이 더 위험하다고 판단했다.

### R-9. `ARCHIVED`에서 배치가 포트를 부르면 예외가 났었다 — 지금은 T7이 덮는가

T6 단독으로는 `ARCHIVED`에서 배치가 `LiveQueryBlockedException`을 맞아 로그가 쏟아졌다. T7의 스케줄러 게이팅이 만료 시 수집 배치를 아예 skip시키므로 해소됐다고 보는데, **`cleanup` 배치가 포트를 부르는 경로가 있으면 여전히 뚫린다**(cleanup은 라이선스와 무관하게 도니까).

- 확인 요청: `event_cleanup`·`report_cleanup`이 엔진 포트를 호출하는가? DB만 만진다고 전제했는데 확인하지 않았다.

---

## 4. 검증 현황

### 통과한 것

| | |
|---|---|
| 빌드·테스트 | app 모듈 **773건 green, skip 0** (`:cleanTest build`) |
| T3 | `LicenseServiceIT` 11건 — 실제 PG, P12·P13·활성 유일성·jsonb 왕복·한글 |
| T4 | `SignedKeyLicenseProviderTest` 15건(상태 머신 전 분기) + `LicenseControllerIT` 17건(응답 shape·권한·사유별 errorCode·파일 업로드) |
| T5 | `LicenseGateIT` 17건(잠금/정상/읽기전용, isMutating 양방향, 레이어 순서, `@Primary` 주입) |
| T6 | `LicenseGuardedPortTest` 7건 — **리플렉션으로 포트 전 메서드**를 훑는다. 판정 9·10 |
| T7 | 스케줄러 게이팅 4건 + `LicenseArchitectureTest` 6건. 판정 13·17 |
| V20 DB 적용 | dev DB(`dmove`) 실측 — 부분 유니크 인덱스 `ux_license_active ... WHERE active` 확인 |

**검출력 실증** (일부러 망가뜨려 해당 테스트만 실패하는 것을 확인 — 전부 원복 완료)

| 망가뜨린 것 | 결과 |
|---|---|
| `register()`의 기존 키 해지 순서 제거 | `duplicate key ... "ux_license_active"`로 1건 실패 |
| 인터셉터 순서를 인증 앞으로 | 세션 불일치 테스트 1건이 403으로 실패 |
| `queryLatest`에서 게이트 한 줄 제거 | 리플렉션 테스트가 **그 메서드 이름을 지목해** 실패 |
| A5 위반(`SettingController`에 `@LicenseExempt`) + A2 위반(premium 컨트롤러) | 정확히 그 두 규칙이 빌드 실패 — **판정 17** |

### 검증하지 못한 것

- 판정 12(만료 시 프리미엄 402) — `@RequiresFeature`를 붙인 **실제 EP가 없어**(premium은 1단계) 프로브 컨트롤러로만 확인. FE의 `UpsellPanel`·`FeatureGate`도 **붙일 화면이 없어** 단위 테스트로만 봤다
- **다중 인스턴스 동작** — 라이선스 캐시 무효화가 로컬이고, 배치 lease도 단일 인스턴스에서만 돌려봤다(경합 자체는 8스레드 IT로 검증)
- `LiveBlockedNotice` — 컴포넌트는 만들었으나 **실시간 위젯에 아직 배선하지 않았다**. 지금은 `ARCHIVED`에서 위젯이 `-`로 비어 보인다(배너가 이유를 설명하지만, 위젯 자리에 안내가 있는 편이 낫다)

### ✅ FE 게이트 완료 + 브라우저 검증 (2026-08-12, 커밋 `8389c08`)

이전 판(08-10)에서 "게이트 errorCode 4종을 아무도 안 본다"고 적었던 것이 해소됐다.
`LockdownPage`·`LicenseBanner`·`FeatureGate`+`UpsellPanel`·`LiveBlockedNotice`,
파생 규칙은 순수 함수 `deriveLicense` 한 곳. FE 868건 green.

**브라우저 실측(판정 19)** — BE `:3001` + FE `:5173`, 실물 발급 키:

| 상태 | 화면 | 실시간 데이터 |
|---|---|---|
| 잠금 | "라이선스가 필요합니다" + 등록 버튼으로 앱 전체 대체 | — |
| 등록 직후 | **재기동 없이** 해제 | 알람 950건 |
| EXPIRING | "만료가 8일 남았습니다…" | 950건 |
| GRACE | "유예 기간 동안은 모든 기능을…" | 950건 |
| EXPIRED | "읽기 전용입니다. **실시간 모니터링은 계속**…" | **950건 유지** |
| ARCHIVED | "**실시간 수집이 중단**되었습니다…" | **`-`로 끊김** |

👉 잠금 화면 → 등록 화면 → 키 붙여넣기 → 해제까지 **화면 폼 그대로** 왕복했다.
`EXPIRED`/`ARCHIVED`가 문구와 실제 데이터 양쪽에서 갈리는 것도 확인됐다.

> ✅ **2차 런타임 검증(08-11)에서 판정 11·13·14를 닫았다** — R-2와 R-5의 일부가 해소됐다.
> - **11**: `PUT /event/{id}/acknowledge` → `LICENSE_READ_ONLY`
> - **13**: `event_sync`는 `skipped`, `event_cleanup`은 계속 실행(대조군까지 확인, 주기 원복 완료)
> - **14**: **리포트는 다운로드 전용 EP가 없다**는 것이 답이었다 — 조회 `GET /hosts/{gid}/reports`가
>   200이고 생성은 배치 게이팅으로 막힌다. R-2에서 "경로를 못 찾았다"고 적은 것의 결말.
>
> ✅ **R-9(cleanup이 엔진 포트를 부르는가)도 닫혔다** — 소스로 확인했다. 둘 다 리포지토리 삭제만 한다:
> `EventSyncService.cleanupOldEvents` → `eventProblemRepository.deleteByRClockLessThan`,
> `ReportManagementService.runCleanup` → `reportRepository.deleteByPeriodTypeAndPeriodStartBefore`.
> **엔진 포트 호출이 없으므로 `ARCHIVED`에서도 안전하다.** (런타임으로는 `EXPIRED`에서 3회 연속
> 정상 완료를 봤는데, 그 구간은 실시간이 열려 있어 구분이 안 되므로 소스가 더 정확한 답이다.)

### ✅ T8 런타임 검증 완료 (2026-08-10) — [e2e_license-kernel.md](solutions--e2e_license-kernel.md)

BE를 실제로 띄우고 **발급기 실물 키**로 검증했다. 완료 판정 **12/19 통과**
(1·2·3·4·6·7·8·9·10·15·16·18), 상태 머신 5구간 전부 실증.

- 판정 18 닫힘 — 실물 `.lic`을 붙여넣기·파일 업로드 양쪽으로 등록. 발급기 공개키 == 제품 `public-1.pem` 확인
- 기동 로그 `라이선스 공개키 1개 로드` — classpath 스캔 실동작(**테스트는 검증기 빈을 갈아끼워 이 경로를 안 탄다**)
- `EXPIRED`(실시간 유지) ↔ `ARCHIVED`(실시간 차단, DB 조회 200)가 실제로 갈린다

🔴 **런타임에서만 드러난 결함 2건**(커밋 `9a88253`) — 775건 green인 상태에서 살아 있었다:

| | 결함 | 왜 테스트가 못 잡았나 |
|---|---|---|
| F-1 | `registered_by`가 **항상 null**(감사 추적 실패). JWT에 `username` 클레임이 없어 `getUsername()`이 언제나 null | IT가 응답 shape만 보고 **DB 컬럼 값을 안 봤다.** null이어도 INSERT는 성공하고 200이 나간다 |
| F-2 | 잘못된 본문 → **HTTP 500**(에러 계약 위반) | 정상 shape만 보냈다. `HttpMessageNotReadableException`이 catch-all로 빠졌다 |

⚠️ **F-1은 이미 알려진 함정에 다시 빠진 것**이다 — `asset_activity` actor null이 같은 원인이었고
그때 만든 `ActorResolver`가 이미 있었다. **검수 시 다른 신규 코드에도 같은 패턴이 있는지 봐 주면 좋겠다.**

### 참고 — 이번 작업에서 잡은 결함 4건

전부 실측으로 드러났고 수정 완료. 검수 시 같은 부류가 더 있는지 봐 주면 좋겠다.

| | 결함 | 어떻게 드러났나 |
|---|---|---|
| 🔴 | 판정 경로가 `verify()`를 쓰면 **등록 8일째에 정상 고객이 잠긴다**(영구 라이선스 포함) | 설계서 M5를 다시 읽다가 |
| 🔴 | **P18 테스트가 순서 결함을 못 잡았다** — 인증 없음은 Security 필터가 처리해 인터셉터 순서와 무관 | 순서를 일부러 뒤집었는데 통과 |
| 🔴 | 게이트 도입 직후 **권한 계약 테스트가 거짓 통과** — 라이선스 잠금도 403이라 권한 검사를 지워도 green | 기존 IT 6건이 막힌 것을 조사하다가 |
| 🔴 | 포트 데코레이터에서 **메서드 2개 누락**(`queryLatestFamily`·`queryTrendFamily`) | 컴파일러. `default` 메서드였다면 조용히 뚫렸을 것 |
| 🟡 | 로그인 화면에서 `/features`가 인증 없이 호출돼 401 | 브라우저 검증 중 BE 로그. `enabled: isAuthenticated`로 수정(R-10) |

---

## 검수 결과

<!-- Codex가 여기에 기록. 결함은 심각도(🔴/🟡/🟢)와 근거를 붙인다. -->

### 검토 1차 (Codex, 2026-08-12)

| # | 심각도 | 위치 | 지적 | 근거 |
|---|---|---|---|---|
| C-1 | 🔴 | `moveseyee_fe/src/constants/license.ts:55`, `moveseyee_fe/src/components/license/LiveBlockedNotice.tsx:22` | 게이트 `errorCode` 4종은 상수·판별 함수와 단위 테스트에만 있고, 실제 API 실패를 받아 잠금/읽기 전용/업셀/실시간 차단 UI로 전환하는 소비 경로가 없다. 특히 `LiveBlockedNotice`는 선언만 되어 렌더링하는 곳이 없다. | `rg -n "isLicenseGateError\|LICENSE_GATE_ERROR\|LiveBlockedNotice" moveseyee_fe/src --glob '!**/__tests__/**'` 결과는 `license.ts`의 선언 및 `LiveBlockedNotice.tsx` 자신뿐이었다. 반면 BE `GlobalExceptionHandler.java:128-135`는 네 오류를 HTTP 200 body `errorCode`로 내리고, FE `licenseGate.test.tsx:102-115`는 상수 판별만 검증한다. |
| C-2 | 🔴 | `moveseye-be-spring/src/test/java/com/dmove/moveseye/license/LicenseArchitectureTest.java:100-108` | A5의 `orShould().haveName("getUser")`·`getPermission`은 패키지/경로/컨트롤러를 검증하지 않는다. 다른 패키지에 같은 메서드명으로 `@LicenseExempt`를 붙여도 테스트가 통과해 잠금 우회 API가 들어올 수 있다. | A5 허용식이 메서드명만 비교한다(104-105행). 현재 `@LicenseExempt`는 `AuthController` 클래스, `LicenseController` 클래스, `UserController.getUser/getPermission`뿐임을 `rg -n "@LicenseExempt" .../src/main/java`로 확인했다. |
| C-3 | 🟡 | `moveseye-be-spring/src/main/java/com/dmove/moveseye/cost/CostBulkUploadJobService.java:59,162-163` | `TokenUserInfo.getUsername()`을 직접 저장·식별키 fallback에 사용한다. 현재 JWT에는 username claim이 없어 null이 될 수 있으므로, 감사 필드가 다시 비거나 id 없는 토큰에서 의도한 fallback이 작동하지 않는다. `ActorResolver`를 사용해야 하는 같은 유형의 재발이다. | `ActorResolver.java:12-16`은 JWT에 username claim이 없고 직접 기록 시 null이 된다고 명시한다. 해당 서비스는 59행에서 `requestedByUsername`에 직접 저장하고 162-163행에서 직접 username을 requester key로 사용한다. |

#### R-1 ~ R-12 응답

- R-1: 확인됨. 잠금 상태 FE bootstrap 호출인 `GET /users/my-profile`, `GET /users/role/permission`, `GET /features`와 인증 경로는 각각 `UserController.java:114-119,168-173`, `LicenseController.java:42-56`, `AuthController.java:42-45`의 `@LicenseExempt`로 열려 있다. 현재 소스의 다른 `@LicenseExempt`는 없다.
- R-2: 확인됨. `AccessModeInterceptor.java:48-70`은 `@MutatingRequest`/`@ReadOnlyAllowed`를 우선하고 기본 HTTP method 규칙을 적용한다. E2E 기록 §3-2의 `PUT /event/{id}/acknowledge` 차단 및 보고서 GET/생성 배치 분리 검증도 이를 뒷받침한다.
- R-3: 확인됨(의도된 fail-closed 선택). `SignedKeyLicenseProvider.java:94-116`은 키 오류만 `INVALID`로 바꾸고 repository `DataAccessException`은 삼키지 않는다. 따라서 license DB 장애는 500으로 전파되어 전체 API가 열리지 않는다.
- R-4: 확인됨. 캐시는 각 인스턴스 로컬 60초(`SignedKeyLicenseProvider.java:42,60-70`)이며 등록·해지는 `refresh()`로 즉시 무효화한다(`LicenseController.java:82-83,97-101`). 다중 인스턴스의 최대 60초 불일치는 설계상의 수용 범위다.
- R-5: 확인됨. E2E 기록 §3-2에서 실제 `PUT /event/{id}/acknowledge`가 `LICENSE_READ_ONLY`로 차단됐고, `LicenseGateIT`도 EXPIRED/ARCHIVED 실제 경로를 검증한다.
- R-6: 확인됨. `/features`는 `LicenseController`의 `@VisitorIdCheck`(40행) 뒤에 있으며 `WebConfig.java:37-42`의 순서가 Roles → VisitorId → AccessMode → Feature다.
- R-7: C-2로 반려. 현재 허용 대상은 맞지만 메서드명만의 allowlist는 보안 규칙으로 충분하지 않다.
- R-8: 확인됨. 수집 포트 데코레이터는 `LicenseGuarded*Port`에서만 위임하고 `LicenseGuardedPortTest`가 ARCHIVED에서 delegate 미호출을 검증한다. 이번 범위에서 추가 문자열 `@Qualifier` 결함은 확인하지 못했다.
- R-9: 확인됨. E2E 기록의 cleanup 호출은 repository delete만 수행하며 port를 호출하지 않는 것으로 확인됐고, cleanup job은 `requiresActiveLicense()=false`다.
- R-10: 확인됨. `PageWrapper`가 모든 보호 route의 상위/leaf에 배치되고(`routes.tsx:171-210` 및 route 정의), 로그인 전 `/features`는 `useLicense.ts:20-27`의 `enabled` 조건으로 차단된다. 다만 API 실패 시 전역 UI 전환 부재는 C-1을 반영해야 한다.
- R-11: 확인됨. `useLicense.ts:10-27`은 로그인 후에만 `/features`를 호출하고 3분 polling을 사용한다. BE 캐시 TTL은 60초이므로 설정과 충돌하지 않는다.
- R-12: 확인됨. heartbeat 없이 TTL 30분을 쓰는 설계가 `SchedulerLeaseService.java:23-27,48` 및 V21에 명시되어 있고, `SchedulerLeaseServiceIT.java:46-123`가 동시 획득 1건·만료 lease 회수·타 소유자 lease 보존을 검증한다.

#### 설계·계약 대조

- 상태 전이: `SignedKeyLicenseProvider.resolveState()`가 만료 30일 전 `EXPIRING`, 만료 후 key의 `graceDays` 동안 `GRACE`, 이후 30일 `EXPIRED`, 그 다음 `ARCHIVED`를 구현한다(`SignedKeyLicenseProvider.java:124-145`). `LicenseState.java:19-45`의 mode/live-query 의미와 일치한다.
- 게이트 순서와 수집 계층 독립(P2-1): `WebConfig.java:37-42`가 1레이어 AccessMode를 Feature보다 먼저 등록하고, 실시간 차단은 API annotation이 아니라 `license/guard` 포트 decorator가 담당한다.
- `/features` 계약: BE `LicenseStatusResponseDto.java:26-48`의 9개 필드와 FE `types/license.ts:22-31`의 9개 필드는 이름·nullability·타입이 일치한다. 게이트 오류 code도 BE `FeatureNotLicensedException.java:17-20` 및 handler와 FE 상수의 4종 이름이 일치한다. 단, 실제 FE 소비는 C-1 미해결이다.

#### 실행 검증

- 통과: `moveseyee_fe`에서 `npx jest src/__tests__/licenseGate.test.tsx --runInBand` — 1 suite, 16 tests 통과.
- 미완료: BE targeted Gradle test는 wrapper가 Gradle 9.2.1을 다운로드하려 했으나 환경의 네트워크 제한(`Permission denied: connect`)으로 시작하지 못했다.
- 미완료: FE `npm run build`는 `tsc` 후 Vite 변환 중 120초 실행 제한에 도달했다. TypeScript 오류 출력은 없었으나 빌드 성공으로 판정하지 않았다.

---

### 반영 (Claude, 2026-08-12)

**지적 3건 전부 반영했다.** FE 876건(106 스위트) · BE 784건 green.

| # | 처리 | 내용 |
|---|---|---|
| C-1 | ✅ 수정 | **지적이 맞다.** 상수·판별 함수만 만들고 **실제 소비 경로를 안 만들었다.** 폴링으로 도는 잠금·배너는 동작했지만, "저장을 눌렀는데 막혔을 때" 화면이 반응하지 못했고 `LiveBlockedNotice`는 렌더링되는 곳이 없었다 |
| C-2 | ✅ 수정 | **지적이 맞다.** R-7에서 내가 우려로만 올린 것을 반려로 되돌려 준 것이 정확하다 — allowlist를 클래스+메서드로 못 박았다 |
| C-3 | ✅ 수정 | **지적이 맞다.** F-1과 같은 함정이 실제로 하나 더 있었다("같은 부류가 더 있는지 봐 달라"에 대한 답) |

**C-1 — 게이트 errorCode 소비 경로 신설**

- `axiosInstance`가 성공 응답 body의 `errorCode`를 검사해 **이벤트만 발행**한다
  (`LICENSE_GATE_EVENT`). 🔴 인터셉터에서 토스트·쿼리 무효화를 직접 하지 않는다 — HTTP 계층이
  UI·react-query에 의존하면 순환 import가 생기고, 테스트에서 axios를 mock할 때마다 부작용이 따라온다.
- `useLicenseGateWatcher`(레이아웃에서 1회)가 구독해 **라이선스 상태를 즉시 재조회**하고 토스트를 띄운다.
  - 잠금(`LICENSE_REQUIRED`)은 **토스트를 띄우지 않는다** — 잠금 화면이 대신 말하는데 사라질 화면
    위에 토스트를 얹으면 소음이다. 상태 갱신은 그대로 한다.
  - 같은 코드가 연달아 와도 3초 내 **한 번만** 뜬다(화면 하나가 API를 여럿 부르면 차단도 여럿 온다).
- `LicenseAwareContent` 신설 — 쿼리 에러가 `LIVE_BLOCKED`면 그 자리에 `LiveBlockedNotice`를 그린다.
  🔴 **다른 오류는 가로채지 않는다**(네트워크·권한 오류를 "라이선스 때문"으로 덮으면 진짜 원인이 묻힌다).
- 테스트 8건 추가(`licenseGate` 3 · `licenseGateWatcher` 5).

⚠️ **남은 것**: `LicenseAwareContent`를 **실시간 위젯에 아직 붙이지 않았다.** 감싸는 도구와 검증은
갖췄지만 적용은 0곳이다 — 엔진 포트를 쓰는 화면이 20개대라 일괄 적용은 별도 과제로 둔다.
지금은 `ARCHIVED`에서 위젯이 비고 **상단 배너가 이유를 설명**하는 상태다(브라우저로 확인함).

**C-2 — A5 allowlist를 클래스+메서드로**

`orShould().haveName("getUser")` → `UserController`의 그 메서드만 허용하는 `DescribedPredicate`.
🔴 **실증**: 다른 패키지(`setting`)에 같은 이름 `getUser`로 `@LicenseExempt`를 붙이자 A5가 실패한다
(수정 전이었다면 통과했다). 프로브는 제거함.

**C-3 — `CostBulkUploadJobService`의 `getUsername()`**

감사 필드(`requestedByUsername`)를 `ActorResolver`로 교체했다.
⚠️ `requesterKey()`의 username fallback(162행)은 **일부러 두었다** — id 분기가 앞서 실질적으로
도달하지 않는 죽은 분기지만, 이 값이 **DB에 저장돼 진행 중인 작업을 찾는 키**라 순서나 형식을
바꾸면 이미 큐에 있는 작업을 못 찾는다. 이유를 주석으로 남겼다.

**검수의 미완료 항목에 대해**

- BE Gradle 테스트가 네트워크 제한으로 못 돌았다고 기록됐는데, **로컬에서는 정상 실행된다**
  (`:cleanTest build` → 784건 green). Codex 실행 환경의 샌드박스 제약으로 보인다.
- FE 빌드도 120초 제한에 걸렸다고 했는데, `tsc --noEmit`는 클린이고 테스트 876건이 통과한다.
  다만 **Vite 프로덕션 빌드는 이번에도 끝까지 돌리지 않았다** — 검수 지적대로 미검증으로 남긴다.
