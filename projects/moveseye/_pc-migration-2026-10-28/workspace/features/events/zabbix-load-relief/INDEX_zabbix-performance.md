# 자빅스 성능 작업군 문서 지도 (`ZM-123` · `ZM-93` · `ZM-136`)

> 갱신: 2026-09-14. 자빅스 부하 절감(ZM-123)·LLD 검수 정정(ZM-93)·차트 증분(ZM-136)의
> **모든 문서가 어디 있고 뭘 담는지** 한 장으로. 새 문서가 생기면 여기에 한 줄 추가한다.

> **후속 작업군**: 대용량 호출 방어(ZM-159)는 별도 지도 — [`features/infra/scale-call-guard/INDEX_zm-159-scale-call-guard.md`](../../infra/scale-call-guard/INDEX_zm-159-scale-call-guard.md)

## 층 구조 (문서-운영규칙의 3층)

- **정본** = `moveseye-docs/` — 현재 제품이 어떻게 동작하는가 (팀 공유·인수인계용)
- **증거** = `_workspace/` — 왜 그렇게 결정했나, 검수·실측 기록 (판단 근거 복원용)
- **경험** = 옵시디언 `claude-experiences/` — 교훈만 (정본 링크로 연결)

## 정본 (moveseye-docs)

| 이슈 | 문서 | 역할 |
|---|---|---|
| `ZM-123` 전체 | [features/자빅스-부하-절감-아키텍처.md](../../../../moveseye-docs/features/자빅스-부하-절감-아키텍처.md) | **개요 한 장** — 처음 읽는 사람 시작점 |
| `ZM-123` 전체 | [operations/자빅스-성능-책임-경계.md](../../../../moveseye-docs/operations/자빅스-성능-책임-경계.md) | 계약·영업용 부하 상한 문구 정본 |
| 각 개선 | [improvements/](../../../../moveseye-docs/improvements/README.md) **8편** | 개선별 상세(한눈에·AS-IS→TO-BE·처리 흐름·트레이드오프·함정) — 파일명에 이슈 태그 |

improvements 8편: `ZM-125` 사본 서빙 · `ZM-127` 동기화 이원화 · `ZM-128` SSE 푸시 ·
`ZM-130-131` 차트 다이어트 · `ZM-129` 커넥션 풀 · `ZM-124-126` 병합·캐시 ·
`ZM-93` LLD 검수 정정 · `ZM-136` 차트 증분 조회

## 증거 (_workspace)

### ZM-123 자빅스 부하 절감

| 문서 | 역할 |
|---|---|
| [features/events/zabbix-load-relief/analysis_zabbix-db-load-relief.md](analysis_zabbix-db-load-relief.md) | 최초 분석(문제 진단·전략) |
| [features/events/zabbix-load-relief/tasks_zabbix-load-relief.md](tasks_zabbix-load-relief.md) | 태스크 분해·구현 현황 |
| [reviews/review_zm-12*.md](../../../reviews) | 티켓별 검수 기록 9편(`ZM-124`~`131`·`133`) |
| [features/events/zabbix-load-relief/review_zm123-final-integrated.md](review_zm123-final-integrated.md) | **통합 최종 검수 8건+재검수 2건** — 검수 층위 이야기의 정본 |

### ZM-93 LLD 관리 검수 정정

| 문서 | 역할 |
|---|---|
| [_archive/features/events/lld-management/review_zm-93-lld-codex.md](../../../_archive/features/events/lld-management/review_zm-93-lld-codex.md) | Codex 원 검수(R1~R7 결함 보고) |
| [features/events/lld-management/review_zm-93-lld-claude.md](../lld-management/review_zm-93-lld-claude.md) | **독립 검토+반영 기록+데이터 조사** — LLD 건 단일 최다 정보 |
| [features/events/lld-management/request_zm-93-lld-claude.md](../lld-management/request_zm-93-lld-claude.md) | 검토 요청 원문(경위 기록) |
| [features/zabbix-ops/discovery/contract_discovery.md](../../zabbix-ops/discovery/contract_discovery.md) | LLD API 계약(정정 반영됨) |
| verification/lld-review-* | Codex 격리 재현(결함의 기록 — **수정 후엔 실패가 정상**) |

### ZM-136 차트 증분 조회

| 문서 | 역할 |
|---|---|
| [features/infra/chart-incremental/analysis_zm-137_monitoring-chart-baseline.md](../../infra/chart-incremental/analysis_zm-137_monitoring-chart-baseline.md) | 현행 조사(`ZM-137`) — "3분마다 창 전체 재조회" 실증 |
| [features/infra/chart-incremental/contract_monitoring_chart_incremental.md](../../infra/chart-incremental/contract_monitoring_chart_incremental.md) | **증분 API 계약**(`ZM-138`) — knownThrough·overlap·PARTIAL 불변식. 확장 작업 시 시작점 |
| [features/infra/chart-incremental/report_zm-136_monitoring-chart-epic.md](../../infra/chart-incremental/report_zm-136_monitoring-chart-epic.md) | **에픽 진행 보고서** — 이슈 12개 상태·코덱스 검수 10건·ZM-144 대기 사유 |
| [features/infra/chart-incremental/zm139_monitoring-chart-incremental.md](../../infra/chart-incremental/zm139_monitoring-chart-incremental.md) | BE 구현 메모(`ZM-139`) |

### 대용량 대비 (2026-09-16, 이슈 미발급)

| 문서 | 역할 |
|---|---|
| [features/infra/scale-call-guard/audit_scale-5000-hosts.md](../../infra/scale-call-guard/audit_scale-5000-hosts.md) | **호스트 5천·아이템 1천만 전수 감사**(BE·FE·AI·엔진, 🔴36·🟠87) — 공통 뿌리 7개·로드맵 |
| [features/infra/scale-call-guard/zm-159_scale-call-guard.md](../../infra/scale-call-guard/zm-159_scale-call-guard.md) | **ZM-159 대용량 호출 방어 작업 보고**(09-17) — 공통 호출 유틸·보호 층·메서드 이넘·전부 가져오던 곳·결함 4건, 남은 일 |
| [features/infra/scale-call-guard/zm-159_쉬운-설명_무엇을-왜-고쳤나.md](../../infra/scale-call-guard/zm-159_쉬운-설명_무엇을-왜-고쳤나.md) | **ZM-159 쉬운 설명**(비개발자용) — 화면별로 왜 문제였고 어떻게 고쳤나 · 쓰는 사람 입장의 변화 · 남은 일 |
| [features/infra/scale-call-guard/tickets_scale-hardening.md](../../infra/scale-call-guard/tickets_scale-hardening.md) | 티켓 초안: 알람 1만 건 상한(T-A)·AWS 매처 전체 아이템 조회(T-B) |

## 목적별 읽기 경로

- **"이게 다 뭐야?" (5분)** → 정본 개요(아키텍처) 한 장
- **특정 개선 깊이** → improvements의 해당 태그 문서
- **"왜 그렇게 결정했어?"** → 해당 이슈의 reviews/·planning/ 문서
- **이어서 개발** → 해당 contract_*.md부터
- **운영·영업** → operations/책임-경계 + improvements 각 문서의 §5(트레이드오프)

## 규칙

- 계약은 루트 `contract_*.md` 고정(협업 규약 경로). 그 외 신규 문서는 `_workspace/README.md`의
  폴더 규칙 + **파일명에 이슈 태그**(`zm-NNN`)를 따른다.
- 문서를 이동하면 참조(개선 문서 source_of_truth·메모리 포함)를 함께 갱신한다 — 2026-09-14
  정리에서 루트에 어긋나 있던 5편을 이 규칙으로 이동했다(reviews 3·analysis 1·planning 1).
