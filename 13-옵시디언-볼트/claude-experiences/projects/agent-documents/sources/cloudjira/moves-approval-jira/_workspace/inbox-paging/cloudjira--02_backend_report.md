# 02 백엔드 보고서 — 업무함 페이징 (inbox-paging)

> 회차: 1차 (2026-10-22) · 범위: requirement.md "2. 백엔드"만. 프론트(static/ui)·docs·SQL 스키마·manifest 무변경.

## 0. 시작 시점 상태 (이미 있던 것)

- `normalizeInboxFilters` 는 이미 **모든 탭**에서 `filters.targetKinds` 를 `TargetKind` 허용 목록으로 검증하고, Repository `applyFilters` 가 `target_kind IN (...)` 으로 SQL 조건을 건다(커밋된 코드). 카운트 resolver(`getInboxCounts`)도 같은 정규화를 거친다.
  → 이번 회차는 **limit 정규화·응답 `limit`·끝 감지(빈 SELECT 제거)·테스트 고정**이 실제 코드 변경이다.

## 1. 변경 파일

| 파일 | 변경 |
|---|---|
| `src/resolver/inbox/InboxService.js` | `INBOX_PAGE_SIZES=[20,50,100]`·`DEFAULT_LIMIT=20`·`normalizeInboxLimit()` 신설(export), `MAX_LIMIT` 제거, 응답에 `limit` 추가, 창이 덜 차면 끝으로 보고 루프 종료 |
| `src/resolver/inbox/__test__/InboxService.test.js` | limit 1/2 전제 테스트를 20 기준으로 재작성, `페이지 크기·종류 필터(inbox-paging)` describe 추가(21개 케이스) |

Repository·Controller·PermissionMap·index 무변경(새 resolver 없음).

## 2. resolver 계약

### `listInbox` (권한 축 `'SELF'`, 기존)

요청 payload:
```js
{
  tab: 'myturn' | 'waiting' | 'requested' | 'done' | 'cc' | 'history',   // 기본 'myturn'
  limit: 20 | 50 | 100,           // 정규화 — 아래 §3
  cursor: string | null,          // 이전 응답의 nextCursor (base64url 불투명 문자열). 1페이지 = null/생략
  filters: {
    targetKinds?: string[],       // §4
    projectKey?, q?, status?/statuses?, requesterKeys?, flowIds?, due?, createdFrom/To?, expiresFrom/To?, ...
    role?, updatedFrom?, updatedTo?   // history 탭 전용 (다른 탭이면 INVALID_TARGET)
  }
}
```

성공 응답(guardedDefine 래핑 후 프론트가 받는 값):
```js
{ success: true, items: [ /* 행 */ ], nextCursor: 'eyJ1Ijo...' | null, hasMore: boolean, limit: 20 | 50 | 100 }
```
- `limit` 은 **서버가 실제 적용한 값**(신규 필드). 빈 결과 조기 반환(`targetKinds: []`, 프로젝트 확인 실패)도 `{ items: [], nextCursor: null, hasMore: false, limit }`.
- `total` 은 없다(권한 필터가 SQL 뒤라 정확한 전체 건수 불가 — 기존 테스트 유지).
- `items[]` 행 shape 은 기존과 동일(snake 원본 + `title`·`issueKey`·`projectKey`·`projectName`·`projectAvatarUrl`·`periodKey`·`subjectAccountId`·`transition`·`fieldChange`·`worklogCreate`·`worklogApproval`·`onBehalfOf`·`updatedAt/createdAt/expiresAt`(epoch ms)·`apply` 등). 변경 없음.
- `hasMore=true` 인데 `items.length < limit` 일 수 있다(§5 최악 경우). 프론트는 "다음" 활성 여부를 `hasMore` 로만 판단할 것.
- 같은 cursor 로 다시 부르면 같은 페이지가 나온다(키셋 `(updated_at, request_id)` DESC). 단 그 사이 행의 `updated_at` 이 바뀌면 행이 페이지 사이로 이동할 수 있다(키셋 페이징 공통 성질).

### `getInboxCounts` (권한 축 `'SELF'`, 기존) — 카운트 resolver

요청 payload: `{ tab, filters }` — `listInbox` 와 **같은 `filters`** 를 그대로 보내면 된다(`limit`·`cursor` 무시).

응답:
```js
{ success: true, statusCounts: { PENDING?: n, APPROVED?: n, REJECTED?: n, ... }, myTurnCount: n, incomplete: boolean }
```
- `statusCounts`: 선택 탭 + 필터(**targetKinds 포함**, 프로젝트·q 등 포함, 상태 선택 필터 `status/statuses/viewStatus` 는 제외)로 센 상태별 수.
- `myTurnCount`: **필터 없이** '내 차례' 전체 수(전역 배지). 종류 칩을 골라도 줄지 않는다 — 기존 프로젝트·q 필터와 같은 규칙.
- `tab: 'history'` 는 세지 않는다 → `statusCounts: {}`(기존).
- `targetKinds: []` → `statusCounts: {}`(조회 없음), `myTurnCount` 는 그대로 센다.
- `incomplete: true` = 예산(10회·20페이지·8초) 소진 또는 권한 판정 실패 → 하한값.
- 잘못된 targetKinds 는 `listInbox` 와 같이 `INVALID_TARGET` 실패.

## 3. limit 정규화 (`normalizeInboxLimit`)

허용값 `{20, 50, 100}` 중 **가장 가까운 값, 같은 거리면 작은 쪽**. 없음·빈 문자열·숫자 아님·0 이하 → 기본 **20**.

| 입력 | 적용 | 입력 | 적용 |
|---|---|---|---|
| 생략/null/''/'abc'/0/-5 | 20 | 36 | 50 |
| 1, 20, 25 | 20 | 50, '50', 74 | 50 |
| 35 (동률) | 20 | 76, 100, 1000 | 100 |

- 엑셀 내보내기(`exportInboxExcel.js`, `PAGE = 100`)는 100 그대로 → 커서로 끝까지 도는 기존 동작 유지.
- 현재 화면 `InboxPage.jsx` 의 `LIMIT = 50` → 50 그대로(프론트 수정 전에도 깨지지 않음).
- 이전 기본값 25 → 이제 20.

## 4. targetKinds 계약

- 허용값 = 서버 `TargetKind`(`src/domain/approval/constants.js`):
  `ISSUE`(이슈 결재) · `TIMESHEET`(타임시트 승인) · `ISSUE_TRANSITION`(상태 변경 승인) · `FIELD_CHANGE`(필드 변경 승인) · `WORKLOG_CREATE`(워크로그 사전 승인) · `WORKLOG_CERTIFICATION`(워크로그 인증/건별 승인)
- 의미:
  | 값 | 동작 |
  |---|---|
  | 생략 / `null` | **조건 없음 = 전체 종류** |
  | `[]` (빈 배열) | **결과 없음** (fail-open 금지) — SQL 없이 `{items:[],nextCursor:null,hasMore:false,limit}` |
  | `['TIMESHEET', ...]` | 중복 제거 후 `target_kind IN (...)` — **모든 탭**(myturn·waiting·requested·done·cc·history) |
  | 모르는 값 포함, 배열이 아님(문자열 등), 7개 이상 | `INVALID_TARGET` 실패(fail-close, 조건을 빼지 않음) |
- 프론트 권고: "전체" 칩 = `targetKinds` 를 **보내지 않는다**(빈 배열을 보내면 빈 결과).
- 종류 필터가 SQL 이라 권한 필터만 줄이는 요인이 되어, 페이지가 종류 기준으로 limit 개 찬다.

## 5. 탭별 동작 · 다회 스캔 창

| 탭 | SQL 조건 | 행위자 |
|---|---|---|
| myturn | role=APPROVER, my_turn=1, is_open=1 | 나 + 위임자 |
| waiting | role=APPROVER, my_turn=0, is_open=1 | 나 + 위임자 |
| requested | role=REQUESTER | 나 + 위임자 |
| done | role=APPROVER, (my_decided=1 OR acted_by_me=1) | 나 + 위임자 |
| cc | role=CC | 나 + 위임자 |
| history | 처리 결재 ∪ 종료된 내 요청(role·기간 필터) | 나만, 같은 요청 두 역할 행은 한 줄 |

모든 탭 공통: `filters`(targetKinds 포함) SQL → 행별 대상 어댑터 가시성 재판정(불변식 7, 실패 = 숨김) → 보강.

창 크기(`window`) = `min(max(ceil(limit*1.5), limit+10), 200)` 에서 시작해 보일 행이 limit 에 못 미치면 2배(상한 200), 최대 4회(`MAX_PASSES`).

| limit | 창 순서(최악) | 최대 SELECT·권한 판정 | 최대 스캔 행 |
|---|---|---|---|
| 20 | 30→60→120→200 | 4·4 | 410 |
| 50 | 75→150→200→200 | 4·4 | 625 |
| 100 | 150→200→200→200 | 4·4 | 750 |

- **판단: MAX_WINDOW 200·MAX_PASSES 4 유지.** limit 100 은 첫 창부터 150행이라 가시율 ≥ 약 13%(100/750)면 한 페이지가 꽉 찬다. 업무함 행은 본인이 결재자·요청자·참조인 요청이라 가시율이 대체로 높다(테스트: 가시율 50% 에서 100건이 2회 SELECT 로 정확히 참). 200 은 Repository `page` 의 LIMIT 상한과 같아 올리려면 Repository 도 바꿔야 하고, 권한 판정(Jira 일괄 호출) 한 번의 크기도 커진다 — 조정하지 않았다.
- **변경: 창보다 적게 오면 끝(reachedEnd)으로 보고 바로 멈춘다.** 이전에는 마지막 페이지에서 빈 결과를 확인하려고 SELECT·권한 판정을 한 번 더 했다(행이 적은 사용자일수록 매 호출 +1 쿼리). 이제 마지막 페이지는 `hasMore: false`·`nextCursor: null` 을 한 번의 조회로 돌려준다. 유휴 SQL 은 여전히 0(화면을 열 때만 발생).
- 인덱스 변경 없음. 기존 `approval_inbox` 정렬·actor 조건 그대로이며 `target_kind IN` 은 같은 범위 스캔에 걸리는 추가 조건이다. 종류 필터가 매우 선택적인 대용량 사용자에서 느리다면 `(actor_key, role, target_kind, updated_at, request_id)` 류 인덱스를 검토할 수 있으나 **이번에는 보고만**(실측 근거 없음).

## 6. 테스트 결과

- `npx jest src/resolver/inbox src/resolver/timesheet/__test__/TimesheetIntegration.test.js` → 82 passed
- 루트 `npx jest` 전체 → **Test Suites 201 passed, Tests 3032 passed**
- 추가 고정 항목: limit 정규화 17케이스, limit 100 창 순서 `[150,200,200,200]`·쿼리 4회 상한, limit 100 가시율 50% 에서 두 페이지 정확히 100건·중복/누락 없음·마지막 `hasMore:false`, 6개 탭 전부 targetKinds SQL 전달(중복 제거), 빈 배열 = 조회 없음, 모르는 값·문자열 = INVALID_TARGET, `getInboxCounts` 가 같은 targetKinds 로 상태별 수·`myTurnCount` 는 필터 없음.

## 7. 미검증

- 없음(플랫폼 동작 의존 없음, 순수 서비스 로직 변경). 배포 후 실측 포인트: limit 100 화면에서 응답 시간(권한 판정 1회 150행).

## 8. 발견 (범위 밖, 고치지 않음)

1. **history 탭 페이지 경계 중복**: 같은 요청의 APPROVER 행과 REQUESTER 행이 서로 다른 페이지에 걸리면(정렬 키 `updated_at` 이 달라) 두 페이지에 한 줄씩 보일 수 있다. 중복 제거가 한 호출 안에서만 이뤄진다. 또한 같은 페이지에서 중복이 제거되면 그 페이지가 limit 보다 적게 찰 수 있다(`hasMore` 는 정확).
2. `getInboxCounts` 의 `myTurnCount` 는 종류·프로젝트 필터와 무관한 전역 값이다 — 프론트가 '내 차례' 탭 옆 수를 필터 결과로 오해하지 않게 표시 위치를 정해야 한다(의도된 기존 규칙).
