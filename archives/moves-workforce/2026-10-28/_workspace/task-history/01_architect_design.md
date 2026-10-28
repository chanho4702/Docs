# 작업(이슈) 추가 이력 기능 설계서

> 단일 진실 원천(SSOT). backend-engineer / frontend-engineer / integration-verifier 는 본 문서의
> **2. 경계면 계약** 표를 기준으로 구현·검증한다. 계약을 바꿀 때는 반드시 양쪽에 통지한다.

---

## 0. 핵심 설계 결정 (요약)

| 항목 | 결정 | 근거 |
|------|------|------|
| 데이터 소스 | 새 앱 커스텀필드 **2개**: **datetime** `assignedDateField`(name `moves_RMS_projectAssignedDate`) + **user** `assignedByField`(name `moves_RMS_projectAssignedBy`) | 별도 DB 미사용(요구 확정). 등록 시점·실제 등록자만 기록, 백필 없음 |
| 등록일 기록 트리거 | **프론트 이슈 등록 경로(`IssueAddModal.submit`) 전용으로 신규 resolver `recordIssueAssignedDate` 1회 추가 호출** | coworker 경로(`ProjectIssueTable.updateCoworker`)와 `updateProjectIdField`를 **전혀 손대지 않음** → 회귀 0. 백엔드 분기보다 격리가 명확 |
| 등록자 기록 | datetime write 와 **동시에** user 필드 `assignedByField`에 **실제 등록자(resolver 호출자 accountId, 서버 context 취득)** write | reporter(보고자)는 부정확. 호출자=실등록자. accountId는 서버에서만 취득(위변조 방지) |
| 덮어쓰기 가드 | resolver 내부에서 **이슈별 현재 등록일(datetime) read → 비어있는 이슈에만 두 필드 write** | 재등록/프로젝트 이동 시 최초 등록 시점·등록자 유지 |
| 비차단성 | 등록일 기록 실패해도 **projectId 등록(submit)은 성공 처리**. 프론트는 `recordIssueAssignedDate`를 `await`하되 실패를 삼킨다(catch noop) | 등록 동작 불변 보장 |
| 이력 조회 | **프론트가 `executeRequest('searchIssueWithJQL')`로 직접 조회** (백엔드 집계 resolver 미추가) | 작업관리(`ProjectIssueTable`/`ProjectIssuePanel`)와 동일 패턴 → 일관성. 등록일 커스텀필드 + timetracking 이 모두 issue.fields 에 포함되어 추가 페치 불필요 |
| 차트 | ECharts(`echarts-for-react`) 번업(누적 공수) line | 요구 확정 + 기존 차트 스택(`ProgressSCurve`) 재사용 |

---

## 1. 개요 / 영향 범위

### 백엔드
- **manifest.yml**: `jira:customField`에 신규 필드 **2개** 추가 — datetime `assignedDateField` + user `assignedByField`.
- **신규 resolver 1개**: `recordIssueAssignedDate` (Controller/Service 추가, 기존 `projectIssue` 도메인에 편입). 등록자 accountId 는 resolver context 에서 취득.
- 기존 `updateProjectIdFieldService` / `updateCustomField` / coworker 경로 **수정 없음**.
- DB(MySQL/KVS) 변경 **없음**.

### 프론트
- 신규 탭 **'작업 이력'**: `constants/tabs.js`의 `projectDetailTabs`에 추가(권한 `canRender` 패턴).
- 신규 페이지 폴더 `static/ui/src/pages/projectDetail/taskHistory/`:
  - `TaskHistoryPage.jsx` (컨테이너: 데이터 페치 + 상태 분기)
  - `TaskHistoryBurnup.jsx` (ECharts 번업 차트)
  - `TaskHistoryInsightCards.jsx` (공수 인사이트 카드)
  - `TaskHistoryTable.jsx` (이력 테이블, `CommonTable` 재사용)
  - `taskHistory.transform.js` (순수 데이터 변환/계산 함수 — 단위테스트 용이)
- `constants/customField.js`: `CustomFieldId.assignedDateField`/`assignedByField`, `CustomFieldKey.assignedDateField`/`assignedByField` 추가.
- 수정: `IssueAddModal.jsx`의 `submit`에 `recordIssueAssignedDate` 후속 호출(비차단) 추가.
- 쿼리키: `projectKeys`에 `taskHistory` 키 추가(차트/테이블 자체는 직접 fetch, 단 settings 조달 용도).

### DB
- 변경 없음.

### i18n
- 신규: `locales/kr/taskHistory.json`, `locales/en/taskHistory.json`
- 기존 `common.tabs` 등은 재사용. `projectDetail.tabs.taskHistory` 키 추가(탭 라벨은 taskHistory 파일에 둠 — 아래 6장 참조).

---

## 2. 경계면 계약 (가장 중요)

### 2-1. 신규 백엔드 resolver

| resolver 함수 | 입력 payload | success 응답 shape (글자 그대로) | 실패 응답 | 대응 프론트 소비 경로 |
|--------------|-------------|-------------------------------|----------|----------------------|
| `recordIssueAssignedDate` | `{ issueIds: string[], assignedDateFieldId: string, assignedByFieldId: string, assignedAt?: string }` | `{ success: true, recorded: number, skipped: number }` | `responseWrapper` 표준 `{ success:false, error:{name,code,message,cause} }` | `IssueAddModal.submit` 에서 `invoke('recordIssueAssignedDate', {...})` (비차단) |

- `issueIds`: 등록된 이슈 **id 문자열 배열**(IssueAddModal의 `checkItems`는 `issue.id` 배열).
- `assignedDateFieldId`: 프론트가 `getCustomFieldId(CustomFieldId.assignedDateField)`로 만든 **전체 필드 id**(`{appId}__{env}__assignedDateField`). projectId/coworker 와 동일하게 프론트가 환경별 id를 만들어 전달(서버는 그대로 사용).
- `assignedByFieldId`: 프론트가 `getCustomFieldId(CustomFieldId.assignedByField)`로 만든 **전체 필드 id**. 등록자(user) 필드 write 대상.
- **`accountId`(등록자)는 프론트가 보내지 않는다.** resolver **context 에서 서버가 취득**(`req.context.accountId`, 정확한 경로는 backend 가 구현 시 검증). 위변조 방지.
- `assignedAt`: 생략 시 서버가 `new Date().toISOString()`으로 채움. (프론트가 명시 전달도 허용하되 기본은 미전달.)
- `recorded`/`skipped`: 기록한 건수 / 이미 값 있어 스킵한 건수. **프론트는 이 값을 사용하지 않아도 무방**(비차단). 검증·로깅 용도.

> 비차단 규약: 프론트는 `recordIssueAssignedDate` 실패/거부를 **무시**한다(`.catch(() => {})`). resolver 내부도 개별 이슈 write 실패를 모아 throw 하지 않고 best-effort 로 진행한다(전체가 실패하면 `success:true, recorded:0` 까지 허용).

### 2-2. 프론트 직접 Jira 조회 (이력 데이터 — 신규 resolver 아님)

| 호출 | 입력 | 응답(사용 필드) | 소비 위치 |
|------|------|----------------|-----------|
| `executeRequest('searchIssueWithJQL', param)` | `param.jql = \`${CustomFieldKey.projectIdField} = "${project_id}"\`` + 필터 없음(전체), `fields: ['summary','issuetype','status','assignee','timetracking', assignedDateFieldId, assignedByFieldId]`, `fieldsByKeys: false`, `maxResults: 100`, 페이지네이션 `nextPageToken` 루프 | `result.issues[]`: `.id`,`.key`,`.fields.summary`,`.fields.issuetype.iconUrl`,`.fields.status.statusCategory`,`.fields.assignee`,`.fields.timetracking.originalEstimateSeconds`,`.fields[assignedDateFieldId]`(ISO datetime 문자열 \| null),`.fields[assignedByFieldId]`(user 객체 \| null), `result.nextPageToken` | `TaskHistoryPage.jsx` |
| `invoke('getSettingData')` | 없음 | `{ hourRate, ... }`(루트 직접, content 래핑 없음) → `hourRate = settingData?.hourRate \|\| 8` | `TaskHistoryPage.jsx` (planned MD 환산용) |

> **중요**: `fields` 배열에 등록일 커스텀필드를 **id 형태로 넣어야** 응답 `issue.fields[assignedDateFieldId]`로 값이 온다.
> coworker(`ProjectIssueTable`)도 `issue?.fields?.[coworkerId]` 로 **전체 id 키**를 쓰므로 동일 방식.
> `fieldsByKeys`는 false(기본)로 두고 필드 id를 그대로 전달한다(coworker 패턴과 일치).

---

## 3. 백엔드 설계

### 3-1. manifest.yml — 커스텀필드 추가
`jira:customField` 블록에 다음 항목 추가(기존 두 필드 아래에 이어서):

```yaml
  jira:customField:
    - key: projectIdField
      name: moves_RMS_projectId
      description: Moves Workforce App projectId value
      type: string
      readOnly: true
    - key: coworkerIdField
      name: moves_RMS_coworkers
      description: Moves Workforce App cowerkers value
      type: user
      collection: list
    - key: assignedDateField                 # 신규 1 — 등록일시
      name: moves_RMS_projectAssignedDate
      description: Moves Workforce App project assigned datetime (ISO)
      type: datetime
      readOnly: true
    - key: assignedByField                   # 신규 2 — 실제 등록자
      name: moves_RMS_projectAssignedBy
      description: Moves Workforce App project assigned-by user
      type: user
      readOnly: true
```

- `assignedDateField` `type: datetime` → 값 set/read 포맷은 **ISO 8601 문자열**(예: `2026-06-24T07:15:30.000Z`). 시각 포함.
- `assignedByField` `type: user`(collection 아님 — **단일 사용자**) → 값 read 는 user 객체(`{accountId, displayName, avatarUrls...}`). coworker(`collection: list`)와 달리 단건.
- `readOnly: true` → projectId 와 동일하게 사용자 직접 편집 불가, 앱만 `/app/field/.../value`로 기록.
- 배포 시 Forge가 신규 앱 커스텀필드 **2개를 자동 생성**한다(별도 마이그레이션 불필요). 단 **배포 직후 첫 등록부터** 값 기록 시작(백필 없음 — 확정).

### 3-2. 등록일·등록자 기록 Service — `recordIssueAssignedDateService`
파일: `src/resolver/projectIssue/ProjectUsersService.js` 에 **함수 추가**(기존 함수 수정 금지).
기존 `updateCustomField`(private)를 그대로 재사용하되, **read-가드**를 위해 현재 값을 먼저 조회한다.
datetime(등록일) write 와 **동시에** user(등록자) 필드도 write 한다. 등록자 `accountId`는 **서버 context 에서** 전달받는다.

```js
// ProjectUsersService.js (추가)
// 등록일·등록자 기록: 이미 등록일이 있는 이슈는 건너뛴다(최초 등록 시점·등록자 유지). best-effort, 비차단.
export const recordIssueAssignedDateService = async ({ issueIds, assignedDateFieldId, assignedByFieldId, assignedAt, accountId }) => {
    const ids = Array.isArray(issueIds) ? issueIds : [issueIds];
    const iso = assignedAt || new Date().toISOString();

    let recorded = 0;
    let skipped = 0;

    // 1) 가드: 현재 '등록일'이 비어있는 이슈만 추린다(가드 기준은 datetime 필드 하나).
    //    issue.fields[assignedDateFieldId] 가 null/undefined 면 미기록.
    const targets = [];
    for (const issueId of ids) {
        try {
            const cur = await readIssueFieldValue(issueId, assignedDateFieldId); // 아래 helper
            if (cur == null || cur === '') targets.push(issueId);
            else skipped++;
        } catch (e) {
            // read 실패 시 보수적으로 write 시도하지 않고 스킵(덮어쓰기 위험 회피)
            skipped++;
        }
    }

    // 2) 비어있는 이슈들에 datetime + user 두 필드 write. 각 write 는 best-effort(throw 안 함).
    if (targets.length > 0) {
        const issueIdsCsv = targets.join(',');   // 기존 updateCustomField body 의 issueIds 자리에 그대로 전개됨

        // 2-1) 등록일(datetime)
        try {
            await updateCustomField({
                fieldIdOrKey: assignedDateFieldId,
                issueId: issueIdsCsv,
                value: JSON.stringify(iso),        // datetime 은 "2026-..." 형태의 JSON 문자열
            });
            recorded = targets.length;
        } catch (e) {
            recorded = 0;                          // 비차단
        }

        // 2-2) 등록자(user, 단일) — coworker(배열) 와 달리 단건. accountId 없으면 skip.
        //      user 필드 value 포맷은 coworker 패턴 참고: [{accountId}] (단일 사용자라 길이 1 배열).
        if (accountId) {
            try {
                await updateCustomField({
                    fieldIdOrKey: assignedByFieldId,
                    issueId: issueIdsCsv,
                    value: JSON.stringify([{ accountId }]),
                });
            } catch (e) {
                /* 비차단: 등록자 write 실패는 무시(등록일은 이미 기록됨) */
            }
        }
    }

    return { recorded, skipped };
};
```

- **user 필드 set 포맷 검증 노트(backend 구현 시)**: coworker(`updateProjectIdFieldService`)는 `value.map(id => ({accountId: id}))` 배열을 JSON.stringify 한다. `assignedByField` 는 단일이지만 동일 엔드포인트라 **`[{accountId}]`(길이 1 배열) 형태가 가장 안전**. 만약 단일 user 필드가 `{accountId}`(비배열) 또는 `"accountId"` 형태를 요구하면 set 결과를 read 로 1회 검증해 포맷을 확정할 것.
- `value: JSON.stringify(iso)` → projectId 가 `\`"${value}"\`` 로 따옴표를 감싸는 것과 동일 효과(문자열 값). datetime 필드는 ISO 문자열을 문자열 값으로 set.
- 기존 `updateCustomField`의 body 템플릿은 `"issueIds": [ ${issueId} ]` 이므로 `targets.join(',')`를 넘기면 `[123,456]` 형태가 되어 다건 set 됨(현행 `updateProjectIdField`가 프론트에서 배열을 그대로 넘겨 동작하는 것과 동일 구조).

**read helper** (`readIssueFieldValue`) — 가드용 단건 read. 신규 추가:
```js
import api, { route } from "@forge/api"; // 이미 import 되어 있음

const readIssueFieldValue = async (issueId, fieldId) => {
    const res = await api.asApp().requestJira(
        route`/rest/api/3/issue/${issueId}?fields=${fieldId}`,
        { headers: { Accept: 'application/json' } }
    );
    if (res.status >= 400) throw new Error(`read ${issueId} ${res.status}`);
    const json = await res.json();
    return json?.fields?.[fieldId] ?? null;
};
```
- 가드 read 도 `asApp()`(이미 write 가 asApp). 신규 asApp 부담 없음(같은 경로의 연장 — 확정 사항).
- 성능: 등록은 보통 소수 이슈. read N회는 등록 건수만큼(p-limit 불필요한 소규모). 다만 **다건 등록 시** 이슈 수가 클 수 있으므로, 구현 시 `p-limit`(동시성 5) 적용 권장(이미 의존성 존재). → 7장 체크리스트 반영.

### 3-3. Controller 등록
파일: `src/resolver/projectIssue/ProjectUsersController.js` — `registerProjectUsersController` 내부에 추가:
```js
resolver.define(
    'recordIssueAssignedDate',
    responseWrapper(({ payload, context }) =>
        recordIssueAssignedDateService({ ...payload, accountId: context?.accountId })
    )
);
```
- import 에 `recordIssueAssignedDateService` 추가.
- **등록자 accountId 는 context 에서 취득**(프론트 payload 가 아님 — 위변조 방지). 정확한 경로(`context.accountId` vs `@forge/api`의 사용자 컨텍스트)는 backend 가 구현 시 검증한다. 기존 컨트롤러들이 `({payload, context}) => service(payload, context)`로 context 를 넘기는 패턴(`insertProjectusers`/`updateProjectUsersByKey`)과 동일.
- `src/index.js` 는 이미 `registerProjectUsersController`를 등록하므로 **추가 등록 불필요**(동일 컨트롤러에 함수만 추가).

### 3-4. 에러 처리
- `responseWrapper`가 표준 직렬화 담당. Service는 best-effort 라 정상 흐름에서 throw 하지 않음.
- 별도 `ErrorCodes` 추가 불필요(비차단·소프트 실패 정책).

---

## 4. 프론트엔드 설계

### 4-1. customField 상수 추가
`static/ui/src/constants/customField.js`:
```js
export const CustomFieldId = ({
    projectIdField : "projectIdField",
    coworkerIdField : "coworkerIdField",
    assignedDateField : "assignedDateField",     // 신규 — 등록일시
    assignedByField : "assignedByField",         // 신규 — 등록자
})
export const CustomFieldKey = ({
    projectIdField : "moves_RMS_projectId",
    coworkerIdField : "moves_RMS_coworkers",
    assignedDateField : "moves_RMS_projectAssignedDate",  // 신규 (JQL 미사용이지만 일관성 위해 추가)
    assignedByField : "moves_RMS_projectAssignedBy",      // 신규
})
```

### 4-2. IssueAddModal.submit 수정 (등록일·등록자 기록 후속 호출, 비차단)
`static/ui/src/pages/projectDetail/issue/IssueAddModal.jsx`:
```js
const submit = async () => {
    const projectFieldId = await getCustomFieldId(CustomFieldId.projectIdField);
    await invoke('updateProjectIdField', { issueId: checkItems, value: project_id, customFieldId: projectFieldId })
        .then(async () => {
            toast.showSuccess(t('common.toast.title.success'), t('projectDetail.issue.modal.toast.description.success'));
            // ── 등록일·등록자 기록(비차단): 실패해도 등록은 성공. accountId 는 보내지 않음(서버 context 취득) ──
            try {
                const [assignedDateFieldId, assignedByFieldId] = await Promise.all([
                    getCustomFieldId(CustomFieldId.assignedDateField),
                    getCustomFieldId(CustomFieldId.assignedByField),
                ]);
                await invoke('recordIssueAssignedDate', { issueIds: checkItems, assignedDateFieldId, assignedByFieldId });
            } catch (_) { /* noop: 등록일/등록자 기록 실패는 무시 */ }
        })
        .catch(() => toast.showError(t('common.toast.title.Fail'), t('common.toast.description.error')))
        .finally(() => { search(); onClose(); });
};
```
- **coworker 경로(`ProjectIssueTable.updateCoworker`)는 절대 수정하지 않음.** 등록일·등록자 기록은 IssueAddModal 에서만.
- `accountId`(등록자)는 프론트가 전달하지 않는다 — 서버가 resolver context 에서 취득.
- 토스트는 기존 등록 성공 토스트만 사용(등록일/등록자 기록은 사용자에게 별도 알리지 않음).

### 4-3. 탭 등록
`static/ui/src/constants/tabs.js` `projectDetailTabs` 의 `analysisReport.children` 형제로, **최상위 탭**으로 추가(작업관리와 가까운 위치 권장 — `projectIssue` 다음).
```js
import HistoryIcon from "@atlaskit/icon/core/clock"; // 또는 적절한 시계/이력 아이콘
import TaskHistoryPage from "../pages/projectDetail/taskHistory/TaskHistoryPage";
// ...
{
    key: 'taskHistory',
    label: (
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <HistoryIcon label="" />
            {t('taskHistory.tab.label')}
        </span>
    ),
    component: () => <TaskHistoryPage project_id={project_id} />,
    canRender: () => canWriteProject,   // PROJECT 쓰기 권한 — 작업관리(편집)의 연장선
},
```
- **권한: `canWrite('PROJECT')` 게이트.** 작업 이력은 작업관리(편집)의 연장선이라 프로젝트 수정 권한자에게 노출. (progress/cost 의 `REPORT` 게이트와 다름.)
- 이를 위해 `projectDetailTabs(t, project_id, toast, canReadReport)` 시그니처에 **`canWriteProject` 인자 추가**가 필요하다. `ProjectDetailTabs.jsx`에서 `usePermissionStore(s => s.canWrite('PROJECT'))`를 읽어 `projectDetailTabs(...)`로 전달(아래 4-3a 참조).
- 탭 라벨 키는 `taskHistory.tab.label`(taskHistory.json).

### 4-3a. 권한 인자 배선 (ProjectDetailTabs.jsx + tabs.js)
`static/ui/src/components/tabs/ProjectDetailTabs.jsx`:
```js
const canReadReport = usePermissionStore(s => s.canRead('REPORT'));
const canWriteProject = usePermissionStore(s => s.canWrite('PROJECT'));   // 신규
const tabs = useMemo(
    () => projectDetailTabs(t, project_id, toast, canReadReport, canWriteProject),
    [t, project_id, toast, canReadReport, canWriteProject]
);
```
`static/ui/src/constants/tabs.js`:
```js
export const projectDetailTabs = (t, project_id, toast, canReadReport, canWriteProject) => [ ... ];
```
- 기존 `canReadReport` 사용 탭(progress/cost)은 그대로. `taskHistory` 탭만 `canWriteProject` 사용.

### 4-4. 페이지 컴포넌트 트리
```
TaskHistoryPage (project_id)
├─ useQuery(getSettingData) → hourRate
├─ executeRequest(searchIssueWithJQL) nextPageToken 루프 → 전체 이슈 수집 (fields 에 assignedDateFieldId 포함)
├─ taskHistory.transform.js 로 가공 → { rowsAll, tracked, untracked, insight, burnup }
├─ 상태분기: 로딩 / 에러 / 이슈0건(empty) / 추적이슈0건(정보 메시지: "이력 추적 시작 전")
└─ 렌더
   ├─ <TaskHistoryInsightCards insight={insight} />         (Card 그리드)
   ├─ <Card title=번업> <TaskHistoryBurnup burnup={burnup} /> </Card>
   └─ <Card title=이력목록> <TaskHistoryTable rows={rowsAll} /> </Card>
```

- 이슈 수집은 `ProjectIssuePanel.loadSummary`의 nextPageToken 루프 패턴 재사용(MAX_PAGES/MAX_ISSUES 안전상한 동일 적용).
- `fields` 배열: `['summary','issuetype','status','assignee','timetracking', assignedDateFieldId, assignedByFieldId]` (reporter 제거, 등록자 필드 추가).
  `assignedDateFieldId`/`assignedByFieldId`는 각각 `getCustomFieldId(CustomFieldId.assignedDateField)`/`getCustomFieldId(CustomFieldId.assignedByField)`로 컴포넌트 마운트 시 1회 조달(useQuery `['assignedDateFieldId']`/`['assignedByFieldId']`, staleTime 30분 — progress의 coworkerFieldId 패턴과 동일).

### 4-5. 데이터 변환 (`taskHistory.transform.js`) — 계산 정의
입력: `issues[]`(Jira), `hourRate`, `assignedDateFieldId`, `assignedByFieldId`.

```
plannedMd(issue) =
    sec = issue.fields.timetracking?.originalEstimateSeconds ?? null
    sec == null ? 0 : round(sec / (hourRate * 3600), 1)        // ProjectIssueTable.createRow 와 동일 환산

assignedAt(issue) = issue.fields[assignedDateFieldId] ?? null   // ISO datetime 또는 null
assignedBy(issue) = issue.fields[assignedByFieldId] ?? null     // user 객체({accountId,displayName,avatarUrls}) 또는 null
```

- **tracked**: `assignedAt != null` 인 이슈. 등록일시 오름차순 정렬.
- **untracked**: `assignedAt == null` 인 이슈(도입 전). 그래프/번업에서 제외, 테이블에는 "추적 전" 표기로 포함, 인사이트 카드에 별도 건수 표시.

**번업(burnup) 데이터** (tracked 기준):
```
정렬: tracked 를 assignedAt 오름차순
누적: 등록일(날짜 단위, YYYY-MM-DD)로 그룹 → 같은 날 합산 후 시간순 누적
출력 burnup = {
  points: [{ date: 'YYYY-MM-DD', dailyMd, cumulativeMd, count, cumulativeCount }],
  baselineMd,      // "초기 공수" = 최초 등록일 그룹의 누적 MD (points[0].cumulativeMd)
  totalMd,         // 현재 총 planned MD (tracked 합 = points[last].cumulativeMd)
  trackedCount,    // tracked 이슈 수
}
```
- x축은 등록 **날짜**(시각 절삭). 동일 날짜 다건은 합산(번업은 일 단위 계단/누적선).
- 등록일 없는 이슈는 번업 미반영(요구: 기준선/별도 표기).

**인사이트(insight)**:
```
insight = {
  baselineMd,            // 초기 공수 = 최초 등록일 그룹 누적 MD (= burnup.points[0].cumulativeMd, 없으면 0)
  baselineDate,          // 최초 등록일(YYYY-MM-DD) | null
  currentTotalMd,        // 현재 총 공수 = tracked 전체 planned MD 합
  addedMd,               // 추가 공수 = currentTotalMd - baselineMd
  addedCount,            // 추가 건수 = trackedCount - (최초 등록일 그룹 건수)
  trackedCount,
  untrackedCount,        // 도입 전(등록일 없음) 건수
}
```
- **"초기 공수" 정의(확정)**: *최초 등록일(가장 이른 assignedAt 날짜) 그룹*의 누적 MD. 즉 추적 시작 첫날 등록된 작업들의 합. 그 이후 등록분이 "추가 공수(scope creep)".
  - 대안(첫 N일 윈도우 등)은 데이터 한계상 모호 → 가장 단순·명확한 "첫 등록일 그룹" 채택. InfoTip 으로 정의 명시.
- untracked 이슈는 baseline/added 계산에서 제외(공수는 표기만, scope creep 계산엔 미포함).

### 4-6. 번업 차트 (`TaskHistoryBurnup.jsx`)
- `echarts-for-react` + `useColorMode`(다크모드) — `ProgressSCurve` 패턴 차용.
- series: 누적 공수 line(area 약하게) + 보조로 누적 건수(line, 우측 yAxis 선택). 최소 요구는 **누적 공수 1선**.
- x축: `burnup.points[].date`(category). y축: MD.
- 데이터 없으면(`points` 빈 배열) graphic text "추적된 작업 없음"(noData) 표시.
- 옵션: `ChartTableToggle` 재사용해 로우데이터(표) 토글 제공(progress 와 동일 UX) — 선택.

### 4-7. 이력 테이블 (`TaskHistoryTable.jsx`)
- `CommonTable` 재사용(IssueAddModal/progress 와 동일).
- head: 이슈키 / 제목 / 상태 / **등록자** / 등록일시 / planned MD.
- 등록자 칸: `issue.fields[assignedByFieldId]`(user 객체)를 `UserAvatar`로 표시. **reporter 아님.** 값 없으면(추적 전 이슈) `displayNoUser` 또는 "-".
- 정렬: 등록일시 내림차순(최근 등록이 위) 기본. untracked 는 등록일시 칸 "-" 또는 "추적 전" 표기, 하단/별도 그룹.
- 셀 렌더 재사용: `IssueComponent`(이슈키), `StatusComponent`(상태), `UserAvatar`(등록자 — `response={assignedBy}`), `DateTag` 또는 dayjs 포맷(등록일시 — datetime 이므로 `YYYY-MM-DD HH:mm`).

### 4-8. 인사이트 카드 (`TaskHistoryInsightCards.jsx`)
- `components/card/Card` 재사용. 카드 4종:
  1. 초기 공수(baselineMd MD, baselineDate)
  2. 현재 총 공수(currentTotalMd MD, trackedCount 건)
  3. 추가 공수(addedMd MD, addedCount 건) — 증감 강조색
  4. 추적 전(untrackedCount 건) — 보조 톤 + InfoTip("도입 전 등록 이슈는 등록일 미기록")

### 4-9. 쿼리키
`static/ui/src/utils/queryKey/projectKeys.js` `projectKeys`에 추가(이력 자체는 직접 fetch 라 필수는 아니나, 추후 캐시화 대비 + settings 표준화):
```js
export const projectKeys = {
    progress: (projectId) => ['projectProgress', projectId],
    cost: (projectId) => ['projectCost', projectId],
    taskHistory: (projectId) => ['projectTaskHistory', projectId],   // 신규
};
```
- `getSettingData`/`assignedDateFieldId` 보조 쿼리는 기존 관용 키(`['getSettingData']`, `['assignedDateFieldId']`) 사용(progress 와 동일).

### 4-10. 권한
- 탭 노출: `usePermissionStore`의 **`canWrite('PROJECT')`**(= `canWriteProject`)로 게이트(작업관리 편집의 연장선). progress/cost 의 `REPORT` 게이트와 구분. 배선은 4-3a 참조. 별도 신규 권한 페이지 추가 없음.

---

## 5. DB 설계
- **변경 없음.** MySQL/KVS 모두 스키마·마이그레이션 불필요. 데이터는 Jira 이슈 커스텀필드에만 저장.

---

## 6. i18n 키 목록

### `locales/kr/taskHistory.json`
```json
{
  "taskHistory": {
    "tab": { "label": "작업 이력" },
    "guide": "이 프로젝트에 작업(이슈)이 등록된 시점을 추적해, 초기 대비 추가된 공수(scope creep)를 보여줍니다. 기능 도입 이전에 등록된 작업은 등록일이 없어 '추적 전'으로 표시됩니다.",
    "insight": {
      "baseline": "초기 공수",
      "baselineSub": "최초 등록일 기준",
      "current": "현재 총 공수",
      "currentSub": "추적된 작업 합계",
      "added": "추가 공수",
      "addedSub": "초기 대비 증가분",
      "untracked": "추적 전",
      "untrackedSub": "도입 전 등록 작업",
      "mdUnit": "MD",
      "countUnit": "건",
      "tip": "초기 공수는 추적이 시작된 최초 등록일에 등록된 작업들의 공수 합이며, 그 이후 등록된 작업의 공수가 추가 공수입니다."
    },
    "burnup": {
      "title": "누적 공수 추이",
      "cumulativeMd": "누적 공수",
      "cumulativeCount": "누적 건수",
      "noData": "추적된 작업이 없습니다",
      "colDate": "등록일",
      "tip": "작업이 프로젝트에 등록된 날짜 순으로 계획 공수(MD)를 누적한 번업 곡선입니다."
    },
    "table": {
      "title": "등록 이력",
      "issueKey": "이슈",
      "summary": "제목",
      "status": "상태",
      "assignedBy": "등록자",
      "assignedAt": "등록일시",
      "plannedMd": "계획 공수",
      "untracked": "추적 전"
    },
    "state": {
      "loading": "불러오는 중...",
      "error": "작업 이력을 불러오지 못했습니다.",
      "empty": "이 프로젝트에 등록된 작업이 없습니다.",
      "noTracked": "아직 추적된 작업 등록 이력이 없습니다. 새 작업을 등록하면 이 시점부터 이력이 쌓입니다."
    }
  }
}
```

### `locales/en/taskHistory.json`
```json
{
  "taskHistory": {
    "tab": { "label": "Task History" },
    "guide": "Tracks when tasks (issues) were added to this project, revealing scope creep relative to the initial plan. Tasks added before this feature have no assigned date and are shown as 'Pre-tracking'.",
    "insight": {
      "baseline": "Initial Effort",
      "baselineSub": "As of first assignment",
      "current": "Current Total Effort",
      "currentSub": "Sum of tracked tasks",
      "added": "Added Effort",
      "addedSub": "Increase vs. initial",
      "untracked": "Pre-tracking",
      "untrackedSub": "Added before tracking",
      "mdUnit": "MD",
      "countUnit": "",
      "tip": "Initial effort is the sum of effort for tasks assigned on the first tracked date; effort of tasks assigned afterwards is the added effort."
    },
    "burnup": {
      "title": "Cumulative Effort Trend",
      "cumulativeMd": "Cumulative MD",
      "cumulativeCount": "Cumulative Count",
      "noData": "No tracked tasks",
      "colDate": "Assigned Date",
      "tip": "A burn-up curve accumulating planned effort (MD) in order of the date each task was added to the project."
    },
    "table": {
      "title": "Assignment History",
      "issueKey": "Issue",
      "summary": "Summary",
      "status": "Status",
      "assignedBy": "Assigned By",
      "assignedAt": "Assigned At",
      "plannedMd": "Planned MD",
      "untracked": "Pre-tracking"
    },
    "state": {
      "loading": "Loading...",
      "error": "Failed to load task history.",
      "empty": "No tasks are assigned to this project.",
      "noTracked": "No tracked assignment history yet. New assignments will be recorded from now on."
    }
  }
}
```

> merge: `cd static/ui && npm run merge` 실행 → `ko-KR.json`/`en-US.json` 자동 생성. `locales/ko-KR.json`/`en-US.json` 직접 수정 금지. `locales/script/*.json`은 빈 스텁이라 사용 안 함.
> 탭 라벨을 `taskHistory.tab.label`로 둠(기존 `projectDetail.tabs.*` 배열에 끼워넣지 않음 — 신규 파일 격리가 깔끔).

---

## 7. 구현 작업 분해

### Backend 체크리스트
1. `manifest.yml` `jira:customField`에 **2개** 추가 — `assignedDateField`(datetime, readOnly) + `assignedByField`(user, readOnly, collection 없음).
2. `src/resolver/projectIssue/ProjectUsersService.js`:
   - `readIssueFieldValue(issueId, fieldId)` helper 추가(asApp GET, `fields=` 한정).
   - `recordIssueAssignedDateService({issueIds, assignedDateFieldId, assignedByFieldId, assignedAt, accountId})` 추가 — 가드(등록일 read→빈 것만) + datetime write + **user(등록자) write** (`updateCustomField` 재사용) + best-effort/비차단. (다건 read 는 `p-limit` 동시성 5 권장.)
   - **user 필드 값 포맷 검증**: `[{accountId}]`(단일) 로 set 후 read 로 1회 확인. coworker 와 동일 엔드포인트지만 collection 아님.
   - **기존 `updateProjectIdFieldService`/`updateCustomField`/`deleteProjectIssueService` 절대 수정 금지.**
3. `src/resolver/projectIssue/ProjectUsersController.js`: `recordIssueAssignedDate` resolver.define 추가(+ import). **`context.accountId`를 Service 로 전달**(`({payload, context}) => service({...payload, accountId: context?.accountId})`). context 경로는 구현 시 검증.
4. (선택) jest: `recordIssueAssignedDateService` 가드 분기(기존 값 있으면 skip / 없으면 record + 등록자 write) 단위테스트.
5. 회귀 확인: coworker 변경/projectId 등록/이슈 삭제 경로 동작 불변.

### Frontend 체크리스트
1. `constants/customField.js`: `assignedDateField` + `assignedByField` id/key 추가.
2. `IssueAddModal.jsx` `submit`: projectId 등록 성공 후 `recordIssueAssignedDate`(`{issueIds, assignedDateFieldId, assignedByFieldId}`) 비차단 호출 추가(try/catch noop). **accountId 는 보내지 않음.** **coworker 경로 손대지 않음.**
3. `constants/tabs.js` + `ProjectDetailTabs.jsx`: `taskHistory` 탭 추가(**`canWrite('PROJECT')` 게이트**, 아이콘, 라벨 `taskHistory.tab.label`). `projectDetailTabs` 시그니처에 `canWriteProject` 인자 추가(4-3a).
4. `pages/projectDetail/taskHistory/` 신규:
   - `taskHistory.transform.js`(plannedMd/assignedAt/**assignedBy**/tracked-untracked/burnup/insight 순수 함수).
   - `TaskHistoryPage.jsx`(settings·assignedDateFieldId 조달 → searchIssueWithJQL 페이지 루프 → transform → 상태분기 렌더).
   - `TaskHistoryInsightCards.jsx`(Card 4종).
   - `TaskHistoryBurnup.jsx`(ECharts 번업, ChartTableToggle 토글).
   - `TaskHistoryTable.jsx`(CommonTable, IssueComponent/StatusComponent/UserAvatar/DateTag 재사용).
5. `utils/queryKey/projectKeys.js`: `taskHistory` 키 추가.
6. `locales/kr/taskHistory.json` + `locales/en/taskHistory.json` 작성 → `npm run merge`.
7. (선택) `taskHistory.transform.js` 단위테스트(번업 누적/baseline·added 계산, untracked 분리).

---

## 8. 영향 범위 / 리스크

| 항목 | 영향 | 보존 확인 포인트 |
|------|------|-----------------|
| coworker 변경 회귀 | **없음** — `updateProjectIdField`/`updateCustomField`/coworker 경로 미수정 | `ProjectIssueTable.updateCoworker` 동작·`issue.fields[coworkerId]` 표시 불변 |
| projectId 등록 회귀 | **없음** — submit 흐름은 기존 호출 유지, 등록일·등록자 기록은 **성공 후 비차단 후속** | 기록 resolver 실패해도 toast 성공·`search()`/`onClose()` 정상 |
| 이슈 삭제/조회 경로 | **없음** | `deleteProjectIssue`, 작업관리/칸반/분석 읽기 경로 불변 |
| 새 커스텀필드 생성 | 배포 시 Forge가 **2개**(datetime+user) 자동 생성. 기존 이슈는 값 없음(설계상 untracked) | 첫 배포 후 신규 등록부터 기록 |
| 등록자 위변조 | **불가** — accountId 는 프론트 payload 가 아닌 **서버 resolver context** 에서만 취득 | 프론트는 accountId 미전송 확인 |
| user 필드 set 포맷 | 단일 user 필드 set body 포맷이 collection 과 다를 수 있음 | backend 가 set→read 1회 검증(`[{accountId}]` 우선) |
| 권한/스코프 | manifest `permissions.scopes` 변경 **불필요**(`manage:jira-configuration`+`write:jira-work`+`read:jira-work` 기존 보유, app field value 경로는 projectId/coworker 와 동일) | 신규 asApp 부담 없음(확정) |
| 성능 | 이력 조회는 프론트 페이지네이션 루프(MAX_PAGES/MAX_ISSUES 상한). 등록일 read 가드는 등록 건수 비례(p-limit 5) | Forge 256MB 내 안전. 공통 페치 경로 미수정 |

### 명시한 가정 / 리더 확정 사항
- A1. **탭 권한 게이트 = `canWrite('PROJECT')`** (리더 확정). 작업 이력은 작업관리(편집)의 연장선 → 프로젝트 수정 권한자에게 노출. progress/cost 의 `REPORT` 게이트와 구분.
- A2. **"초기 공수" = 최초 등록일 그룹 누적 MD**(가장 단순·명확, 유지). 정의는 InfoTip 노출.
- A3. **등록일시 표기 = `YYYY-MM-DD HH:mm`**(datetime, 로컬, 유지). 번업 x축은 날짜 단위 절삭.
- A4. **이력 테이블 등록자 = 실제 등록자(resolver 호출자 accountId)** (리더 확정, reporter 폐기). 신규 user 커스텀필드 `assignedByField`에 기록, 서버 context 에서 accountId 취득.
