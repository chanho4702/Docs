# 팀별 분석 확충 — 요구사항

작성: 2026-08-03 · 슬러그 `team-analytics` · 선행: RFC-147 팀 개념 도입(P0~P3 완료)

## 사용자 요구 (2026-08-03 확정)

"분석 메뉴나 통합 대시보드에 팀별 분석이 필요하다."

**범위 = A + B + C 전부** (사용자 선택):

| | 내용 | 답하는 질문 |
|---|---|---|
| **A** | **팀 전용 분석 화면** — 팀을 1급 축으로. 팀 선택 → 참여 프로젝트·기간별 공수 추이·인원 구성·비용·하위 팀 롤업 | "우리 팀 어떻게 돌아가나" |
| **B** | **통합 대시보드(`/dashboard`) 팀 위젯 확충** — 현재 팀 위젯이 `PortfolioTeamComparison` 하나뿐 | "전사에서 어느 팀이 문제인가" |
| **C** | **프로젝트 상세 > 분석 탭 그룹에 팀 하위 탭** | "이 프로젝트에서 어느 팀이 얼마나 했나" |

**주 사용자 = 경영진/PMO + 팀장 둘 다. 같은 화면에서 권한으로 보이는 팀 범위가 갈린다.**

---

## 🔴 이미 구현된 것 — **다시 설계하지 말 것**

새로 만들기 전에 아래를 먼저 읽고, **중복이면 확장·이동을 제안**하라. 같은 지표를 새로 계산하는 코드를 만들면 화면마다 숫자가 갈린다(이 리포에서 반복된 사고다).

| 위치 | 파일 | 내용 |
|---|---|---|
| `/dashboard` 팀 비교 위젯 (N6) | `pages/portfolio/widgets/PortfolioTeamComparison.jsx` + `pages/portfolio/utils/teamComparison.js` | 가동률·투입공수(MD)·완수율·인건비 **4축** 막대, TOP 10, `costMasked` 면 인건비 축 제거+MD 폴백 |
| `/resource` 조직 현황 탭 | `pages/resource/organization/OrganizationTab.jsx` | 팀 계층 트리 + 팀별 인원·가동률. `getResourceOverview` 의 `teamMeta`+`people` 로 **프론트에서 조립** |
| `/my-page` 내 팀 업무 분석 (N7) | `pages/myPage/sections/MyTeamAnalysisPanel.jsx` + `sections/teamAnalysisFields.js` | 팀 소계 + 팀원 상세. **팀장 전용**, `getMyTeamWorkAnalysis` |
| 프로젝트 상세 > 분석 > 인력 (N3-1) | `pages/projectDetail/analysisReport/resource/ResourceAnalysisTeamTable.jsx` + `resourceTeamFields.js` | 인별↔팀별 토글. 2026-08-03 추가 |
| 프로젝트 상세 > 분석 > 비용 (N3-3) | `pages/projectDetail/cost/CostByRoleLevel.jsx` | 역할/레벨/**팀** 3-way 축. 팀 축은 `data.byTeam` — **서버가 유일 출처** |
| 프로젝트 상세 > 대시보드 (N3-4) | `constants/dashboardTypes.js` `DATA_TYPES` 의 `team` | 팀별 인원 수 차트(pie/bar/line) |
| 백오피스 팀 관리 | `backoffice/page/team/` | 팀 마스터·소속·권한·트리 DnD |

---

## 🔴 반드시 재사용할 단일 출처

| 무엇 | 파일 | 규약 |
|---|---|---|
| **팀 롤업** | `utils/team/aggregateByTeam.js` | 화면마다 롤업을 새로 짜지 말 것. `sumFields`/`avgFields`(3필드 가중) |
| **계층 누적** | `utils/team/rollupTeamTree.js` | 평면 집계 → DFS 계층 노드. `direct`/`total` 분리, 사이클·고아 방어 |
| **팀 필터** | `utils/team/teamFilter.js` | `resolveTeamFilter`/`matchesTeamFilter`, `TEAM_FILTER_NONE='__NONE__'` |
| **팀 옵션** | `hooks/useTeamOptions.js` | `{value,label,depth,parentTeamKey}`. grant 에 `PROJECT read` 포함 |
| **전사 비교** | `pages/portfolio/utils/teamComparison.js` | B 를 확장할 때 여기부터 본다 |
| 필드 분류 선례 | `myPage/sections/teamAnalysisFields.js`, `projectDetail/analysisReport/resource/resourceTeamFields.js` | 합산 가능/불가를 **상수로 고정 + 테스트로 감시** |

---

## 🔴 지켜야 하는 계산 규약 (위반 시 거짓 정보가 화면에 나간다)

1. **`?? 0` 금지.** `null` 은 "집계 전"이고 `0` 은 "값이 0"이다. 섞으면 "가동률 0%인 팀"이라는 거짓이 된다.
   `aggregateByTeam` 이 `missing[field]` 로 빠진 인원 수를 세어 주므로 화면이 "일부 집계 전"을 표기할 수 있어야 한다.
2. **비율은 계층으로 더할 수 없다.** 분자·분모를 합산해 두고 `Σ/Σ` 로 재계산한다(`rollupTeamTree`).
   산술평균 금지 — `avgFields` API 에 산술평균 옵션이 **의도적으로 없다**.
3. **이슈 건수는 사람 간 중복된다.** JQL 이 가져온 이슈를 참여자 each 에게 `+=1` 하므로(coworker 는 1급 커스텀 필드)
   팀으로 더하면 중복 계상. 중복 제거에는 이슈 동일성이 필요한데 프론트에 없다 → **서버가 팀별 합집합으로 세거나 컬럼을 두지 않는다.**
4. **직속(direct) / 누적(total) 을 분리 표기**한다. 안 하면 사용자가 표를 세로로 더해 보고 "합이 안 맞는다"고 한다.
5. **팀 미소속을 숨기지 않는다.** 숨기면 팀 소계의 합이 전체 합과 달라져 숫자 신뢰를 잃는다.
   `teamKey(UUID)` 를 라벨로 쓰지 않는다 — 이름 모름은 `team.form.unknownTeam`, 미소속은 `team.unassigned.label`.
6. **팀 분석은 "현재 소속" 기준이다.** 과거에 다른 팀이었던 인원의 실적도 지금 팀에 잡힌다.
   `team.analysis.currentMembershipNote` / `membershipBasis` 로 화면에 밝힌다(기존 키 재사용).
7. **인건비는 `PROJECT_COST` 게이트.** 서버 `costMasked` 판정을 **fail-close**(`!== false`)로 소비한다
   (`pages/portfolio/utils/costGating.js` 가 단일 출처).

---

## 권한 구조 (기존 것을 쓴다 — 새 권한 키 신설은 최후 수단)

- **`TEAM_ONLY` 스코프는 `scopedProjectIds()` 내부가 흡수**한다(S4). 소비자는 스코프를 몰라도 된다.
  ⚠ 이것은 **프로젝트 축**이지 인원 축이 아니다. 인원 축 스코프 신설은 과거 D4 권한 상승 사고가 났던 축이다.
- 팀장 축은 `leadingScopeAccountIds` / `leadingScopeTeamKeys` 로 분리돼 있다(D4 해결책).
  **자기 팀 동료(리더 아님)에게 write 가 열리면 안 된다.**
- `getTeamList`/`findTeamById` 는 grant 가 `OR[TEAM_MANAGEMENT r, USER_MANAGEMENT r]` 라
  `RESOURCE_MANAGEMENT` 만 가진 사용자에게 **항상 거부**된다(T2). 그쪽에서는 `getTeamOptions` 나
  `getResourceOverview.teamMeta` 를 쓴다.
- `updateTeam` 등 쓰기는 `TEAM_MANAGEMENT write` 전용.
- 페이지 게이트 후보: `REPORT`(분석), `RESOURCE_MANAGEMENT`(자원관리), `PROJECT_COST`(인건비 축).

**"둘 다(권한 분기)" 요구 해석**: 같은 화면에서 경영진/PMO 는 전 팀, 팀장은 자기 팀+하위 팀만 보이게 한다.
→ 서버가 **볼 수 있는 팀 집합을 판정**해 내려주고 프론트는 그걸 그대로 쓴다(프론트가 재판정하면 갈린다).

---

## 데이터 원천 현황 (새 배치를 만들기 전에 여기서 찾을 것)

| 원천 | 특성 | 주의 |
|---|---|---|
| `getResourceOverview` | 전사 인원 + `teamMeta`. `/resource` 가 소비 | `people[].salary` 를 **인건비 게이트 없이** 반환 중(기존 결함, U10/U12 계열) |
| `portfolio_project_snapshot` (KVS) | 배치 스냅샷. 가동률 등 | **팀은 프로젝트가 아닌 인원의 속성**이라 스키마 무변경 유지(S6) |
| `getResourceAnalysisList` | 프로젝트별 기간 워크로그 집계 | **KVS 10분 캐시**라 팀을 싣지 않는다(백엔드 E1). 팀은 `findProjectusersByProjectId` 축에서 온다 |
| `getProjectCostSummary` | 프로젝트 비용 + `byTeam` | **KVS 10분 캐시**. 배포 직후 `byTeam` 부재 → `?? []` 로 채우면 "팀 비용 0" 거짓 → **"집계 전"으로 구분** |
| `getMyTeamWorkAnalysis` | 팀장 자기 팀 | Jira 실시간 배치. `fetchAssignedLoadWithGroups` 가 팀별 이슈 **합집합**을 센다 |

---

## 알려진 제약 (설계에서 우회하거나 명시할 것)

1. **가동률 분모(`availMd`)는 전 프로젝트 참여 구간의 union** 이라 **프로젝트 필터에 반응하지 않는다**(M-1).
   부분집합 재계산이 불가능하다 → 이 축을 프로젝트 필터와 함께 쓰면 반드시 안내를 띄운다.
2. **dedup 비대칭** — 인원수는 accountId dedup, 공수·인건비는 dedup 하지 않는다(프로젝트별 기여의 합).
   밝히지 않으면 "인원 10명인데 인건비 15명분"으로 보인다.
3. 팀 미지정 라벨이 백엔드에서 **영문 리터럴 `'Unassigned'`** 로 나오는 경로가 있다(`UserQuery.TEAM_COUNT`/`mapCountWithMeta`).
   한국어 UI 에도 그대로 나온다 — 고치려면 그 규약과 함께.
4. 팀 수 상한 `MAX_TEAMS=500`, 깊이 `MAX_TEAM_DEPTH=10`. **프론트에 리터럴을 두지 않고** `getTeamList.content.limits` 에서 읽는다(M6).
5. 인력 분석 리포트는 **500명 초과 프로젝트에서 팀 모드를 막는다**(전량 조회 불가 → 잘린 소계 금지).

---

## 산출물 기대

- **A/B/C 각각에 대해**: 새로 만들 것 / 기존을 확장할 것 / **만들지 말아야 할 것(중복)** 을 구분해 제시
- 새 resolver 가 필요한지, 기존 응답 확장으로 되는지 판단 (KVS 캐시 TTL 과 배포 직후 부재 상태를 함께 고려)
- **경계면 계약 표**(함수명 · 입력 · 응답 shape · 대응 훅)가 단일 진실 원천
- 권한 판정을 **서버가 소유**하는 구조인지 명시
- 단계 분할(P1/P2…) 제안 — 한 번에 다 만들지 않아도 되게
