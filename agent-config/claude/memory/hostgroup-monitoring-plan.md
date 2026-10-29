---
name: hostgroup-monitoring-plan
description: 호스트 그룹별 모니터링 기능 기획/구현 진행 중 — 안전율 산식 교체 + 그룹 시계열 모니터링
metadata: 
  node_type: memory
  type: project
  originSessionId: 78534fed-b163-4025-ace0-ed7f76fff35f
---

호스트 그룹 상세(`HostGroupDetail`)를 스냅샷 명단에서 **시계열 모니터링 화면**으로 재구성하는 풀스택 기능. 산출물: `_workspace/plan_hostgroup-monitoring.md`(rev.2).

**확정 사항 (2026-06-17):**
- 기존 `safetyPercentage` 산식은 왜곡(분모=활성 problem 건수, 저severity를 정상 집계 → 단조성 붕괴, problem 0건=100% 위양성). **가용성+건강도로 교체** 확정.
  - **가용성(A, 주지표)**: 정상 호스트/전체. KPI 헤더 현재값=host `available` 스냅샷, 트렌드=ping item history.
  - **건강도(B, 보조)**: 호스트별 최고 severity→건강값(OK100/WARN70/AVG40/HIGH20/DISASTER0) 평균. dead host=0 바닥 처리(A·B 통일).
  - 레거시 목록/상세 카드도 현행 유지 금지(A 교체 또는 C=분모를 호스트로 최소교정).
- 화면: KPI 헤더 + 기간 컨트롤(basic-chart-period 12h/1d/7d/Custom 재사용) + 5탭(리소스추이/위험호스트Top-N/알람추이/가용성·건강도추이/호스트목록).
- 구현 순서: **Phase 0(헤더 골격+지표 재정의) + A(리소스 추이)** 착수 → B(가용성·건강도 추이) → C(알람 추이) → D(Top-N).

**Phase 0+A 완료(2026-06-17)**: BE 양쪽(Nest+Spring)·FE 구현, 빌드/단위테스트/정적QA/런타임 E2E 통과. 산출물 `_workspace/contract_·qa_·e2e_hostgroup-monitoring.md`.
- 검증 중 버그 2건 잡아 수정: ① `useGroupResourceTrend` 응답 이중 언랩(→[[fe-usedmovequery-unwrap]]), ② Host List 탭이 default로 리셋(uncontrolled `<Tabs defaultActiveKey>` + `useQueryParams.stringParams`의 period→from/to 재계산이 리마운트 유발). ②수정: 탭을 URL 쿼리파라미터(`QueryParamKeys.TAB`)로 제어 + device-type 쿼리를 host-list 탭에서만 enabled. **교훈: 이 코드베이스는 기간 필터가 있는 화면의 탭/뷰를 uncontrolled antd Tabs가 아니라 URL로 구동해야 함(DetailLayout의 `<Outlet>` 패턴).**
- 미완(후속): traffic 시계열은 group=2에서 데이터 부재(net.if bytes item 없음, 비차단). NestJS 런타임 스모크 미수행(:3000은 Spring 기동분). 레거시 카드뷰 안전율→가용성 표기 교체 미착수.

**Phase D + UI 조정 완료(2026-06-17)**:
- 목록 페이지: 카드뷰 토글 숨김, 테이블 단독(HostGroup.tsx). 상세: 중복 그룹명 Title 제거 + 기간필터를 KPI 아래로. KPI CountUp 제거(탭 전환 시 0부터 재카운트 거슬림) → 정적 숫자. 가용성/건강도 라벨에 ⓘ 툴팁 설명 추가.
- **Phase D — Top Risk Hosts 탭(②)**: `GET /hosts/:groupid/top-hosts`(양쪽) → 호스트별 상태 표(HostStatusDto: hostid/name/available/status('OK'+severity 문자열union)/healthValue/activeAlarmCount). 기본 정렬 health ASC(위험순). FE `HostGroupTopHosts.tsx`, 기간 비의존(offset/limit/sortBy/sortDirection만). E2E 확인(40 호스트, 상태/가용성 배지, 위험순). BE 테스트 Nest27+Spring19, FE jest 9 suites/92 통과.

**리소스추이 개편 + 기간필터 + 증상진단(2026-06-18)**:
- 리소스추이(탭①)를 **그룹 집계 단일라인 → 호스트별 시리즈 배열(선택 agg 기준 상위 10개 호스트)** 로 변경(`type`=호스트명). 사유: 그룹 평균이 호스트 피크를 평탄화. `RESOURCE_TREND_TOP_N=10`. 양쪽+FE+계약§2 갱신.
- **증상① "리소스추이 차트 안 나옴" 근인 확정**: 기본 진입 기간이 1시간(`ONE_HOUR`)인데 BE가 `trend.get`(시간당 집계)만 써서 1시간 창엔 버킷 0개 → 빈 차트. history fallback 없음. → 호스트그룹 상세 전용 `HOST_GROUP_TIME_FILTER_OPTIONS`(12h/1d/7d, 1시간 제거) + RangeDatePicker `defaultPeriod` prop 추가(기본 12h). 산출물 `_workspace/features/infra/hostgroup-and-reports/review_hostgroup-detail.md`.
- 호스트목록 깜빡임 추가수정: `useQueryParams`의 `now`를 `startOf("minute")` 분 정규화(쿼리키 안정화) + device-type `enabled`에 기간 가드.

**Phase C(알림추이)+B(가용성추이) 완료(2026-06-18)**:
- **알림추이(탭③)** `GET /hosts/:groupid/alert-trend`: event.get 생성이벤트(object=0,value=1) severity별·타임버킷별 집계 → `{buckets:[{timestamp,severity6필드}],totals}`. 버킷 적응형(≤1일1h/≤7일6h/그외1일). FE severity별 **스택 막대**(totals>0만). `HostGroupAlertTrend.tsx`.
- **가용성추이(탭④)** `GET /hosts/:groupid/health-trend`: ping item(icmpping/agent.ping) history.get → 버킷별 가용호스트 비율(ping평균≥0.5 up / ping보유호스트) → `{data:[{timestamp,availability}],availabilityAvg,availabilityMin}`. **건강도(healthScore) 라인은 보류(B-2, 활성problem 재구성 비용 큼)**. FE 가용성% 단일라인+avg/min 요약. `HostGroupHealthTrend.tsx`.
- 양쪽(Nest+Spring)+FE+계약§2-B/2-C. 이제 5탭 전부 구현됨(comingSoonPane 제거).

**리뷰 반영 + 런타임 검증 완료(2026-06-18)**:
- 알림추이 ①드릴다운: alert-trend 응답에 `events`(eventid/clock/severity/name/hostName) — 차트+하단 목록 테이블, 행→`/event-alert/problem/:id`. ②성능: event.get을 **집계용(host조인X)+목록용(최근100건+selectHosts, 서버정렬)** 2회 분리(전체이벤트 selectHosts가 느림 주범). ③버킷 `≤1일1h/그외1일`(7일=일별) + `getXAxisData` 공통개선(구간>1일이면 중간라벨 MM-DD). ④`useHandelChartAction` 막대 보정(barMaxWidth 40 + bar는 boundaryGap true). ⑤리소스추이 Top10 안내 tooltip. ⑥HostDetailModal `useForm not connected` 경고 가드.
- **런타임 검증(Spring bootRun 재기동, group2 7일)**: alert buckets 8일별+events 11목록+막대/날짜축 정상, health dataLen8 avg45.5%, resource top10 6시리즈. 전부 200. 콘솔500은 /assets 선재(범위밖).
- **가용성/건강도 추이의 설득력 보강은 사용자 지시로 보류**(건강도 라인 미구현).

**성능/버그/UX 마무리(2026-06-18 오후)**:
- **호스트 그룹 목록 6.4s→269ms**: `getHostGroup`이 전체 그룹마다 host.get+problem.get(2N회)였음. 목록 화면이 problem 산출물(안전율/알람/statusCounts) 미사용 → **problem.get 통째 제거 + host.get 전체 그룹 1회(selectGroups+분배)**(2N→1). 안전율/알람은 응답 shape 기본값(100/0). 6/4 보류한 P1 N+1을 Redis 없이 근본 해결(`p1-perf.patch` 폐기). Nest+Spring.
- **알림추이 조회 느림**: alert-trend event.get의 selectHosts를 전체 이벤트에 걸어 느림 → 집계용/목록용(최근100건+selectHosts) 2회 분리.
- **알림추이 테이블 무한로딩 버그**: DmoveTable에 loading prop 미전달 시 `loading={{spinning:undefined}}` → antd Spin이 undefined를 true로 봄 → 무한스피너. `loading={isLoading}`+`hasQuery={false}`로 해결.
- **알림추이 7일 고정 + 폴링 제거**: 상단 공유기간 무관 항상 7일, useMemo([]) 마운트1회(usePeriodTimes period=3분폴링 의도적 미사용).
- **전 탭 3분 폴링 제거**: usePeriodTimes에 `enablePolling`(기본 true, 전역무영향) 옵션 추가 → 리소스추이·가용성추이에서 false. 이제 그룹 상세 탭은 기간/metric/agg 변경 시에만 재조회(자동 폴링 없음). 호스트목록·KPI는 원래 폴링 없음.
- **HostDetailModal useForm 경고**: destroyOnHidden+Show 안 Form인데 닫힘/로딩 중 setFieldsValue 호출 → if(!isOpen||isLoading) return 가드.
- 경험 기록: 옵시디언 [[2026-06-18-monitoring-tabs-perf-review]]. 남은 후속: 건강도 추이 라인, 레거시 카드 안전율 표기 교체, addonAfter deprecated 경고 정리.

**리뷰 반영(2026-06-18)**: ①알림추이에 **하단 알림 목록**(차트+테이블) 추가 — alert-trend 응답에 `events`(eventid/clock/severity/name/hostName, 최신순 최대100) 포함, 행→`/event-alert/problem/:id` 링크. ②긴 기간 차트: 버킷 `≤1일 1시간/그외 1일`로 변경(7일=일별) + `getXAxisData` 공통 개선(구간 1일 초과면 중간 라벨 `MM-DD`). ③리소스추이 Top10 제한을 DmoveChart tooltip으로 안내. **가용성/건강도 추이는 사용자 지시로 보류(설득력 보강 미착수)**. 검증: Nest jest 42·Spring green·FE jest 31·빌드 3종 성공. 런타임 여전히 미검증(BE 재기동 필요).

**가용성·건강도 추이 탭(④) 완전 제거(2026-06-22, 사용자 지시)**: 설득력 부족으로 계속 보류 상태였던 가용성추이 탭을 양쪽 다 삭제. 이제 **4탭**(리소스추이/Top-N/알림추이/호스트목록).
- **FE**: `HostGroupDetail.tsx`에서 탭 항목·`HEALTH_TREND` 키·import 제거. 삭제 파일 `HostGroupHealthTrend.tsx`·`hooks/chart/useGroupHealthTrend.ts`·`__tests__/useGroupHealthTrend.test.tsx`. 잔여 정리: `host-monitoring.api.ts`(getGroupHealthTrend), `types/host-monitoring.ts`(THealthTrend/THealthTrendPoint), `queryKey.ts`(HEALTH_TREND), en/kr.json(tab.health_trend).
- **추가 UX**: 호스트그룹 상세의 `<Tabs>`를 `ConfigProvider`(`Tabs.colorBorderSecondary: COLOR.borderColor`)로 감싸 탭 하단 구분선을 전역테마 연파랑(COLOR.100)→회색으로 변경(서버 모니터링 상세와 동일 패턴).
- **BE 양쪽 삭제**(사용자 결정 "양쪽 다 삭제"): Nest `GET /hosts/:groupid/health-trend` 컨트롤러·`getGroupHealthTrend` 서비스·`health-trend.dto.ts`·spec 블록·상수(PING_ITEM_KEYS/PING_UP_THRESHOLD/HEALTH_TREND_CACHE_TTL) 제거. Spring 동일(HostController/HostService 메서드+상수, HealthTrendPointDto/HealthTrendResDto, 테스트 3건). ⚠️ Spring `ICMP_PING_ITEM_KEY`/`ICMP_PING_ALIVE_VALUE`는 Top-N의 getIcmpHealthByHost 전용이라 **보존**.
- 검증: FE tsc+lint 통과, Nest tsc+host.service.spec 46 통과, Spring compileJava/TestJava+HostGroupMonitoringTest 통과.

별도 진행 중인 [[custom-dashboard-plan]]과는 분리된 기능.
