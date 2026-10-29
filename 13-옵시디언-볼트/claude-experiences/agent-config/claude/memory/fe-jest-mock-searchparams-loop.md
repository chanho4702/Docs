---
name: fe-jest-mock-searchparams-loop
description: "FE jest가 영영 안 끝날 때 — useQueryParams mock이 렌더마다 새 URLSearchParams를 만들면 DmoveTable effect가 무한 setState(offset&limit 있을 때만), 중단된 jest의 고아 워커가 메모리를 잡아 후속 실행까지 막음"
metadata:
  node_type: memory
  type: feedback
  originSessionId: e05d80c9-f57f-4b0d-a549-a1c837b68a1b
  modified: 2026-10-11T05:27:48.589Z
---

2026-10-10 실측. 신규 테스트가 "비배수 offset" 케이스에서만 **동기 무한 렌더 루프**(testTimeout도 못 끊음)로 jest가 6회 연속 미완.

**원인 1 — mock 산물**: 테스트의 `jest.mock("@/hooks/useQueryParams")`가 `searchParams: new URLSearchParams(...)`를 **호출마다 새로** 만들고, 공용 `components/Table/DmoveTable.tsx`의 effect deps가 `[onFilter, searchParams, hasQuery]`라 `offset && limit`이 있으면 `setTableParams` → 렌더 → 새 객체 → 무한. CLAUDE.md 표준 mock도 `new URLSearchParams()`지만 offset/limit이 없으면 else 분기(jest.fn)라 안 터짐.
**원인 2 — 고아 워커**: 중단(타임아웃·메모리 reap)된 jest의 `jest-worker/processChild.js`가 26+개·4.2GB 남아 다음 실행이 30분간 출력 0줄.

**How to apply:**
- 표를 쓰는 화면 테스트에서 `offset/limit` 파라미터를 주면 **`searchParams`를 참조 캐시**로(`mockSearchParamsFor(src)` 패턴, `ApmIncidentsPage.test.tsx`).
- jest가 멈추면 `-t "<describe>"`로 그룹 이분 탐색(2분 타임아웃) — 전체를 다시 돌리지 말 것.
- 백그라운드 jest가 killed되면 먼저 `Get-CimInstance Win32_Process | ? CommandLine -match 'jest.*moveseyee_fe'`로 고아 워커를 정리하고 여유 메모리 확인. 포그라운드 `--runInBand`가 reap을 피한다.
- 🔴 **무한 루프 jest는 timeout으로 셸이 끝나도 node 프로세스가 계속 살아 있다**(10-10 21시대 2개가 10-11 오후까지 각 3.6GB 점유 → 메모리 reap으로 dev BE·Vite·코덱스까지 연쇄 종료). 포그라운드 timeout 후엔 반드시 `jest` 프로세스를 찾아 죽일 것.
- 관련 [[fe-test-runner-npx-jest]] [[apm-incidents-menu]]
