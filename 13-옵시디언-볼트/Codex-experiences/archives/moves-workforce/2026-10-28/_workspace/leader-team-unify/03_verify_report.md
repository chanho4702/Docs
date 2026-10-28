# RFC-204 팀장 소속 단일화 — 통합 검증 리포트

검증일 2026-09-28, 브랜치 `RFC-204` 작업 트리(미커밋). 기준: `01_architect_design.md` §2 경계면 계약, §4 검증 포인트.

## 요약
| 분류 | 건수 |
|---|---|
| 통과 | A·C·D·E·F·G 전부, B 중 4경로 자체 판정 |
| **실패** | 1건 (F-1, 겸임 미차단으로 addTeam/updateTeam 이 **다른 팀의** 불변식을 깨뜨림) |
| 경미/관찰 | 3건 (O-1~O-3, 수정 선택) |
| 미검증 | 실환경 백필 실행(`forge deploy` + upgrade), 화면 E2E |

---

## 실패

### F-1. addTeam/updateTeam 이 다른 팀의 팀장을 그대로 데려가 원래 팀의 불변식이 깨짐
- 생산자: `src/resolver/backoffice/team/TeamService.js:442` (addTeam `assertLeaderRegistered` 만), `:503-506` (updateTeam `leaderChanged` 시 `assertLeaderRegistered` 만), 이동 `:470-473`, `:552-555`
- 소비자(UI): `TeamEditModal.jsx:111` / `TeamRegistrationModal.jsx:105` 의 `RegisteredUserSelect` 는 **등록 인원 전체**가 후보 → 이미 다른 팀 Y 를 이끄는 사람 X 를 팀 Z 의 팀장으로 고를 수 있음.
- 결과: X 가 Z 로 `moveUsersToTeam` 됨 → Y.leaderAccountId=X 인데 `users.team_key=Z` → **Y 의 불변식이 깨지고**, 보정 코드를 지웠으므로 Y 의 팀원 목록·캘린더 팀 축·인력현황에서 Y 팀장이 빠진다(RFC-204 가 고치려던 증상 그대로 재발). 더불어 X 는 두 팀 팀장이 되어 `leadingTeamKeyOf` 의 "첫 매치"가 인덱스 순서에 의존.
- 백엔드 리포트 "미처리/주의" 에 "겸임 없음(사용자 확정)이라 검사 안 함"으로 적혀 있으나, **확정된 규칙이 어디에서도 강제되지 않는다**. 과제 B 기준 "팀장의 소속을 바꿀 수 있는 다른 경로"에 해당.
- 수정 방법(백엔드, 1줄 수준): 저장 전에 공용 판정 재사용
  - addTeam: `assertLeaderRegistered` 뒤 `if (leaderAccountId) assertLeadersStay(index, [leaderAccountId], null)` — 신규 팀이라 기존 팀 리더십이 있으면 모두 거부. (nextTeamKey 로 새 teamKey 는 아직 없으므로 null 전달 = "어느 팀이든 이끌고 있으면 거부")
  - updateTeam: `if (leaderChanged && nextLeaderAccountId) assertLeadersStay(index, [nextLeaderAccountId], teamKey)`
  - 에러 코드는 `TEAM_LEADER_CANNOT_MOVE` 그대로 쓰면 프론트 변경 불필요 — `useTeamEditModal.js:166,184`, `useTeamRegistrationModal.js:32` 가 이미 `teamErrorMessage` → `TRANSLATED_CODES` 에 등록돼 문구("팀장은 이끄는 팀 밖으로 옮길 수 없습니다. 팀장 지정을 먼저 해제하세요.")가 뜬다. 문구 의미도 맞다.
  - 테스트: `TeamService.test.js` RFC-204 describe 에 "타 팀 팀장을 팀장으로 지정 → 거부, KVS save·UPDATE 미발행" 2건(add/update).

---

## 경미 / 관찰 (수정 선택)

- **O-1 백필의 겸임(과거 데이터) 처리** — `TeamLeadership.js:104-115`. 한 사람이 두 팀 팀장인 레거시 데이터면 루프가 두 번 이동해 **마지막** 팀에 남고, `leadingTeamKeyOf` 는 **첫** 팀을 돌려준다(서로 다른 팀). 구 보정 코드가 "여러 팀 팀장이면 teamKey 정렬 첫 팀"을 다뤘던 걸 보면 실데이터 가능성이 0은 아님. 수정: 루프에서 이미 이번 실행에 이동시킨 accountId 는 건너뛰기(`Set`) + teamKey 정렬로 결정성 확보. F-1 을 막으면 신규 발생은 없음.
- **O-2 stale 팀장(users 행 없음) 재등록 경로** — `UserService.js:414,438` `addUserService` 가 임의 `teamKey` 로 INSERT, 큐 업로드 `src/queue/consumer.js:137` `addUsersBulk` 는 team_key NULL 로 INSERT IGNORE. 사용자 삭제 시 `clearTeamLeadershipOfUser` 가 리더십을 지우므로 정상 흐름에선 stale 팀장이 생기지 않아 실질 위험 낮음(레거시만). 백필도 행 없는 팀장은 건너뛰므로, 이후 그 팀을 한 번 편집·저장하면 `updateTeam` 무조건 이동으로 복구된다. 보고만.
- **O-3 프로젝트 인력 목록 캐시** — 팀장 변경 후 `findProjectusersByProjectId`(`projectKeys.userPage`) 의 `isLeader`/팀 컬럼은 재진입 전까지 stale. 프론트 리포트에 이미 명시, 기존 성질과 동일.

---

## 통과

### A. 경계면 교차 비교
| 경계면 | 생산자 | 소비자 | 결과 |
|---|---|---|---|
| `getUserListWithPaging.content[].isLeader` | `UserService.js:141` (`mapUserRowsToDto`, `teamMap=getTeamIndex().byKey`) | `UserListPaging.jsx:37-42`(queryFn 이 `res` 전체 반환) → `:74 data.content` → `:83 row.isLeader` | 일치 |
| `findUserByAccountId` 루트 `isLeader` | `UserService.js:357` | `useUserEditModal.js:102-103` `{success,...data}` → `:344 userData?.isLeader === true` → `UserEditModal.jsx:44,210,213` | 일치 (content 래퍼 없음 확인) |
| `findProjectusersByProjectId.rows[].isLeader` | `ProjectUsersService.js:95`(조기 반환 false), `:105` | `ProjectUserPanel.jsx:76 data?.rows` → `:98 data.isLeader` | 일치 |
| `TEAM_LEADER_CANNOT_MOVE` throw | `TeamLeadership.js:88` `LogicalError(code, code, {accountIds, teamKey})` / 호출 `UserService.js:531`, `TeamService.js:660,673` | `useUserEditModal.js:218` `res.error?.code` 분기, `teamErrors.js:32`(TRANSLATED)·`:57`(NON_RETRYABLE) → `useTeamMemberAssignModal.js:106` | 일치 (cause 는 소비하지 않음 — 계약상 문제 없음) |
| 팀 저장 후 캐시 | `addTeam`/`updateTeam` 부수효과(팀장 소속 이동) | `TeamPage.refreshTeams` → `userKeys.all` invalidate, `userKeys.findUser` 도 `["users",...]` 하위라 함께 무효화 | 통과 |
| snake/camel | `isLeader` 는 세 응답 모두 camelCase, `rows[]` 의 기존 snake 필드는 불변 | — | 통과 |

설계서 표의 `getUserDetail` 은 실제 resolver `findUserByAccountId` — 백엔드 리포트 (e)-4 와 코드가 일치.

### B. 쓰기 경로 (자체 판정)
`src/` 전역 grep(`moveUsersToTeam|clearTeamOfUsers|UPDATE_TEAM_BY_ACCOUNTS|CLEAR_TEAM|team_key =`, `UserQuery.INSERT/UPDATE_*` 사용처) 결과 users.team_key 를 쓰는 경로 전수:
| 경로 | 위치 | 불변식 |
|---|---|---|
| updateUser | `UserService.js:531` `assertLeadersStay(loadTeamIndexFresh(), [id], nextTeamKey)` (`teamChanged` 시) → `UPDATE_USER_WITH_SALARY` | 통과 |
| assignUsersToTeam | `TeamService.js:660` (fresh index) | 통과, 자기 팀 배치 허용 |
| unassignUsersFromTeam | `TeamService.js:673` (nextTeamKey null → 팀장 전부 거부) | 통과 |
| addTeam / updateTeam | `TeamService.js:470-473`, `:552-555` 팀장 이동 | **자기 팀 기준 통과, 타 팀 기준 F-1 실패** |
| deleteTeam | `clearTeamByTeamKey` — 삭제 팀의 리더십도 함께 사라지므로 불변식 무관 | 통과 |
| 백필 | `TeamLeadership.js:112` | 통과(O-1 제외) |
| addUser / 큐 `addUsersBulk` | 신규 행만 INSERT, 기존 행 미변경(INSERT IGNORE) | 통과(O-2) |
| `UPDATE_USER`(deprecated) | 호출부 `updateUserRepository` — team_key 미변경 | 무관 |
판정 로직은 `assertLeadersStay` 공용 함수 1곳 — 읽기/쓰기·경로 간 복제 없음.
`updateTeam` 팀장 합류 시 RFC-198 세트 상한(`leaderJoins`) 추가 확인(`TeamService.js:530-531`), addTeam 은 원래 무조건 검사.

### C. 보정 코드 잔존
`grep -rn "leaderPairsOf\|appendLeaderRows\|includeLeader\|leadingTeamOf" src static/ui/src` → **0건**. 보정 서술 주석 잔존도 없음(TeamRepository 상단 불변식 주석 1건은 의도).

### D. 서비스 내부 소비자
- `findUsersByTeamKey(teamKey)` 호출부: `TeamService.js:203`(팀 상세), `:581`(삭제 영향도 — 구 `includeLeader:false` 와 동일 의미) → 인자 정합.
- `findUsersByTeamKeys(keys)` 호출부: `ProjectTeamService.js:91,226,305,325`, `MyTeamAnalysisService.js:84` → 옵션 인자 없음. 행 shape(SELECT *) 불변.
- `countUsersByTeam()` 소비자: `TeamService.js:137,201`, `ProjectTeamService.js:90`, `TeamAnalyticsService.js:94`, `UserService.js:818` → 모두 무인자, 반환 `[{team,count}]` 불변.
- `findAllMemberTeamPairs()` 소비자: `PortfolioDashboardService.js:172` → `[{accountId,teamKey}]` 불변(`team_key IS NOT NULL` 은 기존 필터와 동치). `QueryBuilder.whereRaw` 존재 확인.
- `findMemberTeamsByProjectsRepository` → `ProjectCalendarService.buildTeamAxis` 의 "null 값 금지" 규약이 저장소 필터로 이동, 정합.

### E. 백필
`onInstall.js:11` `SEED_VERSION = 11` + 주석, `:27` `runSeed()` 뒤 호출 / `SeedData.js:37` `ensureSeed` 에도 호출(버전 원장 공유로 인한 skip 방지 — 타당). 두 경로 모두 백필 실패 시 `seed_version` 저장 전 throw → 재실행. `LeaderTeamBackfill.test.js` 3건(행 없음·일치 skip·불일치 이동 / 재실행 멱등 / 팀장 0명 SQL 미발행).

### F. 테스트/빌드 (본 검증에서 직접 실행)
- 루트 `npm test`: Test Suites 130/130, Tests 1772/1772 통과 (`test/permission/permissionMap.contract.test.js` 등 권한 계약 포함, 신규 resolver 없음)
- `cd static/ui && npm test`: 126/126, 2031/2031 통과
- `CI=true npm run build`: 성공(경고는 node_modules source map 뿐), bundle:check main gzip 481,113/950,000, panel 329,314/350,000 withinBudget

### G. i18n
`team.form.leaderMoveHint`, `team.error.TEAM_LEADER_CANNOT_MOVE` — `locales/kr/team.json:49,125`, `locales/en/team.json:49,125`, merge 결과 `ko-KR.json:3872,3948`, `en-US.json:3851,3927` 존재. 배지 재사용 키 `team.myTeam.leadBadge` 양쪽 존재. 프론트 `t()` 키 오타 없음.

## 미검증
- 실환경 upgrade 시 백필 실행(`forge deploy` → upgrade 트리거) 및 기존 팀장 이동 결과
- 사용자 목록·프로젝트 인력 배지, 팀 편집 저장 후 소속 이동, 거부 토스트 E2E

---
## 리더 후속 조치 (2026-09-28)
- **실패 1건 수정 완료** — `TeamService.addTeamService`/`updateTeamService` 에 `assertLeadersStay` 로 겸임 차단 추가. 거부 코드 `TEAM_LEADER_CANNOT_MOVE`(프론트 `teamErrorMessage` 가 이미 번역). 테스트 2건 추가 → 루트 `npm test` 130 suites / 1774 tests 통과.
- **O-1 수정 완료** — `backfillLeaderTeamMembership` 과 `leadingTeamKeyOf` 를 teamKey 정렬 기준으로 일치시킴.
- O-2(users 행 없는 stale 팀장), O-3(프로젝트 인력 목록 캐시)는 기존 동작 유지, 보류.

## Codex 리뷰 반영 (2026-09-28)
- **반영** P1 `addTeam` KVS→SQL 실패 시 재시도 불가(이름 중복에 막힘) → SQL 이동 실패 시 방금 만든 팀 KVS 삭제(보상) 후 throw. 테스트 추가.
- **반영** P1 백필의 레거시 겸임 처리 → 정렬된 첫 팀에만 맞추고 두 번 옮기지 않음(`leadingTeamKeyOf` 와 동일). 테스트 추가. 나머지 팀의 stale leaderAccountId 는 정리하지 않음(사용자 확정: 겸임 데이터 없음).
- **보류** P1 동시 요청 TOCTOU — Forge 에 잠금 수단 없음, 관리자 두 명이 같은 사람을 동시에 팀장 지정하는 경우만 해당. 발생 시 해당 팀 한 번 저장으로 복구.
- **확인 완료** P2 다른 `team_key` 갱신 경로 — 검증 B 항목에서 전수 확인(큐 업로드는 team_key 미기록).
