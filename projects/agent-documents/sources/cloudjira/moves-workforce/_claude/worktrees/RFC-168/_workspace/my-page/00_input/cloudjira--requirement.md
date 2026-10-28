# 마이페이지 (My Page) — 요구사항

## 개요
사용자 개인의 상세 정보를 한 화면에서 종합적으로 보여주는 **신설 개인 대시보드 페이지**.
브랜치: RFC-168

## 페이지 구성 결정 (사용자 확정)
- **독립 신규 페이지**로 신설. 라우트 `/my-page`, 새 최상위 네비게이션 항목 추가.
- 기존 `/myWork`(워크로그 캘린더 페이지)는 그대로 유지 (대체/통합 아님).

## 표시 항목 (요구사항)
1. **나에게 할당된 프로젝트** — 내가 참여한 프로젝트 목록
2. **나에게 할당된 모든 작업(이슈)** — 내가 참여한 이슈 전체
3. **나의 전체 처리율** — 완료 정도 지표
4. **남은 작업들** — 미완료 이슈 목록
5. **내가 작성한 워크로그** — 내가 작성한 워크로그 내역
6. **내 스킬 목록 (편집 가능)** — 보유 스킬 조회 + 편집

## 판정/계산 기준 (사용자 확정)
- **"나에게 할당된" 판정 기준**: `coworker`(참여자) 커스텀 필드 + accountId 기준.
  - Jira 기본 담당자(assignee)가 아님. 앱 전체(기존 /myWork, 자원관리)와 동일 모델로 일관성 유지.
- **"전체 처리율" 계산 기준**: **이슈 건수 기준** = 완료 이슈 수 / 전체 할당 이슈 수.
  - 완료 판정은 상태 카테고리(Done) 기준.
  - 공수(시간) 기준 아님.

## 기존 자산 재사용 (중요 — 처음부터 만들지 말 것)
설계 시 아래 기존 코드를 최대한 재사용/참조할 것:

### 백엔드
- `getMyIssueList` — 내 이슈 조회 (coworkerFieldId + accountId 기반). myWork에서 사용 중.
  - `static/ui/src/pages/myWork/table/useMyIssueTable.js` 참조.
- 내 워크로그 조회 경로 — `useMyWorklogList`(프론트) + 대응 resolver.
  - `static/ui/src/pages/myWork/utils/useMyWorklogList.js`, `useMyWorklogSummary.js` 참조.
- 내 프로젝트 목록 — `MyProjectList` + `useMyProjectList`.
  - `static/ui/src/pages/myWork/myProject/` 참조.
- **스킬 조회/편집** — `getUserSkills` / `setUserSkills` resolver (이미 존재, accountId 파라미터).
  - 프론트: `static/ui/src/pages/resource/overview/UserSkillEditModal.jsx`, `SkillMultiSelect.jsx` 재사용.
  - 쿼리키: `resourceKeys.userSkills(accountId)`.

### 신규 필요분
- **처리율/남은작업 집계**: 내 할당 이슈를 상태 카테고리(Done/미완료)로 분류해 처리율(완료수/전체수) + 남은 작업 목록 산출.
  - 기존 `getMyIssueList` 응답을 재활용해 프론트에서 집계 가능한지, 아니면 전용 집계 resolver가 필요한지 architect가 판단.
- **네비게이션 진입점**: 새 최상위 네비 항목 추가 (`static/ui/src/App.jsx` 라우팅 + 네비 구성).

## 제약/규칙
- 응답 표준화: `responseWrapper` (`{ success, ... }` / `{ success:false, error }`).
- 프론트 invoke 결과 소비: `{ success, content/data, error }` 계약 준수.
- 쿼리키는 `static/ui/src/utils/queryKey/` 팩토리로 정의 (신규 `myPageKeys` 등).
- i18n: `locales/kr/{기능}.json` + `locales/en/{기능}.json` 추가 후 `npm run merge`. ko-KR.json/en-US.json 직접 수정 금지.
- 성능: 워크로그 N+1 주의 (기능별 전용 병렬 페처 패턴 준수, 공통 경로 수정 지양).
- asApp 지양 (사용자 컨텍스트 경로 우선).

## 현재 사용자 컨텍스트 접근
- 프론트: `view.getContext()` → `context.accountId`.
