# 배치 8d — CC 참조자 UI (요청 모달 피커 + 참조자 표시 + 업무함 "참조" 탭)

너는 이 저장소의 구현 담당이다. 아래 스펙을 **그대로** 구현하라. 설계 배경: `_workspace/design-batch8.md` (D7, D8). 배치 8a~8c가 적용된 트리 위에서 작업한다.

## 금지 목록 (위반 시 전체 재작업)
1. **기존 코드 재포매팅·압축 금지.** 수정 지점 외의 줄 변경 금지. 서블릿 text block의 기존 주석 삭제 금지.
2. 검증 게이트 우회·테스트 약화 금지.
3. 원시 NUL 바이트 삽입 금지.
4. text block 정규식 이스케이프 두 배(`\\d`). 서블릿 TEMPLATE에 String.format 금지(`__TOKEN__` 치환만).
5. approval-confluence10 수정 금지 (컴파일 확인만).
6. mvn clean/package/install 금지. git 커밋 금지.
7. 하지 않은 일을 했다고 보고하지 마라.
8. 새 CSS 색상 값 금지 — 기존 토큰 재사용. BEM `dmove-` 접두 유지.
9. JS는 document 레벨 이벤트 위임 유지. fetch는 credentials same-origin + POST엔 X-Atlassian-Token.

## 배경 (실측 완료)
- 요청 모달: `ApprovalMarkup.appendRequestForm` :292-342 — 승인자 검색(user/group scope 탭 :310-325), 요청 메모 필드 `appendRequestMessageField` :344-351. 제출 조립은 approval.js(steps hidden input, flowId, requestMessage → POST query 파라미터).
- 8b REST: create가 `ccKeys`/`ccGroups`(CSV) QueryParam 수용. 단건 GET JSON에 `cc: [{key, displayName}]` (비면 키 생략). `GET /mine/cc` + badges `{"cc": n}`.
- 업무함: `ApprovalInboxServlet.java` — TABS :721-730, endpoint 분기 :823 부근(`requested ? "/mine/requested" : "/mine"`), badge 키 맵 :851, detail(row) :484-526. 8c가 signature 뷰를 추가했으므로 줄 번호는 밀렸을 수 있다 — 패턴으로 찾아라.
- 사이드바: `NavMarkup.java` :191-196 `appendInboxItem(html, mode, ctx, space, view, label, icon, ...)`.
- 상세 모달: `ApprovalMarkup.detailDialog` — 요청 메모 섹션 `appendRequestMessage` :353-363 스타일 참조.

## 변경 1 — 요청 모달 CC 피커 (D8)
`ApprovalMarkup.appendRequestForm`: 요청 메모 필드(`appendRequestMessageField` 호출) **앞**에 "참조자" 필드 추가:
- 라벨 "참조자 추가 <span class=...optional>선택 · 열람과 알림만</span>".
- 사용자/그룹 검색 입력 — 기존 승인자 검색 마크업(:310-325) 패턴 복제하되 **셀렉터 충돌 방지**: `data-approval-cc-scope="user|group"`, 입력 name `ccSearch`/`ccGroupSearch`, 결과 ul 클래스 `dmove-approval-cc-user-results`/`dmove-approval-cc-group-results`.
- 선택된 참조자는 순서 없는 칩 목록 `<ul class="dmove-approval-cc-selected" aria-live="polite">`: 칩마다 이름 + 제거 버튼(`data-approval-cc-remove`).
- hidden input `name="ccKeys"`, `name="ccGroups"`.
- 이 필드는 direct/flow 양쪽 pane 밖(공통, 요청 메모 필드와 나란히)에 둔다.

`resources/js/approval.js`:
- 기존 승인자 검색 로직(사용자/그룹 REST 검색, 결과 클릭 추가)을 참조자용으로 재사용하되 CC 상태는 별도 배열(순서·단계 없음, 중복 추가 방지). 검색 REST는 기존 `/users`·`/groups` 그대로.
- 제출 시 ccKeys(사용자 키 CSV)·ccGroups(그룹명 CSV)를 POST query에 추가(비면 파라미터 생략).
- 승인자로 이미 추가된 사용자를 참조자로 추가하는 것은 막지 않는다(서버가 중복 제거) — 단, 같은 사람을 CC에 두 번 넣는 것만 클라에서 방지.
- 재승인(reapprove) 프리필 경로는 CC를 채우지 않는다(D5: 미승계).

`approval.css`: 칩 스타일 — 기존 pill/chip 토큰 재사용(`--sunk` 배경, `--rule` 테두리, 인라인 플렉스, 제거 버튼은 aui-button-link 소형).

## 변경 2 — 상세 모달 참조자 섹션
`ApprovalMarkup.detailDialog`: 요청 메모 섹션(`appendRequestMessage`) 뒤에 참조자 섹션 — `appendCc(html, List<String> ccDisplayNames)` 신설: 비면 생략, 있으면 `<section ...><h3>참조</h3><p class="dmove-approval-cc-list">이름, 이름, 이름</p></section>` (escape 필수).
- detailDialog 파라미터에 `List<String> ccDisplayNames` 추가(널/빈 허용). 호출부 2곳(panel·region macro)에서 ccStore 조회 + displayName 변환(기존 이중 조회 관례, 렌더 1회 Map 캐시)해 전달. **CC가 없으면 조회 이상의 비용 없음** — ccStore.findRecipients 1회는 허용.
- 시그니처가 커지는 것이 부담이면 기존 파라미터 순서를 유지한 채 끝에만 추가하라(테스트 수정 최소화).

## 변경 3 — 업무함 "참조" 탭 (D7)
`NavMarkup.java`: "내 요청" 아래에 `appendInboxItem(..., "cc", "참조", ICON_CC, false, false)` — ICON_CC는 기존 ICON_* SVG 상수 스타일로(봉투/눈 모양 등 단순 stroke 아이콘).
`ApprovalInboxServlet.java`:
- TABS에 `cc: {title: "참조", params: {}}` (다른 탭 구조와 동일하게).
- endpoint 분기: `currentView === "cc" ? "/mine/cc" : currentView === "requested" ? "/mine/requested" : "/mine"`.
- badge 키 맵에 `cc: "cc"`. 부팅 배지 규칙: requested 뷰와 동일하게 — cc 뷰로 부팅하면 badges에 cc만 오므로 나머지 배지는 loadBadges로 채움(기존 hasOwnProperty 가드 패턴 유지, requested 부팅 처리 코드를 보고 같은 방식으로 cc를 추가).
- 행 렌더·필터·칩은 기존 공통 경로 재사용(별도 작업 불필요 — /mine/cc 응답이 같은 형태).
- detail(row): `row.cc`가 오면(단건 GET에만 있으므로 목록 행에는 없음 — **목록 행에서는 렌더하지 않는다**) 무시. 즉 detail 변경 없음. 대신 "참조" 탭임을 알리는 빈 상태 문구: cc 뷰 empty 메시지 "참조로 지정된 결재가 없습니다." (기존 뷰별 empty 문구 패턴).
렌더 테스트(`ApprovalInboxServletRenderTest`)에 cc 탭 존재 assert 추가.

## 게이트 (전부 실행하고 결과를 보고에 포함)
```
set JAVA_HOME=C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot
C:\Onpremise\.toolchains\apache-maven-3.9.16\bin\mvn.cmd -B -pl approval-confluence9 -am test
C:\Onpremise\.toolchains\apache-maven-3.9.16\bin\mvn.cmd -B -pl approval-confluence10 compile
```
- 완료 보고: 변경 파일 목록(신규/수정) + 게이트 결과 + 미완 항목(정직하게).
- CC를 지정하지 않은 요청·기존 데이터에서 모든 화면이 이 배치 전과 동일해야 한다.

## 변경 4 — 8c 잔여 편승 (같은 파일들)
1. (qa-8c-r2 N1) 승인 PIN 스텝을 열 때 **회수 스텝**이 닫히지 않는다 — approval.js의 승인 PIN 열기 분기에서 반려 스텝만 닫는 부분에 회수 스텝 닫기(+회수 버튼 상태 복구)를 추가하라. 상세 수정안은 `_workspace/qa-8c-r2.md` N1 항목 참조.
2. (실기동 발견 N2) 승인 PIN 스텝에서 서버가 403/409를 돌려줘도 PIN input이 비워지지 않는다 — 반려 쪽과 동일하게 전송 직후(성공/실패 무관) 비우도록 통일.
3. (실기동 발견 N3) PIN input들(`data-approval-pin-input`, 내 서명 화면의 PIN 3필드)에 `autocomplete="new-password"`를 적용하라 — `off`는 Chrome이 무시하고 저장된 비밀번호를 제안한다(실기동에서 자동 채움 관찰). Confluence 로그인 비밀번호가 PIN 필드에 제안되는 것 자체가 안티패턴이다.
4. (실기동 관찰) 내 서명 화면 카드 레이아웃 정돈 — 현재 라벨·입력이 인라인으로 흘러 정렬이 어색하다. 기존 필드 마크업 관례(`dmove-approval-field`/`__label` 블록 구조, 설정 화면 폼 스타일)를 재사용해 ① 미리보기 ② 그리기 캔버스(테두리 var(--rule)) ③ 파일 업로드 ④ PIN 3필드를 세로 필드 블록으로 정리하라. 새 색·새 컴포넌트 금지, 기존 토큰·클래스 재사용.
