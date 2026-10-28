# 프로젝트 관리 페이지 P0 수정 보고서

- 작성일: 2026-07-13 (브랜치 RFC-152)
- 근거: `00_audit.md` 감사 결과 승인 → P0 버그 + 상태 간헐 미표시 조사 + 상태 표시 디자인 통일
- 결정 사항 반영: **프로젝트 CRUD 권한 기준 = PROJECT write로 통일** (사용자 결정)

---

## 1. 수정 목록

### 1.1 A1 — invoke success 미체크 (F-01/F-02/F-03)

| 항목 | 파일 | 내용 |
|---|---|---|
| F-01 | `static/ui/src/pages/project/modal/ProjectModal.jsx` (saveMutation.onSuccess) | `res.success` 확인 추가. 실패 시 에러 토스트(`common.toast.description.error`) + **모달 유지**(입력값 보존), 성공 시에만 성공 토스트·invalidate·onClose. onError 메시지도 삭제용 키 재사용(F-27) → `common.toast.description.error`로 교체 |
| F-02 | `static/ui/src/pages/project/ProjectList.jsx` (deleteProjectMutation.onSuccess) | `res.success` 확인 추가. 실패 시 `project.delete.toast.description.fail` 에러 토스트, 성공 시에만 성공 토스트 + `["projects"]` invalidate |
| F-03 | `static/ui/src/pages/projectKanban/ProjectKanbanBoard.jsx` (deleteCardMutation) | `onSuccess(res,_,ctx)`에서 `res.success` 확인 — 실패 시 `ctx.prev` 캐시 롤백 + 에러 토스트. **onSettled 추가**: 확인 모달 닫기 + `kanbanQueryKeys` invalidate → 성공/실패 무관 서버 상태 재동기화(유령 삭제 해소) |

패턴은 기수정 사례(`ProjectIssueTable.jsx` updateCoworker/updatePlannedMD의 `result?.success` 분기)와 동일하게 적용.

### 1.2 A2 — 권한 정합 (PROJECT write 기준 통일)

| 항목 | 파일 | 변경 |
|---|---|---|
| F-04 | `ProjectModal.jsx` | `canWrite("KANBAN")` → `canWrite("PROJECT")` — 서버 insertProject/updateProject = `W('PROJECT')`(PermissionMap.js:61-62)와 일치. 목록/칸반 어느 쪽에서 열려도 동일 기준 |
| F-06 | `static/ui/src/pages/projectKanban/KanbanCard.jsx` | 삭제 더보기 메뉴 게이트를 `canWrite("PROJECT")`(신규 `canWriteProject`)로 분리. 카드 이름변경 InlineEdit는 기존 `canWrite("KANBAN")` 유지(서버 updateFromKanban = `W('KANBAN','detail')`과 일치) |
| F-09 | `ProjectKanbanBoard.jsx` | 컬럼 이름변경 InlineEdit·컬럼 삭제 드롭다운 게이트를 `canWrite("PROJECT_STATUS_MANAGEMENT")`(신규 `canWriteStatus`)로 — 서버 updateProjectStatus/deleteProjectStatus = `W('PROJECT_STATUS_MANAGEMENT')`(PermissionMap.js:97-98) 기준. 컬럼 추가는 서버가 OR(KANBAN∥PSM write)라 기존 `canWrite("KANBAN")` 유지 |
| F-04 연쇄 | `ProjectKanbanBoard.jsx` (renderListFooter) | 컬럼 하단 "프로젝트 추가" 버튼 게이트 `canWrite("KANBAN")` → `canWriteProject` (insertProject = W('PROJECT')) |
| F-05 | `src/permission/PermissionMap.js` | `getProjectStatusExistLink: R('PROJECT_STATUS_MANAGEMENT')` → `OR([[PSM,'read'],['KANBAN','read'],['PROJECT','read']])` — getProjectStatusList(:102 동일 규칙)와 정합. KANBAN read만으로 칸반 보드 로딩 가능 |

정리 후 게이트 맵: 카드 이동/이름변경 = KANBAN write · 카드(프로젝트) 추가/수정/삭제 = PROJECT write · 컬럼 추가 = KANBAN write(서버 OR) · 컬럼 이름변경/삭제 = PROJECT_STATUS_MANAGEMENT write.

### 1.3 F-07 — 프로젝트 삭제 확인 모달

- 기존 컨벤션 조사: 코드베이스에 공용 확인 컴포넌트 부재 — 백오피스는 전부 `window.confirm`(role/level/permission/publicHoliday/projectStatus edit 훅), 간트 폴더 삭제만 BaseModal 인라인 구성. 공용 컴포넌트가 없으므로 지시대로 Atlaskit 기반 공용 confirm을 신설.
- **신규** `static/ui/src/components/modal/ConfirmModal.jsx`: `@atlaskit/modal-dialog` 기반, `ModalTitle appearance="danger"`(경고 아이콘), isLoading 지원.
- 적용 2곳:
  - `ProjectList.jsx`: 드롭다운 삭제 → `deleteTargetId` 상태 → ConfirmModal → 확인 시 mutate. `onSettled`에서 모달 닫기.
  - `ProjectKanbanBoard.jsx`: 카드 삭제(handleDeleteCard) → `deleteCardTarget` 상태 → ConfirmModal → 확인 시 mutate.
- i18n 신설(kr/en + merge 완료): `project.delete.confirm.title`, `project.delete.confirm.message` (cascade 삭제 범위 명시 — 인력/대시보드/간트/스킬 매핑).
- 참고: 컬럼(상태) 삭제의 `window.confirm`(ProjectKanbanBoard)은 백오피스 컨벤션과 동일해 이번 범위에서 유지 (P2에서 ConfirmModal로 통일 가능).

### 1.4 F-08 — 백엔드: 컬럼 추가 롤백 후 에러 미전파

- `src/resolver/backoffice/projectStatus/ProjectStatusService.js` `addProjectStatusFromKanbanService`: 링크 저장 실패 catch에서 상태 롤백 후 **`throw e` 추가** → responseWrapper가 `{success:false, error}` 직렬화.
- 프론트 소비처(`ProjectKanbanBoard.jsx` addColumnMutation.onSuccess)는 이미 `!res.success` 분기(invalidate + 에러 토스트)가 있어 추가 수정 불필요 — 확인 완료.

### 1.5 F-12 — 존재하지 않는 i18n 키

- `ProjectKanbanBoard.jsx` renameStatusMutation: `t("common.toast.title.editSuccess")` → `t("common.toast.description.editSuccess")`, `t("common.toast.title.fail")` → `t("common.toast.description.fail")` (onSuccess 실패 분기·onError 모두). 두 키는 `locales/kr·en/common.json`의 `toast.description`에 실존.

---

## 2. 목록 상태 간헐 미표시 — 원인 분석 및 수정

### 2.1 근본 원인 (코드 흐름 입증)

증상: "목록 보기에서 프로젝트 상태가 간헐적으로 안 뜬다."

1. **서버 실패가 '성공'으로 위장됨** — `guardedDefine`이 `responseWrapper`를 흡수(src/permission/permissionGuard.js:99)하므로 `invoke('getProjectStatusList')`는 KVS 일시 오류·principal 해석 실패·라이선스 체크 등 어떤 서버 예외에도 **reject되지 않고** `{success:false, error:{…}}`로 resolve된다(src/utils/ResponseWrapper.js:22-31).
2. **실패 응답이 데이터로 캐싱됨** — 기존 ProjectPage.jsx:40-44는 `const {success, ...status} = res; return Object.values(status)`. 실패 시 `Object.values({error:{…}})` = `[errorObj]`가 반환되고, React Query는 이를 **정상 데이터로 간주해 재시도 없이 staleTime(5분) 동안 캐싱**한다.
3. **상태 셀이 빈 값으로 렌더** — ProjectList의 `statusMap`은 `s.id` 키로 빌드되는데 errorObj에는 id가 없어 `statusMap = {undefined: errorObj}` → 모든 행의 `statusMap[data.project_status_key]`가 undefined → StatusTag가 label 없이 빈 테두리만 렌더.
4. **간헐성의 정체** — 일시적 백엔드 오류 1회가 5분간 '상태 없음'으로 고착되고(재시도 0회), 이후 refetch에서 정상 복구 → 사용자에게는 "가끔 안 보였다가 새로고침하면 돌아오는" 증상으로 관측. 근본적으로는 배열을 responseWrapper가 `{success, 0:…, 1:…}`로 인덱스-스프레드하는 기형 계약(F-10) 때문에 성공/실패 응답을 구분할 방법 자체가 취약했다.

같은 패턴이 칸반 보드(`getProjectStatusExistLink` 소비)에도 있었고, F-05 권한 누락과 결합하면 KANBAN read 전용 사용자는 **항상** error 객체가 컬럼으로 빌드된 깨진 보드를 봤다.

### 2.2 수정 내용

| 레이어 | 파일 | 변경 |
|---|---|---|
| 백엔드 계약 | `ProjectStatusService.js` `getProjectStatusListService` / `getProjectStatusExistLinkService` | 배열 직접 반환 → **`{rows:[…]}` 명시 구조**. responseWrapper 결과가 `{success:true, rows:[…]}`로 명확해져 인덱스-스프레드 역조립 제거 |
| 프론트 | `ProjectPage.jsx` (상태 쿼리) | `if (!res?.success) throw` → React Query 기본 재시도(3회, 지수 백오프) + 실패를 성공으로 캐싱하지 않음. 성공 시 `res.rows ?? []` 소비 |
| 프론트 | `ProjectKanbanBoard.jsx` (보드 쿼리) | statusRes/projectRes 각각 `!success` 시 throw. `placeholderData: keepPreviousData`가 있어 재시도·실패 중에도 기존 보드 유지 |
| 프론트 | `backoffice/page/projectStatus/ProjectStatusPage.jsx` | 기존 `if(!success) return []`(조용한 빈 목록 캐싱) → throw + `res.rows` 소비로 통일 |

소비처 전수 확인: `getProjectStatusList`/`getProjectStatusExistLink` invoke 호출은 위 3곳이 전부(grep 검증).

### 2.3 수정 후 동작

- 일시 오류 → 최대 3회 자동 재시도로 대부분 자가 복구, 캐시에 쓰레기 미유입.
- 지속 오류 → 데이터가 undefined로 남아 상태 셀에 "-" 표시(빈 테두리 아님), 창 포커스/마운트 시 재조회로 복구.

---

## 3. 상태 표시 디자인 통일 (Portfolio 컴포넌트 승격)

### 3.1 조사 결과

- Portfolio 통합대시보드의 상태 렌더: `PortfolioProjectTable.jsx` 내부 **로컬 `Badge`**(pill: fontSize 11/weight 600/padding 2px 9px/radius 10) + `token("color.background.information")`/`token("color.text.information")` 고정 색. 공용 컴포넌트가 아니어서 **승격 대상**.
- 기존 목록의 `StatusTag`(components/lozenge)는 `COLOR_OPTIONS`의 **하드코딩 hex를 테두리색으로 직접 사용** → 다크모드 미대응(감사 B2 축과 동일 문제).

### 3.2 구현

- **신규 공용** `static/ui/src/components/lozenge/StatusBadge.jsx`:
  - Portfolio pill 룩 유지.
  - 상태 엔티티 `color` 명(COLOR_OPTIONS value: blue/green/teal/…/greyLight 21종)을 **Atlaskit accent 토큰 쌍**으로 매핑 — `color.background.accent.{계열}.subtlest` + `color.text.accent.{계열}` (Light 변형은 동일 계열 수렴, token은 정적 문자열 호출로 선언) → **다크모드 자동 대응**.
  - color 미지정/미매핑 시 Portfolio 기존 기본값(information 계열) 폴백. label 없으면 "-". `bg`/`textColor` 오버라이드 prop 지원.
- 적용:
  - `ProjectList.jsx` 상태 셀: StatusTag → `<StatusBadge label={status?.name} color={status?.color}/>` (로컬 formatOptionLabel 제거).
  - `PortfolioProjectTable.jsx` 상태 셀: 로컬 Badge → 공용 StatusBadge (기존 시각 결과 동일 유지). stale/risk 뱃지는 상태 표시가 아니므로 로컬 Badge 유지.
- 미변경: ProjectModal의 상태 Select 옵션 라벨(StatusTag)·칸반 컬럼 헤더는 이번 범위 외 — P2 디자인 통일 때 일괄 검토.

---

## 4. 부수 정리 (수정 파일 한정)

- `ProjectList.jsx`: 미사용 import 제거(`useMemo`, `kanbanQueryKeys`, `StatusTag`).
- 신규 파일: `components/modal/ConfirmModal.jsx`, `components/lozenge/StatusBadge.jsx`.
- i18n: `locales/kr/project.json`·`locales/en/project.json`에 `delete.confirm.*` 추가 → `npm run merge` 실행, `ko-KR.json`/`en-US.json` 반영 확인.

## 5. 테스트/빌드 결과

| 검증 | 명령 | 결과 |
|---|---|---|
| 백엔드 테스트 | `npm test` (루트) | **PASS — 14 suites / 219 tests** (permissionMap.contract.test.js 포함, PermissionMap 변경과 정합) |
| 프론트 테스트 | `cd static/ui && npm test -- --watchAll=false` | **PASS — 8 suites / 73 tests / 스냅샷 1** |
| i18n merge | `cd static/ui && npm run merge` | 성공 — `project.delete.confirm.*` 키 ko-KR/en-US 번들 반영 확인 |
| 프론트 빌드 | `cd static/ui && CI=false npm run build` | **성공** ("The build folder is ready to be deployed", 번들 크기 경고는 기존과 동일) |

## 6. 잔여 항목 (이번 범위 외 — 감사 보고서 P1~P3)

- F-15 목록↔칸반 상호 캐시 무효화 (P1), F-14 `projectPagingQueryKeys.all` 팩토리 신설 (P1), F-16 Pagination 제어형 (P1)
- F-17/F-18 등 나머지 색상 token() 치환, 컬럼 삭제 window.confirm의 ConfirmModal 통일 (P2)
- F-21 ProjectKanbanBoard 구조 분해, F-29/F-30 데드 코드 제거 (P3)
- E2E(실 Jira 환경 forge tunnel) 미수행 — 권한 조합별(KANBAN-only read/write, PROJECT write, PSM write) 화면 노출·서버 거부 시나리오 수동 확인 권장.
