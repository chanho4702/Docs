# RFC-147 팀 개념 도입 — 남은 작업 인계서

작성: 2026-07-29 · 갱신: 2026-08-03 (N3-1 · InfoTip · P3-B 구현, N3-2 보류 확정)

이 문서만 읽고 바로 착수할 수 있도록 **경로·계약·함정**을 함께 적었다.
설계 근거는 `01_architect_design.md`, 이전 회차 결정은 `03_verify_report.md`·`05_fable_review_p2.md` 참조.

---

## 0. 현재 상태 (한눈에)

| 단계 | 상태 |
|---|---|
| P0 팀 마스터 + 소속 | ✅ 배포됨 |
| P1 권한 확장 (`TEAM_ONLY`·팀 상속·팀장) | ✅ 배포됨 |
| P2-a/b/c | ✅ 구현·검증 완료 |
| 완수율 소계 + 팀 이슈 건수 복원 | ✅ 완료 (`8759360`) |
| `/resource` 조직 현황 탭 | ✅ 완료 (`289c031` + UI 재구성 `d6f952e`) |
| **P3-A 백엔드 4항목 + N3-3 + N3-4** | ✅ 완료 (`d8b127a`) |
| **N3-1 인력 분석 리포트 인별↔팀별** | ✅ 완료 (2026-08-03, 커밋 전) |
| **InfoTip (N3-1·N3-3·N3-4)** | ✅ 완료 (2026-08-03, 커밋 전) |
| **N3-2 인력 탭 팀 그룹** | 🚫 **보류(deferred)** — §3 참조 |
| **P3-B 팀 트리 DnD** | ✅ 완료 (2026-08-03, 커밋 전) |

테스트: 백엔드 **708** / 프론트 **614** 통과 (착수 시 361/279, 2026-08-03 회차 +46)

### 2026-08-03 외부 검수 (codex `gpt-5.6-sol`, read-only) — 5건 지적, 4건 수정

| # | 지적 | 처리 |
|---|---|---|
| 1 | 🔴 `scripts/demo-seed/config.local.json` 에 **Atlassian API 토큰 8개가 평문**(192자 `ATATT` 형식). `.gitignore` 로 가려져 `git status` 에도 안 뜬다 | **이번 작업 범위 밖 · 미조치.** 커밋되진 않지만 로컬 평문이다. 토큰 폐기·재발급 판단 필요 |
| 2 | `invoke()` 실패가 `{success:false}` 로 조용히 resolve → 인원 조회 실패는 "데이터 없음", 분석 조회 실패는 `?? 0` 을 타 **"가동률 0%인 팀"** | ✅ 두 쿼리에서 throw + 에러 배너. **팀 뷰는 분석 실패 시 표 자체를 그리지 않는다** |
| 3 | 500명 초과 프로젝트에서 팀 모드로 들어갔다 되돌려지는 **한 프레임** 동안 `getUser` 500건(5명씩 100라운드)이 시작 | ✅ `USER_MAP_MAX=100` 상한. 넘으면 아바타 없이 accountId 폴백 |
| 4 | 강등된 팀(손상 부모)을 최상위로 옮기는 **정리 이동을 프론트만 막음** — 서버는 KVS 원본과 비교해 허용한다. **테스트가 이 오동작을 정답으로 고정** | ✅ 무변화 판정을 `rawParentTeamKey`(원본) 기준으로. 테스트 기대 반전 + 케이스 4개 추가 |
| 5 | 팀 표 `rowsPerPage={50}` — 팀이 51개 넘으면 표 안에서 다시 페이징 | ✅ `rows.length \|\| 1` |

검수가 확인해 준 것: 롤업 단일 출처 · 가중 가동률 · `issueCount` 컬럼 없음 · DnD 옵트인 8개 주장 전부 ·
`OrganizationTab` 무오염 · i18n kr/en 대칭.

> ⚠ **프론트 테스트는 반드시 `cd static/ui && npm test`.**
> `npx react-scripts test` 는 `moduleNameMapper` 를 타지 않아 `@forge/bridge` 를 import 하는
> 스위트(`workListQuery.test.js` 등)가 **오탐 실패**한다. 이번 회차에 실제로 한 번 속았다.

---

## 1. 🚨 먼저 할 일 — 배포 (개발보다 우선)

**미배포 커밋 4건이 쌓여 있다.** 여기에 N3-1/N3-2 를 더 얹으면 문제 발생 시 원인 구간이 넓어진다.

```
d8b127a  P3-A 프로젝트별 팀 심화 분석 — 팀 비용 분해 + 대시보드 팀 위젯
d6f952e  조직 현황 UI 를 팀 관리 골격으로 재구성
289c031  자원관리 조직 현황 탭 신설
8759360  팀 소계 완수율 가중 복원 + 팀 이슈 건수 중복 제거
```

### 배포 체크리스트

1. **서버·프론트를 같은 배포로** 내보낸다.
   - 서버만 → 프론트 `?? 0` 폴백 8곳이 **"₩0" 을 상시 노출**(지금보다 나쁨)
   - 프론트만 → `costMasked` 를 `!== false`(fail-close)로 판정하므로 구버전 서버 응답엔 필드가 없어
     **`PROJECT_COST` 보유자도 인건비를 못 본다**
2. **롤백도 동시에.** 서버만 롤백하면 게이트가 열린 채 급여가 다시 흐른다.
3. **배포 공지**
   - `REPORT read` 는 있고 `PROJECT_COST read` 가 없는 사용자
     (**시드 Member · Team Lead/Member 프리셋 = 일반 사용자 대다수**)가 전사 인건비를 못 보게 된다.
     Admin·PM·PMO 는 영향 없음. **화면 전체가 아니라 인건비 축만** 사라진다.
   - `TEAM_MANAGEMENT` 에 `migrateFrom` 미지정 → 기존 **커스텀 권한 세트** 보유자는
     권한 관리 페이지에서 **세트별로 켜야** 팀 메뉴가 보인다.
4. **배포 직후 10분간 비용 탭 팀 축은 "집계 전"으로 뜬다** — 정상이다(§3 N3-3 참조).
5. `forge deploy` 시 Node 22.22.0 사용 (v24/22.23 은 "Premature close" 버그).

### E2E

**P0 이후 한 번도 수행되지 않았다.** `E2E_CHECKLIST.md` 사용.
배포 검증이 필요한 항목이 특히 많다(아바타 `image://` CSP, `-26w` JQL, Forge 커스텀필드 인덱스 지연 등).

---

## 2. N3-1 — 인력 분석 리포트 인별↔팀별 토글 ✅ 완료 (2026-08-03)

**구현된 것** (프론트 전용, 백엔드 변경 0 — 아래 원래 계획대로):

| 파일 | 내용 |
|---|---|
| `resourceTeamFields.js` (신설) | 합산 가능/불가 필드 분류 상수 + `teamRollupOptions(t)`. `issueCount`·`holidayDays`·`leaveDays`·`utilization` 이 비가산 |
| `ResourceAnalysisTeamTable.jsx` (신설) | 팀 소계 표. `aggregateByTeam` 단일 출처, 가동률은 `Σ totalMd / Σ effectiveMmDays` 가중 |
| `ResourceAnalysisPage.jsx` | `ViewModeToggle` + 팀 모드 전량 조회(`isFullFetch`) + 페이지네이션 숨김 |
| `ResourceAnalysisTable.jsx` | `MdBar` 를 `export` — 색 밴드 단일 출처(팀 표가 재사용) |
| `__test__/resourceTeamFields.test.js` (신설) | 20 케이스 — 분류 불변식·가중 vs 산술평균·이슈 수 중복 증명·팀 미소속 처리 |

**설계와 달라진 점 / 추가로 판단한 것:**

- **`issueCount` 컬럼을 아예 두지 않았다.** 서버가 사람별로 세므로 팀 합계가 중복된다.
  항상 `-` 인 컬럼은 "왜 비었지?"만 남기므로 컬럼을 빼고 표 아래에서 이유를 밝힌다
  (`myPage` 의 `projectCount` 와 같은 처리).
- **팀 모드에서 `userMap` 조회를 끈다.** 이 쿼리는 5명씩 **순차** 배치라 전량 조회(최대 500명)와
  만나면 100 라운드가 직렬로 돈다. 팀 표는 아바타를 쓰지 않으므로 전부 낭비다.
- **500명 상한 초과 시 팀 모드를 인별로 되돌린다.** 상한은 조회 후에야 밝혀지므로
  렌더 가드(`isTeamView`) + `useEffect` 로 state 복귀를 **둘 다** 둔다(한 프레임의 잘린 소계도 막는다).
  기존 `team.analysis.tooManyMembers` 문구를 "팀 필터와 팀별 보기"로 확장했다.

---

## 2-old. N3-1 원래 계획 (참고용)

**대상**: `static/ui/src/pages/projectDetail/analysisReport/resource/`
- `ResourceAnalysisPage.jsx` (뷰 전환·조회 파라미터)
- `ResourceAnalysisTable.jsx` / `ResourceAnalysisChart.jsx` (렌더)

**백엔드 변경 없음.** 설계서 P3-A 체크리스트: `getResourceAnalysisList` **변경 금지**
— 프론트가 이미 행에 팀 정보를 갖고 있다(P2-a 에서 `teamKey`/`teamName` 을 실었다). 캐시 키 확장 불필요.

### 접근

1. 공용 `ViewModeToggle` 사용 — `static/ui/src/components/toggle/ViewModeToggle.jsx`
   ```jsx
   <ViewModeToggle viewMode={mode} onChange={setMode}
       items={[{mode:'member', label:...}, {mode:'team', label:...}]} />
   ```
   선례: `ProjectWorkPanel.jsx`(작업관리 [목록|트리|간트]), `MyWorklogPanel.jsx`
2. 팀 롤업은 **`utils/team/aggregateByTeam.js` 만** 쓴다 (새 롤업을 짜지 말 것 — 화면마다 숫자가 갈린다)
3. 팀 모드는 **`pagesize: 500` 전량 조회 + 페이지네이션 숨김**
   — 페이지 단위로 롤업하면 "1페이지의 팀 합계"라는 무의미한 값이 나온다
4. 가동률은 **`ΣtotalMd / ΣeffectiveMmDays` 재계산** (가중). 산술평균 금지

### 함정

- ⚠ **`avgFields` 는 3필드 스펙**(`{field, numerator, denominator}`)이라 **산술평균 옵션 자체가 없다.**
  분모가 행에 없으면 `withCompletionDenominator()` 처럼 **파생 필드를 먼저 만들어야** 한다
  (선례: `pages/myPage/sections/teamAnalysisFields.js`)
- ⚠ **합산하면 틀리는 필드**를 `sumFields` 에 넣지 말 것. 판정 기준은 "사람 간 겹치는가":
  이슈 건수·참여 프로젝트 수는 겹친다. `effortMd`·`investedMd`·`availMd` 는 안 겹친다
- ⚠ 팀 미소속(`teamKey: null`)을 **숨기지 말 것** — 숨기면 팀 소계 합이 전체 합과 달라져
  사용자가 숫자를 신뢰하지 않게 된다

---

## 3. N3-2 — 인력 탭 팀 그룹 (TreeTable) 🚫 **보류(deferred)**

**2026-08-03 결정 — 이 RFC 범위에서 뺀다.** 사용자 승인 + 외부 모델(codex `gpt-5.6-sol`) 교차 검토.
"완료"가 아니라 **의도적 보류**다. 재추진하려면 아래 전제부터 다시 세워야 한다.

### 왜 뺐나 — 아래 §3-old 스펙이 이 화면에서 성립하지 않는다

원래 스펙의 소계 컬럼은 `인원 · MM · 인건비` 인데 **뒤의 둘이 이 화면에 없다.**

| 항목 | 사실 | 근거 |
|---|---|---|
| 인건비 | 인력 탭 응답에 `salary` 가 **의도적으로 없다** | `ProjectUsersQuery.FIND_BY_PROJECT_ID` 가 SELECT 하지 않고, `ProjectUsersSalaryLeak.test.js` 가 회귀 테스트로 고정 |
| MM/공수 | 이 화면은 **워크로그를 조회하지 않는다** | `getResourceAnalysisList` 는 `startDate`/`endDate` 를 받아 별도 조회 후 `totalMd` 를 계산한다. 인력 탭엔 기간 입력 자체가 없다 |
| 페이징 | 서버 10행/페이지 | 그대로 그룹핑하면 "현재 페이지 10명의 팀 소계"라는 거짓 |
| 전량 조회 비용 | 🔴 **이 화면은 `Promise.all` 로 `getUser` 를 무제한 병렬 호출**한다(`ProjectUserPanel.jsx:89`) | 500명이면 동시 Jira 호출 500개. N3-1 쪽(5명씩 순차 배치)과 **다르다** |

→ 남는 신규 정보가 **"팀별 인원 수" 하나**인데, 인력 탭은 역할·레벨 편집과 인원 삭제가 주 기능인
**관리 화면**이고 팀 이름은 이미 컬럼으로 보인다. 구현·회귀 비용에 값하지 않는다.

### 인계서 §3-old 가 낡은 부분 (정정)

> "원본 행의 `salary`(투입급여)는 게이트 없이 계속 응답에 실린다(U10)"

**최신 코드 기준으로 틀렸다.** 이미 SELECT 에서 빠졌고 회귀 테스트가 지킨다. M4 비대칭은 해소됐다.

### 재추진한다면

- `pagesize:500` 이 아니라 **서버가 팀별 `memberCount` + paged children 을 주는 전용 계약**으로.
- MM 을 넣으려면 **기간 정의부터 확정**해야 한다(이 화면엔 기간 축이 없다).
- 인건비는 `getProjectSalaryList`(서버가 `PROJECT_COST detail` 로 보호) 별도 invoke 가 가능하지만,
  그 응답에는 합계가 아니라 `salary`·`annual_salary` **원자료**가 들어 있다.
  공용 query cache 나 자식 행에 흘리면 **새 노출면**이 된다.
- 계층까지 원하면 `getTeamOptions`(`depth`/`parentTeamKey` 제공, grant 에 `PROJECT read` 포함)를 병행 조회.
  단순 `팀 → 인원` 2단 그룹에는 불필요하다.

---

## 3-old. N3-2 원래 계획 (참고용 — 위 보류 사유와 함께 읽을 것)

**대상**: `static/ui/src/pages/projectDetail/user/ProjectUserPanel.jsx`

**백엔드 변경 없음.**

### 접근

1. `CommonTable`/`CursorPagingTable` 은 **그룹 헤더·접기를 지원하지 않는다**(리포 내 선례 0건).
   수동 구현은 신규 발명이라 배제 → **`@atlaskit/table-tree`** 사용.
   공용 래퍼가 이미 있다: `static/ui/src/components/table/TreeTable.jsx`
   ```jsx
   export const WorklogTableTree = ({ columns, items, headers, columnWidths }) => ...
   ```
   `items[].children` 로 네이티브 접기를 제공한다. 선례: `MyIssueTable`
2. **팀 = 부모(소계 행) / 인원 = 자식**
3. **기본은 평면 모드 유지**(무회귀). 토글로 팀 그룹 모드 진입
4. 소계 컬럼: 인원 · MM · **인건비**

### 함정

- 🔴 **인건비 소계는 `canRead('PROJECT_COST')` 일 때만 노출한다.**
  인력 탭은 `PROJECT` 권한으로 열리므로 무조건 노출하면 `PROJECT_COST` 분리가 무의미해진다.
- ⚠ **이 게이팅의 한계를 알고 갈 것 (M4)**: **원본 행의 `salary`(투입급여)는 게이트 없이 계속 응답에 실린다**
  (U10 — 기존 결함). 소계는 가리는데 원자료는 보이는 **비대칭이 남는다.**
  N3-2 가 이 결함을 만들지도, 해소하지도 못한다. 여기서 원본 `salary` 까지 마스킹하려 들면
  급여 관리 탭·배정 보드가 같은 응답을 소비해 **회귀면이 P3-A 범위를 넘는다.**

---

## 4. InfoTip ✅ 완료 (2026-08-03)

`team.analysis.currentMembershipNote` 신설 + **짧은 라벨** `team.analysis.membershipBasis`("현재 소속 기준").
아이콘만 두면 발견성이 없어 라벨과 함께 붙였다.

| 화면 | 위치 |
|---|---|
| N3-1 인력 분석 팀 뷰 | 팀 표 아래 note (표 하단이 더 잘 보인다 — InfoTip 대신 텍스트) |
| N3-3 비용 탭 | `CostByRoleLevel.jsx` 축 토글 우측, **`axis === 'team'` 일 때만**. role/level 은 `project_users` 에 그 프로젝트 시점 값이 박혀 있어 해당 없다 |
| N3-4 대시보드 팀 위젯 | `ChartTemplate.js` — `item.dataType === 'team'` 일 때 `EchartPanel` 의 `filter` 슬롯(팀 차트는 pie/bar/line 이라 필터가 비어 있다) |
| N3-2 | 보류(§3) |

---

## 4-old. InfoTip 원래 계획 (참고용)

`team.analysis.currentMembershipNote` 를 **N3-1·N3-2·N3-3·N3-4 전부**에 붙인다.

취지: 팀 분석은 **현재 소속** 기준이다. 과거에 다른 팀이었던 인원의 실적도 지금 팀에 잡힌다.
이걸 안 밝히면 "왜 우리 팀 실적이 이렇지?" 가 반복된다.

i18n 키가 아직 없으면 `locales/kr|en/team.json` 에 추가 후 `cd static/ui && npm run merge`.

---

## 5. P3-B — 팀 트리 드래그앤드롭 ✅ 완료 (2026-08-03)

**프론트 전용 · 백엔드 변경 0** (계획대로). **백오피스에서만 활성** — 사용자 결정.

| 파일 | 내용 |
|---|---|
| `resolveTeamTreeDrop.js` (신설) | 순수 판정 함수. `{allowed, reason, intent}` 반환. `DROP_BLOCKED` 6종 |
| `__test__/resolveTeamTreeDrop.test.js` (신설) | 23 케이스 — C1~C10 + 경계값 + 입력 방어 |
| `TeamTreePanel.jsx` | HTML5 native DnD. `canWrite`/`onDrop`/`canDrop` **옵트인 prop** |
| `TeamPage.jsx` | 판정 + `updateTeam` mutation(낙관 반영 + 롤백) + 이유별 토스트 |
| `locales/{kr,en}/team.json` | `tree.dndHint` · `tree.dropToRoot` · `tree.dropBlocked.{descendant,depth,unavailable}` |

### 지킨 것 (재발 방지)

1. **활성 조건은 `Boolean(canWrite && onDrop)`** — 하나만으로 켜면 `/resource` 조직 현황 탭
   (같은 패널 재사용)에서 실수로 활성화된다. 그쪽은 어느 prop 도 넘기지 않아 자동으로 읽기 전용이다.
2. **판정에 `filteredTeams` 가 아니라 원본 `teams`** 를 넘긴다. 검색·접힘이 적용된 목록으로
   판정하면 **숨은 후손을 놓쳐 순환을 허용**한다. 서버는 항상 전체 트리로 검사한다.
3. **`truncated` 이거나 `limits` 가 없으면 DnD 자체를 끈다** — 불완전한 트리로는 순환·깊이를
   신뢰성 있게 선판정할 수 없다. 편집 모달 Select 가 대체 경로로 남는다.
4. **`invoke()` 는 `{success:false}` 로도 정상 resolve** 한다 → `mutationFn` 에서 명시적으로 throw.
   안 그러면 `onError` 가 안 돌아 **낙관적 업데이트가 롤백되지 않는다**(화면만 옮겨진 채 남는다).
5. **막힌 대상에도 `preventDefault()`** 를 한다. 안 하면 `drop` 이벤트가 오지 않아
   "놓았는데 아무 일도 안 일어나는" 조용한 실패가 된다 — 이유를 말할 기회를 잃는다.
6. **깊이 판정은 서버와 같은 식**: `depth(target) + 1 + subtreeHeight(dragged) > maxDepth`.
   자기 깊이만 보면 자식이 넘친다. `maxDepth` 리터럴 없음(`limits` 에서만 읽는다 — M6).
7. hover 판정은 **대상이 바뀔 때만** 수행(`dragover` 는 같은 노드 위에서도 계속 발생한다).
8. `SELF`/`NO_CHANGE` 는 **토스트를 띄우지 않는다** — 실수이지 오류가 아니다. 연속 이동 중 잡음이 된다.

### 하지 않은 것

- **형제 순서 재정렬(before/after 삽입선)** — 범위 밖. 선례에도 "이 노드 안으로(into)" 만 있다.
- **`/resource` 조직 현황 탭 DnD** — 그건 UI 확장이 아니라 **자원관리자에게 조직 구조 변경 권한을
  주는 권한 정책 변경**이다(`updateTeam` 은 `TEAM_MANAGEMENT write` 전용). 별도 논의 대상.

---

## 5-old. P3-B 원래 계획 (참고용)

**프론트 전용 · 백엔드 변경 0.** 서버 가드(`TEAM_CYCLE_DETECTED`/`TEAM_DEPTH_EXCEEDED`)와
`updateTeam` 은 P0 에 이미 있고, `getTeamList` 응답의 `content.limits:{maxDepth, maxTeams}` 도 P0 에 넣어 뒀다.

**대상**: `static/ui/src/backoffice/page/team/TeamTreePanel.jsx`

### 접근

1. **신규 의존성 0.** 이미 프로덕션에 **동일 구조의 트리 DnD 선례**가 있다:
   `TreeStructurePanel.jsx` + 순수함수 `resolveTreeDrop.js` + 20케이스 테스트 —
   **라이브러리 없는 HTML5 native DnD**. 이걸 `resolveTeamTreeDrop.js` 로 복제한다.
2. 드롭 불가 **5규칙**: 자기 자신 / 순환 / 무변화 / 루트 무변화 / **깊이 + 서브트리 높이 초과**
3. **hover 시점 판정**으로 `dropEffect='none'` / `not-allowed` 시각 구분(선례를 이 부분만 확장)
4. **낙관적 업데이트 + `onMutate` 스냅샷 롤백** — 조직개편은 연속 이동이 사용 맥락이라 왕복 대기 불가
5. **모달 Select 는 유지한다** (생성 시 필수 + 접근성 대체 경로)
6. 프론트·백엔드 **C1~C10 정규 케이스표 대조 테스트**. 프론트 판정은 서버 규칙의 **부분집합**이어야 한다

### 함정

- ⚠ **깊이·개수 한계에 리터럴 상수를 두지 말 것.** `getTeamList.content.limits` 에서만 읽는다
  (M6 — 상수를 이중화하면 드리프트를 테스트가 못 잡는다)
- ⚠ **형제 순서 재정렬(before/after 삽입선)은 범위 밖.** 선례에도 "이 노드 안으로(into)" 하이라이트만 있다.
  나중에 필요해지면 `@atlaskit/pragmatic-drag-and-drop`(+`-hitbox`, `-react-drop-indicator`)을
  **`package.json` 에 명시적으로 승격**해 쓴다. 디스크에 이미 있지만 **phantom dependency 상태로 import 금지**
  (`react-kanban-kit` 이 버전을 올리거나 빠지면 깨진다)
- ⚠ 조직 현황 탭이 **같은 `TeamTreePanel` 을 재사용**한다. DnD 를 붙일 때
  `/resource` 쪽에서는 꺼야 한다(거기선 팀을 편집할 권한도 의도도 없다) — **prop 으로 옵트인**할 것

---

## 6. 이 회차에 배운 함정 (재발 방지)

| # | 함정 | 대응 |
|---|---|---|
| T1 | `react-scripts test` 는 `moduleNameMapper` 미적용 → `@forge/bridge` 스위트 **오탐 실패** | 프론트는 `cd static/ui && npm test` |
| T2 | `/resource` 에서 **`getTeamList`/`findTeamById` 사용 불가** — grant 가 `OR[TEAM_MANAGEMENT r, USER_MANAGEMENT r]` 라 `RESOURCE_MANAGEMENT` 만 가진 사용자에게 **항상 거부** | `getTeamOptions` 또는 `getResourceOverview.teamMeta` 사용 |
| T3 | `buildTeamTree` 는 **`teamKey` 없는 노드를 버린다** → 팀 미소속이 조직도에서 통째로 사라짐 | 센티널 키(`'__UNASSIGNED__'`) 부여 |
| T4 | 비용 응답은 **KVS 10분 캐시** — 배포 직후 `byTeam` 부재 | `?? []` 로 채우면 "팀 비용 0" 거짓 → **"집계 전"으로 구분**(`cost.roleLevel.notReady`) |
| T5 | **비율은 계층으로 더할 수 없다** | 분자·분모를 합산해 두고 `Σ/Σ` 재계산 (`rollupTeamTree`) |
| T6 | **직속(direct)/누적(total)을 분리 표기하지 않으면** 사용자가 표를 세로로 더해 보고 "합이 안 맞는다"고 판단 | 두 값을 함께 보여주고 헤더에 명시 |
| T7 | 사람 단위 이슈 카운트는 **참여자 each 에게 `+= 1`** → 팀으로 더하면 중복. 중복 제거엔 **이슈 동일성**이 필요한데 프론트엔 이슈가 없다 | 서버가 팀별 **이슈 합집합**으로 센다(`fetchAssignedLoadWithGroups`) |
| T8 | 청크(50명) 경계에서 같은 이슈가 두 청크에 잡힌다 | 병합은 **합산이 아니라 합집합** |
| T9 | `SkillTags` 에 개수 제한 prop 이 없다 — `max` 를 넘겨도 **조용히 무시** | 호출부에서 `.slice()` |
| T10 | 생성 로케일(`ko-KR.json`/`en-US.json`)이 여러 작업의 키를 함께 담아 **커밋 분리를 막는다** | 소스 로케일을 stash → 재병합 → 커밋 → 복원 → 재병합 |

---

## 7. 보류 중인 결함 (판단 완료 / 의도적 미수정)

| # | 내용 | 판단 |
|---|---|---|
| U13 | 캘린더 워크로그 다일 이벤트 UTC 파싱 → DST 시간대 1일 축소, **2곳 복제** | "-6MD 계열", 미수정 |
| U14 | `tabs.js` context 미전달 → 캘린더 드래그 이동 **조용한 실패** | 미수정 |
| U15 | 캘린더가 `projectKeys` 팩토리 미사용(인라인 키 5종) | 미수정 |
| U16 | 고아 위젯 2종(`PortfolioSalaryByProject`/`Histogram`) | 죽은 코드, 삭제 권고 |
| FE-P2c-4 | 포트폴리오 `?? 0` 폴백 8곳 — 게이팅으로 렌더는 막았으나 집계 함수는 여전히 0 생성 | 어댑터 층 도입 시 함께 |
| FE-P1-2 | 리더 겸임 시 팀 이름 (`userPermissionCheck.team` 에 `leadingTeams:[{teamKey,name}]` 1필드 추가 필요) | 경미 |
| FE-P2b-2 | 캘린더 하위 팀 전개 | 경미 |
| P1-N1 | 권한 세트 **로드 실패** 시 `mergeSetPages([])` 가 공휴일 read 를 연다 | **현행 유지 결정** — 노출면이 공휴일 조회 1건뿐, 고치면 KVS 장애 시 전 사용자 잠김 |
| — | `getResourceOverview` 가 `people[].salary` 를 `RESOURCE_MANAGEMENT read` 만으로 반환 (인건비 게이트 없음) | **이번 작업이 만든 것 아님.** U12/U10 과 같은 계열, 미처리 |
| — | 대시보드 팀 차트의 팀 미지정 라벨이 **영문 리터럴 `'Unassigned'`** | `UserService.mapCountWithMeta` 와 **같은 규약**이라 함께 고쳐야 함 |

---

## 8. 남은 일 (2026-08-03 기준)

**개발은 끝났다.** N3-2 를 뺀 RFC-147 전 범위가 구현·검증 완료다.

```
1. 커밋      ─ 2026-08-03 회차 변경분(N3-1 · InfoTip · P3-B)
2. 배포 (§1) ─ 누적 미배포 커밋 + 이번 회차. 체크리스트 그대로 유효
3. E2E       ─ P0 이후 한 번도 수행되지 않음. E2E_CHECKLIST.md
```

### 이번 회차 E2E 추가 항목

| 화면 | 확인할 것 |
|---|---|
| 인력 분석 리포트 | 팀별 토글 → 페이지네이션이 사라지는가 / 팀 소계 합 = 전체 합 / 500명 초과 프로젝트에서 토글이 숨는가 |
| 팀 관리 | 드래그로 상위 팀 변경 / 자기 후손 위에서 빨간 테두리 + `not-allowed` / 최상위 드롭존 / 깊이 초과 토스트 / **실패 시 화면이 원위치로 롤백되는가** |
| 조직 현황 탭 | **드래그가 되지 않아야 한다**(같은 패널 재사용 — 옵트인 확인) |
| 비용 탭 · 대시보드 | 팀 축에서만 "현재 소속 기준" ⓘ 가 뜨는가 |

**배포 가능 판정**: 변경은 전부 프론트다. 백엔드 응답 계약 변경 0, 새 resolver 0, 새 권한 키 0.
