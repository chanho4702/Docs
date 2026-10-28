---
tags: [moveseye, apm, opentelemetry, diagnostics, implementation, worktree]
updated: 2026-10-28
---

# APM 심층 진단 격리 구현

- 사용자 지시로 [[2026-10-28-apm-deep-diagnostics-design]]의 R0~M1b를 BE·FE·Java 확장 전용 worktree 세 곳에 구현했다. master 병합·push·배포는 하지 않았다.
- 정본 산출물: `C:/solutions/_workspace/features/apm/deep-diagnostics/`의 계약·BE/FE/OTel 보고·정적 QA·E2E.
- 첫 결과는 trace 상세 진단 탭, 같은 instance의 CPU·GC·pool 1분 문맥, 요청별 Hikari connection acquire 구간·summary, 근거/완전성 상태다.

## 검증

- BE 단위 109 + 독립 PG IT 107 통과. 빈 DB V93, typed OTLP→DB→API, 재전송, 권한·라이선스, 5,000 일반 span 보존을 포함했다.
- FE tsc와 5 suites/120 tests 통과. 실제 격리 브라우저에서 로그인, SERVER 선택, URL/뒤로가기, SQL·HTTP 이동, 미수신/0/partial, query OFF를 검증했다.
- Java 확장 34 tests 통과. 실제 Agent에서 ON/OFF, 40회 획득의 16건 상세 제한, async/unfinished/late callback, TTL, head drop, rate/byte budget, Collector tail late/drop을 확인했다.
- E2E 총 44개(API17·브라우저10·실제 Agent replay12·OFF/권한5) 통과.

## 새 교훈

1. OTel Agent 2.31.1의 non-inline Advice는 annotation만으로 classloader 경계가 해결되지 않았다. 해당 `InstrumentationModule`만 ISOLATED 전략으로 두고 ExtensionClassLoader의 단일 runtime에 연결한 뒤 실제 JVM에서 검증해야 한다. 단위 테스트와 compile 성공은 실제 hook 성공 증거가 아니다.
2. Collector 카드번호 redaction은 숫자 16자리 span ID와 숫자형 UUID까지 훼손했다. trace의 정형 ID는 위치·타입·regex를 먼저 검증한 정확한 키만 예외 처리해야 한다. logs에 같은 예외를 적용하면 민감값 우회가 된다.
3. 기존 1m metric은 memory pool/thread state 차원을 저장 전에 제거하고 count/sum을 누적해 heap/thread 총량을 복원할 수 없었다. 첫 진단에서 해당 슬롯을 제외하고 CPU·GC·pool만 제공했다. 기존 슬롯이 있다는 사실과 요청 단위로 정확히 해석할 수 있다는 주장은 다르다.
4. Windows에서 background 자식을 `capture_output` pipe로 감싸면 자식이 pipe를 상속해 부모가 기다릴 수 있다. stdout/stderr 파일 redirect, stdin DEVNULL, readiness polling으로 수명을 관리한다.
5. 다른 세션과 충돌을 피하려면 repo별 전용 worktree뿐 아니라 DB·Redis·BE·FE·Collector 포트까지 분리해야 한다. 통합 테스트 DB가 고정 이름이어도 별도 PostgreSQL 서버를 쓰면 안전하게 분리된다.

## 남은 게이트

- 3회 이상 동일 부하 OFF/ON, 30분 부하, 8시간 안정성, CPU/p95/live heap 목표.
- 실제 고객 workload의 SDK queue/Collector drop 증가 여부, WebFlux·가상 thread·다른 Hikari/JDK/OS.
- 실제 archive ZIP 생성·복원 왕복. M2 JFR, M3 logs/DBM, M4 profiling은 범위 밖.

관련: [[moveseye]], [[2026-10-28-apm-functional-assessment]], [[2026-10-28-apm-deep-diagnostics-design]], [[shared-it-db-worktree-collision]].
