# RFC-204 팀장 소속 단일화 — 설계서

작성: 리더(원인 분석을 직접 수행해 설계까지 확정). 요구사항: `00_input/requirement.md`.

## 0. 불변식
**팀장은 자기가 이끄는 팀의 구성원이다.** `team.leaderAccountId === u.account_id` ⇒ `u.team_key === team.teamKey`.
이 불변식은 (a) 쓰기 경로 4곳에서 강제하고, (b) 설치 트리거 백필로 기존 데이터에 적용하며, (c) 읽기 경로의 보정 코드는 제거한다.

## 1. 백엔드

### 1-1. 쓰기 경로 강제 (`src/resolver/backoffice/team/TeamService.js`, `src/resolver/backoffice/user/UserService.js`)
| 함수 | 변경 |
|---|---|
| `addTeamService` | 저장 후 `leaderAccountId` 있으면 `moveUsersToTeam([leaderAccountId], teamKey, updatedId)`. updatedId 는 `getCurrentUserApi()` (assignUsersToTeamService 패턴) |
| `updateTeamService` | `nextLeaderAccountId` 가 바뀌고 non-null 이면 저장 후 같은 이동. RFC-198 상한: 새 팀장이 직접 세트 없이 들어오면 팀 세트를 상속하므로, 팀장 변경 시에도 `assertCanAssignPermissionSet(principal, nextPermissionKey || effectiveTeamPermissionKey(index, nextParentKey))` 를 호출(기존 조건에 `leaderChanged` OR 추가) |
| `updateUserService` | `teamChanged` 이면 `getTeamIndex()` 로 `id` 가 팀장인 팀을 찾고, 존재하며 `nextTeamKey !== 그 팀` 이면 `LogicalError(TEAM_LEADER_CANNOT_MOVE)` 거부 (cause: `{ accountIds:[id], teamKey:<이끄는 팀> }`) |
| `assignUsersToTeamService` | targets 중 `teamKey` 가 아닌 팀의 팀장이 있으면 요청 전체 거부, 같은 에러(cause 에 위반 accountIds 배열) — `TEAM_MEMBER_NOT_IN_SCOPE` 전례와 같은 형태 |
| `unassignUsersFromTeamService` | targets 중 어떤 팀의 팀장이 있으면 전체 거부, 같은 에러 |

공용 헬퍼(신규, `TeamService.js` 또는 `TeamLeadership.js`): `leadingTeamKeyOf(index, accountId) → teamKey|null`. 한 사람은 한 팀만 이끈다는 전제(사용자 확정)이므로 첫 매치.

팀장 해제(`leaderAccountId → null`)는 소속을 건드리지 않는다. 이전 팀장이 교체될 때도 이전 팀장 소속은 그대로.

### 1-2. 에러 코드 (`src/utils/errors/ErrorCodes.js`)
`TEAM_LEADER_CANNOT_MOVE: 'TEAM_LEADER_CANNOT_MOVE'` — 팀장은 이끄는 팀 밖으로 소속 이동/해제 불가. 팀장직을 먼저 해제해야 함.

### 1-3. 백필 (`src/trigger/onInstall.js`)
`SEED_VERSION = 11`. 주석 행 추가. `runSeed()` 뒤에 `backfillLeaderTeamMembership()` 실행(신규, `src/resolver/backoffice/team/TeamLeadership.js` 에 두는 것을 권장 — 팀장 참조 정리 모듈이라 자리 맞음):
- `loadTeamIndexFresh()` 로 팀 전량 → `leaderAccountId` 있는 팀 목록
- 그 accountId 들의 `users` 행 조회 (`TeamRepository` 의 `findUserRowsByAccountIds` 를 export 하거나 동등 쿼리)
- `users` 행 없음 → 건너뜀(stale). `team_key !== teamKey` → `moveUsersToTeam([accountId], teamKey, null)` (updated_id null 허용; 시스템 작업)
- 멱등. 실패해도 seed_version 저장 전에 throw 되면 다음 upgrade 에 재실행된다(기존 onInstall 흐름 그대로).

### 1-4. 보정 코드 제거
| 파일 | 제거/변경 |
|---|---|
| `TeamRepository.js` | `leaderPairsOf`, `appendLeaderRows` 삭제. `findUsersByTeamKeys`/`findUsersByTeamKey` 는 SQL 소속만 반환, `includeLeader`/`teamIndex` 옵션 제거(호출부 `ProjectTeamService.js`, `MyTeamAnalysisService.js`, `deleteTeamService` 정리). `findAllMemberTeamPairs` 는 `team_key IS NOT NULL` 행만. `countUsersByTeam` 은 SQL 결과 그대로. 상단 "팀장 멤버십 보정" 블록 주석을 **불변식 설명**으로 교체 |
| `ResourceManagementService.js:106-137` | `leadingTeamOf` 삭제, `teamKey: row.team_key ?? null` |
| `ProjectCalendarService.js buildTeamAxis` | `leadingTeamOf` 삭제. `findMemberTeamsByProjectsRepository` 는 `teamKey` null 행을 저장소에서 필터 |
| `TeamService.js` 팀 상세 `members` 조립(221행 근처 `...(team.leaderAccountId ? [{account_id}] : [])`) | 팀장을 따로 더하는 로직 제거(소속에 이미 있다). `isLeader` 계산은 유지 |
| 테스트 | `MemberTeamPairs.test.js`, `TeamRepository.test.js`, `ProjectCalendarTeamAxis.test.js`, `PortfolioCostGate/PortfolioUtilBand.test.js`, `SalaryPolicyLeak.test.js`, `TeamService.test.js` 에서 팀장 보정을 기대하는 케이스를 새 규칙(소속만)으로 갱신하거나 삭제. 새 테스트: 쓰기 경로 거부/이동 4케이스 + 백필 멱등 |

### 1-5. `isLeader` 추가
| resolver | 위치 | 계산 |
|---|---|---|
| `getUserListWithPaging` | `UserService.mapUserRowsToDto` 각 행 | `row.team_key ? teamMap.get(row.team_key)?.leaderAccountId === row.account_id : false` (`teamMap` 은 이미 `teamIndex.byKey`) |
| `getUserDetail`(354행 근처) | 상세 DTO | 동일 |
| `findProjectusersByProjectId` | `ProjectUsersService` 각 행 | `teamIndex.byKey.get(r.team_key)?.leaderAccountId === r.account_id`; 조기 반환 분기에서는 `isLeader:false` |

## 2. 경계면 계약
| resolver | 입력 | 응답 (기존 + 추가분만) | 프론트 소비 |
|---|---|---|---|
| `getUserListWithPaging` | 변경 없음 | `content[].isLeader: boolean` 추가, `teamKey/teamName` 은 이제 팀장도 채워짐 | `UserListPaging.jsx` 행 |
| `getUserDetail` | 변경 없음 | `isLeader: boolean` 추가 (기존 DTO 형태 유지) | `useUserEditModal.js` (표시만, 선택) |
| `findProjectusersByProjectId` | 변경 없음 | `rows[].isLeader: boolean` 추가 | `ProjectUserPanel.jsx` |
| `updateUser` | 변경 없음 | 실패 `{ success:false, error:{ code:'TEAM_LEADER_CANNOT_MOVE', cause:{ accountIds, teamKey } } }` | `useUserEditModal.js` 토스트 |
| `assignUsersToTeam` / `unassignUsersFromTeam` | 변경 없음 | 실패 코드 동일 | `useTeamMemberAssignModal.js` → `teamErrorMessage` |
| `addTeam` / `updateTeam` | 변경 없음 | 성공 시 부수효과: 팀장 `users.team_key` 이동 | `TeamEditModal.jsx` 안내 문구 + 성공 후 `userKeys`·팀 상세 쿼리 invalidate |

## 3. 프론트
| 파일 | 변경 |
|---|---|
| `static/ui/src/backoffice/page/user/UserListPaging.jsx` | 사용자 셀에 `row.isLeader && <Badge appearance="primary">{t('team.myTeam.leadBadge')}</Badge>` (OrganizationTab 301행과 같은 형태) |
| `static/ui/src/pages/projectDetail/user/ProjectUserPanel.jsx` | 사용자 셀에 같은 배지 |
| `static/ui/src/backoffice/page/team/modal/edit/TeamEditModal.jsx` + 등록 모달 | 팀장 셀렉트 HelperMessage 를 `team.form.leaderHint` 뒤에 `team.form.leaderMoveHint` 추가(kr: "팀장으로 지정하면 소속이 이 팀으로 변경됩니다." / en: "Assigning a lead moves them into this team.") |
| `static/ui/src/backoffice/page/team/teamErrors.js` | `TRANSLATED_CODES` 에 `TEAM_LEADER_CANNOT_MOVE` 추가, `NON_RETRYABLE` 에도 추가 |
| `static/ui/src/backoffice/page/user/modal/edit/useUserEditModal.js` | 저장 실패 시 `res.error?.code === 'TEAM_LEADER_CANNOT_MOVE'` 면 `t('team.error.TEAM_LEADER_CANNOT_MOVE')` 표시 |
| 팀 편집/등록 저장 성공 훅 | `userKeys.all` invalidate 추가(팀장 소속이 바뀌므로 인력 목록 캐시 갱신) — 이미 하고 있으면 생략 |
| i18n | `locales/kr/team.json`·`locales/en/team.json` 에 `team.form.leaderMoveHint`, `team.error.TEAM_LEADER_CANNOT_MOVE`(kr: "팀장은 이끄는 팀 밖으로 옮길 수 없습니다. 팀장 지정을 먼저 해제하세요." / en: "A team lead cannot be moved out of their team. Remove the lead assignment first.") 추가 후 `cd static/ui && npm run merge` |

## 4. 검증 포인트 (verifier)
- 불변식: 쓰기 4경로 테스트 통과, 백필 함수 단위 테스트(행 없음/이미 일치/이동 3케이스).
- 제거 후 잔존 참조 0: `grep -rn "leaderPairsOf\|appendLeaderRows\|includeLeader\|leadingTeamOf" src static/ui/src`.
- `isLeader` 세 resolver 응답 ↔ 프론트 두 화면 접근 경로 일치.
- 루트 `npm test`, `cd static/ui && npm test`, `CI=true npm run build`.
- 권한 계약 테스트(`test/permission/permissionMap.contract.test.js`) 무회귀 — 신규 resolver 없음.
