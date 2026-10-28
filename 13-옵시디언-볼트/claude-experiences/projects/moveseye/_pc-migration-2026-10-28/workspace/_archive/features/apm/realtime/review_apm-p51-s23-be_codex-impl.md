## 결과

**P5.1 2·3단계 구현 완료. 전체 `:test` green입니다.**

| 검증 | 결과 |
|---|---:|
| 전체 테스트 | **3,400 통과 / 실패·오류·스킵 0** |
| 신규 테스트 | **6개 클래스, 55건** |
| 라이브 수신 테스트 | **220건 통과** |
| 전체 실행 시간 | **4분 43초** |
| `git diff --check` | 통과 |

선재 `dropStatsFlush` 플레이크는 재현되지 않았습니다. 커밋·병합은 수행하지 않았습니다.

## 단계별 구현

### 2단계

- `N = A + D + R` 검증과 `rejectedSpans = R` 응답을 구현했습니다.
- 1,001번째부터 `batchOverflow`로 부분 거절합니다.
- 필수 필드 결손·시간 역전·모집단 밖 입력을 스팬별로 거절합니다.
- 전체 `(traceId, spanId)`를 비교하는 **60초 dedup**을 추가했습니다. 중복 전량은 200, 거절 0입니다.
- `accepted`·`duplicated`·사유별 스팬 거절과 기존 요청 카운터를 분리했습니다.

### 3단계

- **soft 20초 / hard 30초**, single-flight, generation, 음성 캐시를 구현했습니다.
- 캐시는 총 10,000항목 LRU, 갱신 큐 1,000개, DB 조회 동시성 4개로 제한했습니다.
- 발급·회수·승인·거절·삭제·표시명·느림 임계·숨김·복원·자동 등록·자동 재활성화·라이선스 변경을 commit 이후 반영합니다.
- 실제 트랜잭션의 rollback 보존과 **warm 라이브 EP 100회 호출 시 SQL 0회**를 검증했습니다.
- 라이선스 freshness는 provider의 **60초 한 계층**만 적용합니다.

## 변경 파일

**신규 17개, 수정 23개 — 총 40개입니다. 아래 파일명은 모두 `.java`입니다.**

| 구분 | 파일 |
|---|---|
| 프로덕션 신규 — [live 패키지](/C:/solutions/moveseye-be-spring-p5/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/live) | `BoundedLiveDedupIndex`, `LiveDedupIndex`, `LiveIngestResult`, `LiveMetadataCache`, `LiveMetadataSource`, `LiveSpanAdmission`, `LiveSpanIngestor`, `LiveSpanRejection` |
| 프로덕션 신규 — 이벤트 | `LicenseChanged`, `ApmReceiveTokenChanged`, `ApmServiceMetadataChanged` |
| 프로덕션 수정 — 수신 | `ApmIngestTokenPolicy`, `ApmOtlpLiveController`, `LiveIngestCounters`, `LiveIngestResponses`, `LiveSpanParser` |
| 프로덕션 수정 — 상태 변경 | `ApmReceiveTokenService`, `ApmRetentionService`, `ApmServiceQueryService`, `ApmRegistryService`, `ApmRegistryWriter`, `LicenseService`, `SignedKeyLicenseProvider` |
| 테스트 신규 | `LiveLicenseFreshnessTest`, `BoundedLiveDedupIndexTest`, `LiveMetadataCacheIT`, `LiveMetadataCacheTest`, `LiveMetadataGateTest`, `LiveSpanIngestorTest` |
| 테스트 수정 | `LicenseArchitectureTest`, `SignedKeyLicenseProviderTest`, `ApmOtlpLiveControllerTest`, `LiveIngestConcurrencyTest`, `LiveIngestSecurityChainTest`, `LiveIngestTestSupport`, `LiveSpanParserTest`, `ApmReceiveTokenServiceTest`, `ApmServiceDeleteTest`, `ApmServiceDetailAlertRulesTest`, `ApmRegistryServiceTest` |

## 정본 차이·미구현·검수 위험

- **라이선스 시간 전이:** 별도 타이머 대신 검증된 서명 내용으로 매 요청 재계산합니다. DB 조회 없이 만료·유예 경계를 반영하며, 공유 provider 변경이므로 검수 대상입니다.
- **파서:** 잘못된 후행 JSON이 부분 집계를 남기지 않도록 최대 1,000개의 선택 필드를 보유한 뒤 처리합니다.
- **hard 갱신:** 유계 worker의 동일 future를 최대 3초 기다립니다. 여러 서비스가 동시에 만료되면 서비스별 대기가 누적될 수 있습니다.
- **임시 dedup:** 최대 300,000항목, 보수적 메모리 예산 64 MiB입니다. 전역 동기화 락의 처리량·실제 retained heap은 4단계 R3 검증 대상입니다.
- **4단계 연결 지점:** [LiveSpanAdmission](/C:/solutions/moveseye-be-spring-p5/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/live/LiveSpanAdmission.java:7)의 `reject()`와 `aggregate()`입니다. 실제 버킷 집계·표본·arena·인스턴스 사전·future/stale 판정은 아직 미구현이며, 현재 `accepted`는 **신규 집계 대상 수**입니다.
- 삭제 이벤트는 준비했으며, 링·사전·snapshot·replay 정리는 해당 후속 단계에서 구독해야 합니다.
