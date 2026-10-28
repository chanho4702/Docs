# 검수 요청 — APM "장애 및 에러" 메뉴 BE (2026-10-08)

- 브랜치 `apm-incidents-menu`(워크트리 `C:\worktrees\apm-c05-followup`, base master `3de55ec` = 순위 11 1차 포함)
- 설계 정본 `_workspace/features/apm/alerts/apm-incidents-menu-20261008.md` §2.2. diff 전문 `scratchpad/incidents-be.diff`(349줄)
- 검수 범위: BE만. FE는 별도 요청서로.

## 1. 배경·결정
사용자 요청 "APM 메뉴 중에 장애 및 에러 탭으로 별도 관리". 결정: 사이드바 `incidents` 메뉴(알람·요청 걸림·에러 분석 3탭), **발화 이력 조회 권한 `apm.edit`→`apm.view`**, 알람 탭에 "열린 것만" 스위치(기본 켬). 09-30 "APM 알람 자빅스 분리·독자 알림" 결정과 정합 — 이 작업은 **조회·권한·페이징만**이고 전송(outbox)은 넣지 않는다.

## 2. 변경 (4파일 + IT 1)
| 파일 | 변경 |
|---|---|
| `alert/ApmAlertRuleController.java` | `GET /apm/alert-events`: `access.requireEdit`→`requireRead`, `@RequestParam Boolean open` 추가, javadoc·`@Operation` 갱신 |
| `alert/rule/ApmAlertService.java#events` | `findAll()` 메모리 필터·정렬·페이징 → `ApmAlertEventRepository.search(from,to,serviceId,openOnly,PageRequest.of(skip/size,size))`. 규칙·서비스 이름은 페이지의 id 집합만 `findAllById`. 시그니처에 `Boolean open` 추가(호출처는 컨트롤러 1곳) |
| `core/domain/ApmAlertEventRepository.java` | `search` JPQL 신설: `(:openOnly = true or (firedAt in [from,to])) and (:serviceId is null or serviceId = :serviceId) and (:openOnly = false or resolvedAt is null) order by firedAt desc, id desc` |
| `alert/ApmAlertRuleMvcTest.java` | USER(권한 칸 없음) `/alert-events` 403 유지 + `events()` never 검증 · **신규** `alertEventsOpenToViewers`: `granting(view=true, edit=false)` 계정이 `open=true&limit=20`으로 200·`events(null,null,null,TRUE,20,null)` 전달·같은 계정 `/alert-rules`는 403 |
| **신규** `alert/query/ApmAlertEventSearchIT.java` | 실 PG 3건: open=false 창 안 2건 최신순 / **open=true 창 무시**(30일 전 열린 행 포함, 닫힌 행 제외) / serviceId=null이 NULL 축 포함·없는 id 0건·total이 limit에 안 잘림. 🔴 V74 UNIQUE 때문에 열린 행 둘은 규칙을 달리해 심는다 |

문서: `features/apm/core/contract_apm.md` §6.6 행(권한·`open`·창 무시)·알려진 제약 9(메모리 페이징 취소선).

## 3. 설계 판단 — 의견 요청
1. **`open=true`는 from/to를 무시한다.** 근거: 열린 알람은 언제 터졌든 "지금 문제"이고, 창을 적용하면 하루 넘게 방치된 장애가 화면에서 사라진다(개요 위젯 `ApmAlertQueryStore#recent` 주석이 "지금 열려 있는 것 전부"를 알람 화면에 맡겨 둠). 요청 걸림 `/stuck-requests`의 `open`은 창을 **유지**한다(1초 감시기가 LOST로 닫아 열린 건 최근 것뿐) — 두 EP의 `open` 의미가 다른데, 문서화로 충분한가 vs stuck도 창 무시로 맞춰야 하는가.
2. **권한 완화 범위**: `/alert-events`만 view. 규칙 목록·zabbix-status·서비스별 적용 규칙(`/services/{uid}/alert-rules`, 이미 운영자 읽기)은 그대로. 발화 이력 DTO엔 `ruleUid`·`kind`·`thresholdUnit`·`value`가 실린다 — 임계값 자체는 없지만 `value`(측정값)로 임계를 역추정할 수 있다. "임계는 운영 정책이라 edit"였던 원칙과 충돌하는지.
3. **JPQL `:openOnly = true or (…)`** — Hibernate 6에서 boolean 파라미터 비교가 PG `boolean = ?`로 내려가는 것은 IT로 확인. 인덱스: `apm_alert_event`에 `fired_at` 인덱스가 있는지 확인 못 함(V74는 부분 UNIQUE만). `open=true` 경로는 V74 부분 인덱스(`WHERE resolved_at IS NULL`)를 타고, `open=false` 경로가 fired_at 범위 스캔 — 보존 400일 규모에서 인덱스 추가가 필요한지.
4. **페이지 경계 절삭** `PageRequest.of(skip/size, size)` — 요청 걸림과 같은 규칙. FE는 limit 배수만 보냄.
5. `@VisitorIdCheck`를 stuck과 달리 `/alert-events`엔 안 붙였다(기존에도 없었음). 붙여야 하는가.

## 4. 검증
- `ApmAlertRuleMvcTest` 통과(JDK17, `:test --tests`). `premium.apm.alert.*` 패키지 전체 **203 통과·실패 0**(IT 포함, 격리 DB).
- 격리 PG 5434(`IT_DB_URL`, `-Dit.db.required=true`): `ApmAlertEventSearchIT` 3/3, `ApmAlertEventStoreIT` 6/6.
- 브라우저·dev BE 런타임 미검증(재기동은 사용자 명시 요청 시).

## 5. 코덱스 의견 — 1차 **조건부 승인** (`_codex.md`)

## 6. 반영 (2026-10-08)
| # | 지적 | 반영 |
|---|---|---|
| 🔴1 | `PageRequest.of(skip/size)` offset 내림 | `OffsetBasedPageRequest(skip, size)`로 교체 — **알람 이벤트·요청 걸림 둘 다**. IT `arbitraryOffsetIsExact`(limit=1·offset=1 → 두 번째 행, offset 메타 1) |
| 🔴2 | `fired_at` 선두 인덱스 없음 | **V75** `apm_alert_event_fired_id_idx (fired_at DESC, id DESC)` 신설(정렬과 같은 순서). IT `firedIndexExists`. EXPLAIN 실측은 미실시(시드 수십 행으로는 계획이 의미 없음 — 반영 §7) |
| 🔴3 | FK CASCADE vs DTO "삭제되면 null" 문구 | **A안(문구 정정)**: `ApmAlertEventDto` 주석·계약서에 "규칙·서비스 삭제 시 이력 행도 함께 지워진다"로 바로잡음. 이력 보존(FK 정책·스냅샷 열)은 **백로그** — 사용자 결정 사항으로 보고 |
| 🟡 stuck `open` 창 유지 불일치 | `ApmStuckRequestRepository.search`도 `openOnly=true`면 창 무시 — 두 EP 의미 통일. 계약서 갱신 |
| 🟡 `now()` 행마다 | `events()`가 기준 시각 1회 → `toDto(…, now)` |
| 🟢 `@VisitorIdCheck` | 클래스 레벨에 이미 있음 — 추가 안 함 |
| 테스트 공백 | 동률 정렬 `tieBreaksById` 추가. 서비스 A/B 실제 행·from>to·기본값 테스트는 미추가(서비스 행 시드 비용 대비 — §7) |

반영 후 검증: 격리 PG 5434 `premium.apm.alert.*` **206 통과·실패 0**(SearchIT 6/6 포함). diff 전문 `scratchpad/incidents-be-r2.diff`.

## 8. 2차 코덱스 **조건부 승인**(`_codex2.md`) → 반영
| # | 지적 | 반영 |
|---|---|---|
| 🔴1 | `limit=1·offset=1`은 배수라 옛 내림 코드도 통과 | `limit=2·offset=1`(창 안 3행 → 2·3번째)로 교체. 요청 걸림 `ApmStuckRequestQueryServiceTest.arbitraryOffsetReachesRepository`(20/25 → Pageable.getOffset 25·응답 메타 25) 추가 |
| 🔴2 | "규칙 삭제 후 이벤트가 영원히 남는다" 주석 4곳 | `ApmAlertService.delete`·`deleteService`·`deleteRule` 주석, `ApmAlertRuleController.delete` 주석 — CASCADE로 이력이 함께 사라짐·먼저 닫는 이유는 해소 push로 정정. 테스트 표시명엔 해당 전제 없음(grep) |
| 🔴3 | `/stuck-requests` Swagger가 옛 의미 | `@param open`·`@Operation`에 "open=true면 from/to 무시" 명시 |
| 🟡 | 인덱스 단언 느슨 | `contains("(fired_at DESC, id DESC)")` 순서까지 |
| 🟡 | "V74가 받는다" 과장 | V75 SQL·리포지토리 주석을 "후보, EXPLAIN 실측 후 확정"으로 |
| 🟡 | stuck 리포지토리 IT(오래된 열린 행) | 미추가 — FE 테스트·계약서로 고정, 후속 |
| §7-2 | A안 수용, **제품 영향 사용자 보고 필수** | 규칙 삭제=그 규칙 이력 전부 삭제 · 서비스 삭제=규칙+이력 삭제 · "400일 보존"은 부모가 남아 있는 동안의 상한 · 종류 변경(삭제 후 재생성)도 이력 단절 → 사용자 보고 항목 |

2차 반영 후 검증: 격리 PG 5434 `premium.apm.alert.*` **207 통과·실패 0**. diff 전문 `scratchpad/incidents-be-r3.diff`.

## 9. 3차 코덱스 **조건부 승인**(`_codex3.md`) → 반영
- 🔴 "먼저 닫는 이유 = 해소 push"가 실제 코드와 다름(`resolveOpenEvents()`는 `resolved_at`·건수만, Zabbix push 없음. Zabbix Problem은 뒤이은 `removeObjects`로 소멸) → `ApmAlertService.delete`·`deleteService`·`deleteRule`·`ApmAlertRuleController.delete` 주석 4곳을 "resolved_at 기록·건수 집계뿐, 행은 곧 CASCADE 삭제"로 정정. **주석만 변경이라 테스트 재실행 생략**(직전 207 통과 그대로), 4차 검수 요청 안 함.
- 🟡 stuck 리포지토리 IT(오래된 열린 행) — 병합 차단 아님, 후속 백로그.
- 🟢 비배수 offset 테스트 2종은 옛 코드에서 반드시 실패함을 코덱스가 대입 확인. 인덱스 순서 단언·"후보" 문구 적절.

## 7. 남은 의문 (2차 검수 요청)
- 서비스 A/B 실 데이터 필터 IT·`from > to` 동작·EXPLAIN 실측을 이번에 넣어야 하는지(규모 데이터 없이 EXPLAIN은 순차 스캔이 정상이라 실측이 의미 없음).
- 🔴3 A안(이력은 규칙·서비스와 함께 삭제)으로 둬도 되는지 — 제품 관점의 결정이라 사용자에게도 보고.
