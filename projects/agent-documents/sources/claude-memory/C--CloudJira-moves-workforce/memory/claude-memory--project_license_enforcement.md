---
name: project-license-enforcement
description: "라이선스 판정 정책 확정 — \"물어봤는데 대답 못 들음\"만 통과, \"라이선스 없음\"은 차단 (2026-08-10)"
metadata: 
  node_type: memory
  type: project
  originSessionId: 1a4bcb6b-0b7d-4b1a-8966-aa82bf0c081d
  modified: 2026-08-10T06:19:41.211Z
---

유료 앱 라이선스 게이팅. 2026-07-27 진단(1단계) → License API 승격(2단계) 을 거쳐,
**2026-08-10 정책이 확정**됐다. `src/utils/license/LicenseGuard.js` 단일 출처.

## 확정 정책 (사용자 결정, 2026-08-10)

판정은 4-state(ACTIVE / INACTIVE / NOT_APPLICABLE / UNAVAILABLE)지만 **차단은 INACTIVE 하나뿐**이다.

핵심은 UNAVAILABLE 을 **원인에 따라 갈랐다**는 것:

| 상황 | 판정 | 동작 |
|---|---|---|
| 호출 자체 실패(네트워크·5xx) | UNAVAILABLE | **통과** |
| 200 응답인데 active boolean 없음 | **INACTIVE** | **차단** |
| `context.license.active === false` | INACTIVE | 차단 |

**왜 이렇게 갈랐나 — 이게 이 메모의 핵심이다.**
- 원래 코드는 UNAVAILABLE 을 전부 차단했다. 그런데 `assertLicenseAllowed` 가
  `responseWrapper` 를 통해 **모든 resolver** 를 감싸므로, 아틀라시안 상류 5xx 한 번이
  60초 캐시와 맞물려 **앱 전면 정지**가 됐다(권한 부트스트랩까지 막혀 오류 봉투만 렌더).
- 그래서 "UNAVAILABLE 통과"로 바꾸려 했으나, **License API 는 라이선스 부재를
  `active:false` 가 아니라 "빈 데이터가 담긴 200"** 으로 답한다. 뭉뚱그려 통과시키면
  미결제·만료 설치가 전부 통과해 원래 고치려던 결함(트라이얼 후 미차단)이 부활한다.
- 결론: **문지기가 명단을 못 본 경우(전산 장애)엔 통과, 명단을 봤는데 이름이 없으면 차단.**

## 프론트도 같은 경계여야 한다

`static/ui/src/stores/licenseDecision.js` 의 `CLIENT_LICENSE_UNAVAILABLE.isLicensed` 를
`true` 로 둔다. 백엔드만 열고 프론트를 닫으면 `App.jsx` 의 `!isLicensed` 게이트가
**서버는 응답하는데 화면만 가이드 페이지에 고정**되는 어긋남을 만든다.

## 배포 후 반드시 볼 것

`readApiActive` 가 응답 shape 를 후보 4경로로 파싱한다. 실제 shape 를 못 읽으면 이제
INACTIVE(= 전원 차단)로 떨어진다 — **배포 직후 정상 사용자 접속을 한 번 확인**할 것.

## 별개 축 — 환경 판별

`resolveEnvironmentType` 이 `getAppContext().environmentType` 을 폴백으로 쓴다(큐·스케줄은
invocation context 가 없어서). dev/staging 은 NOT_APPLICABLE(통과)이므로, **dev 환경 앱이
고객 사이트에 설치되면 라이선스가 무력화된다.** 이건 코드가 아니라 배포 규칙 문제다 —
[[project-forge-env-field-duplication]] 의 "운영 사이트엔 단일 환경 앱만" 과 같은 근거.

관련: [[feedback-no-forge-logs]] · [[project-code-quality-audit]]
