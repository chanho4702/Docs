---
name: fullcalendar-exclusive-end
description: FullCalendar allDay 이벤트 end는 exclusive — inclusive 저장 종료일은 렌더링 시 +1일 보정 필수 (연차 -6MD 오차의 근본 원인)
metadata: 
  node_type: memory
  type: project
  originSessionId: ce599f0d-4984-4d8c-9137-ff58543814a4
---

user_schedule의 schedule_end_date는 inclusive('YYYY-MM-DD', 모달 DatePicker 기준)로 저장되는데, FullCalendar allDay 이벤트의 `end`는 **exclusive**다. 저장값을 그대로 넘기면 막대가 하루 짧게 그려지고, 사용자가 막대를 맞추려고 종료일을 +1일로 등록해 **DB에 실제보다 하루 긴 연차가 저장**된다 → 인력 분석 leaveDeduction 과대 차감(2026-07-15, 7/2~7/8 연차가 -6MD로 표시된 사건. DB엔 7/9 저장돼 있었음).

**Why:** 표시 계층과 저장 계층의 날짜 규약(inclusive vs exclusive)이 달라서 사용자 보정 행동이 데이터를 오염시킴.

**How to apply:** 캘린더 렌더링 시 `addDaysToDateString(end, 1)`(static/ui/src/utils/TimeUtils.js)로 보정 — WorklogPage.makeScheduleEvents, useProjectWorkersSchedule 적용됨(2026-07-15). 워크로그 다일 이벤트는 start+days 방식이라 원래 정합. 새 allDay 다일 이벤트 추가 시 이 규약 확인. 기존 데이터 중 종료일이 +1일로 저장된 일정이 남아 있을 수 있음(사용자 수동 정정 필요). 참고: Forge SQL DATE 컬럼은 'YYYY-MM-DD' 문자열로 반환(공식 문서 확인) — computeLeaveDeductionMap의 `+ 'T00:00:00'` 파싱은 정상.
