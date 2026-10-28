# A — RT-3 FE

## 판정

**반려**

경계 음영, null 처리, 내보내기 재계획은 계약과 일치하지만, 경계가 있는 동안 숨겨야 하는 예산 정보가 일부 계속 노출됩니다.

## 🔴 필수

- `src/pages/application-monitoring/slo/ApmSloDetailPage.tsx:453-463`
  - `budgetWithheld`여도 상단의 `errorBudgetUsed / errorBudgetTotal`, `burn1h / burn6h`가 그대로 표시됩니다.
  - 요청서의 “경계가 하나라도 있으면 번다운·예산 숫자 숨김”과 불일치합니다.
  - 수정안: `budgetWithheld`이면 두 항목 모두 `—`로 표시하고 `budget_withheld` 안내를 연결하십시오.

- `src/pages/application-monitoring/slo/ApmSloDetailPage.tsx:497-508`
  - 번다운은 `budgetWithheld`로 숨기지만 예산 게이지는 항상 `gaugeOption`을 렌더링합니다.
  - 수정안: 경계가 있으면 게이지도 제거하고, 일반 “데이터 없음”이 아니라 `budget_withheld`/`budget_withheld_hint` 안내를 표시하십시오.

- `src/__tests__/ApmSloPage.test.tsx:786-824`
  - 현재 테스트는 음영과 번다운 숨김만 확인해서 위 누락을 잡지 못합니다.
  - 수정안: 앞 경계·뒤 경계 각각에 대해 상단 예산/소진율이 `—`이고 게이지 숫자·바늘이 렌더링되지 않는다는 assertion을 추가하십시오.

## 🟡 권장

- `src/__tests__/ApmExportButton.test.tsx:904-979`
  - 좁힌 뒤 BE가 경계를 `null`로 반환하는 경우와 복원은 고정되어 있지만, 경계가 더 뒤로 이동하거나 같은 값으로 남는 재계획 흐름은 component 수준에서 고정되지 않았습니다.
  - 수정안:
    - 첫 계획 `B1`, 재계획 `B2 > B1`: 두 번째 “B2부터 받기”가 표시되는지 확인.
    - 재계획 경계가 `B1` 그대로: 경고는 유지되고 반복 버튼은 사라지며 다운로드는 가능한지 확인.

## 🟢 참고

- `src/pages/application-monitoring/slo/apmSloDisplay.ts:395-402`
  - 앞쪽 `[from, untrustedBeforeMs)`과 뒤쪽 `[incompleteFromMs, to)`을 차트 범위로 클리핑합니다. `from`·`to` 경계의 off-by-one은 없습니다.

- `src/pages/application-monitoring/slo/apmSloDisplay.ts:374-379`
  - 앞/뒤 경계 중 하나만 있어도 `budgetWithheld=true`가 되므로 경계 판정 자체는 맞습니다.

- `src/pages/application-monitoring/shared/apmExport.ts:133-139`
  - `untrustedBeforeMs >= toMs`를 전체 미검증으로 보는 것은 반개구간 `[from,to)` 계약과 일치합니다.

- `src/pages/application-monitoring/shared/components/ApmExportModal.tsx:139-171,542-588`
  - 좁히기는 `from`만 변경해 plan을 다시 요청하고 원래 기간 복원도 지원합니다. 경고가 있어도 다운로드를 허용하는 계약도 지킵니다.

- `src/pages/application-monitoring/slo/apmSloDisplay.ts:340-351`
  - 사유를 `sliPct === null`일 때만 표시하는 조건은 BE의 행·캘린더 계약과 일치합니다.

- kr/en 추가 키는 서로 대응하고, 추가 고객 문구에서 검수번호·`§`·HTML은 발견되지 않았습니다. `LEGACY_UNVERIFIED`와 `ROLLUP_INCOMPLETE` 문구도 “기다려도 안 채워짐”과 “나중에 채워짐”을 구분합니다.

# B — 알람 이력 FE

## 판정

**반려**

알람 이력 탭 구현은 대체로 계약과 맞지만, 개요·홈 위젯이 BE 단위 2·3의 최종 DTO를 수용하지 않았고 홈 위젯의 삭제 표시 테스트도 실제 삭제 플래그를 검증하지 않습니다.

## 🔴 필수

- `src/types/apm.ts:518-538,3145-3161`
  - 현재 BE 정본은 개요와 홈 위젯 알람 모두 `serviceDeleted`, `ruleDeleted`, `scope`를 필수로 반환합니다.
  - FE는 개요에서 `serviceDeleted?`만 받고, 홈 위젯에서는 세 필드를 모두 누락했습니다.
  - 근거: BE `ApmOverviewDto.java:129-144`, `ApmAlertsWidgetDto.java:32-46`.
  - 수정안:
    - `TApmOverviewAlert`와 `TApmAlertsWidget.alerts[]`에 `scope`, `ruleDeleted`, `serviceDeleted`를 추가.
    - BE 단위 1~3과 함께 반영하는 최종 상태에서는 `serviceDeleted`를 optional이 아닌 필수로 선언.

- `src/pages/application-monitoring/overview/components/ApmRecentAlertsCard.tsx:108-140`
  - SYSTEM 여부를 `serviceUid` 유무로 추정하며 BE의 정본인 `scope`를 사용하지 않습니다.
  - 또한 `serviceDeleted`가 없는 응답은 UID가 있으면 서비스 상세 링크를 생성합니다. BE 단위 1만 배포된 과도 상태에서는 삭제된 서비스의 snapshot UID로 404가 날 수 있습니다.
  - 수정안: `scope === "SYSTEM"`을 먼저 판정하고, `serviceDeleted`이면 링크를 만들지 않도록 하십시오. B는 BE 단위 1~3과 원자적으로 배포해야 합니다.

- `src/pages/home/widgets/apm/ApmAlertsWidget.tsx:84-89`
  - SYSTEM 여부를 `displayName == null`로 추정합니다. `scope`가 정본이라는 계약을 소비하지 않습니다.
  - 삭제된 서비스도 이름만 표시하고 “삭제된 서비스” 표시는 하지 않습니다.
  - 수정안: `scope === "SYSTEM"`일 때만 시스템 문구를 사용하고, `serviceDeleted`이면 snapshot 이름/UID와 `deleted_service` 태그를 표시하십시오. 현재 위젯에는 서비스 링크가 없어 404 위험은 없습니다.

- `src/__tests__/ApmHomeWidgets.test.tsx:280-303`
  - 테스트 이름은 “삭제된 서비스”지만 fixture에 `serviceDeleted: true`나 `scope`가 없습니다. 실제로는 “UID와 이름이 있는 일반 행”만 검증합니다.
  - 수정안:
    - `serviceDeleted: true`, `scope: "SERVICE"`를 명시하고 삭제 태그를 검증.
    - `scope: "SERVICE"`이면서 `displayName: null`인 행이 “시스템”으로 오인되지 않는 경우 추가.
    - `scope: "SYSTEM"`인 행만 시스템으로 표시되는 경우 추가.

- `src/__tests__/ApmOverviewPage.test.tsx:531-558`
  - “필드가 없으면 UID로 링크한다”는 테스트가 위험한 과도 상태를 고정합니다.
  - 수정안: BE 단위 1~3 원자 반영을 전제로 이 호환 테스트를 제거하고, 필수 `serviceDeleted=false/true` 양쪽의 링크 유무를 고정하십시오.

## 🟡 권장

- `src/pages/application-monitoring/incidents/__tests__/ApmIncidentsPage.test.tsx:480-493`
  - 살아 있는 일반 규칙 링크만 검증합니다.
  - 수정안: `SLO_BURN_RATE_*`와 `ARCHIVE_HOLD` 또는 collector 계열 SYSTEM 규칙의 `ruleUid`도 같은 규칙 화면으로 연결되는지 parameterized test를 추가하십시오.

- 개요·홈 위젯에서도 `ruleDeleted`를 표시할지는 화면 밀도에 따른 제품 선택입니다. 표시하지 않는다면 적어도 타입에는 수용하고, “삭제 표시”가 전체 화면 공통인지 알람 이력 탭 한정인지 고객 도움말 범위를 명확히 하십시오.

## 🟢 참고

- `src/pages/application-monitoring/incidents/tabs/ApmAlertEventsTab.tsx:146-210`
  - 삭제된 규칙·서비스는 태그를 표시하고 링크를 제거합니다. 살아 있는 항목만 링크하며 SYSTEM은 별도로 처리합니다.

- `src/pages/application-monitoring/incidents/tabs/ApmAlertEventsTab.tsx:249-269`
  - 열린 이벤트는 `—`, 해소됐지만 사유가 null이면 “기록 없음”, 알려진 7개 사유는 번역, 미래의 미지 코드는 원문으로 표시합니다. null 및 forward compatibility 처리가 맞습니다.

- 해소 사유 7종은 BE `ApmAlertEventDto.java:73-76`과 일치합니다. “감시 대상에서 빠짐”, “기록 없음” 및 정상 복구가 아님을 설명하는 tooltip도 의미가 정확합니다.

- kr/en 추가 키는 대응하며, 추가 고객 문구에서 검수번호·`§`·HTML은 발견되지 않았습니다.

- `git diff --check`에서 내용 오류는 없었고 A 작업 트리의 일부 LF→CRLF 경고만 확인됐습니다. 요청서에 적힌 테스트 결과는 정적 검수 근거로 사용했으며 별도 재실행은 하지 않았습니다.

## 의견 요청 답

1. **A — 같은 행·캘린더 레코드에서 `LEGACY_UNVERIFIED`와 non-null SLI를 함께 보내는 경로는 현재 없습니다.**  
   `ApmSloCalculator.java:481-485`에서 coverage가 불완전하면 `Measured.incomplete`를 반환하고, `:353-360`에서 `Counted.EMPTY`이므로 SLI가 null입니다. `unknownReason()`은 `:1010-1023`에서 이 경우 `LEGACY_UNVERIFIED`를 반환합니다. 따라서 FE의 “SLI null일 때만 사유 표시”가 맞습니다.  
   다만 series 전체에서는 앞 경계와 경계 이후의 non-null SLI point가 함께 올 수 있습니다. 이는 사유 코드가 붙은 동일 레코드가 아니라 신뢰 가능한 suffix point입니다.

2. **A — 현재 구현은 재계획 후 경계가 남아도 안전하게 처리합니다.**
   - 같은 경계가 남음: 경고 유지, 반복 좁히기 버튼 제거, 다운로드 허용.
   - 더 뒤의 경계로 이동: 새 경계부터 받기 버튼을 다시 표시.
   - `to` 이상: 전체 기간 미검증으로 표시하고 버튼 없음.
   - 경계가 사라짐: 경고 제거.  
   구현은 맞지만 이 흐름을 component test로 추가해야 합니다.

3. **B — 맞습니다. B 전체 diff는 BE 단위 1~3과 함께 반영해야 합니다.**  
   단위 1만 있는 상태에서는 개요·홈 DTO에 삭제 플래그가 없으므로 snapshot UID를 살아 있는 서비스로 오인해 개요 카드가 404 링크를 만들 수 있습니다. 알람 이력 탭 부분만 분리한다면 단위 1과 먼저 반영할 수 있지만, 현재 묶음 그대로라면 단위 1~3 원자 반영이 안전합니다.

4. **B — 살아 있는 SLO burn 규칙과 SYSTEM 규칙의 링크도 유효합니다.**  
   BE 규칙 목록은 `ApmAlertService.java:143-151`에서 `rules.findAll()`을 사용해 해당 규칙들을 제외하지 않습니다. FE 규칙 탭도 `ApmAlertRulesTab.tsx:61,309-319`에서 전달된 `ruleUid`를 찾아 강조합니다. 삭제된 규칙은 이미 링크를 제거하므로 맞습니다. 다만 SLO/SYSTEM 종류별 테스트가 없어 권장 항목처럼 고정하는 편이 안전합니다.
