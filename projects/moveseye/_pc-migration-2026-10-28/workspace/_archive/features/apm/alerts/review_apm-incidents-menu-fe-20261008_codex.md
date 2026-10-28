## 판정

**조건부 승인**

권한 가드, 리다이렉트, `open` 쿼리 키, 관련 i18n 정합성은 전반적으로 맞습니다. 다만 사용자에게 잘못된 상태를 보여 주거나 페이징 결과를 겹치게 할 수 있는 필수 수정 3건이 있습니다.

## 🔴 필수

1. 요청 걸림의 `open=1` 빈 상태 문구가 BE 계약과 모순됩니다.

   - 근거: [ApmAlertStuckTab.tsx](C:/solutions/moveseyee_fe/src/pages/application-monitoring/incidents/tabs/ApmAlertStuckTab.tsx:183)는 `openOnly` 여부와 관계없이 `apm.alerts.stuck.empty`를 씁니다.
   - 현재 문구: [kr.json](C:/solutions/moveseyee_fe/src/locales/kr.json:2557) `"이 기간에 임계를 넘긴 요청이 없습니다."`
   - `open=1`이면 BE가 시간 창을 무시하므로, 빈 상태는 “지금 걸려 있는 요청이 없습니다”여야 합니다.
   - 수정안: `openOnly ? "apm.incidents.empty_stuck_open" : "apm.alerts.stuck.empty"`로 분기하고 kr/en 키와 테스트를 추가하십시오.

2. “최근 알람/전체 이력” 링크가 기본 `open=true`로 이동해 해소된 알람을 찾지 못할 수 있습니다.

   - 근거: [routes.ts](C:/solutions/moveseyee_fe/src/constants/routes.ts:242)의 `apmAlertEventsPath()`에는 `open=0`이 없습니다. 반면 [ApmAlertEventsTab.tsx](C:/solutions/moveseyee_fe/src/pages/application-monitoring/incidents/tabs/ApmAlertEventsTab.tsx:69)는 `open`이 없으면 열린 알람 전용으로 해석합니다.
   - [ApmRecentAlertsCard.tsx](C:/solutions/moveseyee_fe/src/pages/application-monitoring/overview/components/ApmRecentAlertsCard.tsx:128)의 개별 행에는 이미 해소된 알람도 포함될 수 있는데, 클릭 후 대상이 목록에서 사라집니다. 같은 문제는 “전체 이력” 링크([155행](C:/solutions/moveseyee_fe/src/pages/application-monitoring/overview/components/ApmRecentAlertsCard.tsx:155))에도 있습니다.
   - 수정안: `apmAlertEventsPath()` 또는 별도 `apmAlertHistoryPath()`가 `open=0`을 붙이도록 하십시오. 메뉴 자체 `/incidents` 진입만 기본 `open=true`로 유지하는 것이 가장 자연스럽습니다.
   - 문구만 “장애 및 에러”로 바꾸는 것은 개별 해소 알람 링크 문제를 해결하지 못합니다.

3. 임의 `offset`을 정확히 조회하지만 페이지 UI는 배수라고 가정하여 행이 겹칠 수 있습니다.

   - 근거: 알람·걸림 탭은 URL의 숫자를 그대로 API에 전달합니다([ApmAlertEventsTab.tsx](C:/solutions/moveseyee_fe/src/pages/application-monitoring/incidents/tabs/ApmAlertEventsTab.tsx:66), [ApmAlertStuckTab.tsx](C:/solutions/moveseyee_fe/src/pages/application-monitoring/incidents/tabs/ApmAlertStuckTab.tsx:57)).
   - 공용 [DmoveTable.tsx](C:/solutions/moveseyee_fe/src/components/Table/DmoveTable.tsx:114)는 `Math.floor(offset / limit)`으로 페이지 번호를 만듭니다. `offset=25&limit=20`이면 26번째 행부터 받으면서 2페이지로 표시되고, 다음 페이지는 `offset=40`([122행](C:/solutions/moveseyee_fe/src/components/Table/DmoveTable.tsx:122))이 되어 일부 행이 겹칩니다.
   - 수정안: 페이지 번호 UI를 유지한다면 최초 진입 시 `offset`을 `Math.floor(offset / limit) * limit`로 정규화하여 URL과 요청을 함께 `replace`하십시오. 임의 offset 보존이 제품 요구라면 이 두 탭에 `offset ± limit` 기반 이전/다음 컨트롤이 필요합니다.

## 🟡 권장

1. 권한 설명 주석이 실제 가드와 어긋납니다.

   - [ApmAlertRulesPage.tsx](C:/solutions/moveseyee_fe/src/pages/application-monitoring/alert-rules/ApmAlertRulesPage.tsx:64)는 직접 URL로 들어오면 `apm.view`로 진입한다고 설명하지만 실제 라우트는 `permissionAxis="edit"`입니다.
   - [useApmAlerts.ts](C:/solutions/moveseyee_fe/src/hooks/useApmAlerts.ts:24)도 파일의 모든 훅이 관리 축이라고 설명하지만 `useApmAlertEvents`와 `useApmStuckRequests`는 이제 읽기 축입니다.
   - 수정안: 규칙·Zabbix 훅은 edit, 이벤트·걸림 훅은 view라는 현재 계약으로 주석을 정리하십시오.

2. 알람/걸림 탭의 `open` 기본값 차이는 동작상 허용 가능하지만 지속적으로 테스트해야 합니다.

   - 탭 전환 시 [ApmIncidentsPage.tsx](C:/solutions/moveseyee_fe/src/pages/application-monitoring/incidents/ApmIncidentsPage.tsx:89)가 `open`과 `offset`을 제거하므로 상태가 섞이지 않습니다.
   - 다만 같은 URL 키에서 “없음”의 뜻이 반대이므로, 현재 테스트를 회귀 방지선으로 유지해야 합니다.

## 🟢 참고

- `ApmAlertLegacyTabRedirect`는 데이터 컴포넌트를 렌더링하지 않고 `<Navigate replace>`만 반환하므로 가드 밖 배치가 보안상 문제를 만들지 않습니다. 최종 incidents 라우트에는 `APPLICATION_MONITORING` 권한과 `FeatureGate("APM")`가 모두 있습니다.
- `/application-monitoring/alert-rules?tab=events`의 2단 이동은 두 단계 모두 `replace`이고 쿼리·해시를 보존하며 무한 루프가 없습니다.
- `/errors` 리다이렉트에서 기존 `tab`을 버리는 것은 맞습니다. 이 주소 자체의 의미가 에러 분석이므로 `tab=errors`로 강제해야 합니다.
- `useApmAlertEvents` 쿼리 키에 `open`을 추가한 것은 올바릅니다. 첫 요소 `APM_QUERY_KEYS.ALERT_EVENTS`는 그대로라 [useApmRefresh.ts](C:/solutions/moveseyee_fe/src/hooks/useApmRefresh.ts:9)의 접두어 판정도 계속 모든 open 모드를 잡습니다.
- 관련 kr/en 신규 키 집합은 일치하고, 제거한 `apm.alerts.tab.events/stuck`의 잔존 사용처는 없습니다. 변경된 고객 문구에도 검수번호·`§`·HTML 태그가 없습니다.
- 브레드크럼과 page-guide는 자체 권한 필드가 없는 표시 메타데이터이며, 보호된 incidents 경로를 통해서만 렌더링됩니다. 실제 진입점인 데스크톱·모바일·검색·라우트는 모두 `DmovePermissionsKey.APPLICATION_MONITORING`으로 일치합니다.

## §4 질문 답

1. **가드 밖 리다이렉트는 허용 가능합니다.** 데이터 노출이 없고 최종 목적지에서 view 권한과 APM 라이선스를 다시 검사합니다. 2단 리다이렉트도 정상입니다.

2. **서로 다른 기본값은 허용 가능합니다.** 탭 전환 때 `open`을 제거해 각 탭 기본값으로 재설정하므로 기술적으로 일관됩니다. 다만 동일 키의 부재 의미가 반대인 만큼 테스트와 문구 분기를 유지해야 합니다.

3. **쿼리 키 변경은 맞습니다.** 캐시는 open/history 모드별로 분리되고, 첫 키 기반 무효화·수동 갱신에는 영향이 없습니다.

4. **옛 `/errors`의 `tab` 제거가 맞습니다.** 다른 쿼리와 해시는 보존되며, `tab`만 `errors`로 강제해야 주소 의미가 안정적입니다.

5. **“장애 및 에러”로 문구만 바꾸는 것은 권장하지 않습니다.** 우선 이력 링크에 `open=0`을 붙여 실제 “전체 이력”으로 보내는 것이 맞습니다. 메뉴 랜딩으로 보내기로 결정한다면 `alerts_all`, 각주, 도움말의 “전체 이력/Full history” 표현을 모두 함께 바꿔야 합니다.

## 테스트 공백

- `open=1`인 요청 걸림 탭의 빈 상태 문구 검증이 없습니다.
- `offset=25&limit=20` 같은 비배수 딥링크와 다음 페이지 전환 검증이 없습니다.
- 해소된 최근 알람 링크가 `open=0` 이력으로 이동하는지 검증이 없습니다.
- 신규 리다이렉트 테스트는 콘솔 경로부터 시작하므로 `/application-monitoring/alert-rules`부터의 실제 2단 이동 전체를 고정하지 않습니다.
- 탭 테스트가 `useQueryParams`를 mock하여 실제 URL 변경·리렌더·쿼리 보존을 검증하지 않습니다.
- view-only/no-view 계정과 APM 라이선스를 조합한 실제 Router 런타임 및 브라우저 검증이 없습니다.
- 지정된 기존 실패 8건은 이번 판정의 회귀로 계산하지 않았습니다.
