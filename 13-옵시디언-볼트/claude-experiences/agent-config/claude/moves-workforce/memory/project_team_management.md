---
name: project-team-management
description: "팀(Team) 개념 도입 — P0(마스터·소속)+P1(권한) 완료·배포됨, P2/P3 대기 (2026-07-28)"
metadata: 
  node_type: memory
  type: project
  originSessionId: ee1f11af-29c0-4f86-bee4-7efaa54fbbb2
  modified: 2026-08-05T07:02:36.565Z
---

기존 사용자 단위 기능을 **팀 단위로 확장**. 작업 디렉토리 `_workspace/team-management/`.
**P0+P1 구현·검증·배포 완료 (2026-07-28). P2/P3 미착수.**

## 팀장/팀원 후보 원천 (2026-08-05 수정, 커밋 전·E2E 미수행)
후보 = **`users` 전량**(`getTeamUserCandidates`, 권한 `TEAM_MANAGEMENT|USER_MANAGEMENT read`).
이전엔 `searchRegisteredJiraUsers`(Jira `user/search` **maxResults 20** ∩ users, 권한 `PROJECT read`)라
① 상위 20 밖 인원이 사라지고 ② 팀 권한만 가진 관리자는 전량 거부 → **둘 다 화면상 "인원 없음"** 이었다.
교훈: **resolver 권한 축이 화면 축과 어긋나면 조용한 빈 목록**이 된다(프론트가 `success:false`를 `[]`로 흡수).

## 팀장 멤버십 규칙 (2026-08-05, 커밋 `039babf`)
"팀장이 자기 팀 소속이 아닌 게 말이 안 된다"는 지적에서 출발. **팀원은 두 원천에 걸쳐 있다** — 소속은 SQL `users.team_key`, 팀장은 KVS `team.leaderAccountId`.

🔴 **축마다 규칙이 다르다. 하나로 통일하려다 롤업을 깨뜨렸다(코덱스가 잡음).**
| 축 | 규칙 | 이유 |
|---|---|---|
| 팀원 목록 | 소속 ∪ 팀장 | 화면에 팀장이 보여야 한다 |
| 인원수(`countUsersByTeam`) | **1:1 분할** — 소속 없는 팀장만 리딩 팀으로 이동 | `descendantMemberCount` 로 트리 상위에 **합산**된다. 합집합으로 세면 소계가 조용히 부푼다 |
| 분석 축(`memberTeamMap`) | **1:1** — 소속 우선, 없을 때만 리딩 팀 | 1:1 규약이 깨지면 `Object.fromEntries` 에서 **조용히 덮여** 워크로그·MM 오집계 |
| 팀 삭제 영향도 | 순수 소속만(`includeLeader:false`) | 실제 해제가 `UPDATE ... WHERE team_key=?` 뿐 |

- 덧붙이는 팀장 행의 `team_key` 는 **요청한 팀으로 덮는다** — 소비 측이 그 값으로 그룹핑한다(안 덮으면 엉뚱한 팀에 집계)
- `users` 행 없는 팀장은 **제외**(stale `leaderAccountId` fail-close, PrincipalResolver 전제와 동일)
- 팀장 본인을 `leadingScopeAccountIds`/`teamScopeAccountIds` 에 포함 — 없으면 소비 측 재교집합에서 도로 빠진다(`MyTeamAnalysisService`)
- 캘린더 팀 축은 **별도 원천**(`findMemberTeamsByProjectsRepository`)이라 따로 보정해야 했다. 같은 개념이 여러 원천에 흩어져 있음에 주의

**권한 바닥값**: 개인/팀 상속 세트가 모두 없으면 팀장→`permission-TeamLead`, 팀 소속→`permission-TeamMember`. **상속이 기본값보다 우선**(소속 없는 팀장도 이끄는 팀에서 상속 탐색). 팀 컨텍스트가 없으면 종전대로 fail-close. 프리셋이 KVS 에 없으면 `allFalsePages()` 로 폴백 — `mergeSetPages([])` 는 `defaultForNew` 를 적용하므로 **"세트 없음"이 "권한 없음"이 아니다**(아래 P1-N1 과 같은 함정).

## 확정된 구조 결정 (재논의 불필요)
- **S1** 팀 마스터 = KVS `team` 엔티티 / 소속 = `users.team_key`(MySQL) / `project_team`(P2) — `skill` 선례와 동형
- **S2** 계층 롤업은 **앱 레벨 재귀**(마스터가 KVS라 SQL 재귀 불가), `TeamTreeCache` TTL 60초
- **S3** 권한 = **개인 오버라이드 → 팀 fallback** (합집합 아님 — 최소권한·감사 가능성)
- **S4** `TEAM_ONLY`을 `scopedProjectIds()` **내부에서 흡수** → 기존 소비자 6파일 무변경
- **S5** `project_team` ↔ `projectusers`는 **별개 축**, 자동 동기화 없음
- **S6** `portfolio_project_snapshot` 스키마 무변경 (팀은 프로젝트가 아닌 **인원**의 속성)
- 팀 구조: 단일 소속 + 계층(`parent_team_id`), 팀장 1명, 팀 이름 전역 유일, 삭제 시 하위는 조부모로 승격

## 단계
| 단계 | 내용 | 상태 |
|---|---|---|
| P0 | 팀 마스터 + 소속 (`/backoffice/team`, resolver 8종) | ✅ 배포됨 |
| P1 | 권한 확장 (`TEAM_ONLY`·팀 상속·팀장, 진입점 `/my-page`) | ✅ 배포됨 |
| **P2-a** | 프로젝트-팀 배정 + 인력관리 팀 필터·팀별 추가 + 가동률 2필드 | ✅ 구현·검증 완료 |
| **P2-b** | N7(`/my-page` 팀원 업무 분석) + N5(캘린더 팀 필터) | ✅ 구현·검증 완료 |
| **P2-c** | N6(대시보드 팀 비교 4축) + **U12**(포트폴리오 인건비 게이트) | ✅ 구현·검증 완료 |
| **P3-A** | 프로젝트별 팀 심화 분석 (백엔드 4 + N3-3·N3-4) | ✅ 구현·검증 완료 |
| **N3-1** 인력 분석 인별↔팀별 | ✅ 완료 (2026-08-03) |
| **InfoTip** (N3-1·N3-3·N3-4) | ✅ 완료 (2026-08-03) |
| **N3-2** 인력 탭 TreeTable | 🚫 **보류 확정** — 아래 사유 |
| **P3-B** 팀 트리 DnD | ✅ 완료 (2026-08-03, 백오피스 전용) |

**RFC-147 개발 종료 (2026-08-03).** 프론트 614 tests 통과·빌드 통과. **커밋은 사용자가 직접 수행.** 배포·E2E 미수행.
후속 작업 = [[project-team-analytics]]

### N3-2 보류 사유 (재추진 시 전제부터 다시)
인계서 스펙의 소계 컬럼 `인원·MM·인건비` 중 **뒤의 둘이 이 화면에 없다**:
- `salary` 는 `FIND_BY_PROJECT_ID` 가 **의도적으로 SELECT 제외**(`ProjectUsersSalaryLeak.test.js` 가 회귀 가드)
- MM/공수는 워크로그 조회가 필요한데 인력 탭엔 기간 축 자체가 없다
- 🔴 이 화면은 `Promise.all` 로 `getUser` 를 **무제한 병렬** 호출 → 전량 조회 시 500명 = 동시 요청 500개
- 인계서 §3 의 "원본 salary 가 계속 실린다(M4 비대칭)"는 **낡은 서술** — 이미 해소됨

### P3-B 구현 시 지킨 것
`Boolean(canWrite && onDrop)` 옵트인(공유 패널) · 판정은 **필터 전 전체 `teams`**(가시 `rows` 아님) · `truncated`/`limits` 없으면 DnD 비활성 · **`mutationFn` 에서 `success!==true` throw**(안 하면 낙관적 롤백이 안 돈다) · 막힌 대상에도 `preventDefault`(안 하면 drop 이벤트가 안 와 조용한 실패) · 무변화 판정은 **`rawParentTeamKey`**(강등된 팀의 손상 부모 정리를 서버와 같이 허용)

테스트: **백엔드 708 / 프론트 568 통과** (착수 시 361/279). ⚠ 프론트는 반드시 `cd static/ui && npm test` — `react-scripts test` 는 moduleNameMapper 를 안 타 `@forge/bridge` 스위트가 **오탐 실패**한다

## 🚨 P2-c 배포 체크리스트 (반드시 지킬 것)

1. **`git add src/permission/CostAccess.js`** — 미커밋이면 HEAD 가 없는 모듈을 import 해 **clean checkout 시 전 resolver 로드 실패**. 실제로 한 번 발생했다. 커밋 후 `git cat-file -e HEAD:src/permission/CostAccess.js` 로 검증
2. **서버·프론트 같은 배포** — 서버만 나가면 프론트 `?? 0` 폴백 8곳이 **"₩0" 을 상시 노출**(지금보다 나쁨)
3. **프론트 선행 배포 금지** — `costMasked` 판정을 `!== false`(fail-close)로 바꿔서, 구버전 서버 응답엔 필드가 없어 `PROJECT_COST` 보유자도 인건비를 못 본다
4. **롤백도 동시에** — 서버만 롤백하면 게이트가 열린 채 급여가 다시 흐른다
5. **배포 공지**: `REPORT read` 는 있고 `PROJECT_COST read` 가 없는 사용자(**시드 Member·Team Lead/Member 프리셋 = 일반 사용자 대다수**)가 전사 인건비를 못 보게 된다. Admin·PM·PMO 는 영향 없음. **화면 전체가 아니라 인건비 축만** 사라진다

## 다음 작업 순서 (사용자 승인 2026-07-28)
1. ~~**완수율 소계 + 팀 이슈 건수 복원**~~ ✅ **구현·검증 완료 (2026-07-28, 커밋 전)**
   - 완수율: 서버가 `spentSeconds`/`remainingSeconds` 2필드 추가 → 프론트 `withCompletionDenominator()` 로 분모 파생 후 `WEIGHTED_AVG_FIELDS` 가중. 두 값은 이미 `participantCount` 로 나뉘어 담기므로 사람 간 가산적이라 Σ 성립. **추가 조회 0**
   - 이슈 건수: `fetchAssignedLoadWithGroups(accountIds, groupOf)` 신설 — 기존 배치의 **계상 지점에서 이슈 id 를 그룹별로 수집**해 합집합(`Map<groupKey, Map<issueId, cat>>`)으로 센다. **추가 Jira 조회 0**. 응답 `content.teamLoad[]`, 프론트는 `mergeTeamLoad()` 로 **붙이기만** 한다(롤업 출처는 여전히 `aggregateByTeam` 하나)
   - ⚠ **청크 경계** — 팀원이 50명 청크로 갈리면 같은 이슈가 두 청크에서 모두 잡힌다. 병합이 **합산이 아니라 합집합**이어야 한다(테스트로 가드)
   - 완수율은 `hasWeightedMetrics` 로 게이팅하지 **않는다** — 그건 rollup 배치 상태이고 완수율 원천은 Jira 실시간 배치라 다른 출처다
   - `projectCount` 는 여전히 소계 없음(중복 제거 원천 부재)
   - 커밋 `8759360`
2. ~~**`/resource` 조직 현황 탭**~~ ✅ **구현·검증 완료 (2026-07-28, 커밋 전)** — 상세는 [[project-resource-management]]
   - **범위 = 전사 조직도** (사용자 결정). 근거: `TEAM_ONLY`는 `scopedProjectIds()`가 흡수하는 **프로젝트 축**이지 인원 축이 아니고, 옆 탭 인력현황이 이미 전사 인원을 보여줘 좁히면 같은 페이지에서 모순. 인원 축 스코프 신설은 D4 사고가 났던 축
   - 게이트는 페이지 레벨 `RESOURCE_MANAGEMENT` read 하나. 새 권한 키 없음
3. **P3** — P3-A 백엔드 + N3-3·N3-4 완료(커밋 `d8b127a`), **N3-1·N3-2·InfoTip·P3-B 남음**

📄 **인계서: `_workspace/team-management/06_remaining_work.md`** — 배포 체크리스트·N3-1/N3-2/InfoTip/P3-B 착수 가이드·함정 10종·보류 결함 표. 다음 세션은 이걸 먼저 읽을 것 (2026-07-29 작성)

## P3 진행 현황 (2026-07-28 시점)

### ✅ P3-A 백엔드 4항목 — 완료 (신규 resolver 0, 계산 로직 신규 0)
| 항목 | 파일 |
|---|---|
| `MEMBER_ROWS` 에 `u.team_key` SELECT | `rdb/query/PortfolioSnapshotQuery.js` |
| `resolveMemberSalaries` 반환에 `teamKey` | `projectCost/EffectiveSalary.js` — **환산식 불변**(포트폴리오 스냅샷·급여탭 공유) |
| `byTeam` = `groupCostByKey(members, rate, 'teamKey')` | `projectCost/ProjectCostService.js` — 함수 무변경 재사용 |
| 대시보드 `case 'team'` + `getTeamChartData` + `groupByTeamRepository` | `projectDashboard/ProjectDashboardService.js`, `projectIssue/ProjectUsersRepository.js` |

- ⚠ `PortfolioAggregator` 는 `members` 를 **필드별로 직접 조립**하므로 KVS 스냅샷이 커지지 않는다(S6 스키마 무변경 유지). `resolveMemberSalaries` 소비자는 `ProjectCostService` 뿐
- ⚠ **비용 응답은 KVS 10분 캐시** — 배포 직후 `byTeam` 없는 페이로드가 남는다. `?? []` 로 채우면 "팀 비용 0" 거짓 → **"집계 전"으로 구분**(`cost.roleLevel.notReady`)
- 팀별 인원 수는 `users` 조인 필요(`team_key` 는 `projectusers` 에 없다). 팀 미지정은 `IFNULL(...,'NONE')` → `'Unassigned'` — `UserQuery.TEAM_COUNT`/`mapCountWithMeta` 와 같은 규약. **[한계] 영문 리터럴이라 한국어 UI 에도 "Unassigned"** — 고치려면 `mapCountWithMeta` 와 함께

### ✅ N3-4 대시보드 팀 위젯 / ✅ N3-3 비용 탭 3-way — 완료
- `constants/dashboardTypes.js` `DATA_TYPES` 에 `team` 추가. **설계서가 말한 `ChartTemplate` 날짜 필터 분기는 실제로 없다** — 등재만으로 모달이 자동 인식
- `CostByRoleLevel.jsx` role/level → **team 3-way**(복제 없이 같은 렌더 경로). 팀 메타는 `useTeamOptions({enabled: axis==='team'})` 지연 로드, `{value,label}` 규약(role/level 은 `{id,name}`)

### ⬜ 남은 작업
| 항목 | 내용 |
|---|---|
| **N3-1** | 인력 분석 리포트 — `ViewModeToggle` 인별↔팀별, 팀 모드는 `pagesize:500` 전량 + 페이지네이션 숨김, 가동률 `ΣtotalMd/ΣeffectiveMmDays` 재계산 |
| **N3-2** | 인력 탭 — `TreeTable`(`@atlaskit/table-tree`, `MyIssueTable` 선례) 팀=부모/인원=자식 그룹 토글. **인건비 컬럼은 `canRead('PROJECT_COST')` 일 때만**. 기본은 평면 유지(무회귀) |
| InfoTip | 4개 화면 전부에 `team.analysis.currentMembershipNote` |
| **P3-B** | 팀 트리 DnD — `resolveTeamTreeDrop.js` 순수함수(5규칙) + C1~C10 케이스표, **프론트 전용·백엔드 변경 0**, 낙관적 업데이트 + `onMutate` 롤백. 선례: `TreeStructurePanel.jsx` + `resolveTreeDrop.js`(라이브러리 없는 HTML5 native) |

의도적 제외: 이슈 분석 리포트의 팀 축.

## 미처리 결함 (판단 완료 / 보류)
| # | 내용 | 판단 |
|---|---|---|
| U13 | 캘린더 워크로그 다일 이벤트 UTC 파싱 → DST 시간대 1일 축소, 2곳 복제 | "-6MD 계열", 미수정 |
| U14 | `tabs.js` context 미전달 → 캘린더 드래그 이동 **조용한 실패** | 미수정 |
| U15 | 캘린더가 `projectKeys` 팩토리 미사용(인라인 키 5종) | 미수정 |
| U16 | 고아 위젯 2종(`PortfolioSalaryByProject`/`Histogram`) 삭제 권고 | 게이팅 대상 아님(죽은 코드) |
| FE-P2c-4 | 포트폴리오 `?? 0` 폴백 8곳 — 게이팅으로 렌더는 막았으나 집계 함수는 여전히 0 생성. **새 소비자가 생기면 위험** | 어댑터 층 도입 시 함께 |
| FE-P1-2 | 리더 겸임 시 팀 이름(백엔드 `leadingTeams` 1필드) | 경미 |
| FE-P2b-2 | 캘린더 하위 팀 전개 | 경미 |
| P1-N1 | 권한 세트 로드 실패 시 공휴일 read 열림 | **현행 유지 결정**(노출면 1건, 고치면 KVS 장애 시 전체 잠김) |

## 이번 회차에 잡은 중대 결함 (재발 방지)
- **KVS 빈 문자열 거부** — [[reference-forge-kvs-empty-string]] 참조. 설계서 U3 가정이 정반대로 틀렸고 **테스트가 그 오류를 고정**하고 있었다
- **D4 권한 상승** — 설계서 §R3이 자기모순(“scopeTeamKeys를 write에 쓰면 과대”라면서 예시 코드는 그걸 사용). 그대로 구현했으면 **자기 팀 동료(리더 아님)에게 write가 열렸다.** `leadingScopeAccountIds` 분리로 해결
- **O1 유령 write 표면** — `removeProjectMemberByAccount` 팀장 축은 **UI 경로 0인데 direct invoke로만 도달 가능**했고, 팀장 축 4키 중 **유일한 비가역 쓰기**였다(`projectusers.salary` 소실 → 비용·가동률 파생 지표까지 흔듦). **P2로 연기**(프로젝트 축을 P1에서 좁힐 방법이 공허함)
- **O4 미리보기 fail-open** — 프론트 상속 미리보기가 사이클 노드에서 백엔드보다 넓게 판정 → “상속받는다”고 표시하고 실제로는 전 권한 상실

## 다음 설계 대상 (사용자 요청 2026-07-28, 현재 작업 마무리 후 착수)
- **`/resource` 에 "조직 현황" 탭 신설** — 현재 [인력현황 | 프로젝트배정] → [인력현황 | **조직현황** | 프로젝트배정]
- P3의 "프로젝트별 팀 분석"과 **다른 것**이다. P3는 프로젝트 안에서의 팀 기여, 이건 **전사 조직 관점**(팀 계층 + 팀별 인원·가동률·스킬 분포 등). 범위 확정은 설계 단계에서.

## P2 착수 전 확인할 것
- `getTeamList` 응답을 소비하는 **새 계산 코드가 생기면 정규화 함정이 반복**된다. P2에서 분석 화면이 새 소비부가 되므로 **어댑터 층(수신 즉시 1회 정규화)** 도입 적기
- O1을 P2에서 열려면 **`project_team` + 프로젝트 축 검증 + `/my-page` 버튼**을 한 세트로. 셋 중 하나만 빠져도 “못 쓰거나 위험한” 상태로 되돌아간다
- FE-P1-2: 리더 겸임 시 팀 이름 표시 → `userPermissionCheck.team`에 `leadingTeams:[{teamKey,name}]` 1필드 추가 필요

## 미처리 (판단 완료, 의도적 보류)
- **P1-N1** 권한 세트 **로드 실패** 시 `mergeSetPages([])`가 공휴일 read를 연다. 노출면이 **공휴일 조회 1건뿐**으로 실측돼 **현행 유지** 결정(고치면 KVS 장애 때 전 사용자가 잠김)
- `TEAM_MANAGEMENT`에 `migrateFrom` 미지정 → 기존 커스텀 권한 세트 보유자는 **권한 관리 페이지에서 세트별로 켜야** 팀 메뉴가 보인다(운영 안내 필요)

관련: [[reference-forge-kvs-empty-string]] · [[feedback-test-fixes-wrong-assumption]] · [[project-permission-hardening]]
