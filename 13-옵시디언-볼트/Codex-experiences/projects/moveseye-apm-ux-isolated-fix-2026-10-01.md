---
tags: [moveseye, apm, ux, worktree]
updated: 2026-10-01
---

# APM UX 분리 구현

사용자의 “다른 세션과 안 겹치게 수정” 승인에 따라 별도 worktree `C:/solutions/_workspace/apm-ux-fix-20261001/moveseyee_fe`와 브랜치 `codex/apm-ux-20261001`에만 구현. 커밋 `675b5ee`. 원본 master `c4eaf55`·공용 FE :5173·BE :3000 변경 없음. 미리보기 :5179, 개발용 프록시로 BE 연결.

트레이스·서비스·RUM 새로고침, APM 메뉴 공통 기간/환경 유지, 메뉴명 가독성, 오류 0% 순위 제외, 미구현 단계 UI 제거, 서비스 헤더 압축, 기간 라벨/시간 선택기 정합성, RUM 빈 상태, X-View 상세 수치 접기 개선.

검증: APM 8개 스위트 190건 + 주요 로직 18건(일부 중복), RUM 새 경계 사례 4건 재검증, 타입·프로덕션 빌드·실제 Chromium API 요청 확인.

상세 정본: `C:/Users/DMOVE/claude-experiences/projects/moveseye/2026-10-01-apm-ux-isolated-fix.md`.
관련: [[moveseye-apm-ux-review-2026-10-01]]
