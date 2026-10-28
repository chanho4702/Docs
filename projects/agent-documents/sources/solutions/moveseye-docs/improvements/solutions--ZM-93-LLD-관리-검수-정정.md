---
title: LLD 관리 검수 정정 (enum 반전·Secret 보존·폼 수명)
doc_type: feature
issue: ZM-93
audience: [개발, 운영, QA]
status: current
owner: MovesEye 팀
baseline: 2026-09-14
source_of_truth: moveseye-be-spring `zabbixadmin/ZabbixLldManageService`·`ZabbixLldPrototypeManageService`, moveseyee_fe `pages/zabbix-management/discovery/`, 검수 기록 `_workspace/_archive/features/events/lld-management/review_zm-93-lld-codex.md`(Codex)·`features/events/lld-management/review_zm-93-lld-claude.md`(독립 검토+반영)
reviewed_at: 2026-09-14
review_cycle: event-driven
---

# LLD 관리 검수 정정 (`ZM-93` 후속, R1~R7)

## 0. 한눈에

| | |
|---|---|
| **왜** | 디스커버리(LLD) 관리 화면의 저장 경로에 결함 7건 — 최악은 "삭제 안 함" 선택이 **즉시 삭제**로 저장되던 enum 반전 |
| **뭐를** | LLD 규칙·프로토타입의 **저장 경로 전체**(FE 폼 3종 + BE 서비스 2종)를 정정했다 |
| **어떻게** | Zabbix 공식 문서와 enum 대조, 폼 수명 관리(ref), Secret "유지 vs 재설정" 프로토콜, 배열 왕복, 인터페이스 타입 매핑, 예외 전파 분리 |
| **결과** | 7건 전건 반영 + 회귀 테스트. 기존 데이터 조사 결과 **오염 0건 — 정정 조치 불요** |

## 1. 문제 — 어디서, 무엇이

**발생 지점: 자빅스 관리 > 디스커버리 화면의 폼 3종(FE)과 LLD 관리 서비스 2종(BE).**
2026-08-19에 들어간 LLD 관리 기능(#ZM-93)을 Codex가 전수 검수(2026-09-07)해 7건을 찾았고,
Claude가 독립 검토(소스 정독 + Zabbix 7.0 공식 문서 대조 + 격리 재현 재실행)로 **전건 실결함
동의** 후 반영했다.

| # | 결함 | 왜 위험한가 |
|---|---|---|
| R1 | lifetime enum 1↔2 반전 — FE 상수가 Zabbix 공식(0=기간 후, **1=하지 않음, 2=즉시**)과 반대 | "삭제 안 함" 선택 → 즉시 삭제 저장. **의도와 정반대의 파괴적 동작** |
| R2 | 규칙 전환 시 이전 폼 값 잔존 — B 상세 로딩 중 저장하면 A의 값이 B로 제출 | 다른 규칙의 필터·오버라이드가 통째로 덮임 |
| R3 | Secret macro 빈 값 전송 — 조회에 없는 비밀값(write-only)을 ""로 만들어 매 저장에 포함 | 호스트 프로토타입을 **편집만 해도 비밀값 소실**(복구 불가) |
| R4 | HTTP headers 배열을 `String()`으로 접어 `"[object Object]"` 전송 | 헤더 있는 프로토타입은 무엇을 고쳐도 저장 거부 |
| R5 | SNMP·JMX·IPMI 프로토타입도 Agent 인터페이스를 우선 선택 | 잘못된 인터페이스로 생성 거부 또는 오폴링 |
| R6 | LLD 미지원 유형(Calculated·SNMP trap) 노출 + 유형별 필수 입력(url·snmp_oid·params) 부재 | "선택은 되는데 저장은 안 되는" 유형 다수 |
| R7 | 생성물 조회 실패를 빈 목록으로 삼킴 | timeout이 "성공한 0건"으로 보여 조회 실패와 미생성을 구분 불가 |

## 2. 어떻게 처리했나

### 2.0 AS-IS → TO-BE (API 단위)

| API/경로 | AS-IS (원래) | TO-BE (변경 후) |
|---|---|---|
| LLD 규칙 생성·수정(`POST`/`PUT /zabbix-manage/discovery-rules`)의 lifetime | FE가 반전된 값 전송(하지 않음=2), BE 무변환 전달 → Zabbix에 "즉시 삭제"로 저장 | 상수 정정(하지 않음=1·즉시=2) — wire 값=Zabbix 공식 값. 상수값 자체를 테스트로 고정 |
| 같은 API의 유형(type) | 일반 아이템 유형 전체 노출(LLD 미지원 15·17 포함), url·snmp_oid·params 입력 없음 | LLD 지원 유형만 노출 + 유형별 필드 입력·필수 검증 → `extra`로 전달 |
| 규칙 수정 폼의 저장 | 상세 로딩 중에도 저장 가능 → 이전 규칙 값이 제출됨 | 대상 전환 즉시 폼 초기화 + 상세 도착 전 저장 차단(버튼 비활성+제출 가드) |
| 호스트 프로토타입 수정(`PUT .../prototypes`)의 macros | hostmacroid 제거 → 매 저장이 전량 삭제+재생성, Secret은 value:""로 재생성(**비밀 소실**) | update는 **hostmacroid 보존**(기존 매크로 갱신 의미), Secret 무수정 시 **value 생략 = 기존 값 유지** |
| 아이템 프로토타입의 headers | 배열을 `String()` → `"[object Object]"` 전송(저장 거부) | "Name: Value" 줄 편집 ↔ 배열 왕복 변환 |
| 아이템 프로토타입의 인터페이스 자동 선택(BE) | 무조건 Agent main → 없으면 목록 첫 번째 | 아이템 type→인터페이스 type 매핑(Agent→1·SNMP→2·IPMI→3·JMX→4), 없으면 명확한 오류(fail-closed) |
| 생성물 상세(`GET .../discovered`) | Zabbix 조회 실패 → 빈 목록(성공 위장) | 실패 전파(오류 응답). 목록의 보조 count만 완충 유지 |

### 2.1 대표 처리 흐름 — R3 Secret macro "유지 vs 재설정"

```
호스트 프로토타입 편집 열기
 ① 조회 응답의 매크로를 폼에 적재 — Secret(type 1)은 value가 안 오므로(write-only)
    빈 칸 + "저장된 값 유지(변경하려면 입력)" placeholder + hostmacroid·valueDirty=false 보관
 ② 사용자가 값을 입력하면 그 매크로만 valueDirty=true
 ③ 저장 시 매크로별로:
    - hostmacroid 있으면 실어 보냄 → Zabbix가 "기존 매크로 갱신"으로 처리
    - Secret + 미변경(valueDirty=false) → value 필드 자체를 생략 = 기존 비밀값 유지
    - 그 외(새 매크로·값 입력함) → value 포함
 ④ BE는 update일 때만 hostmacroid를 보존해 전달(create에 실리면 Zabbix가 거부)
```

### 2.2 대표 처리 흐름 — R2 폼 수명 관리

```
편집 대상이 A → B로 바뀌는 순간(hydratedFor ref로 감지)
 ① 폼·고급 필드(필터/전처리/매크로 경로/오버라이드)를 즉시 전부 초기화
 ② B의 상세가 "B의 것"으로 도착하기 전엔: 저장 버튼 비활성 + 제출 가드(이중 차단)
 ③ 상세 도착 → 폼 채움 → hydratedFor=B 기록
 ④ 같은 B의 재조회(refetch)가 와도 이미 채운 폼은 안 덮음 — 편집 중 값 보호
```

### 2.3 나머지 정정의 요지

- **R1**: 값 변환 계층을 두지 않고(변환 계층은 또 하나의 반전 기회) 상수 정의를 공식 enum과
  일치시킴 + **상수값 자체를 어서션하는 재반전 방지 테스트**.
- **R5**: 매핑에 없는 유형(simple·SSH·telnet — Zabbix가 임의 인터페이스 허용)은 종전 폴백
  유지. 매핑 유형은 같은 타입이 없으면 생성 거부 — "일단 만들어지는" 편의보다 "조용히 잘못
  동작" 차단.
- **R7**: "부가 정보의 완충"(목록 count)과 "상세의 정직함"(discovered API)을 분리 — 같은
  헬퍼를 쓰던 두 소비자의 요구가 달랐던 것이 원인.

## 3. 적용 범위

| 경로 | 이번 정정 |
|---|---|
| LLD 규칙 폼·상세(LldRuleFormDrawer·DetailDrawer) | ✅ R1·R2·R6 |
| 호스트 프로토타입 폼 | ✅ R2(생성 잔존)·R3 |
| 아이템 프로토타입 폼 | ✅ R4·R5(BE 선택 로직) |
| LLD 생성물 상세·목록 count(BE) | ✅ R7 |
| **네트워크 디스커버리(drule)** | ❌ 검수 범위 밖(별도 화면) |
| 트리거·그래프 프로토타입 폼 | ❌ 이번 검수에서 결함 미발견 |

## 4. 해결된 것

- 7건 전건 반영 — BE `4d2a2b5` · FE `5b0d3ce`. BE LLD 스위트(신규 3건 포함)·FE 신규 회귀
  7건(`LldRuleFormDrawer.test.tsx`)·기존 15건 전부 그린.
- **기존 데이터 오염 조사 완료**(2026-09-14, dev Zabbix 읽기 전용): 전체 규칙 1,797건 중
  버그 UI로 저장 가능했던 호스트 직속 규칙은 **1건**뿐이고 위험값(lifetime_type=2 등)은
  **0건** — R1로 오염된 데이터 없음, 정정 조치 불요.

## 5. 트레이드오프와 우려점

**트레이드오프(의도한 대가):**

- **fail-closed의 편의성 비용** — R5는 맞는 인터페이스가 없으면 생성을 거부(종전엔 아무거나
  골라서라도 생성). R2의 저장 차단도 같은 축 — 상세가 늦게 오는 환경에선 저장 버튼이 잠깐
  비활성.
- **Secret "유지"는 확인 불가** — value 생략이 기존 값을 유지한다는 건 Zabbix 계약이지 화면에서
  검증할 수 있는 게 아니다(비밀값은 영영 조회 불가) — Zabbix 자체 제약.
- **값 무변환 원칙** — 단순하지만 상수 정의 한 곳이 또 틀리면 같은 사고가 재발 — 그래서 상수값
  고정 테스트를 박았다.

**우려점(지켜봐야 할 것):**

- **실 Zabbix round-trip 미실측** — 저장·Secret 유지·인터페이스 선택 모두 단위·격리 테스트
  기준. 실제 쓰기가 발생하는 실측은 승인 후 별도 진행.
- **실서버 데이터 조사 미실시** — dev는 오염 0 확인. 실서버 배포본에 LLD UI(8/19 이후 빌드)가
  포함됐다면 같은 읽기 조회를 반복.
- **Browser(22) 유형 미지원 존치** — LLD가 지원하는 유형인데 선택 목록에 없다(기능 공백).

## 6. 함정 (다음 사람이 안 밟게)

- **외부 API enum은 공식 문서와 대조하고, 상수값 자체를 테스트로 고정하라** — 반전된 상수는
  타입도 컴파일도 통과하고 전 구간이 "정상 동작"으로 보인다. 잡는 방법은 문서 대조뿐.
- **write-only 필드는 "조회에 없음 = 빈 값"이 아니다** — str(undefined)→"" 같은 무심한
  정규화가 비밀값 파괴가 된다. 조회에 안 오는 필드는 "모름"으로 다뤄 전송에서 생략하라.
- **antd Form은 Drawer가 닫혀도 값이 남는다** — `destroyOnClose`여도 `Form.useForm` 스토어와
  부모 useState는 유지된다. 대상 전환형 폼은 "어느 대상으로 채웠나"를 명시적으로 관리할 것.
- **검수의 층이 다르면 잡히는 결함도 다르다** — 이 7건은 기능 QA(15건 그린)를 통과한 코드에서
  나왔고, 격리 재현(실제 폼 렌더+제출 바디 검증)이 잡았다. **격리 재현 파일은 결함의 기록이라
  수정 후엔 실패하는 게 정상** — 회귀 테스트는 정식 스위트에 올바른 기대값으로 따로 만든다.
