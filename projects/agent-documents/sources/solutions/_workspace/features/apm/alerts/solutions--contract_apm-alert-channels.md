# APM 알림 채널(독자 창구) 관리 API 계약 — 알람 재설계 단위 4 (2026-10-11 확정) · 단위 6c 개정 (2026-10-21)

> BE 정본: `moveseye-be-spring` 브랜치 `apm-alert-history`(워크트리 `C:\worktrees\apm-c05-followup`, 미커밋) — `premium.apm.alert.ApmAlertChannelController` → `alert.notify.ApmAlertNotificationAdmin`.
> 설계 `features/apm/alerts/apm-alert-delivery-redesign-20261010.md` §3.2·§6(🔴5·🔴6·🔴7)·§7 단위 4. 검수 `_archive/features/apm/alerts/review_apm-alert-unit4-dispatcher-20261011_codex.md`·`…_codex2.md`(2차 반영: 결과 불명 보존·결과 기록 직렬화·라이선스 만료 중 안전 명령)·`…_codex3.md`(3차 반영: 결과 불명 DEAD도 RESOLVED 전송)·`…_codex4.md`(4차 반영: 순서 버전 계약·늦은 FIRED 뒤 RESOLVED 재전송·interrupt 결과 불명)·`…_codex5.md`(5차 조건부 승인 — §7 채널 구현 의무 고정).
> FE 소비는 단위 8(채널 상태·일시정지·폐기·재시도·재조정 화면). **이 문서가 그 입력이다.**
> **단위 6c 개정(2026-10-21, 추가만)**: 재조정 이어하기 커서(`cursor` 쿼리·`nextCursor`), 원시 id 구간 페이지, statement timeout 부분 결과, 해소 시점 FIRED+RESOLVED 짝, 롤링 배포 보충(V88). 설계 `apm-alert-unit5-6-design-20261011.md` §17·§17.10, 검수 `_archive/features/apm/alerts/review_apm-alert-unit6c-design-20261021_codex{,_r2}.md`. 변경 표는 §8.
> 🔴 지금 운영에는 **등록 채널(AlertChannel 빈)이 0개**다(2026-10-10 사용자 결정 — 메일·웹훅 발송 구현 대기). 그래서 목록은 빈 배열이고 채널 명령은 전부 `APM_ALERT_CHANNEL_NOT_FOUND`다.

## 0. 공통

| 항목 | 값 |
|---|---|
| 권한 | 전 EP **`apm.edit`**(`ApmAccessChecker.requireEdit` — 관리자 무조건 통과, Zabbix 미연동 admin 함정 없음) |
| 라이선스 | 컨트롤러 `@RequiresFeature(Feature.APM)`. 🔴 단 **#1 상태·#3 일시정지·#5 폐기**는 `@LicenseExempt`로 만료 중에도 열린다(운영 안전 명령, §5.1 매트릭스) |
| 응답 envelope | 성공 `{status:"success", code:200, data}` / 실패 **HTTP 200** + `{status:"error", code:<숫자>, errorCode, message}`(전역 계약 — 401만 실제 상태코드) |
| 권한 거부 | HTTP 200 + body `code: 403` |
| `{channel}` | 채널 키(`AlertChannel.key()`, 1~32자, 예 `email`) |
| 다중 BE | 상태 변경 명령(activate·deactivate·reconcile·discard)은 DB advisory lock으로 노드 간 직렬화된다. `GET`의 `dispatcher`는 **응답한 노드 하나**의 지표다 |

### 채널 키 판정
| 키 상태 | activate · reconcile | deactivate · discard · retry-dead | GET 목록 |
|---|---|---|---|
| 모르는 키(등록 빈·상태 행·통지 행 어디에도 없음) | `APM_ALERT_CHANNEL_NOT_FOUND` | `APM_ALERT_CHANNEL_NOT_FOUND` | 안 보임 |
| **빈만 없는 키**(구현 제거, 상태·통지 행 남음) | `APM_ALERT_CHANNEL_NOT_FOUND`(보낼 주체 없음) | **허용**(잔여 큐 관리) | `registered:false`로 보임 |
| 등록된 키 | 허용 | 허용 | 보임 |

## 1. 엔드포인트

| # | 메서드·경로 | 요청 | 응답 `data` |
|---|---|---|---|
| 1 | `GET /apm/alert-channels` | — | `ChannelOverview` |
| 2 | `POST /apm/alert-channels/{channel}/activate` | — | `ActivationResult` |
| 3 | `POST /apm/alert-channels/{channel}/deactivate` | — | `{ changed: boolean }` |
| 4 | `POST /apm/alert-channels/{channel}/reconcile?cursor=` | query `cursor`(선택 — 앞선 활성화·재조정 결과의 `nextCursor`. 없으면 새 스캔) | `ActivationResult` |
| 5 | `POST /apm/alert-channels/{channel}/discard?force=false` | query `force`(선택, 기본 false) | `DiscardResult` |
| 6 | `POST /apm/alert-channels/{channel}/retry-dead` | — | `{ retried: number }` |
| 7 | `POST /apm/alert-notifications/{id}/retry` | path `id`(통지 행 id, long) | `{ retried: true }` |

### 1.1 동작
1. **목록** — 부작용 없음. 채널 = 등록 빈 ∪ 상태 행.
2. **활성화** — 🔴 **채널 빈이 모든 BE 노드에 배포된 뒤** 부른다. 꺼짐→켜짐이면 그때 열린 알람에 FIRED, 재활성화면 꺼진 동안 닫힌 알람의 RESOLVED를 만든다(페이지 처리, §3). 이미 켜져 있으면 `activated:false`(무동작). 일부 노드에만 빈이 있는 상태로 켰다면 배포 완료 뒤 4번(reconcile)을 **커서 없이** 한 번(보충 범위·한계는 §3.2).
3. **일시정지** — 새 통지 행을 만들지 않고, 쌓인 PENDING은 **보내지 않은 채 유지**한다(다시 켜면 이어서 나간다). `changed:false` = 이미 꺼짐. 이미 claim된 한 묶음(최대 `batch-size`건)은 끝까지 나갈 수 있다(at-least-once).
4. **재조정** — 켜진 채널에서 열린 알람의 빠진 FIRED·닫힌 알람의 빠진 RESOLVED(와 §3.2의 짝)를 만든다. 멱등. 꺼진 채널은 `APM_ALERT_CHANNEL_STATE_INVALID`. `complete:false`이고 `nextCursor`가 있으면 그것을 `cursor`로 넘겨 **이어 부른다**(앞부분을 다시 보지 않는다). `nextCursor`가 null인 `complete:false`(일시정지·`superseded`)는 이어 부를 것이 없다 — 다시 켜면 새 활성화가 보충한다. 커서 없이 부르면 언제나 새 스캔(지금의 최대 이벤트 id까지)이다.
5. **폐기** — §2.
6. **일괄 재시도** — 채널의 DEAD·SKIPPED → PENDING(시도 수·claim 초기화). 꺼진 채널이면 PENDING으로 일시정지된 채 남는다. 같은 알람의 FIRED → RESOLVED 순서는 디스패처가 지킨다.
7. **단건 재시도** — DEAD·SKIPPED 행만. 같은 알람·채널의 짝(FIRED·RESOLVED)도 DEAD·SKIPPED면 **함께** 되살린다(RESOLVED만 되살리면 FIRED가 SENT가 아니라 영영 안 나가고, FIRED만이면 채널이 "열림"만 안다).

## 2. 폐기(discard) 의미 — 🔴 검수 🔴1·🔴2

배타 advisory lock을 잡은 **한 트랜잭션** 안에서 아래 순서로 판정한다(다른 노드의 activate·deactivate·reconcile·디스패처 claim과 직렬화):

1. 채널이 **활성**(등록 빈 ∩ enabled)이면 거부 → `APM_ALERT_CHANNEL_STATE_INVALID`. 먼저 3번(일시정지). 빈이 없는 채널은 enabled여도 폐기할 수 있다.
2. **리스가 살아 있는 PROCESSING(전송 중)이 하나라도 있으면 거부** → `APM_ALERT_CHANNEL_BUSY`(force여도). 일시정지 뒤에는 새 PROCESSING이 생기지 않으므로 최대 리스(기본 300초) 안에 풀린다 — 잠시 뒤 다시.
3. PENDING → **SKIPPED**. 단 외부에 열림이 남을 수 있는 행은 **남긴다**:
   - **리스 만료 PROCESSING** = "안 보냈다"가 아니라 **"보냈는지 모른다"**(외부 전달 뒤 SENT 기록 전에 노드가 멈췄을 수 있다) → PROCESSING 그대로(`keptUncertain`). 앞 시도가 timeout·리스 만료로 끝난 적 있는 PENDING(`delivery_uncertain`)도 같이 남긴다.
   - FIRED가 **SENT·PROCESSING이거나 결과 불명**인 RESOLVED → PENDING 그대로(`keptResolved`).
   - 다시 켜면 결과 불명 FIRED는 재claim돼 한 번 더 나가고(at-least-once), 그 뒤 RESOLVED가 나간다.
   - "BUSY로 거부" 대신 "보존"인 이유: 일시정지된 채널의 리스 만료 행은 디스패처가 다시 가져가지 않는다(활성 채널만 claim) → 거부하면 결과를 확정할 길이 없어 일반 폐기가 영원히 막힌다.
4. `force=true`일 때만 3의 행까지 SKIPPED. 그 수는 `openLeftExternally`, `warning`에 **"외부 채널에 열린 알람이 남을 수 있음"**, 서버 로그는 WARN.
5. 🔴 전송 결과 기록(SENT·RETRY·DEAD)은 같은 advisory를 **공유**로 잡아 폐기(배타)와 직렬화된다. 늦게 깨어난 노드의 SENT는 폐기 앞이면 폐기가 그것을 보고 RESOLVED를 보존하고, 뒤면 보존된 행의 토큰이 그대로라 기록이 성공한다 — 어느 순서든 "FIRED SENT · RESOLVED PENDING"으로 일관.

되살리기는 6번(retry-dead) 또는 7번.

## 3. 활성화·재조정 페이지 처리 — 검수 🟡1 · 단위 6c
상태 뒤집기(활성화)는 한 트랜잭션이다. 켤 때마다 채널 세대(`activation_generation`, V88)가 1 오르고, 그 트랜잭션이 본 최대 이벤트 id를 `activation_event_hwm`으로 남긴다. 커서 없는 재조정은 먼저 **초기화 트랜잭션**(잠금 → 켜짐 확인 → 세대·지금의 최대 id 확정, 쓰기 없음)을 커밋한다.

보충은 **고정 구간 `(0, hwm]`**을 원시 이벤트 id로 `app.apm.alert-notify.reconcile-page-size`(기본 500)개씩 잘라 **페이지마다 따로** 배타 잠금을 잡고 놓는다. 할 일이 0건인 구간도 끝까지 전진하므로 유한 번에 끝난다. 마지막 구간이 hwm에 닿으면 끝이다(빈 페이지를 더 보지 않는다 — 페이지 크기의 정확한 N배면 `pages = N`). 할 일이 있는 이벤트:
1. 열림 ∧ 이 채널 FIRED 없음 → FIRED
2. 이 채널 FIRED 있음 ∧ 닫힘 ∧ RESOLVED 없음 → RESOLVED(재활성화 — 꺼져 있던 동안 닫힘)
3. 닫힘 ∧ FIRED 없음 ∧ `id > activation_event_hwm` → FIRED+RESOLVED(§3.2)

멈춤:
- 전체가 `reconcile-max-seconds`(기본 300초)를 넘으면 그 페이지까지 하고 `complete:false` + `nextCursor`.
- 한 페이지가 `reconcile-statement-timeout-ms`(기본 5000ms, **문장별** statement timeout)에 걸리면 그 페이지만 롤백·집계 제외, `timedOut:true` + `complete:false` + `nextCursor` = 마지막으로 커밋한 지점(첫 페이지면 시작 커서). HTTP 200(부분 결과). 같은 페이지가 반복해서 넘으면 자동 전진은 보장되지 않는다 — 이 값을 올리거나 페이지 크기를 줄인다. 사용자 취소·관리자 종료로 끊긴 쿼리(같은 SQLSTATE 57014라도 statement timeout이 아닌 것)는 부분 결과로 삼키지 않고 오류가 난다.
- 도중 일시정지 → 다음 페이지 첫머리에서 멈추고 `complete:false`(`nextCursor` null).
- 도중 껐다 켜 세대가 바뀜 → `superseded:true`·`complete:false`(`nextCursor` null — 새 활성화가 자기 보충을 한다).
- 페이지 크기·timeout은 트랜잭션 비용의 절대 상한이 아니다(문장별 timeout이고, 경계 조회 뒤 늦게 커밋된 낮은 id가 구간에 보일 수 있다).

`complete:true` = **그 커서의 고정 구간을 끝까지 훑었다**. 구간 안에 나중에 커밋된 낮은 id는 같은 커서로 다시 보지 않는다 — 커서 없이 새로 부르면 새 hwm으로 처음부터 본다(멱등).

### 3.1 이어하기 커서
- 불투명 문자열(최대 512자) — `v1.<payload>.<서명>`. 서버가 채널·세대·진행 지점·구간 끝을 담아 서명한다(키는 JWT 비밀에서 용도 분리 파생 — 어느 BE 노드에서 받은 커서든 다른 노드가 검증). **FE·운영자는 해석하지 않고 그대로 되돌려 보낸다.**
- 거부(`APM_ALERT_RECONCILE_CURSOR_INVALID`): 형식·서명 불일치, 다른 채널의 커서, 그 사이 채널을 껐다 켬(세대 다름). 받으면 커서 없이 새로 부른다.

### 3.2 해소 시점 짝 · 롤링 배포 보충 · 한계
- **해소 시점 짝**: 켜진 채널에서 알람이 닫힐 때 그 채널 FIRED가 없으면 **FIRED와 RESOLVED를 함께** 만든다(한 문장 — 둘이 같이 있거나 같이 없다). 활성화 순간 열려 있던 알람이 보충 커서가 닿기 전에 닫혀도 채널이 안다. **"해소만" 가는 일은 없다**(FIRED가 먼저 SENT여야 RESOLVED가 나간다, §6). 이미 있는 FIRED가 SKIPPED·DEAD면 되살리지 않고 RESOLVED만 붙는다.
- **롤링 배포 보충(최선 노력)**: 해당 채널 빈이 없는 노드는 통지를 적재하지 않는다. 켠 뒤(`id > activation_event_hwm`) 그런 노드에서 열리고 닫힌 알람은 재조정이 짝으로 채운다. 🔴 `activation_event_hwm`은 뒤집기 SELECT의 스냅샷이라 정확한 활성화 경계가 아니다:
  - 과잉 — hwm 조회 뒤·뒤집기 커밋 전에 빈 없는 노드가 열고 닫은 알람에도 짝이 갈 수 있다.
  - 과소 — 낮은 id가 늦게 커밋된 경우, 그리고 `id ≤ activation_event_hwm`인 닫힌·FIRED 없는 알람은 **채우지 않는다**(켜기 전에 닫힌 것과 가를 수 없다).
  - 보충할 때는 늘 짝으로 보내지만(해소 단독 없음), **일부 알람은 짝 자체가 누락될 수 있다** — 해소 단독 방지와 보충 완전성은 별개다.
- **완전성은 해당 채널 빈을 모든 BE 노드에 배포한 뒤 켰을 때만** 보장한다(§1.1-2·§7.5).

공정성: 전이·claim·결과 기록은 공유 잠금을 **대기**로 잡아 PG 잠금 큐에서 페이지 커밋 순간 먼저 받는다(루프의 다음 try-lock이 양보). 일시정지는 상태 행을 먼저 바꾸는 1단계라 루프와 잠금 경쟁을 하지 않고, 활성화는 이미 켜져 있으면 잠금 없이 끝난다. 시각(`activated_at`·`updated_at`·폐기 진단)은 전부 DB 시각.

## 4. 타입

```ts
type ChannelOverview = {
  channels: ChannelStatus[];          // 지금 운영은 []
  dispatcher: DispatchStats;          // 🔴 응답한 BE 노드 하나, 기동 이후 누적
};

type ChannelStatus = {
  channel: string;
  registered: boolean;                // 이 노드에 채널 빈이 있다
  enabled: boolean;                   // 사용 설정(apm_alert_channel_state.enabled)
  active: boolean;                    // registered && enabled — false면 일시정지(PENDING 유지)
  timeoutSeconds: number | null;      // 채널 1회 전송 상한. 빈이 없으면 null
  pending: number;                    // 백오프 예약 포함
  processing: number;                 // 전송 중 — 리스가 살아 있는 PROCESSING만
  uncertain: number;                  // 결과 불명 보존 — 리스가 만료된 채 남은 PROCESSING(일시정지 중이면 다시 켤 때까지)
  oldestUncertainAgeSeconds: number | null;  // 그중 가장 오래된 것의 리스 만료 뒤 경과
  sent: number;
  dead: number;
  skipped: number;
  oldestPendingAgeSeconds: number | null;  // 큐 나이 — 가장 오래된 PENDING의 생성 뒤 경과(일시정지·백오프 포함)
  dueLagSeconds: number | null;            // due lag — 보낼 때가 지났는데 아직 안 나간 지연(백오프 대기 제외)
};

type DispatchStats = {
  lastRunAt: string | null;           // 등록 채널 0개면 한 번도 안 돌아 null
  lastRunSummary: string | null;      // 사람용 한 줄(파싱 금지)
  claimed: number;                    // 전송 소유권 획득 누적(리스 만료 재claim 포함)
  sent: number; retried: number; dead: number;
  lost: number;                       // CAS 실패(다른 노드·폐기) 또는 리스 부족으로 안 보냄
  leaseExpired: number;               // crash — 보내던 노드가 끝내지 못한 횟수
  timedOut: number;                   // 채널 timeout으로 끊은 전송
  rejected: number;                   // 전송 스레드가 모두 묶여(interrupt 무시 호출) 실행조차 못 하고 RETRY로 돌린 누적
  stuckDeliveries: number;            // 지금 값 — timeout으로 끊었는데도 아직 끝나지 않은 호출 수
  deliveryThreads: number;            // 전송 스레드 풀 크기(고정, app.apm.alert-notify.delivery-threads 기본 4)
  lateFiredDetected: number;          // 포기했던(timeout·interrupt) FIRED가 늦게 성공한 것을 감지한 누적
  resolvedResendScheduled: number;    // 그 결과 실제로 RESOLVED 재전송을 예약한 누적(RESOLVED가 아직 대기면 0이라 감지보다 작을 수 있다)
};

type ActivationResult = {
  activated: boolean;                 // 이번 호출로 꺼짐→켜짐(재조정·이미 켜짐은 false)
  bootstrapFired: number;             // 새로 만든 FIRED
  catchUpResolved: number;            // 새로 만든 RESOLVED
  scanned: number;                    // 할 일이 있어 잠근 이벤트 수
  pages: number;                      // 커밋한 페이지 수(statement timeout으로 롤백된 페이지는 빼고)
  complete: boolean;                  // true = 이 스캔의 고정 구간 (0, hwm]을 끝까지 훑음
  lockAttempts: number;               // 잠금 경합 재시도 포함 트랜잭션 시도 수
  elapsedMs: number;
  nextCursor: string | null;          // 6c — 시간 상한·statement timeout으로 멈췄을 때만. reconcile?cursor=로 이어 부른다
  timedOut: boolean;                  // 6c — 한 페이지가 statement timeout(그 페이지 롤백·집계 제외)
  superseded: boolean;                // 6c — 도중에 껐다 켜 세대가 바뀌어 멈춤(이어 부를 것 없음)
};

type DiscardResult = {
  skipped: number;
  keptResolved: number;               // FIRED가 SENT·PROCESSING이라 남긴 RESOLVED(force=false)
  keptUncertain: number;              // 남긴 리스 만료 PROCESSING — 전송 결과 불명(force=false)
  openLeftExternally: number;         // force로 버린 위 두 종류
  force: boolean;
  warning: string | null;             // force로 버렸으면 "외부 채널에 열린 알람이 남을 수 있음 …", 남겼으면 안내
};
```

## 5. 오류 코드 (HTTP 200 + body)

| errorCode | body `code` | 언제 |
|---|---|---|
| `APM_ALERT_CHANNEL_NOT_FOUND` | 404 | §0 키 판정 표 |
| `APM_ALERT_CHANNEL_STATE_INVALID` | 400 | 꺼진 채널 재조정 · 켜진 채널 폐기 |
| `APM_ALERT_CHANNEL_BUSY` | 409 | 폐기 시 전송 중 행 있음 · 상태 변경 잠금을 60초 안에 못 잡음(알람 처리 진행 중) — 둘 다 "잠시 뒤 다시" |
| `APM_ALERT_NOTIFICATION_NOT_FOUND` | 404 | 7번의 id 없음 |
| `APM_ALERT_NOTIFICATION_NOT_RETRYABLE` | 400 | 7번 대상이 DEAD·SKIPPED가 아님 |
| `APM_ALERT_RECONCILE_CURSOR_INVALID` | 400 | 4번의 `cursor`가 형식·서명·채널이 틀리거나, 그 사이 껐다 켜 세대가 다름(6c) — 커서 없이 다시 |
| (공통) `FORBIDDEN`/code 403 | 403 | `apm.edit` 없음 |
| (라이선스) `LICENSE_FEATURE_REQUIRED` | 402 | APM 미보유·미구매 — §5.1 |
| (라이선스) `LICENSE_READ_ONLY` | 403 | 만료(READ_ONLY)의 쓰기 — §5.1 |
| (라이선스) `LICENSE_REQUIRED` | 403 | 키 없음·위조(LOCKED) — §5.1 |

### 5.1 라이선스 매트릭스 — 실제 인터셉터 순서(`AccessModeInterceptor` → `FeatureInterceptor` → 컨트롤러)

| 상태 | #1 상태 · #3 일시정지 · #5 폐기 (`@LicenseExempt` + 자체 판정) | #2 활성화 · #4 재조정 · #6 retry-dead · #7 retry |
|---|---|---|
| FULL + APM 보유 | 통과 | 통과 |
| FULL + APM 미구매 | `LICENSE_FEATURE_REQUIRED`(자체 판정) | `LICENSE_FEATURE_REQUIRED`(FeatureInterceptor) |
| **만료(READ_ONLY) + APM 보유했음** | **통과** — 외부 전송을 멈추고 버릴 수 있어야 한다 | `LICENSE_READ_ONLY`(AccessModeInterceptor가 먼저 POST 차단) |
| 만료(READ_ONLY) + APM 미보유 | `LICENSE_FEATURE_REQUIRED`(자체 판정) | `LICENSE_READ_ONLY`(AccessModeInterceptor가 먼저) |
| 잠금(LOCKED: 키 없음·위조) | `LICENSE_FEATURE_REQUIRED`(features 비어 자체 판정 거부) | `LICENSE_REQUIRED`(AccessModeInterceptor) |

- 자체 판정 = `LicenseProvider.current().features()`에 APM — "APM을 **보유했던** 설치본"(만료·보관돼도 남는다). 판정 순서는 인터셉터와 같다(라이선스 → `apm.edit` 권한).
- 🔴 **정책 변경(2026-10-11)**: ArchUnit A5 허용 목록에 `ApmAlertChannelController`의 `list`·`deactivate`·`discard` 세 메서드를 이름으로 추가했다. A5-d가 "면제는 정확히 이 셋, 셋 다 스스로 `LicenseProvider.current()`에 닿는다"를 검사한다.
- 디스패처에는 라이선스 게이트가 없다 — 만료 중에도 이미 적재된 통지는 나간다(멈추려면 #3).

## 6. 통지 행 의미(참고 — 화면 표시용)
- 상태: `PENDING | PROCESSING | SENT | DEAD | SKIPPED`. 전이 = `FIRED | RESOLVED`. 행 = 알람 이벤트 × 전이 × 채널(멱등 키 `apm-alert:{eventId}:{transition}:{channel}`).
- 🔴 **`attempts` = 전송 소유권 획득(claim) 횟수**다. 외부 전송 호출 수가 아니다 — 보내던 노드가 죽어 리스가 만료돼도 1회로 센다(반복 사망 행도 `max-attempts`(기본 10)에서 DEAD로 수렴).
- 순서: 같은 알람·채널의 RESOLVED는 FIRED가 **끝난 뒤**에만 나간다 — SENT, 또는 **결과 불명 DEAD**. FIRED가 SKIPPED이거나 **확실히 안 나간** DEAD면 RESOLVED는 SKIPPED.
- 🔴 **결과 불명**(V78 `delivery_uncertain`): 시도 하나라도 리스 만료(보내던 노드가 결과를 못 적고 멈춤) 또는 채널 timeout(interrupt를 무시한 호출이 늦게 성공할 수 있음)으로 끝난 행. 한 번 서면 내리지 않는다. 이런 FIRED는 마지막 시도에서 DEAD가 돼도 **RESOLVED를 보낸다** — 외부 알람이 해소로 수렴한다. 수신 측에 FIRED가 없을 수도 있다(정말 안 갔던 경우): **at-least-once 계약 범위**이며 수신 측은 멱등 키(`apm-alert:{eventId}:{transition}:{channel}`)로 처리한다(짝 없는 해소는 무시). 일시정지 → 폐기(보존) → 재활성화 경로도 같다.
- 🔴 **순서 버전 계약 — 채널 구현 의무** (`AlertNotification.stateVersion()`): 이벤트 단위 단조 증가, FIRED = 1 · RESOLVED = 2(같은 이벤트는 다시 열리지 않는다 — 재발은 새 이벤트). **수신 측은 이벤트별로 지금 가진 것보다 큰 stateVersion만 적용한다(늦게 도착한 FIRED는 무시).** timeout·노드 중단 뒤 늦게 성공한 FIRED가 이미 도착한 RESOLVED 뒤에 닿을 수 있기 때문이다. 상태를 갖지 않는 채널(메일)은 본문에 이벤트 id·발생 시각(`firedAt`)·해소 시각(`resolvedAt`)·전이를 보여 사람이 순서를 판단하게 한다.
- **늦은 FIRED 보정(디스패처)**: timeout·interrupt로 포기한 FIRED 호출이 나중에 **성공**하면, 같은 `(event, channel)`의 RESOLVED를 다시 보낸다 — SENT면 PENDING으로(시도 수 초기화), 보내는 중이면 결과 기록 때 SENT 대신 PENDING으로(V78 `resend_requested`). 멱등 키는 그대로. ⚠️ 이 추적은 노드 메모리라 노드가 죽으면 사라진다 — 그 경우의 방어선은 위 순서 버전 계약이다.
- **결과 불명의 출처**: 리스 만료(노드 중단), 채널 timeout, **전송 시작 뒤 디스패처 스레드 interrupt**(종료 등). 시작 전 interrupt·스레드 고갈 거절은 "안 보냄"(불명 아님). interrupt를 받으면 그 묶음의 남은 claim은 보내지 않고 되돌린다(시도 수 원복).
- DEAD 사유(V78 `dead_reason`): `FAILED`(채널이 영구 실패라고 답함) | `EXHAUSTED`(시도 소진 — RETRY·timeout·리스 만료 반복). 사유와 결과 불명은 별개다.
- 보장: **at-least-once** — 같은 통지가 두 번 갈 수 있다(전송 성공 뒤 기록 전 중단, 리스 만료).
- 백오프: `min(60분, 2^attempts분)`. 시각의 정본은 DB(`localtimestamp`).
- 채널 SPI `AlertChannel.timeout()` 기본 10초. 기동 시 `batch-size × timeout < lease-seconds`가 아니면 **기동 실패**. timeout을 넘긴 호출은 interrupt 후 RETRY, interrupt를 무시해 남은 호출은 `stuckDeliveries`로 보이고, 고정 풀(`delivery-threads`)이 다 차면 새 전송은 실행되지 않고 RETRY(`rejected`).
- 리스 만료 PROCESSING = 전송 결과 불명(§2-3). 결과 기록(SENT·RETRY·DEAD)은 폐기와 직렬화된다(§2-5).

## 7. 🔴 채널 구현 의무 (독자 창구를 붙이는 사람 필독 — 5차 검수 조건)

실제 채널(메일·웹훅·티켓 등)은 아래를 **모두** 지킨 뒤에만 활성화(#2)한다. 정본은 SPI 주석 `alert.notify.AlertChannel`·`DeliveryResult`·`AlertNotification`.

### 7.1 결과 구분 — `DeliveryResult`
| 결과 | 언제 쓰나 | 디스패처 처리 |
|---|---|---|
| `SENT` | 수신 측이 받았음을 확인 | SENT |
| `RETRY` | 일시 실패 + 외부에 **확실히 안 감**(요청 전 실패·연결 거절·명시적 거절) | 백오프 재시도, 소진 시 DEAD(EXHAUSTED) |
| `RETRY_UNCERTAIN` | 요청은 나갔는데 **결과 모름**(응답 유실·connection reset·read timeout·처리 여부 불명 5xx) | `delivery_uncertain=true` + 백오프 재시도. 소진돼 DEAD여도 **RESOLVED를 보낸다** |
| `FAILED` | 영구 실패 + **확실히 안 감**(잘못된 수신자 등) | 곧바로 DEAD(FAILED). 불명 이력 없으면 짝 RESOLVED SKIPPED |
| 예외 | — | **`RETRY_UNCERTAIN`으로 취급**(요청 전/후를 구분해 주지 않으므로 안전 쪽: 잘못 "안 감"이면 외부 알람 영구 열림, 잘못 "모름"이면 해소 한 통 더) |

- 🔴 `RETRY`·`FAILED`를 "갔을 수도 있는" 경우에 쓰면 마지막 시도에서 FIRED가 "확실히 안 간 DEAD"가 되고 RESOLVED가 버려져 **외부 알람이 영원히 열린다**. 가능하면 provider receipt·상태 조회와 멱등 키로 먼저 확정한다.
- 디스패처가 스스로 결과 불명으로 보는 것: 채널 `timeout()` 초과, 전송 시작 뒤 디스패처 interrupt, 리스 만료(노드 중단).

### 7.2 payload — `AlertNotification.toPayload()`
- Jackson 직렬화에 기대지 않는 **명시적 맵**(키 순서 고정, 24개). 상태형 채널은 이것을 그대로 보낸다.
- 반드시 포함(앞 6개): `eventId`(long) · `stateVersion`(FIRED=1, RESOLVED=2) · `transition` · `idempotencyKey`(`apm-alert:{eventId}:{transition}:{channel}`) · `firedAt` · `resolvedAt`(FIRED면 null). 시각은 ISO-8601 로컬 시각 문자열, UUID는 문자열, 값이 없는 키도 null로 둔다.
- 나머지: `resolveReason`·`channel`·`notificationId`·`attempt`·`scope`·`ruleUid`·`ruleKind`·`ruleDeleted`·`threshold`·`thresholdUnit`·`windowMin`·`value`·`serviceUid`·`serviceName`·`serviceEnv`·`serviceDeleted`·`sloUid`·`sloName`. 키 이름은 계약이다.

### 7.3 수신 측 적용 규칙
- 상태형 수신 측은 `(eventId, stateVersion)`을 **영속·원자적으로** 저장하고, 지금 가진 것보다 **큰 stateVersion만 적용**한다(늦게 도착한 FIRED 무시).
- 🔴 같은 멱등 키의 RESOLVED **재전송**을 "중복"으로 버리기만 하는 수신기는 부적합 — 늦은 FIRED가 남긴 열림이 안 닫힌다. 멱등 키 dedup만으로는 부족하고 stateVersion 비교가 필요하다.
- 상태를 갖지 않는 채널(메일)은 본문에 이벤트 id·발생 시각·해소 시각·전이를 보여 사람이 순서를 판단하게 한다.

### 7.4 적합성 테스트 — `AlertChannelConformanceKit`(test support)
- 실제 채널 구현은 `src/test/.../alert/notify/AlertChannelConformanceKit`을 **상속한 테스트**를 하나 만든다: `channel()`·`externallyOpen(eventId)`(외부 수신 측 상태)·`armResponseLoss()`(다음 한 번은 외부 반영 + 응답 유실)를 채운다.
- 시나리오: ① stateVersion 단조 적용(FIRED→RESOLVED→늦은 FIRED→RESOLVED 재전송 후 해소) ② RESOLVED 뒤 늦은 FIRED에도 해소 유지 ③ 응답 유실은 `RETRY_UNCERTAIN`(또는 예외) ④ payload 필드.
- `AlertChannelConformanceKitSelfTest`가 계약 준수 가짜 채널은 통과, 단순 채널(마지막 도착 승리·응답 유실을 RETRY로)은 ①②③에서 각각 걸리는 것을 고정한다.

### 7.5 그 밖의 의무(앞 절 요약)
- `key()` 1~32자, 바꾸지 않는다. `timeout()` 기본 10초 — `batch-size × timeout < lease-seconds`가 아니면 기동 실패. interrupt에 반응하지 않는 클라이언트는 자체 타임아웃을 이 값보다 짧게.
- 메시지는 `AlertNotification`(이력 스냅샷)만으로 만든다 — 규칙·서비스가 이미 지워졌을 수 있다.
- 채널 빈은 **모든 BE 노드에 배포한 뒤** 활성화(#2), 일부만 배포된 채 켰다면 완료 뒤 재조정(#4)을 커서 없이 — 그래도 일부 누락은 남을 수 있다(§3.2).
- `last_error`에 비밀(토큰·비밀번호)을 넣지 않는다.

## 8. 변경 이력
| 날짜 | 변경 | 호환 |
|---|---|---|
| 2026-10-11 | 단위 4 확정 | — |
| 2026-10-21 | 단위 6c — #4 `cursor` 쿼리, `ActivationResult.nextCursor·timedOut·superseded`, 원시 id 구간 페이지(`pages = N`), statement timeout 부분 결과, 해소 시점 FIRED+RESOLVED 짝, 롤링 배포 보충(V88 `activation_generation`·`activation_event_hwm`), 오류 `APM_ALERT_RECONCILE_CURSOR_INVALID`, 설정 `reconcile-statement-timeout-ms` | 추가만(FE 미사용) — `pages`는 정확한 N배에서 1 작아짐 |

## 🔄 FE 요청사항
(없음 — 단위 8에서 소비 시 여기에 남긴다)
