# API 계약 — 홈 위젯 대시보드 (home-widgets)

> 대상: `moveseye-be-spring` (Spring Boot 3.3) · 패키지 `com.dmove.moveseye.home` + `engine-api`/`engine-zabbix`
> 기준: **구현 코드가 진실**(`HomeController` · `HomeWidgetService` · `HomeSystemStatusService` · `HomeWidgetType` · `HomeWidgetDefaults`). 설계서 `devdesign_home-widgets.md`는 방향성 참조.
> 소비자: `fe-engineer`(`moveseyee_fe`: `services/home.api.ts` · `types/home.ts` · `hooks/useHomeWidgets.ts` · `constants/homeWidgets.ts`) · `api-contract-sync` · `integration-qa`
> 브랜치 `ZM-79` · 상태: **구현 완료, 미커밋** · 빌드 `gradlew build` BUILD SUCCESSFUL(1021 tests, 0 failed)

## 개정 이력
| 버전 | 날짜 | 변경 |
|---|---|---|
| v1 | 2026-08-18 | 최초 산출 — 위젯 CRUD 6EP + `/home/system-status` 1EP, `HealthPort` 신설, V23 마이그레이션. |

---

## 0. 공통 응답 규약

기존 규약을 그대로 따른다. 모든 응답은 `ApiResult<T>` 래핑이며 **성공/실패 모두 HTTP 200**(미인증 401만 실제 상태코드).

```jsonc
// 성공
{ "status": "success", "code": 200, "data": <T>, "syncTime": "..." }
// 비즈니스 에러 (HTTP 200)
{ "status": "error", "code": 400, "errorCode": "WIDGET_PINNED", "message": "WIDGET_PINNED" }
```

- 🔴 **FE는 `errorCode`로 분기한다**(`message`는 같은 문자열이지만 계약이 아니다).
- 인증: 전 EP `@VisitorIdCheck` + JWT 쿠키(bearer 폴백). 미인증은 컨트롤러 도달 전 **HTTP 401**.
- 날짜: `@JsonFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")` → `"2026-08-18T05:13:45.076Z"`. nullable 필드는 `null`.

---

## 1. 엔드포인트 요약

| # | 메서드 | 경로 | 요청 | 응답 data | 권한 |
|---|---|---|---|---|---|
| 1 | GET | `/home/widgets` | — | `HomeWidget[]` | 인증(자기 것만) |
| 2 | POST | `/home/widgets` | `CreateHomeWidgetReq` | `HomeWidget` | 인증(adminOnly 타입은 관리자) |
| 3 | PATCH | `/home/widgets/layout` | `{layouts:[{id,x,y,w,h}]}` | `null` | 인증(자기 것만) |
| 4 | PATCH | `/home/widgets/{widgetId}` | `{title?, config?}` | `HomeWidget` | 인증(자기 것만) |
| 5 | DELETE | `/home/widgets/{widgetId}` | — | `null` | 인증(pinned 거부) |
| 6 | POST | `/home/widgets/reset` | — | `HomeWidget[]` | 인증 |
| 7 | GET | `/home/system-status` | — | `HomeSystemStatus` | 인증(`schedulers`만 관리자) |

기존 `GET /home/summary`는 **변경 없음**(알람/인프라/자산/맵/최근리포트 KPI). 위젯 데이터는 대부분 기존 EP를 그대로 쓴다 — 신설은 #7 하나뿐이다.

---

## 2. `HomeWidget` (응답 DTO)

```jsonc
{
  "id": 12,                    // number  — 레이아웃 저장/수정/삭제의 키
  "widgetType": "alarm_list",  // string  — 카탈로그 코드(§4). 렌더러 매핑 키
  "title": null,               // string|null — null이면 FE가 타입 기본 제목(i18n)을 쓴다
  "config": { "limit": 10 },   // object  — 타입별 스키마. 없으면 {} (null 아님)
  "posX": 0,                   // number  — 그리드 x (0~11)
  "posY": 9,                   // number  — 그리드 y
  "width": 6,                  // number  — 컬럼 수
  "height": 8,                 // number  — 행 수 (rowHeight 30)
  "pinned": false              // boolean — true면 삭제 불가(삭제 버튼 미노출)
}
```

| 필드 | 타입 | nullable | 비고 |
|---|---|---|---|
| `id` | number | ✗ | |
| `widgetType` | string | ✗ | snake_case. 미지 코드는 저장 불가 |
| `title` | string \| null | ✅ | 사용자가 바꾼 제목만 값이 있다 |
| `config` | object | ✗ | 빈 설정은 `{}` |
| `posX`/`posY`/`width`/`height` | number | ✗ | |
| `pinned` | boolean | ✗ | 요청으로 못 바꾼다 — 카탈로그가 정한다 |

> ⚠️ `pinned`는 `boolean` 원시형이지만 필드명이 `is` 접두가 아니므로 JSON 키가 그대로 `pinned`다(CLAUDE.md §3 #5 함정 해당 없음).

### 정렬
목록은 항상 **배치 순**(`posY` → `posX` → `id`)이다. id 순이 아니다.

---

## 3. 엔드포인트 상세

### #1 `GET /home/widgets` — 내 위젯 목록

- 🔴 **행이 0건이면 기본 세트를 DB에 시드한 뒤 반환한다**(멱등). "가상 기본값"이 아니므로 반환된 모든 위젯에 실제 `id`가 있고, 첫 드래그부터 레이아웃 저장이 정상 동작한다.
- 관리자면 12개, 비관리자면 10개가 깔린다(§5).
- 관리자 전용 타입(`system_scheduler`·`recent_reports`) 행은 **비관리자 응답에서 제외**된다(강등된 계정의 잔존 행 대비).

```jsonc
// 200
{ "status":"success", "code":200, "data":[ { "id":1, "widgetType":"system_license", ... }, ... ] }
```

### #2 `POST /home/widgets` — 위젯 추가

```jsonc
// 요청 — widgetType 외 전부 optional
{ "widgetType":"alarm_list", "title":"긴급 알람", "config":{"limit":20,"minSeverity":"4"},
  "posX":0, "posY":25, "width":6, "height":8 }
```

| 필드 | 타입 | 필수 | 생략 시 |
|---|---|---|---|
| `widgetType` | string | ✅ | — |
| `title` | string \| null | ✗ | `null`(FE 기본 제목). 빈 문자열도 `null`로 저장 |
| `config` | object \| null | ✗ | `{}` |
| `posX` | number \| null | ✗ | `0` |
| `posY` | number \| null | ✗ | **기존 위젯의 최하단**(`max(posY+height)`) |
| `width`/`height` | number \| null | ✗ | 카탈로그 기본 크기(§4) |

- 🔴 **좌표·크기는 FE가 보내는 것이 원칙**이다(그리드 규격을 아는 쪽이 FE다). 생략 값은 폴백일 뿐이다.
- 🔴 **`pinned`는 요청에 없다.** 카탈로그에서 파생되므로 클라이언트가 `pinned=false`로 시스템 위젯을 다시 만들어 삭제 금지를 우회할 수 없다.
- 에러: `WIDGET_TYPE_INVALID` / `WIDGET_DUPLICATE` / `WIDGET_ADMIN_ONLY`.

### #3 `PATCH /home/widgets/layout` — 배치 일괄 저장

```jsonc
{ "layouts": [ { "id":1, "x":0, "y":0, "w":4, "h":5 }, { "id":2, "x":4, "y":0, "w":4, "h":5 } ] }
```
- 응답 `data: null`.
- 🔴 **내 것이 아닌 id는 그 항목만 무시**한다(요청 전체를 거부하면 정상 위젯의 배치까지 되돌아간다). 서버에 `WARN` 로그가 남으므로, 이 로그가 보이면 FE 버그 신호다.
- `layouts`가 비었거나 null이면 no-op.
- react-grid-layout의 `{i,x,y,w,h}`에서 `i`(문자열)를 **number `id`로 변환해 보낼 것**.

### #4 `PATCH /home/widgets/{widgetId}` — 제목/설정 수정

```jsonc
{ "title": "내 알람", "config": { "limit": 5 } }   // 둘 다 optional
```
- **부분 수정**: 생략(`undefined`)하거나 `null`이면 그 필드는 변경하지 않는다.
- `config`는 **통째로 교체**된다(머지 아님) — FE는 기존 config에 변경분을 얹어 전체를 보내야 한다.
- 🔴 `title: ""`(빈 문자열)은 **기본 제목으로 되돌리기**다(`null` 저장). 빈 제목을 그대로 저장하면 카드 머리가 비어 무슨 위젯인지 알 수 없게 된다.
- 에러: `WIDGET_NOT_FOUND`(code 404).

### #5 `DELETE /home/widgets/{widgetId}`

- 응답 `data: null`.
- 에러: `WIDGET_PINNED`(pinned 위젯) / `WIDGET_NOT_FOUND`(남의 것·없는 것).

### #6 `POST /home/widgets/reset` — 기본값으로 초기화

- 내 위젯을 **전부 삭제**하고 기본 세트를 다시 깐다. 응답은 새 목록(`HomeWidget[]`) — 재조회 불필요.
- 관리자/비관리자 판정은 요청 시점 기준이다.

### #7 `GET /home/system-status`

§6 참조.

---

## 4. 위젯 카탈로그 (`HomeWidgetType` 전체 — **정본**)

FE `constants/homeWidgets.ts`는 이 목록과 **코드·플래그가 일치**해야 한다. BE `HomeWidgetCatalogTest`가 이 표를 고정한다.

| # | `widgetType` | pinned | unique | adminOnly | 기본 크기 w×h | 기본세트 | 데이터 출처 |
|---|---|:---:|:---:|:---:|:---:|:---:|---|
| 1 | `system_license` | ✅ | ✅ | — | 4×8 | ✅ | FE `GET /features`(useLicense) |
| 2 | `system_users` | ✅ | ✅ | — | 4×8 | ✅ | `/home/system-status`.users |
| 3 | `system_datasources` | ✅ | ✅ | — | 4×8 | ✅ | `/home/system-status`.dataSources + .infrastructure |
| 4 | `system_scheduler` | — | ✅ | ✅ | 6×10 | ✅(admin) | `/home/system-status`.schedulers |
| 5 | `alarm_kpi` | — | ✅ | — | 6×5 | ✅ | `/home/summary`.alarm |
| 6 | `infra_kpi` | — | ✅ | — | 6×5 | ✅ | `/home/summary`.infra |
| 7 | `alarm_list` | — | — | — | 6×11 | ✅ | `GET /event/problems`(기존, **from=0·to=now·sortDirection=ASC** — §8) |
| 8 | `alarm_severity_pie` | — | — | — | 4×8 | — | `/home/summary`.alarm.severityCounts |

> 🔴 **알람 축 정정(2026-08-27)** — `alarm_kpi`·`alarm_severity_pie`(둘 다 `/home/summary`.alarm)의 값이
> 크게 줄었다(dev 실측 942 → 345). **의도된 정정이며 FE 대응은 불필요하다**(필드·형태 불변).
> 이유는 이 두 위젯이 `alarm_list`(`GET /event/problems`)와 **다른 축**으로 세고 있었기 때문 —
> 도넛을 눌러 목록으로 가는 드릴다운에서 건수가 3분의 1이었다. 이제 셋 다 **활성 규칙 · 열린 문제 ·
> 억제 제외**로 통일된다. 상세·남는 차이(최근 해결분 5분 창)는 `contract_home.md`의 "축 정정" 절 참조.
| 9 | `hostgroup_status` | — | — | — | 6×11 | ✅ | `GET /hosts/hostgroup-problems`(기존, **최근 30일 창** — §8) |
| 10 | `asset_kpi` | — | ✅ | — | 4×5 | — | `/home/summary`.asset |
| 11 | `map_summary` | — | ✅ | — | 6×5 (시드는 12×5 띠) | ✅ | `/home/summary`.map |
| 12 | `main_network_map` | — | ✅ | — | 6×12 | ✅ | 기존 `MainNetworkMapCard` 로직 |
| 13 | `main_geo_map` | — | ✅ | — | 6×12 | ✅ | 기존 `MainGeoMapCard` 로직 |
| 14 | `recent_reports` | — | ✅ | ✅ | 6×10 | ✅(admin) | `/home/summary`.recentReports |

> 기본 크기는 2026-08-18 E2E F-3 실측으로 상향(rowHeight 30·margin 8 → 카드 `38h-8`px, 본문은 머리 39px 제외). FE 상수·BE enum·시드가 같은 값이다.

- **pinned** = 삭제 불가(이동·리사이즈·이름변경은 가능). **시스템 3종만** pinned다 — `system_scheduler`는 관리자가 원하면 지울 수 있다(다시 추가 가능).
- **unique** = 대시보드당 1개. 목록/차트 3종(`alarm_list`·`alarm_severity_pie`·`hostgroup_status`)만 여러 개 둘 수 있다(필터를 달리 두는 것이 용도).
- **adminOnly** = 카탈로그 노출·데이터 제공 모두 관리자 한정. 판정 축은 **`userRole`**(ADMIN | SUPER_ADMIN)이다 — JWT `roleid`가 아니다.
- **기본 크기**는 BE 폴백값이다. 렌더 규격(minW/minH 등)의 정본은 FE.

### `config` 스키마(타입별)
| type | config |
|---|---|
| `alarm_list` | `{ limit?: 5\|10\|20, minSeverity?: "0".."5" }` |
| `hostgroup_status` | `{ limit?: 5\|10\|20 }` |
| `recent_reports` | `{ limit?: 5 }` |
| 그 외 | `{}` |

> ⚠️ BE는 **config 내용을 검증하지 않는다**(타입별 스키마가 갈려서). 잘못된 값은 그대로 저장되고 FE가 방어해야 한다. `alarm_list`의 `limit`은 **FE 쿼리키에 포함**해야 위젯 2개가 서로의 캐시를 덮지 않는다.

---

## 5. 기본 세트 시드 좌표 (**BE 상수가 정본** — `HomeWidgetDefaults`)

12컬럼 그리드. 두 배치 모두 겹침 없음이 테스트로 강제된다.

### 비관리자 10개
| type | x | y | w | h |
|---|---:|---:|---:|---:|
| `system_license` | 0 | 0 | 4 | 8 |
| `system_users` | 4 | 0 | 4 | 8 |
| `system_datasources` | 8 | 0 | 4 | 8 |
| `alarm_kpi` | 0 | 8 | 6 | 5 |
| `infra_kpi` | 6 | 8 | 6 | 5 |
| `alarm_list` | 0 | 13 | 6 | 11 |
| `hostgroup_status` | 6 | 13 | 6 | 11 |
| `map_summary` | 0 | 24 | 12 | 5 |
| `main_network_map` | 0 | 29 | 6 | 12 |
| `main_geo_map` | 6 | 29 | 6 | 12 |

### 관리자 12개 (위 10개 + 관리자 전용 한 행, 맵 요약·대표 맵은 그만큼 아래로)
| type | x | y | w | h |
|---|---:|---:|---:|---:|
| `system_license` | 0 | 0 | 4 | 8 |
| `system_users` | 4 | 0 | 4 | 8 |
| `system_datasources` | 8 | 0 | 4 | 8 |
| `alarm_kpi` | 0 | 8 | 6 | 5 |
| `infra_kpi` | 6 | 8 | 6 | 5 |
| `alarm_list` | 0 | 13 | 6 | 11 |
| `hostgroup_status` | 6 | 13 | 6 | 11 |
| **`recent_reports`** | 0 | 24 | 6 | 10 |
| **`system_scheduler`** | 6 | 24 | 6 | 10 |
| `map_summary` | 0 | 34 | 12 | 5 |
| `main_network_map` | 0 | 39 | 6 | 12 |
| `main_geo_map` | 6 | 39 | 6 | 12 |

> 🔴 **행마다 높이가 같고 오른쪽이 비지 않는다** — react-grid-layout은 편집 모드에 들어가는 순간 위쪽 빈칸으로 카드를 끌어올려(`compactType=vertical`) 저장하므로, 시드가 이미 "압축된 상태"가 아니면 첫 편집에서 좌표가 덮어써진다(E2E F-4). 시드를 바꿀 때 이 성질을 유지할 것.

---

## 6. `GET /home/system-status` → `HomeSystemStatus`

```jsonc
{
  "users": {                      // object | null (집계 실패 시 null)
    "total": 11,                  // number — 관리자 포함 전수
    "active": 9,                  // number
    "inactive": 2,                // number
    "admins": 1,                  // number — userRole ∈ {ADMIN, SUPER_ADMIN}
    "online": 3                   // number | null — Redis 세션 키 SCAN. Redis 장애 시 null
  },
  "dataSources": [                // array (항상 존재, 실패 시 빈 배열)
    {
      "id": "zabbix-default",     // string
      "type": "zabbix",           // string
      "displayName": "Zabbix",    // string
      "status": "UP",             // "UP" | "DOWN" | "NOT_CONFIGURED"
      "detail": "7.0.3",          // string | null — UP이면 버전, DOWN이면 실패 사유
      "latencyMs": 42,            // number | null — 요청을 보낸 경우만
      "checkedAt": "2026-08-18T05:13:45.076Z",   // string
      "endpoint": "https://dmove.co.kr"          // string | null — scheme://host[:port]만
    }
  ],
  "infrastructure": [             // array — 항상 database/redis/aws 3건, 이 순서
    { "key": "database", "status": "UP",   "latencyMs": 2,    "detail": null },
    { "key": "redis",    "status": "UP",   "latencyMs": 1,    "detail": null },
    { "key": "aws",      "status": "NOT_CONFIGURED", "latencyMs": null, "detail": null }
  ],
  "schedulers": [                 // array | null — 🔴 관리자에게만. 그 외에는 null
    {
      "jobKey": "asset_sync",     // string
      "enabled": true,            // boolean
      "nextRunAt": "2026-08-18T06:00:00.000Z",   // string | null — 비활성이면 null
      "lastRun": {                // object | null — 이력이 없으면 null
        "status": "success",      // "success" | "failed"
        "startedAt": "2026-08-18T05:00:00.000Z", // string
        "durationMs": 1200,       // number
        "message": "added=3 updated=40"          // string | null — 실패 사유 또는 성공 요약
      }
    }
  ],
  "checkedAt": "2026-08-18T05:13:45.076Z"        // string — 캐시 히트면 캐시 생성 시각
}
```

### 상태 값(`ConnectionStatus`) — 4값 유니언
| 값 | 뜻 | 나오는 곳 |
|---|---|---|
| `UP` | **실측** 성공 | dataSources, infrastructure(database·redis) |
| `DOWN` | 설정은 됐으나 실패(도달 불가·타임아웃·오류) | dataSources, infrastructure |
| `CONFIGURED` | **설정은 됨. 실측하지 않음** | infrastructure(`aws`)만 |
| `NOT_CONFIGURED` | 접속 정보 없음(장애 아님) | dataSources(헬스 미지원 소스), infrastructure(`aws`) |

> 🔴 **`CONFIGURED`를 `UP`으로 그리지 말 것.** AWS는 STS 실호출을 하지 않는다(비용·실패 노이즈). "설정됨"과 "정상 확인됨"을 같은 배지로 그리면 "정상이라던데 안 된다"는 문의가 된다. 배지 문구·색을 분리할 것.
>
> 🔴 **`detail`은 그대로 화면에 뜬다.** 자격증명이 섞이지 않도록 BE가 걸러 두었지만, FE도 이 값을 링크·HTML로 해석하지 말고 텍스트로만 출력할 것.

### 실측 방식 (설계 D6 — 가짜 상태 금지)
| 대상 | 방법 |
|---|---|
| Zabbix | `apiinfo.version` **실호출**(무인증). 타임아웃 4초 → 초과 시 DOWN |
| database | `SELECT 1` + 지연 측정 |
| redis | `PING` |
| aws | `Setting(CLOUD)`의 username/password 존재 여부만. **실호출 없음**. (설정 조회 자체가 예외면 `DOWN`+detail 메시지 — DB 장애 등 극단 경로) |

### 캐시 / 폴링
- `users` · `dataSources` · `infrastructure`는 **전역** Redis 캐시 `HOME_SYSTEM_STATUS`, **TTL 30초**.
- `schedulers`는 캐시에 들어가지 않고 매 요청 DB에서 읽는다(관리자 값이 공용 캐시에 섞이지 않게).
- FE `refetchInterval`은 **30초 이상**으로. 그보다 잦게 불러도 같은 값이 온다.

### 부분 실패
항목별로 독립적이다 — Zabbix가 죽어도 `users`·`infrastructure`는 채워진다. 실패하면 그 항목만 `null`(users/schedulers) 또는 `status:"DOWN"` + `detail`(dataSources/infrastructure)이 된다. **전체 500은 나지 않는다.**

---

## 7. 에러 코드 표

| errorCode | body `code` | 발생 EP | 상황 | FE가 할 일 |
|---|:---:|---|---|---|
| `WIDGET_TYPE_INVALID` | 400 | #2 | 카탈로그에 없는 `widgetType` | FE 상수 ↔ BE enum 불일치 신호. 토스트 + 재배포 필요 |
| `WIDGET_DUPLICATE` | 400 | #2 | unique 타입을 이미 보유 | 추가 모달에서 해당 항목 **disabled**(사전 차단) |
| `WIDGET_ADMIN_ONLY` | 400 | #2 | 관리자 전용 타입을 비관리자가 추가 | 카탈로그에서 미노출(사전 차단) |
| `WIDGET_PINNED` | 400 | #5 | 시스템 위젯 삭제 시도 | 삭제 버튼 미노출(사전 차단) |
| `WIDGET_NOT_FOUND` | **404** | #4 #5 | 없는 id 또는 **남의 위젯** | 목록 재조회(`invalidate`) |
| `USER_NOT_FOUND` | 404 | 전체 | principal에 MovesEye PK 없음 | 실제로는 도달하지 않는다(로그인 경로가 항상 채움) |

- 전부 **HTTP 200 + body code**다(401만 실제 상태코드). 403은 이 기능에서 나오지 않는다 — 관리자 전용 판정이 "거부"가 아니라 "생략"(schedulers null)이거나 `WIDGET_ADMIN_ONLY`로 갈리기 때문.
- ⚠️ 기존 호스트 위젯(`/host/{id}/widgets`)의 `WIDGET_NOT_FOUND`는 **code 400**이다. 홈 위젯만 404다(신규 EP라 보존할 계약이 없어 의미에 맞췄다). 같은 errorCode를 공유하므로 FE에서 상태코드로 분기하지 말고 **호출한 API 단위로 처리**할 것.

---

## 8. FE 주의사항

- 🔴 **`alarm_list`·`hostgroup_status`는 기존 EP에 반드시 `from`/`to`를 보낸다.** BE `DateRangeFilterDto`가 원시 `long`이라 미전송 시 0(epoch)으로 받아 항상 0건이다(E2E F-1). 알람 목록은 `from=0`(발생 중 전부)~now, 호스트그룹은 **최근 30일 창**(같은 EP가 Zabbix에서 30일 초과 창은 500 — 90일·연초 모두 실측 실패). `to`는 분 단위 올림으로 쿼리키를 안정화.
- 🔴 `/event/problems`의 `occurrenceTime` 정렬은 원본 Nest 1:1 보존으로 `(b-a)*direction` — **ASC가 최신순**이다(E2E F-5). 이벤트 화면 호환을 위해 BE는 그대로 두고 홈은 ASC를 보낸다.

1. **언랩 깊이** — axios 인터셉터 + `useDmoveQuery`가 2겹을 벗기므로 소비자는 `data` payload를 직접 받는다(`data.data` 금지). 테스트 mock도 payload 직접.
2. **`config`는 머지가 아니라 교체** — 설정 모달은 기존 config를 읽어 변경분을 얹은 **전체 객체**를 PATCH해야 한다.
3. **레이아웃 저장은 `id`(number)** — react-grid-layout의 `i`는 문자열이다. `Number(i)`로 변환.
4. **낙관적 업데이트 주의** — `POST /widgets`는 서버가 정한 `id`·`pinned`·기본 좌표를 돌려준다. 응답으로 캐시를 갱신할 것(임의 생성 id로 레이아웃을 저장하면 남의 것도 내 것도 아닌 id가 BE 경고 로그로 남는다).
5. **`pinned` 위젯은 삭제 버튼 자체를 숨긴다**(BE 거부는 최종 방어선).
6. **`system_status` 폴링은 30초** — 그보다 짧게 잡아도 캐시 때문에 같은 값이다.
7. **`schedulers: null`과 `[]`는 다르다** — `null`은 "관리자가 아님"(위젯 미노출/업셀), `[]`는 "등록된 배치가 없음".
8. **`online: null`** = Redis 장애. `0`(접속자 없음)과 구분해 표기할 것.
9. **rAF 함정** — Chrome MCP hidden 탭에서는 ECharts 도넛이 멈춘 것처럼 보인다(QA 오진 금지).
10. **`GET /home/widgets`가 첫 호출에서 DB 쓰기를 한다** — 시드 때문이다. 프리페치를 여러 곳에서 동시에 걸지 말 것(같은 순간 2회 호출 시 이론상 20개가 깔릴 수 있다. §9 참조).

---

## 9. 알려진 제약 / 미결

| # | 내용 | 판단 |
|---|---|---|
| A1 | **동시 시드 경합** — 완전히 같은 순간의 두 `GET /home/widgets`가 각자 시드하면 기본 세트가 2벌 깔린다(READ COMMITTED). DB 유니크 제약을 안 건 이유는 unique 정책이 타입마다 달라 카탈로그를 SQL에 복제해야 하기 때문(V23 주석). | 실사용 확률 낮고 `reset`으로 복구 가능. FE가 홈 진입 시 1회만 호출하면 발생하지 않는다 |
| A2 | **`config` 값 미검증** — `limit: 999`도 저장된다 | 타입별 스키마를 BE가 알면 카탈로그가 양쪽에 이중으로 생긴다. FE가 방어 |
| A3 | **AWS는 실호출 헬스체크 없음**(설계 A3) | 필요해지면 `HealthPort`를 AWS 어댑터에도 붙인다 |
| A4 | **`endpoint`는 Zabbix 타입에만 채워진다** — app이 `ZabbixConnectionResolver`(engine-api `zabbix/` 구역 계약)를 참조하는 Phase 1 한정 분기 | Phase 2에서 `DataSourceDescriptor`에 endpoint가 생기면 이관 |
| A5 | **Zabbix 헬스 타임아웃 4초는 별도 스레드**로 건다(`ZabbixClient`의 connect 10s/read 30s를 못 줄여서 — 공유 클라이언트라 다른 호출에 영향) | 끊긴 워커는 클라이언트 자체 타임아웃에 스스로 종료. 데몬 스레드 |
| A6 | **런타임 미검증** — 단위 테스트만 green. :3000 재기동(V23 적용) 후 실제 응답 확인 필요 | 다른 세션이 :3000을 쓰는 중이라 기동은 사용자가 |

---

## 10. 변경된 BE 파일

### 신규
- `src/main/resources/db/migration/V23__home_widget.sql`
- `src/main/java/com/dmove/moveseye/home/` — `HomeWidgetType`, `HomeWidgetDefaults`, `HomeWidgetService`, `HomeSystemStatusService`, `domain/HomeWidget`, `domain/HomeWidgetRepository`, `dto/HomeWidgetDtos`, `dto/HomeSystemStatusDto`
- `engine-api/.../engine/port/HealthPort.java`, `engine/model/health/{HealthStatus,HealthCheckResult}.java`
- `engine-zabbix/.../zabbix/health/ZabbixHealthAdapter.java`
- 테스트: `HomeWidgetServiceTest`(17) · `HomeWidgetCatalogTest`(7) · `HomeSystemStatusServiceTest`(9) · `ZabbixHealthAdapterTest`(5)

### 수정
- `home/HomeController.java` — EP 7개 추가
- `engine-api/.../common/exception/ErrorCode.java` — `WIDGET_PINNED`·`WIDGET_DUPLICATE`·`WIDGET_TYPE_INVALID`·`WIDGET_ADMIN_ONLY`
- `engine-api/src/main/proto/engine.proto` — HealthPort 섹션(사양 동기화)
- `engine-zabbix/.../zabbix/metric/ZabbixDataSourceRegistry.java` — `HealthPort` 분기(+ 테스트)
- `common/service/RedisClientService.java` — `scanCount(pattern)`(SCAN, KEYS 금지)·`ping()`
- `user/repository/UserRepository.java` — `countByStatus`·`countByUserRoleIn`

## 11. 2026-09-15 추가 — APM 대표 위젯 기본 세트 편입 (ZM-122)

- 카탈로그 22종: `apm_traffic_kpi`(신규, 12×5, unique·not pinned·not adminOnly) — 데이터 `GET /apm/widgets/traffic-totals`
  (`{ rps, errorRatePct, p95Ms, activeRequests, prev{같은 4개}, windowMinutes }`, null=잴 수 없음, 개요 `totals`와 같은 계산·모집단).
- 기본 세트: 비관리자 13(10+3) / 관리자 15(12+3). 편입된 3종 = `apm_traffic_kpi`(y24|34, 12×5) · `apm_status`(6×8) · `apm_alerts`(6×8).
  `apm_slow_services`는 카탈로그 전용. 맵 요약·대표 맵은 그만큼 아래로(비관리자 y37/42, 관리자 y47/52).
- 🔴 FE 노출 축이 둘이 됐다: `apmView`(권한) **and** `apmLicensed`(`useLicense().allowsFeature("APM")`, 읽는 중 true).
  라이선스에 APM이 없는 설치본은 기본 세트의 APM 카드 3종이 전부 503 배너가 되므로 그리드·카탈로그에서 **그리지 않는다**(행은 남는다).
- 기존 사용자의 홈에는 자동으로 붙지 않는다(시드는 0건일 때만). "기본으로 되돌리기" 또는 위젯 추가로 붙는다.

## 🔄 FE 요청사항

> 2026-08-18 · fe-engineer · FE 연동 완료 후 대조 결과. **계약 위반은 없음**(EP 7개·DTO 필드·에러코드·카탈로그 플래그·기본 크기 전부 일치, `homeWidgetRegistry.test.tsx`가 §4 표를 고정). 아래는 요청/정보 3건.

| # | 구분 | 내용 | 지금 FE가 한 처리 |
|---|---|---|---|
| R1 | 요청(낮음) | **`GET /event/problems`에 심각도 필터가 없다**(`EventListReqDto`: keyword/status/groupId/hostId뿐). `alarm_list`의 `config.minSeverity`는 서버가 걸러 줄 수 없어 **FE가 클라이언트에서 거른다** — 필터가 걸리면 50건 창(window)을 받아 거른 뒤 `limit`만큼 자른다. 문제 수가 많은 환경에서 "심각도 재해만 5건"을 요구하면 창 밖의 항목이 누락될 수 있다. 여유 될 때 `minSeverity` 쿼리 파라미터를 얹어 주면 창 없이 정확해진다 | `HOME_ALARM_FILTER_WINDOW = 50` (`constants/home.ts`) + `AlarmListWidget`에서 필터·슬라이스 |
| R2 | 정보 | **`recent_reports`의 `config.limit`은 FE 설정 UI에서 뺐다** — `/home/summary`.recentReports가 서버에서 5건 고정이라 10·20을 고를 수 있게 하면 "설정이 안 먹는다"가 된다. BE 스키마(§4)는 그대로 두고 FE만 노출하지 않는 것이라 계약 변경은 아니다. 향후 리포트 건수를 파라미터화하면 되살린다 | `constants/homeWidgets.ts`의 `recent_reports.configFields = []` |
| R3 | 확인 요청 | `HomeSystemStatus.schedulers[].lastRun`을 계약대로 `{status, startedAt, durationMs, message}`로 잡았다(설계서 초안의 `finishedAt`은 없는 것으로 확정). 기존 `/settings/schedulers`의 `TSchedulerRunLog`(`summary`·`errorMessage` 분리)와 **필드가 다른 별도 타입**이라 FE는 `THomeSchedulerRun`을 따로 뒀다 — 의도한 것이 맞는지만 확인(맞다면 조치 없음) | `types/home.ts`의 `THomeSchedulerRun` |

기타 반영 사항(조치 불필요): `pinned`는 시스템 3종만 → `system_scheduler`에 삭제 버튼 노출 · `CONFIGURED`는 `UP`과 다른 배지(문구·색 분리) · `online: null`은 "-" + 세션 저장소 장애 툴팁(0과 구분) · `schedulers: null`은 "관리자 전용" 안내(`[]`는 "데이터 없음") · `title: ""`은 막지 않고 그대로 보내 기본 제목 복원 · `WIDGET_NOT_FOUND` 등 변경성 실패 시 목록 invalidate · `GET /home/widgets`는 홈 진입 1회만 호출(시드 경합 A1 회피).
