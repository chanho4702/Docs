"""프록시·프록시 그룹 런타임 실측 — 시험 객체(rt-px-*)만 만들고 지운다. 🔴 proxyid 1(ZabbixProxyDemo)은 건드리지 않는다."""
import json
import sys
sys.path.insert(0, r"C:\Users\DMOVE\AppData\Local\Temp\claude\C--solutions\eee4683d-0280-4673-9a67-5cecb7771b95\scratchpad")
from rt_common import call, login
from rt_arch_common import sql
import zbx

K = "0123456789abcdef0123456789abcdef"
made = {"proxies": [], "groups": [], "hosts": []}


def show(label, r, keys=None):
    d = r.get("data")
    if keys and isinstance(d, dict):
        d = {k: d.get(k) for k in keys}
    print(f"{label}: code={r.get('code')} errorCode={r.get('errorCode')} msg={str(r.get('message'))[:160]} data={json.dumps(d, ensure_ascii=False)[:400]}")
    return d


login()
try:
    rows = call("GET", "/zabbix-manage/proxies")["data"]
    demo = next(p for p in rows if p["proxyid"] == "1")
    print("list:", len(rows), "demo:", {k: demo[k] for k in ("name", "state", "version", "compatibility", "hostCount", "operatingMode")})
    opts = show("options", call("GET", "/zabbix-manage/proxies/options"))
    d1 = call("GET", "/zabbix-manage/proxies/1")["data"]
    print("demo detail: hosts", len(d1["hosts"]), "truncated", d1["hostsTruncated"], "drules", d1["discoveryRules"], "psk keys", [k for k in d1 if "psk" in k.lower()])

    # --- 그룹
    g = show("group create", call("POST", "/zabbix-manage/proxy-groups", {"name": "rt-px-group", "failover_delay": "", "min_online": "2"}))
    gid = g["summary"]["proxyGroupId"]; made["groups"].append(gid)
    print("  group defaults:", g["summary"]["failoverDelay"], g["summary"]["minOnline"], g["summary"]["state"])
    show("group bad min_online", call("PUT", f"/zabbix-manage/proxy-groups/{gid}", {"min_online": "0"}))
    show("group empty delay on update", call("PUT", f"/zabbix-manage/proxy-groups/{gid}", {"failover_delay": ""}))

    # --- 프록시 생성 규칙
    show("create no mode", call("POST", "/zabbix-manage/proxies", {"name": "rt-px-a"}))
    show("create psk w/o key", call("POST", "/zabbix-manage/proxies", {"name": "rt-px-a", "operating_mode": 0, "tls_accept": 2, "tls_psk_identity": "id1"}))
    show("create in group w/o local", call("POST", "/zabbix-manage/proxies", {"name": "rt-px-a", "operating_mode": 0, "proxy_groupid": gid}))
    a = show("create active psk", call("POST", "/zabbix-manage/proxies", {"name": "rt-px-a", "operating_mode": 0, "tls_accept": 2,
            "tls_psk_identity": "rt-secret-id", "tls_psk": K, "allowed_addresses": "10.0.0.5", "address": "ignored"}))
    aid = a["summary"]["proxyid"]; made["proxies"].append(aid)
    print("  pskConfigured", a["summary"]["pskConfigured"], "tlsAccept", a["summary"]["tlsAccept"], "address", a["summary"]["address"])
    show("dup name", call("POST", "/zabbix-manage/proxies", {"name": "rt-px-a", "operating_mode": 0}))

    # --- 수정: PSK 유지·모드 전환
    r = show("keep psk (accept 3)", call("PUT", f"/zabbix-manage/proxies/{aid}", {"tls_accept": 3}), None)
    show("mode only (encrypted)", call("PUT", f"/zabbix-manage/proxies/{aid}", {"operating_mode": 1, "address": "10.0.0.9"}))
    r = call("PUT", f"/zabbix-manage/proxies/{aid}", {"operating_mode": 1, "address": "10.0.0.9", "tls_connect": 2})
    show("active->passive keeping psk", r)
    print("  zabbix:", zbx.rpc("proxy.get", {"proxyids": [aid], "output": ["operating_mode", "tls_connect", "tls_accept", "address", "allowed_addresses"]}))
    show("passive empty address", call("PUT", f"/zabbix-manage/proxies/{aid}", {"address": ""}))
    show("cert on", call("PUT", f"/zabbix-manage/proxies/{aid}", {"tls_connect": 4, "tls_issuer": "CN=CA", "tls_subject": "CN=p"}))
    show("cert off w/ issuer still sent", call("PUT", f"/zabbix-manage/proxies/{aid}", {"tls_connect": 1, "tls_issuer": "CN=CA", "tls_subject": "CN=p"}))
    print("  zabbix:", zbx.rpc("proxy.get", {"proxyids": [aid], "output": ["tls_connect", "tls_issuer", "tls_subject"]}))
    show("psk again w/o key (was off)", call("PUT", f"/zabbix-manage/proxies/{aid}", {"tls_connect": 2}))

    # --- 타임아웃·그룹
    r = call("PUT", f"/zabbix-manage/proxies/{aid}", {"custom_timeouts": 1, "timeouts": {"zabbix_agent": "7s"}})
    show("custom timeouts partial", r)
    print("  timeouts:", (r.get("data") or {}).get("timeouts"))
    show("custom 2", call("PUT", f"/zabbix-manage/proxies/{aid}", {"custom_timeouts": 2}))
    r = call("PUT", f"/zabbix-manage/proxies/{aid}", {"proxy_groupid": gid, "local_address": "10.0.0.5", "local_port": "10052"})
    show("join group", r, None)
    print("  group:", (r.get("data") or {}).get("summary", {}).get("proxyGroup"))
    show("group delete in use", call("DELETE", "/zabbix-manage/proxy-groups", {"ids": [gid]}))
    r = call("PUT", f"/zabbix-manage/proxies/{aid}", {"proxy_groupid": "0"})
    show("leave group (local_port was 10052)", r, None)
    print("  zabbix:", zbx.rpc("proxy.get", {"proxyids": [aid], "output": ["proxy_groupid", "local_address", "local_port"]}))

    # --- 삭제 사용처: 시험 호스트를 이 프록시에 붙여 본다(Zabbix 직접)
    grp = zbx.rpc("hostgroup.get", {"output": ["groupid"], "limit": 1})[0]["groupid"]
    hid = zbx.rpc("host.create", {"host": "rt-px-host", "groups": [{"groupid": grp}], "monitored_by": 1, "proxyid": aid})["hostids"][0]
    made["hosts"].append(hid)
    show("delete in use", call("DELETE", "/zabbix-manage/proxies", {"ids": [aid]}))
    zbx.rpc("host.delete", [hid]); made["hosts"].remove(hid)

    # --- 이력에 비밀값이 없는지
    print("changelog PROXY rows:", sql("select action, entity_name, left(payload::text, 160) from zabbix_change_log where entity_type in ('PROXY','PROXY_GROUP') and entity_name like 'rt-px-%' order by id"))
    print("secret leak rows:", sql(f"select count(*) from zabbix_change_log where payload::text like '%rt-secret-id%' or payload::text like '%{K}%'"))
finally:
    for h in made["hosts"]:
        print("cleanup host", zbx.rpc("host.delete", [h]))
    if made["proxies"]:
        print("cleanup proxies", call("DELETE", "/zabbix-manage/proxies", {"ids": made["proxies"]}).get("code"))
    if made["groups"]:
        print("cleanup groups", call("DELETE", "/zabbix-manage/proxy-groups", {"ids": made["groups"]}).get("code"))
    left = [p["name"] for p in call("GET", "/zabbix-manage/proxies")["data"] if p["name"].startswith("rt-px")]
    print("left:", left, "demo still:", any(p["proxyid"] == "1" for p in call("GET", "/zabbix-manage/proxies")["data"]))
