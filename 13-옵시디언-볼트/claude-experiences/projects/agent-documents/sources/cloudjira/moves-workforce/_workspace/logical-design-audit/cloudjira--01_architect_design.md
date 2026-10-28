# 논리 설계 감사 후속 보완 설계서

> 기준일: 2026-08-03  
> 입력: `00_input/requirement.md`, `03_verify_report.md`  
> 적용 원칙: 기존 API를 가능한 한 보존하되, 보안·무결성 경계는 명시적 계약으로 변경한다.  
> 상태: 이 문서가 backend/frontend 구현 및 integration 검증의 단일 진실 원천(SSOT)이다.

## 1. 개요 / 영향 범위

### 1.1 목표

감사 F-01~F-09를 권장 순서대로 해소한다. 핵심은 다음 네 불변식을 코드와 테스트로 고정하는 것이다.

1. `SELF`는 resolver 진입 권한이 아니라 **SQL row ownership까지** 뜻한다.
2. Forge SQL DML 영향 행 수는 공통 계층에서 공식 raw shape를 정규화한다.
3. production paid 환경의 license 부재·조회 실패는 허용 상태가 아니다.
4. 일반 자원 DTO와 비용 DTO를 분리하여 `salary`가 권한 경계를 넘지 않는다.

### 1.2 영향 범위

- 백엔드: `mySchedule`, `CommonQuery`, license guard/registration, `resourceManagement`, job polling service, `resourceAnalysis`, settings.
- 프론트: license store, job polling/store, project calendar context, resource analysis `N/A`, settings UI, query key factory.
- DB: SQL 신규 table/migration 없음. KVS `settings.progressThreshold` attribute 추가가 필요하다.
- i18n: `locales/kr`, `locales/en`의 설정·캘린더·일정·분석 메시지 추가. 생성물 `ko-KR.json`/`en-US.json`은 merge로만 갱신한다.
- 권한: 기존 resource key를 재사용한다. 신규 permission resource는 만들지 않는다.

### 1.3 현재 architecture 기준

- UI는 `static/ui/build`을 resource로 사용하는 React 18 + Atlaskit **Custom UI**다.
- `src/index.js`에는 중앙 registrar 30개가 있고, `getLicenseDiagnostics`가 목록 밖에서 임시 등록돼 있다.
- Forge SQL은 12 table, KVS Custom Entity는 `team`을 포함한 12개다.
- 권한 범위는 `ALL | MEMBER_ONLY | TEAM_ONLY`이며 팀장 권한은 permission set이 아니라 팀 관계에서 파생되는 `teamLead` OR 축이다.

## 2. 경계면 계약

### 2.1 공통 응답

모든 `guardedDefine` resolver는 아래 envelope를 지킨다.

```js
// 성공
{ success: true, ...handlerResult }

// 실패
{
  success: false,
  error: { name, code, message, cause }
}
```

신규·수정되는 wire contract는 `content`를 사용한다. 기존 조회 API 중 이번 범위 밖의 top-level/data 응답은 별도 migration 없이 유지한다.

### 2.2 resolver 계약 표

| resolver 함수 | permission | 입력 payload | success 응답 shape | 프론트 소비 / query key |
|---|---|---|---|---|
| `updateMySchedule` | `SELF` | `{ schedule_id, schedule_start_date, schedule_end_date, schedule_type, work_ratio, description? }` | `{ success:true, content:{ scheduleId, rowsAffected:1 } }` | 일정 mutation / `scheduleKeys.myList(range)` invalidate |
| `deleteMySchedule` | `SELF` | `{ schedule_id }` | `{ success:true, content:{ scheduleId, rowsAffected:1 } }` | 일정 mutation / `scheduleKeys.myList(range)` invalidate |
| `getMyScheduleList` | `SELF` | `{ startDate, endDate }` — client `account_id` 무시 | 기존 호환 `{ success:true, data: ScheduleDTO[] }` | `scheduleKeys.myList({startDate,endDate})` |
| `getResourceOverview` | `RESOURCE_MANAGEMENT.read` | `{}` | 기존 envelope 유지. `content.people[]`은 `ResourcePersonDTO`이며 `salary` 금지 | `resourceKeys.overview()` |
| `getUploadJobStatus` | `USER_MANAGEMENT.read` | `{ jobId }` | `{ success:true, content:{ job: JobDTO|null } }` | `jobKeys.status(jobId)` 또는 polling manager |
| `getResourceAnalysisList` | `REPORT.read`, project detail | `{ projectId, startDate, endDate }` | 기존 top-level 호환 + `{ requestedEndDate, effectiveEndDate, members, effectiveDays }`; 분모 0은 `null` | `resourceAnalysisKeys.list(params)` |
| `getSettingData` | `PUBLIC` | 없음 | 기존 top-level settings + `progressThreshold:number` | `settingKeys.detail()` |
| `updateSetting` | `SETTINGS.write` | 기존 필드 + `{ progressThreshold }` | `{ success:true, content:{ settings: SettingsDTO } }` | `settingKeys.detail()` set/invalidate |

`getLicenseDiagnostics`는 제거 대상이며 안정 API 계약으로 승격하지 않는다. production 진단이 필요하면 resolver가 아니라 서버의 구조화·마스킹 로그를 사용한다.

### 2.3 DTO

```js
// 날짜는 yyyy-MM-dd, 종료일은 inclusive다.
ScheduleDTO = {
  schedule_id: string,
  account_id: string,
  schedule_start_date: string,
  schedule_end_date: string,
  schedule_type: string,
  work_ratio: number,       // 0..1
  description: string | null
}

ResourcePersonDTO = {
  accountId: string,
  displayName: string,
  avatarUrls: object | null,
  roleKey: string | null,
  roleName: string | null,
  levelKey: string | null,
  levelName: string | null,
  teamKey: string | null,
  teamName: string | null,
  util: number | null,
  utilBand: 'idle'|'normal'|'over'|'red'|'unknown',
  investedMd: number | null,
  availMd: number | null,
  available: boolean,
  skills: Array<{ id:string, name:string, category:string }>
  // salary 및 단가 계열 필드는 절대 포함하지 않는다.
}

JobDTO = {
  id: string,
  total: number,
  totalBatches: number,
  processed: number,
  failed: number,
  status: 'RUNNING'|'COMPLETED'|'PARTIAL'|'FAILED'
}

SettingsDTO = {
  currency: string,
  hourRate: number,
  utilizationUnderBand: number,
  utilizationOverBand: number,
  utilizationRedBand: number,
  scopeTodoAmberRatio: number,
  scopeTodoRedRatio: number,
  progressThreshold: number // percentage point, 기본 5
}
```

비용 화면은 기존 `PROJECT_COST` resolver가 별도의 Cost DTO를 반환한다. `ResourcePersonDTO`에 조건부 `salary` 필드를 넣지 않는다. 권한별로 같은 endpoint의 shape가 달라지는 계약을 피하기 위함이다.

### 2.4 오류 코드

| 코드 | 발생 조건 | 정보 노출 정책 |
|---|---|---|
| `SCHEDULE_NOT_FOUND_OR_FORBIDDEN` | update/delete DML `rowsAffected === 0` | 존재하지 않음과 타인 소유를 구분하지 않는다 |
| `SCHEDULE_INVALID_DATE_RANGE` | 시작일 > 종료일 또는 날짜 형식 오류 | 입력 오류 |
| `SCHEDULE_INVALID_WORK_RATIO` | `work_ratio`가 유한수 0..1 밖 | 입력 오류 |
| `LICENSE_INACTIVE` | production license가 inactive/expired | 기존 코드 유지 |
| `LICENSE_STATUS_UNAVAILABLE` | production에서 context와 License API 모두 확정 판정 실패 | fail-closed |
| `JOB_ID_REQUIRED` | `jobId` 누락 | 입력 오류 |
| `JOB_STATUS_READ_FAILED` | KVS 조회 실패 | transient로 취급, server job 삭제 금지 |
| `RESOURCE_ANALYSIS_INVALID_DATE_RANGE` | 날짜 형식 오류 또는 시작일 > 종료일 | 입력 오류 |
| `SETTING_PROGRESS_THRESHOLD_INVALID` | 유한수가 아니거나 0..100 밖 | 입력 오류 |

## 3. 백엔드 설계

### 3.1 F-01 일정 `SELF` row ownership

처리 순서는 다음으로 고정한다.

```text
Controller context.accountId
  → Service validation
  → Repository(schedule_id, ownerAccountId)
  → SQL WHERE schedule_id=? AND account_id=?
  → rowsAffected 0이면 SCHEDULE_NOT_FOUND_OR_FORBIDDEN
```

- `updateMySchedule`과 `deleteMySchedule` 모두 client payload의 `account_id`를 버린다.
- `UserSchedule.UPDATE`의 마지막 predicate에 `AND account_id = ?`를 추가한다.
- `UserSchedule.DELETE_BY_ID`도 `AND account_id = ?`를 추가한다. 사용자 cascade용 `DELETE_BY_ACCOUNT_ID`는 별도 query이므로 변경하지 않는다.
- 날짜·`work_ratio` validation은 DML 전에 수행한다.
- `getMyScheduleList`는 프로젝트 전체 조회와 같은 overlap predicate를 사용한다.

```sql
WHERE account_id = ?
  AND schedule_end_date >= ?
  AND schedule_start_date <= ?
```

### 3.2 F-02 Forge SQL DML 정규화

`executeQuery`가 SDK raw result를 보존하면서 안정 alias를 추가한다.

```js
const raw = await sql.prepare(query).bindParams(...params).execute();
const rawAffected = raw?.rows?.affectedRows;
return {
  ...raw,
  rowsAffected: Number.isFinite(Number(rawAffected)) ? Number(rawAffected) : 0,
};
```

- SELECT는 기존 `rows: []`를 그대로 보존한다.
- DML은 공식 `rows: { affectedRows }`를 그대로 보존하고 `rowsAffected`만 alias로 추가한다.
- 호출부는 안정 alias `rowsAffected`만 사용한다.
- test mock은 반드시 `{ rows:{ affectedRows:1 } }`로 SDK raw shape를 재현한다. `{rowsAffected:1}`만 반환하는 mock은 금지한다.

### 3.3 F-03 license 정책

license 판정 상태를 boolean이 아닌 아래 상태로 모델링한다.

```js
LicenseDecision = {
  state: 'ACTIVE'|'INACTIVE'|'NOT_APPLICABLE'|'UNAVAILABLE',
  source: 'CONTEXT'|'LICENSE_API'|'ENVIRONMENT',
  checkedAt: number
}
```

판정표:

| 환경 | context license | API fallback | 결정 |
|---|---|---|---|
| development/staging | 없음 | 호출 불필요 | `NOT_APPLICABLE`, 허용 |
| 환경 불명/그 외 환경 | 없음/shape 불명 | 호출 불필요 | `UNAVAILABLE`, `LICENSE_STATUS_UNAVAILABLE` |
| production | `active:true` | 불필요 | `ACTIVE`, 허용 |
| production | `active:false` | 불필요 | `INACTIVE`, `LICENSE_INACTIVE` |
| production | 없음/shape 불명 | `active:true/false` | API 값으로 확정 |
| production | 없음/shape 불명 | 실패/shape 불명 | `UNAVAILABLE`, `LICENSE_STATUS_UNAVAILABLE` |

- 모든 환경에서 명시적인 context license의 `active:true/false`를 환경 판정보다 우선한다.
- license가 없을 때만 development/staging을 `NOT_APPLICABLE`로 허용한다.
- `responseWrapper`와 scheduled trigger/queue가 동일 판정 함수를 공유한다.
- License API는 `asApp()`이 필요한 플랫폼 self-query다. 이 경로에는 사용자 Jira 데이터가 없다.
- inactive와 unavailable은 TTL을 다르게 캐시한다. active/inactive는 최대 1시간, unavailable은 최대 1분만 캐시한다.
- `getLicenseDiagnostics`, 목록 밖 등록, frontend console dump를 제거한다.
- `CONTROLLER_REGISTRARS` 밖의 resolver 등록을 contract test가 검출해야 한다.
- `getSentryDSN`은 현재 중앙 registrar에는 포함되지만 raw `resolver.define`인 legacy 예외다. 감사 후속에서는 `guardedDefine(..., 'getSentryDSN', ...)`로 표준화하는 것을 동일 contract 정리 항목에 포함한다.

### 3.4 F-04 salary DTO 분리

- `buildPeopleContext`의 `people` projection에서 `salary`를 제거한다.
- 비용 계산은 `ProjectCostService`/`PROJECT_COST` 전용 query와 DTO만 사용한다.
- 내부 계산 때문에 급여가 필요해도 공용 객체에 싣지 말고 `buildCostContext` 또는 지역 변수로 분리한다.
- `getResourceOverview`, `getResourceProfile`, `getProjectSkillMatch`, work-assignment 응답에 `salary`, `totalSalary`, `rate`가 재귀적으로 없음을 contract test로 검사한다.

### 3.5 F-06 polling 응답 통일

- `getUploadJobStatusService`는 KVS raw를 직접 반환하지 않고 `{ content:{ job } }`를 반환한다.
- KVS에 job이 없으면 오류가 아니라 `job:null`이다. frontend는 local tracking만 종료한다.
- KVS 조회 예외는 `JOB_STATUS_READ_FAILED`로 wrapper 실패 응답이 된다.
- terminal status일 때만 `removeJobBatch`/`removeJob`을 호출한다.
- transport 오류 또는 `{success:false}`에는 polling을 유지하고 capped retry/backoff를 적용한다. 최소 3회 연속 실패 전에는 사용자 error toast를 반복 노출하지 않는다.

frontend store 책임을 분리한다.

```js
forgetJob(jobId)     // localStorage와 Zustand에서만 제거
cleanupJob(jobId)    // terminal 완료 후 server KVS + local 모두 제거
```

### 3.6 F-05 calendar context/drag

- Forge context는 project detail 상위에서 `view.getContext()`로 한 번 조회하고 `ProjectDetailTabs → projectDetailTabs → ProjectCalender`에 명시적으로 전달한다.
- context query key는 `forgeContextKeys.current()`를 사용한다.
- Calendar는 `context.accountId`와 `context.timezone`이 준비되기 전 일정 query와 drag mutation을 비활성화한다.
- drag 이전 시간은 `event.extendedProps.worklog.started`에서 읽는다. `event.extendedProps.started`는 사용하지 않는다.
- 기존 시간 + 새 날짜 + context timezone으로 Jira `started`를 만든다.
- update 성공 시 `calendarKeys.projectWorklogs(params)`를 invalidate하고 event의 `worklog`을 갱신한다. 실패 시 `revert()`와 번역 toast를 함께 수행한다.

### 3.7 F-07 가동률 분모

backend가 요청을 다음처럼 정규화한다.

```js
requestedEndDate = endDate;
effectiveEndDate = min(endDate, todayYmd);
```

- `startDate > requestedEndDate`는 입력 오류다.
- `startDate > effectiveEndDate`인 미래 전용 구간은 워크로그 조회·분모 계산 결과를 빈 값으로 만들고 `effectiveMmDays:null`을 반환한다.
- 가용 근무일이 실제로 0인 경우도 `null`이며 `0.1`로 치환하지 않는다.
- UI는 분모가 `null` 또는 `<=0`이면 가동률을 계산하지 않고 `N/A`로 표시한다.
- cache key에는 `effectiveEndDate`를 사용한다. requested future end가 달라도 동일 실효 구간이면 같은 계산을 재사용한다.
- UI DatePicker의 `maxDate=today`는 보조 방어이며 backend clamp를 대체하지 않는다.

겹치는 개인 일정은 account/date별 최소 `work_ratio`를 적용한다. 즉 같은 날 연차와 반차가 겹치면 0이 우선하며, 일별 차감은 그 날짜의 base workday 값을 초과하지 않는다. 일정별 deduction을 단순 합산하지 않는다.

### 3.8 F-09 `progressThreshold`

- KVS `settings` entity에 `progressThreshold: float`를 선언한다.
- seed 기본값은 `5`(%p)다. 기존 settings record는 `{...defaults, ...exists}`로 보존·보충한다.
- `updateSettingService`가 값을 allowlist에 포함하고 저장 전 유한수·0..100 validation을 수행한다.
- 설정 UI는 0.5 step, 0..100 범위의 `%p` 입력으로 제공한다.
- `ProjectProgressService`와 `PortfolioDashboardService`는 동일 settings 값을 사용하고, 캐시에는 threshold 기반 판정 결과를 박제하지 않는다.

### 3.9 Jira `asApp` 경로 및 entity property

`asUser()`가 기본이다. 현재 허용되는 `asApp()` 경로는 다음으로 한정하고 코드 주석·테스트에 근거를 남긴다.

1. 사용자 context가 없는 portfolio scheduled trigger/queue.
2. Jira app custom field 전용 write endpoint.
3. `movesRms` issue entity property read/merge/write.
4. License API self-query.
5. 앱 설정용 field/time-tracking metadata 조회.

사용자 resolver에서 2~3을 호출할 때는 먼저 `PermissionMap`, project scope, 대상 issue/project 소속을 검사한다. entity property `movesRms`의 논리 shape는 다음과 같다.

```js
{
  coworkers: string[],
  assignedAt: 'yyyy-MM-dd' | null,      // JQL index
  assignedAtIso: string | null,         // 표시/정렬
  assignedById: string | null,
  wbsParent: string | null
}
```

manifest `jira:entityProperty.values`에는 검색할 `coworkers`, `assignedAt`, `assignedById`만 선언한다. `assignedAtIso`와 `wbsParent`는 저장되지만 JQL alias를 만들지 않는다.

## 4. 프론트엔드 설계

### 4.1 query key 정책

신규·수정 코드의 query key는 반드시 `static/ui/src/utils/queryKey/` factory를 사용한다.

```js
scheduleKeys.myList({ startDate, endDate })
calendarKeys.projectWorklogs({ projectId, startDate, endDate })
forgeContextKeys.current()
jobKeys.status(jobId)
resourceAnalysisKeys.list({ projectId, startDate, endDate })
settingKeys.detail()
```

직접 `queryKey: [...]`와 직접 배열 `invalidateQueries`는 새로 추가하지 않는다. 기존 직접 배열 74건은 기능 수정 시 점진 이관하되, 위 감사 대상 파일은 이번 작업에서 즉시 이관한다.

### 4.2 화면별 변경

- License: diagnostics invoke/console 제거. backend license 실패 envelope를 공통 오류 처리로 안내한다.
- Polling: `success` 검사 후 `content.job`을 읽는다. transient 실패와 not-found/terminal을 구분한다.
- Calendar: 상위 context 명시 전달, drag event shape 수정, 성공/실패 toast.
- Resource analysis: `effectiveMmDays === null`이면 `N/A`; 0.1 fallback 제거. 요청 종료일의 UI 상한은 오늘.
- Settings: `progressThreshold` 입력·검증·저장 후 settings query 갱신.

### 4.3 권한 UI

- 일반 자원 화면은 `RESOURCE_MANAGEMENT`만으로 진입하며 비용 필드를 렌더하지 않는다.
- 비용/급여 화면은 계속 `PROJECT_COST`를 사용한다.
- 팀장은 `TEAM_MANAGEMENT`를 자동 취득하지 않는다. `team.leaderAccountId` 관계로 파생된 `teamLead` 축과 `TeamLeadFieldPolicy` allowlist만 사용한다.
- `TEAM_ONLY`는 frontend 필터가 아니라 backend `scopedProjectIds(principal)` 결과가 보안 경계다.

## 5. DB 설계

### 5.1 SQL

신규 migration은 없다. 기존 v001~v014를 유지한다.

- v012: `projectusers.salary_type`
- v013: `users.team_key`
- v014: `project_team`

일정 ownership은 schema 변경 없이 WHERE predicate로 구현한다. Forge SQL은 transaction을 지원하지 않으므로 `project_team` 전량 교체의 DELETE→INSERT 중간 실패 위험은 재시도 가능한 idempotent operation과 운영 복구 절차로 관리한다.

### 5.2 KVS

`manifest.yml`의 `settings.attributes`에 다음을 추가한다.

```yaml
progressThreshold:
  type: float
```

manifest 변경이므로 `forge lint` → development deploy가 필요하다. scope/egress 변경은 없으므로 기존 installation upgrade는 필요하지 않지만, storage schema 반영을 위해 deploy 전후 smoke test를 수행한다.

## 6. i18n 키 목록

아래 키를 `locales/kr`와 `locales/en`에 동시에 추가한다. 파일명은 기존 namespace가 들어 있는 source JSON을 사용한다.

| 키 | kr | en |
|---|---|---|
| `setting.progress.title` | 진척도 임계값 | Progress threshold |
| `setting.progress.description` | 완성률과 일정률 차이를 판정하는 허용 범위입니다. | Allowed completion-to-schedule variance. |
| `setting.progress.label` | 임계값 | Threshold |
| `setting.progress.unit` | %p | %p |
| `setting.progress.invalid` | 0~100 사이의 값을 입력하세요. | Enter a value between 0 and 100. |
| `calendar.worklog.moveSuccess` | 워크로그 날짜를 변경했습니다. | Worklog date updated. |
| `calendar.worklog.moveError` | 워크로그 날짜를 변경하지 못했습니다. | Could not update the worklog date. |
| `calendar.contextUnavailable` | 사용자 시간대 정보를 불러오는 중입니다. | Loading user timezone information. |
| `schedule.error.notFoundOrForbidden` | 일정을 찾을 수 없거나 수정 권한이 없습니다. | The schedule was not found or cannot be modified. |
| `resource.analysis.notAvailable` | N/A | N/A |
| `resource.analysis.futureRange` | 미래 기간은 가동률 계산에서 제외됩니다. | Future dates are excluded from utilization. |

Polling 오류는 기존 `common.upload.error`를 사용한다. `upload.error` 신규 키는 만들지 않는다.

## 7. 구현 작업 분해

### 7.1 backend 체크리스트

- [ ] F-01 owner predicate, validation, overlap query, negative test
- [ ] F-02 `executeQuery` DML alias와 SDK-shape contract test
- [ ] F-03 license decision state, production fail-closed, diagnostics 제거, 모든 resolver registrar/guard contract
- [ ] F-04 `ResourcePersonDTO` salary 제거와 재귀 누출 test
- [ ] F-06 `{content:{job}}` polling service와 오류 변환
- [ ] F-07 effective end clamp, denominator null, 일정 겹침 cap
- [ ] F-09 manifest/settings seed/service validation

### 7.2 frontend 체크리스트

- [ ] license diagnostics invoke/console 제거
- [ ] polling에서 `success → content.job` 순으로 검사, local/server cleanup 분리
- [ ] Forge context 상위 1회 조회와 Calendar 전달
- [ ] drag 기존 시간 source 수정 및 query key factory 사용
- [ ] denominator null `N/A`, DatePicker 오늘 상한
- [ ] progress threshold 입력과 양 언어 i18n
- [ ] 감사 대상 파일의 직접 query key 배열 제거

## 8. 테스트·검증 조건

### 8.1 필수 unit/contract

1. 다른 사용자의 `schedule_id`로 update/delete → `SCHEDULE_NOT_FOUND_OR_FORBIDDEN`, DB 변화 0.
2. 본인 일정 update/delete → `rowsAffected:1`.
3. 일정이 조회 시작일 전에 시작해도 기간과 겹치면 반환.
4. `executeQuery` 입력 raw `{rows:{affectedRows:1}}` → alias `rowsAffected:1`; SELECT `rows` 배열 보존.
5. production license active/inactive/missing/API failure 4분기 고정.
6. controller registrar 밖 `resolver.define` 검출. 임시 diagnostics가 invoke 목록에도 없어야 한다.
7. `getResourceOverview.content.people` 전체에서 `salary`/단가 계열 키 부재.
8. polling success/`job:null`/wrapper failure/transport failure/terminal 5분기.
9. calendar context 없음, drag 성공, drag 실패+revert.
10. 미래 전용, 오늘 걸침, 가용일 0, 일정 중첩에 대한 denominator test.
11. `progressThreshold` 기본값·update·validation·두 소비 service의 동일 적용.

### 8.2 전체 검증

- backend Jest 전체
- frontend Jest 전체
- frontend production build
- i18n kr/en leaf parity 및 static key/type 검사
- backend resolver ↔ frontend invoke shape 대조
- `pwd`로 app root 확인 후 `forge lint`
- development 배포 후 license/Jira/SQL/KVS/queue smoke E2E

## 9. 명시적 결정과 비목표

- 현재 Custom UI는 승인된 legacy/current architecture로 문서화한다. UI Kit migration은 별도 RFC 없이는 수행하지 않는다.
- `predecessorsField` 정리, 전체 query key 74건 일괄 이관, CRA/Vite 전환, bundle 분할은 이번 P0/P1 수정의 비목표다.
- API 응답 전체를 한 번에 `content`로 바꾸지 않는다. 이번에 수정되는 polling/mutation부터 명시적으로 통일한다.
- Forge SQL transaction 부재 자체를 해결하지 않는다. `project_team` 교체 복구 정책을 운영 문서에 유지한다.
