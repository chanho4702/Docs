---
type: topic
tags: [topic, backend, integration-test, gradle, worktree, postgres, lesson]
created: 2026-09-28
updated: 2026-09-28
---

# 통합 테스트 DB를 워크트리끼리 공유하면 "가짜 실패"가 무더기로 난다

## 증상

전체 테스트를 돌렸는데 IT(통합 테스트)가 **무더기로**(수십~백 건, 여러 클래스) 실패한다. 메시지는 제각각이다 — `relation "license" does not exist`, `DuplicateKeyException`, `서비스를 찾을 수 없습니다`, 시드 개수 불일치(적용 67 ≠ 리소스 66), 컬럼 없음, 중복 키. 코드 결함처럼 보인다.

## 원인

`IntegrationTestSupport`(moveseye BE 기준 `src/test/java/.../support/IntegrationTestSupport.java:88~94`)가 **클래스 로드 시** 도커 5433의 `moveseye_it`을 **drop & create**한다. DB 이름은 상수라 env로 못 바꾼다.

같은 머신에서 **다른 워크트리(다른 세션)가 동시에 IT를 돌리면** 한쪽이 상대의 DB를 날린다. 상대가 미커밋 마이그레이션(V67 등)을 갖고 있으면 시드·컬럼이 어긋나고, 연결 고갈까지 겹친다.

## 판별법

- 재실행 때 **실패 메시지가 바뀌면** 충돌이다(결정적 실패가 아님).
- 단독 재실행에서 통과하면 가짜 실패로 판정하고, **왜 그렇게 판정했는지 근거를 남긴다**(다른 워커 존재·시각).
- 진짜 실패 1건이 섞여 있을 수 있다 — 예: `ApmSchemaIT` 8≠9는 V65 시드(09-22)와 테스트(최종 수정 09-07)의 불일치였다. **커밋 이력으로 "내 것 아님"을 근거 있게** 말한다.

## 예방

1. 전체 회귀 전에 `Get-CimInstance Win32_Process`로 `GradleWorkerMain`(테스트 워커)이 0인지 확인한다(스크립트 패턴: `be_full_test_when_idle.ps1`).
2. 다른 워크트리가 돌고 있으면 **전체 테스트를 보류**하고 선별(`:test --tests`)만 돈다.
3. 🔴 Docker가 꺼져 있으면 IT가 **조용히 skip**(시간 0)된다 — `IT_DB_URL` 명시 + `:cleanTest`. 로컬 PG(한국어 로캘)로 돌리면 영문 "partition" 비교 테스트 1건이 실패하는 건 동작 정상.
4. 🔴 `timeout N ./gradlew test`로 끊으면 클라이언트만 죽고 데몬이 계속 돌며 **빈 결과 XML**을 남긴다 — 시간 제한 없이 백그라운드로, 집계 전 `build/test-results/test`를 비운다.
5. 실행 중인 IDE BE가 master `build/classes`를 공유하므로 컴파일·테스트는 **격리 워크트리**에서.
6. 병합본 검증은 남의 작업 중인 master 체크아웃이 아니라 **임시 detached 워크트리**에서.

## 함께 걸리는 메모리 함정

- BE `:test`와 FE jest를 동시에 돌리면 메모리 97% → 시간 대기 테스트(`ApmCollectorLiveRuntimeTest` 20초)가 거짓 실패. 타 세션 jest 워커가 6GB를 쓰면 대기만 하는 백그라운드도 kill된다.
- 유휴 Gradle 데몬은 PID로 정리한다 — 🔴 `gradlew --stop`은 떠 있는 BE(bootRun)까지 죽인다.

## 근본 해결(미착수)

DB 이름을 워크트리별로 갈라 주는 것(env 또는 브랜치 해시 접미)이 정답이지만 상수라 손대지 못했다. 착수하면 `IntegrationTestSupport` 한 곳.

관련: [[2026-09-23-redis-cache-common]] · [[2026-09-22-zm151-156-backlog-sprint]] · [[2026-09-21-zm159-scale-call-guard]] · [[2026-09-23-apm-p5-realtime]] · [[2026-08-31-apm-p1-implementation]] · [[test-false-safety-nets]]
