import json, re, shutil
from pathlib import Path

HOME = Path(r"C:\Users\DMOVE")
VAULT = HOME / "claude-experiences" / "agent-config"
CL = VAULT / "claude"
CX = VAULT / "codex"
SECRET = re.compile(r"qwe123|password|PGPASSWORD|root_token|Bearer |api[_-]?key|이력서", re.I)
IGN = shutil.ignore_patterns("synced", "skills-main", "skills-main.zip", ".system", "__pycache__", "node_modules")


def copytree(src, dst):
    shutil.copytree(src, dst, ignore=IGN, dirs_exist_ok=True)


def filtered_settings(src, dst):
    d = json.loads(Path(src).read_text(encoding="utf-8"))
    dropped = 0
    perms = d.get("permissions", {})
    for key in ("allow", "deny", "ask"):
        if key in perms:
            keep = [x for x in perms[key] if not SECRET.search(x)]
            dropped += len(perms[key]) - len(keep)
            perms[key] = keep
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return dropped


def copy_memory(src, dst):
    """프로젝트 메모리 사본 — 개발용 비밀번호 두 종은 마스킹 자리로 바꾼다."""
    copytree(src, dst)
    masked = 0
    for p in dst.glob("*.md"):
        t = p.read_text(encoding="utf-8")
        t2 = t.replace("Admin@123", "<dev-admin-pw>").replace("qwe123", "<dev-db-pw>")
        if t2 != t:
            p.write_text(t2, encoding="utf-8")
            masked += 1
    return masked


report = []
# README.md·tools/ 는 손으로 쓴 것이라 남기고, 생성물 폴더(claude/·codex/)만 지우고 다시 만든다
for sub in (CL, CX):
    if sub.exists():
        shutil.rmtree(sub)
VAULT.mkdir(parents=True, exist_ok=True)

# ---------- Claude ----------
u = CL / "user"
u.mkdir(parents=True)
for f in ("CLAUDE.md", "settings.json"):
    shutil.copy2(HOME / ".claude" / f, u / f)
report.append(("claude/user/settings.local.json",
               filtered_settings(HOME / ".claude" / "settings.local.json", u / "settings.local.json")))
copytree(HOME / ".claude" / "hooks", u / "hooks")
copytree(HOME / ".claude" / "skills", u / "skills")
report.append(("claude/memory (masked files)",
               copy_memory(HOME / ".claude" / "projects" / "C--solutions" / "memory", CL / "memory")))

# MCP 서버 정의(토큰 없음) — ~/.claude.json 에서 항목만 옮겨 적음
mcp = {
    "global": {"notion": {"type": "http", "url": "https://mcp.notion.com/mcp"}},
    "projects": {"C:/solutions/moveseye-ai": {"moveseye": {"type": "http", "url": "http://localhost:3100/mcp"}}},
}
(CL / "mcp-servers.json").write_text(json.dumps(mcp, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

sol = CL / "solutions"
copytree(Path(r"C:\solutions\.claude") / "agents", sol / "agents")
copytree(Path(r"C:\solutions\.claude") / "skills", sol / "skills")
report.append(("claude/solutions/settings.local.json",
               filtered_settings(Path(r"C:\solutions\.claude\settings.local.json"), sol / "settings.local.json")))
report.append(("claude/moveseye-be-spring/settings.local.json",
               filtered_settings(Path(r"C:\solutions\moveseye-be-spring\.claude\settings.local.json"),
                                 CL / "moveseye-be-spring" / "settings.local.json")))
report.append(("claude/moveseyee_fe/settings.local.json",
               filtered_settings(Path(r"C:\solutions\moveseyee_fe\.claude\settings.local.json"),
                                 CL / "moveseyee_fe" / "settings.local.json")))
for f in ("CLAUDE.md", "COLLAB.md"):
    shutil.copy2(Path(r"C:\solutions") / f, sol / f)

# ---------- CloudJira (Forge 앱: 승인 moves-approval-jira · 워크포스 moves-workforce) ----------
# 각 리포의 .claude/{agents,skills}(하네스), 루트 CLAUDE.md·AGENTS.md(AGENTS.md 는 Codex 도 읽는다),
# 프로젝트 메모리(~/.claude/projects/C--CloudJira-<리포>/memory). .claude/worktrees 는 복사하지 않는다.
CJ = Path(r"C:\CloudJira")
for name in ("moves-approval-jira", "moves-workforce"):
    repo, dst = CJ / name, CL / name
    copytree(repo / ".claude" / "agents", dst / "agents")
    copytree(repo / ".claude" / "skills", dst / "skills")
    for f in ("CLAUDE.md", "AGENTS.md"):
        shutil.copy2(repo / f, dst / f)
    report.append((f"claude/{name}/memory (masked files)",
                   copy_memory(HOME / ".claude" / "projects" / f"C--CloudJira-{name}" / "memory", dst / "memory")))
    if (repo / ".claude" / "settings.local.json").exists():
        report.append((f"claude/{name}/settings.local.json",
                       filtered_settings(repo / ".claude" / "settings.local.json", dst / "settings.local.json")))
# 승인 앱 무인 실행기(autopilot): run.ps1 + Claude/Codex 회차 프롬프트
copytree(CJ / "moves-approval-jira" / "scripts" / "autopilot", CL / "moves-approval-jira" / "autopilot")

# ---------- Codex ----------
CX.mkdir(parents=True)
cx = HOME / ".codex"
for f in ("AGENTS.md", "config.toml", "hooks.json"):
    shutil.copy2(cx / f, CX / f)
copytree(cx / "hooks", CX / "hooks")
copytree(cx / "skills", CX / "skills")
rules = (cx / "rules" / "default.rules").read_text(encoding="utf-8").splitlines()
keep = [l for l in rules if not SECRET.search(l)]
(CX / "rules").mkdir()
(CX / "rules" / "default.rules").write_text("\n".join(keep) + "\n", encoding="utf-8")
report.append(("codex/rules/default.rules", len(rules) - len(keep)))

# 이식 가능한 부분만 추린 config — 기계 고유 경로(runtimes 해시·파이프·hooks.state·node_repl)는 뺀다
KEEP_SEC = re.compile(r"^\[(projects\.|windows\]|marketplaces\.harness-marketplace\]|plugins\.|features\]|desktop\])")
lines = (cx / "config.toml").read_text(encoding="utf-8").splitlines()
head = [l for l in lines if l.startswith(("model =", "model_reasoning_effort =", "approvals_reviewer ="))]
out, cur_keep = [], False
for line in lines:
    if line.startswith("["):
        cur_keep = bool(KEEP_SEC.match(line))
        if cur_keep:
            if out and out[-1] != "":
                out.append("")
            out.append(line)
        continue
    if cur_keep and line.strip():
        out.append(line)
(CX / "config.portable.toml").write_text("\n".join(head) + "\n\n" + "\n".join(out).strip() + "\n", encoding="utf-8")

# 결과 비밀값 검사
hits = []
for p in VAULT.rglob("*"):
    if p.is_file() and p.suffix in (".json", ".toml", ".md", ".rules", ".ps1", ".cmd"):
        for i, l in enumerate(p.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
            if re.search(r"qwe123|Admin@123|PGPASSWORD|root_token|sk-ant|ghp_|Bearer ey|PRIVATE KEY|712020:[0-9a-f-]{8,}", l):
                hits.append(f"{p.relative_to(VAULT)}:{i}")
print("dropped:", report)
print("secret hits:", hits[:20])
print("files:", sum(1 for p in VAULT.rglob("*") if p.is_file()))
