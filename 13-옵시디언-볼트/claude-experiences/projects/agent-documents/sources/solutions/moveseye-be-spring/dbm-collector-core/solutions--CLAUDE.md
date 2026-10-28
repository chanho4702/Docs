# CLAUDE.md — dbm-collector-core 작업 가이드

J1(BE)·J2(원격 수집기) **공유 코어**다. 여기를 바꾸면 두 배포 형태가 같이 바뀐다. 구조 설명은 [README.md](solutions--README.md).

---

## 🔴 반드시 지킬 것

### 1. 프로덕션 의존을 추가하지 마라
`build.gradle.kts`의 프로덕션 의존은 **빈 칸이 정답**이다. Spring·JPA·Jackson·slf4j·lombok·PG 드라이버가 필요해 보이면
그 일은 코어 몫이 아니다 — `spi` 인터페이스로 바깥에 밀어낸다. 테스트 의존(JUnit·AssertJ·Mockito·ArchUnit·pgjdbc)만 허용.

### 2. 저장·시간·스레드·로그를 코어가 소유하지 않는다
- 저장: `BatchWriter.write(Batch, Checkpoint)` 한 번. `CheckpointStore.save`를 코어가 직접 부르면 **배치와 checkpoint가 갈라진다**(코덱스 6차 #1).
- 시간: `CollectorClock`(wall + monotonic). `System.currentTimeMillis()`·`Instant.now()` 직접 호출 금지 — 테스트가 `ManualClock`으로 돈다.
- 스레드: `CollectorRuntime.tick(Lane)`은 호출자가 스케줄한다. `Thread`·`Executors` 생성은 ArchUnit이 막는다.
- 로그: 코어 안에 로거 없음. 상태는 `RuntimeStatus`·`TickReport`로 내보내고 J1/J2가 기록한다(수집기 로그 SQL 원문 보호 §3.6).

### 3. 계약을 바꾸면 세 곳을 같이 고친다
`spi` 시그니처·`WriteResult.Reason`·lease 규칙을 바꾸면 ① 계약서 `contract_db-monitoring.md` §1 ② 설계서 §5.2/§5.4 ③ `CollectorRuntimeTest` 시나리오 표(계약서 §4)가 같은 커밋에 따라간다. 셋 중 하나만 바뀐 상태로 두지 말 것.

### 4. `local`은 시험 구현이다
`InMemory*`는 단일 프로세스 안에서만 맞다. J1 조립에 끼우면 노드 간 인계가 조용히 사라진다 — app 쪽 ArchUnit이 막는다. 단 `FileCheckpointStore`는 J2 프로덕션(로컬 durable checkpoint)이다.

### 5. 어댑터는 `EngineAdapter`만 구현한다
`collect`는 `Collected(nodeId, rows, quality, checkpointValues)`를 돌려준다. quality `FAILED`/`SKIPPED`면 checkpoint를 싣지 않는다(불변식). 행 값에 null 금지. 관측 시각은 `CollectContext.observedAt`을 쓰고 어댑터가 덮지 않는다(코덱스 7차 N10).

---

## 테스트 돌리기
```bash
./gradlew.bat :dbm-collector-core:test
```
LiveIT(실 PG)는 `env_p0-test-db.md` §3 환경변수 + `DBM_IT_PG_REQUIRED=true`. 비밀번호는 스크래치패드 파일에만 — 문서·커밋·로그에 평문 금지.

## 자주 헷갈리는 것
- **`seq`는 kind별로 연속이 아니다.** 대상·epoch 전체에서 증가하고 실패한 시도도 소비한다(§5.4). "세션 seq가 1, 3, 7"은 정상.
- **같은 epoch 재획득 시 seq를 0으로 되돌리지 않는다.** 되돌리면 writer가 `DUPLICATE`로 버린다.
- **REJECTED/CONFLICT에 사유 없는 `WriteResult`는 생성자가 거부한다.** writer 구현이 사유를 모르면 `RETRY_LATER`를 쓴다.
- **AUTH 실패는 백오프가 아니라 정지다.** 재시도하면 계정이 잠긴다. `credential_version` 증가로 자동 재개.

## 변경 이력
| 날짜 | 내용 |
|---|---|
| 2026-10-26 | 모듈 신설(패키지 → Gradle 모듈 이동, ZM-172 P0). 코드 로직 변경 없음 |
