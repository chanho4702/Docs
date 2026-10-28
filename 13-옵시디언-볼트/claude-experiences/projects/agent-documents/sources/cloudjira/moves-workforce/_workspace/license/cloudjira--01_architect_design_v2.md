# 라이선스 UX 고도화 v2 설계서 — 가이드 페이지 개선 + 평가판 만료 배너

> 작성: feature-architect
> 작성일: 2026-06-24
> 기반: v1 라이선스 enforcement(완료·검증 통과, `03_verify_report.md`) 위 UX 고도화
> 단일 진실 원천(정책): 루트 `라이선스_정책_구현.md`
> 입력 요구사항: `_workspace/license/00_input/requirement_v2_guide_enhance.md`

---

## 1. 개요 / 영향 범위

이번 v2는 **프론트엔드 전용**이다. 백엔드/manifest/DB는 불변(근거는 §5).

| 축 | 신규/수정 | 대상 |
|----|----------|------|
| 프론트(스토어) | 수정 | `static/ui/src/stores/useLicenseStore.js` — license context 필드 캡처 + 배너 노출 판정값 추가 |
| 프론트(컴포넌트) | 신규 | `static/ui/src/pages/license/TrialExpiryBanner.jsx` — 평가판 만료 임박 배너 |
| 프론트(상수) | 신규 | `static/ui/src/pages/license/licenseConstants.js` — `MARKETPLACE_URL` 단일 상수 + localStorage 키 헬퍼 |
| 프론트(페이지) | 수정 | `static/ui/src/pages/license/LicenseGuidePage.jsx` — CTA URL 상수화 + 문구/구조 개선 |
| 프론트(렌더 트리) | 수정 | `static/ui/src/App.jsx` — 배너를 AppLayout 위(MemoryRouter 내부)에 삽입 |
| 프론트(레이아웃) | 불변 | `static/ui/src/layout/AppLayout.jsx` — 변경하지 않음(배너는 App.jsx에서 children 위에 형제로 렌더, 근거 §4.3) |
| i18n | 수정 | `locales/kr/license.json` + `locales/en/license.json` — `banner.*` 키 추가, `guide.*` 개선 |
| 백엔드 | **불변** | resolver/LicenseGuard/manifest 변경 없음 |
| DB | **불변** | MySQL/KVS 변경 없음 |

---

## 2. 경계면 계약 (가장 중요)

이 v2는 resolver 신규가 없으므로, 경계면 계약은 **(A) license context → store state shape**, **(B) store → 배너 컴포넌트 props/판정**, **(C) i18n 키**, **(D) CTA URL 상수 위치** 4가지다. frontend 엔지니어는 아래 표를 글자 그대로 구현한다.

### 2-A. useLicenseStore 노출 state shape (확정 계약 — 글자 그대로)

| state 키 | 타입 | 의미 | 기본값(초기/undefined) |
|---------|------|------|----------------------|
| `isLoading` | `boolean` | 로딩 중 여부 (기존 유지) | `true` |
| `isLicensed` | `boolean` | v1 게이팅값 (기존 유지, 불변) | `true` |
| `trialBanner` | `{ show: boolean, daysLeft: number, endDate: string } \| null` | 평가판 만료 배너 판정 결과. **노출 조건 충족 시에만 객체, 그 외 `null`** | `null` |
| `_loaded` | `boolean` | 내부 플래그 (기존 유지) | `false` |
| `_loading` | `boolean` | 내부 플래그 (기존 유지) | `false` |
| `loadLicense` | `() => Promise<void>` | 기존 액션 (확장) | — |

> 핵심 불변식:
> - `license === undefined`(무료·미등록·로컬) → `isLicensed=true`, `trialBanner=null` (모든 안내 미노출, v1 개발 보호 유지)
> - `license.active === false` → `isLicensed=false`, `trialBanner=null` (가이드 페이지 분기, 배너 아님)
> - `license.active === true` && 평가판 && 만료 7일 이내 → `isLicensed=true`, `trialBanner={ show:true, daysLeft, endDate }`
> - `license.active === true` && (비평가판 OR 만료 8일+ OR 만료일 파싱 불가) → `isLicensed=true`, `trialBanner=null`

#### `trialBanner` 산출 알고리즘 (방어적 — 글자 그대로)

```
function computeTrialBanner(license):
    if (!license) return null                      // undefined/null → 미노출
    if (license.active !== true) return null        // active=false 는 가이드 페이지 담당
    if (isEvaluation(license) !== true) return null // 평가판 아니면 미노출

    endDate = pickEndDate(license)                 // 만료일 후보 방어적 탐색
    if (!endDate) return null                       // 만료일 없으면 미노출(로컬/필드 부재)

    daysLeft = diffDaysFromToday(endDate)          // 0..N (음수면 이미 만료)
    if (daysLeft < 0) return null                   // 이미 만료 → active=false 로 곧 전환되므로 배너 미노출
    if (daysLeft > 7) return null                   // 7일 초과 → 미노출

    return { show: true, daysLeft, endDate }
```

방어적 헬퍼 규약(license context 필드는 production에서만 실값, 로컬 undefined):

| 헬퍼 | 규칙 |
|------|------|
| `isEvaluation(license)` | `license.isEvaluation === true` 우선. (Atlassian context.license의 표준 필드명은 `isEvaluation`) |
| `pickEndDate(license)` | 후보를 **순서대로** 탐색해 첫 truthy 값 채택: `license.evaluationEndDate` → `license.subscriptionEndDate` → `license.trialEndDate` → `license.supportEntitlementNumber` 제외(날짜 아님). 모두 없으면 `null` |
| `diffDaysFromToday(endDate)` | `dayjs(endDate)` 파싱. `isValid()` false면 `null` 반환(→ 배너 미노출). 유효하면 `dayjs(endDate).startOf('day').diff(dayjs().startOf('day'), 'day')` |

- `endDate` 문자열은 store가 받은 **원본 문자열을 그대로** `trialBanner.endDate`에 보존한다(localStorage 닫기 키에 사용 — §2-B). 표시용 포맷은 배너 컴포넌트가 별도로 한다.
- `dayjs`는 프로젝트 기존 의존성(CLAUDE.md 명시)이므로 신규 설치 불필요.

### 2-B. store → TrialExpiryBanner 경계 (props + 노출/닫기 판정)

`TrialExpiryBanner`는 **자기 완결형**: store의 `trialBanner`를 구독해 스스로 노출 여부를 판단한다(App.jsx는 항상 렌더하되 컴포넌트 내부에서 `null` 반환). props 불필요(store 직접 구독). 만약 frontend가 props 주입형을 선호하면 아래 props 계약을 따른다(둘 중 store 구독형을 1순위 권장).

| props (선택적 주입형일 때) | 타입 | 출처 |
|----------|------|------|
| `daysLeft` | `number` | `trialBanner.daysLeft` |
| `endDate` | `string` | `trialBanner.endDate` |

#### 노출 게이트 (배너 컴포넌트 내부)

```
const trialBanner = useLicenseStore(s => s.trialBanner)
if (!trialBanner || !trialBanner.show) return null
const dismissed = localStorage.getItem(dismissKey(trialBanner.endDate))
if (dismissed === '1') return null
// → 렌더
```

#### 닫기(dismiss) 동작 + localStorage 키 계약 (글자 그대로)

- 키 헬퍼: `dismissKey(endDate)` → **`license.trialBanner.dismissed.<endDate>`**
  - 예: `license.trialBanner.dismissed.2026-07-01` (endDate가 ISO datetime이면 그 문자열 전체를 그대로 접미)
  - **만료일을 키에 포함**하므로, 평가판이 연장/갱신되어 endDate가 바뀌면 새 키가 되어 배너가 다시 노출된다(요구사항 핵심).
- 닫기 시: `localStorage.setItem(dismissKey(endDate), '1')` 후 컴포넌트 로컬 state로 즉시 숨김(리렌더).
- 구현 위치: 키 헬퍼는 `licenseConstants.js`에 `export const trialDismissKey = (endDate) => \`license.trialBanner.dismissed.${endDate}\`` 로 둔다.

### 2-C. i18n 키 계약 (네임스페이스 `license.*`)

§6 참조. 동적 값(남은 일수)은 **`tFormat` 헬퍼**로 보간한다(§4.4 — Forge `t()`는 보간 미지원).

### 2-D. CTA URL 상수 위치 계약 (단일 진실)

| 항목 | 값 |
|------|-----|
| 파일 | `static/ui/src/pages/license/licenseConstants.js` (신규) |
| 상수명 | `export const MARKETPLACE_URL = "<<MARKETPLACE_URL>>";` |
| 미수령 시 | 플레이스홀더 문자열 `"https://marketplace.atlassian.com/apps/MARKETPLACE_URL"` 를 두고 **리더가 실제 리스팅 주소로 1곳만 치환** |
| 소비처 | `LicenseGuidePage.jsx`(CTA), `TrialExpiryBanner.jsx`(CTA) — **둘 다 이 상수 import**, URL 하드코딩 금지 |
| 기존 `MANAGE_APPS_URL` | `LicenseGuidePage.jsx` 내 로컬 상수 `https://admin.atlassian.com` 는 **`MARKETPLACE_URL`로 대체·삭제** |

---

## 3. 백엔드 설계

**변경 없음.** 근거는 §5(백엔드 영향 판정). resolver/Controller/Service/LicenseGuard/ErrorCodes/manifest 모두 불변.

---

## 4. 프론트엔드 설계

### 4.1 컴포넌트/렌더 트리 변경

```
App.jsx
 ├─ (로딩 게이트: isLoading || isLoadingPermission || isLoadingLicense)  ← 기존 유지
 ├─ if (!isLicensed) return <LicenseGuidePage/>                          ← 기존 유지(개선만)
 └─ return (
      <MemoryRouter>
        {toast.FlagUI}
        <JobPollingManager .../>
        <AppLayout>
          <TrialExpiryBanner />     ← 신규. AppLayout children 최상단(사이드바 우측 main 영역 최상단)
          <Routes> ... </Routes>
        </AppLayout>
      </MemoryRouter>
    )
```

### 4.2 useLicenseStore 확장 (수정)

- `loadLicense` 내부에서 `license = context?.license` 캡처 직후 `isLicensed` 계산은 **기존 로직 그대로 유지**(`license ? license.active === true : true`).
- 그 다음 `trialBanner = computeTrialBanner(license)` 를 계산해 `set({ isLicensed, trialBanner, isLoading:false, _loaded:true, _loading:false })`.
- catch 블록(getContext 실패): `set({ isLicensed:true, trialBanner:null, ... })` — 배너도 미노출(개발 보호 일관).
- 진단용 `console.log`는 v1에 "검증 후 제거" 주석이 달려 있으나 **이번 범위에서 손대지 않는다**(별건). 단 신규 추가하지 않는다.
- `computeTrialBanner`/`isEvaluation`/`pickEndDate`/`diffDaysFromToday`는 store 파일 내부 모듈 스코프 순수 함수로 둔다(단위 테스트 용이, export 하여 jest 대상화 권장: `export const computeTrialBanner`).

### 4.3 TrialExpiryBanner 컴포넌트 (신규)

- 위치: `static/ui/src/pages/license/TrialExpiryBanner.jsx`
- **삽입 위치 결정: App.jsx의 AppLayout children 최상단** (AppLayout.jsx는 수정하지 않음).
  - 근거: AppLayout은 location 기반 단순 레이아웃이며 모든 라우트가 통과하는 지점. App.jsx에서 `<AppLayout>` 첫 자식으로 배너를 넣으면 `<main>` 영역 최상단(사이드바 우측, 콘텐츠 위)에 전폭으로 노출된다. AppLayout 시그니처를 바꾸지 않아 회귀 위험이 가장 작다.
- Atlaskit 컴포넌트 선택: **`@atlaskit/banner`** (설치됨 v14.0.26).
  - ⚠ **중요 제약**: 이 버전의 `Banner`는 props가 `appearance`('warning'|'error'|'announcement') / `children` / `icon` / `testId` 뿐이다. **닫기 버튼·액션 영역을 제공하지 않는다.** 따라서 CTA 버튼과 닫기(X) 버튼은 `children` 내부에 직접 배치한다.
  - `appearance="warning"` 사용(만료 임박 경고 톤).
  - `icon`: `@atlaskit/icon` 의 경고 아이콘(예: `@atlaskit/icon/glyph/warning` 또는 `@atlaskit/icon/core/warning`) 1개. 기존 코드에 아이콘 사용 선례가 있으면 그 import 경로를 따른다.
- children 구조(권장 레이아웃):
  ```
  <span>{ tFormat(t, 'license.banner.message', { days: daysLeft }) }</span>
  <Button appearance="link" spacing="compact" onClick={() => router.open(MARKETPLACE_URL)}>
     { t('license.banner.cta') }
  </Button>
  <Button appearance="subtle" spacing="compact" onClick={handleDismiss}
          aria-label={ t('license.banner.dismiss') }>
     ✕ (또는 @atlaskit/icon CrossIcon)
  </Button>
  ```
  - `router.open`은 `@forge/bridge`에서 import(LicenseGuidePage와 동일 패턴).
  - `handleDismiss`: `localStorage.setItem(trialDismissKey(endDate), '1')` + 로컬 `useState(false)`로 숨김.
- 노출 게이트는 §2-B의 코드 그대로.
- `daysLeft === 0` 케이스: "오늘 만료" 문구가 자연스럽도록 i18n에서 처리(§6, `message`가 `{days}`를 받되 0도 허용). 별도 분기 불필요.

### 4.4 i18n 보간 (필수 패턴)

- **프로젝트 규약 확인 완료**: `static/ui/src/utils/i18n.js` 의 `tFormat(t, key, vars)` 헬퍼가 표준이다. Forge `i18n.createTranslationFunction()`의 `t(key, defaultValue)`는 **보간을 지원하지 않으며**, `t(key, {days})`를 넘기면 `{days}` 토큰이 그대로 화면에 노출된다.
- 따라서 남은 일수 보간은 반드시 `import { tFormat } from '../../utils/i18n'` 후 `tFormat(t, 'license.banner.message', { days: daysLeft })` 로 한다. 정적 키(`cta`, `dismiss`, `guide.*`)는 `t(key)` 그대로.

### 4.5 LicenseGuidePage 고도화 (수정 — 과한 재설계 금지)

- 구조: 기존 `@atlaskit/empty-state` + `LockClosedImage.png` **유지**.
- 변경점:
  1. 로컬 상수 `MANAGE_APPS_URL` 삭제 → `import { MARKETPLACE_URL } from './licenseConstants'` 후 `router.open(MARKETPLACE_URL)`.
  2. (선택, i18n 문구 개선) `guide.description`/`guide.action`을 Marketplace 구매 흐름에 맞게 다듬는다(§6). EmptyState 구조·이미지는 그대로.
- secondaryAction 등 신규 UI 추가는 하지 않는다(요구사항: 과한 재설계 금지).

### 4.6 권한 체크

- 배너/가이드는 라이선스 상태 기반이므로 `usePermissionStore` 권한 체크 **불필요**. 모든 사용자에게 동일 노출(라이선스는 인스턴스 단위).

### 4.7 쿼리키 / Zustand

- React Query 신규 쿼리 없음 → `queryKey/` 팩토리 추가 없음.
- Zustand는 `useLicenseStore`에 `trialBanner` state만 추가(§2-A). 신규 store 없음.

---

## 5. 백엔드 영향 판정 (불변 근거)

- **license context 필드는 프론트에서 전부 접근 가능.** 정책 문서(`라이선스_정책_구현.md` §1)와 v1 store가 이미 `view.getContext().license`로 license 객체를 받는다. 평가판 필드(`isEvaluation`, `*EndDate`)는 동일 객체에 포함되어 내려오므로 **resolver 추가 불필요**.
- 배너 노출 판정은 순수 클라이언트 계산(만료일 − 오늘)이라 서버 왕복 불요.
- 따라서 백엔드/manifest/DB 모두 불변. **신규 resolver 함수 없음.**
- (가정 명시) 만약 production에서 `context.license`에 평가판 필드가 전혀 내려오지 않음이 확인되면, 그때 한해 LicenseGuard의 self-query 응답(`body.results[0].data`)에 평가판 필드가 있는지 조사 후 resolver(`getLicenseStatus`)를 추가하는 별도 v2.1이 필요하다. **현 설계는 context 경로로 충분하다는 보수적 전제**로 진행(요구사항 §경계면 주의와 일치). 이 경우 추가될 계약(참고용, 이번엔 구현 안 함):
  - `getLicenseStatus` / 입력 `{}` / 응답 `{ success, content: { active, isEvaluation, endDate } }` / 훅 `useLicenseStore.loadLicense` 내 invoke 대체.

---

## 6. i18n 키 목록

`locales/kr/license.json` / `locales/en/license.json` 의 `license` 네임스페이스(파일명=네임스페이스). 추가/수정분만 표기. 추가 후 `cd static/ui && npm run merge` 필수.

### 신규 `banner.*`

| 키 | kr | en | 비고 |
|----|-----|-----|------|
| `banner.message` | `무료 평가판이 {days}일 후 만료됩니다. 계속 사용하려면 라이선스를 구매하세요.` | `Your free trial expires in {days} day(s). Purchase a license to keep using the app.` | `{days}` 는 `tFormat`로 보간 |
| `banner.cta` | `라이선스 구매` | `Buy a license` | CTA 버튼 |
| `banner.dismiss` | `닫기` | `Dismiss` | 닫기 버튼 aria-label |

> `{days}` = 0 일 때도 위 문구로 노출된다("0일 후 만료" / "in 0 day(s)"). 자연스러움 우려 시 frontend가 daysLeft===0이면 별도 키(`banner.messageToday`)를 쓰도록 분기해도 좋으나 **선택**. 기본은 단일 `message` 키.

### 수정 `guide.*` (문구 개선 — 구조 불변)

| 키 | kr (개선안) | en (개선안) |
|----|------------|------------|
| `guide.title` | (유지) `라이선스가 필요합니다` | (유지) `A license is required` |
| `guide.description` | `Moves Workforce를 사용하려면 유효한 라이선스가 필요합니다. 아래 버튼에서 Atlassian Marketplace를 통해 무료 평가판을 시작하거나 라이선스를 구매한 뒤 다시 시도해 주세요.` | `Moves Workforce requires a valid license. Use the button below to start a free trial or purchase a license on the Atlassian Marketplace, then try again.` | 
| `guide.action` | `Marketplace에서 구매 / 평가판 시작` | `Buy / start trial on Marketplace` | CTA가 Marketplace로 가므로 라벨 정합 |

> 파일 실제 구조는 최상위가 `{ "guide": {...} }` 이므로(현재 파일), 추가는 `{ "guide": {...}, "banner": {...} }` 형태. merge 시 `license` 네임스페이스 하위로 `license.guide.*`, `license.banner.*` 생성됨(검증 리포트 §2가 merge 동작 확인).

---

## 7. 구현 작업 분해

### frontend 체크리스트

1. **`static/ui/src/pages/license/licenseConstants.js` 신규**
   - `export const MARKETPLACE_URL = "https://marketplace.atlassian.com/apps/MARKETPLACE_URL";` (리더 치환 대상)
   - `export const trialDismissKey = (endDate) => \`license.trialBanner.dismissed.${endDate}\`;`
2. **`useLicenseStore.js` 확장**
   - `trialBanner: null` 초기 state 추가
   - 모듈 스코프 순수 함수 `computeTrialBanner` / `isEvaluation` / `pickEndDate` / `diffDaysFromToday` 추가(jest 위해 `export`)
   - `loadLicense` 성공 분기에서 `trialBanner` 계산 후 `set` 에 포함
   - catch 분기에서 `trialBanner: null` 포함
   - `dayjs` import
3. **`TrialExpiryBanner.jsx` 신규**
   - store `trialBanner` 구독 + localStorage dismiss 게이트 + 로컬 dismiss state
   - `@atlaskit/banner`(appearance="warning") children에 message/CTA/닫기 배치
   - `tFormat(t,'license.banner.message',{days})`, `router.open(MARKETPLACE_URL)`
4. **`LicenseGuidePage.jsx` 수정**
   - `MANAGE_APPS_URL` 삭제 → `MARKETPLACE_URL` import·사용
   - (i18n 문구는 §6대로 locales에서 갱신, 컴포넌트 코드 구조는 그대로)
5. **`App.jsx` 수정**
   - `import TrialExpiryBanner` 후 `<AppLayout>` 첫 자식으로 `<TrialExpiryBanner />` 삽입
6. **i18n**
   - `locales/kr/license.json` / `locales/en/license.json` 에 `banner.*` 추가 + `guide.*` 문구 갱신
   - `cd static/ui && npm run merge` 실행 → `ko-KR.json`/`en-US.json` 반영 확인(직접 수정 금지)
7. **빌드 확인**: `cd static/ui && npm run build` (prebuild merge 포함, 회귀 없음)

### backend 체크리스트

- **없음**(불변). integration-verifier는 백엔드 무변경을 확인만 한다.

### 검증 포인트(integration-verifier 인계용)

- `computeTrialBanner` 5케이스 단위: undefined / active=false / active=true·비평가판 / 평가판·임박(daysLeft≤7) / 평가판·여유(daysLeft>7). 추가로 endDate 파싱 불가, daysLeft<0(이미 만료) 케이스.
- dismiss 키에 endDate 포함 → endDate 변경 시 재노출 확인(키 문자열 단위 검증).
- `LicenseGuidePage`/`TrialExpiryBanner` 둘 다 `MARKETPLACE_URL` 단일 상수 소비(하드코딩 URL 0건 grep).
- 배너 메시지가 `tFormat` 경로로 보간(직접 `t(key,{days})` 사용 금지 — `{days}` 노출 회귀 방지).
- i18n `banner.*` merge 반영 + 소비 키 일치.
- production 한정 미검증: 실제 평가판 context 필드 수신(`isEvaluation`/`*EndDate` 실값) — 로컬 undefined라 E2E 불가, 솔직히 분류.

---

## 부록: 핵심 설계 결정 요약

- **배너 컴포넌트 = `@atlaskit/banner`**(설치됨), 단 닫기/CTA는 props 없음 → `children`에 직접 배치(이 버전 제약, 설계에 반영).
- **삽입 위치 = App.jsx의 AppLayout 첫 자식**(AppLayout.jsx 무변경 — 회귀 최소).
- **보간 = `tFormat` 필수**(Forge t()는 보간 미지원, 프로젝트 표준 헬퍼 존재).
- **닫기 기억 = localStorage 키에 endDate 포함**(`license.trialBanner.dismissed.<endDate>`) → 갱신 시 재노출.
- **CTA URL = 단일 상수 `licenseConstants.MARKETPLACE_URL`** (가이드+배너 공유, 리더 1곳 치환).
- **백엔드 불변**(context 경로로 충분, 보수적 전제 명시).
