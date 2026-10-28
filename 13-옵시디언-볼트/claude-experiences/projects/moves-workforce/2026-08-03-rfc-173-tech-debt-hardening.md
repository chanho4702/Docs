---
tags:
  - moves-workforce
  - RFC-173
  - technical-debt
  - forge
  - react-query
  - bundle
updated: 2026-08-03
---

# RFC-173 논리 감사 후속 기술부채 하드닝

> 프로젝트: [[moves-workforce]]  
> 선행: [[2026-08-03-logical-design-audit]]  
> branch/worktree: `RFC-173` / `C:\CloudJira\moves-workforce-rfc-173`

## 결론

논리 감사에서 남긴 F-11 query-key 부채와 F-12 bundle/`project_team` 복구 위험을 RFC-173으로 정리했다. 로컬 통합 검증은 PASS, FAIL 0건이다.

- Backend Jest: 52 suites / 779 tests PASS
- Frontend Jest: 45 suites / 660 tests / snapshot 1 PASS
- Production build + bundle budget PASS
- Main gzip: 1,726,741 B → 271,377 B(-84.28%)
- Runtime inline React Query key: 60건 → 0건, allowlist 없음
- `forge lint`: exit 0. 이전 `PermissionLinter Unknown product`는 재현되지 않았지만 출력 없는 exit 0과 실제 권한 E2E는 구분한다.

상세 보고서: `C:\CloudJira\moves-workforce-rfc-173\_workspace\rfc-173-tech-debt-hardening\03_verify_report.md`

## develop 병합 결과

- RFC branch commit: `c3b60b8 #RFC-173 [REFACTOR] 후속 기술부채 하드닝 - 2026-08-03`
- develop merge commit: `93ab61a #RFC-173 [MERGE] 후속 기술부채 하드닝 통합 - 2026-08-03`
- `RFC-174`, `RFC-175`가 반영된 최신 develop 위에 `--no-ff`로 병합했다.
- 충돌은 `tabs.js`, `CostPage.jsx` 두 파일뿐이었다. RFC-175의 팀 분석 탭·공용 비용 조회 훅을 유지하면서 RFC-173의 lazy loading과 query-key factory 계약을 결합했다.
- 병합 후 Backend Jest 56 suites / 860 tests, Frontend Jest 55 suites / 931 tests / snapshot 1 PASS.
- locale merge, production build, `git diff --check` PASS. Main gzip 273,090 B / budget 1,625,293 B.
- 사용자 작업인 `.gitignore`, `.agents/`, `.codex/`는 병합 커밋에서 제외했다. push/deploy/install은 수행하지 않았다.

## 핵심 결정

### 1. transaction 없는 replace는 add-first·delete-last로 수렴시킨다

`project_team`의 기존 DELETE→INSERT는 INSERT 실패 시 담당 팀 전체가 사라졌다. 실제 복합 PK `(project_id, team_key)`를 이용해 다음 순서로 바꿨다.

1. target을 non-primary upsert
2. primary clear
3. 선택 primary set
4. stale row 마지막 삭제

중간 실패 시 primary 0개나 stale 잔존은 허용하지만, 기존/목표가 non-empty인데 assignment 전체가 empty가 되는 상태는 금지한다. 같은 payload 재시도로 목표 상태에 수렴한다. 빈 target은 사용자의 명시적 전량 해제이므로 delete-all 한 문장을 유지한다.

### 2. Query key factory는 이름 정리보다 cache 동시성 계약이다

`queryKey`뿐 아니라 `invalidateQueries`, `cancelQueries`, `getQueryData`, `setQueryData`를 같은 factory 계층으로 옮겼다. 정적 contract test가 runtime literal array를 거부한다.

Project user optimistic update는 목적에 따라 계층을 구분한다.

- prefix key: 모든 page fetch cancel, 성공 invalidate
- current page key: snapshot, optimistic patch, rollback

같은 key를 무조건 쓰는 것이 아니라 같은 factory에서 올바른 prefix/detail 계층을 쓰는 것이 계약이다.

`getSettingData`는 `['getSettingData']`와 `['settings','detail']` 중복 cache를 canonical `['settings','detail']`로 통합했다. persisted cache가 아니므로 앱 reload에서 한 번 재조회되는 memory-cache migration이다.

### 3. route lazy loading은 budget gate와 함께 끝낸다

App page, project detail tab, work table/tree/Gantt를 lazy boundary로 옮기고 ECharts theme side effect도 chart 사용 경계로 이동했다. main gzip은 84.28% 줄었다. `asset-manifest.json`의 실제 main entry를 gzip 측정하는 script가 1.55MiB를 넘으면 build를 실패시킨다.

최대 async chunk는 약 484KiB gzip이므로 초기 main 문제는 해결됐지만, 실제 Forge iframe에서 lazy chunk fetch와 Atlaskit CSS ordering 시각 회귀를 확인해야 한다.

### 4. 직접 import한 package는 해당 package manifest에 선언한다

`static/ui/src/index.js`가 `@sentry/react`를 import하면서 dependency는 root에만 있었다. 기존 개발 환경에서는 hoisting 때문에 숨겨졌지만 새 Worktree의 독립 `npm ci`/build에서 드러났다. `static/ui/package.json`과 lockfile에 `^10.45.0` direct dependency를 추가해 재현성을 고정했다.

## 하네스 교훈

- 큰 inventory를 설계 에이전트에 한 번에 맡기면 탐색은 완료해도 문서 저장 단계가 길어질 수 있다. 중간 checkpoint 산출물을 먼저 쓰게 하고, 정지 시 리더가 확보된 inventory로 계약을 고정하는 fallback이 필요하다.
- verifier가 구현 보고를 신뢰하지 않고 설계↔코드를 비교해 settings cache migration과 optimistic cancel 계층의 문서 모순 2건을 잡았다. 두 건 모두 구현 의미가 맞아 설계를 정정했고 재검증 PASS로 닫았다.
- 새 Worktree는 `node_modules`를 공유하지 않는다. Windows에서 Atlaskit/CRA `npm ci`는 오래 걸릴 수 있으므로 설치 완료와 `.bin` 생성 여부를 별도로 확인한다.

## 남은 운영 검증

- Forge development deploy 후 page/detail lazy chunk fetch와 back/forward navigation
- Gantt·분석 차트 다크 테마 및 Atlaskit CSS ordering 시각 smoke
- `setProjectTeams`의 실제 Forge SQL upsert/primary/stale-delete 및 중간 오류 후 재시도
- 실제 Jira에서 팀 배정 UI·권한·성공 count·실패 toast E2E
- deploy/install은 이번 로컬 구현 범위에서 수행하지 않음
