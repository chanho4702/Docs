**판정: 반려**

미커밋 변경 27개 파일(신규 19개 포함)을 읽기 전용으로 검수했습니다. 암호화가 조용히 해제되는 경로를 포함해 수정이 필요한 결함 5건을 확인했습니다.

**결함 목록**

1. **🔴 반드시 고칠 것 — 모드만 바꾸면 암호화가 해제되고 PSK가 소실될 수 있음**  
   위치: [ZabbixProxyManageService.java:230](/C:/worktrees/zbx-proxy-be/src/main/java/com/dmove/moveseye/zabbixadmin/ZabbixProxyManageService.java:230), 같은 파일 235~241줄.  
   **실패 시나리오:** 현재 패시브·PSK(`operating_mode=1`, `tls_connect=2`)인 프록시에 `PUT {"operating_mode":0}` → `tls_connect=1`만 정규화하고 새 `tls_accept`는 생략 → 액티브 기본값인 암호화 없음으로 저장됩니다. `wantsPsk=false`이므로 `PROXY_PSK_REQUIRED`도 발생하지 않습니다. 역방향 전환도 동일합니다. Zabbix는 결과 TLS에서 PSK가 빠지면 저장된 PSK를 초기화합니다. [공식 7.0 구현](https://raw.githubusercontent.com/zabbix/zabbix/release/7.0/ui/include/classes/api/services/CProxy.php)  
   **고치는 방향:** 기존에 암호화를 사용했다면 모드 전환 시 새 모드의 TLS 방식을 명시하도록 요구해야 합니다. 암호화 해제를 묵시적으로 선택하면 안 됩니다.  
   **테스트 공백:** [ZabbixProxyManageServiceTest.java:249](/C:/worktrees/zbx-proxy-be/src/test/java/com/dmove/moveseye/zabbixadmin/ZabbixProxyManageServiceTest.java:249)는 반대편 TLS 초기화만 확인하며, 전환 후 실제 연결 방식과 비밀값 보존을 확인하지 않습니다.

2. **🔴 반드시 고칠 것 — 인증서 사용을 끌 때 프리필 값이 남으면 저장 실패**  
   위치: [ZabbixProxyManageService.java:247](/C:/worktrees/zbx-proxy-be/src/main/java/com/dmove/moveseye/zabbixadmin/ZabbixProxyManageService.java:247).  
   **실패 시나리오:** 현재 액티브·인증서 방식에서 `PUT {"tls_accept":1,"tls_issuer":"CN=CA","tls_subject":"CN=proxy"}` → 인증서를 끈 뒤에도 발급자·주체를 그대로 전송 → Zabbix가 비어 있어야 하는 필드로 판단해 요청을 거부합니다. 인증서→PSK 전환에서도 발생합니다. [공식 TLS 검증 구현](https://raw.githubusercontent.com/zabbix/zabbix/release/7.0/ui/include/classes/api/services/CProxy.php)  
   **고치는 방향:** 결과 TLS가 인증서를 사용하지 않으면 `tls_issuer`·`tls_subject`도 함께 정규화해야 합니다. 기존 프리필을 포함한 전환 테스트가 필요합니다.

3. **🟡 고치는 것이 좋음 — 잘못된 `custom_timeouts` 값이 설정 해제로 변환됨**  
   위치: [ZabbixProxyManageService.java:251](/C:/worktrees/zbx-proxy-be/src/main/java/com/dmove/moveseye/zabbixadmin/ZabbixProxyManageService.java:251).  
   **실패 시나리오:** 사용자 지정 타임아웃이 설정된 프록시에 `PUT {"custom_timeouts":2}` → 오류 대신 `custom_timeouts=0`으로 전송 → 사용자 지정 설정이 해제됩니다. `-1` 등도 같습니다.  
   **고치는 방향:** `0`·`1`만 허용하거나 원래 값을 Zabbix에 전달해 거부받아야 합니다. 잘못된 입력을 유효한 상태 변경으로 바꾸지 않아야 합니다. 공식 값 범위도 `0`·`1`입니다. [Proxy object](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/proxy/object)

4. **🟡 고치는 것이 좋음 — 삭제 사전 검사에 액션 조건 사용처가 빠짐**  
   위치: [ZabbixProxyManageService.java:149](/C:/worktrees/zbx-proxy-be/src/main/java/com/dmove/moveseye/zabbixadmin/ZabbixProxyManageService.java:149).  
   **실패 시나리오:** 호스트·디스커버리 규칙은 없지만 액션의 Proxy 조건에서 사용하는 프록시에 `DELETE {"ids":["2"]}` → 사전 검사 통과 → Zabbix에서 뒤늦게 거부됩니다. 계약의 `PROXY_IN_USE`와 사용처 집계 대신 Zabbix 원문 오류가 반환됩니다. 공식 구현은 액션 조건도 검사합니다. [삭제 검증 구현](https://raw.githubusercontent.com/zabbix/zabbix/release/7.0/ui/include/classes/api/services/CProxy.php)  
   **고치는 방향:** 액션 조건을 사용처 조회와 삭제 판정에 포함해야 합니다. **Zabbix 자체 검사가 삭제를 차단하므로, 이 누락으로 부분 삭제된다고 판단할 근거는 없습니다.**

5. **🟡 고치는 것이 좋음 — 명시적으로 보낸 빈 값을 무시하고 성공 처리**  
   위치: [ZabbixProxyManageService.java:392](/C:/worktrees/zbx-proxy-be/src/main/java/com/dmove/moveseye/zabbixadmin/ZabbixProxyManageService.java:392), [ZabbixProxyGroupManageService.java:200](/C:/worktrees/zbx-proxy-be/src/main/java/com/dmove/moveseye/zabbixadmin/ZabbixProxyGroupManageService.java:200).  
   **실패 시나리오:** 기존 패시브 주소가 `10.0.0.9`일 때 `PUT {"address":""}` → `address`를 전송하지 않아 기존 주소가 유지되면서 성공합니다. 그룹의 `{"failover_delay":""}`·`{"min_online":""}`도 같습니다. 계약의 주소·형식 검증을 Zabbix에 맡긴다는 설명과 다릅니다.  
   **고치는 방향:** 수정에서는 미전송과 빈 문자열을 구분하고, 빈 입력을 명시적으로 거부하거나 Zabbix 검증에 전달해야 합니다. 생성 시 기본값 적용 정책과 구분하는 것이 좋습니다.

**중점 확인 6개 결과**

| 항목 | 결과 |
|---|---|
| ① 결과 상태 판정 | 결함 1·2·3 확인. 타임아웃 누락 키를 현재 값→전역 값으로 채우는 경로는 계약과 일치합니다. |
| ② PSK 존재 가정 | 정상 API로 PSK를 새로 켤 때 비밀값을 요구하는 근거는 있습니다. 업그레이드·DB 직접 변경으로 비트만 남은 실제 사례는 **확인 불가**입니다. 또한 공식 `release/7.0` 구현은 결과 TLS가 계속 PSK이면 모드 변경 자체만으로 PSK를 삭제하지 않습니다. 계약의 “모드를 바꾸면 무조건 삭제”와 `!modeChanged` 조건은 재검증이 필요합니다. |
| ③ 그룹 탈퇴·비표준 `local_port` | 공식 7.0 구현은 그룹 탈퇴 후 `local_address`·`local_port`를 기본값으로 초기화합니다. 생략 전략은 타당합니다. **dev 7.0.6에서의 독립 실측은 확인 불가**입니다. |
| ④ 비밀값 노출 | 생성·수정 이력의 PSK 두 필드는 마스킹되고 상세 DTO에도 없습니다. 검토한 정상 경로에서 노출 결함은 찾지 못했습니다. |
| ⑤ 삭제 사용처 | 액션 조건 누락 확인. 공식 삭제 검증에서 스크립트를 별도 차단하는 근거는 찾지 못했습니다. 호스트 프로토타입을 포함한 실제 환경 동작은 **확인 불가**입니다. |
| ⑥ 메서드·조사표 | 추가한 READ/WRITE, OBJECT/OBJECT_OR_ARRAY/ARRAY_OF_IDS, update·delete의 Super admin 권한 설명은 공식 문서와 일치합니다. [proxy.update](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/proxy/update), [proxy.delete](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/proxy/delete), [proxygroup.update](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/proxygroup/update), [proxygroup.delete](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/proxygroup/delete) |

**검증 한계:** 기존 XML에서 신규 테스트 25건과 `ZabbixMethodTest` 5건의 실패 0 기록을 확인했습니다. 이번 검수에서는 빌드·테스트·실서버 변경을 실행하지 않았습니다. 컨트롤러 테스트는 직접 메서드 호출이므로 JSON 바인딩·HTTP 응답을 검증하지 않으며, `ZabbixMethodTest`도 실제 RPC 인자의 `paramsShape`를 검증하지 않습니다. 외부 구현 대조는 공식 `release/7.0` 기준이며, 7.0.6 전용 소스와 런타임 결과는 독립 확인하지 못했습니다.