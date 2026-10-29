---
name: project-team-analytics
description: "팀별 분석 확충(A+B+C) — 설계 4차 검토 통과, P1-a 완료·P1-b 진행 중 (2026-08-03)"
metadata: 
  node_type: memory
  type: project
  originSessionId: 033f57db-522c-4536-8eeb-9c14c7f944c9
  modified: 2026-08-03T08:50:15.230Z
---

`/team-analytics`(A) + 통합 대시보드 팀 위젯(B) + 프로젝트 분석 팀 탭(C). 작업 디렉토리 `_workspace/team-analytics/`.
선행: RFC-147 팀 개념 도입 완료 → [[project-team-management]]

## 확정된 구조 결정

- **신규 resolver 1개뿐** (`getTeamAnalyticsScope`). 지표는 기존 `getPortfolioDashboard` 재사용 — 새 집계 경로를 만들면 `/dashboard`·`/resource`·`/my-page` 와 숫자가 갈린다. A 는 `portfolioKeys.dashboard()` 를 공유해 캐시 1벌
- **새 권한 키 0개.** `resolveTeamAnalyticsScope(principal)` → `ALL|LEADING|NONE`.
  `isAdmin` / (org read **&&** `projectScope==='ALL'`) / `isTeamLead` / 그 외
  🔴 `projectScope==='ALL'` 조건이 핵심 — **`Team Lead` 프리셋이 `RESOURCE_MANAGEMENT read` 를 갖고 있어** 이게 없으면 팀장이 전 팀으로 승격
  🔴 `REPORT read` 로 열면 안 됨 — 시드 `Member` 가 `REPORT read`+`projectScope ALL`
- **`visibleTeamKeys` 는 UX 범위이지 보안 경계가 아니다** (사용자 결정 2026-08-03). raw 페이로드가 브라우저에 도달하는 것은 허용. 전제가 바뀌면 서버 집계 resolver 를 P2-조건부 승격 + 프론트 롤업 제거
- **`/resource` 조직 현황 · `/my-page` 팀 분석은 삭제하지 않는다** — 권한 키·원천·신선도가 다르다. 단 **완수율 명칭 분리 필수**(A/B=진척률 = 계획공수 가중, my-page=완수율 = `spent/(spent+remaining)` — 산식이 다르다)

## 만들 수 없는 것 (설계 §12, 코드로 재검증됨)

- **기간별 공수 추이는 P1 불가** — `monthly_effort_json` 이 `monthSecMap[month] += sec` 로 **프로젝트 단위**, 워크로그 DDL 은 주석 처리만 존재 → P2 에서 배치 확장
- 팀별 이슈 건수(사람마다 `+=1` 중복) · 프로젝트별 팀 가동률(분모가 전 프로젝트 union) · 과거 소속 기준(이력 테이블 없음)

## 단계

| 단계 | 상태 |
|---|---|
| P1-a 백엔드 기반 | ✅ `f9be032` RFC-174 |
| P1-b 프론트 기반 (어댑터 추출 + 스코프 필수화) | ✅ `3e42d80` RFC-175 |
| P1-c/d/e (자원관리 탭 · 대시보드 팀 축 제거 · 프로젝트 분석 팀 탭) | ✅ `3e42d80` RFC-175 |
| 후속 개선 (필터·차트·관계도) | ✅ `e3d8e5c` RFC-176 |
| P2 기간별 추이 | ⬜ 배치 확장 필요 |
| 레이더(#6 팀 프로필) | ⬜ 축 계약 미정으로 P1 제외 |

**P1 개발 완료 (2026-08-03).** 프론트 1028 / 백엔드 860 통과. **배포·E2E 미수행.**

## 🔴 배치 전면 변경 (2026-08-03, 사용자 판단)

**B(통합 대시보드 팀 위젯)를 철회하고 기존 `PortfolioTeamComparison` 도 제거**, A 를 `/resource` 새 탭으로.
근거: 대시보드는 **프로젝트 축**, 팀은 **사람 축**. 가동률이 프로젝트 필터에 반응하지 못해
"이 축은 필터가 안 먹는다"는 **예외 안내가 필요했던 것 자체가 화면 부적합의 신호**였다.
→ 옮기니 M-1 예외가 소멸했고, 검토 지적 6건(B3/B4 계약·배지 상호안내·스코프 비일관·`ReferenceError` 등)도 함께 사라졌다.

⚠ **`REPORT` 는 있고 `RESOURCE_MANAGEMENT` 가 없는 세트는 팀 비교 접근을 잃는다**(시드 `Member`·`Team Member` + 동일 조건 커스텀 세트 + **팀 권한 상속자**). 배포 전 KVS 감사 필수(설계 §11-5).

## RFC-176 후속 개선에서 나온 것

- **필터는 집계 이전에** — 결과를 나중에 거르면 비율의 분모가 전체로 남아 값이 틀어진다. 팀 선택은 `scope` 를 좁혀 내리고, 프로젝트 필터는 `teamMetricsByTeam` 호출 전에 건다
- **프리셋과 개별 선택을 곱하지 마라** — 실제 필터는 선택 집합 하나, 프리셋(진행중/전체)은 그 집합을 채우는 단축키
- 🔴 **프로젝트 종료 판정은 `isTerminalStatus`(상태만)** — `isProjectClosed`(종료일 경과 포함)를 쓰면 **지연 프로젝트가 사라져 지연 축이 0 으로 수렴**한다. 규칙 일치는 테스트가 백엔드 소스를 읽어 정규식까지 대조
- **관계도 3레이어** — `layout:'none'` 좌표 지정 구조라 가운데 열 추가로 성립. 팀 노드는 팀원 y centroid 에 두어 엣지 교차 제거. 링크는 **배정 기준**(`projectusers ⋈ project`)이며 투입 기준이 아님을 화면에 명시
- **팀 전체 배정** — `insertProjectusers` 가 이미 배열을 받아 백엔드 변경 0. 중복은 서버가 멱등 스킵
- `getTeamList` 대신 **`getTeamOptions`** — grant 가 좁아 `RESOURCE_MANAGEMENT` 만 가진 사용자에게 항상 거부(T2)

**P1-a ↔ P1-c/d 는 원자 배포·원자 롤백.** 배포 전 §11-5 KVS 권한 세트 감사 필수.

## 이번에 배운 것 (재발 방지)

- **`responseWrapper` 는 `{success:true, ...result}` 스프레드** — `userPermissionCheck` 새 필드는 루트 `res.team.*`, `getTeamAnalyticsScope` 는 서비스가 `{content:{}}` 를 반환하므로 `res.content.*`. **둘을 헷갈리면 기능이 통째로 안 뜬다**
- 🔴 **`rollupTeamTree` 의 복원 루프가 비가시 팀을 "알 수 없는 팀" 루트로 되살린다** — 메타에만 필터를 걸면 이름만 가려지고 MD·인건비는 그대로 보인다. **집계 진입 전 필터가 계약**(scope 필수 인자 + 미전달 throw)
- **"알려진 0"을 `null` 로 만들면 분모까지 잃는다** — `aggregateByTeam` 은 분자·분모가 둘 다 숫자인 행만 누적. 정상 프로젝트의 지연 공수를 `null` 로 두니 지연5+정상5 팀이 **100%** 로 나왔다. `?? 0` 금지 규약의 **정반대 실수**
- **프리셋 판정표를 계약으로 쓸 수 없다** — 프리셋은 `edit:true`·최초 1회만 생성, `Member.projectScope` 는 기존값 보존. 테스트는 `resourceMap × projectScope × isTeamLead` **조합표**로
- **`canRender` 는 탭을 숨기지 않는다** — 선택 시 `NoPermissionPage` 를 보여줄 뿐(`CommonTab.jsx`). 리포 관례이며 의도된 것
- **단일 소속 검증은 `Object.fromEntries` 이전 원본 배열에서** — 맵으로 바꾼 뒤엔 중복이 이미 덮여 검출력 0

관련: [[project-team-management]] · [[feedback-test-fixes-wrong-assumption]] · [[project-portfolio-dashboard]]
