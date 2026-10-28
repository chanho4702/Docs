# 검증 명령과 증거

`AGENTS.md`의 필수 검증을 따른다. 동일한 소스 상태에서 이미 실행한 검증은 명령·종료 코드·범위가 확인될 때 재사용한다. 이후 코드 변경이 영향을 준 검증은 다시 실행한다. 실패가 기존 변경에서 발생했는지, 이번 변경에서 발생했는지 구분하고 임의로 타인의 변경을 수정하지 않는다.

## 앱 검증

앱 루트에서 실행한다. 다른 디렉토리에서 시작했다면 먼저 저장소 절대 경로를 확인해 이동한다.

```powershell
npm test -- --runInBand
```

프론트 검증은 `static/ui`를 작업 디렉토리로 지정한다. 테스트와 빌드는 각각 실행한다. `CI` 환경값은 빌드 뒤 복원한다.

```powershell
npm test -- --runInBand
```

```powershell
$previousCi = $env:CI
try {
    $env:CI = 'true'
    npm run build
    $buildExit = $LASTEXITCODE
} finally {
    if ($null -eq $previousCi) {
        Remove-Item Env:CI -ErrorAction SilentlyContinue
    } else {
        $env:CI = $previousCi
    }
}
if ($buildExit -ne 0) { exit $buildExit }
```

`npm run build`의 prebuild는 번역 merge, build는 앱 빌드와 번들 검사까지 실행한다. 빌드 중 다른 작업자가 번역·출력 파일을 변경하지 않도록 조율한다. 성공·경고·오류를 구분한다.

Forge 명령 직전에는 앱 루트 경로를 출력한다.

```powershell
pwd
forge lint
```

각 명령을 별도 실행하거나 종료 코드를 즉시 저장해 앞 명령의 실패가 다음 성공으로 가려지지 않게 한다. 필요한 CLI나 인증이 없으면 `미검증`으로 남긴다. 검증을 위한 배포·설치·`--no-verify`는 실행하지 않는다.

## 하네스 구조 검증

Python 3.11 이상과 저장소의 설치된 Node 의존성(`js-yaml`)을 사용한다.

```powershell
python -X utf8 .agents/skills/feature-harness/scripts/validate_harness.py
```

TOML/YAML 파싱, UTF-8 BOM, 스킬 이름·설명, 에이전트의 스킬 연결, 로컬 Markdown 링크, AGENTS 진입점을 검사한다. SKILL.md는 frontmatter 검색이 깨지지 않도록 UTF-8 BOM 없이 저장한다. 하네스는 현재 `.gitignore`에 따라 로컬 파일이므로 `git diff`만으로 변경을 확인하지 않는다. 수정 전 사본과 직접 비교한다. 자동 검사 외에 [시나리오](scenarios.md)를 실제 지침으로 평가한다.

## 보고

보고서는 `통과 / 실패 / 미검증`으로 구분한다. 검증한 소스 기준, 명령·작업 디렉토리·종료 코드·로그 경로를 기록한다. 실패에는 재현 조건과 생산자/소비자 파일 위치를 붙인다. 테스트 통과와 실제 Jira 설치·브라우저 동작 확인은 별도 증거다.
