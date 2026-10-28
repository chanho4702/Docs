# 논리 설계 감사 후속 Frontend 구현 보고서

> 기준일: 2026-08-03  
> SSOT: `01_architect_design.md`  
> Backend 실제 계약: `02_backend_report.md`  
> 구현 범위: F-03, F-05, F-06, F-07, F-09 frontend 및 감사 대상 query key/i18n 정리

## 1. 구현 결과

| 항목 | 결과 | 핵심 변경 |
|---|---|---|
| License diagnostics | 완료 | `getLicenseDiagnostics` invoke 및 `[LICENSE-DIAG]` console 출력 전체 제거 |
| Sentry config | 완료 | `getSentryDSN`의 `result.success` 검사 후 `result.content.dsn` 소비 |
| Upload job polling | 완료 | `{content:{job}}` 소비, `forgetJob`/`cleanupJob` 분리, terminal에서만 server cleanup, transient retry/backoff |
| Calendar context/drag | 완료 | ProjectDetail 상위 context 1회 조회·전달, 준비 전 일정 query/drag 비활성화, 원본 `worklog.started` 사용, toast/revert |
| Resource denominator | 완료 | backend `null` 보존 및 `N/A`, 가동률 계산 방지, endDate 오늘 상한 |
| Progress threshold | 완료 | 0..100 validation, 0.5 step `%p` 입력, 실제 저장 응답 `content.settings`를 query cache에 반영 |
| Query key | 완료 | 감사 대상 inline key를 `logicalAuditKeys.js` factory로 이관 |
| i18n | 완료 | calendar/resource/setting/status 양 언어 source 추가 후 merge |

## 2. 실제 Backend 응답 소비 계약

### 2.1 `getSentryDSN`

```js
if (!result.success) throw new Error(result.error.message);
const dsn = result.content.dsn;
```

DSN 조회가 실패해도 앱 부팅은 계속하며, DSN 원문은 console에 출력하지 않는다.

### 2.2 `getUploadJobStatus`

```js
{
  success: true,
  content: { job: JobDTO | null }
}
```

- `success:false` 또는 transport/shape 오류: local tracking과 server job을 유지한다.
- 연속 실패는 3/6/12/24/30초 순으로 최대 30초 backoff한다.
- 세 번째 연속 실패 시 `common.upload.error` toast를 한 번만 표시하고 polling은 유지한다.
- 다음 성공 응답에서 실패 횟수를 0으로 초기화한다.
- `job:null`: `forgetJob(jobId)`로 local tracking만 종료한다.
- `COMPLETED | PARTIAL | FAILED`: `cleanupJob(jobId)`로 server batch/job과 local tracking을 정리한다.

### 2.3 Calendar

`ProjectDetailPage`에서 `view.getContext()`를 `forgeContextKeys.current()`로 한 번 조회하고 다음 경로로 전달한다.

```text
ProjectDetailPage → ProjectDetailTabs → projectDetailTabs factory → ProjectCalender
```

`context.accountId`와 `context.timezone`이 준비되기 전에는 project worklog, 개인 일정, 팀원 일정 query와 drag를 비활성화한다. Drag 시 이전 시각은 `event.extendedProps.worklog.started`에서 읽고, 성공하면 `calendarKeys.projectWorklogs(params)`만 무효화한다. 실패 또는 context 미준비이면 `revert()`와 오류 toast를 수행한다.
Calendar query payload 날짜는 backend 계약대로 zero-padded `yyyy-MM-dd`로 통일했다.

### 2.4 `getResourceAnalysisList`

Backend의 top-level 호환 shape를 그대로 소비한다. `baseMmDays`, `baseEffective`, `members[].effectiveMmDays`가 명시적으로 `null`이면 로컬 평일 수로 fallback하지 않는다. 화면은 `N/A`를 표시하고 가동률 나눗셈을 수행하지 않는다.

### 2.5 Settings

`getSettingData`는 기존 top-level shape에서 `success`를 제거한 `SettingsDTO`를 공통 query cache에 보관한다.

`updateSetting` 성공은 아래 경로를 소비한다.

```js
const settings = result.content.settings;
queryClient.setQueryData(settingKeys.detail(), settings);
```

`progressThreshold`는 빈 문자열/비유한수/0 미만/100 초과를 invoke 전에 차단하며 number로 전송한다.

## 3. Query key factory

신규 `static/ui/src/utils/queryKey/logicalAuditKeys.js`에 다음 factory를 추가했다.

- `forgeContextKeys.current()`
- `settingKeys.detail()`
- `scheduleKeys.myList(params)` / `scheduleKeys.projectWorkers(params)`
- `calendarKeys.coworkerField()` / `calendarKeys.projectWorklogs(params)`
- `resourceAnalysisKeys.projectUsers(params)` / `userMap(ids)` / `list(params)` / `worklogDetail(params)`
- `jobKeys.status(jobId)`

사용자 목록 완료 갱신용으로 `userKeys.lists()` prefix도 추가했다. 전체 기존 inline key 일괄 이관은 설계서 비목표대로 수행하지 않았다.

## 4. i18n

Source 변경:

- 신규: `locales/kr/calendar.json`, `locales/en/calendar.json`
- 수정: `setting.json`, `resource.json`, `projectStatus.json`의 kr/en 쌍
- `ProjectStatusEditModal`의 object key 참조를 string leaf로 변경
- `ProjectStatusEditModal`, `LevelEditModal`의 `Close`/`삭제`를 `common.button.*`로 변경
- polling은 기존 `common.upload.error` 사용

실행:

```text
cd static/ui
npm run merge
```

결과: PASS. `locales/ko-KR.json`, `locales/en-US.json` 생성물을 merge로 갱신했다. `MODULE_TYPELESS_PACKAGE_JSON` 경고만 존재한다.

최종 leaf parity 정적 검사: kr 1,994 / en 1,994, 한쪽에만 존재하는 key 0건.

## 5. 테스트 및 Build

### Frontend Jest 전체

```text
npm test -- --runInBand
Test Suites: 41 passed, 41 total
Tests:       650 passed, 650 total
Snapshots:   1 passed, 1 total
```

신규 검증:

- polling success/job:null/wrapper 실패/invalid shape/terminal 판정/backoff 상한
- `forgetJob` local-only와 `cleanupJob` server+local 경계
- Calendar context 미준비, drag 성공, transport 실패+revert, targeted cache key
- `progressThreshold` 0/0.5/100 및 빈 값·범위 밖 validation

마지막 테스트 출력의 실패 수는 0이다.

### Production build

```text
npm run build
Compiled with warnings.
Exit code: 0
```

- main JS gzip: 1.72 MB
- 기존 Atlaskit/marklassian source map 누락 경고 3건
- 기존 bundle size 권고 경고
- 신규 compile error 없음

통합 verifier 보완까지 포함한 최종 source에서 build를 재실행해 성공을 확인했다.

## 6. 변경 파일

주요 runtime:

- `static/ui/src/index.js`
- `static/ui/src/stores/useLicenseStore.js`
- `static/ui/src/stores/useJobStore.js`
- `static/ui/src/polling/JobPollingManager.jsx`
- `static/ui/src/polling/jobPolling.js`
- `static/ui/src/pages/projectDetail/ProjectDetailPage.jsx`
- `static/ui/src/components/tabs/ProjectDetailTabs.jsx`
- `static/ui/src/constants/tabs.js`
- `static/ui/src/components/calendar/FullCalendar.jsx`
- `static/ui/src/pages/projectDetail/calender/*`
- `static/ui/src/pages/projectDetail/analysisReport/resource/*`
- `static/ui/src/backoffice/page/setting/*`
- `static/ui/src/utils/queryKey/logicalAuditKeys.js`
- `static/ui/src/utils/queryKey/userKeys.js`

Test:

- `static/ui/src/polling/__test__/jobPolling.test.js`
- `static/ui/src/stores/__test__/useJobStore.test.js`
- `static/ui/src/pages/projectDetail/calender/__test__/worklogDrop.test.js`
- `static/ui/src/backoffice/page/setting/__test__/settingValidation.test.js`

## 7. Verifier 인계

1. 최종 source frontend production build 재실행 완료(PASS).
2. `getSentryDSN`, `getUploadJobStatus`, `updateSetting` producer/consumer shape 정적 대조.
3. development 배포 후 Calendar drag, KVS job polling, settings `progressThreshold` smoke E2E.
4. frontend main bundle 1.72 MB와 source map 경고는 이번 논리 결함 수정의 비목표이며 별도 성능 작업으로 유지.

## 8. Integration verifier PARTIAL 보정

통합 verifier가 지적한 frontend PARTIAL 3건을 다음과 같이 추가 보정했다.

### 8.1 Calendar resolved HTTP failure

`executeRequest('updateWorklog')`가 reject하지 않고 `{success:false,error}`로 resolve하는 경우도 `worklogDrop.js`에서 명시적으로 예외 변환한다.

- `eventInfo.revert()` 실행
- 오류 toast 실행
- query invalidation 미실행
- `event.setExtendedProp` 미실행
- 성공 toast 미실행

resolved failure 회귀 테스트를 추가했다.

### 8.2 개인 일정 mutation 및 query key

- `WorklogPage.jsx`의 조회를 `scheduleKeys.myList({startDate,endDate})`로 변경
- 일정 성공 후 갱신을 `scheduleKeys.all` prefix로 변경
- 조회 payload에서 client `account_id` 제거
- 조회 날짜를 backend 계약인 `yyyy-MM-dd`로 통일
- `ScheduleModal.jsx`의 add/update/delete는 `requireScheduleMutationSuccess`로 `{success:false}`를 throw 처리
- 권한 거부·validation 실패 시 오류 toast를 유지하고 `submitModal`을 호출하지 않으므로 modal이 닫히거나 cache가 갱신되지 않음
- 성공일 때만 `submitModal → invalidate → close` 실행
- `SCHEDULE_NOT_FOUND_OR_FORBIDDEN`은 존재 여부를 노출하지 않는 공통 번역 안내 사용

### 8.3 Frontend license fail-closed

`decideClientLicense(context)` helper로 frontend App gate 상태를 고정했다.

| context | state | App gate |
|---|---|---|
| `license.active:true` | `ACTIVE` | 허용 |
| `license.active:false` | `INACTIVE` | 차단 |
| 명시적 DEVELOPMENT/STAGING + license 부재 | `NOT_APPLICABLE` | 허용 |
| TUNNEL/LOCAL/TEST/QA/unknown + license 부재 | `UNAVAILABLE` | 차단 |
| PRODUCTION + license 부재 | `UNAVAILABLE` | 차단 |
| environment 불명확 + license 부재 | `UNAVAILABLE` | 차단 |
| `view.getContext()` 실패 | `UNAVAILABLE` | 차단 |

초기 `isLicensed`도 false로 두어 판정 전 direct `requestJira` 화면이 열리지 않는다. helper 분기와 store context 실패를 각각 테스트했다.

보정 루프 2에서 license 부재 allowlist를 정확히 `DEVELOPMENT`, `STAGING` 두 값으로 축소했다. 문자열상 non-production처럼 보여도 `TUNNEL`, `LOCAL`, `TEST`, `QA` 및 알 수 없는 환경은 backend production 정책과 불일치할 수 있으므로 frontend에서 추정 허용하지 않고 `UNAVAILABLE`로 차단한다. `license.active:true/false` 명시값 우선 규칙은 유지한다.

보정 루프 2 검증은 license 관련 13 tests, frontend 전체 41 suites/650 tests, production build를 모두 통과했다. Build 경고는 기존 source-map 3건과 1.72 MB bundle 경고만 동일하게 남았다.

### 8.4 보정 후 최종 검증

```text
npm run merge                         PASS
npm test -- --runInBand              41 suites / 650 tests PASS
npm run build                         PASS (Compiled with warnings)
i18n leaf parity                      kr 1,994 / en 1,994 / diff 0
```

첫 build 시 prebuild merge가 Windows 파일 open `UNKNOWN (-4094)`로 1회 실패했으나, 동일 merge를 즉시 재실행해 성공했고 이어진 최종 build도 exit 0으로 완료됐다. Source-map 3건과 1.72 MB bundle 경고는 기존 경고다.
