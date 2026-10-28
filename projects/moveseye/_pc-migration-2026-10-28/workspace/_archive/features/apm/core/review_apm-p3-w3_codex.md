# 코덱스 검수 결과 — APM P3 3차 (2026-09-07, BE b2c85dd..0ef3a2d)

검수 판정: **수정 필요 — 높음 3건, 중간 5건, 낮음 1건**입니다.  
id 공간 분리와 고정 데이터의 목록 병합은 타당하지만, 전체 증감·알람 해소·삭제된 서비스의 상세 조회에 결함이 남습니다.  
`b2c85dd..0ef3a2d` 커밋만 검수했으며, 파일 수정·테스트 실행은 하지 않았습니다. 2,969건 통과는 기존 기록입니다.

| # | 심각도 | 파일:라인 | 문제 | 왜 | 권고 |
|---|---|---|---|---|---|
| 1 | 🔴 높음 | [ApmReportBuilder.java:596](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/report/ApmReportBuilder.java:596) | **직전 합계를 0으로 채워 전체 증감이 틀림** | `previousTotals`의 배포·알람·SLO 수를 모두 0으로 넣는다. 기존 테스트 데이터인 배포 `1→2`, 알람 `9→4`에서 서비스별 증감은 `+1/-5`지만 전체는 **`+2/+4`**가 된다. | 직전 창의 실제 집계를 전달한다. 집계하지 않은 값은 0으로 위장하지 말고 계약과 함께 nullable로 처리한다. |
| 2 | 🔴 높음 | [ApmAlertService.java:1132](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertService.java:1132), [ApmAlertOrphanSweeper.java:203](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertOrphanSweeper.java:203) | **한 규칙을 끄면서 다른 활성 규칙의 공유 아이템에도 `-1`을 보냄** | 아이템 키는 `(kind, serviceUid)`이고 트리거는 규칙별이다. 서비스 규칙이 전역 규칙을 덮으면 전역 바인딩이 고아가 되어 **서비스 규칙도 읽는 아이템**에 `-1`을 쓴다. 정상 push는 sweep 뒤에 실행된다. 다른 트리거의 거짓 RECOVERY·재발화 가능성이 있다(**실제 발생은 추정**). | 활성 소비자가 있는 공유 아이템에는 해소 값을 쓰지 않는다. 종료할 트리거의 이벤트를 개별 해소한다. |
| 3 | 🔴 높음 | [ZabbixAlertBridge.java:774](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:774), [ApmAlertOrphanSweeper.java:208](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertOrphanSweeper.java:208) | **D3는 실패·경합 후 영구 미해소 경로가 남음** | push 실패의 `false`를 호출자가 무시하고 트리거를 내린 뒤 `orphaned`를 기록한다. 다음 sweep은 건너뛴다. push 성공도 RECOVERY 확인은 아니므로 설정 캐시 경합은 미해결(**발생 확률은 추정**). | 해소 요청과 완료를 구분하고 실패를 재시도한다. RECOVERY 확인 또는 개별 이벤트 해소가 끝나야 완료로 처리한다. |
| 4 | 🟡 중간 | [ApmReportBuilder.java:360](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/report/ApmReportBuilder.java:360), [ApmReportBuilder.java:479](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/report/ApmReportBuilder.java:479) | **UTC 리포트에 다른 기간의 SLO·합성 가용성을 싣음** | KST에서 `08-31~09-06` 일별 합은 UTC **08-30 15:00~09-06 15:00**이다. 본문의 UTC 창보다 앞선 9시간을 포함하고 끝의 9시간을 제외한다. 끝부분 장애가 빠지면 달성 여부까지 뒤집힌다. | epoch 경계를 통일한다. 일 집계로 정확히 자를 수 없다면 해당 지표의 실제 기간·시간대를 응답에 별도로 명시한다. |
| 5 | 🟡 중간 | [ApmReportBuilder.java:369](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/report/ApmReportBuilder.java:369) | **서로 다른 LATENCY 정의의 `good`을 무표시로 합산** | 일 스냅샷의 `defVersion`·`latencyThresholdMs`를 무시한다. 임계를 100ms에서 500ms로 바꾸면 같은 200ms 요청도 날짜에 따라 실패/성공으로 집계되지만, 리포트에는 정의 혼재 표시가 없다. 현재 target 사용과는 별개 문제다. | 정의별로 분리하거나 변경 구간을 표시한다. 현재 정의 기준으로 설명하려면 원자료로 다시 계산해야 한다. |
| 6 | 🟡 중간 | [ApmReportService.java:179](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/report/ApmReportService.java:179) | **최대 3기간 catch-up이 실제 중단 기간을 복구하지 못함** | 실제 오늘의 직전 기간에서 시작해 **앞으로** 진행한다. 다음 기간은 현재 열린 기간이므로 보통 즉시 종료한다. 여러 주 중단 후에도 직전 한 주만 생성한다. | 저장된 마지막 기간 또는 누락 기간에서 진행한다. 날짜 판단도 전달된 `now` 하나로 통일한다. |
| 7 | 🟡 중간 | [ApmReportService.java:75](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/report/ApmReportService.java:75) | **동시 lazy 백필은 멱등하지 않음** | 두 요청이 모두 “없음”을 읽고 insert하면 V55 UNIQUE에 한쪽이 실패한다. 충돌 재조회가 없어 그 요청은 catch-all HTTP 500으로 이어진다(**동시 실행 미재현**). | 집계 뒤 저장만 짧은 원자적 upsert로 처리하거나 UNIQUE 충돌 시 저장본을 재조회한다. |
| 8 | 🟡 중간 | [ApmJobQueryService.java:191](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/job/ApmJobQueryService.java:191) | **V56 이후 삭제된 서비스의 잡 상세를 분리 조회할 수 없음** | 목록은 `(NULL, jobName)` 행을 만들지만 `/runs`는 service 미지정이면 모든 서비스를 조회한다. 삭제된 서비스의 `nightly` 3건과 살아 있는 서비스의 2건이 있으면, 삭제된 행의 상세가 5건으로 열린다. | `service_id IS NULL`을 요청할 명시적 필터를 추가하고 목록→상세 계약에 반영한다. |
| 9 | 🟢 낮음 | [ApmDocRef.java:96](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/collector/install/ApmDocRef.java:96), [ApmDocRef.java:214](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/collector/install/ApmDocRef.java:214) | **공식 출처에 붙인 설명 두 곳이 부정확** | “4xx는 재시도하지 않는다”에는 [OTLP 규약의 429 예외](https://opentelemetry.io/docs/specs/otlp/#retryable-response-codes)가 있다. “Go 자동계측이 없다”도 [공식 Go 자동계측 발표](https://opentelemetry.io/blog/2025/go-auto-instrumentation-beta/)와 다르다. | 429 예외를 명시하고, Go 설명을 “이 가이드의 지원 방식은 수동 계측”으로 좁힌다. |

**추가 확인**

- **id·페이지네이션:** 상세 EP와 `ids/apmIds`의 저장소 분리는 올바르며, 같은 id가 양쪽에 있는 삭제 IT도 있다. 각 계열의 정렬이 병합 정렬과 일치하므로 `offset+limit` 프리페치는 고정 데이터에서 정확하다. 다만 `limit≤100`은 깊은 offset의 조회량을 제한하지 않는다.
- **요청 가중 평균:** p95·Apdex·가용성의 분모는 해당 값이 존재하고 요청 수가 양수인 서비스의 요청 합이다. 계약과 일치한다. 핵심 오류는 평균식보다 **#1의 직전 합계**다.
- **MissingServletRequestParameter:** 다른 EP의 동작도 바뀐다. `/users/zabbix/user-detail`의 `userid`, `/zabbix-manage/actions/options`의 `eventsource` 누락도 기존 HTTP 500에서 **HTTP 200 + `code:400`, `INVALID_DATA`**로 변경된다. 기존 `ApiError`·타입 불일치 400 처리 자체를 바꾸지는 않는다. §9.1에 전역 변경 의도는 있으므로 결함으로 세지는 않았지만, 비APM EP 회귀 검증은 빠져 있다.
- **references:** 모든 인용 위치를 수집해 enum 선언 순서로 해석하는 방식과 양방향 참조 테스트는 타당하다. 확인한 링크는 공식 문서·저장소·패키지 경로다. 일부 systemd·npm URL은 브라우저 도구 접근이 실패해 현재 접근 가능 여부는 미확인이다.

**불안 4건 판정**

1. **D3 — 해소 불가.** #2·#3 때문에 호출 순서 테스트만으로 완료 판정할 수 없다.
2. **리포트 시간·해상도·집계 — 부분 수용.** 월간 1h 해상도와 합성 백필 한계는 명시된 절충이다. UTC/로컬 혼용은 실제 집계 기간 오류(#4)다. HTTP 호출 동안 장기 트랜잭션을 피하는 선택은 타당하지만 저장 경합(#7)은 별도로 막아야 한다.
3. **D9 `isNew` — 조건부 통과.** 삭제 후 남은 단계와 순서 변경 단계는 기존 `httpStepId`를 유지한다. id 누락 시 이름 복원도 순서와 무관하다. 다만 순서를 바꾸려면 `no`도 갱신해야 하며, 새 단계는 `isNew:true`가 필요하다. 삭제·재정렬·추가를 함께 수행하는 테스트는 없다.
4. **V56·V55 보존 — 보존은 통과, 조회는 보완 필요.** V55는 기존 retention의 같은 cutoff를 사용하고, V56 이력은 기존 90일 정리 대상이다. NULL 조회 자체는 예외 없이 처리되지만 상세 분리에는 #8이 남는다.

**테스트 검출력:** `weeklyNumbersAndDelta`는 #1을 드러내는 입력을 이미 사용하면서 전체 증감을 검증하지 않는다. `batchCatchesUpClosedPeriods`는 실제 시계와 `now+1년`을 섞어 실제로 발생하지 않는 catch-up 조건을 만든다. D3 테스트는 Mockito 호출 순서만 확인하며, V56 테스트는 FK·NULL 저장까지만 확인한다. 페이지네이션 테스트에도 같은 날짜·같은 id의 경계와 여러 페이지를 합친 무누락 검증이 필요하다.

**다음 커밋 전 반드시 고칠 것**

- **#1~#3:** 잘못된 전체 증감, 공유 아이템 오염, 해소 실패의 재시도 부재.
- **#4~#8:** 집계 기간·SLO 정의의 명시적 처리, 실제 누락 기간 catch-up, 원자적 저장, NULL 서비스 상세 필터.
- 위 조건을 잡는 회귀 테스트와 FE의 `isNew` 연동을 보강하고, D3는 실제 Zabbix RECOVERY까지 확인해야 한다.
