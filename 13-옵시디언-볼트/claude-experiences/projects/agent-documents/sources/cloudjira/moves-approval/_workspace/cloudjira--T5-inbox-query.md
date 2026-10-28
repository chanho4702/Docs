# T5 — 업무함 조회 (키셋 페이징 + 2단 권한 필터)

## 배경

Confluence DC 승인 앱의 Forge(Cloud) 이식 프로젝트다.

**DC의 가장 큰 성능 부채가 여기 있다.** DC의 `/mine`·`/requested`가 실제로 발행하는 SQL은
`APR_APV.ACTOR_KEY = ?` **하나뿐**이고, 상태 필터·제목 검색·스페이스·요청자·기간·마감·내 차례·
정렬·페이징이 **전부 Java 힙에서** 일어난다. 해당 사용자가 결재자인 모든 요청을 이벤트·승인자까지
전부 하이드레이션한다.

Cloud에서 그대로 하면 25초 resolver 예산과 5MB 응답 벽에 즉시 부딪힌다.
그래서 필터·정렬·페이징 컬럼을 한 행에 모은 **투영 테이블 `approval_inbox`**를 두고 SQL로 내린다.

**반드시 먼저 읽을 것**:
- 저장소 루트 `CLAUDE.md`(불변식 8: 가드 통과 ≠ 데이터 범위 확정), `AGENTS.md`
- `src/rdb/query/QueryBuilder.js` — **이 저장소에서 새로 만든 것.** 값을 바인드 파라미터로 넘기고
  빈 배열 IN을 `1 = 0`으로 바꾼다(fail-open 차단). 워크포스 버전과 다르니 그쪽을 참고하지 말 것.
- `src/permission/ConfluencePermission.js` — `filterVisiblePages` (실측 검증 완료)
- `src/rdb/schema/ddl/approvalInbox.sql.js` — 테이블·인덱스 (T1 산출물)

## 건드릴 파일 (이 목록 밖의 파일은 수정하지 말 것)

```
src/resolver/inbox/InboxRepository.js            (신규)
src/resolver/inbox/InboxService.js               (신규)
src/resolver/inbox/InboxController.js            (신규)
src/resolver/inbox/__test__/InboxRepository.test.js  (신규)
src/resolver/inbox/__test__/InboxService.test.js     (신규)
src/permission/PermissionMap.js                  (항목 추가만)
src/index.js                                     (CONTROLLER_REGISTRARS 에 추가만)
```

## 세 조건을 각각 어디로 내리는가

| 조건 | 어디서 |
|---|---|
| 상태·스페이스·요청자·flow·기간·마감 | **SQL** (inbox 행에 미러돼 있다) |
| 제목 검색 `q` | **SQL** — `title_norm LIKE CONCAT('%', ?, '%')` |
| 정렬 `updated_at DESC` | **SQL** (인덱스 순서 그대로) |
| `myTurn` | **SQL** — `my_turn = 1` (비정규화돼 있다) |
| `myDecided` | **SQL** — `my_decided = 1 OR acted_by_me = 1` |
| **페이지 VIEW 권한** | **SQL 밖** — 2단 필터(아래) |

## 2단 권한 필터

```
[1] 스페이스 1차 필터 (SQL 안)
    asUser 로 볼 수 있는 spaceKey 집합을 구해 whereIn(space_key, visible)
    ⚠ 빈 배열이면 QueryBuilder 가 1=0 을 넣어 아무것도 반환하지 않는다.
      **절대 조건을 생략하지 말 것** — 볼 수 있는 스페이스가 0개인 사용자에게
      전사 결재가 노출되는 권한 사고로 직결된다.
    ⚠ 스페이스가 보여도 페이지 단위 제한이 있을 수 있어 [2]를 대체하지 못한다.

[2] 페이지 2차 필터 (SQL 밖)
    윈도우 N건의 page_id 를 filterVisiblePages() 에 넘긴다.
    응답에 없는 id = VIEW 불가 → 제거.
    부수 효과: title/spaceId/version 을 함께 받으므로 값이 다르면
      UPDATE approval_inbox SET title_norm=?, space_key=? WHERE request_id=?
    로 비정규화 스냅샷을 갱신한다 — 페이지 rename 후 검색 불일치가 이 경로에서 저절로 수렴한다.
```

## 페이징 — 키셋 커서 (OFFSET 아님)

권한 필터가 SQL 밖인 이상 **OFFSET 은 원리적으로 정합하지 않다.**
2페이지의 offset 이 1페이지에서 버린 만큼 어긋나 항목이 중복/누락된다.

```sql
... AND (updated_at < :cUpdatedAt
         OR (updated_at = :cUpdatedAt AND request_id < :cRequestId))
ORDER BY updated_at DESC, request_id DESC
LIMIT :window
```
tie-break(`request_id`)가 없으면 같은 밀리초 행이 커서 경계에서 유실된다.

커서는 불투명 문자열로 인코딩해 내보낸다(base64url of `{u, r}`). 클라이언트가 파싱하지 못하게 한다.

### 적응형 over-fetch 루프 (25초 예산 안)

```
window = max(limit * 1.5, limit + 10), 상한 200
survivors = []
for pass in 1..4:                       # 상한 4회
    rows = await repo.page(cursor, window)
    if (!rows.length) break
    survivors.push(...await permissionFilter(rows))   # 벌크 1콜
    cursor = keyOf(rows[rows.length - 1])
    if (survivors.length >= limit) break
    window = min(window * 2, 200)
return { items: survivors.slice(0, limit), nextCursor, hasMore }
```
4회·200 상한의 근거: 5초 SELECT × 4 + 벌크 API 4콜 ≈ 최악 12초로 25초 예산의 절반.

## 카운트 — 세 층위를 **다른 이름으로** 내려보낸다

| 필드 | 계산 | 성격 |
|---|---|---|
| `statusCounts` | `SELECT status, COUNT(*) ... GROUP BY status` 한 문장 | **권한 필터 이전**. 상태 칩용 |
| `myTurnCount` | `COUNT(*) WHERE actor_key=? AND my_turn=1 AND is_open=1` | 권한 필터 이전. 배지용 |
| `hasMore` | 커서 루프 결과 | 권한 필터 이후. 정확 |
| ~~`total`~~ | **제공하지 않는다** | — |

**`total`을 만들지 않는 이유**: 정확한 총계는 전체 후보의 권한을 다 확인해야 나오므로 불가능하다.
부정확한 숫자를 `total`이라는 이름으로 주면 "총 12건인데 8건만 보인다"는 신뢰 붕괴가 난다.

## resolver

```
listInbox({ tab, filters, cursor, limit })   // tab: myturn|waiting|requested|done
getInboxCounts({ tab, filters })             // 목록과 분리 — count 가 느릴 때 목록까지 25초에 물리지 않게
```
`PermissionMap`에는 **`'SELF'`**로 등록한다. 업무함은 본인 것만 보므로 페이지 권한 메타가 아니라
서비스가 `principal.accountId`로 범위를 좁힐 책임이다. **`payload`의 actorKey를 신뢰하지 말 것** —
반드시 `req.principal.accountId`를 쓴다.

### 탭 → 조건

| 탭 | 조건 |
|---|---|
| `myturn` | `role='APPROVER' AND my_turn=1 AND is_open=1` |
| `waiting` | `role='APPROVER' AND is_open=1 AND my_turn=0` |
| `requested` | `role='REQUESTER'` |
| `done` | `role='APPROVER' AND (my_decided=1 OR acted_by_me=1)` |

## 테스트

`InboxRepository.test.js` — `CommonQuery`를 목으로:
1. 발행된 SQL에 `ORDER BY updated_at DESC, request_id DESC`가 있다
2. 커서가 있으면 `(updated_at < ? OR (updated_at = ? AND request_id < ?))`가 들어간다
3. `OFFSET`을 쓰지 않는다
4. **`spaceKeys`가 빈 배열이면 `1 = 0`이 들어간다** (fail-open 회귀 방지)
5. 제목 검색어의 `%`·`_`가 이스케이프된다
6. 탭별 조건이 위 표와 일치한다

`InboxService.test.js` — `filterVisiblePages`와 Repository를 목으로:
7. 권한 필터가 제거한 만큼 **추가 페이지를 더 가져온다**(over-fetch 루프)
8. 루프가 **4회를 넘지 않는다**
9. `limit`만큼 모이면 즉시 멈춘다
10. 응답에 `total` 필드가 **없다**
11. `payload.actorKey`를 넣어도 **무시하고** `principal.accountId`를 쓴다 (권한 회귀 방지)
12. 페이지 제목이 바뀌었으면 `UPDATE approval_inbox ... title_norm` 이 발행된다

## 완료 기준

- `npx jest --runInBand` 전부 통과
- 계약 테스트(`test/permission/permissionMap.contract.test.js`)가 계속 통과할 것
  (= PermissionMap 등록과 CONTROLLER_REGISTRARS 추가를 빠뜨리지 않았을 것)
