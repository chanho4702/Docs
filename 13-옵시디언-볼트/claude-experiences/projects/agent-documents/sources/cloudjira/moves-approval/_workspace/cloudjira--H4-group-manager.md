# H4 — 승인 그룹·설정 관리자를 "목록 + 등록 모달" 구조로

> **먼저 `_workspace/_SHARED.md` 를 읽을 것.**

## 지금 무엇이 문제인가

승인 그룹 화면이 좌(Confluence 그룹 전체) · 우(등록된 그룹) 2단이다.
사용자 지적: **"이 페이지는 우리가 관리하는 목록만 보여주고, 등록은 모달로 처리해야 한다."**
맞다 — 관리 화면의 주인공은 *우리가 등록한 것*이지 후보 전체가 아니다.

## 건드릴 파일

```
static/ui/src/features/settings/GroupSettings.jsx        (재구성)
static/ui/src/features/settings/ManagerSettings.jsx      (재구성)
static/ui/src/features/settings/DirectoryPicker.jsx      (모달용으로 재구성)
static/ui/src/features/settings/GroupFormModal.jsx       (신규)
static/ui/src/features/settings/ManagerAddModal.jsx      (신규)
static/ui/src/features/settings/directoryApi.js          (필요 시)
src/resolver/directory/**                                (커스텀 그룹 지원 추가)
src/rdb/schema/ddl/approvalGroup.sql.js                  (신규 — v012 만 쓸 것)
src/rdb/schema/ddl/index.js / migrate.js                 (자기 항목만, v012)
locales/{kr,en}/{policy,manager}.json                    (키 추가)
```
⚠ 다른 병렬 태스크가 `src/resolver/flow/`, `src/resolver/signature/`,
   `src/resolver/notification/`, `SettingsPage.jsx`, `SpaceSettings.jsx`, `PolicySettings.jsx`
   를 고치는 중이다. **건드리지 말 것.**
⚠ ddl 번호는 **v012 만** 쓴다.

## 화면 구조 (두 탭 공통)

```
[제목]                                    [+ 추가]
등록된 목록 (표)  — 우리가 관리하는 것만
  ... 커서 페이징 "더 보기"
```
등록이 하나도 없으면 `@atlaskit/empty-state` 로 안내하고 그 안에 추가 버튼을 둔다.

**추가 버튼 → 모달**에서 고른다. 모달 안에서 검색·페이징한다.
목록 페이지에 후보 전체를 펼치지 않는다.

## 승인 그룹 — 두 종류를 만들 수 있어야 한다 (DC 이식)

1. **Confluence 그룹 가져오기** — 구성원 변경이 자동 반영된다
2. **직접 만들기(커스텀 그룹)** — 고른 명단을 그대로 유지한다. 구성원이 바뀌지 않는다

⚠ **커스텀 그룹 이름이 Confluence 그룹과 겹치면 저장을 거부**한다.
   결재선의 `group:<key>` 참조가 어느 쪽을 가리키는지 항상 명확해야 하기 때문이다(DC 규칙).

각 그룹에 **전원 승인(requireAll)** 옵션을 둔다 — 그 그룹이 결재선 단계에 들어갔을 때
한 명만 승인하면 되는지, 전원이 해야 하는지.

### 스키마 v012 `approval_group`
group_key VARCHAR(255) PK, group_type VARCHAR(16) NOT NULL(`CONFLUENCE`|`CUSTOM`),
display_name VARCHAR(255) NULL, member_keys MEDIUMTEXT NULL(CUSTOM 전용, JSON 배열),
require_all TINYINT(1) NOT NULL DEFAULT 0, enabled TINYINT(1) NOT NULL DEFAULT 1,
created_at/updated_at TIMESTAMP NOT NULL.

⚠ DC 는 `MEMBER_KEYS` 를 **쉼표 구분 문자열**로 저장했다. JSON 배열로 저장하되
   accountId 에 쉼표가 없다는 가정에 기대지 말 것.

## 설정 관리자

등록된 관리자 목록만 표시(아바타·이름·상태 배지·제거).
추가는 모달에서 사용자 검색·선택. **Confluence 관리자는 배지로 구분**해
"이미 전권이 있으니 추가할 필요가 없다"를 알려 준다.
⚠ 자기 자신을 제거할 때는 확인을 받는다 — 마지막 관리자가 스스로를 빼면 설정에 아무도 못 들어간다.
   **관리자가 0명이 되는 제거는 거부**한다(Confluence 관리자는 남아 있지만, 앱 관리자 목록이
   비면 위임 구조가 무너진다는 사실을 화면에 알릴 것).

## resolver 추가

```
listApprovalGroups({ cursor?, q? })  — {admin:true} → 등록된 그룹만
createApprovalGroup({ type, key, displayName?, memberKeys?, requireAll })
updateApprovalGroup({ groupKey, ... })
deleteApprovalGroup({ groupKey })
```
기존 `listGroups`/`listGroupMembers`/`searchUsers`/`resolveUsers` 는 **모달 안에서** 쓴다.

## 테스트
1. Confluence 그룹과 이름이 겹치는 커스텀 그룹 생성이 거절된다
2. 등록 목록이 커서 페이징된다
3. 관리자를 0명으로 만드는 제거가 거절된다
4. 커스텀 그룹의 member_keys 가 JSON 으로 저장·복원된다
