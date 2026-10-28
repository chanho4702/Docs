# 작업 기록 — 자산 비용 M2 대시보드 (S1·S2)

> 기간: 2026-08-04 · 담당: Claude 단독(`COLLAB.md` = `SOLO-CLAUDE`, 검수는 Codex)
> 관련: [설계](solutions--devdesign_asset-cost.md) §8.3 · [계약](solutions--contract_asset-cost.md) §5-D · [계획](solutions--plan_cost-dashboard.md) · [설계검토](solutions--design-review_cost-dashboard.md)

---

## 0. 한 줄 요약

`GET /costs/dashboard` 집계 EP(S1)와 대시보드 탭 + 전용 필터(S2)를 구현·커밋했다.
**S3(QA)까지 완료**했다 — 집계 교차검증 34/34 · 상각비 손계산 6/6 PASS, 코드 결함 0건.
브라우저 상호작용 3건은 Chrome 확장 권한 상실로 미검증이다.

---

## 1. 방향 재정의 (이게 이번 작업의 핵심 전제)

사용자 정의: **"해당 페이지의 본질은 관리하고 있는 장비들의 비용을 추적·관리하는 것"**

그래서 화면 언어를 **회계 축 → 지출 축**으로 갈아엎었다.

| 뺀 것 | 이유 |
|---|---|
| 예산(budget) EP·화면 | 감가상각은 **통제 가능한 지출이 아니다**. 예산을 여기 대는 게 아니라 여기서 예산이 나온다(방향이 반대) |
| 종합 점수·마일스톤 | 자산 비용 추적과 무관 |
| 장부가액·상각 완료를 전면에 | 회계 개념. 보조 지표로만 남김 |

화면이 답하는 질문은 셋이다 — **얼마어치 샀고 / 지금 얼마 나가고 / 앞으로 얼마 더 나가는가.**

🔴 **비현금(상각)과 현금성(유지보수·리스)을 반드시 분리해 보여준다.** 총액 하나로 뭉치면
실제로 나가는 돈이 안 보인다. 예산을 뺀 근거와 직결된다.

---

## 2. 산출물

### BE — `moveseye-be-spring` (마이그레이션 없음)

| 파일 | 내용 |
|---|---|
| `cost/CostService.java` | `getDashboard()` + `buildDashboardKpi` / `forecastMonths` / `annualRecurring` / `buildDashboardWidgets` / `buildReviewCandidates` / `buildFilterOptions` |
| `cost/dto/CostDashboardResDto.java` (신규) | KPI 13필드 · 위젯 5종 · `reviewCandidates` · `filterOptions` · `period` |
| `test/.../CostDashboardServiceTest.java` | 판정·분류 규칙 6건 |

모집단·계산은 **EP4(`/costs/hw`)와 같은 경로**를 쓴다 — 두 화면의 숫자가 갈리면 안 된다.

### FE — `moveseyee_fe`

| 파일 | 내용 |
|---|---|
| `pages/asset/cost/CostDashboardTab.tsx` (신규) | KPI 5 · 위젯 5 · 검토 후보 테이블 |
| `pages/asset/cost/components/CostDashboardFilter.tsx` (신규) | 기본 3종 + 추가 3종(접기) |
| `pages/asset/cost/components/CostMonthlyForecastCard.tsx` (신규) | 12개월 스택 막대(상각/유지보수/리스) |
| `pages/asset/cost/components/CostReviewTags.tsx` (신규) | 사유 태그 복수 표시 |
| `components/CostPeriodHeader.tsx` | 화면 설명 좌측 + 기간을 우측 보조 영역으로 강등 |
| `types/cost.ts` · `services/cost.api.ts` · `hooks/useCost.ts` · `constants/queryKey.ts` | 타입·서비스·훅·쿼리키 |
| `locales/{kr,en}.json` | 44키 × 2 |
| `__tests__/CostDashboardTab.test.tsx` (신규) | 10건 |

### 커밋

FE 2건 · BE 2건 (+ 협업 배너 문서 2건). 전부 `ZM-87`, **미푸시**(FE 14 · BE 11 누적).

---

## 3. 화면 구성 (확정)

```
[화면 설명 · 기간(우측 보조) · 소급 재계산 고지 · 새로고침]
[기기유형 ▾][소유자 ▾][라이프사이클 ▾]  추가 필터 ▾     필터 n개 적용 중 [전체 해제]
  └ 펼치면: [위치 ▾][제조사 ▾][비용 정보 ▾]
[ⓘ 현재 조건에 해당하는 n건 기준입니다]
[총 취득원가][이번 기간 총 자산비용 + 내역][향후 12개월 예상][연간 유지비][비용 미입력]
[12개월 월별 예상(스택)]      [비용 구성]  [기기분류별]
[소유자별]                    [만료 현황: 경과/30/60/90 + 만료일 미상]
[확인이 필요한 자산 — 자산당 1행 + 사유 태그 복수]
```

---

## 4. 잡은 결함

| # | 결함 | 원인 | 어떻게 드러났나 |
|---|---|---|---|
| **D-1** | 대시보드 KPI가 전부 ₩0 | `baseUrl`(`/costs/hw`)에 `/dashboard`를 이어 붙여 `/costs/hw/dashboard`로 요청 → `/costs/hw/{assetId}` 패턴에 걸려 **500** | 브라우저. **테스트 7건은 전부 통과했다**(훅을 mock하니까) |
| **D-2** | 필터 UI가 통째로 누락 | 파라미터는 읽는데 바꿀 화면이 없었다 | 요구사항 대조 |
| **D-3** | "전체 해제"가 마지막 필터 하나만 지움 | `updateParams`는 매 호출이 **같은 렌더의 `searchParams` 스냅샷**에서 새 쿼리를 만들어 navigate → 연속 호출이 서로를 덮어씀 | 코드 리뷰. 회귀 테스트로 고정(되돌리면 실패 확인) |
| **D-4** | 후보값을 어디서 가져올지 | 목록 탭 방식(현재 페이지 10건에서 파생)은 대시보드에 목록이 없어 불가 | 설계 |

### 설계검토(Codex)가 잡은 것

1. `hwTotal`을 "이번 기간 상각비"로 쓰려 했으나 **총합**이었다 → 이름이 거짓말을 할 뻔
2. "상각 완료 = 장부가 0"으로 판정하면 안 된다 → `depreciationStatus === 'completed'`로 판정.
   (당시 근거는 비망가액 1,000원이었으나 그 기본값은 2026-08-05에 폐기됐다. 판정 방식은 그대로 유효하다 —
   자산별 `residual_value`를 지정하면 완료 자산의 장부가액이 0이 아니게 되기 때문이다.)

---

## 5. 검증 결과

| 항목 | 결과 |
|---|---|
| `tsc --noEmit` | 0 |
| FE 테스트 | 801 통과 (스위트 1건 실패 — §6 참조) |
| 프로덕션 빌드 | 성공 |
| BE `compileJava` | 0 |
| 대시보드 API | **200** · 총 취득원가 ₩1,847,900,000 · 이번 기간 ₩34,018,525(상각 21,719,110 + 유지보수/리스 12,299,415) · 12개월 예상 ₩389,706,081 · 연간 유지비 ₩147,592,980 · 미입력 11 · 검토 후보 40 |
| 필터 반응 | 79건 → 0건으로 KPI·위젯 전부 반응, 빈 상태 정상 |
| **`filterOptions` 계약** | **PASS** — `owner=보안팀&vendor=Dell`로 0건이 돼도 `owners` 5종 그대로 유지 |
| 추가 필터 자동 펼침 | URL에 `vendor=Dell`이 있으면 펼친 채 시작 · "필터 2개 적용 중" 정상 |

부수 확인: dev 데이터에 **`location` 값이 0건, `vendor`는 `Dmove` 하나뿐**이다.
위치 드롭다운이 비어 보이는 건 데이터가 없어서지 버그가 아니다.

### 🔴 런타임 미검증 2건

브라우저 탭 뷰포트가 0x0이 되면서 **클릭이 등록되지 않고 스크린샷도 실패**했다.

- 드롭다운을 실제로 열어 후보값 보기 (API로는 검증됨)
- "전체 해제" 버튼 **실제 클릭** (단위 테스트로만 덮임)

---

## 6. 🔴 정정 — "기존 flaky 테스트"는 flaky가 아니다

`src/__tests__/hooks/useGroupReportHostCompare.test.ts`를 이번 세션 내내
**"기존 flaky"로 넘겼는데, 실제로는 완전히 깨진 스위트다.**

```
SyntaxError: Cannot use 'import.meta' outside a module
Tests: 0 total
```

- 테스트가 **0건 실행된다**. 통과도 실패도 아니고 아예 안 돈다.
- 원인: 대상 훅이 전이적으로 Vite `import.meta.env` 사용 모듈을 끌어오는데
  이 테스트는 `@/services/axiosInstance`를 mock하지 않는다(레포 규약 위반 — `CLAUDE.md` 필수 Mock 패턴).
- **2026-06-24 `#ZM-77` 이후 줄곧 이 상태**였다. 이번 작업과 무관한 선재 결함이다.
- 즉 `useGroupReportHostCompare` 훅은 **두 달 넘게 테스트 커버리지가 0**이었다.

→ ✅ **해소(2026-08-05)** — `@/services/axiosInstance` mock 추가로 **7건이 실제로 돌고 전부 통과**한다.
  (커밋: FE `fix(test)`)

---

## 7. 남은 작업 (2026-08-05 갱신)

| 우선순위 | 항목 | 상태 |
|---|---|---|
| ~~🔴 배포 전 필수~~ | ~~F-2 업로드 경합 검증~~ | ✅ **해소** — `CostBulkUploadJobConcurrencyIT` 6건(실 DB 경합). 조건 하나 빼면 3건 실패로 검출력 실증 |
| ~~높음~~ | ~~S3 QA/E2E 문서~~ | ✅ **완료** — [qa_](solutions--qa_cost-dashboard.md) 34/34 + 손계산 6/6 · [e2e_](solutions--e2e_cost-dashboard.md) |
| ~~중간~~ | ~~`useGroupReportHostCompare.test.ts` 복구~~ | ✅ **해소** — 0건 실행 → 7건 통과 |
| ~~🔴 사용자 결정~~ | ~~잔존가액 0이 의도인가~~(QA F-3) | ✅ **결정·반영 완료(2026-08-05)** — 기본 잔존가액 **0**. 코드·테스트·문서·FE 문구·목업 데이터 전부 정렬 |
| 🔴 **차단됨** | 브라우저 상호작용 3건(B-1~B-3) | Chrome 확장의 localhost 접근 권한 상실 — 사용자 조치 필요 |
| ~~설계 격차 1~4순위~~ | ~~G-1 전기 대비 · G-3 드릴다운 · G-7 우선순위 · G-6 연결 누락~~ | ✅ **완료(2026-08-05)** — BE `f361381` · FE `d3cb9ab`. [격차 분석](solutions--gapanalysis_cost-dashboard.md) |
| ~~중간~~ | ~~설계 격차 G-2 과거 추이~~ | ✅ **완료(2026-08-05)** — BE `0243a98` · FE `bc7141b` |
| ~~중간~~ | ~~설계 격차 G-8 조회 결과 내보내기~~ | ✅ **완료** — HW 탭, 조회 조건 전체 xlsx |
| 낮음 | 설계 격차 G-5 만료 정의 통일 | M1 `expiryWindow`를 M2 정의로 |
| ~~중간~~ | ~~dev 목업의 `residual_value` 정리~~(QA F-2) | ✅ **완료** — 명시값 제거, 기본값 경로로 전환(수치 불변) |
| 중간 | M2 Codex 검수 요청 | `COLLAB.md` §8 |
| 낮음 | 커밋 푸시 | 사용자 지시 대기 |
| 보류 | M3 클라우드 탭 · 수집 엔진 스텝 6 | 사용자 결정으로 보류 |
| 잔여 | `addonAfter`·`useForm` deprecated 경고 정리 | 오래된 보류 항목 |
