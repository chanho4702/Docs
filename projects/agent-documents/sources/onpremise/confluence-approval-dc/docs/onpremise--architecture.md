# 승인 기능 아키텍처

## 상태 전이

```text
PENDING ── 최소 승인 수 충족 ──> APPROVED
   │                              │
   ├── 승인자 반려 ─────────────> REJECTED
   │                              
   └── 페이지 편집/기한 경과 ──> EXPIRED
                                  ▲
APPROVED ── 페이지 편집/기한 경과 ┘
```

- 한 명의 지정 승인자가 반려하면 즉시 `REJECTED`로 전이합니다.
- 최소 승인 수를 충족한 후에는 추가 승인/반려를 받지 않습니다.
- 동일 사용자의 동일 승인 재시도는 멱등 처리합니다.
- 페이지 version이 요청 당시 version보다 커지면 승인 여부와 관계없이 `EXPIRED`로 전이합니다.
- 콘텐츠 영역 승인의 1차 구현은 페이지가 편집되면 해당 페이지의 모든 영역 승인을 만료시킵니다.

## 저장 모델 (현재 구현)

- `Approval`: 대상, page version, revision, 상태, 최소 승인 수, 만료일
- `ApprovalPrincipal`: 사용자 또는 팀 승인자 구성
- `ApprovalDecision`: 승인자별 현재 결정
- `ApprovalAuditEvent`: 요청·승인·반려·만료·구성 변경 append-only 기록
- `ApprovalTeam`, `ApprovalTeamMember`: 앱 내부 팀
- `ApprovalSettings`: 상태 표시명과 승인자 수정 권한 그룹

현재 AO adapter는 `APR_REQ`와 `APR_APV` 두 테이블로 승인 aggregate와 승인자별 결정을 저장합니다. `ApprovalRequestRepository` 포트와 `ApprovalWorkflowService`를 사이에 두어 상태 머신은 Confluence API/AO에 종속되지 않습니다.

팀 구성은 승인 요청 시 사용자 목록으로 snapshot합니다. 이후 팀 멤버 변경이 이미 진행 중인 승인 요청의 정족수를 소급 변경하지 않게 하기 위함입니다.

## Confluence 연결

- 페이지 승인: `approval-page-panel` web panel(`location="atl.page.metadata.banner"`, 페이지 제목 위 header 영역)에서 최신 page 승인 상태 표시 및 승인/반려 POST action. 이 위치는 Confluence 기본 `decorators/page.vmd`가 `#webPanelForLocation("atl.page.metadata.banner", {"action": $action})`으로 렌더링하므로 context에서 `action`(`PageAware`)으로 현재 페이지를 얻는다.
- 콘텐츠 영역 승인: rich-text `Approval Region` macro
- 편집 만료: `PageUpdateEvent` listener가 page version을 읽어 page 단위 만료 서비스 호출
- 날짜 만료: cluster-safe scheduled job + 조회 시 lazy expiration
- 알림: email queue + Confluence in-app notification/workbox
- 검색: `/approvals/mine`의 사용자별 승인함 조회(상태 필터 지원)
- 저장: Active Objects, indexed lookup, transaction 적용

## 초기 REST 경계

`GET /rest/approval/1.0/approvals/{id}`로 승인 상태를 조회하고, 동일 리소스의 `/approve` 및 `/reject` POST로 결정을 기록합니다. 모든 endpoint는 `AuthenticatedUserThreadLocal`의 로그인 사용자와 `PermissionManager`로 대상 페이지 권한(`VIEW`/`EDIT`)을 확인하고, `actorKey`가 로그인 사용자의 user key 또는 username과 일치하는지 검증해 타인 명의의 결정을 차단합니다. 승인자 그룹/팀 정책과 XSRF 정책 세부는 다음 단계에서 연결합니다.

페이지 편집 이벤트 연결을 위한 `/approvals/page/{pageId}/expire?currentContentVersion=N` 경계도 제공합니다. 이 endpoint는 해당 page의 승인 요청을 조회해 새 content version보다 오래된 `PENDING`/`APPROVED` 요청을 일괄 `EXPIRED`로 전환합니다.

화면에서 전역 승인 이력 메뉴를 제공하지 않더라도 감사 이벤트는 보존합니다.
