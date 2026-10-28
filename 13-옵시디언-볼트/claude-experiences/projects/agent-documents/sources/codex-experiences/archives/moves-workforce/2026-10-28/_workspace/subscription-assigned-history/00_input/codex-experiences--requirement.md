# 요구사항: 구독 편입 이슈 등록이력 보완

> 2026-08-11. 사용자 요청: "등록일만 기록하고 등록자에는 '구독'이라고 표시"

## 배경 (사전 조사 완료 — 사실 확정)

작업 이력 탭(프로젝트 상세 > 분석 리포트 > 작업 이력)의 등록일·등록자는 이슈 프로퍼티
`movesRms`의 `assignedAt`(date-only) / `assignedAtIso` / `assignedById`에서 읽는다.

- **수동 등록 경로만 기록**: `IssueAddModal.jsx:125` → invoke `recordIssueAssignedDate`
  → `src/resolver/projectIssue/ProjectUsersService.js:417 recordIssueAssignedDateService`.
  가드: `prev.assignedAt` 있으면 skip(최초 유지). read-merge-write로 coworkers 등 보존.
- **구독 편입 4경로는 전부 미기록** (projectId 필드 태깅만 수행):
  1. `src/queue/consumer.js` — `backfillSubscription` (백필 큐 배치)
  2. `src/resolver/projectSubscription/SubscriptionBackfill.js` — 소량(≤50건 완주) 즉시 처리
  3. `src/trigger/onIssueCreated.js` — 구독 스페이스 신규 이슈 자동 태깅
  4. `src/trigger/subscriptionReconcile.js` — 정합성 스윕(놓친 이슈 재태깅)
- 결과: 구독 편입 이슈는 작업 이력 목록에 뜨되 등록일·등록자 공란, 정렬(`movesRmsAssignedAt DESC`) 끝으로 밀림.

## 요구사항

1. 구독 경로 4곳에서 **projectId 태깅 성공 직후** movesRms 프로퍼티에 등록일을 기록한다:
   - `assignedAt`: date-only(yyyy-MM-dd), `assignedAtIso`: ISO 원본 (기존 규약 동일)
   - `assignedById`: **기록하지 않는다** (구독은 사람 등록이 아니고, 배치/트리거는 asApp 컨텍스트라 accountId 없음)
   - 구독 편입 마커를 남긴다 (예: `assignedVia: 'subscription'`) — 프론트 표시 근거
2. 프론트 작업 이력 탭 등록자 컬럼: 마커가 있으면 **"구독"** (i18n, en: "Subscription")으로 표시.
3. 가드·정책은 수동 경로와 동일:
   - 기존 `assignedAt` 있으면 skip (최초 등록 시점 유지 — 수동 등록 후 구독이 덮지 않게)
   - **best-effort 비차단**: 기록 실패가 백필/트리거 본 작업을 실패시키지 않는다 (catch + 로그)
   - read-merge-write (coworkers 등 다른 프로퍼티 필드 보존)
4. **수동 등록 경로(`recordIssueAssignedDateService`)는 무변경.** 수동 등록은 마커 없이 assignedById 기록 유지.
5. 백필은 배치당 최대 50건 × 다수 배치 — 프로퍼티 read+write가 이슈당 2콜이므로 p-limit 동시성 제한(기존 5 관례) 적용.

## 제약·주의 (프로젝트 규약)

- 프로퍼티 접근은 `src/api/jira/issue/IssuePropertyApi.js` 유틸만 사용 (인라인 접근 금지).
  쓰기는 merge 계열(다른 키 보존). 배치 컨텍스트는 'app' 모드(asApp) — recordIssueAssignedDateService:433 전례.
- 진단 로그는 백엔드 console.log 남발 금지(실패 console.error는 허용 관례).
- i18n: locales/kr/*.json + locales/en/*.json에 추가 후 `npm run merge`. ko-KR/en-US 직접 수정 금지.
- 프론트 등록자 표시 위치: `static/ui/src/pages/projectDetail/taskHistory/` (TaskHistoryTable 등록자 셀,
  현재 assignedById를 useUserInfos로 lookup하여 표시).
- 새 resolver는 만들지 않는다(백엔드 내부 헬퍼 + 기존 경로 삽입이면 충분할 것) — 만들 경우 PermissionMap 등록 필수.

## 검증 포인트 (verifier용)

- 4경로 모두 기록 호출이 들어갔는가 (한 경로만 막으면 형제 경로로 우회되는 전례 — CLAUDE.md 권한 교훈과 동형)
- 기록 실패 시 본 작업(태깅/집계/큐 재시도)이 영향받지 않는가
- 수동 등록 → 구독 재편입 시 assignedAt이 덮이지 않는가 (skip 가드)
- 프론트: 마커 있는 이슈 "구독" 표시 / assignedById 있는 이슈 기존 사용자 표시 / 둘 다 없는 이슈 공란 유지
- 루트 npm test + static/ui 빌드 통과
