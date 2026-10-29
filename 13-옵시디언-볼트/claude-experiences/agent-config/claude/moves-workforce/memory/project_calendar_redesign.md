---
name: calendar-redesign
description: "캘린더 디자인 개선(RFC-192, 2026-09-02) — 월간=밀도·주간=상세(커밋 9f99e8e), 이어서 워크로그/이슈 표시 모드 토글 추가(이슈 기간=간트 Task start~end 재사용, 커밋 전)"
metadata: 
  node_type: memory
  type: project
  originSessionId: c9bdafcc-12fb-4574-a50d-c4489a473f0a
  modified: 2026-09-02T01:56:57.519Z
---

**캘린더 디자인 개선 (2026-09-02, RFC-192 브랜치, 커밋 전·배포 전)**

- 손댄 곳: `components/calendar/FullCalendar.jsx`·`.css`, `pages/projectDetail/calender/ProjectCalender.jsx`, `locales/{kr,en}/calendar.json`(legend 키)
- 설계: **월간 = 밀도** (날짜 칸 우상단 일별 합계 배지, 한 줄 칩 `[상태 색 바] 아이콘 KEY … 소요시간 아바타`, +N 접기) / **주간 = 상세** (요일 헤더에 날짜·합계, 2줄 카드 KEY+요약 / 시간대·소요시간·아바타, `dayMaxEvents:false`)
- 공휴일은 이벤트에서 빼서 날짜 칸 라벨로 (슬롯 안 먹음). 색은 전부 `--ds-*` 토큰, 오늘·활성 뷰만 DMOVE 틸
- 캘린더 상태 색은 `CALENDAR_STATUS_ACCENT`(FullCalendar.jsx) — `statusColorMap`은 이슈 배지와 공유돼 안 건드림
- `CustomFullCalendar` 는 `/myWork` 도 같이 쓴다 → 배포 후 두 화면 다 확인 필요. 실제 화면(Jira 안) 미확인 상태
- 이슈 키 링크는 `preventDefault` 필수 (앱 라우팅이 URL 해시라 `href="#"` 기본 동작이 경로를 날림)

**표시 모드 토글 (2026-09-02, 커밋 전)**: 필터 바 오른쪽 `ViewModeToggle` [워크로그 | 이슈]. 이슈 모드는 `useGanttData(project_id, {enabled})` 로 간트 Task 를 받아 `components/calendar/issueEvents.js`(순수 함수, 공용) 가 allDay 기간 이벤트로 변환 — start=시작일 커스텀필드, end=duedate, **end exclusive +1일**, 한쪽만 있으면 하루, 둘 다 없으면 제외, `editable:false`(일정 편집은 간트). 담당자 필터는 담당자∪협업자, 팀 필터는 담당자 accountId. 클릭 → Jira 이슈. 칩 렌더는 `renderIssueEventContent`(FullCalendar.jsx, `mw-cal-chip--issue`), 상태 색·범례는 워크로그와 공유. 팀원 일정·공휴일은 두 모드 공통, 일별 합계 배지는 워크로그만 집계하므로 이슈 모드에서 자연히 사라진다.
**내 워크로그(/myWork)도 같은 토글**: 백엔드 공용 페처 `getProjectIssuesByUser`(6곳 공유)는 안 건드리고 프론트 JQL 직접 조회 `getMyIssuePeriods`(getJqlIssue.js, `cf[10015] is not EMPTY OR duedate is not EMPTY`, nextPageToken 페이징) → `issueToPeriodTask` 로 Task 꼴 변환. 쿼리키 `myWorkKeys.issuePeriods`. 간트 Task.assignee 는 `avatarUrl` 단일값이라 AvatarStack(avatarUrls 맵) 용 `toAvatarUser` 정규화가 FullCalendar.jsx 에 있다.

**기간 미설정 이슈 (2026-09-02)**: 날짜가 둘 다 없는 이슈는 격자에 안 올리고, 이슈 모드일 때 필터 바에 `UnscheduledIssuesPopup`("기간 미설정 N건" → 목록 → Jira 이동)으로 알린다. `getUnscheduledTasks` 가 `buildIssueEvents` 와 같은 필터 술어를 공유. **번들 함정**: 상태 색은 `components/calendar/statusAccent.js` 에서 import 할 것 — `FullCalendar.jsx` 를 import 하면 @fullcalendar+moment 스택이 lazy 경계를 넘어 main 에 실린다(+1MB, 실제로 밟음).

**How to apply:** 캘린더 후속 손질은 뷰별 분기(`isWeekView`)와 칩 클래스(`mw-cal-chip*`)를 따라갈 것. 관련: [[project-forge-history-router]] · [[dmove-brand-palette]]
