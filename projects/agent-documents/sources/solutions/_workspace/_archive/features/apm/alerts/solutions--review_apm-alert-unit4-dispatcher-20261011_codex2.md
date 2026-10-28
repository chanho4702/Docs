## 판정

**반려**

1차 반려의 활성화·폐기 직렬화는 반영됐지만, `force=false` 폐기가 해소 통지를 유실할 수 있는 경계가 남아 있습니다.

## 🔴 필수

1. **리스 만료 `PROCESSING`은 “전송되지 않음”이 아니라 “전송 결과 불명”입니다.**

   가능한 순서:

   1. FIRED가 외부 채널에 전달됨
   2. `SENT` 기록 전 노드 중단·GC pause
   3. 리스 만료
   4. 채널 일시정지 후 일반 `discard(force=false)`
   5. FIRED가 DB에서 `SENT`가 아니므로 FIRED·RESOLVED 모두 `SKIPPED`
   6. 외부 채널에는 열린 알람만 영구 잔존

   현재 일반 폐기는 리스 만료 `PROCESSING`을 폐기 대상으로 삼고, RESOLVED 보존 여부는 형제 FIRED의 `status='SENT'`만 봅니다. 이는 “외부 열린 알람 위험은 `force=true`에서만 발생”한다는 계약과 어긋나며 해소 통지 유실입니다. [AlertChannelActivation.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/AlertChannelActivation.java:222), [계약서](/C:/solutions/_workspace/features/apm/alerts/contract_apm-alert-channels.md:52)

   또한 `claim`만 공유 advisory lock을 사용하고 `markSent/markRetry/markDead`는 사용하지 않습니다. 따라서 늦은 결과 기록과 폐기 UPDATE가 겹쳐 FIRED만 `SENT`, RESOLVED는 `SKIPPED`가 되는 행별 분리도 가능합니다. [ApmAlertNotificationStore.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/ApmAlertNotificationStore.java:116), [ApmAlertNotificationStore.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/ApmAlertNotificationStore.java:191)

   조치가 필요합니다.

   - 결과 기록 트랜잭션도 같은 공유 advisory lock으로 폐기와 직렬화
   - `force=false`에서는 전송 여부가 불명확한 FIRED를 안전하게 처리할 정책 추가: 거부하거나 FIRED·RESOLVED 쌍을 보존
   - `외부 전달 → SENT 기록 전 정지 → 리스 만료 → deactivate → discard(false)` IT 추가
   - 늦은 `markSent`와 `discard` 양방향 순서 IT 추가

   현재 테스트는 리스가 유효한 전송만 `BUSY`로 고정하며 이 만료 경계는 다루지 않습니다. [ApmAlertNotificationDispatchIT.java](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertNotificationDispatchIT.java:448)

## 🟡 권장

- **DB 시각 전환이 완전하지 않습니다.** 리스·백오프는 `localtimestamp`로 바뀌었지만 `activated_at`, `updated_at`, 폐기 진단 시각은 여전히 `LocalDateTime.now()`입니다. 운영 판정에는 아직 쓰이지 않아 필수는 아니지만, 요청서의 “시각 전부 DB 정본” 주장과 구현이 다릅니다. [AlertChannelActivation.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/AlertChannelActivation.java:133)

- **reconcile 재개 자체는 멱등 조건으로 동작하지만 도중 pause 테스트가 없습니다.** 현재 테스트는 시간 상한 후 재호출만 고정합니다. 첫 페이지 직후 `deactivate`하여 `complete=false`로 종료하는 경우와 페이지 크기 정확히 N배인 경계를 추가하십시오. 페이지 사이 즉시 배타 잠금을 재획득하므로 다중 노드 claim이나 pause가 기아될 가능성도 있습니다. [AlertChannelActivation.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/AlertChannelActivation.java:269), [ApmAlertNotificationDispatchIT.java](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertNotificationDispatchIT.java:637)

- **라이선스 만료 중에는 안전 명령을 허용하는 편이 맞습니다.** 최소 `GET status`, `deactivate`, 그리고 필수 결함 수정 후 `discard`는 허용하고, `activate/reconcile/retry*`는 계속 차단하는 분리가 적절합니다. 지금처럼 전송 잡은 계속 돌면서 관리 API가 모두 차단되면 만료 고객이 외부 통지를 멈출 수 없습니다.

- 라이선스 오류 계약도 실제 인터셉터 순서를 반영해야 합니다. READ_ONLY의 POST는 `AccessModeInterceptor`가 먼저 `LICENSE_READ_ONLY`로 막지만, 계약과 MVC 테스트는 `FeatureInterceptor`의 `LICENSE_FEATURE_REQUIRED`만 기술·검증합니다. [계약서](/C:/solutions/_workspace/features/apm/alerts/contract_apm-alert-channels.md:13), [AccessModeInterceptor.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/license/web/interceptor/AccessModeInterceptor.java:52), [ApmAlertChannelMvcTest.java](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/ApmAlertChannelMvcTest.java:181)

- timeout·기동 검증은 들어갔지만, interrupt를 무시하는 채널이 누적되면 `newCachedThreadPool`이 무제한으로 증가할 수 있습니다. 실제 채널 도입 전 bounded executor나 잔존 작업 지표를 두는 편이 안전합니다. [ApmAlertNotificationDispatcher.java](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/notify/ApmAlertNotificationDispatcher.java:108)

## 이관 목록

- **단위 4 내 해결:** 리스 만료/늦은 결과 기록과 `discard(false)`의 원자성 및 회귀 IT
- **단위 6:** reconcile 페이지 간 claim·pause 공정성, 필요 시 명시적 continuation cursor와 statement timeout
- **단위 8:** 확정된 라이선스 오류 매트릭스, `complete=false`, `warning`, `keptResolved/openLeftExternally` UI 처리

## 🟢 참고

- 기존 테스트 산출물은 2026-10-11 14:23 기준 **2,564건, 실패 0건**입니다. 대상 결과는 Dispatch IT 28건, MVC 6건, Store 3건, LicenseArchitecture 8건이 모두 통과했습니다. [테스트 보고서](/C:/worktrees/apm-c05-followup/build/reports/tests/test/index.html:23)
- 파일 수정 금지 조건 때문에 테스트를 재실행하지 않고 기존 XML·HTML 결과만 확인했습니다.
- `git diff --check` 오류는 없고 LF→CRLF 경고 1건만 있습니다.
- 현재 등록 채널이 0개이고 이 브랜치를 단독 배포하지 않는다는 점은 즉시 운영 노출을 낮추지만, 실제 채널이 결합되면 필수 결함이 활성화되므로 판정에는 반영하지 않았습니다.
