# G3 — 승인 그룹·설정 관리자를 사용자 목록에서 선택

> **먼저 `_workspace/_SHARED.md` 를 읽을 것.**

## 지금 무엇이 문제인가

승인 그룹과 설정 관리자 화면이 **빈 페이지 + 검색창**이다.
관리자가 누구를 고를 수 있는지 전혀 안 보이고, 2자 이상 쳐야 뭔가 나온다.

**목록을 바로 보여 주고 고르는** 화면으로 바꾼다. 검색은 목록을 좁히는 보조 수단이다.

## 건드릴 파일

```
static/ui/src/features/settings/GroupSettings.jsx      (교체)
static/ui/src/features/settings/ManagerSettings.jsx    (교체)
static/ui/src/features/settings/DirectoryPicker.jsx    (신규 — 두 화면 공용)
static/ui/src/features/settings/directoryApi.js        (개선)
src/resolver/directory/DirectoryService.js             (신규)
src/resolver/directory/DirectoryController.js          (신규)
src/resolver/directory/__test__/DirectoryService.test.js (신규)
src/permission/PermissionMap.js                        (자기 항목만 추가)
src/index.js                                           (자기 registrar 만 추가)
locales/{kr,en}/{manager,policy}.json                  (키 추가)
```
⚠ `src/resolver/settings/` 와 `SpaceSettings.jsx` 는 **건드리지 말 것**(병렬 태스크가 고치는 중).

## ⚠ Cloud 의 제약 — 전수 목록은 없다

DC 는 `getUserNamesWithConfluenceAccess()` 로 디렉터리를 통째로 훑었다(상한 2000~3000).
**Cloud 에는 그런 API 가 없다.** 그러니 "전 사용자 목록"을 그대로 옮길 수는 없다.

대신 이렇게 채운다 — 우선순위대로:
1. **이미 선택된 사람**(현재 설정 관리자 / 그룹 멤버) — 항상 맨 위에
2. **그룹 멤버 목록** — 승인 그룹 화면에서는 선택한 그룹의 구성원이 곧 목록이다
   (`GET /wiki/rest/api/group/{groupId}/membersByGroupId`, 커서 페이징)
3. **검색 결과** — 2자 이상 입력 시 `search/user?cql=user.fullname~"..."`

즉 **처음부터 빈 화면이 되지 않게** 1·2로 채우고, 검색은 거기서 좁힌다.
그룹 목록 자체는 `GET /wiki/rest/api/group` 으로 **전부 가져올 수 있으니** 목록으로 보여 준다.

## "권한 확인" 요구 반영

각 사용자 행에 그 사람이 **무엇을 할 수 있는지** 표시한다:
- `accountStatus` 가 active 가 아니면 **비활성** 배지 + 선택 불가
  (DC 도 비활성 사용자를 결재선에서 제외했다)
- 이미 Confluence 관리자면 **관리자** 배지 — 설정 관리자로 또 넣을 필요가 없다는 뜻을 준다
- 이미 설정 관리자면 **선택됨** 표시

## 화면

`DirectoryPicker` 공용 컴포넌트:
- 좌: 후보 목록(아바타·이름·배지) + 검색 입력
- 우: 선택된 목록(제거 가능)
- `@atlaskit/dynamic-table` 또는 목록 + `@atlaskit/avatar`, `@atlaskit/lozenge`
- 로딩은 스켈레톤

**승인 그룹**: Confluence 그룹 목록에서 골라 등록. 등록한 그룹은 결재선 검색에 노출된다.
그룹을 고르면 그 구성원을 펼쳐 볼 수 있게 한다(누가 결재선에 들어올지 미리 확인).

**설정 관리자**: 사용자 목록에서 골라 등록. Confluence 관리자와 동일 지위임을 화면에 적는다.

## 서버 (`src/resolver/directory/`)

```
listGroups({ cursor?, q? })  — 'SELF'  → { items: [{ id, name, memberCount? }], nextCursor, hasMore }
listGroupMembers({ groupId, cursor? }) — 'SELF' → { items: [{ accountId, displayName, avatarUrl, accountStatus }], nextCursor, hasMore }
searchUsers({ q })           — 'SELF'  → { items: [...] }   // 2자 미만이면 빈 배열
resolveUsers({ accountIds })  — 'SELF' → { items: [...] }   // 이미 선택된 사람의 이름·상태를 채운다
```
⚠ `resolveUsers` 가 필요한 이유: 설정에는 accountId 만 저장돼 있어, 화면에 이름을 보여 주려면
   렌더 시점에 조회해야 한다. **표시명을 저장하지 않는 것은 의도다** — 이름이 바뀌어도 자동 반영되고
   보관하는 개인정보가 줄어든다.

## 테스트
1. `searchUsers` 가 2자 미만이면 API 를 호출하지 않는다
2. 비활성 사용자가 선택 불가로 표시된다
3. `resolveUsers` 가 accountId 목록으로 이름을 채운다
4. 그룹 멤버 조회가 groupId(이름 아님)를 쓴다
