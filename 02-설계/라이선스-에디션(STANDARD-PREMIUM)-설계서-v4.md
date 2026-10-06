# 라이선스 & 에디션(STANDARD / PREMIUM) 설계서 v4

- 작성일: 2026-07-29 (v1) / 개정: 2026-07-29 (v2, v3) / **2026-08-06 (v4 — 미결 전건 확정, 구현 착수본)**
- 대상: `moveseye-be-spring`(BE) / `moveseyee_fe`(FE)
- 선행 문서: `devdesign_collector-engine.md`(수집 엔진 포트화 — Capability 레지스트리의 출처)
- 후속 문서(예정): `devdesign_apm.md`(APM은 본 문서 범위 밖 — §7.4)

### 개정 이력

| 버전 | 날짜 | 변경 | 사유 |
|---|---|---|---|
| v1 | 2026-07-29 | 최초 — 프리미엄 3종 언락 게이팅 설계 | — |
| v2 | 2026-07-29 | ① 2티어(STANDARD/PREMIUM) + 라이선스 필수 ② 기간제/영구 라이선스 모델 ③ 잠금 모드·갱신 규칙·키 재사용 방지 신설 ④ 게이팅 2레이어화 | 사용자 결정: 라이선스 필수 2티어 / 기능 묶음으로 티어 구분 / 영구는 무제한·기간제는 기간까지·**갱신 시 해당일부터** |
| **v3** | **2026-07-29** | **① 만료 시 완전 잠금 → 읽기 전용(`READ_ONLY`)으로 전환 ② `AccessMode` 3단계 신설(P14) ③ 읽기/쓰기 판정 규칙 신설(P15) ④ 배치 게이팅을 실측 6개 잡 기준으로 재작성(P10) ⑤ 데이터 내보내기 예외(P16)** | 사용자 결정: 만료는 **잠금이 아니라 읽기 전용** / 수집 중단·과거 데이터 조회 / **영구 유지 + 내보내기 허용** / 프리미엄은 완전 차단 |
| **v4** | **2026-08-06** | **① 미결 M1~M9 전건 확정(§7.1이 결정표로 바뀜) ② 실시간 조회 단계적 차단 신설 — `ARCHIVED` 상태·`allowsLiveQuery()`·엔진 포트 데코레이터(P17) ③ `TRIAL` 타입 삭제 ④ `maxHosts` 강제·표시 없음 ⑤ 인터셉터 순서 확정(P18) ⑥ 프리미엄 경계 규칙 명문화 — 수집층 중립(P2 보강) ⑦ 발급 도구 구체화(§5.10) ⑧ 재실측 반영: Flyway V16→V20, `SchedulerJob` 시그니처, GET 114/쓰기 75** | 착수 전 설계 재점검(2026-08-06). 최대 운영 리스크였던 M6은 **설치 고객 부재로 소멸** |

---

## 0. 한눈에 보기

**한 줄 요약**: 제품을 **STANDARD / PREMIUM 2티어**로 나누고, 모든 설치본은 **유효한 라이선스 키를 필수**로 요구한다. 프리미엄 기능(GPU·DB·APM) 코드는 배포본에 전부 포함되고 티어에 따라 런타임에 열린다. 라이선스는 **기간제·영구** 두 타입이며, 기간제는 **등록일 기준으로 기간이 시작**된다. **만료는 제품을 잠그지 않고 읽기 전용으로 전환**한다.

| 단계 | 내용 | 상태 |
|---|---|---|
| **0** | 라이선스 커널 (`license/` 패키지 + 3단 접근 모드 + 엔진 포트 데코레이터 + **V20** + 발급 도구 + FE 잠금·읽기전용·실시간차단·업셀) | 🔄 **진행 중** (아래) |
| **1** | GPU 모니터링 (`MetricDomain.GPU` + Zabbix 카탈로그 + 화면) | ⬜ |
| **2** | DB 모니터링 (`device_classification` 활용 + 화면) | ⬜ |
| **3** | APM (별도 설계서, 별도 파이프라인) | ⬜ 범위 밖 |

### 🔄 0단계 구현 현황 (2026-08-06 기준)

**브랜치**: BE `ZM-79`(develop 기준) · 발급기는 **별도 저장소** `moveseye-license-issuer`(Bitbucket, `main`)

| 항목 | 상태 |
|---|---|
| 판정 축(enum 5종·`LicenseStatus`·`LicenseClaims`) | ✅ 커밋 `9787a4c` |
| `LicenseKeyVerifier`(RS256·공개키 리스트 순회) | ✅ 커밋 `9787a4c` · 테스트 11 |
| 발급 도구(대화형 `.bat` + CLI·`.lic`·발급 대장) | ✅ 별도 저장소 `81f41ca` · **실동작 검증** |
| 저장소 분리 + `LicenseContractTest`(양쪽) | ✅ 커밋 `cce4fa5` · 테스트 4+4 |
| **V20 + `License` 엔티티 + `LicenseService`(P12·P13)** | ✅ 커밋 `74c4e93` · **검증 완료(08-10)** — dev DB 적용 확인, `LicenseServiceIT` 11건. 검출력 실증: 활성 해지 순서를 빼면 `ux_license_active` 위반으로 해당 1건만 실패 |
| `LicenseProvider`·캐시 · `GET /features` · 등록/해지 EP | ✅ **08-10** — `SignedKeyLicenseProvider`(상태 머신 전 분기 + 60초 캐시 + `refresh()`), `LicenseController`(붙여넣기·파일 업로드 2경로), `ErrorCode` 5종. 테스트 32건(단위 15 · IT 17) |
| 인터셉터 2종 + 예외 4종 + `WebConfig` 순서(P18) | ✅ **08-10** — `AccessModeInterceptor`·`FeatureInterceptor`, `LicenseGateException` 계층 4종, 어노테이션 3종, `ErrorCode` 4종. 면제: `AuthController` 전체 + `GET /users/{my-profile,role/permission}`. `LicenseGateIT` 14건 |
| 엔진 포트 데코레이터 3종(P17) | ✅ **08-10** 커밋 `4b82bcc` — `guard/` 3종 + `LiveQueryGuard`. 판정 9·10 고정. 테스트는 리플렉션으로 포트 전 메서드를 훑는다(위임만 하고 검사를 빠뜨리는 구멍 방지) |
| 스케줄러 게이팅 + ArchUnit A1~A5 | ✅ **08-10** — `SchedulerJob.requiresActiveLicense()`(기본 true, cleanup만 false) + `SchedulerManager.execute` 단일 지점 차단. ArchUnit 6규칙. **판정 13·17 실증** |
| **런타임 검증(T8)** | ✅ **08-10** — 실물 발급기 키로 BE 실기동 검증. 상태 머신 5구간 전부 실증. 결함 2건 발견·수정(`9a88253`). 기록: [e2e_license-kernel.md](../08-%EA%B2%80%EC%A6%9D-QA/E2E-%EB%9D%BC%EC%9D%B4%EC%84%A0%EC%8A%A4-%EC%BB%A4%EB%84%90-%EB%9F%B0%ED%83%80%EC%9E%84-%EA%B2%80%EC%A6%9D-%28T8%29.md) |
| FE 일체 | 🔄 **다른 세션 진행 중** — `pages/setting/{license,integrations}`·`useLicense`·`license.api`. 계약(필드 9·경로 3·errorCode 5)은 대조 결과 **정확히 일치**. ⚠️ 단 **게이트 errorCode 4종**(`LICENSE_REQUIRED`·`READ_ONLY`·`FEATURE_REQUIRED`·`LIVE_BLOCKED`) 처리가 FE에 **없다**(grep 0건) — 잠금 화면·배너·업셀이 뜨는 조건이 바로 그 넷이다 |
| 완료 판정 19항목(§6) | 🔄 **18/19 통과** — 1·2·3·4·**5**·6·7·8·9·10·11·13·14·15·16·18·**19** 실측 + 17 실증(08-12 3차: 5·19 브라우저 실측 — `e2e_license-kernel.md` §9). **남은 하나**: 12는 `@RequiresFeature`를 붙인 실제 EP가 1단계(GPU)에 가야 생긴다. 19의 업셀 화면도 렌더 지점(프리미엄 화면)이 1단계에 생기면 실증 |

> 🔴 **P18 검증은 "인증 없음"으로 안 된다**(08-10 실측). Security 필터 체인이 DispatcherServlet보다
> 앞이라, 인증되지 않은 요청은 **라이선스 인터셉터를 어디에 등록하든 401**이 먼저 난다 — 순서를
> 뒤집어도 테스트가 통과해 결함을 못 잡았다. 실제로 순서에 좌우되는 것은 **인터셉터끼리** 겨루는
> 경로다: `VisitorIdCheckInterceptor`의 세션 불일치(401)가 라이선스를 앞에 두면 `LICENSE_REQUIRED`
> (403)로 가려진다. 판정 16은 **유효 JWT + 틀린 `x-visitor-id`** 로 검증해야 한다.

> 🔴 **테스트에도 우회 스위치를 두지 않는다**(P11). 게이트 도입 후 IT는 실제 서명된 키를 실제
> 테이블에 심어 연다(`IntegrationTestSupport.seedActiveLicense`). ⚠️ **시드가 없으면 권한 계약
> 테스트가 거짓 통과한다** — 라이선스 잠금도 바디 `code=403`이라 "일반 USER는 거부된다"류가
> 권한 검사를 통째로 지워도 green이 된다(실측).

> 🔴 **판정 경로는 `LicenseKeyVerifier.verify()`가 아니라 `parse()`를 쓴다**(08-10 신설).
> `activationDeadline`은 "이 날짜까지 **등록**해야 한다"는 뜻이고 기본값이 발급 후 7일(M5)이다. 등록된
> 라이선스를 매 요청 재검증하는 경로에서 같은 조건을 걸면 **등록 8일째에 정상 고객이 통째로 잠긴다**
> — 영구 라이선스도 예외가 아니다. 기한은 미등록 키의 수명이지 등록된 라이선스의 수명이 아니다.
> `SignedKeyLicenseProviderTest`가 이 구분을 지킨다(`verify`가 불리면 실패).

> ⚠️ **발급기가 별도 저장소가 되면서** §5.10의 "app과 소스 공유"는 성립하지 않는다. 클레임 상수·enum 4개
> 파일을 **양쪽 동일 사본**으로 두고, 각 저장소의 `LicenseContractTest`가 같은 문자열을 독립적으로 주장해
> 어긋남을 잡는다. 클레임을 바꿀 때는 **양쪽 사본과 양쪽 테스트를 함께** 고쳐야 한다.

---

**핵심 결정 요약**
- 배포본은 하나. 포크·빌드 프로파일 분기 **없음**(P1).
- `premium/` 패키지 + ArchUnit 역참조 차단. 모듈 승격은 조건 명시 후 유예(P2).
- **수집층(`engine-api`·`engine-zabbix`)은 중립. 게이팅은 항상 API층에서** — 프리미엄 메트릭을 "수집할 수 있다"는 Capability이지 Feature가 아니다(P2·P3).
- 3축 분리: `Capability`(소스가 가능) / `Edition`(구매 등급) / `Feature`(개별 기능) — P3.
- **접근 모드 3단계**: `FULL` / `READ_ONLY` / `LOCKED` — P14.
- 게이팅은 **2레이어**: ①접근 모드 게이트(전역) ②기능 게이트(`@RequiresFeature`) — P4. **인증·권한 인터셉터 뒤에 선다**(P18).
- 판정식 = `editionDefaults(edition) ∪ features` **합집합** — P3.
- 기간제는 **등록 시점에 만료일을 계산**한다(키에는 기간만) — P12.
- **만료 = 읽기 전용(영구), 잠금 아님.** 과거 데이터 조회·내보내기는 영구 보장 — P14·P16.
- **읽기 전용은 2구간**: 만료 후 30일은 실시간 조회까지 유지(`EXPIRED`), 이후 DB 조회만(`ARCHIVED`) — P17.
- Flyway는 라이선스와 무관하게 **항상 전량 실행**(P6). 라이선스 테이블은 **V20**.

---

## 1. 배경과 목표

### 1.1 배경

DMOVE는 고객사 온프레미스에 설치되는 상용 제품이다. 제품을 두 등급으로 판매한다:

| 에디션 | 포함 범위 |
|---|---|
| **STANDARD** | 현재 제품의 전 기능 (인프라·서버·네트워크 모니터링, 자산 관리, 맵, 리포트, Zabbix 관리 등) |
| **PREMIUM** | STANDARD + **GPU 모니터링 · DB 모니터링 · APM** |

**두 에디션 모두 유효한 라이선스 키를 필수로 요구한다.** 키가 없으면 제품이 잠금 모드로 동작한다(P11).

라이선스는 **기간제**(구독)와 **영구** 두 형태로 판매한다.

### 1.2 목표

1. 하나의 배포본으로 STANDARD/PREMIUM 고객을 모두 커버한다. 빌드·릴리스 라인을 늘리지 않는다.
2. 라이선스 키 등록만으로(재기동 없이) 등급이 반영된다.
3. 프리미엄 기능 추가 시 **게이팅을 깜빡할 수 없는** 구조를 만든다 — 누락이 곧 무상 제공이므로 빌드/테스트가 강제해야 한다.
4. **티어 구성을 바꿔도 기존 고객의 키를 재발급하지 않아도 된다**(P3 합집합 판정).
5. 기간제 고객이 키를 늦게 등록해도 손해 보지 않는다 — **등록일부터 기간 시작**(P12).
6. **만료가 고객의 데이터 접근권을 빼앗지 않는다** — 만료는 읽기 전용 전환이며, 과거 데이터 조회·내보내기는 영구 보장한다(P14·P16).
7. 나중에 "프리미엄 코드를 아예 뺀 배포본"이 필요해지면 모듈로 승격할 수 있도록 경계를 미리 세운다.

### 1.3 비목표

- **강력한 DRM/난독화·복제 방지**: 온프레미스에서 완전 방어는 불가능하다. 위조 방지(서명)와 명백한 어뷰징 차단(P13)까지가 기술의 몫이고, 그 이상은 계약이 방어선이다.
- **사용량 기반 과금·미터링**: 현 단계는 에디션 + 기능 on/off만. 호스트 수 상한은 클레임에 담되 1차 강제는 하지 않는다(§7.1 M3).
- **SaaS 멀티테넌시**: 판정 축만 인터페이스로 추상화해 두고 구현체는 추후(P7).
- **온라인 라이선스 서버·주기적 콜홈**: 온프레미스 폐쇄망 고객을 전제로 **완전 오프라인 검증**만 한다.
- **APM 자체 구현**: §7.4.

---

## 2. 현황 실측 (2026-07-29 조사 / **2026-08-06 재실측**)

착수 근거가 되는 코드 현황이다. 설계 판단이 여기에 걸려 있으므로 먼저 기록한다.

**v4 재실측에서 바뀐 것** — 열흘 사이 코드가 움직였다. 아래 표는 07-29 값이고, 다음 4건이 갱신됐다:

| 항목 | 07-29 | **08-06** | 설계 영향 |
|---|---|---|---|
| Flyway 최신 | V15 | **V19** (`V19__cost_bulk_upload_job_heartbeat.sql`) | 라이선스 테이블은 **V20** |
| HTTP 메서드 분포 | GET 106 / 쓰기 73 | **GET 114 / 쓰기 75** (POST 30·PUT 15·PATCH 16·DELETE 14, 컨트롤러 33) | 메서드=쓰기 규칙 전제 **유효** |
| `SchedulerJob` 시그니처 | `key()` / `void run()` | **`jobKey()` / `String run(SchedulerSetting)`** | `minMode()` 추가안은 유효, 시그니처만 맞춘다 |
| 엔진 포트 사용처 | (미측정) | **20개 클래스** — `host/{cpu,memory,disk,network,responsetime,hostinterface,livecheck}`, `home`, `event`, `report`, `asset`, `classification` | **P17의 근거** — 모니터링 화면 대부분이 Zabbix 실시간이다 |

내장 배치 6개(`event_sync`·`event_cleanup`·`report_weekly`·`report_monthly`·`report_cleanup`·`user_sync`)와 인터셉터 2종(`RolesInterceptor`·`VisitorIdCheckInterceptor`), 에러 계약(200+바디 code)은 **그대로**다.

| 항목 | 실측 | 설계 영향 |
|---|---|---|
| **FE 메뉴·라우트** | `application-monitoring` / `database-monitoring` / `gpu-monitoring` **3개 모두 이미 존재**. 메뉴·PATH 상수·라우트·i18n 키 완비 | 신규 IA 설계 불필요. **껍데기만 채우면 된다** |
| **FE 페이지 실체** | 3개 모두 15~17줄 스텁 — `<Empty description={t("coming_soon", "준비 중입니다")} />` | 이 스텁이 **업셀 화면으로 교체될 자리**(P9) |
| **에러 응답 계약** | `GlobalExceptionHandler`: 모든 비즈니스 에러가 **HTTP 200 + `ApiResult(status=error, code=…)`**. 실제 상태 코드로 나가는 건 401뿐 | ⚠️ 라이선스 오류를 HTTP 402/403으로 내보내면 계약 위반. **200 + 바디 code**로 간다(P5) |
| **HTTP 메서드 분포** | **GET 106** / POST 29 / PUT 15 / PATCH 15 / DELETE 14 (쓰기 계열 합 **73**). POST 중 조회성 엔드포인트는 **거의 없음**(`/asset/sync`·`/user/sync`는 실제 쓰기) | **HTTP 메서드 = 쓰기 여부** 규칙이 잘 맞는다 → 읽기 전용 구현이 저렴(P15) |
| **스케줄러 구조** | `@Scheduled`가 아니라 `SchedulerManager` + `SchedulerJob`(DB 주기 관리). 내장 잡 **6개**: `event_sync`, `event_cleanup`, `report_weekly`, `report_monthly`, `report_cleanup`, `user_sync` | **배치 게이팅 지점이 한 곳**(SchedulerManager) — P10이 매우 싸진다 |
| **권한 게이팅 선례** | `RolesInterceptor`(`@RolesGuarded` + `@Roles`), `VisitorIdCheckInterceptor`, `AdminAccessChecker` | 동일 패턴 재사용. 인터셉터 등록은 `config/WebConfig` |
| **Flyway** | V1~V15까지 사용 중 → **08-06 재실측: V19까지** | 다음은 **V20** (v4 정정) |
| **설정 저장** | `setting` 테이블 = `SettingType`(PG enum: CLOUD, ZABBIX) + jsonb value | ⚠️ PG enum 값 추가는 Flyway 트랜잭션과 충돌 소지 → **전용 테이블**(P7) |
| **감사 로그** | `host_change_log`(V11), `zabbix_change_log`(V12) — 도메인별 전용 테이블 | 라이선스 이력은 `license` 테이블이 겸한다(P7) |
| **수집 엔진** | `engine-api`에 `MetricPort`/`InventoryPort`/`AlertPort` + `Capability{…}` | `Capability`와 `Feature`를 섞지 않는다(P3) |
| **메트릭 모델** | `MetricRef(domain, name, dims)` — DISK는 `{mount}`, NETWORK는 `{iface}` 차원 | **GPU는 `{gpu:"0"}`로 모델 변경 0**(§5.9) |
| **JWT 라이브러리** | auth0 `java-jwt` 이미 의존 | 라이선스 키를 **RS256 JWT**로 발급하면 신규 의존성 0(P7) |
| **ArchUnit** | **없음** | `testImplementation` 신규 추가 필요(P2) |
| **기기분류** | `device_classification` 테이블(V13), `database` code 이미 seed됨 | DB 인스턴스 분류에 재사용(§5.9) |

---

## 3. 라이선스 모델

### 3.1 3축 분리

| 축 | 의미 | 정의 위치 | 예 |
|---|---|---|---|
| `Capability` | 데이터소스가 **기술적으로** 제공 가능한가 | `engine-api/registry` (기존) | 이 Zabbix에 GPU 템플릿이 깔려 있는가 |
| `Edition` | 고객이 **어느 등급을** 구매했는가 | `license/` (신설) | STANDARD / PREMIUM |
| `Feature` | **개별 기능** 단위 접근권 | `license/` (신설) | GPU_MONITORING / DB_MONITORING / APM |

셋을 하나로 합치지 않는다. 사용자에게 보여줄 메시지가 각각 다르기 때문이다:

| capability | 보유 기능 | 사용자 메시지 |
|---|---|---|
| ✅ | ✅ | 정상 동작 |
| ✅ | ❌ | **"PREMIUM 기능입니다"** + 업셀 |
| ❌ | ✅ | "연결된 데이터소스가 이 기능을 지원하지 않습니다" (예: GPU 템플릿 미설치) |
| ❌ | ❌ | 업셀 우선(구매 유도가 목적) |

### 3.2 판정식 — 합집합

```
보유 기능 = editionDefaults(edition) ∪ features(개별 추가분)
```

| 매핑 | 값 |
|---|---|
| `editionDefaults(STANDARD)` | `{}` (프리미엄 기능 없음 — STANDARD는 현 제품 전 기능) |
| `editionDefaults(PREMIUM)` | `{GPU_MONITORING, DB_MONITORING, APM}` |

**왜 합집합인가**:
- edition→기능 매핑을 **키에만** 담으면, 나중에 PREMIUM에 기능을 추가할 때 **기존 고객 키를 전부 재발급**해야 한다.
- **앱에만** 두면 개별 추가 구매("STANDARD인데 GPU만 더")를 표현할 수 없다.
- 합집합이면 둘 다 된다 — 티어 구성 변경은 앱 업데이트로 전 고객에 자동 반영되고, 예외 판매는 `features`로 얹는다.

`editionDefaults` 매핑은 **앱 코드에 둔다**(`Edition` enum의 메서드). 키의 `features`는 **추가분**이다.

### 3.3 라이선스 타입

```java
public enum LicenseType {
    SUBSCRIPTION,   // 기간제 — 등록일부터 durationDays 동안
    PERPETUAL       // 영구 — 만료 없음
}
```

| 타입 | 만료 | 유예 | 만료 후 |
|---|---|---|---|
| `PERPETUAL` | **없음** | 해당 없음 | 해당 없음 — 만료 경로를 **아예 타지 않는다** |
| `SUBSCRIPTION` | 등록일 + `durationDays` | 있음(**기본 30일**, M1) | 읽기 전용 — **30일간 실시간 유지 후 DB 조회만**(P17) |

> **`TRIAL` 타입은 두지 않는다**(M4 결정). 체험판은 **기간제를 짧게 발급**해 대체한다.
> ⚠️ 이때 유예 기본값 30일이 그대로 붙으면 30일 체험이 실질 60일이 된다 → **체험용 키는 발급 시 `graceDays=0`으로 내보낸다.** 발급 도구에 해당 옵션을 둔다(§5.10).

### 3.4 상태 머신

```
서명 검증 실패 / 포맷 오류 ────────────────────► INVALID   → LOCKED
등록된 활성 키 없음 ──────────────────────────► NONE      → LOCKED

PERPETUAL ───────────────────────────────────► ACTIVE    → FULL

SUBSCRIPTION:
   now < expiresAt - 30d ─────────────────────► ACTIVE    → FULL
   expiresAt - 30d ≤ now < expiresAt ─────────► EXPIRING  → FULL       (+경고 배너)
   expiresAt ≤ now < graceEnd ────────────────► GRACE     → FULL       (+강한 경고)
   graceEnd ≤ now < graceEnd + 30d ───────────► EXPIRED   → READ_ONLY  (실시간 조회 유지)
   graceEnd + 30d ≤ now ──────────────────────► ARCHIVED  → READ_ONLY  (DB 조회만, 영구)

   graceEnd = expiresAt + graceDays        (graceDays 기본 30, 체험용 키는 0)
```

- **`EXPIRING` 임계(만료 30일 전)와 `graceDays`(30일)는 값이 같을 뿐 다른 개념이다.** 전자는 만료 *전* 경고 시작점, 후자는 만료 *후* 전 기능 유지 기간이다.
- `EXPIRED`와 `ARCHIVED`는 **둘 다 `AccessMode.READ_ONLY`**다. 갈리는 것은 `allowsLiveQuery()` 하나뿐이다(P17).
- 수집된 데이터는 어떤 상태에서도 **삭제하지 않는다.** 갱신하면 과거 데이터가 그대로 보인다.

**만료일 기준 전체 시간선**(기본값 기준):

```
 만료일 ─── +30일 ─────── +60일 ──────────────────────► 영구
   │  GRACE(전 기능)  │  EXPIRED(읽기+실시간)  │  ARCHIVED(읽기, DB만)
```

### 3.5 키 클레임

```jsonc
{
  "iss": "dmove-license",
  "jti": "<키 고유 ID>",              // ← 재사용 방지의 핵심 (P13)
  "sub": "<고객사 식별자>",
  "customer": "○○기업",              // 표시용
  "licenseType": "SUBSCRIPTION",      // SUBSCRIPTION | PERPETUAL
  "edition": "PREMIUM",               // STANDARD | PREMIUM  ← 판정에 사용(editionDefaults)
  "features": ["APM"],                // 개별 추가분(없으면 [])
  "durationDays": 365,                // SUBSCRIPTION 필수, PERPETUAL은 없음
  "graceDays": 30,                    // 미지정 시 기본 30 (체험용 키는 0으로 발급)
  "maxHosts": null,                   // 선택 필드 — 제품은 강제도 표시도 하지 않는다(M3)
  "iat": 1753...,
  "activationDeadline": 1754...       // 이 시각까지 등록해야 유효 — 기본 발급 +7일(M5)
}
```

> **`maxHosts`는 자리만 남긴다.** 지금은 어떤 판정에도 쓰이지 않고 화면에도 안 나온다. 나중에 상한 정책이 필요해질 때 **이미 발급된 키를 재발급하지 않아도 되도록** 스키마에만 존치하는 것이다.

**중요**: 절대 만료 시각(`exp`)을 키에 넣지 **않는다**. 만료일은 **등록 시점에 계산**되어 DB에 기록된다(P12).

---

## 4. 아키텍처 결정 (ADR)

### P1. 단일 배포본 + 런타임 언락 (포크·빌드 프로파일 분기 기각)

프리미엄 코드는 **모든 배포본에 포함**되고, 라이선스 키의 등급에 따라 런타임에 열린다.

**기각한 대안**:
- *에디션별 브랜치/포크*: 이 프로젝트는 NestJS+Spring 이중 유지로 이미 한 번 비용을 치렀고(2026-06-22 Spring 단일 채택), 에디션 포크는 그보다 나쁘다.
- *Gradle 빌드 프로파일로 두 아티팩트*: 릴리스 라인이 2배가 되고, "STANDARD 고객이 PREMIUM으로 업그레이드하면 아티팩트를 교체 설치해야" 한다 — 목표 §1.2-2와 정면 충돌.

**감수하는 것**: STANDARD 고객의 설치본에도 프리미엄 바이트코드가 들어간다. §1.3대로 계약이 방어하며, 실제 리스크가 되면 P2의 모듈 승격으로 대응한다.

### P2. 코드 경계는 Gradle 모듈이 아니라 패키지 + ArchUnit

**결정**: 프리미엄 코드는 `com.dmove.moveseye.premium.**` 패키지에 격리하고, "premium 밖의 코드는 premium을 참조할 수 없다"를 **ArchUnit 테스트로 강제**한다.

**모듈로 빼지 않는 이유(구조적 제약)**: 부팅 모듈이 root(app)다(collector-engine §D1 — `app/` 서브모듈 분리는 churn 회피로 기각됨). `premium` 모듈이 app의 공통 코드를 쓰려면 `premium → app` 의존이 필요하고, app이 premium 빈을 스캔하려면 `app → premium`이 필요해 **순환**이 된다. 풀려면 `core` 모듈을 먼저 뽑아야 하는데 이는 대량 이동 작업이고, 이미 기각된 판단이다.

ArchUnit은 모듈 분리의 실익을 churn 없이 준다. collector-engine이 gRPC 물리 분리에 쓴 패턴 — *유예하되 승격 비용은 선지불* — 과 동일하다.

**모듈 승격 조건**(하나라도 현실화 시 재논의):
1. 프리미엄 코드를 제외한 배포본을 실제로 요구받을 때
2. 디컴파일 유출이 실측 리스크가 될 때
3. 프리미엄이 별도 팀·별도 릴리스 주기로 갈 때

**선지불 규칙**: `premium.**`은 app의 **공개 서비스 인터페이스와 `engine-api`만** 참조한다. STANDARD→PREMIUM 방향 참조는 0을 유지한다(ArchUnit A1).

#### P2-1. 수집층은 중립이다 — 프리미엄 코드는 API층에만 산다 【v4 확정】

**문제**: GPU 구현의 출발점은 `MetricDomain`에 `GPU`를 추가하는 것인데, 그건 `engine-api`로 **`premium` 패키지 밖**이다. 카탈로그 등록도 `engine-zabbix` 어댑터다. 규칙을 정해두지 않으면 1단계에서 A1이 곧바로 깨지거나, 규칙을 무력화하게 된다.

**결정**: **수집층(`engine-api`·`engine-zabbix`)에는 프리미엄 개념을 넣지 않는다.**

| 계층 | 프리미엄 코드가 사는가 | 근거 |
|---|---|---|
| `engine-api` (`MetricDomain.GPU`, 포트 계약) | ❌ 중립 | "GPU를 수집할 수 있다"는 **Capability**다 |
| `engine-zabbix` (GPU 카탈로그·어댑터) | ❌ 중립 | 〃 — 데이터소스가 무엇을 주는가의 문제 |
| `premium.gpu` (컨트롤러·서비스·DTO) | ✅ | 사용자에게 **기능으로 닿는 지점**이 여기다 |

§3.1의 3축 분리(`Capability` ≠ `Feature`)를 계층에 그대로 옮긴 것이다. 수집이 가능한 것과 고객이 볼 권리가 있는 것은 다른 축이고, **후자만 게이팅 대상**이다.

**따름 규칙**: 프리미엄 메트릭이 수집층에 있다는 이유로 STANDARD 고객에게 노출되지는 않는다 — 노출 경로인 컨트롤러가 전부 `premium.**`에 있고 A2가 `@RequiresFeature`를 강제하기 때문이다. **"수집층에 GPU 키가 있다"는 사실 자체는 라이선스 구멍이 아니다.**

### P3. 3축 분리 + 합집합 판정

§3.1, §3.2 참조.

### P4. 게이팅은 2레이어

```
요청
 ├─ [레이어 1] AccessModeInterceptor      ← 전역. 접근 모드에 따라 3분기
 │     @LicenseExempt 있으면 통과 (로그인·라이선스 등록·/features·헬스체크)
 │     LOCKED     → 전부 차단                    code=403, reason=LICENSE_REQUIRED
 │     READ_ONLY  → 쓰기 요청만 차단 (P15 판정)   code=403, reason=LICENSE_READ_ONLY
 │     FULL       → 통과
 │
 └─ [레이어 2] FeatureInterceptor         ← @RequiresFeature 붙은 것만 검사
       미보유 → code=402, requiredFeature=…
```

**레이어 1은 반드시 화이트리스트여야 한다.** "차단할 것에 어노테이션"이면 새 엔드포인트가 무방비로 열리지만, "허용할 것에 어노테이션"이면 **기본이 차단**이라 안전하다. 라이선스 필수 제품에서 이 방향성은 타협 불가다.

**레이어 2는 블랙리스트(붙은 것만 검사)로 충분하다.** STANDARD 기능은 레이어 1만 통과하면 되고, `@RequiresFeature`는 PREMIUM 기능에만 붙는다.

**READ_ONLY에서 프리미엄이 완전 차단되는 것은 자동이다** — `allows(feature)`가 `state ∈ {ACTIVE, EXPIRING, GRACE}`를 요구하므로 `EXPIRED`면 레이어 2에서 false가 된다. 별도 코드가 필요 없다.

**공통 원칙**: 서비스·리포지토리 내부에 `if (licensed)`를 **절대 흩뿌리지 않는다.**

**누락 방지 테스트(필수)**: `premium.**`의 모든 `@RestController`가 `@RequiresFeature`를 보유하는지 검사하는 ArchUnit 규칙(A2). 실무 사고는 거의 전부 "새 컨트롤러 만들고 어노테이션 깜빡"에서 난다.

### P5. 오류 응답 = HTTP 200 + `ApiResult.error(code)`

> ⚠️ 초기 논의에서 "HTTP 402 Payment Required"를 제안했으나, 실측 결과 이 프로젝트는 **모든 비즈니스 에러를 HTTP 200 + `ApiResult`로 내보내고 401만 실제 상태 코드**로 쓴다. **200 + 바디 code로 정정**한다.

| 상황 | code | `data` | FE 반응 |
|---|---|---|---|
| 라이선스 없음/무효 (LOCKED) | **403** | `{"reason":"LICENSE_REQUIRED","state":"NONE"}` | 앱 전체 잠금 화면 |
| 읽기 전용 중 쓰기 시도 | **403** | `{"reason":"LICENSE_READ_ONLY","state":"EXPIRED"}` | 토스트 + 갱신 안내 |
| **실시간 조회 차단 (ARCHIVED)** | **403** | `{"reason":"LICENSE_LIVE_BLOCKED","state":"ARCHIVED"}` | 해당 위젯에 안내 문구 ★v4 |
| 기능 미보유 (레이어 2) | **402** | `{"requiredFeature":"GPU_MONITORING","requiredEdition":"PREMIUM"}` | 업셀 패널 |

네 케이스를 `reason`으로 나누는 이유: FE가 **전혀 다른 화면**으로 보내야 한다.

신규 예외 4종: `LicenseRequiredException`, `ReadOnlyModeException`, `LiveQueryBlockedException`, `FeatureNotLicensedException` + `GlobalExceptionHandler` 핸들러.

### P6. Flyway 마이그레이션은 라이선스와 무관하게 항상 전량 실행

**결정**: 프리미엄 기능의 테이블도 조건 없이 생성된다. 라이선스가 없으면 그냥 비어 있을 뿐이다.

**이유**: 조건부 마이그레이션은 고객사마다 스키마 상태를 갈라놓는다. PREMIUM으로 업그레이드하는 순간 "V20은 있는데 V23이 없는" 조합이 생기고, 업그레이드 경로가 조합 폭발한다.

**따름 규칙**: 프리미엄 기능의 마이그레이션도 기존 번호 체계(V20, V21…)에 그대로 섞는다.

### P7. 라이선스 키 = RS256 서명 JWT, 저장은 전용 `license` 테이블

**키 포맷**: auth0 `java-jwt`(이미 의존 중)로 **RS256 서명 JWT**. 신규 의존성 0.

- 공개키는 앱에 번들, 개인키는 **사내 발급 도구에만** 보관한다.
- JWT는 base64라 고객이 열어볼 수 있으나 문제 없다 — 목적은 은닉이 아니라 **위조 방지**다.
- **완전 오프라인 검증**(§1.3) — 폐쇄망 고객 전제.
- ⚠️ **공개키 롤오버 대비**: 검증을 **공개키 리스트 순회**로 짠다. 지금 하면 공짜, 개인키 유출 후엔 기존 고객 키가 전부 무효가 된다.

**저장 위치**: **전용 `license` 테이블**(V20).
- `setting.type`은 PG enum이라 값 추가 시 `ALTER TYPE ... ADD VALUE`가 필요한데, Flyway 트랜잭션과 충돌 소지가 있다.
- 등록 이력(누가·언제·어떤 키)이 감사 대상이고, 기간제 갱신 이력도 남아야 한다.
- **`activated_at`을 DB가 보관해야** 한다(P12·P13) — 키만으로는 등록 시점을 알 수 없다.

**판정 추상화**: `LicenseProvider` 인터페이스 → 1차 `SignedKeyLicenseProvider`, 추후 `SaasLicenseProvider`.

**캐시**: 인메모리(온프레미스 단일 인스턴스 전제, Redis 불필요). 키 등록·해지 시 무효화. 단 **만료 시각 비교는 캐시하지 않고 매번 수행**한다 — 캐시된 `ACTIVE`로 만료가 지나쳐지면 안 된다.

**재기동 불필요**: 등록 → 검증 → 저장 → 캐시 무효화 → **즉시 반영**.

### P8. 만료·유예 정책

§3.4 상태 머신이 정본. 추가 규칙:

- `EXPIRING`(만료 30일 이내)부터 FE 상단 배너. 고객이 만료를 모르고 읽기 전용에 빠지는 상황을 만들지 않는다.
- `graceDays`는 클레임으로 조정 가능(**기본 30**, M1). 체험 목적의 짧은 기간제 키는 **0으로 발급**한다(§3.3).
- `PERPETUAL`은 만료 판정 자체를 건너뛴다 — 시스템 시계가 틀려도 영구 고객은 영향받지 않는다.
- 읽기 전용 진입 후 **30일이 더 지나면 `ARCHIVED`**로 내려가 실시간 조회가 닫힌다(P17).

### P9. FE — 세 가지 차단을 구분한다

| 차단 | FE 처리 |
|---|---|
| `LOCKED` | 앱 전체를 **잠금 화면**으로. 라이선스 등록 폼과 안내만 |
| `READ_ONLY` | 앱은 정상 렌더. **상단 고정 배너** + 쓰기 시도 시 토스트. 주요 쓰기 CTA만 선별적 비활성화 |
| 기능 미보유 | 해당 페이지만 **업셀 패널**. 나머지 앱은 정상 |

추가 원칙:
1. **라우트를 조건부로 제거하지 않는다.** 공유받은 링크에서 404보다 "PREMIUM 기능입니다"가 낫다.
2. **메뉴도 숨기지 않는다.** 자물쇠 배지를 붙여 노출한다 — 고객은 존재를 알아야 구매한다(§7.1 M2).
3. **번들 lazy 분리는 성능 목적으로만.** FE 코드는 어차피 전부 브라우저로 내려간다 — **진짜 방어선은 BE 게이팅뿐이다.**
4. 무료 화면 안에 박히는 프리미엄 조각(예: 호스트 상세의 GPU 탭)은 **탭 레벨에서 게이트**한다.
5. ⚠️ **읽기 전용 UI를 완벽히 비활성화하려 들지 않는다.** 73개 쓰기 엔드포인트에 대응하는 모든 버튼·폼을 disable하는 것은 비용 대비 실익이 없다. **BE가 확실히 막고**, FE는 배너 + 공용 토스트 + 주요 CTA 비활성화까지만 한다.

### P10. 배치·스케줄러 게이팅 — 실측 6개 잡 기준

**실측**: 이 프로젝트는 `@Scheduled`를 쓰지 않는다. `SchedulerManager`가 `SchedulerJob` 빈을 등록하고 주기를 DB로 관리한다. **따라서 게이팅 지점이 `SchedulerManager` 한 곳이다.**

`SchedulerJob`에 "어느 접근 모드까지 실행되는가" 속성을 추가한다:

| 잡 | 성격 | `FULL` | `READ_ONLY` | `LOCKED` |
|---|---|:---:|:---:|:---:|
| `event_sync` | Zabbix 이벤트 수집 | ✅ | ❌ | ❌ |
| `report_weekly` | 주간 리포트 생성 | ✅ | ❌ | ❌ |
| `report_monthly` | 월간 리포트 생성 | ✅ | ❌ | ❌ |
| `user_sync` | 사용자 동기화 | ✅ | ❌ | ❌ |
| `event_cleanup` | 오래된 이벤트 정리 | ✅ | ✅ | ✅ |
| `report_cleanup` | 리포트 보존정책 정리 | ✅ | ✅ | ✅ |

- **정리(cleanup) 배치는 모든 모드에서 유지한다.** 만료됐다고 정리를 멈추면 디스크가 무한정 찬다 — 고객 서버를 망가뜨리는 쪽이 라이선스 위반보다 나쁘다.
- 미실행 시 **조용히 skip**(`debug` 레벨). 에러 로그로 남기면 운영자가 오인한다.
- 프리미엄 전용 배치가 생기면 `premium.**`에 두고 동일 규칙을 적용한다.

### P11. 잠금 모드(Lockdown) — 라이선스 필수의 부트스트랩 문제

라이선스가 필수가 되면 **"키를 등록하려면 앱에 들어가야 하는데, 앱에 들어가려면 키가 있어야 하는"** 순환이 생긴다.

**`LOCKED`에서 허용되는 것** — `@LicenseExempt` 화이트리스트:

| 허용 | 이유 |
|---|---|
| 로그인 / 로그아웃 / 토큰 갱신 | 관리자가 들어와야 키를 등록한다 |
| `GET /features` | FE가 접근 모드를 판단하는 근거 |
| `POST/DELETE /settings/license` | 키 등록·해지 (관리자 전용) |
| 헬스체크 / actuator | 운영 도구가 죽으면 안 된다 |
| 정적 리소스 / i18n | 잠금 화면 자체가 렌더링돼야 한다 |

**그 외 전부 차단.**

**신규 설치 부트스트랩**: 키가 없으면 첫 로그인 직후 잠금 화면 → 관리자가 키 등록 → 정상 진입. 시드 관리자 계정(V10)은 `LOCKED`에서도 로그인 가능해야 한다.

> ✅ **운영 리스크 해소(v4)**: v3까지 최대 리스크로 꼽았던 "기존 설치 고객이 업그레이드하는 순간 잠긴다"는 **현재 설치 고객이 없어 해당하지 않는다**(M6 결정). 선발급 절차·완충 코드 모두 불필요하다.
> 단, **첫 고객 설치 이후에는 이 리스크가 되살아난다** — 라이선스 도입 이전 버전을 설치한 고객이 생기면 안 되므로, **출시본에는 처음부터 라이선스가 포함되어야 한다.**

**개발·QA 환경**: 라이선스가 필수이므로 dev 환경도 키가 없으면 잠긴다. **우회 스위치(`license.enforce=false` 등)는 두지 않는다** — 프로파일 오설정 하나로 운영에서 라이선스가 통째로 무력화되는 경로가 생기기 때문이다. 대신 **발급 도구로 dev용 `PERPETUAL`/`PREMIUM` 키를 만들어 로컬 DB에 등록**한다. 커널이 매일 실검증되는 부수 효과도 있다.

### P12. 갱신 규칙 — 기간은 등록일부터 시작한다

**사용자 결정**: *"영구 라이선스 적용 시 무제한 사용, 기간제 사용 시 해당 기간까지만 사용, 라이선스 갱신 시 해당일부터 사용"*

**따라서 키에 절대 만료일(`exp`)을 넣지 않는다.** 키에는 `durationDays`만 담고, **등록 시점에 만료일을 계산**한다:

```
활성화 시:
    activated_at = now()
    expires_at   = activated_at + durationDays      (PERPETUAL이면 null)
```

**이유**: 절대 만료일을 키에 박으면 발급일부터 시계가 돌아, 고객이 늦게 등록할수록 손해다. 계약~설치 사이에 몇 주가 뜨는 온프레미스 특성상 실제 분쟁 소지가 된다.

**갱신 시 동작**: 새 키를 등록하면 기존 활성 키는 해지되고 **새 기간이 등록일부터 시작**한다. 잔여 기간은 **이월하지 않는다**.

> ⚠️ 부작용: 만료 전 조기 갱신 시 고객이 잔여 기간만큼 손해를 본다. 영업에서 **만료 임박(EXPIRING) 또는 만료 후 등록**을 안내해야 한다. 이월이 필요하면 `expires_at = max(now, 기존 expires_at) + durationDays` 한 줄 변경. §7.1 M7.

**업그레이드(STANDARD→PREMIUM)**: 새 PREMIUM 키 등록으로 처리. 동일하게 등록일부터 새 기간 시작.

**활성 키는 항상 1개**(DB 부분 유니크 인덱스가 보장). "영구 STANDARD + 기간제 PREMIUM 동시 보유" 같은 혼합은 **지원하지 않는다**(§7.2 승격 조건).

### P13. 키 재사용 방지 — `jti` 기준으로 최초 활성화 시각을 고정한다

P12처럼 "등록일부터 기간 시작"으로 하면 **어뷰징 경로**가 생긴다: 만료가 임박하면 키를 삭제하고 같은 키를 다시 등록해 기간을 리셋하는 것.

**방어**: 키의 `jti`를 기준으로 **최초 활성화 시각을 DB에 영구 기록**하고, 같은 `jti`가 재등록되면 **원래의 `activated_at`을 재사용**한다.

```
등록 요청 →  서명 검증
          →  license 테이블에서 jti 조회
             ├─ 있음  : activated_at = 기존 행의 값 (기간 리셋 불가)
             └─ 없음  : activated_at = now()
          →  expires_at = activated_at + durationDays
```

- `license` 테이블은 해지된 행도 **삭제하지 않는다**(이력 보존이 곧 방어).
- 이 방어는 DB를 직접 조작하면 뚫린다. §1.3대로 그 이상은 계약의 몫이다.
- `activationDeadline` 클레임으로 "발급 후 N일 내 미등록 시 무효"도 함께 강제한다.

### P14. 접근 모드 3단계 — 만료는 잠금이 아니라 읽기 전용이다 【v3 신설】

**사용자 결정**: 만료 시 앱을 잠그지 않고 **읽기 전용**으로 전환한다.

**왜 이게 맞는가**: 모니터링 제품에서 만료로 완전 잠금은 **고객사 인프라 가시성을 빼앗는다.** 갱신 협상이 길어지는 동안 장애가 나면 책임 소재 분쟁이 되고, 무엇보다 고객이 이미 쌓은 데이터에 접근하지 못하게 막는 것은 정당화하기 어렵다.

```java
public enum AccessMode { FULL, READ_ONLY, LOCKED }
```

| `LicenseState` | `AccessMode` | `allowsLiveQuery()` | 동작 |
|---|---|:---:|---|
| `ACTIVE` / `EXPIRING` / `GRACE` | `FULL` | ✅ | 전부 허용 |
| `EXPIRED` | **`READ_ONLY`** | ✅ | 조회·내보내기만. **실시간 조회 유지**(만료 후 30일) |
| `ARCHIVED` | **`READ_ONLY`** | ❌ | 조회·내보내기만. **DB에 쌓인 것만**. 영구 유지 |
| `NONE` / `INVALID` | `LOCKED` | ❌ | 화이트리스트 외 전부 차단 |

**`NONE`/`INVALID`가 여전히 잠금인 이유**: 신규 설치는 보여줄 데이터가 없고, 위조 키에 읽기 권한을 줄 이유도 없다. 읽기 전용은 **정당하게 구매했다가 만료된 고객**에 대한 배려이지, 라이선스가 없는 설치본에 대한 것이 아니다.

**READ_ONLY에서 일어나는 일**:
- 화면 조회: ✅ (STANDARD 범위)
- 프리미엄 기능: ❌ 완전 차단 + 업셀 (레이어 2에서 자동 — P4)
- 설정 변경·CRUD·Zabbix 관리: ❌
- **알람 확인(ack)**: ❌ 차단 — Zabbix에 쓰는 동작이므로 쓰기다(M9)
- 수집 배치: ❌ 중단 (P10)
- 정리 배치: ✅ 유지 (P10)
- 데이터 내보내기: ✅ 예외 허용 (P16)
- **실시간 조회**: `EXPIRED` ✅ / `ARCHIVED` ❌ (P17)

### P15. 읽기/쓰기 판정 — HTTP 메서드 기본 + 어노테이션 오버라이드 【v3 신설】

**실측 근거**: GET 106 / 쓰기 계열 73. POST 중 조회성 엔드포인트는 거의 없다(`/asset/sync`·`/user/sync`는 실제 쓰기). **HTTP 메서드 규칙이 이 코드베이스에 잘 맞는다.**

```
쓰기 판정:
  기본 = HTTP 메서드가 GET/HEAD/OPTIONS가 아니면 쓰기
  오버라이드:
    @ReadOnlyAllowed   — 비-GET이지만 읽기로 취급 (조회성 POST, 내보내기)
    @MutatingRequest   — GET이지만 쓰기로 취급 (부작용 있는 GET)
```

**전 컨트롤러에 어노테이션을 다는 대공사가 아니다.** 인터셉터 하나 + 예외 몇 개로 끝난다. 이것이 "읽기 전용"을 저렴하게 만드는 핵심이다.

**예외 지정 시 규칙**: `@ReadOnlyAllowed`를 붙일 때는 **DB에 쓰지 않음을 확인**해야 한다. 편의로 붙이면 읽기 전용이 무의미해진다 → ArchUnit A6이 개수를 제한하지는 못하므로, **코드 리뷰 체크 항목**으로 둔다.

### P16. 데이터 내보내기는 읽기 전용에서도 허용한다 【v3 신설】

**사용자 결정**: 읽기 전용 영구 유지 + **데이터 내보내기 허용**.

- 리포트 다운로드·CSV 내보내기 등 **조회 결과를 파일로 반출**하는 동작은 `@ReadOnlyAllowed`로 허용한다.
- 단 **"리포트 생성"(DB에 스냅샷을 쓰는 것)은 쓰기**다 → 차단. 이미 생성된 리포트의 **다운로드만** 허용한다. 이 구분을 구현 시 명확히 해야 한다.
- 취지: 고객이 계약 종료 후 자기 데이터를 회수할 수 있어야 한다. 이탈 시 마찰을 줄이는 것이 장기적으로 유리하다.

### P17. 실시간 조회는 단계적으로 닫는다 — `EXPIRED` → `ARCHIVED` 【v4 신설】

**실측이 만든 결정이다.** 엔진 포트를 참조하는 클래스가 20개이고 그 분포가 `host/{cpu,memory,disk,network,responsetime,hostinterface,livecheck}`·`home`·`event`·`report`·`asset`이다. 즉 **이 제품에서 "모니터링"이라 부르는 화면은 거의 전부 Zabbix 실시간 조회**다.

여기서 v3의 미결(M8)이 양쪽 다 곤란해진다:

| 선택 | 결과 |
|---|---|
| 실시간 **유지**(v3 기본안) | 만료 고객이 CPU·메모리·디스크·알람 현황을 **전부 계속 본다**. 멈추는 건 이벤트 이력 축적과 리포트 생성뿐 → **갱신할 이유가 프리미엄밖에 안 남는다** |
| 실시간 **차단** | 호스트 상세·홈·리소스 추이가 **전부 빈 화면**. 남는 건 자산·비용·과거 리포트·맵 → "데이터 조회 보장"이라는 배려가 사실상 무의미 |

**결정(M8)**: 두 구간으로 나눈다.

```
graceEnd ─── +30일 ──────────────────────────► 영구
   │  EXPIRED (읽기 전용 + 실시간 유지)  │  ARCHIVED (읽기 전용, DB 조회만)
```

- **`EXPIRED` 30일**: 갱신 협상과 대체 수단 구축에 필요한 시간을 준다. 고객 인프라 가시성을 갑자기 빼앗지 않는다.
- **`ARCHIVED` 이후**: 실시간이 닫힌다. 자기 데이터 조회·내보내기는 **영구 보장**(P16 불변).

**구현 — 서비스에 `if`를 뿌리지 않는다.** 포트를 쓰는 20개 클래스를 건드리는 것은 P4 공통 원칙 위반이다. 대신 **엔진 포트를 감싸는 데코레이터 한 겹**을 둔다:

```
LicenseGuardedMetricPort implements MetricPort     ← @Primary, license 패키지
    if (!status.allowsLiveQuery()) throw new LiveQueryBlockedException();
    return delegate.…                              ← 실제 구현(engine-zabbix)
```

- `MetricPort`·`InventoryPort`·`AlertPort` 세 개에 각각 적용한다.
- 데코레이터는 **app 쪽(`license/`)에 둔다.** `engine-api`는 라이선스를 몰라야 한다(P2-1 수집층 중립).
- 소비 클래스 20개는 **무수정**이다. 주입받는 타입이 그대로다.

**FE 처리**: 차단 구간에서 위젯이 그냥 비면 고장으로 오인된다. 전용 코드(`code=403, reason=LICENSE_LIVE_BLOCKED`)를 내려 **"라이선스 만료로 실시간 조회가 중단되었습니다"** 안내를 표시한다.

> **왜 `AccessMode`에 단계를 더 넣지 않았나**: `ARCHIVED`도 쓰기 판정은 `READ_ONLY`와 완전히 같다. 모드를 4단으로 늘리면 인터셉터의 분기가 늘고 `READ_ONLY` 판정이 두 곳으로 흩어진다. **모드는 3단 그대로 두고 `allowsLiveQuery()` 축 하나만 추가**하는 편이 분기가 적다.

### P18. 인터셉터 순서 — 라이선스는 인증·권한 **뒤**에 선다 【v4 신설】

```
RolesInterceptor → VisitorIdCheckInterceptor → AccessModeInterceptor → FeatureInterceptor
   (기존)                (기존)                    레이어 1              레이어 2
```

**라이선스를 앞에 두면 안 되는 이유**: 이 제품에서 **실제 HTTP 상태 코드로 나가는 건 401뿐**이고, FE는 401을 트리거로 **single-flight refresh**를 돌린다(2026-07-16 인증 강화). 라이선스가 먼저 서면 토큰이 만료된 요청이 401 대신 `LICENSE_REQUIRED`(200+바디 403)를 받아 **세션 만료가 잠금 화면으로 오인**된다. 인증이 먼저 서야 "로그인하세요"와 "라이선스를 등록하세요"가 섞이지 않는다.

**부작용 없음**: 잠금 상태에서도 로그인 경로는 `@LicenseExempt`이므로 관리자는 들어와 키를 등록할 수 있다(P11).

---

## 5. 구현 상세

### 5.1 BE 패키지 구조

```
com.dmove.moveseye/
├─ license/                              ← 라이선스 커널 (STANDARD·PREMIUM 공통)
│  ├─ Edition.java                       enum { STANDARD, PREMIUM } + defaultFeatures()
│  ├─ Feature.java                       enum { GPU_MONITORING, DB_MONITORING, APM }
│  ├─ LicenseType.java                   enum { SUBSCRIPTION, PERPETUAL }          ★v4 TRIAL 삭제
│  ├─ LicenseState.java                  enum { NONE, ACTIVE, EXPIRING, GRACE,
│  │                                            EXPIRED, ARCHIVED, INVALID }       ★v4 ARCHIVED
│  ├─ AccessMode.java                    enum { FULL, READ_ONLY, LOCKED }          ★v3
│  ├─ LicenseStatus.java                 record(state, mode, type, edition, features,
│  │                                            expiresAt, daysRemaining, customer)
│  │                                            + allows(Feature) / canWrite()
│  │                                            + allowsLiveQuery()                ★v4
│  ├─ LicenseProvider.java               인터페이스 (판정 축 추상화)
│  ├─ SignedKeyLicenseProvider.java      1차 구현 (RS256 검증 + 캐시)
│  ├─ LicenseKeyVerifier.java            공개키 리스트 순회 검증 (롤오버 대비)
│  ├─ LicenseExempt.java                 @interface — 레이어 1 화이트리스트
│  ├─ ReadOnlyAllowed.java               @interface — 쓰기 판정 오버라이드   ★v3
│  ├─ MutatingRequest.java               @interface — 〃 (반대 방향)          ★v3
│  ├─ RequiresFeature.java               @interface — 레이어 2
│  ├─ AccessModeInterceptor.java         레이어 1 (3분기)                     ★v3
│  ├─ FeatureInterceptor.java            레이어 2
│  ├─ LicenseRequiredException.java      → 200 + code=403 (LICENSE_REQUIRED)
│  ├─ ReadOnlyModeException.java         → 200 + code=403 (LICENSE_READ_ONLY)  ★v3
│  ├─ FeatureNotLicensedException.java   → 200 + code=402
│  ├─ LiveQueryBlockedException.java      → 200 + code=403 (LICENSE_LIVE_BLOCKED)   ★v4
│  ├─ guard/LicenseGuardedMetricPort.java    @Primary 데코레이터 (P17)              ★v4
│  ├─ guard/LicenseGuardedInventoryPort.java 〃                                     ★v4
│  ├─ guard/LicenseGuardedAlertPort.java     〃                                     ★v4
│  ├─ domain/License.java                @Entity
│  ├─ domain/LicenseRepository.java
│  ├─ LicenseController.java             GET /features, POST/DELETE /settings/license
│  └─ LicenseService.java                등록·해지·활성화 시각 계산(P12·P13)
└─ premium/                              ← PREMIUM 전용 (ArchUnit 격리 대상)
   ├─ gpu/       {GpuController, GpuService, dto/}    ※ MetricDomain.GPU·카탈로그는 여기 아님(P2-1)
   ├─ db/        {DbMonitoringController, ...}
   └─ apm/       (3단계)
```

**발급 도구**(별도 산출물, 제품 배포본에 포함하지 않는다):

```
tools/license-issuer/                    ← Gradle 서브프로젝트 (§5.10)
├─ LicenseIssuer.java                    대화형 + 인자형 겸용 CLI
├─ issue.bat                             Windows 더블클릭 진입점
└─ (개인키·발급대장은 커밋하지 않는다)
```

> `license/`는 `premium/`이 **아니다** — STANDARD 배포본도 라이선스를 판정해야 하므로 공통 커널이다.

### 5.2 `Edition` / `Feature`

```java
public enum Edition {
    STANDARD(Set.of()),
    PREMIUM(Set.of(Feature.GPU_MONITORING, Feature.DB_MONITORING, Feature.APM));

    private final Set<Feature> defaults;
    public Set<Feature> defaultFeatures() { return defaults; }
}
```

티어 구성 변경은 **이 매핑만 고치면** 전 고객에 자동 반영된다(P3).

### 5.3 인터셉터 동작

`RolesInterceptor` 패턴을 따른다. `config/WebConfig`에 **`Roles → VisitorId → AccessMode → Feature`** 순으로 등록한다 — 레이어 1이 레이어 2보다 먼저이고, 둘 다 **인증·권한 뒤**다(P18).

```
AccessModeInterceptor.preHandle:
  HandlerMethod 아니면 통과
  @LicenseExempt (메서드 → 클래스) 있으면 통과
  status = LicenseProvider.current()
  switch (status.mode()):
    LOCKED    → throw LicenseRequiredException(status.state())
    READ_ONLY → if (isMutating(handlerMethod, request)) throw ReadOnlyModeException()
                else 통과
    FULL      → 통과

isMutating(handler, request):
  @ReadOnlyAllowed 있으면 → false
  @MutatingRequest 있으면 → true
  else → !(GET | HEAD | OPTIONS)

FeatureInterceptor.preHandle:
  HandlerMethod 아니면 통과
  @RequiresFeature (메서드 → 클래스) 없으면 통과       ← STANDARD 기능
  status.allows(feature) 이면 통과
  아니면 throw FeatureNotLicensedException(feature)
```

`allows(f)` = `state ∈ {ACTIVE, EXPIRING, GRACE}` **그리고** `(edition.defaultFeatures() ∪ features).contains(f)`
→ `EXPIRED`·`ARCHIVED`(둘 다 READ_ONLY)에서 프리미엄이 자동 차단되는 근거. 별도 코드가 필요 없다.

`allowsLiveQuery()` = `state ∉ {ARCHIVED, NONE, INVALID}`
→ 엔진 포트 데코레이터가 이 값만 본다(P17). `EXPIRED`는 `true`다.

### 5.4 API 계약

**`GET /features`** — `@LicenseExempt`. FE가 부팅 시 1회 호출.

```jsonc
{ "status": "success", "data": {
    "state": "ACTIVE",              // NONE|ACTIVE|EXPIRING|GRACE|EXPIRED|ARCHIVED|INVALID
    "mode": "FULL",                 // FULL | READ_ONLY | LOCKED
    "allowsLiveQuery": true,        // ★v4 — false면 실시간 위젯에 안내 표시
    "licenseType": "SUBSCRIPTION",
    "edition": "PREMIUM",
    "customer": "○○기업",
    "features": ["GPU_MONITORING", "DB_MONITORING", "APM"],    // 합집합 결과(FE는 이것만 보면 됨)
    "expiresAt": "2027-07-29T00:00:00.000Z",                   // PERPETUAL이면 null
    "daysRemaining": 365                                        // PERPETUAL이면 null
}}
```

> `maxHosts`는 **응답에 넣지 않는다**(M3 — 강제도 표시도 안 함). 키 클레임에만 자리를 남긴다.

**`POST /settings/license`** — `@LicenseExempt` + 관리자 전용(`AdminAccessChecker` 재사용). **키 문자열 또는 `.lic` 파일 업로드**를 모두 받는다(§5.10). BE는 어느 쪽이든 같은 문자열로 처리하고, 파일 경로는 앞뒤 공백·개행을 제거한다.

검증 실패 사유를 **명확히 구분해** 반환한다 — 고객 지원 비용을 좌우한다:

| 사유 | 메시지 |
|---|---|
| 서명 불일치 | "유효하지 않은 라이선스 키입니다" |
| `activationDeadline` 경과 | "등록 기한이 지난 키입니다. 재발급이 필요합니다" |
| 재등록 계산 결과 이미 만료(P13) | "이미 만료된 라이선스입니다" |
| 포맷 오류 | "라이선스 키 형식이 올바르지 않습니다" |

성공 시 기존 활성 행을 `active=false, revoked_at=now()`로 내리고 새 행을 추가한다(이력 보존).

**`DELETE /settings/license`** — `@LicenseExempt` + 관리자 전용. 활성 키 해지 → 즉시 `LOCKED`.

> ⚠️ 해지는 `READ_ONLY`가 아니라 `LOCKED`다. 자발적 해지와 만료는 다르게 취급한다(P14).

### 5.5 Flyway V20

```sql
-- V20__license.sql          ※ v3 작성 시점엔 V16이었다. 재실측(08-06) 결과 V19가 최신이라 V20.
CREATE TABLE IF NOT EXISTS license (
    id            bigserial PRIMARY KEY,
    jti           varchar(100) NOT NULL,            -- 키 고유 ID (P13 재사용 방지 축)
    license_key   text         NOT NULL,            -- 원문 JWT (재검증·감사용 보존)
    customer      varchar(200),
    license_type  varchar(20)  NOT NULL,            -- SUBSCRIPTION | PERPETUAL
    edition       varchar(20)  NOT NULL,            -- STANDARD | PREMIUM
    features      jsonb        NOT NULL DEFAULT '[]'::jsonb,  -- 개별 추가분 스냅샷(표시·감사용)
    duration_days integer,                          -- PERPETUAL이면 null
    grace_days    integer      NOT NULL DEFAULT 30, -- M1
    max_hosts     integer,                          -- 미사용(M3) — 클레임 스냅샷 보존용
    activated_at  timestamp    NOT NULL,            -- ★ 최초 활성화 시각 (jti 단위 고정 — P13)
    expires_at    timestamp,                        -- ★ activated_at + duration_days (PERPETUAL이면 null)
    active        boolean      NOT NULL DEFAULT true,
    registered_by varchar(100),
    registered_at timestamp    NOT NULL DEFAULT now(),
    revoked_at    timestamp
);

-- 활성 키는 항상 최대 1개 (P12)
CREATE UNIQUE INDEX IF NOT EXISTS ux_license_active ON license (active) WHERE active;
-- jti별 최초 활성화 시각 조회 (P13)
CREATE INDEX IF NOT EXISTS ix_license_jti ON license (jti);
```

- **`features` 컬럼은 스냅샷이다.** 판정은 항상 `license_key`를 재검증해 얻는다 — 컬럼 직접 UPDATE로 기능을 여는 우회를 막기 위함.
- 반면 **`activated_at`/`expires_at`은 DB가 정본**이다(키에 없는 값이므로). DB 조작에 노출되나 §1.3의 수용 범위다.

### 5.6 스케줄러 게이팅

`SchedulerJob`에 최소 접근 모드를 선언한다:

⚠️ 현재 시그니처는 v3 작성 시점과 다르다(재실측 08-06) — `jobKey()` / `String run(SchedulerSetting)`이다. 여기에 기본 메서드 하나만 얹는다:

```java
public interface SchedulerJob {
    String jobKey();
    String run(SchedulerSetting setting);
    /** 이 잡이 실행되는 최소 접근 모드. 기본 FULL. */
    default AccessMode minMode() { return AccessMode.FULL; }
}
```

`BuiltInJobs`에서 정리 잡 2개만 `LOCKED`(=모든 모드에서 실행)로 선언한다 — 어댑터 헬퍼(`job`·`summarizingJob`)에 모드 인자를 추가하는 형태다:

```java
job("event_cleanup",            eventSyncService::cleanupOldEvents, AccessMode.LOCKED)
summarizingJob("report_cleanup", reportSchedule::cleanupReports,    AccessMode.LOCKED)
```

🔴 **`BuiltInJobs`의 예외 삼킴 금지 원칙(ZM-100)을 깨지 않는다.** skip은 실행 전 판정이므로 실행 이력에 실패로 남으면 안 되고, 반대로 실행된 잡의 예외는 지금처럼 `SchedulerManager`까지 올라가야 한다(false-green 방지).

`SchedulerManager`가 실행 직전에 현재 모드와 비교해 skip한다(P10 표 참조).

### 5.7 ArchUnit 규칙

`build.gradle.kts`에 `testImplementation("com.tngtech.archunit:archunit-junit5:…")` 추가 후:

| # | 규칙 | 위반 시 의미 |
|---|---|---|
| **A1** | `premium..` 밖의 클래스는 `premium..`에 의존할 수 없다 (수집층 `engine-api`·`engine-zabbix` 포함 — P2-1) | STANDARD 코드가 프리미엄에 얽힘 → 모듈 승격 불가 |
| **A2** | `premium..`의 모든 `@RestController`는 `@RequiresFeature`를 보유해야 한다 | **게이팅 누락 = 무상 제공** |
| **A3** | `premium..`은 app 리포지토리·엔티티 내부를 직접 참조하지 않는다 | P2 선지불 규칙 위반 |
| **A4** | `@RequiresFeature`는 `premium..` 밖에서 사용될 수 없다 | 게이팅이 흩어짐(P4 위반) |
| **A5** | `@LicenseExempt`는 `license..`·`auth..`·헬스체크 밖에서 사용될 수 없다 | **잠금 모드에 구멍**(P11 위반) |

A2와 A5가 두 핵심 안전망이다. `@ReadOnlyAllowed`는 정당한 사용처가 분산되어 ArchUnit으로 제한하기 어려우므로 **코드 리뷰 체크 항목**으로 둔다(P15).

> **구현 결과(2026-08-10)** — 규칙 6개(A5를 메서드/클래스 둘로 쪼갬), `archunit-junit5:1.3.0`.
> **판정 17 실증**: A2·A5 위반 코드를 만들면 정확히 그 두 규칙이 빌드를 실패시킨다.
>
> 🔴 **A5는 원안(`license..`·`auth..`만)대로 갈 수 없었다.** 실제로 붙여 보니 FE 부팅 경로 둘
> (`GET /users/my-profile`·`/users/role/permission`)이 `user` 패키지에 있었고, 이 둘이 막히면
> 사용자 정체성을 못 받아 **잠금 화면조차 그리지 못한다**. 패키지로 열면 `user` 전체가 열리므로
> **메서드 이름 허용 목록**으로 좁혔다. 목록을 늘리려면 테스트를 고쳐야 하고 그러면 리뷰에 걸린다 —
> "면제는 의도적 결정이어야 한다"는 A5의 목적은 유지된다.
> 클래스 단위 면제(`A5-b`)는 컨트롤러 전체를 여는 것이라 예외 없이 두 패키지로 제한했다.
>
> A1·A3·A4는 `premium..`이 없어 지금은 공허하게 참이다(1단계부터 실질 동작).

### 5.8 FE 구조

```
src/
├─ context/LicenseContext.tsx      GET /features 1회 → 전역 보관
├─ hooks/useLicense.ts             { has(feature), state, mode, edition, daysRemaining,
│                                     isLocked, isReadOnly, canWrite }
├─ pages/license/
│   └─ LockdownPage.tsx            ← LOCKED: 앱 전체 잠금 + 키 등록 폼
├─ components/premium/
│   ├─ FeatureGate.tsx             <FeatureGate feature="GPU_MONITORING">…</FeatureGate>
│   ├─ UpsellPanel.tsx             ← 기능 미보유: 소개 + 업그레이드 안내
│   ├─ LicenseBanner.tsx           EXPIRING/GRACE 경고 + READ_ONLY 상시 배너
│   ├─ ReadOnlyGuard.tsx           canWrite=false일 때 주요 CTA 비활성화용 래퍼
│   └─ LiveBlockedNotice.tsx       ARCHIVED에서 실시간 위젯 자리에 표시     ★v4
├─ pages/setting/LicenseSection.tsx  라이선스 관리(상태·만료일·기능 목록·등록/해지)
│                                    등록 UI = .lic 파일 업로드 + 키 붙여넣기 둘 다  ★v4
└─ pages/
    ├─ gpu-monitoring/GpuMonitoring.tsx           ← 기존 "준비 중" 스텁을 게이트로 교체
    ├─ database-monitoring/DatabaseMonitoring.tsx ←  〃
    └─ application-monitoring/ApplicationMonitoring.tsx ← 〃 (3단계까지는 "준비 중" 유지)
```

- `isLocked`면 **라우터보다 상위에서** `LockdownPage`로 대체한다(개별 라우트 가드는 구멍이 생긴다).
- axios 인터셉터에서 **바디 `code`+`reason`을 감지**한다: `403/LICENSE_REQUIRED` → 잠금 화면, `403/LICENSE_READ_ONLY` → 토스트, **`403/LICENSE_LIVE_BLOCKED` → 전역 토스트 금지·해당 위젯만 안내**(화면 하나에 실시간 위젯이 여럿이라 토스트가 쏟아진다), `402` → 업셀. (HTTP 상태가 아니라 **바디 코드**임에 주의 — P5)
- 미보유 기능의 **메뉴는 숨기지 않고 자물쇠 배지**를 붙인다(M2 확정).
- **읽기 전용 UI 비활성화는 선별적으로.** 전수 disable은 비용 대비 실익이 없다(P9-5).
- ⚠️ `useDmoveQuery`는 응답을 2겹 언랩하므로 소비자는 payload를 직접 받는다.
- ⚠️ 페이지 데이터-결정 상태는 로컬 `useState` 금지, URL query state 사용(App.tsx가 navigate마다 리마운트).

### 5.9 1~2단계 기능 메모

**GPU(1단계)** — 가장 싸다. `MetricRef(domain, name, dims)`가 이미 다중 인스턴스를 처리하므로:
- `MetricDomain`에 `GPU` 추가 (enum 1줄)
- Zabbix 어댑터 카탈로그에 GPU 키 등록, 차원은 `{gpu:"0"}` — DISK의 `{mount}`, NETWORK의 `{iface}`와 동일 패턴
- `listDimensions`로 GPU 목록 디스커버리
- **모델 변경 0** — 0단계 라이선스 커널의 첫 실검증 대상으로 적합

**DB(2단계)** — Zabbix agent2 공식 템플릿(MySQL/PostgreSQL/Oracle/MSSQL)은 DSN별로 **별도 호스트로 등록**되는 것이 일반적이다. 그러면 DB 인스턴스가 `EntityRef`로 자연스럽게 표현되고, "서버인지 DB 인스턴스인지" 구분은 **`device_classification`(V13, `database` code 이미 seed됨)을 재사용**한다.

### 5.10 발급 도구 (사내 · Windows) 【v4 구체화】

**형태**: 대화형 `.bat` + Java CLI. 더블클릭하면 콘솔이 뜨고 순서대로 물은 뒤 `.lic` 파일을 떨군다. 같은 실행 파일이 **인자형 호출**도 받아 자동화에 쓸 수 있다.

```
> issue.bat
고객사명            : ○○기업
에디션 (1:STANDARD 2:PREMIUM) : 2
타입   (1:기간제 2:영구)      : 1
기간(일)                      : 365
유예(일) [기본 30, 체험은 0]  : 30
추가 기능 (없으면 Enter)      :
등록 기한(일) [기본 7]        : 7
────────────────────────────────────────
✔  ○○기업_PREMIUM_20260806.lic  생성
   jti = 3f7a…  /  등록 기한 2026-08-13
```

**왜 Java인가**: 검증 로직(`LicenseKeyVerifier`)과 **같은 코드로 서명**해야 "발급은 됐는데 제품이 거부하는" 사고가 안 난다. 클레임 이름 하나만 어긋나도 현장에서야 드러난다. `tools/license-issuer`를 Gradle 서브프로젝트로 두고 `license/` 패키지의 클레임 상수를 공유한다.

| 항목 | 내용 |
|---|---|
| 입력 | 고객사명, `edition`, `licenseType`, `durationDays`, `graceDays`(기본 30·체험 0), 추가 `features`, `activationDeadline`(기본 +7일) |
| 출력 | `.lic` 파일 — 내용은 RS256 서명 JWT 한 줄 |
| `jti` | UUID 자동 생성 |
| 발급 대장 | 로컬 CSV에 append(`jti`·고객사·에디션·타입·기간·발급일·등록기한). **없으면 갱신 문의·분쟁 대응이 불가능하다** |
| 개인키 | 로컬 파일 보관. **저장소에 커밋 금지.** 공개키만 제품에 번들 |

> **왜 파일인가**: JWT가 길어 메일·메신저로 복붙하면 개행이 섞여 깨진다. 파일로 주고받는 편이 사고가 적다. 다만 폐쇄망 반입이 파일보다 텍스트가 쉬운 현장도 있어 **제품은 붙여넣기도 함께 받는다**(§5.4).

**dev 키**: 같은 도구로 `PERPETUAL`/`PREMIUM` 키를 만들어 로컬 DB에 등록한다. 우회 스위치를 두지 않는 이유는 P11 참조.

---

## 6. 로드맵

| 단계 | 산출물 | 규모 | 비고 |
|---|---|---|---|
| **0** | 라이선스 커널: `license/` 패키지 전체, **V20**, 3단 접근 모드 인터셉터, **엔진 포트 데코레이터 3종(P17)**, 스케줄러 게이팅, `GET /features`, 등록·해지 EP, ArchUnit A1~A5, FE `LicenseContext`·`useLicense`·`LockdownPage`·`FeatureGate`·`UpsellPanel`·`LicenseBanner`·`ReadOnlyGuard`·`LiveBlockedNotice`·설정 화면, **발급 도구(대화형 .bat + Java CLI)** | **중~대** | **기능 0개 상태에서 먼저** |
| **1** | GPU: `MetricDomain.GPU`, Zabbix 카탈로그, `premium/gpu/`, GPU 화면 | 소~중 | 0단계 실검증 대상. 모델 변경 0 |
| **2** | DB: `premium/db/`, `device_classification` 활용, DB 인스턴스 목록·상세 화면 | 중 | Zabbix 공식 템플릿 활용 |
| **3** | APM | 대 | **별도 설계서 필수** — §7.4 |

**0단계 완료 판정 기준**:
1. 키 없음(`LOCKED`) → 로그인은 되고, 그 외 API는 `code=403 reason=LICENSE_REQUIRED`, FE는 잠금 화면
2. STANDARD 키 등록 → **재기동 없이** 즉시 일반 기능 정상, 프리미엄 EP는 `code=402`
3. PREMIUM 키 등록 → 프리미엄 EP 정상
4. 기간제 키를 **발급 5일 후 등록** → `expires_at`이 **등록일 + durationDays** — P12 검증
5. **발급 8일 뒤 등록 시도 → 거부**("등록 기한이 지난 키입니다") — M5(7일) 검증
6. 같은 키를 해지 후 재등록 → `activated_at`이 **최초값 유지**, 기간 리셋 안 됨 — P13 검증
7. PERPETUAL 키 → `expiresAt=null`, 만료 경로 미진입
8. **만료(EXPIRED) → GET은 200 정상, POST/PUT/PATCH/DELETE는 `code=403 reason=LICENSE_READ_ONLY`** — P14·P15 검증
9. **`EXPIRED` 구간(만료+유예 후 30일 이내) → Zabbix 실시간 GET이 정상 응답** — P17 검증
10. **`ARCHIVED` 구간 → 실시간 GET은 `code=403 reason=LICENSE_LIVE_BLOCKED`, DB 조회 GET(자산·비용·과거 리포트)은 200** — P17 검증
11. **만료 상태에서 알람 ack(`PUT /event/{id}/acknowledge`) → 차단** — M9 검증
12. **만료 상태에서 프리미엄 EP → `code=402`(읽기도 차단)** — P4 자동 차단 검증
13. **만료 상태에서 `event_sync`·`report_*`·`user_sync` 배치 skip, `*_cleanup` 배치는 정상 실행** — P10 검증
14. **만료 상태에서 리포트 다운로드 성공, 리포트 생성은 차단** — P16 검증
15. 해지(DELETE) → `READ_ONLY`가 아니라 `LOCKED`
16. **만료된 액세스 토큰으로 아무 API 호출 → 라이선스 오류가 아니라 401** — P18 인터셉터 순서 검증
17. ArchUnit A2/A5 위반 코드를 일부러 만들면 **빌드 실패**
18. **발급 도구로 만든 `.lic` 파일 업로드 등록 성공 + 같은 키 문자열 붙여넣기 등록 성공** — §5.10 검증
19. FE: 잠금 화면 / 읽기 전용 배너+토스트 / 실시간 차단 안내 / 업셀 화면 각각 확인

---

## 7. 미결 사항 / 리스크

### 7.1 결정 완료 (2026-08-06 — 전건 확정)

| # | 항목 | **확정** | v3 기본안 대비 |
|---|---|---|---|
| M1 | 유예 기간 일수 | **30일** | 변경 (14→30) |
| M2 | 미보유 시 메뉴 노출 | **노출 + 자물쇠 배지** | 동일 |
| M3 | `maxHosts` 강제 여부 | **강제·표시 모두 없음.** 클레임에 선택 필드로만 존치 | 강화 (표시도 안 함) |
| M4 | TRIAL 타입 | **두지 않음.** 체험은 기간제 + `graceDays=0` 발급 | 변경 (타입 삭제) |
| M5 | `activationDeadline` 기본값 | **발급 후 7일** — 미등록 시 재발급 요청 | 변경 (90→7) |
| M6 | 기존 설치 고객 전환 절차 | **해당 없음** — 현재 설치 고객 없음 | **리스크 소멸** |
| M7 | 조기 갱신 시 잔여 기간 | **이월 없음** | 동일 |
| M8 | 읽기 전용에서 실시간 조회 | **단계적 — 30일 유지 후 차단**(`EXPIRED`→`ARCHIVED`) | **신설** (P17) |
| M9 | 읽기 전용 중 알람 ack | **차단** | 동일 |

**추가 확정 (v4 재점검에서 나온 것)**

| 항목 | 확정 |
|---|---|
| 프리미엄 코드 경계 | **수집층은 중립, 게이팅은 API층에서만**(P2-1) |
| 인터셉터 순서 | **인증·권한 뒤**에 라이선스(P18) |
| 활성 키 개수 | **1개** — DB 부분 유니크 인덱스로 강제(P12 유지) |
| 발급 도구 | **대화형 `.bat` + Java CLI**, 산출물 `.lic` 파일(§5.10) |
| 키 적용 방식 | **파일 업로드 + 붙여넣기 둘 다**(§5.4) |
| dev/QA 환경 | **우회 스위치 없음.** dev용 `PERPETUAL`/`PREMIUM` 키를 발급해 등록(P11) |
| 착수 범위 | **0단계 커널 풀스택**(BE+FE 동시) |

### 7.2 승격 조건 (나중에 필요해지면)

| 항목 | 현재 | 승격 트리거 |
|---|---|---|
| `premium/` 패키지 → Gradle 모듈 | 패키지 + ArchUnit | 프리미엄 제외 배포본 요구 / 유출 리스크 실측 / 별도 팀 |
| 활성 키 1개 → 복수 키 | 1개(부분 유니크 인덱스) | "영구 STANDARD + 기간제 PREMIUM" 혼합 판매 시작 시 |
| 오프라인 검증 → 온라인 활성화 | 완전 오프라인 | 폐쇄망이 아닌 고객 비중이 커지고 어뷰징이 실측될 때 |
| 기능 단위 만료 | 라이선스 단위 만료 | "APM만 1년 체험" 같은 판매 시작 시 |
| 읽기 전용 영구 → N일 후 **완전 잠금** | 영구 유지(v4에서 실시간만 30일 후 차단 — P17) | 읽기 전용(`ARCHIVED`) 상태로 무기한 방치하는 고객이 실제로 문제가 될 때 |
| 체험 전용 타입 | 없음 — 기간제 단기 발급으로 대체(M4) | 체험판만의 정책·표시·전환 퍼널이 필요해질 때 |

### 7.3 리스크

- **게이팅 누락**: 가장 현실적인 사고. A2가 방어하나 **premium 패키지 밖에 프리미엄 기능을 만들면 A2가 안 걸린다.** → 코드 리뷰 체크리스트에 반영.
- **`@ReadOnlyAllowed` 남용**: 편의로 붙이면 읽기 전용이 무의미해진다. ArchUnit으로 막기 어려워 리뷰에 의존한다(P15).
- **잠금 모드 구멍**: `@LicenseExempt` 남발. A5가 사용처를 `license`/`auth`/헬스체크로 제한한다.
- ~~**업그레이드 잠금 사고**~~ → **해소(v4)**: 설치 고객이 없어 해당하지 않는다(M6). 단 **출시본에는 처음부터 라이선스가 들어가야** 이 리스크가 되살아나지 않는다.
- **공개키 교체**: 개인키 유출 시 공개키를 바꾸면 기존 고객 키가 전부 무효가 된다. → 검증을 **공개키 리스트 순회**로 짜 둔다(P7). 0단계에 넣으면 공짜.
- **시계 오차**: 온프레미스 서버 시각이 틀리면 만료 판정이 흔들린다. §1.3대로 방어하지 않되, `EXPIRING` 배너로 고객이 먼저 인지한다. `PERPETUAL` 고객은 영향 없다. **v4에서 시계 의존 구간이 하나 늘었다**(`EXPIRED`→`ARCHIVED` 전환) — 다만 둘 다 `READ_ONLY`라 오차의 영향은 "실시간이 며칠 일찍/늦게 닫힘"에 그친다.
- **데코레이터 우회(v4 신설)**: `LicenseGuardedMetricPort`를 거치지 않고 구현체(`engine-zabbix`)를 직접 주입받으면 P17이 무력화된다. 데코레이터를 `@Primary`로 두고, **구현 클래스를 직접 주입하는 코드가 없는지** 0단계 완료 시 확인한다(이미 `app→engine-zabbix` 컴파일 의존이 차단돼 있어 실수 가능성은 낮다).
- **읽기 전용의 갱신 압박 약화**: 완전 잠금보다 갱신 유인이 약하다. **v4의 단계적 차단(P17)이 이 부분을 크게 보완한다** — 만료 후 60일이 지나면 모니터링 화면이 실제로 닫히므로 "언젠가는 끊긴다"가 고객에게 분명해진다.

### 7.4 APM은 본 문서 범위 밖

애플리케이션 모니터링은 GPU·DB와 **성격이 다르다**:
- 데이터 모델이 트레이스/스팬이라 `MetricRef(domain, name, dims)` 시계열 모델로 표현 불가
- 수집이 pull 폴링이 아니라 push(OTLP)
- 저장소가 별개(고카디널리티 + 트레이스 스토어)
- **Zabbix로는 수집 불가** — 유일하게 수집 경로가 갈리는 도메인

기존 `MetricPort`에 우겨넣지 않는다. collector-engine이 `ItemsService`를 *"캐노니컬 모델로 표현 불가, 억지 매핑 금지"*로 전환 보류한 것과 같은 사유다.

**방향(별도 설계서에서 확정)**: OpenTelemetry Collector 수집 → 별도 스토어(Tempo/ClickHouse 등) → `TracePort` 신설.

---

## 부록 A. 조사 명령 기록 (2026-07-29)

```
ls moveseye-be-spring/src/main/resources/db/migration/          # V15가 최신
find src/main/java -name "*Interceptor*.java"                    # RolesInterceptor 등 3종
sed -n '1,70p' common/exception/GlobalExceptionHandler.java      # 200+ApiResult 계약
cat setting/domain/SettingType.java                              # PG enum(CLOUD, ZABBIX)
for m in Get Post Put Patch Delete; do grep -rho "@${m}Mapping" --include=*.java . | wc -l; done
                                                                 # 106/29/15/15/14
grep -rn "@Scheduled" --include=*.java .                         # 없음 — SchedulerManager 구조
grep -nE "job\(" scheduler/BuiltInJobs.java                      # 내장 잡 6개
wc -l moveseyee_fe/src/pages/{gpu,database,application}-monitoring/*.tsx   # 15~17줄 스텁
grep -n "gpu-monitoring" moveseyee_fe/src/layouts/app/SideNav.tsx         # 메뉴 기존재
```

## 부록 B. 재실측 명령 기록 (2026-08-06 · v4)

```
ls moveseye-be-spring/src/main/resources/db/migration/           # V19가 최신 → 라이선스는 V20
find src -ipath "*license*" -o -ipath "*premium*"                # 0건 — 구현 착수 전 확인
grep -n "archunit" build.gradle.kts app/build.gradle.kts         # 0건 — 의존성 신규 추가 필요
for m in Get Post Put Patch Delete; do grep -rho "@${m}Mapping" --include=*.java . | wc -l; done
                                                                 # 114/30/15/16/14 (쓰기 75)
grep -rl "@RestController" --include=*.java . | wc -l            # 33
cat scheduler/BuiltInJobs.java                                   # 잡 6개 유지, 시그니처는 jobKey()/run(setting)
grep -rl "MetricPort\|InventoryPort\|AlertPort" --include=*.java . | wc -l   # 20 ← P17 근거
cat config/WebConfig.java                                        # Roles → VisitorId 순 (P18 삽입 지점)
grep -rn "acknowledge" event/EventController.java                # PUT /event/{id}/acknowledge = Zabbix 쓰기(M9)
```
