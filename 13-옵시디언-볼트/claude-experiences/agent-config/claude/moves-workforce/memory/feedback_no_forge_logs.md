---
name: feedback-no-forge-logs
description: 진단 로그는 forge logs 말고 브라우저 콘솔에서 보이게 설계할 것
metadata: 
  node_type: memory
  type: feedback
  originSessionId: ee1f11af-29c0-4f86-bee4-7efaa54fbbb2
  modified: 2026-07-27T00:56:52.065Z
---

운영 진단 코드를 심을 때 **백엔드 `console.log`(forge logs로만 보이는 것)는 넣지 말 것.** 백엔드 값이 필요하면 **resolver 반환값으로 프론트에 넘겨 브라우저 콘솔에서 확인**하도록 설계한다.

**Why:** 사용자가 `forge logs`를 보지 않는 운영 방식이라, 백엔드에만 찍는 로그는 확인 자체가 불가능해 무용지물이다 (2026-07-27 라이선스 진단 중 지시).

**How to apply:** 진단이 필요하면 읽기 전용 resolver를 하나 만들어 관측치를 `content`로 반환하고, 프론트에서 `invoke` 후 `console.log`. 백엔드 파일에는 로그를 남기지 않는다. 라이선스·권한 가드에 걸리면 정작 차단 상태에서 진단이 안 되므로, 진단 resolver는 `responseWrapper`/`guardedDefine`을 우회해 `resolver.define`으로 직접 등록한다.

관련: [[project-license-enforcement]]
