---
name: skip-edge-cases
description: 엣지 케이스 과잉 대응 지양 — 실제 발생 가능성 기준으로 우선순위를 판단할 것
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 8a675a42-9592-4a71-a6bd-abed62aabc9b
  modified: 2026-08-04T04:47:18.570Z
---

리뷰나 검증에서 나온 지적을 전부 고치려 하지 말 것. 사용자 지시(2026-08-04): "너무 엣지 케이스에 대한 건 고려 안 해도 됨".

**Why:** 코덱스 등 외부 검토는 이론적 결함까지 빠짐없이 나열한다. 그대로 다 대응하면 실제 사용자가 겪지 않는 문제에 시간을 쓰고 정작 기능 완성이 늦어진다.

**How to apply:** 지적을 두 갈래로 나눠 보고한다.
- **대응** — 평범하게 쓰면 만나는 것: 항상 발생하거나 기능을 쓰면 바로 드러나는 것, 데이터가 잘못 들어가거나 사라지는 것, 권한이 새는 것
- **보류** — 조건이 정확히 겹쳐야 터지는 동시성 경합, 드문 인프라 실패(큐 부분 실패 등), livelock 같은 이론적 시나리오

보류한 것도 **무엇을 왜 미뤘는지는 밝힌다**(조용히 빠뜨리지 않는다). 판단이 애매하면 발생 조건을 한 문장으로 제시하고 사용자에게 물을 것.

RFC-171 사례([[projects/agent-documents/sources/claude-memory/C--CloudJira-moves-workforce/memory/claude-memory--project_project_subscription|project_project_subscription]]): 21건 지적 중 "스케줄 스윕에서 baseline 누락(항상 발생)"·"미리보기 권한 우회"·"프로젝트 전환 시 필터 잔존"은 즉시 고쳤고, "겹치는 소스의 이슈 소유권 경합"은 두 프로젝트가 겹치는 소스를 구독해야 성립하므로 보류했다.
