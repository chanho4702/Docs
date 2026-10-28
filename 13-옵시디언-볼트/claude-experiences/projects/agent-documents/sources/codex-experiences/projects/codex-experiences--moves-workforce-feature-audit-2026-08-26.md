# Moves Workforce 기능 감사 — 2026-08-26

## 발견

- `inherited` 프로젝트 범위 인가는 payload의 `projectId` 또는 `project_id`가 있을 때만 적용된다.
- `updateProjectMemberSalary`와 프로젝트 인력·이슈 변경 resolver 일부는 자식 ID만 전달하며, SQL도 해당 ID만 조건으로 사용한다.
- 따라서 `MEMBER_ONLY` 또는 `TEAM_ONLY` 권한 세트에서 다른 프로젝트 자식 리소스를 변경할 가능성이 있다.

## 교훈

자식 리소스 mutation은 클라이언트가 제공한 프로젝트 ID만으로 범위를 판정하지 않는다. 서버가 자식 ID에서 소유 프로젝트를 확인하고, DML의 `WHERE` 절에도 프로젝트 ID를 포함해 인가와 변경 대상을 같은 경계로 고정한다.

관련 보고서: `C:\CloudJira\moves-workforce\_workspace\feature-audit-20260826\03_verify_report.md`
