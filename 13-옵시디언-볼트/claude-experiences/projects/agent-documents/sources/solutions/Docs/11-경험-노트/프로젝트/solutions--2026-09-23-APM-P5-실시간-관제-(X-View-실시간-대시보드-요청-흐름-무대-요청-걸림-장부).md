---
type: project
tags: [moveseye, apm, realtime, sse, otel-collector, codex, design-dialogue, epic]
created: 2026-09-15
updated: 2026-09-28
status: done
---

# 2026-09-15~28 — APM P5 「실시간 관제」 (X-View · 실시간 대시보드 · 요청 흐름 무대 · 요청 걸림 장부)

- 프로젝트: [[projects/moveseye/moveseye|moveseye]] · 선행 [[projects/moveseye/2026-09-02-apm-p2-traces|2026-09-02-apm-p2-traces]](P2~P4) · 병행 [[projects/moveseye/2026-09-15-apm-dashboards|2026-09-15-apm-dashboards]] · 후속 [[projects/moveseye/2026-09-28-apm-ingest-resilience|2026-09-28-apm-ingest-resilience]]·[[projects/moveseye/2026-09-28-apm-full-review|2026-09-28-apm-full-review]]
- 상태: ✅ P5.1(BE 7단계)·P5.2(X-View)·P5.3(대시보드)·P5.3b(무대·목록·STUCK_REQUEST)·P5.6(비동기 링크) 전부 master 병합·런타임 실측(09-23)·09-28 코덱스 반영 커밋. 전부 #ZM-122, **미푸시**. 남은 것 = B7 #1 아파치 부하 시험·B7 #2① SharedWorker(설계 결정)·출시 게이트 R2′(격리 호스트 CPU 재측).
- 정본: 설계 `_workspace/designs/devdesign_apm-realtime.md`(v4.3)·UX `devdesign_apm-realtime-ux.md`(v1.2)·계약 `contract_apm-p5-live.md`·안내서 `guides/apm-handbook/`(18·05·12·16)·검수 `reviews/review_apm-p5*`·`review_apm-realtime-*`·`review_apm-p53b-*`·`review_apm-live-*`

## 계기와 방식

사용자가 **JENNIFER APM 기능 페이지 대조**를 요청(🟢5·🟡7·🔴3) → 격차 = 실시간 X-View·액티브 서비스·게이지·이상 탐지. 지시: **"설계는 코덱스 gpt-6-astra와 대화로"**. Claude 초안 v0 → 코덱스(xhigh, read-only) 반박·대안 → 합의 → 실측 → 재판정을 **r1~r3b 네 회전** 돌렸다(설계 813줄→1,124줄). 구현은 코덱스가 짓고 Claude가 검수하거나(P5.6·P5.1 초반), 하네스 `fe-engineer`가 짓고 코덱스 medium이 검수(P5.2·P5.3 — 코덱스 한도 소진 기간).

## 핵심 결정

- **"실시간은 전량·휘발, 분석은 샘플·보존"** — Collector `tail_sampling` **앞**에서 `traces/live` 분기(SERVER 스팬 5~7속성 슬림) → BE 링 15분 → SSE 1초. 저장 경로와 완전히 분리.
- 코덱스 r1이 뒤집은 것: 느림/오류 우선 다운샘플은 분포 왜곡 → **균등 reservoir + 강조 계층** · 실패 200 → `partialSuccess`/400/503 · "DB 0회"는 인증·등록기 조회와 모순 → **메타 캐시(soft 20/hard 30, AFTER_COMMIT 갱신)** · 계절 기준선은 표본 부족 → EWMA 먼저.
- **표시 상한 = 서버 보관 목표·첫 출시 HTTP SERVER만·첫 배포 BE 1대** — 상한을 "표시/보관/처리율" 3개로 분리하라는 r2 필수 8건에 대한 답.
- **라이선스는 매 요청 재계산, `current()` 예외 금지** — 공유 `LicenseService` 수정이 P5.1 2·3단계에 들어가 검수 필수 항목이 됐다(바이트 동일로 불변 확인).
- **visitorId 불일치는 401이 옳다**(정본 403 표기 정정) — 세션을 권한으로 둔갑시키면 FE 재시도가 영구 중단(P2 QA D3의 역방향).
- **사용자 결정(09-23)**: "서비스별 지금 처리 중" 이퀄라이저 차트 제거 · 실시간은 SSE 유지 · 동시 시청은 **설정 승격만 즉시**(`app.apm.live.spans.stream.{max-active 40, max-waiting 10, per-user 4, max-snapshots 2, queue-mib 8, write-timeout-ms 2000}`), 부하 시험·숨긴 탭 정책은 백로그 B7.

## 실측이 뒤집은 것 (R-P5 `verification/r-p5_apm-live-pipeline.md` 921줄)

- **R2 🔴 FAIL**: CPU 1.49배 > 1.20 기준 — 호스트 천장 600 SERVER/초·OFF 편차 39%라 **격리 재측(R2′)이 출시 게이트**로 남음.
- 🔴 `error_mode: propagate`면 라이브 실패 → 503 → SDK 재전송 → **저장 300% 중복**. `ignore`로 바꾸면 OTTL 실패가 exporter 카운터에 안 잡힌다 — 실제 신호는 WARN 로그 2패턴만 → **로그 계수(V59 `apm_collector_log_1m`)+BE 후조건 카나리아+전송 전 차단(`filter/live-safety` 13조건)**.
- 🔴 `keep_keys`는 **키만** 거른다 — 값 PII는 `redaction`+OTTL 4문장 필요. `ottl.set.allowNil` feature gate는 yaml이 아니라 **실행 명령**(미설정이면 `set(nil)`이 조용히 무시 → PII·전송량 47%↑). → 설치 가이드 3 OS에 `--feature-gates=ottl.set.allowNil` + 기존 설치 갱신 절.
- `/apm/otlp-live/**`는 permitAll 아님(401 → Permanent error 영구 손실) · BSP 1000ms는 저트래픽 필수(p95 5.7초) · 슬림 458B·gzip 11.5배 · `partialSuccess`=성공 취급 확증.
- 🔴 `filter/live-http-server`의 `service.name == "moveseye-be"` **자기 제외**가 셀프 모니터링의 유일한 대상을 지우고 있었다(6,625 중 3건 통과). 템플릿엔 아직 남음 — 골든 MD5가 걸려 R-P5b 재시험 필요, 사용자 "나중 작업".
- P5.6: DB에 `links` 있는 스팬 0행이 사실이었다(적재 주석이 맞음). `@Async`/CF 14구성 링크 0%·부모 전파 100% → 출시 문구로. 🔴 **성능 판정은 프로덕션 빌드로만**(개발 빌드는 8스팬도 469ms).

## 구현 이정표

| 단계 | 내용 | 병합 |
|---|---|---|
| P5.1 1 | 수신 관문(live 전송 안 켬): 압축본 상한 2,097,152·공통 admission 4·ID 엄격 hex·카운터 사유 10종 | BE `56bc0a6` |
| P5.1 2·3 | 수량 보존식 N=A+D+R·1,001번째부터 부분 거절·`BoundedLiveDedupIndex`·`LiveMetadataCache`·AFTER_COMMIT 이벤트 3종 | `84edbb9` |
| P5.1 4 | rps 429(인증 전)·`LiveSpanArena`(45B·lazy 세그먼트·초별 reservoir)·`LiveSpanRing` 907칸·사전 20MiB(🔴 ID 네임스페이스=서비스 — 전역이면 30분에 65,534 소진) | `5628520` |
| P5.1 5 | snapshot·SSE(`Last-Event-ID` 한 단계 되감기 멱등·누수 게이트 32 시나리오·변이 3/3) | `3c76a74` |
| P5.1 6 | Collector 라이브 설정 생성(`liveSpans` 기본 꺼짐, 꺼짐이면 기존 생성물 불변)·V59 로그 계수·**골든 회귀** `r-p5b-live-processors.golden`(MD5 고정, 실패 메시지 'R-P5b 재시험 필요') | `8d6f730` |
| P5.1 7 | 계약 대조(`integration-qa`)가 찾은 구멍 4건(arenaPressure 누적 카운터·`live{}` 통째 공백·`stats.minMs/sumMs`·표본 0건) → **골든 23개가 FE 계약의 정본** | `8df357d` |
| P5.6 | 비동기 모니터링(같은 trace links·PRODUCER→CONSUMER cross-trace·부모 종료 후 자식, `?tab=async`) — 코덱스 구현, FE 단독 | FE `ddc983b` |
| P5.2·5.3 | X-View 5계열·"표시 n/관측 m"·점 클릭 상태 머신 / 실시간 대시보드 | FE `p5-xview` 5커밋 → master |
| 09-17 | A안 완료 요청 지연 구간 차트(FE `7cbb8a1`, 🔴 산점도와 모집단 다름) · **서비스별 수집 중지**(BE `ba452df` V60·FE `fa594eb`, `collecting`은 `HIDDEN`과 다른 축·네 조합 실재·`COLLECTION_PAUSED` 폐기 사유) — 09-18 런타임 검증 | |
| 09-22 | 회수 토큰 자동 삭제 B2(V65, 180일) · 자바 확장 추적기 개선(맵→`AtomicReferenceArray<Token>`, 8~16배) · **P5.3b 요청 흐름 무대**(제니퍼 스피드바식 레일·동전·원판) + 2단계 목록(확장 로그 한 줄 → `ActiveRequestListIngestor` → 드로어 → 저장 트레이스 찾기), 확장 0.2.0 | BE `2d7c9bb`·FE `70850e7`… |
| 09-23 | 코덱스 sol/high 3곳 검수 🔴8/8·🟡17/23 반영(BE `max-heap-mb` 192→384·목록 인스턴스 16 상한·미래 asOf 거부 / 확장 목록 64K·Token release·max-active 20만) · **요청 걸림 장부** kind `STUCK_REQUEST`(V67 60초 시드)+1초 감시기 `ApmStuckRequestMonitor/Ledger`(ENDED/LOST/RULE_OFF)+Zabbix push+FE `?tab=stuck` · **런타임 실측 통과**(임계 1초로 livecheck 부하 → 장부 14행 → 이벤트 발화·해소 → push 2회) | BE `763d6a4`·`14be86e`·`db94a54`·FE `60adba4`·`7db36a2` |
| 09-23 밤 | SSE 상한 설정 승격 `2339a2d` · B6·B7 구현(`GET /apm/live/spans/stats`·헤더 "내 연결 n/4"·대기/429 배너·연결 끊기) | BE `3f731d5`·FE `105c8bf` |
| 09-28 | 코덱스 sol/high 검수 반영: 🔴 BE 빈 환경변수가 조용히 기본값으로 접힘 → `requireNonBlank`+`BlankValueGuard` · 🔴 FE asOf 0 행 맨 앞·경과 수십 년 · 🔴 429 뒤 대기열 진입 시 too-many가 queued 가림 | BE `fbcee63`·FE `7fa65a6` |

## 사고·교훈

- 🔴 **`C:\ProgramData\moveseye\config.yaml`을 내가 깨뜨렸다가 복구**(09-17) — 내가 준 PS 명령이 `Get-Content -Encoding UTF8`을 빠뜨려 cp949로 읽음. YAML "control characters are not allowed"의 실체는 ASCII 제어문자가 아니라 **U+0080(C1) 136개** — `b<32`만 스캔하면 0건으로 오진. 깨진 글자가 전부 주석 안이라 주석만 걷어 토큰 재발급 없이 살림(`validate` exit 0).
- 🔴 **수집기 redaction이 로그 본문 13자리 숫자를 가린다**(09-23) — 처리 중 목록이 **부하 중에만** 안 들어옴(빈 `[]`은 통과, 항목 있는 목록은 통째 소실). `redaction/pii`의 `\b(?:\d[ -]*?){13,16}\b`가 epoch ms를 가려 JSON이 깨지고 BE 파싱 실패를 null로 삼킴. 확장·감시기·세션 문제로 1시간 오진. → 확장은 `a`를 빼고 BE가 `asOf−e`로, 파싱 실패는 DEBUG 로그. → [[topics/backend/otel-collector-pitfalls|otel-collector-pitfalls]]
- 🔴 **성능 최적화 지시가 정확성·정직성 규칙을 깨뜨리는 패턴이 반복** — P5.2 키 축소 → 사전 ID 재발급 필터 누락·dedup 축소 / P5.3 내가 지시한 3초 유예 → '관측 없음≠0' 규칙 파괴 / 동시요청 재합산의 분자·분모 출처 혼합. 코덱스가 두 번 다 잡음. **성능 수정 뒤에는 표본 동등성·문구 규칙 회귀를 붙인다.**
- 🔴 **코덱스가 killed돼도 worktree 파일 수정은 남는다** — 보고서 0바이트여도 항목별 grep+전체 테스트로 확인 후 이어간다. 반대로 코덱스 샌드박스 오류(`setup refresh had errors`)는 판정이 아니라 환경 오류 → `-c windows.sandbox='"unelevated"'` 또는 근거 인라인 첨부. → [[topics/claude/codex-exec-operations|codex-exec-operations]]
- 🔴 **메모리**: BE `:test`와 FE jest 동시 실행 → 97% → `ApmCollectorLiveRuntimeTest` 3건 거짓 실패(20초 대기 초과). 타 세션 jest 워커 6GB면 대기 중 백그라운드도 kill. 31GB 중 26GB 타 프로그램 점유 → 코덱스엔 전체 `:test` 금지·선별만.
- 🔴 **IT DB 충돌**(09-16 실측): `IntegrationTestSupport`가 클래스 로드 시 `moveseye_it`을 drop/create — 두 세션 동시 실행이면 113건/9클래스 무더기 실패. 판별 = 재실행 때 **실패 메시지가 바뀐다**. → [[topics/backend/shared-it-db-worktree-collision|shared-it-db-worktree-collision]]
- ECharts: gauge `axisLine.roundCap: true`는 구간 색이 둘 이상이면 다이얼을 색 원판으로 채움 · 이퀄라이저 `axisLabel.interval: 0` 없으면 두 번째 이름이 통째 사라짐 · 한국어 `toLocaleTimeString({hour12:false})`는 "17시 38분 38초".
- 첫 tick `nowMs − Long.MIN_VALUE` 오버플로 → 명시 비교. heredoc이 JSON 로케일에 실제 줄바꿈을 넣음 → 로케일 편집은 스크립트 파일로. 액티브 요청 스위치는 환경변수 아닌 `-D`만 동작(대조 실험). 확장 jar는 `C:/ProgramData/moveseye/otel/`에 덮어써 BE 재시작 필요.
- 🔴 curl 부하 루프에 `-c`(쿠키 저장) 금지 — 응답 쿠키가 세션을 덮어 401. 계정당 세션 1개라 admin 로그인은 사용자 브라우저를 끊음 → 임시 계정(admin 행 복제 후 삭제). IDE로 띄운 BE 재기동은 `Win32_Process` 실행줄 복제(사용자 IDE에 `-javaagent`가 두 번 들어가 있었음 — 정리 권고).
- 큰 산출물은 처음부터 단위별 파일 + index로 — 종합 안내서 1,108줄 하나에 넣자 사용자 "왜 하나에 다 때려박았대" → 18파일 분책. 메뉴 워크스루는 비유(토큰=우편함 출입증)가 잘 통했다.
- 🔴 고객 문서는 코드 대비 낡기 쉽다(09-28 사용자 "문서는 실제 커밋이랑 코드 보고 계속 갱신해") — 애플리케이션-모니터링 고객 문서가 P1 상태로 낡아 있었다(서비스 맵·트레이스·합성이 '예정'). APM 기능 커밋마다 고객 문서 확인.

## 관련
[[projects/moveseye/2026-09-02-apm-p2-traces|2026-09-02-apm-p2-traces]] · [[projects/moveseye/2026-09-15-apm-dashboards|2026-09-15-apm-dashboards]] · [[projects/moveseye/2026-09-28-apm-ingest-resilience|2026-09-28-apm-ingest-resilience]] · [[projects/moveseye/2026-09-28-apm-full-review|2026-09-28-apm-full-review]] · [[projects/moveseye/2026-09-28-apm-metric1m-deadlock|2026-09-28-apm-metric1m-deadlock]] · [[topics/backend/otel-collector-pitfalls|otel-collector-pitfalls]] · [[topics/claude/codex-exec-operations|codex-exec-operations]] · [[topics/backend/shared-it-db-worktree-collision|shared-it-db-worktree-collision]] · 메모리 `apm-implementation-progress`·`apm-collector-redaction-log-body`
