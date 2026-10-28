# ZM-155 후속 R1·R2 구현 — 검수 요청 (2026-10-21)

근거: `review_zm-155-followup-20261020.md`(코덱스 분석). 워크트리 BE `C:\worktrees\zm-155-followup-be` · FE `C:\worktrees\zm-155-followup-fe`(브랜치 `ZM-155-followup`, master `a9080eb`/`258d747` 기준). R3(단위 보존)는 스키마 변경 결정 대기로 이번 범위 밖.

## R1 — 정상 0·소수 카운터가 미수신으로 표시
- 원인: 적재가 카운터 `count = Math.round(sum)`(내장 HTTP 지표와 공유하는 저장 규약), FE가 `!point.count`면 null.
- BE: `ApmCustomMetricSeriesDto.Point`에 `observed`(이 칸에 저장 행이 있었나) 추가 — 저장 행이 있으면 true, 빈 칸 false. **저장 규약(count 의미)은 바꾸지 않았다**(검수 권고대로 내장 지표 영향 없음).
- FE: `apmCustomMetricObserved(point) = point.observed ?? point.count > 0`(옛 응답 호환)으로 빈 칸 판단. 타입·계약 픽스처 갱신.
- 테스트: BE `zeroAndFractionalCounterIsObserved`(0·0.2·같은 칸 0.2+0.2 병합 → observed·sum 0/0.2/0.4) — 뮤테이션 `observed = count>0` → 실패 ✅. FE 표시 함수(0·0.2·0.4·1·빈칸, 옛 응답), 탭 컴포넌트(전부 0인 카운터가 "받은 값 없음"이 아니라 0 막대).

## R2 — 자리 만료 후 종류 변경이 과거 시계열을 재해석
- 원인: 종류(`value_kind`)가 자리 원장 행에만 있고, 보존 배치가 7일 무수신 행을 지움 + 수신 판정이 만료 자리를 무시하고 새 종류로 새 자리 → 조회가 과거 롤업(5분 30일·1시간 400일)을 새 종류로 해석.
- 방향(스키마 변경 없음): **자리(상한 칸) 만료 ≠ 종류 수명**.
  - `ApmCustomMetricGate.readLedger`: 살아 있는 자리가 없는 이름에 **같은 세대(rule_id = 지금 규칙 id)의 만료 자리 종류**(`lockedKind`)를 함께 읽는다(같은 1문장, union 둘째 가지 left join).
  - `judgeDurably`: lockedKind가 있고 들어온 종류와 다르면 자리를 주지 않고 고정 종류를 답해 판정이 `KIND_UNSUPPORTED`로 폐기. 같으면 기존대로 새 자리(UPSERT가 같은 행 갱신). 상한 계산은 그대로 살아 있는 자리만.
  - 보존 배치 `deleteExpiredCustomMetricSeats(seatDays, dataDays)`: 7일 무수신 **그리고** (세대 종료 — 규칙 삭제·재등록으로 rule_id 불일치 — 또는 1시간 롤업 보존 경과)일 때만 삭제. 잡은 `rollup1hDays`를 넘긴다.
  - 조회 `seatKinds`: 7일 창 대신 **지금 세대 자리**(rule_id 조인)면 만료돼도 그 종류.
- 테스트: IT `expiredSeatKeepsKindForSameGeneration`(GAUGE 자리 8일 만료 → COUNTER는 KIND_UNSUPPORTED·자리 GAUGE·만료 유지 → GAUGE는 다시 STORE → 규칙 삭제 후 보존 배치가 삭제) — 뮤테이션 lockedKind 검사 제거 → 실패 ✅. `expiredCacheDoesNotBypassLedger` 보존 단계를 새 규칙으로(세대 살아 있으면 남김, 401일이면 삭제). 단위: 조회 SQL이 rule_id 조인·last_seen 조건 없음, 배치 요약 `(7, 400)`.
- 캐시 경로(`verifyCached`의 "가득 참 → 접기")는 손대지 않았다: 상한이 차 있으면 다른 종류여도 접힌 몫(MIXED)으로 가며 그 이름의 시계열에는 쓰이지 않는다.

## 검증
- BE: `ApmCustomMetricSeriesServiceTest` 6 · `ApmBatchJobTest` 11 · `ApmCustomMetricGateTest` 25(중첩 5) · `ApmCustomMetricRuleServiceTest` 1 · `ApmCustomMetricIT` 8 · `ApmCustomMetricApiMvcTest` 3 통과.
- FE: `apmCustomMetricDisplay`·`ApmServiceCustomMetricsTab`·`apmCustomMetricHooks` 57 통과, tsc·typecheck:contract·eslint 0.

## 판단 요청
1. R1 `observed` 필드 추가가 계약상 적절한가(옛 FE·옛 BE 호환), 접힌 몫(MIXED)의 count 표시는 그대로 둔 것.
2. R2 만료 자리의 종류 고정 — 같은 세대 판정(rule_id 조인)·보존 조건·`KIND_UNSUPPORTED` 폐기가 맞는가. 같은 세대를 영구 고정하므로 "사용자가 의도적으로 종류를 바꾸려면 규칙 삭제·재등록"이 운영 안내로 충분한가.
3. 보존 배치 DELETE의 `not exists` 서브쿼리 비용(행 수는 서비스×이름 ≤ 50×서비스).
4. 새 결함.

---

## 2차 (2026-10-21) — 1차 반려 반영 + R3 구현

1차 결과: `_workspace/_archive/features/apm/metric-allowlist/review_zm-155-followup-impl-20261021_codex.md`(반려, 🔴2·🟡4). 사용자 결정: R3는 **Flyway V82**, 단위 불일치는 **거부 + 폐기 사유 표시**(환산 안 함).

**🔴1 종류 원장 조기 삭제 → 기간 조건 제거.** `deleteExpiredCustomMetricSeats(seatDays)`는 7일 무수신이면서 **세대가 끝난**(규칙 없음·rule_id 불일치) 또는 **서비스가 없는** 행만 지운다. 롤업 보존 기간으로 지우지 않는다(경계일·DROP 실패/보류·보존 역전과 무관). 남는 행 상한 = 규칙(≤20)×서비스. 잡 호출은 master와 같은 1인자.

**🔴2 제약 ≠ 저장 허가.** 관문 입력을 `SeriesWant(firstKind, unitByKind)`(배치에서 본 종류마다 첫 단위)로 바꾸고 `Admissions`에 자리(`kindOf`)와 **제약**(`constraintOf` 종류·단위)을 따로 둔다. `decide`: 제약 종류 불일치 → KIND_UNSUPPORTED, 제약 단위 불일치 → UNIT_MISMATCH, 그다음 **자리가 있을 때만** STORE(아니면 FOLD). 만료된 같은 세대 자리(lock): 그 종류가 배치에 있고 상한 여유면 lock 종류·단위로 되살림(첫 종류가 달라도), 아니면 **제약만**. 캐시 경로(`verifyCached`)도 자리 없는 이름에 lock 제약을 건다(🟡 사유 불일치 해소). 옛 `prepareBatch(Map<..,String>)`·`decide(.., admissions)`는 단위 모름으로 위임(호환).

**R3 단위.** V82 `apm_custom_metric_admission.unit varchar(64)`(NULL = V82 전 행 → 다음 수신에서 그 종류의 첫 단위 채택, 캐시 경로는 무효화 후 배타 경로가 채택). `normalizeUnit`(null→"", strip, 64자). 새 사유 `ApmDropReason.CUSTOM_UNIT_MISMATCH`(손실), `MetricIngestor`가 `prepareBatchSeries`·단위 판정 사용. 조회 `metrics[].unit`. FE: 사유 라벨 kr/en, `apmCustomMetricChartUnit`(환산 없음 — `ms`→ms·`By`→bytes 포맷만, 나머지 count), 카드 머리 단위 태그.

**계약** v1.4(§3 사유, §4 `observed`·`unit`, §10 변경표·배포 안내·재등록 운영 안내).

**테스트(IT 신규 4)**: `expiredLockIsConstraintNotPermission`(만료 GAUGE에 [COUNTER, GAUGE] — 상한 여유: KIND_UNSUPPORTED·STORE·GAUGE로 되살림 / 포화: 두 순서 모두 KIND_UNSUPPORTED·FOLD·last_seen 불변) · `unitIsFixedPerSeries`(ms 고정, 같은 배치 s는 UNIT_MISMATCH, 만료 뒤에도 유지) · `legacySeatAdoptsUnit`(NULL → By 채택 → KiBy 거부) · `pastSeriesIsStableAcrossGapAndKindChange`(실제 수신→조회: GAUGE ms 평균 5 → 8일 공백 → COUNTER s 수신 거부 + 보존 배치 → 조회 `valueKind`·`unit`·`points` 동일). 기존 `expiredCacheDoesNotBypassLedger` 보존 단계: 2000일 지나도 세대 살아 있으면 남김 → 규칙 삭제 후 삭제.
뮤테이션 4종 모두 실패 ✅: 포화 시 lock 제약 생략 · 제약을 저장 허가로(`admitted = fixed != null`) · 단위 검사 제거 · 보존 배치가 세대 무관 삭제.

**검증**: BE `ApmCustomMetricIT` 12 · `ApmCustomMetricGateTest` 25 · `ApmCustomMetricSeriesServiceTest` 6 · `ApmBatchJobTest` 11 · `ApmCustomMetricRuleServiceTest`(중첩) · `ApmCustomMetricApiMvcTest` 3 · `MetricIngestorCustomMetricTest`(중첩) 통과. FE 관련 5 스위트 182 통과, tsc·typecheck:contract·eslint 0.

**판단 요청(2차)**: 🔴1·2 해소 · `SeriesWant`/제약 분리 설계와 lock 되살림 조건 · 단위 채택·고정 규칙(NULL 채택, 무단위 "", 64자 절단) · V82 · FE 단위 표시(환산 없음) · 새 결함.

---

## 3차 (2026-10-21) — 2차 반려(🔴1) 반영

2차 결과: `_workspace/_archive/features/apm/metric-allowlist/review_zm-155-followup-impl-20261021_codex_r2.md`(🔴1·🟡3, 1차 🔴1·2는 해소 판정).

- **🔴1 64자 절단 → 자르지 않고 거부.** `normalizeUnit`은 strip만, `unitTooLong`(> 64자)이면 `decide`가 `UNIT_MISMATCH`, 수신 경로·단건 판정은 그 포인트를 자리 후보에서 뺀다(자리 안 받음). V82 주석 갱신. IT `overlongUnitIsRejectedNotTruncated`(접두 64자 같은 `…A`/`…B` 둘 다 거부·자리 0, 정확히 64자는 STORE). 뮤테이션(절단 복원 + 길이 검사 제거) → 실패 ✅.
- **🟡 단위 틀린 포인트만으로 자리 유지 → 단위까지 맞을 때만.** `compatible(want, kind, fixedUnit)`(그 종류로 처음 본 단위가 고정 단위와 같거나 어느 한쪽 모름)를 touch·만료 자리 되살리기 조건에 사용. `unitIsFixedPerSeries`: 만료 뒤 s만 오면 UNIT_MISMATCH·last_seen 불변, ms가 오면 되살림. 뮤테이션(되살리기 조건을 종류만으로) → 실패 ✅.
- **🟡 IT 설명 범위** — `pastSeriesIsStableAcrossGapAndKindChange` 표시명을 "1분 해상도·원장 시각 이동으로 공백 재현"으로 정정(5m·1h 롤업 자체 불변성은 검증 범위 밖).
- 🟡 따뜻한 캐시 포화 경로 IT는 이번에 추가하지 않았다(구현은 `verifyCached`가 lock 제약을 건다).

검증: `ApmCustomMetricIT` 13 · `ApmCustomMetricGateTest` 25 · `MetricIngestorCustomMetricTest` 통과.

---

## 4차 (2026-10-21) — 3차 반려(🔴1) 반영

3차 결과: `_workspace/_archive/features/apm/metric-allowlist/review_zm-155-followup-impl-20261021_codex_r3.md`(2차 🔴1 해소, 신규 🔴1·🟡1).

- **🔴1 첫 단위만으로 호환성 판단 → 새 자리 선택과 기존 자리 호환성 분리.** `SeriesWant`에 `unitsSeen`(종류마다 본 단위 전부, null 원소 = 모름)을 더하고 `see(kind, unit)`로 채운다(수신 경로·IT 헬퍼). 새 자리 종류·단위는 그대로 "처음 본 것", 기존 자리 touch·만료 자리 되살리기는 `compatible` = 고정 단위와 맞는 포인트가 **하나라도** 있나. IT `mixedUnitBatchStillRefreshesSeat`(`[s, ms]`·`[ms, s]` 각각 만료 자리 되살림 → ms STORE·s UNIT_MISMATCH·last_seen 갱신, 살아 있는 자리 2시간 경과 touch). 뮤테이션(첫 단위 비교 복원) → 실패 ✅.
- **🟡 따뜻한 캐시 포화 IT 추가** — `warmCacheSaturationKeepsConstraint`: 같은 관문이 상한(2) 찬 캐시를 믿는 경로(verifyCached)에서 만료 자리 이름에 `[COUNTER/ms, GAUGE/s, GAUGE/ms]` → KIND_UNSUPPORTED·UNIT_MISMATCH·FOLD(2회), last_seen 불변.

검증: `ApmCustomMetricIT` 15 · `ApmCustomMetricGateTest` 25 · `MetricIngestorCustomMetricTest` 통과.

**4차 결과: 승인**(`_workspace/_archive/features/apm/metric-allowlist/review_zm-155-followup-impl-20261021_codex_r4.md`). 🟡(실제 5m·1h 롤업 조회 불변 IT)은 후속 보강으로 이월.
회귀: BE `premium.apm.collector.*` + `premium.apm.core.batch.*` + `premium.apm.service.red.*` 100클래스 1,052건 통과(skip 0).
