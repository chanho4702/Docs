# 라이선스 UX 고도화 v2 — 프론트엔드 구현 리포트

> 작성: frontend-engineer
> 작성일: 2026-06-24
> 기반 설계(단일 진실 원천): `_workspace/license/01_architect_design_v2.md`
> 범위: 프론트엔드 전용(백엔드/manifest/DB 불변). resolver 신규 없음 → invoke 신규 호출 없음.

---

## 1. 변경/추가 파일 목록

| 구분 | 파일 | 변경 내용 |
|------|------|----------|
| 수정 | `static/ui/src/stores/useLicenseStore.js` | `trialBanner` state 추가 + 평가판 판정 순수함수 4종(export) 추가 + `loadLicense` 확장. **진단 console.log 3개 제거**(catch는 통과 로직 유지, console.error 삭제) |
| 신규 | `static/ui/src/pages/license/TrialExpiryBanner.jsx` | 평가판 만료 임박 배너(자기 완결형, store 구독) |
| 수정 | `static/ui/src/pages/license/licenseConstants.js` | `trialDismissKey(endDate)` 헬퍼 추가(기존 `MARKETPLACE_URL` 유지) |
| 수정 | `static/ui/src/App.jsx` | `TrialExpiryBanner` import + `<AppLayout>` 첫 자식으로 삽입 |
| 불변 | `static/ui/src/pages/license/LicenseGuidePage.jsx` | 코드 변경 없음. 이미 `MARKETPLACE_URL` 소비 중이고 `MANAGE_APPS_URL` 로컬 상수 부재. 문구 개선은 i18n에서 처리됨 |
| 불변 | `static/ui/src/layout/AppLayout.jsx` | 설계대로 미변경(배너는 App.jsx children으로 삽입) |
| 수정 | `locales/kr/license.json` | `banner.*` 추가 + `guide.*` 문구 갱신 |
| 수정 | `locales/en/license.json` | `banner.*` 추가 + `guide.*` 문구 갱신 |
| 생성(merge) | `locales/ko-KR.json`, `locales/en-US.json` | `npm run merge` 산출물(직접 수정 안 함) |

---

## 2. 최종 useLicenseStore state shape (글자 그대로)

```js
{
    isLoading: true,        // boolean — 로딩 중 여부(기존 유지)
    isLicensed: true,       // boolean — v1 게이팅값(기존 유지, 불변). 기본 허용
    trialBanner: null,      // { show: boolean, daysLeft: number, endDate: string } | null
    _loaded: false,         // boolean — 내부 플래그(기존 유지)
    _loading: false,        // boolean — 내부 플래그(기존 유지)
    loadLicense: async () => {...},  // 액션(확장)
}
```

성공 분기 set:
```js
set({ isLicensed, trialBanner, isLoading: false, _loaded: true, _loading: false });
```
catch 분기 set(getContext 실패 → 통과, 배너 미노출):
```js
set({ isLicensed: true, trialBanner: null, isLoading: false, _loaded: false, _loading: false });
```

export된 순수 함수(jest 대상화): `isEvaluation`, `pickEndDate`, `diffDaysFromToday`, `computeTrialBanner`.

- `isEvaluation(license)` = `license?.isEvaluation === true`
- `pickEndDate(license)` = `evaluationEndDate || subscriptionEndDate || trialEndDate || null` (설계 후보 순서대로, `supportEntitlementNumber`는 날짜 아니므로 제외)
- `diffDaysFromToday(endDate)` = `dayjs(endDate)` `isValid()` false면 `null`, 유효하면 `startOf('day').diff(today.startOf('day'),'day')`
- `endDate`는 store가 받은 **원본 문자열 그대로** `trialBanner.endDate`에 보존(localStorage 키에 사용)

---

## 3. 배너 노출 판정 — `computeTrialBanner(license)` 처리표 (설계 5케이스 + 방어 케이스)

| # | 입력(license) | isLicensed | trialBanner | 배너 노출 |
|---|---------------|-----------|-------------|----------|
| 1 | `undefined`/`null` (무료·미등록·로컬) | `true` | `null` | 미노출(v1 개발 보호) |
| 2 | `{ active: false }` | `false` | `null` | 미노출 → **가이드 페이지** 분기(배너 아님) |
| 3 | `{ active: true, isEvaluation: false }` (비평가판/유료 구독) | `true` | `null` | 미노출 |
| 4 | `{ active: true, isEvaluation: true, *EndDate: 'D' }` 만료 7일 이내(0≤daysLeft≤7) | `true` | `{ show:true, daysLeft, endDate:'D' }` | **노출** |
| 5 | `{ active: true, isEvaluation: true, *EndDate: 'D' }` 만료 8일+ (daysLeft>7) | `true` | `null` | 미노출(여유) |
| 6 (방어) | 평가판이나 만료일 필드 부재(`pickEndDate→null`) | `true` | `null` | 미노출 |
| 7 (방어) | 평가판이나 endDate 파싱 불가(`isValid()=false`) | `true` | `null` | 미노출 |
| 8 (방어) | 평가판 + 이미 만료(daysLeft<0) | `true` | `null` | 미노출(곧 active=false 전환) |

v1 불변식 전부 유지: undefined→통과·배너 없음 / active=false→가이드(배너 아님) / active=true+평가판+7일이내→배너.

배너 컴포넌트 내부 추가 게이트(§2-B):
```
if (!trialBanner || !trialBanner.show) return null
if (dismissed로컬state) return null
if (localStorage[trialDismissKey(endDate)] === '1') return null
```

---

## 4. localStorage 키 네이밍

- 헬퍼: `licenseConstants.js`의 `trialDismissKey(endDate)` → **`license.trialBanner.dismissed.<endDate>`**
  - 예: `license.trialBanner.dismissed.2026-07-01`
- 닫기 시: `localStorage.setItem(trialDismissKey(endDate), '1')` + 로컬 `useState(true)`로 즉시 숨김
- **endDate를 키에 포함**하므로 평가판 연장/갱신으로 endDate가 바뀌면 새 키가 되어 배너 재노출(요구사항 핵심)
- `window.localStorage?.` 옵셔널 체이닝 + try/catch로 접근 실패 방어(실패 시 세션 한정 숨김 폴백)

---

## 5. i18n 추가 키 + merge 반영

추가/수정 위치: `locales/kr/license.json`, `locales/en/license.json` (직접 수정 금지인 ko-KR/en-US는 merge로만 생성).

| 키 | kr | en |
|----|-----|-----|
| `license.banner.message` | `무료 평가판이 {days}일 후 만료됩니다. 계속 사용하려면 라이선스를 구매하세요.` | `Your free trial expires in {days} day(s). Purchase a license to keep using the app.` |
| `license.banner.cta` | `라이선스 구매` | `Buy a license` |
| `license.banner.dismiss` | `닫기` | `Dismiss` |
| `license.guide.description`(수정) | Marketplace 흐름 문구로 갱신 | 동일 |
| `license.guide.action`(수정) | `Marketplace에서 구매 / 평가판 시작` | `Buy / start trial on Marketplace` |

- `{days}` 동적 보간은 **`tFormat(t, 'license.banner.message', { days: daysLeft })`** 로 처리(Forge `t()`는 보간 미지원 — `t(key,{days})` 쓰면 `{days}` 그대로 노출됨, 설계 §4.4). 정적 키(`cta`/`dismiss`/`guide.*`)는 `t(key)`.
- **merge 반영 여부: 반영됨.** `cd static/ui && npm run merge` 실행 후 `locales/ko-KR.json`·`locales/en-US.json`의 `license.banner.*`/`license.guide.action` 값이 위 표대로 들어간 것을 확인.

---

## 6. invoke 소비 shape

- **신규 invoke 없음.** 라이선스 상태는 `view.getContext().license`(client context)에서 직접 읽으며 resolver 왕복 없음(설계 §5: context 경로로 충분, 백엔드 불변).
- 따라서 `result.content` 접근 경로 검증 대상 없음(integration-verifier 교차비교는 백엔드 무변경 확인만).

---

## 7. UI 라이브러리 / 컴포넌트 결정

- 배너: `@atlaskit/banner`(v14.0.26 설치 확인) `appearance="warning"`. 이 버전은 닫기/CTA props가 없어 children에 message/CTA/닫기 직접 배치(설계 §4.3 제약 반영).
- 아이콘: 프로젝트 선례(`Sidebar.jsx`)가 `@atlaskit/icon/core/*` 경로 사용 → `@atlaskit/icon/core/warning`(배너 icon), `@atlaskit/icon/core/cross`(닫기 버튼 iconBefore). core 경로에 두 아이콘 모두 존재 확인.
- 닫기 버튼: `@atlaskit/button/new` + `iconBefore={CrossIcon}`(프로젝트 선례 패턴: 컴포넌트 참조 직접 전달) + `aria-label`.
- CTA: `router.open(MARKETPLACE_URL)`(`@forge/bridge`). URL 하드코딩 0건 — 가이드/배너 둘 다 `licenseConstants.MARKETPLACE_URL` 단일 상수 소비.

---

## 8. 빌드 결과

- `cd static/ui && npm run merge` → 성공(ko-KR/en-US에 `license.banner.*` 반영 확인).
- `cd static/ui && npm run build` → **성공("The build folder is ready to be deployed.")**.
  - 경고는 "Compiled with warnings"이나, 전부 node_modules의 source map 누락(`@atlaskit/analytics-next-stable-react-context`, `marklassian`) — 기존부터 존재하는 무해한 경고. **내가 추가/수정한 코드 관련 에러·경고 0건.**
  - 번들 크기 경고도 기존부터 존재(앱 규모 특성).

---

## 9. production 한정 미검증 항목 (솔직히 분류)

- **실제 평가판 context 필드 수신**: `context.license`의 `isEvaluation`/`evaluationEndDate`/`subscriptionEndDate`/`trialEndDate` 실값은 **production 유료앱에서만** 내려온다. 로컬/tunnel은 `license === undefined`라 배너 경로가 실제 실값으로 동작하는지 E2E 불가.
  - 단, `computeTrialBanner`/`pickEndDate`/`diffDaysFromToday`는 순수 함수라 jest로 5케이스+방어 케이스 단위 검증 가능(integration-verifier 인계).
- **실제 필드명 가정**: 설계의 후보 필드명(`isEvaluation`, `*EndDate`)은 Atlassian context.license 표준 가정. production에서 필드명이 다르거나 context에 평가판 필드가 전혀 없으면 설계 §5의 보수적 fallback(`getLicenseStatus` resolver 신설 = v2.1)이 필요. **현 구현은 context 경로 전제로, 필드 부재 시 안전하게 배너 미노출(케이스 6)로 폴백**하므로 회귀 위험은 없음.

---

## 10. 설계서 §7 frontend 체크리스트 대조

- [x] `licenseConstants.js`: `MARKETPLACE_URL`(기존 유지) + `trialDismissKey` 추가
- [x] `useLicenseStore.js`: `trialBanner: null` 추가, 순수함수 4종 export, loadLicense 성공/catch 분기에 trialBanner 포함, dayjs import, **진단 console.log 3개 제거**
- [x] `TrialExpiryBanner.jsx` 신규: store 구독 + localStorage dismiss 게이트 + 로컬 state, banner(warning) children 배치, tFormat 보간, router.open(MARKETPLACE_URL)
- [x] `LicenseGuidePage.jsx`: MARKETPLACE_URL 이미 적용(MANAGE_APPS_URL 부재), 문구는 i18n 갱신
- [x] `App.jsx`: TrialExpiryBanner import + AppLayout 첫 자식 삽입
- [x] i18n: banner.* 추가 + guide.* 갱신 + `npm run merge` 반영
- [x] 빌드 확인: 성공
