---
type: topic
tags: [topic, claude-code, git, commit, workflow, feedback]
created: 2026-09-17
updated: 2026-10-08
---

# 커밋 위생 — 승인·메시지·트레일러·푸시 규칙 (moveseye에서 굳어진 것)

> 메모리 `commit-requires-approval`·`no-coauthored-by-trailer`·`commit-message-no-review-source`·`codex-review-handoff`에서 추출. 사례: [[2026-09-22-zm151-156-backlog-sprint]], [[2026-10-19-zm155-apm-custom-metric-allowlist]]

| 규칙 | 내용 | 왜 |
|---|---|---|
| **커밋은 승인 뒤에만** | 작업이 끝나면 커밋 제안(메시지 초안·파일 목록)을 보고하고 "승인/ㅇㅇ 커밋"을 받은 뒤 커밋 | 사용자가 커밋 단위·시점을 통제한다. 코덱스 검수가 끝나야 승인이 나오는 흐름이 보통 |
| **푸시 금지** | 푸시는 사용자가 직접 | 원격 반영은 되돌리기 어렵고 CI 배포로 이어진다 |
| **`git add -A` 금지** | 바꾼 파일을 이름으로 지정 | 다른 세션의 미커밋 변경·미추적 파일이 섞여 들어간다(메인 트리를 여러 세션이 공유) |
| **메시지 형식** | `#ZM-XX [TYPE] 제목 -YYYY-MM-DD` | 지라 연동·날짜 추적 |
| **메시지에 절차 단어 금지** | "코덱스 검수 반영"·"지적 사항"·"요청자" 같은 출처·절차 표현 없이 **바뀐 내용만 요약** | 커밋 로그는 "무엇이 바뀌었나"의 기록이지 "왜 그 작업이 생겼나"의 기록이 아니다. 출처는 `_workspace/reviews/` 요청서에 남는다(2026-10-08 사용자 피드백) |
| **트레일러 금지** | `Co-Authored-By` 등 자동 트레일러 붙이지 않음 | 사용자 지침 |
| **격리 워크트리 → rebase → ff-only** | BE는 `C:\worktrees\<branch>`에서 작업, master 위 `git rebase` 뒤 `merge --ff-only` | IDE가 띄운 BE가 master `build/classes`를 공유하고 코덱스 대화형 세션이 메인 트리에서 병행 작업한다([[2026-10-07-apm-remaining-work-priorities]]) |
| **병합 전 `git apply --check`** | 다른 세션 커밋과 겹치는 파일을 dry-run | 가짜 충돌·소실 방지 |

## 함께 보는 것
- 검수 인계: 작업이 끝나면 `_workspace/reviews/review_*.md`에 요청서를 쓰고 코덱스 결과를 `## 검수 결과(코덱스 vN)` 절로 덧붙인다 → [[codex-exec-operations]].
- BE 재기동·세션 교체는 커밋과 별개로 **따로 묻는다**(admin 로그인이 사용자 브라우저 세션을 끊는다).
- Flyway 번호는 커밋 직전 전 브랜치·워크트리에서 최대 번호를 다시 확인한다([[2026-10-12-apm-alert-channel-neutral-delivery]]의 V76~V81 경합).
