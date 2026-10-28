# 검수 요청 — ZM-125 알람 목록·알림 벨을 event_problems 사본 읽기로 전환

- 커밋: `7b6d228` (브랜치 `ZM-123`, 워크트리 `C:/worktrees/zm-123-be`) — 선행 `cf4c951`(ZM-124) 위
- 에픽: ZM-123 무브스아이 성능 향상
- 작성: 2026-09-03

## 범위·의도

트래픽이 가장 많은 두 화면 — 알람 목록(`GET /event/problems` RECENT 모드)과 알림 벨
(`GET /event/bells`, 전 사용자 60초 폴링) — 이 매 요청 Zabbix(problem.get+trigger.get 2단)를 때리던 것을
**1분 주기로 이미 적재 중이던 `event_problems` 사본 읽기**로 전환. 요청당 Zabbix 콜:
목록 = 인벤토리(권한) 1 + 페이지 조치 하이드레이션 1, 벨 = 인벤토리(권한) 1.

- **V49**: suppressed·cause_event_id·rule_enabled·group_refs(JSON)·total_actions 컬럼 추가.
- **EventSyncService**: 행 매핑을 `toRow`로 통합해 확장 컬럼 적재. `resyncEvents(ids)` 신설 —
  조치 직후 대상 행만 즉시 재갱신(수동 종료의 해소 시각은 복구 사건 2단 조회로 즉석 채움).
- **EventService**:
  - RECENT 목록 = `flatFromCopy`: 창 조회 → recent 창(해소 후 `event.recent-window-seconds`, 기본 300초 =
    Zabbix ok_period 재현) → 권한(가시 호스트 집합) → rule_enabled=false 제외(NULL은 V49 이전 행 유예) →
    키워드(이름 소문자 부분일치)·호스트·그룹·처리일시 필터. 칩/트리/정렬/페이징 파이프라인은 기존 그대로.
  - 조치 타임라인은 화면 페이지만 `hydrateRecentActions`(event.get 1콜)로 **실시간** 채움.
  - 벨 = 열린 행+권한+키워드 → 칩은 심각도 무필터 모집단(ZM-124 축) → severitiesForStatus 필터 → 읽음 상태 DB.
  - `acknowledge` 후 `resyncEvents` 베스트에포트(실패해도 조치 성공).

## 불안한 지점 (여기를 봐 달라)

1. **권한 스코핑 신뢰성** 🔴 — 사본은 시스템 토큰으로 동기화되므로 사용자별 가시성을
   `inventoryPort.listHosts(ctx, 전체)` 결과로 앱이 대신 건다. (a) host_id가 NULL인 행(규칙에 엔티티 없음)은
   **통과**시키는데, 이게 정보 노출이 될 수 있는지. (b) listHosts의 가시 범위가 problem.get의 가시 범위와
   정확히 같은 축인지(Zabbix 권한 모델상 호스트 읽기 권한 = 문제 읽기 권한으로 알고 있음).
2. **의미 변화 지점들**:
   - RECENT의 "최근 해소" 창을 상수(기본 300초)로 재현 — 고객 Zabbix의 ok_period가 다르면 표시가 어긋난다
     (yml `event.recent-window-seconds`로 조정). 종전에는 Zabbix가 알아서 했다.
   - 정렬축 totalActions는 사본의 근사치(raw ack 수, 해소 라이프사이클 +1 미포함) — 표시값은 하이드레이션이 덮는다.
   - resolutionTime의 밀리초 정밀도(r_ns)가 초 단위로 낮아짐(사본 r_clock이 초).
   - 신선도: 목록/벨 반영이 최대 1분(동기화 주기) — 조치는 표적 재동기화로 즉시.
3. **배포 직후 유예**: rule_enabled NULL 행을 포함(빈 목록 방지) — 첫 동기화(≤1분)까지 비활성 규칙 알람이
   보일 수 있음. 반대안(제외)은 배포 직후 목록 전체가 비어 보인다.
4. **동기화 껐을 때**: event_sync 스케줄러를 끄면 목록이 정지된 사본을 보여준다 — 운영 전제(스케줄러 필수)를
   문서화했지만 코드 가드는 없음.
5. keyword 축: 종전 Zabbix `search{name}`(이름만) → 사본에서도 이름만 소문자 부분일치로 재현했는데,
   벨의 2단계 인메모리 필터(호스트/그룹/설명 OR)는 기존 그대로 유지 — 이중 필터 의미가 종전과 같은지.

## 검증 / 미검증

- ✅ BE 전체 테스트 그린(2m37s). 신규/개정 테스트: 사본 필터 축 9건(비활성 규칙·NULL 유예·권한·키워드·억제·
  원인 트리·recent 창·처리일시·칩 모집단), 벨 사본 1건, 조치 재동기화 2건, 동기화 확장 컬럼 3건.
- ❌ **런타임 실측 의도적 보류** — 워크트리에서 기동하면 V49가 공유 dev DB에 먼저 적용돼
  master(:3000) 기동이 Flyway validate에서 깨진다. ZM-123 병합 후 :3000 재기동으로 실측 예정
  (체크리스트: 목록/벨 응답 대조, 조치 직후 반영, 일반 사용자 계정 가시성).
- ❌ FE 무수정 전제 — 응답 shape 불변이므로 FE 영향 없음(계약 동일). 단 신선도 체감(≤1분)은 런타임에서 확인.

## 검수 결과 및 반영 (2026-09-03, codex exec → 픽스 커밋 `c2706b7`)

결함 4건 발견, 전건 반영:

| # | 심각도 | 결함 | 반영 |
|---|---|---|---|
| 1 | HIGH | 사본의 단일/NULL host_id 권한 판정이 Zabbix 가시성(트리거 전 호스트 AND)을 재현 못 함 | V49에 `host_ids`(전체 호스트 JSON) 추가, 판정을 `containsAll`(AND)로, 빈 배열은 fail-closed. NULL(V49 이전 행)만 단일 축 유예. 다중 호스트·fail-closed·유예 테스트 3건 |
| 2 | MEDIUM | 조치 직후 벨 읽음 상태가 다음 동기화까지 미갱신 | `markReadForUser` — 조치자 즉시 읽음 upsert(베스트에포트). 테스트 추가 |
| 3 | MEDIUM | 벨 상태 필터 결과 0건이면 칩 카운트까지 통째로 0 | 빈 결과 반환에도 필터 전 모집단 counts 유지. 테스트 추가 |
| 4 | LOW | 동기화 정지·빈 사본을 '알람 없음'으로 은폐 | **부분 반영** — 창 안 최신 updated_at 5분 초과 시 분당 1회 warn 로그(`warnIfCopyStale`). readiness 실패/Zabbix 폴백은 미채택(복잡도 대비 — 운영 문서로 보완, ZM-133에서 명시 예정) |
