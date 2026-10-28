---
type: project
tags: [project, forge, license, marketplace, moves-approval-jira]
created: 2026-10-07
updated: 2026-10-07
status: done
---

# 2026-10-07 — Jira 승인 앱 유료화: 워크포스 라이선스 경계 이식

## 개요
- **목적**: `moves-approval-jira` 를 유료 애드온으로 — 결제(활성 라이선스) 없이는 못 쓰게.
- **출발점**: 워크포스(`moves-workforce`)의 manifest `app.licensing` + `LicenseGuard`/`ResponseWrapper` + 프론트 `useLicenseStore`/`LicenseGuidePage`/`TrialExpiryBanner`.
- **저장소/경로**: `C:\CloudJira\moves-approval-jira` — `manifest.yml`, `src/utils/license/`, `static/ui/src/features/license/`, `static/ui/src/stores/useLicenseStore.js`, `static/ui/src/app/mount.jsx`.

## 핵심 결정 (Decisions)
- **백엔드는 이미 있었다.** Confluence 판에서 복사된 `LicenseGuard`·`ResponseWrapper` 가 워크포스와 글자 하나 빼고 같았다(승인 앱 고유 `shouldEmitNotifications` 만 추가). 빠진 건 **manifest `licensing.enabled`**, **프론트 게이트**, **번역**, **테스트** 네 가지.
- **프론트 게이트는 `mount` 한 곳에.** 엔트리 6개마다 붙이면 언젠가 하나가 빠지고 그 화면만 결제 없이 열린다 — `guardedDefine` 과 같은 논리. `mount(element, {license, trialBanner})`.
- **설정(adminPage)은 가리지 않는다(`license:'banner'`).** 관리자가 라이선스 상태를 보러 오는 화면. resolver 는 어차피 `assertLicenseAllowed` 가 막아 저장은 거부된다.
- **차단은 명시적 INACTIVE 하나뿐.** 판정 불가(UNAVAILABLE)는 통과 — 상류 5xx 한 번이 앱 전면 정지가 되면 안 된다. 단 License API 200 + 활성 레코드 없음은 INACTIVE(과금 우회 방지). 워크포스 2026-08 감사에서 확정된 경계를 그대로 유지.
- **`displayConditions: appIsLicensed` 는 넣지 않는다.** 개발 설치엔 라이선스가 없어 전 화면이 막힌다(Confluence 판 실측). 과금은 코드 두 겹(resolver+엔트리)으로.
- **Marketplace URL 은 가짜 ID 를 만들지 않는다.** 리스팅 전이라 제품명 검색 링크로 두고 `MARKETPLACE-SUBMISSION.md` 체크리스트에 교체 항목 추가.
- **트리거·스윕은 라이선스로 막지 않는다**(승인 앱 고유). 만료·리컨실이 멈추면 결재 기록 정합이 깨진 채 남는다. 알림 생성만 막는다.

## 겪은 문제 & 해결 (Troubleshooting)
- Git Bash 에서 긴 heredoc 여러 개를 한 호출에 넣으니 `unexpected EOF while looking for matching '`. 파이썬 패치 스크립트를 `$TMP` 에 떨구고 실행하는 방식 + 파일 본문은 Write 도구로 분리.
- jsdom 에서 `@atlaskit/section-message` import 가 `xcss is not a function` 으로 죽는다 — 리포의 다른 UI 테스트처럼 `jest.mock('@atlaskit/section-message', ...)` 목 처리.
- zustand `setState` 를 테스트 본문 중간에서 부르면 act 경고 — `act(async () => reset())` 로 감싼다.

## 교훈 (Lessons)
- **복사된 코어에 "있다"와 "켜져 있다"는 다르다.** 가드 코드는 있었지만 manifest 에 `licensing` 이 없으면 `context.license` 자체가 안 와서 production 에서 전부 UNAVAILABLE(통과) — 즉 무료 앱처럼 동작한다. 유료화의 실체는 manifest 한 줄이다.
- 게이트는 **등록 지점이 하나인 곳**에 둔다(mount·guardedDefine). 호출처마다 붙이는 가드는 언젠가 하나가 빠진다.
- 워크포스에서 검증된 경계(INACTIVE 만 차단)는 **이유까지 같이 옮겨야** 다음 사람이 "fail-closed 로 바꾸자"며 되돌리지 않는다 — 주석·AGENTS.md 에 이유를 적었다.

## 검증
- `npm run verify`(백엔드 jest → UI jest → craco build) 통과, `forge lint` No issues. 배포·production 실측(비활성 라이선스 안내 화면·설정 배너·평가판 배너)은 **미실행** — 제출 준비표에 남김.

## 관련 노트
- [[2026-10-02-jira-approval-design]] — Jira 판 설계·리포 생성
- [[2026-08-06-code-quality-audit]] — 워크포스: 큐·스케줄 경로 `getAppContext` 폴백(License fail-closed 가 dev 를 잠근 사고)
- [[2026-08-03-logical-design-audit]] — 워크포스: license fail-open 해소
