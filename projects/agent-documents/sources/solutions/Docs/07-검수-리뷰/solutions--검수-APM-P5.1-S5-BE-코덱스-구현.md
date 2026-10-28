P5.1 5단계 구현을 이어서 완료했습니다. **지정 테스트 391건 통과**, 실패·오류·스킵 0건입니다. 전체 `:test`는 지시대로 실행하지 않았습니다.

**변경 파일: 22개 — 프로덕션 14개, 테스트 8개**

아래 SSE 파일은 [overview/live/spans](C:/solutions/moveseye-be-spring-p5/src/main/java/com/dmove/moveseye/premium/apm/overview/live/spans)에 있습니다.

| 구현 항목 | 변경 파일 |
|---|---|
| EP·필터·권한 거절 | `ApmLiveSpansStreamController.java`, `LiveSpanStreamView.java`, `LiveStreamRejectionAdvice.java` |
| tick 발행·재생·admission | `LiveSpanStreamService.java`, `LiveSpanRing.java` |
| snapshot 계획·chunk·CRC32 | `LiveSpanSnapshot.java` |
| multipart·직렬화·독립 바이트 예산 | `LiveSpanFrames.java`, `LiveSpanStreamCodec.java`, `LiveStreamBytes.java`, `LiveStreamLimits.java` |
| 비동기 writer·종료·deadline | `LiveServletWriter.java`, `LiveStreamSink.java` |
| 인증 필터의 경로별 거절 확장 | [ApiAccessDeniedHandler.java](C:/solutions/moveseye-be-spring-p5/src/main/java/com/dmove/moveseye/auth/security/ApiAccessDeniedHandler.java), `ApiAccessDeniedResponse.java` |

테스트 파일은 `ApmLiveSpansStreamControllerTest`, `LiveServletWriterTest`, `LiveSpanFramesTest`, `LiveSpanStreamBudgetTest`, `LiveSpanStreamServiceTest`, `LiveStreamBytesTest`, `LiveSpanStreamTestSupport`, `LiveIngestSecurityChainTest`입니다.

**항목별 구현**

- 300/900초 snapshot, 서비스·env 필터, tick 경계의 구독 등록과 불변 증분 발행을 구현했습니다.
- `seq`·`sinceSeq`·`viewKey`, 독립 revision, 버킷 종료+5초의 `provisionalUntil`, `removeServices`를 전달합니다.
- snapshot은 begin→dict→buckets→end 순서이며 chunk 수와 CRC32를 검증할 수 있습니다.
- frame/part·연결 큐·재생 로그·고유 바이트·snapshot 버퍼 예산을 각각 검사하고 참조를 반환합니다.
- 활성 40·대기 10·snapshot 동시 2·사용자당 4 제한과 `paused`, `degraded`, `reject`, `epochChanged`를 구현했습니다.
- Servlet `WriteListener`와 별도 writer 풀을 사용합니다. 실제 수신 정지 소켓 4개에서도 worker 반환과 정상 연결 송신을 검증했습니다.
- env 변경으로 필터에서 빠진 서비스는 제거하고, 새로 들어온 서비스는 snapshot으로 과거 버킷까지 복원합니다.

**정본과의 차이·해석**

- 지정 설계 파일은 현재 **v4.3**입니다. 요청된 §7.1의 5단계 행을 구현 범위로 적용했습니다.
- `visitorId` 누락·불일치는 기존 `VisitorSessionChecker`의 **실제 HTTP 401**을 유지했습니다. 정본 표의 403 표기와 다르며, 권한·라이선스 403은 종료용 `control`로 변환합니다.
- `Last-Event-ID`는 multipart 중간에도 갱신되므로 해당 seq 전체를 재전송하도록 한 단계 되감습니다. 명시적 `sinceSeq`는 그대로 사용합니다.
- snapshot 솎음 비율은 보수적으로 산정하며, 실제 직렬화 바이트에도 전송 상한을 적용합니다.
- snapshot 버퍼는 정본의 별도 64 MiB 예산이며, 동시 2개·각 최대 4개 버퍼 제한도 적용합니다.

**검증**

- `compileJava`, `compileTestJava`: 통과
- 지정 두 패키지: **32개 클래스, 391건 통과**
- HEAD 대비 신규 테스트: **59건**
- 전체 회귀: **미실행 — Claude 검수 단계**
- P1.5 컨트롤러와 `enabled=false` 기본값 유지

**후속 연결 지점·검수 위험**

- 6단계의 Collector YAML·설치 가이드·`ApmCollectorMetricStore` 확장은 미구현입니다. 스트림 카운터는 `counters()`로 제공합니다.
- `live`·`patterns`는 현재 빈 맵입니다. 런타임 지표 공급과 패턴 계산은 후속 연결 대상입니다.
- 브라우저의 재시도 5회 중단은 P5.2에서 연결해야 합니다.
- 전체 회귀, 실제 프록시 경유 지연, 40개 연결의 부하·힙 검증은 남아 있습니다. 일부 예산 회귀는 메모리 절약을 위해 축소한 한계값으로 검증했습니다.
