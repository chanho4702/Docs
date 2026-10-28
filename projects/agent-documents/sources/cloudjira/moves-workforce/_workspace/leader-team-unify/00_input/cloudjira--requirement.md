# RFC-204 팀장 소속 단일화 — 요구사항

브랜치: `RFC-204` (develop 기준). 작성일 2026-09-28.

## 배경 (사용자 보고)
- 백오피스 인력 관리(`/backoffice/users`) 목록에서 **팀장의 팀이 `-` 로 표시**되고, 팀장이라는 표시도 없다.
- 프로젝트 상세 > 인력 관리 탭, 프로젝트 상세 > 분석 리포트(인력 분석·팀 분석), 프로젝트 대시보드 팀별 인원에서도 팀장이 "팀 미지정"으로 잡힌다.

## 원인 (리더 분석 완료)
소속은 SQL `users.team_key`, 팀장은 KVS `team.leaderAccountId` — **원천이 둘**이다. 팀장을 지정해도 `team_key` 는 채워지지 않는다.
2026-08-05에 "소속이 비면 이끄는 팀으로 채운다"는 보정을 넣었으나 **화면마다 복제**돼 있어 다음 4곳이 빠졌다:
- `src/resolver/backoffice/user/UserService.js:139,354` (목록·상세) — `row.team_key` 만 사용, `isLeader` 없음
- `src/resolver/projectIssue/ProjectUsersService.js:94-105` — 프로젝트 인력 행(분석 리포트 팀 축도 이 resolver)
- `src/resolver/projectIssue/ProjectUsersRepository.js:86` `groupByTeamRepository` — 프로젝트 대시보드 팀별 인원
- 백오피스 팀 필터 `UserRepository.js:16` / 엑셀 `UserService.js:724`

보정 코드 위치(제거 대상): `TeamRepository.js`(`leaderPairsOf`, `appendLeaderRows`, `findAllMemberTeamPairs` 병합, `countUsersByTeam` 이동, `findUsersByTeamKey.includeLeader`), `ResourceManagementService.js:106-137`, `ProjectCalendarService.js buildTeamAxis leadingTeamOf`.

## 사용자 결정 (2026-09-28)
- 한 사람이 여러 팀 팀장인 케이스 **없음**. 팀은 상위/하위 트리.
- **2안 채택: 원천 단일화.** 팀장은 자기가 이끄는 팀의 구성원이다(`users.team_key === 이끄는 팀`).

## 규칙
1. **팀장 지정 = 그 팀으로 소속 이동.** 팀 등록/수정에서 leaderAccountId 가 설정·변경되면 그 사용자의 `users.team_key` 를 그 팀으로 UPDATE. 팀 편집 모달에 안내 문구.
2. **팀장의 소속 변경 금지.** 사용자 편집(`updateUser`), 팀원 일괄 배치(`assignUsersToTeam`), 일괄 해제(`unassignUsersFromTeam`)에서 대상이 어떤 팀의 현 팀장이고 그 팀이 아닌 곳으로 옮기려 하면 새 에러 코드로 거부. 팀장직을 먼저 해제해야 한다.
3. **팀장 해제는 소속을 건드리지 않는다.**
4. 팀 삭제는 현행 유지(소속 해제 + 팀 마스터 삭제로 팀장 참조도 사라짐). 사용자 삭제는 현행 유지(`clearTeamLeadershipOfUser`).
5. **기존 데이터 백필 1회.** SEED_VERSION 10→11. 팀장인데 `team_key` 가 이끄는 팀과 다른(NULL 포함) 사용자를 이끄는 팀으로 이동. `users` 행이 없는 stale 팀장은 건너뛴다.
6. **흩어진 보정 코드 제거.** 데이터가 일치하면 무동작이지만 남기면 다시 복제된다. 관련 테스트는 새 규칙에 맞게 갱신.
7. **팀장 배지.** 백오피스 인력 목록·프로젝트 인력 탭 행에 `isLeader`(= `teamIndex.byKey.get(team_key).leaderAccountId === account_id`) 추가, 프론트는 기존 `team.myTeam.leadBadge`("팀장") 배지 재사용.

## 범위 밖
- 팀장 다중 겸임 지원, 프로젝트 단위 역할, 권한 캐시 무효화.
