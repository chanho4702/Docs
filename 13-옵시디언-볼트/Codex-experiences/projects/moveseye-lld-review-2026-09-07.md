---
tags: [moveseye, zabbix, lld, review]
updated: 2026-09-07
---
# LLD 검수

공유 상세 노트: `C:\Users\DMOVE\claude-experiences\projects\moveseye\2026-09-07-lld-review.md`.
검수 보고서: `C:\solutions\_workspace\review_lld_2026-09-07.md`.

2026-09-07 사용자 결정: 수정은 보류하고 나중에 진행한다. 먼저 Claude 의견도 확인할 예정이며 아직 의견을 받지 않았다. 실제 운영 데이터 삭제/손상 여부는 미확인. 재개 시 보고서의 검토 쟁점을 확인하고 후속 작업을 정한다.

핵심: Zabbix lifetime 정책은 1=하지 않음, 2=즉시인데 FE·DTO·계약·테스트가 반대로 해석했다. 기존 BE/FE 테스트 48개는 통과했지만 실제 폼의 전송값 재현으로 확인했다. 추가 결함은 대상 전환 후 이전 설정 제출, Secret macro 빈 값 제출, HTTP headers 문자열 변형, 인터페이스 선택, 생성 필수 필드 누락, 조회 실패의 정상 0건 처리다.

구현 수정 없음. API :3000 미기동으로 실 Zabbix CRUD/E2E는 검증하지 않았다. 외부 enum 의미는 계약서끼리 대조하는 것으로 충분하지 않다.

## 2026-09-08 재개

Claude 독립 의견 확인 후 사용자 지시로 수정 재개. 다른 세션의 dirty worktree를 보호하기 위해 `C:/solutions/_workspace/lld-fix-20260908/`의 BE·FE 분리 worktree와 `codex/lld-fix-20260908` 브랜치에서만 구현한다. 원본·공유 서버·실 데이터는 미반영.

비밀 매크로는 value 생략만으로 부족하고 기존 hostmacroid를 반드시 유지해야 한다(Zabbix 7.0 CHostBase 소스 확인). 생성 시 ID는 제거한다. 인터페이스는 Agent/SNMP/IPMI/JMX 유형별로 검증하고 Simple/HTTP 등의 선택 인터페이스와 구분한다. 기존 lifetime 저장값 일괄 수정은 의도 불명이라 수행하지 않는다.

완료: BE LLD 52개, FE 고유 회귀47개·타입 검사 통과. HTTP 헤더 1건은 20초 timeout 후 60초 제한 재실행에서 통과. 격리 Chromium R2 클릭·payload 검증 통과. BE `c16714e`, FE `8817970` 커밋, 두 worktree clean. 원본 병합/push/공유 서버 반영과 실 Zabbix CRUD는 수행하지 않았다. 수정 계약 `_workspace/contract_lld-fix-20260908.md`.

후속(2026-09-07): 사용자 지시로 Orca Claude 세션에 독립 검토를 직접 요청했다(accepted). 수정은 계속 보류. 결과 작성 요청은 `_workspace/review_lld_claude_2026-09-07.md`이며 아직 의견은 미확인이다.
