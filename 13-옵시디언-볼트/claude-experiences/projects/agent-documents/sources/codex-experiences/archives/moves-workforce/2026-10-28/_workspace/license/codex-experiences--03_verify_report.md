# 03 검증 리포트 — Forge 라이선스 enforcement

> 검증자: integration-verifier
> 검증일: 2026-06-24
> 기준 문서: `라이선스_정책_구현.md` (단일 진실 원천), `_workspace/license/00_input/requirement.md`
> 방법론: 경계면 양쪽 동시 읽기(생산자/소비자 교차 비교) + 실행 검증(jest/build)

## 종합 판정

**전 항목 통과.** 4개 진입점 판정 규칙 일관성, i18n 경계면, manifest, LicenseGuard self-query, App 게이팅 순서 모두 정합. asApp 사용은 메모리 정책의 명시적 예외(스케줄 배치)에 정확히 해당하여 **정책 위반 아님**. 백엔드 jest 84개 전부 통과, 프론트 빌드 성공.

검증 환경 주의: PowerShell/Bash 툴이 native 명령(node)의 stderr 경고를 NativeCommandError로 감싸 `EXIT=1`처럼 보이게 만드는 아티팩트가 있었음. `cmd /c`로 실제 종료코드를 재측정해 **빌드/merge 실제 성공(exit 0)**을 확정함(아래 6.2 참조).

---

## 1. 판정 규칙 일관성 (4개 진입점) — 통과

"`active === false`(또는 license 존재 && active!==true)일 때만 차단, `undefined`/`null` 통과" 규칙을 라인 단위로 교차 비교.

| 진입점 | 파일:라인 | 판정 코드 | undefined 처리 | null 처리 | 판정 |
|--------|----------|----------|---------------|----------|------|
| resolver 래퍼 | `src/utils/ResponseWrapper.js:9` | `if (license && license.active !== true) throw` | license=undefined → 통과 | — | 통과 |
| 프론트 store | `static/ui/src/stores/useLicenseStore.js:26` | `license ? license.active === true : true` | license=undefined → isLicensed=true 통과 | — | 통과 |
| LicenseGuard | `src/utils/license/LicenseGuard.js:78` | `return active === false` | active=null(data 없음)→ false(통과) | null → 통과 | 통과 |
| App 분기 | `static/ui/src/App.jsx:63` | `if (!isLicensed) return <LicenseGuidePage/>` | store가 안전 계산한 값 사용 | — | 통과 |

핵심 확인: **느슨한 `!license.active` 검사가 한 곳도 없음.** 모든 진입점이 `=== false` / `!== true` + 객체 존재 가드 패턴을 사용하여 `undefined`(로컬 tunnel·무료·미등록)를 차단하지 않음 → 로컬 개발 보호 요구사항 충족.

미묘한 비대칭(문제 아님, 기록용): ResponseWrapper는 `active !== true`(license 객체 존재 시 active가 null/undefined면 차단), store는 `active === true`(null이면 통과). 두 곳의 입력 도메인이 다름 — resolver는 `req.context.license`(Atlassian이 내려줄 때 active는 boolean 보장), store는 `context.license`(동일). production에서 license 객체가 존재하면서 active가 boolean이 아닌 케이스는 발생하지 않으므로 런타임 불일치 없음. LicenseGuard만 License API 응답이라 `null`(data 없음)을 명시 통과 처리 — 의도대로.

---

## 2. i18n 경계면 — 통과

| 검증 | 위치 | 결과 |
|------|------|------|
| 소스 키 존재(kr) | `locales/kr/license.json` | `guide.title/description/action` 존재 |
| 소스 키 존재(en) | `locales/en/license.json` | `guide.title/description/action` 존재 |
| merge 반영(ko) | `locales/ko-KR.json:457-463` | `"license": { "guide": { title/description/action } }` 반영됨 |
| merge 반영(en) | `locales/en-US.json:456-460` | 동일 반영됨 |
| 소비 경로 | `LicenseGuidePage.jsx:16-25` | `t("license.guide.title")` / `.description` / `.action` |

merge.js 동작 확인: `merge.js:21-22`가 파일명을 네임스페이스로 prefix(`license.json` → `license` 네임스페이스). 따라서 소스의 `{ guide: {...} }` → 산출물 `license.guide.*` 경로로 정확히 매핑. 소비 코드 `t("license.guide.title")`와 **완전 일치**. `ko-KR.json`/`en-US.json`은 직접 수정이 아니라 merge 산출물(규칙 준수). `locales/script/*.json` 빈 스텁에 키를 넣은 흔적 없음.

---

## 3. manifest 정합성 — 통과

| 검증 | 위치 | 결과 |
|------|------|------|
| `app.licensing.enabled: true` 존재 | `manifest.yml:74-75` | 존재 — 라이선스가 실제로 내려옴(중대 결함 아님) |
| `displayConditions.appIsLicensed` 제거 | `manifest.yml` 전체 | grep 결과 매치 0건 — 제거됨(가이드 페이지 노출 가능) |

`licensing.enabled`가 없었다면 license 객체가 아예 안 내려와 전 기능이 무의미했을 것 — 존재 확인됨.

---

## 4. LicenseGuard self-query 정확성 — 통과

`src/utils/license/LicenseGuard.js` 라인별 검증:

| 항목 | 위치 | 검증 |
|------|------|------|
| route 태그 사용 | L6 `route\`/forge/app/v1/license\`` | plain string 아님 — @forge/api 7.x 요구 충족 |
| 호출 방식 | L20 `api.asApp().requestAtlassian(LICENSE_API_ROUTE, {...})` | self-query 엔드포인트 정확 |
| 응답 경로 | L35 `body?.results?.[0]?.data` | 문서 명세 `body.results[0].data.active`와 일치 |
| active 타입 가드 | L36 `if (!data \|\| typeof data.active !== 'boolean') return null` | data 없음/비boolean → null(통과) 폴백 정확 |
| KVS 단일 키 | L9 `CACHE_KEY = 'license-status-cache'` | 설치별 격리이므로 단일 키 타당 |
| TTL 1h | L10 `CACHE_TTL_MS = 60*60*1000`, L51 `Date.now()-checkedAt < TTL` | 만료 판정 정확 |
| 캐시 폴백 | L55,63 try/catch로 읽기/쓰기 실패 무시 후 원본 호출 | 캐시 장애가 차단으로 번지지 않음 |
| null 캐싱 | L53 주석대로 active=null도 캐싱 | 레이트리밋 보호 — 미적용 상태도 1h 캐시 |
| 차단 판정 | L78 `return active === false` | active=true/null 통과, false만 차단 |

호출처 정합: `portfolioSnapshot.js:10` `if (await isLicenseBlocked()) return {skipped}`, `consumer.js:14` `if (await isLicenseBlocked()) return` — 둘 다 **시작부 early-return/skip**. 비싼 작업 전에 가드 위치 정확. `src/index.js:30`에서 `runPortfolioSnapshot` re-export 확인(manifest `function.portfolioSnapshot → index.runPortfolioSnapshot` 매핑 정합).

---

## 5. 정책 점검(asApp) — 통과 (정책 위반 아님, 명시적 예외에 해당)

### 결론
LicenseGuard.js의 `api.asApp().requestAtlassian` 사용은 **정당한 예외**다. 정책 위반 아님. 대안 불필요.

### 근거
1. **메모리 정책 원문이 배치 예외를 명시적으로 허용함.** `feedback_no_asapp.md` (2026-06-11 확정):
   > "단 스케줄 배치는 예외 — 사용자 컨텍스트가 원천 부재라 asApp이 Forge 표준 패턴이고, asApp은 manifest 스코프를 바꾸지 않아 심사에 추가 부담이 없음(일일 배치는 asApp 허용)."

   LicenseGuard의 `isLicenseBlocked()` 호출처는 `portfolioSnapshot.js`(scheduledTrigger 일배치)와 `consumer.js`(queue consumer) — **둘 다 사용자 컨텍스트가 부재한 백그라운드 진입점**. 정확히 예외 범주에 해당.

2. **License self-query는 Jira 데이터 API가 아님.** 정책이 우려하는 대상은 "Jira API asApp 권한"(데이터 접근 심사). `/forge/app/v1/license`는 앱 자신의 라이선스 상태 조회로, Jira 사용자/이슈 데이터에 접근하지 않음 → 심사 민감도 영역 밖.

3. **코드베이스 선례·회귀 가드 존재.** `src/resolver/portfolioDashboard/PortfolioAggregator`가 이미 배치 경로에서 asApp을 사용하며, `PortfolioAggregatorAsApp.test.js`가 "스케줄 트리거는 asUser가 401(AUTH_TYPE_UNAVAILABLE)로 실패 → as:'app' 전달 검증"을 회귀 가드로 둠. LicenseGuard의 asApp은 이 확립된 패턴과 일관.

4. **공통 페치 모듈 기본값 불변.** `src/api/jira/util/RequestJiaJson.js`의 기본값은 `as:'user'`(L10,40). LicenseGuard는 공통 모듈을 오염시키지 않고 자체적으로 asApp을 직접 호출 — 정책의 "공통 모듈 기본값 불변, 배치 호출에만 app 전달" 적용 방식과 부합.

---

## 6. App.jsx 게이팅 안전성 + 실행 검증

### 6.1 게이팅 순서 — 통과
`App.jsx:55` 로딩 게이트: `if (isLoading || isLoadingPermission || isLoadingLicense) return <LoadingSpinner/>`.
- `isLoading`은 `useI18nStore`의 i18n 로딩 플래그(`useI18nStore.js:6` 초기 true → `init()` 완료 시 `t` 세팅 후 false, L8-12).
- 따라서 `isLoading===false`가 되는 시점에 `t`는 이미 함수(null 아님)임이 보장됨.
- `!isLicensed` 분기(L63)는 이 로딩 게이트 **이후**에 실행 → LicenseGuidePage가 `t("license.guide.*")`(LicenseGuidePage.jsx:16,17,25)를 호출하는 시점에 `t`는 항상 초기화 완료 상태. **렌더 순서 안전.**

### 6.2 백엔드 jest — 통과
```
Test Suites: 5 passed, 5 total
Tests:       84 passed, 84 total
Snapshots:   0 total
Time:        2.757 s
EXIT=0
```
문서 주장(84개 전부 통과, 회귀 없음)과 일치.

### 6.3 프론트 빌드 — 통과
`cmd /c "npm run build & echo BUILD_REAL_EXIT=%errorlevel%"` 실측:
```
The build folder is ready to be deployed.
BUILD_REAL_EXIT=0
```
prebuild(merge) 정상 실행 후 빌드 성공. 번들 크기 경고는 기존 사항(license 기능과 무관).

### 6.4 i18n merge 반영 실측 — 통과
`cmd /c "npm run merge ... echo CMD_EXIT=%errorlevel%"` → **CMD_EXIT=0**. `merge.js` 단독 `node` 실행도 exit 0. ko-KR.json:457 / en-US.json:456에 license 키 실재 확인(섹션 2).

> 환경 아티팩트 기록: PowerShell `$LASTEXITCODE` 및 Bash 래퍼에서 `npm run merge`/`npm run build`가 EXIT=1로 보였으나, 이는 merge.js가 stderr로 출력하는 `MODULE_TYPELESS_PACKAGE_JSON` 경고를 툴이 NativeCommandError로 감싸 종료코드를 오염시킨 결과. `cmd /c`로 재측정 시 실제 종료코드 0 확인. **실제 빌드/merge는 성공.** (참고: 이 경고는 `package.json`에 `"type":"module"` 추가로 제거 가능하나 license 기능 범위 밖 — 별건.)

---

## 미검증 항목 (production 한정 — 로컬 검증 불가, 솔직히 분류)

| 항목 | 사유 |
|------|------|
| license=false 실동작(가이드 페이지 실제 노출) | 로컬은 `license=undefined`라 항상 통과. Marketplace **license mocking**으로 active/false 토글해야 확인 가능 |
| License API 응답 shape(`body.results[0].data.active`) 실응답 | self-query는 production 설치에서만 실제 응답 — 코드 경로는 정확하나 실응답 미수신 |
| KVS 1h 캐시 만료/레이트리밋 동작 | production 설치 환경에서만 검증 가능 |
| resolver 차단 시 프론트 `{success:false, error:LICENSE_INACTIVE}` 소비 | license=false production에서만 트리거됨. 단 ResponseWrapper의 직렬화 shape(`{success:false, error:{name,code,message,cause}}`)은 기존 표준과 동일하므로 프론트 일반 에러 처리 경로로 흡수됨(코드상 정합) |

---

## 리더 액션 (수정 권고)

**필수 수정 없음.** 전 항목 통과. 아래는 선택적 개선(별건, license 기능 정상성과 무관):
- (선택) `package.json`에 `"type":"module"` 추가로 merge.js의 `MODULE_TYPELESS_PACKAGE_JSON` 경고 제거 → CI에서 stderr 노이즈 감소.
- (예정 과제, 문서 §7) 가이드 페이지 CTA URL을 `https://admin.atlassian.com`에서 실제 Marketplace 리스팅 주소로 교체.
- production 배포 후 license mocking으로 위 미검증 4항목 E2E 확인.
