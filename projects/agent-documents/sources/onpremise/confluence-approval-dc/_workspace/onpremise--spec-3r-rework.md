# 배치 3 재작업: QA Major 2건

워킹트리(커밋 05f536e 이후)에 배치 3이 적용되어 있다. 아래 2건만 수정한다. 다른 변경 금지.

## M-1: openModal 포커스 우선순위 (approval.js)

현재:
```js
var focusable = modal.querySelector(
    '[data-approval-autofocus], input, select, .dmove-approval-modal__close');
```

문제: querySelector는 셀렉터 리스트를 **문서 순서**로 매치하므로 우선순위가 무시되고
헤더의 × 버튼이 먼저 잡힌다. 요청 모달의 "승인자 검색창 자동 포커스"가 회귀했다.

변경 (|| 체인으로 우선순위 강제):
```js
var focusable = modal.querySelector('[data-approval-autofocus]')
    || modal.querySelector('input, select')
    || modal.querySelector('.dmove-approval-modal__close');
```

## M-2: pill의 aria-label 제거 (ApprovalPagePanel.java)

현재 appendPill이 만드는 버튼에 `aria-label="승인 상태 상세 보기"`가 있다.
aria-label은 접근 가능한 이름을 **대체**하므로 상태 라벨·"2/3단계"·sr-only "재승인 필요"가
스크린리더에 전혀 읽히지 않는다.

변경: pill 버튼에서 `aria-label` 속성만 제거한다 (aria-haspopup/aria-expanded는 유지).
버튼의 이름은 내용(상태 라벨 + 단계 + sr-only 텍스트)에서 나온다.
대신 상세 열기 힌트가 필요하면 `title="클릭하면 상세를 봅니다"` 를 추가해도 된다 — 선택.

## 완료 기준
- `node --check approval.js` 통과.
- 다른 라인 변경 없음 (git diff로 2개 지점만).

## 코드 스타일
재포매팅 금지, 지시 외 변경 금지.
