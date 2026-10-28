# 작업 배정 (Work Assignment) — 요구사항

- **일자**: 2026-07-22
- **브랜치**: RFC-160
- **슬러그**: `work-assignment`
- **배치 확정**: 프로젝트 상세 > **인력**(projectUser 부모탭) > 세 번째 서브탭 `작업 배정`
  - 형제: `projectUserList`(명단) / `projectSalary`(급여) / **`projectAssignment`(작업 배정, 신규)**
- **범위 확정**: 판단(읽기) + **배정 실행(쓰기)** 까지 포함

## 1. 목적

팀장/PM이 프로젝트 작업을 **누구에게 배정할지 판단**하고, 판단한 그 자리에서 **배정을 실행**한다.

현재 이 판단을 지원하는 화면이 없다:

| 기존 화면 | 답하는 질문 | 간극 |
|---|---|---|
| `projectDetail/user` (인력 명단) | 이 프로젝트에 누가 계약돼 있나 | 컬럼이 이름/직무/등급/액션뿐, 부하 개념 없음 |
| `projectDetail/analysisReport/resource` | MM을 얼마나 썼나 (사후) | 사전 의사결정용 아님 |
| `/resource` overview·match | 전사에서 누가 여유 있나 | **프로젝트 컨텍스트 없음**, 배정 대상 작업이 화면에 없음 |

## 2. 핵심 요구

### 2.1 좌측 — 배정 대상 작업 큐
- 해당 프로젝트(RMS project_id)의 **미배정 / 마감임박** 작업 목록
- 작업 1건 선택 → 우측 후보 인력 랭킹의 컨텍스트가 된다
- 최소 정보: 이슈키, 요약, 상태, 마감일, 잔여 추정, 현재 담당/협업자

### 2.2 우측 — 후보 인력 테이블 (이중 스코프)
한 행에 **프로젝트 내**와 **전사**를 나란히 놓는 것이 이 화면의 존재 이유.

| 스코프 | 지표 |
|---|---|
| 프로젝트 내 | 할당 건수 / 처리율 / 남은 작업량 |
| 전사 | 가동률 / 참여 프로젝트 수 / 타 프로젝트 포함 남은 작업량 |

- **탐지 목표**: "이 프로젝트만 보면 여유 있는데 밖에서 과부하" 케이스
- 두 스코프의 괴리를 시각적으로 드러내는 신호(배지/경고) 필요

### 2.3 스킬 매칭 점수 병기
- 기존 `ResourceMatch` 로직 재사용 — 커버리지/매칭·미보유 스킬

### 2.4 인력 상세
- 후보 로우 클릭 → 기존 `ResourceProfileDrawer`(360도 인력 상세) 재사용

### 2.5 배정 실행
- 선택한 작업에 **담당자(assignee)** 또는 **협업자(coworker)** 지정
- 쓰기 권한 게이트 필수

## 3. 재사용 자산 (신규 개발 최소화)

### 백엔드
- `src/resolver/resourceManagement/ResourceLoadFetcher.js` — accountId별 부하 배치(가동률 / 할일·진행·완료 건수 / 할당·처리·남은 작업량 / 참여 프로젝트 수)
- `src/resolver/resourceManagement/ResourceMatch.js` — 스킬 커버리지 랭킹
- `src/resolver/projectIssue/` — 프로젝트 이슈 조회 기존 경로
- `src/api/jira/issue/IssuePropertyApi.js` — `MOVES_PROPERTY_KEY`(coworkers)

### 프론트
- `static/ui/src/pages/resource/match/CandidateRankTable.jsx`
- `static/ui/src/pages/resource/overview/profile/ResourceProfileDrawer.jsx`
- `static/ui/src/pages/resource/overview/{UtilBadge,WorkloadCell,AssignedIssueCell,CompletionBar}.jsx`
- `static/ui/src/components/table/CommonTable`
- `static/ui/src/constants/tabs.js` — `projectDetailTabs`의 `projectUser.children`에 항목 추가

## 4. 반드시 반영할 제약

1. **인덱스 지연** — 배정 write 직후 `search/jql` 재조회는 옛 값 반환.
   → `invalidateQueries` 대신 **서버 응답으로 캐시 직접 패치**. (간트 상위지정 사건과 동일 함정)
2. **coworker 쓰기 경로 상이** — 표준 필드가 아니라 이슈 프로퍼티 `movesRmsCoworkers`(manifest `jira:entityProperty` searchAlias). assignee(표준 API)와 write 경로가 다르다.
3. **asApp 지양** — `as:'user'` 컨텍스트 사용. 마켓플레이스 심사 부담.
4. **공통 이슈 페처 수정 금지** — `getProjectIssuesByFilter` / `getProjectGanttIssues` / `getBulkIssuesByProject` 등은 손대지 않는다. 필요 시 **전용 페처를 신규 모듈로 격리**.
5. **프로젝트 내 부하 집계** — 프로젝트 컨텍스트 JQL로 별도 조회.
   마이페이지의 "RMS 프로젝트별 분해 불가" 판정은 `fieldsByKeys` 누락 경로에서 발생한 것이므로 여기선 우회 가능. 단 **`fieldsByKeys:true` 확인 필수**.
6. **병렬 페치** — 전사 배치 + 프로젝트 배치 2회 조회 → 병렬 설계, 순차 대기 금지.
7. **권한** — 배정 실행은 write 권한 게이트. 읽기는 프로젝트 read 기준.
8. **i18n** — `locales/kr/*.json` + `locales/en/*.json` 추가 후 `npm run merge`. `ko-KR.json`/`en-US.json` 직접 수정 금지.

## 5. 영향 범위

- 백엔드: `src/resolver/` — 신규 도메인 또는 `resourceManagement` 확장 + 배정 write resolver
- 프론트: `static/ui/src/pages/projectDetail/assignment/`(신규) + `constants/tabs.js` 수정
- DB: 신규 스키마 없음 예상 (Jira 이슈/프로퍼티 + 기존 project_users)
- i18n: 신규 키 세트
- manifest: 신규 스코프 필요 여부 확인 (이슈 편집 권한)
