# 사이드 패널 프론트 구현 보고

2026-10-06. `.claude/agents/frontend-engineer.md`와 `.claude/skills/forge-frontend-dev/SKILL.md`, `01_architect_design.md`, `02_backend_report.md` 기준으로 구현했다.

## 구현

- `AppShell.jsx`·`appShell.css`: 상단 탭과 관리자 액션 탐색을 제거하고 동일한 좌측 접기/펼치기 sidebar에 업무·개인·관리 그룹을 배치했다. 240px/56px, 760px 이하 icon rail, badge, title/aria-label, aria-current, 부모 aria-expanded, keyboard focus를 지원한다. 본문은 flex/min-width:0이며 100vh를 제거했다. 긴 메뉴는 최대 720px sidebar 안에서 스크롤한다.
- `settingsNavigation.js`: 11개 설정 메뉴의 key/번역 key와 가벼운 Atlaskit icon을 공유한다. Feature 모듈을 import하지 않는다. 허용되지 않은 setting은 policy로 정규화한다.
- `SettingsPage.jsx`: SettingsPanel은 controlled selected 본문만 렌더한다. 11개 Feature 전체를 `React.lazy`와 `importWithReloadOnce`로 분리하고 선택한 섹션만 Suspense로 로드한다. 독립 adminPage 선택은 Router 없이 로컬 state다.
- `InboxPage.jsx`: 설정 children을 같은 sidebar에 붙였다. 부모 `timesheet`와 자식 설정 `timesheet`의 callback/선택 값을 분리했다. `tab=settings&setting=...` 진입·history 복원, invalid/missing setting의 replace 정규화, 하위 선택 push, 기존 q/period/team 등의 query 보존, 설정 이탈 시 setting 제거를 구현했다. 팀장 판정 실패 시 팀 메뉴를 숨기는 기존 계약은 유지했다.

## 제약 고지

- WorklogDialog: 저장 즉시 Jira 워크로그 생성/수정, 현재 타임시트는 사후 승인, 앱의 기간 잠금과 REST/자동화/다른 앱 경로의 통제 범위를 저장 전 SectionMessage에 표시한다.
- TransitionRequestForm: 승인 후 Jira 전환을 다시 실행해야 함과 규칙·validator 적용 전환에서만 승인 차단됨을 제출 전에 안내한다.
- TransitionRuleSettings: 라이선스 비활성·초기화 미완료·규칙 없음·프로젝트 제외·전역 강제 해제 시 PASS 가능, 일반 사용자 계정 검증 필요, validator 실제 설치를 화면에서 자동 확인하지 않음을 강조한다.
- TimeTrackingProviderGuide: 기존 acceptance를 눈에 띄는 warning SectionMessage로 올렸다.
- WorkforceLinkSettings: 기존 acceptance를 SectionMessage에 넣고 양쪽 호환 버전/서명 키 필요, 켜짐만으로 연결 완료 아님, 마지막 검증 시각이 이전 성공값일 수 있음을 추가했다. 기존 acceptance testId는 내부 Text에 유지했다.
- kr/en에 동일 key를 함께 추가했다. 신규 사전 워크로그 승인 또는 customfield 기능은 구현하지 않았다.

## 백엔드 소비

기존 listInbox/getInboxCounts/getUnreadCount/getTimesheetContext 및 각 설정 resolver 계약과 Query key를 그대로 사용한다. 신규 resolver, asApp, scope, manifest, SQL, migration, 캐시 정책 변경은 없다.

## 검증

- `npm.cmd run merge`: 성공. 한·영 key 집합 일치, ko-KR/en-US 생성.
- UI 전체 1회: 43 suites, 344 tests 중 42 suites/343 tests 통과. WorkforceLinkSettings 기존 testId의 textContent가 새 보강 안내까지 포함해 1건 실패했다.
- 기존 testId를 내부 acceptance Text에 유지하는 방식으로 수정했다. 이후 `npm.cmd --prefix static/ui test -- --runInBand src/app/AppShell.test.jsx src/features/inbox/InboxPage.test.jsx src/features/settings/__test__/WorkforceLinkSettings.test.jsx`: **3 suites, 16 tests 모두 통과**, 8.609초.
- 새 회귀 4건: 모든 그룹 sidebar 노출/설정 부모 확장, 접힌 settings children 접근/부모-자식 key 구분, 설정 query 보존/history 복원, invalid setting 정규화/이탈 cleanup.
- 로그: `frontend-test.log`, `frontend-regression.log`. PowerShell의 stderr 리다이렉션은 PASS 출력도 NativeCommandError로 표기했으므로 최종 테스트 상태는 Jest summary를 확인했다.
- build/forge lint/배포/커밋은 수행하지 않았다. 실제 Jira iframe 및 light/dark 시각 검증과 최종 전체 검증은 모든 에이전트 종료 후 리더가 진행한다.

## 미검증

실제 호스트 iframe 폭, sticky/720px 스크롤과 하위 rail tooltip 위치, 최종 bundle 차이는 리더의 렌더/빌드 검증 대상이다. 새 사전 승인과 앱필드 선택은 별도 설계 단계다.

## 최적화 검토 반영

`06_optimization_review.md`의 프론트 2~4번을 최소 수정했다.

- TimesheetPolicySettings 저장 성공 시 기존 policy 갱신/periodCloses 무효화에 `timesheetKeys.all` 무효화를 추가했다. 단위·타임존 변경 후 맥락과 개인·팀 결과가 이전 정책으로 남지 않는다.
- InboxPage의 getTimesheetContext 오류는 null 성공으로 바꾸지 않고 Query error로 유지한다. error이면 이전 data가 있어도 팀 메뉴를 숨긴다. 명시 refresh는 업무함에서도 context를 무효화하여 다시 조회한다. 정상 응답의 5분 staleTime과 retry:false는 유지한다.
- NotificationPanel도 `React.lazy(importWithReloadOnce)` 및 기존 Skeleton/Suspense로 분리했다. 부모 unread query와 공용 query key는 유지한다.
- 정책 저장의 context/개인 목록 무효화, context 실패의 성공 캐시 방지와 refresh 복구를 검증하는 회귀 2건을 추가했다. 관련 **2 suites, 24 tests 모두 통과**, 종료 코드 0. 로그: `frontend-optimization-test.log`.
- 전체 UI 테스트·build·Forge·배포는 수행하지 않았다. backend cache와 theme/history bootstrap은 수정하지 않았다.

## Workforce 전체 페이지 구조 반영

사용자의 추가 요청에 따라 `C:/CloudJira/moves-workforce/static/ui/src/layout/AppLayout.jsx`와 `sidebar.css`를 확인하고 같은 전체 화면 flex 구조를 적용했다. manifest의 globalPage `layout: blank`는 리더가 추가하며 이 단계에서 수정하지 않았다.

- AppShell의 `fullPage` prop은 기본 false다. InboxBootstrap과 InboxPage만 true로 전달한다. 독립 adminPage는 기존 자동 높이를 유지하여 iframe 높이 되먹임을 피한다.
- globalPage는 100vh 전체 높이, gap/상하 padding 없이 좌우 영역을 채운다. 240px sidebar와 기존 56px rail을 유지한다.
- 전체 페이지 sidebar의 sticky/720px 제한을 제거했다. header는 flex 고정 영역이며 nav가 독립 스크롤한다. main도 독립 스크롤하고 padding 24px을 사용한다.
- 좁은 화면의 matchMedia 초기 접힘과 사용자 펼치기 토글은 그대로 동작한다. 다크 sidebar 면/경계는 Workforce처럼 raised/bold 토큰을 사용한다.
- 전체 페이지 범위 지정, adminPage 기본 높이 유지, 고정 header/분리 nav·main 구조, rail 전환 보존 회귀를 기존 AppShell 테스트에 추가했다.
- 관련 **2 suites / 12 tests 모두 통과**, 종료 코드 0, 8.545초. 로그: `frontend-fullpage-test.log`.
- source/보고서 작성과 테스트는 모두 종료했다. build·Forge·배포·manifest·커밋은 수행하지 않았다. 전체 페이지 실제 호스트 viewport 시각 검증과 최종 build/lint는 리더가 수행한다.
