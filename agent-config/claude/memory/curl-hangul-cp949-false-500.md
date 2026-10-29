---
name: curl-hangul-cp949-false-500
description: "Git Bash에서 curl -d에 인라인 한글을 넣으면 cp949로 나가 BE가 500을 내는데, 이건 BE 결함이 아니라 클라이언트 인코딩 문제다"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 3aaf312a-fba1-490e-896f-5007bff0ffcf
  modified: 2026-08-03T02:16:51.603Z
---

Bash 도구(Git Bash)에서 `curl -d '{"notes":"한글"}'` 처럼 **인라인 한글**을 보내면 cp949로 전송돼
Spring이 UTF-8 파싱에 실패하고 **HTTP 500**이 난다. **BE 결함으로 오진하기 쉽다.**

- 회피: `--data-binary @file.json`(Write 도구로 만든 UTF-8 파일) 또는 `\uXXXX` 이스케이프 → 둘 다 200.
- 더 나은 방법: **Node `fetch` 스크립트로 API를 호출**한다(Node 22). 인코딩 문제가 원천 차단되고 쿠키·반복 호출도 편하다.
- 같은 이유로 **PowerShell 5.1도** 한글이 든 명령 문자열을 psql/네이티브 exe에 넘길 때 깨진다
  (`오류: "UTF8" 인코딩에서 사용할 수 없는 문자`). 쿼리 라벨은 영문으로 쓰거나 파일을 경유할 것.
- PowerShell 5.1은 **BOM 없는 UTF-8 .ps1을 ANSI로 읽어** 스크립트 안 한글이 깨진다 → 파서 에러.
  스크래치패드 스크립트는 영문으로 작성하는 게 안전하다.

**Why:** 2026-08-03 이 함정 때문에 `PATCH /assets/{id}`가 한글 값에서만 500이 난다고 판단해
BE 결함으로 계약서에 올릴 뻔했다. 파일 전송으로 재시험하니 200이었다 — 진짜 결함은 `POST /assets`뿐이었다.

**How to apply:** 로컬 API를 curl로 두드리다 500이 나오면 **본문에 비-ASCII가 있는지부터 본다.**
있으면 파일/이스케이프/Node fetch로 한 번 더 확인한 뒤에야 BE 결함으로 판단한다.
순수 ASCII 최소 본문으로도 재현될 때만 진짜 BE 문제다. 관련: [[dev-runtime-startup]]
