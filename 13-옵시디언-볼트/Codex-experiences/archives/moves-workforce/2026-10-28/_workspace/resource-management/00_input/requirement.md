# 자원관리(Resource Management) 페이지 — 요구사항

## 목적
1. **부하/투입가능 판단**: 각 인력이 현재 얼마나 부하(가동률)가 있는지 보고, 신규 프로젝트 투입이 가능/유효한지 판단한다.
2. **스킬 적합도 판단**: 인력이 보유한 스킬을 기준으로 특정 프로젝트에 적합한 사람인지 매칭 판단한다.

## 확정된 설계 결정 (사용자 확인 완료 2026-07-08)

### 1. 스킬 데이터 모델 = 스킬 마스터 + 태그 부여
- **스킬 마스터**: role/level과 동일한 KVS 엔티티 패턴으로 신규 `skill` 엔티티 도입. 관리자가 스킬 사전을 정의.
  - 각 스킬은 **직군(category)** 으로 분류 (사람인 채용앱처럼 직군별로 항목 묶음).
  - 예: 직군=개발 → React, Node.js, Spring, AWS ... / 직군=디자인 → Figma, Photoshop ...
- **사용자별 스킬 태그 부여**: 사용자(users)에게 스킬 마스터에서 골라 다대다로 부여. (숙련도 옵션 여부는 architect가 설계에서 판단 — 기본은 보유 여부, 확장 여지 열어둘 것)
- **백오피스 스킬 등록/관리 페이지 신규 생성**: role/level 백오피스(`/backoffice/role`, `/backoffice/level`) 패턴을 그대로 따라 `/backoffice/skill` 신설. 직군(category) 관리 포함.
- **직군별 프리셋 시드**: `rolePresets.js`, `levelPresets.js` 패턴을 따라 직군별 스킬 프리셋을 시드로 제공 (IT/개발, 디자인, 기획, 마케팅, 영업, 경영/인사 등 사람인식 직군 분류).

### 2. 부하(투입가능 여부) 판정 = 기존 실적 가동률 재사용
- 신규 스키마 확장 없이 기존 실적 기반 가동률 로직 재사용.
- 공식: `실적MD ÷ 유효가동일` (연차/반차/공휴일 차감). 이미 구현됨:
  - `src/resolver/portfolioDashboard/PortfolioAggregator.js` `computeGlobalUtilization` (:519), `:347-358`
  - `src/resolver/resourceAnalysis/ResourceAnalysisService.js` (totalMd/effectiveMmDays)
  - 워크로그 페치: `ResourceWorklogFetcher.js`
- 가동률 경계값은 settings KVS: `utilizationUnderBand`(0.7), `utilizationOverBand`(1.1), `utilizationRedBand`(1.3).
- **재사용 원칙**: 워크로그 페치는 공통 경로 수정 금지, 필요 시 기능 전용 병렬 페처로 분리 (기존 하네스 교훈).

### 3. 프로젝트 적합도 = 프로젝트 요구스킬 자동 매칭
- **프로젝트에 '요구 스킬' 입력** 기능 추가 (프로젝트 단위로 요구 스킬 목록 정의).
- 인력 보유 스킬 ↔ 프로젝트 요구 스킬 대조 → **매칭 점수/커버리지 자동 산출** (예: 2/3 = 67%, 부족 스킬 표시).
- 특정 프로젝트를 선택하면 인력별 적합도 순위/커버리지를 보여줌.

### 4. 페이지 배치
- **자원현황 뷰 = 최상위 메뉴 `/resource`** (myWork·project처럼 상단 네비게이션에 '자원관리' 탭 추가).
  - 전사 인력 풀을 한눈에: 인력별 가동률(부하) + 보유 스킬 + 투입가능 여부.
  - 프로젝트 선택 시 요구스킬 매칭/적합도 뷰.
- **스킬 등록/관리 = 백오피스 `/backoffice/skill`** (관리자 성격).

## 기존 자산 (재사용 대상)
- 사용자 모델: `users`(account_id, role_key, level_key, salary) — Forge SQL
- KVS 엔티티 패턴: role/level (`manifest.yml` storage.entities, `CustomEntityManager.js`, `SeedData.js`)
- 프리셋 패턴: `static/ui/src/backoffice/page/role/preset/rolePresets.js`, `level/preset/levelPresets.js`
- 백오피스 페이지 패턴: `static/ui/src/backoffice/page/role`, `level`
- 가동률: `PortfolioAggregator.computeGlobalUtilization`, `ResourceAnalysisService`
- 인력별 참여 프로젝트 역방향 조회: `ProjectUsersQuery.FIND_PROJECT_IDS_BY_ACCOUNT`
- 권한: usePermissionStore(canRead/canWrite), 권한 카탈로그 (permission-hardening)

## 범위 밖 (이번 미포함)
- 계획 투입(배정 기간·계획 투입률) 개념 — projectusers 스키마 확장은 하지 않음 (실적 가동률만).
- 스킬 기반 자동 배정 실행(실제 프로젝트 멤버 등록까지 자동화)은 미포함 — 판단/추천까지만.

## 주의 (프로젝트 교훈 반영)
- KVS 엔티티 새 필드는 manifest attributes 선언 필수 (아니면 422). 스키마 반영엔 forge deploy 필요.
- Jira API asApp 지양 (사용자 컨텍스트 경로).
- 번역은 locales/kr·en 폴더 추가 후 merge.js 실행. ko-KR.json/en-US.json 직접 수정 금지.
- 신규 백오피스 페이지/권한은 권한 카탈로그·서버 가드에 키 등록 필요 (permission-hardening 패턴).
- 커밋 메시지에 Co-Authored-By Claude 금지.
