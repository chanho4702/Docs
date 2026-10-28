# 홈(랜딩) 페이지 — 설계서

작성일: 2026-07-20 · 상태: **확정** (사용자 결정 3건 반영)
대상: moveseye-be-spring (ZM-87, origin/develop 병합 후) + moveseyee_fe (ZM-87)

---

## 1. 목표·컨셉

첫 렌더(랜딩) 시 진입하는 **제품 홈** 신설. DMOVE(Zabbix 기반 인프라 모니터링)의 각 영역 — 알람, 인프라 상태, 자산, 맵, 리포트 — 을 **한 화면에서 요약**하고, 각 카드에서 해당 상세 화면으로 진입하는 허브 역할.

- 현재 랜딩 `/`→`/asset/list`(2026-07-13 내비 개편)를 `/`→`/home`으로 교체.
- 구 대시보드(감가상각 화면, 삭제됨)와 무관한 신규 화면. 호스트 상세 커스텀 위젯(react-grid-layout)과도 별개 — 홈은 **고정 레이아웃**(사용자 편집 없음).

### 사용자 확정 결정 (2026-07-20)
1. **구성 = 전체 5개 섹션** (KPI 밴드 + 알람 목록 + 호스트그룹 상태 + 맵 요약 + 최근 리포트)
2. **BE = 통합 `GET /home/summary` 신설** (KPI성 집계 + Redis 60초 캐싱), 목록성은 기존 API 재사용
3. **브랜치 = BE ZM-87에 origin/develop 병합 후 작업** (자산·맵 모듈 + V5~V11 확보, 신규 마이그레이션은 V12+ — 단 본 기능은 조회 전용이라 신규 마이그레이션 없음)

---

## 2. 화면 설계 (FE)

```
┌─────────────────────────────────────────────────────┐
│ KPI 밴드 (Statistic 타일 4~5개)                        │
│  현재 알람(심각도별 칩) │ 호스트 가용성% │ 전체 호스트 │ 자산 수 │
├───────────────────────────┬─────────────────────────┤
│ 현재 발생 알람 (top-N 목록) │ 호스트그룹 상태            │
│  심각도 StatusBadge·시각·호스트│  그룹별 가용성·건강도·문제수 │
├───────────────────────────┼─────────────────────────┤
│ 맵 요약                     │ 최근 리포트 (admin만 노출)  │
│  지리 클러스터 상태 칩·개수    │  최신 5건 + 리포트 화면 링크 │
│  네트워크 맵 개수·바로가기     │                          │
└───────────────────────────┴─────────────────────────┘
```

- **경로**: `PATH_HOME = "/home"` 신설(`constants/routes.ts`). `routes.tsx`의 `/` `Navigate` 타깃 및 `SignIn.tsx` 로그인 후 리다이렉트를 `/home`으로 변경. `/asset/list` 라우트는 그대로 존치.
- **메뉴**: `SideNav.tsx`(+`MobileSideNav.tsx`) `getItems()` 최상단에 "홈"(HomeOutlined) 추가. 권한 플래그 없음(전 사용자).
- **가드**: `PageWrapper` — `permissionKey`/`adminOnly` 없음(인증만). 리포트 카드는 데이터 존재 여부(BE가 admin에게만 내려줌)로 조건부 렌더.
- **디렉터리**: `src/pages/home/` — `HomePage.tsx` + `components/`(KpiBand, AlarmListCard, GroupStatusCard, MapSummaryCard, RecentReportsCard).
- **재사용**: KPI 타일 = `AssetSummaryHeader` 패턴(Card+Row/Col+Statistic), 심각도 = `StatusBadge`(getColorSeverity), 카운트업 = `CardInfoStatus` 참고. 카드 셸은 AntD `Card`. 차트는 1차 불필요(수치·뱃지 중심) — 필요 시 ECharts `theme={mytheme}`.
- **다크모드**: 하드코딩 색 금지, `COLOR` 팔레트/AntD 토큰만. **i18n**: en.json/kr.json 동시 추가(snake_case).
- **데이터**:
  - `services/home.api.ts` → `HomeService.getSummary()` (신규 `/home/summary`)
  - 알람 목록 = 기존 `GET /event/problems` 재사용(limit 소량, 최신순)
  - 호스트그룹 상태 = 기존 `GET /hosts/hostgroup-problems`(또는 `/hosts/hostgroups`) 재사용
  - 훅: `hooks/useHome.ts` — `useDmoveQuery`(payload 직접 수신, 2겹 언랩 주의), `HOME_QUERY_KEY` 신설(`constants/queryKey.ts`), `refetchInterval` 60초(요약)·기존 키 재사용 시 캐시 충돌 방지 위해 홈 전용 키 사용.
- **내비게이션 링크**: 각 카드 우상단 "더보기" → 알람=`/event/*`(이벤트 화면), 그룹=모니터링 화면, 맵=`/asset/serverlocation`·`/asset/network-map`, 리포트=`/admin/reports` 화면, 자산 KPI=`/asset/list`.

## 3. API 설계 (BE)

### 신설: `GET /home/summary` → `ApiResult<HomeSummaryDto>`
- 패키지 `home/` — `HomeController`, `HomeService`(+impl), `home/dto/HomeSummaryDto`.
- 인증 사용자 전체 접근(`@CurrentUser TokenUserInfo`, `@VisitorIdCheck`, bearer). **관리자 전용 가드 없음** — 단 `recentReports`는 `userRole`이 ADMIN/SUPER_ADMIN일 때만 채우고 아니면 `null`(FE 카드 미노출). `AdminAccessChecker`의 판정 로직 재사용(throw는 하지 않음).

```jsonc
HomeSummaryDto {
  alarm: {                     // ZabbixProblemService.getCountRaw — severities별 count
    severityCounts: { "0":n, "1":n, "2":n, "3":n, "4":n, "5":n },
    totalOpen: n
  },
  infra: {                     // HostService 가용성 KPI 로직 재사용 (computeAvailabilityKpi 계열)
    totalHosts: n, availableHosts: n, availabilityPct: n,   // 소수1자리
    healthScore: n | null
  },
  asset: AssetSummaryDto | null,   // AssetService.getSummary() 위임 (total, monitored, unmonitored, lastSyncedAt …)
  map: {
    geoClusterCount: n, geoProblemClusterCount: n,          // GeoCluster live 집계 (worstSeverity>=경고 or openProblemCount>0)
    geoWorstSeverity: "0"~"5" | null,
    networkMapCount: n                                       // NetworkArchitecture 목록 total
  },
  recentReports: [ { id, title, periodType, periodStart, createdAt } ] | null   // admin만, 최신 5건 (ReportManagementService 재사용)
}
```

- **캐싱**: `RedisClientService.set("HOME_SUMMARY:{userId}", dto, 60)` — 사용자 스코프(가시성이 Zabbix 토큰별로 다름), TTL 60초. 캐시 히트 시 Zabbix 호출 생략. 실패 도메인은 해당 필드 `null`로 부분 성공(전체 500 금지).
- **Zabbix 호출**: `currentUser.getAuthToken()` 사용(사용자 가시 범위 기준 — 호스트 등록 관리의 superAdminToken 패턴과 다름에 주의).
- **DB**: 신규 마이그레이션 **없음**(조회 전용).
- **에러 규약**: 기존 그대로 — 권한 거부는 HTTP 200 + body code 403, `ApiResult` 래퍼, `SyncTimeResponseAdvice`의 syncTime 자동 주입.

### 재사용(변경 없음): `GET /event/problems`, `GET /hosts/hostgroup-problems`(또는 `/hosts/hostgroups`)

## 4. 브랜치·작업 순서

1. **BE**: ZM-87 ← `origin/develop` 병합(ZM-69 포함, V5~V11·자산·맵 모듈 확보) → 홈 구현. FE ZM-87은 develop 기준이라 그대로.
2. be-engineer: BE 구현 + `contract_home.md` 산출 + `gradlew build`/테스트.
3. fe-engineer: 계약 기반 types→api→hooks→화면→라우트/메뉴/랜딩 전환→i18n.
4. integration-qa: `qa_home.md` — DTO shape ↔ FE 타입 정적 대조.
5. functional-qa: `e2e_home.md` — 로그인→`/` 진입→홈 렌더·카드 데이터·링크 이동·비admin 리포트 카드 미노출(스크린샷 최소화).

## 5. 범위 제외 (2차 후보)
- 홈 위젯 커스터마이즈(배치 편집), 자동 새로고침 주기 설정 UI, 리소스 top-N 차트, 이벤트 추이 차트, 지리 맵 미니맵 임베드.
