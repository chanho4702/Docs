---
type: project
tags: [project, forge, license, marketplace, sentry, moves-approval]
created: 2026-10-07
updated: 2026-10-07
status: done
---

# 2026-10-07 — Confluence 승인 앱 유료화 + Sentry 이식

## 개요
- **목적**: `moves-approval`(Confluence)을 워크포스처럼 유료 앱으로. 사용자 질문은 "설정 되어 있니?" — 답은 **반만**.
- **출발점**: 같은 날 Jira 판에서 한 작업([[2026-10-07-paid-license-gate]])과 워크포스 원본.
- **경로**: `manifest.yml`(app.licensing·external.fetch), `src/resolver/observability/SentryController.js`, `static/ui/src/app/{sentry.js,AppProviders.jsx,mount.jsx,license/}`, `test/manifest/licensing.contract.test.js`.

## 진단 — "있다"와 "켜져 있다"
- `LicenseGuard`·`ResponseWrapper` 가드, `LICENSE_INACTIVE` 번역까지 전부 있었다. 없는 건 **manifest `licensing.enabled`** 와 **프론트 게이트**.
- manifest 주석에는 "출시 때 `appIsLicensed` 를 넣는다"는 체크리스트만 남아 있었다 — 그 체크리스트 자체가 틀린 방향(안내 화면을 못 띄운다)이라 지우고 이유를 적었다.
- 형제 앱 비교가 가장 빠른 진단이었다: `grep -i licens */manifest.yml` 한 줄에 워크포스·시그니처·CUM 은 `licensing.enabled` 가 있고 승인 앱 둘만 없었다.

## 핵심 결정 (Decisions)
- **게이트는 `mount` → `AppProviders` 한 곳.** 엔트리 6개(macro·stamp·modal·inbox·feed·settings)가 전부 거친다. variant 로 모양만 가른다: `page`(안내+평가판 배너) / `modal`(안내만 — 배너가 승인 버튼을 밀어낸다) / `compact`(매크로·결재란·홈 피드 — 남의 문서 안이라 한 줄).
- **설정도 안내 화면으로.** Jira 판은 설정을 `banner` 로 열어 두었지만, Confluence 판은 미결제 시 resolver 가 전부 `LICENSE_INACTIVE` 라 설정 화면이 에러 더미가 된다. "관리자가 라이선스 상태를 보러 오는 화면" 이라는 manifest 주석의 의도는 구매 안내가 더 잘 채운다. → **두 앱이 여기서 갈린다.** 다음에 한쪽으로 맞출 것.
- **서버 판정이 화면 판정을 뒤집는다.** production 에서 `context.license` 가 비면 화면은 UNAVAILABLE(통과)로 끝나는데, 서버는 License API 로 INACTIVE 를 확정할 수 있다. `invokeApproval` 이 `LICENSE_INACTIVE` 코드를 보면 `useLicenseStore.markInactive()` 로 엔트리 전체를 안내로 바꾼다. 호출한 화면 하나만 에러 봉투를 보여 주는 것보다 낫다.
- **Sentry 는 마운트를 막지 않는다.** 워크포스는 `index.js` 에서 top-level await 로 Sentry 를 기다린 뒤 렌더한다. 승인 앱의 매크로·결재란은 **모든 사용자가 모든 문서에서** 로드하므로 마운트 뒤 비동기로 켜고, `@sentry/react` 는 `webpackChunkName: "sentry"` 동적 청크(gzip 185KB — DSN 없으면 내려받지도 않음). DSN 응답은 sessionStorage 1시간 캐시로 iframe 마다 다시 묻지 않는다.
- **DSN 은 코드에 없다.** 워크포스처럼 `SENTRY_DSN` 암호화 변수 → `getSentryDSN`(PUBLIC). 워크포스 production 의 DSN 은 encrypted 라 읽을 수 없고, 읽을 수 있어도 프로젝트를 섞으면 안 된다 → 승인 앱용 Sentry 프로젝트를 따로 만들어야 한다.
- **Marketplace URL 은 가짜 id 를 만들지 않는다.** 리스팅 전이라 검색 링크. `licenseConstants.js` 에 교체 조건을 적었다.

## 겪은 문제 & 해결 (Troubleshooting)
- Git Bash 한 호출에 heredoc 7개 → `unexpected EOF while looking for matching '`(Jira 판과 같은 사고). 패치 스크립트는 `$TMP` 파일로, 본문은 Write 도구로.
- `@testing-library/react` 16 이 peer `@testing-library/dom` 을 요구하는데 lock 에 없었다 — 기존 UI 테스트는 RTL 을 안 쓰는 파일만 있어 드러나지 않았다. devDependency 추가.
- Atlaskit(`empty-state`·`banner`)은 jsdom 에서 `xcss is not a function` — 리포 관례대로 얇은 `jest.mock`.
- 루트 `npm install -D js-yaml` 이 패키지 47개를 지웠다 — lock 에 `package.json` 에 없는 `esbuild`·`@forge/bridge` 가 남아 있던 것(스파이크 제거 잔재)을 prune 한 것. 테스트는 영향 없음.
- `forge lint`: egress(`external.fetch`) 추가가 **major version upgrade**(MAJOR_VERSION_RULE) — `sql` 추가와 같은 등급.

## 교훈 (Lessons)
- 유료화의 실체는 manifest 한 줄이다. 가드 코드·번역·에러 코드가 다 있어도 `licensing.enabled` 가 없으면 **무료 앱처럼 조용히 동작한다.** 이번엔 manifest 계약 테스트로 고정했다.
- 형제 리포가 여럿이면 **같은 키를 전 리포에 grep** 하는 게 설계 문서보다 빠르고 정확한 "무엇이 빠졌나" 진단이다.
- 같은 날 같은 패턴을 두 앱에 이식하면 **갈라지는 지점(설정 화면 처리)이 바로 생긴다.** 갈린 이유를 양쪽 노트에 적어 두지 않으면 다음에 "왜 다르지" 로 시간을 쓴다.

## 검증
- 백엔드 jest 28 suites/193 통과(manifest 계약 테스트 포함), UI jest 13 suites/82 통과, `craco build` 통과(macro +1.85KB·stamp +1.89KB gzip), `forge lint` 0 errors(MAJOR_VERSION_RULE 승인 1건).
- **미실행**: 배포, `SENTRY_DSN` 설정(Sentry 프로젝트 없음), production 라이선스 토글 실측.

## 관련 노트
- [[2026-10-07-paid-license-gate]] — Jira 판 같은 작업(설정 화면 처리가 다르다)
- [[forge-licensing]] — 정책·enforcement 패턴 원본
- [[2026-08-03-rfc-173-tech-debt-hardening]] — 워크포스 Sentry direct dependency
