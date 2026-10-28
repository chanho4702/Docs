# 2026-08-04 — 자산 비용 M2 대시보드 (설계 재정의 + S1·S2 구현)

관련: [[projects/moveseye/moveseye|moveseye]] · [[projects/moveseye/2026-07-08-assets-management|2026-07-08-assets-management]] · [[projects/moveseye/2026-08-03-implementation-risk-audit|2026-08-03-implementation-risk-audit]]
산출물: `C:\solutions\_workspace\work_cost-dashboard-m2.md` (작업 기록 정본) · `plan_cost-dashboard.md` · `contract_asset-cost.md` §5-D

---

## 무슨 일이 있었나

비용 대시보드를 예산·점수 축으로 설계해 뒀는데, 사용자가 본질을 다시 정의했다.

> **"결국 해당 페이지의 본질은 관리하고 있는 장비들의 비용들을 추적 관리 하는거야"**

그래서 **회계 축 → 지출 축**으로 갈아엎고 예산 EP·종합 점수·마일스톤을 전부 뺐다.
화면이 답하는 질문은 셋으로 줄었다 — **얼마어치 샀고 / 지금 얼마 나가고 / 앞으로 얼마 더 나가는가.**

S1(집계 EP)·S2(탭 + 전용 필터) 구현·커밋 완료. S3(QA)는 미착수.

---

## 교훈

### 1. 🔴 훅을 mock한 테스트는 "연결"을 검증하지 않는다

대시보드 KPI가 전부 ₩0으로 떴다. 원인은 **API 경로 오타** — `baseUrl`(`/costs/hw`)에
`/dashboard`를 이어 붙여 `/costs/hw/dashboard`로 나갔고 `/costs/hw/{assetId}`에 걸려 500.

**테스트 7건은 전부 통과했다.** `useCostDashboard`를 mock했으니 당연했다.
같은 세션에서 이미 한 번 겪은 부류다(F-1: 조회 서비스가 `unwrapEnvelope`를 써서 2겹 언랩 → `data` 항상 undefined).

→ **서비스 레이어(경로·언랩)는 훅을 mock하지 않는 테스트로 최소 1건 덮어야 한다.**
→ 그리고 **브라우저로 한 번 열어보기 전엔 "됐다"고 하지 말 것.** 두 번 다 화면이 잡았다.

### 2. 🔴 `updateParams` 연속 호출은 서로를 덮어쓴다

"전체 해제"가 마지막 필터 하나만 지웠다.

```ts
// ❌ 6번 호출 → 각 호출이 같은 렌더의 searchParams 스냅샷에서 새 쿼리를 만들어 navigate
//    → 마지막 것만 남는다
KEYS.forEach((key) => onFilter(key, undefined));

// ✅ 한 번에 모아 보낸다
updateParams(KEYS.map((key) => ({ key, value: null })));
```

`useQueryParams.updateParams`는 `const current = new URLSearchParams(searchParams)`로 시작한다.
`searchParams`는 **그 렌더에 고정**이라 연속 호출이 누적되지 않는다.
[[fe-page-remount-on-navigate]] 계열의 함정 — URL을 상태로 쓰는 구조의 대가다.

### 3. 필터 후보값은 "필터 적용 **전**" 모집단에서 뽑는다

적용 후로 뽑으면 `owner=A`를 고르는 순간 후보가 `[A]` 하나로 줄어 **다른 값으로 갈아탈 수 없다.**
목록 탭은 현재 페이지 10건에서 파생시켜 이미 이 문제를 갖고 있었고, 대시보드는 목록 자체가 없어
그 방식을 쓸 수도 없었다 → BE가 `filterOptions`를 내려주게 했다.

실측 검증: `owner=보안팀&vendor=Dell`로 **0건**이 돼도 `owners` 5종이 그대로 유지됨.

### 4. 🔴 "flaky 테스트"라고 부르기 전에 실제로 돌려볼 것

`useGroupReportHostCompare.test.ts`를 세션 내내 **"기존 flaky"**로 넘겼는데,
실제로는 `SyntaxError: Cannot use 'import.meta' outside a module`로 **테스트 0건 실행**이었다.
통과도 실패도 아니고 아예 안 돈다. **2026-06-24 `#ZM-77` 이후 줄곧** — 훅 커버리지가 두 달 넘게 0이었다.

원인은 레포 규약(`CLAUDE.md` 필수 Mock 패턴) 미준수 — `@/services/axiosInstance` mock 누락.
→ **"1건 실패"를 요약에서 상습적으로 같은 문구로 넘기면 그게 정상이 된다.**

### 5. 비망가액 1,000원이 "상각 완료" 판정을 깬다

"상각 완료 = 장부가 0"으로 잡으면 한국 세무 관례상 남는 **비망가액 1,000원** 때문에
완료 자산이 **0건**이 된다. → `depreciationStatus === 'completed'`로 판정.
(Codex 설계검토가 잡아준 2건 중 하나. 다른 하나는 `hwTotal`을 "상각비"로 부르려던 것 — 실제로는 총합.)

### 6. Chrome MCP 탭은 클릭도 못 먹을 수 있다

[[chrome-mcp-hidden-tab-no-raf]]에 더해, 이번엔 **뷰포트가 0x0**이 되면서
클릭이 등록되지 않고 스크린샷이 파라미터 에러로 실패했다.
→ 화면 상호작용이 막히면 **API 레벨로 계약을 직접 검증**하는 우회로가 더 빠르다(§3이 그 사례).
→ 단, 그렇게 검증한 것과 못 한 것을 **보고에서 갈라 말할 것.**

---

## 열린 항목

- 🔴 **F-2 업로드 경합 미검증** — 배포 전 필수(`moveseye-be-spring/CLAUDE.md` §1)
- S3 QA 문서 미착수 · 브라우저 상호작용 2건 런타임 미검증
- `useGroupReportHostCompare.test.ts` 복구(§4)
- FE 14 · BE 11 커밋 미푸시
