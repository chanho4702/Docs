---
title: RFC-204 팀장 소속 단일화
date: 2026-09-28
project: "[[moves-workforce]]"
tags: [team, data-model, invariant, harness]
status: 커밋 완료(54d130f), 배포·E2E 전
---

# RFC-204 팀장 소속 단일화 — "팀장은 이끄는 팀의 구성원"

## 증상
백오피스 인력 관리 목록에서 팀장의 팀이 `-`, 팀장 배지 없음. 프로젝트 인력 탭·분석 리포트(인력/팀)·프로젝트 대시보드 팀별 인원에서도 팀장이 "팀 미지정".

## 원인
소속은 SQL `users.team_key`, 팀장은 KVS `team.leaderAccountId` — **원천이 둘**. 2026-08-05에 "소속이 비면 이끄는 팀으로 채운다" 보정을 넣었지만 **화면마다 복제**(ResourceManagementService·ProjectCalendarService·TeamRepository 3곳)돼 있어 4개 경로가 빠졌다.

## 결정 (사용자)
겸임(한 사람이 여러 팀 팀장) 없음, 팀은 트리. → **원천 단일화(2안)** 채택. 보정 코드(1안 공용화)는 기각.

## 구현
- 쓰기 경로 강제: `addTeam`/`updateTeam` → 팀장 `team_key` 이동(`updateTeam`은 변경 여부와 무관하게 항상 이동 → KVS 저장 뒤 SQL 실패 재시도 복구). `updateUser`/`assignUsersToTeam`/`unassignUsersFromTeam` → 팀장 이탈 거부 `TEAM_LEADER_CANNOT_MOVE`. 겸임 금지도 같은 판정(`assertLeadersStay`, `TeamLeadership.js`).
- 백필: `SEED_VERSION 11`, `backfillLeaderTeamMembership` — **onInstall 과 ensureSeed 양쪽**에 호출(같은 seed_version 원장을 쓰므로 한쪽만 넣으면 영영 건너뜀).
- 읽기 보정 코드 전부 제거, `isLeader` 3 resolver 응답 추가, 프론트 배지(`team.myTeam.leadBadge` 재사용)·모달 안내·에러 매핑.

## 교훈
- **두 원천 + 읽기 보정은 결국 빠진다.** 보정은 화면 수만큼 복제되고 새 화면에서 또 빠진다. 불변식은 쓰기 경로에서 강제하고 읽기는 한 원천만 본다.
- **"겸임 없음"이 전제라면 코드로 막아라.** 백엔드 에이전트는 전제라며 검사를 생략했고 검증 에이전트가 잡았다 — 전제는 강제 코드가 없으면 데이터가 언젠가 깨뜨린다.
- 판정 함수를 `TeamService`에 두면 `UserService`와 순환 import → 역참조 정리 모듈(`TeamLeadership.js`)에 둔다.
- 하네스: 리더가 원인 분석을 끝낸 상태라 architect 단계는 생략하고 설계서를 직접 썼다(backend→frontend→verifier 3단). 검증 실패 1건은 리더가 직접 수정(작은 변경은 에이전트 재호출보다 빠름).

## Codex 리뷰
- 반영: addTeam KVS→SQL 실패 시 **보상 삭제**(안 하면 이름 중복 검사에 막혀 재시도 불가), 백필 겸임은 첫 팀만.
- 보류: 동시 요청 TOCTOU(Forge 잠금 없음, 평범한 사용에서 안 만남).

## 남은 것
`forge deploy` 후 upgrade 백필 실동작 확인, 화면 E2E(배지·소속 이동·거부 토스트). stale 팀장(users 행 없음)은 해당 팀 한 번 저장으로 복구.
