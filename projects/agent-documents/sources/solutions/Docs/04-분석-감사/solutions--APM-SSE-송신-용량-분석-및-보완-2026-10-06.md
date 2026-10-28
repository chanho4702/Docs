# APM SSE 송신 용량 분석 및 보완 — 2026-10-06

## 판정

현재 SSE는 연결·프레임·바이트 예산과 느린 클라이언트 종료를 갖추고 있다. 다만 활성 연결 설정 상한 500, 대기 상한 200에 비해 writer 작업 큐가 100으로 고정되어 정상 동시 발행에서도 연결이 종료될 수 있었다. 이번 변경은 이 내부 용량 불일치를 수정한다. **500명 실사용 또는 대규모 시스템의 처리량을 검증한 결과는 아니다.**

## 코드에서 확인한 원인

- `LiveSpanStreamService.tick`과 `snapshotSend`는 서비스 monitor 안에서 여러 연결에 송신 작업을 등록한다. writer도 같은 monitor를 얻어야 실제 `send`를 시작한다. 따라서 등록 단계에서 4개 실행 슬롯과 100개 큐가 차면, 빠른 클라이언트라도 후속 작업이 `RejectedExecutionException`으로 닫힐 수 있다.
- `LiveServletWriter`는 Servlet `WriteListener`와 `isReady`를 이용한다. 소켓이 준비되지 않으면 스레드를 반환하므로 **writer 4개가 동시 연결 4개만 지원한다는 해석은 틀리다.**
- 기존 `writeStarted`는 executor 등록 시각이었다. 실행 대기를 소켓 전송 지연으로 계산했고, 종료된 연결의 작업은 executor 큐에서 즉시 제거되지 않았다.
- 기존 바이트 제한은 연결당 8 MiB, 전체 고유 송신 바이트 96 MiB, 연결 큐 체류 5초다. 프레임/로그/스냅샷 예산과 공유 바이트 참조 계수도 존재한다.

## 반영한 변경

1. writer 작업 큐 크기를 `max-active + max-waiting`에 맞춘다. 설정 검증 상한에서는 최대 700개다. 연결당 대기 송신 작업 하나라는 기존 제한은 유지하고, payload를 연결별로 복사하지 않는다.
2. `writer-threads`를 기본 4, 범위 1~32로 검증한다. 스레드 수를 연결 수에 비례해 자동 증설하지 않는다. 기동 로그에 실제 스레드 수와 작업 큐 크기를 표시한다.
3. 연결 종료 시 executor 큐의 해당 작업을 즉시 제거하여 재연결에 필요한 작업 슬롯을 반환한다.
4. 소켓 write 타임아웃은 실제 `send` 시작부터 계산한다. executor에 대기하는 작업도 기존 연결 큐 체류 상한 5초로 종료된다.
5. executor 거절은 기존 `rejected`와 `writerFailures` 카운터에 포함한다. HTTP/SSE 이벤트·payload·stats 필드 계약은 바꾸지 않는다.

설정 추가: `app.apm.live.spans.stream.writer-threads`, 환경변수 `APM_LIVE_STREAM_WRITER_THREADS`, 기본 `4`. `application.yml`은 상위 작업자가 반영한다. DB 변경은 없다.

## 검증

작성한 회귀:

- 활성/대기 40/10, 120/30, 500/200의 snapshot 및 heartbeat fan-out, 정상 연결 거절 없음, 연결 상한 초과 거절.
- writer가 실제로 막혔을 때 내부 실행 대기 중인 정상 연결을 write 타임아웃으로 오판하지 않고 복구.
- 실행 대기도 5초 큐 기한이 지나면 종료.
- 대기 연결 종료·재연결 150회를 반복해 죽은 작업이 executor 슬롯을 차지하지 않는지 확인.
- `writer-threads` 기본값·범위·빈 값 검증.

실행: JDK 17 지정 후 `./gradlew.bat :test --tests '*overview.live.spans.*' --max-workers=1`.

**결과: BUILD SUCCESSFUL, 15개 테스트 클래스·147개 케이스 통과, 실패/오류/건너뜀 0개.** 컴파일을 포함한 명령 실행 시간은 5분 14초다. 기존 실제 Tomcat 소켓 테스트(`LiveServletWriterTest`, 2개)도 통과했다. 신규 `LiveSpanStreamScaleTest` 6개 케이스는 2.556초였고 최대 500/200 fan-out 케이스는 0.755초였다. 이 시간은 빈 snapshot/heartbeat와 합성 Sink의 테스트 실행 시간이며, 운영 SSE 지연이나 대역폭 측정값으로 해석하지 않는다.

증거는 [SSE 테스트 결과 폴더](../verification/apm-20261006-stream-tests/)에 XML 15개와 `summary.json`으로 보존했다. `git diff --check`도 담당 파일에서 통과했다.

## 남은 대규모 검증

- 500 활성 연결 × 최대 8 MiB/초는 최악 조건의 산술량만 약 4,000 MiB/초다. CPU·NIC·프록시·브라우저 처리량의 보장값이 아니다. 실제 관측량과 프레임 크기 분포, p95 지연, 거절/재연결 빈도, RSS·GC를 같은 시험에서 측정해야 한다.
- 여러 view, 큰 snapshot, 느린 소켓 비율을 바꾼 장시간 네트워크 부하 시험이 남는다. 합성 Sink 회귀는 executor의 동시 fan-out과 수명 관리를 검증하며 운영망 성능 측정은 하지 않는다.
- 서비스 전체를 잠그는 tick 직렬화와 단일 BE의 메모리 상태는 이번 범위에서 유지한다. 다중 노드 라우팅·상태 공유·노드 교체 보장은 별도 과제다.
- API 계약과 기본 활성 40/대기 10은 유지한다. 기본값을 500/200으로 올리지 않는다.

## RUM 스니펫 독립 검수

상위 작업자의 요청으로 `src/main/resources/apm/rum-snippet.js`와 `src/test/resources/apm/rum-snippet.test.mjs`를 읽기 전용으로 교차 검수했다. 검수자는 해당 변경을 작성하거나 수정하지 않았고, Node/브라우저 테스트 실행은 상위 작업자가 담당했다.

차단할 결함은 발견하지 못했다. 다음을 코드와 테스트에서 확인했다.

- 429/502/503/504와 네트워크 오류만 재시도한다. 200(partialSuccess 포함), 인증·본문 오류와 500은 재전송하지 않는다.
- `Retry-After`의 초/HTTP 날짜를 해석하고 지수 대기 시간과 큰 쪽을 적용한다. 60초 유효기간을 넘기는 재시도는 폐기하며 동일 `body`와 원래 timestamp/id를 유지한다. Controller의 `Access-Control-Expose-Headers: Retry-After`도 확인했다.
- `consentGranted`를 송신 직전·응답 후·예약 재시도 때 검사한다. 종료 함수는 전송을 abort하고 대기열·타이머·이벤트 리스너를 정리한다. 동의 철회 즉시 정리는 문서화된 종료 함수를 호출하는 계약이며, 동의 콜백 값만 변경하면 다음 검사 시점에 정리된다.
- `pagehide`는 지연 재시도를 폐기하고 진행 중/최종 관측은 keepalive 한 번만 허용한다. `pageshow` 뒤 새 관측은 정상 재시도하며, 숨겨지기 전 관측의 `noRetry`는 유지한다.
- 보류 관측은 전송 중 요청까지 포함해 최대 20개·UTF-8 본문 합계 32 KiB다. `Set.delete`가 성공할 때만 바이트 예산을 반환하여 중복 반환을 막는다. 1회 5초 timeout, 최대 3회 시도·60초 수명으로 자원을 제한한다.
- 테스트는 제품 스니펫 원문을 VM에서 실행하며 외부 SDK만 대역을 사용한다. 각 제한과 복구 결과를 실제 요청 수·본문 동일성·AbortSignal·타이머로 검증하므로 구현 상수를 그대로 읽어 통과시키는 형태가 아니다.

브라우저 검증 증거는 상위 작업자가 생성한 `../verification/apm-20261006-rum-browser.json`을 확인했다. 외부 SDK 대역을 사용한 HTTP/브라우저 검증이며 실제 OTel SDK 번들 호환성과 운영 RUM 서버의 종단 수집 보증으로 확대하지 않는다.
