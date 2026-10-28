# 설계 — APM 전체 검토 잔여 A5·B12·B13 (알람 이벤트 보존 · SQL 마스킹 우회 · 원문 SQL 권한) · 2026-10-22

- 근거: `backlog_apm-full-review-2026-09-28.md` A5·B12·B13, `report_apm-full-review-2026-09-28.md` 🔴5·🟠19·🟠20
- 브랜치: BE 워크트리 `C:\worktrees\apm-c05-followup` `apm-review-security-retention`(master `1a36632` 기준). 새 Flyway 필요 없음(다음 번호는 V90).
- 상태 확인(10-22 코드 재확인): A1·A2·A3(V74)·A4(APC-07)는 처리됨. A5·B12·B13은 그대로다.

## 1. A5 — `apm_alert_event` 보존 단계

**지금**: `apm_retention` 잡에 알람 이벤트 단계가 없다. 행이 무한히 쌓인다. 저장소의 `deleteByFiredAtBefore`는 호출하는 곳이 없다.

**변경**
- `ApmRetentionDays`에 `alertEventDays`를 추가한다. 옵션 키는 `"alertEventDays"`, 기본값은 **400**(설계의 1h 롤업·배포·SLO 스냅샷과 같다).
  - `ApmRetentionDto`(`GET /apm/settings/retention`)에 필드를 추가한다.
  - FE `types/apm.ts`와 계약 픽스처에 필드를 추가한다(화면 노출은 없음 — `stuckRequestDays`와 같은 수준).
- `ApmRetentionService.deleteOldAlertEvents(days)`를 추가하고, 잡에 `step("alertEvents", …)`를 넣는다.
  - 조건: `resolved_at IS NOT NULL AND resolved_at < cutoff AND fired_at < cutoff`.
    - 🔴 **열린 이벤트는 지우지 않는다.** 열린 행은 평가기·감시기의 판정 상태다(V74 부분 UNIQUE, 감시기 메모리와 짝).
    - `fired_at < cutoff`는 `resolved_at ≥ fired_at`이라 의미상 중복이지만, V75 `fired_at` 인덱스를 타기 위해 넣는다.
  - 🔴 **통지 행이 끝나지 않은 이벤트는 건너뛴다**: `NOT EXISTS (select 1 from apm_alert_notification n where n.event_id = e.id and n.status in ('PENDING','PROCESSING'))`.
    - `apm_alert_notification.event_id`가 `ON DELETE CASCADE`라, 지우면 배달 중인 행이 같이 사라진다. 400일 지난 이벤트에 걸린 미완료 통지는 사실상 없지만, 디스패처의 claim과 경합하지 않게 막는다.
    - 끝난 통지(SENT·DEAD·SKIPPED)는 CASCADE로 같이 지워진다. 의도된 동작이다.
  - **묶음 삭제**: 한 번에 `LIMIT 5000`씩 지우고 0이 될 때까지 반복한다. 묶음마다 별도 트랜잭션이다(`TransactionTemplate`). 큰 설치본에서 첫 실행이 긴 잠금 하나가 되지 않게 한다. 반환값은 총 삭제 수다.
- 채널 재조정(6c)과의 관계:
  - `activation_event_hwm`·커서는 id 숫자 경계일 뿐이라 옛 id가 사라져도 문제없다.
  - 페이지는 raw id 구간이라 빈 구간도 그대로 진행한다.

**테스트**(실 PG IT)
- 오래되고 해소된 이벤트는 지워지고, 열린 행·최근 행은 남는다.
- PENDING·PROCESSING 통지가 걸린 이벤트는 남고, SENT·DEAD 통지만 걸린 이벤트는 통지와 함께 지워진다.
- 묶음 크기보다 많은 행이 모두 지워진다(묶음 크기를 주입할 수 있게).
- `ApmRetentionDays` 옵션 해석(0 이하이면 기본값), `ApmRetentionDto`에 필드가 노출되는지.

## 2. B12 — 16,384자 초과 자유 텍스트의 SQL 마스킹 우회

**지금**
- `ApmSqlPolicy.applyToFreeText`와 `applyToStackTrace`는 `looksLikeSql`이 거짓이면 원문을 그대로 돌려준다.
- 그런데 `looksLikeSql`은 길이가 `MAX_INPUT`(16,384)을 넘으면 무조건 거짓이다.
  - 그래서 긴 예외 메시지·스택트레이스는 SQL이 섞여 있어도 마스킹을 건너뛴다. 그 뒤에 4,096자로 잘려 저장된다.
- 우리 수집기 템플릿은 `truncate_all(attributes, 4096)`을 먼저 해서 이 경로에 도달하지 않는다. 하지만 사용자가 yaml을 손으로 고쳤거나 다른 수집기를 쓰면 원문이 저장된다.

**변경**(정책 한 곳에서 막아 모든 호출처 — 적재 `ApmSpanAttrAllowlist`, 조회 `ApmRawTextView`, 아카이브 `ApmArchiveSource` — 에 적용)
- `applyToFreeText`·`applyToStackTrace`에서 `!keepRaw`이고 길이가 `MAX_INPUT`을 넘으면, **앞 `MAX_INPUT`자만 남기고**(서러게이트 경계 보호) 그 머리에 지금 규칙을 적용한다.
  - 저장 상한(4,096)이 `MAX_INPUT`보다 작아서, 머리 바깥은 어차피 저장되지 않는다. 진단 정보(앞부분의 메시지·프레임)는 지금과 같게 남는다.
  - `applyToSql`(`db.query.text`)은 바꾸지 않는다. 이미 `mask()`가 초과 시 `UNMASKABLE`을 돌려준다.
  - 🔴 "먼저 4,096자로 자르고 마스킹"으로 순서를 바꾸지 않는다. 자른 자리가 문자열 리터럴 안이면 닫는 따옴표가 없어 정규식이 안 걸리고, 리터럴 앞부분이 원문으로 남는다. 머리를 16,384자에서 자르면 같은 문제가 생기는 위치가 저장 범위(앞 4,096자) 밖이 된다. 리터럴 하나가 12,000자를 넘는 경우만 남고, 이것은 기존의 "줄 경계에 걸친 리터럴" 한계와 같은 급으로 주석에 적는다.

**테스트**(단위): 20,000자 예외 메시지 안의 `insert into … values ('kim@example.com')` → 저장값에 이메일이 없다. 스택트레이스도 같다(프레임 줄은 보존). keepRaw면 원문을 보존한다. 16,384자 이하는 지금과 같다(회귀).

## 3. B13 — 원문 SQL 수집 켜기 권한 + 처리 중 요청 원문 게이트

**지금**
- 원문 열람(`ApmAccessChecker.canViewRawText` = `ADMIN ∪ SUPER_ADMIN`)은 관리자만 할 수 있다.
- 그런데 원문을 **수집하게 만드는** 스위치는 `apm.edit` 권한만 있으면 켤 수 있다. 낮은 권한이 민감정보 수집을 켤 수 있는 셈이다.
  - `PUT /apm/settings`의 `keepRawSql=true`·`maskSql=false`
  - 수집기 yaml 생성(`POST /apm/collector-config`, 토큰 발급과 함께 생성)에서 `keepRawSql=true`, 또는 기본 마스킹 프로세서 제외(`maskingReduced`)
- 처리 중 요청의 `currentOp`(실행 중인 SQL·HTTP 호출 요약)는 Java 확장의 마스킹에만 의존한다. BE 쪽 정책·열람 게이트가 없다.

**변경**
1. **켜는 방향만 관리자**: 원문 열람과 같은 축(`canViewRawText`)을 쓴다.
   - `ApmSettingService.update`: `keepRawSql`을 거짓에서 참으로 바꾸거나 `maskSql`을 참에서 거짓으로 바꾸는 요청을 관리자가 아닌 사용자가 보내면 거부한다.
     - 새 `ErrorCode.APM_RAW_SQL_ADMIN_ONLY`, HTTP 200 + body `code:403`(레포 관례). 한 필드라도 걸리면 요청 전체를 저장하지 않는다(기존 검증 계약과 같음).
     - 끄는 방향(원문 보관 끄기·마스킹 켜기)과 값이 같은 재전송은 편집 권한이면 된다.
   - `ApmCollectorConfigService.generate`·`generateForIssue`: **요청이 명시한** `keepRawSql=true`나 마스킹 프로세서 제외(`maskingReduced`)는 관리자만 할 수 있다.
     - 요청이 말하지 않아서 설정값(관리자가 이미 켠 `keepRawSql`)이 상속되는 경우는 허용한다. 정책은 관리자가 이미 정했다.
     - 서비스 메서드에 `TokenUserInfo`(또는 `boolean rawAllowed`)를 넘긴다.
2. **처리 중 요청 `currentOp` 정책**
   - 적재(`ActiveRequestListIngestor`): 배치마다 `ApmSqlPolicy.from(settings)`의 `applyToFreeText`를 적용한다. keepRaw면 원문, 아니면 SQL처럼 보일 때 마스킹한다. 그러면 SSE·REST·요청 걸림 장부(`apm_stuck_request.current_op`)가 모두 정책을 지난 값을 받는다.
   - 조회: `GET /apm/stuck-requests`·`GET /apm/live/…/active-requests`는 관리자가 아닌 열람자에게 `ApmSqlPolicy.MASKED.applyToFreeText(currentOp)`를 적용한다(`ApmRawTextPolicy` 판정, 요청당 1회).
   - SSE 스트림의 `activeList`는 열람자별로 직렬화하지 않으므로 **항상 MASKED**를 적용한다. 관리자도 실시간 화면에서는 마스킹된 값을 보고, 원문은 REST(요청 걸림 장부·트레이스 상세)에서 본다.
   - `path`는 이번에 손대지 않는다. 확장이 가린 경로이고, 쿼리스트링을 보내는지 확인되지 않았다. → 판단 요청 4
3. ArchUnit: `collector/ingest/live`가 `trace/ingest.ApmSqlPolicy`를 import해도 되는지 확인한다. 안 되면 정책 판정은 `core`에 있는 값(`settings.keepRawSql()`)만 넘기고, 마스킹 함수 위치를 옮긴다. → 판단 요청 3

**테스트**
- 설정: 편집 권한(비관리자)이 `keepRawSql=true` → 403 envelope, 저장 0건. `maskSql=false`도 같다. 같은 요청의 다른 필드도 저장되지 않는다. 관리자는 성공. 비관리자가 `keepRawSql=false`로 끄는 것은 성공.
- yaml 생성·토큰 발급과 함께 생성: 비관리자의 명시 `keepRawSql=true`·마스킹 제외 → 거부. 설정 상속(true)은 허용. 관리자는 허용.
- `currentOp`: 적재 시 SQL 리터럴 마스킹(keepRaw면 보존). 요청 걸림 REST에서 비관리자는 마스킹, 관리자는 저장값. SSE 직렬화는 항상 마스킹.
- MVC: 새 에러 코드 envelope.

## 4. 판단 요청(코덱스)
1. A5 기준 시각: `resolved_at` 기준 400일이 맞나(`fired_at` 기준이면 오래 열려 있던 이벤트가 해소 직후 지워질 수 있다). 미완료 통지 건너뛰기 조건이 충분한가(디스패처 claim과의 경합).
2. B12 "머리 16,384자 + 기존 규칙"이 우회를 충분히 막나. 더 단순한 대안("초과면 `UNMASKABLE`")보다 나은가 — 대안은 SQL 없는 긴 스택트레이스의 진단 정보까지 지운다.
3. B13 정책 함수의 위치(ArchUnit 메뉴 간 의존)와 SSE "항상 MASKED"가 맞나.
4. `path`의 원문 게이트가 필요한가(확장이 쿼리스트링을 보내는지).
5. `maskingReduced`(기본 마스킹 프로세서 제외)까지 관리자 축으로 묶는 것이 범위상 맞나 — 리포트는 `keepRawSql`만 짚었지만, 코드 주석은 "같은 급의 선택"이라고 한다.

---

## 5. v2 — 코덱스 설계 1차(조건부 진행, 🔴5) 반영 (`_archive/features/apm/full-review-20260928/review_apm-review-a5-b12-b13-design-20261022_codex.md`)

### 5.1 🔴1 B12 — 머리 검사 폐기, 초과면 원문을 내보내지 않는다
- `applyToFreeText`: `!keepRaw`이고 길이가 `MAX_INPUT`을 넘으면 **`UNMASKABLE`** 로 바꾼다(SQL처럼 보이는지 판정하지 않는다 — 잘린 키워드 쌍·경계 리터럴 반례).
- `applyToStackTrace`: `!keepRaw`이고 초과면 줄 단위로 나눠 **프레임 줄(`at …`)만 남기고**, 나머지 줄(메시지·`Caused by`·`Where:`)은 `UNMASKABLE` 한 줄로 바꾼다. 진단 가치(어디서 터졌나)는 프레임에 있고, 프레임 줄은 원문이 섞이지 않는 형식이다. 줄 나누기는 정규식 없이 `indexOf('\n')`로 한다(초과 입력에 정규식을 돌리지 않는다는 기존 원칙).
- `MAX_INPUT` 이하는 지금과 같다. 반례 테스트: `SELECT 'kim@example.com' /* 2만 자 주석 */ FROM users` → 이메일 없음. 경계 리터럴도 같다.

### 5.2 🔴2·🔴5 B13 — 처리 중 요청의 `currentOp`·`path` 서버 방어
- 새 `core/security/ApmRuntimeTextRedactor`(순수 클래스, core라 `collector`·`alert`·`overview` 어디서나 쓴다. `trace/ingest`를 import하지 않는다).
  - `op(String)`: 접두로 종류를 가른다.
    - `DB …` → **SQL로 간주**하고 무조건 문자열 리터럴(`'…'`)과 숫자 리터럴을 `?`로 바꾼다(`looksLikeSql` 판정 없음). 마스킹 뒤에도 닫히지 않은 `'`가 남으면(확장이 160자로 잘라 닫는 따옴표가 사라진 경우) 그 따옴표부터 끝까지를 `?…`로 바꾼다.
    - `HTTP …` → 첫 `?` 뒤를 버리고, 경로 구간을 아래 `path` 규칙으로 가린다.
    - 그 밖(RPC) → `system service/method` 형식이라 그대로 둔다.
  - `path(String)`: 쿼리스트링을 버린다. 구간이 숫자만·16자 이상 hex·UUID(확장 `PathMasker`와 같다)이거나 **`@`를 포함하거나, 24자 이상인 `[A-Za-z0-9_\-.=~]` 토큰**이면 `{id}`로 바꾼다.
- 적용 위치
  - **적재**(`ActiveRequestListIngestor`): `path`는 **항상** 가린다. 원문 경로를 보관하는 설정은 없다. 확장이 이미 같은 규칙으로 가리므로, 정상 확장이면 결과가 거의 같다. `currentOp`는 `keepRawSql`이 꺼져 있으면 가리고(배치마다 `ApmSettingService.keepRawSql()` 한 번), 켜져 있으면 원문을 둔다. 순서는 **가린 뒤 자르기**다(기존 `clip`).
  - **조회**: `GET /apm/stuck-requests`와 실시간 처리 중 요청 REST는 관리자가 아닌 열람자에게 `op`·`path`를 다시 적용한다. 이미 저장된 과거 값과 원문 보관 중 적재된 값을 막는다. 요청당 판정은 한 번(`ApmAccessChecker.canViewRawText`).
  - **SSE**: 직렬화할 사본에 항상 적용한다. 공유 버퍼(`LiveRuntimeMetrics`)의 원본은 바꾸지 않는다.
- B12의 `looksLikeSql` 한계(`FROM` 없는 SQL)는 예외 메시지의 기존 휴리스틱 한계로 남긴다. `currentOp`의 DB 경로는 위처럼 판정 없이 가린다.

### 5.3 🔴3 A5 — 삭제·재시도·재조정 잠금 순서
- 잡 단계는 트랜잭션 밖에서 돌고, cutoff(지금 − N일)는 회차 시작 때 한 번 고정한다. 묶음마다 `TransactionTemplate`(`PROPAGATION_REQUIRES_NEW`)이다. `id > lastId` 커서로 진행해, 건너뛴 이벤트 때문에 같은 묶음을 반복하지 않는다.
- 한 묶음 = 한 트랜잭션:
  1. `select id from apm_alert_event where resolved_at is not null and resolved_at < :cut and fired_at < :cut and id > :last order by id limit :n for update skip locked`
  2. `select id, event_id, status from apm_alert_notification where event_id = any(:ids) order by id for update` — 잠근 뒤 다시 읽은 상태다.
  3. PENDING·PROCESSING 통지가 있는 이벤트를 뺀다.
  4. `delete from apm_alert_event where id = any(:kept)`(종료된 통지는 CASCADE로 함께 지운다).
- 경합 분석(코드 근거)
  - 재조정(`AlertChannelActivation` 페이지)은 이벤트를 `for key share … nowait`로 잡는다. 우리가 먼저 잡았으면 재조정은 즉시 실패하고, 기존 잠금 재시도 경로를 탄다. 재조정이 먼저 잡았으면 우리는 `skip locked`로 그 이벤트를 건너뛴다. 재조정이 커밋한 새 PENDING은 다음 회차에서 2·3단계에 걸린다.
  - 단건·일괄 재시도(`ApmAlertNotificationStore.retry`·`retryDead`)는 통지 행만 `for update`로 잠근다(이벤트 잠금 없음). 재시도가 먼저 잡았으면 우리 2단계가 기다리고, 커밋 뒤 다시 읽어 PENDING이면 뺀다. 우리가 먼저 잡았으면 재시도가 기다린다. 우리가 지운 뒤 재시도의 짝 조회는 빈 결과가 되어 `NOT_FOUND`를 돌려준다(400일 지난 이벤트의 통지 재시도는 사라진 것으로 응답한다).
  - 디스패처 claim은 통지 행 `skip locked`라 기다리지 않는다.
  - 잠금 순서는 언제나 이벤트 → 통지다. 이벤트에서 기다리는 쪽은 없고(`skip locked`·`nowait`), 통지에서 기다리는 쪽은 우리와 재시도뿐이다. 순환 대기가 생기지 않는다.
- 테스트(실 PG): 정적 상태별 케이스와 함께, (a) 다른 트랜잭션이 통지를 잠그고 PENDING으로 되살려 커밋하는 동안 보존이 기다렸다가 그 이벤트를 남기는지, (b) 보존이 이벤트를 잡은 동안 재조정 페이지가 `nowait`로 실패하고 재시도 뒤 이어지는지(또는 보존 뒤 해당 이벤트를 건너뛰는지), (c) 재조정이 이벤트를 잡은 동안 보존이 그 이벤트를 건너뛰는지.

### 5.4 🔴4 B13 — 설정 판정과 저장을 원자적으로
- `ApmSettingService.update`는 시작할 때 설정 갱신 전용 advisory xact lock을 잡는다(키는 상수). 행이 없을 수도 있어 행 잠금 대신 이 방식을 쓴다.
- 그 안에서 `keep_raw_sql`·`mask_sql`의 **현재 DB 값**을 읽는다(캐시 아님). 비관리자가 켜는 방향(`keepRawSql` 거짓→참, `maskSql` 참→거짓)이면 `ForbiddenError("…", ErrorCode.APM_RAW_SQL_ADMIN_ONLY)`(HTTP 200 + body `code:403`)를 던지고, 트랜잭션이 롤백돼 다른 필드도 저장되지 않는다.
- 🟡 반영: **값이 같은 키는 쓰지 않는다.** `updated_by`(원문 보관을 켠 관리자 기록)가 재전송으로 덮이지 않는다. WARN 감사 로그 판정도 같은 DB 값으로 한다.
- 수집기 yaml: 요청이 **명시한** `keepRawSql=true`나 `maskingReduced`(기본 마스킹 규칙 제외 — `filterMetrics` 제외는 해당 없음)는 관리자만 할 수 있다. 같은 `ForbiddenError`다. 설정값 상속은 허용한다. 토큰 동시 발급(`ApmReceiveTokenService`의 `generateForIssue`)에도 같은 판정을 넘기고, 발급 트랜잭션이 롤백돼 토큰도 만들어지지 않는다.

### 5.5 🟡
- 403은 `ForbiddenError(message, ErrorCode)`로 만든다(`ApiError`의 기본 400이 아님).
- A5 묶음 크기 기본 5000, 테스트는 주입한다.

## 6. v3 — 코덱스 설계 2차(조건부 진행, 🔴4) 반영 = 구현본 (`_archive/…/review_apm-review-a5-b12-b13-design-20261022_codex_r2.md`)

> §1~§4의 머리 16,384자 검사·`applyToFreeText(currentOp)`·`path` 제외는 **폐기**됐다. 구현은 §5 + 이 절이다.

1. **프레임 판정 = 줄 전체 문법**(`ApmSqlMasker.FRAME`): `\s*at [모듈[@숫자버전]/]클래스.메서드(파일.java|kt|kts|scala|groovy|clj|aj[:줄] | Native Method | Unknown Source[:줄])\s*`, 줄 길이 ≤ 512. 상한 초과·이하 두 경로 모두 적용 — 이하 경로에서도 위장 줄(`at x.Y(Y.java:1) SELECT 'kim@…'`)이 마스킹된다.
2. **A5 통지 잠금 `for update nowait`**: 일괄 재시도(`retryDead`)의 정렬 없는 UPDATE와 통지 행 사이 순환 대기를 없앤다. 못 잡으면(SQLSTATE 55P03 — Spring이 `PessimisticLockingFailureException`으로 바꾸지 않음을 IT로 확인, 판정은 SQLSTATE) 그 묶음을 롤백·건너뛰고 커서는 이미 넘어가 있다. 종료 조건은 **후보 소진**(후보 수 < 묶음), 커서는 **조회한 후보의 마지막 id**다.
3. **`currentOp` 모르는 형식 → `?(unmaskable)`**, `RPC`는 확장 형식(`RPC [system ][service][/method]`, 식별자 문자만)일 때만 그대로.
4. **경로 percent-decoding**: 구간마다 최대 3겹 디코딩(`%2540`→`@`), 깨진 인코딩·3겹 초과·인코딩된 구분자(`%2F`·`?`)는 `{id}`. 24자 토큰 규칙은 **글자+숫자 섞임**을 요구해 긴 라우트 이름은 남긴다.
5. 🟡 SQL 방언: dollar-quoted는 통째로 판정 불가, 큰따옴표 문자열은 PostgreSQL 식별자와 구분할 수 없어 남긴다(클래스 주석에 한계 명시).

## 7. v4 — `currentOp` DB 가림 재설계(구현 검수 1~5차 반려 뒤)

구현 검수 1~5차가 모두 `currentOp`의 DB 가림에서 **방언별 인용 반례**로 반려됐다(숫자 든 dollar 태그 → 주석 안 따옴표 → 백틱·대괄호·Oracle q → `]]`·BigQuery `'''` → 공백 낀 `'''`). 원인은 하나다: 서버는 방언을 모르므로 문자열 경계를 해석하면 언젠가 잘못 읽고, 잘못 읽으면 문자열 **안**이 식별자로 출력된다.

**결정**: 경계를 해석하지 않는다. **첫 인용·주석·숫자 아닌 `$`·모르는 문자에서 멈추고 뒤를 버린다**(`?…`). 그 앞은 식별자(유니코드 글자·숫자·`_`, `$` 제외)·키워드·연산자·구두점·`?`·`$숫자`만 남고 숫자는 `?`. 백슬래시가 있으면 통째로 판정 불가, 결과에 이메일 모양이 남으면 판정 불가(인용 없이 온 비정상 값의 그물).
- 성질: 어떤 인용 문자 뒤의 내용도 출력에 나오지 않는다 — 무작위 SQL 조각 2만 개 성질 테스트로 고정(이 테스트가 식별자 안 `$` 반례를 찾아 `$`를 식별자 글자에서 뺐다).
- 비용: 원문 리터럴이 실제로 온 경우 그 뒤 SQL 모양이 사라진다. 에이전트가 리터럴을 `?`로 바꿔 보내는 정상 경로는 그대로 다 보인다. Oracle `v$session`·PostgreSQL 인용 식별자는 거기서 잘린다(보조 방어선이라 안전한 쪽).

## 8. v5 — 6차 반영
- B12 상한 초과 스택은 프레임 보존을 포기하고 통째로 판정 불가(§5.1의 "프레임만 남김" 폐기 — 줄의 출처를 구분할 수 없다).
- 경로 디코딩: 결과에 U+FFFD(잘못된 UTF-8의 대체 문자)가 있으면 그 구간은 `{id}`.

## 9. 결정(2026-10-22) — B13-② 보류, A5·B12·B13-①만 반영

구현 검수 1~9차의 반려는 거의 전부 **B13-②(처리 중 요청 `currentOp`·`path` 서버 재가림)**에서 나왔다. 이 기능은 Java 확장이 이미 가린 값에 대한 이중 방어이고, "어떤 입력에도 새지 않음"을 규칙으로 증명할 수 없어 반례가 끝나지 않았다. 사용자 결정으로 이번 변경에서 뺐다.

- 반영: **A5**(알람 이벤트 보존), **B12**(16,384자 초과 자유 텍스트·스택 → 판정 불가, 프레임 문법 엄격화), **B13-①**(원문 SQL 켜기·마스킹 끄기·기본 마스킹 제외는 관리자만, 판정과 저장 원자화, 권한 생략 오버로드 제거).
- 보류: **B13-②** — 시도본 `_archive/features/apm/full-review-20260928/b13-2_ApmRuntimeTextRedactor_20261022.java.txt`(+테스트·배선 diff). 재개 시 1순위 대안은 Java 확장이 실제 경로 대신 **경로 틀**(`/users/{id}`)을 보내게 하는 것이다(서버가 추측하지 않는다).
- 남는 한계(이번 반영분): 상한 이하 스택에서 SQL 리터럴 안에 프레임 문법과 같은 줄이 있으면 남는다(7차 수용) · 예외 메시지 SQL 판정은 키워드 휴리스틱(기존).
