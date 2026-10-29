---
tags: [moveseye, apm, opentelemetry, diagnostics, implementation, worktree]
updated: 2026-10-28
---

# APM 심층 진단 구현과 master 통합

> 정본 가이드: [APM 심층 진단 구현·운영 가이드](C:/solutions/_workspace/features/apm/deep-diagnostics/guide_apm-deep-diagnostics.md)

- 사용자 지시로 [[2026-10-28-apm-deep-diagnostics-design]]의 R0~M1b를 BE·FE·Java 확장 전용 worktree 세 곳에 구현한 뒤 각 저장소 master에 통합했다. push·배포는 하지 않았다.
- 정본 산출물: `C:/solutions/_workspace/features/apm/deep-diagnostics/`의 계약·BE/FE/OTel 보고·정적 QA·E2E.
- 첫 결과는 trace 상세 진단 탭, 같은 instance/process run의 CPU·GC·pool 1분 문맥, 요청별 Hikari connection acquire 구간·summary, 근거/완전성 상태다.

## 사용자가 얻는 결과

- 기존 trace 상세의 `SERVER` span을 선택하면 별도 상위 메뉴 없이 `진단` 탭에서 요청별 Hikari connection acquire를 확인한다.
- 직접 측정한 요청 구간과 같은 instance의 상관 문맥을 분리하며, `0`, `NOT_RECEIVED`, `PARTIAL`을 서로 다른 상태로 표시한다.
- `POOL_ACQUIRE`는 순수 queue wait가 아니라 `getConnection()` 전체 경과다. 이 경계를 UI와 API에서 명시한다.
- 초기 runtime 문맥은 정확히 복원 가능한 CPU·GC·pool 6개 값만 제공한다. dimension이 이미 소실된 memory/thread는 포함하지 않는다.

## 구조와 안전장치

`Java application → OTel Agent/extension → Collector → Spring ingest/storage → diagnostics API → React trace 상세` 순서다.

- Java 수집과 BE query는 각각 기본 OFF다.
- 10ms 이상 획득 중 요청 진입 순서상 16건만 상세 보존하고, 나머지도 summary에는 누적한다.
- active token·TTL·rate·burst·byte budget을 두고 초과 시 애플리케이션 처리는 유지한다.
- 민감한 pool/JDBC/user/password/SQL/exception message는 진단 속성으로 만들지 않는다.
- 진단 span은 기존 waterfall·flame·critical path와 일반 span 5,000개 한도에서 분리한다.

## 구현 위치

| 영역 | 격리 worktree | commit |
|---|---|---|
| Spring BE | `C:/worktrees/apm-deep-be` | 원본 `b92311a` → master `5dfb755` |
| React FE | `C:/worktrees/apm-deep-fe` | `060ad4d`, master 회귀 보정 `de2178e` |
| OTel extension | `C:/worktrees/apm-deep-otel` | `cfef319` |

FE·OTel은 직계 후속 commit이라 master를 fast-forward했고, BE는 그 사이 추가된 DBM 11개 commit을 보존한 채 APM commit만 cherry-pick했다. `COLLAB.md`는 사용자의 명시 승인으로 `SOLO-CODEX`로 전환했다. push·배포는 하지 않았다. 로컬 branch 정리에서는 안전하게 병합되고 참조되지 않은 35개를 삭제했고 복구용 JSON을 `_workspace/features/apm/deep-diagnostics/branch-cleanup-20261028.json`에 남겼다.

## 검증

- BE 단위 109 + 독립 PG IT 107 통과. 빈 DB V93, typed OTLP→DB→API, 재전송, 권한·라이선스, 5,000 일반 span 보존을 포함했다.
- FE tsc와 5 suites/120 tests 통과. 실제 격리 브라우저에서 로그인, SERVER 선택, URL/뒤로가기, SQL·HTTP 이동, 미수신/0/partial, query OFF를 검증했다.
- Java 확장 34 tests 통과. 실제 Agent에서 ON/OFF, 40회 획득의 16건 상세 제한, async/unfinished/late callback, TTL, head drop, rate/byte budget, Collector tail late/drop을 확인했다.
- E2E 총 44개(API17·브라우저10·실제 Agent replay12·OFF/권한5) 통과.
- master 통합 뒤 BE 진단 패키지 31 tests와 OTel 전체 build/test가 통과했다. FE 전체 회귀 323/324 suites·4,425 tests 통과 뒤 유일한 도움말 allowlist 실패를 `de2178e`로 보정하고 해당 suite 17 tests를 재통과했다. BE 전체 회귀의 기존 `ApmExportIT` CSV 2건은 공유 IT DB fixture 상태 문제로 남았다.

## 새 교훈

1. OTel Agent 2.31.1의 non-inline Advice는 annotation만으로 classloader 경계가 해결되지 않았다. 해당 `InstrumentationModule`만 ISOLATED 전략으로 두고 ExtensionClassLoader의 단일 runtime에 연결한 뒤 실제 JVM에서 검증해야 한다. 단위 테스트와 compile 성공은 실제 hook 성공 증거가 아니다.
2. Collector 카드번호 redaction은 숫자 16자리 span ID와 숫자형 UUID까지 훼손했다. trace의 정형 ID는 위치·타입·regex를 먼저 검증한 정확한 키만 예외 처리해야 한다. logs에 같은 예외를 적용하면 민감값 우회가 된다.
3. 기존 1m metric은 memory pool/thread state 차원을 저장 전에 제거하고 count/sum을 누적해 heap/thread 총량을 복원할 수 없었다. 첫 진단에서 해당 슬롯을 제외하고 CPU·GC·pool만 제공했다. 기존 슬롯이 있다는 사실과 요청 단위로 정확히 해석할 수 있다는 주장은 다르다.
4. Windows에서 background 자식을 `capture_output` pipe로 감싸면 자식이 pipe를 상속해 부모가 기다릴 수 있다. stdout/stderr 파일 redirect, stdin DEVNULL, readiness polling으로 수명을 관리한다.
5. 다른 세션과 충돌을 피하려면 repo별 전용 worktree뿐 아니라 DB·Redis·BE·FE·Collector 포트까지 분리해야 한다. 통합 테스트 DB가 고정 이름이어도 별도 PostgreSQL 서버를 쓰면 안전하게 분리된다.
6. 기능별 FE 테스트와 `tsc`가 통과해도 locale 기반 help-key allowlist 같은 전역 회귀 계약은 놓칠 수 있다. 새 `chart_help` 키를 추가할 때는 번역 두 벌, allowlist, 총개수 assertion을 함께 갱신하고 전체 suite로 확인한다.

## 남은 게이트

- 3회 이상 동일 부하 OFF/ON, 30분 부하, 8시간 안정성, CPU/p95/live heap 목표.
- 실제 고객 workload의 SDK queue/Collector drop 증가 여부, WebFlux·가상 thread·다른 Hikari/JDK/OS.
- 실제 archive ZIP 생성·복원 왕복. M2 JFR, M3 logs/DBM, M4 profiling은 범위 밖.

## 병합 전 확인

1. `COLLAB.md`의 현재 status와 repo 소유권을 재확인한다.
2. Flyway `V93` 번호가 대상 branch와 충돌하지 않는지 확인한다.
3. Collector의 정확한 키·형식 기반 redaction 예외를 실제 환경에서 재검증한다.
4. OFF/ON 반복 성능, 30분 부하, 8시간 안정성 게이트 전에는 운영 지원 완료로 선언하지 않는다.

## 상세 산출물

- [통합 가이드](C:/solutions/_workspace/features/apm/deep-diagnostics/guide_apm-deep-diagnostics.md)
- [설계](C:/solutions/_workspace/features/apm/deep-diagnostics/devdesign_apm-deep-diagnostics.md)
- [API 계약](C:/solutions/_workspace/features/apm/deep-diagnostics/contract_apm-deep-diagnostics.md)
- [구현 진행](C:/solutions/_workspace/features/apm/deep-diagnostics/progress_apm-deep-diagnostics-implementation.md)
- [정적 QA](C:/solutions/_workspace/features/apm/deep-diagnostics/qa_apm-deep-diagnostics-contract.md)
- [E2E](C:/solutions/_workspace/features/apm/deep-diagnostics/e2e_apm-deep-diagnostics.md)

관련: [[moveseye]], [[2026-10-28-apm-functional-assessment]], [[2026-10-28-apm-deep-diagnostics-design]], [[shared-it-db-worktree-collision]].
