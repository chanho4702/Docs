# 계약 — 프록시·프록시 그룹 관리 (Zabbix 관리 > 프록시)

- 작성 2026-10-28 · BE 워크트리 `C:\worktrees\zbx-proxy-be`(브랜치 `zabbix-proxy`) · FE 같은 이름(`C:\worktrees\zbx-proxy-fe`)
- Zabbix 7.0 `proxy.*`·`proxygroup.*` 래핑. Zabbix UI의 Administration › Proxies / Proxy groups에 해당한다.
- **기본 기능**(라이선스 Feature 없음 — 사용자 결정 2026-10-28). 전 EP **관리자 전용**(`AdminAccessChecker.requireAdmin`).
- 로컬 저장 없음, 서비스 계정 토큰, 쓰기는 `zabbix_change_log`(entityType `PROXY`·`PROXY_GROUP`) — 이력 적재가 구성 현황 캐시도 지운다(`OverviewCacheInvalidator`).
- 🔴 **감시 호스트 배정은 이 화면에서 바꾸지 않는다**(보기만 — 사용자 결정). 배정은 호스트 관리의 `monitored_by`.
- 🔴 dev Zabbix의 `ZabbixProxyDemo`(proxyid 1)는 호스트 수십 대를 실제로 감시 중 — 실측은 시험용 프록시만 만들고 지운다.

## 0. Zabbix 7.0.6 실측(2026-10-28, 시험 객체로)

| 항목 | 결과 |
|---|---|
| 그룹 소속 프록시 | `local_address` 필수(`the parameter "local_address" is missing`). 그룹 없으면 `local_port`는 `10051`만 |
| 이름 중복 | `Proxy "x" already exists.` |
| PSK 읽기 | `tls_psk_identity`·`tls_psk`는 **get에 안 나온다**(output에 넣으면 -32602) — 쓰기 전용 |
| PSK 유지 | 결과 TLS가 계속 PSK면 유지(🔴 **모드를 바꿔도** 한 요청에서 새 모드의 PSK를 함께 켜면 유지). 🔴 **결과 TLS에서 PSK가 빠지면 Zabbix가 PSK를 지운다** — 모드만 보내 결과가 "없음"이 된 경우 포함. 다시 켤 때 `tls_psk_identity cannot be empty` |
| PSK 길이 | 32자 미만 거부 |
| 모드별 TLS | 액티브: `tls_connect`는 1만, `tls_accept` 비트(1·2·4). 패시브: `tls_accept`는 1만, `tls_connect` 1·2·4 |
| 모드 전환 | Zabbix가 반대편 필드를 스스로 초기화(패시브→액티브: `tls_connect=1`·주소 기본값, 액티브→패시브: `allowed_addresses` 비움). 새 모드의 TLS를 안 보내면 "없음" — 🔴 암호화가 조용히 꺼진다 |
| 인증서 필드 | 인증서를 안 쓰는데 `tls_issuer`·`tls_subject`가 비어 있지 않으면 `value must be empty`. 안 보내면 Zabbix가 비운다 |
| 값 범위 | `custom_timeouts`는 0·1만(`value must be one of 0, 1`), 패시브 `address` 빈 값은 `cannot be empty` |
| 사용자 지정 타임아웃 | `custom_timeouts=1`이면 **10개 전부** 필수(하나라도 비면 `timeout_x cannot be empty`), 범위 1~600초. `0`이면 전부 빈 값 |
| 그룹 값 범위 | `min_online` 1~1000, `failover_delay` 10~900초 |
| 삭제 거부 | 프록시: `Host "h" is monitored by proxy "p".` · 그룹: `Proxy group "g" is used by proxy "p".` / `Host "h" is monitored by proxy group "g".` |
| 그룹 생성 | `proxies` 인자 없음 — 소속은 프록시 쪽 `proxy_groupid`로만 |
| 개수 | `proxy.get selectHosts:"count"`·`selectAssignedHosts:"count"`, `proxygroup.get selectProxies:"count"` 동작 |
| `version` | 정수 `70013` = 7.0.13, 0 = 모름 |

## 1. GET `/zabbix-manage/proxies` — 목록

전체 목록(페이지 없음 — 프록시는 수십 대 규모, 화면이 거른다). 이름순.

```json
{ "proxyid": "1", "name": "ZabbixProxyDemo", "operatingMode": 0,
  "proxyGroup": { "id": "1", "name": "Proxy Group" },
  "address": "127.0.0.1", "port": "10051", "allowedAddresses": "211.109.91.246",
  "localAddress": "", "localPort": "10051", "description": "",
  "state": "OFFLINE", "lastAccess": 1790846907, "version": "7.0.13", "compatibility": "CURRENT",
  "hostCount": 41, "assignedHostCount": 0,
  "tlsConnect": 1, "tlsAccept": 1, "pskConfigured": false, "customTimeouts": true }
```
- `operatingMode`: 0 액티브 · 1 패시브. `proxyGroup`은 소속 없으면 null.
- `state`: `UNKNOWN`(0) · `OFFLINE`(1) · `ONLINE`(2). `lastAccess`는 0이면 null(epoch 초).
- `version`: `70013` → `"7.0.13"`, 0이면 null. `compatibility`: `UNDEFINED`(0) · `CURRENT`(1) · `OUTDATED`(2) · `UNSUPPORTED`(3).
- `hostCount` = 이 프록시에 직접 배정된 호스트(`monitored_by=1`), `assignedHostCount` = 그룹을 통해 지금 이 프록시가 맡은 호스트.
- `pskConfigured` = 현재 PSK 비트가 켜짐(액티브 `tlsAccept & 2`, 패시브 `tlsConnect == 2`). Zabbix는 PSK 값을 돌려주지 않으므로 "켜져 있으면 저장돼 있다"로 판정한다(켤 때 둘 다 필수라서).

## 2. GET `/zabbix-manage/proxies/{proxyid}` — 상세

목록 행(`summary`) + 편집 프리필 + 사용처:
```json
{ "summary": { "...목록 행": "" },
  "tlsIssuer": "", "tlsSubject": "",
  "timeouts": { "zabbix_agent": "20s", "simple_check": "3s", "snmp_agent": "3s", "external_check": "3s",
                "db_monitor": "3s", "http_agent": "10s", "ssh_agent": "3s", "telnet_agent": "3s",
                "script": "3s", "browser": "60s" },
  "hosts": [{ "hostid": "10644", "name": "10.220.0.73" }], "assignedHosts": [],
  "hostsTruncated": false, "discoveryRules": [{ "druleid": "3", "name": "10-220-VMs" }] }
```
- `timeouts`: `customTimeouts=false`면 빈 값 그대로(전역 값은 §5 옵션에서).
- `hosts`·`assignedHosts`: 이름순, 각 최대 500건(넘으면 `hostsTruncated=true`, 개수는 `summary`가 정본).
- `discoveryRules`: 이 프록시로 도는 네트워크 디스커버리 규칙(`drule.get` `proxyid`) — 삭제 판정에도 쓴다.
- 없으면 `PROXY_NOT_FOUND`.

## 3. POST `/zabbix-manage/proxies` · PUT `/zabbix-manage/proxies/{proxyid}`

요청은 Zabbix 원본 키(snake):
```json
{ "name": "proxy-seoul", "operating_mode": 0, "description": "",
  "proxy_groupid": "0", "local_address": "", "local_port": "10051",
  "allowed_addresses": "10.0.0.5", "address": "127.0.0.1", "port": "10051",
  "tls_connect": 1, "tls_accept": 2, "tls_issuer": "", "tls_subject": "",
  "tls_psk_identity": "", "tls_psk": "",
  "custom_timeouts": 1, "timeouts": { "zabbix_agent": "5s", "...": "" } }
```
- 생성: `name`·`operating_mode` 필수(`PROXY_NAME_REQUIRED`·`PROXY_MODE_INVALID`). 응답 = 생성 직후 상세.
- 수정: **보낸 필드만**. 응답 = 수정 직후 상세.
- 🔴 **모드별 정규화**(BE): 결과 모드가 액티브면 `tls_connect=1`, 패시브면 `tls_accept=1`을 함께 보낸다 — 폼이 반대편 값을 남겨 보내도 Zabbix 거부(`value must be 1`)가 나지 않게. 액티브에서 `address`·`port`, 패시브에서 `allowed_addresses`는 버린다.
- 🔴 **모드 전환**: 지금 암호화(PSK·인증서)를 쓰는 프록시의 모드를 바꾸면서 새 모드의 TLS(액티브 `tls_accept`/패시브 `tls_connect`)를 안 보내면 `PROXY_TLS_REQUIRED` — 생략하면 "없음"으로 저장돼 암호화가 조용히 꺼진다.
- 🔴 **PSK**: `tls_psk_identity`·`tls_psk`는 **비우면 유지, 채우면 교체**. 결과 TLS가 PSK를 쓰는데 지금 PSK가 없는 상태(새로 만듦·PSK가 꺼져 있었음)면 둘 다 필수 → 없으면 `PROXY_PSK_REQUIRED`. 지금 PSK를 쓰는 중이면 모드를 바꿔도 결과가 PSK인 한 유지된다(실측). 32자·16진 검사는 Zabbix 원문.
- 인증서: 결과 TLS가 인증서를 안 쓰면 `tls_issuer`·`tls_subject`를 보내지 않는다(Zabbix가 비운다).
- 빈 값: 생성은 빈 `address`·`port`·`local_port`를 생략(기본값), **수정은 보낸 빈 값을 그대로** 보내 Zabbix가 원문으로 거부하게 한다(조용히 "유지"로 바꾸지 않음). `custom_timeouts`도 받은 값 그대로(0·1 밖은 Zabbix 거부).
- 그룹: `proxy_groupid`가 `"0"`이 아니면 `local_address` 필수 → `PROXY_LOCAL_ADDRESS_REQUIRED`(현재 값이 있으면 통과). `"0"`으로 빼면 `local_address`·`local_port`는 보내지 않는다(Zabbix가 기본값으로).
- 타임아웃: `custom_timeouts=1`이면 `timeouts` 10개를 `timeout_*`로 보낸다. 🔴 **빠진 키는 현재 값 → 전역 값 순으로 채운다**(Zabbix가 10개 전부를 요구). `0`이면 `timeouts`는 무시.
- 오류: `PROXY_NAME_REQUIRED` · `PROXY_MODE_INVALID` · `PROXY_TLS_REQUIRED` · `PROXY_PSK_REQUIRED` · `PROXY_LOCAL_ADDRESS_REQUIRED` · `PROXY_NOT_FOUND` · `PROXY_CREATE_FAILED`. 그 밖(이름 중복·주소 형식·범위)은 Zabbix 원문.
- 🔴 변경 이력 payload에 **PSK 값을 남기지 않는다**: `tls_psk_identity`·`tls_psk`는 보냈으면 `"***"`. 나머지는 보낸 스칼라 그대로.

## 4. DELETE `/zabbix-manage/proxies`

본문 `{ "ids": ["2"] }` → `{ "ids": [...], "count": n }`. 빈 목록 `PROXY_IDS_REQUIRED`, 없는 id 포함 `PROXY_NOT_FOUND`.
🔴 사용 중이면 **하나도 지우지 않고** `PROXY_IN_USE: 프록시 ← 호스트 41개(a, b, c 외), 디스커버리 규칙 10-220-VMs, 액션 Auto registration / …`(호스트 이름은 3개까지). 사용처 = 직접 감시 호스트 · 네트워크 디스커버리 규칙 · 액션의 프록시 조건(conditiontype 20). 그룹을 통해 맡은 호스트(`assignedHosts`)는 막지 않는다 — 그룹이 다른 프록시로 넘긴다.

## 5. GET `/zabbix-manage/proxies/options`

```json
{ "proxyGroups": [{ "id": "1", "name": "Proxy Group" }],
  "globalTimeouts": { "zabbix_agent": "3s", "...": "" } }
```
- `globalTimeouts` = `settings.get`의 `timeout_*`(사용자 지정을 켤 때 폼 기본값). 실패하면 빈 객체 + 경고 로그(폼은 빈 칸).

## 6. 프록시 그룹 — `/zabbix-manage/proxy-groups`

- GET 목록(이름순, 전체):
```json
{ "proxyGroupId": "1", "name": "Proxy Group", "failoverDelay": "1m", "minOnline": "1", "description": "",
  "state": "OFFLINE", "proxyCount": 0, "onlineProxyCount": 0, "hostCount": 0,
  "proxies": [{ "proxyid": "1", "name": "ZabbixProxyDemo", "state": "OFFLINE" }] }
```
  - `state`: `UNKNOWN`(0) · `OFFLINE`(1) · `RECOVERING`(2) · `ONLINE`(3) · `DEGRADING`(4).
  - `hostCount` = 이 그룹에 배정된 호스트(`monitored_by=2`, `host.get proxy_groupids` countOutput — 그룹마다 한 번).
- GET `/{proxyGroupId}` 상세: 목록 행 + `hosts`(이름순 최대 500, `hostsTruncated`). 없으면 `PROXY_GROUP_NOT_FOUND`.
- POST · PUT: `{ "name", "failover_delay", "min_online", "description" }` — 생성은 `name` 필수(`PROXY_GROUP_NAME_REQUIRED`), 빈 지연·최소 온라인은 생략(기본값). 수정은 보낸 것만이고 보낸 빈 값은 그대로(Zabbix 거부). 범위·형식은 Zabbix 원문. 소속 프록시는 이 폼에서 바꾸지 않는다(프록시 폼의 그룹 선택 — Zabbix도 그렇다).
- DELETE `{ "ids": [...] }`: 빈 목록 `PROXY_GROUP_IDS_REQUIRED`, 없는 id `PROXY_GROUP_NOT_FOUND`, 프록시나 호스트가 있으면 하나도 지우지 않고 `PROXY_GROUP_IN_USE: 그룹 ← 프록시 a, b · 호스트 n개 / …`.

## 7. FE

- 경로 `/zabbix-management/proxy-management`, Zabbix 관리 메뉴 항목 "프록시". 탭 두 개: **프록시** · **프록시 그룹**(URL `?tab=groups`).
- 프록시 탭: 검색(이름·주소) · 모드 · 상태 · 그룹 필터(화면 거름). 열: 이름 · 모드 · 상태 배지(+마지막 접속 상대 시각) · 버전(호환성 경고 배지) · 그룹 · 주소(액티브=허용 주소, 패시브=주소:포트) · 호스트 수 · 암호화. 다건 삭제.
- 프록시 패널(`ResizableDrawer`): 기본(이름·모드·주소·그룹·로컬 주소/포트·설명) / 암호화(모드별 — 액티브=받을 방식 다중 선택, 패시브=연결 방식 하나, PSK 식별자·값(비우면 유지, 꺼져 있었으면 필수 안내), 인증서 발급자·주체) / 타임아웃(사용자 지정 켜면 전역 값으로 채움) / 사용처(감시 호스트·그룹 경유 호스트·디스커버리 규칙 — 읽기 전용, 호스트 이름은 호스트 상세로 링크).
- 그룹 탭: 열 이름 · 상태 · 프록시(온라인/전체) · 최소 온라인 · 장애 조치 지연 · 호스트 수. 패널: 이름·지연·최소 온라인·설명 + 소속 프록시·호스트(읽기 전용).
- 삭제 확인창은 사용 중 거부 사유를 그대로 보여 준다.
