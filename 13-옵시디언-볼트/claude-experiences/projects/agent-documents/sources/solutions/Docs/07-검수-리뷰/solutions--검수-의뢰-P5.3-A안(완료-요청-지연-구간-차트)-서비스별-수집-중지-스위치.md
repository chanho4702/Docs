# 검수 의뢰 — P5.3 A안(완료 요청 지연 구간 차트) · 서비스별 수집 중지 스위치

날짜: 2026-09-17 · 요청자: Claude · 대상 모델: `gpt-5.6-sol`(reasoning effort `high`)
브랜치: BE·FE 모두 `master`(미푸시) · 티켓 `#ZM-122`

---

## 0. 이 의뢰서로 봐 줬으면 하는 것

두 덩어리다. **서로 독립**이니 따로 판정해도 된다.

| # | 덩어리 | 성격 | 위험이 큰 지점 |
|---|---|---|---|
| A | 완료 요청 **지연 구간 차트**(FE 전용) | 신규 화면 부품 | 모집단 혼동 · 관측 없음/0건 · 경계 보간 |
| B | 서비스별 **수집 중지 스위치**(BE+FE) | 신규 상태 축 + 수신 경로 분기 | 숨김과의 혼선 · 캐시 무효화 누락 · 계약 확장 |

🔴 **정직성 규칙이 이 레포의 1순위다.** "관측 없음 ≠ 0", "표시 n / 관측 m", 없는 값을 만들어
내지 않기. 그 규칙을 깨는 것이 있으면 다른 어떤 지적보다 먼저 올려 달라.

---

## A. 완료 요청 지연 구간 차트

### 무엇이고 왜 만들었나
제니퍼·와탭의 **액티브 트랜잭션 속도 차트**(진행 중 요청을 경과 구간으로 쌓는 그림)를 지금 가진
데이터로 만들 수 있는 만큼 세운 것이다. 진행 중 요청을 쌓으려면 **요청 시작 이벤트**가 필요하고
그건 자바 에이전트 확장(P5.3b, 미구현)이 있어야 온다. 그래서 **이미 끝난 요청**을 걸린 시간대로
가른다. 사용자와 합의된 범위다(B안은 별도 과제로 남았다).

### 파일
- `moveseyee_fe/src/pages/application-monitoring/realtime/liveSpans/latency.ts` (집계)
- `moveseyee_fe/src/lib/echarts/apmLatencyBands.ts` (옵션 빌더)
- `moveseyee_fe/src/pages/application-monitoring/realtime/ApmLiveLatencyBands.tsx` (렌더)
- `moveseyee_fe/src/pages/application-monitoring/realtime/ApmActiveTab.tsx` (배선)
- `moveseyee_fe/src/pages/application-monitoring/realtime/__tests__/apmLiveSpansLatency.test.ts` (회귀 10건)
- 정본: `_workspace/designs/devdesign_apm-realtime-ux.md` §1.6

### 설계 판단 — 여기를 깨 주길 바란다
1. **모집단이 산점도와 다르다.** 산점도 점은 버킷당 상한이 걸린 표본이고, 이 차트는 `stats.hist`
   (수신 전량)를 쓴다. 근거는 BE `LiveSpanRing#offer`가 `stats.add`를 먼저 하고 보존을 나중에
   판단한다는 것(`LiveSpanRing.java:257`). **이 전제가 실제로 맞는가?** 틀리면 차트 각주가 거짓이다.
2. **구간 경계를 `hist` 칸 경계 위에만 놓았다**(100 ms / 500 ms / 1 s / 5 s / 그 위 = bin
   0–5 / 6–7 / 8–9 / 10–11 / 12–14). 보간이 0인 것이 맞나? `LiveSpanStats.BOUNDS`와 대조해 달라.
3. **`histOverflow`를 더하지 않는다**(= `hist[14]`의 사본). 실제로 이중 계수가 없는가?
4. **관측 없는 칸은 `null`로 두어 막대를 안 그린다.** 0으로 그리면 "그 시각 0건"이 된다는 판단인데,
   ECharts 누적 막대에서 `null`이 **앞뒤 칸의 누적을 어긋나게 하지 않는지** 봐 달라.
5. **칸 배정 식**이 `active.ts`의 스파크라인과 같은 식이다
   (`slot = N - 1 - floor((to - b) / binMs)`). 두 부품이 같은 1초를 같은 자리에 그리는가?
6. **창 선택지를 받은 범위(`config.snapshotSeconds`)로 제한**했다. 못 받은 구간을 "요청 없음"으로
   읽히게 하지 않으려는 것인데, 경계 조건(스냅샷이 60초 미만이면?)이 안전한가?

### 함께 고친 것 둘(작음)
- `ApmLiveScatter` 브러시 **채움색 제거**(선택 영역이 점을 덮었다). 경계 2px만 남겼다.
- **액티브 요청 목록 문구 정정** — "제공하는 서비스가 없습니다"(고객사 탓) → "아직 만들지
  않았다 + 무엇이 없어서 못 만드는가". 설치로 해결되지 않으므로 수집기 링크도 제거했다.

### 함께 한 외관 정리(게이지)
`lib/echarts/apmGauge.ts` — 눈금 `splitNumber: 4`, 잔눈금 제거, 중립 호 색을 `borderSubtle`→
`border`, 반지름 96%→88%, 라벨 거리 14→17. ⚠️ **`roundCap: true`를 켰다가 되돌렸다** — 구간 색이
둘 이상이면 ECharts가 띠를 중심까지 채운 부채꼴로 그려 다이얼이 통째로 색 원판이 됐다(실측).
같은 함정을 다른 게이지에서 밟고 있지 않은지 봐 달라.

---

## B. 서비스별 수집 중지 스위치

### 무엇이고 왜 만들었나
서비스 화면에서 **특정 서비스의 적재만 멈출** 방법이 없었다. 기존 `state = HIDDEN`은 목록에서
감추는 **표시 억제**일 뿐이고 저장 경로는 그 값을 보지 않는다.

### 🔴 핵심 설계 결정 — 여기가 가장 위험하다
**숨김과 다른 축으로 두었다.** 네 조합이 모두 실재한다.

| | `collecting = true` | `collecting = false` |
|---|---|---|
| `state = ACTIVE` | 평범 | **목록에 보이는데 저장은 안 함** |
| `state = HIDDEN` | 안 보이는데 계속 쌓임(기존 동작) | 둘 다 |

- **멈춰도 `last_seen_at`은 갱신된다.** 판정을 `ApmRegistrar`의 조회·touch **뒤**에 두었다.
  그래야 화면이 "수집 중지 · 마지막 수신 10초 전"이라고 적을 수 있고 자동 숨김 TTL이 돌아
  사용자가 끈 서비스가 목록에서 사라지지 않는다. 🔴 **이 순서가 정말 안전한가?**
- **`touchSeen()`이 수집을 재개시키지 않는다**(숨김은 재개시킨다). 의도적 비대칭인데 납득되는가?
- **폐기 사유를 `COLLECTION_PAUSED`로 새로 갈랐다**(`PENDING`·`REJECTED`와 뭉치지 않는다).
  이미 승인한 사람에게 화면이 "승인하세요"라고 말하지 않게 하려는 것이다.
- **라이브 스팬도 같은 축으로 거절**한다(`LiveSpanRejection.serviceCollectionPaused`).

### 파일
- `V60__apm_service_collecting.sql` (`collecting boolean not null default true`, `collection_paused_at`)
- `core/domain/ApmService.java` — 필드 2 + `pauseCollection`/`resumeCollection`
- `service/registry/auto/Resolution.java` — `Paused` 갈래 신설(sealed)
- `service/registry/auto/ApmRegistrar.java` — `CachedService.collectionPaused` + 판정
- `collector/ingest/drop/ApmDropReason.java` — `COLLECTION_PAUSED`
- `collector/ingest/resolve/ApmRegistrarServiceResolver.java` — 매핑
- `collector/ingest/live/{LiveMetadataSource,LiveSpanRejection,LiveSpanIngestor}.java` — 라이브 경로
- `service/list/{ApmServiceUpdateReqDto,ApmServiceRowDto,ApmServiceDetailDto,ApmServiceQueryService}.java`
- FE: `types/apm.ts` · `services/ApmServiceListPage.tsx` · `services/components/ApmServiceCards.tsx`
- 계약: `_workspace/contract_apm-read-api.md` §1

### 특히 봐 줬으면 하는 것
1. **캐시 무효화.** `ApmRegistrar`가 판정을 캐시하고 그 안에 이 값을 담는다. 스위치를 바꾸면
   `afterCommit(registrar::clearCache)`를 부르는데 — **빠진 경로가 있는가?**
   (승인·거절 API, 삭제, 배치가 서비스 상태를 바꾸는 다른 자리)
2. **라이브 캐시.** `LiveMetadataCache`는 `ApmServiceMetadataChanged` 이벤트로 무효화된다.
   `collecting`이 바뀔 때 그 이벤트를 발행하도록 조건을 넓혔는데 충분한가?
3. **동시성.** 멈춘 직후에도 이미 전송 중이던 배치는 마저 저장될 수 있다. 화면 문구가 그걸
   말하고 있는데(도움말), 더 강한 보장이 필요한 상황이 있나?
4. **계약 확장.** `ServiceRow`에 필드 2개를 **`state` 바로 뒤**에 끼웠다(record 위치 인자).
   계약 골든 3개를 갱신했다. FE 픽스처와 어긋난 곳이 없는가?
5. **권한.** 편집 권한이 없으면 스위치 대신 상태 태그만 그린다(감추지 않았다 — 감추면 데이터가
   왜 안 쌓이는지 볼 수 있는 사람이 관리자뿐이 된다). 이 판단이 맞나?

---

## C. 검증 현황 — 정직하게

| 항목 | 상태 |
|---|---|
| BE `:test` | ⏳ 실행 중(직전 실행에서 계약 골든 3건 실패 → 갱신 후 해당 테스트 green) |
| FE jest(APM 전역) | ⏳ 실행 중(직전 3,242건 중 5건 실패 — 서비스 맵 관련으로 보이며 타 세션 미커밋 작업 영역) |
| tsc · eslint | ✅ 0 |
| 지연 구간 차트 **실 브라우저** | ✅ 헤드리스로 렌더 확인(수집기 실제 데이터 흐름 중) |
| 수집 중지 스위치 **런타임** | ✅ **검증 완료(09-18)** — 멈추면 `COLLECTION_PAUSED` 상승, 재개하면 그 사유만 멈춤, `lastSeenAt`은 계속 갱신, `state`는 ACTIVE 유지 |
| 멈춘 뒤 실제로 적재가 0이 되는지 | ✅ 폐기 카운터로 확인(그 서비스 데이터가 전부 `COLLECTION_PAUSED`로 감) |

⚠️ 런타임은 **정상 경로 한 벌**만 봤다. 동시성(멈춘 직후 전송 중이던 배치)·다중 노드·캐시 TTL 경계는 여전히 미검증이니 코드 리뷰로 봐 달라.

---

## D. 판정 형식

`_workspace/reviews/review_apm-p53a-collecting_codex.md`에 🔴(반드시 고침)·🟡(고치면 좋음)으로
번호를 매겨 달라. 각 항목에 **근거가 되는 파일:줄**과 **틀렸을 때 사용자에게 무슨 일이
일어나는지**를 한 줄로 적어 주면 반영이 빠르다.
