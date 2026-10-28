# APM 심층 진단 구현 진행

- 시작: 2026-10-28 / Codex
- 사용자 지시: “지금 니가 해볼래? 다른 세션이랑 안 겹치게 … 로컬 브랜치 정리”. 이번 기능의 격리 구현을 명시 승인한 것으로 적용한다. 전역 COLLAB STATUS는 변경하지 않는다.
- 범위: 설계 v0.2의 R0~M1b. M2~M4는 구현 범위 밖이다. 실증되지 않은 지원 조합·성능을 완료로 표시하지 않는다.

## 작업 공간·소유권

| 책임 | 전용 worktree | 기준 |
|---|---|---|
| BE·계약 | C:/worktrees/apm-deep-be | master df1b39f |
| FE | C:/worktrees/apm-deep-fe | master edf667c |
| Java 확장·계측 실증 | C:/worktrees/apm-deep-otel | master 5c87950 |

각 repo 브랜치: `codex/apm-deep-diagnostics-20261028`. 공유 master checkout·다른 worktree·기존 실행 서버는 수정/재기동하지 않는다. master 병합·push는 이번 격리 구현에 포함하지 않는다.

보호 대상: `C:/worktrees/zbx-proxy-{be,fe}`(zabbix-proxy), `C:/worktrees/zm-172-{be,fe,license}`(DBM). 사용 중 브랜치·미병합 커밋은 정리하지 않는다.

검증은 자체 worktree에서 실행한다. 기본 공유 IT DB(moveseye_it)와 서버 포트 3000/5173을 사용하거나 종료하지 않는다. 별도 테스트 DB·포트·프로세스가 필요하면 여기 기록한다. `gradlew --stop`·전체 java/node 종료·공유 stash/reset 금지.

전용 자원(2026-10-28 생성):

- PostgreSQL `codex-apm-deep-pg-20261028`: localhost **5435**, 384MiB/1CPU 제한. dev DB `apm_diag_dev`, IT는 같은 독립 서버 안 `moveseye_it` 사용. 기존 5433/5434/5436 DB에 접속하지 않는다.
- Redis `codex-apm-deep-redis-20261028`: localhost **6387**, 64MiB 제한. 기존 Redis에 세션·캐시를 쓰지 않는다.
- BE **3301**, FE **5271** 예약. 아직 기동 전이며 기존 3000/5173은 보존한다.
- Java R0 fixture **13301**, 독립 Collector **14317/14318** 후보. 공유 4317/4318은 보존한다.
- 메모리 여유 2~4GiB로 관측돼 npm 설치·Gradle·Jest·fixture를 조율한다. 다른 세션의 JVM/Node 프로세스를 종료하지 않는다.
- 신규 Flyway **V93** 예약. 다른 DBM worktree V90~V92와 충돌 없음 확인. 실제 master 병합 전 번호 재확인 필요.

## 진행

- [x] 설계·협업 규약·기존 worktree 확인
- [x] 전용 BE/FE/Java worktree 생성
- [x] 로컬 브랜치 정리: 35개 삭제(BE26·FE8·AI1), 나머지30개 보존. [원래 SHA·판정·결과](branch-cleanup-20261028.json)
- [x] R0/Java 확장 계측과 실제 Agent·Collector 시험
- [x] BE identity·진단 저장·조회·계약
- [x] FE 진단 탭·URL·상태 표현
- [x] 정적 계약 검수와 행위 검증
- [x] 설치/해제·검증 범위·최종 변경 기록

## 완료 상태

- BE 단위 109건·독립 PostgreSQL IT 107건 통과. V93까지 빈 DB 적용과 실제 typed OTLP→DB→API 경로 확인.
- FE 전체 tsc 통과, 기능 구현 시점 5 suites/120 tests 통과. 최종 권한 분류·번역 증분 뒤 `zm157PermissionUi`+`apmDiagnostics` 2 suites/41 tests도 통과.
- Java 확장 최종 34건 통과(선택 benchmark 1건 skip). 최종 JAR 실제 ON/OFF·rate/byte budget·TTL·head sampling·tail late/drop 확인.
- 실제 격리 환경 API17 + 브라우저10 + Agent 자료 replay12 + query OFF/권한5 = 44개 통과.
- 정적 QA 결함 2건(GC 0/null, query OFF 권한 토스트)을 수정·재검증했고 열린 정적 결함 0건.
- `master` 병합·push·배포는 하지 않았다. 30분 부하·8시간 안정성·반복 성능 비교·실제 archive ZIP 왕복은 운영 지원 전 게이트로 남는다.
- 본 작업이 만든 BE3301·FE5271·stub13302·PG5435·Redis6387·Agent13301·Collector14318은 종료/삭제했고 관련 포트 해제를 확인했다.
- 격리 브랜치 커밋: BE `b92311a`, FE `060ad4d`, Java 확장 `cfef319`. 세 worktree 모두 clean이며 원본 master 세 곳도 clean이다.

## 구현 중 확인한 설계 보정

1. **기존 memory/thread 저장 의미**: `ApmMetricAllowlist`가 memory pool/thread state를 제거하고 `MetricIngestor.valuesOf`→`ApmMetric1mStore.Accumulator`는 count/sum을 누적한다. 동일 시각의 pool/state를 먼저 합산하지 않아 기존 1m 자료로 heap·thread 총량을 복원할 수 없다. 이번 진단은 memoryUsed/memoryLimit/threads를 제외하고 CPU·GC·pool 6슬롯만 제공하며 `METRIC_SEMANTICS_UNVERIFIED`로 제한을 설명한다. 기존 metric 저장·기존 화면 전체의 계약 변경은 수행하지 않는다.
2. **Agent classloader**: 실제 Hikari40회가 attempts=0으로 표시되는 실패를 R0에서 재현했다. Agent2.31.1 indy loader의 확장 singleton 접근 문제를 수정하고 실제 Agent 재검증 중이다. 단위30건 통과만으로 hook 지원 완료라고 하지 않는다.
3. **Collector redaction**: 숫자16자리 span ID와 숫자로 구성된 pool UUID가 기존 카드번호 규칙에 의해 가려지는 것을 독립 Collector에서 재현했다. 선행 transform으로 타입·정형 ID를 검증하고 진단 ID 3키만 redaction 예외 처리하는 안에서 ID 보존·기존 카드/email 마스킹·invalid ID 제거를 실증했다. BE 템플릿 반영/회귀를 진행한다.
4. **FE 검증 자원**: 전체 tsc는 1GiB heap에서 OOM, 2GiB에서 통과했다. 타입 오류와 자원 부족을 구분해 기록한다. 무거운 검증은 순차 실행한다.
