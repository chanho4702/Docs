# 프로젝트 인력 배정 현황 (Resource Allocation Graph) — 요구사항

## 배경 / 목적
자원관리(/resource)에 **프로젝트 인력 배정 현황**을 시각화한다. 핵심 목적:
- 각 프로젝트에 **누가 어떤 역할로 들어가 있는지** 한눈에
- **어떤 사람이 중복 배정**(여러 프로젝트 동시)인지 직관적으로 파악

## 시각화 = ECharts graph (관계도, N:M)
- **좌측 프로젝트 노드 / 우측 담당자 노드**의 이분(bipartite) 관계도.
- 프로젝트↔담당자는 **N:M 엣지**(한 담당자가 여러 프로젝트에 연결 가능 = 중복 배정이 공유 노드로 직관적으로 드러남). tree(1:N 계층) 아님.
- **엣지 색 = 프로젝트별**(프로젝트마다 다른 색).
- **담당자 노드 = 아바타 이미지 + 이름**(한 노드에 아바타 symbol + label 이름).
- **중복 배정 강조**: 담당자 노드 크기/색을 연결된 프로젝트 수에 비례(2개 이상 강조).
- **호버 이벤트**: 노드/엣지 hover 시 tooltip(담당자=배정 프로젝트 목록·역할·부하 요약 / 프로젝트=팀원 수 등) + emphasis(연결된 엣지·노드 강조). ECharts 표준(tooltip/emphasis) 사용.
- **노드 클릭**: 담당자 노드 클릭 → 기존 **인력 상세 드로어(ResourceProfileDrawer) 재사용** 오픈(부하/진행중 작업 바로 확인).

## 상단 필터 2종
1. **진행 상태 필터**: Moves 프로젝트 상태(project_status_key/name)로 거름. **기본값 = 진행중(종료 제외, 활성)**. 상태 다중선택.
   - 종료 판정은 기존 `isProjectClosed(end_date)` 재사용(status 엔티티에 종료 플래그 없음 — resource-profile v2 실측).
2. **프로젝트 필터**: 특정 프로젝트만 다중선택(상태 필터로 좁힌 목록에서).

## 위치
자원관리(/resource)에 **"배정 현황" 탭 신규**. 기존 Overview/Match 탭과 나란히(constants/tabs 또는 로컬 탭 구조 확인).

## 데이터 소스
- **`project_users`**(프로젝트별 배정 인력 + role_key) + **project**(상태/이름/end_date) JOIN. 배정 그래프 조립.
- 담당자 표시용 Jira user(아바타/이름) — 기존 `userMap`/`buildPeopleContext` 재사용 검토.
- 담당자별 배정 프로젝트 수(중복 판정)는 조립 시 산출.
- (선택) 부하 요약(가동율/완수율)을 tooltip/드로어에 결합 — 기존 rollup/loadSummary 재사용 가능하면.

## 경계면 / 규약
- 신규 resolver: 배정 그래프 조립조회 → `res.content`(nodes/links/projects 등 graph 구조). 함수명·shape은 architect가 계약표로 확정.
- 상태 목록은 기존 `getProjectStatusListService`(res.rows) 재사용.
- 권한: 기존 `RESOURCE_MANAGEMENT`(WORKFORCE) 재사용 검토.

## 준수 (프로젝트 교훈)
- Jira asApp 금지, asUser ([[feedback-no-asapp]]).
- 워크로그 공통 페처 미수정 ([[feedback-worklog-fetch-isolation]]) — 부하 결합 시 기존 rollup/배치 재사용만.
- i18n: locales/kr·en 폴더 추가 후 merge(ko-KR/en-US 직접수정 금지).
- ECharts는 기존 `echarts-for-react` 사용. graph series.

## 범위 밖
- 배정 편집(드래그로 재배정 등) — 이번은 조회/시각화만.
- 프로젝트별 개인 투입률(project_users엔 투입률 컬럼 없음) — 배정 유무 + 역할까지만.
- 할당 작업량 3값 표현(Overview 완수율 컬럼 개선) — 별도 대기 항목(이번 라운드 제외).
