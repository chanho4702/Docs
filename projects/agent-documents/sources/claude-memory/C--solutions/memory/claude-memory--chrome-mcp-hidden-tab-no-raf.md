---
name: chrome-mcp-hidden-tab-no-raf
description: "Chrome MCP 탭은 visibilityState=hidden이라 requestAnimationFrame이 멈춰, ECharts 등 애니메이션 차트가 첫 프레임에서 정지한 채 보인다 — 렌더 버그로 오진하기 쉽다"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 3aaf312a-fba1-490e-896f-5007bff0ffcf
  modified: 2026-08-04T02:06:18.482Z
---

Chrome MCP로 연 탭은 **백그라운드**(`document.visibilityState === "hidden"`, `hasFocus false`)라
**`requestAnimationFrame`이 아예 실행되지 않는다**(rAF 대기 시 CDP `Runtime.evaluate` 타임아웃).

그래서 **ECharts 파이/도넛이 12시 방향 얇은 조각만 남은 채 멈춰 보인다** — 파이는 12시에서
시계방향으로 펼쳐지는 애니메이션이라 첫 프레임이 그 모습이다. **렌더 버그로 오진하기 쉽다.**

**판별 순서 (오진 방지)**
1. `document.visibilityState` / `hasFocus()` 부터 확인한다. hidden이면 애니메이션 결과물을 신뢰하지 않는다.
2. 캔버스 픽셀로 판단할 때: 색이 팔레트와 맞고 반경(중심으로부터 거리)이 규격과 일치하는데
   **각도만 0에 가깝다**면 애니메이션 미진행이지 데이터·설정 문제가 아니다.
3. 데이터·매핑·컨테이너 크기가 전부 정상인데 안 그려지면 환경을 의심한다.

**정적 요소는 그대로 신뢰해도 된다** — 레이아웃·텍스트·카드 높이는 rAF와 무관하다.
(실제로 같은 세션에서 KPI 카드 중복 문구/높이 이상은 이 방식으로 정확히 잡았다.)

**Why:** 2026-08-04 도넛 3개가 비어 보여 "기존 렌더 결함"으로 단정하고 조사에 시간을 썼다.
API·매핑·컨테이너·팔레트를 전부 확인한 뒤에야 탭이 hidden이라는 걸 알았다. 실제로는 버그가 아니었다.

**How to apply:** 브라우저로 화면을 검증할 때 **애니메이션이 있는 요소는 판정 대상에서 빼거나**,
사용자에게 실화면 확인을 요청한다. 차트가 이상하면 먼저 탭 상태를 본다. 관련: [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--qa-minimize-screenshots|qa-minimize-screenshots]]

**2026-08-26 확장 사례(ZM-116 E2E)**: hidden MCP 탭은 첫 페인트 전이면 **ECharts canvas가 DOM에 아예 없다**(빈 카드로 보임). 렌더 실패로 오진 금지 — 탭을 잠시 포커스하거나 canvas 등장을 기다린 뒤 판정. 막대 색 실측은 canvas 픽셀 히스토그램(`getImageData`)으로 가능했다.
