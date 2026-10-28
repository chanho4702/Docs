---
tags: [backend, postgres, concurrency, deadlock, upsert]
updated: 2026-09-28
---

# 동시 배치 UPSERT는 conflict 키로 정렬해 잠금 순서를 통일하라

## 증상

동시성 하에서 같은 테이블(특히 파티션)에 배치 `INSERT ... ON CONFLICT DO UPDATE`를 치면 PostgreSQL이 `deadlock detected`로 한쪽 트랜잭션을 죽인다.

```
PessimisticLockingFailureException ... deadlock detected
  Detail: Process A waits for ShareLock on transaction X; blocked by B.
          Process B waits for ShareLock on transaction Y; blocked by A.
  Where: while inserting index tuple (...) in relation "<partition>"
```

## 원인 (쉬운 그림)

한 배치는 **하나의 트랜잭션**으로 실행되며, 배치 안의 **행 순서대로** 인덱스/행 잠금을 획득한다. 두 요청의 배치 순서가 다르면:

- A: `행X → 행Y` 잠금
- B: `행Y → 행X` 잠금

A는 X를 쥔 채 Y를 기다리고 B는 Y를 쥔 채 X를 기다린다 → **순환 대기 = 교착**. DB가 한쪽을 강제 실패시킨다.

배치를 **도착 순서 그대로** 보내면(정렬 안 함) 순서가 요청마다 달라 이 상황이 터진다. 저차원 키(카운터·상태 메트릭 등)로 **소수 행에 쓰기가 몰릴수록** 확률이 높다.

## 해결

배치를 DB에 보내기 **직전에 conflict 키(=충돌 판정에 쓰는 컬럼 조합)로 전순서 정렬**한다. 모든 프로세스가 같은 순서로 잠그면 순환이 불가능해져 **교착 대신 직렬화**(먼저 잠근 쪽이 끝날 때까지 대기)된다.

```java
batch.sort(  // (k1, k2, ...) = ON CONFLICT 절의 컬럼들
    Comparator.comparing(...k1).thenComparing(...k2)...);
jdbc.batchUpdate(UPSERT, ...);
```

- 정렬 필드 순서는 **PK/인덱스 컬럼 순서와 무관**하다 — 결정적이고 모든 프로세스가 **같은 비교자**를 쓰기만 하면 된다.
- 같은 배치 리스트를 뒤이어 순회하는 다른 DML(예: 후속 UPDATE)이 있으면, 한 번 정렬해두면 그 경로의 잠금 순서도 함께 통일된다.
- 비용은 O(n log n) — 배치 수백~수천 행 규모에서 무시 가능.

## 하지 말 것 (증상만 덮는 대안)

- **데드락 예외 캐치 후 재시도** — 근본 원인(순서 불일치)이 남아 재시도 폭풍 여지. 정렬이 먼저다.
- **단건 UPSERT로 쪼개기** — 처리량 급감.
- **격리수준/락 힌트** — 대개 과함. 정렬 한 줄로 충분.

## 실전 사례

- moveseye APM 1m 적재(`ApmMetric1mStore`, 2026-09-28): 수집기 자기 텔레메트리(`service_id=0`)가 소수 행에 몰려 15초 주기 동시 수신에서 교착. `batch.sort(PK 전순서)`로 해소. → [[2026-09-28-apm-metric1m-deadlock]]

## 참고

- 데이터가 사라진 건 아닐 수 있다: 실패한 배치가 503으로 재전송되고 UPSERT 재실행이 중복 가산을 안 하면 결국 다 들어간다. 그래도 ERROR 로그·재전송 낭비는 고쳐야 한다.
- 관련: [[test-false-safety-nets]](정렬 줄을 빼면 테스트가 실패하는지 역으로 확인).
