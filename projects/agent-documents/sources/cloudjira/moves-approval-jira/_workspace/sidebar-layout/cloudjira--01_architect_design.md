# Workforce 형식 사이드 패널 설계서

## 1. 개요·영향 범위

기존 `AppShell`은 첫 그룹을 상단 탭으로, 나머지 그룹을 헤더 액션으로 렌더한다. `InboxPage`는 설정 진입 시 `back`을 전달해 주 메뉴를 숨기고 `SettingsPanel`의 설정 탭을 표시한다. 이를 한 개의 좌측 sidebar와 본문으로 바꾼다.

변경 범위는 `static/ui/src/app/AppShell.jsx`, `appShell.css`, `features/inbox/InboxPage.jsx`, `features/settings/SettingsPage.jsx`, 공유 설정 메뉴 정의, 한·영 번역이다. `AppShell` 소비자는 업무함과 독립 설정 화면뿐이다. `entries/issue.jsx`, `modal.jsx`, `worklog.jsx`, `projectSettings.jsx`는 이 셸을 쓰지 않으므로 해당 임베디드 화면에 sidebar를 넣지 않는다.

승인 대상과 `scopeKey`는 기존 계약 그대로다. 도메인·resolver·SQL·manifest·Workforce 연동에는 변경이 없다. `CLAUDE.md`, `docs/DESIGN.md` §2.0·§4, 공용 `components/`를 확인했으며 탐색 컴포넌트는 기존 AppShell을 확장한다.

## 2. 경계면 계약

신규 resolver가 없다. 기존 호출·응답을 유지한다. `invokeApproval`이 추출하는 `content` shape도 변경하지 않는다.

| resolver | 권한 축 | 입력 | 응답 shape (success) | 에러 code | 소비 화면 |
|---|---|---|---|---|---|
| listInbox | SELF | 기존 tab, filters, cursor, limit | 기존 success/content(items, nextCursor, hasMore) | 기존 계약 유지 | 업무함 목록 |
| getInboxCounts | SELF | 기존 tab, filters | 기존 success/content counts | 기존 계약 유지 | 업무함 배지 |
| getUnreadCount | SELF | 기존 입력 | 기존 success/content unread | 기존 계약 유지 | 알림 배지 |
| getTimesheetContext | SELF | 기존 입력 | 기존 success/content isTeamLead 등 | 기존 계약 유지 | 팀 타임시트 노출 |
| 설정별 기존 resolver | 기존 PermissionMap | 기존 입력 | 기존 응답 | 기존 계약 유지 | 선택된 설정 본문 |

팀장 판정 실패 시 팀 메뉴는 숨긴다. 메뉴 노출 자체를 서버 권한 판정으로 대체하지 않는다. 설정 메뉴의 기존 노출 방식은 유지하고 실제 읽기·쓰기는 기존 서버 가드가 담당한다.

## 3. 도메인

승인 도메인 순수 함수에는 변경이 없다. 설정 메뉴 정의에서 문자열 key와 번역 key를 공유한다. 설정 key 정규화는 UI의 순수 함수로 구성할 수 있다: `normalizeSetting(value) -> allowedKey | 'policy'`.

검증 사례: 누락·알 수 없는 설정 key의 policy 기본 선택, `worklogHistory` 등 대소문자가 있는 유효 key, 메뉴 선택 및 history 복원, 기존 tab 필터 보존.

## 4. 백엔드

Controller/Service/Repository, CAS, 트리거·스윕은 변경하지 않는다. 백엔드 단계 보고서는 “변경 없음, 기존 계약 유지”로 명시하면 된다.

## 5. 스키마·마이그레이션

변경 없음. 접힘 상태는 AppShell의 로컬 UI state로 충분하며 서버 저장·마이그레이션을 추가하지 않는다.

## 6. Jira 연결

기존 `jira:globalPage` 업무함과 `jira:adminPage` 설정 엔트리를 그대로 쓴다. 모듈·scope·REST·asApp 추가 없음. 업무함은 기존 Forge history router와 `useSearchParams`를 사용한다. 독립 설정 엔트리(`entries/settings.jsx`)에는 Router가 없으므로 `useSearchParams`를 직접 도입하지 말고 기존 로컬 선택 state를 유지해도 된다. 이번 URL 요구는 업무함에 한정한다.

## 7. 프론트

### 공통 AppShell

- `groups`와 `nav`, `selected`, `onSelect`, `heading`, `actions`, `card` 계약을 유지한다. 첫 그룹/추가 그룹을 모두 sidebar에 렌더한다.
- 필요한 하위 메뉴 계약을 추가한다: 부모 item에 `children` 배열, 선택된 하위 key 및 하위 선택 callback을 전달하는 방식. 부모 메뉴의 기본 onSelect와 하위 선택을 분리해 업무함의 `timesheet`와 설정의 `timesheet` key 충돌을 피한다.
- 상단 앱 탭·추가 그룹 헤더 버튼을 제거한다. 헤더에는 현재 제목과 refresh/export 같은 화면 액션만 남긴다.
- sidebar 240px/56px, 본문 flex:1 및 min-width:0, CSS 760px 이하 rail 적용. 헤더는 필요 시 줄바꿈하고 표 overflow는 기존 테이블 공용 컴포넌트가 담당한다.
- 접힌 상태에서 설정 부모를 누르면 sidebar를 펼치고 설정 하위 목록을 보여 준다. 설정 선택 상태에서 하위 그룹을 기본으로 연다. 좁은 화면의 하위 항목 접근도 가능하도록 CSS 축소와 접힘 상태를 함께 검토한다.
- `aside`와 `nav`, button type, aria-label, aria-current, 부모 aria-expanded를 사용한다. 접히면 아이콘의 title/aria-label로 의미를 보존한다. 토글은 hover 외 keyboard focus에서도 보여야 한다.
- 긴 페이지에서 sticky sidebar와 메뉴 overflow를 사용할 수 있다. iframe 안에서 `height:100vh`로 셸 전체 높이를 고정하지 않는다. 모든 요소의 높이 합으로 iframe이 계속 부풀지 않도록 내용 기반 셸과 sidebar의 제한된 스크롤 영역을 사용한다.

### 업무함과 설정

`InboxPage`의 work/admin 그룹·아이콘·badge는 유지한다. admin의 settings item 아래 공유 설정 메뉴를 넣는다. 설정으로 이동할 때 `back`으로 주 탐색을 숨기던 동작을 제거한다. `SettingsPanel({selected = 'policy'})`은 controlled 본문으로 바꾸고 자체 Tabs와 선택 state를 제거한다. Feature map·loading/error·lazy worklogHistory 본문은 그대로 유지한다.

공유 설정 메뉴 순서: policy, projects, timesheet, workforce, flows, groups, approvers, managers, audit, worklogHistory, data. 번역 key는 기존 `policy.settings.tab.*`를 재사용한다. 독립 `SettingsPage` 역시 공유 메뉴를 nav로 만들고 같은 SettingsPanel 본문을 렌더한다.

업무함 URL:

| 행동 | 결과 |
|---|---|
| 기존 업무함 메뉴 선택 | 기존 tab 계약 유지; 다른 filters/period/team은 기존 업데이트 방식 유지 |
| 설정 부모 첫 진입 | tab=settings, 유효한 setting이 없으면 policy |
| 설정 하위 항목 선택 | tab=settings&setting=<allowedKey>, history push |
| 다른 업무함 항목 선택 | tab=<existingKey>; setting은 삭제 권장 |
| 잘못된/누락 setting | policy 렌더; 안전한 key allowlist 사용 |
| history 뒤로/앞으로 | URL의 tab/setting으로 선택 및 본문 복원 |

설정 query 업데이트는 `updateInboxParams`로 타 파라미터를 보존한다. 기존 React Query key 팩토리와 lazy import `importWithReloadOnce`를 유지한다. 기능 내부 타임시트 탭은 그대로 둔다. InboxBootstrap 역시 같은 sidebar를 사용한다.

## 8. i18n 키

기존 메뉴 라벨을 전부 재사용한다. 토글·nav 접근성에 필요한 키만 추가한다.

| key | kr | en |
|---|---|---|
| inbox.nav.expand | 메뉴 펼치기 | Expand navigation |
| inbox.nav.collapse | 메뉴 접기 | Collapse navigation |
| inbox.nav.navigation | 앱 메뉴 | App navigation |

키 이름은 기존 inbox 번역 구조에 맞춰 조정할 수 있으며 반드시 kr/en을 같이 추가한다.

## 9. 용량·호출량

신규 SQL 행·KVS·Jira 호출 0. 200명 기준 연 추가 저장량 0. 설정 메뉴 정의는 가벼운 문자열 metadata여야 하며 설정 Feature 컴포넌트 import로 업무함 최초 번들을 키우지 않는다. 기존 지연 로딩·팀장 context 조회 횟수를 유지한다.

## 10. 미검증

| 항목 | 영향 | 확인 방법 |
|---|---|---|
| Jira globalPage 실제 iframe 가로 여백 | 펼친 sidebar에서 표 가로 폭 감소 | development 사이트에서 펼침·접힘·좁은 폭의 목록/타임시트 확인 |
| iframe의 긴 본문과 sticky/overflow 상호작용 | 메뉴 잘림 또는 불필요한 스크롤 | 긴 설정 본문과 팀 matrix에서 모든 메뉴 접근 및 전체 높이 확인 |
| adminPage 호스트 크기 | 긴 설정 메뉴 접근성 | 독립 설정 화면에서 접기/펼치기와 마지막 data 항목 확인 |

실측 전에는 위 항목을 확인 완료로 표시하지 않는다. 배포는 리더가 모든 에이전트 종료 후 별도 판단한다.

## 11. 작업 분해

- backend: 기존 resolver/PermissionMap/Service 변경이 없음을 보고한다.
- frontend: 공통 AppShell·CSS, 공유 설정 metadata, controlled SettingsPanel, InboxPage setting URL, kr/en 접근성 키를 구현한다. 기존 변경을 지우거나 파일 전체를 이전 버전으로 되돌리지 않는다.
- verifier: 상단 탐색 중복 제거, 업무함 설정 왕복, URL history, 팀장 메뉴 fail-closed, 부모/자식 key 충돌, bootstrap/독립 설정, 760px rail 메뉴 접근, 테마·키보드·배지를 확인한다.
- 리더: 모든 에이전트 완료 후 `npm test -- --runInBand`, `npm run test:ui -- --runInBand`, `npm run build:ui`, `forge lint` 순서로 실행한다. 빌드·커밋·배포를 에이전트 실행 중에 하지 않는다.
