---
type: topic
tags: [topic, claude-code, tooling, code-graph, mcp, trial]
created: 2026-10-05
updated: 2026-10-06
---

# 코드 그래프 도구 시험 — Graft·codebase-memory-mcp·OpenMontage (2026-10-05~06, 미도입)

> 메모리 `code-graph-tools-trial`에서 추출. 레포에는 아무것도 쓰지 않았다(시험 워크트리 삭제). 사용자 판단 대기.

| 도구 | 결과 | 비고 |
|---|---|---|
| **Graft**(`@nanonets/graft`) | Windows에서 **설치 불가** | `tree-sitter-kotlin`에 win32 prebuild가 없어 node-gyp가 VS Build Tools를 요구, 이 PC에 VS 없음 |
| **codebase-memory-mcp** v0.11.0 | 실행됨. BE 인덱싱 58초, Spring 라우트가 클래스 prefix까지 결합(HANDLES) | 바이너리·캐시 `~/.cbm-trial`(FE 인덱스 잔존) |
| **OpenMontage** | `C:\Users\DMOVE\OpenMontage`에 설치. ffmpeg는 winget `Gyan.FFmpeg` | **AGPL — 제품 모노레포에 넣지 말 것**. 한글 Windows는 `PYTHONUTF8=1` 필수 |

## codebase-memory-mcp 함정
- 🔴 그냥 실행하면 거부된다 — 코덱스 샌드박스가 `AppData`에 `CodexSandboxUsers` Modify ACE를 넣어 DACL 검사에 걸린다. `CBM_RUNTIME_DIR`·`CBM_CACHE_DIR`를 `~/.cbm-trial` 아래로 돌리고, **AppData ACL은 건드리지 않는다**(코덱스가 깨진다).
- 모듈 간 IMPLEMENTS 누락(`ZabbixMetricAdapter → MetricPort` 0건). FE → BE 연결 안 됨(`${baseUrl}` 템플릿 미해석, HTTP_CALLS는 테스트 파일 12건뿐).
- 기본 제외 규칙이 `host/coverage`·`apm/service/deploy` **실제 패키지를 조용히 빼먹는다** — 도입 시 제외 목록을 반드시 확인.

## 도입한다면
`install --skip-config` 후 MCP를 수동 등록하고 env 2개를 지정. 같은 도구를 다시 평가하거나 MCP로 붙일 때 위 함정을 반복하지 않기 위한 기록.

## 관련
[[codex-exec-operations]](샌드박스 ACL의 출처) · [[bash-heredoc-and-inline-quoting]](cp949)
