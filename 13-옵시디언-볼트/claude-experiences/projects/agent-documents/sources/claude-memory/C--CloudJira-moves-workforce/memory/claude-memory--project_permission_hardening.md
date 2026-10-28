---
name: permission-hardening
description: 권한관리 고도화 — 서버사이드 가드(110키 매핑)·fail-close·리소스 카탈로그 14키·projectScope(소속 프로젝트 제한) 풀스택 구현+검증 완료 (2026-07-03)
metadata: 
  node_type: memory
  type: project
  originSessionId: 92c32245-71d7-4023-9ef5-105d68fe70ee
---

권한관리 고도화 4범위 구현 완료(2026-07-03, feature-harness 파이프라인): ①`guardedDefine` 서버 가드(PermissionMap 110키, deny-by-default+계약 테스트) ②프론트 fail-close(canRead/canWrite 시그니처 유지, 27개 호출부 무수정) ③`src/permission/ResourceCatalog.js` 단일 소스 14키(WORKLOG 제거, PROJECT_GANTT·PROJECT_COST 추가, SEED_VERSION 5→6 멱등 마이그레이션) ④권한 세트별 `projectScope:'ALL'|'MEMBER_ONLY'`(소속=projectusers 등록, detail=가드 검증/list=쿼리 IN 필터, admin 항상 ALL).

**사용자 확정 정책:** 비용 탭 시드 Member 숨김 / MEMBER_ONLY는 read·write 공통(소속 프로젝트만 수정) / 포트폴리오는 소속 집계 축소(전면 차단 아님) / 소속 정의는 인력 등록 기준(담당자 확장은 로드맵). 키 분리 기준 3가지(민감도·사용자군·write 의미) — 페이지 1:1 매핑은 하지 않기로 확정.

**후속(2026-07-06):** 시드 세트 scope 토글 완화 — Member 등 edit:false 세트는 `updatePermissionScope`(신규 resolver, `{id, projectScope}`)로 scope만 변경 가능, Admin은 항상 ALL 거부(`PERMISSION_SCOPE_ADMIN_IMMUTABLE`). 시드 재생성 시 Member scope 보존. `updatePermission`은 edit:false 세트 거부(`PERMISSION_SEED_IMMUTABLE`) — direct-invoke 시드 오염 봉쇄.

**상태:** 백엔드 165·프론트 58 테스트, 빌드, verifier 최종 통과 9/실패 0/미검증 1(런타임 E2E — 배포+실사용자 필요). 커밋 전. myWork/mySchedule의 payload.accountId 신뢰 구멍도 context.accountId 강제로 봉쇄됨. 산출물: `_workspace/permission-hardening/`. 관련: [[kvs-entity-manifest-schema]]
