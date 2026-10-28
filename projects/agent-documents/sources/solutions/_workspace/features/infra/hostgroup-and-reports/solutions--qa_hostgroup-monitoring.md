# QA — 호스트 그룹별 모니터링 Phase 0+A (정적 경계면 정합성)

> 검증자: integration-qa · 검증일: 2026-06-17 · 방식: 정적 shape 대조(앱 미기동)
> 단일 진실원천: `_workspace/features/infra/hostgroup-and-reports/contract_hostgroup-monitoring.md`
> 대조 범위: NestJS(`moveseye-be`) ↔ Spring(`moveseye-be-spring`) ↔ FE(`moveseyee_fe`)

---

## 사전 확정: FE 응답 언랩 깊이 (모든 판정의 전제)

BE 응답 HTTP body(직렬화 후):

```
{ status, code, message, data: <payload>, syncTime }   ← ApiResult 한 겹 래퍼
```

근거:
- 컨트롤러 `new ApiResult().success(data)` → `{status, code, data:<payload>}`
- `ResponseInterceptor`(`moveseye-be/src/response.interceptor.ts:25`) → `{...response, syncTime}` (래퍼 유지, 한 겹 그대로)
- `TransformInterceptor`(`moveseye-be/src/transform.interceptor.ts:23`) → `instanceToPlain` (구조 불변)

FE axios 인터셉터(`moveseyee_fe/src/services/axiosInstance.ts:60`):
```
return response.data ?? response;   ← HTTP body 한 겹만 반환, 추가 언랩 없음
```

→ **FE 훅/컴포넌트가 받는 객체 = `{status, code, message, data:<payload>, syncTime}`**
→ payload 실값은 `received.data.*` 에 있다.

---

## 체크리스트 판정

| # | 항목 | 판정 |
|---|------|------|
| 1 | `GET /hosts/:groupid` 응답 (availability/healthScore) | ✅ 일치 |
| 2 | resource-trend 요청 쿼리 (from/to seconds, metric, agg) | ✅ 일치 |
| 3 | resource-trend 응답 래퍼 깊이 (FE 언랩) | 🔴 **불일치 (버그)** |
| 4 | `data` 원소 shape `{timestamp:string, value:number}` | 🟡 경미 (Nest timestamp 타입 표기) |
| 5 | enum 문자열 (metric/agg) Nest↔Spring↔FE | ✅ 일치 |
| 6 | NestJS ↔ Spring 응답 1:1 | ✅ 일치 (Phase 0/A 범위 내) |

---

### ✅ 체크 1 — Phase 0 availability/healthScore

- BE Nest `HostGroupDetailDto` (`moveseye-be/src/host/dto/get-hosts.dto.ts:137,145`): `availability: number`, `healthScore: number`. 기존 필드(id/name/safetyPercentage/alerts/totalHosts/server/network/security/application/hardware/recentlyViewedHosts/statusCounts/recentEvents) 전부 보존.
- BE Spring `HostGroupDetailDto.java:40,46`: `double availability`, `double healthScore`. → Jackson 직렬화 시 `number`. Nest와 동일.
- FE `THostGroupMonitoringDetail` (`moveseyee_fe/src/types/host-monitoring.ts:258-261`): `availability: number`, `healthScore: number`. 기존 필드 보존.
- 소비: `HostGroupKpiHeader.tsx:57-58` `detail?.availability` / `detail?.healthScore`.

**깊이 정합 주의(중요):** `HostGroupDetail.tsx:113`은 `data?.name`을, KPI 헤더는 `detail?.availability`를 **body 루트**에서 읽는다(payload `data.data.*`가 아님). 이는 **기존 화면이 이미 채택한 깊이 패턴**이고, payload(`HostGroupDetailDto`)가 평탄 객체라 신규 필드도 기존 필드(`name`, `safetyPercentage`)와 **동일 레벨**이다. 따라서 기존 필드가 화면에 정상 표시되어 왔다면 신규 2필드도 동일하게 동작한다 → **Phase 0 신규 필드는 기존 계약을 깨지 않음 = 일치**.
(이 루트-접근 깊이의 절대적 정오는 기존 코드 동작이 진실원천이며 이번 변경 범위 밖. functional-qa가 실제 KPI 숫자 표시로 최종 확인 권장.)

---

### ✅ 체크 2 — resource-trend 요청 쿼리 (from/to = seconds)

- FE 타입 `TGroupResourceTrendParams` (`host-monitoring.ts:270-275`): `from:number, to:number, metric, agg?`.
- FE 값 생성 `useGroupResourceTrend.ts:54-55`: `from: dateRange!.from`, `to: dateRange!.to`.
- `usePeriodTimes.ts:25-29,40`: `dayjs(...).unix()` = **epoch seconds** (ms 아님). ✅
- BE Nest `GroupResourceTrendReqDto` extends `DateRangeFilterDto`(`date-filter.dto.ts:10,16`): `@Transform(moment.unix(value))` → 입력은 **seconds** 전제. ✅
- BE Spring `DateRangeFilterDto.java:18-23`: `Instant.ofEpochSecond(from)` → **seconds** 전제. ✅
- 경로/파라미터명: FE `GET hosts/{groupId}/resource-trend` + query `from/to/metric/agg` (`host-monitoring.api.ts:255`) ↔ Nest `@Get(':groupid/resource-trend')` (`host.controller.ts:232`) ↔ Spring 동일. ✅
- 라우트 순서: Nest에서 `:groupid/resource-trend`(232)가 `:groupid`(253)보다 먼저 선언 → 충돌 없음. ✅

---

### 🔴 체크 3 — resource-trend 응답 래퍼 깊이 (FE 언랩 버그)

**책임 주체: fe-engineer**

- 계약/BE 응답(payload): `GroupResourceTrendResDto = { type, data: [{timestamp, value}] }` — **단일 객체**.
- FE 훅이 받는 객체 = body = `{ status, code, data: { type, data:[...] }, syncTime }`.

`useGroupResourceTrend.ts:63-71`:
```ts
const chartData = useMemo<TMonitorChart[]>(() => {
  if (!data) return [];
  return [
    {
      type: data.type,        // ← body.type  → undefined (payload 안에 있음)
      data: data.data as ..., // ← body.data  → { type, data:[] } 객체(배열 아님)
    },
  ];
}, [data]);
```

- `data.type` = `body.type` = **undefined** (`type`은 payload = `body.data` 내부에 있음).
- `data.data` = `body.data` = `{ type, data:[] }` **객체** — `TMonitorChart["data"]`(배열)가 아님. 이후 `useHandelChartAction`의 `parseDataChart(item.data, ...)`에 배열 아닌 객체가 들어가 시리즈 생성이 깨지거나 빈 차트가 된다.

**기대값 (체크 1의 루트-접근 패턴과 동일하게 한 겹 더 들어가야 함):**
```ts
type: data.data.type,
data: data.data.data as unknown as TMonitorChart["data"],
```
즉 payload는 `data.data`이고, 그 안의 `.type` / `.data`를 꺼내야 한다.

- 출처(버그): `moveseyee_fe/src/hooks/chart/useGroupResourceTrend.ts:67-68`
- 기대: payload(`body.data`)에서 `type`/`data` 추출 → 현재: body 루트에서 추출(한 겹 부족).

> 참고(상충 정보 병기): 기존 line-charts 훅 `useChartOption.ts`는 `getDetailHostCpuCharts`의 결과를 언랩 없이 `useHandelChartAction`에 넘기지만, 그 BE 엔드포인트도 `ApiResult<...[]>`로 감싼다(`moveseye-be/src/host/cpu/cpu.controller.ts:60`). 정적 코드만으로는 line-charts 경로의 실제 런타임 언랩 위치가 명확히 드러나지 않는다(인터셉터는 한 겹만 깜). 다만 **체크 1에서 확인된 KPI 헤더의 루트-접근 패턴**(`data.name`, `detail.availability`)이 진실원천이라면, resource-trend도 동일하게 payload가 `body.data`에 있다고 보는 것이 일관적이며, 따라서 `data.data.type`/`data.data.data`가 맞다. 어느 쪽이든 **현재 `data.type`(undefined)은 명백히 틀림** — `type`이 body 루트에 존재하지 않기 때문. → fe-engineer 수정 후 재검증 필요(클로즈드 루프).

---

### 🟡 체크 4 — data 원소 shape `{timestamp, value}`

- 계약: `{ timestamp: string(ISO8601), value: number }`.
- FE `TGroupResourceTrend.data` (`host-monitoring.ts:283`): `{ timestamp: string; value: number }[]` ✅ (timestamp를 number로 오인한 곳 없음).
- BE Nest `DataTimestampDto` (`data-timestamp.dto.ts:9,14`): `timestamp: string` + `@IsDateString`, `value: number`. ✅
- BE Spring `DataTimestampDto.java:4`: `record DataTimestampDto(String timestamp, Object value)`. `value`가 `Object` 타입 — 직렬화 시 실제 담기는 값이 숫자면 JSON `number`로 나가므로 FE `number`와 호환. 단 타입 명시상 느슨함(Double 권장이나 동작 영향 없음). 🟡 경미.
- **주의(혼동 가능 — 기존 FE 타입):** `TDataTimestamp` (`host-monitoring.ts:33-36`)는 `value: string`으로 선언되어 있다. 그러나 resource-trend는 이 타입을 쓰지 않고 자체 인라인 `{timestamp:string,value:number}`을 쓰므로 직접 충돌 없음. 다만 hook이 `data.data as unknown as TMonitorChart["data"]`로 강제 캐스팅(`TMonitorChart["data"] = TDataTimestamp[]`, value:string)하므로 타입 안전성이 우회됨 — 체크 3 수정 시 함께 정리 권장.

---

### ✅ 체크 5 — enum 직렬화 (metric/agg)

- metric: Nest `ResourceTrendMetric` (`constant.ts:49-54`) = `'cpu'|'memory'|'disk'|'traffic'` (값이 소문자 문자열). Spring `ResourceTrendMetric.java` enum 상수명이 `cpu/memory/disk/traffic` 소문자 → Jackson 기본 직렬화가 enum `name()` = 소문자 그대로. FE 유니온 `'cpu'|'memory'|'disk'|'traffic'` (`host-monitoring.ts:265`). **3자 동일.** ✅
- agg: Nest `ResourceTrendAgg` = `'avg'|'max'`. Spring enum `avg/max` 소문자. FE `'avg'|'max'` (`host-monitoring.ts:267`). ✅
- 요청 echo: 응답 `type`은 요청 metric을 그대로 echo. Nest는 enum 값(소문자), Spring은 enum name(소문자) → 동일. ✅

---

### ✅ 체크 6 — NestJS ↔ Spring 1:1 (Phase 0/A 범위)

- availability/healthScore: 양쪽 `number`/`double`. ✅
- resource-trend `GroupResourceTrendResDto`: 양쪽 `{ type, data: List<DataTimestampDto> }`. ✅
- enum 직렬화: 위 체크 5대로 동일. ✅
- **거동 차이(계약 §5.5 기 문서화, 정상):** agg 잘못된 값 → Nest는 `@IsEnum` validation 에러, Spring `ResourceTrendAgg.fromValue`는 `avg`로 폴백(관대). 정상 사용(FE가 avg/max만 전송) 시 영향 없음. metric도 Spring `fromValue`는 잘못된 값에 `cpu` 폴백. 🟢 정상 사용 영향 없음.

---

## 결론

- **체크 1,2,5,6: 정적 경계면 통과.**
- **체크 3: 🔴 FE 래퍼 깊이 버그 1건** — `useGroupResourceTrend.ts:67-68`이 payload를 한 겹 덜 까서 `type`이 undefined, `data`가 배열 아닌 객체가 된다. → **fe-engineer 수정 필요** (`data.data.type` / `data.data.data`).
- **체크 4: 🟡 경미** — Spring `DataTimestampDto.value` 가 `Object`(런타임 number라 호환), FE 캐스팅 우회. 체크 3 수정 시 함께 정리 권장.

체크 3 수정 후 재검증하여 클로즈드 루프 완료 예정.

---

## functional-qa 인계 포인트 (런타임 확인 권장)

1. **체크 3 수정 전/후 차트 렌더:** 수정 전엔 resource-trend 차트가 빈 시리즈/깨짐으로 나와야 함(가설 검증). 수정 후 실제 시계열 라인이 그려지는지.
2. **trend 실데이터 유무:** 계약 §5.4 — `trend.get`만 사용(history fallback 없음). 최근 1시간 등 trend 미집계 구간은 `data:[]`로 빈 차트일 수 있음. 빈 차트가 버그인지 데이터 부재인지 구분.
3. **dead host availability 거동:** 인터페이스 없는 호스트를 dead(비가용) 처리(계약 §주의 3). 실 Zabbix에서 네트워크 장비 등 인터페이스 메타 결손 시 availability가 비정상적으로 낮게 나오는지.
4. **KPI 루트-접근 깊이 실증:** 체크 1에서 정적으로는 "기존 패턴 일치"로 판정했으나, 실제 KPI 헤더에 availability/healthScore 숫자가 정상 표시되는지(0%로만 떨어지지 않는지) 런타임 확인.
5. **metric/agg 토글:** Segmented 토글 시 쿼리키 변동으로 재요청되고 차트가 갱신되는지(`HostGroupResourceTrend.tsx`).
6. **빈 그룹:** 호스트 0대 그룹 → availability/healthScore = 100, resource-trend `data:[]` 거동.

---

# 재검증 (클로즈드 루프 #1) — 체크3 수정 정합성 (앱 미기동, 정적)

> 재검증자: integration-qa · 재검증일: 2026-06-17 · 방식: 정적 shape 대조(앱 미기동)
> 대상: fe-engineer가 체크3 수정 후의 `useGroupResourceTrend.ts` / `host-monitoring.api.ts` / `useGroupResourceTrend.test.tsx`

## ⚠️ 선행 정정: 이전 체크3 진단의 전제 오류 (`useDmoveQuery` 언랩 한 겹 누락)

이전 진단(line 74, 102)은 **훅이 받는 `data` = HTTP body 전체**(`{status, code, data:payload, syncTime}`)라고 전제했다. 그러나 이는 `useDmoveQuery`의 추가 언랩을 빠뜨린 전제였다.

`useDmoveQuery.ts:22-27`:
```ts
const envelope = queryResponse.data as unknown as DmoveApiEnvelope<TData>;
return { ...queryResponse, data: envelope?.data as TData, syncTime: Number(envelope?.syncTime) };
```
- `queryResponse.data` = axios가 벗긴 HTTP body = `{status, code, data:payload, syncTime}`.
- `useDmoveQuery`가 **여기서 `.data`를 한 겹 더 벗겨** payload만 반환한다.

→ **`useDmoveQuery`를 통과한 `data`는 언제나 payload(body의 `.data`)다.** (KPI 헤더가 `detail.availability`로 "루트 접근"해도 정상인 이유 = `data`가 이미 `THostGroupMonitoringDetail` payload이기 때문. line 52의 "루트-접근 패턴"은 결과적으로 맞지만 메커니즘 설명이 부정확했음.)

정답 깊이 재정의:
- 실제 언랩 체인: HTTP body `{status,...,data:{type,data:[...]},...}` → axios 인터셉터(`.data`) → `useDmoveQuery`(`.data` 한 겹 더) → **훅의 `data` = `{type, data:[...]}` = payload 그 자체**.
- 따라서 차트가 꺼내야 할 값: `data.type` / `data.data` (**payload 자체에서 한 겹**, 추가 `.data` 불필요).

레퍼런스 일치: `useChartOption.ts:38-57`은 line-charts(`ApiResult<TMonitorChart[]>`)를 `useDmoveQuery`로 받아 **언랩 없이** `useHandelChartAction`에 넘긴다. 같은 메커니즘(`useDmoveQuery`가 payload를 이미 깠음). resource-trend도 동일해야 한다.

## 🔴 재검증 결과: 체크3 미해소 — 방향만 뒤집힌 **과다 언랩 회귀**

**책임 주체: fe-engineer**

수정본 `useGroupResourceTrend.ts:68-80`:
```ts
const payload = data?.data;          // ← 한 겹 과다. data가 이미 payload이므로 이건 timestamp 배열
if (!payload) return [];
return [{
  type: payload.type,                // ← (배열).type = undefined
  data: payload.data.map((point) => ...),  // ← (배열).data = undefined → undefined.map() TypeError
}];
```

제네릭도 어긋남 — `useGroupResourceTrend.ts:40-42`: `useDmoveQuery<TResponse<{ data: TGroupResourceTrend }>>`. 이는 body의 `.data`가 `{ data: TGroupResourceTrend }`(중첩)라고 선언하나, 실제 body의 `.data` = `TGroupResourceTrend`(`{type, data}`) **자체**다. 한 겹 과다 중첩.

런타임 추적(실 `useDmoveQuery` 경유, mock 아님):
| 시점 | `data` 값 |
|---|---|
| 훅의 `data` (line 69 입력) | `{ type:"cpu", data:[{timestamp,value}] }` (payload) |
| `data?.data` (line 69) | `[{timestamp,value}]` (timestamp 배열) |
| `payload.type` (line 73) | `undefined` |
| `payload.data` (line 74) | `undefined` → **`.map()` 호출 시 TypeError 크래시** |

→ 비빈 데이터: TypeError로 차트 크래시. 빈 데이터(`data:[]`): `payload=[]`(truthy) → line 74 `[].data`=undefined → `.map` 동일 크래시. **두 경우 모두 깨짐.**

- 출처(버그): `moveseyee_fe/src/hooks/chart/useGroupResourceTrend.ts:40-42`(제네릭), `:69`(`data?.data`), `:73-74`(`payload.type`/`payload.data`).
- 기대(수정안):
  ```ts
  // 제네릭
  const { data, isLoading } = useDmoveQuery<TGroupResourceTrend>({ ... });
  // useMemo
  const payload = data;                 // data가 이미 {type, data} payload
  if (!payload?.data) return [];
  return [{
    type: payload.type,
    data: payload.data.map((point) => ({ timestamp: point.timestamp, value: String(point.value) })),
  }];
  ```
- 실제: payload를 `data.data`로 잡아 한 겹 과다 → `type` undefined, `data.map` 크래시.

> 정리: 이전 버그는 `data.type`(언랩 부족, 1단계), 정답은 `data.type`(payload 직접, **정답이 우연히 이전 "틀림" 표기와 형태가 같음**), 현재 수정본은 `data.data.type`(언랩 과다, 1단계 반대 방향). 즉 **정답을 통과해 반대편으로 한 칸 더 갔다.** 근본 원인은 두 진단 모두 `useDmoveQuery`의 자체 언랩 한 겹을 계산에 넣지 않은 것.

## 체크2'(api 반환 타입) — 🔴 훅 제네릭과는 일치하나, 둘 다 동일하게 틀림

`host-monitoring.api.ts:250-261` `getGroupResourceTrend` 반환 `Promise<TResponse<{ data: TGroupResourceTrend }>>`. 훅 제네릭(`TResponse<{ data: TGroupResourceTrend }>`)과 **표기상 일치**하지만, 둘 다 실제 body의 `.data` 모양(`TGroupResourceTrend`)보다 한 겹 과다 중첩(`{ data: ... }`)이다.
- 정답: `Promise<TResponse<TGroupResourceTrend>>` (다른 line-charts api가 `TResponse<TMonitorChart[]>`로 payload 모양을 그대로 쓰는 것과 동일 규약).
- 출처: `moveseyee_fe/src/services/host-monitoring.api.ts:256`. 책임: fe-engineer.

## 체크3'(테스트 mock 깊이) — 🔴 회귀를 숨기는 함정 잔존 (mock이 `useDmoveQuery` 언랩을 우회)

`useGroupResourceTrend.test.tsx:33-36`이 `useDmoveQuery` **전체를 모킹**하고, `:86-97`에서 훅에 **HTTP body 전체**(`{status, code, data:{type,data:[...]}, syncTime}`)를 주입한다.

문제: 실제 코드 경로에서 `useDmoveQuery`는 body의 `.data`를 벗겨 payload만 훅에 준다. 그러나 테스트는 `useDmoveQuery`를 모킹해 그 언랩을 우회하고 body 전체를 주입하므로, 훅 내부 `data.data`가 mock 기준으로는 payload가 되어 **테스트는 green이지만 실런타임과 한 겹 어긋난다.** 이전에 얕은 mock이 부족-언랩 버그를 숨겼던 것과 동일한 함정이, 이번엔 깊은 mock이 과다-언랩 버그를 숨기는 형태로 **방향만 바뀐 채 잔존**.

- 교정 방향(둘 중 하나):
  1. (권장) 훅 코드를 정답(`data` = payload)으로 고친 뒤, mock도 **payload만** 주입: `dmoveQueryMock.mockReturnValue({ data: { type:"cpu", data:[{timestamp,value}] }, isLoading:false })`. = 실제 `useDmoveQuery` 반환과 동일 깊이.
  2. `useDmoveQuery`를 모킹하지 않고 실물을 태운 뒤 axios/서비스 레벨에서 body 전체를 mock → 실 언랩 경로까지 검증(통합도 ↑).
- 출처: `moveseyee_fe/src/__tests__/useGroupResourceTrend.test.tsx:86-97`(및 `:114-122` 빈데이터 케이스 동일). 책임: fe-engineer.

## 체크4 후속 — value 정규화 자체는 OK, 단 위 버그로 도달 불가

`String(point.value)` 정규화 의도(line 76)는 차트가 string을 기대하는 점과 부합(개선). 다만 `payload.data`가 undefined라 `.map`에 도달하지 못한다. 체크3' 수정으로 깊이를 바로잡으면 이 정규화는 그대로 유효.

## 재검증 결론

- **체크3: 🔴 미해소.** 수정이 언랩을 한 겹 **과다**로 바꿔(이전엔 부족) 여전히 실런타임 크래시(`undefined.map` TypeError). 정답은 `data`(=payload) 직접 접근 = `data.type`/`data.data`, 제네릭은 `TGroupResourceTrend`.
- **체크2'/체크3': 🔴 api 반환 타입·테스트 mock 깊이 모두 동일 오류 동반.** 셋(훅 제네릭+useMemo / api 타입 / test mock)을 **한 겹씩 얕게** 일괄 정정해야 정합.
- **근본 원인:** `useDmoveQuery`가 자체적으로 `.data`를 한 겹 더 벗긴다는 사실(KPI 헤더·line-charts 훅이 의존하는 그 동작)을 양쪽 진단·수정이 누락. → fe-engineer에게 위 3파일 일괄 교정 요청, 재수정 후 재검증(클로즈드 루프 #2) 필요.
- **정적 경계면: 미통과.** 잔여 🔴 1건(상호 연동된 3파일).

---

## 클로즈드 루프 #2 — 오케스트레이터 최종 검증 (2026-06-17)

> 검증자: 오케스트레이터(1차 사실 직접 확인) · 방식: 소스 대조 + 빌드 + 단위테스트 실행

**결론: 정적 경계면 통과 (체크3 해소).**

### 핵심 사실 확정 (`src/hooks/useDmoveQuery.ts:22-28` 직접 확인)
언랩은 **2겹**이다: ①axios 인터셉터가 ApiResult body 반환 → ②`useDmoveQuery`가 `envelope.data`(payload)를 한 겹 더 벗겨 반환. 따라서 **소비자의 `data`는 이미 payload `{type, data}`** 다.
- ⇒ 올바른 접근은 `data.type` / `data.data` (= fe-engineer **최초 구현**이 정답이었음).
- 클로즈드 루프 #1의 진단(`data.data.type`)은 ②단계(useDmoveQuery의 추가 언랩)를 누락한 **오진**이었고, 그에 따른 수정이 과다 언랩 회귀를 만들었음.

### 적용한 정정 (3파일, 첫 구현 깊이로 환원)
- `src/hooks/chart/useGroupResourceTrend.ts` — 제네릭 `TResponse<TGroupResourceTrend>`, `const payload = data`(추가 언랩 제거), 주석을 2겹 언랩 사실로 교정.
- `src/services/host-monitoring.api.ts` — `getGroupResourceTrend` 반환타입 `Promise<TResponse<TGroupResourceTrend>>`.
- `src/__tests__/useGroupResourceTrend.test.tsx` — `useDmoveQuery` mock의 `data`를 **payload 직접**(`{type, data:[...]}`)으로 환원(body 전체 주입은 실제 언랩과 어긋나 버그 은폐).

### 검증 결과
- `npm run build`(tsc+vite): **성공** (4570 modules, 타입에러 0).
- jest(`useGroupResourceTrend`·`HostGroupResourceTrend`·`HostGroupKpiHeader`): **3 suites / 16 tests 통과**.

### 잔여 (functional-qa 인계 — 런타임)
앱 실기동 검증은 별도(BE 인프라 DB/Redis/Zabbix 의존). 클로즈드 루프 #1 보고의 런타임 확인 포인트(실 trend 데이터 유무, dead host availability 거동, metric/agg 토글 재요청, 빈 그룹) 유효.

### 교훈
`useDmoveQuery` 이중 언랩은 비자명 → reference 메모리 `fe-usedmovequery-unwrap` 기록. 향후 이 훅 소비처 검증 시 payload 직접 수신 전제로 볼 것.
