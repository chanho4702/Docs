---
name: salary-management
description: "급여 관리 리뉴얼(2026-07-13 설계 확정) — 백오피스 급여=연봉, project_users.salary=투입급여, 인원별 salary_type(PROJECT|ANNUAL), ANNUAL 환산=월할((연봉/12)×개월수)"
metadata: 
  node_type: memory
  type: project
  originSessionId: c8038c85-a3dd-4b89-b6e3-9bd206fcdd5c
---

급여 관리 리뉴얼 (_workspace/salary-management/, feature-harness 파이프라인, 2026-07-13 설계·구현·검증 완료 — 백엔드 219/프론트 73 테스트 통과, E2E(배포 후 v012 마이그레이션+invoke 왕복) 미수행, 커밋 전).

핵심 결정 (사용자 픽스):
- **백오피스 users.salary = 연봉**으로 재정의 (UI 라벨만 변경, 엑셀 머신 헤더 `Salary`는 유지)
- **project_users.salary = 투입 급여**(기간 총단가, 기존 의미 유지) + 신규 `salary_type` 컬럼('PROJECT'|'ANNUAL', 기본 PROJECT, v012 멱등 ALTER)
- **ANNUAL 환산 = 월할**: `유효 인건비 = round((연봉/12) × projectMonths)`, `projectMonths = 달력일수(종료일 포함)/30.4375`. 근무일 기반(일급×근무일)은 **사용자가 명시 거부** — 휴가는 유급이라 근무일 차감 환산은 실제 지급과 안 맞는다는 이유. 공휴일 페치 불필요
- **탭 구조**: 인력관리를 부모 탭으로 승격(analysisReport children 패턴) → [인력 목록, 급여 관리]. 인력관리 테이블에서 급여 컬럼 제거
- **권한**: PROJECT_COST 재사용 (새 카탈로그 키 없음). 인력 추가는 기본 PROJECT 삽입, 모드 편집은 급여 탭에서만
- 비용 탭·Portfolio 인건비는 멤버별 유효급여(resolveMemberSalaries)로 통일 — 전 기존 행이 PROJECT 모드라 계산 하위호환

**Why:** 프로젝트 투입 단가만으로는 정규직(연봉제) 인력 비용을 표현 못 함.
**How to apply:** 급여/비용 관련 작업 시 이 이원 구조와 월할 환산식을 전제로. 경계면 계약은 `_workspace/salary-management/01_architect_design.md` §2가 단일 진실. 관련: [[project-cost-analysis]]
