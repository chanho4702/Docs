---
type: topic
tags: [topic, claude-code, bash, heredoc, quoting, lesson]
created: 2026-08-24
updated: 2026-10-07
---

# Bash 툴 heredoc·인라인 스크립트가 본문을 망가뜨리는 두 가지 길

> 메모리 `bash-heredoc-eats-backslash`에서 추출. 사례: [[2026-10-07-docs-reading-repo]], [[2026-09-28-apm-ingest-resilience]](JSON 경로 백슬래시)

## 1. 따옴표로 막은 heredoc인데 백슬래시가 접힌다
`python - <<'PY' … PY`로 스크립트를 넘길 때 `"...\\n..."` 같은 JSON 문자열의 `\n`(두 글자)이 **실제 개행 한 글자**로 바뀌어 파일에 쓰는 순간 JSON이 `Invalid control character`로 깨진다(2026-08-24 `locales/kr.json` 실제 파손). `\b`는 백스페이스가 된다(2026-10-07 정규식 패치).

- 증상이 헷갈리는 이유: 같은 스크립트의 짧은 한글 조각 검색은 통과하는데 `\n`이 든 긴 문자열만 `assert … in s`에서 실패 → 한글 NFC 문제로 오진하기 쉽다.
- 대응: 값 안에 역슬래시가 드는 편집은 **스크립트를 파일로 써서(Write) 실행** · 굳이 heredoc이면 `NL = chr(92) + "n"`처럼 **백슬래시를 코드로 조립** · 편집 직후 `json.loads`로 재검증, 깨졌으면 삽입 블록만 되돌린다(전체 재작성은 병행 세션 diff를 키운다).

## 2. 큰따옴표 인라인 스크립트 안의 백틱은 명령으로 실행된다
`node -e "…"`처럼 큰따옴표로 감싼 코드에 마크다운 백틱(`` `경로.md` ``)이 들어가면 Bash가 **명령 치환**으로 실행한다. 2026-10-06에는 백틱 안의 `.md` 두 개가 셸 스크립트로 실행됐고, 문서 3행의 `> **상태:`가 리다이렉트로 해석돼 `C:\solutions`에 0바이트 파일이 생겼다. 백틱 안 내용은 결과 문자열에서도 통째로 사라진다.

- 대응: 한글·백틱·따옴표가 섞인 본문 편집은 인라인 스크립트가 아니라 **Edit/Write 도구 또는 파일로 쓴 스크립트**.

## 형제 함정
- PowerShell 5.1은 `.env`를 cp949로 읽어 한글 주석 끝 바이트가 LF를 삼킨다 → `Get-Content -Encoding UTF8`([[2026-09-15-apm-install-guide-and-fe-polish]]).
- curl 한글 본문이 cp949로 나가 가짜 500 — 메모리 `curl-hangul-cp949-false-500`.
- 한글 Windows에서 Python subprocess 출력은 `PYTHONUTF8=1` 없이 cp949 디코드 오류([[code-graph-tools-trial]]).
