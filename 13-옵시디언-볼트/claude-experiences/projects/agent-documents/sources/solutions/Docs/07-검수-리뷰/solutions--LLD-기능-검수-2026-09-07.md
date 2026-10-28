# LLD 기능 검수 — 2026-09-07

- 검수자: Codex. `COLLAB.md`의 `SOLO-CLAUDE` 검수 모드.
- 대상: LLD 규칙 CRUD·상속 보호·실행·발견 결과, 프로토타입 4종, React 폼과 Spring/Zabbix 전달 경로. 네트워크 디스커버리 `drule`은 제외.
- 확인한 HEAD: BE `19b5674`, FE `a830de3`. 기존 미커밋 작업이 있는 작업 트리를 읽었다.
- 구현 소스·계약·운영 데이터는 수정하지 않았다. 재현 파일은 `_workspace/verification/`에 분리했다.

## 진행 상태 — 수정 보류, Claude 검토 요청 전달 완료

- 2026-09-07 사용자 결정: “일단 기록해 놓고 나중에 진행하며 Claude 의견도 들어본다.”
- 현재는 검수와 기록까지만 완료했다. 수정·배포·기존 규칙 설정 변경·추가 운영 점검은 보류한다.
- 확인된 것은 코드 및 격리 재현상의 결함이다. 실제 운영 데이터 삭제나 비밀 매크로 손상 발생 여부는 아직 확인하지 못했다.
- Claude 의견은 아직 받지 않았다. 아래 쟁점을 검토한 뒤 이 문서에 항목별 동의/이견과 근거를 남기고 사용자와 후속 작업을 정한다.
- 후속 사용자 지시 “니가 시켜”에 따라 Orca의 Claude 세션 `서비스 성능 개선 및 아키텍처 검토`에 독립 검토 요청을 전달했다(terminal send accepted 확인). 수정 보류를 명시했으며, Claude 의견은 별도 `_workspace/reviews/review_zm-93-lld-claude.md`에 작성하도록 요청했다. 이 경로는 예정 산출물이며 아직 결과를 확인한 것은 아니다. 요청 원문: `_workspace/reviews/request_zm-93-lld-claude.md`.

### Claude 검토 요청 쟁점

1. R1: 실제 연동 Zabbix 버전의 lifetime enum과 현재 전달 경로를 독립 확인하고, 기존 설정의 영향 확인 방법을 검토한다. 기존 값을 일괄 반전하지 않는다.
2. R2/R3: 규칙 전환 시 이전 폼 값 제출 및 Secret macro 빈 값 제출 재현을 검토하고, 실제 저장 결과와 보존 방식에 대한 의견을 남긴다.
3. R4~R7: 재현·코드 근거를 확인하고 의도된 제한인지 결함인지, 수정 우선순위와 필요한 회귀 검증을 제안한다.

재개할 때 이 보고서와 아래 격리 재현 파일부터 확인한다. 이 기록 자체는 수정 착수나 운영 데이터 변경 지시가 아니다.

## 검수 결과

수정 필요 7건. 우선순위는 R1 → R2/R3 → R4~R7. 기존 테스트 통과만으로 안전한 상태라고 판단할 수 없다.

### [ ] R1 — 🔴 P1: “삭제 안 함”이 실제로는 즉시 삭제를 요청한다

- 위치: `moveseyee_fe/src/constants/zabbix-discovery.ts:24`, `LldRuleFormDrawer.tsx:131`, `LldRuleDetailDrawer.tsx:130`.
- 현재 상수: `IMMEDIATELY=1`, `NEVER=2`. Zabbix 7.0 실제 정의는 두 필드 모두 `0=기간 후`, `1=하지 않음`, `2=즉시`다.
- 생성 폼에서 “삭제 안 함”을 선택하고 저장하면 `lifetimeType:2`가 제출되는 것을 실제 React 폼으로 재현했다. 비활성화 정책의 기본 선택 “하지 않음”도 `enabledLifetimeType:2`로 제출된다.
- BE `ZabbixLldManageService.java:434`와 엔진 구현은 이 숫자를 변환 없이 Zabbix로 전달한다. 따라서 발견되지 않게 된 리소스를 보존하려던 설정이 즉시 삭제 정책으로 바뀔 수 있다. 조회 화면도 1과 2의 의미를 반대로 표시한다.
- 오류가 `_workspace/contract_discovery.md:90`, 생성/수정/상세 DTO 설명, `ZabbixLldManageServiceTest.java:279`에도 복제돼 있다.
- 조치: 상수·UI·DTO·계약·테스트의 의미를 함께 정정한다. 기존에 이 UI로 저장한 규칙은 실제 숫자와 사용자의 의도를 대조해야 한다. 기존 숫자를 일괄 뒤집으면 Zabbix에서 직접 설정한 정상 규칙까지 바뀌므로 자동 변환하지 않는다.
- 근거: [Zabbix 7.0 LLD rule object](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/discoveryrule/object).

### [ ] R2 — 🔴 P1: 규칙 전환 후 상세 로딩 중 저장하면 다른 규칙의 설정이 덮인다

- 위치: `LldRuleFormDrawer.tsx:80`, `:108`, `:196`, `:238`; 경로 접두는 `moveseyee_fe/src/pages/zabbix-management/discovery/`.
- 상세 훅에서 `data`만 사용하고 로딩·실패 상태로 저장을 막지 않는다. `detail`이 없을 때 이전 Form 값과 filter/overrides 등의 React state가 유지된다.
- 재현: A 편집 → 닫기 → B 편집(B 상세 로딩 중) → 저장. 실제 제출은 `itemid=B`인데 이름·키·overrides는 A의 값이었다.
- FE가 네 고급 필드를 항상 전송하고 BE가 배열을 전체 교체하므로, B의 필터·전처리·매크로 경로·override가 손상될 수 있다. 상세가 실패한 경우에도 같은 보호 공백이 있다.
- 관련 재현: 편집 후 생성 모드를 열어도 A의 이름과 키가 남는다. 생성 분기에서 일부 필드만 `setFieldsValue`하고 전체 초기화하지 않는다.
- 조치: 대상 ID별 폼 초기화, 상세의 대상 일치 검증, 로딩/오류/상세 부재 중 저장 차단. 전송 직전에도 검증한다.

### [ ] R3 — 🔴 P1: 호스트 프로토타입 편집이 비밀 매크로를 빈 값으로 덮는다

- 위치: `moveseyee_fe/src/pages/zabbix-management/discovery/prototypes/HostPrototypeFormDrawer.tsx:80`, `:96`; BE `ZabbixLldPrototypeManageService.java:299`, `:334`.
- Secret macro의 `value`는 write-only라 조회 시 제공되지 않는다. FE는 누락된 값을 `str(undefined) → ""`로 만들고, 수정하지 않은 매크로도 모든 저장 요청에 `value:""`로 포함한다.
- 재현: `type:"1"`, `value` 없는 원본 매크로를 주입한 뒤 아무것도 수정하지 않고 저장하면 `macros:[{macro:"{$SECRET}",type:"1",value:"",…}]`가 제출된다. BE는 빈 값을 그대로 전달한다.
- 영향: 생성 호스트가 이용하는 비밀번호·토큰 매크로가 빈 값으로 변경될 위험이 있다. 실제 비밀값을 지우는 외부 쓰기 검증은 하지 않았다.
- 조치: 기존 Secret macro의 “유지”와 “새 값 설정”을 구분하고, 변경하지 않은 비밀값은 update에서 생략한다. 매크로 식별과 전체 교체 동작도 Zabbix 계약에 맞춰 보존한다.
- 근거: [Zabbix 7.0 User macro object](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/usermacro/object).

### [ ] R4 — 🟡 P2: HTTP 아이템 프로토타입의 headers가 배열에서 문자열로 변한다

- 위치: `moveseyee_fe/src/pages/zabbix-management/discovery/prototypes/ItemPrototypeFormDrawer.tsx:28`, `:110`, `:125`.
- `headers`도 일반 유형별 필드와 함께 `String(raw[k])` 처리한다. 이름/값 배열이 `[object Object]`로 바뀌고, `extra.headers`에 문자열로 전송된다. 입력 UI도 문자열 TextArea이며 파싱이 없다.
- 재현: 헤더 1개가 있는 HTTP 프로토타입을 그대로 저장하면 `extra.headers === "[object Object]"`. BE는 extra를 그대로 전달한다.
- 영향: 기존 헤더가 있는 프로토타입의 단순 이름 수정도 Zabbix의 배열 타입 검증에서 실패할 수 있다. 새 헤더 입력도 같은 타입 문제를 갖는다.
- 조치: `{name,value}[]` 편집과 보존, 또는 JSON 입력을 명시적으로 파싱하고 배열을 검증한다.
- 근거: [Zabbix 7.0 Item prototype object](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/itemprototype/object).

### [ ] R5 — 🟡 P2: SNMP·JMX·IPMI 프로토타입도 Agent 인터페이스를 우선 선택한다

- 위치: `moveseye-be-spring/src/main/java/com/dmove/moveseye/zabbixadmin/ZabbixLldPrototypeManageService.java:481`.
- `resolveInterfaceId`는 요청 type이 인터페이스 필요 유형인지만 검사한다. 선택 시에는 항상 `interface.type=1 && main=1`을 찾고, 없으면 목록 첫 인터페이스를 고른다.
- Agent와 SNMP 인터페이스가 함께 있는 호스트에서 SNMP 아이템 프로토타입을 만들면 Agent ID가 선택된다. 실제 서비스의 선택 메서드를 호출한 격리 Java 재현에서 SNMP type=20이 `agent-1`을 반환했다. JMX/IPMI도 같은 선택 경로를 사용한다.
- FE 아이템 프로토타입 폼에는 인터페이스 선택 필드가 없어 사용자가 이 경로를 우회할 수 없다. 유형 변경 시 update도 해당 인터페이스를 다시 해석하지 않는다.
- 조치: item type에 대응하는 interface type과 main을 기준으로 선택하고, 선택할 수 없으면 명확한 오류를 반환한다.

### [ ] R6 — 🟡 P2: LLD 폼이 선택 가능한 수집 유형의 필수 입력을 제공하지 않는다

- 위치: `moveseyee_fe/src/pages/zabbix-management/discovery/LldRuleFormDrawer.tsx:288`, `:177`.
- HTTP agent(19)를 선택해도 `url` 입력이 없고, SNMP(20)의 `snmp_oid`, Script/DB/SSH/Telnet의 `params` 등도 없다. 요청 body에는 이 필드를 실을 `extra`도 없다.
- 재현: 생성 폼에서 HTTP agent를 선택하고 필수 표시된 이름·키를 입력해 저장하면 `type:19`이면서 `url`과 `extra`가 모두 없는 요청이 제출된다.
- 추가로 일반 아이템의 `ITEM_TYPE_VALUES`를 그대로 사용해 LLD가 지원하지 않는 Calculated(15)·SNMP trap(17)도 선택할 수 있다.
- 영향: UI가 제공하는 여러 생성 경로가 Zabbix 필수 필드/지원 유형 검증을 통과할 수 없다.
- 조치: LLD 전용 지원 유형 목록을 사용하고 유형별 필수 필드를 입력·검증·전달한다. 인터페이스 필요 유형도 생성 대상이 호스트/템플릿인지 구분한다.
- 근거: [Zabbix 7.0 LLD rule object](https://www.zabbix.com/documentation/7.0/en/manual/api/reference/discoveryrule/object).

### [ ] R7 — 🟡 P2: 생성 아이템 조회 실패가 정상 0건으로 표시된다

- 위치: `moveseye-be-spring/src/main/java/com/dmove/moveseye/zabbixadmin/ZabbixLldManageService.java:658`.
- `discoveredItems`가 모든 `RuntimeException`을 잡고 빈 목록을 반환한다. 이 helper는 목록의 보조 count뿐 아니라 생성물 상세 API `discovered()`에서도 사용된다.
- 격리 Java 재현: 실제 `discovered()`에 upstream timeout을 주입했을 때 예외 없이 `total=0, items=[]`를 반환했다.
- 영향: Zabbix timeout/통신 오류가 나면 상세 API는 성공한 빈 목록과 `total:0`을 반환하고, 목록·삭제 확인에 쓰이는 생성물 수도 0으로 계산된다. 사용자는 조회 실패와 실제 미생성을 구별할 수 없다.
- 조치: 상세 조회는 오류를 전파하고, 목록의 보조 count는 실패 시 null/조회 불가 상태로 표시한다.

## 검증

- 기존 BE: `ZabbixLldManageServiceTest` 23개, `ZabbixLldPrototypeManageServiceTest` 10개 통과.
- 기존 FE: `DiscoveryManagementTab.test.tsx`, `LldPrototypeForms.test.tsx` 총 15개 통과.
- 격리 FE 재현: 실제 React/Ant Design 폼을 렌더링하고 mutation만 mock으로 차단. 6개 모두 위의 잘못된 제출/잔존 동작을 재현했다. 이 테스트의 PASS는 결함이 재현됐다는 뜻이며 정상 동작 판정이 아니다.
- 격리 BE 재현: 실제 서비스와 mock 외부 의존성으로 SNMP 인터페이스 오선택, 조회 실패의 정상 0건 반환을 확인했다. `LldReviewProbe.java`와 외부 Gradle init script에 보존했다.
- 정적 확인: 컨트롤러 관리자 검사, 규칙 수정·삭제의 상속 방어, 삭제 경고, 프로토타입 삭제의 소유 규칙 ID 검증이 구현돼 있다.
- 실서버 한계: 확인 당시 FE :5173은 실행 중이고 FE 설정은 API `localhost:3000`을 가리켰지만 :3000 listener가 없었다. 실 Zabbix CRUD·지금 실행·발견 후 자동 생성·삭제 및 인증된 브라우저 E2E는 이번에 검증하지 않았다.
- 진단을 위해 BE/FE 소스를 수정하거나 서버·DB·Zabbix 설정을 변경하지 않았다.

재실행:

```powershell
# C:\solutions\moveseyee_fe
npx jest --config ../_workspace/verification/lld-review-2026-09-07.jest.cjs --runInBand --silent

# C:\solutions\moveseye-be-spring
$env:JAVA_HOME='C:\Program Files\Java\jdk-17'
.\gradlew.bat :test --tests '*ZabbixLldManageServiceTest' --tests '*ZabbixLldPrototypeManageServiceTest' --console=plain
.\gradlew.bat -I ../_workspace/verification/lld-review-be-2026-09-07.init.gradle lldReviewRun --console=plain
```
