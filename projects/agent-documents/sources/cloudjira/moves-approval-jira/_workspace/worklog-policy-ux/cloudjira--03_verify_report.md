# 검증 리포트 (회차 1) — worklog-policy-ux

작성: 2026-10-12 integration-verifier. 기준: `01_architect_design.md`. 범위: G·H·I. 코드 수정 없음.
변경 전 비교는 `git show HEAD:` / `git archive HEAD` 사본으로 했다(작업 트리 공유 — stash 미사용).

## 요약  통과 14 / 실패 0 / 미검증 4

## 실패
없음. (I 의 UI jest 불안정 1건은 feature-selection 파일 — `_workspace/feature-selection/03_verify_report.md` "실패" 참조)

## 미검증
| 항목 | 이유 | 확인 방법 |
|---|---|---|
| 프로젝트 정책 모달 행 레이아웃(flex-wrap 3칸)·좁은 폭 | 실측 필요 | 프로젝트 설정 > 정책 모달 |
| `<details>` 펼침 시 iframe 높이·모달 하단 버튼 | 실측 필요 | "자세히"·"상태 정보(지원용)" 펼치기 |
| 분 입력 → 저장 → 재조회 값 일치(×60 왕복) 실기기 | 배포 필요(코드·단위 테스트로는 확인) | 프로젝트에서 하루 최대 30분 저장 후 다시 열기 |
| 사이트 폼 새 4키 저장 → Log work 대화상자 요약 반영 | 배포 필요 | 저장 후 작업 로그 대화상자 |

## 통과

### G. 워크로그 정책 화면
- **사이트 계층 패널 제거**: `TimesheetPolicySettings.jsx` 에 `WorklogPolicyPanel scope="site"` 없음(HEAD `:377` 에 있던 것 제거), `WorklogPolicyPanel` 은 project/issue 전용으로 재작성. 사이트 편집기는 폼 하나. **통과**
- **4키 저장 경로**: `TIMESHEET_POLICY_KEYS`(`:21-44`)·`DEFAULTS`(`:65-68`)·`NUMBER_RANGES`(`:76-78`, 0~3650)·`toTimesheetPatch`(`:124-127`, approvalMode 는 `CERTIFICATION|PREAPPROVAL` 외 기본값) → `saveApprovalSettings`. 서버 `normalizeSettingsPatch`(`SettingsService.js:149-152`) — `boundedInteger(0,3650)` ×3, `enumValue(['CERTIFICATION','PREAPPROVAL'])` 와 범위·값 일치. `SETTINGS_KEYS`(`SettingsRepository.js:58-61`)·기본값(`:143`)에 같은 이름으로 저장·조회 → `valuesOf` 왕복 성립. HEAD 의 site 패널도 `saveApprovalSettings` 로 저장했으므로 서버 경로 동일. 저장 후 `worklogPolicyKeys.all`·`worklogKeys.all` 등 무효화(`:432-437`). **통과**
- **사이트 패널이 편집하던 나머지 키의 갈 곳**: `historyRetentionMonths` → 데이터 관리, `worklogDateWindow` → 워크로그 통제(`WorklogControlSettings.jsx:316`), 나머지 8키는 legacy 매핑으로 폼에 이미 있음 — 편집 경로 소실 없음. **통과**
- **초↔분 변환**: 패널 `ValueInput`(`WorklogPolicyPanel.jsx:47-63`) — 표시 `value / scale`, 입력 `Number(v) * scale`, max `floor(max/scale)`, 단위 표기 분/일. draft·저장 payload(`override`)는 초 그대로 → 서버 의미 불변. 사이트 폼은 legacy 분 키(`timesheetDailyMaxMinutes`·`timesheetWeeklyMaxMinutes`, 서버 0~1440/0~10080)로 저장. `policyValueText`(`WorklogPolicySummary.jsx:13-21`) 표시도 분. 단위 테스트 "입력 30 → 저장 1800" 통과. **통과**
- **authority 경고는 details 밖**: `WorklogPolicyPanel.jsx:156-160` `STALE|EXPIRED|INVALID` → 본문 `SectionMessage warning`(testId `worklog-policy-authority-warning`), details(`worklog-policy-more`·`worklog-policy-support`) 앞. `WorklogPolicySummary.jsx:73` 도 경고를 details 밖에 두고 경고 시 appearance warning. 백엔드 authority 상태 집합(FRESH·STALE·EXPIRED·INVALID·ABSENT)과 일치. **통과**
- **`WorklogPolicySummary` 제한 항목만**: `isRestrictive`(`:47-53`) 로 거른 항목만 + 출처 칩, 없으면 `worklogPolicy.noLimits` 한 줄, `writeNotice` 는 details. 소비처 `WorklogDialog`·`DeleteConfirm`. **통과**
- **진단 접기**: `<details data-testid="ts-worklog-policy-diagnostics">`(`:410-420`) 기본 접힘, 펼칠 때만 렌더·조회(유휴 호출 절감). **통과**
- **`getWorklogPolicyCatalog` 미사용**(보고만): 프론트 소비처 0, resolver·`PermissionMap.js:37`·쿼리키 `worklogPolicyKeys.catalog` 잔존 — 지시대로 OK.

### H. i18n
- `npm run merge` 통과.
- kr/en 키 차이: 33개 파일 전부 **0**.
- 새 키 135개(HEAD 대비, 오늘 선행 작업분 포함) **전부 사용**(리터럴 또는 `` `prefix.${…}` `` 동적 키 대조).
- 없앤 키(HEAD 대비 9): `worklogPolicy.scope.site`·`override`·`effective`(이번), `audit.title`·`policy.title`·`policy.settings.tab.worklogHistory`·`policy.flows.title`·`project.title`·`workforce.title`(선행 작업분) — 현재 소스 참조 0. feature-selection 의 `policy.issueApproval.tab.*` 도 삭제 확인.
- 고아 키: 이번 두 작업분이 새로 만든 고아 **0**. 참고로 HEAD 에서 쓰이다 지금 안 쓰이는 키 1개 `policy.audit.title` — `AuditSettings.jsx` 의 페이지 Heading 제거(선행 settings-design 작업분, `git diff` 의 `-{!embedded && <Heading …>{t('policy.audit.title')}…}`)로 고아가 됐다. 이번 범위 밖 잔여이므로 실패로 세지 않는다(정리 시 kr/en `policy.json` `audit.title` 삭제).
- **라벨 15 교정 반영표** (kr | en, 현재 값):

| # | 키 | kr | en | 반영 |
|---|---|---|---|---|
| 1 | `policy:transitionApprovalEnabled` | 상태 변경 전 승인 확인 | Approval check before status change | O |
| 2 | `policy:statusFlow.title` | 승인 처리 순서 | Approval processing order | O |
| 3 | `policy:approverAccessCheck` | 결재자가 이슈를 볼 수 있는지 확인 | Check that approvers can see the issue | O |
| 4 | `policy:restrictAccess` | 앱을 사용할 사람 제한 | Limit who can use the app | O |
| 5 | `timesheet:settings.unit.WEEK` | 주(월요일~일요일) | Week (Monday to Sunday) | O(worklog-policy-ux 문구 채택) |
| 6 | `timesheet:settings.limits` | 기록 시간·날짜 기준 | Hour and date rules | O |
| 7 | `timesheet:settings.backdate` | 지난 날짜 기록 가능 일수(0 = 제한 없음) | Days allowed to log past dates (0 = no limit) | O(worklog-policy-ux 문구) |
| 8 | `timesheet:settings.exceptionGroup` | 기준을 넘긴 기록의 추가 결재자 그룹 | Extra approver group for entries over the rules | O |
| 9 | `timesheet:settings.lockSubmitted` (+`lockSubmittedHelp`) | 결재 중인 기간에 기록 추가 금지 / 승인된 기간은 이 설정과 상관없이 항상 잠깁니다. | Block new entries in periods under approval / Approved periods are always locked regardless of this setting. | O(도움말 화면 표시 `ts-lock-submitted-help`) |
| 10 | `timesheet:periodClose.edit` | 승인·인증을 해제하고 수정 허용 | Release approvals and certifications and allow edits | O |
| 11 | `worklogControl:phase.B` | B · 승인·인증된 기록을 앱에서만 관리 | B · Manage approved and certified entries only in this app | O |
| 12 | `worklogControl:phase.C` | C · 워크포스 연동 이슈의 모든 기록을 앱에서만 관리 | C · Manage all entries on Workforce-linked issues only in this app | O |
| 13 | `worklogControl:startField.title` | 이슈 시작일~마감일 안에서만 작업 시간 기록 | Log hours only between the issue start and due dates | O |
| 14 | `workforce:signing.fingerprint` | 연동 확인용 키 식별값 | Link verification key ID | O |
| 15 | `workforce:publish.title` | 워크포스에 승인 결과 보내기 | Send approval results to Workforce | O |

  5·7·9 는 feature-selection 설계 §8.3 과 문구가 다르다 — 두 설계가 같은 키를 다르게 정해 프론트가 worklog-policy-ux(프로젝트·이슈 패널 키와 같은 말)를 택했다(프론트 보고서 §3-2). 뜻은 같다.

### I. 테스트·빌드 (직접 실행)
- UI `CI=true npx jest --runInBand`: 78/78 · 677/677. 병렬 재실행 78/78 · 677/677. (백엔드 동시 실행 1회차에서 feature-selection 의 `IssueApprovalSettings.test.jsx` 만 부하로 실패 — 이 작업 파일 아님)
- `WorklogPolicy.test.jsx`·`TimesheetPolicySettings.test.jsx` 포함 전부 통과.
- UI `CI=false npm run build`: 성공, 우리 코드 경고 0(node_modules 경고만).
- 백엔드 변경 없음 확인(이 작업은 `src/` 미수정). 리포 루트 `npx jest` 157/2460 통과, `check:bundle` OK.
- testId 삭제 0건(HEAD 비테스트 소스 392개 전부 현존). `ts-worklog-policy-section` 은 HEAD 에 없던(선행 미커밋에서 생겼다 사라진) testId — 부재를 테스트가 단언.

## 실행 결과
| 명령 | 결과 |
|---|---|
| `npm run merge` | 통과 |
| `CI=true npx jest --runInBand` (static/ui) | 78 suites / 677 tests 통과 |
| `CI=false npm run build` (static/ui) | 성공(우리 코드 경고 0) |
| i18n 대조 스크립트(kr/en 차이·추가/삭제·고아, HEAD 사본 대비) | 차이 0, 신규 고아 0, 범위 밖 잔여 고아 1(`policy.audit.title`) |
