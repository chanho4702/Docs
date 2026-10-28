# field-change-approval 플랫폼 실측 목록 (미검증)

> 작성: feature-architect · 2026-10-04 (Phase 2 설계). 설계서 `01_architect_design.md` §10 의 C1~C15. 백엔드가 구현 중 생긴 항목은 C16~, 프론트는 그 뒤로 잇는다. 배포 회차에 리더가 확인하고 `결과` 칸을 채운다.
> 확인 원칙(AGENTS.md): iframe 클릭은 자동화에서 신뢰할 수 없다 — 결과는 resolver 반환값(`getIssueFieldChanges` 의 `fields[].state`·`latest.applyStatus`·`bypass[]`, `decideApproval` 응답의 `apply`)과 DB(`field_change_request`·`field_change_bypass`)로 본다. `forge logs` 는 늦다.
> 배포 전제: 테이블 3개 추가(v033~v035) → `--approve MAJOR_VERSION_RULE`. scope·모듈 무변경이라 `--upgrade` 는 필요 없음(엔트리 무변경).
> **배포 최우선: C1·C2·C3**(트리거 페이로드 — 우회 감지와 "우리 적용은 우회가 아님" 판정 전체), 다음 **C5**(적용 실패 코드 — QUESTIONS Q90 결정 근거).

| # | 항목 | 영향 | 확인 방법 | 실패 시 동작 / 대안 | 결과 |
|---|---|---|---|---|---|
| **C1** | `avi:jira:updated:issue` 의 `changelog.id`, `items[].fieldId`(시스템 `duedate`·`assignee`·`reporter`·`priority`, 사용자 정의 `customfield_*`), 행위자(`atlassianId`·`user.accountId`) | 우회 감지 전체, 우회 행 결정적 id | 규칙 필드를 Jira 화면에서 직접 바꾼 뒤 `getIssueFieldChanges.bypass[0]` 의 `actorKey`·DB `changelog_id` | `fieldId` 가 없고 `field`(이름)만 오면 규칙의 `field_name` 과 이름 비교로 보강(사용자 locale 번역 위험 — I8). changelog id 가 없으면 이벤트 시각 대체(재전송 중복 가능) | |
| **C2** | 이벤트 `issue.fields.project.id`·`issue.fields.issuetype.id` 포함 여부 | 없으면 감지가 통째로 빠진다(설계는 asApp 이슈 조회를 만들지 않음) | 같은 시나리오에서 `[FIELD-CHANGE] no project in payload` 로그 유무 | 사람 결정: asApp 1번 확장(트리거의 이슈 프로젝트·유형 조회 — worklog-history 의 `worklog-history-project` 와 같은 성격) 또는 규칙 매칭을 필드만으로(다른 프로젝트 오탐 → 프로젝트 무관 기록) | |
| **C3** | changelog 값 형식 — 날짜(시스템 `duedate`·사용자 정의 datepicker), 사용자(accountId), 우선순위(id), 숫자(`3` vs `3.0`, `to` 비고 `toString` 만?), 단일 선택(`to` 에 옵션 id?) | `classifyFieldEvent` 1행(값 일치로 OURS) — 틀리면 **앱 적용이 우회로 기록**되고 덮어쓰기 알림 오발(2행 행위자 규칙이 보조) | 각 유형 규칙으로 앱 승인·적용 → `bypass` 에 행이 **생기지 않는지**. 직접 변경 시 `from.value`/`to.value` 가 채워지는지 | `fromChangelogItem` 유형별 해석 보강(도메인 + 테스트). 단일 선택 id 가 없으면 `toString` 과 저장 `to_display` 비교로 보조 | |
| **C4** | GET issue `fields=<id>` 원값 형태(유형별)와, 필드 구성에서 숨김·이슈 유형에 없는 필드의 응답(키 없음 vs `null`) | `current` known/unknown — 숨김을 "빈 값"으로 오인하면 충돌 판정·요청 가능 여부가 틀린다 | 숨긴 필드로 `getFieldChangeForm` → `FIELD_CHANGE_FIELD_UNAVAILABLE` 기대. 값 없는 보이는 필드는 `current.value:null` 이고 요청 가능 | 키가 항상 `null` 로 오면 editmeta·`names` expand 로 존재 여부 판정 | |
| **C5** | asUser `PUT /rest/api/3/issue/{id}` 실패 코드 — 편집 권한 없음, 편집 화면 밖 필드, 값 거부, 담당자 배정 권한(Assign) 없음 | `applyCode`(NO_PERMISSION·NOT_EDITABLE·REJECTED_BY_JIRA) 정확도, Q90 판단 근거 | (a) 편집 권한 없는 결재자로 최종 승인 (b) 편집 화면에서 뺀 필드 (c) 우선순위 스킴 밖 우선순위 → 각각 `apply.code` | 400 하나로 뭉치면 화면 문구를 "편집할 수 없거나 값이 거부됨"으로 합침(문구 1개) | |
| C6 | asApp + `overrideScreenSecurity=true` 가 Forge 앱에서 동작하는지(문서상 Jira 관리자 권한 주체 조건) | Q90(b) 성립 | Q90(b) 채택 시에만 | 안 되면 (b) 도 화면 밖 필드는 실패 — 가이드를 "권한 회수" 한 가지로 | |
| **C7** | `GET issue/{id}/editmeta` — 편집 권한 없는 사용자에게 빈 `fields` 인지, `allowedValues` 형태(우선순위 `{id,name,iconUrl}`, 옵션 `{id,value}`), `priority/search` 일반 사용자 권한 | 폼 선택지·Q93 | 편집 권한 없는 계정으로 우선순위·단일 선택 규칙 폼 열기 | 우선순위 목록도 막히면 PRIORITY 도 `OPTIONS_UNAVAILABLE` | |
| C8 | `GET /rest/api/3/field` 의 `schema`(type·custom·system)와 team-managed 필드의 `scope.project.id`, 스토리 포인트 필드의 schema | 지원 판정·프로젝트 필터 | company/team-managed 프로젝트 각각 규칙 화면 `fields[]`·`unsupported[]` | 판정 표(설계 §3.2) 보강 | |
| C9 | 앱 계정 accountId 를 얻는 방법(`context`·asApp `/myself`) | Q90(b)·Q91 의 "앱 변경은 우회 아님" | 채택 시에만 | — | |
| C10 | `user/assignable/search?issueId=` 와 `user/search` 의 asUser 결과(비활성·앱 사용자 포함 여부, 이메일 비공개) | 담당자·사용자 후보 | 후보 목록 확인 | 앱·비활성 사용자는 화면에서 거름(`accountType==='atlassian' && active`) | |
| C11 | 날짜+시간 필드의 저장·표시 형식(타임존) | 다음 회차 지원 여부 판단 | — | 범위 밖 유지 | |
| C12 | 이슈 화면 로드당 6~8콜(세 칸)의 요율 영향 — issue-approval I9 확장 | 대형 사이트 성능 | 연속 열람 시 429 | 세 칸 합친 조회 resolver(가드 1회 공유) — 계약 변경 | |
| C13 | issueContext 세 칸 높이 — I7·I16 확장 | 우측 요약 잘림 | 일반 PENDING + 전환 규칙 + 필드 규칙 2개 이슈 | compact 에서 필드 칸을 "필드 변경 n건 진행 중" 한 줄로 | |
| C14 | 적용 PUT 의 Jira 이력 작성자 = asUser 주체(결재자), Jira 알림 메일 발송 여부(`notifyUsers` 기본) | 요구 3 "이력의 수정자가 사람" | 적용 후 이슈 기록 탭 | — | |
| C15 | 위임 결정(대리 결재) 시 asUser 주체 = 실제 결정자(delegate) | 이력 수정자·OURS 판정(`appliedBy`) | 위임 상태에서 최종 승인 | — | |

기존 항목 재사용: X8(`updated:issue` changelog 형태) — C1·C3 이 같은 페이로드를 본다, X10(`deleted:issue` 의 `issue.id`) — 필드 변경 삭제 만료, I9·I7·I16 — C12·C13.

### 백엔드 구현 중 추가(backend-engineer · 2026-10-04 Phase 3)

| # | 항목 | 영향 | 확인 방법 | 실패 시 동작 / 대안 | 결과 |
|---|---|---|---|---|---|
| **C16** | `GET /rest/api/3/issue/{id}?fields=summary,project,issuetype,<사이트 전체 규칙 필드 id들>` — 이 이슈(프로젝트)에 없는 필드 id·다른 team-managed 프로젝트 전용 `customfield_*` 가 섞여도 200 이고 그 키만 빠지는지(400 거부 여부) | `getIssueFieldChanges` 가 이슈 1콜로 규칙 필드 값까지 읽는 설계(§9.2 "Jira 2")가 여기에 기댄다 | 프로젝트 A 에 `customfield_X`(A 전용) 규칙, 프로젝트 B 이슈에서 `getIssueFieldChanges` → 응답 성공·`fields[]` 정상 | 구현됨: 첫 조회가 null(400 등)이면 기본 필드로 다시 읽고 이 프로젝트 규칙 필드만 보충(최대 3콜). 400 이 상시면 사이트 필드 목록 선조회를 빼고 2단 조회로 단순화 | |
| C17 | `field_change_request` 요약 조회의 상관 서브쿼리 `(SELECT e.reason FROM approval_event e WHERE e.request_id = fc.request_id AND e.event_type='EXPIRED' LIMIT 1)` 가 TiDB(Forge SQL)에서 허용·인덱스 사용되는지 | `expiryReason`(화면 상태 CONFLICT vs CLOSED) — 실패 시 이슈 화면·상세 조회 SQL 오류 | 배포 후 `getIssueFieldChanges` 호출이 성공하고, FIELD_CHANGED 로 만료된 요청의 `latest.state` 가 `CONFLICT` | 실패하면 서브쿼리를 빼고 만료 사유를 별도 1문장(`approval_event WHERE request_id IN (…) AND event_type='EXPIRED'`)으로 붙인다 | |
| C18 | asUser `PUT /rest/api/3/issue/{id}` 성공 응답 코드(204)와, 3초 시간 상한에 걸린 뒤에도 Jira 가 실제로 적용하는지(Promise.race 는 요청을 취소하지 않는다) | `TIMEOUT` 후 재시도의 ALREADY 판정 | 큰 이슈·느린 사이트에서 적용 → `apply.code==='TIMEOUT'` 이 나오면 다시 적용 시 `already:true` 인지 | 시간 상한을 5초로 늘리는 것 검토(결정 응답 지연과 교환) | |
| C19 | 일괄 승인 시간 예산 15초(BULK_AFTER_DECIDE_BUDGET_MS) — 결정 50건 + 적용 GET/PUT 이 Forge 25초 한도 안에 끝나는지 | 예산이 크면 함수 시간 초과로 뒤쪽 결정까지 유실, 작으면 WAITING 이 많아짐 | 필드 변경 최종 승인 30~50건 일괄 승인 → 응답 수신·`results[].applyStatus` 분포 | 상수 조정(10초) | |


### 프론트 구현 중 추가(frontend-engineer · 2026-10-04 Phase 4)

| # | 항목 | 영향 | 확인 방법 | 실패 시 동작 / 대안 | 결과 |
|---|---|---|---|---|---|
| **C20** | 이슈 화면(issueContext·issuePanel)에서 [다시 적용](applyFieldChange)·모달 요청/결정 뒤 **Jira 이슈 보기의 필드 값**이 새로고침 없이 바뀌는지 | 앱이 asUser PUT 으로 바꾼 값이 이슈 보기에 옛 값으로 남으면 사용자가 "적용 안 됨"으로 오인 | 마감일 규칙으로 승인·적용 직후 같은 탭의 이슈 보기 필드 확인 | 안 바뀌면 적용 성공 안내에 "새로고침하면 보입니다" 한 줄 추가(문구 키 1) 또는 `@forge/bridge` 의 이슈 보기 새로고침 수단(지원 여부 미확인) | |
| C21 | 결정 직후 적용 결과 안내 화면(모달 안 SectionMessage + 닫기) → `view.close` → 이슈 엔트리 `onClose` 의 `fieldChangeKeys.issue` 무효화로 필드 칸이 갱신되는지 | 모달에서 승인했는데 이슈 칸이 "결재 중"으로 남음 | 이슈 엔트리 [상세] → 최종 승인 → 안내 → 닫기 → 필드 칸 상태 | 갱신 안 되면 이슈 엔트리에 포커스 재조회(`refetchOnWindowFocus`) 켜기 | |
| C22 | 상시 로드 issue 엔트리 번들 증가 — gzip 7.7KB → 10.9KB(+3.2KB, 필드 칸·모델·다시 적용 훅). I16·C13 확장 | 모든 이슈 화면 첫 표시 지연 | 배포 후 issueContext 첫 표시 체감·네트워크 탭 | 큰 차이면 FieldChangeSection 의 full 전용 부분(이력·우회 목록·사용자 이름 조회)을 lazy 청크로 분리 | |
| C23 | `@atlaskit/datetime-picker` DatePicker 가 Forge iframe(사용자 로캘 ko-KR)에서 `onChange` 로 `YYYY-MM-DD` 를 주는지 | DATE 새 값 형식 — 틀리면 `FIELD_CHANGE_INVALID_VALUE` | 마감일 규칙 요청 폼에서 날짜 선택 후 요청 | 형식이 다르면 FieldChangeValueInput 에서 정규화(테스트 F3 보강) | |
| C24 | 우회 기록 행위자 이름 — issuePanel 이 `resolveUsers`(asUser)로 이름을 얻는다. 이벤트의 `actorKey` 가 앱·자동화 계정일 때 이름 해석 결과 | 우회 목록에 accountId 가 그대로 보임 | 자동화 규칙으로 규칙 필드 변경 → issuePanel 우회 목록 | 이름이 없으면 "알 수 없음" 대신 "자동화/앱" 표시(문구 키 1, 서버가 계정 종류를 주어야 함 — 백엔드 요청) | |
