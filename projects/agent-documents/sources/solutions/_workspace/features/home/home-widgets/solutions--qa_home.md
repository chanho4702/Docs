# 통합 QA — 홈(랜딩) 경계면 정적 검증  `qa_home.md`

작성: integration-qa · 2026-07-20 · 브랜치 ZM-87 · 검증 방식: **정적 교차대조**(런타임 미기동)
입력: `features/home/home-widgets/contract_home.md` · `devdesign_home.md` · BE `com.dmove.moveseye.home.*` · FE `moveseyee_fe/src/**`

## 총괄 판정: **PASS** (2026-07-20 재검증 — fe-engineer 수정분 반영)

> 1차 검증(FAIL, HIGH 1 / LOW 2) → fe-engineer 수정 → **표적 재검증 결과 3건 전부 해소, 신규 이슈 0건**.

| 심각도 | 1차 | 재검증 후 | 책임 |
|---|---|---|---|
| HIGH | 1 | **0 (해소)** | FE |
| MEDIUM | 0 | 0 | — |
| LOW | 2 | **0 (1건 해소 / 1건 오판 정정)** | FE |

### 재검증 요약
- **HIGH-1 해소**: `en.json`/`kr.json` 플랫 `"home"` 삭제(루트 `home`=객체 1개만 잔존), `useBreadcrumbs` 2곳 `t("home.title")` 교체 확인. 잔존 `t("home")` 소비처 0건.
- **LOW-2 해소**: 맵 카드 지리 "더보기" 링크 `PATH_ROOTS_ASSET.geoMap`로 변경 확인.
- **LOW-1 정정(오판)**: 1차의 "FE 테스트 부재" 판정은 **오류**. `useHome.test.tsx`·`HomePage.test.tsx` 실재하며 언랩 깊이·부분 null·리포트 게이팅 커버. **PASS로 정정**.
- shape/언랩/경로/권한/재사용 EP/심각도 매핑은 1차부터 PASS 유지.

---

## 1. Shape 3자 대조 (BE DTO ↔ 계약 ↔ FE 타입)

| 항목 | 기대(BE 실코드) | 실제(FE) | 판정 |
|---|---|---|---|
| `severityCounts` 키 | `String.valueOf(severity)` "0"~"5" 6키 (HomeService.java:86) | `Record<"0".."5", number>` (home.ts:8-10) | **PASS** |
| `alarm.totalOpen` | `long` (AlarmSummary) | `number` | **PASS** |
| `infra.totalHosts/availableHosts` | `int` / `long` (InfraSummary, HomeSummaryDto.java:43-44) | `number`/`number` | **PASS** |
| `infra.availabilityPct` | `double` 소수1자리 | `number` | **PASS** |
| `infra.healthScore` | `Double` nullable (HomeSummaryDto.java:47) | `number \| null` (home.ts:23) | **PASS** |
| `asset` ↔ `TAssetSummary` | `AssetSummaryDto`{total,zabbixCount,customCount,excludedCount,monitored,unmonitored,lifecycleReview,lastSyncedAt} | `TAssetSummary` 동일 8필드(asset.ts:190-200) — 필드명 전부 일치, 순서만 상이(JSON 무관) | **PASS** |
| `map.geoWorstSeverity` | `String` "0"~"5" \| null (HomeService.java:137) | `THomeSeverityCode \| null` (home.ts:33) | **PASS** |
| `map.networkMapCount` | `long` | `number` | **PASS** |
| `recentReports[].id` | `Integer` | `number` | **PASS** |
| `recentReports[].periodType` | `ReportPeriodType`(WEEK/MONTH) | `TReportPeriodType`="WEEK"\|"MONTH" | **PASS** |
| `recentReports[].periodStart` | `LocalDate.toString()`="2026-06-08" (RecentReportDto.java:29) | `string`(ISO date), dayjs `DATE_ONLY` 파싱 | **PASS** |
| `recentReports[].createdAt` | `LocalDateTime` `@JsonFormat` UTC ISO | `string` (UI 미표시, 타입만 보유) | **PASS** |
| `asset.lastSyncedAt` | `LocalDateTime` `@JsonFormat` UTC ISO \| null | `string \| null` | **PASS** |

### null 분기 (비관리자 null vs 관리자 0건 [])
- BE: `safeRecentReports`가 `!AdminAccessChecker.isAdmin` 이면 try 이전에 **`null` 반환**(HomeService.java:148-151). 관리자+0건은 `getRecentReports`가 `List.of()`=`[]` 반환 → 테스트 `superAdminGetsReports`가 `[]` 확인(HomeServiceTest.java:138).
- FE: `showReports = recentReports != null`(HomePage.tsx:29). `null`(비관리자·로딩중)→카드 미노출, `[]`→카드 노출+Empty("최근 리포트 없음"), 배열→목록.
- 판정: **PASS** (계약 §1 null 규칙 및 §3 리포트 카드 노출 규칙과 일치).

---

## 2. 래퍼/언랩 깊이

- BE: `ApiResult<HomeSummaryDto>` + `SyncTimeResponseAdvice` syncTime 주입.
- FE 3종 훅 전부 `useDmoveQuery<T>`로 payload 직접 수신(과다/과소 언랩 없음):
  - `useHomeSummary` → `THomeSummary` → `summary?.alarm/infra/asset/map/recentReports` (data.data 없음) — **PASS**
  - `useHomeProblems` → `TResponseList<TProblemLists>` → `problems?.items` — **PASS**
  - `useHomeHostGroupProblems` → `TResponseList<TByHostGroup>` → `groups?.items` — **PASS**
- BE 테스트 mock 깊이(HomeServiceTest)는 서비스 payload 레벨로 정상. 메모리 `fe-usedmovequery-unwrap` 규약 준수.
- 판정: **PASS**

---

## 3. 재사용 EP 정합 (계약 §2)

| EP | 경로(BE) | FE 호출 | 요청 파라미터 | 응답 | 판정 |
|---|---|---|---|---|---|
| 발생 알람 | `@GetMapping("/problems")` (EventController.java:56, 클래스 `/event`) | `API.get("/event/problems?"+params)` (event.api.ts:69) | `limit=5,offset=0,sortBy=occurrenceTime,sortDirection=DESC` (useHome.ts:37-42) ↔ BasePageDto(limit/offset/sortDirection) + EventListReqDto(sortBy) | `EventProblemResListDto{items,total,statusCounts}` ↔ `TResponseList<TProblemLists>` → `.items` | **PASS** |
| 호스트그룹 상태 | `@GetMapping("/hostgroup-problems")` (HostController.java:178, 클래스 `/hosts`) | `API.get("/hosts/hostgroup-problems?"+params)` (event-alert.ts:12) | `limit=5,offset=0,sortDirection=DESC` (useHome.ts:57-61) ↔ BasePageDto | `PaginationResponseDto<HostGroupProblemSummaryDto>{items,total}` ↔ `TResponseList<TByHostGroup>` → `.items` | **PASS** |

- `sortBy`/`sortDirection` 필드명 BE `@ModelAttribute` 바인딩 명칭과 일치. `SortDerection.DESC`(FE) ↔ `SortDirection.DESC`(BE) 값 일치. KPI 심각도 칩은 `/home/summary`의 `alarm.severityCounts` 단일 출처, `/event/problems`의 `statusCounts`는 미사용(계약 §2-1 준수, useHome.ts:34 주석) — **PASS**.
- `TByHostGroup` 필드(groupId, groupName, hostNames, notClassified~disaster, total)가 `HostGroupProblemSummaryDto`(계약 §2-2)와 일치 — **PASS**.

---

## 4. 경로/메서드

| 항목 | BE | FE | 판정 |
|---|---|---|---|
| `GET /home/summary` | `@RequestMapping("/home")` + `@GetMapping("/summary")` (HomeController.java:25,37) | `API.get("/home/summary")` (home.api.ts:11) | **PASS** |
| 쿼리 파라미터 | 없음(`@CurrentUser`만) | 없음 | **PASS** |
| 인증/visitor | `@SecurityRequirement bearer` + `@VisitorIdCheck` (컨트롤러 레벨) | axios `withCredentials`/공통 헤더(기존 설정) | **PASS** |

---

## 5. 라우팅/메뉴 정적 정합

| 항목 | 확인 | 판정 |
|---|---|---|
| `/` → `/home` Navigate | routes.tsx:170 `<Navigate to={PATH_HOME} replace />` | **PASS** |
| SignIn 로그인 후 리다이렉트 | SignIn.tsx:86 `navigate(PATH_HOME)` | **PASS** |
| 홈 라우트 + 가드 | routes.tsx:185-193 `PATH_HOME` → `HomePage`, `PageWrapper`에 permissionKey/adminOnly 없음(인증만) | **PASS** (설계 §2 가드 규칙 일치) |
| SideNav 메뉴 | SideNav.tsx:73-75 key `"home"`, `HomeOutlined`, `t("home.menu")` | **PASS** |
| MobileSideNav 메뉴 | MobileSideNav.tsx:90-92 동일 | **PASS** |
| 카드 바로가기 대상 라우트 존재 | 알람/그룹 `PATH_EVENT_ALERT.problem`·`PATH_MONITORING.hostGroup`, 맵 `serverlocation`(routes:541)·`networkMap`(routes:517), 자산 `PATH_ROOTS_ASSET.list`(routes:505), 리포트 `PATH_SETTING.reportManagement`(routes:457) — 전부 등록됨 | **PASS** |

> LOW-2(아래) 참고: 맵 카드 "지리 클러스터" 링크가 `serverlocation`(레거시)로 향함.

---

## 6. i18n

- 신규 `home.*` 키 en/kr 양쪽 모두 존재하고 컴포넌트 사용 키와 1:1(menu/title/more/kpi.{current_alarms,availability,total_hosts,available_hosts,health_score,asset_count,monitored_breakdown}/alarm.{title,empty}/group.{title,total,empty}/map.{title,geo_clusters,geo_problem_clusters,network_maps}/report.{title,empty,period_type.WEEK,period_type.MONTH}).
- 보간 변수 일치: `{{count}}`,`{{score}}`,`{{monitored}}`,`{{unmonitored}}` (컴포넌트 `t(key,{count/score/...})`와 i18next `{{}}` 문법 일치).
- 심각도 라벨 `t(severity.toLowerCase())`(SeverityChip) → 루트 `not_classified/information/warning/average/high/disaster` 기존 키 존재(en.json:1219-1223) — **PASS**.
- **HIGH-1 발견** — 아래 이슈 참조.

---

## 7. 심각도 매핑

- `homeSeverity.ts` `SEVERITY_CODE_TO_NAME`: "0"→NOT_CLASSIFIED, "1"→INFORMATION, "2"→WARNING, "3"→AVERAGE, "4"→HIGH, "5"→DISASTER — Zabbix 원값 의미(계약 §severity, 0=미분류…5=재해) 및 `EProblemSeverity` enum과 일치.
- `SEVERITY_CODE_ORDER` 5→0(재해 우선 렌더). `getColorSeverity`(utils/index.ts:1056, enum 기반 색)·`StatusBadge` 재사용.
- GroupStatusCard의 `SEVERITY_FIELDS`(disaster→notClassified) 매핑도 `TByHostGroup` 필드명과 일치.
- 판정: **PASS**

---

## 발견 이슈 상세 (전부 해소/정정 — 2026-07-20 재검증)

### ✅ HIGH-1 (FE) — `home` i18n 루트 키 중복 → 브레드크럼 회귀 · **해소**
- **재검증 결과**:
  - `en.json` 루트 `"home"` 1개(객체, L1715)만 잔존, 플랫 `"home":"Home"`(구 L1288) 삭제 확인.
  - `kr.json` 루트 `"home"` 1개(객체, L1704)만 잔존, 플랫 `"home":"홈"`(구 L1286) 삭제 확인.
  - `useBreadcrumbs.tsx:37`·`:86` → `t("home.title")`로 교체 확인. `home.title`은 en(L1718 "Home")·kr(L1707 "홈") 양쪽 존재.
  - 잔존 `t("home")`(정확 일치) 소비처 grep 0건 — 남은 `home.title` 소비처는 useBreadcrumbs 2곳 + HomePage 1곳으로 전부 유효 키 해석.
- **판정: PASS**.

<details><summary>원 이슈 기록(참고 보존)</summary>

### 🔴 HIGH-1 (FE) — `home` i18n 루트 키 중복 → 브레드크럼 회귀 (1차)
- **증상**: `en.json`·`kr.json` 루트에 `"home"`이 두 번 선언됨.
  - 플랫 문자열: `en.json:1288 "home": "Home"`, `kr.json:1286 "home": "홈"` (기존).
  - 신규 객체: `en.json:1716 "home": { … }`, `kr.json:1705 "home": { … }` (홈 페이지용).
- **영향**: `JSON.parse`는 마지막 키가 이김 → `home`이 **객체**로 확정. i18next 기본 설정(`returnObjects` 미활성, i18n/index.ts에 별도 지정 없음)에서 `t("home")`은 객체를 만나 값을 못 얻고 **키 문자열 "home"을 그대로 반환**(+콘솔 경고). 이 `t("home")`을 쓰는 `useBreadcrumbs.tsx:37`, `:85`가 **전 화면 브레드크럼 루트 라벨**을 "Home"/"홈" 대신 "home"으로 렌더한다(홈 신규 화면과 무관한 기존 화면 전반 회귀).
- **왜 빌드는 통과하나**: 중복 키 JSON은 `JSON.parse`/Vite import에서 오류 없이 파싱되므로 tsc/build 그린. 런타임에서만 드러나는 latent 결함.
- **수정 지시안 (FE)**:
  1. 두 로케일 파일에서 **플랫 `"home"` 라인 삭제**(en.json:1288, kr.json:1286).
  2. `useBreadcrumbs.tsx`의 `t("home")` 2곳(37, 85)을 `t("home.title")`(또는 `t("home.menu")`)로 교체 — 신규 객체에 이미 존재(값 "Home"/"홈").
  3. 회귀 방지: 로케일 duplicate-key 린트(`eslint-plugin-jsonc` no-dupe-keys 등) 검토 권장(범위 밖, 선택).
- **재검증 필요**: fe-engineer 수정 후 integration-qa 재확인(클로즈드 루프).

</details>

### ⚠️→✅ LOW-1 (FE) — "홈 FE 단위 테스트 부재" 판정은 **오판, 정정**
- **1차 판정(오류)**: FE `src/__tests__/`에 홈 테스트 없음 → LOW. 이는 1차 검증에서 `__tests__` 디렉터리를 조회하지 않고 부재를 추정한 **integration-qa의 오판**이었다.
- **재검증 사실**: `src/__tests__/useHome.test.tsx`·`src/__tests__/HomePage.test.tsx` **실재**하며 핵심 케이스 커버:
  - `useHome.test.tsx`: queryKey(`HomeSummary`/`HomeProblems`/`HomeHostGroupProblems`)·`refetchInterval/staleTime` 60000·queryFn 위임 검증, **"returns the payload directly (no double-unwrap / data.data)"** — 언랩 깊이 정합을 명시적으로 검증(L57-70), 재사용 EP 파라미터(`limit=5`,`sortDirection=DESC`) 검증.
  - `HomePage.test.tsx`: KpiBand 정상 렌더 + 심각도 칩, **부분 null "-" 플레이스홀더**(L73-83), **recentReports 게이팅**(null→카드 미노출 / []→카드+empty, L86-113).
- CLAUDE.md의 조건부 렌더/빈데이터/언랩 테스트 요구를 충족. (코디네이터가 통과도 확인 보고.)
- **판정: PASS (정정).**

### ✅ LOW-2 (FE) — 맵 카드 "지리 클러스터" 링크 대상 · **해소**
- **재검증 결과**: `MapSummaryCard.tsx:27` 지리 클러스터 `Link`가 `PATH_ROOTS_ASSET.geoMap`(`/asset/geo-map`)로 변경 확인. 표시 데이터 출처(`GeoClusterService.getOverviewLive`, Geo Maps)와 "더보기" 착지 화면 일치. `geoMap` 라우트는 routes.tsx:525에 등록됨.
- **판정: PASS.**

---

## 재검증 체크리스트 (2026-07-20 완료)
- [x] HIGH-1: 로케일 플랫 `home` 삭제 + `useBreadcrumbs` `t("home.title")` 교체 → 잔존 `t("home")` 0건, `home.title` 양 로케일 존재. **정적 확인 완료** (브레드크럼 실제 렌더 문자열은 functional-qa 런타임 확인 권장).
- [x] LOW-2: 지리 클러스터 링크 `geoMap`으로 변경 반영 확인.
- [x] LOW-1: FE 테스트 실재 재확인 → 오판 정정.

## 최종: **PASS** — 홈 BE↔FE 경계면 정합성 이슈 0건. functional-qa 런타임 검증으로 인계.
