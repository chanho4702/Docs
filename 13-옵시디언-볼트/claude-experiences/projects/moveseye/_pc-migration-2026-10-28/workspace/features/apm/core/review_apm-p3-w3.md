# 검수 요청 — APM P3 3차 (리포트 배치·QA 결함 수정·설치 출처)

- 대상: BE `moveseye-be-spring` `b2c85dd..0ef3a2d`(리포트 `19b5674`·설치 출처 `dcfc281`·QA 수정 `0ef3a2d`). 결과 `review_apm-p3-w3_codex.md`.
- 의도: 4.4 리포트(V55 스냅샷·ManagedReportSource SPI·id 공간 겹침 대응) · 설치 가이드 references · P3 QA 결함 D1~D9·M-1~M-6 반영(V56). 계약 `./contract_apm-p3.md` §8·§9, `./contract_apm-read-api.md` §8.8, QA `./e2e_apm-p3-qa.md`.

## 검증됨
`:test` 2969 green. QA 1회차 PASS 74/FAIL 3 → 반영 후 런타임 재검증 미실시.

## 🔴 불안한 지점
1. D3: -1 push → trigger.update 같은 회차 — Zabbix 설정 캐시 경합 미실측.
2. 리포트 UTC/로컬 축(SLO day·합성 캘린더 로컬 vs 기간 경계 UTC), 월간 1h 해상도, 합성 과거 백필 불가, 집계 무트랜잭션.
3. D9 isNew 계약 변경(FE 단계 추가 경로 400 위험).
4. V56 SET NULL·V55 스냅샷 보존이 기존 retention과 정합한지.

---

## § 반영 (2026-09-07) — 검수 결과 #1~#9 + 테스트 검출력

`review_apm-p3-w3_codex.md`의 지적을 **전건 반영**했다. 계약은 `./contract_apm-p3.md`
§1.4 · §5.1 · §5.2 · §8.3 · §8.4 · §8.8 · **§10(한 장 요약)**에 있다.

| # | 반영 |
|---|---|
| **#1** 🔴 | `previousTotals`의 배포·알람을 **실제 집계**로(서비스 루프가 이미 창마다 세고 있었다). SLO는 안 재므로 **nullable**로 바꿔 계약에 명시 — 0으로 위장하면 그 거짓이 전체 증감으로 흘렀다 |
| **#2** 🔴 | 공유 아이템(`itemHasOtherActiveConsumer`)이면 `-1`을 **밀지 않고**, 그 트리거의 이벤트만 `event.acknowledge(close)`로 닫는다. 아이템 분리는 A7의 의도된 공유를 뒤집는 일이라 택하지 않았다(근거 주석: `ApmAlertOrphanSweeper#requestResolve` 표) |
| **#3** 🔴 | `apm_zbx_cleanup`에 `RESOLVE` 종류 신설 — 해소 **요청**과 **완료**를 가르고, 열린 Problem이 없어질 때까지 재시도. 복귀 시 `cancelResolve`로 대기 취소(안 하면 새 알람을 옛 행이 닫는다) |
| **#4** | epoch 통일 불가(일 스냅샷은 하루를 못 쪼갠다) → `notes.sloPeriodLocal`·`syntheticPeriodLocal`·`dailyPeriodZone`으로 **실제 기간·시간대 명시** |
| **#5** | `slos[].definitionChanged` 신설(스냅샷의 `defVersion`·`target`·`latencyThresholdMs` 혼재 판정). null은 비교에서 제외 — V53 이전 행이 전부 경고를 달지 않게 |
| **#6** | catch-up 시작점을 **마지막 저장 기간의 다음**으로. `now`를 UTC 날짜로 환산해 **단일 시각**으로 판단(실제 시계 혼용 제거) |
| **#7** | insert를 `saveAndFlush` + `DataIntegrityViolationException` 시 **저장본 재조회**. 저장본도 없으면 되던진다(진짜 제약 위반을 숨기지 않게) |
| **#8** | `service=__none__` 예약어 — 세 조회가 **같은 `serviceFilter` 함수**를 쓴다(따로 적으면 "목록엔 걸리는데 상세엔 안 걸린다"가 재발한다) |
| **#9** | exporterhelper 429 예외 명시 · Go는 "이 가이드의 지원 방식은 수동 계측"으로 |

### 테스트 검출력 보강

- `weeklyNumbersAndDelta`에 **전체 증감 단언** 추가 + 다서비스 케이스(`totalsDeltaSumsPerServiceDeltas`) — 서비스별 합과 합계가 같은지 본다(#1을 실제로 잡는 입력이었는데 단언이 없었다).
- 배치 테스트를 **고정 시각**으로 재작성(실제 시계 혼용 제거): 누락 기간 순회 · 상한 연속성 · 평시 재계산 · 첫 실행.
- D3를 **큐 상태 전이**로 검증(`resolveStaysQueuedUntilProblemsAreActuallyClosed`) — 호출 순서만이 아니라 `attempts`·`nextAttemptAt`·행 삭제까지.
- 페이지네이션 경계: **같은 날짜·같은 id**가 두 계열에 있을 때 페이지를 넘기며 무누락·무중복·결정적 순서.
- V56 NULL 상세: 서비스 삭제 후 목록 3건 = 상세 3건(`__none__`), 미지정이면 5건임을 IT로 고정.

## 검증됨 (2차)
`:test` 2969 → **2993 green**(신규 24, 실패·skip 0). `ApmMessagingJobQueryIT` 15건이
도커 PG(5433)에 실제로 붙어 돌았다(skip 아님).

## 🔴 남은 불안
1. **#2·#3의 실 Zabbix 미검증** — `event.acknowledge(close)`가 실제로 Problem을 닫는지, 공유
   아이템 거짓 RECOVERY가 실제로 나던 현상인지 둘 다 **재현·실측 없음**(트리거는 `manual_close=1`).
2. **`RESOLVE` 큐가 새 알람을 닫을 위험** — 복귀 경로 둘(고아 복귀·규칙 재활성)에서 취소하지만,
   그 밖의 경로로 트리거가 다시 켜지면 대기 행이 남는다.
3. **#4는 "밝히기"일 뿐** — 화면이 각주를 안 달면 오해가 그대로다.
4. 리포트 배치의 실데이터 런타임 미검증(#6·#7 포함).
