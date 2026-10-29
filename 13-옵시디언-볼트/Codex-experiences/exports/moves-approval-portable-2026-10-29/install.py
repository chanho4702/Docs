"""Moves Approval 설정 이식. Python 3.11 이상, 외부 패키지 불필요."""
import argparse
import hashlib
import json
import os
import re
import sys
import tomllib
from collections import Counter
from datetime import datetime
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parent
BEGIN = '<!-- moves-approval-portable:begin -->'
END = '<!-- moves-approval-portable:end -->'

def io_path(path):
    return Path('\\\\?\\' + str(path.resolve())) if os.name == 'nt' else path

def read(path):
    return io_path(path).read_bytes()

def exists(path):
    return io_path(path).is_file()

def sha(data):
    return hashlib.sha256(data).hexdigest()

def contained(base, rel):
    part = PurePosixPath(rel)
    if part.is_absolute() or '..' in part.parts or ':' in rel or '\\' in rel:
        raise ValueError('허용되지 않는 상대 경로: ' + rel)
    target = (base / str(part)).resolve()
    if not target.is_relative_to(base.resolve()):
        raise ValueError('대상 폴더를 벗어나는 경로: ' + rel)
    return target

def verify(package):
    for rel, expected in package['sha256'].items():
        source = contained(ROOT, rel)
        if not exists(source) or sha(read(source)) != expected:
            raise ValueError('패키지 파일 검증 실패: ' + rel)

def relocate(data, roots):
    try:
        text = data.decode('utf-8-sig')
    except UnicodeDecodeError:
        return data
    if '\x00' in text:
        return data
    old_home = 'C:/Users/DMOVE'
    pairs = [
        (old_home + '/Codex-experiences', roots['vault'].as_posix()),
        (old_home + '/claude-experiences', roots['vault'].as_posix()),
        ('C:/CloudJira/moves-approval', roots['project'].as_posix()),
        ('C:/CloudJira', roots['project'].parent.as_posix()),
        (old_home, roots['home'].as_posix()),
    ]
    replacements = {}
    for source, dest in pairs:
        for form in [source.replace('/', '\\\\'), source.replace('/', '\\'), source]:
            replacements[form.lower()] = dest
    # 한 번에 치환해야 새 대상 경로 안의 원래 홈 이름을 다시 바꾸지 않는다.
    forms = sorted(replacements, key=len, reverse=True)
    pattern = '(?:' + '|'.join(re.escape(form) for form in forms) + r')(?=$|[/\\\s`\"\x27\]\}\),;])'
    text = re.sub(pattern, lambda match: replacements[match.group().lower()], text, flags=re.IGNORECASE)
    return text.encode('utf-8')

def merged_instruction(old, addition):
    text = old.decode('utf-8-sig') if old else ''
    body = addition.decode('utf-8-sig').strip()
    block = BEGIN + '\n' + body + '\n' + END
    if BEGIN in text:
        if END not in text:
            raise ValueError('기존 지침의 managed block 종료 표식이 없습니다.')
        text = re.sub(re.escape(BEGIN) + r'[\s\S]*?' + re.escape(END), lambda _: block, text)
    elif text.strip() == body:
        return old
    else:
        text = text.rstrip() + ('\n\n' if text.strip() else '') + block + '\n'
    return text.encode('utf-8')

def merge_missing(old, defaults):
    result = dict(old)
    for key, value in defaults.items():
        if key not in result:
            result[key] = value
        elif isinstance(value, dict) and isinstance(result[key], dict):
            result[key] = merge_missing(result[key], value)
    return result

def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', required=True, type=Path, help='새 PC의 moves-approval 저장소 경로')
    parser.add_argument('--vault', required=True, type=Path, help='새 PC의 Obsidian Vault 경로')
    parser.add_argument('--home', type=Path, default=Path.home(), help='사용자 홈. 검증 환경에서는 임시 폴더 지정 가능')
    parser.add_argument('--apply', action='store_true', help='파일에 적용. 생략하면 변경 계획만 확인')
    parser.add_argument('--overwrite-files', action='store_true', help='충돌하는 스킬·프로젝트 파일을 백업한 뒤 교체')
    parser.add_argument('--codex-model', help='새 PC에서 지원되는 모델명. 생략 시 기존 선택 유지')
    parser.add_argument('--claude-model', help='새 PC에서 지원되는 모델명. 생략 시 기존 선택 유지')
    parser.add_argument('--notion-mcp', action='store_true', help='Claude 사용자 MCP에 Notion URL 추가. 인증은 새 PC에서 수행')
    args = parser.parse_args(argv)
    if not args.project.expanduser().is_dir():
        parser.error('--project 디렉터리가 없습니다. 프로젝트를 먼저 복제하거나 경로를 확인하세요.')
    roots = {name: getattr(args, name).expanduser().resolve() for name in ['home', 'project', 'vault']}
    if len(set(roots.values())) != 3:
        parser.error('--home, --project, --vault는 서로 다른 폴더여야 합니다.')
    package = json.loads((ROOT/'package-manifest.json').read_text(encoding='utf-8'))
    verify(package)
    changes, statuses = [], []

    def plan(scope, rel, data, mode='file'):
        target = contained(roots[scope], rel)
        if io_path(target).exists() and not exists(target):
            raise ValueError('파일 위치에 디렉터리가 있습니다: ' + str(target))
        old = read(target) if exists(target) else None
        if mode == 'instruction':
            data = merged_instruction(old, data)
        if old == data:
            status = '동일'
        elif old is not None and mode == 'file' and not args.overwrite_files:
            status = '충돌_보존'
        else:
            status = '변경' if old is not None else '신규'
            changes.append((scope, rel, target, data, old))
        statuses.append({'scope': scope, 'path': rel, 'status': status})

    for entry in package['install']:
        data = read(contained(ROOT, entry['source']))
        if entry.get('relocate', True):
            data = relocate(data, roots)
        plan(entry['scope'], entry['target'], data, entry.get('mode','file'))

    market_path = contained(roots['home'], '.agents/plugins/marketplace.json')
    market_old = json.loads(read(market_path).decode('utf-8-sig')) if exists(market_path) else {}
    market_new = json.loads(json.dumps(market_old))
    market_new.setdefault('name','moves-approval-portable')
    market_new.setdefault('interface',{'displayName':'Moves Approval Portable'})
    plugin_entry = {'name':'harness','source':{'source':'local','path':'./.codex/plugins/moves-approval-harness'},'policy':{'installation':'AVAILABLE','authentication':'ON_INSTALL'},'category':'Productivity'}
    plugins = market_new.setdefault('plugins',[])
    if not any(p.get('name')=='harness' for p in plugins):
        plugins.append(plugin_entry)
    elif not any(p.get('name')=='harness' and p.get('source')==plugin_entry['source'] for p in plugins):
        statuses.append({'scope':'home','path':'.agents/plugins/marketplace.json:harness','status':'충돌_보존'})
    market_bytes = read(market_path) if exists(market_path) and market_old==market_new else (json.dumps(market_new,ensure_ascii=False,indent=2)+'\n').encode('utf-8')
    plan('home','.agents/plugins/marketplace.json',market_bytes,'merge')

    claude_path = contained(roots['home'], '.claude/settings.json')
    claude_old = json.loads(read(claude_path).decode('utf-8-sig')) if exists(claude_path) else {}
    defaults = {'language':'korean','theme':'dark','autoUpdatesChannel':'latest','skipDangerousModePermissionPrompt':True}
    claude_new = merge_missing(claude_old, defaults)
    if args.claude_model:
        claude_new['model'] = args.claude_model
    claude_bytes = read(claude_path) if exists(claude_path) and claude_new == claude_old else (json.dumps(claude_new,ensure_ascii=False,indent=2)+'\n').encode('utf-8')
    plan('home','.claude/settings.json',claude_bytes,'merge')

    local_path = contained(roots['project'], '.claude/settings.local.json')
    local_old = json.loads(read(local_path).decode('utf-8-sig')) if exists(local_path) else {}
    local_new = json.loads(json.dumps(local_old))
    allowed = local_new.setdefault('permissions',{}).setdefault('allow',[])
    for command in ['Bash(tail *)','Bash(ps *)']:
        if command not in allowed:
            allowed.append(command)
    local_bytes = read(local_path) if exists(local_path) and local_new==local_old else (json.dumps(local_new,ensure_ascii=False,indent=2)+'\n').encode('utf-8')
    plan('project','.claude/settings.local.json',local_bytes,'merge')

    codex_path = contained(roots['home'], '.codex/config.toml')
    codex_text = read(codex_path).decode('utf-8-sig') if exists(codex_path) else ''
    config = tomllib.loads(codex_text)
    additions = []
    if 'model_reasoning_effort' not in config:
        additions.append('model_reasoning_effort = "medium"')
    if args.codex_model:
        if 'model' in config:
            raise ValueError('기존 Codex model은 보존합니다. --codex-model을 빼거나 앱에서 모델을 변경하세요.')
        additions.append('model = ' + json.dumps(args.codex_model, ensure_ascii=False))
    new_toml = ('\n'.join(additions)+'\n\n' if additions else '')+codex_text
    tomllib.loads(new_toml)
    plan('home','.codex/config.toml',new_toml.encode('utf-8'),'merge')

    if args.notion_mcp:
        p = contained(roots['home'], '.claude.json')
        old = json.loads(read(p).decode('utf-8-sig')) if exists(p) else {}
        new = merge_missing(old, {'mcpServers':{'notion':{'type':'http','url':'https://mcp.notion.com/mcp'}}})
        data = read(p) if exists(p) and old==new else (json.dumps(new,ensure_ascii=False,indent=2)+'\n').encode('utf-8')
        plan('home','.claude.json',data,'merge')

    index_path = contained(roots['vault'],'INDEX.md')
    index = read(index_path).decode('utf-8-sig') if exists(index_path) else '# Experiences\n'
    entry = '- [[projects/moves-approval-portable-setup-2026-10-29]] 다른 컴퓨터용 Claude·Codex 설정·스킬 설치 절차와 다시 연결할 구성 요소.'
    if entry not in index:
        index = index.rstrip()+'\n\n'+entry+'\n'
    plan('vault','INDEX.md',index.encode('utf-8'),'merge')
    counts = dict(Counter(item['status'] for item in statuses))
    conflicts = [item for item in statuses if item['status']=='충돌_보존']
    stamp = datetime.now().strftime('%Y%m%d-%H%M%S-%f')
    backup_root = roots['home']/'.moves-approval-portable/backups'/stamp
    report = {'applied':args.apply,'roots':{k:str(v) for k,v in roots.items()},'counts':counts,'conflicts':conflicts,'changes':[]}
    if args.apply:
        for scope, rel, target, data, old in changes:
            backup = None
            if old is not None:
                backup = contained(backup_root,scope+'/'+rel)
                io_path(backup.parent).mkdir(parents=True,exist_ok=True)
                io_path(backup).write_bytes(old)
            io_path(target.parent).mkdir(parents=True,exist_ok=True)
            temp = target.with_name(target.name+'.moves-portable-'+stamp+'.tmp')
            io_path(temp).write_bytes(data)
            os.replace(io_path(temp),io_path(target))
            report['changes'].append({'target':str(target),'backup':str(backup) if backup else None,'sha256':sha(data)})
        report_path = roots['home']/'.moves-approval-portable/reports'/('install-'+stamp+'.json')
        io_path(report_path.parent).mkdir(parents=True,exist_ok=True)
        io_path(report_path).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        report['report_file'] = str(report_path)
    print(json.dumps({k:v for k,v in report.items() if k!='changes'},ensure_ascii=False,indent=2))
    return 2 if conflicts else 0

if __name__ == '__main__':
    if hasattr(sys.stdout,'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    try:
        sys.exit(main())
    except (ValueError,OSError,KeyError) as exc:
        print('설치 중단: '+str(exc),file=sys.stderr)
        sys.exit(1)
