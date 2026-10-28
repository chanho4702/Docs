# 편집자용 근거와 범위

기준일: 2026-10-22. 이 파일은 공개 게시 본문에 포함하지 않습니다.

## 글의 범위

- 개념 편은 OTel 기본 설명, 구축 편은 MovesEye의 구현 선택과 개발 경험입니다.
- 운영 서버의 현재 배포 상태를 확인한 글이 아닙니다. 구축 편은 읽은 작업 트리의 구현을 설명합니다.
- 고객 장애 사례·장애 대응 시간 단축·전체 서비스 성능 개선 수치는 넣지 않았습니다.
- 개념 편의 주문 흐름과 그림의 시간 값은 가상 예시로 명시했습니다.
- 범용 로그 검색, 전체 호출 스택, 무손실·전량 표시, 모든 언어에서 동일한 확장 지원을 주장하지 않습니다.
- 이미지 네 장은 직접 제작했습니다. 외부 이미지 라이선스나 로고 사용이 없습니다.

## 구현 근거

작업 트리 확인 시 HEAD: BE `1a36632`, Java 확장 `5c87950`, FE `4c301fd`. 작업 트리의 기존 미커밋 변경은 수정하지 않았으며, 커밋 번호는 배포 증거가 아닙니다.

| 본문 주장 | 확인한 근거 |
|---|---|
| OTLP 수신·JSON 내보내기·보존 큐·Tail sampling | `C:/solutions/moveseye-be-spring/src/main/resources/apm/collector-template.yaml` |
| 라이브 HTTP 서버 Span 필터·축소·재시도 끔 | `C:/solutions/moveseye-be-spring/src/main/resources/apm/collector-live-template.yaml` |
| HTTP JSON 수신·적재 예외 503 | `C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/ApmOtlpController.java` |
| 서비스별 Span 집계·표시 표본·용량 경계 | `C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/overview/live/spans/LiveSpanRing.java` |
| 라이브 링과 SSE의 구조 | 위 패키지의 `LiveSpanStreamService.java` 및 `ApmLiveSpansStreamController.java`, 기존 수집 흐름 설명 |
| Java 확장의 생명주기·Metric/Log 경로·상한·TTL·제약 | `C:/solutions/moveseye-otel-extension/README.md`, `docs/design.md` |
| 목록 비활성 시 상세 수집 생략 | 위 Java 확장의 설계 문서 및 `moveseye-otel-extension-analysis-2026-10-07` 경험 기록 |
| 마스킹이 JSON의 긴 timestamp를 손상시킨 경험 | `C:/Users/DMOVE/claude-experiences/topics/backend/otel-collector-pitfalls.md` |

구축 편의 마스킹 사례는 개발 기록의 과거 경험을 설명하며, 현재 동일한 결함이 남아 있다는 판정이 아닙니다. 백엔드의 다른 기능 전체나 대규모 운영 준비 수준을 검증한 문서도 아닙니다.

## 외부 근거

본문의 관련 설명 옆에 OpenTelemetry 공식 문서 링크를 배치했습니다. 공식 개요, Signals, Traces, Context propagation, Java Agent와 SDK 설정, Collector 구성, OTLP, Resource, Semantic Conventions, Metrics, Sampling, Resiliency를 확인했습니다.

OTLP/HTTP의 재시도 코드 `429`, `502`, `503`, `504`와 다른 4xx/5xx의 비재시도 규칙은 공식 규격의 Retryable Response Codes를 기준으로 작성했습니다. 실제 재시도에는 해당 Exporter의 재시도 설정이 활성화되어 있어야 하며, 라이브 경로에는 적용되지 않는다는 차이를 본문에 유지했습니다.

## 독자 검토

원고만 읽는 독립 검토자가 OTel·백엔드 역할, Trace·Span·전파, Agent·SDK·Collector, 라이브·보존·진행 중 요청 차이, 상세 Trace 부재, TTL, 하위 작업·로그 범위, HTTP 재시도의 8개 질문에 답했습니다.

그 결과 서비스별 Span과 사용자 요청의 차이, Java Agent와 SDK의 관계, TTL·링 버퍼·RPC·SPI의 뜻, 진행 중 요청 정보의 도착 지연을 보강했습니다. 라이브 링 구현을 확인하여 집계 건수와 표시 표본의 차이도 추가했습니다.

## 이미지와 HTML 검증

`render_and_verify.py`는 SVG를 Chromium에서 렌더링해 PNG를 생성합니다. 글자 실측 폭과 텍스트 상자 폭, 로컬 링크와 이미지 존재, HTML 오류, 390px 화면의 가로 넘침, 복사 버튼에 전달되는 내용, draw.io XML 구조와 셀 ID를 확인합니다.

복사 버튼 검증은 테스트 브라우저에서 Clipboard API·copy 명령을 대체하여 수행하므로 사용자의 실제 클립보드를 변경하지 않습니다. 외부 블로그 편집기에 붙여 넣은 결과까지 검증한 것은 아닙니다.
