## 판정

**승인**

Claude의 원칙 정정에 동의합니다. 1·2차의 “series 경계가 있으면 행 DTO 기반 상단·게이지·burn도 숨긴다”는 지적은 철회합니다. 이번 3차 diff는 BE 계약에 맞습니다.

## 원칙 판단

- 행 DTO의 rolling window는 [ApmSloService.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/slo/ApmSloService.java:128)에서 측정합니다. coverage가 불완전하면 [ApmSloCalculator.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/slo/ApmSloCalculator.java:481)가 `Measured.incomplete`와 `Counted.EMPTY`를 반환하므로 예산은 null이 됩니다.
- burn은 rolling window와 별도로 5m·30m·1h·6h를 측정하며, 네 창 중 하나라도 미검증이면 전부 null입니다. 반대로 네 창이 모두 업그레이드 이후이면 rolling window가 `LEGACY_UNVERIFIED`여도 burn은 non-null일 수 있습니다. 근거는 [ApmSloCalculator.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/slo/ApmSloCalculator.java:521)입니다.
- 행 DTO 조립도 rolling 예산과 burn 값을 독립적으로 싣습니다. [ApmSloService.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/slo/ApmSloService.java:455)
- series는 사용자가 선택한 `from/to`로 별도 계산하며, 그 기간에 앞·뒤 경계가 있으면 series의 `errorBudgetTotal`과 모든 `budgetRemainingPct`만 null입니다. [ApmSloService.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/slo/ApmSloService.java:229) [계약서](/C:/solutions/_workspace/features/apm/hardening-20261006/contract_apm-late-rollup-20261006.md:82)
- 따라서 90일 series가 업그레이드 경계를 포함하더라도 최근 30일 rolling 예산이나 최근 6시간 burn은 검증된 값일 수 있습니다.

FE 반영도 이 구분과 일치합니다.

- 상단 예산 분수·게이지는 행 DTO의 null만 따릅니다. [ApmSloDetailPage.tsx](/C:/solutions/moveseyee_fe/src/pages/application-monitoring/slo/ApmSloDetailPage.tsx:392)
- `errorBudgetTotal=null`이면 `errorBudgetUsed=0`을 노출하지 않고 분수 전체를 `—`로 처리합니다. [apmSloDisplay.ts](/C:/solutions/moveseyee_fe/src/pages/application-monitoring/slo/apmSloDisplay.ts:355)
- burn은 BE 값을 그대로 표시하며 `LEGACY_UNVERIFIED + burn non-null`도 숨기지 않습니다.
- `budgetWithheld`는 번다운과 시계열 표의 예산 열에만 적용됩니다. [ApmSloDetailPage.tsx](/C:/solutions/moveseyee_fe/src/pages/application-monitoring/slo/ApmSloDetailPage.tsx:353) [ApmSloDetailPage.tsx](/C:/solutions/moveseyee_fe/src/pages/application-monitoring/slo/ApmSloDetailPage.tsx:575)

테스트는 핵심 의도를 고정합니다.

- 앞·뒤·양쪽 series 경계에서도 행 값이 유지됨.
- 행 DTO가 null이면 상단·게이지·burn 카드·목록이 `—`와 사유를 표시함.
- `LEGACY_UNVERIFIED + burn non-null` 반례에서 burn은 표시하고 예산만 `—`로 유지함.
- series pending 중에도 행 값을 숨기지 않음.
- 내보내기 경계 이동·동일 경계 재계획도 고정됨.

`typecheck:contract`와 전체 `tsc --noEmit`은 통과했습니다. Jest 독립 재실행은 읽기 전용 sandbox가 `%TEMP%\jest` haste-map 생성을 `EPERM`으로 막아 재현하지 못했지만, 보고된 4 suite 151건 결과와 테스트 assertion을 정적으로 확인했습니다.

## 🔴 필수

없음.

## 🟡 권장

- series에 경계는 없지만 무트래픽 등으로 `errorBudgetTotal=null`인 경우는 아직 별도 안내가 없습니다. 현재 `budgetWithheld=false`이고 point 행이 존재하면 빈 번다운과 빈 예산 열이 표시될 수 있습니다. `series.errorBudgetTotal === null`이면서 경계가 없는 테스트와 일반 “예산 계산 불가” 상태를 추가하면 null 계약이 더 완전해집니다. [ApmSloDetailPage.tsx](/C:/solutions/moveseyee_fe/src/pages/application-monitoring/slo/ApmSloDetailPage.tsx:353)

- 과거 캘린더 값은 BE가 rolling·1h·6h를 독립적으로 null 처리하므로 `budgetRemainingPct=null`이지만 burn은 non-null인 조합도 가능합니다. 현재 안내는 세 값이 모두 null일 때만 붙습니다. 수치 자체는 정확하지만, 부분 조합별 안내 테스트를 보강할 가치가 있습니다. [ApmSloSnapshotService.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/slo/snapshot/ApmSloSnapshotService.java:215) [apmSloDisplay.ts](/C:/solutions/moveseyee_fe/src/pages/application-monitoring/slo/apmSloDisplay.ts:443)

## 🟢 참고

- 제공된 `rt3-fe-r3.diff`와 현재 FE 작업 트리는 patch-id 기준으로 동일합니다.
- `git diff --check` 내용 오류는 없으며 기존 LF→CRLF 경고만 있습니다.
- 검수 과정에서 파일을 수정하지 않았습니다.
