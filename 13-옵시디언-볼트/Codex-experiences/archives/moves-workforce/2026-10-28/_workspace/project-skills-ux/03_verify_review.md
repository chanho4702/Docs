# 프로젝트 스킬 UX 독립 계약 검토

## 범위와 판정

통합 검증 스킬을 적용해 실제 backend/프론트 생산자·소비자와 작업 중 diff를 읽었다. 제품 파일은 수정하지 않았다. 아래 네 가지 결함을 발견해 리더와 backend 담당에게 전달했고, 후속 코드에서 수정 반영을 확인했다. 이 문서는 독립 소스 검토 결과이며 전체 테스트·빌드·브라우저 실행 결과는 해당 담당자의 보고서에서 별도로 확인해야 한다.

현재 확인한 구현에서 미해결 출시 차단 결함은 발견하지 않았다. 다중 SQL 저장의 비원자성과 범위 밖 생성자 부분 복구 제한은 아래에 명시한다.

## 발견 및 수정 확인

### P1: 생성 요청 재사용으로 프로젝트 scope 우회 — 수정 확인

최초 구현은 동일 requestId/기본정보/created_id면 기존 프로젝트에도 saveValidatedProjectSkills를 호출했다. 성공 생성한 요청을 기억한 사용자가 MEMBER_ONLY 범위에서 제외된 후 skillIds만 바꿔 insertProject를 호출하면 update/setProjectSkills의 detail scope를 우회할 수 있었다.

현재 `ProjectService.js:123`은 replay와 scope를 함께 확인한다. 범위 밖 생성자는 현재 스킬과 요청이 정확히 같은 경우 쓰기 없는 성공 확인만 가능하다. 다르면 PROJECT_CREATE_RECOVERY_SCOPE_REQUIRED, projectSaved=true, retryable=false를 반환한다. 동시 INSERT loser도 replay로 분류한다. 새 INSERT winner만 최초 스킬 쓰기 예외를 받는다.

관련 테스트 소스: `ProjectSaveSkills.test.js:111,120,132`. owner 검증·ACTIVE·기본필드 동일 판정도 유지된다. 해당 테스트 실행 결과는 backend 담당에게 확인한다.

### P2: 동시 스킬 교체가 빈 집합을 성공으로 보고 — 수정 확인

재현 순서: A=[a], B=[b] → INSERT A → INSERT B → DELETE not A → DELETE not B. 기존 최종 반환은 요청 IDs 그대로여서 실제 DB=[]여도 두 요청 모두 성공했다.

현재 `ProjectSkillService.js:64`는 저장 후 실제 집합을 조회하고 요청과 다르면 PROJECT_SKILLS_SAVE_CONFLICT를 던진다. 통합 프로젝트 저장은 이를 안전한 부분 실패로 래핑한다. 이 검사는 원자적 동시성 보장을 제공하지 않으나 이미 불일치한 결과를 성공으로 보고하는 결함을 막는다.

### P2: 불확실한 생성의 후속 검증 실패에서 snapshot 해제 — 수정 확인

재현 순서: 생성 timeout 또는 스킬 부분 실패 → 재시도 중 SKILL_NOT_FOUND → 기본필드 잠금 해제 → 이름 변경 → 같은 requestId가 기존 프로젝트 기본필드와 달라 충돌.

현재 `projectSaveSession.js:31`은 기존 baseLocked를 유지한다. 최초 호출의 확정적 사전 검증 실패만 snapshot을 지울 수 있다. recoveryDenied도 별도 mode로 매핑하며 기본필드를 유지한다.

### P2: 저장 후 카드·추천 캐시 누락 — 수정 확인

`AssignmentProjectService.js:81`의 카드 requiredSkills, `WorkAssignmentService.js:293,329`의 board coverage/requiredSkills, 같은 파일 `354~386`의 pool coverage/ranking이 SQL project_skills에 의존한다. 최초 refreshViews는 resourceKeys만 갱신해 이 세 캐시가 남았다.

현재 `ProjectModal.jsx:91,96,97`은 assignmentKeys.cards/board/pool을 무효화한다. recoveryDenied도 이미 기본정보가 저장된 상태이므로 `:112`의 무효화 조건에 포함된다. 배정 mutation의 JQL 인덱스 지연과 이번 SQL 스킬 저장을 구별한 처리다.

## 계약 교차 확인 — 소스 기준 통과

- insert/update 소비자는 ProjectModal 하나이며 내부 다른 Service/큐/트리거 호출은 검색되지 않았다. 기존 SQL 응답 필드를 유지하고 data:{projectId,skillIds}를 추가한다.
- ProjectController는 principal/context를 함께 전달한다. 신원 불일치와 principal 누락은 실패한다. 관리자/PROJECT write 판정과 scopedProjectIds를 재사용한다.
- getProjectSkills 소비자는 ProjectModal, ProjectDetailDrawer, RequiredSkillEditor이다. 모두 projectId를 전달한다. controller가 principal을 전달하며 resource read OR project read grants는 유지되고 detail scope가 추가됐다.
- RequiredSkillEditor는 현재 검색상 외부 import가 없는 독립 파일이다. 기존 계약 data.skillIds는 유지된다. ProjectDetailDrawer의 오류를 []로 표현하는 기존 구현은 남아 있으나 새 저장 모달은 성공/배열 검증 실패 시 저장을 막는다. 범위 거부를 데이터가 있다고 오인해 쓰는 경로는 없다.
- 스킬 입력 생략은 유지, []는 전체해제다. 값은 문자열·비어있지 않음·50자 SQL 컬럼 길이·CATALOG_MAX_ITEMS=5000 상한을 확인하고 중복 정규화 후 fresh catalog 존재를 검사한다.
- fresh catalog의 truncated 응답은 assertComplete에서 거부한다. 프론트도 truncated/잘못된 목록을 오류로 취급한다.
- ProjectSkillService는 100개씩 ACTIVE 부모 JOIN UPSERT 후 ACTIVE predicate DELETE를 한다. cascade용 기존 무조건 DELETE는 보존된다. 동일값 UPSERT rowsAffected=0은 ACTIVE 확인을 거쳐 성공 가능하다.
- INSERT는 project_deletion tombstone 존재 시 실행되지 않아 같은 requestId가 삭제 완료 프로젝트를 되살리지 않는다.
- 날짜 입력은 기존 DATE 컬럼에 맞춰 YYYY-MM-DD로 정규화하고 timezone offset을 새로 적용하지 않는다. 프론트 DatePicker payload 및 SQL 날짜 문자열이 같은 비교 규칙을 거친다. 실제 Forge SQL의 날짜 직렬화는 통합 환경에서 별도 확인 대상이다.
- ProjectModal은 열릴 때 새 content를 mount하고 editId로 key를 구분한다. 초기 스킬/상세 hydration 뒤 refetch로 dirty draft를 덮지 않는다. catalog/스킬 로드 실패와 저장 중 상태는 저장 버튼을 막는다.
- mutateAsync를 반환해 BaseModal submitting과 연결하며 ref로 중복 제출/저장 중 닫기를 차단한다. 잘못된 성공 DTO도 unconfirmed 처리한다.
- backend partial 예외는 raw SQL/params/cause를 프론트에 넘기지 않고 안전한 projectId/projectSaved/retryable만 담는다.

## 명시적 한계·미검증

- Forge SQL 다중 문장 원자성은 제공하지 않는다. 추가 후 삭제 실패 시 스킬 합집합이 남을 수 있고 오류 및 재시도로 복구한다. 최종 조회 뒤 다른 저장이 개입하는 일반 동시 편집까지 직렬화하지 않는다.
- MEMBER_ONLY 생성자가 아직 프로젝트 소속이 아니면 최초 부분 저장 실패의 후속 수정은 scope 밖에서 수행할 수 없다. 권한 있는 사용자에게 복구를 요청하는 UI 안내가 필요하며 recoveryDenied 번역/표시는 프론트 담당 검증 대상이다.
- 생성 requestId는 모달 세션 동안 유지된다. 새로고침/닫기 후 새 세션으로 다시 생성하는 것까지 멱등성을 보장하지 않는다.
- 이 검토자는 실행 테스트·CI 빌드·Forge lint·브라우저 검사를 중복 수행하지 않았다. backend/프론트 담당 및 리더가 실행 중인 검증 결과를 최종 보고에 합쳐야 한다.
- 실제 Jira 설치, Forge SQL 동시 요청, Sentry 수신, 배포는 이 검토 범위에서 실행하지 않았다.
