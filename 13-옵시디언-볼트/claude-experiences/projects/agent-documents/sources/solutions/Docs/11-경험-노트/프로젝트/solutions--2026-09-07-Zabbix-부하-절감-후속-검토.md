---
tags: [moveseye, zabbix, performance, review]
updated: 2026-09-07
---
# Zabbix 부하 절감 후속 검토

로컬 소스 정적 확인. 운영 배포 여부·실제 설정·호출량은 측정하지 않았다. 코드 변경 없음.

- ZM-123 계열이 이미 구현됨: EventSyncService 증분 기본 15초/보정 5분, HostService 사용자·그룹별 Redis 30초, 홈 30~60초, AdaptiveSeriesQuery 차트 48시간/통계 1시간 trends 전환, history 기본 100,000건 상한, ZabbixClient Apache 풀 기본 10개 및 ZabbixCallMetrics 로그.
- HostService.getServers는 get → null이면 build → set으로 캐시 미스 동시 요청을 합치지 않는다. 후속 우선순위는 single-flight, 만료 직전 비동기 갱신, stale 데이터 시각 표시. 사용자 권한 범위를 유지해야 한다.
- CpuService.getSummary는 최신 사용률·모델·CPU 수·코어 수를 개별 MetricPort 호출로 읽는다. 숫자 메트릭 배치와 메타데이터/최신값 TTL 분리가 후속 후보. ZabbixMetricAdapter는 한 쿼리 안에서 이미 item/history/trend 배치를 하므로 이를 새로 구현해야 한다고 안내하지 말 것.
- 풀 상한은 BE 인스턴스별 클라이언트 동시성이지 클러스터 전체 RPS 또는 Zabbix CPU/DB 부하 상한이 아니다. 여러 인스턴스에는 소스별 분산 호출 예산이 필요하다. 타임아웃 후 Zabbix 내부 쿼리 종료도 보장하지 않는다.
- 운영 문서의 '접속자 수와 부하가 비례하지 않는다/배치 주기당 상수 콜'은 전체 경로 보장으로 읽으면 과장이다. 사용자별 키, 캐시 미스 경쟁, 직접 메트릭 조회가 남는다.
- RAW 100,000건 제한은 반환량 안전장치이며 다중 아이템의 구간 완전성·DB 스캔 비용을 보장하지 않는다. 후속은 예상 포인트 수 기반 조회 예산과 잘림 표시.
- Zabbix Proxy는 수집 부하 분산 장치다. MovesEye API 이력 조회 캐시를 대체하지 않는다.

근거: C:/solutions/moveseye-be-spring, C:/solutions/moveseye-docs/operations/자빅스-성능-책임-경계.md.
공식 문서: https://www.zabbix.com/documentation/7.0/en/manual/config/items/history_and_trends 및 https://www.zabbix.com/documentation/7.0/en/manual/distributed_monitoring/proxies.
관련: [[projects/moveseye/2026-07-28-collector-engine-phase1|2026-07-28-collector-engine-phase1]], [[projects/moveseye/host-group-feature/2026-06-18-monitoring-tabs-perf-review|2026-06-18-monitoring-tabs-perf-review]].

## ZM-123 커밋 대조 후 판단 보정

사용자 요청으로 2026-09-03 커밋을 직접 대조했다. ZM-123 문자열 대신 하위 이슈 ZM-124~131로 커밋됐다. BE master에 관련 15개 커밋이 포함되며 로컬 origin/master보다 15개 앞선다(fetch 미수행이므로 원격 최신 상태·배포 여부는 미확인).
- ZM-124 cf4c951: 심각도 카운트 7콜→1콜.
- ZM-125 7b6d228 및 수정: 알람 목록·벨 DB 사본, 페이지 조치 상세는 별도 호출.
- ZM-126 592f437 및 수정: 목록 30초·가시 호스트 60초 캐시.
- ZM-127 c1a75bd 및 수정: 경량 증분 15초·전체 보정 5분.
- ZM-128 11bd25e/504f5e3, FE ef951b0: 알람 SSE 변경 신호·벨 안전 폴링 5분, 장애 시 60초. 데이터 자체 푸시가 아니라 재조회 신호이며 메트릭 차트 캐시와는 다르다.
- ZM-129 6bf98b7/4073808: 풀·상한·계측.
- ZM-130 24fecff/3b8ef5e, ZM-131 29bf466/922a708: trends 확산·상한·N+1 제거 및 검수 수정.
판단: 일반적인 1차 부하 절감은 이 에픽이 대부분 보완한다. 앞서 제안한 항목은 필수 재작업으로 읽히지 않도록, 추가 계측 후 필요한 경우만 적용하는 후속 후보로 설명해야 한다. 미포함은 캐시 미스 single-flight, 상세 메트릭/메타데이터 캐시, 포인트 수 기반 조회 예산, 다중 BE 전역 호출 제한. 작업 트리에서 다른 세션의 미커밋 수정이 진행 중이므로 커밋 내용과 분리해 판단했다.

## 재정리: 남은 경로와 정확성 우선순위

- EventService의 RECENT 목록은 자체 사본 + hydrateRecentActions 직접 조회, HISTORY 모드는 listHistoryForScreen(최대 20,000) 및 복구·페이지 상세·인벤토리 조회가 남는다. 따라서 알람 UI 전체가 Zabbix 0콜이라는 표현은 부정확하다. SSE는 재조회 신호라 권한별 조치 상세 조회를 증폭할 수 있다.
- 확정 커밋 기준 EventSyncService는 10,000건 상한·페이지 없음, reconcileResolved는 매번 첫 500건이다. 안전 상한과 완전성 보장을 함께 설계해야 한다. 기존 독립 검수 [[projects/moveseye/2026-09-07-logic-review|2026-09-07-logic-review]]와 일치.
- 성능 우선 후보: 캐시 미스 single-flight, 상세 메타데이터 캐시/조회 배치, 조치 상세 필요 시 조회, 과거 이력의 자체 저장 범위 내 조회·캐시. 권한 필터는 유지한다.
- 단일 BE에서도 SSE 2초 선행 throttle에 trailing이 없어 마지막 변경을 놓칠 수 있음(기존 검수 재현 결과). 다중 BE는 별도로 Redis pub/sub와 전체 호출 예산 필요.
- 검토 도중 다른 세션이 ItemsService 상한 감지, AdaptiveSeriesQuery trends 빈 응답 RAW 폴백, 태그 권한·최근 해소 동기화 등을 수정 중. 미커밋·미검증 상태라 해결 완료로 집계하지 않음. RAW 폴백은 장기 조회 부담을 재도입할 수 있어 동일 예산 적용 필요.
- 운영 효과 판단은 배포 커밋·실제 스케줄/Redis 설정 확인 후 기존 zabbix-calls와 Zabbix CPU/DB I/O를 같은 시간대로 비교한다. 코드 정적 검토로 감소율·안전한 사용자 수를 단정하지 않는다.

## 최신 커밋 재확인 결과

BE 1498082(ZM-123 e0eea42/b96e912/ff1822a 포함), FE 8da4251 기준 정적 재대조. review_logic_2026-09-07_codex.md에 재확인 표 추가. R1 recent 정상주기 보완/긴 공백 잔여, R3 상한 경고만 추가, R7 ItemsService만 일부 보완. R2 첫500건 반복·R4 내부/Zabbix 사용자 ID 혼용·R5 is_read conflict 갱신 누락·R6 SSE trailing 부재는 여전히 남음. 테스트 재실행 없음. 앞선 '수정 중' 상태에서 ZM-123 3개 커밋 확정으로 변경됨.

## 모니터링 차트 갱신 방식 확인

useCpuChart/useMemoryChart → useChartOption → usePeriodTimes 경로 확인. 상대 기간은 기본 180,000ms마다 분 단위 정렬한 from/to를 새로 만들고 쿼리 키 변경으로 선택 시간창 전체를 재요청한다. CPU BE는 그 from/to를 TimeRange로 전달하고 history.get(time_from/time_till) 또는 trend.get으로 조회한다. 마지막 포인트 커서 기반 append 경로가 아니다. 절대 from/to 선택에는 usePeriodTimes의 주기 타이머가 없다(수동/다른 쿼리 재조회 조건은 별개). 서버 목록은 시계열 전체가 아니라 최신 스냅샷 재조회 + BE 30초 캐시다. 알람 SSE는 BE→브라우저 변경 신호이고 BE→Zabbix는 여전히 주기적 경량 목록 조회라 upstream 데이터 스트리밍과 구별해야 한다.

## ZM-138 증분 차트 계약

`_workspace/contract_monitoring_chart_incremental.md`에 API 계약을 고정했다. 기존 배열형 `/host/{id}/{cpu|memory|network}/line-charts`는 호환성을 위해 보존하고, 메타데이터 wrapper를 가진 `/incremental` endpoint를 추가한다. FE는 마지막 데이터 point가 아니라 마지막으로 완전히 확보한 구간 끝 `knownThrough`를 보내며, BE는 120초 overlap을 포함해 재조회한다. 긴 탭 이탈은 최대 30분 조각과 `hasMore`로 순차 보충하고, RAW 상한 등으로 전체성을 보장하지 못하면 `coverage=PARTIAL`로 cursor 전진을 막는다. series·cursor는 브라우저 탭 메모리에 두므로 Redis에 사용자별 차트 배열을 저장하지 않는다. 초기 자동 갱신 옵션은 브라우저별 localStorage(로그인 사용자 ID 포함 키), 기본 1분으로 정했다. CPU/Memory/Network만 초기 대상이며, 초 단위만 보존하는 현재 SeriesPoint 때문에 고주파 다중 샘플 차트는 ns 보존 설계 후 확장한다.

## ZM-139 증분 조회 구현

CPU·Memory·Network에 기존 endpoint를 보존한 `/incremental` API를 구현했다. `knownThrough` 120초 overlap, 30분 전진 제한, `hasMore`/`nextKnownThrough`와 requested·covered range wrapper를 추가했고 Network의 iface·SUM 규칙도 유지했다. 관련 테스트 28건과 `compileJava`·`compileTestJava`가 통과했다. 단, 현재 MetricPort는 Zabbix RAW 결과의 반환 상한 절단 여부를 전달하지 않는다. 따라서 응답 `coverage=COMPLETE`는 실제 데이터 완전성이 아니라 BE 조회 호출 성공을 뜻한다. 포트에 `truncated` 메타데이터를 추가한 뒤에만 `PARTIAL`을 정확히 표현할 수 있으며, ZM-148 검증에서 반드시 확인해야 한다. 단계 보고서: `_workspace/report_zm136_monitoring-chart-epic.md`.

## 정식 문서화

정본: C:/solutions/moveseye-docs/technical/모니터링-갱신과-SSE.md. 현재 동작과 미구현 증분 조회 제안을 구분하고, 독립 독자 검토 6문항으로 확인했다. '전체를 받음'을 '전체 범위를 요청'으로 고쳐 상한 절단과 모순을 없앴다. 커서는 HTTP 응답 수신시각이 아닌 확보한 데이터 구간 끝임을 명확히 했다. 관련 ZM-123 문서에서 사용자 수와 무관한 일정 부하·15초 이내 보장 표현을 보정했다. 인벤토리 T4 등록. 본문은 Vault에 중복 저장하지 않는다.

## ZM-139 증분 조회 구현

CPU·Memory·Network에 기존 배열형 API를 보존한 `/line-charts/incremental`을 추가했다. `knownThrough` 앞 120초 overlap과 새 구간 최대 30분 전진, `hasMore`·`nextKnownThrough` wrapper를 구현했다. Network의 명시 interface와 SUM 규칙도 유지한다. `MetricPort`가 RAW cap/절단 메타데이터를 반환하지 않아 ZM-138의 `coverage=COMPLETE`를 'BE 조회 호출 성공'으로 현실화했다. 원본 데이터까지 완전함을 말하려면 포트가 `truncated`를 전달하는 별도 변경이 필요하다. 관련 단위 테스트 28건과 compileJava/compileTestJava 통과. 상세: `C:/solutions/_workspace/implementation/zm139_monitoring-chart-incremental.md`.
