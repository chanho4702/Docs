# 배치 3: 페이지 패널을 상태 pill + 상세 모달로 전환

**시작하기 전에 반드시 `_workspace/design-ui-overhaul.md` 파일을 읽어라.** 이 배치는 그 설계 문서의
패널/JS/CSS 부분을 구현한다. 설계 문서의 클래스명·SVG path·코드 인용을 그대로 따를 것.

## 이 배치에서 수정하는 파일 (이 3개 외에는 절대 손대지 말 것)
- `approval-confluence9/src/main/java/kr/dmove/confluence/approval/c9/panel/ApprovalPagePanel.java`
- `approval-confluence9/src/main/resources/js/approval.js`
- `approval-confluence9/src/main/resources/css/approval.css`

## 구현 범위 (설계 문서 섹션 번호)
1. **§1.3 / §1.4** — 패널 마크업: 배너에는 pill 하나 + 메시지 span만. 단계·타임라인·안내문·
   승인/반려 버튼은 `dmove-approval-modal--detail`로 이동. 요청 없음 상태는 `<span>` pill.
2. **§1.5** — 요청 생성 모달에 `--request` 클래스 추가 (appendRequestDialog 두 갈래 모두).
3. **§1.6** — 상태 아이콘 SVG 상수 6종 (`ICON_PENDING`~`ICON_CARET`) + `iconFor(ApprovalStatus)`.
4. **§3.1~3.7** — approval.js: showMessage 셀렉터 보정, modalOf 삭제, openModal/closeModal
   opener 기억+aria-expanded+포커스 복귀, detail pill 클릭 분기 추가, 요청 트리거 셀렉터를
   `--request`로, syncTriggerVisibility 보정.
5. **§4** — approval.css: 삭제 5블록(4.1), 변경 2블록(4.2), 추가 블록 전량(4.3 — pill/상세 모달/
   타임라인/sr-only). "유지(삭제 금지)" 목록의 클래스는 매크로가 공유하므로 절대 지우지 말 것.
6. **§5** — ApprovalPagePanel.java: renderEmpty(5.1), renderRequest 재구성(5.2), appendPill(5.3),
   appendDetailDialog(5.4), appendTimeline 마크업 교체(5.5), appendRequestDialog 클래스(5.6),
   escape 규칙 표(5.7) 준수.

## 완료 기준 (self-check)
- 배너(모달 밖)에 남는 요소가 pill + `.dmove-approval-message` 뿐이다.
- `.dmove-approval-page-panel__summary/__waiting/__timeline/__actions` 마크업 생성 코드가 panel에서 0건.
- approval.js에서 `querySelector('.dmove-approval-modal')` (수식어 없는 단독 셀렉터)이 0건.
- 동적 문자열(statusLabel, displayName, reason, progressLabel)은 전부 escape() 통과 — §5.7 표 대조.
- `ApprovalRegionMacro`(매크로)는 이 배치에서 수정하지 않는다. 매크로가 공유하는 CSS 클래스
  (`.dmove-approval-status*`, `.dmove-approval-steps`, `.dmove-approval-step*`, `.dmove-approval-notice*`,
  `.dmove-approval-page-panel__count`, `__version`)는 그대로 남아 있어야 한다.

## 코드 스타일 (필수 준수)
- 개별 import만 사용, 와일드카드 금지. statement 한 줄에 하나, 중괄호 항상.
- 기존 파일 재포매팅·한 줄 압축 금지. 지시된 변경 외 수정 금지.
- 주석은 한국어, 기존 스타일(왜를 설명) 유지.
