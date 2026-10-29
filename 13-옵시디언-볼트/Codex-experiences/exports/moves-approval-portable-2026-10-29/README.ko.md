# Moves Approval — 다른 컴퓨터용 설정 패키지

이 ZIP에는 설치 도구, 사용자 스킬의 스크립트·참고 자료·assets, Codex harness 2.1.0, Claude harness 1.2.0, Claude 메모리 플러그인 0.1.3, 원본 설정 기록이 들어 있다. 앱·계정 로그인·프로젝트 소스는 별도로 준비한다.

## 1. 새 컴퓨터 준비

1. ZIP을 내려받아 짧은 경로(예: `C:\Setup\moves-approval`)에 압축 해제한다.
2. Python **3.11 이상**, Codex 및 Claude를 설치하고 사용할 계정으로 로그인한다.
3. `moves-approval` Confluence 저장소를 새 컴퓨터에 복제한다. 이 패키지에는 애플리케이션 소스가 없다.
4. Obsidian Vault 경로를 정한다. 설치 도구가 Claude와 Codex의 경험 기록 경로를 이 Vault로 맞춘다.

## 2. 설정 적용

ZIP을 푼 폴더에서 실행한다. 아래 프로젝트·Vault 경로를 새 컴퓨터 경로로 바꾼다.

```powershell
py -3 install.py --project "D:\Projects\moves-approval" --vault "D:\Notes\Codex-experiences" --apply
```

macOS/Linux에서는 다음과 같다. 파일 설치 도구는 공통이며 Windows 전용 hook·스킬 도구는 해당 OS에 맞게 별도로 준비해야 한다. 이 패키지의 실행 검증은 Windows에서 했다.

```bash
python3 install.py --project "$HOME/Projects/moves-approval" --vault "$HOME/Notes/Codex-experiences" --apply
```

`--apply`를 빼면 파일을 바꾸지 않고 계획만 출력한다. 다른 내용의 기존 스킬·프로젝트 파일은 보존하고 `충돌_보존`으로 보고한다(종료 코드 2). 해당 파일도 패키지 버전으로 바꾸려면 `--overwrite-files`를 추가한다. 변경하는 기존 파일은 `~/.moves-approval-portable/backups/`에 백업하고, 적용 결과는 `reports/`에 남긴다. 설정 JSON은 필요한 항목을 합치고 이미 존재하는 값을 보존한다. Codex TOML도 원문·기존 모델·다른 설정을 유지한다.

기존 Codex·Claude 모델은 유지한다. 새 PC의 모델을 지정하려면 `--codex-model MODEL` 또는 `--claude-model MODEL`을 쓴다. Codex의 기존 model 키가 있으면 명령으로 덮어쓰지 않고 앱에서 바꾸도록 안내한다. 이전 PC의 `gpt-5.6-sol`, `fable` 식별자가 다른 계정에서도 제공된다고 가정하지 않는다.

Claude Notion 연결 주소도 추가하려면 `--notion-mcp`를 추가한다. 실제 인증은 Claude에서 완료한다.

## 3. 하네스 플러그인 켜기

### Codex

설치 도구는 harness **2.1.0**의 전체 파일을 `~/.codex/plugins/moves-approval-harness`에 넣고 개인 marketplace `~/.agents/plugins/marketplace.json`에 연결한다. 앱을 다시 열고 Plugins에서 **Moves Approval Portable → harness**를 설치·활성화한다. 기존 개인 marketplace가 있으면 그 이름을 유지한다. 기존 `harness` 항목이 다른 경로를 가리키면 덮어쓰지 않고 충돌로 보고한다.

CLI에서는 `codex` 실행 후 `/plugins`에서 확인한다. [공식 로컬 플러그인 설치 문서](https://developers.openai.com/plugins/build/plugins)

### Claude

Windows PowerShell에서 아래 명령을 실행한다. 인터넷에서 새 버전을 받는 대신 패키지에 넣은 버전을 설치한다.

```powershell
claude plugin marketplace add "$env:USERPROFILE\.moves-approval-portable\claude-marketplace"
claude plugin install harness@moves-approval-portable --scope user
claude plugin install claude-mem-cowork@moves-approval-portable --scope user
claude plugin list
```

macOS/Linux에서는 첫 번째 경로를 `"$HOME/.moves-approval-portable/claude-marketplace"`로 바꾼다. 기존 `harness@harness-marketplace`와 새 패키지의 플러그인이 중복 활성화되면 사용할 버전 하나를 선택한다. 메모리 플러그인은 서비스 인증을 별도로 설정해야 한다. [공식 로컬 marketplace 설치 문서](https://code.claude.com/docs/en/discover-plugins)

## 4. 새 컴퓨터에서 다시 연결할 항목

| 항목 | 새 PC에서 할 일 |
|---|---|
| Codex·Claude 계정 | 각 앱에서 로그인 |
| OpenAI 제공 browser/computer-use/documents/pdf/spreadsheets/presentations 등 | 새 앱의 Plugins에서 필요한 항목 활성화. 앱이 그 PC의 실행 파일·MCP 경로를 생성하도록 한다 |
| Claude 동기화 스킬 | 같은 계정으로 로그인해 동기화. 이전 PC의 synced 캐시는 설치하지 않는다 |
| Orca hook·statusLine | Orca를 설치하고 그 PC에서 Claude/Codex를 실행해 연결을 구성. 이전 PC의 token·pipe·포트·`.cmd`를 활성 설정으로 복사하지 않는다 |
| Notion MCP | `--notion-mcp`로 주소 추가 후 인증 |
| Claude 메모리 플러그인 | 플러그인 설치 후 `cmem.ai` 서비스 설정·인증 |
| 각 스킬의 Node/Python/외부 앱 | 해당 SKILL.md와 requirements/package 파일의 의존성을 준비 |
| Windows 완료 알림 | 원본 스크립트는 참고 ZIP에 보관. Windows에서 필요할 때 hook에 연결 |

프로젝트별 과거 명령 허용 205개, 프로젝트 신뢰, 위험 모드, 앱 자체 system 스킬·실행 파일·OAuth 데이터는 새 PC에 일괄 적용하지 않는다. 현재 PC에서 받은 명령 허용을 다른 컴퓨터의 다른 프로젝트에 옮기지 않기 위한 범위 구분이다. 원래 값과 hook 정의는 참고 ZIP에 모두 남아 있다.

## 5. 적용 결과 확인

- 새 세션에서 한국어 지침과 새 Vault 경로가 표시되는지 확인한다.
- Codex에서 사용자 스킬과 harness 플러그인, Claude에서 `/harness:harness` 및 `/plugin` 목록을 확인한다.
- 같은 설치 명령을 `--apply` 없이 다시 실행해 신규·변경·충돌이 없는지 확인한다.
- 설치 도구는 앱을 실행하거나 모델 호출·MCP 로그인·원격 배포를 하지 않는다.

사용자 스킬은 Codex의 `~/.agents/skills`, Claude의 `~/.claude/skills`에 설치한다. 중첩된 스킬 저장소는 스킬별 폴더로 풀고, 같은 이름의 별도 정의는 `anthropic-` 접두사로 경로를 구분했다. 내용과 보조 파일은 보존한다. [Codex 스킬 위치](https://learn.chatgpt.com/docs/build-skills), [Claude 독립 스킬 위치](https://code.claude.com/docs/en/plugins)

## 보관 자료

- `reference-snapshot.zip`: 기존 설정·메모리·분석 기록. 필요하면 Vault 루트에 압축 해제한다. 이는 원본 시점 기록이라 이전 PC의 경로를 그대로 포함한다.
- `package-manifest.json`: 설치 대상과 파일 SHA-256. 설치 전에 자동으로 검증한다.
- `source-manifest.json`: 원본 파일 경로·해시와 패키지 파일의 대응.
- `skill-inventory.json`: 사용자 스킬 설치 위치.
- `verification.json`: 제작 PC의 격리된 홈·프로젝트·Vault에서 실행한 검증 결과.

다른 PC에서 파일을 받으려면 ZIP을 동기화 폴더·개인 저장소·USB로 전송해야 한다. 제작 PC의 로컬 경로 링크만으로는 다른 PC에서 내려받을 수 없다.
