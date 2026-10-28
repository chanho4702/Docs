# APM — 지원 범위 확대 · 메뉴별 차트 조사 · 구현 가능성 · 작업 분해(WBS) v1.1

- 작성: 2026-08-26 (v1 → v1.1 코덱스 검수 반영: IA 상위 6 노출 확정, WBS 순서·규모·누락 태스크 정정, 총계 재산정)
- 상태: 🟡 설계 문서(구현 전). 본 문서는 `devdesign_apm.md`(v3.1, 아키텍처·파이프라인·저장 정본)의 **동반 문서** — 화면·차트·작업 단위를 다룬다. 두 문서가 어긋나면 아키텍처는 `devdesign_apm.md`, 화면·작업은 이 문서가 정본.
- 전제: **APM을 제품 주력으로 간다**(사용자 결정 2026-08-26). 수집기 = OpenTelemetry Collector. 개발은 후일 착수.
- FE 실측(2026-08-26): `echarts ^5.6` + `echarts-for-react` + `echarts-gl`, `@xyflow/react ^12`(네트워크 맵), `react-grid-layout ^2`(홈 위젯·커스텀 차트), `jspdf`·`html-to-image`(리포트), `antd ^5.24`. **현재 쓰는 ECharts 시리즈는 line 22·bar 6·pie 3·gauge 2뿐** — APM은 heatmap·scatter·custom·graph·sankey·treemap·calendar를 새로 연다. 공용 래퍼 `components/Chart/DmoveChart.tsx`(title·options·export/print/showData·redirect). 상태 스트립 `pages/cloud-infra-monitoring/components/InstanceTimeline.tsx` 재사용 후보.

---

## 1. 지원 범위 확대 (v2 → v3)

v2는 "M1 메트릭 · M2 트레이스 · M3 로그"였다. 주력으로 가려면 **경쟁 정의(WhaTap·AWS·Elastic) 채점표의 빈칸을 로드맵 안으로** 끌어온다. 단, 수집 경로는 여전히 **OTel 단일**(RUM·메시징·K8s 전부 OTel 시그널/Collector receiver로 들어온다) — 새 프로토콜을 만들지 않는다.

### 1.1 확대된 시그널·대상

| 영역 | v2 | **v3 확대** | 수집 경로 |
|---|---|---|---|
| HTTP 서버 요청 RED | ✅ | ✅ + gRPC(`rpc.server.duration`) | OTel 메트릭 |
| 런타임 | JVM | **JVM · .NET · Node · Python · Go** 대응표(§3.9) | OTel 런타임 메트릭 |
| 트레이스 | 워터폴·맵 | + **플레임그래프 · 크리티컬 패스 · 트레이스 비교** | OTel 트레이스 |
| 에러 | 오류율 | **예외 그룹화**(타입+메시지 지문) · 스택트레이스 · 첫/마지막 발생 · 배포와 상관 | 스팬 이벤트 `exception.*` |
| DB | 풀 메트릭 | **쿼리 그룹 분석**(정규화 SQL·슬로우 쿼리·DB별) | `db.client.operation.duration` + 스팬 `db.query.text` |
| 외부 의존 | — | **외부 호출 분석**(대상별 지연·오류·타임아웃) | `http.client.*` + CLIENT 스팬 |
| 메시징·배치 | — | **큐/토픽 처리량·소비 지연·배치 작업 실행 타임라인** | `messaging.*` 스팬·메트릭, 배치는 루트 스팬(`kind=INTERNAL`+`job.*` 속성 규약) |
| 합성 감시 | 유예 | **APM 메뉴 편입**(Zabbix 웹 시나리오 관리+결과) | Zabbix(유일한 비-OTel, 이유: 이미 있고 실사용) |
| SLO | — | **SLO 관리**(SLI 정의·목표·에러 버짓·번 레이트 알람) | 우리 집계 |
| 배포 | — | **배포 마커·전후 비교** | `service.version` 변화 자동 + 웹훅 |
| 로그 | M3 | **트레이스 상관 로그 뷰어**(로그 도메인과 저장 공유) | OTel 로그 |
| RUM | ❌ | **브라우저 RUM**(Web Vitals·페이지 로드·프론트→백 트레이스 연결) | OTel Web SDK + `web-vitals` 스니펫, Collector CORS |
| K8s | ❌ | **컨테이너·파드 컨텍스트**(서비스 ↔ 파드/노드, 재시작·OOM) | Collector `k8s_cluster`·`kubeletstats`·`k8sattributes` |
| 리포트 | — | 주간/월간 APM 리포트(기존 리포트 체계) | 우리 집계 |
| AI | 가이드 | 툴 8종 + "느려진 원인 브리핑"(알람 분석 위젯 패턴) | moveseye-ai |

**여전히 안 하는 것**: 코드 프로파일링(OTel profiling 시그널이 아직 실험), 모바일 RUM, 자체 SDK, SaaS.

### 1.2 메뉴 IA (사이드바 "애플리케이션 모니터링" 하위)

```
애플리케이션 모니터링
├ 1. APM 개요                 전체 서비스 상태 대시보드
├ 2. 서비스                   목록 → 상세(탭 12개, §3.2~3.13)
├ 3. 서비스 맵                토폴로지
├ 4. 트레이스 탐색             전 서비스 검색·산점도
├ 5. 에러 분석                 예외 그룹(전 서비스)
├ 6. DB 호출 분석              쿼리 그룹(전 서비스)
├ 7. 외부 호출 분석            의존 대상(전 서비스)
├ 8. 메시징·배치               큐/토픽·배치 작업
├ 9. 합성 감시                 Zabbix 웹 시나리오 관리·결과
├ 10. SLO                     목표·에러 버짓
├ 11. 사용자 경험(RUM)         페이지·Web Vitals            [Phase 4]
├ 12. 알람 규칙                APM 규칙·발화 이력
└ 13. 수집기                   Collector 상태·설정 생성·설치 가이드
+ 홈 위젯 3종 · APM 리포트(설정>리포트 체계) · AI 어시스턴트 툴
```

라우트: `PATH_APPLICATION_MONITORING.*` 확장(현 `root`·`default`만 존재). 전부 `FeatureGate("APM")`·BE `FeatureInterceptor(APM)`.

**사이드바 노출(v1.1 확정, S1)**: 위 13개 중 **상위 6개만 SideNav 하위 그룹**으로 노출한다 — `1 개요 · 2 서비스 · 3 서비스 맵 · 4 트레이스 탐색 · 9 합성 감시 · 13 수집기`. 나머지 7개(에러·DB·외부 호출·메시징/배치·SLO·RUM·알람 규칙)는 **화면은 존재하되** 개요 카드·서비스 상세 탭·설정(⚙ `SettingsMenu.SETTINGS_ENTRIES` — 알람 규칙·SLO)·글로벌 검색으로 진입한다. 라우트·도움말·AI 가이드는 13개 전부 만든다.

### 1.3 단계(Phase) — 마일스톤 재편

| Phase | 내용 | 메뉴 |
|---|---|---|
| **P1 기반+메트릭** | 파이프라인·자동 등록·RED·런타임·알람·수집기·개요 | 1·2(개요/트랜잭션/런타임/인스턴스/설정 탭)·12·13 |
| **P2 트레이스** | 스팬 저장·워터폴·플레임·산점도·서비스 맵·에러·DB·외부 호출·배포 | 2(트레이스/에러/DB/외부/배포 탭)·3·4·5·6·7 |
| **P3 운영 심화** | SLO·합성 감시 편입·메시징/배치·리포트·AI 툴·홈 위젯 | 8·9·10 + 리포트·AI |
| **P4 경험 확장** | RUM·로그 상관·K8s 컨텍스트 | 11 + 2(로그 탭)·K8s 배지 |

---

## 2. 차트 프리미티브 구현 가능성 판정

APM 전 화면이 쓰는 차트를 **프리미티브 18종**으로 환원하고, 우리 스택(ECharts 5.6·React Flow·antd)으로 되는지, 오픈소스가 있는지, 없으면 직접 구현 규모를 판정했다.

| # | 프리미티브 | 쓰는 곳 | 구현 수단 | OSS 후보(라이선스) | 판정 | 직접 구현 시 규모 |
|---|---|---|---|---|---|---|
| C1 | 시계열 line/area(다중·듀얼축·임계 markLine·배포 markLine·밴드 p50/p95/p99) | 거의 전부 | ECharts line + `markLine`/`markArea` ✅ 내장 | — | ✅ 내장 | 옵션 빌더 M |
| C2 | stacked bar / 그룹 bar / 수평 bar(Top-N) | 상태코드·GC·에러 유형·Top-N | ECharts bar ✅ | — | ✅ 내장 | S |
| C3 | 도넛/파이 | 상태 분포·DB별·브라우저별 | ECharts pie ✅ | — | ✅ 내장(기존 3곳) | — |
| C4 | 게이지(Apdex·에러 버짓·SLI) | 개요·SLO | ECharts gauge ✅(기존 2곳) | — | ✅ 내장 | — |
| C5 | **응답시간 히트맵**(시간 × 지연 버킷, 밀도 색) | 서비스 개요·트랜잭션 | ECharts heatmap + visualMap ✅ | — | ✅ 내장(신규 개방) | 옵션 빌더 M(히스토그램 버킷 → 셀 변환은 BE) |
| C6 | **대용량 산점도**(응답시간 × 시각, 수만 점, 드래그 선택 → 트레이스 목록) | 트레이스 탐색·트랜잭션 | ECharts scatter `large:true`+`progressive` + `brush` 컴포넌트 ✅ | — | ✅ 내장 | brush→쿼리 연결 M |
| C7 | **트레이스 워터폴**(스팬 트리 + 시간 막대, 접기/펼치기, 크리티컬 패스 강조, 스팬 클릭 패널) | 트레이스 상세 | ECharts custom series로 가능하나 트리 접기·고정 라벨·행 가상화가 부자연 | Jaeger UI(Apache-2.0, 라이브러리가 아니라 앱 — 발췌 불가) · Grafana TraceView(**AGPL ❌**) · SigNoz(MIT, 앱 내장) | 🔨 **직접 구현** | **L** — React div 기반(antd Table `virtual`로 행, 막대는 CSS %). 약 500~700줄 |
| C8 | **플레임그래프**(트레이스/집계 플레임) | 트레이스 상세·집계 뷰 | ECharts **custom series** — 공식 예제(flame graph) 존재 ✅ | `d3-flame-graph`(Apache-2.0) 대안 | ✅ ECharts custom | 옵션 빌더 M |
| C9 | **서비스 맵**(노드=서비스/DB/외부/큐, 엣지 굵기=호출수·색=오류율, 자동 레이아웃, 클릭 사이드패널) | 서비스 맵 | `@xyflow/react` ✅ 보유(네트워크 맵) + 자동 레이아웃 라이브러리 **추가 필요** | `@dagrejs/dagre`(MIT) · `elkjs`(EPL-2.0) · ECharts `graph` force(내장, 대안) | ✅ React Flow + **dagre 추가(MIT)** | 노드/엣지 컴포넌트 M, 레이아웃 S |
| C10 | **상태 타임라인/가용성 스트립**(UP/DEGRADED/DOWN 구간 막대, 호버 상세) | 개요·인스턴스·합성·수집기·알람 이력 | `InstanceTimeline.tsx` 재사용·일반화 ✅ / ECharts custom 대안 | — | ✅ 기존 컴포넌트 일반화 | S~M |
| C11 | **캘린더 히트맵**(일별 가용성/에러 버짓 30~90일) | SLO·합성 | ECharts `calendar` + heatmap ✅ 내장 | — | ✅ 내장(신규 개방) | S |
| C12 | **sankey/의존 흐름**(서비스 → 외부/DB) | 외부 호출·개요 | ECharts sankey ✅ 내장 | — | ✅ 내장(신규 개방) | S |
| C13 | **treemap**(에러 유형×건수, 쿼리 그룹×총시간) | 에러·DB | ECharts treemap ✅ 내장 | — | ✅ 내장(신규 개방) | S |
| C14 | **간트/배치 실행 타임라인**(작업 × 실행 구간, 성공/실패 색) | 메시징·배치 | ECharts custom(공식 gantt 예제) ✅ 또는 C7 워터폴 재사용 | — | ✅ custom 또는 C7 재사용 | S(재사용 시) |
| C15 | **로그 뷰어**(수만 행 가상 스크롤, 레벨 색, trace_id 필터, 시간 히스토그램) | 로그 탭 | antd Table `virtual` ✅ + C2 히스토그램 | `react-window`(MIT) 대안 | ✅ antd virtual(의존 추가 0) | M |
| C16 | **SQL/스택트레이스 뷰어**(포맷·하이라이트·복사) | DB·에러 | 포맷터 **추가 필요**; 하이라이트는 경량 토크나이저 | `sql-formatter`(MIT) · `prismjs`(MIT) | ✅ **sql-formatter 추가(MIT)** + 자체 토크나이저 | S |
| C17 | **스파크라인/StatCard**(작은 line + 수치 + 전기간 대비 %) | 개요·목록·홈 위젯 | 기존 `StatCard` + ECharts mini line ✅ | — | ✅ 기존 확장 | S |
| C18 | **전후 비교 bar**(배포 전/후 p95·오류율·rps, 두 기간) | 배포·트레이스 비교 | ECharts bar ✅ (계산은 BE) | — | ✅ 내장 | S |

**새로 추가되는 FE 의존성**: `@dagrejs/dagre`(MIT) · `sql-formatter`(MIT) — 2개, 둘 다 MIT. **직접 구현 1건**: C7 트레이스 워터폴. 그 외 전부 보유 스택.

**BE 쪽 구현 가능성**

| 항목 | 수단 | 판정 |
|---|---|---|
| OTLP json 파싱(metrics/traces/logs) | 기존 `aimonitor/otel` 파서 확장(버킷·exemplar·스팬·로그 레코드) | ✅ 보유, 의존 추가 0 |
| 히스토그램 → p50/p95/p99 | explicit bucket 선형 보간(직접, 60줄). HdrHistogram 불필요 | ✅ 직접 S |
| 롤업·파티션·보존 | PG 네이티브 파티션 + 앱 배치가 파티션 생성/드롭(pg_partman 불요) | ✅ 직접 M |
| tail 샘플링·배치·큐 | OTel Collector contrib(Apache-2.0) 내장 프로세서 | ✅ OSS |
| 예외 그룹 지문 | `exception.type` + 메시지 정규화(숫자·ID 치환) sha256 | ✅ 직접 S |
| SQL 정규화(리터럴 → `?`) | 정규식 기반 직접(간단) — 정확도 요구 높으면 JSqlParser(Apache-2.0) | ✅ 직접 S(라이브러리는 보류) |
| 서비스 맵 엣지 파생 | CLIENT 스팬 `peer.service`/`server.address` + 부모-자식 서비스 조인 5분 롤업 | ✅ 직접 M |
| 크리티컬 패스 | 트레이스 트리에서 자식 구간 제외 자기 시간 최대 경로(직접, 80줄) | ✅ 직접 S |
| SLO·에러 버짓·번 레이트 | 우리 집계(SLI = 성공/전체 or p95<목표), 멀티윈도우 번 레이트(1h/6h) | ✅ 직접 M |
| 알람 배달 | Zabbix 7.0 `history.push`(R10 실측) | 🟡 실측 후 확정, 폴백 zabbix_sender 프로토콜 직접(S) |
| RUM 수신 | Collector http receiver **CORS 설정 내장** → 브라우저 → Collector → BE | ✅ OSS |
| K8s 컨텍스트 | Collector `k8sattributes`·`kubeletstats`·`k8s_cluster` receiver | ✅ OSS(Phase 4) |
| 로그 저장 | 로그 도메인 설계와 공유(미정) — 최소는 PG 파티션 + GIN | 🟡 로그 도메인 설계 선행 |

---

## 3. 메뉴별 화면·차트 명세

표기: `C#` = §2 프리미티브, 데이터 = BE 집계 출처, Phase = §1.3.

### 3.1 APM 개요 (메뉴 1) — Phase 1

| 위젯 | 차트 | 데이터 | Phase |
|---|---|---|---|
| 서비스 상태 요약 | C3 도넛(UP/DEGRADED/DOWN/STALE) + 숫자 | `apm_service` 상태 판정 | 1 |
| 전체 rps / 오류율 / p95 / 액티브 요청 | C17 StatCard×4(전일 동시간 대비 %) | `apm_metric_5m` 합산 | 1 |
| 서비스 × 시간 상태 히트맵 | C5 heatmap(행=서비스, 열=5분, 색=상태/오류율) | `apm_metric_5m` | 1 |
| 느린 서비스 Top 5 / 오류 많은 Top 5 | C2 수평 bar | 〃 | 1 |
| 최근 알람 | 리스트(알람 규칙 발화 이력) | `apm_alert_event` | 1 |
| 배포 스트립 | C10(배포 시각 마커) | `apm_deployment` | 2 |
| 에러 버짓 위험 SLO | C4 게이지 소형 ×N | SLO 집계 | 3 |
| 서비스 맵 미니 | C9 축소(읽기 전용) | 엣지 롤업 | 2 |

### 3.2 서비스 목록 (메뉴 2) — Phase 1
카드/테이블 토글(호스트 그룹 화면 패턴). 컬럼: 상태·표시명·env·rps·오류율·p95·인스턴스 수·버전·마지막 수신·24h 스파크라인(C17). 필터 env/tag/hidden/상태. 빈 상태 = 온보딩(수집기 설정 → 앱 한 줄 → 실시간 수신 대기 스피너).

### 3.3 서비스 상세 — 개요 탭 — Phase 1

| 위젯 | 차트 |
|---|---|
| 요청수(rps) | C1 area |
| 오류율 | C1 line + 임계 markLine + 배포 markLine(P2) |
| 응답시간 | C1 p50/p95/p99 3선 + 밴드 |
| 응답시간 분포 | C5 heatmap(시간 × 지연 버킷) |
| Apdex | C4 게이지(T값 서비스 설정, 기본 0.5s) |
| 액티브 요청 | C1 area(`http.server.active_requests`) |
| 가용성 스트립(24h) | C10 |
| 인스턴스 미니카드 | 카드 N(상태·버전·호스트 링크) |
| 상위 느린 엔드포인트 5 / 상위 오류 5 | C2 수평 bar → 트랜잭션 탭 딥링크 |

### 3.4 서비스 상세 — 트랜잭션(엔드포인트) 탭 — Phase 1(산점도는 P2)

| 위젯 | 차트 |
|---|---|
| 엔드포인트 표 | DmoveTable(route·method·호출수·rps·p50/p95·오류율·인라인 bar), 정렬·검색, `__other__` 경고 배지 |
| 선택 엔드포인트 RED | C1 ×3(요청·오류·지연) |
| 상태코드 분포 | C2 stacked bar(2xx/3xx/4xx/5xx × 시간) |
| 메서드 분포 | C3 |
| 응답시간 산점도 | C6(점 클릭/브러시 → 트레이스 목록) [P2] |

### 3.5 서비스 상세 — 트레이스 탭 / 트레이스 탐색(메뉴 4) — Phase 2

| 위젯 | 차트 |
|---|---|
| 산점도(지연 × 시각, 색=오류) | C6 large + brush |
| 트레이스 목록 | 테이블(루트명·시작·지연·스팬 수·서비스 수·오류·`sampled` 배지) |
| 트레이스 상세 — 워터폴 | **C7 직접 구현**(스팬 트리·막대·크리티컬 패스·클릭 → 속성/이벤트/로그 패널) |
| 트레이스 상세 — 플레임 | C8 |
| 트레이스 내 서비스별 시간 비율 | C2 수평 stacked |
| 트레이스 비교(정상 vs 느림) | 워터폴 2단 + C18 |
| 검색(메뉴 4) | 서비스·엔드포인트·상태·지연 범위·속성 key=value·trace_id 직접 입력 |

### 3.6 서비스 상세 — 에러 탭 / 에러 분석(메뉴 5) — Phase 2

| 위젯 | 차트 |
|---|---|
| 예외 그룹 표 | 지문·타입·메시지·건수·영향 엔드포인트 수·첫/마지막 발생·추세 스파크라인(C17) |
| 에러 추이 | C2 stacked bar(유형별 × 시간) + 배포 markLine |
| 유형 분포 | C13 treemap |
| 그룹 상세 | 스택트레이스 뷰어(C16) + 발생 엔드포인트 표 + 예시 트레이스 링크(워터폴) |
| 에러 버짓 영향 | C4 소형(SLO 연동, P3) |

### 3.7 서비스 상세 — 데이터베이스 탭 / DB 호출 분석(메뉴 6) — Phase 2

| 위젯 | 차트 |
|---|---|
| 쿼리 그룹 표 | 정규화 SQL(요약)·`db.system`·호출수·평균/p95·총 시간·오류·인라인 bar |
| 슬로우 쿼리 추이 | C1(임계 초과 건수) |
| DB별 호출 분포 | C3 / C12 sankey(서비스 → DB) |
| 커넥션 풀 | C1 stacked area(active/idle/pending) + wait_time p95 |
| 쿼리 상세 | C16 SQL 포맷 뷰 + 호출 엔드포인트 표 + 예시 트레이스 |
| (DB 모니터링 2단계 링크) | DB 인스턴스 화면으로 점프(§2.4 경계) |

### 3.8 서비스 상세 — 외부 호출 탭 / 외부 호출 분석(메뉴 7) — Phase 2

| 위젯 | 차트 |
|---|---|
| 의존 대상 표 | `server.address`·호출수·p95·오류율·타임아웃 수 |
| 대상별 지연·오류 | C1 ×2 |
| 의존 흐름 | C12 sankey(서비스 → 외부/DB/큐) |
| 상관 | "이 대상이 느릴 때 우리 p95" 산점도 C6(옵션) |

### 3.9 서비스 상세 — 런타임 탭 — Phase 1(JVM), 런타임별 대응표

| 런타임 | 위젯 · 차트 |
|---|---|
| **JVM** | heap used/committed/max C1 area · non-heap C1 · GC 횟수 C2 + GC pause p95 C1 듀얼축 · 스레드 수(상태별 stacked) C2 · CPU utilization C1 · 클래스 로딩 C1 · 풀(§3.7과 공유) |
| **.NET** | GC gen0/1/2 수집 횟수 C2 · heap size C1 · 스레드풀 큐 길이 C1 · exceptions/s C1 · JIT 컴파일 시간 |
| **Node** | event loop delay p95 C1 · heap used C1 · 활성 핸들/요청 C1 · GC pause C1 |
| **Python** | 프로세스 CPU/메모리 C1 · GC 수집 횟수(gen별) C2 · 스레드 수 |
| **Go** | goroutine 수 C1 · heap alloc C1 · GC pause C1 |
| 공통 | `process.cpu.utilization`·`process.memory.usage` C1, 인스턴스별 small multiples(C1 소형 N개) |

대응표는 BE 허용목록(`devdesign_apm.md` §4.3)에 런타임별 메트릭명으로 추가한다.

### 3.10 서비스 상세 — 인스턴스 탭 — Phase 1
인스턴스 표(id·호스트(서버 모니터링 링크)·버전·시작 시각·마지막 수신·rps·p95·오류율) · 인스턴스별 C1 small multiples · 버전 분포 C2 · 인스턴스 상태 스트립 C10 · (P4) 파드/노드·재시작 횟수 배지.

### 3.11 서비스 상세 — 배포 탭 — Phase 2
배포 목록(버전·시각·출처=자동감지/웹훅·인스턴스 롤아웃 비율) · 배포 타임라인 C10 · **전후 비교** C18(배포 전 1h vs 후 1h: p95·오류율·rps) · 배포 이후 새로 등장한 예외 그룹 표(§3.6 조인).

### 3.12 서비스 상세 — 로그 탭 — Phase 4
C15 뷰어(레벨·시간·trace_id 필터, 워터폴에서 "이 스팬의 로그" 진입) · 레벨별 시간 히스토그램 C2.

### 3.13 서비스 상세 — 합성 감시 탭(바인딩) · 설정 탭 — Phase 3 / 1
합성: 바인딩된 Zabbix 웹 시나리오의 가용성 스트립 C10 + 단계별 응답시간 C2 stacked(§3.16 재사용). 설정: 표시명·env·태그·담당자·Apdex T·숨김·알람 규칙 덮어쓰기·SLO 링크·호스트 수동 매핑.

### 3.14 서비스 맵 (메뉴 3) — Phase 2
C9 React Flow + dagre. 노드 유형: 서비스·DB·외부 HTTP·큐/토픽·(P4) 브라우저. 엣지: 굵기=rps, 색=오류율, 라벨=p95. 사이드패널: 선택 노드 RED 미니 C1×3. 시간 범위 선택 시 재집계. 필터 env. 레이아웃 저장(사용자별, 네트워크 맵 V7 문서형 패턴 재사용 가능). 애니메이션 엣지는 React Flow 내장.

### 3.15 메시징·배치 (메뉴 8) — Phase 3
큐/토픽 표(시스템·이름·발행/소비 rps·소비 지연 p95·오류) · 처리량·지연 C1 · **소비 지연(발행→수신)** C1 · 배치 작업 표(이름·마지막 실행·성공률·평균 시간) · 배치 실행 타임라인 C14 · 실패 실행 → 트레이스 링크.

### 3.16 합성 감시 (메뉴 9) — Phase 3 (수집은 Zabbix)
시나리오 표(이름·대상 URL·주기·프록시·최근 상태·24h 가용성·p95) · 생성/수정 폼(단계·기대 코드·필수 문자열·헤더·인증·변수) · 단계별 응답시간 C2 stacked · 응답코드 타임라인 C10 · 30일 가용성 캘린더 C11 · 프록시(지역)별 비교 C2 · 실패 사유 매핑 표(Zabbix 에러 → 친절 문구).

### 3.17 SLO (메뉴 10) — Phase 3
SLO 표(서비스·SLI 유형(가용성/지연)·목표·창(7/30일)·현재 SLI·남은 버짓·번 레이트) · 에러 버짓 게이지 C4 · 버짓 소진 곡선 C1(번다운) · SLI 추이 C1 + 목표 markLine · 30일 캘린더 C11 · 번 레이트 알람(1h/6h 멀티윈도우) 설정.

### 3.18 사용자 경험 RUM (메뉴 11) — Phase 4
페이지 표(URL 패턴·PV·LCP/INP/CLS p75·JS 에러) · Web Vitals 분포 C2(good/needs/poor 임계 색) · 페이지 로드 워터폴(navigation/resource timing → C7 재사용) · 브라우저/OS/지역 C3 · 세션·PV 추이 C1 · 프론트 스팬 → 백엔드 트레이스 연결(워터폴 상단에 브라우저 스팬).

### 3.19 알람 규칙 (메뉴 12) — Phase 1
규칙 표(범위=전역/서비스·종류·임계·창·채널=Zabbix 트리거 링크·활성) · 규칙 편집 폼 + **미리보기**(최근 24h 실제 시계열 C1 위에 임계 markLine, "이 값이면 n회 발화") · 발화 이력 C10 + 표 · Zabbix 트리거 동기화 상태 배지.

### 3.20 수집기 (메뉴 13) — Phase 1
Collector 표(id·버전·마지막 수신·큐 적체·전송 실패·토큰) · 수신량 C1(metrics/traces/logs per min) · 큐·실패 C1/C2 · 연결 상태 C10 · **설정 생성기**(토큰·BE 주소·샘플링·느림 임계·스택 체크 → yaml 다운로드/복사) · **설치 가이드**(OS별 Collector + 스택별 앱 한 줄, 에이전트 설치 가이드 패턴) · "최근 60초 수신" 검증 버튼 · 폐기 메트릭 표(받았지만 허용목록 밖) · `unknown_service` 목록.

### 3.21 홈 위젯 · 리포트 · AI
- 홈 위젯 3: 서비스 상태 도넛(C3) · 느린 엔드포인트 Top5(C2) · APM 알람(리스트). 위젯 카탈로그 +3.
- APM 리포트(설정>리포트 체계, 주간/월간): 서비스별 가용성·p95·오류율·배포 수·상위 예외·SLO 달성 — 기존 `ReportChart` 재사용, PDF(jspdf 보유).
- AI 툴 8: `apm_list_services`·`apm_service_status`·`apm_slow_endpoints`·`apm_error_groups`·`apm_slow_queries`·`apm_trace_lookup`·`apm_service_map`·`apm_collector_status` + "느려진 원인 브리핑"(알람 인텔리전스 패턴, 사용자 클릭 시 생성).

---

## 4. 작업 분해 (WBS)

규모: **S** 0.5~1일 · **M** 2~3일 · **L** 4~6일 · **XL** 7일+. 선행은 ID. 모든 태스크는 "검증" 열이 통과해야 완료. 커밋 단위는 태스크 1~3개 묶음, 메시지 `#ZM-?? [FEAT] …`(티켓 발급 필요).

### WS-0 기반 파이프라인 (Phase 1)

| ID | 태스크 | 규모 | 선행 | 산출물 / 검증 |
|---|---|---|---|---|
| 0.1 | **R1 실측 (최우선, v1.1 순서 정정)**: 고정 `otelcol-contrib` 버전 선정 → `otlphttp encoding: json`으로 metrics·traces·logs 세 경로 round-trip(explicit/exponential 히스토그램·exemplar·event/link·resource/scope·gzip·413 경계) — BE 자기 자신에 `-javaagent` | M | — | **실 페이로드 픽스처 세트**(파서·스키마의 정본이 됨) + 버전 고정 기록. 실패 시 Q3 protobuf로 회귀 |
| 0.2 | `aimonitor/otel/` → `otel/` 공용 승격(파서·모델·컨트롤러 베이스), aimonitor 회귀 | M | — | 기존 OTLP 테스트 6개 green |
| 0.3 | 파서 확장: 히스토그램 버킷·bounds·exponential→정규 경계 변환·exemplar·`resource`·`scope` 보존, `Point` 모델 확장 | L | 0.1·0.2 | 0.1 픽스처 전량 파싱 테스트 |
| 0.4 | 수신 토큰 엔티티·발급(원문 1회)/회수 API·Bearer 대조·403(라이선스) + **관리자 권한 매핑**(발급·회수·설정·마스킹 opt-in) | M | 0.2 | 컨트롤러 테스트(200/401/403/413/415) + 권한 테스트 |
| 0.5 | `POST /apm/otlp/v1/metrics` 수신 컨트롤러(8MB 상한·gzip·dedup·temporality 정규화) | M | 0.3·0.4 | DELTA/CUMULATIVE 픽스처 |
| 0.6 | 서비스·인스턴스 **등록 엔진**: `(name, env)` 정규화·불변 UUID·등록 모드 3종(AUTO/APPROVE/ALLOWLIST)·`unknown_service` 격리·자동 숨김 TTL 배치 | L | 0.5·0.7 | 동시 배치 100건 upsert 경합 + 모드별 테스트 |
| 0.7 | Flyway **V36**(설계서 §7 표 그대로: `apm_service`·`apm_instance`·`apm_receive_token`·`apm_collector`·`apm_hist_bounds`·`apm_metric_1m/5m/1h` 파티션·`apm_ingest_drop_stat`·`apm_pending_service`·`apm_alert_rule`·`apm_alert_event`·`apm_setting`) | M | — | dev DB 적용·롤백 스크립트 |
| 0.8 | 허용목록·정규화 엔진(메트릭명·차원 화이트리스트, status class 접기, route 500 상한·`__other__`, **canonical dims JSON + dims_hash**, 폐기 카운터·사유) | M | 0.5 | 카디널리티 폭주·해시 충돌 픽스처 |
| 0.9 | 1m 버킷 적재(upsert, 멱등) + **정규 경계 재버킷** | M | 0.7·0.8 | 재전송 시 중복 0, 재버킷 오차 테스트 |
| 0.10 | Collector 설정 템플릿 정본(yaml: 자기 메트릭 scrape·마스킹 체인·file_storage·tail 샘플링) + **`POST /apm/collector-config`** 생성기(no-store) | M | 0.1 | 생성 yaml로 Collector 기동 → 수신 확인 |
| 0.11 | Collector 상태 집계(`apm_collector` — `otelcol_*` 자기 메트릭에서 마지막 수신·큐·실패·샘플링 드롭) | S | 0.10 | |
| 0.12 | ArchUnit: `premium/apm` 격리·`otel/` 프리미엄 비의존 | S | 0.2 | 테스트 green |
| 0.13 | **마스킹 검증(R14)**: PII 심은 샘플 요청 → Collector 체인 → BE 저장까지 SQL·예외·URL·헤더 원문 0건 확인 + BE 측 절단(4KB)·opt-in 감사 로그 | M | 0.10 | DB grep 0건 |
| 0.14 | **R11 실측**: Collector의 401/403/413/429/5xx 재시도·file_storage 잔존·재기동 동작 → §4.1 만료 정책 문구 확정 | S | 0.10 | 보고서 |

### WS-1 저장·집계 (Phase 1)

| ID | 태스크 | 규모 | 선행 | 검증 |
|---|---|---|---|---|
| 1.1 | 파티션 관리 배치(일 파티션 선생성·보존 초과 drop) | M | 0.7 | 경계일 테스트 |
| 1.2 | 롤업 배치 1m→5m→1h(히스토그램 버킷 합산·min/max·count/sum) | M | 0.9 | 롤업 전후 p95 오차 검증 |
| 1.3 | 퍼센타일 계산기(버킷 선형 보간 p50/p95/p99) + Apdex | S | 0.2 | 알려진 분포로 단위 테스트 |
| 1.4 | 서비스 상태 판정기(UP/DEGRADED/DOWN/STALE) + 24h 가용성 | S | 1.3 | |
| 1.5 | 시계열 질의 계층(`ApmMetricStore`: 기간·해상도 자동 선택 1m/5m/1h, 서비스/route/instance 필터) | M | 1.2 | 90일 질의 1s 이내 |
| 1.6 | 런타임 대응표(JVM/.NET/Node/Python/Go 메트릭명 → 화면 슬롯) | S | 0.8 | |
| 1.7 | 볼륨 실측(R3): 합성 부하 10서비스×**인스턴스 3**×50route + 런타임 메트릭 24h → 행수·인덱스 크기·롤업 시간·90일 query plan → §4.6 승격 수치 확정 | M | 1.5 | 보고서 |
| 1.8 | 정규 히스토그램 경계 정본(패밀리별 bounds)·재버킷 오차 측정(1m→5m→1h p95 오차) | S | 0.9 | 오차 < 5% 목표 |
| 1.9 | **R12 실측**: Java/.NET/Node/Python 자동계측 기본 조합에서 `active_requests`·풀·`db.client.operation.duration` 실제 수집 여부 → 런타임 대응표 확정 | M | 0.1 | 스택별 샘플 앱 4개 |

### WS-2 알람·Zabbix 연동 (Phase 1·3)

| ID | 태스크 | 규모 | 선행 | 검증 |
|---|---|---|---|---|
| 2.1 | **R10 실측**: Zabbix 7.0 `history.push` → 트래퍼 아이템 → 트리거 → 미디어 round-trip(데모 Zabbix) + 사용자가 트리거 수정·삭제 후 동기화 결과 + API 권한 | S | — | 슬랙/메일 도달 스크린샷 1장 + 드리프트 시나리오 표 |
| 2.2 | `engine-api zabbix/` **`history.push` 계약 1개**(값 적재, APM 어휘 없음) + `engine-zabbix` 구현 — 프로비저닝은 포트 추가 없이 기존 `zabbixadmin` 관리 서비스 재사용(설계서 §1.4 v3.1) | S | 2.1 | round-trip 테스트 |
| 2.3 | `premium/apm/alert/bridge/ZabbixAlertBridge`: 가상 호스트 "MovesEye APM"·트래퍼 아이템(키=UUID)·트리거 생성, 소유 태그, 매핑 저장 | M | 2.2 | 생성·재생성·삭제 멱등 |
| 2.8 | **드리프트 동기화 배치**(일 1회+규칙 변경 시): 표현식 대조 → `drift` 배지, OURS/THEIRS 해소 API, 삭제 시 재생성·감사 로그, 호스트 그룹·액션 진단 | M | 2.3 | R10 드리프트 시나리오 표 전건 |
| 2.3b | `ApmAlertService`: 규칙 평가(오류율·p95·STALE·수집기 실패·SLO 번 레이트) 5분 배치 → push | M | 1.4·2.3 | 임계 경계 테스트 |
| 2.4 | 규칙 CRUD API + 미리보기 API(최근 24h 시계열 + 발화 횟수 시뮬레이션) | M | 2.3 | |
| 2.5 | 발화 이력(`apm_alert_event`) + Zabbix 이벤트 ID 연결(Problem 화면 상호 링크) | S | 2.3 | |
| 2.6 | 합성 감시 계약: `httptest` 읽기/쓰기(`zabbix/` 전용) + 결과 아이템 카탈로그(`web.test.*`) + 친절 에러 매핑 | M | — | 실 Zabbix 생성→수정→삭제(한글 이름) |
| 2.7 | 서비스 ↔ 웹 시나리오 바인딩 + 합성 가용성 집계 | S | 2.6·0.6 | |

### WS-3 트레이스 (Phase 2)

| ID | 태스크 | 규모 | 선행 | 검증 |
|---|---|---|---|---|
| 3.1 | 파서: OTLP traces(스팬·이벤트·링크·status) | M | 0.2 | Java agent 실 트레이스 픽스처 |
| 3.2 | V37(설계서 §7 표 그대로): `apm_span`(일 파티션·jsonb attrs·GIN)·`apm_trace_summary`·`apm_service_edge_5m`(히스토그램 벡터)·`apm_error_group`(+`_1h`)·`apm_db_query_group`(+`_5m`)·`apm_dependency_5m`·`apm_deployment` | M | — | |
| 3.3 | `/v1/traces` 수신 + 스팬 적재 + 트레이스 요약 갱신(지연 도착 스팬 병합) | L | 3.1·3.2 | 스팬 순서 뒤섞임 픽스처 |
| 3.4 | Collector tail 샘플링 정책 템플릿(오류·느림·확률) + 설정 생성기 옵션 | S | 0.10 | 오류 트레이스 100% 도달 |
| 3.5 | 서비스 맵 엣지 롤업(5분) + 노드 유형 판정(DB/외부/큐) | M | 3.3 | 알려진 토폴로지 픽스처 |
| 3.6 | 예외 그룹화(지문·정규화·첫/마지막·영향 엔드포인트) | M | 3.3 | 메시지 변형 100건 → 그룹 1 |
| 3.7 | DB 쿼리 그룹화(SQL 정규화·`db.system`·통계) | M | 3.3 | 리터럴 변형 정규화 테스트 |
| 3.8 | 외부 의존 집계(`http.client` + CLIENT 스팬, 타임아웃 판정) | S | 3.3 | |
| 3.9 | 크리티컬 패스 계산 + 트레이스 상세 API(트리 조립) | M | 3.3 | 깊이 50 트리 |
| 3.10 | 산점도 API(기간 내 트레이스 점 다운샘플, 브러시 범위 → 목록) | M | 3.3 | 5만 점 200ms |
| 3.11 | 배포 감지(`service.version` 변화) + 웹훅 `POST /apm/services/{id}/deployments` + 전후 비교 API | M | 0.6·1.5 | |
| 3.12 | exemplar(trace_id) 보존 → "p95 막대 → 트레이스" API | S | 0.2·3.3 | R1에서 exemplar 실림 확인 조건부 |
| 3.13 | 트레이스 비교 API(두 trace 정렬 diff) | S | 3.9 | |
| 3.14 | 보존·파티션 drop(7일) + 볼륨 실측(R2·R3 트레이스) | S | 3.2·1.1 | |

### WS-4 운영 심화 BE (Phase 3)

| ID | 태스크 | 규모 | 선행 | 검증 |
|---|---|---|---|---|
| 4.1 | SLO 모델·V38(`apm_slo`·`apm_slo_snapshot`)·SLI 계산(가용성/지연)·에러 버짓·멀티윈도우 번 레이트 | L | 1.5 | 알려진 시계열로 버짓 수치 검증 |
| 4.2 | 메시징 집계(`messaging.*` 스팬·메트릭 → 큐/토픽 표·소비 지연) | M | 3.3 | Kafka 픽스처 |
| 4.3 | 배치 작업 집계(루트 INTERNAL 스팬 규약 `job.name` → 실행 이력) + 규약 문서 | M | 3.3 | |
| 4.4 | APM 리포트 배치(주간/월간 스냅샷, 기존 리포트 체계 편입) | M | 1.5·4.1 | |
| 4.5 | 홈 위젯 3종 API(HealthPort 패턴) | S | 1.4 | |
| 4.6 | moveseye-ai 툴 8 + screens.json + 원인 브리핑 프롬프트 | M | WS-3 API | 툴 테스트 |

### WS-5 확장 BE (Phase 4)

| ID | 태스크 | 규모 | 선행 | 검증 |
|---|---|---|---|---|
| 5.1a | RUM 보안 계층(설계서 §15): 공개 RUM 토큰·origin allowlist·CORS preflight·레이트리밋·`traceparent`만 허용·PII 제거(`url.query`·IP·ID 정규화) — BE `/apm/rum/v1/*` 직접 수신 | L | 0.4 | origin 우회·토큰 오용·429 테스트 |
| 5.1b | RUM 수집·집계: 브라우저 스니펫 가이드(OTel Web SDK + web-vitals, CSP·동의 훅) + Web Vitals/navigation/JS 에러 허용목록 + 페이지 그룹화 + `apm_rum_page_5m` | L | 5.1a·3.3 | 데모 FE에 스니펫 → 수신 |
| 5.2 | 로그: `/v1/logs` 수신 + 저장(로그 도메인 설계와 합의) + trace_id 인덱스 + 조회 API — 🔴 **로그 도메인 설계(`devdesign_log-domain.md`, 미작성)가 선행**이라 P4 공수 합계에서 제외 | L(별도) | 로그 도메인 설계 | |
| 5.3a | K8s 선행 인프라 과제(별도): Collector 배포 토폴로지(DaemonSet vs Deployment)·RBAC/ServiceAccount·멀티 클러스터 식별·보안 검증 — **인프라 과제로 분리, P4 합계 제외** | L(별도) | 테스트 클러스터 | 배포 가이드 |
| 5.3b | K8s 컨텍스트: `k8sattributes`·`kubeletstats`·`k8s_cluster` 템플릿 + 파드/노드 속성 보존 + 재시작/OOM 배지 | M | 5.3a·0.10 | |

### WS-6 FE 공통 부품 (Phase 1~2)

| ID | 태스크 | 규모 | 선행 | 검증 |
|---|---|---|---|---|
| 6.1 | 라우트·SideNav 하위 그룹 13·`FeatureGate`·브레드크럼 3단·i18n 네임스페이스 `apm.*` | M | — | 라우트 스냅샷 테스트 |
| 6.2 | 공통 상단: 시간 범위(프리셋+커스텀)·자동 새로고침·env 필터·서비스 셀렉터(URL query state — 리마운트 교훈) | M | 6.1 | |
| 6.3 | ECharts 옵션 빌더 신규 7종: heatmap(C5)·scatter large+brush(C6)·flame custom(C8)·calendar(C11)·sankey(C12)·treemap(C13)·gantt custom(C14) + 팔레트/다크모드 준수 | L | — | 스토리성 데모 페이지 + jest 옵션 스냅샷 |
| 6.4 | C1 확장: p50/p95/p99 밴드·임계 markLine·배포 markLine·듀얼축 옵션 빌더 | M | — | |
| 6.5 | **트레이스 워터폴 C7 직접 구현**(스팬 트리·가상 행·막대·접기·정렬·크리티컬 패스·선택 패널·키보드·미니맵·성능) — v1.1 **XL**(코덱스 A7) | XL | — | 2,000 스팬 렌더 60fps, jest 상호작용, 접근성 |
| 6.6 | 서비스 맵 C9: React Flow 노드/엣지 컴포넌트 + `@dagrejs/dagre` 레이아웃 + 사이드패널 + 레이아웃 저장 + 시간 재집계 — v1.1 **XL** | XL | — | 100노드 레이아웃·재집계 1s |
| 6.7 | `InstanceTimeline` → 범용 상태 스트립 C10 일반화 | S | — | 기존 AWS 화면 회귀 |
| 6.8 | C16 SQL/스택트레이스 뷰어(`sql-formatter` + 토크나이저 + 복사) | S | — | |
| 6.9 | C15 로그 뷰어(antd Table virtual) | M | — | 5만 행 스크롤 |
| 6.10 | `StatCard` 스파크라인·전기간 대비 확장(C17) | S | — | |
| 6.11 | API 클라이언트·타입·react-query 훅(계약서 `features/apm/core/contract_apm.md` 기준, 언랩 깊이 교훈) | M | BE API | integration-qa |

### WS-7 FE 화면 (메뉴별)

| ID | 화면 | 규모 | 선행 | Phase |
|---|---|---|---|---|
| 7.1 | APM 개요(§3.1) | M | 6.3·6.10 | 1 |
| 7.2 | 서비스 목록 + 온보딩 빈 상태(§3.2) | M | 6.2 | 1 |
| 7.3 | 서비스 상세 골격(탭 12·헤더·상태) + 개요 탭(§3.3) | L | 6.4·6.7 | 1 |
| 7.4 | 트랜잭션 탭(§3.4) | M | 7.3 | 1(산점도 2) |
| 7.5 | 런타임 탭(§3.9, 런타임별 슬롯) | M | 7.3 | 1 |
| 7.6 | 인스턴스 탭(§3.10) | S | 7.3 | 1 |
| 7.7 | 설정 탭(§3.13) | S | 7.3 | 1 |
| 7.8 | 알람 규칙(§3.19, 미리보기 포함) | M | 6.4 | 1 |
| 7.9 | 수집기(§3.20: 상태·토큰 발급 1회 표시 UX·설정 생성기(POST)·설치 가이드·검증 버튼·폐기 표·`unknown_service`·승인 대기·진단 번들) — v1.1 **XL** | XL | 6.7 | 1 |
| 7.9b | 라이선스 만료 UX: D-14/7/1 배너 문구·"수집기 중지·토큰 회수" 버튼·FAQ | S | 7.9 | 1 |
| 7.10 | 트레이스 탭 + 트레이스 탐색(§3.5: 산점도·목록·워터폴·플레임·비교) | L | 6.3·6.5 | 2 |
| 7.11 | 에러 탭 + 에러 분석(§3.6) | M | 6.8 | 2 |
| 7.12 | DB 탭 + DB 호출 분석(§3.7) | M | 6.8 | 2 |
| 7.13 | 외부 호출 탭 + 분석(§3.8) | S | 6.3 | 2 |
| 7.14 | 배포 탭(§3.11) | S | 6.7 | 2 |
| 7.15 | 서비스 맵(§3.14) | M | 6.6 | 2 |
| 7.16 | 메시징·배치(§3.15) | M | 6.3 | 3 |
| 7.17 | 합성 감시(§3.16: 표·폼·차트) + 서비스 상세 합성 탭 | L | 2.6·6.7 | 3 |
| 7.18 | SLO(§3.17) | M | 6.3 | 3 |
| 7.19 | 홈 위젯 3 + 위젯 카탈로그 | S | 4.5 | 3 |
| 7.20 | APM 리포트 화면(리포트 체계 편입) | M | 4.4 | 3 |
| 7.21 | RUM(§3.18) + RUM 토큰/origin 관리 화면 | L | 5.1b·6.5 | 4 |
| 7.22 | 로그 탭(§3.12) | M | 5.2·6.9 | 4 |
| 7.23 | K8s 배지·파드 컨텍스트(인스턴스 탭 확장) | S | 5.3 | 4 |

### WS-8 설치·문서·QA (전 Phase)

| ID | 태스크 | 규모 | Phase |
|---|---|---|---|
| 8.1 | Collector 설치 가이드(Windows 서비스 스크립트·Linux systemd·고정 버전·번들 동봉 Q11) + nginx location | M | 1 |
| 8.2 | 스택별 앱 계측 가이드(Java/.NET/Node/Python/Go, 브라우저 P4) | M | 1(P4 추가) |
| 8.3 | 고객 문서: `애플리케이션-모니터링.md`(메뉴별)·`수집기-설치.md`·소개서 로드맵 정정("Prom/Datadog 필요" 삭제, RUM/K8s 시점 표기) | M | 1~ |
| 8.4 | 화면 도움말 +13(도움말 체계) | M | 각 Phase |
| 8.5 | 계약서 `features/apm/core/contract_apm.md`(Phase별 누적) | S | 각 Phase |
| 8.6 | 정적 QA(integration-qa)·행위 QA(functional-qa) — Phase 끝마다 | M | 각 Phase |
| 8.7 | **self-monitoring 상시 검증**: `moveseye-be-spring`·`moveseye-ai`에 `-javaagent` 붙여 dev에서 자기 자신을 APM으로 감시(가장 싼 실데이터) | S | 1 |
| 8.8 | 부하·볼륨 QA(R2·R3): 합성 트래픽 생성기(k6 또는 JMeter, 스크립트만) | M | 2 |
| 8.9 | 진단 번들 내보내기(수집기 상태·최근 수신 샘플·설정 마스킹본 zip) | S | 3 |
| 8.10 | 라이선스 시나리오 QA(미보유 403·만료 READ_ONLY·Collector 재시도 상한) | S | 1 |

### 4.1 Phase별 합계(어림, v1.1 재산정 — 코덱스 A7 "과소")

| Phase | BE | FE | 설치·문서·QA | 합계(사람-일, 1인 기준) |
|---|---|---|---|---|
| P1 기반+메트릭 | WS-0 ~22(R1·등록 엔진·마스킹·R11 추가) · WS-1 ~15 · WS-2(2.1~2.5·2.8) ~12 | WS-6(6.1·6.2·6.3 일부·6.4·6.7·6.10·6.11) ~15 · WS-7(7.1~7.9b) ~26(수집기 XL) | ~12 | **~100일** |
| P2 트레이스 | WS-3 ~28 | WS-6(6.3 잔여·6.5 XL·6.6 XL·6.8) ~22 · WS-7(7.10~7.15) ~18 | ~9 | **~77일** |
| P3 운영 심화 | WS-2(2.6·2.7) ~4 · WS-4 ~17 | WS-7(7.16~7.20) ~15 | ~6 | **~42일** |
| P4 경험 확장 | WS-5(5.1a·5.1b·5.3b) ~14 | WS-6(6.9)·WS-7(7.21·7.23) ~10 | ~4 | **~28일** |
| **P4 제외분(별도 과제)** | 5.2 로그(로그 도메인 설계 선행) · 5.3a K8s 인프라 · 7.22 로그 탭 | | | 로그 도메인 설계 후 산정 |
| 총계 | | | | **~247 사람-일** + 로그/K8s 인프라 별도 (에이전트 병렬·재사용 감안 시 달력 기준 단축) |

숫자는 우선순위·병렬 배치용 어림이다. **P1 종료 시점에 R1·R3·R10·R11·R12 실측으로 P2 이후를 재산정**한다 — 특히 C7 워터폴·C9 맵은 프로토타입 1주 뒤 재추정.

### 4.2 착수 순서(첫 2주, v1.1 — R1이 파서보다 먼저)
1. **0.1 R1**(Collector 버전 고정·json 픽스처, 2~3일) · **2.1 R10** · **0.14 R11**(각 반나절) → 결과에 따라 0.3·2.2·§4.1 만료 정책 확정
2. 0.2 → 0.3 → 0.7 → 0.4 → 0.5 → 0.8 → 0.9 → 0.6 (수신 파이프라인 종단, 등록 엔진은 마지막)
3. 8.7 self-monitoring 켜기(이후 모든 화면 작업의 실데이터) + 0.13 마스킹 검증
4. 6.1 → 6.2 → 6.4 → 7.2 → 7.3 (첫 화면)

---

## 5. 열린 결정 (이 문서 고유 — `devdesign_apm.md` §11에 합류 예정)

| # | 질문 | 추천 |
|---|---|---|
| S1 | ~~메뉴 13개 전부 노출 vs 상위만~~ | **✅ v1.1 확정: 상위 6개 노출**(§1.2에 반영). 이후 P4에서 RUM 추가, **2026-09-16 사용자 결정으로 SLO도 사이드바에 노출**(⚙ 설정 메뉴 진입점은 유지 — 두 곳에서 열린다) |
| S2 | 워터폴(C7) 직접 구현 vs ECharts custom으로 타협 | **직접 구현** — 트리 접기·패널 연동이 핵심 UX |
| S3 | 서비스 맵 레이아웃 dagre(MIT) vs elkjs(EPL) vs ECharts force | **dagre** |
| S4 | RUM을 P4 대신 P2 직후로 앞당길지(경쟁 정의 3곳 모두 포함) | P4 유지 — 브라우저 스니펫은 고객 FE 배포가 필요해 도입 난도가 다르다 |
| S5 | 배치 작업 규약(`job.name` 속성)을 우리가 정의할지 OTel 시맨틱(없음) 대기 | 우리 규약 정의 + 가이드 |
