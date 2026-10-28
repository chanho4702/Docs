# 요구사항: 간트 그리드 개선 (2026-07-02, 부분 보완)

승인된 플랜: `C:\Users\DMOVE\.claude\plans\issue-link-gantt-rosy-grove.md` (전문 참조 — 본 문서는 요약)

① 헤더-데이터 영역 세로 구분선 미세 불일치 정렬 (1순위 원인: 헤더 셀 box-sizing content-box vs 바디 border-box)
② 담당자/협업자/시작일/기간 컬럼을 작업 관리(ProjectIssueTable.jsx)와 같은 인라인 편집으로
③ "계획 작업량"(MD, 편집 가능)·"처리율"(%, 읽기전용) 컬럼 추가 — 작업 관리 동일 포맷

사용자 결정:
- 기간 편집 = 일수 입력 → due = start + (n-1)일 재계산 (updateGanttSchedule 재사용)
- summary 행은 시작일/기간 읽기전용, 담당자/협업자/계획 작업량은 전 행 허용
- 바디 셀 세로선은 계속 없음(투명 1px로 폭만 대칭)

경계면 계약(additive Task shape 확장):
- Task += { issueId: string|null, originalEstimateSeconds: number|null, progressPercent: number|null }
- 응답 구조(content.tasks/links/meta) 그 외 무변경. 쓰기 백엔드 신규 없음.
