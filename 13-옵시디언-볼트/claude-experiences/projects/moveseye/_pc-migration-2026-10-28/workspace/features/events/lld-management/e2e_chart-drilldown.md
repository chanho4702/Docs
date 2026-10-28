# E2E 런타임 검증 — 차트 공용 드릴다운(툴팁 링크 + 차트↔표 전환) · ZM-119 후속

> 실행 2026-08-27 · functional-qa · **런타임 행위 검증만**(코드 수정 없음)
> 설계 정본 [features/events/lld-management/devdesign_chart-drilldown.md](devdesign_chart-drilldown.md) §2·§2.3·§3·§4

## 0. 실행 환경

| 항목 | 값 |
|---|---|
| BE | `C:\worktrees\zm-119-be` → **:3001** (이미 기동돼 있던 pid **36212**, 재기동/종료 안 함) |
| FE | `C:\worktrees\zm-119-fe` → `npm run dev -- --host 0.0.0.0 --port 5174 --strictPort` (pid **12116**, `.env`의 `VITE_API_URL=http://localhost:3001`) — **검증 후 종료함** |
| 브라우저 | 헤드리스 Chrome 151 + CDP :9334 (pid **3036**, user-data-dir `…\Temp\claude\chromeqa119`) — **검증 후 종료함** |
| 계정 | `admin` / `<dev-pw>`, dev 프로필(5433) |
| 무접촉 확인 | :3000·:3002·:5173 및 메인 체크아웃 미접촉. 자산 **id 176(ec2-tokyo)** 무변경(자산 쓰기 0건) |
| 드라이버 | scratchpad `cdp2.mjs` — **툴팁 hover는 전부 CDP `Input.dispatchMouseEvent`로 실제 마우스 이동** 후 링크 rect를 다시 읽어 클릭 |

> ⚠️ dev DB 쓰기: 시나리오 C6을 하려면 홈에 "Alarm severity mix" 위젯이 있어야 해서 **admin 홈 레이아웃에 위젯 1개를 추가했다가 검증 후 제거**했다. 종료 시 위젯 13개 원상 복구 확인(License…Main geo map). 그 외 쓰기 0건.

## 1. 결과 요약

**PASS 31 · FAIL 3 · BLOCKED 1 · 관찰 5**

| # | 항목 | 판정 |
|---|---|---|
| F-1 | 홈 알람 심각도 위젯 건수 ↔ 착지 목록 건수 불일치 (756→51, 39→**0건**) | **FAIL (HIGH)** |
| F-2 | 툴팁 링크로 커서를 옮기는 동안 **링크 대상이 바뀜**(도넛·축트리거) | **FAIL (MEDIUM)** |
| F-3 | "Top 10 호스트그룹" 표가 전량이 아님(그 외 13그룹이 표에도 없음) | **FAIL (MEDIUM)** |
| B-1 | Cloud 실청구 카드 차트/표 — 유료 옵트인 OFF라 런타임 미검증 | **BLOCKED** |

---

## 2. A. 자산 현황 대시보드 `/asset/dashboard`

### A-1. 툴팁 링크 성립 (1순위) — **PASS 3/3**

실제 마우스로 막대 위 hover → `appendToBody` 툴팁 등장 → 커서를 툴팁 안 링크로 이동 → 클릭.

| 카드 | hover 지점 | 링크 중심 | 이동 거리 | 이동 소요 | 착지 URL | 목록 건수 |
|---|---|---|---|---|---|---|
| 기기분류 HBar (`asset-device-type`) | (400,530) 서버 막대 | (456,596) | ≈87px | **135ms** | `/asset/list?deviceType=server&offset=0&limit=10` | Total **17** = 막대값 17 ✅ |
| 소스×커버리지 Stacked (`asset-source-coverage`) | (1100,530) 첫 구간 | (1156,556) | ≈62px | **160ms** | `?source=zabbix&coverage=monitored` | Total **75** = 구간값 75 ✅ |
| 소유자별 HBar (`asset-owner`) | (1300,440) DBA팀 | (1356,506) | ≈87px | **150ms** | `?owner=DBA%ED%8C%80` | Total **14** = 막대값 14 ✅ |

- `hideDelay` 250ms 여유 안에 전부 도달(최대 160ms). 툴팁이 커서를 따라 내려오지만(측정 drift 최대 17px) 진입 후 고정돼 클릭 가능.
- 툴팁 본문/링크 텍스트: `서버: 17` + `Open →`(`data-chart-card`·`data-chart-key` 정상, 위임 리스너가 자기 카드만 처리).

### A-2. 차트 ↔ 표 전환 — **PASS (F-3 1건 제외)**

11개 카드를 표로 전환해 전수 측정(행 수 / 컬럼 / 행선택 / 카드 넘침 / 가로 스크롤):

| 카드 | 행 | 컬럼 | 행 클릭 | 카드 밖 넘침 | 가로 스크롤 |
|---|---|---|---|---|---|
| 기기분류 | 6 | 항목·건수·(보기) | 6 | −26px | 없음 |
| 소스×커버리지 | 6 | 구간·건수·비율·(보기) | 6 | −26px | 없음 |
| **Top 10 호스트그룹** | **10** | 항목·건수·(보기) | 10 | −4px | 없음 |
| OS 계열 | 7 | 항목·건수 | **0** ✅(링크 없음) | −26px | 없음 |
| 소유자 | 6 | 항목·건수·(보기) | 6 | −23px | 없음 |
| 생애주기 | 5 | 구간·건수·비율·(보기) | 5 | −26px | 없음 |
| 취득연도 | 9 | 연도·자산수·내용연수초과 | **0** ✅ | −23px | 없음 |
| 만료 구간 | 6 | 항목·건수·(보기) | 6 | −4px | 없음 |
| 필드별 완성도 | 10 | 항목·채움/전체·(보기) | 10 | −169px | 없음 |
| 모니터링 상태(live) | 4 | 구간·건수·비율 | **0** ✅ | −148px | 없음 |
| 30일 활동 추이 | 30 | 일자·5계열 | **0** ✅ | −26px | 없음 |

- 링크 없는 카드(OS·취득연도·활동·live)는 **"보기" 열도 없고 행도 안 눌린다** — 설계 §1 원칙 2 준수.
- 카드 높이는 `bodyHeight` 고정이라 표로 바꿔도 같은 줄 카드 하단 정렬이 유지된다(전환 전후 카드 rect 동일).
- 행 클릭: 기기분류 2행(네트워크) 클릭 → `?deviceType=network` · Total 1 ✅
- **키보드(Enter)**: 완성도 1행 `⚠ Location 0 / 79`에 `tabIndex=0` 포커스 → Enter → `?qualityTag=inventory_sparse` · Total 33 ✅

#### 🔴 F-3 — "Top 10 호스트그룹" 표가 로우 데이터가 아니다 (MEDIUM)

- **기대**(설계 §4 / 요청): "표 행 수 = 데이터 전량(Top N 접기 무시), 차트 뷰의 '그 외 N'은 표에서 펼쳐진 개별 행".
- **실제**: 카드 부제가 `… · 13 more groups`인데 표도 **10행뿐**. 나머지 13개 그룹은 차트에도 표에도 없다.
- **원인**: BE `TAssetDashboardComposition.byHostGroup`이 **Top 10만** 내리고 나머지는 개수(`otherGroupCount=13`)로만 준다 (`moveseyee_fe/src/types/asset.ts:527`). BE 무변경 전제라 FE만으로는 못 편다.
- 참고: 소유자 카드는 `0 more owners`(전량 6행)라 같은 문제가 없다.

### A-3. sessionStorage 뷰 유지 — **PASS**

- 11개 카드를 표로 전환 → 딥링크로 `/asset/list` 이동 → `history.back()` → **11개 중 표로 바꾼 10개 전부 표 유지**(차트로 되돌린 1개는 차트).
- 저장 키: `chartView:asset-device-type=table` 등 11개, 전부 `sessionStorage`.
- **새 탭**(CDP `/json/new`로 별도 target 생성) → `sessionStorage` 빈 배열, 11개 카드 **전부 차트 기본** ✅

### A-4. 빈 상태 토글 비활성 — **PASS**

`/asset/dashboard?owner=ZZ_NOBODY_QA`:

| 카드 | Empty | 토글 disabled |
|---|---|---|
| Top 10 호스트그룹 | ✅ | **true** |
| 취득연도 | ✅ | **true** |
| 나머지 9개 | (0건 항목이 남아 Empty 아님) | false |

- 기기분류·소유자 등은 값이 0인 항목이 1급 값으로 남아 `items.length > 0` → Empty가 아니다. `AssetHBarCard`의 명시된 의도와 일치(정상).

---

## 3. B. 비용 `/asset/cost`

### B-5. 도넛 링크·표 전환 — **PASS (Cloud 제외)**

| 차트 | 툴팁 링크 | 착지 | 결과 |
|---|---|---|---|
| 대시보드 · 기기분류별 도넛 (`cost-dash-by-device-type`) | `notClassified` | `?tab=hw&deviceType=notClassified&offset=0&limit=10` | HW 탭 필터 "Not classified", **Total 62** ✅ |
| 대시보드 · 소유자별 도넛 (`cost-dash-by-owner`) | (표 뷰 6행 전부 `Open →`) | `?owner=` | 행 링크 존재 ✅ |
| HW 탭 · Lifecycle cost mix | `retired` | `?tab=hw&limit=10&lifecycle=retired&offset=0` | **페이지 이동 없이 같은 탭**, Total 8 ✅ |
| HW 탭 · Spend by owner | `인프라운영팀` | `?tab=hw&owner=인프라운영팀&…` | 같은 탭, Total 13 ✅ |
| 대시보드 · Cost breakdown(구성) | **링크 없음** ✅ | — | 표 3행, "보기" 열 없음 |
| HW 탭 · Depreciation method mix | **링크 없음** ✅ | — | 툴팁 `Not applicable: 11 assets (13.92%)` 만, 링크 미포함 |

표 전환 행/컬럼:

| 카드 | 행 | 컬럼 |
|---|---|---|
| 월별 비용 추이 | **24** | 월·상각·유지보수·리스·합계·구분(Actual/Projected) |
| 장부가액 번다운 | **72** | 월·장부가액 (2025-09 ~ 2031-08) |
| 상각 스케줄 `/asset/cost/hw/97` | **96** | 월·월상각액·누계·장부가액 (2024-04 ~ 2032-03, 마지막 행 장부가액 ₩0) |
| Cost breakdown / by device type / by owner | 3 / 3 / 6 | 항목·금액·비율(+보기) |

- 전부 `pastCard` 음수(카드 밖 넘침 없음), 가로 스크롤 없음.

#### ⛔ B-1 — Cloud 실청구 카드: BLOCKED

- `/asset/cost?tab=cloud`의 "Cloud cost (actual billing)" 카드가 **유료 옵트인 OFF**(`Actual billing sync (paid) is off…`)라 차트 자체가 렌더되지 않는다. `/cloud-infra-monitoring/ec2-dashboard`의 같은 컴포넌트도 동일(전 리전 `PAID_FEATURE_OFF`).
- dev DB 쓰기 금지 제약상 켤 수 없어 **차트 뷰의 toolbox 제거·표 전환은 런타임 미검증**.
- 정적으로 확인한 것: `CloudBillingCard.tsx`에서 `dataViewToolbox` import·사용이 제거됐고, 잠금/빈 상태에서는 종전 `Card`로 폴백해 토글이 없다. DOM에 `.echarts-toolbox` 0건.
- 관찰: `EC2Dashboard.tsx:84`(Fleet state trend)·`VPCDetail.tsx:58`·`InstanceTimeline.tsx:128`은 **여전히 `dataViewToolbox`를 쓴다.** EC2 개요 화면 한 장에 "헤더 토글"(실청구 카드)과 "ECharts toolbox 데이터보기"(Fleet state trend)가 **섞여 보인다**. 설계 §2.3의 "카드당 데이터보기 하나" 원칙은 지켜졌지만 화면 단위로는 이중 관용구다.

---

## 4. C. 홈 · 모니터링

### C-6. 홈 "Alarm severity mix" 위젯 — **경로 PASS / 건수 FAIL**

세 경로가 전부 같은 `goToProblems(code)`로 수렴하는 것 확인:

| 경로 | 조작 | 착지 URL |
|---|---|---|
| 조각 클릭 | canvas (532,829) | `/event-alert/problem?status=AVERAGE&offset=0&show=RECENT&from=…&to=…&limit=10` |
| 툴팁 링크 | hover (531,828) → 링크 (384,894), 거리 ≈161px, **215ms** | 동일 |
| 표 행 클릭 | 1행 `Disaster` | `?status=DISASTER&…&show=RECENT` |

- 표 뷰: **6행 전량**(0건 포함), 컬럼 `Severity·Count·Share·(보기)`, 6행 모두 선택 가능, 가로 스크롤 없음.
- 셸 헤더: `HomeWidgetShell` 헤더에 토글이 `More` 왼쪽에 들어가고 **줄바꿈 없음**. 카드 폭 431 / 324 / 239 / **184px** 전 구간에서 헤더 높이 38px 고정, 제목-extra 겹침 0px.

#### 🔴 F-1 — 위젯 건수와 착지 목록 건수가 크게 다르다 (HIGH)

| 위젯 표시 | 착지 목록 |
|---|---|
| Average **756** | `status=AVERAGE&show=RECENT` → **Total 51 items** |
| Disaster **39** | `status=DISASTER&show=RECENT` → 목록 칩 **Disaster (0)** — **빈 목록** |
| 합계 942 | 문제 화면 `All (70)` |

- 재현: 홈 → Alarm severity mix 표 뷰 → `Disaster 39` 행 클릭 → `/event-alert/problem?status=DISASTER&show=RECENT&from=1785164400&to=…` → 결과 0건.
- 창을 3년으로 넓혀도(`from=now-3y`) `AVERAGE` 242 / 전체 345로, 942와 여전히 자릿수가 다르다. 기간 폭만의 문제가 아니다.
- 문제 화면은 기본으로 **최근 30일 창 + "Show suppressed problems" OFF**인데, 위젯 숫자(`/home/summary`.alarm.severityCounts → `alertPort.countActive`)에는 그 두 제약이 없다. 헤더 알람 뱃지(70·73)는 목록 쪽과 일치한다 — **942 쪽이 이상치**.
- 🔴 **ZM-119가 만든 버그는 아니다**: 기존 "Active alarms" 위젯도 같은 942/같은 심각도 분해를 표시한다(선재 불일치). 다만 ZM-119가 그 숫자를 **"눌러서 확인하는 약속"으로 승격**시켰기 때문에, 설계서가 RECENT를 고른 근거("HISTORY로 보내면 5건을 눌렀는데 목록엔 300건")가 **반대 방향으로 깨진 상태**다(756건을 눌렀는데 51건, 39건을 눌렀는데 0건).
- 판단 필요: 위젯 카운트를 목록과 같은 축(suppressed 제외·기간 없음)으로 맞추거나, 착지 시 목록의 기간·suppressed 필터를 위젯 축에 맞춰 열어야 한다.

### C-7. 호스트그룹 모니터링 > 알림 추이 — **PASS**

`/monitoring/host-group/2?tab=alert-trend` (Linux servers, 7일 고정)

| 조작 | 결과 |
|---|---|
| 툴팁 항목 링크 | `?groupId=2&status=WARNING&offset=0&show=HISTORY&from=1787356800&to=1787443200&limit=10` |
| 막대 직접 클릭 (850,550) | `…&from=1787443200&to=1787529600` (다음 버킷) — `onPointClick` 정상 |
| 표 행 클릭 | 행 = 그날 전체(심각도 축 없음), 8행 전부 `Open →` |
| 기존 모달 "데이터표" | **그대로 동작** — 모달 제목 `Alert Trend`, 8행, `TIME·Warning·High` |

**🔴 하루 밀림 확인 결과 — 딥링크는 버킷과 정확히 같은 창이다 (PASS)**

| 막대 | 착지 from/to (epoch) | KST 환산 | 판정 |
|---|---|---|---|
| `08-22` (Warning 2) | 1787356800 → 1787443200 | 2026-08-22 **09:00** ~ 08-23 **09:00** | 버킷 경계와 **정확히 일치**(24h) |
| `08-23` (Warning 2) | 1787443200 → 1787529600 | 2026-08-23 09:00 ~ 08-24 09:00 | 일치 |

- 건수도 **정확히** 일치: 막대 `08-22 Warning: 2` → 목록 `Total 2 items` / 칩 `Warning (2)` / `All (2)`, 모드 `History`, groupId=2 반영.
- **관찰 (MEDIUM)**: 버킷 자체가 **UTC 하루**다(BE가 `(epoch/bucketSec)*bucketSec`로 절단). 그래서 x축 첫 라벨이 그대로 `2026-08-20 09:00`으로 뜨고, `08-22`라고 읽히는 막대의 실제 창은 **08-22 09:00 ~ 08-23 09:00 KST**다. 드릴다운은 이 사실에 충실하지만(그래서 건수가 맞는다), 사용자에겐 "08-22를 눌렀는데 08-23 오전 사건이 섞여 있다"로 보인다. 표 뷰가 `2026-08-22 09:00`으로 시각까지 찍어 주는 건 오히려 정직한 처리. 선재(차트가 이미 그랬음)지만 드릴다운이 생기며 눈에 띄게 됐다.
- **관찰 (LOW)**: 표 마지막 행 `2026-08-27 09:00`은 합계 0인데도 `Open →`가 붙는다. 툴팁 링크는 `value > 0`인 계열만 만드는데(설계 §4) 표 행은 그 필터가 없다 — 누르면 빈 목록이 열린다.

표 뷰: 8행 × 9열(`Date · 미분류 · 정보 · 경고 · 평균 · 높음 · 재해 · 합계 · (보기)`), 가로 스크롤 없음, 카드 밖 넘침 없음.

---

## 5. D. 공통

### D-8. 다크 모드 — **PASS** (스크린샷 `scratchpad/shot_dark_tooltip.png`)

| 대상 | 전경 | 배경 | 비고 |
|---|---|---|---|
| 툴팁 링크 | `rgb(230,232,235)` | `rgba(31,31,31,.98)` | 대비 ≈14:1 |
| 표 헤더/본문 | `rgba(255,255,255,.85)` | `#282828` / `#1F1F1F` | 대비 ≈13:1 |
| 행 끝 "보기 →" | `rgba(255,255,255,.85)` | — | `text-decoration: underline` |

- **관찰**: `ChartCard.scss`가 `color: currentColor`를 쓰므로 링크는 **색이 아니라 굵기(600)+밑줄**로만 본문과 구분된다. 주석에 명시된 의도적 선택이고 두 테마 모두 읽히지만, "누를 수 있음"의 신호가 색이 아니라는 점은 기록해 둔다.

### D-9. 375px — **PASS** (스크린샷 `scratchpad/shot_375.png`)

- `document.scrollWidth 375 == clientWidth 375` → **페이지 가로 스크롤 없음**.
- 대시보드 카드 2개(기기분류·소스×커버리지)를 표로 전환: 카드 폭 345px, 표 본문 `scrollWidth 319 == clientWidth 319` → **표 내부 가로 스크롤도 없음**, 각 6행, 헤더 38px 한 줄.
- 좁은 폭에서 `Segment` 헤더가 `Seg…`로 말줄임(정상 동작).

### D-10. 콘솔 — **PASS**

- 대상 5화면(`/asset/dashboard`, `cost?tab=dashboard`, `cost?tab=hw`, `cost/hw/97`, 알림추이) 각각 화면당 메시지 5건, **에러 1건 = 선재 React `"key" prop spread` 경고**(제외 대상)뿐.
- 대시보드에서 **토글 22회(11카드 표↔차트)** 연속 조작 중 콘솔 메시지 **0건**.
- 그 외 관측된 것은 전부 선재·무관: React Flow edge handle 경고(네트워크맵), React Router v7 future flag 경고.

---

## 6. 🔴 F-2 — 툴팁 링크로 이동하는 사이 대상이 바뀐다 (MEDIUM, 교차 결함)

**증상.** `trigger: "item"` 도넛과 `trigger: "axis"` 막대에서, 조각/막대 위 툴팁이 커서 근처에 뜨므로 **툴팁 링크로 가는 경로가 다른 조각·다른 x버킷 위를 지난다.** ECharts가 새로 hover된 항목으로 툴팁을 다시 그리면서 `data-chart-key`가 커서 밑에서 바뀌고, 클릭은 **의도한 것과 다른 필터**로 착지한다.

**재현 3건 (실제 마우스 이동, 스텝 25~30ms):**

| 화면 | hover한 항목 | 클릭 시점의 링크 | 실제 착지 |
|---|---|---|---|
| 비용 HW · Lifecycle cost mix | `Retired` (₩2,818,736) | `expired` | — (측정만) |
| 비용 HW · Lifecycle cost mix | `Planned` (0.82%) | `retired` | `?tab=hw&lifecycle=retired` |
| 호스트그룹 알림 추이 | 버킷 1 (`08-21`, Warning 3) | `2:warning` | `from/to = 08-22` 버킷 |

**영향 없는 곳:** 가로막대(`AssetHBarCard`)·누적막대(`AssetStackedBarCard`)·홈 심각도 도넛은 3/3 의도대로 착지했다. 조각이 크고 링크가 항목 밖으로 나가는 형상이라 경로가 다른 항목을 안 지난다.

**성격:** `tooltipEnterable`은 `enterable`·`hideDelay`·`confine`만 준다 — 툴팁이 **커서를 따라다니는 기본 `position`**은 그대로다. 링크를 차트 밖(예: 그리드 우상단 고정)이나 커서에서 충분히 떨어진 곳에 두면 사라진다. 재현이 마우스 속도에 의존해 **간헐적**이며, 조각이 작을수록 잘 난다.

---

## 7. 잔여·미검증

1. **B-1 Cloud 실청구 카드** 차트/표 전환·toolbox 부재 — 유료 옵트인 ON 환경에서 재검증 필요.
2. **F-1 건수 축 정합** — `/home/summary`의 `severityCounts`(942)와 문제 목록(70)의 정의 차이는 BE 확인이 필요하다(suppressed 포함 여부·기간 무한 여부). ZM-119 범위 밖이지만 드릴다운이 성립하려면 결론이 있어야 한다.
3. 비용 대시보드 "Cost by device type"의 항목명이 **코드 원문**(`server`·`notClassified`·`network`)으로 나온다 — 자산 대시보드는 `서버`·`분류되지 않음`으로 번역된다. 차트 범례 시절부터의 선재 문제지만 표 뷰가 생기며 DOM에 그대로 노출된다 (LOW).
4. "Monitored asset status" 표는 고정 본문 높이(260)를 **16px 넘는다**(`scrollHeight 276`). 같은 줄 짝(Top 10 assets with problems)이 더 커서 카드 안에 묻혀 보이지 않지만, 이 카드가 줄에서 가장 커지면 드러난다 (LOW). 원인은 2줄짜리 subtitle에 `tableScrollY = bodyHeight − 120` 보정이 모자란 것.
5. 실 LLM/실 사용자 마우스 속도 조건에서의 F-2 체감 빈도는 미측정.

---

## 8. 재현 명령

```bash
# FE
cd C:/worktrees/zm-119-fe && npm run dev -- --host 0.0.0.0 --port 5174 --strictPort

# 헤드리스 Chrome + CDP
"C:/Program Files/Google/Chrome/Application/chrome.exe" --headless=new \
  --remote-debugging-port=9334 --user-data-dir=C:/Users/DMOVE/AppData/Local/Temp/claude/chromeqa119 \
  --window-size=1600,1000 about:blank

# 툴팁 hover→링크 클릭 (예: 기기분류 막대)
node <scratchpad>/cdp2.mjs <scratchpad>/c_a3.json
```

명령 JSON·드라이버(`cdp2.mjs`)·스크린샷 3장은 세션 scratchpad
`C:\Users\DMOVE\AppData\Local\Temp\claude\C--solutions\2e70ea6a-…\scratchpad\` 에 있다.

---

# 재검증(2차) — QA·코덱스 반영분 2026-08-27

> 실행 2026-08-27 · functional-qa · 지정 8항목만 · 코드 수정 없음
> BE `C:\worktrees\zm-119-be` 최종 :3001 (pid **36212**, 무접촉) · FE `C:\worktrees\zm-119-fe` 최종 :5174 (pid **12116**) · 헤드리스 Chrome :9334 (pid **3036**)
> dev DB 쓰기: 홈 검증용 "알람 심각도 분포" 위젯 1개 추가 → **검증 후 삭제, 새로고침 후 위젯 13개 원복 확인**(§8). 그 외 쓰기 0건.

## 결과: **8항목 전부 PASS** (1차 FAIL 3건 전부 해소)

| # | 항목 | 판정 |
|---|---|---|
| 1 | 홈 알람 심각도 위젯 — 3경로 착지·건수 일치·더보기 from/to | **PASS** (1차 F-1 해소) |
| 2 | 호스트그룹/소유자 카드 — 제목·부제·표 전량 | **PASS** (1차 F-3 해소) |
| 3 | 툴팁 위치 고정 (도넛 3 · 알림추이 3) | **PASS** (1차 F-2 해소) |
| 4 | 알림추이 — 합계 0 행 비활성 · 첫 버킷 from clamp | **PASS** |
| 5 | 표 행 접근성 aria-label/tabIndex | **PASS** |
| 6 | Stacked 0건 구간 전면 비활성 | **PASS** |
| 7 | 완성도 "위치 0%" 링크 생존 | **PASS** |
| 8 | 콘솔 에러 0 · `tooltipLinks ignored` 미발생 | **PASS** |

---

### 1. 홈 "알람 심각도 분포" — **PASS**

BE 축 정정이 반영됐다. 위젯 값 = `재해 39 · 높음 4 · 보통 242 · 경고 40 · 정보 22 · 미분류 2`(합 349, 1차의 942 → 349). 기존 "현재 알람" 위젯도 같은 값으로 맞춰졌다.

| 경로 | 조작 | 착지 URL | 위젯 건수 | 목록 Total | 판정 |
|---|---|---|---|---|---|
| **조각 클릭** | canvas (494,768) 재해 | `…?status=DISASTER&offset=0&show=RECENT&from=0&to=1787799955&limit=10` | 39 | **39** | 정확 일치 |
| **툴팁 링크** | hover (524,829) → 링크, 353ms | `…?status=AVERAGE&…&from=0&to=1787800013&…` | 242 | **242** | 정확 일치 |
| **표 행** | 4행 `경고 40` 클릭 | `…?status=WARNING&…&from=0&to=1787800061&…` | 40 | **40** | 정확 일치 |

- 세 경로 모두 `from=0&to=<epoch>`를 동반한다(요구 형식 충족). 착지 화면의 심각도 칩도 `미분류 2 · 정보 22 · 경고 40 · 보통 242 · 높음 4 · 재해 39 · 전체 349`로 위젯과 등급별 동일.
- **"더보기"** href = `/event-alert/problem?offset=0&show=RECENT&from=0&to=1787799815` — from/to 동반 ✅
- ±3 허용은 **쓰지 않아도 됐다**(3등급 전부 오차 0). 다만 값 자체는 실시간이라 측정 중 `보통 241 → 242`, `전체 348 → 349`로 1건 늘었다 — 위젯과 목록을 **같은 순간에** 읽으면 항상 일치했다(드리프트는 두 읽기 사이의 실제 신규 알람).
- 표 뷰: 6행 전량(0건 포함), 컬럼 `심각도·건수·비율·(보기)`, 6행 모두 `aria-label="<등급> 세부 보기"`.
- 관찰: 카드 스코프 id가 `home-alarm-severity:90`처럼 **위젯 인스턴스 id가 접미**된다(1차엔 `home-alarm-severity`). 같은 위젯을 두 번 놓아도 링크가 교차하지 않게 한 조치로 보인다 — 정상.

### 2. 호스트그룹 / 소유자 카드 — **PASS**

| 카드 | 뷰 | 제목 | 부제 | 행/막대 |
|---|---|---|---|---|
| 호스트그룹 | 차트 | `호스트그룹별 자산 **(상위 10)**` | `자산은 여러 그룹에 속할 수 있어 … · **그 외 13개 그룹**` | 막대 **10** |
| 호스트그룹 | 표 | `호스트그룹별 자산` (괄호 **사라짐**) | `… · **표에 전체 23개 그룹**` | **23행** (10+13) |
| 소유자 | 차트 | `소유자별 자산 **(상위 10)**` | `그 외 0명` | 막대 6 |
| 소유자 | 표 | `소유자별 자산` | `표에 전체 6개 항목(미지정 포함)` | 6행 |

- 표 마지막 3행이 `Web 1 / Zabbix proxies 1 / dmove-qa-grp-e2e 1` — 차트에 없던 꼬리 그룹이 실제로 펼쳐졌다. 1차 F-3 해소.

### 3. 툴팁 위치 고정 — **PASS 6/6** (사람 손 흉내: 25ms 스텝)

`hover 시점 key` vs `클릭 시점 key`를 매 회 대조.

| 차트 | 회차 | hover key | click key | 이동 | 착지 |
|---|---|---|---|---|---|
| 비용 HW · 라이프사이클별 비용 | 1 | `active` | `active` | 290ms | `?tab=hw&lifecycle=active` |
| | 2 | `retired` | `retired` | 422ms | `?tab=hw&lifecycle=retired` |
| | 3 | `expired` | `expired` | 318ms | `?tab=hw&lifecycle=expired` |
| 호스트그룹 알림 추이 | 1 | `1:warning` | `1:warning` | 333ms | `from=1787270400&to=1787356800` · **전체 3** = 막대 3 |
| | 2 | `2:warning` | `2:warning` | 289ms | `from=1787356800&to=1787443200` · **전체 2** = 막대 2 |
| | 3 | `6:warning` | `6:warning` | 303ms | `from=1787702400&to=1787788800` · **전체 3** = 막대 3 |

- 1차 F-2(이동 중 대상 재타깃)는 **6/6 재현되지 않는다.** 289~422ms를 이동해도 툴팁이 고정돼 key가 바뀌지 않고, 1차의 250ms hideDelay 상한도 더 이상 제약이 아니다.
- 측정 주의(제품 결함 아님): 스캔으로 이전 툴팁이 떠 있는 상태에서 같은 지점을 클릭하면 툴팁 배경을 누르게 된다. 마우스를 차트 밖으로 뺀 깨끗한 상태에서 재측정하면 툴팁이 커서를 덮지 않고(`tipRect [521,841,138,68]` vs 커서 (524,829), `elementFromPoint = CANVAS`) 조각 클릭이 정상 동작한다.

### 4. 알림 추이 — 0행 비활성 · 첫 버킷 clamp — **PASS**

**표 마지막 행(합계 0):**
```
2026-08-27 09:00 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | (빈 칸)
  → chart-card-row-selectable 없음 · tabindex=null · aria-label=null
  → 클릭 무반응(URL 불변) · focus()가 걸리지 않아 Enter도 무반응
```
비교: 같은 표의 `2026-08-22 09:00 … 2` 행은 `자세히 보기 →` + `tabindex=0` + `aria-label="2026-08-22 09:00 세부 보기"`.

**첫 버킷 from clamp:**

| 값 | epoch | KST |
|---|---|---|
| 조회 from (`now-7d`, startOf minute) | — | 2026-08-20 **12:01** |
| 버킷 0 UTC 자정 경계 | 1787184000 | 2026-08-20 09:00 |
| **링크 from (실측)** | **1787194860** | **2026-08-20 12:01** ✅ |
| 링크 to | 1787270400 | 2026-08-21 09:00 (다음 버킷 경계) |

→ 첫 버킷은 UTC 자정이 아니라 **조회 from으로 clamp**된다. 목록 결과 `전체 1 items` = 막대 1. 1차에서 지적한 "라벨과 창의 어긋남"이 첫 버킷에 한해 정확히 보정됐다.

### 5. 표 행 접근성 — **PASS**

자산 대시보드 13개 표 전수:

| 카드 | 행 | 선택가능 | aria-label | tabIndex |
|---|---|---|---|---|
| 기기분류 | 6 | **3** | 3 | 3 |
| 출처×모니터링 | 6 | **4** | 4 | 4 |
| 호스트그룹 | 23 | 23 | 23 | 23 |
| OS 계열 | 7 | **0** | **0** | **0** |
| 소유자 | 6 | 6 | 6 | 6 |
| 생애주기 | 5 | **4** | 4 | 4 |
| 취득연도 | 9 | **0** | **0** | **0** |
| 만료 구간 | 6 | **5** | 5 | 5 |
| 필드별 완성도 | 10 | 10 | 10 | 10 |
| 유지보수 큐 / 모니터링 상태 / 문제 상위 / 활동 추이 | 20/4/10/30 | **0** | **0** | **0** |

- 한국어 UI에서 실측한 형식: `aria-label="Linux servers 세부 보기"`, `"DBA팀 세부 보기"`, `"⚠ 위치 세부 보기"` — 요구 형식 `{항목} 세부 보기` 일치(i18n 키 `chart_card.row_action`).
- **링크 없는 행에는 aria-label도 tabIndex도 없다** — 0건 항목(기기분류 3건·출처 2건·생애주기 1건·만료 1건)까지 정확히 걸러진다.

### 6. Stacked 0건 구간(`MovesEye · 호스트 연결` = 0, `AWS · 감시 중` = 0) — **PASS**

| 채널 | 0건 구간 | 비교(비영 구간) |
|---|---|---|
| 막대 | 폭 0 → hover·클릭 대상 없음 | — |
| 툴팁 | 도달 불가(0폭) | — |
| **범례** | `cursor: default`, 클릭 시 **URL 불변** | `Zabbix · 모니터링` = `cursor: pointer`, 클릭 → `?source=zabbix&coverage=monitored` |
| **표** | 6행 중 **4행만** selectable — 0건 2행은 행 클릭·aria·tabIndex 전무 | — |

### 7. 완성도 "위치 0%" — **PASS**

- 0폭 막대지만 축 바로 옆(352,315)에서 **hover가 잡히고 링크가 살아 있다**(`data-chart-key=location`).
- 툴팁 전문: `⚠ 위치: 0 / 79 / 채움률 0% (0/79) / 누르면 '인벤토리 비어 있음' 33건으로 이동합니다 — 이 항목이 비어 있는 79건과는 다른 집합입니다. / 자세히 보기 →`
- 클릭 → `/asset/list?qualityTag=inventory_sparse&offset=0&limit=10` · **전체 33 items** ✅
- 1차 잔여 3번(항목 결측 건수와 착지 건수가 다른 문제)이 **툴팁 고지 문구로 해소**됐다 — 다른 행에도 같은 형식이 붙는다(`⚠ 지리 좌표 … 33건으로 이동합니다 — 60건과는 다른 집합`, `취득일 … 이 항목이 비어 있는 11건으로 이동합니다`).

### 8. 콘솔 — **PASS**

| 화면 | msgs | errors | `tooltipLinks ignored` |
|---|---|---|---|
| `/home` | 128 | 1 | **0** |
| `/asset/dashboard` | 5 | 1 | **0** |
| `/asset/cost?tab=dashboard` | 5 | 1 | **0** |
| `/asset/cost?tab=hw` | 5 | 1 | **0** |
| 호스트그룹 · 알람 추이 | 5 | 1 | **0** |
| 호스트그룹 · 리소스 추이(자체 formatter 차트, 링크 미지정) | 5 | 1 | **0** |
| `/monitoring/server` (링크 미지정) | 4 | **0** | **0** |

- 유일한 error는 전 화면 공통의 **선재** React `A props object containing a "key" prop is being spread into JSX` 경고(제외 대상).
- `tooltipLinks`를 주지 않는 화면(리소스 추이·서버 모니터링)에서 `console.warn "tooltipLinks ignored"`는 **한 건도 발생하지 않았다.**

### 정리

- 1차 FAIL 3건(F-1 건수 불일치 · F-2 툴팁 재타깃 · F-3 Top N 표) **전부 해소 확인**.
- 1차 잔여 3번(완성도 착지 건수 오해)은 툴팁 고지 문구로 해소, 4번(0건 버킷 "보기") 해소.
- 홈 위젯: 검증용 1개 추가 → 삭제 → 새로고침 후 **13개 원복 확인**(라이선스·사용자·데이터소스 연결·AI 알림 분석·현재 알람·인프라 가용성·현재 발생 알람·호스트그룹 상태·최근 리포트·배치·동기화 상태·맵 요약·대표 네트워크 맵·대표 지리 맵). 언어 설정도 en으로 원복.
