# 기획서 — 호스트 그룹별 모니터링 (Host Group Monitoring)

> 작성일: 2026-06-17 · 단계: **기획(Plan)** · 산출물: `_workspace/features/infra/hostgroup-and-reports/plan_hostgroup-monitoring.md`
> 대상 화면: `HostGroupDetail` **재구성(대폭 수정 허용)** · 데이터: Zabbix (history/trend/event) + 기존 집계 서비스

> **갱신 (2026-06-17, rev.2)** — 리뷰 반영으로 다음을 확정/수정:
> - §2.3 **건강도(B)** 산식을 "호스트 건강 평균" 형태로 재정의(해석성·[0,100] 경계 확보).
> - §2.3 **A·B의 dead host(데이터 끊긴 호스트) 취급을 명시적으로 통일**(모순 표시 방지).
> - §2.4 **안전율 처리 방향 확정**: 신규 화면 A 주지표 + B 보조 / 레거시 카드는 현행 유지 금지(C 적용 또는 A 교체).
> - §5·§8 **가용성 데이터 출처 확정**: KPI 헤더(현재값)=host `available`, 탭④ 트렌드=ping item history.
> - §7 로드맵: Phase 0 분할(헤더 골격 선표시), 탭④ 내부 분할(가용성 라인 먼저 / 건강도 라인 나중).

---

## 1. 배경 & 문제 정의

호스트 그룹은 Zabbix에서 정의한 **호스트들의 논리적 묶음**이다. 현재 FE는 이 묶음에 대해
**카드뷰 / 테이블뷰 / 상세(명단)** 만 제공한다. 즉 **"한 시점의 집계 스냅샷 + 호스트 명단"** 수준이며,
묶음 단위로 *시간에 따라 어떻게 동작하는지*(모니터링 본연의 관점)를 볼 수 없다.

### 현황 — 이미 제공되는 것

| 구분 | 현재 제공 | 엔드포인트 |
|---|---|---|
| 목록(카드/테이블) | 안전율, 알람 카운트, severity별 statusCounts, 디바이스 타입별 호스트 수, 총 호스트 수 | `GET /hosts/hostgroups` |
| 상세 | 위 요약 + 디바이스 타입별 호스트 목록 + 최근 조회 호스트 + 최근 이벤트 | `GET /hosts/:groupid`, `GET /hosts/device-type/:groupid` |
| 그룹 문제 | 그룹별 문제(이벤트) 요약/상세 | `GET /hosts/hostgroup-problems`, `GET /hosts/hostgroup/problems/:groupid` |
| (개별 호스트) | CPU/MEM/Disk/Network/세션 **시계열 차트 + summary** | `GET /host/:id/{cpu|memory|disk|network}/line-charts`, `.../summary` |

### 갭 — 빠져 있는 "모니터링" 관점

1. **시계열 추이 부재** — 그룹의 건강도/알람/리소스가 시간에 따라 어떻게 변했는지 추세 없음.
2. **그룹 단위 리소스 집계 부재** — 그룹 전체 평균 CPU/MEM/Disk/Traffic 같은 "묶음의 건강도" 지표 없음.
3. **그룹 내 비교/랭킹 부재** — "이 그룹에서 가장 위험한 / 리소스를 많이 쓰는 Top-N 호스트" 식별 불가.
4. **알람 타임라인/추이 부재** — 그룹 이벤트가 언제 몰렸는지 시간축으로 못 봄.

---

## 2. ⚠️ 선결 과제 — "안전율(safetyPercentage)" 산식 재검토

> 사용자 지적: *"안전율 계산이 타당하지 않을 수 있다."* — **맞다.** 시계열화하기 전에 정의부터 바로잡아야 한다.

### 2.1 현재 산식 (host.service.ts:251, 363, 462)

```
calculateAlerts(problems):
  severity 0~1 (NOT_CLASSIFIED, INFORMATION) → normal++
  severity 2   (WARNING)                     → warning++
  severity 3~5 (AVERAGE, HIGH, DISASTER)     → critical++

safetyPercentage = (normal + warning + critical) > 0
                   ? (normal / (normal + warning + critical)) * 100
                   : 100
```

분모는 **"현재 활성 problem 건수"**, 분자는 그중 **severity ≤ 1 인 problem 건수**.

### 2.2 무엇이 타당하지 않은가

| # | 문제 | 반례 |
|---|---|---|
| ① | **분모가 호스트가 아니다.** 그룹의 호스트가 몇 대인지·정상 가동 중인지와 무관. | 호스트 100대 중 99대 멀쩡해도, problem 목록의 severity 분포만 본다. |
| ② | **저severity problem을 "정상"으로 집계 → 단조성 붕괴(monotonicity violation).** problem이 많을수록 오히려 안전율↑ 가능. **단순 부정확이 아니라, "상황이 나빠질수록 숫자가 좋아질 수 있는" 모니터링 지표로서 사용 불가 수준.** | INFO problem 99건 + DISASTER 1건 → normal 99/100 = **99% 안전**. DISASTER 1건만 → **0% 안전**. 더 위험한 쪽이 더 안전해 보임. |
| ③ | **problem 0건 = 100% 안전(위양성).** item 수집이 끊긴 "죽은" 호스트도 problem이 없으니 100%. | 에이전트 다운 → 데이터 없음 → problem 없음 → 100% 안전(실제론 장애). |
| ④ | **시점 스냅샷.** 과거 추이를 그리려면 각 시점의 활성 problem을 재구성해야 함(비용 있음). | — |

> ②는 단순 정확도 문제가 아니라 **현재 카드에 표시되는 숫자가 사용자를 적극적으로 오도**하고 있다는 의미다. 따라서 레거시 카드를 "호환을 위해 현행 유지"하는 선택지는 ②가 살아있는 한 부적절하다(→ §2.4).

### 2.3 대안 정의 (확정 방향)

"안전율" 하나로 뭉뚱그리지 말고 **두 지표로 분리**한다:

- **A. 가용성(Availability) — 주지표(SLA 관점)**
  `정상 가동 호스트 수 / 전체 호스트 수`.
  정상 판정 기준은 Zabbix host `available`(인터페이스 가용) 또는 agent ping item. **죽은 호스트를 위험으로 잡아내** ③ 해결. SLA 관점에 가장 부합.
  - **현재값(KPI 헤더)**: host `available` 스냅샷으로 산출(저비용).
  - **시계열(탭④)**: `agent.ping`/`icmpping` item history로 산출(아래 §2.3.1 참조).

- **B. 건강도(Health Score) — 보조 지표 (재정의)**
  **호스트별 최고 severity를 호스트 건강값으로 매핑한 뒤, 호스트 단위 평균**을 낸다. 자의적 계수(k) 없이 자연스럽게 **[0,100]에 갇히며**, 정의가 "건강도 = 평균 호스트 건강" 한 줄로 설명된다.

  | 호스트의 최고 severity | 건강값 |
  |---|---|
  | OK (problem 없음, 단 **살아있는** 호스트) | 100 |
  | WARNING | 70 |
  | AVERAGE | 40 |
  | HIGH | 20 |
  | DISASTER | 0 |

  `건강도 = mean(호스트별 건강값)` → 항상 0~100. (가중치 표는 운영 합의로 조정 가능하되 단조 감소만 유지.)
  - ①(분모=호스트)·②(severity 가중, 단조성 회복)를 동시에 해결.
  - ~~기존 `100 − Σ(severity_weight)/hostCount × k`~~ 안은 **폐기**: k가 자의적이라 "건강도 87"의 해석이 불가능하고, 가중 합이 커지면 **음수로 발산**해 별도 clamp가 필요했음. 평균 방식은 이 두 문제를 구조적으로 제거.

#### 2.3.1 ⚠️ A·B의 dead host 취급 통일 (필수)
③의 메커니즘 그대로, **데이터가 끊긴 dead host는 problem이 없어 B에서 만점(100)으로 잡힌다.** 그러면 A가 장애로 잡아낸 호스트를 B가 도로 가려서 *"가용성 80% / 건강도 95"* 같은 모순 표시가 난다. 이를 막기 위해 **dead host 취급을 A·B에서 동일하게** 정한다:

- **dead host 정의**: 가용성 판정 기준(host `available` 또는 ping item)에서 **비가용**으로 분류된 호스트.
- **A**: 비가용 호스트는 분자(정상 가동)에서 제외 → 가용성에 반영(기존 의도대로).
- **B**: dead host의 건강값을 **0(바닥)으로 강제**한다. (대안: B의 분모에서 dead host를 제외해 "살아있는 호스트의 평균 건강"으로 정의 — 단 이 경우 헤더에 *"가용 호스트 기준"* 명시 필요.) **기본 채택: dead=0 바닥 처리**(A와 같은 방향으로 움직여 모순 제거가 직관적).
- 결과: 호스트가 죽으면 A↓·B↓가 함께 움직여, 두 지표가 서로를 가리지 않는다.

- **C. (최소 교정안)** 기존 "안전율"을 유지하되 **분모를 호스트로** 바꾼 버전.
  사실상 **B를 레거시 카드에 최소 적용한 형태**(severity 점수화를 호스트 단위로 수행)이며 별개 산식이 아니다. 레거시 화면 호환을 위한 최소 변경 경로로만 의미가 있다.

### 2.4 결정 — 안전율 처리 방향 (확정)

> §8-#1의 미결을 본 절에서 해소한다.

- **신규 모니터링 화면**: **A(가용성) 주지표 + B(건강도) 보조**로 확정. KPI 헤더·탭④에 동일 정의 사용.
- **레거시 목록/상세 카드(`/hosts/hostgroups` 등)**: **현행 유지 금지.** ②(단조성 붕괴)가 사용자를 오도하므로, 다음 중 하나로 교체한다 — (권장) **A(가용성)로 표기 교체**, 또는 최소 **C(분모=호스트로 교정)** 적용. *현재 산식 그대로 두는 선택지는 채택하지 않는다.*
  - 영향 범위: 카드뷰·테이블뷰·상세 상단. 표기 라벨/툴팁 i18n 동반 수정.
- **표기 교체 vs 최소교정(C)의 최종 택일**은 레거시 카드 영향도 점검 후 구현 착수 시 확정(둘 다 ②를 해소하므로 일정·리스크로만 결정).

---

## 3. 목표 & 범위 (확정 사항)

- **모니터링 초점(4개 전부)**: ①그룹 리소스 추이 ②위험 호스트 Top-N ③알람/이벤트 추이 ④가용성/건강도 추이(§2 재정의 반영)
- **화면**: `HostGroupDetail` — **기존 구성을 상당수 수정/재구성해도 무방**(사용자 승인). 보수적 "덧붙이기"가 아니라 모니터링 중심으로 레이아웃을 재설계한다.

### 범위 밖 (Non-Goals)
- 호스트 그룹 CRUD(생성/편집) — 표시 전용.
- 커스텀 위젯/대시보드 빌더(별도 `custom-dashboard` 기획) — 분리.
- 알람 규칙/임계치 설정 — 표시만.

---

## 4. 화면 재설계 — HostGroupDetail

기존: ①상단 요약 카드(안전율/상태/디바이스 카운트) + ②디바이스 타입별 호스트 테이블.
재설계 방향 — **모니터링 헤더(KPI) + 기간 컨트롤 + 탭 콘텐츠** 구조로 전환:

```
┌──────────────────────────────────────────────────────────────────────┐
│  [그룹명]                                          [기간: 12h│1d│7d│Custom]│
│  ┌─────────┐ ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  │가용성 99%│ │건강도 87 │ │호스트 100 │ │활성알람 5 │ │디바이스분포│  ← KPI 헤더(재정의)
│  └─────────┘ └─────────┘ └──────────┘ └──────────┘ └──────────┘        │
├──────────────────────────────────────────────────────────────────────┤
│  탭:  ① 리소스 추이 │ ② 위험 호스트 │ ③ 알람 추이 │ ④ 가용성·건강도 추이 │ ⑤ 호스트 목록 │
├──────────────────────────────────────────────────────────────────────┤
│  (선택된 탭 콘텐츠)                                                     │
└──────────────────────────────────────────────────────────────────────┘
```

- 상단 KPI 헤더: 기존 "안전율" 카드를 **가용성 + 건강도(§2)** 로 교체/분리. 활성 알람·호스트 수 병기.
  - 가용성 KPI = host `available` 스냅샷, 건강도 KPI = §2.3 평균 건강값(현재 활성 problem 기준). 둘 다 dead host는 §2.3.1대로 처리.
  - **건강도 표기 보조**: 단일 숫자는 해석이 어려우므로 색/등급(예: 양호/주의/위험) 또는 "100점 만점" 라벨을 병기해 "87"의 의미를 즉시 읽히게 한다.
- 기존 "디바이스 타입별 호스트 테이블"은 **탭⑤(호스트 목록)** 로 이동(정보 보존).
- 기간 선택은 `basic-chart-period`(12h/1d/7d/Custom) 컴포넌트 재사용, **탭 전체에 공유**.

### 탭별 콘텐츠

| 탭 | 콘텐츠 | 시각화 |
|---|---|---|
| **① 리소스 추이** | 그룹 집계 CPU%·MEM%·Disk%·Traffic(in/out) 시계열. 집계=평균(기본)/최대(토글) | ECharts 라인 (`DmoveChart` 재사용) |
| **② 위험 호스트 Top-N** | 정렬 토글(알람 수/최고 severity/CPU/MEM/Disk)별 상위 N 호스트 + 미니 막대 | `DmoveTable` + 막대 |
| **③ 알람/이벤트 추이** | severity별 이벤트 발생 건수 시간축 스택 막대 + 기간 총계 | ECharts 스택 막대 |
| **④ 가용성·건강도 추이** | §2 재정의 지표(가용성/건강도)의 시간축 라인 + 기간 평균/최저 | ECharts 라인 |
| **⑤ 호스트 목록** | 기존 디바이스 타입별 호스트 테이블(이전 기능 보존) | `DmoveTable` |

---

## 5. BE 엔드포인트 후보 (계약 초안)

기존 `ZabbixHostController`(`hosts`) 패턴. 응답은 `ApiResult<T>`. 기간은 기존 `DateRangeFilterDto`(from/to) 재사용.

| # | 메서드/경로 | 설명 | 요청 | 응답(핵심 shape) |
|---|---|---|---|---|
| 1 | `GET /hosts/:groupid/resource-trend` | 탭① 리소스 시계열 집계 | `from,to`, `metric=cpu|memory|disk|traffic`, `agg=avg|max` | `TMonitorChart[]` (기존 line-charts shape 재사용) |
| 2 | `GET /hosts/:groupid/top-hosts` | 탭② 위험 호스트 Top-N | `from,to`, `sortBy=alerts|severity|cpu|memory|disk`, `limit` | `TopHostDto[]` (hostid/name/value/alertCount/maxSeverity/status) — **§5 주석 참조** |
| 3 | `GET /hosts/:groupid/alert-trend` | 탭③ severity별 이벤트 시계열 | `from,to`, `interval(bucket)` | `{ buckets:[{timestamp, NOT_CLASSIFIED,INFO,WARNING,AVERAGE,HIGH,DISASTER}], totals:{...} }` |
| 4 | `GET /hosts/:groupid/health-trend` | 탭④ 가용성·건강도 시계열 | `from,to` | `{ data:[{timestamp, availability, healthScore}], availabilityAvg, availabilityMin }` |
| (옵션) | 기존 `GET /hosts/:groupid` 응답 확장 | KPI 헤더용 가용성/건강도 추가 | — | 기존 + `availability`, `healthScore` |

> 1·4의 시계열 응답은 개별 호스트 `line-charts`가 쓰는 `TMonitorChart`/`TDataTimestamp` shape를 따라 FE 차트 훅 재활용.

> **엔드포인트 2 — Top-N vs 페이지네이션 (계약 시 확정 필요).** "Top-N"과 `PaginationResponseDto`는 의미가 충돌한다. 진짜 Top-N(작은 N, 예: 상위 5~10)이면 페이지네이션이 불필요하고, 반대로 "정렬 가능한 전체 호스트 테이블"이면 그건 Top-N이 아니라 **탭⑤(호스트 목록)와 성격이 겹친다.** 둘 중 무엇인지 계약 단계에서 확정한다.
> - **권장**: 탭②는 순수 Top-N(`limit` 고정, 배열 반환)으로, 전체 정렬 테이블 니즈는 탭⑤를 정렬 가능하게 확장해 흡수.

### 데이터 소스 / 집계 전략 (BE)
- **리소스 추이(1)**: 그룹 호스트 → `host.get`(groupids) → CPU/MEM item(`zabbix-item-key.ts` 매핑) → `trend.get` 우선 → 타임버킷 평균/최대.
- **Top-N(2)**: 그룹 호스트별 기간 내 알람 수(`problem`/`event`)·최고 severity·리소스 평균(`trend`) 계산 후 정렬.
- **알람 추이(3)**: `event.get`(groupids, time_from/till) → severity·타임버킷 그룹핑. **생성 이벤트만 버킷팅**하면 되므로 비교적 저비용.
- **가용성·건강도(4)**:
  - **가용성 라인**: host `available`은 "현재 상태" 스냅샷이라 **과거 추이를 그릴 수 없다.** 따라서 트렌드는 `agent.ping`/`icmpping` **item history가 사실상 유일한 historizable 소스**다. → 타임버킷별 ping 가용 호스트 비율로 산출.
  - **건강도 라인**: 각 타임버킷 시점의 **활성 problem을 재구성**해야 한다(§2.2.④). `event.get`의 생성/해소를 interval로 펼쳐 [생성~해소] 구간에 active로 카운트 → 버킷별 §2.3 평균 건강값 계산. **③의 단순 버킷 그룹핑보다 비싸다**(비용 순위는 §7 참조).

### 기술적 고려사항 / 리스크
- ⚠️ **가용성 데이터 출처(확정)**: **KPI 헤더(현재값) = host `available`(저비용 스냅샷), 탭④ 트렌드 = ping item history.** 헤더와 트렌드의 소스를 억지로 하나로 통일하지 말고 **역할을 분리**한다(현재값은 싸게, 트렌드는 historizable 소스로). → §8-#2 해소.
- ⚠️ **성능**: 호스트 多 그룹은 history가 무거움 → ①`trend.get`(시간당 집계) 우선, ②Redis 캐싱(기간+그룹+metric 키, 짧은 EX), ③버킷 수 상한.
- ⚠️ **item-key 정합**: 디바이스 타입별 CPU/MEM key 상이 → 동일 의미 item만 집계. 네트워크 장비 등 CPU/MEM 없는 호스트 제외 규칙.
- ⚠️ **건강도 시계열 비용**: 활성 problem 재구성(④)은 ③보다 무겁다. 버킷 수 상한·캐싱을 ④에도 동일 적용.
- ⚠️ **빈 그룹/데이터 없음**: 호스트 0·item 없음·기간 무데이터 → null 안전 처리 + FE 빈 상태.

---

## 6. FE 연결점

| 레이어 | 파일 | 작업 |
|---|---|---|
| types | `src/types/host-monitoring.ts` | `TGroupResourceTrend`, `TTopHost`, `TAlertTrendBucket`, `THealthTrend` 추가(시계열은 기존 `TMonitorChart` 재사용). `THostGroupMonitoringDetail`에 `availability`/`healthScore` 추가 |
| api | `src/services/host-monitoring.api.ts` | `getGroupResourceTrend`, `getGroupTopHosts`, `getGroupAlertTrend`, `getGroupHealthTrend` |
| queryKey | `src/constants/queryKey.ts` | `HOST_GROUP_QUERY_KEY`에 `RESOURCE_TREND`/`TOP_HOSTS`/`ALERT_TREND`/`HEALTH_TREND` |
| hooks | `src/hooks/` | 탭별 데이터 훅(`useDmoveQuery`), 차트 변환은 `hooks/chart/*` 참고 |
| 화면 | `src/pages/monitoring/host-group/HostGroupDetail.tsx` | KPI 헤더 재구성 + 기간 UI + 탭 컨테이너, 탭별 컴포넌트 분리(`HostGroupResourceTrend.tsx` 등) |
| 컴포넌트 | `src/components/Chart/` | `DmoveChart`(라인/스택 막대) 재사용 |
| i18n | `src/locales/{en,kr}.json` | 탭 라벨·집계/정렬 토글·가용성/건강도 키. **레거시 카드 안전율 라벨 교체(§2.4)도 포함** |

---

## 7. 단계적 구현 로드맵 (권장 우선순위)

빅뱅 금지. **선결 과제(§2) 결정 → 가치·재사용도 순**. (§2.4 결정 완료로 Phase 0 진입 가능.)

- **Phase 0 — 골격 (2단계로 분할)**
  - **0a (즉시 가능, 추가 연산 0)**: KPI 헤더 골격 + **호스트 수 + 활성 알람** + 기간 UI + 탭 컨테이너. 가용성/건강도 KPI는 자리만 잡아둠.
  - **0b**: 가용성/건강도 KPI 값 채우기 — Phase A/B 산식과 함께. (§2.4 정의 적용)
- **Phase A — ① 리소스 추이** (기존 line-charts shape/훅 재사용도 최고).
- **Phase B — ④ 가용성·건강도 추이** (§2 재정의 산식 시계열화). **탭④ 내부도 비용 순으로 분할**:
  - **B-1 가용성 라인** (ping history 버킷팅 — 비교적 가벼움) 먼저.
  - **B-2 건강도 라인** (타임버킷별 활성 problem 재구성 — 무거움) 나중.
- **Phase C — ③ 알람/이벤트 추이** (event.get 생성 이벤트 버킷팅 + 기존 이벤트 모듈 재사용).
- **Phase D — ② 위험 호스트 Top-N** (집계·정렬 비중·성능 영향 최대 → 캐싱 검증 후 마지막).

> **비용 순위(참고)**: `D > B-2(건강도) > C ≳ A·B-1`.
> ③(발생 건수)은 생성 이벤트만 버킷팅하면 되어 싼 편이고, ④의 **건강도 라인**은 활성 problem 재구성 때문에 ③보다 비싸다. 그래서 ④를 B 페이즈에 두되 가용성(B-1)을 먼저, 건강도(B-2)를 뒤로 쪼갠다.

각 Phase는 `fullstack-feature` 파이프라인(BE→계약→FE→integration-qa→functional-qa)으로 독립 처리.

---

## 8. 미결 사항 (구현 착수 전 확인)

1. ~~**(최우선) 안전율 처리 방향**~~ → **§2.4에서 확정.** 신규 화면: A(가용성) 주 + B(건강도) 보조. 레거시 카드: 현행 유지 금지(A 교체 권장, 최소 C). *남은 택일: 레거시 카드를 A 교체할지 C 교정할지 — 영향도 점검 후 착수 시 결정.*
2. ~~**가용성 데이터 출처**~~ → **§5에서 확정.** KPI 헤더(현재값)=host `available`, 탭④ 트렌드=`agent.ping`/`icmpping` item history(host `available`은 스냅샷이라 시계열 불가).
3. **리소스 집계 기본값** — 평균 vs 최대 (둘 다 토글 전제)? *(미결)*
4. **Top-N 기본 정렬** — 알람 수 vs 최고 severity vs CPU? 더해서 **엔드포인트 2가 순수 Top-N인지 / 정렬 테이블인지**(§5 주석)도 함께 확정. *(미결)*
5. **기간 최대 범위** — 7d까지인지 30d 등 확장 필요한지(성능 직결)? *(미결)*
6. **탭 vs 한 화면 스크롤** — 정보 밀도상 탭 가정. 펼침 선호? *(미결)*

---

## 다음 단계
§2.4(안전율 방향)·§8-#1~2 **확정 완료** → **Phase 0a → 0b → A**부터 `fullstack-feature` 파이프라인으로 착수.
남은 미결(§8-#3~6)은 각 Phase 계약 단계에서 확정. 계약 확정 시 `_workspace/features/infra/hostgroup-and-reports/contract_hostgroup-monitoring.md`로 분리 산출.