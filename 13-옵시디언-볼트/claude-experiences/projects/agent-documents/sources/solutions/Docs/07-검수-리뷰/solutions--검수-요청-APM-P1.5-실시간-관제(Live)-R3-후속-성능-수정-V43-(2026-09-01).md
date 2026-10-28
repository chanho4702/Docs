# 검수 요청 — APM P1.5 실시간 관제(Live) + R3 후속 성능 수정 + V43 (2026-09-01)

> 코덱스 검수용(COLLAB.md §8). 기준 커밋 BE `7e9f2d8`·FE `4159e00` 이후 **미커밋 증분**. 1~3차 검수(`review_apm-p1*.md`)는 반영 완료.

## 0. 범위·의도 한 줄
사용자 요구 "실시간 유입량·액티브·지금 어디서 장애"를 위해 **수신 직후 10초 링버퍼 + SSE**로 개요 화면에 "실시간(약 30초 이내)" 패널을 붙이고, R3 볼륨 실측이 드러낸 **목록 24h cold 13초·롤업 백필 6분·용량 2.4배 과소**를 고친다. 설계 정본 `../designs/devdesign_apm-live.md`, 실측 `../verification/r3_apm-volume.md`, 계약 `../contract_apm-read-api.md` §9.

## 1. BE — Live (`premium/apm/overview/live/`, 7파일 신규, 2235 green)
- `LiveBuffer`: 10초 버킷·창 15분(90칸)·서비스 축 + route 축(60초만·`__other__` 상한 200)·LRU 축출·절대 던지지 않음(적재 성공 후 `MetricIngestor` ⑦ 훅). p95는 `HistogramRebucketer` 병합 가능 격자만.
- `ApmLiveStreamController`: `GET /apm/live/snapshot`(일반 EP) · `GET /apm/live/stream`(SSE: `snapshot` 1회 → `bucket` 10초마다 **뒤 6칸(60초 겹침)** → `heartbeat` 30초). 인증: 쿠키 + `visitorId` 쿼리 **선택적 대조**(주면 검사·없으면 통과 — `EventSource`가 헤더 못 실음; `VisitorIdCheckInterceptor` 판정 복제). ⚠️ **§6에서 폐기됨 — 지금은 필수다.**
- 설정 `app.apm.live.*`(enabled·window·bucket·route-window·tick·max-services·max-routes·stream-timeout 1800·heartbeat). ⚠️ **§6-5에서 600으로 낮춤 + `max-heap-mb` 신설.**
- 🔴 결정: "초 단위" 불가(에이전트 export 기본 60초·권장 10초 + Collector 5초 + 버킷 10초 = 25~35초) → 문구 계약 "실시간(약 30초 이내)".

## 2. BE — D2 근본(V43)
- `HistogramRebucketer.mergesExactlyInto`: 목적 경계 ⊆ 소스 경계일 때만 접음(분할=날조). 거부 시 수신 격자 그대로 저장 + `RAW_BOUNDS`(변형 사유). `observed_ms` 라벨 신설(ms 거부 격자가 초로 읽히는 반대 방향 1000배 방지).
- `V43__apm_hist_bounds_family_unique.sql`: `UNIQUE(bounds)` → `UNIQUE(bounds, family)`; 조회 키·`ON CONFLICT`·프로세스 캐시 키에 family.

## 3. BE — R3 후속 성능 (완료, 2240 green·신규 5)
- Q1 `pct24h` 5m 기준 + 1m 꼬리(꼬리 시작 = **롤업 워터마크**, 없으면 창 전체 1m) — 상수 30분이면 롤업 지연이 전 서비스 가용성 하락으로 오독됨. `receivedCells` 4-인자 판 제거. ⚠️ cold 13초→? 효과는 **미재측**(스캔 1/15 구조 근거만).
- R1 `maxBuckets` 5m 288→60·1h 48→12. R3 §9 백필 상한 ~80초.
- Q2 `order by` 제거+자바 정렬(4곳) — 🔴 EXPLAIN A/B로 **전제 부정**: 플랜을 정하는 것은 `work_mem`(4MB: Sort+GroupAgg 23.7MB×3 스필 / 64MB: HashAgg 스필 0), `order by`·HIST 24→15칸은 효과 0. 변경은 손해 없어 유지, `HIST_SUMS` 폭 축소는 안 함.
- Q3 롤업 SQL을 `WITH grouped AS MATERIALIZED … INSERT … RETURNING` 한 문장(원본 스캔 2→1, 6.50→6.02초). `AS MATERIALIZED`는 PG 12+.
- O1 설치 가이드 notices 2건(`postgres-tuning` WARNING: work_mem 64MB·shared_buffers 25%·maintenance_work_mem 1GB·max_wal_size 4GB / `capacity-planning` INFO: 686B/행·10svc×3inst×50route=9.6GB/일·7일 67GB·3단 109GB).
- 설계서 v3.3 §4.4/§4.6(용량/화면/롤업 3축 승격 조건) 갱신.

## 4. FE — Live 패널 (완료, 미커밋 17파일, jest 2113 green·신규 47)
- `hooks/useApmLive.ts`: `mergeApmLive(prev, dto)` 한 벌(snapshot·bucket 공용) — `(serviceUid, ts)` 덮어쓰기 → 창 밖 폐기 → 정렬, `endpoints` 전체 교체, 이번 이벤트에 없는 서비스는 창이 빌 때까지 유지. `useApmLiveStream({serviceUid, env, enabled})` — EventSource 생성/`close()`, visitorId는 인터셉터와 같은 `STORAGE_KEYS.X_VISITOR_ID`를 쿼리로, 토큰은 쿠키. `liveStreamUrl`은 `API.defaults.baseURL`(jest가 import.meta를 못 파싱).
- `overview/live/ApmLivePanel`·`ApmLiveDot`·`apmLiveDisplay.ts`. **연결 소유는 개요 페이지 하나**(패널·카드는 값만). URL `?live=1`. 실시간 점 = 마지막 2칸 requests>0(`APM_LIVE_DOT_BUCKETS`).
- 🔴 불안: SSE 실연결 미검증(jsdom에 EventSource 없음) · 크로스 오리진 쿠키+`Allow-Credentials` · 아파치 버퍼링 · 점 기준 2칸이 지연 3칸보다 짧아 실측에서 안 켜질 수 있음 · 토글 off에도 스냅샷 1회 호출(`enabled` 판정용) · BE 미배포면 토글 활성+연결 끊김으로 보임.

## 5. 🔴 불안한 지점(검수 우선)
1. SSE 세션 대조가 **선택적**(visitorId 없으면 통과) — 세션 바인딩 우회 경로인지, 허용 가능한 완화인지. → ✅ **우회 경로가 맞았다. §6-1에서 필수화.**
2. 아파치 SSE 버퍼링 미검증(실서버 FE 앞단) · 연결 누수(토글 off·탭 닫힘) · 라이선스는 연결 시점에만.
3. 메모리 상한 ~27MB는 계산값(route 카디널리티 큰 서비스 미실측).
4. 액티브 트랜잭션은 인스턴스 합산이 아니라 "칸의 마지막 관측값".
5. 증분 6칸 겹침 + FE 덮어쓰기 멱등성 — 늦게 도착한 값이 앞 칸을 덮는 순서 문제 없는가.
6. V43 이후 같은 숫자 격자가 family별로 두 행 — 롤업 `bounds_id` 불일치 처리·`ApmHistogramMerger` 분리 병합이 여전히 맞는가. → ✅ **아니었다. §6-2·§6-3에서 조회 병합·적재 양쪽 수정.**
7. R3 수정의 결과 동일성(Q2 정렬 이관·Q1 하이브리드가 %를 바꾸지 않는가).

---

## 6. 4차 검수 반영 (2026-09-01, `review_apm-p1_5-live_codex.md` → BE)

전량 반영. `:test` **2262 green / 신규 22 / skip 0**(직전 2240). 커밋은 안 했다.

| # | 심각도 | 지적 | 무엇을 했나 | 파일 | 테스트 |
|---|---|---|---|---|---|
| 1 | 🔴 | SSE의 `visitorId`가 없으면 세션 대조를 건너뜀 = 세션 바인딩 우회 | 판정을 `VisitorSessionChecker`로 **뽑아 인터셉터와 공유**하고, 스트림은 **쿼리 `visitorId` 또는 헤더 `x-visitor-id` 중 하나를 필수화**(빈 문자열도 없는 것으로 본다) → 둘 다 없으면 401. 쿼리 우선·헤더 폴백 | `auth/security/VisitorSessionChecker`(신규) · `VisitorIdCheckInterceptor` · `ApmLiveStreamController` | `ApmLiveStreamControllerTest` 6→8(없음 401 · 빈값 401 · 쿼리 일치 · 헤더 일치 · 헤더 불일치 401) |
| 2 | 🔴 | 조회 병합이 무조건 `rebucket()` → 분할 날조가 조회에서 부활 | `foldOnto`가 **ms로 환산한 뒤** `mergesExactlyInto`가 참일 때만 접는다. 접을 수 없는 조각은 빼고 🔴 **경계까지 버려 백분위를 아예 안 낸다**(부분 관측의 p95를 전체의 p95로 내보내지 않기 위해). 새 플래그 `mixedBounds`를 `RedSeries`에 실어 화면에 알린다. **히트맵 축 접기에도 같은 규칙**을 걸었다(리뷰 지적 밖이지만 같은 결함) | `core/metric/ApmHistogramMerger` · `service/red/ApmRedSeriesDto` · `service/red/ApmSeriesQueryService` | `ApmHistogramMergerTest`(신규 6): 동일 격자 정상 · 초+ms 혼합 → p95 null·플래그 · 병합 가능 격자는 접음(총합 보존) · 분할은 거부 · 경계 미상도 거부 · 단일 조각 무영향 |
| 3 | 🔴 | 같은 PK에 다른 bounds → 뒤 벡터만 버리고 스칼라는 합산(히스토그램 일부·스칼라 전체) | ① 배치 안: `Accumulator`가 **벡터를 통째로 버리고**(sticky) `hist_counts`·`bounds_id`를 NULL로 보냄 ② 배치 밖: UPSERT의 `case when 양쪽 bounds_id가 다르면 null` ③ UPSERT 뒤 **별도 UPDATE로 못 박음**(충돌 행은 `excluded.bounds_id`가 NULL이라 CASE가 안 걸린다) ④ 사유 `BOUNDS_CONFLICT` 신설·카운트 | `collector/ingest/store/ApmMetric1mStore` · `collector/ingest/drop/ApmDropReason` | 단위 5(`ApmMetric1mStoreTest` 16→21) + IT 2(`ApmMetric1mStoreIT` 8→10: 배치를 넘는 충돌 → 둘 다 NULL·스칼라는 정확 / 한쪽 NULL은 충돌 아님) |
| 4 | 🔴 | 개별 상한만 있고 조합 예산이 없음(최댓값 조합 = route 슬롯 60억) | `max-heap-mb`(기본 64) 신설 + 컴팩트 생성자에서 **조합 추정치 교차 검증**, 넘으면 기동 실패(메시지에 추정치·상한·계산식·줄일 값). 🟡6도 같이: `window-seconds`·`route-window-seconds`가 `bucket-seconds`의 배수가 아니면 기동 실패 | `overview/live/ApmLiveProperties` · `application.yml` | `ApmLivePropertiesTest`(신규 7) |
| 5 | 🟡 | 라이선스가 연결 시점에만 — 최대 30분 노출 | **정책 승인 + 창 축소**: `stream-timeout-seconds` 기본 1800 → **600**(10분). FE는 `EventSource` 자동 재접속이라 무영향(재접속이 라이선스를 다시 검사). 대안 2개(tick마다 재검사 / 라이선스 이벤트로 emitter 강제 종료)와의 비교를 설계서 §4에 적었다 | `ApmLiveProperties` · `application.yml` · 설계서 §4 | 기본값 못박기 1건 |
| 6 | 🟡 | 창이 버킷의 배수가 아니어도 기동됨 | #4에 포함(기동 실패 쪽을 골랐다 — 내림 + WARN은 "그 WARN을 읽는 사람은 이미 눈치챈 사람"이라 무의미) | 〃 | 〃 |
| 7 | 🟡 | 단위 테스트가 CORS·프록시 버퍼링·SSE 재연결을 못 봄 | **동의. 코드로 안 닫는다** — 배포 전 런타임 QA 필수 항목으로 남긴다(설계서 §8 "아직 안 한 것" 1~5) | — | — |

### 문서 갱신
- `contract_apm-read-api.md`: §2 `RedSeries`에 `mixedBounds` + 설명 절 · §9.1 권한 열 · **§9.3 "없으면 통과" 문구 폐기·필수로 정정** · §9.3 라이선스 창 30분→10분 · §9.6 설정(600·`max-heap-mb`)
- `designs/devdesign_apm-live.md`: §4 인증(원안이 틀린 이유·공용 판정기) · §4 라이선스 정책 승인 절 · §5 설정표 + **조합 검증 절 신설** · §8 테스트표 · §9 산출물

### 추가(QA 권고 반영)
| 권고 | 반영 |
|---|---|
| SSE 응답에 `X-Accel-Buffering: no` 부재 | `ApmLiveStreamController.stream`이 `X-Accel-Buffering: no`·`Cache-Control: no-cache`를 싣는다. 테스트 어서션 추가(8 green). 아파치는 여전히 `flushpackets=on` 배포 설정 필요 |
| 실시간 점 기준 2칸(20초) 고정 — 고객 export 60초면 안 켜짐 | FE `apm.ts` 상수 "최근 N초"(기본 90초)로 판정 축 변경(칸 수→마지막 관측 ts와 now의 차) |
| `mixedBounds` FE 소비 | `types/apm.ts`·계약 픽스처 반영, 백분위 차트에 "미산출" 배지(`rebucketed` "근사"와 문구 구분) |

### 🔴 이번 반영에서 남은 불안한 지점
1. **경계 충돌의 "확정"이 배치 3회 이상 교대에는 안 통한다.** 이미 NULL로 지운 행에 세 번째 배치가 경계 하나만 들고 오면 `coalesce`가 다시 채운다. 완전히 못 박으려면 "충돌했음"을 기억하는 컬럼이 필요한데 그건 스키마 변경(V44)이라 별건으로 뒀다. 2회까지는 확정된다.
2. **`BOUNDS_CONFLICT` 카운터는 한 배치 안의 충돌만 센다.** 배치를 넘는 충돌은 DB의 `CASE`가 처리하고 자바가 그 순간을 모른다(RETURNING을 붙이면 배치 적재가 행마다 결과를 읽어야 한다). **0이라고 해서 충돌이 없었다는 뜻은 아니다.**
3. **`mixedBounds`가 p95를 통째로 없애는 것이 과한지**는 판단이 갈릴 수 있다. 관측 99%가 한 격자에 있고 1%가 다른 격자여도 그 칸의 백분위가 사라진다. "부분 관측의 p95를 전체로 보여 주지 않는다"는 🔴3의 규칙과 맞춘 결과이고, 되돌리려면 두 곳을 같이 되돌려야 한다.
4. **힙 추정 계수(200B·112B)는 실측이 아니다.** 객체 헤더·정렬·맵 엔트리 오버헤드를 안 셌다 — 실제 점유는 이보다 크다. 설계서 §8 런타임 QA 4번(힙 증가폭 실측)이 여전히 필요하다.
5. **런타임 미검증**: 이번 변경은 전부 단위·IT 수준이다. SSE 실연결(쿠키·아파치 버퍼링)·`max-heap-mb` 거부가 실기동에서 뜨는 메시지·경계 충돌의 실데이터 발생 여부는 확인하지 않았다.
6. **`stream-timeout` 600은 재연결 빈도를 3배로 늘린다.** 동시 시청자가 많아지면 재연결마다 창 전체(90칸) 스냅샷이 나가는 비용을 다시 봐야 한다.

## 7. Live 런타임 QA 결과 (2026-09-01, `../verification/e2e_apm-live-qa.md`)

| 항목 | 판정 | 핵심 수치 |
|---|---|---|
| A. SSE 프로토콜 | ✅ | snapshot(90칸) → bucket 10.00초×6칸 → heartbeat 30초 · visitorId 불일치/무쿠키 401 |
| B. 지연 | ✅ | 요청→링 중앙값 8.9초(최대 12.6) · 화면 도달 중앙값 ≈14초·최악 ≈23초(목표 30초) |
| C. 브라우저 패널 | 🟢 | 헤드리스 CDP. 40초 = 정확히 4칸 밀림 · 오류 엔드포인트 표 40초 내 등장(Errors+Slow 배지) · 트래픽 끊긴 서비스 점만 소멸 · 새로고침 4초 복원 |
| D. R3 성능 | 🟡 | D2~D4 ✅ / **D1(개요 24h 13초→?) 전제 불성립** — 합성 볼륨이 이미 정리돼 비교 불가(현 37,629행). 재측은 볼륨 재생성이 필요 |
| E. V43·RAW_BOUNDS | ✅ | poolWaitP95Ms 4734 → p50 2.99ms · `pool_ms`와 `observed` family가 동일 bounds로 공존 · 롤업 mixed WARN 0 |
| F. 회귀 | ✅ | 4화면 렌더·에러 배너 0 |

코드 결함 0. 🔴 측정 전제 교정: 링의 10초 칸은 **요청 시각이 아니라 exporter export 시각** 기준 — 특정 칸을 겨냥한 검증은 성립하지 않는다. 미검증: 아파치 버퍼링·링 힙 실측·라이선스 만료 중 스트림·`stream-timeout`·`__other__` 비링크.
