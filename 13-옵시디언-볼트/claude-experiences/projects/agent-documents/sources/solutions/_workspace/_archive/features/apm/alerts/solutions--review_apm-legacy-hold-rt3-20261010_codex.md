## 원인

### 확정

결론부터 말하면, `legacy_hold`는 현 설계상 **bootstrap 완료 후 자동 해제되는 플래그가 아닙니다.** “검증된 backfill 또는 향후 수동 절차가 생길 때까지 유지하는 영구 보류 진단”으로 의도됐습니다. 다만 현재는 실제 수동 해제 기능조차 없습니다.

근거는 다음과 같습니다.

- [ApmMetricDirtyStore.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/core/batch/rollup/ApmMetricDirtyStore.java:35)는 명시적으로 “자동 해제하지 않는다”고 규정합니다.
- 운영 코드에는 `legacy_hold=false` 전환 경로가 없습니다. 테스트 fixture만 직접 갱신합니다.
- [features/apm/hardening-20261006/contract_apm-late-rollup-20261006.md](/C:/solutions/_workspace/features/apm/hardening-20261006/contract_apm-late-rollup-20261006.md:34)는 기존 target 행을 자동 덮어쓰지 않고 `legacy_hold`로 압축하며, 검증된 backfill·수동 해제 절차는 제공하지 않는다고 명시합니다.
- [ApmLateMetricRollupIT.java](/C:/solutions/moveseye-be-spring/src/test/java/com/dmove/moveseye/premium/apm/core/batch/rollup/ApmLateMetricRollupIT.java:254)는 기존 target의 `count`가 같더라도 `sum`이 다른 반례를 보존하고 hold를 유지합니다. 즉 “기존 target이 있으니 raw로 다시 계산하면 된다”는 가정을 의도적으로 거부합니다.

`bootstrap_complete`의 의미도 “역사 자료가 검증됐다”가 아닙니다. 정확히는 **도입 당시 watermark까지 원본 범위를 유한한 cursor로 훑어, 필요한 dirty marker를 등록하는 스캔이 끝났다**는 뜻입니다.

코드 경로는 다음과 같습니다.

1. 각 `apm_rollup` 실행에서 5m와 1h가 차례로 실행됩니다. 스케줄은 5분입니다. [V38__apm_p1.sql](/C:/solutions/moveseye-be-spring/src/main/resources/db/migration/V38__apm_p1.sql:448)
2. 각 stage는 정상 순회보다 먼저 `bootstrap()`을 호출합니다. [ApmRollupService.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/core/batch/rollup/ApmRollupService.java:194)
3. 최초 `until`은 기존 watermark의 다음 버킷이며, `cursor`는 source table의 최소 버킷입니다. [ApmRollupService.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/core/batch/rollup/ApmRollupService.java:303)
4. 한 회차는 기본 60개 marker 및 한 날짜 경계까지만 진행합니다.
5. pre-cutover 기존 target이 발견되면 marker로 다시 계산하지 않고 hold만 설정합니다. [ApmRollupService.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/core/batch/rollup/ApmRollupService.java:332)
6. cursor가 `until`에 닿으면 `bootstrap_complete=true`가 됩니다. 이때 enqueue된 marker가 모두 처리됐다는 뜻도 아닙니다. [ApmMetricDirtyStore.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/core/batch/rollup/ApmMetricDirtyStore.java:145)

읽기 전용으로 dev DB를 다시 확인한 2026-10-10 23:11 KST 기준 상태는 최초 제보 시점보다 진행돼 있었습니다.

- stage 5: `bootstrap_complete=true`, `legacy_hold=true`
- stage 60: `bootstrap_cursor=2026-09-23`, `bootstrap_until=2026-10-08 20:00`, `bootstrap_complete=false`, `legacy_hold=true`
- 현재 cursor 기준 stage 60은 약 16회가 더 필요합니다. 5분 주기라 잠금·실패가 없다면 약 80분입니다.
- dev의 최초 source 범위로 계산하면 stage 5는 8회, stage 60은 24회 정도이며, 양쪽 완료까지 최초 실행 후 약 2시간입니다. target 누락 버킷이 많거나 queue가 차면 더 늘어납니다.

bootstrap이 완료돼도 화면은 복구되지 않습니다.

- [ApmMetricCoverageReader.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/core/metric/ApmMetricCoverageReader.java:100)는 `bootstrap_complete=false` 또는 `legacy_hold=true`를 모두 `Issue(from)`으로 바꿉니다.
- 초기에는 `BOOTSTRAP_PENDING`, 완료 후에는 `LEGACY_UNVERIFIED`로 사유만 바뀌며, 요청 시작부터 미확정이라는 결과는 같습니다.
- stage 60은 stage 5 상태도 상속하므로 stage 5 hold 하나만으로 1h 소비자도 영구 차단됩니다. [ApmMetricCoverageReader.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/core/metric/ApmMetricCoverageReader.java:52)
- `legacy_hold`를 DB에서 임의로 false로 바꾸더라도 `from < legacy_cutover`이면 여전히 `LEGACY_UNVERIFIED`입니다. 따라서 단순 플래그 해제는 기존 7일·30일 SLO 창을 즉시 복구하지 못합니다.

이번 장애의 직접 원인은 hold 자체보다 **서로 반대 방향인 두 구간을 `Issue(from)` 하나로 압축한 소비자 계약**입니다.

- legacy/bootstrap은 `[요청 시작, cutover)`라는 앞쪽 미검증 구간입니다.
- dirty/blocked는 보통 `[문제 버킷, 요청 끝)`으로 보수적으로 자르는 뒤쪽 미확정 구간입니다.
- 현재 모델은 둘 다 `incompleteFrom`으로 표현하므로 앞쪽 문제를 만났을 때 뒤쪽의 신뢰 가능한 최신 데이터까지 전부 버립니다.

추가로 `legacy_hold`는 보존 해제 스위치도 아닙니다. [ApmMetricRetentionGate.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/core/batch/retention/ApmMetricRetentionGate.java:53)는 플래그가 아니라 pre-cutover target 존재 여부를 직접 검사합니다. 따라서 `legacy_hold=false`만 쓰는 관리자 API는 조회와 retention 어느 쪽도 제대로 해결하지 못합니다.

### 추정

업그레이드 설치본에서 기존 5m·1h target이 조금이라도 있으면 hold가 설정되는 것은 사실상 정상 경로입니다. 따라서 이번 현상은 dev 특수 데이터가 아니라 **기존 APM 사용 설치본 대부분에서 재현될 배포 설계 결함**으로 보는 것이 타당합니다.

## 권장 해법

권장 순서는 **(a) 즉시 적용 → (b) 별도 검증 backfill로 제한적 구현 → (c) 비상 운영 기능으로만 제공**입니다.

### 1단계: 앞·뒤 경계를 분리하는 (a)를 필수 수정

`ApmMetricCoverageReader`가 단일 `Issue` 대신 다음 구조를 반환해야 합니다.

```text
untrustedBeforeMs : 이 시각 이전은 legacy/bootstrap 미검증
incompleteFromMs  : 이 시각 이후는 dirty/blocked 미확정
prefixReason
suffixReason
```

신뢰 구간은 다음 교집합입니다.

```text
[max(request.from, untrustedBefore), min(request.to, incompleteFrom ?? request.to))
```

판정 규칙은 다음과 같아야 합니다.

- `bootstrap_complete=false`, `legacy_hold=true`, pre-cutover 판정은 요청 전체가 아니라 **cutover 이전에만** 적용합니다.
- cutover는 migration instant 그대로 쓰지 말고 [ApmMetricDirtyStore.legacyCutover](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/core/batch/rollup/ApmMetricDirtyStore.java:25)와 동일하게 stage 다음 경계로 정규화해야 합니다.
  - 이번 dev 기준 stage 5는 약 22:25 KST부터,
  - stage 60은 약 23:00 KST부터 새 보장을 적용해야 합니다.
- stage 60의 `untrustedBefore`는 stage 5와 stage 60 경계 중 늦은 시각입니다.
- dirty marker 검색은 `untrustedBefore` 이후 신뢰 후보 구간에서 수행합니다. pre-cutover blocked marker가 최신 구간까지 다시 잘라서는 안 됩니다.
- 중간 dirty 구멍 여러 개는 기존처럼 첫 marker 이후를 보수적으로 자를 수 있습니다. 두 경계 모델은 “앞쪽 prefix + 뒤쪽 suffix”까지만 표현합니다.

SLO 전체 창의 상태·예산·알람은 요청 창 일부가 미검증이면 계속 `UNKNOWN`이어야 합니다. 다만 시계열의 신뢰 가능한 최신 점은 표시할 수 있습니다.

특히 prefix를 버리고 남은 일부 점만으로 계산한 값을 “7일/30일 SLO 예산”처럼 표시하면 안 됩니다. 부분 coverage일 때는 다음 중 하나가 안전합니다.

- `errorBudgetTotal`과 `budgetRemainingPct`를 null로 보내고 SLI 점만 표시하거나,
- 별도의 `measuredFromMs/measuredToMs`와 “신뢰 구간 진단값” 라벨을 추가합니다.

이 1단계는 DB 변경 없이 구현 가능합니다. API에는 nullable `untrustedBeforeMs`가 추가되므로 BE·FE 계약 변경은 필요하지만 Flyway는 필요 없습니다.

업그레이드 직후 UX는 다음과 같이 바뀝니다.

- 시계열: cutover 이후 점은 바로 표시하고 이전 영역은 음영·경고 처리
- 오늘 캘린더: migration 당일은 하루 전체 SLI로 발표하지 않고 “업그레이드 이전 구간 포함”으로 표시
- 기존 과거 snapshot: 그대로 유지
- 24시간 availability: 전체 24시간이 신뢰 가능해질 때까지 퍼센트는 null, 개별 시계열은 신뢰 구간만 표시
- 7일·30일 SLO 헤더: 검증 backfill이 없으면 각각 최대 7일·30일 `UNKNOWN`일 수 있지만 화면 전체가 비지는 않음
- 내보내기: 사용자가 `from`을 `untrustedBeforeMs` 이후로 좁혀 정상 파일을 받을 수 있음

### 2단계: (b)는 기존 bootstrap과 분리된 “검증 rebuild”로 구현

기존 `bootstrap_complete`에 맞춰 `legacy_hold=false`를 자동 설정하는 방안은 반대합니다.

현재 bootstrap은 기존 target을 재집계하거나 검증하지 않습니다. 또한 다음 조건들은 원본 완전성을 증명하지 못합니다.

- source partition이 존재함
- 기존 target과 count가 같음
- bootstrap cursor가 끝에 도달함
- dirty queue가 비었음

안전한 자동 해제에는 별도의 연속 검증 경계가 필요합니다. 예를 들면 V78에 다음 상태를 추가할 수 있습니다.

- `legacy_verified_from`: 이 시각부터 cutover까지 연속적으로 재집계·검증됐다는 경계
- `state_version`: 관리자 작업과 rollup의 optimistic concurrency용
- 필요하면 별도 rebuild cursor/until

초기 `legacy_verified_from`은 정규화된 cutover 경계로 간주합니다. 검증 rebuild가 과거 방향으로 성공할 때만 경계를 뒤로 이동시킵니다.

자동 진전 조건은 최소한 다음과 같아야 합니다.

- 해당 범위의 source가 “존재”가 아니라 권위 있는 전체 원본임을 입증
- 모든 metric 필드와 histogram 의미로 재집계 성공
- 해당 범위 dirty/blocked 없음
- stage 60은 동일 범위 stage 5가 먼저 verified
- rebuild 결과·marker ACK·`legacy_verified_from` 변경이 같은 트랜잭션
- source contraction, partition 소실, 같은 count·다른 sum 반례에서는 경계를 이동하지 않음

현재 보존 정책상 raw 1m은 7일, 5m는 30일입니다. 따라서 자동 검증으로 안전하게 복구할 수 있는 연속 범위는 대체로 7일 이내에 제한됩니다. 30일 SLO 역사를 완전히 증명하려면 archive나 별도 권위 원본이 필요합니다.

### 3단계: (c) 관리자 API는 단순 boolean 토글로 만들지 않음

관리자 수동 해제는 두 의미를 분리해야 합니다.

1. `RELEASE_RETENTION_ONLY`
   - 미검증임은 유지
   - 운영자가 디스크 확보를 위해 해당 범위 원본 삭제를 허용
   - 조회에서는 계속 `LEGACY_UNVERIFIED`

2. `ATTEST_VERIFIED`
   - 외부 backfill·검증 작업의 증거가 있을 때만 trust 경계를 이동
   - 단순 확인 버튼으로 제공하지 않는 것이 안전

API에는 stage, 범위, 사유, 기대 `state_version`, 확인 문자열, 수행자와 감사 이력을 남겨야 합니다. stage 60 trust 승격은 stage 5보다 앞설 수 없어야 합니다.

V78+가 필요한 부분은 이 운영 상태와 감사 테이블입니다. V70은 이미 적용된 migration이므로 수정하면 안 됩니다.

## 소비자별 변경

직접 `ApmMetricCoverageReader`를 호출하는 production 클래스는 아래 다섯 개가 전부입니다.

| 소비자 | 현재 위치 | 변경 방식 |
|---|---|---|
| SLO 시계열 | [ApmSloService.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/slo/ApmSloService.java:237) | `untrustedBefore` 이전과 `incompleteFrom` 이후를 제외하고 중간 점만 조회·표시. 부분 coverage이면 전체 SLO budget 값은 null 또는 명시적 부분값으로 분리 |
| SLO 측정·status·burn | [ApmSloCalculator.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/slo/ApmSloCalculator.java:414) | 요청 창이 어느 미신뢰 구간과라도 겹치면 `completenessVerified=false`. `Measured`에 경계와 reason을 보존 |
| Availability 시계열·24h | [ApmAvailabilityService.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/service/status/ApmAvailabilityService.java:192), [ApmAvailabilityService.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/service/status/ApmAvailabilityService.java:379) | 시계열은 영향 칸만 null. 24h 퍼센트는 일부 구간만으로 “24h” 수치를 만들지 말고 전체 coverage가 될 때까지 null. cache hit 전 coverage 판정 유지 |
| RED 내보내기 | [ApmRedSeriesExporter.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/export/source/ApmRedSeriesExporter.java:104), [ApmRedSeriesExporter.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/export/source/ApmRedSeriesExporter.java:134) | 앞쪽 칸은 `LEGACY_UNVERIFIED`, 뒤쪽은 `ROLLUP_INCOMPLETE`로 수치·게이지를 비움. plan과 실제 chunk에서 재확인 |
| Endpoint 내보내기 | [ApmEndpointExporter.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/export/source/ApmEndpointExporter.java:91), [ApmEndpointExporter.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/export/source/ApmEndpointExporter.java:115) | 행이 요청 창 전체 집계이므로 어느 쪽 미신뢰 구간과라도 겹치면 숫자 열 전체를 비움. plan에서 안전한 재요청 `from/to`를 안내 |

간접 소비자도 함께 바뀌어야 합니다.

- SLO 목록·상세 헤더: [ApmSloService.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/slo/ApmSloService.java:128) — 전체 rolling window는 계속 `UNKNOWN`, reason을 legacy와 pending으로 구분
- 오늘 캘린더: [ApmSloService.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/slo/ApmSloService.java:539) — migration 당일을 무트래픽으로 보이지 않게 별도 legacy 안내
- snapshot: [ApmSloSnapshotService.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/slo/snapshot/ApmSloSnapshotService.java:188) — 일간 자체가 trusted면 `good/total`은 저장하고, rolling budget·1h·6h만 미확정이면 해당 nullable 값만 비우는 방식이 UX상 낫습니다. coverage reason 저장에는 V78 컬럼 추가가 적절합니다.
- burn 알람: [ApmSloBurnEvaluator.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmSloBurnEvaluator.java:117) — 신뢰 창이 완성될 때까지 `UNMEASURABLE`; 0이나 정상으로 복구하면 안 됨
- export plan·notes·JSONL meta: [ApmExportPlanDto.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/export/ApmExportPlanDto.java:22), [ApmExportService.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/export/ApmExportService.java:370) — `untrustedBeforeMs` 추가 및 앞·뒤 안내 분리
- RED coverage enum: [ApmExportCoverage.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/export/source/ApmExportCoverage.java:31) — `LEGACY_UNVERIFIED`를 `ROLLUP_INCOMPLETE`와 분리하는 것을 권장

FE 영향은 다음과 같습니다.

- [types/apm.ts](/C:/solutions/moveseyee_fe/src/types/apm.ts:2935), [types/apm.ts](/C:/solutions/moveseyee_fe/src/types/apm.ts:4029): `untrustedBeforeMs`, coverage reason 타입 추가
- [ApmSloDetailPage.tsx](/C:/solutions/moveseyee_fe/src/pages/application-monitoring/slo/ApmSloDetailPage.tsx:193): “X 이후 미확정”뿐 아니라 “X 이전 legacy 미검증” 안내와 차트 음영 추가
- [ApmSloDetailPage.tsx](/C:/solutions/moveseyee_fe/src/pages/application-monitoring/slo/ApmSloDetailPage.tsx:215): 캘린더의 generic `NOT_MEASURABLE`을 업그레이드 이전 미검증과 처리 지연으로 구분
- [ApmExportModal.tsx](/C:/solutions/moveseyee_fe/src/pages/application-monitoring/shared/components/ApmExportModal.tsx:508): 두 경계 중 하나라도 있으면 warning, 안전한 재요청 범위 표시
- RED 도움말에는 `LEGACY_UNVERIFIED` 의미를 추가

## 테스트

실 PostgreSQL IT에는 다음 시나리오를 고정해야 합니다.

1. **실제 업그레이드**
   - 전용 DB를 Flyway V69까지만 적용
   - 기존 1m·5m·1h, watermark, 기존 target을 seed
   - V70부터 V78까지 migrate
   - state 초기값과 migration cutover를 검증
   - `-Dit.db.required=true`로 DB 부재 시 skip이 아니라 실패

2. **시간대·버킷 경계**
   - JVM `Asia/Seoul`, PG session UTC
   - migration instant가 22:24:06이면 stage 5 trust 경계 22:25, stage 60은 23:00인지 확인
   - reader와 rollup이 같은 경계를 사용하는지 확인

3. **bootstrap 회차**
   - 여러 날짜에 sparse source와 기존 target을 배치
   - target이 모두 있으면 정확히 하루씩 cursor가 진행되는지 검증
   - 60개 capacity, queue full, 재기동 resume 검증
   - `bootstrap_complete=true`인데 pending marker가 남을 수 있음을 고정

4. **hold 지속**
   - 기존 target 발견 → bootstrap 완료 후에도 hold 유지
   - 같은 count·다른 sum, source contraction, source partition 소실에서 자동 trust 승격 금지

5. **두 경계**
   - 전부 pre-cutover
   - 전부 post-cutover
   - cutover를 가로지르는 범위
   - prefix legacy + suffix pending 동시 존재
   - pre-cutover marker가 post-cutover 신뢰 구간을 자르지 않음
   - stage 60이 stage 5 경계·marker를 올바르게 상속

6. **검증 rebuild를 구현할 경우**
   - 모든 필드가 권위 원본과 일치할 때만 `legacy_verified_from` 후퇴
   - 중간 crash 후 cursor resume
   - verified 경계 변경과 marker ACK 원자성
   - stage 5 미검증 상태에서 stage 60 승격 거부

7. **관리자 API**
   - 권한, reason 필수, stale version 충돌, 중복 요청 idempotency, 감사 행
   - retention-only 해제가 query trust를 바꾸지 않음
   - rollup·retention 동시 실행에서도 범위가 역행하지 않음

8. **소비자 통합**
   - SLO series는 경계 사이 점만 반환
   - 부분 coverage에서 전체 budget/status를 정상으로 발표하지 않음
   - migration 당일 today cell이 무트래픽으로 표시되지 않음
   - snapshot·burn 알람이 미확정을 성공값으로 굳히거나 정상 알람으로 평가하지 않음
   - RED는 앞·뒤 구간 coverage와 null 수치를 구분
   - endpoint는 부분 미신뢰 창의 숫자 전체를 마스킹
   - plan 이후 신규 marker가 생겨도 다운로드 chunk 재검사가 이를 발견

## 위험

- 가장 위험한 수정은 `bootstrap_complete=true → legacy_hold=false` 단순 연결입니다. 기존 bootstrap은 검증 작업이 아니므로 잘못된 역사 target을 정상값으로 승격합니다.
- `legacy_hold=false` 직접 갱신 API는 현재 retention gate에도 효력이 없으며, pre-cutover 조회도 즉시 정상화하지 못합니다.
- 두 경계만으로 중간 여러 구멍을 정확히 표현할 수 없습니다. 첫 dirty 이후를 모두 자르는 보수적 동작은 유지해야 합니다.
- 부분 신뢰 구간으로 계산한 budget·availability를 전체 기간 지표처럼 표시하면 새로운 거짓 정상값이 됩니다.
- stage 60 trust는 stage 5보다 앞설 수 없습니다.
- 기존 raw 보존이 7일이므로 30일 역사를 자동으로 완전 검증한다는 약속은 불가능합니다.
- coverage와 수치 조회는 동일한 `REPEATABLE_READ` snapshot이어야 합니다. export는 chunk마다 짧게 재검사해야 합니다.
- prefix를 시간 한정으로 바꿔도 pre-cutover 원본의 retention hold는 별도입니다. V78의 검증 경계·retention release 정책이 없으면 기존 역사 파티션은 계속 보존됩니다.

파일은 수정하지 않았으며, 코드·설계 문서와 dev PostgreSQL을 읽기 전용으로 확인했습니다.
