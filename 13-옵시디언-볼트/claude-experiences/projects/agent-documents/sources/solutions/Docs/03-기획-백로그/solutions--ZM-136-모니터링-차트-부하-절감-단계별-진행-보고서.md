# ZM-136 모니터링 차트 부하 절감 — 단계별 진행 보고서

> 갱신일: 2026-09-14. 각 이슈 완료 시 이 문서에 결과를 누적한다.
> 상태 표기: `완료` / `진행 중` / `대기` / `차단`.
> 🔄 **2026-09-14 인수**: 원 담당 세션의 미커밋 작업(ZM-139~142)을 Claude 세션이 인수 — 검증 재실행 후
> BE `#ZM-139`·FE `#ZM-140~142` 커밋, 이어서 ZM-143·145·146·147 구현. 상세는 아래 각 절.

## 전체 현황

| 이슈 | 단계 | 상태 | 핵심 산출물 또는 완료 조건 |
|---|---|---|---|
| ZM-137 | 현행 갱신·수집 주기 조사 | 완료 | 현재 전체 범위 재조회 경로와 실제 측정 필요 항목 확인 |
| ZM-138 | 자동 갱신·증분 API 계약 | 완료 | `knownThrough`, overlap, 부분 응답, backfill 계약 확정 |
| ZM-139 | BE 증분 조회 | 완료(제약 있음) | CPU·Memory·Network 증분 endpoint와 단위 테스트. RAW 절단 감지는 후속 보완 필요 |
| ZM-140 | FE 갱신 주기 설정 | 완료 | 상대 기간 차트용 브라우저별 localStorage 설정 UI |
| ZM-141 | FE 증분 병합·시간축 | 완료 | 09-14 검증 재실행 그린(tsc·jest 8건·eslint) + queryEnabled boolean 확정 수정. FE 커밋 `5ffa1d7` |
| ZM-142 | 탭 복귀·재연결 보충 | 완료 | 순차 backfill(구현·검증 완료, ZM-141과 함께 커밋) |
| ZM-143 | BE single-flight | 완료 | SingleFlightExecutor — 동일 (principal·호스트·선택자·covered) 동시 요청 1회 합침. 09-14 커밋 |
| ZM-144 | 실시간·집계 호출 예산 분리 | 대기(순서 재배열) | 예산 수치는 ZM-148 실측 없이 정할 수 없어 148 뒤로 미룸 — §ZM-144 참조 |
| ZM-145 | 알람 사본 복구 후보 500건 | 완료 | clock 진행 커서+랩어라운드 — 복구 없는 후보가 앞 블록을 막아도 전진. 09-14 커밋 |
| ZM-146 | 알람 읽음 사용자 ID·UPSERT | 완료 | 읽음 축을 내부 id로 통일(Zabbix userid 행 생성 중단)+is_read OR 승격+조치 직후 DB UPSERT. 09-14 커밋 |
| ZM-147 | SSE trailing 갱신 | 완료 | 스로틀 창 안 마지막 신호를 창 끝에 1회 실행(trailing)+언마운트 타이머 정리. 09-14 커밋 |
| ZM-148 | 증분 정확성·부하 검증 | 진행 중 | 09-14 dev 실측 진행(:3001) — 결과는 §ZM-148 |

## ZM-137 — 분석 완료

### 결과

- 상대 기간 차트는 기본 3분마다 `from/to`를 갱신하고, 선택한 시간창 전체를 다시 요청한다.
- 예를 들어 1시간 차트는 10:00에 09:00~10:00, 10:03에 09:03~10:03을 조회한다. 새 3분만 조회하는 방식이 아니다.
- CPU·Memory·Network 차트에는 cursor 기반 증분 API와 FE 병합 상태가 없다.
- 짧은 차트는 RAW `history.get`, 48시간 이상 차트는 trend를 우선 사용한다. RAW 기본 반환 상한은 100,000건이다.
- 고정 `from/to` 기간은 자동 polling 대상이 아니다.

### 산출물·검증

- 산출물: [analysis/analysis_zm-137_monitoring-chart-baseline.md](../04-%EB%B6%84%EC%84%9D-%EA%B0%90%EC%82%AC/solutions--ZM-137-%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81-%EC%B0%A8%ED%8A%B8-%EA%B0%B1%EC%8B%A0-%EA%B8%B0%EC%A4%80-%EB%B0%8F-%EC%88%98%EC%A7%91-%EC%A3%BC%EA%B8%B0-%EC%A1%B0%EC%82%AC.md)
- 방식: BE·FE 소스 정적 추적. 운영 Zabbix의 실제 delay·CPU·DB I/O는 아직 측정하지 않았다.
- 충돌 확인: APM 보고서 작업이 BE·FE에 진행 중이나, 차트 관련 파일과 겹치지 않았다.

### 다음 의존성

ZM-138 계약을 먼저 확정한 뒤 ZM-139 구현으로 진행한다.

## ZM-138 — 설계 완료

### 결과

- 기존 배열형 `GET /host/{id}/{chart}/line-charts`는 변경하지 않는다.
- CPU·Memory·Network에 `/incremental` endpoint를 추가한다.
- FE는 마지막 데이터 point가 아니라 마지막으로 **완전히 확보한 구간 끝**인 `knownThrough`를 보낸다.
- BE는 120초 overlap을 포함한 범위를 다시 읽는다. 중복 point는 최신 응답 값으로 덮어쓴다.
- 긴 탭 이탈·재연결 공백은 30분 단위로 나누고 `hasMore`로 순차 보충한다.
- RAW 상한·원본 오류로 전체성을 보장할 수 없으면 `coverage=PARTIAL`을 반환하며 cursor를 전진시키지 않는다.
- 차트 series와 cursor는 브라우저 탭 메모리에 보관한다. Redis에는 사용자별 차트 배열을 저장하지 않는다.
- 자동 갱신 기본값은 1분이며, `끔 / 30초 / 1분 / 3분`을 사용자별 localStorage에 저장한다.

### 산출물·검증

- 산출물: [contract_monitoring_chart_incremental.md](../06-API-%EA%B3%84%EC%95%BD/solutions--ZM-138-API-%EA%B3%84%EC%95%BD-%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81-%EC%B0%A8%ED%8A%B8-%EC%9E%90%EB%8F%99-%EA%B0%B1%EC%8B%A0-%EC%A6%9D%EB%B6%84-%EC%A1%B0%ED%9A%8C.md)
- 방식: 기존 controller·DTO·`useChartOption`·`usePeriodTimes`·engine `SeriesPoint`를 대조했다.
- 제한: 현재 `SeriesPoint`는 초 단위 timestamp만 보존하므로 같은 초에 여러 샘플이 필요한 고주파 item은 초기 대상에서 제외했다.

### 다음 의존성

ZM-139가 계약대로 API·완전성·backfill 조각을 구현하고 테스트해야 ZM-140~142가 시작할 수 있다.

## ZM-139 — 구현 완료(완전성 표기 제약 있음)

### 실제 변경

- 신규 endpoint를 추가했다.
  - `GET /host/{id}/cpu/line-charts/incremental`
  - `GET /host/{id}/memory/line-charts/incremental`
  - `GET /host/{id}/network/line-charts/incremental`
- 기존 `line-charts` endpoint와 배열 응답은 변경하지 않았다.
- `knownThrough`가 있으면 `max(from, knownThrough - 120초)`부터 읽고, 새로 전진하는 구간은 최대 30분으로 제한한다.
- 대상 `to`까지 남으면 `hasMore=true`와 다음 `nextKnownThrough`를 반환한다.
- Network 차트의 명시 `ifaces` 선택과 기존 `SUM` series 규칙을 유지했다.

### 변경 파일

- 공통 조회·응답 DTO: `common/response/IncrementalChartQuery.java`, `IncrementalLineChartResDto.java`
- CPU·Memory·Network의 controller, service, line-chart request DTO
- 단위 테스트: `IncrementalChartQueryTest`, `CpuServiceTest`, `MemoryServiceTest`, `NetworkServiceTest`
- 구현 상세: [zm139_monitoring-chart-incremental.md](../10-%EA%B5%AC%ED%98%84-%EA%B8%B0%EB%A1%9D/solutions--ZM-139-%EA%B5%AC%ED%98%84-%EB%B3%B4%EA%B3%A0%EC%84%9C-%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81-%EC%B0%A8%ED%8A%B8-%EC%A6%9D%EB%B6%84-%EC%A1%B0%ED%9A%8C.md)

### 검증

- 관련 단위 테스트 28건 통과
  - `IncrementalChartQueryTest` 3건
  - `CpuServiceTest` 6건
  - `MemoryServiceTest` 8건
  - `NetworkServiceTest` 11건
- `compileJava`, `compileTestJava`, `git diff --check` 통과
- 전체 테스트는 같은 워크트리에서 실행 중인 다른 Gradle 작업과 충돌하지 않도록 실행하지 않았다.

### 남은 제약과 후속 조치

- `coverage=COMPLETE`는 현재 “BE의 MetricPort 조회 호출이 성공했다”는 뜻이다. Zabbix RAW 결과가 반환 상한으로 잘렸는지는 MetricPort가 알려주지 않으므로, 데이터가 실제로 완전하다는 보증은 아니다.
- 안전한 `PARTIAL` 표기를 위해서는 engine port가 `truncated` 메타데이터를 전달해야 한다. 이 보완은 ZM-139 후속 또는 ZM-148 정확성 검증의 선행 조건으로 관리한다.
- 현재 engine `SeriesPoint`는 초 단위 timestamp만 보존하므로, 초당 복수 샘플이 필요한 고주파 item은 아직 초기 대상이 아니다.

### 충돌 확인

현재 미커밋 변경은 BE·FE 모두 APM 보고서 기능 중심이다. 차트 controller/service/DTO와 직접 겹치지 않았고, APM 파일은 수정하지 않았다.

### 다음 의존성

ZM-140과 ZM-141은 이 endpoint와 계약을 사용해 자동 갱신 설정·증분 병합을 구현한다. `PARTIAL`의 엄밀한 의미는 engine metadata 보강 전까지 UI에서 “조회 성공”으로만 해석해야 한다.

## ZM-140 — 구현 완료

### 해결한 문제와 실제 동작 변화

- 기존 상대 기간 차트는 모든 사용자에게 고정 3분 polling만 적용했고, 갱신을 끄거나 주기를 바꿀 수 없었다.
- 호스트·네트워크 모니터링 상세의 기간 필터 옆에 `차트 자동 갱신` 선택기를 추가했다. 상대 기간(`period`)일 때만 보이며, `끔 / 30초 / 1분 / 3분`을 선택할 수 있다.
- 기본값은 1분이다. 설정은 `dmove:monitoring-chart-refresh:{로그인사용자ID}` localStorage 키에 저장되어 같은 브라우저의 다른 로그인 사용자와 분리된다. localStorage를 쓸 수 없으면 현재 탭에서 기본값으로 동작한다.
- 표준 차트 경로 `useChartOption`에만 설정을 연결했다. 따라서 `period`가 있으면 선택한 주기로 `from/to`를 다시 계산하고, 절대 기간(`from/to`) 차트에는 timer를 만들지 않는다.

### 변경 파일과 영향

- `moveseyee_fe/src/hooks/useMonitoringChartRefresh.ts`: 설정값 검증·저장·같은 탭 차트 훅 동기화.
- `moveseyee_fe/src/hooks/chart/useChartOption.ts`: 상대 기간 chart polling에 선택 주기 반영.
- `moveseyee_fe/src/layouts/monitoring/DetailLayout.tsx`: 기간 필터 옆 선택 UI.
- `moveseyee_fe/src/locales/{kr,en}.json`: 표시 문자열.
- `moveseyee_fe/src/__tests__/useMonitoringChartRefresh.test.tsx`: 기본값, 사용자별 저장, 같은 탭 동기화, 잘못된 저장값 회귀 검증.

### 검증

- `npx jest src/__tests__/useMonitoringChartRefresh.test.tsx --runInBand` — 3개 통과.
- `npx tsc --noEmit` — 통과.
- `npx eslint src/hooks/useMonitoringChartRefresh.ts src/hooks/chart/useChartOption.ts src/layouts/monitoring/DetailLayout.tsx src/__tests__/useMonitoringChartRefresh.test.tsx --max-warnings 0` — 통과.
- 변경 전·후 `git status`로 APM 작업 파일과 차트 작업 파일이 분리된 것을 확인했다. APM 파일을 수정하거나 되돌리지 않았다.

### 남은 제약과 다음 이슈

- 이번 단계의 요청은 기존 전체 범위 chart API를 사용한다. `knownThrough`, incremental endpoint, overlap 병합, cursor, 시간축 고정은 의도적으로 ZM-141 범위에 남겼다.
- `useChartOption`을 거치지 않는 개별 custom chart와 KPI 조회는 이 사용자 설정의 대상이 아니다. ZM-141의 초기 대상(CPU·Memory·Network 표준 차트)과 일치시켰다.
- ZM-141 시작 전에도 APM 관련 미커밋 변경이 남아 있으므로, 차트 API·hook·component 파일의 충돌 여부를 다시 확인해야 한다.

## ZM-141 — 구현 완료

### 해결한 문제와 실제 동작 변화

- CPU·Memory·Network 표준 차트는 첫 요청부터 신규 `/line-charts/incremental` endpoint를 사용한다. 기존 Disk·Interface·Response-time·사용자 item 차트는 기존 배열형 endpoint를 계속 사용한다.
- 화면 탭 메모리에 `knownThrough`를 보관한다. 다음 상대 기간 갱신에서는 BE가 자동으로 적용하는 120초 overlap을 포함한 응답을 받아, 같은 `type + timestamp` point는 새 값으로 덮어쓴다.
- 병합 후 현재 요청 `from`보다 오래된 point를 제거하고, 요청 `from`·`to`를 빈 데이터에도 x축 양 끝으로 넣어 시간축이 점 개수에 따라 줄어들지 않게 했다.
- host·chart type·selector·기간이 바뀌면 cursor와 병합 series를 버리고 전체 조회부터 다시 시작한다. 상대 기간의 polling으로 움직이는 `from/to`는 동일 chart identity로 유지한다.
- `coverage=COMPLETE`일 때만 series 병합과 `nextKnownThrough` 저장을 한다. 현재 COMPLETE는 MetricPort 조회 성공을 뜻할 뿐 RAW 원본 완전성을 UI에 보장하지 않는다.

### 변경 파일과 API·UI 영향

- `moveseyee_fe/src/types/host-monitoring.ts`, `services/host-monitoring.api.ts`: CPU·Memory·Network 증분 응답/요청 타입과 endpoint 호출을 추가했다.
- `moveseyee_fe/src/hooks/chart/useIncrementalChartData.ts`, `incrementalChartData.ts`: 탭 메모리 cursor, COMPLETE 조건, overlap 병합과 범위 trimming을 분리했다.
- `useChartOption.ts`, `useCpuChart.ts`, `useMemoryChart.ts`, `useNetworkChart.ts`: 세 표준 차트만 증분 경로로 연결했다.
- `useHandelChartAction.ts`, `utils/index.ts`: 요청 표시 범위의 x축 시작/끝을 유지하도록 time grid를 확장했다.
- `src/__tests__/incrementalChartData.test.ts`: overlap 최신값 우선, 시간 정렬, 범위 밖 point 제거, 새 series 유지 규칙을 검증한다.

### 검증

- 코드 정적 대조: ZM-139 controller의 실제 세 endpoint와 DTO payload(`requested`, `covered`, `coverage`, `hasMore`, `nextKnownThrough`, `series`)를 확인했다.
- `npx tsc --noEmit`, `npx jest src/__tests__/incrementalChartData.test.ts --runInBand`, 대상 eslint를 실행했으나, 이미 실행 중인 다른 작업의 전체 Jest worker 점유로 출력 없이 장시간 대기하여 중단했다. 이 단계의 성공 결과는 확정하지 않았다.
- 대상 검증은 다른 전체 Jest 작업이 끝난 뒤 재실행해야 한다.

### 남은 위험·다음 이슈

- `hasMore` 순차 backfill과 visibility/network 복구 요청은 의도적으로 구현하지 않았다. ZM-142가 담당한다.
- Axios의 기존 동일 URL 취소 정책과 증분 요청의 상호작용, 실제 Zabbix 지연값을 포함한 E2E 검증은 ZM-148에서 확인한다.
- APM 관련 미커밋 파일은 수정·되돌리지 않았다. 이번 변경 파일만 차트 경로에 한정했다.

## 이후 단계 보고 형식

각 단계에는 아래 다섯 항목을 추가한다.

1. 해결한 문제와 실제 동작 변화
2. 변경 파일과 API·UI 영향
3. 검증 결과와 실행한 명령
4. 남은 위험·측정이 필요한 항목
5. 다음 이슈의 시작 조건과 충돌 확인 결과

## ZM-142 FE 탭 복귀·네트워크 재연결 backfill 구현 완료

### 해결한 문제와 실제 동작 변화

- 기존 증분 차트는 `hasMore=true`로 30분 조각의 추가 보충이 필요해도 다음 조각을 요청하지 않았고, 탭을 오래 비운 뒤 돌아오거나 네트워크가 복구되어도 다음 자동 갱신 주기까지 기다렸다.
- CPU·Memory·Network 증분 차트는 `hasMore=true`와 `nextKnownThrough`를 받으면 같은 chart identity와 display range로 다음 조각을 **한 번씩 순서대로** 요청한다. 요청 하나가 끝난 뒤에만 다음 요청을 시작한다.
- `visibilitychange`에서 문서가 `visible` 상태가 되거나 브라우저 `online` 이벤트가 오면 현재 차트에 즉시 한 번 증분 갱신을 요청한다. 상대 기간 polling과 고정 `from/to` 기간의 무자동 갱신 규칙은 변경하지 않았다.
- host·chart type·selector·기간 identity가 변경되거나 chart가 unmount되면 이전 응답 뒤에 예약된 backfill 연속 요청을 중단한다. 진행 중인 요청에서는 복귀 이벤트가 중복 요청을 만들지 않는다.

### 변경 파일과 영향

- `moveseyee_fe/src/hooks/chart/useIncrementalChartData.ts`: 순차 backfill, visibility/online 복귀, identity·unmount 취소 보호를 추가했다.
- `moveseyee_fe/src/__tests__/useIncrementalChartData.test.tsx`: 탭/네트워크 복귀 갱신, 요청 진행 중 중복 방지, `nextKnownThrough` 순차 사용을 검증했다.
- 기존 ZM-140·141 차트 파일 위에만 누적했으며, APM 관련 파일은 수정하지 않았다.

### 검증

- `npx jest src/__tests__/useIncrementalChartData.test.tsx --runInBand` 통과 (3건)
- `npx tsc --noEmit` 통과
- `npx eslint src/hooks/chart/useIncrementalChartData.ts src/__tests__/useIncrementalChartData.test.tsx --max-warnings 0` 통과
- `git diff --check` 통과

### 남은 제약과 다음 단계

- 브라우저 차원의 chart 요청 직렬화만 수행한다. 서버 인스턴스·여러 브라우저 간 중복 요청 합치기는 ZM-143 BE single-flight 범위다.
- Axios AbortSignal을 이 증분 API 호출 경로로 전달하지 않으므로, 이미 전송된 이전 HTTP 요청 자체를 취소하지는 못한다. 다만 identity 변경 뒤 그 응답을 이어서 backfill하지 않으므로 화면 데이터와 후속 부하는 분리된다.
- ZM-148에서 실제 Zabbix 지연·장기 이탈·부분 응답 상황을 포함한 E2E 정확성 및 부하를 측정한다.

## ZM-143 — BE single-flight 구현 완료 (2026-09-14, 인수 세션)

1. **해결한 문제와 동작 변화**: 같은 호스트 상세를 여러 탭·운영자가 띄우면 자동 갱신 주기가 겹칠 때 동일한 증분 조회가 동시에 여러 번 Zabbix로 나갔다. 이제 동일 (principal·호스트·선택자·covered 구간) 요청은 첫 실행에 합류해 결과를 공유한다 — 캐시가 아니라 진행 중 합류만(종료 즉시 키 정리).
2. **변경 파일**: `common/concurrent/SingleFlightExecutor.java`(신설), CPU·Memory·Network Service의 incremental 메서드. 🔴 키에 principal 필수 — 빼면 다른 사용자의 결과를 공유받는 권한 우회.
3. **검증**: `SingleFlightExecutorTest` 3건(동시 합류 1회 실행·종료 후 키 정리·예외 공유) + 기존 차트 스위트 그린.
4. **남은 위험**: 서로 다른 knownThrough(탭별 커서 상이)는 covered가 달라 dedup되지 않음 — 첫 로드·정렬된 창에서만 효과. 계약의 "짧은 공유 결과 캐시"는 미채택(낡은 결과 위험 > 이득).
5. **다음 시작 조건**: 없음(독립).

## ZM-145 — 되짚기 진행 커서 구현 완료 (2026-09-14, 인수 세션)

1. 복구 사건을 못 찾는 후보(원본 housekeeping 소실)가 오래된-순 첫 500건 블록을 차지하면 그 뒤 후보가 영영 처리되지 않던 것을, clock 진행 커서(+끝 도달 시 0 되감기 재순회)로 해결. 커서는 처리 성패와 무관하게 "본 데까지" 전진(실패분은 다음 랩 재시도, 좀비는 updated_at 2일 정리가 최종 방어선).
2. `EventProblemRepository.findVanishedCandidatesAfter`(eventId+clock 쌍) 신설, `EventSyncService` 커서 상태(volatile, 재시작 시 0부터 — 한 바퀴가 몇 주기 규모라 손실이 쌈).
3. 검증: 커서 전진·랩어라운드 테스트 + Sync 스위트 그린.
4. 남은 위험: 같은 clock 값 다건이 배치 경계에 걸리면 한 랩 건너뜀(다음 랩에서 처리 — 수용).

## ZM-146 — 읽음 사용자 ID 통일·UPSERT 구현 완료 (2026-09-14, 인수 세션)

1. 두 결함 정정 — ① 동기화가 읽음 행을 **Zabbix userid** 축으로 만들었는데 벨 조회·조치 직후 기록은 **내부 사용자 id** 축(두 값이 우연히 같은 설치본에서만 동작). 이제 `User.zabbixUserid` 매핑으로 내부 id 행만 생성, 내부 계정 없는 Zabbix 사용자는 행 미생성. ② upsert가 conflict 시 read_at만 갱신하고 is_read를 안 바꿔 "조치자=읽음"이 기존 unread 행을 영영 못 뒤집었다(변경 후보 필터가 매 주기 같은 행을 다시 뽑는 무한 반복 동반) → is_read OR 승격 + read_at COALESCE. 조치 직후 기록도 find+save→DB UPSERT(동시 조치 unique 충돌 제거).
2. `EventSyncService`(+UserRepository 의존), `EventReadStatusRepository.upsertRead`, `EventService.markReadForUser`.
3. 검증: 축 변환(7→70)·미매핑 스킵·OR 승격 SQL 어서션 + Event/Sync 스위트 그린.
4. 🔴 남은 위험: **기존 DB에 Zabbix-id 축으로 쌓인 행은 정리하지 않았다** — 어느 축인지 판별 불가(두 값이 같으면 정상 행). Zabbix id가 다른 내부 id와 우연히 충돌하는 설치본이면 낡은 오염 행이 남는다. dev는 두 축이 대체로 같아 실해 없음, 실서버 적용 시 인지.

## ZM-147 — SSE trailing 구현 완료 (2026-09-14, 인수 세션)

1. FE 무효화 스로틀(2초)이 leading만이라 창 안 마지막 신호가 버려져, 장애 폭풍의 마지막 상태가 다음 안전 폴링(최대 5분)까지 화면에 못 닿던 것을 trailing 실행(창 끝 1회 예약)으로 보장. 언마운트 시 예약 타이머 정리.
2. `useEventStream.ts`, fake timer 회귀 테스트(`useEventStream.test.tsx` — 창 안 신호 즉시 미실행·창 끝 실행·언마운트 정리).
3. 검증: 스위트 8건 그린, tsc 통과.

## ZM-148 — 정확성·계약 실측 부분 완료 (2026-09-14, dev :3002)

1. **실측 통과**(스크립트 scratchpad `zm148_verify.py`):
   - 첫 진입 전체 창: covered=requested, coverage=COMPLETE, nextKnownThrough=to ✅
   - 증분: coveredFrom = knownThrough−120(overlap 계약) ✅
   - 2시간 공백: 30분 조각 + hasMore=true → nextKnownThrough로 순차 이어받기 ✅
   - **정확성 동등성**: 데이터 있는 호스트(60점/1h)에서 "전체 1회 조회" vs "앞 30분+증분 병합" 포인트 집합 **완전 일치(차이 0)** ✅
   - `[zabbix-calls]` 계측 정상(60초 요약).
2. **미실측(잔여)**: 실제 Zabbix delay 분포 기반 30초/1분 기본값 검증, FE 브라우저 E2E(병합 렌더·탭 복귀), RAW 절단 시 PARTIAL 표기(engine truncated 메타 미도입 — ZM-139 기록 제약 그대로), 부하 전/후 호출량 장기 비교.
3. 이 잔여는 운영 관측(계측 로그)과 후속 QA로 이월한다.

## ZM-144 — 순서 재배열 (대기 유지)

호출량·동시성 "예산"의 수치는 ZM-148의 실제 delay·호출량 분포 없이 정할 수 없다(자의적 숫자는 ZM-129 풀 상한과 이중 규제가 됨). ZM-148 잔여(장기 호출량 관측)를 선행 조건으로 두고 대기로 유지 — 착수 시 후보 설계: 증분 차트 backfill 조각의 동시 실행 상한, 또는 ZabbixClient 풀의 용도별 예약 슬롯.

## 코덱스 검수 (2026-09-14, gpt-6-astra xhigh) — 10건 중 9건 반영, 1건 이월

인수 작업 5커밋 diff 검수 결과 HIGH 5·MEDIUM 4·LOW 1. **전건 실결함 판정**, 9건 반영 커밋(BE·FE `#ZM-136 [FIX]`):

| 심각도 | 결함 | 반영 |
|---|---|---|
| HIGH | 기간(identity) 전환기의 이전 응답이 새 커서를 오염 | 요청-응답 메타 대조 — 이 인스턴스·이 identity의 요청이 아니면 병합·커서 갱신 금지, 전체 조회 1회로 복구 |
| HIGH | 재마운트 시 React Query 캐시의 마지막 조각만 병합(전체 조회 없음) | 같은 메타 대조로 차단(요청한 적 없는 응답 = 잔재) |
| HIGH | single-flight가 requested/hasMore 메타까지 공유 — covered 같고 requested 다른 요청이 오염 | 키를 requested(from/to/knownThrough) 축으로 |
| HIGH | backfill 실패 후 effect 재실행이 무한 재요청 | 응답 객체당 1회 처리 가드 |
| HIGH | 같은 clock 500+건 배치 경계에서 영구 누락·랩 반복 | (clock, eventId) 복합 커서 |
| MED | SingleFlight 리더가 Error로 죽으면 합류자 영구 대기 | Error도 실패 완료+원형 전파 |
| MED | 48h+ 창 증분에서 trends·RAW 해상도 혼합 | 48h+ 창은 증분 무시(전체 재조회) |
| MED | 기존 Zabbix-id 축 읽음 잔재 행 | 내부 사용자 집합에 없는 user_id 행 정리 배치 추가(값 겹침 행은 원리적 판별 불가 — 존치, 한계 명시) |
| MED | 30초 갱신 선택해도 분 내림으로 실제 1분 | 주기<60초면 30초 격자 내림(다른 소비처 분 내림 불변) |
| LOW | trailing 타이머가 leading 직후 중복 무효화 | leading 실행 시 예약 취소 |

**이월 1건(MED)**: 탭 복귀·재연결 시 기존 from/to로만 보충(현재 시각까지 안 따라감) — 자동 갱신(기본 1분)이 다음 주기에 따라잡는 경로가 있어 실피해는 "갱신 끔" 사용자에 한정. 상대 기간 range 재계산이 useChartOption 폴링 구조와 얽혀 별도 이슈로 이월(ZM-142 후속).

검증: BE 6스위트·FE 4스위트(신규 회귀 3건 포함 19건) 그린, tsc 통과.
