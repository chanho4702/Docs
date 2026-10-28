# 2026-08-04 · 코드 스플리팅 딜레마 → **2026-08-05 해소**

> `React.lazy` 도입이 CI 빌드를 깨뜨렸는데, 되돌리면 번들 예산을 넘는다.
> 08-04 시점에는 미해결이었고, **08-05 에 `7a2d381`+`36edce3` 으로 정리됐다.**
> 진짜 원인은 CSS 순서가 아니라 **번들 예산 게이트가 Build 스텝 자체를 죽이고 있었던 것**(§8).

관련: [[moves-workforce]] · [[forge-migration-lifecycle]] · [[2026-08-04-project-subscription]] · [[2026-08-05-design-system-convergence]]

---

## 1. 무슨 일이 있었나

`c3b60b8`(#RFC-173, 08-03 16:13)이 라우트·탭·뷰를 `React.lazy` **33개**로 쪼갰다.
초기 번들을 줄이려는 정당한 최적화였다. 그런데 두 가지가 따라왔다.

### 문제 A — CI 빌드 실패 (CSS 순서 충돌)

청크가 쪼개지자 Atlaskit compiled CSS 가 async chunk group 마다 **상충하는 module-order** 를
요구하게 됐다. `mini-css-extract-plugin` 이 "Conflicting order" 경고를 냈고,
**CRA 는 `CI=true` 에서 경고를 오류로 승격**한다(`react-scripts/scripts/build.js:182`).

```
@atlaskit/dynamic-table · modal-dialog · checkbox · form · inline-edit · badge
→ 공용 CSS chunk 523 으로 합쳐질 때 모든 순서 요구를 만족할 수 없음
```

`93ab61a` 머지(16:23) 이후 파이프라인이 **계속 깨져 있었다.**

### 문제 B — React error #426

탭 클릭(**동기 입력**) 중 lazy 컴포넌트가 suspend 하면
`"A component suspended while responding to synchronous input"` 이 난다.

---

## 2. 왜 오래 못 알아챘나 ★

**로컬은 `CI=false`, 파이프라인은 `CI=true`.**

```
로컬 npm run build      →  "Compiled with warnings"  →  통과
CI  npm run build       →  경고 = 실패              →  깨짐
개발 서버(npm start)     →  번들 예산도 안 잼        →  완전히 멀쩡해 보임
```

"빌드 성공했습니다"를 여러 번 보고했지만 **파이프라인 기준으로는 한 번도 검증한 적이 없었다.**
검증 결과를 말할 때 **어떤 조건에서 돌렸는지**가 결과만큼 중요하다.

---

## 3. 시도와 결과 (핵심)

| 시도 | CSS 경고 | React #426 | 번들 (예산 1,625,293 B) | 판정 |
|---|---|---|---|---|
| `craco` + `MiniCssExtractPlugin.ignoreOrder` | ✅ 해소 | ⚠️ 잔존 | ✅ 1,498 KB | 가능하나 미래 CSS 경고까지 은폐 |
| `App.jsx` lazy 만 원복 | ✅ 해소 | ❌ **발생** | ✅ 1,498 KB | 어중간 — 탭 lazy 가 남아 터짐 |
| **lazy 전면 원복** (현재) | ✅ 해소 | ✅ 해소 | ❌ **1,758 KB** | **예산 132 KB 초과** |

**즉 RFC-173 이 lazy 를 넣은 이유가 번들 예산이었고, 되돌릴 수 없는 변경이었다.**

부분 원복 시 겪은 함정: `lazy` 가 `App.jsx` 에만 있는 줄 알았는데 실제로는
`constants/tabs.js` 14개 · `ProjectWorkPanel.jsx` 3개가 더 있었다.
최상위 `Suspense` 만 걷어내면 남은 lazy 가 보호막을 잃는다
(`ProjectDetailTabs` 는 자체 Suspense 가 있지만 `MainPageTabs` 에는 없다).

---

## 4. 남은 선택지

### 1) lazy 유지 + 두 문제를 각각 겨냥 (권장)

```
CSS 경고  →  craco + webpackConfig.ignoreWarnings
             "Conflicting order 이면서 관련 모듈이 전부 @atlaskit/**.compiled.css" 만 allowlist
             (app CSS 가 하나라도 섞이면 CI 실패 — fail-closed)
#426      →  탭/뷰 전환을 startTransition 으로 감싸기
번들      →  현재대로 유지
```

`ignoreOrder`(전역)보다 `ignoreWarnings`(조건부)가 낫다 — 앞으로 생길 **진짜** CSS 경고는
계속 잡아야 하기 때문. 코덱스 검토 권장안이기도 하다.

### 2) 예산 상향

`check-bundle-budget.js` 의 `DEFAULT_MAIN_GZIP_BUDGET_BYTES` 를 올린다.
가장 간단하지만 번들 비대화를 허용하는 것이고 초기 로딩이 실제로 느려진다.

### 3) 부분 lazy

무거운 것(간트·대시보드)만 lazy 로 남긴다. 균형점을 찾아야 해서 시행착오가 필요하고
CSS 충돌이 재발할지 장담할 수 없다.

---

## 5. 함께 확인된 것

- **`ignoreOrder: true` 는 CSS 출력 순서를 바꾸지 않는다.** 경고를 낼지만 정한다.
  충돌 시 fallback 순서를 고르는 동작은 옵션과 무관하게 동일하다.
- **`@atlaskit/css-reset` 은 무관하다.** `index.js` 에서 동기 import 되어 main CSS 에 들어가고
  문제의 청크(523)에는 없다.
- **ECharts 다크 테마는 안 깨졌다.** 같은 커밋에서 `utils/useColorMode.js` 로 옮겼다.
- **저장소에 `ErrorBoundary` 가 하나도 없다.** lazy 를 다시 쓰면 `ChunkLoadError` 복구 수단이
  필요하다 — `Suspense` 는 로딩만 처리하고 실패는 못 잡는다.

---

## 6. 08-04 시점의 상태

```
HEAD  2236d0a  [FIX] 코드 스플리팅(lazy) 전면 원복
      → lazy 0개. CSS 경고 0건. React #426 없음.
      → 그러나 bundle:check 실패 (1,758,067 / 1,625,293)
      → CI 파이프라인은 여전히 깨진 상태
```

---

## 7. 한 줄 정리 (08-04)

**최적화 하나가 세 곳(CSS 순서 · 동기 입력 suspend · 번들 예산)에 얽혀 있었다.**
그리고 로컬과 CI 의 검증 조건이 다르면 "성공"이라는 말이 아무 의미가 없다.

---

## 8. 해소 (2026-08-05) ★

### 8-1. 진짜 병목은 CSS 가 아니라 **게이트가 Build 를 죽이고 있던 것**

`bundle:check` 가 `npm run build` 의 일부로 돌면서 **예산 초과 = 빌드 실패**였다.
Build 스텝이 죽으니 Deploy 가 아예 실행되지 않았고, **스테이징에는 lazy 가 살아 있던 구버전이
그대로 남아 있었다.** 우리가 08-04 에 "원복했다"고 믿은 상태가 배포된 적이 없었던 것이다.

> 사용자가 스테이징에서 계속 보고 있던 React #426 의 정체가 이것이었다.
> **"고쳤는데 증상이 그대로"는 배포가 안 됐다는 신호일 수 있다** — 코드부터 다시 보기 전에
> 파이프라인이 그 커밋을 실제로 내보냈는지부터 확인해야 했다.

→ `7a2d381`: 예산 체크를 **빌드 실패에서 게이트 경고로 강등**하고 참고선을
`1,625,293 → 1,850,000`(실측 1,756,524 + 5%)으로 재설정. Build 가 살아나며 Deploy 가 다시 돈다.

### 8-2. lazy 재도입 — 경계를 한 곳으로 모았다

→ `36edce3`: 예산이 풀린 뒤 코드 스플리팅을 되돌려 넣었다. main 청크 **-49%**.

08-04 의 실패와 다른 점은 **Suspense 경계를 `CommonTab.jsx` 한 곳에 모은 것**이다.
당시엔 `ProjectDetailTabs` 에만 경계가 있고 `MainPageTabs` 에는 없어서, 남은 lazy 가 보호막을
잃은 채 터졌다. 이제 모든 탭 컨테이너가 같은 경계를 통과한다. 여기에 더해
**각 컨테이너의 첫 탭은 정적으로 남긴다** — 진입 즉시 그리는 화면이라 lazy 로 두면 청크 왕복만 는다.

### 8-3. §4 의 권장안 "startTransition" 은 **애초에 쓸 수 없었다** ★

08-04 에 #426 대책으로 적어 둔 `startTransition` 은 이 저장소에서 무효다.
루트 `static/ui/src/index.js` 가 **`ReactDOM.render`(legacy 모드)** 를 쓰고 있어
concurrent 기능이 전부 꺼져 있기 때문이다. `startTransition` 도 `isPending` 도 아무 일을 하지 않는다.

```
createRoot 로 갈아타야 concurrent 가 켜진다 → 앱 전체 렌더 동작이 바뀌는 변경
그 전까지 #426 을 막는 수단은 Suspense 경계 하나뿐
```

> **API 를 쓸 수 있다는 것과 그게 동작한다는 것은 다르다.** 대책을 적을 때 그 API 가
> 이 앱의 렌더 모드에서 실제로 활성인지 확인하지 않았다.

### 8-4. 남은 것

- 로컬 검증은 반드시 `CI=true npm run build` (§2 의 교훈이 그대로 유효)
- 예산선 1,850,000 은 **실측 + 5% 참고선**이지 목표치가 아니다. 번들이 다시 늘면 경고만 뜨고
  막지는 않으므로, 주기적으로 실측을 봐야 한다.
- `ErrorBoundary` 부재(§5)는 그대로다 — `Suspense` 는 로딩만 처리하고 `ChunkLoadError` 는 못 잡는다.
