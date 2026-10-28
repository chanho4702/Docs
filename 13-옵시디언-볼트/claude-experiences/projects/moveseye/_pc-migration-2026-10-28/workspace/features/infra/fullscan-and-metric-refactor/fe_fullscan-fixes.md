# FE 풀스캔 결함 수정 — fe-engineer

- 작업일: 2026-07-01
- 근거: `_workspace/features/infra/fullscan-and-metric-refactor/scan_host-core.md`, `_workspace/features/infra/fullscan-and-metric-refactor/scan_runtime-verify.md`
- 범위: FE만 수정(BE Spring은 별도 에이전트 병렬 작업). 규약 준수 — 범용 포맷터(`formatBytes`/`getUnit`/`getUnitHeaderIndicator`) 전역 수정 없이 **네트워크 요약 소비 지점의 NETWORK 분기에서만** 올바른 함수 호출.

---

## #5 [Medium] 네트워크 요약 in/out 1000배 과대표시 — 수정 완료

증상: BE `network/summary`가 주는 raw bps 값을 ÷1000 없이 "Kbps"/"K" 라벨만 붙여 1000배 부풀림.
해결: 네트워크 표시 경로의 NETWORK 분기에서만 기존 `formatBitrate`(SI 1000, bps→Kbps/Mbps/Gbps) 재사용. 범용 포맷터는 미변경.

### `src/components/GrapthIndicator/GrapthIndicator.tsx` (헤더 in/out currentUsage)
- import에 `formatBitrate` 추가.
- 헤더 인디케이터 렌더에서 `type === GraphType.NETWORK`이면 `formatBitrate(Number(value))` 전체 문자열 출력. 그 외 타입은 기존 `{value}{getUnitHeaderIndicator(...)}` 유지.
- 전: `5000000.00Kbps` → 후: `5.00 Mbps`.

### `src/components/GrapthIndicator/IndicatorItem.tsx` (본문 avg/min/max)
- import에 `formatBitrate` 추가.
- 본문 렌더에서 NETWORK이면 `formatBitrate(detail.value)`(raw 숫자 → 환산 문자열), 그 외 타입은 기존 `value.toFixed(2)+getUnit(...)` 경로 유지.
- 전: `5000000.00K` → 후: `5.00 Mbps`. (idle 0 → `0.00 bps`)

주의(오탐 회피): `utils/index.ts`의 `formatBytes`/`getUnit("K")`/`getUnitHeaderIndicator("Kbps")` 및 `CpuMemoryMonitoringDetail.tsx`의 memory `formatBytes`는 **미변경**. NETWORK 분기가 두 렌더 컴포넌트에서 가드되어 CPU/MEMORY/DISK/SESSIONS/RESPONSE_TIME 표시는 영향 없음. `getUnit`/`getUnitHeaderIndicator`의 NETWORK 반환값("K"/"Kbps")은 이제 NETWORK 경로에서 도달하지 않음(범용 함수라 그대로 존치).

---

## #1 [Critical] response-time/summary 배열 소비 — 재확인 + 최소 수정

FE는 `TResponse<TResTimeMonitoring[]>`(배열) 전제로 소비. BE가 배열 복원 시 `tlData.map()` 정상 동작 확인.
추가로 FE 자체 결함(scan_host-core #1 부가, fe-engineer 배정)을 최소 수정:

### `src/pages/monitoring/network-monitoring/ResponseTLDetail.tsx`
- 방어 가드: `if (!tlData || !Array.isArray(tlData)) return [];` — BE 전환 타이밍에 단일 객체가 와도 `.map` 크래시 방지(빈 렌더).
- 필드 매핑 수정: 원소는 `{ responseTime:{max,avg}, packageLoss:{max,avg} }`(FE 타입 `TResTimeMonitoring = {[key]:{max,avg}}`, Nest `.success([result])` 근거). 기존 코드가 존재하지 않는 `data.avg`/`data.max`를 두 인디케이터에 동일 적용 → 응답시간·패킷손실이 항상 0/동일값이던 버그를 `data.responseTime.*` / `data.packageLoss.*`로 분리 교정.

---

## #2 [High] session/history 시리즈 소비 — 재확인, 코드 변경 없음

FE 소비 경로 `useSessionsChart → useChartOption → useHandelChartAction.ts:52` `getSeriesData`가
`data?.map(item => parseDataChart(item.data, ...))` + `item.type` 참조 → `[{data, type}]` 시리즈 전제 소비 확인.
BE가 `[{data,type}]`로 복원하면 정상 동작. FE 변경 불필요.

---

## 검증
- `yarn build`(tsc + vite build) **통과** (built in ~1m).
- 변경 컴포넌트 전용 jest 테스트 파일 없음. 변경한 함수(`formatBitrate`/`getUnit`/`getUnitHeaderIndicator`)는 미수정이라 기존 `utils.test.ts`/`itemUnit.test.ts` 영향 없음.

## 변경 파일
- `src/components/GrapthIndicator/GrapthIndicator.tsx`
- `src/components/GrapthIndicator/IndicatorItem.tsx`
- `src/pages/monitoring/network-monitoring/ResponseTLDetail.tsx`
