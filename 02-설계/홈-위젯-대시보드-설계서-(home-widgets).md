# 홈 위젯 대시보드 — 설계서 (home-widgets)

작성일: 2026-08-18 · 상태: **구현 착수본** (사용자 요청 기반, 미결은 §7에 가정으로 명시)
대상: `moveseye-be-spring`(ZM-79 브랜치, 현 작업 브랜치) + `moveseyee_fe`(master)
선행: `devdesign_home.md`(2026-07-20 고정 레이아웃 홈) → 본 설계가 **대체**한다. `plan_custom-dashboard.md`(2026-06-16)의 위젯 모델·`CustomChartsDashboard`(호스트 상세) 골격을 차용.

---

## 1. 목표

홈(랜딩 `/home`)을 **위젯 기반 커스텀 대시보드**로 개편한다.
- 사용자가 위젯을 **추가·삭제·이름변경·설정·드래그 이동·리사이즈**하고 배치는 영속화된다.
- **시스템 기본 위젯**(사용자·라이선스·데이터소스 연결 상태)은 처음부터 있고 **삭제 불가**(위치·크기 조정만 가능).
- 기존 홈 카드 7종(KPI·알람 목록·그룹 상태·맵 요약·최근 리포트·대표 네트워크맵·대표 지리맵)은 전부 위젯으로 승격돼 **기본 세트**에 포함된다(기존 화면과 첫인상 동일 + 시스템 위젯 추가).

## 2. 핵심 결정 (가정 포함 — §7)

| # | 결정 | 근거 |
|---|---|---|
| D1 | **스코프 = 사용자별**(`user_id`). 누구나 자기 홈을 편집한다 | 홈은 개인 랜딩. 06-16 커스텀 대시보드 결정(공유·관리자만)은 "전사 공유 대시보드" 맥락이라 홈엔 부적합 |
| D2 | **기본 세트 = 코드 상수 + 첫 조회 시 DB 시드**. `GET /home/widgets`가 해당 사용자 행 0건이면 기본 세트를 INSERT 후 반환(멱등) | "가상 기본값"은 편집 시작 순간 ID가 없어 레이아웃 저장이 꼬인다. 시드로 통일 |
| D3 | **시스템 위젯 = `pinned=true`**: 삭제 거부(BE 400 `WIDGET_PINNED`), FE 삭제 버튼 미노출. 이동·리사이즈·이름변경 가능. 중복 추가 불가(카탈로그에서 `unique=true`) | "기본빵으로 있어야 함" |
| D4 | **"기본값으로 초기화"** 액션(`POST /home/widgets/reset`) — 내 위젯 전부 삭제 후 기본 세트 재시드 | 망가뜨린 배치 복구 수단 |
| D5 | **위젯 데이터는 기존 EP 최대 재사용**. 신설은 `GET /home/system-status` 하나(라이선스·사용자·데이터소스·스케줄러). 라이선스는 이미 있는 `GET /features` 캐시(`useLicense`)를 FE에서 그대로 사용 | Zabbix 래핑 원칙: 있는 건 감싼다 |
| D6 | **데이터소스 연결 상태는 실측만 표시**(가짜 상태 금지 — `DataSourceSettingsPage`의 `no_fake_connection` 설계 유지). Zabbix는 `apiinfo.version` 실호출, DB는 `SELECT 1`, Redis는 `PING`, AWS는 자격증명 미설정이면 `NOT_CONFIGURED`(실호출은 하지 않음 — STS 호출 비용/실패 노이즈; §7) | 실측 없는 "정상"은 문의 유발 |
| D7 | Zabbix 헬스는 **engine-api 중립 포트 `HealthPort`**로 추상화(`engine/port/HealthPort`, `DataSourceRegistry.port(HealthPort.class, id)`), 구현은 engine-zabbix. app은 registry로 전 소스를 순회 | 수집엔진 방향(다중 소스)과 정합. app→engine-zabbix 참조 금지(빌드가 강제) |
| D8 | 위젯 타입 카탈로그는 **BE enum(`HomeWidgetType`)이 정본**, FE는 동일 목록 상수(렌더러 매핑). 미지 타입 POST는 400 | 저장 시 검증 필요 |
| D9 | 레이아웃 그리드 = react-grid-layout v2, 12컬럼, rowHeight 30 — `CustomChartsDashboard` 동일 | 검증된 골격 |
| D10 | 마이그레이션 **V23 `home_widget`** 신설(기존 `dashboard_widget`은 host 스코프라 재사용 안 함 — 컬럼 의미가 다르고 CHECK/유니크가 갈린다) | 기존 테이블 오염 방지 |

## 3. 위젯 카탈로그 (1차)

`unique`=대시보드당 1개만, `pinned`=삭제 불가(시스템), `admin`=관리자에게만 카탈로그 노출·데이터 제공.

| type | 그룹 | 제목(기본) | 데이터 출처 | config | 기본 크기(w×h) | unique | pinned | 기본세트 |
|---|---|---|---|---|---|---|---|---|
| `system_license` | 시스템 | 라이선스 | `GET /features`(FE `useLicense`) | — | 4×5 | ✅ | ✅ | ✅ |
| `system_users` | 시스템 | 사용자 | `GET /home/system-status`.users | — | 4×5 | ✅ | ✅ | ✅ |
| `system_datasources` | 시스템 | 데이터소스 연결 | `GET /home/system-status`.dataSources | — | 4×5 | ✅ | ✅ | ✅ |
| `system_scheduler` | 시스템 | 배치·동기화 상태 | `GET /home/system-status`.schedulers (admin) | — | 6×6 | ✅ | — | ✅(admin) |
| `alarm_kpi` | 모니터링 | 현재 알람 | `/home/summary`.alarm | — | 6×4 | ✅ | — | ✅ |
| `infra_kpi` | 모니터링 | 인프라 가용성 | `/home/summary`.infra | — | 6×4 | ✅ | — | ✅ |
| `asset_kpi` | 자산 | 자산 현황 | `/home/summary`.asset | — | 4×4 | ✅ | — | — |
| `alarm_list` | 모니터링 | 현재 발생 알람 | `GET /event/problems`(기존) | `{limit:5\|10\|20, minSeverity?:"0"~"5"}` | 6×8 | — | — | ✅ |
| `alarm_severity_pie` | 모니터링 | 알람 심각도 분포 | `/home/summary`.alarm.severityCounts → ECharts pie | — | 4×8 | — | — | — |
| `hostgroup_status` | 모니터링 | 호스트그룹 상태 | `GET /hosts/hostgroup-problems`(기존) | `{limit:5\|10\|20}` | 6×8 | — | — | ✅ |
| `map_summary` | 맵 | 맵 요약 | `/home/summary`.map | — | 4×5 | ✅ | — | ✅ |
| `main_network_map` | 맵 | 대표 네트워크 맵 | 기존 `MainNetworkMapCard` 로직 | — | 6×11 | ✅ | — | ✅ |
| `main_geo_map` | 맵 | 대표 지리 맵 | 기존 `MainGeoMapCard` 로직 | — | 6×11 | ✅ | — | ✅ |
| `recent_reports` | 리포트 | 최근 리포트 | `/home/summary`.recentReports (admin) | `{limit:5}` | 6×8 | ✅ | — | ✅(admin) |

- 카탈로그(타입·그룹·기본 크기·unique·pinned·admin)는 **FE 상수 `constants/homeWidgets.ts`** 와 **BE `HomeWidgetType` enum** 양쪽에 둔다(BE는 type·pinned·unique·admin·기본세트만; 크기·라벨은 FE). `HomeWidgetsCatalogTest`(BE)가 enum 목록을 고정하고, FE 테스트가 상수 키 목록을 BE와 대조할 수 있도록 **계약서에 타입 목록을 그대로 싣는다**.
- **기본 세트 배치**(12컬럼, y 순): 행1 `system_license`(0,0,4,5)·`system_users`(4,0,4,5)·`system_datasources`(8,0,4,5) / 행2 `alarm_kpi`(0,5,6,4)·`infra_kpi`(6,5,6,4) / 행3 `alarm_list`(0,9,6,8)·`hostgroup_status`(6,9,6,8) / 행4 `map_summary`(0,17,4,5)·`recent_reports`(4,17,8,8, admin만)·`system_scheduler`(admin만; 비admin은 이 자리에 없음) / 행5 `main_network_map`(0,25,6,11)·`main_geo_map`(6,25,6,11). 정확한 좌표는 BE 시드 상수가 정본(계약서에 명시).

## 4. BE 설계

### 4.1 스키마 — `V23__home_widget.sql`
```sql
CREATE TABLE IF NOT EXISTS home_widget (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,   -- 실제 user 테이블명/PK 타입은 구현 시 확인
  widget_type VARCHAR(64) NOT NULL,
  title       VARCHAR(255),                 -- null이면 FE가 타입 기본 제목 사용
  config      JSONB NOT NULL DEFAULT '{}'::jsonb,
  pos_x INT NOT NULL DEFAULT 0, pos_y INT NOT NULL DEFAULT 0,
  width INT NOT NULL DEFAULT 4, height INT NOT NULL DEFAULT 4,
  pinned      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT now(), updated_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_home_widget_user ON home_widget(user_id);
```
unique 제약은 DB가 아니라 서비스에서(카탈로그 `unique` 플래그) 검사 — 타입별 정책이 달라서.

### 4.2 패키지 `home/` 확장
- `home/domain/HomeWidget`(엔티티, config는 `@JdbcTypeCode(SqlTypes.JSON) Map<String,Object>`), `HomeWidgetRepository`
- `home/HomeWidgetType`(enum: type·pinned·unique·adminOnly), `home/HomeWidgetDefaults`(기본 세트 시드 좌표 상수, admin 여부에 따라 2벌)
- `home/HomeWidgetService`: list(시드 포함)·create(타입 검증·unique·adminOnly)·update(title/config)·updateLayout(소유 검증, id 전부 내 것인지)·remove(pinned 거부)·reset
- `home/HomeSystemStatusService`: system-status 집계(각 항목 독립 try/catch, 실패는 항목 `null`/`DOWN`), Redis 캐시 `HOME_SYSTEM_STATUS`(전역, TTL 30초 — 사용자별 차이 없음. 단 `schedulers`는 admin에게만 채움 → 캐시는 공통 본체, admin 분기는 응답 조립 시)
- 컨트롤러 `HomeController`에 추가(경로 `/home/**`)

### 4.3 엔드포인트
| 메서드 | 경로 | 요청 | 응답 | 권한 |
|---|---|---|---|---|
| GET | `/home/widgets` | — | `HomeWidgetDto[]` (0건이면 기본 세트 시드 후 반환) | 인증 |
| POST | `/home/widgets` | `{widgetType, title?, config?, posX?, posY?, width?, height?}` | `HomeWidgetDto` | 인증(adminOnly 타입은 admin) |
| PATCH | `/home/widgets/layout` | `{layouts:[{id,x,y,w,h}]}` | `void` | 인증(내 것만) |
| PATCH | `/home/widgets/{id}` | `{title?, config?}` | `HomeWidgetDto` | 인증(내 것만) |
| DELETE | `/home/widgets/{id}` | — | `void` (pinned → 200+code 400 `WIDGET_PINNED`… 기존 에러 규약 따름) | 인증 |
| POST | `/home/widgets/reset` | — | `HomeWidgetDto[]` | 인증 |
| GET | `/home/system-status` | — | `HomeSystemStatusDto` | 인증(schedulers는 admin만, 아니면 null) |

`HomeWidgetDto { id, widgetType, title, config, posX, posY, width, height, pinned }`

`HomeSystemStatusDto`:
```jsonc
{
  users: { total, active, inactive, admins, online },     // online = Redis USER_LOGIN_KEY_* 세션 수(SCAN)
  dataSources: [ { id:"zabbix-default", type:"zabbix", displayName:"Zabbix", status:"UP"|"DOWN"|"NOT_CONFIGURED", detail:"7.0.x", latencyMs, checkedAt, endpoint:"https://…(host만, 자격증명 없음)" }, ... ],
  infrastructure: [ { key:"database", status, latencyMs }, { key:"redis", status, latencyMs }, { key:"aws", status:"NOT_CONFIGURED"|"CONFIGURED", detail:"region"} ],
  schedulers: [ { jobKey, enabled, nextRunAt, lastRun:{ status, startedAt, finishedAt, message } } ] | null,   // admin만
  checkedAt
}
```
- 에러 규약: 기존(`ApiResult`, 403→200 body 403, `AdminAccessChecker.requireAdmin`은 adminOnly 타입 생성에만).
- 소유권 위반(남의 위젯 id) → 404 `WIDGET_NOT_FOUND`(존재 노출 안 함).
- 조사 실측(2026-08-18): 연결 테스트 EP·`apiinfo.version` 호출·actuator 전부 **부재** → HealthPort 신설이 유일한 경로. `GET /users` 총계는 `u.userRole != ADMIN`이 항상 붙어 관리자를 빼므로 system-status의 users는 **`UserRepository`에 카운트 쿼리 신설**(`countByStatus`, `countByUserRoleIn`)로 집계. `online`은 Redis `USER_LOGIN_KEY_*` SCAN 개수(KEYS 금지). schedulers는 `SchedulerSettingService`의 목록(nextRunAt·lastRun 포함) 재사용. DB 헬스는 `EntityManager`/`JdbcTemplate` `SELECT 1`, Redis는 `RedisClientService`에 `ping()` 추가(연결 팩토리 `PING`).
- `HealthPort`(engine-api `engine/port/HealthPort`): `HealthCheckResult check()` — `{ status(UP/DOWN/NOT_CONFIGURED), detail, latencyMs, checkedAt }`. engine-zabbix `ZabbixHealthAdapter`: `apiinfo.version`(무인증) 호출, URL 미설정 시 NOT_CONFIGURED. `ZabbixDataSourceRegistry.port()`에 분기 추가.

### 4.4 테스트
- `HomeWidgetServiceTest`: 시드(비admin 10개/admin 12개), pinned 삭제 거부, unique 중복 거부, adminOnly 비admin 거부, 레이아웃 소유권, reset.
- `HomeSystemStatusServiceTest`: 항목 실패 격리(Zabbix DOWN이어도 users 채워짐), admin 분기.
- `ZabbixHealthAdapterTest`(engine-zabbix): 정상/실패/미설정.
- 기존 `HomeServiceTest` 등 회귀 green.

## 5. FE 설계

### 5.1 구조 (`src/pages/home/`)
```
HomePage.tsx                     # 툴바(편집/위젯 추가/초기화) + HomeWidgetGrid
homeSeverity.ts                  # 유지
widgets/
  registry.tsx                   # type → { Component, defaultSize, group, unique, pinned, adminOnly, i18nKey, configSchema? }
  HomeWidgetGrid.tsx             # react-grid-layout v2 (CustomChartsDashboard 골격 복제)
  HomeWidgetShell.tsx            # 카드 셸: 제목(인라인 rename)·더보기 링크·설정·삭제(pinned면 숨김)·no-drag 영역
  AddHomeWidgetModal.tsx         # 그룹별 카탈로그(이미 있는 unique는 disabled), 추가
  WidgetConfigModal.tsx          # limit/minSeverity 등 소형 설정
  types.ts                       # 위젯 컴포넌트 공용 props { widget, editMode }
  system/ SystemLicenseWidget · SystemUsersWidget · SystemDataSourcesWidget · SystemSchedulerWidget
  monitoring/ AlarmKpiWidget · InfraKpiWidget · AlarmListWidget · AlarmSeverityPieWidget · HostGroupStatusWidget
  asset/ AssetKpiWidget
  map/ MapSummaryWidget · MainNetworkMapWidget · MainGeoMapWidget
  report/ RecentReportsWidget
components/ (기존 카드) → 위젯 컴포넌트로 **이동/개명**(KpiBand는 alarm/infra/asset 3개로 분해). 기존 파일은 삭제.
```
- `services/home.api.ts` 확장: `getWidgets/createWidget/updateWidget/updateWidgetLayout/deleteWidget/resetWidgets/getSystemStatus`
- `hooks/useHomeWidgets.ts`(useWidgets 패턴: useDmoveQuery + useMutation×5 + invalidate), `hooks/useHomeSystemStatus.ts`(refetchInterval 30s)
- `types/home.ts` 확장: `THomeWidgetType`, `THomeWidget`, `THomeWidgetConfig`, `THomeSystemStatus…`
- `constants/queryKey.ts`: `HOME_QUERY_KEY.WIDGETS`, `SYSTEM_STATUS`
- 위젯 데이터 훅: 기존 `useHomeSummary/useHomeProblems/useHomeHostGroupProblems`를 위젯 안에서 호출(react-query 캐시 공유 — 같은 키 여러 위젯이 써도 요청 1회). `alarm_list`의 config.limit은 쿼리키에 포함.
- **편집 흐름**: 편집 토글 → 드래그/리사이즈(`onLayoutChange` → 즉시 `PATCH layout`), 위젯 추가(모달), 삭제(pinned 제외, `Popconfirm`), 이름변경(인라인), 설정(모달) → "완료". "초기화"는 `Popconfirm` 후 reset.
- **그리드 함정**: `useContainerWidth` + `mounted && width>0` 가드, 마운트 후 rAF `measureWidth()`. 위젯 컴포넌트는 `height:100%` 채우고 내부 스크롤(`overflow:auto`).
- **rAF 주의**: Chrome MCP hidden 탭에선 ECharts 도넛이 멈춘 듯 보인다([[chrome-mcp-hidden-tab-no-raf]]) — QA 오진 금지.
- 다크모드: `usePalette()`/AntD 토큰만. i18n: `home.widget.*` 중첩 키(en/kr 동시), 카탈로그 라벨·그룹명·시스템 상태 문구.
- 라우트/메뉴/랜딩 전환 없음(이미 `/home`). `PageWrapper` 가드 그대로(인증만).
- 기존 테스트(`src/__tests__/…home…`)가 있으면 위젯 구조에 맞게 갱신.

### 5.2 시스템 위젯 화면
- **라이선스**: 상태 뱃지(state별 색), edition·licenseType·customer, 만료일·D-day(영구면 "영구"), 기능 태그. 잠금/만료 임박이면 강조. 더보기 → `PATH_SETTING.license`.
- **사용자**: 총/활성/비활성/관리자/현재 접속 Statistic 5칸. 더보기 → 사용자 관리.
- **데이터소스 연결**: 행 목록 — Zabbix(UP/DOWN/미설정 + 버전 + 지연ms + 확인시각), Database, Redis, AWS(설정됨/미설정). `StatusBadge`/색은 팔레트. 더보기 → 설정>데이터소스.
- **배치·동기화(admin)**: 잡별 enabled·마지막 실행 결과·다음 실행. 더보기 → 스케줄러 설정.

## 6. 작업 순서 (fullstack-feature)
1. BE(be-engineer): V23 + 엔티티/서비스/컨트롤러 + HealthPort/어댑터 + system-status + 테스트 → `contract_home-widgets.md` 산출 → `gradlew build`.
2. FE(fe-engineer): api-contract-sync로 계약 확인 → types→api→hooks→registry→위젯 컴포넌트→그리드/툴바/모달→i18n → tsc/eslint/jest.
3. integration-qa(`qa_home-widgets.md`) → functional-qa(`e2e_home-widgets.md`, BE 재기동은 clean build 후 — 다른 세션이 :3000/:5173을 쓰는 중이므로 재기동 타이밍은 보고).

## 7. 가정·미결 (사용자 확인 시 바뀔 수 있음)
- A1 스코프 사용자별(D1). 공유형/관리자 편집 전용이 필요하면 `user_id` nullable + "전사 기본" 1벌로 확장 가능(테이블 그대로).
- A2 시스템 위젯은 삭제만 불가, 이동·리사이즈 허용(D3).
- A3 AWS는 실호출 헬스체크 없이 설정 유무만(D6). 실호출이 필요하면 `HealthPort`를 AWS 어댑터에도 붙인다.
- A4 자동 새로고침 주기 설정 UI·위젯 공유·대시보드 복수 탭·시계열(호스트 바인딩) 위젯은 2차.
