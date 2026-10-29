---
name: codex-model-cost
description: "코덱스 구현 위임은 gpt-6.1-sol + medium, 작업 중 검토는 사용자 요청(2026-10-21)으로 최상위 모델(gpt-6-astra + xhigh)"
metadata:
  node_type: memory
  type: feedback
  originSessionId: d3aa1205-9e90-45dd-b50f-05f4b19d6c27
  modified: 2026-10-21T07:18:47.216Z
---

코덱스에게 **구현**을 맡길 때 기본은 `-m gpt-6.1-sol -c model_reasoning_effort="medium"`. 구현 위임에 gpt-6-astra + xhigh 는 쓰지 않는다.
**검토**(작업 중 커밋 전 독립 검수)는 2026-10-21 사용자가 "작업 간 코덱스 최상위 모델 검토받고"라고 지시 → `-m gpt-6-astra -c model_reasoning_effort="xhigh"`, read-only.

**Why:** 2026-10-11 "코덱스 적당한 모델로 내려줘, 너무 비싸다"(astra/xhigh 구현 중단). 2026-10-21 검토만큼은 최상위로 받으라고 명시.
**How to apply:** 구현 위임 sol/medium, 검토 astra/xhigh. 실행은 `node C:/Claude/node_modules/@openai/codex/bin/codex.js exec ... - < prompt.md`(Git Bash, 프롬프트는 stdin — 큰 diff 를 인자로 넘기면 "Argument list too long"). 구현은 `-s workspace-write -c windows.sandbox=unelevated -c approval_policy=never`, 프롬프트에 "UTF-8 로 읽고 apply_patch 로 쓰라". 관련: [[worklog-certification-model]], [[codex-exec-stdin]]
