**P5.1 4단계 구현을 완료했습니다.** `p5-live / 84edbb9`에서 미커밋 상태로 남겼으며, `enabled=false`와 P1.5 `LiveBuffer`는 유지했습니다.

| 항목 | 구현 내용 |
|---|---|
| rps | 인증 전 토큰 해시별 10/s·burst 20, 429·OTLP JSON·`Retry-After`·`rateLimited`. LRU 2,000개이며 사용 중인 버킷을 퇴출하는 대신 신규 키를 거절 |
| 집계 | 전체 관측의 count·오류 2축·slow·합/최대·`hist[15]`·근사 p95. 표본과 독립 |
| arena | 45B 슬롯, 16,384슬롯 lazy 세그먼트, 서비스/전역 예산, 초별 reservoir, 압박 시 무작위 축소·`pointsRev` |
| dedup | 전체 키 비교, 60초 창, 64개 키 샤드, 배치 `reserve(spans)` 유지. 원시 배열 **4.12 MiB** |
| 사전 | 20 MiB 예산, 초과 시 `__other__`, ID 재사용 금지. 인스턴스 key는 도착 문자열의 SHA-256 앞 64bit |
| 시간·삭제 | `endTs` 귀속, future/stale 경계, 버킷 종료+5초 잠정 기간. 삭제·숨김 commit 후 링/사전/집계 제거 |
| 수신 연결 | `reject()`·`aggregate()` 연결. **accepted = 실제 집계 반영 수** |

변경 파일은 아래와 같습니다. 경로 기준은 `com/dmove/moveseye/premium/apm/`입니다.

| 구분 | 파일 |
|---|---|
| 신규 main — `collector/ingest/live/` | `LiveRateLimitProperties`, `LiveTokenRateLimiter` |
| 신규 main — `overview/live/spans/` | `ArenaLiveDedupIndex`, `LiveSpanArena`, `LiveSpanDictionary`, `LiveSpanPoint`, [LiveSpanRing.java](/C:/solutions/moveseye-be-spring-p5/src/main/java/com/dmove/moveseye/premium/apm/overview/live/spans/LiveSpanRing.java), `LiveSpanStats`, `LiveSpanStorageProperties` |
| 수정 main — `collector/ingest/live/` | `LiveDedupIndex`, `LiveIngestCounters`, `LiveIngestException`, `LiveIngestGuardFilter`, `LiveSpanAdmission`, `LiveSpanIngestor` |
| 수정 main — `core/domain/` | `ApmServiceMetadataChanged` |
| 삭제 main | 임시 `BoundedLiveDedupIndex` — 새 구현으로 교체 |
| 신규 test | `LiveTokenRateLimiterTest`, `LiveSpanMinimumPathTest`, `ArenaLiveDedupIndexTest`, `LiveSpanArenaTest`, `LiveSpanDictionaryTest`, `LiveSpanRingTest` |
| 수정 test | `ApmOtlpLiveControllerTest`, `BoundedLiveDedupIndexTest`, `LiveIngestFailureTest`, `LiveIngestSecurityChainTest`, `LiveIngestSocketTest`, `LiveIngestTestSupport`, `LiveMetadataCacheIT`, `LiveSpanIngestorTest` |

정본과 다른 구현은 다음과 같습니다.

- 링 관련 구현은 정본의 **`overview/live/spans/`로 통일**했습니다.
- 마지막 세그먼트는 산술상 **7,360슬롯**입니다. 정본의 7,040을 보정했습니다.
- 시간 경계 충돌을 방지하려고 **900+7칸**을 사용합니다. 보관 창은 900초이며 추가 예약은 약 **0.193 MiB(산술)**입니다.
- dedup은 초별 open-addressing 대신 **공유 슬롯 풀·체인·샤드별 만료 FIFO**입니다. 키 분포를 모르는 `reserve(int)`에서도 특정 샤드 집중으로 배치 중간에 용량이 부족해지지 않도록 했습니다.
- 사전 회수는 참조 카운트 대신 마지막 관측 이후 910초를 기준으로 보수적으로 처리합니다. ID는 재발급하지 않습니다.
- 인스턴스 64개 초과는 §2.4에 따라 **표시 축소**로 처리합니다. `instanceBudget` 거절 enum은 유지하지만 실제 스팬 거절에는 사용하지 않습니다.
- 신규 토큰은 10개로 시작하고 유휴 시 20개까지 충전합니다. 요청하신 “11번째 429”와 burst 조건을 함께 적용했습니다.

검증 결과는 **[전체 `:test`](/C:/solutions/moveseye-be-spring-p5/build/reports/tests/test/index.html) 3,456건 통과, 실패·오류·건너뜀 0건**입니다. 신규 실행 케이스는 **43건**이며 `dropStatsFlush` 플레이크는 발생하지 않았습니다. `git diff --check`도 통과했습니다.

별도 `-Xmx192m` 단발 프로브에서 측정한 Full GC 후 힙 사용량 증분은 다음과 같습니다. 정밀 객체 그래프 retained heap 측정은 아닙니다.

| 프로브 | 실측 |
|---|---:|
| 200서비스 × 1점/s × 900초, dedup 배열 포함 | 44.49 MiB |
| 1.4M arena 슬롯 할당 | 61.13 MiB |
| 전 슬롯 반납 후 arena 힙 증분 | 61.13 MiB — 고수위 유지 |
| 예약 호출 p99 / 최대 | 0.758ms / 53.710ms |

검수 시에는 **초기 할당을 포함한 예약 호출이 50ms를 넘은 점**, 프로세스 전체에서 route/instance ID가 각각 65,534개 발급되면 이후 `__other__`로 접히는 점, 61초 이후 중복은 재집계될 수 있는 점을 확인해 주세요.

5단계 연결 지점은 `copyBucket()`, `copyDictionary()`, `removalsAfter()`입니다. SSE·snapshot·재생 로그와 해당 저장물의 삭제 처리는 미구현이며, 이번 범위에는 포함하지 않았습니다.
