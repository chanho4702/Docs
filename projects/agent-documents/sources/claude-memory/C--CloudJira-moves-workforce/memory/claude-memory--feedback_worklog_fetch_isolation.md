---
name: feedback-worklog-fetch-isolation
description: 워크로그 N+1 페치 최적화 시 공통 경로를 수정하지 말고 기능별 전용 병렬 페처로 분리할 것
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 0a9054a4-0822-4828-8bd9-f91363700f4c
---

워크로그 조회 성능(이슈별 초과 워크로그 N+1 페이지네이션)을 최적화할 때, 공통 모듈을 직접 고치지 말고 **해당 기능 전용 파일로 분리해서 병렬화**한다.

**Why:** 공통 `src/resolver/utils/worklog/WorklogService.js`(`getProjectWorklogs`/`getExtraWorklogs`)와 `src/resolver/myWork/MyWorkService.jsx`(`getProjectWorklogService`)는 myWork/dashboard/히트맵 등 여러 기능이 공유함. 동시성·에러 동작이 바뀌면 blast radius가 큼. 사용자가 두 차례(Resource 분석, 캘린더) 모두 "공통 말고 따로 빼서" 분리를 명시적으로 요구함.

**How to apply:**
- 적용 사례: `src/resolver/resourceAnalysis/ResourceWorklogFetcher.js`(`getResourceProjectWorklogs`), `src/resolver/projectCalendar/ProjectCalendarService.js`(`getProjectCalendarWorklogService`).
- 병렬화 패턴: 검색 결과의 `worklog.total`/`worklog.maxResults`로 오프셋을 미리 계산 → `Promise.all` + 공유 `pLimit(5)`로 동시성 상한. 추가 페이지 크기 100.
- 출력 형태는 원본 소비처에 맞춰 유지(캘린더는 full issue/worklog 객체 필요, Resource는 slim 5필드면 충분).
- 신규 리졸버는 `src/index.js`에 `registerXxxController` 등록 필수.

관련: [[project-resource-analysis-perf]]
