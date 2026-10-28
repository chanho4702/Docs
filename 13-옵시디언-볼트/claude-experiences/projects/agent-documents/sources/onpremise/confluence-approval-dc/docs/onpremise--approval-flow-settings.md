# 승인 Flow 설정

## 목적

승인 Flow는 반복되는 승인 단계 구성과 기본 마감일을 관리자 한 명이 일관되게 관리하기 위한 설정이다. Flow를 사용해 승인 요청을 만들면 해당 시점의 승인자 목록을 개별 사용자 key로 snapshot한다. 이후 조직 또는 그룹의 구성원이 바뀌어도 진행 중인 요청은 바뀌지 않는다.

> **2026-08-10 갱신** — 최소 승인 인원 방식은 **순차 단계 승인**으로 대체됐다.
> Flow에 적은 순서가 곧 승인 순서이며, 앞 단계가 통과해야 다음 단계 차례가 된다.
> 그룹은 별도의 **그룹 설정**에서 등록·관리한다. 자세한 배경은 `progress-2026-08-10-2.md` 참고.

## 접근과 권한

- 주소: `/confluence/plugins/servlet/approval-settings`
- 접근 대상: Confluence administrator
- 서버 검증: `ApprovalSettingsServlet`와 Flow REST API 모두 `PermissionManager.isConfluenceAdministrator`를 확인한다.
- 일반 사용자가 URL 또는 REST 경로를 직접 호출하면 `403 Forbidden`을 반환한다.

## 현재 제공 기능

설정 화면(`/plugins/servlet/approval-settings`)은 **승인 설정 / Flow 설정 / 그룹 설정** 세 메뉴로 나뉜다.

### Flow 설정

- 이름, 승인 단계, 기본 마감일(일)을 입력해 Flow를 생성한다.
- 승인 단계는 쉼표로 구분해 적고, 적은 **순서가 그대로 승인 순서**가 된다.
  그룹은 `group:` 접두사를 붙인다. 예: `alice, group:reviewers, bob`
- 기본 마감일 `0`은 마감일 미설정을 뜻한다.
- 목록에는 단계 수, 순서대로 나열한 담당자, 마감일, 사용 여부가 표시된다.
- 승인 요청 모달의 `승인 Flow 사용` 탭에서 활성 Flow를 선택해 적용한다.
  Flow를 고르면 단계와 담당자를 미리 보여준다.
  서버는 화면에서 보낸 값 대신 저장된 Flow 정책을 다시 읽는다.

### 그룹 설정

- 결재선에 올릴 수 있는 Confluence 그룹을 **등록한 것만** 노출한다.
  전체를 열어두면 검색 결과가 무의미해지고 의도하지 않은 그룹이 승인자가 된다.
- 그룹별로 **표시 이름**(예: `기술본부 팀장단`)과 **통과 조건**(구성원 중 1명 / 전원)을 정한다.
- 구성원 미리보기로 지금 누가 결재선에 들어오는지 확인할 수 있다.
- 등록을 해제해도 이미 만들어진 요청의 승인자는 바뀌지 않는다. 생성 시점에 펼쳐 저장하기 때문이다.

### 승인 설정

전역 마감일 기본값, 만료 sweep 주기, 마감 임박 기준, 반려 사유 필수 여부,
알림 사용 여부와 발송 주기, 상태 표시명을 관리한다.

## REST 계약

| Method | 경로 | 용도 |
| --- | --- | --- |
| `GET` | `/rest/approval/1.0/approvals/users?query={2글자 이상}` | 로그인 사용자가 선택할 승인자 검색 |
| `GET` | `/rest/approval/1.0/approvals/groups?query=` | 결재선에 올릴 수 있는 **등록된** 그룹 조회 |
| `GET` | `/rest/approval/1.0/approvals/flows` | 관리자 Flow 목록 조회 |
| `POST` | `/rest/approval/1.0/approvals/flows` | 관리자 Flow 생성 |
| `POST` | `/rest/approval/1.0/approvals/flows/{flowId}` | 관리자 Flow 수정 |
| `GET` | `/rest/approval/1.0/approvals/flows/available` | 로그인 사용자가 페이지 요청에 적용할 활성 Flow 조회 |
| `GET` | `/rest/approval/1.0/approvals/groups/directory?query=` | 관리자가 등록 대상을 고르기 위한 Confluence 그룹 검색 |
| `GET`·`POST`·`DELETE` | `/rest/approval/1.0/approvals/groups/registered` | 관리자 승인 그룹 등록 관리 |
| `GET` | `/rest/approval/1.0/approvals/groups/registered/{name}/members` | 그룹 구성원 미리보기 |

`POST /flows` 파라미터는 `name`, `steps`, `defaultDeadlineDays`이다.
`steps`는 세미콜론이 단계 구분자인 내부 전송 형식(`user:alice;group:reviewers`)이며,
화면에서는 쉼표로 적고 저장할 때 변환한다. `minimumApprovals`·`approverKeys`·`approverGroups`는
하위 호환으로 남아 있고 `steps`가 오면 무시된다.

`POST /groups/registered` 파라미터는 `groupName`, `displayName`, `requireAll`, `enabled`이다.
존재하지 않는 Confluence 그룹은 `400`으로 막는다.

승인 요청 생성 API에는 선택적으로 `flowId`를 보낼 수 있다. `flowId`가 있으면 해당 Flow가
활성 상태인지 확인한 뒤 Flow의 단계 구성과 기본 마감일을 적용한다.
따라서 브라우저 요청을 수정해 Flow 정책을 우회할 수 없다.
단계 순서가 저장되지 않은 기존 Flow는 예전 최소 인원 경로를 그대로 탄다.

## 저장 구조

- `APR_FLOW`: Flow 식별자, 이름, 활성화 여부, 기본 마감일, 생성 시각.
  `MIN_APPROVALS` 컬럼은 남아 있으나 순차 Flow에서는 단계 수를 담을 뿐 정책으로 쓰이지 않는다.
- `APR_FLOW_P`: Flow별 승인 주체. `USER`/`GROUP` type과 `STEP_ORDER`를 저장한다.
  `STEP_ORDER`가 0인 행은 순서 없이 저장된 기존 Flow다.
- `APR_GROUP`: 등록한 승인 그룹. 그룹 이름, 표시 이름, 전원 승인 여부, 활성 여부.
- `APR_APV`: 요청별 승인자 snapshot. `STEP_ORDER`와 `STEP_REQUIRED`로 단계와 통과 조건을 함께 보관한다.

Flow를 실제 요청에 적용할 때 그룹은 해당 시점의 활성 구성원을 사용자 key로 펼쳐 `APR_APV`에 snapshot한다.
그룹의 통과 조건이 "전원"이면 펼친 인원 수가 그 단계의 `STEP_REQUIRED`가 된다.

## 검증 절차

1. Confluence administrator로 승인 업무함 헤더 우측의 **설정 아이콘**을 연다.
2. `그룹 설정`에서 쓸 Confluence 그룹을 검색해 등록하고, 표시 이름과 통과 조건을 정한다.
   구성원 미리보기로 활성 구성원이 있는지 확인한다.
3. `Flow 설정`에서 이름과 승인 단계(`alice, group:reviewers, bob`), 기본 마감일을 입력해 저장한다.
4. 오른쪽 목록에 `n단계 순차 승인`과 순서대로 나열한 담당자가 표시되는지 확인한다.
5. 편집 가능한 페이지에서 상단 `승인 요청` 버튼을 눌러 모달을 열고,
   `승인 Flow 사용` 탭에서 생성한 Flow를 고른다. 단계와 담당자 미리보기가 뜨는지 확인한다.
6. 요청을 만든 뒤 단계 순서와 마감일이 Flow 정책대로 적용되는지 확인한다.
7. 2단계 승인자로 먼저 승인을 시도해 `409`가 반환되는지 확인한다.
8. 일반 계정으로 설정 주소와 Flow·그룹 관리 REST 경로에 접근해 `403`인지 확인한다.

## 페이지 편집 만료

`ApprovalPageUpdateListener`는 Confluence `PageUpdateEvent`를 구독한다. 페이지가 저장되어 content version이 증가하면 해당 페이지의 이전 version에 속한 `PENDING` 또는 `APPROVED` 요청을 domain service로 전달해 `EXPIRED`로 전이한다. 이벤트 listener는 플러그인 시작 시 `EventPublisher`에 등록되고 종료 시 해제된다.

만료 사유는 감사 기록에 셋으로 구분해 남는다.
`CONTENT_VERSION`(승인 중 수정) / `CONTENT_VERSION_AFTER_APPROVAL`(승인 후 수정) / `DEADLINE`.
승인 후 수정으로 무효가 되면 **이미 승인한 사람에게도** 알림이 가고, 화면에 재승인 안내가 표시된다.

> **⚠ 2026-08-10 확인 — 이 listener는 지금 동작하지 않는다.**
> `@Named`만으로는 Atlassian Spring Scanner가 빈을 만들지 않는다(컴포넌트가 lazy이고
> 주입받는 곳이 없다). `@ExportAsService`를 추가했으나 아직 검증되지 않았다.
> 같은 이유로 만료 sweep과 알림 발송 scheduler도 동작하지 않았다.
> 서버 재시작 후 확인해야 한다. `progress-2026-08-10-2.md` 9항 참고.

별도 테스트 페이지에서 승인 요청 생성 → 페이지 본문 저장 → `EXPIRED`와 감사 이력 생성
순서로 수동 인수 검증을 수행한다.
