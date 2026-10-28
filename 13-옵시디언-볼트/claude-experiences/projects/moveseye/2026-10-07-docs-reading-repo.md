---
type: project
tags: [moveseye, docs, github, publishing, redaction]
created: 2026-10-07
updated: 2026-10-07
status: done
---

# 2026-10-07 — 문서 읽기용 사본 저장소: 785개 문서를 한글 파일명으로 비공개 GitHub에

- 프로젝트: [[moveseye]] · 문서 체계 [[moveseye-documentation-system]] · 기능 지도 [[무브스아이-기능-지도]] · 메모리 `docs-reading-repo`
- 사용자 요청 "출퇴근하면서 읽게" → 비공개 저장소 `https://github.com/chanho4702/Docs.git`(main), 로컬 클론 `C:\solutions\Docs`.

## 무엇을
- **원본 → 사본**: `moveseye-docs/`(정본, `_confluence` 제외) · `_workspace/`의 설계·기획·분석·가이드·계약·검수·검증·보고·구현 md · 옵시디언 `projects/moveseye` + 관련 `topics` · 루트/레포별 README·CLAUDE.md. 이력서·타 프로젝트 노트·워크트리 복사본·코덱스 원시 로그(txt)는 제외.
- **파일명·폴더명 전부 한글**(사용자 지침): 이름은 문서 H1에서, 제목 없는 코덱스 검수는 토큰 사전으로. 폴더별 `README.md`(목차)만 영문명.
- **재동기화 도구** `C:\solutions\_tools\docs-publish\`: `stage.py dry` → `stage.py run C:\solutions\Docs`(먼저 `.git` 빼고 비움) → `gen_readme.py` → `scan.py <폴더>`로 민감정보 재확인 → 커밋·푸시. 링크는 새 경로로 재작성, 괄호는 `%28/%29`.

## 🔴 함정
- **마스킹 필수**: Vault 노트에 Zabbix 운영 계정·DB·dev 로그인 비밀번호가 평문으로 있다(`stage.py`의 `REDACT` 목록). 새 문서가 늘면 `scan.py` + "계정/비번 쌍" grep을 다시 돌릴 것. 원본 노트는 고치지 않았다.
- heredoc으로 파이썬을 패치하면 `\b`가 백스페이스로 깨진다 → 정규식은 Edit 도구로([[bash-heredoc-and-inline-quoting]]).
- GitHub 인증은 Git Credential Manager(`chanho4702`, `--browser` 로그인).

## 관련
[[moveseye-documentation-system]] · [[2026-10-06-feature-guides-and-gap-report]](같은 주에 늘어난 13종 가이드가 사본 대상) · [[2026-10-05-documentation-apm-overview]]
