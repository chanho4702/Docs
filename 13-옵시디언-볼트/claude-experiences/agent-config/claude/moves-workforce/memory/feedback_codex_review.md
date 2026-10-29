---
name: feedback-codex-review
description: 작업 마무리 시 codex CLI로 코드 검토를 받을 것 (사용자 지시 2026-08-05)
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 46d4edcd-0f17-4ae1-a067-4c4849a4e2d1
  modified: 2026-08-13T07:02:45.054Z
---

구현을 마치면 **codex CLI 검토를 받는다**. `codex` 는 `C:\Claude\codex` 에 설치돼 있다(codex-cli 0.146.0).

```bash
codex exec --sandbox read-only "<검토 요청>" > review.txt
```

**Why:** 사용자가 "마무리하면 코덱스 검토 받아"라고 지시했다. 자체 검증(테스트·빌드)만으로는
설계 판단의 타당성까지 걸러지지 않는다.

**2026-08-13 확장**: 사용자가 **코드 구현 위임도 허용**했다 ("적당히 코덱스한테 코드 구현 요청해도됨").
리더 재량으로, 스코프가 명확하고 다른 에이전트와 파일이 겹치지 않는 독립 작업에 사용한다.
구현 위임 시 `--sandbox workspace-write` (읽기 전용 아님) + 대상 파일·계약·테스트 요구를 프롬프트에 명시.
Codex 구현 결과물도 내부 검증(테스트 실행·경계면 확인)을 거친 뒤 커밋한다.

**How to apply:**
- 리뷰는 `--sandbox read-only` 로 코드 수정을 막고 지적만 받는다.
- 요청에 **변경 의도와 대상 파일 목록**을 넣는다 — 안 넣으면 리포 전체를 헤맨다.
- **반드시 `< /dev/null` 을 붙일 것** — Bash 도구(비-TTY)에서 `codex exec` 는 stdin 을 추가 입력으로 읽으려고 무한 대기한다(2026-08-26 실제로 밟음. `codex_review.err` 에 "Reading additional input from stdin..." 만 찍히고 0바이트).
  `codex exec --sandbox read-only "..." < /dev/null > review.txt 2> review.err`
- **code-mode host 실패 시 stdin 우회** — 2026-08-26 codex 0.149.1 에서 `ERROR codex_core::tools::router: error=code-mode host exited during handshake` 로 모든 명령 실행이 죽어 codex 가 파일을 못 읽었다(리뷰 포기 문구만 405바이트). 우회: `git diff` + 신규 파일 전문을 하나의 텍스트로 묶어 **stdin 으로 넘기고** 프롬프트에 "명령 실행 금지, stdin 내용만으로 검토, 저장소 다른 파일 의존 판단은 확신 낮음 표시"를 명시. 90KB 로 정상 리뷰 받음.
  `{ git diff -- . ':!locales/ko-KR.json' ':!locales/en-US.json'; for f in <신규파일>; do echo "===== NEW FILE: $f ====="; cat "$f"; done; } > changes.txt`
  `codex exec --sandbox read-only "$PROMPT" < changes.txt > review.txt 2> review.err`
- **실행 파일은 `codex`(PATH) 그대로 부른다** — `C:Claudecodex` 는 폴더가 아니라 실행 파일 자체라 `/c/Claude/codex/codex` 는 없다. 그리고 **git 저장소 밖(스크래치 폴더 등)에서 돌리면 거부**된다("Not inside a trusted directory") → 저장소 안에서 실행하거나 `--skip-git-repo-check` 를 붙인다(2026-09-29 두 번 헛돌았다).
- 출력을 `| tail` 로 파이프하면 완료 전까지 0바이트라 진행 상황이 안 보인다.
  파일로 리다이렉트할 것. 큰 리뷰는 10분 이상 걸린다.
- `/code-review ultra` 는 사용자만 실행할 수 있으니 이것과 혼동하지 말 것.

관련: [[feedback-avoid-overbuilding]] · [[feedback-skip-edge-cases]]
