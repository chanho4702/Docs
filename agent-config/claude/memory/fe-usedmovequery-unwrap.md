---
name: fe-usedmovequery-unwrap
description: moveseyee_fe 응답 언랩 깊이 — axios 인터셉터 + useDmoveQuery가 합쳐 2겹을 벗겨 소비자는 payload를 직접 받는다
metadata: 
  node_type: memory
  type: reference
  originSessionId: 78534fed-b163-4025-ace0-ed7f76fff35f
---

moveseyee_fe에서 API 응답 언랩은 **두 겹**이 겹쳐 일어난다 — 이걸 한 겹으로 착각하면 `data.data`로 한 겹 더 파고들어 런타임 크래시가 난다(QA가 실제로 두 번 오진한 함정).

1. `src/services/axiosInstance.ts` 인터셉터: HTTP 응답에서 `response.data`(=ApiResult body `{status, code, data: payload, syncTime}`)를 반환.
2. `src/hooks/useDmoveQuery.ts:22-28`: 그 body를 envelope로 보고 **`envelope.data`(payload)를 한 겹 더 벗겨** 반환.

따라서 **`useDmoveQuery` 소비자가 받는 `data`는 이미 payload 그 자체**다.
- 제네릭은 관례상 `useDmoveQuery<TResponse<Payload>>`로 주지만(`TResponse<T> = T & {meta}`라 필드가 그대로 노출됨), 런타임 `data`는 payload(`Payload`)다.
- 단일객체 응답 `{type, data:[...]}`이면 소비처에서 `data.type` / `data.data`로 **바로** 접근(예: line-charts 훅, KPI 헤더의 `detail.availability`). `data.data.type`는 틀림(과다 언랩).
- 단위 테스트에서 `useDmoveQuery`를 jest.mock 할 때 mock의 `data`도 **payload 직접**(`{type, data:[...]}`)을 넣어야 한다. body 전체(`{status,...,data:{...}}`)를 넣으면 실제 언랩과 어긋나 버그를 숨긴다.

`TResponseList<T>`는 `{items, total, ...}` 형태로 payload 자체가 리스트 메타를 가진다.

🔴 **서비스를 직접 호출하면(= `useDmoveQuery` 미경유) 두 번째 언랩이 없다.** 인터셉터만 거쳐
`{status, code, data}` 봉투가 그대로 온다. 그런데 **`TResponse<T> = T & {meta}`는 훅을 거친 뒤의
모양**이라, 직접 호출에 그 타입을 붙이면 **타입 검사는 통과하고 런타임만 어긋난다** — `res.ok`가
항상 undefined가 되어 성공을 실패로 그린다(2026-08-24 클라우드 연결 테스트에서 실제로 겪음.
tsc·eslint·테스트 전부 통과했고 런타임에서만 드러났다).

**How to apply:** 직접 호출하는 mutation은 **서비스 함수가 봉투를 벗겨 payload를 반환**한다 —
`setting.api.ts`의 `unwrapSettingMutation`, `cloud-infra.ts`의 `unwrap`이 그 관례다. 반환 타입도
`Promise<TResponse<T>>`가 아니라 `Promise<T>`로 정직하게 적는다.

관련: [[hostgroup-monitoring-plan]] · [[cloud-aws-gating]].
