# resource-profile v3 — Overview "완수율" → "작업량 3값" (프론트 표현만)

> 백엔드/계약 변경 없음. `getResourceLoadSummary` 가 이미 내려주는 `spentSeconds`/`remainingSeconds`/`completionRate` 를 프론트에서 재표현. 쿼리키/훅 변경 없음.

## 1. 택한 단위: MD (근거)

**드로어 현재 상태를 실측한 결과 단위가 섞여 있었다:**
- `InProgressIssueList.jsx`(드로어 진행중 이슈): 이전 세션에서 **MD** 로 전환됨(`toMd`, hourRate 규칙, `resource.profile.issue.md`="{n} MD").
- `LoadSummaryCards.jsx`(드로어 남은 작업량 카드): 여전히 **시간(h)** (`Math.round(s/3600)`, `resource.profile.load.hours`).

→ 드로어의 주력 작업량 표현(이슈 목록)이 이미 MD 이고, 요구가 "MD 환산이면 기존 hourRate 규칙 재사용" 을 명시 → **Overview 작업량도 MD 로 통일**. 겸사겸사 드로어의 h/MD 혼용을 해소(§3).

- MD 환산 규칙(전 컴포넌트 동일): `초 / (hourRate*3600)`, 소수 1자리. `hourRate` 는 `invoke('getSettingData')` 루트 `.hourRate`(기본 8) — `ProjectIssueTable`/progress/InProgressIssueList 와 동일.

## 2. 변경 컴포넌트

| 파일 | 변경 |
|------|------|
| `pages/resource/overview/WorkloadCell.jsx` | **신규** — 진행 바(completionRate) + 3값(할당/처리/남은, MD) + 진행도 %. `completionRate==null → '-'`. 툴팁에 총/처리/남은 브레이크다운 |
| `pages/resource/overview/ResourceOverviewTable.jsx` | 7번째 컬럼 `completion`(CompletionBar) → `workload`(WorkloadCell). `getSettingData` 로 hourRate 1회 조회해 각 셀에 주입(rows useMemo deps 에 hourRate 추가). 헤더 `col.completion`→`col.workload`, tip `overview.completion.tip`→`overview.workload.tip` |
| `pages/resource/overview/profile/LoadSummaryCards.jsx` | (드로어 단위 일관화) "남은 작업량" 카드 시간(h)→**MD**(`resource.profile.issue.md`). hourRate 조회 추가. 완수율 카드는 CompletionBar(%) 유지 |
| `locales/kr·en/resource.json` | `col.workload`, `overview.workload.{tip,spent,remaining,total}` 추가 |

- **CompletionBar.jsx 는 유지**(드로어 LoadSummaryCards 완수율 카드가 계속 사용). Overview 에서만 사용 중단.
- **손대지 않은 영역**: `InProgressIssueList`(이미 MD), Match(CandidateRankTable), 배정현황(allocation/*), Overview 나머지 컬럼·필터·드로어 리사이즈 등 — 무관 영역 회귀 없음.

## 3. 표현 방식

**Overview 작업량 셀(WorkloadCell)**:
```
[▓▓▓▓░░░░] 40%
처리 40 / 남은 60 / 할당 100 MD
```
- 진행 바 width = `completionRate*100`, 색 rate≥0.8 success/≥0.4 info/<0.4 default.
- 셀에 **3값 명시**(처리/남은/할당, MD) + 진행도 %(처리÷할당) 우측.
- 툴팁: `할당: {total} MD` / `처리: {spent} MD ({pct}%)` / `남은: {rem} MD`.
- 총 할당 = `spentSeconds + remainingSeconds` (프론트 계산). `completionRate==null`(spent+rem=0) → `-`(`overview.completion.none` 재사용).
- 배치 미도착 시 기존대로 `-`(비차단 lazy).

**드로어 정합성**: 드로어의 완수율 카드는 profile.load 에 `spentSeconds/remainingSeconds` **총계가 없어**(백엔드 v2 리포트 §2.2: 드로어 load 에 미노출) 3값 구성 불가 → 완수율 카드는 % 바(CompletionBar) 유지. 대신 "남은 작업량" 카드를 MD 로 바꿔 **드로어 전체를 MD 단위로 통일**(이슈 목록 MD 와 일관).

## 4. i18n merge — **실행 완료**

- 신규 키: `col.workload`(작업량/Workload), `overview.workload.tip`(총=처리+남은·진행도=처리÷할당), `overview.workload.{spent,remaining,total}`(처리/남은/할당·Spent/Remaining/Assigned). MD 수치는 기존 `resource.profile.issue.md`("{n} MD") 재사용.
- 기존 `col.completion`/`overview.completion.*` 는 **삭제하지 않음**(드로어 CompletionBar/완수율 카드가 계속 사용, merge 회귀 방지).
- `cd static/ui && npm run merge` 실행 → `ko-KR.json`/`en-US.json` 재생성·키 kr·en 전수 확인. 산출물 직접 수정 없음.

## 5. 빌드/테스트

- `cd static/ui && CI=true npm run build` → **성공(Compiled)**. Compiled-with-warnings 구간 라인 단위 확인 결과 잔여 경고는 사전 존재 3rd-party source-map(`@atlaskit/analytics-next-stable-react-context`, `marklassian`) 뿐, 신규/수정 파일발 경고 **없음**.
- `cd static/ui && CI=true npm test` → **8 suites / 74 tests 전부 통과**(회귀 없음).
