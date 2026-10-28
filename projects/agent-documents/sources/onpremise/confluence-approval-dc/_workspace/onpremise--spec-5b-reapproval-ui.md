# 배치 5b: 재승인 UI — stale pill·버전 이력·diff 링크·원클릭 재승인

**시작 전에 반드시 `_workspace/design-reapproval.md` §3을 읽어라.** 배치 5a(백엔드)는 완료되어
워킹트리에 있다: 도메인은 APPROVED를 영구 유지, REST는 `stale`·`previousRequestId` 응답 필드와
`fromRequestId` 파라미터(결재선 재사용)를 제공한다.

## 반복 실수 금지 규칙
압축 금지 / 지시 외 변경 금지 / 죽은 코드 금지 / sr-only는 span에만 / CSS 중복 정의 금지 /
완료 기준 자가 검증 후 보고.

## 수정 파일 (이외 금지)
- approval-confluence9/src/main/java/kr/dmove/confluence/approval/c9/macro/ApprovalMarkup.java
- approval-confluence9/src/main/java/kr/dmove/confluence/approval/c9/panel/ApprovalPagePanel.java
- approval-confluence9/src/main/java/kr/dmove/confluence/approval/c9/macro/ApprovalRegionMacro.java
- approval-confluence9/src/main/resources/js/approval.js
- approval-confluence9/src/main/resources/css/approval.css
- approval-confluence9/src/main/java/kr/dmove/confluence/approval/c9/servlet/ApprovalInboxServlet.java
  (statusCell stale 문구만)

## 구현 내용

### 1. stale 판정과 pill (설계 §3.1)
- 패널: `renderRequest`에서 `boolean stale = request.status() == APPROVED &&
  page.getVersion() > (approvedContentVersion() ?? MAX)` 계산 (approvedContentVersion null이면 false).
  매크로: 동일 계산을 `target.contentVersion()`(= 현재 페이지 버전, 4b에서 교정됨) 기준으로.
- `ApprovalMarkup.pill`에 stale 파라미터 추가:
  - stale=false, APPROVED: 라벨 뒤 `<span class="dmove-approval-pill__step">v{n}</span>` (승인 버전 표시).
  - stale=true: 모디파이어 `dmove-approval-pill--stale`(신규), 아이콘은 ICON_PENDING(시계),
    라벨 `v{approved} 승인 · v{current} 미승인`. 기존 `!` 뱃지 로직은 과거 EXPIRED 데이터
    (requiresReapproval/expiredByEdit) 전용으로 유지.
- CSS `--stale`: 호박 계열 재사용 `color:#a86400; background:#fdf3e0;` (approval.css 기존 pill 블록 옆에 추가).

### 2. 상세 모달 확장 (설계 §3.2)
`ApprovalMarkup.detailDialog` 확장 (파라미터 추가는 record/빌더 없이 최소한으로 — 호출측 2곳뿐):
- stale이면 모달 body 최상단에 안내:
  `<div class="dmove-approval-notice dmove-approval-notice--warning">v{approved} 승인 이후 페이지가
  v{current}로 수정되었습니다. 현재 버전은 승인되지 않았습니다.</div>`
  + 그 옆에 diff 링크: `<a href="{ctx}/pages/diffpagesbyversion.action?pageId={id}&selectedPageVersions={approved}&selectedPageVersions={current}" target="_blank" rel="noopener">v{approved}과 차이 보기</a>`
  (ctx는 서버 렌더링이므로 호출측이 넘긴다 — 패널/매크로 모두 request context path를 알 수 없으면
  상대 경로 `/confluence` 하드코딩 금지, `com.atlassian.confluence.util.GeneralUtil.getGlobalSettings()` 대신
  간단히 `href`를 컨텍스트 상대(`{ctx}` = HttpContext 불가 시)로… **주의**: 패널·매크로는 페이지 렌더링
  내부이므로 상대 URL `"/confluence"` 하드코딩 금지. `com.atlassian.sal...` 추가 의존 대신
  **컨텍스트 상대 경로가 필요하므로 approval.js가 이미 쓰는 AJS.contextPath() 방식과 일관되게,
  링크는 data 속성(`data-approval-diff="{approved}:{current}"`)만 렌더하고 href는 approval.js가
  DOMContentLoaded 시 채운다** — 기존 init()에 diff 링크 href 채우는 함수 추가.
- **버전별 승인 이력 섹션**: 호출측(패널/매크로)이 그 대상의 APPROVED 요청 목록
  (repository.findByPageId 후 대상 scope 필터, contentVersion 내림차순, 최대 5건)을 조회해
  `List<ApprovalMarkup.HistoryEntry(version, approvedAtIso)>` 로 넘긴다. 모달에
  `<section>` "버전별 승인 이력": `v3 승인 — 2026-08-12T…` 목록. 0건이면 섹션 생략.
  패널의 findLatestPageRequest와 별개 조회이므로 페이지당 1회만 (renderRequest에서).
- **재승인 CTA**: stale && canRequest이면 detail 모달 footer에
  `<button type="button" class="aui-button aui-button-primary" data-approval-reapprove="1">같은 결재선으로 재승인 요청</button>`.

### 3. 원클릭 재승인 동선 (approval.js)
- `[data-approval-reapprove]` 클릭 분기: detail 모달을 닫고, 같은 컨테이너의 `--request` 모달을 열며,
  그 form에 `form.dataset.approvalFromRequestId = container.dataset.approvalRequestId` 설정.
  (프리필 결재선은 서버가 아니라 **fromRequestId 서버 복원**에 맡긴다 — 사용자가 결재선을 안 바꾸면
  steps를 비워 보내고 서버가 이전 결재선을 재확장한다.)
- 요청 모달 UI: fromRequestId 모드일 때 direct 탭 상단에 안내 힌트
  `<p class="dmove-approval-hint dmove-approval-reapprove-hint" hidden>이전 요청의 결재선을 그대로
  사용합니다. 승인자를 추가하면 새 결재선으로 대체됩니다.</p>` (마크업은 ApprovalMarkup.requestDialog에
  hidden으로 항상 렌더, JS가 fromRequestId 모드에서만 hidden 해제).
- submit 핸들러 수정: `form.dataset.approvalFromRequestId`가 있으면 URL에
  `&fromRequestId=` 추가. **direct 모드에서 steps가 비어 있어도 fromRequestId가 있으면 제출 허용**
  (기존 "승인자를 한 명 이상 추가하세요" 검증을 fromRequestId 존재 시 건너뜀).
  모달 닫기/취소 시 dataset과 힌트 상태 초기화.

### 4. 업무함 statusCell (설계 §3.3)
- `r.stale === true`이면 APPROVED 행에 보조 문구: `el("small", "v" + r.approvedContentVersion + " 기준 · 현재 버전 미승인", "warn")`.
- 기존 approvedContentVersion 표시(stale 아닐 때)는 유지.

## 완료 기준 (자가 검증·보고)
- node --check 통과. 하드코딩 /confluence 0건. escape 규칙 준수(버전 숫자는 미적용, 라벨·이력 문자열 escape).
- detail/request 모달 컨테이너 스코프 유지 (4b 회귀 금지).
- stale=false 화면은 기존과 시각적 차이 없음 (pill 버전 표시 제외).
- git diff --check 통과.

## 코드 스타일
개별 import, statement 한 줄, 중괄호 필수, 주석 한국어.
