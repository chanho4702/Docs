# Moves Approval F4 알림·설정

## 구현 결정

- 알림 수신자는 이벤트 종류, 요청자, 행위자, 승인자 결정 상태로 순수 계산한 뒤 마지막에 행위자를 제거한다. `CONTENT_VERSION` 만료는 이미 `APPROVE`한 승인자까지 포함한다.
- `approval_notification`에는 멱등 식별 정보와 `kind`만 두고, `templateKey`와 accountId-only `vars`는 감사 이벤트·요청 레코드에서 조회 시점에 재구성한다. 프론트는 렌더 시점에 accountId를 Confluence 사용자 정보로 바꾸므로 표시명·이메일을 보관하지 않는다.
- 알림 적재는 `INSERT IGNORE` 한 문장으로 처리하며 사전 존재 조회를 하지 않는다. 호출부에서 쓸 `createNotificationsBestEffort`는 결재 커밋 이후 실패를 업무 실패로 되돌리지 않는다.
- 알림 목록도 SELF 조건 뒤에 `filterVisiblePages`를 적용한다. 소유자 조건만으로는 접근권한이 사라진 페이지 제목을 계속 노출할 수 있기 때문이다.
- 정책 scalar와 설정 관리자·승인 그룹의 제한된 목록은 KVS, 스페이스별 상태는 SQL에 저장한다. `spaceScopeConfigured` marker로 최초 미설정(전체 허용)과 명시적 빈 목록을 구분한다.
- `{admin:true}` 경로에서만 KVS 설정 관리자 목록을 읽도록 `resolveAdminPrincipal`을 연결했다. cache key에도 manager 판정을 포함해 warm runtime에서 관리자 목록 변경 전 판정이 재사용되지 않게 했다.
- Confluence REST v2 spaces에는 이름 검색 parameter가 없으므로 cursor pagination을 유지하면서 서버가 최대 4페이지를 제한적으로 스캔해 `q`를 적용한다. 그룹 picker와 사용자 검색은 공식 v1 디렉터리 API를 사용한다.

## UI

- 공용 `AppShell`의 좌측 4개 메뉴에 정책, 적용 스페이스, 승인 그룹, 설정 관리자를 연결했다.
- 모든 control·table·상태 표시는 Atlaskit을 사용하고, 로딩은 Skeleton으로 고정했다.
- 알림 패널은 읽음 여부를 텍스트가 든 `Lozenge`로 표시하고 cursor 기반 더 보기를 지원한다.

## 검증

- `npm test -- --runInBand`: 13 suites, 109 tests 통과.
- `npm run test:ui -- --runInBand`: 4 suites, 8 tests 통과.
- `npm run build:ui`: 성공. Atlaskit source map과 `react-select` CSS minimizer의 기존 dependency warning만 발생.
- `npx forge lint`: No issues found.

## 연결

- [[topics/forge-kvs-eventual-consistency-cache]]
- [[projects/confluence-approval-dc-2026-08-11-notification-outbox]]
- [[projects/confluence-approval-dc-2026-08-15-space-administration]]
