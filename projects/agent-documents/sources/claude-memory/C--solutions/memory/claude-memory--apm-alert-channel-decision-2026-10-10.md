---
name: apm-alert-channel-decision-2026-10-10
description: "2026-10-10 사용자 결정 — APM 독자 알림 창구(메일 등) 자체만 대기, 그 외 알람 작업은 전부 진행해 '창구만 꽂으면 되는' 상태로. 알람 이력은 규칙·서비스 삭제 후에도 보존"
metadata:
  node_type: memory
  type: project
  originSessionId: e05d80c9-f57f-4b0d-a549-a1c837b68a1b
  modified: 2026-10-12T06:27:36.751Z
---

사용자 원문: "자빅스에서 서빙하는 알람 창구 이외에도 우리만의 독자적인 창구가 필요하긴 해. 그 창구를 만드는 건 이제 대기하고 그 이외의 것들은 전부 하면 됨. 딱 알림 시스템만 만들면 전부 가능하도록" / "기록 남김".

1. **독자 알림 창구 = 대기**(메일·웹훅 등 실제 발송 구현만). **그 외 전부 진행**: 순위 11 2차(outbox·커밋 뒤 전송·멱등 키·재시도), B1~B3(요청 걸림 알람 재설계 — 판정 트랜잭션과 외부 I/O 분리), 판정 경로의 Zabbix I/O 제거. 목표 상태: **채널 중립 전송 계층**(outbox 행에 channel, Zabbix가 첫 sink) — 독자 창구는 sink 하나 추가로 끝나야 한다.
2. **알람 이력 보존(B안)**: 규칙·서비스 삭제 시 `apm_alert_event`를 CASCADE로 지우지 않는다. FK 정책 변경 + 규칙·서비스 표시값 스냅샷 열.

**Why:** 9월 30일 "APM 알람 자빅스 분리" 결정의 구체화. 창구 구현 전에 구조를 끝내 두면 창구 작업이 작아진다.
**How to apply:** 설계 시 Zabbix 전용 가정(push 함수 직접 호출)을 판정 경로에 남기지 말 것. Flyway는 V76부터(V72·73 GPU, V74·75 알람). 관련 [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--apm-alert-atomicity-decisions|apm-alert-atomicity-decisions]] [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--apm-incidents-menu|apm-incidents-menu]] [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--apm-domain-improvements-backlog|apm-domain-improvements-backlog]]

**진행(10-12, 브랜치 apm-alert-history 미푸시·master 미병합):** 단위1 `7bb657b`·2·3 `d989497`·4 `3015cd7`·5a-1 `68dc81b`(V79)·5a-2 `09c5261`(코덱스 5차 승인)·5b `2e5af81`(V80, 코덱스 4차 승인)·6a `0c7ee42`(10-13, 코덱스 3차 조건부 승인→조건 테스트 반영). 🔴합본 전 필수: 단위 8 DEAD 회복 창구(resync는 DEAD RPUSH를 안 살림, 보류 -1 5분 초과=NEUTRALIZE_TIMEOUT DEAD 포함)·7 1초 장부 in-tx 제거(진행 중)·6b 대조. 미실측: Zabbix가 트리거 켤 때 마지막 값 즉시 판정 여부. 공유 아이템 -1 생략 위험은 백로그(최근 성공 push 시각). 다음 6a→7→6b→8 후 BE+FE 함께 병합, 병합 직전 `premium.apm.*` 회귀를 나눠 실행(사용자 결정, OOM 이력). 🔴10-12 사용자 결정: **자동 item.delete 금지** — 정리는 `item.update {itemid,status:1}`만(태그 미전송), 수동 정리는 가이드 `guides/ops_apm-alert-item-cleanup.md`만(API·화면 없음). 5b는 비활성 우리 아이템 재활성화 후 재사용 필수. **배포 전 옛 정리 큐(apm_zbx_cleanup) 0건 확인 = 배포 차단 조건** 수용. 설계 정본 features/apm/alerts/apm-alert-unit5-6-design-20261011.md §11.

**10-19 단위 7 커밋 `bad215d`**(코덱스 2차 조건부 승인 — 새 🔴 없음, 조건=단위 8 DEAD 회복 합본 필수). 남은 순서: **6b 대조 → 8 DEAD 회복(BE+FE) → Zabbix clock 역전 실측 → 병합**. 🔴병합 시 Flyway: master에 V81(ZM-155)이 먼저 들어가 브랜치 V76~V80이 out-of-order — 번호 재부여 여부 결정 필요(outOfOrder 설정 없음). IT는 Docker DB `dmove-postgres-dev74`(5434) + `IT_DB_URL=jdbc:postgresql://localhost:5434/`.

**10-20 6b 커밋 `90918a0`**(코덱스 7차 승인 — 1~6차 반려: guard 잠금 범위·가족 늦은 획득·m: RCONF·취소 선행 역전·고아 복귀 flush·새 바인딩 경합). 🔴최종 구조 = 대상당 트랜잭션 2개(①예약·PROVISION, 가족 없음 ②부모→바인딩→가족→해소/복귀). 🔴전역 순서 "부모 → 바인딩 → 가족 → resource → 명령 행" — 해소 확인 취소는 `enqueueCancellingConfirms`(적재 잠금 안), 고아 처리는 바인딩 flush 뒤 적재. 다음: 단위 8 BE(설계 §16·§16.9 조건부 진행, FE는 워크트리에서 선구현·미커밋) → 6c → clock 실측 → Flyway → 병합.

**10-21 단위 8(DEAD 회복 창구) 커밋(미푸시)** — 사용자 "ㅇㅇ 커밋해". BE `7317bf5`(apm-alert-history, 90918a0 위) · FE `3808af9`(apm-alert-history-fe). 코덱스 1차 조건부(🔴 테스트 3: 결정적 re-key 경합·NEUTRALIZE 재시도 체인·ack 경합/롤백 감사·FE 상한 재시작) → 2차 승인. 🔴 결정적 경합 헬퍼 `raceOnLane`(pg_locks로 대기 확인 후 변경·커밋), 감사 롤백 검증은 **지연 제약 트리거**(커밋 시점 실패)로. 이월: 600초 정확 경계 IT(PUSH 실행기). 다음: ZM-155 후속 R1~R3 → 6c.

**10-21 Flyway 결정·rebase**: 사용자 "V83~로 번호 재부여". 알람 BE 브랜치를 master `1d50f6e` 위로 rebase(충돌 0, 백업 브랜치 `backup/apm-alert-history-pre-rebase-20261021`), V76~V80 → **V83~V87** rename + 코드·주석·테스트 참조 치환(`V86MigrationIT`·`V87MigrationIT`, Flyway target "85"/"86") — 🔴 rename은 아직 미커밋. 6c 마이그레이션 = **V88**(`activation_generation`·`activation_event_hwm`). 6c 설계 = 설계서 §17(해소 시점 FIRED+RESOLVED 짝·hwm 뒤 보충·서명 커서·원시 id 구간·57014, VERIFY 폐지 제안). FE는 채널 API 미사용 → 6c는 BE+계약만.

**10-21 6c 커밋 `bb14c07`(번호 재부여와 한 커밋, 사용자 "한 커밋으로 ㄱ", 미푸시)** — 설계 1차 재설계 → 2차 진행 → 구현 1차 **승인**(🟡 4 반영). 해소 시점 FIRED 없으면 FIRED+RESOLVED 짝(CTE 한 문장), V88 `activation_generation`·`activation_event_hwm`(스냅샷 기준 — 롤링 배포 보충은 최선 노력, 과잉·과소 인정), `AlertReconcileCursor`(JWT 파생 HMAC, 채널 마지막 필드), 커서 없는 재조정은 초기화 트랜잭션 먼저, 원시 id 구간 페이지(pages=N), 57014+메시지만 부분 결과. 🔴 IT 함정: 원시 구간은 다른 IT가 남긴 이벤트까지 페이지에 들어간다 — 페이지 수·scanned 단언은 구간 행 수 기준이거나 내 구간 커서로 시작. alert 패키지 일괄 실행 시 `ApmAlertDeletePathIT`·`ApmStuckRequestLedgerIT` 등 교차 오염 실패(단독 통과) — 클래스별 단독 실행 유지.

**10-21 Zabbix 실측 → 단위 7b(미커밋, 코덱스 설계 3회·구현 2차 승인)**: dev 7.0.6에서 (a) 트리거는 **도착한 값**으로 판정 — 0 뒤 옛 clock 양수가 오면 last는 0인데 거짓 Problem이 남는다 🔴, (b) 같은 (clock, ns)는 **처음 값만 저장**(뒤는 success 응답인데 버림), ns가 다르면 전부 ns 순 저장, (c) 트리거를 켜도 즉시 판정 안 함(다음 값부터). 수정 = V89 `apm_zbx_item_push_mark` + `ApmZbxItemPushClock`(아이템 JVM 잠금 → 재검증 → (clock, ns) 엄격 증가 예약 → 커밋 뒤 push, 옛 측정 표본은 STALE_SAMPLE로 생략), PUSH_CURRENT target에 `sampleMs`(STUCK=감시기 tick, 나머지=창 끝), 대기 병합은 sampleMs 큰 쪽, RCONF 실효 cutoff = max(cutoff, 아이템 last_clock), 잠금 대기는 리스 예산에 포함, interrupt는 반납. 🔴 단일 노드 전제(다중 노드 도착 순서 미보장). 실측 스크립트 `_archive/features/apm/alerts/zbx_*_probe_20261021.py`.

**2026-10-22 master 병합(미푸시)**: BE 7b `1a36632`(V89 아이템별 push 시각 예약표) 포함 알람 브랜치 12커밋 → BE master ff. FE 알람 브랜치 rebase(백업 `backup/apm-alert-history-fe-pre-rebase-20261022`, 위젯 수 138로 충돌 해소) + 게이트 테스트 수정 `4c301fd` → FE master ff. 🔴master FE `apmRelativeText` 1건은 ZM-155 기존 실패(QueryClient 없음) — 별건. 남은 것: 런타임 검증(재기동은 따로 물을 것)·보안·이벤트 보존·옛 경로 하드링크 삭제·7b 🟡 유지보수.
**10-22 런타임 검증(BE :3000 dev70 재기동)**: Flyway V82~V89 적용 OK · 평가 tick 2회 push ok=3/3, push_mark (clock,ns)=(…394,1)→(…696,0)이 dev Zabbix history와 일치 · 반영 명령 0/0/0 · 알람 API·규칙 화면·반영 명령 카드·장애 탭 렌더 OK. 🔴MCP 탭에선 SignIn의 FingerprintJS가 멈춰 폼 로그인이 안 됨 → 탭 visitor id로 /auth/login fetch + localStorage isAuthenticated=1. 관찰: 전역 규칙 4개 바인딩 6건 "캐시 동기화 대기"(트래픽 없음, 기존 상태) — 미조사.
**10-22 할당기 경유 실제 Zabbix 재실측 통과**: 옛 방식=거짓 Problem·해소 값 유실 재현, 할당기=둘 다 OK(`_archive/.../zbx_live_alloc_probe_20261022.log`). 일회성 IT는 아카이브에 사본만, 워크트리에서 삭제.
**10-22 전체 검토 잔여 A5·B12·B13-① 커밋**: BE `ce9e662`·FE `a06d1f8` master ff(미푸시). A5 알람 이벤트 보존(옵션 `alertEventDays` 400, 해소 기준, 배달 중 통지 제외, 통지 잠금 nowait — PG 55P03은 Spring이 PessimisticLocking으로 안 바꿈→SQLSTATE 판정), B12 16,384자 초과 자유 텍스트·스택은 `?(unmaskable)`, B13-① 원문 SQL 켜기는 관리자만(advisory lock+DB 값 판정, 권한 생략 오버로드 없음). 런타임 확인 통과. ⏸ **B13-②(처리 중 요청 currentOp·path 서버 재가림) 보류** — 시도본 `_archive/features/apm/full-review-20260928/b13-2_*`, 재개 1순위는 확장이 경로 틀(/users/{id})을 보내게 하는 것.
**10-22 바인딩 상태 칸 분리**: BE `edd28fa`·FE `058941d` master ff(미푸시). 요약에 `orphaned`(평가 제외)·`awaitingValue`(만든 지 10분 지나도 첫 값 없음=보낼 데이터 없음) 추가, '캐시 동기화 대기' 문구→'Zabbix 준비 중'. dev 실측: 19 바인딩 = 정상 6·평가 제외 10·보낼 데이터 없음 3(이전엔 대기 6·정상 13 — 정상 중 7이 사실 평가 제외였다). 🔴테스트 러너는 실행 전 결과 XML을 지워야 한다(컴파일 실패 시 옛 결과를 '통과'로 읽었다).
