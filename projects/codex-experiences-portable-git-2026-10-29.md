# Codex Experiences Git 이식성

## 결정

- Obsidian Vault 자체를 독립 Git 저장소로 유지한다.
- 다른 Windows PC에서는 `git -c core.longpaths=true clone`으로 복제하고 저장소에도 `core.longpaths=true`를 설정한다. 보관된 스킬 자료의 일부 경로가 Windows 기본 경로 길이를 넘기 때문이다.
- 실제 토큰, 비밀 키, 인증서, `.env`, PC별 Obsidian 화면 상태는 Git에서 제외한다.
- Moves Workforce 하네스는 `tools/Install-MovesWorkforceHarness.ps1`로 대상 프로젝트에 설치한다.
- `.claude/settings.local.json`에는 사용자명과 절대 경로가 포함되므로 기본 설치에서 제외하고 명시적 옵션으로만 복원한다.

## 검증

- 하네스 설치 스크립트를 빈 폴더에 실행해 28개 파일 설치를 확인했다.
- 기본 설치에서 `.claude/settings.local.json`이 생성되지 않는 것을 확인했다.
- private key, OpenAI·GitHub·Slack·AWS·Google key 형식과 URL 내 자격 증명 패턴을 검사해 일치 항목이 없었다.
- 최대 Git blob은 약 4.9MB로 일반 원격 저장소의 단일 파일 제한보다 작다.

## 사용 문서

- [[../README|Vault 복제와 동기화 안내]]
- [[moves-workforce-harness/2026-10-29/00-INDEX|Moves Workforce 하네스·스킬 목차]]
