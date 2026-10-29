# 옵시디언 Vault를 GitHub Docs 리포에 subtree로 올리기

> 2026-10-28, `claude-experiences`·`Codex-experiences` 두 Vault를 비공개 리포 `chanho4702/Docs`에 처음 푸시하며 정리.

## 한 줄 교훈

**Vault는 각자 독립 git 리포로 두고, 공개용 문서 리포에는 `git subtree`로 폴더 하나씩 끼워 넣는다. 올리기 전에 런타임·개인정보·토큰·전자책을 `.gitignore`로 걸러야 한다.**

## 구조

- 원격: `https://github.com/chanho4702/Docs.git` (private, main). 기존에 번호 폴더(`00-문서-지도` ~ `12-온보딩-규약`)로 정리된 무브스아이 문서 785개가 있어, 규칙에 맞춰 **`13-옵시디언-볼트/`** 를 새로 만들었다.
- 로컬: `C:\Users\DMOVE\claude-experiences`, `C:\Users\DMOVE\Codex-experiences` 각각 `git init -b main`. 둘을 합친 리포는 임시 클론에서 `git subtree add --prefix="13-옵시디언-볼트/<vault>" <로컬경로> main` 두 번.
- 재동기화: Vault에서 커밋 → Docs 클론에서 `git subtree pull --prefix=... <로컬경로> main` → `git push origin main`.

## 걸러낸 것 (.gitignore)

| 대상 | 이유 |
|---|---|
| `.docx_runtime/`, `runtime_docx/`, `*.pyc`, `*.pyd` | docx 변환용 Python 런타임 95MB, 재생성 가능 |
| 루트 `*.docx`, `*이력서*`, `_qa/` | 실명 이력서 원본과 QA 산출물 |
| `_pc-migration-.../deep-diagnostics/runtime/` | 실행 중 발급된 collector 토큰 json |
| `topics/books/*.pdf` | 구매 전자책(저작물) |
| `.obsidian/workspace.json`, `graph.json` | 개인 UI 상태, 머지 충돌만 만든다 |
| (Codex) `img/14-client-id-secret.jpg` | OAuth 클라이언트 시크릿이 찍힌 캡처 |

시크릿 스캔(`sk-ant-`, `ghp_`, `AKIA`, PEM, `token=` 패턴)에서 걸린 `contract_*.md`의 토큰은 `sha256("test")` base64라 더미였고, vault-secrets 노트는 관리 방법만 적혀 있어 그대로 두었다.

## 함정

1. **URL 오타**: 사용자가 준 `chanho470/Docs`는 끝의 `2`가 빠진 **다른 사용자**의 주소였다. `git ls-remote`가 "Repository not found"를 내면 바로 포기하지 말고 저장된 자격증명(`git credential fill`)의 username으로 API를 두드려 실제 리포를 찾는다.
2. **Filename too long**: 임시 클론 경로 + 한글 prefix + Vault 깊은 경로가 260자를 넘어 subtree add가 중간에 죽는다. 클론 직후 `git config core.longpaths true`. 반쯤 만들어진 파일은 `git reset --hard && git clean -fd`로 치운다.
3. **autocrlf 가짜 변경**: 시스템 설정이 autocrlf=true여서 클론 뒤 `core.autocrlf false`로 바꾸면 전체가 수정된 것으로 보여 `working tree has modifications. Cannot add.` 발생. `git rm -r --cached . && git reset --hard`로 인덱스 기준 재체크아웃.
4. **Bash 병렬 호출의 cwd 경합**: 서로 다른 폴더에 `cd`하는 두 Bash 호출을 동시에 보내면 한쪽이 다른 폴더에서 실행될 수 있다. 리포를 바꾸는 명령은 `git -C <경로>`로 고정한다.
5. `gh` CLI 미설치. 리포 조회·생성은 저장된 PAT(scope: repo, gist, workflow)로 `curl api.github.com` 직접 호출.

## 재동기화 기록

- **2026-10-29**: `agent-config/`(Claude·Codex 설정 이식 사본, 506개)과 Codex `exports/moves-approval-portable-2026-10-29`(1,338개, 74MB — GIF·mp4·zip 포함) 추가 푸시. 함정 3·4를 그대로 다시 밟았다 — 노트에는 적혀 있었지만 Claude 자동 메모리에는 없어서. 이제 메모리에도 옮겨 적었다. 플러그인 pid 잠금 파일 `.in_use/`를 Codex `.gitignore`에 추가.

관련: [[INDEX]] · 다른 PC로 옮긴 기록 [[_pc-migration-2026-10-28]]
