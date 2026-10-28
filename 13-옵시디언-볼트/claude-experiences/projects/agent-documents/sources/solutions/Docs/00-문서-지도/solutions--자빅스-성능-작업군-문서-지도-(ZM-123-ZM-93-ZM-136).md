# 자빅스 성능 작업군 문서 지도 (`ZM-123` · `ZM-93` · `ZM-136`)

> 갱신: 2026-09-14. 자빅스 부하 절감(ZM-123)·LLD 검수 정정(ZM-93)·차트 증분(ZM-136)의
> **모든 문서가 어디 있고 뭘 담는지** 한 장으로. 새 문서가 생기면 여기에 한 줄 추가한다.

> **후속 작업군**: 대용량 호출 방어(ZM-159)는 별도 지도 — [`INDEX_zm-159-scale-call-guard.md`](%EB%8C%80%EC%9A%A9%EB%9F%89-%ED%98%B8%EC%B6%9C-%EB%B0%A9%EC%96%B4-%EC%9E%91%EC%97%85%EA%B5%B0-%EB%AC%B8%EC%84%9C-%EC%A7%80%EB%8F%84-%28ZM-159%29.md)

## 층 구조 (문서-운영규칙의 3층)

- **정본** = `moveseye-docs/` — 현재 제품이 어떻게 동작하는가 (팀 공유·인수인계용)
- **증거** = `_workspace/` — 왜 그렇게 결정했나, 검수·실측 기록 (판단 근거 복원용)
- **경험** = 옵시디언 `claude-experiences/` — 교훈만 (정본 링크로 연결)

## 정본 (moveseye-docs)

| 이슈 | 문서 | 역할 |
|---|---|---|
| `ZM-123` 전체 | [features/자빅스-부하-절감-아키텍처.md](../01-%EC%A0%9C%ED%92%88-%EB%AC%B8%EC%84%9C/%EA%B8%B0%EB%8A%A5/solutions--%EC%9E%90%EB%B9%85%EC%8A%A4-%EB%B6%80%ED%95%98-%EC%A0%88%EA%B0%90-%EC%95%84%ED%82%A4%ED%85%8D%EC%B2%98.md) | **개요 한 장** — 처음 읽는 사람 시작점 |
| `ZM-123` 전체 | [operations/자빅스-성능-책임-경계.md](../01-%EC%A0%9C%ED%92%88-%EB%AC%B8%EC%84%9C/%EC%9A%B4%EC%98%81/solutions--%EC%9E%90%EB%B9%85%EC%8A%A4-%EC%84%B1%EB%8A%A5-%EC%B1%85%EC%9E%84-%EA%B2%BD%EA%B3%84.md) | 계약·영업용 부하 상한 문구 정본 |
| 각 개선 | [improvements/](../01-%EC%A0%9C%ED%92%88-%EB%AC%B8%EC%84%9C/%EA%B0%9C%EC%84%A0-%EC%9D%B4%EB%A0%A5/solutions--%EA%B0%9C%EC%84%A0-%EA%B8%B0%EB%A1%9D-%28Improvements%29.md) **8편** | 개선별 상세(한눈에·AS-IS→TO-BE·처리 흐름·트레이드오프·함정) — 파일명에 이슈 태그 |

improvements 8편: `ZM-125` 사본 서빙 · `ZM-127` 동기화 이원화 · `ZM-128` SSE 푸시 ·
`ZM-130-131` 차트 다이어트 · `ZM-129` 커넥션 풀 · `ZM-124-126` 병합·캐시 ·
`ZM-93` LLD 검수 정정 · `ZM-136` 차트 증분 조회

## 증거 (_workspace)

### ZM-123 자빅스 부하 절감

| 문서 | 역할 |
|---|---|
| [analysis/analysis_zabbix-db-load-relief.md](../04-%EB%B6%84%EC%84%9D-%EA%B0%90%EC%82%AC/solutions--%EC%9E%90%EB%B9%85%EC%8A%A4-DB-%EB%B6%80%ED%95%98-%EC%9A%B0%EB%A6%AC-%EC%A0%9C%ED%92%88%EC%9D%B4-%EC%A3%BC%EB%8A%94-%EB%B6%80%ED%95%98%EC%9D%98-%EC%8B%A4%ED%83%9C%EC%99%80-%EC%A4%84%EC%9D%B4%EB%8A%94-%EB%B0%A9%EB%B2%95.md) | 최초 분석(문제 진단·전략) |
| [planning/tasks_zabbix-load-relief.md](../03-%EA%B8%B0%ED%9A%8D-%EB%B0%B1%EB%A1%9C%EA%B7%B8/solutions--%EC%9E%90%EB%B9%85%EC%8A%A4-%EB%B6%80%ED%95%98-%EC%A0%88%EA%B0%90-%ED%83%9C%EC%8A%A4%ED%81%AC-%EB%AA%A9%EB%A1%9D-%28%EC%9D%B4%EC%8A%88-%EB%93%B1%EB%A1%9D%EC%9A%A9%29.md) | 태스크 분해·구현 현황 |
| [reviews/review_zm-12*.md](reviews/) | 티켓별 검수 기록 9편(`ZM-124`~`131`·`133`) |
| [reviews/review_zm123-final-integrated.md](../07-%EA%B2%80%EC%88%98-%EB%A6%AC%EB%B7%B0/solutions--%EA%B2%80%EC%88%98-%EB%B0%98%EC%98%81-ZM-123-%EC%97%90%ED%94%BD-%ED%86%B5%ED%95%A9-%EC%B5%9C%EC%A2%85-%EA%B2%80%EC%88%98%28FIX-%EC%BB%A4%EB%B0%8B-7%EA%B0%9C-%EC%83%81%ED%98%B8%EC%9E%91%EC%9A%A9%29.md) | **통합 최종 검수 8건+재검수 2건** — 검수 층위 이야기의 정본 |

### ZM-93 LLD 관리 검수 정정

| 문서 | 역할 |
|---|---|
| [reviews/review_zm-93-lld-codex.md](../07-%EA%B2%80%EC%88%98-%EB%A6%AC%EB%B7%B0/solutions--LLD-%EA%B8%B0%EB%8A%A5-%EA%B2%80%EC%88%98-2026-09-07.md) | Codex 원 검수(R1~R7 결함 보고) |
| [reviews/review_zm-93-lld-claude.md](../07-%EA%B2%80%EC%88%98-%EB%A6%AC%EB%B7%B0/solutions--LLD-%EA%B2%80%EC%88%98%28R1-R7%29-Claude-%EB%8F%85%EB%A6%BD-%EA%B2%80%ED%86%A0-%EC%9D%98%EA%B2%AC.md) | **독립 검토+반영 기록+데이터 조사** — LLD 건 단일 최다 정보 |
| [reviews/request_zm-93-lld-claude.md](../07-%EA%B2%80%EC%88%98-%EB%A6%AC%EB%B7%B0/solutions--Claude-%EB%8F%85%EB%A6%BD-%EA%B2%80%ED%86%A0-%EC%9A%94%EC%B2%AD-LLD.md) | 검토 요청 원문(경위 기록) |
| [contract_discovery.md](../06-API-%EA%B3%84%EC%95%BD/solutions--API-%EA%B3%84%EC%95%BD%EC%84%9C-%EB%94%94%EC%8A%A4%EC%BB%A4%EB%B2%84%EB%A6%AC-%28%EB%84%A4%ED%8A%B8%EC%9B%8C%ED%81%AC-LLD%29.md) | LLD API 계약(정정 반영됨) |
| verification/lld-review-* | Codex 격리 재현(결함의 기록 — **수정 후엔 실패가 정상**) |

### ZM-136 차트 증분 조회

| 문서 | 역할 |
|---|---|
| [analysis/analysis_zm-137_monitoring-chart-baseline.md](../04-%EB%B6%84%EC%84%9D-%EA%B0%90%EC%82%AC/solutions--ZM-137-%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81-%EC%B0%A8%ED%8A%B8-%EA%B0%B1%EC%8B%A0-%EA%B8%B0%EC%A4%80-%EB%B0%8F-%EC%88%98%EC%A7%91-%EC%A3%BC%EA%B8%B0-%EC%A1%B0%EC%82%AC.md) | 현행 조사(`ZM-137`) — "3분마다 창 전체 재조회" 실증 |
| [contract_monitoring_chart_incremental.md](../06-API-%EA%B3%84%EC%95%BD/solutions--ZM-138-API-%EA%B3%84%EC%95%BD-%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81-%EC%B0%A8%ED%8A%B8-%EC%9E%90%EB%8F%99-%EA%B0%B1%EC%8B%A0-%EC%A6%9D%EB%B6%84-%EC%A1%B0%ED%9A%8C.md) | **증분 API 계약**(`ZM-138`) — knownThrough·overlap·PARTIAL 불변식. 확장 작업 시 시작점 |
| [planning/report_zm-136_monitoring-chart-epic.md](../03-%EA%B8%B0%ED%9A%8D-%EB%B0%B1%EB%A1%9C%EA%B7%B8/solutions--ZM-136-%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81-%EC%B0%A8%ED%8A%B8-%EB%B6%80%ED%95%98-%EC%A0%88%EA%B0%90-%EB%8B%A8%EA%B3%84%EB%B3%84-%EC%A7%84%ED%96%89-%EB%B3%B4%EA%B3%A0%EC%84%9C.md) | **에픽 진행 보고서** — 이슈 12개 상태·코덱스 검수 10건·ZM-144 대기 사유 |
| [implementation/zm139_monitoring-chart-incremental.md](../10-%EA%B5%AC%ED%98%84-%EA%B8%B0%EB%A1%9D/solutions--ZM-139-%EA%B5%AC%ED%98%84-%EB%B3%B4%EA%B3%A0%EC%84%9C-%EB%AA%A8%EB%8B%88%ED%84%B0%EB%A7%81-%EC%B0%A8%ED%8A%B8-%EC%A6%9D%EB%B6%84-%EC%A1%B0%ED%9A%8C.md) | BE 구현 메모(`ZM-139`) |

### 대용량 대비 (2026-09-16, 이슈 미발급)

| 문서 | 역할 |
|---|---|
| [analysis/audit_scale-5000-hosts.md](../04-%EB%B6%84%EC%84%9D-%EA%B0%90%EC%82%AC/solutions--%EB%8C%80%EC%9A%A9%EB%9F%89-%EB%8C%80%EB%B9%84-%EC%A0%84%EC%88%98-%EA%B0%90%EC%82%AC-%ED%98%B8%EC%8A%A4%ED%8A%B8-5000%EB%8C%80-%EC%95%84%EC%9D%B4%ED%85%9C-1000%EB%A7%8C.md) | **호스트 5천·아이템 1천만 전수 감사**(BE·FE·AI·엔진, 🔴36·🟠87) — 공통 뿌리 7개·로드맵 |
| [reports/zm-159_scale-call-guard.md](../09-%EB%B3%B4%EA%B3%A0%EC%84%9C/solutions--ZM-159-%EC%9E%91%EC%97%85-%EB%B3%B4%EA%B3%A0-%EB%8C%80%EC%9A%A9%EB%9F%89-%ED%98%B8%EC%B6%9C-%EB%B0%A9%EC%96%B4-%28%ED%98%B8%EC%8A%A4%ED%8A%B8-5%EC%B2%9C-%EC%95%84%EC%9D%B4%ED%85%9C-1%EC%B2%9C%EB%A7%8C%29.md) | **ZM-159 대용량 호출 방어 작업 보고**(09-17) — 공통 호출 유틸·보호 층·메서드 이넘·전부 가져오던 곳·결함 4건, 남은 일 |
| [reports/zm-159_쉬운-설명_무엇을-왜-고쳤나.md](../09-%EB%B3%B4%EA%B3%A0%EC%84%9C/solutions--ZM-159-%EB%8C%80%EC%9A%A9%EB%9F%89-%ED%98%B8%EC%B6%9C-%EB%B0%A9%EC%96%B4-%EB%AC%B4%EC%97%87%EC%9D%B4-%EB%AC%B8%EC%A0%9C%EC%98%80%EA%B3%A0-%EC%96%B4%EB%96%BB%EA%B2%8C-%EA%B3%A0%EC%B3%A4%EB%82%98-%28%EC%89%AC%EC%9A%B4-%EC%84%A4%EB%AA%85%29.md) | **ZM-159 쉬운 설명**(비개발자용) — 화면별로 왜 문제였고 어떻게 고쳤나 · 쓰는 사람 입장의 변화 · 남은 일 |
| [planning/tickets_scale-hardening.md](../03-%EA%B8%B0%ED%9A%8D-%EB%B0%B1%EB%A1%9C%EA%B7%B8/solutions--%EB%8C%80%EC%9A%A9%EB%9F%89-%EB%8C%80%EB%B9%84-%EB%B3%B4%EA%B0%95-%ED%8B%B0%EC%BC%93-%EC%B4%88%EC%95%88-%281%EC%B0%A8-%EC%95%8C%EB%9E%8C-%EC%83%81%ED%95%9C-AWS-%EB%A7%A4%EC%B2%98%29.md) | 티켓 초안: 알람 1만 건 상한(T-A)·AWS 매처 전체 아이템 조회(T-B) |

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
