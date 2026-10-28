# 대용량 호출 방어 작업군 문서 지도 (`ZM-159`)

> 갱신: 2026-09-21. **ZM-159 종료.** 호스트 5천·아이템 1천만 규모에서 자빅스 조회가 서버를 죽이거나
> 잘린 결과를 정답처럼 보여주던 문제를 막은 작업의 **모든 문서가 어디 있고 뭘 담는지** 한 장으로.
> 새 문서가 생기면 여기에 한 줄 추가한다.

## 0. 어디부터 읽나

| 상황 | 먼저 볼 것 |
|---|---|
| **개발자가 아닌 사람에게 설명한다** | [`reports/zm-159_쉬운-설명_무엇을-왜-고쳤나.md`](../09-%EB%B3%B4%EA%B3%A0%EC%84%9C/ZM-159-%EB%8C%80%EC%9A%A9%EB%9F%89-%ED%98%B8%EC%B6%9C-%EB%B0%A9%EC%96%B4-%EB%AC%B4%EC%97%87%EC%9D%B4-%EB%AC%B8%EC%A0%9C%EC%98%80%EA%B3%A0-%EC%96%B4%EB%96%BB%EA%B2%8C-%EA%B3%A0%EC%B3%A4%EB%82%98-%28%EC%89%AC%EC%9A%B4-%EC%84%A4%EB%AA%85%29.md) — 화면별로 "뭐가 문제였고 어떻게 고쳤나" |
| **무엇을 왜 고쳤는지 정확히 알고 싶다** | [`reports/zm-159_scale-call-guard.md`](../09-%EB%B3%B4%EA%B3%A0%EC%84%9C/ZM-159-%EC%9E%91%EC%97%85-%EB%B3%B4%EA%B3%A0-%EB%8C%80%EC%9A%A9%EB%9F%89-%ED%98%B8%EC%B6%9C-%EB%B0%A9%EC%96%B4-%28%ED%98%B8%EC%8A%A4%ED%8A%B8-5%EC%B2%9C-%EC%95%84%EC%9D%B4%ED%85%9C-1%EC%B2%9C%EB%A7%8C%29.md) — 기술 보고서(1~7장). 커밋 목록·런타임 확인·남은 일이 여기 |
| **배포한다** | 같은 보고서 머리말의 🔴 **배포 주의**(설정 두 값의 관계) + §5 남은 일 |
| **왜 이렇게 설계했나** | [`designs/devdesign_zm-159-scale-call-guard.md`](../02-%EC%84%A4%EA%B3%84/ZM-159-%EB%8C%80%EC%9A%A9%EB%9F%89-%ED%98%B8%EC%B6%9C-%EB%B0%A9%EC%96%B4-%EA%B0%9C%EB%B0%9C-%EC%84%A4%EA%B3%84-v1.md) — **§0이 결정 정본**, §0.7이 범위·순서 |
| **이어서 작업한다(남은 것)** | 이 문서 §4 + [`planning/backlog_zm-159-후속.md`](../03-%EA%B8%B0%ED%9A%8D-%EB%B0%B1%EB%A1%9C%EA%B7%B8/ZM-159-%ED%9B%84%EC%86%8D-%EB%82%A8%EC%9D%80-%EC%9E%91%EC%97%85-%EC%A0%95%EB%B3%B8.md) |
| 알람·문제 흐름이 헷갈린다 | [`diagrams/alert-sync.html`](diagrams/alert-sync.html)(아키텍처) · [`diagrams/alert-sync-cycle.html`](diagrams/alert-sync-cycle.html)(회차별 증분·보정) |
| 애초에 왜 시작했나 | [`analysis/audit_scale-5000-hosts.md`](../04-%EB%B6%84%EC%84%9D-%EA%B0%90%EC%82%AC/%EB%8C%80%EC%9A%A9%EB%9F%89-%EB%8C%80%EB%B9%84-%EC%A0%84%EC%88%98-%EA%B0%90%EC%82%AC-%ED%98%B8%EC%8A%A4%ED%8A%B8-5000%EB%8C%80-%EC%95%84%EC%9D%B4%ED%85%9C-1000%EB%A7%8C.md) — 전수 감사(🔴36·🟠87) |

## 1. 층 구조

- **증거** = `_workspace/` — 왜 그렇게 결정했나, 검수·실측 기록(판단 근거 복원용). **이 문서군이 여기 있다.**
- **정본** = `moveseye-docs/` — 현재 제품이 어떻게 동작하는가. 🔴 이 레포는 우리가 커밋하지 않는다(사용자 지시 09-17).
  ZM-159이 건드린 것: `operations/설치-배포-가이드.md` §5-1 `BE_JAVA_OPTS`(**미커밋 보류** — 다른 세션 변경이 섞여 있음).
- **경험** = 옵시디언 `claude-experiences/` + 메모리 `zm-159-scale-call-guard.md` — 교훈만.

---

## 2. 문서 목록

### 2.1 보고서 (결과)
| 파일 | 담는 것 |
|---|---|
| [`reports/zm-159_scale-call-guard.md`](../09-%EB%B3%B4%EA%B3%A0%EC%84%9C/ZM-159-%EC%9E%91%EC%97%85-%EB%B3%B4%EA%B3%A0-%EB%8C%80%EC%9A%A9%EB%9F%89-%ED%98%B8%EC%B6%9C-%EB%B0%A9%EC%96%B4-%28%ED%98%B8%EC%8A%A4%ED%8A%B8-5%EC%B2%9C-%EC%95%84%EC%9D%B4%ED%85%9C-1%EC%B2%9C%EB%A7%8C%29.md) | **기술 보고서 정본.** 문제 → 변경(C1~C8·결함·범위설정·C5) → 사용자에게 보이는 변화 → 검증 → **런타임 확인(§4.9)** → 남은 일 → 커밋 11개 → 개발 중 교훈 |
| [`reports/zm-159_쉬운-설명_무엇을-왜-고쳤나.md`](../09-%EB%B3%B4%EA%B3%A0%EC%84%9C/ZM-159-%EB%8C%80%EC%9A%A9%EB%9F%89-%ED%98%B8%EC%B6%9C-%EB%B0%A9%EC%96%B4-%EB%AC%B4%EC%97%87%EC%9D%B4-%EB%AC%B8%EC%A0%9C%EC%98%80%EA%B3%A0-%EC%96%B4%EB%96%BB%EA%B2%8C-%EA%B3%A0%EC%B3%A4%EB%82%98-%28%EC%89%AC%EC%9A%B4-%EC%84%A4%EB%AA%85%29.md) | **비개발자용.** 화면 15곳을 하나씩("홈 그룹 요약", "인터페이스 상태 차트"…), 남은 것, 확인한 것 |

### 2.2 설계
| 파일 | 담는 것 | 상태 |
|---|---|---|
| [`designs/devdesign_zm-159-scale-call-guard.md`](../02-%EC%84%A4%EA%B3%84/ZM-159-%EB%8C%80%EC%9A%A9%EB%9F%89-%ED%98%B8%EC%B6%9C-%EB%B0%A9%EC%96%B4-%EA%B0%9C%EB%B0%9C-%EC%84%A4%EA%B3%84-v1.md) | **상위 설계.** §0 결정 정본 · §0.7 범위·순서(C1~C9) · §0.8 수용 기준 | v1 완료 |
| [`designs/devdesign_zm-159-c8-group-alert-scan.md`](../02-%EC%84%A4%EA%B3%84/ZM-159-C8-%EA%B7%B8%EB%A3%B9-%EC%95%8C%EB%9E%8C-%EB%AC%B8%EC%A0%9C-%EC%A1%B0%ED%9A%8C-%ED%9D%98%EB%A0%A4%EB%B3%B4%EB%82%B4%EA%B8%B0-%28H2-H3-H4%29-%EC%84%A4%EA%B3%84-v1.md) | 그룹 알람·문제 조회(H2·H3·H4) — 건수 집계 + 흘려보내기 | v1 구현됨 |
| [`designs/devdesign_zm-159-c7-truncation-notice.md`](../02-%EC%84%A4%EA%B3%84/ZM-159-C7-%EC%9E%98%EB%A6%BC-%ED%91%9C%EC%8B%9C-%28%EB%AC%B8%EC%A0%9C-%EB%AA%A9%EB%A1%9D-%EC%9D%B4%EB%A0%A5-%EB%AA%A8%EB%93%9C%29-%EC%84%A4%EA%B3%84-v1.md) | 문제 목록 이력 모드의 잘림 표시(BE 계약 + FE 배너) | v1 구현됨 |
| [`designs/devdesign_zm-159-c5-metric-completeness.md`](../02-%EC%84%A4%EA%B3%84/ZM-159-C5-%EB%A9%94%ED%8A%B8%EB%A6%AD-%EC%A1%B0%ED%9A%8C-%EC%99%84%EC%A0%84%EC%84%B1-%EA%B3%84%EC%95%BD-%EC%9D%B8%ED%84%B0%ED%8E%98%EC%9D%B4%EC%8A%A4-%EC%B0%A8%ED%8A%B8-%EC%9E%94%EC%97%AC-%EC%9E%98%EB%A6%BC-%EC%84%A4%EA%B3%84-v1.md) | **원시 시계열 완전성** — 쪼개 읽기 + 완전성 계약 + 인터페이스 차트 상태 기계. §0이 검수 반영 결정, §3.5가 검수 이력 | v1 구현됨 |
| [`designs/devdesign_zm-159-ta2-problem-cursor.md`](../02-%EC%84%A4%EA%B3%84/ZM-159-T-A-A-2-%EC%97%B4%EB%A6%B0-%EC%95%8C%EB%9E%8C-1%EB%A7%8C-%EA%B1%B4-%EC%83%81%ED%95%9C-%EC%A0%9C%EA%B1%B0%28%EC%BB%A4%EC%84%9C-%EB%B6%84%ED%95%A0%29-%EC%84%A4%EA%B3%84-v1.md) | 열린 알람 1만 건 상한 제거(커서 분할 + mark&sweep) | 🔴 **착수 보류 — 별도 티켓**(문서 상단에 사유) |
| [`designs/devdesign_load-test-synthetic-mock.md`](../02-%EC%84%A4%EA%B3%84/%EC%84%B1%EB%8A%A5-%EB%B6%80%ED%95%98-%ED%85%8C%EC%8A%A4%ED%8A%B8-%ED%95%A9%EC%84%B1-Zabbix-Mock-%EA%B8%B0%EB%B0%98-%EC%84%A4%EA%B3%84-v0.md) | 합성 mock + k6 부하 시험 — **"ZM-159 완료 ≠ 목표 규모 수용 완료"** 를 메우는 별도 트랙 | 설계만 |

### 2.3 코덱스 검수 (총 13회 — 각 `review_*.md` **하단에 반영 기록**, `*_codex.md`가 원문)
| 대상 | 요청서 | 코덱스 결과 |
|---|---|---|
| 상위 설계 | — | [`reviews/review_zm-159_codex-r1.md`](../07-%EA%B2%80%EC%88%98-%EB%A6%AC%EB%B7%B0/ZM-159-%EC%84%A4%EA%B3%84-%EA%B0%90%EC%82%AC-%EA%B2%80%EC%88%98-Codex-r1.md)(필수 8건) |
| C1·C2 공통 호출 유틸 | [`review_zm-159-c1c2.md`](../07-%EA%B2%80%EC%88%98-%EB%A6%AC%EB%B7%B0/%EA%B2%80%EC%88%98-%EC%9A%94%EC%B2%AD-ZM-159-C1-C2-%EC%9E%90%EB%B9%85%EC%8A%A4-%ED%98%B8%EC%B6%9C-%EA%B3%B5%ED%86%B5%ED%99%94%28%EB%8F%99%EC%9E%91-%EB%B6%88%EB%B3%80%29.md) | [`_codex`](../07-%EA%B2%80%EC%88%98-%EB%A6%AC%EB%B7%B0/ZM-159-C1-C2-%EA%B5%AC%ED%98%84-%EA%B2%80%EC%88%98-Codex.md) |
| C3 보호 층 | [`review_zm-159-c3.md`](../07-%EA%B2%80%EC%88%98-%EB%A6%AC%EB%B7%B0/%EA%B2%80%EC%88%98-%EC%9A%94%EC%B2%AD-ZM-159-C3-%EB%8C%80%EC%9A%A9%EB%9F%89-%EC%9D%BD%EA%B8%B0-%EB%B3%B4%ED%98%B8-%EA%B8%B0%EB%B0%98.md) | [`_codex`](../07-%EA%B2%80%EC%88%98-%EB%A6%AC%EB%B7%B0/ZM-159-C3-%EA%B5%AC%ED%98%84-%EA%B2%80%EC%88%98-Codex.md) |
| C4 메서드 이넘 | [`review_zm-159-c4.md`](../07-%EA%B2%80%EC%88%98-%EB%A6%AC%EB%B7%B0/%EA%B2%80%EC%88%98-%EC%9A%94%EC%B2%AD-ZM-159-C4-Zabbix-%EB%A9%94%EC%84%9C%EB%93%9C-%EC%9D%B4%EB%84%98-%EC%95%88%EC%A0%84%EB%A7%9D-%EC%A1%B0%EC%9D%B4%EA%B8%B0.md) | [`_codex`](../07-%EA%B2%80%EC%88%98-%EB%A6%AC%EB%B7%B0/ZM-159-C4-%EA%B5%AC%ED%98%84-%EA%B2%80%EC%88%98-Codex-%28gpt-5.6-sol%29.md) |
| C6 대량 조회 전환 | [`review_zm-159-c6.md`](../07-%EA%B2%80%EC%88%98-%EB%A6%AC%EB%B7%B0/%EA%B2%80%EC%88%98-%EC%9A%94%EC%B2%AD-ZM-159-C6-%EC%A0%84%EB%B6%80-%EA%B0%80%EC%A0%B8%EC%98%A4%EB%8D%98-%EA%B3%B3-%EC%A1%B0%ED%9A%8C-%EB%B0%A9%EC%8B%9D-%EB%B3%80%EA%B2%BD.md) | [`_codex`](../07-%EA%B2%80%EC%88%98-%EB%A6%AC%EB%B7%B0/%EA%B2%80%EC%88%98-ZM-159-C6-%EC%BD%94%EB%8D%B1%EC%8A%A4.md) |
| 독립 결함 4건 | [`review_zm-159-defects.md`](../07-%EA%B2%80%EC%88%98-%EB%A6%AC%EB%B7%B0/%EA%B2%80%EC%88%98-%EC%9A%94%EC%B2%AD-ZM-159-%EB%8F%85%EB%A6%BD-%EA%B2%B0%ED%95%A8-4%EA%B1%B4-%28T-A-X1-X6-X2-N2%29.md) | [`_codex`](../07-%EA%B2%80%EC%88%98-%EB%A6%AC%EB%B7%B0/%EA%B2%80%EC%88%98-ZM-159-%EA%B2%B0%ED%95%A8-%EC%BD%94%EB%8D%B1%EC%8A%A4.md) |
| C8 그룹 조회 | [`review_zm-159-c8.md`](../07-%EA%B2%80%EC%88%98-%EB%A6%AC%EB%B7%B0/%EA%B2%80%EC%88%98-%EC%9A%94%EC%B2%AD-ZM-159-C8-%EA%B7%B8%EB%A3%B9-%EC%95%8C%EB%9E%8C-%EB%AC%B8%EC%A0%9C-%EC%A1%B0%ED%9A%8C-%28H2-H3-H4%29-%EA%B5%AC%ED%98%84.md) | 설계 [`-design_codex`](../07-%EA%B2%80%EC%88%98-%EB%A6%AC%EB%B7%B0/%EA%B2%80%EC%88%98-ZM-159-C8-%EC%84%A4%EA%B3%84-%EC%BD%94%EB%8D%B1%EC%8A%A4.md) · 구현 [`_codex`](../07-%EA%B2%80%EC%88%98-%EB%A6%AC%EB%B7%B0/%EA%B2%80%EC%88%98-ZM-159-C8-%EC%BD%94%EB%8D%B1%EC%8A%A4.md) |
| C7 잘림 표시 | [`review_zm-159-c7.md`](../07-%EA%B2%80%EC%88%98-%EB%A6%AC%EB%B7%B0/%EA%B2%80%EC%88%98-%EC%9A%94%EC%B2%AD-ZM-159-C7-%EC%9E%98%EB%A6%BC-%ED%91%9C%EC%8B%9C%28%EB%AC%B8%EC%A0%9C-%EB%AA%A9%EB%A1%9D-%EC%9D%B4%EB%A0%A5-%EB%AA%A8%EB%93%9C%29-%EA%B5%AC%ED%98%84.md) | 설계 [`-design_codex`](../07-%EA%B2%80%EC%88%98-%EB%A6%AC%EB%B7%B0/%EA%B2%80%EC%88%98-ZM-159-C7-%EC%84%A4%EA%B3%84-%EC%BD%94%EB%8D%B1%EC%8A%A4.md) · 구현 [`_codex`](../07-%EA%B2%80%EC%88%98-%EB%A6%AC%EB%B7%B0/%EA%B2%80%EC%88%98-ZM-159-C7-%EC%BD%94%EB%8D%B1%EC%8A%A4.md) |
| 알람 동기화 범위 설정 | [`review_zm-159-event-sync-scope.md`](../07-%EA%B2%80%EC%88%98-%EB%A6%AC%EB%B7%B0/%EA%B2%80%EC%88%98-%EC%9A%94%EC%B2%AD-ZM-159-%EC%95%8C%EB%9E%8C-%EB%8F%99%EA%B8%B0%ED%99%94-%EB%B2%94%EC%9C%84-%EC%84%A4%EC%A0%95-%28%EC%9A%B4%EC%98%81-%ED%9A%8C%ED%94%BC%EC%B1%85%29.md) | [`_codex`](../07-%EA%B2%80%EC%88%98-%EB%A6%AC%EB%B7%B0/%EA%B2%80%EC%88%98-ZM-159-%EC%9D%B4%EB%B2%A4%ED%8A%B8-%EB%8F%99%EA%B8%B0%ED%99%94-%EB%B2%94%EC%9C%84-%EC%BD%94%EB%8D%B1%EC%8A%A4.md) |
| A-2 설계(보류 판단 근거) | — | [`-ta2-design_codex`](../07-%EA%B2%80%EC%88%98-%EB%A6%AC%EB%B7%B0/%EA%B2%80%EC%88%98-ZM-159-T-A-2-%EC%84%A4%EA%B3%84-%EC%BD%94%EB%8D%B1%EC%8A%A4.md) · [`-ta2-design-v1_codex`](../07-%EA%B2%80%EC%88%98-%EB%A6%AC%EB%B7%B0/%EA%B2%80%EC%88%98-ZM-159-T-A-2-%EC%84%A4%EA%B3%84-v1-%EC%BD%94%EB%8D%B1%EC%8A%A4.md) |
| **C5 완전성** | [`review_zm-159-c5.md`](../07-%EA%B2%80%EC%88%98-%EB%A6%AC%EB%B7%B0/%EA%B2%80%EC%88%98-%EC%9A%94%EC%B2%AD-ZM-159-C5-%EB%A9%94%ED%8A%B8%EB%A6%AD-%EC%A1%B0%ED%9A%8C-%EC%99%84%EC%A0%84%EC%84%B1-%EC%9D%B8%ED%84%B0%ED%8E%98%EC%9D%B4%EC%8A%A4-%EC%B0%A8%ED%8A%B8-%EC%9E%94%EC%97%AC-%EC%9E%98%EB%A6%BC-%28%EA%B5%AC%ED%98%84%29.md) — 🔴 **하단에 4차까지의 반영 기록** | 설계 [`-design_codex`](../07-%EA%B2%80%EC%88%98-%EB%A6%AC%EB%B7%B0/%EA%B2%80%EC%88%98-ZM-159-C5-%EC%84%A4%EA%B3%84-%EC%BD%94%EB%8D%B1%EC%8A%A4.md) · 구현 [`_codex`](../07-%EA%B2%80%EC%88%98-%EB%A6%AC%EB%B7%B0/ZM-159-C5-%EA%B5%AC%ED%98%84-%EA%B2%80%EC%88%98-%EA%B2%B0%EA%B3%BC.md) → [`v2`](../07-%EA%B2%80%EC%88%98-%EB%A6%AC%EB%B7%B0/ZM-159-C5-%EC%9E%AC%EA%B2%80%EC%88%98-v2.md) → [`v3`](../07-%EA%B2%80%EC%88%98-%EB%A6%AC%EB%B7%B0/ZM-159-C5-3%EC%B0%A8-%EA%B2%80%EC%88%98.md) → [`v4`](../07-%EA%B2%80%EC%88%98-%EB%A6%AC%EB%B7%B0/ZM-159-C5-4%EC%B0%A8-%EA%B2%80%EC%88%98.md) → [`v5`](../07-%EA%B2%80%EC%88%98-%EB%A6%AC%EB%B7%B0/ZM-159-C5-5%EC%B0%A8%28%EC%B5%9C%EC%A2%85-%ED%99%95%EC%9D%B8%29-%EA%B2%80%EC%88%98.md)(**승인**) |

### 2.4 근거·부속
| 파일 | 담는 것 |
|---|---|
| [`analysis/audit_scale-5000-hosts.md`](../04-%EB%B6%84%EC%84%9D-%EA%B0%90%EC%82%AC/%EB%8C%80%EC%9A%A9%EB%9F%89-%EB%8C%80%EB%B9%84-%EC%A0%84%EC%88%98-%EA%B0%90%EC%82%AC-%ED%98%B8%EC%8A%A4%ED%8A%B8-5000%EB%8C%80-%EC%95%84%EC%9D%B4%ED%85%9C-1000%EB%A7%8C.md) | 시작점. 호스트 5천·아이템 1천만 가정 전수 감사(🔴36·🟠87·보안 4) |
| [`planning/tickets_scale-hardening.md`](../03-%EA%B8%B0%ED%9A%8D-%EB%B0%B1%EB%A1%9C%EA%B7%B8/%EB%8C%80%EC%9A%A9%EB%9F%89-%EB%8C%80%EB%B9%84-%EB%B3%B4%EA%B0%95-%ED%8B%B0%EC%BC%93-%EC%B4%88%EC%95%88-%281%EC%B0%A8-%EC%95%8C%EB%9E%8C-%EC%83%81%ED%95%9C-AWS-%EB%A7%A4%EC%B2%98%29.md) | 감사 → 티켓 초안(T-A·T-B 등) |
| [`analysis/zabbix-api-7.0-methods.md`](../04-%EB%B6%84%EC%84%9D-%EA%B0%90%EC%82%AC/Zabbix-7.0-API-%EB%A9%94%EC%84%9C%EB%93%9C-%EC%A1%B0%EC%82%AC%ED%91%9C-%28ZM-159-C4%29.md) | 자빅스 API 7.0 메서드 111개 조사표(C4 이넘의 근거, 테스트가 대조) |
| [`diagrams/alert-sync.html`](diagrams/alert-sync.html) + `.architecture.json` | 알림 로직 아키텍처(자빅스 → 동기화 → 사본 DB → 화면) |
| [`diagrams/alert-sync-cycle.html`](diagrams/alert-sync-cycle.html) + `.workflow.json` | 회차별 흐름 — 증분(15초)·보정(5분)이 각각 무엇을 하고 하루에 얼마나 쌓이는지 |
| [`INDEX_zabbix-performance.md`](%EC%9E%90%EB%B9%85%EC%8A%A4-%EC%84%B1%EB%8A%A5-%EC%9E%91%EC%97%85%EA%B5%B0-%EB%AC%B8%EC%84%9C-%EC%A7%80%EB%8F%84-%28ZM-123-ZM-93-ZM-136%29.md) | 상위 지도 — 자빅스 성능 전반(ZM-123·93·136). ZM-159은 그 뒤를 잇는 작업 |

---

## 3. 무엇을 만들었나 (코드 지도)

| 층 | 핵심 | 파일 |
|---|---|---|
| 호출 공통화 | 요청 조립·응답 변환 단일화, `ZabbixClient` 직접 접근 금지(테스트가 **바이트코드**로 강제) | `engine-zabbix/.../client/ZabbixApiTemplate`·`ZabbixParams` |
| 보호 층 | id 분할 · 기간 창 분할 · id 커서 · 행 상한(`limit=maxRows+1`) · 예산(행·콜·시간) | `client/ZabbixQueryExecutor` |
| 상한 설정 | 응답 바이트 · 보유 행 · 스캔 행 · **원시 보유 행** · 콜 수 · 기한 + **기동 시 검증** | `client/ZabbixCallLimits` |
| 메서드 계약 | 자빅스 메서드 111개 이넘(성격·문서 링크, 버전은 한 곳) | `client/ZabbixMethod` |
| 완전성 계약 | 알람 `AlertScanOutcome` · 측정값 `SeriesResult`·`HistoryScanResult` | `engine-api/.../engine/model/`, `.../zabbix/timeseries/history/model/` |
| 운영 회피책 | 알람 동기화 범위(그룹·최소 심각도·억제 제외·꺼진 규칙 제외) | `app .../event/EventSyncScope`, FE `EventSyncScopeCard` |

---

## 4. 남은 것 (2026-09-21 기준)

정본은 [`planning/backlog_zm-159-후속.md`](../03-%EA%B8%B0%ED%9A%8D-%EB%B0%B1%EB%A1%9C%EA%B7%B8/ZM-159-%ED%9B%84%EC%86%8D-%EB%82%A8%EC%9D%80-%EC%9E%91%EC%97%85-%EC%A0%95%EB%B3%B8.md). 요약:

| 항목 | 성격 |
|---|---|
| **A-2 열린 알람 1만 건 초과분** | 🔴 별도 티켓 — 설계·검토는 끝났고 치명 4건이 남아 ZM-159 범위를 넘는다 |
| 인터페이스 차트 "일부만 표시" 문구 | 후속(응답 계약 변경) |
| C5 후속 3건 | 비차단(버퍼 해제 테스트·희소 조회 호출 수 실측·요청 단위 공통 RPC 예산) |
| 응답 상한 16MiB | 대규모 힙 실측 선행 |
| 인터페이스 차트 실물 확인 | 포트 다수 장비 환경 필요(개발 자빅스에 0개) |
| 푸시 · `moveseye-docs` 문서 커밋 | 사용자 직접 / 다른 세션 변경과 섞여 보류 |
