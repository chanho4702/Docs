# API 계약 — 홈(랜딩) 요약  `contract_home.md`

작성: be-engineer · 2026-07-20 · 브랜치 ZM-87 · 상태: **구현 완료 / 빌드·테스트 그린**
소비자: fe-engineer(`services/home.api.ts`·`types`·`hooks/useHome.ts`), integration-qa

---

## 0. 공통 래퍼 (모든 EP 동일)

성공 응답은 `ApiResult<T>`로 감싸지고, 성공 시 전역 advice가 `syncTime`을 자동 주입한다.

```jsonc
{
  "status": "SUCCESS",
  "code": 200,
  "data": { /* T */ },
  "syncTime": "2026-07-20T02:15:30.123Z"   // string | null (성공 응답에만 존재)
}
```

- 에러/권한 거부는 기존 규약 그대로: **HTTP 200 + body `code`(예: 403)**, `status:"ERROR"`. 401(미인증)만 실제 상태코드.
- FE 소비 주의: axios 인터셉터 + `useDmoveQuery`가 **2겹 언랩** → 컴포넌트는 `data`(아래 `HomeSummaryDto`)를 **직접** 받는다. `data.data` 과다 언랩 금지(메모리 `fe-usedmovequery-unwrap`).

---

## 1. 신설: `GET /home/summary` → `ApiResult<HomeSummaryDto>`

- 인증: 필수(bearer 쿠키/헤더). 인증 사용자 **전체** 접근 — 관리자 가드 없음.
- `@VisitorIdCheck` 적용(다른 인증 EP와 동일 — FE는 별도 처리 불필요, 기존 axios 설정 그대로).
- 쿼리 파라미터 **없음**.
- 캐싱: 서버가 **사용자 스코프 Redis 60초 TTL** 캐시. 도메인별 부분 실패 시 해당 최상위 필드만 `null`(전체 500 아님).

### 응답 `HomeSummaryDto` 전체 shape

```jsonc
{
  "alarm": {                          // AlarmSummary | null  (Zabbix 집계 실패 시 null)
    // 🔴 축(2026-08-27 정정): 활성 규칙(enabled trigger)의 '열린' 문제만 · 억제 제외
    //    = GET /event/problems(show=RECENT)와 같은 축. 아래 "축 정정" 절 참조.
    "severityCounts": {               // Record<"0".."5", number> — 항상 6개 키 모두 존재
      "0": 0, "1": 2, "2": 5, "3": 1, "4": 0, "5": 0
    },
    "totalOpen": 8                    // number — severityCounts 합
  },
  "infra": {                          // InfraSummary | null  (집계 실패 시 null)
    "totalHosts": 10,                 // number(int)
    "availableHosts": 8,              // number(long) — 인터페이스 available='1' 호스트 수
    "availabilityPct": 80.0,          // number — availableHosts/totalHosts*100, 소수1자리. 호스트 0대면 100
    "healthScore": 75.5               // number | null — 0~100 소수1자리. 호스트 0대면 100
  },
  "asset": {                          // AssetSummaryDto | null  (DB 집계 실패 시 null)
    "total": 50,                      // number(long) — 전체(excluded 포함)
    "zabbixCount": 40,                // number
    "customCount": 10,                // number
    "excludedCount": 5,               // number
    "monitored": 30,                  // number (excluded 제외)
    "unmonitored": 15,                // number (excluded 제외)
    "lifecycleReview": 3,             // number (excluded 제외, lifecycle_status!=active)
    "lastSyncedAt": "2026-07-19T23:00:00.000Z"  // string(UTC ISO) | null (동기화 자산 없으면 null)
  },
  "map": {                            // MapSummary | null  (집계 실패 시 null)
    "geoClusterCount": 3,             // number(int) — 지리 클러스터 총 개수
    "geoProblemClusterCount": 2,      // number(int) — openProblemCount>0 인 클러스터 수
    "geoWorstSeverity": "4",          // string("0".."5") | null — 전 클러스터 중 최악 severity. 문제 없으면 null
    "networkMapCount": 7              // number(long) — 네트워크 아키텍처(맵) 총 개수
  },
  "recentReports": [                  // RecentReportDto[] | null  (관리자만 배열, 그 외 null)
    {
      "id": 1,                        // number
      "title": "Production",          // string — ⚠️아래 주의 참조(그룹명 유래)
      "periodType": "WEEK",           // "WEEK" | "MONTH"
      "periodStart": "2026-06-08",    // string(ISO date, 시각 없음)
      "createdAt": "2026-06-15T03:00:00.000Z"  // string(UTC ISO)
    }
    // 최신순(periodStart desc, id desc) 최대 5건
  ]
}
```

### null 규칙 요약 (FE 렌더 가이드)
| 필드 | null 이 되는 경우 | FE 처리 |
|---|---|---|
| `alarm` | Zabbix problem 집계 실패 | KPI 알람 칩 카드 스켈레톤/"—" 처리 |
| `infra` | 호스트 KPI 집계 실패 | 가용성/호스트 타일 "—" |
| `asset` | 자산 DB 집계 실패 | 자산 수 타일 "—" |
| `map` | 지리 live 또는 네트워크맵 count 실패 | 맵 요약 카드 "—" |
| `recentReports` | **비관리자**(항상 null) **또는** 관리자인데 집계 실패 | `null`이면 **최근 리포트 카드 자체 미노출**(설계 §2 가드) |
| `infra.healthScore` | (현재 구현상 infra가 살아있으면 항상 값) | 방어적으로 null 허용 타입 |
| `map.geoWorstSeverity` | 오픈 problem 있는 클러스터 없음 | 뱃지 미표시(정상) |
| `severityCounts.*` | (개별 키는 항상 존재, 값 0 가능) | 0도 유효 값 |

### 권한/역할 주의
- `recentReports != null` ⟺ 요청자 `userRole ∈ {ADMIN, SUPER_ADMIN}`. 서버가 `AdminAccessChecker.isAdmin`(throw 없는 판정)으로 결정하며, **비관리자에겐 403이 아니라 조용히 null**. → FE는 리포트 카드 노출 조건을 `recentReports !== null`로 두면 됨(빈 배열 `[]`은 관리자+데이터 0건이므로 카드는 노출하되 "리포트 없음" 표시).

### severity 코드 의미 (Zabbix 원값 보존)
`"0"` 미분류 · `"1"` 정보 · `"2"` 경고 · `"3"` 보통(average) · `"4"` 높음(high) · `"5"` 재해(disaster).
FE는 기존 `StatusBadge`/`getColorSeverity`/`HostStatus` 매핑을 그대로 재사용.

---

## 2. 재사용(변경 없음) — 홈이 함께 쓰는 기존 EP 2종

목록성 데이터는 신규 EP가 아니라 아래 기존 EP를 그대로 호출한다. (계약 불변, springdoc 동일)

### 2-1. 현재 발생 알람 목록 — `GET /event/problems` → `ApiResult<EventProblemResListDto>`
요청(모두 쿼리스트링, `@ModelAttribute`):
| param | 타입 | 기본 | 비고 |
|---|---|---|---|
| `limit` | number | 10 | 홈은 소량(예: 5~10) |
| `offset` | number | 0 | |
| `sortBy` | string | `occurrenceTime` | 홈은 최신순 기본 |
| `sortDirection` | `ASC`\|`DESC` | `ASC` | 홈은 `DESC` 권장 |
| `keyword` | string | — | 옵션 |
| `status` | HostStatus enum | — | 옵션(심각도 필터) |
| `showSuppress` | boolean | — | 옵션 |
| `groupId` / `hostId` | string | — | 옵션 |
| `from` / `to` | (DateRangeFilterDto) | — | time_from/time_till(epoch). 미지정 시 서버 기본 범위 |

응답:
```jsonc
{
  "items": [ {
    "eventId": "...", "host": "...", "hostGroup": [ { /* GroupRef */ } ],
    "description": "...", "occurrenceTime": "...", "resolutionTime": "...",
    "severity": "HIGH",            // HostStatus enum
    "status": "PROBLEM", "isRead": false /* …NON_NULL 필드 다수 생략 가능 */
  } ],
  "total": 123,
  "statusCounts": { "total": n, "notClassified": n, "information": n,
                    "warning": n, "average": n, "high": n, "disaster": n }
}
```
→ 홈 "발생 알람 top-N 목록" 카드: `items`(limit 소량) + 행별 `severity`/`host`/`occurrenceTime` 사용. KPI 심각도 칩은 `/home/summary`의 `alarm.severityCounts`를 쓰고, 이 EP의 `statusCounts`와 **중복 산출하지 말 것**(홈 KPI 단일 출처 = summary).

#### 🔴 축 정정 (2026-08-27) — `alarm.severityCounts` 값이 크게 줄었다

**의도된 정정이다. 회귀가 아니다.**

`/home/summary`의 알람 KPI가 **비활성 규칙(disabled trigger)의 알람까지** 세고 있어서, 같은 순간을
문제 목록과 다르게 말했다. dev 실측(2026-08-27, `from=0` 전기간):

| | notClassified(0) | information(1) | warning(2) | average(3) | high(4) | disaster(5) | 합 |
|---|---:|---:|---:|---:|---:|---:|---:|
| 홈 KPI (정정 전) | 2 | 104 | 37 | 756 | 4 | 39 | **942** |
| `GET /event/problems` | 2 | 22 | 37 | 242 | 3 | 39 | **345** |

→ **도넛을 눌러 목록으로 갔는데 건수가 3분의 1**이면 사용자는 둘 중 무엇도 믿지 않는다.
이제 KPI도 목록과 같은 축으로 센다: **활성 규칙 · 열린 문제 · 억제 제외**.

- 값이 작아지는 것이 정상이다. FE는 별도 대응이 필요 없다(같은 필드·같은 형태).
- 억제는 원래도 목록·KPI 모두에서 실질 차이가 없었고(실측), 차이의 본체는 **비활성 규칙 축**이었다.
- ⚠️ **남는 차이 하나**: 목록은 `recent=true`라 **최근 해결분**(Zabbix `ok_period`, 기본 5분)을 포함하고
  KPI는 포함하지 않는다. 창이 5분이라 실무상 0~소수이며, 맞추면 KPI가 "지금 열려 있는 문제 수"라는
  뜻을 잃으므로 **의도적으로 두었다**.
- 구현: `AlertQuery.enabledRulesOnly` 플래그 → Zabbix 어댑터가
  `trigger.get{output:[triggerid], filter:{value:1, status:0}}` 1콜로 활성 트리거 id를 받아
  심각도별 `problem.get countOutput objectids=…` 에 건다(콜 수 기존 6 → 7, 트리거 id는 토큰별 60초 캐시).
  🔴 **`filter`만 건다** — `monitored:true`·`skipDependent:true`를 넣으면 목록보다 **좁아진다**
  (전자는 호스트·아이템까지 켜져 있기를 요구하고, 후자는 상위 트리거가 문제일 때 종속 트리거를 뺀다).
  목록은 `rule.enabled()` 하나만 보므로, 그 둘을 넣으면 **목록엔 있는 알람이 KPI에서 사라져** 축 정정이
  반대 방향으로 어긋난다.
  🔴 활성 트리거가 **0건이면 `problem.get`을 부르지 않고 0**을 낸다 — 빈 `objectids`는 Zabbix가
  "필터 없음"으로 읽어 전량을 세기 때문이다(정반대 값).
- **objectids 분할**: id가 **500개**를 넘으면 그 단위로 끊어 세고 **합산**한다(1200개 → 3콜).
  알람 하나의 `objectid`는 하나뿐이라 조각끼리 겹치지 않으므로 단순 덧셈이 곧 전체 개수다.
  ⚠️ **상한 전제**: "문제 상태인 활성 트리거 수"가 **수천 이하**인 설치본을 전제한다. 그 이상이면
  심각도당 콜 수가 선형으로 늘어(수만 개면 등급마다 수십 콜) 홈 응답이 느려진다 — 그 규모에서는
  집계를 DB 스냅샷으로 옮기는 편이 맞다(지금은 과설계).
- **캐시 경계**: 토큰별 60초 TTL + **최대 256항목**(삽입 순서로 오래된 것부터 밀어냄). TTL만으로는
  토큰이 계속 바뀌는 환경에서 60초 창 안에 무한정 쌓일 수 있어 크기로도 막는다.
- 다른 수집 소스(비-Zabbix)는 이 플래그를 **무시해도 된다** — "규칙이 비활성"이라는 개념이 없으면
  걸러낼 대상도 없다(포트 계약 중립성).

### 2-2. 호스트그룹 상태 — `GET /hosts/hostgroup-problems` → `ApiResult<PaginationResponseDto<HostGroupProblemSummaryDto>>`
**(그룹별 심각도 분포가 필요한 "그룹 상태 카드"엔 이쪽을 권장.** 단순 그룹 목록/호스트 수만이면 `/hosts/hostgroups`.)

요청(쿼리, `@ModelAttribute`): `limit`(10) · `offset`(0) · `sortDirection`(ASC) · `keyword?` · `sortBy?` · `status?` · `from?`/`to?`(DateRange).

응답:
```jsonc
{
  "items": [ {
    "groupId": "10", "groupName": "Production", "hostNames": "web-01, db-01, …",
    "notClassified": 0, "information": 1, "warning": 2,
    "average": 0, "high": 1, "disaster": 0, "total": 4   // 모두 number(long)
  } ],
  "total": 12
}
```
→ 홈 "호스트그룹 상태" 카드: 그룹별 심각도 카운트 뱃지 + `total`. `PaginationResponseDto`는 `{ items, total }`만(‑limit/offset 없음).

> 대안 `GET /hosts/hostgroups` → `ApiResult<HostGroupResDto>`: 그룹명·호스트 수·디바이스 타입 분포 중심(심각도 분포 없음). 홈 그룹 카드가 "가용성/문제수" 뉘앙스면 `hostgroup-problems`, "구성/디바이스 분포" 뉘앙스면 `hostgroups`. **설계 §2의 "그룹별 가용성·건강도·문제수"에는 `hostgroup-problems`가 적합**하여 이를 1순위로 권고.

---

## 3. 캐싱·갱신·에러 처리 권고 (FE)

- **폴링/갱신 주기 = 60초**: 서버가 60초 캐시하므로 `useHome`의 `refetchInterval`은 60초로 두면 서버 재계산과 정합(그보다 짧게 폴링해도 캐시 히트라 부하는 낮지만 값은 최대 60초 stale). `staleTime` 60초 권장.
- **홈 전용 쿼리키**: `HOME_QUERY_KEY`(신규) 사용 — `/event/problems`·`/hosts/hostgroup-problems`는 기존 화면과 키 공유 시 캐시 충돌 위험이 있으니 **홈 전용 파생 키**로 분리(예: `['home','problems']`).
- **부분 null 방어**: 최상위 필드(`alarm`/`infra`/`asset`/`map`)는 각각 optional 렌더 — 특정 카드만 "—"/스켈레톤 표시, 페이지 전체를 에러로 떨구지 말 것.
- **빈 데이터**: `totalOpen:0`·`geoClusterCount:0`·`networkMapCount:0`·`asset.total:0` 등은 정상 값(에러 아님) — "0" 또는 "데이터 없음" 카피로 표시.
- **리포트 카드 노출**: `recentReports === null` → 카드 미렌더. `recentReports === []` → 카드는 렌더 + "최근 리포트 없음". `length > 0` → 목록.

---

## ⚠️ 설계 대비 이탈 / 결정 사항

1. **`recentReports[].title`는 host_group_report에 title 컬럼이 없어** 해석된 **그룹 이름**(Zabbix host group name, 미매핑 시 `groupId`)을 사용한다. 설계 JSON 스케치의 `title` 키·타입(string)은 그대로 충족. FE는 그룹명으로 표시하면 됨.
2. `recentReports` 정렬 = `periodStart desc, id desc`(최신 기간 우선). 설계 "최신 5건" 충족.
3. `infra.healthScore` 타입은 `Double`(nullable)로 선언(설계 `n | null` 반영). 현재 구현상 `infra`가 non-null이면 항상 값이 채워진다(호스트 0대여도 100).
4. `map.geoProblemClusterCount` 판정 = `openProblemCount > 0`(오픈 problem 1건 이상인 클러스터). 설계의 "worstSeverity>=경고 or openProblemCount>0"에서 openProblemCount>0가 상위 조건이라 이를 채택.
5. 타입 폭: `availableHosts`·`asset.*`·`map.networkMapCount`·`map`/`alarm` 카운트는 Java `long`/`int` 혼재이나 JSON에선 모두 `number`. FE 타입은 전부 `number`로 두면 됨.

---

## 산출 파일 (구현)
- 신규: `home/HomeController.java`, `home/HomeService.java`, `home/dto/HomeSummaryDto.java`, `host/report/dto/RecentReportDto.java`
- 재사용 확장: `HostService.computeInfraKpi()`+`InfraKpi` record, `ReportManagementService.getRecentReports()`, `HostGroupReportRepository.findTop5By…`, `AdminAccessChecker.isAdmin()`
- 테스트: `home/HomeServiceTest.java` (6 케이스, 그린)
