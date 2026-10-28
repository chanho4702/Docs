# 급여 관리 리뉴얼 (salary-management)

작성: 2026-07-13 (feature-harness Phase 1)

## 확정 요구사항 (사용자 픽스)

1. **인력관리 탭에서 급여 컬럼 제거** — 프로젝트 상세 > 인력관리 테이블에서 급여 컬럼 제외.
2. **'급여 관리' 하위 탭 신설** — 프로젝트 상세의 하위 탭으로 분리. 프로젝트 인력별 급여 정보를 여기서 관리.
3. **급여 의미 재정의**:
   - 백오피스 사용자 관리에 등록하는 급여 = **연봉으로 픽스** (사용자 전역 속성, 라벨/설명도 연봉으로 변경).
   - project_users의 급여 = **투입 급여**(프로젝트 투입 기간 총단가, 기존 의미 유지).
4. **인원별 계산 모드 옵션** — 프로젝트에 인력 할당 시 이 사람을 **연봉 기반**으로 계산할지 **투입 급여 기반**으로 계산할지 선택.
   - 연봉 모드: 백오피스 연봉에서 투입 기간 기반으로 환산 (환산 규칙은 설계에서 제안 — 기존 비용 계산이 MM 안분 방식임을 고려).
   - 투입 급여 모드: 기존 방식 그대로.
5. 급여 관리 탭에서 인원별 계산 모드와 투입 급여를 조회/편집.

## 가정 (사용자 미확정 — 설계서에 명시하고 보수적으로 진행)

- **권한**: 급여 관리 탭은 기존 `PROJECT_COST` 리소스 키 재사용 (급여 = 재무 민감정보, 비용 탭과 동일 경계. 카탈로그 변경 없음). 인력관리 탭에서 급여가 빠지므로 민감정보 노출 경계가 오히려 단순해짐.
- **비용 분석 연동**: 비용 탭·Portfolio 인건비 계산은 멤버별 계산 모드를 따른다 — 연봉 모드 멤버는 환산값, 투입 급여 모드 멤버는 기존 값. (기존 데이터는 전부 투입 급여 모드로 마이그레이션 → 계산 결과 하위호환.)
- 연봉 **변경 이력 관리는 범위 제외** (단일 값). 필요 시 후속.

## 영향 범위 (초기 분석)

- **DB**: `project_users`에 계산 모드 컬럼 추가(예: `salary_type` 'PROJECT'|'ANNUAL', 기본 'PROJECT') — `src/rdb/schema/` DDL + `migrate.js` 마이그레이션. `users.salary`는 의미 재정의(스키마 변경 없을 수도).
- **백엔드**: ProjectUsers CRUD에 모드 필드, 급여 관리 탭 조회 resolver(연봉 join 포함), 비용 계산 서비스(연봉→기간 환산 분기).
- **프론트**: 인력관리 테이블 급여 컬럼 제거, `projectDetailTabs`(constants/tabs.js)에 급여 관리 탭 추가(권한 canRender), 급여 관리 페이지 신설, 할당/수정 UI에 모드 옵션, i18n(kr/en + merge).
- **권한**: 서버 가드 — 새 resolver는 PermissionMap에 매핑 필수(미등록 시 deny-by-default).

## 참고 컨텍스트

- 현재 급여: `project_users.salary` = 투입 기간 총단가. 비용 분석이 MM 안분으로 인건비 계산 (`_workspace/cost-analysis/` 참고, salary=기간 총단가 결정 2026-06-09).
- 백오피스 사용자 관리에 사용자 salary 입력 + 엑셀 업로드 경로 존재 — 연봉 라벨 반영 필요.
- 인력관리 UI: `static/ui/src/pages/projectDetail/user/`, 탭: `static/ui/src/constants/tabs.js`.
- 권한 카탈로그: `src/permission/ResourceCatalog.js` (PROJECT_COST 존재, 가드는 `guardedDefine`).
- Forge SQL(TiDB): FK/트랜잭션 미지원 — 마이그레이션은 멱등 ALTER 패턴.
