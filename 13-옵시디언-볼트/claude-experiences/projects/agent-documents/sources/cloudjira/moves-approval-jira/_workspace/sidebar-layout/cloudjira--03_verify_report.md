# Sidebar 경계면 검증 리포트 (회차1·source review 초안)

2026-10-06. integration-verifier/integration-verify 적용. 리더 지시로 **소스 대조만 수행**했다. frontend 최적화 보완과 신규 backend 작업이 진행 중이므로 테스트·merge·빌드·Forge·배포를 실행하지 않았다. 신규 사전승인 src는 검토하지 않았다.

## 요약

소스 기준 통과8 / 재현 가능한 실패0 / 실행·실측 미검증5. 기존 보고서의 테스트 통과 숫자는 이 검증자가 재실행한 결과로 간주하지 않는다. 진행 중 변경에 대한 최종 승인 리포트가 아니다.

## 경계면 대조

| resolver | 생산자 | 소비자 | 소스 일치 |
|---|---|---|---|
| listInbox | InboxController의 content:service.listInbox | InboxPage normalizePage(content), items/nextCursor/hasMore | 통과 |
| getInboxCounts | InboxController의 content:service.getInboxCounts | InboxPage countsQuery.data.myTurnCount | 통과 |
| getUnreadCount | NotificationController의 content unread | InboxPage unreadQuery.data.unread | 통과 |
| getTimesheetContext | TimesheetController content, TimesheetService isTeamLead:ledTeams.length>0 | InboxPage data.isTeamLead===true 노출; query.isError일 때 null | 통과 |

위 resolver는 기존 SELF PermissionMap과 src/index Controller registration을 유지한다. invokeApproval은 content를 한 번 추출하고 소비자가 .content를 다시 읽지 않는다. setting query는 resolver 입력에 추가되지 않는다.

## 통과 (소스 기준)

1. AppShell은 groups 전체를 aside/nav에 렌더하고 상단 Tabs·설정 헤더 탐색·back 기반 주 메뉴 숨김을 제거했다. 업무/개인/관리 메뉴가 설정 진입 중에도 유지된다.
2. SettingsPanel은 selected prop으로 Feature를 선택하고 자체 탭/셸을 만들지 않는다. 공유 settingsNavigation은11개 key/label/icon metadata만 포함하며 Feature를 import하지 않는다. SettingsPage의11개 Feature는 lazySetting→importWithReloadOnce→Suspense로 분리된다.
3. 부모 work timesheet와 설정 자식 timesheet는 selected/selectedChild, onSelect/onSelectChild(parent,key)로 분리되어 key 충돌 없이 선택을 전달한다. selected parent에서만 children을 렌더하고 collapsed여도 같은 children button이 유지된다.
4. InboxPage의 selectedSetting은 URL에서 매 render 정규화한다. settings 하위 선택은 tab+setting을 history push, 누락/invalid setting은 policy로 replace, 설정 이탈 setView는 setting을 제거한다. updateInboxParams는 URLSearchParams 복사로 q/period/team을 보존한다. history listener는 기존 ForgeHistoryRouter를 유지한다.
5. independent adminPage는 Router hook 없이 로컬 selected state로 같은 AppShell/SettingsPanel/공유 nav를 사용한다. issue/modal/worklog/projectSettings 엔트리에는 AppShell을 추가하지 않았다.
6. sidebar 240px/접힘56px,760px 이하56px CSS rail, child icon·title/aria-label·focus-visible·부모 aria-expanded가 있다. 본문 min-width:0, 헤더 flex-wrap,720px max-height overflow-y로 긴 메뉴 접근 경로가 존재한다. 셸 height100vh는 없다. 실제 tooltip/scroll 시각 품질은 미검증이다.
7. 팀장 context 실패일 때 isError→null→visibleTabKeys에서 teamTimesheet를 제거한다. 설정 UI 노출은 서버 권한을 대체하지 않으며 기존 목록·팀장 서버 계약을 변경하지 않는다. 이 검토는 서버 전체 권한 범위 재감사가 아니라 sidebar 연결 확인이다.
8. 전환 신청의 “승인 후 직접 다시 전환”, 규칙 화면의 validator 설치 필요 및 license/table/rule/project/global PASS 고지는 src/domain/transition/judge.js의 실제 branch와 맞는다. Workforce 안내는 호환 버전·서명키·게시 지연·과거 검증 시각을 구분한다. WorklogDialog의 현재 즉시저장/기간 사후승인 고지는 기존 WorklogService 계약을 설명한다. 신규 사전승인 구현 후에는 해당 고지를 required policy에 맞게 갱신해야 한다.

## 실패

현재 읽은 소스에서 재현 가능한 sidebar 계약 실패를 발견하지 않았다. fixed720px menu/rail tooltip은 브라우저 재현 없이 실패로 판정하지 않는다.

## 진행 중 보고서와 소스의 차이

02_backend_report와 초기 최적화 보고서는 context 오류가 catch→null로 성공 반환된다고 설명했지만 현재 InboxPage는 queryFn 오류를 보존하고 isError일 때만 표시 context를 null로 바꾼다. refresh는 일반 업무함에서도 timesheetKeys.context를 invalidate하도록 보완됐다. 이는 실패 복구 개선이며 팀장 fail-closed 노출 계약을 유지한다. 최종 frontend 보고서에는 실제 최적화 보완을 추가해야 한다.

## 미검증

1. npm merge/backend/UI 전체 테스트: 에이전트 진행 중이며 실행 금지 지시. 완료 후 리더가 지정 순서로 수행한다.
2. 최종 UI 번들 크기·chunk budget/forge lint: 빌드·Forge 금지로 미실행. 모든 에이전트 종료 후 확인한다.
3. 실제 Jira iframe의 좁은 폭·짧은 높이·sticky720px 메뉴 스크롤·tooltip clipping·keyboard focus·light/dark: browser 실측 필요.
4. 브라우저 뒤로/앞으로, Forge history fallback, lazy 청크 배포 직후 유실 복구: 소스 연결은 확인했으나 host runtime 미실행.
5. kr/en 전체 key 대칭·merge 산출물과 신규 사전승인 구현 후 고지 충돌: 기존 문자열 양쪽 존재는 읽었으나 전체 merge/신규 기능 통합은 최종 검증 대상이다.

## 실행 결과

read-only rg/Get-Content/git diff --stat만 실행했다. 테스트·빌드·Forge·배포·소스 수정은0회다. 최종 실행 로그는 리더 검증 후 본 리포트에 추가해야 한다.
