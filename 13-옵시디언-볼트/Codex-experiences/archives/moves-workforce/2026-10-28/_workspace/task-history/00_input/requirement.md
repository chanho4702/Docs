# 작업 추가 이력 기능 — 요구사항 (확정)

## 슬러그
`task-history` — 작업 디렉토리 `_workspace/task-history/`

## 문제
프로젝트 상세 작업관리에서 추가된 작업(이슈)의 이력이 확인 안 됨. 초기 작업 등록 후
추가 작업이 등록되면 그만큼 **추가 공수(scope creep)**가 발생한 것인데, 언제 / 누가 /
얼마나 공수를 추가했는지 추적할 방법이 없다.

## 목표
- 작업이 **이 프로젝트에 등록된 시점**을 추적·표시
- 공수(planned MD) 관점 인사이트: 초기 대비 추가 공수(scope creep)
- 간단한 그래프 제공

## 확정 사항

### 1. 데이터 소스 (별도 DB 미사용)
- **새 datetime 커스텀필드**(가칭 `moves_RMS_projectAssignedDate`)를 `manifest.yml`에 추가.
- 이슈를 프로젝트에 **등록하는 시점**(= `projectId`/`moves_RMS_projectId` 커스텀필드를 set하는 순간,
  진입점은 `IssueAddModal → invoke('updateProjectIdField')`)에 등록 datetime을 이 새 필드에 **함께 기록**.
- **지금부터 추적**. 도입 전 기존 이슈는 백필하지 않음(값 없음).
- **datetime(시각 포함)**, ISO 포맷. Forge 앱 커스텀필드 값 set은 기존 패턴
  `PUT /rest/api/3/app/field/{fieldIdOrKey}/value`(`ProjectUsersService.js`의 `updateCustomField`) 재사용.

### 2. 격리 / 안전 (기존 로직 영향 최소화 — 매우 중요)
- 등록일 기록은 **이슈 추가(등록) 경로에서만** 동작. 같은 `updateProjectIdField` resolver가
  **coworker 변경**에도 재사용되므로, coworker 경로는 **절대 손대지 않는다**(기존 coworker 동작 100% 보존).
- **"이미 등록일이 있으면 덮어쓰지 않음"** 가드 — 재등록/프로젝트 이동 시 최초 등록 시점 유지.
- **비차단(예외 격리)**: 등록일 set이 실패해도 projectId 등록 자체는 성공으로 처리.
  최악의 경우 그 이슈의 등록일만 비는 정도, 등록 동작은 깨지지 않음.
- 기존 조회/표시(작업관리/칸반/분석 리포트 등) 읽기 경로는 변경 없음.
- 다중 이슈 등록은 `issueIds` 배열로 한 번에 처리(기존 `updateCustomField`가 배열 지원).
- `asApp` 사용: 앱 소유 커스텀필드 값 쓰기는 `/app/field/.../value` 전용 엔드포인트라 app 권한 불가피.
  이는 projectId/coworker가 **이미 쓰는 동일 경로의 연장**이며 새로 늘어나는 asApp 부담 없음.

### 3. UI 배치
- 프로젝트 상세(`/project/:id`)에 **새 탭 '작업 이력'** 추가(`constants/tabs.js`의 `projectDetailTabs`,
  권한 `canRender` 패턴 따름).

### 4. 그래프
- **누적 공수 추이(번업)** 곡선: 시간축에 등록일 순으로 planned MD를 누적 → 초기 대비
  공수가 얼마나 불었는지(scope creep) 한눈에. (기존 차트 스택: ECharts `echarts-for-react` 우선 검토)

### 5. 이력 목록 / 인사이트
- 이력 목록: 이슈 키 / 제목 / **등록일시** / planned MD / (가능하면) 등록자 / 상태. 등록일시 기준 정렬.
- 공수 인사이트(요약 카드): 초기 공수 vs 현재 총 공수, 추가된 공수/건수 등 공수 관점 지표.
- 등록일이 없는 이슈(도입 전)는 "이력 추적 시작 전"으로 구분 처리(그래프 기준선/별도 표기).

## 위치 / 범위
- 백엔드: manifest 커스텀필드 추가, 등록 경로에 등록일 기록(격리), 이력 조회용 데이터 제공.
- 프론트: 새 탭 + 번업 차트 + 이력 테이블 + 인사이트 카드 + i18n.
- 데이터는 이 프로젝트(projectId) 이슈들을 조회해 등록일 커스텀필드 + planned MD(timetracking) 기반 구성.
