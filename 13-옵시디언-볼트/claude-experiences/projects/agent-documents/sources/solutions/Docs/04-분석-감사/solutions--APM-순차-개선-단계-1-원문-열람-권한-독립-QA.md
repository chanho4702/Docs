# APM 순차 개선 단계 1 — 원문 열람 권한 독립 QA

- 검토일: 2026-10-06
- 범위: `keep_raw_sql` ON→OFF 이후 과거 원문을 비관리자가 열람하는 결함과 BE↔FE 응답 경계
- 역할: 읽기 기반 독립 QA. 제품 소스·DB·서버를 변경하지 않고 이 보고서만 작성한다. 테스트 실행과 최종 결과 취합은 root가 담당한다.
- 상태: 구현 완료 후 diff·계약·새 회귀 독립 검토 완료. 정적 검토에서 추가 차단 결함 없음. 실행 결과는 root 검증 대기.

## 판정 기준

저장 설정은 새 데이터의 적재 정책이다. 과거 데이터의 원문 여부를 현재 설정으로 추정하지 않는다. 조회자는 `ADMIN` 또는 `SUPER_ADMIN`일 때 원문 자격을 갖고, 그 밖에는 저장 설정과 무관하게 기존 마스킹 정책을 적용해야 한다. `apm.view`·`apm.edit` 위임은 원문 자격을 부여하지 않는다.

이 작업은 SQL로 판단되는 문자열의 기존 마스킹 정책을 일관되게 적용하는 보완이다. 모든 개인정보·비밀값 제거 또는 모든 텍스트 필드의 재작성으로 확대하지 않는다.

## 조회·파일 경로 교차 검토

아래 BE 경로는 `moveseye-be-spring/src/main/java/com/dmove/moveseye/`, FE 경로는 `moveseyee_fe/src/` 기준이다. 줄 번호는 초기 검토 시점 기준이며 후속 수정으로 이동할 수 있다.

| 항목 | 기대(BE)·실제 구현 | FE 소비 | 판정 |
|---|---|---|---|
| 트레이스 상세 principal | `auth/security/CurrentUser.java:14`의 `@AuthenticationPrincipal` → `premium/apm/trace/query/ApmTraceController.java:164`의 `TokenUserInfo` → `requireRead` → `rawTextPolicy.viewFor(currentUser)` | `services/apm.api.ts:574` GET `/apm/traces/{traceId}` | 경로·사용자 전달 일치 |
| 트레이스 속성 | `ApmTraceQueryService.java:743`에서 `view.attrs(row.attrs())` | `types/apm.ts:1918` 이후 `TApmSpan.attrs: Record<string,string>` | 마스킹 view만 올바르면 기존 구조 유지 |
| 트레이스 이벤트 | `ApmTraceQueryService.java:747` 이후 모든 event attributes에 view 적용; `exception.stacktrace`는 별도로 `stackTrace`를 적용해 프레임 보존 | `TApmSpanEvent.attributes`, `time:string|null`, `name:string` | 속성 shape 유지. `event.name`은 기존 마스킹 비대상 |
| 트레이스 링크 | `ApmTraceQueryService.java:767` 이후 link attributes에 view 적용 | `TApmSpanLink`의 traceId/spanId/attributes | 링크 ID 보존, 속성 마스킹 |
| 오류 그룹 상세 | `premium/apm/trace/errors/ApmErrorController.java:94` 이후 실제 사용자로 정책 판정; `ApmErrorQueryService.java:312`에서 `view.stackTrace(sample_stack)` | `services/apm.api.ts:618`, `types/apm.ts:2246`, `ApmErrorGroupPanel.tsx:59,171` | GET·groupId·from/to·nullable sampleStack 일치 |
| 내보내기 | `export/ApmExportService.java:332` 기본 MASKED, `rawText=true` 요청은 원문 자격 없으면 403. 계획과 다운로드 모두 재판정(`:152,161`), 계획 토큰이 권한을 부여하지 않음 | `shared/components/ApmExportModal.tsx:131,144`에서 관리자·지원 데이터셋만 rawText 체크 허용, state가 남아 있어도 전송은 false | 기존 방어 유지. 화면 정책 수정이 파일의 명시 요청 요건을 완화하면 안 됨 |
| 오류 파일 직렬화 | `export/source/ApmErrorGroupExporter.java:132,146`에서 `view.stackTrace(row.sampleStack())` | CSV/JSONL은 기존 다운로드 경로 사용 | 파일 스택도 기존 공통 규칙 사용 |
| 아카이브 파일 | `archive/ArchiveFileController.java:81` 다운로드에 `ArchiveAdminAccess.require`, APM 설정도 `premium/apm/archive/ApmArchiveController.java:49` 등 관리자 전용 | 일반 APM 조회 권한과 분리 | 이번 정책 우회 경로 아님. `maskRawText`는 별도 아카이브 정책 |
| RUM 오류 스택 | `premium/apm/rum/ingest/RumParser.java:201`의 `RumSanitizer.stack` → 저장 → `rum/page/RumQueryService.java:185` | `types/apmRum.ts`의 `sampleStack` | `keep_raw_sql` 독립 수집 정책. 이번 전환 결함과 다른 경로 |

## 래퍼·인증·오류 계약

- 두 상세 API는 기존 `ApiResult<T>` 그대로다. FE `axiosInstance.ts` 응답 인터셉터와 `hooks/useDmoveQuery.ts:65` 이후가 각각 한 겹씩 벗긴다. `ApmTraceDetailPage.tsx:107`·`ApmErrorGroupPanel.tsx:59`는 `detailQuery.data` payload를 소비하여 과다 언랩이 없다.
- `axiosInstance.ts:155` 부근에서 `x-visitor-id`를 넣고, 공통 axios 생성 시 `withCredentials:true`로 HttpOnly 인증 쿠키를 전송한다. Bearer 문자열을 FE 코드에 직접 주입할 필요가 없다.
- `useDmoveQuery.ts:40` 이후 실패 envelope을 `ApiEnvelopeError`로 바꾸므로 HTTP 200 + body 403이 성공 데이터로 흘러가지 않는다.
- 세션 변경 시 늦게 도착한 조회 응답은 `useDmoveQuery`의 session epoch 검사로 버린다. `utils/session.ts:38,40`에서 쿼리 삭제·clear 경로도 확인했다. 이번 BE 변경은 FE 타입·URL·새 쿼리 파라미터를 요구하지 않는다.

## 구현자에게 전달한 사항

| 항목 | 초기 상태 | 심각도 | 전달·수정 제안 |
|---|---|---|---|
| 현재 설정 OFF면 원문 허용 | 기존 `ApmRawTextPolicy.java:52`는 비관리자도 `keepRawSql=false` 또는 설정 객체 null이면 RAW | 높음 | 설정 의존 없이 역할로만 열람 view 결정 |
| 기존 MVC 회귀의 허점 | `ApmReadAccessMvcTest.java:245`의 주석은 비관리자인데 실제 `mvc(admin())`, 서비스에 넘긴 값은 `notNull()`만 검사 | 높음(검증 공백) | 실제 USER + `apm.view` principal, Trace/Error 두 상세 모두 MASKED exact value 또는 실제 직렬화 검증 |
| 트레이스 실제 마스킹 회귀 부족 | 기존 `ApmTraceQueryIT`는 RAW 상세 회귀만 존재 | 중간(검증 공백) | actual QueryService와 view로 attrs/events/links, 스택 프레임, 원문 소실 여부 회귀 |
| 오래된 주석의 정책 모순 | RawTextPolicy/View, Trace/ErrorController, AccessChecker, ExportService, ErrorGroupDetailDto에 설정 OFF면 조회 마스킹 불필요 설명 | 중간 | 새로운 역할 기반 불변식과 실제 마스킹 범위로 설명 정리 |
| 생성자·Mockito 영향 | 직접 생성은 `ApmRawTextPolicyTest`·`ApmReadAccessMvcTest`에 존재. 기존 `keepRawSql` stubbing 있음 | 낮음 | 생성자 호환 또는 소비자 갱신. 실제 정책에서 호출이 사라지면 strict unused stub 확인 |

## 필수 회귀와 기존 방어

1. USER·null 사용자·null 역할은 설정 ON/OFF/null/설정 조회 장애와 무관하게 MASKED; ADMIN/SUPER_ADMIN은 RAW.
2. 동일한 과거 원문 fixture를 두고 ON→OFF 전환 후에도 비관리자 결과가 마스킹돼야 한다. 관리자 결과는 보존 원문 그대로다.
3. 실제 Controller가 받은 USER와 실제 Policy가 만든 view가 QueryService까지 전달돼야 한다. Trace/Error 상세 양쪽을 검증한다.
4. 실제 QueryService 출력에서 스팬 attrs·event attrs·link attrs의 SQL 리터럴이 사라지고, event `exception.stacktrace`의 `at ...:42` 프레임은 보존돼야 한다.
5. 오류 상세 sampleStack의 마스킹·프레임 보존은 기존 `ApmTraceAggQueryIT.errorDetailMasksStackForRestrictedViewer`로도 보호된다.
6. 이미 마스킹된 값에 재적용해도 의미가 바뀌지 않고, null·빈 속성은 기존 nullable/빈 컬렉션 계약을 유지해야 한다.
7. 파일 export 기본 MASKED·관리자 rawText 명시 요청·비관리자의 관리자 계획 토큰 재사용 금지 회귀는 유지한다.
8. 원문 자격 없는 USER라도 `apm.view`가 있으면 마스킹된 상세를 조회할 수 있고, `apm.edit`만 있으면 여전히 body 403이다.

## 이번 수정으로 보장하지 않는 범위

- `ApmRawTextView.text/attrs`는 `ApmSqlPolicy.MASKED.applyToFreeText`를 재사용한다. SQL 휴리스틱을 통과하지 않는 일반 텍스트·PII는 그대로일 수 있다. 속성 key도 바꾸지 않는다.
- span.name/rootName, event.name, flame/compare 이름은 기존 view의 대상이 아니다. `TraceIngestPipeline.java:264,321`에서도 이름은 저장·절단 경로다. 이름에 민감값을 넣는 계측에 대한 포괄적 방어는 별도 정책이 필요하다.
- 기존 원문을 DB에서 삭제하거나 관리자에게도 감추는 작업이 아니다. 저장 정책과 열람 정책을 구분한다.
- 이번 QA는 정적 교차 검토다. 실제 로그인·HTTP 서버·DB 실행 결과는 root의 검증 산출물과 구분한다.

## 구현 후 독립 재검토

구현자 완료 통보 후 다음 내용을 다시 확인했다.

- `ApmRawTextPolicy.java:43` 이후는 원문 자격이 있으면 RAW, 그 밖에는 항상 MASKED를 반환한다. 설정 필드·설정 조회를 제거했으며 생성자 호환을 유지했다. 설정 null/장애가 fail-open을 만들지 않는다.
- 실행 로직 변경은 policy 분기에 국한된다. Controller·AccessChecker·ExportService·ErrorGroupDetailDto의 수정은 설명·Swagger 설명이며 경로, DTO shape, 오류 계약을 바꾸지 않았다.
- `ApmReadAccessMvcTest.java:245`는 실제 USER + `apm.view`로 trace/error 상세를 두 번 호출해 각각 정확히 MASKED를 받았는지 검사한다. 관리자 RAW도 별도 검사한다. 초기의 admin/notNull 검증 공백을 해소했다.
- 새 `ApmRawTextPolicyIT.java:116`은 실제 PostgreSQL 원문 fixture, 실제 JWT 쿠키, 실제 `PUT /apm/settings`, 실제 두 상세 Controller/QueryService/JSON을 연결한다. attrs·event attrs·link attrs·오류 스택과 프레임, USER/ADMIN/SUPER_ADMIN, ON→OFF 이후 DB 원문 유지, 이미 마스킹된 값, 미인증 401을 검사한다. `IntegrationTestSupport.asLocalOnly`는 MockMvc authentication 직접 주입이 아니라 실제 서명 JWT를 발급하므로 인증 필터도 지난다. 외부 TCP 서버·브라우저 E2E 시험과는 구분한다.
- `ApmRawTextPolicyTest`는 설정 값별 역할/null 행렬과 설정 조회 없음, 마스킹 멱등성·빈 값을 확인한다. 테스트가 `MockitoExtension` strict 세션을 쓰는 구조가 아니므로 동작하지 않는 설정 분기를 표현한 stubbing 때문에 strict unused stub 오류가 생길 형태는 아니다.
- [변경 계약](../06-API-%EA%B3%84%EC%95%BD/solutions--APM-%EA%B3%BC%EA%B1%B0-%EC%9B%90%EB%AC%B8-%EC%97%B4%EB%9E%8C-%EC%A0%95%EC%B1%85-%EB%B3%B4%EC%99%84-2026-10-06.md)은 SQL 휴리스틱 한계, key/span/root/event 이름 비대상, DB fixture와 OTLP 전체 수신의 차이, DB skip을 완료로 세지 않는 기준을 명시한다. 범용 PII 제거로 범위를 확대하는 주장은 없다.
- `git diff --check`는 통과했다. LF→CRLF 안내만 있었으며 테스트 실행이나 DB 변경은 이 QA 에이전트가 수행하지 않았다.

**정적 독립 검토 결론:** 원문 보관 ON→OFF에서 권한이 넓어지던 원인을 직접 제거했고 FE 계약은 유지된다. 추가 차단 결함은 발견하지 못했다. 최종 완료 판단에는 root가 실행 중인 새 IT의 **skip 없는 통과**와 기존 export·집계 회귀 결과가 필요하다.
