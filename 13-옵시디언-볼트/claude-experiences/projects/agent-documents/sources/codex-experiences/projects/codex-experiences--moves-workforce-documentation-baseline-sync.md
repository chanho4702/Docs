# Moves Workforce 문서 기준선 동기화

## 배경

2026-08-04 기준으로 팀·자원관리, 프로젝트 구독, 급여 정책 변경을 10개 제품 문서에 동기화했다. 문서 파일은 저장소 루트의 `.gitignore`에서 `/Moves_Workforce_*.md`로 제외되므로 일반 `git status`에 나타나지 않는다.

## 기준선 분리

- **운영 배포본**과 **develop/worktree 구현**을 같은 package version만으로 구분하면 안 된다. 배포 여부, migration, trigger 반영 여부를 릴리스 노트에 별도로 기록한다.
- 숫자는 선언 한 곳만 보고 적지 않는다. registrar는 `src/index.js`, 권한은 `ResourceCatalog`와 UI 필터, SQL은 migration queue, KVS는 manifest, seed는 `SEED_VERSION`을 함께 확인한다.
- manifest에 attribute가 선언돼 있어도 현재 Service/UI가 읽고 쓰지 않으면 active setting이 아니다. `monthRate/monthMode/monthVals`처럼 schema에만 남은 값은 legacy로 구분한다.

## 경계 계약에서 얻은 교훈

- 상한 상수가 여러 계층에 있으면 **먼저 적용되는 더 작은 상한**이 실제 동작이다. 프로젝트 구독은 `MAX_BACKFILL_ISSUES=5000`보다 공용 `MAX_SCAN_ISSUES=2000`이 먼저 적용된다.
- raw catalog 수와 실제 운영 설정 수를 구분한다. `PROJECT_GANTT`를 포함하면 17키지만 UI에서 숨겨지고 프론트·서버 Gantt는 `PROJECT`를 사용하므로 유효 설정은 16개다.
- 메뉴 노출 권한과 resolver 실행 권한도 별도로 대조한다. 공휴일처럼 Sidebar는 `PERMISSION_MANAGEMENT`, 편집 API는 `PUBLIC_HOLIDAY_MANAGEMENT`를 쓰면 권한이 있어도 진입 메뉴가 사라지는 UX 불일치가 생긴다.
- `TEAM_ONLY`는 단순한 "내 팀"이 아니라 `(소속 팀+후손) ∪ (리딩 팀+후손)`이며, 유효 팀이 없거나 인덱스 조회가 실패하면 빈 범위로 fail-close한다.
- 급여 정책 전환은 기존 값을 보존하지만 `LEVEL_BAND` 중 신규 등록된 사용자의 개인 연봉은 NULL일 수 있다. "복귀하면 모두 복원"으로 단정하면 안 된다.
- SCAN→APPLY가 한 invocation에서 순서를 지켜도 부분 APPLY 후 축소된 후보 집합에 이전 cursor를 재사용하면 누락 위험이 생긴다. 무누락 보장은 재개 시나리오까지 테스트해야 한다.

## 문서 검증 패턴

1. 코드에서 구조·상한·권한·응답 shape의 기준선을 뽑는다.
2. 사용자·관리자·개발자 문서를 같은 용어와 숫자로 갱신한다.
3. 신규 사용자, 운영자, 개발자 관점의 독립 독자 테스트로 모순과 누락을 찾는다.
4. Markdown fence parity, 버전·날짜, stale 문자열을 자동 검색하고 관련 단위 테스트로 핵심 계약을 확인한다.

관련: [[projects/agent-documents/sources/codex-experiences/topics/codex-experiences--tanstack-query-cross-domain-invalidation|tanstack-query-cross-domain-invalidation]]
