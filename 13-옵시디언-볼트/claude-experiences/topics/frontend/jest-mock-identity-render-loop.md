---
type: topic
tags: [topic, frontend, react, jest, mock, infinite-loop, lesson]
created: 2026-10-10
updated: 2026-10-11
---

# jest mock이 매 렌더 새 객체를 주면 effect가 무한 루프를 돈다 — 그리고 고아 워커가 남는다

> 메모리 `fe-jest-mock-searchparams-loop`에서 추출. 사례: [[2026-10-10-apm-incidents-menu]](`ApmIncidentsPage.test.tsx`)

## 증상
신규 테스트가 "비배수 offset" 케이스에서만 **동기 무한 렌더 루프**(testTimeout도 못 끊음)로 jest가 6회 연속 미완.

## 원인 1 — mock 산물의 참조 불안정
`jest.mock("@/hooks/useQueryParams")`가 `searchParams: new URLSearchParams(...)`를 **호출마다 새로** 만들고, 공용 `DmoveTable.tsx`의 effect deps가 `[onFilter, searchParams, hasQuery]`라 `offset && limit`이 있으면 `setTableParams` → 렌더 → 새 객체 → 무한. 표준 mock도 `new URLSearchParams()`지만 offset/limit이 없으면 else 분기(jest.fn)라 안 터졌다.

→ 표를 쓰는 화면 테스트에서 `offset/limit`을 주면 **`searchParams`를 참조 캐시**로(`mockSearchParamsFor(src)` 패턴).

## 원인 2 — 고아 워커
중단(타임아웃·메모리 reap)된 jest의 `jest-worker/processChild.js`가 26+개·4.2GB 남아 다음 실행이 30분간 출력 0줄. 🔴 **무한 루프 jest는 timeout으로 셸이 끝나도 node 프로세스가 계속 산다**(10-10 21시대 2개가 10-11 오후까지 각 3.6GB → 메모리 reap으로 dev BE·Vite·코덱스까지 연쇄 종료).

→ jest가 멈추면 `-t "<describe>"`로 그룹 이분 탐색(2분 타임아웃), 전체 재실행 금지 · 백그라운드 jest가 killed되면 먼저 `Get-CimInstance Win32_Process | ? CommandLine -match 'jest.*moveseyee_fe'`로 고아 워커 정리 · 포그라운드 `--runInBand`가 reap을 피한다 · 포그라운드 timeout 뒤에도 반드시 `jest` 프로세스를 찾아 죽인다.

## 일반화
- effect deps에 들어가는 값을 mock이 만들면 **참조 동일성**까지 흉내 내야 한다(useMemo로 감싼 실제 훅과 달리).
- 테스트 러너가 멈출 때 "코드가 느리다"보다 "이전 실행이 자원을 쥐고 있다"를 먼저 의심한다.

## 관련
[[2026-10-10-apm-incidents-menu]] · [[static-checks-miss-asset-imports]] · 메모리 `fe-test-runner-npx-jest`
