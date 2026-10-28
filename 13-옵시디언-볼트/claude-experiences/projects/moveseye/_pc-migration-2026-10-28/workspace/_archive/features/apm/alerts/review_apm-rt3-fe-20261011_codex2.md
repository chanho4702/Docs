## 판정

**반려**

경계 응답에서도 상세 burn alert 카드와 목록 일부에서 예산·burn 숫자가 남습니다. 현재 테스트는 해당 위치를 검사하지 않아 122건 통과로도 회귀를 잡지 못합니다.

## 🔴 필수

- 상세 화면의 burn alert 카드가 `budgetWithheld`를 전달받지 않습니다. [ApmSloDetailPage.tsx](/C:/solutions/moveseyee_fe/src/pages/application-monitoring/slo/ApmSloDetailPage.tsx:618)에서 `row`만 전달하고, [ApmSloBurnAlertCard.tsx](/C:/solutions/moveseyee_fe/src/pages/application-monitoring/slo/components/ApmSloBurnAlertCard.tsx:101)는 1h·5m·6h·30m 값을 무조건 출력합니다. 경계 테스트에서도 숫자가 있는 `SLO_BREACH_ROW`를 유지하므로 실제로 `2×`, `2.5×`, `1.4×`, `1.2×`가 노출됩니다. `budgetWithheld`일 때 이 카드의 수치도 `—`와 안내 문구로 대체해야 합니다.

- 목록 행에도 경계 시 우회 노출이 남습니다.
  - 기본 SLO 목록은 예산 tooltip에 `errorBudgetUsed / errorBudgetTotal`을 항상 구성하고 burn 값을 그대로 출력합니다. [ApmSloPage.tsx](/C:/solutions/moveseyee_fe/src/pages/application-monitoring/slo/ApmSloPage.tsx:272) [ApmSloPage.tsx](/C:/solutions/moveseyee_fe/src/pages/application-monitoring/slo/ApmSloPage.tsx:320)
  - 서비스 설정의 SLO 목록도 burn 값을 무조건 출력합니다. [ApmServiceSettingsTab.tsx](/C:/solutions/moveseyee_fe/src/pages/application-monitoring/services/detail/tabs/ApmServiceSettingsTab.tsx:211) [ApmServiceSettingsTab.tsx](/C:/solutions/moveseyee_fe/src/pages/application-monitoring/services/detail/tabs/ApmServiceSettingsTab.tsx:219)
  - 전체 rolling window는 `LEGACY_UNVERIFIED`이지만 최근 burn window는 검증되어 숫자가 올 수 있습니다. 현재 테스트는 `SLO_UNKNOWN_ROW` 기반이라 burn 값이 처음부터 모두 `null`이어서 이 반례를 놓칩니다. [ApmSloPage.test.tsx](/C:/solutions/moveseyee_fe/src/__tests__/ApmSloPage.test.tsx:856)
  - `LEGACY_UNVERIFIED`이면서 `errorBudgetUsed=0`, burn 값은 non-null인 행을 만들어 상세 카드와 두 목록 모두 숫자를 숨기는 테스트가 필요합니다.

## 🟡 권장

- `seriesQuery`가 아직 pending이면 `budgetWithheld=false`로 계산되어 상세 row가 먼저 도착했을 때 상단·게이지 숫자가 잠시 보일 수 있습니다. 경계 판정 완료 전까지 예산 영역을 loading/보류 상태로 두는 것을 권장합니다.
- 현재 경계 테스트는 `—`만 확인하고 Tooltip 내용을 직접 고정하지 않습니다. hover 후 `budget_withheld` 안내가 표시되는 assertion을 추가하면 요구사항을 더 정확히 보호합니다.

## 🟢 참고

- 캘린더 tooltip은 날짜·SLI·안내 문구만 출력하므로 예산·burn 숫자 노출은 없습니다. `budget_unverified_note` 테스트도 의도를 고정합니다.
- 내보내기 재계획 테스트는 `B2 > B1`일 때 두 번째 좁히기를 제안하고, `B1` 유지 시 반복 버튼 없이 `B1` 다운로드를 허용하는 흐름을 정확히 검증합니다.
