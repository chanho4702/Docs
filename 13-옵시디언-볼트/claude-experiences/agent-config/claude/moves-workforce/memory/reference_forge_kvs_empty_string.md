---
name: reference-forge-kvs-empty-string
description: Forge KVS는 빈 문자열 저장을 거부한다 — 선택 필드는 속성 자체를 생략할 것
metadata: 
  node_type: memory
  type: reference
  originSessionId: ee1f11af-29c0-4f86-bee4-7efaa54fbbb2
  modified: 2026-07-28T00:10:38.484Z
---

**Forge KVS 엔티티는 attribute 값이 빈 문자열(`''`)이면 저장을 거부한다.**

```
Value for attribute "parentTeamKey" cannot be empty
```

→ **선택 필드는 `|| ''` 로 채우지 말고 값이 없으면 속성 자체를 생략한다.**

```js
const record = { id, name, sortOrder };          // 필수만 항상
if (team.parentTeamKey) record.parentTeamKey = String(team.parentTeamKey);
if (team.leaderAccountId) record.leaderAccountId = String(team.leaderAccountId);
```

- 읽기 쪽은 `?? null` / `|| null` 정규화가 이미 있으면 그대로 안전하다(`undefined` → `null`).
- KVS `save`는 **전체 덮어쓰기**이므로 속성을 생략하면 그 값이 사라진다 = **해제**. 의도적으로 쓸 수 있다.
- manifest `attributes` 선언은 여전히 필요하다([[project-kvs-entity-manifest-schema]]) — 선언과 저장은 별개다.

**발견 경위 (2026-07-27, 팀 기능 P0)**: 설계 단계에서 "`null`/미설정은 KVS 취급이 불명확하니 `''`로 저장해 회피"라고 **정반대로 가정**했고, 루트 팀 최초 생성(상위가 없음)에서 배포 직후 즉시 실패했다.

**같이 기억할 것**: 로컬 테스트 449개가 통과했는데도 터졌다. 잘못된 가정이 설계 → 구현 → **테스트 순으로 굳어져**, `expect(record).toMatchObject({ parentTeamKey: '' })` 같은 테스트가 결함을 고정하고 있었다. mock 으로 플랫폼을 대체한 테스트는 그 플랫폼 제약을 검증하지 못한다 — [[feedback-test-fixes-wrong-assumption]]

관련: [[project-team-management]] · [[reference-forge-storage-limits]]
