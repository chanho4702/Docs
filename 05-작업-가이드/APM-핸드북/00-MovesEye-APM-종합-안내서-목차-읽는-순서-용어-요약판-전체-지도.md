# MovesEye APM 종합 안내서 — 목차·읽는 순서·용어 요약판·전체 지도

> **처음 읽는 분:** [쉬운 설명과 최신 상태 안내](../../01-%EC%A0%9C%ED%92%88-%EB%AC%B8%EC%84%9C/%EA%B0%9C%EC%9A%94/MovesEye-%EC%B5%9C%EA%B7%BC-%EC%9E%91%EC%97%85%EA%B3%BC-APM-%EC%9D%BD%EA%B8%B0-%EC%95%88%EB%82%B4.md)를 먼저 읽으세요. 이 분책은 단계별 상세 참고서이며 아래 날짜의 상태를 담습니다. 2026-10-05 현재 구현·미완료 구분은 [설계·구현 지도](../../01-%EC%A0%9C%ED%92%88-%EB%AC%B8%EC%84%9C/%EA%B0%9C%EC%9A%94/%EC%84%A4%EA%B3%84%EC%99%80-%EA%B5%AC%ED%98%84%EC%9D%98-%EC%97%B0%EA%B2%B0-%EC%A7%80%EB%8F%84.md)와 [부족점 리포트](../../01-%EC%A0%9C%ED%92%88-%EB%AC%B8%EC%84%9C/%EA%B0%9C%EC%9A%94/%ED%98%84%EC%9E%AC-APM-%EA%B5%AC%ED%98%84%EC%9D%98-%EB%B6%80%EC%A1%B1%EC%A0%90-%EB%B6%84%EC%84%9D-%EB%A6%AC%ED%8F%AC%ED%8A%B8.md)에서 확인합니다.

> **MovesEye APM 종합 안내서** 분책 00/18 · 원본 절 **머리말 · §0 · §9** · 마지막 갱신 **2026-09-17**(원본 `apm-handbook.md` 2026-09-14 작성분을 옮긴 뒤, 2026-09-17 **P5 실시간 관제 분책 18 신설**에 맞춰 목차 18→19개·분책 지도·읽는 순서·§9 문서 지도 갱신).
>
> **이 문서를 읽으면 알게 되는 것**
> 1. 19개 분책이 각각 무엇을 다루고 어떤 순서로 읽어야 하는지(목적별 3코스)
> 2. 미리 알고 시작하면 빠른 용어 스무 개(요약판 — 전체는 14-glossary.md)
> 3. 무엇을 알고 싶을 때 어느 정본 문서(설계·계약·실측·검수·코드)를 열어야 하는지(전체 지도)
>
> **전제 문서** — 다음 [01-what-to-see.md](01-APM%EC%9C%BC%EB%A1%9C-%EB%AC%B4%EC%97%87%EC%9D%84-%EB%B3%B4%EB%82%98-%EB%B4%90%EC%95%BC-%ED%95%98%EB%8A%94-%EA%B2%83-%EB%B3%BC-%EC%88%98-%EC%9E%88%EB%8A%94-%EA%B2%83-%EC%9A%B0%EB%A6%AC%EA%B0%80-%ED%95%B4%EA%B2%B0%ED%95%9C-%EA%B2%83.md). 용어는 [14-glossary.md](14-%EB%B6%80%EB%A1%9D-A.-%EC%9A%A9%EC%96%B4-%EC%82%AC%EC%A0%84%28%EC%A0%84%EC%B2%B4%29.md), 출처 전체는 [17-sources.md](17-%EB%B6%80%EB%A1%9D-D.-%EC%B6%9C%EC%B2%98-%EB%AA%A9%EB%A1%9D-%EC%99%B8%EB%B6%80-%EA%B3%B5%EC%8B%9D-%EB%AC%B8%EC%84%9C-%EB%82%B4%EB%B6%80-%EC%A0%95%EB%B3%B8.md).
> **표기**: 🔴 = 어기면 데이터가 조용히 틀리는 규칙 · ⚠️ = 알고 있어야 하는 한계 · ✅ = 실측으로 확인된 것.

## 머리말(원본) — MovesEye APM 종합 안내서 — 무엇을, 어떻게, 왜 만들었나 (한 권으로 읽는 판)

- 작성: 2026-09-14. 기준: BE master `6af7c46`(P4 병합) + P4 QA 수정분(`p4-qafix`, BE 3,088 green), FE P4 worktree(계약 `contract_apm-p4.md` 기준), AI `moveseye-ai` 툴 11종.
- 대상 독자: **이 프로젝트를 만든 개발자 자신.** 2026-08-26 설계부터 09-14 P4 마감까지 3주 사이 BE 305파일·FE 112화면 파일·문서 40여 편이 생겼다. "점점 모르겠다"는 사람이 이 한 권을 처음부터 끝까지 읽으면 **무엇이 있고, 왜 그 모양이고, 무엇을 지키기로 했고, 어디까지 검증됐는지**를 다시 잡을 수 있게 썼다.
- 이 문서는 기존 해설서 두 편(`apm-code-walkthrough.md` 시간순 사연 · `apm-screen-chart-guide.md` 화면별 도움말 원문)을 **대체하지 않는다**. 저 둘은 "언제 무슨 일이"와 "이 차트가 무슨 뜻"에 답하고, 이 문서는 **개념 → 조건 → 전체상 → 데이터의 길 → 단계별 결정 → 운영 → 검증** 순으로 한 번에 읽히게 다시 짰다. 사실은 전부 정본(설계·계약·실측·검수·코드)에서 확인했고, 절마다 끝에 "더 보기"로 그 위치를 적었다.
- 표기: 🔴 = 어기면 데이터가 조용히 틀리는 규칙 · ⚠️ = 알고 있어야 하는 한계 · ✅ = 실측으로 확인된 것.
- **출처 표기**: 절 끝 **"더 보기"** = 내부 정본(설계서 §·계약서 §·QA/검수 문서 §/#·코드 파일:클래스) — 수치·결정·함정은 전부 거기서 확인했다. 외부 사실(OTel·SRE·Web Vitals·Zabbix·PostgreSQL·K8s contrib)에는 **"출처"** 줄로 공식 문서 URL을 단다. URL은 BE 설치 가이드 카탈로그 `premium/apm/collector/install/ApmDocRef.java`(31건)·검수 문서·계약서에 이미 인용돼 확인된 것만 쓰고, 확신이 낮은 항목은 상위 페이지로 적는다. 전체 목록은 **[부록 D](17-%EB%B6%80%EB%A1%9D-D.-%EC%B6%9C%EC%B2%98-%EB%AA%A9%EB%A1%9D-%EC%99%B8%EB%B6%80-%EA%B3%B5%EC%8B%9D-%EB%AC%B8%EC%84%9C-%EB%82%B4%EB%B6%80-%EC%A0%95%EB%B3%B8.md)**.

## 목차 — 19개 분책

> 🔴 **P5는 다른 장에 섞지 않고 [18-p5-realtime.md](18-P5-%EC%8B%A4%EC%8B%9C%EA%B0%84-%EA%B4%80%EC%A0%9C-%EC%A7%80%EA%B8%88-%EC%9D%B4-%EC%88%9C%EA%B0%84%EC%9D%84-%EB%B3%B4%EB%8A%94-%EA%B8%B8%28%EB%9D%BC%EC%9D%B4%EB%B8%8C-%EC%8A%A4%ED%8C%AC-X-View-%EC%9A%94%EC%B2%AD-%EA%B4%80%EC%A0%9C-%EB%B9%84%EB%8F%99%EA%B8%B0%29.md) 한 권으로 모았다.** P1~P4가 "DB에 굳힌 값을 읽는" 화면인 데 반해 P5 라이브는 **DB를 한 번도 거치지 않고 메모리에서 SSE로 흘리는** 화면이라 보존·용량·검증의 전제가 통째로 다르기 때문이다. 다른 분책에는 **연결 고리만** 넣었다 — [01](01-APM%EC%9C%BC%EB%A1%9C-%EB%AC%B4%EC%97%87%EC%9D%84-%EB%B3%B4%EB%82%98-%EB%B4%90%EC%95%BC-%ED%95%98%EB%8A%94-%EA%B2%83-%EB%B3%BC-%EC%88%98-%EC%9E%88%EB%8A%94-%EA%B2%83-%EC%9A%B0%EB%A6%AC%EA%B0%80-%ED%95%B4%EA%B2%B0%ED%95%9C-%EA%B2%83.md) §1.1 "지금 이 순간을 본다" 행 · [03](03-%EA%B5%AC%ED%98%84-%EC%A1%B0%EA%B1%B4-%EC%A0%84%EC%A0%9C-%EC%9A%B0%EB%A6%AC%EA%B0%80-%EC%A7%80%ED%82%A4%EA%B8%B0%EB%A1%9C-%ED%95%9C-%EA%B2%83.md) §3.7a P5 조건 5 · [04](04-%EB%AC%B4%EC%97%87%EC%9D%84-%EB%A7%8C%EB%93%A4%EC%97%88%EB%82%98-%EB%A9%94%EB%89%B4-14-%EB%8B%A8%EA%B3%84-P1-P5-%EB%8D%B0%EC%9D%B4%ED%84%B0-%EB%AA%A8%EB%8D%B8.md) §4.2 단계 표·§4.3 V58·V59 · [05](05-%EB%A9%94%EB%89%B4-%ED%83%AD-%EC%82%AC%EC%A0%84-%EC%9D%B4-%ED%99%94%EB%A9%B4%EC%9D%80-%EB%AC%B4%EC%8A%A8-%EC%A7%88%EB%AC%B8%EC%97%90-%EB%8B%B5%ED%95%98%EB%82%98.md) 4.5.1b 실시간 관제·4.5.1a 비동기 · [13](13-%EA%B2%80%EC%A6%9D-%ED%98%84%ED%99%A9%EA%B3%BC-%EB%82%A8%EC%9D%80-%EA%B2%83-%EB%B0%A9%EB%B2%95%EB%A1%A0-QA-%EC%88%98%EC%B9%98-%EB%AF%B8%EA%B2%80%EC%A6%9D-%EC%97%B4%EB%A6%B0-%EA%B2%B0%EC%A0%95-%EC%A0%95%EB%B3%B8-%EB%B6%88%EC%9D%BC%EC%B9%98-14.md) §8.2 R-P5 행 · [15](15-%EB%B6%80%EB%A1%9D-B.-%EC%9D%B4-%ED%94%84%EB%A1%9C%EC%A0%9D%ED%8A%B8%EA%B0%80-%EB%92%A4%EC%A7%91%EC%9D%80-%EA%B0%80%EC%A0%95-%EC%8B%A4%EC%B8%A1-%EA%B2%80%EC%88%98%EA%B0%80-%EC%84%A4%EA%B3%84%EB%A5%BC-%EB%B0%94%EA%BE%BC-36%EA%B0%80%EC%A7%80.md) #27~#36.

| # | 파일 | 원본 절 | 한 줄 | 줄 수 |
|---|---|---|---|---|
| 00 | [00-index.md](00-MovesEye-APM-%EC%A2%85%ED%95%A9-%EC%95%88%EB%82%B4%EC%84%9C-%EB%AA%A9%EC%B0%A8-%EC%9D%BD%EB%8A%94-%EC%88%9C%EC%84%9C-%EC%9A%A9%EC%96%B4-%EC%9A%94%EC%95%BD%ED%8C%90-%EC%A0%84%EC%B2%B4-%EC%A7%80%EB%8F%84.md) | 머리말 · §0 · §9 | 이 파일 — 읽는 순서·용어 요약판·전체 지도 | 144 |
| 01 | [01-what-to-see.md](01-APM%EC%9C%BC%EB%A1%9C-%EB%AC%B4%EC%97%87%EC%9D%84-%EB%B3%B4%EB%82%98-%EB%B4%90%EC%95%BC-%ED%95%98%EB%8A%94-%EA%B2%83-%EB%B3%BC-%EC%88%98-%EC%9E%88%EB%8A%94-%EA%B2%83-%EC%9A%B0%EB%A6%AC%EA%B0%80-%ED%95%B4%EA%B2%B0%ED%95%9C-%EA%B2%83.md) | §1 (1.1~1.4) | 봐야 하는 것(상황별 체크리스트)·볼 수 있는 것·해결한 문제 18·경쟁 대비 채점표 | 115 |
| 02 | [02-background.md](02-%EB%B0%B0%EA%B2%BD%EC%A7%80%EC%8B%9D-%EC%9D%B4-%EC%A0%9C%ED%92%88%EC%9D%B4-%EC%84%9C-%EC%9E%88%EB%8A%94-%EB%95%85.md) | §2 (2.1~2.7) | APM 네 질문·OTel(JSON 함정 8)·Zabbix 빌려 쓰기·PG 5기법·SRE 번 레이트·RUM·K8s | 150 |
| 03 | [03-constraints.md](03-%EA%B5%AC%ED%98%84-%EC%A1%B0%EA%B1%B4-%EC%A0%84%EC%A0%9C-%EC%9A%B0%EB%A6%AC%EA%B0%80-%EC%A7%80%ED%82%A4%EA%B8%B0%EB%A1%9C-%ED%95%9C-%EA%B2%83.md) | §3 (3.1~3.8) | OTel 단일·500 금지·라이선스 게이트·권한 축·보존 표·용량 예산·보안 계약·비범위/규약 | 157 |
| 04 | [04-overview.md](04-%EB%AC%B4%EC%97%87%EC%9D%84-%EB%A7%8C%EB%93%A4%EC%97%88%EB%82%98-%EB%A9%94%EB%89%B4-14-%EB%8B%A8%EA%B3%84-P1-P5-%EB%8D%B0%EC%9D%B4%ED%84%B0-%EB%AA%A8%EB%8D%B8.md) | §4.1~4.3 | 메뉴 14·단계 P1~**P5**(커밋·수치·검증)·마이그레이션 V38~**V59** 데이터 모델 | 97 |
| 05 | [05-menus-and-tabs.md](05-%EB%A9%94%EB%89%B4-%ED%83%AD-%EC%82%AC%EC%A0%84-%EC%9D%B4-%ED%99%94%EB%A9%B4%EC%9D%80-%EB%AC%B4%EC%8A%A8-%EC%A7%88%EB%AC%B8%EC%97%90-%EB%8B%B5%ED%95%98%EB%82%98.md) | §4.5 (4.5.1~4.5.6) | 사이드바 **9**(P5 실시간 관제 포함, FE `master` 병합 `4e4062f`·기본 전부 꺼짐)·상세 탭 12·수집기 탭 5·설정 화면 2·비노출 4·리포트/홈 위젯 — 화면별 사전(**4.5.1b 실시간 관제**·4.5.1a 비동기) | 98 |
| 06 | [06-data-path.md](06-%EC%96%B4%EB%96%BB%EA%B2%8C-%EB%8D%B0%EC%9D%B4%ED%84%B0%EA%B0%80-%EC%A7%80%EB%82%98%EA%B0%80%EB%8A%94-%EA%B8%B8.md) | §5 (5.1~5.2) | 메트릭의 길·트레이스/RUM의 길 그림 + 관문별 "왜 이 자리인가" | 135 |
| 07 | [07-p1-metrics.md](07-%EB%8B%A8%EA%B3%84%EB%B3%84-%EC%83%81%EC%84%B8-P1-%EB%A9%94%ED%8A%B8%EB%A6%AD-%EC%95%8C%EB%9E%8C-%28-P1.5-%EC%8B%A4%EC%8B%9C%EA%B0%84-Live%29.md) | §6 머리말 · 6.1 · 6.2 | P1 메트릭·알람 + P1.5 실시간(Live) | 131 |
| 08 | [08-p2-traces.md](08-%EB%8B%A8%EA%B3%84%EB%B3%84-%EC%83%81%EC%84%B8-P2-%ED%8A%B8%EB%A0%88%EC%9D%B4%EC%8A%A4-%EC%84%9C%EB%B9%84%EC%8A%A4-%EB%A7%B5-%EC%97%90%EB%9F%AC-DB-%EC%9D%98%EC%A1%B4-%EB%B0%B0%ED%8F%AC.md) | §6.3 | P2 트레이스·서비스 맵·에러/DB/의존·배포 | 111 |
| 09 | [09-permissions.md](09-%EB%8B%A8%EA%B3%84%EB%B3%84-%EC%83%81%EC%84%B8-%EA%B6%8C%ED%95%9C-%EC%98%B5%EC%85%98-%EC%A0%84%ED%99%98-%28DMOVE-%EA%B6%8C%ED%95%9C-applicationMonitoring-apm%29.md) | §6.4 (+ §3.4 사본) | 권한 옵션 전환 — V48이 V27 복제가 아닌 이유 | 75 |
| 10 | [10-p3-operations.md](10-%EB%8B%A8%EA%B3%84%EB%B3%84-%EC%83%81%EC%84%B8-P3-SLO-%ED%95%A9%EC%84%B1-%EA%B0%90%EC%8B%9C-%EB%A9%94%EC%8B%9C%EC%A7%95-%EB%B0%B0%EC%B9%98-%EB%A6%AC%ED%8F%AC%ED%8A%B8-AI-%EC%84%A4%EC%B9%98-%EC%B6%9C%EC%B2%98.md) | §6.5 | P3 SLO·합성 감시·메시징/배치·리포트·AI·설치 출처 | 96 |
| 11 | [11-p4-rum-k8s.md](11-%EB%8B%A8%EA%B3%84%EB%B3%84-%EC%83%81%EC%84%B8-P4-RUM%28%EB%B8%8C%EB%9D%BC%EC%9A%B0%EC%A0%80%29-K8s-%EC%BB%A8%ED%85%8D%EC%8A%A4%ED%8A%B8.md) | §6.6 · 6.7 | P4 RUM(브라우저)·K8s 컨텍스트 | 112 |
| 12 | [12-operations.md](12-%EC%9A%B4%EC%98%81-%EB%B0%B0%ED%8F%AC-%EC%A1%B0%EA%B1%B4-%EA%B3%A0%EA%B0%9D%EC%9D%B4-%EC%8B%A4%EC%A0%9C%EB%A1%9C-%ED%95%B4%EC%95%BC-%ED%95%98%EB%8A%94-%EA%B2%83.md) | §7 (7.1~7.11) | 토큰 5단계·Collector 설치·앱 계측 한 줄·RUM 스니펫·K8s·권한·Zabbix·PG 튜닝·배포 순서·만료 | 123 |
| 13 | [13-verification.md](13-%EA%B2%80%EC%A6%9D-%ED%98%84%ED%99%A9%EA%B3%BC-%EB%82%A8%EC%9D%80-%EA%B2%83-%EB%B0%A9%EB%B2%95%EB%A1%A0-QA-%EC%88%98%EC%B9%98-%EB%AF%B8%EA%B2%80%EC%A6%9D-%EC%97%B4%EB%A6%B0-%EA%B2%B0%EC%A0%95-%EC%A0%95%EB%B3%B8-%EB%B6%88%EC%9D%BC%EC%B9%98-14.md) | §8 (8.1~8.5) | 검증 방법론 네 겹·단계별 QA 수치(**R-P5 R1·R2·R-P5b·R-P5.6**)·미검증 목록·열린 결정 15·정본 불일치 17 | 105 |
| 14 | [14-glossary.md](14-%EB%B6%80%EB%A1%9D-A.-%EC%9A%A9%EC%96%B4-%EC%82%AC%EC%A0%84%28%EC%A0%84%EC%B2%B4%29.md) | 부록 A | 용어 사전 전체 | 96 |
| 15 | [15-overturned.md](15-%EB%B6%80%EB%A1%9D-B.-%EC%9D%B4-%ED%94%84%EB%A1%9C%EC%A0%9D%ED%8A%B8%EA%B0%80-%EB%92%A4%EC%A7%91%EC%9D%80-%EA%B0%80%EC%A0%95-%EC%8B%A4%EC%B8%A1-%EA%B2%80%EC%88%98%EA%B0%80-%EC%84%A4%EA%B3%84%EB%A5%BC-%EB%B0%94%EA%BE%BC-36%EA%B0%80%EC%A7%80.md) | 부록 B | 실측·검수가 설계를 바꾼 **36가지**(#27~#29 P5 실측 · #30~#36 P5 실측·구현 검수) | 59 |
| 16 | [16-faq.md](16-%EB%B6%80%EB%A1%9D-C.-%EC%9E%90%EC%A3%BC-%ED%95%98%EB%8A%94-%EC%A7%88%EB%AC%B8.md) | 부록 C | FAQ 18 | 63 |
| 17 | [17-sources.md](17-%EB%B6%80%EB%A1%9D-D.-%EC%B6%9C%EC%B2%98-%EB%AA%A9%EB%A1%9D-%EC%99%B8%EB%B6%80-%EA%B3%B5%EC%8B%9D-%EB%AC%B8%EC%84%9C-%EB%82%B4%EB%B6%80-%EC%A0%95%EB%B3%B8.md) | 부록 D | 외부 공식 문서 URL 전부 + 내부 정본 목록(**P5 출처 11 + 정본 6행** 포함) | 134 |
| **18** | **[18-p5-realtime.md](18-P5-%EC%8B%A4%EC%8B%9C%EA%B0%84-%EA%B4%80%EC%A0%9C-%EC%A7%80%EA%B8%88-%EC%9D%B4-%EC%88%9C%EA%B0%84%EC%9D%84-%EB%B3%B4%EB%8A%94-%EA%B8%B8%28%EB%9D%BC%EC%9D%B4%EB%B8%8C-%EC%8A%A4%ED%8C%AC-X-View-%EC%9A%94%EC%B2%AD-%EA%B4%80%EC%A0%9C-%EB%B9%84%EB%8F%99%EA%B8%B0%29.md)** | **신규 §10** | **P5 실시간 관제** — 제니퍼 대조 격차 3 · "전량"의 3분리 · 저장과 **다른 길** · 화면 3종 · 🔴 **못 하는 것과 그 이유** · 구현 7단계와 커밋 · 실측 판정(**R2 FAIL 2건**) · 아직 안 한 것 · **운영자가 켜는 법(스위치 다섯)** · **§10.10 P5.3b 자바 확장**(진행 중 요청·요청 흐름 무대·처리 중 목록·**요청 걸림 장부** `STUCK_REQUEST`, 2026-09-23) | 신규 |

## 읽는 순서 — 목적별 3코스

| 코스 | 누구에게 | 순서 | 걸리는 시간(대략) |
|---|---|---|---|
| **A. 전체상을 다시 세운다** | "점점 모르겠다"는 사람 — 이 프로젝트를 만든 개발자 자신 | [01](01-APM%EC%9C%BC%EB%A1%9C-%EB%AC%B4%EC%97%87%EC%9D%84-%EB%B3%B4%EB%82%98-%EB%B4%90%EC%95%BC-%ED%95%98%EB%8A%94-%EA%B2%83-%EB%B3%BC-%EC%88%98-%EC%9E%88%EB%8A%94-%EA%B2%83-%EC%9A%B0%EB%A6%AC%EA%B0%80-%ED%95%B4%EA%B2%B0%ED%95%9C-%EA%B2%83.md) 무엇을 보나 → [02](02-%EB%B0%B0%EA%B2%BD%EC%A7%80%EC%8B%9D-%EC%9D%B4-%EC%A0%9C%ED%92%88%EC%9D%B4-%EC%84%9C-%EC%9E%88%EB%8A%94-%EB%95%85.md) 배경 → [03](03-%EA%B5%AC%ED%98%84-%EC%A1%B0%EA%B1%B4-%EC%A0%84%EC%A0%9C-%EC%9A%B0%EB%A6%AC%EA%B0%80-%EC%A7%80%ED%82%A4%EA%B8%B0%EB%A1%9C-%ED%95%9C-%EA%B2%83.md) 조건 → [04](04-%EB%AC%B4%EC%97%87%EC%9D%84-%EB%A7%8C%EB%93%A4%EC%97%88%EB%82%98-%EB%A9%94%EB%89%B4-14-%EB%8B%A8%EA%B3%84-P1-P5-%EB%8D%B0%EC%9D%B4%ED%84%B0-%EB%AA%A8%EB%8D%B8.md) 전체상 → [06](06-%EC%96%B4%EB%96%BB%EA%B2%8C-%EB%8D%B0%EC%9D%B4%ED%84%B0%EA%B0%80-%EC%A7%80%EB%82%98%EA%B0%80%EB%8A%94-%EA%B8%B8.md) 데이터의 길 **(여기까지 한 호흡)** → [07](07-%EB%8B%A8%EA%B3%84%EB%B3%84-%EC%83%81%EC%84%B8-P1-%EB%A9%94%ED%8A%B8%EB%A6%AD-%EC%95%8C%EB%9E%8C-%28-P1.5-%EC%8B%A4%EC%8B%9C%EA%B0%84-Live%29.md)~[11](11-%EB%8B%A8%EA%B3%84%EB%B3%84-%EC%83%81%EC%84%B8-P4-RUM%28%EB%B8%8C%EB%9D%BC%EC%9A%B0%EC%A0%80%29-K8s-%EC%BB%A8%ED%85%8D%EC%8A%A4%ED%8A%B8.md) 단계별 상세는 필요한 절만 → **[18](18-P5-%EC%8B%A4%EC%8B%9C%EA%B0%84-%EA%B4%80%EC%A0%9C-%EC%A7%80%EA%B8%88-%EC%9D%B4-%EC%88%9C%EA%B0%84%EC%9D%84-%EB%B3%B4%EB%8A%94-%EA%B8%B8%28%EB%9D%BC%EC%9D%B4%EB%B8%8C-%EC%8A%A4%ED%8C%AC-X-View-%EC%9A%94%EC%B2%AD-%EA%B4%80%EC%A0%9C-%EB%B9%84%EB%8F%99%EA%B8%B0%29.md) P5 실시간 관제** → [15](15-%EB%B6%80%EB%A1%9D-B.-%EC%9D%B4-%ED%94%84%EB%A1%9C%EC%A0%9D%ED%8A%B8%EA%B0%80-%EB%92%A4%EC%A7%91%EC%9D%80-%EA%B0%80%EC%A0%95-%EC%8B%A4%EC%B8%A1-%EA%B2%80%EC%88%98%EA%B0%80-%EC%84%A4%EA%B3%84%EB%A5%BC-%EB%B0%94%EA%BE%BC-36%EA%B0%80%EC%A7%80.md) 뒤집은 가정 | 2.5~4시간 |
| **B. 고객 서버에 손을 댄다** | 설치·운영 담당 | [12](12-%EC%9A%B4%EC%98%81-%EB%B0%B0%ED%8F%AC-%EC%A1%B0%EA%B1%B4-%EA%B3%A0%EA%B0%9D%EC%9D%B4-%EC%8B%A4%EC%A0%9C%EB%A1%9C-%ED%95%B4%EC%95%BC-%ED%95%98%EB%8A%94-%EA%B2%83.md) 운영·배포 조건 → [03](03-%EA%B5%AC%ED%98%84-%EC%A1%B0%EA%B1%B4-%EC%A0%84%EC%A0%9C-%EC%9A%B0%EB%A6%AC%EA%B0%80-%EC%A7%80%ED%82%A4%EA%B8%B0%EB%A1%9C-%ED%95%9C-%EA%B2%83.md) §3.5~3.7(보존·용량·보안) **+ §3.7a P5 조건** → [05](05-%EB%A9%94%EB%89%B4-%ED%83%AD-%EC%82%AC%EC%A0%84-%EC%9D%B4-%ED%99%94%EB%A9%B4%EC%9D%80-%EB%AC%B4%EC%8A%A8-%EC%A7%88%EB%AC%B8%EC%97%90-%EB%8B%B5%ED%95%98%EB%82%98.md) 수집기 탭·알람 규칙·SLO 화면 → **[18](18-P5-%EC%8B%A4%EC%8B%9C%EA%B0%84-%EA%B4%80%EC%A0%9C-%EC%A7%80%EA%B8%88-%EC%9D%B4-%EC%88%9C%EA%B0%84%EC%9D%84-%EB%B3%B4%EB%8A%94-%EA%B8%B8%28%EB%9D%BC%EC%9D%B4%EB%B8%8C-%EC%8A%A4%ED%8C%AC-X-View-%EC%9A%94%EC%B2%AD-%EA%B4%80%EC%A0%9C-%EB%B9%84%EB%8F%99%EA%B8%B0%29.md) §10.9 라이브를 켜는 법(스위치 넷)** → [16](16-%EB%B6%80%EB%A1%9D-C.-%EC%9E%90%EC%A3%BC-%ED%95%98%EB%8A%94-%EC%A7%88%EB%AC%B8.md) FAQ → [14](14-%EB%B6%80%EB%A1%9D-A.-%EC%9A%A9%EC%96%B4-%EC%82%AC%EC%A0%84%28%EC%A0%84%EC%B2%B4%29.md) 용어 | 1~1.5시간 |
| **C. 어디까지 믿어도 되나** | 인수·검수·다음 단계 계획 | [13](13-%EA%B2%80%EC%A6%9D-%ED%98%84%ED%99%A9%EA%B3%BC-%EB%82%A8%EC%9D%80-%EA%B2%83-%EB%B0%A9%EB%B2%95%EB%A1%A0-QA-%EC%88%98%EC%B9%98-%EB%AF%B8%EA%B2%80%EC%A6%9D-%EC%97%B4%EB%A6%B0-%EA%B2%B0%EC%A0%95-%EC%A0%95%EB%B3%B8-%EB%B6%88%EC%9D%BC%EC%B9%98-14.md) 검증 현황(미검증·열린 결정·정본 불일치) → [04](04-%EB%AC%B4%EC%97%87%EC%9D%84-%EB%A7%8C%EB%93%A4%EC%97%88%EB%82%98-%EB%A9%94%EB%89%B4-14-%EB%8B%A8%EA%B3%84-P1-P5-%EB%8D%B0%EC%9D%B4%ED%84%B0-%EB%AA%A8%EB%8D%B8.md) §4.2 검증 열 → **[18](18-P5-%EC%8B%A4%EC%8B%9C%EA%B0%84-%EA%B4%80%EC%A0%9C-%EC%A7%80%EA%B8%88-%EC%9D%B4-%EC%88%9C%EA%B0%84%EC%9D%84-%EB%B3%B4%EB%8A%94-%EA%B8%B8%28%EB%9D%BC%EC%9D%B4%EB%B8%8C-%EC%8A%A4%ED%8C%AC-X-View-%EC%9A%94%EC%B2%AD-%EA%B4%80%EC%A0%9C-%EB%B9%84%EB%8F%99%EA%B8%B0%29.md) §10.7 실측 판정·§10.8 아직 안 한 것** → [15](15-%EB%B6%80%EB%A1%9D-B.-%EC%9D%B4-%ED%94%84%EB%A1%9C%EC%A0%9D%ED%8A%B8%EA%B0%80-%EB%92%A4%EC%A7%91%EC%9D%80-%EA%B0%80%EC%A0%95-%EC%8B%A4%EC%B8%A1-%EA%B2%80%EC%88%98%EA%B0%80-%EC%84%A4%EA%B3%84%EB%A5%BC-%EB%B0%94%EA%BE%BC-36%EA%B0%80%EC%A7%80.md) 뒤집은 가정 → [17](17-%EB%B6%80%EB%A1%9D-D.-%EC%B6%9C%EC%B2%98-%EB%AA%A9%EB%A1%9D-%EC%99%B8%EB%B6%80-%EA%B3%B5%EC%8B%9D-%EB%AC%B8%EC%84%9C-%EB%82%B4%EB%B6%80-%EC%A0%95%EB%B3%B8.md) 출처 | 1.5시간 |
| **D. "제니퍼처럼 왜 안 되나"에 답해야 한다** `[신규]` | 영업·고객 대응·기대치 합의 | **[18](18-P5-%EC%8B%A4%EC%8B%9C%EA%B0%84-%EA%B4%80%EC%A0%9C-%EC%A7%80%EA%B8%88-%EC%9D%B4-%EC%88%9C%EA%B0%84%EC%9D%84-%EB%B3%B4%EB%8A%94-%EA%B8%B8%28%EB%9D%BC%EC%9D%B4%EB%B8%8C-%EC%8A%A4%ED%8C%AC-X-View-%EC%9A%94%EC%B2%AD-%EA%B4%80%EC%A0%9C-%EB%B9%84%EB%8F%99%EA%B8%B0%29.md) §10.1 격차 셋 → §10.2 "전량"의 3분리 → §10.5 못 하는 것과 그 이유 → §10.4 화면이 무엇을 보여주지 않는가** → [01](01-APM%EC%9C%BC%EB%A1%9C-%EB%AC%B4%EC%97%87%EC%9D%84-%EB%B3%B4%EB%82%98-%EB%B4%90%EC%95%BC-%ED%95%98%EB%8A%94-%EA%B2%83-%EB%B3%BC-%EC%88%98-%EC%9E%88%EB%8A%94-%EA%B2%83-%EC%9A%B0%EB%A6%AC%EA%B0%80-%ED%95%B4%EA%B2%B0%ED%95%9C-%EA%B2%83.md) §1.4 경쟁 대비 채점표 | 40분 |

각 절은 **무엇을 / 어떻게 / 왜(버린 대안) / 조건·전제 / 함정·교훈** 다섯 칸으로 되어 있다 — 바쁘면 "왜"와 "함정"만 읽어도 결정의 뼈대는 남는다.

## 분책 지도 — 옛 절 번호 → 파일

원본 `guides/apm-handbook.md`의 절 번호로 링크돼 있던 곳은 이 표로 찾는다(본문 안의 `N.M절`·`N장`·`부록 X` 참조는 분책 때 전부 상대 링크로 바꿨다).

| 원본 | 파일 |
|---|---|
| 머리말 · §0 읽는 법·용어 요약판 · §9 문서 지도 | [00-index.md](00-MovesEye-APM-%EC%A2%85%ED%95%A9-%EC%95%88%EB%82%B4%EC%84%9C-%EB%AA%A9%EC%B0%A8-%EC%9D%BD%EB%8A%94-%EC%88%9C%EC%84%9C-%EC%9A%A9%EC%96%B4-%EC%9A%94%EC%95%BD%ED%8C%90-%EC%A0%84%EC%B2%B4-%EC%A7%80%EB%8F%84.md) |
| §1.1~1.4 | [01-what-to-see.md](01-APM%EC%9C%BC%EB%A1%9C-%EB%AC%B4%EC%97%87%EC%9D%84-%EB%B3%B4%EB%82%98-%EB%B4%90%EC%95%BC-%ED%95%98%EB%8A%94-%EA%B2%83-%EB%B3%BC-%EC%88%98-%EC%9E%88%EB%8A%94-%EA%B2%83-%EC%9A%B0%EB%A6%AC%EA%B0%80-%ED%95%B4%EA%B2%B0%ED%95%9C-%EA%B2%83.md) |
| §2.1~2.7 | [02-background.md](02-%EB%B0%B0%EA%B2%BD%EC%A7%80%EC%8B%9D-%EC%9D%B4-%EC%A0%9C%ED%92%88%EC%9D%B4-%EC%84%9C-%EC%9E%88%EB%8A%94-%EB%95%85.md) |
| §3.1~3.8 | [03-constraints.md](03-%EA%B5%AC%ED%98%84-%EC%A1%B0%EA%B1%B4-%EC%A0%84%EC%A0%9C-%EC%9A%B0%EB%A6%AC%EA%B0%80-%EC%A7%80%ED%82%A4%EA%B8%B0%EB%A1%9C-%ED%95%9C-%EA%B2%83.md) |
| §4.1 메뉴 13 · §4.2 단계 · §4.3 데이터 모델 | [04-overview.md](04-%EB%AC%B4%EC%97%87%EC%9D%84-%EB%A7%8C%EB%93%A4%EC%97%88%EB%82%98-%EB%A9%94%EB%89%B4-14-%EB%8B%A8%EA%B3%84-P1-P5-%EB%8D%B0%EC%9D%B4%ED%84%B0-%EB%AA%A8%EB%8D%B8.md) |
| §4.5.1~4.5.6 메뉴·탭 사전 | [05-menus-and-tabs.md](05-%EB%A9%94%EB%89%B4-%ED%83%AD-%EC%82%AC%EC%A0%84-%EC%9D%B4-%ED%99%94%EB%A9%B4%EC%9D%80-%EB%AC%B4%EC%8A%A8-%EC%A7%88%EB%AC%B8%EC%97%90-%EB%8B%B5%ED%95%98%EB%82%98.md) |
| §5.1 메트릭의 길 · §5.2 트레이스·RUM의 길 | [06-data-path.md](06-%EC%96%B4%EB%96%BB%EA%B2%8C-%EB%8D%B0%EC%9D%B4%ED%84%B0%EA%B0%80-%EC%A7%80%EB%82%98%EA%B0%80%EB%8A%94-%EA%B8%B8.md) |
| §6 머리말 · §6.1 P1 · §6.2 P1.5 Live | [07-p1-metrics.md](07-%EB%8B%A8%EA%B3%84%EB%B3%84-%EC%83%81%EC%84%B8-P1-%EB%A9%94%ED%8A%B8%EB%A6%AD-%EC%95%8C%EB%9E%8C-%28-P1.5-%EC%8B%A4%EC%8B%9C%EA%B0%84-Live%29.md) |
| §6.3 P2 | [08-p2-traces.md](08-%EB%8B%A8%EA%B3%84%EB%B3%84-%EC%83%81%EC%84%B8-P2-%ED%8A%B8%EB%A0%88%EC%9D%B4%EC%8A%A4-%EC%84%9C%EB%B9%84%EC%8A%A4-%EB%A7%B5-%EC%97%90%EB%9F%AC-DB-%EC%9D%98%EC%A1%B4-%EB%B0%B0%ED%8F%AC.md) |
| §6.4 권한 옵션 (+§3.4·§7.6 사본) | [09-permissions.md](09-%EB%8B%A8%EA%B3%84%EB%B3%84-%EC%83%81%EC%84%B8-%EA%B6%8C%ED%95%9C-%EC%98%B5%EC%85%98-%EC%A0%84%ED%99%98-%28DMOVE-%EA%B6%8C%ED%95%9C-applicationMonitoring-apm%29.md) |
| §6.5 P3 | [10-p3-operations.md](10-%EB%8B%A8%EA%B3%84%EB%B3%84-%EC%83%81%EC%84%B8-P3-SLO-%ED%95%A9%EC%84%B1-%EA%B0%90%EC%8B%9C-%EB%A9%94%EC%8B%9C%EC%A7%95-%EB%B0%B0%EC%B9%98-%EB%A6%AC%ED%8F%AC%ED%8A%B8-AI-%EC%84%A4%EC%B9%98-%EC%B6%9C%EC%B2%98.md) |
| §6.6 P4 RUM · §6.7 P4 K8s | [11-p4-rum-k8s.md](11-%EB%8B%A8%EA%B3%84%EB%B3%84-%EC%83%81%EC%84%B8-P4-RUM%28%EB%B8%8C%EB%9D%BC%EC%9A%B0%EC%A0%80%29-K8s-%EC%BB%A8%ED%85%8D%EC%8A%A4%ED%8A%B8.md) |
| §7.1~7.11 | [12-operations.md](12-%EC%9A%B4%EC%98%81-%EB%B0%B0%ED%8F%AC-%EC%A1%B0%EA%B1%B4-%EA%B3%A0%EA%B0%9D%EC%9D%B4-%EC%8B%A4%EC%A0%9C%EB%A1%9C-%ED%95%B4%EC%95%BC-%ED%95%98%EB%8A%94-%EA%B2%83.md) |
| §8.1~8.5 | [13-verification.md](13-%EA%B2%80%EC%A6%9D-%ED%98%84%ED%99%A9%EA%B3%BC-%EB%82%A8%EC%9D%80-%EA%B2%83-%EB%B0%A9%EB%B2%95%EB%A1%A0-QA-%EC%88%98%EC%B9%98-%EB%AF%B8%EA%B2%80%EC%A6%9D-%EC%97%B4%EB%A6%B0-%EA%B2%B0%EC%A0%95-%EC%A0%95%EB%B3%B8-%EB%B6%88%EC%9D%BC%EC%B9%98-14.md) |
| 부록 A / B / C / D | [14](14-%EB%B6%80%EB%A1%9D-A.-%EC%9A%A9%EC%96%B4-%EC%82%AC%EC%A0%84%28%EC%A0%84%EC%B2%B4%29.md) / [15](15-%EB%B6%80%EB%A1%9D-B.-%EC%9D%B4-%ED%94%84%EB%A1%9C%EC%A0%9D%ED%8A%B8%EA%B0%80-%EB%92%A4%EC%A7%91%EC%9D%80-%EA%B0%80%EC%A0%95-%EC%8B%A4%EC%B8%A1-%EA%B2%80%EC%88%98%EA%B0%80-%EC%84%A4%EA%B3%84%EB%A5%BC-%EB%B0%94%EA%BE%BC-36%EA%B0%80%EC%A7%80.md) / [16](16-%EB%B6%80%EB%A1%9D-C.-%EC%9E%90%EC%A3%BC-%ED%95%98%EB%8A%94-%EC%A7%88%EB%AC%B8.md) / [17](17-%EB%B6%80%EB%A1%9D-D.-%EC%B6%9C%EC%B2%98-%EB%AA%A9%EB%A1%9D-%EC%99%B8%EB%B6%80-%EA%B3%B5%EC%8B%9D-%EB%AC%B8%EC%84%9C-%EB%82%B4%EB%B6%80-%EC%A0%95%EB%B3%B8.md) |
| **§10 P5 실시간 관제**(원본에 없던 장 — 2026-09-15~17 신규) | [18-p5-realtime.md](18-P5-%EC%8B%A4%EC%8B%9C%EA%B0%84-%EA%B4%80%EC%A0%9C-%EC%A7%80%EA%B8%88-%EC%9D%B4-%EC%88%9C%EA%B0%84%EC%9D%84-%EB%B3%B4%EB%8A%94-%EA%B8%B8%28%EB%9D%BC%EC%9D%B4%EB%B8%8C-%EC%8A%A4%ED%8C%AC-X-View-%EC%9A%94%EC%B2%AD-%EA%B4%80%EC%A0%9C-%EB%B9%84%EB%8F%99%EA%B8%B0%29.md) |

## 0. 읽는 법 · 용어 사전(요약판)

**읽는 순서.** 처음이면 [1장](01-APM%EC%9C%BC%EB%A1%9C-%EB%AC%B4%EC%97%87%EC%9D%84-%EB%B3%B4%EB%82%98-%EB%B4%90%EC%95%BC-%ED%95%98%EB%8A%94-%EA%B2%83-%EB%B3%BC-%EC%88%98-%EC%9E%88%EB%8A%94-%EA%B2%83-%EC%9A%B0%EB%A6%AC%EA%B0%80-%ED%95%B4%EA%B2%B0%ED%95%9C-%EA%B2%83.md)(무엇을 보나·무엇을 해결했나) → [2장](02-%EB%B0%B0%EA%B2%BD%EC%A7%80%EC%8B%9D-%EC%9D%B4-%EC%A0%9C%ED%92%88%EC%9D%B4-%EC%84%9C-%EC%9E%88%EB%8A%94-%EB%95%85.md)(배경) → [3장](03-%EA%B5%AC%ED%98%84-%EC%A1%B0%EA%B1%B4-%EC%A0%84%EC%A0%9C-%EC%9A%B0%EB%A6%AC%EA%B0%80-%EC%A7%80%ED%82%A4%EA%B8%B0%EB%A1%9C-%ED%95%9C-%EA%B2%83.md)(조건) → [4장](04-%EB%AC%B4%EC%97%87%EC%9D%84-%EB%A7%8C%EB%93%A4%EC%97%88%EB%82%98-%EB%A9%94%EB%89%B4-14-%EB%8B%A8%EA%B3%84-P1-P5-%EB%8D%B0%EC%9D%B4%ED%84%B0-%EB%AA%A8%EB%8D%B8.md)(전체상) → [5장](06-%EC%96%B4%EB%96%BB%EA%B2%8C-%EB%8D%B0%EC%9D%B4%ED%84%B0%EA%B0%80-%EC%A7%80%EB%82%98%EA%B0%80%EB%8A%94-%EA%B8%B8.md)(데이터의 길)까지가 한 호흡이다. 6장은 단계별 상세라 필요한 절만 골라 읽어도 되고, 7장은 고객 서버에 실제로 손을 댈 때, 8장은 "어디까지 믿어도 되나"를 물을 때 연다. 각 절은 **무엇을 / 어떻게 / 왜(버린 대안) / 조건·전제 / 함정·교훈** 다섯 칸으로 되어 있다 — 바쁘면 "왜"와 "함정"만 읽어도 결정의 뼈대는 남는다.

**용어 요약판** (전체는 [부록 A](14-%EB%B6%80%EB%A1%9D-A.-%EC%9A%A9%EC%96%B4-%EC%82%AC%EC%A0%84%28%EC%A0%84%EC%B2%B4%29.md)). 처음 나오는 자리에서 풀어 쓰지만, 아래 스무 개는 미리 알고 시작하는 편이 빠르다.

| 용어 | 한 줄 |
|---|---|
| **APM** | Application Performance Monitoring. 주어가 호스트가 아니라 **서비스**인 모니터링 — "사내 Jira가 지금 느린가"에 답한다 |
| **OTel / OpenTelemetry** | 앱이 관측 데이터(메트릭·트레이스·로그)를 표준 형식으로 내보내게 하는 CNCF 표준. 우리는 **이것만** 수집 경로로 쓴다 |
| **OTLP** | OTel의 전송 프로토콜. gRPC(4317)/HTTP(4318), protobuf 또는 JSON. 우리 BE는 **JSON만** 받는다 |
| **Collector** | 고객 망 안에서 앱의 OTLP를 받아 거르고·묶고·재시도하고 우리 BE로 보내는 독립 프로세스(`otelcol-contrib 0.159.0`) |
| **스팬 / 트레이스** | 요청 처리의 한 구간 / 같은 `trace_id`를 가진 스팬 트리(요청 하나의 전체 경로) |
| **히스토그램** | 값의 분포를 버킷별 개수로 담은 것. p95는 여기서 보간해 낸다 — 원값은 없다 |
| **롤업** | 촘촘한 표(1m)를 굵은 표(5m·1h)로 접는 배치. 장기 보존과 넓은 창 조회를 싸게 만든다 |
| **워터마크** | "여기까지 접었다"를 기록한 시각. 롤업·집계가 어디서 이어 갈지 정하는 유일한 기준 |
| **SLI / SLO / 에러 버짓 / 번 레이트** | 재는 지표 / 약속(예: 30일 99.9%) / 어겨도 되는 몫 / 그 몫을 태우는 속도(1이면 창 끝에 딱 소진) |
| **RUM / Web Vitals** | 실제 사용자 브라우저에서 잰 경험 / 그 표준 지표(LCP·INP·CLS·TTFB·FCP) |
| **semconv** | Semantic Conventions. 메트릭·속성 **이름의 표준 사전**(`http.server.request.duration` 등). 이름이 곧 계약 |
| **temporality** | 메트릭 값이 **증분(DELTA)**인지 **누적(CUMULATIVE)**인지 |
| **tail 샘플링** | 트레이스가 **끝난 뒤** 결과를 보고 남길지 정하는 방식. 오류·느림 100%, 정상 2% |
| **exemplar** | 히스토그램 버킷에 붙은 대표 표본 하나(값+trace_id). **최댓값이 아니다** |
| **advisory lock** | PG가 제공하는 "행이 없어도 잡을 수 있는" 이름 잠금. 트레이스 첫 수신 경합을 막는다 |
| **파티션** | 큰 표를 날짜별 물리 조각으로 나눈 것. 보존 정리가 DELETE가 아니라 **조각 통째 DROP** |
| **UPSERT** | INSERT인데 이미 있으면 UPDATE. 1m 표는 **덧셈**, 롤업 표는 **대입** — 이 차이가 5장의 핵심 |
| **허용목록** | 받아서 저장하는 메트릭·속성의 고정 목록. 밖의 것은 버리고 "왜 버렸나"만 센다 |
| **`__other__`** | route가 서비스당 500개를 넘으면 초과분을 접는 자리표시 |
| **history.push** | Zabbix 7.0 API. 트래퍼 아이템에 값을 직접 밀어 넣는다 — 우리 알람이 Slack/Teams로 나가는 길 |

## 9. 문서 지도 — 무엇을 알고 싶을 때 어느 문서를

경로는 `C:\solutions\_workspace\` 기준.

| 알고 싶은 것 | 문서 |
|---|---|
| 처음부터 끝까지 한 번에 | **이 안내서(분책판)** — 이 목차의 순서대로 [01](01-APM%EC%9C%BC%EB%A1%9C-%EB%AC%B4%EC%97%87%EC%9D%84-%EB%B3%B4%EB%82%98-%EB%B4%90%EC%95%BC-%ED%95%98%EB%8A%94-%EA%B2%83-%EB%B3%BC-%EC%88%98-%EC%9E%88%EB%8A%94-%EA%B2%83-%EC%9A%B0%EB%A6%AC%EA%B0%80-%ED%95%B4%EA%B2%B0%ED%95%9C-%EA%B2%83.md)→[02](02-%EB%B0%B0%EA%B2%BD%EC%A7%80%EC%8B%9D-%EC%9D%B4-%EC%A0%9C%ED%92%88%EC%9D%B4-%EC%84%9C-%EC%9E%88%EB%8A%94-%EB%95%85.md)→[03](03-%EA%B5%AC%ED%98%84-%EC%A1%B0%EA%B1%B4-%EC%A0%84%EC%A0%9C-%EC%9A%B0%EB%A6%AC%EA%B0%80-%EC%A7%80%ED%82%A4%EA%B8%B0%EB%A1%9C-%ED%95%9C-%EA%B2%83.md)→[04](04-%EB%AC%B4%EC%97%87%EC%9D%84-%EB%A7%8C%EB%93%A4%EC%97%88%EB%82%98-%EB%A9%94%EB%89%B4-14-%EB%8B%A8%EA%B3%84-P1-P5-%EB%8D%B0%EC%9D%B4%ED%84%B0-%EB%AA%A8%EB%8D%B8.md)→[06](06-%EC%96%B4%EB%96%BB%EA%B2%8C-%EB%8D%B0%EC%9D%B4%ED%84%B0%EA%B0%80-%EC%A7%80%EB%82%98%EA%B0%80%EB%8A%94-%EA%B8%B8.md)→[07~11](07-%EB%8B%A8%EA%B3%84%EB%B3%84-%EC%83%81%EC%84%B8-P1-%EB%A9%94%ED%8A%B8%EB%A6%AD-%EC%95%8C%EB%9E%8C-%28-P1.5-%EC%8B%A4%EC%8B%9C%EA%B0%84-Live%29.md)→[12](12-%EC%9A%B4%EC%98%81-%EB%B0%B0%ED%8F%AC-%EC%A1%B0%EA%B1%B4-%EA%B3%A0%EA%B0%9D%EC%9D%B4-%EC%8B%A4%EC%A0%9C%EB%A1%9C-%ED%95%B4%EC%95%BC-%ED%95%98%EB%8A%94-%EA%B2%83.md)→[13](13-%EA%B2%80%EC%A6%9D-%ED%98%84%ED%99%A9%EA%B3%BC-%EB%82%A8%EC%9D%80-%EA%B2%83-%EB%B0%A9%EB%B2%95%EB%A1%A0-QA-%EC%88%98%EC%B9%98-%EB%AF%B8%EA%B2%80%EC%A6%9D-%EC%97%B4%EB%A6%B0-%EA%B2%B0%EC%A0%95-%EC%A0%95%EB%B3%B8-%EB%B6%88%EC%9D%BC%EC%B9%98-14.md) |
| 언제 무슨 일이 있었고 왜 지금 이 모양인가(시간순 사연·장별) | `guides/apm-code-walkthrough.md`(§A 연표·§9~§28) |
| 이 화면·이 차트가 무슨 뜻인가(도움말 원문·FAQ 24) | `guides/apm-screen-chart-guide.md` |
| OpenTelemetry 자체(정의·데이터 모델·한계·용어) | `guides/apm-opentelemetry-primer.md` |
| 아키텍처·파이프라인·저장·만료 정책·시장 대조·RUM 보안 계약 | `designs/devdesign_apm.md` v3.3 |
| 메뉴 13·차트 18·WBS·공수 | `designs/devdesign_apm-screens-wbs.md` v1.1 |
| 실시간(Live) 설계·힙·SSE·승격 조건 | `designs/devdesign_apm-live.md` |
| **P5 실시간 관제를 한 번에** — 왜 만들었나·못 하는 것·구현·검증·켜는 법 | **[18-p5-realtime.md](18-P5-%EC%8B%A4%EC%8B%9C%EA%B0%84-%EA%B4%80%EC%A0%9C-%EC%A7%80%EA%B8%88-%EC%9D%B4-%EC%88%9C%EA%B0%84%EC%9D%84-%EB%B3%B4%EB%8A%94-%EA%B8%B8%28%EB%9D%BC%EC%9D%B4%EB%B8%8C-%EC%8A%A4%ED%8C%AC-X-View-%EC%9A%94%EC%B2%AD-%EA%B4%80%EC%A0%9C-%EB%B9%84%EB%8F%99%EA%B8%B0%29.md)**(이 안내서의 P5 장) |
| P5 아키텍처 정본 **v4.5** — 3분리 약속·Collector 분기·수신·arena 링·SSE·payload·상한·볼륨 산정·구현 7단계·결정 | `designs/devdesign_apm-realtime.md` |
| P5 화면 정본 **v1.3** — 요청 관제·X-View·비동기의 레이아웃·문구·상호작용·색·접근성·i18n | `designs/devdesign_apm-realtime-ux.md` |
| P5 BE↔FE 계약 — SSE 이벤트 7종 payload·FE 타입·병합 규칙·상한·**착수 전 확인 A~J**·라우트/사이드바 실사 · **P5.3b** `live[svc].activeAge/activeAgeSeries/activeList`·`GET /apm/live/active-requests`·`GET /apm/stuck-requests`·대용량 방어·코덱스 반영 | `contract_apm-p5-live.md` |
| P5.3b 자바 확장 설계·PoC — 왜 스팬이 아니라 에이전트 확장인가·대가(고객 JVM)·구현 결과 | `designs/devdesign_apm-live-active-extension.md`(§8 구현 결과) · `verification/r-p5-3b-extension-poc.md` · `reviews/review_apm-p53b-inflight-stage-list*.md` |
| P5 설계 검수 왕복(아키텍처 3회전·UX 1회전) | `reviews/review_apm-realtime-design_{codex-r1,claude-r1,codex-r2,claude-r2,codex-r3,claude-r3,claude-r3b}.md` · `reviews/review_apm-realtime-ux_{codex-r1,claude-r1}.md` |
| P5 실측 — R-P5 R1·R2(분기·PII·유실·지연 / Collector 비용·저장 보호) · R-P5b(결합 YAML correctness) · R-P5.6(비동기 링크 출시 게이트) | `verification/r-p5_apm-live-pipeline.md` · `verification/r-p5b_apm-live-yaml-correctness.md` · `verification/r-p5-6_apm-async-links.md` |
| P5 구현 검수 — BE 7단계 · FE X-View·요청 관제·비동기 | `reviews/review_apm-p51-s{1,23,4,5,6,7}be_*.md` · `reviews/review_apm-p52-fe_claude.md`·`review_apm-p52_codex.md`·`review_apm-p53_codex.md`·`reviews/review_apm-p56-fe_{codex-impl,claude,codex-fix}.md` |
| BE 계약 — 스키마·수신·적재·배치·알람·트레이스 수신/롤업 | `contract_apm.md` §1~§7 |
| 읽기 API·상태 판정·수집기 API·Live·트레이스/맵 조회·권한·배포 | `contract_apm-read-api.md` |
| SLO·위젯·합성·메시징·배치·리포트 | `contract_apm-p3.md` |
| AI 툴 11·screens.json·'/' 명령·원인 브리핑 | `contract_apm-p3-ai.md` |
| RUM·K8s 계약·F1~F4 | `contract_apm-p4.md` |
| Collector↔BE JSON 실측(500 폐기·enum 숫자·exemplar 원문) | `verification/r1_apm-collector-roundtrip.md` |
| Zabbix `history.push` 실측 | `verification/r10_apm-zabbix-history-push.md` |
| 볼륨·성능 실측(686B·cold 13초·work_mem) | `verification/r3_apm-volume.md` |
| DB 성능 감사(인덱스·행 크기·조회 계층, 남은 위험 6가지) | `analysis/audit_apm-db-performance.md` |
| 종단 QA(단계별 결함·실측 표) | `verification/e2e_apm-{selfmonitoring,p1-qa,live-qa,p2-qa,permission-option,p3-qa,p4-qa}.md` |
| 검수 요청서·결과 | `reviews/review_apm-design.md`·`review_apm-p1*`·`p1_5-live*`·`p2-w{1,2,3}*`·`p2-fe1_codex`·`p2-qafix_codex`·`p3-w{1,2,3}*`·`p4-{be,fe}_claude`·`p4-fe_codex-memo` |
| 코드가 실제로 어떻게 도나(라인 번호·결정 27·결함 A1~A29) | `analysis/apm-p1-logic-analysis.md` |
| 패키지 규약 | `moveseye-be-spring/CLAUDE.md` §0.5-6/7 · `premium/apm/package-info.java`·`core/`·`otel/` · `moveseyee_fe/src/pages/application-monitoring/README.md` |
| 경험·교훈(옵시디언) | `C:\Users\DMOVE\claude-experiences\projects\moveseye\2026-08-26-apm-design.md`·`2026-08-31-apm-p1-implementation.md`·`2026-09-02-apm-p2-traces.md` |

---

## 더 보기 — 내부 정본(이 문서에서 근거로 인용한 것)

경로는 `C:\solutions\_workspace\` 기준, 코드는 각 레포 `src/main/java/com/dmove/moveseye/` 기준. 절별 정확한 위치(§·#·클래스)는 본문 각 절 끝의 **더 보기** 줄에 있고, 아래는 그것을 문서 단위로 모은 것이다.

- 이 문서 본문에는 절별 **더 보기** 줄이 없다(부록·목차 성격). 근거 문서 전체는 [17-sources.md](17-%EB%B6%80%EB%A1%9D-D.-%EC%B6%9C%EC%B2%98-%EB%AA%A9%EB%A1%9D-%EC%99%B8%EB%B6%80-%EA%B3%B5%EC%8B%9D-%EB%AC%B8%EC%84%9C-%EB%82%B4%EB%B6%80-%EC%A0%95%EB%B3%B8.md) D.2.
- 관련 분책: 다음 [01-what-to-see.md](01-APM%EC%9C%BC%EB%A1%9C-%EB%AC%B4%EC%97%87%EC%9D%84-%EB%B3%B4%EB%82%98-%EB%B4%90%EC%95%BC-%ED%95%98%EB%8A%94-%EA%B2%83-%EB%B3%BC-%EC%88%98-%EC%9E%88%EB%8A%94-%EA%B2%83-%EC%9A%B0%EB%A6%AC%EA%B0%80-%ED%95%B4%EA%B2%B0%ED%95%9C-%EA%B2%83.md) · 목차 [00-index.md](00-MovesEye-APM-%EC%A2%85%ED%95%A9-%EC%95%88%EB%82%B4%EC%84%9C-%EB%AA%A9%EC%B0%A8-%EC%9D%BD%EB%8A%94-%EC%88%9C%EC%84%9C-%EC%9A%A9%EC%96%B4-%EC%9A%94%EC%95%BD%ED%8C%90-%EC%A0%84%EC%B2%B4-%EC%A7%80%EB%8F%84.md) · 용어 [14-glossary.md](14-%EB%B6%80%EB%A1%9D-A.-%EC%9A%A9%EC%96%B4-%EC%82%AC%EC%A0%84%28%EC%A0%84%EC%B2%B4%29.md) · P5 실시간 관제 [18-p5-realtime.md](18-P5-%EC%8B%A4%EC%8B%9C%EA%B0%84-%EA%B4%80%EC%A0%9C-%EC%A7%80%EA%B8%88-%EC%9D%B4-%EC%88%9C%EA%B0%84%EC%9D%84-%EB%B3%B4%EB%8A%94-%EA%B8%B8%28%EB%9D%BC%EC%9D%B4%EB%B8%8C-%EC%8A%A4%ED%8C%AC-X-View-%EC%9A%94%EC%B2%AD-%EA%B4%80%EC%A0%9C-%EB%B9%84%EB%8F%99%EA%B8%B0%29.md) · 출처 전체 [17-sources.md](17-%EB%B6%80%EB%A1%9D-D.-%EC%B6%9C%EC%B2%98-%EB%AA%A9%EB%A1%9D-%EC%99%B8%EB%B6%80-%EA%B3%B5%EC%8B%9D-%EB%AC%B8%EC%84%9C-%EB%82%B4%EB%B6%80-%EC%A0%95%EB%B3%B8.md)

## 출처 — 외부 공식 문서(이 문서에 쓰인 것만)

이 문서 본문에는 외부 URL을 직접 인용한 줄이 없다. 전체 목록은 [17-sources.md](17-%EB%B6%80%EB%A1%9D-D.-%EC%B6%9C%EC%B2%98-%EB%AA%A9%EB%A1%9D-%EC%99%B8%EB%B6%80-%EA%B3%B5%EC%8B%9D-%EB%AC%B8%EC%84%9C-%EB%82%B4%EB%B6%80-%EC%A0%95%EB%B3%B8.md) D.1.
