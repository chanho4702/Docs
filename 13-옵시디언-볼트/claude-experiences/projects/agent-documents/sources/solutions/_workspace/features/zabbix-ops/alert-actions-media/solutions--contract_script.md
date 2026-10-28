# API 계약서 — 스크립트(Scripts) 관리·실행

> **산출 기준**: BE 소스(`zabbixadmin/ZabbixScriptManageController` · `ZabbixScriptManageService`, 2026-08-19) + Zabbix 7.0.6 실측.
> Zabbix UI: Alerts › Scripts + 호스트/이벤트 컨텍스트 메뉴 › Scripts.

베이스 `/zabbix-manage/scripts`. **전 EP 관리자 전용**. 에러 200 + body code. Flyway 변경 없음.

**이 계층이 얹는 것**: 사용 액션 이름(삭제 가능 여부·`SCRIPT_IN_USE: 스크립트 ← 액션들`) · 그룹/사용자그룹 이름 조인 · 비밀값(`password`/`privatekey`) 응답 제거+비우면 유지 · 실행 결과 정규화 + 흔한 실패 안내(`hint`) · 실행 감사(EXECUTE) · 호스트에서 실행 가능한 스크립트 목록.

## 실측 함정(7.0.6)
- 🔴 `script.getscriptsbyhosts` 인자는 **`{hostid: "…"}` 객체** — 배열 그대로("an array is expected")도 `{hostids:[…]}`("unexpected parameter")도 거부.
- 🔴 `timeout`은 **Webhook(type 5)만** 수정 가능 — 다른 유형은 "value must be 30s" → BE가 벗긴다, 폼도 Webhook에서만 노출.
- 에이전트 실행(execute_on 0)은 대상 에이전트에 `EnableRemoteCommands=1`(agent) / `AllowKey=system.run[*]`(agent2)가 없으면 "Remote commands are not enabled" → `hint`로 안내. 서버 실행(1)은 그대로 됨.
- `selectHostGroups`는 "실행 허용 그룹"이 아니라 접근 가능한 전체 그룹을 돌려준다 — 허용 그룹은 `groupid`("0"=전체).

## shape
```ts
ManagedScript { scriptid; name; scope: 1|2|4; type: 0|1|2|3|5|6; executeOn: 0|1|2; command; url; menuPath; description; confirmation; timeout;
  hostGroup: {id,name}|null(전체); userGroup: {id,name}|null(전체); hostAccess: 2|3; parameters: [{name,value}]; usedByActions: string[]; raw }
ScriptUpsertReq { name; scope; type; executeOn; command; url; newWindow; menuPath; description; confirmation; timeout; groupId("0"=전체); usrgrpId; hostAccess;
  parameters; port; authtype; username; password; publickey; privatekey; extra }
ScriptExecuteReq { hostid? | eventid?; manualinput? }  → ScriptExecuteRes { success; output; hint|null }
HostScript { scriptid; name; menuPath; confirmation; description; type; manualinput; manualinputPrompt; manualinputDefault }
```
scope: 1 액션 오퍼레이션 · 2 호스트 수동 · 4 이벤트 수동. type: 0 스크립트 1 IPMI 2 SSH 3 Telnet 5 Webhook 6 URL. execute_on: 0 에이전트 1 서버 2 서버(프록시).

| EP | 비고 |
|---|---|
| `GET /` | 전체(이름순) + usedByActions + raw(비밀값 제거) |
| `GET /hosts/{hostid}` | 이 호스트에서 지금 실행 가능한 scope 2 스크립트(메뉴 경로·이름 순) |
| `GET /{id}` · `POST /` · `PUT /{id}` | 생성 필수 name·scope·type + 본문(URL 유형은 url, 나머지 command). 스크립트 유형 execute_on 기본 2. `SCRIPT_NAME_REQUIRED` · `SCRIPT_COMMAND_REQUIRED: command|url` |
| `DELETE /` `{ids}` | 사용 중이면 `SCRIPT_IN_USE: 이름 ← 액션들`(Zabbix 원문 대신) |
| `POST /{id}/execute` | scope 1이면 `SCRIPT_NOT_MANUAL`, 대상 없으면 `SCRIPT_EXECUTE_TARGET_REQUIRED`. Zabbix가 거부해도 200 + success=false + output(원문) + hint. 감사 로그 EXECUTE(hostid/eventid/success) |

에러: `SCRIPT_NOT_FOUND` · `SCRIPT_CREATE_FAILED` · `SCRIPT_IDS_REQUIRED` · 위 표.

## FE
- 알림 관리 **스크립트 탭**(`?tab=scripts`): 목록(범위 필터·검색) · 생성/수정 드로어(유형·범위별 필드) · 삭제(사용 중 차단) · **테스트 실행**(호스트 선택 → 실행 모달: 확인 문구·입력값·결과 출력·힌트).
- 호스트 상세 › 정보 탭 **"스크립트 실행"** 드롭다운(`HostScriptRunButton`, menu_path별 묶음) → 같은 실행 모달.
- 실측 E2E: 탭 4개 렌더, Ping 테스트 실행 → 실패 원문 + 에이전트 설정 힌트 표시, 호스트 상세 드롭다운 4개 스크립트.
