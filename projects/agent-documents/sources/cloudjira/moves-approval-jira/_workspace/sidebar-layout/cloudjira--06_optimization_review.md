# Sidebar 변경 후 독립 최적화 검토

2026-10-06. read-only 소스 감사. 코드 수정·테스트·빌드·배포 없이 확인했으며 신규 사전승인 구현 파일은 검토 대상에서 제외했다. 실제 byte/ms 감소는 측정하지 않았으므로 추정 수치를 제시하지 않는다.

## 확인된 개선과 중복이 아닌 항목

`SettingsPage.jsx`의 11개 Feature는 lazy import이고 공유 `settingsNavigation`은 가벼운 metadata다. 업무함 첫 로드가 모든 설정 폼을 import하지 않는다. `useI18nStore.load`는 module loadPromise를 공유하므로 SettingsPage/SettingsPanel/StrictMode의 반복 load 호출이 번역 bridge 중복 호출을 뜻하지 않는다. 업무함과 NotificationPanel의 unread query는 동일 factory key로 React Query를 공유한다. ExcelJS도 utils/excel.js에서 dynamic import하므로 exportInboxExcel의 정적 import만 보고 ExcelJS가 최초 번들에 포함된다고 판정하면 안 된다.

## 1. PrincipalResolver 권한 cache를 invocation으로 제한 — 우선순위 높음

근거: 변경 전 `src/permission/PrincipalResolver.js:19`의 module-level Map, `:35`의 accountId+manager 여부 key, `:50`의 판정 저장. resetPrincipalCache는 테스트에서만 호출됐다. `permissionGuard.js`가 runInInvocation을 사용해도 이 Map은 InvocationScope의 store를 사용하지 않았다. `JiraPermission.js`의 getIssueAccess는 이미 InvocationScope.memo를 사용하지만 isJiraAdmin은 직접 조회하며, 이번 PrincipalResolver 수정에서 관리자 판정을 invocation 범위로 묶었다.

같은 runtime이 재사용되는 경우 기존 Jira admin 판정과 locale/timezone을 다음 호출에 재사용할 수 있다. 관리자 권한 회수 후 true가 남는 위험이며 cacheKey에 cloudId도 없다. 코드가 runtime 격리를 보장한다고 주석에 써도 Map의 실제 수명은 모듈 수명이다.

최소 개선: PrincipalResolver의 무기한 Map을 제거하거나 InvocationScope.memo로 옮긴다. 동일 invocation의 중복 판정은 기존 memo로 줄이고 호출 간 권한 재검사를 유지한다. 이는 속도 개선보다 권한 정확성 개선이며, 서로 다른 invocation 사이에서 admin true→false가 반영되는 회귀 테스트가 필요하다.

해결 상태: 리더가 module Map을 제거하고 `memo('principal:jiraAdmin:<accountId>')`로 invocation 범위의 Jira admin 판정만 공유했다. principal의 context/manager 값은 매번 계산하며 obsolete reset export/mock을 제거했다. 리더 보고 기준 신규 PrincipalResolver 회귀2건과 기존 guard12건, 총2 suites14 tests가 통과했다. 이 감사 에이전트는 소스를 수정하거나 테스트를 재실행하지 않았다.

## 2. 정책 변경 후 timesheet context를 무효화 — 잘못된 재조회 줄이기

근거: `static/ui/src/features/settings/TimesheetPolicySettings.jsx:327`의 policy query, `:333` save 성공 시 policy cache 갱신과 periodCloses invalidation만 수행. `InboxPage.jsx:218`의 getTimesheetContext는 5분 staleTime이며 현재 기간/팀장 노출 등 값을 사용한다. TimesheetTeamSettings는 이미 timesheetKeys.all을 invalidate한다.

단위·timezone 정책 변경 뒤 업무함으로 돌아오면 이전 context가 최대5분 유지될 수 있다. 최소 개선은 TimesheetPolicySettings save 성공 시 timesheetKeys.all을 invalidate하여 context/개인/팀 결과가 같은 정책으로 갱신되게 하는 것이다. 새로운 전역 fetch나 짧은 polling을 추가할 필요가 없다.

## 3. context 조회 오류를 성공 null로 5분 보관하지 않기

근거: `InboxPage.jsx:218`의 context queryFn catch는 null을 반환하며 retry:false/staleTime=5분이다. 외부 일시 실패는 React Query에 성공 data=null로 저장되어 새 팀장 메뉴/기간 상한을 오래 숨길 수 있다. refresh 함수 `:330`은 타임시트 화면에서만 timesheetKeys.all을 invalidate하므로 업무함에서 새로고침해도 context가 갱신되지 않는다.

최소 개선: UI는 실패 시 기존처럼 팀 메뉴를 숨기되 queryFn은 error를 유지하거나 별도 실패 상태를 구분한다. 명시 새로고침에서는 context query도 invalidate한다. 정상 context의 5분 cache를 유지하면서 실패 복구만 빨라지고, 모든 성공 조회의 polling을 늘리지 않는다. 서버 팀장 범위는 그대로 유지한다.

## 4. NotificationPanel을 동일 lazy 경계로 이동

근거: `InboxPage.jsx:15`는 NotificationPanel을 정적 import하지만 Settings/Signature/Delegation/Timesheet는 lazy다. `features/notification/NotificationPanel.jsx`는 알림 table·heading·lozenge·명부 해석 등을 import한다. 알림 화면을 열지 않는 초기 업무함에도 이 모듈이 연결된다.

최소 개선: 기존 importWithReloadOnce와 React.lazy/Suspense로 알림 panel도 분리한다. unread badge의 query는 부모 업무함에서 그대로 유지한다. 업무함과 알림이 공유하는 table/format 모듈이 많으므로 byte 감소는 실제 build stats로 확인해야 하며 임의로 큰 절감량을 주장하지 않는다.

## 5. Theme와 history bootstrap의 순차 대기 완화

근거: `AppProviders.jsx`는 view.theme.enable 완료까지 children을 렌더하지 않는다. `entries/inbox.jsx`의 view.createHistory는 child의 effect에서 시작하므로 theme→history 두 bridge 작업이 순차다. i18n은 import 시 load를 시작하여 이미 별도로 진행된다.

최소 개선 후보: history 준비 Promise를 entry/module의 최초 안전 시점에 시작하거나 공통 bootstrap에서 theme/history를 병렬 준비한다. 화면 렌더는 theme 이후로 유지하여 색 튐을 막고 history 실패 시 MemoryRouter fallback도 유지한다. StrictMode dedupe는 현재 bootstrapPromise 계약을 유지한다. iframe 준비 전에 bridge 호출이 안전한지는 실제 환경에서 확인해야 하므로 이 항목은 위4건보다 후순위다.

## 권장 적용 순서

PrincipalResolver cache는 리더가 해결했다. 남은 timesheet 정책/context invalidation부터 작게 수정하고, NotificationPanel lazy는 다음 build에서 청크 변화를 확인한다. bootstrap 병렬화는 초기 bridge 지연을 측정한 뒤 적용한다. 기존 목록·count의 별도 resolver를 합치거나 사용자 이름 cache를 무기한 연장하는 변경은 현재 근거만으로 권장하지 않는다. 신규 사전승인 backend에는 이번 감사로 직접 간섭하지 않는다.
