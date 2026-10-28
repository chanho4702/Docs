# 백엔드 콘솔 로그 없이 Sentry로 오류 관측하기

검토일: 2026-09-22. 검토 후 사용자 요청에 따라 삭제 오류의 실제 Sentry 전송을 구현했다. 외부 Sentry 프로젝트 설정은 변경하지 않았다.

## 결론

프론트가 호출한 resolver의 오류는 백엔드에서 안전한 진단 DTO로 반환하고 프론트에서 Sentry에 명시적으로 전송할 수 있다. 서버 console 출력은 필요하지 않다. 다만 브라우저가 없는 큐·스케줄러, 응답 전에 종료된 실행, 사용자가 닫은 화면은 이 경로만으로 완전하게 관측할 수 없다.

## 현재 코드에서 확인한 누락과 위험

| 위치 | 현재 동작 | 영향 |
| --- | --- | --- |
| `static/ui/src/index.js` | `consoleLoggingIntegration({levels:['error']})`, `enableLogs:true` | console.error를 Sentry Logs로 보낸다. 모든 업무 실패를 자동으로 Sentry Issue로 만드는 설정은 아니다. |
| `src/utils/ResponseWrapper.js` | 예외를 `{success:false,error}`로 반환 | invoke Promise는 resolve된다. 프론트가 실패를 처리하고 끝내면 자동 미처리 예외 수집 대상이 아니다. |
| `ProjectDeletionService.js` | 업무 진행 응답에 `status:FAILED/BLOCKED_JIRA_ACCESS/COMPLETED_WITH_WARNINGS` | 성공 envelope 안의 실패라 success:false만 검사하는 공통 수집기로도 놓친다. |
| `ToastFlags.js` | 오류 알림 표시 후 2.5초 자동 제거 | Sentry 전송 없음. 사용자 알림과 개발자 관측은 별도 경로다. |
| `static/ui/src/index.js` | `sendDefaultPii:true`, beforeSend/beforeSendLog 없음 | 모든 원본 Error/cause/응답을 보내는 방식은 부적합하다. 기본 PII, breadcrumb, URL 등도 별도 검토 필요. |
| `src/utils/ResponseWrapper.js`, `SqlError.js`, Jira API helper | message/cause에 원본 오류가 포함될 수 있음 | 전체 응답을 Sentry extra로 직렬화하면 SQL·JQL·이슈·사용자 정보가 포함될 수 있다. |
| `RequestJiaJson.js`, `AppFieldValueApi.js`, `IssuePropertyApi.js` | 기존 backend console.error 존재 | 현재 저장소는 완전한 무로그 상태가 아니다. 대체 관측 경로를 만든 뒤 제거 대상을 정해야 한다. |

## 적용 권고

1. 공용 프론트 수집 함수 `reportOperationFailure`를 둔다. 서버 실패 envelope, bridge reject, 삭제 작업 실패 상태 세 종류를 정규화한다. 사용자 메시지용 토스트 함수에 전송 책임을 넣지 않는다.
2. 전송 필드는 allowlist로 제한한다: resolver, 정형 code, stage, error category, retryable, HTTP status, app release/environment, 불투명한 operation/request ID. payload, raw message/cause/stack, SQL, JQL, 계정 ID, 프로젝트명, 이슈 내용은 기본적으로 제외한다.
3. 예측하지 못한 실패는 `captureException(new Error(고정된 오류명), context)`로 Sentry Issue에 보낸다. 이 stack은 프론트 수집 위치이며 백엔드 stack으로 오해하면 안 된다. 서버 단계·code를 별도 tags로 넣는다.
4. 권한 거부·입력 검증·사용자 취소는 기본 알림 제외, 429/네트워크 일시 장애는 최종 실패 또는 제한된 빈도로, SQL 장애·예기치 못한 5xx는 즉시 수집한다.
5. 중복키는 operation ID + resolver + stage + code + attempt를 사용하고 크기 제한 있는 TTL 캐시로 폴링 중복을 억제한다. Sentry fingerprint는 resolver + stage + code로 묶고 사용자별 ID는 넣지 않는다. fingerprint 그룹화만으로 전송량이 줄어들지는 않는다.
6. `beforeSend`는 error event, `beforeSendLog`는 Logs의 최종 필터다. 각각 별도 적용하고 `sendDefaultPii:false`, breadcrumb/URL/extra 정제, 반복량 상한을 검토한다. 명시적 capture와 console.error를 같은 실패에 함께 호출하지 않는다.
7. 프론트에서 받은 Sentry eventId 또는 앱 진단 ID를 사용자 오류 상세에 표시하면 고객 문의와 운영 오류를 연결할 수 있다. 서버 오류 응답에 requestId를 추가하는 경우 기존 소비자 계약을 유지한다.
8. 삭제 화면부터 적용 후 공용 invoke 래퍼로 단계적으로 확장한다. TanStack Query 전역 onError만으로는 처리된 success:false 응답이나 success:true 업무 실패를 포착할 수 없다.

## 프론트만으로 커버할 수 없는 범위

- 화면 종료·오프라인·SDK 초기화 실패·전송 차단·Sentry rate limit은 전송 누락 가능성이 있다.
- 서버가 응답 전에 종료되면 브라우저는 transport 실패만 알며 정확한 서버 단계나 stack을 복원하지 못한다.
- 큐·스케줄러는 기존 job/status 저장소에 정형 실패를 보존하고 관리자 화면이 조회하여 전송할 수 있다. 이것은 저장소 비용과 지연이 있으며 무비용 실시간 관측이 아니다. 즉시 알림이 필요하면 별도 백엔드 전송 경로와 egress/재시도 비용을 검토해야 한다.
- SDK 설정·수집 제어는 저장소에서 구현할 수 있다. 실제 Sentry 프로젝트의 alert rule, quota, retention, release/source-map 설정은 해당 계정 권한과 현재 설정 확인이 필요하다. 이번에는 계정에 접속하지 않았다.

## 실제 적용 범위

프로젝트 삭제는 안전한 code/stage 반환, 최초 실패의 화면 유지, 오류 원인 번역, 재시도 조건 처리를 구현했다. 이어서 `static/ui/src/utils/reportDeletionFailure.js`를 목록·칸반의 응답/transport 오류 지점에 연결했다.

- `captureMessage`로 고정 메시지의 Sentry Issue event를 전송한다. tags는 source/resolver/code/stage/status/attempt이며 fingerprint는 source/stage/code다.
- 동일 프로젝트·시도·상태·단계·code는 60초 중복 억제한다. 브라우저 한 인스턴스의 60초 구간에 최대 20개만 전송한다. 프로젝트 ID는 이 로컬 중복키에만 사용한다.
- 권한 거부·대상 없음은 기본 제외, 접근 차단·캐시 경고·401/403/429는 warning, 기타 FAILED는 error다.
- `beforeSend`는 이 reporter event를 allowlist로 다시 구성하여 SDK가 자동 첨부한 user/request/breadcrumb/contexts/extra/exception도 제거한다. 다른 event는 기존 처리를 유지한다. `sendDefaultPii`는 false로 변경했다.
- 수집 함수에서 Sentry가 예외를 던져도 화면 상태 처리와 재시도를 중단하지 않는다. 추가 backend console 호출은 없다.
- reporter 5개 테스트와 실제 React Query 삭제 훅 연결/모달/continuation 테스트를 합쳐 3 suites 19개 통과했다. 최종 전체 테스트와 CI build는 별도 로그에 기록한다.

앱 전체 invoke 자동 수집 전환, 기존 backend 로그 일괄 제거, 백그라운드 작업 수집, Sentry 프로젝트 alert 설정은 아직 적용하지 않았다. 실제 Sentry 계정의 수신 이벤트 확인은 수행하지 않았으며 이번 검증은 SDK mock 기반이다.

## 근거

- [Sentry React Usage](https://docs.sentry.io/platforms/javascript/guides/react/usage/)
- [Sentry React Logs](https://docs.sentry.io/platforms/javascript/guides/react/logs/): console integration은 Logs 수집이며 beforeSendLog로 필터링한다.
- [Sentry Filtering](https://docs.sentry.io/platforms/javascript/guides/react/configuration/filtering/)
- [Forge usage metrics](https://developer.atlassian.com/platform/forge/monitor-usage-metrics/): console.log 및 유사 메서드의 메시지·메타데이터가 log write 용량에 포함된다.
- [Forge pricing](https://developer.atlassian.com/platform/forge/forge-platform-pricing/): log write는 무료 허용량 초과분에 과금한다.
