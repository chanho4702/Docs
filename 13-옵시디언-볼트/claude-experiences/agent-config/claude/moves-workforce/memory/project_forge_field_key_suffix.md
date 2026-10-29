---
name: forge-field-key-suffix
description: "Forge 커스텀 필드 key 접미사는 manifest key(projectIdField)이지 표시 이름(moves_RMS_projectId)이 아니다 — 백엔드 FieldApi가 2026-08-13~09-22 사이 항상 null이라 프로젝트 삭제·구독 스윕·트리거가 전부 \"필드 없음\"으로 죽어 있었음. Forge SQL은 LIMIT ? 바인딩 불가."
metadata: 
  node_type: memory
  type: project
  originSessionId: 8ed44b1e-f015-4e17-b079-a4fe519aeff6
  modified: 2026-09-22T01:35:01.208Z
---

# Forge 필드 key 접미사 = manifest key (2026-09-22 실측)

`/rest/api/3/field` 의 Forge 필드 key 는 `{appId}__{envId|PRODUCTION}__{manifest jira:customField.key}` 다.
실제 값: `f8962f17-…__6a429133-…__projectIdField` (name 은 `moves_RMS_projectId`).

**깨져 있던 것:** `src/api/jira/field/FieldApi.js` 의 `matchOwnAppField` 가 2026-08-13(커밋 9144aa2, 고아 필드 403 대응)부터
`endsWith('__moves_RMS_projectId')` 로 **표시 이름**을 찾아 항상 null → `getProjectIdFieldIdApi('app')` 소비처 전부 실패:
프로젝트 삭제(`PROJECT_DELETION_UNLINK_FAILED: RMS project field was not found`), 구독 백필/스윕(`SubscriptionBackfill`,
`subscriptionReconcile`), `onIssueCreated`, 큐 consumer, `PortfolioAggregator` coworker. **테스트는 픽스처가 같은 가정으로
만들어져 통과했다** ([[feedback-test-fixes-wrong-assumption]] 의 실사례). 프론트 `constants/customField.js` 는 처음부터 manifest key 로 조합해 정상.

**같은 세션에서 잡은 2번째 결함:** Forge SQL(TiDB)은 `LIMIT ?` bind 파라미터를 거부한다(`SQL_EXECUTION_ERROR`).
`ProjectDeletionQuery.RETRYABLE_ISSUES` 가 그랬고, 기간 리포트 스냅샷도 같은 함정이었다. 관행: 정수 검증 후 문자열 삽입
(`ProjectSubscriptionQuery.js` 주석). `UserQuery.FIND_PAGED` 에 `LIMIT ? OFFSET ?` 가 남아 있으나 미사용.

**수정 커밋:** `86abae4`(develop, 2026-09-22) — FieldApi manifest key 매칭 + LIMIT 인라인 + unlink 판정(개별 GET·reconcileIssues) + 진행 모달. dev 실삭제 2건 검증.

**정리 안 하기로 한 것(2026-09-22, 사용자 결정):** saga 이전 레거시 삭제가 남긴 Jira 필드 잔재(dev 사이트 사라진 프로젝트 ID 7종·이슈 219건). 아직 고객에게 나간 게 없어 무시. 운영 사이트 잔재 여부는 미확인.

**How to apply:**
- 서버 오류를 화면에 못 보는 구조였다 — 삭제 진행 모달에 `lastError {stage, code, message}` 를 띄우게 해 두었다. 재현은 dev 사이트
  tom-chkim-dev(moves-rms 환경, `forge tunnel`)에서 브라우저로 삭제 눌러 확인.
- 새 Forge 필드 조회 코드는 반드시 실 `/rest/api/3/field` 응답으로 key 형태를 확인하고 픽스처를 만들 것.

관련: [[project-forge-field-key-fieldsbykeys]] · [[project-forge-env-field-duplication]] · [[project-period-report]]
