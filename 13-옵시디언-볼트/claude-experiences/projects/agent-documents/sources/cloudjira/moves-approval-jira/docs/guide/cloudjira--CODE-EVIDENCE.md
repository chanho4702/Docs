# 문서 근거 — 현재 실행 코드

기준: 2026-10-20 작업 트리. 기존 미커밋 구현이 다수 있으므로 Git HEAD나 실제 배포본과 동일하다고 간주하지 않는다. 설계서·주석만으로 기능 제공을 확정하지 않고 실제 렌더링·라우팅·서버 조건을 대조했다.

| 문서 주장 | 확인한 실행 코드 |
| --- | --- |
| 현재 메뉴·관리자 메뉴 | `static/ui/src/features/inbox/InboxPage.jsx`의 `TAB_LABEL_KEYS`, `visibleTabKeys`, `navigationGroups` 구성 |
| 타임시트 메뉴·직접 URL 미제공 | `static/ui/src/features/inbox/inboxUrl.js`의 `INBOX_VIEWS`, `parseInboxSearch`; `TIMESHEET_VIEWS`는 허용 목록에 포함되지 않음 |
| 직접 인증 메뉴 숨김 | `InboxPage.jsx`의 `key !== 'teamCertification'` 필터. 내부 URL·코드 잔존과 메뉴 제공은 구분 |
| 상태 변경 서버 기본 꺼짐 | `src/resolver/settings/SettingsRepository.js`의 `statusChangeApprovalEnabled: false`, `isStatusChangeApprovalEnabled()` |
| 상태 변경 설정 UI 미연결 | `FeatureSelectionSettings.jsx`는 `WorklogApprovalSettings`만 렌더; 후자는 `worklogAutoRequest`, `timesheetAutoCloseDays`만 저장 |
| 프로젝트 규칙 화면 미연결 | `static/ui/src/entries/projectSettings.jsx`는 `IssueExceptionList`만 렌더; 파일 머리 주석과 실제 동작이 다름 |
| 일반 이슈·필드 신규 승인 차단 | `SettingsRepository.isIssueApprovalEnabled()`의 `false`, `src/domain/settings/features.js`, `ApprovalService.createForTarget()` |
| 자동 요청 기본 켬·자동 마감 0 | `SettingsRepository.js`의 `worklogAutoRequest: true`, `timesheetAutoCloseDays: 0`; `WorklogApprovalSettings.jsx`의 0 경고 및 0~90 검사 |
| 연동은 스위치와 PAIRED 모두 필요 | `src/resolver/channel/ChannelState.js`의 `isLinked()` |
| 연동 중 연결 이슈만 승인 대상 | `src/domain/worklogCertification/eligibility.js`의 `worklogApprovalScopeOf()` |
| 상위 팀장 우선·팀장 자기 승인 조건 | `WorklogRequestService.candidates/create`, `eligibility.js`의 `worklogSelfApprovalOf()` |
| 저장 결과와 요청 결과 분리 | `static/ui/src/features/worklog/WorklogDialog.jsx`, `WorklogApprovalPanel.jsx`; `WorklogRequestService.requestAutomatically()` |
| 대기 중 미결정 요청만 승인자 변경 | `WorklogRequestService.get()`의 `canChangeApprover` 및 변경 처리 경로 |
| 승인 잠금·소명 | `WorklogRequestService.get/create/appealBaseline`, `WorklogControlService.js`, `WorklogApprovalPanel.jsx` |
| 규칙 위반 소명과 승인 후 재검토는 별개 | `WorklogRequestService`의 `explanationRequired`, `canAppeal`, `create({appeal})` |
| 연결 코드와 비밀 표시 | `static/ui/src/features/settings/WorkforceLinkSettings.jsx`의 CreateCodeBlock·입력·상태 섹션, `src/resolver/channel/PairingService.js` |
| 설명·이력 보관 기본값 | `SettingsRepository.js`: `worklogHistoryKeepComment:false`, 일반 12개월·연동 36개월·인증/통제 0 |
| 보호 원장 정리 제외 | `src/resolver/retention/RetentionService.js`, `RetentionRepository.js` |
| 해제 시작과 완료는 별개 | `WorklogControlService.release()` 및 `static/ui/src/features/worklogControl/ControlStatusPanel.jsx`의 RELEASE 확인·잔여 표시 |
| 시간 추적 설정 안내 경로 | `locales/kr/timesheet.json`, `locales/en/timesheet.json`의 provider 안내; 실제 모듈은 `manifest.yml` |
| 서버의 자동 전환 결과 불명 재전송 금지 | `src/resolver/transition/TransitionExecutor.js`의 `postStartedAt`/`UNKNOWN` 조기 분기 |
| 요청자 권한으로 전환 | `TransitionOfflineGateway.js`의 `asUserOffline` 사용 |
| 라이선스·dynamic webtrigger·egress | `manifest.yml`, `src/utils/license/LicenseGuard.js`, `static/ui/src/features/license/LicenseGate.jsx` |

## 독립 독자 검토

문서 전용 검토자가 한·영 28개를 코드와 대조했다. 타임시트 진입·상태 변경 설정 미연결, 제공자 안내 경로, RELEASE·잔여 0 확인, 규칙 위반 소명 구분을 반영했다. 주요 질문(설치·접수 실패·승인 후 변경·연동 장애·제거)에 문서만으로 답할 수 있는지 확인했다.

## 실제 화면 관찰

개발 사이트에서 승인 이력·기본 승인 규칙·Workforce 연결 화면을 캡처했다. 배포 artifact 식별자는 브라우저 iframe의 `0bcb5352-98a9-416f-a52e-f26efba6afbb`였으며 이를 Forge 출시 버전이라고 부르지 않는다.

승인 상세에서 승인 완료·감사 타임라인과 함께 “예상하지 못한 오류”가 표시되는 사례를 확인했다. 원인은 이 문서 작업에서 확정하지 않았다. [오류 증빙](evidence/ko-detail-error-live.jpg)을 정상 동작 캡처로 분류하지 않는다.
