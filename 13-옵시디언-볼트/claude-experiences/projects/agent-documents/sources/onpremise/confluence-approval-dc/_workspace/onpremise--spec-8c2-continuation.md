# 배치 8c 속행 — 서명·PIN UI 잔여 구현 (부분 완료 트리 위에서)

너는 이 저장소의 구현 담당이다. 직전 실행이 부분 완료로 끝났다. **워크트리에는 이미 네가 만든 부분 변경이 적용되어 있고, 전체 테스트가 그린(109건)임을 코디네이터가 실측 확인했다.** 되돌리거나 다시 하지 말고 이어서 완성하라.

## 현재 상태 (실측)
- 수정된 파일 10개: ApprovalMarkup, ApprovalRegionMacro, ApprovalPagePanel, ApprovalRestResource, ApprovalSettingsServlet, NavMarkup(ICON_SIGNATURE 추가됨), approval.css, approval.js, 테스트 2종.
- 직전 보고 기준 완료: 설정 화면 체크박스(변경 1), 상세 모달 PIN 인라인 스텝(변경 4), 자동 도장 CSS(변경 2 일부), REST 오류 메시지 분리·설정 테스트 강화(변경 7).
- **미구현: 변경 2의 appendSteps 도장 렌더 연결 여부(직접 git diff로 확인하라), 변경 3(패널/매크로 signatureResolver 연결), 변경 5(업무함 `?view=signature` 내 서명 화면), 변경 6(업무함 상세 decisions 도장 렌더).**
- 원 스펙: `_workspace/spec-8c-signature-ui.md` — 금지 목록·UI 규칙·배경 전부 그대로 유효하다. 시작 전에 반드시 다시 읽어라.

## 작업 순서
1. `git diff --stat` + 원 스펙 대조로 남은 항목을 확정하라 (완료된 부분 재작업 금지).
2. 원 스펙 변경 2 잔여 → 변경 3 → 변경 6 → 변경 5 순으로 구현 (5가 가장 크다 — 캔버스 그리기·업로드·PIN 설정 카드·`__SIGNATURE_ENABLED__`/`__USER_DISPLAY_NAME__` 토큰).
3. 변경 5의 렌더 테스트(ApprovalInboxServletRenderTest에 signature 뷰 assert)와 NavMarkup "내 서명" 항목까지.

## 추가 주의 (직전 실행 이후 코디네이터가 백엔드를 수정했다)
- **approve/reject/pin/signature REST는 이제 @FormParam이 아니라 form body 전용 리더(`formOnlyParam`)로 읽는다** — REST v2 Jersey가 바디 없는 POST에 500을 던지는 라이브 버그 때문. JS 관점 계약은 동일: **pin·서명 데이터는 반드시 `body: new URLSearchParams({...})`로, query string에 절대 넣지 마라** (query에 같은 이름이 있으면 서버가 값을 무시한다).
- 게이트 시간이 모자라면 테스트를 약화하지 말고 "게이트 미실행"으로 정직하게 보고하라 — 코디네이터가 직접 돌린다.

## 게이트
```
set JAVA_HOME=C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot
C:\Onpremise\.toolchains\apache-maven-3.9.16\bin\mvn.cmd -B -pl approval-confluence9 -am test
C:\Onpremise\.toolchains\apache-maven-3.9.16\bin\mvn.cmd -B -pl approval-confluence10 compile
```
완료 보고: 변경 파일(신규/수정) + 게이트 결과("Tests run:" 줄 그대로 인용) + 미완 항목(정직하게).
