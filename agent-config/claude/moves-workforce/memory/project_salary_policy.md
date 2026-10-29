---
name: salary-policy
description: "RFC-163 급여 정책(등급 밴드 vs 인원별) — 개인 연봉 노출 차단, 2026-08-03 풀스택 구현+검증 완료·커밋 전·E2E 미수행"
metadata: 
  node_type: memory
  type: project
  originSessionId: f0a99b72-3b6a-4567-9bb9-cab500e92b3b
  modified: 2026-08-04T00:16:49.687Z
---

**RFC-163** = 급여 정책(Salary Policy). 워크트리 `C:\CloudJira\moves-workforce-rfc-163`(브랜치 `RFC-163`, base `ea5ef4a`), 산출물 `_workspace/salary-policy/`.

문제: 백오피스 인력관리에서 개인 연봉이 그대로 노출됨. 해결 = 전사 단일 `settings.salaryPolicy`
- `INDIVIDUAL`(기본, 기존 동작) — `users.salary` 개인 연봉 기준
- `LEVEL_BAND` — KVS `level`에 `salaryMin/salaryMax/salaryRepresentative` 매핑, **대표값**으로 인건비 계산. 개인 연봉은 DB 보존하되 **서버 응답에서 키 자체를 제거**(프론트 숨김 아님)

사용자 확정 D1~D8: 전사 단일 모드 / 범위+대표값 / 기존 연봉 보존+완전 숨김 / 설정 카드+등급 페이지 밴드 컬럼 / LEVEL_BAND에서 투입급여 편집 거부 / `getSummaryData.total_salary` 기존 결함은 별건 RFC / 범위 P0+P1 / **D8 정책 불일치 스냅샷은 `costMasked` 마스킹**. 거부: 하이브리드·프로젝트별·단일 표준단가·권한자 예외표시.

**재사용 가능한 설계 원리 (다른 기능에도 적용됨):**
- 계산 함수 확장은 **기본 인자 + 앞에 분기 추가**로 무회귀를 구조 보장 → 기존 테스트 무수정 통과가 게이트
- **fail-close 방향이 경로별로 다르다**: 표시=숨김 폴백 / 계산=예외 전파(계산에서 숨김 폴백하면 숫자가 조용히 거짓)
- 정책 게이팅은 **내부 소비자가 있는 서비스면 Controller 레이어**에 둔다 (`getUserInfo`←PrincipalResolver, `getSummaryData`←ProjectCost/ProjectUsers/**ProjectProgress**). 서비스에 넣으면 무관한 경로에 KVS 왕복이 붙는다
- `costMasked` 같은 **기존 단일 신호에 얹으면 프론트 무수정으로 20여 렌더 지점이 한번에 가려진다**
- 정적 렌더 가드는 범위를 넓히면 정상 경로가 오탐돼 테스트가 무력화된다 — 실제 사고 유형만 금지 + 양성 단언 병행

상태: 설계 r3 → 백엔드 → 프론트 → 검증 2회 완료. 백엔드 62/995·프론트 62/1061 통과, 빌드 성공, 누출 0·무회귀 0. **커밋 완료 `1cfc9bf`(2026-08-04, 브랜치 RFC-163, 76파일). 미배포·E2E 미수행** — 배포 검증 필수: manifest attributes(`forge deploy` 선행, 안 하면 422)·v015 마이그레이션·LEVEL_BAND 재집계 후 팀 분석·A안 마스킹 실물·`unpricedMemberCount===null` 레거시 캐시 구간.

**Why:** 인사 정보 노출 리스크 + 개인 연봉 입력 자체를 원치 않는 조직 대응.
**How to apply:** 급여/비용 작업 시 이 정책 축을 전제로. 선행 구조는 [[salary-management]], 비용 소비처는 [[project-cost-analysis]], 팀 KPI 소비는 [[team-analytics]].
