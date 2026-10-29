---
name: work-bulk-apply
description: "작업관리 목록 일괄 적용·제외 완료(RFC-188), updateGanttSchedule은 이제 부분 업데이트 계약"
metadata: 
  node_type: memory
  type: project
  originSessionId: caaab510-0d17-4c17-9fdb-ea3ab946dde4
  modified: 2026-08-13T08:08:05.065Z
---

**RFC-188** (커밋 `7d63f4b`, 2026-08-13): 작업관리 목록 뷰에 체크박스 선택 → 시작일/기한/계획MD **일괄 적용** + **일괄 프로젝트 제외**(행별 삭제 버튼 컬럼 제거). E2E 미수행.

**⚠ 계약 변경 — `updateGanttSchedule`은 부분 업데이트다**: `undefined`(키 미포함)=미변경 / `null`=비우기 / 날짜=설정. `content`는 실제 write한 필드만(`{issueKey, start?, due?}`). start>due 검증은 둘 다 보낸 경우에만. 간트 기존 경로(드래그/모달/트리)는 항상 둘 다 보내므로 불변. 근거: 미입력 필드를 클라 캐시 값으로 채워 보내면 **stale 캐시가 타인의 변경을 되돌린다**(Codex 치명 지적) — 부분 write가 근본 해결.

핵심 사실:
- "삭제"는 Jira 이슈 삭제가 아니라 **프로젝트에서 제외**(projectId 필드 비우기) — UI 문구도 그렇게 교정됨
- 선택 범위 = 한 그룹 카드(Jira 프로젝트)의 현재 페이지(≤50) — 권한 판정 1회로 떨어지는 이유. 페이지/필터 변경 시 해제
- 실패 분류: 권한(`PERMISSION_DENIED`/숫자 `403`) 우선 → timetracking은 **400 한정 + `error.cause` 기반**(executeRequest message는 param 에코라 문자열 검사가 전부 매칭되는 함정)
- 캐시: invalidate 0, patchGroupPage + 간트 patchTask(progress 재계산). 제외 표식은 issueKey 매칭, 행 제거 금지(index 밀림)
- 동시성: `mapWithConcurrency` 3 (p-limit은 ESM-only라 프론트 금지)
- 검증 이력: 내부 verifier 2회 + Codex xhigh 리뷰 1회 + Codex 구현 위임 1회(후속 수정 4건)

잔여: [[feedback-codex-review]]의 F-1(공용 `useJiraEditGuards` timetracking 오분류 — 단건·간트 경로는 여전히 오탐) 백로그.
