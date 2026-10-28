---
tags: [moveseye, apm, design, diagnostics]
updated: 2026-10-28
---

# APM 심층 진단 설계

- 요청: 기능 평가·심층 진단 방향 설명 후 사용자가 ‘일단 설계만’ 요청. 제품 코드·DDL·서버·배포 변경 없음.
- 정본: [설계 v0.2](../agent-documents/sources/solutions/_workspace/features/apm/deep-diagnostics/solutions--devdesign_apm-deep-diagnostics.md), [문서 검수](../agent-documents/sources/solutions/_workspace/features/apm/deep-diagnostics/solutions--review_apm-deep-diagnostics-design.md).
- 현재 관찰 기준: BE df1b39f, FE edf667c, Java 확장 5c87950. SOLO-CLAUDE에서 Codex는 설계·검수만 수행.

## 제안한 방향

- 첫 MVP는 trace 상세 진단 탭. M1a는 instance 런타임 문맥, M1b는 Java/Hikari getConnection 획득 구간과 요청 요약. 정확한 hook·지원 버전·비용을 R0에서 먼저 실증한다.
- 요청 직접 증거는 REQUEST_SPAN/MEASURED, 현재 1m metric은 INSTANCE_TIME_WINDOW/CORRELATED. metric에 run 키가 없으므로 processScope=UNVERIFIED를 유지한다.
- JVM 시작 UUID를 trace resource에 보존하더라도 과거 metric 버킷을 프로세스별로 소급 분리할 수 없다. 5m/1h 서비스 집계로 instance 데이터 부재를 채우지 않는다.
- POOL_ACQUIRE는 획득 전체 경과이며 순수 큐 대기가 아니다. SQL/HTTP와 겹치는 시간을 더해 100% 원인 파이를 만들지 않는다.
- 진단 구간·summary는 INTERNAL/UNSET span으로 기존 OTLP 경로 사용. 기존 waterfall/flame/critical path·업무 지표에서는 제외한다. 일반 span의 조회 LIMIT 이전에 제외해야 진단이 기존 상세를 밀어내지 않는다.
- summary 카운터 불변식과 retained/received 구분, 임계 미만·유실·미종료 상태표를 둔다. 수신 구간 0건은 시도 0회가 아니다.
- 요청당 한도만으로 전역 비용은 제한되지 않는다. JVM별 rate/byte 상한과 일반 span 유실률 시험을 둔다. 공유 SDK queue의 무영향을 사전 보장하지 않는다.
- 확장 collection OFF와 BE query OFF는 다르다. 계측을 꺼도 기존 저장 자료와 M1a 문맥을 읽을 수 있다.
- M2는 로컬 JFR, M3는 기존 로그·DBM 연결, M4는 프로파일링. 중앙 원본 저장/업로드·원격 명령·자동 SQL 실행은 첫 MVP에 없다.

## 검수 교훈

독립 독자 검수에서 카운터/상태, 전역 예산, SQL/HTTP 응답·SERVER 귀속, pool 규칙, API 실패 계약, OFF 의미, 용어 혼용 8개 항목을 보완했다. 설계의 일반 원칙뿐 아니라 예시 문장·행위 시험 기대까지 수정해야 모순이 남지 않는다. R0와 신규 기능 행위 시험은 아직 실행하지 않았고, 선행 평가 185건 통과를 신규 기능 검증으로 재사용하지 않는다.

관련: [[moveseye]], [[2026-10-28-apm-functional-assessment]], [[2026-10-19-db-monitoring-design]].
