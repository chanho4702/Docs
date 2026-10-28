---
tags:
  - moveseye
  - audit
  - security
  - follow-up
updated: 2026-08-05
status: 후속 조치 진행 중 · 2026-08-05 코드 교차검증 완료(하단 섹션)
---

# MovesEye 구현 위험 감사 — 후속 작업 메모 (2026-08-03)

상위: [[projects/moveseye/moveseye|moveseye]] · 관련: [[projects/moveseye/2026-07-16-auth-hardening|2026-07-16-auth-hardening]] · [[projects/moveseye/2026-07-29-scheduler-and-licensing|2026-07-29-scheduler-and-licensing]]

> Obsidian 경험 노트와 `_workspace` 설계·계약 문서를 현재 Spring BE·React FE 구현과 교차검증한 결과. 사용자가 “나중에 처리”하기로 했으므로 아래 순서대로 재개한다.

## 한 줄 결론

기능 구현량은 충분하지만, 운영 배포 전 **권한 경계·로컬 계정 인증·FE 오류 전달**을 먼저 막아야 한다. 수집 엔진 Prometheus와 PREMIUM 라이선스는 결함이 아니라 명시적 보류/미구현 범위다.

## 우선순위

1. **P0 — 관리자 권한 체계 단일화**
   - `RolesInterceptor`는 `@RolesGuarded` 없는 controller의 `@Roles`를 무시해 `SettingController`·`UserController`가 fail-open.
   - `@RolesGuarded`가 있으면 enum 이름과 숫자 Zabbix `roleid`를 비교해 정상 관리자도 fail-closed 가능.
   - `AdminAccessChecker(userRole)` 중심으로 통일하고 설정·사용자·역할·그룹 endpoint 권한 계약 테스트를 추가한다.
   - 설정 응답에서 password를 제거하고, DB 평문 JSONB 대신 Vault 참조 또는 암호화 저장을 검토한다.

2. **P1 — MovesEye 전용 계정 인증 수정**
   - `createInZabbix=false` 계정은 `zabbix_userid=null`인데 `JwtAuthFilter`가 ADMIN 외 모든 계정을 Redis/Zabbix token 경로로 보낸다.
   - 로컬 USER/SUPER_ADMIN의 로그인→보호 API→refresh→logout E2E를 추가한다.

3. **P1 — FE의 HTTP 200 오류 envelope 공통 처리**
   - BE는 다수 비즈니스 오류를 HTTP 200 + `ApiResult(status=ERROR)`로 반환한다.
   - `useDmoveQuery`는 status/code 확인 없이 data만 꺼내므로 오류가 빈 화면으로 숨을 수 있다(105개 파일 사용).
   - 공통 unwrap/reject 정책을 만들되 raw CSV/blob endpoint는 예외로 둔다.

4. **P1 — 비용 비동기 업로드 계약 완결**
   - BE의 영속 job 접수(jobId) + 상태 조회 계약과 V18 migration은 완료했다.
   - `_workspace/contract_asset-cost.md`에 확정 계약과 Claude 측 `R-6`을 남겼다. FE polling/완료 리포트 → functional QA가 남았다.
   - 진행 중에는 고정 크기 카운터만 저장해 누적 results JSONB의 O(n²) 재기록을 제거했다.
   - queued → running 조건부 UPDATE로 원자적 claim하여 다중 인스턴스 중복 실행을 막았다.

5. **P1 — 스케줄러 신뢰성**
   - `runNow` 동기 HTTP 실행을 job 접수형으로 바꾼다.
   - `UserSchedule`·`ReportSchedule`이 예외를 삼켜 false-green 성공 로그가 생기는 문제를 해소한다.
   - JVM 로컬 `volatile boolean` 대신 원자적/분산 실행 잠금을 검토한다.

6. **P1 — 테스트 안전망**
   - BE `gradlew test`는 성공했지만 `@SpringBootTest`·`@DataJpaTest`·Testcontainers 계열 통합 테스트가 0건이다.
   - 자산 생성 `custom_properties NOT NULL` 장애처럼 mock 테스트가 놓치는 DB/Flyway/Security 회귀를 최소 smoke suite로 덮는다.
   - FE `tsc --noEmit`은 통과했지만 전체 Jest는 `import.meta.env` CommonJS 해석 실패 후 timeout — Jest 환경을 복구한다.

## Claude 계약서 항목 상태

- `A-1 POST /assets HTTP 500`: `customProperties=null` INSERT가 원인. 생성 시 `[]` 정규화 후 실제 dev DB 최소 본문 HTTP 200 확인 완료.
- `R-1 날짜 파서`: 월·일 한 자리와 구분자 주변 공백 허용. 단위·실제 CSV 업로드 모두 확인 완료.
- `R-2 non-multipart 500`: `consumes` 제한 제거 후 실제 JSON 요청이 HTTP 200 + body `COST_UPLOAD_EMPTY`로 수렴함.
- `R-5 비동기 업로드`: BE/V18/계약/런타임 검증 완료. FE는 계약서 `R-6` polling 연동 대기.
- `R-3/R-4`: FE 문구는 이미 포괄적이라 BE 코드 유지, 계약 문구 결함은 정정 완료.

## 의도적 보류 — 결함으로 세지 않음

- 수집 엔진 Phase 1 스텝 0~5 완료. Prometheus 스텝 6은 사용자 결정으로 보류.
- 라이선스/에디션은 설계만 완료, 구현 0. PREMIUM 출시 범위가 잡힐 때 별도 착수.
- Geo Map 배포 전 자산 동기화 1회는 데이터 준비 절차.

## 재개 체크리스트

> ⚠️ 이 체크리스트는 2026-08-05 교차검증으로 **순서가 재배치**됐다. 아래 §2026-08-05 재배치본을 따른다.

- [ ] 권한 endpoint 목록과 기대 역할 표 작성
- [ ] 권한·설정 비밀값 P0 수정 및 보안 통합 테스트
- [ ] 로컬 계정 인증 E2E
- [ ] FE envelope 오류 공통화
- [x] 비용 비동기 업로드 FE 연동(`R-6`) — 2026-08-03 완료(`acbff73`). 이후 검수 F-1~F-6 중 **F-2만 미완**(미커밋 워킹트리)
- [ ] 스케줄러 실패 전파·중복 실행 방지
- [ ] BE DB 통합 테스트 ~~와 FE Jest 복구~~ — **FE Jest는 정상이다(오진, 아래 참조). BE 통합 테스트만 남는다**
- [ ] 운영 Vault `JWT_SECRET` 교체 및 브라우저 인증 E2E 확인

## 감사 시점 검증

- BE: 전체 `gradlew test` 성공.
- FE: `tsc --noEmit` 성공.
- FE Jest: `axiosInstance.ts`의 `import.meta.env`를 해석하지 못해 전체 suite 미완료.
- 감사 도중 BE 비용 업로드 관련 미커밋 작업트리가 변경됐으므로, 재개 시 `git status`와 최신 계약서를 먼저 다시 확인한다.

## 2026-08-03 후속 검증 기록

- Spring 전체 테스트 720건 통과 후 비동기 claim 보강 대상 테스트를 재실행해 통과했다.
- dev PostgreSQL/Flyway V18에서 최소 자산 생성, non-multipart 오류, CSV 접수·polling·완료 결과·날짜 정규화를 실제 API로 확인했다.
- 런타임 probe 자산과 job은 정확한 ID로 삭제했고 임시 포트 3001 프로세스도 종료했다.
- BE↔FE 정적 검증에서 기존 FE가 동기 완료 응답을 기대해 현재 계약과 치명적으로 어긋남을 확인했다. Claude는 `R-6` 처리 전까지 비용 업로드 UI를 완료된 것으로 간주하면 안 된다.

## 2026-08-03 비동기 업로드 독립 검수 교훈

- **GET 서비스의 언랩 깊이는 hook까지 한 경로로 검증한다.** `useDmoveQuery`가 envelope의 `data`를 꺼내는 구조에서 service GET이 먼저 payload를 꺼내면 실제 hook data가 `undefined`가 된다. service 단위 테스트와 hook을 통째로 mock한 modal 테스트가 모두 green이어도 런타임은 무한 처리 중이 될 수 있다. `QueryClientProvider + 실제 hook + API envelope mock` 경계 테스트가 필요하다.
- **다중 인스턴스 startup recovery는 전역 `running` sweep이면 안 된다.** 새 instance가 다른 살아 있는 instance의 작업을 중단 처리한다. claim owner와 lease/heartbeat를 두고 stale lease만 회수하며, terminal 전이도 기대 상태 조건부 UPDATE로 단방향을 강제한다.
- **`null` 계약은 controller 직렬화 결과로 고정한다.** `ApiResult`의 `NON_NULL` 때문에 Java의 `success(null)`은 JSON `data:null`이 아니라 `data` 생략이 된다. service mock이 아니라 MVC JSON 테스트로 nullable/생략 규약을 확인한다.
- 관련 검수 정본: `C:\solutions\_workspace\review_bulk-upload-async.md` F-1~F-6. 판정은 🔴 2건 해소 전 수정 후 재검수.

## 2026-08-05 교차검증 (Claude) — 이 감사에 대한 평가

위 감사의 주장을 현재 코드로 하나씩 대조했다. **7개 중 6개 참, 1개 거짓.** 심각도는 오히려 과소평가돼 있었다.

### 검증 결과

| 주장 | 판정 | 근거 |
|---|---|---|
| `RolesInterceptor` fail-open | ✅ 참 | `RolesInterceptor.java:31` — `@RolesGuarded` 없는 클래스는 `@Roles`를 무시하고 `return true` |
| enum 이름 vs 숫자 roleid 비교 | ✅ 참 | 같은 파일 `:52`. 클래스 주석이 "의도와 다르게 동작할 수 있으나 동작 보존"이라고 명시 |
| 설정 응답 password 노출 | ✅ 참 | `SettingResponseDto`가 `value` Map 통째 반환 + `ZabbixInfoDto:32`가 평문 `put("password", …)` |
| 로컬 계정 인증 | ✅ 참 | `JwtAuthFilter:98`이 `userRole == ADMIN`만 분기 → 나머지는 `:134` `TOKEN_EXPIRED` 401 |
| FE envelope | ✅ 참 | `useDmoveQuery.ts`가 `envelope?.data`만 꺼내고 `status`/`code` 미확인(105파일 사용) |
| BE 통합 테스트 0건 | ✅ 참 | `@SpringBootTest`/`@DataJpaTest`/Testcontainers 0건 |
| **FE Jest가 `import.meta.env`로 timeout** | ❌ **거짓** | `npx jest` 실행 결과 **95 suite / 814 test 전부 통과(203초)**. 존재하지 않는 작업을 체크리스트에 올렸다 |

### 🔴 감사가 못 본 것 1 — 두 결함이 곱해져 권한 상승이 된다

감사는 "fail-open"과 "password 노출"을 별개 불릿으로 나열했다. 실제로는 하나의 체인이다:

```
SettingController: @Roles(SUPER_ADMIN) 선언 O · @RolesGuarded X · AdminAccessChecker 미사용
  → 인증된 아무 USER나 GET /settings/zabbix
  → SettingResponseDto가 value Map 통째 반환
  → Zabbix 관리자 ID/PW 평문 획득
  → POST /settings/zabbix 도 열려 있어 Zabbix URL 변조까지 가능
```

`UserController`도 같은 상태다(`@Roles(SUPER_ADMIN)` 15개 이상이 전부 무효 → 역할 생성·삭제, 사용자 그룹 CRUD 무방비).
**"권한 경계 문제"가 아니라 인증만 통과하면 관리자 자격증명을 가져갈 수 있는 상태다.**

### 🔴 감사가 못 본 것 2 — 어노테이션과 효력이 정확히 엇갈려 있다

| 컨트롤러 | `@RolesGuarded` | `@Roles` | `AdminAccessChecker` |
|---|---|---|---|
| AssetController | O | **0** | 6 |
| CostController | O | **0** | 6 |
| HostManageController | O | **0** | 10 |
| **SettingController** | **X** | 클래스 1 | **0** |
| **UserController** | **X** | **15+** | **0** |

마커가 있는 곳엔 검사할 `@Roles`가 없고, `@Roles`가 있는 곳엔 마커가 없다.
**인터셉터는 사실상 죽은 코드이고 실제 권한은 전부 `AdminAccessChecker`가 지고 있다.**
감사의 "AdminAccessChecker 중심 통일" 방향은 맞으나, **이미 사실상 그렇고 두 컨트롤러만 낙오한 것** — 작업량 인식이 다르다.

### 🔴 감사가 못 본 것 3 — 수정 순서 함정

`SettingController`에 **`@RolesGuarded`만 붙이면 안 된다.** 붙이는 순간 두 번째 결함(enum 이름 vs 숫자 roleid)이 발동해
정상 관리자까지 403이 된다 — **fail-open이 fail-closed로 바뀔 뿐이다.**
→ 두 컨트롤러에 `AdminAccessChecker.requireAdmin()`을 **직접 넣고**, 인터셉터 정리는 그다음.

### 순서 뒤집힘

"테스트 안전망"이 P1-6인데, 감사가 요구하는 **권한 계약 테스트를 쓰려면 `@SpringBootTest` 인프라가 먼저** 있어야 한다. 6번이 1번의 선행 조건이다.
또 P0/P1 라벨이 6개 중 5개가 P1이라 변별력이 없다.

### 감사가 안 다룬 영역 — 확인해보니 이미 갖춰져 있다

`JWT_SECRET` 폴백 없음(`${JWT_SECRET}`, 미설정 시 기동 실패) · CORS 화이트리스트(`SecurityConfig:81`) · `AuthRateLimiter` 존재 · BCrypt(2b, cost 10).
**커버리지 누락이 아니라 이미 된 것을 안 적은 것.**

### 재배치본 (이 순서를 따른다)

1. ✅ **BE 최소 통합 smoke suite** (`@SpringBootTest` + Flyway + Security) — 2·3의 그릇 · **2026-08-05 완료**(아래)
2. **P0 권한** — `SettingController`·`UserController`에 `requireAdmin` **직접 주입**(마커 추가 금지)
3. **설정 비밀값** — 응답 마스킹 + 평문 JSONB 저장 방식 재검토
4. 로컬 계정 인증 E2E / FE envelope 공통화 / 스케줄러 실패 전파
5. ~~Jest 환경 복구~~ **삭제(오진)**

## 2026-08-05 재배치본 1번 완료 — 통합 테스트 인프라

`IntegrationTestSupport` + IT 3클래스 신설. **전체 670건 통과, skip 0** (기존 단위 테스트 무손상).

| IT | 건수 | 무엇을 지키나 |
|---|---|---|
| `FlywayMigrationSmokeIT` | 4 | **빈 DB에 V1~V19 전량 적용**. 기존 IT는 `flyway.enabled=false`라 마이그레이션을 아무도 검증하지 않았다. 버전 번호를 박지 않고 *리소스 파일 수 == 적용 수*로 비교해 V20이 늘어도 테스트를 안 고친다 |
| `AssetCreateSmokeIT` | 3 | A-1(`custom_properties NOT NULL` 500) 회귀 + 한글 UTF-8 왕복. mock repository에는 제약조건이 없어 단위 테스트로는 못 잡는 부류 |
| `AuthorizationContractIT` | 5 | **P0 수정의 안전망.** 아래 참조 |

**DB는 도커 dev 컨테이너(5433) 안에 `moveseye_it`를 매 실행 drop&create.** 빈 DB 검증과 dev 무오염을 동시에 만족한다.
Testcontainers는 시도했다가 **철회** — 이 환경(Windows + Docker Desktop, Engine 29.1.3)에서 docker-java가 `/info` 협상에 실패(HTTP 400)해 도커가 멀쩡한데도 "없음"으로 판정된다. 1.19.8→1.21.3 승격·`DOCKER_HOST`·`DOCKER_API_VERSION=1.44`를 다 줘도 동일.

### 🔴 P0가 런타임으로 실증됐다

`settingsAreCurrentlyOpenToAnyAuthenticatedUser`가 **green이다** — 즉 일반 `USER`가 `GET /settings/zabbix`를 성공 조회한다.
정적 분석 추론이 아니라 실제 요청으로 확인된 사실이다. 이제 P0 수정은 **이 테스트를 빨갛게 만드는 작업**이 됐다.

같은 클래스가 수정 시 실수를 막는 대조군도 함께 고정한다:
- `adminCheckedEndpointRejectsUser` — `AdminAccessChecker`로 막은 곳은 USER를 실제 거부(200 + code 403)
- `adminWithoutRoleidIsNotBlocked` — **`@RolesGuarded`만 붙이는 수정을 잡는다.** 그렇게 고치면 roleid=null인 정상 관리자가 막혀 2026-06-23 사이드바 사고가 재발하는데, 이 테스트가 그때 실패한다
- `nonAdminWithoutZabbixTokenIsRejected` — **P1도 실증**. Redis에 Zabbix 토큰이 없는 비-ADMIN은 유효한 JWT로도 401

### 이 작업에서 얻은 교훈

- **통합 테스트의 진짜 비용은 "인증을 어떻게 태우느냐"에 있다.** 이 앱에서만 세 겹이 걸렸다: ① 체인이 `STATELESS`라 `authentication()` post-processor가 무효(실제 JWT 쿠키만 통한다) ② `x-visitor-id`는 헤더만으로 부족하고 **Redis 세션 값과 대조**된다 ③ Redis의 Zabbix 토큰은 `토큰:?:만료초` **3부분**이라 2부분 대역은 만료 0으로 읽혀 재발급 경로로 샌다. 셋 다 코드를 읽기 전에는 알 수 없고, 증상은 전부 똑같은 `401 INVALID_TOKEN`이었다.
- **"고쳐야 할 현재 상태"를 green 테스트로 박아두는 게 유효하다**(characterization test). 결함을 문서가 아니라 실행 가능한 형태로 남기면, 고쳤는지 여부를 사람이 판단하지 않아도 된다.
- **`gradlew clean`이 파일 잠금으로 실패하면 그 상태를 방치하면 안 된다.** 잠긴 jar를 반쯤 지운 채 실패해서, 이후 `engine-api` 클래스 누락으로 컴파일이 깨졌다. 원인은 종료되지 않은 테스트 JVM이었다.

별건: 비용 업로드 검수 **F-2가 미커밋 워킹트리**로 남아 있다(heartbeat lease + `V19__cost_bulk_upload_job_heartbeat.sql`). 이걸 먼저 내려놓고 위로 들어간다.
🔴 V19를 heartbeat이 선점하므로 **자산 비용 M2 예산 테이블은 V20, Cloud는 V21로 밀린다**(COLLAB 인수인계 메모의 V19/V20 표기는 낡음).

### 이 검증에서 얻은 교훈

- **감사 노트의 "환경이 깨졌다"류 주장은 재현부터 한다.** 러너 하나 잘못 고르면 없는 작업이 체크리스트에 올라가고, 그게 실제 작업(BE 통합 테스트)과 한 줄에 묶여 둘 다 미뤄진다.
- **개별 결함 목록은 위험도를 과소평가한다.** 결함 A와 B가 각각 🟡여도 A→B가 이어지면 🔴이다. 감사 결과는 나열이 아니라 **경로로** 읽어야 한다.
- **어노테이션 존재는 효력의 증거가 아니다.** `@Roles` 15개가 붙은 컨트롤러가 완전 무방비일 수 있다. 권한은 선언이 아니라 **집행 지점**에서 센다.
