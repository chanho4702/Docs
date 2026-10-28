# resource-profile v2 — 인력 현황(Overview) 테이블 재구성

기존 resource-profile 라운드(통과 완료) 위에 얹는 **Overview 테이블 컬럼 재구성** 요구. 드로어/Match는 유지, Overview 테이블과 그 백엔드(`getResourceLoadSummary`)를 확장한다.

## 최종 테이블 컬럼 (확정)
| # | 컬럼 | 비고 |
|---|------|------|
| 1 | 인력 | 유지 |
| 2 | 직무(role) | 유지 |
| 3 | 등급(level) | 유지 |
| 4 | 가동율(util) | 유지 |
| 5 | **할당된 이슈 수 (할일 / 진행 / 완료)** | Jira 상태 카테고리 3분류(To Do / In Progress / Done) 카운트. 한 셀에 3값 표기 |
| 6 | **참여중인 프로젝트 수** | 신규 |
| 7 | **완수율** | 프로그레스 바 + %. 아래 정의 |
| — | 보유 스킬 | **테이블에서 제거 → 사이드 드로어(ResourceProfileDrawer)로 이동**. 스킬 편집도 드로어에서 |
| — | 배정가능(available) 배지 | **제거** (가동율/완수율/이슈수와 중복) |

## 완수율 정의 (확정)
```
완수율 = Σ spentSeconds / (Σ spentSeconds + Σ remainingEstimateSeconds) × 100%
```
- 인력이 맡은 **전체 할당 이슈** 합산 기준.
- spent도 remaining도 0인 이슈만 있는 사람 → 분모 0 → 완수율 **null**(UI에서 `-` 표기).
- **분모를 original estimate로 잡지 않는 이유**: original 미입력 이슈가 흔해 왜곡·초과(>100%) 발생. `spent/(spent+remaining)`은 항상 0~100%로 안정적(Jira 진척바 표준).
- 값 3종(spent/remaining/original)은 이슈 검색 응답 `fields.timetracking`에서 바로 획득 → **워크로그 개별 페치 없음(N+1 회피)**.

## 백엔드 변경 핵심 (`getResourceLoadSummary` 확장)
현재 페처는 `statusCategory = "In Progress"`만 긁는다. 이제 **전체 할당 이슈**(할일+진행+완료)로 확장해 상태 카테고리별 카운트 + spent/remaining 집계 + 완수율 산출.

### 반드시 architect가 다룰 설계 결정
1. **완료(Done) 이슈 범위 & 성능**: 완료 이슈를 무한정 과거까지 긁으면 무겁다(오래된 프로젝트 이슈 대량). 완수율 분모에 Done의 spent가 필요하므로 완전 제외는 안 됨. **기간 제한(예: 최근 N개월 updated)** 또는 **활성 프로젝트 소속 이슈만** 등 범위 한정 전략을 정하고 근거를 남길 것. Overview는 전원 배치라 볼륨 민감.
2. **"할당" 정의**: assignee OR coworker(movesRmsCoworkers) — 기존 진행중 페처와 동일 기준 유지. statusCategory 필터만 제거/확장.
3. **균등 분할 규칙**: 이슈 수 카운트는 관여 건수(분할 안 함). spent/remaining 집계는 기존 균등 분할 규칙(참여자 수로 나눔)을 유지할지 결정 — 단 **완수율은 비율이라 분자·분모를 같은 참여자 수로 나누면 상쇄되어 값 불변**. 따라서 완수율 계산엔 분할 무관, 이슈 수 카운트만 관여 건수. (혼선 없게 명시)
4. **참여중 프로젝트 수 소스**: `project_users`의 활성(미종료) 프로젝트 참여 카운트 vs 할당 이슈의 distinct project. 요구는 "참여중인 프로젝트"이므로 project_users 활성 프로젝트 카운트가 자연스러움 — architect가 판단해 확정. 기존 `buildPeopleContext`/`isProjectClosed` 재사용 가능.
5. **응답 shape 변경**: `getResourceLoadSummary` content.load[] 항목을 확장:
   `{ accountId, todoCount, inProgressCount, doneCount, projectCount, spentSeconds, remainingSeconds, completionRate(0~1 or null) }` (필드명은 architect가 계약표로 확정). generatedAt 유지.
   - **드로어(`getResourceProfile`)의 load에도 완수율/상태별 카운트를 노출할지** 검토(일관성). 최소 Overview용은 필수.

## 프론트 변경 핵심
- `ResourceOverviewTable.jsx` 컬럼 전면 재구성(위 표). 스킬/편집/available 컬럼 제거.
- 스킬 표시+편집을 드로어로 이동(드로어 경험 섹션에 이미 스킬 있음 — 편집 진입점 추가).
- 완수율 프로그레스 바 컴포넌트(Atlaskit `@atlaskit/progress-bar` 설치 여부 확인, 없으면 기존 커스텀 패턴 재사용).
- 할당 이슈 셀: "할일 N / 진행 N / 완료 N" 3분할 표기.
- i18n 키 추가(completion/todo/done/projectCount 등), merge 실행.

## 준수 (기존 라운드 교훈 유지)
- 공통 워크로그 페처 미수정, 전용 페처(ResourceLoadFetcher) 내에서 확장 ([[feedback-worklog-fetch-isolation]]).
- asApp 금지, asUser ([[feedback-no-asapp]]).
- 가동율 rollup 1회 read 재사용.
- 경계면 컨벤션: 조립조회 = `res.content`.
- i18n: locales/kr·en 폴더 추가 후 merge (ko-KR/en-US 직접수정 금지).
- 하위호환: `getProjectSkillMatch`는 이번 변경 대상 아님(그대로).
