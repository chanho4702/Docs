# H5 — 결재 위임(대리 결재)

> **먼저 `_workspace/_SHARED.md` 를 읽을 것.**

## 무엇을 만드나

자리를 비우는 동안 대신 결재할 사람을 지정한다. DC 기능을 옮긴다 —
**관리자 설정이고 기본은 꺼짐**이다.

## 이미 준비된 것 (다시 만들지 말 것)

`src/domain/approval/transitions.js` 의 `approve`/`reject` 는 **이미 `delegateKey` 를 받는다.**
`derive.js` 의 `delegateKeyFor` 도 있다. 스키마의 `approval_event.delegate_key` 도 있다.
이 작업은 **위임 등록·조회·판정**을 만들고 그 값을 넘겨 주기만 하면 된다.

## 건드릴 파일

```
src/rdb/schema/ddl/approvalDelegation.sql.js      (신규 — v013 만 쓸 것)
src/rdb/schema/ddl/index.js / migrate.js          (자기 항목만, v013)
src/resolver/delegation/DelegationRepository.js   (신규)
src/resolver/delegation/DelegationService.js      (신규)
src/resolver/delegation/DelegationController.js   (신규)
src/resolver/delegation/__test__/*.test.js        (신규)
static/ui/src/features/delegation/**              (신규)
locales/{kr,en}/delegation.json                   (신규)
src/permission/PermissionMap.js / src/index.js    (자기 항목만)
```
⚠ 다른 병렬 태스크가 `src/resolver/{flow,signature,notification,directory}/`,
   `features/settings/*`, `RequestForm.jsx`, `InboxPage.jsx` 를 고치는 중이다. **건드리지 말 것.**
⚠ `ApprovalService.js` 도 건드리지 말 것 — 연결은 통합 시 사람이 한다.
   대신 `DelegationService.resolveDelegation(approverKey, now)` 를 export 하고
   **연결이 필요하다는 사실을 완료 보고에 적어라.**

## 스키마 v013 `approval_delegation`

delegation_id BINARY(16) PK, approver_key VARCHAR(128) NOT NULL(맡긴 사람),
delegate_key VARCHAR(128) NOT NULL(대리인), starts_at TIMESTAMP NULL, ends_at TIMESTAMP NULL,
enabled TINYINT(1) NOT NULL DEFAULT 1, note VARCHAR(500) NULL,
created_at TIMESTAMP NOT NULL, created_by VARCHAR(128) NOT NULL.
`INDEX (approver_key, enabled)`, `INDEX (delegate_key, enabled)`.

⚠ **UNIQUE 를 걸 수 없다.** "살아 있는 위임"이 `enabled` + 기간 조합이라 단일 컬럼으로 안 떨어진다.
   중복 방지는 애플리케이션이 한다(등록 전 겹치는 기간 확인).

## 활성 판정

```
enabled = 1
AND (starts_at IS NULL OR starts_at <= now)
AND (ends_at   IS NULL OR ends_at   >= now)     -- 종료 시각 '까지' 포함
```
⚠ 만료된 위임 행을 **삭제하지 않는다.** 감사 목적이다 — 누가 언제 대신 결재했는지 남아야 한다.
⚠ 같은 사람에게 활성 위임이 여러 개면 **먼저 등록된 것이 이긴다**(created_at ASC 첫 행).
   DC 와 같은 규칙. 임의로 바꾸면 어느 대리인이 유효한지 예측할 수 없어진다.

## 규칙

- **자기 자신에게 위임할 수 없다.**
- **위임할 수 있는 것은 내 결재뿐이다** — 남의 결재를 대신 위임해 줄 수 없다.
  (관리자도 마찬가지다. 관리자가 남의 위임을 만들면 그 사람 모르게 결재가 넘어간다.)
- **해제는 맡긴 사람과 받은 사람 모두 할 수 있다.** 받은 사람이 부담스러우면 뺄 수 있어야 한다.
- 위임 **체인은 금지**한다 — A→B, B→C 일 때 A 의 결재가 C 에게 가지 않는다.
  한 단계만 본다. 체인을 허용하면 결재 권한이 어디까지 흘렀는지 추적이 불가능해진다.

## ⚠ 관리자가 위임을 끄면 **즉시** 막혀야 한다

DC 는 이 값만 **설정 캐시를 우회해 매번 저장소에서 직접 읽는다.**
권한을 여닫는 값이라 몇 초만 늦어도 남의 이름으로 결재가 나갈 수 있기 때문이다.
`delegationEnabledNow()` 를 같은 방식으로 만들고, 결재 확정 경로에서 그것을 쓴다.
캐시된 설정값을 쓰지 말 것.

## resolver

```
listMyDelegations()                 — 'SELF' → { given: [...], received: [...] }
createDelegation({ delegateKey, startsAt?, endsAt?, note? })  — 'SELF'
disableDelegation({ delegationId }) — 'SELF'   // 맡긴 사람·받은 사람 모두 가능
resolveDelegation({ approverKey })  — 내부용(resolver 로 노출하지 않는다)
```
⚠ `createDelegation` 의 `approver_key` 는 **반드시 `principal.accountId`** 다.
   payload 로 받지 말 것 — 받으면 남의 결재를 위임할 수 있게 된다.

## 결재 기록 규칙 (도메인이 이미 지키는 것)

- `decision.actor_key`, `event.actor_key` = **결재선의 주인**(원 결재자)
- `event.delegate_key` = **실제로 누른 사람**(대리인)
- 이력 표시: `승인 · 홍길동 (대신 결재: 김대리)`
- 결재선의 자리는 위임으로 **바뀌지 않는다** — 단계 구성은 그대로다

## 화면 (`features/delegation/`)

- **내 위임**: 맡긴 것 / 받은 것 두 목록. 등록은 **모달**(대상자 검색·기간·메모).
- 기간을 비우면 "해제할 때까지"임을 화면에 적는다.
- 받은 위임에는 누가 맡겼는지와 기간을 보여 주고 해제 버튼을 둔다.
- 진입점 연결(업무함 어디에 둘지)은 **통합 시 사람이 한다.** InboxPage 를 건드리지 말 것.

## 테스트
1. 자기 자신에게 위임하면 거절된다
2. `payload.approverKey` 를 넣어도 무시하고 `principal.accountId` 를 쓴다
3. 활성 위임이 여러 개면 먼저 등록된 것이 이긴다
4. 기간이 지난 위임은 활성이 아니다(행은 남아 있다)
5. 받은 사람도 해제할 수 있다
6. 위임 체인이 만들어지지 않는다(A→B, B→C 일 때 A 의 대리인은 B 뿐)
7. `delegationEnabledNow()` 가 캐시를 거치지 않는다(호출 경로 검사)
