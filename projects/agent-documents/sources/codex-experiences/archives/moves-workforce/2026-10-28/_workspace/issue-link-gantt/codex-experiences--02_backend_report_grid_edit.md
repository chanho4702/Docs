# 02 Backend Report — 간트 그리드 개선 (Task shape additive 3필드 확장)

작성일: 2026-07-02 · 범위: 소규모 additive 변경(신규 resolver 없음). 쓰기 백엔드 미신설(프론트가 기존 write 경로 재사용).

## 변경 파일:라인

1. `src/api/jira/issue/IssueApi.js` (getProjectGanttIssues, fieldList ~346–350행)
   - fieldList 에 `'aggregateprogress'` 추가 (기존 `'timetracking'` 은 원래 포함 — 확인 완료, 무변경).
   - 최종 fieldList: `['summary','duedate','customfield_10015','issuetype','status','statusCategory','assignee','parent','timetracking','project','issuelinks','aggregateprogress']` (+ 조건부 wbsParentFieldId, coworkerFieldId).
   - 간트 전용 페처라 공통 경로(`getProjectIssuesByFilter` 등) 무영향.

2. `src/resolver/gantt/GanttMapper.js` (normalizeIssue 반환 객체, ~110–140행)
   - `issueId: issue.id ?? null` (id 바로 아래, string) 추가.
   - `originalEstimateSeconds: f.timetracking?.originalEstimateSeconds ?? null` (coworkers 아래) 추가.
   - `progressPercent: f.aggregateprogress?.percent ?? null` (originalEstimateSeconds 아래) 추가.
   - 기존 `progress`(computeProgress, 0~1 막대 채움용) 무변경 — progressPercent 와 별개 필드.
   - `buildTasksAndLinks` 의 `const tasks = normalized.map(({ _links, ...task }) => task)` spread 는 신규 필드 자동 통과 — 무변경.

3. `src/resolver/gantt/__test__/GanttMapper.test.js` (normalizeIssue describe 블록)
   - (a) `id:'10012'` + `timetracking.originalEstimateSeconds:28800` + `aggregateprogress.percent:40` fixture → `issueId==='10012'`, `originalEstimateSeconds===28800`, `progressPercent===40` 단언 추가.
   - (b) 빈 fields fixture → `issueId===null`, `originalEstimateSeconds===null`, `progressPercent===null` 단언 추가.

## 실제 Task shape (buildTasksAndLinks → content.tasks[] 각 항목, 필드 순서 글자 그대로)

```
{
    id,                    // = issue.key (string)
    key,                   // = issue.key (string)
    issueId,               // issue.id ?? null (string|null) ← 신규. 협업자 write updateProjectIdField 용 숫자 Jira id
    summary,               // f.summary ?? '' (string)
    start,                 // f.customfield_10015 ?? null (string YYYY-MM-DD | null)
    end,                   // f.duedate ?? null (string YYYY-MM-DD | null)
    type,                  // 'task' | 'summary' | 'milestone' (buildTasksAndLinks 확정)
    issueType,             // f.issuetype?.name ?? null (string|null)
    issueTypeIcon,         // f.issuetype?.iconUrl ?? null (string|null)
    project,               // { id, key, name, avatarUrl } | null
    jiraParent,            // f.parent?.key || null (string|null)
    wbsParent,             // wbsParent 커스텀필드 trim | null (string|null)
    effectiveParent,       // wbsParent ?? jiraParent ?? null (멤버십 검증 후, string|null)
    progress,              // computeProgress → 0~1 | null  ★막대 채움 전용, 신규필드와 무관
    assignee,              // { accountId, displayName, avatarUrl } | null
    statusKey,             // sc?.key ?? null (string|null)
    statusCategory,        // { key, name, colorName } | null
    coworkers,             // Jira user 배열 (기본 [])
    originalEstimateSeconds, // f.timetracking?.originalEstimateSeconds ?? null (number|null) ← 신규. "계획 작업량"(MD) 산정 기준(초)
    progressPercent,       // f.aggregateprogress?.percent ?? null (number|null) ← 신규. "처리율"(%) 읽기전용
}
```

- 내부 `_links` 는 응답 직전 제거되어 노출 안 됨(무변경).
- 응답 구조 `content.tasks` / `content.links` / `content.meta` 그 외 무변경. links 항목 `{ id, source, target, type:'FS', lag:0 }` 무변경.

### 신규 3필드 요약 (프론트 소비용)
| 필드 | 타입 | 출처 | 용도 | null 조건 |
|------|------|------|------|-----------|
| `issueId` | string\|null | `issue.id` | 협업자 write(updateProjectIdField) 시 숫자 id 인자 | id 부재 시 null |
| `originalEstimateSeconds` | number\|null | `f.timetracking.originalEstimateSeconds` | "계획 작업량"(MD) 컬럼 값 계산(초→MD 환산은 프론트) | timetracking/estimate 부재 시 null |
| `progressPercent` | number\|null | `f.aggregateprogress.percent` | "처리율"(%) 읽기전용 컬럼 | aggregateprogress 부재 시 null |

주의: `progress`(0~1)와 `progressPercent`(0~100)는 별개. 그리드 "처리율" 컬럼은 `progressPercent` 사용, 막대 채움은 기존 `progress` 유지.

## 테스트 결과

`npx jest src/resolver/gantt`
```
PASS src/resolver/gantt/__test__/GanttValidationService.test.js
PASS src/resolver/gantt/__test__/GanttMapper.test.js
Test Suites: 2 passed, 2 total
Tests:       38 passed, 38 total
```
(신규 케이스를 추가하지 않고 기존 normalizeIssue 2개 테스트에 3필드 단언을 확장했으므로 총 개수는 38 유지. 매핑/폴백 양쪽 커버.)

## 계약 준수 확인
- additive only: 기존 필드/순서/타입 무변경, 신규 3필드만 추가. ✅
- 쓰기 resolver 신규 생성 없음. ✅
- 지정 3파일 외 수정 없음. ✅
