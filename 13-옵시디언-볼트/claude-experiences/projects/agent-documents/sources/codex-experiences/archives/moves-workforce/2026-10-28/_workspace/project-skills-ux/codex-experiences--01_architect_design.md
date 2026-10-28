# 프로젝트 스킬 입력 UX 설계

## 1. 목적·완료 조건·범위

신규/수정 프로젝트 모달에서 요구 스킬을 검색하고 선택 목록을 확인하며, 프로젝트 저장 한 번으로 기본 정보와 스킬을 저장한다. 검색·직군 필터 변경은 선택 목록에 영향을 주지 않는다. 저장 실패 시 입력을 보존하고 부분 저장을 정확히 알린다. 사용자 승인 범위는 이 기능과 별도 캘린더 수정이다. 전체 출시 감사·오류 관측 확대는 제외한다.

리더가 전달한 요구사항을 입력으로 사용했다. 조사 시작 시 `00_input/requirement.md`는 없었다. 제품 코드는 설계 담당자가 변경하지 않는다. 기존 캘린더 CSS diff 및 미추적 사용자 파일을 보존한다.

## 2. 근거와 재사용

- `ProjectModal.jsx:56`: insertProject/updateProject 소비자는 이 모달이다. 현재 스킬은 editId가 있을 때만 별도 RequiredSkillEditor로 저장한다.
- `ProjectService.js:38,112`, `ProjectRepository.js:9`, `ProjectQuery.js:2`: INSERT가 SQL UUID()를 사용하고 ID를 반환하지 않는다. UPDATE는 상태 전이 확인과 ACTIVE predicate를 사용한다.
- `ResourceManagementService.js:659,672`: getProjectSkills는 `{data:{projectId,skillIds}}`; setProjectSkills는 DELETE 후 INSERT여서 실패 시 기존 선택을 잃는다.
- `SkillMappingQuery.js`, `schema/ddl/skillMapping.sql.js:19`: project_skills의 PK는 `(project_id,skill_id)`. 기존 삭제 쿼리는 프로젝트 삭제 cascade에서도 쓰므로 편집 안전화와 분리한다.
- `ActiveProjectWrite.js`: 자식 INSERT에 ACTIVE 부모 JOIN을 재사용한다.
- `ResponseWrapper.js:12,17`: 성공 결과를 spread하고 예외의 code/message/cause를 실패 응답에 보존한다.
- `SkillMultiSelect.jsx:33`: `backofficeKeys.skills()`와 getSkillList의 `{data:[{id,name,category,description}]}`를 재사용한다. 기존 공용 멀티셀렉트의 다른 사용자·필터 소비자는 변경하지 않는다.
- `RequiredSkillEditor.jsx`, `ProjectDetailDrawer.jsx:98`: 기존 요구 스킬 소비자. 단독 편집기는 공용 검색/선택 UI로 교체 가능하나 자기 저장 기능은 유지한다.
- `CLAUDE.md`는 Forge SQL 트랜잭션 미지원을 명시한다. 설치된 `@forge/sql/out/sql.d.ts`는 prepare/executeRaw/executeDDL을 노출하고 transaction API는 없다. `CommonQuery.js`도 개별 statement 실행만 한다. 따라서 다중 테이블 원자적 저장을 약속하지 않는다.
- 실제 manifest runtime은 `nodejs22.x`; 스키마·scope 변경은 필요 없다.

## 3. Resolver 계약

| Resolver | 입력 | 성공 | 실패/처리 |
|---|---|---|---|
| insertProject | 기존 기본필드 + optional requestId(UUID 문자열), optional skillIds(string[]) | 기존 DML 필드 보존 + data:{projectId,skillIds} | 입력/마스터 검증 실패는 저장 전 거부. 기본정보 저장 이후 스킬 실패는 PROJECT_SKILLS_SAVE_FAILED |
| updateProject | 기존 기본필드와 project_id + optional skillIds | 기존 DML 필드 보존 + data:{projectId,skillIds} | 상태 충돌·삭제 상태 거부; 부분 실패는 같은 코드 |
| getProjectSkills | projectId | 기존 `{data:{projectId,skillIds}}` 유지 | 읽기 실패를 빈 선택으로 처리하지 않음 |
| setProjectSkills | projectId, skillIds | 기존 `{data:{projectId,count}}` 유지 | 검증/범위/ACTIVE 실패 거부. 교체 실패는 성공 처리 금지 |

skillIds 생략은 기존 매핑 유지, `[]`는 전체 해제다. null/객체/비문자열 원소/공백 ID는 거부한다. 중복 ID는 정규화한다. 검증 상한은 기존 CATALOG_MAX_ITEMS를 공유하며 마스터 존재를 확인한다. 잘린 목록이나 조회 실패를 빈 마스터로 간주하지 않는다. 프로젝트 필드 저장 전에 스킬 validation을 끝낸다.

```json
{"success":true,"rows":{"affectedRows":1},"rowsAffected":1,"data":{"projectId":"uuid","skillIds":["skill-id"]}}
```

```json
{"success":false,"error":{"name":"LogicalError","code":"PROJECT_SKILLS_SAVE_FAILED","message":"PROJECT_SKILLS_SAVE_FAILED","cause":{"projectId":"uuid","projectSaved":true,"retryable":true}}}
```

부분 실패 cause는 이 안전한 상태 필드만 포함한다. SQL·바인딩 값·원본 예외는 포함하지 않는다. 응답 content 래퍼를 추가하지 않는다. skillIds 생략 레거시 호출은 data에서 skillIds를 생략해도 되며 프론트 신규 경로는 항상 배열을 전송한다.

### 생성 재시도

모달을 새로 열 때 crypto.randomUUID()로 requestId를 만들고 동일 저장 재시도 동안 유지한다. 서버는 신뢰 가능한 context.accountId와 requestId를 namespace로 해시해 안정적 UUID를 도출한다. 클라이언트 제공 project_id를 생성 PK로 믿지 않는다. requestId 없는 레거시 생성은 서버 randomUUID()를 사용한다.

이미 같은 ID가 있으면 created_id 일치, ACTIVE, 정규화 기본 필드 일치를 모두 확인해 기본정보 INSERT를 생략하고 스킬 단계를 재실행한다. 다른 기본 필드는 PROJECT_CREATE_REQUEST_CONFLICT로 거부한다. 동시 동일 요청의 PK 충돌은 재조회 후 같은 검증을 한다. 존재하는 프로젝트를 무조건 UPSERT하지 않는다. 삭제 tombstone 또는 삭제 중 프로젝트를 같은 요청으로 재생성하지 않는다.

독립 검토 후 권한 보완: 위 재실행은 현재 프로젝트 범위 안에 있을 때만 쓰기를 허용한다. 생성자가 범위 밖이면 현재 저장된 스킬과 요청 스킬이 정확히 같은 경우에만 쓰기 없는 성공 재응답을 허용한다. 다르면 `PROJECT_CREATE_RECOVERY_SCOPE_REQUIRED`와 `{projectId,projectSaved:true,retryable:false}`를 반환한다. 신규 INSERT에 성공한 호출만 생성 직후 스킬 쓰기 예외를 갖는다. MEMBER_ONLY 생성자가 아직 새 프로젝트 소속이 아니고 최초 스킬 저장이 일부 실패한 경우 권한 있는 사용자에게 수정을 요청해야 한다. 영구 생성 요청 replay로 기존 프로젝트 범위 제한을 우회하지 않도록 하는 의도적 제약이다.

신규 생성은 부분 실패 응답에서 projectId를 알아도 동일 insertProject/requestId로 재시도한다. MEMBER_ONLY 생성자는 새 프로젝트 소속이 아직 없을 수 있으므로 updateProject로 바꾸면 detail guard에서 막힐 수 있기 때문이다. projectId는 캐시 무효화에 사용한다. 기존 수정은 updateProject로 재시도한다. 생성 시작 이후 transport/부분 실패에서는 기본필드를 잠그고 최초 제출 snapshot을 유지한다. 스킬은 수정 가능하다. 정상 완료 후 모달을 닫고 이후 기본정보 수정은 기존 권한 흐름으로 수행한다. 단순 네트워크 오류마다 새 requestId를 발급하지 않는다. 확정적인 저장 전 validation 실패는 기본필드를 잠글 이유가 없다.

## 4. 권한·범위

- insertProject: 기존 PROJECT write 유지. context.accountId/principal 누락은 실패. 신규 프로젝트 스킬은 검증된 생성 ID에 한해 생성 서비스 내부에서 저장한다. 갓 생성된 프로젝트가 기존 memberProjectIds에 없을 수 있으므로 일반 수정 경로의 소속 목록만으로 생성 직후 쓰기를 막지 않는다.
- updateProject/setProjectSkills: PROJECT write + detail scope. principal을 서비스까지 전달하고 공용 프로젝트 범위·ACTIVE 검증을 사용한다.
- getProjectSkills: 기존 RESOURCE_MANAGEMENT read OR PROJECT read 유지, project detail scope를 명시한다. 기존 소비자는 모두 projectId를 전달한다. 읽기 서비스도 principal 누락을 fail-close한다.
- 스킬 사전은 기존 PUBLIC getSkillList 경로 유지. 새로운 급여·인력·개인 데이터는 반환하지 않는다.
- 신규 resolver 없음. CONTROLLER_REGISTRARS 기존 Project/ResourceManagement 등록 유지. PermissionMap에서 필요한 detail 변경만 수행한다.

## 5. 백엔드 구현

ProjectService/Controller는 optional skillIds와 principal을 연결한다. 공용 프로젝트 스킬 validation/교체 함수를 추출해 통합 저장과 setProjectSkills 모두 사용한다. ProjectRepository/ProjectQuery는 바인딩한 UUID INSERT와 안정적인 ID 응답을 지원한다.

스킬 교체는 다음 순서다.
1. 타입/상한/마스터 존재·범위·ACTIVE 검증.
2. 원하는 매핑을 ACTIVE 부모 JOIN INSERT ... ON DUPLICATE KEY UPDATE(no-op)로 추가한다.
3. ACTIVE 부모 predicate가 있는 별도 DELETE로 desired 목록에 없는 매핑만 제거한다. 빈 배열도 ACTIVE 검증·predicate를 유지한다.
4. 최종 ID 집합을 반드시 재조회하여 요청과 다르면 PROJECT_SKILLS_SAVE_CONFLICT로 처리한다. 통합 저장에서는 기본정보가 이미 저장되었으므로 PROJECT_SKILLS_SAVE_FAILED로 안전하게 래핑한다.

upsert의 rowsAffected=0은 기존 행과 같다는 뜻일 수 있어 일률적으로 실패 처리하지 않는다. ACTIVE 여부 확인은 별도로 수행한다. 기존 삭제 cascade 쿼리는 유지한다. INSERT 실패 시 기존 스킬이 보존되고, 후속 DELETE 실패 시 기존/추가 스킬의 합집합이 남을 수 있으므로 실패를 표시하고 재시도로 수렴시킨다. 다중 호출의 동시 편집을 트랜잭션처럼 보장하지 않는다. 자동 rollback DELETE는 다른 저장을 지울 수 있어 사용하지 않는다.

## 6. 프론트·캐시

모달의 기본정보/일정 영역과 요구 스킬 영역을 시각적으로 구분한다. 넓은 화면은 검색/선택을 두 영역으로, 좁은 화면은 세로로 배치한다. Atlaskit token을 사용해 다크 모드 대비를 확보하고 검색 입력 라벨, 키보드 버튼, 선택 상태, 결과 없음, loading/error/retry를 제공한다. 선택 목록은 개수와 제거 버튼을 보여주고 검색 결과 필터와 독립적으로 유지한다. 새 라우트는 없다.

ProjectModal이 skillIds draft와 requestId, confirmedProjectId, 저장 snapshot을 소유한다. 수정 시 상세/스킬 로드가 모두 성공한 뒤 저장을 활성화하고 최초 로드 이후 refetch로 사용자의 draft를 덮지 않는다. 저장 중 입력·중복 제출·닫기를 막고 mutateAsync를 반환해 BaseModal submitting과 연결한다. 실패는 입력을 유지하고 부분 저장 안내를 표시한다. 신규 생성의 불확실/부분 성공 뒤에는 기본필드 잠금 상태와 재시도 안내를 함께 보여준다. 성공만 닫는다.

| 상태 변경 | 캐시 처리 |
|---|---|
| 기본정보 성공 또는 부분 성공 | invalidateProjectViews(queryClient), findProjectByIdQueryKeys(projectId) |
| 스킬 성공 또는 부분 쓰기 가능 실패 | resourceKeys.projectSkills(projectId), resourceKeys.projectMatch(projectId), assignmentKeys.board(projectId), assignmentKeys.pool(projectId), assignmentKeys.cards() 무효화 |
| 사전 검색 | 기존 backofficeKeys.skills() 재사용. 오류를 []로 resolve하지 않음 |

캐시 무효화와 현재 편집 draft를 분리한다. 권한 축은 기존 앱 권한 변경 시 캐시 초기화 규약을 유지한다.

## 7. i18n

실제 작업자가 기존 project/resource 키와 충돌 없이 같은 의미를 재사용한다. 신규 키 후보:

| 키 | 한국어 | English |
|---|---|---|
| project.skills.title | 요구 스킬 | Required skills |
| project.skills.description | 프로젝트에 필요한 스킬을 선택하세요. | Select the skills this project needs. |
| project.skills.search | 스킬 검색 | Search skills |
| project.skills.selected | 선택한 스킬 | Selected skills |
| project.skills.empty | 아직 선택한 스킬이 없습니다. | No skills selected yet. |
| project.skills.noResults | 검색 결과가 없습니다. | No matching skills. |
| project.skills.loadError | 스킬을 불러오지 못했습니다. 다시 시도해 주세요. | Couldn't load skills. Please try again. |
| project.skills.partialSave | 프로젝트 정보는 저장되었지만 스킬 저장에 실패했습니다. 다시 저장해 주세요. | Project details were saved, but skills weren't. Please save again. |
| project.skills.retryCreate | 저장 결과를 확인하지 못했습니다. 다시 저장해 결과를 확인해 주세요. | We couldn't confirm the save. Try saving again to recover it. |

kr/en 원본을 수정하고 merge한다. 직접 생성 번역 파일 편집은 하지 않는다.

## 8. 작업 소유권·검증

- 설계 담당: 이 문서만 소유. 구현하지 않음.
- backend 담당: Project Controller/Service/Repository/Query, 공용 프로젝트 스킬 저장 서비스, ResourceManagement 위임, SkillMappingQuery, PermissionMap, 관련 backend tests. schema 변경은 불필요.
- UI 담당: 검색/선택 공용 컴포넌트, 단독 RequiredSkillEditor 통합, i18n·컴포넌트 tests. 기존 SkillMultiSelect 소비자 회귀 방지.
- 리더: ProjectModal 상태/저장/재시도, 캐시 연결, 통합 테스트 및 시각 검증.

필수 회귀: 신규 스킬 포함 생성, 스킬 없는 생성, 수정 추가/삭제/전체해제, unknown ID 저장 전 거부, duplicate ID 정규화, missing principal/범위 밖 거부, DELETING/없는 부모 쓰기 거부, upsert 동일값 성공, INSERT 실패 시 기존 스킬 보존, DELETE 실패 시 부분 결과와 재시도, 안정적 requestId timeout/동시 호출 중복 방지, 타 사용자 requestId namespace 격리, 레거시 optional 생략 유지, 스킬 로드 실패 저장 차단, dirty draft refetch 보존, double submit 차단, modal 재오픈 state 초기화.

한국어/영어·라이트/다크·좁은 화면·키보드 조작을 시각 검증한다. 완료 시 backend/frontend 전체 테스트, CI=true frontend build, app root pwd 후 forge lint를 수행하고 실제 Jira 미검증 여부를 명시한다. 이 설계 단계에서는 실행 테스트를 수행하지 않았다.
