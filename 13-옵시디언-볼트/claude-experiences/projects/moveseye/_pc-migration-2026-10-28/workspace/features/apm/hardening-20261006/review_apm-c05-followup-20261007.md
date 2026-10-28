# 검수 요청 — APM 순위 5 소비자 완전성 보완(`c05bd85` 후속) + APC-07 (2026-10-07)

구현: Claude(`COLLAB.md` SOLO-CLAUDE). 검수: Codex. 기준 BE `c05bd85`(worktree `C:/worktrees/apm-c05-followup`, 브랜치 `apm-c05-followup`), FE `b8081cc`(master 작업 트리).
근거: 코덱스 의견 `review_apm-remaining-plan-20261007_codex.md` §1(c05bd85 자기 검토)·§4(APC-07 앞당김).

## 범위

코덱스가 10-06 `c05bd85`에서 남긴 정확성 잔여 결함 3건과 FE 표현, 그리고 기동 실패 결함 APC-07.

**BE (15파일)**
- `core/metric/ApmMetricCoverageReader.java` — stage 60 판정이 **stage 5 상태**(bootstrap·legacy_hold·cutover)를 상속한다. 두 stage 상태를 한 SQL로 읽고, 상류 상태 → 자기 상태 → 자기 marker → 겹치는 stage 5 marker 순. `cutover`가 null이면 LEGACY_UNVERIFIED(fail-closed).
- `slo/ApmSloService.java` — `series()`가 5m·1h를 읽을 때 `coverageReader.firstIssue`를 먼저 보고, 첫 문제 시각(응답 격자로 내림)부터 **점을 싣지 않는다**(`incompleteFromMs`). 저장소도 그 시각까지만 읽고 예산 분모도 믿을 수 있는 구간으로만 정한다. 격리 수준 REPEATABLE_READ. `todayCell()`이 `count()` 대신 `measure()`를 써서 completeness를 보존 — 검증 실패면 `unknownReason=NOT_MEASURABLE`·`requests=null`·`measuredUntil=null`. 1m 원본은 판정 대상 아님.
- `slo/ApmSloSeriesDto.java` — `incompleteFromMs`(nullable Long) 추가. `slo/ApmSloDetailDto.java` — `Day.unknownReason`(nullable) 추가(굳은 칸은 null).
- `export/source/ApmExportCoverage.java` — `ROLLUP_INCOMPLETE` 추가. `export/source/ApmRedSeriesExporter.java` — untrusted 행을 PARTIAL 대신 ROLLUP_INCOMPLETE로, **`activeRequests`도 비움**.
- `export/ApmExportService.java` — 미확정 구간 안내 문구를 "수집·집계 중"에서 "집계가 확정되지 않아 값을 비웠거나 바뀔 수 있다"로.
- `slo/snapshot/ApmSloSnapshotService.java` — 롤업 미확정으로 굳히지 않을 때 INFO 로그(계산 실패 WARN과 구분).
- `overview/live/ApmLiveProperties.java` — `maxServices` `@Max(2000)` → `@Max(200)`(APC-07: `LiveSpanRing` 생성자가 200 초과를 거부해 201~2000 설정이 기동 실패였다).
- 테스트: `ApmMetricCoverageReaderIT`(+1 상속), `ApmSloServiceTest`(생성자·오늘 칸 mock 조정, +3), `ApmRedSeriesExporterTest`(기대값·게이지), `ApmContractFixtures`·`apm/contract/slo-detail.json`·`slo-series.json`(새 필드).

**FE (7파일)**
- `types/apm.ts` — `TApmSloSeries.incompleteFromMs?`, `TApmSloCalendarDay.unknownReason?`(둘 다 옵셔널, 구 BE 호환).
- `slo/ApmSloDetailPage.tsx` — SLI 추이 각주에 "{{from}} 이후 그리지 않음" 추가, 캘린더 툴팁에 NOT_MEASURABLE 노트.
- `shared/components/ApmExportModal.tsx` — `incompleteFromMs`가 있으면 안내 Alert를 info → warning.
- `locales/kr.json`·`en.json` — `apm.slo.chart.incomplete_note`, `apm.slo.calendar.not_measurable_note`, RED CSV 도움말에 ROLLUP_INCOMPLETE.
- `__tests__/ApmSloPage.test.tsx`(+1), `fixtures/apmSloContractSample.ts`.

## 의도 — 선택한 설계와 버린 대안

1. **시계열은 점을 "비우지" 않고 "자른다".** 대안은 영향 칸을 `sliPct=null·requests=0`으로 채우는 것이었는데, 그러면 "트래픽이 끊긴 칸"(요청 0, 행 있음)과 구분이 안 된다. 자르고 `incompleteFromMs`로 알리면 FE가 각주로 말할 수 있다. 측정 헤더(`measureBatch`)가 창 전체를 UNKNOWN으로 보내는 것보다 덜 보수적이지만, 앞 구간은 실제로 검증된 값이라 버릴 이유가 없다.
2. **`ROLLUP_INCOMPLETE`를 새로 뒀다.** 코덱스 제안 중 "PARTIAL 유지 + coverageReason 열"은 CSV 열 추가라 FE·문서 영향이 더 크다. 열거값 추가는 기존 열 안에서 끝난다(FE에는 열거 타입이 없고 도움말 문구만 있음).
3. **`Day.unknownReason`은 오늘 칸에만 채운다.** 굳은 칸의 `total=0·requests>0`도 NOT_MEASURABLE 의미지만 그건 스냅샷이 이미 `mixedBounds`로 말하고 있어 건드리지 않았다.
4. **APC-07은 상한을 200으로 내렸다**(코덱스 권고). `LiveSpanRing`을 2000까지 늘리는 쪽은 메모리 설계 변경이라 부하 검증 뒤로.
5. **Availability 응답에 `incompleteFromMs`/reason 추가는 하지 않았다**(코덱스 1-4 권고). 계약 변경이고 이번 묶음의 "거짓 정상값 차단" 목표와는 별개라 백로그로 남긴다.
6. **스냅샷 skip 사유 카운터 분리(1-3)는 로그 구분만 했다.** `SnapshotResult`에 필드를 늘리면 스케줄러 결과 문자열 계약이 바뀐다.

## 중점 확인 요청 (불안한 지점)

- [ ] **`series()`의 격자 내림.** `incompleteFrom = max(range.fromMs, floor(issue.from, stepMs))`, `trustedTo = min(range.toMs, incompleteFrom)`. `resolveStep`이 테이블 단(300)보다 굵은 step(예: 3600)을 고른 경우, 문제 버킷(5m)이 굵은 칸 중간에 있으면 그 굵은 칸 전체를 버리는 것이 맞나? 지금은 칸 시작으로 내리므로 **그 칸 전체를 버린다**(보수적). 반대로 문제 시각이 `range.fromMs`보다 앞이면 `incompleteFrom=range.fromMs`로 점 0개 — FE는 빈 차트 + 각주.
- [ ] **REPEATABLE_READ 격리.** `series()`에 `isolation = REPEATABLE_READ`를 붙였다. `coverageReader.firstIssue`는 호출자 트랜잭션 안에서 돈다(`consistent()`는 쓰지 않음 — 그건 REQUIRES_NEW라 `store.redSeries`가 다른 스냅샷을 본다). 계산기 `measureBatch`와 같은 방식인지 확인 바람.
- [ ] **CoverageReader 판정 순서.** stage 60에서 stage 5 상태를 자기 상태보다 먼저 본다. `Issue.from`은 둘 다 `from`이라 결과 시각은 같고 사유만 갈린다. 기존 IT 4건은 그대로 통과.
- [ ] **`todayCell`의 `window.completenessVerified()` 가드.** 전에는 window가 incomplete여도 `budgetRemainingPct(EMPTY)`를 호출했다(결과 null). 지금은 명시적으로 null. 동작 동일하다고 보지만 확인.
- [ ] **`ApmSloServiceTest.todayCellBudgetUsesRollingWindow`**를 `count` mock에서 `measure` answer(todayStart 분기)로 바꿨다. 기존 단정은 그대로 두고 `requests=1000`·`unknownReason=null`을 추가.
- [ ] **FE 캘린더 NOT_MEASURABLE 노트는 툴팁 formatter(함수)에만 실려 jest로 못 잡았다.** 시계열 각주만 테스트했다.
- [ ] **APC-07.** `application.yml` 기본 200·`LiveBuffer`(메트릭 링)도 같은 속성을 쓴다. 200으로 묶는 것이 메트릭 링에 과한 제한인지(`LiveBufferTest`는 통과).

## 검증 현황

**통과**
- BE(JDK 17, worktree, `:test` 선별): `ApmMetricCoverageReaderIT` 5(실 PG, skipped 0) · `ApmSloSchemaIT` 12 · `ApmExportIT` 15 · `ApmSloServiceTest` 25 · `ApmRedSeriesExporterTest` 10 · `ApmExportCoverageTest` 4 · `ApmEndpointExporterTest` 3 · `ApmSloCalculatorTest` 29 · `ApmSloUnknownReasonTest` 7 · `ApmSloSnapshotServiceTest` 11 · `ApmAvailabilityServiceTest` 25 · `ApmLivePropertiesTest` 7 · `LiveBufferTest` 17 · `ApmContractFixtureTest` 36 · `ApmExportServiceTest` 21 — **222건 실패·오류·건너뜀 0**.
- FE: `tsc --noEmit` 통과, `npm run typecheck:contract` 통과, jest `ApmSloPage`·`apmSloDisplay`·`apmCollectorDisplay` 113건 통과.

**검증 못 한 것**
- 런타임(브라우저·dev BE)에서 dirty marker를 실제로 만들어 SLO 상세·내보내기 화면을 본 것은 없다. dev BE(:3000)는 재기동하지 않았다.
- BE 전체 테스트는 돌리지 않았다(선별 회귀만). master 기존 실패(`LicenseArchitectureTest` A5-c)는 이 변경과 무관.
- `SloSnapshot` 배치 전체 skip 시 잡 실패 승격(코덱스 1-3 권고)은 미구현.

## 검수 결과 (Codex, gpt-5.6-sol high, 2026-10-07 — 전문 `_archive/features/apm/hardening-20261006/review_apm-c05-followup-20261007_codex.md`)

판정 **반려 → 반영 후 재검수 대기**. 🔴 1 · 🟡 3 · 🟢 5(중점 확인 통과: REPEATABLE_READ·판정 순서·todayCell 가드·테스트 변경·APC-07).

| # | 심각도 | 지적 | 반영 |
|---|---|---|---|
| 1 | 🔴 | FE `apmSloCalendarCells`가 `sliPct===null`을 걸러 NOT_MEASURABLE 오늘 칸이 **빈 칸(요청 없음)**으로 보임 | [x] `buildApmSloCalendarOption`에 `unmeasurable` 입력 추가 — 별도 heatmap series(중립색·점선 테두리, `visualMap.seriesIndex:0` 밖), 툴팁은 "측정 불가"+사유. 페이지가 `sliPct null && NOT_MEASURABLE` 날을 모아 전달. 테스트: `apmSloCharts.test.ts`(formatter 직접 호출 3건)·`ApmSloPage.test`(series[1]에 오늘 날짜) |
| 2 | 🟡 | 창 시작이 격자에 안 맞고 전체 미확정이면 `first<trustedTo`라 가짜 0건 점 1개 | [x] `first = trustedTo <= range.fromMs() ? trustedTo : floor(from)`. 테스트 `unalignedFullyIncompleteSeriesHasNoPoints` |
| 3 | 🟡 | 번다운 카드에 미확정 각주 없음(같은 points) | [x] `incompleteNote`를 두 카드가 공유. 테스트에 번다운 단정 추가 |
| 4 | 🟡 | 스냅샷 미확정 INFO가 일간에만 | [x] `skipIncomplete(slo, day, 창)` helper — 일간·롤링 창·1h·6h 각각 기록. 테스트 `incompleteRollingWindowIsNeverSnapshotted` |
| — | 보강 | APC-07 Bean Validation 경계 테스트 없음 | [x] `maxServicesAboveRingLimitIsRejectedByValidation`(201 거절·200 통과) |
| — | 보강 | `legacy_cutover=null` IT 없음 | [ ] **불가** — V70이 `legacy_cutover NOT NULL`이라 행을 만들 수 없다. 코드 가드는 방어용으로 유지, IT에 주석으로 남김 |
| — | 보강 | BE golden fixture에 NOT_MEASURABLE 표본 없음 | [ ] 보류 — 계약 표본(`slo-detail.json`)을 바꾸면 FE 표본·문서까지 같이 움직여야 해서 FE 테스트의 오버라이드로 대체 |

반영 검증: BE `ApmSloServiceTest` 26·`ApmSloSnapshotServiceTest` 12·`ApmLivePropertiesTest` 8·`ApmMetricCoverageReaderIT` 5(실 PG)·`ApmSloSchemaIT` 12·`ApmContractFixtureTest` 36·`ApmRedSeriesExporterTest` 10 통과. FE tsc·`typecheck:contract`·jest 67(ApmSloPage 포함) 통과.

반영 커밋: BE (아래 2차 커밋) · FE (아래 2차 커밋).
