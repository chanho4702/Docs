# E2E — 호스트 그룹별 모니터링 Phase 0+A (런타임 행위 검증)

> 검증자: functional-qa(오케스트레이터 직접 실행) · 검증일: 2026-06-17 · 방식: 실앱 기동 + Playwright 브라우저 E2E
> 환경: FE Vite :5173 / BE :3000(**현재 기동분은 Spring** `moveseye-be-spring`) / 실 Zabbix 7.0.6 연동
> 산출 스크립트: `e2e_hostgroup_runner.cjs`, `e2e_hostgroup_hostlist.cjs`, `e2e_hostgroup_diag.cjs`

---

## 결론: ✅ 통과 (런타임 버그 1건 발견 → 수정 → 재검증 완료)

Phase 0+A의 화면 동작이 실앱에서 정상 작동함을 스크린샷으로 실증. 검증 중 발견한 호스트 목록 탭 버그를 수정·재검증 완료.

---

## 시나리오별 결과

### S1. KPI 헤더 (group=2 "Linux servers") ✅
스크린샷 `e2e-hg-01-group2-kpi-cpu.png`, `e2e-hg-09-hostlist.png`.
- Availability **15.0%**, Health Score **14 / 100 + "Critical" 등급 태그(빨강)**, Total hosts **40**, Active Alarms **42**.
- 0%/100 극단이 아닌 합리적 중간값. BE HTTP 검증치와 일치(alerts critical 다수 → 낮은 건강도). 등급/색 병기 정상.

### S2. 리소스 추이 탭 — metric 토글 ✅ (언랩 버그 수정 실증)
스크린샷 `e2e-hg-02-memory.png`, `e2e-hg-03-disk.png`.
- CPU/Memory/Disk 각각 `canvas=1`로 **차트 실제 렌더**(~15% 영역 라인, 24시간 시계열, x축 06-16 17:00→06-17 15:00).
- metric 전환 시 `resource-trend?metric=cpu|memory|disk` 정확히 재호출. → integration-qa가 잡은 `useGroupResourceTrend` 이중 언랩 수정이 **실화면 차트 렌더로 최종 실증됨**.

### S3. agg 토글(avg/max) ✅
스크린샷 `e2e-hg-04-disk-max.png`. `agg=max`로 재호출, 차트 갱신(`canvas=1`).

### S4. traffic — 빈 상태 안전 렌더 ✅ (데이터 부재, 버그 아님 판정)
스크린샷 `e2e-hg-05-traffic-empty.png`. traffic 선택 시 `canvas=0, empty=1` — **크래시 없이 Empty 렌더**.
- BE가 traffic만 `data:[]` 반환. group=2는 호스트 대부분 `notClassified`(34/40)로 SNMP `net.if.*[bytes]` item이 없는 Linux 서버 위주 → **데이터 부재로 판단**(매칭 버그 아님). cpu/memory/disk는 정상 데이터. 운영 데이터에서 net.if bytes item이 있는 그룹으로 재확인 권장(비차단).

### S5. 탭 전환 ✅
- Top Risk Hosts / Alert Trend / Availability & Health Trend → "준비 중"(Empty placeholder) 정상.
- **Host List → device-type 테이블 정상 렌더**(아래 버그 수정 후): 6행(server 6 / network·security·database·hardware 0 / notClassified 34), 컬럼 No·Device type·Number of host processes·Host name, 호스트명 목록 표시. 스크린샷 `e2e-hg-09-hostlist.png`.

### S6. 빈 그룹(group=20 "Databases", 호스트 0) ✅
스크린샷 `e2e-hg-08-empty-group.png`. Availability **100.0%**, Health Score **100/100 "Good"**, Total hosts **0**, Active Alarms **0**. 차트 빈 상태. 계약 빈그룹 규칙 일치.

### 콘솔/네트워크
- 콘솔 500 에러 4건 관측 → 원인 `GET /assets?...`(자산관리). `/asset`은 미구현 예정 기능이라 Spring 미구현 추정. **Phase 0+A 범위 밖 선재 이슈**(전역 컴포넌트가 호출). 호스트 그룹 기능과 무관.
- `/hosts/...` 호출 실패 0건. resource-trend·device-type 모두 200.

---

## 🐞 발견·수정한 런타임 버그 — Host List 탭이 default로 되돌아감 (fe, 수정 완료)

### 증상
Host List 탭 클릭 시 잠깐 활성화·테이블 렌더(`tableCount=1`) 후 ~500ms 만에 **default 탭("Resource Trend")으로 자동 복귀**. 다른(placeholder) 탭은 정상. disabled 아님, 오버레이 없음, 콘솔 에러 없음.

### 근인
- `HostGroupDetail`의 `<Tabs>`가 **uncontrolled(`defaultActiveKey`)**.
- device-type 쿼리가 `useQueryParams.stringParams`(= `period`를 `from=now-period&to=now`로 매 계산)에 의존 → Host List 활성화 시점에 `HostGroupDetail`이 **리마운트**되며(증거: device-type가 새 now로 6초 차 재요청) uncontrolled Tabs가 default로 리셋.
- 기존 모니터링 상세(`DetailLayout`)는 탭을 **URL/라우터(`<Outlet>`)로 구동**해 이 문제가 없음 — HostGroupDetail만 uncontrolled Tabs라 노출됨.

### 수정 (코드베이스 URL 구동 패턴과 일치)
- `QueryParamKeys.TAB = "tab"` 추가.
- `HostGroupDetail`: `<Tabs activeKey={params.tab ?? "resource-trend"} onChange={updateParams(...)}>`로 **URL 제어 전환**(리마운트에도 선택 보존).
- device-type 쿼리를 `activeTab === "host-list"`에서만 `enabled` → 불필요 refetch 방지 + 지연 로딩.
- 파일: `src/enums/common.ts`, `src/pages/monitoring/host-group/HostGroupDetail.tsx`.

### 재검증 ✅
- `activeTab="Host List"`, `ariaSelected="true"`, 테이블 6행 렌더, `/hosts/` 실패 0.
- `npm run build`(tsc+vite) 성공, `npm test`(jest) **8 suites / 85 tests 통과**(회귀 없음).

---

## 잔여/주의
1. **현재 검증은 Spring 단독 기준**(:3000 기동분). NestJS 런타임은 미기동 — 양쪽 단위테스트는 그린이므로 우선순위 낮음. Nest 런타임 스모크가 필요하면 별도 포트 기동.
2. **traffic 빈 데이터**: group=2 기준 데이터 부재로 판단(비차단). net.if bytes item이 있는 그룹에서 채워지는지 운영 확인 권장.
3. `/assets` 500: 선재·범위 밖.
