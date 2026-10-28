# ZM-159 C5 5차(최종 확인) 검수

- 검수 대상: `C:\worktrees\zm-159-be`의 현재 미커밋 변경 17개 추적 파일 + 신규 파일 2개
- 비교 기준: `review_zm-159-c5-v4_codex.md`, `review_zm-159-c5.md` 하단 `4차 검수 반영 기록`, `HEAD` 대비 현재 diff
- 검수일: 2026-09-19
- 구현 코드는 수정하지 않았다. 이 검수 문서만 산출했다.

## 결론

**병합 승인 가능 — 4차 차단 R1 해소. 필수 결함 0건, 비차단 권장 3건.**

4차 R1의 두 원인은 의도대로 제거됐다.

1. 전달 단계는 `windowPages.set(i, null)`로 현재 페이지를 목록에서 먼저 떼고 소비자에 넘긴다. 이미 전달한 원본 페이지가 목록에 남지 않으므로 종전의 `확정 rows + 창 전체 원본 + 창 전체 복제본` 최대 약 2배 구조는 사라졌다. 전달 중 남는 중복은 현재 변환 중인 페이지 하나뿐이다.
2. 수신 단계는 이번 RPC의 행 상한을 `min(정책 상한, 소비자와 창 버퍼가 함께 쓸 수 있는 남은 자리)`로 낮추고 `limit=상한+1`을 요청한다. 따라서 응답을 받은 직후의 행 수 기준 초과는 판정용 1행으로 제한된다.

기본값에서 결과 보유 상한은 100,000행, history 1콜 상한은 10,000행이다. 논리적 최대 동시 생존량은 수신 판정 중 `보유 상한+1행`, 전달 중 `보유 상한+현재 페이지 1개(최대 10,000행)`다. 이는 **엄밀한 100,000 객체 절대 상한은 아니지만**, v4 반영 목표였던 “2배 중복 제거 + 페이지 하나의 명시적 headroom”에는 부합한다.

C6 `trend.get`은 `maxWindowRows`를 설정하지 않아 동적 콜 상한 분기가 실행되지 않고, 정책 창도 86,400초라 adaptive 창 계산이 종전 1일을 그대로 돌려준다. C8 alert는 `scanWindows`가 아니라 `scanByCursor`를 사용하므로 이번 변경의 직접 영향이 없다. 두 경로의 기존 넘침·분할·불완전 판정 의미는 유지된다.

## 발견 사항

### R1 · 권장(중간) · `engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixQueryExecutor.java:230-268`, `engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/timeseries/history/ZabbixHistoryServiceImpl.java:135-140`

**문제** · 잔여 보유량 때문에 `callMaxRows`가 0 또는 정책 상한보다 작아진 경우에도, 그 상한을 넘은 응답을 일반적인 “정책 행 상한 overflow”와 똑같이 기간/ID 분할한다. 더 쪼갤 수 없는 단위에서 보유 예산이 원인인데도 `NO_PROGRESS`로 보고될 수 있다.

**근거** · `callMaxRows`는 남은 자리가 0이면 0이 되고 요청은 `limit=1`이 된다(233~238행). 행이 하나라도 있으면 overflow로 판정한 뒤 기간을 1초까지, ID를 1개까지 계속 쪼갠 다음 `NO_PROGRESS`로 끝난다(241~268행). 서비스는 `rows.size() >= heldCap`일 때만 이를 `HELD_ROWS`로 바꾼다(137행). 예를 들어 남은 자리 2행인데 단일 item·단일 초에 3행이 있으면 새 행을 하나도 확정하지 못해 `rows.size() < heldCap`이고, 실제 원인은 보유 예산인데 `NO_PROGRESS`가 노출된다. 남은 자리가 이미 0인 경우에도 다음 데이터의 존재를 확인한 뒤 바로 멈추지 않고 불필요한 이진 분할 RPC를 수행한다.

완전성 자체는 안전하다. 결과는 `complete=false`이고 행 보유 상한도 넘지 않는다. 현재 소비자도 stop reason과 무관하게 raw를 버리고 fallback하므로 데이터 오판은 없다. 다만 원인 코드와 호출 효율이 흐려진다.

**제안** · `callMaxRows == 0`에서 데이터가 한 행이라도 확인되면 즉시 보유 예산 종료로 반환한다. 더 쪼갤 수 없는 단위에서 `callMaxRows < policy.maxRows` 때문에 overflow한 경우도 실행기 결과에 “잔여 보유 예산 바인딩”을 구분해 전달하고, history 서비스가 `HELD_ROWS`로 고정하도록 한다. `heldCap=2`, 단일 초 3행 및 “앞 창에서 cap을 정확히 채우고 다음 창에 1행” 반례로 호출 수와 사유를 함께 고정한다.

### R2 · 권장(낮음) · `engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixQueryExecutor.java:300-312`, `engine-zabbix/src/test/java/com/dmove/moveseye/zabbix/client/ZabbixQueryExecutorTest.java:759-785`

**문제** · 4차 R1 수정은 코드상 맞지만, 회귀 테스트는 여전히 “실행기 목록에서 전달 완료 페이지가 해제됐는가”를 검증하지 않는다. 이전의 2배 중복 구현으로 되돌아가도 현재 테스트가 통과한다.

**근거** · 프로덕션 코드는 콜백 전에 `windowPages.set(i, null)`을 수행하고 마지막에 `clear()`한다(305~312행). 반면 `windowBufferBudgetIsSharedWithConsumer`는 콜백에서 `held + page.size()`만 기록한다(775~779행). 실행기의 나머지 `windowPages`가 계속 모든 페이지를 참조하는지는 관찰하지 않으므로, v4에서 지적한 기존 테스트 공백이 그대로다. 이번 수정의 정확성은 테스트가 아니라 현재 구현의 참조 해제 순서를 정적으로 확인해 판정했다.

**제안** · 전달 로직을 “목록에서 페이지를 제거해 반환하는” 작은 단위로 분리해 직접 테스트하거나, 테스트 전용 관측 지점으로 콜백 시점의 미전달 버퍼 행 수를 기록한다. 첫 페이지 콜백 후 미전달 원본만 남고, 이미 전달된 원본은 버퍼 계산에서 빠지는지를 고정한다.

### R3 · 권장(낮음) · `engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixCallLimits.java:22-33,103-129`

**문제** · v4 R3의 외부 설정 마이그레이션 위험은 그대로이며, 클래스 상단 설정 키 목록에도 새 `zabbix.call.max-history-rows`가 아직 빠져 있다.

**근거** · 저장소 안에는 두 상한의 오버라이드가 없어 기본값 `10,000 < 100,000`으로 기동한다. 그러나 외부 환경/Vault에 과거 `zabbix.call.policy.history.get.max-rows=100000`을 고정한 배포는 새 기본 보유 상한 100,000과 같아져 123~129행의 기동 검증에 실패한다. 검증 자체는 옳지만 배포 전 외부 설정 확인이 필요하다.

**제안** · 배포 체크리스트에서 `zabbix.call.policy.history.get.max-rows < zabbix.call.max-history-rows`를 확인한다. 클래스 상단 설정 목록과 운영 설정 문서/릴리스 노트에 `max-history-rows`와 기동 실패 조건을 명시한다.

## 4차 R1 재판정 — 해소

### 전달 중 원본과 복제본 중복

- 창 전체 원본을 붙든 채 전체를 복제하던 구조는 제거됐다.
- 각 반복에서 `windowPages.set(i, null)`이 먼저 실행되고 그 페이지를 소비자에 전달한다.
- 소비자가 `Row`로 변환하는 동안 원본과 겹치는 것은 현재 페이지 하나뿐이다. 다음 반복으로 가면 이전 페이지 원본 참조도 교체된다.
- 기본 정책에서 이 headroom은 최대 history 1콜 상한 10,000행이며, 종전처럼 보유 상한 100,000행 전체가 다시 겹치지 않는다.

### 수신 순간 초과

- 기존 누적을 `P`, 현재 창 버퍼를 `B`, 보유 상한을 `H`라 하면 이번 콜 상한은 `min(policyMax, H-P-B)`다.
- 요청은 정확히 그 값의 `+1`을 보내고, 넘침 판정도 같은 값과 비교한다.
- 따라서 응답을 받은 직후 `P+B+page <= H+1`이다. 넘친 페이지는 창 버퍼에 편입하지 않고 분할 판단에만 쓴다.
- “작아진 limit에 정확히 닿은 응답”도 overflow로 오인하지 않고, `+1`행이 있을 때만 넘침으로 판정하므로 조용한 절단도 없다.

### 남은 한계

- 설정명 `max-history-rows`를 JVM에서 동시에 살아 있는 모든 객체 표현의 절대 행 수로 해석하면, 전달 중 현재 페이지 하나가 추가로 겹치므로 엄밀한 절대 상한은 아니다.
- 그러나 v4 반영 기록이 페이지 하나의 중복 headroom을 명시적으로 수용했고, 2배 증폭과 수신 시 cap 규모 초과는 제거됐다. 따라서 기존 차단 R1은 해소로 판정한다.

## C6 trend·C8 alert 및 넘침·분할 의미

- **C6 `trend.get`**: `ZabbixTrendServiceImpl`은 `maxWindowRows`를 주지 않는다. `callMaxRows`는 항상 정책 `maxRows`이고 요청/overflow 기준도 종전 `maxRows+1`/`>maxRows` 그대로다. 정책 창 86,400초도 adaptive 계산에서 그대로 유지된다. 불완전하면 예외로 끊는 계약도 변하지 않았다.
- **C8 alert**: `ZabbixAlertAdapter#scanHistory`는 `scanByCursor`와 `max-scan-rows`를 사용한다. 이번 변경이 들어간 `scanWindows`의 동적 상한·창 버퍼·전달 해제와 별도 경로다. page full 판정, cursor 전진, `BUDGET_ROWS/CALLS/TIME` 의미는 변하지 않았다.
- **history overflow**: 잔여 자리보다 데이터가 많으면 작은 `limit+1`로 overflow를 발견하고, 이전과 같이 기간 우선·ID 차선으로 쪼개 앞쪽 구간부터 확정한다. 데이터 누락을 완전으로 보고하는 경로는 확인되지 않았다. 단, 잔여량이 0/극소인 마지막 경계의 사유와 추가 호출은 R1 권장 사항이다.

## 우회(1콜) 경로 계약 경계

`scanHistoryByItemids`가 명시 limit, 기간 누락 또는 DESC 때문에 분할을 우회할 때의 동작은 다음과 같이 정리된다.

| 조건 | 유효 요청 상한 | 판정 |
|---|---:|---|
| 실제 결과가 유효 상한보다 적음 | `min(요청 N 또는 100,000 안전핀, 보유 예산)` | 소스가 끝난 것이므로 `complete=true` |
| 명시 N이 있고 N건을 받음 | N | 요청한 상위 N건을 충족했으므로 `complete=true` |
| 명시 N보다 보유 예산이 작고 예산까지 받음 | 보유 예산 | `complete=false`, `HELD_ROWS` |
| 명시 N이 없고 100,000 안전핀에 닿음 | 100,000 | `complete=false`, `ROW_CAP` |
| 명시 N이 없고 설정/명시 보유 예산이 안전핀보다 작으며 예산에 닿음 | 보유 예산 | `complete=false`, `HELD_ROWS` |
| 보유 예산 0 | 0, RPC 없음 | `complete=false`, `HELD_ROWS` |

이 경계는 구현과 새 테스트가 일치한다. `getHistoryByItemids`와 `getRange`는 새 설정 상한을 끌어오지 않고 종전 100,000 안전핀/명시 limit의 1콜 요청 body를 유지한다. 기존 Host/ApmSynthetic 등 레거시 소비자의 최신 구간·절단 감지 의미도 바뀌지 않는다.

## 검증 결과

- `git diff --check`: 오류 없음.
- 핵심 관련 테스트 재실행: `ZabbixQueryExecutorTest`, `ZabbixHistoryServiceImplTest`, `ZabbixMetricAdapterTest` 통과.
- 전체 재실행(`--rerun-tasks`):
  - root `:test`: **3,929 tests / 0 failures / 0 errors / 0 skipped**
  - `:engine-zabbix:test`: **273 tests / 0 failures / 0 errors / 0 skipped**
- 컴파일 경고는 기존 deprecated/unchecked 및 `javax.annotation.meta.When` 관련 경고뿐이었다.
- 검수 전후 미커밋 파일 목록은 동일하다. 구현 코드는 수정하지 않았다.

## 종합 판정

**병합 승인 가능.** 4차의 유일한 차단 사유였던 최대 약 2배의 원본/복제본 중복 보유와 수신 시 cap 규모 초과는 각각 “현재 페이지 하나”와 “판정용 1행”으로 제한됐다. C6 trend와 C8 alert의 기존 스캔 의미는 유지되고, 우회 1콜의 완전성·`HELD_ROWS`/`ROW_CAP` 경계와 레거시 안전핀도 의도대로 고정됐다.

남은 R1~R3은 결과 완전성이나 메모리 안전을 깨는 병합 차단 결함이 아니다. R1은 잔여량 소진 경계의 사유 정확도와 불필요 RPC, R2는 핵심 참조 해제의 회귀 테스트 공백, R3은 외부 설정 배포 절차 문제다. 가능하면 병합 전 보완하되, 최종 C5 승인 자체를 막을 수준은 아니다.
