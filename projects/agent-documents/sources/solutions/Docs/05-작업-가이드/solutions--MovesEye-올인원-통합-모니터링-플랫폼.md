# MovesEye — 올인원 통합 모니터링 플랫폼

> **한 줄 요약**: Zabbix를 시작으로 Prometheus·Datadog·Elastic까지 여러 모니터링 데이터소스를 **하나의 운영 UX**로 감싸고, 그 위에 **자연어로 운영 작업을 수행하는 AI 어시스턴트**를 얹은 설치형(on-prem) 인프라 모니터링 제품.
> 기간: **2025-07 ~ 2026-08 (약 13개월, 본격 개발 2026-03~)** · 역할: 풀스택 설계·구현(BE/FE/AI 서버/라이선스 발급기) · 협업: Codex(검수)

---

## 0. 프로젝트 개요

| 항목 | 내용 |
|---|---|
| 기간 | 2025-07-29 착수 → 2026-08-21 현재 (약 13개월). 2025-07~2026-02 기초 구축, **2026-03~08 본격 개발** |
| 형태 | 사내 제품(DMOVE). 설치형(on-prem) 납품 전제, 프리미엄 라이선스 판매 모델 |
| 규모 | 저장소 5개 · 커밋 약 426(FE 206 · Spring BE 137 · Nest BE 54 · AI 25 · 발급기 4) · BE 엔드포인트 189 · FE 화면 30+ · AI 툴 52 |
| 역할 | 설계서 작성(ADR·미결 번호화) → BE/FE/AI 구현 → 정적·런타임 QA → 검수 인계까지 전 구간. 제품 결정(라이선스 정책·AI 안전 정책·엔진 방향)도 직접 |
| 이슈 트래킹 | Jira `ZM-*` 티켓 단위 커밋(`#ZM-XX [TYPE] 제목 -날짜`), Bitbucket Pipelines CI |

### 0.1 타임라인 — 언제 무엇을 했나

| 시기 | 작업 | 비고 |
|---|---|---|
| **2025-07 ~ 10** | 프로젝트 착수. NestJS BE + React FE 스캐폴드, Zabbix API 연동 기초, 커스텀 게이지 차트 | 초기 스택: NestJS 10 + TypeORM + Redis |
| **2025-12 ~ 2026-02** | 호스트 목록·상세, 인증(JWT), 호스트 UI 정리 | BE 17커밋 · FE 14커밋 |
| **2026-03** | FE 집중 개발 — 검색 조건·태그 CRUD, **i18n 언어팩**(ko/en), 로그 화면, **서버 위치 관리(맵뷰 멀티포인트·라인)** | FE 34커밋 |
| **2026-04** | 맵 폴리곤·팝업, 검색 필터·**엑셀 업로드**, 등록/비활성 서버 카운트, 자산관리·대시보드 카테고리 | FE 24커밋 |
| **2026-06** | **NestJS → Spring Boot 3.3 전량 변환**(06-10 첫 커밋 → 06-22 Spring 단일 채택 → 06-23 런타임 전환). 호스트 그룹 모니터링 재구성(가용성·건강도), 주/월 리포트 배치, 리포트 관리·retention, 라이브체크(ping/agent), 디스크 상세 폴백, 사이드바 리사이즈 | Spring 12 · Nest 31 · FE 26커밋 |
| **2026-07 상** | **자산 관리 코어**(스냅샷+동기화, 07-08), **네트워크 맵**(React Flow 작도, 07-13), **지리 맵**(MapLibre, 07-15), 내비 개편, 사용자 관리 재구성·호스트 등록 관리(07-16~18) | |
| **2026-07 하** | **Zabbix 관리 래핑** — 아이템·템플릿·트리거 CRUD, 드릴다운 IA, 전파 렌즈, 호스트 분류·태그(07-20~21). 홈 랜딩. 기기분류 DB 관리형(07-22). **수집 엔진 포트화 Phase 1**(07-22 방향 확정 → 07-29 전량 푸시, 스텝 0~5). 자산 비용 탭 설계(07-30) | Spring 58 · FE 20커밋 |
| **2026-08 상** | **비용(감가상각) 구현** + 일괄 업로드 비동기(08-03~07). **프리미엄 라이선스** v4 설계 확정(08-06) → 커널 구현·발급기 신설·FE 잠금 화면(~08-12). 설정 자격증명 AES-GCM 암호화(08-12) | |
| **2026-08 하** | 액션·미디어·매크로·Maintenance 래핑, **디스커버리·LLD 화면**(08-18~19), **홈 위젯 대시보드**(08-18), **AI 어시스턴트 서버**(08-18 설계 → 08-21 툴 52개·MCP 서버·OAuth), 내비/설정 개편(08-19), 디자인 시스템·다크모드·도움말 31개(08-20), 설치형·스케일아웃 아키텍처 진단(08-21) | Spring 67 · FE 77 · AI 24커밋 — 가장 밀도 높은 달 |

### 0.2 기술 스택

**프론트엔드 (`moveseyee_fe`)**
- React 19 · TypeScript · Vite(SWC) · React Router 6
- UI: Ant Design 5(+React 19 패치) · Emotion · Sass · Pretendard · FontAwesome
- 상태/데이터: TanStack Query 5(서버 상태) · Redux Toolkit + redux-persist(전역 UI 상태) · axios
- 시각화: ECharts 5(+echarts-gl) · React Flow(@xyflow 12, 네트워크 맵) · MapLibre GL 5 + react-map-gl(지리 맵) · react-grid-layout 2(위젯 대시보드)
- 기타: i18next(ko/en) · exceljs/jspdf/html-to-image(내보내기) · FingerprintJS(x-visitor-id)
- 품질: Jest + Testing Library · ESLint · Prettier · Husky + lint-staged · commitlint · Chromatic

**백엔드 (`moveseye-be-spring`)**
- Java 17 · Spring Boot 3.3 · Gradle Kotlin DSL 멀티모듈(`app` / `engine-api` / `engine-zabbix`)
- Spring Web · Data JPA · Security · Validation · Mail · Data Redis
- PostgreSQL + Flyway(V1→V25) · Redis(캐시·세션·잠금)
- java-jwt(인증 + RS256 라이선스 검증) · springdoc OpenAPI · AWS SDK v2(EC2·CloudWatch)
- AES-256-GCM 설정 암호화 · 스케줄러 배치(리포트 스냅샷·retention·이벤트 동기화)
- Docker · Bitbucket Pipelines

**AI 서버 (`moveseye-ai`)**
- Java 17 · **Spring Boot 4.0** · **Spring AI 2.0**(Anthropic / OpenAI / Ollama 모듈, 프로바이더 중립) · Jackson 3
- Spring AI MCP Server(Streamable-HTTP) + 자체 OAuth 2.1 인가 서버 · SSE 스트리밍
- JDBC + Flyway(AI 전용 히스토리 테이블) · Redis · Apache POI(xlsx 리포트 산출)

**라이선스 발급기 (`moveseye-license-issuer`)** — Java 17 · Gradle · RS256 JWT(개인키 격리, 별도 저장소)

**구 백엔드 (`moveseye-be`, 참조용)** — NestJS 10 · TypeORM · Redis · Bull · Socket.IO · Swagger → 2026-06 Spring으로 전량 이관

**외부 시스템** — Zabbix 7 API · AWS EC2/CloudWatch · OpenFreeMap 타일 · LLM(Claude / OpenAI 호환 / Azure / Ollama)

**개발 도구·방식** — Claude Code(에이전트 하네스: be-engineer / fe-engineer / integration-qa / functional-qa) · Codex(검수) · Chrome MCP(E2E 검증) · Jira · Bitbucket

---

## 1. 왜 만들었나

- Zabbix는 강력하지만 **화면이 어렵고 용어가 낯설다**. 운영자가 "이 서버 왜 느려?"를 알려면 호스트→아이템→트리거→이벤트를 따로 뒤져야 한다.
- 기업 고객은 Zabbix 하나만 쓰지 않는다. 수집 엔진은 언젠가 **다중 데이터소스**가 되어야 한다.
- 그래서 원칙을 하나 세웠다 — **"Zabbix를 쓰기 쉽게 감싼다. 우리 로직을 얹지 않는다."**
  - Zabbix가 못 해주는 것만 메꾼다: 계산값(가용성·건강도), 불친절한 에러 대체, 비밀값 마스킹, 문의 방지 문구.
  - 새 기능을 시작할 때 첫 질문은 항상 **"이거 Zabbix에 있나?"**

---

## 2. 전체 아키텍처

```
[브라우저] React 19 + Vite + Ant Design 5 + TanStack Query
     │ REST / SSE
     ├──▶ moveseye-be-spring (:3000)  Spring Boot 3.3 · JPA/Flyway · Redis
     │         └── engine-api(중립 포트) ──▶ engine-zabbix(구현) ──▶ Zabbix API
     │                                   ──▶ (Prometheus / Datadog / Elastic — 포트만 준비)
     └──▶ moveseye-ai (:3100)          Spring Boot 4 · Spring AI 2.0 · 툴 52개 · MCP 서버
               └── BE REST 프록시(사용자 인증 그대로 전달)

별도 저장소: moveseye-license-issuer (RS256 라이선스 키 발급, 사내 전용)
```

| 레포 | 스택 | 역할 |
|---|---|---|
| `moveseye-be-spring` | Spring Boot 3.3, PostgreSQL, Redis, Flyway(V1→V25) | API 정본. NestJS 원본을 Spring으로 전량 변환 후 단일 채택 |
| `moveseyee_fe` | React 19, Vite, AntD 5, TanStack Query, ECharts, React Flow, MapLibre | 30+ 화면 |
| `moveseye-ai` | Spring Boot 4, Spring AI 2.0, Jackson 3 | AI 어시스턴트 + MCP 서버 |
| `moveseye-license-issuer` | Java 17, Gradle | 라이선스 발급 CLI(개인키 격리) |

---

## 3. 핵심 기능 (시간순)

### 3.1 NestJS → Spring Boot 전환 (06월)
- 기존 NestJS BE를 Spring으로 **1:1 변환**하고 양쪽 런타임 응답을 풀스캔 비교한 뒤 Spring 단일 채택.
- 변환 중 원본 버그까지 발견(swap 사용률을 메모리 키로 계산하던 복붙 실수) — "1:1"보다 **정확성**을 택해 수정.

### 3.2 🔌 데이터소스 확장 — 수집 엔진 포트화 (07월, 집중 설명)

> **문제**: 모든 서비스가 Zabbix API 응답 Map을 직접 파싱하고 있었다(HostService 2,000줄, authToken이 컨트롤러→서비스→클라이언트로 관통). 이 상태로는 Prometheus·Datadog·Elastic을 붙일 수 없다.
> **목표**: Zabbix 전용 → **다중 데이터소스** 제품. 단, 운영 중인 REST API와 FE는 **한 줄도 바꾸지 않고**.

**설계 결정 (ADR 11건 중 핵심)**

| # | 결정 | 이유 |
|---|---|---|
| D1 | **in-process 멀티모듈 분리**(`app → engine-api ← engine-zabbix`), gRPC 엔진 서버 분리는 **유예** | 지금 필요한 건 논리 경계. 물리 분리 승격 조건(고객망 내 수집기 배치 / 폴링 부하가 앱 응답성 저해 / 폴리글랏 / 운영 주체 분리)을 명시해 두고, 계약은 **proto 호환 규칙**(가법 필드·nullable·enum 예약)으로 설계해 승격 비용을 선지불 |
| D2 | 포트는 **capability 기반 3개** — `MetricPort`(시계열·최신값·트렌드·디스커버리) / `InventoryPort`(호스트·그룹·인터페이스) / `AlertPort`(문제·이벤트·ack). 범용 쿼리 패스스루 금지 | "아무 쿼리나 넘기는 포트"는 추상화가 아니라 Zabbix 누수. 소스마다 같은 **질문**에 답할 수 있는 것만 포트로 |
| D2′ | 트리거 expression DSL·템플릿 링크·자산 미러링은 **추상화 제외**(`ZabbixAdmin` 전용 영역) | 다른 소스에 같은 개념이 없다. 억지로 중립화하면 모든 소스의 최소공배수로 기능이 깎인다 |
| D3 | authToken 관통 제거 — 토큰은 어댑터 내부 책임, 앱은 `CallerContext(principal, role)`만 전달 | gRPC 메타데이터로 그대로 승격 가능 |
| D4 | **캐노니컬 메트릭 모델** `EntityRef / MetricRef / Series / SeriesPoint / TrendBucket / LatestValue` + **메트릭 카탈로그**(중립 키 `CPU:util` ↔ Zabbix `system.cpu.util` 번역 사전) | 소비 서비스가 `vm.memory.size[pused]` 같은 소스 키를 모르게 |
| D7 | Phase 1은 **REST 응답 불변** — 소스 원시 값(itemid·표시명)이 FE에 노출돼 있으면 nullable `nativeId`/`label`로 보존 | FE 무변경이 회귀 검증을 가능하게 하는 전제 |
| D10 | 포트의 **쓰기 계약** — 대상은 식별자만, 필터로 대상 지정 금지(`acknowledge(eventId…)`) | "조건에 맞는 것 전부"는 소스마다 의미가 달라 위험 |
| D11 | 중립/전용 경계는 "값이 어디서 오나"가 아니라 **"그 값이 답하는 질문이 다른 소스에도 있나"** 로 가른다 | `manual_close`를 한 번 Zabbix DSL로 오분류했다가 `AlertRule.manualCloseAllowed`로 되찾은 경험에서 |

**진행 방식 — 스트랭글러 7스텝, 빅뱅 금지**

```
스텝 0   결합 해소(authToken·JPA 의존 끊기) → 0.5 기능별 패키지 재편
스텝 1   engine-api 계약 + MetricPort + ZabbixMetricAdapter + 카탈로그   (테스트 432 green)
스텝 2   파일럿: MemoryService → CpuService 갈아타기, 회고로 계약 보완
스텝 3   확산: disk(3a) · network/interface/session(3b) · log 텍스트 이력(3c)
스텝 4   InventoryPort(4a) · AlertPort(4c-5a~e) · 잔여 8파일 전환(4c-4f~i)
스텝 5   app→engine-zabbix 컴파일 의존 차단(runtimeOnly), 패키지 정리, split package 해소
스텝 6   Prometheus 어댑터 — ⏸ 사용자 결정으로 보류(착수 가이드 작성 완료)
```

- 각 스텝 = 독립 커밋 + 회귀 가능 단위. 레거시 `zabbix/*` 서비스는 스텝 5까지 **공존**시키며 소비자를 하나씩 옮겼다.
- **검증 방법이 핵심**: 매 스텝 전환 전/후 동일 고정 시간창으로 dev Zabbix(호스트 76대) 응답을 JSON 채집 → diff 스크립트로 **byte-identical / 구조 동일·live 값만 drift**를 판정. 19개 응답 그룹 identical. 빌드는 `app`이 `engine-zabbix`를 import하면 **컴파일 실패**하도록 강제.
- 결과: engine-api 108 파일(`grep org.springframework` 0건) · engine-zabbix 45 파일 · 테스트 432 → 570 green · 메트릭·인벤토리·알람 **읽기 경로 전부 포트 경유**.

**런타임 비교로만 잡힌 회귀 (단위 테스트는 전부 통과했던 것들)**
- 어댑터가 history 테이블을 `FLOAT` 고정 조회 → UNSIGNED(바이트 계열) 메트릭이 전부 0으로 붕괴 → `value_type`에서 테이블 유도로 수정.
- 폴백 체인이 응답을 바꾼 사례(memoryUsage 0→11) → D7 위반이라 폴백 없는 `MEMORY:size.pused` 메트릭을 따로 신설.
- Zabbix 정렬은 대소문자 구분 코드포인트 순 / `trigger.get`의 `time_from`은 Zabbix가 무시 / 중첩 삼항 `int/Integer` 언박싱 NPE / DB에 쓰는 값도 `"0"` 표기 정규화 대상.
- N+1: 요약 1건에 메트릭마다 `item.get` → 동일 호스트·다중 메트릭 **배치 조회**를 어댑터 내부에 넣어 포트 시그니처 불변으로 해결.

**교훈**
- 추상화 경계는 코드 구조가 아니라 **"다른 소스에 같은 질문이 있는가"** 로 긋는다.
- "REST 불변"을 약속하면 **런타임 diff**라는 강력한 회귀 도구가 생긴다 — 그 약속이 없었다면 위 버그의 절반은 배포 후에 알았을 것.
- 물리 분리는 미루되 계약은 미리 proto 호환으로 — 나중에 gRPC로 빼더라도 소비 코드가 안 바뀐다.

### 3.3 자산 관리 + 비용(감가상각) 
- 자산 = Zabbix 등록 항목의 스냅샷 + custom 자산. 동기화 버튼, soft delete, 편집 소유권 분리.
- 비용 탭: **정액법·정률법 감가상각 엔진**(한국 세무 기준, 월할), 기기 유형별 기본값 + 자산별 예외, 미입력 큐.

### 3.4 지도 — 네트워크 맵 & 지리 맵
- 네트워크 맵: draw.io식 작도 도구(React Flow), jsonb 문서형 저장, 낙관적 잠금, 스텐실 45종.
- 지리 맵: MapLibre + OpenFreeMap, 좌표는 Zabbix 인벤토리가 원천(편집도 원천에 씀), 클러스터 문서.

### 3.5 Zabbix 관리 래핑 (호스트·템플릿·아이템·트리거·액션·미디어·매크로·Maintenance)
- 완전 컨테이너 드릴다운 IA: 호스트/템플릿 → [정보·아이템·트리거·디스커버리].
- **전파 가시성(엔티티 렌즈)**: 아이템/트리거가 어느 템플릿에서 내려왔는지 한 번에.
- Zabbix에 offset이 없어도 **ID-슬라이스 페이징**(ID만 조회→슬라이스→페이지만 하이드레이트)으로 임의 페이지 0.4~1.3초.
- 액션 `filter` round-trip 함정(`action.get` 응답을 그대로 update하면 -32602) → Normalizer 도입.

### 3.6 홈 위젯 대시보드
- 사용자별 위젯 14종 + 시스템 pinned 3종, react-grid-layout, AI 알림 분석 위젯 포함.

### 3.7 프리미엄 라이선스 (08월)
- RS256 JWT 키, `exp` 대신 `durationDays`(갱신은 등록일 기준), jti 재사용 방지.
- **단계적 차단** 설계: 만료 후 30일은 실시간 조회 유지(EXPIRED) → 이후 DB만(ARCHIVED). 엔진 포트 20개 클래스가 모니터링 화면 전부라 "유지도 차단도 곤란"해서 나온 답 — 포트 데코레이터 한 겹으로 구현.
- 발급기는 **별도 저장소**(개인키가 고객 납품 소스에 섞이지 않게). 클레임 상수 4파일은 양쪽 사본 + 양쪽 `LicenseContractTest`로 drift 차단.

### 3.8 디자인 시스템·다크모드·화면 도움말 31개

---

## 4. ⭐ AI 어시스턴트 — 집중 설명

### 4.1 목표
> **"채팅으로 명령하면 MovesEye 설정·운영 작업을 대신 수행한다."** — 에이전틱하게, 그러나 제품 안에서 안전하게.

예) "web-01 CPU 90% 넘으면 높음 심각도 트리거 만들어줘" → 호스트 탐색 → 아이템 키 조회 → 트리거 생성 **확인 카드** → 사용자 OK → 실행 → 결과 보고.

### 4.2 설계 결정과 이유

| 결정 | 선택 | 이유 |
|---|---|---|
| 배치 | **별도 서버** `moveseye-ai`(:3100) | BE 재빌드·Boot 버전과 분리, API 키 격리, **장애 격리**(AI 죽어도 모니터링 무관) |
| LLM | **프로바이더 중립** — Spring AI 2.0 (Anthropic / OpenAI 호환 / Azure / Ollama) | 고객마다 LLM이 다르다. SDK 두 개를 나란히 쓰면 메시지·툴콜·스트리밍 추상화를 직접 짜야 해서 탈락. Spring AI 1.1은 adaptive thinking 부재로 탈락 → 2.0(Boot 4 필수) |
| 툴 | **BE REST의 얇은 프록시** (총 52개) | 새 BE 코드 0. 권한(RBAC)·감사로그·라이선스 판정이 **BE에서 그대로** 작동 — AI 서버는 자기 권한이 없다. 사용자의 쿠키/Bearer/x-visitor-id를 그대로 전달 |
| 쓰기 안전 | **서버 측 확인 게이트** | 모델이 "확인됨" 플래그를 스스로 세울 수 없도록, 서버가 루프를 멈추고 SSE `confirm_required`를 FE에 보냄 |
| 만능 툴 금지 | `call_zabbix_api` 같은 툴 없음 | 의도 단위·안전 단위로 자름. strict 스키마(`additionalProperties:false`)로 파라미터 환각 차단 |
| 결과 | compact JSON(id·name·status·핵심 필드), 목록 ≤50 | 토큰·캐시·정확도. 원본 DTO 통째 금지, 비밀값 절대 미포함 |
| LLM 설정 | 설치 단위·관리자 입력, BE 테이블(`enc:v1:` AES-GCM 암호화) → AI 서버가 내부 토큰으로 수신, **재시작 없이 교체** | 고객 운영자가 화면에서 키를 바꾼다 |

### 4.3 툴 등급 3단계와 확인 게이트

```
READ        게이트 없음          list_hosts, list_problems, get_host_metrics, search_docs …
WRITE       확인 카드            create_host, create_trigger, acknowledge_problem, update_asset_cost …
DESTRUCTIVE 확인 카드 + 대상 이름 재표시 + 건수 ≤10   delete_host, delete_triggers, exclude_asset …
```

```
model → tool_use(create_trigger{...})
AI서버: WRITE 등급 → pending 저장 → SSE confirm_required{actionId, summary, params} → 대기(최대 5분)
FE:    카드 렌더 [실행][취소] → POST /ai/actions/{id}/confirm | /cancel
AI서버: confirm → BE 호출 → tool_result → 루프 재개 / cancel → "사용자가 취소함"(is_error) → 모델이 마무리
```

- DESTRUCTIVE는 `summarize()` 오버로드에서 BE를 읽어 **대상 이름**을 카드에 넣는다 — id만 적힌 카드는 사람이 검토할 수 없다.
- 전체 교체 시맨틱 엔드포인트(`PUT /hosts/manage/{id}`, 태그 전체 교체)는 툴 내부에서 read-modify-write.

### 4.4 🛡️ AI 폭주·오용 방어 — 설계의 중심

> 철학: **"AI가 실수 안 하게"가 아니라 "실수해도 실제 피해가 안 나게."** LLM의 100% 정확성은 전제하지 않는다. 모든 방어는 **모델이 아니라 서버·구조**가 집행한다 — 모델이 아무리 틀려도, 프롬프트가 아무리 조작돼도 뚫리지 않게.

**A. 권한 — AI 서버는 자기 권한이 없다**
- AI 서버는 사용자의 인증(쿠키/Bearer/x-visitor-id)을 **그대로 BE에 전달**할 뿐. RBAC·감사로그·라이선스 판정은 BE가 평소와 똑같이 수행 → AI를 거쳐도 **사용자가 화면에서 못 하는 일은 AI도 못 한다**.
- 사용자·역할·권한·라이선스·자격증명 쓰기는 **툴 자체가 없다**(권한 상승 경로 원천 제거). 설정 조회는 BE가 마스킹한 값만.
- 만능 툴(`call_zabbix_api`) 없음 — 의도 단위·안전 단위로 잘라 화이트리스트만 존재.

**B. 입력 검증 — 환각 파라미터 차단**
- strict 스키마(`additionalProperties:false`) + 범위 검증(심각도 0~5, 삭제 대상 ≤10, 목록 ≤50)을 **서버가 실행 전** 검사. 환각 ID는 BE가 "없음"으로 응답.
- 이름→ID 해석 규칙: 쓰기 전 반드시 `list_*`로 대상 확정, 후보 2개 이상이면 실행하지 않고 사용자에게 고르게, 0건이면 만들지 않고 보고.

**C. 쓰기 게이트 — 사람이 마지막 스위치를 쥔다**
- WRITE/DESTRUCTIVE 툴은 **서버가 루프를 멈추고** 확인 카드(`confirm_required`)를 띄움. 모델은 "확인됨" 플래그를 스스로 세울 수 없다.
- DESTRUCTIVE는 카드에 **대상 이름** 재표시(id만 적힌 카드는 검토 불가), 10건 초과는 툴이 거부("나눠서 요청").
- 확인 대기 **5분 타임아웃**(`confirm-timeout PT5M`, pending TTL 5분) → 미응답은 취소로 처리.
- 운영 프로필에서는 게이트 우회 개발 엔드포인트가 **고정 OFF**(`dev.tools-endpoint-enabled=false`).

**D. 폭주·비용 상한 — 루프와 과금 폭탄 방지**

| 상한 | 값 | 막는 것 |
|---|---|---|
| 턴당 툴 호출 | **15회** (`max-tool-calls-per-turn`) | 모델이 같은 툴을 무한 반복하는 루프 |
| 동시 턴 | 대화당 **1턴**(busy 플래그 CAS) | 더블클릭·재전송으로 인한 중복 실행 |
| 응답 토큰 | `max-tokens 8000` | 폭주 생성 |
| LLM 호출 타임아웃 | 2분, 턴 전체 상한 = 확인 5분 + LLM 2분×4 | 행(hang) 상태 장기 점유 |
| 툴 결과 크기 | 목록 ≤50건, compact 필드만 | 컨텍스트 폭발·토큰 비용 |
| 대화 이력 | 최근 60 메시지만 모델에 투입 | 긴 대화의 토큰 누적 |
| 리포트 파일 | 5,000행, 24h 후 자동 삭제 | 디스크·데이터 잔류 |
| **월 예산** | 관리자가 USD 상한 설정, 모델별 단가표로 비용 추정·사용량 화면(일별/월별, 초과 표시) | 청구서 폭탄. 단가 미설정 모델은 "미설정"으로 표시(0원으로 속이지 않음) |

**E. 프롬프트 인젝션·주제 이탈**
- 툴 결과(호스트명·트리거 설명 등 Zabbix에 누군가 써넣은 텍스트)는 **"데이터이지 명령 아님" 래퍼**로 모델에 전달. 설령 모델이 속아도 쓰기는 C의 게이트를 통과해야 한다.
- 시스템 프롬프트로 역할 고정(운영 보조만). 잡담·코딩·타사 질문은 "지원하지 않음" + 화면 경로 안내. 모델 refusal(`stop_reason=refusal`)은 "처리할 수 없는 요청"으로 정리.

**F. 외부 노출(MCP) — 기본 닫힘**
- MCP 서버는 **기본 OFF**(`ai.mcp.enabled=false`) — 모니터링 데이터가 외부 LLM으로 나가는 기능이라 고객사가 명시적으로 켠다.
- 켜도 계정별 `NONE / READ / READ_WRITE` 권한 → OAuth 동의 시 scope 상한 → 토큰 발급 시 재검사 → BE 인터셉터가 경로 허용목록+scope(read=GET만)로 **3중 차단**. 액세스 토큰 1h, refresh 회전.
- CORS 와일드카드 불가(쿠키 인증 전제), 동적 클라이언트 등록도 끌 수 있음.

**G. 추적·복구 — 사고가 나도 되돌릴 수 있게**
- BE 감사로그 actor = **실제 사용자**(AI가 아님), 대화·툴 호출 기록 30일 보존 후 자동 삭제.
- **킬 스위치**: 설정 토글 또는 라이선스 feature(`AI_ASSISTANT`) 회수 → 즉시 전체 중단.
- API 키는 BE 테이블에 AES-256-GCM 암호화 저장, 로그 어느 레벨에도 비밀값(키·쿠키) 미출력.

> 한 줄로: **AI는 "제안"만 하고, 검증은 서버가, 실행 승인은 사람이, 권한 판정은 BE가 한다.** 네 주체가 분리돼 있어 어느 하나가 틀려도 피해로 이어지지 않는다.

### 4.5 툴 52개 구성 (패키지 기준)

| 영역 | 툴 예시 |
|---|---|
| host | list_hosts, get_host, get_host_metrics, get_group_overview, create/update/delete_host, set_host_status, set_device_type, link/unlink_templates |
| alert | list_problems, get_problem, acknowledge_problem, **triage**(원인 후보 묶음) |
| zabbix | list/create/update/delete items·triggers, list_item_keys, set_*_status |
| asset / cost | list/get/update/sync/exclude_asset, list_asset_gaps, get_cost_dashboard, list_cost_incomplete, update_asset_cost |
| notify | create_alert_action, 알림 설정 7종(**배달 경로 3단 진단**: 액션→미디어→사용자 미디어) |
| maintenance | Maintenance 기간 생성·조회 |
| chart | 커스텀 차트 4종(호스트 메트릭 시계열을 FE 차트로) |
| report | create_report(xlsx 산출물, 24h 보관), export_table — **행을 모델에 태워 만들지 않는다** |
| audit / system / docs | check_monitoring_coverage(감시 공백 점검), get_system_status, search_docs(화면 카탈로그 30화면+14탭) |

### 4.6 FE 접점
- 플로팅 챗봇(전 화면 공통) + 별도 페이지 `/ai-assistant`, 상태 공유. SSE 이벤트: `text_delta · tool_call · tool_result · confirm_required · done · error`.
- **'/' 명령 26개** — "/문제 web-01", "/요약" 등 빠른 진입.
- **화면/탭 가이드** — "지금 이 화면에서 뭘 할 수 있어?" → `screens.json` 카탈로그(한국어 키워드 필수 — 본문은 모델용 영어라 한국어 질의가 안 걸리는 문제를 실측으로 발견).
- 홈 **AI 알림 분석 위젯** — 최근 알림을 LLM이 요약/우선순위화, 캐시로 비용 제어.

### 4.7 MCP 서버 — 외부 AI 클라이언트 연동
- MovesEye 자체가 **MCP 서버**(`/mcp`, Streamable-HTTP) + **자체 OAuth 2.1 인가 서버**(메타데이터·동적 등록·PKCE·refresh 회전) + FE 동의 화면. Claude Desktop 등에서 "연결"만 누르면 된다.
- **계정별 권한**: 관리자가 사용자마다 `NONE / READ / READ_WRITE` 부여 → 동의 시 scope 상한 → 토큰 발급 시 재검사 → BE 인터셉터가 경로 허용목록 + scope(read=GET만)로 최종 차단. 토큰은 BE 서명 JWT(`typ=mcp`, 1h).
- E2E 실측: 401 디스커버리→등록→authorize→동의→토큰→tools/list·call→비허용 경로 403→refresh→연결 해제→invalid_grant 전부 통과.

### 4.8 AI 파트에서 얻은 교훈
- **"툴 = 기존 API 프록시"가 가장 큰 결정** — 권한·감사·라이선스를 다시 만들 필요가 없었고, AI 서버가 권한을 갖지 않으니 공격면도 늘지 않았다.
- BE 응답 필드는 **실제 응답으로 확인**해야 한다. 이름만 보고 쓰면 조용히 빈 값이 나간다(비용 `id/years/rawPurchaseCost`, 호스트 본문의 `interface` 키).
- 모델 텍스트는 영어 고정 + 답변 언어 태그(`x-lang`)로 분리 — 프롬프트 캐시 적중률과 다국어를 동시에.
- 안전장치는 모델 정확도가 아니라 **구조**에서 온다. 확인 게이트를 서버가 쥐고 있으면 모델이 아무리 틀려도 실제 쓰기는 사람이 막는다.

---

## 5. 개발 방식 — AI 에이전트와의 협업
- Claude Code 하네스: `be-engineer / fe-engineer / integration-qa(정적 경계면) / functional-qa(런타임 E2E)` 에이전트 팀, `fullstack-feature` 오케스트레이터로 BE→계약→FE→QA를 한 세션에.
- 접점은 `_workspace/contract_*.md` 계약서 단일. 설계서(`devdesign_*.md`)에 결정·근거·미결을 남기고, 미결은 번호(M1~M9)로 사용자 결정을 받는다.
- Codex는 **검수 전담**(자기 코드 자기 검수 금지). 작업 단위마다 `review_*.md`에 범위·의도·**불안한 지점**·검증/미검증을 적어 넘긴다.
- 커밋 전 승인, `git add -A` 금지(병행 세션 파일이 딸려온 사고 후).

---

## 6. 숫자로 보는 현황 (2026-08-22)
- BE 엔드포인트 GET 114 / 쓰기 75 · Flyway V25 · 테스트 570+ green
- FE 화면 30+ · 위젯 14종 · 도움말 31개 · 다크모드
- AI 툴 52개 · '/' 명령 26개 · 단위 68 green · MCP E2E 통과
- 엔진 포트 3개(Metric/Inventory/Alert) · engine-api 108파일(Spring 의존 0) · 데이터소스 어댑터 1(Zabbix) + Prometheus 착수 가이드 준비

## 7. 남은 과제
- 실 LLM 대화 품질 검증(현재 가짜 ChatModel로 루프·게이트만 검증) · x-lang 로케일 버그
- Prometheus 어댑터(스텝 6) · 이벤트 이력 대용량(12초·2000건 절단) 재설계
- 설치 번들·nginx 구성 등 설치형 배포 패키징
