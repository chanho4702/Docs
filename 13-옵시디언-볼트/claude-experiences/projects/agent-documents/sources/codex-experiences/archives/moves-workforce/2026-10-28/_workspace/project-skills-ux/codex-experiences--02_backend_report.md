# 프로젝트 스킬 통합 저장 — 백엔드 보고서

## 구현 및 실제 계약

기존 `insertProject`와 `updateProject`가 optional `skillIds:string[]`를 받아 기본정보와 스킬을 함께 저장한다. 입력을 생략하면 기존 매핑은 그대로 유지하며, `[]`는 전체 해제한다. 생성은 optional UUID `requestId`를 받아 동일 계정/요청의 projectId를 안정적으로 계산한다. 레거시 requestId 생략은 서버 randomUUID를 사용한다.

성공 응답은 기존 DML 결과 + `data:{projectId,skillIds}`다. skillIds 생략 레거시 응답은 `data:{projectId}`만 추가한다. `content` 래퍼는 추가하지 않았다.

기본정보 저장 후 스킬 단계가 실패하면 `LogicalError`를 통해 다음 응답이 나온다.

```json
{"success":false,"error":{"name":"LogicalError","code":"PROJECT_SKILLS_SAVE_FAILED","message":"PROJECT_SKILLS_SAVE_FAILED","cause":{"projectId":"uuid","projectSaved":true,"retryable":true}}}
```

원본 SQL·바인딩·DB 예외는 위 cause에 넣지 않는다. 새 backend console logging은 추가하지 않았다.

`setProjectSkills`는 기존 `data:{projectId,count}`, `getProjectSkills`는 기존 `data:{projectId,skillIds}`를 유지한다. 단독 저장도 통합 저장과 같은 validation/교체 함수를 호출한다.

## 생성 재시도와 권한

- `ProjectController`가 context와 principal을 서비스에 함께 전달한다. accountId 누락·불일치, PROJECT write 누락을 거부한다.
- 생성 요청의 동일 ID가 이미 있으면 created_id, ACTIVE, 정규화 기본필드가 모두 같아야 재사용한다. 다른 값은 `PROJECT_CREATE_REQUEST_CONFLICT`다. SQL INSERT 동시 충돌/응답 유실 후 재조회에도 같은 확인을 적용한다.
- INSERT SQL의 `project_deletion NOT EXISTS` 조건이 tombstone가 있는 ID의 재생성을 차단한다. INSERT 0행을 생성 성공으로 보고하지 않는다.
- 신규 INSERT가 성공한 해당 invocation만 생성 직후 소속 목록에 없는 프로젝트의 초기 스킬을 저장할 수 있다.
- **기존/동시 충돌 replay에는 현재 scope를 다시 적용한다.** 범위 밖 생성자는 현재 DB 스킬과 요청 스킬이 같을 때만 SELECT 후 no-op 성공한다. 다른 스킬은 `PROJECT_CREATE_RECOVERY_SCOPE_REQUIRED`, 안전한 cause `{projectId,projectSaved:true,retryable:false}`로 거부하고 mutation을 하지 않는다.
- 따라서 소속 없는 MEMBER_ONLY 생성자의 부분 저장은 본인이 강제로 복구할 수 없다. 프로젝트 수정 권한/소속을 가진 사용자의 처리가 필요하다. 영구적인 생성자 권한 우회를 피하기 위한 의도적인 제한이다.
- update/set은 PROJECT write와 상세 scope를 함께 요구한다. get은 기존 RESOURCE_MANAGEMENT read OR PROJECT read를 유지하고 상세 scope를 적용한다. principal 누락은 fail-close다.

PermissionMap 변경은 `getProjectSkills.project='detail'` 하나다. 신규 resolver는 없고 `CONTROLLER_REGISTRARS`의 기존 Project/ResourceManagement 등록을 재사용한다.

## 스킬 저장

`ProjectSkillService`가 타입, SQL VARCHAR(50) 길이, 공백, 중복, `CATALOG_MAX_ITEMS=5000`, KVS 마스터 존재를 검증한다. fresh catalog를 한 번 로드하고 truncated/조회 실패는 거부한다. UUID 형식으로 스킬 ID를 제한하지 않는다. 통합 저장에서는 기본정보 write 전에 validation을 끝낸다.

스킬 교체는 ACTIVE 부모 확인 → 원하는 스킬 100개씩 ACTIVE JOIN upsert → ACTIVE 부모 조건으로 제외 스킬 DELETE → 실제 저장 집합 재조회 순서다. 동일 값 upsert 0행은 정상일 수 있으므로 parent ACTIVE를 확인한다. INSERT 실패 시 기존 스킬은 남고, DELETE 실패 시 합집합이 남아 재시도로 수렴한다. 최종 집합이 desired와 다르면 `PROJECT_SKILLS_SAVE_CONFLICT`를 던져 잘못된 성공을 막는다. 통합 저장에서는 이를 위 partial-save 오류로 변환한다. cascade의 기존 전체 DELETE 쿼리는 변경하지 않았다.

## 변경 파일

- `src/resolver/project/ProjectController.js`, `ProjectService.js`, `ProjectRepository.js`, 신규 `ProjectSkillService.js`
- `src/rdb/query/ProjectQuery.js`, `SkillMappingQuery.js`
- `src/resolver/resourceManagement/ResourceManagementController.js`, `ResourceManagementService.js`
- `src/permission/PermissionMap.js`
- 신규 backend tests: `ProjectSkillService.test.js`, `ProjectSaveSkills.test.js`, `ProjectSkillsResolver.test.js`, `ProjectCreateRepository.test.js`

schema/manifest/Forge scope 변경 없음. 다른 작업자의 UI·번역·calendar 변경을 보존했다. 커밋·푸시·배포·설치하지 않았다.

## 검증

- 최종 focused: `npm test -- --runInBand ProjectSkillService ProjectSaveSkills ProjectSkillsResolver ProjectCreateRepository ActiveProjectWrite` — **5 suites / 60 tests 통과, exit 0**.
- 최종 전체 backend: `npm test -- --runInBand` — **120 suites / 1621 tests 통과, exit 0**. replay scope/동시 저장 보완까지 포함한다. 로그: `_workspace/project-skills-ux/backend-test.log`.
- 변경 backend 범위 `git diff --check` 통과.
- 실제 guardedDefine/responseWrapper 테스트로 principal 전달, 상세 scope 거부, OR read grant 유지, 안전한 partial error shape를 검증했다.
- 신규/레거시 생성, 수정/해제, 입력 실패 전 write 금지, duplicate normalization, 소속·ACTIVE 경계, 실패 후 보존/재시도, 생성 namespace/동시 duplicate/tombstone, scope 밖 mutation 0, 두 INSERT 뒤 두 DELETE가 교차하는 동시 스킬 교체 충돌을 검증했다.

## 미검증 및 한계

실제 Jira/Forge SQL/KVS에서는 실행하지 않았다. frontend 전체/CI build/forge lint는 리더가 통합 검증한다. 여러 statement의 원자적 저장을 보장하지 않으며 마지막 집합 확인 직후 다른 저장이 다시 변경할 수 있다. SQL과 KVS 사이의 카탈로그 동시 삭제도 원자적으로 잠그지 않는다.
