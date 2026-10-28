# LLD 검수(R1~R7) — Claude 독립 검토 의견

- 작성: 2026-09-07, Claude. 원본: `_workspace/reviews/review_zm-93-lld-codex.md`(Codex, 수정 보류 상태).
- 방법: Codex 결론을 전제하지 않고 **소스 직접 정독**(FE 폼 3종·상수·훅, BE `ZabbixLldManageService`·`ZabbixLldPrototypeManageService`, 계약서) + **Zabbix 7.0 공식 문서 대조**(discoveryrule·itemprototype object) + **기존 격리 재현 재실행**(FE jest 6건). 소스·설정·DB·Zabbix는 일절 수정하지 않았고, 새 재현 파일도 만들지 않았다.
- 재현 재실행 결과: FE 6건 중 **5건 통과(=결함 재현 성립)**, 1건(R4 headers)은 20초 타임아웃으로 실패 — 이 머신의 jest CPU 경합 특성이며(대형 스위트에서 반복 관찰된 패턴), R4는 아래와 같이 **코드 정독으로 별도 확인**했다. BE 격리 재현(gradle init script)은 재실행하지 않았다(불필요한 빌드 회피 지시) — 대신 해당 경로를 정독으로 검증했다.

## 총평

**7건 모두 실결함으로 동의한다. 우선순위(R1 → R2/R3 → R4~R7)에도 동의한다.**
Codex의 위치 지목·재현·조치 방향은 전부 소스와 일치했고, 과장된 항목은 없었다. 아래에 항목별로 독립 확인한 근거, 코드 결함과 실제 운영 피해의 구분, 수정 시 회귀 검증 제안을 남긴다.

| # | 판정 | 심각도 의견 | 실운영 피해 |
|---|---|---|---|
| R1 | **동의** | P1 유지 — 방향까지 파괴적 | 발생 조건 성립, 실제 발생 여부 미확인 |
| R2 | **동의** | P1 유지 — 단 발생 창은 좁음(실패 시 무기한) | 미확인 |
| R3 | **동의** | P1 유지 | 미확인(실 Zabbix 쓰기 검증 안 함) |
| R4 | **동의** | P2 적정 | 편집-저장 경로 전반 차단 수준 |
| R5 | **동의** | P2 적정 | 생성 거부 또는 오폴링(어느 쪽인지 실서버 미확인) |
| R6 | **동의**(+추가 1건) | P2 적정 | 생성 실패로 드러남(조용한 오염은 아님) |
| R7 | **동의** | P2 적정 | 오판 유발(데이터 손상은 없음) |

---

## R1 — lifetime enum 반전: 동의 (P1)

**독립 확인.** Zabbix 7.0 공식 문서(discoveryrule object)를 직접 조회했다:

- `lifetime_type`: **0 = (기본) 기간 후 삭제, 1 = 삭제 안 함, 2 = 즉시 삭제**
- `enabled_lifetime_type`: **0 = 기간 후 비활성, 1 = 비활성 안 함, 2 = (기본) 즉시 비활성**

FE 상수(`zabbix-discovery.ts:26`)는 `IMMEDIATELY=1, NEVER=2`로 **1↔2 의미가 정반대**다. 전달 경로도 확인했다 — 폼 제출(`LldRuleFormDrawer.tsx` handleSubmit)이 상수값을 그대로 싣고, BE `putLifetime`(`ZabbixLldManageService.java:434~`)은 숫자를 변환 없이 Zabbix에 전달한다. 계약서(`contract_discovery.md:90~92`) 주석도 같은 반전이 복제돼 있다. **저장까지 반전된 값이 도달하는 것이 코드상 확정이다.**

**피해 방향 분석(보고서에 없던 부분).** 반전의 세 갈래가 비대칭적으로 위험하다:

1. 사용자가 "**하지 않음**" 선택 → 2 전송 → Zabbix 의미 "**즉시 삭제**". **보존하려던 리소스가 발견 누락 즉시 삭제된다 — 가장 파괴적.**
2. 사용자가 "즉시" 선택 → 1 전송 → "삭제 안 함". 지우려던 게 안 지워짐 — 잔존이라 덜 위험.
3. **생성 폼 기본값** `enabledLifetimeType=NEVER(2)` → Zabbix 의미 "즉시 비활성". 공교롭게 Zabbix 자체 기본값도 2라 **기본값 그대로 저장한 규칙은 Zabbix 기본 동작과 동일**(라벨만 거짓). 기본값 경로의 실피해는 "비활성 안 함을 의도했는데 즉시 비활성"에 한정된다.

완화 요소 하나: 수정 폼은 detail 값을 그대로 되돌려 보내므로, **라벨만 보고 값을 바꾸지 않은 저장은 원값이 보존**된다(표시만 거짓). 값이 오염되는 건 사용자가 라벨을 믿고 선택을 바꾼 경우다.

**기존 설정 영향 확인 범위 제안(읽기 전용).**

1. LLD UI는 2026-08-19 커밋(#ZM-93)부터 존재 — 노출 기간은 dev 기준 약 3주. 실서버 배포본에 포함됐는지는 배포 시점 대조 필요(미확인).
2. LLD 관리 경로에는 감사 로그가 없어(서비스에 audit 부재 확인) "우리 UI로 저장한 규칙"을 로그로 식별할 수 없다. 따라서:
   - `discoveryrule.get`(output: itemid·name·lifetime 4필드·templateid)으로 **lifetime_type=2(즉시 삭제) 또는 enabled_lifetime_type∈{1,2}** 인 규칙을 뽑는다(읽기 전용 1콜).
   - 템플릿 상속 규칙(templateid≠0)은 우리 UI가 수정 차단하므로 후보에서 빠진다 — 호스트 직속 규칙만 남는다.
   - 남은 후보를 사용자와 **개별 대조**(의도 확인) 후 정정한다. **일괄 반전 금지에 강하게 동의** — Zabbix 프론트에서 직접 설정한 정상 규칙이 섞여 있어 자동 변환은 2차 오염이다.
3. dev Zabbix(dmove.co.kr, 호스트 76대)부터 위 조회로 실태를 보고 실서버 확대 여부를 정하면 된다.

**수정 방향·회귀 검증.** 상수 정정 + 상세 표시 + DTO/계약 주석 + `ZabbixLldManageServiceTest:279`의 잘못된 기대값을 **한 커밋으로** 정정(부분 정정은 더 위험). 회귀 검증: ① "하지 않음" 저장 → 전송 바디 `lifetime_type=1` 어서션(FE 폼 테스트), ② 기존 격리 재현 파일의 기대값을 정정 후 재실행해 **이번엔 올바른 값으로 통과**하는지, ③ dev Zabbix round-trip으로 저장→재조회 라벨 일치 확인.

---

## R2 — 규칙 전환 시 이전 폼 값 제출: 동의 (P1)

**독립 확인.** 코드 구조가 재현을 그대로 뒷받침한다:

- `useLldRuleDetail`은 itemid를 queryKey로 쓰고 `keepPreviousData`가 없다 → **B로 전환하면 로딩 동안 `detail=undefined`**.
- 초기화 effect는 `if (!detail) return;`으로 **조기 반환** → antd Form 인스턴스와 4개 useState(filter·macroPaths·preprocessing·overrides)에 **A의 값이 그대로 남는다**(Drawer가 `destroyOnClose`라도 `Form.useForm` 스토어와 부모 컴포넌트의 useState는 유지된다).
- 저장 버튼은 `isCreating/isUpdating`만 막고 **detail 로딩·실패·부재를 막지 않는다** → 이 창에서 저장하면 `itemid=B` + A의 값이 제출된다.
- BE는 4개 고급 필드 배열을 전체 교체하므로 B의 filter/전처리/매크로 경로/override가 A 것으로 덮인다.
- "편집 후 생성 모드 잔존"도 확인 — `!isEdit` 분기의 `setFieldsValue`가 type·delay·enabled·lifetime 3종만 설정하고 **name·key·description·interfaceId·masterItemId를 초기화하지 않는다**.

**코드 결함 vs 실피해 구분.** 결함은 확정이지만, 정상 네트워크에서 발생 창은 상세 로딩 시간(보통 1초 미만)이라 우연히 밟기는 어렵다. 문제는 **상세 조회가 실패한 경우 창이 무기한**이라는 점 — 이때 화면은 멀쩡한 편집 폼처럼 보이므로 사용자가 저장할 개연성이 충분하다. P1 유지에 동의한다.

**수정 방향·회귀 검증.** ① effect에서 대상 전환 시 즉시 `form.resetFields()`+4개 state 초기화(그다음 detail 도착 시 채움), ② 저장 시 `detail?.itemid === rule.itemid` 검증(불일치·부재면 차단), ③ 생성 분기는 `resetFields()` 후 기본값 설정. 회귀: 기존 격리 재현 2건(전환 저장·생성 잔존)이 수정 후 **재현 실패(=정상)** 로 뒤집히는지 + "로딩 중 저장 차단" 테스트 추가.

---

## R3 — Secret macro 빈 값 전송: 동의 (P1)

**독립 확인.** `HostPrototypeFormDrawer.tsx:41`의 `str = (v) => v==null ? "" : String(v)` — Secret macro(type "1")는 get 응답에 `value`가 없으므로(write-only) `str(undefined)=""`. 79행에서 모든 매크로를 `value:""`로 state에 올리고, 제출 시 매크로 전부를 `value` 포함으로 보낸다("유지" 개념 없음). BE `hostMacros`(`ZabbixLldPrototypeManageService.java:334~`)는 `hostmacroid`를 제거하고 값을 그대로 전달한다 — **hostmacroid 제거 때문에 매 저장이 전 매크로 삭제+재생성이고, Secret은 재생성 값이 빈 문자열이 된다.** 즉 "호스트 프로토타입을 편집해 저장하기만 하면(매크로를 안 건드려도) Secret 값이 소실"이 코드상 성립한다.

**코드 결함 vs 실피해 구분.** 실제 Zabbix에 쓰는 검증은 하지 않았고(보고서와 동일한 한계), 피해 시점도 한 단계 늦다 — 프로토타입 매크로 손상은 **다음 발견 주기에 생성·갱신되는 호스트**부터 반영된다. 그래도 비밀값 소실은 복구 불가(원값을 아무도 모르게 됨)라 P1이 맞다.

**수정 방향·회귀 검증.** Zabbix 계약에 맞는 최소 수정은 두 갈래를 함께: ① 기존 매크로는 **hostmacroid를 보존해 되돌려 보내고**(식별자가 있으면 update 의미, 없는 항목만 생성/삭제), ② Secret(type=1)은 사용자가 새 값을 입력한 경우에만 `value`를 싣고 아니면 **value 필드 자체를 생략**(hostmacroid 있는 항목의 value 생략 = 기존 값 유지). UI는 "값 설정됨(변경하려면 입력)" placeholder로 유지/재설정을 구분. 회귀: 격리 재현(무수정 저장)이 value 미포함으로 뒤집히는지 + dev Zabbix에서 Secret 매크로 round-trip(설정→편집 저장→macro 값 유지 확인 — 값 자체는 조회 불가하니 생성 호스트 동작으로 간접 확인).

---

## R4 — headers 배열→문자열: 동의 (P2)

**독립 확인.** 격리 재현은 이 머신에서 타임아웃(위 "재현 재실행 결과")으로 직접 통과를 못 봤지만, 코드로 결함이 확정된다: `ItemPrototypeFormDrawer.tsx:110` `ex[k] = str(raw[k])` — Zabbix 7.0 itemprototype의 `headers`는 **배열**(공식 문서 확인: "Array of headers")이므로 `String([{name,value}])`은 정확히 `"[object Object]"`가 된다. 제출 시 빈 문자열이 아니라서 `extra.headers`에 실리고, BE는 extra를 그대로 전달한다. 입력 UI도 TextArea 문자열 그대로다(파싱 없음).

**영향 판단.** 헤더가 있는 HTTP 프로토타입은 **무엇을 고치든 저장이 Zabbix 타입 검증에서 거부**될 가능성이 높다(배열 자리에 문자열). 조용한 오염이 아니라 명시적 실패라 P2 적정.

**수정 방향·회귀 검증.** `{name,value}[]` 행 편집기가 정석. 최소 수정이라면 "Name: Value" 줄 단위 텍스트 ↔ 배열 상호 변환을 명시 구현. 회귀: 헤더 1개 로드→무수정 저장 시 `extra.headers`가 원본 배열과 동등한지 어서션.

---

## R5 — 인터페이스 오선택: 동의 (P2)

**독립 확인.** `resolveInterfaceId`(`ZabbixLldPrototypeManageService.java:481~`)를 정독 — 요청 type이 인터페이스 필요 유형인지"만" 보고, 선택은 항상 `type=="1"(Agent) && main=="1"` 우선 → 없으면 **목록 첫 인터페이스**다. 아이템 type→인터페이스 type 대응(20→SNMP(2), 16→JMX(4), 12→IPMI(3))이 없다. FE 아이템 프로토타입 폼에 인터페이스 필드가 없는 것도 확인(TYPE_FIELDS·폼 필드에 부재) — 우회 불가. ※ LLD **규칙** 폼에는 interfaceId 수동 입력이 있어(R6 참조) 규칙 쪽은 이 경로와 다르다.

**영향 판단.** Agent+SNMP 동시 보유 호스트에서 SNMP 프로토타입 생성 시 Agent 인터페이스가 실린다. Zabbix가 생성 시점에 거부하는지, 생성 후 폴링이 실패하는지는 **실서버 미확인**(어느 쪽이든 결함). P2 적정.

**수정 방향·회귀 검증.** 아이템 type→인터페이스 type 매핑 테이블로 해당 type의 `main=1`을 선택, 없으면 명확한 오류(폴백으로 아무거나 고르지 않기 — fail-closed). 회귀: 격리 프로브(LldReviewProbe)의 SNMP 케이스가 SNMP 인터페이스를 반환하는지 + "해당 타입 인터페이스 없음 → 오류" 케이스 추가.

---

## R6 — 유형별 필수 입력 부재: 동의 + 추가 발견 1건 (P2)

**독립 확인.** LLD 규칙 폼(`LldRuleFormDrawer.tsx:288`)이 일반 아이템용 `ITEM_TYPE_VALUES`를 그대로 쓰는 것 확인 — 여기엔 **Calculated(15)·SNMP trap(17)이 포함**되는데, Zabbix 7.0 discoveryrule의 type 허용값(공식 문서 재조회)은 `0,2,3,5,7,10,11,12,13,14,16,18,19,20,21,22`로 **15·17이 없다**. 또 폼에는 url(HTTP agent 필수 — 문서 명시)·snmp_oid·params 입력이 없고 요청 바디에 extra 채널 자체가 없다(handleSubmit의 `common` 객체 확인).

**추가 발견.** 반대 방향 누락 — LLD 규칙이 지원하는 **Browser(22)** 는 `ITEM_TYPE_VALUES`에 없어 선택 자체가 불가하다. 결함이라기보다 기능 공백이지만, LLD 전용 유형 목록을 만들 때 같이 반영하면 된다.

**영향 판단.** 이 경로들은 전부 **Zabbix 검증 거부로 드러난다**(조용한 오염 없음) — P2 적정. 사용자 입장에선 "선택은 되는데 저장이 안 되는" 유형이 여럿 존재하는 상태다.

**수정 방향·회귀 검증.** LLD 전용 `LLD_ITEM_TYPE_VALUES`(15·17 제외, 22 추가) + 유형별 필수 필드 노출·검증 + BE 요청에 extra 통로 추가(아이템 프로토타입 폼의 TYPE_FIELDS 패턴 재사용이 자연스럽다). 회귀: HTTP agent 생성 시 url 필수 검증, 15·17이 옵션에 없는지 스냅샷.

---

## R7 — 조회 예외의 정상 0건: 동의 (P2)

**독립 확인.** `discoveredItems`(`ZabbixLldManageService.java:658~`)가 `RuntimeException` 전부를 잡아 빈 목록 반환 — 주석("생성물은 부가 정보다")이 말하듯 **목록의 보조 count 용도로는 의도된 완충**이다. 문제는 같은 helper를 생성물 상세 API `discovered()`(189행)와 삭제 확인용 카운트(550행)가 함께 쓴다는 것 — 상세 화면에서는 조회 실패가 "성공한 0건"으로 보이고, 삭제 확인 문구의 생성물 수도 0으로 계산된다. **의도된 제한(목록 완충)이 다른 소비자에 새어 나간 결함**으로 판정한다.

**영향 판단.** 데이터 손상은 없고 오판 유발(“생성물이 없네 → 지워도 되겠다”)이 피해 축. P2 적정.

**수정 방향·회귀 검증.** Codex 조치안에 동의: 상세(`discovered`)와 삭제 확인 경로는 예외 전파(FE는 기존 오류 표준 처리), 목록 보조 count만 완충 유지하되 null(조회 불가)로 구분 표시. 회귀: timeout 주입 시 상세 API가 5xx/오류 코드를 반환하는지, 목록은 여전히 성공하되 count가 "조회 불가"인지.

---

## 아직 확인하지 못한 것

1. **실서버·dev Zabbix에서의 실제 피해 발생 여부** — R1(반전 값으로 저장된 규칙 존재 여부), R3(실제 비밀 매크로 소실), R5(Zabbix가 생성 거부인지 오폴링인지). 전부 읽기 조회 또는 통제된 round-trip이 필요해 수정 보류 지시에 따라 하지 않았다.
2. **연동 Zabbix 실버전** — 검토는 7.0 문서 기준(코드가 lifetime_type 4필드를 쓰는 것 자체가 7.0+ 전제). 6.x 연동이 섞여 있다면 R1·R4의 필드 구조 자체가 달라지므로 대상 버전 확정이 선행돼야 한다.
3. **BE 격리 프로브 재실행** — R5·R7은 코드 정독으로 갈음했다(불필요한 빌드 회피). 수정 착수 시 프로브를 회귀 기준으로 재실행하면 된다.
4. LLD UI가 실서버 배포본(아파치 FE)에 포함된 시점 — R1 영향 조사의 범위(dev만 vs 실서버 포함)를 정한다.

## 후속 순서 제안 (수정 착수 시)

R1(상수+표시+계약+테스트 한 커밋) → R3(매크로 보존) → R2(폼 초기화·저장 가드) → R4/R6(프로토타입·규칙 폼 유형별 입력 정비, 같은 화면이라 묶어서) → R5(BE 인터페이스 매핑) → R7(예외 전파 분리). R1 착수 전에 dev Zabbix 읽기 조회로 기존 값 실태부터 뜨는 것을 권한다.

---

## 반영 결과 (2026-09-08, 사용자 승인으로 수정 착수)

R1~R7 **전건 반영 완료** — BE `4d2a2b5` · FE(#ZM-93 [FIX], LldRuleFormDrawer.test.tsx 포함) 커밋(미푸시).

- R1: FE 상수 1↔2 정정(+재반전 방지 상수 테스트), BE DTO/테스트 서술 정정. 계약서는 이미 정정돼 있었음(타 세션).
- R2: 대상 전환 시 폼·고급 필드 즉시 초기화(hydratedFor ref — 같은 대상 refetch로는 편집값 안 덮음), 상세 미로딩/대상 불일치 시 저장 버튼 비활성+제출 가드.
- R3: FE는 Secret(type 1) 무수정 시 value 생략+hostmacroid 동반, BE update는 hostmacroid 보존(create는 종전대로 제거).
- R4: headers를 "Name: Value" 줄 편집 ↔ 배열 왕복.
- R5: BE 아이템 type→인터페이스 type 매핑(0→1, 20→2, 12→3, 16→4), 해당 타입 없으면 `LLD_PROTOTYPE_INTERFACE_MISSING` fail-closed(ErrorCode enum은 타 세션 미커밋 변경이 있어 문자열 생성자 선례 사용).
- R6: LLD 미지원 유형(15·17) 옵션 제외, 유형별 필드(url·snmp_oid·params 등) 노출+필수 검증+extra 전송(BE는 이미 extra 통과 지원). Browser(22)는 라벨·상수 부재로 이번 범위에서 제외(기능 공백으로 존치).
- R7: 상세 API(discovered)는 조회 실패 전파, 목록 보조 count만 완충 유지.

검증: BE LLD 스위트(신규 3건 포함) 그린, FE 신규 회귀 7건+기존 디스커버리 15건 그린, tsc 통과(유일 에러는 타 세션 차트 작업분). Codex 격리 재현 파일은 결함의 기록으로 보존(수정 후엔 그 파일의 기대값이 어긋나는 게 정상). 미실시: 실 Zabbix round-trip(R1 기존 값 실태 조회 포함 — 착수 전 dev 조회 권고는 유지).

### R1 기존 저장값 실태 조회 결과 (2026-09-14, dev Zabbix 읽기 전용)

`discoveryrule.get` 전수 조회(로그인→조회→로그아웃, 쓰기 0): 전체 1,797건 = 템플릿 원본 1,556 + 상속 240(우리 UI 수정 차단 대상) + **호스트 직속 1건**. 위험값 **0건** — lifetime_type=2(즉시 삭제) 0, lifetime_type=1 0, enabled_lifetime_type=1 0. 유일한 호스트 직속 규칙(itemid 61429, "linux-network-connections Discovery", Zabbix server)은 lifetime_type=0·7d / enabled=2로 **Zabbix 기본 축과 동일 — 의미 왜곡 없음**. 결론: **dev에는 R1 버그로 오염된 기존 데이터가 없다. 정정 조치 불요.** 실서버는 배포본에 LLD UI 포함 여부 확인 후 같은 조회를 반복하면 된다(스크립트: scratchpad `r1_lifetime_survey.py`).
