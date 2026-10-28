# Moves Workforce 문서 최신화 (2026-08-20)

## 기준

- 소스 기준점은 `dbe669f`(2026-08-20)이며, 배포 완료 여부와 분리한다.
- 문서 기준선은 2026-08-20 개발 소스, DB 스키마는 v019까지다.

## 반영 내용

- `README.md`의 저장소 수를 Forge SQL 13 table로 바로잡고 `filter_json`·`spaces_json`을 명시했다.
- 아키텍처·ERD·관리자 문서에 v018(`project_dashboard.filter_json`)과 v019(`portfolio_project_snapshot.spaces_json`)을 반영했다.
- 사용자 매뉴얼과 릴리스 노트에 프로젝트 작업/인력 분석의 상단 차트, 프로젝트·전사 대시보드 확장, 간트 폴더 이동과 WBS 해제 보상을 기록했다.

## 교훈

- 제품 문서는 package version만으로 최신 여부를 판단하지 않는다. 배포되지 않은 개발 소스 기준선과 운영 반영 상태를 명시적으로 분리해야 한다.
- 마이그레이션이 추가될 때는 ERD, 관리자 설치 안내, 릴리스 노트를 같은 변경에서 함께 갱신해야 운영자가 배포 후 확인할 항목을 놓치지 않는다.

관련: [[projects/agent-documents/sources/codex-experiences/projects/codex-experiences--moves-workforce-documentation-2026-08-06-sync|moves-workforce-documentation-2026-08-06-sync]], [[projects/agent-documents/sources/codex-experiences/projects/codex-experiences--moves-workforce-gantt-reliability-hardening-2026-08-20|moves-workforce-gantt-reliability-hardening-2026-08-20]]
