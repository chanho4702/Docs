# 요구사항 v2 — 라이선스 가이드 페이지 고도화 + 평가판 만료 배너

> 기준일: 2026-06-24
> 기반: v1 라이선스 enforcement(완료·검증 통과, `03_verify_report.md`). 본 v2는 그 위에 UX 고도화를 추가한다.
> 단일 진실 원천(정책): 루트 `라이선스_정책_구현.md`

## 배경
v1에서 라이선스 enforcement(미라이선스 시 가이드 페이지 + resolver 차단 + 배치 skip)는 완료됐다.
이번 v2는 사용자에게 보이는 **안내 UX 두 가지**를 고도화한다.

## 결정 사항 (사용자 확정)
1. **노출 위치 = 가이드 페이지 고도화 + 메인 앱 상단 배너 (둘 다)**
   - 미라이선스(`active === false`): 가이드 페이지 — CTA URL 교체 + 문구/디자인 개선
   - 평가판 활성(`active === true` + `isEvaluation === true`): 메인 앱 상단 **평가판 만료 배너**
   - 평가판은 `active === true`라 가이드 페이지가 뜨지 않으므로, 평가판 안내는 배너로 노출해야 한다(핵심).
2. **CTA URL = 실제 Marketplace 리스팅 주소**
   - 가이드 페이지 + 배너 CTA 버튼 모두 동일 Marketplace URL 사용.
   - URL 실값은 리더가 단일 상수로 주입(설계/구조에는 무관). 미수령 시 `MARKETPLACE_URL` 플레이스홀더 상수 사용 후 치환.
3. **배너 노출 조건 = 만료 임박(7일 이내) + 닫기 가능(기억)**
   - 평가판 만료일(`evaluationEndDate`/`subscriptionEndDate` 등 license context 필드)까지 **7일 이하** 남았을 때만 노출.
   - 사용자가 닫으면 다시 안 뜨게 기억(localStorage). 단, **만료일이 바뀌면(갱신/연장) 다시 노출**되도록 만료일을 키에 포함.

## 범위
- **프론트엔드(주):**
  - `useLicenseStore` 확장 — active 외에 평가판 여부/만료일 등 license context 필드 캡처, 배너 노출 판정(`shouldShowTrialBanner`, `daysLeft`) 계산.
  - 신규 평가판 만료 배너 컴포넌트 — 메인 앱 상단(AppLayout 또는 App 렌더 트리)에 노출, 닫기 가능(localStorage 기억).
  - `LicenseGuidePage` 고도화 — 실제 Marketplace CTA URL, 문구/디자인 개선.
- **i18n:** `locales/kr/license.json` + `locales/en/license.json`에 배너/가이드 신규 키 추가 후 `npm run merge`.
- **백엔드:** 원칙적으로 불변. license context 필드는 프론트 `view.getContext()`에서 모두 접근 가능하므로 resolver 변경 불필요(architect가 최종 판단).
- **manifest:** 불변(licensing.enabled 유지).

## 경계면 주의 (license context 필드)
- Forge `context.license`의 평가판 관련 필드는 production에서만 실값이 내려온다(로컬 undefined).
- 필드명/존재 여부는 환경 의존적이므로 **방어적 접근** 필수(`isEvaluation`, `evaluationEndDate`, `subscriptionEndDate`, `trialEndDate` 등 후보를 안전하게 탐색, 없으면 배너 미노출).
- v1 불변식 유지: `license === undefined`(무료·미등록·로컬)면 모든 안내 미노출(개발 보호).

## 검증 기준
- 배너 노출 판정 로직: undefined/active=false/active=true-비평가판/평가판-만료임박/평가판-여유 5케이스 단위 검증.
- 닫기 기억 동작(localStorage 키에 만료일 포함) 검증.
- 가이드 페이지 CTA URL이 Marketplace URL로 교체됐는지 확인.
- i18n 신규 키 merge 반영 + 소비 경로 일치.
- jest + 프론트 빌드 회귀 없음.
- production 한정 미검증 항목(실제 평가판 context 수신)은 솔직히 분류.
