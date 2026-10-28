# 프로젝트 관리 페이지(/project) 리팩토링 사전 감사 보고서

- 작성일: 2026-07-13 (브랜치 RFC-152 기준)
- 범위: 프로젝트 목록 탭 + 칸반 탭 프론트/백엔드 전체 (코드 수정 없음, 감사만)
- 심각도 기준: **High** = 잘못된 사용자 피드백/기능 차단/데이터 위험, **Mid** = 조건부 오동작·UX 결함·유지보수 위험, **Low** = 정리 대상

---

## 1. 페이지 구조 개요

### 1.1 파일 맵

```
static/ui/src/
├─ components/tabs/MainPageTabs.jsx        # /project 진입점 — canRead('PROJECT'|'KANBAN')로 탭 게이트
├─ constants/tabs.js                       # mainPageTabs (PROJECT / kanban 두 탭 정의)
│
├─ pages/project/                          # ── 목록 탭 ──
│  ├─ ProjectPage.jsx        (61줄)        # 컨테이너: findProject + getProjectStatusList 쿼리
│  ├─ ProjectHeader.jsx      (67줄)        # 검색 폼 + 프로젝트 추가 버튼 (canWrite PROJECT)
│  ├─ ProjectList.jsx        (143줄)       # CommonTable 목록 + 페이지네이션 + 삭제 mutation
│  └─ modal/ProjectModal.jsx (288줄)       # 추가/수정 모달 (목록·칸반 양쪽에서 공유)
│
├─ pages/projectKanban/                    # ── 칸반 탭 ──
│  ├─ ProjectKanbanBoard.jsx (661줄)       # 보드 + mutation 6종 + 낙관적 업데이트 전부 혼재
│  ├─ KanbanCard.jsx         (222줄)       # 카드 (인라인 이름수정/삭제/인력·이슈 모달 진입)
│  ├─ AddColumnForm.jsx      (48줄)        # 상태(컬럼) 추가 폼
│  ├─ AddCardForm.jsx        (53줄)        # ★ 데드 코드 (참조 0건)
│  ├─ utils/buildData.js     (97줄)        # 상태+프로젝트 → react-kanban-kit dataSource 빌더
│  └─ modal/{user,Issue}/…PanelModal.jsx   # projectDetail의 Panel을 모달로 재사용
│
├─ components/project/                     # ※ 이름과 달리 /project 페이지 전용이 아님
│  ├─ ProjectFilter.jsx / DropdownJql.jsx  # projectDetail 이슈탭·작업이력·분석 전용 JQL 필터
│  └─ ProjectForm.jsx / ImgIcon.jsx        # projectDetail IssueAddModal 전용
│
└─ utils/queryKey/projectKeys.js           # kanbanQueryKeys, projectPagingQueryKeys 등

src/ (백엔드)
├─ resolver/project/ProjectController.js   # 9개 resolver, 전부 guardedDefine
├─ resolver/project/ProjectService.js      # cascade 삭제, 칸반 페치, 아바타 bulk 병합
├─ resolver/project/ProjectRepository.js   # QueryBuilder + scopeCondition(projectScope)
└─ resolver/backoffice/projectStatus/      # 칸반 컬럼(상태) CRUD — 칸반이 직접 호출
```

### 1.2 데이터 흐름

```
[목록 탭]
ProjectPage ── findProject(page,search) ──────────► ["projects",{page,…}]  staleTime 3m / interval 5m
          └── getProjectStatusList ───────────────► ["projectStatus"]      staleTime 5m
ProjectList ── deleteProject ── invalidate ["projects"]        (칸반 캐시 무효화 없음 ← A5)
ProjectModal ─ insertProject/updateProject ─ invalidate ["projects"] + onSaved?.()

[칸반 탭]
ProjectKanbanBoard ── Promise.all(getProjectStatusExistLink, getProjectsRecentForKanban)
                      → buildStatusData + applyProjectListToDataSource
                      → ["kanban"] 단일 캐시 (컬럼+카드 통합 객체)  staleTime/interval 3m
  ├─ 카드 이동      updateFromKanban        (낙관적 + onSettled invalidate)
  ├─ 카드 이름변경  updateFromKanban        (낙관적 + success 체크)
  ├─ 카드 삭제      deleteProject           (낙관적, success 미체크 ← A1)
  ├─ 컬럼 추가      addProjectStatusFromKanban (낙관적 + tempId 치환)
  ├─ 컬럼 삭제      deleteProjectStatus     (성공 시 카드 prev 상태로 캐시 이관)
  ├─ 컬럼 이름변경  updateProjectStatus     (낙관적 + success 체크)
  └─ load more     getOldProjectsForKanban (page/size, 마지막 컬럼 전용)

[공유] ProjectModal이 목록·칸반 양쪽에서 사용되나 권한 키는 KANBAN 고정 ← A2-1
```

계약 특이점: `guardedDefine`(src/permission/permissionGuard.js:99)이 `responseWrapper`를 흡수하므로 **invoke는 절대 reject되지 않고 항상 `{success, ...}`로 resolve**된다(src/utils/ResponseWrapper.js:22-31). 따라서 `useMutation.onError`는 브리지/네트워크 예외에서만 발동하며, 서버 실패(권한 거부 포함)는 `onSuccess`에서 `res.success`를 직접 확인해야 한다. 이 계약을 지키지 않은 곳이 아래 A1 전부다.

---

## 2. 발견 사항

### 2.1 요약표

| # | 심각도 | 분류 | 위치 | 요지 |
|---|--------|------|------|------|
| F-01 | High | A1 | ProjectModal.jsx:59-73 | 저장(insert/update) success 미체크 → 실패에도 성공 토스트+모달 닫힘 |
| F-02 | High | A1 | ProjectList.jsx:91-100 | 프로젝트 삭제 success 미체크 → 실패에도 성공 토스트 |
| F-03 | High | A1 | ProjectKanbanBoard.jsx:308-340 | 칸반 카드 삭제 success 미체크 + onSettled invalidate 없음 → 유령 삭제 |
| F-04 | High | A2 | ProjectModal.jsx:27 | 모달 권한 키가 `KANBAN` 고정 — 목록 탭(PROJECT write)과 불일치 |
| F-05 | High | A2 | PermissionMap.js:101 ↔ MainPageTabs.jsx:13 | 칸반 보드 로딩 API가 `PROJECT_STATUS_MANAGEMENT` read 요구 → KANBAN read만 가진 사용자는 탭은 보이는데 보드 로딩 거부 |
| F-06 | High | A2 | KanbanCard.jsx:85,123 ↔ PermissionMap.js:63 | 칸반 카드 삭제: front `KANBAN` write ↔ 서버 `PROJECT` write 불일치 (F-03과 결합 시 성공 토스트) |
| F-07 | High | A3 | ProjectList.jsx:110-119, ProjectKanbanBoard.jsx:342-345 | 프로젝트 삭제(8테이블 cascade)에 확인(confirm) 절차 전무 |
| F-08 | High | 백엔드 | ProjectStatusService.js:60-65 | 컬럼 추가 롤백 후 에러 미전파 → 저장 안 됐는데 `success:true, id` 반환 |
| F-09 | Mid | A2 | ProjectKanbanBoard.jsx:566-607 ↔ PermissionMap.js:97-98 | 컬럼 이름변경/삭제: front `KANBAN` write ↔ 서버 `PROJECT_STATUS_MANAGEMENT` write 불일치 |
| F-10 | Mid | A1/A3 | ProjectPage.jsx:40-44, ProjectKanbanBoard.jsx:52-54 | `{success,...rest}` 구조분해 후 Object.values — 실패 시 error 객체가 상태/컬럼 데이터로 렌더 |
| F-11 | Mid | A1/A3 | ProjectKanbanBoard.jsx:140-147 | 카드 이동 실패(success:false) 시 무피드백 — 카드가 조용히 원위치 |
| F-12 | Mid | A3 | ProjectKanbanBoard.jsx:403,407,413 | 존재하지 않는 i18n 키 `common.toast.title.editSuccess`/`title.fail` 사용 |
| F-13 | Mid | A1/A3 | ProjectKanbanBoard.jsx:423-461 | load more 실패 시 console.error만 — 조용한 실패 |
| F-14 | Mid | A4 | ProjectList.jsx:97-99, ProjectModal.jsx:67-69 | invalidate에 인라인 키 `["projects"]` — 팩토리에 prefix 키 부재 |
| F-15 | Mid | A5 | ProjectList.jsx:97 / ProjectKanbanBoard.jsx:154 등 | 목록↔칸반 상호 캐시 무효화 전무 — 3~5분 폴링에만 의존 |
| F-16 | Mid | B5 | ProjectList.jsx:127-135 | Pagination 비제어(defaultSelectedIndex) — 검색으로 page 리셋 시 하이라이트 불일치 |
| F-17 | Mid | B2 | ProjectList.jsx:48 | 링크색 `#0052CC` 하드코딩 — 다크모드 미대응 |
| F-18 | Mid | B2 | ProjectKanbanBoard.jsx:542, ProjectModal.jsx:164 | 로딩 오버레이 `rgba(255,255,255,…)` — 다크모드에서 흰 막 |
| F-19 | Mid | B2 | AddColumnForm.jsx:30 | 토큰 문자열을 raw CSS 값으로 사용(`backgroundColor:"color.background.disabled"`) — 무효 스타일 + `#1868DB` 하드코딩 |
| F-20 | Mid | B3 | ProjectKanbanBoard.jsx:84-87 | 컬럼 너비 산식에 최소폭 하한 없음 — 상태 수 증가 시 카드 뭉개짐 |
| F-21 | Mid | C2/D1 | ProjectKanbanBoard.jsx (661줄 전체) | 거대 컴포넌트 + configMap/렌더함수 매 렌더 재생성 + hover state로 보드 전체 리렌더 |
| F-22 | Mid | C3 | ProjectKanbanBoard.jsx:612-620 ↔ ProjectRepository.js:101-134 | load more 버튼이 마지막 컬럼 전용인데 쿼리는 상태 무관 — 다른 컬럼에도 카드 삽입됨 |
| F-23 | Low | A4 | projectKeys.js:2,5-7,15-17 | kanbanQueryKeys는 상수 배열, findProjectByIdQueryKeys는 함수 — 팩토리 스타일 불일치 |
| F-24 | Low | B4 | ProjectList.jsx:128-134, ProjectHeader.jsx:49-52, ProjectModal.jsx:220-241 | 영문 하드코딩 라벨 (Next/Previous/refresh/Clear start date 등) |
| F-25 | Low | B4 | locales/kr/common.json:42 | "장싱적으로" 오타 |
| F-26 | Low | B5 | KanbanCard.jsx:113,124-141, ProjectKanbanBoard.jsx:592-607,628 | 빈 label 아이콘, Box+onClick 클릭 타겟(키보드 접근 불가) |
| F-27 | Low | A3 | ProjectModal.jsx:76-79 | 저장 실패 토스트가 삭제용 메시지(`project.delete.toast.description.fail`) 재사용 |
| F-28 | Low | B3 | ProjectKanbanBoard.jsx:300 | 컬럼 삭제만 window.confirm — Atlaskit 모달 UX와 불일치(카드/목록 삭제는 아예 없음 → F-07) |
| F-29 | Low | D3 | AddCardForm.jsx 전체 | 데드 코드 (참조 0건) + 한글 하드코딩("프로젝트 입력?","추가","취소") + 무효 토큰 스타일 |
| F-30 | Low | D3 | ProjectKanbanBoard.jsx:463-508 | `refreshStatus` 미사용 데드 코드 (+ 새로고침에 "추가 성공" 토스트 카피) |
| F-31 | Low | D3 | ProjectPage.jsx:1,13,14 / ProjectList.jsx:2,11 / ProjectModal.jsx:19 | 미사용 import·변수 (useEffect, t, queryClient, useMemo, kanbanQueryKeys, projectPagingQueryKeys) |
| F-32 | Low | D3 | ProjectService.js:148 ↔ ProjectRepository.js:65 | `isInitialLoad` 파라미터 — repository에서 미사용(데드 파라미터) |
| F-33 | Low | D2 | ProjectList.jsx:141-143 ↔ ProjectModal.jsx:286-288 | `formatOptionLabel` 중복 정의 |
| F-34 | Low | D2/구조 | ProjectPage.jsx:57 ↔ ProjectList.jsx:137 | `toast.FlagUI` 이중 렌더 — FlagPortal register 경합(마지막 마운트만 유효, ToastFlags.js:68-73) |
| F-35 | Low | D | components/project/ 디렉토리 | 이름과 달리 전부 projectDetail 전용 — 배치/명명 오해 소지 |
| F-36 | Low | C1 | ProjectRepository.js:65-98 | 칸반 초기 로드가 최근 프로젝트 무페이징 전량 — 규모 증가 시 재검토 |
| F-37 | Low | 안정성 | ProjectModal.jsx:22 | 모듈 스코프 top-level `await view.getContext()` — 코드베이스 관례(10곳)이나 import 시점 부수효과, 번들 청크 로딩 실패 지점 |
| F-38 | Low | 안정성 | ProjectModal.jsx:120 | `userSet.values().map(…)` — Iterator Helpers(ES2025) 의존, 구형 브라우저에서 TypeError |

### 2.2 상세 근거 — High 항목

#### F-01. ProjectModal 저장 success 미체크 (A1 — 이미 4건 수정된 버그 클래스와 동일 패턴)
`ProjectModal.jsx:53-81`:
```js
const saveMutation = useMutation({
    mutationFn: (payload) => invoke(editId ? "updateProject" : "insertProject", payload),
    onSuccess: () => {           // ← res 인자 자체를 받지 않음
        toast.showSuccess(...);  // 서버가 {success:false, error}여도 무조건 성공 토스트
        queryClient.invalidateQueries({ queryKey: ["projects"] });
        onSaved?.(); onClose();
    },
```
`responseWrapper`(ResponseWrapper.js:22-31)는 예외를 `{success:false}`로 흡수해 resolve하므로 권한 거부(PermissionMap.js:61-62의 W('PROJECT') 위반), SQL 오류, 라이선스 비활성 전부 "성공" 처리된다. F-04와 결합하면 실제로 재현 가능(KANBAN write만 가진 사용자가 칸반에서 프로젝트 추가 → 서버 거부 → 성공 토스트 + 모달 닫힘 + 카드 미생성).
**권장**: `onSuccess: (res) => { if (!res.success) { … showError; return; } … }` — 같은 파일 내 addColumnMutation(ProjectKanbanBoard.jsx:198-207)의 처리 방식이 모범 사례.

#### F-02. 목록 삭제 success 미체크 (A1)
`ProjectList.jsx:87-108`: `deleteProjectMutation.onSuccess`가 인자 없이 성공 토스트 + invalidate. `deleteProject`는 `W('PROJECT','detail')`(PermissionMap.js:63) + projectScope 검증(permissionGuard.js:38-51) 대상이라 MEMBER_ONLY 사용자의 비소속 프로젝트 삭제 시도 등 실패 경로가 실존한다. invalidate가 실행되어 refetch로 목록은 복원되지만 토스트는 "삭제 성공".

#### F-03. 칸반 카드 삭제 — success 미체크 + 낙관적 제거 미복원 (A1)
`ProjectKanbanBoard.jsx:308-340`: `onMutate`에서 카드를 캐시에서 제거한 뒤, `onSuccess`가 `res.success`를 확인하지 않고 성공 토스트를 띄운다. **onSettled invalidate도 없어** 서버가 `{success:false}`를 반환해도 카드는 최대 3분(refetchInterval, :60)간 사라진 채 유지된다. 같은 컴포넌트의 cardMoveMutation은 onSettled invalidate(:154)가 있어 자기복구되는 것과 대조적.

#### F-04. ProjectModal 권한 키 `KANBAN` 고정 (A2)
`ProjectModal.jsx:27`: `const canWrite = usePermissionStore(s=>s.canWrite("KANBAN"));`
이 모달은 목록 탭(ProjectPage.jsx:56)과 칸반(ProjectKanbanBoard.jsx:648) 양쪽에서 쓰인다. 목록 쪽 진입 버튼은 `canWrite("PROJECT")`로 게이트(ProjectHeader.jsx:25,57 / ProjectList.jsx:36,77-85)되므로:
- PROJECT write O / KANBAN write X → 목록에서 "추가/수정" 버튼은 보이는데 모달 안 제출 버튼·입력 필드가 전부 비활성(isDisabled={!canWrite}, :146-156,180,192).
- KANBAN write O / PROJECT write X → 칸반에서 제출 가능해 보이지만 서버 `insertProject/updateProject = W('PROJECT')`(PermissionMap.js:61-62)에서 거부 → F-01로 성공 토스트.
**권장**: 호출 컨텍스트에서 권한 키(또는 canWrite 불리언)를 prop으로 주입.

#### F-05. 칸반 보드 로딩 권한 비대칭 (A2)
칸반 탭 노출은 `canRead('KANBAN')`(MainPageTabs.jsx:13, tabs.js:49)인데, 보드 데이터의 절반인 `getProjectStatusExistLink`는 `R('PROJECT_STATUS_MANAGEMENT')`(PermissionMap.js:101)이다. 같은 성격의 `getProjectStatusList`는 `OR([PSM read, KANBAN read, PROJECT read])`(:102)로 열어놨는데 ExistLink만 누락 — KANBAN read만 가진 사용자는 탭은 보이지만 컬럼 로딩이 거부되고, F-10 패턴 때문에 error 객체 1건이 "컬럼"으로 빌드되어 깨진 보드가 렌더된다.
**권장**: PermissionMap에서 `getProjectStatusExistLink`를 `getProjectStatusList`와 동일한 OR 규칙으로.

#### F-06 / F-09. 칸반 write 계열 front↔server 권한 불일치 (A2)
front는 전부 `canWrite('KANBAN')`으로 노출 제어하지만 서버 요구 권한이 제각각:
| 동작 | front 게이트 | 서버 가드 | 일치 |
|---|---|---|---|
| 카드 이동/이름변경 (updateFromKanban) | KANBAN write (ProjectKanbanBoard.jsx:530) | `W('KANBAN','detail')` (PermissionMap.js:69) | O |
| 카드 삭제 (deleteProject) | KANBAN write (KanbanCard.jsx:123) | `W('PROJECT','detail')` (:63) | **X** |
| 컬럼 추가 (addProjectStatusFromKanban) | KANBAN write (:639) | `OR(KANBAN∥PSM write)` (:104) | O |
| 컬럼 이름변경 (updateProjectStatus) | KANBAN write (:566-579) | `W('PROJECT_STATUS_MANAGEMENT')` (:98) | **X** |
| 컬럼 삭제 (deleteProjectStatus) | KANBAN write (:589-607) | `W('PROJECT_STATUS_MANAGEMENT')` (:97) | **X** |

컬럼 이름변경/삭제는 success 체크가 있어 에러 토스트+롤백은 되지만(그마저 F-12의 깨진 i18n 키), 카드 삭제는 F-03과 결합해 성공 토스트가 뜬다. addProjectStatusFromKanban에 적용한 OR 패턴을 나머지에도 적용하거나, 칸반의 컬럼 편집 UI를 PSM write 보유자에게만 노출하는 정책 결정 필요.

#### F-07. 프로젝트 삭제 무확인 (A3/UX)
프로젝트 삭제는 8개 테이블 순차 cascade(ProjectService.js:89-106: projectusers, dashboard, snapshot, gantt 3종, skills, project) + KVS 캐시 무효화가 걸린 비가역 작업인데:
- 목록: `ProjectList.jsx:65` 드롭다운 "삭제" 클릭 즉시 `deleteProject(...)` 실행 — confirm 없음.
- 칸반 카드: `KanbanCard.jsx:134-139` → `handleDeleteCard`(ProjectKanbanBoard.jsx:342-345) — confirm 없음.
- 컬럼 삭제만 `window.confirm`(ProjectKanbanBoard.jsx:300) 존재.
**권장**: 공용 확인 모달(Atlaskit ModalDialog appearance="danger")로 3곳 통일.

#### F-08. (백엔드) 컬럼 추가 링크 실패 시 성공 응답 (칸반 관련 resolver)
`ProjectStatusService.js:59-65`:
```js
await queryManager.save(id, data);
try {
    await linkManager.save(linkId, linkData);
} catch (e){
    await queryManager.delete(id); // 상태 롤백은 하지만
}
return {id:id};                    // ← 에러를 다시 던지지 않고 성공 반환
```
링크 저장 실패 시 상태를 지워놓고도 `{success:true, id}`를 반환한다. 프론트(ProjectKanbanBoard.jsx:198-221)는 tempId를 이 id로 치환하므로, 존재하지 않는 컬럼이 성공 토스트와 함께 보드에 남고 다음 refetch(3분) 때 소리 없이 사라진다. **catch에서 rethrow 필요.**

### 2.3 상세 근거 — 대표 Mid/Low

- **F-10 (Mid)** `ProjectPage.jsx:40-44`, `ProjectKanbanBoard.jsx:52-54`: 서비스가 배열을 반환하고 responseWrapper가 `{success:true, ...배열}`로 스프레드(ResponseWrapper.js:18-21) → 프론트가 `const {success,...status}=res; Object.values(status)`로 역변환하는 기형 계약. `success:false`면 `Object.values({error:{…}})`가 `[errorObj]`가 되어 상태 옵션/칸반 컬럼으로 렌더된다. 서비스가 `{rows:[…]}` 형태로 감싸 반환하도록 계약 정리 권장 (getProjectStatusList·ExistLink 공통).
- **F-11 (Mid)** `ProjectKanbanBoard.jsx:140-147`: 카드 이동 onSuccess가 `if (res.success)`일 때만 토스트 — else 분기 없음. onSettled invalidate(:154)로 원위치는 되지만 사용자는 이유를 모른다(권한 거부·scope 거부가 실존 경로).
- **F-12 (Mid)** `ProjectKanbanBoard.jsx:403,407,413`: `t("common.toast.title.editSuccess")`, `t("common.toast.title.fail")` — common.json에는 `toast.title.{success,Fail}`과 `toast.description.{editSuccess,fail}`만 존재(locales/kr/common.json:29-44). 컬럼 이름변경 성공/실패 시 번역 안 된 raw 키가 토스트에 노출.
- **F-14 (Mid)** `ProjectList.jsx:97-99`, `ProjectModal.jsx:67-69`: `["projects"]` 인라인 키. `projectPagingQueryKeys`에는 `projects(page,searchParam)`만 있고 prefix용 `all`이 없다(projectKeys.js:5-7). CLAUDE.md 규칙("새 쿼리 키는 반드시 팩토리로") 위반 상태 — `projectPagingQueryKeys.all = ["projects"]` 추가 후 참조 통일.
- **F-15 (Mid)** 목록 삭제/저장은 `["projects"]`만(ProjectList.jsx:97, ProjectModal.jsx:67), 칸반 조작은 `["kanban"]`만(ProjectKanbanBoard.jsx:154,201,259,652) 무효화. 목록에서 지운 프로젝트가 칸반에 최대 3분, 칸반에서 이동·개명·삭제한 결과가 목록에 최대 5분 잔존(각 refetchInterval, ProjectPage.jsx:31-32 / ProjectKanbanBoard.jsx:59-60). 칸반의 ProjectModal만 onSaved로 kanban invalidate(:651-653)를 받는 비대칭. **권장**: mutation 성공 시 두 키를 함께 invalidate하는 공용 훅.
- **F-16 (Mid)** `ProjectList.jsx:132`: `defaultSelectedIndex={page-1}` — Atlaskit Pagination 비제어 프로퍼티라 최초 마운트에만 반영. 검색 시 `setPage(1)`(ProjectHeader.jsx:22,33)해도 하이라이트는 이전 페이지에 남는다(데이터는 1페이지 → 표시 불일치). `selectedIndex` 제어형으로 전환 필요.
- **F-17~F-19 (Mid, B2)** 다크모드 깨짐 포인트: 링크색 `#0052CC`(ProjectList.jsx:48 — `token('color.link')`로), 흰색 로딩 오버레이(ProjectKanbanBoard.jsx:542, ProjectModal.jsx:164 — `token('elevation.surface')` 계열 + opacity), AddColumnForm.jsx:30의 `#1868DB` 테두리와 **raw CSS 값으로 들어간 토큰 문자열**(`backgroundColor:"color.background.disabled"` — 브라우저가 무시, `token()` 호출 누락), 점선 테두리 `#CBD5E1`(ProjectKanbanBoard.jsx:626). 반면 KanbanCard.jsx:19-77의 xcss 토큰 사용은 모범적 — 이 스타일로 통일. 브랜드 틸(#21ADAD) 적용 여부는 별도 디자인 결정 사항.
- **F-21 (Mid, C2/D1)** ProjectKanbanBoard.jsx 661줄: mutation 6종 + 낙관적 업데이트 헬퍼 + 빌드 + 레이아웃 계산 + 렌더가 한 파일. `configMap`(:510-532)과 `renderColumnHeader/renderListFooter`(:559-632)가 매 렌더 재생성되고, 컬럼 hover마다 `setHoveredColId`(:562-563)로 보드 전체가 리렌더된다(카드 수십 장 기준 체감 가능). 간트의 `useGanttMutations.js` 전례대로 `useKanbanMutations` 훅 분리 + hover는 CSS(:hover)로 대체 권장.
- **F-22 (Mid, C3)** load more 버튼은 마지막 컬럼에만 렌더(ProjectKanbanBoard.jsx:613-620)되지만 `getOldProjectsForKanban`은 상태 무관 `end_date < CURDATE()-7일` 전체를 페이징(ProjectRepository.js:110) — 클릭하면 다른 컬럼에도 카드가 삽입된다(buildData의 statusId 기준 삽입, ProjectKanbanBoard.jsx:435-449). "완료 컬럼에서 과거 프로젝트 더보기"라는 UI 의도와 쿼리 조건이 어긋남. 또한 `hasMoreOld` 초기값 true(:34)라 과거 데이터가 없어도 버튼이 노출된다.
- **F-29/F-30 (Low, D3)** `AddCardForm.jsx` 전체(참조 0건 — 카드 추가가 ProjectModal 경유로 바뀐 잔재)와 `refreshStatus`(ProjectKanbanBoard.jsx:463-508, 참조 0건) 삭제 가능. 둘 다 지우면 관련 결함(한글 하드코딩, 무효 토큰 스타일, 부적절한 토스트 카피, console.error 2건 중 1건)이 함께 소멸.
- **F-31 (Low, D3)** 미사용 심볼: ProjectPage.jsx:1 `useEffect`·:13 `t`·:14 `queryClient`, ProjectList.jsx:2 `useMemo`·:11 `kanbanQueryKeys`, ProjectModal.jsx:19 `projectPagingQueryKeys`, ProjectKanbanBoard.jsx:591 주석 코드.
- **F-34 (Low)** `toast.FlagUI`가 ProjectPage.jsx:57과 ProjectList.jsx:137에 이중 렌더 — ToastFlags의 FlagPortal은 register로 emitRef를 덮어쓰므로(ToastFlags.js:68-73) 마지막 마운트만 동작하고 하나는 죽은 포털. 동작은 하나 마운트 순서 의존적이라 제거 필요(ProjectList 쪽 삭제).
- **기타 Low**: 영문 하드코딩(F-24), 접근성(F-26 — Box+onClick 클릭 타겟은 Atlaskit IconButton으로), 삭제 실패 메시지 재사용(F-27), `isInitialLoad` 데드 파라미터(F-32), `formatOptionLabel` 중복(F-33), components/project 명명 혼동(F-35), 칸반 무페이징 초기 로드(F-36), top-level await(F-37), Iterator Helpers 의존(F-38).

### 2.4 양호한 점 (리팩토링 시 보존)

- 목록 테이블은 이미 `CommonTable` 사용(ProjectList.jsx:1,126) — 2026-06-18 통일 기조 부합.
- 칸반 낙관적 업데이트 + 롤백 구조(withOptimistic, ProjectKanbanBoard.jsx:90-98)와 addColumn의 tempId→서버 id 치환(:211-221)은 잘 설계됨.
- 백엔드 아바타 병합은 bulk API(ProjectService.js:178-200)로 N+1 없음. scopeCondition의 UUID 검증(ProjectRepository.js:16-23)도 견고.
- 쿼리 staleTime/keepPreviousData 사용(ProjectPage.jsx:31-34)으로 목록 깜빡임 방지 처리돼 있음.
- KanbanCard의 xcss 토큰 스타일(KanbanCard.jsx:19-77)은 다크모드 대응 모범 사례.

---

## 3. 리팩토링 우선순위 제안

### P0 — 버그성 (동작 신뢰 회복, 반나절~1일)
1. **success 체크 일괄 적용** (F-01, F-02, F-03, F-11, F-13): `onSuccess:(res)=>{ if(!res.success){ rollback+showError; return; } … }` 패턴으로 5곳 수정. F-03은 onSettled invalidate 추가 포함. — 기수정된 ProjectIssueTable 4건과 같은 클래스이므로 수정 후 `invoke(...)` 소비처 전역 재점검 1회 권장.
2. **권한 정합** (F-04, F-05, F-06, F-09): ProjectModal 권한 키 주입화, PermissionMap에서 `getProjectStatusExistLink` OR 확장, 칸반 카드 삭제·컬럼 편집의 front/server 기준 통일(정책 결정 필요: "칸반 write = 프로젝트/상태 편집 가능"인지).
3. **삭제 확인 모달** (F-07, F-28): 공용 danger confirm 모달로 목록/카드/컬럼 3곳 통일.
4. **백엔드 rethrow** (F-08) + **깨진 i18n 키** (F-12) + **상태 목록 응답 계약 정리** (F-10).

### P1 — 정합/UX (P0와 같은 PR 또는 직후)
5. **캐시 상호 무효화** (F-14, F-15): `projectPagingQueryKeys.all` 신설 → 프로젝트 변이 성공 시 `["projects"]`+`["kanban"]` 동시 invalidate하는 공용 헬퍼(또는 useProjectMutations 훅).
6. **Pagination 제어형 전환** (F-16), **load more 조건 정리** (F-22).

### P2 — 디자인 통일 (다크모드 대응 일괄)
7. 하드코딩 색상 → `token()` 치환 (F-17, F-18, F-19 및 #CBD5E1) — dark-mode-fix 워크스페이스 전례 참고. 브랜드 틸 스케일 적용 여부는 이때 함께 결정.
8. i18n 하드코딩·오타 정리 (F-24, F-25, F-27) — locales/kr·en 추가 후 `npm run merge`.
9. 접근성: 아이콘 클릭 타겟 IconButton화 + label 부여 (F-26).

### P3 — 구조 (기능 동결 상태에서)
10. ProjectKanbanBoard 분해 (F-21): `useKanbanMutations` 훅 + 컬럼 헤더/푸터 컴포넌트 추출, hover CSS화, configMap useMemo.
11. 데드 코드 제거 (F-29~F-32, F-34) 및 `formatOptionLabel` 등 중복 통합 (F-33), ProjectList 파생상태 useMemo화.
12. components/project 디렉토리 재배치 검토 (F-35), 칸반 초기 로드 페이징 검토 (F-36).

> 순서 근거: P0는 "실패했는데 성공했다고 알리는" 신뢰 파괴 버그와 권한 우회 표시라 최우선. P2 색상 치환은 기계적이라 P0/P1과 독립 병행 가능. P3 구조 분해는 P0 수정 지점(mutation들)을 옮기는 작업이므로 반드시 P0 이후에.
