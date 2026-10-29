---
name: feature-guides-bundle
description: 2026-10-06 제품 전체 기능별 상세 가이드 13종 + 전 제품 문제점 리포트 — 위치·코덱스 의견·미착수 후속 작업의 재개 지점
metadata:
  node_type: memory
  type: project
  originSessionId: 3860a8ea-f039-4052-8e9c-c7e853c923bf
  modified: 2026-10-06T12:32:45.645Z
---

2026-10-06 사용자 요청("여기도 가이드 문서 작성하자, 기능별로 디테일하게 + 문제점·보완점 분석")으로 작성 → 코덱스 의견 수령 → 사용자 "일단 나중에 작업하게 잘 기록해줘". **리포트 정정·코드 수정 전부 미착수, moveseye-docs 미커밋.**

🔴 **재개 지점: `C:\solutions\_workspace\features\product-docs\product-docs\backlog_product-gap-2026-10-06.md`** — 0절 착수 전 확인 5가지 → 1절 리포트 정정 체크리스트 → 2절 작은 수정 묶음(순서 있음) → 3절 독립 작업 → 4절 결정 사항 → 5절 실측 → 6절 구조 과제 → 7절 문서 정리.

**산출물**
- 색인 `moveseye-docs\guides\features\README.md` + 영역 문서 13종(홈·공통 틀 / 인프라 모니터링 / 이벤트·알림 / 자산·비용 / 맵 / Zabbix 구성 / Zabbix 운영 / 클라우드 AWS / APM 조회 / APM 수집 / AI·MCP / 인증·권한·라이선스 / 설정·운영 기반). 문서마다 **4절이 문제점 상세**(현상·영향·보완 제안·완료 조건·근거 행). ID 접두사 HOME MON EVT AST MAP ZCF ZOP CLD APV APC AI SEC OPS.
- 종합 `moveseye-docs\overview\product-gap-report.md` — 309건(높음 28·중간 161·낮음 120, 중복 포함). 맨 위에 "정정 대기" 안내만 추가된 상태.
- 검수 요청 `_workspace\features\product-docs\product-docs\review_feature-guides-2026-10-06.md`, 코덱스 의견 `…_codex.md`.

**코덱스 의견 핵심(미반영)**
- 높음 28건: 동의 20·부분 동의 7·반대 1. 중간 표본 26건: 맞음 24·과장 1·미확인 1·틀림 0.
- APV-01은 BE `aab73fc`에서 이미 해소(문서는 `e55948c` 기준 — **작성 중에 BE가 `22eeff8`까지 움직였다**).
- 하향 5(MON-01·MON-02·AST-03·ZOP-01·APC-02), 상향 1(MAP-11 맵 물리 삭제 권한).
- "결정 필요" 8개 중 5개는 계약서·설계서·ADR에 이미 결정됨 — 실제 새 결정은 AST-03(삭제된 호스트의 자산) 하나. MAP-02·APV-03은 정책 질문이 아니라 구현 결함. SEC-01·OPS-01·02는 결함으로 먼저.
- 수정 묶음은 나눌 것: HOME-01 단독 → MON-02+05+06 → EVT-02(+별도 EVT-10/OPS-04) → MAP-01 → CLD-13+18. 독립 작업: AI-01(보안 핫픽스)·APC-01·EVT-01(둘 다 DB 마이그레이션)·AST-02(서버 내보내기 설계)·APV-02.

**Why:** 사용자가 "한 번에 처리 가능한가"를 물었고 코덱스 의견까지 받은 뒤 착수를 미뤘다. 다음 세션이 리포트 본문만 보면 낡은 분류(APV-01 미해결, 결정 필요 8개)로 일을 시작하게 된다.

**How to apply:** 관련 작업을 재개하면 백로그 0절부터 읽는다. 고치기 전에 해당 항목의 근거 행을 현재 HEAD에서 다시 연다. 당시 `COLLAB.md`는 `SOLO-CODEX`였으므로 코드 수정 전 사용자에게 코덱스 작업 상태와 티켓 번호를 확인한다. 리포트의 "영향"은 전부 정적 대조 추론이다(런타임 재현 0건).

**작성 방식(재사용):** 공통 지침 파일 1개 + 영역별 general-purpose 에이전트 13개 병렬(각 30~40분) → 링크·코드 경로·행 번호 실존 검사 스크립트 → 생략 경로 일괄 펼치기 → 높음 항목 근거 행 직접 재확인 → 종합 리포트 → 코덱스 독립 의견(`gpt-5.6-sol` high, read-only, unelevated, 약 13분). 교훈: 영역 문서에 "의도된 예외"라 적힌 것을 종합 단계에서 "결정 필요"로 뭉뚱그리지 말 것 — 결정 기록(계약서·설계서·ADR) 검색을 종합 전에 한다. 긴 작업 중에는 기준 커밋이 움직이므로 끝날 때 HEAD를 다시 본다.

관련 [[codex-review-handoff]] [[codex-model-choice]] [[scale-5000-hosts-audit]] [[commit-requires-approval]] [[no-be-restart-without-ask]]
