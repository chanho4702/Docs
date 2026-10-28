# H1 — 결재선 템플릿(승인 Flow)

> **먼저 `_workspace/_SHARED.md` 를 읽을 것.**

## 무엇을 만드나

자주 쓰는 결재선을 미리 만들어 두고 요청할 때 골라 쓴다("품의 결재선", "지출 결재선").
DC 의 '승인 Flow' 에 해당한다.

⚠ **상태 머신은 건드리지 않는다.** 상태(PENDING/APPROVED/...)는 결재 요청의 생명주기이고,
Flow 는 **결재선(단계 구성)의 템플릿**이다. 둘은 다른 층이다.
`src/domain/approval/transitions.js` 를 수정하지 말 것.

## 건드릴 파일

```
src/rdb/schema/ddl/approvalFlow.sql.js            (신규 — v008, v009)
src/rdb/schema/ddl/index.js                       (re-export 추가만)
src/rdb/schema/migrate.js                         (enqueue 추가만 — v008, v009 번호를 쓸 것)
src/resolver/flow/FlowRepository.js               (신규)
src/resolver/flow/FlowService.js                  (신규)
src/resolver/flow/FlowController.js               (신규)
src/resolver/flow/__test__/FlowService.test.js    (신규)
static/ui/src/features/flow/**                    (신규)
static/ui/src/features/settings/SettingsPage.jsx  (Flow 탭 추가만)
static/ui/src/features/request/RequestForm.jsx    (Flow 선택 드롭다운 추가만)
src/permission/PermissionMap.js / src/index.js    (자기 항목만)
locales/{kr,en}/flow.json                         (신규)
```
⚠ 다른 병렬 태스크가 `src/resolver/signature/`, `src/resolver/notification/`,
   `features/settings/{Group,Manager}Settings.jsx` 를 고치는 중이다. **건드리지 말 것.**
⚠ ddl 번호는 **v008, v009 만** 쓴다(다른 태스크가 v010~ 를 쓴다).

## 스키마

**v008 `approval_flow`**: flow_id BINARY(16) PK, name VARCHAR(255) NOT NULL,
description VARCHAR(500) NULL, enabled TINYINT(1) NOT NULL DEFAULT 1,
default_deadline_days INT NULL, created_at/updated_at TIMESTAMP NOT NULL,
created_by VARCHAR(128) NULL, rev INT NOT NULL DEFAULT 1.
`UNIQUE uq_flow_name (name)` — 같은 이름 두 개면 요청 화면에서 구분이 안 된다.

**v009 `approval_flow_step`**: flow_id BINARY(16), step_order INT, principal_type VARCHAR(8)
(`USER`|`GROUP`), principal_key VARCHAR(255), required_approvals INT NOT NULL DEFAULT 1.
`PRIMARY KEY (flow_id, step_order, principal_type, principal_key)`.

⚠ DC 는 단계를 `user:alice;group:leads` 같은 **문자열로 직렬화**해 저장했고,
   그 탓에 조회·수정이 통째로 문자열 파싱이 됐다. 정규화 테이블로 푼다.

## resolver — 전부 `{admin: true}`

```
listFlows({ cursor?, q? })        → { items: [{ flowId, name, description, enabled, stepCount, defaultDeadlineDays }], nextCursor, hasMore }
getFlow({ flowId })               → { flow, steps: [{ stepOrder, principals: [...], requiredApprovals }] }
createFlow({ name, description?, steps, defaultDeadlineDays? })
updateFlow({ flowId, name?, description?, steps?, defaultDeadlineDays?, rev })
setFlowEnabled({ flowId, enabled })
deleteFlow({ flowId })
```
`listFlows` 만 **`'SELF'`** 로도 열어야 한다 — 요청 폼에서 일반 사용자가 골라야 하기 때문이다.
그래서 **읽기 전용 함수를 따로 둔다**: `listAvailableFlows()` — `'SELF'`, enabled 인 것만.

⚠ `updateFlow` 는 `rev` 로 낙관적 락을 건다. 두 관리자가 같은 Flow 를 동시에 고치면
   나중 저장이 앞선 것을 조용히 덮어쓴다.

## 화면

**설정 → Flow 탭**: 등록된 Flow **목록만** 보여 준다(이름·설명·단계 수·사용 여부·작업).
"Flow 만들기" 버튼 → **모달**에서 편집. 목록 페이지에 편집 폼을 펼치지 않는다.
목록은 커서 페이징("더 보기").

**Flow 편집 모달**: 단계를 추가·삭제·순서 변경하고 각 단계에 사용자/그룹을 넣는다.
`RequestForm` 의 단계 편집기와 **같은 조작감**이어야 한다 — 사용자가 두 번 배우지 않게.
가능하면 그 컴포넌트를 뽑아 공유할 것.

**요청 폼**: 상단에 "결재선 템플릿" 선택. 고르면 단계가 채워지고 **그 뒤 자유롭게 수정 가능**하다
(템플릿은 출발점이지 잠금이 아니다). 고른 Flow 의 `defaultDeadlineDays` 로 마감일을 채운다.

⚠ 그룹 단계는 **요청 시점의 구성원으로 확정(스냅샷)** 한다 — 이미 `createApproval` 이
   `expandRequestedSteps` 로 하고 있으니 그 경로를 그대로 탄다. Flow 는 `group:<id>` 를 넘길 뿐이다.

## 테스트
1. 같은 이름 Flow 를 두 번 만들면 거절된다
2. `updateFlow` 가 rev 불일치 시 거절한다
3. `listAvailableFlows` 는 enabled 인 것만 돌려준다
4. 비활성 Flow 는 요청 폼 선택지에 없다
