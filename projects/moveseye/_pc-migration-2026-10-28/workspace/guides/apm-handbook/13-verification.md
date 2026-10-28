# §8 검증 현황과 남은 것 — 방법론·QA 수치·미검증·열린 결정·정본 불일치 14

> **MovesEye APM 종합 안내서** 분책 13/18 · 원본 절 **§8 (8.1~8.5)** · 마지막 갱신 **2026-09-17**(2026-09-15 §8.2 R-P5.6 행에 이어, 2026-09-17 §8.2에 **R-P5 R1·R2·R-P5b** 행 · §8.3에 P5 미검증 4행 · §8.4 열린 결정 13~15 · §8.5 불일치 15~17 추가).
>
> **이 문서를 읽으면 알게 되는 것**
> 1. 어떤 방법(검수 왕복·로직 분석·변이 실험·런타임 종단 QA·계약 픽스처)으로 검증했고 각 단계 QA가 무엇을 얼마나 잡았는지
> 2. 아직 아무도 실제로 본 적 없는 것(실 SDK 번들·실 K8s·아파치 SSE·다중 BE 노드·**P5 실 BE 연결·R2′·R-P5″** 등)과 열리는 조건
> 3. 열린 결정 15와 이 안내서를 쓰며 확인한 정본 간 불일치 17
>
> **전제 문서** — 이전 [12-operations.md](12-operations.md) · 다음 [14-glossary.md](14-glossary.md) · 목차 [00-index.md](00-index.md). P5 검증 전체는 [18-p5-realtime.md](18-p5-realtime.md) §10.7·§10.8. 용어는 [14-glossary.md](14-glossary.md), 출처 전체는 [17-sources.md](17-sources.md).
> **표기**: 🔴 = 어기면 데이터가 조용히 틀리는 규칙 · ⚠️ = 알고 있어야 하는 한계 · ✅ = 실측으로 확인된 것.

## 8. 검증 현황과 남은 것

> 이 장을 읽으면: ① 어떤 방법으로 검증했고 각 단계 QA가 무엇을 얼마나 잡았는지, ② **아직 아무도 실제로 본 적 없는 것**의 목록, ③ 열린 결정이 무엇인지 알게 된다.

🔴 **P5 행을 읽을 때의 주의**: 아래 §8.2의 P5 판정은 **"실행 전에 고정한 판정식에 측정값을 그대로 대입한 결과"**이고(사후 완화 0건), 그 판정이 **어느 범위를 뒷받침하는지**는 따로 봐야 한다. R-P5는 실행 전에 계약 이탈 3건 — 반복 축소 · 부하원이 **합성 OTLP 주입**(실 javaagent 아님) · **BE 라이브 EP 미구현이라 캡처 서버가 대역** — 을 선언하고 시작했고, 호스트는 **비격리**(기준 CPU 54~72%)에 **부하 천장 600 SERVER/초**였다. 그래서 같은 문서가 "제한된 관측 PASS"·"계약 기준 미입증"을 PASS와 구분해 쓴다.

### 8.1 검증 방법론 — 네 겹

| 겹 | 무엇 | 왜 이 겹이 필요한가 |
|---|---|---|
| **코덱스 검수 왕복** | 물결마다 `codex exec`에 요청서(`reviews/review_apm-*.md` — 범위·의도·버린 대안·불안한 지점)를 주고 `_codex.md` 결과를 받아 반영 커밋. P1 3회·Live 4차·P2 5회·P3 3회전·P4는 역할 교대 | 만든 사람이 못 보는 것: AND/OR(SLO)·정렬 없는 limit·advisory lock 필요성·`post_type` 부재 |
| **로직 분석·주석 쓰기** | 구현 직후 "코드 실동작 분석 문서"(`features/apm/core/apm-p1-logic-analysis.md`, A1~A29)와 145파일 상세 주석 | 검수보다 결함을 더 찾았다(P1 코덱스 1차 4건 vs 분석 5건). "설명하려고 읽으면 결함이 나온다" |
| **변이 실험** | 가드 한 줄을 되돌려 의도 테스트만 빨개지는지 확인(P4 A4·B5, 코덱스 지적 "되돌려 보기") | 초록은 "코드가 테스트와 일치"이지 "세상과 일치"가 아니다 — 보안상 가장 민감한 줄 5개에 테스트가 0이었다 |
| **런타임 종단 QA** | BE 사본 `:3001` + DB `dmove_apm`(5433) + Collector + 샘플 앱(qa-node·qa-python) + 실 Zabbix(`dmove.co.kr`) + 헤드리스 Chrome CDP. 판정은 API+DB+DOM 어서션, 스크린샷 0장, 사용자 `:3000`·`:5173` 무접촉 | 정적 검증이 못 보는 것: exemplar 0/23·에러 화면 15분 창 공백·Python RED 전량 폐기·`keepRawSql` 생략 시 K8s 유실 |
| **계약 픽스처 게이트** | BE 표본 JSON을 애플리케이션 `ObjectMapper`·실제 컨트롤러로 생성, FE `npm run typecheck:contract` | 손으로 지은 표본이 둘 다 틀려도 초록(P2 D6) |

### 8.2 단계별 QA 수치

| 단계 | 결과 | 남은 것 |
|---|---|---|
| P1 QA(09-01) | 결함 8(HIGH 1: Python semconv) 전건 반영 | 비관리자 읽기전용 미검증(당시 계정 없음 → 권한 QA로 대체)·개요/알람/도움말 브라우저 일부 미완 |
| self-monitoring 3회차 | 빈 DB → 수신 → 등록 → 적재 → 조회 → 롤업 → Zabbix 실 프로비저닝·push ok | 데모 Zabbix 잔존물(호스트 10757) self-monitoring용 |
| Live QA | 결함 0, 권고 2(`X-Accel-Buffering`·점 기준 시간화) | 아파치 버퍼링·`enabled:false`·`__other__` 재현 불가 |
| P2 QA(09-02, 2회차) | 1회차 15(HIGH 2) → 2회차 15/15 PASS + 신규 3(D17 800배) | 트레이스 비교 화면 없음·links 실데이터 0·BRIN 효용·대량 백필 잠금 |
| 권한 QA(09-03) | 8/8 PASS(V48 실적용·역할 편집·USER 흐름 A/B/C) | — |
| P3 QA(09-07, 2회차 09-08) | PASS 74/FAIL 3·결함 23 → 2회차 재검증 전건 PASS, 신규 6(MED 1: D10 트리거 이름) | D10·D3d 런타임 재현·`PROXY_GROUP`·`truncated:true`·실 메시징/배치 스팬 0건·실 LLM 대화 |
| P4 QA(09-14) | PASS 92/FAIL 1(D1 HIGH) + 관찰 5, 실 브라우저 CORS/CSP/4단 워터폴 실측 | 아래 7.3 |
| **R-P5 R1**(09-15, 라이브 파이프라인 분기·PII·정합성·지연 — `features/apm/realtime/r-p5_apm-live-pipeline.md`) | 🟡 **조건부 PASS(P0 7건 반영 시)**. ✅ R1-1 분기(오포함 0·탈락 0) · R1-3 정상 유실 **0.0000%**(10분 347,830건, 반복 전부 0, 세 지점 일치) · R1-9 부분 성공(exporter 측 재전송 0·WARN 119) / 🔴 R1-2 PII는 **설계 v2 원문에서 4종 유출**(`http.route` 값 4,798·`service.instance.id` 값 3,603·`scope.name` 3,603·`schemaUrl` 7,206) → 결합 정본 **13/13 차단**으로 해소 / 🟡 R1-7 지연은 **완료→캡처** 관측으로 정정(@600/초 BSP 1,000 p95 1,227 ms · BSP 5,000 p95 1,521 ms · @10/초 BSP 5,000 **5,727 ms**) / 🟡 R1-10 상한(압축본 512 KiB가 정상 입력 거절 → 2 MiB) | 🔴 **R1-4·5·6·8 전부 미측**(BE 링·집계·메타 캐시가 당시 미구현 — 캡처 서버가 대역) · **완료→링·완료→화면 지연 미측** · BE 수량 보존식 미측 · 상한 초과 거절 미측 → **전부 R-P5″**. 🔴 **L2(1,000)·L3·L5 미도달** — 호스트 부하 천장이 **600 SERVER/초** |
| **R-P5 R2**(09-15, Collector 비용·저장 경로 보호 A/B) | 🔴 **FAIL 2건**. 🔴 R2-1 CPU `C_ON/C_OFF` = **1.49**(합격선 1.20) · 🔴🔴 R2-8 `error_mode: propagate`에서 **`apm_span` 중복 26,769건(고유의 300%)**(`ignore`는 0) / ✅ R2-2 RSS 1.057 · R2-5~7·9 장애 5종에서 저장 추가 유실·중복 0 | 🔴 **v3의 "나머지 8항목 PASS"는 철회** — 정확한 요약은 "2건 FAIL, 나머지는 **제한된 관측 PASS·부분 PASS·미입증**이 섞여 있음". R2-3 처리량·R2-4 지연은 **계약 기준 미입증**(proxy 도착/생성 비율이지 ID 집합·DB commit 대조가 아니다) · 호스트 **비격리**(기준 CPU 54~72%, OFF끼리 39% 편차) → 🔴 **R2′ 격리 재측이 P5.1 출시 게이트** |
| **R-P5b**(09-15, 결합 YAML correctness — `features/apm/realtime/r-p5b_apm-live-yaml-correctness.md`) | **v3 yaml FAIL · v4 yaml PASS**(yaml 문장 변경 0, 주석·운영 규칙만 정정). ✅ PII 13/13 · 분기 `E == A` · 절단 경계 U+FFFD 0 · `filter/live-safety` 13조건(정상 오탐 0) · 형태 fixture 13/13 · `summary: silent` · `truncate_all`은 **문자 경계**에서 자름 | 🔴 압축본 상한 **512 KiB는 정상 입력(572.4 KiB) 거절** → 2 MiB로. 발견 6건이 정본 v4.1에 반영([부록 B](15-overturned.md) #29·#30·#32) · CPU·RSS·3회 반복·L2/L3는 **명시적으로 R2′ 이월**(부하는 60~150 SERVER/초 correctness 전용) · `num_consumers` 1 vs 2 미비교 · 실 javaagent는 R7 |
| **R-P5.6**(09-15, P5.6 비동기 표시 출시 게이트 — `features/apm/realtime/r-p5-6_apm-async-links.md`) | **게이트(ⓑ 보존 + D-1·3·4·5) PASS**: D-1 링크 191건 ID·순서·허용 속성 100% 보존·비허용 잔존 0·33/128/129 → 앞 32 · D-3 마커 10/10(경계 1000·1001·1002ms, 동기 대조군 0) · D-4 이동 100%·접힌 깊이 4 자동 펼침·미저장/스팬 누락/403 구분·복귀 3종 복원 · **D-5 프로덕션 빌드** 최장 정지 228ms·입력 29ms @5,000스팬 · 금지 문구 0. 게이트 밖 D-2: 자동계측 `@Async`·CF **14구성 1,400요청 링크 0%·부모 전파 100%**. 구현 수정 요구 **0건**, 문서 정정 4(UX 정본 v1.2) | Kafka/RabbitMQ 미측정(브로커 없음 — 링크 자동 생성 결론의 유일한 공백) · 실 GPU 성능 · 다른 호스트 시계 차이 · 동일 스레드 이름 두 JVM(P5.6b) · 실제 tail 조건의 확률적 미저장 · 가상 스레드 · 128/129 리더 경계는 적재 32에 가려 관측 불가(`linksTruncated`와 함께) |

### 8.3 미검증 목록 — "아직 아무도 본 적 없다"

| 항목 | 지금 아는 것 | 열리는 조건 |
|---|---|---|
| **실 SDK 번들**(OTel JS 2.x 정확 조합, 동의 철회) | 스니펫은 Node ES module 구문·6건 단위 테스트만. QA는 CDN `web-vitals@4` + 수동 fetch로 대체 | 첫 RUM 고객 사이트 |
| **실 K8s**(RBAC·kubelet TLS·DaemonSet 분리·다중 클러스터) | 픽스처는 contrib 출력 계약 재현본, `validate` 미실행 | 테스트 클러스터(WBS 5.3a) |
| **아파치 SSE 버퍼링** | BE 헤더만. mod_proxy 미확인 — P1.5 Live에서 열려 있던 항목이 **P5의 1초 스트림에서 더 민감**해졌다 | 실서버 배포 전 |
| **다중 BE 노드** | Live 링·**P5 arena·사전**·RUM 상한이 전부 인메모리 단일 노드 전제. P5는 승격 조건 여섯을 표로 못박아 뒀다(Collector live 라우팅·SSE 경로 라우팅·**메트릭도 같은 노드로**·변경 지연 명시·롤링 분할 방지·ingress 실경로 검증) | 2대 설치본이 생기는 날(Redis Stream/원자 연산) |
| **P5 실 BE 연결**(FE ↔ 라이브 SSE) | 🔴 화면(P5.2·P5.3)은 **BE 골든 23개를 옮긴 계약 픽스처 + 목 EventSource**로만 검증됐다. 커밋 메시지가 스스로 "실 BE 연결 검증(CRC32 산식 일치·브라우저 long task) 미실시"라고 적어 뒀고, **snapshot 체크섬 산식이 BE와 실제로 맞는지 증명되지 않았다**(단위 테스트는 자기 산식끼리 비교) | BE `enabled=true` + 수집기 라이브 옵션을 켠 QA 환경 |
| **P5 R2′·R-P5″·R3·R4·R6·R7** | R2′ = 격리 호스트 CPU 재측(**출시 게이트**) · R-P5″ = BE 보존식·집계·TTL·늦은 도착·완료→화면 지연 · R3 = 힙(arena 실측은 있으나 SSE fan-out·tick 시간은 추정) · R4 = 브라우저 상한(잠정 300k/500k) · R6 = 느린 writer 반환 · R7 = **실 javaagent** A/B(지금까지 부하원은 전부 합성 OTLP 주입) | 각 단계 착수 + 격리 호스트 확보(일정 미정) |
| **P5 운영 규모 부하** | 6단계 회귀는 **축소한 예산**(`transferCap`)으로만 확인 — snapshot 축소·재시작 계약의 **32/96 MiB 실규모**, 자기 메트릭 증가량, 내부 로그 전송량, BE 장애 시 로그 피드백 루프가 전부 미실행 | 출시 부하 검증 |
| **P5.2·P5.3 재검수** | ⚠️ 코덱스 2차가 P5.2에 🔴2, P5.3에 🔴6을 내고 "수정 후 **재검수**" 판정을 했다. 수정 커밋(`09392b7`·`d28d89f`)은 나왔으나 **그 뒤 재검수 문서가 없다** · 🔴 두 화면은 2026-09-17 `master` 병합(`4e4062f`, ⚠️ 미푸시)됐지만 재검수 문서 부재는 그대로다 | 재검수 1회 + 선별 병합 |
| 비-JVM 런타임 실측(R12 잔여) | Node·Python HTTP는 실측, .NET·Go·런타임 슬롯은 표만 | 스택별 샘플 앱 |
| 실 메시징·배치 스팬 | 샘플 앱이 PRODUCER/CONSUMER·`job.name` 0건 — 손으로 만든 OTLP만. R-P5.6(09-15)도 CONSUMER kind와 링크를 **합성으로만** 넣었고 `@Async`·CompletableFuture 실 javaagent에서는 링크 0건 — **자동계측이 링크를 만드는 현실적 경로(메시징)가 그대로 미측정** | Kafka 등 실 앱(로컬 브로커) |
| 대량 백필 잠금·WAL(트레이스 롤업 `maxBuckets` 288) | 메트릭 쪽 전례(288→60)만 | 첫 대량 정체 |
| 목록 cold 재실측 | Q1 수정 후 재실측 못 함(합성 데이터 삭제) | 다음 볼륨 실측 |
| 50,000행 절단·`mixedBounds:true`(RUM) | 경계 테스트만 | 실사용 30일 창 |
| Zabbix 알림 **도달** | 액션이 0이라 배지까지만 | 고객 액션 |
| 정리 큐 `apm_zbx_cleanup` 실패 경로 | 2회차에 행 생성·소멸은 봄, 강제 실패 유도 실패 | Zabbix 장애 |
| 라이선스 시나리오 QA(8.10) | 미보유 403·재등록 복구는 P1 QA C-3, 만료 READ_ONLY·재시도 상한은 시나리오 미실행 | — |
| 실 LLM 대화(AI 툴) | dev 툴 EP 단독 호출만 | — |

### 8.4 열린 결정

| # | 결정 | 현재 | 후보 |
|---|---|---|---|
| 1 | **푸시** | BE·FE·AI 커밋 다수 미푸시(사용자 직접 푸시 규칙) | 사용자 |
| 2 | **읽기 티어** | `apm.view` 기본 열림, 원문은 관리자 역할 | 원문 전용 권한 칸 신설 / 서비스 단위 데이터 권한(Q17) |
| 3 | **F1~F4** | 페이지별 `ttfbP75Ms`·버킷별 p75 시계열·목록 상한 플래그·표본 보완 — FE 대체 표시 중 | BE DTO 변경 |
| 4 | **로그 상관**(P4 잔여) | 미착수 — `devdesign_log-domain.md` 선행 | 로그 도메인 설계 |
| 5 | 저장 계층 승격 | 3축 기준([3.6절](03-constraints.md)) 미도달 | S1 `dims` 사전(P2와 함께 판단 보류 중) → ClickHouse |
| 6 | Collector 번들 동봉(Q11) | 다운로드 링크 + 미러 프로퍼티 | 설치 번들 과제와 함께 |
| 7 | Prometheus/hostmetrics(Q13) | 안 함 | 수집 엔진 스텝 6 재개 시 |
| 8 | 서비스 자동 **삭제** | 숨김까지만(관리자 DELETE EP) | DELETE 경로 실사용 뒤 |
| 9 | `maxMs`→`valueMs` 개명 · 트레이스 비교 화면 · `/layout`·treemap·sankey EP | 미구현/보류 | FE 동시 작업 |
| 10 | Live 다중 인스턴스 · 액티브의 인스턴스 합산 | ✅ **인스턴스 합산은 P5.1 7단계에서 해결**(속성 조합별 최신값 합 → 인스턴스 합, `8e1cc05`). 다중 노드는 여전히 단일 전제 | Redis Stream(승격 조건은 [18-p5-realtime.md](18-p5-realtime.md) §10.5) |
| 13 | **P5 라이브를 켤 것인가·언제** | 🔴 BE·FE(화면 둘 포함) 모두 master에 병합됐으나(FE `4e4062f`, 둘 다 미푸시) **수신 기본 꺼짐**, 출시 게이트 **R2′ 미실행** | R2′ 통과 → 선별 병합 → 고객별 opt-in |
| 14 | **P5.3b 액티브 요청 목록**(Java 확장 jar) | 미착수. 기술적으로는 유일한 길이지만 **고객 JVM에서 우리 코드가 도는 지원 범위**가 새로 생긴다 | R5 시제품 + **제품 지원 결정**(기술 판단만으로 못 정한다) |
| 15 | **P5.6b 후속 BE 항목 F1~F5** | 인스턴스/프로세스 식별자 · `linksTruncated` · 역방향 조회 EP · 링크 대상 kind 일괄 확인 · 시작 이벤트 — 전부 **미결정** | 해당 단계 착수 시 계약서로 |
| 11 | RUM 다중 노드 예산 | 인메모리 | Redis 원자 연산 |
| 12 | 자동 삭제 미구현·A6(HIDDEN 전환 시 Zabbix 객체 정리 경로) | 추정 등급 | — |

### 8.5 정본 간 불일치 (이 문서를 쓰며 확인한 것)

| # | 어디 | 무엇 | 어느 쪽이 맞나 |
|---|---|---|---|
| 1 | 설계 §7 마이그레이션 번호 | "V36(P1)·V37(P2)·V38(P3)·V39(P4)" | 실제 V38·V44·V51~V56·V57(설계 v3.2 머리말만 정정, 표는 구 표기) |
| 2 | 설계 §7 `apm_span PK(trace_id, span_id)` | PG 파티션 제약 | 실제 `(trace_id, span_id, start_ts)` |
| 3 | 설계 §7 `apm_rum_token` 별도 표·`apm_slo.zbx_*` | — | 실제 `apm_receive_token` 재사용(kind=RUM)·`apm_alert_rule.slo_id` 역링크 |
| 4 | 설계 §8.1 `/reports?type=APM_WEEKLY`·`/reports/{id}` · `/service-map/layout`·`/errors/treemap`·`/db/slow-series`·`/dependencies/sankey` | — | `/admin/reports?type=`·`/admin/reports/apm/{id}` · 넷은 미구현(계약 §7.1·§10 명시) |
| 5 | 계약 `features/apm/core/contract_apm.md` §1 시드 표 | `apm_hist_bounds` 2행(`gc_s` 8단) | V38 말미가 R1 실측으로 `gc_s` 4단 재시드 + `db_operation_s`·`pool_ms` 추가(4 family). 계약 표가 구본 |
| 6 | Live 설계 §1 vs 설치 가이드 코드 | `OTEL_METRIC_EXPORT_INTERVAL` 10000 "안내해야" vs 15000 "선택" | [7.11절](12-operations.md). 결정 필요 |
| 7 | 설계 §2.1 "보존 기간 뒤 자동 삭제" | — | 계약 §5.4: P1은 숨김까지, 삭제는 관리자 EP만 |
| 8 | 설계 §8.4 AI 툴 5 · WBS 8 · walkthrough §22-2 "툴 8" | — | 현재 11(`features/apm/core/contract_apm-p3-ai.md`) |
| 9 | WBS §1.2 서비스 상세 탭 12 | 로그 탭 포함 | 구현 11(로그 미개방) |
| 10 | 설계 §4.3 `db.client.operation.duration` 차원 `db.operation.name`·`db.collection.name` | — | 실제 `db.system.name`·`db.namespace`·`db.operation`(summary 첫 토큰) |
| 11 | walkthrough 머리말 파일 수(BE 264·FE 121) | 시점 | 현재 BE `premium/apm` 287 + `otel` 18, FE 112 tsx |
| 12 | `ApmJobConventions` javadoc "하루보다 긴 잡 … 10분" | V54 이전 문구 | 코드는 완료 시각 경로(15분 경계 해소) — 갱신 대상(walkthrough §20-3이 이미 지적) |
| 13 | `collector-template.yaml` `filter/metrics`에 구 `container\.restart_count` 패턴 | 계약 §6 반영 문단은 "제거했다" | 계약 §6(2026-09-14 반영)이 정본이면 템플릿 확인 필요(walkthrough §27-2는 "아직 있다") |
| 14 | WBS §1.2 "사이드바 상위 6개 노출" · 화면 가이드·AI screens.json | RUM·SLO 비노출 | FE `SideNav.tsx`는 P4에서 **RUM을**, 09-16에 **SLO를**(`3a09b33`) 사이드바 자식으로 노출해 **현행 8개**다. 설계 S1·screens.json 갱신 필요 |
| 15 | UX 정본 §0 "현 APM 메뉴 ✅ 7개 → 추가하면 8개" | `slo`를 빠뜨린 오계수 | **8개 → 9개**가 맞다(계약서 `features/apm/realtime/contract_apm-p5-live.md` §6-J·§7.3 실사). UX 정본 v1.3에서 정정됨 |
| 16 | 설계 `devdesign_apm-realtime.md` §2.5 `control.resume` · §3.2 `dictDelta` 예시 · §3.3 거절 사유 개수 | 문서가 코드와 다름 | **코드가 정본**: `resume`을 보내지 않는다(재개 신호는 새 `snapshot.begin`) · `dictDelta`는 `{from,to,services,routes,instances}`(FE가 `services`를 안 읽으면 신규 서비스를 영영 못 본다) · `LiveIngestCounters.Reason`은 14종이 아니라 **16종**(`rateLimited`·`rateLimitMapFull` 추가) · 스트림 열기 전 401 본문은 `ApiResult`가 아니라 `{code,errorCode}` 두 필드 |
| 17 | `reviews/`에 P5.1 **2·3단계·4단계·5단계의 `codex-fix` 문서가 없다** | 🔴가 닫혔다는 기록이 검수 폴더에 없음 | **커밋 메시지가 정본**("R1~R6·R9 반영"·"R1·Y1·Y2·Y4·Y5 반영"). 1·6·7단계는 `codex-fix` 문서 있음. `review_apm-p52-fe_codex-impl.md`는 **0바이트** |

---

## 더 보기 — 내부 정본(이 문서에서 근거로 인용한 것)

경로는 `C:\solutions\_workspace\` 기준, 코드는 각 레포 `src/main/java/com/dmove/moveseye/` 기준. 절별 정확한 위치(§·#·클래스)는 본문 각 절 끝의 **더 보기** 줄에 있고, 아래는 그것을 문서 단위로 모은 것이다.

- 이 문서 본문에는 절별 **더 보기** 줄이 없다(부록·목차 성격). 근거 문서 전체는 [17-sources.md](17-sources.md) D.2.
- 관련 분책: 이전 [12-operations.md](12-operations.md) · 다음 [14-glossary.md](14-glossary.md) · 목차 [00-index.md](00-index.md) · 용어 [14-glossary.md](14-glossary.md) · P5 검증 상세 [18-p5-realtime.md](18-p5-realtime.md) §10.7·§10.8 · 출처 전체 [17-sources.md](17-sources.md)

## 출처 — 외부 공식 문서(이 문서에 쓰인 것만)

이 문서 본문에는 외부 URL을 직접 인용한 줄이 없다. 전체 목록은 [17-sources.md](17-sources.md) D.1.

