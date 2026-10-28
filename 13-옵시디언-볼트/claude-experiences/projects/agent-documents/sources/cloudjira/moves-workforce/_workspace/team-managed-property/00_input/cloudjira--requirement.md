# 요구사항: 팀 관리형 프로젝트 지원 — 코워커·등록일·등록자 이슈 프로퍼티 이전

- 날짜: 2026-07-14 · 브랜치: RFC-155 (커밋은 사용자 지시 시)
- 근거 문서:
  - 진단: `claude-experiences/projects/moves-workforce/2026-07-14-team-managed-field-gap.md`
  - PoC(전 항목 실측 통과): `claude-experiences/projects/moves-workforce/2026-07-14-team-managed-poc.md`

## 1. 배경 (진단 요약)

팀 관리형(team-managed/next-gen) 프로젝트에서는 Forge 커스텀 필드가 **이슈 fields 응답에서 통째로 빠진다**
(write와 JQL 인덱스는 동작). 그래서 JQL로만 소비하는 `moves_RMS_projectId`는 정상이지만,
`issue.fields[필드ID]`로 **값을 읽는** 코워커(`moves_RMS_coworkers`)·등록일(`moves_RMS_projectAssignedDate`)·
등록자(`moves_RMS_projectAssignedById`)는 팀 관리형에서 항상 빈 값이다. 플랫폼 제약이므로 저장소를 이전한다.

## 2. 목표

코워커·등록일·등록자를 **이슈 프로퍼티(issue property) + `jira:entityProperty` 인덱스**로 이전하여
팀 관리형/회사 관리형 모두에서 동일하게 동작하게 한다.

## 3. 확정된 설계 제약 (PoC 실측 — 변경 불가)

1. **projectId 필드는 현행 유지.** JQL 전용 소비(`moves_RMS_projectId = "..."`)라 팀 관리형에서도 동작한다.
   작업 등록/삭제(updateProjectIdField의 projectId 분기, deleteProjectIssue)는 손대지 않는다.
2. **프로퍼티는 1키 객체로 통합.** 키: `movesRms` (환경 충돌 고려는 §7).
   ```json
   {
     "coworkers": ["<accountId>", ...],
     "assignedAt": "2026-07-14",                      // date-only — 인덱스용
     "assignedAtIso": "2026-07-14T12:34:56.000+0900", // ISO — 표시·정밀도용
     "assignedById": "<accountId>"
   }
   ```
3. **date 인덱스 함정(실측):** write 시점 인덱서는 date-only(`yyyy-MM-dd`)만 파싱한다.
   datetime ISO를 넣으면 **에러 없이 인덱스에서 누락**된다. 따라서 assignedAt(인덱스용)과 assignedAtIso(표시용)를 분리 저장한다.
4. **alias JQL 실측 지원 범위:** `= accountId`, `= currentUser()`, `in (...)`, `is EMPTY`, `is not EMPTY`,
   date `>= <=` 범위, `ORDER BY`. → 기존 `moves_RMS_coworkers in (...)` JQL은 alias로 1:1 치환(OR 전개 불필요).
5. **search/jql `properties` 파라미터**로 검색 응답에 프로퍼티 동봉(1패스 유지, 실측 +6ms). 요청당 최대 5키 — 1키라 무관.
6. **크기 제한 32,768바이트/프로퍼티** — coworkers 수백 명까지 여유. 초과 방어는 불필요(방어 코드 금지 아님, 단순 유지).
7. **write→검색 반영 ~1초.** write 직후 재조회 UI는 기존 원칙대로 서버 응답 기반 캐시 패치 유지(재조회 의존 금지).

## 4. 기능 요구

### 4-1. manifest
- `jira:entityProperty` 모듈 추가 (본 구현용):
  - propertyKey: `movesRms`
  - values: coworkers(user, alias `movesRmsCoworkers`) / assignedAt(date, alias `movesRmsAssignedAt`) / assignedById(string, alias `movesRmsAssignedBy`)
- **PoC 잔존물 제거**: `webtrigger: poc-entity-property` + function `pocEntityProperty` + `jira:entityProperty: moves-rms-poc-entity-property` 블록, `src/poc/` 디렉토리 삭제.
- 커스텀 필드 선언(coworkerIdField, assignedDateField, assignedByIdField)은 **manifest에서 제거하지 않는다**
  (기존 설치본 필드 삭제는 파괴적 — [[topics/forge/forge-readonly-appfield-write|forge-readonly-appfield-write]] 교훈. 데이터 이관 완료 후 별도 RFC로 폐기).

### 4-2. 백엔드 write 경로 (2곳)
- **코워커 갱신**: 현재 프론트가 `updateProjectIdField`(범용 필드 write)를 coworker 필드 id로 호출.
  → 전용 resolver `updateIssueCoworkers`(가칭) 신설: issueId/issueKey + accountId 배열을 받아
  프로퍼티 `movesRms.coworkers`를 병합-write(프로퍼티의 다른 필드 보존). 기존 범용 함수의 projectId 용도는 유지.
- **등록일·등록자 기록**: `recordIssueAssignedDateService`를 프로퍼티 기반으로 전환.
  - 가드(이미 등록일 있으면 skip)를 프로퍼티 read 기준으로 변경 — 팀 관리형에서 가드가 항상 null이라 매번 덮어쓰던 부작용도 해소.
  - assignedAt=date-only, assignedAtIso=ISO, assignedById=accountId 저장.
- 프로퍼티 write는 asApp (`PUT /rest/api/3/issue/{issueIdOrKey}/properties/movesRms`).
  부분 갱신이 아니라 전체 교체 API이므로 **read-merge-write** 헬퍼를 공용화한다.

### 4-3. 프론트/백엔드 read 경로 (coworker·작업이력 소비처 전수)
- 검색 1패스 유지: `searchIssueWithJQL` 계열 호출에 `properties: ["movesRms"]` 추가하고
  `issue.fields[coworkerFieldId]` → `issue.properties.movesRms.coworkers` 소비로 전환.
- coworkers는 accountId 배열이므로 **표시용 사용자 정보(displayName/avatar) resolve가 필요**하다.
  기존에는 필드가 user 객체 배열을 반환했음 → 전환 지점마다 사용자 lookup 전략을 설계할 것
  (예: 백엔드 bulk user API `getBulkJiraUsersApi` 재사용 or 프론트 캐시). N+1 금지.
- 소비처 목록 (전수 — verifier가 grep으로 재확인):
  - `static/ui/src/pages/projectDetail/issue/ProjectIssueTable.jsx` (표시+편집)
  - `static/ui/src/pages/projectDetail/issue/ProjectIssuePanel.jsx`
  - `static/ui/src/pages/projectDetail/taskHistory/` (TaskHistoryPage/Table/transform — assignedDate/assignedBy)
  - `static/ui/src/pages/projectDetail/gantt/useGanttData.js`
  - `static/ui/src/pages/projectDetail/calender/useProjectCalender.js`
  - `static/ui/src/pages/projectDetail/analysisReport/issue/IssueAnalysisTable.jsx`
  - `static/ui/src/pages/myWork/` (useMyWorklogList, useMyIssueTable, WorklogModal — coworker 조건/표시)
  - 백엔드: `src/api/jira/issue/IssueApi.js`의 `getAssigneeStats`/`getIssueParticipantStats`/`getProjectIssuesByUser`/
    `getProjectIssuesByFilter`/`getProjectGanttIssues` 등 coworkerFieldId 소비 함수,
    `src/resolver/projectProgress`·`projectIssue`의 coworker 사용처
- JQL 치환: `moves_RMS_coworkers in (...)` → `movesRmsCoworkers in (...)` (myWork 계열).
  `coworkerFieldId` 조달 로직(getCoworkerFieldIdApi, 프론트 getCustomFieldId coworker/assigned 분기)은 소비처가 없어지면 정리.

### 4-4. 마이그레이션 배치
- 대상: **회사 관리형 이슈만** (팀 관리형은 읽을 원본이 없음 — 어차피 사용자에게 보인 적 없는 값).
- 절차(리허설 검증됨): projectId로 검색 1패스(fields=coworker/assignedDate/assignedBy, fieldsByKeys) →
  값 있는 이슈만 프로퍼티로 변환 write(assignedAt은 date-only로 변환) → 이미 프로퍼티 있는 이슈는 skip(멱등).
- 실행 방식: 관리자 수동 트리거(백오피스 or resolver) — scheduledTrigger 상시 배치는 불필요. p-limit 동시성 제한.
- 배포 순서: manifest 선언 배포(+설치본 업그레이드) → 배치 실행. (PoC상 선언 전 값도 일괄 인덱싱되지만 의존하지 않는다.)

### 4-5. i18n
- 신규 사용자 노출 문자열이 생기면 `locales/kr/{기능}.json`+`locales/en/{기능}.json` 추가 후 merge.

## 5. 비목표 (이번 범위 제외)
- projectId·wbsParent·predecessors 필드의 프로퍼티 이전 (JQL 전용/간트 전용 — 현행 유지)
- 커스텀 필드 manifest 선언 제거(후속 RFC)
- clone 시 프로퍼티 미복사 대응 (사용자 결정: 검증·대응 불필요)
- 회사 관리형 Jira 이슈 화면 노출 유지를 위한 필드 이중 write (정책 미결 — 채택 안 함)

## 6. 수용 기준
1. 팀 관리형 프로젝트 이슈에서 코워커 지정→표시→편집이 회사 관리형과 동일하게 동작
2. 팀 관리형 이슈의 작업이력(등록일·등록자) 기록·표시 동작
3. myWork "내가 협업자인 이슈" 검색이 alias JQL로 동작 (`movesRmsCoworkers in (...)`)
4. 기존 회사 관리형 데이터가 마이그레이션 배치 후 그대로 보임 (배치 멱등)
5. 루트 `npm test` + `static/ui` build 통과
6. 검색 1패스 패턴 유지 (per-issue 프로퍼티 GET N+1 금지)

## 7. 리스크 메모 (설계 시 참고)
- dev/prod 공존 사이트에서 프로퍼티 키·alias 충돌 가능 — 운영 단일 앱 원칙 전제로 키에 env 접미사 넣지 않음(단순성 우선). 설계서에 근거 명기.
- 프로퍼티는 이슈 편집 권한자가 REST로 수정 가능(위변조) — 수용된 트레이드오프, 서버가 저장 시 형식 검증만 수행.
- 이슈 clone 시 프로퍼티 미복사 가능성 — 비대응(사용자 결정).
