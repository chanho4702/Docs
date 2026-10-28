# Moves Workforce 기간 리포트 Phase 3

2026-09-08. [[projects/agent-documents/sources/codex-experiences/projects/codex-experiences--moves-workforce-period-snapshot-phase1-2026-09-07|moves-workforce-period-snapshot-phase1-2026-09-07]] 후속 프론트 구현.

- Phase 2 RESULT 최종 계약을 설계보다 우선했다. root DTO, meta.effectiveEndDate, issues.approx, meta.membersApprox, cost 키 유무와 nullable 금액, null 작성자를 각각 유지해야 한다.
- 기존 analysisReport/periodRange는 로컬 달력이다. 백엔드가 KST인 기간 리포트에서는 복제한 periodNav를 쓰되 테스트에서 백엔드 실물과 ISO 주 연도 경계를 대조했다.
- 현재 진척과 과거 기간 스냅샷은 별도 카드로 구분하고, 선택 이후 스냅샷은 판정에 넣지 않는다. 최근 W26/M24 축의 미수집 값은 null로 남긴다.
- 이전 기간 실패는 성공한 현재 리포트를 지우지 않는다. 비용 키 없음과 비용 null, 스냅샷 unavailable과 조회 실패는 다른 화면 상태다.
- 다른 세션 변경은 시작 해시로 보호하고, merge 전후 기존 번역 namespace 값이 보존되는지 비교했다.
- Windows PowerShell에서 Python stdin으로 한글을 넘기면 기본 OutputEncoding 때문에 ?로 바뀔 수 있다. 한국어 번역/보고서는 .NET WriteAllText와 UTF8Encoding(false)로 기록하고 재읽어 검증했다.
- 지정 Jest 9 suites / 92 tests 통과. 최종 빌드 결과와 상세 파일 목록: C:/CloudJira/moves-workforce/_workspace/project-period-report/runs/phase3/RESULT.md.
