# 검수 요청 — 알람 재설계 단위 4: 통지 디스패처 (2026-10-11)

- 워크트리 `C:\worktrees\apm-c05-followup`, 브랜치 `apm-alert-history`(단위 2·3 `d989497` 위), 미커밋. diff `scratchpad/alert-unit4.diff`.
- 범위: 단위 2·3 코덱스 "단위 4 이관 목록" 전부 + 🟡 4건(활성화 선잠금 경합 IT·@DynamicUpdate IT·attempts CHECK·대량 해소 배열 파라미터).

## 요지
- `ApmAlertNotificationDispatcher`(기본 10초, 등록 채널 0개면 DB 미접근): claim 짧은 트랜잭션(정리 → `FOR UPDATE SKIP LOCKED` PENDING 도래 + 리스 만료 PROCESSING → PROCESSING·token·lease, **attempts는 claim 때 +1** — 전송 중 노드 사망도 1회로) → 트랜잭션 밖 전송(리스 지났으면 전송 생략) → token CAS 기록(SENT / RETRY 백오프 min(60분,2^n분), 최대 10회 초과 DEAD / FAILED→DEAD / 예외=RETRY / CAS 0행=LOST).
- 순서: FIRED가 SENT 전이면 RESOLVED 미claim, FIRED DEAD·SKIPPED → RESOLVED SKIPPED(같은 트랜잭션 + 다음 claim 정리).
- 일시정지: 등록 빈 + enabled 채널만 claim, 나머지 PENDING 유지.
- 관리 명령 `ApmAlertNotificationAdmin` + REST(`apm.edit`): 채널 목록/activate/deactivate/reconcile/discard/retry-dead, 통지 1건 retry(짝 함께 되살려 순서 보장). 오류 코드 5종.
- V78 부분 인덱스 2(리스 만료 PROCESSING, PENDING created_at).
- 지표: Micrometer 없음 → 구조화 로그(주기별 claim/sent/retry/dead/lost/skippedResolved/oldestPendingAge, 30분 초과 경고), 활성화·재조정 scanned·lockAttempts·elapsedMs.

## 검증
- 신규 24(Dispatch IT 19 — SENT·RETRY 백오프·DEAD·FAILED·2-worker 동시 claim 중복 0·리스 만료 재claim·SENT 기록 전 crash 재전송·순서·pause·discard·retry 순서·reconcile, MvcTest 3, StoreTest 2). 뮤테이션 6종 → 대응 7건 실패 확인.
- `premium.apm.*`+LicenseArchitectureTest 2,551 중 1 실패 `ApmTraceReclassificationIT`(트레이스 롤업 파티션 LOCK NOWAIT 55P03, 단독 재실행 15/15 — 간헐).

## 의견 요청
1. attempts를 claim 때 세는 결정.
2. 라이선스 게이트 없음(만료 설치본에서도 쌓인 통지 전송) — 평가 잡처럼 막아야 하나.
3. 일시정지 직후 한 묶음 추가 전송 가능(스냅샷 판정) — 허용 가능한가.
4. reconcile 무제한 이력 스캔이 전이를 붙잡는 시간 — 단위 6 전까지 허용?
5. REST 7개 계약서 반영 시점(단위 8 FE와 함께?).

## 6. 코덱스 1차 **반려**(`_codex.md`) → 반영 (2026-10-11)
- 🔴1 discard 원자성: `AlertChannelActivation.discard(key, force)` — 활성화·일시정지·재조정과 같은 배타 advisory lock, REQUIRES_NEW 한 트랜잭션에서 enabled=false 재확인 후 폐기. 디스패처 claim 트랜잭션이 같은 키를 공유로 잡음(폐기 커밋 후 새 PROCESSING 불가, 진행 중 claim은 폐기가 대기). IT 2(activate 선행→discard STATE_INVALID·PENDING 보존 / discard 선행→activate 대기 후 켜짐).
- 🔴2 전송 중 discard: 유효 리스 PROCESSING 있으면 `APM_ALERT_CHANNEL_BUSY`, FIRED SENT 쌍의 RESOLVED는 제외(`keptResolved`), `force=true`일 때만 버림(`openLeftExternally`·warning·WARN 로그). IT 2.
- 🟡 reconcile 페이지(커서·페이지마다 잠금, page-size 500·max 300초, `complete=false` 이어하기), 리스·시각 전부 DB `localtimestamp`, `AlertChannel.timeout()`(기본 10초) + `batch×timeout ≥ lease`면 **기동 실패**·초과 시 interrupt→RETRY, 없는 채널 오류 통일(빈만 사라진 키는 관리 명령 허용), REST 7경로 성공·오류 5종·권한·FeatureInterceptor 고정, 상태 응답 `{channels, dispatcher}`(누적 claimed/sent/retried/dead/lost/leaseExpired/timedOut), stale 경고 due lag 기준.
- 라이선스 만료 중 관리 명령 허용: **미적용**(A5 허용 목록 정책 변경 필요 — 사용자 결정 대기).
- 계약서 신규 `_workspace/features/apm/alerts/contract_apm-alert-channels.md`.
- 검증: 대상 59 통과, 뮤테이션 3 → 대응 IT 실패 확인. `premium.apm.alert.*` 322, `premium.apm.*`+LicenseArchitectureTest **2,564 전부 통과**. diff `scratchpad/alert-unit4-r2.diff`.

## 7. 코덱스 2차 **반려**(`_codex2.md`) → 반영 (2026-10-11)
- 🔴 리스 만료 PROCESSING = 결과 불명: `force=false` 폐기는 리스 만료 PROCESSING을 **보존**(`keptUncertain` — BUSY 거부 대신: 일시정지 채널은 재claim이 없어 BUSY면 영구 차단), FIRED가 SENT·PROCESSING인 RESOLVED는 PENDING 보존(`keptResolved`), 유효 리스는 BUSY, force만 SKIPPED+`openLeftExternally`+경고. `markSent/Retry/Dead`도 같은 advisory 공유 잠금 → 폐기(배타)와 직렬화. IT 5(외부 전달→기록 전 정지→리스 만료→pause→discard(false) 보존·재활성 후 FIRED·FIRED·RESOLVED, 늦은 markSent 양방향, pg_locks 대기, force 후 CAS 차단). 뮤테이션 2 → 3건 실패.
- 🟡 DB 시각 통일(activated_at·updated_at·폐기 진단), reconcile 공정성(일시정지 2단계: enabled=false 즉시 커밋 → 배타 잠금 한 번 잡았다 놓기 / 대기 공유 잠금이 큐에서 우선 — sleep 없음, 근거 주석) + 테스트(첫 페이지 후 pause complete=false, N배 경계), **라이선스 만료 중 안전 명령**(status·deactivate·discard `@LicenseExempt` + 컨트롤러가 features에 APM 보유 확인, **ArchUnit A5 허용 목록 변경 — 정책**, A5-d 테스트, 실제 인터셉터 순서 매트릭스 MVC), 전송 풀 고정 크기(delivery-threads 4·큐 1, 고갈 시 RETRY, rejected·stuckDeliveries 지표, IT), 계약서 갱신.
- 검증: 격리 PG 5434 alert 333, `premium.apm.*`+LicenseArchitectureTest **2,576 전부 통과**. diff `scratchpad/alert-unit4-r3.diff`.

## 8. 코덱스 3차 **반려**(`_codex3.md`) → 반영 (2026-10-11)
- 🔴 마지막 시도 결과 불명: 상태 추가 대신 V78 열 2개 — `delivery_uncertain`(리스 만료·timeout 시 켜지고 유지), `dead_reason`(FAILED|EXHAUSTED, DEAD일 때만 CHECK). **결과 불명 FIRED는 DEAD여도 RESOLVED를 SKIPPED로 만들지 않고 전송**(수신 측 FIRED 부재 가능 → 멱등 키 처리, 계약 명시). 폐기 시 불명 행 보존. IT 4(maxAttempts=1: crash 후 리스 만료 / interrupt 무시 timeout 후 늦은 성공 / pause→discard→재활성 / V78 CHECK). 뮤테이션(claim 조건 원복) → 3건 실패.
- 🟡 상태 API `uncertain`·`oldestUncertainAgeSeconds`(processing은 살아 있는 리스만), `READ_ONLY + APM 미보유` 매트릭스 행·MVC, 문서 "1칸 대기열".
- 검증: alert 338, `premium.apm.*`+LicenseArchitectureTest **2,581 전부 통과**. diff `scratchpad/alert-unit4-r4.diff`.

## 9. 코덱스 4차 **반려**(`_codex4.md`) → 반영 (2026-10-11)
- 🔴1 늦은 FIRED: (a) `AlertNotification.stateVersion`(FIRED=1, RESOLVED=2)+firedAt/resolvedAt, 수신 측 "이벤트별 더 큰 stateVersion만 적용" 채널 의무(SPI·계약). (b) 포기한 호출(timeout·interrupt)이 나중에 성공한 FIRED면 같은 (event,channel) RESOLVED 재전송 — SENT면 PENDING 복귀, PROCESSING이면 V78 `resend_requested`로 결과 기록 시 PENDING. crash 시 추적 소실은 (a)가 막음(주석).
- 🔴2 디스패처 interrupt: 호출 시작 후 interrupt면 `delivery_uncertain=true`, 시작 전이면 아님. 묶음 나머지 claim은 `release`(시도 수 원복), interrupt 플래그 복원. 지표 `lateFired`.
- IT 4(가짜 수신 측 최종 상태 기준): 단순 수신기 재열림→재전송 해소 / stateVersion 수신기 늦은 FIRED 무시 / 전송 중 interrupt → 결과 불명 DEAD + RESOLVED 전송 / 보내는 중 보정. 뮤테이션 → 3 실패.
- 검증: alert 342, `premium.apm.*`+LicenseArchitectureTest **2,585 전부 통과**. diff `scratchpad/alert-unit4-r5.diff`.
