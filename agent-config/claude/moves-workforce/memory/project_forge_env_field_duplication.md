---
name: forge-env-field-duplication
description: "한 Jira 사이트에 dev/prod 앱 공존 시 같은 이름 커스텀필드가 환경별 2벌 — asApp write는 자기 환경 필드에만, JQL 이름 매칭 모호 → \"됐다 안 됐다\" 혼선의 뿌리"
metadata: 
  node_type: memory
  type: project
  originSessionId: c8038c85-a3dd-4b89-b6e3-9bd206fcdd5c
---

Forge 앱은 **환경(dev/staging/prod)마다 자기만의 커스텀 필드를 생성**한다 (같은 name, 다른 customfield_XXXXX / key의 환경 세그먼트만 다름).

**2026-07-13 실사례**: dmove.atlassian.net에 개발 앱+프로덕션 앱 공존 → `moves_RMS_projectAssignedDate` 필드 2벌. 개발 앱으로 작업 등록 → 값은 개발 필드에만 → 프로덕션 앱 작업이력 탭(프로덕션 필드 조회)은 빈 값 = "실서버에서 등록 안 됨"으로 보임. 코드 버그 아니었음 (fieldsByKeys 수정과 별개).

확인 방법:
- `/rest/api/3/field`에서 이름 검색 → 중복 여부·각 id/key 확인 (프로덕션 canonical key는 `appId__PRODUCTION__fieldKey` 형식 — getCustomFieldId 프로덕션 분기 정확함이 검증됨)
- `/rest/api/3/issue/{key}?fields=customfield_XXXXX`로 어느 환경 필드에 값이 있는지 판정
- JQL 이름 매칭(`moves_RMS_* is not EMPTY`)은 중복 시 어느 필드인지 모호 — 증거로 쓸 때 주의

**운영 원칙**: 운영 사이트에는 단일 환경 앱만 설치 (개발/터널 테스트는 dmove-staging.atlassian.net에서). 관련: [[forge-field-key-fieldsbykeys]]

**2026-07-14 후속 판명**: "프로젝트별로 됐다 안 됐다"의 진짜 분기 = **회사 관리형 vs 팀 관리형 프로젝트 차이** (개발 환경에서도 재현, 배포/환경 무관). 증상: projectId write는 되는데 coworker/assignedDate/assignedById 는 안 됨. 정확한 기제(가드 read 실패 vs write 4xx)는 [MOVES] 추적 로그로 확정 예정 — updateCustomField 상태코드 로깅·에러 전파가 이때 추가됨.
