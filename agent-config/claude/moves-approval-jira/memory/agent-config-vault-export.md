---
name: agent-config-vault-export
description: "이 리포(와 워크포스)의 Claude 하네스 에이전트·스킬·CLAUDE/AGENTS.md·autopilot·프로젝트 메모리 사본이 옵시디언 Vault `agent-config/claude/moves-approval-jira/` 에 있고, `agent-config/tools/export_agent_config.py` 로 다시 내보낸다"
metadata:
  node_type: memory
  type: reference
  originSessionId: 328d2874-254c-466a-8cc6-dd177a2cc219
  modified: 2026-10-29T02:28:35.520Z
---

옵시디언 Vault `C:\Users\DMOVE\claude-experiences\agent-config\` 에 Claude Code·Codex 설정 사본이 모여 있다(2026-10-29).
이 리포 몫은 `claude/moves-approval-jira/`(agents 4·skills 5·CLAUDE.md·AGENTS.md·autopilot·memory 16), 워크포스는 `claude/moves-workforce/`.
복원 경로 표와 "Codex 가 어떻게 걸려 있나"는 `agent-config/README.md`.

**How to apply:** 에이전트·스킬·메모리를 바꾼 뒤 사본을 새로 뜨려면 Vault `agent-config/` 에서 `python -I tools/export_agent_config.py` 한 번(claude/·codex/ 만 다시 만들고 README·tools 는 남김, dev 비밀번호 마스킹 자동). 사용자가 "설정·스킬 옵시디언에 올려" 하면 새 노트를 만들지 말고 이 스크립트를 돌리고 README 표를 고친다. 관련 [[codex-model-cost]] [[codex-exec-stdin]]
