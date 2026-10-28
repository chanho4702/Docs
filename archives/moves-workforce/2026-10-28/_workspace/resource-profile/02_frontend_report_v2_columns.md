# Resource Profile v2 (Overview 테이블 재구성) — 프론트엔드 리포트

> v1(`02_frontend_report.md`) 위에 얹는 델타. `02_backend_report_v2_columns.md` 의 실제 응답 shape 을 단일 진실로 소비.

## 1. 소비한 응답 shape (백엔드 v2 계약 준수, 전부 `res.content`)

### 1.1 `getResourceLoadSummary()` — LoadRow 확장 (`useResourceLoadSummary.js`)
`res.content.load[]` → `Map(accountId → LoadRow)` 병합. LoadRow 7필드 전부 소비:
`{ todoCount, inProgressCount, doneCount, projectCount, spentSeconds, remainingSeconds, completionRate(0~1|null) }`.
- 이슈·프로젝트 둘 다 없는 사람은 배열 생략 → Map 미존재 시 **전 카운트 0 / completionRate null** 기본값 취급.
- Overview 테이블 5~7 컬럼은 이 Map 으로 **lazy hydrate**(테이블 즉시 렌더, `isLoadPending && !load` 이면 '-', 비차단).

### 1.2 `getResourceProfile({ accountId })` — load 확장 (`useResourceProfile.js` v1 그대로, 소비처만 확장)
`res.content.load` 에 v1 필드(`inProgressCount`, `remainingEstimateSeconds`, `util`, `utilBand`) 유지 + v2 신규(`todoCount`, `doneCount`, `completionRate`, `projectCount`). `inProgressIssues`/`experience`/`profile` 은 v1 그대로.
- 백엔드 노트대로 드로어 load 에는 `spentSeconds`/`remainingSeconds` 미노출(완수율 내부 산출용) → 프론트는 `completionRate` 값만 사용. LoadSummaryCards 는 `todoCount/inProgressCount(v1)/doneCount/completionRate/projectCount` 로 카드 구성.

### 1.3 `getProjectSkillMatch` — v2 변경 없음 → **CandidateRankTable 손대지 않음**(v1 부하 컬럼 유지).

- `remainingEstimateSeconds`/`completionRate` 는 소수 가능 → 시간 `Math.round(s/3600)`, 완수율 `Math.round(rate*100)%` 반올림 표기.

## 2. 신규/수정 파일

| 파일 | 변경 |
|------|------|
| `overview/useResourceLoadSummary.js` | Map 반환 필드를 v2 LoadRow 7필드로 확장(미존재 카운트 0/completionRate null) |
| `overview/CompletionBar.jsx` | **신규** — 완수율 바(§CompletionBar 이탈 참고). null→'-', ≥0.8 success/≥0.4 info/<0.4 default, `{n}%` |
| `overview/AssignedIssueCell.jsx` | **신규** — `할일 {todo} / 진행 {inProgress} / 완료 {done}` 3분할(0도 표기, 진행 강조) |
| `overview/ResourceOverviewTable.jsx` | **컬럼 전면 재구성** 7컬럼(인력/직무/등급/가동율/할당이슈/참여프로젝트/완수율). skills·action·available 컬럼 + SkillTags·Button·EditIcon·StatusBadge import 제거. 로우클릭→드로어 유지. projects/completion 헤더 Tooltip |
| `overview/ResourceOverviewTab.jsx` | UserSkillEditModal 제거(드로어로 이관), editTarget state 제거, 테이블 props 정리(canWrite/onEditSkills 제거), 드로어에 `canWrite` 전달 |
| `overview/profile/ResourceProfileDrawer.jsx` | 경험 섹션에 스킬 편집 버튼(`canWrite` 게이트)+UserSkillEditModal 호스팅 |
| `overview/profile/LoadSummaryCards.jsx` | load 확장 카드(할당이슈/완수율/참여프로젝트/남은작업량/가동률) — Overview 일관성(§3.4) |
| `overview/UserSkillEditModal.jsx` | onSuccess 에 `resourceKeys.profile(accountId)` invalidate 추가(userSkills+overview 기존 유지) |
| `locales/kr/resource.json`·`locales/en/resource.json` | v2 신규 키 추가(아래). 제거 컬럼 관련 키(col.skills/action/available/available.*)는 **남겨둠**(회귀 방지) |

- 쿼리키 신규 없음(`resourceKeys.loadSummary()/profile()/overview()` v1 유지).
- 재사용: UtilBadge / CommonTable / UserAvatar / InfoTip(공용) / UserSkillEditModal.
- 권한 게이트: 드로어 스킬편집만 `canWrite('RESOURCE_MANAGEMENT')`. 조회는 기존 `canRead` 유지.

## 3. @atlaskit/progress-bar 설치 여부 / 택한 방식

- **미설치**(package.json `@atlaskit/progress-bar` undefined, node_modules 부재 확인).
- 설계 §4.2 폴백대로 **경량 커스텀 div 바**(`CompletionBar.jsx`)로 구현. 트랙+fill(`width:${pct}%`), 색 rate≥0.8 success/≥0.4 info/<0.4 default, `null → '-'`(overview.completion.none), 라벨 `Math.round(rate*100)%`. 신규 의존성 추가 없음(v1 Drawer 미설치 회피와 동일 방침).

## 4. i18n 신규 키 + merge 실행 여부 — **실행 완료**

추가 위치: `locales/kr·en/resource.json`. 신규 키:
- `col.assignedIssues`, `col.projectCount`, `col.completion`
- `overview.issues.{todo,inProgress,done}`
- `overview.completion.{none,tip}`, `overview.projectCount.tip`

`cd static/ui && npm run merge` 실행 → `ko-KR.json`/`en-US.json` 재생성, 산출물에서 위 키 kr·en 전수 확인. `ko-KR.json`/`en-US.json` **직접 수정 안 함**. 제거 컬럼 관련 키는 삭제하지 않고 보존.

## 5. 빌드/테스트 결과

- `cd static/ui && CI=true npm run build` → **성공(Compiled)**. 잔여 경고는 사전 존재 3rd-party source-map(`@atlaskit/analytics-next-stable-react-context`, `marklassian`)뿐. 신규/수정 파일발 경고·에러 **없음**(non-known 경고 스캔 결과 공집합).
- `cd static/ui && CI=true npm test` → **8 suites / 74 tests 전부 통과**(회귀 없음).

## 6. 특기 / 검증자 유의

- **드로어 진행중 이슈 목록(InProgressIssueList)은 v1 그대로**(In Progress only). v2 확장은 부하 요약 카드(LoadSummaryCards)와 Overview 테이블 컬럼에만 반영.
- **available 컬럼만 제거, availableOnly 필터(ResourceFilters)는 유지** — `p.available` 은 overview 응답에 여전히 존재. 필터 제거는 설계 범위 밖이라 보존.
- **상단 SummaryCard 유지**(§9): total/idle/normal/over 는 `utilBand`(rollup) 기반이라 available 컬럼 제거와 무관 → 그대로 둠.
- 드로어에서 스킬 저장 시 `userSkills`+`overview`+`profile(accountId)` invalidate → 테이블·드로어 즉시 갱신.
