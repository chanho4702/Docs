# ZM-159 T-A A-2 — 열린 알람 1만 건 상한 제거(커서 분할) · 설계 v1

- 작성 2026-09-18 · 근거: `planning/tickets_scale-hardening.md` §T-A(A-2) · A-1(삭제 보호)은 `8fa5ec2`로 반영됨
- **v1은 v0을 대체한다.** 코덱스 설계 검토(`reviews/review_zm-159-ta2-design_codex.md`) R1~R9 반영.
- 워크트리 BE `C:/worktrees/zm-159-be`(ZM-159)
- 🔴 **상태(2026-09-18): 착수 보류 — 별도 티켓 권고.** v1 재검토(`reviews/review_zm-159-ta2-design-v1_codex.md`)에서 치명 4건이 남았다:
  ① 재개(continuation) 계약이 포트·실행기에 없다(현재 스캔은 항상 처음부터) ② 표시자를 앱 시각으로 쓰면 회차가 겹칠 때 역행한다(DB 발급 run id 필요) ③ 기존 미해소 사본이 많으면 첫 회차 후보가 폭증한다 ④ 증분에서 표시자만 갱신해도 매 15초 전 행을 쓰게 된다.
  → **후속 정본**: [`../planning/backlog_zm-159-후속.md`](../03-%EA%B8%B0%ED%9A%8D-%EB%B0%B1%EB%A1%9C%EA%B7%B8/ZM-159-%ED%9B%84%EC%86%8D-%EB%82%A8%EC%9D%80-%EC%9E%91%EC%97%85-%EC%A0%95%EB%B3%B8.md) §1(착수 조건 정리). 필요한 것: `event_sync_run`(logical run) 테이블·run id 표시자·정렬에 맞는 부분 인덱스(온라인 생성 전략 포함)·포트의 opaque continuation·보강 호출 공유 예산·new-head 스캔 정책·단계 배포(feature flag). **ZM-159 범위를 넘는다.**
  그 전까지 A-1(잘린 회차에는 삭제·되짚기 금지, `8fa5ec2`)이 데이터 손실은 막고 있다. 남는 증상은 "1만 건 초과분이 목록·벨에 안 보인다".

## 1. 현상
- `EventSyncService`는 보정(5분)·증분(15초) 모두 `alertPort.listActive(... withLimit(10_000))` **1콜**이다.
- 열린 알람이 1만 건을 넘는 설치본에서는 **상한 밖 알람이 사본에 들어가지 않는다** → 목록·알림 벨에서 안 보인다.
- A-1은 "잘린 회차에는 지우지 말 것"까지만 막았다(데이터 손실 방지). **안 보이는 문제는 남아 있다.**

## 2. v0에서 바뀐 결정 (검토 반영)
| # | v0 | v1 |
|---|---|---|
| R1 | 커서로 끝까지 훑으면 "완전" | 스캔 시작 때 **상한 eventid를 고정**(`eventid_till`)하고, 완전의 뜻을 "고정한 id 범위를 끝까지 훑음"으로 정의. 스캔 도중 생긴 알람은 다음 회차 몫 |
| R2 | 증분도 같은 방식으로 upsert | **소비자를 둘로 나눈다**. 보정 페이지는 전체 필드 upsert, 증분 페이지는 지금 규칙 그대로(신규만 표적 완전 조회, 기존은 휘발 필드 조건부 UPDATE, recent 해소분은 복구 시각만) — 경량 값으로 규칙·그룹·조치 수를 덮지 않는다 |
| R3 | 페이지마다 upsert | 그대로 하되, **신호(broadcast)는 회차 끝에 한 번**. 페이지 커밋이 일어난 회차는 예외로 끝나도 신호를 보낸다(`changedAny`). 읽음 상태의 `OR`/`COALESCE` 계약은 유지 |
| R4 | 열린 id 전량을 메모리 Set → `NOT IN` | **DB 표시 후 훑기(mark & sweep)**: 사본 테이블에 `last_open_at` 컬럼을 두고 페이지마다 "이번 회차에 열려 있었음"을 찍는다. 되짚기 후보는 `last_open_at < 이번 회차 시작` 인 미해소 행 — 거대 `NOT IN`도, 200MB Set도 사라진다 |
| R5 | 보강 조회는 그대로 | `fetchRules`(triggerids)·`fetchActors`(userids)·복구 시각(eventids)을 **정책 max-ids(500)로 분할**. 분할 호출 수를 outcome의 `calls`에 합산 |
| R6 | "isSyncing이 막는다" | 불완전하게 끝나면 **다음 회차가 이어받는다**(커서 체크포인트를 서비스가 보관). 재시작마다 앞부분만 반복해 뒤쪽이 굶는 것을 막는다. `isSyncing`은 `AtomicBoolean.compareAndSet`으로 |
| R7 | 읽음 상태는 페이지로 충분 | 사용자 목록·내부 id 매핑은 **회차당 1회**. 알람 × 사용자 폭발은 구조 문제로 남기고, 이번 범위의 상한(`zabbix.call.max-scan-rows`)과 함께 **운영 상한을 문서화** |
| R8 | 거부 조건만 | 포트 Javadoc에 순서·중복 없음·동적 결과·부분 반영·라이선스 차단 시 consumer 0회를 명시. 질의 검증은 세션 조회 **전에** |

## 3. 구현
### 3.1 engine-api / engine-zabbix
- `AlertPort.scanActive(src, ctx, AlertQuery, Consumer<List<Alert>>)` → `AlertScanOutcome`(abstract). 거부: `limit>0`·`nativeIds`·`relatedToNativeId`.
- 어댑터: `problem.get`을 `scanByCursor(eventid / eventid_from)`로. **시작 시 `eventid_till` 고정**(같은 필터로 sortfield=eventid DESC limit 1 1콜).
  페이지마다 규칙·조치자 보강을 **500개씩 분할**해 수행하고, 보강 호출 수를 `calls`에 더한다.
- `LicenseGuardedAlertPort` 위임(차단 시 consumer 호출 0회).

### 3.2 DB (Flyway `V62__event_problem_last_open_at.sql`)
```sql
ALTER TABLE event_problems ADD COLUMN last_open_at timestamp NULL;
CREATE INDEX ix_event_problems_last_open_at ON event_problems (last_open_at) WHERE r_clock IS NULL OR r_clock = 0;
```
- 페이지 upsert가 `last_open_at = :syncStartedAt`을 함께 쓴다.
- 되짚기 후보: `(r_clock IS NULL OR r_clock = 0) AND (last_open_at IS NULL OR last_open_at < :syncStartedAt)` — 기존 `NOT IN` 대체.
- 좀비 정리(A-1)는 그대로. 기존 행의 `last_open_at`은 NULL로 시작하므로 **첫 완전 회차가 전부 채운다**(그 전에는 후보가 과다해질 수 있으나, 되짚기는 배치 500건 커서라 안전).

### 3.3 서비스
- 보정: `scanActive(withRule().withActions())` → 페이지마다 ① 사건 행 upsert(+`last_open_at`) ② 읽음 상태 upsert ③ 통계. 스캔 끝 → 완전하면 되짚기(위 조건) + A-1 좀비 정리, 불완전하면 둘 다 생략 + 체크포인트 보관.
- 증분: `scanActive(경량)` → 페이지마다 기존 규칙대로(신규 표적 재조회 / 휘발 UPDATE / recent 해소분 복구 시각). 완전하면 되짚기.
- 신호: 회차 끝 1회(`changedAny`일 때).

## 4. 테스트 (검토 R9 반영, 최소 집합)
- 어댑터: 상한 eventid 고정 · 커서 전진/경계/중복 없음 · 예산별 불완전(ROWS·CALLS·TIME·NO_PROGRESS) · 보강 id 501개 분할 · 거부 질의 · 라이선스 차단 시 consumer 0회.
- 서비스: 3페이지 전량 upsert · 불완전 시 되짚기·정리 생략 + 다음 회차가 이어받음 · 증분에서 기존 행의 규칙·그룹·조치 수 보존 · 읽음 `OR` 승격과 `read_at` 보존 · 신호 1회(부분 반영 포함).
- 되짚기: `last_open_at` 기준 후보 선정(표시된 행은 후보 아님), 첫 회차(NULL) 동작.

## 5. 범위 밖
- 알림 벨 SQL(E1)·읽음 상태 구조(사건 × 사용자) 개선.
- 다중 인스턴스 lease heartbeat(스캔이 30분 lease를 넘는 경우) — 운영 상한 문서화로 대체.
