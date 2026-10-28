# 최근 RFC 통합 코드·설계 리뷰

## 요청

RFC-176, RFC-171, RFC-163의 설계 문서와 현재 실제 구현 코드를 상세하게 교차 검토한다. 기능을 수정하지 않고 문제점, 코드 오류, 비효율, 보안·권한·성능·cache·i18n·테스트 누락을 근거와 함께 리포트한다.

## RFC 매핑

- RFC-176: 팀 분석 필터·차트 확충 + 배정 관계도 3레이어 이관
  - commit: `ea5ef4a`
  - 설계 산출물: `_workspace/team-analytics/`
- RFC-171: 프로젝트 구독 — 스페이스/보드 구독 기반 이슈 자동 편입
  - commits: `eaaf08d`, `a59371c` 및 현재 worktree의 후속 수정
  - 설계 산출물: `_workspace/project-subscription/`
- RFC-163: 급여 정책 — 등급 밴드/인원별 선택 + 개인 연봉 응답 차단
  - commit: `1cfc9bf`
  - 설계 산출물: `_workspace/salary-policy/`

## 검토 기준

1. 설계 경계면 계약과 backend/frontend 실제 shape 일치
2. resolver 등록·권한·입력 검증·fail-close·민감정보 노출
3. SQL/KVS/Jira API 호출의 정확성, N+1·중복 fetch·cache 무효화·Forge 자원 제약
4. TanStack Query key, loading/error/empty state, stale data, mutation invalidation
5. i18n source/merge, UI 접근성·오표기·다중 shape 재사용
6. 테스트가 놓친 실제 실패 모드와 설계 문서의 오래된/모순된 내용
7. RFC 간 상호작용과 공통 모듈 회귀

## 산출물

- `_workspace/recent-rfc-review/rfc-176-review.md`
- `_workspace/recent-rfc-review/rfc-171-review.md`
- `_workspace/recent-rfc-review/rfc-163-review.md`
- `_workspace/recent-rfc-review/03_verify_report.md` (통합·우선순위 리포트)

