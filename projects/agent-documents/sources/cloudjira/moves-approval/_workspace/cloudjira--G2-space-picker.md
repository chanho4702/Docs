# G2 — 적용 스페이스를 목록에서 골라 적용

> **먼저 `_workspace/_SHARED.md` 를 읽을 것.**

## 지금 무엇이 문제인가

적용 스페이스 화면이 **빈 화면 + 검색**이라, 관리자가 무엇을 고를 수 있는지 모른다.
스페이스 키를 외워서 입력해야 하는 꼴이다.

**스페이스 목록을 바로 보여 주고 체크로 켜고 끄는** 화면으로 바꾼다.

## 건드릴 파일

```
static/ui/src/features/settings/SpaceSettings.jsx     (교체)
src/resolver/settings/SettingsService.js              (listSpaces 개선)
src/resolver/settings/__test__/SettingsService.test.js (테스트 추가)
locales/{kr,en}/space.json                            (키 추가)
```
⚠ `src/resolver/settings/` 의 **다른 파일과 GroupSettings/ManagerSettings 는 건드리지 말 것**
(병렬 태스크가 그쪽을 고치고 있다).

## 요구사항

1. **진입하자마자 스페이스 목록이 보인다.** 검색은 목록을 좁히는 보조 수단이다.
2. v2 spaces API 는 **커서 페이징**이다(start/limit 아님). "더 보기"로 이어 받는다.
3. 각 행: 스페이스 아이콘·이름·키 + 적용 토글(`@atlaskit/toggle`).
   `@atlaskit/dynamic-table` 로 그린다.
4. 토글은 **낙관적 업데이트**하되 실패하면 되돌리고 이유를 보여 준다.
5. 상단에 현재 적용 개수를 표시한다.
6. ⚠ **적용 스페이스를 한 번도 정하지 않은 설치는 "모든 스페이스 허용"이다**(기존 동작 유지).
   빈 목록과 "미설정"을 반드시 구분해 화면에 알린다 —
   "아직 정하지 않았습니다. 지금은 모든 스페이스에서 승인을 쓸 수 있습니다." 같은 안내.
   여기서 하나라도 켜는 순간 **나머지가 전부 꺼진다**는 것도 미리 알려야 한다.
   모르고 하나만 켰다가 다른 스페이스의 결재가 막히면 사고다.
7. 스페이스를 끌 때 그 스페이스에 **진행 중 결재가 있으면 건수를 경고**하고 확인을 받는다(DC 동작).
   건수 조회는 `approval_request` 에서 `space_key` + `is_open=1` 로 센다.

## 서버

`listSpaces({ cursor?, q? })` → `{ items: [{ id, key, name, icon, enabled }], nextCursor, hasMore, configured }`
- `configured`: 적용 스페이스를 한 번이라도 저장한 적이 있는가(위 6번 판단용)
- `enabled`: `approval_space_config` 와 조인한 결과

`setSpaceEnabled({ spaceKey, enabled })` → `{ spaceKey, enabled, openCount }`
- 끌 때 진행 중 건수를 함께 돌려준다

## 테스트
1. 미설정 상태와 빈 목록을 구분해 응답한다(`configured` 플래그)
2. 커서를 넘기면 다음 페이지를 요청한다
3. 끄기 요청이 진행 중 건수를 함께 돌려준다
