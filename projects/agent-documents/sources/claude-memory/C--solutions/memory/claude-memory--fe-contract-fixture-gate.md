---
name: fe-contract-fixture-gate
description: FE "계약 샘플 JSON을 타입 주석 픽스처로 박아 tsc가 강제" 게이트는 2026-08-26(ZM-119)까지 실제로 돌지 않았다 — tsconfig가 src/__tests__를 exclude + isolatedModules라 ts-jest도 타입을 안 봄. 정식 게이트는 tsconfig.contract.json + npm run typecheck:contract
metadata:
  type: feedback
---

ZM-116에서 "계약 §5 실응답을 `: TAssetDashboard` 픽스처로 넣어 tsc가 BE↔FE shape를 강제한다"고 보고했으나, **`tsc --noEmit`는 `src/__tests__`를 exclude하고 `isolatedModules: true`라 ts-jest도 타입 검사를 안 해** 그 픽스처는 어디서도 검사되지 않았다. ZM-119 FE 대조 중 발견 — `cloudCount`·`cloudLinked/cloudUnlinked` 누락이 tsc·jest 양쪽을 통과했다.

**Why:** "타입 주석을 붙였다"와 "그 파일이 타입 검사 대상이다"는 다른 일이다. 게이트라고 부르려면 실제로 실패하는 것을 한 번 보여야 한다.
**How to apply:** FE 계약 픽스처는 `C:\...\moveseyee_fe	sconfig.contract.json`(ZM-119 신설, `src/__tests__/fixtures/*ContractSample.ts` 포함)으로 `npm run typecheck:contract`를 돌려 검증한다. QA·검수 체크리스트에 이 명령을 넣을 것. 새 계약 픽스처를 만들면 그 tsconfig의 include에 들어가는지 확인. 관련 [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--asset-dashboard-feature|asset-dashboard-feature]] [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--asset-cloud-integration|asset-cloud-integration]]
