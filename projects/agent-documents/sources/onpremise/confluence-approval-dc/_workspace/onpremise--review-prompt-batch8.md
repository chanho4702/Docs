# 배치 8 교차 검토 (Phase 3.5) — 보고만, 수정 금지

너는 제3자 리뷰어다. **파일을 수정하지 마라. 커밋하지 마라. 게이트 실행 외 상태 변경 금지.** 발견만 보고하라.

## 범위
- 커밋: `git diff 4a3d8fb..HEAD` — c9ea734(8a 서명·PIN 백엔드 + 8b CC 백엔드), e57169a(UI 직접 수정 + 스킬), 24862fe(@FormParam 제거·formOnlyParam), 2a7d6b3(8c 서명·PIN UI)
- 미커밋: `git diff HEAD` — 8d(CC UI + 8c 잔여 편승 + CSS 2줄 재작업)
- 설계: `_workspace/design-batch8.md` (D1~D10), QA 이력: `_workspace/qa-8a.md`·`qa-8a2.md`·`qa-8b.md`·`qa-8b2.md`·`qa-8c.md`·`qa-8c-r2.md`·`qa-8d.md` — **이미 적발·수정된 항목은 재보고 불요.**

## 중점
1. **보안 (최우선)**: PIN 경로 전체 — PBKDF2 파라미터, 상수시간 비교, 잠금 로직의 경쟁 조건, formOnlyParam의 query 차단 우회 가능성(인코딩 변형, content-type 변형), 서명 이미지 서빙의 권한 체인(canView + decisions 멤버십)과 base64 검증 우회, XSS(도장 렌더·CC 칩·내 서명 화면의 escape 누락), CC로 인한 정보 노출(권한 없는 사용자가 CC 지정으로 알림/열람을 얻는 경로).
2. **옵션 off 무영향**: signatureEnabled=false에서 8a~8d 전체 코드 경로가 배치 전과 동일한지 — 특히 decisions[] 직렬화, 렌더 파이프라인, JS 폴스루.
3. **버그·회귀**: (a) 서블릿 text block 렌더 JS 유효성(필요 시 node로), (b) approval.js 이벤트 위임 분기 순서(CC/PIN/반려/회수/승인 5중 상호작용), (c) resolver 3-인자와 enqueueFor 재순회의 멱등성(마지막 APPROVED 식별), (d) /mine/cc의 페이징·배지 의미 일관성, (e) AO 신규 엔티티 3종의 unique/인덱스와 upsert 경쟁.
4. **C10 파손**: `mvn -pl approval-confluence10 compile`만 (jar 패키징 금지 — dev 인스턴스 실행 중).
5. **설계 불일치**: design-batch8.md D1~D10과 구현의 어긋남.
6. Claude가 직접 수정한 formOnlyParam(24862fe)을 특히 의심하라 — Jersey 컨텍스트에서 getParameter의 body 소비 시점, 다중 값 파라미터, 인코딩 이슈.

## 게이트 (실행해 결과 보고)
```
set JAVA_HOME=C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot
C:\Onpremise\.toolchains\apache-maven-3.9.16\bin\mvn.cmd -B -pl approval-confluence9 -am test
C:\Onpremise\.toolchains\apache-maven-3.9.16\bin\mvn.cmd -B -pl approval-confluence10 compile
```

## 보고 형식
심각도(치명/중대/경미)별로: 파일:줄, 문제, 근거(실측), 제안 수정. 문제없으면 "이상 없음"과 확인한 범위.
