---
name: untracked-file-recovery-tsjest-cache
description: 미추적 파일이 0바이트로 잘렸을 때 ts-jest transform 캐시의 소스맵(sourcesContent)에서 원본 복원 가능 (2026-08-25 실사용)
metadata: 
  node_type: memory
  type: reference
  originSessionId: eb10f1b8-0d1a-4ab8-bf2b-f9dcb034f2f4
  modified: 2026-08-25T09:23:34.582Z
---

2026-08-25 실제 사고·복구: Python 스크립트로 테스트 파일(.tsx)을 고치다 cp949 인코딩 예외로 **파일이 0바이트로 절단**됨. 미추적(untracked) 파일이라 git 복구 불가였는데, **ts-jest transform 캐시의 소스맵 `sourcesContent`에 원본 전문이 남아 있어** 226줄을 그대로 복원했다(줄 끝 LF·테스트 결과까지 대조 일치).

**How to apply:**
- jest를 한 번이라도 돌린 파일이면 캐시 위치(`node_modules/.cache/ts-jest` 또는 jest cacheDirectory)에서 해당 파일명으로 grep → JSON 안 `sourcesContent` 추출.
- 예방이 우선: 소스 편집은 Edit/Write 도구로 — **한글 든 파일을 Python/셸 파이프로 고치지 말 것**(cp949 계열 함정: [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--curl-hangul-cp949-false-500|curl-hangul-cp949-false-500]], [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--bash-heredoc-eats-backslash|bash-heredoc-eats-backslash]]).
