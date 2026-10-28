# Moves Workforce 제품 소개서 현행화

- 제품 소개서 v1.1에 고객 역할별 가치, 최근 작업 트리 기능, 12장 PPT와 캡처 전략을 반영했다. 운영 배포 확인과 로컬 구현 확인은 구분한다.
- 비용 소개에서 AC를 실제 지급액으로 표현하지 않는다. 현재 구현은 계획 인건비 × 일정 진척률이고 이슈별 비용은 워크로그 비중으로 배분한다.
- 완성 진척에는 진행 중 이슈의 공수 비율 근사가 포함된다. 가동률은 업무 부하 지표이며 성과 점수가 아니다. 기간 리포트의 현재 상태 근사와 수집 스냅샷 이력도 구분한다.
- 루트 `Moves_Workforce_*.md`는 `.gitignore` 대상이다. 문서 변경 검증은 Git diff만으로 확인할 수 없으므로 파일 자체의 UTF-8·링크·구조를 검사한다.
- 관련: [[moves-workforce-documentation-sync-2026-08-20]], [[moves-workforce-person-analysis-2026-09-07]], [[moves-workforce-period-snapshot-phase1-2026-09-07]]
