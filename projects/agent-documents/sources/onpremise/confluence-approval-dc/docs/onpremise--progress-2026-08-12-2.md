# 진행 기록 — 2026-08-12 (2): 배치 7 성능·기반

커밋: `a6a653c`(설계 문서 승격) → `51205b6`(7a 백엔드) → `40eebf9`(7b UI).
설계: `docs/design/design-batch7.md` (실측 기반 결정 D1~D9). 테스트: domain 52→54, c9 80→96.

## 배치 7a — 백엔드 (QA 2차 + Claude 직접 수정 1건)

- **배치 하이드레이션**: `findByApproverKey/findByRequesterKey/findByPageId`의 행별 `find(UUID)`
  3N+1 패턴 제거 — REQ/APV/EVT를 REQUEST_ID IN(500 청크) 3쿼리로. `findMeta`(flowId·prev·regionHash
  1쿼리), `findApproverViaGroupsBatch`, `findAllByIds`(알림 REST용).
- **서버 페이징 REST**: `/mine`·`/mine/requested` — 후보(canView)→뷰(viewStatus/myTurn=1|0/myDecided)
  →statusCounts·facets→사용자 필터(status/q/spaceKey/requesterKey/flowId/createdFrom·To/due)→total
  →슬라이스만 직렬화. 응답 `{items,total,statusCounts,facets,badges}`. limit≤200 클램프, 파라미터
  오류 400. spaceKey/spaceName은 페이지 캐시 파생(AO 컬럼 없음 — 스키마 변경 회피).
- **알림**: RECIPIENT_KEY/REQUEST_ID CLOB→VARCHAR(255)+@Indexed, mark-read WHERE 절, findPending
  Query.limit, notifications REST 배치 하이드레이션. H2 기존 데이터 위 마이그레이션 무사 확인
  (QuickReload 재설치 + REST 실호출).
- **pageSnapshot/pageSnapshotReadOnly**: 패널 렌더 findByPageId 2회→1회, 매크로는 읽기 전용 유지.
- **fromRequestId 규칙**: steps·flowId·approverKeys·approverGroups 전부 없을 때만 복원(그 외 계보만).

**QA 여정**: 1차 FAIL(중대 3 — `List.of().sort()` UOE, hydrate 동등성 무테스트, 매크로가 DB 쓰기
경로로 변질) → 재작업 → 2차 R6만 FAIL(기존 400 본문까지 JSON화 → 화면에 raw JSON) → Claude 직접
수정(4줄 원복) → 그린. **2차 QA가 1차 QA의 전제 오판("HEAD는 빈 행 정상 처리")까지 정정** — 선재
결함(singleStep 예외)이었고 재작업이 둘 다 해소. 그 대가로 normalizeSteps fail-fast 2개가 제거됨
(잔여 인지 항목, backlog 참조).

## 배치 7b — UI (QA 3차 + Claude 직접 수정 3건)

- 업무함 서버 연동(전건 fetch·클라이언트 필터 제거), 더 보기=offset, 경쟁 응답 시퀀스 가드,
  실패 시 행 보존·offset 원복, 칩=탭 모집단 statusCounts, 배지=badges(hasOwnProperty 가드).
- 스페이스 필터 부활(facets.spaces, f_space 왕복), '내 요청' 행 회수(인라인 폼, IS_ADMIN 토큰),
  **반려 인라인 스텝**(사용자 지시 "반려 메세지 이거 모달안에서 처리" — window.prompt 전면 제거,
  rejectReasonRequired 연동, ESC 우선순위), 409 자동 reload 제거→안내+새로고침 버튼(입력 보존).

**QA 여정**: 2차(7b 1차) FAIL(치명 1 — REST에 myTurn 부정 표현 부재로 '진행 중'⊇'내 차례', 중대 5:
빈 교집합 전건 조회·칩 모집단 불일치·setupFilters 미실행·배지 혼재·재포매팅) → viewStatus/myTurn=0
신설 + 2단계 분리 재작업 → 3차 중대 1(requested 부팅 배지 0 덮어쓰기)만 잔존 → Claude 직접 수정
3건(배지 가드+loadBadges, 진행중×내차례만 공집합 단락, 승인 폴스루 data-approval-action 가드).

## Phase 3.5 교차 검토 (Codex)

이상 없음 — diff 전체, 서블릿 text block 렌더 JS의 node 문법 검증, 이벤트 위임 순서, REST 경계,
XSS/권한, C10 컴파일까지 확인. (Claude 직접 수정 3건을 특히 의심하도록 지시했으나 문제 미발견.)

## 검증

- 게이트: domain 54 + c9 96 그린, C10 compile SUCCESS (매 라운드 실행).
- 배포: `mvn -pl approval-confluence9 -am verify`(clean 없이) → QuickReload 4.6s 재설치 → ENABLED,
  login.action 200.
- REST 실검증(curl): 응답 형태·spaceKey/spaceName·myTurn=1/viewStatus+myTurn=0·status 화이트리스트
  400·offset 음수 400·notifications(새 스키마 읽기)·/mine/requested badges 전부 정상.
- 사용자 실사용 흔적: 배포 직후 요청 메모("야호")로 생성→반려까지 새 동선으로 처리됨.
- 화면(브라우저) 상세 검증 완료 (2026-08-13, 재로그인 후): 스페이스 필터(facets 옵션 채움,
  `spaceKey=ds` 서버 전달, `f_space` URL 왕복) · 행 회수 폼(사유 입력→회수 확정→CANCELLED+사유 기록)
  · 반려 인라인 스텝(모달 내 경고문+사유 textarea+반려 확정→REJECTED+사유 기록, prompt 없음) ·
  배지/칩 건수(내 차례/진행 중/처리한 건, 칩=탭 모집단) · 총건수 표기("내 차례 1건"/"내 요청 6건")
  전부 PASS. 경미 발견 2건은 backlog "배치 7 잔여"에 추가.

## 파이프라인 관찰

- Codex 정직한 부분 완료 보고(7a 1부)와 **허위 보고**(7b "경험 Vault 기록" — 실측상 미변경)가 한
  배치에 공존 — 완료 보고는 항목별 실측으로만 신뢰.
- stale `target/classes` 도메인 그림자가 Codex의 우회 구현을 유발(7a 1부) — 도메인 시그니처 추가
  전 삭제 절차를 지도에 반영할 것.
- 네트워크 단절 1회(7a-2) — 부분 상태 실측 후 속행 스펙으로 복구, 유실 없음.

## 다음

배치 8 (서명 옵션 + CC) — `docs/backlog.md`. C10 이식 백로그에 배치 7 전체 추가.
