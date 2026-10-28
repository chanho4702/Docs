---
name: feature-design
description: "Moves RMS Forge 앱의 신규 기능을 설계하는 스킬. 요구사항을 백엔드 계층(resolver/service/repository)·프론트 구조·DB·i18n 키 + 경계면 계약 설계서로 변환한다. feature-architect 에이전트가 사용. 기능 설계, 아키텍처 설계, 신규 기능 기획 시 사용."
---

# Feature Design — Forge 풀스택 기능 설계

신규 기능을 구현 가능한 설계서로 변환하는 절차. 핵심 산출물은 **경계면 계약(응답 shape)** 이다. 계약이 정확해야 backend/frontend가 독립 병렬 작업해도 연결 지점에서 어긋나지 않는다.

## 설계 절차

### 1. 기존 패턴 조사 (먼저 한다)
설계 전에 유사 기능을 반드시 읽는다. 새 패턴을 발명하지 않고 기존을 따른다.
- 백엔드: `src/resolver/{유사도메인}/` 의 Controller/Service/Repository
- 프론트: `static/ui/src/pages/{유사페이지}/`, 스토어, `static/ui/src/utils/queryKey/`
- DB: `src/rdb/query/`(MySQL Query 클래스), `src/nosql/query/CustomEntityManager.js`(KVS)
- Grep으로 재사용 가능한 Query/Service/훅을 찾는다

### 2. 영향 범위 식별
요구사항을 백엔드 / 프론트 / DB / i18n 축으로 분해한다. 각 축에서 신규인지 기존 수정인지 판단한다.

### 3. 경계면 계약 확정 (최우선)
resolver 함수마다: 함수명 / 입력 파라미터 / **success 시 응답 shape** / 대응 프론트 훅·쿼리키. 이 표가 설계서의 심장이다.

### 4. 계층별 상세 설계
- 백엔드: Controller(등록)·Service(로직)·Repository(DB) 분해, `src/index.js` 등록 함수명
- 프론트: 페이지/컴포넌트 트리, Zustand 스토어 변경, `queryKey/` 팩토리 추가, 권한 체크 필요 여부
- DB: MySQL 테이블 / KVS 엔티티, 마이그레이션 필요 여부
- i18n: `locales/kr/{기능}.json`·`locales/en/{기능}.json` 키/값 목록 (`locales/script/*.json`은 빈 스텁 — merge에 반영 안 됨)

### 5. 작업 분해
backend / frontend 각각의 구현 체크리스트로 쪼갠다.

## 데이터 저장소 선택 기준

| 데이터 | 저장소 | 접근 |
|--------|--------|------|
| 프로젝트/사용자/워크로그 | MySQL | `src/rdb/query/` Query 클래스 + `QueryBuilder.js` |
| role/level/permission/status/settings/holiday/job | KVS | `src/nosql/query/CustomEntityManager.js` |

## 성능 설계 규칙 (Forge 256MB 제약)

- 워크로그 등 다건 조회: 공통 페치 경로를 수정하지 말고 **기능별 전용 병렬 페처**로 설계(`p-limit` 동시성 제한). 이유: 공통 경로 수정은 다른 기능에 회귀를 일으킨다.
- Resource/MM 분석류: 프로젝트 단위 **1회 페치 + KVS 캐시**. Forge SQL 적재는 배제.

## 설계서 출력

`_workspace/<feature>/01_architect_design.md`에 저장. 구조는 feature-architect 에이전트 정의의 "설계서 구조" 섹션을 따른다. 경계면 계약 표 + 계층별 설계 + i18n 키 목록 + 작업 분해를 포함한다.

## 안티패턴 (하지 말 것)

- 응답 shape을 모호하게 두기("객체 반환" 같은) → 정확한 필드명·중첩 구조까지 명시
- `locales/ko-KR.json`·`en-US.json` 직접 수정 전제로 설계 → 항상 `locales/kr/`·`locales/en/` + merge 전제
- 인라인 쿼리키 사용 전제 → 항상 `queryKey/` 팩토리
