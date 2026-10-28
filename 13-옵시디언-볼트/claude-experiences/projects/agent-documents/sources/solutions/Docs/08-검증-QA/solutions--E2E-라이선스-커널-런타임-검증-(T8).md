# E2E — 라이선스 커널 런타임 검증 (T8)

> 2026-08-10 · 실행: Claude · 대상: BE `:3001` (dev 프로필 · 도커 PG 5433 `dmove`)
> 설계 정본: [devdesign_premium-edition.md](../02-%EC%84%A4%EA%B3%84/solutions--%EB%9D%BC%EC%9D%B4%EC%84%A0%EC%8A%A4-%EC%97%90%EB%94%94%EC%85%98%28STANDARD-PREMIUM%29-%EC%84%A4%EA%B3%84%EC%84%9C-v4.md) v4 §6 완료 판정
> 검수 요청: [review_license-kernel.md](../07-%EA%B2%80%EC%88%98-%EB%A6%AC%EB%B7%B0/solutions--%EA%B2%80%EC%88%98-%EC%9A%94%EC%B2%AD-%EB%9D%BC%EC%9D%B4%EC%84%A0%EC%8A%A4-0%EB%8B%A8%EA%B3%84-%EC%A0%84%EC%B2%B4-%28BE-%EC%BB%A4%EB%84%90-FE-%EA%B2%8C%EC%9D%B4%ED%8A%B8-%EB%B0%B0%EC%B9%98-lease%29.md)
> 커밋: `8cb1944` → `eb86507` → `b64cd6e` → `4b82bcc` → `5934015` → `9a88253`

---

## 0. 결과 요약

**BE를 실제로 띄우고 발급기가 만든 실물 키로** 검증했다. T7까지는 전부 테스트 레벨이었고,
런타임에서 확인한 것은 이번이 처음이다.

| | |
|---|---|
| 통과한 완료 판정 | **1 · 2 · 3 · 4 · 6 · 7 · 8 · 9 · 10 · 11 · 13 · 14 · 15 · 16 · 18** (15/19) + 17은 T7에서 실증 |
| 미검증 | **12**(프리미엄 EP가 아직 없다 — 1단계) · **19**(FE) |
| **런타임에서만 드러난 결함** | **2건** — 둘 다 775건 테스트가 green인 상태에서 살아 있었다 |

> 📌 **2차 검증(2026-08-11)**: 처음에 경로를 몰라 미뤘던 11·14와 배치 주기 대기가 필요했던 13을
> 닫았다. 상세는 §3-2. 남은 둘은 **지금 검증할 수 없는 것**이다 — 12는 `@RequiresFeature`를 붙인
> 실제 EP가 1단계(GPU)에 가야 생기고, 19는 FE 몫이다.

> 🔴 **이 문서의 요점은 통과 목록이 아니라 결함 2건이다.** 테스트를 아무리 촘촘히 짜도
> "실제로 띄워서 DB를 열어 보는 것"이 잡는 종류가 따로 있다는 실증 사례다.

---

## 1. 환경

| | |
|---|---|
| BE | `:3001` (`start_3001.ps1` — 구 NestJS 레포의 `.env`를 셸에 로드한 뒤 jar 실행) |
| DB | 도커 `dmove-postgres-test` 5433 / DB `dmove` (dev). 시작 시 `license` 테이블 **0행** |
| 계정 | `admin` / `<마스킹>` (V10 시드, ADMIN, Zabbix 미연결) |
| 키 | 발급기 `moveseye-license-issuer`의 실물 산출물 2종 |

⚠️ **다른 세션이 `:3000`(BE)과 `:5173`(FE)을 쓰고 있어 `:3001`로 분리 기동**했다. 검증 후 내렸고
`:3000`·`:5173`은 건드리지 않았다.

**사용한 키**

| 파일 | 클레임 |
|---|---|
| `dev_PREMIUM_20260806.lic` | `PERPETUAL` / `PREMIUM` / `graceDays=30` / **`exp` 없음** |
| `t8sub_PREMIUM_20260810.lic` | `SUBSCRIPTION 365일` / `PREMIUM` / `graceDays=30` / 등록기한 08-17 |

발급 명령: `.\issue.bat --customer t8sub --edition PREMIUM --type SUBSCRIPTION --days 365 --grace 30 --deadline 7`

> ✅ **발급기 공개키 == 제품 번들 `src/main/resources/license/public-1.pem`** (문자열 동일 확인).
> 저장소가 분리된 뒤 이 왕복을 실제 등록 EP로 통과시킨 것은 이번이 처음이다(판정 18).
>
> ✅ 기동 로그에 **`라이선스 공개키 1개 로드`** — `classpath*:license/public-*.pem` 스캔이 실동작한다.
> 테스트는 검증기 빈을 테스트 키쌍으로 갈아끼우므로 **이 경로를 한 번도 타지 않는다.**
>
> ✅ 발급된 키 클레임에 **`exp`가 없다** — P12(만료일은 등록 시점에 계산)가 발급기에서도 지켜졌다.

---

## 2. 상태 머신 전 구간 (판정 8·9·10)

`expires_at`을 옮겨 가며 각 구간을 태웠다. `graceDays`는 **키가 정본**이라 DB로 바꿀 수 없어
키에 30을 박아 발급했다.

| `expires_at` | state | mode | 실시간 조회 | 쓰기 | DB 조회 | `daysRemaining` |
|---|---|---|---|---|---|---|
| now + 200d | `ACTIVE` | FULL | ✅ 200 | ✅ 200 | ✅ 200 | 199 |
| now + 10d | `EXPIRING` | FULL | ✅ 200 | ✅ 200 | ✅ 200 | 9 |
| now − 5d | `GRACE` | FULL | ✅ 200 | ✅ 200 | ✅ 200 | 0 |
| now − 40d | **`EXPIRED`** | READ_ONLY | **✅ 200 (유지)** | ❌ `LICENSE_READ_ONLY` | ✅ 200 | 0 |
| now − 100d | **`ARCHIVED`** | READ_ONLY | ❌ `LICENSE_LIVE_BLOCKED` | ❌ `LICENSE_READ_ONLY` | ✅ 200 | 0 |

- 실시간 조회 = `GET /hosts/server`, `GET /hosts/hostgroups` (엔진 포트 경유)
- DB 조회 = `GET /assets` (포트를 타지 않음)
- 쓰기 = `POST /assets`

> ✅ **`EXPIRED`와 `ARCHIVED`가 실시간 조회 하나로만 갈린다** — M8/P17 설계가 런타임에서
> 그대로 동작한다. 둘 다 `READ_ONLY`이고 `mode`로는 구분되지 않는다.
>
> ✅ **`ARCHIVED`에서도 자산(DB) 조회는 200** — P16(자기 데이터 조회·내보내기는 영구 보장).
>
> ⚠️ **캐시 60초 때문에 `expires_at`을 바꾼 뒤 63초를 기다려야 반영된다.** 등록·해지는
> `refresh()`가 즉시 반영하지만 **DB를 직접 고치는 경로는 캐시를 모른다** — 운영에서
> 손으로 DB를 고칠 일은 없지만, 검증할 때는 반드시 기다려야 한다.

---

## 3. 판정별 실측

### 판정 1 — 키 없음(LOCKED)

```
POST /auth/login            status=success            (면제 — 안 열리면 영구 잠금)
GET  /features              state=NONE mode=LOCKED allowsLiveQuery=false
GET  /assets                status=error code=403 errorCode=LICENSE_REQUIRED
POST /assets                status=error code=403 errorCode=LICENSE_REQUIRED
GET  /users/my-profile      status=success            (면제 — FE 부팅 경로)
```

### 판정 16 — 인터셉터 순서 (P18)

```
인증 없음                    HTTP 401                  (Security 필터가 처리)
유효 JWT + 틀린 visitor-id   HTTP 401 code=401         ← 라이선스 오류가 아니다
```

🔴 **두 번째 줄이 P18의 실증이다.** 인증 없음은 Security 필터 체인이 DispatcherServlet보다
앞이라 인터셉터 순서와 **무관하게** 401이 난다(순서를 뒤집어도 통과 — 실측). 실제로 순서가
갈리는 것은 **인터셉터끼리 겨루는** 경로다: `VisitorIdCheckInterceptor`는 필터가 아니라
인터셉터라, 라이선스를 앞에 두면 세션 불일치(401)가 `LICENSE_REQUIRED`(403)로 가려진다.

### 판정 18 — 실물 키 등록 (양쪽 경로)

```
붙여넣기(JSON)      state=ACTIVE mode=FULL edition=PREMIUM customer=dev
                    features=[APM, DB_MONITORING, GPU_MONITORING]
파일 업로드(multipart, name="file")   state=ACTIVE mode=FULL edition=PREMIUM
```

### 판정 2·3 — 재기동 없이 즉시 반영

등록 직전 `LICENSE_REQUIRED`로 막히던 `GET /assets`·`POST /assets`가 등록 직후 **같은 프로세스에서**
200이 됐다. `LicenseProvider.refresh()`가 캐시를 버리기 때문이다.

### 판정 4 — 기간은 등록일부터 (P12)

```
2026-08-10 등록 · durationDays=365  →  expiresAt = 2027-08-10T15:28:29
```
발급일(08-10과 무관하게 키에 박힌 값)이 아니라 **등록 시각 + 365일**이다.

### 판정 6 — 재사용 방지 (P13)

해지 후 같은 키를 다시 등록한 뒤 DB:

| id | jti | active | `activated_at` | `registered_at` | `revoked_at` |
|---|---|---|---|---|---|
| 1 | e9c4d1c4 | f | **15:13:51.119803** | 15:13:51 | 15:14:39 |
| 2 | e9c4d1c4 | t | **15:13:51.119803** | 15:15:13 | — |

`activated_at`이 **마이크로초까지 동일**하다. "만료 임박하면 지우고 재등록해 기간 리셋"이 막힌다.
행을 지우지 않고 이력으로 남기는 것도 확인됐다.

### 판정 7 — 영구 키

`expiresAt = null`, `daysRemaining = null`. 만료 경로에 진입하지 않는다.

### 판정 15 — 해지는 잠금

```
DELETE /settings/license → state=NONE mode=LOCKED
```
읽기 전용이 아니다. 만료(구매했다가 끝남)와 자발적 해지를 다르게 취급한다(P14).

---

### 3-2. 2차 검증 — 판정 11 · 13 · 14 (2026-08-11)

전부 `EXPIRED`(만료 40일 경과, 유예 30일 지남) 상태에서 확인했다.

**판정 11 — 만료 상태에서 알람 ack 차단**

```
PUT /event/{id}/acknowledge  →  status=error code=403 errorCode=LICENSE_READ_ONLY
```
경로는 `EventController`의 `@PutMapping("/{id}/acknowledge")`. `@ReadOnlyAllowed`가 없으므로
기본 규칙(HTTP 메서드)으로 막힌다 — `POST /assets` 차단과 같은 메커니즘이다.

**판정 13 — 수집 배치는 멈추고 정리 배치는 돈다**

`event_cleanup`을 임시로 1분 주기로 바꿔 `event_sync`(이미 1분)와 나란히 관찰했다.
검증 후 `daily`로 **원복 완료**.

| 시각 | `event_sync`(라이선스 필요) | `event_cleanup`(정리) |
|---|---|---|
| ACTIVE 구간 | `done in 559ms` / `509ms` | `done in 103ms` / `22ms` |
| **EXPIRED 전환 후** | **`skipped — 라이선스 상태 EXPIRED(READ_ONLY)`** ×3 | **`done in 13ms` / `7ms` / `6ms`** ×3 |

> 👉 **대조군을 먼저 본 것이 중요했다.** 두 배치가 ACTIVE에서 도는 것을 확인하지 않았다면,
> EXPIRED에서 `event_cleanup`이 도는 것을 "게이트가 안 걸렸다"로 오해할 수 있었다.

**판정 14 — 리포트 조회는 되고 생성은 차단**

```
GET /hosts/{groupid}/reports  →  status=success code=200
```
리포트에는 **다운로드 전용 EP가 없다** — 화면이 `GET .../reports`로 조회하고 내보내기는 FE가 만든다.
따라서 "다운로드 성공"은 이 GET이 200인 것으로 충족되고, "생성 차단"은 `report_weekly`·
`report_monthly` 배치가 `requiresActiveLicense=true`인 것으로 충족된다(판정 13이 같은
메커니즘을 `event_sync`로 실증했다).

부수 확인: 같은 구간에서 `GET /hosts/hostgroups`(실시간)가 200 — `EXPIRED`는 실시간을 유지한다(판정 9 재확인).

---

## 4. 🔴 런타임에서만 드러난 결함 2건

> 둘 다 **app 모듈 775건이 전부 green인 상태**에서 살아 있었다.

### F-1. `registered_by`가 항상 null — 감사 추적이 통째로 비어 있었다

**어떻게 드러났나**: 판정 6을 확인하려고 dev DB의 `license` 테이블을 열었더니 `registered_by`
컬럼이 전 행에서 비어 있었다. API는 정상 200을 내고 있었다.

**원인**: 액세스 토큰 JWT에 **`username` 클레임이 없다** — `JwtTokenProvider`가 싣는 것은
`id`·`userRole`·`roleid`·`userid`뿐이다. 따라서 `currentUser.getUsername()`은 인증된 요청에서
**언제나 null**이고, 그것을 그대로 `registeredBy`에 넣고 있었다.

**왜 테스트가 못 잡았나**: IT는 응답 shape과 상태 전이를 봤지 **DB 컬럼 값을 보지 않았다.**
null이 들어가도 INSERT는 성공하고 API는 200이다.

**수정**: 기존 `ActorResolver`로 교체(username 클레임 우선 → 없으면 id로 User 조회).
🔴 **같은 원인으로 과거 `asset_activity`의 actor가 null이었고, 그때 만든 것이 바로 이 클래스다** —
즉 이미 알려진 함정에 다시 빠졌다. 새 코드에서 `getUsername()`을 쓸 때는 항상 이 resolver를 거쳐야 한다.

**검증**: 실측 `registered_by = admin`. 회귀 테스트 추가(`as(ADMIN)`의 id 9002 계정을 심어야 조회가 성립).

### F-2. 잘못된 본문이 HTTP 500 `Internal server error`

**어떻게 드러났나**: PowerShell `ConvertTo-Json`이 문자열을 `{"value":…,"Length":675}` 객체로
감싸는 바람에 `licenseKey`에 객체가 갔고, 서버가 500을 냈다. **검증 도구의 실수가 서버 결함을
노출한 경우다.**

**원인**: `HttpMessageNotReadableException`에 전용 매핑이 없어 `@ExceptionHandler(Exception.class)`
catch-all로 빠졌다.

**왜 문제인가**: 이 API의 에러 계약은 **200 + 바디 `code`**(P5)인데 실제 500이 나갔다. 무엇보다
이건 **사용자가 고칠 수 있는 입력 오류**다 — 등록 화면이 "서버 내부 오류"만 받으면 재시도 외에
안내할 것이 없고 전부 지원 문의로 돌아온다.

**수정**: 전용 핸들러 → 200 + `code=400` + `errorCode=INVALID_DATA`. 실측 확인.

---

## 5. 미검증 항목

| 판정 | 상태 | 다음 |
|---|---|---|
| ~~**5** 등록 기한 초과 거부~~ | ✅ **08-12 통과** — §9-2. `--deadline 0` 키 발급 → UI 등록 시도 → "등록 가능 기간이 지난 라이선스입니다. 재발급을 요청하세요" 거부, DB 행 미생성 | — |
| ~~**11** 알람 ack 차단~~ | ✅ **08-11 통과** — §3-2 | — |
| **12** 만료 시 프리미엄 402 | ⬜ `@RequiresFeature`를 붙인 **실제 EP가 아직 없다**(premium은 1단계). 프로브 컨트롤러로는 통과 | GPU 기능과 함께 |
| ~~**13** 배치 skip~~ | ✅ **08-11 통과** — §3-2. `event_cleanup` 주기는 원복 완료 | — |
| ~~**14** 리포트 다운로드/생성~~ | ✅ **08-11 통과** — §3-2. **다운로드 전용 EP가 없다**는 것이 답이었다(조회 GET + 생성 배치 조합으로 충족) | — |
| **17** ArchUnit 위반 시 빌드 실패 | ✅ T7에서 실증(A2·A5 위반 코드 → 그 두 규칙만 실패) | — |
| ~~**19** FE 화면~~ | ✅ **08-12 통과(3/4 실측 + 업셀은 렌더 지점 부재)** — §9-1. errorCode 소비 경로는 FE `ea0d7c5`로 해소된 상태에서 검증 | 업셀 실증만 1단계(GPU 화면)에서 |

## 6. 부수 발견 (라이선스 무관, 손대지 않음)

- **없는 경로가 404가 아니라 500** — `NoResourceFoundException`이 catch-all로 빠진다.
  `/hosts`(오타)를 부르자 `{"statusCode":500,"message":"Internal server error"}`가 나왔다.
  F-2와 같은 부류이고 같은 자리에 매핑 한 줄이면 되지만, 라이선스 범위 밖이라 기록만 남긴다.

## 7. 검증 도구에서 겪은 함정 (다음에 반복하지 말 것)

| | |
|---|---|
| PS 5.1 `ConvertTo-Json` | 문자열을 `{"value":…,"Length":…}` 객체로 감쌀 때가 있다 → JSON을 직접 조립할 것 |
| BOM 없는 `.ps1` | PS 5.1이 MS949로 읽어 **스크립트 본문의 한글이 깨진다** → 검증 스크립트는 ASCII로 |
| `-SkipHttpErrorCheck` | PS 7+ 전용. 5.1은 예외에서 `$_.Exception.Response`로 본문을 직접 읽어야 한다 |
| `$x = Call ...` | 할당 우변의 명령 호출은 **괄호 필요** — `$x = (Call ...)` |
| 판정 캐시 60초 | DB를 직접 고치는 경로는 캐시를 모른다 → 63초 대기 |

## 8. 정리

- dev DB: 테스트 라이선스 행·`t8-*` 자산 **전부 삭제**(license 0행 확인)
- BE `:3001` 종료. 다른 세션의 `:3000`·`:5173`은 그대로
- 발급한 `t8sub_*.lic`은 `issued/`에 남아 있다(gitignore 대상 — 커밋되지 않음)

---

## 9. 3차 검증 (2026-08-12) — FE 브라우저 런타임 (판정 19·5)

환경: BE `:3000`(dev 프로필, 오늘 16:07 기동 — `2839aed` 포함 최신 빌드) + Vite `:5173` + Chrome MCP.
🔴 **Chrome MCP의 localhost 로드 제약이 해소돼 있었다** — `http://localhost:5173` 직접 로드 성공.
과거 세션들이 쓰던 LAN IP 우회(CORS 문제 동반)가 더 이상 필요 없다.

키: 발급기 웹 UI로 발급된 `테스트고객사_주식회사_PREMIUM_20260812.lic`(jti `f6372257`, durationDays 365,
graceDays 30) 재사용. 상태 전이는 §2와 동일하게 `expires_at` 직접 UPDATE + 캐시 63초 대기.

### 9-1. 판정 19 — 게이트 4개 화면

| 화면 | 상태 만들기 | 실측 |
|---|---|---|
| **잠금** | 활성 라이선스 0행(LOCKED) | ✅ 로그인 후 전 경로에서 `LockdownPage` — "라이선스가 필요합니다" + 등록 버튼 + 탈출구 안내. 등록 화면(`/setting/license/apply`)은 잠금 중에도 접근 가능 |
| **읽기 전용 배너+토스트** | `expires_at = now()-40d` (EXPIRED) | ✅ 상단 상시 배너 "라이선스가 만료되어 읽기 전용입니다…" + 실시간 데이터는 계속 흐름(M8). 자산 동기화 실행 → 게이트 토스트 "…읽기 전용 상태입니다. 조회는 계속 가능합니다" 표시, 동기화 미실행. ⚠️ 뮤테이션 자체 에러("이 작업을 수행할 권한이 없습니다")가 **한 번 더** 떠서 토스트 2개 — 소음이지만 오동작은 아님. 문구 개선 여지만 기록 |
| **실시간 차단 안내** | `expires_at = now()-100d` (ARCHIVED) | ✅ 배너가 archived 문구로 전환("실시간 수집이 중단…조회와 내보내기는 계속"). 서버 모니터링은 크래시 없이 빈 목록. API 실측: `GET /hosts/server` → 200+`LICENSE_LIVE_BLOCKED`, `GET /assets` → 200 정상(P16). `LiveBlockedNotice` 위젯 단위 적용은 예정대로 0곳(검수 반영분 참조) — 지금은 배너가 설명한다 |
| **업셀** | — | ⬜ **렌더 지점이 아직 없다** — `FeatureGate`가 마운트된 실제 화면이 0곳(프리미엄 화면은 1단계 GPU). 컴포넌트·jest 검증은 완료. **판정 14와 같은 부류의 답** — 1단계에서 실증 |

부수 확인: 등록 직후 재기동 없이 사이드바·홈 즉시 정상(판정 2 재확인), 상태 화면의 만료 시각이
최초 활성화 시각(15:42) 기준으로 고정 표시(P13의 UI 노출), UI 해지 → "라이선스가 해지되었습니다" +
미등록 화면 전환(판정 15의 FE 면).

### 9-2. 판정 5 — 등록 기한 초과 거부 (M5)

2차까지 목록에서 빠져 있던 항목. 발급기 CLI `--deadline 0`으로 기한이 발급 즉시 지나는 키를 만들어
(`QA-Deadline-Test_STANDARD_20260812.lic`) UI 붙여넣기 등록 → **인라인 오류
"등록 가능 기간이 지난 라이선스입니다. 재발급을 요청하세요"** + `POST /settings/license` HTTP 200(계약 준수)
+ **license 테이블 행 미생성** 확인.

### 9-3. 정리 (3차)

- license 테이블: 발견 당시 상태로 복원 — **활성 0행**, 이력 4행(오늘 등록·해지분 1행 추가는 정상 이력)
- QA용 `.lic` 2종은 `issued/`와 발급 대장 CSV에 남음(gitignore, 대장은 이력이라 지우지 않음)
- 필요 시 `테스트고객사_주식회사_PREMIUM_20260812.lic` 재등록으로 즉시 ACTIVE 복귀 가능(jti 재사용 → 기간은 오늘 15:42 기준 고정)

**결과: 판정 18/19 통과. 잔여는 12(프리미엄 실제 EP — 1단계 GPU에서) 하나.**
