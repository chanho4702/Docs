# 자원관리 페이지 인력 중심 개선 — 요구사항

## 배경
기존 `/resource` 페이지(2026-07-08 구현)는 Overview(전사 인력 요약 테이블) + Match(프로젝트→후보 스킬 커버리지 랭킹) 2탭.
전부 "여러 명 요약" 또는 "프로젝트 기준"이라, **한 사람을 딱 보면 배정 판단이 서는 인력 중심 360도 뷰가 없다.**

## 목적 (사용자 합의)
자원 배정 의사결정을 두 관점에서 지원한다.

### ① 인력 기준 (중점) — "이 사람이 지금 뭘 하고 있나 / 얼마나 여유 있나"
- 각 인력이 **어떤 작업(Jira 이슈)을 진행 중**인지
- 그 일을 **얼마나** 하고 있는지 = 여유 판단:
  - **진행중 이슈 건수**
  - **남은 작업량(추정공수 합, remaining estimate)**
  - 가동률(util, 기존 rollup 재사용)
- **경험**: 보유 스킬(기존) + **프로젝트 참여 이력**(과거 종료 프로젝트 포함, 역할/기간)

### ② 프로젝트 기준 — "이 프로젝트에 이 사람을 배정해도 되나"
- 배정 판단의 주어는 **프로젝트**
- 기존 Match 탭(프로젝트→후보 스킬 커버리지)에 **각 후보의 현재 부하(진행중 작업 건수 + 남은 작업량)를 결합**
- 스킬 적합도만이 아니라 "지금 여유가 있는가"를 함께 보고 배정 판단

## 확정된 설계 결정 (사용자 합의)
| 항목 | 결정 |
|------|------|
| 뷰 형태 | 기존 Overview 테이블 로우 클릭 → **상세 드로어(패널)**. 별도 페이지 아님 |
| "지금 어떤 작업" 소스 | **담당자(assignee) + coworker 둘 다**. Jira 이슈 검색 |
| "진행 중" 판단 기준 | **Jira 상태 카테고리 `In Progress`** (Moves 자체 상태체계 아님) |
| "얼마나 일하나" 표현 | **진행중 이슈 건수 + 남은 작업량(추정공수 합)** 둘 다 + 가동률 |
| 경험 범위 | **스킬 + 프로젝트 참여 이력**(종료 프로젝트 포함) |
| 배정 판단 방향 | **프로젝트 기준**(Match 탭 강화). 별도 사람→프로젝트 역방향 페이지는 만들지 않음 |

## 데이터 소스 힌트 (architect가 실제 코드로 검증할 것)
- **가동률(util)**: `getRollupMeta().utilizationPeople[{accountId, util}]` (KVS `portfolioRollup:current`, 일배치). **1회 read 재사용** — 신규 워크로그 페치·공통 페처 수정 금지 ([[feedback-worklog-fetch-isolation]] 준수).
- **진행중 이슈 + 남은 작업량**: Jira 이슈 검색. assignee = 대상 accountId **OR** coworker(movesRms 이슈 프로퍼티 `movesRmsCoworkers` searchAlias / `coworkerIdField` 커스텀필드) 포함. status category = `In Progress`. 남은 작업량 = time tracking `remainingEstimateSeconds` 합.
  - **N+1 주의**: 드로어는 한 번에 **한 명**만 여니, 그 1명에 대해서만 이슈 검색 → N+1 아님. Overview 전체 로우에 진행중 건수를 미리 채우려면 배치 전략 필요(설계에서 판단).
  - **asApp 지양**: 사용자 컨텍스트 경로 우선 ([[feedback-no-asapp]]).
- **프로젝트 참여 이력**: `project_users` 테이블(ProjectUsersQuery). 종료 프로젝트 포함 여부, 역할(role)/기간(투입~철수) 컬럼 존재 여부를 실제 스키마로 확인.
- **기존 재사용 대상**: `buildPeopleContext()`(ResourceManagementService.js) — people 조립 로직에 진행중 작업/이력을 어떻게 얹을지. `computeCoverage`/`rankCandidates`(ResourceMatch.js) — Match 강화 시 재사용.
- **경계면 컨벤션(기존)**: CRUD·set/get = `res.data`, 조립조회 = `res.content`, getActiveProjects = `res.rows`.

## 범위 밖 (이번 개선 제외)
- 사람→적합 프로젝트 역방향 추천 랭킹 페이지 (프로젝트 기준으로 대체)
- 스킬 마스터/매핑 CRUD 변경 (기존 유지)
- 예정 작업량 예측/캐파 플래닝 (후속)

## 성능·제약 (프로젝트 하네스 교훈)
- 워크로그 N+1 최적화는 공통 경로 수정 말고 기능별 전용 페처로 분리 ([[feedback-worklog-fetch-isolation]])
- Jira API asApp 지양 ([[feedback-no-asapp]])
- 권한: 기존 `RESOURCE_MANAGEMENT`(WORKFORCE) 키 재사용 검토
- i18n: locales/kr·en 폴더에 키 추가 후 merge (ko-KR.json/en-US.json 직접 수정 금지)
