---
name: project-leader-team-unify
description: "RFC-204 팀장 소속 단일화(2026-09-28) — 팀장은 이끄는 팀의 구성원이라는 불변식, 겸임 없음 확정, 구현·검증 완료·커밋/배포/E2E 전"
metadata:
  node_type: memory
  type: project
  originSessionId: 48bcee85-f651-485a-af11-39631a4d7fca
  modified: 2026-09-28T06:47:42.544Z
---

RFC-204(브랜치 `RFC-204`, 2026-09-28): 소속 `users.team_key`(SQL)와 팀장 `team.leaderAccountId`(KVS) 두 원천을 **"팀장은 이끄는 팀의 구성원"** 불변식으로 단일화. 사용자 확정: **한 사람이 여러 팀 팀장인 케이스 없음**, 팀은 트리.

- 쓰기 경로에서 강제: 팀 등록/수정 → 팀장 `team_key` 자동 이동, 사용자 편집·팀원 배치/해제 → 팀장 이탈 거부(`TEAM_LEADER_CANNOT_MOVE`), 겸임도 같은 코드로 거부. 판정 함수는 `TeamLeadership.js`(순환 import 회피).
- 백필 `SEED_VERSION 11` — `onInstall` 과 `ensureSeed` **양쪽**에 호출(같은 seed_version 원장).
- 읽기 보정 코드(2026-08-05 도입, 3곳 복제) 전부 제거. `isLeader` 를 사용자 목록·상세·프로젝트 인력 응답에 추가.
- 상태: 백엔드 1774·프론트 2031 테스트, CI 빌드 통과. **커밋 완료(54d130f, RFC-204 브랜치)·배포·E2E 미수행.** 산출물 `_workspace/leader-team-unify/`.

**Why:** 두 원천 + 읽기 보정은 화면마다 복제되다 결국 빠진다(실제로 4경로 누락). 전제("겸임 없음")는 코드로 막지 않으면 데이터가 깨뜨린다(검증 에이전트가 적발).

**How to apply:** 팀·소속 관련 새 코드는 `team_key` 하나만 읽는다. 팀장 폴백을 다시 넣지 말 것. 팀장 소속을 바꾸는 새 쓰기 경로가 생기면 `assertLeadersStay` 를 통과시킨다.

관련: [[project-team-management]] · [[project-permission-audit-2026-09]]
