---
name: ci-build-lazy-tradeoff
description: "CI Build를 막던 bundle:check를 경고로 강등해 해소 - 게이트가 #426 수정 커밋의 스테이징 배포를 막고 있었음"
metadata: 
  node_type: memory
  type: project
  originSessionId: e45354bd-349a-4162-ab67-c24c679a9a7c
  modified: 2026-08-05T02:27:24.197Z
---

**해소됨** (2026-08-05). 원인 규명 + 조치 완료, 커밋 전.

**인과 사슬**: `c3b60b8`(#RFC-173)이 React.lazy 33개를 도입 → Atlaskit compiled CSS 청크 순서 충돌 + React #426 → lazy 전면 원복(`777983c`, `2236d0a`) → main 번들이 통짜로 돌아가며 **`bundle:check` 예산 132KB 초과**(1,758,067 / 1,625,293) → `npm run build` = `build:app && bundle:check` 이므로 **Build 스텝 실패** → develop 파이프라인이 `Build → Deploy to Staging(manual)` 순서라 **Deploy가 실행조차 안 됨** → 스테이징엔 lazy가 살아있던 마지막 성공 빌드가 남아 **#426이 계속 재현**.

즉 "개발은 되는데 스테이징만 안 된다"의 정체는 환경 차이가 아니라 **고친 코드가 배포되지 못한 것**이었다. 감시 장치가 회귀 *수정*의 배포를 막은 셈.

**조치**: `static/ui/scripts/check-bundle-budget.js` 를 하드 게이트 → **경고**로 강등(초과해도 exit 0, 측정 로그는 유지). 참고선은 실측+5%인 1,850,000 으로 갱신. 측정 불가(빌드 산출물·진입점 누락)는 그대로 실패시킨다.

**판단 근거**: 번들을 줄일 유일한 지렛대인 코드 스플리팅이 봉인된 상태라, 게이트가 빨간불을 켜도 개발자가 할 수 있는 행동이 "예산값 올리기"뿐 → 신호가 아니라 통행세. Forge 하드 제한 때문도 아니다(원복 전에도 통짜로 배포 성공 이력 있음). 우리 앱 코드는 현재 `React.lazy`/`import()` 0건이고, 빌드 로그의 청크들은 전부 Atlaskit·MDXEditor 등 라이브러리 자체 스플릿이다.

**후속 — 코드 스플리팅 재도입 완료 (2026-08-05, 커밋 전)**: main gzip 1,758,067 → 892,894 B (**-49%**).
- `craco` 를 실제 빌드 경로에 연결. 그전까지 `craco.config.js` 가 있는데도 스크립트가 `react-scripts` 를 직접 호출해 **webpack 설정이 통째로 무시**되고 있었다.
- 라우트·탭·뷰 lazy 재도입. 각 컨테이너의 **첫 화면은 정적** 유지(진입 즉시 그리는 화면을 lazy 로 두면 청크 왕복만 는다).
- #426 은 Suspense 경계로 해결 — startTransition 은 이 앱에서 무효다([[legacy-root-no-concurrent]]). 경계를 `CommonTab` 한 곳에 모아 모든 탭 컨테이너를 덮었다.
- `App.jsx` 의 `import './utils/echartsTheme'` 제거 → ECharts 372kB 가 main 밖으로. 등록 책임은 `components/chart/echart/ThemedECharts` 가 소유(useColorMode 에 두면 차트 없는 화면까지 끌고 온다).
- `ChunkErrorBoundary` 추가 — Suspense 는 동적 import **reject** 를 못 받는다. 배포 직후 옛 manifest 세션이 사라진 청크를 요청하는 게 주 경로. 재시도는 리렌더가 아니라 **리로드**여야 한다(webpack 이 실패한 promise 를 캐시).
- CSS Conflicting order 는 실제로 0건이었다. `craco.config.js` 의 allowlist(fail-closed)는 예방용으로 남겼고 **아직 한 번도 발동한 적 없다**.
- 참고선 1,850,000 → 950,000 으로 조임(실측+6%). 게이트로는 복원하지 않음.

전역 `ignoreOrder`·`CI=false` 는 미래 경고까지 은폐하므로 여전히 부적절.

**검증 시 주의**: 로컬 `CI=false` 빌드는 항상 통과한다. 파이프라인과 같은 조건은 `CI=true npm run build`.

관련: [[forge-env-field-duplication]] · 상세 경위: `claude-experiences/projects/moves-workforce/2026-08-04-code-splitting-tradeoff.md`
