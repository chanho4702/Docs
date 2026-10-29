# Codex Experiences

Claude와 Codex가 프로젝트를 수행하며 남긴 경험, 결정, 검토 자료와 재사용 가능한 하네스·스킬을 보관하는 Obsidian Vault입니다.

## 다른 PC에서 Vault 열기

```powershell
git -c core.longpaths=true clone <이 저장소의 원격 URL> Codex-experiences
git -C .\Codex-experiences config core.longpaths true
```

Obsidian에서 **Open folder as vault**를 선택하고 복제한 `Codex-experiences` 폴더를 엽니다. 시작 문서는 [INDEX.md](INDEX.md)입니다.

동기화할 때는 Vault에서 다음 명령을 사용합니다.

```powershell
git pull --rebase
git add -A
git commit -m "경험 노트 갱신"
git push
```

`.obsidian/workspace.json`과 `graph.json`은 PC별 화면 상태라 동기화하지 않습니다. 실제 토큰, 비밀 키, 인증서와 `.env` 파일도 저장하지 않습니다.

## Moves Workforce 하네스 설치

다른 PC의 `moves-workforce` 저장소에 프로젝트 하네스와 에이전트 설정을 복원하려면 다음 명령을 실행합니다.

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\Install-MovesWorkforceHarness.ps1 `
  -ProjectPath C:\CloudJira\moves-workforce
```

설치 항목은 `AGENTS.md`, `CLAUDE.md`, `.agents`, `.claude/agents`, `.claude/skills`, `.codex/agents`입니다. 머신별 절대 경로가 포함된 `.claude/settings.local.json`은 기본 설치에서 제외됩니다. 해당 PC에서도 기존 권한 목록이 꼭 필요할 때만 `-IncludeLocalSettings`를 지정하고 설치 후 경로를 검토합니다.

기존 파일을 덮어써야 할 때는 `-Force`를 추가합니다. 덮어쓰기 전에 대상 파일을 별도로 백업하는 것이 좋습니다.

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\Install-MovesWorkforceHarness.ps1 `
  -ProjectPath C:\CloudJira\moves-workforce `
  -Force
```

보관된 설정의 목차는 [Moves Workforce 하네스·스킬](projects/moves-workforce-harness/2026-10-29/00-INDEX.md)에서 확인할 수 있습니다.
