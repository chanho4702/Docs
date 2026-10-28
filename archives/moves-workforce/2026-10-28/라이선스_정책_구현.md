# Moves Workforce — 라이선스 정책 및 구현 문서

> Forge(Atlassian Marketplace) 유료 앱 라이선스 enforcement 설계·구현 기록.
> 최종 갱신: 2026-08-10

---

> **2026-08-10 정책 확정 — 이 문서에서 가장 중요한 항목.**
> 4-state 판정(ACTIVE / INACTIVE / NOT_APPLICABLE / UNAVAILABLE)은 그대로지만, **차단은 `INACTIVE` 하나뿐**이다.
>
> | 상황 | 판정 | 동작 |
> |---|---|---|
> | 호출 자체 실패(네트워크·5xx) | `UNAVAILABLE` | **통과** |
> | 200 응답인데 활성 라이선스 없음 | **`INACTIVE`** | **차단** |
> | `context.license.active === false` | `INACTIVE` | 차단 |
>
> **왜 UNAVAILABLE을 통과시키나** — `assertLicenseAllowed`는 `responseWrapper`를 통해 **모든 resolver**를 감싼다.
> 판정 불가를 차단으로 다루면 License API의 일시적 5xx 한 번이 60초 캐시와 맞물려 앱 전면 정지가 된다
> (권한 부트스트랩까지 막혀 화면에 오류 봉투만 남는다). 리스팅에 라이선스 레코드가 아직 없는 설치는 영구히 그 상태다.
>
> **왜 200-무라이선스는 차단하나** — License API는 라이선스 부재를 `active:false`가 아니라 **빈 데이터가 담긴 200**으로
> 답할 수 있다. 이걸 UNAVAILABLE로 뭉뚱그려 통과시키면 미결제·만료 설치가 전부 통과해, 이 문서가 원래 해결하려던
> 결함(트라이얼 종료 후 미차단)이 되살아난다. **판정을 못 한 것과 "없다는 것을 알아낸 것"은 다르다.**
>
> 프론트(`static/ui/src/stores/licenseDecision.js`)도 같은 경계를 쓴다. 한쪽만 닫으면 서버는 응답하는데
> 화면만 가이드 페이지에 고정된다.
>
> ⚠ 배포 후 확인: `readApiActive`가 응답 shape를 후보 4경로로 파싱한다. 실제 shape를 못 읽으면 이제
> `INACTIVE`(= 전원 차단)로 떨어지므로 **정상 사용자 접속을 한 번 확인**할 것.

> 2026-08-06 보완: queue consumer와 scheduled trigger는 resolver invocation context를 받지 않으므로, 기존 context·환경변수 판별이 모두 비어 있으면 `getAppContext().environmentType`을 최종 폴백으로 사용한다. 이로써 development/staging이 production License API self-query로 잘못 진행되어 `UNAVAILABLE`로 차단되는 경로를 막는다. 기존 판별값이 있으면 그 값을 우선한다.
> ⚠ 이 폴백 때문에 **dev/staging 환경 앱이 고객 사이트에 설치되면 라이선스가 무력화된다**(NOT_APPLICABLE). 운영 사이트에는 단일 prod 환경 앱만 설치할 것 — 코드가 아니라 배포 규칙으로 지킨다.

## 1. Forge 라이선스 정책 개요

- 라이선스는 **유료(paid) 앱 + production 환경**에서만 동작한다.
- `manifest.app.licensing.enabled: true` 로 "라이선스 대상 앱"임을 선언한다.
- 라이선스 상태는 `license.active`(boolean) 한 플래그로 수렴한다. 결제·평가판(trial)·grace 기간 등은 모두 Atlassian이 관리하며, 앱은 이 플래그만 신뢰하면 된다.
- `license` 객체가 내려오는 경로:
  - **프론트엔드**: `await view.getContext()` → `context.license`
  - **백엔드 resolver**: 함수 호출 시 `req.context.license`
- `license` 가 **`undefined`** 인 경우 (→ 라이선스 검사를 적용하지 않고 통과시킨다):
  - 무료 앱 / Marketplace 미등록 앱 / custom 환경 / **로컬 개발(tunnel)**
- **enforcement(실제 차단)는 앱 개발자 책임**이다. Atlassian은 active 여부만 알려줄 뿐, 코드에서 막지 않으면 미결제 인스턴스도 기능을 그대로 사용한다.

### ⚠️ 핵심 함정: `displayConditions.appIsLicensed: true`
globalPage 모듈에 이 조건을 걸면 미라이선스 시 **페이지 자체가 노출되지 않는다**(메뉴/아이콘에서 사라짐).
→ "라이선스 없을 때 **안내(가이드) 페이지를 보여주려면** 이 조건을 제거**해야 한다. 대신 인앱(React)에서 `context.license.active` 를 검사해 가이드 페이지로 분기한다.

---

## 2. 구현 요약

라이선스가 비활성이면:
1. **프론트엔드** — 메인 화면 대신 `LockClosedImage.png` 를 사용한 **가이드 페이지**로 분기
2. **백엔드 resolver** — 공통 래퍼에서 차단
3. **백그라운드(트리거/큐)** — License API로 확인 후 비싼 작업 skip

판정 규칙(공통): `license.active === false` (또는 License API `data.active === false`) **일 때만 차단**. `undefined`/`null`(무료·미등록·개발·조회실패)은 **통과** → 로컬 개발이 깨지지 않는다.

---

## 3. 변경/추가 파일

### 백엔드
| 파일 | 내용 |
|------|------|
| `src/utils/errors/ErrorCodes.js` | `LICENSE_INACTIVE` 에러 코드 추가 |
| `src/utils/ResponseWrapper.js` | 모든 resolver 공통 가드. `req.context.license` 가 존재하면서 `active !== true` 일 때만 throw |
| `src/utils/license/LicenseGuard.js` (신규) | License API 호출 + KVS 1시간 캐싱. `isLicenseBlocked()` 제공 |
| `src/trigger/portfolioSnapshot.js` | 일 단위 집계 시작부에서 `isLicenseBlocked()` 면 skip |
| `src/queue/consumer.js` (`uploadUsers`) | 큐 처리 시작부에서 `isLicenseBlocked()` 면 early-return |

### 프론트엔드
| 파일 | 내용 |
|------|------|
| `static/ui/src/stores/useLicenseStore.js` (신규) | `view.getContext()` 로 license 로드, `isLicensed = license ? active===true : true` |
| `static/ui/src/pages/license/LicenseGuidePage.jsx` (신규) | `@atlaskit/empty-state` + `LockClosedImage.png` + "라이선스 구매/관리" 버튼(`router.open`) |
| `static/ui/src/App.jsx` | license 로드·로딩 게이팅 추가, `!isLicensed` 면 `LicenseGuidePage` 렌더 |

### i18n
| 파일 | 내용 |
|------|------|
| `locales/kr/license.json` (신규) | `license.guide.*` (title/description/action) 한국어 |
| `locales/en/license.json` (신규) | 동일 영어 |
| `locales/ko-KR.json`, `locales/en-US.json` | `npm run merge` 로 생성물 갱신 (파일명=네임스페이스 규칙) |

### manifest.yml
- globalPage 의 `displayConditions.appIsLicensed: true` **제거** (가이드 페이지 노출 위해)
- `app.licensing.enabled: true` **유지**

---

## 4. 동작 흐름

```
[프론트엔드 진입]
  App.jsx → useLicenseStore.loadLicense()
    view.getContext().license
      ├─ undefined           → isLicensed=true  → 정상 앱 렌더
      ├─ { active: true }    → isLicensed=true  → 정상 앱 렌더
      └─ { active: false }   → isLicensed=false → LicenseGuidePage (LockClosedImage)

[백엔드 resolver 호출]
  responseWrapper → req.context.license
      ├─ undefined / active=true → 통과
      └─ active=false            → throw LICENSE_INACTIVE → { success:false, error }

[백그라운드: portfolioSnapshot(일배치), uploadUsers(큐)]
  isLicenseBlocked()  // License API self-query + KVS 1h 캐시
      ├─ active=true / null(무료·미등록·조회실패) → 통과
      └─ active=false                            → skip / early-return
```

### License API 호출 상세 (`LicenseGuard.js`)
- 엔드포인트: `GET /forge/app/v1/license` (self-query — 호출 앱 자신)
- 호출 방식: `api.asApp().requestAtlassian(route\`/forge/app/v1/license\`, { method:'GET' })`
  - **인자는 `route` 태그 필수** (@forge/api 7.x, plain string 불가)
- 응답: `body.results[0].data.active` (boolean). `data` 없으면 `null` 취급
- 캐싱: KVS 는 **설치(installation)별로 격리**되므로 단일 키(`license-status-cache`) 사용. 값에 `checkedAt`(ms) 저장, `Date.now()` 로 1시간 만료 판정
- 레이트리밋(Atlassian): 설치당 5분 1회 / 테넌트 분당 10회 → 1시간 캐싱으로 여유

---

## 5. 설계 결정 / 주의

- **`runMigration` 은 의도적으로 가드하지 않음.** 스키마 생성은 멱등·저비용이고, 막으면 라이선스 활성화 직후 테이블이 최대 1시간 늦게 생겨 깨질 위험이 있다. enforcement 는 "비싼 작업/데이터 노출"에만 적용하고, 멱등 셋업에는 적용하지 않는다.
- **`undefined`/`null` 은 항상 통과.** 로컬 tunnel·무료·미등록에서 차단되면 개발이 불가능해지므로 필수 조건.
- 가이드 페이지 버튼은 `https://admin.atlassian.com`(사이트 관리자 앱 관리) 로 연결. Marketplace 리스팅 URL 확정 시 교체 가능.

---

## 6. 테스트 / 검증

- 백엔드 jest: **84개 전부 통과** (회귀 없음)
- 프론트 빌드: **성공** (번들 크기 경고는 기존 사항)
- `@forge/api` 7.0.2 에서 `asApp().requestAtlassian` 노출 확인
- **실동작 검증은 production 한정**: 로컬은 `license=undefined` 라 항상 통과. Marketplace 의 **license mocking** 기능으로 active/false 토글해 확인 필요.

---

## 7. 향후 과제

- 가이드 페이지 CTA URL 을 실제 Marketplace 앱 리스팅 주소로 교체
- 필요 시 평가판 만료일(`subscriptionEndDate`)·평가판 여부(`isEvaluation`) 안내 문구 추가
- production 배포 후 license mocking 으로 end-to-end 검증
