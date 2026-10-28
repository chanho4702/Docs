# 배치 7 설계 — 성능·기반 (서버 페이징·N+1 해소·스페이스 필터·규칙 명문화)

작성: 오케스트레이터 / 2026-08-12
대상 모듈: `approval-domain`(인터페이스 default 추가만), `approval-confluence9`
선행: `design-batch6.md` §B-6(행 회수)·§F(필터)·§G(서버 페이징 계약)
근거 실측: Explore 2026-08-12 (아래 줄 번호는 그 시점 기준)

## 0. 실측 요약 (왜 이 배치가 필요한가)

| # | 문제 | 실측 |
|---|------|------|
| P1 | `/mine` N+1 | `findByApproverKey`가 APV 행마다 `find(UUID)` → 요청 N건에 **3N+1 쿼리** + O(N²) dedupe. `/mine/requested`·`findByPageId`도 동일 패턴 |
| P2 | 직렬화 N+1 | `requestObject`가 요청마다 `findApproverViaGroups` 1쿼리. 목록 1회에 **Flow 테이블 전건 로드**. 단건 응답도 같은 비용 |
| P3 | 페이징 없음 | `/mine` 전건 반환, 업무함이 전량 받아 클라이언트 필터·slice |
| P4 | 알림 풀스캔 | `markReadForRecipient`가 **where 없는 전 테이블 스캔**. `RECIPIENT_KEY`/`EVENT_ID`/`REQUEST_ID`가 `@StringLength(UNLIMITED)`(CLOB)라 인덱스 불가. 알림 REST는 알림 1건당 aggregate 재로딩(3쿼리)+getPage 2회 |
| P5 | 렌더 이중 로드 | 패널이 렌더당 `findByPageId` 2회(latest+history), 매크로는 매크로당 3+(1+3M) |
| P6 | 규칙 공백 | `fromRequestId`+`approverKeys` 동시 전달 시 approverKeys가 **조용히 무시**되고 이전 결재선 복원 (steps/flowId는 명시 지정이 이기는데 approverKeys만 예외) |
| P7 | 스페이스 필터 부재 | REST가 spaceKey를 안 내려줘 업무함 스페이스 필터가 죽어 있음(state.space 강제 "") |
| P8 | 409 UX | 영역 해시 409 시 메시지 직후 즉시 `location.reload()` → 문구를 못 읽고 입력 소실 |

## 1. 핵심 설계 결정

### D1. 배치 하이드레이션 — 저장소 계층에서 3쿼리 고정
`findByApproverKey`/`findByRequesterKey`/`findByPageId` 전부 다음 형태로 통일:
1. 후보 REQUEST_ID 수집 (APV by ACTOR_KEY 1쿼리 / REQ by REQUESTER_KEY 1쿼리 / REQ by PAGE_ID 1쿼리)
2. `REQ WHERE REQUEST_ID IN (...)` 1쿼리, `APV WHERE REQUEST_ID IN (...)` 1쿼리, `EVT WHERE REQUEST_ID IN (...)` 1쿼리 → requestId별로 그룹핑해 `toRequest` 조립.
- dedupe는 `LinkedHashSet`/Map (O(N²) 선형 탐색 제거).
- IN 절은 **500개 단위 청크**(DB in-list 상한 방어. Oracle 1000 제한이 대표적).
- **도메인 `ApprovalRequestRepository` 인터페이스에 새 메서드를 추가할 경우 반드시 `default` 구현**(기존 메서드 조합으로)을 붙인다 — C10 어댑터가 같은 인터페이스를 구현하므로 abstract 추가는 C10 컴파일 파손(배치 6 교차 검토에서 실증된 유형).

### D2. 서버 페이징·필터 — "메모리 필터 + 슬라이스 직렬화" 모델
`GET /approvals/mine`·`/mine/requested` 공통 계약 (§G 그대로):
```
?actorKey=&limit=50&offset=0&status=PENDING,APPROVED&q=&spaceKey=&requesterKey=&flowId=
 &createdFrom=YYYY-MM-DD&createdTo=YYYY-MM-DD&due=soon|over|none&myTurn=1
→ {"items":[…], "total": 173, "facets": {…}}
```
- **필터·정렬·total은 서버 메모리에서** 계산한다. 근거: (a) `q`는 pageTitle 검색인데 제목은 DB가 아니라 pageManager에 있다 — SQL 필터가 원천 불가. (b) 후보 집합은 "한 사용자의 요청"으로 이미 좁다. (c) 진짜 비용은 쿼리 수(D1로 해소)와 **직렬화**다.
- **직렬화는 슬라이스만**: 필터·정렬 후 `[offset, offset+limit)` 구간만 `requestObject`로 만든다. `canView`(getPage+권한)도 정렬 전 전체에 적용(총건수 정합) — 페이지 객체는 기존 `pages` 캐시로 1페이지 1회.
- `limit` 기본 50, 상한 200(초과는 200으로 클램프), `offset` 음수 400. 파라미터 없는 호출은 `limit=50, offset=0` 기본 적용(구형 무페이징 반환은 유지하지 않는다 — 플러그인 jar 안에서 서블릿 JS와 원자적으로 함께 배포되므로 구형 호환 불필요).
- **응답 형태 변경**: 배열 → `{items, total, facets}` 객체. 업무함 JS는 7b에서 동시 수정.
- 정렬은 현행 유지(`updatedAt` desc).
- `status`는 CSV, enum 화이트리스트 외 값 400. `due`는 soon|over|none 외 400. 날짜는 `yyyy-MM-dd` 정규식, 뷰어 로컬이 아니라 **서버가 받은 문자열 그대로 UTC 자정 기준** 비교가 아닌, 기존 클라이언트 의미(로컬 날짜)와 달라지는 문제가 있다 → **결정: createdFrom/To는 ISO 순간(epoch millis 또는 ISO-8601)으로 받는다.** 클라이언트가 로컬 자정을 Instant로 변환해 보낸다(뷰어 시간대 의미 보존, 서버는 시간대 무지). URL `f_from/f_to`는 사람이 읽는 `yyyy-MM-dd` 그대로 두고 fetch 시점에 변환.
- `myTurn=1`: 기존 `myTurn` 계산(현재 단계에 본인이 미결정 승인자)을 서버에서 판정.
- **events는 목록 items에 유지한다** (§G의 "빼는 안"은 기각). 근거: 슬라이스가 최대 200건이라 페이로드가 제한되고, 빼면 업무함 상세 확장·타임라인이 단건 GET을 추가로 요구해 7b 범위가 커진다. 필요해지면 후속 배치에서 `fields=` 협상으로.

### D3. facets — 필터 드롭다운 옵션의 서버 공급
현재 요청자/Flow 드롭다운 옵션은 클라이언트가 전건에서 distinct 추출한다. 서버 페이징 후에는 첫 페이지만으로 옵션을 만들 수 없으므로, 서버가 **필터 적용 전 후보 집합**(canView 통과분)에서 추출해 내려준다:
```json
"facets": {
  "requesters": [{"key":"...","name":"홍길동"}],
  "flows":      [{"id":"...","name":"기본 결재선"}],
  "spaces":     [{"key":"DS","name":"Demonstration Space"}]
}
```
- 각 목록은 이름 오름차순, 최대 100개(초과분 절단 — 초과 시 검색형 UI는 후속).
- displayName은 기존 `names` 캐시 재사용.

### D4. spaceKey/spaceName — 컬럼 추가 없이 파생
`requestObject`에 `spaceKey`, `spaceName` 추가 — `pages` 캐시의 `AbstractPage.getSpaceKey()`/`getSpace().getName()` (page null이면 둘 다 null). **AO 컬럼은 만들지 않는다.** 근거: 서버 필터가 어차피 메모리 판정(D2)이라 SQL 인덱스가 필요 없고, 스키마 변경(백필·마이그레이션 리스크)을 통째로 회피한다. 스페이스 필터는 파생값 비교로 동작.

### D5. 알림 저장소 — 스키마 교정 + 쿼리화
`ApprovalNotificationEntity`:
- `RECIPIENT_KEY`·`EVENT_ID`·`REQUEST_ID`를 `@StringLength(255)`로 축소(값은 userKey/UUID ≤ 64자 — CLOB은 과설계) + `RECIPIENT_KEY`·`REQUEST_ID`에 `@Indexed`. `@Unique`/NOT NULL은 추가하지 않는다(이 저장소의 자동 마이그레이션 안전선: nullable+인덱스까지는 무태스크, unique/not-null은 별도 취급 — progress-2026-08-10-3).
- **마이그레이션 검증이 QA 필수 항목**: 기존 데이터(CLOB에 값 존재)가 있는 H2 홈에서 플러그인 재설치 시 오류 없이 열리는지. 실패하면 이 항목만 롤백하고 "신규 컬럼 + 이중 읽기" 대안으로 전환한다(스펙에 명시).
- `markReadForRecipient`: `WHERE RECIPIENT_KEY = ? AND READ_AT IS NULL` + ids는 `Set`으로.
- `findForRecipient`: WHERE + `Query.order("CREATED_AT DESC")` + `limit(200)` 파라미터화.
- `findPending`: 조건 + order + `Query.limit(batch)` — 전건 로드 후 subList 제거.
- 알림 REST(`notifications`): requestId를 모아 **배치 하이드레이션(D1) 1회**로 대체, `pageTitle`은 기존 pages 캐시, 이벤트 탐색은 하이드레이션된 aggregate에서. 같은 requestId 중복 알림은 캐시 재사용.

### D6. 렌더 이중 로드 제거
- `ApprovalWorkflowService`(domain)에 **`pageSnapshot(long pageId)`** 추가: `findByPageId` 1회 로드로 (만료 sweep 적용 후) 전체 목록을 돌려주는 메서드. `findLatestPageRequest`의 만료 부수효과(expireIfDue 저장) 의미를 그대로 유지한 채 목록을 재사용할 수 있게 한다. 기존 메서드는 유지(내부에서 snapshot 재사용 가능하면 위임).
- `ApprovalPagePanel`: 렌더당 snapshot 1회 → latest·history 모두 그 목록에서 파생 (`findByPageId` 2회 → 1회).
- `ApprovalRegionMacro`: 동일 — 페이지 단위 snapshot에서 해당 region의 latest·history 파생. 매크로가 K개면 각자 1회(페이지 공유 캐시는 렌더 컨텍스트가 없어 이번 범위 밖, 기록만).
- `requestObject`의 `findApproverViaGroups`: 슬라이스 requestId IN 배치 조회로 교체(`findColumn` 패턴의 viaGroup 버전). 단건 경로도 같은 API 사용.
- `requestsJson`의 Flow 전건 로드: 슬라이스에 등장하는 flowId만 IN 조회(또는 flowId 없으면 스킵).
- `findFlowIds/findPrevRequestIds/findRegionHashes` 3중 IN 쿼리: REQ IN 1쿼리로 세 컬럼을 한 번에 읽는 통합 메서드로 교체.

### D7. fromRequestId + approverKeys 규칙 명문화
**규칙: 명시 지정이 항상 이긴다.** `steps`·`flowId`·`approverKeys`·`approverGroups` 중 **하나라도** 오면 그것으로 결재선을 만들고, `fromRequestId`는 `PREV_REQUEST_ID` 계보 연결로만 쓰인다. 복원(restoreSteps/legacy minimum 재사용)은 넷 다 빈 경우에만.
- 현행에서 바뀌는 것: `approverKeys`/`approverGroups`가 조용히 버려지던 것 → 이제 그 값으로 새 결재선 생성.
- 도메인/README/features.md에 규칙 문장 추가, `StepRestorationTest`류 단위 테스트 추가.

### D8. 업무함 서버 연동 (7b)
- `state`/`f_*` 스키마 유지, `matches()` 클라이언트 필터 제거 → **fetch 파라미터 조립기**로 전환. 뷰(내 차례/진행 중/처리한 건)는 status·myTurn 파라미터 조합으로 매핑: 내 차례=`myTurn=1&status=PENDING`, 진행 중=`status=PENDING`, 처리한 건=`status=APPROVED,REJECTED,EXPIRED,CANCELLED`(기존 탭 정의와 동일하게), 내 요청=`/mine/requested`.
- "더 보기" = `offset += limit` 재요청, 응답 `total`로 잔여 계산·카운트 표시. 필터/탭 변경 시 offset 리셋.
- 칩 레일 건수: 서버 total 기반으로 재계산 — 칩별 건수는 **facets가 아니라 status별 total이 필요**하다. 결정: 응답에 `statusCounts`(후보 집합의 status별 건수, myTurn 건수 포함)를 추가한다:
```json
"statusCounts": {"PENDING": 3, "APPROVED": 10, "REJECTED": 1, "EXPIRED": 0, "CANCELLED": 2, "myTurn": 1, "dueSoon": 0, "dueOver": 0}
```
  (칩 레일이 쓰는 조건부 칩 — 회수·마감 임박·기한 지남 — 을 그대로 살리기 위한 최소 집계. 서버는 어차피 후보 전체를 메모리에 들고 있으므로 공짜에 가깝다.)
- 스페이스 필터 컨트롤 부활: `facets.spaces`로 select 구성, `f_space` URL 왕복 복원(강제 "" 제거).
- 요청자/Flow 드롭다운: `facets` 소스로 전환.
- 행 단위 회수: `design-batch6.md` §B-6 설계 그대로(`openCancelForm`, IS_ADMIN 토큰 포함).
- 알림 목록도 서버 limit(200) 적용에 맞춰 문구만 점검(변화 없으면 그대로).

### D9. 409 동선 개선 (7b)
- 영역 해시 409: 즉시 reload 제거. footer 메시지에 사유를 띄우고 **"새로고침" 버튼**(`.dmove-approval-message` 옆 액션)을 제공 — 사용자가 문구를 읽고 스스로 새로고침. 폼 입력(승인자·메모)은 모달이 열린 채 유지된다.
- 중복 요청 409("이미 진행 중")도 동일 패턴: 문구 표시 + 새로고침 버튼, 자동 reload 제거.
- 서버 문구 부분일치(`'영역이 변경'`) 판별은 유지하되 주석으로 서버 문구와의 결합을 명시(서버 문구 바꿀 때 같이).

## 2. 배치 편성 (파일 경계)

| 배치 | 내용 | 파일 |
|------|------|------|
| **7a 백엔드** | D1~D7 | domain: `ApprovalRequestRepository`(default), `ApprovalWorkflowService`(pageSnapshot) / c9: `ActiveObjectsApprovalRequestRepository`, `ApprovalNotificationEntity`, `ActiveObjectsApprovalNotificationStore`, `ApprovalRestResource`, `ApprovalPagePanel`, `ApprovalRegionMacro` + 테스트 |
| **7b UI** | D8~D9 | `ApprovalInboxServlet`, `approval.js` (+ `approval.css` 소폭) |

7a가 REST 응답 형태를 바꾸므로 **7a와 7b 사이에 화면 검증을 하지 않는다** (7a 커밋 시점에 업무함이 일시적으로 깨진 상태 — 커밋 메시지에 명시).

## 3. 지키는 것 (불변)
- REST는 query 파라미터만(body 없음) 관례 유지.
- 이벤트 append-only, 승인자 행 변경분 반영, dedupeKey 불변식 그대로 — 이 배치는 읽기 경로 재편이 본체다.
- 서블릿 text block + `__TOKEN__` 치환, String.format 금지, 인라인 JS는 DOM 조립만.
- `canView` 권한 판정 생략 금지 — 배치 하이드레이션 후에도 요청별 판정은 유지(페이지 캐시로 비용만 절감).
- C10은 수정하지 않는다. 단 **컴파일은 깨지지 않아야** 한다(도메인 인터페이스 default, enum 미변경). `mvn -pl approval-confluence10 compile`이 QA 게이트(jar 패키징 금지 — QuickReload).

## 4. C10 이식 백로그 추가분
- 배치 하이드레이션 저장소, 알림 스키마 교정, 서버 페이징 REST, 업무함 서버 연동, 409 동선.

## 5. 테스트 요구 (QA 게이트)
- 저장소: 배치 하이드레이션 동등성(기존 3N+1 결과와 동일 집합·순서), IN 청크 경계(500±1).
- REST: limit/offset 경계(0, 음수, >200), status 화이트리스트 400, total 정합(필터·canView 반영), facets/statusCounts 정합, fromRequestId×{approverKeys, approverGroups, steps, flowId} 4조합 우선순위.
- 알림: markReadForRecipient가 대상 행만 갱신, findForRecipient limit·정렬.
- 패널/매크로: findByPageId 호출 횟수(계측 가능하면 mock 검증), 렌더 결과 불변.
- 마이그레이션: 기존 알림 데이터가 있는 홈에서 스키마 변경 후 기동(D5 명시 리스크).
