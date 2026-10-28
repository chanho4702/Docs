import os
import json, urllib.request, urllib.parse, http.cookiejar, sys
sys.stdout.reconfigure(encoding="utf-8")
BASE = "http://127.0.0.1:3000"
HDR = {"x-visitor-id": "rt-graph", "Content-Type": "application/json"}
jar = http.cookiejar.CookieJar()
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
def call(method, path, body=None, params=None):
    url = BASE + path + ("?" + urllib.parse.urlencode(params, doseq=True) if params else "")
    req = urllib.request.Request(url, method=method, headers=HDR, data=json.dumps(body).encode() if body is not None else None)
    try:
        with op.open(req, timeout=120) as r:
            return json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return {"httpStatus": e.code, "body": e.read().decode(errors="replace")[:300]}
def login():
    r = call("POST", "/auth/login", {"username": "admin", "password": os.environ["MOVESEYE_DEV_PW"]})
    assert r.get("code") == 200, r
