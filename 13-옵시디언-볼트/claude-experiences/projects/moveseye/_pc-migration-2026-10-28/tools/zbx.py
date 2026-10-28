"""dev Zabbix 직접 JSON-RPC — 접속 정보는 dev DB setting에서 읽고 출력하지 않는다."""
import json, subprocess, sys, urllib.request

_cfg = json.loads(subprocess.run(
    ["docker", "exec", "dmove-postgres-test", "psql", "-U", "postgres", "-d", "dmove", "-Atc",
     "select value from setting where type='ZABBIX' limit 1"],
    capture_output=True, text=True, encoding="utf-8").stdout.strip())
URL = _cfg["url"].rstrip("/")
if not URL.endswith("api_jsonrpc.php"):
    URL += "/api_jsonrpc.php"
_token = None


def rpc(method, params, auth=True):
    body = {"jsonrpc": "2.0", "method": method, "params": params, "id": 1}
    headers = {"Content-Type": "application/json-rpc"}
    if auth:
        headers["Authorization"] = "Bearer " + token()
    req = urllib.request.Request(URL, data=json.dumps(body).encode(), headers=headers)
    with urllib.request.urlopen(req, timeout=30) as r:
        res = json.loads(r.read())
    if "error" in res:
        return {"ERROR": res["error"]}
    return res["result"]


def token():
    global _token
    if _token is None:
        r = rpc("user.login", {"username": _cfg["username"], "password": _cfg["password"]}, auth=False)
        if isinstance(r, dict) and "ERROR" in r:
            sys.exit("login failed: " + json.dumps(r["ERROR"])[:200])
        _token = r
    return _token


def show(label, x):
    print(label + ":", json.dumps(x, ensure_ascii=False, indent=None)[:3000])
