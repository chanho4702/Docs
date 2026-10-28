# 워크로그 단일일 시간 범위 입력 설계서

## 1. 개요 / 영향 범위

`1h`, `30m` 같은 Jira duration 문자열을 직접 입력하던 단일 워크로그 등록·수정 UI를 같은 날짜의 `시작 시각`/`종료 시각` 입력으로 바꾼다. 제출 직전에 두 시각 차이를 `timeSpentSeconds`로 계산해, Jira Worklog REST API에는 현재와 동일한 payload를 보낸다.

- 백엔드: 변경 없음. 현재 워크로그 쓰기는 resolver를 거치지 않고 Custom UI의 `requestJira()`가 Jira REST를 `asUser()`로 직접 호출한다.
- 프론트: 공용 `WorklogModal` 및 시간 범위 계산 유틸리티를 수정한다. 이 모달을 공유하는 My Work와 프로젝트 상세 캘린더가 함께 적용 대상이다.
- DB/KVS: 변경·마이그레이션 없음. Jira가 `started`, `timeSpentSeconds`를 원천으로 보관한다.
- i18n: `locales/kr/worklog.json`, `locales/en/worklog.json`에 단일일 종료 시각·계산된 시간·시간 범위 오류·기존 duration 호환 입력 키를 추가한다. 생성물 `ko-KR.json`/`en-US.json`은 직접 수정하지 않는다.

### 실제 진입·수정 경로

| 화면 | 등록 | 수정 | 변경 범위 |
|---|---|---|---|
| My Work (`pages/myWork/WorklogPage.jsx`) | 날짜 클릭 또는 등록 버튼 → `WorklogModal` | 캘린더/목록 워크로그 클릭 → 같은 모달 | 적용 |
| 프로젝트 상세 캘린더 (`pages/projectDetail/calender/ProjectCalender.jsx`) | 날짜 클릭 → `WorklogModal` | 이벤트 클릭 → 같은 모달 | 적용 |
| 프로젝트 상세 캘린더 drag/drop | `worklogDrop.js`가 날짜만 변경 | 해당 | 변경 안 함. duration은 보존한다. |

기존 다중 날짜 일괄 등록(`inputMode === 'range'`)은 별도 기능이다. 이번 범위는 단일 워크로그의 duration 텍스트 입력 제거이며, 다중 날짜 모드의 일별 시작/종료 시간·주말/휴일 제외·롤백은 유지한다.

## 2. 경계면 계약 (가장 중요)

신규 Forge resolver·Query key·DB API는 없다. 프론트가 사용하는 Jira REST 요청 계약은 URL, method, 권한 모델을 포함해 유지한다.

| 호출 | 입력 파라미터 | 성공 응답 shape | 대응 프론트 |
|---|---|---|---|
| `executeRequest('addWorklog')` | path `{ issueIdOrKey }`, body `{ comment, started, timeSpentSeconds }` | Jira 생성 Worklog 객체 (`id`, `started`, `timeSpentSeconds`, …) | `WorklogModal.addWorklog` |
| `executeRequest('updateWorklog')` | path `{ issueIdOrKey, id }`, body `{ comment, started, timeSpentSeconds }` | Jira 갱신 Worklog 객체 또는 `204`에 대한 현재 helper 반환 | `WorklogModal.updateWorklog` |
| `executeRequest('updateWorklog')` (drag/drop) | path `{ issueIdOrKey, id }`, body `{ started }` | 현재와 동일 | `worklogDrop.js`, My Work calendar |

단일일 UI의 form 값만 다음처럼 바꾼다.

| 기존 form 값 | 신규 form 값 | 전송 변환 |
|---|---|---|
| `start_date`, `start_time`, `spent_time: '1h 30m'` | `start_date`, `start_time: '09:00'`, `end_time: '10:30'` | `started = getTimeISOString(start_date, start_time, context.timezone)`, `timeSpentSeconds = (end - start) * 60` |

`spent_time`은 일반 입력 form에서 제거한다. 단, 아래의 호환 모드에서는 기존 값과 `convertTimeToSeconds`를 유지한다.

## 3. 백엔드 설계

변경 없음.

- `static/ui/src/utils/jiraApi/requestJira.js`의 `addWorklog`, `updateWorklog`는 Jira v3 URI와 `asUser()` 호출 경로를 그대로 사용한다.
- `src/index.js`, `PermissionMap.js`, Controller/Service/Repository, Forge manifest scope, MySQL/KVS 스키마는 수정하지 않는다.
- Jira의 최종 validation(권한, 시간 추적 설정, remaining estimate 정책)은 계속 Jira 응답으로 처리한다. UI는 현재의 `fetchJiraProjectPermissions` 사전 확인도 유지한다.

## 4. 프론트엔드 설계

### 4.1 공용 시간 범위 유틸리티

`static/ui/src/pages/myWork/modal/worklogTimeRange.js`를 새로 두고, React와 분리된 순수 함수로 다음을 제공한다.

- `timeRangeSeconds(startTime, endTime)`: `HH:mm` 두 값을 분 단위로 변환해 양의 초 수를 반환한다. 빈 값, 형식 오류, `end <= start`는 `null`을 반환한다.
- `worklogRangeInTimezone(worklog, timezone)`: Jira의 `started`와 `timeSpentSeconds`를 사용자 timezone에서 읽어 `{ date, startTime, endTime, isSameDay }`로 반환한다. 날짜와 시각은 모두 `dayjs.tz` 기준으로 구한다.
- `isSingleDayWorklogRange(range)`: 시작·종료가 같은 local date이고 양의 duration인지 판정한다.

`TimeUtils.js`에 timezone-aware 날짜 포맷이 아직 없으므로, 위 유틸리티에서 dayjs timezone을 사용하거나 공용 `formatDateInTimezone(datetime, tz)`를 추가한다. `new Date(...)/getDateString()/formatToHHmm()`의 실행 브라우저 timezone 의존을 수정 화면의 기본값 계산에 사용하면 안 된다.

### 4.2 WorklogModal 동작

대상: `static/ui/src/pages/myWork/modal/WorklogModal.jsx`.

1. 단일일 등록 기본 모드와 단일일 수정 화면에서 `날짜`, `시작 시각`, `종료 시각`을 한 행/두 행에 배치한다.
2. 종료 시각 변경 즉시 `timeRangeSeconds`로 계산한 `N시간 M분`을 비편집 요약으로 표시한다. 서버 요청 payload에는 표시 문자열이 아니라 정수 `timeSpentSeconds`만 포함한다.
3. 제출 시 form validation과 `onSubmit` 방어 검증을 모두 수행한다.
   - 시작/종료 시각은 `HH:mm`이어야 한다.
   - 종료는 시작보다 엄격히 늦어야 한다.
   - 0분, 음수, `NaN`, 자정 넘김은 거부한다. 이번 요구사항은 같은 날짜 범위만 허용한다.
   - invalid 상태에서는 요청하지 않고 field error를 표시한다.
4. `addWorklog`/`updateWorklog`는 `value.end_time`에서 계산한 seconds를 사용한다. `started` 생성은 지금처럼 `getTimeISOString(date, start, context.timezone)`을 쓴다.
5. 수정 초기값은 `worklog.started + worklog.timeSpentSeconds`를 **`context.timezone`에서** 계산한다. 동일 local date이면 날짜·시작·종료로 편집 가능하다.
6. 편집 대상이 다음 중 하나면 `기존 시간 입력` 호환 모드로 자동 진입한다.
   - duration 종료가 다음 local date로 넘어감(자정 넘김 또는 다일 Jira worklog)
   - `started`/`timeSpentSeconds`가 없어 시간 범위를 복원할 수 없음
   - duration이 0 이하 또는 Jira 값이 비정상임

호환 모드는 현재의 `spent_time` field와 정규식·`convertTimeToSeconds`를 유지하고, 사용자에게 시간 범위로 표현할 수 없다는 안내를 보인다. 따라서 기존 API와 기존 데이터는 깨지지 않고, 일반적인 1h/30m 편집 불편만 사라진다. 신규 등록에서는 호환 모드를 노출하지 않는다.

7. 기존 다중 날짜 입력 모드는 별도 버튼/기능으로 유지한다. 단, 단일일 시간 범위의 공용 validation을 재사용할 수 있으면 재사용하되, 이번 변경으로 다중 날짜 생성/롤백 semantics를 바꾸지 않는다.
8. `handleInputModeChange('range')`의 기존 종료 시각 산정은 `hourRate`가 아니라 원 워크로그의 `timeSpentSeconds`로 계산하도록 함께 정정한다. 이 값이 다음 날을 넘는 경우에도 다중 날짜 모드의 기존 정책은 유지한다.

### 4.3 캐시·권한

- 성공 후 현재 `submitModal()`이 수행하는 `myWorkKeys.calendarWorklogsAll`, `myWorkKeys.projectWorklogsAll`, `calendarKeys.projectWorklogs(...)` invalidation은 유지한다. 신규 query key는 없다.
- 작성·수정·삭제 권한 사전 확인과 Jira `asUser` 자체 인가는 그대로 유지한다.
- 실패 응답이 `{ success:false }`로 resolve되는 `executeRequest` 계약도 `ensureWorklogResult`로 동일하게 처리한다.

## 5. DB 설계

변경 없음.

- 앱 DB는 Jira worklog 원문을 새로 저장하지 않는다.
- `worklog_issue_daily` 집계 데이터도 Jira worklog 변경 이후 기존 수집 흐름으로 갱신되므로 이 기능 때문에 schema/마이그레이션을 추가하지 않는다.

## 6. i18n 키 목록

`locales/kr/worklog.json`, `locales/en/worklog.json`에 같은 키 구조를 추가한다.

| 키 | 한국어 | English |
|---|---|---|
| `worklog.modal.field.endTime` | 종료 시각 | End time |
| `worklog.modal.calculatedTime` | 계산된 시간 | Calculated time |
| `worklog.error.invalidTimeRange` | 종료 시각은 시작 시각보다 늦어야 합니다. | The end time must be later than the start time. |
| `worklog.error.legacyDurationRequired` | 이 기존 워크로그는 같은 날짜 시간 범위로 표현할 수 없어 소요 시간으로 편집합니다. | This existing worklog cannot be represented as a same-day time range and is edited by duration. |
| `worklog.modal.field.legacySpentTime` | 소요 시간 | Time spent |
| `worklog.modal.calculatedTimeValue` | `{{hours}}시간 {{minutes}}분` | `{{hours}}h {{minutes}}m` |

기존 `worklog.error.rangeInvalidTime`은 다중 날짜 모드가 이미 사용하므로 삭제·의미 변경하지 않는다. 단일일에는 위 `invalidTimeRange`를 사용해 오류 문맥을 분리한다. 구현 뒤 `npm run merge`로 생성 번역을 갱신한다.

## 7. 테스트 계획 및 구현 작업 분해

### 프론트엔드

- [ ] `worklogTimeRange.test.js`를 추가해 09:00→10:30 = 5400초, 동일 시각/역순/빈 값 = invalid, 23:00→01:00 = invalid을 검증한다.
- [ ] 서로 다른 browser timezone에서도 `Asia/Seoul` 등의 `context.timezone`으로 기존 Jira `started`를 정확한 local date/start/end로 복원하는 테스트를 추가한다.
- [ ] 같은 날 기존 worklog는 종료 시각으로 초기화되고, 수정 요청 body가 올바른 `started`와 seconds를 갖는지 `WorklogModal` 또는 request builder 단위 테스트로 검증한다.
- [ ] 다음 날로 끝나는 기존 worklog가 duration 호환 모드로 전환되고, 신규 등록에는 duration field가 노출되지 않는지 검증한다.
- [ ] My Work와 프로젝트 캘린더가 같은 `WorklogModal`을 전달하는 현재 wiring을 characterization test 또는 기존 smoke test로 확인한다.
- [ ] `static/ui`에서 `npm test -- --runInBand`, `CI=true npm run build:app`을 실행한다. 생성 번역 파일은 사용자 변경 여부를 확인한 뒤에만 처리한다.

### 백엔드

- [ ] 코드/DB/manifest 변경 없음임을 확인한다.
- [ ] Jira REST payload의 field 이름과 `requestJira` 호출 방식이 기존과 동일함을 정적 검증한다.

### 통합 검증

- [ ] 편집 시 `started`의 날짜·시각과 종료 계산이 `context.timezone` 하나를 기준으로 일관되는지 점검한다.
- [ ] duration 호환 경로와 calendar drag/drop가 기존 worklog를 손상시키지 않는지 확인한다.
- [ ] `forge lint`를 실행한다.
