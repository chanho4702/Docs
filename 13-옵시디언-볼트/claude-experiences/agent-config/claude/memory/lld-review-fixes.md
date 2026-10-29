---
name: lld-review-fixes
description: "LLD(ZM-93) 검수 R1~R7 반영 완료 — BE 4d2a2b5·FE 커밋(미푸시), 실 Zabbix round-trip·R1 기존 값 조회 잔여"
metadata: 
  node_type: memory
  type: project
  originSessionId: 7e5c77a3-f567-401c-8464-753c8f462ada
  modified: 2026-09-08T02:03:29.833Z
---

2026-09-08 Codex LLD 검수(R1~R7, `_workspace/_archive/features/events/lld-management/review_zm-93-lld-codex.md`) + Claude 독립 검토(`features/events/lld-management/review_zm-93-lld-claude.md`, 반영 기록 포함) 후 전건 코드 반영.

- **반영**: R1 lifetime enum 반전 정정(🔴 Zabbix 7.0: **1=하지 않음, 2=즉시** — FE 상수가 반대였음, 재반전 방지 테스트 있음) · R2 규칙 전환 시 폼 즉시 초기화+상세 미로딩 저장 차단(hydratedFor ref) · R3 Secret macro 무수정 시 value 생략+**update만 hostmacroid 보존**(create는 제거 유지) · R4 headers "Name: Value" 줄↔배열 왕복 · R5 아이템 type→인터페이스 type 매핑(0→1·20→2·12→3·16→4, 없으면 LLD_PROTOTYPE_INTERFACE_MISSING fail-closed) · R6 LLD 미지원 유형 15·17 제외+유형별 필수 필드 extra 전송 · R7 상세 discovered()는 예외 전파, 목록 count만 완충.
- 검증: BE LLD 스위트+신규 3건, FE 신규 `LldRuleFormDrawer.test.tsx` 7건+기존 15건 그린. Codex 격리 재현(`_workspace/verification/lld-review-*`)은 결함 기록으로 보존 — **수정 후엔 그 파일이 실패하는 게 정상**.
- ✅ 2026-09-14 **R1 기존 저장값 조회 완료**(dev, 읽기 전용): 전체 1,797건 중 호스트 직속 1건뿐, 위험값 0건 — **오염 없음, 정정 불요**. 스크립트 scratchpad `r1_lifetime_survey.py`(DB Setting에서 URL/계정 읽음, 비밀 미출력). 🔴 잔여: 실 Zabbix round-trip 미실측(쓰기 발생) · 실서버 배포본 확인 후 같은 조회 반복 · Browser(22) 미지원 존치.
- 🔴 함정: ErrorCode enum은 APM 세션 미커밋 변경이 있어 못 건드림 → ApiError 문자열 생성자 선례 사용. 관련: [[zabbix-load-relief]]
