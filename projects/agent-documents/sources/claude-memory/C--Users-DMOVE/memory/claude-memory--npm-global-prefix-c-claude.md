---
name: npm-global-prefix-c-claude
description: npm 전역 prefix가 기본값이 아닌 C:\Claude 로 설정되어 있음 — 전역 설치 시 PATH 확인 필요
metadata: 
  node_type: memory
  type: project
  originSessionId: c2b0ed34-ba14-45af-94f7-f226ae1c6578
  modified: 2026-07-31T04:14:22.529Z
---

이 머신의 npm 전역 prefix는 기본값(`C:\Users\DMOVE\AppData\Roaming\npm`)이 아니라 **`C:\Claude`** 로 설정되어 있다. Node는 nvm4w(`C:\nvm4w\nodejs`)로 관리된다.

**Why:** 2026-07-31에 `npm i -g @openai/codex@latest` 가 성공했는데도 `codex --version` 이 옛 버전(0.104.0)을 계속 출력하는 문제가 있었다. 새 버전은 `C:\Claude` 에 설치됐지만 PATH에는 옛 기본 경로만 등록되어 있어, 그쪽에 남아있던 예전 설치본이 먼저 잡혔기 때문이다. 같은 이유로 `forge` 도 PATH에서 안 잡히던 상태였다.

**How to apply:** 이 머신에서 `npm i -g` 후 버전이 안 바뀌면 `npm prefix -g` 와 `where <cmd>` 를 대조해 볼 것. 2026-07-31에 사용자 PATH 맨 앞에 `C:\Claude` 를 추가하고 옛 경로의 codex를 제거해 해결했다. 사용자 PATH 수정 시 `setx PATH "...;%PATH%"` 는 절대 쓰지 말 것 — 시스템 PATH를 사용자 PATH로 복제하고 1024자에서 잘린다. `HKCU:\Environment` 의 Path를 직접 읽고(`DoNotExpandEnvironmentNames`) 값 종류를 유지해 되쓰는 방식을 쓴다.
