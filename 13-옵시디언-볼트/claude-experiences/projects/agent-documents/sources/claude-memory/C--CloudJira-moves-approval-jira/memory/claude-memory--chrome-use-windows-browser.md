---
name: chrome-use-windows-browser
description: "Claude in Chrome 은 사용자 PC 크롬 'DESKTOP-Q21AG2J'(deviceId caab42fb-…)에만 연결 — macOS 크롬(theo@ 계정)과 최소화된 다른 Windows 인스턴스(8e6c1a85-…)는 쓰지 않는다"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 328d2874-254c-466a-8cc6-dd177a2cc219
  modified: 2026-10-26T02:30:31.165Z
---

브라우저 작업 전 `list_connected_browsers` 로 **이름 `DESKTOP-Q21AG2J` / deviceId `caab42fb-fd9b-45d0-b076-04e20a50628a`** 를 `select_browser` 한다. 연결 목록에 셋이 뜰 수 있다:
- `caab42fb-…` DESKTOP-Q21AG2J, Windows — **사용자 PC, tom@dmove.kr 로그인. 이것만 사용**
- `8e6c1a85-…` Windows — 창이 전부 최소화된 별도 인스턴스(좌표 -32000). 페이지 이동은 되지만 스크린샷이 30초 시간 초과로 전부 실패하고 사용자 화면에 아무것도 안 뜬다
- `a809f725-…` macOS — Atlassian 세션이 theo@dmove.kr 라 tom-chkim-dev 에서 "Jira에서 팀에 참여" 화면. "지금 시작"을 누르면 계정이 사이트에 새로 가입되니 절대 누르지 않는다

"Browser 1/2/3" 같은 일반 이름은 재연결마다 바뀐다 — deviceId 로 고른다.

**Why:** 2026-10-26 macOS → 최소화 Windows 인스턴스 순으로 잘못 붙어 한 시간 가까이 막혔다. 사용자 말대로 "내 PC 에 안 띄운" 상태였다.
**How to apply:** 세션 첫 브라우저 호출 전에 deviceId 확인. 스크린샷이 연속 시간 초과면 `window.screenX === -32000` 인지(최소화) 확인하고 바로 브라우저를 바꾼다.
