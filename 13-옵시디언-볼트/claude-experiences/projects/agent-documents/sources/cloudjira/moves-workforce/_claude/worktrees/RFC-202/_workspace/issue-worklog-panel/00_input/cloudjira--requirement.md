# RFC-202 — Jira 이슈 화면 워크로그 패널

작성: 2026-09-22 (사용자 요구 + 리더 정리). 브랜치 `RFC-202`, worktree `.claude/worktrees/RFC-202`.

## 목적
Jira 이슈 화면 안에서 Moves Workforce 앱으로 들어오지 않고도 (1) 해당 이슈의 **계획 작업량 / 현재 투입 공수를 MM으로** 보고 (2) **워크로그를 바로 입력**하고 (3) **Workforce 앱으로 이동**할 수 있게 한다.

## 사용자 결정 (2026-09-22 확정)
| 항목 | 결정 |
|---|---|
| 패널 위치 | **이슈 본문 아래 패널** (`jira:issuePanel`, Custom UI) |
| Workforce 링크 | **프로젝트 상세 > 작업관리**(연결된 프로젝트, 해당 이슈 강조/필터 가능하면) |
| 투입 공수 표시 | **이슈 전체 워크로그 합 + 그중 내 몫**, 계획 대비 진행률은 전체 기준 |
| 입력 폼 범위 | **기존 마이워크 `WorklogModal`과 동일**(날짜·시간·일정유형·마크다운 코멘트·협업자 표시), 저장 로직 재사용 |
| 표시 대상 | **우리 프로젝트에 연결된 이슈에만** 패널 노출. 프로젝트 삭제·이슈 연결 해제 시 패널이 사라져야 한다 |
| UI/UX | 신경 쓸 것 — Atlaskit 네이티브, RFC-178 공용 지점 재사용, 스켈레톤 로딩 |

## 기능 요구
1. **KPI 영역**: 계획 작업량(Jira `originalEstimate`)과 투입 공수(이슈 워크로그 합, `timespent`)를 **MM**으로 표시. 환산은 앱 설정의 MM 기준(백오피스 `setting`의 1일 근무시간·MD/MM 규칙 — 기존 유틸을 찾아 재사용, 새 산식 금지). 내 투입 MM을 함께. 진행률 바(전체 투입/계획).
2. **워크로그 입력**: 기존 `static/ui/src/pages/myWork/modal/WorklogModal.jsx`의 저장 경로(`@forge/bridge` `requestJira` 직접 호출, 타임존 처리, 마크다운→ADF, Jira 편집 권한 가드)를 그대로 재사용. 이슈 키는 `view.getContext().extension.issue`에서 온다(이슈 선택 UI 불필요). 저장 후 KPI 즉시 갱신.
3. **딥링크**: "Workforce에서 열기" → `/jira/apps/{appId}/{envId}/project/<projectId>?tab=work&view=list`(+ 이슈 강조 파라미터가 기존 라우터에 있으면 사용). 연결된 프로젝트 id는 이슈의 `moves_RMS_projectId` 값. **팀 관리형 이슈는 `fields` 응답에서 앱 필드가 빠지므로** 값 조달 경로를 설계에서 확정할 것(프로퍼티에 projectId도 함께 기록하는 방안 검토).
4. **표시 조건(연결 표식)**: manifest `displayConditions`(`entityPropertyEqualTo`, 이슈 엔티티 프로퍼티)로 **연결된 이슈에만 패널 노출**. 이를 위해 이슈가 프로젝트에 연결될 때 표식(예: `movesRms.linked=true` 또는 별도 키 `movesRmsLink`)을 쓰고, 연결 해제·프로젝트 삭제 시 지운다.
   - **연결 경로 전수**(같은 데이터 다중 경로 교훈): 이슈 추가 모달(`projectDetail/issue/IssueAddModal`), 구독 백필·스윕(`SubscriptionBackfill`, `SubscriptionSweeper`), 작업 배정(`workAssignment`), 이슈 생성 트리거(`onIssueCreated`), 큐 consumer, 간트/작업관리 일괄 적용. 설계서에 **경로 목록과 각 경로의 쓰기 지점**을 표로 확정.
   - **해제 경로**: 작업관리 일괄 제외(프로젝트 제외), 이슈 탭 삭제(`deleteProjectIssue`), 프로젝트 삭제 saga(`ProjectDeletionService` — 이미 `movesRms` 프로퍼티와 필드를 지움. 새 표식이 같은 프로퍼티 키 안에 있으면 추가 작업 없음, 별도 키면 saga에 삭제 추가).
   - **⚠ 저확신 사항 — 설계 단계에서 공식 문서로 확인**: Forge `displayConditions.entityPropertyEqualTo`가 프로퍼티 **안의 특정 키**(`objectName`) 비교를 지원하는지. 안 되면 별도 프로퍼티 키(값 `true` 또는 projectId 문자열)로 간다.
   - **⚠ 확인**: `jira:issuePanel`이 설치 즉시 자동 노출되는지, 아니면 사용자가 이슈마다 "앱 추가"로 켜야 하는지(문서: issue panel의 표시 방식). 자동 노출이 아니면 대안(`jira:issueContext`)을 리더에게 보고.
5. **팀 관리형 프로젝트**에서도 동작. 시간 추적 기능이 꺼진 팀 관리형 프로젝트는 Jira가 워크로그를 거부하므로 안내 문구로 처리.

## 비기능 / 제약
- **번들 분리 필수**: 현재 `main` 리소스는 전체 앱 한 덩어리(간트·ECharts 포함). 이슈 화면마다 이걸 로드하면 안 된다. `manifest.yml`에 새 `resources`(예: `issue-panel`, `static/ui/build-panel` 또는 별도 디렉토리) + craco **다중 진입점**(entry)으로 패널 전용 소형 번들을 만든다. 기존 `main` 빌드·`bundle:check`·CI 흐름이 깨지지 않아야 한다.
- 새 Jira 스코프 없음(`read/write:jira-work` 보유) → 마이너 버전 배포.
- 앱 권한(`usePermissionStore`)·라이선스(`useLicenseStore`)·i18n(`useI18nStore`) 초기화를 패널에서도 수행. 라이선스 차단 정책(INACTIVE만 차단)은 앱과 동일.
- 백엔드 resolver를 새로 만들면 `guardedDefine` + `PermissionMap` 등록 필수. 패널의 Jira 호출은 가능하면 프론트 `requestJira`로(기존 워크로그 모달과 동일 정책).
- i18n: `locales/kr|en/<기능>.json` 추가 후 `npm run merge`.
- 다른 세션이 main checkout(`develop`)에서 작업 중 — **이 worktree 밖의 파일을 건드리지 않는다.** stash 사용 금지(공유됨).
- 관련 기록: `FieldApi`는 manifest key(`projectIdField`)로 매칭한다(2026-09-22 수정, `86abae4`). 프론트는 `constants/customField.js`의 `getCustomFieldId` 사용.

## 산출물
`_workspace/issue-worklog-panel/01_architect_design.md` → `02_backend_report.md` → `02_frontend_report.md` → `03_verify_report.md`
