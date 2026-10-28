## 🔴 반드시 고침

- **5. 🔴 `ApmServiceMetadataChanged`만으로 라이브 적재 중지를 완전히 보장하지 못한다.**  
  [LiveSpanIngestor.java:52](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/apm/live/application/LiveSpanIngestor.java:52)에서 metadata를 `ACTIVE`로 판정한 요청은 이후 `collecting`을 다시 확인하지 않는다. 한편 [LiveSpanRing.java:417](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/apm/live/application/LiveSpanRing.java:417)의 이벤트 처리는 `deleted/hidden`만 차단하며, pause 이벤트는 오히려 block을 해제한다.  
  **사용자 영향:** 중지 API 응답이 끝난 뒤에도, 먼저 `ACTIVE` 판정을 받은 라이브 배치가 ring에 들어갈 수 있다.  
  **수정:** 이벤트에 `collectionPaused`를 포함하거나 전용 이벤트를 만들고, pause 시 serviceId를 신규 write 차단 목록에 넣어야 한다. 기존 ring 데이터는 제거하지 않고 신규 적재만 차단하며, resume 시 해제하는 방식이 적절하다.

- **추가 — `COLLECTION_PAUSED`가 FE 계약·표시에 반영되지 않았다.**  
  [apm.ts:1158](file:///C:/solutions/moveseyee_fe/src/types/apm.ts%3A1158)의 drop reason union, [apmCollectorDisplay.ts:36](file:///C:/solutions/moveseyee_fe/src/pages/application-monitoring/collectors/apmCollectorDisplay.ts%3A36)의 label/tone 처리, [kr.json:1438](file:///C:/solutions/moveseyee_fe/src/locales/kr.json%3A1438)에 새 reason이 없다. 계약서도 [contract_apm-read-api.md:261](../06-API-%EA%B3%84%EC%95%BD/solutions--APM-%EC%9D%BD%EA%B8%B0-API-%EA%B3%84%EC%95%BD-P1-%282026-08-31-%EC%98%A4%EC%BC%80%EC%8A%A4%ED%8A%B8%EB%A0%88%EC%9D%B4%ED%84%B0-%ED%99%95%EC%A0%95%EB%B3%B8%29.md)과 [contract_apm.md:430](../06-API-%EA%B3%84%EC%95%BD/solutions--APM-%EA%B3%84%EC%95%BD%EC%84%9C.md)에서 누락됐다.  
  **사용자 영향:** 화면에는 번역되지 않은 `COLLECTION_PAUSED`가 critical 상태로 보이고, 의도적으로 멈춘 데이터가 장애성 “lost” 건수에 포함된다. 일부 reason별 합계에서는 아예 빠진다.  
  **수정:** FE union·번역·표시 tone을 추가하고, paused를 장애성 손실 합계에서 제외할지 제품 의미를 명시해야 한다. 두 계약서의 reason 목록과 FE 요청사항도 함께 갱신해야 한다.

## 🟡 고치면 좋음

- **중지 직후 일반 OTLP 배치가 저장되는 창에는 시간 상한이 없다.**  
  [MetricIngestor.java:223](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/apm/metric/application/MetricIngestor.java:223), [TraceIngestPipeline.java:145](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/apm/trace/application/TraceIngestPipeline.java:145)에서 resolve가 끝난 뒤에는 재확인 없이 저장한다. 따라서 pause 전에 resolve를 통과한 모든 동시 요청이 대상이며, 기본 요청 크기는 각각 최대 8 MiB지만 [ApmOtlpController.java:135](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/apm/otlp/api/ApmOtlpController.java:135), DB 지연을 포함한 처리시간 제한은 없다. 즉 보통은 “현재 처리 중인 한 배치 시간”이지만 코드상 wall-clock 상한은 없다. 즉시 중지를 보장하려면 store 직전 DB/version gate가 필요하고, 그렇지 않다면 이 eventual semantics를 계약에 명시하는 편이 좋다.

- 라이브 경로의 기본 제한은 요청당 2 MiB·1,000 spans·동시 4건이다([application.yml:150](file:///C:/solutions/moveseye-be-spring/src/main/resources/application.yml%3A150)). 다만 위 #5 경합 때문에 이미 metadata 판정을 마친 요청은 pause 응답 뒤에도 들어갈 수 있다.

- 실제 registrar cache 무효화와 pause/resume을 연결하는 통합 테스트가 없다. 새 테스트는 entity 상태 전이와 mocked `Paused` 분기까지만 검증한다([ApmServiceCollectingTest.java:59](C:/solutions/moveseye-be-spring/src/test/java/com/dmove/moveseye/apm/service/domain/ApmServiceCollectingTest.java:59), [ApmRegistrarServiceResolverTest.java:70](C:/solutions/moveseye-be-spring/src/test/java/com/dmove/moveseye/apm/ingest/application/ApmRegistrarServiceResolverTest.java:70)). `update(false) → commit → registrar.resolve() → no rows`, resume까지 검증하는 통합 테스트를 권한다.

- [Resolution.java:15](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/apm/service/registry/auto/Resolution.java:15)의 문서는 아직 “5가지 결과”이며 표에도 `Paused`가 없다. sealed 타입에 subtype을 추가하면 모든 `instanceof` chain에서 자동으로 컴파일 오류가 난다는 [Resolution.java:30](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/apm/service/registry/auto/Resolution.java:30)의 설명도 정확하지 않다.

## ✅ 확인한 것

1. **✅ touch가 pause 판정보다 먼저다.**  
   [ApmRegistrar.java:171](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/apm/service/registry/auto/ApmRegistrar.java:171)에서 `lookupService()` 후 [ApmRegistrar.java:201](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/apm/service/registry/auto/ApmRegistrar.java:201)에서 pause를 판정한다. 캐시 hit도 [ApmRegistrar.java:247](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/apm/service/registry/auto/ApmRegistrar.java:247)에서 `touchServiceThrottled()`를 먼저 호출한다. 단, touch는 60초 throttle이므로 매 배치마다 DB timestamp가 바뀌는 것은 아니다.

2. **✅ `touchSeen()`은 `collecting`을 되살리지 않는다.**  
   [ApmService.java:240](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/apm/service/domain/ApmService.java:240)는 `lastSeenAt`, `updatedAt`, 숨김 상태만 변경한다. `collecting`과 `collectionPausedAt`은 [ApmService.java:257](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/apm/service/domain/ApmService.java:257)의 pause/resume 메서드에서만 변경된다.

3. **✅ `Resolution.Paused`를 놓친 production 소비자는 없다.**  
   `registrar.resolve()`의 production 소비자는 [ApmRegistrarServiceResolver.java:100](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/apm/ingest/application/ApmRegistrarServiceResolver.java:100) 하나이며, [ApmRegistrarServiceResolver.java:121](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/apm/ingest/application/ApmRegistrarServiceResolver.java:121)에서 `COLLECTION_PAUSED`로 처리한다. Metric과 Trace 모두 이 resolver를 사용한다.

4. **✅ 단일 BE 인스턴스 기준 cache 무효화 누락은 없다.**  
   스위치 저장과 이벤트 발행 후 [ApmServiceQueryService.java:481](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/apm/service/application/ApmServiceQueryService.java:481)에서 `afterCommit(registrar::clearCache)`를 등록한다. 다른 `apm_service` 변경 경로도 확인했으며 auto-create는 cache를 직접 채우고, touch/retention은 collecting을 바꾸지 않으며, 삭제도 after-commit clear를 수행한다.

6. **✅ `ApmServiceRowDto` 생성자 갱신 누락은 없다.**  
   production 생성처 [ApmServiceQueryService.java:649](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/apm/service/application/ApmServiceQueryService.java:649), detail 변환 [ApmServiceDetailDto.java:140](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/apm/service/api/dto/ApmServiceDetailDto.java:140), 테스트 fixture와 직접 생성처까지 두 필드가 모두 반영됐다.

- **V60은 정상적인 기존 설치에 안전하다.**  
  [V60__apm_service_collecting.sql:8](file:///C:/solutions/moveseye-be-spring/src/main/resources/db/migration/V60__apm_service_collecting.sql%3A8)의 `NOT NULL DEFAULT true`로 기존 행이 수집 활성 상태를 유지하며, `collection_paused_at`은 nullable이다. 기존 migration 수정도 아니다.

- **BE 집계는 `COLLECTION_PAUSED`를 처리한다.**  
  recorder는 enum 이름을 문자열로 저장하고([ApmIngestDropStatRecorder.java:95](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/apm/ingest/application/ApmIngestDropStatRecorder.java:95)), 조회도 whitelist나 enum 재파싱 없이 arbitrary reason을 그룹화한다([ApmIngestDropQueryService.java:136](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/apm/ingest/application/ApmIngestDropQueryService.java:136)). 문제는 위에서 지적한 FE 의미 처리다.

## ❓ 판단 불가

- **배포가 다중 BE replica인지 확인할 수 없다.** 이벤트와 registrar cache는 JVM 로컬이다. replica가 둘 이상이면 #4는 충분하지 않다. 다른 노드는 [ApmRegistrar.java:86](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/apm/service/registry/auto/ApmRegistrar.java:86)의 cache TTL 동안 최대 10분간 일반 적재를 계속할 수 있고, live metadata도 [LiveMetadataCache.java:19](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/apm/live/application/LiveMetadataCache.java:19)의 hard TTL인 최대 30초 동안 stale할 수 있다. 다중 replica라면 distributed invalidation 또는 DB 기반 version/gate가 반드시 필요하다.

- 읽기 전용 조건 때문에 Gradle 테스트는 실행하지 않았으며, 위 판정은 commit diff와 전체 참조 전수 검색에 기반한 정적 검수 결과다.
