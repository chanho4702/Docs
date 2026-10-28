# LLD 결함 수정 계약 — 2026-09-08

작업 위치: `C:/solutions/_workspace/lld-fix-20260908/moveseye-be-spring` 격리 worktree. 원본 작업 트리·서버·DB·Zabbix 설정은 변경하지 않았다. 기존 `_workspace/features/zabbix-ops/discovery/contract_discovery.md`의 API 경로와 envelope를 유지하며 아래 의미를 정정한다.

## 공통

기준 경로 `/zabbix-manage/discovery-rules`. 모든 엔드포인트는 기존 `AdminAccessChecker.requireAdmin` 권한 검사 유지. 응답은 기존 공통 envelope를 사용한다(FE는 두 겹 언랩 후 payload 사용). 권한 거부 HTTP 200 + body code 403, 인증 실패 401 등 기존 처리 유지.

## R1 — 삭제·비활성 정책

`POST /` 및 `PUT /{itemid}` 요청 `lifetimeType`, `enabledLifetimeType`: nullable integer, **0=기간 경과 후 / 1=하지 않음 / 2=즉시**. `lifetime`, `enabledLifetime`은 nullable string(예: `7d`, `1d`)이며 해당 type이 0일 때만 함께 전달한다. 생략은 기존 update 의미 유지. `GET /{itemid}` 응답의 같은 필드도 동일 의미다. 기존 저장값은 자동 변환하지 않는다.

근거: [Zabbix 7.0 LLD rule object](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/discoveryrule/object).

## R3 — 호스트 프로토타입 비밀 매크로

`POST /{ruleid}/prototypes/hosts`, `PUT /{ruleid}/prototypes/hosts/{id}` 요청 `macros`는 nullable array이며 전달 시 전체 목록 교체, 생략 시 유지, 빈 배열은 전체 삭제다.

각 항목: `hostmacroid?: string`, `macro: string`, `type?: string|number`, `description?: string`, `value?: string`. create는 ID 제거, update는 기존 `hostmacroid` 보존. 기존 secret(type=1)의 값 미변경은 **기존 ID 포함 + value 필드 생략**으로 표현한다. `value:""`는 명시적 초기화이며 BE가 제거하지 않는다. 생성/새 매크로에는 value가 필요하다. 응답 요약 `LldPrototypeDto`의 kind/id/name/summary/status/discover 형식은 유지한다.

Zabbix 7.0 소스 확인 결과, `CHostPrototype.validateUpdate`는 hostmacroid를 허용한다. `CHostBase.validateHostMacros`는 ID 없는 항목에 macro와 value를 요구하고, `updateMacros`는 ID 없는 항목을 삽입하며 나머지 기존 항목을 삭제한다. 따라서 ID 없이 value만 생략하는 방식은 성립하지 않는다. [CHostPrototype](https://raw.githubusercontent.com/zabbix/zabbix/release/7.0/ui/include/classes/api/services/CHostPrototype.php), [CHostBase](https://raw.githubusercontent.com/zabbix/zabbix/release/7.0/ui/include/classes/api/services/CHostBase.php).

## R5 — 아이템 프로토타입 인터페이스

`POST /{ruleid}/prototypes/items`, `PUT /{ruleid}/prototypes/items/{id}`의 `type: integer`, `interfaceId?: string` 이름은 유지한다.

| 아이템 type | 필요한 interface.type |
|---|---|
| Agent 0 | Agent 1 |
| SNMP 20, SNMP trap 17 | SNMP 2 |
| IPMI 12 | IPMI 3 |
| JMX 16 | JMX 4 |

자동 선택은 해당 호스트의 같은 interface.type 중 main=1만 허용한다. 명시한 ID는 같은 호스트 소유이며 대응 유형이어야 한다(보조 인터페이스 명시 허용). 필요한 인터페이스가 없거나 부적합하면 기존 `INTERFACE_NOT_FOUND` 코드로 Zabbix 쓰기 전에 거부한다. Simple3/External10/SSH13/Telnet14/HTTP19는 선택적 인터페이스이며, 명시한 경우 소유를 검증한다. 나머지 유형은 인터페이스 없이 생성한다. 템플릿은 호스트 인터페이스를 조회하지 않으며 0 이외 ID 명시는 거부한다.

update에서 type이 바뀌면 새 유형에 맞게 다시 해석하며, 인터페이스 없는 유형이면 interfaceid=0으로 해제한다. type 생략 시 명시 ID는 현재 유형으로 검증한다. extra.interfaceid로 검증을 우회하지 않는다.

근거: [Zabbix 7.0 itemTypeInterface](https://raw.githubusercontent.com/zabbix/zabbix/release/7.0/ui/include/items.inc.php).

## R7 — 생성물 조회 실패

`GET /?hostid=...` 응답 `items[].createdItemCount: number|null`. 정상 조회 0건은 0, 조회 실패는 null. 템플릿 조회의 null 의미는 유지한다. FE는 호스트 스코프의 null을 조회 실패/미상으로 표시해야 한다.

`GET /{itemid}/discovered?limit=...&offset=...` 정상 payload는 기존 `{items: object[], total: number, limit: number, offset: number}`. upstream 실패는 기존 전역 오류 처리로 전파하며 `{items:[], total:0}` 성공 응답으로 바꾸지 않는다. 새로운 오류 envelope는 추가하지 않았다.

## 🔄 FE 요청사항

구현 상태: FE도 `_workspace/lld-fix-20260908/moveseyee_fe`에서 수정했다. 원본 브랜치에는 아직 합치지 않았다.

## R2·R4·R6 — FE 폼

- 규칙 폼은 대상·scope·open별 세션을 분리하고 상세 로딩/조회 오류/ID 불일치/상속 규칙의 저장을 차단한다. 폐기된 세션의 비동기 제출·성공·오류 콜백도 차단한다.
- HTTP 아이템 프로토타입은 `extra.headers: {name:string,value:string}[]`를 유지하며 빈 배열은 명시적 제거다.
- 규칙 유형은 LLD 지원 목록만 제공하며 Calculated15/SNMP trap17을 제외하고 Browser22를 추가한다. URL, SNMP OID, params, 사용자 정보 등 유형별 필드가 기존 `extra`로 전달된다.
- 호스트 Agent/SNMP/IPMI/JMX 규칙은 interfaceId 필수, 템플릿은 입력/전송하지 않는다. 규칙 BE에는 프로토타입의 자동 인터페이스 선택이 없으므로 이를 자동이라고 안내하지 않는다.
- 생성물 상세 4종은 조회 오류와 정상 0건을 분리하고 재시도를 제공한다. 삭제 count가 하나라도 미상이면 확정 총계를 표시하지 않는다.

- 정책 enum을 0/1/2 의미에 맞추고 기본 비활성 안 함을 1로 설정한다.
- 기존 secret update에 hostmacroid 유지, 미변경 value 생략, 새 값/명시 초기화와 구분한다.
- 목록 count null과 상세 조회 오류를 정상 0건과 구별한다. 삭제 확인에서도 미상을 표시한다.

## 검증

최종 격리 커밋: BE `c16714e`, FE `8817970` (각 `codex/lld-fix-20260908`). 원본 병합·push·서버 반영 없음.

FE 타입 검사 통과. Jest 규칙18·목록9·실패표시9 통과, 프로토타입11은 20초 timeout 1건 후 60초 제한으로 재실행하여 전부 통과. 총 고유 테스트 47개 통과 확인. Chromium mock harness에서 규칙 A→B 저장 차단/올바른 payload/생성 초기화 통과. 상세는 `lld-fix-20260908/README.md`.

격리 worktree에서 JDK17, `:test --tests '*ZabbixLldManageServiceTest' --tests '*ZabbixLldPrototypeManageServiceTest' --max-workers=1 --no-parallel --no-daemon` 1회 실행: **BUILD SUCCESSFUL (6분 8초), 52개 통과**. ManageService 28개, PrototypeManageService 24개, 실패·오류·skip 0. `git diff --check` 통과. 테스트 시작 이후 변경은 주석·Swagger 설명뿐이며 동작 코드는 검증 대상과 같다. 실 Zabbix 쓰기·서버 재시작·전체 테스트는 수행하지 않았다.
