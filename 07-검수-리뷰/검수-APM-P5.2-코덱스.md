**판정: 🔴 수정 후 재검수 권고.** BE `8df357d`·FE `be86881`을 읽기 전용으로 검수했습니다. 파일 수정·테스트 실행은 하지 않았습니다.

| 항목 | 판정(✅/🟡/🔴) | 근거(파일:행) | 수정안 |
|---|---|---|---|
| 골든 23개 ↔ 픽스처 | ✅ | 정적 대조상 값·필드 일치. `minMs/sumMs/histOverflow`, `pressure`, `dictDelta` 포함. [픽스처:148](C:/solutions/moveseyee_fe-p5/src/__tests__/fixtures/apmLiveSpansContractSample.ts:148) | 골든에 없는 아래 null·사전 변경 사례 보강 |
| `live` 타입·보존 | 🟡 | BE는 미관측 인스턴스의 `asOf:null`을 보낼 수 있지만 [FE 타입:38](C:/solutions/moveseyee_fe-p5/src/types/apmLiveSpans.ts:38)은 `number`. [머저:216](C:/solutions/moveseyee_fe-p5/src/pages/application-monitoring/realtime/liveSpans/store.ts:216)는 후속 `frame.live`를 저장하지 않음. P5.2 X-View에는 직접 영향 없지만 P5.3 연결 공백 | `asOf: number \| null`; 서비스별 live 증분 병합·삭제·freeze 구현. 세 가지 truncation/identity 플래그 타입은 반영되어 있음 |
| active·CPU·expected 산식 | ✅ | [LiveRuntimeMetrics.java:46](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/overview/live/LiveRuntimeMetrics.java:46), [LiveSpanRuntimePayload.java:29](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/overview/live/spans/LiveSpanRuntimePayload.java:29): 속성별 최신값→인스턴스 합, null/0 구별, 90초 stale 제외. expected는 최근 5분 저장 경로 관측 추정치 | 유지. 배포 인스턴스 총수로 표현하지 않을 것 |
| G1 heap 산식·부분 관측 | 🟡 | [LiveRuntimeMetrics.java:105](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/overview/live/LiveRuntimeMetrics.java:105): 제공된 G1 측정값처럼 Old Gen만 limit을 내는 경우 새 산식은 타당. 그러나 used pool 일부만 stale이면 남은 used만으로 **부분 비율을 정상 숫자로** 발행 | 전체 used 관측의 완전성을 확인하거나 부분 관측 표시. G1 개선 자체는 유지 |
| **R1. 사전 ID 재발급 후 필터 누락** | 🔴 | [store.ts:85](C:/solutions/moveseyee_fe-p5/src/pages/application-monitoring/realtime/liveSpans/store.ts:85)는 옛 ID를 계속 보존. 새 [view.ts:145](C:/solutions/moveseyee_fe-p5/src/pages/application-monitoring/realtime/liveSpans/view.ts:145)는 같은 문자열의 **첫 ID만** 선택. BE는 [사전:107](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/overview/live/spans/LiveSpanDictionary.java:107)에서 만료 후 새 ID를 부여하므로 정상 점이 필터에서 사라짐 | 필터를 일치하는 ID **집합**으로 변환. BE가 보내는 서비스별 전체 사전과 FE의 삭제 처리도 맞출 것 |
| **R2. 중복 판정 키 축소** | 🔴 | [view.ts:102](C:/solutions/moveseyee_fe-p5/src/pages/application-monitoring/realtime/liveSpans/view.ts:102): emphasis 맵 키가 `spanId`뿐. 서로 다른 trace의 동일 spanId가 덮어써져 base/emphasis 중복 제거가 실패하고 표시 수·계층이 틀림 | `(traceId, spanId)` 전체 키로 판정. 중첩 Map이면 문자열 결합 없이 가능 |
| 창 경계·솎음 결과 동등성 | 🟡 | [store.ts:37](C:/solutions/moveseyee_fe-p5/src/pages/application-monitoring/realtime/liveSpans/store.ts:37)은 `b < from`인 버킷을 삭제하여 창 안에 남은 최대 999ms의 점도 소실. [view.ts:135](C:/solutions/moveseyee_fe-p5/src/pages/application-monitoring/realtime/liveSpans/view.ts:135)도 경계 버킷 통계 제외. [view.ts:205](C:/solutions/moveseyee_fe-p5/src/pages/application-monitoring/realtime/liveSpans/view.ts:205)는 기존 전체 키 해시를 spanId 해시로 바꿔 **선택 표본·실제 keepRatio가 이전과 동일하지 않음** | 삭제 조건을 `b + 1000 <= from`으로 맞추고 통계는 겹치는 버킷 기준. 엄밀한 동등성이 필요하면 기존 해시 입력 유지 |
| WeakMap·계층·상한 | ✅ | [store.ts:60](C:/solutions/moveseyee_fe-p5/src/pages/application-monitoring/realtime/liveSpans/store.ts:60)의 불변 버킷 교체로 캐시 무효화 안전. [view.ts:193](C:/solutions/moveseyee_fe-p5/src/pages/application-monitoring/realtime/liveSpans/view.ts:193)의 강조 우선·표시 상한 유지 | R1·R2 수정 필요. stats만 바뀌어도 캐시는 재계산되지만 정확성 문제는 아님 |
| seq·revision·multipart 병합 | ✅ | [store.ts:188](C:/solutions/moveseyee_fe-p5/src/pages/application-monitoring/realtime/liveSpans/store.ts:188): 완료 seq 중복 무시, gap 재생, part 전량 수집 후 반영, 사전 버전 검사. points/stats revision 독립. BE [커서:48](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/overview/live/spans/ApmLiveSpansStreamController.java:48)의 한 단계 되감기와 기본적으로 호환 | 실제 multipart 중간 단절 검증 필요 |
| control·epoch·재시도 | 🟡 | 기본 분기는 구현됨. 다만 [훅:120](C:/solutions/moveseyee_fe-p5/src/hooks/useApmLiveSpans.ts:120)은 **머저 호출 후** 옛 epoch 프레임을 무시하므로 새 snapshot 진행 중에는 이미 버퍼가 오염됨. [훅:148](C:/solutions/moveseyee_fe-p5/src/hooks/useApmLiveSpans.ts:148)의 CLOSED 오류는 `retry()`에서도 실패 수를 올려 한 실패를 두 번 셈 | pending snapshot의 epoch/view 검사 후 버퍼링. 실패 횟수는 시도당 한 번만 증가 |
| CRC32·begin 상한·pressure | ✅ | [BE CRC:160](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/overview/live/spans/LiveSpanSnapshot.java:160)와 [FE CRC:155](C:/solutions/moveseyee_fe-p5/src/pages/application-monitoring/realtime/liveSpans/store.ts:155)는 원문 chunk JSON UTF-8 누적 방식 일치. begin 실제 바이트 제한·`liveTruncated`, pressure 구간 증분과 해제 0 발행 확인 | 실연결 검증은 별도. 골든은 UUID·CRC 정규화 및 pretty-print되므로 파일 원문을 wire CRC 검증 입력으로 사용하면 안 됨 |

**🔴 재현 방법 — 실행하지 않은 입력 시나리오**

1. **R1:** 서비스 사전에 `routeId=2 → "/orders"`를 받는다. 이후 만료·재등록된 사전 `routeId=3 → "/orders"`와 ID 3의 점을 받는다. `route=<serviceUid>:/orders` 필터를 적용하면 FE는 남아 있는 ID 2만 선택하여 ID 3의 점을 숨긴다. 기존 구현은 문자열을 직접 비교하므로 이 점을 표시했다.
2. **R2:** 같은 버킷에 base `[trace=A, span=s]`, emphasis `[A,s]`, `[B,s]`를 넣는다. emphasis 맵에는 마지막 `[B,s]`만 남아 base `[A,s]`가 제거되지 않는다. 고유 점은 2개인데 **3개를 표시**한다.

**실 BE 연결 검증 우선순위 3가지**

1. **snapshot 완료·CRC:** 한글 사전과 다중 chunk를 포함해 원문 `MessageEvent.data` CRC, 축소 재시작, `liveTruncated`를 확인한다.
2. **재접속·백프레셔:** 10분 정상 종료, multipart 중간 단절, 느린 수신자를 순서대로 확인한다. 중복 계상·part 누락 없이 복구하고 빠른 연결은 유지되어야 한다.
3. **장기 데이터 정합성:** 사전 만료·ID 재발급 후 필터, 밀리초 단위 창 경계, active 0→미관측·90초 stale, G1 pool 일부 수집 중단을 확인한다.

되묻는 질문: **없음**.
