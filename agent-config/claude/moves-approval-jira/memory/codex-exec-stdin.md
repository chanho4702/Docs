---
name: codex-exec-stdin
description: "Bash 백그라운드에서 codex exec 를 돌릴 때 stdin 을 닫지 않으면 \"Reading additional input from stdin...\" 에서 무한 대기한다"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 4b2db3b4-8d9f-459e-a8ae-6678a2d27fe8
  modified: 2026-10-14T11:04:02.495Z
---

Bash 도구(백그라운드 포함)로 `codex exec "<prompt>"` 를 실행할 때는 반드시 `< /dev/null` 로 표준 입력을 닫는다.

**Why:** 2026-10-14 코덱스 검토가 로그에 "Reading additional input from stdin..." 한 줄만 남기고 1시간 넘게 멈춰 있었다. 프롬프트 인자가 있어도 stdin 이 열려 있으면 추가 입력을 기다린다.

**How to apply:** 두 리포를 같이 보려고 `-C /c/CloudJira`(git 리포 아님)로 돌릴 때는 `--skip-git-repo-check` 도 필요하다(없으면 "Not inside a trusted directory" 로 즉시 종료). `codex exec --skip-git-repo-check -m gpt-6.1-sol -c model_reasoning_effort=medium -s read-only -C <dir> -o <out.md> "<prompt>" < /dev/null > <log> 2>&1`. 실행 몇 분 뒤 로그 크기가 그대로면 stdin 대기를 의심하고, 해당 exec 프로세스만 PID 로 종료한다(데스크톱 Codex 앱 프로세스는 건드리지 않음). 관련: [[codex-model-cost]]
