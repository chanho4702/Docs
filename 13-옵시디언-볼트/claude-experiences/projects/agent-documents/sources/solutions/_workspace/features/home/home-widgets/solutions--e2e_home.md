# E2E / 런타임 행위 검증 — 홈(랜딩) 페이지  `e2e_home.md`

작성: functional-qa · 2026-07-20 · 브랜치 ZM-87 · 방식: **런타임 기동 + 실호출**
입력: `devdesign_home.md` · `features/home/home-widgets/contract_home.md` · `qa_home.md`(정적 PASS)
대상: BE `:3000`(기존 프로세스 PID 24080, 재사용) · FE `:5173`(기존 PID 34688, 재사용) · 진단용 자가 기동 BE `:3002`(검증 후 정리 완료)

## 총괄 판정: **FAIL (블로킹)** — HIGH 1건 + 환경 블로커 1건

| # | 심각도 | 요지 | 책임 |
|---|---|---|---|
| BLOCKER-1 | **HIGH** | `:3000`이 **스테일·불일치 빌드**를 실행 → `GET /home/summary`가 원시 HTTP 500(ApiResult 아님) | BE / 배포 운영 |
| OBS-1 | LOW | `safeXxx`의 `catch(Exception)`은 `java.lang.Error`(링크 에러)를 못 잡아 부분-null 보장이 깨짐 | BE (방어적, 선택) |
| BLOCKER-2 | 환경 | Zabbix superadmin 로그인 실패 → admin 인증 EP 전면 401 (검증 중 유발 정황) | 환경/설정 |

> BE 데이터 계층이 500/401로 막혀 **시나리오 1·3·7 및 브라우저 시나리오 2·4·5·6의 런타임 관측이 불가**했다. 브레드크럼 HIGH-1 수정은 FE 서빙 소스에서 재확인(정적)했으나 렌더 문자열은 브라우저 확장 미연결로 런타임 미확인.

---

## BLOCKER-1 (HIGH, BE/배포) — `:3000` 스테일 빌드로 `/home/summary` 원시 500

### 재현 (세션 초반, 인증 정상 시점 ~10:32)
```
POST /auth/login {admin/qwe123} + x-visitor-id  → 200, accessToken 쿠키 발급 (정상)
GET  /home/summary  (쿠키+visitor)  → HTTP 500  {"statusCode":500,"message":"Internal server error"}   [t≈0.046s, 재호출 0.015s]
GET  /asset/summary                 → HTTP 500  (동일 원시 500)  [t≈0.229s → 0.025s]
GET  /asset/list?limit=1            → HTTP 500  (동일)           [t≈0.216s]
# 대조(동시점, 정상):
GET  /event/problems?limit=1        → 200 (실데이터)
GET  /hosts/hostgroup-problems      → 200 (실데이터: Linux servers 등)
```
- 기대: `ApiResult<HomeSummaryDto>` 200, 도메인 부분 실패는 해당 필드만 null(계약 §1, §3). 
- 실제: **원시 500** — ApiResult 래퍼도 아니고(=`GlobalExceptionHandler.handleUnknown`의 미처리 예외 경로), 부분-null도 아님.
- `/event/problems`·`/hosts/hostgroup-problems`가 동시점 200 → **인증·Zabbix·Redis 정상**, 실패는 home/asset EP 특정.

### 근본 원인 = `:3000`이 실행 중인 `build/classes`가 내부적으로 불일치(스테일 빌드)
`:3000`은 `build\classes\java\main`(gradle `bootRun` exploded classes)에서 기동됨. 그 안의 클래스 컴파일 시각이 뒤섞여 있다:

| 클래스 (build/classes) | 컴파일 시각 | 대응 소스 수정 시각 |
|---|---|---|
| `home/HomeService.class` | **2026-07-20 09:59** (신규) | 07-20 09:57 |
| `asset/AssetService.class` | 2026-07-18 18:10 (구) | 07-20 09:48 |
| `asset/dto/AssetSummaryDto.class` | **2026-07-09 14:51** (구, 11일 전) | 07-20 09:48 |
| `geomap/GeoClusterService.class` | 2026-07-18 (구) | 07-20 09:48 |

- 클린 빌드라면 클래스 시각이 균일해야 하나 07-09/07-18/07-20으로 흩어짐 = **여러 날에 걸친 증분 컴파일의 잔재, 클린 리빌드 부재**.
- 현재 소스의 `AssetSummaryDto`는 **8-arg record**(total, zabbixCount, customCount, excludedCount, monitored, unmonitored, lifecycleReview, lastSyncedAt). 로드된 07-09 클래스는 이전(다른) shape.
- 실행 흐름: 신규 `HomeService.safeAsset()` → (구) `AssetService.getSummary()` → `new AssetSummaryDto(...)`가 **로드된 07-09 클래스에 없는 생성자 시그니처**를 호출 → `java.lang.NoSuchMethodError`/`NoSuchFieldError`(= `java.lang.Error`, **Exception 아님**) → `safeAsset`의 `catch (Exception e)`가 **못 잡음** → 전파 → `handleUnknown` → 원시 500.
- 이 이론은 관측과 정합: (a) 15~46ms **즉시 실패**(DB/Zabbix 작업 이전, asset 단계 링크 실패), (b) `/asset/summary`·`/asset/list`도 같은 스테일 asset 클래스라 동일 500, (c) `/home/summary`가 `HomeService.getSummary` 코드상으론 절대 throw 불가(모든 도메인 try/catch)한데도 500 나는 유일한 설명.

### 조치 (BE/배포)
1. **클린 리빌드 + `:3000` 재기동**: `gradlew clean build`(또는 최소 `compileJava`로 build/classes 일관화) 후 `:3000` 재기동. 배포/운영 위생 이슈이며 **납품된 ZM-87 소스 자체의 결함은 아님**(소스는 정상, 빌드 산출물이 스테일).
2. 재기동 후 회귀: 인증 정상 상태에서 `/home/summary` 200 + 계약 shape, `/asset/*` 200 재확인 필요(본 세션은 아래 BLOCKER-2로 검증 불가).

### 검증 상태
- 500 재현: **관측 완료**(세션 초반).
- 수정(리빌드 후 200) 확인: **미완** — (a) 타 세션 소유 `:3000`을 파괴적으로 리빌드/재기동하지 않음, (b) 아래 Zabbix 인증 블로커로 admin이 EP에 도달 자체가 불가.

---

## OBS-1 (LOW, BE, 선택) — `catch(Exception)`는 `Error`를 못 잡는다

`HomeService.safeAlarm/safeInfra/safeAsset/safeMap/safeRecentReports`가 전부 `catch (Exception e)`. 계약 §1·설계의 "부분 실패 허용 — 전체 500 금지" 보장은 **Exception에 한정**되고, 스테일/불일치 빌드가 만드는 링크 에러(`NoSuchMethodError` 등 `java.lang.Error`)는 통과해 원시 500이 된다.
- 근본 해결은 **빌드 일관성**(BLOCKER-1). `catch(Throwable)`로 넓히는 것은 실제 치명 오류를 은폐하므로 권장하지 않음 — 관측/기록용 LOW로만 남긴다.

---

## BLOCKER-2 (환경) — Zabbix superadmin 로그인 실패 → admin 인증 EP 전면 401

### 타임라인
- 세션 초반(~10:32–10:35): `:3000` admin 인증 **정상** — `/event/problems`·`/hosts/hostgroup-problems`가 실데이터 200. 이들은 admin의 `getSuperAdminToken()`(zabbix 미연동 admin은 superAdmin 서비스 계정 토큰 사용, `JwtAuthFilter.resolveAuthToken`)이 필요하므로 = superAdmin 토큰 정상 확보됨.
- ~10:36 이후: `getSuperAdminToken()`가 `WRONG_USER_OR_PASSWORD`로 실패 시작. superAdmin 토큰의 공유 Redis 캐시(`KEY_CACHED_SADMIN`, TTL 60초)가 만료된 뒤 재로그인이 불가 → `JwtAuthFilter`가 `INVALID_TOKEN` 세팅 → **admin 모든 인증 EP 401**.
- 75초 무-probe 대기 후에도 미회복.

### 원인(정황) — 검증 중 유발 가능성
- 스택트레이스 확보를 위해 진단용 BE를 `:3002`에 자가 기동(내 프로세스, 정리 완료). 첫 기동은 폴백 `moveseye-be\.env`를 사용했는데 그 **Zabbix superadmin 크리덴셜이 stale** → 반복 `user.login` 실패. Zabbix는 로그인 실패 누적 시 계정을 일시 블록하며, **블록된 계정엔 올바른 크리덴셜로도 `WRONG_USER_OR_PASSWORD`를 반환**(Vault 크리덴셜로 재기동한 `:3002`도 동일 실패). `:3000`의 60초 캐시가 이 창에서 만료되며 전면 401로 전이.
- 즉 이 401은 **검증 과정에서 유발된 환경 상태일 가능성이 높고**, `:3000` 홈 코드의 결함이 아니다. 시간이 지나거나 Zabbix 계정 블록 해제/캐시 재확보 시 정상화될 것으로 예상.

### 팀 확인 권고
- `:3000`이 60초 캐시된 superAdmin 토큰에 의존해 "코스팅"하다 캐시/크리덴셜 소진 시 재로그인 불가한 구조가 드러남. **활성 설정 소스(env/Vault/DB Setting(ZABBIX))의 Zabbix superadmin 크리덴셜 유효성**과 계정 블록 여부를 점검 권고(참고: `moveseye-be-spring/CLAUDE.md` 대기 과제 "Vault 시크릿 교체").
- 재검증 시 Zabbix 크리덴셜을 절대 다중 인스턴스로 stale 값 로그인 시도하지 말 것(계정 블록 유발).

---

## 시나리오별 결과

| # | 시나리오 | 결과 | 비고 |
|---|---|---|---|
| 1 | BE `/home/summary` 실호출(shape/값/캐시/401) | **FAIL** | 500(BLOCKER-1) 관측. 미인증 401은 정상 확인. 값/캐시/Redis 키 확인은 500·401로 블록 |
| 2 | 랜딩 `/`→`/home` 전환 | **미검증** | 브라우저 확장 미연결. 정적으로 integration-qa PASS(routes.tsx:170, SignIn.tsx:86) |
| 3 | 홈 렌더(KPI/카드 실값 DOM 대조) | **블록** | BE 500/401로 데이터 없음 |
| 4 | 브레드크럼 HIGH-1(루트 "홈"/"Home") | **정적 재확인 / 런타임 미검증** | FE 서빙 소스: 플랫 `"home"` 문자열 키 0건, `"home"` 객체 1개(en/kr), `home.title`="Home"/"홈" 존재, `t("home")` 정확일치 소비처 0건, `useBreadcrumbs.tsx:37,86`가 `t("home.title")` 사용. 렌더 문자열은 브라우저 미연결로 런타임 미확인 |
| 5 | 카드 "더보기" 내비게이션 | **미검증** | 브라우저 미연결 |
| 6 | 언어/다크모드 토글 | **미검증** | 브라우저 미연결 |
| 7 | 비admin recentReports 미노출 | **미검증** | Zabbix 일반 사용자 계정/비번 확보 불가 + BLOCKER-2. 선례: 비-ADMIN은 JwtAuthFilter가 Zabbix 토큰 강제 |

### 미검증 사유 요약
- **브라우저 확장 미연결**(claude-in-chrome 미연결) → FE 런타임 드라이브(시나리오 2·4·5·6) 전부 불가.
- **BE 데이터 계층 다운**(BLOCKER-1 500 / BLOCKER-2 401) → 데이터 의존 검증(1·3·7) 불가.

---

## 재현 명령 (참고)
```bash
# 로그인(정상 시)
curl -s -c cookies.txt -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" -H "x-visitor-id: e2e" \
  -d '{"username":"admin","password":"qwe123"}'
# 홈 요약 (현 상태: BLOCKER-1이면 500, BLOCKER-2면 401)
curl -s -b cookies.txt -H "x-visitor-id: e2e" http://localhost:3000/home/summary
# 대조(정상 시 200): curl -s -b cookies.txt -H "x-visitor-id: e2e" 'http://localhost:3000/event/problems?limit=1'

# 스테일 빌드 확인 (핵심 증거)
cd C:/solutions/moveseye-be-spring
ls -la --time-style=+%F_%H:%M build/classes/java/main/com/dmove/moveseye/{home/HomeService,asset/AssetService,asset/dto/AssetSummaryDto}.class
# → HomeService 07-20 / AssetService 07-18 / AssetSummaryDto 07-09  = 불일치
```

## 정리
- 자가 기동한 `:3002` 진단 인스턴스(및 gradle 프로세스) 종료 완료. 기존 `:3000`(PID 24080)·`:5173`(PID 34688)은 미변경 보존.
