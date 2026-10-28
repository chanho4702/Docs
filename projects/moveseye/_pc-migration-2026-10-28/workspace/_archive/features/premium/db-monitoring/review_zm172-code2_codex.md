**판정: 현재 작업 트리의 다음 커밋 승인은 보류합니다.** 배치 저장과 checkpoint 전진 사이에서 실제 이중 집계가 가능하고, fast/slow 격리와 재시작 baseline 동작이 설계와 다릅니다. 공통 계약 시험본에도 J2가 잘못 구현할 수 있는 오류 분류·중단 정책 충돌이 있습니다.

확인 범위는 브랜치 `ZM-172`, HEAD `94c9115` 위의 tracked 수정 2개와 untracked Java 파일 19개입니다. `git status --short`, `git diff HEAD`, 지정 문서·이전 5차 검수 결과를 대조했습니다. 코드·문서·경험 Vault는 수정하지 않았습니다.

빌드·테스트는 재실행하지 않았습니다. 기존 JUnit XML에는 runtime 9건, local 4건, LiveIT 3건, ArchUnit 2건이 모두 실패·skip 0으로 기록되어 있습니다. 아래 재현은 별도 표시가 없으면 **현재 코드의 정적 경로 추적**입니다.

표의 Java 파일은 `src/main/java/com/dmove/moveseye/premium/dbm/collector/core/` 기준이며, 테스트는 대응하는 `src/test/java/` 경로입니다.

**1. 검수 결과 — 🔴 수정 후 재검수 필요**

| # | 심각도 | 파일:행 또는 문서 § | 지적 | 재현/근거 | 고칠 코드·문구(핵심만) |
|---|---|---|---|---|---|
| 1 | 🔴 | `runtime/CollectorRuntime.java:323,331,369`; `spi/CheckpointStore.java:12`; 계약 §1.7 | **배치 저장과 checkpoint 저장이 분리되어 이중 집계가 가능하다.** 5차 #22가 실제 실행 경로의 결함으로 올라왔다. | `writer.write()` 성공 뒤 `checkpoints.save()` 실패·프로세스 종료 시, 다음 관측은 옛 기준값에서 델타를 다시 계산한다. 새 seq 또는 새 epoch라 서버의 DUPLICATE 검사로 제거되지 않는다. 아래 수치 재현 참조. | J1은 fencing 검사·배치 INSERT·checkpoint UPSERT를 같은 PG 트랜잭션으로 묶는다. J2는 **큐 append와 checkpoint 전진**을 하나의 durable commit으로 묶는다. 현재 `write(batch)` 후 `save(checkpoint)` 구조부터 변경. |
| 2 | 🔴 | `runtime/CollectorRuntime.java:266`; `runtime/EngineAdapter.java:15`; `CollectorRuntimeTest.java:174`; 설계 §5.4·§17.1 R8 | **재시작·노드 인계 뒤 baseline 규칙이 다르다.** | 설계 §5.4는 BE 재시작·인계 후 첫 관측을 기준값으로만 저장하고 partial 표시하도록 한다. 런타임은 `Checkpoint.pollerRunId`를 검사하지 않고 이전 checkpoint를 그대로 전달한다. 테스트는 새 run에서도 Δ10 적재를 정답으로 고정했다. | J1의 run 변경·인계 첫 관측에 baseline/partial을 적용한다. J2의 정상 복구 후 이어 쓰기는 원자적 journal 복구가 증명된 조건으로 별도 명시. 어댑터 책임이라는 설명만으로 현재 차이를 해소할 수 없다. |
| 3 | 🔴 | `runtime/CollectorRuntime.java:130,146`; 설계 §5.1 | **fast/slow 레인이 서로 블로킹한다.** | 동일 대상의 `synchronized(st)`를 접속·모든 SQL·writer·checkpoint 저장·close까지 유지한다. slow Q가 8초 걸리면 fast 세션 수집과 lease 갱신도 그만큼 기다린다. 설계의 “서로 블로킹 안 함”과 정면 충돌한다. | 대상 공통 잠금은 lease·seq 예약 등 짧은 상태 변경에 제한한다. 레인별 실행 상태·접속·checkpoint 처리를 분리하고, 쓰기 시 fencing으로 소유권을 재검증한다. |
| 4 | 🔴 | `runtime/CollectorRuntime.java:108,132,259`; `local/InMemoryLeaseClient.java:90`; `local/InMemoryBatchWriter.java:42` | **현재 메모리 조합으로는 만료 후 차단·인계와 쓰기의 원자성을 증명하지 못한다.** | `now`가 tick 시작에 고정되어 대기·긴 SQL 뒤에도 재사용된다. `currentToken()`은 만료·release 후에도 token을 반환하며 writer는 token만 비교한다. 또한 token 조회와 `accepted.add()` 사이에 lease 서버의 인계가 끼어들 수 있다. | 실행 직전의 허가 유효성을 다시 확인한다. 메모리 서버도 유효 lease·generation·token 검증과 적재를 하나의 임계 구역으로 모델링한다. PG writer 역시 검증과 저장을 같은 잠금/트랜잭션 경계에 둔다. |
| 5 | 🔴 | `runtime/CollectorRuntime.java:233,247`; 설계 §5.1·§5.8 | **DB 인증 실패 후 재시도를 중단하지 않는다. 대상 장애 백오프도 없다.** | 잘못된 비밀번호는 AUTH FAILED 배치를 만든 뒤 다음 5초 주기에 다시 접속한다. 설계는 계정 잠김 악화 방지를 위해 AUTH에서 중단하고 자격증명 갱신 뒤 수동 재개하도록 한다. 일반 장애의 5s→60s 백오프도 구현되어 있지 않다. | 대상별 `AUTH_FAILED` 정지 상태와 명시적 재개 경로를 둔다. 일반 접속 장애는 대상별 백오프를 적용한다. 이월이라면 현재 프레임이 운영 계약을 충족한다는 표현을 제거하고 구현 게이트를 명시. |
| 6 | 🔴 | `runtime/CollectorRuntime.java:212,219,397` | **release 실패 시 seq 이력을 잃고 같은 epoch에서 0부터 다시 시작할 수 있다.** | `states.remove(uid)` 후 `leases.release()`가 예외를 던지면 상태는 이미 사라졌지만 서버 lease는 살아 있을 수 있다. 재활성화하면 새 `TargetState`가 동일 `(owner, runId)`의 동일 epoch를 받아 seq를 0으로 초기화한다. 동시 tick에서도 remove 후 기존 상태 잠금을 기다리는 사이 새 상태가 생성될 수 있다. | release 결과가 불확실한 동안 epoch·nextSeq를 보존한다. 상태 제거와 재생성을 조정하고, 이전 상태에서 실행 중인 작업이 끝나기 전 같은 UID의 새 상태가 생기지 않게 한다. |
| 7 | 🔴 | `local/InMemoryLeaseClient.java:10,53`; 계약 §1.5; 설계 §5.2 | **“PG 문장과 같은 의미”라는 설명이 사실과 다르다.** | PG 설계 문장은 같은 owner 재획득에서도 token 증가를 의도하지만 메모리 구현은 유효한 동일 `(owner, runId)`에 token·epoch를 유지한다. PG 필드에는 runId·epoch도 명시되어 있지 않다. 만료 경계도 `<`와 `<=`가 다르다. | **설계 §5.2를 고친다.** 아래 B 판정의 획득·갱신·반납 규칙과 필드를 정본으로 삼고 Javadoc의 동등성 주장을 갱신. |
| 8 | 🔴 | 계약 §1.3·§1.6·§3; `runtime/CollectorRuntime.java:341` | **영구 거부의 행동이 설계와 반대다.** | §1.3은 REJECTED에서 “다음 tick 계속”이라고 하지만 설계 §3.6과 계약 §3은 VERSION_MISMATCH·SCHEMA_INVALID에서 중단·알람, FEATURE_DENIED에서 중단·큐 보존을 요구한다. 현재 런타임도 오류 기록만 하고 계속한다. | 결과에 구조화된 사유와 중단 범위를 표현한다. 영구 거부를 단순한 “이번 배치 실패”로 처리하지 말고, 대상/수집기 정지와 큐 보존·격리를 구분한다. |
| 9 | 🔴 | 계약 §1.3의 인증 축 설명; 설계 §3.6 수신 인증·오류 분류 | **TOKEN_INVALID·TOKEN_REVOKED·LICENSE_EXPIRED를 배치 응답에서 배제한 계약이 잘못됐다.** | config/lease 성공 직후 토큰이 폐기되거나 라이선스가 만료될 수 있다. 다음 batch 수신이 거부되는 것은 정상 경로다. 설계도 이를 수신 실패 사유로 정의한다. | “config/lease 단계에서만 Denial”을 삭제한다. 배치 전송의 envelope 수준 거부에도 같은 구조화 사유와 중단·큐 보존 행동을 정의한다. |
| 10 | 🔴 | 계약 §1.3·§3; `spi/BatchWriter.java:94`; `runtime/CollectorRuntime.java:324` | **IDEMPOTENCY_CONFLICT가 대응표에서 빠졌고, 모든 CONFLICT를 fencing으로 취급한다.** | SPI의 CONFLICT는 같은 키·다른 payload도 뜻한다. 설계 §3.6은 이를 IDEMPOTENCY_CONFLICT로 정의한다. 계약 표는 STALE_LEASE 등만 나열하고 런타임은 모두 lease를 버린다. 멱등 충돌을 다음 seq로 우회해 버릴 수 있다. | fencing 충돌과 payload 충돌을 구조화된 사유로 구분한다. 전자는 설정 재조회·소유권 처리, 후자는 배치 격리·중단·알람으로 처리한다. 자유 문자열 `detail`만으로 분기시키지 않는다. |
| 11 | 🔴 | `local/InMemoryBatchWriter.java:46` | **같은 키·다른 payload도 DUPLICATE로 ACK한다.** | `seen`에는 키만 저장한다. 동일 키의 rows·quality·policyVersion을 바꾸어 보내도 DUPLICATE다. SPI와 설계의 payload 충돌 규칙을 위반하고, 잘못된 checkpoint 전진을 정상으로 보이게 한다. | 키별 canonical payload hash 또는 불변 payload를 저장한다. 같은 키·같은 내용만 DUPLICATE, 다른 내용은 IDEMPOTENCY_CONFLICT. |
| 12 | 🔴 | `local/FileCheckpointStore.java:74,76,78`; 계약 §1.7; `spi/CheckpointStore.java:36` | **durable 저장 계약을 충족하지 못한다. 원자 교체와 fsync는 다른 보장이다.** | `Files.writeString()`과 rename만 있고 force/fsync가 없다. ATOMIC_MOVE 미지원 때 일반 move로 조용히 내려가면서 “반쪽 파일이 읽히지 않는다”는 설명도 유지한다. | 파일 데이터 flush와 플랫폼별 rename 내구성을 보장하는 저장 프로토콜을 구현한다. 원자 교체 미지원 시 명시적 복구 프로토콜 없이 성공 처리하지 않는다. 큐와의 원자성은 #1에서 함께 해결. |
| 13 | 🔴 | `local/FileCheckpointStore.java:102,118`; `CollectorRuntimeTest.java:70` | **깨진 파일이 항상 “없음”으로 판정되는 것은 아니다. 정상처럼 읽힌 부분 파일이 영구 실패를 만들 수 있다.** | 헤더와 `observedAt/runId`는 남고 `v.calls` 행만 사라진 파일은 빈 `lastValues`를 가진 checkpoint로 읽힌다. FakeAdapter는 `get("calls")`에서 NPE → COLLECT_FAILED를 반복하고 checkpoint를 복구하지 못한다. 숫자 값의 일부 변조도 검출하지 못한다. | 길이·항목 수·checksum 등 완전성 검증을 둔다. 어댑터도 필요한 기준값 누락을 corrupt/baseline으로 처리해야 한다. 손상을 정상 checkpoint로 전달하지 않는다. |
| 14 | 🔴 | `runtime/CollectorRuntime.java:108,285,363`; 계약 §1.2; 설계 §3.6 시간 | **observedAt이 실제 관측 시각보다 앞선다.** | tick 시작 시각을 모든 대상·모든 kind에 사용한다. 앞 대상 지연, 잠금 대기, 접속, COUNTER 조회 뒤 Q 조회가 이어져도 같은 시각이다. 1분 버킷·age·lease 판정이 함께 어긋날 수 있다. | 스케줄링 시각과 관측 시각을 분리한다. 관측 시각을 SQL 관측 경계에서 원자적으로 capture하고, 그 배치의 재전송에서는 고정한다. 긴 조회의 시작/종료 기준도 계약에 명시. |
| 15 | 🔴 | 계약 §1.4·§4; `spi/BatchWriter.java:86`; 설계 §5.7 | **현재 record를 완성된 품질 wire 정본으로 선언하면 설계의 품질 상태를 잃는다.** | 설계에는 `status=OK/PARTIAL/FAILED/SKIPPED`, `elapsed_ms`가 있으나 BatchQuality에는 없다. baseline/partial, 지연 SKIPPED, 정상 빈 결과를 현재 필드만으로 일관되게 구분할 규칙도 없다. | status·elapsed 및 baseline/partial 변환 규칙을 모델에 반영하거나, 현재 record를 명시적 시험용 부분 모델로 표시한다. “🧪 없는 행은 코드가 이미 따른다”는 포괄 선언을 수정. |
| 16 | 🔴 | 계약 §0·§3; 설계 §3.6 원격 작업 | **J2 제어 API의 인증·응답 범위와 jobs 전달 위치가 일치하지 않는다.** | §0은 쿠키·visitor 검사·관리자·ApiResult·전 경로 Feature 게이트를 공통 규약처럼 제시하지만 §3은 전용 Bearer 토큰·Snapshot/304·Denial·진단 heartbeat를 요구한다. 설계의 jobs는 config에 있는데 시험본은 heartbeat 응답으로 이동했고 Job schema도 없다. | 관리 API와 J2 제어/수신 API의 적용 범위를 명시한다. 거부 envelope·Feature 검사 위치를 정의한다. jobs 전달 채널을 하나로 결정하고 TTL·멱등 키·취소·result schema까지 맞춘다. |
| 17 | 🔴 | 계약 §1.8 큐 포화 행; 설계 §3.6 큐·복구 | **큐 포화의 최종 폐기 규칙이 빠져 있다.** | 시험본은 카운터·락·checkpoint 유지까지만 적는다. 설계는 카운터·락만으로 포화하면 가장 오래된 카운터부터 폐기하고 손실 메타를 기록하도록 한다. 현재 표대로 구현하면 큐 상한을 지킬 수 없다. | 최종 fallback 폐기 순서와 독립 손실 메타 기록을 포함한다. “유지”를 무조건적인 영구 보존으로 읽히게 하지 않는다. |
| 18 | 🔴 | 계약 §1.3·§1.8; 설계 §3.6 큐·늦은 데이터, §6.1 | **EXPIRED_WINDOW의 판정 창을 하나의 30일 값으로 고정할 근거가 정합하지 않다.** | 설계 큐 행은 세션 raw 48h 밖을 예로 들고, 늦은 데이터 행은 1m 30일을 말한다. §6.1의 Q·metric 1m은 7일이다. raw 저장 만료와 롤업 반영 가능 기한이 섞여 있다. | kind·저장 목적별 수락 창을 정의한다. raw는 만료됐지만 롤업 반영이 가능한 배치의 처리도 명시한다. 이 충돌을 설계와 시험본 양쪽에서 닫은 뒤 EXPIRED 판정을 구현한다. |

#1의 이중 집계는 다음과 같습니다.

1. 저장된 checkpoint가 `calls=1000`이다.
2. `calls=1100`을 관측해 Δ100을 seq N으로 저장한다.
3. checkpoint 저장 전에 죽거나 저장이 실패한다.
4. 다음 관측 `calls=1150`에서 옛 checkpoint 1000을 읽어 Δ150을 새 seq로 저장한다.
5. 서버에는 **100+150=250**, 실제 증가는 **150**이 남는다.

서버 멱등 키는 배치 식별자입니다. 서로 다른 식별자로 들어온 **겹치는 델타 구간**까지 알아내지는 못합니다. `writer`가 실제 commit 후 예외를 던지거나 ACK가 유실되어도 같은 문제가 생깁니다. 따라서 “RETRY_LATER면 다음 tick의 누적 델타이므로 손실이 아니다”는 설명은 **확실히 미저장된 경우에만** 성립합니다.

**추가 보완 — 🟡 범위·진단·시험 공백**

| # | 심각도 | 파일:행 또는 문서 § | 지적 | 재현/근거 | 고칠 코드·문구(핵심만) |
|---|---|---|---|---|---|
| 19 | 🟡 | `runtime/CollectorRuntime.java:269,275,335` | 채집 실패가 runtime 상태에 제대로 남지 않는다. | SQL 예외 경로는 FAILED 배치를 쓰지만 `st.lastError`에 원인을 넣지 않는다. 어댑터가 `quality.errorCode`를 가진 결과를 반환하면 ACCEPTED 처리에서 lastError를 지운다. | 저장 성공과 채집 성공을 분리한다. 상태의 lastError·lastSuccess는 quality와 실제 채집 결과로 갱신. |
| 20 | 🟡 | `runtime/CollectorRuntime.java:193,233`; `local/ManualClock.java:37` | 보정된 wall clock으로 주기·갱신 간격까지 계산한다. | 시간이 뒤로 이동하면 `now-lastRenewMs`가 음수가 되고 nextDue도 미래로 밀린다. 현재 시험대는 lease 서버와 수집기에 같은 시계를 써서 두 시계의 차이를 가린다. | 경과시간은 monotonic clock, wire 관측 시각은 보정 UTC로 분리한다. lease 서버 시계와 수집기 시계를 독립 주입해 시험. |
| 21 | 🟡 | `runtime/ConnectionProvider.java:12,31`; `runtime/CollectorRuntime.java:246,300`; 설계 §17.2 | 기본 JDBC 구현은 tick마다 실제 연결을 생성한다. | 5초 세션 주기마다 인증·TLS·설정 적용 비용이 발생한다. 전용 풀은 주석에서 이월되었으므로 현재 구조만으로 접속 비용·레인 예산을 검증할 수 없다. | 레인별 전용 풀을 공급하는 provider를 붙인 뒤 예산을 검증한다. 풀 반환의 close와 물리 연결 close를 구별하고, 재사용 시 설정·credential version을 관리. |
| 22 | 🟡 | `runtime/CollectorRuntime.java:300` | close 실패를 다음 연결이 “덮는다”는 주석은 부정확하다. | 새 연결을 만든다고 이전 연결의 자원이 회수되는 것은 아니다. 실제 잔존 여부는 드라이버 상태에 달려 있으며 이번에는 미확인이다. | close 실패를 외부 운영 계층에 전달·계측하고 풀의 invalidation/abort 경로를 정의한다. |
| 23 | 🟡 | `runtime/EngineAdapter.java:27`; `runtime/CollectorRuntime.java:268,365` | 적용 정책 snapshot이 어댑터 입력에 없다. | runtime은 `snap.policy().policyVersion()`을 배치에 붙이지만 collect에 policy를 전달하지 않는다. 그 rows가 동일 버전의 승인 태그·길이·원문 정책으로 보호되었다는 연결이 없다. 실제 유출은 미확인이다. | collect 입력에 불변 수집 context와 policy snapshot을 전달하거나, 같은 snapshot을 보장하는 명시적 계약을 둔다. WS-3 어댑터 전에 해결. |
| 24 | 🟡 | `runtime/EngineAdapter.java:25,43`; `runtime/CollectorRuntime.java:282`; 설계 §5.4 | checkpoint API가 kind당 단일 키·단일 갱신만 지원한다. | 설계의 PG native 키는 `(dbid, userid, queryid, toplevel)`이다. 현재 runtime은 kind당 checkpoint 하나만 load/save한다. 여러 native를 Map에 묶으면 설계의 native별 reset·quota·baseline 의미가 달라진다. | native별 checkpoint 변경 집합을 반환·원자 commit하는 형태를 결정한다. 묶음 checkpoint를 채택한다면 저장·quota·reset 계약을 먼저 개정. |
| 25 | 🟡 | `runtime/EngineAdapter.java:45`; `spi/BatchWriter.java:37` | null Collected·null quality를 경계에서 검증하지 않는다. | null Collected는 채집 try 밖에서 NPE로 tick을 탈출한다. null quality는 Batch를 통과해 메모리 writer에 수락되고 checkpoint까지 전진할 수 있다. | 어댑터 반환값 불변식을 검증한다. 잘못된 결과는 진단 가능한 실패로 처리하고 checkpoint를 전진시키지 않는다. |
| 26 | 🟡 | `local/FileCheckpointStore.java:128,135` | `safe()` 충돌을 내용 비교로 “잡는다”는 설명은 절반만 맞다. | `a/b`와 `a?b`는 같은 파일명이다. load는 다른 내용의 오독을 막지만 save가 앞 checkpoint를 덮어쓰는 것은 막지 못한다. 다만 canonical UUID만 허용하면 이 UID 예시는 정상 wire 입력이 아니다. | UUID·kind를 엄격히 정규화/검증하거나 전체 복합 키의 충돌 저항적 파일명을 사용한다. 내용 비교를 덮어쓰기 방지책으로 설명하지 않는다. |
| 27 | 🟡 | `local/FileCheckpointStore.java:48,53` | 없음·손상·일시 I/O 실패를 모두 Optional.empty로 숨긴다. | AV·공유 위반·권한 오류가 반복되면 매번 baseline이 될 수 있다. 정상 저장이 가능하면 손상은 다음 baseline 저장으로 회복되므로 **항상 영구 루프는 아니다**. | missing/corrupt/unavailable을 구분하고 외부 상태에 노출한다. 손상 격리와 복구 성공 여부를 기록. |
| 28 | 🟡 | `runtime/CollectorRuntime.java:287,294`; `runtime/TickReport.java:9` | DUPLICATE도 failed에 포함된다. CONFLICT는 일부 경로에서 실패 수에 잡히지 않는다. | `writeTracked()`는 DUPLICATE·EXPIRED_WINDOW에서 false, CONFLICT에서 null을 반환한다. 호출자는 false면 failed++, null이면 집계 없이 break한다. | 저장 ACK·폐기 ACK·채집 실패·소유권 상실을 명시적으로 집계한다. DUPLICATE를 실패율에 넣지 않는다. |
| 29 | 🟡 | `CollectorRuntimeTest.java:79,161,243,337`; 계약 §4 | 시험표의 “증명” 범위가 테스트보다 넓다. | LONG_TTL은 30s lease와 60s Q 사이의 갱신을 검증하지 않는다. 파일 재시작 시험은 새 Rig에서 lease 서버와 writer까지 새로 만들어 기존 epoch·영수증과의 충돌을 보지 않는다. `duplicateReplay`는 runtime이 아니라 writer 직접 호출이다. | 시험표를 실제 단언 범위로 좁힌다. 아래 누락 시나리오를 기본 TTL·지속되는 lease 서버/writer로 추가. |
| 30 | 🟡 | `PgCapabilityCheckerLiveIT.java:86` | nomon의 L OK·C RECOMMENDED·P UNSUPPORTED를 단언하지 않는다. | 출력에는 모두 나오지만 assertions는 S·Q MISSING과 필수 미충족만 확인한다. 해당 결과가 회귀해도 R1-PG 시험은 통과한다. | 예상 capability 전체 표를 단언한다. 로그 출력과 검증을 구별. |
| 31 | 🟡 | `PgCapabilityCheckerLiveIT.java:29`; `IntegrationTestSupport.java:103` | 환경변수 게이트는 독립 P0 도구로는 가능하지만 required 실행 모드가 없다. | `it.db.required=true`여도 DBM_IT_PG_PORT가 없으면 클래스가 skip된다. 다만 Spring 웹 IT가 아니므로 IntegrationTestSupport 상속을 강제하는 것도 부적절하다. | 독립 JDBC 시험 구조를 유지하되, DBM 실측/출시 실행에서 필수 환경 누락을 실패시키는 명시적 모드를 제공한다. |
| 32 | 🟡 | `PgCapabilityCheckerLiveIT.java:53,59,82` | 직접 open한 ConnectionSpec의 password char[]를 wipe하지 않는다. | `JdbcConnector.test()`에 준 별도 spec은 지워지지만, monitor/plain의 `s`는 open 후 그대로 남는다. | 직접 open 호출의 finally에서도 `s.wipePassword()` 호출. |
| 33 | 🟡 | `env_p0-test-db.md` §1·§2 | “비밀번호는 스크래치패드에만”은 실제 저장 위치를 정확히 설명하지 못한다. 재현 스크립트도 발췌본이다. | `POSTGRES_PASSWORD`로 전달한 값은 Docker 컨테이너 환경 설정에도 남는다. 제시된 코드는 `set -u`인데 `$SUPER_PW` 생성·로드 부분이 없어 그대로 실행할 수 없다. 평문 비밀번호가 문서에 적힌 것은 발견하지 못했다. | 스크래치패드·환경변수·Docker 설정에 남는 범위를 명시한다. 재현 가능한 생성/로드 절차 또는 실제 스크립트 좌표를 제공하고 “동일 스크립트” 표현을 정정. |
| 34 | 🟡 | 계약 머리말·§1.1·§1.8·§2; 설계 머리말·§17.7 | 버전·시험 표시·예시 설명에 잔여 불일치가 있다. | 계약은 v2.2를 정본으로 가리키고 설계 상태 문장도 v2.2다. §3.6의 🧪 멱등 방식·epoch 규칙이 시험본에서는 운영 계약처럼 제시되는 반면, 비시험 행인 늦은 데이터 기한에는 🧪가 붙었다. `JdbcConnector.FailureKind`는 실제로 `ConnectionTestResult.FailureKind`다. AUTH 응답 message도 현재 코드 문구와 다르다. | v2.3 기준으로 정렬하고 “설계 확정/시험 가정/현재 구현”을 구분한다. enum 소속과 실측이라고 부르는 예시 문구를 코드에 맞춘다. |
| 35 | 🟡 | 계약 §1.1; 설계 §5.4 마지막 행 | seq 범위의 설명이 다르다. | runtime은 대상의 모든 kind에 단일 nextSeq를 사용한다. 설계는 `(target_uid, kind)` 범위라고 적는다. 저장 키에 kind가 있으므로 현재 전역 seq가 중복을 만드는 것은 아니다. | 대상·epoch 전체에서 증가하며 kind별로는 불연속일 수 있다고 통일하거나 per-kind로 변경. 수신기가 kind별 연속 seq를 요구하지 않도록 명시. |

Windows 파일 교체는 **`ATOMIC_MOVE + REPLACE_EXISTING` 조합 자체가 잘못된 것은 아닙니다.** Java 계약은 ATOMIC_MOVE에서 다른 옵션을 무시하고 기존 대상 교체 여부를 구현에 맡깁니다. OpenJDK 17의 Windows 구현은 이 경로에서 `MoveFileEx(..., MOVEFILE_REPLACE_EXISTING)`을 사용합니다. 따라서 보통의 기존 파일 교체는 지원하지만 열린 핸들·공유 모드에 따른 실패까지 없애 주지는 않습니다. 해당 PC의 AV 간섭·열린 파일 조합은 **미확인**입니다. [Java 17 Files.move](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/nio/file/Files.html#move(java.nio.file.Path,java.nio.file.Path,java.nio.file.CopyOption...)), [OpenJDK 17 Windows 구현](https://raw.githubusercontent.com/openjdk/jdk17u/master/src/java.base/windows/classes/sun/nio/fs/WindowsFileCopy.java), [Windows 파일 이동 설명](https://learn.microsoft.com/en-us/windows/win32/fileio/moving-and-replacing-files)

파일 교체 성공과 시스템 장애 후 내구성도 구별해야 합니다. 현재 코드에는 저장 장치로 변경을 밀어내는 force가 없습니다. [FileChannel.force](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/nio/channels/FileChannel.html#force(boolean))

**정상으로 확인한 사항 — 🟢 오탐 제외**

| # | 심각도 | 파일:행 또는 문서 § | 지적 | 재현/근거 | 고칠 코드·문구(핵심만) |
|---|---|---|---|---|---|
| 36 | 🟢 | `runtime/CollectorRuntime.java:364,366,397` | 정상 상태 수명 안에서는 쓰기 시도별 seq 소비가 맞다. | writer 호출 전에 증가하므로 RETRY_LATER·REJECTED·writer RuntimeException·null 결과에서도 소비된다. 동일 TargetState의 같은 epoch 재획득은 유지한다. | 유지. #6의 상태 소실 경로를 보완. |
| 37 | 🟢 | `runtime/CollectorRuntime.java:130` | 같은 TargetState의 동시 레인 쓰기에서 seq 중복은 막는다. | nextSeq 읽기·증가·writer 호출이 같은 잠금 아래 있다. kind별 seq가 섞이는 것 자체는 멱등 키의 충돌 원인이 아니다. | 잠금 범위를 줄이되 seq 예약의 원자성은 보존. |
| 38 | 🟢 | `runtime/CollectorRuntime.java:329`; `spi/BatchWriter.java:106` | ACK 상태 집합은 코드상 일치한다. | ACCEPTED·DUPLICATE·EXPIRED_WINDOW에서만 checkpoint 저장. RETRY_LATER·REJECTED·CONFLICT에서는 저장하지 않는다. | #1의 commit 경계와 #18의 만료 의미를 별도로 수정. |
| 39 | 🟢 | `runtime/CollectorRuntime.java:242,264,369` | 지정된 예외 다수는 실패 배치로 처리하고 진행할 수 있다. | secret null/RuntimeException, checkpointKey SQLException, writer RuntimeException에 처리 경로가 있다. 이 경로에서 lease를 매번 반납하지 않는 것 자체는 누수가 아니다. | 예외별 상세 판정은 아래 참조. |
| 40 | 🟢 | `runtime/CollectorRuntime.java:111,212`; 계약 §1.6 | D22에서 lease 반납과 큐 보존은 모순되지 않는다. | drop/releaseAll은 checkpoint나 writer 큐 삭제를 호출하지 않는다. 다만 현재 큐 자체가 없으므로 큐 보존을 실행 시험으로 증명한 것은 아니다. | “큐 삭제 없음”과 “큐 보존 시험 통과”를 구별. |
| 41 | 🟢 | 계약 §1.3; `spi/BatchWriter.java:98` | EXPIRED_WINDOW를 terminal ACK로 처리하는 선택은 설계와 맞다. | 설계도 미저장·손실 기록·ACK 후 큐 삭제를 요구한다. “수락”이 “데이터 저장 성공”을 뜻하지만 않으면 된다. | `저장하지 않은 폐기 ACK`로 문구를 명확히 한다. |
| 42 | 🟢 | `capability/CapabilityReport.java:17,24,28,40`; 계약 §2 | helper 메서드가 기본 Jackson 응답에 끼어드는 문제는 없다. | `of()`는 인자가 있고, `statuses()`·`requiredSatisfied()`는 record component도 get/is getter도 아니다. Optional을 응답 필드로 직렬화하지 않는다. | 현재 JSON shape 유지. 아래 직렬화 판정 참조. |
| 43 | 🟢 | `DbmCoreArchitectureTest.java:42`; 새 runtime/local imports | 새 패키지는 allowlist를 지킨다. | 확인한 새 imports는 java·javax·core뿐이다. URLEncoder·nio·security는 허용된다. `DbEngine.parse`도 core 내부다. 기존 ArchUnit XML 2건 통과 기록도 있다. | 유지. 테스트 보조 구현의 production jar 포함은 배치 선택이며 경계 위반은 아니다. |
| 44 | 🟢 | `local/FileCheckpointStore.java:92,131` | `t-1` clear가 `t-10`까지 지운다는 의심은 성립하지 않는다. | prefix가 `t-1__QUERY_STAT__`이므로 `t-10__QUERY_STAT__...`과 일치하지 않는다. | 유지. 임의 문자열을 허용할 때의 safe 충돌은 #26에서 별도 해결. |
| 45 | 🟢 | `local/FileCheckpointStore.java:146,150` | 내용 값의 URL form 인코딩 선택은 유효하다. | 대응하는 encoder/decoder가 있어 공백·`+`·`=`·개행 등을 줄 형식과 분리할 수 있다. 파일명 충돌과는 다른 문제다. | 유지. |
| 46 | 🟢 | `PgCapabilityChecker.java:114,201`; 설계 §4.2; LiveIT 기존 결과 | nomon의 L OK·C RECOMMENDED는 설계와 모순되지 않는다. | §4.2는 S·C·L 필수와 허용 상태를 정하지만 “pg_monitor 없으면 L도 MISSING”이라고 정하지 않는다. 코드와 실측 결과는 일치하고 S MISSING 때문에 필수 미충족이다. | 예상표 전체 단언만 #30대로 보강. |
| 47 | 🟢 | `SqlLiteralMasker.java:131,178,445`; `git show 94c9115` | 지정된 전진 회귀 수정은 HEAD에 들어 있다. | `identifierRun()` 첫 글자 전진과 주 루프 무전진 시 FAILED 가드가 모두 확인된다. 이번 미커밋 diff에 없는 것이 정상이다. | 유지. |

Jackson 기본 record 처리는 선언된 component 접근자와 일반 get/is getter를 인식합니다. 따라서 `CapabilityReport`의 응답 필드는 **items, engineVersion, versionNumber, notes, checkedAtEpochMs**이고, 세 helper는 추가되지 않습니다. enum도 별도 변환 annotation이 없어 이름으로 나갑니다. 계약 §2의 **필드 shape은 맞고**, 앞서 지적한 AUTH message 같은 값·문구가 다릅니다. 별도 JSON 직렬화 시험을 이번에 실행한 것은 아닙니다. [Jackson 2.17 접근자 판정 구현](https://raw.githubusercontent.com/FasterXML/jackson-databind/2.17/src/main/java/com/fasterxml/jackson/databind/introspect/DefaultAccessorNamingStrategy.java)

**A에 대한 상태 전이·예외 경로 판정**

lease 처리 순서는 코드상 **만료 확인 → 없으면 재획득 → 기존 유효 lease의 10초 갱신**이 맞습니다. 갱신 실패는 해당 대상의 이번 처리를 중단하며, 실제 fencing CONFLICT도 남은 kind를 중단합니다.

그러나 이것만으로 “이중 적재 0”은 보장되지 않습니다. **갱신 성공 직후 다른 노드로 인계되는 창을 막는 최종 장치는 writer**입니다. 이 요구는 이미 설계 §5.2의 “writer가 현재 token과 비교해 불일치 거부”와 `BatchWriter.Meta` Javadoc에 있습니다. 없는 요구라고 지적하면 오탐입니다. 추가로 명확히 해야 할 부분은 **비교와 저장의 원자성**, generation·허가 만료 검증입니다. token을 먼저 읽고 별도 INSERT를 하는 PG writer도 안전하지 않습니다.

| 경로 | 현재 동작 | 판정 |
|---|---|---|
| `secrets.resolve()` null | SECRET_UNAVAILABLE FAILED 배치, 정상 반환 | lease 유지 자체는 정상. AUTH 정지 정책과는 별개다. |
| `secrets.resolve()` RuntimeException | 위와 같은 처리 | 영구적으로 상태가 잠기는 경로는 아니다. |
| `connections.open()` SQLException | 분류된 FAILED 배치, char[] wipe | 처리 경로는 맞지만 AUTH에서도 다음 tick 접속을 반복한다. |
| open의 RuntimeException | SECRET_UNAVAILABLE로 처리 | 잘못된 endpoint·provider 버그까지 비밀값 문제로 오분류할 수 있다. |
| `adapter.checkpointKey()` SQLException | 해당 kind FAILED 배치 후 다음 kind, finally close | 처리된다. 다만 runtime lastError 반영이 빠져 있다. |
| `writer.write()` RuntimeException | seq 소비 후 RETRY_LATER로 변환 | 잠기지는 않는다. **commit 여부 불명확 상태에서 새 델타를 만드는 문제가 #1**이다. |
| `checkpoints.save()` 예외 | tick 바깥으로 전파, finally close 시도 | 뒤 대상 처리도 중단된다. 지속 실패하면 같은 구간을 반복 계산한다. 외부 scheduler의 예외 처리 방식은 아직 없어 영구 스케줄 중단 여부는 미확인이다. |
| `c.close()` SQLException | 무시 | 다음 tick은 가능하지만 자원 회수 성공은 확인할 수 없다. |
| `leases.release()` 예외 | 상태를 먼저 제거한 채 전파 | #6의 동일 epoch seq 초기화 위험과 뒤 대상 release 누락이 있다. |
| 정상적인 만료·renew 실패·fencing에서 `st.lease=null` | 다음 tick에서 재획득 가능 | 그것만으로 영구 봉쇄되지는 않는다. 이미 상실한 lease를 무조건 release할 필요도 없다. |

비밀번호는 open 반환/실패 뒤 finally에서 원본 char[]가 지워집니다. **접속에 필요한 사용이 끝난 직후 지우는 시점은 적절합니다.** `JdbcConnector`가 만든 String과 드라이버 내부 사본까지 지워지지는 않으며, 이 한계는 현재 Javadoc에 이미 정확히 적혀 있습니다.

baseline을 어댑터가 계산하는 역할 분담도 가능합니다. 문제는 역할 분담 자체가 아니라, **runtime이 run/인계 경계를 반영하지 않은 previous를 전달하고 테스트가 이를 정상 이어 쓰기로 고정한 것**입니다.

**2. B 판정 — §5.2 문장을 고치는 쪽이 맞습니다**

**유효한 동일 `(ownerId, runId)` 재요청에서 token·epoch를 유지하는 메모리 규칙을 채택하십시오.** 다만 이를 PG와 동등하다고 선언하려면 schema·만료 경계·J2 실행 식별자 바인딩까지 보강해야 합니다.

같은 실행의 정상 재요청마다 token을 바꾸면 이미 진행 중이거나 큐에 있는 정상 배치를 불필요하게 fencing합니다. epoch까지 바꾸면 소유 구간과 seq 연속성도 흔들립니다. 갱신은 같은 소유 구간을 연장하는 동작이어야 합니다.

§5.2의 교체 문구는 다음 정도가 필요합니다.

> **lease 획득·갱신은 DB 시각 기준의 짧은 원자적 트랜잭션으로 처리한다.** lease에는 `lease_owner`, `lease_run_id`, `lease_token`, `lease_epoch`, `lease_until`을 저장하며 assignment generation과 구분한다.
>
> 1. 비어 있거나 `lease_until <= db_now`인 lease의 신규 획득은, 같은 owner/run이 돌아온 경우를 포함하여 token과 epoch를 증가시킨다.
> 2. 유효한 lease를 동일 `(owner, run_id)`가 재요청하면 만료만 연장하고 token·epoch는 유지한다.
> 3. 다른 실행 식별자의 유효 lease 요청은 거부한다. J2는 할당된 collector 및 등록된 실행 식별자의 이전 절차를 별도로 검증하며, TTL 만료를 수집기 자동 교체 허가로 해석하지 않는다.
> 4. 갱신은 현재 owner·run·token·generation이 일치하고 아직 만료되지 않은 경우만 허용하며 token·epoch는 변경하지 않는다.
> 5. 반납은 현재 lease와 일치할 때만 만료 처리한다. 소유자 이력은 남겨도 되지만 반납된 lease는 실행·쓰기 허가로 사용할 수 없다.
> 6. writer는 현재 소유권·generation·token과 필요한 허가 유효성을 검증하고, 이 검증과 배치 저장을 동일한 원자적 경계에서 수행한다. J1의 델타 checkpoint 변경도 같은 commit에 포함한다.
> 7. 동일 epoch를 재개하는 runtime은 seq를 보존한다. seq 이력을 잃은 실행이 동일 epoch의 seq 0부터 다시 쓰는 것은 허용하지 않는다.

추가로 다음을 명시해야 합니다.

- 기존 `RETURNING lease_token+1` 표기는 실제 저장 증가를 보장하는 SQL이 아닙니다. 구체 SQL에는 **SET에서 증가시키고 저장된 값을 RETURNING**하도록 적어야 합니다.
- `release()`가 owner를 남기고 `untilMs=0`만 하는 선택 자체는 괜찮습니다. 메모리 획득 코드가 free를 먼저 판정하므로 다음 획득은 새 token·epoch가 됩니다.
- 문제는 `currentToken()`이 그 반납된 token을 계속 돌려주고 writer가 그것만 믿는 부분입니다.
- `renew()` 성공 응답은 동일 epoch라는 불변식이 필요합니다. 현재 runtime은 갱신 응답에 `startEpoch()`를 적용하지 않으므로, 갱신에서 새 epoch를 발급하는 서버 구현과는 함께 사용할 수 없습니다.
- §3.6의 J2 “다른 run은 재등록·교체 절차로만 이전”까지 메모리 구현이 재현한다고 보기는 어렵습니다. 현재 구현에는 등록된 실행 식별자나 할당 권한 모델이 없습니다. 범위를 generic lease 시험 구현으로 한정하거나 그 정책을 추가해야 합니다.

**3. P1a DoD 증명과 커밋 순서**

현재 테스트는 **Spring·PG 없이 인터페이스를 교체해 코어를 구동할 수 있다는 좁은 경계 증명**은 합니다. 이를 lease 경계·복구 정확성까지 통과한 것으로 확대하면 안 됩니다.

다음 시험이 빠져 있습니다.

| 필요한 시험 | 확인해야 할 결과 |
|---|---|
| 유효기간 안의 renew 실패 → 같은 epoch 재획득 | 그 tick은 중단하고 다음 재획득에서도 seq를 되돌리지 않는다. |
| 갱신 성공 후 SQL 중 인계 | 옛 결과는 최종 writer에서 원자적으로 거부된다. |
| FAST/SLOW 동시 tick | seq 중복이 없고 slow SQL이 fast 수집·갱신을 막지 않는다. |
| 저장 성공 후 checkpoint 실패·crash·ACK 유실 | 재시작 여부와 무관하게 겹치는 델타가 이중 집계되지 않는다. |
| REJECTED·DUPLICATE·EXPIRED_WINDOW·writer throw | 중단 범위·ACK·checkpoint 전진·손실 집계가 각각 계약과 맞는다. |
| null Collected/quality·잘못된 checkpoint 값 | 잘못된 checkpoint 전진이나 전체 레인 예외 탈출 없이 진단된다. |
| 수집기 시계 역행, lease 서버 시계는 정상 | 갱신·폴링 정지와 스케줄 간격이 보장된다. |
| `Lane.intervalMs=0` | 해당 kind는 수집하지 않는다. 필요한 다른 kind와 lease 처리는 계속된다. 현재 분기는 이 동작으로 보이지만 시험은 없다. |
| release 예외·설정에서 실제 제거·동시 재활성화 | 상태 이력 소실·동일 epoch seq 재사용이 없다. 현재 시험은 disabled만 확인한다. |
| 기본 TTL 30s로 지속 운전·비정상 재시작 | LONG_TTL 없이 갱신을 증명하고 지속되는 lease 서버·writer·파일 checkpoint를 함께 사용한다. |
| 손상 파일·열린 핸들·원자 이동 미지원 | 손상 오독·무음 baseline 반복·기존 checkpoint 유실 없이 정해진 실패/복구 경로를 따른다. |

`fencingOnTakeover()`의 31초 후 인계는 정상적인 로직 시험이지만 **RTO ≤30초 실측 증명은 아닙니다.** §17.7이 R8을 미실시로 남긴 것은 적절합니다.

수정 순서는 다음을 권합니다.

1. **공통 commit 경계와 불확실한 쓰기 결과 처리**를 먼저 닫습니다. #1을 해결하지 않은 채 PG writer나 디스크 큐를 붙이면 재작업됩니다.
2. **lease 정본과 상태 수명**을 고칩니다. §5.2, runId·epoch, release 실패, writer의 원자적 fencing을 함께 맞춥니다.
3. **레인 격리·시간 처리·AUTH 정지**를 구현합니다.
4. **계약 §1.3·§1.7·§3**의 중단 정책·오류 schema·checkpoint 의미를 정렬하고, 품질·큐 포화·늦은 데이터 창을 확정합니다.
5. **파일 checkpoint의 내구성·완전성**을 보강한 뒤 기본 TTL과 장애 주입 시험을 추가합니다.

풀·namespace·실제 PG HA 등 명시적 후속 항목을 이번 커밋에서 모두 끝낼 필요는 없습니다. 그러나 **현재 실행 경로의 이중 집계, 레인 격리 실패, baseline 계약 차이와 J2 공통 계약 충돌은 먼저 고쳐야 합니다.** 기존 테스트 통과 기록만으로 이번 작업 트리를 승인하기는 어렵습니다.