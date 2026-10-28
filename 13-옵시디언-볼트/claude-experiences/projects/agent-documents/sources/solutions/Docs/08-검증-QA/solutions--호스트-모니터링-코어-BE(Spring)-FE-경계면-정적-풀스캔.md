# 호스트 모니터링 코어 — BE(Spring)↔FE 경계면 정적 풀스캔

- 대상 BE: `moveseye-be-spring` (정본), 대조 참조: `moveseye-be`(Nest)
- 대상 FE: `moveseyee_fe/src/services/host-monitoring.api.ts` + types/hooks/components
- 언랩 규약(검증 완료): axios 인터셉터가 `response.data`(=ApiResult body) 1겹, `useDmoveQuery`가 `envelope.data`(=payload) 1겹 → **소비자는 payload 직접 수신**. 이 규약 기준으로 판단함.
- 판정 기준: 정합성은 **Spring 컨트롤러**. 단 Spring↔Nest 응답차로 FE가 깨질 소지는 결함으로 보고.

---

## [Critical] 1. 응답시간 요약 — Spring은 객체, FE는 배열로 `.map()` → 런타임 크래시  (CONFIRMED)

- 증상 1줄: 응답시간 상세 화면이 요약 payload에 `.map()`을 호출하는데 Spring이 배열이 아닌 객체를 반환 → `tlData.map is not a function`.
- BE(Spring): `moveseye-be-spring/.../host/responsetime/ResponseTimeController.java:33-39` — `ApiResult<ResponseTimeSummaryResDto>` 를 `.success(result)`로 반환. payload = **객체** `{responseTime:{max,avg}, packageLoss:{max,avg}}` (DTO: `ResponseTimeSummaryResDto.java`).
- BE(Nest, 참조): `moveseye-be/src/host/response-time/response-time.controller.ts:46` — `.success([result])`로 **배열 1원소**로 감쌈. (컨트롤러에서 shape 변환)
- FE 타입/호출: `host-monitoring.api.ts:228-236 getDetailHostResTL` → `TResponse<TResTimeMonitoring[]>` (배열).
- FE 소비: `pages/monitoring/network-monitoring/ResponseTLDetail.tsx:37` `tlData.map((data) => ...)`.
- 재현 시나리오: 네트워크 모니터링 > 응답시간 탭 진입 → BE를 Spring(:정본)에 연결 시 `tlData`가 객체 → `.map` 호출에서 TypeError로 컴포넌트 렌더 크래시. (현재 FE가 Nest(:3000)에 붙어있어 안 드러날 뿐, **Spring 전환 즉시 크래시**.)
- 근거: Nest 컨트롤러가 `[result]`로 배열 래핑하던 것을 Spring 포팅에서 누락(서비스는 단일 객체 반환, 컨트롤러도 그대로 통과).
- 부가 결함(FE, 별개): `.map` 성공(Nest)해도 콜백이 `data.avg`/`data.max`를 읽는데 실제 원소는 `{responseTime, packageLoss}`라 항상 `undefined`→`Number(...??0)=0`. 게다가 response_time/packet_loss 두 인디케이터가 **동일한 `data.avg/max`**로 채워짐(ResponseTLDetail.tsx:37-52). 즉 응답시간·패킷손실 요약치가 항상 0/동일값. → FE 로직 자체도 요약 shape과 불일치.

## [High] 2. 세션 히스토리 — Spring은 평면 포인트, FE 차트는 시리즈 엔벨로프 기대 → 차트 공란/오작동  (CONFIRMED)

- 증상 1줄: 세션 차트가 `[{data, type}]` 시리즈 형태를 기대하는데 Spring은 `[{timestamp, value}]` 평면 포인트 배열을 반환.
- BE(Spring): `host/network/SessionController.java:42-49` — `ApiResult<List<HistoryPointDto>>`를 `.success(result)`로 반환. payload = `[{timestamp, value}, ...]` (DTO: `HistoryPointDto` = `record(String timestamp, Object value)`).
- BE(Nest, 참조): `moveseye-be/src/host/network/session.controller.ts:77-78` — `const responseData = [{ data: result, type: '' }]; ...success(responseData)`. 즉 **컨트롤러에서 `[{data, type}]` 시리즈로 감쌈**.
- FE 타입/호출: `host-monitoring.api.ts:374-386 getChartSession` → `TResponse<TMonitorChart[]>` (=`[{data:TDataTimestamp[], type}]`).
- FE 소비: `hooks/chart/useSessionsChart.ts` → `useChartOption.ts` → `useHandelChartAction.ts:52-59` `data?.map(item => parseDataChart(item.data, timeGrid))` — 각 원소의 `item.data`/`item.type`을 참조.
- 재현 시나리오: 네트워크 세션 차트 로드 → Spring 연결 시 각 원소가 `{timestamp, value}`라 `item.data`가 undefined → `parseDataChart(undefined, ...)`로 시리즈 공란, 범례 `item.type`도 undefined. 차트가 데이터 없이 렌더(또는 parseDataChart의 null 처리에 따라 예외).
- 근거: Nest 컨트롤러가 수행하던 시리즈 래핑을 Spring 포팅에서 누락(서비스는 원시 히스토리 리스트만 반환).

## [Medium] 3. 네트워크 요약 in/out 단위 — 값은 raw bps인데 라벨은 Kbps/K (÷1000 누락) → 1000× 과대표시  (PLAUSIBLE)

- 증상 1줄: 네트워크 요약 인디케이터가 bps 원값을 그대로 표시하면서 "Kbps"/"K" 라벨을 붙여 1000배 부풀림.
- BE: `NetworkMetricSummaryDto`(currentUsage/avgUsage/maxUsage/minUsage)는 net.if.in/out = **bps 원값**(프로젝트 사실).
- FE: `utils/index.ts:895-896` in/out `currentUsage.toFixed(2)` (환산 없음) + `getUnitHeaderIndicator` `utils/index.ts:161-162` → 네트워크는 `"Kbps"` 반환. 본문 avg/min/max도 `utils/index.ts:900-902` raw + `getUnit` `:173` → `"K"`.
- 재현 시나리오: 서버 상세 > 네트워크 탭 인디케이터. 실제 5,000,000 bps → 화면 "5000000.00 Kbps"(정상 표기는 5 Mbps 또는 5000 Kbps). formatBitrate(SI 1000) 미사용.
- 근거: 프로젝트 규약(트래픽=bps, formatBitrate+UnitData.BPS 사용). 여기선 라벨만 Kbps이고 환산 로직 부재. (Nest/Spring 공통 — BE 계약 mismatch는 아니고 FE 표시 결함.)
- 참고: 요약 인디케이터 한정. line-charts 쪽 트래픽 차트 단위는 별도 확인 필요(본 스캔 범위 밖 세부).

## [Low] 4. 세션 요약 lastValue 타입 불일치 — BE String vs FE number  (CONFIRMED)

- BE: `host/network/dto/SessionSummaryDto.java:15` `private String lastValue;`.
- FE: `types/host-monitoring.ts:30` `TSessionDetail.lastValue: number`.
- 영향: 세션 인디케이터에 텍스트로 표기(sessionLastValue)라 JS 강제변환으로 표시상 문제는 경미. 산술 사용 시 주의. Low.

---

## 확인했고 정합(OK)인 항목 (오탐 방지용 기록)
- CPU 요약: Spring `.success(result)` 단일객체 ↔ Nest 동일 ↔ FE `TResponse<TCpuDetail>` 단일. 필드(currentUsage/avg/max/min/os/totalCPUs/totalCores/totalThreads) 일치. OK.
- 메모리/네트워크/응답시간/CPU **line-charts**, items/history: 모두 `List<{type, data:HistoryPoint[]}>` ↔ FE `TMonitorChart[]` 일치(HistoryPoint의 itemid/units 잉여필드는 무시). OK.
- 메모리 요약: `List<MemorySummaryDto>` ↔ `TMemoryDetail[]`, MemoryType(MEMORY/SWAP)=MemorySummaryType 일치. OK.
- 네트워크 요약 shape: `{iface, in:{itemid,currentUsage,avg/max/minUsage}, out:{...}}` ↔ `TNetworkDetail` 일치(값 단위 이슈는 #3). OK(shape).
- livecheck: `GET /hosts/{hostid}/livecheck` `HostLiveCheckResDto{hostid, ip, ping{state,rttMs?}, agent{state}, checkedAt}` ↔ `THostLiveCheck` 일치. PingState/HealthState는 `@JsonValue`로 소문자(alive/dead/unknown, available/unavailable/unknown) 직렬화 → FE union 일치. OK.
- 경로/메서드: cpu/memory/network/response-time/disk = base `/host`, 세션 = `/session`, 그룹/목록/livecheck/resource-trend/alert-trend/top-hosts/disk-current/reports = `/hosts`. FE URL과 전부 일치. OK.
- 인증: 모든 대상 컨트롤러 `@VisitorIdCheck`+`@SecurityRequirement(bearer)`, FE 인터셉터가 `Authorization: Bearer`+`x-visitor-id` 주입. OK.
- 에러 200+status: ApiResult 언랩 규약상 소비자는 payload 직접 수신, 에러 케이스는 별도(리포트 REPORT_PERIOD_NOT_CLOSED 등 정상흐름 미발생). 본 스캔 대상에서 에러 오인 소지 없음.

## 책임 주체
- #1, #2 → **be-engineer**(Spring): Nest 컨트롤러의 응답 래핑(`[result]`, `[{data,type}]`)을 Spring 컨트롤러/서비스에 재현해야 계약 1:1 보존. (또는 FE가 Spring shape에 맞추도록 합의 — 단 다른 line-charts 계약과 일관성 깨짐 유의.)
- #1 부가(FE 로직), #3, #4 → **fe-engineer**.
