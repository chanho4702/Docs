# 대용량 호출 방어 작업군 문서 지도 (`ZM-159`)

> 갱신: 2026-09-21. **ZM-159 종료.** 호스트 5천·아이템 1천만 규모에서 자빅스 조회가 서버를 죽이거나
> 잘린 결과를 정답처럼 보여주던 문제를 막은 작업의 **모든 문서가 어디 있고 뭘 담는지** 한 장으로.
> 새 문서가 생기면 여기에 한 줄 추가한다.

## 0. 어디부터 읽나

| 상황 | 먼저 볼 것 |
|---|---|
| **개발자가 아닌 사람에게 설명한다** | [`features/infra/scale-call-guard/zm-159_쉬운-설명_무엇을-왜-고쳤나.md`](zm-159_쉬운-설명_무엇을-왜-고쳤나.md) — 화면별로 "뭐가 문제였고 어떻게 고쳤나" |
| **무엇을 왜 고쳤는지 정확히 알고 싶다** | [`features/infra/scale-call-guard/zm-159_scale-call-guard.md`](zm-159_scale-call-guard.md) — 기술 보고서(1~7장). 커밋 목록·런타임 확인·남은 일이 여기 |
| **배포한다** | 같은 보고서 머리말의 🔴 **배포 주의**(설정 두 값의 관계) + §5 남은 일 |
| **왜 이렇게 설계했나** | [`features/infra/scale-call-guard/devdesign_zm-159-scale-call-guard.md`](devdesign_zm-159-scale-call-guard.md) — **§0이 결정 정본**, §0.7이 범위·순서 |
| **이어서 작업한다(남은 것)** | 이 문서 §4 + [`features/infra/scale-call-guard/backlog_zm-159-후속.md`](backlog_zm-159-후속.md) |
| 알람·문제 흐름이 헷갈린다 | [`features/apm/alerts/alert-sync.html`](../../apm/alerts/alert-sync.html)(아키텍처) · [`features/apm/alerts/alert-sync-cycle.html`](../../apm/alerts/alert-sync-cycle.html)(회차별 증분·보정) |
| 애초에 왜 시작했나 | [`features/infra/scale-call-guard/audit_scale-5000-hosts.md`](audit_scale-5000-hosts.md) — 전수 감사(🔴36·🟠87) |

## 1. 층 구조

- **증거** = `_workspace/` — 왜 그렇게 결정했나, 검수·실측 기록(판단 근거 복원용). **이 문서군이 여기 있다.**
- **정본** = `moveseye-docs/` — 현재 제품이 어떻게 동작하는가. 🔴 이 레포는 우리가 커밋하지 않는다(사용자 지시 09-17).
  ZM-159이 건드린 것: `operations/설치-배포-가이드.md` §5-1 `BE_JAVA_OPTS`(**미커밋 보류** — 다른 세션 변경이 섞여 있음).
- **경험** = 옵시디언 `claude-experiences/` + 메모리 `zm-159-scale-call-guard.md` — 교훈만.

---

## 2. 문서 목록

### 2.1 보고서 (결과)
| 파일 | 담는 것 |
|---|---|
| [`features/infra/scale-call-guard/zm-159_scale-call-guard.md`](zm-159_scale-call-guard.md) | **기술 보고서 정본.** 문제 → 변경(C1~C8·결함·범위설정·C5) → 사용자에게 보이는 변화 → 검증 → **런타임 확인(§4.9)** → 남은 일 → 커밋 11개 → 개발 중 교훈 |
| [`features/infra/scale-call-guard/zm-159_쉬운-설명_무엇을-왜-고쳤나.md`](zm-159_쉬운-설명_무엇을-왜-고쳤나.md) | **비개발자용.** 화면 15곳을 하나씩("홈 그룹 요약", "인터페이스 상태 차트"…), 남은 것, 확인한 것 |

### 2.2 설계
| 파일 | 담는 것 | 상태 |
|---|---|---|
| [`features/infra/scale-call-guard/devdesign_zm-159-scale-call-guard.md`](devdesign_zm-159-scale-call-guard.md) | **상위 설계.** §0 결정 정본 · §0.7 범위·순서(C1~C9) · §0.8 수용 기준 | v1 완료 |
| [`features/infra/scale-call-guard/devdesign_zm-159-c8-group-alert-scan.md`](devdesign_zm-159-c8-group-alert-scan.md) | 그룹 알람·문제 조회(H2·H3·H4) — 건수 집계 + 흘려보내기 | v1 구현됨 |
| [`features/infra/scale-call-guard/devdesign_zm-159-c7-truncation-notice.md`](devdesign_zm-159-c7-truncation-notice.md) | 문제 목록 이력 모드의 잘림 표시(BE 계약 + FE 배너) | v1 구현됨 |
| [`features/infra/scale-call-guard/devdesign_zm-159-c5-metric-completeness.md`](devdesign_zm-159-c5-metric-completeness.md) | **원시 시계열 완전성** — 쪼개 읽기 + 완전성 계약 + 인터페이스 차트 상태 기계. §0이 검수 반영 결정, §3.5가 검수 이력 | v1 구현됨 |
| [`features/infra/scale-call-guard/devdesign_zm-159-ta2-problem-cursor.md`](devdesign_zm-159-ta2-problem-cursor.md) | 열린 알람 1만 건 상한 제거(커서 분할 + mark&sweep) | 🔴 **착수 보류 — 별도 티켓**(문서 상단에 사유) |
| [`features/infra/scale-call-guard/devdesign_load-test-synthetic-mock.md`](devdesign_load-test-synthetic-mock.md) | 합성 mock + k6 부하 시험 — **"ZM-159 완료 ≠ 목표 규모 수용 완료"** 를 메우는 별도 트랙 | 설계만 |

### 2.3 코덱스 검수 (총 13회 — 각 `review_*.md` **하단에 반영 기록**, `*_codex.md`가 원문)
| 대상 | 요청서 | 코덱스 결과 |
|---|---|---|
| 상위 설계 | — | [`_archive/features/infra/scale-call-guard/review_zm-159_codex-r1.md`](../../../_archive/features/infra/scale-call-guard/review_zm-159_codex-r1.md)(필수 8건) |
| C1·C2 공통 호출 유틸 | [`review_zm-159-c1c2.md`](review_zm-159-c1c2.md) | [`_codex`](../../../_archive/features/infra/scale-call-guard/review_zm-159-c1c2_codex.md) |
| C3 보호 층 | [`review_zm-159-c3.md`](review_zm-159-c3.md) | [`_codex`](../../../_archive/features/infra/scale-call-guard/review_zm-159-c3_codex.md) |
| C4 메서드 이넘 | [`review_zm-159-c4.md`](review_zm-159-c4.md) | [`_codex`](../../../_archive/features/infra/scale-call-guard/review_zm-159-c4_codex.md) |
| C6 대량 조회 전환 | [`review_zm-159-c6.md`](review_zm-159-c6.md) | [`_codex`](../../../_archive/features/infra/scale-call-guard/review_zm-159-c6_codex.md) |
| 독립 결함 4건 | [`review_zm-159-defects.md`](review_zm-159-defects.md) | [`_codex`](../../../_archive/features/infra/scale-call-guard/review_zm-159-defects_codex.md) |
| C8 그룹 조회 | [`review_zm-159-c8.md`](review_zm-159-c8.md) | 설계 [`-design_codex`](../../../_archive/features/infra/scale-call-guard/review_zm-159-c8-design_codex.md) · 구현 [`_codex`](../../../_archive/features/infra/scale-call-guard/review_zm-159-c8_codex.md) |
| C7 잘림 표시 | [`review_zm-159-c7.md`](review_zm-159-c7.md) | 설계 [`-design_codex`](../../../_archive/features/infra/scale-call-guard/review_zm-159-c7-design_codex.md) · 구현 [`_codex`](../../../_archive/features/infra/scale-call-guard/review_zm-159-c7_codex.md) |
| 알람 동기화 범위 설정 | [`review_zm-159-event-sync-scope.md`](review_zm-159-event-sync-scope.md) | [`_codex`](../../../_archive/features/infra/scale-call-guard/review_zm-159-event-sync-scope_codex.md) |
| A-2 설계(보류 판단 근거) | — | [`-ta2-design_codex`](../../../_archive/features/infra/scale-call-guard/review_zm-159-ta2-design_codex.md) · [`-ta2-design-v1_codex`](../../../_archive/features/infra/scale-call-guard/review_zm-159-ta2-design-v1_codex.md) |
| **C5 완전성** | [`review_zm-159-c5.md`](review_zm-159-c5.md) — 🔴 **하단에 4차까지의 반영 기록** | 설계 [`-design_codex`](../../../_archive/features/infra/scale-call-guard/review_zm-159-c5-design_codex.md) · 구현 [`_codex`](../../../_archive/features/infra/scale-call-guard/review_zm-159-c5_codex.md) → [`v2`](../../../_archive/features/infra/scale-call-guard/review_zm-159-c5-v2_codex.md) → [`v3`](../../../_archive/features/infra/scale-call-guard/review_zm-159-c5-v3_codex.md) → [`v4`](../../../_archive/features/infra/scale-call-guard/review_zm-159-c5-v4_codex.md) → [`v5`](../../../_archive/features/infra/scale-call-guard/review_zm-159-c5-v5_codex.md)(**승인**) |

### 2.4 근거·부속
| 파일 | 담는 것 |
|---|---|
| [`features/infra/scale-call-guard/audit_scale-5000-hosts.md`](audit_scale-5000-hosts.md) | 시작점. 호스트 5천·아이템 1천만 가정 전수 감사(🔴36·🟠87·보안 4) |
| [`features/infra/scale-call-guard/tickets_scale-hardening.md`](tickets_scale-hardening.md) | 감사 → 티켓 초안(T-A·T-B 등) |
| [`features/platform/zabbix-api-reference/zabbix-api-7.0-methods.md`](../../platform/zabbix-api-reference/zabbix-api-7.0-methods.md) | 자빅스 API 7.0 메서드 111개 조사표(C4 이넘의 근거, 테스트가 대조) |
| [`features/apm/alerts/alert-sync.html`](../../apm/alerts/alert-sync.html) + `.architecture.json` | 알림 로직 아키텍처(자빅스 → 동기화 → 사본 DB → 화면) |
| [`features/apm/alerts/alert-sync-cycle.html`](../../apm/alerts/alert-sync-cycle.html) + `.workflow.json` | 회차별 흐름 — 증분(15초)·보정(5분)이 각각 무엇을 하고 하루에 얼마나 쌓이는지 |
| [`features/events/zabbix-load-relief/INDEX_zabbix-performance.md`](../../events/zabbix-load-relief/INDEX_zabbix-performance.md) | 상위 지도 — 자빅스 성능 전반(ZM-123·93·136). ZM-159은 그 뒤를 잇는 작업 |

---

## 3. 무엇을 만들었나 (코드 지도)

| 층 | 핵심 | 파일 |
|---|---|---|
| 호출 공통화 | 요청 조립·응답 변환 단일화, `ZabbixClient` 직접 접근 금지(테스트가 **바이트코드**로 강제) | `engine-zabbix/.../client/ZabbixApiTemplate`·`ZabbixParams` |
| 보호 층 | id 분할 · 기간 창 분할 · id 커서 · 행 상한(`limit=maxRows+1`) · 예산(행·콜·시간) | `client/ZabbixQueryExecutor` |
| 상한 설정 | 응답 바이트 · 보유 행 · 스캔 행 · **원시 보유 행** · 콜 수 · 기한 + **기동 시 검증** | `client/ZabbixCallLimits` |
| 메서드 계약 | 자빅스 메서드 111개 이넘(성격·문서 링크, 버전은 한 곳) | `client/ZabbixMethod` |
| 완전성 계약 | 알람 `AlertScanOutcome` · 측정값 `SeriesResult`·`HistoryScanResult` | `engine-api/.../engine/model/`, `.../zabbix/timeseries/history/model/` |
| 운영 회피책 | 알람 동기화 범위(그룹·최소 심각도·억제 제외·꺼진 규칙 제외) | `app .../event/EventSyncScope`, FE `EventSyncScopeCard` |

---

## 4. 남은 것 (2026-09-21 기준)

정본은 [`features/infra/scale-call-guard/backlog_zm-159-후속.md`](backlog_zm-159-후속.md). 요약:

| 항목 | 성격 |
|---|---|
| **A-2 열린 알람 1만 건 초과분** | 🔴 별도 티켓 — 설계·검토는 끝났고 치명 4건이 남아 ZM-159 범위를 넘는다 |
| 인터페이스 차트 "일부만 표시" 문구 | 후속(응답 계약 변경) |
| C5 후속 3건 | 비차단(버퍼 해제 테스트·희소 조회 호출 수 실측·요청 단위 공통 RPC 예산) |
| 응답 상한 16MiB | 대규모 힙 실측 선행 |
| 인터페이스 차트 실물 확인 | 포트 다수 장비 환경 필요(개발 자빅스에 0개) |
| 푸시 · `moveseye-docs` 문서 커밋 | 사용자 직접 / 다른 세션 변경과 섞여 보류 |
