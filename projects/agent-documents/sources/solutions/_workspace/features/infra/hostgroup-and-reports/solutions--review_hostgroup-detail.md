# 재검토 — 호스트 그룹 상세 페이지 (로직·설계·성능)

> 검토자: 오케스트레이터(직접 소스 정독) · 검토일: 2026-06-18 · 방식: 정적 코드 분석
> 대상: `moveseyee_fe/src/pages/monitoring/host-group/*` + 관련 훅/서비스 + `moveseye-be` 컨트롤러
> 사용자 보고 증상 3건: ①리소스추이 차트 미표시 ②알림추이·가용성/건강도추이 조회 지연 ③호스트목록 더블렌더 깜빡임

---

## 0. ⚠️ 최우선: 소스 ↔ 사용자 실행환경 괴리

사용자는 **"알림추이 및 가용성/건강도 추이가 조회 시 너무 느리다"**고 보고했다. 그러나 **현재 디스크 소스에는 이 두 탭이 구현되어 있지 않다.**

- `HostGroupDetail.tsx:186-195` — `alert-trend`, `health-trend` 탭은 `comingSoonPane`(= `<Empty description="준비 중"/>`) **placeholder**.
- 관련 컴포넌트/훅 부재: `grep alert-trend|health-trend|availability-trend` → locales 라벨과 placeholder뿐, 데이터 조회 코드 0건.
- BE 미존재: `host.controller.ts`의 `:groupid` 라우트는 `resource-trend` / `top-hosts` / `:groupid`(상세) **3개뿐.** alarm/health trend 엔드포인트 없음.
- 계약 문서도 일치: `features/infra/hostgroup-and-reports/contract_hostgroup-monitoring.md §주의2` — "탭④ 시계열(가용성/건강도 추이)은 이번 범위 아님(ping history 기반, Phase B)".

**결론:** 사용자가 "느리다"고 본 화면은 이 소스에서 나올 수 없다. 즉 (a) 사용자가 보는 빌드가 이 소스보다 최신(미반영 작업본)이거나, (b) 다른 브랜치/환경, (c) 다른 화면(개별 호스트 상세 등)과 혼동 중이다. **이 괴리를 먼저 해소하지 않으면 ②번 증상은 이 소스로 진단·재현 불가.**

---

## 1. 구성요소별 설명 (각 항목이 무엇을 하는가)

### 1-A. `HostGroupDetail` (컨테이너) — `HostGroupDetail.tsx`
- 그룹 상세의 셸. KPI 헤더 + 공유 기간 컨트롤(RangeDatePicker) + 5탭 컨테이너 + 호스트 상세 모달.
- `getHostGroupDetail(id)`로 그룹 요약(availability/healthScore/totalHosts/alerts) 조회 → KPI 헤더에 전달.
- 활성 탭을 **URL 쿼리파라미터 `tab`으로 제어**(`activeKey={activeTab}`). 이전 QA에서 잡은 uncontrolled Tabs 리마운트 리셋 버그의 수정분이 반영돼 있음.
- 탭⑤(호스트목록) 전용으로 `getDeviceType`(디바이스 타입별 호스트 테이블)을 조회하되 `enabled: activeTab === HOST_LIST`로 지연 로딩.

### 1-B. `HostGroupKpiHeader` — KPI 4지표
- 가용성(주, %), 건강도(보조, /100 + 양호/주의/위험 등급 태그·색), 총 호스트 수, 활성 알람 수.
- 건강도 등급 분기 `getHealthGrade`: ≥80 양호 / ≥50 주의 / 그외 위험.
- 활성 알람 = `alerts.warning + alerts.critical`.
- 데이터 의존: 부모의 `detail`만 받음(자체 조회 없음). 깔끔.

### 1-C. `HostGroupResourceTrend` + `useGroupResourceTrend` — 탭① 리소스 추이
- metric(cpu|memory|disk|traffic) / agg(avg|max) Segmented 토글 → 라인 차트.
- 기간은 `usePeriodTimes()`로 URL period/from/to 공유. 응답 `{type, data:[{timestamp,value}]}`를 `TMonitorChart[]`로 감싸 `useHandelChartAction`에 전달.

### 1-D. `HostGroupTopHosts` — 탭② Top Risk Hosts
- 그룹 내 호스트별 현재 상태표(이름/상태/가용성/건강값/활성알람). 정렬·페이지네이션 서버사이드(URL 파라미터).
- 기간(from/to)에 의존하지 않음(현재 시점 스냅샷). 설계 적절.

### 1-E. 탭③④ — placeholder (위 §0 참조)

### 1-F. 탭⑤ 호스트목록 — `getDeviceType` 테이블
- 디바이스 타입별 호스트 수/이름 목록. 행 클릭 시 호스트 상세 모달.

---

## 2. 증상별 진단

### 증상 ③ 호스트목록 더블렌더/깜빡임 — 🔴 설계 결함 확정 (재현 가능)

**근인: `getDeviceType` 쿼리키가 불안정한 `stringParams` 전체에 묶여 캐시가 거의 재사용되지 않음.**

```
HostGroupDetail.tsx:66  queryKey: [DEVICE_TYPE_LIST, stringParams, id]
```

`stringParams` 생성(`useQueryParams.tsx:36-41`):
```
searchParams.toString()  // ← period/from/to/tab/sortBy/offset/limit/sortDirection 전부 포함
  .replace(REPLACE_PERIOD, `from=${fromParam}&to=${toParam}`)
```
그리고 `fromParam/toParam`(`useQueryParams.tsx:14-18`):
```
const now = dayjs().unix();   // ← 초 단위 raw. 분/초 정규화 없음
```

두 가지 문제가 겹친다:

1. **`now` 비정규화** — `dayjs().unix()`는 초 단위 원값. 반면 차트가 쓰는 `usePeriodTimes`는 `startOf("minute")`로 분 정규화(`usePeriodTimes.ts:25-30`). 둘이 **서로 다른 기간 계산**을 한다. `now`는 `useMemo([periodParams])`로 메모되지만, 컴포넌트 인스턴스가 리마운트되거나 다른 useQueryParams 소비처에서 다른 타이밍에 계산되면 값이 달라진다 → device-type 쿼리키의 `to=...`가 흔들림 → **stale 판정 → refetch**.

2. **UI 파라미터 오염** — `stringParams`는 `tab`, `sortBy`, `offset`, `limit`, `sortDirection`까지 전부 포함한다. 탭을 전환하면(`tab=` 변경) device-type 쿼리키가 바뀌고, Top Risk Hosts 탭이 URL에 남긴 `sortBy/offset`도 키에 섞인다. → host-list로 (재)진입할 때마다 **다른 키 → 새 fetch → loading 스피너 → 데이터**의 깜빡임.

**관찰된 더블렌더 메커니즘:** host-list 탭 진입 → `enabled` false→true 전환으로 첫 fetch(로딩) → 이전 e2e에서도 기록된 "device-type가 새 now로 N초 차 재요청"처럼, 키가 stale이라 캐시 히트 없이 매번 fresh fetch가 일어나 테이블이 비었다가 채워진다. 이전 QA는 Tabs 리마운트(uncontrolled)만 고쳤고 **쿼리키 불안정성은 그대로 남아 있다.**

**권장 수정:**
- device-type 쿼리키에서 `stringParams`(전체 문자열)를 제거하고, **정규화된 from/to(분 단위) + 필요한 정렬/페이지 파라미터만 명시 추출**해 키를 구성. `tab`은 데이터와 무관하므로 키에서 제외.
- 또는 `useQueryParams`의 `now`를 `startOf("minute")`로 정규화해 `usePeriodTimes`와 통일(전역 영향 있으니 영향범위 점검 필요).
- 근본적으로 `stringParams`는 "URL 직렬화"용이지 "쿼리키"용이 아니다. 쿼리키는 의미 있는 의존값만 담아야 한다.

### 증상 ① 리소스추이 차트 미표시 — 🟡 정적 코드는 일관, 런타임/데이터 또는 환경 괴리

- 언랩 깊이는 정합: `useDmoveQuery`는 **2겹 언랩**(axios 인터셉터가 ApiResult body 1겹 + `useDmoveQuery.ts:22-27`이 `envelope.data` 1겹) → 소비처 `data`가 이미 payload `{type,data}`. `useGroupResourceTrend.ts:67-77`의 `const payload = data; payload.data.map(...)`는 이 전제와 **일치**(이전 클로즈드 루프 #2에서 확정·빌드/테스트 통과한 형태).
- 기간 초기화도 정상: `RangeDatePicker`가 마운트 시 period 없으면 `ONE_HOUR` 자동 세팅(`RangeDatePicker/index.tsx:143-161`) → `dateRange` 채워짐 → `enabled` 충족.
- `DmoveChart`는 `series`가 비면 `Empty(no_data)` 렌더(`DmoveChart.tsx:110,119`). 즉 "차트 없음"="시리즈 빈 상태".

→ **정적으론 깨질 지점이 없다.** 빈 시리즈의 원인은 (a) BE가 `data:[]` 반환(데이터 부재 — 이전 e2e에서 group=2의 traffic이 실제로 빈 데이터였음), 또는 (b) §0의 환경 괴리(사용자 빌드 ≠ 소스). **런타임 확인 없이는 단정 불가.** 단, 사용자가 "전 metric에서 안 나온다"면 단순 데이터 부재보다 환경/BE 회귀 가능성이 높다 → 런타임 검증 필요.

### 증상 ② 알림추이·가용성/건강도추이 지연 — ⛔ 이 소스에 미구현 (§0)

이 소스 기준 두 탭은 placeholder라 조회 자체가 없다. 성능 진단은 **실제 동작하는 코드(사용자 환경)를 확보한 뒤**에만 가능. 추정 성능 리스크(만약 Phase B로 구현 시): ping history / 시계열 집계는 호스트 수 × 버킷 수에 비례 → trend.get 캐싱·버킷 사전집계 없이는 느려질 수 있음(현 resource-trend는 Redis 60초 캐시 보유, 신규 추이탭도 동일 패턴 필요).

---

## 3. 전반 설계/성능 추가 소견

| # | 위치 | 소견 | 심각도 |
|---|------|------|--------|
| 1 | `useQueryParams.tsx:14-18` | `now` 분/초 비정규화 → 쿼리키 불안정의 뿌리. `usePeriodTimes`와 정규화 정책 불일치 | 🔴 높음 |
| 2 | `HostGroupDetail.tsx:66` | device-type 쿼리키에 `stringParams` 전체(tab/sort 포함) → 과도 캐시 분기·refetch | 🔴 높음 |
| 3 | `useQueryParams.tsx:20-22` | `params` 객체 매 렌더 재생성(useMemo 없음) → 소비처 참조 불안정(현재는 primitive 추출이라 영향 작음) | 🟡 중 |
| 4 | `HostGroupResourceTrend.tsx:30-31` | metric/agg가 로컬 useState → 탭 언마운트/리마운트 시 토글 선택 리셋(antd Tabs lazy children). 기간은 URL로 보존되나 metric은 휘발 | 🟡 중 |
| 5 | `HostGroupTopHosts.tsx:65-66` | `params`에서 offset/limit/sortBy를 직접 읽음 — 다른 탭과 URL 파라미터 네임스페이스 공유. §2③ 오염 문제와 동근원(탭별 파라미터 분리 또는 키 격리 검토) | 🟡 중 |
| 6 | BE `top-hosts` (계약 D.6) | "전체 집계→정렬→slice" + 전체 호스트 problem.get. 그룹 호스트 수 많으면 페이지네이션 효과 제한적, 매 요청 풀스캔 | 🟡 중(런타임 확인) |

---

## 4. 권장 다음 단계

1. **(차단 해소) §0 괴리 확인** — 사용자가 보는 화면의 출처(빌드 브랜치/배포본) 확인. alert/health trend 구현 코드가 별도로 존재하면 그 위치를 받아 재검토 범위에 포함.
2. **증상③ 수정** — device-type 쿼리키를 정규화 from/to + 명시 파라미터로 재구성, `tab` 제외. (정적으로 확정된 결함, 즉시 수정 가능)
3. **증상① 런타임 검증** — 앱 기동 후 resource-trend 응답 body 실측(`data` 배열 길이). 빈 배열이면 BE/데이터, 값이 있는데 미표시면 FE 회귀. (functional-qa / 실 BE 인프라 필요)
4. **증상② 보류** — 구현 코드 확보 후 성능 프로파일.

---

## 5. 적용한 수정 (2026-06-18, 증상③)

사용자 결정: "소스 그대로 진행" + "증상③ 지금 수정".

| 파일 | 변경 | 효과 |
|------|------|------|
| `src/hooks/useQueryParams.tsx:14-21` | `now`/`from`을 `dayjs().startOf("minute")`로 분 정규화(기존 초 단위 raw) | stringParams 기반 쿼리키·전송값이 분 경계로 안정화 → 리렌더/리마운트 시 device-type 반복 refetch 제거. 차트의 `usePeriodTimes`와 기간 정책 통일 |
| `src/pages/.../HostGroupDetail.tsx` device-type `enabled` | `period` 또는 `from+to`가 URL에 있을 때만 조회하도록 가드 추가 | RangeDatePicker 기본 기간 세팅 전 선행 fetch → 직후 재요청되던 더블 fetch(깜빡임) 제거 |

검증: `npm run build`(tsc+vite) **성공**(4558 modules, 타입에러 0) · `npx jest HostGroup useQueryParams` **4 suites / 24 tests 통과**(회귀 없음).

> 잔여(부차): device-type 쿼리키가 여전히 `stringParams` 전체(`tab` 등 UI 파라미터 포함)에 묶임 — now 정규화로 영향은 크게 줄었으나, 완전 격리하려면 쿼리키를 의미값(정규화 from/to + 정렬/페이지)만으로 재구성하는 후속 정리 권장.

---

## 6. 증상① 런타임 실측 (2026-06-18)

> 방식: 실앱(FE :5173 / BE :3000) Playwright 프로브 — resource-trend **응답 body** + 화면 canvas/empty 동시 캡처. 산출: `e2e_hg_trend_probe.cjs`, `e2e_hg_trend_probe_result.json`, `probe-01-cpu.png`.
> 대상: group=2(Linux servers), period=86400(1일).

| metric | HTTP | apiStatus | payloadType | `data` 길이 | 화면 |
|--------|------|-----------|-------------|-----------|------|
| cpu | 200 | success | cpu | **23** | canvas=1 (정상 렌더) |
| memory | 200 | success | memory | **23** | canvas=1 (정상 렌더) |
| disk | 200 | success | disk | **23** | canvas=1 (정상 렌더) |
| traffic | 200 | success | traffic | **0** | empty=1 (데이터 부재 → Empty) |

- 응답 깊이 정합 실증: 프로브가 body `.data`에서 `{type, data:[...]}`를 정상 추출(payloadType/dataIsArray=true). `useGroupResourceTrend`의 2겹 언랩 전제가 실제와 일치.
- 콘솔 에러 5건: 500×4 = `/assets` 미구현(선재·범위 밖), `useForm` 경고×1(무관). **resource-trend 호출은 전부 200.**

초기 실측(period=86400) 기준 cpu/memory/disk는 정상 렌더, traffic만 데이터 부재. **단, 기본 진입 기간으로 재현하니 결론이 바뀐다(아래 §7).**

---

## 7. 증상① 근인 확정 — 기본 1시간 기간 + trend.get only = 전 metric 빈 차트 🔴

> 추가 실측(2026-06-18): 동일 프로브를 `period=3600`(1시간 = 기본 진입값)으로 재실행.

| 기간 | cpu | memory | disk | traffic |
|------|-----|--------|------|---------|
| 3600(1시간, **기본 진입값**) | data **0** / 빈 차트 | **0** / 빈 차트 | **0** / 빈 차트 | 0 / 빈 차트 |
| 86400(1일) | 23 / 렌더 | 23 / 렌더 | 23 / 렌더 | 0(부재) |

**근인:** 호스트 그룹 상세 진입 시 `RangeDatePicker`가 기본 기간을 **`ONE_HOUR=3600`**(`constants/options.ts:12`, `index.tsx:151`)으로 세팅한다. 그런데 BE `getGroupResourceTrend`는 **`trend.get`(시간당 집계)만 사용**하고 history fallback이 없다(`host.service.ts:2409`, 계약 §5.4에 기 문서화). Zabbix trend는 시간당 1포인트로 집계되고 진행 중인 시간은 아직 집계 전이라, **1시간 창에는 버킷이 거의 0개 → 모든 metric이 빈 차트.**

즉 사용자의 "리소스추이 차트가 안 나온다"는 **환경 괴리가 아니라 기본값 조합 결함**이다. 기간을 1일/7일로 바꾸면 정상 렌더된다(위 표).

**권장 수정(택1·택2):**
1. (간단) 리소스추이/그룹 상세의 **기본 기간을 1시간 → 1일(또는 12시간)** 로 상향. trend가 시간당 집계라 최소 수 시간 창이어야 의미 있는 라인이 나온다.
2. (근본) BE에 **history fallback** 추가 — trend 미집계 구간(짧은 기간)은 `history.get`으로 보완(계약 §5.4 후속 항목).
3. (보강) 빈 차트일 때 "선택 기간에 집계 데이터가 없습니다 — 더 긴 기간을 선택하세요" 안내로 데이터 부재와 버그를 구분.

> 참고: 이 근인은 §6의 "환경 괴리/데이터 부재" 추정을 **정정**한다. 코드상 기본값+집계소스 조합에서 결정적으로 재현된다.
