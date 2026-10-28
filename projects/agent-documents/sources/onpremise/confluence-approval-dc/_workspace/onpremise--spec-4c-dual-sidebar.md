# 배치 4c: 앱 사이드바 접기/스페이스 복귀 동선/설정 통합

**시작 전에 반드시 `_workspace/design-dual-sidebar.md`를 읽어라.** 이 배치는 그 설계 전체를 구현한다.
설계에 명시된 마크업·토큰·CSS·JS·atlassian-plugin.xml 변경을 그대로 따를 것.

## 이전 배치에서 반복된 실수 금지 규칙 (필독)
1. sr-only는 label 자체에 주지 마라 — 텍스트 span에만.
2. 파일 압축 금지: statement/append 한 줄에 하나, 한 줄 200자 미만.
3. CSS는 지시된 위치에 교체/추가 — 같은 셀렉터 중복 정의 금지.
4. 죽은 코드·미사용 마크업 생성 금지. 삭제 지시는 실제로 삭제.
5. 지시 외 문구·주석 변경 금지. 이관 시 주석 함께 이동.
6. 설계가 "주의 함정"으로 명시한 2건 반드시 반영: (a) 설정 화면 일반 button 규칙이 토글을
   덮지 않도록 토글에 border/background/padding 명시, (b) SETTINGS 모드는 data-view 미출력.

## 수정 파일 (이외 금지)
- approval-confluence9/src/main/java/kr/dmove/confluence/approval/c9/servlet/ApprovalInboxServlet.java
- approval-confluence9/src/main/java/kr/dmove/confluence/approval/c9/servlet/ApprovalSettingsServlet.java
- approval-confluence9/src/main/java/kr/dmove/confluence/approval/c9/servlet/NavMarkup.java (신규)
- approval-confluence9/src/main/resources/atlassian-plugin.xml
- approval-confluence9/src/test/java/kr/dmove/confluence/approval/c9/servlet/ApprovalInboxServletRenderTest.java
  (render 시그니처 변경 대응 — 검증 의도 유지, 새 인자 반영)

## 핵심 요구 (설계 문서가 상세 명세)
1. NavMarkup 헬퍼 + 4토큰(__NAV_CSS__/__APP_NAV__/__NAV_BOOT__/__NAV_SCRIPT__), Mode.INBOX/SETTINGS.
2. 스페이스 복귀 그룹: web-item `?spaceKey=$htmlUtil.urlEncode($helper.spaceKey)`, 서블릿은
   SpaceManager 조회 + VIEW 권한 확인 성공 시에만 DB 값(space.getKey()/getName()) 출력.
   요청 파라미터를 직접 출력하는 경로가 없어야 한다.
3. 접기/펴기: rail 56px, localStorage `dmove-approval-nav-collapsed`, @media(min-width:1025px) 게이트,
   grid-template-columns transition, 인라인 부트 스크립트로 FOUC 차단, aria-expanded/aria-controls,
   접힘 상태 메뉴 항목 title.
4. 설정 화면: 같은 앱 사이드바(SETTINGS 모드, 링크형 항목, spaceKey 유지), 내부 3탭은
   .subnav__btn 세그먼트 칩으로 강등(ARIA 유지).

## 완료 기준 (자가 검증·보고)
- 인라인 script(부트 포함) node --check 통과 (두 서블릿).
- 서블릿 <style> 스코프 검사(콤마 조각 단위) 0건, prefers-color-scheme 0건.
- spaceKey 요청 파라미터가 이스케이프 없이/직접 출력되는 코드 0건 (grep).
- 컴파일은 환경상 불가 시 보고만 (QA가 수행).

## 코드 스타일
개별 import, statement 한 줄, 중괄호 필수, 재포매팅 금지, 주석 한국어.
