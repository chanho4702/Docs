**판정: 다음 커밋 승인은 보류합니다.** 6차 지적의 상당 부분이 반영됐지만, checkpoint 저장 실패 시의 부분 커밋, lease 상태 소실 후 seq 재사용, 배치 거부 뒤 자동 재개가 남아 있습니다. 재작성 과정에서 AUTH 정지와 전체 정지의 동시 실행 경계에도 결함이 생겼습니다.

확인한 대상은 `ZM-172`, HEAD `94c9115` 위 **tracked 수정 5개·untracked 파일 20개**입니다. `git diff HEAD`와 untracked 파일을 읽었으며, 코드·문서·Vault는 수정하지 않았습니다. 빌드와 테스트도 재실행하지 않았습니다.

JUnit XML은 **116건, 실패·오류·skip 모두 0**입니다. 기록 시각은 2026-10-23 **05:20 UTC, 14:20 KST**이며 LiveIT 출력에는 PostgreSQL 16.15가 확인됩니다. 아래 재현은 모두 **정적 코드 경로 추적**입니다.

좌표를 줄이기 위해 다음 약칭을 사용합니다. `R:483`은 `CollectorRuntime.java`의 483행을 뜻합니다.

| 약칭 | 파일 |
|---|---|
| R | [runtime/CollectorRuntime.java](C:/worktrees/zm-172-be/src/main/java/com/dmove/moveseye/premium/dbm/collector/core/runtime/CollectorRuntime.java) |
| W | [local/InMemoryBatchWriter.java](C:/worktrees/zm-172-be/src/main/java/com/dmove/moveseye/premium/dbm/collector/core/local/InMemoryBatchWriter.java) |
| L | [local/InMemoryLeaseClient.java](C:/worktrees/zm-172-be/src/main/java/com/dmove/moveseye/premium/dbm/collector/core/local/InMemoryLeaseClient.java) |
| F | [local/FileCheckpointStore.java](C:/worktrees/zm-172-be/src/main/java/com/dmove/moveseye/premium/dbm/collector/core/local/FileCheckpointStore.java) |
| B | [spi/BatchWriter.java](C:/worktrees/zm-172-be/src/main/java/com/dmove/moveseye/premium/dbm/collector/core/spi/BatchWriter.java) |
| A | [runtime/EngineAdapter.java](C:/worktrees/zm-172-be/src/main/java/com/dmove/moveseye/premium/dbm/collector/core/runtime/EngineAdapter.java) |
| T | [runtime/CollectorRuntimeTest.java](C:/worktrees/zm-172-be/src/test/java/com/dmove/moveseye/premium/dbm/collector/core/runtime/CollectorRuntimeTest.java) |
| K | [contract_db-monitoring.md](C:/solutions/_workspace/features/premium/db-monitoring/contract_db-monitoring.md) |
| D | [devdesign_db-monitoring.md](C:/solutions/_workspace/features/premium/db-monitoring/devdesign_db-monitoring.md) |

**1. 6차 🔴 1~18 판정**

‘부분 해소’에는 구현 결함이 남은 경우와, 구현 전 게이트로 명시했지만 계약 충돌 자체는 닫지 않은 경우가 포함됩니다. 현재 커밋을 차단하는 실행 결함은 뒤의 N 번호로 구분했습니다.

| 6차 # | 판정 | 근거(파일:행) | 남은 조치 |
|---|---|---|---|
| 1 | **부분 해소** | R:407·413·483에서 다음 checkpoint를 writer에 전달한다. 그러나 W:72·73에서 `seen`·`accepted`를 변경한 뒤 W:75의 `checkpoints.save()`가 실패하면 앞의 변경이 남는다. | **N1** 해결. 호출을 하나로 묶는 것과 실제 원자 커밋을 구별해야 한다. K:71의 “RETRY_LATER → checkpoint 비전진”도 커밋 후 예외와 구분. |
| 2 | **해소** | R:381·383에서 previous 존재 여부와 `pollerRunId`/옵션을 검사한다. A:19·20에 baseline 의무가 명시됐다. D:309도 J1 기본 off·J2 증명된 구성만 on으로 개정됐다. | J2의 실제 durable 복구 증명은 여전히 R11 게이트다. 현재 옵션 시험은 옵션 분기만 증명한다. |
| 3 | **부분 해소** | 접속·채집·writer는 대상 잠금 밖이다(R:345·350·385·483). 다만 `prepare()`의 잠금 안에서 `secrets.resolve()`가 호출된다(R:253·259·289). 파일 저장은 writer·lease 서버의 전역 잠금을 잡은 채 실행된다(W:47·54·75, F:106). | 느린 SQL 격리는 해결됐다. 외부 I/O까지 포함한 “짧은 잠금·비블로킹” 주장은 좁혀야 한다. secret 조회를 잠금 밖으로 옮기고, 파일 I/O가 모든 lease 갱신을 붙잡는 구조를 보완. |
| 4 | **부분 해소** | L:109의 `commitIfHeld`는 유효기간·token·generation 검증과 저장을 같은 임계 구역에 둔다. R:471도 쓰기 직전 시각을 다시 읽는다. 그러나 prepare에는 tick 시작의 오래된 wall/mono가 전달된다(R:156·157·181·267). | 쓰기 fencing은 개선됐다. **N7**의 만료 후 신규 접속·폴링 경로를 닫아야 한다. |
| 5 | **해소했지만 새 결함** | AUTH 정지·자격증명 버전 변경 재개·접속 장애 백오프가 생겼다(R:282·353·356·553). 그러나 AUTH 정지를 `failAll()` 완료 뒤에 설정한다(R:353~358). | **N5** 해결. AUTH를 인지한 즉시 정지 상태를 게시하고 이후 접속 시작을 차단. |
| 6 | **부분 해소** | 직접적인 release 예외에서는 `dropping=false`로 돌리고 상태를 보존한다(R:588~593). 그러나 갱신 실패로 `st.lease=null`이 된 뒤 drop하면 서버 lease를 반납하지 않고 상태를 제거한다(R:324·583·585·600). | **N3** 해결. “실행용 lease 없음”과 “서버 소유권이 확실히 없음”을 분리. |
| 7 | **해소** | D:283~290에 필드·만료 경계·동일 run 재요청·SET 증가/RETURNING·원자 쓰기 규칙이 반영됐다. L:57~83·131은 이에 부합한다. | 실제 PG SQL 구현 검증은 WS-2 이월. `reassign` 이후 옛 generation의 renew 거부는 의도대로다. |
| 8 | **부분 해소** | VERSION/SCHEMA의 halt와 LICENSE/FEATURE/TOKEN의 denial 분기가 생겼다(R:528~538). 하지만 사유 없는 영구 거부는 계속하며(R:540·541), 전체 정지의 지속·동시 실행 차단도 불완전하다. | **N4·N6·N8** 해결. |
| 9 | **부분 해소** | K:73·222·228에 배치/envelope 거부가 명시됐다. 런타임도 처리하지만 다음 허용 스냅샷에서 denial을 무조건 지운다(R:169). | 계약의 배제 오류는 해소됐다. **N4** 때문에 런타임 중단은 유지되지 않는다. |
| 10 | **해소** | B:153~167에 사유가 분리됐고, R:517은 IDEMPOTENCY를 격리하며 R:523의 소유권 상실과 구별한다. | 결과를 현재 lease 상태에 반영할 때 실행 세대를 검증하는 **N15**는 별도 보완 필요. |
| 11 | **부분 해소** | W:69가 payload를 비교하지만 `Objects.hash`의 **32비트 값만** 보관한다. 서로 다른 정상 문자열 payload가 같은 hash를 만들 수 있다. | **N2** 해결. 현재 구현도 다른 payload를 DUPLICATE로 ACK할 수 있다. |
| 12 | **부분 해소** | F:106의 `force(true)`, F:109의 원자 교체, F:110의 미지원 예외는 반영됐다. F:33은 디렉터리 엔트리 내구성을 보장 밖으로 남긴다. | 정상 저장과 원자 이동 미지원 처리는 개선됐다. 시스템 장애 후 내구성·열린 핸들·실패 복구는 미확인. 완전한 durable 증명으로 표기하면 안 된다. |
| 13 | **해소** | F:153~183의 본문 CRC·count·키 검증이 부분 파일과 숫자 변조를 걸러낸다. A:20은 필수 기준값 누락 시 baseline을 요구하고 T:100~102도 이를 따른다. | 손상 **탐지 이후 경보 연결**은 #27의 잔여 사항이다. |
| 14 | **해소했지만 새 결함** | R:373에서 kind별 시작 시각을 capture한다. 그러나 R:410~412의 override는 보정 시각만 바꾸고 raw·offset을 그대로 둔다. | **N9** 해결. 정상 경로의 관측 경계는 개선됐지만 override 경로의 Meta가 불일치한다. |
| 15 | **해소** | B:106에 status·elapsedMs가 추가됐고 K:90은 P1a 부분 모델임을 명시한다. baseline도 PARTIAL/BASELINE으로 표현한다(B:122). | WS-6 세부 품질 축과 SKIPPED 배치 생성 정책은 명시된 후속 범위로 유지. |
| 16 | **부분 해소** | K:12·26에서 관리/J2 규약이 분리됐고, K:226·232에서 jobs=config 및 Job 요청 schema가 정렬됐다. | K:230의 `result`와 K:232의 종류별 `params`는 여전히 자유형이다. 최소 성공/실패·결과 판별자·종류별 결과 shape를 정의해야 “result schema 완료”라고 할 수 있다. |
| 17 | **부분 해소** | K:142에 오래된 카운터 폐기와 독립 손실 메타가 반영됐다. | LOCK만으로 상한을 넘거나, 카운터를 모두 폐기해도 LOCK이 상한을 넘는 경우의 마지막 동작이 없다. 추가 폐기 또는 admission 중단·손실 기록을 정의해야 한다. |
| 18 | **부분 해소** | K:146·276은 미결을 명시한다. 하지만 D:189는 raw 48h를 EXPIRED 예로 유지하고 D:198은 여전히 1m 30일을 확정 문구로 적는다. | 잘못된 확정은 계약에서 철회됐지만 설계 충돌은 미해소다. 또한 K:146의 “활동·metric·Q 1m 7일”은 활동 1m **30일**인 D:384와 새로 어긋난다. |

**2. 6차 🟡 19~35 판정**

| 6차 # | 판정 | 근거(파일:행) | 남은 조치 |
|---|---|---|---|
| 19 | **해소** | R:457~461이 채집 오류를 갱신하고, ACCEPTED는 `lastWriteError`만 지운다(R:495). SQL 예외도 FAILED 경로를 통과한다(R:390~399). | 채집 성공과 저장 성공의 분리는 반영됐다. |
| 20 | **해소** | 갱신 간격 R:319, due R:273·655, 백오프 R:557은 monotonic이다. `validAt` 비교 R:305·471만 wall을 사용한다. `ManualClock`도 둘을 분리했다. | 오래된 tick 시각 재사용은 **N7**로 별도 판정. 시계 종류 선택 자체는 맞다. |
| 21 | **미해소 — 명시적 이월** | `ConnectionProvider.java:12·31`은 여전히 tick마다 물리 접속을 만든다. 전용 풀 이월이 명시돼 있다. | 풀·credential version별 재생성·접속 예산 검증은 후속 게이트. 현재 시험으로 접속 비용을 증명하지 않는다. |
| 22 | **부분 해소** | 부정확한 close 설명은 제거됐고 R:424에서 `closeFailures`를 센다. 그러나 이 필드는 R:628에만 있으며 `RuntimeStatus.TargetStatus`에 노출되지 않는다. | 외부 계층이 집계·경보할 통로가 없다. 상태/진단 sink에 노출하고 provider의 invalidation/abort 책임을 정의. |
| 23 | **부분 해소** | R:386이 같은 policy를 어댑터에 전달하고 R:478이 그 버전을 붙인다. 그러나 `ConfigSource.Policy:41~48`은 `approvedTagKeys`를 복사하지 않는다. | **N12** 해결. 같은 참조를 넘기는 것은 불변 스냅샷 보장과 다르다. |
| 24 | **부분 해소 — 설계 이월** | A:40·41과 K:125에 kind당 Map checkpoint·WS-3 이월이 명시됐다. | native별 키·reset·quota 규약은 아직 없다. D:315·316의 native별 계약을 충족한 것으로 표시하면 안 된다. |
| 25 | **해소 — 지정된 null 경로** | null Collected는 R:387에서 채집 try 안에서 검사된다. null quality는 A:67에서 거부돼 R:397로 처리된다. B:55도 방어한다. | 다른 잘못된 반환 모델은 **N14** 참조. |
| 26 | **해소** | F:196~221이 복합 키 구성요소의 SHA-256 기반 파일명을 사용한다. `a/b`와 `a?b`의 덮어쓰기 회귀 시험도 있다. | 파일명으로 안전 문자를 치환하던 충돌은 해소됐다. |
| 27 | **부분 해소** | F:50·68·75·81에서 MISSING/CORRUPT/UNAVAILABLE/PRESENT를 구분한다. 하지만 R:381은 Optional만 읽는다. `lastLoadState` 소비자는 현재 테스트뿐이다. | 손상·I/O 불가를 운영 상태나 경보로 전달하는 주체가 없다. “바깥이 경보한다”는 F:39는 아직 구현되지 않았다. |
| 28 | **부분 해소** | ACK별 카운터는 분리됐다(R:493~507). FAILED 배치를 accepted에도 세는 것은 `TickReport.java:9`와 T:557에 명시된 의도다. 다만 배치 denial도 최종 report의 denied는 false다(R:203). token 상실의 로컬 차단 R:467은 fenced에도 집계되지 않는다. | **N4**의 report 오류와 로컬 소유권 상실 집계를 보완. `failedWrite` Javadoc도 실제 중단형 REJECTED·IDEMPOTENCY 집계와 맞출 것. |
| 29 | **부분 해소** | LONG_TTL 제거, 실제 동시 레인, 지속되는 서버/writer를 쓴 재시작 시험은 확인된다(T:223·439·684). K:238은 실측 범위를 좁혔다. | checkpoint save 실패·crash는 시험하지 않는다. runtime DUPLICATE/EXPIRED 집계, 모든 REJECTED 사유, AUTH 동시성도 단언하지 않는다. “제어 규칙 통과”의 범위를 더 좁혀야 한다. |
| 30 | **해소** | `PgCapabilityCheckerLiveIT.java:87~94`가 nomon의 S·L·Q·C·P와 필수 미충족을 모두 단언한다. XML도 해당 시험 통과를 기록한다. | 없음. |
| 31 | **부분 해소** | `PgLiveEnvironmentGateTest.java:14~23`은 전체 테스트 실행 시 required 누락을 실패시킨다. 그러나 문서의 실행 명령은 LiveIT만 선택한다(`env_p0-test-db.md:65`). | **N13** 해결. 그 명령에 REQUIRED를 추가해도 별도 GateTest는 실행되지 않는다. |
| 32 | **해소** | `PgCapabilityCheckerLiveIT.java:99~104`의 `open` helper가 성공·실패 모두 spec을 wipe한다. | 지정된 직접 open 경로는 보완됐다. |
| 33 | **해소** | `env_p0-test-db.md:5`에 파일·Docker 환경 설정의 잔존 범위가 명시됐고, 28~54행에 생성·로드·역할 갱신 절차가 있다. | 실제 스크래치패드 스크립트와의 일치 여부는 미확인. 문서만으로 보이던 변수 생성 누락은 해소됐다. |
| 34 | **부분 해소** | 계약은 v2.3·3분류·올바른 enum/메시지로 정리됐다(K:4·5·87·185). 하지만 설계 상태는 여전히 v2.2다(D:4). AUTH의 “수동 재개”(D:275)도 자동 버전 재개 구현과 다르다. | 상태 문구·AUTH 재개 정책·보존 창을 정렬. K:150~152의 `[구현]`은 RuntimeStatus 모델과 아직 없는 status EP 구현을 구분해야 한다. |
| 35 | **해소** | K:41, D:321, B:20~22, R:479가 모두 대상·epoch 전체 seq를 따른다. | kind별 연속 seq를 요구하지 않는다는 설명도 반영됐다. |

[검수 반영표](C:/solutions/_workspace/features/premium/db-monitoring/review_db-monitoring-design.md:283)의 **“전건 반영”은 수정 위치를 기록한 의미로만 유효**합니다. 위 잔여 경로까지 해소됐다는 판정으로 사용할 수는 없습니다.

**3. 새로 확인한 결함·수정 과정에서 남은 재발 경로**

N1~N3처럼 기존 지적과 같은 결과를 내는 **새로 확인된 실패 경로**도 함께 기재했습니다.

| # | 심각도 | 파일:행 | 지적 | 재현 | 고칠 코드(핵심만) |
|---|---|---|---|---|---|
| N1 | 🔴 | W:72~75, R:487~489 | **checkpoint save 실패가 배치 수락을 롤백하지 않는다.** | 기준값 1000 → Δ100 배치에서 `save()` 예외 → 배치는 accepted에 남고 checkpoint는 1000 → 다음 성공 관측 1150이 Δ150 적재 → 합 250. `failNextAfterCommit` 시험은 이 경로를 다루지 않는다. | 메모리 영수증·배치·checkpoint를 함께 publish하는 트랜잭션 모델을 사용. 실패 시 전체 미반영을 보장. **단순 순서 교환만으로 파일 crash 원자성까지 해결됐다고 하면 안 된다.** |
| N2 | 🔴 | W:69·79 | **32비트 hash 충돌을 payload 동일성으로 취급한다.** | 동일 배치 키에서 rows를 `{"x":"Aa"}`와 `{"x":"BB"}`로 바꾼다. Java 문자열 hash가 둘 다 2112이므로 Map/List와 최종 `Objects.hash`도 같다. 다른 내용이 DUPLICATE다. | 불변 payload의 실제 동등성을 비교하거나, canonical 직렬화의 SHA-256 같은 충돌 저항적 digest를 사용. |
| N3 | 🔴 | R:320~325·583~600 | **갱신 일시 실패 뒤 drop이 살아 있는 서버 lease와 seq 이력을 버린다.** | FAST에서 epoch 1의 seq 0·1 적재 → 10초에 renew 일시 실패, 로컬 lease=null → TTL 안에 disabled tick → drop이 release 없이 상태 제거 → enabled → 서버가 같은 owner/run에 epoch 1 반환 → 새 상태가 seq 0부터 재사용. | 활성 lease와 **반납/정리해야 할 마지막 소유권**을 별도로 보존. 서버 소유권 상실이 확정되기 전 epoch·seq tombstone을 제거하지 말 것. |
| N4 | 🔴 | R:159~169·203·535~538 | **배치 거부 상태가 다음 tick에서 자동 해제된다.** | config는 허용 스냅샷 그대로 둔다. writer가 FEATURE_DENIED/TOKEN_REVOKED를 반환하면 lease를 반납하지만, 다음 tick이 R:169에서 denial을 지우고 재획득·접속한다. 해당 거부 tick의 `TickReport.denied`도 false다. | 배치 거부를 유지하는 상태와 명시적 재허용 조건을 둔다. 캐시된 허용 config만으로 해제하지 말 것. 최종 report에도 실제 denial을 반영. |
| N5 | 🔴 | R:353~358·345~350 | **AUTH 인지 후 정지 게시 전 새 접속이 가능하다.** | FAST open이 AUTH 실패 → `failAll`의 writer를 지연 → 이 사이 SLOW tick은 suspended=null을 보고 새 open 수행. 이미 인증 실패를 알았는데도 계정을 다시 두드린다. | AUTH 실패를 받은 즉시 잠금 안에서 정지를 게시한 뒤 FAILED 배치를 기록. 준비된 작업도 open 직전 현재 정지/자격증명 세대를 재검증. |
| N6 | 🔴 | R:159·173~195·336·456 | **진행 중인 다른 tick이 전체 정지 이후 새 대상 lease를 만들 수 있다.** | SLOW가 허용 스냅샷을 읽고 A 채집에서 대기 → FAST가 VERSION_MISMATCH로 halt·releaseAll → SLOW가 돌아와 A는 dropped로 중단하지만, 바깥 루프는 계속 B 상태를 만들고 acquire/open/collect한다. | 전역 실행 세대를 두고 prepare/open/write 경계에서 검증. halt/denial 이후에는 오래된 tick이 새 대상 처리를 시작하지 못하게 할 것. |
| N7 | 🔴 | R:156~157·181·252·267·350 | **앞 대상 지연 때문에 만료된 lease로 신규 DB 폴링을 시작한다.** | 이전 tick에서 A·B lease 확보 → 다음 tick 시작 시 B lease는 유효 → A 처리 중 서버 시간이 TTL 밖으로 진행 → B의 prepare는 tick 시작 wall/mono로 유효하다고 판단 → open·SQL 수행. 쓰기 단계에서야 만료를 막는다. | 대상 prepare마다 현재 mono/wall을 읽고, 긴 준비 이후 open/다음 수집 시작에도 실행 허가를 확인. 적재 차단과 폴링 정지를 모두 보장. |
| N8 | 🔴 | B:148·170, R:528~541, K:74 | **사유 없는 REJECTED의 “계속”이 설계 근거 없이 남았다.** | `WriteResult.of(REJECTED)`는 합법적으로 생성되고, 런타임은 다음 kind와 다음 tick을 계속한다. 설계 §3.6에는 이에 대응하는 배치 한정 영구 거부 사례가 없다. | REJECTED에 유효한 reason을 필수화. 누락/잘못된 조합은 프로토콜 오류로 정지·진단. 배치 한정 거부가 필요하면 구체 사유와 checkpoint/손실 정책부터 정의. |
| N9 | 🟡 | R:407~412, A:62 | **관측 시각 override가 raw·offset·checkpoint 시각과 불일치한다.** | capture가 `(now=1000, raw=1000, offset=0)`인데 어댑터가 2000을 반환하면 Meta는 `(observed=2000, raw=1000, offset=0)`이다. checkpoint에는 여전히 1000을 저장한다. | 완전한 시계 스냅샷을 반환하게 하거나, DB 보고 시각을 별도 필드로 분리. 단일 epoch 값으로 보정 시각만 덮어쓰지 말 것. |
| N10 | 🟡 | R:368~370·510~513·553 | **writer 연속 실패의 지수 백오프가 계속 5초로 리셋된다.** | DB 접속은 성공하지만 writer가 매번 BE_BUSY → open 성공 때 `consecutiveFailures=0` → writer 실패마다 다시 첫 실패 → 5초 반복. | 접속 실패와 writer 실패의 연속 횟수/리셋 조건을 분리. writer 백오프는 쓰기 성공에 의해 리셋. |
| N11 | 🟡 | R:237·240·634 | **RuntimeStatus가 정상 상태에도 거대한 백오프를 표시한다.** 또한 만료 lease를 leased=true로 보일 수 있다. | 초기 `backoffUntilMono=Long.MIN_VALUE`에서 양수 mono를 빼면 overflow해 큰 양수가 된다. AUTH 정지 중에는 prepare가 lease 검증 전에 반환하므로 만료된 `st.lease`도 status에서 계속 true다. | sentinel을 먼저 검사해 0 반환. `leased`의 뜻을 명확히 하고 유효기간까지 검사하거나 로컬 보유/유효 상태를 분리. |
| N12 | 🟡 | `ConfigSource.java:41~48`, R:386·478 | **정책 스냅샷의 Set이 변경 가능하다.** | mutable Set으로 Policy 생성 → snapshot 배포 뒤 원본 Set 변경 → policyVersion은 같지만 어댑터의 승인 태그 정책은 바뀐다. | Policy 생성자에서 `Set.copyOf`로 방어 복사하고 null 정책을 정의. |
| N13 | 🟡 | `PgLiveEnvironmentGateTest.java:14`, `PgCapabilityCheckerLiveIT.java:29`, `env_p0-test-db.md:65·70` | **문서의 REQUIRED 실행 명령이 게이트를 선택하지 않는다.** | DBM_IT_PG_REQUIRED=true, PORT 없음, 문서대로 `--tests ...PgCapabilityCheckerLiveIT` 실행 → LiveIT 클래스 skip, 별도 GateTest 제외 → required가 실패를 만들지 못한다. | required 검사를 LiveIT의 실행 경로에 통합하거나, 문서/게이트 명령에서 두 클래스를 함께 선택. |
| N14 | 🟡 | A:64~71, R:405~413·477·492, B:58·135 | **반환 모델의 나머지 불변식은 검증되지 않는다.** | FAILED quality와 checkpointValues를 함께 반환하면 checkpoint가 전진한다. row Map에 null 값이 있으면 Batch 생성이 채집 try 밖에서 예외를 내 tick을 탈출한다. null status의 WriteResult도 switch에서 탈출한다. | FAILED/SKIPPED의 checkpoint 금지 등 반환값 검증을 채집 경계 안에 둔다. rows의 null 표현 정책과 WriteResult의 status/reason 불변식을 명시·강제. |
| N15 | 🟡 | R:491~525 | **늦게 도착한 옛 쓰기 결과가 새 lease 상태를 덮는다.** | token 1 쓰기 응답 지연 → 다른 레인이 epoch/token 2 획득 → 옛 쓰기의 CONFLICT 반환 → R:523이 token 2의 `st.lease`까지 null로 만든다. 이후 drop과 결합하면 N3의 이력 소실이 재발할 수 있다. | 결과 반영 전에 예약 당시 epoch/token/상태 세대가 현재 상태와 같은지 확인. 옛 결과는 해당 시도의 진단만 반영. |
| N16 | 🟡 | R:159~160·190~191·588~593 | **halt 시 release 실패의 “다음 tick 재시도”가 실행되지 않는다.** | VERSION_MISMATCH → halt 설정 → release 예외로 상태 보존 → 이후 tick은 시작 즉시 반환하므로 release 재시도 없음. 서버 TTL까지 소유권이 남는다. | 정지된 tick도 pending release 정리를 수행하거나 별도 정리 경로를 둔다. 반납 실패 재시도 보장을 Javadoc과 일치시킬 것. |

**4. 중점 항목에 대한 추가 판정**

**커밋 뒤 ACK 유실 자체와 다른 레인의 seq 소비는 현재 시험 조건에서 안전합니다.** `failNextAfterCommit`은 checkpoint 저장까지 끝낸 후 예외를 던집니다(W:60~62). 이후 다른 레인이 SESSION/LOCK을 쓰며 seq를 소비해도 QUERY_STAT checkpoint와 충돌하지 않습니다. 레인별 단일 실행이라는 현재 계약에서 다음 Q 관측은 갱신된 checkpoint를 읽고, seq의 공백이나 kind 사이의 섞임은 허용됩니다.

따라서 `ackLostAfterCommitDoesNotDoubleCount`의 **150 검증은 유효**합니다. 다만 이것이 **checkpoint 저장 도중 실패도 원자적이라는 증거는 아닙니다.** N1은 그 별도 경로입니다.

J1 PG writer에 요구한 **fencing 검사·배치 INSERT·checkpoint UPSERT의 동일 트랜잭션 경계는 B:12~17, D:289에 충분히 적혀 있습니다.** 실제 구현에서는 소유권 검사와 적재 사이에 인계가 끼어들지 않도록 행 잠금 또는 동등한 원자적 SQL을 사용해야 합니다. PG writer가 아직 없어 그 준수 여부는 **미확인**입니다. 커밋 결과가 불확실한 예외를 일반적인 “확정 미커밋 RETRY_LATER”와 동일하게 설명하는 문구는 정정해야 합니다.

**연속성의 정상·손상 분기는 맞습니다.** 같은 run에서도 boot epoch가 바뀌면 checkpoint 키가 달라져 previous가 empty이고 continuity는 false입니다. `resumeAcrossRuns=true`여도 손상 파일은 empty이므로 같은 결과가 됩니다. 어댑터가 A:19~20의 의무를 따르면 baseline/partial로 복구합니다. 다만 “J2는 증명된 구성에서만”이라는 문구는 사용 조건이며, 현재 boolean 옵션이나 메모리 시험이 durable 증명을 수행하는 것은 아닙니다. 실제 journal 복구·crash 시험을 통과한 조립 구성에만 옵션을 허용하는 게이트가 필요합니다.

**현재 내장 구현의 잠금 순서에서 데드락은 확인하지 못했습니다.** writer는 `writer → lease → checkpoint` 순서로 잠급니다. runtime의 prepare는 `TargetState → lease`를 사용하지만, writer 결과를 반영하는 TargetState 잠금은 writer 호출이 끝난 뒤 획득합니다. 현재 lease 메서드나 checkpoint 구현에 `lease → writer 잠금 획득`의 역방향 경로는 없습니다.

다만 **데드락이 없다는 것과 레인 격리가 완전하다는 것은 다릅니다.** 파일 checkpoint의 `force`·move가 실행되는 동안 writer와 lease 서버의 전역 잠금이 유지됩니다. 그 사이 다른 레인의 writer 호출과 lease 갱신이 기다립니다. `tryAutoResume`의 secret 조회도 TargetState 잠금 안입니다. T:439의 시험은 **slow collect가 fast를 막지 않음**을 증명하며, 이 I/O 지연까지 증명하지 않습니다.

**TargetState의 일반적인 필드 가시성 위반은 확인하지 못했습니다.** 변경 가능한 필드의 주요 접근은 `synchronized(st)` 아래 있고, `Prepared`와 Lease는 불변 record입니다. R:467은 객체 동일성이 아닌 fencingToken을 비교하므로 **동일 token으로 갱신된 lease를 잘못 거부하지 않습니다.** 문제는 N15처럼 *옛 비동기 결과를 어느 상태에 적용하느냐*입니다.

**직접적인 drop 수정은 타당합니다.** release 실패 시 `dropping=false`로 되돌리므로 재활성화된 대상이 영구히 skip되지는 않습니다. `dropped` 표시 후 `states.remove(uid, st)`를 사용하는 것도 새 상태를 무조건 제거하는 문제를 피합니다. disabled 대상이 같은 tick의 stale 정리에서 다시 drop되는 경우도 성공했다면 no-op이고, 실패했다면 재시도가 됩니다. 남은 핵심은 **drop에 들어오기 전에 서버 소유권 참조를 잃는 N3**입니다.

`RELEASE_ALL`·`HALT` 뒤 stale 루프를 건너뛰는 것은 그 직전에 `releaseAll()`을 호출하므로 그 자체로 결함은 아닙니다. 실패 상태는 보존됩니다. 다만 **halt에서는 다음 tick이 정리까지 건너뛰는 N16**, 다른 실행 중 tick이 상태를 다시 만드는 **N6**가 남습니다.

**파일 검증은 정상적인 부분 손상을 잡습니다.** CRC는 마지막 `crc32=` 줄을 제외한 본문 전체를 대상으로 하고, count는 파싱된 값 개수와 비교합니다. `Files.exists` 뒤 외부 삭제가 발생하면 IOException을 잡아 UNAVAILABLE로 반환하므로 tick을 즉시 탈출하지는 않습니다. 이 경우 MISSING과의 분류는 부정확하지만 정상 checkpoint로 오독하지 않습니다.

`.tmp`는 정상 save 실패 시 삭제를 시도하고, crash 잔존물은 다음 save에서 덮습니다. load는 `.ckpt`만 읽으므로 임시 파일을 정상 데이터로 읽지는 않습니다. **시작 시 잔존물 정리·복구, 열린 핸들, 원자 이동 미지원 시험은 현재 테스트에 없습니다.** `lastLoadState`가 생겼어도 이를 운영 경보로 소비하는 구현 역시 없습니다.

**failAll의 단일 관측 시각은 허용 가능합니다.** 여러 SQL 관측이 아니라 하나의 접속 실패 사건을 due kind들에 기록하므로 같은 시각을 쓰는 것이 자연스럽습니다. 반면 성공 채집에서 보정 시각만 교체하는 override는 N9처럼 메타데이터의 자기 일관성을 깨뜨립니다.

`Lane.intervalMs=0`은 해당 kind를 실제로 건너뜁니다. 기존 `nextDueMono` 항목은 지우지 않으므로 잠깐 비활성화했다 재활성화하거나 주기를 단축하면 **이전 예정 시각까지 기다릴 수는 있습니다.** 유한한 시각이라 영구 정지는 아니지만, 설정 변경 즉시 재스케줄을 기대한다면 설정 버전/주기 변경 때 due를 다시 계산해야 합니다. 현재 시험은 처음부터 0인 경우만 확인합니다.

자격증명은 **버전을 올리지 않고 비밀번호만 바꾸면 AUTH 정지가 자동 해제되지 않습니다.** 이는 현재 구현과 일치하는 운영 조건입니다. 자격증명 저장의 `credentialVersion++`를 보장하거나 관리자가 `resume`해야 하며, 이 조건을 운영 절차에 명시해야 합니다.

**5. 커밋 가능 여부와 처리 순서**

**현재 작업 트리 전체의 커밋 승인은 보류합니다.** 실행 결함 기준의 차단 항목은 다음과 같습니다.

| 우선순위 | 6차 번호 / 새 번호 | 차단 이유 | 수정 중심 |
|---|---|---|---|
| 1 | **#1 / N1** | 실제 이중 집계 가능 | W의 부분 publish 제거, checkpoint 저장 실패 시험 |
| 2 | **#6 / N3** | 같은 epoch·seq 재사용 가능 | R의 소유권 참조·seq 상태 수명 |
| 3 | **#11 / N2** | 다른 payload를 DUPLICATE로 ACK | W의 payload 비교 |
| 4 | **#8·#9 / N4·N6·N8** | 전체 거부·정지와 영구 거부 정책 불완전 | R의 지속 상태·실행 세대 검사, B의 결과 불변식 |
| 5 | **#5 / N5** | AUTH 실패 인지 후 추가 접속 가능 | R의 정지 게시 시점·open 직전 검사 |
| 6 | **#4 / N7** | 만료된 허가로 신규 DB 폴링 가능 | R의 대상별 현재 시각·실행 허가 검사 |

그다음 관측 Meta, 백오프, 상태값, 정책 불변성, required 실행 경로를 보완하고 계약·설계·반영표를 실제 상태로 정렬하는 순서가 적절합니다.

풀·native checkpoint 규약·실제 PG HA·디스크 큐를 이번 커밋에서 모두 완성할 필요는 없습니다. 다만 현재 런타임에서 재현 가능한 위 🔴 경로는 먼저 닫아야 합니다. **116건 통과 기록은 확인됐지만, 해당 경로들을 단언하는 시험이 없어 현재 커밋의 승인 근거로는 충분하지 않습니다.**