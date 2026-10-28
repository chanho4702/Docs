# §7 운영·배포 조건 — 고객이 실제로 해야 하는 것

> **MovesEye APM 종합 안내서** 분책 12/18 · 원본 절 **§7 (7.1~7.12)** · 마지막 갱신 **2026-09-23**(§7.12a 동시 시청 상한 설정·증상표·확인 순서·stats EP 추가 · 09-17 §7.12 P5 라이브 스위치 넷).
>
> **이 문서를 읽으면 알게 되는 것**
> 1. Collector·앱·브라우저·K8s·Zabbix·PostgreSQL 각각에서 고객 손으로 해야 하는 일과 순서(토큰 5단계·OS별 설치·스택별 한 줄)
> 2. 빠뜨리면 무슨 증상이 나는지(semconv opt-in·큐 경로·`New-Service`·`work_mem` 64MB·BE 먼저 배포)
> 3. 라이선스 만료 절차와 문서 간 어긋남(export 주기 10초 vs 15초)
> 4. P5 라이브 관제를 켜려면 스위치 **넷**이 전부 필요하고, 하나라도 빠뜨리면 무슨 일이 나는지
>
> **전제 문서** — 이전 [11-p4-rum-k8s.md](11-p4-rum-k8s.md) · 다음 [13-verification.md](13-verification.md) · 목차 [00-index.md](00-index.md). 용어는 [14-glossary.md](14-glossary.md), 출처 전체는 [17-sources.md](17-sources.md). P5 전체 그림은 [18-p5-realtime.md](18-p5-realtime.md) §10.9.
> **표기**: 🔴 = 어기면 데이터가 조용히 틀리는 규칙 · ⚠️ = 알고 있어야 하는 한계 · ✅ = 실측으로 확인된 것.

## 7. 운영·배포 조건 — 고객이 실제로 해야 하는 것

> 이 장을 읽으면: Collector·앱·브라우저·K8s·Zabbix·PostgreSQL 각각에서 **고객 손으로 해야 하는 일**과 그 순서, 그리고 빠뜨리면 무슨 증상이 나는지 알게 된다. 설치 가이드 화면(`GET /apm/install-guide?os=&stack=`)이 이 내용을 OS×스택 조합으로 생성하며, 출처 링크 `references[]`가 함께 나간다.

### 7.1 토큰 발급 5단계 (수집기 메뉴 › 토큰·설정 탭)

| | |
|---|---|
| **무엇을** | ① 토큰 발급(라벨·scope `ingest`(±`deploy`)·`withConfig`) → ② 원문 1회 모달(닫으면 DOM에서 소거, 재표시 불가) → ③ 설정 yaml 다운로드(자리표시 `${RECEIVE_TOKEN}`은 발급과 같은 요청일 때만 채워짐) → ④ Collector 설치·기동 → ⑤ "최근 60초 수신" 검증 버튼(`GET /apm/ingest/recent`) |
| **조건** | 관리자(또는 `apm.edit`) · `Feature.APM` · 발급 폼 기본값은 `GET /apm/collectors/config-defaults`(큐 경로 OS별·다운로드 베이스·`slowMs 2000`·`normalPct 2`·`memoryLimitMib 512`·endpoint 예시)에서 채우고 **제출 시 전부 실어 보낸다** |
| **함정** | 잃어버리면 재발급(옛 토큰 즉시 401) · yaml에 자리표시가 남으면 Collector는 **기동에 성공**하고 엉뚱한 곳으로 보낸다(생성기는 잔존을 예외로 막는다) · `keepRawSql=true`면 `transform/sql`이 프로세서 정의와 파이프라인 양쪽에서 빠진다(한쪽만 지우면 기동 거부) |

### 7.2 Collector 설치 (OS별)

| 단계 | Windows(PowerShell) | Linux(systemd) |
|---|---|---|
| 내려받기 | `otelcol-contrib_0.159.0_windows_amd64.tar.gz`(다운로드 베이스는 프로퍼티 — 폐쇄망 미러 가능) | `…_linux_amd64.tar.gz` |
| 설정 배치 | 생성 yaml → 설치 경로, 파일 권한 관리자 전용 | `/etc/otelcol/config.yaml`, 600 |
| 큐 디렉터리 | `C:\ProgramData\moveseye\otelcol-queue`, `icacls`로 잠금 | `/var/lib/moveseye/otelcol-queue`, 700 — 🔴 yaml의 `file_storage.directory`와 **같은 경로**여야 한다(테스트가 os별 일치를 고정) |
| 서비스 등록 | 🔴 `sc.exe`가 아니라 **`New-Service`**(`binPath=` 따옴표 지옥 회피, nssm 불필요) | unit 파일 + `systemctl enable --now otelcol` |
| 포트 | 앱 → Collector **4317(gRPC)/4318(HTTP)** LAN 안, Collector 자기 메트릭 127.0.0.1:8888, health 127.0.0.1:13133 | 〃 |
| 방화벽 | Collector → MovesEye BE(또는 nginx) `/apm/otlp` **아웃바운드**만. 인바운드는 앱들에서 4317/4318 | 〃 |
| notices | `single-collector`(게이트웨이 1대) · `license-expiry`(403 즉시 폐기) · `token-secrecy` · `app-to-collector`(직송 불가) · `masking-opt-in` · **`postgres-tuning`** · `capacity-planning` | 〃 |

### 7.2a 디스크 큐 크기·재시도 예산·BE 재기동 `[2026-09-28 신설 · ZM-122]`

BE가 재기동·장애로 응답하지 않는 동안 Collector는 배치를 **디스크 큐**(`file_storage`)에 쌓았다가 BE가 돌아오면 밀어 넣는다. BE는 영수증으로 중복을 거르고 적재 실패는 503(재시도)으로 응답하므로, 재기동 수 분은 데이터 손실 없이 넘어간다. 손실 경계는 둘이다.

| 경계 | 설정(발급·설정 화면) | 기본 | 뜻 |
|---|---|---|---|
| 큐 크기 | `queueSize` → yaml `sending_queue.queue_size` | 10,000 배치 | 🔴 **metrics·traces·logs 각각**에 적용. 배치 하나 ≈ 240KB(V0 실측) → 신호당 최대 ≈2.4GB. 넘치면 그 뒤 배치는 그 자리에서 버려지고 상태 탭 **큐 넘침**에 집계된다 |
| 재시도 예산 | `retryMaxElapsedMin` → `retry_on_failure.max_elapsed_time` | 30분 | 큐 전체가 아니라 **꺼내서 보내는 중인 배치 하나**의 예산. BE 장애가 이 시간을 넘으면 그때마다 소비자 수(10)만큼의 배치가 폐기된다 — 큐가 남아 있어도 무손실 시간은 이 값. 0(무한)은 거절(영영 실패하는 배치가 소비자를 영구 점유) |

- 큐가 차는 속도는 **샘플링 뒤** 배치 수다. 기본 샘플링(정상 2%)·1,000 SERVER/초에서 트레이스 ≈0.25배치/초(10,000 = 약 11시간). `normalPct`를 100으로 올리면 ≈4배치/초(약 40분).
- 디스크 여유는 **큐 파일 크기의 2배** 이상(기동 시 compaction이 새 파일을 만드는 동안 두 파일이 공존). `memory_limiter`는 디스크와 무관하다.
- BE 회복 직후에는 소비자 10개가 한꺼번에 밀어 넣는다. BE는 적재 동시 상한(`app.apm.otlp.max-concurrent`, 기본 6)을 넘는 요청에 **429**를 주고 Collector가 재시도한다 — 폐기가 아니라 지연이다.
- 재기동 직후 "수신 끊김" 알림은 **임계 + 평가 주기**(기본 5+5분) 동안 판정하지 않는다(재전송 도착 전 오탐 방지). 그만큼 실제 장애 감지가 늦어질 수 있다(최대 ≈ 임계 + 2×주기).

**기존 설치 갱신(설정 yaml이 바뀐 릴리스)** — 이미 설치된 Collector에는 자동 반영되지 않는다.
1. 게이트: BE 정상 · 상태 탭 "최근 60초 수신" 초록 · **신호별 큐(상태 탭 큐 열의 작은 글씨)가 0**이고 표본 시각이 최근일 것. BE 다운 중에는 자기 메트릭도 큐에 있어 회복 직후의 0은 옛 표본일 수 있다.
2. 현재 yaml을 `.bak`으로 복사 → 토큰·설정 탭에서 설정 **재생성**(토큰은 그대로) → Collector 재시작.
3. 재시작 실패 시 `.bak` 복원 후 재시작. 🔴 큐 디렉터리는 어떤 경우에도 삭제·변경하지 않는다(쌓인 배치가 곧 데이터다).

### 7.3 앱 계측 한 줄 (스택별)

| 스택 | 한 줄 | 필수 env |
|---|---|---|
| Java(Spring·Tomcat·Jira…) | `-javaagent:opentelemetry-javaagent.jar`(2.31.1) | `OTEL_SERVICE_NAME` · `OTEL_EXPORTER_OTLP_ENDPOINT=http://<collector>:4317` · `OTEL_RESOURCE_ATTRIBUTES=deployment.environment.name=prod,service.version=1.2.3` · `OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE=delta`(권장 — CUMULATIVE도 받되 극값·exemplar 정확도가 떨어진다) · `OTEL_SEMCONV_STABILITY_OPT_IN=database` · `OTEL_METRIC_EXPORT_INTERVAL`(실시간 화면을 쓰면 짧게 — 7.11절 참조) |
| .NET | `OTEL_DOTNET_AUTO_*` 자동계측 설치 스크립트 | 위 공통 + `OTEL_SEMCONV_STABILITY_OPT_IN=http,database`(P2 QA D13 — .NET 안내에만 없었다) |
| Node | `--require @opentelemetry/auto-instrumentations-node/register` | 🔴 `OTEL_SEMCONV_STABILITY_OPT_IN=http,database` **없으면 RED 지표 전량 폐기** · `OTEL_EXPORTER_OTLP_PROTOCOL=grpc` |
| Python | `opentelemetry-instrument python app.py` | 🔴 같은 opt-in 필수(P1 QA D1) · protocol grpc |
| Go | SDK 수동(`otelhttp` 초기화 코드) | 코드 수정이 든다 — "코드 수정 0"으로 안내하지 않는다 |
| 배포 마커(CI/CD) | `curl --fail -H "Authorization: Bearer <deploy 토큰>" -d '{"version":"1.5.0"}' POST /apm/services/{uid}/deployments` | scope `deploy` 토큰(kind COLLECTOR), 실제 HTTP 상태로 성패 |
| 배치 잡 | 루트 스팬·`kind=INTERNAL`·`job.name` 속성, 실패는 `setStatus(ERROR)` 명시 | 규약 미준수면 화면이 영원히 빈다 |

`http.server.active_requests`: Java는 플래그 없이 나온다 ✅, Node·Python은 안 나온다 → "계측 미제공" 배지. `process.*`는 Java 에이전트가 안 낸다(JVM 계열로 대체).

### 7.4 RUM 스니펫 (P4)

수집기 › 브라우저(RUM) 탭에서 **RUM 전용 토큰** 발급(허용 origin `scheme://host[:port]` 정확 문자열, 최대 32, 빈 목록 = 수신 중지) → `GET /apm/rum/snippet?tokenId=`로 ES module 코드·`installCommand`·`cspConnectSrc`·`propagateTraceHeaderCorsUrls`·notices 7·references 3 → 번들에 포함, `PASTE_ONCE_ISSUED_RUM_TOKEN` 자리에 배포 설정으로 토큰 삽입, 동의 후 `consentGranted` → CSP `connect-src`에 MovesEye origin 추가(✅ QA 5-3: 없으면 브라우저가 막는다) → 백엔드 CORS에 `traceparent`·`tracestate` 허용 + `propagateTraceHeaderCorsUrls`에 백엔드 명시(프론트→백 트레이스 연결). 🔴 Collector 토큰을 브라우저에 넣지 않는다. 대소문자·기본 포트를 서버가 동치화하지 않는다(`https://app.example.com`과 `:443`은 다르다).

### 7.5 K8s 옵션

발급/설정 생성에 `kubernetes: true`(🔴 QA D1 수정 전 BE에서는 `keepRawSql`을 생략하면 조용히 false — FE가 임시로 `keepRawSql`을 명시해 보낸다). 생성 yaml NOTICE: ServiceAccount RBAC(pods/namespaces/nodes/replicasets/deployments get/list/watch + nodes/stats) · kubelet serving CA가 SA CA와 다르면 별도 마운트(검증을 끄지 말 것) · **kubeletstats는 DaemonSet, k8s_cluster는 클러스터당 1개** · `K8S_NODE_NAME`은 Downward API. RBAC·배포 매니페스트는 인프라 과제(5.3a)로 별건.

### 7.6 권한 켜기

역할 편집 › 애플리케이션 모니터링 › APM — 보기(조회 화면)·생성/편집(토큰·수집기·알람 규칙·SLO/합성 쓰기·서비스 편집). 원문 SQL/스택 열람은 관리자 역할만. 리포트 관리는 관리자만. 🔴 배포 순서 BE 먼저(V48).

### 7.7 Zabbix 전제

Zabbix 7.0 · 제품 서비스 계정에 호스트 그룹/호스트/아이템/트리거 쓰기 권한 · 알람 규칙을 켜면 5분 평가 배치가 그룹·호스트 `MovesEye APM`·아이템·트리거를 만든다(첫 push는 캐시 동기화 대기 → "Zabbix 반영 중") · **고객이 액션을 만들어야** Slack/Teams로 나간다: 조건에 호스트 그룹 `MovesEye APM` 또는 태그 `owner=moveseye-apm`(알람 규칙 › Zabbix 상태 탭의 "알림 액션 없음" 배지가 이를 진단) · 합성 감시는 Zabbix 웹 시나리오 권한 + `web.test.*` history 보존(캘린더 `coveredDays`가 보존에 잘린다).

### 7.8 PostgreSQL 튜닝 (MovesEye 서버 — Collector가 아니다)

`work_mem = 64MB`(🔴 이 값 하나가 조회 플랜을 Sort+GroupAggregate에서 HashAggregate로 바꾼다; 접속×정렬마다 잡히니 무한정 올리지 말 것) · `shared_buffers` = RAM 25% · `maintenance_work_mem = 1GB`(파티션 인덱스·VACUUM) · `max_wal_size = 4GB`(적재 체크포인트 폭주 방지). `work_mem`만은 `ALTER SYSTEM SET work_mem='64MB'; SELECT pg_reload_conf();`로도 된다. 용량 어림: 행당 686B × (서비스×인스턴스×route×메서드×상태클래스×1,440)/일, 3단 합계는 1m 7일의 약 1.6배.

### 7.9 배포 순서·마이그레이션 함정

| 순서 | 왜 |
|---|---|
| **BE 먼저**(코드 + V48~V57) → FE | FE `grantAll`은 BE가 준 키만 채운다 — FE만 먼저면 관리자에게도 APM 메뉴가 사라진다. FE는 P3·P4 가산 필드에 무수정 호환이라 반대 순서만 위험 |
| dev DB에 새 마이그레이션을 먼저 적용하지 않는다 | 사용자의 구버전 BE 재기동이 깨진다 → 종단 검증은 **별도 DB**(`dmove_apm`) |
| V27식 CASE + `jsonb_array_elements` 복제 금지 | `'{}'` 기본값 행에서 마이그레이션 실패 = 기동 실패([6.4절](09-permissions.md)) |
| 적용된 마이그레이션은 손대지 않는다(새 번호) | Flyway checksum — 기설치 환경에서 그 DDL이 영영 실행되지 않고 `validate`도 깨진다(V40이 V38에 덧붙여지지 않은 이유) |
| 배치 `job_key`는 시드와 글자까지 같아야 | 다르면 `SchedulerManager`가 등록 자체를 안 하고 로그 한 줄만 — "실패"가 아니라 "존재하지 않는" 배치 |
| **서비스 관리자 stop timeout ≥ 40초** `[ZM-122]` | BE는 graceful shutdown(요청 마무리 최대 20초) + 스케줄러 마무리 10초 + 빈 파괴로 내려간다(실측 전체 ≈25초). systemd `TimeoutStopSec`·Windows 서비스 stop timeout·Docker `stop_timeout`이 이보다 짧으면 강제 종료돼 정상 종료 정책이 무효가 된다 |
| 실서버 아파치 SSE | `text/event-stream` 버퍼링이면 이벤트가 뭉쳐 온다 — `flushpackets=on` 계열 확인(BE는 `X-Accel-Buffering: no`를 싣지만 mod_proxy는 안 본다) |

### 7.10 라이선스 만료 절차

D-14/7/1 배너("APM 수집이 중단됩니다") → 만료 예정이면 수집기 화면 "수집기 중지·토큰 회수" → Collector 중지·디스크 큐 삭제 안내. 만료 후 Collector 로그의 403 `PermissionDenied … Dropping data`는 FAQ에 기재. 만료 중에도 파티션 선생성·롤업·보존·트레이스 롤업·리포트 배치는 돈다(조회만 잠긴다).

### 7.11 ⚠️ 문서 간 어긋남 — export 주기

Live 설계(`devdesign_apm-live.md` §1)는 `OTEL_METRIC_EXPORT_INTERVAL=10000`(10초)을 "설치 가이드가 안내해야 한다"고 적었는데, 설치 가이드 코드(`ApmInstallGuideService` Java env)는 `15000`을 "선택. 기본 60초보다 촘촘하게 보고 싶을 때만"으로 낸다. 실측(Live QA)은 권장 설정 기준 화면 도달 ≲23초라 15초로도 "약 30초 이내" 문구는 지켜지지만, **두 정본이 다른 숫자를 말한다** — [8장](13-verification.md) 불일치 목록에 올렸다.

### 7.12 P5 라이브 관제 스위치 넷(선택 기능 — 기본 전부 꺼짐)

🔴 실시간 관제(요청 관제·X-View, [18-p5-realtime.md](18-p5-realtime.md))는 **넷을 전부 켜야** 동작한다. 하나라도 빠뜨리면 조용히 안 되거나, 더 나쁘면 PII가 나간다.

| | |
|---|---|
| **스위치 4개** | ① BE `app.apm.live.spans.enabled`(기본 **false**) ② 수집기 설정 생성 요청의 `liveSpans` 옵션(기본 **꺼짐** — 켜면 생성 yaml에 `traces/live` 블록이 붙는다) ③ Collector 실행줄의 `--feature-gates=ottl.set.allowNil`(3개 OS 실행줄 전부) ④ 앱 SDK `OTEL_BSP_SCHEDULE_DELAY=1000`(+ `OTEL_BSP_MAX_QUEUE_SIZE` 짝) |
| **하나씩 빠뜨리면** | ① 인증은 통과하고 503 `APM_LIVE_DISABLED` + `disabled` 계수만 쌓이고 Collector 로그가 계속 실패로 남는다 ② 생성 yaml에 라이브 블록 자체가 없다(꺼짐이면 기존 생성물은 한 바이트도 안 바뀐다 — 회귀로 고정) ③ 🔴 **가장 위험한 누락** — `span.events`·`span.links` 정리가 **오류·경고 없이 무시**돼 스택트레이스·예외 메시지·링크 속성이 그대로 전송된다(✅ 실측: PII 3종 추가 유출 + 전송량 +47%) ④ 저트래픽 서비스의 완료→캡처 p95가 5.7초까지 벌어져 "약 2초" 문구가 거짓이 된다(⚠️ 이것은 설정 요건이지 실측 보장이 아니다) |
| **기존 설치를 라이브로 갱신할 때** | 새 yaml 받기 → 실행줄에 `--feature-gates` 추가 → 서비스 재시작. **셋 다** 해야 한다 — yaml만 바꾸거나 실행줄만 바꾸면 반쪽짜리가 된다. 설치 가이드가 이 절차를 별도로 안내한다 |
| **켠 뒤 확인하는 곳** | 수집기 탭 **라이브 카드**(`GET /apm/collectors/{id}/live`, V59): `statement_warn`/`condition_warn`(OTTL 실패 WARN — 내부 로그가 샘플링돼 🔴 **WARN 수 ≠ 손실 수**) · `gate_warn`(feature gate 누락, 프로세스 수명당 1회뿐) · `filter/live-safety` 차단 수(정확한 전용 카운터) · 라이브 exporter `enqueue_failed`+`send_failed`(반드시 합산해서 봄 — "종단 유실"이라 부르지 않는다, 큐 5·재시도 없음이 설계상 정상이라 기존 저장 전송 실패 집계에서 제외돼 있다) |
| **🔴 결측을 정상 `0`으로 읽지 않는다** | 건강한 Collector는 애초에 이 WARN을 안 쓴다 — 로그 수집 자체가 죽으면 값이 "0"이 아니라 **`null`(결측)**로 나와야 정직하다. `condition_warn == 0` 알람은 "판정 불가 구간"이 있다는 뜻을 항상 달고 있어야 한다 |
| **yaml 라이브 블록** | 🔴 **손으로 고치지 않는다.** 생성기가 내보내는 라이브 구간은 실측 통과본과 바이트 동일이고 MD5 골든 회귀가 걸려 있다. 조건 매칭 범위만 완화하거나 `summary`·`scope`를 바꿔도 검출되고, 실패 메시지가 "재시험 필요"라고 알려준다 |

**더 보기**: 스위치·근거·수집기 탭 신호 = [18-p5-realtime.md](18-p5-realtime.md) §10.9 · yaml 정본·6단계 구현 = §10.3·§10.6·§10.7(R-P5b) · V59 = `db/migration/V59`.

#### 7.12a 동시 시청 상한 설정 `[2026-09-23 승격]`

실시간 관제 SSE의 동시 시청 상한이 코드 상수에서 설정으로 올라왔다(`app.apm.live.spans.stream.*`, 환경변수 `APM_LIVE_STREAM_*`).

| 키 | 기본 | 뜻 · 🔴 |
|---|---:|---|
| `max-active` | 40 | 동시에 데이터를 받는 연결. 초과는 대기열(화면에 "대기 n번째") |
| `max-waiting` | 10 | 대기열 길이. 초과는 429(재시도 가능) |
| `per-user` | 4 | 계정당 연결. 🔴 숨긴 탭도 센다(유휴로 끊지 않는다 — 관제실 모니터는 계정 하나에 탭 하나). 사람 쪽 대책은 화면의 **연결 끊기**(즉시 반납)와 헤더 "내 연결 n/4" |
| `max-snapshots` | 2 | 동시 snapshot 생성 수 = 워커 풀. 🔴 실측 없이 4를 넘기지 말 것 — 같은 서비스 락 아래서 버킷을 복사하므로 수집 예약(50ms 락 예산)과 경쟁한다(코덱스 09-28) |
| `queue-mib` | 8 | 연결당 송신 큐. 🔴 하한 8(프레임 2 MiB × 4 part와 짝) |
| `write-timeout-ms` | 2000 | 느린 클라이언트 격리 — 그 연결만 끊는다 |

🔴 **숫자 하나만 올리지 말 것.** 활성 연결이 늘 때 느는 것은 힙이 아니라 **송신 대역폭**이다(직렬화는 화면 조건마다 한 번, 바이트는 연결이 공유 — 코덱스 의견 `_archive/features/apm/realtime/review_apm-live-sse-concurrency_codex.md`). 올리기 전에 ① 최대 프레임 8 MiB × 연결/초가 NIC·프록시 한도 안인지 ② 아파치 뒤라면 활성+대기 합이 MPM worker 한도 안인지 ③ `per-user ≤ max-active`(아니면 기동 실패)를 본다. **아파치 경유 10/40/100명 부하 시험은 아직 안 했다**(백로그 B7).

**적용 시점·기동 실패.** 값은 **BE 기동 때 한 번** 읽는다(재기동 필요 — 화면 설정이 아니다). 범위 밖(`max-active` 1~500 · `max-waiting` 0~200 · `per-user` 1~16 · `max-snapshots` 1~16 · `queue-mib` 8~64 · `write-timeout-ms` 200~30000)이면 Bean Validation이, `per-user > max-active`면 `IllegalStateException("app.apm.live.spans.stream.per-user(n)는 max-active(m)를 넘을 수 없다")`가 기동을 막는다. 키를 **생략**하면 코드 기본값(2026-09-23 이전 상수와 같다)이고, 빈 값을 명시하면(`APM_LIVE_STREAM_MAX_ACTIVE=`) 기동이 죽는다 — "설정을 넣었는데 안 먹는다"가 배포 뒤에 드러나지 않게 일부러 그렇게 뒀다. 🔴 09-28 정정: 처음엔 "Integer 변환 실패로 죽는다"고 적었는데 코덱스가 **틀렸다고 잡았다**(Spring이 빈 문자열을 null로 바꾸고 기본값으로 접힌다). 지금은 `ApmLiveStreamProperties.requireNonBlank`가 Environment의 치환 원문을 보고 빈 값이면 던진다. `queue-mib`는 `@Min(8)`과 별개로 `frame×parts`(2 MiB×4)와 직접 비교한다(코드: `ApmLiveStreamProperties`·`LiveStreamLimits.from`, 테스트 5건, 커밋 `2339a2d`+후속).

**증상 → 원인 → 손댈 키.** 화면·로그에서 보이는 순서대로.

| 증상(화면 `control` 이벤트) | 뜻 | 원인 | 손댈 키(올리기 전 위 🔴 확인) |
|---|---|---|---|
| `paused` + "대기 n번째" | 연결은 살아 있고 heartbeat만 받는다. 앞 연결이 빠지면 자동 시작 | 활성이 `max-active`에 찼거나, **새 화면 조건**(serviceUid·env·창 길이 조합 = viewKey)이 `max-snapshots`보다 많이 동시에 열렸다 | `max-active` · 서로 다른 조건을 여럿 연다면 `max-snapshots` |
| `reject 429 APM_LIVE_TOO_MANY_CONNECTIONS`(15초 뒤 자동 재시도) | 대기열도 찼다. 사용자당 상한도 이 코드다 | 활성+대기가 찼거나 **그 계정이 이미 `per-user`개 연결**(숨긴 탭 포함) | 먼저 그 사용자의 다른 탭을 닫게 한다. 진짜 인원이 많으면 `max-waiting`·`max-active` |
| `degraded`(간격이 성기어짐, 그 연결만) | 이 연결의 송신 큐가 찼다 — 서버는 정상 | 느린 회선·프록시 버퍼링·브라우저 멈춤 | 회선을 본다. `queue-mib`를 올리는 건 증상 은폐(같은 속도면 결국 찬다) |
| 연결이 조용히 끊기고 EventSource가 재접속 | write가 `write-timeout-ms`를 넘겼거나 큐가 `queue-mib`를 넘겼다 | 위와 같은 원인의 더 심한 형태 | 위와 같다 |
| 전원이 동시에 `reject 503 APM_LIVE_DISABLED` | 기능 스위치 | `app.apm.live.enabled=false` | 상한과 무관 — §7.12 |

**확인 순서(운영자).** ① 요청 관제·X-View 탭 머리의 태그("대기 n번째"·degraded 사유 — FE `apm.realtime.queued`/`apm.realtime.degraded.*`) — 어느 증상인지 ② 그 사용자가 탭을 몇 개 열었나(`per-user`는 숨긴 탭도 센다) ③ 아파치 경유면 `server-status`의 busy worker(장기 연결 = 활성+대기 수만큼 점유) ④ BE 로그 `apm-spans-snapshot`·`apm-spans-writer` 스레드의 WARN. ⑤ **`GET /apm/live/spans/stats`**(2026-09-23 밤 신설, 계약 §5.2a) — `connections.{total,active,waiting,users,mine,views}`·`limits`·`counters.{rejected,degraded,writerTimeouts,writerFailures,tickFailures}`. 화면 헤더에도 "내 연결 n/4 · 전체 시청 a/40"이 15초마다 갱신되고, 기동 로그에 유효 상한이 한 줄 찍힌다(`실시간 관제 SSE 동시 시청 상한 — 활성 40 · 대기 10 …`). 거절 누적이 오르는데 활성이 상한 아래면 **사용자당 4**에 걸린 것(한 계정의 탭)이고, 활성이 상한에 붙어 있으면 인원 문제다.

**인원별 예시(추정, 실측 아님).** 관제실 모니터 2~3대 + 담당자 5명 안팎이면 **기본값 그대로**(활성 40이 남아돈다). 한 화면을 여러 조건으로 쪼개 보는 운영(서비스별 탭 6개 이상)이라면 `max-snapshots`를 4로. 아파치 prefork 기본 worker 256인 사이트에서 `max-active+max-waiting`을 100 넘게 두면 장기 연결이 worker의 절반을 잡으니 **먼저 아파치를 event MPM으로** 바꾼다. 이 문단의 숫자는 B7 #1 부하 시험 뒤 실측값으로 교체한다.

### 7.13 서비스별 수집 중지 `[2026-09-18 신설]`

"이 서비스는 이제 그만 받겠다"를 화면에서 할 수 있게 됐다. **서비스 목록의 수집 열** 또는
**서비스 상세 › 설정 탭**의 스위치다(편집 권한 필요).

🔴 **숨김과 다른 축이다.** 이 둘을 같은 것으로 생각하면 반드시 틀린다.

| | 목록에 보이나 | 데이터가 쌓이나 |
|---|---|---|
| 평범 | 보인다 | 쌓인다 |
| **수집 중지** | **보인다** | **안 쌓인다** |
| 숨김 | 안 보인다 | **쌓인다** |
| 둘 다 | 안 보인다 | 안 쌓인다 |

알아 둘 것 다섯.

1. **이미 저장된 데이터는 지우지 않는다.** "그만 받겠다"와 "지금까지 받은 것도 없애겠다"는
   다른 요구다. 지우려면 보존 정책이나 서비스 삭제를 쓴다.
2. **멈춰도 "마지막 수신" 시각은 계속 갱신된다.** 멈춘 것은 저장이지 수신이 아니다. 그래서
   이 서비스는 **수신은 오는데 저장이 0인 것이 정상**이고, 수집기 점검 화면이 그것을 장애로
   읽지 않는다. 또 이 덕분에 자동 숨김 TTL이 돌아 서비스가 목록에서 사라지지도 않는다.
3. **다시 켜도 꺼 둔 동안의 데이터는 돌아오지 않는다.** 그 시점부터 다시 쌓인다.
4. **반영은 다음 수신부터다.** 이미 전송 중이던 묶음은 마저 저장될 수 있다.
5. **편집 권한이 없어도 상태는 보인다**(스위치 대신 태그). 감춰 버리면 데이터가 왜 안 쌓이는지
   볼 수 있는 사람이 관리자뿐이 되고, 그건 장애로 오인된다.

폐기 카운터에는 전용 사유 `COLLECTION_PAUSED`로 오른다 — 승인 대기(`PENDING`)·미등록
(`REJECTED`)과 섞이지 않는다. 저 둘은 "아직 허락되지 않았다"라 화면이 승인을 권해야 하지만
이쪽은 이미 허락했다가 스스로 끈 것이라 권할 일이 없다.

---

**더 보기(7.1~7.11)**: 단계·env·notices 원문 = `premium/apm/collector/install/ApmInstallGuideService.java`(`notices()`·`PG_TUNING_NOTICE`·`CAPACITY_NOTICE`)·`ApmDocRef.java` · 프로퍼티·기본값 EP = `features/apm/core/contract_apm-read-api.md` §8.6 · 출처 카탈로그 규약 = §8.8 · 스니펫·K8s = `features/apm/core/contract_apm-p4.md` §5·§6 · 토큰 5단계 UX = `features/apm/core/e2e_apm-p1-qa.md` A-2~A-6 · 배포 순서·V48 = `features/apm/core/contract_apm.md` 머리말·[6.4절](09-permissions.md) · SSE 버퍼링 = `features/apm/realtime/devdesign_apm-live.md` §8 #2·메모리 `deploy-server-topology` · Zabbix 액션 진단 = `features/apm/core/r10_apm-zabbix-history-push.md` §1 #13.
**출처**: Collector 설치 https://opentelemetry.io/docs/collector/installation/ · OTLP receiver(4317/4318) https://github.com/open-telemetry/opentelemetry-collector/tree/main/receiver/otlpreceiver · health_check 확장 https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/extension/healthcheckextension · memory_limiter https://github.com/open-telemetry/opentelemetry-collector/tree/main/processor/memorylimiterprocessor · transform(SQL 마스킹) https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/processor/transformprocessor · redaction(PII) https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/processor/redactionprocessor · SDK env(`OTEL_SERVICE_NAME`·`OTEL_EXPORTER_OTLP_ENDPOINT`·`OTEL_METRIC_EXPORT_INTERVAL`) https://opentelemetry.io/docs/specs/otel/configuration/sdk-environment-variables/ · Node 자동계측 패키지 https://www.npmjs.com/package/@opentelemetry/auto-instrumentations-node · .NET 자동계측 저장소 https://github.com/open-telemetry/opentelemetry-dotnet-instrumentation · Go `otelhttp` https://pkg.go.dev/go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp · PowerShell `New-Service` https://learn.microsoft.com/powershell/module/microsoft.powershell.management/new-service · `icacls` https://learn.microsoft.com/windows-server/administration/windows-commands/icacls · systemd 서비스 유닛 https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html · PostgreSQL 자원/WAL 설정 https://www.postgresql.org/docs/current/runtime-config-resource.html · https://www.postgresql.org/docs/current/runtime-config-wal.html · Zabbix 7.0 매뉴얼 https://www.zabbix.com/documentation/7.0/downloads/Zabbix_Documentation_7.0.en.pdf .

---

### 7.14 자바 확장(진행 중 요청)과 요청 걸림 장부 `[2026-09-23 신설]`

**무엇을 켜나** — 요청 관제 탭의 "진행 중 요청" 카드(원판·요청 흐름 무대·목록)와 알람 규칙 `STUCK_REQUEST`(요청 걸림)는 **앱 JVM에 확장 jar를 붙인 서비스**에서만 값이 있다. 확장이 없으면 화면은 "확장 없음"(0이 아니다)이고 규칙은 아무것도 재지 않는다. 배경·원리는 [18](18-p5-realtime.md) §10.10.

**앱 실행줄**(에이전트와 같은 자리, 배포 파일은 `C:\ProgramData\moveseye\otel\`에 두는 것이 우리 관례):
```
-javaagent:.../opentelemetry-javaagent.jar
-Dotel.javaagent.extensions=.../moveseye-otel-extension-0.2.0.jar
-Dotel.service.name=<서비스 이름>
-Dotel.instrumentation.http.server.emit-experimental-telemetry=true   # 동시 요청 수(active_requests) 메트릭
```

**확장 옵션**(system property, 전부 선택)

| 키 | 기본 | 뜻 · 🔴 |
|---|---:|---|
| `moveseye.active-requests.max-active` | 10000 | 동시 추적 상한(배열 칸 수). 최대 **200,000** — 1초 집계가 전체를 훑으므로 상한이 곧 초당 비용 |
| `moveseye.active-requests.tracking-ttl-millis` | 600000 | 이만큼 안 끝나면 추적을 **포기**한다(완료가 아니다 — `expired_recent`로 센다) |
| `moveseye.active-requests.export-interval-millis` | 1000 | 진행 중 요청 metric만 따로 보내는 주기(전용 MeterProvider). 0이면 에이전트 metric 주기 |
| `moveseye.active-requests.list.size` | 30 | 1초마다 로그 한 줄로 보내는 가장 오래된 처리 중 요청 수. 최대 100, 본문 64K자 상한. 0이면 안 보냄, 잘못된 값은 30 |
| `moveseye.active-requests.slow-threshold-millis` | 2000 | 끝난 요청을 "느림"으로 셀 기준 — 🔴 BE 실시간 관제 `slowMs`와 같게 둔다(두 화면의 "느림"이 같아야) |
| `moveseye.active-requests.exclude-paths` | `/apm/live/stream,/apm/live/spans/stream,/event/stream,/events/stream` | 🔴 SSE·long-polling처럼 **원래 오래 열리는 연결**의 경로 접두(쉼표, 최대 32개·200자). 안 넣으면 5초 이상 빨간 동전으로 영원히 남고 요청 걸림 규칙이 그것을 장애로 적는다 |
| `moveseye.active-requests.metrics.enabled` | true | false면 아무것도 내보내지 않는다(요청 경로 비용도 0 — `isActive` 게이트) |

**BE 쪽**

| 항목 | 값 | 🔴 |
|---|---|---|
| `app.apm.live.max-heap-mb`(`APM_LIVE_MAX_HEAP_MB`) | 기본 **384**(2026-09-23, 192에서) | 진행 중 요청의 1초 이력(인스턴스당 6.2KB × 64 × 200서비스 ≈ 78MiB)과 처리 중 목록(서비스당 448KiB)이 예산식에 들어왔다. 컨테이너 `-Xmx`가 768MiB 미만이면 이 값을 함께 줄일 것 — 넘으면 **기동 실패**(메시지가 조정 안내) |
| 요청 걸림 임계 | 알람 규칙 화면 전역 `STUCK_REQUEST` 규칙, 기본 **60초**(V67 시드) | 앞단 프록시(nginx·Apache·ALB)가 연결을 끊는 시간에 맞췄다. 프록시 타임아웃을 바꿨으면 이 값도 맞춘다. 서비스별 규칙으로 덮어쓸 수 있다 |
| 장부 보존 | `apm_retention` options `stuckRequestDays` 기본 90 | 닫힌 행만 삭제. 스팬 보존(7일)보다 길어 오래된 행의 trace 링크로는 워터폴이 안 열린다 |
| Zabbix | `MovesEye APM` 호스트의 트래퍼 아이템 `apm.stuck_request[<svc_uid>]`, 트리거 `>0`, priority 4 | 액션 연결은 다른 규칙과 같다(§7.7·[05](05-menus-and-tabs.md) 알람 규칙). 값은 걸린 요청 중 **최대 경과 ms**, 전부 풀리면 0 |
| 메모리 | 진행 중 목록·이력은 **DB 0회**, 90초 지나면 없다 | 서버 재시작 직후 빈 것이 정상. 장부(`apm_stuck_request`)만 DB |

**확인 순서**(BE 재시작 뒤): ① 요청 관제 탭 진행 중 요청 카드가 "확장 없음"에서 원판 숫자로 바뀌는가 ② 느린 요청을 하나 만들면 동전이 파랑→주황→빨강으로 옮겨 가고 목록 표에 "지금 하는 일"이 뜨는가 ③ 60초를 넘기면 알람 규칙 > 요청 걸림 탭에 한 줄, 발화 이력에 서비스 알람 하나, Zabbix Problem 하나가 생기는가 ④ 끝나면 셋 다 닫히는가.

## 더 보기 — 내부 정본(이 문서에서 근거로 인용한 것)

경로는 `C:\solutions\_workspace\` 기준, 코드는 각 레포 `src/main/java/com/dmove/moveseye/` 기준. 절별 정확한 위치(§·#·클래스)는 본문 각 절 끝의 **더 보기** 줄에 있고, 아래는 그것을 문서 단위로 모은 것이다.

- 문서·코드 경로: `premium/apm/collector/install/ApmInstallGuideService.java` · `features/apm/core/contract_apm-read-api.md` · `features/apm/core/contract_apm-p4.md` · `features/apm/core/e2e_apm-p1-qa.md` · `features/apm/core/contract_apm.md` · `features/apm/realtime/devdesign_apm-live.md` · `features/apm/core/r10_apm-zabbix-history-push.md`
- 클래스·식별자: `notices()` · `PG_TUNING_NOTICE` · `CAPACITY_NOTICE` · `ApmDocRef.java` · `deploy-server-topology`
- 관련 분책: 이전 [11-p4-rum-k8s.md](11-p4-rum-k8s.md) · 다음 [13-verification.md](13-verification.md) · 목차 [00-index.md](00-index.md) · 용어 [14-glossary.md](14-glossary.md) · P5 라이브 스위치 전체 근거 [18-p5-realtime.md](18-p5-realtime.md) §10.9 · 출처 전체 [17-sources.md](17-sources.md)

## 출처 — 외부 공식 문서(이 문서에 쓰인 것만)

| 주제 | URL |
|---|---|
| — | http://<collector · https://app.example.com`과 |
| Collector 설치 · 릴리스 | https://opentelemetry.io/docs/collector/installation/ |
| OTLP receiver | https://github.com/open-telemetry/opentelemetry-collector/tree/main/receiver/otlpreceiver |
| `health_check` 확장 | https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/extension/healthcheckextension |
| `memory_limiter` | https://github.com/open-telemetry/opentelemetry-collector/tree/main/processor/memorylimiterprocessor |
| `transform` 프로세서(SQL 마스킹) | https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/processor/transformprocessor |
| `redaction` 프로세서(PII) | https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/processor/redactionprocessor |
| SDK 환경변수(`OTEL_SERVICE_NAME`·`OTEL_EXPORTER_OTLP_*`·`OTEL_METRIC_EXPORT_INTERVAL`) | https://opentelemetry.io/docs/specs/otel/configuration/sdk-environment-variables/ |
| Node 자동계측 · 패키지 | https://www.npmjs.com/package/@opentelemetry/auto-instrumentations-node |
| .NET 자동계측 · 저장소 | https://github.com/open-telemetry/opentelemetry-dotnet-instrumentation |
| Go SDK · `otelhttp` · 자동계측 베타 | https://pkg.go.dev/go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp |
| PowerShell `New-Service` · `icacls` · systemd 유닛 | https://learn.microsoft.com/powershell/module/microsoft.powershell.management/new-service · https://learn.microsoft.com/windows-server/administration/windows-commands/icacls · https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html |
| PostgreSQL 문서(상위) · 자원 설정 · WAL 설정 | https://www.postgresql.org/docs/current/runtime-config-resource.html · https://www.postgresql.org/docs/current/runtime-config-wal.html |
| Zabbix 7.0 매뉴얼 PDF(`history.push`·트래퍼·트리거·API) | https://www.zabbix.com/documentation/7.0/downloads/Zabbix_Documentation_7.0.en.pdf |

전체 목록과 "확신이 낮아 상위 페이지로 적은 것"은 [17-sources.md](17-sources.md) D.1.

