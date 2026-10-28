## 판정

**승인**

## 🔴 필수

없음.

## 🟡 권장

- [apmAlertDisplay.ts](C:/worktrees/apm-alert-history-fe/src/pages/application-monitoring/shared/apmAlertDisplay.ts:288)의 `scope` 누락 호환 분기와 [해당 테스트](C:/worktrees/apm-alert-history-fe/src/pages/application-monitoring/incidents/__tests__/ApmIncidentsPage.test.tsx:566)는 향후 제거를 권장합니다. 현 BE에서는 `scope`가 필수이므로 정상 응답에는 영향이 없습니다.

## 🟢 참고

- 개요·홈 위젯의 `scope`, `ruleDeleted`, `serviceDeleted`가 필수 타입으로 선언됐고, 두 fixture가 BE `overview.json`·`widget-alerts.json` 표본과 일치합니다.
- grep 결과 알람 이벤트 렌더링 경로는 알람 이력 탭·개요 카드·홈 위젯이며 누락된 화면은 없습니다.
- SYSTEM 판정, 삭제 서비스 링크 차단·태그, `serviceDeleted=false/true`, SERVICE+이름 null, SLO 번/System 규칙 링크가 테스트로 고정됐습니다.
- 제공된 diff와 현재 워크트리 diff의 SHA-256이 일치하며 `git diff --check`도 깨끗합니다.
