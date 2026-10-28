# 부록 D. 출처 목록 — 외부 공식 문서 · 내부 정본

> **MovesEye APM 종합 안내서** 분책 17/18 · 원본 절 **부록 D** · 마지막 갱신 **2026-09-17**(2026-09-15 D.1에 OTel 스팬 링크·메시징·스레드 semconv 4행 · D.2에 P5 UX 정본·R-P5.6 실측·P5.6 검수 3행을 더한 뒤, 2026-09-17 **D.1에 P5 실시간 관제 외부 출처 11행**(Collector processor 3종·OTTL·feature gate·내부 원격 측정·BSP 환경변수·SSE·Fullscreen·ECharts·WCAG) · **D.2에 P5 아키텍처 정본·P5 계약·R-P5·R-P5b·설계 검수 왕복·구현 검수 6행** 추가).
>
> **이 문서를 읽으면 알게 되는 것**
> 1. 본문 "출처" 줄에 쓴 외부 공식 문서 URL 전부와 어느 절에 쓰였는지
> 2. 확신이 낮아 상위 페이지로 적은 것이 무엇인지
> 3. 내부 정본(설계·계약·실측·QA·검수·분석·해설·코드)의 경로와 이 안내서의 어느 절이 그것을 근거로 썼는지
>
> **전제 문서** — 이전 [16-faq.md](solutions--16-faq.md) · 다음 [18-p5-realtime.md](solutions--18-p5-realtime.md) · 목차 [00-index.md](solutions--00-index.md). 용어는 [14-glossary.md](solutions--14-glossary.md).
> **표기**: 🔴 = 어기면 데이터가 조용히 틀리는 규칙 · ⚠️ = 알고 있어야 하는 한계 · ✅ = 실측으로 확인된 것.

## 부록 D. 출처 목록

### D.1 외부 공식 문서 (본문 "출처" 줄에 쓴 것 전부 — BE `ApmDocRef.java` 카탈로그·검수·계약서에 인용돼 확인된 URL만)

| 주제 | URL | 어디에 쓰였나 |
|---|---|---|
| OpenTelemetry 개요 | https://opentelemetry.io/ | 1.4 |
| OTLP 프로토콜 규격(JSON 인코딩·재시도 코드 429/502/503/504) | https://opentelemetry.io/docs/specs/otlp/ · https://opentelemetry.io/docs/specs/otlp/#retryable-response-codes | 2.2 · 3.2 · [부록 B](solutions--15-overturned.md) #1 |
| OTLP exporter 규격 | https://opentelemetry.io/docs/specs/otel/protocol/exporter/ | 2.2(설계 검수 #1 근거) |
| 메트릭 OTLP exporter·temporality preference | https://opentelemetry.io/docs/specs/otel/metrics/sdk_exporters/otlp/ | 2.2 · 7.3 |
| SDK 환경변수(`OTEL_SERVICE_NAME`·`OTEL_EXPORTER_OTLP_*`·`OTEL_METRIC_EXPORT_INTERVAL`) | https://opentelemetry.io/docs/specs/otel/configuration/sdk-environment-variables/ | 2.2 · 7.3 · 7.11 |
| HTTP semconv 마이그레이션(`OTEL_SEMCONV_STABILITY_OPT_IN`) | https://opentelemetry.io/docs/specs/semconv/non-normative/http-migration/ | 2.2 · 7.3 · [부록 B](solutions--15-overturned.md) #8 |
| HTTP 메트릭 semconv(`http.server.request.duration`·`active_requests`) | https://github.com/open-telemetry/semantic-conventions/blob/main/docs/http/http-metrics.md | 2.2 · 6.1 |
| K8s semconv 속성(`k8s.container.restart_count`) | https://opentelemetry.io/docs/specs/semconv/registry/attributes/k8s/ | 2.7 · 6.7 |
| Collector 설정(파이프라인) | https://opentelemetry.io/docs/collector/configuration/ | 2.2 · 3.1 |
| Collector 설치 · 릴리스 | https://opentelemetry.io/docs/collector/installation/ · https://github.com/open-telemetry/opentelemetry-collector-releases/releases | 3.1 · 7.2 |
| OTLP receiver | https://github.com/open-telemetry/opentelemetry-collector/tree/main/receiver/otlpreceiver | 7.2 |
| `otlphttp` exporter(`encoding: json`) | https://github.com/open-telemetry/opentelemetry-collector/tree/main/exporter/otlphttpexporter | 2.2 · 3.1 |
| exporter 큐·재시도(`sending_queue`·`retry_on_failure`) | https://github.com/open-telemetry/opentelemetry-collector/blob/main/exporter/exporterhelper/README.md | 2.2 · 3.2 |
| `memory_limiter` | https://github.com/open-telemetry/opentelemetry-collector/tree/main/processor/memorylimiterprocessor | 7.2 |
| `tail_sampling` | https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/processor/tailsamplingprocessor | 3.1 · 5.2 · 6.3 |
| `loadbalancing` exporter | https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/exporter/loadbalancingexporter | 3.1 · [부록 C](solutions--16-faq.md) Q17 |
| `file_storage` 확장 | https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/extension/storage/filestorage | 3.1 · 7.2 |
| `health_check` 확장 | https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/extension/healthcheckextension | 7.2 |
| `transform` 프로세서(SQL 마스킹) | https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/processor/transformprocessor | 3.7 · 7.2 |
| `redaction` 프로세서(PII) | https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/processor/redactionprocessor | 3.7 · 7.2 |
| `k8sattributes` 프로세서 · 0.159.0 `config.go`(`Validate`) | https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/processor/k8sattributesprocessor · https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/v0.159.0/processor/k8sattributesprocessor/config.go | 2.7 · 6.7 |
| `kubeletstats` 리시버 | https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/receiver/kubeletstatsreceiver | 2.7 · 7.5 |
| `k8s_cluster` 리시버 · 0.159.0 `documentation.md`(리소스 속성 기본 비활성) | https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/receiver/k8sclusterreceiver · https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/v0.159.0/receiver/k8sclusterreceiver/documentation.md | 2.7 · 6.7 · [부록 B](solutions--15-overturned.md) #24 |
| Java 에이전트 · 설정(`methods.include`) · `@WithSpan` · 릴리스 | https://opentelemetry.io/docs/zero-code/java/agent/ · https://opentelemetry.io/docs/zero-code/java/agent/configuration/ · https://opentelemetry.io/es/docs/zero-code/java/agent/annotations/ · https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases | 2.1 · 2.2 · 3.1 · 7.3 |
| OTel 스팬 링크 개념 · Trace API `Link`(같은/다른 trace 모두 참조 가능한 일반 관계 — 대상 kind 없음) | https://opentelemetry.io/docs/concepts/signals/traces/#span-links · https://opentelemetry.io/docs/specs/otel/trace/api/#link | 4.5.1a · [부록 B](solutions--15-overturned.md) #27 |
| OTel semconv 메시징 스팬(`receive`=CLIENT·`process`=CONSUMER 구분, 부모·링크 병행) | https://opentelemetry.io/docs/specs/semconv/messaging/messaging-spans/ | 4.5.1a · 4.5.5 메시징 |
| OTel semconv 스레드 속성(`thread.id`·`thread.name` — 스팬을 **시작한** 스레드, 프로세스 식별자 아님) | https://opentelemetry.io/docs/specs/semconv/attributes-registry/thread/ | 4.5.1a "무엇을 보여주지 않는가" |
| OTel Java 자동계측 지원 라이브러리(Executor 컨텍스트 전파·메시징 — 전파 ≠ 링크 생성) | https://github.com/open-telemetry/opentelemetry-java-instrumentation/blob/main/docs/supported-libraries.md | 4.5.1a 출시 문구 · 8.2 R-P5.6 |
| .NET 자동계측 · 저장소 | https://opentelemetry.io/docs/zero-code/dotnet/ · https://github.com/open-telemetry/opentelemetry-dotnet-instrumentation | 2.2 · 7.3 |
| Node 자동계측 · 패키지 | https://opentelemetry.io/docs/zero-code/js/ · https://www.npmjs.com/package/@opentelemetry/auto-instrumentations-node | 2.2 · 7.3 |
| Python 자동계측 | https://opentelemetry.io/docs/zero-code/python/ | 2.2 · 7.3 |
| Go SDK · `otelhttp` · 자동계측 베타 | https://opentelemetry.io/docs/languages/go/ · https://pkg.go.dev/go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp · https://opentelemetry.io/blog/2025/go-auto-instrumentation-beta/ | 2.1 · 2.2 · 7.3 |
| OpenTelemetry 브라우저 SDK | https://opentelemetry.io/docs/languages/js/getting-started/browser/ | 2.6 · 7.4 |
| Web Vitals 정의·임계 · `web-vitals` 라이브러리 | https://web.dev/articles/vitals · https://github.com/GoogleChrome/web-vitals | 2.6 · 6.6 · 7.4 |
| Google SRE Workbook — Alerting on SLOs(멀티윈도우 번 레이트) | https://sre.google/workbook/alerting-on-slos/ | 2.5 · 6.5 · [부록 B](solutions--15-overturned.md) #19 |
| Zabbix 7.0 매뉴얼 PDF(`history.push`·트래퍼·트리거·API) | https://www.zabbix.com/documentation/7.0/downloads/Zabbix_Documentation_7.0.en.pdf | 2.3 · 7.7 |
| Zabbix `httptest` 객체 · 웹 모니터링 아이템 | https://www.zabbix.com/documentation/7.0/en/manual/api/reference/httptest/object · https://www.zabbix.com/documentation/7.0/en/manual/web_monitoring/items | 2.3 · 6.5 |
| Zabbix 소스 정본(`CHttpTest.php`·`defines.inc.php`) | https://raw.githubusercontent.com/zabbix/zabbix/release/7.0/ui/include/classes/api/services/CHttpTest.php · https://raw.githubusercontent.com/zabbix/zabbix/release/7.0/ui/include/defines.inc.php | 2.3 · [부록 B](solutions--15-overturned.md) #20 |
| PostgreSQL 문서(상위) · 자원 설정 · WAL 설정 | https://www.postgresql.org/docs/current/ · https://www.postgresql.org/docs/current/runtime-config-resource.html · https://www.postgresql.org/docs/current/runtime-config-wal.html | 2.4 · 3.6 · 7.8 |
| PowerShell `New-Service` · `icacls` · systemd 유닛 | https://learn.microsoft.com/powershell/module/microsoft.powershell.management/new-service · https://learn.microsoft.com/windows-server/administration/windows-commands/icacls · https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html | 7.2 |

**P5 실시간 관제에서 새로 인용한 것**(2026-09-17 추가 — 전부 [18-p5-realtime.md](solutions--18-p5-realtime.md) §10 본문에서 쓴 것)

| 주제 | URL | 어디에 쓰였나 |
|---|---|---|
| Collector `filterprocessor`(OTTL 조건·`error_mode`·`spans_filtered` 카운터) | https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/processor/filterprocessor | 10.3 · 10.9 · [부록 B](solutions--15-overturned.md) #31·#32 |
| Collector `transformprocessor`(OTTL 문장·`error_mode: ignore\|propagate`) | https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/processor/transformprocessor | 10.3 · [부록 B](solutions--15-overturned.md) #31 |
| Collector `redactionprocessor`(**속성 값만** 검사·`summary` 수준) | https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/processor/redactionprocessor | 10.3 · [부록 B](solutions--15-overturned.md) #30 |
| OTTL 문법·함수(`keep_keys`·`truncate_all`·`set`·`IsMatch`·`Len`) | https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/pkg/ottl | 10.3 · [부록 B](solutions--15-overturned.md) #29·#30 |
| Collector feature gate 일반(`ottl.set.allowNil`의 근거 구조) | https://github.com/open-telemetry/opentelemetry-collector/blob/main/featuregate/README.md | 10.9 · [부록 B](solutions--15-overturned.md) #32 |
| Collector 내부 원격 측정(자기 메트릭·로그) | https://opentelemetry.io/docs/collector/internal-telemetry/ | 10.9 |
| SDK BatchSpanProcessor 환경변수(`OTEL_BSP_SCHEDULE_DELAY`·`OTEL_BSP_MAX_QUEUE_SIZE`) | https://opentelemetry.io/docs/specs/otel/configuration/sdk-environment-variables/ | 10.5 · 10.9 · [3.7a절](solutions--03-constraints.md) |
| MDN — Server-Sent Events / `EventSource`(`Last-Event-ID` 자동 재접속·`retry:`) | https://developer.mozilla.org/docs/Web/API/Server-sent_events/Using_server-sent_events | 10.3 · 4.5.1b |
| MDN — Fullscreen API(`requestFullscreen`은 사용자 동작이 필요) | https://developer.mozilla.org/docs/Web/API/Fullscreen_API | 4.5.1b 관제실 모드 |
| Apache ECharts 옵션(`series.large`·`progressive`·`replaceMerge`·`brush`·`gauge`) | https://echarts.apache.org/en/option.html | 4.5.1b · 10.4 |
| WCAG 2.2(1.4.1 색만으로 전달 금지 · 1.4.11 비텍스트 대비 · 2.2.2 정지 제어) | https://www.w3.org/TR/WCAG22/ | 4.5.1b · 10.4 |

⚠️ 확신이 낮아 **상위 페이지로 적은 것**: PostgreSQL 파티셔닝·advisory lock·`ON CONFLICT`(개별 장 URL 대신 문서 루트) · OTLP JSON 인코딩(개별 절 대신 OTLP 규격 루트) · Zabbix `history.push`·트리거(개별 API 페이지 대신 매뉴얼 PDF). 경쟁 정의(WhaTap·AWS·Elastic)는 설계서 §13이 웹 페이지를 인용했으나 URL이 보존되지 않아 본문에 URL을 달지 않았다.

### D.2 내부 정본 (경로는 `C:\solutions\_workspace\` 기준, 코드는 각 레포 `src/main/java/com/dmove/moveseye/` 기준)

| 종류 | 문서 | 이 안내서에서 근거로 쓴 절 |
|---|---|---|
| 설계 | `features/apm/core/devdesign_apm.md` v3.3(§0 비교표·§1.4 원칙·§2 도메인·§3 Collector·§4 수신/저장/알람/승격·§7 모델·§8 API·§9 비범위·§11 Q·§13 시장·§14 6종·§15 RUM 보안) | 1·2·3·4·6·8.5·[부록 B](solutions--15-overturned.md) |
| 설계 | `features/apm/core/devdesign_apm-screens-wbs.md` v1.1(§1.2 IA·§1.3 Phase·§2 차트 18·§3 메뉴별·§4 WBS·§5 S1~S5) | 1.2·4.1·4.5·8.5 |
| 설계 | `features/apm/realtime/devdesign_apm-live.md`(§1 지연 산수·§3 링·§4 SSE 인증·§5 설정·§6 다중 인스턴스·§8 미검증) | 3.3·3.6·6.2·7.11·8.3 |
| 설계 | `features/apm/realtime/devdesign_apm-realtime-ux.md` **v1.2**(§0 3화면 지도·URL 키·권한 게이트 403 도달 조건 · §3 비동기 3층 정의·되지 않는 것·§3.1 첫 출시 5항목·§3.4 복귀·**§3.5 R-P5.6 계약 + E 실측 요약표·출시 문구** · §6.3 P5.6b F1~F5) — 아키텍처 정본 `features/apm/realtime/devdesign_apm-realtime.md` v4.1 위의 화면 설계 | 4.5.1a·8.2·[부록 B](solutions--15-overturned.md) #27·#28 |
| 설계 | `features/apm/realtime/devdesign_apm-realtime.md` **v4.5** — P5 아키텍처 정본(§0 3분리·비범위 · §1 제니퍼 대조 · §2.1 파이프라인 그림·fan-out · §2.2 yaml 정본·운영 감시 · §2.3 수신·§2.3.1 메타 캐시 · §2.4 arena·사전 · §2.5 SSE · §2.6 액티브 a/b/c · §2.7 다중 BE 승격 조건 · §2.8 런타임 해상도 · §3 payload·상한 · §4 화면 계약 · §5 산정 · §6.0 실측 판정 요약 · §7.1 구현 7단계 · §8 결정) | [18장](solutions--18-p5-realtime.md) 전체·4.5.1b·[3.7a절](solutions--03-constraints.md)·4.2·[부록 B](solutions--15-overturned.md) #30~#36 |
| 계약 | `features/apm/realtime/contract_apm-p5-live.md`(§1 EP·헤더·실패 본문 · §2 SSE 이벤트 7종 payload · §3 FE 타입 초안 · §4 병합 규칙 · §5 상한·거절 사유 · **§6 착수 전 확인 A~J** · §7 라우트·사이드바 실사) | 4.5.1b·[18장](solutions--18-p5-realtime.md) §10.4·§10.6·[8.5절](solutions--13-verification.md) #15·#16 |
| 실측 | `features/apm/realtime/r-p5_apm-live-pipeline.md`(§0 사전 고정 합격선·계약 이탈 3 · §3 R1 분기/PII/유실/지연/상한 · §4 설계 v2 원문 재측·gate OFF 대조 · §5 R2 A/B · §6 gate · §7 추정 대비 · §9 P0 7건 · §10 BSP · §11 큐 · §12 장애 5종 · §13 `propagate` 300% · §14 최악 배치 · §15 판정 · §16 미측 17) | [18장](solutions--18-p5-realtime.md) §10.7·8.2·8.3·[부록 B](solutions--15-overturned.md) #30·#31 |
| 실측 | `features/apm/realtime/r-p5-6_apm-async-links.md`(§0 합격선·§1 환경·§2 fixture 행렬·§3 M0~M6 링크 보존·§4 D-3/D-4/문구·§5 D-5 두 빌드·§6 ⓐ 14구성·§7 권고 6·§8 미측정 7·§11 판정) · `features/apm/realtime/r-p5b_apm-live-yaml-correctness.md`(§0 합격선 11·§3 gate OFF WARN 원문·§5 PII 13/13·§6 `\uXXXX` 팽창 부정·압축본 상한·§7 `ignore` 실패 fixture·§8 조건 단위 fail-open·§13 R2′ 이월) | 4.5.1a·4.5.1b·8.2·8.3·[18장](solutions--18-p5-realtime.md)·[부록 B](solutions--15-overturned.md) #27~#32 |
| 검수 | P5 설계 왕복 `reviews/review_apm-realtime-design_{codex-r1,claude-r1,codex-r2,claude-r2,codex-r3,claude-r3,claude-r3b}.md`(아키텍처 3회전) · `review_apm-realtime-ux_{codex-r1,claude-r1}.md`(화면 1회전) | [18장](solutions--18-p5-realtime.md) §10.2·§10.4·8.1 |
| 검수 | P5 구현 `reviews/review_apm-p51-s1-be_{codex-impl,claude,codex-fix}.md` · `review_apm-p51-s23-be_{codex-impl,claude}.md` · `review_apm-p51-s4-be_{codex-impl,claude}.md` · `review_apm-p51-s5-be_{codex-impl,claude}.md` · `review_apm-p51-s6-be_{codex-impl,claude,codex-fix}.md` · `review_apm-p51-s7be_{codex-impl,claude,codex-fix}.md` · `review_apm-p52-fe_claude.md`·`review_apm-p52_codex.md`·`review_apm-p53_codex.md` — ⚠️ 2·3/4/5단계는 `codex-fix` 문서가 없고 `review_apm-p52-fe_codex-impl.md`는 0바이트([8.5절](solutions--13-verification.md) #17) | [18장](solutions--18-p5-realtime.md) §10.6·§10.7·8.1·[부록 B](solutions--15-overturned.md) #33~#36 |
| 검수 | `_archive/features/apm/realtime/review_apm-p56-fe_codex-impl.md`(구현 보고)·`review_apm-p56-fe_claude.md`(🔴2·🟡13, 변이 3/3)·`review_apm-p56-fe_codex-fix.md`(반영 🔴2·🟡12) — FE worktree `moveseyee_fe-p56` `p56-async` `c698463` | 4.5.1a·8.1 |
| 계약 | `features/apm/core/contract_apm.md`(§1 V38·§2 수신/토큰/등록·§3 적재·§5 배치·§6 알람·§7 트레이스) | 3.2·3.5·4.3·5.1·5.2·6.1·6.3·7.9 |
| 계약 | `features/apm/core/contract_apm-read-api.md`(§공통·§1~§4 조회·§5 상태 판정·§8 수집기/§8.3 yaml/§8.6 프로퍼티/§8.8 출처·§9 Live·§10 트레이스/§10.5 권한·§11 배포) | 3.4·4.5·5.1·6.1~6.4·7.1 |
| 계약 | `features/apm/core/contract_apm-p3.md`(§1 SLO·§2 위젯·§3 합성·§4 메시징·§5 배치·§7.1 설계와 다른 점·§8 리포트) | 2.5·4.5·6.5 |
| 계약 | `features/apm/core/contract_apm-p3-ai.md`(§0 다섯 가지·§1 툴 11·§4 screens.json·§5 명령·§6 브리핑) | 1.1·1.3·4.5·6.5 |
| 계약 | `features/apm/core/contract_apm-p4.md`(§1 보안·§2 수신·§3 스키마/세션·§4 DTO·§5 스니펫·§6 K8s·§7 불안·§🔄 F1~F4) | 2.6·2.7·3.5·3.7·5.2·6.6·6.7·7.4·7.5·8.3 |
| 실측 | `features/apm/core/r1_apm-collector-roundtrip.md`(§2 JSON·§2.4 R12·§3 R11·§3.5 R14) | 2.2·3.1·3.2·[부록 B](solutions--15-overturned.md) |
| 실측 | `features/apm/core/r10_apm-zabbix-history-push.md`(§1 시나리오·§2 계약 8) | 2.3·7.7 |
| 실측 | `features/apm/core/r3_apm-volume.md`(§0·§3·§4·§5·§6·§9) | 2.4·3.6·[부록 B](solutions--15-overturned.md) |
| QA | `features/apm/core/e2e_apm-selfmonitoring.md`·`e2e_apm-p1-qa.md`(D1~D8)·`e2e_apm-live-qa.md`·`e2e_apm-p2-qa.md`(D1~D18)·`e2e_apm-permission-option.md`·`e2e_apm-p3-qa.md`(D1~D13·M-1~M-6·A1~A10·§6·§7.10)·`e2e_apm-p4-qa.md`(D1~D6·§3 미검증) | [6장](solutions--00-index.md) 함정 칸·8.2·8.3 |
| 검수 | `features/apm/core/review_apm-design.md`(#1~#9·A/B 항목)·`review_apm-p1*`(3회)·`review_apm-p1_5-live*`·`review_apm-p2-w{1,2,3}*`·`review_apm-p2-fe1_codex`·`review_apm-p2-qafix_codex`·`review_apm-p3-w{1,2,3}*`·`review_apm-p4-be_claude`(R1~R25·변이 A/B)·`review_apm-p4-fe_claude`·`review_apm-p4-fe_codex-memo` | [6장](solutions--00-index.md) "왜"·"함정" 칸·8.1 |
| 분석 | `features/apm/core/apm-p1-logic-analysis.md`(§11 결정 27·§12 A1~A29) | 3.2·6.1·8.1 |
| 해설 | `guides/apm-code-walkthrough.md`(§A 연표·§7 헷갈리는 것·§9~§28·§C 규칙 14·§D 지도)·`guides/apm-screen-chart-guide.md`(§1 공통·§2 화면별·§3 FAQ)·`guides/apm-opentelemetry-primer.md`(§10 한계·§11 뒤집힌 것·§12 용어) | 0·4.5·[부록 A](solutions--14-glossary.md)·B·C |
| 경험 | `C:\Users\DMOVE\claude-experiences\projects\moveseye\2026-08-31-apm-p1-implementation.md`·`2026-09-02-apm-p2-traces.md` | 3.8·8.1·[부록 B](solutions--15-overturned.md) |
| 규약 | `moveseye-be-spring/CLAUDE.md` §0.5-6/7 · `COLLAB.md` §8 · `moveseyee_fe/src/pages/application-monitoring/README.md` | 3.8 |
| 코드(BE) | `premium/apm/collector/ingest/{ApmOtlpController,MetricIngestor,normalize/ApmMetricAllowlist,normalize/ApmDimsNormalizer,store/ApmMetric1mStore,store/CumulativeDeltaTracker}` · `otel/histogram/{CanonicalBounds,HistogramRebucketer}` · `core/batch/{partition/ApmPartitionService,rollup/ApmRollupService,retention/ApmRetentionService}` · `core/metric/{ApmMetricStore,ApmPercentiles,ApmHistogramMerger}` · `core/security/ApmAccessChecker` · `service/{registry/ApmRegistrar,status/ApmStatusJudge,status/ApmAvailabilityService,deploy/ApmDeploymentDetector,instance/ApmKubernetes*}` · `overview/live/{LiveBuffer,ApmLiveProperties,ApmLiveStreamController}` · `alert/{bridge/ZabbixAlertBridge,evaluate/,sync/}` · `trace/{ingest/ApmTraceWriter,ingest/ApmSqlPolicy,ingest/ApmSpanAttrAllowlist,rollup/ApmTraceRollupService,query/ApmSpanTree}` · `slo/ApmSloCalculator` · `synthetic/ApmSyntheticZabbixMapper` · `job/ApmJobConventions` · `report/ManagedReportSource` · `rum/{security/,ingest/RumParser,ingest/RumSanitizer,ingest/RumStore,page/RumQueryService}` · `collector/install/{ApmInstallGuideService,ApmDocRef,ApmInstallVersions}` · `resources/apm/collector-template.yaml`·`rum-snippet.js` · `db/migration/V38~V57` | 4.3·5·6·7 |
| 코드(FE) | `moveseyee_fe/src/constants/{apm.ts,routes.ts,homeWidgets.ts}` · `layouts/app/{SideNav,SettingsMenu}.tsx` · `hooks/{useApmPermissions,useApmLive,useApmTimeRange}.ts` · `pages/application-monitoring/**` · `locales/kr.json`(`page_guide.apm_*`·`apm.*`) | 3.4·4.1·4.5 |
| 코드(AI) | `moveseye-ai/…/tool/apm/{AbstractApmTool,ApmTimeWindow,Apm*Tool}` · `docs/screens.json`·`commands.json` | 1.3·4.5·6.5 |

---

## 더 보기 — 내부 정본(이 문서에서 근거로 인용한 것)

경로는 `C:\solutions\_workspace\` 기준, 코드는 각 레포 `src/main/java/com/dmove/moveseye/` 기준. 절별 정확한 위치(§·#·클래스)는 본문 각 절 끝의 **더 보기** 줄에 있고, 아래는 그것을 문서 단위로 모은 것이다.

- 이 문서 본문에는 절별 **더 보기** 줄이 없다(부록·목차 성격). 근거 문서 전체는 [17-sources.md](solutions--17-sources.md) D.2.
- 관련 분책: 이전 [16-faq.md](solutions--16-faq.md) · 다음 [18-p5-realtime.md](solutions--18-p5-realtime.md) · 목차 [00-index.md](solutions--00-index.md) · 용어 [14-glossary.md](solutions--14-glossary.md)

## 출처 — 외부 공식 문서(이 문서에 쓰인 것만)

| 주제 | URL |
|---|---|
| OpenTelemetry 개요 | https://opentelemetry.io/ |
| OTLP 프로토콜 규격(JSON 인코딩·재시도 코드 429/502/503/504) | https://opentelemetry.io/docs/specs/otlp/ · https://opentelemetry.io/docs/specs/otlp/#retryable-response-codes |
| OTLP exporter 규격 | https://opentelemetry.io/docs/specs/otel/protocol/exporter/ |
| 메트릭 OTLP exporter·temporality preference | https://opentelemetry.io/docs/specs/otel/metrics/sdk_exporters/otlp/ |
| SDK 환경변수(`OTEL_SERVICE_NAME`·`OTEL_EXPORTER_OTLP_*`·`OTEL_METRIC_EXPORT_INTERVAL`) | https://opentelemetry.io/docs/specs/otel/configuration/sdk-environment-variables/ |
| HTTP semconv 마이그레이션(`OTEL_SEMCONV_STABILITY_OPT_IN`) | https://opentelemetry.io/docs/specs/semconv/non-normative/http-migration/ |
| HTTP 메트릭 semconv(`http.server.request.duration`·`active_requests`) | https://github.com/open-telemetry/semantic-conventions/blob/main/docs/http/http-metrics.md |
| K8s semconv 속성(`k8s.container.restart_count`) | https://opentelemetry.io/docs/specs/semconv/registry/attributes/k8s/ |
| Collector 설정(파이프라인) | https://opentelemetry.io/docs/collector/configuration/ |
| Collector 설치 · 릴리스 | https://opentelemetry.io/docs/collector/installation/ · https://github.com/open-telemetry/opentelemetry-collector-releases/releases |
| OTLP receiver | https://github.com/open-telemetry/opentelemetry-collector/tree/main/receiver/otlpreceiver |
| `otlphttp` exporter(`encoding: json`) | https://github.com/open-telemetry/opentelemetry-collector/tree/main/exporter/otlphttpexporter |
| exporter 큐·재시도(`sending_queue`·`retry_on_failure`) | https://github.com/open-telemetry/opentelemetry-collector/blob/main/exporter/exporterhelper/README.md |
| `memory_limiter` | https://github.com/open-telemetry/opentelemetry-collector/tree/main/processor/memorylimiterprocessor |
| `tail_sampling` | https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/processor/tailsamplingprocessor |
| `loadbalancing` exporter | https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/exporter/loadbalancingexporter |
| `file_storage` 확장 | https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/extension/storage/filestorage |
| `health_check` 확장 | https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/extension/healthcheckextension |
| `transform` 프로세서(SQL 마스킹) | https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/processor/transformprocessor |
| `redaction` 프로세서(PII) | https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/processor/redactionprocessor |
| `k8sattributes` 프로세서 · 0.159.0 `config.go`(`Validate`) | https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/processor/k8sattributesprocessor · https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/v0.159.0/processor/k8sattributesprocessor/config.go |
| `kubeletstats` 리시버 | https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/receiver/kubeletstatsreceiver |
| `k8s_cluster` 리시버 · 0.159.0 `documentation.md`(리소스 속성 기본 비활성) | https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/receiver/k8sclusterreceiver · https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/v0.159.0/receiver/k8sclusterreceiver/documentation.md |
| Java 에이전트 · 설정(`methods.include`) · `@WithSpan` · 릴리스 | https://opentelemetry.io/docs/zero-code/java/agent/ · https://opentelemetry.io/docs/zero-code/java/agent/configuration/ · https://opentelemetry.io/es/docs/zero-code/java/agent/annotations/ · https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases |
| OTel 스팬 링크 개념 · Trace API `Link` | https://opentelemetry.io/docs/concepts/signals/traces/#span-links · https://opentelemetry.io/docs/specs/otel/trace/api/#link |
| OTel semconv 메시징 스팬 | https://opentelemetry.io/docs/specs/semconv/messaging/messaging-spans/ |
| OTel semconv 스레드 속성 | https://opentelemetry.io/docs/specs/semconv/attributes-registry/thread/ |
| OTel Java 자동계측 지원 라이브러리 | https://github.com/open-telemetry/opentelemetry-java-instrumentation/blob/main/docs/supported-libraries.md |
| .NET 자동계측 · 저장소 | https://opentelemetry.io/docs/zero-code/dotnet/ · https://github.com/open-telemetry/opentelemetry-dotnet-instrumentation |
| Node 자동계측 · 패키지 | https://opentelemetry.io/docs/zero-code/js/ · https://www.npmjs.com/package/@opentelemetry/auto-instrumentations-node |
| Python 자동계측 | https://opentelemetry.io/docs/zero-code/python/ |
| Go SDK · `otelhttp` · 자동계측 베타 | https://opentelemetry.io/docs/languages/go/ · https://pkg.go.dev/go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp · https://opentelemetry.io/blog/2025/go-auto-instrumentation-beta/ |
| OpenTelemetry 브라우저 SDK | https://opentelemetry.io/docs/languages/js/getting-started/browser/ |
| Web Vitals 정의·임계 · `web-vitals` 라이브러리 | https://web.dev/articles/vitals · https://github.com/GoogleChrome/web-vitals |
| Google SRE Workbook — Alerting on SLOs(멀티윈도우 번 레이트) | https://sre.google/workbook/alerting-on-slos/ |
| Zabbix 7.0 매뉴얼 PDF(`history.push`·트래퍼·트리거·API) | https://www.zabbix.com/documentation/7.0/downloads/Zabbix_Documentation_7.0.en.pdf |
| Zabbix `httptest` 객체 · 웹 모니터링 아이템 | https://www.zabbix.com/documentation/7.0/en/manual/api/reference/httptest/object · https://www.zabbix.com/documentation/7.0/en/manual/web_monitoring/items |
| Zabbix 소스 정본(`CHttpTest.php`·`defines.inc.php`) | https://raw.githubusercontent.com/zabbix/zabbix/release/7.0/ui/include/classes/api/services/CHttpTest.php · https://raw.githubusercontent.com/zabbix/zabbix/release/7.0/ui/include/defines.inc.php |
| PostgreSQL 문서(상위) · 자원 설정 · WAL 설정 | https://www.postgresql.org/docs/current/ · https://www.postgresql.org/docs/current/runtime-config-resource.html · https://www.postgresql.org/docs/current/runtime-config-wal.html |
| PowerShell `New-Service` · `icacls` · systemd 유닛 | https://learn.microsoft.com/powershell/module/microsoft.powershell.management/new-service · https://learn.microsoft.com/windows-server/administration/windows-commands/icacls · https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html |

전체 목록과 "확신이 낮아 상위 페이지로 적은 것"은 [17-sources.md](solutions--17-sources.md) D.1.

