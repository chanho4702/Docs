---
name: code-graph-tools-trial
description: 10-06 코드 그래프 도구 시험(Graft·codebase-memory-mcp) 결과와 OpenMontage 설치 위치 — Windows 함정 3개
metadata:
  node_type: memory
  type: project
  originSessionId: c1a342ab-3b4b-460c-962f-15eec769cdc4
  modified: 2026-10-05T16:57:17.472Z
---

2026-10-06 시험. 두 도구 모두 **미도입**(사용자 판단 대기). 레포에는 아무것도 쓰지 않았다(시험 워크트리는 삭제함).

- **Graft(@nanonets/graft)**: Windows에서 설치 자체가 안 됨. `tree-sitter-kotlin`에 win32 prebuild가 없어 node-gyp가 Visual Studio Build Tools를 요구하는데, 이 PC에는 VS가 없다.
- **codebase-memory-mcp v0.11.0**: 실행됨. 바이너리·캐시는 `~/.cbm-trial`(FE 인덱스 남아 있음). 결과는 아래와 같다.
  - 🔴 그냥 실행하면 거부된다. 코덱스 샌드박스가 `AppData`에 `CodexSandboxUsers` Modify ACE를 넣어 두어 DACL 검사에 걸린다. `CBM_RUNTIME_DIR`·`CBM_CACHE_DIR`를 `~/.cbm-trial` 아래로 돌려야 하고, AppData ACL은 건드리면 안 된다(코덱스가 깨짐).
  - 장점: BE 인덱싱 58초, Spring 라우트가 클래스 prefix까지 정확히 결합됨(HANDLES).
  - 단점: 모듈 간 IMPLEMENTS가 누락됨(ZabbixMetricAdapter→MetricPort 0건). FE→BE 연결이 안 됨(`${baseUrl}` 템플릿 미해석, HTTP_CALLS는 테스트 파일 12건뿐). 기본 제외 규칙이 `host/coverage`·`apm/service/deploy` **실제 패키지를 조용히 빼먹음**.
- **OpenMontage**: `C:\Users\DMOVE\OpenMontage`에 설치(AGPL — 제품 모노레포에 넣지 말 것). ffmpeg는 winget Gyan.FFmpeg로 설치. 🔴 한글 Windows에서는 `PYTHONUTF8=1` 없이 subprocess 출력 cp949 디코드 오류가 난다.

**Why:** 같은 도구를 다시 평가하거나 MCP로 붙일 때 같은 함정을 반복하지 않기 위해.
**How to apply:** codebase-memory-mcp를 도입할 때는 `install --skip-config` 후 MCP를 수동 등록하고 env 2개를 지정한다. 제외 디렉터리 목록을 반드시 확인한다. 관련: [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--codex-model-choice|codex-model-choice]]
