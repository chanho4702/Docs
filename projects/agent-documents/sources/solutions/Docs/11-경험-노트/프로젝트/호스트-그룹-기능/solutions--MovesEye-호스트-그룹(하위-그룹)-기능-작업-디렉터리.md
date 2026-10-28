---
type: project
tags: [project, moveseye, host-group, monitoring, workspace, index]
created: 2026-06-04
updated: 2026-06-18
status: active
---

# 📂 MovesEye — 호스트 그룹(하위 그룹) 기능 작업 디렉터리

> 모니터링 탭의 **호스트 그룹 = 하위 그룹** 기능 관련 작업·분석·결정을 모으는 폴더.
> 상위 프로젝트 노트: [[projects/moveseye/moveseye|moveseye]] · 개요: [[projects/moveseye/moveseye-overview|moveseye-overview]]

## 기능 한 줄 정의
Zabbix 평면 호스트 그룹 + 호스트 `device_type` 태그 분류(nested group 미사용).
화면 3종: 그룹 목록(`/monitoring/host-group`) · 그룹 상세(`/host-group/:id`) · 서버/네트워크 필터 진입.

## 기능 변경 이력
- 2026-06-04: **카드/테이블 뷰 스위칭** 추가 — 목록 화면(`/monitoring/host-group`)에 Segmented 스위처(카드↔테이블). `HostGroup.tsx`를 컨테이너로 바꾸고 `HostGroupCardView`(기존 무한스크롤)·`HostGroupTableView`(신규 DmoveTable) 분리. 뷰 상태는 query param `view`. 기존 `getListHostGroups` API 재사용(BE 무변경). **Playwright 런타임 검증 PASS**.
- 2026-06-04: **테이블 카테고리 컬럼 + 정렬 + 검색** 추가 (풀스택) —
  - BE: `SearchObjectDto`에 `sortBy` 추가, `getHostGroup`에 **그룹명 keyword 검색 + 서버사이드 정렬**(전체 집계 후 filter→sort→slice, `getServers` 패턴) 추가.
  - FE: `THostGroupDashboard`에 카테고리 필드 추가(**T1 계약 불일치 해소**), 테이블에 server/network/security/database/hardware/notClassified 6컬럼 + 전 컬럼 정렬(`sorter:true` 서버사이드) + `DmoveTableFilter` 검색.
  - **Playwright 검증 PASS**: 컬럼 9개 렌더, Total hosts 정렬 46↔0 토글, keyword="server" → 7행 필터 확인.
  - 함정: `DmoveTable scroll={{x,y:0}}`의 **`y:0`이 테이블 본문을 높이 0으로 접어 행이 안 보임** → `scroll` prop 제거(기본 `{x:1000}`)로 해결. DOM엔 행이 있어 셀렉터 카운트는 통과하지만 화면엔 안 보이는 류 → 스크린샷 확인이 필수였음.
- 2026-06-18: **시계열 모니터링 탭 완성 + 성능/리뷰** ([[projects/moveseye/host-group-feature/2026-06-18-monitoring-tabs-perf-review|2026-06-18-monitoring-tabs-perf-review]]) — 알림추이(드릴다운 목록+상세링크)·가용성추이(가용성 라인, 건강도 보류) 신규, 리소스추이 Top10 호스트별 개편, 긴 기간 일별 버킷+MM-DD 축, 막대 형태 보정. **성능: 목록 6.4s→269ms**(problem.get 제거+host.get 1회 묶기 — 6/4 P1 N+1 근본 해결), alert-trend selectHosts 분리, 알림추이 7일 고정+폴링 제거. 버그: DmoveTable loading 무한로딩·HostDetailModal useForm 경고. Nest+Spring 병행·런타임 검증 PASS.

## 문서 목록
- [[projects/moveseye/host-group-feature/2026-06-04-host-group-audit|2026-06-04-host-group-audit]] — 풀스택 진단. 버그 4 + 성능/설계 2 + 분류 일관성 4 + 계약 불일치 2.
- [[projects/moveseye/host-group-feature/2026-06-04-detail-and-safety-logic|2026-06-04-detail-and-safety-logic]] — 상세 화면(요약+집계 2API) 동작 + 안전도 계산 로직(정상비율, 3등급↔6등급 이중분류).
- [[projects/moveseye/host-group-feature/2026-06-04-bugfix|2026-06-04-bugfix]] — ✅ 버그 4건 픽스(커밋 663155e). getCategory 동기화·total 정정·statusCounts 키통일·빈Link.
- [[projects/moveseye/host-group-feature/2026-06-04-table-view-feature|2026-06-04-table-view-feature]] — ✅ 카드/테이블 뷰 스위칭 + 테이블 카테고리 6컬럼·서버사이드 정렬·검색. Playwright 검증 PASS. (scroll y:0 함정 교훈)
- [[projects/moveseye/host-group-feature/2026-06-18-monitoring-tabs-perf-review|2026-06-18-monitoring-tabs-perf-review]] — ✅ 시계열 탭 완성·리뷰 반영·성능(목록 6.4s→269ms)·버그 수정. P1 N+1 근본 해결.

## 이슈 상태

**✅ 수정 완료 (2026-06-04, [[projects/moveseye/host-group-feature/2026-06-04-bugfix|픽스 노트]])**
- 🔴 B1 `getCategory` async/await 누락 → 동기 함수로 전환, undefined 방어 추가
- 🔴 B2 상세 테이블 `total` 오참조 → `dataType?.total`로 정정
- 🔴 B3 statusCounts 키 혼재 → 초기 camelCase 객체 제거(대문자 키만), 응답 DTO 타입도 실제 shape으로 정정
- 🟡 B4 빈 `<Link to="">` → 카드 네비게이션 충돌 방지(stopPropagation+preventDefault). ※내부 버튼 전파는 `MonitoringInfoBtn`이 이미 차단 → 오진 정정

**✅ 해결 (2026-06-18, [[projects/moveseye/host-group-feature/2026-06-18-monitoring-tabs-perf-review|2026-06-18-monitoring-tabs-perf-review]])**
- 🟠 P1 목록 N+1 — **근본 해결**(6.4s→269ms). Redis/patch 불필요로 판명: 목록 화면이 problem 산출물을 안 쓰므로 `problem.get` 통째 제거 + `host.get`을 전체 그룹 1회(`selectGroups`+분배)로 묶음(2N→1). 6/4 보류 시 백업했던 `p1-perf.patch`(Redis 일괄조회)는 이제 불필요.

**⏳ 미해결**
- 🟡 C1~C4 분류 로직 일관성 / 안전도 기준 / 죽은 코드(`getCategoryHost`)
- ~~🔵 T1 `THostGroupDashboard` 필드 누락~~ → ✅ 2026-06-04 테이블 카테고리 컬럼 작업 시 해소
