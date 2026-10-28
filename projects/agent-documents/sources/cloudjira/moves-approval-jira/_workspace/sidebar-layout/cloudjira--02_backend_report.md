# 사이드 패널 백엔드 계약 확인

2026-10-06 · 최초 확인. `.claude/agents/backend-engineer.md`와 `.claude/skills/forge-backend-dev/SKILL.md`, 설계서 및 `00_input/requirement.md`를 기준으로 검토했다.

## 변경 범위

AppShell과 설정 탐색의 UI 변경만 필요하다. 신규 resolver·응답 필드·PermissionMap·Controller 등록·SQL·마이그레이션·manifest·scope 변경은 없다. 백엔드 소스를 수정하지 않았다.

## 기존 소비 계약

세 resolver는 모두 `guardedDefine`으로 등록되며 PermissionMap의 `SELF`와 `src/index.js`의 Controller 등록을 유지한다. 응답은 `{ success: true, content: ... }`이며 `invokeApproval`이 `success`를 확인한 후 `content`를 반환한다.

| resolver | 성공 응답의 content | 업무함 소비 |
|---|---|---|
| getTimesheetContext | `{ unit, timeZone, currentPeriodKey, previousPeriodKey, myTeam, isTeamLead, ledTeams }` | `isTeamLead === true`일 때만 팀 타임시트 메뉴 노출. 조회 실패 시 `null`을 반환해 숨긴다. |
| getInboxCounts | `{ statusCounts, myTurnCount }` | 기존 `{ tab: view, filters: serverFilters }` 입력 및 `countsQuery.data?.myTurnCount` 배지 유지. |
| getUnreadCount | `{ unread }` | 기존 무인자 호출 및 `unreadQuery.data?.unread` 배지 유지. 조회 실패 시 `{ unread: null }`. |

탐색 위치만 옮기므로 기존 Query key·호출 횟수·팀 범위의 서버 가드를 유지하면 된다. 설정 하위 선택의 `setting` query는 UI 상태이며 백엔드 입력에 추가하지 않는다.

## 검증

`npm.cmd test -- --runInBand`: **89 suites, 1278 tests 모두 통과**, 종료 코드 0, 45.768초. `npm`은 PowerShell 실행 정책에 의해 `npm.ps1`이 차단되어 같은 명령의 `npm.cmd`를 사용했다. 로그: `backend-test.log` (PowerShell 기본 UTF-16 인코딩).

빌드·Forge·커밋 명령은 실행하지 않았다. 실제 Jira iframe에서 사이드 패널 레이아웃은 프론트 구현 후 검증 대상이다.
