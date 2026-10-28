---
tags: [moveseye, licensing, product, design, decision]
updated: 2026-08-06
---

# 2026-08-06 — 라이선스 설계 재점검(v3→v4): 미결 전건 확정, 커널 착수

> ⚠️ **2026-08-12에 뒤집힌 결정이 둘 있다** — **P12**(기간은 등록 시점부터 계산·키에 만료 없음)와
> **P13**(같은 `jti`면 최초 `activatedAt` 재사용). 만료일이 고객사 DB에만 남아 `UPDATE` 한 줄로
> 무한 연장되는 구멍이 있었다. 지금은 **시작일·만료일이 키에 서명**되고 DB는 표시용 사본이다.
> 아래 P12·P13 서술은 **당시 기록**으로만 읽을 것. → [[2026-08-12-license-expiry-in-key]]

[[2026-07-29-scheduler-and-licensing]]에서 설계서만 나오고 멈춰 있던 라이선스/에디션을 **착수 직전에 다시 열어** 미결 9건(M1~M9)을 전부 닫고, 그 과정에서 설계 자체가 세 군데 바뀌었다. 설계서 `_workspace/devdesign_premium-edition.md`는 **v4(구현 착수본)**.

## 재점검을 먼저 한 이유 — 열흘 사이 전제가 움직였다

v3는 2026-07-29 실측 위에 세워졌는데, 착수는 08-06이었다. 그 사이 비용 대시보드·스케줄러·권한 하드닝이 들어가면서 **설계서가 근거로 삼은 숫자 4개가 바뀌어 있었다**:

| 설계서 전제 | 실제(08-06) | 영향 |
|---|---|---|
| Flyway 다음은 V16 | **V19까지 사용중** | 라이선스 테이블은 **V20** |
| `SchedulerJob { key(); void run(); }` | `jobKey(); String run(SchedulerSetting)` | 게이팅 코드 스케치가 컴파일 안 됨 |
| GET 106 / 쓰기 73 | GET 114 / 쓰기 75 | (규칙 전제는 유효) |
| 엔진 포트 사용처 | (미측정) → **20개 클래스** | **M8의 답을 바꿈** ↓ |

👉 **설계서를 쓴 날과 착수하는 날이 다르면, 설계서가 인용한 실측치부터 다시 재는 게 먼저다.** 여기선 V16으로 마이그레이션을 짰으면 바로 충돌났다.

## 실측 하나가 미결의 답을 만들었다 (M8)

v3가 유일하게 "사용자 확인 필요"로 남긴 항목: **만료(읽기 전용) 상태에서 Zabbix 실시간 조회를 유지할 것인가.**

착수 전 재실측에서 엔진 포트(`MetricPort`/`InventoryPort`/`AlertPort`)를 참조하는 클래스를 세어보니 20개였고, 분포가 `host/{cpu,memory,disk,network,responsetime,hostinterface,livecheck}`·`home`·`event`·`report`·`asset`이었다. 즉 **이 제품에서 "모니터링"이라 부르는 화면이 사실상 전부 Zabbix 실시간**이다. 그러자 양쪽 선택지가 다 곤란해졌다:

- **유지하면** — 만료 고객이 CPU·메모리·디스크·알람을 **전부 계속 본다**. 멈추는 건 이벤트 이력 축적과 리포트 생성뿐 → 갱신할 이유가 프리미엄밖에 안 남는다.
- **차단하면** — 호스트 상세·홈·리소스 추이가 **전부 빈 화면**. "만료돼도 데이터는 보장한다"는 배려가 무의미해진다.

**결정: 단계적 차단.** 읽기 전용을 두 구간으로 쪼갰다.

```
만료일 ── +30일 ────── +60일 ──────────────► 영구
   │ GRACE(전 기능) │ EXPIRED(읽기+실시간) │ ARCHIVED(읽기, DB만)
```

👉 **양자택일이 둘 다 나쁘면 시간축을 넣어 본다.** "얼마나"가 아니라 "언제까지"로 바꾸면 두 요구(고객 배려 / 갱신 압박)가 순서대로 만족된다.

### 구현이 싸지는 지점

- `AccessMode`를 4단으로 늘리지 **않았다.** `ARCHIVED`도 쓰기 판정은 `READ_ONLY`와 완전히 같아서, 모드를 늘리면 인터셉터 분기가 늘고 READ_ONLY 판정이 두 곳으로 흩어진다. → **모드는 3단 유지 + `allowsLiveQuery()` 축 하나만 추가.**
- 포트를 쓰는 20개 클래스에 `if`를 넣으면 "서비스 내부에 라이선스 조건을 흩뿌리지 않는다"는 원칙(P4)이 깨진다. → **엔진 포트를 감싸는 `@Primary` 데코레이터 3종.** 소비 클래스는 무수정(주입 타입이 그대로다).

## 착수 전에 잡은 설계 구멍 2개

**① `premium/` 패키지 격리가 GPU에서 바로 깨질 뻔했다.**
설계는 "프리미엄 코드는 `premium.**` 안에만, ArchUnit이 강제"인데, GPU 구현의 첫 줄이 `MetricDomain`에 `GPU`를 추가하는 것이다 — 그건 `engine-api`, 즉 premium 패키지 **밖**이다. 1단계에서 규칙이 깨지거나 규칙을 무력화하게 된다.

→ **수집층은 중립으로 규정**(P2-1). `MetricDomain.GPU`·Zabbix 카탈로그는 `engine-api`/`engine-zabbix`에 두고, `premium/`엔 컨트롤러·서비스만 둔다. 이미 있던 3축 분리(`Capability` ≠ `Feature`)를 **계층에 그대로 옮긴 것**이라 새 개념이 아니다. "수집층에 GPU 키가 있다"는 사실 자체는 구멍이 아니다 — 노출 경로인 컨트롤러가 전부 `premium.**`에 있고 ArchUnit A2가 `@RequiresFeature`를 강제하기 때문.

**② 인터셉터 순서가 설계서에 없었다.**
"레이어1이 레이어2보다 먼저"만 있고 기존 `RolesInterceptor`와의 선후가 없었다. 라이선스를 앞에 두면 **토큰 만료 요청이 401 대신 `LICENSE_REQUIRED`를 받는다** — FE는 401을 트리거로 single-flight refresh를 도는 구조라([[2026-07-16-auth-hardening]]) 세션 만료가 잠금 화면으로 오인된다.

→ `Roles → VisitorId → AccessMode → Feature`. **라이선스는 인증·권한 뒤.**

👉 **게이팅을 새로 추가할 땐 "기존 게이트와 어느 쪽이 먼저인가"가 설계 항목이다.** 순서가 곧 사용자에게 보이는 에러 화면을 정한다.

## 결정 요약 (M1~M9 + 추가)

| # | 확정 | v3 기본안 대비 |
|---|---|---|
| M1 유예 | **30일** | 14→30 |
| M2 미보유 메뉴 | 노출 + 자물쇠 배지 | 동일 |
| M3 `maxHosts` | **강제·표시 모두 없음**(클레임 자리만 존치) | 강화 |
| M4 TRIAL | **타입 삭제** — 체험은 기간제 + `graceDays=0` | 변경 |
| M5 등록 기한 | **7일**(미등록 시 재발급 요청) | 90→7 |
| M6 기존 고객 전환 | **해당 없음 — 설치 고객 부재** | **최대 리스크 소멸** |
| M7 조기 갱신 이월 | 없음 | 동일 |
| M8 실시간 조회 | **단계적(30일 후 차단)** | 신설 |
| M9 알람 ack | 차단(Zabbix에 쓰는 동작이므로 쓰기) | 동일 |

추가 확정: 활성 키 **1개** · 발급 도구 = **대화형 `.bat` + Java CLI → `.lic` 파일** · 등록은 **파일 업로드+붙여넣기 둘 다** · **dev 우회 스위치 금지**(대신 dev용 영구키 발급).

- **`maxHosts`는 자리만 남긴다**: 지금 안 쓰지만 클레임 스키마에 두면, 나중에 상한 정책이 생겨도 **이미 발급된 키를 재발급하지 않아도 된다.** 키 포맷은 되돌리기가 비싼 결정이라 열어두는 쪽이 싸다.
- **TRIAL 삭제의 부작용을 발급 옵션으로 흡수**: 체험을 기간제로 발급하면 유예 30일이 붙어 30일 체험이 실질 60일이 된다 → 체험용 키는 `graceDays=0`으로 발급.
- **발급 도구를 Java로 짜는 이유**: 검증 로직과 **같은 코드로 서명**해야 "발급은 됐는데 제품이 거부한다"가 안 난다. 클레임 이름 하나 어긋나면 현장에서야 드러난다.
- **dev 우회 스위치를 안 만드는 이유**: `license.enforce=false` 같은 플래그는 프로파일 오설정 하나로 **운영에서 라이선스를 통째로 무력화**한다. dev 키를 쓰면 커널이 매일 실검증되는 부수 효과도 있다.

## 리스크 변화

- ✅ **해소**: v3 최대 리스크였던 "기존 설치 고객이 업그레이드 순간 잠김"은 **설치 고객이 없어 해당 없음**. 단 **출시본에는 처음부터 라이선스가 들어가야** 되살아나지 않는다.
- 🆕 **데코레이터 우회**: `LicenseGuardedMetricPort`를 안 거치고 구현체를 직접 주입받으면 P17이 무력화된다. `@Primary` + `app→engine-zabbix` 컴파일 의존 차단([[2026-07-28-collector-engine-phase1]])이 이미 막고 있어 가능성은 낮지만 완료 시 확인 항목.
- 🔁 **읽기 전용의 갱신 압박 약화**는 단계적 차단으로 크게 보완됐다 — 만료 후 60일이면 모니터링이 실제로 닫힌다.

---

# 구현 진행 (2026-08-06, 같은 날 착수)

**브랜치**: BE `ZM-79`(develop 기준, ZM-87은 develop에 머지 완료) / 발급기는 별도 저장소 `main`
**설계 정본**: `_workspace/devdesign_premium-edition.md` v4 · **완료 판정 19항목은 §6**

## 저장소가 둘로 갈라졌다

사용자 판단으로 **발급기를 별도 저장소로 분리**했다 — `C:\solutions\moveseye-license-issuer`
(Bitbucket `DMOVE_GIT/moveseye-license-issuer`, 모노레포 형제 폴더).

- 이유: 개인키를 다루는 코드가 **고객사에 넘어가는 소스에 섞이지 않게**
- 대가: app과 클레임 상수를 **소스로 공유하던 장치가 끊겼다**(처음엔 Gradle 서브프로젝트로 `srcDir` 공유였음)
- 대체: 네 파일(`LicenseClaims`·`Edition`·`Feature`·`LicenseType`)을 **양쪽 동일 사본**으로 두고,
  각 저장소의 `LicenseContractTest`가 **같은 문자열을 독립적으로 주장**한다. 한쪽만 바뀌면 그쪽이 깨진다.

👉 **저장소를 가르면 "같아야 하는 것"을 지키던 장치도 같이 끊긴다.** 무엇이 끊기는지 먼저 세고, 대체 장치를 같은 커밋에 넣을 것.

## 완료 (커밋됨)

| 커밋 | 내용 |
|---|---|
| `9787a4c` | 라이선스 커널 기초 — enum 5종·`LicenseStatus`·`LicenseClaims`·`LicenseKeyVerifier`·발급 도구 |
| `cce4fa5` | 발급 도구를 별도 저장소로 분리 + `LicenseContractTest` |
| 발급기 `81f41ca` | 발급 도구 저장소 초기 커밋(README·CLAUDE.md 포함) · **push 완료** |

**실동작 검증된 것**: RSA 키쌍 생성 → 공개키 제품 번들 → dev 영구키 발급 → 클레임에 **`exp` 없음 확인**(P12가 코드에서 지켜짐) → 한글 고객사명이 클레임까지 정상. 테스트 제품 15개(계약 4 + 검증 11) / 발급기 4개 통과.

## 실사용에서만 나온 함정 4개

1. 🔴 **배치 파일 안의 한글이 `chcp 65001`과 충돌해 cmd 파싱을 통째로 깨뜨린다.** `'o'는 내부 명령이 아닙니다` 같은 엉뚱한 에러로 나타나 원인을 짐작하기 어렵다. → **`.bat`은 ASCII 전용, 한글 출력은 Java가** 한다. ([[curl-hangul-cp949-false-500]]과 같은 계열)
2. 🔴 **배치의 `shift`는 `%*`를 다시 쓰지 않는다** → `--rebuild`가 걸러진 줄 알았는데 Java까지 새어 usage가 떴다. 인자를 벗기려 들지 말고 **독립 명령으로** 둘 것.
3. **전역 `JAVA_HOME`이 JDK 8**(corretto)이라 도구가 그냥 죽는다 → `issue.bat`이 JDK 17을 스스로 찾아 **그 창에서만** 교체.
4. **Windows Java 기본 인코딩이 MS949** → `applicationDefaultJvmArgs`로 stdout/stderr UTF-8 고정. 안 하면 한글 고객사명이 **깨진 채로 키 클레임에 박힌다**(파일명이 아니라 서명된 내용이라 더 나쁘다).

그 밖: 서브프로젝트에 UTF-8 인코딩 설정 누락(root에만 있었음), Bitbucket 기본 `.gitignore`의 `*.jar`가 **`gradle-wrapper.jar`까지 삼켜** clone한 사람이 `gradlew`를 못 쓰게 되는 것(negation으로 예외).

## 진행 중 (코드 완료, 검증 전)

**T3 — V20 + `License` 엔티티 + `LicenseService`** (미커밋, 컴파일만 통과)

- `V20__license.sql` — 활성 1개 부분 유니크 인덱스(`WHERE active`), `jti` 인덱스
- `LicenseService.register()` — P12(등록 시점부터 기간)·P13(같은 `jti`면 최초 `activatedAt` 재사용)·유예까지 끝난 키 거부
- 🔴 활성 1개를 DB가 강제하므로 **기존 행을 내리고 `saveAndFlush` 한 뒤** 새 행을 넣어야 한다. 순서가 뒤바뀌면 같은 트랜잭션에서 제약 위반.
- ⚠️ **미검증**: V20의 실제 DB 적용, `LicenseService` 단위 테스트

## 다음 (남은 순서)

1. **T4** `LicenseProvider`·캐시 + `GET /features` + 등록/해지 EP — 상태 머신(`GRACE→EXPIRED→ARCHIVED`) 판정이 여기서 나온다. T3 로직도 이때 함께 테스트.
2. **T5** 게이팅 인터셉터 2종 + 예외 4종 + `WebConfig` 순서(`Roles→VisitorId→AccessMode→Feature`)
3. **T6** 엔진 포트 데코레이터 3종(P17) — 소비 20개 클래스 무수정
4. **T7** 스케줄러 게이팅(`minMode()`) + ArchUnit A1~A5
5. **T8** 런타임 검증 — dev 키(`--deadline 3650`)로 등록·상태 전이
6. **T9** FE 일체 → **T10** 완료 판정 19항목

⚠️ 비용(cost) 작업이 BE 5파일·FE 9파일 **미커밋으로 남아 있다**(라이선스와 무관, 손대지 않음).

관련: [[2026-07-29-scheduler-and-licensing]] · [[2026-07-28-collector-engine-phase1]] · [[2026-07-16-auth-hardening]] · [[2026-07-28-be-package-restructure]]

---

## FE 설정 Control Plane 구현 (2026-08-10)

라이선스 커널의 FE 작업(T9)을 `moveseyee_fe` 설정 영역에 반영했다.

- `/setting/license`: `GET /features`를 사용하는 적용 상태 화면. 상태(`NONE`~`ARCHIVED`), 동작 모드(`FULL`/`READ_ONLY`/`LOCKED`), 만료 수명주기, edition/customer, Premium 기능 매트릭스를 표시한다.
- `/setting/license/apply`: 텍스트 키와 `.lic` 파일(64KB 제한)을 각각 실제 `POST /settings/license` 계약으로 등록한다. 해지는 `DELETE /settings/license`를 사용한다.
- `/setting/integrations`: Zabbix·Prometheus·Elasticsearch·Datadog를 한 화면에 모은 데이터소스 Control Plane. 현재 BE adapter가 있는 Zabbix만 실제 조회·저장하고, 나머지는 필요 필드와 계획 상태만 보여 준다.
- 기존 `/setting/zabbix-info`, `/zabbix-management/connection-info`는 Zabbix provider가 선택된 통합 화면으로 redirect한다.

### 구현 판단과 교훈

1. **미구현 provider에 저장·연결 버튼을 제공하지 않는다.** UI가 “연동됨”을 가장하면 데모 이후 실제 운영에서 가장 먼저 신뢰가 깨진다. `availability: planned`를 명시하고 adapter가 생길 때 같은 provider catalog를 활성화한다.
2. **HTTP status만 성공 기준으로 삼지 않는다.** 설정 mutation이 HTTP 200이라도 envelope의 `success=false`면 `ApiEnvelopeError`를 던져 성공 toast가 뜨지 않도록 했다.
3. **비밀번호는 서버 응답으로 form에 재주입하지 않는다.** Zabbix password는 수정 시 선택 입력이며, 조회 후 해당 필드를 항상 비운다.
4. **설정 화면은 일반 SaaS 카드보다 운영 콘솔 문법이 맞다.** 짙은 teal hero, provider rail, 상태 KPI, capability/requirement 구획으로 “Operations Control Plane” 성격을 분명히 했다.
5. 보호 라우트 브라우저 확인에서는 미인증 사용자가 `/sign-in`으로 이동했고 console error는 없었다. 화면 본체는 Jest 3 suites/64 tests, TypeScript, 대상 ESLint, production build로 검증했다.
