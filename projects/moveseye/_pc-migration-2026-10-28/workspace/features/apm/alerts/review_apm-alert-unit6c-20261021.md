# 검수 요청 — 알람 재설계 단위 6c (알림 재조정 이어하기 + 단위 4 RESOLVED 누락 수정) · 2026-10-21

- 워크트리: `C:\worktrees\apm-c05-followup`, 브랜치 `apm-alert-history`(미커밋)
- 전제: 같은 날 master `1d50f6e` 위로 rebase했고, 마이그레이션 V76~V80을 **V83~V87로 번호를 다시 매겼다**(사용자 결정, 미커밋 rename — 이 검수 범위 밖이나 diff에 주석 번호 변화로 섞여 보인다).
- 설계: `apm-alert-unit5-6-design-20261011.md` §17·§17.10. 설계 검수는 1차 재설계 → 2차 **진행**.
- 계약: `contract_apm-alert-channels.md` 단위 6c 개정(§1·§1.1·§3·§3.1·§3.2·§4·§5·§7.5·§8).

## 변경
| 파일 | 내용 |
|---|---|
| `V88__apm_alert_channel_generation.sql` | `apm_alert_channel_state.activation_generation`(≥1)·`activation_event_hwm`(≥0). 켜진 기존 행은 hwm = 지금 최대 id |
| `AlertReconcileCursor`(새) | `v1.<b64url(gen\|after\|hwm\|channel)>.<HMAC>` — JWT 비밀에서 라벨 파생, 길이 512, 서명 먼저(상수 시간)·숫자 엄격 파싱·채널 마지막 필드(`split(…, 4)`)·`after ≤ hwm` |
| `ApmAlertNotificationOutbox.enqueueResolved` | **수정 A** — CTE 한 문장: 활성 채널 `ch` × 닫힌 이벤트, FIRED 없으면 `newf`(FIRED INSERT … RETURNING), RESOLVED = (기존 FIRED ⋈ ch) ∪ newf |
| `AlertChannelActivation` | 뒤집기 UPSERT가 세대 +1·`activation_event_hwm`을 RETURNING → 시작 커서. `reconcile(key, cursor)` — 커서 없으면 **초기화 트랜잭션**(잠금·켜짐·세대·max id, 쓰기 없음) 커밋 후 페이지. 페이지 = 잠금 → 상태·세대 확인(다르면 첫 페이지+커서면 `Invalid`, 아니면 `superseded`) → `SET LOCAL statement_timeout` → 원시 구간 끝 `max(id) of (id > after and id ≤ hwm order by id limit N)` → 구간 안 할 일 3조건(열림·FIRED 없음 / FIRED·닫힘·RESOLVED 없음 / 닫힘·FIRED 없음·`id > activation_event_hwm`) → FIRED·RESOLVED. 57014(+메시지 `statement timeout`, cause chain) → 그 페이지 롤백·`timedOut`·마지막 커밋 커서. `Result`에 `nextCursor·timedOut·superseded`(8인자 보조 생성자 유지) |
| `ApmAlertNotifyProperties` | `reconcileStatementTimeoutMs`(기본 5000, 10~600000) + 8인자 보조 생성자, 정규 생성자에 `@ConstructorBinding` |
| `ApmAlertNotificationAdmin`·`ApmAlertChannelController` | `reconcile?cursor=`, `Invalid` → `ApiError(APM_ALERT_RECONCILE_CURSOR_INVALID)`(HTTP 200 + body 400) |
| `ErrorCode` | `APM_ALERT_RECONCILE_CURSOR_INVALID` |
| `application.yml` | `reconcile-statement-timeout-ms` |

## 테스트(격리 DB 5434, 클래스별 단독)
- `AlertReconcileCursorTest` 4: `|` 포함 채널 왕복 · 최악 payload(4바이트 문자 32자·long 최대) ≤ 512 + Registry 통과 최대(보충 문자 16자) · 위조·다른 키·버전·길이·형식·다른 채널 거부 · State 불변식(after>hwm·세대 0·음수, hwm=0 done).
- `ApmAlertNotificationDispatchIT` 57(새 10):
  - `firstPageTimeoutThenResolveMakesPair`: 활성화 첫 페이지 57014 → 시작 커서(after=0)·0행. 그 사이 닫힌 이벤트는 FIRED+RESOLVED 짝, 이어하기 뒤에도 각 1행, 디스패처가 FIRED → RESOLVED 순으로 보낸다.
  - `midPageTimeoutKeepsLastCommittedCursor`: 2페이지 57014 → 1페이지만 커밋, 커서 뒤 이벤트 0행. 이어 부르면 FIRED 합 25, scanned 합 25.
  - `userCancelIsNotSwallowed`: `pg_cancel_backend` 자기 취소 57014는 예외로 전파.
  - `rawRangeAdvancesWithoutWork`: 할 일 0건이어도 pages = ⌈N/10⌉, scanned 0.
  - `cursorRejections`: 위조·버전·길이·다른 키·다른 채널·쓰레기 → `APM_ALERT_RECONCILE_CURSOR_INVALID`, 껐다 켠 뒤 옛 커서도 거부.
  - `supersededMidRun`: 1페이지 중 다른 연결이 세대를 올리면 superseded·커서 null·pages 1.
  - `rollingDeployBackfillAboveHwmOnly`: hwm 위의 빈 없는 노드 열림·닫힘은 짝, hwm 이하 닫힘·FIRED 없음은 0행(한계 고정).
  - `newScanCoversLateGapsAboveActivationHwm`: 완료 뒤 생긴 누락(activation_event_hwm < id)을 커서 없는 새 스캔이 짝으로 채운다.
  - `pairDiscardAndRetry`: 짝은 일반 폐기에서 둘 다 SKIPPED, 단건 재시도가 짝을 함께 되살린다.
  - `skippedFiredGetsOnlyResolved`: SKIPPED FIRED는 되살리지 않고 RESOLVED만.
- 기존 테스트 의미 변경 3: `ApmAlertNotificationIT.resolveWithoutFiredMakesPair`(종전 "FIRED 없으면 RESOLVED 없음" → 짝), `reconcileExactMultipleOfPage`(pages 3 → 2), `activationFirstThenOpen`(빈 이벤트 표면 페이지가 없어 앞선 이벤트 1건 추가).
- 결과: `ApmAlertNotificationIT` 18/18, `ApmAlertNotificationDispatchIT` 57/57, `ApmAlertChannelMvcTest` 10/10, `AlertReconcileCursorTest` 4/4.
- **뮤테이션 8종 전부 실패 확인(복원 후 원본 재확인)**: 짝 생성 제거(2) · 수정 B 조건 제거(2) · hwm 무시(1) · 원시 구간 대신 hwm까지 한 번(7) · 세대 비교 제거(2) · 첫 페이지 커서 null(1) · 57014 판정 제거(2) · 메시지 검사 없이 모든 57014(1).
- 미검증: 수정 A의 "두 문장으로 쪼개면 일시정지가 사이에 낀다"는 결정적 재현을 만들지 않았다(문장 사이 훅이 없는 한 문장 구조라 뮤테이션 지점이 없다) — 단일 CTE 구조 자체로 보장(설계 2차 🟢).

## 판단 요청
1. 설계 §17·§17.10 대비 구현 누락·왜곡.
2. `backfillPage`의 할 일 SELECT가 구간 안 행을 `limit` 없이 `for key share nowait`로 잠근다 — 구간이 `limit` 행이라 상한이 있다고 봤다(늦은 커밋 예외는 🟡4로 인정).
3. `enqueueResolved` CTE의 RESOLVED가 FIRED보다 작은 id를 받을 수 있다(데이터 변경 CTE 실행 순서 미정) — 디스패처 순서는 FIRED 상태 조건으로 보장(설계 2차 🟢)이라 무해하다고 봤다. 단건 재시도의 "id 순 잠금"은 대개 FIRED 먼저라는 주석이 있다(`ApmAlertNotificationStore` retry).
4. `@ConstructorBinding` + 보조 생성자 레코드 바인딩.

## 1차 결과: 승인 (`_archive/features/apm/alerts/review_apm-alert-unit6c-20261021_codex.md`)
🔴 없음. 🟡 반영:
1. timeout 테스트 범위 — `midPageTimeoutKeepsLastCommittedCursor`가 **쓰기 뒤(커밋 직전)** 에 timeout을 내도록 바꿨다(2페이지가 FIRED 10건을 넣은 것을 트랜잭션 안에서 확인 → 롤백 뒤 0건). 내 이벤트 구간만 도는 커서로 시작해 결정적(1페이지 끝 = 10번째 id, 이어하기 2페이지·FIRED 15). 커서 없는 재조정의 첫 페이지 timeout 테스트 `reconcileFirstPageTimeoutReturnsInitCursor` 추가(초기화 커서 after=0·hwm=당시 최대 id, 그 뒤 이벤트는 같은 커서 구간 밖).
2. 이어하기 증명 — `scanned` 합 대신 이어하기 페이지 수(=커서 뒤 구간 행 수/10)와 페이지 훅 횟수로 확인. 늦은 커밋 테스트는 "통지 삭제 모사"라는 한계를 테스트 이름·주석에 그대로 둔다(별도 연결의 미커밋 행 재현은 미작성).
3. `lockAttempts` — 페이지 본문이 시도 수를 직접 세어 timeout·세대 변경·일시정지로 끝난 페이지도 포함. 뮤테이션(timeout 경로 집계 제거) → 실패 ✅.
4. 주석 — 클래스 주석·`reconcile` 주석을 계약 §3.2(과잉·과소, 짝 자체 누락 가능, 커서 없이 한 번)와 맞췄다.
- 함께 돌릴 때 흔들리던 기존 테스트 정리: `reconcileExactMultipleOfPage`(기대 페이지 = 구간 전체 행 수 기준), `reconcilePagesAndTimeCap`·`reconcileStopsOnPause`(첫 원시 구간의 scanned는 0~10).
- 판단 요청 3(CTE id 역전) — 코덱스: 신규 RESOLVED는 `newf RETURNING`에 의존하므로 역전을 단정할 수 없고, 역전을 "무해"로 일반화하지 말 것(retry의 id 순 잠금과 `dead()`의 FIRED→RESOLVED 잠금이 반대가 될 수 있다). 현재 정상 경로에서 역전은 확인되지 않아 🔴 아님 — 기록만.
- 결과: `ApmAlertNotificationDispatchIT` 58/58.
