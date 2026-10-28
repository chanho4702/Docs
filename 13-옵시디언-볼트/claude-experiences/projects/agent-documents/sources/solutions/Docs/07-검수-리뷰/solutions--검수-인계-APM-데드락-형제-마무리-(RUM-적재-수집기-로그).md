# 검수 인계 — APM 데드락 형제 마무리 (RUM 적재 + 수집기 로그)

- **작성**: Claude, 2026-09-30
- **레포/브랜치**: `moveseye-be-spring` / `master` (미커밋)
- **선행**: `ApmMetric1mStore` 데드락 fix(`ad57ea5`) + 도메인 리뷰 백로그 `_workspace/planning/backlog_apm-improvements-2026-09-29.md`(코덱스 검수 반영본)의 A1·A2 구현.

## 범위
백로그 A1(RUM 적재)·A2(수집기 로그)의 동시 배치 UPSERT 데드락 제거. 코덱스가 A1에 건 4조건 반영.

**변경 파일**
| 파일 | 변경 |
|---|---|
| `rum/ingest/RumStore.java` | `store()`를 **phase 분리 + 테이블별 PK 전순서 정렬**로 재작성. `OBS_ORDER` 상수, `TimingOp/ErrorOp/SpanOp` 로컬 레코드. |
| `collector/state/ApmCollectorLogStore.java` | UPSERT를 자연키 `(instance,pipeline,component)` 정렬 후 실행. |
| `rum/ingest/RumSchemaIT.java` | 동시성 IT 추가(반대순서 배치 720건 무-데드락+정합). |
| `rum/ingest/RumStoreTest.java` (신규) | 정렬·게이팅 결정적 단위 테스트. |
| `collector/state/ApmCollectorLogStoreTest.java` (신규) | 정렬 결정적 단위 테스트. |

> ⚠️ `collector/ApmCollectorController.java`도 워킹트리에 M로 보이지만 **타 세션 변경**이라 이 커밋서 제외한다.

## A1 — 코덱스 4조건 반영 방식
1. **receipt gating 보존**: Phase 1에서 영수증 INSERT가 1을 준 관측만 `winners`에 담고, 후속 phase는 winners만 처리.
2. **테이블별 phase 분리**: 관측별 6테이블 훑기를 폐기 → 영수증→세션→페이지→타이밍→에러→스팬 순서로 phase마다 전 관측을 모아 처리(모든 요청이 같은 테이블 순서).
3. **error group 최초 type/sample_stack 규칙 보존**: SQL 그대로(값 미변경, `count += 1`·`least`/`greatest`).
4. **session 정렬 포함**: 세션 phase를 `(group,browser,os,country,bucket,session_hash)` 정렬. 세션 결과(신규=1)를 `IdentityHashMap`으로 관측별 기억해 페이지 phase의 `sessions` 증분에 사용.
- 정렬 키: timing `(group_id,bucket,kind,name)`, error `(group_id,fingerprint,bucket)`(group 표는 접두 키라 함께 일관), page `(group,browser,os,country,bucket)`, span `(trace_id,span_id)`.
- **값 의미 불변**: 모든 UPSERT가 덧셈/least/greatest라 처리 순서만 바뀌고 결과 동일.

## A2
자연키 5필드 중 `token_id`·`bucket_start`는 호출 내 상수 → `(instance,pipeline,component)` 정렬로 잠금 순서 통일. LinkedHashMap(도착 순서) 대체.

## 중점 확인 요청
1. 🔴 A1 phase 분리로 **모든 테이블의 잠금 순서가 실제로 전 요청에서 동일**해졌는가(교차 테이블 순서 포함). 빠진 테이블/경로 없는지.
2. 🔴 receipt gating 동치성: winners만 세션/페이지/타이밍/에러/스팬에 반영 = 옛 `continue` 의미와 정확히 같은가. 특히 **세션 결과 매핑**(IdentityHashMap 키가 winners의 동일 객체 참조인지)·페이지 `sessions` 증분·반환값(`winners.size()`)·`last_seen` 업데이트 조건.
3. 🟡 값 불변 주장 검증(정렬로 인한 합산/extrema 변화 없음).
4. 🟡 로컬 레코드/스트림 재작성이 예외/트랜잭션 롤백 의미를 바꾸지 않았는가(실패 시 전체 롤백 유지 — `failedBatchRollsBackReceiptAndPageThenRetryWorks` IT 통과).
5. 테스트 검출력.

## 검증 현황
- 컴파일 통과(JDK17).
- 단위: `RumStoreTest`(2)·`ApmCollectorLogStoreTest`(1) 통과 — 정렬/게이팅 결정적 가드.
- IT(실제 Docker Postgres): `RumSchemaIT` **9건 전건 통과, skip 0**(신규 동시성 IT + 기존 dedup·세션 distinct·cap·링크 스팬·extrema·롤백 전부).

## 검수 결과 (Codex, gpt-5.6-sol high, 2026-09-30)

**판정: 조건부 승인.** ⚠️ 검수 전문 캡처가 두 번 실패했다(1차는 `tail -c 200`만 저장, 2차는 시스템 메모리 부족으로 background 강제 종료 — 명령 실패 아님). 확보된 최종 조건 문장에서 반영 필수 3건이 명확했고, 아래에 반영했다.

- [x] **① span 정렬에 `start_ts` 포함** — `apm_rum_span` 유니크 키가 `(trace_id,span_id,start_ts)`라 앞 두 축만으론 잠금 순서 미확정. Phase 6 정렬에 `.thenComparing(op -> op.o().time())` 추가.
- [x] **② error group 최초 `type/sample_stack` 규칙 보존** — group 표는 ON CONFLICT에서 type·stack을 갱신 안 함(최초 INSERT가 확정). 정렬(잠금 순서)이 "최초"를 바꾸지 않도록, `(group,fingerprint)`별 샘플을 **OBS_ORDER(winners) 첫 발생**으로 미리 확정(`errorSample` putIfAbsent)해 저장 값 고정. count·first/last는 덧셈·least/greatest라 실행 순서 무관.
- [x] **③ 결정적 동시성 검증(해당 경로들) 추가** — `RumStoreTest`를 6건으로 확대: timing 순서·error 순서·**error 샘플 OBS_ORDER 보존**·**span (trace,span,start_ts) 순서**·**session PK 순서**·gating. 전부 결정적(정렬/게이팅/샘플 규칙 제거 시 실패). 확률적 부하는 `RumSchemaIT` 동시성 IT가 보완.

**반영 후 검증**: 단위 `RumStoreTest`(6)+`ApmCollectorLogStoreTest`(1) 통과, `RumSchemaIT` **9건 skip 0 통과**(기존 의미 회귀 없음 + 동시성).

> 🔴 미결: Codex 검수 **전문(항목별 심각도)** 은 메모리 문제로 재캡처 못 함. 커밋 전 최종 재검수를 원하면 사용자 요청 시 재실행(지금은 임의 재시작 금지 지침).
