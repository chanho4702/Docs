# transition-approval 플랫폼 실측 목록 (미검증)

> 작성: feature-architect · 2026-10-03 (Phase 1+2 설계). 설계서 `01_architect_design.md` §10 의 X1~X20. 구현 중 생기는 항목은 backend/frontend 가 X21~ 로 잇는다. 배포 회차에 리더가 확인하고 `결과` 칸을 채운다.
> 확인 원칙(AGENTS.md): iframe 클릭은 자동화에서 신뢰할 수 없다 — 결과는 resolver 반환값(`getIssueTransitionApprovals` 의 `latest.armedAt/consumedAt/usability`, 상세의 `target.transition`)과 DB 상태로 본다. `forge logs` 는 늦다.
> 배포 전제: 모듈 4·trigger·function 추가로 `forge install --upgrade`, SQL 테이블 추가(v029·v030)로 `--approve MAJOR_VERSION_RULE`. 관리자가 dev 사이트 워크플로의 "→ Done" 전환들에 "Moves Approval — approval required" validator 를 붙이고, 프로젝트 설정에서 규칙 하나를 저장한 상태에서 시작한다.
> **스파이크 빌드 권장**: validator 가 받은 payload·context 의 **키 이름 목록만**(값 없이) `approval_job_state` 같은 기존 진단 칸이나 `[VALIDATOR] keys=` 로그에 남기는 1회용 코드. X1·X2·X3·X20 을 한 번에 본다. 확인 후 제거.

| # | 항목 | 영향 | 확인 방법 | 실패 시 동작 / 대안 | 결과 |
|---|---|---|---|---|---|
| **X1** | validator payload 필드: `issue.id`/`issue.key`, `transition.from.id`/`transition.to.id`, 전환 id(`transition.id`?), 실행자 accountId, locale | **판정 전체.** `to.id` 가 없으면 규칙 키(목적 상태)가 성립하지 않는다 | 스파이크 빌드 키 목록 | `to.id` 없음 → payload 의 전환 id + `GET /rest/api/3/workflows/...`(관리자 전용 가능성) 또는 이슈의 전환 정의 조회로 목적 상태를 구해야 한다 — 설계 재검토. 이슈 id 없음 → key 로 asApp 조회(설계에 있음). accountId 없음 → Q57 대안 불가, `consumed_by` 는 트리거 actor 로만. locale 없음 → 한·영 병기(Q60 기본) | |
| **X2** | validator 실행 컨텍스트 — `api.asUser()` 가 동작하나(사용자 토큰), `api.asApp()` 동작 | AGENTS asApp 4번(`transition-validate`·`transition-changelog`)의 필요성 | 스파이크에서 asUser `GET /rest/api/3/myself` 성공 여부 | asUser 가 되면 `IssueStateReader` 의 validator 경로를 asUser 로 바꾸고 AGENTS 4번 삭제 | |
| **X3** | validator 시간 제한과 예외·시간 초과 시 Jira 처리(전환 통과? 거부? 오류 표시?) | fail-closed 설계의 실효. 내부 예산 4초가 적절한가 | 의도적 지연 2·5·10·20초 빌드로 전환 시도, 예외 throw 빌드로 시도 | 플랫폼 제한이 4초보다 짧으면 내부 예산을 (제한 − 0.5초)로. 시간 초과를 Jira 가 **통과**로 처리하면 fail-closed 가 깨진다 → 첫 쿼리를 더 줄이고(KVS 정책 읽기 캐시) 문서에 한계로 적는다 | |
| **X4** | team-managed 프로젝트·새 워크플로 편집기에서 Forge 함수형 validator 부착 가능 여부 | 강제 범위(DESIGN §10 P0) | dev 사이트 team-managed 프로젝트 워크플로 규칙 목록에 validator 가 보이는지, 붙여서 전환 시도 | 불가면 규칙 화면에서 team-managed 프로젝트(`style:'next-gen'`)는 "강제 불가 — 기록용" 경고 + 저장은 허용(요청·결재는 동작) | |
| X5 | 같은 전환에 validator 가 여럿일 때 다른 validator 가 거부하면 우리 validator 가 호출됐는지·순서 | 무장(armed) 설계 근거 | 필수 필드 validator 와 함께 붙이고 필드를 비운 채 전환 → `latest.armedAt` 이 찍혔는데 `consumedAt` 은 null, 다시 전환(필드 채움) → 통과 + 트리거 소비 | 우리 것이 항상 마지막이거나 전부 통과해야만 호출되면 무장 없이 즉시 소비로 단순화 가능(설계 재검토) | |
| **X6** | REST `POST /rest/api/3/issue/{id}/transitions`·자동화 규칙 전환·일괄 변경·보드 드래그·모바일 앱에서 validator 실행 여부 | 강제의 구멍 | 규칙 걸린 전환을 각 경로로 시도 — 거부되는지 | 실행되지 않는 경로는 수용 기준 문장에 명시하고, 트리거가 "승인 없이 목적 상태 진입"을 감사 이벤트로 남기는 보강(후속) | |
| X7 | `errorMessage` 표시 — 줄바꿈 보존, 길이 제한, 보드 드래그 시 표시 위치 | 한·영 병기(Q60) 가독성 | 두 줄 문구로 거부 | 줄바꿈이 사라지면 ` / ` 구분자로 한 줄 | |
| **X8** | `avi:jira:updated:issue` payload — `changelog.items[]` 의 `fieldId:'status'`·`from`/`to` 가 상태 **id** 인지, 행위자 필드(`atlassianId`?), 전환으로 이 이벤트가 발생하는지, 지연 | 소비 확정·대기 만료의 주 경로 | 승인 후 전환 → 1분 안에 `getIssueTransitionApprovals.latest.consumedAt` 이 차고 상세 이력에 `CONSUMED`(reason `TRIGGER`). 대기 중 다른 상태로 옮기면 `EXPIRED`(ISSUE_STATE_CHANGED) | 이름(`fromString`)만 오면 `statusChangeOf` 가 id 를 못 얻는다 → 이슈의 현재 상태를 asApp 으로 읽는 대신 **지연 판정에만** 의존(트리거는 "상태 바뀜" 신호로만 쓰고 판정은 다음 조회·결정·validator 로) | |
| X9 | 트리거 `filter.expression`(상태 변경만 받기)·issueContext `displayConditions` 의 jiraExpression/프로젝트 프로퍼티 조건 지원 | 트리거 호출량, Q59 대안 | `forge lint` + 배포 후 상태 아닌 필드 수정 시 함수 호출 여부(호출 수 지표) | 미지원이면 현행(핸들러가 SQL 없이 즉시 반환) 유지 | |
| X10 | `avi:jira:deleted:issue` payload 에 `issue.id` | 삭제 만료 | 대기 요청이 있는 이슈 삭제 → 업무함에서 `EXPIRED` | 없으면 삭제 만료는 결정 시 `beforeDecide`(이슈 404 → 만료로 확장)로 대체 | |
| X11 | issueContext·issuePanel·issueAction 의 `extension`(issue.id·project.id·type·moduleKey), issueContext·issuePanel 에서 `Modal` 열기, issueAction 모달 안에서 또 Modal 열기 | 엔트리 분기·요청 진입 | 진단 모드(쿼리스트링 없이 페이지 로드만으로 컨텍스트 키 표시)로 세 모듈 확인 | issueContext 에서 Modal 이 안 되면 compact 레이아웃 안에 요청 폼을 인라인으로(lazy) | |
| X12 | `GET issue/{id}?expand=transitions` 결과가 `GET issue/{id}/transitions` 와 같은지(권한·조건 반영, `to.id`·`to.name`·`to.statusCategory.key`, `hasScreen`) | 요청 자격(`TRANSITION_NOT_AVAILABLE`) | 조건(예: 담당자만) 걸린 전환으로 두 응답 비교 | 다르면 전용 엔드포인트로 바꾸고 이슈 조회와 병렬 2콜 | |
| X13 | 코멘트 asUser POST — 코멘트 권한 없는 결재자(403 처리), 멘션 알림 이메일 전달, 처리 시간 | 코멘트 알림(Q55) | 코멘트 권한 없는 결재자 계정으로 최종 승인 → 결정은 성공, 코멘트 없음, 앱 내 알림 있음 | 권한 없는 결재자가 흔하면 최종 승인 코멘트만 asApp(사유 신설) 검토 — 사람 결정 | |
| X14 | `GET /rest/api/3/myself` 응답의 `locale` | 코멘트 언어 | 한국어 프로필 사용자로 요청 → 코멘트가 한국어 | 없으면 'en' 고정 또는 한·영 병기 | |
| X15 | team-managed 에서 `GET project/{id}`(`style`, `issueTypes`)·`GET project/{id}/statuses`(유형별 상태) 형태 | 규칙 화면·저장 검증 | team-managed 프로젝트 규칙 저장 | 형태가 다르면 `IssueStateReader.projectMeta` 분기 | |
| X16 | `GET issue/{id}/changelog` 순서(오래된 것부터?)·`total`·asApp 접근, 또는 `POST /rest/api/3/changelog/bulkfetch`(fieldIds 필터) 사용 가능 여부 | 무장 재시도(드문 경로) | X5 시나리오 + 목적 상태로 갔다 되돌아온 뒤 재전환 → `REJECT_CONSUMED`(reason `VALIDATOR_CHANGELOG`) | 끝 페이지 계산이 안 되면 bulkfetch(status 필터)로 | |
| X17 | 프로젝트 관리자(비 Jira 관리자)가 projectSettingsPage 에서 resolver 호출 시 `{project:'admin'}` 가드 통과(mypermissions `ADMINISTER_PROJECTS`) | 규칙 화면 접근 | 프로젝트 관리자 계정으로 규칙 저장 | 실패면 `hasProjectAdmin` 키 확인(U 계열과 함께) | |
| X18 | manifest 키 이름 — `jira:workflowValidator` 의 `function`·`name`·`description`, `jira:issueContext` 의 `label`, issuePanel `icon` | 배포 | `forge lint` | lint 지적대로 수정 | |
| X19 | 워크플로 스킴 교체·워크플로 편집 후 상태 id 유지 | 규칙 키 근거(설계 §3.2) | dev 프로젝트 워크플로 스킴 교체 후 같은 규칙으로 거부되는지 | 상태 id 가 바뀌면 규칙 화면에 "Jira 에서 찾을 수 없음"이 뜬다(설계에 있음) — 관리자 재저장 안내 | |
| X20 | 생성(Create) 전환에 validator 를 붙였을 때 payload(이슈 id 없음?) | `PASS_NO_ISSUE` 분기 | Create 전환에 부착 후 이슈 생성 | 이슈 id 가 오면(생성 직전 id 예약?) 규칙 매칭으로 막힐 수 있다 → 출발 상태 없음이면 통과로 고정 | |

### 구현 중 추가 (backend-engineer · 2026-10-03 Phase 3)

| # | 항목 | 영향 | 확인 방법 | 실패 시 동작 / 대안 | 결과 |
|---|---|---|---|---|---|
| **X21** | validator payload 에 `transition.to.id` 가 없을 때 | 설계 판정 표 4행대로 `PASS_NO_ISSUE`(통과) — **X1 이 틀리면 모든 전환이 조용히 통과(fail-open)** | 스파이크 빌드에서 X1 과 함께. 배포 후 `forge logs` 의 `[VALIDATOR] <code>` 분포에 `PASS_NO_ISSUE` 가 규칙 걸린 전환에서 나오는지 | `to.id` 가 다른 경로면 `validatorPayload.parseValidatorPayload` 후보 경로에 추가. 끝내 없으면 판정 표 4행을 "이슈는 있는데 to 없음 → REJECT_UNAVAILABLE" 로 바꾸는 설계 재검토 | |
| X22 | 백엔드 번들의 `locales/{kr,en}/transition.json` import | validator 거부 문구·코멘트 문구 | 규칙 걸린 전환을 요청 없이 시도 → 거부 문구가 키 이름이 아니라 문장으로 보이는지 | 번들이 JSON 을 못 싣으면 `messages` 사전을 `.js` 로 생성하는 merge 단계 추가 | |
| X23 | 트리거 `avi:jira:updated:issue` 의 행위자 필드(`atlassianId` 가정) | `consumed_by`·`CONSUMED` 이벤트 actorKey | 승인 후 전환 → 상세 이력 CONSUMED 의 `actorKey` 가 실행자인지 | 다른 필드면 `TransitionChangeService.handleEvent` 의 actor 경로 수정. 없으면 null 로 남는다(기능 영향 없음) | |
| X24 | 코멘트 링크(`detailUrl`) — 업무함 globalPage 의 절대 URL 형식 | 코멘트에 "업무함에서 보기" 링크 | 현재 **링크 없이** 보낸다(`detailUrl` null). globalPage URL(`/jira/apps/<appId>/<envId>` 등) 확인 후 `notifyExternal` 입력에 넣는다 | 확인 전까지 링크 생략(멘션·상태 줄은 정상) | |
| X25 | `[VALIDATOR] <code>` 로그 1줄/호출 | 규칙 없는 전환에도 매번 로그 — 로그량 | 배포 후 로그량 확인 | 많으면 PASS_NO_RULE 은 로그 생략 | |
| X26 | validator 의 라이선스 판정(`isLicenseBlocked({context})`) — validator context 에 `license` 가 오는지, 없으면 production 에서 License API 자기 조회(캐시 1시간) 지연 | 4초 예산 | production 설치에서 첫 호출 지연 측정 | 지연이 크면 라이선스 판정을 캐시만 보게(캐시 없으면 강제 쪽) | |

### 구현 중 추가 (frontend-engineer · 2026-10-03 Phase 4)

| # | 항목 | 영향 | 확인 방법 | 실패 시 동작 / 대안 | 결과 |
|---|---|---|---|---|---|
| X27 | issue 엔트리의 `extension.type` 값 — issueContext 가 `'jira:issueContext'` 로 오는지(아니면 compact 판정 실패) | 우측 요약이 full(순서표·이력·지연 청크)로 그려져 무거워진다 | 이슈 화면 로드 후 우측 요약에 "최근 요청"·결재 진행 섹션이 **없어야** 한다 | `transitionModel.resolveIssueView` 의 판정 키를 실측 값으로. 못 가리면 issueContext 용 엔트리를 따로 나눈다 | |
| X28 | ••• 메뉴(issueAction) 모달의 moduleKey 위치(`context.moduleKey` / `extension.moduleKey`) | 전환 목록(transitionPick)으로 갈지 판정. 둘 다 없으면 **issueAction 이면 전환 흐름**으로 간다(이 resource 의 issueAction 은 이것 하나) | ••• > Request transition approval → 목적 상태 목록이 뜨는지 | moduleKey 를 못 받고 다른 issueAction 이 main/modal 을 쓰게 되면 판정이 섞인다 — 그때는 issueAction 전용 엔트리로 분리 | |
| X29 | issueContext·issuePanel iframe 에서 `new Modal({resource:'main/modal'})` 의 `onClose` 가 불리는지(X11 의 일부) | 요청·결정 뒤 요약이 낡은 채로 남는다 | 요약에서 승인 요청 → 제출 → 모달 닫힘 직후 행이 "결재 중"으로 바뀌는지 | 안 불리면 포커스 재조회(AppProviders 기본)·새로 고침 버튼으로 따라온다(이미 있음) | |
| X30 | issue 엔트리 첫 로드 크기 — 고유 JS 6.3KB(gz)지만 초기 공유 청크 포함 약 206KB(gz, 8파일; @atlaskit/button 이 끄는 feature-gate·statsig 가 큼) | 모든 이슈 화면에서 뜨는 상시 로드. 다른 엔트리와 같은 청크라 캐시되면 재다운로드 없음 | 배포 후 이슈 화면 첫 진입 네트워크 탭에서 issue.html 의 JS 요청 크기·시간 | 크면 우측 요약 본문(TransitionApprovalList)을 worklog 엔트리처럼 지연 로드로 바꾸거나, compact 에서 @atlaskit/button 대신 primitives Pressable 로 | |
| X31 | projectSettingsPage 의 `extension.project.id` | 규칙 화면이 프로젝트를 못 찾으면 INVALID_TARGET 안내만 뜬다 | 프로젝트 설정 > Moves Approval 진입 시 규칙 표가 뜨는지(X17 과 함께) | 다른 키면 `entries/projectSettings.jsx` 의 판독 경로 수정 | |
