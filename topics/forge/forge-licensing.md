---
type: topic
tags: [topic, forge, licensing, marketplace, billing]
created: 2026-06-22
updated: 2026-10-07
---

# Forge 앱 라이선스 — 정책과 코드 enforcement 패턴

> Marketplace 유료 앱의 라이선스를 코드에서 어떻게 강제하는가. [[moves-workforce]]에 적용한 패턴.

## 정책 핵심 (Atlassian)
- 라이선스는 **유료(paid) 앱 + production** 에서만 동작. `manifest.app.licensing.enabled: true` 로 "라이선스 대상" 선언.
- `context.license` (백엔드 resolver req.context / 프론트 `view.getContext()`)
  - **유료+production** 에서만 객체로 내려옴 → `license.active` (true/false)
  - **무료 / Marketplace 미등록 / custom 환경 / 로컬 tunnel** 에서는 `undefined`
- **enforcement는 앱 책임.** Atlassian은 active 여부만 알려줄 뿐, 코드에서 막지 않으면 미결제 인스턴스도 기능을 그대로 씀.
- 결제/평가판/grace 상태는 모두 `license.active` 한 플래그로 수렴 → 앱은 이 플래그만 신뢰하면 됨.

## ⚠️ 가장 큰 함정: `displayConditions.appIsLicensed: true`
- globalPage 모듈에 이걸 걸면 미라이선스 시 **페이지 자체가 안 뜸**(아이콘/메뉴에서 사라짐).
- 즉 "라이선스 없을 때 **가이드/구매 안내 페이지를 보여주고 싶다**"면 이 조건을 **빼야** 함.
  대신 인앱(React)에서 `context.license.active` 검사 → 가이드 페이지로 분기.
- 트레이드오프: displayCondition은 Atlassian이 UI를 숨겨주는 "공짜" 차단이지만 안내 화면을 못 띄움.

## 적용한 코드 패턴 (moves-workforce)
1. **백엔드 가드** (`src/utils/ResponseWrapper.js`): 모든 resolver가 거치는 공통 래퍼 한 곳에서
   `req.context.license` 가 **존재하고 active!==true 일 때만** throw(`LICENSE_INACTIVE`).
   → `license===undefined`(무료/개발)는 통과시켜야 로컬 tunnel 개발이 안 깨짐. **이게 핵심 조건.**
2. **프론트 분기** (`stores/useLicenseStore.js` + `App.jsx`): `view.getContext()`로 license 로드,
   `isLicensed = license ? license.active===true : true`. `!isLicensed` 면 `LicenseGuidePage` 렌더.
3. **가이드 페이지** (`pages/license/LicenseGuidePage.jsx`): `@atlaskit/empty-state` + `LockClosedImage.png`
   (기존 NoPermissionPage와 동일 패턴) + `router.open(admin.atlassian.com)` 버튼.
4. **i18n**: `locales/kr|en/license.json` 추가 → `npm run merge` (파일명=네임스페이스 `license.*`). → [[forge-i18n]]
5. **manifest**: globalPage의 `displayConditions.appIsLicensed` 제거, `app.licensing.enabled: true` 유지.

## 백그라운드 진입점 가드 (License API + KVS 캐싱)
scheduledTrigger / queue consumer는 responseWrapper를 안 거치고 `context.license`도 없음 → **License API**로 직접 확인.
- 호출: `api.asApp().requestAtlassian(route\`/forge/app/v1/license\`, {method:'GET'})` — **인자는 route 태그 필수**(plain string 불가, @forge/api 7.x). self-query면 호출 앱 자신.
- 응답: `body.results[0].data.active` (boolean). 무료/미등록이면 data 없음 → null 취급(통과).
- 캐싱: **KVS는 설치별로 격리**되므로 단일 키(`license-status-cache`)면 충분. TTL 1h. 값에 `checkedAt`(ms) 넣고 `Date.now()`로 만료 판정(앱 런타임에선 Date.now() 정상). 레이트리밋: 설치당 5분 1회/테넌트 분당 10회 → 1h 캐싱으로 여유.
- 가드 헬퍼 `src/utils/license/LicenseGuard.js` → `isLicenseBlocked()`: `active===false`일 때만 true(차단). 적용처: `portfolioSnapshot`(일집계), `uploadUsers`(큐) 시작부에서 early-return.
- **runMigration은 일부러 미가드** — 스키마 생성은 멱등·저비용이고, 막으면 라이선스 활성화 직후 테이블이 최대 1h 늦게 생겨 깨질 위험. enforcement는 "비싼 작업/데이터 노출"에만, 멱등 셋업엔 X.

## 2026-10 추가 — 승인 앱 두 판에 이식하며 확인한 것
- **가드 코드가 있어도 `app.licensing.enabled` 가 없으면 무료 앱이다.** `context.license` 자체가 오지 않아 production 에서 전부 UNAVAILABLE(통과). Confluence·Jira 승인 앱 둘 다 이 상태로 두 달 있었다. manifest 계약 테스트(`app.licensing.enabled === true`, UI 모듈에 `appIsLicensed` 없음)로 고정. → [[2026-10-07-confluence-paid-license-sentry]] · [[2026-10-07-paid-license-gate]]
- **서버 판정으로 화면 판정을 뒤집는 경로**를 둔다. 화면이 UNAVAILABLE 로 통과시켰어도 서버가 License API 로 INACTIVE 를 확정하면 `invoke` 래퍼가 `LICENSE_INACTIVE` 코드를 보고 store 를 `markInactive` → 엔트리 전체가 안내 화면. 화면 하나만 에러 봉투로 끝나지 않는다.
- 멀티 엔트리 Custom UI 는 게이트를 **공용 mount/Providers 한 곳**에 두고 variant(전체 안내 / 모달 / 매크로용 한 줄)로 모양만 가른다. 매크로에 EmptyState 를 그리면 문서가 밀려 사용자가 앱 오류로 읽는다.
- 라이선스는 dev/staging 에서 검증 불가(NOT_APPLICABLE). 실측은 production 리스팅 뒤 Marketplace 라이선스 토글로만.

## 남은 고려 / 테스트
- 테스트: 로컬은 license=undefined라 production에서만 실검증. Marketplace의 license mocking으로 active/false 토글.
- backend jest 84개 통과 확인.

## 관련
- [[moves-workforce]] · [[moves-workforce-overview]] · [[forge-i18n]] · [[forge-migration-lifecycle]]
