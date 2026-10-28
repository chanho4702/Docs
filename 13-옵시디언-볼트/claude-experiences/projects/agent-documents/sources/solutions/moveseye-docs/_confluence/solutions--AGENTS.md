# MovesEye 문서 저장소 작업 규칙

## 시작 순서

1. `README.md`에서 독자별 탐색 경로를 확인한다.
2. `문서-운영규칙.md`에서 문서 유형·정본·완료 조건을 확인한다.
3. `reference/문서-인벤토리.md`에서 기존 문서와 상태를 확인한다.
4. 관련 코드 저장소의 `AGENTS.md`와 실제 코드·OpenAPI·Flyway·route를 교차 확인한다.

## 작성 규칙

- 설명과 사용자 communication은 한국어로 작성한다. code identifier는 English 원형을 유지한다.
- 모든 정식 문서에 `status`, `baseline`, `source_of_truth`, `reviewed_at`을 둔다.
- 현재 동작, 계획, 보류를 명확히 구분한다.
- credential, token, 운영 URL, 개인정보를 문서에 기록하지 않는다.
- `_workspace`의 세션 산출물을 통째로 복사하지 말고 안정된 불변식·계약·운영 지식만 승격한다.
- API path는 Controller/OpenAPI, schema는 Flyway, FE 화면은 `routes.tsx`/`SideNav.tsx`를 정본으로 삼는다.
- 문서를 추가하거나 상태를 바꾸면 `reference/문서-인벤토리.md`를 함께 갱신한다.
- 재사용할 결정·교훈이 생기면 공유 Obsidian Vault의 moveseye MOC에 연결하되 최종 문서 본문은 중복 저장하지 않는다.

## 검증

- relative Markdown link가 모두 존재하는지 확인한다.
- 문서가 답해야 할 독자 질문을 새 context에서 테스트한다.
- 코드 기준선과 충돌하는 서술, 비밀값, 오래된 NestJS 정본 서술을 검색한다.
