# 2026-08-13 — 배치 8(서명·PIN·CC) + 배포 사고 3연타

> 배치 8a(서명·PIN 백엔드)·8b(CC 백엔드) QA 2차 PASS·커밋. UI 직접 수정 3건(중복 제목 밴드 제거·사이드바 풀하이트+경계선 호버 토글·아이콘 간격). 8c(서명 UI)는 Codex 부분 완료 후 속행.

## 기능 설계 요점
- 서명 3단계 전부 옵션(기본 off = 현행 동일): 자동 도장(CSS, 저장물 0) → 등록 서명(APR_SIGN, png/jpeg ≤50KB, **SVG 금지** — 스크립트 벡터) → PIN(APR_PIN, PBKDF2WithHmacSHA256 210k회·상수시간 비교·5회 실패 15분 잠금, **Confluence 비밀번호 재입력 절대 금지**).
- CC는 별도 테이블(APR_CC) — 승인자 테이블 role 방식은 `saveApprovers`가 모르는 행을 삭제해 **저장할 때마다 CC 소실** 등 8개 지점 오염(실측)이라 기각. resolver는 3-인자 확장, CC 알림은 REQUESTED+최종 결정만(중간 승인마다 APPROVED 이벤트가 쌓이므로 "마지막 APPROVED" 식별 필수 — 스펙 전제 오류를 QA가 적발).

## 배포 사고 3연타 (topics 급 교훈)
1. **`<Embed-Dependency>` 재료 삭제 후 증분 패키징** → domain 통째로 빠진 jar → REST·패널·매크로 전부 NoClassDefFoundError. "stale 클래스 삭제" 교훈의 잘못된 일반화가 원인. **삭제했으면 clean 패키징, 배포 전 `unzip -l | grep -c domain` 게이트.**
2. **Sitemesh는 서블릿 `<style>` 내용도 태그로 파싱** — CSS 주석 속 `<title>` 문자열에 style 블록 전체가 잘려 무스타일 렌더("개박살").
3. **실행 중 `mvn clean`은 "실패"가 아니라 "지우다 만다"** — 웹앱 전 경로 404 좀비. 그리고 c9 clean은 `target/confluence/home`(H2)을 삭제 → **테스트 데이터 전량 소실**. clean 전 home 백업 필요.
4. (보너스) **REST v2 Jersey의 @FormParam은 바디 없는 POST에 우리 코드 진입 전 500** — 단위 테스트는 Jersey 레이어를 안 타서 QA가 못 잡는다. form 전용 엄격 리더(`formOnlyParam`: content-type 검사 + query 동명 파라미터 거부)로 교체. **배포 후 라이브 REST 실측(결정 POST 포함)을 게이트에 추가.**

재발 방지: `approval-dev` 스킬에 "빌드·배포 철칙 5조" 신설(구조적 강제) + 메모리 갱신 + CLAUDE.md 이력.

- 관련: [[2026-08-12-batch4-7]], [[2026-08-11-harness-first-run]]
