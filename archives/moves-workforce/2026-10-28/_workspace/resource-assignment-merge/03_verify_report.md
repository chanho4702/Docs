# 자원관리 탭 재편 (resource-assignment-merge) — 통합 정합성 검증 리포트

- **일자**: 2026-07-23
- **브랜치**: RFC-160
- **검증자**: integration-verifier
- **입력**: `01_architect_design.md`(계약) · `02_backend_report.md` · `02_frontend_report.md` + 실제 소스
- **결론**: **통합 계약 위반 0건.** 권한 OR 미러링·재사용 shape·invalidate 경계 모두 정합. 백엔드 315/315, 빌드 통과. 프론트 테스트 1개 무관 스위트 실패(RFC-169, 본 기능과 무관·환경성) — 아래 E 참조.

---

## 통과 (PASS)

### A. 권한 경계면 (핵심) — PASS
생산자(PermissionMap) ↔ 소비자(프론트 게이트) 함수 단위 대조. 전부 일치.

| 경계면 | 서버 grant (PermissionMap.js) | 프론트 게이트 | 판정 |
|---|---|---|---|
| 셀렉터 | `getActiveProjects` OR[PROJECT read, RESOURCE_MANAGEMENT read] `list` (:68) | `/resource` 진입 = `canRead('RESOURCE_MANAGEMENT')` (ResourcePage.jsx:15) → 서버 OR 로 통과 | ✅ |
| board | `getWorkAssignmentBoard` OR[PROJECT read, RESOURCE_MANAGEMENT read] `detail` (:231) | 동일(진입 게이트 + 서버 OR) | ✅ |
| **assign** | `assignWorkItem` OR[PROJECT **write**, RESOURCE_MANAGEMENT **write**] `inherited` (:239) | `canAssign = canWriteProject \|\| canWriteResource` → `canWrite={canAssign}` (AssignmentPage.jsx:75,315) | ✅ **write 로 미러링(read 아님)** — 버튼 보이는데 서버 거부 조합 **없음** |
| pool | `getWorkAssignmentPool` R RESOURCE_MANAGEMENT `detail` (:233) **무변경** | 프론트가 pool 접근을 여는 **새 게이트 없음** — 기존 `board.meta.poolAvailable` 마스킹만(AssignmentPage.jsx:93) | ✅ |
| 요구스킬 편집 | `setProjectSkills` W PROJECT `detail` (:224) **무변경** | `canWrite('PROJECT')` (RequiredSkillEditor.jsx:23) | ✅ 미보유=읽기전용 |

- **assign read-게이팅 부재 확인(요청 필수 항목)**: 프론트에서 assign 버튼을 `canRead('RESOURCE_MANAGEMENT')`로 여는 곳 없음. `canWriteResource`(:72)만 사용. ✅
- **계약 테스트 고정 확인**: `permissionMap.contract.test.js:176` — `hasGrant('assignWorkItem','RESOURCE_MANAGEMENT','read')` → **`false`** 로 명시 고정. `isSatisfied` 블록(:204-205) — 자원관리 read-only principal 은 `assignWorkItem` **차단**. "assign 은 RESOURCE_MANAGEMENT read 로 안 열림"이 실제 테스트로 잠김. ✅
- **프로젝트 상세 회귀 없음**: OR 첫 항이 PROJECT read/write. 프로젝트 상세 배정 탭 진입자는 애초 PROJECT read/write 보유 → 첫 grant 로 통과, 판정 불변. ✅
- **projectScope 불변**: `permissionGuard.js`·`PrincipalResolver.js` git diff **0**. `enforceProjectScope` 미변경, mode 값 `list`/`detail`/`inherited` 그대로. ✅

### B. AssignmentPage 재사용 회귀 (다중 컨텍스트) — PASS
`AssignmentPage`가 두 곳에서 렌더:
- 프로젝트 상세 탭: `tabs.js:106` — `<AssignmentPage project_id={project_id} toast={toast} />`
- 자원관리 통합 탭: `ProjectAssignmentTab.jsx:189` — `<AssignmentPage key={projectId} project_id={projectId} toast={toast} />`

| 점검 | 결과 |
|---|---|
| props shape | 양쪽 **동일** `{ project_id, toast }`. shape 차이 0 | ✅ |
| toast 인터페이스 | 양쪽 다 `ToastFlags()` 주입. AssignmentPage 는 `toast?.showSuccess?.(t,d)`/`showError?.` 호출(:209,220), ToastFlags 는 `showSuccess/showError/showInfo/FlagUI` 제공(ToastFlags.js:76-85) → 메서드 집합 일치 | ✅ |
| 78vh 레이아웃 | `PANEL_HEIGHT='78vh'`/`PANEL_MIN_HEIGHT=480`(:47-48) — 컴포넌트 내부 상수라 양쪽 동일 | ✅ |
| `key={projectId}` remount | 자원관리 탭에서 부여(:189, 프로젝트 전환 시 선택이슈/필터/poolOpen 리셋). 프로젝트 상세는 단일 프로젝트라 미부여 — AssignmentPage 가 `project_id` 변경을 스스로 감지(useWorkAssignmentBoard 키), 회귀 없음 | ✅ |

**다중 shape 재사용 점검 — `ResourceProfileDrawer`** (2026-07-22 신규 항목 적용):
`fallbackPerson`을 서로 다른 2 shape 로 받는다.

| 참조 필드 (Drawer.jsx:161-166) | AssignmentPage `candidate` | ProjectGraphSection 객체(:73-77) | 비고 |
|---|---|---|---|
| `displayName` | ✅ | ✅ | 공통 |
| `avatarUrls['24x24']` | ✅ | ✅ (`{'24x24': m.avatarUrl}`) | 공통 |
| `roleName` | ✅ | ⚠️ 없음 → `'-'` | A 전용 |
| `levelName` | ✅ | ⚠️ 없음 → `'-'` | A 전용 |

→ `header`는 **프로필 도착 전 잠깐 쓰는 fallback**(:104, 이후 `profile`가 덮음)이고 누락 필드는 옵셔널 체이닝 `?? '-'`로 안전 처리. 조용한 오값 렌더 아님(과부하 오판 같은 실패 모드 없음). **허용 가능** — 결함 아님. (관계도 노드 클릭 시 직군/등급이 프로필 로드 전 순간적으로 '-'로 보일 수 있는 UX 수준, 기능 무해)

### C. 내부 소비자 전수 — PASS
- **제거 5파일 참조 0**: `ProjectMatchTab`/`CandidateRankTable`/`useProjectSkillMatch`/`AllocationTab`/`AllocationFilters` 전역 grep → import/lazy/문자열 참조 **0건**. 남은 매칭은 주석 2건뿐(ProjectAssignmentTab.jsx:48,131 설명 주석 · AssignmentCandidateTable.jsx:18 비교 주석). ✅
- **`RequiredSkillEditor.onSaved` 하위호환**: 옵셔널 prop(:19), `onSaved?.()`(:51). 미전달 시 기존 동작 유지. 소비처는 ProjectAssignmentTab 단 하나(제거된 ProjectMatchTab 외 신규 소비자 없음). ✅
- **재사용 3파일 무수정**: `AllocationGraph.jsx`/`useResourceAllocation.js`/`allocationGraphOption.js` git diff --stat **공백(무수정)**. ✅

### D. invalidate 경계 — PASS
- **assign 경로 invalidate 0건**: `useAssignWorkItem.js:46-50` — `setQueryData`만, `// ★ invalidateQueries(assignmentKeys.*) 절대 금지` 주석 유지. assignment 디렉토리 전역에 assign 경로 invalidate 없음. ✅
- **board invalidate 유일 지점**: `ProjectAssignmentTab.jsx:179-181` — `invalidateQueries({ queryKey: assignmentKeys.board(projectId) })`, `RequiredSkillEditor.onSaved`로 전달 → `RequiredSkillEditor.jsx:51` `onSuccess` 에서 호출. 요구스킬은 `skill_mapping` SQL write(인덱스 지연 없음)라 안전. **스킬 저장 경로에만** 존재. ✅
- 쿼리키 전부 팩토리: `resourceKeys.activeProjects()`(:7)/`assignmentKeys.board`(:13) — 인라인 배열 아님. ✅

### E. 실행 — 부분 PASS

| 항목 | 결과 | 판정 |
|---|---|---|
| 백엔드 `npm test` | **16 suites / 315 tests 전부 통과** (contract 신규 10 포함) — 315 기준 일치 | ✅ |
| 프론트 `npm test` | 16 passed / **1 failed suite** / 17 total, **194 tests passed** | ⚠️ 아래 참조 |
| 프론트 `npm run build` | **통과** — dangling import 0, bundle-size 경고만(기존). prebuild merge 실행됨 | ✅ |
| i18n kr/en 대칭 | `locales/kr\|en/resource.json` 구조 대칭. merge 후 `ko-KR.json`/`en-US.json`에 `resource.tab.assignment`·`resource.assignment.*` 반영 확인 | ✅ |
| 사용 키 전수 | ProjectAssignmentTab(`assignment.selectProject/noProject/requiredSkills.toggle/graph.toggle/graph.empty`)·ResourcePage(`tab.overview/assignment`,`page.*`)·RequiredSkillEditor(`match.editRequired/placeholder/save.success`) 전부 kr/en 존재 | ✅ |

**프론트 테스트 1개 스위트 실패 — 본 기능 무관(환경성)**:
- 실패: `static/ui/src/pages/projectDetail/issue/workListQuery.test.js` → *Test suite failed to run: Unable to establish a connection with the Custom UI bridge*.
- 원인: `@forge/bridge`의 `view`를 모듈 로드 시점에 import(→ `getCustomFieldId`)하는데 이 테스트가 `@forge/bridge`를 **mock 하지 않음**(`jest.mock` 0건). 테스트 환경에 브리지가 없어 import 단계에서 throw.
- 귀속: 이 파일은 커밋 `073ac74 #RFC-169(프로젝트 상세 작업 할당 페이지)` 소속. **resource-assignment-merge 변경 집합과 무관**(resource/permission 파일 아님).
- 판정: **본 기능의 회귀 아님(pre-existing/환경성)**. 자원관리·배정 관련 스위트(`workloadState`/`patchAssignmentCache`/`queueFilter`)는 전부 PASS.
- **02_frontend_report 의 "17 suites / 213 tests 통과" 주장과 불일치**: 실제 실행 시 이 스위트가 로드 실패하여 그 안의 ~19 테스트가 미실행(213→194). 프론트 리포트가 이 실패를 누락했거나 실행 환경(전역 브리지 mock)이 달랐을 가능성. **자원관리 기능 검증에는 영향 없음**이나 기록을 위해 명시.

---

## 미검증 (E2E — 배포 후 실환경 필요)

빌드/단위 통과 ≠ 런타임 정상. 아래는 코드 정합으로는 통과이나 실데이터/실권한 확인 필요.

1. **관계도 조인 키 (설계 §4.5 검증 포인트)** — `useResourceAllocation`의 `projects[].projectId`/`links[].projectId`(getResourceAllocationGraph 산출 RMS uuid) ↔ 셀렉터 value(`getActiveProjects.rows[].project_id` uuid) 동일 체계 여부. 코드상 동일 체계로 보이나 **실데이터 1회 확인 필요**(불일치 시 관계도 `assignment.graph.empty`로 빈다). [프론트 리포트도 배포 후 확인 권장 명시]
2. **RESOURCE_MANAGEMENT read-only 계정 board 조회** — PROJECT read 미보유·RESOURCE_MANAGEMENT read 보유 계정으로 통합 탭 진입 → 셀렉터/board 가 `PERMISSION_DENIED` 없이 뜨는지(서버 OR 실동작).
3. **write 없는 계정 배정 버튼 비활성** — RESOURCE_MANAGEMENT read만(write 없음) 계정에서 배정 버튼 비노출/비활성 + 강제 호출 시 서버 차단(contract 로 단위 고정됨, 실환경 재확인).
4. **RESOURCE_MANAGEMENT write 계정 배정 실행** — PROJECT write 없이 RESOURCE_MANAGEMENT write 만으로 배정 성공(Jira `ASSIGN_ISSUES` 최종 판정 통과 시).
5. **MEMBER_ONLY 자원관리자** — 장벽 B(enforceProjectScope)로 비소속 프로젝트 차단되는지(안전한 축소 동작 확인). 운영 전제는 projectScope='ALL'.

### E2E 체크리스트 (자원관리 관점)
- [ ] RESOURCE_MANAGEMENT read only 계정: `/resource` → [프로젝트 배정] 탭 진입 → 셀렉터에 활성 프로젝트 표시 → 프로젝트 선택 시 board 로드(PERMISSION_DENIED 없음)
- [ ] 위 계정: 배정 버튼 비활성/비노출, 후보 드로어는 열림(read)
- [ ] RESOURCE_MANAGEMENT write 계정: 배정 실행 성공, 배정 후 화면 롤백 없음(setQueryData 패치)
- [ ] 요구 스킬 편집 저장 → board 재조회로 coverage/matched/missing 즉시 갱신(인덱스 지연 없음)
- [ ] 관계도 토글 → 선택 프로젝트 + 직접 연결 인력만 표시, 노드 클릭 시 드로어(직군/등급은 프로필 로드 후 정상)
- [ ] PROJECT write 없고 RESOURCE_MANAGEMENT write 있는 계정이 프로젝트 상세 배정 탭에서도 배정 버튼 노출(백엔드 OR 정합 — 회귀 아님 확인)
- [ ] i18n: 한/영 전환 시 탭 라벨 및 통합 탭 문구 정상

---

## 사소 관찰 (수정 불요)
- `resource.assignment.requiredSkills.title`·`resource.assignment.graph.title` 키는 정의됐으나 코드에서 미사용(dead key). merge 산출물 영향 미미, 삭제 선택. **실패 아님.**
- ProjectGraphSection `fallbackPerson`에 `roleName/levelName` 미포함 → 드로어 프로필 로드 전 순간 '-' 표기. transient·무해. **실패 아님.**

---

## 종합
- **통합 계약 위반 0건.** 권한 OR 3건이 백엔드 grant ↔ 프론트 게이트 ↔ 계약 테스트로 삼중 정합(특히 assign=write 미러링, read-게이팅 부재 확인). 재사용 자산(AssignmentPage·ResourceProfileDrawer·ToastFlags) shape 일치, 무수정 3파일 diff 0, invalidate 경계 준수.
- **backend/frontend 재작업 불요.** E 항의 프론트 테스트 실패는 본 기능 무관(RFC-169 환경성) — 단, 02_frontend_report 의 213 통과 주장과 실제 194 통과는 기록상 불일치로 남긴다.
- 잔여는 E2E(실권한·실데이터) 5건뿐.
