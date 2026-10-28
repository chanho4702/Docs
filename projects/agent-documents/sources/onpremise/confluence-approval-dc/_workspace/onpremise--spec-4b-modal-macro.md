# 배치 4b (v2, 클린 재실행): 승인 요청 모달 재설계 + approval-region 매크로 pill/모달 통일

**컨텍스트**: 이전 시도는 폐기되고 워킹트리는 fb912b9(배치 4a까지) 클린 상태다. 처음부터 다시
구현한다. 이전 시도에서 QA가 잡은 결함을 반복하지 않도록 아래 5개 규칙을 먼저 읽어라:

1. **sr-only 라벨 안에 input을 넣지 마라.** 검색 input은
   `<label class="dmove-approval-sr-only" for="ID">…</label><input id="ID" …/>` 형제 구조로.
   sr-only는 clip으로 요소를 숨긴다 — 자식 input까지 사라진다.
2. **파일 압축 금지.** ApprovalMarkup.java 포함 모든 파일에서 statement 한 줄에 하나,
   append 체이닝도 한 줄에 하나. 한 줄 200자를 넘기지 마라.
3. **CSS는 말미 오버라이드 append가 아니라 기존 블록 교체.** 같은 셀렉터 중복 정의를 만들지 마라.
   설계가 삭제하라는 규칙은 실제로 삭제하라.
4. **죽은 코드를 만들지 마라** (생성 후 미사용 DOM 요소 등).
5. **지시 외 문구·주석을 바꾸지 마라.** 기존 안내문 문구와 설명 주석은 그대로 이관한다.

**시작 전에 반드시 `_workspace/design-inbox-sidebar.md`를 읽어라.** 이 배치는 §D(요청 모달 재설계),
§E(매크로 개편, ApprovalMarkup 공용 헬퍼 추출 포함), §F(approval.js 수정 — 컨테이너 스코프 모달
셀렉터), 관련 CSS(§G 잔여분)를 구현한다. §A/§B/§C는 직전 배치에서 완료됐다.

## 수정 파일 (이외 수정 금지)
- `approval-confluence9/src/main/java/kr/dmove/confluence/approval/c9/panel/ApprovalPagePanel.java`
- `approval-confluence9/src/main/java/kr/dmove/confluence/approval/c9/macro/ApprovalRegionMacro.java`
- `approval-confluence9/src/main/java/kr/dmove/confluence/approval/c9/macro/ApprovalMarkup.java` (신규 —
  설계 §E가 지정한 패키지/이름을 따를 것)
- `approval-confluence9/src/main/resources/js/approval.js`
- `approval-confluence9/src/main/resources/css/approval.css`
- 필요 시 매크로 관련 기존 테스트 최소 수정 (검증 의도 유지)

## 반드시 반영할 설계 발견 2건
1. §F: `document.querySelector('.dmove-approval-modal--request')` 전역 셀렉터 2곳(요청 트리거,
   syncTriggerVisibility)은 매크로 개편 후 한 페이지에 요청 모달이 여러 개 생기면 깨진다 —
   설계가 지정한 컨테이너 스코프 방식으로 교체.
2. §E.4-b: ApprovalRegionMacro가 `request.target()`의 낡은 contentVersion을
   `data-approval-content-version`에 쓰는 버그 — 현재 페이지 버전을 쓰도록 수정.

## 준수 사항
- JS 계약 클래스(dmove-approval-select-user, dmove-approval-step-up/down/remove,
  dmove-approval-selected-steps, steps hidden input, data-approval-* dataset)는 설계가 명시한 변경
  외에 바꾸지 말 것.
- escape 규칙: 동적 문자열(사용자 이름, 그룹명, 라벨, 사유)은 전부 escape 통과. 정적 SVG 상수는 제외.
- 패널·매크로가 한 페이지에 공존하는 케이스가 설계 §E의 검증 시나리오다 — 모달 열기/닫기/승인
  버튼이 자기 컨테이너의 모달만 조작해야 한다.
- 매크로 공유 CSS 클래스 정리는 설계 §G를 따르되, 이제 두 렌더러가 ApprovalMarkup을 공유하므로
  중복 정의를 남기지 말 것.

## 완료 기준 (자가 검증·보고)
- `node --check approval.js` 통과.
- approval.js에 `document.querySelector('.dmove-approval-modal` 로 시작하는 전역 셀렉터 0건
  (컨테이너 스코프만 허용).
- ApprovalRegionMacro에 `request.target().contentVersion()`을 data 속성에 쓰는 코드 0건.
- git diff --check 통과.

## 코드 스타일
개별 import, statement 한 줄, 중괄호 필수, 재포매팅·압축 금지, 지시 외 변경 금지, 주석 한국어.
