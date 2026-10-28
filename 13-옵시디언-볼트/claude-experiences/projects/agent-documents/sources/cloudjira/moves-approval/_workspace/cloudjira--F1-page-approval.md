# F1 — 페이지 결재 (배너 + 요청/승인/반려 + 모달)

> **먼저 `_workspace/_SHARED.md` 를 읽을 것.** 공통 규칙(ADS 준수·호출 규약·충돌 방지)이 거기 있다.

## 이 기능이 하는 일

문서 하나 전체에 결재를 건다. 사용자 동선:
페이지 상단 배너에서 상태를 보고 → ••• 메뉴나 배너에서 요청 → 결재자가 승인/반려 → 배너가 갱신된다.

## 건드릴 파일

```
src/resolver/approval/ApprovalService.js          (신규)
src/resolver/approval/ApprovalController.js       (신규)
src/resolver/approval/__test__/ApprovalService.test.js (신규)
static/ui/src/entries/banner.jsx                  (교체)
static/ui/src/entries/modal.jsx                   (교체)
static/ui/src/features/approval/**                (신규 — 공용 표시 컴포넌트)
static/ui/src/features/request/**                 (신규 — 요청 폼)
static/ui/src/features/detail/**                  (신규 — 상세·반려·회수)
locales/{kr,en}/{banner,request,detail,decision}.json  (키 추가)
src/permission/PermissionMap.js                   (자기 항목만 추가)
src/index.js                                      (자기 registrar 만 추가)
```

**이미 있으니 다시 만들지 말 것**: `src/resolver/approval/ApprovalRepository.js`(CAS 완비),
`src/domain/approval/transitions.js`(상태 전이), `src/app/AppShell.jsx`.

## resolver 계약 (F3 업무함이 이 shape 를 전제로 병렬 개발 중 — 바꾸지 말 것)

### `getPageApproval({ pageId, regionId? })` — `{page:'view'}`
```
{ approval: null | { requestId, status, statusLabelKey, currentStepOrder, stepCount,
    isStale, approvedContentVersion, contentVersion, expiresAt, requesterKey, requestMessage,
    canApprove, canReject, canCancel, canRequest,
    steps: [{ stepOrder, requiredApprovals, approvers: [{ actorKey, decisionType, decidedAt }] }] },
  page: { id, version, title, spaceKey } }
```
`isStale` = APPROVED 인데 페이지가 승인 당시보다 새 버전. **승인은 영구 기록이라 만료시키지 않고
"낡았다"고 표시만 한다**(DC 의 버전 기록 모델).

### `createApproval({ pageId, regionId?, regionHash?, steps, expiresAt?, requestMessage? })` — `{page:'edit'}`
`steps`: `[{ approverKeys: string[], requiredApprovals?: number }]` → `{ requestId, status, currentStepOrder }`

### `decideApproval({ requestId, decision, reason? })` — `'SELF'`
`decision`: `'APPROVE'|'REJECT'`.
⚠ requestId 만 받으므로 가드가 pageId 를 모른다 → **서비스가 `hasPagePermission(pageId,'read')` 를
직접 재검증**한다. 실패 시 `PERMISSION_PAGE_VIEW_DENIED`.

### `cancelApproval({ requestId, reason? })` — `'SELF'`
요청자 본인 또는 **Confluence 관리자**만(앱 설정 관리자는 불가 — 설정 권한과 결재 개입을 분리한다).

### `searchApprovers({ term })` — `'SELF'` → `{ users: [{accountId, displayName, avatarUrl}], groups: [{id, name}] }`
Cloud 는 사용자 디렉터리 전수 스캔을 제공하지 않는다. **검색-온-타이핑**만 지원한다
(2자 미만이면 빈 결과). DC 의 "전체 목록" UI 를 이식하지 말 것.

## UI

### 배너 (`entries/banner.jsx`) — pageBanner 모듈
⚠ **iframe 은 경계 밖으로 그릴 수 없다.** 인라인은 **한 줄**만:
상태 Lozenge · `2/3단계` · stale 배지 · 마감 D-2 · 1차 액션 버튼 1~2개.
폼·상세는 전부 `Modal` API 로 별도 iframe 을 띄운다. DC 의 모달을 배너 안에 그대로 넣는 것이
이 마이그레이션에서 가장 흔한 함정이다.

⚠ `content.id` 가 없으면(앱 페이지 등) **아무것도 그리지 않는다.** 결재가 없는 문서에서도
그리지 않는다 — 빈 띠가 모든 페이지를 아래로 민다.

⚠ 배너는 모든 사용자가 모든 페이지에서 로드한다. **무거운 @atlaskit 컴포넌트를 정적 import 하지 말 것**
(Lozenge/Button 까지만). 나머지는 modal 엔트리에 둔다.

### 모달 (`entries/modal.jsx`) — Modal API + contentAction 겸용
`intent` 로 화면을 가른다: `request`(요청 폼) / `detail`(상세) / `reject`(사유) / `cancel`(회수 확인).
- Modal 로 열리면 `extension.modal.context.intent`
- contentAction(••• 메뉴)으로 열리면 content 컨텍스트만 오므로 기본 `request`

⚠ **모달은 별도 iframe 이라 QueryClient 가 분리된다.** 여기서 결재해도 부모 배너는 모른다.
닫을 때 `view.close(payload)` 로 결과를 넘기고, 부모가 `onClose` 에서
`approvalKeys.page(contentId)` 로 invalidate 한다. 쿼리키는 `utils/queryKey` 팩토리를 쓴다.

요청 폼: 결재선 편집(사용자·그룹 검색, 순서 변경, 단계별 통과 조건), 마감일(`@atlaskit/datetime-picker`),
요청 메모(≤500자). 반려는 **모달 안 인라인 스텝**으로 사유를 받는다(브라우저 prompt 금지).

## 테스트
1. `decideApproval` 이 페이지 VIEW 권한을 재검증한다(권한 없으면 Repository 미호출)
2. `cancelApproval` 이 앱 설정 관리자를 거절한다
3. 반려 사유 필수 설정에서 공백 사유가 거절된다
4. `payload.actorKey` 를 무시하고 `principal.accountId` 를 쓴다
5. `searchApprovers` 가 2자 미만이면 API 를 호출하지 않는다
