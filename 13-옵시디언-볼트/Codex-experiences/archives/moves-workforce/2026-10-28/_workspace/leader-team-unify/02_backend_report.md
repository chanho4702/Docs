# RFC-204 팀장 소속 단일화 — 백엔드 구현 리포트

불변식: **팀장은 자기가 이끄는 팀의 구성원이다** (`team.leaderAccountId === u.account_id` ⇒ `u.team_key === team.teamKey`).
신규 resolver 없음 → `PermissionMap`·`CONTROLLER_REGISTRARS` 변경 없음. 기존 `guardedDefine` 그대로.

## (a) 변경 파일

| 파일 | 변경 |
|---|---|
| `src/utils/errors/ErrorCodes.js` | `TEAM_LEADER_CANNOT_MOVE` 추가 |
| `src/resolver/backoffice/team/TeamLeadership.js` | `leadingTeamKeyOf(index, accountId)`, `assertLeadersStay(index, accountIds, nextTeamKey)`(쓰기 경로 공용 판정), `backfillLeaderTeamMembership()` 추가. `TeamRepository` import 추가(UserService 비의존 유지 → 순환 없음) |
| `src/resolver/backoffice/team/TeamRepository.js` | `leaderPairsOf`·`appendLeaderRows` 삭제, `getTeamIndex` import 제거. `findUserRowsByAccountIds` export. `findUsersByTeamKeys(teamKeys)`/`findUsersByTeamKey(teamKey)` 옵션 인자 제거(SQL 소속만). `findAllMemberTeamPairs` = `WHERE team_key IS NOT NULL`. `countUsersByTeam()` = SQL 결과 그대로. 상단 보정 블록 주석 → 불변식 설명 |
| `src/resolver/backoffice/team/TeamService.js` | `addTeamService`/`updateTeamService` 팀장 이동, `updateTeamService` 세트 상한 조건에 `leaderJoins` 추가, `assignUsersToTeamService`/`unassignUsersFromTeamService` 거부, 팀 상세 members 조립에서 팀장 별도 추가 제거(`isLeader` 유지), `deleteTeamService` 의 `includeLeader:false` 제거 |
| `src/resolver/backoffice/user/UserService.js` | `updateUserService` 거부, `mapUserRowsToDto`·`findUserByAccountIdService` 에 `isLeader` |
| `src/resolver/projectIssue/ProjectUsersService.js` | `findProjectusersByProjectIdService` 행에 `isLeader` |
| `src/resolver/projectIssue/ProjectUsersRepository.js` | `findMemberTeamsByProjectsRepository` 가 `team_key` 없는 행을 필터 |
| `src/resolver/projectCalendar/ProjectCalendarService.js` | `buildTeamAxis` 의 `leadingTeamOf` 삭제 |
| `src/resolver/resourceManagement/ResourceManagementService.js` | `leadingTeamOf` 삭제, `teamKey: row.team_key ?? null` |
| `src/resolver/projectTeam/ProjectTeamService.js` | `countUsersByTeam`/`findUsersByTeamKeys` 의 `{ teamIndex }` 인자 제거, 팀장 보정 전제 주석 정리 |
| `src/trigger/onInstall.js` | `SEED_VERSION = 11` + 주석 행, `runSeed()` 뒤 `backfillLeaderTeamMembership()` |
| `src/seed/SeedData.js` | `ensureSeed()` 에도 백필 호출 추가 (아래 (e) 참조) |
| 테스트 | `TeamRepository.test.js`, `MemberTeamPairs.test.js`, `ProjectTeamService.test.js`, `UpdateUserMerge.test.js` 갱신 / `TeamService.test.js` 신규 describe / 신규 `LeaderTeamBackfill.test.js` |

잔존 참조: `grep -rn "leaderPairsOf\|appendLeaderRows\|includeLeader\|leadingTeamOf" src static/ui/src` → **0건**.

## (b) 실제 응답 shape (guardedDefine 직렬화 후)

### `getUserListWithPaging`
```
{
  success: true,
  salaryPolicy,
  content: [
    {
      userId, userName, userAvatarUrls,
      roleKey, roleName, levelKey, levelName,
      permissionKey, permissionName,
      teamKey, teamName,
      isLeader: boolean,          // 신규 — team_key 없으면 false
      salary | levelBand,         // 급여 정책별 (기존 그대로)
      createdAt
    }
  ],
  page: { totalDataCnt, totalPages, isLastPage, isFirstPage, requestPage, requestSize }
}
```
`isLeader` 는 `content[i].isLeader`. 계산: `row.team_key ? teamMap.get(row.team_key)?.leaderAccountId === row.account_id : false` (`teamMap` = `getTeamIndex()` 60초 캐시의 `byKey`).

### 사용자 상세 — 실제 resolver 이름은 `findUserByAccountId` (설계서 표의 `getUserDetail` 은 이 resolver 를 가리킴. 프론트 `useUserEditModal.js:102` 가 `invoke("findUserByAccountId", { accountId })`)
```
{
  success: true,
  salaryPolicy,
  userId, userName, userAvatarUrls,
  creatorId, creatorName, creatorAvatarUrls,
  updaterId, updaterName, updaterAvatarUrls,
  createdAt, updatedAt,
  salary | levelBand,
  roleKey, levelKey, permissionKey,
  teamKey, teamName,
  isLeader: boolean               // 신규 — 루트 레벨(content 래퍼 없음)
}
```
`res.isLeader` 로 접근. TEAM_LEAD 마스킹 대상 아님.

### `findProjectusersByProjectId`
```
{
  success: true,
  rows: [
    {
      project_member_id, project_id, account_id, role_key, level_key, team_key,
      created_id, created_at, updated_id, updated_at, total_count,
      teamKey, teamName,
      isLeader: boolean           // 신규
    }
  ],
  rowsAffected: 0,
  ...(@forge/sql raw 결과의 기타 키)
}
```
`isLeader` 는 `rows[i].isLeader`. 행 중 `team_key` 가 하나도 없으면 조기 반환 분기에서 전부 `isLeader:false`.

## (c) 신규 에러 코드

`TEAM_LEADER_CANNOT_MOVE` — 팀장을 이끄는 팀 밖으로 이동하거나 소속 해제하려 할 때. 요청 **전체 거부**(부분 반영 없음).

```
{ success: false, error: { name: 'LogicalError', code: 'TEAM_LEADER_CANNOT_MOVE', message: 'TEAM_LEADER_CANNOT_MOVE',
    cause: { accountIds: string[], teamKey: string } } }
```
- `accountIds`: 위반 대상(팀장) accountId 배열. `updateUser` 는 항상 `[id]`.
- `teamKey`: 위반자가 이끄는 팀 키. 위반자가 여럿이면 **첫 위반자의** 팀(한 사람 1팀 전제라 배치 요청에서 여러 팀이 섞일 수 있음 — 전부 필요하면 알려 달라).
- 발생 resolver: `updateUser`(teamKey 변경 시), `assignUsersToTeam`(대상 팀 ≠ 이끄는 팀), `unassignUsersFromTeam`(팀장 포함 시). 팀장을 **자기 팀으로** 배치하는 것은 허용.
- 판정 인덱스는 쓰기 경로 관례대로 `loadTeamIndexFresh()`(캐시 우회).

부수효과(성공 응답 shape 변화 없음):
- `addTeam`: `leaderAccountId` 가 있으면 KVS 저장 → `moveUsersToTeam([leader], teamKey, 현재사용자)`.
- `updateTeam`: 저장 후 `nextLeaderAccountId` 가 non-null 이면 **팀장 변경 여부와 무관하게** 같은 이동(이미 소속이면 무변경 UPDATE). 팀장 해제(null)·교체된 이전 팀장 소속은 변경 없음. 새 팀장이 들어올 때(`leaderChanged && non-null`)는 RFC-198 세트 상한 검사도 거친다.
- SQL 이동 실패는 throw(`{success:false}`). KVS 는 이미 저장된 상태다. `updateTeam` 은 같은 요청을 재시도하면 이동이 다시 수행돼 복구된다(위 무조건 이동의 이유). `addTeam` 재시도는 이름 중복으로 거부되므로, 이 드문 경우는 팀 편집 저장 한 번(또는 다음 upgrade 백필)으로 복구된다.

## (d) `npm test`

```
Test Suites: 130 passed, 130 total
Tests:       1772 passed, 1772 total
```
신규/갱신 테스트:
- `TeamService.test.js` › RFC-204 팀장 소속 불변식 — addTeam 이동(저장→이동 순서)/미지정 무동작, updateTeam 변경 시 이동·해제 무동작·미변경 저장 재확인 이동, 팀장 합류 시 세트 상한(principal 누락 fail-close), assign 거부/자기 팀 허용, unassign 거부
- `UpdateUserMerge.test.js` › teamKey 'team-2'/null 거부(cause 검증), 팀 미변경 저장 통과
- `LeaderTeamBackfill.test.js` — 행 없음 skip / 이미 일치 skip / 불일치 이동(NULL·타 팀) / 재실행 멱등 / 팀장 없음 SQL 미발행
- 보정 기대 케이스 삭제·갱신: `TeamRepository.test.js`(보정 2건 → 소속만 2건), `MemberTeamPairs.test.js`(팀장 보정 케이스 삭제, SQL 에 `team_key IS NOT NULL` 단언), `ProjectTeamService.test.js`(`{teamIndex}` 인자 단언 제거, "하위 팀 소속 상위 팀장" 케이스 삭제)

## (e) 설계서와 달라진 점

1. **`ensureSeed()` 에도 백필 추가.** `SeedData.ensureSeed()`(권한 조회 시 폴백)가 `seed_version` 을 같은 원장으로 올리므로, 이쪽이 먼저 돌면 `onInstall` 의 백필이 영원히 건너뛰어진다. 두 경로 모두 호출.
2. **판정 공용 함수 `assertLeadersStay` 를 `TeamLeadership.js` 에 둠.** `TeamService` 가 `UserService` 를 import 하므로 `TeamService` 에 두면 `UserService → TeamService` 순환이 생긴다.
3. **`updateUserService` 는 `getTeamIndex()` 대신 `loadTeamIndexFresh()`** — 쓰기 경로 검증은 캐시 우회 관례(M1). 방금 팀장이 된 사람을 60초 동안 놓치지 않게.
4. 사용자 상세 resolver 이름은 `getUserDetail` 이 아니라 **`findUserByAccountId`**.
5. **`updateTeam` 이동 조건을 "팀장 변경 시" → "팀장이 있으면 항상"으로 넓힘.** 설계서 조건대로면 KVS 저장 후 SQL 이 실패한 요청을 재시도할 때 `leaderChanged` 가 false 가 되어 영영 이동하지 않는다. 비용은 팀 편집당 UPDATE 1건(해당 팀장 행의 updated_id/updated_at 갱신).
6. 설계서 1-4 의 테스트 목록 중 `ProjectCalendarTeamAxis`·`PortfolioCostGate`·`PortfolioUtilBand`·`SalaryPolicyLeak` 는 저장소를 mock 하므로 수정 없이 통과.

## 미처리/주의
- 새 팀장이 이미 **다른 팀의 팀장**인 경우는 검사하지 않는다(사용자 확정: 겸임 없음). 발생하면 이전 팀의 불변식이 깨진다.
- 목록 `isLeader` 는 `getTeamIndex()` 60초 캐시 기반이라 다른 인스턴스에서는 팀장 변경 후 최대 60초 늦게 반영될 수 있다(teamName 과 동일한 성질).
- 백필은 install/upgrade(또는 `ensureSeed`) 시 1회. 배포 후 `forge deploy` + upgrade 로 실행되는지 E2E 확인 필요.
