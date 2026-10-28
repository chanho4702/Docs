---
name: migration-in-progress
description: moveseye-be-spring은 NestJS→Spring Boot 포팅이 진행 중이며 아직 미완료 상태
metadata: 
  node_type: memory
  type: project
  originSessionId: f17ce285-8489-4d99-9b84-bc98a232ef3e
---

moveseye-be-spring은 기존 NestJS 백엔드(`moveseye-be`)를 Spring Boot로 옮기는 **포팅 진행 중** 프로젝트다. 2026-06-10 기준 마이그레이션이 아직 다 끝나지 않았다.

**Why:** 패키지 구조가 package-by-feature와 package-by-layer가 섞여 있고 `domain/`이 거대 평면 패키지인 등 일관성 문제가 있지만, 포팅이 끝나야 최종 도메인 경계·엔티티 목록이 고정된다.

**How to apply:** 대규모 패키지 재배치나 TO-BE 구조 확정, 광범위한 리팩터링은 마이그레이션 완료 전까지 보류한다. 사용자가 진행 상태를 먼저 확인시켜줄 수 있으니 큰 구조 변경 전엔 마이그레이션 완료 여부를 확인할 것. 관련 구조 진단 내용은 대화에서 이미 정리됨.
