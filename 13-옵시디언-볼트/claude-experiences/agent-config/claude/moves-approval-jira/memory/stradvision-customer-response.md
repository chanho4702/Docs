---
name: stradvision-customer-response
description: 스트라드비전(Tempo 사용 고객) 요구 대응 문서 위치와 고객에게 약속하면 안 되는 8가지 수용 기준 (2026-10-13)
metadata:
  node_type: memory
  type: project
  originSessionId: 8760aad1-44b4-499a-b6d3-1910f8fc00a0
  modified: 2026-10-13T01:20:08.112Z
---

고객 스트라드비전(디무브 영업: Andy Wi·Allen Park·Tom Kim) 요구 5건의 대응 문서는 `_workspace/stradvision-2026-10-13/STRADVISION_RESPONSE.md`(2판, 코덱스 검토 반영). 두 앱(워크포스+어프로벌) 번들로 제안.

**Why:** 미팅 기록은 워크포스 단독 기준으로 "락킹·승인 불가"라고 적혀 있었고, 어프로벌을 포함하면 판정이 바뀐다. 코덱스 검토(2026-10-13)가 "구현됨 ≠ 제공 가능" 혼합을 잡았다.
**How to apply:** 이 고객 관련 문서·회신을 쓸 때 §0 수용 기준 8항(Preview 2건, 제공자 사이트당 하나, 잠금은 확정분 수정·삭제만, FLAG 는 인증 비차단, 이력은 수집 이후분, 원가는 `legacySeconds` 폴백, preUninstall 보조, 내보내기 ≠ 백업)을 벗어나는 약속을 쓰지 않는다. 배포 관문 실측(G_ROLE→G_PRESERVE→G_BLOCK→G_AGG→G_RECOVER) 전에는 Phase B 를 약속하지 않는다. 관련: [[worklog-certification-model]] [[codex-model-cost]]
