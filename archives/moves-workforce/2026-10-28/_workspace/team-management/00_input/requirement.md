# 요구사항 — 팀(Team) 개념 도입

> 작성: 2026-07-27 / 리더(오케스트레이터)
> 범위: 설계·기획 단계. 구현 착수는 설계 승인 후 별도 판단.

## 1. 목적

기존에 **사용자(account) 단위로만** 동작하던 권한·분석·배정을 **팀 단위로 확장**한다.
조직의 실제 구조(본부 > 팀 > 파트)를 시스템에 반영해, 팀장이 자기 조직을 관리하고
분석 지표를 팀 차원에서 볼 수 있게 한다.

## 2. 확정된 결정 (사용자 승인, 2026-07-27)

### D1. 팀 구조 — 단일 소속 + 계층
- 사용자 1명은 **정확히 하나의 팀**에 속한다(다중 소속 없음).
- 팀은 **자기참조 트리**(`parent_team_id`)로 계층을 이룬다. 예: 본부 > 개발팀 > 프론트파트
- 팀은 **팀장**(`leader_account_id`)을 가진다.

### D2. 팀별 권한 — 3가지 모두 채택
1. **데이터 범위 제한 (TEAM_ONLY)** — 기존 `projectScope`(ALL/MEMBER_ONLY)에 `TEAM_ONLY` 추가.
   내 팀이 참여한 프로젝트·내 팀원만 조회 가능.
2. **팀장 역할** — 팀장은 자기 팀원에 대해 write 권한(급여·스킬 편집, 배정 등).
   사람이 아니라 **관계**가 권한을 결정하므로 가드에 새 판정축이 필요하다.
3. **팀에 권한세트 부여** — `permission_key`를 팀에 할당, 팀원이 상속.
   개인 권한과의 우선순위 규칙 필요.

### D3. 팀 할당 대상 — 2가지
- **사용자 → 팀 소속** (필수 기반)
- **프로젝트 → 팀 배정** (팀 단위 투입)
- ❌ **작업(이슈) → 팀 배정은 이번 범위에서 제외** (Jira 필드/프로퍼티 추가 부담)

### D4. 팀별 분석 — 기존 화면 확장
- 자원관리·포트폴리오·비용 등 **기존 분석 화면에 팀 필터·그룹핑을 추가**한다.
- ❌ 팀 전용 대시보드 신설은 이번 범위 제외(후속 검토).

## 3. 현재 구조 (조사 결과 — 설계 전제)

### 권한 시스템
```
users.permission_key ─→ KVS 'permission' 엔티티
                          ├ pages[]      : 리소스 14키 × {read, write}
                          └ projectScope : 'ALL' | 'MEMBER_ONLY'
```
- 해석기: `src/permission/PrincipalResolver.js` — 단일 진실 원천(SSOT)
  - 반환 principal: `{ accountId, isAdmin, isUser, name, pages, resourceMap, projectScope, memberProjectIds }`
  - **L1 in-memory 캐시 TTL 30초** (권한 변경 최대 30초 지연 전파)
  - 비admin 조회 비용: Jira 1 + users SQL 1 + KVS 1 (+ MEMBER_ONLY 시 projectusers SQL 1)
- 가드: `src/permission/permissionGuard.js` `guardedDefine()` — deny-by-default, `responseWrapper` 흡수
- 매핑: `src/permission/PermissionMap.js` (~110키), 카탈로그: `src/permission/ResourceCatalog.js` (14키)
- `scopedProjectIds(principal)` → MEMBER_ONLY일 때만 소속 프로젝트 id 배열, 그 외 null

### 데이터 모델 (Forge SQL / MySQL)
```sql
users(account_id PK, permission_key, role_key, level_key, salary, created_*, updated_*)
projectusers(...)          -- 사용자↔프로젝트 배정
project(...), project_dashboard(...)
user_schedule(...), user_skills(...), project_skills(...)
portfolio_project_snapshot(...)  -- 일 배치 스냅샷
```
- DDL 위치: `src/rdb/schema/ddl/`, 마이그레이션: `src/rdb/schema/migrate.js`

### 플랫폼 제약 (반드시 준수)
- **Forge SQL(TiDB)은 FK 미강제 · ON DELETE CASCADE 무효 · 트랜잭션 미지원**
  → cascade 삭제는 **앱 레벨 순차 멱등 DELETE**로 구현 (프로젝트 삭제 선례 존재)
- Forge SQL 프로덕션 **1GiB / 200테이블** 제한 (누적형 — 앱 정지 위험)
- KVS 엔티티는 **manifest `attributes` 선언 필수**(누락 시 저장 422), 스키마 반영에 `forge deploy` 필요
- KVS 엔티티 **20종 제한**

## 4. 설계에서 반드시 답해야 할 쟁점

architect는 아래를 **명시적으로** 결정하고 근거를 남긴다. 얼버무리지 말 것.

### R1. 계층 롤업 범위
`TEAM_ONLY` 스코프가 **하위 팀까지 포함**하는가?
- 본부장이 TEAM_ONLY면 산하 전체가 보여야 자연스럽다 → 재귀 필요
- 재귀 깊이 제한, 순환 참조(A>B>A) 방지 규칙
- **TiDB에서 재귀 CTE 지원 여부를 확인**하고, 미지원이면 앱 레벨 재귀 + 캐시 전략 제시

### R2. 권한 우선순위
개인 `permission_key`와 팀 상속 권한이 **동시에 존재할 때** 어느 쪽이 이기는가?
- 개인 우선(오버라이드) / 팀 우선 / 합집합(더 넓은 쪽) 중 택1 + 근거
- 개인 권한 미지정 시에만 팀 상속인지, 항상 병합인지
- **fail-close 원칙 유지** — 판정 불가 시 거부

### R3. 팀장 판정의 가드 통합
- `principal`에 무엇을 추가할 것인가 (예: `leadingTeamIds`, `teamId`, `teamScopeAccountIds`)
- `PermissionMap`에 팀장 전용 표현이 필요한가 (예: `TEAM_LEAD` 유사 grant)
- 팀장 write 대상 판정(`enforceProjectScope`와 유사한 `enforceTeamScope`)을 어디에 둘 것인가
- **성능**: PrincipalResolver에 팀 조회가 추가되면 쿼리가 는다. 30초 캐시로 흡수되는지, 계층 재귀까지 캐시할지

### R4. 프로젝트-팀 배정과 기존 개인 배정(`projectusers`)의 관계
- 팀을 프로젝트에 배정하면 팀원이 `projectusers`에 **자동 추가**되는가, 아니면 **별개 축**으로 공존하는가
- 자동 추가라면: 팀원 입/퇴사 시 동기화 규칙, 개인 배정 해제와의 충돌
- 별개 축이라면: 기존 화면(인력 탭·작업 배정·분석)이 두 출처를 어떻게 합치는가
- **기존 `projectusers` 소비 코드 전수 영향도**를 반드시 조사할 것

### R5. 기존 분석 화면 확장 범위
팀 필터·그룹핑을 넣을 화면을 **구체적으로 열거**하고, 각각 어떤 지표를 팀 단위로 재집계할지 명시.
- 후보: 자원관리(/resource), 포트폴리오 대시보드(/dashboard), 비용 분석, 마이페이지
- **`portfolio_project_snapshot` 일 배치에 팀 차원을 추가해야 하는가** (스냅샷 스키마 변경 = 재집계 필요)

### R6. 마이그레이션·초기 데이터
- 기존 사용자 전원은 팀 미소속 상태로 시작한다. **팀 미소속자의 권한·분석 노출 규칙**을 정의할 것
- `TEAM_ONLY` 스코프인데 팀이 없으면? (fail-close = 아무것도 안 보임)
- 시드 데이터 필요 여부(`src/seed/SeedData.js`, `SEED_VERSION`)

### R7. 백오피스 UI
- 팀 관리 페이지(`/backoffice/team`) 신설 — 계층 트리 편집, 팀장 지정, 팀원 배치
- 기존 `/backoffice/users`에 팀 컬럼 추가
- 권한 설정 페이지에 팀 권한세트 할당 UI

## 5. 비목표 (이번 범위 아님)

- 작업(이슈) 단위 팀 배정 — Jira 커스텀필드/프로퍼티 추가 필요
- 팀 전용 대시보드 신설
- 다중 팀 소속(매트릭스 조직)
- 팀 간 이동 이력 추적(HR 기능)

## 6. 산출물 기대치

`01_architect_design.md`에 다음이 포함되어야 한다:
- DB 스키마(DDL 초안) + 마이그레이션 계획
- **경계면 계약 표**: resolver 함수명 · 입력 · 응답 shape · 대응 프론트 훅/쿼리키
- 권한 모델 확장 설계(PrincipalResolver·PermissionMap·ResourceCatalog 변경점)
- 프론트 구조(페이지·스토어·쿼리키 팩토리·i18n 키)
- 기존 코드 영향도(파일 단위) + 회귀 위험
- 단계 분할 제안(P0/P1/P2) — 한 번에 다 만들지 말 것
