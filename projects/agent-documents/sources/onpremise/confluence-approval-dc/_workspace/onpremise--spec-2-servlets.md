# 배치 2: 업무함·설정 서블릿을 Confluence 데코레이터 페이지로 전환

**시작하기 전에 반드시 `_workspace/design-ui-overhaul.md` 파일을 읽어라.** 이 배치는 그 설계 문서의
서블릿 부분을 구현한다. 설계 문서에 적힌 클래스명·토큰명·셀렉터·코드 인용을 그대로 따를 것.

## 이 배치에서 수정하는 파일 (이 2개 외에는 절대 손대지 말 것)
- `approval-confluence9/src/main/java/kr/dmove/confluence/approval/c9/servlet/ApprovalInboxServlet.java`
- `approval-confluence9/src/main/java/kr/dmove/confluence/approval/c9/servlet/ApprovalSettingsServlet.java`

## 구현 범위 (설계 문서 섹션 번호)
1. **§0.3** — CSS 충돌 방지 원칙: 서블릿 `<style>` 안 모든 셀렉터를 `#dmove-approval-app`로 스코프.
   `@keyframes rise` → `dmove-rise` 개명 포함.
2. **§1.1** — 업무함 최종 마크업 구조 (4탭: myturn/waiting/requested/done + 탭 배지 + table-wrap).
3. **§1.2** — 설정 화면 최종 마크업 구조.
4. **§2.1** — ApprovalInboxServlet 변경 전량: TOKEN에 CONTEXT_PATH 추가, doGet/render 시그니처,
   ADMIN_LINK 재작성, decorator meta, CSS 삭제/치환/추가 블록, 인라인 스크립트의 컨텍스트 패스 제거,
   body 속성을 래퍼 div로 이동.
5. **§2.2** — ApprovalSettingsServlet 변경 전량: 토큰 치환 메커니즘 신설, decorator meta,
   CSS 스코프/삭제, app-head 전환, 인라인 스크립트 컨텍스트 패스 제거.
6. **§2.3** — text block 안 JS 이스케이프 주의사항 준수.
7. **§3.8** — 업무함 인라인 스크립트: TABS 맵 기반 4탭 + syncTabBadges + requestedLoaded 플래그 +
   DUE_SOON 알림 렌더링(eventLabel/notificationLabel/notificationDetail/renderNotifications) +
   aria-labelledby 갱신 + 초기 탭 show("myturn").

참고: 배치 1에서 REST `/notifications`가 `eventType: "DUE_SOON"` + `expiresAt` 필드를 이미 내려주도록
수정됐다. UI는 설계대로 `expiresAt` 부재도 방어한다.

## 완료 기준 (self-check)
- 두 서블릿 TEMPLATE과 Java 문자열에서 `"/confluence/"` 문자열이 0건 (grep으로 확인).
- 서블릿 `<style>`에 `#dmove-approval-app` 스코프 없는 `body{`, `button{`, `table{`, `h1{`, `*{`,
  `:root{`, `input`, `label{`, `thead`, `tbody` 시작 규칙이 0건.
- `@media (prefers-color-scheme: dark)` 블록이 두 서블릿 모두 0건.
- `__CONTEXT_PATH__` 토큰은 HTML 속성에만 존재하고 JS 문자열 리터럴 안에는 없음.
- 기존 테스트 `ApprovalInboxServletRenderTest`가 render() 시그니처 변경으로 깨지면,
  테스트의 호출부만 새 시그니처에 맞춰 최소 수정한다 (검증 의도는 유지).

## 추가 수정 (배치 1 QA 후속 — ApprovalRestResource.java도 이 배치에서 수정 허용)

파일: `approval-confluence9/src/main/java/kr/dmove/confluence/approval/c9/rest/ApprovalRestResource.java`

(a) `notifications()`의 due-soon 분기가 null-safe하지 않다. eventId가 null인 알림 행 하나로
엔드포인트 전체가 500이 된다. 분기 앞에 가드를 추가한다:

```java
if (notification.eventId() == null) {
    continue;
}
```

(b) `deleteGroup()`에서 blank 검사가 관리자 검사보다 앞에 있으면 순서를 바로잡는다.
올바른 순서: `isAdministrator()` 403 → blank 400 → 삭제. (이미 이 순서라면 손대지 말 것.)

## 코드 스타일 (필수 준수)
- 개별 import만 사용, 와일드카드 금지. statement 한 줄에 하나, 중괄호 항상.
- 기존 파일 재포매팅·한 줄 압축 금지. 지시된 변경 외 수정 금지.
- 주석은 한국어, 기존 스타일(왜를 설명) 유지.
- text block 안 JS 정규식의 백슬래시는 두 번(`\\.`), 템플릿 안에 `"""` 금지.
