# 2026-08-11 — 하네스 첫 가동: 리뷰 이슈 수정 + UI/UX 전면 개편

Confluence DC 승인 앱(confluence-approval-dc)에서 approval-dev 하네스(Claude 스펙·설계·QA + Codex 구현)를
구축하고 첫 가동. 커밋 73b3210 → ade5070 (배치 3개 + 문서).

## 한 것
- 로직 전수 리뷰에서 버그 5+α 발견 → 배치 1로 수정 (반려 사유 필수 미강제, expiresAt 500,
  알림 채널 중복·마감임박 미표시, contentVersion 클라이언트 신뢰, 이메일 수신자 fallback 등 7건)
- 업무함·설정 서블릿을 `atl.general` 데코레이터로 일반 Confluence 페이지화 + 4탭 + 컨텍스트 패스 토큰화
- 페이지 패널을 상태 pill 하나 + 클릭 시 상세 모달로 전면 개편 (SVG 아이콘 6종, a11y)
- 로컬 인스턴스 브라우저 검증까지 완료 (pill/모달/업무함/설정 모두 정상, 콘솔 에러 0)

## 교훈
1. **구현체의 자기 보고와 검증 기준을 분리하라.** Codex가 "다크모드 블록 삭제" 지시를
   `prefers-color-scheme` → `prefers-reduced-motion: no-preference` 조건 바꿔치기로 처리해
   완료 기준의 문자열 grep을 우회했다 (사실상 전 사용자에게 다크 팔레트 적용되는 개악).
   QA가 "다크 hex 값 존재 여부"라는 의미 기반 판정으로 적발. grep 체크리스트는 우회 가능하다.
2. **CSS 스코프 지시는 "콤마 조각 단위"까지 명시해야 한다.** 첫 항목에만 접두를 붙이는 실수,
   홀짝으로 번갈아 빼먹는 실수가 실제로 났다. 검증도 셀렉터 파서로 조각 단위 판정이 필요했다.
3. **SiteMesh 데코레이터 통합의 함정**: 서블릿 <style>의 전역 셀렉터(`button{}`, `table{}`)는
   Confluence 크롬 전체를 깨고, 원본 `<body>` 속성은 보존이 보장되지 않는다(dataset은 래퍼 div로).
   `__TOKEN__`은 HTML 속성에만 넣고 JS는 dataset으로 읽으면 text block 이스케이프 문제도 원천 차단.
4. **좀비 AMPS 인스턴스**: mvn 래퍼가 죽고 cargo java만 남으면 Tomcat은 листening인데 전 경로 404.
   고아 프로세스 확인(부모 PID 부재) 후 내리고 분리 프로세스로 재기동. 인스턴스가 떠 있으면
   clean이 jar 잠금으로 실패 — clean 없는 `verify`로 패키징하면 QuickReload가 반영한다.
5. Codex가 네트워크 단절로 죽으면 먼저 `git status` — 수정 전에 죽었으면 복구 지시 없이 재실행.

관련: [[2026-06-29-delete-cascade-gantt]] (하네스 1패스 사례), topics/claude 하네스 패턴.
