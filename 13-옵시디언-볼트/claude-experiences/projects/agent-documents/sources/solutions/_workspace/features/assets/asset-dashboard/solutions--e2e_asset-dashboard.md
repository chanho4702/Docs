# E2E 런타임 검증 — 자산 현황 대시보드 (ZM-116)

> 실행 2026-08-26 · `functional-qa` · **격리 worktree** BE `C:\worktrees\zm-116-be`(:3001, dev/5433 도커 DB, 자산 79건) · FE `C:\worktrees\zm-116-fe`(:5174)
> 계약: [features/assets/asset-dashboard/contract_asset-dashboard.md](solutions--contract_asset-dashboard.md) v1.1 · 설계: [features/assets/asset-dashboard/devdesign_asset-dashboard.md](solutions--devdesign_asset-dashboard.md) §4·§5
> 검증 수단 우선순위: **API 응답 어서션 → DOM/ECharts option 어서션 → 스크린샷**(2장만 사용). 코드는 수정하지 않았다.

## 0. 결과 요약

| | 건수 |
|---|---|
| PASS | **96** (A 92 / B 4 시나리오 전 항목) |
| FAIL | **3** (F-1 LOW·BE문서 / F-2 MEDIUM·FE / F-3 LOW·FE) |
| 관찰(결함 아님) | 4 (O-1~O-4) |

시나리오별:

| # | 시나리오 | 판정 |
|---|---|---|
| A-1 | `GET /assets/dashboard` 구조·합계 27개 어서션 | **PASS** (27/27) |
| A-2 | 9종 태그 왕복 + AND + 미지태그 + expired 구분 + 페이지네이션 | **PASS 13 / FAIL 1** (F-1) |
| A-3 | 필터 6축 × 대시보드↔목록 건수·내부정합 | **PASS** (50/50) |
| A-4 | 비인증 401 · `x-visitor-id` 누락 401 | **PASS** (2/2) |
| B-5 | 사이드바 진입·라우팅·브레드크럼·도움말·콘솔 | **PASS** (O-1·O-3 관찰 첨부) |
| B-6 | KPI 6타일 값 = API · 섹션 A~E 카드 14종 | **PASS** |
| B-7 | 막대 색 실측 · 누적 범례 · 세로축 라벨 | **PASS** |
| B-8 | 필터 변경 → URL·"n건 기준"·새로고침 유지·초기화 | **PASS** |
| B-9 | 딥링크 5종 + 브라우저 뒤로가기 필터 유지 | **PASS** (O-2 관찰 첨부) |
| B-10 | live 4구간 + 문제 자산 행 클릭 → 상세 | **PASS 1 / FAIL 1** (F-3) |
| B-11 | 다크 모드 가독 | **PASS** |
| B-12 | 375px 세로 스택·가로 스크롤 없음 | **PASS** |
| (추가) | 잘못된 `qualityTag` 딥링크의 화면 거동 | **FAIL** (F-2) |

---

## 1. FAIL

### F-1 · 미지 `qualityTag`가 **HTTP 400이 아니라 HTTP 200**으로 내려온다 — LOW · 책임 BE(계약 문서)

계약 §1 "짝 엔드포인트" 표: *미지 값 → **HTTP 400 + `errorCode: ASSET_INVALID_QUALITY_TAG`***.

재현:

```bash
curl -s -b jar.txt -H "x-visitor-id: <vid>" -w "HTTP=%{http_code}\n" \
  "http://localhost:3001/assets?qualityTag=no_such_tag"
```

기대 `HTTP=400` / **실제**:

```
HTTP=200
{"status":"error","code":400,"errorCode":"ASSET_INVALID_QUALITY_TAG","message":"ASSET_INVALID_QUALITY_TAG"}
```

- 바디의 `code`·`errorCode`는 계약대로다. 어긋난 건 **전송 상태 코드 한 자리**뿐이다.
- 이 레포의 기존 관례(에러를 HTTP 200 + 바디 code로 내림, 계약 §1 "에러" 행에도 그렇게 적혀 있다)와는 **오히려 일치**한다 → 구현이 아니라 §1 표의 "HTTP 400" 문구가 틀렸을 가능성이 높다.
- FE는 `asset.api.ts`가 `envelope.status === "error"`를 1차 신호로 쓰므로 **실패로 정상 처리**한다 → 계약서가 우려한 "오타 난 딥링크가 전체 목록으로 착지"는 실제로 일어나지 않는다(아래 F-2에서 실측).
- 조치 제안: 코드를 바꾸기보다 **계약 §1 표를 `HTTP 200 + body code 400 + errorCode`로 정정**하는 쪽을 권한다(바꾸면 `/assets` 전체의 에러 관례가 이 필터에서만 갈린다).

### F-2 · 잘못된 `qualityTag` 딥링크가 화면에서 **아무것도 알리지 않는다** — MEDIUM · 책임 FE

재현: 브라우저에서 `http://localhost:5174/asset/list?qualityTag=no_such_tag` 로 이동.

기대: "알 수 없는 품질 태그" 류의 에러 표시(BE가 `ASSET_INVALID_QUALITY_TAG`를 정확히 내려주고 있다).

실제(DOM 어서션):

```json
{"rows":2,"empty":true,"toast":[],
 "total": null,                      // .ant-pagination-total-text 자체가 없음
 "필터셀렉트 표시값":"no_such_tag"}   // 원시 문자열이 그대로 칩에 박힘
```

- 표는 빈 상태, 총건수 표기가 사라지고, **토스트·에러 배너 0건**. 사용자는 "이 조건에 맞는 자산이 0대"인지 "요청이 거절된 것"인지 구분할 수 없다.
- `src/constants/asset.ts:64`에 `ASSET_ERROR_CODE.INVALID_QUALITY_TAG`가 **정의만 되어 있고 소비처가 없다**(`grep -rn "INVALID_QUALITY_TAG" src` → 상수 정의 + 주석 2곳뿐, `AssetFormModal.tsx`처럼 `error.errorCode ===`로 분기하는 코드 없음).
- 사용자가 직접 URL을 편집하거나, F-5(계약)대로 **BE가 태그 코드를 바꿨을 때** 기존 딥링크·북마크가 전부 이 무증상 빈 화면이 된다. 계약 §F-5가 "그래서 더더욱 알려야 한다"고 적어 둔 바로 그 상황이다.
- 조치 제안: `AssetListPage`에서 `errorCode === ASSET_ERROR_CODE.INVALID_QUALITY_TAG`일 때 토스트 + 해당 축 자동 해제(또는 Empty 설명 문구 교체).

### F-3 · "문제 있는 자산 Top 10" 표의 `status`·`deviceType`이 **번역되지 않은 원값** — LOW · 책임 FE

재현: `/asset/dashboard` → D. 운영 연결 섹션.

같은 카드 묶음 안에서 같은 개념이 두 언어로 나온다(kr 로케일):

| 위치 | 표시 |
|---|---|
| `모니터링 자산 상태` 막대·범례 | 정상 6 · 주의 5 · **장애 47** · 미상 17 |
| 바로 아래 `문제 있는 자산 Top 10` 표 상태 열 | `Unavailable` · `Unknown` · `Degraded` |

출처: `AssetProblemAssetsTable.tsx:79-84` — `render: (value) => <Tag …>{value}</Tag>` 로 BE 원값(`'Healthy'|'Degraded'|'Unavailable'|'Unknown'`)을 그대로 찍는다(태그 **색**만 매핑).

같은 표의 `deviceType`도 코드 원값이다 — `AssetProblemAssetsTable.tsx:70` / `AssetWorkQueueTable.tsx:57` 둘 다 `{[row.deviceType, row.owner].join(" · ")}`:

```
Atlassian Cloud Site Check
notClassified            ← 기기분류 차트에서는 "분류되지 않음"으로 나오는 그 값
```

- 심각도(`maxSeverity`)는 `severityName()`으로 제대로 한글화돼 있어(재해·보통) **같은 행 안에서도 번역 여부가 갈린다**.
- 데이터 정확성 문제는 아니지만, 이 화면의 취지("미분류 62건을 보여 조치시키기")를 감안하면 표에서만 코드가 노출되는 건 눈에 띈다.

---

## 2. 상세 결과

### A-1 · `GET /assets/dashboard` (27/27 PASS)

재현: `curl -s -b jar.txt -H "x-visitor-id: <vid>" http://localhost:3001/assets/dashboard > dash.json` → `node assertA1.js`
(스크립트: `<scratchpad>/assertA1.js`)

```
PASS | wrapper status/code                        | success/200
PASS | population.total == kpi.total               | 79 vs 79
PASS | expiry 6구간 합 == population.total          | 79 vs 79 :: {"expired":12,"within30":7,"within60":8,"within90":0,"beyond90":28,"unknown":24}
PASS | live.statusCounts 합 == kpi.monitored        | 75 vs 75 :: {"healthy":6,"degraded":5,"unavailable":47,"unknown":17}
PASS | topProblemAssets <= 10 & problem>0          | n=10
PASS | tagCounts 9키 존재                           | keys=9 (0값 키 없음)
PASS | completeness 10항목 & pct 오름차순            | pcts=0,1.3,3.8,21.5,24.1,44.3,69.6,86.1,86.1,86.1
PASS | completeness field 집합 == 계약 10종
PASS | byDeviceType notClassified 마지막            | server,network,security,database,hardware,notClassified
PASS | byDeviceType colorPreset 존재(전건)          | blue/geekblue/volcano/purple/gold/default
PASS | byDeviceType에 구 필드 color 없음             | (v1.1 rename 반영 확인)
PASS | byOsFamily 7종 고정순서                       | windows,linux,unix,network_os,hypervisor,other,unknown
PASS | activity.daily 30개                          | n=30, 빈 날 24, 2026-07-28~2026-08-26
PASS | activity.daily 날짜 오름차순·중복없음
PASS | byOwner name:null 마지막
PASS | kpi zabbix+custom == total                   | 78+1
PASS | kpi monitored+unmonitored == total           | 75+4
PASS | lifecycleReview == planned+retired+expired+other | 25
PASS | byStatus 5값 합 == total                      | 79
PASS | kpi.unclassified == tagCounts.unclassified    | 62
PASS | kpi.ownerMissing == tagCounts.owner_missing   | 11
PASS | generatedAt UTC ISO Z                         | 2026-08-26T03:10:13.805Z
PASS | filterOptions 존재                             | owners=5, hostGroups=23
PASS | workQueue <= 50                                | n=50, workQueueTotal=76
PASS | workQueue 태그 수 내림차순
PASS | inventory_disabled ∩ inventory_sparse == 0     | 겹침 0 (§3 규칙)
PASS | byHostGroup Top10 내림차순
```

> 계약 §5 실측 샘플(11:52 KST)과 **값이 전부 동일**했다 — 재실행 사이에 드리프트 없음.

### A-2 · 9종 태그 왕복 (13 PASS / 1 FAIL)

`tagCounts[X]` == `GET /assets?qualityTag=X`의 `total` — **9종 전건 일치**:

| 태그 | 대시보드 | 목록 total |
|---|---:|---:|
| unclassified | 62 | 62 |
| classification_tag_mismatch | 29 | 29 |
| owner_missing | 11 | 11 |
| host_unlinked | 1 | 1 |
| host_disabled | 3 | 3 |
| inventory_disabled | 33 | 33 |
| inventory_sparse | 33 | 33 |
| cost_missing | 11 | 11 |
| expired | 12 | 12 |

```
PASS | AND 결합 qualityTag=unclassified&coverage=unmonitored | 2 (tag만 62, coverage만 4)
PASS | blank qualityTag = 필터 미적용                          | 79 == 79
PASS | qualityTag=expired(12) vs lifecycle=expired(8) 구분     | savedView=hardware_eol도 8
PASS | 페이지네이션 limit=3&offset=30                          | total=33, rows=3
FAIL | 미지 태그 HTTP 400                                      | → F-1
```

### A-3 · 필터 6축 (50/50 PASS)

각 축 1개 값으로 대시보드·목록을 동시에 조회 — `population.filtered=true`, `population.total` == 목록 `total`, 그리고 **필터 적용 상태에서도** expiry 합·live 합·daily 30개·tagCounts 9키·byOsFamily 7종·notClassified 마지막·`filterOptions.owners` 5개 유지를 재검증했다.

| 축 | 값 | 대시보드 | 목록 | filterOptions.owners |
|---|---|---:|---:|---|
| deviceType | server | 16 | 16 | 5개 유지 |
| owner | DBA팀 | 14 | 14 | 5개 유지 |
| groupName | Linux servers | 41 | 41 | 5개 유지 |
| lifecycle | planned | 9 | 9 | 5개 유지 |
| source | zabbix | 78 | 78 | 5개 유지 |
| coverage | unmonitored | 4 | 4 | 5개 유지 |

추가:
- `?source=zzz`(무효 값) → 필터 미적용, `total=79`, `filtered=false` — 계약 §1대로.
- `?limit=1&sortBy=name&keyword=zzz&includeExcluded=true` → **전부 무시**, `total=79` — 계약 §1 "이 EP에 없다"대로.
- 한글 값(`owner=DBA팀`)은 cp949 함정을 피하려 Node `fetch` + `encodeURIComponent`로 보냈다.

### A-4 · 인증 (2/2 PASS)

```
쿠키 없음            → HTTP 401 {"status":"error","code":401,"message":"INVALID_TOKEN"}
x-visitor-id 없음     → HTTP 401 {"status":"error","code":401,"message":"Missing x-visitor-id header"}
```

> ⚠️ 토큰은 **로그인 시 보낸 visitor-id에 묶인다**. 다른 visitor-id로 같은 쿠키를 쓰면 `INVALID_TOKEN` 401이 난다(검증 중 실제로 한 번 오진할 뻔했다 — BE 결함 아님).

### B-5 · 진입 (PASS)

- 사이드바 `자산 관리` 하위 **첫 항목이 "대시보드"**, 이어서 자산 목록 / 비용 / 맵.
- `/asset/dashboard` 렌더, 브레드크럼 `홈 / 자산 / 대시보드`.
- 도움말 버튼 존재 — `.page-header` 안 `<span role="button" aria-label="이 화면 도움말" class="anticon-question-circle page-guide__icon">` (page-guide 키 `asset_dashboard`).
- 콘솔: **신규 에러 0**. 관찰 O-3 참조.

### B-6 · KPI·섹션 (PASS)

| 타일 | 화면 | API |
|---|---|---|
| 관리 자산 | 79 건 / Zabbix 78 · MovesEye 1 · 제외 0 | 79 / 78 / 1 / 0 |
| 모니터링 커버리지 | 94.9 % / 미모니터링 4건 | 94.9 / 4 |
| 미분류 | 62 건 (전체의 78.5%) | 62 |
| 소유자 미지정 | 11 건 (13.9%) | 11 |
| 생애주기 검토 | 25 건 (예정 9 · 폐기 8 · 만료 8) | 25 / 9 / 8 / 8 |
| 데이터 완성도 | 42.3 % / 10항목 모두 채운 자산 0건 | 42.3 / 0 |

섹션 구분자 5개 = `구성 / 생애주기 / 데이터 품질 / 운영 연결 / 최근 변화`, 제목 있는 카드 **14종** 전부 존재(기기분류별 자산·출처×모니터링·호스트그룹 Top 10·OS 계열·소유자별 자산·생애주기 상태·취득연도별 연식·만료 구간·필드별 완성도·관리 작업 큐·모니터링 자산 상태·문제 있는 자산 Top 10·30일 활동 추이·최근 활동).

헤더 `79건 기준` = `population.total`, `마지막 동기화 2026-08-24 23:00` + `staleSync` 경고 아이콘.

### B-7 · 막대 색·축 (PASS)

**색 판정은 canvas 픽셀 히스토그램으로 실측**했다(DOM으로 못 읽는 항목이라 스크린샷도 1장 첨부).
`기기분류별 자산` 캔버스에서 알파 200 이상 픽셀을 세어 계약 preset의 실제 hex를 찾은 결과:

| 기대(preset → hex) | 칠해진 픽셀 |
|---|---:|
| 서버 `blue` → `#1677ff` | **1033** |
| 네트워크 `geekblue` → `#2f54eb` | **21** (count=1이라 막대가 가늘다) |
| 보안 `volcano` / DB `purple` / HW `gold` | 0 (count 0 — 막대 없음이 정상) |
| 분류되지 않음 `default` → 회색 `rgb(198,202,209)` | **358** |

ECharts option 직접 확인: `series[0].data[].itemStyle.color` = `["#8c95a3","#faad14","#722ed1","#fa541c","#2f54eb","#1677ff"]` — **6조각 전부 서로 다른 hex**로 변환돼 있다(계약 F-1이 경고한 "preset 이름을 그대로 넘겨 일부만 칠해지는" 회귀 없음).

- 누적 막대: `출처 × 모니터링` 범례 = `Zabbix · 모니터링 75 / Zabbix · 호스트 비활성 3 / MovesEye · 호스트 연결 0 / MovesEye · 연결 없음 1` (0 조각도 범례에 남음), 조각 안 값 라벨 표시. `생애주기 상태`도 동일(사용중 54 · 예정 9 · 폐기 8 · 만료 8 · 기타 0).
- 세로 막대 축 라벨: `취득연도별 연식` x축 `2018…2026` 9개 + 범례 `내용연수 이내/경과`, `30일 활동 추이` x축 **30개 전부**(`07-28`~`08-26`, 0건 날 포함) + 4계열(등록/수정/제외/복원). `synced`는 의도적으로 계열이 아니라 markPoint(코드 주석 명시).

스크린샷: `<scratchpad>/zm116_e2e_devicetype-bar-colors.png`

### B-8 · 필터 상호작용 (PASS)

```
기기분류 셀렉트 → "서버" 선택
  URL      : /asset/dashboard?deviceType=server
  헤더      : "79건 기준" → "16건 기준"
새로고침(F5) → URL·"16건 기준"·셀렉트 표시값 "서버" 모두 유지
"초기화" 클릭 → /asset/dashboard (쿼리 제거), "79건 기준", 셀렉트 6개 전부 비움
```
`초기화` 버튼은 필터가 걸렸을 때만 나타난다.

### B-9 · 딥링크 (PASS)

| 출발 | 착지 | 목록 total |
|---|---|---:|
| KPI `미분류` 타일 | `/asset/list?deviceType=notClassified` | **62** ✅ |
| 작업 큐 태그 `인벤토리 비활성` | `?qualityTag=inventory_disabled` | **33** ✅ |
| `만료 구간` 차트 "이미 경과" | `?qualityTag=expired` | **12** ✅ (F-3 수정 실증 — `lifecycle=expired`의 8이 아니다) |
| `필드별 완성도` "⚠ 위치" | `?qualityTag=inventory_sparse` | **33** ✅ |
| `호스트그룹 Top 10` "Linux servers" 막대 | `?groupName=Linux+servers` | **41** ✅ |

- 목록 쪽 `qualityTag` 셀렉트가 `인벤토리 비활성`으로 **표시**되고 clear(×)로 **해제** → 쿼리 제거, `total` 79 복귀.
- 현재 필터 동반: `/asset/dashboard?deviceType=server&coverage=monitored`(14건) → `자산 목록` 버튼 → `/asset/list?deviceType=server&coverage=monitored`(14 items).
- **브라우저 뒤로가기** → `/asset/dashboard?deviceType=server&coverage=monitored`, "14건 기준", 셀렉트 `서버`·`모니터링됨` 그대로 복원.

### B-10 · 운영 연결 (PASS 1 / FAIL 1 → F-3)

- `모니터링 자산 상태` 4구간 = **정상 6 · 주의 5 · 장애 47 · 미상 17** (= API `live.statusCounts`, 합 75 = `kpi.monitored`). 부제에 `12:30:07 기준 · 60초 캐시`.
- `문제 있는 자산 Top 10` 10행. 첫 행 링크 클릭 → `/asset/list/133` 자산 상세, 브레드크럼 `홈 / 자산 / 자산 목록 / Atlassian Cloud Site Check` (계약 §5 샘플의 assetId 133과 동일).
- 상태·기기분류 라벨 미번역 → **F-3**.

### B-11 · 다크 모드 (PASS)

토글 후 `body.color = rgb(255,255,255)`, `.ant-card background = rgb(31,31,31)`. 11개 차트 전부 재렌더되고 축 라벨·값 라벨·범례 가독. 막대 색은 라이트와 동일 팔레트 유지.
스크린샷: `<scratchpad>/zm116_e2e_darkmode.jpg`

### B-12 · 375px (PASS)

MCP 창이 최대화 상태라 `resize_window`가 먹지 않아, **같은 오리진에 375px 폭 iframe으로 `/asset/dashboard`를 로드**해 측정했다.

```json
{"inner":375, "docScrollWidth":360, "docClientWidth":360, "bodyScrollWidth":360, "cards":22}
```

- `scrollWidth === clientWidth` → **가로 스크롤 없음**.
- KPI 6타일 전부 `x=15, width=330`에 서로 다른 y → **세로 스택**.
- 넘치는 요소는 표(`<table>` right=763)뿐이며 `.ant-table-header`가 `overflow-x:hidden`(내부 스크롤)로 가둬 문서 폭에 영향 없음.

---

## 3. 관찰 (결함 아님 / 범위 밖)

- **O-1 · 로그인 직후 첫 렌더에서 사이드바 메뉴가 비어 있었다.** `aside`에 `ul.ant-menu`는 있으나 자식 0개. 원인은 `SideNav.tsx:124 if (!permissions) return []` — `users/me/permissions`가 아직 안 붙은 상태. 라우팅 한 번 더 하거나 새로고침하면 정상 복구되고, `/asset/dashboard`를 직접 열었을 때는 재현되지 않았다. **ZM-116 코드와 무관한 선재 레이스**로 판단해 FAIL로 세지 않았다.
- **O-2 · KPI `미분류` 타일의 딥링크 축이 `qualityTag=unclassified`가 아니라 `deviceType=notClassified`다**(`AssetDashboardPage.tsx:371`). 두 축의 결과 집합·건수가 **똑같이 62**라 사용자 체감 차이는 없다. 다만 작업 큐·완성도 막대는 `qualityTag`로 통일돼 있어 이 타일만 축이 다르다 — 통일하고 싶다면 한 줄이다.
- **O-3 · 콘솔 에러 1건**: `A props object containing a "key" prop is being spread into JSX` (`rc-virtual-list` × React 19). **`/asset/list`에서도 동일하게 1건** 나므로 대시보드가 만든 것이 아니다(선재 라이브러리 경고).
- **O-4 · MCP 탭은 `visibilityState=hidden`이라 페인트 전에는 ECharts canvas가 DOM에 아예 없다.** 스크롤/스크린샷으로 페인트를 강제하면 11개 전부 canvas가 생긴다. "차트가 안 그려진다"로 **오진 금지**. 이번 검증도 그래서 색 판정 전에 페인트를 먼저 유발했다. (기존 메모 [[chrome-mcp-hidden-tab-no-raf]]의 확장 사례 — 애니메이션 중간 상태뿐 아니라 **canvas 생성 자체**가 지연된다.)

---

## 4. 재현 자산

| 파일 | 용도 |
|---|---|
| `<scratchpad>/assertA1.js` | A-1 27개 어서션 |
| `<scratchpad>/assertA2.js` | A-2·A-3 (9종 왕복 + 6축) |
| `<scratchpad>/dash.json` | 검증에 쓴 실제 응답 |
| `<scratchpad>/zm116_e2e_devicetype-bar-colors.png` | B-7 막대 색 |
| `<scratchpad>/zm116_e2e_darkmode.jpg` | B-11 다크 모드 |

> `<scratchpad>` = `C:\Users\DMOVE\AppData\Local\Temp\claude\C--solutions\2e70ea6a-09df-4f5c-8a78-5575dcb760e3\scratchpad`

---

## 5. 재검증 (2차) — 2026-08-26

> FE 수정분(`features/assets/asset-dashboard/qa_asset-dashboard.md` F1~F5 · 본 문서 F-2·F-3 · 관찰 O-2) 대상 **지정 6항목만** 재실행.
> 같은 격리 환경(BE :3001 / FE :5174), 코드 수정 없음. 1차 결과(§1~§4)는 그대로 둔다.

**결과: PASS 5 / FAIL 1(부분)** — 새 결함 0, 잔여 1건은 공용 필터 컴포넌트의 표시 상태 문제다.

| # | 항목 | 판정 |
|---|---|---|
| 1 | 잘못된 딥링크 처리 | **부분 FAIL** — 4개 조건 중 3 PASS, 셀렉트 표시값만 잔존(R-1) |
| 2 | 표 2종의 `status`·기기분류 번역 | **PASS** |
| 3 | 소스×커버리지 custom 조각 툴팁·딥링크 2종 | **PASS** |
| 4 | `owner` 충돌 축 제거 / 비충돌 축 유지 | **PASS** |
| 5 | KPI 미분류 → `qualityTag=unclassified` 62 | **PASS** |
| 6 | 콘솔 에러 0 | **PASS** |

### 1. 잘못된 `qualityTag` 딥링크 — 3/4 PASS

재현: `/asset/list?qualityTag=no_such_tag&offset=20&limit=10` (offset을 일부러 20으로 줬다)

| 조건 | 판정 | 실측 |
|---|---|---|
| 한글 에러 토스트 | ✅ | `'no_such_tag'은(는) 유효한 관리 상태 값이 아닙니다. 해당 필터를 해제했습니다.` (MutationObserver로 `.ant-message-notice-content` 포착) |
| URL에서 `qualityTag` 제거 | ✅ | `?offset=0&limit=10` |
| `offset` 초기화 | ✅ | `20` → `0` (제거가 아니라 `0` 설정 — 1페이지 복귀라는 목적은 충족) |
| 정상 목록 복귀 | ✅ | `전체 79 items`, 10행 렌더 |
| **셀렉트에 원시 문자열 없음** | ❌ | 필터 셀렉트가 **`no_such_tag`를 그대로 표시한 채 남는다** |

#### R-1 · 자동 해제 후에도 필터 셀렉트에 원시 태그 문자열이 남는다 — LOW~MEDIUM · 책임 FE

```json
{"q":{"offset":"0","limit":"10"},          // URL은 정리됨
 "total":"전체 79 items",                   // 목록도 정상
 "sels":["이름","no_such_tag","제외 숨김","10 / 페이지"]}   // ← 칩만 거짓말
```

- **재현 100%** — `bogus_tag_2`로 다시 해도 동일(`sels`에 `bogus_tag_2`).
- 같은 주소를 **새로 로드**하면(`/asset/list`) 셀렉트는 비어 있다 → URL·쿼리·응답은 전부 정상이고 **표시 상태만 stale**이다.
- 원인: 공용 `src/components/Table/DmoveTableFilter.tsx:97-106`

  ```tsx
  const paramValue = searchParams.get(item.key);
  const defaultValue = … (paramValue ?? item.defaultValue ?? null);
  <Select key={item.name} defaultValue={defaultValue} … />
  ```

  `value`가 아니라 **`defaultValue`(비제어)**이고 `key`가 `item.name`(고정 라벨)이라, `updateParams`로 쿼리를
  지워도 React가 같은 Select 인스턴스를 유지해 내부 값이 그대로 남는다. 사용자가 × 로 직접 지운 1차 검증
  케이스가 통과했던 건 그때는 **내부 상태 자체를 사용자가 바꿨기** 때문이다.
- 영향: 목록은 79건(옳음)인데 칩은 "no_such_tag로 걸러진 목록"이라고 말한다 — 토스트가 사라진 뒤 화면에
  남는 유일한 흔적이 **틀린 흔적**이다.
- 이 컴포넌트는 목록 8화면이 공유하므로(자산·비용·사용자·리포트·Zabbix 관리 등) 공용 수정은 파급이 크다.
  자산 목록 안에서 끝내려면 `qualityTag` 셀렉트에 값이 섞인 `key`(예: `key={`${item.key}:${paramValue ?? ""}`}`)를
  주어 강제 리마운트시키는 쪽이 가장 좁은 수정이다.

### 2. 표 2종 라벨 번역 — PASS

`문제 있는 자산 Top 10` (헤더: 자산 / 상태 / 활성 문제 / 최고 심각도):

```
Atlassian Cloud Site Check / 분류되지 않음        | 장애 | 592 | 재해
Proxmox node 10.220.0.12  / 분류되지 않음 · DBA팀 | 미상 |  98 | 보통
Proxmox node 10.220.0.14  / 분류되지 않음 · 총무팀| 미상 |  48 | 보통
```

`관리 작업 큐`:

```
10.220.0.20 / 분류되지 않음        | 미분류·분류 태그 키 불일치·소유자 미지정·비용 미입력 | Zabbix | 모니터링됨
10.220.0.29 / 분류되지 않음 · 보안팀| 미분류·분류 태그 키 불일치·인벤토리 비어 있음·비용 미입력 | Zabbix | 모니터링됨
```

- 두 카드 innerText 전체에 `notClassified`·`Healthy|Degraded|Unavailable|Unknown` **0건**.
- 상태 어휘가 바로 위 막대(정상/주의/장애/미상)와 **일치** — 1차 F-3이 지적한 "한 카드 안 두 언어" 해소.

### 3. 소스 × 커버리지 custom 조각 — PASS (정적 QA F1·F2)

- **툴팁**(범례 항목 `title` 속성, `cursor:pointer`):
  `목록에는 "연결된 것만" 고르는 필터가 없어 MovesEye 자산 전체가 열립니다 (연결 0 · 미연결 1).`
  → 요구한 "연결 n · 미연결 n"이 실제 값으로 채워져 있다.
- **`MovesEye · 호스트 연결`(customLinked) 클릭** → `/asset/list?source=custom&offset=0&limit=10` · `전체 1 items`
  (F1이 지적한 `coverage=monitored`(구조적 0건)로 가지 않는다).
- **`MovesEye · 연결 없음`(customUnlinked) 클릭** → `?source=custom&qualityTag=host_unlinked` · `전체 1 items`,
  셀렉트에 `MovesEye` + `호스트 연결 없음` 표시 (F2가 지적한 custom 전체 열림 해소).
- BE 대조: `GET /assets?source=custom&qualityTag=host_unlinked` → `total=1`, `?source=custom` → `total=1` (동일).

### 4. `owner` 충돌 축 처리 — PASS (정적 QA F3)

전제: `/asset/dashboard?owner=보안팀`(URL 인코딩 `%EB%B3%B4%EC%95%88%ED%8C%80`) → `14건 기준`, 셀렉트 `보안팀`,
KPI `소유자 미지정 0건 (전체의 0%)`.

| 클릭 | 결과 URL | total | `owner` |
|---|---|---:|---|
| KPI `소유자 미지정` | `?qualityTag=owner_missing&offset=0&limit=10` | **11** | **제거됨** ✅ |
| 작업 큐 `인벤토리 비어 있음` | `?owner=보안팀&qualityTag=inventory_sparse&offset=0&limit=10` | **6** | **유지됨** ✅ |

BE 대조로 두 동작이 왜 갈라져야 하는지 확인했다:

```
GET /assets?owner=보안팀&qualityTag=owner_missing     → total 0   ← 있을 수 없는 조합
GET /assets?qualityTag=owner_missing                  → total 11
GET /assets?owner=보안팀                              → total 14
GET /assets?owner=보안팀&qualityTag=inventory_sparse  → total 6   ← 직교, 유지가 옳다
```

`deepLink.ts`의 `QUALITY_TAG_CONFLICTS`(owner_missing→owner, unclassified·classification_tag_mismatch→deviceType)가
의도대로 동작하고, 목록에 남은 `savedView=ownership` 축은 더 쓰이지 않는다.

### 5. KPI 미분류 축 통일 — PASS (관찰 O-2)

`미분류 62건 (전체의 78.5%)` 타일 클릭 → `/asset/list?qualityTag=unclassified&offset=0&limit=10` · `전체 62 items`,
셀렉트 `미분류`. 1차의 `deviceType=notClassified`에서 **작업 큐·완성도 막대와 같은 `qualityTag` 축으로 통일**됐다
(건수 62는 동일하게 유지).

### 6. 콘솔 — PASS

대시보드·목록 왕복 후 `onlyErrors` 조회 결과 **1건뿐**이며, 그 1건은 1차에서 선재로 판정한
`rc-virtual-list` × React 19 경고(`A props object containing a "key" prop is being spread into JSX`)다.
**신규 에러 0건.**

### 재검증 환경

BE `:3001` pid **30548**(런처 34520) / FE `:5174` pid **32872**(런처 440) — 재검증 종료 후 둘 다 종료. `:3000`·`:5173` 무접촉.
