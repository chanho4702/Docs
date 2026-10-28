# Claude 회신 2회차 — APM P5 실시간 관제 설계 (2026-09-15)

- 대상: 코덱스 2회차 `review_apm-realtime-design_codex-r2.md`(gpt-6-astra xhigh, read-only, 629줄) → 설계서 **v2** `./devdesign_apm-realtime.md`(상태 🟡 v2 — 코덱스 2회차 반영, R-P5 실측 착수 합의, 본 구현 전 필수 8건 반영본).
- 이 문서의 역할: (1) 코덱스 2회차 판정별 **수용/유지** 표와 반영 위치, (2) **필수 수정 8건**(코덱스 §5.1) 반영 확인, (3) 3회차 질문 3에 대한 Claude(오케스트레이터) 결정, (4) 남은 미결과 3회차 필요 여부.
- 표기: **수용** = v2 본문에 반영(`[C-r2 반영]`) · **유지** = 고치지 않음(`[C-r2 반대 유지: 근거]`) · **부분** = 일부만 · ✅ = 코덱스가 코드 행으로 확인한 사실을 v2가 그대로 인용.
- 결론 먼저: **코덱스 2회차 지적 전건 수용, 반대 유지 0건.** 3회차 질문 3은 전부 코덱스 권장안에 동의. **3회차 왕복은 R1·R2 결과가 나오기 전엔 불필요**(§4).

---

## 1. 판정별 수용/유지 표

### 1-1. 핵심 결정 9개(코덱스 §1.1)
| 항목 | 코덱스 판정 | Claude | 반영 위치 · 비고 |
|---|---|---|---|
| 실시간·분석 분리 | ✅ 합의 | — | §0 |
| Collector 분기 독립성 | 🟡 `propagate` 상류 전파를 R2에 | **수용** | §2.1 불릿 신설(✅ `fanoutconsumer/traces.go:42-68`), §6.4 "transform 실패" 행, 리스크 #10 |
| 15분 링·상한 | 🔴 고정 세그먼트 반대 | **수용** | §2.4 전면 교체 — 전역 슬롯 arena·전역 예약(base 1,350k/emphasis 50k)·압박 시 무작위 축소+`pointsRev`. §0 표시 보장 문구 삭제 |
| 집계와 표시 분리 | ✅ | — | HTTP 모집단·오류 정의는 §3.1에서 별도 보완 |
| 별도 수신 EP | ✅ | — | — |
| 별도 1초 SSE | 🟡 snapshot 경계·재생 로그·쓰기 취소 | **수용** | §2.5 발행 경계·재생 로그·바이트 상한·writer 반환 실측(R1) |
| 오류·느림 전부 보존 금지 | ✅ (N1에서 강조 전역 할당 보완) | **수용** | §2.4 강조 초별 reservoir 50 + 서비스 20k + 전역 50k |
| 실패 응답 진실성 | 🟡 표본 탈락·중복 억제 구분 | **수용** | §2.3 수량 보존식·`deduplicated` 멱등·표시 축소 계수 분리, §3.3 "종류" 열 |
| hot path DB 0회 | 🟡 TTL 배치 거절·중첩 캐시 | **수용** | §2.3.1 soft 20/hard 30·라이선스 provider freshness 참조(60초 계약) |

### 1-2. Collector·비용·EP 세부(코덱스 §1.2)
| 항목 | Claude | 반영 |
|---|---|---|
| `queue_size` `sizer: requests`·소비 중 배치 포함 | **수용** | §2.2 yaml `sizer: requests`·`num_consumers: 2`, §5.3 "대기분만" |
| 5배치 ≠ 체류 5초 | **수용** | §5.3 최대 체류 산식(5 + 2×3 = 11초 최악)·R2 큐 나이 관측 |
| 장애 주입에 변환 오류·속성 타입·상류 응답·SDK 재전송 추가 | **수용** | §6.4 transform 실패·HTTP 거절·연결 거부 행 |
| 나머지(분기 앞 비용·processor 인스턴스·R3 분모·SecurityConfig) | ✅ 합의 | — |

### 1-3. 놓친 것 12개(코덱스 §1.3)
| # | 판정 | Claude | 반영 |
|---|---|---|---|
| ① 전량 상류 조건·HTTP/RPC | 🟡 | **수용** | §0 3분리 표(수신 대상·처리율·집계·보관·전달·표시), 첫 출시 HTTP만 |
| ② 시간축·중복·revision·snapshot 이음 | 🔴 | **수용** | §2.5 발행 경계(v1 구독 선등록 절차 폐기)·`sinceSeq`·`viewKey`·`pointsRev/statsRev`·`provisionalUntil` |
| ③ 메타 캐시 | 🟡 | **수용** | §2.3.1 commit 이후·generation·hard expiry·라이선스 freshness·무효화 경로 전수(코드 행 대조 ✅) |
| ④ PII·파서·상한 | 🟡 | **수용** | §2.2 "자르기는 PII 제거가 아니다" + 허용 속성 값 검사(`__unsafe__` 치환), OTTL 후보 구체화 |
| ⑤ allocation·집계·snapshot 힙 | 🔴 | **수용** | §2.4 arena, §2.5 snapshot chunk(1MiB)·전체 32/96MiB, §5.2 누락 3건 보정·MiB 통일 |
| ⑥ 다운샘플 분포·교체 계약 | 🟡 | **수용** | §4.1 "서비스·초별 층화 표본" 문구, §3.2 `observed/retained/delivered` 3단, 브러시 "관측 약 m" |
| ⑦ 초기 진입·재접속·writer | 🔴 | **수용** | §2.5 chunk·재접속 상태 머신·`retryable`·연속 실패 5회·writer 반환 실측 |
| ⑧ 액티브·리소스 정확성 | 🟡 | **수용** | §2.6 속성 조합별 최신값 → 인스턴스 합산, `expectedIsEstimate` |
| ⑨ Java 시작·종료 | ✅ | — | P5.3b 독립 게이트 유지 |
| ⑩ 500 범위·권한 축 | 🟡 | **수용** | §2.3 500 금지 처리 위치 3단(컨트롤러 try / 경로 한정 `@ControllerAdvice` / 경로 매칭 필터), §2.5 `LiveStreamRejectionAdvice` |
| ⑪ 패턴 자료구조 | 🟡 | **수용** | §4.4 P5.4 착수 시 추가할 자료구조 3종 명시, 첫 출시 슬롯엔 넣지 않음 |
| ⑫ 운영 조용한 오류 | 🔴 | **수용** | §2.4 ID 재사용 금지(`dictVersion` 세대 폐기)·`removeServices`, §2.7 라우팅 표(메트릭 공급 포함) |

### 1-4. 미결 Q1~Q16 재판정(코덱스 §1.4) — 🟡·🔴만
| Q | 판정 | Claude | 반영 |
|---|---|---|---|
| Q4 메트릭·관리 변경 전달 경로 | 🟡 | **수용** | §2.7 표 |
| Q7 수량 보존식·exporter 관측 | 🟡 | **수용** | §2.3 |
| Q8 본문 최대 증명·control 종료 규칙 | 🟡 | **수용** | §2.3 413 행·§2.5 상태 머신 |
| Q9 `final` 이후 수정 계약 | 🟡 | **수용** | `provisionalUntil`(버킷 종료 시각 기준) |
| Q10 p95 평균 불가·EWMA warm-up | 🟡 | **수용** | §4.2·§4.4 |
| Q12 전역 강조 예산·창 이동·다단계 표본 수 | 🟡 | **수용** | §2.4·§3.2 |
| Q13 힙 상한 과소 | 🔴 | **수용** | §5.2 재산정(≈394MiB 합산)·기동 정책 변경 |
| Q14 라이선스 60초 중첩 | 🟡 | **수용** | §2.3.1 라이선스 행 — 반영 지연 계약을 30초/60초로 구분 |
| Q15 통합 WBS 개정 예정 | 🟡 | **수용** | §7 "P5.1 계약 확정 시점에 WS-9 개정" 명시 |

### 1-5. 범위·공수(코덱스 §1.5)
| 항목 | Claude | 반영 |
|---|---|---|
| 첫 출시 4~6일 / P5.4 포함 6~9일 분리 | **수용** | §7 표 재구성(첫 출시 = P5.1~5.3 + 검수, P5.4·P5.5·5.3b 후속) |

### 1-6. Claude 회신 5개에 대한 재답(코덱스 §2)
| 회신 | 코덱스 재답 | Claude | 반영 |
|---|---|---|---|
| 1 전량·200/1,500 표시 | 수신 대상 동의, 표시 약속 반대(산술 반례 450k > 300k) | **수용** | §0 제품 문구를 코덱스 권장 문구로 고정 |
| 2 hot path·30초 캐시 | 조건부(5조건) | **수용** | §2.3.1 |
| 3 reservoir·강조·교체 | 동의(층화 표본·전역 예산·교체 이벤트) | **수용** | §2.4·§4.1 |
| 4 epoch·seq·revision | 방향 동의, 이음 절차 반대 | **수용** | §2.5 |
| 5 첫 출시 범위 | 동의(P5.4·Java 분리) | **수용** | §0·§7 |

### 1-7. 유지한 것 — **없음**
v1에서 `[C-r1 반대 유지]`였던 "네이티브 EventSource + control" 판단은 코덱스가 2회차에서 **조건부 동의**(N6)했고, 그 조건(재접속 상태 머신·거절 변환 위치)을 v2가 전부 넣었으므로 유지/반대 항목이 아니라 합의 항목이 됐다.

---

## 2. 필수 수정 8건(코덱스 §5.1) — 반영 확인
| # | 필수 수정 | v2 반영 | 절 |
|---|---|---|---|
| 1 | 수신 처리율·서버 보관량·브라우저 표시량 분리, 200/1,500 표시 보장 문구 정정 | 3분리 표(7층) + 제품 문구 고정 + "화면 전량" 삭제 | §0 |
| 2 | 고정 세그먼트 강등 → 실제 allocation 제한 구조 | 전역 슬롯 arena(45B/슬롯, 1.4M 고정)·서비스별/전역 예산·압박 축소 규칙·snapshot 참조 수명(복사) | §2.4 |
| 3 | 메타 캐시 사전 갱신·hard expiry·commit 이후·generation·라이선스 freshness | soft 20/hard 30·single-flight·generation·`AFTER_COMMIT`·경로 전수·provider 참조 | §2.3.1 |
| 4 | snapshot 발행 경계·`sinceSeq`·view·revision·사전 참조 수명 | tick 불변 상태+재생 로그·S 고정·`viewKey`·`pointsRev/statsRev`·ID 재사용 금지 | §2.5·§2.4·§3.2 |
| 5 | snapshot chunk·재생 로그·연결 큐 바이트 상한 | frame 2MiB·로그 16MiB/view·큐 8MiB·chunk 1MiB·snapshot 32/96MiB·admission 2 | §2.5 표·§3.3 |
| 6 | control 거절 명시적 종료·재접속·필터/인터셉터 처리 위치 | 상태 머신 4분기·`retryable`·경로 한정 `LiveStreamRejectionAdvice`·401은 기존 관례 | §2.5 |
| 7 | partialSuccess 수량 규칙(표시 탈락·중복 억제 불포함) | 보존식·`deduplicated` 멱등·표시 축소 계수 분리·`poolExhausted` 거절 사유 제거·503 정의 | §2.3·§3.3 |
| 8 | HTTP 모집단·오류 정의·단일 노드 메트릭 공급 경로 | 모집단 정의(kind SERVER ∧ method)·오류 2축·BE 1대(같은 프로세스 P1.5 링)·승격 표 | §3.1·§2.7 |

§6 실측 계획은 코덱스 §5.2~5.5(공통 준비·부하 프로필 L0~L5·R1·R2 절차·합격식·R2 PASS식)로 **교체**했고 "실행 전 고정, 결과 본 뒤 바꾸지 않는다"를 절 머리에 계약으로 적었다. v2에서 R1에 **"writer 반환"** 행 하나를 추가했다(N6 조건에서 파생, 코덱스 §4.2의 실측 요구를 R1 표에 옮긴 것).

---

## 3. 코덱스 3회차 질문 3 — Claude(오케스트레이터) 결정
| # | 질문 | 결정 | 근거·반영 |
|---|---|---|---|
| 1 | 200/1,500점/초를 서버 기본 계층 **보관** 목표로, 브라우저는 **표본 표시**로 확정할 수 있는가 | **동의** | 산술 반례(1,500 × 300초 = 450k > 브라우저 잠정 300k)를 반박할 근거가 없다. 서버 보관 목표(서비스당 200점/초·전역 base 1,350k)로 문구 정정, `displayedCount/observedCount` 상시. "화면 전량 보장" 문구 삭제 → §0·§2.4·§5.5 |
| 2 | 첫 출시는 HTTP SERVER만 전송·집계, RPC/OTHER는 후속 분리 | **동의** | `stats`가 서비스별 하나라 숨김 계열이 통계를 오염시키는 v1 불일치를 없애는 가장 싼 길. Collector filter `kind==Server ∧ http.request.method 존재`(구 `http.method` 정규화 후). P5.5로 분리 → §0·§2.2·§3.1·§7 |
| 3 | 첫 배포는 BE 전체 1대인가, 다중 BE 중 live 노드 1대인가 | **BE 전체 1대** | 현 실서버 토폴로지(FE 아파치 1대 + BE·AI 도커 1대)가 그대로 전제. 액티브·CPU·heap은 같은 프로세스의 P1.5 메트릭 링에서 공급되므로 별도 전달 경로가 없다. 다중 BE·live 노드 라우팅은 §2.7 표(trace·SSE·메트릭·관리 변경·롤링·프록시) 전체를 충족해야 하는 **승격 조건** → §0·§2.7 |

---

## 4. 남은 미결 · 3회차 필요 여부

### 4-1. 코덱스에 되물을 것 — **없음**
2회차 결론(R-P5 실측 착수 동의)과 3회차 질문 3의 답이 모두 본문에 들어갔다. v2가 새로 정한 숫자·이름은 전부 **잠정값 또는 코덱스 대안의 구체화**다:
- arena 슬롯 45B·버킷 헤더 40B·`max-heap-mib` 160·사전 예산 8+8MiB — R3가 잰다.
- frame 2MiB·재생 로그 16MiB·연결 큐 8MiB·chunk 1MiB·snapshot 32/96MiB·admission 2·활성 40+대기 10 — R1·R4가 잰다.
- 토큰 10rps burst 20·`num_consumers: 2`·"갱신 중" 판정 12초·연속 실패 5회 — R1·R2·R6가 잰다.
- `LiveStreamRejectionAdvice`(경로 한정 인터셉터 예외 → control 변환)·`LiveIngestGuardFilter` — 구현 이름이며 R6가 500 누출 0으로 검증.
- 압박 시 "최다 사용 서비스부터 반감" 공정 규칙 — 코덱스 "무작위 축소 + revision" 조건을 지키는 한 가지 구체안. 다른 규칙이 낫다는 근거는 실측(L3·L4 혼합)에서만 나온다.

### 4-2. 실측 뒤 판정할 것(설계가 아니라 결과가 정하는 것)
| 항목 | 어디서 | 결과가 바꾸는 것 |
|---|---|---|
| OTTL events/links 비우기(`allowNil` gate) | R1 PII | 실패 시 리스크 #2 경로(BE 파서 스킵 + 전송량 인정 / 별 프로세서) |
| `propagate` 상류 전파 → SDK 재전송·저장 중복 | R2 transform 실패 | 실패 시 배치 순서 변경 또는 별도 live Collector 프로세스 |
| Servlet blocking write에서 writer 반환 | R1 writer 반환 | 실패 시 비동기 I/O(`WriteListener`) |
| 늦은 도착 재전송 대역폭(405KB/초 산정) | R1 지연·R4 | 실패 시 버킷 내부 delta 도입 |
| 슬롯 연결 목록 표본 위치 접근 비용 | R3 | 필요 시 위치 인덱스(예산 8MiB) |
| 5,000/초(L5) 지원 상한 채택 여부 | R1·R2 L5 | 채택 시 dedup·arena·힙 재산정 + L5를 필수 통과로 승격 |

### 4-3. 3회차 필요 여부
**R1·R2 결과 전엔 불필요.** 다음 왕복은 결과 문서(`verification/r1_apm-live-branch.md`·`r2_apm-live-collector-cost.md`)를 입력으로, "합격선이 틀린 곳"과 §4-2 분기 결과만 올린다. 그 전에 코덱스 확인이 필요한 항목이 생기면 이 절에 추가한다.

---

## 4-4. UX 정본 `devdesign_apm-realtime-ux.md` §6 요청 10건 — v2 반영 결과
| # | 요청 | 판정 | 반영 절 · 비고 |
|---|---|---|---|
| 1 | 새 메뉴 `/application-monitoring/realtime?tab=active|xview`, 폴더 `pages/application-monitoring/realtime/`, `page_guide.apm_realtime` | **반영** | §4.0 신설·§4.1 경로 교체. 근거(SSE 이중 연결·wall 독립·메뉴 단위 질문)를 정본에 옮겨 적음 |
| 2 | 갱신 판정 ≥ 2×heartbeat(12초 잠정) | **반영** | §2.5 화면 상태 3단 — 코덱스 N11과 같은 결론이라 규칙("≥ 2 × heartbeat")까지 명시 |
| 3 | `config.p95ThresholdMs` 또는 alert-rules 별도 조회 | **반영(둘 다)** | §3.2 `snapshot.begin.config.p95ThresholdMs`(전역 `P95_LATENCY`) + 서비스별 override는 `GET /apm/alert-rules` 별도 조회로 명시 |
| 4 | `stats.hist[15]` 노출 | **반영** | §3.2 — 버킷당 60B 추가(점당 아님)라 frame 상한 안 |
| 5 | `patterns[]`에 `until`·`targetRouteId/InstanceId`·`valueMs` | **반영** | §3.2·§4.4 |
| 6 | (선택) `live.active.instances[]` | **반영(채택)** | §3.2 — 인스턴스 상한 64라 비용 무시 수준, "어느 인스턴스가 stale인가" 툴팁에 필요 |
| 7 | P5.6 비동기 모니터링 단계 행 + WBS 9.6 | **반영** | §0 범위 표·§4.5 신설·§7(FE 단독 1.5~2.5일·P5.1 비의존·선출시). WBS 번호 조정: P5.5=9.5, **P5.6=9.6**, 검수·QA=9.7 |
| 8 | 점 클릭 상태 머신 `unknown→checking→stored|notFound(retryable)` | **반영** | §4.1 — 내용 불변, 전이 문구 채택 |
| 9 | (선택) `control{degraded}.reason` | **반영(채택)** | §3.2 — `connection_queue|frame_limit|arena_pressure`(UX 문서의 `pool_pressure`는 v2 용어 `arena_pressure`로, frame 상한 강등도 v2에 있어 값 하나 추가) |
| 10 | `realtimeSort` 기본 꺼짐 | **반영** | §4.2 |

**보류 0건.** 단 UX 문서가 아직 "초안(사용자 검토 대기)"이므로, 사용자 검토에서 메뉴 위치(개요 탭 vs 새 메뉴)가 뒤집히면 §4.0만 되돌리면 된다(계약 필드는 메뉴 위치와 무관).

## 5. 작업자 메모(v2 작성 중 확인한 것)
- v2는 코드·테스트를 수정하지 않았다(문서만). 코덱스가 인용한 코드 행 번호는 **코덱스 확인분을 그대로 인용**(✅ 표기)했고 v2 작성 시 재확인하지 않았다 — P5.1 착수 시 `ApmRegistryService.reject`·`ApmReceiveTokenService.revoke`·`SignedKeyLicenseProvider` 3곳은 다시 연다.
- §8-1 Q8·Q13 행의 v1 문구("2회차"·"`maxMemory` 50% 기동 실패")는 이력이라 그대로 두고 §8-3에서 v2 결정으로 덮었다.
- 통합 WBS `devdesign_apm-screens-wbs.md`의 WS-9 개정은 아직 하지 않았다(P5.1 계약 확정 시점 — Q15).

---

## 6. UX-r1 §3 정정 반영표 — v2 → v2.1 `[X-r1 정정]` (2026-09-15)

코덱스 UX 1회차 검토(`review_apm-realtime-ux_codex-r1.md`) §3 "v2 필수 8건 반영 간이 확인"의 🟡 2건(2 allocation · 5 바이트 상한)과 "반영 과정에서 새로 드러난 모순" 9행을 v2에 정정 반영했다. 상태는 🟡 **v2.1(수치·단위 모순 정정, R1·R2 실측 대기)**. 원칙: 산술은 전부 스크립트(`scratchpad/calc_v21.py`)로 재계산해 표에 식을 병기, 단위는 MiB(1,048,576B) 통일, "논리 점유 vs retained heap" 구분, 잠정값은 "잠정" 유지. **HTTP 본문 2MB·Collector 큐 5MB·배치 1MB 같은 설정값 표기는 메모리 예산이 아니라 그대로 뒀다.**

| # | 모순(코덱스) | 정정 내용 | 식·산술 | 반영 절 |
|---|---|---|---|---|
| 1 | §2.4↔§5.2 단위 — 45B×1.4M=63,000,000B는 60.08 MiB인데 63MiB로 적음. 헤더 7.2·집계 18도 MB/MiB 혼용 | §5.2 표를 **산술값 열 + 예약 예산 열**로 분리. MB 표기 전부 MiB로 교체(§2.4 본문·표·§3.3·§5.2·§5.5). 합 394 MiB는 유지 | arena 1,400,000×45 = 63,000,000B = **60.08 MiB**(63.00 MB) · 헤더 180,000×40 = 7,200,000B = **6.87 MiB** · 집계 180,000×104 = 18,720,000B = **17.85 MiB** · dedup 90,000×64 = **5.49 MiB** · 상주 산술 소계 107.53 / 예약 118.29 ≤ 160 | §2.4 · §3.3 · §5.2 |
| 2 | 고정 arena↔정상 부하 40MiB — 기동 시 1.4M 고정 할당이면 빈 슬롯도 retained | **설계 결정 변경**: 물리 할당을 **세그먼트(16,384 슬롯 = 720 KiB) 단위 lazy**로. 상한 1.4M 고정·이 밖 allocation 없음(N1 유지), 할당한 세그먼트는 반납하지 않음(고수위·단조). §5.2 정상 부하 행을 "논리 점유 / retained" 병기로. 검증식은 여전히 상한으로 계산 | 정상 부하 900,000×45 = 40,500,000B = **38.62 MiB(논리)** / 세그먼트 ⌈900,000/16,384⌉ = 55개 × 720 KiB = **38.67 MiB(retained)** — 고정 할당이면 60.08. 최대 86 세그먼트(마지막 7,040 슬롯) = 60.08 MiB. 헤더·집계는 고정 배열이라 24.72 MiB 부하 무관(v2 "집계 0.9"는 오기) → 정상 부하 상주 ≈ 70 MiB(추정) | §2.4 자료구조·표 · §5.2 · §6.5 R3 |
| 3 | 사전 예산 8MiB — route 문자만 10.24M자 = 9.77 MiB | **설계 결정 변경**: 예산 `dict-budget-mib` **8 → 20 MiB**. 바이트 카운터가 예산에 닿으면 **신규 route·인스턴스 등록 거부 → `__other__`**(`dictBudget` 계수, 표시 축소). 비-LATIN1 instance id는 2B/char | route String 40,000 × 296B(24 + 16 + 256, 8B 정렬) = 11.29 + 정·역 Map 40,000 × 56B = 2.14 + 인스턴스 12,800 × 272B = 3.61 + 참조 카운트 52,800 × 4B = 0.20 = **17.24 MiB** | §2.4 사전 · 표 · §3.3 · §5.2 |
| 4 | 버킷 헤더 40B — 필드별 타입 없음, 11필드면 52B | 필드별 타입 표 명시(SoA 열 배열, 객체 헤더 없음). 파생값 `provisionalUntil`(= bucketTime + 6,000)·`statsSlot`(= 같은 인덱스)은 저장 안 함, `statsRev`는 집계 슬롯 단일 원천, `delivered`는 연결별 → 9필드 **40B** 유지 | long bucketTime 8 + int × 8(observed·retained·observedEmph·retainedEmph·headSlot·headSlotEmph·pointsRev·lateArrivals) 32 = **40B** → 6.87 MiB. 11필드 전부면 long 2·int 9 = 52B = 8.93 MiB. 집계 슬롯도 97B → 8B 정렬 104B로 정정 | §2.4 자료구조 · §5.2 |
| 5 | 1.35M 보관 목표 vs 잔여 5% 압박(1.33M) — 목표 전에 축소 | **설계 결정 변경**: base 보관 목표 **1,350k → 1,300k**, 압박 임계 **5% → 3%**, 압박 진입 = (잔여 < 3%) ∨ (계층 예약 도달 → 그 계층만). 1.4M = base 1,300k + emphasis 50k + 압박 완충 50k. L3(1,500/초)는 "보관 목표 안"이 아니라 **목표 초과 → 균등 축소 관측 프로필**로 재정의 | 1,400,000 × 0.95 = 1,330,000 < 1,350,000(모순) · 1,400,000 × 0.97 = **1,358,000 ≥ 예약 합 1,350,000**(여유 8,000) · base 1,300k = 1,444점/초 × 900초 = L2의 1.44배 · L3 1,500 × 900 = 1,350k > 1,300k | §0 3분리 표 · §2.4 · §3.2 config · §3.3 · §8-2b·§8-3 주석 |
| 6 | SSE ≤96MiB — 참조 공유는 복사 절감일 뿐, 퇴출 frame을 큐가 붙잡는 메모리·연결별 솎음 직렬화 미정의 | **고유 바이트 전역 상한** `sse-bytes-total-mib` 96 정의: 카운터는 frame 바이트를 **참조 수와 무관하게 1회** 계수. 퇴출 보유 8 초과 → 그 frame을 가장 오래 붙잡은 연결부터 종료, degraded 직렬화 슬롯 4 초과 → 5번째부터 종료. 9번째 view부터는 재생 로그 없이 snapshot 전용 | 96 = 재생 로그 8 view × 16 = 64 + in-flight frame 8 × 2 = 16 + 퇴출 보유 8 + degraded 재직렬화 4 × 2 = 8. 연결 큐 명목 50 × 8 = 400은 실바이트 아님. 정상 상태는 큐 5초분 < 로그 10초라 퇴출 보유 0 | §2.5 바이트 상한 표 · §3.3 · §5.2 |
| 7 | snapshot admission — 64÷32=2는 15분 96MiB와 안 맞고 스트리밍이면 상주 아님. 대기 §2.5 20 ↔ §3.3 10 | **전송량**(32/96, 상주 아님)과 **동시 chunk 버퍼**(snapshot당 ≤ 4 MiB) 분리. `max-snapshot-mib` 64는 버퍼 예산(16개분), admission 2는 **락·복사 CPU 기준 잠정값**(R3 뒤 조정). 대기 상한 **10으로 통일**(§2.5의 20은 오기). 공유 chunk = 참조 카운트, 마지막 연결 송신 완료에 해제, 선두보다 3 chunk 뒤진 연결은 공유에서 분리 → `reject 429 retryable` | snapshot당 직렬화 1 + 송신 대기 3 = 4 chunk × 1 MiB = 4 MiB · 2 × 4 = 8 MiB 산술 / 64 예산. 15분 view 만석 1,350,000 × 90B = 115.87 MiB > 96 → 항상 솎임(`snapshotKeepRatio` ≈ 0.83) · 5분 300,000 × 90 = 25.75 MiB(v2 "27MB"는 MB) | §2.5 admission · 상한 표 · §3.3 · §5.2 |
| 8 | frame 2MiB 초과 — base 0이어도 강조·사전·stats로 초과 가능. `snapshot.begin` 사전은 chunk 규칙 밖 | 초과 정책 3단: base 1/k → 같은 `seq`를 서비스 단위 **≤ 4 part 분할**(`part:{index,count}`, FE는 모아서 적용) → 점 생략·`statsRevision`만(`degraded frame_limit`, `pointsRev` 유지로 다음 tick·snapshot이 채움). `snapshot.begin` **≤ 64 KiB**(메타·config·`dictVersion`만), 사전은 **`dict` chunk**(서비스 단위, ≤ 1 MiB)로 버킷 chunk 앞에 | 4 part × 2 MiB = 8 MiB 상한 · 사전 JSON 상한 ≈ 40,000 route × ~270B ≈ 10.3 + 인스턴스 0.5 ≈ 11 MiB → 11 chunk | §2.5 표 · §3.2 예시(begin·dict chunk·`part`·end 9) · §3.3 |
| 9 | 새 필드↔구식 설명 — arena `flags(status 2bit·layer 1bit)` ≠ §3.1 비트, `base.observed+emphasis.observed` 합산 ≠ `stats.count` | arena `flags`를 §3.1과 동일 비트(bit0 http5xx·bit1 spanError·bit2 slow·bit3 emphasisLayer)로. §3.2 예시에 "base.observed = stats.count(412), emphasis.observed = 부분집합(5), 합산(417) 금지" 주석. 병합 규칙 8을 `observedCount = Σ stats.count`, `displayedCount = 고유 (traceId, spanId) 수(강조 모양 우선)`로 고정 | 412 + 5 = 417 ≠ 412 | §2.4 자료구조 · §3.2 예시·병합 규칙 8 |

**설계 결정이 바뀐 곳(수치 정정을 넘는 것 — 3회차 확인 대상, v2.1 §8-4)**: ① arena 세그먼트 lazy 할당(#2) ② 사전 예산 20 MiB + 등록 거부→`__other__`(#3) ③ base 1,300k·임계 3%·L3 재정의(#5) ④ frame 분할→점 생략 + `snapshot.begin` 64 KiB·`dict` chunk(#8). #1·#4·#6·#7·#9는 v2 결정의 산술·정의 정합이다.

**v2.1이 손대지 않은 것**: HTTP 본문 상한 2MB·Collector 큐 5MB·배치 1MB(설정값 표기) · frame 2MiB·재생 로그 16MiB·연결 큐 8MiB(잠정값 유지) · 위치 인덱스 8 MiB(R3 뒤 결정) · admission 2(잠정, 근거만 교체).

---

## 7. UX-r1 요청 11~16 반영표 — v2.1 → v2.2 `[UX-r1b 반영]` (2026-09-15)

UX 정본 v1(`./devdesign_apm-realtime-ux.md`) **§6.2 신규 요청 11~16**과 **§6.3 후속 F1~F5**를 아키텍처 정본 v2.2에 반영했다. 상태는 🟡 **v2.2(UX 요청 11~16 반영, R1·R2 실측 대기)**. 원칙: UX 정본은 읽기만(수정 없음) · 코드 인용은 이번에 직접 재확인(✅) · 보류는 근거 필수. **결과: 반영 6/6, 보류 0건**, 후속 F1~F5는 §7 "후속 BE 항목" 표로 미결정 등재.

### 7-1. 사전 코드 확인(반영 전 실측)
| 확인 항목 | 결과 | 파일:행 |
|---|---|---|
| FE 페이지 전환 리마운트 key | ✅ **`location.pathname`** — `key={`css-transition-${location.pathname}`}`. 주석 235~239: "`location.key`는 같은 경로의 쿼리스트링 변경에도 매번 바뀌어 리마운트시켰다 → pathname으로 고쳐 같은 경로 내 쿼리 변경은 리마운트하지 않는다" | `moveseyee_fe/src/layouts/app/App.tsx:240`(주석 235~239) |
| UX 정본의 인용 `App.tsx:235~240` | ✅ **정확 — 정정 불필요**(주석 시작 235, key 240) | 〃 |
| 참고: 게스트 레이아웃은 아직 `location.key` | `Guest.tsx:25` `key={`css-transition-${location.key}`}` — 인증 전 레이아웃이라 APM 화면과 무관, 정본에 적지 않음 | `moveseyee_fe/src/layouts/guest/Guest.tsx:25` |
| `GET /apm/alert-rules` 권한 | ✅ **requireEdit** | `moveseye-be-spring/.../premium/apm/alert/ApmAlertRuleController.java:108~110` |
| `GET /apm/services/{uid}/alert-rules` 권한 | ✅ **requireRead** | `〃:278~281` |
| 전역 `ERROR_RATE` 알람 종류 실재(`errorRateThresholdPct` 근거) | ✅ `ERROR_RATE("pct", "%", …)` | `〃/alert/rule/ApmAlertKind.java:39`(`P95_LATENCY` :42) |

### 7-2. 요청별 반영/보류
| # | 요청(UX §6.2) | 판정 | 반영 절 · 내용 |
|---|---|---|---|
| 11 | URL 키 `window`→`win` 통일 · 리마운트 문구 정정 | **반영** | §4.0 — 키 목록 정본을 UX §0 표로 위임(`tab·svc·env·win·at·sel·pt·route·inst·mode`, v2의 `trace`도 `pt`로 통일). 리마운트 불릿 신설: "전환 key는 `location.pathname`(✅ `App.tsx:240`), 같은 경로 query 변경은 리마운트 없음, 상태는 공유·새로고침·뒤로가기를 위해 URL에". 메모리 `fe-page-remount-on-navigate`는 구 동작으로 표기(갱신 대상, 이번 작업 범위 밖) |
| 12(a) | 서비스별 임계 EP를 `GET /apm/services/{uid}/alert-rules`(requireRead)로 정정 | **반영** | §3.2 `config` 주석(행 번호 인용 포함) · §4.2 오류율 게이지 행 — v2의 "`useApmEffectiveRules` 재사용"이 전역 참고선 공급 경로가 아니었음을 명시 |
| 12(b) | `config.errorRateThresholdPct` 추가 | **반영** | §3.2 `snapshot.begin.config`에 `"errorRateThresholdPct": 5.0`(전역 `ERROR_RATE`, 없으면 `null` — 화면은 대체값을 만들지 않음) · §4.2 참고선 출처 교체 |
| 12(c) | 상태 머신 `stored` 조건 + `stored.spanMissing` | **반영** | §4.1 — `200 → stored`를 "업무 성공(envelope OK) ∧ detail 유효 ∧ spans에 선택 spanId 있음 → `stored` / 없음 → `stored.spanMissing`"으로. 403 → `forbidden` 분기 추가(UX §2.5와 일치). 확정 전이는 `stored`·`stored.spanMissing`뿐 |
| 13 | `dict.instances`에 안정 식별값 | **반영** | §3.2 dict chunk 예시에 `"key": "3f9c2b7e41a0d5c8"`(전체 `service.instance.id` 64-bit 해시 hex 16자 — **잠정 산식**, P5.1 계약 표본 JSON에서 고정). URL `inst`는 `key`를 싣고 `display`는 표시 전용. 예산 영향 §2.4·§5.2: +12,800 × 56B = 0.68 MiB → 사전 산술 17.24 → **17.92 MiB**, 상주 소계 107.53 → 108.21, 예산 20·118.29·160은 불변 |
| 14 | `confidence` 의미 · `rSquared` · `errorShare`·`trafficShare` | **반영** | §3.2 `patterns[]` 예시 필드 3종 추가(해당 kind만 값, 나머지 `null`) + 주석 · §4.4 표(`LATENCY_TREND`·`ERROR_CONCENTRATION` 행)와 payload 불릿 — `confidence`는 0~1 휴리스틱 점수(R² 아님, 화면은 "신뢰도"라 부르지 않음) |
| 15(a) | UX 추가분 반영 여부 명시 | **반영(포함)** | §7 — P5.2 1~1.5 → **1.5~2.5일**, P5.3 0.5~1 → **1~1.5일**, P5.3b 3~5 → **3.5~5.5일**(각 행에 "v2 값 + UX 추가분" 병기). 첫 출시 합계 4~6 → **약 5~8일**, P5.4 누적 6~9 → **약 7~10일** |
| 15(b) | P5.6 행 문구 | **반영** | §7 P5.6 행 — "첫 출시 5항목(UX §3.1) FE 1.5~2.5일 + R-P5.6 0.5일 = 2~3일, BE 0, 출시 게이트 = R-P5.6 ⓑ·D-1·3·4·5 합격". 프로파일 탭은 행에서 제거(P5.6b로) |
| 15(c) | P5.6b 행 신설 | **반영** | §7 P5.6b 행(WBS 9.6b) — FE 2~3일 + BE 1~2일 = **추정 3~5일**, 의존 "P5.6 출시 + R-P5.6 합격 + F1~F4 계약 확정". §0 범위 표에도 P5.6b 행 추가 |
| 15(d) | 첫 출시 합계에 P5.6 포함 여부 한 줄 | **반영** | §7 합계 행 — "P5.6·P5.6b는 이 합계에 포함하지 않는다(독립 트랙, 병행)" |
| 16 | §4.5 비동기 정의 3층 교체 · "PRODUCER→CONSUMER cross-trace" 삭제 · "응답에 포함된 링크 L개" · R-P5.6 게이트 | **반영** | §4.5 전면 교체 — 3층 표(관계 · 시간상 특징 · 실제 실행 방식), 확정 표현 폐기 사유("링크에 대상 kind가 없다"), 요약 문구, 첫 출시 5항목, R-P5.6 ⓐ/ⓑ·D-1·3·4·5 게이트. §0 범위 표 P5.6 행도 같은 정의로 |
| F1~F5 | 후속 BE 항목(UX §6.3) | **등재(미결정)** | §7 단계표 아래 "후속 BE 항목 — P5.6b·P5.3b에서 결정" 표. F1은 `dict.instances.key`와 같은 산식 여부를 §8-4 v2.2 추가 안건으로 |

### 7-3. UX 정본 쪽에서 갱신할 것(읽기 전용이라 이번에 손대지 않음)
| 위치 | 내용 |
|---|---|
| UX §0 URL 표 `inst` 행 | 값을 `<serviceUid>:<instance display>` → **`<serviceUid>:<instance key>`**로(§6-13 반영됨 — "같은 표시값 여러 개면 모두 포함" 임시 동작은 폐기 가능) |
| UX §0 URL 표 `win` 행 · §6.2 #11 | "📌 §6-11 정본 요청" 표기를 반영 완료로 |
| UX §0 권한 문단 · §6.2 #12 | `errorRateThresholdPct` "오기 전에는 참고선 없이" → 계약에 들어왔으므로 `null`일 때만 참고선 없음 |
| UX §2.7 패턴 표 | `rSquared`·`errorShare`·`trafficShare`가 계약에 있으므로 "📌 §6-14 필드가 오면" 조건 해제 |
| UX §5 공수 표 · §6.2 #15 | 정본 §7과 일치 확인(P5.6 2~3일 · P5.6b 3~5일 · 첫 출시 5~8일) |
| UX §7 출처 "내부 정본" | `devdesign_apm-realtime.md` v2 → v2.2 |
| 메모리 `fe-page-remount-on-navigate` | "navigate마다 리마운트" → "전환 key는 pathname, 같은 경로 query 변경은 리마운트 없음"으로 갱신(UX §6.2 #11·정본 §4.0 모두 갱신 대상으로 표기) |

### 7-4. 이번에 새로 잠정값이 된 것(코덱스 확인 대상 — 정본 §8-4 v2.2 추가)
- `dict.instances.key` 해시 산식(64-bit hex 16자)과 F1 식별자 통일 여부.
- `errorRateThresholdPct`·`p95ThresholdMs`의 출처 규칙(전역 규칙 복수·비활성 시 어느 값을 싣는지).
