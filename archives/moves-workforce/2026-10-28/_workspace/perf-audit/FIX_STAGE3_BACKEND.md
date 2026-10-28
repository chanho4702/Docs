# 성능 감사 Stage 3 백엔드 수정 — A-4 · A-6 (2026-08-12)

- 근거 문서: `_workspace/perf-audit/BACKEND_2026-08-12.md` §A-4, §A-6
- 범위: **이 2건만.** 같은 감사의 다른 항목(A-1·A-2·A-3·A-5·A-7·A-8, B/C 전체)은 손대지 않았다.
- 검증: 루트 `npm test` — **71 suites / 1,121 tests 전부 통과**. `test/permission` 단독 **167/167 통과**.

## 개정 이력

| rev | 내용 |
|---|---|
| rev1 | A-4(인덱스 스캔으로 B²→B) · A-6(admin 판정 병렬화) 최초 구현. 테스트 7케이스 |
| **rev2** | **Codex 리뷰 치명 1건 반영** — 인덱스 조회의 eventual consistency 로 완료 판정이 영구 잔류할 수 있던 회귀를 **누락 키 strict `get` 확인 패스**로 수정(아래 §A-4 정확성 ①). 테스트 4케이스 추가(인덱스 지연 재현 mock 포함) → 총 11케이스. A-6 는 리뷰에서 "병렬화 자체의 권한 완화 없음"으로 확인돼 **무변경** |

---

## 변경 파일

| 파일 | 라인 | 내용 |
|---|---|---|
| `src/nosql/query/CustomEntityManager.js` | +`findByWherePaged()` (기존 `findByFilterExists` 바로 위, 144~194) | 인덱스 동등조건 + 커서 페이징. `findByWhere`(limit 상한에서 잘리고 커서 폐기)의 페이징 버전. **기존 메서드는 무변경** |
| `src/queue/consumer.js` | 232~243 (`JOB_BATCH_PAGE_LIMIT`, `STRICT_CONFIRM_MAX`), 245~342 (`checkJobCompletion`) | A-4. 배치 전량 fan-in → `jobId` 인덱스 페이지 스캔 **+ 누락 키 strict get 확인**(rev2) |
| `src/permission/PrincipalResolver.js` | 20~22(헤더), 219~249(`loadUserRows` + `buildPrincipal` 진입), 285~286(구 2단계 제거) | A-6. `isAdministrator()` ∥ `getUserInfoService()` 병렬화 |
| `src/queue/__test__/JobCompletion.test.js` | 신규 | A-4 회귀 고정 — 멱등성·읽기 횟수·**인덱스 지연** (11 케이스) |

`manifest.yml` 무변경 — 새 KVS 속성·엔티티를 만들지 않았다(422 함정 회피). `job`/`job_batch` 스키마 그대로.

---

## A-4. `checkJobCompletion` — B² → B

### 무엇을 바꿨나

이전: 배치가 하나 끝날 때마다 `findById(\`${appJobId}-batch-${i}\`)` 를 `i = 0..totalBatches-1` **전부** 발행.

```js
// before — KVS 읽기 = B × (B+1) ≈ B²
const batchResults = await Promise.all(
    Array.from({ length: totalBatches }, (_, i) =>
        jobBatchManager.findById(`${appJobId}-batch-${i}`).catch(() => null)));
```

이후: `job_batch` 의 **`jobId` 인덱스**(manifest 에 이미 선언돼 있다)를 커서 페이징으로 1회 훑고,
**스캔이 못 채운 키만** 결정적 키로 strict `get` 확인한다.

```js
// after — 판정 1회당 인덱스 ceil(완료배치수/100) 페이지 (+ 종반에만 누락 키 strict get)
const scan = await jobBatchManager.findByWherePaged('jobId', appJobId, JOB_BATCH_PAGE_LIMIT, total);
...
if (missing.length > STRICT_CONFIRM_MAX) return;          // 아직 갈 길이 멀다 — fan-in 회피
const confirmed = await Promise.all(
    missing.map(key => jobBatchManager.findById(key).catch(() => null)));
for (...) if (!confirmed[i]?.done) return;                // 실제 미완료 — 보수적 종료
```

`JOB_BATCH_PAGE_LIMIT = 100` (KVS 쿼리 limit 상한), `STRICT_CONFIRM_MAX = 10`.

### 정확성 ① 인덱스는 eventual consistency 다 (rev2 — Codex 리뷰 치명 지적)

**리뷰가 옳았다.** Forge Custom Entity 의 `query()`(인덱스 조회)는 **최종 일관성**이라,
마지막 배치가 자기 레코드를 `saveTTL` 로 쓴 **직후**의 스캔이 그 레코드를 아직 못 볼 수 있다.
rev1 은 그 경우 `total-1` 을 세고 조용히 `return` 했고, **뒤이을 이벤트가 없으므로 job 이 `RUNNING` 에
영구 잔류**한다. 종전 개별 `get()` 은 strict consistency 라 없던 회귀이며,
in-memory Map 테스트는 즉시 가시성이라 이를 포착하지 못했다(리뷰 지적 그대로).

rev2 의 복구 방식:

1. **배치 키가 결정적이다** — `${appJobId}-batch-${i}` (i = 0..total-1). 스캔 결과와 대조해
   **누락 키를 정확히 지목**할 수 있다. 이 키 규칙은 **종전 fan-in 이 이미 쓰던 것**이라 새 가정이 아니다
   (두 enqueue 경로 `UserService.js:591`·`SubscriptionBackfill.js:146` 이 같은 형식으로 `batchId` 를 만든다).
2. **누락 키만 `findById`(strict) 로 재확인** — 인덱스 지연이었으면 여기서 보이고 완결된다.
   실제로 없거나 `done` 이 아니면 `return`(보수적 미완료).
3. **자기 포함(self-inclusion)은 이 패스에 흡수된다.** 판정을 호출한 배치 자신도 누락 키로 잡히고,
   `get` 은 strict 이므로 **자기 write 는 반드시 보인다.** 별도로 "자기는 done" 이라고 카운트만 올리는
   방식은 그 배치의 `processedCount`/`failCount` 를 모른 채 세는 것이라 **집계값이 틀어진다** —
   어차피 값이 필요하므로 strict `get` 이 자기 포함의 상위 호환이다.
   (테스트: 지연된 마지막 배치의 `processedCount` 까지 정확히 합산되는 것을 고정했다.)
4. **`STRICT_CONFIRM_MAX = 10` 상한** — 없으면 초반 판정(누락이 아직 수십~수백)이 전량 fan-in 으로
   되돌아가 B² 가 부활한다. strict 확인은 누락이 10 이하로 줄어드는 **종반 몇 회**에서만 발생하므로
   추가 비용이 `Σ_{m=0..10} m = 55` 회로 **상수 상한**을 갖는다.
   값 근거: 큐 동시성이 3(업로드)/2(백필)이라 인덱스 반영을 기다리는 write 는 많아야 한 줌이며,
   10 은 3배 이상의 여유다.

> 잔여 위험(정직하게): 인덱스 지연이 **동시에 10개를 초과**해 보이지 않는 상황이면 여전히 잔류한다.
> 큐 동시성이 3/2 인 이상 그만큼의 write 가 동시에 in-flight 일 수 없어 실질 위험은 없다고 본다.
> 완전한 제거는 전량 strict fan-in(=B², 감사가 지적한 원래 문제)뿐이라 이 지점에서 균형을 잡았다.

### 정확성 ② 멱등성 논증 (큐는 병렬·재시도 소비다)

**카운터를 도입하지 않았다.** Forge KVS 에는 트랜잭션도 원자적 증가도 없으므로 read-modify-write
카운터는 두 방향 모두로 깨진다 — (a) 동시 배치의 **갱신 유실**로 완료가 영영 오지 않거나,
(b) 재시도 배치의 **중복 증가**로 4/5 상태에서 조기 완결된다. 정확성 우선 지시에 따라 배제했다.

대신 **배치 레코드 자체를 진실의 원천**으로 삼는다. 성립 근거 3가지:

1. **미완료 레코드가 존재하지 않는다.** `job_batch` 는 처리가 끝난 뒤 `done: true` 로만 저장된다
   (`consumer.js` 의 `saveTTL` 호출 3곳 — 업로드 성공 / 구독 백필 성공 / 구독 stale 폐기.
   `done:false` 를 쓰는 경로는 코드 전체에 없다). 적재 시점 사전 생성도 없다.
2. **키가 배치마다 유일하다.** `${appJobId}-batch-${index}` — 재시도로 같은 배치가 몇 번 저장되든
   **같은 키를 덮어쓴다.** 따라서 "서로 다른 키의 done 레코드 수" = 완료 배치 수이며 **단조 증가**한다.
   (스캔 결과를 `key` → 값 `Map` 에 담아 페이지 경계 중복까지 흡수한다. rev2 의 strict 확인분도
   같은 `Map` 에 같은 키로 들어가므로 이중 계수가 생기지 않는다.)
3. **다른 job 이 섞이지 않는다.** `appJobId` 는 job 생성 시점의 새 UUID 다
   (`UserService.js:584`, `SubscriptionBackfill.js:142`) → `jobId` 인덱스 조회 결과가 이 job 것뿐이다.

결론: 새 구현은 **종전과 같은 키 집합(인덱스 0..total-1)을 세는 다른 방법**일 뿐이다.
집계도 종전처럼 인덱스 0..total-1 만 순서대로 합산하므로(`Array.from({length: total}, ...)`)
완료 시점·최종 상태·`processed`/`failed` 값이 바뀌지 않는다.

부수 조건 2개:
- **스캔 실패는 완료로 판정하지 않는다.** `findByWherePaged` 실패 시 로그 후 `return` — 다음 배치(또는
  재시도)가 다시 판정한다. 종전 `findById(...).catch(() => null)` 이 "해당 배치 미완료"로 처리한 것과 같은
  보수적 방향이다.
- **`totalBatches` 유효성 가드 추가.** `Number.isInteger(total) && total > 0` 이 아니면 즉시 return.
  새 구현에서 이 값이 스캔 상한의 입력이라 필요했다. 부수적으로 종전의 잠재 버그도 막는다 —
  `totalBatches` 가 `undefined` 면 구 코드는 `0 < undefined === false` 로 통과해 **처리량 0으로 COMPLETED**
  를 찍었다. (테스트로 고정)

### 비용

`B` = 배치 수. job 1건 총 KVS 읽기 = **인덱스 스캔** `Σ_{k=1..B} ceil(k/100)` + **strict 확인** ≤ `Σ_{m=0..10} m = 55`.
(strict 확인은 누락이 10 이하인 종반 판정에서만 발생한다.)

| 시나리오 | before (`B×(B+1)`) | after (스캔 + strict) | 절감 |
|---|---|---|---|
| 사용자 업로드 U=1,000 (B=50) | 2,550 | 50 + ≤55 = **≤105** | −95.9% |
| 사용자 업로드 U=5,000 (B=250) | 62,750 | 450 + ≤55 = **≤505** | −99.2% |
| 사용자 업로드 U=10,000 (B=500) | 250,500 | 1,500 + ≤55 = **≤1,555** | −99.4% |
| 구독 백필 N=2,000 (B=40) | 1,640 | 40 + ≤55 = **≤95** | −94.2% |
| 구독 백필 N=10,000 (B=200) | 40,200 | 300 + ≤55 = **≤355** | −99.1% |

B ≤ 100(=사용자 2,000명 / 구독 이슈 5,000건)이면 스캔이 **판정 1회 = KVS 1회**로 완전 상수다.
B ≤ 10 인 소규모 job 은 매 판정이 strict 확인 구간에 들어가 사실상 종전 fan-in 과 비슷하지만
(≤110 회) 절대량이 무의미해 문제되지 않는다 — B² 문제는 B 가 클 때의 것이다.

### 영향 범위

`checkJobCompletion` 은 `consumer.js` 안의 **호출 5곳이 공유**하므로 두 큐가 함께 이득을 본다.

| 호출부 | 경로 |
|---|---|
| `uploadUsers` `:36` | 재시도 — 이미 done 인 배치 재소비 |
| `uploadUsers` `:93` | 정상 배치 완료 |
| `backfillSubscription` `:154` | 재시도 — 이미 done 인 배치 재소비 |
| `backfillSubscription` `:170` | 구독 stale 폐기 배치 |
| `backfillSubscription` `:215` | 정상 배치 완료(`finally`) |

→ **엑셀 사용자 업로드 + RFC-171 구독 백필 양쪽 모두** 개선된다. 두 경로 모두 배치 키 형식과
`jobId` 속성이 동일해 별도 분기가 없다.

**resolver 응답 계약 변경 없음.** `getJobBatch`(`JobService.getJobBatchService`)는 종전 `findByWhere` 를
그대로 쓰고 프론트 폴링(`JobPollingManager` → `getUploadJobStatus`)이 읽는 `job` 레코드 shape도 불변이다.

---

## A-6. 권한 가드 고정비 — 직렬 선행 제거

감사가 지목한 **1순위만** 적용했다. 2순위(L1 캐시 in-flight dedup)는 "Forge 컨테이너 재사용 여부 미확정"
이라 지시대로 **하지 않았다.** 3순위(admin 판정 별도 TTL)도 미적용.

```js
// before — /mypermissions 왕복이 users SQL 앞에 직렬로 선다
const isAdmin = await isAdministrator();
if (isAdmin) { ... await getUserInfoService({ accountId }) ... }
...
dbUserInfo = (await getUserInfoService({ accountId }))?.rows ?? [];

// after — 두 경로가 **모두** users 행을 쓰므로 병렬로 묶는다 (왕복 2단 → 1단)
const [isAdmin, dbUserInfo] = await Promise.all([
    isAdministrator(),
    loadUserRows(accountId),
]);
```

### 판정 불변 논증

- **호출 횟수가 그대로다.** admin 경로도 비admin 경로도 원래 `getUserInfoService` 를 정확히 1회 부른다
  (admin 은 표시용 팀 컨텍스트, 비admin 은 권한 세트/팀 결정). 병렬화는 **시점만** 바꾼다.
- **`isAdministrator()` 는 catch 하지 않았다.** 실패는 종전과 동일하게 `buildPrincipal` → `resolvePrincipal`
  로 전파돼 가드가 **fail-close** 한다. `loadUserRows` 는 절대 reject 하지 않으므로
  `Promise.all` 이 unhandled rejection 을 만들지 않는다.
- **users 조회 실패 흡수 방향이 같다.** 종전에도 admin 경로는 `try/catch` → 팀 정보 없음,
  비admin 경로는 `try/catch` → `rows=[]` → 미등록(fail-close)이었다. 이제 `loadUserRows` 한 곳에서
  `[]` 로 흡수하고 **아래 분기가 그대로 같은 결론**에 도달한다(로그 문구는 `getUserInfoService error` 로 통일).
- **분기 순서 불변.** `admin → 미등록 → 팀 컨텍스트 → 권한 세트 → 스코프` 순서를 한 줄도 바꾸지 않았다.
  특히 `resolveTeamContext` 는 여전히 **users 행 확인 뒤에만** 호출된다 —
  stale `team.leaderAccountId` 로 팀장 권한이 부활하지 않는다는 §4-1 fail-close 전제가 유지된다
  (`principalResolver.test.js` 의 `expect(mockGetTeamIndex).not.toHaveBeenCalled()` 가 이를 고정하며 통과).
- **유일한 관측 가능 차이**: `isAdministrator()` 가 실패하는 경우에도 users SQL 이 이미 발행돼 있다
  (버려진다). 판정 결과·에러 전파에는 영향이 없다.

> rev2 — Codex 리뷰가 이 항목을 독립 검증했고 *"admin 판정 실패는 계속 전파되어 fail-close 이고,
> users SQL 실패·미등록 사용자의 principal 결과도 기존 분기와 동일. 병렬화 자체의 권한 완화는 없음"*
> 으로 확인됐다. **A-6 는 rev2 에서 변경하지 않았다.**

### 비용

캐시 미스 1회당 왕복이 **2단 → 1단**. `/backoffice/users` 진입(동시 invoke 6개) 기준 가드 지연이
`6 × (Jira RTT + SQL RTT)` → `6 × max(Jira RTT, SQL RTT)` 로 줄어든다. **호출 횟수 자체는 감소하지 않는다**
(그건 감사 2·3순위의 몫이고 이번 범위 밖이다).

---

## 테스트 결과

```
npm test  (루트, jest)
Test Suites: 71 passed, 71 total
Tests:       1121 passed, 1121 total
Time:        35.49 s

npx jest test/permission
Test Suites: 7 passed, 7 total
Tests:       167 passed, 167 total     ← 권한 계약 전량 통과 (절대 조건)
```

신규 `src/queue/__test__/JobCompletion.test.js` 11/11:

| 케이스 | 고정하는 것 |
|---|---|
| 일부 배치만 끝나면 job 을 최종 상태로 넘기지 않는다 | 판정 임계 불변 |
| 전 배치가 끝나면 COMPLETED 로 집계된다 | 집계식 불변 |
| Jira 미검색 건이 있으면 PARTIAL 로 집계된다 | `failCount` 합산 불변 |
| **재시도로 같은 배치를 다시 소비해도 완료 수가 부풀지 않는다** | **멱등성** — 4/5 상태에서 배치 0·1 재소비해도 RUNNING 유지, 마지막 배치 도착 시에만 완결되고 `processed` 가 중복 합산되지 않음 |
| 재시도가 끼어도 이미 done 인 배치는 Jira 재조회 없이 집계만 다시 한다 | 기존 중복 처리 가드 무회귀 |
| **KVS 읽기가 배치 수의 제곱이 아니다 — 스캔 B회 + 종반 strict 확인** | B=30 소비 시 인덱스 페이지 30회(=B), strict get 은 상한 55 이내, 총합 < 930/4. 종전 fan-in 이면 930회 |
| `totalBatches` 가 유효하지 않으면 완료로 판정하지 않는다 | 새 가드 |

**rev2 추가 — `describe('인덱스 최종 일관성 — 완료 판정이 멈추지 않는다')`**
mock 에 `mockIndexLagKeys` 를 두어 "인덱스(query)에는 안 보이지만 `findById`(get)로는 보이는" 상태를 재현한다.

| 케이스 | 고정하는 것 |
|---|---|
| **마지막 배치가 인덱스에 아직 안 보여도 strict get 으로 완결된다** | Codex 지적의 정확한 재현 — 스캔은 `total-1`, get 은 존재 → **COMPLETED**. 지연된 레코드의 `processedCount` 까지 정확히 합산 |
| 전 배치가 인덱스에 지연돼도(임계 이내) 완결된다 | 지연 폭이 커도 `STRICT_CONFIRM_MAX` 이내면 복구 |
| **스캔·get 모두 미존재면 RUNNING 을 유지한다** | 지연이 아니라 진짜 미완료 → 조기 완결 없음. 누락 키로 `findById` 를 실제 발행했는지도 단언 |
| 인덱스 지연이라도 실제 미완료 배치가 섞여 있으면 완결하지 않는다 | 지연 1건 + 미도착 1건 혼재 시 보수적 판정 |

---

## 배포 시 확인할 것

- `manifest.yml` 변경이 없으므로 스키마 재배포 이슈 없음. `job_batch` 의 `indexes: [jobId]` 는 **이미 선언돼
  있고**(`manifest.yml:337-338`) 같은 인덱스를 `getJobBatchService` 가 이미 프로덕션에서 쓰고 있다.
- 실환경 확인 포인트: 대량 업로드(배치 100개 초과) 1회를 돌려 job 이 `COMPLETED`/`PARTIAL` 로 정상 전이하는지
  — 커서 페이징 2페이지 이상 경로와 **실제 인덱스 반영 지연 폭**은 배포 후에만 검증 가능하다(테스트는 mock).
  지연 폭이 `STRICT_CONFIRM_MAX = 10` 을 넘는 정황이 관측되면 이 상수만 올리면 된다.
