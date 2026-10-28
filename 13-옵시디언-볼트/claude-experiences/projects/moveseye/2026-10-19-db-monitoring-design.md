---
date: 2026-10-19
project: moveseye
tags: [moveseye, db-monitoring, premium, design, codex-cross-review, jdbc, zabbix, otel]
status: 설계 v1.1 · 사용자 미결 Q1~Q21 대기 · 구현 0
---

# 2026-10-19 — DB 모니터링(PREMIUM) 설계: 시장 조사 → 독립 제안 교차 → 검수 반영

## 무엇을 했나
사용자: "디비모니터링 해야 해. 유료 기능이라 좀 많이 지원해야. 오텔처럼 다른 에이전트 써도 되니까 시중 제품 검색해서 아이디어 얻고 코덱스 상위 모델이랑 교차 검증하면서 설계".

1. **조사 3갈래 병렬**(에이전트 3개): 상용 8종(Datadog DBM·New Relic·Dynatrace·DPA·Redgate·Quest·PMM·Grafana) / Zabbix 공식 템플릿·OTel receiver·엔진별 뷰·권한·Oracle 팩 / 국내(MaxGauge·WhaTap·SysMasterDB·공공 점유율·RFP 재구성). 기록 `_workspace/features/premium/db-monitoring/research_db-monitoring-2026-10-19.md`.
2. **코덱스 독립 제안**을 조사와 동시에 받음(같은 브리프, 내 초안 없이) → `proposal_db-monitoring_codex.md`.
3. 설계서 v1 작성 → **코덱스 검수**(🔴11·🟡4·공정성 7·빠진 질문 12) → **v1.1 전건 반영**. `_workspace/features/premium/db-monitoring/devdesign_db-monitoring.md`, 검수 `_workspace/reviews/review_db-monitoring-design{,_codex}.md`.

## 핵심 발견 (전제를 뒤집은 사실)
- **Zabbix 공식 DB 템플릿 7종 전부 인스턴스 집계치만** 준다 — 세션·Top SQL·락 트리·플랜 없음. 프리미엄 설계 §5.9의 "템플릿 활용" 전제는 유료 비교표에서 탈락하는 전제였다.
- **Zabbix 공식 Oracle 템플릿 2종은 `V$ACTIVE_SESSION_HISTORY`를 조회**(Diagnostics Pack 필요, SE2 불가). 고객 안내 필요.
- OTel receiver(PG·MySQL·MSSQL·Oracle)에는 query_sample/top_query/query_plan events가 **있다**("카운터뿐" 오판 주의) — 그러나 `development`·Oracle alpha·국산 DB 없음.
- 국내 시장: 1차 질문은 "DB 서버에 뭘 깔아야 하나" → WhaTap은 에이전트리스(원격 JDBC) 기본·5초, MaxGauge는 설치형·초 단위. Tibero·CUBRID는 공공 각 9~10%.

## 결정 (v1.1)
JDBC 폴러(BE 내장, 에이전트리스) 1차 · Zabbix = 호스트 OS 상관·발견·알람 배달(+카운터 개요 모드 선택) · OTel은 **R7 비교 실측 후** 시기 결정 · 세션 5s 기본(1s는 전체 적재 예산 안에서) · Oracle 객체별 허용목록(팩 객체 호출 금지) · 식별 4층(target/endpoint/node/namespace) · lease fencing + 델타 checkpoint · 마스킹은 엔진 정규화 텍스트도 저장 직전 재검사 · **만료(EXPIRED)부터 폴러 정지** · 용량 ≈115~145GB(예산 150~200GB) · GA 270~355 사람-일.

## 교훈
- **코덱스 교차 검증의 가치는 "독립 제안 + 검수" 두 번**이었다. 독립 제안은 같은 결론(JDBC 1차)으로 방향을 확인해 줬고, 검수는 내가 못 본 결함을 잡았다: ① 기존 라이선스 커널 원칙을 설계서 한 줄로 예외 처리하려던 것(`EXPIRED` 폴러 지속) ② 엔진 정규화 텍스트를 보안 경계로 착각 ③ `ZabbixAlertBridge` "일반화"라고 썼지만 1,700행이 APM 규칙에 결합 ④ 용량 합계에서 1h 롤업·batch·락·플랜을 빠뜨림.
- **"재사용한다"는 주장은 파일 크기와 결합도를 보고 쓸 것.** 패턴 재사용(파티션·가이드 텍스트)과 클래스 직접 재사용은 다르다.
- **대조 표를 쓸 때 상대 제안을 좁혀 적지 말 것** — 검수가 "제안 의도를 좁혔다"고 7건 지적. 특히 시기 차이로 보이는 것(원격형 P5)이 실은 지원 범위 차이(GA 토폴로지 축소)였다.
- 코덱스 모델 목록이 바뀌어(`gpt-6.1-sol`이 현행 워크호스) 메모리 등급표를 갱신했다. astra 금지는 유지.

## 다음
사용자 Q1~Q21 확정(핵심: **Q12 원격 실행형 GA 포함**, **Q13 만료 후 조회 정책**, Q3 RAC, Q9 시험 VM) → v2 착수본 → P0 실측 R1~R8.

관련: [[moveseye]] · APM 설계 교훈 [[2026-08-26-apm-design]] · GPU 수집 경로 패턴
