# 논리 설계 감사 후속 Backend 구현 보고서

> 기준일: 2026-08-03  
> SSOT: `01_architect_design.md`  
> 구현 범위: F-01, F-02, F-03, F-04, F-06, F-07, F-09 backend  
> 최종 Backend Jest: **52 suites / 768 tests / 0 failures PASS**

## 1. 구현 결과 요약

| 항목 | 결과 | 핵심 변경 |
|---|---|---|
| F-01 일정 SELF ownership | 완료 | update/delete SQL에 `account_id` owner predicate 추가, 입력 검증, 0행 오류, overlap 조회 |
| F-02 Forge SQL DML shape | 완료 | SDK raw `rows.affectedRows` 보존 + 공통 `rowsAffected` alias |
| F-03 license 정책 | 완료 | 4-state 판정, production fail-closed, diagnostics 제거, 중앙 registrar/guard 정리 |
| F-04 salary DTO | 완료 | 일반 `ResourcePersonDTO`에서 `salary` 제거, 재귀 누출 contract test |
| F-06 job polling 계약 | 완료 | `{content:{job}}`, 입력/조회 오류 분리 |
| F-07 가동률 분모 | 완료 | 종료일 오늘 clamp, 0분모 `null`, 겹침 일정 일별 최소 ratio/cap |
| F-09 progress threshold | 완료 | manifest/기본값/seed/service validation 및 실제 저장 응답 |

## 2. 실제 Resolver 경계면 계약

아래 shape는 service 반환값에 `responseWrapper`가 `{success:true, ...result}`를 합성한 실제 wire contract다.

### 2.1 `updateMySchedule`

- Permission: `SELF`
- Payload:

```js
{
  schedule_id: string,
  schedule_start_date: 'yyyy-MM-dd',
  schedule_end_date: 'yyyy-MM-dd',
  schedule_type: string,
  work_ratio: number, // 0..1
  description?: string | null
}
```

- `account_id`는 payload 값을 사용하지 않고 `context.accountId`로 강제한다.
- 성공:

```js
{
  success: true,
  content: {
    scheduleId: string,
    rowsAffected: 1
  }
}
```

- 실패 코드:
  - `SCHEDULE_INVALID_DATE_RANGE`
  - `SCHEDULE_INVALID_WORK_RATIO`
  - `SCHEDULE_NOT_FOUND_OR_FORBIDDEN`

### 2.2 `deleteMySchedule`

- Permission: `SELF`
- Payload: `{ schedule_id: string }`
- owner는 `context.accountId`로 강제한다.
- 성공:

```js
{
  success: true,
  content: {
    scheduleId: string,
    rowsAffected: 1
  }
}
```

- 대상이 없거나 타인 소유면 두 경우를 구분하지 않고 `SCHEDULE_NOT_FOUND_OR_FORBIDDEN`을 반환한다.

### 2.3 `getMyScheduleList`

- Permission: `SELF`
- Payload: `{ startDate: 'yyyy-MM-dd', endDate: 'yyyy-MM-dd' }`
- `account_id`는 `context.accountId`로 강제한다.
- 기존 응답 호환:

```js
{
  success: true,
  data: ScheduleDTO[]
}
```

- 조회 조건은 아래 overlap 계약이다.

```sql
WHERE account_id = ?
  AND schedule_end_date >= ?
  AND schedule_start_date <= ?
```

### 2.4 공통 Forge SQL DML 결과

`executeQuery()`는 공식 SDK raw 결과를 훼손하지 않고 alias를 추가한다.

```js
// SDK raw 입력
{ rows: { affectedRows: 1 }, ...metadata }

// 공통 계층 반환
{
  rows: { affectedRows: 1 },
  ...metadata,
  rowsAffected: 1
}
```

SELECT의 `rows: []` 배열은 동일 reference로 보존되고 `rowsAffected`는 `0`이다.

### 2.5 License 공통 판정

```js
{
  state: 'ACTIVE' | 'INACTIVE' | 'NOT_APPLICABLE' | 'UNAVAILABLE',
  source: 'CONTEXT' | 'LICENSE_API' | 'ENVIRONMENT',
  checkedAt: number
}
```

- 모든 환경: context `active:true/false`가 명시되면 `ACTIVE/INACTIVE` context 판정을 최우선한다.
- development/staging: context license가 부재할 때만 `NOT_APPLICABLE`, 허용, API 미호출
- explicit unknown(`qa`, `test`, `local`, `tunnel`, 임의 문자열): context license가 없으면 `UNAVAILABLE`, API 미호출, fail-closed
- explicit unknown에서 context `active:true/false`가 확정되면 `ACTIVE/INACTIVE` context 판정을 우선한다.
- production context `active:true`: `ACTIVE`, 허용
- production context `active:false`: `LICENSE_INACTIVE`
- production context 불명확 + License API 확정: API 값 사용
- production context/API 모두 불명확 또는 실패: `LICENSE_STATUS_UNAVAILABLE`, fail-closed
- resolver `responseWrapper`, scheduled trigger, queue가 동일 판정 함수를 사용한다.
- 안정 상태 cache TTL은 1시간, `UNAVAILABLE`은 1분이다.
- `getLicenseDiagnostics` resolver와 `LicenseDiagnosticsController.js`는 제거했다.
- `CONTROLLER_REGISTRARS` 밖 직접 controller 등록이 없음을 contract test로 고정했다.

### 2.6 `getSentryDSN`

기존 raw `resolver.define`을 `guardedDefine`으로 표준화했다.

```js
{
  success: true,
  content: {
    dsn: string | null
  }
}
```

Frontend는 기존 raw string 소비가 있다면 `result.content.dsn`으로 맞춰야 한다.

### 2.7 `getResourceOverview`

- Permission: `RESOURCE_MANAGEMENT.read`
- Payload: `{}`
- 기존 envelope는 유지한다.

```js
{
  success: true,
  content: {
    people: ResourcePersonDTO[],
    bands: object,
    lastAggregatedAt: string | null,
    aggregateStatus: string | null,
    teamMeta: object[],
    hasWeightedMetrics: boolean
  }
}
```

`people[]` 및 전체 하위 응답에는 `salary`, `totalSalary`, `rate`가 포함되지 않는다. 비용 데이터는 기존 `PROJECT_COST` 경계에만 남는다.

### 2.8 `getUploadJobStatus`

- Permission: `USER_MANAGEMENT.read`
- Payload: `{ jobId: string }`
- job 존재:

```js
{
  success: true,
  content: {
    job: JobDTO
  }
}
```

- job 없음:

```js
{
  success: true,
  content: {
    job: null
  }
}
```

- 실패 코드:
  - 누락/공백 `jobId`: `JOB_ID_REQUIRED`
  - KVS 조회 예외: `JOB_STATUS_READ_FAILED`

KVS 조회 실패와 `job:null`은 서로 다른 계약이다. transient 실패에서는 server job을 제거하면 안 된다.

### 2.9 `getResourceAnalysisList`

- Permission: `REPORT.read`, project detail
- Payload:

```js
{
  projectId: string,
  startDate: 'yyyy-MM-dd',
  endDate: 'yyyy-MM-dd'
}
```

- 실제 추가/변경 필드:

```js
{
  success: true,
  requestedEndDate: string,
  effectiveEndDate: string,
  members: Array<{
    accountId: string,
    totalMd: number,
    totalHours: number,
    issueCount: number,
    effectiveMmDays: number | null,
    leaveDays: number,
    leaveDeduction: number,
    holidayDays: number
  }>,
  hourRate: number | null,
  baseMmDays: number | null,
  monthMmMap: object,
  holidayCount: number,
  effectiveDays: Record<string, {
    effectiveMmDays: number | null,
    leaveDays: number,
    leaveDeduction: number,
    holidayDays: number
  }>,
  baseEffective: number | null
}
```

- `effectiveEndDate = min(requestedEndDate, todayYmd)`
- future-only 구간은 Jira worklog/SQL schedule 조회를 수행하지 않으며 분모를 `null`로 반환한다.
- 가용 근무일 0은 `0.1`로 만들지 않고 `null`이다.
- 겹치는 일정은 account/date별 최소 `work_ratio`만 적용하며 일별 deduction이 base workday를 넘지 않는다.
- 잘못된 날짜는 `RESOURCE_ANALYSIS_INVALID_DATE_RANGE`다.
- cache 계산 키는 `effectiveEndDate`를 사용하고 응답의 `requestedEndDate`는 각 요청값으로 덮어쓴다.

### 2.10 `getSettingData`

- Permission: `PUBLIC`
- Payload: 없음
- 기존 top-level settings 응답을 유지하며 누락 필드를 기본값으로 보충한다.

```js
{
  success: true,
  currency: string,
  hourRate: number,
  utilizationUnderBand: number,
  utilizationOverBand: number,
  utilizationRedBand: number,
  scopeTodoAmberRatio: number,
  scopeTodoRedRatio: number,
  progressThreshold: number // 기본 5
}
```

### 2.11 `updateSetting`

- Permission: `SETTINGS.write`
- 기존 payload 필드에 `{ progressThreshold?: number }`를 추가했다.
- `progressThreshold`는 finite number이며 `0..100`이어야 한다.
- 성공:

```js
{
  success: true,
  content: {
    settings: SettingsDTO
  }
}
```

- 검증 실패: `SETTING_PROGRESS_THRESHOLD_INVALID`

## 3. 저장소 및 Schema 변경

### SQL

신규 table/migration은 없다.

- `UserSchedule.UPDATE`: `AND account_id = ?`
- `UserSchedule.DELETE_BY_ID`: `AND account_id = ?`
- `CommonQuery.executeQuery`: SDK raw DML shape 정규화

### KVS manifest

```yaml
progressThreshold:
  type: float
```

`SettingDefaults.js`를 seed와 read/update service의 공통 기본값 SSOT로 사용한다. 기존 settings record는 `{...defaults, ...saved}` 순서로 보존·보충한다.

## 4. 변경 파일

### Runtime source

- `manifest.yml`
- `src/index.js`
- `src/rdb/query/CommonQuery.js`
- `src/rdb/query/UserSchedule.js`
- `src/resolver/mySchedule/MyScheduleController.jsx`
- `src/resolver/mySchedule/MyScheduleService.jsx`
- `src/resolver/mySchedule/MyScheduleRepository.jsx`
- `src/utils/license/LicenseGuard.js`
- `src/utils/ResponseWrapper.js`
- `src/resolver/utils/sentry/SentryConfig.js`
- `src/resolver/license/LicenseDiagnosticsController.js` — 삭제
- `src/resolver/resourceManagement/ResourceManagementService.js`
- `src/resolver/utils/job/JobService.js`
- `src/resolver/resourceAnalysis/ResourceAnalysisService.js`
- `src/resolver/backoffice/setting/SettingDefaults.js` — 신규
- `src/resolver/backoffice/setting/SettingService.js`
- `src/resolver/backoffice/user/UserRepository.js`
- `src/seed/SeedData.js`
- `src/utils/errors/ErrorCodes.js`

### Test/contract

- `src/rdb/query/__test__/CommonQuery.test.js`
- `src/resolver/mySchedule/__test__/MyScheduleService.test.js`
- `src/resolver/mySchedule/__test__/MyScheduleRepository.test.js`
- `src/utils/license/__test__/LicenseGuard.test.js`
- `src/utils/__test__/ResponseWrapperLicense.test.js`
- `test/permission/permissionMap.contract.test.js`
- `src/resolver/resourceManagement/__test__/ResourceSalaryLeak.test.js`
- `src/resolver/utils/job/__test__/JobService.test.js`
- `src/resolver/resourceAnalysis/__test__/ResourceAnalysisDenominator.test.js`
- `src/resolver/backoffice/setting/__test__/SettingService.test.js`
- `src/resolver/backoffice/user/__test__/UserRepositoryDml.test.js`
- `test/settings/progressThresholdManifest.contract.test.js`
- SDK shape를 반영하도록 기존 repository test mock 일부 수정

Frontend `static/ui/**`와 locale 파일은 수정하지 않았다.

## 5. 테스트 결과

실행 명령:

```text
npm test -- --runInBand
```

결과:

```text
Test Suites: 52 passed, 52 total
Tests:       768 passed, 768 total
Snapshots:   0 total
```

주요 신규 고정 분기:

1. 타인 schedule update/delete 0행 거부
2. 일정 날짜/ratio validation 및 overlap SQL
3. SDK raw `{rows:{affectedRows}}` 정규화와 SELECT 보존
4. license development/staging allowlist, production active/inactive/API fallback, unknown/unavailable
5. registrar 밖 diagnostics 미존재
6. resource overview 비용 키 재귀 누출 방지
7. job success/null/입력 오류/KVS 오류
8. 미래-only/오늘 clamp/분모 0/겹침 일정 cap
9. settings 기본값/update/validation/manifest attribute/두 소비 service 연결

## 6. Forge lint 상태

지침에 따라 먼저 다음 명령으로 app root를 확인했다.

```text
pwd
Path: C:\CloudJira\moves-workforce
```

그 뒤 root에서 `forge lint`를 실행했으나 **124초 동안 출력 없이 timeout(exit 124)** 되어 완료 판정을 얻지 못했다. manifest 오류 메시지는 출력되지 않았지만, lint 자체가 끝나지 않았으므로 결과는 **UNVERIFIED**다. integration verifier 단계에서 재실행해야 한다.

manifest 변경은 storage schema에 `progressThreshold`를 추가하므로 development deploy 후 settings read/update smoke test가 필요하다. scope/egress 변경은 없다.

## 7. Frontend/Verifier 인계 사항

1. `getLicenseDiagnostics` invoke 및 console dump를 제거한다.
2. `getSentryDSN`은 `result.content.dsn`을 소비한다.
3. 일정 update/delete 성공은 `result.content.rowsAffected`를 소비한다.
4. job polling은 `result.success` 확인 후 `result.content.job`을 읽는다.
5. `JOB_STATUS_READ_FAILED`/transport failure에서는 server job을 삭제하지 않는다.
6. 가동률 `effectiveMmDays === null` 또는 `baseEffective === null`은 `N/A`로 표시한다.
7. settings UI는 `progressThreshold`를 number `0..100`으로 보내고 `result.content.settings`를 반영한다.
8. development 배포 후 production-license 모의 분기, Forge SQL DML, KVS schema, queue polling smoke E2E를 수행한다.

## 8. F-02 Mock Shape 정정 (Integration verifier 피드백)

통합 검증에서 runtime `CommonQuery` adapter는 정상이나 일부 기존 테스트가 `{rowsAffected:N}`만 반환해 실제 SDK/계층 계약을 재현하지 못한다는 지적을 받았다. 다음 기준으로 backend DML mock을 전수 정리했다.

### 계층별 mock 규칙

1. `@forge/sql`을 직접 호출하는 repository 경계:

```js
{rows: {affectedRows: N}}
```

2. `CommonQuery.executeQuery` adapter 이후 repository/service 경계:

```js
{
  rows: {affectedRows: N},
  rowsAffected: N
}
```

3. SQL을 발행하지 않는 runtime `NOOP_WRITE`/`NOOP_UPDATE`의 `{rowsAffected:0}` 반환 계약은 mock이 아니므로 기존 assertion을 유지한다.

### 정정 파일

- `src/resolver/backoffice/user/__test__/UpdateUserMerge.test.js`
  - `UserRepository` update가 CommonQuery adapter 이후 반환하므로 raw+alias 사용
- `src/resolver/backoffice/user/__test__/UserDeleteCascade.test.js`
  - 자식 cascade의 `executeQuery` mock은 raw+alias
  - 부모 `deleteByAccountId` mock은 direct SQL raw shape
- `src/resolver/projectTeam/__test__/ProjectTeamService.test.js`
  - `ProjectTeamRepository`와 `insertProjectusersService`는 CommonQuery 이후 계약이므로 raw+alias
- `src/resolver/backoffice/team/__test__/TeamService.test.js`
  - `TeamRepository` write mock은 CommonQuery 이후 raw+alias

정적 재검색 결과 test mock의 `{rowsAffected:N}`-only 반환 패턴은 0건이다. `rowsAffected` 검색에 남는 항목은 raw+alias adapter 계약, 서비스 응답 assertion, 또는 실제 no-op 반환 assertion이다.

### 재검증 결과

관련 회귀 테스트:

```text
Test Suites: 5 passed, 5 total
Tests:       84 passed, 84 total
Snapshots:   0 total
```

전체 backend:

```text
Test Suites: 52 passed, 52 total
Tests:       768 passed, 768 total
Snapshots:   0 total
```

### 보정 루프 2 — UserRepository direct SQL 경계 제거

첫 mock 정정에서 `updateUserWithSalaryRepository`와 `updateUserRepository`가 `@forge/sql`을 직접 호출한다는 잔여 runtime 경계가 확인됐다. 두 함수를 아래 공통 경로로 변경했다.

```text
UserService
  → UserRepository
  → CommonQuery.executeQuery
  → @forge/sql raw rows.affectedRows
  → rowsAffected alias
```

따라서 `UserService`의 `result.rowsAffected === 0` 분기가 실제 SDK 결과에서도 작동한다. 조회 후 경쟁 삭제 등으로 UPDATE가 0행이면 `USER_NOT_FOUND`를 반환하는 회귀 테스트를 추가했다.

추가·수정 파일:

- `src/resolver/backoffice/user/UserRepository.js`
- `src/resolver/backoffice/user/__test__/UpdateUserMerge.test.js`
- `src/resolver/backoffice/user/__test__/UserRepositoryDml.test.js`

관련 테스트:

```text
Test Suites: 3 passed, 3 total
Tests:       21 passed, 21 total
Snapshots:   0 total
```

최종 전체 backend:

```text
Test Suites: 52 passed, 52 total
Tests:       768 passed, 768 total
Snapshots:   0 total
```

## 9. F-03 Environment Allowlist 정정

보정 루프 3에서 `NOT_APPLICABLE`을 모든 non-production 문자열로 넓히던 조건을 제거하고, 정확히 아래 두 환경만 allowlist로 고정했다.

```js
new Set(['development', 'staging'])
```

판정 우선순위:

1. 모든 환경: context의 boolean `active`가 있으면 `ACTIVE/INACTIVE`로 최우선 판정한다.
2. `development`/`staging`: context license가 부재할 때만 `NOT_APPLICABLE`이다.
3. `production`: context가 없거나 불명확하면 License API fallback을 사용한다.
4. explicit unknown(`qa`, `test`, `local`, `tunnel`, `preview`, 임의 문자열): context가 없으면 API를 호출하지 않고 `UNAVAILABLE/ENVIRONMENT`로 즉시 fail-closed한다.
5. Jest에서 환경 정보가 전혀 없을 때 `resolveEnvironmentType()`이 `development`를 반환하는 기존 단위테스트 편의 동작은 유지한다.

관련 테스트:

```text
Test Suites: 2 passed, 2 total
Tests:       21 passed, 21 total
Snapshots:   0 total
```

최종 전체 backend:

```text
Test Suites: 52 passed, 52 total
Tests:       768 passed, 768 total
Snapshots:   0 total
```
