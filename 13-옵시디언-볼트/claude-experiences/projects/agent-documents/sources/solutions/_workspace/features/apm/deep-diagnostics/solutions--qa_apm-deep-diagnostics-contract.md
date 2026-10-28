# APM 심층 진단 정적 통합 검수

2026-10-28 · 검수자: Codex integration-qa · 범위: 격리 worktree의 최종 API/생산자 경계

## 판정

실질 불일치 2건을 발견했고 담당자 수정 뒤 같은 경계를 재확인했다. GC의 관측된 0과 미수신 혼동은 BE 수정과 신규 회귀 소스를 확인했고, 조회 OFF의 권한 토스트 오분류는 수정 소스의 실제 함수 7개 입력을 직접 실행해 확인했다. **정적 통합 검수 완료, 열린 정적 결함 0건.** 아래 미검증 범위가 있으므로 런타임 통합 통과나 운영 지원 완료 판정은 아니다.

## 검수 범위와 제약

- BE: `C:/worktrees/apm-deep-be`, FE: `C:/worktrees/apm-deep-fe`, Java 확장: `C:/worktrees/apm-deep-otel`.
- 정본: [API 계약](solutions--contract_apm-deep-diagnostics.md), [설계](solutions--devdesign_apm-deep-diagnostics.md), 진행 문서 및 BE/FE/Java 보고서. 루트와 BE/FE `AGENTS.md`, `COLLAB.md`, `api-contract-sync/SKILL.md`를 확인했다. Java worktree에는 `AGENTS.md`가 없다.
- 제품 소스는 읽기만 했으며 이 QA 문서만 작성했다. 서버·브라우저·DB를 실행하거나 접속하지 않았고 무거운 테스트도 실행하지 않았다. 전역 협업 상태와 원본 레포를 변경하지 않았다.
- 담당자의 테스트 통과 보고와 검수자가 직접 실행한 검사를 아래에서 구분한다.

## 발견 사항 및 재검증

| 항목 | 기대(BE 정본/의미) | 실제(FE 또는 하류 계약) | 심각도 | 수정 제안·상태 |
|---|---|---|---|---|
| DQ-01: GC의 관측된 0이 미수신으로 변환 | `gcDurationMs`는 `HIST_SUM`이다. 저장된 `count=0, sum=0` 행은 0ms이며, 행 자체가 없는 버킷만 null이다. 기존 `ApmSeriesQueryService.java:818`도 count와 무관하게 sum을 읽는다. | 최초 `DiagnosticRuntime.java:60`은 모든 metric에 `count<=0` 필터를 적용했다. FE는 서버가 만든 null/빈 series를 그대로 표시하므로 실제 GC 0 버킷이 빈 자료로 표시된다. | 중간 | BE 담당에게 전달. 공통 필터에서 count를 제거하고 `HIST_SUM` 이외 바인딩에서만 count를 검사하도록 수정됨(`DiagnosticRuntime.java:60,64,84`). 새 `DiagnosticRuntimeTest.java:38`은 관측 0/실제 누락 null을 구분한다. **정적 재검증 완료, 실행 결과 대기.** |
| DQ-02: query OFF가 권한 거부 토스트로도 표시 | `APM_DIAG_DISABLED` + body code403은 진단 조회 설정 OFF다. 사용자 읽기 권한 자체를 거부한 `FORBIDDEN`과 구분해야 한다. | capability가 true로 캐시된 뒤 BE query flag가 OFF이면 진단 조회의 inline 안내는 맞지만, `axiosInstance.ts:214` → `permissionDenied.ts:34` → `usePermissionDeniedWatcher.ts:28`이 일반 ‘권한이 없습니다’ 토스트를 추가로 띄웠다. | 낮음 | root가 `isPermissionDeniedEnvelope`에서 `APM_DIAG_DISABLED`만 명시 제외. 기존 `FORBIDDEN`, `ACCESS_DENIED`, 일반 body403 조건 보존을 재확인했다. 실제 소스 함수를 직접 로드한 7건 검사 통과. `zm157PermissionUi.test.tsx:158`에도 회귀 2건 추가. **수정·재검증 완료.** |

DQ-01은 BE 표현 계산과 FE 의미의 경계 오류이며 TypeScript shape 검사로 검출되지 않는다. DQ-02는 성공 오인이나 권한 우회는 아니지만 query OFF와 권한 거부가 다른 계약이라는 사용자 안내를 흐린다.

## 경계 교차 대조

| 경계 | 확인한 BE/생산자 | 확인한 FE/소비자 | 결과 |
|---|---|---|---|
| 경로·메서드 | `ApmDiagnosticsController.java:30,38`의 GET `/apm/diagnostics/capabilities`, `/apm/traces/{traceId}/diagnostics` | `services/apmDiagnostics.api.ts:9,15`의 동일 GET 경로 | 일치. 추가 base path 없음. trace ID는 URL encode, 선택 대상만 `spanId`로 전달. |
| 요청 계약 | `ApmDiagnosticsService.java:24`의 trace32/span16 hex 검증, lowercase 정규화. instance/run/service 입력 없음 | 서비스가 traceId와 선택 spanId만 전달 | 일치. 잘못된 대상은 body400/`APM_DIAG_INVALID_TARGET`, 대상 초기화 UI 존재. |
| 응답 shape | `ApmDiagnosticDto.java:7` 및 중첩 record 전체 | `types/apmDiagnostics.ts` 전체 | 필드명·배열·primitive·nullable 대조 완료. `ruleThresholds`의 3개 number 필수 필드도 일치. Java record여서 Lombok boolean `isXxx` 변형 함정 없음. |
| 대상 선택 전 | `ApmDiagnosticsService.java:45`에서 target/request/contextWindow/runtime/acquisition/operations null, findings 빈 배열, 후보 최대32 | `ApmDiagnosticsTab.tsx:119,132,159,233,266`의 nullable 분기 | null 안전. 선택 이후에도 후보가 제공되며, 32개 밖 명시 대상은 FE 선택 목록에 보완한다. |
| capability·설정 | query 기본 false. capability의 collectionSupported=true는 BE 저장/해석 지원. Java의 `moveseye.diagnostics.enabled=false`는 별도 수집 설정 | `ApmTraceDetailPage.tsx:83`에서 canView와 queryEnabled로 탭을 노출. collectionSupported를 설치 여부로 쓰지 않음 | 일치. Java 수집 OFF와 이미 저장된 자료 조회가 결합되지 않는다. DQ-02 수정도 재확인. |
| 인증·권한·라이선스 | 컨트롤러의 `@VisitorIdCheck`, `@RequiresFeature(APM)`, `ApmAccessChecker.requireRead` | 기존 Axios 인스턴스의 `withCredentials:true`, `x-visitor-id`, 401 refresh; 기존 APM 읽기 권한으로 탭 제어 | 현재 쿠키 인증 계약과 일치. AGENTS의 최신 인증 규약대로 HttpOnly cookie 우선/Bearer 폴백이며 FE에 Bearer 직접 주입이 없는 것은 결함이 아니다. |
| envelope·오류 | `ApiResult` success/error, `GlobalExceptionHandler`의 ApiError HTTP200/body code, 미인증401. disabled403/invalid400/busy429 | Axios가 HTTP 래퍼 제거, `useDmoveQuery.ts:45,61`에서 실패 envelope throw 후 `.data` 언랩, 훅 소비자는 payload 직접 사용 | 과다/과소 언랩 없음. retry=false로 busy 자동 반복 없음. 오류 때 이전 데이터 표시도 막는다. |
| React Query·URL | 대상별 결과가 다름 | `useApmDiagnostics.ts:26` 키에 traceId/spanId, 독립 capability 키. `diagnosticSpan`과 waterfall `span` 분리. `apmAsync.ts:150` 이후 링크/복귀에 진단 대상 보존 | 대상 캐시 충돌 없음. query 변경·SQL 이동·비동기 복귀의 상태 보존을 정적으로 확인. |
| 획득 null/0·상태 | `DiagnosticEvidence.java:67` 이후 summary 없으면 summary 유래 수치 null. summary+interval 없으면 union/lowerBound도 null. 유효 0회 summary의 union=0 | `ApmDiagnosticsTab.tsx:174` 이후 null 보존 formatter, attempts===0 && summaryPresent일 때만 0회 설명 | 일치. belowThreshold/detailDropped/unfinished/transport gap과 summary 모순은 사유 및 PARTIAL/UNAVAILABLE로 노출. |
| 불완전 trace | truncated/rootMissing/cycle/orphan/다중 root/일반 LIMIT 밖 대상을 `incomplete`로 처리. 요청 PARTIAL, 획득 하한, operations 부분 상태, 요청 비율 지연 판정 생략 | 상태·사유·하한을 각각 표시하며 FE가 인과/비율을 재판정하지 않음 | 일치. 관측 구간 자체가 임계 이상인 절대시간 finding은 유지하는 설계와도 일치. |
| runtime 범위·단위 | instance+service로 1m만 조회. CPU×100→%, GC×1000→ms, pool count. memory/thread 3슬롯 제외 및 `METRIC_SEMANTICS_UNVERIFIED` | `ApmDiagnosticRuntime.tsx:44`에서 bucketStartMs/value를 그대로 사용, null 유지, 단위 formatter만 적용. 60초 bar 및 processScope 제한 문구 | DQ-01 수정 후 0/누락 의미도 정합. FE 추가 수치 변환·보간·서비스 전체 폴백 없음. |
| runtime 부분 실패 | EXPIRED/NOT_RECEIVED/PARTIAL과 SOURCE_TIMEOUT/SOURCE_FAILURE 하위 UNAVAILABLE 구분 | acquisition/operations/runtime를 독립 카드로 표시 | runtime 실패가 획득 증거를 없애지 않음. 미수신을 보존 만료로 추정하지 않음. |
| findings·후속 기능 | BE가 ruleVersion/ruleThresholds 및 evidenceIds/valueMs/dimension/bucketStartMs 계산. logs/dbm/jfr UNSUPPORTED | 규칙 version·사유·근거 이동만 표시. arbitrary finding HTML 렌더 없음. 미지원 기능 버튼 없음 | 일치. 조사 후보를 원인 확정/정상 판정으로 바꾸지 않음. |
| archive | hot span 없는 저장 요약은 HOT_DATA_UNAVAILABLE/TRACE_INCOMPLETE. 조회 API에서 archive 탐색 없음 | 한/영 안내 모두 보관 자료 존재 미확정을 명시 | archive 존재 추정 없음. 실제 신규 ZIP/구 ZIP 왕복은 검수 범위 밖. |

## Java → Collector → BE 저장 계약

| 항목 | 생산자 | 수신·조회 | 판정 |
|---|---|---|---|
| 정형 속성 | `DiagnosticsRuntime.java:84` 이후 `moveseye.diag.*` 16종. 숫자는 Long, request_span_id는 실제 SERVER 부모, kind=INTERNAL/status=UNSET | `DiagnosticValidator.java:23,55`가 OTLP 숫자 타입·중복키·허용목록·부모·UUID·이름·상태·summary 0-duration을 검증 | 키·타입·상태 일치. SDK exporter가 enrichment 후 진단 scope만 허용목록으로 정리하며 일반 span은 유지. |
| summary 산식 | `DiagnosticToken.java:34,51`에서 완료 total/max, retained/below/dropped/unfinished 및 단일 종료 snapshot. 16개 상세 제한 | Validator의 attempts=retained+below+dropped+unfinished, retained≤16, total/max 정합; Evidence에서 수신 retained 비교 | 단위 ns→ms 한 번 변환. 병렬 total과 요청 clip union을 분리. 유실된 summary의 수치를 추정하지 않음. |
| 리소스 식별 | `ProcessRunResource.java:12`의 JVM run UUID를 SDK resource에 넣음 | `TraceIngestPipeline.java:231`의 resource instance 우선/기존 resolver 파생, run은 resource UUID만 저장. Evidence service/instance/run 불일치 제외 | root·진단의 식별 경계 일치. span attr로 resource 식별을 대체하지 않음. |
| ID 마스킹 | request/related span ID와 pool UUID, resource run UUID | `collector-template.yaml:58`의 위치·타입·regex 검사 후 정확한 4개 trace 키만 예외. log는 기존 redaction 사용 | 정적 계약 일치. 실 Collector 왕복 결과는 별도 담당 보고서의 증거이며 이 검수에서 실행하지 않음. |
| 재전송 | 기존 trace/span ID 재사용 | `ApmTraceWriter.java:143`의 저장 ID dedupe, `ApmSpanStore` 첫 저장 식별 보존 | 재전송으로 identity를 덮지 않음. 충돌 계수 경로 존재. |
| 일반 trace 분석 격리 | 진단 span은 일반 span과 같은 trace에 저장 | `ApmTraceQueryService.java:603`에서 `diagnostic_kind is null`을 SQL LIMIT 전에 적용. detail/flame/critical path가 같은 `load` 사용 | 신규 span이 일반 LIMIT 슬롯과 분석 입력을 점유하지 않음. FE도 진단 interval을 기존 trace DTO에 병합하지 않음. |
| trace summary | 진단-only가 먼저 도착할 수 있음 | `TraceIngestPipeline.java:554`에서 일반 시간/오류/서비스 누적 제외, `ApmTraceWriter.java:157`에서 summary 없이 spanCount만 보정 | 진단-only로 일반 요약을 생성하지 않고 일반 도착 뒤 전체 저장 spanCount 의미 유지. 기존 rollup의 diagnostic 제외 조건도 확인. |

## 검수자가 직접 실행한 가벼운 확인

1. TypeScript compiler API, Node heap256MiB, `types:[]`, `noEmit`, `strictNullChecks`, `skipLibCheck`로 `src/types/apmDiagnostics.ts` 및 `src/__tests__/fixtures/apmDiagnosticsContractSample.ts`만 검사: **errors=0**. 마지막 `ruleThresholds` 증분을 포함한다. 전체 FE tsc 재실행이 아니다.
2. Python 읽기 전용 검사로 BE `DiagnosticRuntime`, `DiagnosticEvidence`, `ApmDiagnosticsService`가 반환하는 상태·사유·finding 코드와 `kr.json`/`en.json` 매핑을 비교: **두 언어 모두 누락 0개**. `METRIC_SEMANTICS_UNVERIFIED` 포함.
3. 생산자 `.setAttribute` 키를 추출해 16개 `moveseye.diag.*` 키와 BE 허용목록을 대조했다. request/related ID, pool/run UUID, 숫자 ns 및 extension_version 계약을 함께 읽었다.
4. Node heap256MiB에서 `permissionDenied.ts`, `http.ts`, `license.ts`, `apiEnvelope.ts` 실제 소스를 TypeScript `transpileModule`로 메모리에 로드해 `isPermissionDeniedEnvelope`를 **mock 없이 직접 호출: 7/7 통과**. feature OFF는 false, 다른 APM403/표준 FORBIDDEN/일반403은 true, license/busy/success는 false. 브라우저 토스트를 실행한 검사는 아니다.

## 실행 증거 및 미검증

- FE 기존 보고서의 전체 tsc 통과와 5개 스위트/120개 테스트 통과는 **담당자 보고**다. 그 실행 뒤 추가된 타입/fixture 증분은 위 가벼운 검사로 별도 확인했다.
- DQ-01 신규 BE 회귀의 실행 결과는 BE 담당의 선별 시험이 끝나야 확정된다. DQ-02는 위 실제 함수 7건을 직접 실행했으나 추가된 Jest 회귀 스위트 전체는 재실행하지 않았다. 정적 수정 확인을 전체 테스트 통과로 표시하지 않는다.
- 후속 최종 실행에서 DQ-01을 포함한 BE 단위 109건과 독립 IT 107건이 통과했고, DQ-02 증분을 포함한 FE 선별 2 suites/41 tests가 통과했다. 이 문서의 직접 실행 범위와 후속 담당 실행 근거는 구분한다.
- 실제 API JSON 직렬화·Swagger·브라우저 UX·권한 세션·Collector→BE 왕복·Flyway 적용·DB query plan/부하·archive 왕복은 이 검수에서 미실행했다. 정적 null 직렬화는 DTO 및 `ApiResult`의 NON_NULL 범위까지 읽었으며 실 응답은 런타임 담당 확인이 필요하다.
- 운영 R0의 30분 부하·8시간 안정성·OFF/ON 비용·SDK/Collector 유실 및 지원 조합 검증을 본 검수로 대체하지 않는다.
