---
type: project
tags: [moveseye, documentation, obsidian, ssot, multi-repo]
created: 2026-08-05
updated: 2026-08-05
status: active
---

# MovesEye 문서 체계 구축

## 배경

MovesEye는 Spring BE·React FE가 별도 Git 저장소이고 `C:\solutions` 루트 자체는 Git 저장소가 아니다. 루트 온보딩, `_workspace` 설계·계약·E2E, 공유 Obsidian 경험 노트가 있었지만 현재 제품 문서의 정본과 갱신 trigger가 없었다.

참고한 Moves Workforce는 제품 산출물 10종과 Obsidian MOC·결정 노트를 분리해 운영했다. 이 구조를 그대로 복사하지 않고 multi-repo 조건에 맞게 바꿨다.

## 채택한 구조

1. `C:\solutions\moveseye-docs`: 제품·사용자·기술·운영 문서 정본
2. `C:\solutions\_workspace`: 기능 개발 중 design·contract·QA 증거
3. `C:\Users\DMOVE\claude-experiences\projects\moveseye`: MOC·결정 이유·타임라인·교훈

기계적 사실은 별도 정본을 둔다.

- REST: Spring Controller/DTO + OpenAPI
- 화면: FE `routes.tsx`, `SideNav.tsx`
- schema: Flyway migration
- 수집 경계: `engine-api` public 계약과 Gradle dependency

## 핵심 교훈

- Obsidian에 최종 문서 전문을 복사하면 링크보다 내용 drift가 먼저 생긴다. Obsidian은 “어디에 있고 왜 그런가”를 맡기는 편이 낫다.
- 여러 code repo를 아우르는 문서를 한쪽 repo에 넣으면 그 repo의 ownership과 release cadence에 종속된다. 독립 docs repo가 경계를 더 잘 표현한다.
- route가 존재한다는 사실과 제품 기능이 current라는 주장은 다르다. `현재/부분/계획/보류` 상태를 명시해야 한다.
- 문서마다 `baseline`, `source_of_truth`, `reviewed_at`이 있어야 마지막 수정일과 사실 검토일을 혼동하지 않는다.
- 작업 산출물은 통째로 승격하지 않는다. 최종 동작·불변식·실패·운영·검증 근거만 stable 문서로 옮긴다.
- 문서에도 Definition of Done과 변경 trigger가 필요하다. route, Controller/DTO, migration, 인증·권한, engine port, release 변경이 각각 어떤 문서를 갱신하는지 표로 만든다.

## Reader Testing에서 추가로 얻은 교훈

- `current` 문서와 `배포된 기능`은 다른 상태다. source 구현 표에는 `소스 구현·배포 미확인`을 쓰고 배포 주장은 commit·migration·환경·QA evidence를 요구한다.
- 로컬 기동 문서를 “운영 Runbook”이라고 부르면 backup·rollback까지 있다고 오해한다. 범위를 제목·frontmatter·첫 문단에서 `로컬·검증`으로 제한한다.
- 기능의 생성·동기화·acknowledge 절차에는 sandbox·승인·rollback 중단 조건이 필요하다.
- ADR의 결정 상태(`accepted`)와 문서 생명주기(`current`)는 서로 다른 축이므로 `decision_status`를 별도로 둔다.

## 산출물

- 문서 허브·governance·제품 개요·빠른 시작·사용자 가이드
- 아키텍처·데이터 모델·운영 Runbook·용어집·인벤토리
- 기능/ADR/release/runbook template
- accepted ADR: 문서 정본과 Obsidian 경험 Vault 분리
- 공유 Vault: `[[moveseye-documentation-system]]`, `[[moveseye-design-qa]]`, 갱신된 `[[moveseye-overview]]`

## 다음 개선

- 실제 환경의 배포·백업·복구 Runbook은 runtime 검증 뒤 current로 승격한다.
- OpenAPI catalogue는 사람이 endpoint를 복사하지 말고 생성 자동화를 고려한다.
- 자산·비용·맵·Zabbix 관리 기능부터 `_workspace` 산출물을 stable 기능 문서로 승격한다.
