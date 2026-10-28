# T1 구현·검증

정식 구독은 subscriptionEndDate, 평가판은 evaluationEndDate/trialEndDate를 우선한다. active가 true이고 현지 날짜 기준 0~7일이면 경고하며, 8일 이상·과거 날짜·파싱 실패·INACTIVE는 배너를 만들지 않는다. 기존 INACTIVE 차단 경계는 유지한다. 날짜 판정 함수는 now 주입을 지원한다.

공통 mount의 trialBanner 기본값을 true로 바꿔 worklog·issue·settings·inbox·modal·projectSettings 엔트리에 표시한다. 제공자 지정 여부를 조회하지 않으므로 문구에 조건을 명시했다. 만료일+현지 날짜로 닫기를 기억하고, 열린 화면도 자정에 다시 렌더하여 경고를 다시 표시하고 일수를 줄인다. 안내 화면에 관리자 Jira 설정→시간 추적→Jira 기본 제공자 복원·입력 확인 3단계를 추가했다.

변경 파일:

- static/ui/src/stores/useLicenseStore.js
- static/ui/src/stores/__test__/useLicenseStore.test.js
- static/ui/src/features/license/TrialExpiryBanner.jsx
- static/ui/src/features/license/LicenseGuidePage.jsx
- static/ui/src/features/license/licenseConstants.js
- static/ui/src/features/license/__test__/TrialExpiryBanner.test.jsx
- static/ui/src/features/license/__test__/LicenseGuidePage.test.jsx
- static/ui/src/app/mount.jsx
- static/ui/src/app/mount.test.jsx
- locales/kr/license.json, locales/en/license.json
- docs/guide/ko/09-admin-guide.md, docs/guide/en/09-admin-guide.md

집중 검증: license 관련 5 suites/31 tests 통과, mount 기본 경고 1 suite/6 tests 통과. 열린 화면이 8일에서 7일로 넘어갈 때도 경고를 시작하는 회귀 검증을 포함한다. 실제 Forge context에서 정식 구독 만료일 필드 제공 여부는 실배포 확인이 필요하며 날짜가 없으면 경고를 계산하지 않는다. 새로운 Jira 호출·SQL·resolver·마이그레이션은 없다.
