# linked-mode-fix — 워크포스 구현 보고 (2026-10-14)

> 리포: `C:\CloudJira\moves-workforce` (기준 `03bdfa8`). 설계서 §11 워크포스 몫(T-W1~T-W6) 전부.
> 커밋·`forge deploy/tunnel` 없음. `locales/en-US.json`·`ko-KR.json`·미추적 파일(pptx·png·custom-scopes.yaml·`LeaderTeamBackfill.test.js`) 무변경(빌드 전후 sha1 대조 OK).
> 모든 변경은 작업 트리에만 있다(스테이징 없음 — `git mv/rm` 뒤 `git reset` 으로 인덱스를 되돌림).

## 1. 바뀐 파일

### R2 팀 구조 게시
| 파일 | 변경 |
|---|---|
| `src/integration/approval/orgCap.js` | 순수 함수 `approverOf`·`memberTeamsOf`·`subLeadsOf`·`buildOrgTeam`·`sameTeam` 추가, `orgCapPlan({current, rev, team})` 확장(team undefined → 기존처럼 걸린 팀 칸 보존 / cap 있음 + 같은 팀 → 게시 안 함 / 검증 실패 → `{publish:false, reason:'ORG_INVALID'}`, 잘라내지 않음). 상단 "팀 구조를 게시하지 않는다" 주석 교체 |
| `src/resolver/backoffice/team/TeamTree.js` | `leadingTeamKeyOf` 를 여기로 옮김(순수). |
| `src/resolver/backoffice/team/TeamLeadership.js` | `leadingTeamKeyOf` 재수출(기존 import 경로 유지), `clearTeamLeadershipOfUser`(정리 > 0)·`backfillLeaderTeamMembership`(moved > 0) 뒤 `bumpOrgEpoch` |
| `src/resolver/approvalLink/orgEpoch.js` (신규) | KVS `approvalLink:orgEpoch` — `readOrgEpoch()`, `bumpOrgEpoch()`(던지지 않음, 경고 로그) |
| `src/resolver/approvalLink/ApprovalLinkSignals.js` | deps `loadOrgTeam`·`readOrgEpoch`. 기본 로더 = `getTeamIndex()`(60s 캐시) → `findUserRowsByAccountIds([me])` → 팀장이면 `findAccountTeamPairsByTeamKeys(memberTeamsOf(me))` 1회 → `buildOrgTeam`. memo 키 `${cloudId}|${accountId}|${kid}|${epoch ?? '-'}`. ORG_INVALID → 로그(개수만)·memo 기록·`FAILED`·PUT 0. 팀 로드 실패/인덱스 잘림 → 팀 칸 보존·memo 미기록. 쓰기는 기존대로 본인 `movesRms.org` **asUser** |
| `src/resolver/backoffice/team/TeamService.js` | add(팀장 이동 뒤)·update·delete·assign·unassign 성공 뒤 `bumpOrgEpoch` |
| `src/resolver/backoffice/user/UserService.js` | 등록(teamKey 있을 때)·수정(teamChanged, UPDATE 성공 뒤)·삭제(users 삭제 뒤) `bumpOrgEpoch` |
| `src/resolver/backoffice/permission/PermissionController.js` | `userPermissionCheck` 에서 `ensureOrgCap({cloudId, accountId: context.accountId})` 병행, 결과 미포함·실패 삼킴 |

### R4 이슈 패널 제거
| 파일 | 변경 |
|---|---|
| `manifest.yml` | `jira:issueActivity`(moves-rms-issue-activity)·`jira:issueContext`(moves-rms-issue-context) 블록과 그 위 주석, `resources[issue-panel]` 와 주석 삭제(-58행). scope 무변경, 커스텀 필드의 `movesRmsLink.linked` displayConditions 유지 |
| `static/ui/src/panel/**` | 삭제 13개 + `__test__` 4개 |
| `static/ui/src/panel/panelApproval.js` → `static/ui/src/components/worklog/approvalHandoff.js` | **이동**. `approvalHandoffPath`·`APPROVAL_CREATE_ERROR_KEY`·`approvalCreateErrorKey` 만 남김(`mergeHiddenWorklogs`·`resolveApprovalRowMode` 는 사용처 0 → 삭제) |
| `.../panel/__test__/panelApproval.test.js` → `components/worklog/__test__/approvalHandoff.test.js` | 이동, 삭제된 두 함수 테스트 제거 |
| `components/worklog/worklogMoveGuard.js`, `pages/myWork/modal/WorklogModal.jsx` | import 경로만 변경 |
| `utils/queryKey/issuePanelKeys.js` | `issuePanelKeys` export 삭제(사용처 0). `issueLinkBackfillKeys` 유지 |
| `utils/queryKey/queryKeyFactories.test.js` | issuePanelKeys 단언 제거, backfill 키 단언 유지 |
| `src/__test__/linkedNoDirectWrite.test.jsx` | 패널 작성 폼·최근 기록 describe 와 패널 전용 mock 제거, 캘린더 드래그·직접 호출 0 검사 유지 |
| `utils/__test__/forgeAppUrl.test.js` | `LOCAL_ID` 픽스처 `moves-rms-issue-activity` → `moves-rms` |
| `src/__test__/cracoPanelPaths.test.js`, `scripts/build-panel.js` | 삭제 |
| `static/ui/craco.config.js` | PANEL_BUILD `paths` 훅·`path` require 삭제 |
| `static/ui/package.json` | `build` = `build:app && bundle:check`, `build:panel`·`bundle:check:panel` 삭제 |
| `bitbucket-pipelines.yml` | `static/ui/build-panel/**` artifact 2곳 삭제 |

### R4-c `worklogOwner` 표식 되돌림 (Q7 가)
`git diff 03bdfa8 c434b98^ -- . ':!manifest.yml'` 역적용(manifest 쪽은 패널 모듈째 삭제). 대조: c434b98(11파일)·03bdfa8(5파일) stat 과 일치.
`IssueLinkPropertyApi.js`(WORKLOG_OWNER·worklogOwner 인자, 헤더 주석의 패널 displayConditions 설명을 커스텀 필드로 정정), `ProjectLinkWriter.js`, `queue/consumer.js`, `IssueLinkBackfillService.js`(`ensureIssueLinkOwnerBackfillService`·`OWNER_BACKFILL_MARKER_KEY`·`force` 인자 — 다른 호출자 없음), `SettingController.js`(getSettingData ensure·updateSetting `linkMarkerSync`), 테스트 6개(`ProjectLinkWriter`·`IssueLinkPropertyApi`·`IssueLinkBackfillConsumer`·`KbMutationPublishing`·`ApprovalLinkMode`·`IssueLinkBackfillService`). 프론트에 `linkMarkerSync` 소비처 없음 확인.

### 테스트(신규·갱신)
- T-W1 `src/integration/approval/__test__/orgCap.test.js`(신규) — 설계 §3 케이스 1~15(15 는 시드 1~40 무작위 트리 대칭 전수: 사이클·미존재 부모·레거시 겸임·소속 없음/없는 팀 포함)
- T-W2 `src/resolver/approvalLink/__test__/ApprovalLinkSignals.test.js` — 팀장 PUT 본문(asUser), 같은 팀 PUT 0, epoch 변경 재평가, epoch 읽기 실패, 로드 실패 보존·memo 미기록, 501명 FAILED·로그·PUT 0·memo, 기본 로더(S(me)로 1회 호출 `['team-g','team-m']`·팀원 0회·users 행 없음·인덱스 잘림)
- T-W3 `src/resolver/backoffice/permission/__test__/PermissionControllerOrgCap.test.js`(신규)
- T-W4 `TeamService.test.js`(5경로 성공 1회·실패 4경로 0회·빈 배치 0회), `TeamLeadership.test.js`(정리·백필), `UpdateUserMerge.test.js`(팀 이동 1회·직무만 0·영향 0행 0), `UserDeleteCascade.test.js`
- T-W5 `ApprovalLinkMode.test.js` — manifest 에 `jira:issueActivity`·`jira:issueContext`·`issue-panel`·`build-panel` 없음
- T-W6 위 R4 표

## 2. `movesRms.org` 본문 예시 (`buildOrgTeam` → `orgCapPlan` 실제 출력)

팀 구조: 개발본부(`team-dev`, 팀장 acc-director) ⊃ 플랫폼팀(`team-platform`, 팀장 acc-tomkim, 팀원 acc-p1·acc-p2), QA팀(`team-qa`, **팀장 없음**, 팀원 acc-q1). 서명 봉투 바깥(`v/typ/iss/cloud/ent/kid/iat/sig`)은 종전과 같아 생략.

팀장(acc-tomkim) — 결재자 = 상위 팀장, 이끄는 팀원:
```json
{ "teamKey": "team-platform", "teamName": "플랫폼팀", "leaderKeys": ["acc-director"],
  "leads": [{ "teamKey": "team-platform", "teamName": "플랫폼팀", "memberKeys": ["acc-p1", "acc-p2"] }],
  "cap": ["wlorigin"], "rev": 1760000000000 }
```
일반 팀원(acc-p1):
```json
{ "teamKey": "team-platform", "teamName": "플랫폼팀", "leaderKeys": ["acc-tomkim"], "leads": [], "cap": ["wlorigin"], "rev": 1760000000000 }
```
팀장 없는 팀의 팀원(acc-q1) — 가장 가까운 조상 팀장(Q3 나):
```json
{ "teamKey": "team-qa", "teamName": "QA팀", "leaderKeys": ["acc-director"], "leads": [], "cap": ["wlorigin"], "rev": 1760000000000 }
```
최상위 팀장(acc-director) — 결재자 없음(본인 결재), memberKeys 에 하위 팀장(Q4)·팀장 없는 하위 팀 팀원 포함:
```json
{ "teamKey": "team-dev", "teamName": "개발본부", "leaderKeys": [],
  "leads": [{ "teamKey": "team-dev", "teamName": "개발본부", "memberKeys": ["acc-q1", "acc-tomkim"] }],
  "cap": ["wlorigin"], "rev": 1760000000000 }
```

## 3. 검증 결과

| 항목 | 명령 | 결과 |
|---|---|---|
| 백엔드 jest | `npx jest --runInBand`(루트) | **177 suites / 2,491 tests 통과** |
| 프론트 jest | `static/ui` 에서 `npx jest --runInBand` | **167 suites / 2,640 tests 통과** |
| 프론트 빌드 | `CI=true npm run build:app && npm run bundle:check` | **통과**. 경고는 기존 node_modules source map 3건(`@atlaskit/analytics-next-stable-react-context`, `marklassian`)뿐. main gzip 494,264B ≤ 950,000B 예산 |
| manifest | `forge lint` | `No issues found.` (경고: `PermissionLinter ... "Unknown product"` — 기존부터 나는 린터 내부 경고) |

빌드를 `npm run build` 가 아니라 `build:app` + `bundle:check` 로 돌린 이유: `prebuild` 가 `npm run merge` 로 `locales/ko-KR.json`·`en-US.json` 을 다시 쓴다(사용자 수정 중이라 금지). `build` 스크립트 체인 자체는 `build:app && bundle:check` 두 단계로 같다. 빌드 산출물은 `static/ui/build` 에 덮어써졌다(터널이 이 경로를 서빙한다면 이번 코드가 보인다).

## 4. 설계와 다르게 한 점

1. **`leadingTeamKeyOf` 위치** — 순수 판정인데 `TeamLeadership.js`(KVS·SQL import)에 있어 `orgCap.js`(순수)가 쓰려면 KVS 의존이 끌려온다. `TeamTree.js` 로 옮기고 `TeamLeadership` 은 재수출(미추적 `LeaderTeamBackfill.test.js` 의 import 경로 유지).
2. **`memberTeamsOf` 계산법** — "내 팀 + 팀장 없는 팀만 거쳐 닿는 하위 팀"을 하향 탐색 대신 "모든 팀 중 `nearestAncestorWith(팀장 있음)` 결과가 me 인 팀"으로 계산. 같은 집합이고 `approverOf` 와 같은 함수(`pathOf` 기반)를 써서 깊이 10 초과·사이클에서도 대칭이 구조적으로 보장된다. `buildOrgTeam` 은 memberRows 각 행을 `approverOf(row) === me` 로 다시 거른다(SQL 결과를 그대로 믿지 않음).
3. **users 행이 없는 사용자** — 설계는 `userTeamKey:null` 로 `buildOrgTeam` 에 넘기라고 했으나, 그대로면 남은 팀장 참조(삭제 전 데이터)만으로 `leads` 가 게시된다. `PrincipalResolver`(users 행 없으면 leadingTeamKeys=[])와 같게 팀 칸 전체를 비운다. 이때 그 팀 팀원 문서의 `leaderKeys` 는 그 계정을 가리킬 수 있다(대칭 어긋남, 축소 쪽).
4. **`team === undefined` 시 memo** — 로드 "실패"뿐 아니라 팀 인덱스 잘림(`truncated`)도 같은 경로(보존·memo 미기록). 설계 의도와 동일.
5. **ORG_INVALID 로그** — accountId 대신 개수만 `{leaderKeys, leads, memberKeys}`.
6. **epoch bump 위치 보충** — `addUserService` 는 "teamKey 지정 시", `updateUserService` 는 UPDATE 영향 행 확인 뒤(0행이면 bump 없음), `deleteByUserIdService` 는 `users` 삭제 뒤(설계 표의 471행 = 첫 단계 뒤가 아니라 마지막 단계 뒤 — 중간 실패 시 bump 하지 않게). `clearTeamLeadershipOfUser` 는 자체로도 bump 하므로 팀장 삭제 시 2회(무해).
7. 패널 삭제로 **사용처가 0이 된 공용 모듈은 남겼다**(설계 표에 없음): `static/ui/src/components/worklog/useWorklogWrite.js`, `static/ui/src/utils/effort.js`(+ 그 테스트). 패널 전용 i18n 키(`issuePanel.*`)도 지시대로 남김 — 단 `approvalHandoff.js` 의 `APPROVAL_CREATE_ERROR_KEY` 는 여전히 `issuePanel.approval.*` 키를 쓴다(WorklogModal 사용, 삭제 금지).
8. `check-bundle-budget.js` 의 `--dir` 옵션·주석 예시(`build-panel`)는 범용 옵션이라 그대로 둠.

## 5. 미검증

| # | 항목 | 확인 방법 |
|---|---|---|
| U1 | 실사이트에서 Tom Kim(팀장)이 워크포스를 열면 본인 `movesRms.org` 에 leads 가 실리는지 | 배포/터널 재시작 뒤 앱 열기 → REST `GET /rest/api/3/user/properties/movesRms.org?accountId=…` |
| U2 | 개발 사이트 팀 데이터의 `team_key` 가 계약 정규식(`^[A-Za-z0-9:_-]{1,64}$`)을 만족하는지 — 신규 팀은 `team-<uuid>`(41자)라 통과, 레거시 키가 다르면 ORG_INVALID 로그로 드러남 | `forge logs` 에 `[APPROVAL LINK] org body invalid` 유무 |
| U3 | manifest 모듈 삭제 배포가 major 를 요구하지 않는지, 이슈 화면에서 패널이 바로 사라지는지(설계 V4) | `forge deploy` 출력 + ARS-14 화면. **manifest 를 바꿨으므로 터널 재시작 필요** |
| U4 | 승인 앱이 5분 캐시 안에 갱신 본문을 받는지(설계 V2), 팀 구조 변경 뒤 A·B 문서 재게시 시차(V7) | 설계 §10 방법 그대로 |
| U5 | 큐 기반 엑셀 사용자 업로드(`queue/consumer.js` 경로)로 팀이 바뀌는 경우는 epoch bump 대상에 넣지 않았다(설계 표 밖). 6시간 memo 만료 뒤 반영 | 필요하면 후속 |
| U6 | 테스트 환경에서 bump 를 mock 하지 않은 기존 테스트(미추적 `LeaderTeamBackfill.test.js` 등)는 실제 `@forge/kvs` 호출 실패를 경고 로그로 삼킨다 — 통과에는 영향 없음 | — |
