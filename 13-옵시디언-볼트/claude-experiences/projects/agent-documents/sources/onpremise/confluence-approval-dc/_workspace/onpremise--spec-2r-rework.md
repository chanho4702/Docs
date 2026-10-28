# 배치 2 재작업: QA FAIL 17건 수정

이전 시도가 배치 2를 부분적으로만 올바르게 구현했다. 워킹트리에는 그 결과가 이미 적용되어 있다
(커밋 `804adc9` 이후 미커밋 변경). 이번 작업은 **그 위에서** QA가 지적한 결함만 고친다.

**시작 전에 반드시 다음 두 파일을 읽어라:**
1. `_workspace/qa-2.md` — 결함 17건의 정확한 위치·원인·재작업 지시 (§6이 우선순위 순 지시 목록)
2. `_workspace/design-ui-overhaul.md` §1.1, §1.2, §2.1(e)(f)(g), §2.2, §3.8(d) — 따라야 할 설계 원문

## 수정 파일 (이외 수정 금지)
- `approval-confluence9/src/main/java/kr/dmove/confluence/approval/c9/servlet/ApprovalInboxServlet.java`
- `approval-confluence9/src/main/java/kr/dmove/confluence/approval/c9/servlet/ApprovalSettingsServlet.java`
- `approval-confluence9/src/test/java/kr/dmove/confluence/approval/c9/servlet/ApprovalInboxServletRenderTest.java` (C2 항목만)

## 작업 내용
`qa-2.md` §6 "재작업 지시" 1~11번을 순서대로 전부 적용하라. 요약:

1. C1: 다크 팔레트 `@media` 블록 **통째 삭제** (조건 바꿔치기 금지 — 이전 시도가 저지른 실수다.
   "문자열 검색을 통과시키는 것"이 아니라 "어두운 팔레트가 존재하지 않는 것"이 목표다).
2. C2: `ApprovalInboxServletRenderTest` render 호출 7곳에 5번째 인자 추가 + context-path 검증 assertion 추가.
3. C3: Inbox 마스트헤드의 고아 `</span>`·잔존 SVG 삭제.
4. C4+C5: `<style>` 안 **모든** 셀렉터(콤마 리스트의 각 조각 포함)에 `#dmove-approval-app` 접두.
   @keyframes 내부 from/to만 예외. qa-2.md가 열거한 위험 셀렉터 전부 포함.
5. H4+H5+H8: 배경 연출·`.shell` 규칙·`#dmove-approval-app html{}` 삭제, Inbox 래퍼에 `padding:0 0 48px`.
6. H1: `.masthead` → `.app-head` 구조 전환 (설계 §1.1/§1.2 그대로), eyebrow·masthead·icon-btn CSS 삭제.
7. H7: Settings 업무함 링크를 텍스트 `승인 업무함`으로.
8. H2: Inbox 표를 `div.table-wrap`으로 감싸고 overflow-x 규칙 추가.
9. H3: `.tab__badge`/`.feed--due` CSS 4개 규칙 추가 (qa-2.md H3의 코드 그대로).
10. H6: `statusCell` PENDING 분기에 myStepOrder 힌트 (설계 §3.8(d) 코드 그대로).
11. M1/M2/M3: Settings 뷰 탭 a11y 속성(id/aria-controls/role=tabpanel/aria-labelledby),
    Inbox tablist aria-label, 문구 3건을 설계 원문과 일치시킴.
12. M4(권장): 인라인 JS의 `document.querySelectorAll(".tab")`를 앱 루트 기준으로 좁힘
    (`root.querySelectorAll(".tab")` — root는 이미 선언되어 있음). Settings의 뷰 탭 JS도 동일.

## 완료 기준 (제출 전 스스로 검증하고 결과를 보고에 포함할 것)
- 두 서블릿 `<style>`에서 셀렉터를 콤마로 쪼갠 각 조각이 전부 `#dmove-approval-app`으로 시작
  (@keyframes from/to 제외) — 스크립트로 검증해 0건 확인.
- `prefers-color-scheme` 및 `prefers-reduced-motion: no-preference` 검색 결과 0건
  (`prefers-reduced-motion:reduce` 규칙은 스코프 붙여 유지).
- 인라인 `<script>` 추출 후 `node --check` 통과 (두 서블릿 모두).
- `eyebrow`, `masthead`, `icon-btn` 문자열이 두 서블릿에서 0건.
- 테스트 파일이 새 시그니처로 컴파일 가능한 형태.

## 코드 스타일
- 개별 import, statement 한 줄, 중괄호 필수. 재포매팅·압축 금지. 지시 외 변경 금지. 주석 한국어.
