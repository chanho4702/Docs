# Phase D 정적 재대조 — BE(Spring) 수정 4건 ↔ FE 소비 교차 검증

- 일자: 2026-07-01
- 대상: `moveseye-be-spring`(BE 정본) 수정본 ↔ `moveseyee_fe` 소비
- 근거: `_workspace/implementation/be_fullscan-fixes.md`, `_workspace/implementation/fe_fullscan-fixes.md`
- 방식: 정적 shape 대조(BE 미기동). 코드 수정 없음.

---

## 결과 요약

| # | 기능 | 판정 | 근거 |
|---|------|------|------|
| 1 | response-time/summary | ✅ 정합 | 배열 래핑 + 필드 경로 분리 매핑 일치 |
| 2 | session/history | ✅ 정합 | {data,type} 시리즈 + timestamp/value 일치 |
| 3 | 디스크 line-charts | ✅ 정합 | shape 불변, FE 소비 회귀 없음 |
| 4 | 인터페이스 status | ✅ 정합 | {total,up,down,adminDown} 불변, 소비 회귀 없음 |

신규 불일치: **없음**.

---

## #1 response-time/summary — ✅ 정합 (핵심 포인트)

- BE 컨트롤러 `ResponseTimeController.java:41` — `ApiResult<List<ResponseTimeSummaryResDto>>().success(List.of(result))` → `data`가 **배열 1원소**. Nest `.success([result])`와 1:1.
- BE DTO `ResponseTimeSummaryResDto.java:11-19` — `responseTime: SummaryDto{max,avg}`, `packageLoss: SummaryDto{max,avg}`.
- FE `ResponseTLDetail.tsx:38` — `if (!tlData || !Array.isArray(tlData)) return [];` 방어 가드 후 `tlData.map(...)`으로 배열 소비. ✅ 배열 shape 일치.
- FE 필드 경로 재매핑 (핵심 검증 대상):
  - `ResponseTLDetail.tsx:46-48` → `data.responseTime.avg` / `data.responseTime.max`
  - `ResponseTLDetail.tsx:53-55` → `data.packageLoss.avg` / `data.packageLoss.max`
  - BE DTO 필드명(`responseTime`/`packageLoss` + 하위 `avg`/`max`)과 **정확히 일치**. 기존의 존재하지 않는 `data.avg`/`data.max` → 분리 경로로 교정된 것 확인.
- FE 타입 `types/host-monitoring.ts:192-197` — `TResTimeMonitoring = {[key:string]:{max:number; avg:number}}` (인덱스 시그니처) → `data.responseTime`/`data.packageLoss` 모두 `{max,avg}`로 해석. BE와 정합.

## #2 session/history — ✅ 정합

- BE 컨트롤러 `SessionController.java:52-53` — `List.of(new SessionHistorySeriesDto(result, ""))` → `data`가 **[{data:[...], type:""}]** 시리즈 1원소.
- BE DTO `SessionHistorySeriesDto.java:12` — `record(List<HistoryPointDto> data, String type)`. 원소 `HistoryPointDto.java:4` — `record(String timestamp, Object value)`.
- FE `useHandelChartAction.ts:52-59` `getSeriesData` — `data.map(item => ...)`에서 `item.type`(60행), `item.data`(59행 `parseDataChart(item.data, ...)`) 참조. ✅ 시리즈 엔벨로프 소비 일치.
- FE 타입 `TDataTimestamp = {timestamp:string; value:string}` (`host-monitoring.ts:33-36`). `parseDataChart`(`utils/index.ts:459,465,469`)가 `entry.timestamp`/`entry.value`(parseFloat) 참조. BE `HistoryPointDto{timestamp,value}` 필드명 일치.
  - 참고(비차단): BE `value`는 `Object`, FE는 `string` 기대. `parseFloat`은 문자열/숫자 모두 처리되어 런타임 문제 없음. 필드명·구조는 일치.

## #3 디스크 line-charts — ✅ 정합 (회귀 없음)

- BE 변경은 dependent.size 폴백 조회 추가뿐, 응답 shape `{type,data,yAxisIndex}` 불변(be_fullscan-fixes #3).
- FE 소비 `useDiskChart.ts` → `useChartOption` → `useHandelChartAction.ts:52-79` `getSeriesData`가 `item.type`/`item.data`/`item.yAxisIndex`를 그대로 소비. 소비 코드 변경 없음 → 회귀 없음.
- 폴백은 dependent-only 호스트의 빈 데이터만 채우므로 FE는 동일 shape에 데이터만 늘어남.

## #4 인터페이스 status — ✅ 정합 (회귀 없음)

- BE shape `{total, up, down, adminDown}` 필드 불변, `total` **값 산식**만 정정(discovery 배열 길이 + adminDown 이중계수 제거).
- FE 타입 `types/interface.ts:1-6` — `TInterfaceStatus = {total, up, down, adminDown}` 불변.
- FE 소비 `InterfaceStatusChartOverview.tsx:76` — `data?.adminDown ?? "-"` 등 `total/up/down/adminDown` 직접 표시. 필드 shape 불변이라 회귀 없음(값만 정확해짐).

---

## 종합

BE 4건 수정본과 FE 소비가 **모두 정합**. 특히 #1 FE 필드 경로 재매핑(`data.responseTime.*`/`data.packageLoss.*`)이 BE `ResponseTimeSummaryResDto`와 정확히 일치함을 확인. 신규 불일치 없음. 수정 주체에 전달할 액션 없음.
