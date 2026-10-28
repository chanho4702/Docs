# 검수 요청 — 프록시·프록시 그룹 관리 BE (2026-10-28)

- 워크트리 `C:\worktrees\zbx-proxy-be`(브랜치 `zabbix-proxy`, master `df1b39f` 기준, **미커밋** — `git status`/`git diff`로 전부 보인다)
- 계약 `_workspace/features/zabbix-config/proxy/contract_proxy.md`(§0에 dev Zabbix 7.0.6 실측표)

## 범위

| 구분 | 파일 |
|---|---|
| 엔진 계약 | `engine-api/.../zabbix/proxy/ZabbixProxyService.java`(getRaw·create·update·delete 추가) · `ZabbixProxyGroupService.java`(신규) · `zabbix/settings/ZabbixSettingsService.java`(신규, settings.get 읽기만) · `zabbix/host/ZabbixHostService.java`(countRaw 추가) · `common/exception/ErrorCode.java`(PROXY_*·PROXY_GROUP_*) |
| 엔진 구현 | `engine-zabbix/.../proxy/ZabbixProxyServiceImpl.java` · `ZabbixProxyGroupServiceImpl.java` · `settings/ZabbixSettingsServiceImpl.java` · `host/ZabbixHostServiceImpl.java` · `client/ZabbixMethod.java`(proxy.create/update/delete, proxygroup.*, settings.get) · 조사표 `src/test/resources/zabbix/api-reference-7.0.json` |
| 앱 | `zabbixadmin/ZabbixProxyManageService.java` · `ZabbixProxyManageController.java` · `ZabbixProxyGroupManageService.java` · `ZabbixProxyGroupManageController.java` · `domain/ZabbixChangeLog.java`(ENTITY_PROXY·PROXY_GROUP) · `dto/ManagedProxy*`·`Proxy*ReqDto`·`ProxyOptionsDto` |
| 테스트 | `ZabbixProxyManageServiceTest`(16) · `ZabbixProxyGroupManageServiceTest`(6) · `ZabbixProxyManageControllerTest`(3) |

## 의도

- **기본 기능**(라이선스 게이트 없음 — 사용자 결정), 전 EP 관리자 전용. 감시 호스트 배정은 바꾸지 않는다(보기만 — 사용자 결정).
- 목록은 페이지 없이 전체(프록시·그룹은 수십 개 규모). 호스트 목록만 500건 상한.
- Zabbix 실측 규칙을 서비스가 흡수: 모드별 TLS 정규화, PSK "비우면 유지"와 "새로 켜면 필수"의 구분, 사용자 지정 타임아웃 10개 채우기, 그룹 소속 시 local_address 필수, 삭제 전 사용처 이름 안내(전부 아니면 거부).
- 버린 대안:
  - PSK를 "모르니 매번 필수"로 — Zabbix가 켜진 동안은 유지해 주므로 설명만 다는 쪽이 운영자 부담이 적다.
  - 그룹 폼에서 소속 프록시 편집 — Zabbix `proxygroup.create`에 `proxies` 인자가 없고, 프록시 쪽 필드를 고치는 다건 update가 되어 실패 시 부분 반영이 생긴다.
  - 그룹 배정 호스트 수를 `host.get` 한 번(전체 호스트의 proxy_groupid)으로 — 호스트 5천 대 규모에서 무겁다. 그룹마다 countOutput 한 번을 택했다.
  - 범위 검사(타임아웃 1~600, 지연 10~900, 최소 온라인 1~1000)를 BE에서 다시 — Zabbix 원문이 정확해 중복 규칙만 늘어난다.

## 중점 확인 요청

1. `ZabbixProxyManageService.toParams`의 **결과 상태 판정** — 수정은 보낸 것만 온다. 모드 전환·TLS·PSK·그룹·타임아웃 조합에서 Zabbix가 거부할 params를 만드는 경로, 또는 거부하지 않지만 **조용히 값을 잃는** 경로(예: 패시브→액티브 전환 때 PSK 소실을 사용자가 모르고 넘어감)가 있는지.
2. PSK 판정 `hasPsk = !creating && !modeChanged && usesPsk(current…)` — "PSK 비트가 켜져 있으면 저장돼 있다"는 가정이 깨지는 경우(Zabbix 업그레이드로 옮겨 온 데이터, 다른 경로로 PSK 비트만 켠 경우 등).
3. 그룹에서 뺄 때(`proxy_groupid="0"`) local_address·local_port를 보내지 않는다 — 현재 local_port가 10051이 아닌 프록시를 빼면 Zabbix가 거부하는지(미실측).
4. 변경 이력 payload에 비밀값이 새는 경로(PSK는 `***`). 상세 응답에 비밀값이 실리는 경로.
5. 삭제 사용 중 판정 — 직접 감시 호스트·디스커버리 규칙만 막는다. 그 밖에 Zabbix가 프록시 삭제를 거부하는 사용처(액션 조건·스크립트 실행 위치·호스트 프로토타입 등)가 있는지.
6. `ZabbixMethod`·조사표 추가분이 문서와 맞는지(access·paramsShape). update·delete 권한 문구는 create 문서와 같은 패턴으로 적었다(원문 개별 확인은 create·get만).

## 검증 현황

- 통과: 위 새 테스트 25건 + `ZabbixMethodTest`. 회귀: 앱 593건(ArchUnit·zabbixadmin·host.manage 포함)·engine-zabbix 359건 실패 0.
- dev Zabbix 7.0.6에서 API 동작은 직접 JSON-RPC로 확인했다(계약 §0) — 단 **우리 EP를 통한 런타임 실측은 아직**(BE 재기동 필요).
- 미실측: 그룹에서 뺄 때 local_port, 인증서(tls_accept 4) 실제 접속, 프록시 실접속 상태 변화.

## 검수 결과

### 1차(gpt-6.1-sol high) — 반려 · 원문 `_workspace/_archive/features/zabbix-config/proxy/review_proxy-be_codex.md`

- [x] 🔴 모드만 바꾸면 암호화가 해제되고 PSK 소실 → 지금 암호화를 쓰는 프록시의 모드를 바꾸면서 새 모드의 TLS를 안 보내면 `PROXY_TLS_REQUIRED`(신규 코드). 또 dev 7.0.6 재실측으로 "결과가 계속 PSK면 모드를 바꿔도 유지"를 확인 → `hasPsk`에서 `!modeChanged` 제거, 계약 §0의 잘못된 해석 정정. 테스트 `modeSwitchRequiresNewTlsWhenEncrypted`·`pskKeepVersusReenable`.
- [x] 🔴 인증서를 끌 때 발급자·주체가 남으면 저장 실패 → 결과 TLS가 인증서를 안 쓰면 두 필드를 보내지 않는다(재실측: 안 보내면 Zabbix가 비움). 테스트 `certFieldsOnlyWithCertificate`.
- [x] 🟡 `custom_timeouts` 잘못된 값이 끄기로 변환 → 받은 값 그대로(재실측: 2는 `value must be one of 0, 1`). 테스트 `invalidCustomTimeoutsPassedThrough`.
- [x] 🟡 삭제 사전 검사에 액션 조건 누락 → `action.get selectFilter`로 conditiontype 20 사용처 포함(이름 표시). 테스트 `deleteBlockedByActionCondition`. dev에는 해당 액션이 없음(조회 확인).
- [x] 🟡 수정에서 보낸 빈 값을 무시하고 성공 → 생성은 빈 값 생략, 수정은 보낸 빈 값을 그대로(재실측: 빈 주소 `cannot be empty`). 그룹의 지연·최소 온라인도 같게. 테스트 `emptyValuesOnUpdateAreSent`·그룹 `updateParams`.
- 프록시 테스트 16→21건, 그룹 6건, 컨트롤러 3건 전부 통과.

### 2차(gpt-6.1-sol high) — **승인** · 원문 `_workspace/_archive/features/zabbix-config/proxy/review_proxy-be_codex_r2.md`

- 1차 5건 해소 확인, 새 🔴·🟡 없음.
- [x] 🟢 Swagger·ErrorCode 주석에 옛 PSK 규칙("모드를 바꾸면 다시 필수") → "결과가 PSK면 모드를 바꿔도 유지, 새로 켤 때 둘 다 필수"로 통일.
