검토 결과, 방향 자체는 타당하지만 현재 v0대로 구현하면 일부 경로는 여전히 과부하가 나고 H4는 불필요한 상세 조회를 유지합니다. HEAD `8fa5ec2` 기준이며 파일은 수정하지 않았습니다.

- R1 · 필수 · 근거(`devdesign_zm-159-c8-group-alert-scan.md:11,29-33`, `ZabbixCallLimits.java:48-60`, `ZabbixQueryExecutor.java:303-355`) · 설계 자체가 H2-a의 30일 규모를 3천만 행으로 잡으면서 스캔 예산은 500만 행으로 제안한다. 1만 행 페이지라면 3천 호출인데 기존 `max-calls=2,000`에도 걸린다. 즉 행 예산을 올려도 완료할 수 없다. H2-a/H4는 행 스캔 대신 `event.get countOutput` 기반 기간×severity 집계로 바꾸고, 실제 스캔이 필요한 H2-b/H3만 행·호출·시간 예산을 함께 산정해야 한다.

- R2 · 필수 · 근거(`devdesign_zm-159-scale-call-guard.md:207-208`, `HostService.java:1147-1165`, `useGroupAlertTrend.ts:27-42`, `useTemplateInfo.ts:32-51`) · 상위 설계는 H2 집계를 “기간 창 분할 + 건수는 countOutput”으로 정했는데 C8 v0은 다시 모든 이벤트를 흘려보내며 센다. H2-a는 버킷×severity 숫자만, H4의 실사용 값도 `statusCounts`뿐이므로 전 행 전송은 과잉이다. `countHistoryBySeverity(group, range)` 또는 버킷별 count API를 포트에 두고, H2-a/H4는 행을 받지 않는 구조로 되돌리는 것이 맞다.

- R3 · 필수 · 근거(`useHome.ts:18-33,79-101`, `HostService.java:373-405`, `devdesign_zm-159-c8-group-alert-scan.md:38`) · H3는 홈에서 최근 30일 데이터를 60초마다 재조회한다. 스트리밍은 힙만 줄일 뿐, 수백 회 RPC가 매분 반복되는 부하는 그대로다. 완전 결과만 Redis에 캐시하고 기간을 분 단위로 정규화하거나, 홈 5개 그룹용 별도 소량 집계 경로를 마련해야 한다. 불완전 결과는 캐시하지 않는 규칙도 명시해야 한다.

- R4 · 필수 · 근거(`HostService.java:522-544`, `devdesign_zm-159-c8-group-alert-scan.md:15,41-44`, `useTemplateInfo.ts:32-51`) · H4는 이벤트만 제한해도 먼저 실행되는 `host.get`이 그룹 전체 호스트에 `selectTags=extend`와 전체 interfaces를 붙여 받는다. 이 호출은 여전히 무제한이며 64MiB 응답 제한에 걸릴 수 있다. FE가 실제 쓰는 것은 그룹 이름과 `statusCounts`뿐이므로 H4에서 호스트·카테고리·상세 목록 조회를 제거하는 것이 우선이다. 계약 shape가 필요하면 미사용 필드는 명시적인 기본값으로 채우거나 버전 계약으로 폐기해야 한다.

- R5 · 필수 · 근거(`devdesign_zm-159-c8-group-alert-scan.md:41,44`, `HostService.java:536-544`, `ZabbixAlertAdapter.java:570-574`) · “최신 1,000건”을 원시 경로에서 `limit`만 붙여서는 최신성이 보장되지 않는다. 현재 원시 H4 쿼리에는 `sortfield`/`sortorder`가 없고, 포트 경로만 `clock DESC`를 명시한다. 목록을 남긴다면 `sortfield=eventid 또는 clock`, `sortorder=DESC`와 동점 키를 명시해야 한다.

- R6 · 필수 · 근거(`ZabbixCallLimits.java:56-60`, `HostService.java:560-591`, `devdesign_zm-159-c8-group-alert-scan.md:41,44`) · 최신 1,000건의 trigger/recovery ID를 한 번에 후속 조회하면 `event.get`·`trigger.get`의 `max-ids=500` 정책을 우회한다. trigger ID뿐 아니라 recovery ID도 distinct한 뒤 500개 이하로 분할하고, 모든 청크가 하나의 논리 조회 예산과 실패 계약을 공유해야 한다.

- R7 · 필수 · 근거(`AlertHistoryQuery.java:46-55,114-120,146-152`, `HostService.java:1147-1151`, `ReportService.java:198-200`, `devdesign_zm-159-c8-group-alert-scan.md:39-41`) · H2-a/H2-b 설계는 “경량”을 요구하지만 현재 `ofGroupWindow()`는 `lightOutput=false`다. 구현자가 기존 팩토리를 그대로 쓰면 다시 `extend` 전량 조회가 된다. `ofGroupWindowForScan(groupId, range, includeEntities)` 같은 명시적 팩토리와 query 캡처 테스트를 설계에 포함해야 한다.

- R8 · 필수 · 근거(`devdesign_zm-159-c8-group-alert-scan.md:21-25`, `AlertHistoryQuery.java:30-35`, `AlertPort.java:70-76`) · `scanHistory`의 default가 `listHistory` 한 번을 호출하고 완전으로 판정하면 스트리밍·완전성 보장이 깨진다. 현재 `limit=0`은 단일 RPC 무제한이므로 다른 어댑터가 override하지 않으면 OOM 경로가 되살아난다. `scanHistory`는 abstract로 두어 구현을 강제하고, `includeActions=true`, `beforeNativeId!=null`, `limit!=0`은 “무시”하지 말고 `BAD_QUERY`로 거부해야 한다. 특히 `limit`은 현재 계약상 안전장치이므로 조용히 무시하면 안 된다.

- R9 · 권장 · 근거(`ZabbixQueryExecutor.java:324-348`, `ZabbixScanResult.java:30-33`, `devdesign_zm-159-c8-group-alert-scan.md:23,33`) · `AlertScanOutcome.alertsSeen`의 의미가 불명확하다. executor의 `rowsSeen`은 예산/시간 초과로 consumer에 전달되지 않은 마지막 페이지도 포함할 수 있다. `receivedRows`와 `deliveredAlerts`를 구분하거나, 어댑터가 실제 consumer 전달 건수를 별도로 세어 반환해야 한다.

- R10 · 필수 · 근거(`Alert.java:23-25`, `HostService.java:376-377,415-423`, `HostGroupProblemScanTest.java:68-111`) · H3에서 하나의 알람이 같은 그룹의 호스트 둘에 걸리면 해당 그룹에 두 번 집계된다. 모델 문서는 다중 호스트 알람을 명시하지만 테스트는 “한 호스트가 두 그룹에 속한 경우”만 검증한다. 이벤트마다 대상 `groupId`를 distinct한 뒤 그룹당 한 번만 누적하고, “같은 그룹의 호스트 2개 + 겹치는 다른 그룹” 회귀 테스트를 추가해야 한다.

- R11 · 권장 · 근거(`ZabbixAlertAdapter.java:570-581`, `ReportService.java:204-224`, `devdesign_zm-159-c8-group-alert-scan.md:20,40`) · H2-b의 “동점 Top 호스트 순서 불변”은 현재 설계로 보장되지 않는다. 기존은 `clock DESC` 결과를 역순회하지만 신규는 `eventid ASC`이며, 설계도 eventid를 발생 시각과 “≈” 관계로만 정의한다. encounter order에 의존하지 않도록 Top 호스트 정렬에 `hostName ASC` 같은 명시적 동점 키를 넣거나, 순서 변화임을 계약에 기록해야 한다.

- R12 · 필수 · 근거(`HostService.java:630-647`, `devdesign_zm-159-c8-group-alert-scan.md:41-44`, `event-alert.ts:18-34`) · `statusFilter`와 `recentEvents`를 최신 1,000건 표본 기준으로 만들면서 기존과 같은 필드명으로 반환하면 정확한 전체 결과처럼 보인다. FE 미사용은 조용한 의미 변경의 근거가 되지 않는다. 전체 의미를 보존하거나, 필드를 명시적으로 폐기해 빈/default 값으로 만들고 계약에 남겨야 한다. 표본 값을 기존 필드에 넣는 안은 피해야 한다.

- R13 · 권장 · 근거(`ZabbixQueryExecutor.java:294-297`, `devdesign_zm-159-c8-group-alert-scan.md:46-50`) · 테스트 계획에 실제 설치본의 `eventid_from` 회귀 검증이 빠졌다. executor 코드도 설치본 확인 필요성을 명시한다. 추가로 정확히 페이지 크기와 같은 마지막 페이지, 예산 초과로 마지막 페이지가 미전달되는 경우, consumer 처리 중 deadline 초과, 같은 그룹 다중 호스트 중복, H4 후속 ID 501/1000개 분할을 포함해야 한다.

결정 3개 권고

1. 스캔 행 예산: 후보 (a)를 택하되 초안 그대로는 반대한다. `max-scan-rows`를 보유 행 예산과 분리하는 것은 맞지만, 기본 500만은 설계가 제시한 H2 규모조차 충족하지 못한다. H2-a/H4를 count 경로로 먼저 제거하고, H2-b/H3의 지원 기간과 실측을 기준으로 행·호출·deadline을 함께 정해야 한다. 시간 예산만 두는 (c)는 빠른 서버에서 과도한 행을 읽을 수 있어 부적절하고, 전역 50만을 그대로 쓰는 (b)는 정상 기간도 상시 실패시킬 가능성이 높다.

2. H4 필터 의미 변화: 최신 N건 기준으로 조용히 바꾸는 안은 반대한다. FE가 사용하지 않으므로 `recentEvents`·`statusFilter`를 표본으로 계산할 이유가 없다. 정확한 `statusCounts`와 그룹 이름만 계산하고 미사용 필드는 명시적으로 deprecate/default 처리하는 것이 가장 단순하다. 외부 계약상 보존이 필수라면 전체 기준 필터를 구현해야 하지만, 현재 FE 요구에는 과잉이다.

3. H4 원시 경로 유지: 기본 권고는 유지하지 않는 것이다. 현재 FE 사용 범위에서는 상세 raw event/trigger/recovery와 host tags/interfaces를 전부 제거하고, 중립 포트의 정확한 severity count + 최소 그룹 메타데이터만 쓰면 된다. 상세 목록 호환을 반드시 유지해야 할 때만 별도 Zabbix 상세 포트로 격리하고, 명시적 최신순·ID 분할·distinct·라이선스 가드·예산을 모두 적용해야 한다.