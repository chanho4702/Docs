# 프론트엔드 구현 보고서

## 구현 결과

- `WorklogApprovalSettings` 상단에 현재 활성 운영 모드만 표시하는 요약 카드를 추가했다.
  - Workforce 연동 모드와 Approval 단독 모드를 제목·로젠지·설명으로 구분한다.
  - 승인 대상, 승인자 원천, 정책 관리 주체를 `SettingsRows`로 나눠 표시한다.
  - 기존의 실제 동작과 반대였던 “미연결 이슈에도 기본값 적용” 안내를 제거했다.
- 정책 폼의 제목·설명·적용 범위를 모드별로 분리했다.
  - 연동 모드: Workforce 연결 이슈의 정상 경로 워크로그에만 적용
  - 단독 모드: Approval 정상 입력 경로의 Jira 워크로그에 적용
  - 저장 payload는 기존 계약대로 `worklogAutoRequest`, `timesheetAutoCloseDays` 두 필드만 보낸다.
- 연동 모드에서만 `getWorklogApprovalIdentity`를 조회한다.
  - 서명 검증된 내 팀과 팀장 이름·avatar를 표시한다.
  - Workforce 팀장 본인은 자기 워크로그의 승인자로 자신을 선택할 수 있음을 표시한다.
  - 검증된 조직 자료가 없으면 팀장 없음과 자기 승인 불가를 명시한다.
  - 조회 실패는 정책 폼을 막지 않고 결재자 안내만 축소한다.
- `FeatureSelectionSettings`의 `onNavigate`를 `WorklogApprovalSettings`로 전달해 운영 모드 카드 안에서 Workforce 연동 설정으로 이동하게 했다.
- 연동 토글 저장 뒤 현재 사용자 결재자 query도 무효화해 모드 전환 후 오래된 조직 안내가 남지 않게 했다.
- 검증에서 확인된 실제 `ApprovalSetupSettings` 결재 구성 화면에도 같은 운영 모드와 결재자 구성을 추가했다.
  - `WorklogApprovalModeContext` 공용 컴포넌트가 정책·identity query, 모드 요약, 팀장 상태를 소유한다.
  - `WorklogApprovalSettings`는 이미 조회한 정책을 공용 컴포넌트에 전달해 중복 호출을 만들지 않는다.
  - `ApprovalSetupSettings`는 같은 `settingsKeys.policy()` 캐시와 `settingsKeys.worklogApprovalIdentity()`를 사용한다.
  - 단독 모드에서는 identity resolver를 호출하지 않고, 명부와 결재선이 Approval의 여러 승인 기능에서 함께 쓰인다는 안내를 표시한다.

## resolver·query 계약

- 설정: `getApprovalSettings`, `saveApprovalSettings`
- 연동 모드 결재자: `getWorklogApprovalIdentity`
- 신규 query key: `settingsKeys.worklogApprovalIdentity()`
- identity query 실행 조건: `settings.workforceLinkEnabled === true`

## i18n

- `locales/kr/worklogApprovalFlow.json`, `locales/en/worklogApprovalFlow.json`
  - `settings.mode.*`: 모드별 대상·승인자 원천·정책 책임·이동 문구
  - `settings.identity.*`: 팀·팀장·자기 승인 가능 상태
  - `settings.policy.*`: 모드별 정책 폼 문구
  - `settings.mode.standalone.setupShared`: 단독 모드 공용 명부·결재선 안내
- `locales/kr/error.json`, `locales/en/error.json`
  - `WORKLOG_APPROVAL_SCOPE_EXCLUDED`
- `npm run merge`로 `ko-KR`, `en-US` 병합 정합성을 확인했다.

## 테스트

실행:

```text
npm run test:ui -- --runInBand src/features/worklog/__test__/WorklogApprovalFlow.test.jsx src/features/settings/__test__/FeatureSelectionSettings.test.jsx src/features/settings/__test__/linkedModeI18n.test.js src/features/settings/__test__/WorkforceLinkSettings.test.jsx
```

결과:

- Test Suites: 4 passed, 4 total
- Tests: 25 passed, 25 total

검증 보완 뒤 결재 구성·공용 모드 문맥 테스트:

```text
npm run test:ui -- --runInBand src/features/settings/__test__/ApprovalSetupSettings.test.jsx src/features/worklog/__test__/WorklogApprovalFlow.test.jsx src/features/settings/__test__/FeatureSelectionSettings.test.jsx src/features/settings/__test__/linkedModeI18n.test.js
```

- Test Suites: 4 passed, 4 total
- Tests: 19 passed, 19 total

추가 locale 전체 정합성:

```text
npm run test:ui -- --runInBand src/utils/__test__/localeIntegrity.test.js
```

- Test Suites: 1 passed, 1 total
- Tests: 1 passed, 1 total
- `git diff --check`: 통과

전체 UI build와 전체 테스트는 에이전트 작업 종료 후 최종 검증 단계에서 한 번만 실행하도록 프로젝트 규칙에 따라 수행하지 않았다.

## 변경 파일

- `static/ui/src/features/settings/WorklogApprovalSettings.jsx`
- `static/ui/src/features/settings/WorklogApprovalModeContext.jsx`
- `static/ui/src/features/settings/ApprovalSetupSettings.jsx`
- `static/ui/src/features/settings/FeatureSelectionSettings.jsx`
- `static/ui/src/features/settings/WorkforceLinkToggle.jsx`
- `static/ui/src/utils/queryKey/approvalKeys.js`
- `locales/{kr,en}/worklogApprovalFlow.json`
- `locales/{kr,en}/error.json`
- 관련 UI·i18n 테스트

## 잔여 사항

- 프론트엔드가 소비하는 backend 응답 shape와 설계서가 일치해 별도 백엔드 요청은 없다.
- 실제 Forge iframe 화면의 최종 육안 확인은 전체 build·development 배포 뒤 수행할 수 있다.
