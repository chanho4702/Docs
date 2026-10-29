---
name: docs-reading-repo
description: 무브스아이 문서 읽기용 사본 저장소(GitHub chanho4702/Docs) — 위치·재동기화 방법·한글 파일명 규칙·마스킹 목록
metadata:
  node_type: memory
  type: reference
  originSessionId: 7bc4208d-8d03-4312-85e3-4f6fa88366d3
  modified: 2026-10-06T15:40:44.945Z
---

2026-10-07 사용자 요청("출퇴근하면서 읽게")으로 무브스아이 문서 785개를 **비공개 GitHub 저장소 `https://github.com/chanho4702/Docs.git`**(main)에 푸시했다. 로컬 클론은 `C:\solutions\Docs`.

- **원본 → 사본**: `moveseye-docs/`(정본, `_confluence` 제외) · `_workspace/`의 설계·기획·분석·가이드·계약·검수·검증·보고·구현 md · 옵시디언 `projects/moveseye`+관련 `topics` · 루트/레포별 README·CLAUDE.md. 이력서·타 프로젝트 노트·워크트리 복사본·코덱스 원시 로그(txt)는 제외.
- **사용자 지침**: 파일명·폴더명 모두 한글. 이름은 문서 H1에서 뽑고(제목 없는 코덱스 검수는 토큰 사전), 이미 한글인 정본 파일명은 유지. 폴더별 `README.md`(목차)만 예외로 영문명.
- **재동기화**: `C:\solutions\_tools\docs-publish\` — `stage.py dry` → `stage.py run C:\solutions\Docs`(먼저 `.git` 빼고 비움) → `gen_readme.py` → `scan.py <폴더>`로 민감정보 재확인 → 커밋·푸시. 링크는 새 경로로 재작성되고 괄호는 %28/%29로 인코딩한다.
- 🔴 **마스킹 필수**: Vault 노트에 Zabbix 운영 계정 비밀번호·DB 비밀번호·dev 로그인 비밀번호가 평문으로 있다(`stage.py`의 `REDACT` 목록). 새 문서가 늘면 `scan.py` + "계정/비번 쌍" grep을 다시 돌릴 것. 원본 노트 자체는 고치지 않았다.
- 🔴 heredoc으로 파이썬을 패치하면 `\b`가 백스페이스로 깨진다 → 정규식은 Edit 도구로 고친다([[bash-heredoc-eats-backslash]]).
- GitHub 인증은 Git Credential Manager에 `chanho4702`로 저장됨(`git credential-manager github login --browser`로 로그인했다).
