---
name: load-test-synthetic-mock-design
description: "성능 부하 테스트 설계(합성 Zabbix mock 기반) — 착수 전, 설계만 확정"
metadata: 
  node_type: memory
  type: project
  originSessionId: b5602786-e1c8-4b0a-9cba-6e465f498fb8
  modified: 2026-09-17T00:43:24.820Z
---

09-17 [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--scale-5000-hosts-audit|scale-5000-hosts-audit]]의 미실시 부하 시험을 실측으로 승격하기 위한 설계를 확정했다. 정본은 `_workspace/features/infra/scale-call-guard/devdesign_load-test-synthetic-mock.md`.

- 실 Zabbix 5,000대를 구축하는 대신 **합성 mock**(WireMock 또는 커스텀 스텁)으로 `ZabbixClient.callRaw` 레이어만 대체하고, k6로 BE REST 엔드포인트에 부하를 건다.
- 감사 항목을 시나리오로 그대로 매핑: trend.get 무제한(H1)·event.get 무제한(H2)·구성현황 스레드풀 교착(X1, 동시성만으로 재현)·네트워크맵 N+1(R6) 등.
- 판정은 성능층(p95·오류율)뿐 아니라 **정합층**(mock이 준 데이터량 대비 BE 응답 데이터량)도 봐야 한다 — R2(조용한 절단) 때문에 "빠르고 200"만으로는 통과 판정이 안 됨.
- 단계: Phase1 기준선(ZM-159 이전 재현) → Phase2 회귀(ZM-159 이후 비교) → Phase3(선택) 실 Zabbix 소규모 검증.
- 전용 DB 프로필/워크트리로 격리 필요 — dev DB 공유 충돌 전례([[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--zm-151-156-backlog-sprint|zm-151-156-backlog-sprint]]) 있음.

**Why:** 사용자가 "합성 mock으로 설계만 먼저 잡자, 지금 당장 테스트는 안 한다"고 명시(09-17). 구현·실행은 아직 착수 안 함.
**How to apply:** 다음에 부하 테스트를 실제로 시작할 때 이 설계서를 그대로 착수 기준으로 삼는다. §9 열린 결정(mock 방식, VU 단계, latency 기준값)부터 확인.
