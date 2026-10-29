---
name: fe-dmovetable-loading-spinner
description: DmoveTable에 loading prop 안 넘기면 무한 스피너 버그 — Ant Table에 spinning:undefined 전달→Ant Spin이 undefined를 true로 취급. 2026-07-22 loading=false 기본값으로 수정. 별도 쿼리 없이 prop 데이터만 쓰는 테이블(예 HostInfoTab 인터페이스표)에서 발생
metadata: 
  node_type: memory
  type: reference
  originSessionId: 6c5f188f-27ea-4a1a-aee6-b9f557b1edd0
  modified: 2026-07-22T07:42:09.592Z
---

`components/Table/DmoveTable.tsx`는 Ant `Table`에 `loading={{spinning: loading, indicator:<DSpin/>, tip}}`로 넘긴다. 부모가 `loading` prop을 **안 넘기면 `spinning: undefined`** → **Ant Spin은 spinning이 undefined면 기본 true** → 데이터가 있어도 그 위에 스피너가 영영 안 꺼진다.

- 대부분 화면은 쿼리 `isLoading`을 `loading`으로 넘겨 안 드러남. **별도 쿼리 없이 부모 prop 데이터만 렌더하는 테이블**에서 터진다(예: 2026-07-22 신규 `HostInfoTab`의 에이전트 인터페이스 표 — 데이터는 host prop, loading 미전달 → 무한 스피너로 사용자 신고).
- **수정**: DmoveTable 시그니처에서 `loading = false` 기본값(2026-07-22). 이후 loading 안 넘기는 모든 호출이 안전. 브라우저 런타임 검증에서 발견(tsc/jest/정적QA 다 통과했는데도) → 런타임 검증의 가치 사례.

관련: [[zabbix-config-drilldown-restructure]], [[device-classification-feature]]
