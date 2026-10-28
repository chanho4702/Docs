# QA — 차트 공용 드릴다운(툴팁 링크 + 차트↔표 전환) · ZM-119 후속

> 검증 2026-08-27 · integration-qa(정적) · 대상 worktree `C:\worktrees\zm-119-fe` HEAD `1e841b3` + 미커밋 작업 트리
> 설계 정본 `_workspace/features/events/lld-management/devdesign_chart-drilldown.md` v1
> 방식: 정적 대조(소스 교차) + `tsc --noEmit` + `npx jest` 전량. **런타임/브라우저 미검증**.

## 0. 요약

| 구분 | 건수 |
|---|---|
| PASS | 41 |
| FAIL — HIGH | 0 |
| FAIL — MEDIUM | 2 |
| FAIL — LOW | 7 |

- `tsc --noEmit` **exit 0**.
- `npx jest` — **172 스위트 중 170 PASS / 1517 테스트 중 1515 PASS**. 실패 2건(`AiAssistantPage.test.tsx`, `TriggerFormDrawer.test.tsx`)은 이번 변경 파일과 import 접점이 없는 **선재 실패**(각각 URL 동기화·트리거 에러 토스트).
- 신규 테스트 7파일(`ChartCard` / `tooltipLink` / `problemLink` / `chartDrilldownLinks` / `DmoveChartDrilldown` / `HostGroupAlertTrend` / `AlarmSeverityPieWidget`) + 기존 2파일 보강 전부 green. 설계 §5가 요구한 테스트 항목은 전건 존재.

---

## 1. §4 "같은 항목 집합" — 카드별 (a)클릭 / (b)툴팁 링크 / (c)표 행 링크

판정 기준: 셋이 **코드상 동일한 술어**를 보는가.

| 카드(파일) | 판정 술어 | (a) 클릭 | (b) 툴팁 링크 | (c) 표 행 | 판정 |
|---|---|---|---|---|---|
| 자산 분류 `AssetHBarCard`(id=`asset-device-type`) | `canSelect = Boolean(onSelect) && item.selectable !== false` | ✔ `onEvents.click`→`canSelect` | ✔ formatter `canSelect` | ✔ `items.some(canSelect)`+행별 `canSelect` | PASS |
| 호스트그룹 `asset-host-group` | 동일 | ✔ | ✔ | ✔ | PASS |
| OS 계열 `asset-os-family` | `onSelect` 없음 | ✘ `onEvents=undefined` | ✘ `canSelect=false` | ✘ `onRowSelect=undefined` | PASS(셋 다 없음) |
| 소유자 `asset-owner` | 동일(미지정은 `tagLink`로 착지) | ✔ | ✔ | ✔ | PASS |
| 완성도 `asset-completeness` | `selectable: tag !== undefined`(`AssetDashboardPage.tsx:357`) | ✔ | ✔ | ✔ | PASS |
| 만료 `asset-expiry` | 6항목 전부 착지(경과=`qualityTag`, 나머지=비용 화면) | ✔ | ✔ | ✔ | PASS |
| 소스×커버리지 `asset-source-coverage` | `segment.onSelect` 유무 | ✔ | ✔ | ✔ `anySelectable` | PASS |
| 생애주기 `asset-lifecycle` | 동일(`other`만 `onSelect` 없음) | ✔ | ✔ | ✔ | PASS |
| 실시간 상태 `asset-live-status` | 전 구간 `onSelect` 없음 | ✘ (핸들러는 붙되 no-op) | ✘ 위임 미등록 | ✘ `onRowSelect=undefined` | PASS |
| 취득연도 `asset-acquisition-year` / 활동추이 `asset-activity-trend` | 링크 로직 미도입 | ✘ | ✘ | ✘ | PASS |
| 비용 구성 도넛 `cost-dash-composition` | `onSelect` 없음 | ✘ | ✘ | ✘ | PASS |
| 분류별 도넛 `cost-dash-by-device-type` | `canSelect = Boolean(onSelect) && Boolean(slice.linkKey)`(미지정=`linkKey` 없음) | ✔ | ✔ | ✔ | PASS |
| 소유자 도넛 `cost-dash-by-owner` | 동일 | ✔ | ✔ | ✔ | PASS |
| HW lifecycle mix `cost-hw-lifecycle-mix` | 동일(`onSelectFilter` 없으면 셋 다 소멸) | ✔ | ✔ | ✔ | PASS |
| HW 소유자 `cost-hw-spend-by-owner` | 동일 · "기타"는 `linkKey` 없음 | ✔ | ✔ | ✔(표는 `tableRows` 전량, 접힌 소유자도 개별 착지) | PASS |
| 상각방법 `cost-hw-method-mix` | `onSelect` 없음 | ✘ | ✘ | ✘ | PASS |
| 월별추이 / 번다운 / 상각스케줄 / Cloud 실청구 | 링크 미도입 | ✘ | ✘ | ✘ | PASS |
| 홈 심각도 도넛 `home-alarm-severity` | 전 등급 착지 | ✔ | ✔ | ✔(0건 등급 포함) | PASS |
| 호스트그룹 알림추이 `host-group-alert-trend` | 툴팁=값>0 계열, 행=그날 전체 | ✔ 막대(계열) | ✔ 값>0 계열만 | ✔ 행=버킷 전체(심각도 축 없음, 의도적) | PASS |

- 설계가 "착지 축 없음"으로 규정한 **OS·취득연도·활동·월별·번다운·상각스케줄·Cloud 실청구·구성·상각방법·미지정·기타** 전부 (a)(b)(c) 셋 다 부재 확인. **PASS**
- 참고(결함 아님): 도넛/누적막대는 값 0인 조각을 차트에서 지우지만 표에는 남고 그 행도 눌린다. 설계 §4 "표는 데이터 전량"과 일치하며, 착지 축이 실재하므로 "링크만 있고 안 눌리는 상태"에 해당하지 않는다.

---

## 2. 딥링크 쿼리 키 문자 단위 대조

### 2-1. 자산 목록 (`deepLink.buildAssetListSearch`, 이번 변경 없음)
| 키 | 생성 | 소비(`AssetListPage.tsx`) | 판정 |
|---|---|---|---|
| `deviceType` `groupName` `owner` `lifecycle` `source` `coverage` | `ASSET_DASHBOARD_FILTER_KEYS`(enum) | 216·222·231·236·246·254행 | PASS |
| `qualityTag` | override | 267행 | PASS |
| `offset` | 항상 `"0"` | DmoveTable | PASS |
| `savedView` | override 전용 | 이번 변경의 어떤 링크도 발행하지 않음 | 범위 밖 |

### 2-2. HW 탭 (`SearchCostHwDto` ↔ `CostHwTab` ↔ 도넛 링크)
| 축 | BE `SearchCostHwDto` 필드 | `CostHwTab` 읽는 키 | 링크가 쓰는 키 | 판정 |
|---|---|---|---|---|
| 기기유형 | `deviceType` | `QueryParamKeys.DEVICE_TYPE`="deviceType" | 동일 상수 | PASS |
| 소유자 | `owner` | `QueryParamKeys.OWNER`="owner" | 동일 상수 | PASS |
| 라이프사이클 | `lifecycle` | `QueryParamKeys.LIFECYCLE`="lifecycle" | 동일 상수 | PASS |
| 탭 전환 | — | `QueryParamKeys.TAB`="tab" + `COST_TAB.HW` | 동일 | PASS |
| 페이지 | `offset` | — | `OFFSET`=null(대시보드) / null(HW 탭) | PASS |

- 값 어휘도 일치: 분류 도넛 `linkKey = item.name`(BE `CostService` byDeviceType 키 = `asset.device_type` 코드), lifecycle 도넛 `linkKey = item.name`(상태 코드, 라벨은 FE에서 `t()`로만 붙임). **PASS**
- null(미지정)/"기타"에 `linkKey`를 주지 않아 `blankToNull` 무시 축으로 새는 경로 없음. **PASS**

### 2-3. 문제 목록 (`problemLink.ts` ↔ `EventListReqDto`/`DateRangeFilterDto`)
| 키 | `problemLink` 생성 | BE 수신 | 판정 |
|---|---|---|---|
| `groupId` | `QueryParamKeys.GROUP_DETAIL_ID`="groupId" | `EventListReqDto.groupId` | PASS |
| `hostId` | 항상 해제(null) | `EventListReqDto.hostId` | PASS |
| `status` | `EProblemSeverity`(`NOT_CLASSIFIED`…`DISASTER`) | `HostStatus` enum — **6값 문자 단위 동일** | PASS |
| `show` | `EProblemShowMode`(`RECENT`/`HISTORY`, 대문자) | `EventShowMode` 동일 대문자 | PASS |
| `from`/`to` | 넘긴 경우에만 `String(unix seconds)` | `DateRangeFilterDto.from/to`(long, epoch sec) → `time_from`/`time_till` | PASS |
| `offset` | 항상 `"0"` | `BasePageDto.offset` | PASS |

- `HostGroupSummaryPanel.applyFilter`가 `problemFilterEntries({groupId, status})`로 교체됐고 **키·순서·기본 `HISTORY`가 이전 인라인 배열과 동일**(from/to는 양쪽 다 미발행 = 화면 기존 값 유지). **PASS**
- `problemFilterSearch`는 `problemFilterEntries`의 non-null 부분집합으로 생성 — 두 경로가 갈릴 수 없다(테스트로 고정). **PASS**

---

## 3. `tooltipLink`

| 항목 | 결과 |
|---|---|
| HTML escape — `&<>"'` 5종 치환, 라벨/키/cardId 전부 통과 | PASS (`tooltipLink.ts:22-54`) |
| `data-chart-card` 스코프 — 선택자에 id를 넣지 않고 클래스로 찾고 속성 비교(따옴표·공백 id 방어) | PASS (`:104-108`) |
| 리스너 누수 — `useEffect` 반환에서 `removeEventListener`, deps `[cardId, enabled]` | PASS (`:118-120`) |
| 핸들러 없으면 미등록 | PASS (`enabled` 가드) |
| `href="#"` + `preventDefault` | PASS (`:113-114`) |
| `enterable: true` · `hideDelay: 250`(≤250) · `confine: true` | PASS (`:64-77`) |
| `appendToBody` 유지 — 기본 true, base가 명시하면 base 우선. 전 호출처가 `appendToBody: true` 명시 | PASS |

---

## 4. `ChartCard` / `ChartTableView`

| 항목 | 결과 |
|---|---|
| 표 행 수 = `rows` 전량 | PASS — HBar는 `items` 전량, 소유자 도넛은 `tableRows`(Top N 접기 전) 사용 |
| `DmoveTable` `loading={false}` 명시 | PASS (`ChartTableView.tsx:87`, [[fe-dmovetable-loading-spinner]] 회피) |
| `showPagination={false}` · `hasQuery={false}` · `size="small"` · `tableLayout="fixed"` | PASS |
| `scroll` 기본 `{x:1000}` 덮어씀 → `{x:"100%", y:scrollY}` | PASS |
| 키보드 — `tabIndex=0` + Enter/Space(`" "`·`"Spacebar"`) + `preventDefault` | PASS |
| `role="button"` 미사용 근거 | PASS(판단으로는 타당 — `<tr>`에 `role="button"`을 주면 표 시맨틱이 깨진다). 단 **LOW-3** 참조 |
| sessionStorage try/catch(읽기·쓰기 양쪽) | PASS (`useChartView.ts:14-30`) |
| 키 충돌(같은 화면 같은 id 2개) | 자산 대시보드 10장·비용 대시보드 3장·HW 탭 3장 전부 유일. `asset-live-status`는 로딩 플레이스홀더와 본 카드가 **배타 분기**라 동시 존재 불가(뷰 상태 승계 목적으로 같은 값을 쓴 것). PASS. 단 **LOW-1**·**LOW-6** 참조 |
| 빈/로딩 시 토글 비활성 | PASS — `ChartCard` `toggleDisabled = loading \|\| isEmpty`, 홈 위젯 `disabled={!hasData}`, `DmoveChart` `disabled={loading \|\| !hasData}` |
| `extra` + `hint` 공존 | PASS (`ChartCard.tsx:83-96`, 구 `AssetChartCard` 배타 해소, 테스트 고정) |

---

## 5. `DmoveChart` 회귀

| 항목 | 결과 |
|---|---|
| 새 prop 미지정 시 `option`이 **원본 참조** 그대로 | PASS — `linkedOptions` memo가 `if (!tooltipLinks \|\| !viewId \|\| !optionsData) return optionsData` |
| `onEvents` undefined | PASS — `onPointClick` 없으면 `undefined` |
| 모달 "데이터표"(`hasShowDataButton`) 유지 | PASS — 버튼·모달 경로 무변경, 인라인 표는 별도 토글 |
| 인라인 표가 `children`/기본 렌더를 대체하는 조건 | PASS — `!!inlineTable && isTable && !loading && hasData` |
| BPS 등 자체 formatter 차트와의 충돌 | 현재 충돌 **없음**(유일 소비처 `HostGroupAlertTrend`는 `unit=""`). 잠재 위험은 **LOW-4** |

---

## 6. `AlertTrend` 버킷 정렬

| 항목 | 결과 |
|---|---|
| `getChartTimeGrid` 인덱스 ↔ `buckets` 인덱스 | PASS — 그리드는 모든 시리즈 timestamp의 합집합을 오름차순 정렬. 시리즈는 전부 `payload.buckets` 전량을 그대로 매핑하므로 그리드 = buckets 순서. BE는 `bucketStart`부터 `bucketSec` 간격 `LinkedHashMap`으로 **오름차순·균등 간격** 생성(`HostService.java:1126-1128`) |
| 총계 0 시리즈 제외의 영향 | PASS — 제외는 **계열**만 줄이고 x축 눈금은 남은 계열의 timestamp 합집합이라 동일. 전 계열이 0이면 차트 자체가 비어 클릭 경로가 없다 |
| 마지막 버킷 `to` 폴백 | PASS — 다음 버킷이 없으면 앞 간격, 그것도 없으면 86400(BE `resolveAlertTrendBucketSeconds`가 7일 구간에 주는 값과 일치) |
| UTC 경계 | 그리드/링크 모두 ISO8601 UTC 문자열(`AlertTrendBucketDto` 계약)을 `dayjs().unix()`로 절대시각 환산 — 로컬 자정 오염 없음. PASS. 단 **MED-1**(경계 자체는 맞으나 첫/마지막 버킷 창이 막대가 센 구간보다 넓다) |

---

## 7. 홈 위젯

| 항목 | 결과 |
|---|---|
| `HomeWidgetShell.actions` 슬롯이 다른 위젯에 영향 | PASS — 옵셔널 prop, `{!editMode && actions}`로 편집 모드 제외. 현재 전달처는 `AlarmSeverityPieWidget` 1곳뿐 |
| `show=RECENT` 근거 | PASS — BE `HomeService.safeAlarm` → `alertPort.countActive`(열린 문제)이므로 RECENT가 맞다. 반대로 `HostGroupAlertTrend`는 `listHistory` 기반이라 HISTORY(기본값). 두 방향이 코드로 확인됨. 단 기간 축은 **MED-2** |
| 0건 조각 표 포함 | PASS — `rows`는 `SEVERITY_CODE_ORDER` 6등급 전량, 차트만 `value>0` 필터 |

---

## 8. i18n · 도움말 · 삭제 잔존

| 항목 | 결과 |
|---|---|
| kr/en 대칭 | PASS — 이번에 추가된 키(`chart_card.*` 10, `assetDashboard.*` 4, `cost.*` 6, `depreciation.*` 2, `cloud_cost.*` 2) 전부 양쪽 동일. 전체 파일 비대칭 17건은 전부 **선재**(discovery_management·report 등, 이번 변경과 무관) |
| 루트 중복 키 | PASS — kr/en 모두 0 |
| 참조 키 존재 | PASS — 코드에서 부르는 `chart_card.*`·`no_data`·`total`·`alert_severity.*`·신규 컬럼 키 전부 양쪽에 존재 |
| 도움말 갱신 | 부분 PASS — `home`·`monitoring_host_group_detail`·`asset_dashboard`·`asset_cost` 4화면 kr/en 갱신 확인. **LOW-5** 참조 |
| 삭제된 `AssetChartCard` 참조 | PASS — 0건(주석·테스트 설명 문자열만) |
| 삭제된 `dashboard/components/visuallyHidden.ts` 참조 | PASS — 0건, 전 소비처가 `@/components/Chart/visuallyHidden`로 이동 |
| `chartDataView.ts` 소비처 3곳 | PASS — `EC2Dashboard.tsx:84`·`VPCDetail.tsx:58`·`InstanceTimeline.tsx:128` 무손상. `CloudBillingCard`만 제거(설계 §2.3대로) |

---

## 9. 팔레트 버그 2건

| 위치 | 수정 전 | 수정 후 | 판정 |
|---|---|---|---|
| `CostMonthlyTrendCard.tsx:111` | `costChartColors[2]`(함수를 배열 인덱싱 → `undefined`) | `costChartColors()[2]` | PASS |
| `CostHwDepreciationPage.tsx:236` | `color: costChartColors`(함수 객체를 색 배열로) | `color: costChartColors()` | PASS |
| 같은 패턴 잔존 | `costChartColors`·`depreciationMixColors` 전 사용처 12곳 grep — **전부 호출형**(`()` 있음). 잔존 0 | PASS |

---

## FAIL 목록

### MED-1 (MEDIUM · 주체 FE) — 알림추이 첫/마지막 버킷의 링크 창이 막대가 센 구간보다 넓다
- **위치**: `src/pages/monitoring/host-group/HostGroupAlertTrend.tsx:63-75`(`bucketWindow`) ↔ BE `moveseye-be-spring/src/main/java/com/dmove/moveseye/host/HostService.java:1113-1131`
- **기대**: 링크가 여는 기간 = 그 막대가 센 이벤트 구간(설계 §4 "같은 항목 집합"의 시간축 판).
- **실제**: 훅은 `from = now-7d`(분 경계)로 조회하는데 BE는 첫 버킷 키를 `bucketStart = (from / 86400) * 86400`, 즉 **UTC 자정으로 내림**해 만든다. 막대는 `[from, …)`만 세지만(`listHistory` range = `[from, to]`) FE는 `bucketWindow(0).from = bucketStart`를 그대로 실어 **최대 24시간치를 초과 포함**한 목록을 연다. 마지막 버킷도 `to = key + 86400 > queryTo`라 같은 방향으로 초과 포함된다. → "3건짜리 막대를 눌렀는데 목록엔 9건".
- **수정 제안**: `useGroupAlertTrend`가 `dateRange`(from/to)도 반환하고, `bucketWindow`에서 `from = Math.max(bucketStart, dateRange.from)` · `to = Math.min(from + width, dateRange.to)`로 clamp.

### MED-2 (MEDIUM · 주체 FE) — 홈 심각도 도넛의 착지 목록에 기간 축이 없어 기본 30일 창이 걸린다
- **위치**: `src/pages/home/widgets/monitoring/AlarmSeverityPieWidget.tsx:91-98`(from/to 미발행) ↔ `src/hooks/useSetDefaultDate.ts:13-19`(from·to 둘 다 없으면 최근 30일 주입) ↔ BE `ZabbixAlertAdapter.toParams`(`time_from`/`time_till`를 problem.get에 그대로 건다)
- **기대**: 위젯이 센 집합과 목록 집합이 같아야 한다.
- **실제**: 위젯 숫자는 `HomeService.safeAlarm` → `alertPort.countActive(AlertQuery.ofSeverity(...))` 로 **기간 제한이 없다**(`AlertQuery.ofSeverity`에 `range` 없음). 반면 링크는 from/to를 싣지 않아 목록이 최근 30일 창을 스스로 채우고 BE가 그 창을 실제 질의에 건다. **30일보다 오래 열려 있는 문제는 목록에서 누락**된다.
- **수정 제안**: 링크에 `to = now`, `from`을 충분히 이른 시각으로 명시하거나(질의 부하 확인 필요), 그게 곤란하면 위젯 hint/도움말에 "최근 30일 목록으로 열립니다"를 명시해 화면이 거짓말하지 않게 한다.

### LOW-1 (LOW · 주체 FE) — 홈 심각도 위젯이 `unique`가 아니라 카드 id가 중복될 수 있다
- **위치**: `src/constants/homeWidgets.ts:100`(`alarm_severity_pie`에 `unique: true` 없음) ↔ `AlarmSeverityPieWidget.tsx:32`(`CARD_ID` 상수)
- **실제**: 같은 위젯을 2개 올리면 `useTooltipLinkDelegation("home-alarm-severity", …)` 리스너가 2개 등록돼 링크 클릭 1회에 `navigate`가 2번 불리고, `chartView:home-alarm-severity` 세션 키도 공유된다. 목적지가 같아 실피해는 작다.
- **수정 제안**: 메타에 `unique: true`를 주거나 `CARD_ID`에 `widget.id`를 접미.

### LOW-2 (LOW · 주체 FE) — Cloud 실청구 카드의 표 뷰가 차트 외 정보까지 함께 감춘다
- **위치**: `src/pages/cloud-infra-monitoring/components/CloudBillingCard.tsx:100-165`
- **실제**: `ChartCard`의 `children`에 차트뿐 아니라 MTD 합계·서비스 Top5·마지막 동기화 시각·"자산 비용에서 상세 보기" 링크가 함께 들어 있어, 표로 바꾸면 **그 넷이 전부 사라진다**. 특히 상세 링크는 이 카드의 유일한 이동 경로다.
- **수정 제안**: 합계·링크는 `subtitle`/`extra`로 올려 두 뷰에서 공통으로 남긴다.

### LOW-3 (LOW · 주체 FE) — 표 행의 "누를 수 있음"이 보조기기에 전달되지 않는다
- **위치**: `src/components/Chart/ChartTableView.tsx:53-57`(`<span aria-hidden>`), `:62-64`(`tabIndex: 0`만)
- **실제**: 유일한 시각 표식 "보기 →"가 `aria-hidden`이고 행에는 role·aria-label이 없다. 키보드 조작(Enter/Space)은 되지만 스크린리더 사용자는 포커스된 행이 조작 가능한지 알 수 없다. 설계 §1 원칙 3(표 = 키보드 경로)의 절반만 달성.
- **수정 제안**: `<tr>`에 `aria-label`(예: "{항목} 자세히 보기")을 주거나, "보기 →" 셀의 `aria-hidden`을 떼고 `<span className="sr-only">`로 낭독시킨다. `<tr role="button">`은 표 시맨틱을 깨므로 지금 판단(미사용)이 맞다.

### LOW-4 (LOW · 주체 FE) — `DmoveChart`의 새 옵션 2건이 잠재 충돌 소지
- **위치**: `src/components/Chart/DmoveChart.tsx:163`(`const viewId = chartId ?? ""`), `:175-200`(formatter 교체)
- **실제**: ① `chartId` 없이 `inlineTable`만 준 차트가 둘 이상 생기면 세션 키가 `"chartView:"`로 충돌한다(현재 소비처 1곳이라 실피해 0). ② `tooltipLinks`를 주면 `useHandelChartAction`의 **BPS 전용 formatter가 통째로 덮인다** — 트래픽 차트에 링크를 붙이는 순간 값이 bps 포맷을 잃는다(현재 미사용).
- **수정 제안**: `inlineTable`/`tooltipLinks`가 있는데 `chartId`가 없으면 개발 경고, 그리고 formatter 교체 대신 링크 줄만 덧붙이는 래핑(기존 formatter 위임).

### LOW-5 (LOW · 주체 FE) — 도움말 갱신 누락 2화면
- **위치**: `src/locales/{kr,en}.json` `help.screens.asset_cost_schedule`, 클라우드 인프라/EC2 개요 항목
- **실제**: 상각 스케줄 화면과 EC2 개요의 실청구 카드에 표 토글이 새로 생겼고 EC2 개요 쪽은 기존 toolbox "데이터 보기"가 사라졌는데, 해당 도움말 문구는 그대로다. (다행히 사라진 기능을 안내하는 **낡은 문구는 없다** — `데이터 보기` grep 0건.)

### LOW-6 (LOW · 주체 FE) — `cloud-billing-daily` 뷰 상태가 두 화면에 공유된다
- **위치**: `CloudBillingCard.tsx:115`(id 고정) — EC2 개요와 자산 비용 Cloud 탭 두 화면이 같은 컴포넌트를 쓴다.
- **실제**: 동시 렌더는 아니라 링크 오작동은 없지만, 한 화면에서 표로 바꾸면 다른 화면도 표로 열린다. 의도라면 무방.

### LOW-7 (LOW · 주체 FE) — 호스트그룹·소유자 막대는 표도 "전량"이 아니다
- **위치**: `AssetDashboardPage.tsx:487-500`(host-group), `:515-532`(owner)
- **실제**: BE가 이미 Top N으로 자르고 `otherGroupCount`/`otherOwnerCount`만 내려 FE에 접힌 항목이 없다. 설계 §1 원칙 1("차트가 접은 것도 표는 전부")이 이 두 카드에서는 성립하지 않는다. subtitle이 "그 외 N건"으로 고지하고 있어 거짓말은 아니나, 표 뷰의 약속과는 어긋난다.
- **수정 제안**: 문서에 예외로 명시하거나, BE 응답 확장(범위 밖).

---

## 미검증(범위 밖 · 후속 필요)

- **런타임/브라우저**: 툴팁 실호버→링크 클릭 왕복, `enterable` 250ms 체감, 표 뷰 높이 오버플로(특히 `CloudBillingCard` `bodyHeight = chartHeight + 200` 고정 — 차트+KPI+Top5 5행+동기화 문구+링크가 들어가 넘칠 소지), 다크모드에서 `currentColor` 툴팁 링크 가독성.
- **실 데이터 착지 검증**: MED-1/MED-2가 실제로 몇 건 차이를 내는지(dev Zabbix 실측 필요).
- **선재 실패 2건**: `AiAssistantPage.test.tsx:158`, `TriggerFormDrawer.test.tsx`(비접두 에러 토스트) — 이번 변경과 무관, 별도 처리 필요.
