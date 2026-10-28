## 검수 결과

- [ ] 🔴 단계 승격 시 같은 요청 수가 중복 집계됨 — `pages/application-monitoring/realtime/liveSpans/inflight.ts:205`, `pages/application-monitoring/realtime/ApmLiveFlowStage.tsx:216` — `holdApmLiveTiers`가 단계별 수를 독립적으로 붙잡는다. 예를 들어 `[10,0,0]`이 1초 후 `[0,10,0]`이 되면 hold 기간에는 `[10,10,0]`으로 보여 실제 10건을 20건으로 센다. 이 값은 원판·합계까지 전달된다(`ApmLiveInFlight.tsx:45`) — raw snapshot 총량을 보존하면서 동전을 단계 간 이동시키고, hold는 신규 동전의 시각 효과에만 적용하라.

- [ ] 🔴 완료됐을 수 있는 요청을 “현재 처리 중” 합계로 표시함 — `pages/application-monitoring/realtime/ApmLiveFlowStage.tsx:351`, `pages/application-monitoring/realtime/ApmLiveInFlight.tsx:49` — 유입 공이 도착하면 실제 active snapshot과 무관하게 `landedRef`에 넣어 1.5초간 동전으로 만들고, `onDisplayTiers` 값이 공식 원판·합계까지 올라간다. 그런데 화면 문구와 도움말은 “아직 끝나지 않은 요청”, “동전 하나=현재 처리 중 요청 하나”라고 설명해 계약과 어긋난다 — 숫자·원판은 snapshot만 사용하고 synthetic/hold 동전은 별도 ghost 스타일로 표시하거나, 최소 노출·샘플링임을 명시하라.

- [ ] 🔴 숨김 탭·일시정지 복귀 시 과거 흐름을 현재 착지로 재생함 — `pages/application-monitoring/realtime/ApmLiveFlowStage.tsx:128`, `pages/application-monitoring/realtime/ApmLiveFlowStage.tsx:348`, `hooks/useApmLiveSpans.ts:200` — `IDLE_MS=0`으로 스트림은 계속 병합하지만 rAF는 브라우저에서 정지한다. 복귀하면 기존 만료 공을 모두 `now`에 착지시키고 최근 10초 흐름도 다시 spawn하여, 최대 600개 공·burst와 가짜 active 동전이 한꺼번에 생긴다. `dt` 100ms 제한은 위치 보간만 제한하며 이 경로를 막지 못한다 — `visibilitychange`/`running` 전환 때 공·burst를 폐기하고 `seenSecond`를 최신 초로 이동시켜 과거 이벤트를 재생하지 않도록 하라.

- [ ] 🔴 서비스 이름으로 ECharts tooltip HTML 주입 가능 — `lib/echarts/apmInFlight.ts:42`, `pages/application-monitoring/realtime/ApmLiveInFlightCharts.tsx:56` — 서비스 표시명이 `axisValue`로 들어간 뒤 custom formatter의 HTML 문자열에 escape 없이 삽입된다. ECharts HTML tooltip은 formatter 반환 문자열을 DOM `innerHTML`로 사용하므로 telemetry의 `service.name`에 HTML이 들어오면 실행될 수 있다 — HTML escape를 적용하거나 tooltip을 `richText` 렌더링으로 전환하라.

- [ ] 🟡 rAF 정적 비용이 20개 서비스에서 프레임 예산을 위협함 — `pages/application-monitoring/realtime/ApmLiveFlowStage.tsx:235`, `pages/application-monitoring/realtime/ApmLiveFlowStage.tsx:278`, `pages/application-monitoring/realtime/ApmLiveFlowStage.tsx:499` — 매 프레임 서비스마다 rail 10개×24분할, 배열 filter·sort, 동전별 `createLinearGradient`, 긴 이름의 반복 `measureText`를 수행한다. 정적 추정으로 20서비스×100동전이면 동전 gradient만 초당 약 12만 개, rail은 약 28.8만 `lineTo`가 된다 — 배경·rail·이름은 resize/data 변경 때 offscreen canvas에 캐시하고, 동전 sprite/gradient와 잘린 이름을 캐시하며 정렬은 구성 변경 때만 수행하라.

- [ ] 🟡 `onDisplayTiers`가 고부하에서 초당 최대 60회 React 전체 렌더를 유발함 — `pages/application-monitoring/realtime/ApmLiveFlowStage.tsx:343`, `pages/application-monitoring/realtime/ApmActiveTab.tsx:419` — “값이 바뀔 때만” 호출하지만 20서비스의 착지·만료가 프레임마다 발생하면 집계 문자열도 프레임마다 바뀐다. `setShownTiers`가 무거운 `ApmActiveTab` 전체와 차트·표를 다시 렌더한다 — synthetic count를 요약에서 분리하거나 200~500ms로 throttle하고, 무대·차트·표를 `memo` 경계로 격리하라.

- [ ] 🟡 capacity 축소와 혼합 단계 배치가 올바르지 않음 — `pages/application-monitoring/realtime/liveSpans/inflight.ts:236` — 기존 살아 있는 동전이 resize 후 새 capacity보다 많아도 `tiers` 대비 surplus가 0이면 제거되지 않는다. 새 생성은 tier 0부터 capacity를 채워 좁은 화면에서는 5초 이상 요청이 있어도 파란 동전만 보일 수 있다. 또한 0→2 직접 승격은 동일 동전 승격이 아니라 제거+신규 생성된다 — capacity 초과분을 명시적으로 퇴장시키고, critical/slow 우선 또는 비율 보존으로 슬롯을 배분하며 임의 단계 간 승격을 지원하라.

- [ ] 🟡 길이가 다른 시계열을 잘못된 초에 합산함 — `pages/application-monitoring/realtime/liveSpans/inflight.ts:101` — 전역 최대 길이를 구하면서 열 위치는 `index - shift`로만 계산한다. 같은 `endSecond`의 120칸·60칸 배열을 합치면 60칸 서비스의 최신 값이 오른쪽 끝이 아니라 60칸 앞에 놓인다 — `length - series.perSecond.length + index - shift`로 맞추고 서로 다른 길이·종료 초 조합을 테스트하라.

- [ ] 🟡 사라진 서비스의 Map 데이터가 컴포넌트 수명 동안 남고 rate도 낡을 수 있음 — `pages/application-monitoring/realtime/ApmLiveFlowStage.tsx:88`, `pages/application-monitoring/realtime/ApmLiveFlowStage.tsx:122` — `seenSecond/rates/cluster/held/landed/coins` 여섯 Map에서 현재 `stage.services`에 없는 ID를 삭제하지 않는다. 특히 제거 시점의 landed 배열·coin 배열이 계속 유지되며, `recentFlow`가 비면 이전 rate도 삭제하지 않아 과거 처리율을 표시한다 — stage 갱신마다 active ID 집합으로 모든 Map을 prune하고 관측 없는 rate는 삭제하라.

- [ ] 🟡 같은 화면의 다른 탭에서도 REST 2초 폴링이 계속될 수 있음 — `pages/application-monitoring/realtime/ApmActiveTab.tsx:219`, `hooks/useApmLive.ts:157` — query `enabled`가 `visible`을 보지 않으므로 드로어를 연 채 X-View로 이동하면 문서가 보이는 동안 계속 폴링한다. 별도로 `IDLE_MS=0`은 브라우저 숨김 중에도 SSE 연결·파싱·서버 emitter 비용을 유지하는 의도적 운영 부담이다 — REST는 `visible && open && at===null`로 제한하고, SSE 지속 정책에는 사용자별 연결 수·대역폭 관측 지표와 서버 상한을 두어라.

- [ ] 🟡 activeList 형식 오류와 REST 실패가 정상 빈 목록처럼 보임 — `pages/application-monitoring/realtime/liveSpans/inflight.ts:318`, `pages/application-monitoring/realtime/liveSpans/inflight.ts:341`, `pages/application-monitoring/realtime/ApmLiveInFlightList.tsx:39` — 스트림은 `items` 배열 여부만 검사해 null item이면 즉시 예외가 나고, REST mapper는 숫자·문자열·배열을 전혀 검증하지 않는다. REST loading/error도 연결부에서 버리며 fallback의 `asOf=0`이면 빈 목록 요약에 매우 큰 “N초 전”이 출력된다 — 수신 경계에 schema validator를 두고 유효한 행만 수용하며, loading/error/no-asOf 상태를 별도로 렌더링하라.

- [ ] 🟡 핵심 애니메이션 회귀 테스트가 사실상 없음 — `pages/application-monitoring/realtime/__tests__/ApmActiveTab.test.tsx:38`, `pages/application-monitoring/realtime/__tests__/ApmActiveTab.test.tsx:47`, `pages/application-monitoring/realtime/__tests__/apmLiveSpansInFlight.test.ts:169` — Canvas context를 항상 null로 만들고 REST 훅도 data 없음으로 고정해 rAF, 착지, callback, cleanup, polling 상태를 실행하지 않는다. 순수 함수 테스트도 단계 중복, 0→2 승격, capacity 축소·혼합 tier, 길이가 다른 시계열을 다루지 않는다 — fake rAF/Canvas/visibility 테스트와 위 경계값 테스트를 추가하라.

- [ ] 🟢 기본 수명 정리와 일부 상한은 적절함 — `pages/application-monitoring/realtime/ApmLiveFlowStage.tsx:158`, `pages/application-monitoring/realtime/ApmLiveFlowStage.tsx:425`, `hooks/useApmLiveSpans.ts:219` — 공은 600개로 제한되고, rAF 취소·ResizeObserver disconnect·visibility listener 제거·EventSource close가 구현되어 일반적인 언마운트 누수는 방지된다 — 이 구조는 유지하되 서비스별 Map prune과 복귀 시 큐 폐기를 보완하라.

### 효율성 총평

현재 무대는 정적 요소까지 60fps로 다시 만들고, 동전 변화가 React 렌더까지 전파되어 20서비스 고부하에서 여유가 작습니다.  
가장 먼저 집계 보존 오류와 숨김 복귀 replay를 고쳐야 숫자의 의미를 신뢰할 수 있습니다.  
그다음 정적 canvas 캐시, 동전 정렬/gradient 캐시, callback throttle 순으로 최적화하는 편이 효과가 큽니다.  
실측 프로파일은 없지만 정적 상한만으로도 merge 전 20서비스·최대 동전·탭 복귀 시나리오의 프레임 측정이 필요합니다.