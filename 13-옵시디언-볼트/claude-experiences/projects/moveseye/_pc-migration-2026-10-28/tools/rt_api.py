import os
import json, sys, http.cookiejar, urllib.request

BASE = "http://127.0.0.1:3000"
cj = http.cookiejar.CookieJar()
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
H = {"Content-Type": "application/json", "x-visitor-id": "rt-verify-20261022"}


def call(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method, headers=H)
    try:
        with op.open(req, timeout=60) as r:
            return r.status, json.loads(r.read().decode("utf-8") or "null")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")[:300]


s, b = call("POST", "/auth/login", {"username": "admin", "password": os.environ["MOVESEYE_DEV_PW"]})
print("login", s, (b.get("code") if isinstance(b, dict) else b))


def show(method, path, body=None, n=600):
    s, b = call(method, path, body)
    txt = json.dumps(b, ensure_ascii=False)
    print(f"\n== {method} {path} -> {s}\n{txt[:n]}")
    return b


for p in sys.argv[1:]:
    m, _, path = p.partition(" ")
    show(m, path, n=1500)
