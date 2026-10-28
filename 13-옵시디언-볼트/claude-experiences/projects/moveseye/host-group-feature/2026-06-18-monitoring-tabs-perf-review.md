---
type: project
tags: [project, moveseye, host-group, monitoring, performance, charts, review]
created: 2026-06-18
updated: 2026-06-18
status: done
---

# 2026-06-18 — 호스트 그룹 모니터링: 시계열 탭 완성 + 리뷰 반영 + 성능

> 상위: [[host-group-feature/README|호스트그룹 작업 README]] · [[moveseye]]
> 메모리 동기화: `hostgroup-monitoring-plan` · 산출물: `C:\solutions\_workspace\*hostgroup*`, `review_hostgroup-detail.md`

호스트 그룹 상세(`HostGroupDetail`)의 **재검토 → 미구현 탭 구현 → 리뷰 반영 → 성능/버그 수정 → 런타임 검증**을 한 세션에 처리. BE는 NestJS + Spring 양쪽 병행, FE는 React19. 검증은 Spring `bootRun`(.env 주입) 재기동 + Playwright 프로브.

## 한 일 (순서대로)

### 1. 상세 페이지 재검토 + 증상 진단 (`review_hostgroup-detail.md`)
- **호스트목록 탭 깜빡임** 🔴: `useQueryParams.stringParams`의 `now`가 `dayjs().unix()`(초단위 raw)라 리렌더마다 device-type 쿼리키가 흔들려 반복 refetch. → `now`를 `startOf("minute")` 분 정규화(차트의 usePeriodTimes와 통일) + device-type `enabled`에 기간 가드.
- **리소스추이 차트 안 나옴** 🔴: 근인은 **기본 진입 기간 1시간 + BE가 `trend.get`(시간당 집계)만 사용(history fallback 없음)** → 1시간 창엔 버킷 0개 → 빈 차트. 프로브로 period=3600(빈) vs 86400(23포인트) 대조 실증. → 그룹 상세 전용 기간옵션(1시간 제거, 12h/1d/7d) + RangeDatePicker `defaultPeriod` prop(기본 12h).

### 2. 리소스추이 Top10 호스트별 개편
그룹 평균 단일라인 → **호스트별 시리즈 배열(선택 agg 기준 상위 10)**. `type`=호스트명. 응답 단일객체→배열. `RESOURCE_TREND_TOP_N=10`. 사유: 그룹 평균이 호스트 피크를 평탄화해 "어느 호스트가 위험한가"가 안 보임.

### 3. 미구현 2탭 신규 (기획 §5 탭③④)
- **알림추이** `GET /hosts/:groupid/alert-trend`: event.get 생성이벤트(object=0,value=1) severity별·타임버킷별 → `{buckets, totals, events}`. FE severity 스택막대 + **하단 알림 목록 테이블**(발생시각/호스트/severity/이름, 행→`/event-alert/problem/:id`).
- **가용성추이** `GET /hosts/:groupid/health-trend`: ping item(icmpping/agent.ping) history → 버킷별 가용 호스트 비율(%). **건강도(healthScore) 라인은 사용자 지시로 보류**(버킷별 활성 problem 재구성 비용 큼).

### 4. 리뷰 반영
- 알림추이 **드릴다운 목록**(위 events) — "어떤 알림이 발생했는지" + 상세 링크.
- **긴 기간 차트 일별화**: 버킷 `≤1일 1시간/그외 1일`(7일=7버킷) + `getXAxisData` 공통 개선(구간>1일이면 중간 라벨 `MM-DD`).
- **막대 차트 형태**: `useHandelChartAction`에 `barMaxWidth:40` + 막대일 때 `xAxis.boundaryGap:true`(칸 중앙).
- 리소스추이 Top10 제한 tooltip 안내.

### 5. 성능 🚀
- **호스트 그룹 목록 6.4초 → 269ms** (24배): `getHostGroup`이 전체 그룹마다 `host.get`+`problem.get`(2N회) 호출하던 것을, **목록 화면이 problem 산출물(안전율/알람/statusCounts)을 안 쓴다**는 사실에 근거해 `problem.get` 통째 제거 + `host.get`을 전체 그룹 1회(`selectGroups` + 그룹 분배)로 묶음(2N→1). **6/4에 보류했던 P1 N+1을 Redis 없이 근본 해결.**
- **알림추이 조회 느림**: alert-trend의 `event.get`에 `selectHosts`를 전체 이벤트에 걸어 느림 → 집계용(host조인X)/목록용(최근100건+selectHosts, 서버정렬) **2회 분리**.
- **알림추이 7일 고정 + 폴링 제거**: 상단 공유기간 무관 항상 7일, `useMemo([])`로 마운트 1회 계산(usePeriodTimes의 period=3분 폴링 의도적 미사용).

### 6. 버그 수정
- **알림추이 테이블 무한 로딩** 🔴: `DmoveTable`에 `loading` prop 미전달 시 `loading={{spinning: undefined}}` → **antd `Spin`은 spinning=undefined를 true로 간주** → 무한 스피너. `loading={isLoading}` + `hasQuery={false}`로 해결.
- **HostDetailModal `useForm not connected` 경고**: `destroyOnHidden` Modal + `<Show when={!isLoading}>` 안에서만 Form 마운트인데 useEffect가 닫힘/로딩 중에도 `setFieldsValue` 호출 → `if(!isOpen||isLoading) return` 가드.

## 검증 (Spring bootRun 재기동, group2)
- 목록: `/hosts/hostgroups` 269ms (이전 6424ms)
- 알림추이: buckets 8(일별)·events 11·막대/날짜축 정상·테이블 spinning=0/10행
- 가용성: dataLen 8·avg 45.5%
- 리소스: 호스트별 6시리즈(Top10 이내)
- Nest jest 42 / Spring test green / FE jest / 빌드 3종 성공

## 교훈
1. **"이 집계가 화면에서 실제로 쓰이나"를 먼저 물어라.** 목록 N+1의 최선해는 캐싱·일괄조회 이전에 *불필요한 problem.get 자체를 제거*하는 것이었다. (6/4 P1 보류를 우회·해결)
2. **antd `Spin`은 `spinning=undefined`를 true로 본다** → 래퍼 테이블에 `loading` prop 누락 시 무한 로딩. 프로브의 행 카운트만으론 못 잡고(데이터 위 오버레이), 스크린샷·`.ant-spin-spinning` 카운트로 확인. ([[2026-06-04-table-view-feature]]의 scroll y:0 함정과 같은 류 — "DOM엔 있는데 화면이 다름")
3. **시계열 차트는 데이터 소스의 집계 단위 = 기본 기간이 맞아야 한다.** trend.get(시간당)만 쓰는데 기본 1시간이면 항상 빈 차트. 기본 기간을 집계 단위 이상으로.
4. **`usePeriodTimes`는 `period`를 주면 3분 폴링이 켜진다**(setInterval THREE_MINUTES). 실시간성 낮은 탭(알림추이)은 `useMemo([])` 고정으로 폴링 차단.
5. 막대 차트는 `boundaryGap:true`(칸 중앙) + `barMaxWidth`(과폭 방지)가 기본 매너. 공통 `useHandelChartAction`은 라인 전제라 chartType 분기 필요.

## 열린 항목
- 가용성/건강도 추이 **건강도 라인**(보류) · 레거시 카드 안전율→가용성 표기 교체 · `addonAfter deprecated` 경고 정리 · traffic 데이터 부재 운영 확인.
