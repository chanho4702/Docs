# 검수 요청 — APM P3 1차 (SLO·홈 위젯·AI 툴)

- 대상: BE `moveseye-be-spring` `e386e61`(기준 `922a708`) · AI `moveseye-ai` `533d4c0`(기준 `d9918ba`). 결과 `review_apm-p3-w1_codex.md`.
- 의도: WBS 4.1 SLO(V51, SLI 가용성/지연, 버짓, 번 레이트 1h/6h, SLO_BURN 알람 Zabbix push) + 4.5 홈 위젯 3종 + 4.6 AI 툴 8·screens.json 57·원인 브리핑 프롬프트. 계약 `../contract_apm-p3.md`·`../contract_apm-p3-ai.md`.

## 검증됨
BE `:test` 2682 green(+114, 수기 계산표 기반 버짓/번 레이트 검증, IT V51·retention) · AI test 123 green(+18).

## 🔴 불안한 지점
1. Zabbix `apm.slo_burn[<slo_uid>]` 아이템·트리거 실생성·history.push 미검증. "넘었으면 값 아니면 0" 표현 방식의 함정.
2. `slo ↔ alert` 패키지 순환. 스냅샷 burn_1h/6h는 "그날 끝" 값. target/windowDays 변경 시 과거 스냅샷 미재계산.
3. `GET /apm/slos` 질의 3회×SLO 수, 위젯 폴링 권한 판정 비용.
4. AI: BE 응답 필드를 계약 TS 타입으로만 신뢰(실응답 미확인), 이름→uid 해소가 부분 일치 의존, 실 LLM 체인 미검증.

---

## § 반영 — 코덱스 1차 검수 (2026-09-07, `review_apm-p3-w1_codex.md` #1~#11)

BE 범위만 반영했다. **#5 `event/ProblemTagFilterGuard`는 이번 커밋(e386e61) 밖의 파일**이라
손대지 않았다(타 세션 영역 — 해당 세션에 전달 필요). #12~#14는 `moveseye-ai` 레포다.

| # | 무엇을 어떻게 고쳤나 | 주요 파일 |
|---|---|---|
| **1** 🔴 | **알람 조건을 SRE 원문으로.** `AND·÷2.4` 단일 판정 → `(1h>T AND 5m>T) OR (6h>T/2.4 AND 30m>T/2.4)`. 창이 둘 → **넷**(짧은 확인 창 신설). 기본 임계를 **창 길이에서 계산**(30일 14.4 · 7일 3.36). **상한 `1/(1-목표)`** 검증 신설(도달 불가 조합 거절, 기본값도 최대의 절반으로 클램프). 하한 1을 **1까지 거절하던 코드** 수정(`<=` → `<`). Zabbix push 값 규약 문서화 + **측정 불가에 `-1`** 신설(0=정상과 구분, 안 밀어서 마지막 양수가 남던 것 해소). 어느 줄이 넘었는지는 `burnCondition`으로 응답·로그에 싣는다 | `ApmSloCalculator` · `ApmSloBurnEvaluator` · `ApmAlertService.validThreshold` |
| **2** 🔴 | **롤링 창을 세 조각으로 이어 읽는다.** ① 시작 경계 부분 버킷(촘촘한 단) ② 완성 롤업 본문(굵은 단) ③ 최신 꼬리(1m). 경계는 **굵은 단의 버킷 격자**(`ApmRollupService.floor`)로 잘라 중복·누락 0. 꼬리 시작은 상수가 아니라 **롤업 워터마크**가 정한다(`ApmAvailabilityService.pctTailStart`와 같은 방식). 실제 측정 구간을 `measuredFromMs`/`measuredToMs`로 **응답까지** 올린다 | `ApmSloCalculator.planSegments` |
| **3** 🔴 | **요청 수와 측정 가능 수 분리.** `Counted(good, measured, requests, mixedBounds)`. LATENCY에서 히스토그램이 없는/경계가 갈린 조각이 분모에서 빠지면 그 사실이 플래그로 남는다. **표·시계열·스냅샷에 같은 정책**(`requests`·`measured`·`mixedBounds` 세 필드) | `ApmSloCalculator` · 세 DTO · `apm_slo_snapshot` |
| **4** 🔴 | **스냅샷 확정(`finalized`·`measured_until`).** 백필 판정이 "행이 있나" → **"확정됐나"**. 미확정 행은 다음 회차가 다시 계산하고, **확정은 되돌아가지 않는다**. 재확정 건수를 배치 요약에 싣는다(`refinal=N`) | `V53` · `ApmSloSnapshot` · `ApmSloSnapshotService` |
| **6** 🔴 | **Zabbix 정리 큐(`apm_zbx_cleanup`).** 삭제 실패 시 **행을 지우기 전에** 아이템·트리거 id를 큐에 옮기고, 평가 배치(5분)가 성공까지 재시도한다. 트리거 먼저·아이템 나중(순서가 참조 카운트를 대신한다), 지수 백오프(상한 60분), 성공 시 자기 소멸 | `V53` · `ApmZbxCleanup` · `ApmZbxCleanupService` · `ZabbixAlertBridge.removeOwnedObject` |
| **7** 🟡 | **생략은 활성 상태 보존.** `syncSloRule(Boolean enabled)` 3갈래(TRUE=켠다 · FALSE=지운다 · **null=그대로**). SLO 화면이 `burnAlertEnabled`를 그대로 넘긴다(`before != null` 해석 폐기) | `ApmSloService.update` · `ApmAlertService.syncSloRule` |
| **8** 🟡 | **SLO 규칙을 `sloId`별로 조회.** `forService`의 접는 축이 kind → `kind#sloId`(SLO_BURN만). DTO에 `sloUid` 추가 | `ApmAlertService.forService`·`toDto` · `ApmAlertRuleDto` |
| **9** 🟡 | **스냅샷에 당시 설정 저장**(`target`·`window_days`·`latency_threshold_ms` + `apm_slo.def_version`). 정의 버전은 **재는 기준이 바뀔 때만** 오른다(이름 변경으로는 안 오른다). **재계산 정책 명시**: 과거는 되계산하지 않고, 지금 설정과 다르면 `staleDefinition: true`로 알린다 | `V53` · `ApmSlo` · `ApmSloSnapshot` · `ApmSloDetailDto.Day` |
| **10** 🟡 | **오늘 칸 버짓을 롤링 창 기준으로.** SLI는 일간 유지, `budgetRemainingPct`만 조회 시점의 창에서 계산(예전에는 오늘 요청만으로 계산해 월간 예산이 소진돼도 100%였다) | `ApmSloService.todayCell` |
| **11** 🟡 | **배치 집계 + 공용 캐시.** SLO 표가 서비스 축 배치 질의로 바뀌어 **질의 수가 SLO 수와 무관**(창 종류당 조각 1~3 + 번 레이트 4). 위젯 세 EP가 공유하는 계산에 **30초 공용 캐시**(권한 무관 값만) | `ApmSloService.list`·`measureWindows` · `ApmSloCalculator.measureBatch`·`burnWindowsBatch` · `ApmWidgetService` |

### 회귀 테스트 (코덱스 요구 항목 대응)

| 요구 | 테스트 |
|---|---|
| 비정렬 롤링 경계·최신 롤업 공백 | `ApmSloCalculatorTest.rollingWindowReadsHeadBodyAndTail` · `tailFollowsRollupWatermark` · `noWatermarkReadsWholeWindowFine` · `segmentsDoNotDoubleCount` |
| **실제 Merger**의 정상+NULL 혼합 | `ApmSloCalculatorTest.realMergerKeepsRequestsWhenHistogramMissing` (🔴 mock이 아니라 `new ApmHistogramMerger(catalog)`) |
| 배치 하루 누락 후 재실행 | `ApmSloSnapshotServiceTest.reFinalizesPendingRowAfterMissedRun` · `finalizedNeverGoesBack` |
| Zabbix 삭제 실패 후 재시도 | `ApmZbxCleanupServiceTest` 5건 |
| 꺼진 규칙 유지 | `ApmAlertServiceTest.syncSloRuleKeepsDisabledState` · `syncSloRuleDoesNotCreateWhenOmitted` · `ApmSloServiceTest.updateKeepsAlertStateWhenOmitted` |
| 임계 상한 검증 | `ApmSloCalculatorTest.defaultThresholdIsCappedByReachableMax` · `ApmSloServiceTest.unreachableBurnThresholdIsRejected`·`thresholdOfExactlyOneIsAccepted` · `ApmAlertServiceTest.unreachableSloThresholdIsRejected` |
| SRE OR 조건 | `ApmSloCalculatorTest.sustainedBurnFiresOnSlowRow`·`fastRowNeedsCheckWindow` · `ApmSloBurnEvaluatorTest.firesOnSlowRowForSustainedBurn`·`unmeasurablePushesSentinel` |
| 오늘 칸 버짓 | `ApmSloServiceTest.todayCellBudgetUsesRollingWindow` |
| 계약 표본(FE R-1) | `ApmContractFixtureTest` 6건 + `src/test/resources/apm/contract/{slos,slo-detail,slo-series,widget-status-summary,widget-slow-services,widget-alerts}.json` |

### 🔴 여전히 불안한 지점

1. **런타임 미검증.** Zabbix `apm.slo_burn[...]`에 `-1`을 실제로 밀어 본 적이 없다. 트래퍼
   아이템의 `value_type=FLOAT`이라 음수 자체는 문제없어야 하지만, **트리거 `>0`이 음수에서
   해소로 동작하는지**와 그때 Problem 이력이 어떻게 보이는지는 실서버 왕복이 필요하다.
2. **`-1` 센티넬은 정책 선택이다.** 측정 불가에서 열린 이벤트를 **해소**시킨다. "장애 중에
   트래픽이 끊겨 못 재게 된" 경우 알람이 조용해지는데, 그 상태를 계속 열어 두는 쪽이 옳다는
   주장도 가능하다. 지금은 "복구와 구분되게 기록하되 페이지는 올리지 않는다"를 택했다.
3. **조각 경계의 시간대 가정.** `ApmRollupService.floor`(로컬 시각 `date_trunc`)를 그대로 쓰므로
   격자는 맞지만, 이 판단이 **KST(+9, 단의 배수) 기준으로만 실측**됐다. +05:30 같은 지역에서
   1시간 단 경계가 어떻게 떨어지는지는 확인하지 않았다.
4. **정리 큐의 아이템 참조 판정이 약하다.** 큐에 들어온 시점에 바인딩이 이미 없어 참조 카운트를
   셀 수 없다 — "트리거 먼저, 아이템 나중"이라는 **순서**로 대신했다. 같은 아이템을 쓰는 다른
   규칙이 그 사이에 새로 만들어지면 `bindings.findByZbxItemid`가 잡아 미루지만, 그 경로는
   런타임에서 확인하지 못했다.
5. **위젯 캐시 30초는 근거가 "홈 폴링 주기"뿐이다.** 실측 부하 측정은 없다.
6. **`measured` 분리의 FE 파급.** `requests`를 SLI 분모로 쓰고 있던 화면이 있으면 숫자가
   달라진다(계약서 § BE 회신 R-1 상단 경고 참조). FE 반영 여부 미확인.
7. **`burnAlertEnabled:false`의 실제 동작이 FE 가정과 다르다**(규칙 행이 남는 줄 알았으나
   **삭제**된다). 계약서에 회신했지만 화면 문구 수정은 FE 몫으로 남았다.
8. 스냅샷 배치의 **질의 수가 늘었다**(하루당 SLO×4 → SLO×4 + 조각 분할). 백필이 여러 날을
   메우는 회차에서 얼마나 느려지는지 실측하지 않았다.
