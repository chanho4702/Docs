# 배치 8d 재작업 — QA FAIL 수정 (중대 1건, 2줄)

너는 이 저장소의 구현 담당이다. 금지 목록: 재포매팅 금지·게이트 우회 금지·C10 수정 금지·clean/커밋 금지·허위 보고 금지. 게이트 출력의 "Tests run:" 줄 그대로 인용.

# 배치 8d 재작업 — QA FAIL 수정 (중대 1건, 2줄)

너는 이 저장소의 구현 담당이다. **아래 1건만 고쳐라. 다른 코드를 건드리지 마라.**
원 스펙 `_workspace/spec-8d-cc-ui.md`의 금지 목록이 그대로 적용된다.

## R1 (중대) CC 칩 CSS가 패널·매크로에서 무효 — `approval.css:634, 636`

`.dmove-approval-cc-chip`이 `var(--rule)`·`var(--sunk)`를 참조하는데,
**`approval.css`에는 CSS 커스텀 속성이 하나도 정의돼 있지 않다**(정의 개수 0, 실측).
그 토큰들은 `ApprovalInboxServlet` TEMPLATE의 `#dmove-approval-app` 스코프 전용이다.

CC 칩이 들어가는 요청 모달은 **패널·영역 매크로에서만** 렌더된다
(`ApprovalInboxServlet`에 `.dmove-approval-request` 폼은 0건). 따라서 토큰이 상속될 경로가 없고,
`border` 단축은 var가 invalid이면 **선언 전체가 무효**가 되어 테두리가 통째로 사라진다.
결과적으로 칩이 배경·테두리 없는 맨 텍스트로 보인다.

**이것은 배치 8c에서 이미 잡아 고쳤던 결함과 같은 유형이다**
(qa-8c M3 → 8c4-rework R4에서 `.dmove-approval-stamp`의 var()를 전부 하드코딩으로 바꿨다).
8d 스펙 변경 1이 "`--sunk` 배경, `--rule` 테두리"라고 적은 것이 오도했다 — 그 문구를 따르지 마라.

이 파일의 기존 관례(하드코딩)로 바꿔라. **새 색상 값은 쓰지 마라** — 아래 두 값은 이미 이 파일에 있다
(테두리 `#dfe1e6`: `:205, :237, :366, :551` / 옅은 배경 `#ebecf0`: `:327`).
```css
    border: 1px solid #dfe1e6;
    background: #ebecf0;
```
수정 후 `grep -c "var(--" approval-confluence9/src/main/resources/css/approval.css`가
**0**이 되는지 확인해서 보고하라.

## 게이트 (실행하고 "Tests run:" 줄을 그대로 인용)
```

## 게이트
```
set JAVA_HOME=C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot
C:\Onpremise\.toolchains\apache-maven-3.9.16\bin\mvn.cmd -B -pl approval-confluence9 -am test
```
