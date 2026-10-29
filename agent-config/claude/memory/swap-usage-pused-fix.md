---
name: swap-usage-pused-fix
description: "MemoryService swap 사용률을 vm.memory.pused→system.swap.size[,pused]로 정정 (원본 Nest 복붙 버그, 의도된 동작으로 1:1 이탈)"
metadata: 
  node_type: memory
  type: project
  originSessionId: 5aad34a9-af49-424f-969b-c09ac651ddd6
---

**2026-07-02: `MemoryService.getSummarySwap`의 usagePercentage 계산 버그 수정.** 사용자가 "원본이 문제 있을 수 있으니 의도된 동작으로 고쳐라"고 명시 → 1:1 보존 예외.

**버그:** swap 요약의 `usagePercentage`가 스왑이 아니라 **메모리** 사용률로 계산됐다. `getSummarySwap`이 `vm.memory.pused`(메모리 키)를 참조하고, 조회에도 일부러 memory pused를 포함했다. **원본 Nest도 동일 버그**(`memory.service.ts` swap 함수의 변수명이 `vmMemoryUsagePercentage`, `getSummaryMemory`에서 복붙된 흔적) → Spring이 그대로 포팅.

**의도된 정답:** swap 사용률의 정본 키는 `system.swap.size[,pused]`(`SYSTEM_SWAP_SIZE_PUSED`). line-chart `SWAP_UTILIZATION`이 Nest·Spring 양쪽 다 이 키를 쓰는 것으로 확증.

**수정(Spring만):** `resolveUsagePercentage(items, pusedKey, currentUsage, total)`로 pused 키 파라미터화 → memory는 `VM_MEMORY_PUSED`, swap은 `SYSTEM_SWAP_SIZE_PUSED` 전달. swap 조회 searchKeys에서 불필요한 `VM_MEMORY_PUSED` 제거(SYSTEM_SWAP_SIZE substring 검색이 [,pused] 포함). 폴백(`pused||(used/total)*100`)·응답 shape 불변. build+test 그린.

⚠️ **출력 변화:** swap `usagePercentage`가 실제 스왑 기준으로 바뀜(이전엔 메모리값). FE(:3000=Spring)에 반영되려면 재기동 필요. 원본 Nest와 대조 시 "다르다"고 되돌리지 말 것 — 의도된 정정.

관련: [[be-dual-maintenance]]