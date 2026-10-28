# 설계 — 마이페이지 전면 개편 (my-page-revamp)

## 0. 결론 요약

- **백엔드 변경 없음.** 신규 resolver 0개. 기존 SELF/PUBLIC 함수 재사용.
- 프론트만 전면 재구성. 유일한 공용 코드 변경 = `usePermissionStore` 에 `roleName` 필드 추가
  (`userPermissionCheck` 응답의 `name` 을 지금은 버리고 있음 → 저장만 추가, 기존 API 불변).

## 1. 정보구조 (사용자 3축 → 화면)

```
 (a) 나에게 어떤 작업이 할당됐나  →  ② 프로젝트 패널 + ③ 작업 패널 + ① KPI
 (b) 얼마나 기여하고 있나        →  ① KPI(투입시간/처리율) + ④ 차트 3종
 (c) 내가 한 일을 볼 수 있어야   →  ⑤ 워크로그 패널(선택 프로젝트 연동)
 (+) 내 권한                     →  ⑥ 권한 매트릭스
```

## 2. 레이아웃

```
┌───────────────────────────────────────────────────────────────────────┐
│ ⓪ MyPageHeader                                                        │
│    아바타 · 표시이름 · 권한세트 배지(Admin/Member/커스텀) · 데이터범위 │
│    ─ 우측: 기간 프리셋(이번주/이번달/최근3개월/직접) + DatePicker 2    │
├───────────────────────────────────────────────────────────────────────┤
│ ① MyPageSummary — KPI 6                                               │
│  참여프로젝트 | 담당작업 | 진행중 | 처리율 | 기간 투입(MD) | 작성일수  │
├──────────────────────┬────────────────────────────────────────────────┤
│ ② MyProjectsPanel    │ ③ MyIssuesPanel                                │
│  (좌, flex 3)        │  (우, flex 7)                                  │
│  선택형 카드리스트   │  필터: 검색·상태·내역할·마감                   │
│  필터: 검색 / 진행중 │  CommonTable(정렬·페이징)                      │
│  전체선택·해제       │                                                │
├──────────────────────┴────────────────────────────────────────────────┤
│ ④ MyContributionCharts — 3열                                          │
│  작업 상태 분포(도넛) | 프로젝트별 투입시간(가로바) | 일별 추이(바+선) │
├───────────────────────────────────────────────────────────────────────┤
│ ⑤ MyWorklogPanel — 선택 프로젝트 · 기간 스코프                        │
│  필터: 검색 · 이슈별 그룹/평면 토글                                   │
├──────────────────────────────────────┬────────────────────────────────┤
│ ⑥ MyPermissionSection (권한 매트릭스)│ ⑦ MySkillSection (기존 유지)   │
└──────────────────────────────────────┴────────────────────────────────┘
```

**스코프 규칙(중요):** `selectedProjectIds` 가 ③④⑤ 전부의 단일 스코프.
초기값 = 기간이 오늘을 포함하는 "진행 중 프로젝트" 전체(= myWork `MyProjectList` 와 동일 UX).
선택 0개면 ③④⑤ 는 빈 상태 + 안내(전체 조회로 폭주시키지 않음 — Forge 5000건 JQL 방어).

## 3. 데이터 경계면 계약 (전부 기존 resolver — 실제 shape)

| 함수 | 권한 | 입력 | 실제 응답 shape | 소비 훅 |
|------|------|------|------------------|---------|
| `getMyProjectList` | SELF | `{accountId}` | `{success, data:[{project_id, project_name, start_date, end_date, role:{name}, level:{name}, status:{name,color}}]}` | `useMyPageProjects` |
| `getMyIssueList` | SELF | `{accountId, selectedProjectIds, coworkerFieldId}` | `{data:[Issue]}` (※ `success` 없음 — 아래 주의) | `useMyPageIssues` |
| `getMyCalendarWorklog` | SELF | `{accountId, selectedProjectIds, startDate, endDate}` | `{data:[Issue with fields.worklog.worklogs(내 것만)]}` | `useMyPageWorklogs` |
| `getMySkills` / `setMySkills` | SELF | `{}` / `{skillIds}` | `{data:{accountId, skillIds}}` | `useMySkills` |
| `userPermissionCheck` | PUBLIC | – | `{isUser, name, projectScope, pages:[{pageId,value:{read,write}}]}` | `usePermissionStore` |
| `getPermissionCatalog` | PUBLIC | – | `{sections:[{sectionId, sectionLabelKey, resources:[{key,labelKey,descriptionKey}]}]}` | `useMyPermissionMatrix` |
| `getSettingData` | PUBLIC | – | `{hourRate, ...}` | 인라인 useQuery |

> **주의 — `success` 유무:** `getMyIssueList`/`getMyCalendarWorklog` 서비스는 `{data}` 만 반환한다
> (`responseWrapper` 가 `{success:true, ...result}` 로 스프레드하므로 결과적으로 `success:true` 가 붙는다).
> 기존 훅이 `res?.success && Array.isArray(res.data)` 로 읽고 있고 실동작하므로 그대로 유지한다.

## 4. 신규/변경 파일

### 변경
- `static/ui/src/stores/usePermissionStore.js` — `roleName` 추가(응답 `name`), 기존 필드/API 불변
- `static/ui/src/utils/queryKey/myPageKeys.js` — `worklogs(accountId, projectIds, start, end)` 로 projectIds 포함,
  `permissionCatalog()` 추가
- `static/ui/src/pages/myPage/hooks/useMyPageWorklogs.js` — 쿼리키에 projectIds 반영
- `static/ui/src/pages/myPage/hooks/useMyPageStats.js` — todo/inProgress/done/overdue 확장

### 신규 (hooks)
- `useMyContribution.js` — 워크로그 → 총초/일별/프로젝트별/이슈별 집계(useMemo, 재조회 없음)
- `useMyPermissionMatrix.js` — `getPermissionCatalog` + permissionStore 병합 → 섹션별 read/write 행
- `useMyPageFilters.js` — 기간 프리셋 계산(이번주/이번달/최근3개월/직접)

### 신규 (sections)
- `MyPageHeader.jsx`, `MyProjectsPanel.jsx`, `MyIssuesPanel.jsx`,
  `MyWorklogPanel.jsx`, `MyContributionCharts.jsx`, `MyPermissionSection.jsx`
- `MyPageSummary.jsx` 개편, `MySkillSection.jsx` 유지
- 제거: `MyProjectsSection.jsx`, `MyIssuesSection.jsx`, `MyWorklogSection.jsx` (패널로 대체)

## 5. 지표 정의 (과장 금지 — InfoTip 표기)

| 지표 | 산식 | 한계 |
|------|------|------|
| 처리율 | `done / total` (statusCategory.key==='done') | 건수 기준(공수 아님) |
| 기간 투입 MD | `Σ 내 worklog.timeSpentSeconds / (hourRate*3600)` | 내가 **작성한** 워크로그만 |
| 일평균 | `총초 / 워크로그 작성일수` | 미작성일 제외 |
| 작성일수 | `distinct(started[0:10])` | – |
| 내 역할 | assignee=나 → 담당 / properties.movesRms.coworkers 포함 → 협업 | – |
| 지연 | `duedate < today && !done` | – |

**팀 대비 기여율은 산출하지 않는다** (SELF 스코프상 타인 워크로그 조회 불가).

## 6. 필터 매트릭스 (R7)

| 섹션 | 필터 |
|------|------|
| 헤더(글로벌) | 기간 프리셋 + 직접 지정 → ④⑤ 에 적용 |
| ② 프로젝트 | 검색어, 진행중만, 전체선택/해제 |
| ③ 작업 | 검색어(key/요약), 상태(전체/할일/진행중/완료), 내역할(전체/담당/협업), 마감(전체/지연/7일내), 페이징 |
| ⑤ 워크로그 | 검색어(key/요약/코멘트), 보기(이슈별 그룹/평면), 페이징 |
| ⑥ 권한 | 보기(전체/허용된 것만) |

## 7. i18n

`locales/kr/myPage.json` · `locales/en/myPage.json` 확장 → `npm run merge`.
권한 라벨은 기존 `common.pages.*` / `permission.desc.*` / `common.sections.*` 재사용(중복 키 생성 금지).
