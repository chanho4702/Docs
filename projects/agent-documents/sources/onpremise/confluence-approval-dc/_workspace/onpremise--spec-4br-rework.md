# 배치 4b 재작업: QA FAIL 11건 수정 (복구 재실행)

**복구 컨텍스트**: 직전 재작업 실행이 도중에 강제 종료됐다. 워킹트리는 "배치 4b 1차 결과물 +
재작업 일부가 적용됐을 수도 있는" 불확정 상태다. 따라서 아래 각 항목을 수정하기 전에 **현재 코드가
이미 고쳐져 있는지 먼저 확인**하고, 안 고쳐진 항목만 적용하라. 이미 올바른 항목은 건드리지 말 것.

워킹트리(커밋 fb912b9 이후)에 배치 4b가 적용되어 있으나 결함이 있다. **그 위에서** 아래만 고친다.

**시작 전에 반드시 읽어라:**
1. `_workspace/qa-4b.md` — 결함 11건의 위치·재작업 지시 (이 문서가 1차 기준)
2. `_workspace/design-inbox-sidebar.md` §D, §G — 따라야 할 설계 원문

## 수정 파일 (이외 금지)
- ApprovalMarkup.java / ApprovalPagePanel.java / ApprovalRegionMacro.java / approval.js / approval.css

## 핵심 지시 (qa-4b.md 재작업 지시 전체를 적용하되, 특히)

1. **치명**: 검색 input을 sr-only 라벨 밖으로. 설계 §D 구조대로 —
   `<label class="dmove-approval-sr-only" for="...">라벨</label><input id="..." .../>`
   형태로 라벨과 input을 형제로 분리한다 (input이 클리핑되지 않아야 한다). 패널·매크로 양쪽
   요청 모달 모두. label의 for/id 연결 유지 (id는 컨테이너별 유일해야 함 — 매크로 다중 배치 고려,
   설계 §D가 지정한 id 규칙을 따를 것).
2. **압축 해제**: ApprovalMarkup.java의 한 줄 2,702자 등 압축된 부분을 원본 이관 코드 수준
   (statement 한 줄, 체이닝 append 한 줄에 하나)으로 재포맷한다. 파일 전체가 규칙을 지켜야 한다.
3. **CSS 정리**: 말미 오버라이드로 덧붙인 블록을 제거하고, 설계 §G대로 **기존 블록을 교체**한다.
   중복 정의 10쌍 해소. 삭제 지시된 `.dmove-approval-step-controls .aui-button` 규칙은 실제로 삭제.
4. **죽은 코드 제거**: addStep의 미사용 글리프 버튼 3개 생성 코드 삭제.
5. **지시 외 문구 변경 원복**: 재승인/만료 안내문·모달 lead 등 축약된 5개 문구와 삭제된 설명 주석
   6개를 원문으로 되돌린다 (qa-4b.md에 원문 인용이 있다).

## 완료 기준 (자가 검증·보고 필수)
- `grep`으로 sr-only 요소 내부에 input이 없는지 확인 (label 안에 input 태그 0건).
- ApprovalMarkup.java 최장 라인 길이 200자 미만.
- approval.css에서 같은 셀렉터의 중복 정의 0건 (셀렉터 목록 추출해 uniq 검증).
- `node --check approval.js` 통과, `git diff --check` 통과.

## 코드 스타일
개별 import, statement 한 줄, 중괄호 필수, 재포매팅·압축 금지, 지시 외 변경 금지, 주석 한국어.
