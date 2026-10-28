---
name: project-worklog-export
description: "Jira 전체 워크로그 CSV 추출(/worklog-export, 사이드바 최상위 A안) — 프론트 requestJira 전용·백엔드 resolver 없음, 권한키 WORKLOG_EXPORT, RFC-190, 2026-08-26 풀스택+검증+커밋 완료·배포/E2E 미수행"
metadata: 
  node_type: memory
  type: project
  originSessionId: c5dd6130-9d0b-4d83-b35d-624e6fd69e95
  modified: 2026-08-26T01:44:22.898Z
---

**Jira 전체 워크로그 CSV 추출** — 앱 미등록 프로젝트·인력까지 포함하는 **Jira 유틸리티**. 2026-08-26 구현·검증 완료, **커밋 9e2bc3f(#RFC-190, develop)**, 배포·E2E 미수행. 산출물 `_workspace/worklog-export/` (설계서·백/프론트 리포트·검증 리포트).

**메뉴 위치 결정 경위**: 자원관리 탭(RMS 인력 명부 스코프와 충돌)·백오피스(관리자 전용)를 놓고 사용자가 **사이드바 최상위 메뉴(A안)** 확정. 데이터 경계는 Jira 자체 권한(asUser)이고 앱은 메뉴/페이지 노출만 게이팅.

**핵심 결정 (설계서에 근거 기록)**:
- 백엔드 resolver 0개. `ResourceCatalog.js`에 `WORKLOG_EXPORT`(admin t / member ff / defaultForNew ff / migrateFrom 없음) + `SEED_VERSION` 9→10만. `SeedData.js`·`PermissionMap.js` 무변경 — 프리셋 `grant(entry)`가 section=WORKFORCE로 자동 판정하고, `PresetPermissionSeed.test.js`가 "Team Lead↔Member 차이는 RESOURCE_MANAGEMENT 하나"를 고정하므로 개별 분기 금지.
- ⚠ **기존 설치는 Admin만 메뉴 보임** — `migratePermissionSets()`가 프리셋에도 defaultForNew(ff) 적용하고 프리셋은 원장 때문에 재생성 안 함(의도된 동작). 릴리스 노트 필수. 신규 설치는 PM/PMO/TeamLead/TeamMember read=true.
- 수집: `search/jql`(nextPageToken) → 이슈별 `issue/{key}/worklog` → **워크로그 단위 재필터**(JQL은 이슈만 거름). 기간 비교는 `started.slice(0,10)` 문자열(`toISOString` 금지 — KST 오전이 전날로 밀림).
- `p-limit` 금지(ESM-only, 프론트 jest 미지원) → `mapWithConcurrency` 재사용. `AbortController` 금지(`requestJira.js`에 signal 경로 없음) → `cancelRef` 플래그.
- `executeRequest`는 실패 시 throw 없이 `{success:false,error}` 반환하고 Jira 원문은 `error.cause.message`에만 있음 → `pages/worklogExport/utils/jiraError.js` `unwrapJiraError`로 언랩(verifier F-1).
- 이슈 5,000건 상한 절단(`truncated`), `search/jql`엔 `total` 없어 사전 경고 불가.

**배포 후 E2E 필수**: `searchUsers`(앱 첫 사용 REQUEST_MAP 키) 실응답, iframe `<a download>`, Excel BOM, `worklogDate` 로컬 경계, 기존 설치 마이그레이션.

관련: [[feedback-codex-review]] · [[project-permission-hardening]] · [[feedback-skip-edge-cases]]
