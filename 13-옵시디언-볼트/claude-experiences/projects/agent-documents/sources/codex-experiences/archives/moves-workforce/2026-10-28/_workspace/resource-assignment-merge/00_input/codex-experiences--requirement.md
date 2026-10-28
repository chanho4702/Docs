# 자원관리 탭 재편 — [인력 현황 | 프로젝트 배정] (resource-assignment-merge)

- **일자**: 2026-07-23
- **브랜치**: RFC-160 (RFC-169 커밋 f5ecb39 이후)
- **사용자 확정**: 2탭 구성 — 인력 현황 유지, 적합도(match)+배정 현황(allocation)을 "프로젝트 배정" 하나로 통합

## 1. 목적

프로젝트 상세의 작업 배정 기능(RFC-169)처럼 **할당 적합성을 판단하고 그 자리에서 할당까지 실행**하는 기능을 자원관리(/resource)에 제공한다.
기존 match 탭은 판단(스킬 랭킹)만 있고 실행이 없는 반쪽 기능 — 작업 배정 자산으로 완성한다.

## 2. 탭 재편

| 기존 3탭 | 재편 후 2탭 |
|---|---|
| 인력 현황(overview) — 사람 축 | **인력 현황** 유지 (전사 풀·부하·드로어) |
| 적합도(match) — 프로젝트 선택→스킬 랭킹 | **프로젝트 배정**으로 통합 |
| 배정 현황(allocation) — ECharts 관계도 | **프로젝트 배정**의 보조 뷰로 흡수 |

## 3. 프로젝트 배정 탭 구성

프로젝트 셀렉터(getActiveProjects 재사용) → 선택 시:
- 작업 큐 + 후보 인력(이중 스코프·스킬 매칭·괴리 신호) + 배정 실행 = **AssignmentPage 재사용**
- 관계도(AllocationGraph)는 보조 뷰
- match의 RequiredSkillEditor(요구 스킬 편집)를 통합 탭 어딘가에 배치

## 4. 핵심 전략 — 작업 배정 자산 최대 재사용 (백엔드 신규 최소화)

- `AssignmentPage`가 `project_id` prop을 받는 구조 → 셀렉터 + 재사용이 기본 방향
- resolver 3종(`getWorkAssignmentBoard`/`getWorkAssignmentPool`/`assignWorkItem`) 무수정 재사용 목표
- 이중 스코프 테이블·배정 실행+캐시 패치·스페이스 필터(`components/filter/ProjectFilterDropdown`) 재사용
- 스킬 매칭 점수는 이미 작업 배정 안에 포함

## 5. 설계 필수 논점

1. **권한 충돌 판정**: board resolver는 `R('PROJECT','detail')`+projectScope(MEMBER_ONLY면 비소속 거부), 자원관리는 `RESOURCE_MANAGEMENT` 게이트. 리소스 매니저가 비소속 프로젝트를 선택하면 막히는지 **실제 가드 코드로 판정**. 막히면 RESOURCE_MANAGEMENT 보유자 허용 방안(권한 OR 등)을 설계하되 프로젝트 상세 쪽 보안 약화 금지.
2. **RequiredSkillEditor 배치** — 셀렉터 옆 버튼/모달 등.
3. **관계도 흡수 방식** — 뷰 전환 vs 하단 섹션, AllocationTab/AllocationGraph 재사용 범위.
4. **마이그레이션** — match/allocation 컴포넌트 참조 전수 확인, i18n 키·쿼리키·테스트 정리.
5. **AssignmentPage 재사용 전제 검증** — 78vh 높이, toast prop 등 프로젝트 상세 문맥이 자원관리에서 깨지지 않는지. 수정 필요 시 옵셔널 prop+기본값 하위호환.

## 6. 제약

- 공통 이슈 페처·ResourceLoadFetcher 무수정, `invalidateQueries` 금지(캐시 패치 유지)
- **프로젝트 상세의 작업 배정 탭 회귀 금지**
- i18n: locales/kr|en + merge
- 검증: 경계면 교차 + **다중 shape 재사용 컴포넌트 점검** 포함
