# API 계약 — 호스트 그룹별 모니터링 (Phase 0 + Phase A)

> 작성일: 2026-06-17 · 출처: BE 구현(be-engineer) · 기획 정본: `_workspace/planning/plan_hostgroup-monitoring.md`
> 범위: **Phase 0(KPI 가용성/건강도)** + **Phase A(그룹 리소스 추이)**. 탭④ 시계열·Top-N·알람추이는 미포함.
> 이 문서는 다음 단계 FE 연동의 **단일 진실원천**이다.

---

## 1. Phase 0 — 기존 `GET /hosts/:groupid` 응답 필드 추가

### 엔드포인트
- **메서드/경로**: `GET /hosts/:groupid`
- **권한**: 기존과 동일 (JWT 인증 + `x-visitor-id` 헤더 필수). 역할 제한 없음(컨트롤러에 RolesGuard 미적용).
- **요청**: 변경 없음 (path param `groupid`).
- **응답 래퍼**: `ApiResult<HostGroupDetailDto>`

### 변경 사항 — **기존 필드 100% 보존, 신규 2개만 추가**
기존 필드(`id, name, safetyPercentage, alerts, totalHosts, server, network, security, application, hardware, database, notClassified, recentlyViewedHosts, recentEvents, statusCounts`)는 **그대로 유지**. `safetyPercentage`를 포함한 레거시 필드는 제거/변경하지 않았다.

| 신규 필드 | 타입 | 의미 | 범위 |
|---|---|---|---|
| `availability` | `number` | 정상 가동 호스트 비율(%). host `available`(인터페이스 가용) 스냅샷 기준 = 정상 호스트 수 / 전체 호스트 수 × 100. | 0~100. 빈 그룹(호스트 0대) → `100` |
| `healthScore` | `number` | 호스트별 최고 severity 건강값의 호스트 단위 평균. **dead host(비가용)는 0 강제**(§2.3.1). | 0~100. 빈 그룹 → `100` |

### 산식 (기획 §2.3 / §2.3.1)
- **가용성**: 호스트의 인터페이스 중 하나라도 `available === '1'`이면 가용. **인터페이스가 없는 호스트는 비가용(dead)으로 취급**(보수적). availability = 가용 호스트 수 / 전체 호스트 수 × 100.
- **건강값 매핑** (호스트별 최고 severity → 건강값):
  | 최고 severity(HostStatus) | 건강값 |
  |---|---|
  | OK(`NOT_CLASSIFIED`/`INFORMATION`, problem 없음·살아있음) | 100 |
  | `WARNING` | 70 |
  | `AVERAGE` | 40 |
  | `HIGH` | 20 |
  | `DISASTER` | 0 |
- **healthScore** = 호스트별 건강값의 평균. **dead host(가용성 비가용)는 건강값 0으로 강제**하여 가용성과 동일 방향으로 움직이게 함(모순 표시 방지). 호스트별 최고 severity는 기존 `resolveHostStatuses`(Spring) / `getHostStatuses`(Nest) 활성 problem 기준 로직 재사용.

### 응답 JSON 예시 (추가분 위주)
```json
{
  "status": "SUCCESS",
  "data": {
    "id": "12",
    "name": "Production Servers",
    "safetyPercentage": 95,
    "alerts": { "normal": 10, "warning": 3, "critical": 2 },
    "totalHosts": 20,
    "server": 10, "network": 5, "security": 2, "application": 0,
    "hardware": 1, "database": 2, "notClassified": 0,
    "recentlyViewedHosts": { "server": [ /* ... */ ] },
    "recentEvents": [ /* ... */ ],
    "statusCounts": { "WARNING": { "totalEvents": 70, "uniqueHostCount": 12 } },
    "availability": 95,
    "healthScore": 87
  }
}
```

---

## 2. Phase A — 신규 `GET /hosts/:groupid/resource-trend`

> ⚠️ **2026-06-18 변경**: 응답을 **호스트 간 집계 단일 시리즈** → **호스트별 시리즈 배열(Top N)** 로 변경.
> `type`이 metric echo → **호스트 이름**으로 바뀜. 사유: 그룹 평균은 호스트별 피크를 평탄화해 "어느 호스트가 위험한가"가 안 보임. 사용자 요청으로 호스트별 라인을 뿌리되 가독성 위해 상위 10개로 제한.

### 엔드포인트
- **메서드/경로**: `GET /hosts/:groupid/resource-trend`
- **권한**: JWT 인증 + `x-visitor-id` 헤더 필수. 역할 제한 없음.
- **응답 래퍼**: `ApiResult<GroupResourceTrendResDto[]>` — **호스트별 시리즈 배열**(개별 호스트 line-charts와 동일한 `TMonitorChart[]`).

### 요청 쿼리
| 파라미터 | 타입 | 필수 | 기본 | 설명 |
|---|---|---|---|---|
| `from` | `number`(unix epoch seconds) | ✅ | — | 조회 시작 (기존 `DateRangeFilterDto` 재사용) |
| `to` | `number`(unix epoch seconds) | ✅ | — | 조회 끝 |
| `metric` | `'cpu' \| 'memory' \| 'disk' \| 'traffic'` | ✅ | — | 집계할 리소스 |
| `agg` | `'avg' \| 'max'` | ❌ | `avg` | 호스트 내 시간당 대표값 + Top N 정렬 기준 |

### 응답 shape — **호스트별 시리즈 배열(`TMonitorChart[]`)**
```ts
// GroupResourceTrendResDto[]  (선택 agg 기준 값이 높은 상위 N(=10)개 호스트)
Array<{
  type: string,   // ← 호스트 이름 (차트 시리즈/범례 라벨). metric echo 아님!
  data: Array<{ timestamp: string /* ISO8601 */, value: number }>  // 해당 호스트 시계열, timestamp ASC
}>
```
> FE는 기존 line-charts 차트 변환 훅(`TMonitorChart[]`)을 그대로 재사용한다. `type`(호스트명)이 범례로 표시된다.

### 응답 JSON 예시
```json
{
  "status": "SUCCESS",
  "data": [
    {
      "type": "web-prod-01",
      "data": [
        { "timestamp": "2026-06-17T00:00:00Z", "value": 82.5 },
        { "timestamp": "2026-06-17T01:00:00Z", "value": 88.1 }
      ]
    },
    {
      "type": "web-prod-02",
      "data": [{ "timestamp": "2026-06-17T00:00:00Z", "value": 61.0 }]
    }
  ]
}
```

### 집계 전략 (기획 §5 데이터 소스 + 2026-06-18 호스트별 변경)
- 그룹 호스트(hostid+name) → metric item-key 매핑(`zabbix-item-key.ts` 재사용) → **`trend.get`(시간당 집계) 사용** → **호스트별** 시계열.
- **호스트 내 집계(타임버킷별 대표값)**: 트래픽은 다중 item(in/out, 다중 iface) **합산**; `agg=max`는 호스트 내 최대(`value_max`); `agg=avg`는 호스트 내 item 평균(`value_avg`).
- **호스트 간 집계는 더 이상 하지 않는다.** 대신 호스트별 시리즈를 만들고, **정렬용 호스트 대표값**(agg=max면 시계열 최대, avg면 시계열 평균) **내림차순 상위 N(=`RESOURCE_TREND_TOP_N`=10)개** 호스트만 시리즈로 반환.
- metric item-key 후보:
  - `cpu`: `system.cpu.util`, `system.hw.cpu.util`
  - `memory`: `vm.memory.utilization`, `vm.memory.size[pused]`, `system.hw.mem.pused`
  - `disk`: `vfs.fs.size[/,pused]`
  - `traffic`: `net.if.in` / `net.if.out` 중 key에 `bytes` 포함 item만.
- **해당 metric item이 없는 호스트는 자연 제외**(디바이스 타입 상이 대응).

### 엣지/성능
- 빈 그룹 / item 없음 / 기간 무데이터 → **`[]`**(빈 배열, 에러 아님).
- **Redis 캐싱**: 키 `host-group:resource-trend:{groupid}:{metric}:{agg}:{from}:{to}`, TTL **60초**. 캐시 값은 시리즈 배열.
- ⚠️ **기본 진입 기간(1시간)에서는 trend 미집계로 빈 차트가 될 수 있음**(history fallback 없음). 호스트별 변경과 무관한 별도 이슈 — `review_hostgroup-detail.md §7` 참조.

---

## 2-B. 탭③ 알림추이 — `GET /hosts/:groupid/alert-trend` (2026-06-18 신규)

- **권한**: 기존 host 컨트롤러와 동일(JWT + x-visitor-id).
- **요청**: `from`, `to` (unix epoch seconds, `DateRangeFilterDto`).
- **응답 래퍼**: `ApiResult<AlertTrendResDto>`.

```ts
// AlertTrendResDto
{
  buckets: Array<{
    timestamp: string;       // ISO8601 UTC, 버킷 시작
    notClassified: number; information: number; warning: number;
    average: number; high: number; disaster: number;   // severity 0~5 건수
  }>;
  totals: { notClassified, information, warning, average, high, disaster };  // 기간 총계
  events: Array<{            // 하단 목록용 최근 이벤트(최신순, 최대 100)
    eventid: string;         // 알림 상세 링크용(/event-alert/problem/:id)
    clock: string;           // unix epoch seconds(문자열)
    severity: number;        // 0~5
    name: string;            // 알림(트리거) 이름
    hostName: string;        // 호스트 이름(없으면 "")
  }>;
}
```

- **데이터 소스**: `event.get`(groupids, time_from/till, `object=0`(trigger), `value=1`(PROBLEM), output에 `name` + `selectHosts[hostid,name]`) = 기간 내 **생성 이벤트**를 severity·타임버킷별 카운트 + 최근 이벤트 목록.
- **버킷 크기(적응형, 2026-06-18 조정)**: ≤1일 → 1시간, 그 외(7일 등) → **1일**(선택 기간과 표시 단위 일치). `from~to` 전체 버킷을 0으로 채워 반환.
- **FE 표현**: severity별 **스택 막대**(totals>0 severity만) + **하단 알림 목록 테이블**(시각/호스트/severity/이름, 행→알림 상세 링크). 캐시 키 `host-group:alert-trend:{groupid}:{from}:{to}`, TTL 60초.
- ⚠️ **차트 x축**: 전체 구간이 1일 초과면 중간 라벨이 날짜(`MM-DD`)로 적응(`getXAxisData` 공통 개선). 리소스추이는 **상위 10개 호스트만** 표시함을 UI 툴팁으로 안내.

## 2-C. 탭④ 가용성 추이 — `GET /hosts/:groupid/health-trend` (2026-06-18 신규, 경량)

- **권한**: 동일.
- **요청**: `from`, `to` (unix epoch seconds).
- **응답 래퍼**: `ApiResult<HealthTrendResDto>`.

```ts
// HealthTrendResDto  (가용성 라인만 — 건강도 라인은 후속/보류)
{
  data: Array<{ timestamp: string /* ISO8601 */, availability: number /* % */ }>;  // timestamp ASC
  availabilityAvg: number | null;   // 기간 평균(데이터 없으면 null)
  availabilityMin: number | null;   // 기간 최저(데이터 없으면 null)
}
```

- **데이터 소스**: ping item(`icmpping`/`agent.ping`) **history.get**(host `available`은 스냅샷이라 시계열 불가). 타임버킷별로 호스트의 ping 평균이 임계값(0.5) 이상이면 "가용"으로 보고, **ping item 보유 호스트 대비 가용 호스트 비율(%)**. 데이터 있는 버킷만 포함(미수집 구간은 점 생략).
- **버킷 크기**: 알림추이와 동일 적응형.
- **엣지**: 빈 그룹 / ping item 없음 / history 없음 → `data: []`, `availabilityAvg/Min: null`.
- **FE 표현**: 가용성(%) **단일 라인** + 기간 평균/최저 요약. 캐시 키 `host-group:health-trend:{groupid}:{from}:{to}`, TTL 60초.
- ⚠️ **건강도(healthScore) 라인은 이번 범위 제외**(버킷별 활성 problem 재구성 비용 큼 — 기획 §7 B-2, 후속).

---

## 3. 에러 / 상태코드
- 정상: HTTP 200 + `ApiResult` body `status: "SUCCESS"`.
- 그룹 없음(`GET /hosts/:groupid`): `ErrorCode.HOST_NOT_FOUND` (기존 거동 그대로). resource-trend는 빈 그룹을 에러가 아닌 빈 배열로 처리.
- 신규 에러코드 추가 없음.

---

## 4. 양쪽 반영 상태 (NestJS + Spring 1:1)

| 항목 | NestJS (`moveseye-be`) | Spring (`moveseye-be-spring`) |
|---|---|---|
| `GET /hosts/:groupid` 확장 (availability/healthScore) | ✅ `HostService.getHostGroupDetail` + `HostGroupDetailDto` | ✅ `HostService.getHostGroupDetail` + `HostGroupDetailDto` |
| `GET /hosts/:groupid/resource-trend` | ✅ `HostService.getGroupResourceTrend` + 컨트롤러 | ✅ `HostService.getGroupResourceTrend` + 컨트롤러 |
| 요청 DTO | `GroupResourceTrendReqDto` | `GroupResourceTrendReqDto` |
| 응답 DTO | `GroupResourceTrendResDto` ({type,data}) | `GroupResourceTrendResDto` ({type,data}) |
| 건강값/dead-host/캐시TTL 상수 | `host/dto/constant.ts` | `HostService` private static finals |
| 단위 테스트 | `host.service.spec.ts` (19 케이스 통과) | `HostGroupMonitoringTest` (12 케이스 통과) |
| 빌드 검증 | ✅ `npm run build` 성공, `npm test` 237/237 통과 | ✅ `gradlew build -x test` 성공, 신규 test 통과 |

### 응답 shape 1:1 일치 확인
- `availability`/`healthScore`: 양쪽 `double`/`number`로 동일.
- resource-trend `type`: Spring enum 이름이 소문자(`cpu`/`memory`/`disk`/`traffic`)라 Nest 문자열과 동일하게 직렬화됨.
- `data` 원소: 양쪽 `{ timestamp: string, value: number }` (Nest `DataTimestampDto`, Spring `DataTimestampDto`).

---

## 5. 주의사항 / 미해결

1. **healthScore/availability는 `number`(소수 가능)** — 예: 95, 87.5 등. FE 표시 시 반올림/등급화는 FE 책임(기획 §4 "색/등급 병기" 권장).
2. **가용성 데이터는 KPI 헤더 = 현재값 스냅샷(host `available`)** 만 다룸. **탭④ 시계열(가용성/건강도 추이)은 이번 범위 아님**(ping history 기반, Phase B에서 별도 처리).
3. **인터페이스 없는 호스트를 dead(비가용)로 분류**하는 보수적 정책 채택. 실데이터에서 네트워크 장비 등 인터페이스 메타가 비는 케이스가 있으면 availability가 낮게 나올 수 있음 → 운영 검증 시 재조정 가능.
4. **trend.get만 사용**(history fallback 미구현). 최근 1시간 내 등 trend 미집계 구간은 데이터가 비어 보일 수 있음. 필요 시 후속에서 history fallback 추가 검토.
5. `agg`는 enum 검증(Nest `@IsEnum`). 잘못된 값은 Nest에서 validation 에러; Spring은 `fromValue`가 기본 `avg`로 폴백(관대) — 미세한 거동 차이지만 정상 사용 시 영향 없음.

---

## Phase D — Top Risk Hosts (호스트별 상태)

> 추가일: 2026-06-17 · 출처: BE 구현(be-engineer) · 기획 §5-2(top-hosts), §3 탭②.
> 그룹 안의 **각 호스트가 어떤 상태인지** 한눈에 보는 표. KPI(healthScore/availability)가 호스트 단위로 어떻게 나왔는지 드릴다운.

### D.1 엔드포인트
- **메서드/경로**: `GET /hosts/:groupid/top-hosts`
- **권한**: 기존 host 컨트롤러와 동일 (JWT 인증 + `x-visitor-id` 헤더 필수). 역할 제한 없음.
- **응답 래퍼**: `ApiResult<PaginationResponseDto<HostStatusDto>>` → `{ items: HostStatusDto[], total: number }`.

### D.2 요청 쿼리
| 파라미터 | 타입 | 필수 | 기본 | 설명 |
|---|---|---|---|---|
| `offset` | `number` | ❌ | `0` | 페이지네이션 시작 인덱스 (BasePageDto) |
| `limit` | `number` | ❌ | `10` | 페이지 크기 (BasePageDto) |
| `sortBy` | `'health' \| 'severity' \| 'alerts' \| 'name'` | ❌ | `health` | 정렬 기준 |
| `sortDirection` | `'ASC' \| 'DESC'` | ❌ | `ASC` | 정렬 방향 |

> **기본 정렬 `sortBy=health` + `sortDirection=ASC` = 건강값 오름차순** → 가장 위험한(건강값 낮은) 호스트가 위로 = "Top Risk".

### D.3 HostStatusDto (필드 타입)
```ts
{
  hostid: string,            // Zabbix host id
  name: string,              // 호스트 표시 이름
  available: boolean,        // 가용 여부. 인터페이스 중 available='1' 하나라도 있으면 true. 인터페이스 없으면 false(dead).
  status: string,            // 최고 활성 severity. 활성 problem 없으면 'OK'.
                             //   값: 'OK'|'INFORMATION'|'WARNING'|'AVERAGE'|'HIGH'|'DISASTER' (HostStatus enum 정합, OK는 추가 표기)
  healthValue: number,       // healthScore와 동일 매핑: OK/INFORMATION=100, WARNING=70, AVERAGE=40, HIGH=20, DISASTER=0.
                             //   dead(available=false)=0 강제.
  activeAlarmCount: number   // 해당 호스트의 활성 problem 수
}
```
> ⚠️ `status`는 enum이 아닌 **문자열**이다. 활성 problem이 없는 호스트는 `'OK'`(HostStatus enum에 없는 값)를 carry 하므로 FE 타입도 `'OK'`를 포함한 union으로 잡을 것.

### D.4 응답 JSON 예시
```json
{
  "status": "SUCCESS",
  "data": {
    "items": [
      { "hostid": "1010", "name": "db-prod-02", "available": false, "status": "OK", "healthValue": 0, "activeAlarmCount": 0 },
      { "hostid": "1003", "name": "web-prod-01", "available": true, "status": "DISASTER", "healthValue": 0, "activeAlarmCount": 4 },
      { "hostid": "1007", "name": "app-prod-03", "available": true, "status": "WARNING", "healthValue": 70, "activeAlarmCount": 1 },
      { "hostid": "1001", "name": "lb-prod-01", "available": true, "status": "OK", "healthValue": 100, "activeAlarmCount": 0 }
    ],
    "total": 4
  }
}
```

### D.5 정렬 규칙
- **health**(기본, ASC): `healthValue` 오름차순 → dead/위험 호스트 우선.
- **severity**: status를 순위(OK=-1 < NOT_CLASSIFIED=0 < INFORMATION=1 < WARNING=2 < AVERAGE=3 < HIGH=4 < DISASTER=5)로 환산해 정렬.
- **alerts**: `activeAlarmCount` 정렬.
- **name**: 이름 문자열 정렬.
- **동률 보조정렬(전 케이스 공통)**: `activeAlarmCount` 내림차순(위험 노출 큰 호스트 우선) — 안정적 결과 보장.
- 페이지네이션: **전체 집계 → 정렬 → slice**(getHostGroup 패턴 동일). `total`은 그룹 전체 호스트 수.

### D.6 엣지/재사용
- 빈 그룹/호스트 0 → `{ items: [], total: 0 }`(에러 아님, problem.get 호출도 생략).
- 산식은 KPI(`calculateGroupHealthKpi`)와 **동일 출처 재사용**: `isHostAvailable`, `getHostStatuses`/`resolveHostStatuses`, `HEALTH_SCORE_BY_STATUS`, `DEAD_HOST_HEALTH_SCORE`. 새 severity 매핑/가중치 상수 신설 없음.
- `activeAlarmCount`는 status 산출과 동일한 problem 집합(`problem.get recent:true` + trigger→host 매핑)에서 카운트만 별도로 센다.
- 신규 에러코드 추가 없음.

### D.7 양쪽 반영 상태 (NestJS + Spring 1:1)
| 항목 | NestJS (`moveseye-be`) | Spring (`moveseye-be-spring`) |
|---|---|---|
| `GET /hosts/:groupid/top-hosts` | ✅ `HostService.getGroupTopHosts` + 컨트롤러 | ✅ `HostService.getGroupTopHosts` + 컨트롤러 |
| 요청 DTO | `GroupTopHostsReqDto`(BasePageDto + sortBy) | `GroupTopHostsReqDto`(BasePageDto + sortBy) |
| 응답 DTO | `HostStatusDto` | `HostStatusDto` |
| 정렬 enum / status-rank 상수 | `host/dto/constant.ts` (`TopHostSortBy`, `SEVERITY_RANK`, `TOP_HOST_STATUS_OK`) | `HostService` private static finals + `TopHostSortBy` enum |
| 단위 테스트 | `host.service.spec.ts` (27 케이스, +8 Phase D) | `HostGroupMonitoringTest` (19 케이스, +7 Phase D) |
| 빌드 검증 | ✅ `npm run build` 성공, 27/27 통과 | ✅ `gradlew build -x test` 성공, 19/19 통과 |

### D.8 응답 shape 1:1 일치 확인
- `available`: 양쪽 `boolean`. Spring `boolean available` → getter `isAvailable()` → Jackson 키 `available`(정합).
- `status`: 양쪽 **문자열**(Nest 문자열 / Spring `HostStatus.name()` 또는 `'OK'`). enum 직렬화 아님.
- `healthValue`: Nest `number` / Spring `double` → 정수값(0/20/40/70/100)으로 직렬화.
- `activeAlarmCount`: 양쪽 정수.
- 페이지네이션: 양쪽 `{ items, total }`(limit/offset 미포함, 기존 PaginationResponseDto 패턴).

---

## 6. 구현 파일 경로 (참고)

### NestJS (`C:\solutions\moveseye-be`)
- `src/host/host.service.ts` — `getHostGroupDetail` 확장, `calculateGroupHealthKpi`, `isHostAvailable`, `getGroupResourceTrend`, `resourceMetricItemKeys`
- `src/host/host.controller.ts` — `GET :groupid/resource-trend`
- `src/host/dto/constant.ts` — 건강값/enum/캐시 상수
- `src/host/dto/get-hosts.dto.ts` — `HostGroupDetailDto`에 availability/healthScore
- `src/host/dto/requests/group-resource-trend.dto.ts`, `src/host/dto/responses/group-resource-trend.dto.ts`
- `src/zabbix/types/zabbix-host.type.ts` — `IZabbixHostInterface.available`
- `src/host/host.service.spec.ts` — 테스트
- **Phase D**: `src/host/host.service.ts`(`getGroupTopHosts`, `sortTopHosts`, `getHostActiveAlarmCounts`), `src/host/host.controller.ts`(`GET :groupid/top-hosts`), `src/host/dto/constant.ts`(`TopHostSortBy`/`SEVERITY_RANK`/`TOP_HOST_STATUS_OK`), `src/host/dto/requests/top-hosts.dto.ts`(`GroupTopHostsReqDto`), `src/host/dto/responses/host-status.dto.ts`(`HostStatusDto`)

### Spring (`C:\solutions\moveseye-be-spring`)
- `src/main/java/com/dmove/moveseye/host/HostService.java` — 동일 로직
- `src/main/java/com/dmove/moveseye/host/HostController.java` — 엔드포인트
- `src/main/java/com/dmove/moveseye/host/dto/HostGroupDetailDto.java` — availability/healthScore
- `src/main/java/com/dmove/moveseye/host/dto/{GroupResourceTrendReqDto,GroupResourceTrendResDto,ResourceTrendMetric,ResourceTrendAgg}.java`
- `src/test/java/com/dmove/moveseye/host/HostGroupMonitoringTest.java` — 테스트
- **Phase D**: `HostService.java`(`getGroupTopHosts`, `sortTopHosts`, `getHostActiveAlarmCounts`, `SEVERITY_RANK`/`TOP_HOST_STATUS_OK` 상수), `HostController.java`(`GET /{groupid}/top-hosts`), `dto/{TopHostSortBy,GroupTopHostsReqDto,HostStatusDto}.java`
