# agents/skills/feature-harness/scripts/validate_harness.py

```python
"""로컬 하네스의 문법과 참조 연결을 검사한다. 기능 동작은 드라이런으로 검증한다."""

import argparse
import json
from pathlib import Path
import re
import subprocess
import sys
import tomllib
from urllib.parse import unquote, urlsplit


def validate(root):
    errors = []
    skill_root = root / '.agents/skills'
    agent_root = root / '.codex/agents'
    skills = {}
    agents = {}
    documents = {}

    def read(path):
        try:
            body = path.read_text(encoding='utf-8')
            if path.name == 'SKILL.md' and body.startswith('\ufeff'):
                errors.append(f'{path}: SKILL.md는 UTF-8 BOM 없이 저장해야 함')
            return body.removeprefix('\ufeff')
        except (OSError, UnicodeError) as error:
            errors.append(f'{path}: {error}')
            return ''

    for path in sorted(skill_root.rglob('*.md')):
        documents[path] = read(path)

    frontmatters = {}
    for path in sorted(skill_root.glob('*/SKILL.md')):
        body = documents[path]
        match = re.match(r'\A---\r?\n(.*?)\r?\n---(?:\r?\n|$)', body, re.S)
        if not match:
            errors.append(f'{path}: YAML frontmatter 누락')
            continue
        frontmatters[str(path)] = match[1]
        if len(body.splitlines()) > 500:
            errors.append(f'{path}: 500줄 초과, 조건부 내용을 references로 분리 필요')

    # 저장소에 설치된 YAML 파서를 사용해 인용부호·중복 키도 실제 문법으로 검사한다.
    parser = """
const fs = require('fs');
const yaml = require('js-yaml');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const output = {};
for (const [path, source] of Object.entries(input)) {
    try { output[path] = {data: yaml.load(source)}; }
    catch (error) { output[path] = {error: error.message}; }
}
process.stdout.write(JSON.stringify(output));
"""
    try:
        result = subprocess.run(
            ['node', '-e', parser], cwd=root, input=json.dumps(frontmatters),
            text=True, encoding='utf-8', capture_output=True, check=True,
        )
        for filename, parsed in json.loads(result.stdout).items():
            path = Path(filename)
            data = parsed.get('data')
            if not isinstance(data, dict):
                errors.append(f'{path}: {parsed.get("error", "YAML 객체 필요")}')
                continue
            name = data.get('name')
            description = data.get('description')
            if name != path.parent.name or not re.fullmatch(r'[a-z0-9-]{1,64}', str(name)):
                errors.append(f'{path}: 폴더와 유효한 skill name이 일치해야 함')
            if not isinstance(description, str) or not description.strip():
                errors.append(f'{path}: description 누락')
            if name in skills:
                errors.append(f'{path}: 중복 skill name {name}')
            skills[str(name)] = path
    except (OSError, subprocess.CalledProcessError, json.JSONDecodeError) as error:
        errors.append(f'YAML 검사 실행 실패(Node와 저장소 js-yaml 의존성 확인): {error}')

    for path in sorted(agent_root.glob('*.toml')):
        try:
            data = tomllib.loads(read(path))
        except tomllib.TOMLDecodeError as error:
            errors.append(f'{path}: {error}')
            continue
        name = data.get('name')
        for key in ('name', 'description', 'developer_instructions'):
            if not isinstance(data.get(key), str) or not data[key].strip():
                errors.append(f'{path}: {key} 누락')
        if name != path.stem:
            errors.append(f'{path}: 파일명과 agent name 불일치')
        if name in agents:
            errors.append(f'{path}: 중복 agent name {name}')
        agents[str(name)] = data

    harness = documents.get(skill_root / 'feature-harness/SKILL.md', '')
    rows = re.findall(r'^\| `([a-z-]+)` \| \[([^\]]+)\]\(([^)]+)\)', harness, re.M)
    if not rows:
        errors.append('feature-harness: 에이전트 연결 표 누락')
    if {row[0] for row in rows} != set(agents):
        errors.append('오케스트레이터와 실제 에이전트 목록 불일치')
    if {row[1] for row in rows} | {'feature-harness'} != set(skills):
        errors.append('오케스트레이터와 실제 스킬 목록 불일치')
    for name, skill, _ in rows:
        pointer = f'.agents/skills/{skill}/SKILL.md'
        if pointer not in agents.get(name, {}).get('developer_instructions', ''):
            errors.append(f'{name}: 담당 스킬 직접 읽기 연결 누락 ({pointer})')

    for name in ('AGENTS.md', 'CLAUDE.md'):
        path = root / name
        documents[path] = read(path)
    if '.agents/skills/feature-harness/SKILL.md' not in documents[root / 'AGENTS.md']:
        errors.append('AGENTS.md: feature-harness 진입점 누락')

    for path, body in documents.items():
        for target in re.findall(r'(?<!!)\[[^\]\n]+\]\(([^)\n]+)\)', body):
            target = target.strip().strip('<>')
            if urlsplit(target).scheme or target.startswith('#'):
                continue
            local = unquote(target.split('#', 1)[0])
            if local and not (path.parent / local).exists():
                errors.append(f'{path}: 깨진 로컬 링크 {target}')

    return errors, len(agents), len(skills)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[4])
    args = parser.parse_args()
    errors, agent_count, skill_count = validate(args.root.resolve())
    for error in errors:
        print(f'FAIL: {error}')
    if errors:
        print(f'하네스 구조 검사 실패: {len(errors)}건')
        return 1
    print(f'하네스 구조 검사 통과: 에이전트 {agent_count}개, 스킬 {skill_count}개, 로컬 링크 확인')
    return 0


if __name__ == '__main__':
    sys.exit(main())

```
