# 배치 4a: 업무함 사이드 메뉴 + 진입 링크 정리 + 승인 요청 버튼 아이콘

**시작 전에 반드시 `_workspace/design-inbox-sidebar.md`를 읽어라.** 이 배치는 그 설계의 §A(업무함
좌측 메뉴 레이아웃), §B(스페이스 사이드바 진입 링크), §C(승인 요청 버튼 아이콘)과 관련 CSS(§G 중
해당 부분), a11y(§H 중 해당 부분)를 구현한다. §D(요청 모달)·§E(매크로)·§F(approval.js)는 다음
배치이므로 건드리지 말 것.

## 수정 파일 (이외 수정 금지)
- `approval-confluence9/src/main/java/kr/dmove/confluence/approval/c9/servlet/ApprovalInboxServlet.java`
- `approval-confluence9/src/main/resources/atlassian-plugin.xml`
- `approval-confluence9/src/main/resources/css/approval.css` (§B·§C의 ::before 아이콘 규칙만)
- 필요 시 `approval-confluence9/src/test/java/.../ApprovalInboxServletRenderTest.java` (렌더 구조 assertion이
  좌측 메뉴 전환으로 깨질 때 최소 수정)

## 준수 사항
- 설계 문서의 마크업 구조·클래스명·인라인 SVG·`activate(view)` 교체 8곳을 그대로 따를 것.
- 기존 `TABS` 필터식·`render`·`renderNotifications`·`requestedLoaded` 로직은 유지 (설계가 지정한
  셀렉터/라벨 교체만).
- 서블릿 `<style>` 신규 규칙 전부 `#dmove-approval-app` 스코프, 콤마 조각 단위 접두 (배치 2 원칙).
- 다크 팔레트·전역 셀렉터 재유입 금지.
- web-item weight/label 변경은 설계 §B의 값 그대로 ("✓" 제거, weight=1000).
- approval.css의 ::before 아이콘은 설계 §G.1의 data-URI mask 인코딩 완료본을 그대로 붙여넣는다.

## 완료 기준 (제출 전 자가 검증·보고)
- 인라인 script `node --check` 통과.
- 서블릿 스코프 검사(콤마 조각 단위) 0건, `prefers-color-scheme`/`no-preference` 0건.
- atlassian-plugin.xml에 "✓" 문자 0건.
- `mvn`이 없으면 컴파일 검증 불가함을 보고에 명시 (QA가 수행).

## 코드 스타일
개별 import, statement 한 줄, 중괄호 필수, 재포매팅·압축 금지, 지시 외 변경 금지, 주석 한국어.
