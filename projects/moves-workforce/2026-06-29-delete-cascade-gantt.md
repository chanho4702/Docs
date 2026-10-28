---
tags: [project, moves-workforce, forge-sql, cascade, gantt, echarts, portfolio]
created: 2026-06-29
updated: 2026-06-29
---

# 2026-06-29 — 프로젝트 삭제 cascade 보완 + 간트 완성률 오버레이

> 한 세션에서 독립 기능 2건을 하네스 파이프라인으로 완주(둘 다 검증 통과·커밋 전). ① 프로젝트 삭제가 자식 테이블/스냅샷/캐시를 안 지우던 문제를 앱 레벨 cascade로 해결, ② 포트폴리오 간트 막대가 "일정 경과(시간)"만 그리고 "완성률(진척)"을 안 그리던 결함을 2-lane 오버레이로 해결. 산출물: `_workspace/project-delete-cascade/`, `_workspace/gantt-completion-overlay/`.

---

## ① 프로젝트 삭제 cascade 보완 (project-delete-cascade)

### 문제
`deleteProject` resolver가 `project` 테이블 단 한 행만 삭제(`DELETE FROM project WHERE project_id=...`). 연관 데이터가 전부 고아로 잔존:
- `projectusers`(인력 role/level/salary), `project_dashboard`(대시보드 위젯 레이아웃) — 둘 다 FK→project 있으나 cascade 없음
- `portfolio_project_snapshot`(전사 대시보드 스냅샷) — FK 없음, **포트폴리오에 유령 프로젝트로 잔존**
- KVS 캐시 `ProjectProgress:{pid}`·`ProjectCost:{pid}` 등(TTL 자동만료라 경미)
- `worklog_issue_daily`는 DDL 주석 처리=미존재(워크로그는 Jira 실시간 페치) → 정리 불필요

### 핵심 발견 — Forge SQL은 FK·CASCADE를 강제하지 않는다
사용자 증상("삭제는 되는데 행이 남는다")이 결정적 단서였다. FK가 강제됐다면 자식 있는 프로젝트 삭제는 *FK 위반으로 실패*했어야 한다. 공식 문서 확인 결과 **Forge SQL(TiDB) 은 FK를 인덱스로만 취급, 참조 무결성 미강제, `ON DELETE CASCADE` 무작동**. → cascade는 반드시 앱 로직으로. 상세는 [[forge-sql-no-fk-cascade]].

### 해결
`deleteProjectService`를 **자식 → 부모 FK 안전 순서** 순차 삭제로 교체:
```
projectusers → project_dashboard → portfolio_project_snapshot → project → KVS 무효화(best-effort)
```
- `@forge/sql`은 트랜잭션도 미지원(타입 정의 직접 확인) → 순차 단건 실행. 각 DELETE가 `WHERE project_id` 기반 **멱등**이라 부분 실패 시 재삭제로 완전 복구, FK 고아는 절대 안 생김.
- 각 자식 테이블 쿼리에 `DELETE_BY_PROJECT_ID` 추가(기존엔 단건 삭제만 존재).
- **경계면 계약 불변**: 응답이 부모 project DELETE 결과를 그대로 반환 → 프론트 변경 0, Controller/index.js 무변경.
- 검증: `npm test` 89/89 통과. verifier가 DDL 독립 전수 grep으로 누락 테이블 0 재확인.

### 주의(미수정, 의사결정용)
`responseWrapper`가 에러를 throw 아닌 `{success:false}` *return* → 부분 실패 시 프론트 mutation의 `onSuccess` 발화로 **성공 토스트** 오발. cascade가 statement를 1→4개로 늘려 노출 커짐. 기존 프론트 패턴이라 별도 건으로 분리(경계면 변경 필요).

---

## ② 포트폴리오 간트 완성률 오버레이 (gantt-completion-overlay)

대상: `static/ui/src/pages/portfolio/widgets/PortfolioScheduleGantt.jsx` (Portfolio → Time 탭)

### 문제 — "일정만 그리고 진척은 안 그린다"
막대 채움(파랑)은 `calElapsed=(now-start)/(end-start)` = **순수 캘린더 경과율**. 실제 작업 진척과 무관한데, InfoTip은 "완성률이 채움보다 처지면 지연"이라며 **차트에 없는 완성률과 비교를 요구**. 파란 채움은 progress bar로 오독("시간 80% 경과"를 "80% 완료"로 착각). → 간트의 핵심 가치(일정 vs 진척 = 지연 가시화)가 빠져 있었다.

### 해결 — 2-lane 막대
- 위 lane = 일정 경과(파랑 #0052CC, 기존, '오늘' 점선 픽셀 일치 유지)
- 아래 lane = **완성률**(초록 #36B37E, 신규). 완성 픽셀 = `start + clamp(completionRate,0,1)×(end-start)`
- 두 lane이 같은 start~end 폭 공유 → "시간 채움 > 완성 채움 = 지연"이 한눈에. InfoTip 문구가 비로소 관측 가능.
- 툴팁 완성률 줄 + 표 완성률 컬럼 추가. i18n `completion`/`colCompletion` 추가 + `desc`/`info.*` 갱신(kr/en, merge).

### 데이터 — 백엔드 변경 0
`completionRate`(**0~1 비율**, % 아님)가 이미 `selectedProjects`에 실려 있음(`PortfolioProjectTable.jsx`가 이미 소비). → resolver/invoke 무변경, 기존 prop만 추가 소비. 좌표 계산이 0~1 가정에 의존(×100하면 막대 100배로 깨짐)이라 계약 표에 단위 고정.
- 엣지: completionRate null→채움 생략·표 "-", >1→렌더만 클램프(툴팁/표는 원값), 일정 미설정→차트 제외·표 포함.
- 검증: `npm run build` 성공, `portfolioAggregate` 29/29 + 스냅샷 통과, i18n 키 11개 전수 누락 0.

### 범위 밖(검토 발견, 후속 후보)
타임존 시프트(UTC 막대 vs 실시간 '오늘' 선), 당일 프로젝트(start==end) 항상 0% 경과, 간트 기간=캘린더일 vs 진척도=영업일 의미 불일치, 차트 행 미정렬.

---

## 교훈

1. **삭제/정리 로직 감사 1순위는 "부모를 지울 때 자식이 따라 지워지는가"** — 그리고 그 답은 DB 엔진이 FK/CASCADE를 강제하는지에 달렸다. Forge SQL은 안 한다 → 앱 레벨 명시 cascade 필수. "삭제는 되는데 데이터가 남는다"는 증상 자체가 FK 미강제의 신호.
2. **증상이 곧 진단** — FK 강제였다면 삭제가 *실패*했을 것. 실패가 아니라 고아 잔존이라는 사실이 엔진 동작(미강제)을 역으로 증명했다. 외부 시스템 동작은 추측 말고 공식 문서로 확정([[forge-sql-no-fk-cascade]]).
3. **차트는 "비교하라는 값"을 화면에 그려야 한다** — InfoTip이 "완성률과 비교"라 하면서 완성률을 안 그리면 죽은 안내. 지표 시각화 감사는 [[2026-06-11-analysis-review]]의 "분모가 화면마다 같은가"와 같은 결: *해석 가이드가 요구하는 데이터가 실제로 화면에 있는가*.
4. **단일 색 채움 = progress bar 관용** — 의미가 "진척"이 아닌데 진한 채움 한 줄로 그리면 무조건 오독된다. 색/위치 이중 인코딩(2-lane)으로 의미를 분리.
5. **가장 싼 프론트 개선 = 이미 내려오는 prop 재소비** — completionRate는 옆 위젯이 이미 쓰던 값. 백엔드·계약 무변경으로 결함 해소. 단 단위(0~1 vs %)는 좌표 계산이 의존하므로 계약에 못박을 것.

## 관련
- [[forge-sql-no-fk-cascade]] — 이 세션에서 확정한 재사용 교훈(FK 미강제·CASCADE 무작동·트랜잭션 부재)
- [[2026-06-11-analysis-review]] — 지표/시각화 감사의 같은 결(해석 가이드 ↔ 실제 표시 일치)
- [[2026-06-01-portfolio-dashboard]] · [[2026-06-02-portfolio-implementation]] — 간트가 속한 Portfolio 대시보드, portfolio_project_snapshot 스냅샷 모델
- [[harness-engineering]] — 두 기능 모두 architect→(backend/frontend)→verifier 파이프라인 1패스 통과
