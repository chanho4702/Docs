## 결론

**“사용할 기능”을 먼저 고르게 하는 방향은 찬성하지만, 현재 제안을 그대로 구현하는 것은 반대합니다.** 특히 다음 세 가지를 바꿔야 합니다.

1. **`transitionApprovalEnabled`는 비상 해제용으로 유지하고 기능 사용 스위치를 분리합니다.** 이 키는 상태 변경 승인에만 적용되며, 끄면 validator는 통과하고 자동 전환은 차단됩니다. 필드 변경·이슈 일반 승인을 함께 끄는 스위치가 아닙니다. 근거: `src/domain/transition/judge.js:54`, `src/resolver/transition/TransitionExecutor.js:42`, `src/resolver/approval/ApprovalService.js:359`.
2. **“타임시트 승인 끔”을 “작업 시간 관리 전체 끔”으로 해석하면 안 됩니다.** 워크로그 사전 승인·인증·기간 마감·통제가 각각 별도 경로입니다. 근거: `src/resolver/worklogApproval/WorklogApprovalController.js:6`, `src/resolver/worklogCert/WorklogCertController.js:8`, `src/resolver/timesheet/TimesheetController.js:51`, `src/resolver/worklogControl/WorklogControlController.js:10`.
3. **관리자 메뉴 묶음을 통째로 숨기지 않습니다.** 공용 결재 설정과 기존 기록의 복구 경로가 함께 사라집니다. 사용하지 않는 세부 설정은 접되, 기능 선택·기록 조회·통제 해제 진입점은 남겨야 합니다. 근거: `static/ui/src/features/settings/IssueApprovalSettings.jsx:13`, `src/resolver/timesheet/TimesheetRouting.js:56`, `src/resolver/worklogControl/WorklogControlController.js:27`.

사용자 설명은 다음 정도가 정확합니다.

> 단독으로도 이슈 승인과 기간별 작업 시간 승인을 선택해 사용할 수 있습니다. 이슈 승인은 프로젝트별로 설정하지만, 타임시트는 사람별 주·월 단위로 여러 프로젝트의 시간을 함께 승인합니다. 워크포스를 연동하면 검증된 팀장 정보가 우선 적용되고, 그 정보가 없으면 앱의 팀 명부를 사용합니다.

미커밋 작업 트리를 UTF-8로 읽어 검토했습니다. 파일 수정·생성, 테스트·빌드 실행은 하지 않았습니다. 아래 UX 판단과 파일 수 산정은 **권고·추측**이며, 현재 코드 동작과 구분했습니다.

## 모델 검증

**세 축은 설명의 출발점으로는 맞지만, 기능 모델로는 부족합니다.**

| 리더의 진단 | 코드 대조 결과 |
|---|---|
| 기능 사용을 명시적으로 선택하기 어렵다 | 맞습니다. 다만 전환 비상 스위치 외에도 워크로그의 `approvalMode`, 인증 단위, 통제 범위 등 개별 선택은 이미 있습니다. 사이트 전체의 기능 선택으로 연결되지 않았습니다. `src/resolver/settings/SettingsRepository.js:123`, `src/domain/worklogPolicy/catalog.js:14` |
| 팀이 있으면 타임시트가 돈다 | 정확히는 **팀·결재자가 제출 가능 조건**입니다. 팀 등록만으로 자동 제출하지 않습니다. 제출 시 명부 또는 워크포스 결재선을 해석합니다. `src/resolver/timesheet/TimesheetRouting.js:48`, `src/resolver/timesheet/TimesheetService.js:442` |
| 규칙이 있으면 이슈 승인이 돈다 | 상태 변경·필드 변경에는 맞지만, **이슈 일반 승인에는 규칙이 필요하지 않습니다.** 프로젝트 사용 여부를 확인한 뒤 요청자가 결재선을 구성합니다. `src/resolver/transition/TransitionService.js:233`, `src/resolver/fieldChange/FieldChangeService.js:349`, `src/resolver/approval/ApprovalService.js:600` |
| 타임시트는 사람×월 단위 | 사람×기간이 맞습니다. **주 단위도 지원**합니다. 프로젝트 필터 없이 본인의 해당 기간 워크로그를 수집합니다. `src/resolver/settings/SettingsRepository.js:99`, `src/resolver/timesheet/WorklogCollector.js:166` |
| 워크포스 팀장이 1단계, 없으면 명부 팀장 | 맞습니다. 다만 본인을 제외한 검증된 결재자가 있어야 하며, 명부의 선택적 2단계 그룹과 위반 시 예외 그룹·PM 단계도 존재합니다. `src/resolver/workforce/WorkforceOrgSource.js:37`, `src/resolver/timesheet/TimesheetRouting.js:74`, `src/resolver/timesheet/TimesheetRouting.js:93` |

둘로 묶기 전에 다음 차이를 드러내야 합니다.

| 기능 | 실제 의미와 분류 |
|---|---|
| 이슈 일반 승인 | 이슈에 대한 기록형 결재. 상태 변경 승인과 동시에 존재할 수 있는 별도 대상입니다. “이슈 승인”에 포함하는 것은 타당합니다. `docs/DESIGN.md:52` |
| 상태 변경 승인 | 워크플로 validator를 붙여야 직접 상태 변경을 강제합니다. 앱 설정만으로 강제가 완성되지 않습니다. `manifest.yml:93` |
| 필드 변경 승인 | 승인 후 요청한 값을 적용하는 별도 경로입니다. `transitionApprovalEnabled`의 영향을 받지 않습니다. `src/resolver/fieldChange/FieldChangeService.js:349` |
| 워크로그 사전 승인 | **입력 전에** 결재하고 승인된 입력안을 등록합니다. 기간별 타임시트 제출과 다릅니다. `src/resolver/worklogApproval/WorklogApprovalService.js:85`, `src/resolver/worklogApproval/WorklogApprovalService.js:131` |
| 워크로그 인증 | 이미 작성된 기록을 건별 원본으로 인증합니다. 팀장 인증과 제한적인 본인 인증이 있습니다. 옛 요청형 인증은 읽기만 남았습니다. `src/resolver/worklogCert/WorklogCertService.js:503`, `src/resolver/worklogCert/WorklogCertService.js:523`, `src/resolver/worklogCertification/WorklogCertificationController.js:4` |
| 기간 마감·워크로그 통제 | 입력·수정·삭제 및 Jira 공개 범위를 관리합니다. 승인·인증 결과를 사용하지만, 자체 정책과 복구 절차를 갖습니다. `src/resolver/timesheet/PeriodLockService.js:40`, `src/domain/worklogControl/rules.js:197` |

또한 **결재선·승인 그룹은 공용 자원**입니다. 현재 “이슈 승인” 아래에 있지만, 워크로그 사전 승인과 타임시트 추가 단계에서도 사용합니다. 이슈 기능을 껐다고 함께 숨기면 안 됩니다. 근거: `src/resolver/worklogApproval/WorklogApprovalPolicy.js:29`, `src/resolver/timesheet/TimesheetRouting.js:56`, `src/resolver/timesheet/TimesheetRouting.js:97`.

**`isProjectEnabled` 소비처 전수 결과**

기본 규칙은 **한 번도 프로젝트를 선택하지 않았으면 전체 허용, 선택한 뒤에는 명시적으로 켠 프로젝트만 허용**입니다. 근거: `src/resolver/transition/projectEnablement.js:7`.

| 직접 소비처 | 영향 |
|---|---|
| `src/resolver/transition/TransitionService.js:169` | 상태 변경 승인 표시·요청·규칙 설정 응답 |
| `src/resolver/transition/TransitionValidatorService.js:131` | 프로젝트가 꺼져 있으면 validator 통과 |
| `src/resolver/transition/TransitionExecutor.js:42` | 승인 후 자동 전환 실행 차단 |
| `src/resolver/fieldChange/FieldChangeService.js:353` | 필드 변경 승인 요청 가능 여부 |
| `src/resolver/approval/target/FieldChangeTargetAdapter.js:162` | 공통 상세 화면의 필드 변경 요청 가능 여부 |
| `src/resolver/fieldChange/FieldChangeEventService.js:124` | 필드 직접 변경 감지·우회 기록 경로 |
| `src/resolver/approval/ApprovalService.js:363` | 이슈 일반 승인 신규 요청 |
| `src/resolver/worklogApproval/WorklogApprovalPolicy.js:33` | **워크로그 사전 승인 정책 유효성**. 재적용 시에도 이 판정이 사용됩니다. `src/domain/worklogApproval/draft.js:30` |

동일한 프로젝트 설정을 별도로 읽는 경로도 있습니다.

- **워크로그 이력 수집:** 같은 프로젝트 선택 규칙을 재현합니다. 다만 `PROJECT_OR_LINKED`에서는 워크포스 연결분이 프로젝트 범위 밖이어도 포함될 수 있습니다. `src/resolver/worklogHistory/WorklogHistoryRecorder.js:188`, `src/resolver/worklogHistory/WorklogHistoryRecorder.js:246`, `src/domain/timesheet/worklogHistory.js:588`.
- **통제 준비 상태 점검 목록:** 선택된 프로젝트로 점검 목록을 좁힙니다. 통제 실행 전체의 적용 범위를 뜻하지 않습니다. `src/resolver/worklogControl/WorklogControlReadiness.js:140`.

따라서 **“적용 프로젝트는 이슈 승인과 이력에만 적용”이라는 진단은 틀립니다. 워크로그 사전 승인에도 적용됩니다.** 반대로 타임시트 집계·인증·통제 전체를 좁히는 공통 프로젝트 스위치는 아닙니다. 인증 관찰은 이력 수집 범위와도 분리되어 있습니다. 근거: `src/resolver/timesheet/WorklogCollector.js:175`, `src/resolver/worklogHistory/WorklogHistoryRecorder.js:254`, `src/resolver/worklogControl/ControlLinkJudge.js:28`.

마지막으로 `docs/DESIGN.md:115`의 “검증 게시물로 모드 판정” 설명은 오늘 변경과 맞지 않습니다. 현재 운영 모드는 명시적 `workforceLinkEnabled === true`이고, 검증 게시물 유무는 기능별 실제 적용 조건입니다. `static/ui/src/features/settings/operatingModeModel.js:8`, `src/resolver/workforce/WorkforceOrgSource.js:23`.

## 겸용 위험

**분리해야 합니다.** 위험은 이름만의 문제가 아닙니다.

| 위험 | 현재 코드에서 발생하는 결과 |
|---|---|
| 기능 범위 불일치 | “이슈 승인 끔”이라고 표시해도 일반 승인·필드 변경은 계속됩니다. 전환 계열만 이 키를 읽습니다. `src/resolver/transition/projectEnablement.js:14`, `src/resolver/approval/ApprovalService.js:359` |
| 강제 우회와 기능 종료 혼동 | 꺼진 동안 pending·반려 여부를 판정하지 않고 validator가 통과합니다. `src/domain/transition/judge.js:54` |
| 수동·자동 동작 불일치 | Jira에서 직접 전환은 통과하지만 앱의 자동 전환은 `BLOCKED`가 될 수 있습니다. `src/resolver/transition/TransitionExecutor.js:42` |
| 감사 의미 소실 | 현재 저장 이력은 `policy/update`와 전달된 patch입니다. 같은 `false`로 “장애 우회”와 “기능 미사용”을 구별할 수 없습니다. **감사가 없는 것은 아닙니다.** `src/resolver/settings/SettingsService.js:265` |
| 다시 켤 때의 놀람 | 저장된 규칙을 유지하므로 강제가 다시 살아납니다. 기능 재개와 비상 해제 종료가 같은 조작이 됩니다. `src/resolver/transition/TransitionValidatorService.js:112` |

**권고하는 키와 동작**

| 키 | 권고 |
|---|---|
| `issueApprovalEnabled` | 일반·상태·필드 승인 신규 요청 사용 여부. “이슈 상태 변경 승인”만 선택하려면 대신 더 좁은 키를 사용해야 합니다. |
| `timesheetApprovalEnabled` | 신규 타임시트 제출·재제출 사용 여부. 인증·통제·기간 마감까지 끄지 않습니다. |
| `transitionApprovalEnabled` | 기존 키 유지. 관리자용 **승인 확인 비상 해제**로 분리합니다. |
| `workforceLinkEnabled` | 기존 연동 스위치 유지. 결재자 원천만 바꾸는 키로 재해석하지 않습니다. |

상태 변경 기능을 계획적으로 끄는 경우에는 validator가 남아 있어도 통과하도록 할 수 있습니다. 다만 저장 전에 **승인 없이 상태 변경할 수 있다는 영향과 기존 요청 처리 방침**을 명시하고, 비상 해제와 다른 판정 코드·감사 action을 남겨야 합니다. 기존 자동 적용은 중지하되, 이미 POST한 작업의 결과 대조는 계속해야 합니다. 현재도 실행과 결과 대조가 분리되어 있습니다. `src/resolver/transition/TransitionExecutor.js:40`, `src/resolver/transition/TransitionExecutor.js:68`.

기존 설치는 새 키의 미저장 상태 때문에 갑자기 기능이 꺼지지 않도록 호환 기본값을 유지하고, 신규 설치의 초기 선택은 별도로 초기화하는 편을 권고합니다.

## 타임시트 끔 전수표

**권고 정의: OFF는 신규 타임시트 제출·재제출을 받지 않는 상태입니다. 기존 요청은 승인·반려·회수로 마무리할 수 있고, 기존 승인·인증·잠금·감사 기록은 유지합니다.**

이 정의라면 “작업 시간 기록·인증·마감·보호도 모두 중지”는 별도 종료 절차입니다.

| 경로 | 권고 | 근거·주의점 |
|---|---|---|
| `submitTimesheet` 신규 제출·재제출 | **막는다 + 버튼 숨긴다** | 수집·SQL 삽입 전에 서버 확인. 재제출도 같은 함수입니다. `src/resolver/timesheet/TimesheetService.js:442`, `:510` |
| 공통 `createForTarget`의 TIMESHEET 생성 | **막는다** | 전용 서비스의 조기 검사와 공통 생성 경계의 검사를 함께 둡니다. `src/resolver/approval/ApprovalService.js:635` |
| `decideTimesheets` | **기존 요청은 그대로 둔다** | 기존 결재 마무리용. 새 제출이 막히면 신규 요청은 생기지 않습니다. `src/resolver/timesheet/TimesheetService.js:655` |
| `decideApproval`, `bulkApprove`, 위임 결재 | **기존 요청은 그대로 둔다** | 타임시트 전용 결재만 확인하면 공통 경로가 남습니다. 강한 정지를 선택한다면 이곳에서 `targetKind`로 차단해야 합니다. `src/resolver/approval/ApprovalService.js:798`, `:852`, `:894` |
| `cancelApproval` | **그대로 둔다** | pending 회수·정리가 가능해야 합니다. `src/resolver/approval/ApprovalService.js:981` |
| `getTimesheetContext`, 내 타임시트·팀 매트릭스·상세 | **읽기는 그대로 둔다** | 기능 상태와 신규 제출 불가를 응답에 표시합니다. 기록이 없으면 일반 사용자 신규 업무 메뉴는 숨겨도 됩니다. `src/resolver/timesheet/TimesheetController.js:7`, `:19`, `:27` |
| 팀 등록·수정·삭제·Jira 그룹 가져오기 | **그대로 둔다** | 인증의 권한 범위도 같은 팀 명부를 사용합니다. `src/resolver/timesheet/TimesheetController.js:31`, `src/resolver/worklogCert/WorklogCertService.js:512` |
| `closePeriod` 수동 마감 | **별도 기능으로 그대로 둔다** | 타임시트 제출 여부와 별개로 워크로그 입력을 막는 사이트 기간 정책입니다. `src/resolver/timesheet/PeriodCloseService.js:176` |
| `recordAutoCloses` 자동 마감 | **별도 마감 설정에 따른다** | 타임시트 OFF와 연동해 중지하려면 마감 기능도 명시적으로 OFF여야 합니다. `src/resolver/timesheet/PeriodCloseService.js:274` |
| 자동 마감의 읽기·쓰기 판정 | **스윕과 같은 설정을 적용한다** | **스윕만 막아도 자동 마감은 계속 효력이 있습니다.** 시각으로 계산합니다. `src/resolver/timesheet/PeriodCloseService.js:269`, `src/resolver/timesheet/PeriodLockService.js:16` |
| `reopenPeriod`, `previewPeriodReopen`, `continuePeriodReopen` | **그대로 둔다** | 기존 마감·승인·인증·숨김의 복구 경로입니다. `src/resolver/timesheet/TimesheetController.js:59`, `src/resolver/timesheet/PeriodReopenService.js:37` |
| 기존 제출·승인 기간 잠금 | **그대로 둔다** | 기능 OFF가 과거 승인 해제를 뜻해서는 안 됩니다. 승인 기간 잠금은 `timesheetLockSubmitted`와도 독립입니다. `src/resolver/timesheet/PeriodLockService.js:40` |
| 워크로그 이벤트 drift·일일 누락 보정·고아 정리 | **그대로 둔다** | 기존 제출·승인·마감의 변경 감지가 필요합니다. 해당 기록이 전혀 없을 때만 조기 종료를 최적화합니다. `src/resolver/timesheet/TimesheetDriftService.js:344`, `:501` |
| 만료·독촉·알림·업무함·증명서·내보내기 | **기존 건은 그대로 둔다** | 공통 승인 엔진과 기록 경로입니다. 타임시트 신규 제출 OFF로 공통 업무함 전체를 숨기면 안 됩니다. `src/trigger/sweepJobs.js:85`, `src/resolver/approval/ApprovalController.js:34` |
| 워크포스 타임시트 문서 게시·대조 | **기존 결과 갱신은 그대로 둔다** | 결정·변경·재개방 결과가 상대 앱에 반영되어야 합니다. 게시 전체 중지는 마지막 상태를 남깁니다. `src/resolver/workforce/WorkforcePublisher.js:332`, `:705` |
| 인증 문서 게시·`workforce-cert` | **그대로 둔다** | 타임시트 문서와 별도 종류입니다. 인증 기능을 따로 끄더라도 기존 변경·해제 결과 전달은 필요합니다. `src/resolver/workforce/WorkforcePublisher.js:318`, `:590`, `src/resolver/workforce/WorkforceCertWake.js:36` |
| 통제 설정 문서 게시 | **그대로 둔다** | 동일 Publisher에서 처리하는 별도 문서입니다. 타임시트 OFF를 Publisher 전체 gate에 넣지 않습니다. `src/resolver/workforce/WorkforcePublisher.js:502`, `:555` |
| 시간 추적 제공자 화면·`create/update/deleteWorklog`·넘김 화면 | **그대로 둔다** | 제공자로 선택되어 있으면 Jira 기본 화면을 대체합니다. 숨기면 작성·조회·복구 창구가 사라집니다. 기존 잠금·정책 검사는 유지합니다. `manifest.yml:37`, `:45`, `:83`, `src/resolver/worklog/WorklogController.js:5` |
| 워크로그 사전 승인 생성·적용·결과 대조 | **별도 설정에 따른다** | 타임시트 OFF로 함께 막으면 사전 승인 필수 정책과 충돌합니다. 직접 작성만 열어 주는 것도 우회입니다. `src/resolver/worklog/WorklogService.js:499`, `src/resolver/worklogApproval/WorklogApprovalService.js:85`, `:131`, `:195` |
| 팀장·본인 인증, 재인증 | **별도 설정에 따른다** | 현재 타임시트 제출과 독립된 쓰기 경로입니다. `src/resolver/worklogCert/WorklogCertController.js:17`, `:25` |
| 워크로그 이력·인증 변경 관찰 | **그대로 둔다** | 인증 관찰은 이력 수집 범위가 꺼져도 필요합니다. `src/resolver/worklogHistory/WorklogHistoryRecorder.js:254`, `src/trigger/onWorklogChanged.js:30` |
| 통제 감지·제한·다른 경로 입력 처리 | **별도 통제 설정에 따른다** | 타임시트 OFF로 일괄 중지하지 않습니다. 승인·인증·연동을 각각 근거로 사용합니다. `src/domain/worklogControl/rules.js:205`, `src/resolver/worklogControl/WorklogControlWorker.js:497` |
| 통제 현황·해제·재시도·관리자 확인·제거 전 해제 | **그대로 둔다. 숨기지 않는다** | 기존 숨김을 원상복구해야 합니다. 해제는 정책 OFF여도 작업을 끝내는 구조입니다. `src/resolver/worklogControl/WorklogControlController.js:11`, `:27`, `:31`, `:43`, `src/resolver/worklogControl/WorklogControlWorker.js:547`, `manifest.yml:134` |

공통 결재에 강한 차단을 넣는다면 **`beforeDecide`에 예외를 던지는 방식은 피해야 합니다.** TIMESHEET의 해당 훅 예외는 현재 `null`로 삼켜질 수 있습니다. 엄격한 기능 gate는 그 catch 밖에 있어야 합니다. `src/resolver/approval/ApprovalService.js:877`.

코드에서 확인한 자동 마감 작업은 **마감 기록 → drift 보정**입니다. 자동 타임시트 제출 경로는 확인되지 않았습니다. `src/trigger/sweepJobs.js:97`.

**유휴 SQL 영향**

- 현재 테스트 상한은 TIMESHEET 작업 **5회**, 하루 합계 미연동 **27회 이하**, 연동 **38회 이하**입니다. `src/trigger/__test__/idleSqlBudget.test.js:115`, `:258`, `:268`.
- 신규 제출만 막는 최소안은 이 예산을 거의 줄이지 않습니다. 기존 정합 작업을 유지하기 때문입니다.
- 완전한 빈 설치에서 작업을 SQL 전에 생략하면 절감할 수 있습니다. 다만 **기존 기록이 있는 OFF 설치**와 구별해야 하며, 매일 SQL COUNT를 추가해 판별하면 절감 효과를 상쇄합니다.
- 새 스케줄은 필요 없습니다. 기존 fan-out과 이벤트성 작업을 유지하고, OFF·잔여 없음 조건의 예산 테스트를 추가하는 편이 맞습니다. `src/trigger/sweepJobs.js:40`, `src/resolver/worklogControl/WorklogControlWorker.js:506`.

## UX 대안

**권고: 첫 진입을 “사용할 기능” 요약 화면으로 바꾸고, 각 묶음에도 현재 상태와 설정 링크를 표시합니다. 강제 위저드는 후순위입니다.** 사용성 우열은 실사용 검증 전 **추측**입니다.

| 방식 | 평가 |
|---|---|
| 기능 선택 페이지 | 기능·적용 범위·연동 관계를 한곳에서 설명하고 다시 변경하기 쉽습니다. 현재 첫 화면은 전역 정책이므로 진입점 변경 효과가 큽니다. `static/ui/src/features/settings/SettingsPage.jsx:64` |
| 첫 설치 위저드 | 처음 구성하는 고객에게는 도움이 되지만, 기존 설치·부분 설정·다른 관리자 재방문·제공자 설정 진입까지 다뤄야 합니다. 처음부터 필수 단계로 만들면 비용과 혼란이 늘 수 있습니다. `manifest.yml:17`, `:40` |
| 각 묶음 머리 토글 | 이후 운영에는 편하지만, 첫 방문자는 묶음 사이 관계를 직접 이해해야 합니다. 요약 화면의 보조 수단으로 적합합니다. `static/ui/src/features/settings/settingsNavigation.js:38` |

첫 화면에는 다음 선택을 권고합니다.

- **이슈 승인 사용:** “일반 승인, 상태 변경 승인, 필드 변경 요청에 사용합니다.”
- **기간별 작업 시간 승인 사용:** “사람별 주·월 기록을 제출하고 승인받습니다. 여러 프로젝트의 시간이 포함됩니다.”
- **워크포스 연동 사용:** 결재자·점검 기준·인증 결과를 함께 연동한다는 설명과 현재 연결 상태를 표시합니다.

세 번째는 **“워크포스 팀장이 결재합니다”라는 체크박스보다 연동 선택**이 정확합니다. 연동은 팀장뿐 아니라 PM·점검·게시·통제에도 영향을 주며, 실제 팀장 적용은 검증 정보 유무에 따라 달라집니다. `src/resolver/workforce/WorkforceOrgSource.js:81`, `src/resolver/workforce/WorkforcePublisher.js:366`, `src/resolver/worklogControl/ControlLinkJudge.js:33`.

관리자 메뉴는 이렇게 처리하는 편이 낫습니다.

- 기능 OFF: 묶음 이름과 “사용 안 함” 상태는 남기고 세부 설정을 접습니다.
- 진행 중 요청·기존 잠금·숨김이 있으면 “기존 기록 관리”를 계속 노출합니다.
- 결재선·그룹·명부 같은 공용 설정은 공통 영역으로 옮기거나 필요한 기능에서 계속 접근하게 합니다.
- 일반 사용자에게는 신규 제출·요청 버튼을 숨기되 기존 요청·기록은 열 수 있게 합니다.
- 직접 URL·북마크로 들어오면 기능 상태와 기록 조회 또는 다시 켜기 경로를 안내합니다.

이는 현재 운영 모드와도 더 일관됩니다. 단독 모드에서 워크포스 메뉴가 사라지는 것이 아니라 **토글을 남기고 상태를 접으며**, 통제의 연동 전용 항목은 비활성 설명·경고를 남깁니다. `static/ui/src/features/settings/WorkforceLinkSettings.jsx:435`, `static/ui/src/features/worklogControl/WorklogControlSettings.jsx:104`.

일반 사용자 표시를 위해 관리자 전용 `getApprovalSettings`를 호출하면 안 됩니다. 기존 SELF 맥락 응답 등에 필요한 기능 boolean만 추가하는 방식을 권고합니다. 모르는 상태에서 표시하는 것과 서버 쓰기를 허용하는 것은 별개입니다. `src/permission/PermissionMap.js:59`, `:138`, `src/resolver/timesheet/TimesheetService.js:202`.

## 라벨 15

비개발자의 설정 선택을 방해하는 정도를 기준으로 선정한 **권고 순위**입니다.

| # | 현재 라벨 → 대체 문구 | 근거 |
|---|---|---|
| 1 | 전환 승인 강제(끄면 모든 validator 가 통과) → **상태 변경 전 승인 확인** | `locales/kr/policy.json:239` |
| 2 | 전이가 고정된 승인 워크플로 → **승인 처리 순서** | `locales/kr/policy.json:16` |
| 3 | 요청 시 승인자의 대상 열람 권한 확인 → **결재자가 이슈를 볼 수 있는지 확인** | `locales/kr/policy.json:187` |
| 4 | 등록된 사용자만 앱 사용 (…) → **앱을 사용할 사람 제한** | `locales/kr/policy.json:186` |
| 5 | 주(ISO) → **주 단위 — 월요일부터 일요일까지** | `locales/kr/timesheet.json:126` |
| 6 | 제한선 → **기록 시간·날짜 기준** | `locales/kr/timesheet.json:131` |
| 7 | 소급 입력 허용 일수(0=끔) → **일한 뒤 기록할 수 있는 일수(0=제한 없음)** | `locales/kr/timesheet.json:135` |
| 8 | 예외 승인 그룹 → **기준을 넘긴 기록의 추가 결재자 그룹** | `locales/kr/timesheet.json:142` |
| 9 | 제출·승인된 기간의 작업 로그 입력 잠금 → **결재 중인 기간에 작업 시간 추가 금지** | `locales/kr/timesheet.json:174` |
| 10 | 수정까지 허용 → **승인·인증을 해제하고 수정 허용** | `locales/kr/timesheet.json:209` |
| 11 | B · 확정분 숨김 → **승인·인증된 기록을 앱에서만 관리** | `locales/kr/worklogControl.json:17` |
| 12 | C · 연동 이슈 전체 숨김 → **워크포스 연동 이슈의 모든 기록을 앱에서만 관리** | `locales/kr/worklogControl.json:18` |
| 13 | 이슈 기간 창 → **이슈 시작일~마감일 안에서만 작업 시간 기록** | `locales/kr/worklogControl.json:232` |
| 14 | 공개키 지문 → **연동 확인용 키 식별값** | `locales/kr/workforce.json:23` |
| 15 | 승인 상태 게시 → **워크포스에 승인 결과 보내기** | `locales/kr/workforce.json:43` |

1번은 일반 기능 선택 화면에서 제외하고, 비상 해제 섹션에서 **“승인 없이 상태 변경 허용”**으로 조작 목적을 설명해야 합니다.

9번은 단순 평문화에 더해 의미 교정이 필요합니다. 해당 옵션을 꺼도 승인된 기간은 잠깁니다. 도움말에는 “승인된 기간은 항상 잠깁니다”를 남겨야 합니다. `src/resolver/timesheet/PeriodLockService.js:40`, `src/domain/timesheet/lock.js:106`.

11·12번의 Jira 기본 화면·검색·집계 영향과 10번의 승인·인증 해제 영향은 확인 화면에서 유지해야 합니다. `locales/kr/worklogControl.json:10`, `locales/kr/timesheet.json:210`.

## 비용·순서

파일 수는 **추측**입니다. 테스트·번역·문서 포함 여부를 나눠 추정했습니다.

| 안 | 범위 | 영향 파일 수 추측 |
|---|---|---|
| 백엔드 최소안 | 신규 이슈·타임시트 요청 스위치 분리, 기존 건 처리 유지, 상태 변경 validator·자동 적용 대응, 비상 해제 분리. 인증·마감·통제는 별도 유지 | 백엔드 **9~13개**, UI·번역·테스트·문서 포함 **25~40개** |
| 전체안 | 최소안 + 사전 승인·인증·기간 마감의 명시적 선택, 기존 작업 정리 상태, 통제 종료·복구, 문서 종류별 게시 및 재개 정책, 모든 진입 화면 일관화 | 백엔드 **20~30개**, 전체 **50~80개**. 워크포스 수신 계약 변경 시 상대 리포 비용 별도 |

최소안에서도 `SettingsRepository`의 키·기본값·전역 전용 목록과 `SettingsService`의 정규화를 함께 바꿔야 합니다. 지금 구조에서는 기본값만 추가해도 키 맵 불일치로 정책 조회가 실패할 수 있습니다. **단순 boolean 추가에는 SQL 마이그레이션이 필요하지 않습니다.** `src/resolver/settings/SettingsRepository.js:13`, `:171`, `:211`, `:313`, `src/resolver/settings/SettingsService.js:106`.

권장 순서는 다음과 같습니다.

1. **OFF 계약부터 확정:** 신규 접수 중지인지, 기존 결재까지 중지인지, 작업 시간 관리 전체 종료인지 결정합니다.
2. **기능·공용 설정 재배치:** 이슈 일반 승인 포함 범위, 워크로그 사전 승인·인증·마감·통제의 독립성을 정의합니다.
3. **백엔드 gate와 감사:** 표시 변경 전에 서버 경계를 구현합니다. 비상 해제·기능 변경의 감사 의미를 분리합니다.
4. **사용할 기능 첫 화면과 맥락 응답:** 기존 설정·업무함·이슈·모달·시간 추적 화면이 같은 상태를 읽게 합니다.
5. **메뉴 접기·라벨 교정:** 기존 기록·공용 설정·복구 화면을 남깁니다.
6. **회귀 검증:** OFF 직접 호출, 기존 pending 처리, 설치된 validator, 자동 적용 중 OFF, 인증만 사용, 숨김 복구, 재개, 미저장·조회 실패, 유휴 SQL을 확인합니다.
7. 변경 완료 후 `check:bundle`, 백엔드·UI 테스트, UI 빌드, `forge lint`를 수행합니다. `AGENTS.md:70`, `AGENTS.md:74`.

위저드는 이 경계가 안정된 뒤 추가하는 것이 좋습니다.

## 리더 제안에서 뒤집어야 할 것

- **`transitionApprovalEnabled` 겸용 → 분리.** 비상 우회와 기능 사용은 범위·감사·자동 적용 동작이 다릅니다.
- **“이슈 상태 변경 승인”으로 이슈 묶음 전체를 표현 → 일반·상태·필드 승인 범위를 명시.**
- **“타임시트 끔이면 워크로그·타임시트 묶음 전체 숨김” → 세부 항목만 접기.** 인증·마감·통제·복구는 별도입니다.
- **“이슈 승인 끔이면 결재선·그룹도 숨김” → 공용 설정 접근 유지.**
- **“적용 프로젝트는 이슈 승인·이력에만” → 워크로그 사전 승인도 포함.** 타임시트·인증·통제 전체의 범위로 설명하지 않습니다.
- **“워크포스 연동이면 팀장이 결재” → 검증된 결재자 우선, 없으면 명부.** 추가 단계와 기존 요청의 저장 결재선도 설명합니다. `src/resolver/timesheet/TimesheetService.js:473`, `:521`.
- **“저장값 유지하고 무시”를 모든 OFF에 적용 → 기존 승인·잠금·숨김은 유지·정리·해제 정책을 구분.** 화면을 접는 것만으로 기능 종료가 완성되지 않습니다.
