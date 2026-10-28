# APM "장애 및 에러" 메뉴 분리 — 설계·실행 계획 (2026-10-08)

> 사용자 요청: "APM 메뉴 중에 장애 및 에러 탭으로 별도 관리하고 싶어".
> 결정(2026-10-08, AskUserQuestion): ① 에러 분석을 탭으로 흡수 ② 발화 이력 조회 권한을 `apm.view`로 완화 ③ 순위 11 1차는 커밋(BE `3de55ec`, master ff).

## 1. 왜

| 지금 | 문제 |
|---|---|
| 발화 이력·요청 걸림 탭이 관리 콘솔 `/setting/apm/alert-rules`(알람 규칙 화면) 안에 있고, 그 화면 전체가 `apm.edit` 전용 | `view`만 가진 운영자는 **APM 장애 이력을 볼 수 없다**. "규칙(정책)은 관리자"와 "지금 무슨 장애가 났나(관측)"가 한 화면에 묶여 권한 축이 거칠다 |
| 에러 분석(`/application-monitoring/errors`)은 사이드바 비노출(설계 §1.2) | 서비스 상세·검색·개요 카드로만 진입 — "에러가 뭐가 나는지"를 보려면 서비스를 먼저 골라야 한다 |
| BE `/apm/alert-events`가 `requireEdit` + `findAll()` 메모리 페이징 | 권한이 관리 축이고, 모든 운영자가 여는 메뉴가 되면 전건 스캔이 매번 돈다 |

2026-09-30 결정(APM 알람을 자빅스에서 **분리**, 알림 페이지 안 섞음, 독자 알림 채널은 별도 지시)과 정합: 이 메뉴는 APM 자체 장부(`apm_alert_event`·`apm_stuck_request`·`apm_error_group`)만 본다. 자빅스 Problem 화면과 섞지 않고, **독자 알림 채널(전송)은 이 작업에 넣지 않는다**(순위 11 2차와 같은 덩어리 — 지시 전 착수 금지).

## 2. 범위

### 2.1 FE — 사이드바 "장애 및 에러" 신설
- 경로 `PATH_APPLICATION_MONITORING.incidents = /application-monitoring/incidents`, 사이드바 key `"incidents"`, 라벨 `apm.menu.incidents` = "장애 및 에러" / "Incidents & Errors". 위치: **트레이스 탐색 다음, 합성 감시 앞**(관측 흐름: 개요→실시간→서비스→맵→트레이스→장애·에러→합성→SLO→RUM).
- 탭(`?tab=`, URL에 산다 — 알람 규칙 화면과 같은 규약):

| 탭 key | 라벨 | 내용 | 출처 |
|---|---|---|---|
| `alerts` | 장애(알람) | 서비스 단위 알람 이벤트. **"열린 것만" 스위치**(기본 켬 → `open=true`, 창 무시) + 발화 이력(창 안) | `ApmAlertEventsTab` 이동 |
| `stuck` | 요청 걸림 | 요청 단위 장부(V67) | `ApmAlertStuckTab` 이동 |
| `errors` | 에러 분석 | 예외 그룹·스택·발생 경로 | `ApmErrorExplorer`(기존 `/errors` 본문) |

- 기본 탭 `alerts`. 시간 창은 세 탭 모두 쓴다(알람 탭의 "열린 것만"은 창 무시 — 문구로 밝힘).
- 권한: 화면 진입·세 탭 모두 `apm.view`(라우트 가드 `permissionKey` + 사이드바·검색·모바일 같은 키). `ApmEditRequired` 분기 제거(이 화면엔 edit 축이 없다).
- **관리 콘솔 알람 규칙 화면**: 탭 `rules`·`zabbix`만 남긴다. `APM_ALERT_TAB`에서 `EVENTS`·`STUCK` 제거 → `APM_INCIDENT_TAB` 신설(`alerts`/`stuck`/`errors`). 옛 `?tab=events|stuck`로 들어오면 새 메뉴로 **replace 리다이렉트**(쿼리 유지: `serviceUid`·`open`·`offset`).
- 딥링크 갱신: `apmAlertEventsPath()` → `/incidents?tab=alerts&serviceUid=`(개요 "최근 알람" 카드·"전체 보기"). 에러 분석 딥링크(서비스 상세 '에러' 탭·검색·개요)는 `/errors` 주소 그대로 두되 **`/errors` 라우트는 `/incidents?tab=errors`로 리다이렉트**(쿼리 유지). `PATH_APPLICATION_MONITORING.errors`는 상수로 남긴다(테스트·브레드크럼·검색 항목이 본다) — 검색 항목 `apm-errors`는 새 주소로 바꾼다.
- 레거시 `PATH_APM_LEGACY.alertRules`(`/application-monitoring/alert-rules?tab=events`) → 콘솔로 가던 것이 다시 새 메뉴로 와야 한다: 콘솔 화면의 탭 리다이렉트가 받으므로 추가 작업 없음(2단 리다이렉트).
- 도움말: `page-guide.ts`에 `incidents` 항목(탭별 `apm_alerts_events`·`apm_alerts_stuck`·`apm_errors` 재사용 가능하면 재사용), `apmHelpContent` 키 추가. 브레드크럼 `apm.menu.incidents`.
- 테스트 갱신: `__tests__/apmRoutes.test.tsx` — SIDEBAR_KEYS 9개(`incidents` 추가), SCREEN_KEYS에 `incidents`(라우트 20개·게이트 수), 비노출 목록에 `errors` 유지(사이드바 key는 `incidents`), 검색 15→16?(`apm-errors`를 `apm-incidents`로 **교체**하면 15 유지 — 교체한다). 알람 규칙 탭 테스트 있으면 2탭으로.
- i18n kr/en: `apm.menu.incidents`, `apm.menu_desc.incidents`(검색·도움말 설명), `apm.incidents.tab.{alerts,stuck,errors}`, `apm.incidents.open_only`·`open_only_hint`("열린 알람은 발화 시각과 무관하게 전부 보입니다").

### 2.2 BE — `/apm/alert-events`
1. `ApmAlertRuleController.events`: `access.requireEdit` → **`requireRead`**, `@RequestParam(required=false) Boolean open` 추가, `@VisitorIdCheck`는 stuck과 동일하게.
2. `ApmAlertService.events(serviceUid, from, to, open, limit, offset)`: `findAll()` 메모리 필터 → `ApmAlertEventRepository.search(from, to, serviceId, openOnly, pageable)` JPQL 페이징(`ApmStuckRequestRepository.search` 패턴). **`open=true`면 창을 적용하지 않는다**(열린 알람은 언제 터졌든 지금 문제 — 개요 위젯 주석 "지금 열려 있는 것 전부는 알람 화면의 몫"을 이 EP가 맡는다). 규칙·서비스 이름은 페이지의 id 집합만 `findAllById`.
3. `ApmAlertRuleMvcTest`: 일반 USER 403 케이스에서 `/alert-events`를 빼고, `granting(view=true, edit=false)`로 **view 통과** 케이스 추가(규칙 목록은 여전히 403).
4. 리포지토리 단위 검증: `ApmAlertEventRepository.search` JPQL은 NULL `serviceId` 함정(클래스 주석)을 피하도록 `(:serviceId is null or e.serviceId = :serviceId)` — 서비스 필터 없음=전부(수집기 축 포함). IT 1건(`ApmAlertEventQueryIT` 또는 기존 `ApmAlertEvaluationIT`에 추가): 창 밖 열린 행이 `open=true`에서 나오고 `open=false`에선 안 나옴.
5. 계약서 `_workspace/features/apm/core/contract_apm.md` §6.6(있으면) — `open` 파라미터·권한 축 변경 기록. FE `TApmAlertEventsParams.open?: boolean`.

### 2.3 하지 않는 것
- 독자 알림 채널·전송(outbox) — 별도 지시.
- 자빅스 Problem 화면과의 통합·링크 정책 변경(기존 `zbxEventId` → 우리 Problem 상세 링크는 그대로).
- 알람 규칙 편집 UI 이동(콘솔에 남김).

## 3. 순서
1. BE(워크트리 `apm-c05-followup`, 브랜치 `apm-incidents-menu`) → 테스트 → 코덱스 검수.
2. FE(`fe-engineer` 위임, 커밋 금지) → tsc·typecheck:contract·jest → 코덱스 검수.
3. 커밋 승인 요청(BE·FE 각각 `#ZM-122`).

## 4. 코덱스 의견 / 결정 / 후속 (2026-10-10 종료)
- **커밋**: BE `b61d33e`(master ff, 브랜치 `apm-incidents-menu`) · FE `cbadb3e`(master). 미푸시.
- **BE 검수 3회**(`reviews/review_apm-incidents-menu-be-20261008*.md`): 🔴 임의 offset 내림 → `OffsetBasedPageRequest`(알람·걸림) · 🔴 `fired_at` 선두 인덱스 → **V75** · 🔴 FK CASCADE vs "삭제돼도 이력 남음" 문구 → A안(문구 정정) · 🟡 stuck `open` 창 무시 통일 · `now()` 1회 · 3차는 "해소 push" 표현 정정(resolveOpenEvents는 resolved_at·건수만).
- **FE 검수 2회**(`…-fe-20261008*.md`): 🔴 걸림 탭 `open=1` 빈 문구 · 🔴 이력 링크 `open=0` · 🔴 비배수 offset ↔ DmoveTable 페이지 번호 → `useAlignedPagination` · 2차 승인.
- **FE jest 멈춤**: 테스트 mock이 렌더마다 새 `URLSearchParams` → DmoveTable effect 무한 setState(mock 산물). 참조 캐시로 수정([[fe-jest-mock-searchparams-loop]]).

### 결정 대기(제품)
- 🔴 **규칙·서비스 삭제 시 알람 이력이 FK CASCADE로 함께 삭제**(V38부터). "400일 보존"은 부모 생존 동안의 상한. 종류 변경(삭제 후 재생성)도 이력 단절. 보존이 요구되면 B안: FK 정책 변경 + 규칙·서비스 표시값 스냅샷 열 + 조립 코드 null 처리 — 별도 티켓.

### 후속 백로그(병합 차단 아님)
- BE: stuck 리포지토리 IT(오래된 열린 행·닫힌 행 시드) · 서비스 A/B 실 데이터 필터 IT · 규모 데이터 EXPLAIN(custom/generic plan, V74 부분 인덱스 선택 여부).
- FE: 다음 페이지 전환(`offset=40`) 테스트 · `limit` 변경 재정렬 테스트 · `/application-monitoring/alert-rules?tab=events`부터의 2단 리다이렉트 Router 테스트.
- 브라우저 런타임 검증(dev BE 재기동 필요 — 사용자 요청 시).
