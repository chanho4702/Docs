# Zabbix 7.0 API 메서드 조사표 (ZM-159 C4)

- 출처: Zabbix 공식 문서 7.0 API 레퍼런스 · 조사일 2026-09-17 · 메서드 111개 전부 원문 확인(verified)
- 코드 정본: `moveseye-be-spring/engine-zabbix/.../client/ZabbixMethod.java`(이름·성격·링크, 버전은 `DOCS_VERSION` 한 곳)
- 기계 판독본: `engine-zabbix/src/test/resources/zabbix/api-reference-7.0.json` — `ZabbixMethodTest`가 이넘과 대조한다
- **버전을 올릴 때**: ① 새 버전 문서로 조사표(JSON)를 다시 만든다 ② `DOCS_VERSION`을 바꾼다 ③ 테스트가 알려 주는 불일치(사라진·이름 바뀐 메서드)만 고친다

## 공통 get 파라미터

출처: <https://www.zabbix.com/documentation/7.0/en/manual/api/reference_commentary#common-get-method-parameters>

`countOutput` · `editable` · `excludeSearch` · `filter` · `limit` · `output` · `preservekeys` · `search` · `searchByAny` · `searchWildcardsEnabled` · `sortfield` · `sortorder` · `startSearch`

## 문서상 주의점

- **apiinfo.version** — This method allows to retrieve the version of the Zabbix API. This method is only available to unauthenticated users and must be called without the auth parameter in the JSON-RPC request. Accepts an empty array. Returns the API version string; matches the Zabbix version since 2.0.4.
- **event.get** — This method is available to users of any type. Returns count instead of objects when countOutput is set. groupBy (possible value: objectid) returns aggregation results; with groupBy sortfield accepts objectid, with countOutput+groupBy: objectid, rowscount. problem_time_from/problem_time_till apply only when source and object are trigger; each is mandatory if the other is set. Deprecated: select_acknowledges, select_alerts.
- **history.get** — This method is available to users of any type. Returns count instead of objects when countOutput is set. history param selects value type (0 numeric float, 1 character, 2 log, 3 numeric unsigned (default), 4 text, 5 binary). May return data of deleted entities not yet removed by housekeeper. preservekeys is not listed among common params on this page.
- **history.push** — This method is available to users of any type. Zabbix web interface IP must be in the trapper item's Allowed hosts. Each entry: itemid, or host+key; value required; clock, ns optional. Returns the result of the data sending operation.
- **problem.get** — This method is available to users of any type. Returns count instead of objects when countOutput is set. Returns unresolved problems; recent=true also includes problems resolved within ok_period. Problems resolved earlier are not kept in the problem table - use event.get.
- **script.getscriptsbyhosts** — This method is available to users of any type. Read-only lookup (no state change), classified READ. Signature shows (object parameters) but page says it accepts object or array of objects (hostid required, unique). Returns object keyed by host ID with arrays of scripts; expands macros in confirmation, manualinput prompt and url.
- **trend.get** — This method is available to users of any type. Returns count instead of objects when countOutput is set. Only countOutput, limit and output are listed (no other common get params); sortfield not documented. sortfield not documented on this page.

## 메서드별

| 메서드 | 성격 | 문서 | 기간 파라미터 | id 범위 | 정렬 가능 필드 | id 필터 파라미터 |
|---|---|---|---|---|---|---|
| `action.create` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/action/create) | — | — | — | — |
| `action.delete` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/action/delete) | — | — | — | — |
| `action.get` | READ | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/action/get) | — | — | actionid, name, status | actionids, groupids, hostids, triggerids, mediatypeids, usrgrpids, userids, scriptids |
| `action.update` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/action/update) | — | — | — | — |
| `apiinfo.version` | INFO | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/apiinfo/version) | — | — | — | — |
| `dhost.get` | READ | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/dhost/get) | — | — | dhostid, druleid | dhostids, druleids, dserviceids |
| `discoveryrule.create` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/discoveryrule/create) | — | — | — | — |
| `discoveryrule.delete` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/discoveryrule/delete) | — | — | — | — |
| `discoveryrule.get` | READ | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/discoveryrule/get) | — | — | itemid, name, key_, delay, type, status | itemids, groupids, hostids, interfaceids, templateids |
| `discoveryrule.update` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/discoveryrule/update) | — | — | — | — |
| `drule.create` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/drule/create) | — | — | — | — |
| `drule.delete` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/drule/delete) | — | — | — | — |
| `drule.get` | READ | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/drule/get) | — | — | druleid, name | dhostids, druleids, dserviceids |
| `drule.update` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/drule/update) | — | — | — | — |
| `dservice.get` | READ | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/dservice/get) | — | — | dserviceid, dhostid, ip | dserviceids, dhostids, dcheckids, druleids |
| `event.acknowledge` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/event/acknowledge) | — | — | — | eventids |
| `event.get` | READ | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/event/get) | time_from, time_till, problem_time_from, problem_time_till | eventid_from, eventid_till | eventid, objectid, clock | eventids, groupids, hostids, objectids, action_userids |
| `graph.get` | READ | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/graph/get) | — | — | graphid, name, graphtype | graphids, groupids, templateids, hostids, itemids |
| `graphprototype.create` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/graphprototype/create) | — | — | — | — |
| `graphprototype.delete` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/graphprototype/delete) | — | — | — | — |
| `graphprototype.get` | READ | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/graphprototype/get) | — | — | graphid, name, graphtype, discovered | discoveryids, graphids, groupids, hostids, itemids, templateids |
| `graphprototype.update` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/graphprototype/update) | — | — | — | — |
| `history.get` | READ | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/history/get) | time_from, time_till | — | itemid, clock, ns | hostids, itemids |
| `history.push` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/history/push) | — | — | — | — |
| `host.create` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/host/create) | — | — | — | — |
| `host.delete` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/host/delete) | — | — | — | — |
| `host.get` | READ | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/host/get) | — | — | hostid, host, name, status | groupids, dserviceids, graphids, hostids, httptestids, interfaceids, itemids, maintenanceids, proxyids, proxy_groupids, templateids, triggerids |
| `host.massadd` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/host/massadd) | — | — | — | — |
| `host.massremove` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/host/massremove) | — | — | — | hostids, groupids, templateids, templateids_clear |
| `host.update` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/host/update) | — | — | — | — |
| `hostgroup.create` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/hostgroup/create) | — | — | — | — |
| `hostgroup.delete` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/hostgroup/delete) | — | — | — | — |
| `hostgroup.get` | READ | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/hostgroup/get) | — | — | groupid, name | graphids, groupids, hostids, maintenanceids, triggerids |
| `hostgroup.massadd` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/hostgroup/massadd) | — | — | — | — |
| `hostgroup.massupdate` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/hostgroup/massupdate) | — | — | — | — |
| `hostgroup.update` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/hostgroup/update) | — | — | — | — |
| `hostprototype.create` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/hostprototype/create) | — | — | — | — |
| `hostprototype.delete` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/hostprototype/delete) | — | — | — | — |
| `hostprototype.get` | READ | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/hostprototype/get) | — | — | hostid, host, name, status, discovered | hostids, discoveryids |
| `hostprototype.update` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/hostprototype/update) | — | — | — | — |
| `httptest.create` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/httptest/create) | — | — | — | — |
| `httptest.delete` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/httptest/delete) | — | — | — | — |
| `httptest.get` | READ | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/httptest/get) | — | — | httptestid, name | groupids, hostids, httptestids, templateids |
| `httptest.update` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/httptest/update) | — | — | — | — |
| `item.create` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/item/create) | — | — | — | — |
| `item.delete` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/item/delete) | — | — | — | — |
| `item.get` | READ | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/item/get) | — | — | itemid, name, key_, delay, history, trends, type, status | itemids, groupids, templateids, hostids, proxyids, interfaceids, graphids, triggerids |
| `item.update` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/item/update) | — | — | — | — |
| `itemprototype.create` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/itemprototype/create) | — | — | — | — |
| `itemprototype.delete` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/itemprototype/delete) | — | — | — | — |
| `itemprototype.get` | READ | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/itemprototype/get) | — | — | itemid, name, key_, delay, type, status, history, trends, discovered | discoveryids, graphids, hostids, itemids, templateids, triggerids |
| `itemprototype.update` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/itemprototype/update) | — | — | — | — |
| `maintenance.create` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/maintenance/create) | — | — | — | — |
| `maintenance.delete` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/maintenance/delete) | — | — | — | — |
| `maintenance.get` | READ | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/maintenance/get) | — | — | maintenanceid, name, maintenance_type, active_since, active_till | groupids, hostids, maintenanceids |
| `maintenance.update` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/maintenance/update) | — | — | — | — |
| `mediatype.create` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/mediatype/create) | — | — | — | — |
| `mediatype.delete` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/mediatype/delete) | — | — | — | — |
| `mediatype.get` | READ | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/mediatype/get) | — | — | mediatypeid | mediatypeids, mediaids, userids |
| `mediatype.update` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/mediatype/update) | — | — | — | — |
| `problem.get` | READ | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/problem/get) | time_from, time_till | eventid_from, eventid_till | eventid | eventids, groupids, hostids, objectids, action_userids |
| `proxy.get` | READ | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/proxy/get) | — | — | proxyid, name, operating_mode | proxyids, proxy_groupids |
| `role.create` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/role/create) | — | — | — | — |
| `role.delete` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/role/delete) | — | — | — | — |
| `role.get` | READ | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/role/get) | — | — | roleid, name | roleids |
| `role.update` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/role/update) | — | — | — | — |
| `script.create` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/script/create) | — | — | — | — |
| `script.delete` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/script/delete) | — | — | — | — |
| `script.execute` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/script/execute) | — | — | — | — |
| `script.get` | READ | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/script/get) | — | — | scriptid, name | groupids, hostids, scriptids, usrgrpids |
| `script.getscriptsbyhosts` | READ | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/script/getscriptsbyhosts) | — | — | — | — |
| `script.update` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/script/update) | — | — | — | — |
| `task.create` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/task/create) | — | — | — | — |
| `template.create` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/template/create) | — | — | — | — |
| `template.delete` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/template/delete) | — | — | — | — |
| `template.get` | READ | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/template/get) | — | — | hostid, host, name, status | templateids, groupids, parentTemplateids, hostids, graphids, itemids, triggerids |
| `template.update` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/template/update) | — | — | — | — |
| `templategroup.create` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/templategroup/create) | — | — | — | — |
| `templategroup.delete` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/templategroup/delete) | — | — | — | — |
| `templategroup.get` | READ | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/templategroup/get) | — | — | groupid, name | graphids, groupids, templateids, triggerids |
| `templategroup.update` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/templategroup/update) | — | — | — | — |
| `token.create` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/token/create) | — | — | — | — |
| `token.delete` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/token/delete) | — | — | — | — |
| `token.generate` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/token/generate) | — | — | — | — |
| `token.get` | READ | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/token/get) | valid_at, expired_at | — | tokenid, name, lastaccess, status, expires_at, created_at | tokenids, userids |
| `trend.get` | READ | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/trend/get) | time_from, time_till | — | — | itemids |
| `trigger.create` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/trigger/create) | — | — | — | — |
| `trigger.delete` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/trigger/delete) | — | — | — | — |
| `trigger.get` | READ | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/trigger/get) | lastChangeSince, lastChangeTill | — | triggerid, description, status, priority, lastchange, hostname | triggerids, groupids, templateids, hostids, itemids |
| `trigger.update` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/trigger/update) | — | — | — | — |
| `triggerprototype.create` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/triggerprototype/create) | — | — | — | — |
| `triggerprototype.delete` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/triggerprototype/delete) | — | — | — | — |
| `triggerprototype.get` | READ | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/triggerprototype/get) | — | — | triggerid, description, status, priority, discovered | discoveryids, groupids, hostids, templateids, triggerids |
| `triggerprototype.update` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/triggerprototype/update) | — | — | — | — |
| `user.create` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/user/create) | — | — | — | — |
| `user.delete` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/user/delete) | — | — | — | — |
| `user.get` | READ | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/user/get) | — | — | userid, username | mediaids, mediatypeids, userids, usrgrpids |
| `user.login` | AUTH | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/user/login) | — | — | — | — |
| `user.logout` | AUTH | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/user/logout) | — | — | — | — |
| `user.update` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/user/update) | — | — | — | — |
| `usergroup.create` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/usergroup/create) | — | — | — | — |
| `usergroup.delete` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/usergroup/delete) | — | — | — | — |
| `usergroup.get` | READ | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/usergroup/get) | — | — | usrgrpid, name | mfaids, userids, usrgrpids |
| `usergroup.update` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/usergroup/update) | — | — | — | — |
| `usermacro.create` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/usermacro/create) | — | — | — | — |
| `usermacro.createglobal` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/usermacro/createglobal) | — | — | — | — |
| `usermacro.delete` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/usermacro/delete) | — | — | — | — |
| `usermacro.deleteglobal` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/usermacro/deleteglobal) | — | — | — | — |
| `usermacro.get` | READ | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/usermacro/get) | — | — | macro | globalmacroids, groupids, hostids, hostmacroids |
| `usermacro.update` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/usermacro/update) | — | — | — | — |
| `usermacro.updateglobal` | WRITE | [문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/usermacro/updateglobal) | — | — | — | — |

## get 메서드 파라미터 전체

- **`action.get`** ([문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/action/get)): `actionids` `groupids` `hostids` `triggerids` `mediatypeids` `usrgrpids` `userids` `scriptids` `selectFilter` `selectOperations` `selectRecoveryOperations` `selectUpdateOperations`
- **`dhost.get`** ([문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/dhost/get)): `dhostids` `druleids` `dserviceids` `selectDRules` `selectDServices` `limitSelects`
- **`discoveryrule.get`** ([문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/discoveryrule/get)): `itemids` `groupids` `hostids` `inherited` `interfaceids` `monitored` `templated` `templateids` `selectFilter` `selectGraphs` `selectHostPrototypes` `selectHosts` `selectItems` `selectTriggers` `selectLLDMacroPaths` `selectPreprocessing` `selectOverrides` `limitSelects`
- **`drule.get`** ([문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/drule/get)): `dhostids` `druleids` `dserviceids` `selectDChecks` `selectDHosts` `limitSelects`
- **`dservice.get`** ([문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/dservice/get)): `dserviceids` `dhostids` `dcheckids` `druleids` `selectDRules` `selectDHosts` `selectHosts` `limitSelects`
- **`event.get`** ([문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/event/get)): `eventids` `groupids` `hostids` `objectids` `source` `object` `acknowledged` `action` `action_userids` `suppressed` `symptom` `severities` `trigger_severities` `evaltype` `tags` `eventid_from` `eventid_till` `time_from` `time_till` `problem_time_from` `problem_time_till` `value` `selectAcknowledges` `selectAlerts` `selectHosts` `selectRelatedObject` `selectSuppressionData` `selectTags` `groupBy` · 폐기 예정: `select_acknowledges`, `select_alerts`
- **`graph.get`** ([문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/graph/get)): `graphids` `groupids` `templateids` `hostids` `itemids` `templated` `inherited` `expandName` `selectHostGroups` `selectTemplateGroups` `selectTemplates` `selectHosts` `selectItems` `selectGraphDiscovery` `selectGraphItems` `selectDiscoveryRule` · 폐기 예정: `selectGroups`
- **`graphprototype.get`** ([문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/graphprototype/get)): `discoveryids` `graphids` `groupids` `hostids` `inherited` `itemids` `templated` `templateids` `selectDiscoveryRule` `selectGraphItems` `selectHostGroups` `selectHosts` `selectItems` `selectTemplateGroups` `selectTemplates` · 폐기 예정: `selectGroups`
- **`history.get`** ([문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/history/get)): `history` `hostids` `itemids` `time_from` `time_till`
- **`host.get`** ([문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/host/get)): `groupids` `dserviceids` `graphids` `hostids` `httptestids` `interfaceids` `itemids` `maintenanceids` `monitored_hosts` `proxyids` `proxy_groupids` `templated_hosts` `templateids` `triggerids` `with_items` `with_item_prototypes` `with_simple_graph_item_prototypes` `with_graphs` `with_graph_prototypes` `with_httptests` `with_monitored_httptests` `with_monitored_items` `with_monitored_triggers` `with_simple_graph_items` `with_triggers` `withProblemsSuppressed` `evaltype` `severities` `tags` `inheritedTags` `selectDiscoveries` `selectDiscoveryRule` `selectGraphs` `selectHostDiscovery` `selectHostGroups` `selectHttpTests` `selectInterfaces` `selectInventory` `selectItems` `selectMacros` `selectParentTemplates` `selectDashboards` `selectTags` `selectInheritedTags` `selectTriggers` `selectValueMaps` `limitSelects` `searchInventory` · 폐기 예정: `selectGroups`
- **`hostgroup.get`** ([문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/hostgroup/get)): `graphids` `groupids` `hostids` `maintenanceids` `triggerids` `with_graphs` `with_graph_prototypes` `with_hosts` `with_httptests` `with_items` `with_item_prototypes` `with_simple_graph_item_prototypes` `with_monitored_httptests` `with_monitored_hosts` `with_monitored_items` `with_monitored_triggers` `with_simple_graph_items` `with_triggers` `selectDiscoveryRules` `selectGroupDiscoveries` `selectHostPrototypes` `selectHosts` `limitSelects` · 폐기 예정: `monitored_hosts`, `real_hosts`
- **`hostprototype.get`** ([문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/hostprototype/get)): `hostids` `discoveryids` `inherited` `selectDiscoveryRule` `selectInterfaces` `selectGroupLinks` `selectGroupPrototypes` `selectMacros` `selectParentHost` `selectTags` `selectTemplates`
- **`httptest.get`** ([문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/httptest/get)): `groupids` `hostids` `httptestids` `inherited` `monitored` `templated` `templateids` `expandName` `expandStepName` `evaltype` `tags` `selectHosts` `selectSteps` `selectTags`
- **`item.get`** ([문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/item/get)): `itemids` `groupids` `templateids` `hostids` `proxyids` `interfaceids` `graphids` `triggerids` `webitems` `inherited` `templated` `monitored` `group` `host` `evaltype` `tags` `with_triggers` `selectHosts` `selectInterfaces` `selectTriggers` `selectGraphs` `selectDiscoveryRule` `selectItemDiscovery` `selectPreprocessing` `selectTags` `selectValueMap` `limitSelects`
- **`itemprototype.get`** ([문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/itemprototype/get)): `discoveryids` `graphids` `hostids` `inherited` `itemids` `monitored` `templated` `templateids` `triggerids` `selectDiscoveryRule` `selectGraphs` `selectHosts` `selectTags` `selectTriggers` `selectPreprocessing` `selectValueMap` `limitSelects`
- **`maintenance.get`** ([문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/maintenance/get)): `groupids` `hostids` `maintenanceids` `selectHostGroups` `selectHosts` `selectTags` `selectTimeperiods` · 폐기 예정: `selectGroups`
- **`mediatype.get`** ([문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/mediatype/get)): `mediatypeids` `mediaids` `userids` `selectActions` `selectMessageTemplates` `selectUsers`
- **`problem.get`** ([문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/problem/get)): `eventids` `groupids` `hostids` `objectids` `source` `object` `acknowledged` `action` `action_userids` `suppressed` `symptom` `severities` `evaltype` `tags` `recent` `eventid_from` `eventid_till` `time_from` `time_till` `selectAcknowledges` `selectTags` `selectSuppressionData`
- **`proxy.get`** ([문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/proxy/get)): `proxyids` `proxy_groupids` `selectAssignedHosts` `selectHosts` `selectProxyGroup`
- **`role.get`** ([문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/role/get)): `roleids` `selectRules` `selectUsers`
- **`script.get`** ([문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/script/get)): `groupids` `hostids` `scriptids` `usrgrpids` `selectHostGroups` `selectHosts` `selectActions` · 폐기 예정: `selectGroups`
- **`script.getscriptsbyhosts`** ([문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/script/getscriptsbyhosts)): `hostid` `scriptid` `manualinput`
- **`template.get`** ([문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/template/get)): `templateids` `groupids` `parentTemplateids` `hostids` `graphids` `itemids` `triggerids` `with_items` `with_triggers` `with_graphs` `with_httptests` `evaltype` `tags` `selectTags` `selectHosts` `selectTemplateGroups` `selectTemplates` `selectParentTemplates` `selectHttpTests` `selectItems` `selectDiscoveries` `selectTriggers` `selectGraphs` `selectMacros` `selectDashboards` `selectValueMaps` `limitSelects` · 폐기 예정: `selectGroups`
- **`templategroup.get`** ([문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/templategroup/get)): `graphids` `groupids` `templateids` `triggerids` `with_graphs` `with_graph_prototypes` `with_httptests` `with_items` `with_item_prototypes` `with_simple_graph_item_prototypes` `with_simple_graph_items` `with_templates` `with_triggers` `selectTemplates` `limitSelects`
- **`token.get`** ([문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/token/get)): `tokenids` `userids` `token` `valid_at` `expired_at`
- **`trend.get`** ([문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/trend/get)): `itemids` `time_from` `time_till`
- **`trigger.get`** ([문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/trigger/get)): `triggerids` `groupids` `templateids` `hostids` `itemids` `functions` `group` `host` `inherited` `templated` `dependent` `monitored` `active` `maintenance` `withUnacknowledgedEvents` `withAcknowledgedEvents` `withLastEventUnacknowledged` `skipDependent` `lastChangeSince` `lastChangeTill` `only_true` `min_severity` `evaltype` `tags` `expandComment` `expandDescription` `expandExpression` `selectHostGroups` `selectHosts` `selectItems` `selectFunctions` `selectDependencies` `selectDiscoveryRule` `selectLastEvent` `selectTags` `selectTemplateGroups` `selectTriggerDiscovery` `limitSelects` · 폐기 예정: `selectGroups`
- **`triggerprototype.get`** ([문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/triggerprototype/get)): `active` `discoveryids` `functions` `group` `groupids` `host` `hostids` `inherited` `maintenance` `min_severity` `monitored` `templated` `templateids` `triggerids` `expandExpression` `selectDependencies` `selectDiscoveryRule` `selectFunctions` `selectHostGroups` `selectHosts` `selectItems` `selectTags` `selectTemplateGroups` `limitSelects` · 폐기 예정: `selectGroups`
- **`user.get`** ([문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/user/get)): `mediaids` `mediatypeids` `userids` `usrgrpids` `getAccess` `selectMedias` `selectMediatypes` `selectUsrgrps` `selectRole`
- **`usergroup.get`** ([문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/usergroup/get)): `mfaids` `mfa_status` `status` `userids` `usrgrpids` `selectTagFilters` `selectUsers` `selectHostGroupRights` `selectTemplateGroupRights` `limitSelects` · 폐기 예정: `selectRights`
- **`usermacro.get`** ([문서](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/usermacro/get)): `globalmacro` `globalmacroids` `groupids` `hostids` `hostmacroids` `inherited` `selectHostGroups` `selectHosts` `selectTemplateGroups` `selectTemplates` · 폐기 예정: `selectGroups`
