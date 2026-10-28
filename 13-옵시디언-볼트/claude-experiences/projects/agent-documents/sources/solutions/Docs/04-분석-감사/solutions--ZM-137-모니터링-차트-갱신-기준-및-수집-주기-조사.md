# ZM-137 — 모니터링 차트 갱신 기준 및 수집 주기 조사

- 상태: 완료 — 코드 정적 조사
- 조사일: 2026-09-07
- 범위: ZM-136 「모니터링 차트 증분 갱신 및 수집 부하 제어」의 기준선
- 기준: BE `b2c85dd`, FE `b7fcac9`의 소스 트리. 운영 배포 상태·실 Zabbix 호출량·브라우저 타이머 실측은 포함하지 않음.

## 결론

현재 주요 인프라 모니터링 차트는 상대 기간일 때 **기본 3분마다 선택 시간창 전체 범위를 다시 요청**한다. 마지막 포인트 이후만 받는 cursor 기반 증분 API나 FE 병합 로직은 없다.

‘최근 1시간’ 기준 예시는 다음과 같다.

| 시각 | 요청 범위 | 새로 필요한 범위 | 현재 실제 요청 |
|---|---|---|---|
| 10:00 | 09:00~10:00 | 1시간 | 1시간 전체 |
| 10:03 | 09:03~10:03 | 최근 3분과 보정 구간 | 1시간 전체 |
| 10:06 | 09:06~10:06 | 최근 3분과 보정 구간 | 1시간 전체 |

이 기준선은 ZM-138에서 API 계약을 설계하고, ZM-139~142의 수용 기준을 정할 근거다.

## 현재 FE 갱신 경로

| 구간 | 현재 동작 | 근거 |
|---|---|---|
| 상대 기간 시각 계산 | `usePeriodTimes`가 `period`만큼 뺀 `from`과 현재 `to`를 분 단위로 계산 | `moveseyee_fe/src/hooks/usePeriodTimes.ts` |
| 자동 갱신 기본값 | 기본 `THREE_MINUTES` = 180,000ms. 고정 `from/to`에는 타이머가 없음 | 같은 파일 |
| 차트 요청 | `useChartOption`의 Query key에 `fromDate/toDate`가 들어가고, 해당 범위를 요청 파라미터로 전달 | `moveseyee_fe/src/hooks/chart/useChartOption.ts` |
| CPU/메모리 차트 연결 | 공통 `useChartOption` 사용 | `src/hooks/chart/useCpuChart.ts`, `useMemoryChart.ts` |
| 사용자 갱신 설정 | 차트 전반의 사용자별 polling 주기 설정 UI·영속 저장소는 없음 | 위 경로 정적 확인 |
| 차트 병합 | 새 포인트를 기존 시리즈에 합치는 코드 없음. 응답 전체로 옵션을 다시 만듦 | `useChartOption.ts` 및 chart hook 경로 |

## 현재 BE 조회 경로

| 구간 | 현재 동작 | 근거 |
|---|---|---|
| CPU 차트 | 요청 `from/to`를 `TimeRange`로 넘겨 계열 전체를 조회 | `moveseye-be-spring/src/main/java/com/dmove/moveseye/host/cpu/CpuService.java` |
| 짧은 차트 | 48시간 미만은 RAW `history.get` 경로 | `common/metric/AdaptiveSeriesQuery.java` |
| 긴 차트 | 48시간 이상은 `trend.get` 요약값 우선. trends가 전부 비면 RAW로 폴백 | 같은 파일 |
| 원시 조회 범위 | `history.get`에 `time_from/time_till`과 기본 상한 100,000건 | `engine-zabbix/.../timeseries/history/ZabbixHistoryServiceImpl.java` |
| 호출 상한 | Zabbix client 연결 풀은 BE 인스턴스당 기본 동시 10개 | `engine-zabbix/.../client/ZabbixClient.java` |
| 증분 커서 | 마지막 포인트·동기화 시각을 받아 후속 구간만 조회하는 차트 API 없음 | 위 API·서비스 경로 정적 확인 |

## 수집 주기와 UI 갱신 주기

| 구분 | 의미 | 현재 확인값 | 설계 영향 |
|---|---|---:|---|
| Zabbix item `delay` | 원천이 새 측정값을 만드는 주기 | 이전 dev 조사에서 자체 주기 보유 item의 다수는 1분, 1분 미만은 57개(약 0.5%) | 10초 화면 갱신을 허용해도 대부분의 item에는 새 포인트가 없다 |
| 화면 polling | 브라우저가 새 응답을 확인하는 주기 | 차트 상대 기간 기본 3분 | UI 설정값은 ‘수집 주기’가 아니라 ‘확인 주기’로 표시해야 함 |
| 알람 동기화 | Zabbix 알람 사본을 갱신하는 BE 주기 | 기본 15초 경량 확인 + 5분 보정 | 차트 갱신 주기와 별도 정책 |

이전 dev 조사의 item 분포는 운영 전체의 보장이 아니다. ZM-137 종료 전 또는 ZM-148에서 실제 대상 Zabbix별 `delay` 분포를 다시 측정해야 한다.

## ZM-138 계약에 반드시 결정할 항목

1. UI 선택값: `끔`, `10초`, `30초`, `1분`, `3분`을 기본 후보로 하고, 현재 화면 범위에 따라 허용값을 제한할지 결정한다.
2. 설정 범위: 브라우저 로컬 설정인지, 로그인 사용자별 서버 저장 설정인지 결정한다. 사용자별 전체 시계열을 Redis에 저장하는 것은 범위에 넣지 않는다.
3. 증분 요청 기준: 마지막으로 **성공적으로 확보한 데이터 구간의 끝 시각**과 중첩 보정 범위를 어떤 파라미터로 보낼지 결정한다.
4. 중복 정책: 동일 item·동일 timestamp의 포인트를 무엇으로 식별하고 새 응답이 기존 값을 어떻게 교체하는지 결정한다. Zabbix RAW의 `ns` 보존 여부도 포함한다.
5. 복구 정책: 탭 복귀·오프라인·실패 후 전체 재조회로 전환할 공백 길이와, 보충 불가 시 화면 표시를 결정한다.
6. 조회 예산: item 수·기간·예상 포인트 수가 상한을 넘을 때 RAW 분할, trends 전환, 불완전 표시 중 무엇을 택할지 결정한다.

## 충돌 점검

| 작업 | 현재 다른 작업과의 관계 | 판단 |
|---|---|---|
| ZM-137 분석 | APM 보고서(BE), APM 타입(FE) 수정과 파일 불일치 | 완료, 충돌 없음 |
| ZM-138 설계 | `_workspace/contract_monitoring_chart_incremental.md` 신규 파일 권장 | 기존 동명 산출물 없음. 코드 수정 전 계약 고정 필요 |
| ZM-139 | `CpuService`, `MemoryService`, `NetworkService`, `DiskService`, `AdaptiveSeriesQuery`, engine history 경로 예상 | 현재 수정 중 목록과 불일치. 시작 직전 다시 확인 필요 |
| ZM-140~142 | `usePeriodTimes`, `useChartOption`, `use*Chart` 및 차트 컴포넌트 예상 | 현재 APM FE 작업과 불일치. 시작 직전 다시 확인 필요 |
| ZM-143~144 | cache/client/scheduler 신규 또는 공용 경로 예상 | APM과 직접 충돌은 현재 없음. 공용 자원이라 별도 작업 중이면 대기 |
| ZM-145~147 | `EventSyncService`, `EventService`, `useEventStream` 예상 | 현재 수정 중 목록과 불일치. ZM-123 후속 검수 결함이므로 차트 기능과 분리 관리 |

## 검증하지 않은 것

- 실제 운영 배포에 이 기준선 커밋이 반영됐는지
- 실 Zabbix에서 10/30/60초 polling일 때 호출량·응답량·CPU/DB I/O
- 브라우저 백그라운드 탭의 timer throttling과 재연결 동작
- Zabbix item별 지연 도착·동일 초 복수 포인트의 실제 분포

## 다음 이슈

**ZM-138 [설계] 차트 자동 갱신·증분 조회 API 계약 정의**. 코드 수정 없이 계약과 데이터 병합 규약을 먼저 고정한다.
