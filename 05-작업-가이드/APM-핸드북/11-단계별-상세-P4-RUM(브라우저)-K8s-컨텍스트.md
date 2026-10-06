# §6 단계별 상세 — P4 RUM(브라우저) · K8s 컨텍스트

> **MovesEye APM 종합 안내서** 분책 11/18 · 원본 절 **§6.6 · 6.7** · 마지막 갱신 **2026-09-14**(원본 `apm-handbook.md` 2026-09-14 작성분을 내용 수정 없이 옮김, 분책 2026-09-14).
>
> **이 문서를 읽으면 알게 되는 것**
> 1. P4 RUM — 공개 토큰·origin allowlist·상한 3종·5분 집계·Vitals 격자·세션 정의와 왜 preflight는 사유 무관 403인가
> 2. P4 K8s — `kubeletstats`·`k8s_cluster`·`k8sattributes` 옵션, 재시작/OOM 판정이 왜 에지인가
> 3. "3,051 green이 사실을 감췄다" — 지어낸 속성명을 테스트가 스스로 먹여 통과한 교훈과 실 클러스터/실 SDK 미검증
>
> **전제 문서** — 이전 [10-p3-operations.md](10-%EB%8B%A8%EA%B3%84%EB%B3%84-%EC%83%81%EC%84%B8-P3-SLO-%ED%95%A9%EC%84%B1-%EA%B0%90%EC%8B%9C-%EB%A9%94%EC%8B%9C%EC%A7%95-%EB%B0%B0%EC%B9%98-%EB%A6%AC%ED%8F%AC%ED%8A%B8-AI-%EC%84%A4%EC%B9%98-%EC%B6%9C%EC%B2%98.md) · 다음 [12-operations.md](12-%EC%9A%B4%EC%98%81-%EB%B0%B0%ED%8F%AC-%EC%A1%B0%EA%B1%B4-%EA%B3%A0%EA%B0%9D%EC%9D%B4-%EC%8B%A4%EC%A0%9C%EB%A1%9C-%ED%95%B4%EC%95%BC-%ED%95%98%EB%8A%94-%EA%B2%83.md) · 목차 [00-index.md](00-MovesEye-APM-%EC%A2%85%ED%95%A9-%EC%95%88%EB%82%B4%EC%84%9C-%EB%AA%A9%EC%B0%A8-%EC%9D%BD%EB%8A%94-%EC%88%9C%EC%84%9C-%EC%9A%A9%EC%96%B4-%EC%9A%94%EC%95%BD%ED%8C%90-%EC%A0%84%EC%B2%B4-%EC%A7%80%EB%8F%84.md). 용어는 [14-glossary.md](14-%EB%B6%80%EB%A1%9D-A.-%EC%9A%A9%EC%96%B4-%EC%82%AC%EC%A0%84%28%EC%A0%84%EC%B2%B4%29.md), 출처 전체는 [17-sources.md](17-%EB%B6%80%EB%A1%9D-D.-%EC%B6%9C%EC%B2%98-%EB%AA%A9%EB%A1%9D-%EC%99%B8%EB%B6%80-%EA%B3%B5%EC%8B%9D-%EB%AC%B8%EC%84%9C-%EB%82%B4%EB%B6%80-%EC%A0%95%EB%B3%B8.md).
> **표기**: 🔴 = 어기면 데이터가 조용히 틀리는 규칙 · ⚠️ = 알고 있어야 하는 한계 · ✅ = 실측으로 확인된 것.

### 6.6 P4 — RUM(브라우저)

| | |
|---|---|
| **무엇을** | 공개 RUM 토큰(kind=RUM·origin allowlist ≤32·상한 3종)·수신 2 EP(+OPTIONS)·5분 집계·조회 5 EP·토큰/origin/스니펫 6 EP·수집기 "브라우저(RUM)" 탭·RUM 목록/상세 화면·트레이스 상세 Browser 행 |
| **어떻게** | [3.7절](03-%EA%B5%AC%ED%98%84-%EC%A1%B0%EA%B1%B4-%EC%A0%84%EC%A0%9C-%EC%9A%B0%EB%A6%AC%EA%B0%80-%EC%A7%80%ED%82%A4%EA%B8%B0%EB%A1%9C-%ED%95%9C-%EA%B2%83.md) 보안 표 + [5.2절](06-%EC%96%B4%EB%96%BB%EA%B2%8C-%EB%8D%B0%EC%9D%B4%ED%84%B0%EA%B0%80-%EC%A7%80%EB%82%98%EA%B0%80%EB%8A%94-%EA%B8%B8.md) 길. 페이지 그룹 키 = `sha256(tokenId + 정규화 path)`, Vitals 격자 `rum_ms`(초 격자×1000 + 임계 = 21경계)·`rum_score`(11경계), good/needs/poor는 비율이 아니라 **관측 수 추정치**(재버킷이면 소수), `+∞` 버킷의 p75는 `exceedsTopBound`(FE `≥`), 세션 `sessionMode:"DISTINCT_PER_PAGE_DIMENSION_5M_SUM"`, timing은 이름별 **평균**(`AGGREGATE_AVERAGE`), 조회 CAP 50,000은 **최신 우선** |
| **왜 preflight는 사유 무관 403인가** | OPTIONS는 Authorization을 싣지 않아 `tokenId`가 쿼리에 있다. "토큰 없음 401 / origin 불일치 403"이 갈리면 `OPTIONS ?tokenId=1..N`을 임의 Origin으로 훑어 **살아 있는 토큰 id가 열거**된다(원문은 못 알아내도 "7번은 살아 있고 origin은 이것이 아니다"까지 알려 준다). 같은 레포 `ApmOtlpController`가 P1부터 못 박은 원칙. 변이 실험에서 401→403을 바꿔도 깨지는 테스트가 **0** = 비용 0이고 아무도 지키지 않고 있었다는 뜻 |
| **조건·전제** | 스니펫은 CDN 스크립트가 아니라 **번들러용 ES module**(OTel JS 2.x 필수·1.x 혼용 금지·lockfile 고정), `consentGranted` 기본 false(동의 훅), CSP `connect-src`에 MovesEye origin, 백엔드 CORS에 `traceparent`/`tracestate` 허용, 세션 id는 탭 메모리만. 단일 BE 노드 인메모리 상한(재시작 초기화, 다중 노드면 Redis) |
| **함정·교훈** | 검수가 잡은 것: `JwtAuthFilter`의 RUM 스킵 한 줄에 테스트 0(변이 B1) · 절단이 최신을 버리던 `order by bucket asc limit`(R6) · 트레이스 상세 RUM 조인에 시간 조건 없음(R7 — RUM 0건 설치본도 매 요청 파티션 전부 스캔) · Firefox 프레임 `contains("@")` 규칙이 `Error: invalid mail a@b.com`을 저장(R9 → 형태 판정) · `family` 단독 조회 `queryForObject`(R10 — 격자 한 줄 더 넣으면 모든 수신 503) · traceparent 충돌이 배치 전체 400(R14 → 그 스팬만 partialSuccess) · QA D1: `keepRawSql` 생략 시 7인자 편의 생성자가 `kubernetes=false` 하드코딩(200+정상 yaml이라 실패 신호 없음; 테스트가 생성기를 직접 불러 못 잡음 → **서비스 경유 회귀 필수**) · 미해결 F1~F4(페이지별 TTFB·p75 시계열·상한 플래그·표본) |

**더 보기**: 토큰·origin·상한·PII = `contract_apm-p4.md` §1 · 수신 상태·CORS·preflight 403 통일 = §2(`reviews/review_apm-p4-be_claude.md` R4·변이 B2) · 5분 UPSERT·세션·Browser 행 = §3(R8) · DTO·임계·CAP = §4(R6) · 스니펫 = §5(R16·R25) · F1~F4 = §🔄 · 검수 R1~R25·변이 B1~B5 = `reviews/review_apm-p4-be_claude.md` §1·§6 · FE H1 = `reviews/review_apm-p4-fe_claude.md` · QA D1~D6·실 브라우저 = `verification/e2e_apm-p4-qa.md` §0·§1·§2 · 코드 `rum/security/RumSecurityConfiguration`·`rum/token/RumTokenService`·`rum/ingest/{RumParser,RumSanitizer,RumStore}`·`rum/page/RumQueryService`·`auth/security/JwtAuthFilter:82`.
**출처**: Web Vitals https://web.dev/articles/vitals · `web-vitals` https://github.com/GoogleChrome/web-vitals · OTel 브라우저 SDK https://opentelemetry.io/docs/languages/js/getting-started/browser/ .

### 6.7 P4 — K8s 컨텍스트

| | |
|---|---|
| **무엇을** | 설정 생성 `kubernetes: true` → `kubeletstats`·`k8s_cluster`·`k8sattributes` + `metrics/k8s` 파이프라인 + NOTICE 4줄 · `apm_instance` 9필드(`k8sPod/Node/Namespace/Deployment`·`containerRestartCount`·`restarted`·`oomKilled`·`restartedAt`·`oomKilledAt`) · 인스턴스 탭 열·배지 |
| **어떻게** | `ApmKubernetesMetricObserver`가 `k8s.container.restarts` Gauge(Int) 포인트만 보고 이유는 리소스 속성에서 읽는다 · `service.name` 없는 지표라 `namespace+pod`가 맞는 **기존 인스턴스에만** 붙임 · 판정은 SQL CTE 한 곳(`ApmKubernetesStateWriter.UPDATE`): `n > 이전`이면 `restarted_at`(**에지**), 최초값·reset은 기준만, OOM은 `reason=OOMKilled ∧ (증가 ∨ pending)`일 때 **한 번**, 이유가 늦으면 5분 pending, `k8s_seen_at <= at` 가드 · 배지 = 조회 창 `[from,to)` ∧ `to−5분 < observed`(정확히 5분이면 false), 시각은 이력으로 남는다 |
| **왜 에지인가** | `last_terminated_reason`은 컨테이너가 사는 내내 같은 값으로 반복 보고된다 — 레벨로 찍으면 "한 번 OOM된 파드는 배지 영구 점등, 시각은 언제나 방금". 배지와 시각을 하나로 만들면 배지가 "언제"를 못 말하거나 이력을 잃는다 |
| **조건·전제** | [2.7절](02-%EB%B0%B0%EA%B2%BD%EC%A7%80%EC%8B%9D-%EC%9D%B4-%EC%A0%9C%ED%92%88%EC%9D%B4-%EC%84%9C-%EC%9E%88%EB%8A%94-%EB%95%85.md) RBAC·TLS·DaemonSet 분리. 시각은 **텔레메트리 관측 시각**(수집 30초+전송 지연만큼 늦다). 다중 클러스터/컨테이너 식별은 `namespace+pod` 수준(후속) |
| **함정·교훈** | "3,051 green이 사실을 감췄다": 지어낸 속성명(`container.restart_count`, OOM을 메트릭으로)을 테스트가 스스로 먹여 통과 → 외부 계약(contrib·semconv·Zabbix)은 **공식 문서 대조가 검수 첫 항목**, 검출력은 변이로 잰다 · `observe()`가 영수증 앞에 무방비로 놓여 예외 하나가 503→재전송→이중 적재(R1 → try/catch 격리, `K8S_ENRICHMENT_FAILED`는 배치 수) · JPA판·JDBC판 두 벌이 서로 덮어쓰던 것(R18 → writer 하나, JPA K8s 컬럼 `updatable=false`) · 픽스처는 contrib 출력 계약 **재현본**이지 캡처가 아니다 — 실 클러스터 미검증 |

**더 보기**: 옵션·NOTICE·R2 위치 정정·배지 규칙 = `contract_apm-p4.md` §6 · 검수 R1(영수증 앞)·R2(OOM 속성)·R3(레벨→에지)·R5(이름)·R18(writer 통합)·변이 B3 = `reviews/review_apm-p4-be_claude.md` §1·§6 · `kubernetes` 유실 D1 = `verification/e2e_apm-p4-qa.md` §1 · 역할 교대·"3,051 green" = `guides/apm-code-walkthrough.md` §24 · 코드 `service/instance/{ApmKubernetesMetricObserver,ApmKubernetesStateWriter}`·`collector/config/ApmCollectorConfigGenerator#kubernetes`·`db/migration/V57`.
**출처**: `k8s_cluster` 0.159.0 `documentation.md` https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/v0.159.0/receiver/k8sclusterreceiver/documentation.md · `k8sattributes` 0.159.0 `config.go` https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/v0.159.0/processor/k8sattributesprocessor/config.go · `kubeletstats` https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/receiver/kubeletstatsreceiver · K8s semconv https://opentelemetry.io/docs/specs/semconv/registry/attributes/k8s/ .

---

## 보강 — 이 단계와 관련된 §4·§5·§8 조각(사본)

> 🔁 **보강(사본)** — 아래는 §4.2(단계 표)·§4.3(데이터 모델)·§5(데이터의 길)·§8.2(QA 수치)에서 이 단계에 해당하는 조각을 **그대로 복사**한 것이다(각 파일이 혼자 읽히게). 정본은 [04-overview.md](04-%EB%AC%B4%EC%97%87%EC%9D%84-%EB%A7%8C%EB%93%A4%EC%97%88%EB%82%98-%EB%A9%94%EB%89%B4-14-%EB%8B%A8%EA%B3%84-P1-P5-%EB%8D%B0%EC%9D%B4%ED%84%B0-%EB%AA%A8%EB%8D%B8.md) §4.2·§4.3 · [06-data-path.md](06-%EC%96%B4%EB%96%BB%EA%B2%8C-%EB%8D%B0%EC%9D%B4%ED%84%B0%EA%B0%80-%EC%A7%80%EB%82%98%EA%B0%80%EB%8A%94-%EA%B8%B8.md) §5 · [13-verification.md](13-%EA%B2%80%EC%A6%9D-%ED%98%84%ED%99%A9%EA%B3%BC-%EB%82%A8%EC%9D%80-%EA%B2%83-%EB%B0%A9%EB%B2%95%EB%A1%A0-QA-%EC%88%98%EC%B9%98-%EB%AF%B8%EA%B2%80%EC%A6%9D-%EC%97%B4%EB%A6%B0-%EA%B2%B0%EC%A0%95-%EC%A0%95%EB%B3%B8-%EB%B6%88%EC%9D%BC%EC%B9%98-14.md) §8.2이며, 어긋나면 정본이 맞다.

**보강 A — §4.2 단계 표에서 P4 행 (정본 04-overview.md §4.2)**

| 단계 | 날짜(커밋) | 무엇 | 핵심 수치 | 검증 |
|---|---|---|---|---|
| **P4 RUM·K8s** | 09-08~14 (BE `8ec9e1c`→master `6af7c46`→`p4-qafix`, FE worktree) | RUM 보안 계층·수신·5분 UPSERT·조회 5 EP·토큰/origin/스니펫 6 EP · K8s 옵션·관측기·인스턴스 9필드 · V57 | 상한 3종·Vitals 격자 2 | **코덱스 구현·Claude 검수**(🔴4 🟡16 🟢5 + 변이 A4·B5) · P4 QA PASS 92/FAIL 1(D1 HIGH) |

**보강 B — §4.3 데이터 모델에서 V57 (정본 04-overview.md §4.3)**

| 마이그레이션 | 표 | 무엇을 담나 |
|---|---|---|
| **V57** `apm_rum_kubernetes` | `apm_receive_token` 4열 · RUM 표 7종 · `apm_hist_bounds` 2행 · `apm_instance` K8s 9필드 | origin allowlist·상한 / 페이지·세션·영수증·timing·오류 5분 + 스팬 7일 + 오류 그룹 / `rum_ms`·`rum_score` / pod·node·namespace·deployment·restart_count·restarted_at·oom_at·pending·seen_at |

**보강 C — §5.2 RUM의 길 그림(RUM 부분) (정본 06-data-path.md §5.2)**

```
 [고객의 고객 브라우저] 스니펫(OTel Web SDK 2.x + web-vitals)
     ──OPTIONS ?tokenId=7──▶ RumSecurityConfiguration 필터가 직접 preflight()  : Origin 정확 매칭·전역 100rps 큐·라이선스 → 204 / 전부 같은 403
     ──POST Bearer──────────▶ Content-Type/Encoding 검사(getParameter 전) → Content-Length>상한이면 안 읽고 413 → Bearer sha256 → tokenId 일치 → 토큰별 1초 창(429)
                              → RumParser(배치 4096·documentLoad=PV·web_vitals gauge=관측 1·CUMULATIVE 폐기) → 일 예산 차감 → RumSanitizer(path {id}·해시·국가 힌트·스택 형태 필터)
                              → RumStore 한 트랜잭션: 영수증 0행이면 skip · 세션 distinct · apm_rum_page_5m UPSERT(원소별 합) · timing·오류·스팬
                              → 200 {} 또는 partialSuccess.rejected*:"n"(문자열)
                              조회: 5분 표 직접(롤업 없음), CAP 50,000 최신 우선, p75·good/needs/poor(경계=임계) · 트레이스 상세에만 Browser 행 합류
```

**보강 D — §5.2 관문별 "왜 이 자리인가"(RUM 행) (정본 06-data-path.md §5.2)**

| 관문 | 왜 여기인가 | 순서를 바꾸면 |
|---|---|---|
| RUM preflight를 **필터가 직접** 처리 | Spring MVC 기본 CORS가 200을 먼저 주면 우리의 403·429가 사라진다 | 열거 방지·상한 무력화 |
| RUM Content-Type 검사가 `getParameter` **앞** | form-urlencoded로 오면 Tomcat이 토큰 상한과 무관하게 2MB까지 버퍼링 | 미인증 메모리 소모 |
| RUM 일 예산 차감이 저장 **앞** | 파싱 수신량 기준 — 재전송·중복도 차감(계약이 인정) | (뒤로 옮기면) 503 폭주가 예산을 안 먹는다 |
| RUM 영수증이 적재와 **같은 트랜잭션** | "저장됐는데 영수증이 없다"가 없다 → 재전송 판정이 정확 | 메트릭 경로처럼 앞/뒤 순서 함정 |
| RUM이 1m→롤업이 아니라 **5분 표 직접** | 질문이 "이 페이지 그룹의 p75"뿐, 인스턴스 축 없음, 보존 30일 | 원본 표·워터마크·롤업이 전부 필요 |

**보강 E — §8.2 QA 수치에서 P4 행 · §8.3 미검증에서 실 SDK·실 K8s 행 (정본 13-verification.md)**

| 단계 | 결과 | 남은 것 |
|---|---|---|
| P4 QA(09-14) | PASS 92/FAIL 1(D1 HIGH) + 관찰 5, 실 브라우저 CORS/CSP/4단 워터폴 실측 | 아래 7.3 |

| 항목 | 지금 아는 것 | 열리는 조건 |
|---|---|---|
| **실 SDK 번들**(OTel JS 2.x 정확 조합, 동의 철회) | 스니펫은 Node ES module 구문·6건 단위 테스트만. QA는 CDN `web-vitals@4` + 수동 fetch로 대체 | 첫 RUM 고객 사이트 |
| **실 K8s**(RBAC·kubelet TLS·DaemonSet 분리·다중 클러스터) | 픽스처는 contrib 출력 계약 재현본, `validate` 미실행 | 테스트 클러스터(WBS 5.3a) |

---

## 더 보기 — 내부 정본(이 문서에서 근거로 인용한 것)

경로는 `C:\solutions\_workspace\` 기준, 코드는 각 레포 `src/main/java/com/dmove/moveseye/` 기준. 절별 정확한 위치(§·#·클래스)는 본문 각 절 끝의 **더 보기** 줄에 있고, 아래는 그것을 문서 단위로 모은 것이다.

- 문서·코드 경로: `contract_apm-p4.md` · `reviews/review_apm-p4-be_claude.md` · `reviews/review_apm-p4-fe_claude.md` · `verification/e2e_apm-p4-qa.md` · `rum/security/RumSecurityConfiguration` · `rum/token/RumTokenService` · `rum/ingest/{RumParser,RumSanitizer,RumStore}` · `rum/page/RumQueryService` · `auth/security/JwtAuthFilter:82` · `guides/apm-code-walkthrough.md` · `service/instance/{ApmKubernetesMetricObserver,ApmKubernetesStateWriter}` · `collector/config/ApmCollectorConfigGenerator#kubernetes` · `db/migration/V57`
- 클래스·식별자: `kubernetes`
- 관련 분책: 이전 [10-p3-operations.md](10-%EB%8B%A8%EA%B3%84%EB%B3%84-%EC%83%81%EC%84%B8-P3-SLO-%ED%95%A9%EC%84%B1-%EA%B0%90%EC%8B%9C-%EB%A9%94%EC%8B%9C%EC%A7%95-%EB%B0%B0%EC%B9%98-%EB%A6%AC%ED%8F%AC%ED%8A%B8-AI-%EC%84%A4%EC%B9%98-%EC%B6%9C%EC%B2%98.md) · 다음 [12-operations.md](12-%EC%9A%B4%EC%98%81-%EB%B0%B0%ED%8F%AC-%EC%A1%B0%EA%B1%B4-%EA%B3%A0%EA%B0%9D%EC%9D%B4-%EC%8B%A4%EC%A0%9C%EB%A1%9C-%ED%95%B4%EC%95%BC-%ED%95%98%EB%8A%94-%EA%B2%83.md) · 목차 [00-index.md](00-MovesEye-APM-%EC%A2%85%ED%95%A9-%EC%95%88%EB%82%B4%EC%84%9C-%EB%AA%A9%EC%B0%A8-%EC%9D%BD%EB%8A%94-%EC%88%9C%EC%84%9C-%EC%9A%A9%EC%96%B4-%EC%9A%94%EC%95%BD%ED%8C%90-%EC%A0%84%EC%B2%B4-%EC%A7%80%EB%8F%84.md) · 용어 [14-glossary.md](14-%EB%B6%80%EB%A1%9D-A.-%EC%9A%A9%EC%96%B4-%EC%82%AC%EC%A0%84%28%EC%A0%84%EC%B2%B4%29.md) · 출처 전체 [17-sources.md](17-%EB%B6%80%EB%A1%9D-D.-%EC%B6%9C%EC%B2%98-%EB%AA%A9%EB%A1%9D-%EC%99%B8%EB%B6%80-%EA%B3%B5%EC%8B%9D-%EB%AC%B8%EC%84%9C-%EB%82%B4%EB%B6%80-%EC%A0%95%EB%B3%B8.md)

## 출처 — 외부 공식 문서(이 문서에 쓰인 것만)

| 주제 | URL |
|---|---|
| Web Vitals 정의·임계 · `web-vitals` 라이브러리 | https://web.dev/articles/vitals · https://github.com/GoogleChrome/web-vitals |
| OpenTelemetry 브라우저 SDK | https://opentelemetry.io/docs/languages/js/getting-started/browser/ |
| `k8s_cluster` 리시버 · 0.159.0 `documentation.md`(리소스 속성 기본 비활성) | https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/v0.159.0/receiver/k8sclusterreceiver/documentation.md |
| `k8sattributes` 프로세서 · 0.159.0 `config.go`(`Validate`) | https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/v0.159.0/processor/k8sattributesprocessor/config.go |
| `kubeletstats` 리시버 | https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/receiver/kubeletstatsreceiver |
| K8s semconv 속성(`k8s.container.restart_count`) | https://opentelemetry.io/docs/specs/semconv/registry/attributes/k8s/ |

전체 목록과 "확신이 낮아 상위 페이지로 적은 것"은 [17-sources.md](17-%EB%B6%80%EB%A1%9D-D.-%EC%B6%9C%EC%B2%98-%EB%AA%A9%EB%A1%9D-%EC%99%B8%EB%B6%80-%EA%B3%B5%EC%8B%9D-%EB%AC%B8%EC%84%9C-%EB%82%B4%EB%B6%80-%EC%A0%95%EB%B3%B8.md) D.1.

