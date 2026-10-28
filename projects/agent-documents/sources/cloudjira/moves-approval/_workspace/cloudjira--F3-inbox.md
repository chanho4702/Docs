# F3 — 승인 업무함 (사이드바 + 목록 + 필터)

> **먼저 `_workspace/_SHARED.md` 를 읽을 것.**

## 이 기능이 하는 일

내가 결재할 것, 내가 요청한 것, 처리한 것을 한곳에서 본다. 결재 건수가 늘어도 첫 화면이 가벼워야 한다.

## 건드릴 파일

```
static/ui/src/entries/inbox.jsx          (교체)
static/ui/src/features/inbox/**          (교체·확장)
locales/{kr,en}/{inbox,filter,common}.json  (키 추가)
```
**백엔드는 이미 완성돼 있다.** `src/resolver/inbox/{InboxController,InboxService,InboxRepository}.js`
— 키셋 페이징·2단 권한 필터·탭별 조건이 들어 있다. **서버를 건드리지 말 것.**

## 서버 계약 (이미 구현됨)

```
listInbox({ tab, filters, cursor, limit })
  tab: 'myturn' | 'waiting' | 'requested' | 'done'
  → { items: [...], nextCursor, hasMore }        // ⚠ total 은 없다
getInboxCounts({ tab, filters }) → { statusCounts, myTurnCount }
```

⚠ **`total` 이 없는 것은 의도다.** 페이지 권한이 SQL 밖에서 걸려 정확한 총계가 원리적으로 불가능하다.
UI 는 "총 N건"을 만들어내지 말고 **"더 보기"(커서)** 로 표현한다.
상태 칩의 숫자는 `statusCounts`(권한 필터 이전 값)를 쓰되, **툴팁에 "권한 밖 문서 제외 전"**을 단다.

## UI

`src/app/AppShell.jsx` 를 쓴다. 사이드바 항목:

| key | 라벨 | 비고 |
|---|---|---|
| myturn | 내 차례 | `myTurnCount` 배지 |
| waiting | 진행 중 | |
| requested | 내 요청 | 행에서 바로 회수 |
| done | 처리한 건 | |
| notifications | 알림 | 안 읽은 수 배지 (F4 가 만드는 resolver 사용) |

본문:
- `@atlaskit/dynamic-table` 로 목록. 컬럼: 문서 · 상태 · 단계 · 요청자 · 마감 · 변경
- 상태 칩 레일(다중 선택) + 구체 필터(제목 검색 · 스페이스 · 요청자 · 기간 · 마감 · 내 차례)
- **필터 상태를 URL 에 유지**한다. Custom UI 라 `view.createHistory()` 로 만든 history 를
  React Router 에 꽂아 페이지 URL 해시에 싣는다. 공유·새로고침에 보존돼야 한다.
- 빈 상태는 `@atlaskit/empty-state`
- 로딩은 **스켈레톤**(스피너 금지). 첫 프레임에 표 모양 스켈레톤을 그려 레이아웃 점프를 막는다
- 행 클릭 → `Modal` 로 상세(F1 의 modal 엔트리, `intent: 'detail'`)

⚠ **globalPage 와 spacePage 가 같은 엔트리를 공유한다.** 스페이스 컨텍스트면
`extension.space.key` 가 있고 그 스페이스로 필터를 고정한다. 두 벌을 만들면 컬럼·필터가 갈라진다.

## 성능
`limit` 기본 50. 응답 5MB 벽이 있으니 한 번에 더 받지 않는다.
`getInboxCounts` 는 목록과 **분리 호출**한다 — count 가 느릴 때 목록까지 25초에 물리지 않게.

## 테스트
1. 탭 전환이 `listInbox` 를 올바른 `tab` 으로 호출한다
2. 필터 변경이 URL 에 반영되고, URL 로 진입하면 필터가 복원된다
3. `hasMore` 가 true 일 때만 "더 보기"가 보인다
4. 응답에 `total` 이 없어도 화면이 정상 렌더된다
