**판정: 승인**

현재 미커밋 변경과 신규 파일을 읽기 전용으로 검수했습니다. **1차 결함 5건은 코드상 해소됐으며, 이번 수정에서 새로운 🔴·🟡 동작 결함은 발견하지 못했습니다.** 🟢 문서 불일치 1건이 남아 있습니다.

**1차 결함 재검수**

| 항목 | 확인 결과 | 테스트 근거 |
|---|---|---|
| 모드만 바꾸면 암호화 해제 | **해소.** 기존 암호화 사용·모드 변경·새 모드의 TLS 생략이 모두 충족될 때 `PROXY_TLS_REQUIRED`. 반대편 TLS만 보내도 거부합니다. [서비스:237](/C:/worktrees/zbx-proxy-be/src/main/java/com/dmove/moveseye/zabbixadmin/ZabbixProxyManageService.java:237) | `modeSwitchRequiresNewTlsWhenEncrypted` |
| 인증서 해제 시 프리필 때문에 저장 실패 | **해소.** 결과 TLS가 인증서를 사용하지 않으면 `tls_issuer`·`tls_subject`를 생략합니다. 인증서를 계속 사용하면 명시적인 빈 문자열도 전달합니다. [서비스:265](/C:/worktrees/zbx-proxy-be/src/main/java/com/dmove/moveseye/zabbixadmin/ZabbixProxyManageService.java:265) | `certFieldsOnlyWithCertificate` |
| 잘못된 `custom_timeouts`가 해제로 변환 | **해소.** 요청 값을 그대로 전달하므로 `2`가 `0`으로 바뀌지 않습니다. [서비스:272](/C:/worktrees/zbx-proxy-be/src/main/java/com/dmove/moveseye/zabbixadmin/ZabbixProxyManageService.java:272) | `invalidCustomTimeoutsPassedThrough` |
| 삭제 검사에서 액션 조건 누락 | **해소.** `selectFilter`로 조건을 조회하고 `conditiontype=20`·대상 ID를 대조합니다. 사용 중이면 삭제 호출 전에 이름과 함께 거부합니다. [서비스:386](/C:/worktrees/zbx-proxy-be/src/main/java/com/dmove/moveseye/zabbixadmin/ZabbixProxyManageService.java:386) | `deleteBlockedByActionCondition` |
| 수정의 빈 값을 미전송으로 처리 | **해소.** 생성에서는 빈 값을 생략하고, 수정에서는 빈 문자열을 전달합니다. 프록시 주소·포트·그룹 내 로컬 포트와 그룹 지연·최소 온라인에 적용됩니다. [프록시:446](/C:/worktrees/zbx-proxy-be/src/main/java/com/dmove/moveseye/zabbixadmin/ZabbixProxyManageService.java:446), [그룹:142](/C:/worktrees/zbx-proxy-be/src/main/java/com/dmove/moveseye/zabbixadmin/ZabbixProxyGroupManageService.java:142) | `emptyValuesOnUpdateAreSent`, 그룹 `updateParams` |

`hasPsk`에서 `!modeChanged`를 제거한 것도 정정된 계약과 일치합니다. 현재 PSK를 사용하고 결과도 PSK이면 재입력을 요구하지 않으며, 새로 활성화할 때는 두 비밀값을 요구합니다. PSK 유지와 인증서 해제 시 필드 초기화는 [공식 Zabbix 7.0 구현](https://raw.githubusercontent.com/zabbix/zabbix/release/7.0/ui/include/classes/api/services/CProxy.php)과도 일치합니다.

**남은 결함**

- **🟢 Swagger·주석에 이전 PSK 규칙이 남음**
  - **위치:** [ZabbixProxyManageController.java:74](/C:/worktrees/zbx-proxy-be/src/main/java/com/dmove/moveseye/zabbixadmin/ZabbixProxyManageController.java:74), [ErrorCode.java:324](/C:/worktrees/zbx-proxy-be/engine-api/src/main/java/com/dmove/moveseye/common/exception/ErrorCode.java:324).
  - **실패 시나리오:** API 문서를 따르는 호출자가 PSK를 유지하는 모드 전환에도 키 재입력이 필수라고 오인합니다. 실제 코드는 생략을 허용합니다.
  - **고치는 방향:** “결과 TLS가 계속 PSK이면 모드 변경에도 유지, PSK를 새로 활성화할 때 두 값 필수”로 설명을 통일하면 됩니다. 승인 차단 사항은 아닙니다.

**검증 범위와 한계**

기존 XML에서 수정 후 프록시 21건·그룹 6건·컨트롤러 3건, 합계 **30건의 실패·오류 0**을 확인했습니다. 테스트 코드를 대조했으며, 이번 검수에서 빌드·테스트를 재실행하거나 파일·실서버를 변경하지 않았습니다.

HTTP 바인딩과 실제 BE EP 동작은 **확인 불가**입니다. 업그레이드나 DB 직접 변경으로 PSK 비트만 남은 데이터에서의 동작도 **확인 불가**이며, 이를 확인된 회귀 결함으로 판단할 근거는 없습니다.