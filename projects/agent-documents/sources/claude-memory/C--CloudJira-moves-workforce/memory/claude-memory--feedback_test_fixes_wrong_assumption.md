---
name: feedback-test-fixes-wrong-assumption
description: 테스트가 통과해도 잘못된 가정을 고정하고 있을 수 있다 — 플랫폼 제약은 mock으로 검증되지 않는다
metadata: 
  node_type: memory
  type: feedback
  originSessionId: ee1f11af-29c0-4f86-bee4-7efaa54fbbb2
  modified: 2026-07-28T00:10:58.975Z
---

**테스트 통과는 "설계 가정이 옳다"는 증거가 아니다.** 잘못된 가정은 설계 → 구현 → **테스트 순으로 굳어져**, 통과할수록 결함이 확정된다.

**Why:** 팀 기능 P0에서 실제로 발생했다. 설계서가 "KVS는 빈 문자열로 저장해 회피"라고 가정 → 구현이 `|| ''` → 테스트가 `expect(record).toMatchObject({ parentTeamKey: '' })`로 그 동작을 **명시적으로 고정**. 449개가 전부 통과했는데 배포 후 첫 팀 생성에서 즉시 실패했다([[reference-forge-kvs-empty-string]]). mock으로 플랫폼을 대체한 테스트는 그 플랫폼 제약을 검증할 수 없다.

**How to apply:**
- **플랫폼 경계(KVS·SQL·Jira API)의 제약은 로컬 테스트로 증명되지 않는다.** "테스트 통과"를 배포 가능 근거로 쓰지 말고, 실기동에서만 확인 가능한 항목을 **미검증으로 분리해 명시**한다.
- 실기동에서 결함이 나오면 **기존 테스트가 그 결함을 고정하고 있지 않은지 먼저 확인**한다. 고정하고 있으면 테스트도 함께 고쳐야 한다(테스트만 맞추면 다시 굳는다).
- 새 회귀 가드는 **불변식**을 단언한다("어떤 속성도 빈 문자열이 아니다") — 특정 값을 기대하면 그 값이 틀렸을 때 같이 틀린다.
- 검증 코드가 **정말로 검사하는지** 확인한다: 방어를 임시로 제거하고 테스트가 실패하는지 본다. 실패하지 않으면 그 테스트는 아무것도 보증하지 않는다(팀 P1에서 이 방식으로 fail-open 3건을 확인했다).

관련: [[reference-forge-kvs-empty-string]] · [[project-team-management]]
