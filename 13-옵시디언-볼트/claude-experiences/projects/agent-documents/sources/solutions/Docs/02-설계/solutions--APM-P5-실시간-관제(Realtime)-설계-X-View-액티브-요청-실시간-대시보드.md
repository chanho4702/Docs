# APM P5 — 실시간 관제(Realtime) 설계: X-View · 액티브 요청 · 실시간 대시보드

- 작성: 2026-09-15(v0) · v1 2026-09-15 · v2 2026-09-15 · v2.1 2026-09-15 · v2.2 2026-09-15 · v3 2026-09-15 · v4 2026-09-15 · v4.1 2026-09-15 · v4.2 2026-09-15 · v4.3 2026-09-16 · v4.4 2026-09-16 · **v4.5 2026-09-16**. 상태: 🟢 **v4.5(P5 라이브 계약 대조 반영 — P5.2 화면 착수본)** — **v4.5에서 바뀐 것**: `contract_apm-p5-live.md`(integration-qa, BE HEAD `28a1ad3` 정적 대조)가 잡은 "설계 문서 정정(코드가 정본)" 항목 반영 — `control.resume` 삭제(새 `snapshot.begin` 도착이 재개 신호) · 스트림 열기 전 401 본문 정정(`ApiResult`가 아니라 `{code,errorCode}` 두 필드) · `dictDelta.services`/`instances` 상시 포함 명시 · `stats.histOverflow`는 `hist[14]` 사본(중복 계수 금지) 주석 + `minMs`/`sumMs` 추가(구현 중) · `live{}`/`patterns{}`가 현재 빈 맵임을 §3.2 표에 직접 명시 · `pressure.arenaPressure`를 tick 구간 발생분으로 재정의(현재 구현은 누적 — 계약 대조 C) · §7.1 7단계에 계약 표본 JSON 골든 고정을 필수 산출물로 승격 · §2.6 액티브 합산 규칙이 `LiveBuffer.recordActive`에서 아직 미반영임을 이력으로 명시(세부는 아래 v4.5 전용 요약). v4.4에서 바뀐 것: P5.1 5단계(snapshot·SSE, 커밋 `3c76a74`)·6단계(Collector 생성 설정·운영 관측, 커밋 `8d6f730`) 구현·검수에서 정본을 고쳐야 했던 것만 `[impl-r3 반영]`으로 반영(세부는 아래 전용 요약 및 회신서 `../reviews/review_apm-realtime-design_claude-r3b.md` §9). v4.3은 v4.2에 P5.1 **4단계(집계·dedup·arena) 구현 보고**(`../reviews/review_apm-p51-s4-be_codex-impl.md` — worktree `p5-live` HEAD `84edbb9` 위 미커밋, 전체 `:test` 3,456 green)와 **구현 검수**(`../reviews/review_apm-p51-s4-be_claude.md` 🔴1·🟡13 → **R1(사전 ID 네임스페이스 전역 소진) 수정 후 병합 권고**)에서 **정본 갱신이 필요한 것만**을 **`[impl-r2 반영]`**으로 반영한 판(반영표는 회신서 `../reviews/review_apm-realtime-design_claude-r3b.md` §8). 자료구조 산술 오기 2건(마지막 세그먼트 7,040→7,360 · 버킷 칸수 900→907)을 잡았고, dedup 자료구조를 공유 슬롯 풀·체인·64샤드 만료 FIFO로 교체(상주 5.49→4.12 MiB, 용량 프로퍼티화)했고, 사전 회수 규칙을 참조 카운트에서 "마지막 관측 후 910초"로 바꾸며 🔴 ID 네임스페이스가 프로세스 전역이 아니라 **서비스**여야 함을 명시했다(전역이면 65,534개 소진 후 영구 `__other__`). 그 밖에 §3.3 스팬 단위 거절 사유 11→10종(`instanceBudget`을 표시 축소로 이동, §2.4와의 자기모순 해소) · "잔여 3%" 압박 분기가 산술상 도달 불가임을 명시 · rps 프로퍼티 경로 확정과 LRU 포화 위험 기록 · 요청 단위 503 사유 확장(`dedupFull`·`storageUnavailable` 분리, 콜드 스타트 `internalError` 오분류 방지) · §5.2 힙 표에 4단계 실측 열 추가(합계 재계산) · §7.1 4단계 행에 구현 완료 이력 + 5단계 훅 3종(`copyBucket()`·`copyDictionary()`·`removalsAfter()`) 명시 · reservoir 균등성 회귀 필요(변이 주입으로 "최신 우선"이 미검출됨을 확인)를 반영했다. v4.2는 v4.1에 P5.1 1~3단계 구현 검수(`../reviews/review_apm-p51-s1-be_claude.md` 🔴3·🟡9 → 수정 라운드 R1~R10 전건 반영 `review_apm-p51-s1-be_codex-fix.md`, 커밋 `f4031ef`)와 2~3단계 구현 검수(`../reviews/review_apm-p51-s23-be_claude.md` 🔴2·🟡9, 구현 보고 `review_apm-p51-s23-be_codex-impl.md` — worktree `p5-live` 미커밋)에서 **정본 갱신이 필요한 것만**을 **`[impl-r1 반영]`**으로 반영한 판(반영표는 회신서 `../reviews/review_apm-realtime-design_claude-r3b.md` §7). 설계 결정이 바뀐 곳은 4곳 — 라이선스 전이 "타이머 → 매 요청 재계산·fail-closed"(§2.3.1) · hot path DB 0회의 예외 "라이선스 60초 1회"(§2.3) · rps 429·LRU 예산 분리를 **§7.1 4단계 첫 항목**으로 배정 · 힙 표에 본문 버퍼 16 MiB·파서 보유 4 MiB·임시 dedup 64 MiB 추가(§5.2). v4.1은 v4에 결합 YAML correctness 실측 `../verification/r-p5b_apm-live-yaml-correctness.md`(584줄 — 결론: **v3 yaml FAIL(전송 최대 무한·정리 실패 시 PII 100% 유출) · v4 yaml correctness PASS**, 단 설계를 바꿔야 할 발견 6건 — 그중 🔴 **BE 압축본 상한 512 KiB가 정상 입력을 거절**)을 **`[R-P5b 반영: §n]`**으로 반영한 판(반영표는 회신서 `../reviews/review_apm-realtime-design_claude-r3b.md` §6). v4는 v3에 코덱스 3회차 본판정 `../reviews/review_apm-realtime-design_codex-r3.md`(263줄 — 결론: v3 그대로 API 계약 확정 불가 · **필수 정정 3 반영 시 P5.1 본 구현 착수 가능** · R2′ 격리 재측은 출시 게이트 · R2-1 FAIL 유지(인과 49%는 미확정) · R2-8 설계 결함 확정 · P0 7건 판정 🔴2/🟡4/✅1 · 질문 8 전부 답 · 모순 10행 · 되묻는 질문 없음)을 **`[C-r3 반영]`**으로 전건 반영한 판(반대 유지 0건 — 회신서 `../reviews/review_apm-realtime-design_claude-r3b.md`). v3는 v2.2에 실측 `../verification/r-p5_apm-live-pipeline.md`(functional-qa, 921줄 · **R1 🟡 조건부 PASS · R2 🔴 FAIL**)의 P0 7건·설계 추정 적중/빗나감·미측정 목록을 **`[R-P5 반영: 실측 §n]`**으로 반영한 판(회신서 `../reviews/review_apm-realtime-design_claude-r3.md`). v2.2는 v2.1(수치·단위 모순 정정)에 UX 정본 v1(`devdesign_apm-realtime-ux.md`) §6.2 신규 요청 11~16과 §6.3 후속 F1~F5를 **`[UX-r1b 반영]`**으로 반영한 판. v2.1은 v2(코덱스 2회차 반영 — R-P5 실측 착수 합의, 본 구현 전 필수 8건 반영본)에 UX 1회차 검토 §3(`../reviews/review_apm-realtime-ux_codex-r1.md`)의 간이 확인 🟡 2건(allocation·바이트 상한)과 "새로 드러난 모순" 9행을 **`[X-r1 정정]`**으로 반영한 판. 이 문서는 P1.5 Live(`devdesign_apm-live.md`)를 대체하지 않고 **그 위에 얹는다**.
- 동반 문서: 아키텍처 `devdesign_apm.md` · Live `devdesign_apm-live.md` · 화면/WBS `devdesign_apm-screens-wbs.md` · 안내서 `../guides/apm-handbook/03-constraints.md`·`06-data-path.md` · 실측 `../verification/e2e_apm-live-qa.md`·`r1_apm-collector-roundtrip.md`·`r3_apm-volume.md` · **P5 실측 `../verification/r-p5_apm-live-pipeline.md`**(R1·R2, 2026-09-15 — 이 문서 §6.0의 근거).
- 왕복 기록: 코덱스 1회차 `../reviews/review_apm-realtime-design_codex-r1.md` → Claude 회신 `..._claude-r1.md` → **코덱스 2회차 `..._codex-r2.md`**(결론: R-P5 실측 착수 동의, P5.1 본 구현·계약 확정 전 필수 수정 8건) → **Claude 회신 2회차 `..._claude-r2.md`**(판정별 수용/유지 · 3회차 질문 3 답). 본문의 절마다 **`[C-r1 반영]`**/**`[C-r2 반영]`**(해당 회차를 받아들여 고침) / **`[C-r2 반대 유지: 근거]`**(고치지 않은 이유) / **`[v1 신규]`**·**`[v2 신규]`**(그 회차가 다루지 않은 새 결정)를 단다. v1 표기는 v2에서 바뀐 곳만 `[C-r2 반영]`으로 덮고 나머지는 그대로 둔다. v2.2 표기 **`[UX-r1b 반영]`** = UX 정본 v1 §6.2 요청 11~16을 채택해 고친 곳 / **`[UX-r1b 보류: 근거]`** = 채택하지 않은 곳(근거 필수) — 회신표는 `../reviews/review_apm-realtime-design_claude-r2.md` §7. v3 표기 **`[R-P5 반영: 실측 §n]`** = 실측 문서의 해당 절을 근거로 고친 곳(P0 7건 결정은 Claude 오케스트레이터가 내렸고 코덱스 3회차가 본판정한다) / **`[R-P5 실측 ✅]`** = 설계 추정이 실측으로 확인돼 "추정" 표기를 뗀 곳. v4 표기 **`[C-r3 반영]`** = 코덱스 3회차 판정을 받아들여 고친 곳 / **`[C-r3 반대 유지: 근거]`** = 받아들이지 않은 곳(근거 필수 — **v4에서 0건**). v3 표기 중 v4가 고친 곳은 `[C-r3 반영]`으로 덮고 나머지는 그대로 둔다. v4.1 표기 **`[R-P5b 반영: §n]`** = 결합 YAML correctness 실측 문서의 해당 절을 근거로 고친 곳(설계값 변경 1건 — BE 압축본 상한 — 은 Claude 오케스트레이터 결정, 코덱스 4회차 대상) / **`[R-P5b 실측 ✅]`** = v4 설계가 실측으로 확인돼 "R-P5b 확인 대상" 표기를 뗀 곳. v4.2 표기 **`[impl-r1 반영]`** = P5.1 1~3단계 **구현 검수·구현 보고**에서 드러난 정본 차이(구현이 더 엄격하거나 정본이 단계 배정을 빠뜨린 곳)를 받아들여 고친 곳 — 코드로 확인된 사실은 ✅, 식별자는 **구현 enum 이름**을 정본으로 삼는다. v4.3 표기 **`[impl-r2 반영]`** = P5.1 **4단계(집계·dedup·arena)** 구현 검수·구현 보고에서 드러난 정본 차이(자료구조 산술 오기 정정·자료구조 교체·단계 배정 누락)를 받아들여 고친 곳 — 반영표는 회신서 `../reviews/review_apm-realtime-design_claude-r3b.md` §8. v4.4 표기 **`[impl-r3 반영]`** = P5.1 **5단계(snapshot·SSE)·6단계(Collector 생성 설정·운영 관측)** 구현 검수·구현 보고에서 드러난, **정본을 고쳐야 하는** 정본 차이(거절 변환의 세션/권한 혼동·재접속 규약 명문화·checksum 산식 고정·snapshot 재시작 계약·알람 판정 불가 구간·별칭 통일·골든 회귀·지표 합산 오류·자기 로그 오염)를 받아들여 고친 곳 — 반영표는 회신서 `../reviews/review_apm-realtime-design_claude-r3b.md` §9.
- 표기: 🔴 어기면 데이터가 조용히 틀리는 규칙 · ⚠️ 알고 있어야 하는 한계 · ✅ 코드·실측으로 확인된 사실 · **추정** = 아직 재지 않은 숫자 · ❓ = 코덱스에 물을 것 — v3의 8건은 3회차가 전부 답했다(§8-5 답 표). **v4에 남은 ❓는 없다**; 실측으로만 답할 수 있는 것은 질문이 아니라 R-P5b·R-P5″·R2′ 시험 항목으로 옮겼다(§6.0).
- **v2에서 바뀐 것 한 눈에** `[C-r2 반영]`: ① 수신 처리율·서버 보관량·브라우저 표시량 **3분리**(§0 표) — "1,500점/초까지 화면 전량 표시" 문구 삭제 ② 고정 세그먼트 chunk pool 폐기 → **전역 슬롯 arena + 서비스별·전역 예산**(§2.4) ③ 메타 캐시 **refresh-ahead·hard expiry·commit 이후 무효화·generation·라이선스 단일 freshness**(§2.3.1) ④ snapshot **발행 경계·`sinceSeq`·`viewKey`·`pointsRev/statsRev`·`provisionalUntil`·ID 재사용 금지**(§2.5·§3.2) ⑤ snapshot **chunk**·재생 로그·연결 큐 **바이트 상한**(§2.5·§3.3) ⑥ `control` 거절의 **명시적 종료·재접속 상태 머신·거절 변환 위치**(§2.5) ⑦ partialSuccess **수량 보존식**(§2.3) ⑧ **첫 출시 HTTP SERVER만**·오류 정의 2축·**첫 배포 BE 1대**·단일 노드 메트릭 공급 경로(§0·§2.7·§3.1) ⑨ §6 실측 계획을 코덱스 §5.2~5.5 절차·합격식으로 **교체(실측 계약)** ⑩ §7 공수를 첫 출시/P5.4 분리 ⑪ **UX 정본 `devdesign_apm-realtime-ux.md` §6 요청 10건 반영**(`[UX-r1 반영]`/`[UX-r1 보류: 근거]` — 새 메뉴 `/application-monitoring/realtime`·payload 필드 5종·P5.6 비동기 모니터링 신설·점 클릭 상태 머신·`realtimeSort` 기본 꺼짐). 화면 상세는 UX 정본이 갖고 이 문서 §4는 계약과 원칙만 남긴다.
- **v2.1에서 바뀐 것 한 눈에** `[X-r1 정정]` — 산술은 전부 스크립트로 재계산해 표에 식을 병기했고, 단위는 **MiB**(1,048,576B)로 통일했다(HTTP 본문 상한 2MB·Collector 큐 5MB 같은 **설정값 표기는 그대로**): ① arena **1.4M × 45B = 60.08 MiB**(v2 "63MB"는 MB), 헤더 **40B = 6.87 MiB**(필드별 타입 표), 집계 슬롯 **104B = 17.85 MiB**, dedup **5.49 MiB** ② arena 물리 할당을 **세그먼트(16,384 슬롯 = 720 KiB) 단위 lazy**로 — 상한 1.4M은 고정(N1 유지), 정상 부하 retained 38.67 MiB(논리 38.62)로 "논리 점유 vs retained" 병기 ③ 사전 예산 **8 → 20 MiB**(상한 산술 17.24 MiB) + 예산 도달 시 등록 거부→`__other__` ④ base 보관 목표 **1,350k → 1,300k** · 압박 임계 **5% → 3%**(1,358,000 ≥ 예약 합 1,350,000) ⑤ SSE **고유 바이트 전역 상한 96 MiB** 정의(로그 64 + in-flight 16 + 퇴출 보유 8 + degraded 직렬화 8) ⑥ snapshot **전송량(32/96) vs 동시 chunk 버퍼(≤4 MiB/snapshot)** 분리·대기 상한 **10** 통일·공유 chunk 참조 수명 ⑦ frame 2MiB 초과 시 **분할(≤4 part) → 점 생략** 정책 + `snapshot.begin` ≤ 64 KiB(사전은 `dict` chunk) ⑧ arena `flags` 비트를 §3.1과 통일, "관측 m = Σ `stats.count`"(base+emphasis 합산 금지). 정정 표는 `../reviews/review_apm-realtime-design_claude-r2.md` §6.
- **v2.2에서 바뀐 것 한 눈에** `[UX-r1b 반영]` — UX 정본 v1 §6.2 요청 11~16(+§6.3 후속 F1~F5), **보류 0건**: ① §4.0 URL 키 `window`→**`win`**(키 목록 정본은 UX §0 표, `trace`→`pt`도 통일) + 리마운트 전제 정정 — 전환 key는 **`location.pathname`**(✅ `layouts/app/App.tsx:240`, 주석 235~239)이라 같은 경로 query 변경은 리마운트 없음, 상태를 URL에 두는 이유는 공유·새로고침·뒤로가기 ② §3.2 `config` 주석의 서비스별 임계 EP를 **`GET /apm/services/{uid}/alert-rules`**(✅ requireRead `ApmAlertRuleController:278~281` — `GET /apm/alert-rules`는 requireEdit `:108~110`)로 정정 + **`config.errorRateThresholdPct`**(전역 `ERROR_RATE`, 없으면 `null`) 신설 + §4.1·§4.2 반영 + §4.1 상태 머신 `stored` 조건(업무 성공 ∧ detail 유효 ∧ spanId 존재)·**`stored.spanMissing`** ③ §3.2 `dict.instances`에 안정 식별값 **`key`**(전체 `service.instance.id` 해시, URL `inst`용) — 사전 산술 17.24 → **17.92 MiB**(예산 20 유지, §2.4·§5.2) ④ §3.2·§4.4 `patterns[]`: `confidence` = 0~1 휴리스틱 점수(R² 아님), `LATENCY_TREND`에 **`rSquared`**, `ERROR_CONCENTRATION`에 **`errorShare`·`trafficShare`** ⑤ §7 단계표: UX 추가분(P5.2 +0.5~1일·P5.3 +0.5일·P5.3b +0.5일) **포함**으로 명시 → 첫 출시 합계 **약 5~8일**(v2 4~6일), P5.6 행 "첫 출시 5항목 FE 1.5~2.5일 + R-P5.6 0.5일, R-P5.6 합격 게이트", **P5.6b 행 신설**(BE F1~F4 포함, 추정 3~5일), 첫 출시 합계에 P5.6·P5.6b 미포함 명시, **"후속 BE 항목 F1~F5" 표** ⑥ §0·§4.5 비동기 정의를 **3층(관계 · 시간상 특징 · 실제 실행 방식)**으로 교체, "PRODUCER→CONSUMER cross-trace" 확정 표현 삭제, 요약 "응답에 포함된 링크 L개", R-P5.6을 출시 게이트로. 회신표는 `../reviews/review_apm-realtime-design_claude-r2.md` §7.
- **v3에서 바뀐 것 한 눈에** `[R-P5 반영]` — 실측 결론은 **"Collector 분기 자체는 타당하다(유실 0.0000%/10분 347,830건 · 완료→링 p50 585ms · 슬림 458B · 장애 5종 저장 무손상), 그러나 v2.2 원문 그대로 구현하면 안 된다"**(실측 §15.3). 설계 결정이 바뀐 곳 **7(P0)** + 판정·표기 갱신: ① **`error_mode: propagate` 폐기 → `ignore`**(§2.1·§2.2) — 실측 §13에서 라이브 정리 문장 1개 실패가 receiver 503 → SDK 재전송 → **저장 경로 300% 중복**(26,769건)으로 실증. 라이브 파이프라인 실패는 **Collector 자기 메트릭으로 감시**(§2.2 운영 항목·리스크 #10 "실측 확인") ② **PII 값 검사를 Collector에 실제 배치** — `redaction/live` 프로세서 + 빠진 OTTL 4문장(`scope.name`·`version`·`schema_url`·`resource.schema_url`)을 §2.2 yaml에 넣어(실측 H3 조합 13/13 clean, §3.2) "Collector가 1차 방어선" 문구와의 모순 해소, BE 값 검사는 2차 방어선으로 유지 ③ `send_batch_max_size` **2,000 → 1,000**(실측 §14 최악 UTF-8 배치 2.11 MiB > 2MB) + 본문 상한 산정에 JSON `\uXXXX` **6배 팽창** 반영, 문자열 상한 단위 "자 → **바이트**" ④ feature gate **`ottl.set.allowNil`을 설치 가이드 실행 명령 3종에 명시**(§2.2·§7 리스크 #13 신설 — 실측 §4.3 gate OFF면 PII 3종 + 전송량 47%, 경고 0건) + 미설정 검출(BE 카나리아 `slimBypassed`) ⑤ `SecurityConfig` **`/apm/otlp-live/**` permitAll을 P5.1 필수 + 회귀 테스트 + R6 케이스**(실측 §3.9 — 누락 시 401 → Collector `Permanent error` 즉시 폐기 = **조용한 영구 손실**) ⑥ **`OTEL_BSP_SCHEDULE_DELAY=1000` 저트래픽 필수로 승격**(실측 §10.3 — 10 SERVER/초에서 기본 5,000ms면 완료→링 p95 5,727ms) + `OTEL_BSP_MAX_QUEUE_SIZE` 짝 안내 ⑦ 라이브 본문 상한 **2개**(해제 후 2MB + **압축본 512KB**, 실측 gzip 11.5배 → 2MB gzip ≈ 23MB 해제, §2.3·§3.3). 그 밖에: **§6.0 실측 결과 요약표 신설**(합격선·실측값·판정·근거 절), **R2-1 CPU 1.49배 FAIL 유지**(호스트 비격리·OFF 편차 39%를 인용하되 완화하지 않음 — **격리 호스트 재측 R2′가 P5.1 출시 게이트**, 완화 후보 표는 전부 "추정"), §5 산정의 추정 → 실측 교체(슬림 458B · gzip 10.5~11.5배 · SERVER 11.6% · partialSuccess 성공 취급 · 장애 5종 저장 유실 0), 미측정 목록 **R-P5″**(§6.0), 되돌릴 부작용 2건 "정리 필요" 표(§6.0). 회신서 `../reviews/review_apm-realtime-design_claude-r3.md`.
- **v4에서 바뀐 것 한 눈에** `[C-r3 반영]` — 코덱스 3회차 판정 **전건 수용(반대 유지 0)**. 필수 정정 3: ① **`ignore` 감시·차단 확정**(§2.1·§2.2·§2.3) — "exporter 카운터는 OTTL 실패를 세지 않는다"는 판정에 따라 감시를 **Collector 로그의 WARN 2패턴(`failed to execute statement`·`failed to eval condition`) + gate WARN 1회** 계수(로그 샘플링 한계 명시)로 바꾸고, BE 카나리아를 **잔존 필드·값·타입 후조건 검사**(`reason`별 위반 수, 원문 미기록)로 확장하며, **전송 전 차단** `filter/live-safety`(정리 후 안전 형태 미충족 스팬을 live 분기 마지막에서 drop — 검증 자체 오류 시 통과 여부를 R-P5b에서 시험, 실패 시 대안 "유계 비동기 경계 뒤 차단"은 R2′ 항목)를 yaml에 추가. `enqueue_failed + send_failed`는 **"전송 실패 신호"**로 개명(종단 유실 수가 아니다). `ApmCollectorMetricStore` 확장(live exporter별 enqueue/send 실패·`error_type`·차단 수 — 수집→보존→조회→화면)을 P5.1 6단계 범위에 ② **본문 상한 계약 완성**(§2.3.0 신설·§3.3) — 해제 후 **2,097,152 B**·압축본 **524,288 B**(정확 바이트), 무압축 요청은 해제 후 상한만, gzip 아닌 `Content-Encoding`은 415, Collector 측 잔존 값의 타입·길이·그룹 수를 yaml(`keep_keys`·`truncate_all`·`filter/live-safety` 형태 검사)로 고정하고 **직렬화 상한을 산술로 도출**(정상 형태 1,000스팬·그룹 ≤ 100 = 1.13 MiB, 그룹 = 스팬 수면 1.99 MiB — 보장이라 부르지 않음, 적대적 최악은 초과 → 413 규칙) — v3의 "1,000이면 최악 1.06 MiB"는 **외삽**으로 낮추고 R-P5b가 직렬화 최대를 실측 ③ **실측 판정·게이트 정정**(§6·§6.0·§7) — proxy 도착/링/commit을 구분(R2-3 처리량은 proxy 도착/생성 비율·R2-4 지연은 proxy 도착 — 계약 기준 미입증), "R2 나머지 8항목 PASS" 철회 → 코덱스 신뢰 열 표, **R2′ = 출시 게이트(P5.1 구현과 병행) · R-P5″ = 최소 종단(§7.1 1~5단계) 직후 · R-P5b 결합 YAML correctness = 지금**, 585ms(강제 flush 하네스)를 제품 근거에서 제거(재측 p95 1.23~1.52초만). 그 밖에: `num_consumers` 정본 후보 **1**(R2′에서 2와 비교) · `redaction/live` `summary: silent` · gate 대안 구문 없음 확정(gate 유지, gate OFF 신호는 "경고 0"이 아니라 **1회 WARN**) · BSP 1,000ms는 **"P5 권장 지연 프로필의 설정 요건"**("고트래픽 무관"·"약 2초 보장" 삭제) · 1,000/초 지원 문구는 R2′ L2 + R-P5″·R3·R4·R6·R7 통과 프로필에 한해 · **`dict.instances.key` = Collector 정리 후 BE 도착 값의 해시**(원본 아님 — 마스킹으로 합쳐지면 한 인스턴스로 표시) · §5.1 단가 정정(600/초 raw 274.8 KB/s·23.74 GB/일 등) · §5.3 체류는 **모델 추정**(consumers 1 ≈ 18초 · 2 ≈ 12초) · CPU 후보 c의 "fan-out 복제 감소" 삭제 · **§7.1 P5.1 구현 계획(정본) 신설**(7단계 · 첫 커밋 = 1번 수신 관문 · live 전송 먼저 안 켬 · 회귀 목록) · §7.2 공수 재합산(남은 구현 5.5~8.5일 / R2′ 0.5~1일 / 소진 1일 구분) · §8-5를 답 표로 교체. 회신서 `../reviews/review_apm-realtime-design_claude-r3b.md`.
- **v4.1에서 바뀐 것 한 눈에** `[R-P5b 반영]` — 결합 YAML correctness 실측(v3·v4 yaml 각각, 2026-09-15 17:20~18:10)의 결과. **yaml 자체는 v4 정본 그대로 통과**(분기 E=A=8,431 · PII 13/13 차단 + 대조군 원형 보존 · 절단 경계 U+FFFD 0 · live-safety 정상 오탐 0·실패 전량 drop · 형태 fixture 13/13)하여 yaml 문장은 바꾸지 않았고, 바뀐 것은 **BE 설정값 1개 + 문서의 사실 정정 5 + 운영 규칙**이다: ① 🔴 **BE 압축본 상한 `max-compressed-bytes` 524,288 → 2,097,152**(§2.3·§2.3.0·§3.3·§7.1) — 난수 값·그룹 = 스팬 수·1,000스팬의 **정상 입력**(live-safety 전부 통과·PII 0)이 gzip **572.4 KiB**로 512 KiB를 넘는다(800으로 낮춰도 458.7 KiB, 여유 10%). 압축본 상한과 해제 후 상한을 **같은 값(2 MiB)의 독립 상한 2개**로 유지하는 이유는 gzip 폭탄 방어(회선 읽기 유계 + 해제 중 스트리밍 검사 중단)이지 "압축본이 작다"는 가정이 아니다. 🔴 이 값은 코덱스가 **지금 구현 중인 P5.1 1단계**에 수정 라운드로 전달한다(§7.1) ② **`\uXXXX` 팽창은 사실이 아니다**(§2.2·§2.3·§5.1) — Collector OTLP/HTTP JSON exporter는 비-ASCII를 이스케이프하지 않고 **원시 UTF-8**로 쓴다(`\u` 등장 0). 같은 바이트 상한이면 **한글 비용 = ASCII 비용**(785,699 vs 786,779 B). R-P5 §14의 "최악 UTF-8 2.09~2.11 MiB"는 **gen3 fixture가 바이트가 아니라 문자 수를 세어**(`error.type` 64자 = 192 B) 생긴 결함으로 **철회**(§6.0). `truncate_all`은 바이트 상한을 지키되 **문자 경계에서 자른다**(256 B → 255 B/87자, UTF-8 깨짐 0) ③ **직렬화 상한은 실측으로 교체**(§2.3.0) — live-safety를 통과하는 최대치 1,000스팬 배치 = 그룹 100이면 **0.803 MiB**, 그룹 = 스팬 수(1,000)면 **1.337 MiB**(ASCII·한글 동일, 2 MiB 대비 1.53배 여유). v4의 산술(1.13/1.99 MiB)은 **보수적**이었다 → **`send_batch_max_size: 1000` 확정**, "넘으면 800" 규칙 **삭제** ④ **`redaction/live`의 방어 범위는 속성 값(span·event attributes)만**(§2.1·§2.2) — `status.message`·`span.name`·`traceState`·scope 필드·`events[].name`·`links[].attributes`는 검사 대상이 아니다(v3 yaml에서 정리 문장 1개 실패 시 **1,337/1,337 PII 유출** 실증 — v4는 0). 비-속성 필드의 유일한 방어는 **`filter/live-safety`** ⑤ **live-safety는 조건 단위 fail-open**(§2.1·§2.2·리스크 #18) — 한 조건이 깨져도 나머지 12조건은 동작하지만, **깨진 조건이 맡던 검사만 조용히 사라지고 차단 카운터는 0**(WARN 52줄만). "nil·타입 안전 조건만"은 권고에서 **불변식**으로 승격(조건 추가·변경 시 fail-open fixture 재시험 필수) + 알람 **`failed to eval condition{pipeline=traces/live} == 0`**. 자기 메트릭 라벨은 **`filter="filter/live-safety"`**(타입 접두 포함) ⑥ **`ignore` 감시 실측**(§2.1·§2.2) — WARN 2패턴(`failed to execute statement`·`failed to eval condition`)은 `otelcol.component.id`·`otelcol.pipeline.id` 라벨을 달고 실재하되 **로그 샘플링**(13,196 실패 → 170줄)으로 손실 수가 아니고, `failed processing traces`는 0건, transform 문장 실패는 **어떤 메트릭에도 없다**(incoming == outgoing). gate OFF 신호는 **프로세스 수명당 WARN 1회(파이프라인·문장 라벨 없음)**로 리스크 #13 문구 정정. 부수: `summary: silent`는 0.159.0 **기본값이어도 명시**(info/debug면 요약 속성이 붙어 live-safety가 전량 drop → 라이브 100% 실명) · `${VAR}` 미설정 시 exporter가 **기동을 명시적으로 거부**(조용한 실패 아님) · 하네스 주의 — 포화 fixture가 **저장 분기에도 fan-out**돼 쓰레기 서비스 1,950개 생성 → R2′·R-P5″는 저장 분기 차단 또는 `service.name` 고정(§6.0). 반영표는 회신서 r3b §6.
- **v4.2에서 바뀐 것 한 눈에** `[impl-r1 반영]` — P5.1 **1단계(커밋 `f4031ef`, :test 3,326 green) · 2~3단계(미커밋, :test 3,400 green)** 구현과 두 검수에서 정본을 고쳐야 했던 것. 구현을 되돌린 곳은 없다: ① **라이선스 시간 전이 = 타이머가 아니라 매 요청 재계산**(§2.3.1) — provider가 60초에 1회 DB 조회 + RSA 검증한 **서명 내용**을 캐시하고, 매 요청은 그 위에서 `resolveState()`만 다시 계산한다(전이 지연 0·스케줄러 없음·DB 0회). `current()`는 **어떤 경로에서도 예외를 던지지 않는다** — generation 경합·freshness 초과는 재시도 뒤 `locked(INVALID)`로 접는다(fail-closed, 500 금지 — 2~3단계 검수 🔴 R2) ② **"hot path DB 0회"의 정확한 범위**(§2.3·§2.3.1) — 토큰·서비스 메타는 0회(✅ Hibernate 통계로 100회 호출 SQL 0 실측), **라이선스는 예외**: 60초당 1회 provider 갱신이 그 요청에 동기로 얹힌다 ③ **rps 429(10/burst 20)와 LRU 예산 분리(토큰 2,000 / 서비스 8,000)를 §7.1 4단계 첫 항목으로 배정**(집계·dedup·arena 착수 전 · 라이브 ON 전 필수) — v4.1까지 어느 단계에도 없었다(permitAll 경로라 임의 bearer로 음성 캐시·LRU 오염 가능) ④ **§5.2 힙 표** — 수신 임시를 본문 버퍼 **16 MiB**(admission 4 × (압축본 2 + 해제본 2), 무압축만이면 8)로 정정(v4의 "압축본 상한은 힙 임시와 무관"은 압축본 버퍼를 해제 전에 놓는 구현을 전제한 것이라 철회) + **파서 보유분 4 MiB**(배치당 ≈1 MiB × in-flight 4) + **임시 dedup 인덱스 64 MiB 예산**(300k 항목, 산술 ≈31.5 MiB — 4단계 arena 통합 시 상주 dedup 5.49로 교체) → 합산 예약 **404 MiB(4단계 통합 후) / 468 MiB(현 구현)** ⑤ **스팬 초과 규칙 확정**(§2.3·§2.3.0·§3.3) — 1,001번째부터 `batchOverflow` 부분 거절(partialSuccess), 초과분도 JSON·UTF-8 검증은 끝까지. 1단계의 "배치 413"은 임시 관문이었고 2단계에서 교체 완료(이력) ⑥ **거절 사유 한 벌**(§2.3·§3.3) — 스팬 단위 11(`LiveSpanRejection`) / 요청 단위 12(`LiveIngestCounters.Reason`, 1단계 10 + 3단계 2) — 식별자는 구현 enum 이름. `parentSpanId` **없음·빈값·null = 부모 없음**(루트 스팬), 값이 있는데 형식이 틀린 경우만 `malformed` ⑦ **§7.1** — 1~3단계 행에 구현 완료·검수 링크, 4단계 행에 훅 위치 `LiveSpanAdmission.reject()/aggregate()`·삭제 이벤트 구독 의무(링·사전·snapshot·replay)·dedup 락 샤딩·`reserve()` 선검사·`instanceBudget` 결정 ⑧ §2.3.1 무효화 경로에 **`createPending`** 가산(PENDING 음성 캐시 뒤집기 — 검수 확인분). 동시 수신 상한은 **압축·무압축 공통 admission 4**(`max-concurrent-requests`)로 정정(1단계 검수 🔴-2). 반영표는 회신서 r3b §7.
- **v4.3에서 바뀐 것 한 눈에** `[impl-r2 반영]` — P5.1 **4단계(집계·dedup·arena, worktree `p5-live` HEAD `84edbb9` 위 미커밋, 전체 `:test` 3,456 green·신규 43건)** 구현과 검수(🔴1·🟡13)에서 정본을 고쳐야 했던 것: ① **자료구조 산술 오기 2건 정정**(§2.4) — 마지막 세그먼트 **7,040 → 7,360**(1,400,000 − 85 × 16,384) · 버킷 배열 **900 → 907칸**(창 900초는 불변, `[now−900s, now+5s]`의 서로 다른 초가 최대 906개라 900칸이면 경계에서 인덱스가 겹친다 — 추가 예약 ≈0.193 MiB, §5.2 합계 갱신) ② **dedup 자료구조 교체**(§2.4) — 초별 open-addressing 폐기 → **공유 슬롯 풀 + 체인 + 64샤드 만료 FIFO**(`reserve(int)`가 키 분포를 몰라도 성립), 상주 **5.49 → 4.12 MiB**, 용량은 프로퍼티(`app.apm.live.spans.dedup.capacity`, 기본 90,000)로 노출 — 🔴 이 기본값이 **1,500/초 × 60초 = 90,000과 정확히 겹쳐 L3에서 절벽**이 될 수 있음을 리스크로 기록 ③ **사전 회수 규칙**(§2.4) — 참조 카운트 폐기 → **마지막 관측 후 910초**(안전 여유 9초 근거 포함), 🔴 **ID 네임스페이스 = 서비스**(프로세스 전역이면 route churn 시 약 30분에 65,534개 소진 후 영구 `__other__` — 4단계 검수 🔴 R1, 병합 전 수정 대상) + 소진 전용 계수 `dictIdExhausted` ④ **§3.3 자기모순 해소** — 스팬 단위 거절 사유 **11 → 10종**, `instanceBudget`을 `dictBudget`과 함께 **표시 축소 계수**로 이동(§2.4가 정본) ⑤ **압박 판정**(§2.4·§3.3) — "잔여 < 3%" 분기는 계층 예약(1.35M) < 임계(1.358M)라 **산술상 도달 불가**이며 실질 트리거는 계층 예약 도달뿐임을 명시(안전망 문구) ⑥ **rps 프로퍼티 경로 확정**(§2.3·§3.3) — `app.apm.live.spans.rate-limit.*` + 🔴 **LRU 버킷 맵 포화 시 신규·재기동 토큰 잠금 위험**(4단계 검수 🟡 Y1)과 완화(예약 슬롯 분리 또는 전용 계수) 기록 ⑦ **요청 단위 503 사유 확장**(§3.3) — `dedupFull`·`storageUnavailable` 분리(현재 각각 `busy`·`internalError`에 합류돼 있던 것), 🔴 **콜드 스타트를 `internalError`로 오분류하지 않는 규칙**(기동 시 선할당 완료 전/실패 시에만 `storageUnavailable`) ⑧ **§5.2 힙 표에 실측 열 추가**(4단계 프로브: 1.4M 슬롯 할당 **61.13 MiB** · 200서비스×900초 운용 **44.49 MiB** · dedup **4.12 MiB**), 907칸 반영해 상주 소계·합산 재계산, `enabled=true` 기동 시 선할당(콜드 스타트 최대 53.710ms)을 §7.1에 배정 ⑨ **§7.1 4단계 행**에 구현 완료·검수 이력 + **5단계 연결 지점** `copyBucket()`·`copyDictionary()`·`removalsAfter()` 명시 ⑩ **reservoir 균등성 회귀 필요**(§2.4·§7.1) — 변이 주입("항상 최신 우선")이 기존 회귀를 전부 통과해 균등성이 테스트로 보호되지 않음을 확인, 회귀 목록에 추가. 반영표는 회신서 `../reviews/review_apm-realtime-design_claude-r3b.md` §8.
- **v4.4에서 바뀐 것 한 눈에** `[impl-r3 반영]` — P5.1 **5단계(snapshot·SSE, worktree `p5-live` 커밋 `3c76a74`)·6단계(Collector 생성 설정·운영 관측, 커밋 `8d6f730`)** 구현과 검수(5단계 `../reviews/review_apm-p51-s5-be_claude.md` 🔴0·🟡11 — D1~D3 · 6단계 `../reviews/review_apm-p51-s6-be_claude.md` 🔴3·🟡14 — 정본 반영 5건, 구현 보고 `review_apm-p51-s5-be_codex-impl.md`·`review_apm-p51-s6-be_codex-impl.md`·수정 보고 `review_apm-p51-s6-be_codex-fix.md`)에서 정본을 고쳐야 했던 것: ① **§2.5 거절 변환 표를 3행으로 분리**(D1) — 인증 필터의 401, `VisitorSessionChecker`(visitorId 없음·세션 불일치)도 **실제 401**(세션 문제를 403 `control`로 둔갑시키지 않는다 — P1.5 2026-09-02 P2 QA D3의 역방향 재발 방지), `@RequiresFeature`·`AccessModeInterceptor`·`ApmAccessChecker`만 403 `control`. 1행의 "200+JSON code 401" 괄호 설명도 오기라 삭제 ② **`Last-Event-ID` 한 단계 되감기 명문화**(D2, §3.2) — 멀티파트 중간 part에도 `id:`가 갱신되므로 서버는 `sinceSeq = seq−1`로 해석해 그 seq 전체를 재전송하며, 병합 규칙 1의 `seq ≤ 마지막이면 무시`가 중복을 흡수해 멱등하다 ③ **`snapshot.end.checksum` 산식 고정**(D3, §3.2) — `snapshot.chunk` 이벤트의 `data:` 이후 JSON을 UTF-8 바이트로 이어붙인 것의 CRC32(begin·end 이벤트와 각 이벤트 말미 `\n\n` 제외) — 7단계 계약 표본에 고정 ④ **snapshot 축소·재시작 계약 신설**(§3.2) — 전송량 초과 시 서버는 표본을 축소해 **새 `snapshotId`로 재전송**(최대 3회·`transferred` 누적·제어 메시지 1 KiB 예약, 한계 도달 시 503 종료). **FE는 새 `snapshot.begin`을 받으면 직전 미완 snapshot 버퍼를 폐기**해야 한다 — UX 정본에도 알릴 항목 ⑤ **알람 판정 불가 구간 명시**(§2.2 ⓑ) — 건강한 Collector는 WARN을 쓰지 않으므로 90초 뒤 관측값이 전부 `null`이 되고, `failed to eval condition{pipeline=traces/live} == 0` 알람은 "0"과 "관측 없음"을 구분해야 하며 결측을 정상 0으로 표시하지 않는다 ⑥ **별칭 표기 통일** — 생성 yaml(저장·라이브 exporter·`resource_detection`)은 `otlp_http`·`resource_detection` 신 별칭만 쓰고, **관측 템플릿만** 구 별칭 호환 분기를 유지한다(전역 문자열 치환이 그 호환 분기를 접었던 결함을 수정 — R2) ⑦ **§7.1에 골든 회귀 명시** — 라이브 구간은 R-P5b 통과본과 바이트 동일해야 하고 골든 파일 `src/test/resources/apm/contract/r-p5b-live-processors.golden`(2,902B, MD5 `944bde2816044f51aadc30c45fcb3801`)과 비교하는 회귀가 이를 강제한다(조건 수만 세는 검사는 매칭 범위 완화를 못 잡아 불충분했다 — Y-d) ⑧ **라이브 전송 실패 분리** — 라이브 exporter(큐 5·재시도 없음)는 설계상 실패가 정상이므로 기존 저장 exporter의 "전송 실패" 집계·차트에 합산하지 않는다(§2.2·§3.3 — R3) ⑨ **§7.1 5·6단계 행에 "구현 완료" + 커밋·검수 링크**(5단계 `3c76a74`·6단계 `8d6f730`), 7단계 행에 남은 것 정리 + `integration-qa`로 SSE 계약↔FE 타입 대조를 착수 조건으로 명시 ⑩ **§2.3 "최근 60초 수신" 판정에서 자기 관측 로그 제외**(자기 계측 로그가 초록불을 만들던 결함 — §2.2 자기계측 절과 정합). 남은 검증(R2′ 출시 게이트·R-P5″ 최소 종단·출시 부하 — 자기 메트릭 증가량·내부 로그 전송량·BE 장애 시 로그 피드백 루프·운영 32/96MiB 규모 snapshot 부하)은 **미실행**으로 유지. 반영표는 회신서 `../reviews/review_apm-realtime-design_claude-r3b.md` §9.
- **v4.5에서 바뀐 것** `[contract-r1 정정]` — P5.2(X-View)·P5.3(요청 관제) 화면 **구현 착수 전** integration-qa 정적 대조서 `../contract_apm-p5-live.md`(BE HEAD `28a1ad3`, 코드 무수정 — SSE ASYNC 디스패치 500 수정뿐이라 계약 변경 없음)가 "코드가 정본" 원칙으로 잡아낸, **설계 문서 쪽이 틀린** 항목만 정정한다(BE 추가 필요·결정 필요 항목은 계약서 §6에 남기고 이 문서는 건드리지 않는다): ① **§3.2 `control` — `resume`을 표·타입 목록에서 삭제**(§2.5 표·본문). BE는 `resume`을 보내지 않으며, `paused` 상태 해제는 **새 `snapshot.begin` 도착**으로 판정한다(FE 계약) — v1~v4.4 내내 표에 남아 있던 오기 ② **§3.4/§2.5 — 스트림을 열기 전 401 본문 모양 정정**: `VisitorSessionChecker`(visitorId 없음·세션 불일치) 401도 인증 필터 401과 **같은 모양**으로, `ApiResult`(`status`·`message`·`data`)가 아니라 **`{"code":401,"errorCode":"INVALID_TOKEN"}` 두 필드뿐인 맨 맵**이다(`LiveStreamRejectionAdvice.resolveException()`) — v4.4의 "+ `ApiResult` 본문" 표기가 오기였다. FE 인터셉터는 이 경로만 별도 처리 ③ **§3.2 `dictDelta` — `services`·`instances`가 항상 포함됨을 payload 표·`spans` 예시에 반영**(예시가 `routes`만 축약해 실려 있던 것을 보완) — FE가 이 두 필드를 읽지 않으면 신규 서비스·인스턴스를 영영 못 본다 ④ **§3.2 `stats.histOverflow`는 `hist[14]`의 사본**(합계에 더하면 10초 초과 요청을 중복 계수)임을 주석으로 명시, **`minMs`·`sumMs`를 payload 표에 추가**(코덱스가 지금 구현 중 — 평균 지연 계산과 FE의 p95 재현 정확도에 필요, 계약서 §6-D) ⑤ **§3.2 `live{}`·`patterns{}` — 현재 구현은 항상 빈 객체**임을 표에 직접 명시. `live{}`는 §2.8·계약서 §6-A가 요구하는 BE 보완(7단계 이후 채움)이 진행 중이고, `patterns{}`는 애초 **P5.4 범위**(P5.2 1차 비차단)임을 못박는다 ⑥ **§3.3/§2.4 — `pressure.arenaPressure`는 tick 구간 내 발생분으로 정의를 좁힌다**. 현재 구현(`LiveSpanRing.Counters.arenaPressure`, `AtomicLong.incrementAndGet()`, 리셋 없음)은 **누적 총합**을 그대로 싣고 있어 이 정의와 어긋나며, 정의대로 두면 첫 압박 이후 배지가 영구 ON + `control{degraded}`가 매초 무한 발송된다(계약서 §6-C) — **구간 값과 누적 값이 둘 다 필요하면 필드를 분리**할 것(예: `arenaPressureDelta`(구간) / `arenaPressureTotal`(누적, 진단용)), BE 정정 전까지 FE는 §6-C의 우회(수신 후 일정 시간만 배지 유지)를 쓴다 ⑦ **§7.1 7단계 행 — "계약 표본 JSON 골든 고정"을 필수 산출물로 승격**한다. 6단계가 이미 `test/resources/apm/contract/r-p5b-live-processors.golden`(바이트 동일 비교, MD5 고정) 방식의 선례를 세웠으므로, 7단계도 이벤트 6종(`snapshot.begin`/`dict chunk`/`buckets chunk`/`end`/`spans`/`heartbeat`/`control`) 각 1건의 실제 직렬화 결과를 같은 방식의 골든 파일로 고정하고, **골든 불일치 실패 메시지에 "FE `src/types/__fixtures__/apmLiveSpans/*.json`도 함께 갱신하라"는 안내를 넣는 것**을 회귀 작성 규칙에 포함한다(계약서 §6-G — 계약 표본 0건이 FE 타입 대조의 공백이었다) ⑧ **§2.6 — 액티브 합산 규칙에 구현 확인 이력 추가**: "인스턴스 안 속성 조합별 최신값을 먼저 합산하고 그다음 인스턴스를 합산한다"는 규칙은 **여전히 `LiveBuffer.recordActive`(P1.5)에서 지켜지지 않고 있음을 이번 계약 대조에서도 재확인**했다(서비스의 마지막 관측 하나만 사용) — 이 정정은 **7단계(§7.1)에서 `live{}`를 채울 때 함께 고친다**로 이력에 남긴다. 그 밖에(비차단, 이 문서 판단 불필요) 계약서 §6-F의 `node.nodeId`가 `streamEpoch`와 같은 UUID라는 점·거절 사유 enum 개수(11/16종, 이미 §3.3에 정정 반영됨)는 재론하지 않는다. 반영 근거는 `../contract_apm-p5-live.md` §2·§6·§7.1 전체.
- 발단(사용자): *"JENNIFER APM의 실시간 화면 수준 — X-View(요청 하나=점 하나, 초 단위), 액티브 서비스, 속도계/이퀄라이저 대시보드(1초 갱신), 실시간 리소스."*
- 진행 방식(사용자 지시): 설계는 **코덱스 gpt-6-astra와 왕복 대화**로 다듬는다.

---

## 0. 요약 · 범위

### 한 줄 결론 `[C-r2 반영: 보관·표시 분리, HTTP만]`
**실시간은 "등록·승인·인증·유효성 조건을 충족한, Collector에 도달한 완료 HTTP SERVER 스팬" 전체를 처리 대상으로 수신·집계하되, 서버는 예산 안에서 표본을 보관하고 브라우저는 그 중 표본을 표시하며, 전부 휘발한다. 트레이스 분석은 샘플·보존한다(메트릭 집계는 이미 전량이다).** Collector에서 tail 샘플링 **앞**에 `traces/live` 파이프라인을 갈라 HTTP SERVER 스팬을 5~7속성으로 깎아 1초 배치로 BE에 보내고, BE는 그것을 DB에 넣지 않고 **인메모리 링**(전역 슬롯 arena, 15분 창)에만 담아 SSE로 1초마다 흘린다. 저장·조회(트레이스 탐색·산점도·롤업)는 지금처럼 tail 샘플만 한다. 두 길은 **같은 스팬을 두 번 보내는 것**이고, 그 이중 전송이 이 설계의 비용이다(§5).

> v0 문구 "실시간은 전량·휘발, 분석은 샘플·보존"은 두 군데가 부정확했다 — (1) 메트릭 분석은 전량이므로 "분석"은 **트레이스** 분석으로 한정, (2) "전량"은 수신·집계의 약속이지 **표시**의 약속이 아니다. v1의 "1,500점/초까지 화면 전량 표시"도 산술 반례(1,500점/초 × 5분 = 450k점인데 브라우저는 300k점부터 솎는다)로 **폐기**했다 `[C-r2 반영]`.

### 🔴 "전량"의 제품 약속 — 수신 처리율 · 서버 보관량 · 브라우저 표시량 3분리 `[C-r2 반영]` (필수 수정 1 · 3회차 질문 1의 답 = 동의)

**제품 문구(고정)**: *"정상 지원 부하에서 적격 수신 관측 전체로 통계를 계산합니다. X-View는 서버 보관량·선택 시간 창·브라우저 처리 한도에 따라 표본을 표시하며, 각 단계의 관측 수와 표시 수를 제공합니다."*

| 층 | 약속(숫자는 그 층의 것이다 — 섞지 않는다) | 노출 | 범위 밖(설치 점검 항목) |
|---|---|---|---|
| **수신 대상** | 등록·승인·인증·유효성 조건을 충족한 **Collector 도달 완료 HTTP SERVER 스팬 전체**(§3.1 모집단 정의) | — | 상류 유실 — SDK 샘플러(`parentbased_always_on`이라 상류 `sampled=0`이면 자식도 없음)·SDK 큐 초과·프로세스 종료·계측 제외 경로. **"전체 실제 요청"을 뜻하지 않는다** |
| **수신 처리율** | 지원 수신 상한 **1,000 SERVER/초(L2)** 에서 정상 상태 유실 < 0.1%(R1 판정식 `loss = |E \ A| / |E| < 0.001`). 1,500(L3)은 다서비스 상한 검증, **5,000(L5)은 탐색 프로필**이며 지원 상한으로 채택하기 전까지 제품 약속이 아니다. `[R-P5 반영: 실측 §1·§3.5]` ✅ **L2′ ≈ 600 SERVER/초 × 10분에서 유실 0.0000%(347,830건, 반복 4회 전부 0)** — 단 QA 호스트 부하 천장이 600/초라 **L2(1,000)·L3·L5는 미도달**, `[C-r3 반영: 질문 8 답]` 지원 문구 확정 조건 = **R2′ L2 통과 그리고 실제 BE의 R-P5″·R3, 화면의 R4, 실 SDK의 R7·R6을 통과한 프로필에 한해**. 그 전 제품·문서 문구는 **"합성 Collector 경로에서 약 600 SERVER/초 구간을 관측"** — "제품 600/초 지원 검증"도 쓰지 않는다 | 수집기 탭 카운터(§2.3) + Collector 라이브 exporter **전송 실패 신호**(§2.2 운영 — 종단 유실 수가 아니다) | Collector에 도착조차 못 한 유실은 BE가 모른다 — Collector `otelcol_exporter_*`와 분리. `[R-P5 반영: 실측 §10.3 ③]` 그보다 이른 구간 — **SDK 큐 드롭**(BSP 5,000ms + 고트래픽에서 앱 안에서 1,175스팬 소실, Collector·BE 어디에도 안 잡힘)은 설치 가이드의 `OTEL_BSP_MAX_QUEUE_SIZE` 안내로만 막는다 |
| **집계**(TPS·오류율·p95·패턴) | 수신·dedup·유효성 통과 **전체 관측**으로 계산한다 — 표본에서 계산하지 않는다 | `stats.count`=수용 고유 관측 수 | — |
| **서버 보관(기본 계층)** | **서비스당 200점/초 · 전체 1,300k점(15분)** 은 서버 **보관 목표**다(전역 arena 예산 §2.4 — `[X-r1 정정]` v2의 1,350k는 압박 임계 1,330k보다 커서 목표 도달 전에 축소되는 모순이었다. L3 1,500/초 × 900초 = 1,350k는 **목표 초과 → 균등 축소가 관측되는 프로필**이다). 초과는 서비스·초별 **층화 reservoir**(균등) | 버킷별 `observed/retained` | 예산 압박 시 무작위 축소 + `pointsRev` 상승(§2.4) |
| **서버 보관(강조 계층)** | 오류·느림 점은 별도 예산 — 전역 **50k점**·서비스당 20k점 | 버킷별 `observed/retained` | 초과 시 그 계층도 초별 reservoir |
| **전달(연결)** | 연결별 바이트 상한 안에서 보관분을 보낸다. 넘치면 그 연결만 1/k 솎음 | 버킷별 `delivered`·`clientKeepRatio` | — |
| **브라우저 표시** | 선택 시간 창(기본 5분)·브라우저 처리 한도(잠정 300k점, R4 확정) 안의 표본 | 배지 `displayedCount/observedCount` **상시** | "화면 전량"은 어느 부하에서도 약속하지 않는다 |
| **대상 스팬** | **첫 출시는 HTTP SERVER만** 전송·집계(Collector filter `kind==Server ∧ HTTP 판별`) — 3회차 질문 2의 답 = 동의. RPC/OTHER는 **P5.5**(후속)로 분리 | — | CLIENT·INTERNAL·PRODUCER·CONSUMER는 점이 아니다. 메시징은 SERVER만으로 지원한다고 말하지 않는다 |

### 범위 — 첫 출시와 그 뒤 `[C-r1 반영]` (코덱스 되묻는 질문 5의 답)
번호는 문서 안에서 `P5.x`, 통합 WBS(`devdesign_apm-screens-wbs.md`)에서는 **`WS-9 / 9.x`**(기존 `5.x`는 P4 RUM·로그·K8s가 쓰고 있고, 화면 메뉴 9번은 합성 감시라 작업 묶음 번호와 구분 — Q15 결정).

| # | WBS | 화면 | 한 줄 | 출시 |
|---|---|---|---|---|
| P5.1 | 9.1 | 라이브 스팬 파이프라인 + 링 + SSE | Collector `traces/live` → `POST /apm/otlp-live/v1/traces` → `LiveSpanRing` → `GET /apm/live/spans/stream` | **첫 출시** |
| P5.2 | 9.2 | 실시간 X-View | 스트리밍 산점도(1초 버킷 교체) · 브러시 → 표시 표본 목록 · 점 클릭 → 저장된 트레이스면 상세, 아니면 "현재 저장된 트레이스를 찾지 못함" | **첫 출시** |
| P5.3 | 9.3 | 실시간 대시보드 · 액티브(개수) | 속도계(TPS·p95) · 이퀄라이저 · 오류율 게이지 · 액티브 **인스턴스 합산** · CPU/메모리 · 관제실 모드 | **첫 출시** — 여기까지가 "완료 요청 관제" |
| P5.3b | 9.3b | 액티브 요청 **목록**(Java 확장 opt-in) | `SpanProcessor.onStart` 시작 이벤트 + 종료·유실 복구 | 독립 게이트(R5 + 제품 지원 결정) 뒤 |
| P5.4 | 9.4 | 패턴 라벨 · 이상 기준선 | 우리 휴리스틱 4종("관측 특징" 문구) + **EWMA 기준선부터**, 계절 기준선은 표본 충족 뒤. 🔴 집계 슬롯에 시작 시각 분산·route별 오류 분모·촘촘한 히스토그램이 **없으므로** 자료구조 추가가 선행(§2.4·§4.4) | **후속**(첫 출시 합계·완료 기준에서 분리 `[C-r2 반영]`) |
| P5.5 `[v2 신규]` | 9.5 | 비-HTTP SERVER(RPC/OTHER) 전송·집계 | 구/신 속성 정규화 → protocol 판별 → `stats`·표본·상한·사전을 **protocol별 분리** 후 비용 재산정 | 후속(첫 출시 제외 — N5) |
| P5.6 `[UX-r1 반영]` `[UX-r1b 반영]` | 9.6 | **비동기 모니터링 — 첫 출시**(트레이스 상세 워터폴 확장, UX §3.1 **5항목**: 링크 목록·같은/다른 trace 이동 · 부모 종료 이후 종료 마커·해칭 · 관련 스팬만 보기 · 빈 상태 · (선택) kind별 자기 시간) | **저장된 트레이스**(`ApmTraceDetailDto.spans[].{kind,links,offsetMs,durationMs,selfMs,parentSpanId,attrs.thread.*}`)에서 순수 계산 — 정의는 **3층**(§4.5): ① 관계(`links` — 같은/다른 trace는 분류 축) ② 시간상 특징(부모 종료 이후 종료) ③ 실제 실행 방식(불명 — 주장하지 않음). v2의 "(b) PRODUCER→CONSUMER cross-trace" 확정 표현은 **폐기**(링크에 대상 kind가 없다). **FE 단독·BE 0·라이브 파이프라인(P5.1) 비의존** → 선출시 가능. 탭을 늘리지 않는다(`?tab=async`는 P5.6b) | 독립(순서 무관) · 🔴 **R-P5.6 ⓑ·D-1·3·4·5 합격이 출시 게이트**(UX §3.5) |
| P5.6b `[UX-r1b 반영]` | 9.6b | 비동기 모니터링 **후속** — 프로파일 탭 `?tab=async`·스레드 속성별 묶음 레인·시간상 겹침·발행→소비 역탐색·링크 대상 kind 일괄 확인(UX §3.2) | **BE 필드·EP 필요**(§7 "후속 BE 항목" F1~F4) + FE | 후속(P5.6 출시 + BE 항목 계약 확정 뒤) |

### 🔴 비범위 — 일부러 안 하는 것
| 안 하는 것 | 이유 |
|---|---|
| **메서드 프로파일링**(제니퍼 "메서드 레벨 스택") | OTel profiling 시그널은 실험 단계(안내서 §3.8 비범위와 같은 판단). 자동계측 스팬 단위까지만 |
| **전 언어 액티브 요청 "진행 중 목록"** | 스팬은 **끝나야** export된다. 진행 중 목록은 Java 확장(§2.6 b)에서만 가능하고 그것도 opt-in |
| **라이브 스팬의 DB 저장·과거 조회** | 라이브 관측은 1,000 SERVER/초에 **86.4M건/일**(§5.1)이다. 15분 지나면 없다 — 과거는 트레이스 탐색(샘플)의 일. `[C-r1 반영]` v0의 "14M행/일(R3)×수십 배"는 분모가 메트릭이라 틀렸다 |
| **다중 BE 노드 합산** | **첫 배포 = BE 전체 1대**(현 실서버: FE 아파치 1대 + BE·AI 도커 1대 — 3회차 질문 3의 답). 다중 BE는 §2.7 라우팅 표 전체(trace·SSE·**메트릭**·관리 변경·롤링)를 충족해야 하는 승격 조건 `[C-r2 반영]` |
| **비-HTTP SERVER(RPC·메시징) 점** `[C-r2 반영]` | 첫 출시는 Collector에서 **전송 자체를 제외**한다(N5). `stats`가 서비스별 하나라 RPC를 숨겨도 TPS·p95에 섞이던 v1 불일치를 없애기 위해. P5.5에서 protocol별 분리 후 |
| **자체 에이전트·자체 프로토콜** | 안내서 §3.1 OTel 단일. Java 확장 jar(§2.6 b)도 "OTel 에이전트의 공식 확장 지점"이지만 **고객 JVM에서 우리 코드가 도는 지원 범위**가 새로 생기므로 제품 결정을 따로 받는다 |
| **라이브 데이터로 알람** | 알람은 1m 집계 엔진(`ApmAlertKind` 6종)이 그대로 한다. 실시간 화면은 보는 화면이다 |
| **표시 표본에서 계산한 통계** | 오류율·p95·패턴은 전체 관측에서만(§2.4). 표본에서 계산하면 오류율이 올라간다 `[C-r1 반영]` |

---

## 1. 제니퍼 기능 대조표 — 화면마다 요구하는 데이터 특성 `[C-r1 반영: 전량/샘플 열을 수신·표시로 분리]`

| 제니퍼 화면 | 답하는 질문 | 필요한 데이터 | 수신 / 표시 | 허용 지연 | 갱신 주기 | 보존 | 우리 현재 자산 | 격차 |
|---|---|---|---|---|---|---|---|---|
| **실시간 X-View** | 지금 어떤 요청이 느린가·오류인가(점 하나=요청 하나) | 완료된 HTTP SERVER 요청의 (종료 시각, 지연, 상태, 서비스, route, traceId·spanId) | **수신 전량 / 서버는 서비스·초별 층화 표본 보관 / 브라우저는 창·한도 안의 표본 표시** `[C-r2 반영]` — tail 2% 샘플이면 점이 50배 성기고 "정상은 안 보이는 산점도"가 된다 | 수 초 | 1초 | 15분 | 트레이스 산점도(`ApmScatterDto`, 샘플·DB·brush) | 전량 수신·스트리밍 없음 |
| **실시간 액티브 서비스** | 지금 몇 개가 처리 중이고 얼마나 오래 걸리고 있나(목록·경과) | **시작했지만 안 끝난** 요청 | 전량 | 1~2초 | 1초 | 없음(현재만) | `http.server.active_requests` **개수**(Java만·export 주기 10~60초·✅ `LiveBuffer.recordActive`는 서비스의 **마지막 관측 하나**) | 목록·경과 없음, 시작 이벤트 없음, **인스턴스 합산 안 됨** |
| **속도계·이퀄라이저·게이지 대시보드** | TPS·응답시간·오류율·동시 요청이 지금 얼마인가 | 1초 집계(count·p95·오류율) | 전체 관측 집계(표본 아님) | 수 초 | 1초 | 15분 | Live 10초 칸(`LiveBuffer`) — export 시각 기준 칸, 화면 도달 중앙값 14초·최악 23초(✅ QA §B) | 해상도 10초→1초, 지연 14초→수 초 |
| **실시간 리소스**(CPU·메모리·스레드·GC) | 지금 자원이 얼마나 쓰이나 | 런타임 메트릭 | 메트릭(전량) | 10~60초 | 10초 | 1m→DB | `GET /apm/services/{uid}/runtime`(1분 칸) + Live 링은 http 둘만 봄 | 10초 링 편입 필요; **초 단위는 원리적으로 불가**(export 주기가 알갱이) |

**대조표에서 나오는 결정 두 가지**
1. X-View·대시보드는 **스팬 전량 수신**이 필요하고, 그것은 tail 샘플링 **앞**에서만 얻는다 → Collector 파이프라인 분기(§2.2).
2. 액티브 요청과 리소스는 **상류가 정하는 지연**(스팬 종료 후 export·메트릭 export 주기)을 화면이 넘을 수 없다 → 문구·근사 방식을 정직하게(§2.6·§4.2).

---

## 2. 아키텍처

### 2.1 핵심 결정 — 수신·집계 전량, 표시 표본, 휘발 / 트레이스 분석은 샘플·보존

```
 [앱] javaagent 2.31.1 ─OTLP grpc─▶ Collector 0.159.0
                                     receivers.otlp ──┬──▶ traces      : … → tail_sampling(10s) → batch 5s → otlp_http/moveseye ──▶ POST /apm/otlp/v1/traces → apm_span (7일)   [impl-r3 반영: 별칭 통일]
                                                      │                                                                                     (오류·느림 100% · 정상 NORMAL_PCT)
                                                      └──▶ traces/live : transform(구/신 semconv 정규화) → filter(HTTP SERVER만·자기계측 제외) → transform(keep_keys + name/status/events/links/scope/schemaUrl 정리, error_mode ignore)
                                                                        → redaction/live(허용 키의 **속성 값만** 검사 — 주민번호·카드·이메일 패턴) → filter/live-safety(정리 결과 위반 스팬 drop — 비-속성 필드의 유일한 방어) → batch 1s(max 1,000)   [R-P5 반영: 실측 §2.1·§4.2·§9] [R-P5b 반영: §7c·§8]
                                                                        → otlp_http/moveseye-live(메모리 큐 5배치·재시도 없음)   ※ 실행 명령에 --feature-gates=ottl.set.allowNil 필수   [impl-r3 반영: 별칭 통일]
                                                                        ──▶ POST /apm/otlp-live/v1/traces  (메타 스냅샷 캐시로 판정 — hot path DB 0회)
                                                                            → dedup(traceId,spanId 60초) → 1초 버킷 집계(전체 관측) → LiveSpanRing(reservoir + 강조 계층, 전역 슬롯 arena)
                                                                            → SSE /apm/live/spans/stream (1초 tick: buckets 교체 + stats revision)
                                                                            → X-View · 대시보드 · 패턴 라벨
```

- `[C-r1 반영]` **fan-out은 동기·비격리다.** 같은 receiver를 두 파이프라인이 받으면 Collector가 데이터를 복제해 각 파이프라인의 processor 인스턴스로 넘기지만, 이 호출은 **동기**이고 프로세스의 CPU·메모리를 **격리하지 않는다** — 앞단 processor가 막히면 receiver와 다른 파이프라인도 영향을 받는다(Collector 아키텍처 문서). v0의 "각각 독립으로 처리한다"는 틀렸다. 얻는 것은 두 가지뿐이다: `traces/live`가 `tail_sampling`의 `decision_wait 10s`를 **타지 않는다**(그래서 지연이 초 단위가 된다), exporter 큐가 따로라 라이브 BE가 느려도 저장 exporter 큐를 막지 않는다. **저장 경로 보호는 장애 주입(R2)으로 증명**하고, 실패하면 큐·동시성·부하를 먼저 줄이고 그래도 안 되면 **별도 live Collector 프로세스**를 검토한다(그때도 receiver 분기 지점의 공유 비용은 남는다). `[R-P5 반영: 실측 §11·§12]` ✅ **장애 5종(무응답 10s hang·429·503·연결 거부·partialSuccess) 각 120초에서 저장 경로 추가 유실 0·중복 0 · `receiver_refused_spans` 0 · live 큐 선언 상한 5 초과 0 · OOM 0** — "exporter 큐가 따로라 라이브 BE가 느려도 저장을 막지 않는다"는 관측으로 뒷받침됐다. `[C-r3 반영: §1.1 ②③]` 단 이 저장 보호는 **제한된 관측**이다 — 저장 처리량 1.003은 `proxy 도착 스팬 수 / 생성 SERVER 수` 비율(기대 저장 ID 집합·실제 DB·집계 대조 아님), 저장 지연은 **완료→proxy 도착**(BE 수용·commit 아님)이며 ON p95 11,966~12,528ms는 "기준선 11,962~12,422ms **안**"이 아니라 OFF 대비 **허용 증가량(max(0.1×L_OFF, 500ms) = 1,199ms) 안**이다. 계약 기준(ID 집합·commit)의 증명은 R2′(§6.0). 반면 **정상 상태 CPU는 `C_ON/C_OFF` 1.49배로 합격선 1.20을 넘겼다**(R2-1 FAIL — §5.3·§6.0). `[C-r3 반영: §1.4]` 기록은 두 문장으로 고정한다 — *"이번 비격리 시험은 CPU 합격선을 충족하지 못했다. 격리된 지원 환경에서의 CPU 증가율과 합격 여부는 아직 확정되지 않았다."* "노이즈가 있으니 PASS일 수도"라는 사후 면제도, "49% 증가가 인과적으로 확정됐다"도 쓰지 않으며 R2′ 실패를 미리 판정하지도 않는다. 방향(ON이 두 OFF 구간 모두보다 높다)은 관측 사실이고 크기(OFF끼리 39% 편차·기준 CPU 54~72%·부하 천장 600/초·CPU 측정 구간에 무부하 준비 20초·drain 60초 혼입·동시 export 8개 하네스)는 불확실하므로 **FAIL로 두되, 격리 호스트 재측(R2′)을 P5.1 출시 게이트로 삼는다**. 그 전까지 "별도 live Collector 프로세스"는 대안 후보일 뿐 채택하지 않는다(§6.0 완화 후보 표).
- `[C-r1 반영]` **processor는 파이프라인마다 인스턴스가 생기고 설정을 공유한다.** v0의 "이름을 공유하면 배치 크기·큐가 얽힌다"는 틀렸다 — 라이브 전용 이름(`batch/live` 등)을 쓰는 이유는 **설정 변경의 영향 범위를 가르기 위해서**다. `memory_limiter`는 프로세스 전체 상한이라 공유가 맞다.
- 🔴 **라이브 요청 hot path는 DB를 만지지 않는다**(`[C-r1 반영]` — "DB 0회"는 **hot path에 한정**, 메타데이터는 §2.3.1 스냅샷 캐시). 영수증(`apm_otlp_receipt`)도, 폐기 통계 테이블도, 파티션도 없다. 저장 경로의 관문(③ dedup·⑥ 적재·⑧ 영수증)과 **아무것도 공유하지 않는다** — 공유하는 순간 라이브 장애가 저장을 503으로 만들고, 503은 재전송 → 1m 두 배 사고(Live 설계 §2)로 이어진다.
- ⚠️ 이중 전송: 스팬 하나가 Collector에서 두 번 처리되고, SERVER 스팬은 두 번 export된다(하나는 깎인 것). 비용은 §5.1·§5.3.
- 🔴 **`error_mode: propagate`는 폐기한다 — 라이브 프로세서는 전부 `ignore`** `[R-P5 반영: 실측 §13]` (v2의 "추정"이 **사실로 확인**됐다). transform은 오류를 상류로 반환하고 fan-out은 각 consumer 오류를 모아 receiver에 돌려준다(✅ `fanoutconsumer/traces.go:42-68`). 실측(§13.2): 라이브 정리 문장 **하나**를 런타임 실패하게 만들자 `propagate`에서는 SDK가 **503 × 5,176(전량 실패)** 을 받아 3,882회 재전송했고, 저장 분기는 그 요청을 이미 처리했으므로 **`apm_span` 중복 26,769건(고유 8,923의 300%)** 이 생겼다. 라이브 도달은 0. 같은 실패 문장을 `ignore`로 돌리면 중복 0·유실 0(기준선과 동일). 즉 v2 §2.2 주석 "정리 문장이 실패하면 배치를 폐기한다"는 틀렸다 — 실제로는 **상류 전체를 실패시키고 저장을 오염**시킨다. **결정(P0-5, Claude 오케스트레이터)**: 셋 중 **(a) `error_mode: ignore` + 실패 관측**을 채택한다. 근거: (b) 정리를 `batch/live` 뒤로 옮기면 batch가 원문(PII)을 들고 있는 구간이 생기고 재측이 필요하며, (c) 별도 프로세스는 receiver 분기 공유 비용이 남고 운영 대상이 하나 는다. **저장 경로 오염이 휘발 경로 보호보다 우선**이라는 원칙에서 (a)가 유일하게 저장을 건드리지 않는다. (a)의 대가 — 정리 문장이 실패하면 그 스팬이 **덜 깎인 채 통과**할 수 있다 — 는 다음 셋으로 막는다: ① `transform/live-slim`은 **입력에 의존해 실패할 수 없는 문장만**(상수 `set`·`keep_keys`·`truncate_all`)을 담는다는 **불변식**을 §2.2에 적고, 입력 의존적인 `transform/live-normalize`·`redaction/live`는 추가·변경 때마다 실패 fixture 주입 시험(R2′ "transform 실패" 항목)을 반복한다. `[R-P5b 반영: §7b·§7c·§10-⑨]` ✅ 이 불변식의 **값이 실측됐다** — OTTL `ignore`는 문장 하나가 실패해도 같은 블록의 나머지 문장을 계속 실행하지만(변형 B: 첫 문장 실패 뒤 13문장 정상), **실패한 그 문장의 효과만 건너뛰므로** 정리 문장 자체(`set(span.status.message, "")`)가 실패하면 그 필드는 **무방비로 전송**된다(v3 yaml 변형 C: 1,337/1,337 스팬이 PII를 실은 `status.message`를 달고 live 도달 — `redaction/live`도 잡지 못했다, 아래 ⑤). 🔴 절차: **이 블록을 고칠 때는 R-P5b §7의 C fixture(정리 문장 실패)를 반드시 재실행**한다 ② **BE 카나리아** — 라이브 파서가 스팬에 `events`/`links`/허용목록 밖 키가 하나라도 있으면 그 배치를 거절하지 않고 **`slimBypassed` 카운터**를 올려 수집기 탭 경고로 띄운다(§2.3) ③ ~⑤는 `[C-r3 반영: P0 판정 1 🔴 · §2.1·§2.2 수정안 5 · 질문 1 답]`로 v3의 "Collector 자기 메트릭 감시"를 **대체**한다 — 🔴 **exporter 카운터는 OTTL 실패를 세지 않는다.** 0.159.0에서 OTTL 문장 실행 오류 + `ignore`는 WARN **`failed to execute statement`**(`error`·`statement` 필드)를 남기고 계속 실행해 `nil`을 반환하며, 조건 평가 오류는 별도 WARN **`failed to eval condition`**, gate OFF의 `set(..., nil)`은 오류가 아니라 nil 무시·gate 활성화를 안내하는 **1회 WARN**이다(✅ 보존 로그 `rp5/col_p2ign.log:49`·`col_dv2_nogate.log:45`). 문장 실패 전용 카운터는 없고 `otelcol_processor_incoming/outgoing_items`는 정리에 실패한 채 그대로 전달된 스팬을 구분하지 못한다(입출력 수가 같다). 따라서 v3의 "gate OFF 경고 0건"·"`ignore` 오류는 `failed processing traces`로 감시"는 **정정**한다. ③ **오류 관측** — 위 WARN 2패턴 + gate WARN을 Collector 로그에서 component·pipeline별로 **계수**해 수집기 탭에 올린다(로그 수집 경로 = 6단계 범위). `[R-P5b 실측 ✅ §7b·§7d·§3.3]` 두 WARN 모두 **실재**하고 `otelcol.component.id`·`otelcol.pipeline.id`(`traces/live`)·`otelcol.signal` 라벨을 달고 온다(원문은 실측 §7b) → 컴포넌트·파이프라인별 집계 가능. 🔴 단 **WARN 수 ≠ 손실 수** — 내부 로그 샘플링이 실측으로 확인됐다(변형 A: 13,196스팬 전부 실패인데 WARN **170줄** · 변형 C: 1,337 실패에 **52줄**). `failed processing traces`는 `ignore` 모드에서 **0건**(감시 문자열로 쓰면 아무것도 못 잡는다). transform 문장 실패는 **어떤 메트릭에도 올라오지 않는다**(A·B·C 전부 `incoming == outgoing`) — v3 ❓ "실패 문장이 메트릭으로 올라오는가"의 답은 **"아니다"**. gate OFF WARN은 프로세스 수명당 **1회**이고 **파이프라인·컴포넌트 라벨이 없다**(`ottlfuncs/func_set.go:46`은 전역) — 알람은 "이 Collector에 gate가 빠졌다"까지만 말할 수 있다. 반면 **filter 프로세서에는 정확한 전용 카운터가 있다**(`otelcol_processor_filter_spans_filtered{filter="filter/live-safety"}` — 라벨 값에 타입 접두 `filter/`가 붙는다) → "정리 실패 감시"는 **로그 WARN 2패턴(부정확·샘플링) + filter 차단 카운터(정확)**의 조합이다. ⚠️ Collector 내부 로그에는 **샘플링 설정**이 있어 정책에 따라 일부 이벤트가 남지 않을 수 있다 — 로그 계수는 "발생 여부·규모"의 신호이지 정확한 손실 수가 아니며, exporter 손실 계수와 **분리해** 표시한다. ④ **후조건 검사 확장** — BE 카나리아를 `events`/`links`/허용목록 밖 키뿐 아니라 `scope.name/version/schemaUrl`·resource `schemaUrl` 잔존, `span.name ≠ "_live"`·`status.message`·`traceState` 잔존, 허용 키 안의 **잘못된 타입·길이 초과·형태 위반**까지 검사하고 `reason`별 위반 수를 기록한다(원문 payload는 기록하지 않는다 — §2.3 카나리아 행). ⑤ **전송 전 차단** — PII 전송 금지 요건은 BE 카나리아만으로 충족되지 않는다(BE에 닿은 시점에 이미 전송됐다). 정리 후 **안전한 형태**를 만족하지 못한 스팬은 Collector가 live 분기 밖으로 내보내지 않는다: `redaction/live` 뒤·`batch/live` 앞에 **타입 안전 검증 processor `filter/live-safety`**(§2.2 yaml — 조건이 하나라도 참이면 drop)를 둔다. 🔴 filter의 `error_mode: ignore`는 조건 평가 오류를 false로 보아 스팬을 **남긴다(fail-open)**. `[R-P5b 반영: §8.3 — 답을 얻었다]` **fail-open은 조건 단위다**: 13조건 앞에 반드시 실패하는 14번째 조건을 넣어도(`v4brk`) 나머지 12조건은 정상 동작해 차단 1,333·live 0 — 즉 오류가 프로세서 전체를 무력화하지는 않는다. 그러나 **`span.status.message != ""` 조건 자체**를 실패하는 표현으로 바꾸면(`v4hole`) 그 조건이 맡던 검사만 **조용히 사라져** 1,335/1,335 PII 스팬이 통과하고 **차단 카운터는 0**이라 "잘 돌고 있다"처럼 보인다(유일한 신호 = 샘플링된 WARN 52줄). 결정 — ⓐ `filter/live-safety` 조건은 **nil·타입에 안전한 형태만 쓴다**를 권고에서 **불변식**으로 승격한다(현행 13조건은 `Len`·`IsString`·`IsInt`·문자열 비교·`IsMatch`로 nil·비문자열·배열·빈 슬라이스 fixture 전체에서 eval 오류 **0** — 실행 검증 완료 · **조건을 추가·변경할 때는 fail-open fixture(`v4hole` 방식: 그 조건을 깨뜨리고 C fixture 주입)를 반드시 재시험**) ⓑ 알람 조건 **`failed to eval condition{otelcol.pipeline.id="traces/live"} == 0`**(0이 아니면 게이트에 구멍이 뚫린 상태 — 파이프라인 한정 계수, 6단계 로그 수집 범위). `[impl-r3 반영: 6단계 검수 정본 반영 ②]` 🔴 **이 알람의 판정 불가 구간을 명시한다** — 건강한(문제 없는) Collector는 애초에 이 WARN을 **쓰지 않으므로**, 로그 수집이 죽거나(수집기 자체 장애) 60초(신선도 판정, §2.3) 넘게 관측이 없으면 이 조건의 수치는 "0"이 아니라 **`null`(결측)**이 된다. 화면·알람은 **결측을 정상 0으로 표시하지 않는다** — 결측은 별도 축(예: "판정 불가")으로 보이거나 로그 수집 생존 신호(하트비트)와 함께 읽어야 하며, "값이 없으니 0으로 간주"는 게이트 구멍을 조용히 은폐한다 ⓒ 차단 카드에 **어느 조건에 걸렸는지(`reason`)**를 표시할 수 없다(filter 카운터는 프로세서 단위) — 운영자가 "통과 못 한 이유"를 알려면 BE 카나리아 `slimBypassed{reason}`(§2.3)과 나란히 읽는다. 대안 구조 — **유계 비동기 경계 뒤에서 정리 실패를 차단하는 구조**(라이브 분기를 별도 큐/프로세스로 떼어 실패를 그 경계에서 폐기) — 는 R-P5b가 "프로세서 전체 무력화"를 관측하지 않았으므로 R2′ **필수 항목에서 빼고 후보로만 존치**한다(불변식·알람으로 닫는다). `enqueue_failed + send_failed{exporter="otlp_http/moveseye-live"}`(`[impl-r3 반영]` 별칭 통일) 합산(실측 §12.3 — 하나만 보면 절반을 놓친다)은 **"전송 실패 신호"**로 부른다 — timeout 뒤 BE가 이미 수용했을 가능성과 partialSuccess·processor 실패가 빠지므로 정확한 종단 유실 수로 명명하지 않는다. 결함 명칭은 코덱스 정정대로 **"라이브 processor 오류의 상류 전파에 따른 저장 분기 중복 전송"** — DB 중복 행 발생까지 실증한 것은 아니다(✅ 현재 `ApmSpanStore:62`는 `ON CONFLICT DO NOTHING`, `ApmTraceWriter:143`은 저장된 논리 span ID를 거른다; 실측 QA jar와 현재 코드의 동일성은 R2′에서 확인). 300%는 그 fixture(재시도 3회 SDK)의 결과이지 운영 중복률이 아니다. 이 결함만으로 동기 분기의 `propagate` 제거 근거는 충분하다. 리스크 #10은 "추정 → **실측 확인**"으로 갱신(§7).

### 2.2 Collector — `traces/live` 파이프라인 (템플릿 정본 후보, `collector-template.yaml`에 추가) `[C-r2 반영: HTTP만·OTTL 0.159.0 구문·feature gate·큐 sizer/consumers]` `[R-P5 반영: 실측 §2.1·§3.1·§4·§9 P0-1·P0-2·P0-5·P0-6 — error_mode ignore·값 검사 redaction·OTTL 4문장 추가·max 1,000]`

순서는 코덱스 권장대로 **구/신 속성 정규화 → protocol 판별 → HTTP SERVER 선택 → 속성 정리 → 값 검사**. 아래는 실측에서 **각 요소가 실행 검증된 문장의 합**이다 — ① `transform/live-normalize`·`filter/live-http-server`·`set(span.name, "_live")`·`keep_keys(instrumentation_scope.attributes, [])`(span 컨텍스트)는 설계 v2 원문 재측정(실측 §4.1)에서 ✅, ② `redaction/live`·scope/schema_url 4문장·`truncate_all`은 유출 0을 만든 최소 조합 H3(실측 §2.1·§3.2, **13/13 clean** · 정상 fixture 정상 전달 · 오탐 0)에서 ✅. `[C-r3 반영: P0 판정 2 🟡 · §1.1]` **결합 YAML은 새 시험 대상**이다 — 서로 다른 YAML의 PASS를 합쳐 v3/v4의 PASS로 만들 수 없다. `[R-P5b 반영: §2]` ✅ **R-P5b 결합 YAML correctness 시험 완료**(`../verification/r-p5b_apm-live-yaml-correctness.md`, 2026-09-15 17:20~18:10 — v3 16:52 사본과 v4 17:38 사본을 **각각** 결합 정본으로 실행): **v3 yaml FAIL**(직렬화 최대 무한 11.9~26.2 MiB · 정리 문장 실패 시 PII 100% 전송 · resource 900 B 원형 통과 · 비문자열 값 통과) → **v4 yaml correctness PASS** — validate+기동 gate ON/OFF ✅ · 분기 E=A=8,431(오포함 0·탈락 0) ✅ · PII 13/13 차단 + 대조군(정상 route·service.name·instance.id·method·status_code) 원형 보존 + 절단 경계 U+FFFD 0 ✅ · 해제 후 직렬화 최악 1.337 MiB ✅ · `ignore` 실패 fixture 전량 차단 ✅ · live-safety 정상 오탐 0 ✅ · 형태 fixture 13/13 ✅ · `truncate_all(resource,128)` 900→126 B ✅. **아래 yaml은 그 실행 검증본(`scratchpad/rp5b/v4_on.yaml`)과 문장이 같다** — 실측으로 바꾼 yaml 문장은 없고 주석·운영 규칙만 바로잡았다. 🔴 단 **BE 압축본 상한 512 KiB는 정상 입력을 거절**(gzip 572.4 KiB)하므로 §2.3.0에서 2 MiB로 올렸다(yaml 밖 설정값). R2′는 이 yaml 위에서 성능만 본다. ⓘ `[R-P5b 반영: §3.1]` 0.159.0은 `env:` 접두 없는 맨 `${VAR}`도 환경변수로 확장하고, **미설정이면 `at least one endpoint must be specified`로 기동을 명시적으로 거부**한다(조용한 실패 아님 — 설치 가이드 관점에서 좋은 성질). `${env:VAR}` 권장은 상위 버전 호환용으로 유지. 실측이 남긴 세 함정을 먼저 적는다: (1) 🔴 `otelcol-contrib validate` 통과는 **아무 증거가 아니다** — 아래 문장 전부 validate를 통과하지만 gate 없으면 `set(_, nil)`이 조용히 무시된다(§3.1) (2) 0.159.0은 `set(name, …)` 같은 무접두 경로를 `span.name`으로 고쳐 쓰고 INFO를 남긴다 — 접두를 붙여 적는다 (3) 생성 yaml의 별칭 `otlphttp`·`resourcedetection`은 0.159.0에서 **deprecated WARN**(`otlp_http`·`resource_detection`) — 지금은 동작하나 상위 버전에서 깨지므로 `ApmCollectorConfigGenerator` 별건 수정(실측 §3.7·P2-1). `[impl-r3 반영: 6단계 검수 정본 반영 ③]` ✅ **6단계에서 정정 완료** — 생성 yaml(저장 exporter `otlp_http/moveseye`·라이브 exporter `otlp_http/moveseye-live`·`resource_detection` 정의 2줄 + 파이프라인 4줄 + k8s 1줄)은 이제 신 별칭만 쓴다(`ApmCollectorLiveRuntimeTest`가 실제 Collector 로그에 `alias is deprecated` **없음**을 확인). 🔴 이 치환은 **정의·k8s 하드코딩 문자열을 직접 고친 것**이지 전역 문자열 치환이 아니다 — 최초 구현은 조립 완료 후 문자열 전체에 `replace("otlphttp/", "otlp_http/")`를 걸어 **관측 템플릿(`collector-live-observation-template.yaml`)이 일부러 신·구 별칭을 둘 다 받도록 심어 둔 조건**까지 접어 버렸다(구 별칭 Collector의 `partialSuccess` 로그가 `kind="other"`로 잘못 분류돼 경고 카운터가 조용히 0이 되는 결함). 이제 **관측 템플릿만 신·구 별칭 호환 분기를 유지**하고 나머지 생성물은 신 별칭 단일이다(BE 대조 코드 `ApmCollectorMetricStore.isLiveExporter`·`ApmCollectorLogStore.LIVE_COMPONENTS`는 여전히 두 표기를 다 받아 손수 편집한 구 설정과도 맞물린다).

```yaml
# 🔴 이 설정은 실행 명령에 --feature-gates=ottl.set.allowNil 이 없으면 span.events / span.links 정리가
#    오류·경고 없이 무시되어 스택트레이스·예외 메시지·링크 속성이 그대로 전송된다(실측 §4.3: PII 3종 + 전송량 +47%).
#    ApmCollectorConfigGenerator가 라이브 블록을 넣을 때 이 문구를 yaml 상단(토큰 자리표시 안내 자리)에 그대로 박는다.  [R-P5 반영: 실측 §6]
processors:
  transform/live-normalize:                 # [C-r2] 구/신 semconv 정규화 — 판별·정리보다 먼저. ✅ 실측 §4.1: 구형 1,548건이 3키 모두 갖고 도착(§3.4 결함 해소)
    error_mode: ignore                      # [R-P5] propagate 폐기(§2.1). ⚠️ 이 프로세서는 입력 의존적(where 조건) — 변경 시 실패 fixture 시험 반복(R2′)
    trace_statements:
      - context: span
        statements:
          - set(span.attributes["http.request.method"], span.attributes["http.method"]) where span.attributes["http.request.method"] == nil and span.attributes["http.method"] != nil
          - set(span.attributes["http.response.status_code"], span.attributes["http.status_code"]) where span.attributes["http.response.status_code"] == nil and span.attributes["http.status_code"] != nil
  filter/live-http-server:                  # [C-r2] HTTP SERVER만 남긴다(첫 출시). ✅ 실측 §4.1: RPC 1,803건·자기계측 873건·비-SERVER 전부 0건 통과, 적격 탈락 0
    error_mode: ignore                      # 조건 평가 실패 = 그 스팬을 남긴다(다음 단계 transform이 다시 깎는다)
    traces:
      span:
        - 'span.kind != SPAN_KIND_SERVER'                                     # ✅ enum 표기·kind.string "Server" 둘 다 동작(실측 §3.1·§4.1)
        - 'span.attributes["http.request.method"] == nil'                     # HTTP 판별 = method 존재. HTTP 위 RPC(속성 겹침)는 P5.5의 우선순위 규칙
        - 'resource.attributes["service.name"] == "${SELF_SERVICE_NAME_BE}"'   # 🔴 자기계측 제외 — 배포에서 정한 **정확한 식별자**로. 광범위 정규식(moves.*) 금지 [C-r2]
        - 'resource.attributes["service.name"] == "${SELF_SERVICE_NAME_COLLECTOR}"'
  transform/live-slim:                       # 5~7속성만. 🔴 keep_keys는 attributes만 정리한다 — name·status·events·links·trace_state·scope name/version/schema_url은 따로
    error_mode: ignore                       # [R-P5 반영: 실측 §13] propagate는 저장 경로 300% 중복. 🔴 불변식: 이 블록에는 입력에 의존해 실패할 수 있는 문장을 넣지 않는다(상수 set·keep_keys·truncate_all만)
    trace_statements:
      - context: span
        statements:
          - keep_keys(resource.attributes, ["service.name", "service.instance.id", "deployment.environment.name"])
          - truncate_all(resource.attributes, 128)                        # [C-r3 반영] Collector 측 직렬화 상한의 입력(§2.3.0) — BE 상한(instance 128·service 128)과 같은 값. 바이트 기준
                                                                          # [R-P5b 실측 ✅ §5.3·§6.1] 900 B → 126 B. 이 문장이 없으면(v3) 전송 최대가 무한이다 — resource 8 KB + 그룹 1,000으로 26.2 MiB 실측
          - set(resource.schema_url, "")                                    # [R-P5 반영: 실측 §4.2] 없으면 schemaUrl로 문자열이 샌다(7,206건)
          - keep_keys(instrumentation_scope.attributes, [])                 # ✅ span 컨텍스트 경로로 동작(실측 §4.1) — 별도 context: scope 불필요
          - set(instrumentation_scope.name, "")                             # [R-P5 반영: 실측 §4.2] 없으면 scope.name으로 샌다(3,603건)
          - set(instrumentation_scope.version, "")                          # [R-P5 반영] 같음
          - set(instrumentation_scope.schema_url, "")                       # [R-P5 반영] 같음
          - keep_keys(span.attributes, ["http.route", "http.request.method", "http.response.status_code", "error.type"])   # rpc.system 제거(HTTP만)
          - set(span.name, "_live")                                         # ✅ 실측 §4.1: 6,346건 모두 "_live"로 도착. 빈 문자열은 JSON에서 필드 자체가 사라지므로(§3.1) 고정 이름이 파서에 명확
          - set(span.status.message, "")
          - set(span.trace_state, "")
          - set(span.events, nil)                                           # ✅ gate ON에서 0건(실측 §4.1). 🔴 gate OFF면 100% 통과·경고 없음(§4.3)
          - set(span.links, nil)                                            # 같은 조건
          - truncate_all(span.attributes, 256)                              # [R-P5 반영: 실측 §14.1] 🔴 **바이트** 기준. 자원 보호이지 PII 제거가 아니다
                                                                          # [R-P5b 실측 ✅ §5.3] 바이트 상한을 지키되 **문자 경계에서 자른다** — 한글 300 B route → 255 B/87자, U+FFFD 0. "UTF-8 깨짐" 우려는 해소. 문자열만 자른다(비문자열 값은 live-safety가 drop)
  redaction/live:                            # [R-P5 반영: 실측 §4.2·§9 P0-1] 🔴 keep_keys는 '키'만 거른다 — 허용한 키(http.route·service.instance.id)의 '값'에 심은 PII가 그대로 나갔다(4,798·3,603건).
    allow_all_keys: true                     #    값 검사는 Collector에 있어야 "전송 노출"을 막는다. BE 값 검사(§2.3 __unsafe__ 치환)는 "화면 노출" 방어 — 둘은 대체재가 아니다
    blocked_values:                          #    ✅ 실측 §9 P0-1 대조군: 정상 route('/orders/{id}' 등)·instance id·service name 전부 원형 그대로(오탐 0)
      - '\b\d{6}-\d{7}\b'                    # 주민등록번호
      - '\b(?:\d[ -]*?){13,16}\b'            # 카드번호. ⚠️ 13~16자리 연속 숫자를 담은 route(예 /orders/1234567890123)는 마스킹된다 — 템플릿(`{id}`)으로 정규화된 정상 계측에서는 없고, 있다면 그 값 자체가 식별자라 마스킹이 바람직(도움말에 적는다)
      - '[\w.+-]+@[\w-]+\.[\w.]+'            # 이메일
    summary: silent                          # [C-r3 반영: 질문 5 답] 마스킹 요약 속성(redaction.masked.*)을 스팬에 덧붙이지 않는다 — 붙으면 허용 키 4개를 넘어 아래 live-safety가 그 스팬을 drop한다.
                                             # [R-P5b 실측 ✅ §8.4] 0.159.0 **기본값도 silent**(생략해도 요약 속성 없음). 그러나 info/debug로 바꾸면 **live 전량 drop(470/466건 = 100% 실명)** → 🔴 **명시가 방어다** — ApmCollectorConfigGenerator가 이 줄을 반드시 찍고 운영 문서에 "이 값을 바꾸면 실시간 화면이 빈다"를 적는다
                                             # 🔴 [R-P5b 반영: §7c·§3.3] **방어 범위 = 속성 값(span.attributes·events[].attributes)만.** status.message·span.name·traceState·scope 필드·events[].name·links[].attributes 는 검사하지 않는다(실측: 정리 실패로 남은 status.message 의 이메일 패턴 1,337건 미마스킹 · gate OFF 에서 events[].attributes 는 마스킹됐고 events[].name·links[].attributes 는 원형 통과). 비-속성 필드의 유일한 방어는 아래 filter/live-safety
                                             # ⚠️ 입력 의존적 프로세서 — 패턴 추가·변경 때마다 실패 fixture 시험(R2′). error_mode 개념이 없으므로 정규식 오류는 validate에서 잡힌다(정규식 컴파일 오류 = 초기화 실패)
                                             # ✅ [R-P5b §5.2] 값 전체를 버리지 않고 매치 구간만 마스킹한다(`/users/{id}/PII-ROUTEVAL-909-****`) — 식별자 앞부분은 남아 화면 유용성 유지 · 정상 route·service.name·instance.id 오탐 0
                                             #    [C-r3 반영] redaction 유지(replace_pattern 통합은 correctness 통과 후보 비교 뒤 — §6.0 후보 c). "정상 식별자 보존"(service·instance 정상 값이 안 바뀜)이 R-P5b 대조군
  filter/live-safety:                        # [C-r3 반영: §2.2 수정안 3 — 전송 전 차단] 🔴 정리 뒤 "안전한 형태"를 만족하지 못한 스팬은 live 분기를 떠나지 않는다. BE 카나리아(§2.3)는 "전송된 뒤"의 검출이라 이 자리를 대체하지 못한다
    error_mode: ignore                       # 🔴 filter의 ignore = 조건 평가 오류 시 그 조건을 false로 보고 스팬을 **남긴다**(fail-open).
                                             # 🔴 [R-P5b 반영: §8.3] **조건 단위 fail-open 실증** — 깨진 조건이 맡던 검사만 조용히 사라지고(v4hole: PII 1,335 통과) 차단 카운터는 **0**, 신호는 샘플링된 WARN 52줄뿐. 나머지 12조건은 정상(v4brk: 차단 1,333).
                                             #    → **불변식**: 아래 조건은 nil·타입에 안전한 형태만(Len·IsString·IsInt·문자열 비교·IsMatch — nil·비문자열·배열·빈 슬라이스 fixture 전체에서 eval 오류 0 으로 실행 검증됨). 조건 추가·변경 시 fail-open fixture(그 조건을 깨뜨리고 C fixture 주입) 재시험 필수
                                             #    → **알람**: pipeline=traces/live 의 WARN `failed to eval condition` 은 **0 이어야 한다**(0 이 아니면 게이트에 구멍)
                                             #    자기 메트릭 [R-P5b 실측 ✅ §7d]: 차단 수 = `otelcol_processor_filter_spans_filtered{filter="filter/live-safety"}` ← 🔴 라벨 값에 타입 접두 "filter/" 가 붙는다(v4 의 `filter="live-safety"` 는 오기) · 통과 수 = `otelcol_processor_outgoing_items{processor="filter/live-safety"}` · 입력 수 = `..._incoming_items{...}` — ApmCollectorMetricStore 는 이 문자열로 맞춘다
    traces:
      span:                                  # 하나라도 참이면 drop. 전부 "정리가 실패했거나 gate가 꺼졌거나 형태가 어긋났을 때만 참"이 되는 조건 — 정상 fixture drop 0건이 R-P5b 대조군
        - 'Len(span.events) > 0'                                                                 # gate OFF → set(nil) 무시 → 여기서 막힌다(PII 전송이 아니라 점 소실 + 차단 수 상승으로 나타남) — [R-P5b 실측 ✅ §3.3] v4 gate OFF: live 0 · PII 0 · 차단 1,345 (v3 gate OFF 는 PII 2종 1,359건 유출)
        - 'Len(span.links) > 0'
        - 'span.name != "_live"'
        - 'span.status.message != ""'
        - 'span.trace_state != ""'
        - 'instrumentation_scope.name != "" or instrumentation_scope.version != "" or instrumentation_scope.schema_url != ""'
        - 'resource.schema_url != ""'
        - 'Len(instrumentation_scope.attributes) > 0'
        - 'Len(span.attributes) > 4 or Len(resource.attributes) > 3'                              # keep_keys 실패·허용목록 밖 키 잔존(redaction 요약 키 포함)
        - 'span.attributes["http.route"] != nil and not IsString(span.attributes["http.route"])'   # 타입 — 길이는 truncate_all이 이미 256B로 고정
        - 'not IsMatch(span.attributes["http.request.method"], "^[A-Za-z_]{1,16}$")'              # 형태·길이(ASCII) — §2.3.0 직렬화 상한의 입력. semconv는 대문자 known 또는 _OTHER
        - 'span.attributes["http.response.status_code"] != nil and not IsInt(span.attributes["http.response.status_code"])'
        - 'span.attributes["error.type"] != nil and not IsMatch(span.attributes["error.type"], "^[A-Za-z0-9_.$-]{1,64}$")'
                                             # ✅ [R-P5b 실측 §8.1·§8.2·§5.3] 13조건 전부 0.159.0 에서 실행 검증됨 — 정상 부하 8,431 스팬 오탐 **0**(incoming 8431 / outgoing 8431) · 차단 대상(status.message 잔존 1,351 · gate OFF events/links 1,345 · 요약 속성 · 한글 error.type · 문자열/실수/불리언 status_code · double route · arrayValue method) 전량 drop · 형태 fixture 13/13 기대 일치(GET/_OTHER/get 통과 · GET123/17자/GET-X 차단 · int 503/nil 통과 · double 200.0 차단 · `java.lang.Foo$Bar-1`/64자 통과 · 공백/65자 차단). 형태 정규식은 BE 값 검사(§2.2 아래 불릿)와 같은 정의를 쓴다
                                             # 🟡 부작용 메모: `^[A-Za-z_]{1,16}$` 는 소문자 method(`get`)를 통과시키고 숫자·하이픈이 든 커스텀 method 를 조용히 drop 한다(semconv 상 미지 method 는 `_OTHER` 로 정규화되므로 실해 낮음)
  batch/live: { timeout: 1s, send_batch_size: 1000, send_batch_max_size: 1000 }   # [R-P5 반영: 실측 §14·P0-6] 2,000 → 1,000. [C-r3 반영: P0 판정 3 🔴] "최악 1.06 MiB"는 route 하나만 채운 fixture의 **외삽**.
    # ✅ [R-P5b 반영: §6.2 — 1,000 **확정**, "넘으면 800" 규칙 삭제] live-safety 를 통과할 수 있는 최대치(route 256 B·method 16·error.type 64·resource 3키×128 B)로만 채운 1,000스팬 배치의 해제 후 본문:
    #    그룹 40 = 0.768 MiB · 그룹 100 = **0.803 MiB** · 그룹 = 스팬 수(1,000) = **1.337 MiB**(ASCII·한글 동일 — 2 MiB 대비 **1.53배** 여유). v4 산술(1.13/1.99 MiB)은 보수적이었다. **그룹 수(resource 블록 복제)가 유일한 변수**다 — batch 는 서로 다른 업스트림 요청의 동일 resource 를 병합하지 않는다.
    #    🔴 R-P5 §14의 "2,000 이면 UTF-8 2.09~2.11 MiB"는 fixture 결함(문자 수를 셈)으로 철회 — 1,000 유지 근거는 위 G=N 실측(2,000 이면 G=N 산술 ≈2.7 MiB 로 초과, 외삽). BE 수용 1,000 은 독립 설정.
    #    🔴 gzip 은 저압축 입력(난수 값)에서 G=N 1,000 배치 **572.4 KiB**(압축비 2.4×) → BE 압축본 상한은 512 KiB 가 아니라 **2 MiB**(§2.3.0). 800 으로 낮춰도 458.7 KiB(여유 10%)라 batch 축소는 해법이 아니다. 정상 부하 @600/초 배치 p50 625스팬

exporters:
  otlp_http/moveseye-live:   # [impl-r3 반영] 6단계 정정 — 구 별칭(otlphttp)은 0.159.0 deprecated. 정의를 직접 신 별칭으로 쓴다(전역 문자열 치환 아님)
    traces_endpoint: ${MOVESEYE_LIVE_TRACES_URL}   # ✅ 실측 §3.7·§3.10: 완전 URL이 그대로 쓰인다(self metric url_path="/apm/otlp-live/v1/traces", /v1/traces 덧붙임 없음).
                                                   #    endpoint:는 뒤에 /v1/traces를 붙이므로 쓰지 않는다. v0의 문자열 접합은 폐기
    encoding: json
    compression: gzip                              # ✅ 실측 §3.7: 슬림 1초 배치는 10.5~11.5배 압축(44~45 B/스팬) — 설계 가정 5~9배보다 유리. 🔴 [R-P5b 반영: §6.2] 이 **평균** 압축비를 BE 압축본 상한 근거로 쓰지 않는다 — 난수 값 입력은 **2.4×**(gzip 572.4 KiB/1,000스팬)이고 상한은 해제 후 상한과 같은 2 MiB(§2.3.0)
    headers: { Authorization: "Bearer ${RECEIVE_TOKEN}" }
    timeout: 3s                                    # 요청 1건의 상한. 🔴 큐 대기까지 포함한 freshness 상한이 아니다 — 그것은 queue_size가 정한다
    sending_queue:
      enabled: true
      sizer: requests                              # [C-r2] 단위를 명시 — 5 = 배치 5개(스팬·바이트가 아님)
      queue_size: 5                                # 🔴 대기분만의 환산이다. 5배치 × 1,000 = 최대 5,000스팬 ≈ 2.3MB 직렬화분(실측 단가 458B). ✅ 실측 §11: 장애 중 큐가 정확히 5에서 멈추고 넘치는 분은 enqueue_failed로 계수·저장 무영향. **체류 5초를 보장하지 않는다**(§5.3)
      num_consumers: 1                             # [C-r2] 기본 10을 그대로 두면 in-flight가 큐 상한 밖에서 10배치 더 생긴다. [C-r3 반영: 질문 6 답] **1을 재측 기준 후보**로 정본에 두고 R2′에서 2와 비교한다(실측 §2.1·§11이 1로 통과). 1이 성능 목표를 만족하면 1 확정. 2가 CPU를 반드시 두 배 쓰는 것은 아니다 — queue 5와 in-flight를 **별도로** 관측하고 선택값으로 정식 3회 반복. 체류 모델은 §5.3(consumers 1 ≈ 18초·2 ≈ 12초, 추정)
      wait_for_result: false
      block_on_overflow: false                     # 넘치면 버린다 — 늦은 라이브 데이터는 쓸모가 없다. ✅ 실측 §12.5: 그래서 복구 시 몰아칠 물량 자체가 없고 live 큐는 장애 해제 다음 tick(1초)에 0으로 복귀
                                                   # 🔴 storage(file_storage) 지정 금지 — 디스크 큐 공유는 재기동 후 "옛 실시간"을 보낸다
    retry_on_failure: { enabled: false }           # 재시도하면 5초 뒤 도착한 "실시간"이 된다. ✅ 실측 §12: 429·503·연결 거부·partialSuccess 어느 경우도 재전송 0.
                                                   # ⚠️ 연결 거부 시 ERROR 로그 "Exporting failed. Dropping data. Try enabling retry_on_failure…"는 **설계된 폐기**다 — 운영 문서에 오설정이 아님을 적는다(§12.4)

service:
  pipelines:
    traces/live: { receivers: [otlp], processors: [memory_limiter, transform/live-normalize, filter/live-http-server, transform/live-slim, redaction/live, filter/live-safety, batch/live], exporters: [otlp_http/moveseye-live] }   # [C-r3 반영] live-safety는 redaction 뒤·batch 앞 — batch가 원문을 쥐는 구간 없음. [impl-r3 반영] exporter 참조도 신 별칭
```

**실행 명령 — yaml과 같은 화면에서 같이 바뀐다** `[R-P5 반영: 실측 §6·P0-3]`:
```
otelcol-contrib --config <config.yaml> --feature-gates=ottl.set.allowNil
```
🔴 현재 설치 가이드(`GET /apm/install-guide`)가 내려 주는 실행줄에는 이 플래그가 **없다**(실측 §6 — 가이드 전문에 `feature-gates` 0건). 관리자가 "새 yaml을 받아 덮어쓰기"만 하면 라이브 파이프라인은 켜지지만 events/links 정리는 안 되고, **제품이 그 사실을 감시하지 않는다**(`[R-P5b 반영: §3.3·§9]` 정확히는 프로세스 수명당 **WARN 1회**가 있으나 파이프라인·문장 라벨이 없고 카운터도 없다 — "로그 0"이 아니다. 세 실행줄에 `feature-gates` 0회임을 R-P5b가 문자열로 재확인, 수정 없음). P5.1에서 ✅ `ApmInstallGuideService`의 세 실행줄 — linux systemd `ExecStart=%s --config %s`(`:256`) · Windows `New-Service -BinaryPathName '"…otelcol-contrib.exe" --config "…"'`(`:230~233`) · macOS plist `ProgramArguments`(`:325~330`) — 전부에 `--feature-gates=ottl.set.allowNil`을 넣고, `ApmInstallGuideServiceTest`에 세 OS 모두 그 문자열이 있는지 검사를 더한다. gate는 프로세스 전체에 걸린다 — ✅ 저장 파이프라인 OTTL(`transform/sql`의 `replace_pattern`·`truncate_all`)에는 `set(_, nil)`이 없어 영향 없음을 **정적으로 확인**(실측 §16), 런타임 회귀는 P5.1 통합 테스트. `[C-r3 반영: P0 판정 4 🟡]` 신규 설치만으로는 부족하다 — **기존 설치 갱신 절차**(이미 등록된 systemd unit·Windows 서비스·LaunchDaemon의 실행 명령을 바꾸고 재시작했는지 확인하는 단계 — 설치 가이드 "기존 Collector 갱신" 절 신설, yaml 덮어쓰기만으로는 라이브가 켜지지 않음을 명시)와, 문자열 검사(`ApmInstallGuideServiceTest`)에 더해 **실제 시작 명령으로 생성 YAML을 구동하는 회귀**(생성물 + 실행줄 그대로 `otelcol-contrib`를 띄워 `traces/live` 파이프라인이 올라오고 gate WARN이 0건인지 — 6단계 회귀 목록, §7.1)를 둔다.

- 🔴 **PII는 `keep_keys`로 끝나지 않는다** `[C-r1 반영]` `[R-P5 반영: 실측 §3.2·§4.2]`. `keep_keys(attributes, …)`는 attributes만 정리한다. 실측이 자리 13곳에 PII를 심어 **BE 파싱 전 live HTTP 본문**을 스캔한 결과 — 설계 v1 초안은 **6종 유출**(events name/attributes·links attributes·`http.route` 값·`service.instance.id` 값·`scope.name`·`schemaUrl`), 설계 v2 원문(gate ON)은 **4종 유출**(`http.route` 값 4,798 · `service.instance.id` 값 3,603 · `scope.name` 3,603 · `schemaUrl` 7,206 — v2가 "R1 점검 대상"이라고만 적고 문장을 넣지 않은 것들), 위 v3 yaml의 근거 조합 H3는 **0종**(정상 fixture 347,830건은 그대로 전달 — "전부 버려서 0"이 아님). 이제 **Collector가 1차 방어선**이라는 문구는 yaml과 모순되지 않는다: 키 정리(`keep_keys`·`set`) + 값 검사(`redaction/live`) + **전송 전 차단(`filter/live-safety` `[C-r3 반영]`)** 셋이 Collector에 있다. `[R-P5b 실측 ✅ §5]` **결합 v4 yaml에서 13자리 전부 0건** + 대조군 원형 보존(정상 route 6종·`service.name`·무-PII 대조 주입 3건) + 절단 경계 U+FFFD 0 + 비문자열 값(double·bool·array) drop — v3 결합도 PII 13/13은 통과했으나 resource 900 B·비문자열 값이 원형 통과했다(v4에서 해소). 🔴 `[R-P5b 반영: §7c]` **방어 범위를 정확히 적는다**:

| 층 | 검사 대상 | 검사 밖 | 검사 밖의 방어 |
|---|---|---|---|
| 키 정리(`keep_keys`·상수 `set`) | 허용목록 밖 키 · name·status.message·trace_state·events·links·scope·schema_url | 그 문장이 **실패한 필드**(`ignore`는 그 문장만 건너뜀) | `filter/live-safety` |
| 값 검사(`redaction/live`) | **속성 값만** — `span.attributes`·`events[].attributes` | `status.message` · `span.name` · `traceState` · scope name/version/schemaUrl · `events[].name` · `links[].attributes` | `filter/live-safety`(**유일**) |
| 전송 전 차단(`filter/live-safety`) | 정리 결과 위반 13조건 | 깨진 조건이 맡던 검사(조건 단위 fail-open) | 불변식 + 알람(§2.1 ⑤) + BE 카나리아 |

실증: v3 yaml에서 `set(span.status.message, "")` 하나가 실패하자 이메일 패턴을 실은 `status.message`가 **1,337/1,337 스팬 그대로 live 도달** — redaction은 그것을 보지 않는다. 같은 fixture에서 v4는 live 0·차단 1,351. 즉 두 층(키 정리 + 값 검사) 사이의 구멍을 메우는 것이 live-safety이며 "선택이 아니라 필수"다. BE 쪽 라이브 전용 허용목록·값 검사는 **2차 방어선**(화면 노출 방어 + Collector 설정 실수의 검출)으로 유지한다.
- 🔴 **문자열 자르기는 PII 제거가 아니다** `[C-r2 반영]` `[R-P5 반영: 실측 §14.1 — 단위는 바이트]`. 길이 상한(Collector `truncate_all(span.attributes, 256)` + BE에서 route **256바이트**·instance 128·error.type 64·service 128, 초과는 잘라서 `__truncated__` 표시)은 **자원 보호**다. 🔴 OTTL `truncate_all`은 **바이트 기준**이다 — v2의 "256자"는 정정. `[R-P5b 반영: §5.3·§6.0]` ✅ 바이트 상한을 지키되 **문자 경계에서 자른다**(한글 300 B route → 255 B/87자, `error.type` 255 B/85자 — U+FFFD 0, UTF-8 깨짐 없음). 🔴 v3·v4의 "JSON 인코딩이 비-ASCII를 `\uXXXX`(자당 6바이트)로 부풀려 전송 크기가 2배"는 **사실이 아니어서 삭제한다** — 캡처 본문의 바이트를 직접 센 결과 `\u` 등장 **0**, Collector의 OTLP/HTTP JSON exporter는 **원시 UTF-8**로 쓴다. **같은 바이트 상한이면 한글 비용 = ASCII 비용**(포화 1,000스팬 785,699 vs 786,779 B — 한글이 1 KB 작다). R-P5 §14의 "+250 B/스팬"은 gen3 fixture가 문자 수를 세어 `error.type` 64자 = 192 B가 들어간 결함이었다(지배항 +133 B). §2.3.0 상한은 팽창 없이 실측값을 쓴다. 허용 속성의 **값 검사**는 두 층이다 — **Collector `redaction/live`**(패턴 3종: 주민번호·카드·이메일, 전송 노출 방어) + **BE 형태 검사**(화면 노출 방어): `http.route`는 템플릿 형태만 허용(`{`·`}`·`/`·영숫자·`-`·`_`·`.`·`:` 밖 문자 또는 `?`·`=`·`@` 포함 시 `__unsafe__`로 치환·계수), `error.type`은 식별자 형태(`[A-Za-z0-9_.$]`)만, `service.instance.id`는 원문을 화면에 내지 않고 사전 id·앞 8자·안정 해시 `key`만. 값 검사 실패는 거절이 아니라 치환이다(집계는 유지).
- 🔴 **feature gate `ottl.set.allowNil`은 yaml이 아니라 실행 명령에 있고, 프로세스 전체에 걸린다** `[C-r2 반영]` `[R-P5 반영: 실측 §3.1·§4.3·§6 — 리스크 #13 신설]`. 실측 §4.3(같은 yaml, 플래그만 뺌): 유출 벡터 4종 → **7종**, `span.events`·`span.links` 실린 스팬 **2,620/2,620(100%)**, raw **715 → 1,053 B/스팬(+47%)**, gzip 59 → 97 B(+64%), Collector 경고 **0건**. `[C-r3 반영: §2.1 표 · §5 모순 3행]` 정정 — gate OFF는 "경고 0"이 아니라 **nil 무시와 gate 활성화를 안내하는 1회 WARN**이 있다(✅ `rp5/col_dv2_nogate.log:45`); 함수가 오류를 반환하지 않으므로 OTTL 오류 계수로는 잡히지 않고, 문제는 **기능 차단·제품 감시가 부족한 것**이다. `[R-P5b 실측 ✅ §3.3]` 결합 yaml에서 재확인 — WARN 원문 `ottlfuncs/func_set.go:46 "The OTTL 'set' function silently ignored a nil value … Enable the feature gate 'ottl.set.allowNil'"`, **파이프라인·컴포넌트 라벨 없음**(전역). v3 결합 gate OFF = live 1,359 · PII **2종**(`events[].name`·`links[].attributes` — `events[].attributes`는 redaction이 마스킹) · raw +70% · gzip +65% / **v4 결합 gate OFF = live 0 · PII 0 · live-safety 차단 1,345** — 아래 ③의 설계 의도가 실측으로 확인됐다. **미설정 검출·차단 4단**(전부 P5.1): ① 설치 가이드 실행줄 3종에 플래그(위 "실행 명령") + 기존 설치 갱신 절 ② 생성 yaml 상단 경고 문구 ③ **Collector `filter/live-safety`** — `Len(span.events) > 0 ∨ Len(span.links) > 0`이면 **전송 전에 drop**(§2.2 yaml) → gate 누락은 PII 전송이 아니라 **라이브 점 소실 + 차단 카운터 상승 + gate WARN 1회**로 나타난다 ④ **BE 카나리아**(후조건 검사, §2.3) — ③이 빠진 옛 yaml·다른 Collector 설정에서 `events`/`links`가 도착하면 배치를 살리되 `reason=eventsPresent|linksPresent`로 계수하고 수집기 탭에 "Collector 실행 옵션(`--feature-gates=ottl.set.allowNil`) 또는 정본 yaml 누락 의심"을 띄운다. `validate` 단계 검출은 불가(실측 §3.1 — validate는 gate 없이도 통과). `[C-r3 반영: 질문 3 답]` **gate 없이 events/links를 비우는 검증된 일괄 대체 구문은 없다** — `set(span.events, [])`는 그 setter가 일반 빈 배열과 같은 타입이 아니라 잘못된 타입이 오류가 될 수 있고, `delete_key`·`limit`은 Map용 함수라 이 slice에 적용하는 해법이 아니다(✅ `ctxspan/span.go` setter·`ctxutil/slice.go`). **이번 버전은 gate를 유지**하고 리스크 #13은 존속한다.
- **SDK export 설정은 라이브 지연의 조건이다** `[R-P5 반영: 실측 §10.3·P0-7·P1-3]`. ✅ 완료→캡처 지연의 바닥은 SDK가 아니라 `batch/live: 1s`(0~1초 균등 대기 ⇒ 기대 500ms·p95 950ms — 규격 준수 재측 `gen4.mjs` @600/초 BSP 1,000: p50 711·p95 1,227ms, §10.3). `[C-r3 반영: §5 모순 2행]` v3가 인용한 **p50 585·p95 1,054·p99 1,775ms(실측 §3.6)는 50ms 강제 flush 하네스(`gen.mjs`)의 "완료→캡처" 관측**이라 제품 근거에서 **제거**하고 이 문서는 §10.3 재측값만 쓴다(§4.1 배지·§6.0 R1-7). 링·SSE·화면까지의 지연은 여전히 미측(R-P5″). 그 위에 SDK `OTEL_BSP_SCHEDULE_DELAY`가 더해지는데 **저트래픽에서 기본값 5,000ms가 기준을 깬다**: 10 SERVER/초(≈84 스팬/초)면 512개 배치가 차는 데 6초라 scheduleDelay가 항상 먼저 발동 → 완료→캡처 **p95 5,727ms**(설계 `p95(완료→화면) ≤ 5초`를 링에 닿기도 전에 초과). 1,000ms면 p95 1,594ms. 600 SERVER/초에서는 p95 1,521 vs 1,227ms. `[C-r3 반영: P0 판정 6 🟡 · 질문 7 답]` → 설치 가이드 문구는 **"P5 권장 지연 프로필: `OTEL_BSP_SCHEDULE_DELAY=1000`"(설정 요건)**으로 쓴다 — v3의 "저트래픽 필수 · **고트래픽 무관**"·"실 SDK 드롭 입증"·"약 2초 보장"은 **R7 전에는 확정하지 않는다**(삭제). 🔴 batch 충족 시간은 서비스 합산 TPS가 아니라 **각 SDK processor(=인스턴스)의 유입량**이 정한다 — 같은 서비스도 인스턴스가 많으면 각각은 저트래픽이다. 🔴 짝으로 **`OTEL_BSP_MAX_QUEUE_SIZE`**도 안내하되 **값은 정하지 않는다** — BSP 5,000ms + 600 SERVER/초에서 SDK 큐(`maxQueueSize` 2048 기본) 오버플로로 **1,175스팬이 앱 안에서 사라졌다**(Collector·BE 어디에도 안 잡힌다)는 관측은 유효하나, BSP는 batch 512가 먼저 차면 timer 전에 export하므로 이 드롭을 `초당 스팬 × 5초 > 2,048`로 설명하지 않는다; 값은 R7의 실제 export 지연·드롭으로 정한다. ⚠️ 둘 다 **SDK 에뮬레이션** 수치이고 수정 하네스(`gen4.mjs`)도 동시 export 8개를 허용해 BSP 규격(동일 processor의 export 직렬화)과 같지 않다 — "규격 준수 SDK 재측"이라 부르지 않는다. 실 javaagent 2.31.1의 `otel.bsp.dropped.spans`·앱 CPU 영향은 R7.
- **라이브 파이프라인 실패 감시 — Collector 자기 메트릭이 정본, BE는 보조** `[R-P5 반영: 실측 §11·§12.2·§12.3·§12.4]`(P5.1 수집기 탭 + 설치 가이드·운영 절 알람 항목). ✅ 라이브 exporter는 라벨 `exporter="otlp_http/moveseye-live"`(`[impl-r3 반영]` 별칭 통일)로 저장 exporter와 완전히 분리되고, 실패 원인이 `error_type` 라벨로 갈린다(`Deadline_Exceeded`=무응답/timeout · `ResourceExhausted`=429 · `Unavailable`=503 · `_OTHER`=연결 거부). 🔴 **손실이 두 카운터로 갈라진다** — 응답이 느리면(무응답) consumer가 3초씩 붙잡혀 큐가 차서 대부분 `otelcol_exporter_enqueue_failed_spans`(46,650)에 쌓이고, 응답이 빠른 실패(429·503·연결 거부)는 큐가 안 차서 전부 `otelcol_exporter_send_failed_spans`(66,755/72,650)에 쌓인다. 수집기 탭·알람은 **둘을 합산**해 **"전송 실패 신호"** `[C-r3 반영: 수정안 5]`로 보여 준다(하나만 보면 절반 이상 놓친다 — 단 "라이브 유실"이라 부르지 않는다: timeout 뒤 BE가 이미 수용했을 수 있고 partialSuccess·processor 실패는 여기 없다). `otelcol_exporter_queue_size`(live)는 상한 5 도달 여부. 🔴 `otelcol_exporter_sent_spans`는 "BE가 집계에 성공한 수"가 아니다 — partialSuccess 거절분(12건 × 119 WARN)이 성공으로 센다(§2.3). `[C-r3 반영: 질문 1 답]` 프로세서 단계 실패는 **메트릭이 아니라 로그**다 — WARN `failed to execute statement`(문장 실행)·`failed to eval condition`(조건 평가)·gate 1회 WARN(§2.1 ③)을 Collector 로그에서 계수하고(샘플링 한계 명시), **문장 오류 검출과 정리 결과 위반 검출을 각각 시험**한다. `[R-P5b 실측 ✅ §7b·§7d]` 두 WARN은 `otelcol.component.id`·`otelcol.pipeline.id="traces/live"` 라벨로 집계 가능하나 **샘플링돼 손실 수가 아니다**(13,196 실패 → 170줄); transform 실패는 메트릭에 없고 filter 차단은 `otelcol_processor_filter_spans_filtered{filter="filter/live-safety"}`(정확) — 라벨 값에 타입 접두가 붙는다. 알람 1건 추가: **`failed to eval condition{pipeline=traces/live} == 0`**(0이 아니면 live-safety 조건 하나가 죽은 상태 — §2.1 ⑤)(R2′ — "모든 processor 오류가 카나리아를 올린다"는 시험식은 틀렸다: 정리 실패와 무관한 문장이 실패해도 payload 형태는 정상일 수 있다). 수집기 탭 카드 구성(6단계): ① 전송 실패 신호(enqueue/send, `error_type` 분포) ② 전송 전 차단 수(`filter/live-safety`) ③ OTTL/gate WARN 계수 ④ BE 거절·카나리아 사유별 — 넷 다 **결측은 `null`(0 아님)**로 그린다(✅ `ApmCollectorMetricStore` 주석의 원칙). 🔴 현재 `ApmCollectorMetricStore:91 CollectorCell`은 **그대로 재사용할 수 없다** — `send_failed`를 신호별(스팬·메트릭·로그) 합산으로만 갖고 exporter·`error_type` 라벨을 표현하지 못한다 → live exporter별 enqueue/send 실패·오류 유형·차단 수를 **수집(자기 메트릭 라벨 보존) → 보존(1분 행) → 조회(`CollectorCell` 확장) → 화면 계약**까지 6단계 범위에 넣는다(라벨 보존 방식 — 메트릭명 접미 vs 라벨 컬럼 — 은 6단계 착수 시 결정). `[impl-r3 반영: 6단계 검수 정본 반영 ⑤ · R3]` 🔴 **라이브 exporter의 실패는 기존(P4) 수집기 "전송 실패" 지표·차트에 합산하지 않는다** — 라이브 exporter는 `queue_size: 5`·`retry_on_failure: disabled`·`timeout: 3s`로 **설계상 손실이 정상 동작**이다(§2.1). 최초 구현은 `ApmCollectorMetricStore.series()`의 기존 `send_failed`·`queue_size` 집계가 **exporter 구분 없이** 전부 더해, 라이브 EP 하나만 느려져도 저장 경로는 멀쩡한데 기존 "전송 실패 급증" 차트가 그려지는 결함이 있었다(수집기 탭 오독). 6단계에서 `series()` SQL의 `send_failed`·`queue_size` 집계를 **라이브 exporter(`otlp_http/moveseye-live`, 구 별칭 `otlphttp/moveseye-live` 포함) 제외**로 고쳤다 — 라이브 전용 "전송 실패 신호" 카드(위)는 그대로 별도 유지, 기존 저장 exporter 차트는 라이브와 무관하게 읽는다.
- ⚠️ `url.path`는 남기지 않고 **span name도 폴백으로 쓰지 않는다**(Q2 결정). route가 없는 요청(404·필터 거부 등)은 `__none__` route로 오고 화면은 **"경로 미식별"**로 표시한다 — v0의 "라우팅 전 거부"는 언어·프레임워크마다 뜻이 달라 단정하지 않는다. `http.route` 자체도 외부 입력이라 길이 상한을 둔다.
- `[C-r1 반영]` **큐 예산**: `queue_size`의 단위는 배치라 v0의 50은 최대 200,000스팬(≈100MB 직렬화분)이었다. 시작값 **5배치(≈5초분)** `[R-P5 실측 ✅ §11]` — 정상 부하에서 live 큐 최대 1/5(압박 없음), 장애 중 정확히 5에서 멈춤, 넘치는 분은 `enqueue_failed`로 계수, 복구는 다음 tick. 큐를 늘려 유실률만 낮추면 오래된 데이터를 "실시간"으로 보낸다. `timeout: 3s`는 요청 1건의 상한이지 freshness 상한이 아니다. `[C-r3 반영: §5 모순 7·8행]` 최대 체류는 **모델 추정**이다(§5.3 — consumers 1이면 약 18초, 2면 약 12초) — 정상 관측 p99 1.78초·max 6.27초는 최악 상한의 **증명이 아니고**, `block_on_overflow: false`여도 이미 수용한 **대기 5배치와 in-flight**는 남는다(v3의 "backlog가 없다"는 틀렸다).
- `[C-r2 반영]` **자기계측 제외 — 업무 X-View 제외와 Collector 운영 메트릭 수집은 별개다**(N10). QA에서 MovesEye 수신 요청 자체가 Live에 나타난 관측(E2E QA)이 있다. (1) Collector filter로 자기 서비스명(BE·Collector)을 **배포에서 정한 정확한 식별자**로 제외한다(광범위 패턴 금지) — Collector 자기 메트릭(`otelcol_*`)은 R2 관측 수단이라 **끄지 않는다**. (2) ✅ 기존 `OtlpResource.isCollectorName:82`는 `otelcol` 계열만 판정하고 MovesEye BE 전체를 식별하지 않는다 → 라이브 메타 캐시의 자기계측 제외 목록은 **BE 서비스명을 설정값으로 명시**한다. (3) BE 자기계측이 켜진 설치에서 계측 제외할 경로는 새 경로(`/apm/otlp-live/**`·`/apm/live/**`)뿐 아니라 기존 `/apm/otlp/**`·SSE·자체 관측 endpoint까지 포함해 검토하며, 식별은 **속성 제거 전에** 한다. 방법 후보는 Java declarative config의 `rule_based_routing` sampler로 SERVER `url.path` 제외(공식 health-check 예시) — 🔴 `OTEL_INSTRUMENTATION_*_ENABLED`는 계측 라이브러리를 끄는 설정이지 URL 제외가 아니다. Java 2.31.1에서의 적용과 기존 sampler 정책의 상호작용은 **R7(실 javaagent)** 항목으로 확인하고(`[C-r3 반영]` v2의 ❓R1 표기 → R-P5 1차는 SDK 에뮬레이션이라 못 봤다), 확인 전엔 확정하지 않는다. 경로를 검사에 쓰는 것과 그 원문을 라이브 payload로 보내는 것은 별개다(원문은 보내지 않는다).
- ✅ 인증은 같은 수신 토큰(Bearer). 토큰 용도(kind=COLLECTOR·scope=ingest) 판정 **규칙**은 저장 경로와 같되, **판정 경로는 스냅샷 캐시**(§2.3.1)다.
- `[C-r1 반영]` 설정 drift: Collector별 `SLOW_MS`·`NORMAL_PCT`가 다르거나 옛 yaml이 남을 수 있다. 라이브 SLOW 판정은 **BE 전역 설정값**(`ApmSettingService`의 느림 임계 — 템플릿 생성 원본)으로 하고 화면에 "느림 기준 N ms(서버 설정)"를 적는다. **"정상 2%"를 하드코딩하지 않는다** — 문구는 "정상 요청은 일부만 저장됩니다"(§4.1).

### 2.3 BE 수신 — `POST /apm/otlp-live/v1/traces` `[C-r2 반영: partialSuccess 수량 규칙·503 정의·예외 처리 위치·본문 최대 증명]`

| 관문 | 저장 경로(`ApmOtlpController`) | 라이브 경로(신설 `ApmOtlpLiveController`) |
|---|---|---|
| 415·413·gzip 스트리밍 상한 | ✅ **상한 2개** — 해제 후 `app.apm.otlp.max-body-bytes` 8MB(`ApmOtlpController:135`) + **압축본** `max-compressed-bytes` 2MB(`:147`) | `[R-P5 반영: 실측 §3.10·§14·P0-6·P1-1]` `[C-r3 반영: P0 판정 3 🔴·7 🟡 · 질문 4 답 — 정확 바이트·무압축 정책·Collector 측 직렬화 상한은 §2.3.0 정본]` **상한 2개**(저장 경로와 같은 구조 — v2는 해제 후 하나뿐이었다): **해제 후 2,097,152 B**(`app.apm.live.spans.max-body-bytes`) + **압축본 2,097,152 B**(`max-compressed-bytes`) `[R-P5b 반영: §6.2 — 524,288 → 2,097,152]`. 둘은 **보호 상한**이지 "최대 유효 배치가 들어온다"의 증명이 아니다. 🔴 v4의 512 KiB는 **정상 입력을 거절한다** — 난수 값(해시·UUID route 세그먼트·무작위 instance id·컨테이너 해시 서비스명의 대응물)·그룹 = 스팬 수·1,000스팬 배치는 live-safety 전부 통과·PII 0인 **유효 라이브 페이로드**인데 gzip **572.4 KiB**(압축비 2.4×)다. `send_batch_max_size` 800으로 낮춰도 458.7 KiB(여유 10%)라 batch 축소는 해법이 아니다. 산술: 해제 후 상한이 2 MiB면 gzip은 비압축 데이터에서 **거의 줄지 않으므로**(deflate stored block ≈ 원본 + 0.03% + 18 B) 압축본 상한은 **해제 후 상한과 같은 2 MiB**여야 "유효한 ≤ 2 MiB 페이로드를 절대 거절하지 않는다"가 성립한다. **둘을 독립 상한으로 유지하는 이유**는 gzip 폭탄 방어다 — 압축본 상한은 회선 읽기를 해제 전에 묶고(2 MiB에서도 그대로 달성), 23 MiB로 부푸는 폭탄은 **해제 중 스트리밍 검사**(`ApmOtlpController:301-331, :476` 재사용)가 중단한다. 🔴 v3의 "2MB 해제분 ≈ 174KB 압축 → 여유 3배"는 **평균 압축률(10.5~11.5배)을 최대 보장의 근거로 쓴 것**이라 폐기(코덱스 P0 판정 7이 정확했다). 해제 후 상한 쪽: 코덱스 Q8 "평균 500B는 최대의 증명이 아니다"가 정확했고, R-P5 §14의 "2,000스팬 UTF-8 2.09~2.11 MiB(초과)"는 **fixture 결함(문자 수 계수)으로 철회**(§6.0) — `\uXXXX` 팽창은 없다(§2.2). `send_batch_max_size` **1,000은 유지**하되 근거를 바꾼다: `[R-P5b 실측 ✅ §6.2]` yaml 제한(§2.3.0)을 통과하는 최대치의 1,000스팬 배치 = 그룹 100 **0.803 MiB** · 그룹 = 스팬 수 **1.337 MiB**(ASCII·한글 동일, 여유 1.53배) — v4의 산술 1.13/1.99 MiB는 보수적이었고 **800으로 내릴 이유가 없다**. 상한 상향(4 MiB)·Collector 길이 하향(128)은 채택하지 않음 — 전자는 동시 gzip 해제 수 × 해제 후 상한의 힙 임시가 2배(압축본 상한 변경은 해제 후 상한이 불변이라 힙 임시 4 × 2 MiB에 영향 없음), 후자는 route 표시 품질 저하(BE 계약 256B와 어긋남). 구현은 ✅ `ApmOtlpController`의 `readBounded`·Content-Length 선검사·gzip 해제 중 상한 검사(`:301-331, :476`)를 그대로 재사용. 초과 거절(413/400/415)의 실측은 BE 미구현이라 R-P5″·R6(§6.0) |
| 401 토큰 · 403 용도 · 403 라이선스 | 매 요청 DB 조회(✅ `ApmReceiveTokenService.authenticate:342`가 `findByTokenHash` + 절제된 `save`) | **스냅샷 캐시**(§2.3.1) — **라이선스를 제외하면** hot path DB 0회(✅ `[impl-r1 반영]` Hibernate `Statistics.getPrepareStatementCount()` 실측 — 토큰·서비스 메타 100회 호출 SQL 증가 0). **라이선스는 예외**: provider가 60초에 1회 DB 조회 + RSA 검증을 하고 그 1회가 걸리는 요청에 동기로 얹힌다(§2.3.1 "라이선스 단일 freshness" — 매 요청 재계산 자체는 DB 0회, 60초마다 1회만 DB·RSA 비용 발생). 코드는 동일(401/403/403), 라이선스 만료는 **실제 403**(Q14). 회수된 토큰은 miss가 아니라 **거절 상태로 유지**(§2.3.1) |
| 400 JSON | 동일 | 동일 + 🔴 **문자열 길이(바이트)·JSON 깊이·스팬 수(배치당 1,000 BE 수용 상한 `[R-P5 반영: P0-6]` — `[C-r3 반영: 질문 4 답]` Collector `send_batch_max_size` 1,000과 **독립 설정**이며 초기 호환 프로필로 같은 값일 뿐 자동 결합하지 않는다; 초과는 배치 전체 413이 아니라 초과분 partialSuccess(`batchOverflow`))·읽기 시간(3초)·동시 gzip 해제 수** 상한. 🔴 파서의 **예상 못 한 내부 결함은 503**으로 구분(400은 입력 불량에만) `[C-r2 반영]`. 🔴 파서는 `name` 필드 **부재**를 정상으로 받는다(실측 §3.1 — proto3 기본값 생략; 정본 yaml은 `"_live"`를 넣지만 다른 Collector 설정 방어) |
| dedup | 본문 sha256 영수증 | **`(traceId, spanId)` 유계 해시셋(최근 60초)** — 재시도 OFF가 중복 없음의 증거는 아니다(상류 재전송·중복 Collector). 🔴 중복 확인은 **멱등 성공**이지 거절이 아니다(`deduplicated` 계수, `rejectedSpans` 불포함) `[C-r2 반영]` |
| 적재 | `TraceIngestPipeline` → DB | `LiveSpanIngestor` → 집계(전체 관측) → `LiveSpanRing.offer()` |
| 영수증 기록 | 있음 | **없음** |
| 실패 응답 | 503 | **진실하게** — JSON 불량 400 · 일부 거절 200 + `partialSuccess{rejectedSpans, errorMessage}`(**`Content-Type: application/json` 명시** — Collector가 정확한 문자열로 분기) · 요청 제한 429 · 일시적 처리 불능 503. 재시도 OFF라 503도 재시도되지 않는다 — 응답 코드는 **관측 신호**이지 재전송 제어가 아니다 |
| **503의 정의** `[C-r2 반영]` | — | 🔴 **"요청을 일시적으로 처리할 수 없는 상태"** 전부 — v1의 "우리 코드 예외에만"은 폐기. 포함: 전체 인증 상태를 확인할 수 없음(캐시 항목 없음 + 채움 실패가 **배치 전체**에 걸림) · 공통 처리 자원 불능(arena 초기화 전·링 리셋 중) · 서비스 락 획득 시간 초과 · 파서·직렬화의 예상 못 한 내부 결함. 반면 **서비스별 메타 미확인은 그 부분만 partialSuccess** |
| **partialSuccess 수량 보존식** `[C-r2 반영]` | — | 🔴 `파싱·분류가 끝난 입력 스팬 수 = 신규 집계 수 + 중복 확인 수(deduplicated) + 실제 거절 수` 이고 `partialSuccess.rejectedSpans = 실제 거절 수`. **표본(reservoir) 탈락·연결 솎음·브라우저 솎음·arena 압박(`poolPressure`)은 집계 성공이라 어디에도 섞지 않는다**(표시 축소 계수는 별도 §2.4). `errorMessage`는 길이 제한(256자)한 운영자용 사유=수 나열(`"Rejected 12 spans: metadataUnavailable=10, servicePending=2"`), 원문 속성·토큰·PII 금지. 기계 판정 정본은 BE 사유별 카운터 |
| **exporter 쪽 관측** `[C-r2 반영]` `[R-P5 실측 ✅ §12.4]` | — | ✅ Collector 0.159.0 trace handler는 유효한 partialSuccess에 **WARN `Partial success response`**(`message`·`dropped_spans` 필드)를 남기고 **`nil`을 반환**한다(`otlphttpexporter/otlp.go:322-348`) — **실측 확인**: 캡처 서버가 `200 + rejectedSpans:12`를 120초 돌려주자 WARN 119건(`"message": "Rejected 12 spans: metadataUnavailable=10, servicePending=2", "dropped_spans": 12`)·`send_failed_spans` 0·`sent_spans` 78,470·재전송 0 — 즉 **성공으로 처리**되고 OTLP 규약상 재시도도 금지. 🔴 따라서 `otelcol_exporter_sent_spans`를 BE 집계 성공 수로 읽지 않는다. 거절분은 WARN 로그와 **BE 자기 카운터**에만 있고, WARN은 자기 메트릭으로 올라오지 않아 **기계 판정에 부적합** → BE 사유별 카운터가 정본이라는 결정이 실측으로 뒷받침됐다. 응답 JSON 파싱 실패는 exporter 오류다 |
| 거절 사유 계수(BE 자기 카운터, 수집기 탭) | 폐기 통계 테이블 | 인메모리 카운터만. **수신 거절**: `metadataUnavailable`·`serviceUnknown`·`servicePending`·`serviceHidden`·`tokenRevoked`·`future`·`stale`·`malformed`·`unsafeValue`(치환은 거절 아님 — 계수만) · **멱등**: `deduplicated` · **표시 축소(거절 아님)**: `retainedShrunk`·`arenaPressure` · **카나리아(거절 아님, 경고)** `[R-P5 반영: 실측 §6·P0-3 ③]` `[C-r3 반영: §2.2 수정안 2 — 후조건 검사로 확장]`: **`slimBypassed{reason}`** — 라이브 파서가 스팬마다 **잔존 필드·값·타입 후조건**을 검사해 위반이 하나라도 있으면 `reason`별 +1(데이터는 살리고 값은 치환·절단). reason 목록(고정): `eventsPresent`·`linksPresent`·`unknownKey`(허용목록 밖 키)·`scopeResidue`(scope name/version/schemaUrl)·`resourceSchemaUrl`·`nameNotLive`·`statusMessage`·`traceState`·`typeMismatch`(허용 키 안의 잘못된 타입)·`lengthOver`(바이트 상한 초과)·`formUnsafe`(route 템플릿·error.type 식별자·method 형태 위반 — `unsafeValue` 치환과 같은 사건을 카나리아 축으로도 센다). 🔴 **원문 payload는 기록하지 않는다**(로그·카운터에 값·토큰·PII 금지). 0이 아니면 수집기 탭에 "Collector 정본 yaml(`filter/live-safety`) 또는 실행 옵션(`--feature-gates=ottl.set.allowNil`) 누락 의심"을 띄운다 — Collector 차단(§2.2)이 정상이면 이 카운터는 0이어야 하고, **0은 '안전'의 증거가 아니라 차단 카운터·WARN 계수와 나란히 읽는 값**이다(차단이 있는 Collector에서는 위반 스팬이 BE에 오지 않는다). 🔴 v1의 `poolExhausted`는 거절 사유에서 **제거** — 표시 슬롯 부족은 OTLP 거절이 아니다. 🔴 **Collector에 도착조차 못 한 유실은 BE가 알 수 없다** — 수집기 탭은 BE 카운터 옆에 라이브 exporter **전송 실패 신호** `enqueue_failed + send_failed`(합산)·`queue_size`·`error_type` 분포·**전송 전 차단 수**·**OTTL/gate WARN 계수**를 **나란히** 보여 주며 결측은 `null`로 그린다(§2.2 운영 감시) |
| 라이선스 | `@LicenseExempt` + 직접 판정 | 동일. **`LicenseArchitectureTest.MACHINE_CLIENT_CLASSES`에 새 FQN 추가 필수**(✅ 문자열 목록, 60행) |
| 보안 체인 | ✅ `SecurityConfig:79` `permitAll("/apm/otlp/**")` | 🔴 **`/apm/otlp-live/**` 추가 — P5.1 필수 항목 + 회귀 테스트 + R6 검증 케이스** `[R-P5 반영: 실측 §3.9·P0-4]`. ✅ 실측: `"/apm/otlp/**"`는 AntPath `/` 경계 때문에 `/apm/otlp-live/...`를 **매치하지 않고**, 미등록 상태에서 `POST :3001/apm/otlp-live/v1/traces`는 JWT 필터가 먼저 **401 `{"status":"error","code":401,"message":"INVALID_TOKEN"}`**(사람용 세션 envelope)을 낸다. 🔴 그리고 Collector는 401을 **`Permanent error`로 보고 재시도 없이 즉시 폐기**한다 → 설정 한 줄 누락이 "라이브가 안 나온다"가 아니라 **아무 로그 없이 영구 데이터 폐기**로 나타난다. 조치: (1) `SecurityConfig` permitAll 추가 (2) **회귀 테스트** — `/apm/otlp-live/v1/traces`가 인증 없이 401이 아닌 컨트롤러 응답(토큰 거절 시 OTLP 모양 `{"error":…}` 401)에 도달하는지 확인(경로 오타·리팩터링 방어, R6 "500 누출 0"과 같은 자리) (3) 필터 단계에서 끊길 때도 **OTLP 모양 본문**이 나가도록 `LiveIngestGuardFilter`(아래 500 금지 행 (c))가 이 자리를 덮는다. 프록시 라우팅(아파치/nginx location)·`OtelArchitectureTest` 방향 규칙도 같이. `[C-r3 반영: P0 판정 5 ✅ — 첫 커밋(§7.1 1단계) 회귀 목록]` 세션 없는 유효 수신 토큰 성공 · 잘못된 토큰 401(OTLP 본문) · 용도·라이선스 403 · 사람용 envelope 미유입 · 기존 `/apm/otlp/**`·사용자용 `/apm/live/**` 권한 불변 · 필터·바인딩 예외도 계약대로 |
| 500 금지 범위 `[C-r2 반영]` | ✅ 토큰·라이선스 조회(340~367행)가 적재 `try`(387~) **바깥**이다 | 🔴 **컨트롤러 `try`로 전부 덮을 수 없다** — 바인딩·필터·인터셉터·응답 직렬화는 컨트롤러 밖에서 일어난다. 처리 위치를 나눈다: (a) 컨트롤러 본문(캐시 조회·라이선스 판정·파싱·집계·`offer`)은 `try` 안, (b) 바인딩·Content-Type·본문 상한은 **`/apm/otlp-live/**` 경로 전용 `@ControllerAdvice`**(`basePackageClasses` 한정)가 400/413/415/503으로 변환, (c) 필터·인터셉터 단계 예외는 **경로 매칭 필터 하나**(`LiveIngestGuardFilter`, permitAll 경로라 JWT 필터는 통과)가 잡아 JSON 503으로 쓴다. R6가 "500 누출 0"을 각 단계별 fixture로 증명 |
| 토큰당 rps 상한 `[impl-r2 반영: 프로퍼티 경로·LRU 위험]` | 없음 | **실제 HTTP 429**(machine 클라이언트, 응답 `{"error":"APM_LIVE_RATE_LIMITED"}` + `Retry-After`) — 프로퍼티 `app.apm.live.spans.rate-limit.{max-requests-per-second-per-token,burst,max-buckets}` 기본 **10/burst 20/버킷 맵 2,000**(토큰 버킷, 신규 키는 10개 = 1초분으로 시작해 유휴 시 20까지 충전) `[C-r2 반영]`: v1의 5는 1,000점 배치·5,000점/초면 이미 평균 5rps라 정상 부하를 거절한다. 같은 토큰을 쓰는 Collector 수(설치 가이드 기본 1)를 곱해 설정하도록 안내. 🔴 **LRU 버킷 맵 포화 시 신규 키(재기동 직후는 전 토큰) 잠금 위험**(4단계 검수 🟡 Y1) — 맵 2,000개가 가득 차고 각 키가 2초보다 자주 갱신되면 가장 오래된 항목이 밀려나지 않아 **신규·재기동 토큰이 계속 429**를 받는다(거절된 시도는 LRU 순서를 바꾸지 않으므로 공격 비용도 늘지 않는다). 완화(R3 전, 미구현): 맵의 일정 비율을 downstream 인증 성공 이력이 있는 키 전용 예약 슬롯으로 분리하거나, 최소한 `rateLimitedNewKey` 전용 계수를 두어 "맵 포화"와 "실제 rps 초과"를 구분한다 |

- 패키지 `[C-r1 반영]`: **컨트롤러는 `collector/ingest/ApmOtlpLiveController`**(OTLP 관문 = 수집기 메뉴, ArchUnit 목록·`@LicenseExempt` 관례가 그 자리에 있다), **링·집계·SSE·조회는 `overview/live/spans/`**(개요 메뉴의 실시간 세트 확장). 저수준 검증 도구(본문 상한 스트림·gzip 해제)는 공유해도 된다. 구체 타입 주입(`@Primary` 함정 — CLAUDE.md §0.5-7).
- 🔴 **라이브 파서는 `OtlpTracesReader`를 그대로 쓰지 않는다** `[C-r1 반영]`. 현 리더는 events·links·status message를 읽고, `readTree`로 전체를 올리면 나중에 무시해도 JSON 객체 할당은 이미 일어난다. 라이브 전용 **스트리밍 선택 파서**(`JsonParser` 토큰 단위, 필요 필드만 추출, 나머지 `skipChildren`)를 만들고 그 비용을 **R3 시제품에서 따로 산정**한다. 파서는 `otel/trace/`가 아니라 라이브 세트 안에 둔다(OTLP가 그렇게 부르는 것이 아니라 우리가 그렇게 읽는 것 — CLAUDE.md §0.5-6 기준).
- `[impl-r3 반영: 6단계 검수 정본 반영 — 자기계측 절과 정합]` 🔴 **"최근 60초 수신" 설치 검증 판정에서 자기 관측 로그를 제외한다.** P1.5의 `ApmIngestRecentTracker`(`GET /apm/ingest/recent`)는 "설치 직후 설정이 맞았는가"를 60초 안에 확인하는 **검증 버튼 전용**이다. `liveSpans=true` 설정에는 `logs/self` 파이프라인이 따라붙어 **Collector 자신의 내부 로그**가 5초 배치로 같은 토큰·같은 수신 EP에 계속 들어오므로, 이 자기 관측 로그만으로도 `observed > 0`이 되어 검증 버튼이 "최근 60초 수신 있음"을 **초록불로 보고**할 수 있다 — 애플리케이션 계측이 통째로 안 붙어 있어도 이 버튼이 무의미해진다. 자기 관측 로그(`ApmCollectorLogStore`가 자기 계측으로 식별한 것)는 `recentTracker`에 기록하지 않는다. Collector 생존 여부는 `ApmCollectorLiveDto.Logs.observedAt`(§2.2 자기계측 절·`apm_collector_log_1m.last_seen_at`)이 이미 별도로 답한다 — 둘을 섞으면 "수집기는 살아 있다"와 "애플리케이션 계측이 도착한다"가 같은 신호로 뭉개진다.

#### 2.3.0 라이브 본문 상한 계약(정본) `[C-r3 반영: P0 판정 3 🔴·7 🟡 · 필수 정정 2 · 질문 4 답]` `[R-P5b 반영: §6 — 압축본 상한 2 MiB · 산술 → 실측]`

| 항목 | 값(정확) | 규칙 |
|---|---|---|
| 해제 후 상한 `app.apm.live.spans.max-body-bytes` | **2,097,152 B**(2 MiB) | 무압축·gzip 공통. Content-Length 선검사(있으면) + 스트리밍 `readBounded`(없거나 거짓이어도 실제 바이트로 판정). 초과 = **413**, 배치 전체 거절(수신 거절 `bodyTooLarge` 계수), 부분 파싱 없음. `[R-P5b 실측 ✅ §6.2]` 정본 yaml을 통과하는 최악 1,000스팬 배치 1.337 MiB(여유 1.53배) |
| 압축본 상한 `max-compressed-bytes` | **2,097,152 B**(2 MiB) `[R-P5b 반영: §6.2 — v4 524,288에서 상향]` | `Content-Encoding: gzip`에만. 해제 전 바이트로 판정(스트리밍 중 초과 시 즉시 413). 🔴 v4의 512 KiB는 **정상 입력(난수 값·그룹 = 스팬 수·1,000스팬, live-safety 전부 통과)이 gzip 572.4 KiB**로 거절됐다 — `send_batch_max_size` 800이어도 458.7 KiB(여유 10%). **평균 압축률(10.5~11.5배)을 최대 보장 근거로 쓰지 않는다**(저압축 입력은 2.4×, 비압축 데이터는 ≈1.0×). 값을 해제 후 상한과 **같게** 두는 이유: gzip은 비압축 데이터에서 거의 줄지 않으므로(stored block ≈ 원본 + 0.03% + 18 B) 압축본 ≤ 2 MiB여야 유효한 ≤ 2 MiB 페이로드를 절대 거절하지 않는다. **독립 상한 2개를 유지하는 이유**: gzip 폭탄 방어 — 압축본 상한이 해제 전 회선 읽기를 묶고, 해제 후 상한이 스트리밍 해제 중 검사로 팽창을 끊는다(23 MiB 폭탄은 해제 중 중단). 힙 임시(동시 해제 4 × **해제 후** 상한 = 8 MiB)는 압축본 상한과 무관하므로 §5.2 예산 불변 |
| 무압축 요청 | 허용 | `Content-Encoding` 없음 또는 `identity` → **해제 후 상한만** 적용 |
| gzip 아닌 인코딩 | **415** | `deflate`·`br`·`zstd`·다중 인코딩(`gzip, gzip`) 전부. 본문을 읽지 않고 거절 |
| `Content-Type` | `application/json`만 | 그 외 415. protobuf는 받지 않는다(exporter `encoding: json` 고정) |
| 스팬 수 | **1,000/배치**(BE 수용) | Collector `send_batch_max_size` 1,000과 **독립 설정** — 초기 호환 프로필이 같은 값일 뿐 자동 결합하지 않는다. **1,001번째부터는 `batchOverflow` 부분 거절(partialSuccess)**이 정본이다(초과분도 `skipChildren()`으로 계속 읽어 JSON·UTF-8 검증은 끝까지 수행한 뒤 센다 — 구문 오류가 있으면 여전히 배치 400). `[impl-r1 반영]` **이력**: P5.1 1단계 코드는 이 규칙이 아직 없어 임시로 **배치 전체 413**을 냈다(주석에 "2단계에서 초과분 부분 수용 규칙으로 교체한다"고 예고된 의도된 관문 — 1단계는 라이브 전송 자체가 꺼져 있어 데이터 손실 없음). 2단계 구현에서 partialSuccess `batchOverflow`로 교체 완료 — 2~3단계 검수가 "정본이 partialSuccess 쪽"임을 재확인했다 |
| 읽기 시간 · 동시 gzip 해제 | 3초 · 4 | 초과 = 408 / 503(§2.3 503 정의) |

**Collector 측 직렬화 상한 — yaml 제한이 고정하는 형태의 실측값(정본) `[R-P5b 반영: §6.2 — v4 산술을 실측으로 교체]`.** 🔴 v3의 "1,000이면 최악 1.06 MiB"는 route 하나만 채운 fixture의 외삽이었고, v4의 산술(그룹 ≤ 100 = 1.13 MiB · 그룹 = 스팬 수 = 1.99 MiB)은 **보수적**이었다. 잔존 값의 타입·길이·그룹 수는 §2.2 yaml이 고정한다: span.attributes ≤ 4키(`keep_keys`) · 문자열 ≤ 256B(`truncate_all`, 문자 경계) · method `^[A-Za-z_]{1,16}$` · status_code int · error.type `^[A-Za-z0-9_.$-]{1,64}$`(`filter/live-safety` 형태 검사 — 어긋나면 drop) · resource.attributes ≤ 3키 × ≤ 128B(`truncate_all`) · scope 속성 0 · events/links 0 · name `"_live"` · status.message/trace_state/schema_url 빈 값. 🔴 JSON `\uXXXX` 팽창은 **없다**(원시 UTF-8 — 한글 = ASCII 비용). 그 제한을 **통과할 수 있는 최대치로만** 채운 1,000스팬 배치(route 256 B · method 16 · error.type 64 · resource 3키 × 128 B)를 그룹 수 G와 charset을 바꿔 가며 잰 값:

| charset | G(그룹) | 해제 후 raw | 2 MiB 대비 | gzip | 2 MiB(압축본 상한) 대비 | raw/스팬 | 압축비 |
|---|---:|---:|---|---:|---|---:|---:|
| ASCII | 40 | 0.768 MiB | ✅ 2.6배 여유 | 35.6 KiB | ✅ | 805 B | 22.1× |
| ASCII | **100** | **0.803 MiB** | ✅ 2.5배 | 37.4 KiB | ✅ | 842 B | 22.0× |
| ASCII | **1,000(= N)** | **1.337 MiB** | ✅ **1.53배** | 48.6 KiB | ✅ | 1,402 B | 28.2× |
| 한글 | 1,000(= N) | 1.335 MiB | ✅ 1.53배 | 49.9 KiB | ✅ | 1,400 B | 27.4× |
| 난수(저압축) | 40 / 100 | 0.768 / 0.803 MiB | ✅ | 292.0 / 310.3 KiB | ✅ | 805 / 842 B | 2.7× |
| **난수(저압축)** | **1,000(= N)** | 1.337 MiB | ✅ | **572.4 KiB** | ✅(v4의 512 KiB에서는 🔴 초과) | 1,402 B | 2.4× |
| (참고) v3 yaml — resource 8 KB + array 값, G = N | 1,000 | **26.213 MiB** | 🔴 12.5배 초과 | 235.8 KiB | ✅ — 압축 관문을 통과하고 해제 중에야 걸린다 | 27,486 B | — |

- **그룹 수(resource 블록 복제)가 유일한 변수**다 — batch 프로세서는 서로 다른 업스트림 요청의 동일 resource를 병합하지 않는다(같은 resource를 40회 나눠 보내면 출력 배치에 40개 그룹). G = N이 물리적 최악이며 그때도 1.53배 여유 → **`send_batch_max_size: 1000` 확정**, v4의 "넘으면 800" 규칙은 **삭제**.
- v3 yaml의 무한 경로 3가지(resource 값 무제한·허용 키의 비문자열 값·그룹 수)는 v4의 `truncate_all(resource,128)`·live-safety 타입/형태 검사가 앞 둘을 막고, 셋째는 위 표가 상한을 준다. 형태 검사 없는 적대적 입력은 live-safety가 있으면 도달 불가이고, 다른 Collector 설정에서 오면 413·배치 거절(저장 경로 무영향).
- 압축본 상한이 512 KiB였다면 **난수 G = N 정상 입력이 거절**된다 — 그래서 2 MiB(위 표).

**초과 처리 규칙(고정)**: 해제 후 > 2,097,152 또는 압축본 > 2,097,152 → **413**·배치 전체 거절·`bodyTooLarge` 계수·Collector `send_failed{error_type=_OTHER}`(재시도 없음) — 라이브 점만 잃고 저장 경로 무영향. **회귀 fixture**(§7.1 2단계·R6): 각 상한의 **직전·동일·초과** 바이트(해제 후 **2,097,151 / 2,097,152 / 2,097,153** · 압축본 **2,097,151 / 2,097,152 / 2,097,153** — 양쪽 다) · Content-Length 없음·거짓 값 · 낮은/높은 압축률(난수 G = N 572.4 KiB 배치는 **수용**돼야 한다 · 비압축 데이터 ≈ 2 MiB gzip 경계) · 깊은 JSON · 큰 미사용 필드 · 느린 본문 · 999/1,000/1,001스팬 · 혼합(신규+중복+실제 거절) · 중복-only · 전량 거절 — 표본 탈락이 `rejectedSpans`에 섞이지 않음.

#### 2.3.1 메타데이터 스냅샷 캐시 — `LiveMetadataCache` `[C-r2 반영: refresh-ahead·hard expiry·commit 이후 무효화·generation·라이선스 단일 freshness]` (필수 수정 3 · N3)

🔴 v1의 "TTL 만료 → 비동기 재적재 → 그 배치 거절"은 **30초마다 1초분을 잃는 구조**(≈3.3% 손실 추정)라 정상 상태 `<0.1%`와 충돌했다. v2는 **갱신 경계**를 먼저 정한다.

| 항목 | 결정 |
|---|---|
| 담는 것 | 토큰(hash → id·kind·scope·**상태[ACTIVE/REVOKED]**) · 서비스(`(nameNorm, envNorm)` → serviceId·serviceUid·**state[ACTIVE/PENDING/HIDDEN/REJECTED/없음]** — v1에 빠졌던 `HIDDEN` 추가) · 인스턴스 사전(`service.instance.id` 전체값 → 내부 id) · 라이선스 판정 · 자기계측 제외 목록 |
| **갱신 3단** | ① **soft refresh 20초**: 항목 나이가 넘으면 비동기 갱신을 **시작**하되 기존 검증값을 계속 쓴다(refresh-ahead) ② **hard expiry 30초**: 이 안에서는 갱신 실패·DB 장애여도 기존 검증값 사용(**stale 허용은 hard expiry 안에서만**) ③ hard expiry 뒤 갱신에 실패한 항목은 **허용을 연장하지 않고 거절**(`metadataUnavailable`) — "DB 장애 시 새 상태 적용 대신 **기존 허용을 중단**하는 것"이 30초 보장이다. 정상 상태에서는 갱신이 soft(20초)~hard(30초) 사이에 끝나므로 **TTL 경계에서 배치가 거절되지 않는다** — R1 "TTL 영향" 항목이 이를 잰다(TTL마다 반복 거절 = 불합격) |
| 갱신 유계화 | 같은 key의 갱신은 **하나만**(single-flight) · 갱신 큐 상한 1,000 · 동시 DB 조회 상한 4 · **음성 캐시**(없는 서비스·없는 토큰)도 항목으로 담고 같은 3단 규칙(상한 10,000 항목, LRU) |
| **배치 단일 deadline** `[impl-r1 반영]` | 🔴 hard 만료 항목의 갱신 대기(각 3초)는 **서비스별이 아니라 배치 전체에 하나**다 — batch 프로세서는 서로 다른 업스트림 요청의 resource를 병합하지 않으므로 Collector 하나가 **1,000개 서로 다른 서비스**를 한 배치에 담을 수 있고(§2.3.0 실측표의 그룹 = 스팬 수 최악), hard 만료가 동시 다발하는 시나리오가 바로 **DB 열화**(hard expiry 정책 자체가 대비하는 상황)다. 서비스마다 3초씩 순차 대기하면 **(고유 서비스 수) × 3초**가 되고, 그 대기가 admission 세마포어 4슬롯을 점유한 채 블로킹돼 슬롯 4개가 막히면 **라이브 수신 전체가 정지**한다(2~3단계 검수 🔴 R1). 따라서 **배치 진입 시 1회 deadline(3초)을 계산**해 모든 서비스 메타 조회가 그 deadline을 공유하고, 기한을 넘긴 서비스는 더 기다리지 않고 즉시 **`metadataUnavailable`로 부분 거절**한다(그 서비스분만 partialSuccess, 나머지는 정상 처리) — 최악이 **배치당 3초 고정**으로 유계화된다. 토큰 조회는 요청당 1회라 현행 3초 유지로 충분 |
| **generation** | 항목마다 `generation`(무효화마다 +1). 비동기 조회는 시작 시점 generation을 들고 가서 **돌아왔을 때 다르면 결과를 버린다** — 무효화 이전에 시작한 오래된 조회 결과의 재삽입 방지 |
| **무효화는 commit 이후** | 🔴 v1의 "`clearCache()` 호출 지점에 이벤트 발행을 덧붙인다"는 **폐기**. ✅ `ApmRegistryService.approve:99`는 트랜잭션 **안**에서 `clearCache()`를 부른다 → P5 무효화 이벤트는 `@TransactionalEventListener(phase = AFTER_COMMIT)`로 받는다(✅ `ApmServiceQueryService.delete:499`는 이미 afterCommit 사용). 비트랜잭션 호출(트랜잭션 없이 발행)은 **즉시 처리**하도록 `fallbackExecution = true`. 무효화 = 항목 제거 + generation 증가(진행 중 조회 차단) |
| **무효화 경로 전수**(코드 대조 ✅ 코덱스 r2 §3.2) | 토큰 회수(`ApmReceiveTokenService.revoke:304` — registrar와 무관, **토큰 도메인에서 발행**; 알려진 회수는 miss가 아니라 **REVOKED 상태로 유지**해 `tokenRevoked` 거절) · 서비스 승인(`approve:99`) · 승인 대기 거절(`reject:150` — ✅ `clearCache()` 없음, 호출 지점만 따라가면 빠진다 → 서비스 도메인 이벤트로 통일; 거절은 영구 차단이 아니라 대기열 삭제라는 기존 의미 유지) · 서비스 삭제(`delete:499` — 메타뿐 아니라 **링·사전·공유 snapshot·재생 로그의 노출 정책**까지: 삭제 이벤트로 그 서비스의 버킷을 즉시 비우고 `removeServices`를 다음 tick에 보낸다) · 표시명·숨김·복원·임계 변경(`update:448`은 `hostLinker.clear()`만 — 실시간 표시·집계에 영향 있는 변경만 골라 이벤트: 숨김/복원·표시명·**느림 임계**) · 자동 숨김·자동 재활성화·자동 등록(`ApmRetentionService:332`·registrar/writer — 관리 API 밖 상태 전이도 이벤트 발행) · `[impl-r1 반영]` **`createPending`**(`ApmRegistryWriter:139` — 정본 표에 없던 경로, 2~3단계 검수에서 확인된 **13번째 무효화 경로**: 신규 서비스 최초 등록 시점에도 발행해야 **PENDING 음성 캐시**(§2.3.1 캐시 miss 행 — "없음"으로 캐시된 항목)가 뒤집힌다. 없으면 첫 배치가 miss로 캐시된 뒤 등록이 되어도 hard expiry 30초까지 계속 거절될 수 있다) · 라이선스(아래 별도 행) |
| **라이선스 단일 freshness** `[impl-r1 반영]` | ✅ `SignedKeyLicenseProvider:48`는 **60초 캐시**다. 라이브 캐시가 그 결과를 다시 30초 담으면 **최대 90초**가 되어 30초 약속이 깨진다 → 라이브 캐시는 라이선스를 **자체 항목으로 담지 않고** provider의 검증된 원천 snapshot(서명 검증 결과 + 검증 시각)을 **참조**하며 freshness는 provider 것 하나로 통일. 🔴 **"타이머로 다음 전이 시각을 계산해 반영"은 폐기**(구현이 더 엄격했다) — provider는 검증된 **서명 내용**(파싱된 `LicenseKeyPayload`)만 60초 캐시하고(DB `findByActiveTrue()` + RSA 서명 검증은 **60초에 1회**), **매 요청은 그 캐시 위에서 `resolveState()`·`daysRemaining()`을 다시 계산**한다(DB 조회 0회·RSA 재검증 0회) — 타이머·스케줄러가 없으므로 전이 지연 0·드리프트 0(EXPIRING→EXPIRED, GRACE→EXPIRED가 `findByActiveTrue()` 1회만으로 즉시 반영됨을 `LiveLicenseFreshnessTest.signedExpiryTransitionDoesNotWaitForFreshnessTtl`·`gracePolicyRemainsOpenUntilItsSignedBoundary`가 증명). 🔴 **`current()`는 예외 없이 fail-closed**다 — 캐시 채움 중 다른 스레드의 `refresh()`(등록·해지, AFTER_COMMIT 리스너)와의 generation 경합이나 freshness(60초) 초과 시 **재시도 3회**를 거치고, 그래도 판정이 안 서면 던지지 않고 `LicenseStatus.locked(LicenseState.INVALID)`로 접는다 — `current()`는 `FeatureInterceptor`·`AccessModeInterceptor`가 **모든 요청**에서 부르는 공유 게이트라 여기서 예외를 던지면 관리자 한 명의 라이선스 등록이 다른 사용자 요청 전부를 HTTP 500으로 만든다(2~3단계 검수 🔴 R2 — 최초 구현은 `IllegalStateException`을 던졌었다). 반영 지연 계약: **라이선스 변경은 최대 60초**(provider 캐시), 그 외 메타는 최대 30초 — 둘을 구분해 적는다 |
| **최대 반영 지연 계약** | 같은 프로세스 이벤트 = 즉시(commit 이후) · 다른 노드·DB 직접 수정 = **"즉시" 대상에서 제외**, hard expiry 30초가 상한 · 라이선스 = 60초 |
| 캐시 miss(항목 없음) | 비동기 채움을 걸고 **그 배치의 해당 스팬은 거절**(`metadataUnavailable`, partialSuccess) — 이는 **신규 서비스·신규 토큰의 첫 1초**에만 일어난다(TTL 경계에서는 일어나지 않는다). 다음 배치부터 통과 |
| DB 장애 | hard expiry 안 항목은 유지, 밖 항목·없는 항목은 거절. **부분 거절은 200 + partialSuccess**, 단 토큰 항목 자체가 없어 **배치 전체의 인증 상태를 확인할 수 없으면 503**(§2.3 503 정의) |
| 등록·last-seen | **라이브는 하지 않는다.** 서비스·인스턴스 등록은 저장 경로가 한다 — ✅ 트레이스뿐 아니라 **메트릭 경로(`MetricIngestPipeline:101`)도 registrar를 쓰므로** 메트릭을 내는 서비스는 tail 결과와 무관하게 등록된다 `[C-r2 반영]`. ⚠️ traces-only 서비스는 최초 정상 샘플 도착 시간에 **확정적 상한이 없다** — v1의 "수 초~수 분이면 된다"는 삭제. 문구는 "저장 경로(트레이스 샘플 또는 메트릭)에 등록된 서비스만 실시간에 나타납니다" |
| 승인 대기·숨김 | `servicePending`·`serviceHidden`으로 거절(저장 경로와 같은 판정) — 인메모리 카운터만 |

### 2.4 링 — `LiveSpanRing` `[C-r2 반영: 고정 세그먼트 chunk pool 폐기 → 전역 슬롯 arena·서비스별/전역 예산·창 이동 규칙·ID 재사용 금지·dedup 정확 비교]` (필수 수정 2 · N1)

🔴 **v1의 "1초 버킷 × 200점 고정 세그먼트 + 전역 7,000세그먼트"는 성립하지 않는다**(코덱스 산술 반례 — 실측 불필요): 200서비스 × 1점/초면 빈 슬롯 199개짜리 세그먼트가 초당 200개 생겨 pool이 **35초**에 소진되고, 10서비스 × 100점/초도 **700초**에 소진된다. "논리 용량을 100·50으로 줄인다"는 실제 메모리를 줄이지 못하고, 서비스당 세그먼트 상한은 독점 제한일 뿐 공정 배분이 아니다(7개가 선점하면 8번째는 못 들어온다). **v2는 슬롯 단위 할당으로 바꾼다.**

**자료구조 — 전역 primitive 배열 arena, 슬롯 단위 할당.**
```text
전역 arena(슬롯 상한 고정 = max-points-total 1,400,000 — 이 밖으로 allocation은 없다 [N1 유지])
  물리 할당은 세그먼트 단위 lazy [X-r1 정정]: 세그먼트 = 16,384 슬롯(8열 배열 합 16,384 × 45B = 720 KiB), 최대 86개(마지막은 **7,360 슬롯** `[impl-r2 반영: 7,040→7,360]` — 1,400,000 − 85 × 16,384 = 7,360, 86 × 16,384 = 1,409,024 > 1,400,000)
    슬롯 번호 = seg << 14 | off · 자유 목록이 비면 다음 세그먼트 1개를 할당 · 86개째까지 다 쓰면 압박(아래) · 할당한 세그먼트는 반납하지 않는다(고수위 유지)
    → retained heap = 할당 세그먼트 수 × 720 KiB(단조 증가, 최대 86 × 720 KiB = 60.08 MiB) · 논리 점유 = 사용 중 슬롯 × 45B — 둘을 항상 병기한다(§5.2)
  점 열 배열(세그먼트마다): long endTs[] · float durationMs[] · byte flags[](bit0 http5xx · bit1 spanError · bit2 slow · bit3 emphasisLayer — §3.1과 동일 [X-r1 정정])
              · short routeId[] · short instanceId[] · long traceHi[] · long traceLo[] · long spanId[]   → 슬롯당 8+4+1+2+2+8+8+8 = 41B(원시) + int nextSlot[] 4B = 45B
  freeHead / nextSlot[]  — 자유 목록(단일 연결, 세그먼트 경계를 넘어 연결). 할당·반납 O(1)
버킷 헤더[serviceSlot][secondSlot](200 × **907** = **181,400**칸 고정 열 배열(SoA — 객체 헤더 없음) `[impl-r2 반영: 900→907칸 — 경계 충돌 방지]`, 헤더당 40B → **7,256,000B = 6.92 MiB**) [X-r1 정정: 필드별 타입]
  long bucketTime(8) · int observed(4) · int retained(4) · int observedEmph(4) · int retainedEmph(4) · int headSlot(4) · int headSlotEmph(4) · int pointsRev(4) · int lateArrivals(4) = 40B
  (v2가 나열한 provisionalUntil·statsSlot은 파생값이라 저장하지 않는다 — provisionalUntil = bucketTime + 1,000 + 5,000, statsSlot = 같은 [serviceSlot][secondSlot] 인덱스.
   statsRev는 집계 슬롯이 단일 원천, delivered는 연결별 값이라 헤더에 없다. v2 나열 11필드를 전부 두면 long 2·int 9 = 52B = 8.93 MiB였다)
서비스별 예산            base 사용량 / emphasis 사용량 / 상한(base 180k · emphasis 20k)
전역 예산                base 예약 1,300k / emphasis 예약 50k(예약 합 1,350k) / 압박 완충 50k / 전체 슬롯 1.4M(바이트 상한 1,400,000 × 45B = 63,000,000B = 60.08 MiB) [X-r1 정정]
```
- 🔴 **버킷 배열 칸 수는 907**(창 900초 자체는 불변) `[impl-r2 반영]` — 살아 있는 서로 다른 초는 `endTs ∈ [now−900,000, now+5,000]` 구간에서 최대 **906개**(tick의 반납 조건이 `bucketTime + 1000 ≤ now − 900,000`)이므로 900칸이면 `now+5s`와 `now−895s`가 같은 인덱스에서 경계 충돌한다. **907칸**이면 906개를 담고 tick 지연에 대비한 여유 1칸이 남는다(정확히 맞추려면 906칸으로도 충분하나 여유를 둔다). tick이 늦어 910초 전 버킷이 남아 있어도 `offer()`가 `bucketTime[i] != time`이면 먼저 `clear`하므로 오염되지 않는다. 추가 비용은 7 × 200 × (40 + 104)B = 201,600B ≈ **0.193 MiB**(헤더 6.87→6.92·집계 17.85→17.99에 이미 반영, §5.2 합계 갱신).
- 점은 **필요한 만큼만** 슬롯을 받는다 — 200서비스 × 1점/초는 초당 200슬롯이지 200세그먼트가 아니다. slab/page로 물리 할당하더라도 **한 page를 한 저빈도 버킷에 독점시키지 않는다**(page는 arena 내부 구현이고 버킷은 슬롯 목록만 가진다).
- **두 계층·전역 예약** `[C-r2 반영]`: ① **기본 계층** — 버킷마다 균등 reservoir(용량 `points-per-bucket` 200, 201번째부터 Vitter R로 **이미 가진 슬롯을 덮어써** 추가 allocation 없이 교체). ② **강조 계층**(오류·느림) — v1의 "서비스 생애 전체 Algorithm R + 오래된 점 삭제"는 최근 15분의 올바른 reservoir가 아니므로 폐기 → **초별 reservoir(버킷당 `emphasis-points-per-bucket` 50) + 합계 예산**(서비스당 20k·전역 50k)으로 단순화. 전역 예약은 **base 1,300k · emphasis 50k**(예약 합 1,350k) + 압박 완충 50k = arena 1.4M `[X-r1 정정: v2의 base 1,350k는 5% 압박 임계 1,330k보다 커서 목표 도달 전에 축소되는 모순 — 목표를 1,300k(= 1,444점/초 × 900초, L2 1,000/초의 1.44배)로 내리고 임계를 3%로]`. 따라서 **L3(1,500/초 × 900초 = 1,350k)은 base 예약을 넘어 균등 축소가 관측되는 프로필**이지 "보관 목표 안"이 아니다. 두 계층 모두 예산이라 오류 100%·정상 100% 어느 극단에서도 arena를 넘지 않는다.
- **공정 배분·창 이동 규칙** `[v2 신규]`: 서비스별 base 상한 180k(= 200 × 900)은 **독점 제한**이고, 공정성은 **전역 예산 압박 시**에만 개입한다 — **압박 진입 조건** `[X-r1 정정]` = (arena 잔여 < **3%** = 42,000 슬롯 — 아직 할당하지 않은 세그먼트도 잔여로 센다) ∨ (base 사용량 ≥ base 예약 1,300k → base 계층만) ∨ (emphasis 사용량 ≥ 50k → 그 계층만). 산술: 1,400,000 × 0.97 = 1,358,000 ≥ 예약 합 1,350,000(여유 8,000) — v2의 5%(1,330,000)는 base 목표 1,350k보다 앞서 압박에 들어가는 모순이었다. 🔴 **기본 설정에서 "잔여 < 3%" 분기는 산술상 도달 불가**(4단계 검수 🟡 Y3) `[impl-r2 반영]`: `arena.used() = baseUsed + emphasisUsed ≤ 1,300,000 + 50,000 = 1,350,000`이 계층 예약 자체의 상한이라(두 번째·세 번째 조건이 먼저 걸린다) 3% 임계(1,358,000)에는 결코 닿지 않는다 — **실질 트리거는 계층 예약 도달 하나뿐**이다. 이는 §2.4가 스스로 계산한 "여유 8,000"의 당연한 귀결이라 코드 결함은 아니지만, 이 분기는 회귀로 타지 않으며 앞으로도 탈 수 없다 — **상한을 나중에 조정할 때를 위한 안전망**으로만 남겨 둔다. `arenaPressure` 단계에 들어가면 (1) 새 슬롯 요청은 **그 초에 가장 많은 슬롯을 쓰는 서비스부터** reservoir 용량을 반으로 줄이고(200→100→50, 하한 20) (2) 이미 보관 중인 점을 줄여야 하면 **무작위로 축소**하고 그 버킷의 `pointsRev`를 올려 교체 이벤트를 보낸다. 창 밖으로 나가는 버킷의 슬롯 반납은 **tick 시작 시 일괄**(서비스 순회 1회) — 반납은 항상 앞서므로 정상 상태에서는 압박 단계에 들어가지 않는다. 🔴 **용량을 다시 늘렸다고 과거 버킷의 포함 확률을 높여 표시하지 않는다** — 과거에 버린 점은 복구 불가이며 `retained`가 진실이다. 🔴 압박은 **표시 축소**이지 수신 거절이 아니다(`arenaPressure`·`retainedShrunk` 계수, partialSuccess 불포함 — §2.3).
- **snapshot 참조 수명** `[C-r2 반영]`: 창 밖 버킷의 슬롯은 snapshot이 참조하는 동안 재사용될 수 있다 → snapshot은 서비스 락 아래에서 **버킷 단위로 복사**(typed array → 직렬화 버퍼)한 뒤 락을 놓으며, 슬롯 자체를 참조로 들고 나가지 않는다. 재생 로그(§2.5)도 직렬화된 바이트만 보관한다. 따라서 arena에 참조 수명 관리(핀 카운트)는 두지 않는다 — 복사 비용은 R3 측정 항목.
- **표본 위치 접근**: 슬롯 연결 목록에서 임의 표본 위치를 찾는 비용(Vitter R 교체 대상 선택)은 R3에서 측정하고, 필요하면 **별도 예산을 잡은 위치 인덱스**(버킷당 `int[]` 상한 200 → 최대 200 × 900 × 200 × 4B = 144,000,000B = 137.33 MiB는 불가하므로 **살아 있는 버킷에만 lazy 할당**·상한 예산 8 MiB `[X-r1 정정: 단위]`)를 추가한다. 시제품 기본은 인덱스 없이(교체 대상은 목록 순회 — 200점이면 평균 100 step).
- 🔴 **reservoir 균등성 회귀 테스트가 필요하다** `[impl-r2 반영]`(4단계 검수 🟡 Y9 — 변이 주입으로 확인: reservoir 교체 규칙을 "항상 최신 우선(head 덮어쓰기)"으로 바꿔도 기존 회귀가 **전부 green**이었다. 즉 "초별 층화 reservoir(균등)"라는 정본 문구가 지금은 테스트로 보호되지 않는다). 회귀 목록에 추가할 것: 고정 시드로 1,000점(spanId 0..999)을 200칸 버킷에 넣고 **보관 spanId의 평균이 400~600**(균등 ≈ 500, 최신 우선 ≈ 103, 최초 우선 ≈ 100)임을 확인 — 버킷 20개 반복 평균이면 시드 흔들림도 흡수된다.
- **집계는 표본과 분리** `[C-r1 반영]`: dedup·유효성을 통과한 **모든** 점이 서비스별 1초 집계 슬롯을 갱신한 **뒤에** reservoir 채택 여부를 정한다. 슬롯(v2) = `int count·http5xx·spanError·slow(16) · double sumMs(8) · float min/max(8) · int[15] histogram(60, `P95_BOUNDS` 재사용) · int statsRev(4) · byte flags(1)` = 16+8+8+60+4+1 = **97B → 8B 정렬 104B** `[X-r1 정정]`. 서비스 200 × **907**칸 = **181,400** × 104B = **18,865,600B = 17.99 MiB** `[impl-r2 반영: 900→907칸]`(고정 배열이라 부하와 무관). 오류는 **2축**(`http5xxCount` = RED 비교용 · `spanErrorCount` = `status.code==ERROR`)으로 따로 센다 `[C-r2 반영]`(§3.1). ⚠️ P5.4 패턴(시작 시각 분산·route별 오류 분모·±5% 띠)은 이 슬롯으로 계산할 수 없다 — P5.4 전에 자료구조를 추가하며 첫 출시 슬롯에는 넣지 않는다(§4.4).
- **히스토그램 정밀도** `[C-r2 반영]`(N9): ✅ `CanonicalBounds:53`은 14개 경계 + overflow(100~250ms·1~2.5초 구간이 넓고 10초 초과는 하나). 첫 출시 게이지에는 **근사값 + 구간/overflow 정보**를 조건으로 쓴다 — 화면은 p95를 소수점 실측값처럼 쓰지 않고 "약 N ms(구간 근사)"로, 5분 p95는 1초 p95의 평균이 아니라 **histogram을 합친 뒤** 계산. 정확도 요구가 정해지면 촘촘한 고정 histogram 또는 유계 sketch를 R3에서 비교.
- **dedup** `[C-r2 반영]` `[impl-r2 반영: 자료구조 교체]`: 🔴 `traceIdLo ^ rotl(spanId)` 하나는 `(traceId, spanId)`의 **동일성 검사가 아니다** — 지문은 색인용이고 충돌 시에도 전체 키(traceHi·traceLo·spanId 24B)를 비교한다. 🔴 **자료구조를 초별 open-addressing에서 폐기하고 공유 슬롯 풀 + 체인 + 64샤드별 만료 FIFO로 교체한다** — 4단계 구현이 정본보다 낫다: 초별 테이블은 키 분포를 모르는 `reserve(int)` 선검사가 특정 초·특정 샤드에 몰리면 배치 중간에 용량이 바닥나 503이 날 수 있었는데, 전역 슬롯 풀 하나에서 `capacity − used − reserved`로 선검사하면 키 분포와 무관하게 성립한다. 구조: splitmix64 finalizer의 하위 6비트로 64개 샤드에 분산해 슬롯을 체인으로 연결하고, 만료는 **샤드별 도착 시각 FIFO**로 O(1) 처리한다. 용량은 **프로퍼티로 노출**한다(`app.apm.live.spans.dedup.capacity`, 기본 **90,000** = 지원 수신 처리율 × 60초 상한 — 1,000/초(L2) × 60 = 60,000 ~ 1,500/초(L3) × 60 = 90,000). 상주 = 슬롯 90,000 × 40B(지문 8 + 전체 키 24 + 체인/만료 연결 8) + 보조 배열 180,032 × 4B(샤드 체인·FIFO 포인터) = 4,320,128B = **4.12 MiB**(v4.2까지의 5.49 MiB보다 작다 — open-addressing의 적재율 여유(2배)가 사라졌기 때문, 4단계 구현 실측으로 확정). 🔴 **기본값 90,000이 L3 상한(1,500/초 × 60초)과 정확히 겹쳐 여유가 0이다 — L3 지속 프로필에서 절벽이 될 수 있다**(4단계 검수 🟡 Y4): 그 순간 `reserve()`가 `dedupFull`로 **배치 전체 503**(§3.3)이 되므로, R3/R2′에서 L3 지속 시 포화 시점을 실측하고 필요하면 기본값을 올린다. ⚠️ **60초 dedup과 900초 늦은 도착 허용의 불일치는 여전하다**: 60초보다 늦게 온 중복은 다시 집계될 수 있다 — dedup 기간을 900초로 맞추면 15배로 늘어나므로 첫 출시는 60초 유지·한계 문구화, R1 "늦은 도착·중복"(61초 fixture)이 이 한계를 **관측**한다(불합격 아님, §2.4 계약 그대로 — 4단계 회귀로 고정).
- **사전 — ID 재사용 금지** `[C-r2 반영]` `[impl-r2 반영: 회수 규칙·네임스페이스]`: 🔴 v1의 "id 재사용은 `dictVersion` 세대를 올려 옛 매핑을 버린다"는 **폐기** — 과거 점은 아직 옛 instanceId를 참조한다. 첫 구현은 **링·snapshot·재생 로그가 참조하는 동안 ID를 재사용하지 않는다**: route 사전은 서비스당 상한 200, 인스턴스 상한 64를 넘으면 `__other__`(id 1)로 귀속시키고 **새 id를 만들지 않는다**. 🔴 **회수 규칙 = 마지막 관측 이후 910초**(참조 카운트 방식은 폐기): 창 안 점의 `referencedAt`은 `max(now, endTs) ≥ endTs`이고 그 점이 링에서 반납되는 시각은 `endTs + 901초`(창 900초 + tick 1초)이므로, 회수 조건(`now − referencedAt > 910초`)은 **9초 이상의 안전 여유**를 두고 그 뒤에 온다 — 참조 카운트보다 단순하면서 과소 회수 방향이라 "과거 점이 옛 id를 참조한다"는 원래 의도를 깨지 않는다(4단계 구현·검수 확인 — 정본을 구현에 맞춰 갱신). 서비스 LRU 퇴출·삭제는 **명시적 `removeServices` 이벤트**(§3.2). `dictVersion`은 **추가·제거 델타의 순서 번호**로만 쓴다. 🔴 **ID 네임스페이스 = 서비스**(프로세스 전역이 아니다) — route·instance ID는 **서비스 안에서만 유일하면 된다**(§3.2 사전이 `"routes": {"<serviceId>": {"17": "GET /orders/{id}"}}`로 서비스별로 구획된 것과 같은 이유). 프로세스 전역 단조 시퀀스로 구현하면 희소성을 서비스 수(200)배 낭비한다 — route는 템플릿 정규식만 통과하면 되므로 비템플릿 경로(`/orders/12345`)도 유효해 계측 품질이 나쁜 앱에서 **route churn이 있으면 sweep 2회(약 30분)에 65,534개를 소진**하고, 그 뒤로는 `sequence.get() > 65535` 분기로 **재기동 전까지 모든 신규 route·instance가 영구 `__other__`**가 된다(4단계 검수 🔴 R1 — 병합 전 수정 대상). 서비스별로 시퀀스를 나누면 한 서비스가 65,534개를 다 쓰는 데 서비스당 상한(200) × sweep 주기상 수개월이 필요하고, 그 서비스가 삭제·LRU 퇴출되면 `removeServices`로 사전을 통째로 버리므로 네임스페이스 재시작도 안전하다. 소진 신호는 예산 초과(`dictBudget`)와 섞지 않는 **전용 계수 `dictIdExhausted`**로 관측한다.
- **사전 바이트 예산** `[X-r1 정정]`: v2의 8 MiB는 route 문자만으로도 초과였다(200 × 200 × 256 = 10,240,000자 = 9.77 MiB, LATIN1 1B/char). 상한 산술(스크립트 검산): route String 40,000개 × 296B(String 객체 24 + byte[] 헤더 16 + 256 → 8B 정렬) = 11.29 MiB + 정·역 Map 엔트리 40,000 × 56B(HashMap.Node 32 + Short 16 + 참조 4+4) = 2.14 MiB + 인스턴스 12,800 × (String128 168 + display8 48 + Map 56 = 272B) = 3.61 MiB + 참조 카운트 52,800 × 4B = 0.20 MiB = **17.24 MiB**. 프로퍼티 `dict-budget-mib`를 **20 MiB**로 증액(UTF-16 인스턴스 id 여유 포함)하고, 바이트 카운터(등록 시 가산·회수 시 감산)가 예산에 닿으면 **신규 route·인스턴스 등록을 거부해 `__other__`로 접는다**(`dictBudget` 계수 — 표시 축소, 수신 거절 아님). route는 값 검사(§2.2)로 LATIN1이 보장되지만 instance id는 아니므로 비-LATIN1이면 2B/char로 계수한다. `[UX-r1b 반영]` 인스턴스 사전에 **안정 식별값 `key`**(전체 `service.instance.id`의 64-bit 해시 hex 16자 — §3.2, URL `inst` 필터용. `[C-r3 반영: §5 추가 지적]` 🔴 **해시 입력은 Collector 정리(`truncate_all` 128B·`redaction/live`) 후 BE에 도착한 값**이지 원본이 아니다 — 원본은 BE에 오지 않으므로 다른 선택지가 없다(`[R-P5b 실측 ✅ §13]` BE 도착 시점에 이미 `PII-SVCINST-911-****`처럼 마스킹된 값이다). 마스킹으로 여러 인스턴스가 같은 값이 되면 **합쳐진 대로 한 인스턴스**로 사전·집계·표시하며, 도움말에 "인스턴스 id에 개인정보 패턴이 있으면 마스킹돼 합쳐질 수 있다"를 적는다(UX 정본 알림 항목). 후속 F1(§7)의 상세 식별자도 **같은 입력(정리 후 값)·같은 산식**이어야 라이브↔상세 대조가 맞는다)를 더하면 12,800 × 56B(String 24 + byte[] 헤더 16 + 16자) = 716,800B = **0.68 MiB** → 상한 산술 **17.92 MiB**, 예산 20 MiB 유지(여유 2.08).
- **시간 규칙** `[C-r2 반영]`: 미래 `endTs > now+5s` 폐기(`future`), 창 밖 `endTs < now−900s` 폐기(`stale`). 그 사이의 **늦은 도착은 자기 버킷에 들어간다**(`endTs` 기준). 🔴 v1의 `final`은 이름이 틀렸다(5초 뒤에도 고친다면 final이 아니다) → **`provisionalUntil` = 버킷 종료 시각 + 5초**(생성 시각이 아니라 **버킷 종료 시각** 기준). 그 전은 "잠정"(게이지 흐리게), 그 뒤에도 창 안이면 늦은 수정이 가능하며 `lateArrivals` 계수 + `pointsRev`/`statsRev` 상승으로 재전송.

| 항목 | 값(기본, 프로퍼티 `app.apm.live.spans.*`) | 왜 |
|---|---|---|
| 창 `window-seconds` | 900 | X-View는 15분이면 충분하다는 사용자 요구. 화면 기본 5분(§4.1) |
| 버킷 reservoir `points-per-bucket` | 200 | **서버 보관 목표**(서비스당 200점/초) — 표시 보장이 아니다 |
| 강조 초별 `emphasis-points-per-bucket` · 서비스 합계 `emphasis-points-per-service` · 전역 `emphasis-points-total` | 50 · 20,000 · 50,000 | 오류 폭주 때도 상한 유지, 전역 예약 명시 |
| 전역 arena `max-points-total` | 1,400,000(base 예약 1,300k + emphasis 예약 50k + 압박 완충 50k) `[X-r1 정정]` | base 1,300k = 1,444점/초 × 900초(L2 1,000/초의 1.44배 — L3 1,500/초는 예약 초과 → 균등 축소 관측). 바이트 상한 1,400,000 × 45B = 63,000,000B = **60.08 MiB**(= 63.00 MB — v2의 "63MB"는 MB 표기였다) |
| arena 세그먼트 `arena-segment-slots` `[X-r1 정정]` | 16,384 슬롯(720 KiB) · lazy 할당 · 반납 없음 | 고정 상한은 유지하되 정상 부하의 retained를 논리 점유에 근접시킨다(§5.2 정상 부하 행). 세그먼트 1개 할당 지연은 R3 측정 |
| 압박 진입 `arena-pressure-threshold` | 잔여 **3%**(42,000) ∨ 계층 예약 도달 `[X-r1 정정]` | 1,400,000 × 0.97 = 1,358,000 ≥ 예약 합 1,350,000(여유 8,000). v2의 5%(1,330,000)는 base 목표보다 앞서 모순. 🔴 **첫 조건("잔여 3%")은 산술상 도달 불가**(계층 예약 합 1.35M < 1.358M) — 실질 트리거는 계층 예약 도달뿐, 이 조건은 안전망으로만 존재 `[impl-r2 반영]` |
| dedup 용량 `dedup.capacity` `[impl-r2 반영]` | `app.apm.live.spans.dedup.capacity` 기본 **90,000** | 지원 수신 처리율 × 60초(1,000/초(L2) 60,000 ~ 1,500/초(L3) 90,000) — 🔴 기본값이 L3 상한과 정확히 겹쳐 여유 0(§2.4 dedup 절, 4단계 검수 🟡 Y4). 포화 시 `dedupFull` 503(§3.3). R3/R2′가 L3 지속 시 포화 시점을 실측 |
| 사전 바이트 예산 `dict-budget-mib` `[X-r1 정정]` | **20** | 상한 산술 **17.92 MiB**(§2.4 사전 — 17.24 + 인스턴스 안정 키 0.68 `[UX-r1b 반영]`) + 비-LATIN1 여유. 도달 시 신규 등록 거부 → `__other__` |
| 상주 힙 예산 `max-heap-mib` | **160** | 산술(§5.2): arena 60.08 + 헤더 **6.92** + 집계 **17.99** + dedup **4.12** + 사전 20(예산) + 위치 인덱스 8(예산) = **117.11 MiB** ≤ 160(여유 42.89) `[impl-r2 반영: 907칸·dedup 재구조 반영 — 118.29→117.11]`. 단위 **MiB**, v2의 MB 혼용(63·7.2·18) 제거 `[X-r1 정정]`. P1.5 64와 **별도** + 기동 시 합산 검증(§5.2, 정책은 N7 답) |
| 스냅샷 임시 예산 `max-snapshot-mib` | 64 | chunk 직렬화 버퍼 admission(§2.5) — 상주와 별도 |
| 서비스 상한 | P1.5 `max-services` 200 재사용, LRU + `removeServices` 이벤트 | 같은 판단 |

- 동시성 `[C-r1 반영]`: **서비스별 락**(서비스 링 객체 모니터). 락 안에서는 갱신·필요 데이터 복사만, **직렬화·전송은 락 밖**. 무잠금 링은 실측이 요구할 때만. 락 획득 시간 초과(50ms)는 배치 503(§2.3).
- 🔴 `offer`는 **절대 던지지 않는다** — 던지면 배치 전체가 503이 된다. 거절은 계수로.
- 🔴 R3 실패 대안 **`float→short ms`는 삭제** `[C-r1 반영]` — 대안은 `points-per-bucket`·강조 상한·arena 하향뿐(창을 조용히 줄이지 않는다).

### 2.5 전달 — SSE `GET /apm/live/spans/stream` `[C-r2 반영: 발행 경계·sinceSeq·viewKey·revision 분리·snapshot chunk·바이트 상한·control 상태 머신·거절 변환 위치]` (필수 수정 4·5·6 · N2·N6·N7 — payload는 §3)

| event | 언제 | 페이로드(요약, 전문 §3.2) |
|---|---|---|
| `snapshot.begin` / `snapshot.chunk` / `snapshot.end` `[C-r2 반영]` | 연결 즉시(또는 이음 불가 시) | `snapshotId`·고정 `seq=S`·`viewKey`·`streamEpoch`·`dictVersion`·서버 메타·config(`begin`, **≤ 64 KiB — 사전을 싣지 않는다** `[X-r1 정정]`) → **사전 chunk**(`kind:"dict"`, 서비스 단위 분할, 각 ≤ 1MiB — 사전 상한 JSON ≈ 11 MiB라 v2처럼 begin에 넣으면 chunk 규칙 밖이었다) → 서비스·버킷 범위 단위 **버킷 chunk**(`kind:"buckets"`, 각 ≤ 1MiB 직렬화, 순번·총수) → `end`(chunk 수·체크섬). FE는 **마지막 chunk까지 받은 뒤 한 번에** 확정한다. 서버는 **큰 JSON을 먼저 완성하지 않고** 서비스 락 아래 버킷 단위 복사 → 락 밖 chunk 직렬화 → 송신을 **스트리밍**한다(그래야 임시 메모리가 chunk 단위로 유지된다 — 완성 후 자르면 줄지 않는다) |
| `spans` | **1초**마다(데이터 발행 tick) | `sinceSeq`·`seq`·`viewKey`·이 tick에 **바뀐 버킷 전체**(`replaceBuckets`, `pointsRev`) + 최근 5초 버킷의 **`statsRevision`(`statsRev`)** + 사전 델타 + `removeServices` + 액티브/리소스 최신값 |
| `heartbeat` | 5초(데이터가 없을 때만) | `{ts, lastSeq}` — **마지막 데이터 seq를 알릴 뿐 seq를 증가시키지 않는다**(재생 위치를 앞당기지 않음) `[C-r2 반영]` |
| `control` `[v1 신규 → C-r2 반영]` `[contract-r1 정정]` | 필요 시 | `{type: reject|degraded|paused|epochChanged, code, errorCode, retryable, retryAfterMs}` — **seq를 소비하지 않는다**(연결별 이벤트). 🔴 `resume`은 **BE가 보내지 않는다**(v4.4까지 표에 있던 오기) — `paused` 해제는 **새 `snapshot.begin` 도착**으로 판정한다. 처리 규칙은 아래 상태 머신 |

**정합성 키** `[C-r2 반영: seq는 데이터 발행 번호·viewKey·revision 분리]`
- `streamEpoch`: 서버 기동·링 리셋마다 새 값. epoch이 바뀌면 **가진 것을 전부 버리고** snapshot을 다시 받는다.
- `seq`: **데이터 발행 번호** — tick마다 하나. 🔴 연결별 snapshot·control·heartbeat를 만들 때마다 전역 seq를 올리지 않는다. SSE `id:` 필드에 `epoch:seq`로 실어 `Last-Event-ID`가 자동으로 나른다(데이터 이벤트에만 `id:`를 붙인다).
- `sinceSeq`: 이 증분이 **전제하는 직전 seq**. FE는 `epoch`·`viewKey`가 같고 `sinceSeq == 마지막 적용 seq`일 때만 적용하고, 불일치면 **재생 요청 또는 snapshot**으로 복구한다(조용히 건너뛰지 않는다).
- `viewKey`: `serviceFilter|env|protocol|windowSeconds|samplingPolicy`(예 `all|prod|http|300|sampling-v1`). 다른 view로 바뀌었는데 같은 커서로 재생하면 안 되므로 **커서는 `(epoch, viewKey, seq)` 삼중**이다.
- `dictVersion`: 사전 델타의 순서 번호(추가·제거). 건너뛰면 snapshot. ID는 재사용하지 않는다(§2.4).
- 버킷 **`pointsRev`·`statsRev` 분리**: 🔴 v1의 단일 `rev`는 점 전체 교체와 통계만 교체가 순서에 따라 서로를 밀어냈다. `replaceBuckets`는 `pointsRev`(점+그 시점 stats 동봉), `statsRevision`은 `statsRev`만 갱신 — 각각 큰 것으로 덮어쓴다.
- 점의 `spanId`·`traceId`: 표시 표본의 정체성 — 브러시 목록·상세 링크·5.3b 종료 매칭.

**발행 경계 — 불변 tick 상태 + 재생 로그** `[C-r2 반영]` (v1 "구독 선등록 → 락 아래 snapshot → `seq ≤ S` 버림"은 **폐기**: 서비스 A를 복사한 뒤 새 tick이 발행되고 B를 복사하면, 마지막 전역 seq를 붙여 앞선 이벤트를 버릴 때 A의 변경을 잃는다)
1. **tick 스레드**가 1초마다 서비스별 락을 차례로 잡고 **dirty 버킷을 tick당 한 번만 병합**해 view별 **불변 증분 상태**(직렬화된 바이트, `seq=N`, `sinceSeq=N−1`)를 만들고, **같은 경계 아래에서** 재생 로그(view별 링 10개 = 최근 10초, 바이트 상한 아래 표)에 넣은 뒤 발행한다. 발행 = 연결 큐에 참조를 넣는 것(복사 없음, 바이트 공유).
2. **snapshot은 tick 상태 `S`를 참조한다**: 연결 수락 → admission 통과 → 다음 tick 경계에서 **그 tick이 확정한 seq=S를 snapshot의 seq로 고정**하고 구독을 **같은 경계 아래에서** 등록(그 뒤 발행되는 첫 증분은 `sinceSeq=S`). snapshot 복사는 경계 뒤 락을 다시 잡고 버킷 단위로 진행하되, 복사 중 tick이 진행해도 **S 이후의 변경은 `pointsRev`/`statsRev`가 더 큰 증분으로 다시 도착**하므로 FE의 "큰 rev로 덮어쓰기"가 정합을 회복한다. 즉 정합의 근거는 "틈이 없다"가 아니라 **"모든 변경은 rev를 올리고, S 이후 모든 증분은 빠짐없이 전달된다"**이다.
3. 재접속에 `Last-Event-ID: epoch:seq`(또는 수동 재생성 시 쿼리 `sinceEpoch`·`sinceSeq`·`viewKey`)가 있고 epoch·viewKey가 같고 seq가 재생 로그 안이면 snapshot 없이 그 다음 증분부터 잇는다. 밖이면 snapshot.

**바이트 상한(필수 수정 5)** `[C-r2 반영]` — 잠정값, R1·R4에서 확정
| 대상 | 상한 | 넘으면 |
|---|---|---|
| tick 증분 1 frame(view별 직렬화 바이트) | **2MiB** | 그 tick의 base 점을 view 전체에 대해 1/k 솎고 `serverKeepRatio`(늦은 도착 폭주 방어 — 1,500점/초·늦은 도착 1%가 서로 다른 200점 버킷을 건드리면 405KB/초, 코덱스 산정). **base가 0이어도 초과하면**(강조 점·사전 델타·stats만으로) `[X-r1 정정]` ① 같은 `seq`를 서비스 단위로 **분할**(`part:{index,count}`, ≤ 4 part = 8 MiB — FE는 count개를 모아 한 번에 적용, 중간 part는 그리지 않는다) ② 4 part로도 넘치면 그 tick의 `replaceBuckets`를 **버리고 `statsRevision`만** 보낸다(점 생략 — `control{degraded, reason:frame_limit}`; 버린 버킷은 `pointsRev`가 그대로라 다음 tick 증분 또는 재접속 snapshot이 채운다). 강조 점·사전 델타·stats는 어느 단계에서도 솎지 않는다 |
| 재생 로그(view별 10초) | **16MiB** | 오래된 것부터 버림 → 재접속은 snapshot으로 |
| 연결별 송신 큐 | **8MiB 또는 5초분** 중 먼저 | 그 연결만 `degraded`(1/k) → 그래도 넘치면 `reject 429 retryable` 후 종료 |
| snapshot chunk | **1MiB**/chunk · 동시 chunk 버퍼 합 ≤ `max-snapshot-mib` 64 | admission(`paused`) |
| `snapshot.begin` `[X-r1 정정]` | **64 KiB**(메타·config·`dictVersion`만) | 사전은 `dict` chunk로(위 chunk 규칙) — begin은 넘을 수 없다(넘으면 구현 결함 = 그 연결 503 종료) |
| snapshot 전체(**전송량** 상한 — 스트리밍이라 상주하지 않는다 `[X-r1 정정]`) | 5분 view **32MiB**(300,000점 × 90B = 25.75 MiB 추정 — v1 16MB는 이미 초과였다) · 15분 view **96MiB**(정상 부하 900,000 × 90B = 77.25 MiB · 만석 1,350,000 × 90B = 115.87 MiB > 96 → **만석 15분 view는 항상 솎인다**, `snapshotKeepRatio` ≈ 0.83) | 초과 시 snapshot 자체를 base 1/k로 솎고 `snapshotKeepRatio` |
| **SSE 고유 바이트 전역** `sse-bytes-total-mib` `[X-r1 정정]` | **96 MiB** = 재생 로그 64(8 view × 16 — 9번째 view부터는 로그 없이 snapshot 전용) + tick in-flight frame 16(8 × 2) + 로그에서 퇴출됐지만 연결 큐가 아직 붙잡은 frame 8 + 연결별 솎음(`degraded` 1/k) 재직렬화 8(동시 직렬화 슬롯 4 × 2) | 카운터는 **frame 바이트를 참조 수와 무관하게 한 번만** 센다 — 참조 공유는 복사 절감일 뿐, 퇴출 frame을 큐가 보유하는 문제는 별도다. 퇴출 보유 8 초과 → 그 frame을 가장 오래 붙잡은 연결부터 종료(`reject 429 retryable`) · degraded 직렬화 슬롯 4 초과 → 5번째 연결부터 솎음 없이 종료. 정상 상태에서는 연결 큐 상한(5초분) < 로그(10초)라 퇴출 보유 = 0이다 |

**snapshot admission** `[C-r2 반영]` `[X-r1 정정: 전송량과 동시 버퍼 분리·대기 10·공유 chunk 참조 수명]`: **전송량**(5분 32 MiB·15분 96 MiB)은 스트리밍이라 상주하지 않고, 상주하는 것은 **동시 chunk 버퍼**뿐이다 — snapshot 하나가 동시에 쥐는 chunk = 직렬화 중 1 + 송신 대기 ≤ 3(공유 시 가장 느린 수신자 기준) = **≤ 4 MiB**. 따라서 v2의 "64 ÷ 32 = 2개"는 근거가 틀렸다: `max-snapshot-mib` 64는 chunk 버퍼 예산(64 ÷ 4 = 16개분)이고, **동시 생성 2개는 서비스 락 점유·버킷 복사 CPU 기준의 잠정값**(R3 복사 비용 측정 뒤 조정)이다. 초과 연결은 `control{type:paused}`를 받고 **서버의 유계 대기열(상한 10 — §3.3 "활성 40 + 대기 10"과 한 벌, v2 §2.5의 20은 오기)**에서 heartbeat만 받으며 대기. 대기 연결도 메모리·연결 수 제한에 **포함**하고, **아직 snapshot이 없는 연결에는 증분을 쌓지 않는다**(구독 등록은 snapshot seq 고정 시점에). 같은 viewKey의 snapshot은 **공유**(chunk 바이트를 여러 연결에 씀). **공유 chunk 참조 수명**: chunk는 참조 카운트(구독 연결 수)로 살고 마지막 연결의 송신 완료에 해제된다. 가장 느린 연결이 선두보다 3 chunk 이상 뒤지면 그 연결을 공유에서 떼어 `reject 429 retryable`(재접속 시 새 snapshot) — 느린 하나가 공유 chunk 전부를 붙잡지 않게 한다. 50개 연결이 서로 다른 필터로 동시 재접속하는 경우가 v0 750MB의 근원이었고, v2는 공유 + admission 2 + chunk 스트리밍으로 임시 메모리를 64MiB로 묶는다.

**서버 쓰기 경로** `[C-r2 반영: writer 반환 실측]`
- 🔴 **직렬화는 tick당 viewKey마다 한 번** → 바이트 공유. 현 `ApmLiveStreamController.push()`(✅ 연결마다 `snapshots.tick()` + 동기 `send`, 287행)를 그대로 쓰면 느린 클라이언트 하나가 tick 스레드를 막는다.
- 연결별 유계 큐 + 전용 writer 풀. 연결마다 한 번에 하나의 쓰기만(순서 보장), 쓰기마다 **deadline 2초**(목표) — ⚠️ Spring MVC의 개별 응답 쓰기는 **blocking**이라 `SseEmitter`나 타이머만으로 2초 뒤 writer가 반드시 풀린다고 볼 수 없다. 🔴 deadline 초과 시 **연결을 실제로 중단(소켓 close)한 뒤 writer 스레드가 반환되는지**를 R1·R6에서 실측하고, 반환되지 않으면 Servlet 비동기 I/O(`WriteListener`) 또는 전용 소켓 writer로 바꾼다. 느린 클라이언트에게 마지막 control을 보낼 수 있다는 보장은 없다 — 송신이 막히면 **그냥 종료**하고 사유는 다음 연결에서 처리한다.
- 🔴 **P1.5 스트림(`/apm/live/stream`, 10초 `bucket`)은 그대로 둔다.** 주기·페이로드·소비자가 다르다(Q4). N6 답: **P5만 control을 쓰고 P1.5는 바꾸지 않는다**(코덱스 동의).
- 인증·세션·라이선스: P1.5와 동일 — 쿠키 accessToken + `visitorId` 쿼리/헤더 **필수**(`VisitorSessionChecker`), `@RequiresFeature(APM)`, `stream-timeout-seconds` 600, `X-Accel-Buffering: no`.

**거절 변환 위치(필수 수정 6)** `[C-r2 반영]` `[impl-r3 반영: D1 — 3행 분리]`: 인증 필터·세션 검사·라이선스 인터셉터에서 먼저 거절되면 컨트롤러의 `control`까지 도달하지 않는다. P5 스트림 경로의 처리 위치를 명시한다 — 🔴 **세션 문제(1·2행)와 권한/라이선스 문제(3행)를 섞지 않는다**(5단계 검수 D1 — `../reviews/review_apm-p51-s5-be_claude.md`):
| 단계 | 거절 | 처리 |
|---|---|---|
| 인증 필터(JWT 없음·만료) | **실제 401** | **기존 관례 그대로**(스트림을 열기 전이므로 FE는 `EventSource.onerror`에서 세션 확인 경로로) — P1.5와 동일, 바꾸지 않는다. 🔴 `[impl-r3 반영]` 이 401은 **실제 HTTP 상태코드**다 — v4.2까지의 "200+JSON code 401" 괄호 설명은 사실과 다르므로 삭제(CLAUDE.md §3 #1) |
| `VisitorSessionChecker`(visitorId 없음·세션 불일치) | **실제 401** `[impl-r3 반영: D1]` `[contract-r1 정정: 본문]` | 스트림을 열기 전. 🔴 본문은 **`ApiResult`가 아니라 `{"code":401,"errorCode":"INVALID_TOKEN"}` 두 필드뿐**(`status`·`message`·`data` 없음, `LiveStreamRejectionAdvice.resolveException()`) — v4.4까지의 "+ `ApiResult` 본문" 표기는 오기였다(계약서 §1.4). 🔴 **403 `control`로 바꾸지 말 것** — 세션 문제를 권한 문제로 둔갑시키면 FE 재인증(refresh→로그아웃) 경로가 막힌다(P1.5 2026-09-02 P2 QA D3 사고의 **역방향** 재발). 5단계 구현이 옳고 v4.3까지의 정본(이 두 관문을 403 한 행으로 묶은 표기)이 오기였다 |
| `@RequiresFeature(APM)`·`AccessModeInterceptor`·`ApmAccessChecker` | 403 | 🔴 **`/apm/live/spans/**` 경로 한정 `LiveStreamRejectionAdvice`**가 인터셉터 예외를 받아 `text/event-stream` 200을 열고 `control{reject,403,retryable:false}` 1건을 쓴 뒤 닫는다. 이 변환은 **이 경로에만** 적용(다른 경로 관례 불변) |
| 컨트롤러(`ApmAccessChecker.requireRead`·연결 수·admission) | 403/429/paused | 컨트롤러가 직접 `control` |

**클라이언트 재접속 상태 머신(N6)** `[C-r2 반영]` — 🔴 JSON 안의 `retryAfterMs`는 브라우저가 해석하는 프로토콜 필드가 아니다(WHATWG SSE). 표준 `retry:` 또는 **애플리케이션의 명시적 처리**가 필요하다.
```text
control{reject, retryable:false}  (403 권한·라이선스)
  → 수신 즉시 source.close()  → 자동 재접속 중단 → 화면 "권한 없음" → 로그인/권한 변화 또는 사용자 재시도로만 새 연결
control{reject, retryable:true, retryAfterMs}  (429·일시 제한·큐 초과)
  → source.close() → retryAfterMs + jitter(0~30%) 뒤 새 EventSource 생성
  → 마지막 적용 커서를 쿼리 sinceEpoch/sinceSeq/viewKey로 전달(재생 가능하면 snapshot 생략)
control{paused}
  → 연결 유지(닫지 않는다), heartbeat로 "대기 중(n번째)" 표시 → 입장 허용 시 snapshot.begin
일반 네트워크 단절(onerror, readyState CONNECTING)
  → native 자동 재접속 허용, 서버 retry: 3000ms 적용, Last-Event-ID 자동
epochChanged
  → 전부 버리고 snapshot 대기(연결 유지)
```
연속 실패 상한: retryable 재시도 5회 연속 실패 시 **멈추고 사용자 버튼**(무한 재접속 방지).

- **거절을 `control`로 통일한 판단** `[C-r2 반영 — 코덱스 동의]`: 네이티브 `EventSource` 유지(P1.5의 재접속·쿠키 인증·프록시 경험 재사용, ✅ `useApmLive.ts`는 `onerror` CLOSED만 봄). 위 상태 머신이 **필수 조건**이다.
- 🔴 **아파치 `flushpackets`는 해결책이 아니다** `[C-r1 반영]` — AJP·FCGI에만 적용된다. 실제 프록시 경로(아파치 `mod_proxy_http`)에서 **종료→브라우저 p50/p95/p99**를 R1에서 측정하고, 뭉침이 있으면 `ProxyPass … disablereuse`·nginx `proxy_buffering off` 등을 **실측으로** 고른다.
- **화면 상태 3단** `[C-r2 반영: 판정 시간 정정]`: "연결됨"(소켓) ≠ "갱신 중"(최근 **12초** 내 `spans`/`heartbeat` 수신 — 규칙은 **≥ 2 × heartbeat 간격**, 화면 잠정 12초 `[UX-r1 반영]`; v1의 3초는 heartbeat 5초보다 짧아 무트래픽 때 주기적으로 "멈춤"으로 보였다; heartbeat 2회 + 여유) ≠ "멈춤(마지막 수신 n초 전)". 숨김 탭(`visibilitychange`)은 렌더만 멈추고 큐를 소비하되 **5분** 넘으면 연결을 닫고 복귀 시 snapshot — 브라우저가 타이머를 늦출 수 있으므로 **서버 쪽 자원 제한(연결별 큐 상한·`stream-timeout-seconds`)은 별도로 유지**한다. 전체화면 복귀·일시정지(사용자 버튼)도 같은 규칙.

### 2.6 액티브 요청 — 대안 3개 비교와 결정 `[C-r1 반영: 인스턴스 합산·b 별도 결정·c 금지]`

| | a. `http.server.active_requests` 개수 | b. Java 에이전트 확장 jar — `SpanProcessor.onStart` 시작 이벤트 | c. 스팬 종료 시각 역산 |
|---|---|---|---|
| 무엇이 보이나 | 서비스·**인스턴스별 최신값의 합** | **진행 중 목록**(traceId·spanId·route·시작·경과·인스턴스) + 끝나면 제거 | "T 시점에 진행 중이었던 요청"을 **끝난 뒤** 재구성 |
| 지연 | 메트릭 export 주기 10~60초(✅ R1: UpDownCounter는 CUMULATIVE, Java 2.31.1 플래그 없이 나옴) | 1~2초(추정) | 요청이 끝날 때까지 — **오래 걸리는 요청일수록 늦게 보인다** |
| 언어 | 이 메트릭을 내는 스택만(✅ Node는 안 냄 — QA §5-4) | **Java만** | 전 언어 |
| 설치 부담 | 없음 | `-Dotel.javaagent.extensions=moveseye-live-ext.jar` + 우리 jar 배포·버전 호환 관리 | 없음 |
| OTel 단일 원칙 | 부합 | 공식 확장 지점(`AutoConfigurationCustomizerProvider`)이라 "자체 에이전트"는 아니지만 **고객 JVM 안에서 우리 코드가 돈다** — 지원 범위·장애 책임이 새로 생긴다. R5 통과만으로는 해결되지 않는 **제품 결정** |
| 정직성 | "동시 요청 수(약 N초 이내, 관측 인스턴스 m/n)"로 표기하면 정직 | 정직(종료·유실 복구가 있을 때만 — §4.3) | 🔴 **현재 액티브로 사용 금지.** 이름은 "완료 요청으로 재구성한 과거 동시성" 또는 "최근 완료한 느린 요청"뿐 |

**결정: a가 P5.3(첫 출시), b는 P5.3b로 독립 게이트(R5 + 제품 지원 결정), c는 액티브로 쓰지 않는다.**
- 🔴 **a의 계산은 인스턴스 안의 속성 조합별 최신값을 먼저 합산하고, 그 다음 인스턴스를 합산** `[C-r2 반영]`. `http.server.active_requests`는 `http.request.method`·`url.scheme`(·`server.address`)별로 **여러 시계열**로 나오므로 인스턴스 하나에도 값이 여러 개다 — 하나만 취하면 과소. ✅ 현 `LiveBuffer.recordActive`(484행)는 서비스의 마지막 관측 하나만 쓴다 — 인스턴스 3대면 1대 값만 보인다. `[contract-r1 정정: 이력]` 🔴 이 규칙은 **P5 라이브 계약 대조(`../contract_apm-p5-live.md`, 2026-09-16)에서도 재확인**했다 — `live{}`가 아직 §3.2 예시대로 채워지지 않은 상태(§6-A)이므로 이 합산 규칙도 함께 미반영이며, **7단계(§7.1)에서 `live{}`를 채울 때 같이 고친다.** 시간축으로 더하는 것은 틀리지만 (인스턴스 × 속성 조합)의 동시값을 더하는 것은 필요하다. 페이로드에 `observedInstances/expectedInstances`(expected = **저장 경로가 최근 5분 내 본 인스턴스 수라는 관측 추정치** — 화면 툴팁에 "추정"을 표시)·`asOf`(가장 오래된 관측 시각)를 싣고, **stale(90초 초과, `asOf` 기준 판정)·미지원 인스턴스는 0이 아니라 "관측 없음"**으로 뺀다. "최근 60초 최대 동시 요청"이라고 쓰지 않는다 — export 사이의 급증은 안 잡힌다.
- 화면 문구: "동시 요청(약 N초 이내)" — N은 설치 가이드 권고 export 주기(10초) + batch.

### 2.7 배포 토폴로지 — 첫 배포 BE 1대 · 다중 BE는 라우팅 계약 전체가 승격 조건 `[C-r2 반영]` (필수 수정 8 · N10 · 3회차 질문 3의 답)

- **첫 배포 = BE 전체 1대.** 현 실서버 토폴로지(FE 아파치 1대 + BE·AI 도커 1대, `deploy-server-topology` 메모리)가 그대로 전제다. 따라서 P5.1~5.3의 메트릭 공급 경로는 **같은 프로세스의 P1.5 메트릭 링**(§2.8)이며 별도 전달 경로가 없다 — 이것이 "단일 노드 메트릭 공급 경로"의 답이다. snapshot에 `nodeId`·`startedAt`·`coverageFrom`(이 링이 데이터를 갖기 시작한 시각)을 실어 화면이 "이 노드가 15분 전부터 본 것"임을 안다.
- **다중 BE 승격 조건** `[C-r2 반영]` — v1의 "라이브 exporter와 SSE가 같은 노드"만으로는 P5.3 대시보드가 성립하지 않는다(액티브·CPU·heap은 **메트릭 경로**로 오고 그것은 다른 노드에 갈 수 있다). 승격 시 아래 표 **전부**를 충족해야 한다:

| 데이터/작업 | 필요한 조건 |
|---|---|
| 모든 Collector의 live traces | 같은 지정 live 노드로 전달(Collector exporter URL이 그 노드를 가리킴 — LB 라운드로빈 금지) |
| 브라우저 snapshot·SSE·재접속 | 같은 live 노드로 전달(경로 기반 라우팅 `/apm/live/spans/**` → live 노드, sticky만으로는 부족) |
| 액티브·CPU·heap 메트릭 | **해당 live 노드의 메트릭 링에도 전달** — Collector 메트릭 exporter를 live 노드로 보내거나 노드 간 메트릭 전달 경로 신설 |
| 토큰·서비스·라이선스 변경 | 같은 노드에서 처리하거나, 타 노드 변경은 **최대 30초(라이선스 60초) 지연**으로 명시(§2.3.1 hard expiry) |
| 롤링 배포·장애 전환 | 옛 노드의 SSE만 남는 분할 상태 방지 — 새 노드는 새 `streamEpoch`·`coverageFrom`을 표시하고 옛 노드는 `epochChanged`로 재접속 유도 |
| ingress·프록시 | 경로·context path·timeout·buffering을 **실제 배포 경로**로 검증(R1 지연 항목) |

- 승격 시 후보(**확정 보류** — Q4): Redis pub/sub은 데이터 공백을 허용하는 라이브 성격과 맞지만 **재접속 노드의 누락 구간을 복구하지 못한다**(at-most-once). 롤링 배포 중 15분 창 유지가 요구되면 제한 길이 Stream 또는 노드 간 snapshot 인계가 필요하다. 지금은 인터페이스 이음매(`offer`/`snapshot`/`tick`)만 남긴다.

### 2.8 런타임 메트릭의 Live 편입 `[C-r1 반영: heapPct 조건·CPU 집계 명시]`
- 현재 Live 링은 `http.server.request.duration`·`http.server.active_requests` 둘만 본다(설계 §1). 대시보드 게이지를 위해 `jvm.cpu.recent_utilization`·`jvm.memory.used`+`jvm.memory.limit`(**heap pool만**)·`jvm.thread.count`·`process.cpu.utilization`(비-JVM) 4종을 **인스턴스별 마지막 관측값**으로 링에 추가(칸당 +32B × 인스턴스, 힙 영향 무시 수준).
- 🔴 `heapPct`는 **heap pool 구분과 유효한 limit이 둘 다 있을 때만** 계산한다. `jvm.memory.used` 합계만으로 만들지 않는다(non-heap 섞임·limit 없음). 없으면 `null` + "측정 불가".
- 🔴 CPU 집계 방식 명시: 서비스 값은 **인스턴스별 최신값의 단순 평균**, 툴팁에 **최대 인스턴스**를 병기한다. stale(90초)·미지원은 평균에서 제외(0으로 넣지 않는다).
- 🔴 해상도는 export 주기(10~60초)다. 게이지 옆 문구 "약 1분 이내". 1초 갱신되는 것은 **스팬 집계**뿐이며 화면이 그 둘을 같은 속도로 보이게 꾸며서는 안 된다.

---

## 3. 데이터 계약 — payload 한 벌 `[C-r1 반영]`

### 3.1 라이브 스팬 점(`LiveSpanPoint`) — 튜플 인코딩 `[C-r2 반영: HTTP 모집단·오류 2축·proto 제거]` (필수 수정 8)

**모집단 정의(고정)** 🔴: 라이브 점·집계의 모집단은 **`kind == SERVER` ∧ (`http.request.method` 또는 구 `http.method`) 존재**인 스팬이다(Collector `transform/live-normalize`가 구→신 정규화, BE도 같은 판정을 한 번 더). `rpc.*`만 있는 SERVER·메시징 CONSUMER는 첫 출시 모집단 밖(P5.5). HTTP 위 RPC(속성 겹침)는 첫 출시에서 **HTTP로 센다**(method가 있으므로) — P5.5에서 우선순위 규칙을 정한다.

**오류 정의 2축** 🔴 `[C-r2 반영]`: ✅ 기존 `LivePoint:28`은 HTTP 5xx를 오류로 보고 v1은 `status.code==ERROR`만 봤다 — 둘은 다른 모집단이다. v2는 둘 다 세고 화면이 고른다: `http5xx` = `http.response.status_code ≥ 500`(**RED 메트릭 `http.server.request.duration` 비교용 기본**) · `spanError` = `status.code == ERROR`. `isSlow`는 오류 여부와 **독립**으로 계산(`durationMs ≥ slowMs`) — 점의 `flags`는 비트(`http5xx`·`spanError`·`slow`)이고 v1의 배타적 `status` enum은 폐기. 강조 계층 진입 조건 = `http5xx ∨ spanError ∨ slow`.

`[endTsDeltaMs, durationMs, flags, routeId, instanceId, traceId, spanId]`

| 위치 | 필드 | 타입 | 출처 | 비고 |
|---|---|---|---|---|
| 0 | `endTsDeltaMs` | int | **스팬 종료 시각**(`endTimeUnixNano`) − 버킷 시작 | X-축(Q9 종료 시각). 시작 시각은 `endTs − durationMs`로 복원, 상세에서 제공 |
| 1 | `durationMs` | float | end−start | Y-축(로그 스케일 옵션). 🔴 short로 줄이지 않는다 |
| 2 | `flags` | int 비트 | bit0 `http5xx` · bit1 `spanError` · bit2 `slow` · bit3 `emphasisLayer` | slowMs는 **BE 전역 설정**(§2.2 drift). 화면 색은 `http5xx∨spanError` → ERROR, 아니고 `slow` → SLOW, 아니면 OK |
| 3 | `routeId` | short | `http.request.method`+`http.route`(없으면 `__none__` = "경로 미식별") | 서비스별 사전, 상한 초과 `__other__`, **ID 재사용 없음**(§2.4) |
| 4 | `instanceId` | short | `service.instance.id` **전체값**(Collector 정리 후 BE 도착 값 `[C-r3 반영]`) 기준 사전 | 표시는 앞 8자 · URL 키는 `dict.instances.key`(같은 도착 값의 해시) |
| 5 | `traceId` | 32 hex | span | **모든 표시 점에 싣는다**(Q6). 저장 여부는 **별도 상태**(클릭 시 조회) |
| 6 | `spanId` | 16 hex | span | 정체성·dedup·5.3b 종료 매칭 |

- 서비스 귀속: `service.name`+`deployment.environment.name` → 메타 캐시(§2.3.1). 미등록·승인 대기·숨김·`unknown_service`·자기계측은 거절·계수.
- 점당 전송 크기 ≈ 튜플 JSON 70~90B(traceId·spanId 포함, **추정**). 1,500점/초 ≈ 110~135KB/초 미압축 **기본**이며, 늦은 도착에 의한 버킷 재전송이 더해진다(§2.5 frame 상한). SSE gzip은 프록시 설정에 따름(**R-P5″·R4** 실제 프록시 경유 항목 — `[C-r3 반영]` v2의 ❓R1 표기 정정).

### 3.2 SSE 이벤트 — 예시 `[C-r2 반영: snapshot chunk·sinceSeq·viewKey·pointsRev/statsRev·provisionalUntil·observed/retained/delivered·removeServices]`
```jsonc
// ── event: snapshot.begin   (id 없음 — seq를 소비하지 않는다)
{ "snapshotId": "s-91a2", "streamEpoch": "e7f1", "seq": 184220, "viewKey": "all|prod|http|300|sampling-v1",
  "serverTime": 1789000000000, "chunks": 9, "dictChunks": 2, "dictVersion": 42, "snapshotKeepRatio": 1.0,   // [X-r1 정정] begin ≤ 64 KiB — 사전은 dict chunk(앞 dictChunks개)로
  "node": { "nodeId": "be-1", "startedAt": 1788996400000, "coverageFrom": 1788999100000 },
  "config": { "windowSeconds": 900, "snapshotSeconds": 300, "slowMs": 2000, "p95ThresholdMs": 1500, "errorRateThresholdPct": 5.0, "pointsPerBucket": 200,   // p95ThresholdMs = 전역 P95_LATENCY 알람 임계 · errorRateThresholdPct = 전역 ERROR_RATE 알람 임계(%) [UX-r1 반영][UX-r1b 반영] — 둘 다 전역 규칙이 없으면 null(화면은 참고선을 그리지 않고 대체값을 만들지 않는다)
              // 🔴 서비스별 override는 화면이 GET /apm/services/{uid}/alert-rules(✅ requireRead, ApmAlertRuleController:278~281 · useApmEffectiveRules)로 별도 조회 — GET /apm/alert-rules는 requireEdit(:108~110)라 view 사용자에게 실패한다 [UX-r1b 반영: v2 주석 정정]
              "emphasisPerBucket": 50, "emphasisPerService": 20000, "emphasisTotal": 50000, "arenaTotal": 1400000,
              "retention": { "perServicePerSec": 200, "totalPoints": 1300000 } },     // 서버 **보관** 목표(base 예약 — [X-r1 정정] 1,350k→1,300k) — 표시 보장이 아니다
  "live": { "1": { "active": { "value": 7, "observedInstances": 2, "expectedInstances": 3, "expectedIsEstimate": true, "asOf": 1788999930000,
                               "instances": [ { "id": 2, "value": 4, "asOf": 1788999930000 }, { "id": 5, "value": 3, "asOf": 1788999925000 } ] },   // 인스턴스별 분해(선택 요청 → 채택, 64개 상한이라 비용 무시 수준) [UX-r1 반영]
                   "cpuPct": { "avg": 41.2, "max": 63.0, "observedInstances": 2, "asOf": 1788999930000 },
                   "heapPct": null, "threads": 212 } } }

// ── event: snapshot.chunk   (kind: "dict" — 사전 chunk가 버킷 chunk보다 먼저, 서비스 단위 분할, ≤ 1MiB)  [X-r1 정정]
{ "snapshotId": "s-91a2", "index": 0, "kind": "dict", "dictVersion": 42,
  "services":  [ { "id": 1, "uid": "svc_ab12", "displayName": "주문", "env": "prod" } ],
  "routes":    { "1": { "0": "__none__", "1": "__other__", "17": "GET /orders/{id}" } },
  "instances": { "1": { "2": { "display": "7f3a9c1e", "key": "3f9c2b7e41a0d5c8" } } } }
  // [UX-r1b 반영] key = 전체 service.instance.id의 **안정 해시**(64-bit hex 16자 — 잠정 산식, P5.1 계약 표본 JSON에서 고정). URL ?inst=<serviceUid>:<key>는 이 값을 싣고 FE가 매 사전에서 다시 해석한다.
  // [C-r3 반영] 🔴 해시 입력 = **Collector 정리(redaction·truncate 128B) 후 BE 도착 값**(원본 아님). 마스킹으로 합쳐진 인스턴스는 한 항목이다(§2.4 사전) — 화면은 이를 분리해 보여 주지 않고 도움말에 적는다.
  //              display(앞 8자)는 표시 전용 — 충돌 가능해 URL·필터 키로 쓰지 않는다. 원문 id는 여전히 내지 않는다(§2.2). 사전 예산 영향 +0.68 MiB(§2.4)

// ── event: snapshot.chunk   (kind: "buckets", ≤ 1MiB, 순번은 dict chunk에 이어서)
{ "snapshotId": "s-91a2", "index": 2, "kind": "buckets",
  "buckets": { "1": [                                   // serviceId → 버킷 배열(오름차순), chunk 경계는 서비스·버킷 범위 단위
      { "b": 1788999940000, "pointsRev": 3, "statsRev": 5, "provisionalUntil": 1788999946000,
        "base":     { "observed": 412, "retained": 200, "delivered": 200,
                      "points": [ [120, 12.3, 0, 17, 2, "aeb3…", "9c1d…"], [640, 2140.0, 4, 17, 2, "0f2a…", "77b0…"] ] },
        "emphasis": { "observed": 5, "retained": 5, "delivered": 5,          // [X-r1 정정] base.observed = 이 버킷 전체 관측 = stats.count(412) · emphasis.observed = 그 중 강조 조건 충족 수(부분집합, 5)
                      "points": [ [880, 31.0, 9, 17, 2, "b81c…", "5e0a…"] ] },   //              → "관측 m"은 Σ stats.count 한 벌이지 base+emphasis 합(417)이 아니다
        "stats":    { "count": 412, "http5xx": 4, "spanError": 5, "slow": 1, "p50Ms": 18.2, "p95Ms": 210.4, "p95Approx": true,
                      "maxMs": 2140.0, "hist": [0,3,41,120,180,50,12,4,1,1,0,0,0,0,0], "histOverflow": 0, "lateArrivals": 0,
                      "minMs": 3.1, "sumMs": 7500.4 } } ] } }
                      // hist[15] = 집계 슬롯 P95_BOUNDS 15칸 그대로 노출 [UX-r1 반영] — 브러시 "관측 약 m"의 지연 범위 근사·5분 p95 합산용. 점당 60B 추가는 stats에만(버킷당 1회)
                      // [contract-r1 정정] 🔴 histOverflow는 hist[14]의 **사본**이다(`LiveSpanStats.copy()`가 같은 값을 두 번 싣는다) — hist 합계에 더하면 10초 초과 요청을 중복 계수한다. 표시용 보조 정보로만 쓸 것
                      // [contract-r1 정정] minMs·sumMs는 **코덱스가 지금 구현 중**(계약서 §6-D)이라 현재 실제 응답에는 없다 — 오면 평균 지연(`sumMs/count`)과 FE 게이지 p95의 실측 min/max 보정이 가능해진다. 안 오면 FE는 "게이지 p95는 근사, 버킷 p95와 소수점이 다를 수 있음"을 문서화한다

// ── event: snapshot.end
{ "snapshotId": "s-91a2", "chunks": 9, "checksum": "crc32:9f1a…" }   // FE는 여기서 한 번에 확정. 누락·불일치면 snapshot 재요청
                                                                     // [impl-r3 반영: D3] checksum 산식(정본 고정) = 그 snapshotId의 모든 snapshot.chunk 이벤트를 index 순으로, 각 이벤트의 `data:` 뒤 JSON을 UTF-8 바이트로 인코딩해 그대로 이어붙인 것의 CRC32(begin·end 이벤트 자체와 각 이벤트 말미의 `\n\n`은 포함하지 않는다). FE 계산식은 이와 동일해야 한다 — 7단계 계약 표본에 고정

// ── event: spans  (1초, id: "e7f1:184221")
{ "streamEpoch": "e7f1", "viewKey": "all|prod|http|300|sampling-v1", "sinceSeq": 184220, "seq": 184221, "serverTime": 1789000001000,
  "part": { "index": 0, "count": 1 },                    // [X-r1 정정] frame 2MiB 초과 시 같은 seq를 ≤4 part로 분할 — FE는 count개를 모아 한 번에 적용
  "dictDelta": { "from": 42, "to": 43, "services": [], "routes": { "1": { "18": "POST /orders" } }, "instances": {} },
                      // [contract-r1 정정] 🔴 services·instances는 예시가 축약해 왔을 뿐 **항상 실린다**(빈 배열/객체 가능 — 생략되지 않는다). FE가 services를 안 읽으면 신규 서비스를 영영 못 본다(계약서 §2.5)
  "removeServices": [],                                 // LRU 퇴출·삭제된 serviceId — 클라이언트는 그 버킷·사전을 버린다
  "replaceBuckets": { "1": [                            // 이 tick에 바뀐 버킷만(dirty 병합 1회), 각 버킷은 **통째 교체**(append 아님)
      { "b": 1789000000000, "pointsRev": 1, "statsRev": 1, "provisionalUntil": 1789000006000, "base": { … }, "emphasis": { … }, "stats": { … } },
      { "b": 1788999997000, "pointsRev": 4, "statsRev": 6, "provisionalUntil": 1789000003000, "base": { … }, "emphasis": { … }, "stats": { "…": "…", "lateArrivals": 2 } } ] },
  "statsRevision": { "1": [                             // 최근 5초 버킷의 집계만(점 없이) — statsRev로만 덮어쓴다
      { "b": 1788999996000, "statsRev": 3, "provisionalUntil": 1789000002000, "stats": { … } } ] },
  "live": { … },                                        // 바뀐 서비스만. [contract-r1 정정] 🔴 현재 BE 구현은 이 필드를 **항상 `{}`**로 보낸다(`LiveSpanFrames.java:107` 하드코딩) — 아래 shape는 §2.8·7단계에서 채울 **목표 설계**이며 지금은 오지 않는다(계약서 §2.5·§6-A). 화면은 빈 객체 분기로 열어 두고 값이 오기 전까지 §4.2 "동시 요청"·CPU 타일을 만들지 않는다
  "patterns": { "1": [ { "kind": "DURATION_BAND", "since": 1788999990000, "until": null,          // until null = 진행 중, 값이 오면 오버레이 종료 [UX-r1 반영]
                         // [contract-r1 정정] 🔴 현재 BE 구현은 이 필드도 **항상 `{}`**다(codec이 `LiveSpanRing.Bucket.patterns`를 직렬화하지 않는다) — **P5.4 범위**, P5.2 1차는 비차단이나 타입만 지금 확정하고 화면은 빈 배열 분기로 연다(계약서 §6-B)
                         "n": 84, "confidence": 0.7, "valueMs": 3000.0, "targetRouteId": 17, "targetInstanceId": null,
                         "rSquared": null, "errorShare": null, "trafficShare": null } ] },   // P5.4 이후. valueMs=띠 중심값, target*=강조 대상(없으면 null)
                      // [UX-r1b 반영] confidence = 0~1 **휴리스틱 점수**(규칙별 산식은 PATTERN_RULES_V1 상수와 함께 P5.4에서 확정) — 통계적 신뢰도·R²가 **아니다**. 화면은 "신뢰도"라 부르지 않는다
                      //              rSquared = LATENCY_TREND의 회귀 적합도(0~1, 그 kind만 값·나머지 null) · errorShare = ERROR_CONCENTRATION 대상 route/인스턴스의 오류 점유율(0~1) · trafficShare = 같은 대상의 트래픽 점유율(0~1, 분모) — 그 kind만 값·나머지 null. 화면은 null인 값을 추정해 만들지 않는다(§4.4)
  "pressure": { "arenaPressure": 0, "serverKeepRatio": 1.0, "clientKeepRatio": 1.0 } }
                      // [contract-r1 정정] 🔴 arenaPressure는 **이 tick 구간 안에서 발생한 압박분**이어야 한다(계약 대조 C) — 현재 구현(`LiveSpanRing.Counters.arenaPressure`, `AtomicLong.incrementAndGet()`, 리셋 없음)은 **누적 총합**을 그대로 싣고 있어, 정의대로 두면 서버 기동 후 압박이 한 번이라도 있으면 배지가 영구 ON + `control{degraded}`가 매초 무한 발송된다. 구간 값과 누적(진단용) 값을 둘 다 쓰려면 필드를 분리한다(예: `arenaPressureDelta`/`arenaPressureTotal`). BE 정정 전까지 FE는 `control{degraded, reason:"arena_pressure"}` 수신 시 일정 시간(예: 10초)만 배지를 켜는 방식으로 우회(계약서 §6-C)

// ── event: heartbeat  (5초, 데이터 없을 때 — id 없음)
{ "ts": 1789000006000, "lastSeq": 184221 }

// ── event: control  (id 없음)
{ "type": "reject",  "code": 403, "errorCode": "APM_VIEW_FORBIDDEN",              "retryable": false }
{ "type": "reject",  "code": 429, "errorCode": "APM_LIVE_TOO_MANY_CONNECTIONS",   "retryable": true,  "retryAfterMs": 15000 }
{ "type": "paused",  "code": 200, "errorCode": "APM_LIVE_SNAPSHOT_QUEUED",        "queuePosition": 3 }
{ "type": "degraded", "clientKeepRatio": 0.25, "reason": "connection_queue" }   // reason: connection_queue | frame_limit | arena_pressure [UX-r1 반영] — 배지 문구 분기용
{ "type": "epochChanged", "streamEpoch": "a930" }
```

**클라이언트 병합 규칙** 🔴 `[C-r2 반영]`
1. `streamEpoch` 또는 `viewKey`가 다르면 전부 버리고 snapshot부터. `spans`는 **`sinceSeq == 마지막 적용 seq`일 때만 적용** — 아니면 `seq ≤ 마지막`이면 무시(겹침), 크면 **재생 요청(재접속 + `sinceSeq`) 또는 snapshot**(건너뛰기 금지). `[impl-r3 반영: D2]` 🔴 **`Last-Event-ID: epoch:seq`는 한 단계 되감아 해석한다** — 서버는 이를 `sinceSeq = seq−1`로 보고 **seq 전체를 재전송**한다(멀티파트 중간 part에서도 SSE의 `id:`가 갱신되므로, 그 파트가 실린 seq가 끝까지 갔다는 보장이 없다). 재전송된 seq는 이 규칙(`seq ≤ 마지막이면 무시`)이 흡수해 멱등하다. 명시 쿼리 `sinceSeq`는 "마지막으로 완전히 적용한 seq"이므로 되감지 않는다.
2. snapshot은 `begin`~`end`를 모아 `end`의 chunk 수·체크섬이 맞을 때 **한 번에** 확정. 확정 전 도착한 `spans`는 버퍼(상한 30개)에 두고 확정 후 `sinceSeq` 규칙으로 적용. `[impl-r3 반영: 6단계 검수 정본 반영 ①]` 🔴 **snapshot 축소·재시작 계약**: 전송량 상한(§3.3) 초과 시 서버는 `snapshotKeepRatio`를 낮춘 **새 `snapshotId`로 `begin`부터 다시** 보낸다(선행 신호로 `control{degraded, reason:"frame_limit"}` 1건 발행) — 최대 **3회**까지 재시도하고 시도마다 `transferred` 바이트는 **누적**하며(회선 실제 전송량 유계), 제어 메시지용으로 **1 KiB**를 별도 예약한다. 한계(3회)에 도달해도 상한을 넘으면 그 연결은 **503으로 거절·종료**한다(재접속 시 새 snapshot). 🔴 **FE는 새 `snapshot.begin`이 도착하면 직전 미완 snapshot의 청크 버퍼를 즉시 폐기하고 새 `snapshotId`로 다시 모은다** — `end` 없이 끝난 snapshotId는 절대 확정하지 않는다(구 계약대로 "먼저 받은 snapshotId 하나만 모은다"고 구현하면 두 시도의 chunk가 섞이거나 영원히 `end`를 못 받는다). **이 항목은 UX 정본(`devdesign_apm-realtime-ux.md`)에도 알릴 것** — 클라이언트 구현 세부이지 화면 요구는 아니지만 FE 상태 머신에 직접 영향
3. `replaceBuckets`의 버킷은 `(serviceId, b)` 키로 **통째 교체**하되 `pointsRev`가 작으면 무시(동봉 stats는 `statsRev` 비교). 창(`now − windowSeconds`) 밖 버킷은 폐기.
4. `statsRevision`은 `statsRev`가 클 때만 해당 버킷의 `stats`를 덮어쓴다(점은 유지).
5. `dictDelta.from`이 가진 `version`과 다르면 사전을 못 믿는다 → 재접속(snapshot). `removeServices`는 즉시 반영.
6. 집계·게이지는 `stats`에서만 읽는다. 점 개수로 TPS를 세지 않는다(표본이다). `p95Approx`면 "약" 표기.
7. `now < provisionalUntil`인 버킷은 "잠정"으로 표시(게이지 최신 칸은 흐리게). 그 뒤에도 늦은 수정은 온다(`lateArrivals`).
8. 배지 `displayedCount/observedCount` `[X-r1 정정]`: **`observedCount = Σ stats.count`**(창 안 버킷), **`displayedCount` = 실제 그린 고유 `(traceId, spanId)` 수**(base·emphasis 양쪽에 있는 점은 한 번 — 강조 모양 우선). `base.observed`는 `stats.count`와 같은 값이고 `emphasis.observed`는 그 부분집합이라 **둘을 더하지 않는다**. `delivered` 합·`clientKeepRatio`·브라우저 솎음은 툴팁의 단계별 보조 정보다. ⚠️ 브러시 영역의 "전체 관측 수"는 1초 집계 합이라 **초 경계 안의 부분 영역은 정확하지 않다** — 표 제목은 "표시 표본 n / 관측 약 m".

### 3.3 상한·폐기 규칙(요약) `[C-r2 반영]` — 열 "종류"가 **수신 거절 / 멱등 / 표시 축소 / 연결**을 가른다(partialSuccess에는 수신 거절만)
| 규칙 | 값 | 넘으면 | 종류 |
|---|---|---|---|
| 버킷 reservoir(base) | 200점/서비스/초 | 균등 교체, `observed/retained` 노출 | 표시 축소 |
| 강조 계층 | 50점/버킷 · 20k/서비스 · 50k 전역 | 초별 균등 교체 | 표시 축소 |
| 전역 arena | 1.4M 슬롯(60.08 MiB, 세그먼트 lazy 할당·상한 고정), 잔여 **3%** ∨ 계층 예약(base 1,300k·emphasis 50k) 도달 시 압박 `[X-r1 정정]`(🔴 "잔여 3%"는 산술상 도달 불가 — 실질 트리거는 계층 예약뿐 `[impl-r2 반영]`) | 최다 사용 서비스부터 용량 반감·무작위 축소·`pointsRev` 상승·`arenaPressure` | 표시 축소 |
| dedup 용량 `[impl-r2 반영]` | `app.apm.live.spans.dedup.capacity` 기본 90,000(공유 슬롯 풀·64샤드 만료 FIFO, 상주 4.12 MiB) — L3(1,500/초×60초)와 정확히 겹쳐 여유 0 | 포화 시 배치 전체 **503**(`dedupFull`) | 수신 거절(요청 단위) |
| 사전 바이트 예산 `[X-r1 정정]` | 20 MiB(`dict-budget-mib`) | 신규 route·인스턴스 등록 거부 → `__other__`·`dictBudget` 계수 | 표시 축소 |
| 미래 점 | `endTs > now + 5s` | 폐기·`future` 계수 | 수신 거절 |
| 과거 점 | `endTs < now − window` | 폐기·`stale` 계수 | 수신 거절 |
| 중복 | 60초 내 같은 `(traceId, spanId)`(전체 키 비교) | `deduplicated` 계수, **200 성공** | 멱등 |
| 값 검사 실패 | route 템플릿 아님·error.type 식별자 아님 | `__unsafe__` 치환·`unsafeValue` 계수(집계 유지) | 치환(거절 아님) |
| 배치당 스팬 수 · 본문 `[R-P5 반영: 실측 §14·§3.10]` `[C-r3 반영: §2.3.0 정본]` `[R-P5b 반영: §6.2]` `[impl-r1 반영]` | **1,000**(BE 수용 — Collector 1,000과 독립) · **해제 후 2,097,152 B + 압축본 2,097,152 B**(정확 바이트 · 독립 상한 2개 — 압축본은 gzip 폭탄의 회선 읽기 유계용 · 무압축은 해제 후 상한만 · gzip 아닌 인코딩 415 · 실측 최악 1,000스팬 = 해제 후 **1.337 MiB**·gzip 저압축 **572.4 KiB** — v4의 압축본 512 KiB는 이 정상 입력을 거절해 2 MiB로) | **본문 바이트 초과**: 413(배치 전체·`bodyTooLarge`) · **스팬 수 초과(1,001번째부터)**: **413이 아니라 partialSuccess(`batchOverflow`) 부분 거절**이 정본(이력: 1단계는 이 규칙이 아직 없어 임시 배치 전체 413 — 2단계에서 교체 완료) | 수신 거절 |
| 문자열 길이 `[R-P5 반영: 실측 §14.1 — 단위 바이트]` `[R-P5b 실측 ✅ §5.3]` | route **256바이트**·instance 128·error.type 64·service 128(Collector `truncate_all`도 바이트 기준이되 **문자 경계에서 자른다** — 한글 route 255 B/87자, U+FFFD 0) | 잘라서 `__truncated__` 표시(자원 보호, PII 제거 아님) | 치환 |
| 전송 전 차단(Collector) `[C-r3 반영]` `[R-P5b 실측 ✅ §8]` | `filter/live-safety` 조건 중 하나라도 참(events/links 잔존·이름/scope/schema 잔존·허용목록 밖 키·타입·형태 위반) — 정상 오탐 0 · 🔴 조건 단위 fail-open(§2.1 ⑤ 불변식·알람) | Collector에서 drop · `otelcol_processor_filter_spans_filtered{filter="filter/live-safety"}` 계수(라벨에 타입 접두) → 수집기 탭 "전송 전 차단" | 수신 거절(Collector 측 — BE에 오지 않음) |
| 카나리아 `[R-P5 반영: 실측 §6]` `[C-r3 반영: 후조건 검사]` | 스팬에 잔존 필드·허용목록 밖 키·타입·길이·형태 위반 존재 | 살리고 `slimBypassed{reason}` 계수(원문 미기록) → 수집기 탭 경고(정본 yaml·gate 누락 의심) | 경고(거절 아님) |
| 토큰당 rps `[impl-r2 반영: 프로퍼티 경로]` | `app.apm.live.spans.rate-limit.{max-requests-per-second-per-token,burst,max-buckets}` 기본 10/burst 20/맵 2,000 | **실제 429**(`APM_LIVE_RATE_LIMITED`) — 🔴 LRU 맵 포화 시 신규·재기동 토큰 잠금 위험(4단계 검수 🟡 Y1, 완화는 §2.3 해당 행) | 수신 거절(요청 단위) |
| tick frame | 2MiB/view | base 1/k 솎음·`serverKeepRatio` → 그래도 초과면 같은 seq ≤4 part 분할 → 그래도 초과면 점 생략·`statsRevision`만(`degraded frame_limit`) `[X-r1 정정]` | 전달 축소 |
| 재생 로그 | 16MiB/view·10초 | 오래된 것부터 폐기 → 재접속은 snapshot | 연결 |
| SSE 고유 바이트 전역 `[X-r1 정정]` | 96 MiB(로그 64 + in-flight 16 + 퇴출 보유 8 + degraded 직렬화 8) — 참조 수 무관 1회 계수 | 퇴출 frame을 가장 오래 붙잡은 연결부터 종료 · degraded 직렬화 슬롯 4 초과는 종료 | 연결 |
| 연결별 송신 큐 | 8MiB 또는 5초분 | 그 연결만 솎음(`degraded`) → 그래도 넘치면 종료(`reject 429 retryable`) | 연결 |
| 쓰기 deadline | 2초(목표, writer 반환 실측) | 그 연결만 종료 | 연결 |
| 연결 수 `max-connections` | **활성 40 + 대기 10**(사용자당 4) | `control{reject, 429}` | 연결 |
| snapshot 동시 생성 · 대기 · chunk · `begin` · 전체(전송량) | 2 · **10** · 1MiB · 64 KiB · 32MiB(5분)/96MiB(15분) `[X-r1 정정: 대기 상한을 §2.5와 통일(20→10), begin 상한 신설]` | `control{paused}` 대기(11번째부터 `reject 429`) / `snapshotKeepRatio` | 연결 |
| 숨김 탭 | 5분 | 클라이언트가 닫고 복귀 시 snapshot(서버 상한은 별도 유지) | 연결 |

**거절 사유 한 벌 정리** `[impl-r1 반영]` `[impl-r2 반영: 10종·14종으로 정정]`(식별자는 구현 enum 이름 — 정본은 코드) — 두 enum이 서로 다른 층을 센다. 섞지 않는다.

- **스팬 단위**(`LiveSpanRejection`, **10** `[impl-r2 반영: 11→10]` — 표본 탈락·표시 축소·중복은 여기 없다): `batchOverflow`(배치당 1,000 초과분, 위 "배치당 스팬 수" 행) · `outsidePopulation`(kind≠SERVER·`http.method` 없음 등 모집단 밖) · `malformed`(ID·시간 등 값 규격 위반) · `timeReversed`(종료 < 시작) · `metadataUnavailable`(서비스 메타 미확인 — TTL 경계 실패·hard expiry 갱신 실패, `[impl-r1 반영]` **배치 단일 deadline 초과분도 이 사유로 거절**한다 — §2.3.1 "배치 단일 deadline") · `serviceUnknown`/`servicePending`/`serviceHidden`(미등록/승인대기/숨김 — REJECTED 상태도 `serviceUnknown`에 합류) · `future`/`stale`(§2.4 시간 규칙). 🔴 **`instanceBudget`은 이 목록에 없다**(`[impl-r2 반영: §2.4·§3.3 자기모순 해소 — §2.4가 정본]`) — 인스턴스 사전 예산(64) 초과는 수신 거절이 아니라 **표시 축소**다(`__other__`로 귀속, 스팬은 정상 집계). `dictBudget`(사전 바이트 예산 초과, 위 표 "사전 바이트 예산" 행)과 함께 **표시 축소 계수 두 벌**로 묶는다 — 둘 다 4단계 arena 통합 이후 계수 대상. `LiveSpanRejection.instanceBudget` enum 상수 자체는 4단계 구현에서 **미사용으로 유지**돼 있다(4단계 검수 🟡 Y8 — 계약 표면에서 지우거나 `@Deprecated` + 주석으로 이력만 남길 것).
- **요청 단위**(`LiveIngestCounters.Reason`, **14** `[impl-r2 반영: 12→14]` — 1단계 10 + 3단계 2 + 4단계 2): 1단계 10종 `bodyTooLarge`·`compressedTooLarge`·`unsupportedEncoding`·`malformed`(JSON 문법 오류, 본문 400)·`tooManySpans`(**이력** — 1단계의 임시 "배치 전체 413" 시절 사유. 2단계에서 스팬 초과가 `batchOverflow` 부분 거절로 바뀐 뒤 이 값을 `reject()`하는 코드는 없다. enum 값은 하위 호환을 위해 남아 있다)·`disabled`·`busy`(admission 4 초과)·`unauthorized`·`readTimeout`·`internalError` + 3단계 추가 2종 `tokenRevoked`·`metadataUnavailable`(토큰 항목 자체가 없어 **배치 전체**의 인증 상태를 확인할 수 없는 503 — §2.3 "503의 정의". 스팬 단위 동명 사유와 이름은 같지만 **다른 층**이다) + **4단계 추가 2종** `[impl-r2 반영]` `dedupFull`(`APM_LIVE_DEDUP_FULL` — dedup 용량 소진으로 배치 전체 503, 현재는 `busy`에 합류돼 있던 것을 분리해 "적재 초과"와 "dedup 포화"를 구분한다) · `storageUnavailable`(`APM_LIVE_STORAGE_UNAVAILABLE` — arena·집계 저장소 초기화·복구 실패로 배치 전체 503, 현재는 `internalError`에 합류돼 있던 것을 분리한다). 🔴 **콜드 스타트(최초 배치가 유발하는 저장소 최초 할당)는 `internalError`로 세지 않는다** — §7.1 4단계 행의 기동 시 선할당이 완료되면 이 지연 자체가 사라지지만, 그 전이거나 실패했을 때는 `storageUnavailable`로만 계수해 "내부 결함"과 "예정된 초기화 지연"을 구분한다(4단계 검수 🟡 Y5 — 최대 53.710ms의 주 후보로 지목된 콜드 스타트가 현재는 `internalError`로 잡히고 있었다).
- 🔴 **`parentSpanId`가 빈 문자열·`null`·필드 자체 부재인 경우는 전부 "부모 없음"**(루트 스팬)이며 거절이 아니다 — 값이 있는데 길이(16)·hex 형식이 틀린 경우만 `malformed`. 최초 구현은 빈 문자열·`null`도 길이 불일치로 보아 `malformed` 거절했으나(2~3단계 검수 🟡 Y3), 정본 yaml Collector는 proto3 기본값을 생략해 필드가 아예 없고(§2.3 "다른 Collector 설정 방어"와 같은 이유), `emitUnpopulated`를 켠 protojson 계열 생산자는 `""`를 명시적으로 채운다 — 어느 쪽이든 루트 스팬의 정상 신호이므로 셋 다 수용한다.

### 3.4 권한·라이선스·보안 — 네 축 `[C-r1 반영]`
| 축 | 판정 | 비고 |
|---|---|---|
| 수신 | 수신 토큰 **kind=COLLECTOR ∧ scope=ingest** + `Feature.APM` | `@LicenseExempt` + 직접 판정, ArchUnit 목록 등재, `SecurityConfig` permitAll 추가, 만료는 **실제 403**(즉시 손실, 저장 경로와 동일) |
| 화면 | 사용자 세션 + `applicationMonitoring/apm` **view**(`ApmAccessChecker.requireRead`) | 관리자 축 불필요(원문 노출 없음 — route 템플릿뿐). 실패는 `control{reject,403}` |
| 설정(임계·상한 조정 EP가 생기면) | **`apm.edit`** | P5 첫 출시엔 설정 EP 없음(프로퍼티) |
| 라이선스 | `Feature.APM` 하나(Q14) | 별도 판매 권리가 확정되면 그때 `Feature` 분리 |
- 🔴 `serviceUid/env` 필터는 **권한 경계가 아니다** — 볼 수 있는 사람은 전 서비스를 볼 수 있다(현 APM 권한 모델과 동일).
- 🔴 액세스 토큰은 쿼리 금지, `visitorId`만 쿼리. 500 금지(처리 위치 3단 — §2.3). 503은 "일시적 처리 불능" 정의(§2.3)를 따른다 `[C-r2 반영]`. 스트림 경로의 403은 `LiveStreamRejectionAdvice`가 `control`로 변환(§2.5).

---

## 4. 화면 설계 — 계약·원칙만. **화면 상세(레이아웃·문구·상호작용·색·접근성)는 UX 정본 `devdesign_apm-realtime-ux.md`에 위임한다** `[UX-r1 반영]`

> 이 절이 정하는 것은 데이터 계약과 어기면 틀리는 규칙뿐이다. UX 정본은 이 계약을 바꾸지 않으며, 바꿔야 할 것은 그 문서 §6 "정본 요청"으로 올라와 여기 `[UX-r1 …]`로 반영된다.

### 4.0 화면 위치 — 새 사이드바 메뉴 "실시간 관제" `[UX-r1 반영]`
- 경로 **`/application-monitoring/realtime?tab=active|xview`**(8번째 메뉴), 폴더 `pages/application-monitoring/realtime/`, 도움말 `page_guide.apm_realtime`, `constants/page-guide.ts` 매핑 1줄. v1의 `overview/realtime/`(가칭)은 **폐기** — 근거: 개요 Live 패널(10초 `/apm/live/stream`)은 §2.5가 "그대로 둔다"고 확정했고, 같은 화면에 1초 스트림을 하나 더 붙이면 한 사용자가 SSE 두 개를 붙든다(연결 상한 문제 — ✅ `apmLiveDisplay.ts` 주석이 같은 이유로 별도 연결을 금지). wall 모드는 독립 화면이어야 하고, 메뉴 단위 질문("지금 이 순간" 1초 vs 개요 "전체적으로 괜찮은가" 5분+1분)이 다르다. 개요 Live 패널에는 "실시간 관제 열기 →" 링크 한 줄만.
- 화면 상태는 **URL query**로 — 키 목록 정본은 UX 정본 §0 표(`tab`·`svc`·`env`·**`win`**·`at`·`sel`·`pt`·`route`·`inst`·`mode=wall`) `[UX-r1b 반영: v2의 `window`→`win`, `trace`→`pt`(`traceId:spanId`)로 통일]`. `win`(초, = payload `windowSeconds`) 변경은 `viewKey` 변경이라 재접속(§2.5).
- 🔴 **리마운트 전제 정정** `[UX-r1b 반영]`: 이 앱의 페이지 전환 key는 `location.key`가 아니라 **`location.pathname`**이다 — ✅ `layouts/app/App.tsx:240` ``key={`css-transition-${location.pathname}`}``, 주석 235~239("`location.key`는 같은 경로의 쿼리스트링 변경에도 매번 바뀌어 리마운트시켰다 → pathname으로 고쳐 같은 경로 내 쿼리 변경은 리마운트하지 않는다"). 따라서 **같은 경로 안의 query 변경은 페이지를 리마운트하지 않는다.** 상태를 URL에 두는 이유는 리마운트가 아니라 **공유·새로고침·뒤로가기**에서 같은 화면이 나와야 하기 때문이며, 로컬 `useState`는 접힘·스크롤·hover 같은 "보는 방식"에만 쓴다. SSE 연결은 페이지 컴포넌트가 소유하고 재연결은 `viewKey`(`svc`·`env`·`win`) 변경 때만 한다(UX §0). ⚠️ 메모리 `fe-page-remount-on-navigate`의 "navigate마다 리마운트" 서술은 구 동작이라 갱신 대상(v2의 인용도 그 구 서술에 기댄 것이었다).
- P5.6 비동기 모니터링은 이 메뉴가 아니라 **트레이스 상세 확장**(`/traces/:traceId?tab=waterfall|async`) — §4.5.

### 4.1 실시간 X-View(P5.2) — `pages/application-monitoring/realtime/ApmXViewTab.tsx` `[C-r1 반영: 표본 표시·버킷 교체·클릭 문구·appendData 폐기]` `[UX-r1 반영: 경로]`
- **차트**: ECharts scatter, `large: true`·`progressive`(✅ `lib/echarts/apmScatter.ts`에 이미 있음 — 옵션 빌더를 `buildApmScatterOption`에서 스트리밍 변형 `buildApmLiveScatterOption`으로 분기). 계열: 기본 계층 OK·SLOW·ERROR 3개 + 강조 계층 SLOW·ERROR 2개(**다른 기호**). RPC 계열은 P5.5 `[C-r2 반영]`. 오류 색 기준은 **`http5xx ∨ spanError`**(툴팁에 두 축 병기). 점마다 색을 바꾸면 large 모드가 깨진다(파일 주석 ✅).
- **표본 표시 문구** `[C-r2 반영]`: 화면은 "서비스·초별 **층화 표본**"임을 도움말에 쓴다 — "전체 15분 요청의 단일 균등 표본"이 아니다(초마다 200점 상한이라 트래픽이 많은 초일수록 포함 확률이 낮다). 배지 `displayedCount/observedCount` 상시.
- **갱신 방식** `[C-r1 반영]`: v0의 `appendData`는 폐기 — 지울 수 없고 `dataset`과 함께 못 쓰며 **버킷 교체 계약과 맞지 않는다**. 점은 `useRef`의 버킷 맵(`Map<b, TypedArray>`)에 두고, 1초마다 **창 안 버킷을 이어 붙인 typed array로 `setOption({series:[{data}]}, {replaceMerge:['series']})`** 재구성. zoom·brush·선택 상태는 옵션 재구성 시 **보존 계약**(`dataZoom` 상태를 읽어 다시 넣음, 선택 spanId 집합 유지). 프레임 비용은 **R4가 렌더 방식·상한 확정 전 필수**(300k/500k 초기 snapshot 파싱·typed array 변환·ECharts 복사·브러시·표 정렬까지 합산, 100ms 하나로 합격 선언 금지).
- 화면 기본 창 **5분**(`snapshotSeconds`), 15분은 토글(`viewKey`가 바뀌므로 **재접속 + 새 snapshot**, 커서 재생 불가 — §2.5).
- **브러시 → 목록**: 선택 범위(ts·duration)를 클라이언트 버킷에서 필터해 `DmoveTable`로 — 서버 왕복 없음. 🔴 표 제목은 **"선택 영역의 표시 표본(n / 관측 m)"** — 전체 요청 목록이라 부르지 않는다. 열: 시각·지연·상태·계층·서비스·route·인스턴스·traceId.
- **점 클릭 상태 머신** `[C-r1 반영]` `[UX-r1 반영: 전이 문구 채택, 내용 불변]`: 모든 점에 traceId가 있다.
  ```text
  [unknown] --클릭--> [checking: GET /apm/traces/{traceId}]
      ├─ 업무 성공(envelope OK) ∧ detail 유효                                    [UX-r1b 반영: v2 "200 → stored" 정정]
      │     ├─ spans에 선택 spanId 있음 → [stored]             : 요약 + "트레이스 상세 열기(?span=<spanId>)"
      │     └─ spans에 없음             → [stored.spanMissing] : "트레이스는 찾았지만 이 스팬은 응답에 없음(잘림·적재 중 가능)" + "트레이스 상세 열기" [다시 시도]
      ├─ APM_TRACE_NOT_FOUND, 점 나이 < 20초 → [notFound.pending] : "현재 저장된 트레이스를 찾지 못함 — 저장 판정 중일 수 있음(tail 10초 + 적재)" [다시 시도]
      ├─ APM_TRACE_NOT_FOUND, 그 외        → [notFound]         : "현재 저장된 트레이스를 찾지 못함" + "정상 요청은 일부만 저장됩니다" [다시 시도]
      ├─ 403                        → [forbidden]         : 권한 문구(재시도 없음)
      └─ 그 밖의 오류               → [error]             : ApmQueryError 경로 [다시 시도]
  ```
  🔴 **HTTP 200 자체를 `stored`로 보지 않는다** `[UX-r1b 반영]` — 기존 envelope 규약(200 + JSON `code`)대로 **업무 성공 + 유효한 detail**일 때만이며, 점의 정체성은 `(traceId, spanId)`라 trace가 있어도 그 span이 응답에 없으면 `stored.spanMissing`(같은 trace의 여러 HTTP SERVER 점을 가른다). 🔴 **`notFound`는 종착 상태가 아니다**(retryable — 어느 나이에서도 "다시 시도"). 🔴 **20초로 "미저장 확정"을 선언하지 않는다**(해시 재현은 확률 정책의 선택만 예측하고 실제 저장을 증명하지 못한다). 확정되는 전이는 `→ stored`·`→ stored.spanMissing`뿐. 점 자체의 사실(라이브 튜플)은 조회 전에 먼저 그린다(저장 여부와 무관). 패널 구성·문구는 UX §2.5.
- 배지: 버킷별 `observed/retained/delivered`(툴팁)·`arenaPressure`·`serverKeepRatio`·`clientKeepRatio`·브라우저 상한 솎음·`snapshotKeepRatio`·연결 상태 3단(§2.5)·"실시간(종료→화면 약 N초, 권장 설정 시)" — N은 실측 p95 `[C-r2 반영]` `[R-P5 반영: 실측 §3.6·§10.3]`: **완료→캡처(링 직전)** p95는 고트래픽(600 SERVER/초) **1.23초(BSP 1,000)~1.52초(BSP 5,000)**, 저트래픽(10/초) **권장 설정(`OTEL_BSP_SCHEDULE_DELAY=1000`) 시 1.59초** — `[C-r3 반영]` 전부 규격 준수 재측(실측 §10.3)이며 v3의 585/1,054ms(강제 flush 하네스)는 쓰지 않는다. 완료→링·SSE·프록시·화면은 미측정(R-P5″·R4)이라 첫 출시 문구는 **"약 2초(권장 설정 시)"를 잠정**으로 두고 R-P5″ 완료→화면 p95로 교체한다 — "약 2초 보장"이라고는 어디에도 쓰지 않는다. 🔴 "권장 설정 시"를 빼면 문구가 거짓이 된다 — BSP 기본값(5,000ms)의 저트래픽 서비스는 링 도달 p95만 5.7초다. 화면 도움말에 "SDK 설정에 따라 다르다"를 적고 설치 가이드가 그 설정을 안내한다(§2.2).
- **문구 규칙**(Live 설계 §1과 같은 정신): "초 단위"라고 쓰지 않는다. 실측 뒤 숫자를 박는다. "정상 2%"를 쓰지 않는다 → "정상 요청은 일부만 저장됩니다".

### 4.2 실시간 대시보드(P5.3) — 관제실 모드 `[C-r1 반영: 액티브 합산·freshness]`
| 부품 | 데이터 | 갱신 | 차트 |
|---|---|---|---|
| 속도계 TPS·p95 | `stats` 1초(전체 관측) | 1초 | ECharts `gauge`(바늘형). ✅ `components/Chart/custom/CustomGaugeChart.tsx`는 바늘 없는 진행 링이라 그대로는 제니퍼 속도계가 아니다 → `lib/echarts/apmGauge.ts` 옵션 빌더 신설 + `ApmChartCard`로 감쌈(Q11). p95는 **"약 N ms"**(15칸 histogram 근사, `p95Approx`) `[C-r2 반영]` |
| 이퀄라이저(서비스별 처리량) | `stats[svc].count` | 1초 | `bar`, 순서는 **고정(서비스명 또는 사용자 정렬)**. `realtimeSort`는 **옵션·기본 꺼짐** `[UX-r1 반영]` — 매초 자리 이동은 "내 서비스 찾기"와 충돌. 500ms `animationDurationUpdate` |
| 오류율 게이지 | 기본 `http5xx/count`(RED 비교 축), 토글 `spanError/count` — 10초 이동 창 | 1초 | gauge. 참고선은 **`config.errorRateThresholdPct`**(전역 `ERROR_RATE` 알람 임계 — §3.2, `null`이면 선 없이 값만) `[UX-r1b 반영: v2의 "`useApmEffectiveRules` 재사용"은 서비스별 규칙 조회(`GET /apm/services/{uid}/alert-rules`, requireRead)라 전역 참고선 공급 경로가 아니었다 — 서비스 단일 뷰·타일 툴팁에서만 그 EP를 쓴다]` `[C-r2 반영]` |
| 액티브 | §2.6 a — `live.active{value, observedInstances/expectedInstances(추정), asOf}` | 10~60초 | 숫자 타일 + "m/n 인스턴스(추정) · N초 전". 관측 0이면 "관측 없음"(0 아님) |
| CPU/힙 | §2.8 — `cpuPct{avg,max}`·`heapPct|null` | 10~60초 | 미니 게이지 + "약 1분 이내" · heapPct null이면 "측정 불가" |
| 전체화면·다크 | — | — | `requestFullscreen` + 사이드바 숨김 + theme slice 다크 강제(복귀 시 원복). URL `?mode=wall` |
- 최신 1초 칸은 `now < provisionalUntil` 동안 흐리게(잠정값). 5분 p95 표시는 1초 p95의 평균이 아니라 **histogram 합산 후** 계산 `[C-r2 반영]`.

### 4.3 액티브 요청 목록(P5.3b, Java opt-in) — 독립 게이트 `[C-r1 반영: 종료·유실 복구 요건]`
- 데이터 소스가 확장 jar(§2.6 b)일 때만 활성. 열: 서비스·인스턴스·route(시작 시점에 미확정이면 "결정 중" → 종료 스팬으로 보정)·시작·**경과(클라이언트 1초 타이머)**·traceId·spanId.
- 🔴 **종료 매칭은 `(traceId, spanId)`** — traceId만으로 지우면 같은 trace의 다른 SERVER 요청을 잘못 지운다. 종료 스팬이 안 오는 경우(전송 유실·표본 아님 — 라이브 수신은 전량이므로 reservoir와 무관하지만 Collector 유실은 있다)를 위해 **instance epoch(에이전트 기동 id)·주기적 상태 확인(확장이 30초마다 진행 중 목록 요약을 보냄)·TTL**을 둔다. TTL 초과는 **"종료 확인 불가"**이지 "완료"가 아니다. start/end 역전·중복·앱 crash·재시작은 instance epoch로 가른다.
- 🔴 시작 이벤트는 **`/v1/logs`로 보내지 않는다** — ✅ 현 `/v1/logs`는 수용 후 폐기(232행)이고 일반 logs 파이프라인은 5초 batch·디스크 큐라 2초 목표와 맞지 않는다. 별도 경로(`POST /apm/otlp-live/v1/events` 또는 라이브 traces 배치에 0-길이 마커 스팬)를 R5 시제품에서 고른다.
- 🔴 `onStart`는 앱 요청 스레드에서 동기 호출된다 — 확장은 **비블로킹 큐에 넣기만** 하고 전송은 별 스레드.
- 확장 미설치 서비스는 "이 서비스는 동시 요청 수만 제공합니다".

### 4.4 패턴 라벨 4종 · 이상 기준선(P5.4) `[C-r1 반영: 관측 특징 문구·EWMA 우선·최소 건수]`
🔴 **패턴은 원인이 아니라 "관측 특징"이다.** 라벨 문구에 "GC"·"잠금" 같은 원인을 쓰지 않는다. 우리 휴리스틱 4종은 **JENNIFER 공식 페이지의 4패턴과 같지 않다**(문서·도움말에 명시).

| 라벨(코드) | 정의(전체 관측 1초 집계·최근 60초·서비스별) | 화면 문구 | 오탐 방지 |
|---|---|---|---|
| `END_TIME_CLUSTER`(수직선) | **event-time**(`endTs`) 기준 1~3초 구간에 종료 점이 몰리고(구간 count ≥ 60초 평균의 5배) 그 점들의 시작 시각 분산이 큼 | "완료 시각 집중 관측 — 원인 확인 필요" | 최소 30건·도착 시각이 아닌 종료 시각·배치 전송 효과 배제 |
| `DURATION_BAND`(수평 띠) | duration 히스토그램에 좁은 피크(±5%)가 전체의 20% 이상 | "고정 지연 띠 관측(약 N ms) — 타임아웃·정상 polling 가능" | 최소 100건·10초 지속·route 분모 표시 |
| `LATENCY_TREND`(우상향) | p95의 60초 선형 회귀 기울기 > 임계 & R² ≥ 0.6 | "응답시간 상승 추세 관측" | 최소 30초·각 초 20건 이상·**`rSquared` 노출**(적합도 — `confidence`와 별개 필드 `[UX-r1b 반영]`) |
| `ERROR_CONCENTRATION`(오류 군집) | ERROR가 route 하나·인스턴스 하나에 80% 이상 **이고 그 route의 트래픽 점유율보다 30%p 이상 높음** | "오류가 route/인스턴스에 집중 관측" | 최소 20건 오류·분모 병기 — payload **`errorShare`(오류 점유율)·`trafficShare`(트래픽 점유율)** `[UX-r1b 반영]` |
- 임계는 **코드 상수 + 버전(`PATTERN_RULES_V1`)**, 초기 사용자 설정은 없다(Q11). 데이터로 보정한 뒤 설정화 여부 결정.
- 🔴 **자료구조 선행** `[C-r2 반영]`: 첫 출시 집계 슬롯(§2.4)에는 시작 시각 분산(`END_TIME_CLUSTER`)·route별 오류 분모(`ERROR_CONCENTRATION`)·±5% 지연 띠를 잴 촘촘한 histogram(`DURATION_BAND` — 15칸으로는 **불가**)이 없다. P5.4 착수 시 (a) 슬롯에 `sumStartOffset·sumSqStartOffset`(시작 시각 분산용 16B), (b) 서비스별 route×instance 오류/건수 60초 링(상한 200×64 → 희소 맵), (c) 60초 창 전용 로그 스케일 64칸 histogram을 **별도 힙 예산**으로 추가하고 R3를 다시 돈다. 첫 출시 슬롯에 미리 넣지 않는다.
- 계산 위치: BE 1초 tick에서 서비스별 집계 슬롯 위에서(수십 µs 수준 **추정**, R3에서 tick 시간 측정). 결과 `patterns[]`.
- **기준선** `[C-r1 반영]`: **1단계 EWMA**(설정 없이 즉시, 계절성 없음 — 1초 count·p95의 60초 EWMA와 분산, 편차 ±3σ에 "최근 대비 +x%"). **2단계 계절 기준선**은 `apm_metric_5m`에서 같은 요일·같은 5분 슬롯의 중앙값·MAD — 🔴 30일이면 같은 슬롯 표본이 **4~5개뿐**이라 미충족. **동일 슬롯 표본 ≥ 8(약 8주)** 이후에만 켜고 그 전엔 "기준선 학습 중". 비교는 **같은 길이·같은 모집단·같은 오류 정의**로(1초 p95를 5분 p95와 직접 비교하지 않는다 — 1초 값의 5분 이동 집계와 비교). MAD=0·결측·배포 직후(`deployment` 이벤트 30분)는 판정 보류. 계산은 SSE tick과 **분리**해 5분마다 캐시. EWMA도 **warm-up**(최소 5분 관측 전 "학습 중")이 필요하다 `[C-r2 반영]`. 🔴 "동일 슬롯 ≥ 8"은 **모델을 켜 보는 최소 게이트**일 뿐 오탐률 보증이 아니다(N12) — 같은 모집단·같은 오류 정의(§3.1 2축 중 하나 고정)·결측/배포/설정 변경 마스킹·MAD=0 처리를 P5.4 **backtest**로 확정한 뒤에만 사용자에게 보인다.
- 🔴 알람은 만들지 않는다. 패턴·편차는 **표시**다.
- payload `patterns[]`는 `until`(관측 종료 시각, `null`이면 진행 중 — 오버레이를 지울 시점)·`targetRouteId`/`targetInstanceId`(강조 대상, 없으면 `null`)·`valueMs`(`DURATION_BAND` 중심값)를 싣는다 `[UX-r1 반영]`(§3.2). `[UX-r1b 반영]` **`confidence`는 0~1 휴리스틱 점수**(규칙별 산식은 `PATTERN_RULES_V1`과 함께 확정 — 통계적 신뢰도·R²가 아니다. 화면은 "신뢰도"라 부르지 않고 도움말에 "휴리스틱 점수"로 적는다) · **`rSquared`**(`LATENCY_TREND`만, 나머지 `null`) · **`errorShare`·`trafficShare`**(`ERROR_CONCENTRATION`만, 나머지 `null`) — 화면은 `null`인 분모를 추정해 만들지 않는다(§3.2 예시). route별 오류 분모는 위 선행 자료구조 (b)에서 나온다.

### 4.5 비동기 모니터링(P5.6) — 트레이스 상세 확장, FE 단독 `[UX-r1 반영]` `[UX-r1b 반영: 정의 3층·"PRODUCER→CONSUMER" 확정 철회·요약 문구·출시 게이트]`
- **데이터 원천은 라이브가 아니라 저장된 트레이스(샘플)**다 — `ApmTraceDetailDto.spans[].{kind, links, offsetMs, durationMs, selfMs, parentSpanId, attrs.thread.*}`. BE 변경 0(✅ links는 `OtlpTracesReader.links`(리더 상한 128) → `TraceIngestPipeline.linksJson`(**적재 상한 32개/스팬**, 허용목록 통과 후 jsonb) → `maskLinks`로 이미 저장·조회되고, `thread.id/name`은 `ApmSpanAttrAllowlist`에 있다). 따라서 **P5.1 비의존, 선출시 가능**.
- **"비동기"의 정의는 3층으로 분리한다** `[UX-r1b 반영]` — v2의 "3종(같은 trace 안 links · PRODUCER→CONSUMER cross-trace links · 부모 종료 후 완료 자식)"은 **폐기**. 🔴 링크에는 **대상 스팬의 `kind`가 없다** — 다른 trace를 가리킨다는 이유만으로 "발행→소비"라고 확정할 수 없다.

  | 층 | 정의 | 데이터 근거 ✅ | 화면이 부르는 이름 |
  |---|---|---|---|
  | ① 관계 | `span.links[]`가 가리키는 다른 스팬. **같은 trace / 다른 trace는 분류 축이지 실행 방식이 아니다.** 부모(`parentSpanId`)를 가리키는 링크도 유효한 관계 | `Span.links{traceId,spanId,attributes}` | "연결된 스팬(같은 트레이스 i · 다른 트레이스 j)". "발행/소비" 라벨은 **대상을 조회해 kind가 PRODUCER/CONSUMER로 확인된 경우에만** |
  | ② 시간상 특징 | `childEnd > parentEnd + 허용 오차(1ms)` — 부모 종료 시각 이후에 끝난 스팬 | `offsetMs`·`durationMs`·`parentSpanId` | "부모 종료 이후 종료". 🔴 비동기의 충분조건도 필요조건도 아니다(부모 안에서 끝난 병렬 작업·다른 호스트 시계 오차) — **관측 특징**으로만. 고아·`rootMissing`·`cycleBroken`은 판정 제외 또는 "불확실" |
  | ③ 실제 실행 방식 | 어느 스레드·프로세스에서 실제로 병렬로 돌았는가 | **없다** — `thread.*`는 스팬을 *시작한* 스레드이고 DTO에 프로세스/인스턴스 식별자가 없다 | **주장하지 않는다.** "병렬 실행"·"스레드 N개" 문구 금지. 정확한 레인은 BE 필드(§7 F1) 뒤 P5.6b |

- 🔴 **"진행 중/미완" 비동기 작업은 보이지 않는다**(스팬은 끝나야 export) — 요약은 **"부모 종료 이후 종료 K개 · 응답에 포함된 링크 L개(같은 트레이스 i · 다른 트레이스 j)"** `[UX-r1b 반영: v2 "링크 L개" → "응답에 포함된 링크 L개"]`. 🔴 **완전한 링크 그래프를 약속하지 않는다** — 적재 상한 32개/스팬이고 DTO에 절단 여부가 없다(→ §7 F2 전까지 "응답에 포함된"만). 🔴 "이 응답에서 발견되지 않음" ≠ "비동기 작업이 없음". 🔴 링크 대상 트레이스는 **별도 tail 판정**을 받았으므로 미저장일 수 있다("대상 스팬이 이 트레이스 응답에 없음"). 🔴 X-View 점 대상이 아니다(HTTP SERVER만 — §0).
- **첫 출시 범위 = UX §3.1의 5항목**(링크 목록·같은/다른 trace 이동 · 부모 종료 이후 종료 마커·해칭 · 관련 스팬만 보기 `?asyncOnly=1` · 빈 상태 · (선택) kind별 `selfMs` 자기 시간 카드). 탭을 늘리지 않는다 — 프로파일 탭 `?tab=async`·스레드 레인·겹침 차트·역탐색·kind 일괄 확인은 **P5.6b**(§7 후속 BE 항목 F1~F4 선행).
- ⚠️ 적재 코드 주석 "links 실측 0건" — Java 자동계측 샘플 앱에는 링크가 없었다. **R-P5.6**(UX §3.5 — ⓐ 생성 검증 · ⓑ 보존 검증, fixture: 동기 대조군·`@Async`·CompletableFuture·Kafka·RabbitMQ·수동 Link·경계 31/32/33, 측정 지점 M0~M6, 0.5일)가 **P5.6 출시 게이트**다 `[UX-r1b 반영]`: ⓑ 보존과 합격식 D-1(링크 전달 정합성 100%)·D-3(시간·관계 계산 — 동기 대조군을 "병렬"이라 표현한 사례 0)·D-4(조회·탐색)·D-5(표시 성능)를 통과해야 출시. ⓐ에서 링크 0건이어도 출시는 막지 않되 도움말·설치 가이드에 "해당 구성에서는 링크가 자동 생성되지 않음"을 그대로 적는다(빈 기능을 숨기지 않고 문구로 말한다).

---

## 5. 볼륨·성능 산정 `[C-r1 반영: 분모 교정·큐·힙 검증식]` `[R-P5 반영]` — §5.1·§5.3의 Collector 쪽 수치는 **실측**으로 교체(✅ 표기), §5.2 BE 힙·§5.4 SSE·§5.5 브라우저는 BE·FE 미구현이라 여전히 **추정**(R3·R4)

### 5.1 유입·이중 전송 `[R-P5 실측 ✅ §3.7·§7]` (슬림 스팬 **실측 458B**(정상)·516~524B(PII fixture 포함) — v2 추정 500B·민감도 400~800B의 **−8%~+5%**로 중심값 유효 · gzip **10.5~11.5배 = 44~45 B/스팬** — 추정 5~9배보다 유리, 1초 슬림 배치는 반복 구조라 더 잘 눌린다)
| SERVER 스팬/초 | 라이브 관측/일 | 추가 JSON 전송(실측 458B) | gzip(실측 45 B/스팬) | 지원 상한 대비 |
|---:|---:|---:|---:|---|
| 100 | 8.64M | 45.8 KB/s = 3.96GB/일 | 4.5 KB/s = 0.39GB/일 | 지원 수신 상한 안(L1). 보관·표시는 별도 층(§0) |
| 600(L2′ 실측) | 51.8M | **274.8 KB/s = 23.74GB/일**(정상 단가) | **27 KB/s = 2.33GB/일** | 실측 호스트 천장. `[C-r3 반영: §5 모순 6행]` v3의 "raw 314 KB/s = 27.1GB/일"은 **PII fixture 포함 단가 524B**로 센 값 — 별도 표기: PII fixture 단가(524B·44B)로는 raw 314 KB/s·27.1GB/일, gzip 26.4 KB/s·2.28GB/일(✅ 그 구성의 직접 관측) |
| 1,000 | 86.4M | **458 KB/s = 39.57GB/일**(v2 43.2) | **45 KB/s = 3.89GB/일**(v2 4.8~8.6 — 추정 하한의 80%) | **지원 수신 상한(L2)** — 서비스당 200/초 이내면 보관 목표 안. ⚠️ 실측 단가 외삽 |
| 1,500 | 129.6M | **687 KB/s = 59.36GB/일** | **67.5 KB/s = 5.83GB/일** | L3 외삽. `[C-r3 반영]` v3의 786 KB/s·66 KB/s는 524B·44B 단가 혼용 — 정상 단가로 정정 |
| 5,000 | 432M | 2.29 MB/s = 197.9GB/일 | 225 KB/s = 19.44GB/일 | **탐색 프로필(L5)** — 지원 상한으로 채택 전까지 제품 약속 아님 `[C-r2 반영]` |

표 전체가 **정상 단가 458B·45B 한 벌**이다(`[C-r3 반영]` — 행마다 단가를 섞지 않는다. 식: raw = SERVER/초 × 458B, 일 = × 86,400).
- ✅ gzip 비율은 실측값이다(1초 슬림 배치 직접 측정 — **전송량 산정용**). `[R-P5b 반영: §6.2]` 🔴 이 **평균** 비율을 BE 압축본 **상한** 근거로 쓰지 않는다 — 난수 값 입력은 2.4×(1,000스팬 gzip 572.4 KiB), 압축본 상한은 해제 후 상한과 같은 2 MiB(§2.3.0). "2MB gzip이 23MB로 풀린다"는 상한 2개를 **독립으로 두는** 이유(폭탄은 해제 중 스트리밍 검사가 중단)이지 압축본 상한을 작게 잡는 근거가 아니다.
- `[R-P5b 반영: §6.0]` 🔴 **비-ASCII 전송 비용은 ASCII와 같다** — Collector JSON exporter는 `\uXXXX`로 이스케이프하지 않고 원시 UTF-8을 쓴다(포화 1,000스팬 한글 785,699 B vs ASCII 786,779 B). v3의 "`\uXXXX` 6배 팽창" 산정은 삭제. 직렬화 **최악**(포화·G = N)은 1,402 B/스팬 = 1.337 MiB/1,000스팬이며 위 표의 정상 단가 458 B와 구분한다.
- ⚠️ 위 스팬당 단가는 **값 검사 통과 후 짧은 route**의 정상 트래픽 기준이다. gate OFF면 1,053B(+47%), 설계 v2 원문(값 미세척)은 715B였다(실측 §4.3·§7) — 단가는 yaml 정본이 지켜질 때만 성립한다.
- **저장 전송량 대비 증가율**: `추가율 = SERVER 비율 × 슬림 스팬 크기 ÷ (실효 보존율 × 저장 스팬 크기)`. 예: SERVER **11.6%**(`[R-P5 실측 ✅ §3.3]` 수신 3,000,169 → live 347,830 — v2의 13%(R1 507개 중 64)와 근사)·슬림 **458B**(실측)·저장 1,000B(가정) → 실효 보존율 2%면 **+266%(합계 3.66배)**, 10%면 **+53%(1.53배)**(v2 가정치 +325%/+65%보다 낮다). 실효 보존율은 정상 샘플 설정값이 아니라 **실제 export된 전체 스팬의 비율**(오류·느림 트레이스는 스팬 수·크기가 다르다). v0의 "약 10% 추가"는 샘플링 **전** 전체를 분모로 삼은 값이라 폐기.
- ⚠️ 서비스 간 호출은 피호출 서비스에도 SERVER 스팬을 만든다 → 점 수는 "전 서비스 서버 요청 수"다(제니퍼도 같다).

### 5.2 BE 힙 — 자료구조·송신 바이트 상한을 먼저 확정한 뒤 기동 검증 `[C-r2 반영: 누락 3건 보정·MiB 통일·기동 정책]` `[X-r1 정정: 실제 산술값과 예약 예산 분리, MB/MiB 혼용 제거]` (N7)

산술은 스크립트로 검산했다(1 MiB = 1,048,576B). **"산술값"은 자료구조 상한에서 계산되는 실제 바이트, "실측(MiB)"은 4단계 구현이 별도 `-Xmx192m` 단발 프로브(Full GC 후 힙 증분 — 정밀 retained heap 그래프 측정은 아니다)로 잰 값, "예약 예산"은 검증식·프로퍼티에 넣는 값**이다 `[impl-r2 반영: 실측 열 추가]` — 산술과 예약이 다른 행은 예산이 여유를 포함한 것이다. 🔴 4단계 구현·검수(`[impl-r2 반영]`)로 합계는 **404 MiB**로 확정한다 — v4.2의 "468 MiB(현 구현)"는 arena 통합 전 임시 dedup 인덱스가 상주하던 3단계까지의 상태였고, 4단계 구현이 그 임시 구조를 삭제하고 실제 arena dedup(4.12 MiB, 아래 표)으로 교체하면서 더 이상 해당하지 않는다(상세는 아래 표).

| 항목 | 산정식 | 산술값(MiB) | 실측(MiB) | 예약 예산(MiB) |
|---|---|---:|---:|---:|
| 점(arena) | 1,400,000 × 45B = 63,000,000B | 60.08 | **61.13**(1.4M 슬롯 전량 할당 프로브 — 전 슬롯 반납 후에도 고수위 유지, 산술과의 차이 1.05는 세그먼트 720 KiB 단위 양자화·배열 오브젝트 오버헤드) `[impl-r2 반영]` | 60.08(상한 고정 — lazy 세그먼트는 정상 부하 retained만 낮추고 예약은 낮추지 않는다) |
| 버킷 헤더 | 200 × **907** × 40B(long 1·int 8, SoA) = **181,400 × 40B = 7,256,000B** `[impl-r2 반영: 900→907칸]` | **6.92** | — | **6.92** |
| 집계 슬롯 | 200 × **907** × 104B(97B → 8B 정렬) = **181,400 × 104B = 18,865,600B** `[impl-r2 반영]` | **17.99** | — | **17.99** |
| dedup(전체 키) `[impl-r2 반영: 자료구조 교체]` | 공유 슬롯 풀 90,000 × 40B + 부속 배열 180,032 × 4B = 4,320,128B(§2.4 dedup) | **4.12** | **4.12**(회귀로 고정 — 산술과 일치) | **4.12** |
| 사전 | route 40,000 × 296B + Map 40,000 × 56B + 인스턴스 12,800 × 272B + 참조 카운트 52,800 × 4B(§2.4 사전) = 17.24 **+ 인스턴스 안정 키 12,800 × 56B = 0.68** `[UX-r1b 반영]` | 17.92 | — | **20**(`dict-budget-mib`) |
| 위치 인덱스 | 살아 있는 버킷 lazy(R3 뒤 결정) | — | — | 8 |
| **상주 소계** `[impl-r2 반영: 재계산]` | | **107.03**(60.08+6.92+17.99+4.12+17.92 — v4.2의 108.21에서 907칸·dedup 교체 반영) | 참고 **108.08**(arena를 실측 61.13으로 치환 — 부분 실측 혼합값) | **117.11 ≤ `max-heap-mib` 160**(여유 42.89 — 종전 118.29에서 갱신) |
| 수신 본문 임시(회선~해제) `[impl-r1 정정]` | admission 4 × (압축본 2 MiB + 해제 후 2 MiB) = 16 MiB — 🔴 v4까지의 "압축본 상한 변경은 힙 임시(동시 해제 4 × 해제 후 상한)에 영향 없다"는 **압축본 버퍼를 해제 전에 놓는 구현을 전제**한 것이라 **철회**한다. 1~3단계 구현은 `wire`(압축본 원본)를 `onAllDataRead`에서 `consumer.accept` 뒤 `finally`에야 놓으므로, gzip 요청은 슬롯당 압축본 2 + 해제본 2 = 4 MiB가 **동시에** 살아 있다(무압축 요청만이면 해제본 2 MiB뿐이라 8 MiB) | 16 | — | 16(무압축만 도달하면 8) |
| 파서 보유분(선택 필드 1,000개) `[impl-r1 반영]` | 배치당 ≈1 MiB(1,000스팬 × (문자열 ~500B + 객체 오버헤드 ~400B)) × in-flight 4(admission과 동일 상한) = 4 MiB — 2~3단계 검수 🟡 Y9, §5.2 표 누락 지적 | 4 | — | 4 |
| SSE 임시 — **고유 바이트 전역**(§2.5) | 재생 로그 8 view × 16 = 64 + in-flight frame 8 × 2 = 16 + 퇴출 보유 8 + degraded 재직렬화 4 × 2 = 8 | 96 | — | 96(`sse-bytes-total-mib`) — 연결 큐 명목 50 × 8 = 400은 참조 공유라 실바이트가 아니며, 이 상한이 참조 수와 무관하게 고유 바이트를 센다 |
| snapshot 임시 — 동시 chunk 버퍼 | admission 2 × (직렬화 1 + 송신 대기 3) chunk × 1 MiB = 8 — 전송량 32/96은 스트리밍이라 상주하지 않는다 | 8 | — | 64(`max-snapshot-mib`, 16 snapshot분 여유 — admission 2는 CPU·락 기준) |
| ~~임시 dedup 인덱스~~(`BoundedLiveDedupIndex`) `[impl-r2 반영: 4단계 완료로 삭제]` | 4단계 구현이 이 임시 구조를 **삭제**하고 위 "dedup(전체 키)" 행(공유 슬롯 풀, 4.12 MiB)으로 교체 완료했다 — v4.2 시점(2~3단계)에만 상주하던 값이라 더 이상 해당 없음 | — | — | **0**(종전 64 → 해당 없음) |
| **합산(예약)** `[impl-r2 반영: 404로 단일화]` | `P1.5 Live(64) + P5 상주(160) + P5 임시(64 snapshot + 96 SSE + 16 수신본문 + 4 파서 = 180)` | | | **404 MiB** — 4단계 구현 완료로 임시 dedup(64)이 사라져 v4.2의 "468(현 구현)" 분기는 더 이상 해당 없다 |

**기동 정책** `[C-r2 반영 — N7 답]`: v1의 "추정식이 `maxMemory` 50%를 넘으면 BE 전체 기동 실패"는 **폐기**(추정식으로 전체 BE를 막는 것에 코덱스 반대 — 상한 자체가 과소 산정돼 있었다). v2:
- 검증식에 넣는 값은 **추정이 아니라 설정에서 계산 가능한 최소 필요량**(arena 슬롯 **상한** × 45B + 헤더 + 집계 슬롯 + dedup + 사전 예산 + 위치 인덱스 예산 + SSE 고유 바이트 상한 + snapshot 예산 + P1.5 예산 — arena는 lazy 할당이어도 **상한**으로 넣는다 `[X-r1 정정]`)이다.
- 그 최소 필요량이 `Runtime.maxMemory()`의 **50%(잠정 정책값)**를 넘으면 → **P5 활성화 실패**(P5 빈만 내려가고 원인을 기동 로그·수집기 탭에 명시), 나머지 BE는 기동한다. 30% 초과는 경고.
- P5가 **필수인 설치 모드**(향후 프로퍼티 `app.apm.live.spans.required=true`)에서만 BE 기동 실패를 허용한다. 기본은 선택 기능.
- 30%·50%는 **제품 정책의 잠정값**이며 안전성을 증명하지 않는다 — R3가 retained heap·GC로 검증. 단위는 전부 **MiB**.
- 정상 부하(서비스 10 · 1,000점/초 · 15분) `[X-r1 정정: 논리 점유 vs retained 병기]`: 점 900,000 × 45B = 40,500,000B = **38.62 MiB(논리 점유)** / **retained 38.67 MiB**(lazy 세그먼트 55개 × 720 KiB, 고수위·단조) — v2처럼 기동 시 1.4M을 고정 할당하면 빈 슬롯도 retained라 **60.08 MiB**였다. 버킷 헤더·집계 슬롯은 200 × **907** 고정 배열이라 부하와 무관하게 **6.92 + 17.99 = 24.91 MiB** `[impl-r2 반영: 900→907칸 — 24.72→24.91]`(v2의 "집계 0.9"는 10서비스분만 센 오기). 정상 부하 상주 ≈ 38.67 + 24.91 + dedup **4.12** + 사전 실사용 ≈ 1 = **≈ 68.7 MiB(추정)** — R3가 retained heap으로 확인한다.
- 🟢 **4단계 구현이 다른 시나리오를 실측했다** `[impl-r2 반영]`(별도 `-Xmx192m` 단발 프로브, Full GC 후 힙 증분 — 정밀 retained heap 그래프 측정은 아니다): **200서비스 × 1점/s × 900초** 정상 운용(헤더+집계+구현 dedup 배열 포함) = **44.49 MiB**, **1.4M 슬롯 전량 할당**(arena 압박 최악 시나리오) = **61.13 MiB**(전 슬롯 반납 후에도 고수위 유지 — 세그먼트는 반납하지 않는다는 §2.4 계약과 일치), dedup은 **4.12 MiB**(산술과 일치, 회귀로 고정). 예약 호출 자체의 비용은 **p99 0.758ms / 최대 53.710ms** — 최대값은 콜드 스타트(첫 배치가 저장소를 최초 할당하는 순간, registry write lock 안에서 200×907 슬롯분 배열을 할당)가 유력한 후보다(아래 기동 시 선할당 항목).
- 🔴 **`enabled=true`일 때 기동 시 선할당**(콜드 스타트 제거) `[impl-r2 반영: §7.1 배정]` — 첫 배치의 `reserve()` 안, write lock 아래에서 저장소를 최초 할당하면 그 사이 도착한 동시 배치가 50ms 락 데드라인에 걸려 배치 전체가 503으로 나갈 수 있고(콜드 스타트를 `internalError`로 오분류하지 않도록 위의 `storageUnavailable` 사유로 분리했다 — §3.3), 최대 53.710ms의 예약 호출도 이 초기화가 주 후보다. `enabled=true`면 `ApplicationReadyEvent`(또는 컨트롤러 최초 진입 전, 락 밖)에서 저장소를 **선할당**하고 실패하면 `storageUnavailable`로 계수한다 — `enabled=false`일 때 25 MiB 안팎을 안 잡는 현재의 이득은 유지한다. 이 항목은 §7.1 4단계 행에 배정한다.
- 🔴 R3 시제품은 균등 10서비스만이 아니라 **단일 hot service·200서비스·route/instance churn·오류 100%·pool 바닥·회전**까지 돌리고, 점당 바이트가 아니라 **retained heap·할당률·GC 일시정지·snapshot peak**를 본다. 세그먼트 lazy 할당의 지연(720 KiB 배열 8개를 ingest 스레드가 서비스 락 안에서 할당 — 락 시간 초과 50ms와 충돌하는지)과 **고수위 retained가 논리 점유에서 얼마나 벗어나는지**도 R3 항목이다 `[X-r1 정정]`.

### 5.3 Collector 비용 `[C-r1 반영]` `[R-P5 반영: 실측 §5·§7·§11·§12]`
- 🔴 **분기 앞 비용은 SERVER 수가 아니라 전체 스팬 수에 비례한다.** SERVER 11.6%(실측)면 SERVER 1,000/초 = 전체 ≈8,600/초가 복제·순회된 뒤 filter가 88%를 버린다. v0의 "코어 5~15%"는 근거가 없다 → **R2 A/B 실측**: OFF→ON→OFF(각 240초, L2′ 600 SERVER/초·전체 ≈5,000스팬/초) `C = ΔCPU/Δwall` = off1 0.107 · **on1 0.137** · off2 0.077 → `C_ON/C_OFF`(두 OFF 평균 0.092) = **1.49 → 합격선 1.20 FAIL**. 스팬당으로도 같다(1M 스팬당 CPU off1 27.9s · off2 19.1s · **on1 37.9s**). 사실(방향): ON이 두 OFF **모두**보다 높다. 불확실(크기): OFF끼리 **39% 편차**, 기준 CPU 54~72%(IntelliJ·Docker·Chrome 상주), 부하 천장 600/초 — **"1.49배"를 제품 수치로 쓰지 않는다**. 🔴 그래도 사전 고정 판정식이라 **완화하지 않고 FAIL로 둔다**; 격리 호스트 OFF/ON/OFF × 3회 재측(R2′)이 P5.1 출시 게이트다. `[C-r3 반영: 질문 2 답]` **합격선 1.20은 유지** — 먼저 기준 설정과 유효한 측정을 확보한다. 기록 문장은 §2.1의 두 문장(비격리 시험 불충족 · 격리 환경 증가율 미확정)으로 고정하고, 측정 구간 혼입(`ab.sh` 무부하 준비 20초 + drain 60초가 CPU 표본에 포함)·저장 처리량 분모(proxy 도착/생성)·동시 export 8개 하네스도 크기 불확실의 원인으로 적는다. 완화 후보(전부 **추정**)는 §6.0 표 — 권장 순서 **a → b → d → c → e**. 메모리는 PASS — `RSS_ON,p95/RSS_OFF,p95` 263/249 = **1.057**, ON peak 284MB < `memory_limiter` 512MiB.
- 메모리: exporter 큐 5배치 × 1,000 × 458B ≈ **2.3MB 직렬화분은 대기분만**이다 `[C-r2 반영]` — 소비 중 배치(`num_consumers` 2 → +2배치)·복제본·gzip 버퍼가 더해진다. ✅ 실측 §7: 정상 부하에서 live 큐 최대 1/5(압박 없음), RSS ON−OFF **+14MB**. R2′가 `num_consumers` 1/2를 비교하며 **큐 나이(queue age)·in-flight 수**를 함께 관측한다.
- freshness: **5배치가 체류 5초를 보장하지 않는다** `[C-r2 반영]`. `[C-r3 반영: §5 모순 7·8행]` v3의 산식 `5 + 6 = 11초`는 틀렸다 — 장애 중에는 큐가 배치 주기가 아니라 **timeout 속도로** 빠진다. 단순 직렬 처리 **모델 추정**: `최대 체류 ≈ ⌈queue_size ÷ num_consumers⌉ × timeout + timeout` → consumers **1이면 5 × 3 + 3 = 약 18초**, **2면 3 × 3 + 3 = 약 12초**(+ batch 1초). 정상 관측 p99 1.78초·max 6.27초(실측 §7)는 정상 상태의 사실이지 **최악 상한의 증명이 아니다** — R2′가 큐 나이(queue age)·in-flight를 장애 프로필에서 직접 잰다. 지연의 지배항은 **`batch/live: 1s`**(§2.2 — 0~1초 균등 대기), SDK BSP는 저트래픽에서만 지배(§2.2). "오래된 점을 현재 TPS에 몰아넣는가"는 BE 링 미구현이라 미측(R-P5″) — `block_on_overflow: false`여도 **이미 수용한 대기 5배치와 in-flight는 남으므로** 장애 해제 직후 최대 12~18초 묵은 배치가 도착할 수 있다(v3의 "몰아칠 것이 없다"는 틀렸다); 그 점들은 BE가 `endTs` 기준 **자기 버킷에 귀속**시키고 `stale`(900초) 밖은 폐기하므로 현재 TPS에 섞이지 않아야 한다 — 그것이 R-P5″의 검증 항목이다.
- 장애 시 `[R-P5 실측 ✅ §11·§12]` `[C-r3 반영: 제한된 관측으로 정정]`: 무응답(10s hang)·429·503·연결 거부·partialSuccess 각 120초 — **저장 경로 추가 유실 0·중복 0(proxy 도착 기준)·저장 지연(완료→proxy 도착) p95 11,966~12,528ms = OFF 11,962~12,422ms 대비 허용 증가량 1,199ms 안·`receiver_refused_spans` 0·live 큐 상한 5 초과 0·RSS 250~290MB(OOM 0·무한 증가 0)**·live 큐는 해제 다음 tick에 0. 한계: 하네스의 `refuse`는 연결을 받은 뒤 socket을 끊는 형태라 **실제 연결 거부와 전송 중 reset은 각각 미입증**, 고정 12건 거절은 **전량 metadata 거절** fixture가 아니며, 메모리 압박은 지원 부하 + backlog + 큰 속성 + 오류 100% 결합 프로필이 아니다 — 전부 R2′. 실패는 `enqueue_failed`(느린 응답)와 `send_failed`(빠른 실패)로 갈라져 계수(§2.2 운영 감시). 유일한 저장 오염 경로는 **`error_mode: propagate`의 transform 실패**(300% 중복)였고 v3에서 폐기했다(§2.1).

### 5.4 SSE fan-out(동시 화면 N)
- 클라이언트당 **기본** 1,500점/초 × 70~90B ≈ 110~135KB/초. 🔴 송신 점 수/초 = **그 tick에서 다시 보낸 모든 버킷의 base 점 + 강조 점**이지 새 점 수가 아니다 `[C-r2 반영]` — 늦은 도착 1%(15점)가 서로 다른 200점 버킷을 건드리면 +3,000점 → **≈405KB/초**(한 버킷에 몰리면 훨씬 작다). "늦은 도착 1% → 대역폭 1%"가 아니다. 먼저 dirty 버킷 tick당 1회 병합 + frame 2MiB 상한 + 연결 큐 바이트 상한으로 막고 R1/R4가 재며, 실패하면 **버킷 내부 delta**(`add/remove spanId`)를 도입한다.
- N=20 → 기본 2.7MB/초 ≈ 22Mbps(미압축). **직렬화만 공유**된다 — 전송·TLS·복사 비용은 N배다 `[C-r1 반영]`.
- 클라이언트당 송신 상한(연결 큐 8MiB/5초분·deadline 2초) 초과 시 그 연결만 `degraded`.

### 5.5 브라우저
- 5분 창 × 1,500점/초 = 450k점 — 이 숫자가 v1 "화면 전량" 문구의 반례다(§0). 🔴 **500k 상한은 검증 전 허용값이 아니다** `[C-r1 반영]` — R4가 초기 snapshot(chunk 수신·조립 포함) 파싱·typed array 변환·ECharts 내부 복사·브러시 필터·표 정렬·다중 탭·숨김 복귀·재접속을 **합쳐** 측정(p95 갱신 비용·최장 정지·브라우저 전체 메모리·입력 반응)한 뒤 상한을 정한다. 잠정: 300k점 초과 시 기본 계층을 1/k로 솎고 배지(`displayedCount/observedCount`).

---

## 6. 실측 계획 R-P5 — **실측 계약** `[C-r2 반영: §6.1~6.4를 코덱스 §5.2~5.5 절차·합격식으로 교체]`

🔴 **이 절은 계약이다.** 아래 시간·허용 차이는 **새로 제안된 잠정 합격선이며 추정**이지만, **실행 전에 고정하고 측정 결과를 본 뒤 통과시키려고 바꾸지 않는다.** 바꾸려면 결과를 먼저 기록하고 "왜 기준이 틀렸는지"를 3회차 안건으로 올린다. `[C-r3 반영: §5 모순 1행 — 게이트 통일]` v3는 앞(§6 서문·§6.4)에서 "R2가 본 구현·계약 확정 전 필수", 뒤(§6.0·§7)에서 "R2′는 출시 게이트"라고 적어 충돌했다. v4의 순서는 **하나**다: R1·R2(1차, 비격리)는 끝났고 P5.1 본 구현은 v4로 착수한다 · **R-P5b 결합 YAML correctness = ✅ 완료**(`[R-P5b 반영]` 2026-09-15 — v3 yaml FAIL·v4 yaml correctness PASS, 발견 6건은 아래 §6.0 R-P5b 표; 생성 설정 배포·계약 확정의 선행 조건 충족) · **R-P5″ = 최소 종단(§7.1 1~5단계) 직후** · **API 계약 확정 = 최소 종단의 수량·상한·snapshot/SSE 회귀와 계약 표본 확인 뒤** · **R2′ 격리 재측 = live 기능 활성화·출시 게이트**(구현과 병행 가능, BE 관문·메타 캐시·집계·arena·SSE를 기다리게 하지 않는다). P5.2·P5.3은 명시적으로 잠정인 계약으로 진행하고 최종 연동 계약·성능 문구는 해당 검증 후 고정한다. 측정을 위한 작은 시제품(arena·선택 파서·chunk 직렬화)은 허용한다. R1·R2 통과는 **Collector 분기와 최소 종단의 타당성** 확인이지 출시 적합성이 아니다 — 1.4M점 보관·다중 snapshot·50개 브라우저는 R3·R4에서 별도로 통과해야 한다.

### 6.0 R-P5 실측 결과 요약 (2026-09-15, R1·R2) `[R-P5 반영: 실측 §15 종합 판정 — 합격선은 §0에서 실행 전 고정된 것 그대로]`

> 정본은 `../verification/r-p5_apm-live-pipeline.md`. 여기 표는 **합격선 · 실측값 · 판정 · 근거 절**만 옮긴 것이며, 판정은 실측 문서의 사전 고정 판정식(코덱스 §5.4·5.5)을 측정 뒤 바꾸지 않고 대입한 결과다. **결론: R1 🟡 조건부 PASS(P0 반영 시) · R2 🔴 FAIL(R2-1 CPU · R2-8 저장 중복).** 실행 전 선언된 계약 이탈 3건(실측 §0.3): 반복 축소(프로필당 3~10분 × 1~2회 — 판정 완화 사유로 쓰지 않음) · 부하원은 **합성 OTLP 주입·SDK BSP 에뮬레이션**(실 javaagent 아님 → R7) · BE 라이브 EP 미구현이라 캡처 서버가 대역(R1-4·5·6·8 미측). 호스트는 **비격리**(14코어, 기준 CPU 54~72%, 부하 천장 **600 SERVER/초 = L2′** — L2 1,000·L3·L5 미도달).

**R1 — 분기·PII·정합성·지연**
| # | 검증 | 합격선(고정) | 실측값 | 판정 | 근거 절(실측 문서) |
|---|---|---|---|---|---|
| R1-1 | 분기 정확성 | 비대상 오포함 = 0 ∧ 적격 탈락 = 0 | 자기계측 10,840 · 비-SERVER ≈260만 · RPC 1,803 → 오포함 **0** · 적격 탈락 **0** · enum·`kind.string` 둘 다 동작 · v2 정규화로 구형 semconv 1,548건 3키 보존 | ✅ PASS | §3.3 · §3.4 · §4.1 |
| R1-2 | PII 제거 | 금지 문자열 통과 = 0 **이고** 정상 fixture 전달 | 설계 v1 초안 **6종 유출** · 설계 **v2 원문 4종 유출**(`http.route` 값 4,798 · `service.instance.id` 값 3,603 · `scope.name` 3,603 · `schemaUrl` 7,206) · gate OFF면 +3종 · **H3 조합 0종(13/13 clean, 정상 347,830건 전달)** | 🔴 v2 원문 FAIL → ✅ v3 yaml 근거 조합 PASS → `[R-P5b 반영: §5]` ✅ **결합 정본(v3·v4 각각) 13/13 차단 + 대조군 보존 + 절단 경계 U+FFFD 0** | §3.2 · §4.2 · §4.3 · R-P5b §5 |
| R1-3 | 정상 유실 | `loss < 0.001` 각 반복 모두 | 10분 **347,830건 0.0000%** · 보정 3회 전부 0 · 캡처 중복 0 · `receiver_refused` 0 · `enqueue_failed` 0 · exporter `sent_spans` = 캡처 = 적격 E(세 지점 일치) | ✅ PASS(L2′ 600/초 — L2·L3는 미도달) | §3.5 |
| R1-4 | 집계 정확성 | count·오류 2축·slow 오차 = 0 | — (BE 링·집계 미구현) | ⬜ 미측 → R-P5″ | §3.8 |
| R1-5 | 표본 분리 | `stats.count` = 수용 고유 관측 ∧ reservoir 탈락이 `rejectedSpans` 불증가 | — | ⬜ 미측 → R-P5″ | §3.8 |
| R1-6 | TTL 영향 | hot path DB 0회 · TTL 반복 거절 없음 | — (`LiveMetadataCache` 미구현) | ⬜ 미측 → R-P5″(soft 20s/hard 30s가 실제로 경계 거절 0인지가 핵심) | §3.8 |
| R1-7 | 지연 | `p50(완료→링) < 5s` · `p95(완료→화면) ≤ 5s` · `p99 ≤ 10s`, 유실률과 함께 | `[C-r3 반영]` **강제 flush 조건(`gen.mjs` 50ms)의 완료→캡처 관측** n=347,830 p50 585 · p95 1,054 · p99 1,775 · max 6,265ms — 제품 근거 아님 · **규격 준수 재측(`gen4.mjs`) @600/초: BSP 5,000 p50 789/p95 1,521 · BSP 1,000 p50 711/p95 1,227 · @10/초 BSP 1,000 p95 1,594 · BSP 5,000 p95 5,727ms** / 링·SSE·화면 미측 | 🟡 **캡처 도착 관측으로 정정**(링이 없다 — 계약 충족 신뢰 낮음 / 전송 관측 신뢰 중간) · ⬜ 완료→링·화면 → R-P5″ · 🔴 저트래픽 BSP 기본값은 캡처 단계에서 이미 5초 초과(P0-7) | §3.6 · §10.1~§10.3 |
| R1-8 | 늦은 도착·중복 | 버킷 귀속 오류 0 · dedup 60초 안 추가 집계 0 | — | ⬜ 미측 → R-P5″(61초 fixture로 60초 dedup vs 900초 창 한계 관측) | §3.8 |
| R1-9 | 부분 성공 응답 | BE 수량 보존식 일치 · 유효 partialSuccess 재전송 0 + WARN · 503 재시도 0 | exporter 측: partialSuccess 120초 → **WARN 119건 · `send_failed` 0 · `sent_spans` 78,470 · 재전송 0**, 503·429도 재시도 0 / BE 보존식 미측 | ✅ PASS(exporter 측) · ⬜ BE 보존식 → R-P5″ | §12.4 |
| R1-10 | URL·본문 상한 | 경로 일치 · 제한 이하 수용 · 초과 계약대로 거절 · **최대 배치**로 증명 | 경로(`url_path="/apm/otlp-live/v1/traces"`)·Content-Type·gzip ✅ · 정상 포화 2,000스팬 0.85 MiB · **최악 ASCII 1.62~1.64 MiB(여유 22%)** · ~~최악 UTF-8 2.09~2.11 MiB(2MB 초과)~~ `[R-P5b 반영: §6.0]` **철회 — gen3 fixture가 문자 수를 세어 `error.type` 64자 = 192 B가 들어간 결함**(`\uXXXX` 팽창 없음, 한글 = ASCII 비용) · gzip 11.5배 → 압축본 상한 **설계 누락** · 초과 거절 미측 | 🟡 부분 PASS → 설계 수정(P0-6 max 1,000 — 근거는 R-P5b G = N 1.337 MiB로 교체 · P1-1 압축 상한 512KB → **R-P5b에서 정상 입력 거절로 판명, v4.1 2 MiB**) · 초과 거절 → R-P5″ | §3.10 · §8.1 · §14 · R-P5b §6 |

**R2 — Collector 비용·저장 경로 보호** (OFF→ON→OFF 각 240초, L2′ 600 SERVER/초 · 10서비스, 같은 프록시로 계측)
| # | 검증 | 합격선(고정) | 실측값 | 판정 | 근거 절 |
|---|---|---|---|---|---|
| R2-1 | 정상 CPU | `C_ON / C_OFF ≤ 1.20` | off1 0.107 · **on1 0.137** · off2 0.077 → **1.49**(OFF끼리 39% 편차 · 기준 CPU 54~72% · 비격리) | 🔴 **FAIL 유지** — 판정 보류 아님. 격리 호스트 재측 **R2′가 P5.1 출시 게이트** | §5.1 · §5.3 |
| R2-2 | 정상 메모리 | `RSS_ON,p95 / RSS_OFF,p95 ≤ 1.20`, peak ≤ 512MiB | 263/249 = **1.057** · ON peak 284MB | ✅ PASS | §5.2 |
| R2-3 | 저장 처리량 | 추가 유실 0 ∧ 추가 중복 0 ∧ `T_ON/T_OFF ≥ 0.99` | 중복 **0/0/0** · 정규화 처리량 **1.003** | ✅ PASS | §5.2 · §5.4 |
| R2-4 | 저장 지연 | `L_ON,p95 − L_OFF,p95 ≤ max(0.1×L_OFF,p95, 500ms)` | 12,422 − 11,989 = **+433ms**(허용 1,199) — `beMs`는 OFF끼리 3배 차라 판정 지표 아님 | ✅ PASS | §5.2 · §5.3 |
| R2-5 | live 무응답 | 저장 기준 유지 · live 실패 계수 · retry OFF | 10s hang 120초: 저장 p95 12,026ms · 중복 0 · live 실패 70,310건(`enqueue_failed` 46,650 + `send_failed` 23,660 `Deadline_Exceeded`) · 재전송 0 | ✅ PASS | §11 · §12 |
| R2-6 | HTTP 거절 | 응답별 계수 구분 · 저장 추가 유실·중복 0 | 429 → `send_failed` 66,755 `ResourceExhausted` · 503 → 72,650 `Unavailable` · partialSuccess → WARN 119·성공 취급 · 저장 중복 0 · `receiver_refused` 0 | ✅ PASS | §12.1 · §12.2 · §12.4 |
| R2-7 | 연결 거부·reset | 저장 기준 유지 · live 큐·in-flight 선언 상한 이내 | `send_failed` 78,720 `_OTHER` · 저장 p95 11,979ms · 중복 0 · 큐 상한 5 초과 0(`num_consumers` **1**로 측정) | ✅ PASS | §11 · §12.4 |
| R2-8 | transform 실패(`propagate`) | 저장 분기 추가 유실·중복 0 | **`propagate`: SDK 503 × 5,176 · 재전송 3,882 · 라이브 도달 0 · 저장 중복 26,769(고유의 300%)** / `ignore`: 중복 0·유실 0 / 기준선 0 | 🔴🔴 **FAIL** → v3 결정 1로 해소(`ignore` + 카나리아 + 자기 메트릭) → **R2′ 재측 항목** | §13 |
| R2-9 | 메모리 압박 | 저장 기준 유지 · OOM 0 · 무한 증가 0 | 장애 5종 전 구간 RSS 250~290MB · OOM 0 | ✅ PASS | §12.5 |
| R2-10 | 복구·freshness | 30초 안 live 큐 정상화 · 60초 안 RSS 복귀 · 오래된 점 몰아넣기 없음 | live 큐 해제 다음 tick(1초)에 0 · RSS 즉시 정상 범위 / "오래된 점 몰아넣기"는 BE 링 미구현 | 🟡 부분 PASS → 잔여는 R-P5″ | §12.5 |

```text
R2 최종 판정식 대입(실측 §15.2)
  저장 추가 유실 0 ✅ ∧ 저장 추가 중복 0 🔴(propagate 26,769) ∧ 처리량·지연 ✅ ∧ 큐·동시성·메모리 상한 ✅ ∧ 실패·부분 거절·복구 관측 가능 ✅  ⇒ R2 = FAIL
```

**판정 정정 — 코덱스 3회차 §1.2·§1.3 신뢰 열** `[C-r3 반영: 필수 정정 3]`. 🔴 v3의 **"R2의 나머지 8항목 PASS"는 철회**한다 — 정확한 요약은 **"2건 FAIL, 나머지는 제한된 관측 PASS·부분 PASS·미입증이 섞여 있음"**이다. '신뢰'는 그 관측이 판정 범위를 얼마나 뒷받침하는지를 뜻한다. 위 두 표의 "실측 판정" 열은 실측 문서 원문이고, 문서가 **쓰는** 판정은 아래 열이다.
| 항목 | v3 표기 | v4 판정(코덱스) | 신뢰 | 왜 |
|---|---|---|---|---|
| R1-1 분기 | PASS | **설정별 제한적 PASS** → `[R-P5b 반영]` **결합 정본 PASS**(v3 E=A=8,444 · v4 E=A=8,431, 오포함·탈락 0) | 중간 → 높음(correctness) | H3 장시간과 v2 원문의 HTTP·RPC·구형 semconv 결과는 다른 설정이었다 — 결합 YAML을 R-P5b가 실행해 닫음(부하는 150/초 correctness 전용, 성능은 R2′) |
| R1-2 PII | v2 FAIL / H3 PASS | 그대로 → `[R-P5b 반영]` 결합 정본 13/13 + 비문자형 값 drop + 절단 경계 안전 | 높음 | v4는 비문자형 값(double·bool·array)을 live-safety가 drop, 절단 경계 U+FFFD 0. 🔴 단 방어 범위는 "속성 값 + live-safety 13조건"이며 정리 문장 실패 + 조건 결손이 겹치면 구멍(§2.1 ⑤ 불변식) |
| R1-3 유실 | PASS | **H3 관측 구간 PASS** | 중간 | 짧은 추가 실행을 합친 "반복 4회"는 10분 × 4가 아님. SDK 이전 손실과 결합 YAML 결과는 별도 |
| R1-7 지연 | PASS(완료→링) | **캡처 도착 관측** | 낮음(계약) / 중간(전송) | 링이 없고 585ms는 강제 flush 결과. 실제 링·SSE·화면 미측 |
| R1-9 부분 성공 | PASS(exporter) | 그대로 · BE 미측 | 높음(exporter 동작) | WARN 119건과 응답 건수 차이는 R-P5″에서 정산 |
| R1-10 상한 | 부분 PASS | **기존 최대 크기 가정 FAIL 포함** → `[R-P5b 반영]` 2.11 MiB는 **fixture 결함으로 철회**하되 v3 yaml의 전송 최대는 **무한**(26.2 MiB)이었으므로 FAIL 판정은 유지 · v4 yaml 최악 1.337 MiB PASS · **압축본 512 KiB FAIL(정상 입력 거절)** → 2 MiB | 높음 | 2,000 유지 근거는 없다(G = N 산술 ≈2.7 MiB, 외삽). 실제 413 경계·압축본 2 MiB 경계는 R-P5″(§2.3.0 회귀 fixture) |
| R2-1 CPU | FAIL | **FAIL 유지** | 중간(시험 실패) / 낮음(증가율) | 비격리·부하 차이·측정 구간 혼합 — 인과적 증가율 미확정 |
| R2-2 RSS | PASS | **관측 구간 PASS** | 중간 | L2·L3·최악 입력·결합 YAML로 일반화 불가 |
| R2-3 저장 처리량 | PASS | **계약 기준 미입증** | 낮음 | proxy 도착/생성 비율 — 기대 저장 ID 집합·DB·집계 대조 없음 |
| R2-4 저장 지연 | PASS | **계약 기준 미측정** | 낮음 | +433ms는 proxy 도착 지연 — 저장 수용/commit 아님 |
| R2-5 무응답 | PASS | **부분 PASS** | 중간 | timeout·큐 포화·실패 계수·retry OFF는 확인. 저장 성능·정확성은 R2-3·4 제한 |
| R2-6 HTTP 거절 | PASS | **부분 PASS** | 중간 | 고정 12건 거절은 전량 metadata 거절 fixture가 아님 |
| R2-7 연결 거부·reset | PASS | **부분 PASS** | 중간 이하 | 하네스 `refuse`는 수락 후 끊기 — 실제 연결 거부·전송 중 reset 각각 미입증. consumers 2 in-flight 미측 |
| R2-8 transform 실패 | FAIL | **FAIL 유지 — 설계 결함 확정** | 높음(중복 전송 원인) | "라이브 processor 오류의 상류 전파에 따른 저장 분기 중복 전송". DB 중복 행은 미입증 |
| R2-9 메모리 압박 | PASS | **요구 프로필 미측정** | 낮음 | 지원 부하 + backlog + 큰 속성 + 오류 100% 결합 아님 |
| R2-10 복구 | 부분 PASS | **큐 복구 일부 확인** | 낮음~중간 | RSS 60초 복귀 추적·BE freshness 검증 없음 |

**합격선에 없었으나 실측이 새로 드러낸 것**(전부 v3에 반영):
| 발견 | 실측 | 반영 |
|---|---|---|
| `SecurityConfig` permitAll 누락 시 **401 → Collector `Permanent error` 즉시 폐기**, 응답 본문은 사람용 세션 envelope | §3.9 | §2.3 보안 체인 행(P5.1 필수 + 회귀 테스트 + R6) |
| feature gate `ottl.set.allowNil`이 **실행 명령**에 있고 설치 가이드에 0건 — OFF면 PII 3종 + 전송량 +47%, 경고 0 | §4.3 · §6 | §2.2 실행 명령·카나리아 `slimBypassed`·리스크 #13 |
| 저트래픽 BSP 기본값 5,000ms → 완료→링 p95 5,727ms · 고트래픽 + BSP 5,000에서 **SDK 큐 드롭 1,175스팬** | §10.3 | §2.2 SDK 설정 불릿·리스크 #1·#15 |
| 최악 UTF-8 배치 2.11 MiB > 2MB · `truncate_all`은 바이트 기준 · 압축본 상한 누락 | §14 · §3.10 | §2.2 max 1,000 · §2.3 상한 2개 · §3.3. `[R-P5b 반영: §6.0]` 🔴 **2.11 MiB는 fixture 결함(문자 수 계수)으로 철회** — `\uXXXX` 팽창 없음. max 1,000·상한 2개는 유지하되 근거·값을 R-P5b 실측으로 교체(G = N 1.337 MiB · 압축본 2 MiB) |
| `set(name, "")`은 JSON 필드 **부재** · 무접두 경로 INFO · `otlphttp`/`resourcedetection` 별칭 deprecated WARN | §3.1 · §3.7 | §2.2 함정 3 · §2.3 파서 · P2-1 별건 |
| **하네스 결함 자진 신고**: 1차 저트래픽 BSP A/B는 생성기의 50ms 강제 플러시로 **무효**(두 값이 같았다) → `gen4.mjs`로 규격 준수 재측 | §10.1 | `[C-r3 반영: §5 모순 2행]` v3는 "재측값만 인용"이라 적고도 §3.6의 585ms(같은 강제 flush 하네스)를 계속 인용했다 — **모순**. v4는 585/1,054/1,775ms를 "강제 flush 조건의 완료→캡처 관측"으로 분리해 제품 근거(§2.2·§4.1·§6.0 R1-7)에서 제거하고 §10.3 재측값만 쓴다. 영향 범위: 수정 하네스도 동시 export 8개를 허용해 실 SDK와 같지 않다(R7) |

**R-P5b 결합 YAML correctness 결과 요약(2026-09-15 17:20~18:10)** `[R-P5b 반영: §2]` — 정본은 `../verification/r-p5b_apm-live-yaml-correctness.md`. 합격선은 §0에서 실행 전 고정(1~7은 지시문 그대로, 8~11은 v4 개정과 함께 해당 실행 전 고정, 사후 완화 0). 대상 고정: Collector 0.159.0(sha256 `e15e33cb…`) · RP5b 전용 포트 4327/4328/8889/13134 · 기준 yaml = `POST /apm/collector-config` 실제 생성물 + §2.2 라이브 블록 · **v3 = 16:52 사본 / v4 = 17:38 사본을 각각** · 캡처 서버 `:4401`(BE 파싱 전 본문 보존) · 저장 프록시 `:4402` → QA `:3001` · 제품 소스 수정 0. 부하는 60~150 SERVER/초의 **correctness 전용**(성능·CPU·L2/L3·3회 반복은 R2′).

| # | 시험 | **v3 yaml**(16:52) | **v4 yaml**(17:38) | 설계 반영 |
|---|---|---|---|---|
| 1 | validate + 기동(gate ON/OFF) | ✅ | ✅ — 환경변수 미설정 시 **명시적 기동 거부** | §2.2 ⓘ |
| 2 | 분기 정확성 | ✅ E=A=8,444 · 오포함 0 · 탈락 0 | ✅ E=A=8,431 · 동일 | §6.0 R1-1 |
| 3 | PII 13종 + 대조군 + 절단 경계 | ✅ 13/13 · 대조군 보존 · U+FFFD 0 | ✅ 동일 | §2.2 PII 불릿 · R1-2 |
| 4 | 직렬화 최대(해제 후 2 MiB) | 🔴 **FAIL — 상한 없음**(array 9.9 · poison 11.9~26.2 MiB) | ✅ 최악 **1.337 MiB**(G = N) | §2.3.0 실측 표 · batch 1,000 확정 |
| 4b | 직렬화 최대(압축본 512 KiB) | 🔴 FAIL | 🔴 **FAIL — 난수 G = N 572.4 KiB(정상 입력)** | 🔴 **압축본 상한 2 MiB**(§2.3.0) |
| 5 | `error_mode: ignore` 실패 fixture(A·B·C·D) | 🔴 **FAIL — 정리 문장 실패 시 PII 100%(1,337/1,337) 전송** · SDK 200 · 저장 중복 0 | ✅ 전량 차단(live 0 · 차단 1,351) · SDK 200 · 저장 중복 0 | §2.1 ①③⑤ · §2.2 방어 범위 표 |
| 6·8 | 전송 전 차단 `filter/live-safety` 13조건 | (없음) | ✅ 정상 오탐 0 · 실패 전량 drop · ⚠️ **조건 단위 fail-open**(v4brk 차단 1,333 / v4hole PII 1,335 통과·카운터 0) | §2.1 ⑤ 불변식·알람 · 리스크 #18 |
| 7 | 설치 가이드 3 실행줄 `--feature-gates` | 부재(문자열 0, 수정 없음) | 동일 | §2.2 실행 명령(P5.1 6단계 그대로) |
| 9 | `redaction/live.summary` | — | ✅ 기본값도 silent · **info/debug면 live 전량 소실**(470/466) | §2.2 `summary: silent` 명시 유지 |
| 10 | 직렬화 3종(G ≤ 100 · G = N · 저압축) | — | ✅ 해제 후 PASS / 🔴 압축본 FAIL | §2.3.0 |
| 11 | `truncate_all(resource,128)` + 형태 3종 | 🔴 resource 900 B 원형 통과 · 비문자열 값 통과 | ✅ 126 B 절단 · 형태 fixture 13/13 일치 | §2.2 yaml 주석 |

**종합 — v3 FAIL · v4 correctness PASS(조건부: BE 압축본 상한 수정).** 설계 정정 6건: ① `\uXXXX` 팽창 부정·R-P5 §14 2.11 MiB 철회(§2.2·§2.3·§5.1) ② gate OFF WARN 1회 실재·라벨 없음(§2.2·리스크 #13) ③ redaction 방어 범위 = 속성 값만(§2.1·§2.2) ④ `ignore` 감시 = WARN 2패턴(라벨 有·샘플링 13,196→170)·transform 실패는 메트릭 부재·`failed processing traces` 0건(§2.1 ③·§2.2) ⑤ live-safety 조건 단위 fail-open → 불변식·알람·라벨 `filter="filter/live-safety"`(§2.1 ⑤·§2.2) ⑥ 🔴 압축본 상한 512 KiB → 2 MiB(§2.3.0). 부수: `truncate_all` 문자 경계·`${VAR}` 기동 거부·`summary` 기본값. 🔴 **하네스 주의(다음 회차 R2′·R-P5″)**: 포화·poison·난수 fixture가 **저장 파이프라인에도 fan-out**돼 unique `service.name`으로 QA DB에 쓰레기 서비스 **1,950여 개**를 만들었다(R-P5b §12에서 회수) — 포화 배치 측정은 **저장 분기를 끊거나 `service.name`을 고정**한다. 미측정(R-P5b §13): BE 413/400/415 실제 거절(BE 미구현 → R-P5″) · CPU/RSS·3회 반복·L2/L3(R2′) · `num_consumers` 1 vs 2(R2′ — correctness 차이 없음) · 실 javaagent(R7).

**R2-1 CPU FAIL 처리 — 완화 후보(전부 추정, 채택 아님)와 재측 계획 R2′**

실측 문서의 한계를 그대로 인용한다: *"두 OFF 구간이 서로 39% 차이난다(0.107 vs 0.077). 호스트가 격리돼 있지 않아(기준 CPU 54~72%) 배수의 정밀도가 낮다. 따라서 '1.49배'라는 숫자를 제품 수치로 쓰면 안 된다. 그럼에도 합격선을 완화하지 않는다."*(§5.3). 이 문서도 같다 — **판정 보류가 아니라 FAIL 유지**이며, 아래는 재측에서 효과를 잴 후보 목록이지 결정이 아니다.

| # | 완화 후보(**추정**) | 기대 근거 | 대가·주의 |
|---|---|---|---|
| a | **2단 필터** — `filter/live-kind`(`span.kind != SERVER`만)를 `transform/live-normalize` **앞**에 두고, HTTP 판별 필터는 정규화 뒤에 | 정규화 `where` 평가가 전체 스팬(≈5,000/초)이 아니라 SERVER(11.6%)에만 걸린다. "필터를 receiver 가까이"의 실현 가능한 형태(receiver 직후는 이미 앞이라 더 못 당김) | 프로세서 1개 증가. 효과 크기 미측 |
| b | OTTL 문장 수 축소 — `live-slim` 13문장 중 순서·중복 정리(`keep_keys(resource.attributes)`가 `schema_url`을 못 지우는 등 필요 문장은 유지) | 문장당 순회 비용 | PII 13종 재검증이 매번 따라온다 |
| c | `redaction/live` 대신 OTTL `replace_pattern`으로 값 검사를 `live-slim`에 통합 | **직렬 처리 비용 절감 후보로만** `[C-r3 반영: §5 모순 9행]` — v3의 "fan-out 복제 1회 감소"는 **틀렸다**(직렬 processor 수와 receiver 분기 복제 수는 다르다; 복제는 분기 consumer의 변경 가능 여부로 결정 — ✅ `fanoutconsumer/traces.go`) | `replace_pattern`은 미실측(실측은 redaction만 검증). 정규식 3종을 키마다 반복. 별도 processor의 CPU 몫은 **비용 분해 측정** 전엔 모른다(질문 5 답) |
| d | `batch/live` `send_batch_size`·`timeout` 조정, `num_consumers` 1(정본 후보) vs 2 비교 | 실측 §11·§12는 1로 통과 — 2가 CPU를 더 쓰는지(반드시 두 배는 아님) | 체류 모델(§5.3) 재계산 · queue 5와 in-flight 별도 관측 |
| e | 별도 live Collector 프로세스 | 프로세스 격리 | receiver 분기 지점 공유 비용은 남고 운영 대상이 하나 는다 — **최후 순위** |
| — | **합격선 1.20** | 20%는 성능 목표의 잠정 제안(§6.4 서문) | `[C-r3 반영: 질문 2 답]` **유지**. 권장 순서 **a → b → d → c → e**(b에는 resource/scope 정리를 각 context에서 **한 번만** 수행하는 검토 포함). 🔴 a·c를 곧바로 정본 yaml에 섞지 않는다 — correctness(R-P5b)를 통과한 후보별 비교 뒤 **하나를 고정**하고 그 설정으로 정식 3회. 효과 크기는 전부 추정 |

**R2′ 재측 절차(정본)** `[C-r3 반영: 코덱스 §4.4 — 출시 게이트, P5.1 구현과 병행, 격리 호스트 확보 후]`
- **시험 대상 고정**: Collector 버전·바이너리 식별값 · BE commit(실측 QA jar와 현재 코드 동일성 확인 포함) · 하네스 버전 · **실제 생성 YAML**(§2.2 v4 결합 정본 — `[R-P5b 반영]` ✅ R-P5b 통과본 `scratchpad/rp5b/v4_on.yaml`과 문장 동일) · feature gate · 최종 `num_consumers`를 보존. 결합 YAML의 분기·PII·유효 입력 보존은 R-P5b에서 **확인 완료**. 🔴 `[R-P5b 반영: §12]` **하네스 주의**: 포화·최악 fixture는 저장 분기에도 fan-out돼 unique `service.name`마다 서비스가 등록된다(R-P5b에서 1,950개) — 크기·최악 fixture 구간은 **저장 exporter를 끊거나 `service.name`을 고정**하고, 저장 처리량·지연 판정 구간과 섞지 않는다. a~d 최적화 비교는 **탐색 시험**으로 분리하고 **최종 선택한 하나의 설정으로 정식 3회 반복**. Collector와 부하원·BE·DB·캡처의 자원 경합을 분리하고 CPU quota·throttling·메모리·시계 오차를 기록.
- **부하·반복**: **L2 1,000 SERVER/초와 L3 1,500 SERVER/초 각각 `OFF→ON→OFF × 3`**. 각 구간 **부하를 건 준비 2분 → 측정 10분 → drain 2분**. CPU·RSS는 **측정 10분만** 집계하고, 그 시간에 정의한 입력 집합의 최종 도착·저장 여부는 drain까지 추적. 같은 논리 trace·정책·크기·서비스 분포를 재현하고 생성 목표와 실제 달성 부하를 모두 기록. 낮은 부하·hot service·큰 속성·오류 100%·느림 100%는 별도 프로필, L5는 탐색.
- **유효성 기준(실행 전 고정 — 새 시험의 운영 제안값, 기존 결과 소급 아님)**: 실제 부하 목표 편차 **±2%**, 같은 묶음의 OFF CPU 편차 **10% 이내**. 벗어난 묶음은 보존하되 정식 3회에 넣지 않는다.
- **판정식(반복 i마다 — 평균으로 실패 반복을 상쇄하지 않는다)**:
  ```text
  C = 측정 구간 ΔCPU_seconds / Δwall_seconds · C_OFF,i = (C_OFF-before,i + C_OFF-after,i) / 2
  CPU: C_ON,i / C_OFF,i ≤ 1.20
  RSS: RSS_ON,p95,i / mean(RSS_OFF-before,p95,i, RSS_OFF-after,p95,i) ≤ 1.20  그리고 peak ≤ 사전 고정 프로세스 예산
  저장: 기대 저장 대상 ID 대비 추가 누락 = 0 · 저장 분기 추가 중복 전송 = 0 · 실제 DB·파생 집계 추가 중복 = 0 · 동일 입력 정상화 처리량 T_ON,i / T_OFF,i ≥ 0.99
  지연: L = 완료 시각 → 실제 저장 수용/commit 시각 · L_ON,p95,i − L_OFF,p95,i ≤ max(0.1 × L_OFF,p95,i, 500ms)
  ```
  저장 전송 ID는 `(traceId, spanId)`로 대조하고 DB 결과도 따로 확인. **최종 PASS 식에 CPU·RSS 기준도 명시적으로 AND에 포함**(§6.4 판정식 갱신).
- **장애**: 무응답·429·503·**전량 거절 partialSuccess**를 각각 120초. **실제 연결 거부와 전송 중 reset을 분리**. 정리 오류(문장 오류 검출과 정리 결과 위반 검출 각각)·잘못된 타입·gate OFF·메모리 압박(지원 부하 + backlog + 큰 속성 + 오류 100% 결합) 포함. `[R-P5b 반영: §8.3]` `filter/live-safety`의 검증 오류는 **조건 단위 fail-open**으로 관측됐다(프로세서 전체 무력화 아님) → 대안 "유계 비동기 경계 뒤 차단"은 R2′ **필수 항목에서 제외**(불변식 + 알람 `failed to eval condition{pipeline=traces/live} == 0`으로 닫음, 후보로만 존치). 대신 R2′는 **정본 13조건의 eval 오류 0**을 L2·L3·장애 프로필 전 구간에서 재확인한다.
- **복구**: 큐 대기량과 in-flight를 각각 측정. **큐 30초 · RSS 사전 정의 정상 범위 60초 · BE 버킷 freshness** 셋 다 확인.
- 이전 v3 항목 중 유지: `num_consumers` 1 vs 2 비교 · 완화 후보 a→b→d→c→e 효과(탐색) · 오류 100%·느림 100% 프로필.

**미측정 → R-P5″(P5.1 최소 종단 직후)** `[R-P5 반영: 실측 §16]`
| 항목 | 왜 못 쟀나 | 언제 |
|---|---|---|
| R1-4 집계 정확성 · R1-5 표본 분리 · R1-6 TTL 영향 · R1-8 늦은 도착·중복(61초 fixture) | BE 라이브 EP·링·집계·메타 캐시 미구현 — 캡처 서버는 "도착했다"까지만 안다 | P5.1 최소 종단 직후 |
| R1-7 완료→**화면** p95/p99 | SSE·FE 미구현 · 실제 프록시(아파치 `mod_proxy_http`) 미구성 | P5.2 + R4 |
| R1-9 BE 수량 보존식(`입력 = 신규 + 중복 + 거절`) | BE 거절 카운터 미구현 | P5.1 직후 |
| R1-10 상한 **초과 거절**(413/400/415 · 압축본 **2 MiB** `[R-P5b 반영]` — 난수 G = N 572.4 KiB 배치 **수용** 확인 포함) | BE 라이브 EP 미구현(발신 측 최대 크기는 R-P5b로 측정 완료: 해제 후 1.337 MiB) | P5.1 직후 · R6 |
| R2-10 "오래된 점을 현재 TPS에 몰아넣지 않는가" | 버킷 귀속이 BE 링 기능 | P5.1 직후 |
| writer 반환(§2.5) | SSE 미구현 | P5.1 / R6 |
| L2(1,000)·L3(1,500)·L4·L5 · 3회 반복 · 오류/느림 100% 프로필 | 호스트 천장 600/초·비격리 | **R2′**(격리 호스트) |
| `[C-r3 반영]` **결합 YAML correctness** — 정규화·필터·slim·redaction·`filter/live-safety`를 합친 정본의 PII 13곳·분기·타입/길이/절단 경계·정상 식별자 보존·`summary: silent`·검증 오류 시 통과 여부·**직렬화 최대(§2.3.0 fixture: 정상 형태 G≤100 · G=N · 저압축률)** | 서로 다른 YAML의 PASS를 합쳐 결합 PASS로 만들 수 없다 | ✅ **R-P5b 완료**(`[R-P5b 반영]` v3 FAIL · v4 correctness PASS · 발견 6 — 위 R-P5b 표) `../verification/r-p5b_apm-live-yaml-correctness.md` |
| `[C-r3 반영]` R2-3 저장 처리량의 **계약 기준**(기대 저장 ID 집합·DB·파생 집계 대조) · R2-4 저장 지연의 **commit 기준** · 실제 연결 거부/전송 중 reset 분리 · 전량 metadata 거절 partialSuccess · 결합 메모리 압박 프로필 · RSS 60초 복귀 추적 | 1차는 proxy 도착 기준·`refuse` 하네스·고정 12건 거절 | **R2′** |
| `[C-r3 반영]` 실측 QA jar와 현재 코드(`ApmSpanStore` ON CONFLICT·`ApmTraceWriter` 필터)의 동일성 · "DB 중복 행" 발생 여부 | R2-8은 중복 **전송**까지 실증 | R2′ 시험 대상 고정 단계 |
| 실 javaagent 2.31.1 BSP(드롭 카운터 `otel.bsp.dropped.spans`·앱 CPU) · Java `rule_based_routing` 자기계측 제외 | SDK 에뮬레이션으로 대체 | **R7** |
| gate가 저장 파이프라인 OTTL에 주는 런타임 영향 | 정적 확인만(`set(_, nil)` 없음) | P5.1 통합 테스트 |

**정리 — 실측이 남긴 부작용 2건 + R-P5b 부작용** `[R-P5b 반영: §12 — 전부 회수 완료]`
| 대상 | 상태 | 결과 |
|---|---|---|
| QA DB `apm_receive_token` **id 29 `rp5-live-measure`**(COLLECTOR/ingest) | ~~발급된 채 존재~~ | ✅ **회수됨**(1 → 0, 기존 QA 토큰 id 1~6 보존). R2′·R-P5″는 새 토큰 발급 |
| QA BE `:3001` → `dmove_apm`@5433의 R1·R2·R-P5b 부하 데이터(`rp5-svc-*`·env `rp5`/`rp5b` + R-P5b 포화 fixture가 만든 서비스 1,950여 개) | ~~보존 배치 대기~~ | ✅ **삭제됨** — `apm_service` 1,996 → 9(기존 `moveseye-be`·`qa-*`만) · `apm_span` 1,889,511 · `apm_trace_summary` 245,002 · `apm_otlp_receipt` 4,905 등 단일 트랜잭션(`first_seen_at = 2026-09-15` 기준, 그 이전 9건 확인 후). 🔴 dev DB `dmove`·사용자 `:3000`·`:5173`·사용자 Collector(pid 36560)는 접촉 없음 |
| RP5b Collector(`:4327/4328/8889/13134`)·캡처 `:4401`·프록시 `:4402`·큐 디렉터리 | — | ✅ 종료·삭제. QA BE `:3001`·QA DB는 존치 |

### 6.1 공통 실측 준비
| 항목 | 절차 |
|---|---|
| 환경 | 격리된 QA 환경. Collector 0.159.0·javaagent 2.31.1·JDK·BE commit·브라우저 버전·CPU quota·메모리 제한·프록시 설정(아파치 `mod_proxy_http`) 기록. `[R-P5 반영: 실측 §1]` 🔴 R-P5 1차는 **이 요건을 충족하지 못했다**(단일 QA 호스트, 기준 CPU 54~72%, 천장 600/초, OFF끼리 39% 편차) — 그래서 R2-1 배수를 제품 수치로 쓰지 않는다. R2′는 이 행을 먼저 충족한다 |
| 설정 | **실제 생성 yaml**과 실행 feature gate(`ottl.set.allowNil`) 보존. live 큐 `sizer: requests`·`num_consumers` 명시. 재시도 OFF·영속 큐 없음 확인 |
| 대상 | **HTTP SERVER**를 기본 정상 모집단으로 정의(§3.1). 비-HTTP·자기계측·잘못된 입력은 **별도 fixture**로 분리 |
| 식별 | `(traceId, spanId)`와 부하 생성기의 논리 요청 ID로 지점별 대조 |
| 시간 | 앱 완료 → Collector 수신 → live HTTP 도착 → 집계 commit → SSE 수신 → 화면 반영(차트 반영 완료, `message` 도착과 별도 기록) 시각 측정. **호스트 간 시계 오차를 먼저 측정** |
| 반복 | 각 프로필 준비 2분·측정 10분·drain 2분, **3회 반복**. DB 장애·기동 직후는 정상 구간과 별도 |
| 정상 사전 조건 | 토큰·서비스 승인 및 캐시 warm-up 완료. 🔴 **측정 중 TTL 갱신 구간은 제외하지 않는다**(soft/hard 경계가 손실을 만들면 그대로 드러나야 한다) |
| 실패 원칙 | 지점별 ID와 카운터가 맞지 않으면 **미해명 손실**로 남긴다. 표본 탈락을 수신 유실로 세지 않는다 |

### 6.2 부하 프로필 (전체 스팬 수는 SERVER 비율 13%를 쓴 **부하 생성 가정** — `[R-P5 실측 ✅ §3.3]` 실측 11.6%, 표는 유지) · ⚠️ R-P5 1차는 호스트 천장 때문에 **L2′ ≈ 600 SERVER/초(전체 ≈5,000스팬/초)**만 수행 — L2~L5는 R2′(격리 호스트)
| 프로필 | SERVER 완료/초 | 서비스 분포 | 전체 스팬/초 | 목적 |
|---|---:|---|---:|---|
| L0 | 0 · 저빈도 교대 | 1~10서비스 | 변동 | heartbeat·idle·batch timeout·"갱신 중" 판정 12초 |
| L1 | 100 | 10서비스 균등 | 약 770 | 낮은 부하의 batch 지연 |
| L2 | 1,000 | 10서비스 × 100 | 약 7,700 | **기본 지원 부하(수신 상한)** |
| L3 | 1,500 | 200서비스 균등 분산 | 약 11,540 | 다서비스·메타·전송 상한·arena 슬롯 할당(세그먼트 반례 재현) |
| L4 | 1,000 | 단일 서비스 | 약 7,700 | 집계 전량과 보관 200점/초 분리 |
| L5 | 5,000 | 다서비스·10초 burst 포함 | 약 38,460 | 처리율 확장·과부하 경계 **탐색**(지원 상한 채택 전까지 필수 통과 아님) |

오류·느림은 정상 혼합 외에 **오류 100%·느림 100%**를 별도로 수행한다.

### 6.3 R1 — 분기·PII·정합성·지연 (**착수 전 필수**)
정상 적격 ID 집합을 `E`, BE 신규 집계 ID 집합을 `A`로 둔다.

| 검증 | 절차·측정 지점 | 합격/불합격 판정식 |
|---|---|---|
| 분기 정확성 | 모든 span kind, **구/신 HTTP 속성**, RPC, 자기계측 fixture를 Collector 전후에서 대조. `span.kind != SPAN_KIND_SERVER` vs `kind.string` 둘 다 | 비대상 오포함 = 0. 정상 적격 대상의 의도치 않은 필터 탈락 = 0 |
| PII 제거 | name·message·events·links·trace state·scope(name/version/schema URL 포함) 및 허용 속성에 식별용 문자열 삽입. **BE 파싱 전 live HTTP 본문**(프록시 캡처) 검사. `ottl.set.allowNil` on/off 각각 `[R-P5 실측 ✅ §3.2·§4.2·§4.3 — 13곳 심기 완료, v2 원문 4종 유출·H3 0종·gate OFF +3종]` | 금지 문자열 통과 = 0 **이고** 정상 fixture 전달 확인. 전부 버려서 0건이 된 결과는 **불합격**. R2′에서 **정본 yaml(합친 것)**로 같은 13곳 재확인 |
| 정상 유실 | L1~L3에서 Collector 도달 적격 ID와 BE 집계 ID 비교 | `loss = |E \ A| / |E| < 0.001`, **각 반복 모두** 충족 |
| 집계 정확성 | 생성기 정답과 `endTs` 버킷 count·http5xx·spanError·slow·sum 비교 | 수용된 고유 관측에 대해 count·오류(2축)·slow 오차 = 0. p95는 histogram 정의에 따른 근사 범위로 비교 |
| 표본 분리 | L4·오류 100%에서 전체 집계와 보관 수 동시 관측 | `stats.count = 수용 고유 관측 수`, `retained ≤ 상한`. **reservoir 탈락으로 `rejectedSpans`가 증가하면 불합격** |
| TTL 영향 | 10분 동안 토큰·서비스·라이선스 캐시 갱신 시점별 거절·DB 접근 측정 | hot path DB 호출 = 0. **TTL마다 반복 거절하면 불합격**. 정상 총 유실률에도 포함 |
| 지연 | 실제 프록시를 통과해 완료→링, 완료→SSE 수신, 완료→화면 반영 측정(`OTEL_BSP_SCHEDULE_DELAY=1000`) | `p50(완료→링) < 5초` · `p95(완료→화면) ≤ 5초` · `p99 ≤ 10초`. 🔴 **유실률과 지연을 반드시 함께 통과**(전달된 점만 골라 재면 손실이 숨는다) |
| 늦은 도착·중복 | 0·3·6·30·**61**초 지연 및 역순·재전송 fixture | 버킷 귀속 오류 = 0. 계약한 dedup 기간(60초) 안 추가 집계 = 0(61초는 한계 **관측**). `provisionalUntil` 이후 수정이 FE에 반영되지 않으면 불합격 |
| 부분 성공 응답 | 수용/거절 혼합, 중복-only, 잘못된 JSON, 429·503 응답 | BE **수량 보존식**(§2.3) 일치. 유효 partialSuccess는 exporter 재전송 = 0·WARN 확인. 503도 retry OFF에서 exporter 재시도 = 0 |
| URL·본문 상한 | context path·끝 슬래시·최대 문자열·2,000개 배치·gzip 경계값 | 목적 경로 일치. 제한 이하 수용·초과 계약대로 거절. **평균 크기만 확인하면 미완료** |
| writer 반환 `[v2 신규]` | 느린 클라이언트(수신 정지)에 deadline 2초 초과 → 연결 중단 후 writer 스레드 반환 여부 | 반환 확인. 안 되면 §2.5 대안(비동기 I/O) 채택 |

### 6.4 R2 — Collector 비용과 저장 경로 보호 (**착수 전 필수**)
동일 부하를 **OFF → ON → OFF** 순서로 반복해 시간 경과 변동을 확인한다. tail 정책 비교에는 같은 논리 trace 집합과 동일 정책을 쓰고, 저장 결과는 raw export ID와 실제 저장·메트릭 집계 양쪽에서 확인한다.

| 검증 | 절차·측정 지점 | 합격/불합격 판정식 |
|---|---|---|
| 정상 CPU | L2 필수, L3 추가. Collector CPU seconds 증가량 ÷ 측정 시간 | `C = ΔCPU_seconds / Δwall_seconds`. 잠정 `C_ON / C_OFF ≤ 1.20`. quota·throttling도 기록 |
| 정상 메모리 | 동일 구간의 RSS·Go heap·큐·in-flight 관측 | 잠정 `RSS_ON,p95 / RSS_OFF,p95 ≤ 1.20`, peak는 설정한 프로세스 예산 이내 |
| 저장 처리량 | live OFF/ON의 저장 대상 trace ID·메트릭 입력과 출력 대조 | **추가 유실 = 0 · 추가 중복 = 0**. 정상화 처리량 비율 `T_ON / T_OFF ≥ 0.99` |
| 저장 지연 | 완료→저장 수용/commit의 p95 비교 | 잠정 `L_ON,p95 − L_OFF,p95 ≤ max(0.1 × L_OFF,p95, 500ms)` |
| live 무응답 | live EP만 3초 초과 무응답으로 120초 유지 후 복구 | 저장 처리량·지연 기준 유지. live 실패 계수 증가. retry OFF 유지 |
| HTTP 거절 | live EP가 429·503·전량 metadata 거절 partialSuccess를 각각 120초 반환 | 응답별 전송 실패/WARN/BE 거절 계수가 예상대로 구분. 저장 추가 유실·중복 = 0 |
| 연결 거부·reset `[C-r3 반영]` | live 목적지만 **실제 연결 거부(listen 없음)**와 **전송 중 reset(수락 후 RST)**을 각각 | 저장 기준 유지. live 큐·in-flight가 선언한 상한(queue 5 + consumers 선택값 — 정본 후보 1) 초과 시 불합격. 하네스의 "수락 후 끊기"는 둘 중 어느 것도 대체하지 않는다 |
| transform 실패(**`ignore`** — v3) `[R-P5 반영: 실측 §13]` `[C-r3 반영: 질문 1 답 — 두 검출을 각각]` | 잘못된 타입·정리 문장 실패 fixture 주입 — 특히 입력 의존적인 `transform/live-normalize`·`redaction/live`에. **재시도하는 SDK**(5xx/429 최대 3회)로. **(a) 문장 오류 검출**: 정리와 무관한 문장을 실패시켜 payload 형태는 정상인 fixture · **(b) 정리 결과 위반 검출**: 정리 문장을 실패시켜 잔존 필드가 남는 fixture | ✅ `propagate`는 실측으로 불합격(저장 중복 26,769 = 300%)이라 폐기. `ignore`에서 receiver 응답 200 · SDK 재전송 0 · 저장 추가 유실·중복 0(실측 §13.2와 동일) **이고** (a)는 Collector 로그 WARN `failed to execute statement`/`failed to eval condition` 계수(`otelcol.component.id`·`otelcol.pipeline.id` 라벨, 샘플링이라 규모 신호 — `[R-P5b 실측 ✅ §7b]`)로 잡히고, (b)는 **`filter/live-safety`가 전송 전에 drop**(`otelcol_processor_filter_spans_filtered{filter="filter/live-safety"}` 상승 — `[R-P5b 실측 ✅ §7d·§8]` v4fclean: live 0·차단 1,351)하며 BE 카나리아 `slimBypassed{reason}`는 0 — 위반 스팬이 BE에 도착하면 **불합격**. 추가 (c) `[R-P5b 반영: §8.3]` **live-safety 조건 결손 fixture**(조건 하나를 실패 표현으로 교체 + 정리 실패)에서 `failed to eval condition{pipeline=traces/live}`가 0이 아니면 알람이 뜨는지 — 정본 13조건은 이 WARN이 0이어야 한다. 🔴 "모든 processor 오류가 카나리아를 올린다"는 시험식은 쓰지 않는다(a에서는 payload가 정상이라 카나리아 0이 정답) |
| 메모리 압박 | 지원 부하에서 live backlog·큰 속성·오류 100%로 압박. 전체 quota 초과 실험은 별도 표시 | 지원 예산 안에서는 저장 기준 유지·OOM = 0·무한 증가 = 0. 예산 밖 결과를 정상 지원 보장에 섞지 않음 |
| 복구·freshness | 장애 해제 후 queue age·endTs age·RSS 추적 | 잠정 30초 안에 live 큐 정상화, 60초 안에 RSS가 장애 전 정상 범위로 복귀. **오래된 점을 현재 TPS에 몰아넣으면 불합격** |

CPU·RSS의 20%는 **성능 목표의 잠정 제안**이다. 저장 데이터의 추가 유실·중복 0과는 **다른 종류의 기준**이다 — 자원 목표가 실패하면 비용을 보고 설정·지원 부하를 다시 결정할 수 있지만, **저장 정확성 실패를 허용 오차로 덮지 않는다**.

```text
R2 PASS   [C-r3 반영: CPU·RSS를 AND에 명시]
  = 저장 추가 유실 0 (기대 저장 ID 집합 대비)
  ∧ 저장 추가 중복 0 (전송 · DB · 파생 집계 각각)
  ∧ 저장 처리량·지연 기준 충족 (지연은 완료→저장 수용/commit)
  ∧ C_ON/C_OFF ≤ 1.20 ∧ RSS 비율 ≤ 1.20 ∧ peak ≤ 예산   — 각 반복 모두
  ∧ 모든 live 큐·동시성·메모리가 선언한 상한 이내
  ∧ 실패·부분 거절·복구를 관측 가능
```

### 6.5 R3~R7 (v1 유지, 대상만 v2 자료구조로 갱신)
| # | 무엇을 | 착수 전 | 방법·보강 | 합격선(잠정) | 막히면 |
|---|---|---|---|---|---|
| **R3** | 링 힙 — **arena 시제품** `[C-r2 반영]` | **최소 시제품 필수** | 균등 10서비스 + 단일 hot service + **200서비스 × 1점/초(세그먼트 반례)** + route/instance churn + 오류 100% + arena 압박·회전 + **슬롯 연결 목록의 표본 위치 접근 비용** + 세그먼트 lazy 할당 지연·고수위 retained 대 논리 점유 `[X-r1 정정]` + snapshot 버킷 복사 비용(동시 2개의 락 점유 — admission 2의 근거) + 라이브 선택 파서 비용. retained heap·할당률·GC 일시정지·chunk 직렬화 peak | 상주 ≤ `max-heap-mib` · GC 일시정지 p99 < 50ms(추정 기준) · tick 시간 p99 < 200ms | `points-per-bucket`·강조·arena 하향(short 축소 금지), 위치 인덱스 추가 |
| **R4** | 브라우저 렌더·진입·재접속 | **렌더 방식·상한 확정 전 필수** | 300k/450k 초기 snapshot(**chunk 조립 포함**) · 5분/15분 · 버킷 교체 재구성 · 브러시·표 정렬 · 다중 탭·숨김 복귀·재접속(`sinceSeq` 재생·snapshot 각각). 헤드리스 Chrome CDP `Performance`(QA §C 방식) | 갱신 p95 < 100ms **이고** 최장 정지 < 500ms·메모리 < 500MB·입력 반응 < 200ms — 하나만으로 합격 선언 금지 | 클라이언트 상한 하향·기본 창 2분 |
| **R5** | Java 확장 `SpanProcessor.onStart` | P5.1~5.4 불필요 · **P5.3b 착수 전 필수** | 시제품 jar → 시작 이벤트 별도 경로 → BE. route 미확정·종료 유실·역전·crash·장기 요청·다중 SERVER/trace·지원 버전 호환. 앱 p99·할당·CPU | 시작→표시 < 2초 · 앱 p99 영향 < 1% · 유령 액티브 0 | P5.3b 보류 |
| **R6** | 수신·보안 장애 | **계약 확정 전 설계 필수 · 출시 전 실측 필수** | 토큰 저장소 장애·회수(30초 내)·라이선스 만료(60초 내)·미지원 encoding·압축 폭탄·과대 배치·느린 본문·연결 41/51개·snapshot 폭주·프록시 경유·**필터/인터셉터/바인딩 단계별 예외 fixture**(§2.3 3단) | 응답 코드 표(§2.3) 그대로 · **500 0건** · 저장 경로 영향 0 | 관문 순서·상한 조정 |
| **R7** | BSP 1,000ms A/B | P5.2 출시 전 | 앱 CPU·할당·export 횟수·SDK 드롭·종료→화면 p95를 5,000ms vs 1,000ms 비교 | 앱 CPU 증가 < 2%(추정 기준) | 권고 문구 조건부 유지(Q16) |

---

## 7. 단계 · 공수(달력) · 의존 · 리스크 — 코덱스 재추정을 정본으로 `[C-r1 반영]`

전제: 기존 QA 환경 사용 가능·설계 왕복이 당일 이어짐. v0의 "주 단위 산정 ÷ 배수"는 폐기(지속 스트리밍·부하·유실·재접속 검증이 추가되는 작업에 일괄 배수는 부적절).

| 단계 | WBS | 착수 순서·완료 기준 | 달력(추정) | 의존 |
|---|---|---|---|---|
| R-P5 선행 | 9.0 | R1·R2 `[R-P5 반영]` ✅ **2026-09-15 완료**(실측 문서 921줄, 제품 소스 수정 0) — R1 🟡 조건부 PASS · R2 🔴 FAIL → v3 P0 7건 반영. 최소 링·브라우저 시제품(R3·R4 일부)은 **아직**(arena·chunk 시제품은 P5.1 착수와 병행) | **1일(소진)** | Collector·샘플 앱 환경(QA 재사용) |
| **R-P5b 결합 YAML correctness** `[C-r3 반영: 신설]` `[R-P5b 반영]` | 9.0a | ✅ **2026-09-15 완료**(584줄, 제품 소스 수정 0) — v3 yaml FAIL · **v4 yaml correctness PASS**(PII 13/13·분기·경계·live-safety 13조건·형태 13/13·`summary`·직렬화 3종) · 발견 6건 → v4.1 반영(압축본 상한 2 MiB·`\uXXXX` 철회·방어 범위·감시 패턴·조건 단위 fail-open·gate WARN) — `../verification/r-p5b_apm-live-yaml-correctness.md` | **1일(소진)** | 6단계 생성기는 R-P5b 통과본 문장 그대로. 코덱스 4회차 검수 대상(설계값 변경 1건) |
| **R2′ 격리 재측** `[R-P5 반영: 신설]` `[C-r3 반영: 절차 정본 = §6.0]` | 9.0b | §6.0 R2′ 절차 — 시험 대상 고정 · L2·L3 각각 OFF→ON→OFF × 3(준비 2·측정 10·drain 2분) · 유효성 ±2%/10% · 판정식(ID 집합·commit 기준) · 장애(실제 거부/reset 분리·전량 거절·결합 압박) · 복구 3항목 · `num_consumers` 1/2 · 완화 후보 탐색 | **0.5~1일**(+ 격리 호스트 확보) | 격리 호스트. 🔴 **live 기능 활성화·출시 게이트**(구현과 병행 — 결과가 Collector 설정값만 바꾸도록 BE 계약을 yaml 세부에 묶지 않는다) |
| **P5.1** | 9.1 | **구현 순서·첫 커밋·회귀 목록은 §7.1 정본** `[C-r3 반영]` — 1 수신 관문(P5 OFF) → 2 본문·부분 성공 계약(§2.3.0) → 3 메타 캐시 → 4 집계·dedup·arena 최소 종단 → 5 snapshot·SSE → 6 Collector 생성 설정·운영 관측(결합 yaml·3 OS gate·기존 설치 갱신·확장 카나리아·`ApmCollectorMetricStore` 확장 — 수집→보존→조회→화면) → 7 계약 표본 확정(P5.2·P5.3 종단과 함께). 계약 표본 JSON `test/resources/apm/contract/` · 별칭 deprecated 정리(P2-1) 포함 | **2.5~3.5일**(v3 2~2.5 + 6단계 메트릭 계약·`live-safety`·확장 카나리아·기존 설치 갱신 0.5~1일) | R1·R2 1차 ✅ · **R-P5b ✅ 완료**(6단계 선행 조건 충족 — 단 1단계에 압축본 상한 수정 라운드, §7.1) · **R-P5″는 1~5단계 직후** · **API 계약 확정은 R-P5″ 회귀 뒤** · R2′는 출시 게이트 |
| **P5.2** | 9.2 | X-View·표본 표시·버킷 교체 렌더·브러시·점 상세·재접속·필터·진입 부하 검증 **+ UX §2 추가분**(패널 상태 머신·배지·브러시 표 이전/다음·필터 재해석·군집 hover 인덱스·일시정지 frozen 사본·`at` 부분 복원·control 전건·키보드·`ApmLiveScatter` 자체 소유) | **1.5~2.5일**(v2 1~1.5일 + UX 추가분 0.5~1일 `[UX-r1b 반영: 포함]`) | P5.1 계약 · R4 |
| **P5.3** | 9.3 | 게이지·이퀄라이저·인스턴스 합산 액티브·리소스 4종·freshness·관제실 모드 **+ UX §1 추가분**(속도계 빌더·정렬 3옵션·타일·wall 배치·전체화면 버튼·다크 스코프·2구간 규칙) | **1~1.5일**(v2 0.5~1일 + UX 추가분 0.5일 `[UX-r1b 반영: 포함]`) | P5.1 |
| 검수·종단 QA | 9.7 | 코덱스 검수 2회 + E2E(`e2e_apm-realtime-qa.md`) — 장애·부하·권한·재접속 | **0.5~1일** | 전부 |
| **합계 — 첫 출시(P5.1~5.3 + 검수, P5.4·5.3b 제외)** `[C-r2 반영]` `[UX-r1b 반영]` `[R-P5 반영]` `[C-r3 반영: §5 모순 10행 — 재합산은 §7.2]` | | 🔴 **P5.6·P5.6b는 이 합계에 포함하지 않는다** — 독립 트랙(P5.1 비의존)이라 병행하며 아래 행에서 별도 계상. R2′(0.5~1일)·R-P5b(0.5일)·소진 1일은 합계 **밖**(§7.2 구분) | **남은 구현 약 5.5~8.5일**(세부 합 2.5~3.5 + 1.5~2.5 + 1~1.5 + 0.5~1 = 5.5~8.5 — v3는 세부 합 5~7.5와 합계 5.5~8.5가 어긋났다) + R2′ 0.5~1일 별도 | |
| P5.4 후속 | 9.4 | 자료구조 추가(§4.4) + R3 재실행 + 패턴 휴리스틱(상수 v1)·EWMA 기준선·warm-up·backtest(계절 기준선은 표본 충족 뒤) + UX §2.7 오버레이·칩 규칙(추가분 0) | **1.5~2.5일** → 누적 **약 7~11일**(5.5~8.5 + 1.5~2.5 — v3의 "7~10"은 오기) `[C-r3 반영]` | P5.1·P5.3 |
| P5.5 후속 `[v2 신규]` | 9.5 | 비-HTTP SERVER protocol 판별·통계/표본/사전 분리·비용 재산정 | **1~2일(추정)** | P5.1 |
| **P5.6 비동기 모니터링(첫 출시)** `[UX-r1 반영]` `[UX-r1b 반영]` | 9.6 | UX §3.1 **첫 출시 5항목**: 순수 함수 2(`apmAsyncMarks`·`apmAsyncSummary`) + 링크 팝오버·같은/다른 trace 이동(조상 펼침·가시 index 스크롤·선택 관계선) + 부모 종료 이후 마커·해칭 + `asyncOnly`·선택 복귀 + 빈 상태·404 문구·`from*` 복원 + (선택) kind 자기 시간 카드 + 패널 links 절 + 메시징 링크 키 정정 + 도움말·기존 `no_links` 문구 수정. 🔴 프로파일 탭(`?tab=async`)은 여기 아님(P5.6b) | **FE 1.5~2.5일 + R-P5.6 0.5일 = 2~3일**, BE 0 | **없음(P5.1 비의존)** — 선출시 가능. 🔴 **출시 게이트 = R-P5.6 ⓑ·D-1·3·4·5 합격**(§4.5·UX §3.5) |
| **P5.6b 비동기 후속** `[UX-r1b 반영]` | 9.6b | 프로파일 탭 `?tab=async`(kind별 자기 시간·시간상 겹침 sweep line·스레드 속성별 묶음 레인) + 링크 그래프 표 + 발행→모든 소비 역탐색 + 링크 대상 kind 일괄 확인(UX §3.2) — **BE 항목 F1~F4 포함** | **추정 3~5일**(FE 2~3일 + BE 필드·EP 1~2일) | P5.6 출시 + R-P5.6 합격 + 아래 "후속 BE 항목" F1~F4 계약 확정 |
| P5.3b 별도 | 9.3b | R5 → 확장 jar·시작 경로·종료/유실 복구·호환성 검증 **+ UX §1 경과 구간 스택 이퀄라이저**(시작 이벤트 F5가 있을 때만) | **추가 3.5~5.5일**(v2 3~5일 + UX 추가분 0.5일 `[UX-r1b 반영: 포함]`) + 제품 지원 결정 | R5 |

**후속 BE 항목 — P5.6b·P5.3b에서 결정** `[UX-r1b 반영: UX 정본 §6.3 F1~F5]` — 첫 출시(P5.6)의 "BE 0"을 지키기 위해 여기 **미결정 항목**으로만 적는다(계약은 해당 단계 착수 시 `_workspace/contract_*.md`로).
| # | 대상 | 요청 | 쓰는 곳 | 단계 |
|---|---|---|---|---|
| F1 | `ApmTraceDetailDto.Span` | **인스턴스/프로세스 식별자**(`instanceId` 또는 `service.instance.id` 해시 — §3.2 `dict.instances.key`와 **같은 입력(Collector 정리 후 도착 값)·같은 산식** `[C-r3 반영]`이어야 라이브↔상세 대조 가능. 🔴 저장 경로는 redaction을 거치지 않으므로 원본 값이 남는다 — 대조하려면 저장 측도 같은 정리 규칙을 적용한 값으로 해시해야 한다(착수 시 결정)) | 스레드 속성별 묶음 레인(같은 `thread.name`의 두 JVM 분리) | P5.6b |
| F2 | `ApmTraceDetailDto.Span` | **`linksTruncated: boolean`**(적재 32개 상한 절단 여부) + (선택) `linksTotal` | 요약 "응답에 포함된 링크 L개(전체 M개 중)" — 완전성 문구 회복 | P5.6b |
| F3 | 신규 EP | **역방향 조회** `GET /apm/traces/{traceId}/linked-from`(이 trace를 링크로 참조하는 trace·span 목록, 시간 범위 상한 필수 — links jsonb 역색인 비용은 착수 시 산정) | 발행 → 모든 소비 묶어 보기 | P5.6b |
| F4 | 신규 EP(선택) | **링크 대상 kind 일괄 확인** `POST /apm/traces/links/resolve`(`[{traceId, spanId}]` → `[{stored, kind, name}]`, 요청당 상한) | 팝오버 "발행/소비" 라벨·저장 여부를 한 번에(첫 출시는 클릭 시 개별 조회) | P5.6b |
| F5 | P5.3b 시작 이벤트 | 시작 시각이 있는 진행 중 목록(§4.3 그대로 — 별도 항목이 아니라 P5.3b 자체) | 경과 구간 스택 이퀄라이저 | P5.3b |

착수 순서: **P5.6(비동기 첫 출시, 독립 — 라이브 실측을 기다릴 이유가 없고 사용자 요구 3기능 중 가장 빨리 보인다) ∥ R-P5.6 ∥ R-P5b(결합 YAML correctness, 진행 중) → P5.1 §7.1 1~5단계(최소 종단) → R-P5″ → API 계약 확정 → 6단계(Collector 정본 배포·운영 관측) → 7단계 = P5.2 → P5.3 → R2′ 통과 → (출시) → P5.4 → P5.5 → P5.6b(BE F1~F4 확정 뒤)** `[UX-r1 반영]` `[UX-r1b 반영]` `[C-r3 반영]`. P5.1 계약 확정 뒤 P5.2·5.3 화면 일부는 겹칠 수 있다(잠정 계약으로 진행). 계절 기준선의 학습 시간(≥8주)은 공수와 별개다. 통합 WBS(`devdesign_apm-screens-wbs.md`) WS-9 개정은 **P5.1 계약 확정 시점**에 한다(Q15 — 아직 예정 작업).

### 7.1 P5.1 구현 계획(정본) `[C-r3 반영: 코덱스 §4.3 — 구현 순서 7단계 · 첫 커밋 · 회귀 목록]`

🔴 **첫 커밋은 1번 범위로 한정한다. Collector에서 live 전송을 먼저 켜지 않는다** — 라이브 블록이 생성 yaml(`POST /apm/collector-config`)에 들어가는 시점은 6단계이고, 그 전에는 어떤 Collector도 `/apm/otlp-live/**`로 보내지 않는다. 각 단계는 커밋 단위이며 "필수 회귀"가 그 커밋의 테스트 범위다.

> 🔴 **v4.1 수정 라운드 — 코덱스가 지금 구현 중인 1단계에 전달** `[R-P5b 반영: §6.2]`: 1단계 설정값 중 **`app.apm.live.spans.max-compressed-bytes`의 기본값을 524,288 → 2,097,152**로 바꾼다(해제 후 `max-body-bytes` 2,097,152는 불변, 두 상한은 **독립 유지**). 근거: 정본 yaml을 통과한 정상 입력(난수 값·그룹 = 스팬 수·1,000스팬)의 gzip이 572.4 KiB라 512 KiB 관문에서 413이 난다. 함께 바뀌는 것 — 2단계 회귀의 압축본 경계값(2,097,151/152/153) · 저압축 fixture는 "수용"이 정답 · 프로퍼티 문서 문구("압축본 상한 = 해제 후 상한과 동일, gzip 폭탄의 회선 읽기 유계용"). 1단계 커밋이 이미 524,288로 나갔다면 별도 커밋으로 정정하고, 아직이면 반영해서 낸다. 그 밖의 1단계 범위는 변경 없음. **API 계약 확정 시에는 수량 보존식·바이트 제한·재접속 경계가 테스트 가능한 표본(`test/resources/apm/contract/`)과 일치해야 한다.**

| 순서·커밋 단위 | 구현 범위 | 필수 회귀 |
|---|---|---|
| **1. P5 기본 OFF 상태의 수신 관문** 🟢 `[impl-r1 반영]` **구현 완료**(커밋 `f4031ef` → master `56bc0a6`, :test 3,326 green — 검수 `../reviews/review_apm-p51-s1-be_claude.md` 🔴3 전건 수정 라운드 반영 `review_apm-p51-s1-be_codex-fix.md`) | `ApmOtlpLiveController`(`collector/ingest/`) · 전용 guard `LiveIngestGuardFilter`(경로 매칭, JSON 503) · `SecurityConfig` `/apm/otlp-live/**` permitAll · 유계 body reader(`readBounded` 재사용)·스트리밍 선택 파서(`JsonParser` 토큰 단위) · OTLP 오류 변환(`/apm/otlp-live/**` 한정 `@ControllerAdvice` → 400/413/415/503) · 설정값 `app.apm.live.spans.*`(상한 2개 — 해제 후 2,097,152 · 압축본 **2,097,152** `[R-P5b 반영]` · 스팬 수·읽기 시간·동시 해제·`enabled` **기본 false** — false면 인증 통과 뒤 **503 `APM_LIVE_DISABLED`** OTLP 본문, `disabled` 계수) · `LicenseArchitectureTest.MACHINE_CLIENT_CLASSES` FQN 등재 · `OtelArchitectureTest` 방향 · `[impl-r1 반영]` 동시 수신 상한은 **압축·무압축 공통 admission 4**(`max-concurrent-requests`)로 정정(1단계 검수 🔴-2 — 최초 구현은 gzip 요청에만 세마포어가 걸려 무압축 경로가 무제한이었다) | **permitAll**: 세션 없는 유효 수신 토큰 성공 · 잘못된 토큰 401(OTLP 본문) · 용도·라이선스 403 · **사람용 envelope 미유입** · 기존 OTLP `/apm/otlp/**`·사용자용 live API `/apm/live/**` 권한 유지 · 필터·바인딩·Content-Type 예외도 계약대로(500 누출 0) · `enabled=false` 503 |
| **2. 본문·부분 성공 계약** 🟡 `[impl-r1 반영]` **구현 완료**(HEAD `56bc0a6` 위 미커밋, :test 3,400 green — 검수 `../reviews/review_apm-p51-s23-be_claude.md` 🔴2 중 이 단계 관련분 없음, 🟡 Y3·Y4·Y9는 수정 라운드 대상) | §2.3.0 — 압축 전후 **독립** 상한(해제 후 2,097,152 / 압축본 2,097,152 `[R-P5b 반영]` — 같은 값이지만 결합하지 않는다) · 무압축 정책 · gzip 아닌 인코딩 415 · 1,000스팬 수용 규칙(초과분 partialSuccess `batchOverflow`, 이력: 1단계 임시 배치 전체 413 → 2단계 교체) · 거절 사유 카운터(§3.3 "거절 사유 한 벌 정리") · 수량 보존식 · `errorMessage` 형식 · `Content-Type: application/json` 응답 | 각 바이트 상한의 **직전·동일·초과**(해제 후 2,097,151/152/153 · 압축본 2,097,151/152/153 양쪽) · Content-Length 없음·거짓 값 · 낮은/높은 압축률(R-P5b 난수 G = N 572.4 KiB 배치 **수용** · 비압축 데이터 ≈ 2 MiB 경계 · 반복 문자열 고압축 폭탄 → 해제 중 413) · 깊은 JSON · 큰 미사용 필드 · 느린 본문 · **입력 = 신규 집계 + 중복 + 실제 거절** 보존식 · 999/1,000/1,001 · 혼합 · 중복-only · 전량 거절 · 표본 탈락이 `rejectedSpans`에 섞이지 않음 |
| **3. 메타 캐시** 🟡 `[impl-r1 반영]` **구현 완료**(HEAD `56bc0a6` 위 미커밋, :test 3,400 green — 검수 `../reviews/review_apm-p51-s23-be_claude.md` 🔴2 중 R2(라이선스 fail-closed, §2.3.1 반영 완료) · R1(배치 단일 deadline, §2.3.1 반영 완료)은 **정본에는 반영했으나 코드 수정 라운드는 별도 확인 필요**) | `LiveMetadataCache`(§2.3.1) — refresh-ahead 20초 · hard expiry 30초 · single-flight · generation · 회수 상태(REVOKED) 보존 · 음성 캐시 · `@TransactionalEventListener(AFTER_COMMIT, fallbackExecution)` · 무효화 경로 전수(13 — `createPending` 가산) · 라이선스 provider freshness 참조(매 요청 재계산·fail-closed) · **배치 단일 deadline**(hard 만료 서비스가 여럿이어도 배치당 3초 1회) | **AFTER_COMMIT**: commit 후 반영 · rollback 시 변화 없음 · 오래된 refresh가 새 상태를 덮지 않음(generation) · TTL 경계 반복 거절 없음 · hot path DB 0(라이선스 제외, 60초 1회) · 토큰 회수 30초·라이선스 60초 freshness 상한 · **배치 단일 deadline 3초** — 서로 다른 hard 만료 서비스 N개 배치가 3초 안에 반환하고 `metadataUnavailable × N`이 되는지 |
| **4. 집계·dedup·arena 최소 종단** `[impl-r1 반영]` 🟡 `[impl-r2 반영]` **구현 완료**(worktree `p5-live` HEAD `84edbb9` 위 미커밋, 전체 `:test` 3,456 green·신규 43건 — 검수 `../reviews/review_apm-p51-s4-be_claude.md` 🔴1·🟡13, 구현 보고 `review_apm-p51-s4-be_codex-impl.md`. 🔴 R1(사전 route/instance ID가 프로세스 전역 시퀀스라 65,534개 소진 후 영구 `__other__`)은 **병합 전 수정 필수** — §2.4 사전 절 참조) | 🔴 **첫 항목 — 토큰당 rps 429**(기본 10, burst 20 — §2.3.0) **와 permitAll 경로 음성 캐시 오염 완화**(토큰/서비스 LRU 예산 분리 2,000/8,000 — 2~3단계 구현에 이미 반영됨, 정본 단계 배정만 v4.1까지 누락돼 있었다: `/apm/otlp-live/**`는 permitAll이라 미인증 발신자가 임의 bearer로 캐시 항목 생성·DB 조회 예약을 유발할 수 있고, rps 제한 전에는 `enabled=false` 기본값이 유일한 방어선이므로 **라이브를 켜기 전(6단계 전) 반드시 이 항목부터 닫는다**) · 전체 집계 슬롯(104B) · 표본(reservoir) 분리 · 60초 dedup(전체 키 비교, 임시 `BoundedLiveDedupIndex` → arena 통합 시 교체) · 전역 슬롯 arena(세그먼트 lazy·예산·압박) · 사전 예산 20 MiB·ID 재사용 금지 · 시간 규칙(`future`·`stale`·`provisionalUntil`) · **서비스별 락**(2~3단계 dedup의 전역 `synchronized`를 이 단계에서 **키 샤딩**으로 쪼갠다 — 서비스별 또는 traceId 해시 스트라이프, 2~3단계 검수 🟡 Y10) · **훅 위치** `LiveSpanAdmission.reject()`/`aggregate()`(집계·거절이 갈라지는 지점 — 현재는 `LiveDedupIndex.ingest(traceId, spanId, BooleanSupplier aggregate)`가 원자성 경계를 구현체 안에 숨겨 두어 샤딩 교체 시 호출부를 건드리지 않아도 된다) · 🔴 **삭제 이벤트 구독 의무** — 서비스 삭제 무효화(§2.3.1)가 메타 캐시뿐 아니라 **링·사전·공유 snapshot·재생 로그**까지 정리해야 한다(그 서비스의 버킷 즉시 비움 + `removeServices` 다음 tick 발행) · `dedup.reserve(spans)` 선검사(포화 503이 배치 중간에 터지지 않도록 배치 진입 전에 용량 확보, 2~3단계 검수 🟡 Y4) · `instanceBudget` 상한 결정(§2.4 사전) · `[impl-r2 반영]` **5단계 연결 지점** — `copyBucket()`·`copyDictionary()`·`removalsAfter()`(SSE·snapshot·재생 로그가 이 3개 훅에 붙는다 — 이번 4단계 범위에는 미구현) | **R3 최소 시제품 우선**: 200서비스 × 1점/s · hot service · churn · 오류 100% · 회전 · 고수위 — 마지막 세그먼트까지 arena 슬롯 상한 준수(7,360 포함) · 0/3/6/30/61초 지연·역순·재전송 · `endTs` 귀속 · retained heap·GC·락 시간 · **rps 429**: burst 20 초과 즉시 거절·burst 내 통과·토큰별 독립 버킷 · LRU 예산 분리(2,000/8,000)로 한쪽 오염이 다른 쪽을 밀어내지 않음 · `[impl-r2 반영]` **reservoir 균등성 회귀**(고정 시드 1,000점 → 200칸 버킷, 보관 spanId 평균 400~600 확인 — 4단계 검수 🟡 Y9, 변이 "항상 최신 우선"이 기존 회귀를 전부 통과해 미검출됐다) · **사전 ID 소진 회귀**(서비스 A·B가 같은 id를 독립 발급해도 충돌하지 않음 · 한 서비스에서 65,534 소진 시 `__other__`로 접히고 다른 서비스는 무영향 — R1 수정 확인용). **R-P5″(R1-4·5·6·8·9 BE 보존식·R2-10 몰아넣기)는 5단계 뒤 즉시** |
| **5. snapshot·SSE** 🟢 `[impl-r3 반영]` **구현 완료**(worktree `p5-live` 커밋 `3c76a74` — 선별 424건 green·`AuthorizationContractIT` 실컨텍스트 11건 green. 검수 `../reviews/review_apm-p51-s5-be_claude.md` 🔴0·🟡11 → 병합 가능, D1~D3은 이 문서에 반영 완료·**6단계 착수 전 Y1·Y2·Y3 권고**는 잔여) | `GET /apm/live/spans/stream` — 발행 경계(tick 불변 상태) · `seq`/`sinceSeq`/`viewKey`/revision · 재생 로그 · snapshot begin/dict chunk/buckets chunk/end · multipart(`part`) · 바이트 예약·반환 · admission·대기열 · `control` 상태 머신 · `LiveStreamRejectionAdvice` · writer 풀·deadline | **SSE**: frame/part 2 MiB·최대 4 part · 연결 큐 8 MiB · 재생 로그 전역 64 MiB · 고유 바이트 총 96 MiB를 **독립 적용** · 퇴출 frame 참조·취소·끊김의 해제 · snapshot chunk 1 MiB·동시 버퍼·admission·대기열 · multipart 도중 재접속 · 느린 writer 반환(R6) |
| **6. Collector 생성 설정·운영 관측** 🟢 `[impl-r3 반영]` **구현 완료**(worktree `p5-live` 커밋 `8d6f730` — 선별 371건 green, Collector 0.159.0 실구동 5시나리오 포함. 검수 `../reviews/review_apm-p51-s6-be_claude.md` 🔴3(R1 자기 로그 오염·R2 별칭 전역 치환·R3 전송 실패 합산)·🟡14 → **R1·R2·R3 전건 수정 반영**(`review_apm-p51-s6-be_codex-fix.md`, 골든 회귀 Y-d 포함) — 정본 반영 5건은 이 문서에 반영 완료) | `ApmCollectorConfigGenerator` 라이브 블록(§2.2 결합 정본 — **R-P5b 통과본 `v4_on.yaml`과 문장 동일** `[R-P5b 반영]` · `summary: silent` **반드시 출력** · 상단 gate 경고) · 자기 메트릭 라벨 문자열 `filter="filter/live-safety"`·`processor="filter/live-safety"` · 알람 `failed to eval condition{pipeline=traces/live} == 0` · `ApmInstallGuideService` 3개 OS 실행줄 `--feature-gates` · **기존 설치 갱신 절** · BSP 권장 지연 프로필 안내 · 별칭 deprecated 정리(P2-1) · **확장 카나리아** `slimBypassed{reason}` · **`ApmCollectorMetricStore` 확장**(live exporter별 enqueue/send 실패·`error_type`·차단 수·OTTL/gate WARN 계수 — 수집→보존→조회→화면 계약) · 수집기 탭 라이브 카드(결측 null) | **카나리아**: gate OFF · 필드별 정리 실패 · 잘못된 타입 · 값 검사 실패 · 로그 수집 중단(결측 ≠ 0) · 정상 fixture 보존 · **위험 payload는 전송 전에 차단**(live-safety) · exporter별 enqueue/send 실패·partial 거절 분리 · **실제 시작 명령으로 생성 YAML 구동** · 저장 pipeline gate 회귀(`transform/sql` 런타임) |
| **7. 계약 표본 확정 · P5.2·P5.3 종단** `[impl-r3 반영: 착수본]` `[contract-r1 정정: 골든 필수화]` | 실제 응답 JSON·상태 전이를 `test/resources/apm/contract/`에 고정(D3 checksum 산식·D1 3단 거절 변환·snapshot 축소·재시작 계약 포함) · UI 연동(P5.2·P5.3) · 성능 문구 확정. 🔴 **필수 산출물 — 계약 표본 JSON 골든 고정**: 이벤트 6종(`snapshot.begin`/`dict chunk`/`buckets chunk`/`end`/`spans`/`heartbeat`/`control`) 각 1건의 실제 직렬화 결과를 6단계 선례(`src/test/resources/apm/contract/r-p5b-live-processors.golden`, 바이트 동일 비교·MD5 고정)와 같은 방식으로 `apm/contract/live-spans-*.golden`에 고정하고, **골든 불일치 실패 메시지에 "FE `src/types/__fixtures__/apmLiveSpans/*.json`도 함께 갱신하라"는 안내 문구를 넣는 것**을 회귀 작성 규칙으로 못박는다(계약서 §6-G — 계약 표본 0건이 곧 FE 타입 대조 게이트의 공백이었다). 🔴 **잔여**: 5단계 Y1·Y2·Y3(6단계 착수 전 권고분, 아직 코드 반영 확인 안 됨) · 6단계 Y-c·Y-e·Y-l·Y-m·Y-o(경량, 수정 라운드에서 대부분 반영됨 — `review_apm-p51-s6-be_codex-fix.md` 확인) · Y-g/h/i(자기 메트릭 증가량·내부 로그 전송량·BE 장애 시 로그 피드백 루프)와 **snapshot 축소·재시작 계약(§3.2)의 운영 규모(32/96 MiB) 부하 검증**(6단계 회귀는 축소한 예산 `transferCap`으로만 확인)은 **출시 부하 검증**으로 이월 — R2′·R-P5″와 함께 **미실행** 유지 | R-P5″(잔여)·R4·R6·R7 · **실제 프록시를 통과한 완료→화면 지연과 유실 동시 판정** · 수집기 관측 결측을 정상 0으로 표시하지 않음 · R2′ 통과가 출시 조건 · 🔴 **`integration-qa`로 SSE 이벤트 계약(§3.2 payload 필드·checksum 산식)↔FE 타입(`useApmLive`류 훅·`devdesign_apm-realtime-ux.md` 소비 코드) 정적 대조**를 이 단계 착수 조건에 넣는다(계약 표본 고정 직후, 화면 연동 착수 전) |

### 7.2 공수 재합산 `[C-r3 반영: §5 모순 10행 — 남은 구현 / 별도 게이트 / 소진 구분, 전부 추정]`

| 구분 | 항목 | 달력(추정) |
|---|---|---|
| 소진(선행 시험) | R1·R2 1차(2026-09-15 완료) | 1일 — 합계 밖 |
| 소진(선행 시험) | R-P5b 결합 YAML correctness(2026-09-15 완료) `[R-P5b 반영]` | 1일 — 합계 밖(v4 추정 0.5일 대비 v3·v4 두 판 측정으로 초과) |
| **남은 구현(첫 출시)** | P5.1(§7.1 1~6) 2.5~3.5 · P5.2 1.5~2.5 · P5.3 1~1.5 · 검수·종단 QA(7단계) 0.5~1 | **5.5~8.5일** |
| 별도 게이트 | R2′ 격리 재측 | 0.5~1일 + 격리 호스트 확보(일정 미정) |
| 후속 | P5.4 1.5~2.5(누적 7~11) · P5.5 1~2 · P5.6 2~3(독립 트랙) · P5.6b 3~5 · P5.3b 3.5~5.5 + 제품 결정 | — |

**리스크 표**
| # | 리스크 | 영향 | 완화 |
|---|---|---|---|
| 1 | 고객 앱 export 설정(BSP 5초 기본)으로 종료→화면이 수 초를 넘음 `[R-P5 반영: 실측 §10.3 — 실증]` | 화면 문구 신뢰 — **저트래픽(10/초)에서 완료→캡처 p95 5,727ms** | `[C-r3 반영]` 설치 가이드 **"P5 권장 지연 프로필: `OTEL_BSP_SCHEDULE_DELAY=1000`"(설정 요건)** — "고트래픽 무관"·"약 2초 보장"은 R7 전 미확정이라 삭제 · batch 충족은 인스턴스별 유입량이 정함 · `OTEL_BSP_MAX_QUEUE_SIZE` 짝 안내(값은 R7) + R7 실 javaagent A/B + 문구 "권장 설정 시" |
| 2 | OTTL로 events/links/name을 못 지움 `[R-P5 반영: 실측 §3.1·§4.1 — 해소]` | — | ✅ **지울 수 있다**(gate ON에서 events·links 0건, `name` "_live"). 남은 리스크는 **gate 누락**(#13)으로 옮겨 갔다 |
| 3 | 느린 SSE 클라이언트가 tick·writer 풀을 막음 | 전 사용자 화면 멈춤 | 연결별 큐·순서·deadline·admission(§2.5) — P5.1 필수 |
| 4 | Collector fan-out 비격리로 저장 경로 지연 | 1m 집계 지연·재전송 | R2 장애 주입 · `memory_limiter` · 별도 live Collector 프로세스 대안 |
| 5 | 라이브 EP DoS 표면(토큰 유출 시) | BE 힙·CPU | 토큰당 rps 429(§7.1 4단계 첫 항목) · 본문 상한 2개(해제 후 2 MiB · 압축본 2 MiB `[R-P5b 반영: 512 KiB에서 상향]` — `[impl-r1 반영]` 🔴 "힙 임시는 해제 후 상한이 정하므로 불변"은 **철회**: 현 구현은 압축본 버퍼를 해제 전에 놓지 않아 admission 4 × (압축본 2 + 해제본 2) = **16 MiB**로 늘었다(§5.2)) · 스팬 수 1,000·문자열(바이트)·깊이·읽기 시간 상한 · pool 상한 |
| 6 | 화면 요구("제니퍼 수준")와 OTel 한계(액티브 목록·리소스 해상도)의 간극 | 기대 불일치 | §1 대조표·§0 "전량 약속"을 사용자와 먼저 합의 |
| 7 | 메타 캐시 반영 지연(회수 후 최대 30초, 라이선스 60초) | 회수 토큰이 30초 더 수신됨 | 계약에 명시 · commit 이후 이벤트로 같은 노드는 즉시 · hard expiry |
| 8 | 표시 표본을 통계로 오독 | 오류율·TPS 오판 | 집계는 전체 관측에서만 · 브러시 표 제목 "표시 표본" · 배지 |
| 9 | 다중 BE에서 Collector 배치·SSE·**메트릭**이 다른 노드 | 빈 화면·부분 화면·액티브 누락 | 첫 배포 BE 1대 · 승격은 §2.7 표 전체 충족 · `nodeId/coverageFrom` 표시 |
| 10 `[v2 신규]` `[R-P5 반영: 실측 §13 — **실측 확인(300% 중복)**]` | `error_mode: propagate`가 receiver 오류로 번져 SDK 재전송·저장 중복 — **추정이 아니라 사실**: 정리 문장 1개 실패 → SDK 503 × 5,176 · 재전송 3,882 · `apm_span` 중복 26,769(고유의 300%) | 저장 데이터 정확성(제품의 기록이 휘발 기능 때문에 오염) — `[C-r3 반영]` 명칭 "라이브 processor 오류의 상류 전파에 따른 저장 분기 중복 **전송**"(DB 중복 행은 미입증) | **`propagate` 폐기 → 전 라이브 프로세서 `ignore`**(§2.1 결정) + `live-slim` 실패 불가 문장 불변식 + **전송 전 차단 `filter/live-safety`** + BE 확장 카나리아 `slimBypassed{reason}` + Collector 로그 WARN 2패턴·gate WARN 계수(exporter 카운터는 OTTL 실패를 세지 않는다). 입력 의존 프로세서 변경마다 문장 오류·정리 위반 fixture 각각 재시험(R2′) |
| 11 `[v2 신규]` | 늦은 도착 재전송이 대역폭을 3배로 키움(405KB/초 산정) | SSE 큐 강등 빈발 | dirty 병합 1회 · frame 2MiB · 실패 시 버킷 내부 delta |
| 12 `[v2 신규]` | Servlet blocking write로 writer 풀 고갈(deadline이 실제로 안 풀림) | 전 사용자 멈춤 | R1 writer 반환 실측 · 비동기 I/O 대안 |
| 13 `[v3 신규]` `[R-P5 반영: 실측 §4.3·§6]` | **feature gate 누락** — yaml만 배포(덮어쓰기)하면 `set(events/links, nil)`이 조용히 무시돼 **PII 3종(events name/attributes·links attributes) 전송 + 전송량 +47%**, 로그·카운터 0 | PII 노출(전송 단계) · 대역폭 — `[C-r3 반영]` `[R-P5b 반영: §3.3]` 실제 신호는 "로그·카운터 0"이 아니라 **프로세스 수명당 WARN 1회(`ottlfuncs/func_set.go:46` — 파이프라인·문장 라벨 없음)**이고 기능 차단·전용 카운터·제품 감시가 없는 것이 문제. ✅ v4 결합 yaml gate OFF 실측: **PII 0 · live 0 · live-safety 차단 1,345**(v3 결합은 PII 2종 1,359건) — 증상은 "라이브 화면이 빈다 + 차단 카운터가 튄다" | 설치 가이드 실행줄 3종(`ExecStart`·`New-Service -BinaryPathName`·plist `ProgramArguments`)에 `--feature-gates=ottl.set.allowNil` + **기존 설치 갱신 절** + 생성 yaml 상단 경고 + **Collector `filter/live-safety`가 events/links 잔존 스팬을 전송 전 drop**(PII 전송 → 점 소실·차단 카운터로 전환) + BE 카나리아 `slimBypassed{eventsPresent|linksPresent}` + `ApmInstallGuideServiceTest` 문자열 검사 + **실제 시작 명령으로 생성 YAML 구동 회귀**. `validate`로는 검출 불가 · 대안 구문 없음(질문 3 답)이라 gate 의존 존속 |
| 16 `[v4 신규]` `[C-r3 반영: 수정안 3·4]` | **`filter/live-safety`의 fail-open** — filter `error_mode: ignore`는 조건 평가 오류를 false로 보아 스팬을 남긴다. 조건 함수(`Len` on SpanEventSlice·`IsInt`·`IsMatch` StringLike 변환)가 특정 타입에서 오류를 내면 그 스팬이 검증을 **통과**할 수 있다 | PII 전송 차단이 구멍 남 | 조건을 nil·타입 안전 형태만 사용 · `[R-P5b 반영: §8.3]` ✅ **시험 완료 — 답은 "조건 단위 fail-open"**(#18로 구체화: 프로세서 전체 무력화는 아님, 정본 13조건 eval 오류 0) · 대안 "유계 비동기 경계 뒤 차단"은 R2′ 필수에서 제외·후보 존치 · BE 확장 카나리아가 2차 검출 |
| 17 `[v4 신규]` `[C-r3 반영: P0 판정 2·3]` `[R-P5b 반영]` | **결합 YAML 미시험 + 직렬화 상한 외삽** — ✅ **해소**: R-P5b가 결합 정본(v3·v4)을 실행해 v4 PASS, 직렬화 최대는 실측 G = N 1.337 MiB(산술 1.99는 보수적) | 배포한 정본이 PII를 흘리거나 정상 배치가 413 | 정본 yaml 문장 = R-P5b 통과본 · `send_batch_max_size` 1,000 확정(800 규칙 삭제) · 초과 처리 규칙 413 고정 · 🔴 남은 것은 **압축본 상한이 정상 입력을 거절**하던 결함이었고 2 MiB로 해소(§2.3.0) — yaml 문장을 고칠 때는 R-P5b 하네스(`scratchpad/rp5b/`) 재실행 |
| 14 `[v3 신규]` `[R-P5 반영: 실측 §3.10·§14]` `[R-P5b 반영: §6.0·§6.2]` | **압축 폭탄 / 최악 배치** — 반복 문자열은 17~28배로 눌려 26 MiB 배치도 gzip 236 KiB로 **압축 관문을 통과**하므로 해제 중 검사가 필수 · ~~UTF-8 `\uXXXX` 팽창 2.11 MiB~~ **철회**(원시 UTF-8, 한글 = ASCII 비용 — fixture 결함) | BE 힙 임시(동시 해제 수 × **해제 후** 상한) · 413 폭주 | 상한 2개(해제 후 2 MiB + 압축본 **2 MiB** — 독립, 압축본은 회선 읽기 유계용) · 해제 중 스트리밍 검사 중단(`readBounded`) · `send_batch_max_size` 1,000(G = N 1.337 MiB) · 문자열 상한 바이트 기준(문자 경계) · R6 압축 폭탄 케이스(고압축 반복 문자열 → 해제 중 413 · 저압축 난수 572.4 KiB → 수용) |
| 18 `[v4.1 신규]` `[R-P5b 반영: §8.3]` | **`filter/live-safety` 조건 단위 fail-open** — 조건 하나가 런타임 오류를 내면 **그 조건이 맡던 검사만 조용히 사라진다**(v4hole: 정리 실패 스팬 1,335 통과 · 차단 카운터 **0** · 신호는 샘플링된 WARN 52줄뿐). 나머지 조건은 정상 동작하므로 "잘 돌고 있다"처럼 보인다 | 조건 추가·변경 실수 한 번으로 PII 필드 하나가 무방비 전송 — 카운터로는 안 보임 | **불변식**: nil·타입 안전 조건만(`Len`·`IsString`·`IsInt`·문자열 비교·`IsMatch` — 정본 13조건은 fixture 전체에서 eval 오류 0) · 조건 추가·변경 시 **fail-open fixture 재시험 필수**(그 조건을 깨뜨리고 C fixture 주입 → live 0이어야) · 알람 **`failed to eval condition{pipeline=traces/live} == 0`**(6단계 로그 계수) · BE 카나리아 `slimBypassed{reason}`이 2차 검출 |
| 15 `[v3 신규]` `[R-P5 반영: 실측 §10.3 ③]` | **SDK 큐 드롭** — BSP 5,000ms + 고트래픽에서 `maxQueueSize` 2048 초과분이 **앱 안에서** 사라짐(1,175스팬/100초). Collector·BE 어디에도 안 잡힌다 — "Collector 도달 전 유실"의 가장 이른 구간 | 유실이 관측 밖 · "전량" 문구 오해 | 설치 가이드 `OTEL_BSP_SCHEDULE_DELAY`·`OTEL_BSP_MAX_QUEUE_SIZE` 짝 안내 · §0 "수신 대상" 범위 밖 항목에 명시 · R7에서 실 javaagent `otel.bsp.dropped.spans` 확인. ⚠️ 에뮬레이션 수치 |

---

## 8. 미결 → 결정 `[C-r1 반영]`

### 8-1. v0 미결 Q1~Q16 결정 표
| # | 질문 | 코덱스 판정 | **v1 결정** | 반영 절 |
|---|---|---|---|---|
| Q1 | 별 EP vs 헤더 분기 | 별 EP. 컨트롤러 `collector/ingest`, 링 `overview/live/spans` | **채택 그대로** + `SecurityConfig` permitAll 추가·완전 URL 생성 | §2.2·§2.3 |
| Q2 | `url.path` 보존 | 제외. span name 폴백 금지. "경로 미식별" | **채택** | §2.2·§3.1 |
| Q3 | SSE vs WS · 락 | SSE 유지. 서비스별 락, 직렬화는 락 밖 | **채택**. WS 전환 기준으로 렌더 지연을 쓰지 않음(병목을 R4에서 분리) | §2.4·§2.5 |
| Q4 | 새 스트림 · 다중 노드 | 새 스트림·단일 노드. pub/sub 확정 보류 | **채택**. 단일 live 노드 라우팅 배포 조건 | §2.5·§2.7 |
| Q5 | 액티브 a/b/c | a 기본 + 인스턴스 합산, b 별도 제품 결정, c 금지 | **채택** — b는 P5.3b 독립 게이트 | §2.6·§4.3 |
| Q6 | traceId 범위 | 모든 표시 점에 제공. 저장 여부 별도 상태. 20초 미저장 확정 금지 | **채택** — spanId도 함께 | §3.1·§4.1 |
| Q7 | 큐·재시도·응답 | 메모리 큐·재시도 OFF 동의, 무조건 200 반대 → 400/partialSuccess/503 | **채택** — 큐 단위·5배치·`wait_for_result/block_on_overflow:false` 명시 | §2.2·§2.3 |
| Q8 | 상한·초과 응답 | 설정화 동의, 1MB·50연결 실측. machine은 실제 429, 브라우저는 관례 | **채택** + 본문 2MB·배치 2,000으로 조합 정정 → `[R-P5 반영: 실측 §14]` 배치 **1,000** · 본문 상한 **2개**로 재정정 → `[C-r3 반영]` **해제 후 2,097,152 B + 압축본 524,288 B**(정확 바이트) · 무압축은 해제 후 상한만 · gzip 아닌 인코딩 415 · BE 1,000과 Collector 1,000은 독립 설정 → `[R-P5b 반영: §6.2]` **압축본 2,097,152 B로 상향**(512 KiB는 정상 입력 gzip 572.4 KiB를 거절) · 직렬화 상한은 실측 G = N 1.337 MiB(§2.3.0). 브라우저 거절은 **`control` 이벤트**(`[v1 신규]`, 2회차) | §2.3·§2.3.0·§2.5·§3.3 |
| Q9 | X축 | 종료 시각. 늦은 도착·미래·누락 별도 표시 | **채택** — 버킷은 `endTs` 기준, 늦은 도착은 `lateArrivals`·rev | §2.4·§3.1 |
| Q10 | 기준선 | v0 반대. EWMA 먼저, 계절은 충분한 표본 뒤 | **채택** — EWMA 1단계, 계절은 동일 슬롯 ≥8 표본 게이트 | §4.4 |
| Q11 | 임계·게이지 | 상수+버전, 사용자 설정 생략. 게이지 빌더 신설 | **채택** | §4.4·§4.2 |
| Q12 | 다운샘플 | ③ 단독 반대 → 균등 + 별도 유계 강조 | **채택** — 1초 버킷 reservoir + 강조 계층, `replaceBuckets` | §2.4·§3.2 |
| Q13 | 힙 예산 | 기능별 유지 + 합산 교차 검증 | **채택** — P5 128 + snapshot 64 + 합산 검증식(`maxMemory` 50%) | §2.4·§5.2 |
| Q14 | 라이선스 | `Feature.APM` 유지. 수신 만료 실제 403. 네 축 | **채택** | §3.4 |
| Q15 | WBS 번호 | 문서 `P5.x`, 통합 WBS `WS-9/9.x` | **채택** — `devdesign_apm-screens-wbs.md` 개정 시 WS-9 추가·대응표 | §0 |
| Q16 | BSP 안내 | 조건부 1,000ms 권고, batch 크기는 실측 후 | **채택** — R7 A/B 신설 → `[R-P5 반영: 실측 §10.3]` 저트래픽 필수로 승격 → `[C-r3 반영: 질문 7 답]` **"P5 권장 지연 프로필의 설정 요건"**으로 표현 고정("고트래픽 무관"·"실 SDK 드롭 입증"·"약 2초 보장"은 R7 전 미확정). batch 크기 `send_batch_max_size` 1,000은 `[R-P5b 반영]` 실측(G = N 1.337 MiB, 여유 1.53배)으로 **확정** — "800으로 내릴 수 있다" 삭제 | §2.2·§2.3.0·§6·§7 |

### 8-2. 코덱스 "되묻는 질문 5" — Claude 회신 (본문 반영 위치)
1. **"전량"의 약속** = "Collector에 **도달한** 완료 SERVER 스팬 전량을 수신·집계한다. 표시는 표본이다." 상류 유실(SDK 샘플러·sampled flag·SDK 큐·계측 제외)은 제품 약속 밖이며 설치 점검 항목으로. 지원 상한 숫자: **서비스당 200점/초·전체 1,500점/초까지 전량 표시**, 그 위는 균등 표본(`observedCount/displayedCount` 노출). HTTP SERVER만 X-View 대상(RPC는 별 계열로 표시, RED 메트릭과 비교 축 통일). → §0·§2.4·§3.1
2. **DB 0회 = 라이브 요청 hot path에 한정.** 토큰·서비스 메타는 **인메모리 스냅샷 캐시**(TTL 30초 + 같은 프로세스의 회수/승인/삭제/라이선스 이벤트로 즉시 무효화 — 단일 노드 전제라 이벤트 전파는 in-process 리스너). 캐시 miss는 비동기 채움 + 그 배치는 `partialSuccess.rejectedSpans`로 거절·계수(`metadataUnavailable`), DB 장애 시도 동일(503 아님 — 재시도 OFF라 의미 없음; 수신 거절은 진실하게 partialSuccess/400/503 규약 채택 — Q7 답 수용). 최대 반영 지연 30초를 계약에. → §2.3·§2.3.1
3. **동의** — 기본 분포는 **균등 reservoir(시간 버킷 단위)**, 오류·느림은 **별도 유계 강조 계층**(서비스당 상한 20k점, 초과 시 그 계층도 균등). 두 계층 각각 상한이라 오류 100%에서도 메모리 유지. FE 교체 계약: 점은 **1초 버킷 id로 묶어 교체**(`replaceBuckets`), append만으로 동기화하지 않음. 집계(TPS·오류율·p95·패턴)는 표본이 아니라 **수신·dedup·유효성 통과 전체 관측**에서 계산. → §2.4·§3.2
4. **정합성 키**: 스트림 `streamEpoch`(서버 기동/링 리셋마다) + 이벤트 `seq`(단조), 점에 `spanId`·`traceId`, 사전 `dictVersion`, 집계는 `endTs` 버킷 기준 + 뒤 5초 버킷 `rev` 재전송(덮어쓰기), `snapshot`에 `seq`를 실어 클라이언트가 그 다음 증분부터 이어 붙임(서버는 최근 10초 증분을 보관해 `Last-Event-ID` 이음). `(traceId, spanId)` 유계 dedup(최근 60초). payload 한 벌은 §3.2. → §2.5·§3
5. **첫 출시 범위 = P5.1(파이프라인·링·SSE) + P5.2(X-View) + P5.3(대시보드·메트릭 액티브 개수 인스턴스 합산)** — "완료 요청 관제"까지. Java 진행 중 목록(P5.3b)·계절 기준선은 각각 독립 게이트(R5 + 제품 결정 · 표본 충족) 뒤 추가. 패턴 4종은 "우리 휴리스틱·관측 특징" 문구로 P5.4에 두되 EWMA 기준선부터. → §0·§4.3·§4.4·§7

### 8-2b. 코덱스 3회차 질문 3 — Claude(오케스트레이터) 결정 `[C-r2 반영]`
| # | 코덱스 질문 | 결정 | 반영 절 |
|---|---|---|---|
| 1 | 200/1,500점/초는 서버 기본 계층 **보관** 목표로 바꾸고, 브라우저는 시간 창·처리 한도에 따른 **표본 표시**로 확정할 수 있는가 | **동의.** 서버 보관 목표(서비스당 200점/초 · 전역 base 1,350k — v2.1에서 **1,300k**로 정정, §2.4 `[X-r1 정정]`)로 문구 정정, 브라우저는 표본 표시(`displayedCount/observedCount` 상시). "화면 전량 보장" 문구 삭제. snapshot·브라우저 예산은 그 전제로 잡는다(5분 view 32MiB·잠정 300k점) | §0·§2.4·§2.5·§3.2·§5.5 |
| 2 | 첫 출시는 HTTP SERVER만 전송·집계하고 RPC/OTHER는 후속으로 분리하는가 | **동의.** Collector filter에서 `kind==Server ∧ http.request.method 존재`(구 `http.method` 정규화 후)만 통과. RPC/OTHER는 **P5.5**로 분리 표기. `stats`가 서비스별 하나라 RPC 혼입 문제가 첫 출시엔 생기지 않는다 | §0·§2.2·§3.1·§7 |
| 3 | 첫 배포는 BE 전체 1대인가, 다중 BE 중 live 노드 1대인가 | **BE 전체 1대**(현 실서버 토폴로지: FE 아파치 1대 + BE·AI 도커 1대). 메트릭 공급 경로는 같은 프로세스의 P1.5 링. 다중 BE·live 노드 라우팅은 §2.7 표 전체가 **승격 조건** | §0·§2.7·§2.8 |

### 8-3. v1 질문 N1~N12 — 2회차 답으로 해소된 것 `[C-r2 반영]` (판정별 상세는 `../reviews/review_apm-realtime-design_claude-r2.md`)
| # | 코덱스 2회차 답 | v2 결정 | 반영 절 |
|---|---|---|---|
| N1 chunk pool | **반대** — 고정 세그먼트는 빈 슬롯으로 35초/700초 만에 소진(산술 반례). 슬롯 arena 권장 | **수용** — 전역 primitive 배열 arena·슬롯 단위 할당·전역 예약(base 1,350k/emphasis 50k — v2.1에서 base **1,300k**·임계 3%·물리 할당은 세그먼트 lazy로 정정, 상한 고정은 유지 `[X-r1 정정]`)·압박 시 무작위 축소+`pointsRev`·표시 축소는 거절 아님 | §2.4 |
| N2 통째 교체·revision | **조건부 동의** — 통째 교체 유지하되 발행 경계·`sinceSeq`·view·rev 분리·`final` 의미·바이트 상한 | **수용** — tick 불변 상태+재생 로그, `seq`는 데이터 발행 번호, `viewKey`, `pointsRev/statsRev`, `provisionalUntil`(버킷 종료 시각 기준), frame/큐/로그 바이트 상한 | §2.5·§3.2·§3.3 |
| N3 메타 캐시 | **조건부 동의** — `clearCache()` 호출처 따라붙기는 불충분, commit·generation·hard expiry·라이선스 60초 중첩 | **수용** — soft 20초/hard 30초, single-flight, generation, `AFTER_COMMIT` 리스너, 무효화 경로 전수(코드 행 대조), 라이선스는 provider freshness 참조(60초 계약) | §2.3.1 |
| N4 partialSuccess·503 | **부분 성공은 성공 취급**(Collector WARN + nil), 503은 "일시적 처리 불능" 전부 | **수용** — 수량 보존식, `deduplicated`는 멱등, 표시 탈락 불포함, 503 정의 확장, `Content-Type: application/json` | §2.3 |
| N5 HTTP·RPC | HTTP 기본 동의, **첫 출시는 비-HTTP 전송 제외** 권장 | **수용** — HTTP만, P5.5 분리, 오류 2축(`http5xx`/`spanError`), `isSlow` 독립 | §0·§3.1 |
| N6 control·EventSource | **P5만 control 동의**, P1.5 불변, 단 재접속 상태 머신·거절 변환 위치 필수 | **수용** — 상태 머신(4분기)·`retryable`·연속 실패 5회·`LiveStreamRejectionAdvice` 경로 한정·writer 반환 실측 | §2.5 |
| N7 힙 검증·기동 실패 | 실제 상한 근거 실패는 동의, **추정식으로 전체 BE 기동 차단은 반대**. snapshot 16MB·사전 2MB 과소 | **수용** — 계산 가능한 최소 필요량 기준, 초과 시 **P5 활성화 실패**(BE는 기동), 필수 모드에서만 BE 실패, MiB 통일, 누락 3건 보정 | §5.2 |
| N8 OTTL | 소스로 일부 확인 — setter 존재, `ottl.set.allowNil` gate, `instrumentation_scope.attributes` 경로, `propagate` 상류 전파 | **수용** — yaml을 0.159.0 구문 후보로 교체(R1 검증 조건 명시), gate 프로세스 전체 영향 검사, §2.1 전파 리스크 | §2.1·§2.2 |
| N9 15칸 histogram | 게이지 근사에는 조건부 동의, 정밀 p95·±5% 띠엔 부족 | **수용** — `p95Approx` 표기·histogram 합산 후 5분 p95·P5.4는 별도 자료구조 | §2.4·§4.2·§4.4 |
| N10 자기계측 | 업무 제외와 운영 메트릭 수집 구분, 정확한 식별자, 경로 sampler는 검증 전 미확정 | **수용** | §2.2 |
| N11 잠정 숫자 | 시작값 가능하나 충돌 조합 수정 — heartbeat 5초/판정 3초, 토큰 5rps, 큐 sizer/consumers, 본문 2MB 증명, 연결 활성/대기 구분 | **수용** — 판정 12초, 10rps burst 20, `sizer: requests`·`num_consumers: 2`(→ v4에서 정본 후보 **1**, R2′ 비교 — §2.2 `[C-r3 반영]`), 최대 배치로 증명(→ v4 §2.3.0 산술 상한·R-P5b 실측), 활성 40+대기 10 | §2.2·§2.3·§2.5·§3.3 |
| N12 계절 게이트 8 | 최소 게이트로 조건부 동의, 오탐률 보증 아님 | **수용** — backtest·결측·정책 변경 검사 후에만 노출 | §4.4 |

### 8-4. 남은 미결 — 3회차에 물을 것 ❓ `[v2]` → **v3에서는 §8-5로 대체**(실측이 낳은 질문 8건)
**v2 시점에는 없음.** 코덱스 2회차 결론(R-P5 실측 착수 동의)과 3회차 질문 3에 대한 답이 모두 본문에 들어갔고, v2에서 새로 내린 결정(arena 세부·바이트 상한 숫자·rps 10/20·판정 12초·admission 2·활성 40+대기 10·`LiveStreamRejectionAdvice`·P5.5)은 **전부 잠정값 또는 코덱스 대안의 구체화**라 실측 없이 더 다듬을 것이 없다. 다음 왕복의 입력은 **R1·R2 결과**다 — 결과 문서(`verification/r1_apm-live-branch.md`·`r2_apm-live-collector-cost.md`)와 함께 "기준이 틀린 곳"만 3회차로 올린다. R1·R2 전에 코덱스 확인이 필요하다고 판단되는 항목이 생기면 `review_apm-realtime-design_claude-r2.md` §4에 적는다.

**v2.1 추가** `[X-r1 정정]`: UX-r1 §3의 9행은 수치·단위 정합이라 새 안건이 아니지만, 정정 과정에서 **설계 결정이 바뀐 4곳**은 3회차(또는 R1·R2 결과 왕복)에서 코덱스 확인을 받는다 — ① arena 물리 할당 세그먼트 lazy(상한 고정은 유지, 반납 없음) ② 사전 예산 20 MiB + 예산 도달 시 등록 거부→`__other__` ③ base 보관 목표 1,300k·압박 임계 3%(L3 1,500/초는 목표 초과 프로필로 재정의) ④ frame 초과 시 part 분할→점 생략, `snapshot.begin` 64 KiB·사전은 `dict` chunk. 정정표는 `review_apm-realtime-design_claude-r2.md` §6.

**v2.2 추가** `[UX-r1b 반영]`: UX 정본 v1 §6.2 요청 11~16은 **전건 반영(보류 0건)**, 회신표는 `review_apm-realtime-design_claude-r2.md` §7. 코덱스(또는 P5.1 계약 확정 시점)에서 확인받을 것 둘 — ① `dict.instances.key` 해시 산식(64-bit hex 16자, 잠정)과 후속 F1 인스턴스 식별자를 **같은 산식**으로 맞출지 ② `errorRateThresholdPct`·`p95ThresholdMs`의 출처 규칙(전역 규칙이 여러 개이거나 비활성일 때 어느 값을 싣는지 — 하나로 정해 계약 표본 JSON에 박는다). 둘 다 R1·R2 결과를 기다리지 않아도 되는 계약 항목이다.

### 8-5. v3 ❓ 8건 — 코덱스 3회차 답과 v4 결정 `[C-r3 반영]` (질문 원문은 회신서 `../reviews/review_apm-realtime-design_claude-r3.md` §5, 답은 코덱스 r3 §3)
P0 7건의 결정은 코덱스가 본판정했고(🔴2 · 🟡4 · ✅1 — 회신서 r3b §2), 아래 8건은 실측이 답하지 못한 전제였다. **8건 전부 답을 받았고 v4는 전건 수용했다.**
| # | 질문(요약) | 코덱스 답 | v4 결정·반영 절 |
|---|---|---|---|
| 1 | `ignore` 감시가 충분한가 | **불충분.** OTTL 문장 실패 전용 카운터 없음(exporter 카운터는 OTTL 실패를 안 셈). 실제 신호는 WARN `failed to execute statement`·`failed to eval condition`·gate 1회 WARN. 정확한 WARN 패턴 + 확장 카나리아 + **전송 전 후조건 차단** 결합. 문장 오류 검출과 정리 결과 위반 검출을 각각 시험 | 수용 — §2.1 ③④⑤ · §2.2 `filter/live-safety`·운영 감시 · §2.3 카나리아 · §6.4 (a)/(b) · 리스크 #16 |
| 2 | CPU 완화 순위·1.20 유지 | **1.20 유지.** 기준 설정·유효 측정 먼저. 순서 **a → b → d → c → e**(b에 resource/scope 정리 1회 검토 포함). a·c를 정본에 미리 섞지 말고 correctness 통과 후보별 비교 뒤 하나 고정. 효과 크기는 전부 추정 | 수용 — §5.3 · §6.0 완화 표 |
| 3 | gate 대안 구문 | **검증된 일괄 대체 구문 없음.** `set(span.events, [])`는 setter 타입 불일치로 오류 가능, `delete_key`·`limit`은 Map용. 이번 버전은 gate 유지 | 수용 — §2.2 gate 불릿 · 리스크 #13 존속 |
| 4 | 2MB·512KB와 1,000 동기화 | **보호 상한으로 합리적 시작값, 최대 유효 배치 보장은 아님.** `2MiB = 2,097,152B`·`512KiB = 524,288B`로 명시. Collector batch 수와 BE 수용 수는 **독립 설정** — 초기 호환 프로필 둘 다 1,000, 자동 결합 금지 | 수용 — §2.3.0 신설(정확 바이트·무압축 정책·산술 상한·초과 규칙) · §2.3 · §3.3. `[R-P5b 반영]` v4.1: 512 KiB는 "합리적 시작값"이 아니라 **정상 입력 거절**로 판명 → 압축본 2,097,152(해제 후와 동일·독립). 코덱스 4회차 확인 대상 |
| 5 | redaction vs replace_pattern | **redaction 유지 후 비용 분해 측정.** 별도 processor CPU 몫은 미지. 13~16자리 숫자 route 마스킹은 허용 가능하되 service·instance 정상 식별값이 바뀌는 사례 검사. 타입 정책·`summary: silent` 명시로 최종 허용 payload 고정. "processor 하나 줄이면 fan-out 복제 한 번 감소"는 틀림 | 수용 — §2.2 `summary: silent`·정상 식별자 보존(R-P5b) · §6.0 후보 c 정정 |
| 6 | consumers 1 vs 2 | **1을 재측 기준 후보, 2와 비교.** 1이 목표를 만족하면 1. 2가 반드시 CPU 두 배는 아님. queue 5와 in-flight 별도 관측, 선택값으로 정식 3회 | 수용 — §2.2 yaml `num_consumers: 1` · §5.3 체류 모델 · §6.0 R2′ |
| 7 | R7 전 BSP "필수" 표현 | **설정 요건으로는 가능, 실측 보장으로는 불가.** "P5 지연 프로필: schedule delay 1,000ms". 배치 충족은 각 SDK processor 유입량이 결정 — "고트래픽 무관" 삭제. max queue 값은 실제 export 지연·드롭으로 결정 | 수용 — §2.2 SDK 불릿 · §7 리스크 #1 · §8-1 Q16 |
| 8 | 1,000/s 지원 문구 시점 | **R2′ L2만으로 부족.** 실제 BE R-P5″·R3, 화면 R4, 실 SDK R7·R6을 통과한 프로필에 한해 확정. 그전엔 "합성 Collector 경로에서 약 600 SERVER/s 구간을 관측" — "제품 600/s 지원 검증"도 과함 | 수용 — §0 수신 처리율 행 |

**v4에 남은 ❓: 없음.** 코덱스 되묻는 질문도 없음. 실측으로만 답할 항목은 R-P5b(결합 YAML correctness·직렬화 최대·live-safety 검증 오류 통과 여부·`summary: silent`) · R-P5″(BE 보존식·집계·TTL·늦은 도착·완료→링/화면) · R2′(격리 CPU·계약 기준 저장 처리량/지연·장애 분리·대안 차단 구조)로 §6.0에 배치했다.

### 8-6. v4.1 — R-P5b가 답한 것과 코덱스 4회차에 확인받을 것 `[R-P5b 반영]`
| 항목 | R-P5b 답 | v4.1 결정 | 코덱스 확인 |
|---|---|---|---|
| 결합 YAML correctness | v3 FAIL · **v4 PASS**(yaml 문장 변경 0) | 정본 유지, 주석·운영 규칙만 정정 | — |
| 직렬화 최대 | G = N 1.337 MiB(산술 1.99는 보수적) | `send_batch_max_size` 1,000 확정, 800 규칙 삭제 | — |
| live-safety 검증 오류 시 통과 여부 | **조건 단위 fail-open**(전체 무력화 아님) | 불변식 승격 + 알람 + 대안 구조는 R2′ 필수에서 제외 | 대안 제외 판단 |
| `summary: silent` | 기본값도 silent, info/debug면 100% 실명 | 명시 유지(생성기 필수 출력) | — |
| 🔴 **압축본 상한 512 KiB** | **정상 입력 572.4 KiB 거절** | **2,097,152**(해제 후와 동일·독립 유지) — 1단계 수정 라운드 | **설계값 변경 1건 — 4회차 대상** |
| `\uXXXX` 팽창 · R-P5 §14 2.11 MiB | 사실 아님 · fixture 결함 | 삭제·철회 | 판정 정정 확인 |
| redaction 방어 범위 | 속성 값만 | §2.2 표로 명시, live-safety = 비-속성 유일 방어 | — |

---

## 9. 참고 · 출처

**코덱스 2회차가 대조한 코드(✅ v2 인용)**: `collector/token/ApmReceiveTokenService.revoke:304`(registrar 무관) · `service/registry/ApmRegistryService.approve:99`(트랜잭션 안 `clearCache()`)·`reject:150`(`clearCache()` 없음) · `service/list/ApmServiceQueryService.delete:499`(afterCommit)·`update:448`(`hostLinker.clear()`) · `core/batch/retention/ApmRetentionService:332`(자동 숨김) · `license/provider/SignedKeyLicenseProvider:48`(60초 캐시) · `collector/ingest/MetricIngestPipeline:101`(registrar 사용 — 메트릭으로도 등록) · `otel/metric/OtlpResource.isCollectorName:82`(`otelcol` 계열만) · `overview/live/LivePoint:28`(HTTP 5xx 오류) · `otel/histogram/CanonicalBounds:53`(14경계+overflow). 외부: Collector 0.159.0 `otlphttpexporter/otlp.go:322-348`(partialSuccess WARN·nil) · `fanoutconsumer/traces.go:42-68`(오류 수집 반환) · `ottl/contexts/internal/ctxspan/span.go:466-499`(events/links setter) · `ottlfuncs/func_set.go:33-48`(allowNil gate) · exporterhelper README `sending_queue`(`sizer`·`num_consumers` 기본 10).

**R-P5 실측이 대조한 코드·설정(✅ v3 인용)** `[R-P5 반영]`: `verification/r-p5_apm-live-pipeline.md` 전체(§0 사전 고정 합격선 · §2.1 H3 yaml · §3 R1 · §4 v2 원문 재측 · §5 R2 A/B · §6 gate · §7 추정 대비 · §9 P0/P1/P2 · §10 BSP · §11 큐 · §12 장애 5종 · §13 propagate · §14 최악 배치 · §15 판정 · §16 미측 · §17 원복) · 하네스 `scratchpad/rp5/`(`gen_base.yaml` = `POST /apm/collector-config` 실제 생성물 129줄 · `rp5_live_v3.yaml`(H3) · `design_v2.yaml` · `gen4.mjs` · `capture.mjs` · `sproxy.mjs`). 코드: `config/SecurityConfig:79`(AntPath `/apm/otlp/**`가 `-live`를 매치하지 않음 — 실측 401) · `collector/ingest/ApmOtlpController:135`(`max-body-bytes` 8MB)·`:147`(`max-compressed-bytes` 2MB)·`:301-331, :476`(`readBounded`·해제 중 상한) · `collector/install/ApmInstallGuideService:256`(linux `ExecStart`)·`:230~233`(Windows `New-Service -BinaryPathName`)·`:325~330`(macOS plist `ProgramArguments`) — 셋 다 `--feature-gates` 없음 · `ApmInstallGuideServiceTest:374`(`ExecStart=` 존재 검사 — gate 문자열 검사 추가 자리) · `ApmCollectorConfigGenerator`(별칭 `otlphttp`·`resourcedetection` deprecated WARN, 토큰 자리표시 안내 자리 = gate 경고 문구 자리).

**코덱스 3회차가 대조한 소스(✅ v4 인용)** `[C-r3 반영]`: 실측 하네스 `ab.sh`(계측 시작 후 무부하 준비 20초·부하 240초·drain 60초)·`abreport.py`(전체 처음·마지막 CPU 표본 사용 — 측정 구간 혼입의 근거)·`gen4.mjs`(단일 큐에서 동시 export 8개 허용) · 보존 로그 `rp5/col_p2ign.log:49`(`failed to execute statement`)·`rp5/col_dv2_nogate.log:45`(`set` nil 무시 WARN) · BE `premium/apm/trace/ingest/ApmSpanStore:62`(`ON CONFLICT DO NOTHING`)·`ApmTraceWriter:143`(저장된 논리 span ID 필터)·`collector/state/ApmCollectorMetricStore:91`(`CollectorCell` — `send_failed` 신호별 합산, exporter·`error_type` 라벨 없음). Collector 0.159.0: `pkg/ottl/parser.go`(OTTL 오류 처리 — `ignore`에서 WARN 후 계속·`nil` 반환) · `processor/processorhelper/metadata.yaml`(`otelcol_processor_incoming/outgoing_items`·`internal_duration` — 처리량·시간 계측만) · `pkg/ottl/ottlfuncs/func_set.go`(gate OFF 1회 WARN) · `processor/redactionprocessor/processor.go`(정규식 컴파일 오류 = 초기화 실패 · 계측 TODO) · `internal/fanoutconsumer/traces.go`(복제는 분기 consumer의 변경 가능 여부로 결정 — 직렬 processor 수와 무관) · `pkg/ottl/contexts/internal/ctxspan/span.go`·`ctxutil/slice.go`(events/links setter 타입) · Collector 내부 로그 설정(로그 샘플링) https://opentelemetry.io/docs/collector/internal-telemetry/#configure-internal-logs · BSP 규격(동일 processor export 직렬화·batch 512 선행 export) https://opentelemetry.io/docs/specs/otel/trace/sdk/#batching-processor · `filter` 프로세서 `error_mode`·자기 메트릭 `otelcol_processor_filter_spans_filtered`(R-P5b 확인 대상) https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/v0.159.0/processor/filterprocessor · `redaction` 프로세서 `summary` 옵션 https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/v0.159.0/processor/redactionprocessor · OTTL 함수(`Len`·`IsInt`·`IsMatch`·`IsString`·`truncate_all`) https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/v0.159.0/pkg/ottl/ottlfuncs/README.md.

**R-P5b 결합 YAML correctness가 대조한 것(✅ v4.1 인용)** `[R-P5b 반영]`: `verification/r-p5b_apm-live-yaml-correctness.md` 전체(§0 사전 고정 합격선 11 · §1 시험 대상 고정 · §2 결과 요약 · §3 validate/기동·gate OFF WARN 원문 · §4 분기 · §5 PII·대조군·절단 경계 · §6 직렬화 최대 — `\uXXXX` 부정·v3 무한 경로 3·v4 실측 표·압축본 상한 산술 · §7 `ignore` 실패 fixture A~D·C′ · §8 live-safety 13조건·형태 fixture·조건 단위 fail-open·`summary` · §9 설치 가이드 · §10 수정 권고 ①~⑩ · §11 하네스 · §12 정리 · §13 미측정) · 하네스 `scratchpad/rp5b/`(`design_s2.2_frozen.yaml` v3 16:52 사본 · `design_s2.2_v4_frozen.yaml` v4 17:38 사본 · **`v4_on.yaml` = v4 수치 출처** · `v3_fail_*`·`v4_fail_clean`·`v4_safety_broken`·`v4_safety_holed`·`v4_nosummary/_suminfo/_sumdebug`·`v4_fat1000/800` · `gen4.mjs`·`inject.mjs`·`fatgen.mjs`·`fatgen2.mjs`·`capture.mjs --raw`·`sproxy.mjs` · `branch.py`·`dumpraw.py`·`enc.py`). Collector 0.159.0 관측: `ottlfuncs/func_set.go:46`(gate OFF WARN — 라벨 없음) · `ottl@v0.159.0/parser.go:423`(`failed to execute statement`, `otelcol.component.id`·`otelcol.pipeline.id` 라벨)·`:496`(`failed to eval condition`) · 자기 메트릭 `otelcol_processor_filter_spans_filtered{filter="filter/live-safety"}`·`otelcol_processor_incoming/outgoing_items{processor="filter/live-safety"}` · `parser_collection.go:647`(무접두 경로 INFO — 저장 블록 `transform/sql`이 원인, 라이브 블록 아님) · `exporters::otlphttp/moveseye-live: at least one endpoint must be specified`(환경변수 미설정 기동 거부). BE: `ApmInstallGuideService:230-233·:256·:325-330`(`feature-gates` 0회 재확인) · `ApmOtlpController:301-331, :476`(해제 중 스트리밍 검사 — 압축본 상한 2 MiB의 폭탄 방어 근거).

**내부 정본**: `designs/devdesign_apm-live.md` §2~§6 · `verification/e2e_apm-live-qa.md` §B(지연 실측)·§H · `verification/r1_apm-collector-roundtrip.md` §1(exporter 경로 규칙)·§2.4(`active_requests`)·§3(R11 응답 코드) · `verification/r3_apm-volume.md` §0·§1·§8(메트릭 DB 증가량 — 트레이스 분모 아님) · `guides/apm-handbook/03-constraints.md` §3.1~3.7 · `guides/apm-handbook/06-data-path.md` §5.2 · `designs/devdesign_apm-screens-wbs.md` §4(WS-5 5.x 사용 중·WS-9 비어 있음). 코드(✅ v1 확인): `config/SecurityConfig:79`(`/apm/otlp/**` permitAll) · `premium/apm/collector/ingest/ApmOtlpController`(340~367 토큰·라이선스가 try 밖, 232 `/v1/logs` 수용 후 폐기, 429·502·503·504만 재시도) · `collector/token/ApmReceiveTokenService.authenticate:342`(findByTokenHash + 절제된 save) · `service/registry/auto/ApmRegistrar.resolve:145`·`clearCache:218`(프로세스 로컬 캐시 TTL 10분·등록 부작용) · `overview/live/LiveBuffer.recordActive:484`(마지막 관측 하나) · `overview/live/ApmLiveProperties`(추정식 vs 예산, `-Xmx` 비율 미강제) · `overview/live/ApmLiveStreamController`(연결마다 tick·동기 send, 200+code 403 직접 기록) · `license/LicenseArchitectureTest.MACHINE_CLIENT_CLASSES:60` · `resources/apm/collector-template.yaml`(저장 exporter `endpoint:`·file_storage 큐 5000·재시도 ON) · FE `hooks/useApmLive.ts`(네이티브 EventSource·onerror CLOSED만) · `lib/echarts/apmScatter.ts` · `components/Chart/custom/CustomGaugeChart.tsx` · `alert/rule/ApmAlertKind`.

**외부 공식 문서**
| 주제 | URL |
|---|---|
| JENNIFER APM 기능(대조 대상 — X축 정의·패턴 4종은 공식 페이지에 정의 없음) | https://jennifersoft.com/ko/product/apm/features/ |
| Collector 아키텍처(fan-out 동기·processor 파이프라인별 인스턴스) | https://opentelemetry.io/docs/collector/architecture/ |
| Collector 설정·파이프라인 | https://opentelemetry.io/docs/collector/configuration/ |
| `filter` 프로세서(OTTL 조건) | https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/processor/filterprocessor |
| `transform` 프로세서(`keep_keys`·`error_mode`) | https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/processor/transformprocessor |
| OTTL span 컨텍스트 필드(name·status·events·links·trace_state) | https://raw.githubusercontent.com/open-telemetry/opentelemetry-collector-contrib/v0.159.0/pkg/ottl/contexts/ottlspan/README.md |
| `batch` 프로세서 | https://github.com/open-telemetry/opentelemetry-collector/tree/main/processor/batchprocessor |
| `tail_sampling` 프로세서 | https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/processor/tailsamplingprocessor |
| `otlphttp` exporter(`traces_endpoint`) | https://github.com/open-telemetry/opentelemetry-collector/tree/v0.159.0/exporter/otlphttpexporter |
| exporterhelper 큐·재시도 0.159.0(`queue_size` 단위·`wait_for_result`·`block_on_overflow`) | https://github.com/open-telemetry/opentelemetry-collector/blob/v0.159.0/exporter/exporterhelper/README.md |
| OTLP/HTTP 응답 규약(`partialSuccess`·재시도 코드) | https://opentelemetry.io/docs/specs/otlp/#otlphttp-response |
| Java 에이전트 확장(extensions) | https://opentelemetry.io/docs/zero-code/java/agent/extensions/ |
| Java 에이전트 설정(`otel.bsp.schedule.delay` 기본 5000ms·batch 512·sampler `parentbased_always_on`) | https://opentelemetry.io/docs/languages/java/configuration/ |
| SDK `SpanProcessor.onStart` 규약(동기·비블로킹) · Batching processor | https://opentelemetry.io/docs/specs/otel/trace/sdk/#onstart |
| Redis pub/sub 전달 의미(at-most-once) | https://redis.io/docs/latest/develop/pubsub/ |
| Apache `mod_proxy` `flushpackets`(AJP·FCGI 전용) | https://httpd.apache.org/docs/2.4/mod/mod_proxy.html#proxypass |
| ECharts `series-gauge` | https://echarts.apache.org/en/option.html#series-gauge |
| ECharts `series-scatter.large` / `progressive` | https://echarts.apache.org/en/option.html#series-scatter.large |
| ECharts `appendData`(삭제 불가·dataset 병용 불가 — v1에서 미채택) | https://echarts.apache.org/en/api.html#echartsInstance.appendData |
| MDN `EventSource`(`Last-Event-ID`·`retry`) | https://developer.mozilla.org/docs/Web/API/EventSource |
| WHATWG SSE(`retry:`만 프로토콜 필드 — JSON `retryAfterMs`는 앱이 처리) `[C-r2]` | https://html.spec.whatwg.org/multipage/server-sent-events.html |
| OTLP partial success(재시도 금지) `[C-r2]` | https://opentelemetry.io/docs/specs/otlp/#partial-success-1 |
| Spring transaction-bound events(`@TransactionalEventListener`) `[C-r2]` | https://docs.spring.io/spring-framework/reference/data-access/transaction/event.html |
| Spring MVC 비동기 요청(응답 쓰기 blocking) `[C-r2]` | https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-ann-async.html |
| semconv RPC migration(`rpc.system` → `rpc.system.name`) `[C-r2]` | https://opentelemetry.io/docs/specs/semconv/non-normative/rpc-migration/ |
| semconv messaging span kind `[C-r2]` | https://opentelemetry.io/docs/specs/semconv/messaging/messaging-spans/#span-kind |
| Java declarative config — `rule_based_routing` 경로 제외 예시 `[C-r2]` | https://opentelemetry.io/blog/2025/declarative-config/#health-check-exclusion |
| OTTL span 컨텍스트 0.159.0 · events/links setter · nil slice · set feature gate `[C-r2]` | https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/v0.159.0/pkg/ottl/contexts/ottlspan/README.md · `.../ctxspan/span.go#L466-L499` · `.../ctxutil/slice.go#L157-L171` · `.../ottlfuncs/func_set.go#L33-L48` |
| otlphttp exporter 0.159.0 partialSuccess 처리 · fan-out 오류 반환 `[C-r2]` | https://github.com/open-telemetry/opentelemetry-collector/blob/v0.159.0/exporter/otlphttpexporter/otlp.go#L322-L348 · `.../internal/fanoutconsumer/traces.go#L42-L68` |
