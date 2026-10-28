# MovesEye APM 통합 가이드

기준일: 2026년 9월 15일

문서 버전: 1.1 — apm-handbook의 목차와 17개 하위 문서를 바탕으로 개념·집계 원리·운영 기준을 보강했다.

이 문서는 APM의 전체 구조, 메뉴별 사용 API, 수집 데이터 형식, 지표 해석, 설치·운영 절차와 보완 과제를 정리한다. 현재 작업 폴더의 Spring 백엔드와 React 프론트엔드, API 계약서, 기존 안내서 및 검증 기록을 기준으로 작성했다. 코드에 구현된 기능과 운영 환경에서 검증된 범위는 구분한다.

### 목적에 따른 읽는 순서

| 목적 | 읽을 장 | 읽고 나면 알 수 있는 것 |
|---|---|---|
| 처음 APM을 이해한다 | 1 → 2 → 3 | 무엇을 보고 숫자를 어떻게 판단하는가 |
| 메뉴와 API를 연결한다 | 4 → 5 → 7 | 어떤 API가 어떤 원천을 받아 어떤 응답을 만드는가 |
| 고객 환경에 설치한다 | 8 → 6 → 9 | 설치 전제·보존과 용량·수집 장애 확인 순서 |
| 구현·검증 범위를 판단한다 | 10 → 11 → 12 | 미구현·미검증·후속 과제와 원문 근거 |

## 1. APM으로 무엇을 확인하는가

APM은 애플리케이션의 성능과 오류를 서비스 단위로 확인하는 기능이다. 서버의 CPU 사용률을 확인하는 것에서 더 나아가, 어떤 요청이 느리고 어느 처리 단계에서 문제가 발생했는지 찾는다.

| 알고 싶은 내용 | 먼저 확인할 화면 | 이어서 확인할 화면 |
|---|---|---|
| 전체 서비스가 정상인가 | APM 개요 | 서비스 목록 |
| 특정 API가 느린가 | 서비스 상세의 트랜잭션 | 트레이스 상세 |
| 요청이 어디서 오래 걸렸는가 | 트레이스 워터폴 | DB·외부 호출·런타임 |
| 어떤 예외가 반복되는가 | 에러 분석 | 예시 트레이스 |
| 어떤 SQL의 비용이 큰가 | DB 호출 분석 | 쿼리 상세·커넥션 풀 |
| 외부 시스템 문제가 전파되는가 | 서비스 맵 | 외부 호출 분석 |
| 실제 사용자가 페이지를 느리게 보는가 | 사용자 경험(RUM) | 페이지 상세·연결된 서버 트레이스 |
| 외부에서 서비스에 접속할 수 있는가 | 합성 감시 | 단계별 결과·실패 사유 |
| 배포 이후 성능이 나빠졌는가 | 서비스 상세의 배포 | 전후 비교·새로운 예외 |
| 운영 목표를 지키는가 | SLO | 에러 버짓·번 레이트 |
| 데이터가 왜 보이지 않는가 | 수집기 | 수신 현황·폐기 통계·등록 정책 |

### 핵심 용어

| 용어 | 쉬운 설명 |
|---|---|
| 서비스 | 주문 API, 결제 API처럼 모니터링할 애플리케이션 단위 |
| 인스턴스 | 같은 서비스를 실행하는 개별 프로세스 또는 컨테이너 |
| 메트릭(Metric) | 요청 수, 응답시간 분포, 메모리처럼 일정 시간 동안 측정한 숫자 |
| 트레이스(Trace) | 요청 하나가 여러 서비스를 거쳐 처리된 전체 경로 |
| 스팬(Span) | 트레이스 안의 작업 한 구간. HTTP 처리, SQL 실행 등이 해당 |
| Collector | 애플리케이션 데이터를 받아 정리하고 MovesEye로 전달하는 수집기 |
| OTLP | OpenTelemetry 데이터를 전송하는 표준 프로토콜 |
| 히스토그램 | 응답시간을 구간별 건수로 저장한 분포 |
| 롤업 | 1분 데이터를 5분·1시간 단위로 합쳐 장기간 저장하는 작업 |
| 샘플링 | 요청의 상세 기록 중 일부를 선택해 저장하는 방식 |
| Exemplar | 메트릭과 관련된 대표 요청의 traceId 및 측정값 |
| RUM | 실제 사용자 브라우저에서 측정한 페이지 성능과 오류 |
| 합성 감시 | 정해진 위치에서 시나리오를 주기적으로 실행하는 접속 점검 |
| SLI / SLO | 실제 측정한 서비스 수준 / 달성하려는 목표 |

트레이스는 여러 스팬으로 구성되며, 같은 traceId와 부모 스팬 관계로 요청 경로를 연결한다. [OpenTelemetry 트레이스 설명](https://opentelemetry.io/docs/concepts/signals/traces/)

### 1.1 서버 모니터링과 함께 읽는 방법

| 구분 | 서버 모니터링 | APM |
|---|---|---|
| 기준 대상 | 호스트·장비·인프라 | 서비스·요청·실행 인스턴스 |
| 대표 질문 | CPU·메모리·디스크·네트워크가 부족한가 | 어떤 API가 느리고 어느 작업에서 시간을 쓰는가 |
| 예시 | app-01의 CPU가 95% | orders-api의 주문 조회 p95가 2초 |
| 연결 방법 | APM 인스턴스의 host.name 또는 수동 호스트 매핑으로 함께 확인 | 트랜잭션·런타임에서 원인을 좁히고 호스트 상태와 대조 |

CPU가 높아도 요청이 정상일 수 있고, CPU가 낮아도 DB 대기나 외부 API 때문에 느릴 수 있다. 두 관측을 같은 기간에 비교해야 원인을 좁힐 수 있다.

### 1.2 현재 제공 범위의 경계

자동 계측은 지원되는 HTTP·DB·메시징 라이브러리 등의 경계에서 데이터를 만든다. 모든 업무 메서드의 실행 시간을 자동으로 기록하는 기능은 아니다. Java의 추가 메서드 계측 설정이나 수동 스팬이 필요한 업무는 따로 계측해야 한다.

| 항목 | 이 가이드에서 설명하는 범위 |
|---|---|
| 분산 요청 추적 | 수집되어 저장된 스팬의 호출 관계·소요시간 |
| DB 호출 | 애플리케이션에서 관측한 쿼리·호출 지연·연결 풀 |
| K8s | 서비스 인스턴스의 파드·노드 정보와 재시작·OOM 관측 |
| RUM | 브라우저 페이지 성능·오류·최소 스팬. 화면 녹화나 입력값 재생은 제공하지 않음 |
| AI 원인 분석 | API 조회 결과를 연결해 조사 순서를 안내하는 대화형 분석 |
| 별도 또는 미제공 범위 | 코드 CPU·메모리 프로파일링, 로그 상관, 세션 리플레이, 모바일 RUM, 통계적 이상 탐지 엔진 |

## 2. 전체 수집 구조

### 2.1 데이터가 화면까지 도달하는 과정

```text
서버 애플리케이션
  OTel Agent 또는 SDK
        │ 메트릭·트레이스
        ▼
OpenTelemetry Collector
  수신 → 속성 정리·민감정보 처리 → 트레이스 샘플링 → 묶음 전송
        │ OTLP/HTTP JSON + gzip
        ▼
MovesEye Spring API
  인증 → 형식 검사 → 서비스 식별 → 중복 처리 → 정규화·저장
        │
        ├─ 메트릭 저장 → 1분 → 5분 → 1시간 집계
        ├─ 스팬 저장 → 트레이스·맵·예외·DB·외부 호출·메시징 집계
        └─ 실시간 메모리 버퍼 → SSE → APM 개요의 실시간 화면
        │
        ▼
PostgreSQL → 조회 API → MovesEye 화면

사용자 브라우저
  OTel Web SDK + Web Vitals
        │ Collector를 거치지 않는 RUM 전용 전송
        ▼
MovesEye RUM API → 페이지·성능·오류 5분 집계 → RUM 화면

Zabbix Server / Proxy
  웹 시나리오 실행 → 결과 이력
        │ MovesEye가 Zabbix API로 조회
        ▼
합성 감시 화면·서비스 연결 상태

MovesEye 알람 평가
        │ history.push
        ▼
Zabbix 트리거 → 고객이 설정한 알림 액션 → 이메일·메신저 등
```

### 2.2 구간별 역할과 형식

| 구간 | 전송·처리 방식 | 역할 |
|---|---|---|
| 서버 앱 → Collector | OTLP/gRPC 또는 OTLP/HTTP, 기본 수신 포트 4317·4318 | Agent·SDK가 만든 관측 데이터 전달 |
| Collector → MovesEye | OTLP/HTTP JSON, 기본 생성 설정은 gzip 사용 | 서버 메트릭·트레이스 전송 |
| 브라우저 → MovesEye | RUM 전용 OTLP/HTTP JSON | 공개 RUM 토큰과 허용 Origin을 검증한 뒤 수신 |
| MovesEye → PostgreSQL | 정규화한 행·히스토그램·집계 데이터 | 조회와 보존 처리 |
| 화면 → MovesEye | REST API | 기간·서비스·대상별 조회 |
| MovesEye → 실시간 화면 | SSE, text/event-stream | 최초 스냅샷과 변경된 시간 구간 전달 |
| MovesEye ↔ Zabbix | JSON-RPC API | 합성 감시 조회·관리, 알람 값 전송 |

OTLP는 gRPC와 HTTP 전송을 정의하고, HTTP에서는 protobuf와 JSON 인코딩을 지원한다. MovesEye의 서버 수신 구현은 그중 JSON을 사용한다. [OTLP 공식 규격](https://opentelemetry.io/docs/specs/otlp/)

현재 APM은 별도 Prometheus 서버나 Jaeger를 필수로 요구하지 않는다. Collector 설정의 `prometheus/self`는 Collector 자신의 상태를 읽기 위한 구성이다. 애플리케이션 데이터를 모두 Zabbix에 저장하는 구조도 아니다. 주요 APM 데이터는 MovesEye의 PostgreSQL에 저장한다.

### 2.3 왜 이 구조를 선택했는가

| 선택 | 맡긴 역할 | 운영상 의미 |
|---|---|---|
| 서버 앱은 Collector 경유 | JSON 변환·민감정보 처리·tail 샘플링·큐·재시도 | 서버 앱을 BE에 직접 연결하는 방식은 지원 설치 경로로 안내하지 않음 |
| RUM은 BE에 직접 수신 | 브라우저 Origin·공개 토큰·요청량 제한 | 서버 수집 경로와 인증·신뢰 수준이 다름 |
| OTel 계측 사용 | 언어별 Agent·SDK와 표준 데이터 형식 | 별도의 MovesEye 전용 Agent를 개발·배포하지 않음 |
| PostgreSQL에 저장 | 기존 설치형 시스템의 저장소 활용 | 서비스·route 증가에 따른 용량과 조회 성능을 관리해야 함 |
| 실시간 값은 메모리에 보관 | 짧은 최근 구간을 빠르게 표시 | DB에 10초 데이터를 장기 적재하지 않으며 재시작 시 초기화 |
| 알람 전달은 Zabbix와 연결 | 고객의 기존 알림 액션 활용 | MovesEye에서 평가한 값과 고객 알림 설정을 모두 확인해야 함 |

Collector를 여러 대로 늘릴 때는 같은 traceId의 스팬이 한 샘플링 지점에 모여야 한다. 단순한 라운드로빈 분산은 요청의 일부 스팬만 각 Collector에 도착하게 만들 수 있다. 현재 기본 구성은 단일 게이트웨이 기준이며, 분산 구성은 traceId 기준 라우팅을 포함한 별도 설계·검증 대상이다.

### 2.4 데이터가 저장되기 전 통과하는 단계

| 순서 | 처리 | 확인할 결과 |
|---|---|---|
| 1 | 형식·압축 해제 크기 검사 | JSON 여부와 본문 상한 |
| 2 | 토큰·scope·라이선스 검사 | 해당 경로로 데이터를 보낼 자격 |
| 3 | JSON 파싱·재전송 여부 확인 | 유효한 데이터와 이미 받은 배치 구분 |
| 4 | 서비스·인스턴스 식별 | 서비스 이름·환경·등록 정책 |
| 5 | 메트릭·속성 허용목록 적용 | 수집했다고 모두 저장되는 것은 아님 |
| 6 | 이름·단위·차원 정규화 | 같은 의미의 관측을 같은 집계 단위로 연결 |
| 7 | 누적값 차분·히스토그램 처리 | 증분과 분포를 저장 가능한 형태로 변환 |
| 8 | 저장·중복 방지 기록 | 재전송에 따른 이중 집계 억제 |
| 9 | 조회·롤업·실시간 갱신 | 저장 결과를 목적별 화면으로 제공 |

Collector 자신의 메트릭은 서비스 등록과 분리한다. 이 구분이 없으면 수집기 자체가 고객 서비스처럼 목록·오류율·SLO에 들어가게 된다.

## 3. 숫자를 읽기 전에 알아야 할 기준

### 3.1 메트릭과 트레이스는 집계 대상이 다르다

| 구분 | 메트릭 기반 | 트레이스 기반 |
|---|---|---|
| 질문 | 얼마나 많은 요청이 들어왔고 얼마나 느렸는가 | 특정 요청이 어디서 느려졌는가 |
| 수집 기준 | 계측되어 정상 수신된 요청의 집계 | 샘플링 정책을 통과한 상세 요청 |
| 주요 화면 | 개요·트랜잭션·RED·런타임·배포 비교·SLO | 트레이스·맵·에러·DB·외부 호출·메시징·배치 |
| 건수 의미 | 수신된 메트릭의 요청 수 | 저장된 표본의 건수 |
| 주의점 | 미계측·전송 실패·폐기가 있으면 실제 전체 트래픽과 차이 발생 | 오류·느린 요청을 우선 저장하므로 전체 오류율로 해석하면 안 됨 |

기본 트레이스 정책은 오류와 느린 요청을 우선 보존하고 정상 요청은 일부만 남기는 방식이다. 정상 2% 등의 비율과 느림 기준은 생성한 Collector 설정에서 확인한다. 정책상 보존 대상이어도 큐 초과·전송 실패·분산 수집 경로 문제로 손실될 수 있다.

예를 들어 서버가 10,000건을 처리해 메트릭에 10,000건이 집계되어도 트레이스 목록은 수백 건만 보일 수 있다. 요청 수는 메트릭에서, 개별 원인은 트레이스에서 확인한다.

### 3.2 주요 지표

| 지표 | 의미·계산 | 해석 |
|---|---|---|
| requests | 구간 내 요청 수 | 트래픽 규모 |
| rps | 요청 수 ÷ 구간 초 | 초당 처리량 |
| errors | HTTP 서버 RED에서는 5xx 요청 수 | 4xx는 이 오류 수에 포함하지 않음 |
| errorRatePct | 오류 수 ÷ 요청 수 × 100 | 요청이 없으면 계산할 수 없음 |
| p50 | 관측의 약 50%가 이 값 이하 | 일반적인 응답 수준 |
| p95 | 관측의 약 95%가 이 값 이하 | 느린 사용자 경험 확인 |
| p99 | 관측의 약 99%가 이 값 이하 | 매우 느린 꼬리 구간 확인 |
| activeRequests | 처리 중인 요청의 관측값 | 초당 요청 수와 다른 값 |
| Apdex | 만족·허용·불만족 구간으로 계산한 만족도 | 설정값 T는 초 단위 |

서버 p95·p99는 저장한 히스토그램으로 계산한 근삿값이다. 원시 응답시간을 모두 정렬한 정확한 백분위와는 차이가 날 수 있다. 서비스별 p95를 평균내 전체 p95를 만들면 안 된다.

### 3.3 상태와 품질 표시

| 표시 | 의미 | 대응 |
|---|---|---|
| UP | 현재 판정 조건에서 수신과 성능이 정상 범위 | 추세 확인 |
| DEGRADED | 오류율 또는 지연 임계 초과 | 오류·트랜잭션·트레이스 확인 |
| DOWN | 연결된 합성 감시의 실패 등 외부 점검 근거 | 합성 감시 실패 단계 확인 |
| STALE | 서비스 데이터 수신이 일정 시간 끊김 | 앱 Agent·수집 경로 확인 |
| UNKNOWN | 수집기 상태 등으로 정상 여부 판단 불가 | 수집기부터 확인 |
| null 또는 — | 미관측·미지원·계산 불가 | 0으로 바꾸어 읽지 않음 |
| sampleWarning | 표본이 적어 백분위 해석에 주의 필요 | 기간을 넓혀 확인 |
| rebucketed | 원래 히스토그램 경계를 공통 경계에 맞춤 | 근사 오차 고려 |
| mixedBounds | 합칠 수 없는 히스토그램 경계가 섞임 | 일부 백분위가 null일 수 있음 |
| truncated | 조회 상한으로 일부 결과만 제공 | 기간·조건을 좁혀 조회 |
| stored=false | Exemplar의 연결 트레이스가 현재 저장되어 있지 않음 | 표본 미보존 또는 보존 만료 고려 |

데이터가 없다는 사실만으로 서비스 중단을 확정하지 않는다. 서비스 상태 배지, 선택 기간의 차트, 최근 24시간 가용성은 서로 다른 시간 범위를 사용할 수 있다.

### 3.4 같은 화면에서도 시간 범위를 확인한다

| 항목 | 시간·집계 기준 | 비교 시 주의 |
|---|---|---|
| 개요의 이전 기간 대비 | 선택한 기간 바로 앞의 같은 길이 구간 | 1시간 창이면 직전 1시간이다. 항상 전일 동시간은 아님 |
| 서비스 상세 상태 배지 | 최근 상태 판정 창 | 과거 차트를 보고 있어도 헤더는 최근 상태일 수 있음 |
| 서비스 가용성 띠 | 최근 24시간의 판정 구간 | 상단에서 고른 기간과 다를 수 있음 |
| 실시간 | 기본 15분 창·10초 칸 | 과거 이력을 조회하는 저장소가 아님 |
| 합성 감시 목록 가용성 | 최근 24시간 | 같은 행의 p95와 기간이 다름 |
| 합성 감시 목록 p95 | 최근 60분 | 목록에 임의 from·to를 보내도 이 의미가 바뀌지 않음 |
| 배포 목록 | 기간 생략 시 최근 30일 | 서비스 차트의 기본 조회 창과 구분 |
| 예외 발생 추이 | 1시간 버킷 | 15분만 선택해도 겹치는 1시간 집계가 포함될 수 있음 |
| RUM | 5분 버킷, 응답 from·to 확인 | 요청 시각을 경계에 맞추면서 실제 집계 창이 넓어질 수 있음 |
| SLO | 정의에 설정된 롤링 7일·30일 | 일별 캘린더의 날짜 구간과 다른 기준 |

### 3.5 가용성·Apdex·오류율을 계산하는 예

서비스 화면의 가용성과 SLO의 가용성은 분모가 다르다.

```text
서비스 화면 가용성
  (UP 구간 수 + DEGRADED 구간 수) ÷ 판정 가능한 구간 수 × 100
  UNKNOWN·보존 밖 구간은 분모에서 제외

가용성 SLI
  성공으로 분류한 요청 수 ÷ 측정한 요청 수 × 100
  현재 HTTP 기준에서는 5xx를 실패로 분류
```

예를 들어 판정 가능한 5분 구간 280개 중 278개가 UP 또는 DEGRADED이면 서비스 가용성은 약 99.29%다. 같은 기간 요청 100,000건 중 100건이 5xx이면 요청 기준 SLI는 99.9%다. 두 값이 다른 것은 계산 기준이 다르기 때문이다.

Apdex는 T 이하를 만족, T 초과~4T 이하를 허용, 그 이상을 불만족으로 나눈다. 만족 80건, 허용 10건, 불만족 10건이면 `(80 + 10 ÷ 2) ÷ 100 = 0.85`다. 실제 구현에서는 히스토그램으로 구간 수를 추정한다.

오류율이 1%에서 2%가 되면 차이는 1%p이고 상대 증가는 100%다. 배포 비교와 리포트에서 `%`와 `%p`를 바꾸어 읽지 않는다.

## 4. 메뉴별 조회 API

아래 API는 MovesEye 백엔드 기준 경로다. 실제 호출 주소 앞에는 설치 환경의 API 주소가 붙는다. `{uid}`는 서비스 UUID, `{traceId}`는 트레이스 식별자이며 화면 표시명을 대신 넣지 않는다. 여러 API를 적은 경우 해당 메뉴의 조회 기능 전체를 뜻하며, 탭을 열거나 대상을 선택할 때 나누어 호출한다.

### 4.1 주요 메뉴

| 메뉴 | 확인 내용 | 사용하는 API | 원천 |
|---|---|---|---|
| APM 개요 | 서비스 상태·요청량·오류율·지연·상위 문제 서비스 | GET /apm/overview | 메트릭·서비스 상태·알람 이벤트 |
| 개요의 실시간 모드 | 최근 트래픽과 오류 변화 | GET /apm/live/snapshot, GET /apm/live/stream | 메트릭 수신 후 메모리 버퍼 |
| 서비스 목록 | 서비스별 상태·성능·인스턴스·버전 | GET /apm/services/overview | 서비스 등록 정보·메트릭 |
| 서비스 상세 헤더 | 선택 서비스의 정보·상태·설정·인스턴스 | GET /apm/services/{uid} | 서비스 정보·메트릭·적용 규칙 |
| 서비스 맵 | 서비스·DB·외부 HTTP·큐의 호출 관계 | GET /apm/service-map, GET /apm/service-map/edges/series | 트레이스에서 만든 호출 관계 집계 |
| 트레이스 탐색 | 느린 요청·오류 요청 검색과 산점도 | GET /apm/traces, GET /apm/traces/scatter | 트레이스 요약 |
| 트레이스 상세 | 스팬 워터폴·속성·이벤트·플레임 | GET /apm/traces/{traceId}, GET /apm/traces/{traceId}/flame | 저장 스팬·트레이스 요약 |
| 합성 감시 | 웹 시나리오 결과와 가용성 | GET /apm/synthetics, GET /apm/synthetics/{httptestId} | Zabbix 웹 시나리오 |
| 합성 감시 상세 | 단계별 응답시간·실패·일별 가용성 | GET /apm/synthetics/{httptestId}/results, GET /apm/synthetics/{httptestId}/calendar | Zabbix 결과 이력 |
| 사용자 경험(RUM) | 페이지 그룹·Web Vitals·PV·세션·환경 | GET /apm/rum/pages, GET /apm/rum/vitals, GET /apm/rum/series, GET /apm/rum/breakdown | 브라우저 데이터의 5분 집계 |
| RUM 페이지 상세 | 페이지별 성능·리소스·JS 오류·연결 트레이스 | GET /apm/rum/pages/{groupId} | 페이지·timing·오류·브라우저 스팬 |

현재 사이드바에는 개요, 서비스, 서비스 맵, 트레이스, 합성 감시, 수집기, RUM의 7개 진입점이 있다. 나머지 분석 화면은 서비스 상세 탭, 설정 메뉴 또는 직접 경로에서 진입한다.

### 4.2 서비스 상세 탭

| 탭 | 확인 내용 | 사용하는 API | 읽을 때 주의할 점 |
|---|---|---|---|
| 개요 | 요청량·오류율·응답시간·Apdex·진행 중 요청 | GET /apm/services/{uid}/red-series | activeRequests는 별도 API가 아니라 이 응답에 포함 |
| 개요의 분포·가용성 | 응답시간 분포와 24시간 상태 | GET /apm/services/{uid}/latency-heatmap, GET /apm/services/{uid}/availability | 분포의 빈 값과 요청 0건을 구분 |
| 트랜잭션 | API 경로별 요청량·지연·오류 | GET /apm/services/{uid}/endpoints | q·method·정렬·페이지 조건 사용 |
| 선택 트랜잭션 추이 | 특정 route와 method의 RED | GET /apm/services/{uid}/endpoints/series | route와 method는 쿼리 파라미터 |
| 상태코드·메서드 분포 | 1xx~5xx·GET/POST 등 | GET /apm/services/{uid}/status-codes, GET /apm/services/{uid}/methods | 선택 엔드포인트가 아닌 서비스 전체 범위 |
| 트레이스 | 선택 서비스의 요청 상세 | GET /apm/traces, GET /apm/traces/scatter | service 필터 사용, involved로 경유 포함 여부 지정 |
| 에러 | 예외 유형·발생 추이·스택·대표 트레이스 | GET /apm/errors, GET /apm/errors/{groupId}, GET /apm/errors/{groupId}/series | 발생 추이는 1시간 집계 |
| 데이터베이스 | 쿼리별 호출량·지연·총 소요시간 | GET /apm/db/queries, GET /apm/db/queries/{groupId}, GET /apm/db/queries/{groupId}/series, GET /apm/db/systems | DB 내부 실행계획·락 분석 기능과 구분 |
| 외부 호출 | 외부 대상별 지연·오류·타임아웃 | GET /apm/dependencies, GET /apm/dependencies/series | target은 쿼리 파라미터, 평균 지연은 제공되지 않을 수 있음 |
| 런타임 | JVM 메모리·GC·스레드·CPU·커넥션 풀 | GET /apm/services/{uid}/runtime | 없는 슬롯은 해당 런타임·계측의 지원 여부 확인 |
| 인스턴스 | 프로세스별 상태·버전·성능·K8s 정보 | GET /apm/services/{uid}/instances, GET /apm/services/{uid}/instances/{instanceId}/series | 인스턴스별 메트릭은 1분 데이터 보존 범위에 의존 |
| 배포 | 버전 변경·전후 성능·새 예외 | GET /apm/services/{uid}/deployments, GET /apm/deployments/{id}/compare, GET /apm/deployments/{id}/new-errors | 목록 기본 기간은 최근 30일 |
| 합성 감시 | 서비스와 연결된 외부 점검 | GET /apm/services/{uid}/synthetics | 시나리오 삭제와 연결 해제는 다른 동작 |
| 설정 | 표시명·담당자·태그·Apdex·호스트 매핑 | GET /apm/services/{uid}, PUT /apm/services/{uid} | 수정은 apm.edit 권한 필요 |
| 로그 | 요청 관련 로그 | 현재 조회 기능 미개방 | 수신 경로가 있어도 로그를 저장하는 것은 아님 |

응답시간 차트의 대표 트레이스는 `GET /apm/services/{uid}/exemplars`로 조회한다. Exemplar는 최댓값이 아니라 대표 표본이며, 해당 traceId의 상세가 남아 있지 않을 수 있다.

### 4.3 공통 분석·운영 화면

| 화면·기능 | 사용하는 API | 원천과 의미 |
|---|---|---|
| 전체 서비스 에러 분석 | GET /apm/errors 및 그룹 상세·series | 서비스 상세 에러 탭과 같은 API, 서비스 필터만 달라짐 |
| 전체 DB 호출 분석 | GET /apm/db/queries 및 그룹 상세·series, GET /apm/db/systems | 저장된 DB 스팬의 정규화 쿼리 집계 |
| 전체 외부 호출 분석 | GET /apm/dependencies, GET /apm/dependencies/series | 저장된 외부 호출 스팬 집계 |
| 메시징 | GET /apm/messaging/destinations, GET /apm/messaging/series | 서비스·시스템·목적지·발행/소비 단위 집계 |
| 배치 | GET /apm/jobs, GET /apm/jobs/runs, GET /apm/jobs/timeline | 완료된 작업 스팬의 실행 이력 |
| SLO | GET /apm/slos, GET /apm/slos/{sloUid}, GET /apm/slos/{sloUid}/series | 메트릭으로 계산한 서비스 수준과 스냅샷 |
| 알람 규칙 | GET /apm/alert-rules, GET /apm/services/{uid}/alert-rules | 규칙 정의와 서비스별 실제 적용 여부 |
| 알람 발생 이력 | GET /apm/alert-events | 발화·해소·측정값·Zabbix 이벤트 연결 |
| 알림 경로 진단 | GET /apm/alert-rules/zabbix-status | Zabbix 연결·동기화·알림 액션 상태 |
| APM 리포트 목록 | GET /admin/reports?type=APM_WEEKLY, GET /admin/reports?type=APM_MONTHLY | 저장한 주간·월간 리포트 |
| APM 리포트 상세 | GET /admin/reports/apm/{id} | 저장된 리포트 스냅샷 |
| 기간 지정 리포트 | GET /admin/reports/apm/detail?periodType=WEEK&periodStart=2026-09-07 | 저장본 조회, 마감된 기간은 필요 시 생성. MONTH도 지원 |
| 홈 상태·느린 서비스·알람 위젯 | GET /apm/widgets/status-summary, GET /apm/widgets/slow-services, GET /apm/widgets/alerts | 홈 전용의 가벼운 집계 응답 |

홈 위젯 경로는 현재 FE API 클라이언트와 BE Controller 기준이다. 이전 안내서의 `/home/widgets/apm-*` 표기를 그대로 사용하지 않는다.

### 4.4 수집기 메뉴

| 기능 | 사용하는 API | 확인·관리 내용 |
|---|---|---|
| 수집기 목록·추이 | GET /apm/collectors, GET /apm/collectors/{id}/series | 마지막 수신·큐·전송 실패 등 |
| 설정 기본값 | GET /apm/collectors/config-defaults | 설치 환경의 Collector 설정값 |
| 설정 파일 생성 | POST /apm/collector-config | YAML 반환 |
| 설치 안내 | GET /apm/install-guide | 언어·환경별 설치 지침 |
| 서버 수신 토큰 | GET /apm/receive-tokens, POST /apm/receive-tokens, DELETE /apm/receive-tokens/{id} | 발급·목록·회수 |
| 수집 정책 | GET /apm/settings, PUT /apm/settings | 서비스 등록 및 수집 관련 설정 |
| 승인 대기 서비스 | GET /apm/services/pending | 승인 대기 목록 |
| 서비스 승인·거절 | POST /apm/services/pending/{id}/approve, POST /apm/services/pending/{id}/reject | 등록 정책에 따른 처리 |
| 미식별 서비스 | GET /apm/services/unknown | 서비스 귀속에 실패한 데이터 확인 |
| 최근 수신·폐기 | GET /apm/ingest/recent, GET /apm/ingest/drops | 데이터 도착 여부와 폐기 사유 |
| RUM 토큰 | GET /apm/rum/tokens, POST /apm/rum/tokens, DELETE /apm/rum/tokens/{tokenId} | 브라우저 전용 공개 토큰 |
| RUM 허용 사이트 | PUT /apm/rum/origins | allowedOrigins 전체 교체 |
| RUM 설치 코드 | GET /apm/rum/snippet?tokenId=... | SDK 설치 명령·코드·CORS/CSP 안내 |

### 4.5 생성·수정·삭제 API

| 관리 대상 | API | 주의점 |
|---|---|---|
| 서비스 | PUT /apm/services/{uid}, DELETE /apm/services/{uid} | 삭제는 숨김 상태에서만 허용 |
| 알람 규칙 | POST /apm/alert-rules, PUT·DELETE /apm/alert-rules/{ruleUid} | 서비스별 활성 규칙이 같은 종류의 전역 규칙보다 우선 |
| 알람 미리보기·재동기화 | POST /apm/alert-rules/preview, POST /apm/alert-rules/{ruleUid}/resync | 설정한 임계의 영향과 Zabbix 차이를 확인 |
| SLO | POST /apm/slos, PUT·DELETE /apm/slos/{sloUid} | 삭제하면 연결된 스냅샷도 삭제 |
| 합성 시나리오 | POST /apm/synthetics, PUT·DELETE /apm/synthetics/{httptestId} | 수정 시 기존 httpStepId 유지, 삭제 시 Zabbix 이력 영향 |
| 감시 위치·실패 사전 | GET /apm/synthetics/proxies, GET /apm/synthetics/error-catalog | 시나리오 폼의 호스트·실패 사유 안내 |
| 서비스와 합성 감시 연결 | POST /apm/services/{uid}/synthetics/bind, POST /apm/services/{uid}/synthetics/unbind | body에 시나리오 ID 전달 |
| 배포 웹훅 | POST /apm/services/{uid}/deployments | CI/CD가 deploy scope 토큰으로 호출 |
| 리포트 삭제·보존 | DELETE /admin/reports, GET·PUT /admin/reports/retention | APM 삭제 ID는 apmIds로 구분 |

### 4.6 API 구현과 화면 연결을 구분할 항목

| 항목 | 현재 확인 범위 |
|---|---|
| POST /apm/traces/compare | BE 비교 API는 존재하나 현재 FE API 클라이언트에 비교 호출이 없음 |
| /apm/dashboards/overview/widgets | BE에 GET·POST, layout PATCH, 개별 PATCH·DELETE, reset POST 구현이 있음. 현재 FE에서 이 경로를 사용하는 호출은 확인되지 않음 |
| /apm/dashboards/services/{uid}/widgets | 서비스별 BE 위젯 배치 API도 존재. 화면의 성능 데이터 API와는 별개 |
| 서비스 맵 위치 저장·전용 sankey API 등 | 이전 설계의 계획 항목을 현재 제공 API로 간주하지 않음 |

### 4.7 AI 어시스턴트가 사용하는 APM 조회

AI 기능도 같은 APM API를 읽는다. 별도의 원시 데이터를 수집하거나 데이터가 없는 원인을 자동으로 확정하는 엔진은 아니다. 다음 11개 도구는 APM AI 계약과 현재 도구 클래스 목록을 기준으로 정리했다.

| AI 도구 | 조회 목적 | 연결 API |
|---|---|---|
| apm_list_services | 서비스 찾기·상태 분포 | /apm/services/overview |
| apm_service_status | 한 서비스의 상태·지표 | /apm/services/{uid} |
| apm_slow_endpoints | 느린·오류가 많은 API 찾기 | /apm/services/{uid}/endpoints |
| apm_error_groups | 반복 예외 찾기 | /apm/errors |
| apm_trace_lookup | 요청 경로·느린 스팬 확인 | /apm/traces/{traceId} |
| apm_service_map | 하위 서비스·DB·외부 의존 확인 | /apm/service-map |
| apm_deployments | 배포·전후 비교·신규 예외 | /apm/services/{uid}/deployments, /apm/deployments/{id}/compare, /apm/deployments/{id}/new-errors |
| apm_collector_status | 수집기·토큰·수신·폐기 진단 | /apm/collectors, /apm/receive-tokens, /apm/ingest/recent, /apm/ingest/drops |
| apm_slo_status | 목표·에러 버짓·캘린더 | /apm/slos, /apm/slos/{sloUid} |
| apm_synthetics | 합성 시나리오·실패 결과 | /apm/synthetics, 상세·results API |
| apm_jobs | 배치 실행·실패 이력 | /apm/jobs, /apm/jobs/runs |

대표 조사 순서는 서비스 상태 → 엔드포인트 → 예외 → 트레이스 → 배포 → 서비스 맵이다. 수집 진단은 apm.edit 권한이 필요하며, 데이터가 부족하거나 일부 조회가 실패하면 확인하지 못한 범위를 함께 읽어야 한다. 실제 LLM 대화 품질과 도구 API의 개별 동작 검증은 별개다.

## 5. 수집 데이터 형식

다음 JSON은 구조를 설명하기 위해 만든 예시이며 운영 데이터가 아니다. 시각·서비스명·ID는 예시 값이다. 실제 전송에는 현재 시각, 유효한 토큰, 서비스 등록 정책, 지원 메트릭·히스토그램 경계 등의 조건이 적용된다.

### 5.1 공통 식별 정보

```text
Resource: 어떤 서비스·인스턴스에서 발생했는가
  ├─ service.name                  주문 서비스
  ├─ deployment.environment.name   production
  ├─ service.instance.id           orders-01
  ├─ service.version               1.4.2
  └─ host.name                     app-01

Scope: 어떤 계측 라이브러리가 만들었는가
  ├─ name
  └─ version

Data: 실제 측정한 내용
  ├─ Metric: 이름·단위·측정 시각·값 또는 분포
  └─ Span: traceId·spanId·부모·시작/종료·속성·이벤트
```

서비스는 이름과 환경을 기준으로 구분하고, 인스턴스 ID로 실행 단위를 나눈다. 같은 이름의 개발 환경과 운영 환경을 섞지 않도록 환경 값을 일관되게 보낸다.

### 5.2 메트릭 수신

수신 API: `POST /apm/otlp/v1/metrics`

```text
resourceMetrics[]
  ├─ resource.attributes[]             서비스·환경·인스턴스 정보
  └─ scopeMetrics[]
       ├─ scope                        계측 라이브러리 정보
       └─ metrics[]
            ├─ name / unit
            └─ gauge / sum / histogram
                 └─ dataPoints[]
                      ├─ attributes[]  route·method·상태코드 등
                      ├─ timeUnixNano  관측 시각
                      └─ 값·건수·합·구간별 건수
```

다음은 메모리 사용량 Gauge 예시다.

```json
{
  "resourceMetrics": [{
    "resource": {
      "attributes": [
        {"key": "service.name", "value": {"stringValue": "orders-api"}},
        {"key": "deployment.environment.name", "value": {"stringValue": "production"}},
        {"key": "service.instance.id", "value": {"stringValue": "orders-01"}}
      ]
    },
    "scopeMetrics": [{
      "scope": {"name": "example.runtime", "version": "1.0.0"},
      "metrics": [{
        "name": "jvm.memory.used",
        "unit": "By",
        "gauge": {
          "dataPoints": [{
            "attributes": [
              {"key": "jvm.memory.type", "value": {"stringValue": "heap"}}
            ],
            "timeUnixNano": "1789430400000000000",
            "asInt": "268435456"
          }]
        }
      }]
    }]
  }]
}
```

이 예시는 orders-api의 orders-01 인스턴스에서 힙 메모리 268,435,456바이트를 관측했다는 뜻이다. `asInt`와 나노초 시각은 큰 정수의 정밀도를 보존하도록 문자열로 표현한다.

### 5.3 응답시간 히스토그램

대표 메트릭은 `http.server.request.duration`이다. 다음은 `metrics[]` 안에 들어가는 형식 예시다. 경계 값은 설명용으로 단순화했다.

```json
{
  "name": "http.server.request.duration",
  "unit": "s",
  "histogram": {
    "aggregationTemporality": 1,
    "dataPoints": [{
      "attributes": [
        {"key": "http.route", "value": {"stringValue": "/orders/{id}"}},
        {"key": "http.request.method", "value": {"stringValue": "GET"}},
        {"key": "http.response.status_code", "value": {"intValue": "200"}}
      ],
      "startTimeUnixNano": "1789430340000000000",
      "timeUnixNano": "1789430400000000000",
      "count": "100",
      "sum": 22.8,
      "min": 0.02,
      "max": 1.6,
      "explicitBounds": [0.1, 0.5, 1.0],
      "bucketCounts": ["60", "30", "8", "2"]
    }]
  }
}
```

```text
응답시간 구간                 요청 수       분포
0.1초 이하                      60         ████████████
0.1초 초과 ~ 0.5초 이하          30         ██████
0.5초 초과 ~ 1.0초 이하           8         ██
1.0초 초과                       2         ▌
합계                           100

경계 3개 → 구간 4개 → bucketCounts 길이 4
bucketCounts 합계 = count = 100
sum = 100건의 응답시간 합계 22.8초
평균 = 22.8초 ÷ 100건 = 228ms
```

`aggregationTemporality=1`은 해당 기간의 증분인 DELTA, `2`는 누적인 CUMULATIVE를 뜻한다. 서버 메트릭은 누적값을 지원하는 경우 이전 값과 차이를 구해 처리한다. RUM 히스토그램은 DELTA를 사용하며 서버 메트릭의 누적 처리 규칙을 그대로 적용하지 않는다.

### 5.4 트레이스 수신

수신 API: `POST /apm/otlp/v1/traces`

```text
resourceSpans[]
  ├─ resource.attributes[]
  └─ scopeSpans[]
       ├─ scope
       └─ spans[]
            ├─ traceId / spanId / parentSpanId
            ├─ name / kind
            ├─ startTimeUnixNano / endTimeUnixNano
            ├─ attributes[]
            ├─ events[]
            ├─ links[]
            └─ status
```

```json
{
  "resourceSpans": [{
    "resource": {
      "attributes": [
        {"key": "service.name", "value": {"stringValue": "orders-api"}},
        {"key": "deployment.environment.name", "value": {"stringValue": "production"}}
      ]
    },
    "scopeSpans": [{
      "scope": {"name": "example.http"},
      "spans": [{
        "traceId": "4bf92f3577b34da6a3ce929d0e0e4736",
        "spanId": "00f067aa0ba902b7",
        "name": "GET /orders/{id}",
        "kind": 2,
        "startTimeUnixNano": "1789430400000000000",
        "endTimeUnixNano": "1789430400320000000",
        "attributes": [
          {"key": "http.route", "value": {"stringValue": "/orders/{id}"}},
          {"key": "http.request.method", "value": {"stringValue": "GET"}},
          {"key": "http.response.status_code", "value": {"intValue": "200"}}
        ],
        "status": {"code": 1}
      }]
    }]
  }]
}
```

이는 320ms가 걸린 서버 처리 스팬의 예다. `kind=2`는 SERVER, `status.code=1`은 OK이며 HTTP 상태코드 200과는 별개다. traceId는 32자리, spanId는 16자리의 16진 문자열이다. 루트 스팬은 parentSpanId를 생략한다.

### 5.5 스팬의 부모·자식 관계와 처리 흐름

```text
Trace T1: 주문 내용 조회

스팬 A  orders-api / GET /orders/{id}         0ms ━━━━━━━━━━━━━━━━ 320ms
  │
  ├─ 스팬 B  PostgreSQL SELECT              20ms ━━━━━ 100ms
  │    parentSpanId = A
  │
  └─ 스팬 C  inventory-api로 HTTP 호출     120ms ━━━━━━━━━ 300ms
       parentSpanId = A
       │
       └─ 스팬 D  inventory-api 수신        130ms ━━━━━━━ 280ms
            parentSpanId = C

모든 스팬의 traceId = T1
```

부모 스팬의 시간에는 자식 스팬의 시간이 포함되므로 모든 스팬 시간을 더해 요청의 전체 시간으로 계산하지 않는다. 여러 서비스의 스팬을 연결하려면 호출 대상에 트레이스 컨텍스트를 전파해야 한다.

### 5.6 RUM의 수집 형식

| 데이터 | 수신 API | 내용 |
|---|---|---|
| 페이지 로드·fetch/XHR·예외 | POST /apm/rum/v1/traces?tokenId={tokenId} | resourceSpans 형식 |
| Web Vitals | POST /apm/rum/v1/metrics?tokenId={tokenId} | resourceMetrics 형식 |
| 브라우저 사전 요청 | OPTIONS /apm/rum/v1/traces?tokenId={tokenId}, OPTIONS /apm/rum/v1/metrics?tokenId={tokenId} | Origin·허용 조건 확인 |

RUM도 OTLP의 기본 구조를 사용한다. 서버용과 브라우저용은 인증·허용 속성·집계 방법이 다르다. 브라우저에는 RUM 전용 공개 토큰을 사용한다.

Web Vitals의 Gauge는 다음과 같은 형태로 `metrics[]`에 포함된다. 페이지 속성을 데이터포인트에 넣은 예다.

```json
{
  "name": "web_vitals.lcp",
  "unit": "ms",
  "gauge": {
    "dataPoints": [{
      "timeUnixNano": "1789430400000000000",
      "asDouble": 1800,
      "attributes": [
        {"key": "rum.page.path", "value": {"stringValue": "/orders/12345"}}
      ]
    }]
  }
}
```

```text
브라우저 측정
  documentLoad              → PV 집계
  페이지 경로               → 정규화한 페이지 그룹
  LCP·INP·CLS·TTFB·FCP       → 지표별 분포·p75
  navigation/resource timing → 이름별 평균 시간
  exception 이벤트          → JS 오류 그룹
  traceId                   → 저장된 서버 트레이스와 연결
        │
        ▼
5분 집계
  페이지 × 브라우저 × OS × 국가 힌트 × 시간 구간
```

| 지표 | 의미 | 단위 |
|---|---|---|
| LCP | 큰 주요 콘텐츠가 화면에 표시되기까지 걸린 시간 | ms |
| INP | 사용자 입력에 대한 반응 지연 | ms |
| CLS | 화면 요소가 예상치 않게 이동한 정도 | score |
| TTFB | 첫 응답 바이트를 받기까지 걸린 시간 | ms |
| FCP | 첫 콘텐츠가 표시되기까지 걸린 시간 | ms |

RUM의 `good`, `needs`, `poor`는 비율이 아니라 관측 수다. 세션은 페이지·분류·5분 구간별 중복 제거 수를 합산하므로, 전체 기간의 고유 방문자 수가 아니다. 국가 분류는 GeoIP 확정값이 아닌 힌트이며, 상세 timing 워터폴은 개별 방문 기록이 아닌 이름별 집계 평균이다.

한 페이지를 열 때 서버 API를 여러 번 호출할 수 있다. 따라서 RUM의 PV·세션 수와 서버의 requests는 일치할 필요가 없다. 브라우저 수집이 차단되거나 서버만 호출하는 클라이언트가 있어도 두 경로의 건수는 달라진다.

### 5.7 메시징·배치·Kubernetes

| 대상 | 필요한 대표 정보 | 만들어지는 화면 |
|---|---|---|
| 메시지 발행·소비 | PRODUCER/CONSUMER 스팬, messaging.system, messaging.destination.name, messaging.operation.type | 목적지별 처리량·오류·소비 지연 |
| 배치 작업 | INTERNAL 스팬, job.name, 실행 시작·종료, 스팬 상태 | 실행 이력·성공률·간트 |
| Kubernetes | 클러스터·네임스페이스·파드·노드·배포 정보, 재시작 관측값·종료 이유 | 인스턴스 표의 K8s 정보와 재시작·OOM 표시 |

메시지 소비 지연은 대응하는 발행 기록을 찾은 표본에서만 계산한다. 메시징 지표만으로 브로커 전체 큐 적체량을 측정했다고 해석하지 않는다. 배치 작업은 종료되어 스팬을 전송해야 목록에 나타나며, 진행 중 작업을 실시간으로 보여 주는 기능은 아니다.

K8s 기능은 서비스 인스턴스의 실행 환경과 재시작 정보를 보강한다. 현재 구현만으로 클러스터 전체의 CPU·메모리 관제를 모두 제공한다고 설명하지 않는다.

### 5.8 합성 감시의 외부 API와 데이터

| 용도 | Zabbix API·데이터 |
|---|---|
| 시나리오 조회 | httptest.get |
| 생성·수정·삭제 | httptest.create, httptest.update, httptest.delete |
| 단계·결과 정보 | 웹 시나리오와 연결된 web.test.* 아이템 |
| 시간별 측정값 | history.get 등 결과 이력 조회 |
| 알람 값 전달 | history.push |

```text
Zabbix 웹 시나리오
  httptestid
  name
  hostid
  steps[]
    ├─ httpstepid
    ├─ 단계 이름·순서·URL
    └─ 기대 응답 조건

Zabbix 결과 이력
  itemid  → 어떤 측정 항목인가
  clock   → 초 단위 시각
  ns      → 추가 나노초
  value   → 응답시간·응답코드·실패 값 등
       │
       ▼
MovesEye 응답
  시나리오 목록·단계별 추이·실패 사유·가용성 캘린더
```

이 경로는 OTLP로 앱 데이터를 받는 경로와 다르다. 감시 위치는 시나리오에 직접 지정하는 프록시 필드가 아니라 연결된 Zabbix 호스트의 모니터링 구성을 따른다.

### 5.9 수신·저장·화면 필드 연결표

| 수신 데이터 | 저장·가공 | 화면의 의미 |
|---|---|---|
| service.name + deployment.environment.name | 정규화한 서비스 식별 | 환경별 서비스 목록 |
| service.instance.id | 인스턴스 식별 | 인스턴스 표·버전 분포 |
| host.name | 호스트 연결 정보 | 서버 모니터링 이동 |
| service.version | 인스턴스 버전과 버전 변경 관측 | 배포 마커·롤아웃 비교 |
| http.server.request.duration의 count | 시간 구간별 요청 수 합 | requests·rps |
| HTTP 응답코드 | 1xx~5xx의 status_class로 집계 | 상태코드 분포·5xx 오류율 |
| http.route + http.request.method | route·method별 집계 차원 | 트랜잭션 표·선택 API 추이 |
| explicitBounds + bucketCounts | 경계 카탈로그와 구간별 건수 | p50·p95·p99·응답시간 히트맵 |
| exemplar의 traceId·값·시각 | 서로 짝을 유지한 대표 표본 | 응답시간 차트의 트레이스 링크 |
| db.query.text 또는 지원 별칭 | 원문 정책 적용·SQL 정규화·그룹화 | 쿼리 그룹·총 소요시간 |
| exception 이벤트의 유형·메시지 | 민감정보 처리·지문 생성 | 예외 그룹·발생 추이 |
| CLIENT 스팬과 하위 SERVER 스팬 | 부모·자식 연결을 통한 관계 집계 | 서비스 맵의 호출 화살표 |
| 브라우저 documentLoad | 페이지 그룹별 PV 합 | RUM 페이지 조회 수 |
| web_vitals.* | 지표별 단위 정규화·분포 | p75·good/needs/poor |

정규화는 표기만 바꾸는 작업이 아니다. 예를 들어 수집한 HTTP 404와 401은 메트릭 저장 단계에서 같은 4xx 분류로 묶일 수 있다. 원래의 개별 상태코드를 메트릭 조회에서 복원할 수는 없다. 스팬 속성은 별도의 보존·허용 정책을 따른다.

### 5.10 데이터 유형에 따라 다른 집계 규칙

| 유형 | 예 | 처리·해석 |
|---|---|---|
| Gauge | 메모리 사용량 | 관측 시점 값. 기간 합을 사용량으로 읽지 않음 |
| 누적 Counter | 시작 후 요청 누계 | 같은 시계열의 이전 관측과 차이를 계산 |
| DELTA Histogram | 최근 전송 구간의 응답시간 분포 | 새 구간의 건수·합·분포를 더함 |
| CUMULATIVE Histogram | 프로세스 시작 후 누적 분포 | 누적 건수·합·버킷을 차분. 누적 min/max는 구간별 극값으로 차분할 수 없음 |
| UpDownCounter 계열 | 진행 중 요청·풀 사용 상태 | 증가량을 단순 누적하는 Counter와 구분. 해당 지표의 조회 정책 확인 |
| Span | 요청 처리 한 구간 | 시작·종료·부모 관계로 상세 및 파생 집계 구성 |

DELTA를 선호하도록 설정해도 모든 계측이 DELTA로 바뀌는 것은 아니다. 서버는 실제 유형과 temporality를 기준으로 처리한다. 누적값 차분 대상은 CUMULATIVE Histogram과 단조 증가 SUM이다. Gauge와 증가·감소가 가능한 SUM에는 이 차분을 적용하지 않는다.

누적 시계열을 처음 받으면 시작 시각부터 관측 시각까지 120초 미만인 경우 현재 누적값 전체를 첫 증가분으로 사용한다. 그 밖의 첫 관측은 기준값으로만 기억하고 집계에서 제외하며 CUMULATIVE_FIRST_SKIPPED로 기록한다. 이후 관측부터 이전 값과의 차이를 사용한다. 시작 시각 변경, 건수·값 감소, 히스토그램 버킷 수 변경을 감지하면 초기화된 시계열로 보고 현재 값을 새 증가분으로 처리한다.

히스토그램 경계를 바꿀 때 이미 있는 구간을 합칠 수는 있지만, 넓은 한 구간을 여러 구간으로 나눌 원시 관측값은 없다. 서로 다른 SDK의 경계를 억지로 합쳐 그럴듯한 p95를 만들지 않도록 mixedBounds와 재버킷 표시를 제공한다.

## 6. 저장 형식과 보존

### 6.1 저장 후의 논리 구조

다음은 이해를 위한 핵심 컬럼 구조이며 전체 DDL은 아니다.

```text
서비스
  service_uid / service_name / environment
       │
       ├─ 인스턴스: instance_id / host / version / last_seen
       │
       ├─ 메트릭
       │    service + instance + metric + dimensions + time bucket
       │    count / sum / min / max / histogram / 대표 traceId
       │
       ├─ 스팬
       │    trace_id + span_id + start_ts
       │    parent_span_id / name / kind / end_ts / attributes / events
       │
       └─ 파생 집계
            호출 관계 / 예외 그룹 / SQL 그룹 / 외부 호출 / 메시징 / 배치

RUM 토큰
  token_id + 허용 Origin + 상한
       └─ 페이지 그룹·분류·5분 버킷
            PV / 버킷별 세션 수 / Web Vitals 분포 / timing / JS 오류
```

HTTP route, method, 상태 분류 등 집계 기준 속성을 dimensions라고 부른다. 서비스당 route가 너무 많아지면 초과분을 `__other__`로 합쳐 데이터 크기를 제어한다. 속성을 제한 없이 모두 저장하지 않는다.

### 6.2 기본 보존 기간

| 데이터 | 주요 테이블 | 기본 보존 |
|---|---|---|
| 1분 메트릭·인스턴스별 값 | apm_metric_1m | 7일 |
| 5분 메트릭 | apm_metric_5m | 30일 |
| 1시간 메트릭 | apm_metric_1h | 400일 |
| 스팬·트레이스 요약 | apm_span, apm_trace_summary | 7일 |
| 서비스 맵·DB·외부 호출·메시징 5분 집계 | apm_service_edge_5m, apm_db_query_group_5m, apm_dependency_5m, apm_messaging_5m | 30일 |
| 예외 시간별 집계 | apm_error_group_1h | 90일 |
| 예외·쿼리 그룹 본체 | apm_error_group, apm_db_query_group | 마지막 발생 후 90일 |
| 배치 실행 | apm_job_run | 90일 |
| 배포·알람·SLO 스냅샷 | apm_deployment, apm_alert_event, apm_slo_snapshot | 400일 |
| RUM 페이지·세션·timing·오류 집계 | apm_rum_page_5m 등 | 30일 |
| RUM 브라우저 스팬 | apm_rum_span | 7일 |
| RUM JS 오류 그룹 | apm_rum_js_error_group | 마지막 관측 후 90일 |
| 합성 감시 결과 | Zabbix 이력 | Zabbix의 보존 설정에 따름 |
| APM 리포트 | apm_report_snapshot | 리포트 관리의 보존 정책에 따름 |

집계 데이터보다 원시 트레이스가 먼저 만료된다. 따라서 30일 전 오류 그룹은 보여도 그때의 트레이스 상세는 열리지 않을 수 있다.

### 6.3 롤업과 재전송이 숫자에 미치는 영향

```text
메트릭
  같은 1분의 건수·증가분·히스토그램 → 해당 집계값에 더하기
  같은 1분의 Gauge → 지표별 평균·최솟값·최댓값 등에 필요한 값 집계
  완성된 1분 값들 → 5분 전체를 다시 계산해 대입
  완성된 5분 값들 → 1시간 전체를 다시 계산해 대입

트레이스
  여러 배치로 도착한 스팬 → traceId·spanId로 중복을 구분해 저장
  지연 도착한 부모·자식 → 원본 스팬 저장과 트레이스 요약 병합
  저장 스팬 → 맵·예외·DB·의존·메시징·배치 집계

RUM
  수신 관측 → 중복 확인과 5분 집계를 같은 트랜잭션으로 처리
  페이지·timing·오류 집계 → 별도 1분 롤업 없이 조회
```

워터마크는 “어느 시간 구간까지 집계를 끝냈는가”라는 기록이다. 메트릭 롤업은 기본 2분, 트레이스 집계는 기본 3분의 지연 여유를 두어 늦게 도착하는 데이터를 기다린다. 배치 실행 주기까지 더해지므로 트레이스 집계 화면은 정상 상태에서도 수분 늦게 반영될 수 있다. 정체가 있으면 더 오래 걸린다.

늦게 도착한 스팬이 원본에 저장되었다고 이미 완료된 모든 파생 집계가 다시 계산되는 것은 아니다. 트레이스 롤업은 기본적으로 워터마크 뒤쪽의 최근 5분 버킷 2개를 다시 읽는다. 기본 지연 3분과 재계산 범위 10분을 합쳐 설계 문서에서는 약 13분의 지연 여유로 설명하지만, 이는 모든 집계에 대한 도착 시한 보장이 아니다. 재계산 범위를 벗어난 스팬은 원본 상세에 있어도 파생 집계에 반영되지 않을 수 있다. 배치 작업 집계는 완료 시각을 사용하는 별도 처리 경로도 확인해야 한다.

원본을 다시 계산하는 롤업에서 결과를 기존 값에 더하면 재실행 때 두 번 센다. 따라서 롤업은 계산한 전체 결과를 대입한다. “DB 트랜잭션을 썼다”는 사실만으로 재전송 중복까지 해결되는 것은 아니다.

### 6.4 저장 용량과 성능을 판단하는 기준

행 수는 요청량뿐 아니라 서비스·인스턴스·API 경로·메서드·상태 분류처럼 서로 다른 집계 조합의 수에 영향을 받는다. 같은 API에 요청이 더 들어오는 경우와 새로운 API 경로가 계속 생기는 경우는 저장 부담이 다르다.

```text
1분 메트릭 일일 행 수의 대략적인 기준
  활성 집계 조합 수 × 1,440분

1분 메트릭 저장량의 대략적인 기준
  실제 일일 행 수 × 실측 행당 크기 × 보존 일수
```

| 기준 | handbook에 기록된 실측·설계값 | 사용 방법 |
|---|---|---|
| 예시 부하 | 서비스 10개·인스턴스 3개·route 50개에 메트릭 종류·메서드·상태 등 추가 차원을 포함한 시험에서 하루 약 1,404만 행 | 10 × 3 × 50 × 1,440의 단순 곱이 아님. 실제 활성 조합으로 산정 |
| 행당 비용 | 약 686바이트, 인덱스 포함 | 환경별 테이블·인덱스 크기를 다시 측정 |
| 예시 보존량 | 해당 시험 조건의 1분 7일 약 67GB, 메트릭 3단 합계 약 109GB | 트레이스·WAL·백업 등 전체 설치 용량과 구분 |
| 정상 롤업 | 시험 환경에서 1회 약 1.2초 | 대량 백필 소요시간과 구분 |
| 저장량 검토 기준 | 1분 메트릭 하루 2,000만 행에서 검토, 3,500만 행에서 전환 착수 기준 | 제품의 절대 수용 한도가 아닌 내부 계획 기준 |
| 화면 응답 검토 기준 | 캐시가 비어 있는 목록 p50 3초 초과 또는 6시간 RED 1.5초 초과 | DB 튜닝과 조회 조건 확인 후 판단 |
| 롤업 검토 기준 | 정상 1회가 60초 초과 | 백필·일시 장애를 제외한 반복 상태 확인 |
| 트레이스 저장소 검토 | 일일 스팬 2,000만 건 | 메트릭 행 수와 별도 측정 |

이 수치는 handbook의 R3 검증 기록과 설계상 판단 기준이다. 이번 문서 보강에서 다시 측정한 성능 보장값은 아니다. 위 메트릭 용량에는 해당 인덱스 비용이 이미 포함되어 있으므로 중복해서 더하지 않는다. 전체 디스크 계획에는 트레이스·RUM 등 다른 데이터와 그 인덱스, WAL·백업·운영 여유 공간을 별도로 더한다.

## 7. 화면 응답 데이터 형식

### 7.1 공통 단위와 인증

| 항목 | 규칙 |
|---|---|
| from, to | 일반 APM 시간 범위는 Unix epoch 밀리초 |
| step | 초 단위 집계 간격. 대표값 60·300·3600 |
| points[].ts | 시계열 버킷 시작 시각, 밀리초 |
| lastSeenAt 등 | ISO 8601 시각 문자열 |
| 지연 | p95Ms처럼 ms가 붙은 필드는 밀리초 |
| 비율 | errorRatePct 등은 0~100의 % |
| 일반 조회·수정 응답 | 공통 응답의 data 안에 실제 데이터 포함 |
| 일반 브라우저 호출 | 로그인 인증 쿠키와 x-visitor-id 헤더 사용. Live EventSource는 accessToken 쿠키와 visitorId 쿼리 사용 |
| 서버 OTLP 수신 | 수신용 Bearer 토큰의 종류·scope 확인 |
| RUM 수신 | RUM 공개 토큰·tokenId·허용 Origin 확인 |
| 배포 웹훅 | deploy scope 토큰 사용 |

일반 API는 HTTP 200 안에 업무 오류 code가 포함될 수 있으므로, HTTP 상태만 보고 성공을 판단하지 않는다. OTLP 수신은 재시도 여부를 결정해야 하므로 실제 HTTP 상태를 사용한다. Collector 설정 생성은 YAML, 실시간 스트림은 SSE로 반환한다.

### 7.2 RED 시계열 응답 예시

아래는 공통 응답 외피를 제외한 `data`의 구조 예시다. 수집 JSON과 화면 응답 JSON은 서로 다르다.

```json
{
  "step": 60,
  "points": [{
    "ts": 1789430400000,
    "requests": 600,
    "errors": 6,
    "rps": 10.0,
    "errorRatePct": 1.0,
    "p50Ms": 80.0,
    "p95Ms": 320.0,
    "p99Ms": 900.0,
    "activeRequests": 4.0,
    "apdex": 0.97
  }],
  "rebucketed": false,
  "sampleWarning": false,
  "mixedBounds": false,
  "deployments": []
}
```

```text
수집한 http.server.request.duration 히스토그램
       │ 정규화·집계
       ▼
requests / errors / rps / p50Ms / p95Ms / p99Ms
       │ GET /apm/services/{uid}/red-series
       ▼
요청량 차트 + 오류율 차트 + 응답시간 차트 + Apdex
```

같은 응답의 `points`를 여러 차트가 나누어 사용한다. 엔드포인트·인스턴스 시계열도 같은 RED 형태를 사용하지만, `activeRequests`처럼 해당 축에 제공하지 않는 필드는 null일 수 있다.

### 7.3 RUM 페이지 목록 응답 구조

```text
data
  from / to                    실제 조회 구간(ms)
  stepSeconds                  300
  sessionMode                  DISTINCT_PER_PAGE_DIMENSION_5M_SUM
  truncated                    일부 결과 제한 여부
  pages[]
    groupId / tokenId / path
    pv / sessions
    lcpP75Ms / inpP75Ms / clsP75
    jsErrorCount
    resourceCount / resourceBytes
    mixedBounds / rebucketed
```

현재 페이지 목록 행에는 `ttfbP75Ms`가 없다. 전체 Web Vitals 또는 페이지 상세의 `vitals`와 페이지 목록 행을 구분해야 한다. 현재 RUM의 시간별 Point는 `ts`, `pv`, `sessions`로 구성되어 있으며 Web Vitals p75 시계열은 제공하지 않는다.

### 7.4 실시간 응답의 동작

```text
첫 접속             snapshot 이벤트 → 최근 창 전체 표시
수신 후 갱신         bucket 이벤트   → 같은 서비스·시각의 버킷 교체
연결 복구            snapshot 이벤트 → 창 전체 복원
```

스냅샷과 증분은 같은 데이터 형식을 사용한다. `services[].buckets[]`가 가진 범위가 다를 뿐이다. 프론트엔드는 `(serviceUid, ts)`로 기존 칸을 교체해야 하며 반복 수신 값을 계속 더하면 안 된다.

기본 실시간 창은 15분, 버킷은 10초다. 이는 화면 집계 간격이며 실제 전송 지연이 항상 10초라는 뜻은 아니다. 앱 export 주기, Collector batch, 네트워크 지연이 함께 영향을 준다. 메모리 기반이므로 BE 재시작 후 이전 실시간 버퍼는 복원되지 않는다.

## 8. 설치와 운영

### 8.1 서버 애플리케이션 연결 순서

1. APM 라이선스와 계정의 조회·관리 권한을 확인한다.
2. 수집기 메뉴에서 서버 수신 토큰을 발급한다.
3. 설정 기본값과 설치 안내를 확인하고 Collector YAML을 생성한다.
4. Collector의 MovesEye endpoint는 `/apm/otlp`까지 지정한다. exporter가 `/v1/metrics` 또는 `/v1/traces`를 붙인다.
5. 애플리케이션에 언어별 OTel Agent 또는 SDK를 연결한다.
6. 서비스명, 환경, 인스턴스 ID, 버전, 호스트명을 일관되게 지정한다.
7. 테스트 요청을 발생시킨다.
8. 수집기 수신 현황 → 서비스 등록 → 메트릭 → 트레이스 순서로 확인한다.
9. 서비스 맵·DB·메시징 등 집계 화면은 롤업 지연을 고려해 확인한다.

설치 가이드와 과거 Live 설계에는 10초·15초 export 주기 설명이 함께 남아 있다. 실제 적용한 Agent 환경변수와 생성 설정을 기준으로 판단하며, 실시간 버킷 간격과 혼동하지 않는다.

### 8.2 RUM 연결 순서

1. RUM 토큰을 발급하고 실제 프론트엔드 Origin을 허용 목록에 등록한다.
2. 스니펫 API가 제공하는 SDK 설치 명령과 코드를 애플리케이션 번들에 반영한다.
3. RUM endpoint에 대한 CSP connect-src와 CORS 조건을 확인한다.
4. 서버 트레이스 연결이 필요하면 허용한 호출 대상에 트레이스 헤더를 전파한다.
5. 실제 브라우저에서 페이지 방문·클릭·fetch·오류를 발생시킨다.
6. OPTIONS와 POST 결과, RUM 집계, 서버 트레이스 연결을 순서대로 확인한다.

서버 수집용 토큰은 브라우저에 넣지 않는다. RUM 토큰의 기본 제한은 초당 20회, 해제 후 본문 256KiB, UTC 일별 100,000개 스팬·데이터포인트다. 발급 설정과 노드 수에 따라 실제 운영 조건을 확인한다.

### 8.3 알람과 SLO

알람 평가는 MovesEye가 수행하고, 외부 전달은 Zabbix 액션이 담당한다. `history.push` 성공은 값 전달 성공이며 이메일·메신저 도달까지 보장하는 것은 아니다.

```text
최근 메트릭 확인
  → 규칙 임계 평가
  → 알람 이벤트 기록·Zabbix 값 전달
  → Zabbix 트리거
  → 알림 액션
  → 수신자 도달 확인
```

SLO는 서비스 목표다. 예를 들어 요청 성공률 목표가 99.9%이고 평가 구간에 요청이 100,000건이면 허용 실패량은 100건이다. 실패 60건이 발생했다면 그 기준의 잔여 예산은 40건이다. 실제 SLO 화면은 정의된 창과 수신 데이터로 계산하므로, 단순한 시간 기반 가용성과 구분해서 읽는다.

번 레이트는 허용 실패 비율에 비해 실제 실패 비율이 얼마나 높은지를 나타낸다. 목표 99.9%의 허용 실패 비율은 0.1%다. 관측 실패율이 1%이면 번 레이트는 `1% ÷ 0.1% = 10`이다.

현재 구현은 긴 창과 짧은 확인 창을 AND로 묶고, 빠른 소진과 느린 소진 두 조건을 OR로 묶는다. 모든 창을 OR로 연결하는 규칙이 아니다. 긴 창은 문제의 규모를, 짧은 창은 문제가 아직 지속되는지를 확인한다. [Google SRE의 멀티윈도우 알람 설명](https://sre.google/workbook/alerting-on-slos/)

```text
빠른 소진 = 최근 1시간 burn > T
            AND 최근 5분 burn > T

느린 소진 = 최근 6시간 burn > T/2.4
            AND 최근 30분 burn > T/2.4

알람 조건 = 빠른 소진 OR 느린 소진

기본 T = 0.02 × SLO 기간(일) × 24
30일 목표: 빠른 소진 기준 14.4, 느린 소진 기준 6
 7일 목표: 빠른 소진 기준 3.36, 느린 소진 기준 1.4
```

예를 들어 30일 SLO에서 6시간·30분 burn이 모두 10이면 느린 소진 조건을 충족한다. 1시간 burn이 14.4보다 작다는 이유로 이 알람을 막으면 지속적인 예산 소진을 놓친다. 반대로 1시간 burn이 높아도 최근 5분이 회복되었다면 빠른 소진의 확인 조건은 충족하지 않는다.

| SLO 데이터 | 읽는 방법 |
|---|---|
| measured / requests | SLI 계산에 쓸 수 있었던 관측 수와 전체 요청 수. 특히 지연 SLI에서 같지 않을 수 있음 |
| budgetRemainingPct | 음수이면 예산 초과. 게이지 바늘 범위와 실제 숫자를 구분 |
| finalized | 일별 결과가 확정되었는지 여부 |
| staleDefinition | 현재와 다른 과거 정의로 계산된 스냅샷 |
| UNKNOWN | 측정할 근거가 부족함. 0% 실패 또는 100% 성공으로 치환하지 않음 |
| SLO_BURN 전달값 | 양수는 소진 조건 충족, 0은 비발화, -1은 측정 불가·비활성 등의 구분값 |

SLO 정의를 바꾸어도 과거 기록을 새 정의로 모두 다시 계산하지 않는다. 롤링 창의 현재값과 날짜별 스냅샷을 비교할 때 기간·확정 여부·당시 정의를 함께 확인한다.

### 8.4 권한

| 대상 | 기본 권한 기준 |
|---|---|
| APM 분석 화면·SLO 조회 | apm.view |
| 서비스 설정·SLO 수정·합성 감시 관리 | apm.edit |
| 수집기·수신 토큰·수집 정책 | 조회도 apm.edit |
| 알람 규칙 관리 화면 | 조회도 apm.edit |
| APM 리포트 관리 | 관리자 권한 |
| SQL·스택 등 원문 | 조회 권한 외에 관리자 역할 등 원문 정책 적용 |

수집 시 제거하거나 마스킹한 원문은 나중에 관리자 권한을 주어도 복원되지 않는다.

`edit` 권한이 `view`를 자동으로 포함한다고 가정하지 않는다. 계정의 분석 화면 이용과 관리 작업을 각각 설정한다. POST라고 모두 관리 API인 것도 아니다. 트레이스 비교는 조회 기능이며, 토큰 목록 GET은 관리 정보다.

### 8.5 언어별 계측과 검증 범위

아래는 handbook에 기록된 MovesEye 설치·검증 기준이다. 언어 생태계 전체에서 가능한 모든 계측 방법을 뜻하지 않는다. 실제 설치 명령과 옵션은 설치 가이드 API가 제공하는 조합을 따른다.

| 스택 | 계측 시작점 | 별도 확인 |
|---|---|---|
| Java | JVM 실행 옵션에 -javaagent 추가 | 서비스명·환경·버전·DB semantic convention 설정 |
| .NET | OTel 자동 계측 설치와 환경변수 | HTTP·DB semantic convention 및 사용 라이브러리 지원 |
| Node.js | 자동 계측 패키지 등록 | grpc 설정, http·database opt-in, 실제 생성 메트릭 이름 |
| Python | opentelemetry-instrument로 앱 실행 | grpc 설정, http·database opt-in, 구 메트릭 이름 유입 여부 |
| Go | 이 프로젝트의 안내는 SDK·HTTP 계측 초기화 | 코드 반영이 필요한 범위를 확인 |
| 업무 메서드·배치 | 추가 계측 설정 또는 수동 스팬 | 업무 이름·성공/실패·실행 단위를 명시 |

handbook 검증 조합은 Collector contrib 0.159.0과 Java Agent 2.31.1이다. “최신 버전”이라는 뜻이 아니라 프로젝트가 검증 기준으로 고정한 조합이다. Agent나 SDK를 교체하면 메트릭 이름·단위·히스토그램 경계가 달라지는지 확인한다.

| 공통 설정 | 목적 |
|---|---|
| OTEL_SERVICE_NAME | 서비스 등록 이름 |
| OTEL_EXPORTER_OTLP_ENDPOINT | 앱에서 보낼 Collector 주소 |
| OTEL_EXPORTER_OTLP_PROTOCOL | grpc 등 주소·포트와 맞는 전송 방식 |
| OTEL_RESOURCE_ATTRIBUTES | 환경·인스턴스·버전 등 식별 정보 |
| OTEL_SEMCONV_STABILITY_OPT_IN | 설치 가이드가 요구하는 HTTP·DB 표준 이름 사용 |
| OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE | 메트릭 증분 전송 선호 설정. 모든 유형이 바뀌는 것은 아님 |
| OTEL_METRIC_EXPORT_INTERVAL | 실제 메트릭 전송 간격 |

Java의 active_requests 관측과 Node·Python의 미제공 사례가 검증 기록에 있다. HTTP 요청 지표를 확인했다고 모든 JVM·.NET·Node·Python·Go 런타임 슬롯까지 검증된 것으로 보지 않는다.

### 8.6 서비스 등록·숨김·삭제

| 정책·동작 | 의미 | 운영자가 확인할 점 |
|---|---|---|
| AUTO | 정상 식별된 새 서비스를 자동 등록 | 서비스 이름과 환경이 의도대로 구분되는지 |
| APPROVE | 신규 서비스를 승인 대기열에 올림 | 승인 전 관측을 장기 보관해 소급 복원하는 기능이 아님 |
| ALLOWLIST | 사전 허용한 서비스만 수집 대상 | 허용 설정과 실제 서비스 식별 정보 일치 |
| unknown_service | 서비스 이름을 식별하지 못한 상태 | Agent의 OTEL_SERVICE_NAME 설정 |
| 숨김 | 목록 노출을 줄이는 상태 | 수집 중지와 다름 |
| 자동 숨김 | 기본 정책상 장기 미수신 서비스를 숨김 처리 | handbook 기본값은 14일. 실제 보존·등록 설정 확인 |
| 삭제 | 숨김 상태의 서비스 삭제 요청 | 관련 데이터별 참조·보존 정책 확인. 숨김과 동일하지 않음 |

토큰을 새로 발급했다고 기존 토큰이 자동 회수되는 것으로 간주하지 않는다. 새 설정의 수신을 확인한 뒤 교체 대상 토큰의 회수 상태를 별도로 확인한다.

### 8.7 Collector·DB·Zabbix 설치 점검

| 구성요소 | 설치 시 확인 | 빠뜨리면 나타나는 현상 |
|---|---|---|
| Collector 설정 파일 | 생성 YAML과 발급 토큰을 올바르게 배치 | 실행은 되어도 인증 실패·잘못된 주소 전송 |
| 디스크 큐 | file_storage.directory와 실제 경로·쓰기 권한 일치 | 일시 장애 때 버퍼링 실패 |
| OS 서비스 | Windows 서비스 또는 Linux systemd로 실행·재시작 관리 | 터미널 종료 후 수집 중단 |
| 네트워크 | 앱 → Collector 4317/4318, Collector → MovesEye API | 최근 수신 없음·큐 증가 |
| 자기 모니터링 | Collector의 8888 메트릭과 13133 health 구성 확인 | 수집기 상태를 판단할 근거 부족 |
| PostgreSQL | 정렬·집계 메모리, 파티션·인덱스, WAL·디스크 | 조회 지연·롤업 정체·적재 실패 |
| Zabbix | 대상 호스트·아이템·트리거 관리 권한과 알림 액션 | 규칙은 있으나 값 전달·알림이 실패 |
| Reverse proxy | SSE 응답이 버퍼에 오래 머무르지 않는지 | 실시간 이벤트가 한꺼번에 표시 |

handbook의 시험 환경에서는 work_mem을 4MB에서 64MB로 조정했을 때 큰 집계의 디스크 임시파일 사용이 줄었다. 이를 모든 설치에 그대로 적용하지는 않는다. work_mem은 쿼리의 정렬·해시 작업마다 사용될 수 있고 여러 세션·작업이 겹치므로 전체 메모리와 동시 부하를 함께 계산해야 한다. [PostgreSQL 자원 설정](https://www.postgresql.org/docs/current/runtime-config-resource.html)

기록된 다른 검토값은 shared_buffers 약 RAM 25%, maintenance_work_mem 1GB, max_wal_size 4GB다. 이 값은 환경별 검토 출발점이며 자동 변경 지시가 아니다. 튜닝 전후에 동일 조회 조건의 실행계획·응답시간·임시파일·메모리 사용을 비교한다.

### 8.8 RUM·K8s 운영에서 추가로 확인할 사항

| RUM 항목 | 설명 |
|---|---|
| 스니펫 형태 | CDN 태그 하나가 아닌 번들러용 ES module |
| SDK 조합 | 프로젝트 안내는 OTel JS 2.x 기준. 실제 번들 실행 검증 필요 |
| 동의 상태 | 기본 consentGranted=false. 사이트의 동의 처리와 연결 |
| Origin | scheme·host·port가 맞는 정확한 허용값 사용. 빈 목록은 수신 중지 |
| 세션 | 탭 메모리 기반 식별과 서버의 5분 집계 정의를 함께 고려 |
| 예산 | 일일 예산은 수신량 기준이며 재전송·중복도 차감될 수 있음 |
| 신뢰 수준 | 공개 브라우저 데이터이므로 서버 RED·SLO·서비스 맵·리포트 집계에 섞지 않음 |
| 트레이스 연결 | 브라우저 스팬은 상세 표시에서 합류. 서버 집계의 진실성을 대체하지 않음 |

| K8s 구성 | 역할·조건 |
|---|---|
| k8sattributes | 스팬·메트릭에 파드·네임스페이스·노드 등의 리소스 속성 보강 |
| kubeletstats | kubelet에서 노드·파드·컨테이너 지표 수집. 운영 배치 형태와 TLS 확인 |
| k8s_cluster | 클러스터 API에서 재시작 등 상태 관측. 중복 수집되지 않도록 구성 |
| 권한·실행 환경 | ServiceAccount RBAC, 노드 정보, kubelet CA 등 인프라 설정 필요 |
| 권장 분리 구조 | 노드별 kubeletstats와 클러스터 단위 k8s_cluster의 역할 분리 |
| 현재 매칭 한계 | namespace+pod로 기존 APM 인스턴스를 연결하는 범위를 확인. 다중 클러스터 식별은 추가 검증 대상 |

재시작은 누적값이 이전보다 증가했을 때의 변화로 판단한다. 최초 관측값이 3이라고 해서 이번 관측에서 세 번 재시작했다고 표시하지 않는다. OOM 종료 이유도 반복 보고될 수 있으므로 값이 계속 존재한다는 이유만으로 매번 새 OOM으로 기록하지 않는다. 배지는 최근 상태이고 restartedAt·oomKilledAt은 관측 이력이다.

### 8.9 민감정보·토큰·라이선스

민감정보 처리는 Agent 기본 동작, Collector의 속성 제거·마스킹, BE 허용목록·원문 정책의 여러 단계에서 이루어진다. Exemplar에 들어올 수 있는 부가 속성도 그대로 화면에 전달하지 않는다. SQL 원문 저장을 허용할 때에는 수집 설정과 원문 조회 권한을 모두 확인한다.

| 항목 | 운영 원칙 |
|---|---|
| 서버 토큰 원문 | 발급 시 한 번만 확인. DB 해시에서 원문을 다시 꺼내지 못함 |
| 토큰 위치 | 인증 토큰을 URL 쿼리에 넣지 않음. RUM tokenId와 SSE visitorId는 토큰 원문이 아님 |
| Collector 설정 | 토큰이 포함되므로 서비스 계정·관리자 중심으로 파일 권한 제한 |
| RUM 데이터 | 원시 IP·전체 URL 쿼리·입력값·세션 리플레이를 수집 목적에 포함하지 않음 |
| 라이선스 만료 전 | 수집 지속 여부와 갱신 계획 확인. 중단할 경우 Collector·토큰·큐 처리 순서를 정함 |
| 만료 후 서버 수신 | APM 수신이 403으로 거절되면 exporter는 영구 실패로 폐기할 수 있음 |
| 갱신 후 | 새로 수신되는 데이터부터 복구. 만료 중 폐기된 데이터가 자동 재생되지는 않음 |
| 저장 유지 배치 | 파티션·롤업·보존 등 내부 데이터 유지 작업과 알람 평가의 라이선스 조건은 다름 |

APM 도입 버전에서 권한 구조가 추가되는 경우 BE 코드·마이그레이션을 먼저 반영한 뒤 FE를 연결한다. 적용된 Flyway 파일을 수정해 기존 환경에 새 변경이 실행될 것이라고 가정하지 않는다. 실제 배포·복구 절차는 설치본의 버전과 마이그레이션 상태에 맞춘다.

## 9. 장애 확인 순서

| 증상 | 확인 순서 | 오해하기 쉬운 부분 |
|---|---|---|
| 서비스가 목록에 없음 | 수신 현황 → 토큰 → 등록 정책 → 승인 대기·미식별 → 허용 메트릭 | 앱이 실행 중이어도 계측이 없으면 APM에 등록되지 않음 |
| 서비스가 STALE | Agent 실행 → Collector 수신 → 큐·전송 실패 → 최근 수신 | 앱 장애와 수집 장애를 구분 |
| 메트릭은 있는데 트레이스가 없음 | trace exporter → tail 정책 → 수신 scope → 저장 기간 | 정상 요청은 일부만 남길 수 있음 |
| traceId 링크가 열리지 않음 | stored 여부 → 보존 7일 → 실제 서버/브라우저 연결 | Exemplar 존재가 트레이스 저장을 보장하지 않음 |
| 서비스 맵·DB 표가 늦게 갱신됨 | 트레이스 수신 → 집계 배치 → 선택 기간 | 기본 설계상 집계 지연이 수분 발생 |
| RUM이 비어 있음 | Origin → OPTIONS → 공개 토큰·tokenId → CSP → 전송 형식 → 5분 집계 | 페이지를 열기만 해서는 INP 등 모든 지표가 관측되지 않을 수 있음 |
| 알람은 있지만 메신저가 안 옴 | 규칙 적용 → Zabbix 동기화 → 액션 조건 → 수신자·매체 | 알람 생성과 외부 도달은 별도 검증 |
| p95가 —로 보임 | 요청 유무 → sampleWarning → mixedBounds → 보존·해상도 | 0ms로 바꾸면 안 됨 |
| 메시징·배치가 비어 있음 | 실제 스팬의 kind → messaging.system 또는 job.name → 집계 배치 | 자동 계측만으로 모든 업무 스팬이 생기는 것은 아님 |

### 수신 HTTP 결과

| 상태 | 의미 | 조치 |
|---|---|---|
| 200 | 요청 처리 완료 | partialSuccess와 폐기 통계도 확인 |
| 400 | JSON·입력 형식 문제 | payload 수정 |
| 401 | 토큰 인증 실패 | 토큰 확인 |
| 403 | 종류·scope·Origin·라이선스 등 허용 조건 위반 | 응답 사유와 설정 확인 |
| 413 | 본문·배치 상한 초과 | batch 또는 발급 상한 조정 |
| 415 | 지원하지 않는 Content-Type·인코딩 | JSON 전송 설정 확인 |
| 429 | 처리량·예산 제한 | Retry-After와 한도 확인 |
| 503 | 일시적으로 수신·적재 불가 | 장애 원인을 복구하고 재시도 확인 |

Collector의 HTTP exporter는 모든 5xx를 같은 방식으로 재시도하지 않는다. 현재 수신 계약은 429·502·503·504 등을 재시도 대상으로 다루며, 적재 실패를 503으로 반환한다. 특히 `POST /apm/otlp/v1/logs`의 200은 저장 성공을 뜻하지 않는다. 현재 로그는 `SIGNAL_NOT_SUPPORTED`로 폐기 집계하며 조회 화면은 미개방이다.

### 9.1 느린 서비스의 조사 흐름

```text
서비스가 느리다
  │
  ├─ STALE 또는 UNKNOWN인가
  │    └─ 수집기 → 토큰 → 수신 현황 → 앱 Agent 확인
  │
  └─ 성능 데이터는 정상적으로 들어오는가
       │
       ├─ 대부분의 API가 함께 느림
       │    └─ 런타임·GC → 연결 풀 대기 → 외부 호출 → 서비스 맵
       │
       └─ 특정 API만 느림
            └─ 해당 route 선택 → 예외 그룹 → 느린 트레이스 워터폴
                 │
                 ├─ DB 구간이 큼 → SQL 그룹·총 소요시간·호출 횟수
                 ├─ 외부 호출이 큼 → 대상별 지연·타임아웃
                 └─ 자체 처리 구간이 큼 → 추가 업무 계측 검토

공통 확인: 배포 시점, 인스턴스별 차이, 선택 기간과 표본 수
```

이 흐름은 조사 우선순위다. 같은 시각의 배포·GC·오류가 함께 보인다는 사실만으로 원인을 확정하지 않는다. 후보를 좁힌 뒤 해당 트레이스와 인스턴스·외부 시스템의 관측을 대조한다.

### 9.2 수신 성공 후에도 확인할 폐기·품질 사유

| 사유·표시 | 의미 | 다음 확인 |
|---|---|---|
| NOT_ALLOWLISTED | 저장 허용목록 밖의 이름·유형 | SDK 버전·semantic convention·지원 메트릭 |
| unknown_service | 서비스 식별 실패 | 서비스명·환경·등록 설정 |
| RAW_BOUNDS | 공통 경계로 합치지 못해 원본 경계 사용 | 같은 서비스에서 SDK·경계가 혼재하는지 |
| REBUCKETED | 공통 경계에 맞게 재버킷 처리 | 근사값임을 고려해 지연 해석 |
| BOUNDS_CONFLICT | 동일 저장 구간에서 경계 충돌 | 백분위 null·mixedBounds 확인 |
| __other__ | route 상한 등으로 여러 경로를 묶음 | 경로에 고유 ID를 그대로 넣는지 확인 |
| SIGNAL_NOT_SUPPORTED | 현재 저장하지 않는 시그널 | 로그 등 미지원 범위인지 확인 |
| K8S_ENRICHMENT_FAILED | K8s 정보 보강 중 실패 | 기본 데이터 수신과 K8s 보강을 분리해 진단 |

이 표에는 폐기 사유와 품질 표시가 함께 있다. RAW_BOUNDS·REBUCKETED처럼 저장은 되었지만 해석 조건이 달라지는 경우를 모두 손실로 합산하지 않는다. 폐기 통계의 기간 필터도 반드시 구간 내 증분이라는 뜻은 아니다. 누적 count와 마지막 발생 시각을 구분한다.

### 9.3 실제 운영에서 자주 생기는 오해

| 오해 | 확인된 동작과 올바른 해석 |
|---|---|
| Exemplar는 그 구간에서 가장 느린 요청이다 | 대표 표본이며 최댓값과 별개다. 값·traceId·시각의 짝을 확인 |
| 예외가 90일 남으므로 트레이스도 90일 남는다 | 그룹과 원시 스팬의 보존 기간이 다름 |
| DB p95가 가장 큰 쿼리부터 고치면 된다 | 호출이 매우 많은 짧은 쿼리의 총 소요가 더 클 수 있음 |
| 외부 호출의 타임아웃은 반드시 오류에 포함된다 | 폴백 등으로 오류 상태가 아닌 타임아웃 관측도 있을 수 있음 |
| 서비스 맵의 화살표 건수가 전체 호출 수다 | 저장된 트레이스 표본의 관계 집계임 |
| 합성 감시를 수정해도 기존 단계 이력이 유지된다 | 기존 httpStepId 유지가 필요. 신규 단계와 교체를 구분 |
| 합성 감시 연결 해제는 시나리오 삭제다 | 서비스 연결만 해제하는 동작과 Zabbix 시나리오 삭제는 별개 |
| 배포 행이 없으면 배포하지 않았다 | 같은 버전 재배포·버전 미제공 등 자동 감지 한계가 있음 |
| Zabbix 아이템을 만들었으니 바로 push되어야 한다 | 설정 캐시 동기화 대기가 있을 수 있음 |
| 리포트는 조회할 때마다 최신 원본으로 바뀐다 | 저장한 스냅샷을 사용. 늦은 생성은 남은 원재료에 의존 |
| 테스트가 통과하면 실제 SDK도 검증된 것이다 | 임의 payload·계약 표본·실제 Agent 출력·브라우저 실행을 구분해야 함 |

## 10. 강화·보완 과제

아래는 문서 정리와 코드 확인에서 도출한 후속 제안이다. 완료된 기능으로 설명하지 않는다.

| 우선순위 | 보완 항목 | 현재 상태 | 완료 기준 |
|---|---|---|---|
| 높음 | 문서·화면·API의 경로와 설명 통일 | 일부 이전 문서에 엔드포인트 경로·홈 위젯 경로·메뉴 수 오류 | Controller·FE 호출·사용자 문서의 경로 및 의미 일치 |
| 높음 | 실수집 기준 검증표 | 실제 SDK·K8s·메시징·배치 검증 범위가 서로 다름 | 스택별 앱 → 수신 → 저장 → 화면까지 실제 데이터로 확인 |
| 높음 | RUM 페이지별 TTFB·p75 추이 | 페이지 목록에 TTFB 필드 없음, 시간별 Point에 p75 없음 | DTO·집계·실제 BE 표본·FE 표시를 함께 추가 |
| 높음 | 외부 알림 도달 검증 | Zabbix 프로비저닝·push와 고객 액션 도달은 별개 | 실제 수신자에게 알림·복구 알림 도달 확인 |
| 높음 | 데이터 품질·지연 표시 | sampled·mixedBounds·truncated 등의 의미가 복잡함 | 차트에 데이터 기준·집계 간격·마지막 수신·제한을 일관되게 표시 |
| 중간 | 실시간 수집 주기 통일 | 설계 10초와 설치 안내 15초가 혼재 | 설치 기본값·운영 가이드·실측 지연 설명 통일 |
| 중간 | 다중 BE·다중 Collector 대응 | Live 버퍼·일부 RUM 제한 카운터가 노드 간 공유되지 않음 | 이벤트·예산 공유 구현, 같은 traceId의 일관된 수집 경로 검증 |
| 중간 | RUM 집계 용어 명확화 | 세션·국가·timing이 일반 분석 도구와 의미가 다름 | 모든 관련 화면에 동일한 집계 정의 표시 |
| 중간 | 트레이스 비교 화면 연결 | BE API 존재, FE 호출 없음 | 비교 대상 선택·차이 표시·대표 실데이터 검증 |
| 중간 | 대시보드 편집 API 연결 여부 정리 | BE 위젯 배치 API가 존재하나 FE 사용 확인 안 됨 | 기능 채택 여부와 화면 연결 범위를 확정 |
| 중간 | 저장 용량·카디널리티 관리 | 서비스·인스턴스·route 증가에 따라 행 수 증가 | 실제 적재량·조회 지연·디스크를 기준으로 용량 계획 수립 |
| 별도 범위 | 로그 상관 분석 | 로그 수신은 폐기 처리, 화면 미개방 | 로그 도메인·보존·권한·trace 연결 설계 후 구현 |

## 11. 검증 범위

이번 문서 작성에서는 기존 안내서와 계약서를 실제 Controller, FE API 클라이언트, DTO, Collector 템플릿과 대조했다. 실행 중인 애플리케이션이나 고객 환경을 새로 기동해 종단 테스트하지는 않았다.

기존 검증 기록에는 메트릭·트레이스 종단 검증, 권한 확인, 합성 감시 및 RUM 브라우저 경로 검증이 있다. 다만 실제 OTel Web SDK 번들 조합, 실 K8s 배포, 실제 메시징·배치 앱, Apache SSE, 다중 노드, 고객 알림 도달은 별도 확인 항목으로 남아 있다. 수동 전송 payload 검증과 실제 SDK의 동작 검증을 같은 것으로 표시하지 않는다.

다중 노드는 구현 보완과 실증이 모두 필요하다. 현재 공유되지 않는 메모리 상태를 먼저 보완한 뒤, 분산 환경의 이벤트 정합성·제한 카운터·트레이스 샘플링을 검증해야 한다.

### 11.1 기능별 검증 근거와 남은 조건

| 기능 | 기존 기록에서 확인한 범위 | 추가 확인이 필요한 범위 |
|---|---|---|
| 메트릭·서비스 등록 | 수신 → 등록 → 저장 → 조회·롤업의 종단 기록 | 고객별 언어·라이브러리·전송 부하 |
| 트레이스·맵·예외·DB | 단계별 API·화면·집계 검증 및 Exemplar 문제 수정 기록 | 고객의 실제 서비스 간 전파와 대량 지연 도착 |
| 실시간 | 단일 노드의 SSE·병합·전달 지연 실측 기록 | 실제 Reverse proxy, 다중 BE, 동시 접속 부하 |
| 권한 | 역할 편집·DB 백필·일반 계정 조회·관리 제한 기록 | 설치본별 역할 데이터와 운영 계정 |
| SLO·합성 감시 | 계산식·웹 시나리오 연동·단계 수정·캘린더 관련 기록 | 프록시 그룹, 긴 이력, 고객별 가용성 정의 |
| 메시징·배치 | 규약에 맞춘 OTLP 표본의 저장·집계 검증 | 실제 브로커·SDK·업무 배치에서 나오는 스팬 |
| RUM | 브라우저 CORS·CSP와 수동 전송·집계 표시 기록 | 정확한 SDK 번들 조합, 동의·철회 흐름, 고객 사이트 |
| K8s | 계약 재현 표본과 상태 변화·저장 로직 검증 | 실제 클러스터 RBAC·TLS·배치 구성·다중 클러스터 |
| Zabbix 알림 | 객체 생성·값 push·이벤트 관련 검증 | 고객 액션과 최종 수신자 도달 |
| AI | APM 조회 도구 계약·개별 API 호출 검증 | 실제 LLM 대화의 정확성·권한·부분 실패 안내 |
| 성능·용량 | R3 시험 조건의 행 크기·롤업·조회 측정 | 현재 배포 환경·실데이터·동시 사용자 조건 |

단계별 PASS 개수는 시험 시점과 대상이 달라 합산하여 제품 전체의 보장 수치로 사용하지 않는다. 결함 수정 여부, 수정 후 재검증 여부, 고객 환경 재현 여부를 따로 기록한다.

## 12. 참고 문서

| 자료 | 용도 |
|---|---|
| APM 종합 안내서 분책 00~17 | 개념·배경·제약·메뉴·수집 흐름·운영·검증·용어 |
| APM 화면·차트 가이드 | 차트의 출처·계산 방식·읽는 법 |
| APM OpenTelemetry 입문서 | 계측·메트릭·트레이스의 기본 개념 |
| APM Collector 설정 설명서 | 생성 YAML과 처리 단계 |
| APM 코드 설명서 | 수신·정규화·집계·조회 구현 흐름 |
| features/apm/core/contract_apm.md, features/apm/core/contract_apm-read-api.md | 기본 수신·서비스·메트릭·트레이스 API |
| features/apm/core/contract_apm-p3.md | SLO·합성 감시·메시징·배치·리포트 |
| features/apm/core/contract_apm-p4.md | RUM·Kubernetes·남은 DTO 요청 |
| APM 단계별 QA 및 검수 기록 | 구현 검증 범위·재현 결과·미확인 항목 |

내부 자료 위치는 작업 공간의 `_workspace/guides`, `_workspace/contract_*.md`, `_workspace/designs`, `_workspace/verification`, `_workspace/reviews`다. 실제 API 기준은 `moveseye-be-spring`의 APM Controller와 `moveseyee_fe/src/services/apm.api.ts`, `apmRum.api.ts`, `report-management.api.ts`를 우선 확인한다.

### 12.1 apm-handbook 원문별 반영 위치

목차 파일을 포함한 18개 문서의 핵심 내용을 다음과 같이 연결했다. 원문의 중복 사본·과거 커밋 이력은 반복하지 않고, 독자가 판단할 때 필요한 개념·조건·교훈을 본문에 반영했다.

| 원문 파일 | 핵심 내용 | 통합 가이드 반영 위치 |
|---|---|---|
| 00-index.md | 읽는 순서·전체 지도 | 첫머리 읽는 순서, 12장 |
| 01-what-to-see.md | 상황별 확인 대상·제공 범위 | 1장, 9.1절 |
| 02-background.md | OTel·DB·SLO·RUM·K8s 배경 | 2.3절, 5장, 6.3절, 8.3절·8.8절 |
| 03-constraints.md | 수집·라이선스·권한·보존·용량·보안 | 2.3절, 6장, 8.4절·8.7절·8.9절 |
| 04-overview.md | 구현 단계·데이터 모델 | 4장·6장·11장 |
| 05-menus-and-tabs.md | 메뉴·탭별 질문·API·함정 | 3.4절, 4장, 9.3절 |
| 06-data-path.md | 메트릭·트레이스·RUM의 처리 순서 | 2.4절, 5장, 6.3절 |
| 07-p1-metrics.md | 등록·집계·Exemplar·알람·실시간 | 3장, 5.9절·5.10절, 7.4절, 8.6절 |
| 08-p2-traces.md | 워터폴·관계 집계·예외·SQL·배포 | 4장, 5.4절·5.5절, 6.3절, 9.3절 |
| 09-permissions.md | view·edit·원문·배포 순서 | 8.4절·8.9절 |
| 10-p3-operations.md | SLO·합성·메시징·배치·리포트·AI | 4.3절·4.7절, 5.7절·5.8절, 8.3절 |
| 11-p4-rum-k8s.md | 공개 토큰·RUM 집계·K8s 상태 | 5.6절·5.7절, 7.3절, 8.8절 |
| 12-operations.md | OS·언어별 설치·DB·Zabbix·만료 | 8장 |
| 13-verification.md | 검증 방법·미검증·불일치 | 10장·11장 |
| 14-glossary.md | 용어·상태·값 규약 | 1장 용어, 3장, 5.10절, 8.3절 |
| 15-overturned.md | 실측이 바꾼 가정·설계 교훈 | 2.3절, 5.10절, 6.3절·6.4절, 9.3절 |
| 16-faq.md | 운영 중 자주 묻는 질문 | 9장 |
| 17-sources.md | 내부 정본·외부 공식 근거 | 12장과 본문 관련 출처 |

### 12.2 원문을 사용할 때 적용한 정리 기준

| 원문의 표현·문제 | 이번 문서의 처리 |
|---|---|
| 이전 기간 대비를 전일 동시간으로 설명 | 선택 창 바로 앞의 같은 길이 구간으로 명시 |
| SLO의 AND → OR 변경을 짧게 요약 | 확인 창 내부 AND, 두 소진 조건 사이 OR를 식과 예로 구분 |
| 상위 단계의 미구현 표현이 후속 문서에 남음 | 현재 코드 존재 여부와 실제 화면 연결·검증 여부를 나눔 |
| 오래된 홈 위젯·엔드포인트 경로 | 현재 Controller·FE API 클라이언트에 맞춤 |
| Go 자동 계측 전체가 불가능하다는 식의 표현 | 이 프로젝트의 설치 안내가 수동 SDK 기준임을 명시 |
| 토큰 재발급을 기존 토큰 자동 회수로 읽을 수 있음 | 새 토큰 발급·수신 확인·기존 토큰 회수를 별개 절차로 설명 |
| 테스트·성능 수치가 현재 보장값처럼 읽힘 | 시험 조건·기록 시점·미검증 범위를 함께 명시 |
| 웹 표준과 제품의 내부 집계 규약 혼재 | OTLP 형식·MovesEye 저장 규칙·화면 해석을 분리 |
