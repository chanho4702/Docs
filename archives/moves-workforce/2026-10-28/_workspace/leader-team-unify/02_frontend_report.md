# RFC-204 팀장 소속 단일화 — 프론트 구현 리포트

## 변경 파일
| 파일 | 변경 |
|---|---|
| `static/ui/src/backoffice/page/user/UserListPaging.jsx` | 사용자 셀에 `row.isLeader` 이면 `<Badge appearance="primary">{t('team.myTeam.leadBadge')}</Badge>` (OrganizationTab 301행과 같은 inline-flex 형태). useMemo deps 에 `t` 추가 |
| `static/ui/src/pages/projectDetail/user/ProjectUserPanel.jsx` | 이름 셀에 `data.isLeader` 배지. useMemo deps 에 `t` 추가 |
| `static/ui/src/backoffice/page/team/modal/edit/TeamEditModal.jsx` | 팀장 HelperMessage = `leaderHint` + 공백 + `leaderMoveHint` |
| `static/ui/src/backoffice/page/team/modal/regist/TeamRegistrationModal.jsx` | 같음 |
| `static/ui/src/backoffice/page/team/teamErrors.js` | `TRANSLATED_CODES`·`NON_RETRYABLE` 에 `TEAM_LEADER_CANNOT_MOVE` |
| `static/ui/src/backoffice/page/user/modal/edit/useUserEditModal.js` | 저장 실패 토스트: `res.error?.code === 'TEAM_LEADER_CANNOT_MOVE'` → `t('team.error.TEAM_LEADER_CANNOT_MOVE')`. 훅 반환에 `isLeader: userData?.isLeader === true` |
| `static/ui/src/backoffice/page/user/modal/edit/UserEditModal.jsx` | `isLeader` 면 팀 Select `isDisabled` + HelperMessage 로 `team.error.TEAM_LEADER_CANNOT_MOVE` 문구 표시 |
| `locales/kr/team.json`, `locales/en/team.json` | `form.leaderMoveHint`, `error.TEAM_LEADER_CANNOT_MOVE` (CRLF 유지) |
| `locales/ko-KR.json`, `locales/en-US.json` | `npm run merge` 산출물(직접 수정 없음) |

## 소비하는 shape · 접근 경로
| resolver | 접근 경로 | 위치 |
|---|---|---|
| `getUserListWithPaging` | `res.content[i].isLeader` (queryFn 이 `res` 전체 반환 → `data.content[i]`) | `UserListPaging.jsx` |
| `findUserByAccountId` | 루트 `res.isLeader` (`const { success, ...data } = res` → `userData.isLeader`) | `useUserEditModal.js` |
| `findProjectusersByProjectId` | `rows[i].isLeader` (기존 `dataList` 가 rows) | `ProjectUserPanel.jsx` |
| `updateUser` 실패 | `res.error.code === 'TEAM_LEADER_CANNOT_MOVE'` | `useUserEditModal.js` |
| `assignUsersToTeam` / `unassignUsersFromTeam` 실패 | `teamErrorMessage(t, res.error)` → `team.error.TEAM_LEADER_CANNOT_MOVE` | `useTeamMemberAssignModal.js`(수정 없음, 매핑 추가로 해결) |

`cause.accountIds`/`cause.teamKey` 는 소비하지 않는다(문구만 표시). 백엔드 리포트의 shape 과 불일치 없음.

## 캐시 무효화 (항목 6)
`TeamPage.refreshTeams()` 가 이미 `userKeys.all` 을 invalidate 하고, 등록·편집·팀원 배치 모달의 `onSuccess` 가 전부 `refreshTeams` 를 호출한다 → 추가 변경 없음.
참고: 프로젝트 인력 목록(`findProjectusersByProjectId`) 캐시는 팀 저장 시 무효화되지 않는다(기존과 동일, 해당 화면 재진입/staleTime 으로 갱신).

## i18n
- `team.form.leaderMoveHint` — kr "팀장으로 지정하면 소속이 이 팀으로 변경됩니다." / en "Assigning a lead moves them into this team."
- `team.error.TEAM_LEADER_CANNOT_MOVE` — kr "팀장은 이끄는 팀 밖으로 옮길 수 없습니다. 팀장 지정을 먼저 해제하세요." / en "A team lead cannot be moved out of their team. Remove the lead assignment first."
- `cd static/ui && npm run merge` **실행 완료** — ko-KR/en-US 에 두 키 반영 확인.

## 테스트 / 빌드
- `cd static/ui && npm test` → Test Suites 126 passed, Tests 2026 passed
- `CI=true npm run build` → 성공. bundle:check main gzip 481,112 / 950,000, panel 329,314 / 350,000 (모두 withinBudget)

## 설계서와 달라진 점
- 사용자 편집 모달에서 팀장이면 팀 Select 를 비활성화하고 힌트로 `team.error.TEAM_LEADER_CANNOT_MOVE` 문구를 재사용(별도 키 추가 없음).
- 팀 모달 힌트는 별도 HelperMessage 를 하나 더 두지 않고 기존 HelperMessage 안에 두 문장을 이어 붙였다.

## 팀장 폴백 잔존 여부
프론트에서 `leaderAccountId` 로 `teamKey` 를 채우는 로직은 찾지 못했다. `OrganizationTab.jsx:178`(팀장 카드용 `people.find`)·`:301`(배지)은 표시용이라 폴백이 아님.
