# 업무함(결재함) 표 페이징 (2026-10-22)

사용자: "결재함 테이블 페이징 설정 좀 해줘, 프론트 백 둘 다".

## 현재
- `listInbox`(SELF) — 커서 기반, `limit` 기본 25·상한 100, SQL 창을 넓혀 가며 이슈 열람 권한으로 거른 뒤(불변식 7) `{items,nextCursor,hasMore}`.
- 화면 `features/inbox/InboxPage.jsx` 는 `useInfiniteQuery` + 표 아래 "더 보기"로 계속 붙인다. 종류(kind) 칩은 클라이언트 필터라 페이지에 해당 종류가 없으면 빈 상태 + "더 보기" 안내가 뜬다.

## 요구
1. **페이지 단위 보기**: 표 아래 페이지 바 — 이전/다음, 현재 페이지 번호(1, 2, 3…, 가 본 페이지까지는 번호로 바로 이동), 페이지 크기 선택(20·50·100, 기본 20). 페이지를 바꾸면 표가 그 페이지로 **교체**된다(붙이지 않음). 탭·필터·종류·페이지 크기가 바뀌면 1페이지로.
   - 권한 필터가 SQL 뒤에 있으므로 정확한 전체 건수·마지막 페이지 번호는 없다 — 총 페이지 수를 지어내지 않는다. 다음 페이지 유무는 `hasMore`. 탭 카운트(`countInbox` 류의 힌트)는 기존처럼 따로.
   - 프론트는 페이지별 시작 커서 스택을 갖는다(1페이지 = null). URL 에 page·size 를 둘지 판단(기존 `inboxUrl.js` 규약 따름, 커서는 URL 에 넣지 않는다 — 새로고침 시 1페이지로 돌아가도 됨).
   - 일괄 선택(`bulkSelection`)은 현재 페이지 기준으로 — 페이지를 넘기면 선택 해제하거나 범위를 명확히.
2. **백엔드**:
   - `limit` 은 허용값 {20,50,100}(그 외는 가까운 허용값 또는 기본 20)으로 정규화, 기본 25 → 20.
   - **종류 필터를 서버로**: 모든 탭에서 `filters.targetKinds`(종류 칩)를 SQL 조건으로 받아 페이지가 종류 기준으로 정확히 차게 한다(지금은 '내 이력'만 서버 필터). 값은 서버 TargetKind 허용 목록으로 검증, 모르는 값은 무시 또는 빈 결과(fail-close). 카운트 resolver 가 같은 필터를 받는지도 맞춘다.
   - 페이지가 정확히 limit 개 차도록 기존 다회 스캔(MAX_PASSES·MAX_WINDOW) 유지, limit 100 일 때 창 상한이 충분한지 확인(MAX_WINDOW 200, 필요하면 조정하되 유휴 SQL 예산·쿼리 수 테스트 유지).
   - 응답 shape 은 `{items,nextCursor,hasMore}` 그대로(+ 실제 적용된 `limit` 을 돌려줘도 됨). 엑셀 내보내기(`exportInboxExcel.js`)는 커서로 전체를 도는 기존 동작 유지.
3. 승인 관리(`listAllApprovals`)는 이번 범위 밖.

## 완료 기준
- BE `npx jest`(루트) 전체, UI `static/ui` 에서 `npx jest` 전체, `npm run build`, 루트 `npm run check:bundle`. 로케일 바꾸면 `npm run merge`.
- `02_backend_report.md`(실제 shape·필터 계약), `02_frontend_report.md`.
