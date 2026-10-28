## 🔴 반드시 고침

- **C2 🔴 — 관측 중단 뒤에도 축이 미래로 계속 진행함**  
  `src/pages/application-monitoring/realtime/ApmLiveScatter.tsx:148`, `:169`, `:177` / **사용자 영향:** `targetEnd()`가 마지막 `projection.to`에 경과 시간을 무제한 더합니다. SSE 중단·재접속 중에도 축이 계속 진행하여 관측하지 않은 미래가 빈 구간으로 나타나고, 기존 점은 화면 밖으로 밀립니다. 이는 “관측 없음 ≠ 0” 원칙을 직접 위반하며, “데이터가 끊기면 축도 멈춘다”는 주석·커밋 설명도 사실이 아닙니다. / **수정:** 보간을 최대 한 tick까지만 허용하고 새 projection이 없으면 rAF를 멈추십시오. 예: `arrivedTo + Math.min(elapsed, LIMIT.TICK_MS)`. 새 projection에서만 다시 시작해야 합니다.

- **C2 🔴 — 축이 뒤로 가지 않는다는 보장이 실제로 없음**  
  `src/pages/application-monitoring/realtime/ApmLiveScatter.tsx:170`, `:185`, `:186` / **사용자 영향:** 재접속 후 오래된 projection, 일시정지 전환, reduced-motion 전환 등에서 `axisEnd = targetEnd()` 또는 `axisEnd = projection.to`가 현재 축보다 작은 값을 대입할 수 있습니다. 특히 위 결함으로 축이 미래까지 진행한 뒤 데이터가 돌아오면 5초 resync가 축을 뒤로 순간이동시킵니다. / **수정:** 동일 stream/window 세대에서는 `axisEnd`를 단조 증가시키고, 뒤쪽 목표에는 정지할 뿐 역방향 대입하지 마십시오. epoch·창 변경처럼 진짜 초기화가 필요한 경우에만 차트를 명시적으로 remount/reset해야 합니다.

- **C3 🔴 — hover/click 보정 기준과 dataZoom 배율이 잘못됨**  
  `src/pages/application-monitoring/realtime/ApmLiveScatter.tsx:54`, `:121`, `:155`, `:197`, `:212`, `:221` / **사용자 영향:** 색인은 `rebuildIndex()`가 실행된 당시의 현재 축 픽셀로 만들어지지만, 이후 보정은 “색인 생성 이후 이동량”이 아니라 전체 `axisEnd - projection.to`를 다시 더합니다. 렌더 직후부터 이미 중복 보정될 수 있습니다. 또한 `dataZoom` 상태에서도 전체 창 폭으로 픽셀 이동량을 계산하므로 확대 배율만큼 오차가 납니다. 화면에서 가리킨 점과 다른 요청이 hover/click될 수 있습니다. hover와 click은 같은 보정 함수를 사용하지만, 둘 다 같은 방식으로 틀립니다. / **수정:** 색인 생성 시 `indexedAxisEnd`와 실제 현재 축의 px/ms 배율을 함께 저장하고 `(axisEnd - indexedAxisEnd) × pxPerMs`만 보정하십시오. zoom·resize 때 둘을 다시 캡처해야 합니다. `brushEnd`는 ECharts가 현재 좌표계의 data 좌표를 주므로 별도 보정이 필요 없고, `dataZoom`은 색인 재생성만 필요합니다.

## 🟡 고치면 좋음

- **B 회귀 테스트의 필터 증명이 약함**  
  `src/pages/application-monitoring/realtime/__tests__/apmLiveSpansLatency.test.ts:119` / 테스트 store에 서비스가 하나뿐이라 `only1.total === all.total`은 실질적으로 필터링을 증명하지 못합니다. 두 서비스의 시각·hist·동시 요청을 다르게 넣고 `bucketAt`, 합계, 지연 구간이 모두 같은 허용 집합을 따르는 통합 테스트가 필요합니다.

- **C·D에는 시간축 회귀 테스트가 없음**  
  `src/pages/application-monitoring/realtime/ApmLiveScatter.tsx:142` / 두 커밋 모두 시간축 상태 기계를 크게 바꿨지만 테스트 파일은 추가되지 않았습니다. fake rAF/`performance.now()`로 데이터 중단, 재접속, 탭 복귀, 5↔15분, pause, reduced-motion, zoom 후 hover를 고정해야 합니다.

## ✅ 확인한 것

- **A1 ✅** `../moveseye-be-spring/.../LiveSpanRing.java:257`, `:265`, `LiveSpanFrames.java:60`, `:61` — `stats.add()`가 점 보존 여부를 판단하는 `sample()`보다 먼저 실행되고, frame 축소 시에도 stats revision은 남습니다. 카드의 “산점도는 보존 표본, hist는 수신 관문을 통과한 전량” 전제는 맞습니다.

- **A2 ✅** `src/pages/application-monitoring/realtime/liveSpans/latency.ts:48`, `:54`, `constants.ts:21` — 구간은 hist index 5/7/9/11/14, 즉 100/500/1000/5000ms 경계에 정확히 놓입니다. 보간이 없습니다.

- **A3 ✅** `src/pages/application-monitoring/realtime/liveSpans/latency.ts:101`, `:107`, `../moveseye-be-spring/.../LiveSpanStats.java:43` — `hist`만 한 번 순회하며 `histOverflow`를 더하지 않습니다. BE도 `histOverflow = hist[14]`로 보냅니다.

- **A4 ✅** `src/pages/application-monitoring/realtime/ApmLiveLatencyBands.tsx:38`, `src/lib/echarts/apmLatencyBands.ts:95` — 관측 없는 category의 모든 stacked series 값이 같은 index의 `null`입니다. 배열 자리가 유지되므로 앞뒤 category의 누적 위치가 당겨지지 않습니다.

- **A5 ✅** `src/pages/application-monitoring/realtime/liveSpans/latency.ts:140`, `active.ts:304` — 60초 창에서는 두 코드 모두 `last - floor((to-b)/1000)`을 사용합니다. 5/15분 창은 같은 식에 5초/15초 bin을 적용한 의도적 집계입니다.

- **A6 ✅ — 현재 계약 범위** `src/types/apmLiveSpans.ts:8`, `store.ts:160`, `ApmActiveTab.tsx:163` — 유효 snapshot은 300초 또는 900초뿐이므로 실제로 60초 미만은 들어오지 않습니다. 가정상 30초가 허용되면 선택 배열은 `[30]`으로 남지만 1초×60칸 때문에 실제 표시 폭은 60초가 됩니다. 향후 계약 확장 시 함께 수정해야 합니다.

- **B1 ✅** `src/pages/application-monitoring/realtime/ApmActiveTab.tsx:133`, `active.ts:258`, `latency.ts:135` — 필터 없음은 `null`, 매칭 없음은 빈 `Set`으로 유지되며 빈 집합이 전체 조회로 풀리지 않습니다.

- **B2 ✅** `src/pages/application-monitoring/realtime/liveSpans/active.ts:265`, `:327`, `latency.ts:132` — `bucketAt`, 완료 요청 집계, 동시 요청 합, 지연 차트가 모두 동일한 `allowedServiceIds`를 사용합니다.

- **B3 ✅** `src/pages/application-monitoring/realtime/ApmActiveTab.tsx:136`, `../moveseye-be-spring/.../LiveSpanSnapshot.java:98`, `:116` — 정상 프로토콜에서는 catalog 서비스의 사전이 bucket보다 먼저 전송됩니다. 사전에 없는 ID는 어떤 서비스·환경인지 판정할 근거가 없으므로 필터 시 fail-closed로 제외하는 것이 안전합니다.

- **C1 ✅** `src/pages/application-monitoring/realtime/ApmLiveScatter.tsx:102`, `:161` — `render()`는 `axisEnd`를 읽을 뿐 `projection.to`로 되돌리지 않습니다. 기존의 render/slide 상호 덮어쓰기는 제거됐습니다. 단, resync의 역방향 대입은 위 C2 결함입니다.

- **C4 ✅** `src/pages/application-monitoring/realtime/ApmLiveScatter.tsx:150`, `:164`, `:230` — 숨은 탭·pause·reduced-motion에서는 다음 frame에 루프가 종료되고, 언마운트에서는 render/hover/slide rAF를 모두 취소합니다.

- **C5 ✅** `src/pages/application-monitoring/realtime/ApmLiveScatter.tsx:151`, `src/pages/application-monitoring/realtime/ApmXViewTab.tsx:151` — `at !== null`이면 `live=false`가 전달되어 지속적인 축 이동은 멈춥니다. 다만 정지 전환 순간 축이 뒤로 스냅할 수 있는 문제는 C2에 포함됩니다.

## ❓ 판단 불가

- 없음. 파일은 수정하지 않았습니다.
