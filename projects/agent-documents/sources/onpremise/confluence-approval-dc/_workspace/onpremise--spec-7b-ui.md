# 스펙 7b — 업무함 서버 연동 · 스페이스 필터 부활 · 행 단위 회수 · 409 동선

설계: `_workspace/design-batch7.md` D8·D9 + `_workspace/design-batch6.md` §B-6(행 회수 — 코드 시안 포함)·§F.
전제(7a 완료, 트리에 있음): `/mine`·`/mine/requested`가 `{"items":[…],"total":N,"statusCounts":{…},"facets":{…}}`를 반환하고
`limit`/`offset`/`status`(CSV)/`q`/`spaceKey`/`requesterKey`/`flowId`/`createdFrom`/`createdTo`(ISO Instant)/`due`/`myTurn=1`/`myDecided=1`를 받는다.
`statusCounts` 키: 상태 5종 + `myTurn`, `dueSoon`, `dueOver`. `facets`: `requesters[{key,name}]`, `flows[{id,name}]`, `spaces[{key,name}]`.
items의 requestObject에는 `spaceKey`/`spaceName`(페이지·스페이스 없으면 키 자체 생략)이 추가되어 있다.
정확한 형태는 구현을 직접 읽어 확인하라: `approval-confluence9/.../rest/ApprovalRestResource.java`의 mine()/requestedByMe()/pagedResponse 부근.

## 반복 실수 금지 (위반 = 즉시 FAIL)
1. 파일 재포매팅 금지 — 손대는 줄만.
2. 검증 게이트 우회·기존 테스트 의미 변경 금지.
3. 원시 제어 문자 금지.
4. **Java text block 이스케이프**: `\d` → `\\d`, `\(` → `\\(` (ApprovalInboxServlet은 거대한 text block 템플릿이다).
5. 서블릿 템플릿: `__TOKEN__` 정규식 치환 유지, `String.format` 금지(CSS % 충돌), 인라인 JS는 DOM 조립만(`el()`+textContent, innerHTML 금지), 컨텍스트 패스는 `__CONTEXT_PATH__`.
6. C10 수정 금지(컴파일 유지). `clean`/`package`/`install` 금지 (dev 인스턴스 실행 중).
7. git 커밋 금지.

## 검증 게이트
```
set JAVA_HOME=C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot
C:\Onpremise\.toolchains\apache-maven-3.9.16\bin\mvn.cmd -pl approval-confluence9 -am test
C:\Onpremise\.toolchains\apache-maven-3.9.16\bin\mvn.cmd -pl approval-confluence10 compile
```

## 변경 1 — 업무함 서버 연동 (`servlet/ApprovalInboxServlet.java` 인라인 JS)

현행: `/mine` 전건 fetch → `all` 배열 → `matches()` 클라이언트 필터 → `slice(0, state.limit)`.
전환: **필터·페이징 전부 서버로.** `state`와 `f_*` URL 스키마는 유지한다.

1. **fetch 파라미터 조립기**: `state`(q/status[]/space/requester/flow/from/to/due/myturn)와 현재 뷰를 REST 파라미터로 변환.
   - 뷰 매핑: 현행 `TABS`의 클라이언트 술어를 읽고 **의미가 동일한** 서버 파라미터 조합으로 옮겨라 (내 차례 → `myTurn=1`(+필요시 status), 진행 중 → `status=PENDING`, 처리한 건 → 현행 술어가 "내가 결정함"이면 `myDecided=1`, 상태 집합이면 해당 status CSV. **추측하지 말고 현행 코드의 술어와 1:1 대응시켜라**). 내 요청 탭은 `/mine/requested` + 동일 파라미터.
   - `from`/`to`(로컬 `yyyy-MM-dd`)는 fetch 시점에 **뷰어 로컬 자정 → ISO Instant** 변환: from = `new Date(y, m-1, d).toISOString()`, to = 다음날 로컬 자정 toISOString() (서버가 `from ≤ t < to` exclusive).
   - `limit=PAGE(50)`, `offset` 상태 추가.
2. **응답 처리**: `{items,total,statusCounts,facets}` — `all`/`requested` 전건 배열 모델 제거. 현재 페이지 행 배열 + total 유지. **경쟁 응답 가드**: 요청 시퀀스 번호를 두고 마지막 요청의 응답만 반영(빠른 타이핑·연속 필터 변경 시 낡은 응답이 새 응답을 덮지 않게).
3. **더 보기**: `offset += PAGE` 재요청 → 기존 행 뒤에 append. 남은 건수·카운트는 `total` 기반. 필터/탭/검색 변경 시 `offset=0` 리셋 후 교체 렌더. "더 보기" 버튼은 `로드된 행 수 < total`일 때만. 포커스 이동(새 첫 행) 규칙 유지.
4. **칩 레일**: 건수를 `statusCounts`로 — 조건부 칩(회수·마감 임박·기한 지남: >0일 때만) 규칙 유지. 칩 클릭 → 필터 적용 → 재fetch.
5. **필터 드롭다운 옵션**: 요청자/Flow를 `facets.requesters`/`facets.flows`로 (기존 `all` 전건 distinct 추출 제거).
6. **스페이스 필터 부활**: 필터 바에 `f-space` select 추가(`facets.spaces`, "전체 스페이스" 기본), `state.space` 강제 `""` 제거, URL `f_space` 왕복(쓰기·읽기 화이트리스트에 이미 있는 키 재활성화), 서버 `spaceKey` 파라미터로 전달. 행에 스페이스명 표시가 자연스러운 위치가 있으면(대상 셀 보조 줄 등) `r.spaceName`을 title 속성 정도로만 — 새 열 추가 금지(colSpan 7 유지).
7. **디바운스**: 검색 입력 200ms 디바운스 유지(이제 서버 호출을 디바운스).
8. **알림 뷰·상세 확장(detail/타임라인)은 행 데이터 구조가 같으므로 그대로** — items의 필드가 기존과 동일함을 확인하고, 달라진 게 있으면 최소 수정.
9. 탭 배지(사이드바 건수)는 현행 의미 유지 — `statusCounts`/`total`에서 파생 가능한 것만 갱신, 불가능하면 현행 로직 유지.

## 변경 2 — 행 단위 회수 (`ApprovalInboxServlet.java`)

`design-batch6.md` §B-6의 코드 시안을 그대로 구현:
- 서블릿 루트 `data-admin="__IS_ADMIN__"` + `values.put("IS_ADMIN", admin ? "1" : "0")` + TOKEN 정규식에 IS_ADMIN 추가.
- '내 요청' 뷰(`currentView === "requested"`)의 PENDING 행에 "회수" 버튼(`ghost ghost--danger`) → `openCancelForm(tr, r, open)` — 상세 행을 열고 그 셀 최상단에 인라인 폼(경고 문구 + 사유 textarea(200자) + 돌아가기/회수 확정 + message). 확정 → `POST {base}/{id}/cancel?actorKey=...&reason=...` → 성공 시 `location.reload()`(필터는 URL로 복원).
- §B-6의 CSS(.cancel-form 등)는 design-batch6 §B-9 하단 블록 참조 — **이미 들어간 규칙이 있는지 grep으로 확인 후 없는 것만 추가**.

## 변경 3 — 409 동선 개선 (`resources/js/approval.js`)

현행 제출 핸들러의 409 분기: 메시지 직후 즉시 `window.location.reload()` → 문구를 못 읽고 입력 소실.
- 자동 reload **제거**. 대신 footer 메시지(`showMessage`)에 사유를 띄우고, 메시지 영역 옆(또는 뒤)에 **"새로고침" 버튼**을 동적으로 추가(클릭 시 `window.location.reload()`). 모달은 열린 채 유지 — 승인자·메모 입력 보존.
- 영역 해시 409("영역이 변경…")와 중복 요청 409("이미 진행 중…") 두 경우 모두 동일 패턴. 서버 문구 부분일치 판별은 유지하되 서버 문구와의 결합을 주석으로 명시.
- "새로고침" 버튼은 재제출마다 중복 추가되지 않게 가드. 스타일은 기존 `aui-button` 재사용(새 색 금지).

## 변경 4 — 반려 사유 인라인 스텝 (사용자 지시 2026-08-12: "반려 메세지 이거 모달안에서 처리")

현행: 반려 시 `window.prompt`로 사유를 받는다 (배치 6 설계 §B-3에서 부채로 지목된 부분). 회수 확인 스텝과 같은 **모달 내 인라인 스텝**으로 교체한다.

대상: `macro/ApprovalMarkup.java`(상세 모달 마크업) + `resources/js/approval.js` (+ `resources/css/approval.css` 필요분).

1. **마크업** (`detailDialog`): 기존 회수 확인 스텝(`.dmove-approval-confirm`)과 같은 구조로 반려 스텝 추가 — `myTurn`일 때만 렌더:
   - 리드 문구: "이 요청을 반려합니다. 반려 즉시 요청이 종료됩니다."
   - `textarea[name="rejectReason"]` (rows 2, maxlength 500, placeholder "요청자에게 남길 사유"). 라벨: "반려 사유" + 보조 라벨은 설정에 따라 "필수" 또는 "선택".
   - 버튼: "돌아가기"(`data-approval-reject-abort`) / "반려 확정"(`data-approval-reject-confirm`, `.dmove-approval-danger`).
   - 여는 버튼: 기존 footer "반려" 버튼을 `data-approval-reject-open` + `aria-expanded`로 전환(즉시 POST 제거).
   - 회수 스텝과 반려 스텝이 같은 모달에 공존할 수 있다 — 클래스에 modifier를 주고(`.dmove-approval-confirm--reject` 등) **한 번에 하나만 열리게** JS에서 상호 배타 처리.
2. **필수 여부**: 전역 설정 `rejectReasonRequired`(승인 설정의 "반려 사유 필수")를 상세 모달 렌더 시점에 알 수 있으면(패널/매크로가 ApprovalSettings를 이미 읽는다) 컨테이너/스텝에 `data-approval-reject-required="1"`로 노출하고, 클라이언트에서 빈 사유 제출 시 스텝 안 메시지로 "반려 사유를 입력하세요." 표시(POST 안 함). 서버 400 응답도 같은 위치에 표시(서버가 최종 판정 — 클라이언트 검증은 편의).
3. **JS**: 회수 스텝 핸들러(`data-approval-cancel-*`)와 같은 패턴으로 open/abort/confirm 3분기 추가. confirm은 기존 반려 POST 경로(decision 엔드포인트)를 그대로 사용하되 `reason`을 textarea에서. ESC 우선순위(열린 스텝 먼저 닫기)와 `closeModal` 초기화 규칙에 반려 스텝도 포함. `window.prompt` 호출은 **제거**.
4. **업무함**: 업무함 상세 확장의 반려 동선도 `prompt`를 쓰고 있으면 같은 인라인 폼 패턴(변경 2의 `.cancel-form` 구조 재사용, 라벨만 반려)으로 교체. prompt를 안 쓰면 손대지 않는다.
5. 승인(APPROVED)은 사유가 없으므로 현행 즉시 POST 유지.

## 테스트
- `ApprovalInboxServletRenderTest`(기존 8건)가 템플릿 마크업을 검증한다면 새 마크업(IS_ADMIN 토큰, f-space 컨트롤)에 맞게 **의미를 유지하며** 갱신, 필요시 신규 케이스 추가(예: IS_ADMIN 토큰 치환, f_space 파싱 화이트리스트).
- 서버 파라미터 조립·응답 반영은 인라인 JS라 단위 테스트 불가 — 서블릿 템플릿에 노출되는 정적 문자열 수준에서 검증 가능한 것만.

## 완료 보고
- 변경 파일 + 각 1줄 요약, 게이트 출력 요약(테스트 수), 스펙 이탈 사유.
