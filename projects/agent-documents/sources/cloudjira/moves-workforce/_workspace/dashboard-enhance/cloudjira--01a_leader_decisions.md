# 리더 결정 기록 (2026-08-13, Phase 2 검토)

설계서 `01_architect_design.md` §D5 잔여 노출 + §12 미해결 4건에 대한 리더 판정. 구현자는 이 결정을 따른다.

## D5 잔여 노출 — **수용 (architect 판단 승인)**

`issues[].plannedMd/actualMd` 합산으로 `metrics` 총계를 역산할 수 있는 잔여 노출은 수용한다.

근거:
1. `issues[]`의 원시 데이터(개별 이슈의 timetracking)는 **Jira asUser 권한으로 이미 열려 있다** — 사용자가 Jira 이슈 화면에서 그대로 볼 수 있는 값이다. 앱이 게이트키퍼가 아닌 데이터에 자물쇠를 다는 것은 연극이라는 architect 판단이 맞다.
2. `metrics` 게이팅의 목적은 "REPORT를 회수한 설치에서 **판단 지표**(완성률·진단상태)를 대시보드 UI에 노출하지 않는 것"이고, 그 목적은 키 부재 방식으로 달성된다.
3. 완전 차단 대안(issues[]를 REPORT 뒤로)은 지연 목록·트리맵·커스텀 필터를 전부 죽여 기능 대부분이 무의미해진다 — 비례성이 없다.
4. 급여·원가와 달리 MD는 인사·재무 민감 데이터가 아니다. 급여 계열(`salary`, `costBurnUp`)은 별도로 `PROJECT_COST` 게이트가 유지된다.

## §12 미해결 4건 — 전부 보수적 기본값 채택

| # | 결정 |
|---|------|
| Q1 | `MAX_INSIGHT_ISSUES = 2000` + `truncated` 경고 유지. 운영 실측 후 필요 시 상향 |
| Q2 | KPI 진척률 = **완성 진척률**(진척도 탭 주 지표와 동일 — 숫자 일치가 최우선) |
| Q3 | 트리맵 상위 계층 `issuetype` 고정, 토글 없음 |
| Q4 | `dueSoonDays = 7` 고정, 설정화 안 함 |

전부 "확인 시 바뀌는 것"이 계약 변경 없는 지점이라 나중에 사용자 피드백으로 조정 가능하다.

## 구현 순서 조율

- M1 구현은 **work-bulk-apply 검증 완료 후** 착수한다 — 검증이 루트 `npm test`로 "백엔드 무변경"을 확인 중이라 그 전에 백엔드를 건드리면 검증이 오염된다.
- `npm run merge` 실행 시점은 리더가 조율한다(§D8 병행 작업 주의) — bulk-apply가 이미 merge를 실행했으므로 대시보드 구현자는 자기 작업 후 merge를 다시 실행하면 된다(kr/en 소스 파일이 다르므로 소스 충돌은 없음).

## §13 토폴로지 (T1·T2) — 리더 결정 (2026-08-13 2차)

| # | 결정 |
|---|------|
| Q5 | T1 상한 800/300 채택 — 4종 표기(truncated·hiddenCount·outOfScopeEdgeCount·고립 제외)가 있으므로 보수적 초기값으로 충분. 실측 후 조정 |
| Q6 | T2 상한 프로젝트 12(riskScore desc)·인력 120(effortMd desc) 채택. 실화면 확인은 E2E 체크리스트에 편입 |
| Q7 | T1 `R('PROJECT','detail')` 승인 — 작업관리/간트 데이터의 우회 노출 방지 근거 타당. 시드 기본 영향 0 확인됨 |
| Q8 | T2 이슈 = 프로젝트별 상태 집계 노드 **수용** — 스냅샷에 raw 이슈가 없어 개별 노드는 산출 불가이고, 개별 노드는 어차피 노드 폭발. 사용자 보고 시 명시하고 이견 있으면 후속 |
| Q9 | 기존 배정 관계도의 공용 컴포넌트 이관은 **후속 RFC로 분리** 승인 — 이번 범위에서 기존 파일 불가침 |
| 권한 | T2가 `getResourceAllocationGraph` 재사용을 기각하고 기존 `getPortfolioDashboard`만 쓰는 결정 승인 — TeamAnalyticsScope 명문 금지 준수, 신규 노출 0 |

**구현 순서**: M6(T2, 무의존·최저비용) 우선 착수 → M5(T1, M1 선행 충족됨) → M2~M4 순서는 유지.
M5 착수 시 `__test__/dashboardWidgets.test.js`의 CHART_OPTION_MAP 정합 검사를 `renderer==='echart'`로 스코프 축소(architect 지적).

## §14 M8 스콥 토폴로지 실이슈화 — 리더 결정 (2026-08-14)

| # | 결정 |
|---|------|
| Q10 | **실측 검증 완료** — 리더가 MCP로 운영 사이트(dmove.atlassian.net)에 `timespent > 0 ORDER BY timespent DESC` 실행, 정상 내림차순 확인(7488000→5040000→…초). 설계의 400 한정 폴백은 방어로 유지 |
| Q11 | getItemLayout 내부 API 의존 — try/catch + 실패 시 재배치 1회 degrade 승인 |
| Q12 | 상한 300/200/400/동시 전개 3 승인 (보수 초기값, 실측 후 조정) |
| Q13 | 동시 전개 초과 시 **LRU 자동 접기**(가장 오래된 전개 접힘 + 짧은 안내) — 거부 방식은 흐름을 끊음 |
| Q14 | `getPortfolioSpaceIssues: R('REPORT','detail')` + `scopedProjectIds` 동일 함수 공유 승인 — 화면에 없는 프로젝트는 전개 요청 자체가 거부되는 구조 |
| Q15 | invoke 1회 규약의 의도적 예외 승인 — 드릴다운의 본질(클릭당 1회) |
| Q16 | `problemIssues[]` 스코프 미필터는 **별건 백로그** — M8 권한 근거로 사용 금지 판단 승인("이미 새니까 더 새도 된다" 논리 배제) |

데이터 조달 B안(온디맨드 asUser) + M7 산출물 승격(spaces_json=초기 뷰 재료, 집계 노드만 폐기) 승인.
