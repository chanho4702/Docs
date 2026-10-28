# period-lock 플랫폼 실측 목록 (미검증) — 초안

> 작성: feature-architect · 2026-10-03 (설계 단계). backend/frontend 가 구현하며 항목을 보태고, 배포 회차에 리더가 확인한다.
> 확인 원칙(AGENTS.md): iframe 클릭은 자동화에서 신뢰할 수 없다 — 결과는 resolver 반환값·DB 상태로 본다. `forge logs` 는 늦다.
> 배포 회차 전제: `forge install --upgrade`(모듈 3개 + scope `write:jira-work` 추가). 제공자 선택은 **사람이** Jira 관리 > 시스템 > 시간 추적에서 한다.
> 이 기능이 기대는 기존 항목: T1·T3·T4·T20(워크로그 이벤트·피드 형태), T15(`VALUES()`), T18(v020·v021 — 감사 이벤트 폭), U11(scope).

| # | 항목 | 설계 위치 | 영향 | 확인 방법 | 실패 시 동작 / 대안 |
|---|---|---|---|---|---|
| P1 | **제공자 선택 후 REST 경로가 막히는가** — 사용자 API 토큰으로 `POST /rest/api/3/issue/{id}/worklog` 를 마감 기간 started 로 호출 | 수용 기준 문장, §1.1 | 수용 기준 문구 | 우리 앱을 제공자로 선택 → 마감 기간 만들기 → curl 로 POST. 201 이면 "막지 못함"(가정과 같음) → 1분 안에 `timesheet_close_drift` 행(미제출) 또는 `CHANGED_AFTER_APPROVAL`(승인 기간)이 생기는지 | 가정이 "막지 못함"이라 설계 변경 없음. 막힌다면(4xx) 문구를 "REST 도 막힘"으로 강화할 수 있으나 감지는 그대로 둔다(자동화·가져오기 대비) |
| P2 | **제공자 선택 후 자동화 규칙 "Log work" 액션·CSV 가져오기·Jira 모바일 앱·이슈 전이 화면의 시간 추적 필드** 로 워크로그를 쓸 수 있는가 | 수용 기준, §10 L3 | 문구·감지 비중 | 각 경로로 마감 기간 워크로그 1건씩 → 성공 여부 기록 + 감지 결과(DB) | 막지 못하는 경로를 수용 기준 옆 표로 문서화. 감지는 동일 |
| P3 | **`jira:issueAction`·`jira:issueActivity` 가 `displayConditions.timeTrackingProviderEnabled: {key}` 를 지원하는가**(문서 예시는 issuePanel), 제공자 **미선택** 시 두 모듈이 숨는가 | manifest §6.1 | 미선택 사이트 UI | `forge lint` 통과 여부 → 제공자 미선택 상태에서 이슈 ••• 메뉴·활동 탭 확인 → 선택 후 다시 확인 | lint 실패 시 조건 제거. 미선택 사이트에도 우리 메뉴·탭이 추가로 보인다(판정은 같아 해는 없음) — 탭 첫 화면에 "Jira 기본 작업 로그와 같은 데이터" 안내 |
| P4 | 제공자 선택 후 숨는 범위 — ••• 의 Log work, 작업 로그 탭, 시간 추적 필드 클릭, 이슈 생성·전이 화면의 Log work 칸, JSM 에이전트 화면, 구 이슈 화면 | §1, 문서 "Disabled: Native Log work action via time tracking field" | 2층 빈틈 | 각 화면에서 Log work 진입 시도 | 숨지 않는 화면은 P2 목록과 함께 "막지 못하는 경로"로 문서화 |
| P5 | `jira:timeTrackingProvider` 가 관리 화면 선택 목록에 나타나는 조건(`adminPage` 필요 여부, `useAsConfig` 요구 여부), 선택 시 adminPage 링크 위치 | manifest §6.1 | 제공자 선택 가능 여부 | 배포 후 Jira 관리 > 시스템 > 시간 추적 목록에 "Moves Approval" 이 보이는지, 선택 후 링크가 설정 화면으로 가는지 | `adminPage` 를 빼거나 `useAsConfig: true` 를 붙인 별도 adminPage 를 둔다 |
| P6 | 제공자 전환(Jira 기본 → 우리 → Jira 기본) 시 기존 워크로그·남은 추정치가 보존되는가 | 운영 가이드 | 데이터 | 전환 전후 같은 이슈 워크로그 수·합계 비교 | 보존 안 되면 안내문에 경고(가능성 낮음 — 워크로그는 Jira 데이터) |
| P7 | `write:jira-work` 로 asUser `POST/PUT/DELETE …/worklog?adjustEstimate=auto` 가 되는가. 작성자가 사용자로 남는가. `timeSpentSeconds` 가 분 단위로 반올림되는가. `notifyUsers` 기본 동작 | `WorklogGateway` | 쓰기 전부 | 대화상자로 생성 → Jira REST(관리자)로 그 워크로그의 `author.accountId`, `timeSpentSeconds`(예: 90초 입력 시 값), 남은 추정치 변화 확인 | scope 부족(403) → scope 확인 후 `--upgrade`. 반올림되면 도메인 최소 60초 + 분 단위 입력으로 제한 |
| P8 | `PUT` 본문에 `visibility` 를 빼면 기존 공개 범위가 **보존**되는가. 응답 `comment` 가 ADF 인가 | §4.3 | 공개 범위 유실 | 그룹 제한 워크로그를 우리 대화상자로 시간만 수정 → 제한 유지 여부 | 지워지면 GET 한 `visibility` 를 그대로 PUT 본문에 실어 보낸다 |
| P9 | `jira:issueActivity` iframe 안 Atlaskit 모달(삭제 확인)이 잘리지 않는가. 탭에서 `new Modal({resource:'main/worklog'})` 이 열리는가, `onClose` 가 오는가 | §7.2 | 편집·삭제 UX | 탭에서 수정·삭제 클릭(사람이 확인) | 탭 안 모달이 잘리면 삭제 확인도 Forge Modal 로. Modal 이 안 열리면 탭 안 인라인 편집 행 |
| P10 | issueAction 대화상자로 만든 워크로그가 같은 화면의 우리 탭에 반영되는가(문서: "Frontend events notify app of issue changes" — 이벤트 이름·지연) | §7.3 | 목록 갱신 | 대화상자 저장 후 탭이 자동 갱신되는지, 안 되면 몇 초 뒤 포커스 시 갱신 | `refetchOnWindowFocus` + 새로고침 버튼(설계 기본) |
| P11 | issueAction·issueActivity 의 `title` 에 i18n 객체(`{i18n: worklog.manifest.logWork}`)를 쓸 수 있는가(manifest `translations` 와 merge 산출물 경로) | manifest §6.1 | 메뉴·탭 이름 언어 | `forge lint` + 한국어 사용자로 메뉴 이름 확인 | 영어 고정(`Log work`·`Work log`) — Jira 기본과 같은 낱말 |
| P12 | `POST /rest/api/3/worklog/list` 응답의 `updated`, `GET worklog/updated` `values[].updatedTime`, `worklog/deleted` `values[].updatedTime` 형식(epoch ms?) | `isChangeAfterClose` §4.7 | 마감 후 변경 판정 | 마감 직후 REST 로 생성 → 트리거·스윕 결과(DB `timesheet_close_drift.last_detected_at`) + 스윕 요약 로그에 `updatedTimes` 크기 | 없으면 트리거 경로는 트리거 시각, 스윕 경로는 판정 불가(건너뜀) — 누락 쪽으로만 틀린다 |
| P13 | `GET /rest/api/3/configuration/timetracking` 의 권한(Administer Jira)·필요 scope(`manage:jira-configuration`?) | Q26 | 제공자 상태 표시(이번 범위 밖) | 관리자 계정 asUser 로 1회(스파이크 빌드) | 이번 설계는 안내문만 — 영향 없음 |
| P14 | Tempo 등 다른 제공자가 선택된 사이트에 설치해도 아무것도 깨지지 않는가(우리 모듈 숨김, 감지만 동작) | §6.1 | 공존 | Tempo 평가판 설치 사이트(가능하면) | 문서화만 |
| P15 | `mypermissions` 키 이름 `WORK_ON_ISSUES`·`EDIT_OWN_WORKLOGS`·`DELETE_OWN_WORKLOGS` (Cloud 이름 변경 "work items" 이후에도 같은가) | §4.4 | 버튼 표시만 | `getIssueWorklogs.permissions` 를 권한 있는/없는 계정으로 비교 | 키를 못 받으면 전부 false → 버튼 숨김. 보안 영향 없음(실제 거부는 Jira 403). 표시를 true 기본으로 바꾸는 대안 |
| P16 | team-managed 프로젝트에서도 제공자 대체(Log work 숨김·우리 메뉴·탭 표시)가 적용되는가 | §1 | 2층 범위 | team-managed 프로젝트 이슈에서 P3·P4 반복 | 적용 안 되면 수용 기준 옆에 "company-managed 한정" 명시 |
| P17 | 사이트 시간 추적 설정(1일 = 8h, 1주 = 5d)이 다를 때 대화상자의 `1d`·`1w` 해석 | `durationInput.js` | 입력 해석 | 사이트 설정을 1d=7h 로 바꾸고 `1d` 입력 → 저장 값 | 우리 파서는 초를 보내므로 Jira 와 무관. 차이는 표시뿐 — 힌트에 기준 명시, 필요 시 `GET /rest/api/3/configuration/timetracking/options` |
| P18 | Jira 가 워크로그 쓰기를 거부하는 응답 — 권한 없음(403 vs 400), 시간 추적 꺼짐, 이슈가 편집 불가 상태(워크플로 속성) | `WorklogGateway` 매핑 §2.6 | 에러 코드 | 각 조건으로 생성 시도 → 응답 code | 매핑 표 수정. 400 의 `errors` 키 이름만 cause 로 |
| P19 | 우리 화면으로 쓴 워크로그가 트리거를 다시 일으켜도 열린 기간에서 오탐이 없는가(설계상 0) | §4.7 | 오탐 | 미제출·반려 기간에 우리 대화상자로 생성·수정·삭제 → `timesheet_submission.drift_detected_at`·`timesheet_close_drift` 무변화 | 오탐 시 즉시 결함 — 후보 쿼리 조건 재확인 |
| P20 | 판정 직후 마감된 경합: 관리자 마감 1초 전 열어 둔 대화상자로 저장 → 서버 거부(`WORKLOG_PERIOD_LOCKED`). 판정 통과 후 쓰기 직전 마감 → 쓰기 성공 + close drift 플래그 | §4.3 | 경합 의미 | 두 브라우저로 재현(사람) | 설계 의도. 문서화만 |

## 설계 단계 판단(실측으로 뒤집힐 수 있는 것)

- 수용 기준 문장은 P1·P2 가 "막지 못함"이라는 **가정** 위에 있다. 문서가 비UI 경로를 언급하지 않으므로 보수적으로 썼다.
- 마감 후 변경 감지의 정확성은 P12(`updated` 시각)에 기댄다. 시각이 없으면 오탐 대신 누락 쪽으로 틀리게 설계했다(`changedAt == null → 플래그 안 함`).
- 한계 L1(미제출 마감 기간의 삭제)·L2(밖으로 옮긴 수정)는 실측과 무관한 구조적 한계다 — 해소하려면 마감 시점에 사이트 전체 워크로그를 asApp 으로 색인해야 해서 택하지 않았다.

## backend 추가 (Phase 3, 2026-10-03)

| # | 항목 | 코드 위치 | 영향 | 확인 방법 | 실패 시 동작 / 대안 |
|---|---|---|---|---|---|
| P21 | `GET /rest/api/3/issue/{id}/worklog/{wid}` 응답에 `issueId` 가 있는가(문서 Worklog 스키마엔 있다) | `WorklogService.loadOwn` — `current.issueId !== payload.issueId` 면 `WORKLOG_NOT_FOUND` | **수정·삭제·편집 대화상자 전부** — 필드가 없으면 모든 수정·삭제가 NOT_FOUND | 배포 후 본인 워크로그 1건 `updateWorklog` 호출 → 성공 여부. 또는 관리자 REST 로 같은 GET 응답에서 `issueId` 확인 | `issueId` 가 없으면 `self` URL 의 `/issue/{id}/` 를 파싱해 대조 |
| P22 | `POST`·`PUT …/worklog` 응답 본문이 전체 Worklog(author·started·timeSpentSeconds·created·updated)인가 | `WorklogService.respond` — 재조회하지 않고 응답 본문을 뷰로 | 대화상자 저장 후 반환 `worklog` 칸이 비면 프론트 표시만 깨짐(쓰기는 성공) | `createWorklog` 반환값의 `worklog.authorAccountId`·`started` 가 채워졌는지 | 응답이 빈약하면 `getWorklog` 1회 재조회 |
| P23 | `timeSpentSeconds` 를 초 단위(예: 90)로 보내면 Jira 가 분으로 반올림하는가 — 반올림된 값으로 응답하는가 | `validateWorklogInput`(60..86400 정수, 60 배수 강제 안 함) | 표시 값 차이 | 90초로 생성 → 응답·재조회 `timeSpentSeconds` | 반올림되면 도메인에서 60 배수 강제 + `WORKLOG_INVALID_INPUT` |
| P24 | 워크로그 `created === updated` 로 생성/수정 구분이 맞는가(스윕 경로는 이벤트 종류를 모른다) | `TimesheetDriftService.planCloseDrift` | close drift `last_kind` 표시만 | 마감 기간에 REST 로 생성 → 스윕 경로 처리 후 `timesheet_close_drift.last_kind` | 틀려도 표시만 — 판정 무영향 |
| P25 | `approval_settings_audit` 에 `INSERT IGNORE` + 결정적 `UUID_TO_BIN(auditId)` — 같은 id 재시도 시 1행 | `SettingsAuditRepository.record({auditId})` | 감사 중복 | 같은 기간 마감 → 재개방 → 마감(rev 1→2→3)은 3행, 스윕 2회 실행의 autoClose 는 1행 | 중복 시 SELECT 선확인으로 바꾼다 |
| P26 | 자동 마감 `INSERT IGNORE` 경합 — 관리자 수동 재개방(insertReopened)과 스윕 자동 마감 기록이 같은 순간이면 먼저 들어간 쪽이 이긴다 | `PeriodCloseService.reopenPeriod`(rev null)·`recordAutoCloses` | 재개방이 `CONCURRENT_MODIFICATION` 으로 실패할 수 있다(재조회 후 rev 로 재시도하면 성공) | 의도된 동작 — 문서화만 | — |
| P27 | 판정 SELECT 2회(마감 행·본인 요청) + KVS 정책 읽기(7왕복) 지연 — 대화상자 저장 체감 | `WorklogService.createWorklog` 등 | UX | 배포 후 저장 소요 시간 관찰(브라우저 네트워크 탭) | 정책 읽기 캐시(invocation memo) 검토 |

## frontend 추가 (Phase 4, 2026-10-03)

| # | 항목 | 코드 위치 | 영향 | 확인 방법 | 실패 시 동작 / 대안 |
|---|---|---|---|---|---|
| P28 | issueActivity·issueAction 의 `view.getContext()` 에 `extension.type`(`jira:issueActivity`/`jira:issueAction`)과 `extension.issue.id`·`key` 가 오는가 | `features/worklog/worklogContext.js` | 탭·대화상자 분기 전부 — type 이 다르면 issueAction 이 탭으로 그려진다 | 배포 후 탭·••• 메뉴에서 각각 열어 화면 확인(사람) | 분기 기준을 `extension.type` 대신 모듈 key(`extension.moduleKey`?) 또는 탭 iframe 높이로 바꾼다 |
| P29 | 탭에서 `new Modal({resource:'main/worklog', context})` 로 연 대화상자의 context 위치(`extension.modal` vs `extension.modal.context`), 그때 `extension.type` 값, `view.close()` 후 탭의 `onClose` 호출 | `WorklogTab.openDialog`, `worklogContext.modalContextOf` | 수정 대화상자·저장 후 목록 갱신 | 탭 > 수정 > 저장 → 목록 갱신 여부 | 판독 후보를 늘린다. onClose 가 안 오면 탭은 포커스 재조회로만 갱신 |
| P30 | issueAction(`viewportSize: medium`) iframe 안에서 Atlaskit DatePicker·TimePicker 드롭다운이 잘리지 않는가, ModalLayout sticky 버튼 줄이 보이는가 | `WorklogDialog.jsx` | 시작 일시 입력 | 사람이 열어 달력·시각 목록 펼침 | 잘리면 `viewportSize: large` 또는 텍스트 입력(YYYY-MM-DD HH:mm)으로 |
| P31 | 시작 일시 입력 기준 시간대 — 우리는 **브라우저 시간대**로 받는다. Jira 프로필 시간대가 다른 사용자에게 Jira 기본 화면과 표시가 어긋나는가 | `worklogTime.fromLocalParts`·`formatStarted` | 표시·입력 시각(저장 값은 같은 순간이라 판정과 무관) | 프로필 시간대를 브라우저와 다르게 두고 같은 워크로그를 Jira REST 와 우리 탭에서 비교 | 컨텍스트 `timezone`(Forge FullContext) 으로 입력·표시 — 열린 질문 Q29 |
| P32 | 저장 후 Jira 이슈 화면의 시간 추적 필드(기록 시간·남은 추정치)가 갱신되는가 | issueAction 저장 → `view.close` | 화면 신선도만 | 저장 직후 이슈 화면 확인 | 갱신 안 되면 `@forge/bridge` `view.refresh()`(지원 여부 확인) 또는 안내 |
| P33 | 탭 iframe 안 Atlaskit 삭제 확인 모달·기간 마감 재개방 확인 모달(설정 adminPage)의 표시 — P9 의 프론트 확인 지점 | `DeleteConfirm.jsx`, `PeriodCloseSettings.jsx` | 삭제·재개방 UX | 사람이 클릭 | 탭이 잘리면 Forge Modal(`mode:'delete'`)로 옮긴다 |
| V1 | `ResponseWrapper` 예상 에러 목록을 `'PermissionDeniedError'` 로 고친 뒤(03_verify F1) 권한 거부가 서버 로그에서 예상 밖 오류로 찍히지 않는가 | `src/utils/ResponseWrapper.js` | 로그 잡음만(동작 무관) | 권한 없는 사용자로 resolver 호출 후 `forge logs -e development --since 15m` | 여전히 찍히면 에러 이름 출처(`error.name`) 재확인 |
