# APM 기능 재평가 — 2026-10-28

- 사용자 요청: APM 기능 평가. `SOLO-CLAUDE` 검수로 수행했으며 제품 코드·배포는 변경하지 않았다.
- 기준: BE `21358d8`, FE `edf667c`.
- 상세 평가: [검수 기록](C:/solutions/_workspace/features/apm/full-review-20261028/review_apm-functional-assessment-20261028.md).
- 판단: 핵심 기능 범위는 넓고 검증된 조합의 단일 BE 파일럿 가치가 있다. 대규모·HA 보증은 근거 부족. 임의의 서비스 수·처리량·완료율로 점수화하지 않았다.
- 10월 6일 평가의 결함을 그대로 현재 결함으로 옮기지 않았다. 누적 정확성·환경 필터·rollup 완전성·알람 전달과 이력 보존·커스텀 지표 후속·HostLinker 배치화의 실제 최신 반영을 확인했다.
- 현재 제약: CUMULATIVE checkpoint와 RUM 예산의 노드 로컬 상태, 서비스 전량 집계·trace offset 조회, 애플리케이션 로그 미저장, 실제 독자 알림 채널 부재, Java 진행 중 요청 확장의 제한된 지원 조합.
- `currentOp` 서버 재가림 B13-②는 10월 22일 결정으로 보류됐으며 `ce9e662`에 포함되지 않는다. 상류 마스킹 의존을 조건부 위험으로 기록했고 실제 유출로 단정하지 않았다.
- 검증: BE 선별 6클래스 90건, FE 4스위트 95건 통과(총 185건). 실제 브라우저·DB IT·복합 부하·HA·복구 시험은 이번에 하지 않았다.
- 교훈: span flame과 메서드 CPU 프로파일링, 알림 outbox 기반과 실제 채널, 일반 OTLP 지원과 Java 확장 지원, 기존 실측 기록과 이번 재검증을 각각 구분해야 제품 평가가 과장되지 않는다.
- 관련: [[2026-10-06-apm-overall-review]], [[2026-10-12-apm-alert-channel-neutral-delivery]], [[2026-10-20-apm-custom-metric-review]].

## 후속 질문: 심층 진단 개선 방향

- 아래는 사용자에게 제시할 **개선 제안**이며 채택·구현 지시가 아니다.
- 현행 `RuntimeSlotMap`에는 JVM CPU·GC·스레드 수, 커넥션 풀 used/idle/pending/max/wait p95가 이미 있다. 첫 작업은 이 지표의 신규 수집 전체가 아니라 느린 trace와의 연결이다. 다만 `ApmSeriesQueryService.runtime`은 현재 서비스 범위 조회이므로 인스턴스별 식별·필터·저장 보존부터 확인해야 한다.
- 제안 순서: 느린 요청 진단 패널(시간·인스턴스·재시작 구간 일치, 원인 후보와 직접 증거 구분) → Java의 실제 대기 계측·JFR 사건 기록 → traceId 기반 로그 연결·개발 중 DBM과 시간/대상 연결 → 필요한 환경의 CPU·wall-clock·allocation 프로파일링.
- 확장은 현재 요청 객체·스레드를 보관하지 않고 OTel Context를 따라간다. 시작 스레드 ID만으로 비동기 요청의 스택을 귀속하면 오진하므로 실행 구간과 Context 연결을 별도 검증해야 한다. 인스턴스 수준 프로파일을 특정 요청의 정확한 비용으로 표시하지 않는다.
- JFR은 연속 기록과 상세 기록 설정을 제공한다. 링 기록으로 장애 전후 자료를 남기는 안을 제시하되 기록량·비용은 실제 조합에서 측정한다. async-profiler는 CPU·wall-clock·할당·락 조사 후보이며 OS/JDK 검증 이후 확장한다.
- DBM은 설계만 있는 상태가 아니다. 10월 27일 후속 기록에 ZM-172 워크트리의 PG 어댑터·typed 저장소 실측까지 있다. 문서 머리의 어댑터 부재 설명은 뒤쪽 진행과 불일치한다. 이번에는 해당 워크트리 코드를 재검증하지 않았으므로 진행 기록 기준으로만 언급한다. FE·상관 화면은 완료로 주장하지 않는다.
- DBM 기존 결정: 1차는 시간 상관, APM SQL fingerprint와 DB native query ID를 같은 키로 가정하지 않음, GA 고객 SQL EXPLAIN 재계획 미실행·EXPLAIN ANALYZE 금지. 개선안도 이 범위를 유지한다.
- 참고: [Oracle JFR 17 가이드](https://docs.oracle.com/en/java/javase/17/jfapi/flight-recorder-api-programmers-guide.pdf), [OTel 로그의 TraceId·SpanId](https://opentelemetry.io/docs/specs/otel/logs/data-model/), [async-profiler 모드](https://github.com/async-profiler/async-profiler/blob/master/docs/ProfilingModes.md).
