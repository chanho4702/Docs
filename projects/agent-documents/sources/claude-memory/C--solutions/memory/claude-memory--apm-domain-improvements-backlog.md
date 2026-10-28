---
name: apm-domain-improvements-backlog
description: premium/apm 전체 개선 백로그 + RUM·수집기로그 데드락 형제 수정(커밋 5b6d5a0). 남은 알람/조회/예산 항목
metadata:
  node_type: memory
  type: project
  originSessionId: ea811f3c-87a7-4010-a646-be820d5c725a
  modified: 2026-10-01T00:27:50.326Z
---

2026-09-29~30. [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--apm-metric1m-deadlock-fix|apm-metric1m-deadlock-fix]] 후속으로 premium/apm 도메인 **전체를 3분할 병렬 서브에이전트로 리뷰**(적재·배치 동시성 / 조회·읽기 성능 / 트레이스·알람·RUM). 정본 백로그 `_workspace/features/apm/deadlock-fixes/backlog_apm-improvements-2026-09-29.md`(코덱스 gpt-5.6-sol high 검수 반영본).

**✅ A1·A2 데드락 형제 커밋 `5b6d5a0`**(#ZM-122 master, 미푸시):
- **A1 RumStore.store()** 재작성 — 관측별 6테이블 훑기를 **phase 분리**(영수증→세션→페이지→타이밍→에러→스팬) + **테이블별 PK 전순서 정렬**로. receipt gating 보존(winners만), 세션 결과 IdentityHashMap 매핑, **error group type/sample_stack은 OBS_ORDER 첫 발생으로 고정**(정렬이 최초 INSERT를 바꾸지 않게), span 정렬에 start_ts 포함.
- **A2 ApmCollectorLogStore** — 자연키 `(instance,pipeline,component)` 정렬.
- 검증: 단위 `RumStoreTest`6+`ApmCollectorLogStoreTest`1, IT `RumSchemaIT`9(반대순서 동시 720건 무-데드락+정합). 코덱스 조건부승인 3건(span start_ts·error 샘플 보존·결정적 검증) 전부 반영.

🔴 **핵심 교훈**:
- RUM 적재 실패는 **무음 데이터 손실** — 전송이 `sendBeacon` 아니라 `fetch(keepalive:true)`인데 `response.ok`를 안 봐 503도 삼킴(코덱스 정정).
- `apm_rum_js_error_group`은 ON CONFLICT에서 type/sample_stack 갱신 안 함 → **최초 INSERT가 확정**. 잠금 순서 정렬이 "최초"를 바꾸므로 샘플을 관측순서로 미리 고정해야 원래 동작 보존.
- OTLP 자기텔레메트리 저장 조건 = resource `service.name`이 `otelcol`/`otelcol-` 접두 → service_id=0.
- 코덱스 CLI: `windows.sandbox=unelevated` 필수(아니면 helper_unknown_error), 검수 전문은 `tee`로 캡처(tail만/메모리 kill로 두 번 놓침), C:/solutions는 git 아님→레포 안에서 실행.

**✅ RUM 예산 환급 완료(2026-09-30, 커밋 `85d9e9d` #ZM-122)**: RumRateLimiter.refund()+컨트롤러 catch(Exception)에서 서버잘못(503)만 환급+RUM_UNAVAILABLE drop stat. 🔴명시 설계("적재503 환급안함")를 서버잘못 한정으로 뒤집음(주석 갱신). 테스트 RumSecurityTest·ApmRumIngestMvcTest.

**🔴 알람 방향 결정(2026-09-30, 사용자)**: APM 알람을 자빅스에서 **분리**한다 — APM 자체 창구(우리 메일서버 등)로도 보내고 자빅스로도 보내되 **알림 페이지는 안 섞음**. 독자 알림 채널 구축은 **사용자가 나중에 따로 지시**. 그래서 **B1/B2/B3(알람 걸림 재설계)는 그 독자 알림 작업과 한 덩어리로 미룸**(지금 자빅스 브리지 고쳐봐야 갈아엎힘). 참고: APM 알람 판정·기록·조회(apm_alert_event, /apm/alert-events, /apm/stuck-requests)는 이미 무브스아이 자체(자빅스는 통지 발송만).

**✅ 추가 완료(2026-09-30)**: D1 bounds family+시드 검증 `92e6857` · C3 stuck 조회 N+1(findAllById) `c1d14fb`.

**이번 세션 커밋 8건(전부 #ZM-122 master 미푸시)**: `ad57ea5`(1m 데드락)·`5b6d5a0`(RUM·수집기로그 데드락)·`85d9e9d`(RUM 예산환급)·`92e6857`(RUM bounds family)·`c1d14fb`(stuck N+1)·`79becc0`(C1 liveInstances 배치)·`d2b42c8`(검수 반영 테스트+주석).

**✅ 코덱스 검수 완료(2026-10-01)**: 4개 커밋(RUM 예산환급·bounds family·stuck N+1·C1) **조건부 승인·🔴 0**(핵심 로직 정확), 보강(테스트+주석) `d2b42c8` 반영. 🔴데드락 형제(`5b6d5a0`)도 조건부승인 3건 반영 완료. 🔴**코덱스는 포그라운드로 실행**(백그라운드는 시스템 메모리 부족으로 3회 kill됨 — 유휴 시 BG 셸 회수).

**남은 백로그(미착수)**: **C2** hostlink ILIKE 풀스캔만 남음 — 자산 서비스(asset 도메인)에 배치 정확일치(`lower(name) in (...)`) 메서드 추가 필요, **APM 밖 교차**라 별도. (B1/B2/B3는 독자 알림 지시 대기 — APM 알람을 자빅스에서 분리하는 큰 작업의 일부.) 안전확인(문제없음): 롤업/보존(scheduler_lease 단일직렬)·ApmTraceWriter(advisory lock)·조회 인젝션/권한/시간대.

**2026-10-26 C2 구현·master 병합(BE 2058a3d)**: 워크트리 `C:\worktrees\apm-c2-be`(브랜치 `apm-c2-hostlink`). `AssetService.findZabbixHostIdsByExactHostNames`(기술명·표시명·자산명 정확일치, 500개 묶음, 각 이름은 자기 묶음 결과로만) + 링커가 캐시 미스만 모아 조회·묶음별 실패 흡수·캐시 상한. 🔴정규화는 SQL·자바 같은 좁은 규칙(ASCII 공백류 trim + A-Z만 소문자) — DB lower()/btrim과 자바 trim/toLowerCase가 갈린다. 동작 변화: 기술명 정확일치·표시명만 일치도 이제 링크됨. 코덱스 1차 반려(묶음 간 우선순위·정규화) → 2차 승인. 🟡 rollback-only(외부 트랜잭션 참여) 위험은 기존 getList와 같아 후속.
