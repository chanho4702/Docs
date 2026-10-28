# Moves Approval–Workforce entity property 내부 연동 확정 (2026-10-14)

## 결정

두 Forge 앱의 자동 연동은 Jira entity property와 서명 검증을 사용한다. Approval에서 Workforce App REST API base URL과 수동 3LO access token을 받는 경로는 활성 UI·resolver·manifest egress에서 제외했다. 공개 apiRoute는 향후 외부 시스템용 읽기 창구로 보존한다.

## 이유

- Forge SQL/KVS는 설치별 전용이라 상대 앱이 직접 읽을 수 없다.
- App REST API는 외부 소비자용 3LO 경로이며 headless trigger의 기본 앱 간 통신 수단이 아니다.
- Jira entity property는 사용자·프로젝트·이슈·워크로그에 붙는 교환 문서이므로 대상과 수명을 명시해야 한다. 하나의 전역 공용 DB로 설명하면 안 된다.
- property는 앱 전용 비밀 저장소가 아니고 값 크기 제한과 last-write-wins 성격이 있다. 승인 판정·감사 원장은 Approval SQL에 두고 property는 서명된 projection으로 쓴다.

## 구현 경계

- `WorkforceOrganizationApiController`를 `CONTROLLER_REGISTRARS`에서 제외하고 관련 PermissionMap 항목을 제거했다.
- `WorkforceOrganizationApiSection`을 Settings tree에서 제외했다.
- `manifest.yml`의 `api.atlassian.com` backend egress를 제거했다.
- 보존 코드에는 비활성 이유를 남겼고, 활성 UI bundle에 resolver 이름과 API gateway URL이 없는지 확인했다.
- `docs/worklog-approval/ENTITY_PROPERTY_INTEGRATION.md`에 entity별 문서 위치, 삭제 영향, 신뢰 경계와 흐름도를 기록했다.

## 검증

- Approval backend: 191 suites / 2,875 tests
- Approval UI: 92 suites / 816 tests
- UI production build 성공(기존 의존성 경고만)
- Forge lint 0 issues
- `check:bundle` 통과
- development 4.3.0 배포·Jira 설치 반영 뒤 `forge eligibility`에서 Runs on Atlassian eligible을 확인했다.
- 실제 Approval `설정 → 워크포스 연동`에서 서명 정보 교환 안내가 보이고 수동 API URL·token 입력이 없으며 console error가 없는 것을 확인했다.

## 교훈

공개 API를 구현했다는 사실과 제품의 내부 동기화 경로를 분리해 문서화해야 한다. 보존된 실험 코드가 Controller registrar나 UI import에 남으면 권한·egress·사용자 설정이 사실상 활성 기능이 되므로, 비활성화는 네트워크 권한과 번들까지 함께 확인한다.

## 후속 결정: Approval apiRoute 제거

사용자가 외부 API도 현재 쓰지 않는다고 확정했다. Approval manifest의 승인·변경 이력 apiRoute 두 개와 전용 function, index export, adapter/test, `custom-scopes.yaml`을 제거했다. development에 이미 등록된 custom scope 이름은 Atlassian 정책상 삭제할 수 없지만 route에 연결되지 않는다. Workforce 저장소의 별도 조직 API는 이 Approval 변경 범위에 포함하지 않았다.

Approval development 4.6.0 배포와 Jira 설치 반영을 완료했다. 설치는 major version 4 `Up-to-date`이고 Runs on Atlassian eligible을 유지한다.

## 후속 결정: 연동 이슈의 화면 소유권과 worklog-only 범위

- 처음에는 서명된 `movesApproval.ctl`의 `wa.v == 1`만으로 Workforce의 `jira:issueActivity`와 `jira:issueContext`를 숨겼다. 실제 ARS-14에서 연동 모드여도 통제 정책 문서가 아직 게시되지 않은 구간에는 두 화면이 함께 보였다. 통제 문서의 존재와 화면 소유권을 결합한 것이 원인이었다.
- 최종적으로 Workforce가 관리하는 이슈 표식 `movesRmsLink`에 표시 전용 `worklogOwner`(`APPROVAL`/`WORKFORCE`)를 기록한다. `approvalLinkMode=ON`인 등록 이슈에서만 두 Workforce 모듈을 숨기고 Approval 화면을 남긴다. 설정 변경 시 전체 등록 이슈 백필을 강제로 큐에 넣고, 기존 ON 설치는 설정 조회 시 설치당 한 번 자동 백필한다. entity property는 표시 조건으로만 쓰며 승인 판정은 Approval SQL 원장을 계속 사용한다.
- 기간 단위 `TIMESHEET` 승인 코드는 기존 감사 자료 호환을 위해 보존하되, 업무함 메뉴·직접 URL·종류 필터·목록 조회에서는 제외했다. 기간은 worklog 자동 요청·마감·통계 기준으로만 사용한다.
- 수동 worklog 승인자 검색은 Approval 승인자 명부 밖 사용자도 허용한다. Jira 디렉터리에서 활성 사용자를 찾고 대상 이슈 열람 가능 여부를 서버에서 재검증한 뒤 후보와 요청에 사용한다.
- 자동 요청의 기본 승인자는 계속 서명 검증된 Workforce 팀장이며, 팀장이 없는 경우 작성자가 직접 검색한 승인자를 지정할 수 있다.
- `worklogApprovalFlow.saved.NOT_APPLICABLE` 같은 내부 i18n key가 그대로 노출되지 않도록 저장 결과 문구를 양 언어에 추가했다.

Approval은 development 4.7.0, Workforce는 `moves-rms` 8.5.0으로 배포했다. Workforce 설치 업그레이드는 latest 상태를 확인했다. 검증은 Approval backend 190 suites / 2,856 tests, UI 92 suites / 816 tests, Workforce backend 175 suites / 2,409 tests, UI 170 suites / 2,710 tests 통과 후 변경과 무관한 Kanban 비동기 테스트 1건을 단독 재실행해 17건 모두 통과했고, 양쪽 build·lint와 Approval `check:bundle`을 통과했다.

## 후속 검토: Jira 스페이스와 Workforce 프로젝트 범위

- Jira 스페이스 하나의 이슈는 각각 다른 Workforce project UUID에 연결될 수 있으므로, Jira project property를 Workforce project별 정책의 최종 권위로 설명하면 안 된다.
- 현행은 전체·무필터 SPACE 구독만 `movesRms.policy` project 신호 `ALL_ISSUES`를 내보내고, 소스 PK `(source_type, source_id)`가 그 전체 구독의 단일 소유자를 강제한다. 개별·필터 연결은 issue 신호와 issue ctl을 사용한다.
- `movesRmsLink.projectId`는 Workforce project UUID지만 표시용 힌트다. 실제 소속 확인은 Workforce SQL의 활성 프로젝트와 앱 전용 `moves_RMS_projectId` 필드가 담당한다.
- 혼합 연결에서는 `movesRms.issue`와 `movesApproval.ctl`을 issue 단위 최종 projection으로 보고 project ctl은 공통 기본값으로만 취급한다. issue ctl 누락·만료 시 남아 있는 project ctl로 잘못 허용하는 비동기 fallback을 별도 수용 시험으로 고정해야 한다.

## 고객 설명 보정: 승인 잠금과 변경 이력

- 고객 문서에서 “승인된 이슈 잠금”이라고 쓰면 Jira issue 편집까지 막는 것으로 오해된다. 현행은 승인된 **worklog 한 건**의 수정·삭제 잠금이며 기간 승인·마감은 해당 사용자·기간의 추가·수정·삭제 잠금이다.
- 앱 경로는 Approval SQL의 승인·인증 상태로 즉시 거부하고, Jira 기본 경로는 worklog visibility 제한으로 통제한다. 승인 저장과 visibility PUT 사이의 비동기 구간, 앱 권한 부족, 관리자·Automation 경로는 수용 시험 대상이다.
- 변경 이력은 APP 동기 기록 + Jira 이벤트 + SWEEP 보정의 합성 원장이다. `worklog_history`는 append-only이고 `worklog_mirror` CAS로 중복을 막지만, 관측 사이의 여러 변경·수집 시작 전 과거 이력·미러 없는 삭제는 복원할 수 없다.
- 기본 설명 원문 보관은 꺼져 있고 일반 이력 12개월, Workforce 연결 이력 36개월이다. 내보내기 확정 범위만 보관 정리한다.

## ERD 문서화에서 확인한 경계

- Approval SQL은 물리 `FOREIGN KEY`보다 `request_id`·`worklog_id`·`batch_id`의 논리 참조를 서비스가 검증하는 구조다. ERD에는 물리 FK로 오해하지 않도록 명시해야 한다.
- 핵심 승인 테이블은 UUID를 `BINARY(16)`으로 저장하지만 일부 Worklog 테이블은 `VARCHAR(36|64)`를 사용한다. 조인·저장 시 `UUID_TO_BIN`·`BIN_TO_UUID` 변환 경계를 저장소에 유지한다.
- 구 요청형 `worklog_certification*`과 현재 인증 원장 `worklog_cert*`이 함께 존재한다. 신규 기능과 감사 설명은 현재 모델을 기본으로 하고 구 테이블은 호환용으로 표시한다.
- 전체 테이블을 한 장에 나열하기보다 승인 원장, 대상 부속, Worklog 통제, 타임시트·기간, 운영·연동으로 나눠야 관계와 원장/projection 차이가 읽힌다.

## Entity property 용량 해석 보정

- Jira entity property는 entity당 key 개수는 무제한이지만 key 255바이트, 값 32,768바이트 제한이 있다. Connect app property의 앱당 100개 제한과 혼동하면 안 된다.
- 인증 게시물은 내부 상한 30,000바이트와 1,000건 상한을 사용하고, 넘으면 `wt`·`approval.truncated`로 표시한다. 누락 건은 승인/미승인으로 추정하지 않고 `NOT_OBSERVED`로 둔다.
- 승인 잠금과 감사는 SQL 원장을 보므로 잘림과 무관하지만, Workforce의 건별 원가·정산 완전성에는 영향을 준다. 완전성이 요구되면 generation이 있는 property chunk 게시 또는 Forge App REST API cursor pagination으로 확장한다.

## 임시 API 팀 조회 재개 (2026-10-15)

사용자 요청으로 관리자 읽기 전용 Workforce 조직 API 연결을 임시 복구했다. 기존 Controller 4개를 registrar와 admin PermissionMap에 등록하고, manifest backend egress에 api.atlassian.com을 address 객체로 허용했다. 설정 > 워크포스 연동에서 명시적 ON일 때만 임시 API 화면을 표시한다. 서명 기반 승인자 권위와 기존 팀 목록은 유지한다. 수동 3LO token은 KVS secret이며 자동 갱신하지 않는다.

검증: backend 209 suites/3,081 tests, UI 94 suites/831 tests, UI build 및 check:bundle 통과. forge lint --approve MAJOR_VERSION_RULE 통과. 외부 egress 추가는 major upgrade를 요구한다. 배포와 실제 토큰 연결은 미수행이다. 구현 기록: C:/CloudJira/moves-approval-jira/_workspace/workforce-api-reopen/.

## 임시 API 팀 조회 재개 폐기 (2026-10-15)
사용자가 재개 작업을 폐기하도록 요청하여 해당 코드·권한·화면·egress 변경을 모두 원복했다. 배포하지 않았다. 현재 상태는 기존 entity property 연동과 API 조회 비활성이다.

## 임시 API 조회 재복구 (2026-10-15)
사용자가 폐기 후 다시 복구를 요청하여 직전 11개 파일 변경을 동일하게 복구했다. 관리자용 수동 3LO 조회이며 서명 기반 승인 권위는 유지한다. Backend 3,081 tests, UI 831 tests, UI build, Forge lint(major version 규칙 승인), check:bundle 모두 통과. 아직 미배포.
