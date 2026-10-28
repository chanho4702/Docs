---
name: project-period-report
description: "RFC-200 프로젝트 주간/월간 리포트 — 실시간 규칙 요약 + 스칼라 스냅샷(워크로그 미저장), Codex로 3단계 구현·검증 완료(2026-09-08) 후 **2026-09-22 사용자 지시로 폐기(git stash@{0}에 보관, 커밋 안 됨)**"
metadata: 
  node_type: memory
  type: project
  originSessionId: 4ff8c42e-bfcf-463b-9d01-73b60b401521
  modified: 2026-09-22T00:08:41.994Z
---

# RFC-200 프로젝트 주간/월간 리포트 (2026-09-07~08)

**결정 근거**: 기존 화면은 전부 "현재 시점 상태"만 보여 줌 → 못 주던 건 "기간 동안의 변화량 + 판정 문장 + 시간축". 사용자 제약: **워크로그 원문 저장 금지, 저장 최소**.
- 변화량·판정 문장(대부분)은 Jira 실시간(JQL 2회)으로 저장 0
- 시간축(추이·보고서 재현)만 `project_period_snapshot` **스칼라 1행/프로젝트/기간**(W 26·M 24 보존). 스냅샷의 진짜 이유는 절약이 아니라 **재현성**(Jira 과거는 백데이트·재오픈으로 가변)
- Codex(terra) 1차 리뷰가 "저장 0 고집"과 "월간=주간 합산"(actual_total_md는 누적이라 4배 중복)을 정정함

**구조**: 설계서 `_workspace/project-period-report/DESIGN.md`, 결과 `runs/phase{1,2,3}/RESULT.md`
- Phase 1: DDL v024 + 일 배치(`PortfolioAggregator`) **성공 후 단계**에서 캡처(별도 week 트리거 없음 — Forge는 실행 시각 지정 불가). 기간 키는 `periodKeys.js` **KST 고정** ISO 주. 종료 프로젝트는 종료일이 속한 주·월이 닫힌 뒤 각 1회 유예 집계(`getPeriodCaptureProjectsRepository`, 기존 `getActiveProjectsRepository` 불변). INSERT 뒤에만 purge. 삭제 경로 2곳(ProjectService·DeletionService saga)
- Phase 2: `getProjectPeriodReport` **한 기간만** 계산, 직전 기간은 프론트가 2회 호출(25초 회피). 전용 페처 `PeriodIssueFetcher`(100건+nextPageToken, 20건 절단 보완, KST 경계 ±1일 확장 후 재필터). KVS 캐시 키에 **viewer accountId 포함**(기존 `ResourceList:` 키는 viewer 없음 — 답습 금지). `cost`는 `canReadCost`일 때만·캐시 제외·**안분 추정**(유효급여×기간영업일/전체영업일). `computeLeaveDeductionMap`을 `utils/leaveDeduction.js`로 이동(ResourceAnalysisService re-export 유지)
- Phase 3: `pages/projectDetail/periodReport/` lazy 탭, 판정 규칙 7개 `rules/index.js` 순수 함수, 마크다운 복사, `periodReportKeys`

**근사 계약(화면에 명시)**: `projectusers`에 개인 배정 기간 없음 → 기대 근무일은 프로젝트 기간 기준(`meta.membersApprox`), `openTotal`/overdue는 현재 상태(`issues.approx`)

**교차 리뷰(terra high) 반영**: 페처를 용도별 JQL 3개 + 워크로그 `startedAfter/Before` 기간 필터 + `openTotal`=approximate-count로 축소, purge는 실제 INSERT 건만, 프론트 키 `{accountId,canReadCost}`·staleTime 5분. **보류**: 기존 배치 `weeklyEffort`가 Jira 원본 오프셋 날짜로 버킷(site tz≠KST면 `actual_md_in_period` 어긋남) — 공통 경로라 회귀 위험으로 미수정.

**화면 재설계(2026-09-08, 사용자 요청)**: 이름 「요약 리포트」, 탭은 **분석 및 리포트 하위 첫 자식**(키 `periodReport` 유지), `BentoGrid` 6열 — KPI 5타일 / 판정·추이 3+3 / 전기비교·이슈별·인력별 bar 2+2+2 / 마감초과·인력 표 3+3 / 비용(권한자)·메타. 사용자 원피드백: "레이아웃부터 별로, 차트 적절히" — 초기 astra 산출물이 `<h3>/<dl>` 나열식이었음.

**실화면 버그(2026-09-08)**: "추이를 불러오지 못했습니다" = 스냅샷 SQL `LIMIT ?` 바인드 → **Forge SQL은 LIMIT 바인딩 불가**(`ProjectSubscriptionQuery.js:10` 관행: 정수 검증 후 문자열 삽입). purge 쿼리도 같은 버그였음. 수정 후 재배포 필요.
**위젯 위치 편집(react-grid-layout+localStorage)은 사용자가 취소** — Codex 세션 `resume --last`로 원복(untracked 파일이라 git 복원 불가, Codex 세션 원문으로 복원이 정확했음. 빌드 해시 동일 확인).

**폐기(2026-09-22)**: 사용자가 "미커밋한 것들은 버릴 작업"이라 판단 → `git stash push -u`(stash 메시지 "2026-09-22 폐기: RFC-200 기간리포트·인력분석·삭제수정 등")로 보관. 같은 stash에 인력 분석(personAnalysis)·프로젝트 삭제 saga 수정(unlink 오판·15초 예산)·삭제 진행 모달 수정·SeverityLozenge도 함께 들어 있다. 이 미커밋 트리로 빌드한 번들이 `MyProjectsPanel.jsx`의 `ProjectStatusLozenge` import를 지운 채 배포돼 마이페이지가 죽었던 것이 폐기 계기.

**상태(폐기 전)**: 백엔드 124 suites/1667 tests, 프론트 150 tests, CI 빌드 통과(2026-09-08). **커밋 전** — 작업 트리에 다른 세션의 인력 분석(personAnalysis) 미커밋 변경이 섞여 있어 커밋 시 `PermissionMap.js`(hunk 259만)·`ko-KR/en-US.json`(첫 hunk 1373만) hunk 분리 필요. `RFC-200` 브랜치. 배포·실브라우저 E2E 미수행.

**환경 교훈**: Codex `exec`는 `--approve-for-me`(workspace-write) 단독 사용(`--full-auto` 없음, `--sandbox`와 병용 불가). 하네스가 백그라운드 셸을 메모리 부족으로 죽여도 codex 자식은 살아남아 `resume --last`가 "active writer" 충돌 → 프로세스 종료 대기 후 재개. 메모리 1.5GB 이하면 Codex가 자식 프로세스(테스트)를 못 띄움(`0xc0000142`).

관련: [[project-permission-audit-2026-09]], [[project-portfolio-dashboard]], [[feedback-codex-review]]
