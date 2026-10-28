# 개발 설계서 — 디스커버리 (네트워크 + LLD)

> **v2 (2026-08-13)** — v1은 범위를 과하게 잡아 폐기했다. 이건 **Zabbix 디스커버리를 감싸는 CRUD 화면 2개**다.
> 선례: `features/zabbix-config/item-template-mgmt/contract_item-template-mgmt.md` · `features/zabbix-config/trigger-mgmt/contract_trigger-mgmt.md` (같은 모양으로 만든다)

---

## 1. 범위

| | 어디에 | 무엇을 |
|---|---|---|
| **LLD** | 호스트/템플릿 상세 > `디스커버리` 탭 (현재 빈 자리) | 규칙 CRUD + 프로토타입 조회 |
| **네트워크 디스커버리** | Zabbix 관리 > 신규 최상위 메뉴 | 규칙 CRUD |

**범위 밖**: 액션(`알림 > 액션`은 Zabbix에서도 별도 메뉴·별도 API). 단 규칙 화면에 *"연결된 액션 N건"*은
읽어서 표시한다 — 없으면 "규칙 만들었는데 호스트가 안 생긴다"가 그대로 우리 문의가 된다.

## 2. 배치 — 기존 관리 기능과 동일

```
FE   /zabbix-management/network-discovery              (신규 페이지)
     /zabbix-management/{host,template}/:id?tab=discovery   (빈 탭 교체)
      ↓
app  zabbixadmin/ZabbixNetworkDiscoveryManageController + Service
     zabbixadmin/ZabbixLldManageController + Service
      ↓
engine-api  zabbix/discovery/ZabbixDiscoveryService   (drule·dcheck·dhost·dservice)
            zabbix/lld/ZabbixLldService               (discoveryrule·*prototype)
      ↓
engine-zabbix  JSON-RPC 구현
```

**대원칙(아이템·트리거 관리 그대로)**: Zabbix가 정본 · 로컬 저장 0 · **Flyway 0건** ·
관리자 전용(`AdminAccessChecker.requireAdmin`) · 에러는 HTTP 200 + body `code` ·
감사는 `zabbix_change_log`에 `ENTITY_` 상수만 추가.

## 3. 엔드포인트

### LLD — `/zabbix-manage/discovery-rules`

| 메서드 | 경로 | Zabbix |
|---|---|---|
| GET | `?hostId=` 또는 `?templateId=` (필수) | `discoveryrule.get` |
| GET | `/{id}` | `discoveryrule.get` + `selectFilter`·`selectPreprocessing` |
| GET | `/{id}/item-prototypes` | `itemprototype.get` |
| GET | `/{id}/trigger-prototypes` | `triggerprototype.get` |
| GET | `/{id}/graph-prototypes` | `graphprototype.get` |
| GET | `/{id}/host-prototypes` | `hostprototype.get` |
| GET | `/{id}/discovered` | `item.get` `discoveryids` — 이 규칙이 실제로 만든 것 |
| POST · PUT · DELETE | | `discoveryrule.create/update/delete` |
| PATCH | `/{id}/status` | `discoveryrule.update` |

### 네트워크 — `/zabbix-manage/network-discovery`

| 메서드 | 경로 | Zabbix |
|---|---|---|
| GET | `/rules` | `drule.get` + `selectDChecks` |
| GET | `/rules/{id}` | `drule.get` |
| GET | `/rules/{id}/discovered` | `dhost.get` · `dservice.get` |
| GET | `/rules/{id}/actions` | `action.get` eventsource=1 (읽기 전용) |
| POST · PUT · DELETE | `/rules` `/rules/{id}` | `drule.create/update/delete` |
| PATCH | `/rules/{id}/status` | `drule.update` |

### BE가 계산해 얹는 값 (FE가 재계산하지 않는다)

| 필드 | 계산 |
|---|---|
| `ipCount` | `iprange` 파싱 → 대상 주소 수 |
| `createdItemCount` | 프로토타입별 실제 생성 아이템 수 |
| `actionCount` | 연결된 디스커버리 액션 수 — **🔴 아래 판정 규칙 참조** |
| `inherited` | 템플릿 상속 여부 → 수정 차단 (엔티티 렌즈 판정 재사용) |

**🔴 `actionCount` 판정 — `conditiontype=18`만 보면 틀린다.** 실측한 기본 액션은 규칙(18)이 아니라
**검사(`conditiontype=8`, value=`dcheckid`)로 연결**돼 있었다. 18만 세면 이 액션이 0건으로 나온다.

```
18 (discovery rule)   value == druleid           → 연결
19 (discovery check)  value ∈ 이 규칙의 dcheckid  → 연결
조건에 18·19 가 전혀 없음                         → 전역(모든 규칙에 적용) — 따로 표기
```
🔴 **8은 검사가 아니라 "발견된 서비스 종류"다**(2026-08-18 정정). 상태·수신값·서비스 종류·IP처럼
"어떤 장비에 반응할지"를 정하는 조건은 **어느 규칙인지 좁히지 않으므로** 범위 조건이 아니다.

호스트 생성 여부도 `operationtype=2`(호스트 추가)만 보면 안 된다 — 실측 액션은 `4`(호스트그룹 추가)만
가지고 있고, 그것만으로도 호스트가 생성된다.

## 4. 화면

### LLD 규칙 목록 (호스트/템플릿 상세 탭)

```
이름           키                   타입    주기  생성됨      상태  출처
Mounted FS    vfs.fs.discovery     Agent   1h    아이템 9    활성  템플릿 Linux… 🔒
```

`생성됨` 열이 규칙을 구체적으로 만든다. 상속(🔒)은 수정 불가 + 정의처 링크(`LensSourceCell` 재사용).

### 네트워크 디스커버리 규칙 목록

```
이름          IP 대역            대상수  주기  동시성  검사        발견   액션  상태
사내망 스캔    192.168.0.1-254    254    1h   20     ICMP,Agent  37대   1건   활성
```

**폼은 Zabbix 폼을 그대로 감싼다** — 이름 / Discovery by(서버·프록시) / IP 범위 / 갱신 간격 /
동시 검사 수(1개·무제한·커스텀) / 검사 항목 / 고유성 기준 / 표시명 / 활성.

유일하게 얹는 것: **대상 수를 숫자로 보여준다**(`ipCount`). 막지 않는다 — Zabbix가 계산해주지 않을 뿐이다.

## 5. 실측 결과 (2026-08-13, **Zabbix 7.0.27** 실서버 조회)

> 문서가 아니라 실물 응답이다. DTO는 여기에 맞춘다.

### drule — 규칙 1건(`Local network`, Zabbix 기본 샘플, **비활성**)

```
druleid · proxyid("0"=서버) · name · iprange · delay · status
concurrency_max ("0"=무제한, "1"=1개, 그 외=커스텀)
error            ← 규칙 실행 오류 메시지. 목록에 띄울 값
dchecks[]
```

**🔴 `dcheck`에 붙는 것들** — 규칙이 아니라 **검사 항목**의 필드다:

```
type("9"=Zabbix agent) · key_ · ports · allow_redirect
uniq("0")          ← 고유성 기준. 화면의 라디오는 "어느 검사에 uniq=1을 줄까"였다
host_source("1")   ← 기술 호스트명 출처
name_source("0")   ← 표시명 출처
snmp_community · snmpv3_* 7종
```

### discoveryrule(LLD) — **총 1,721건**. 샘플 `net.if.discovery`

```
lifetime("7d") · lifetime_type("0") · enabled_lifetime("0") · enabled_lifetime_type("2")
  ↑ 사라진 리소스 처리. 네 필드가 함께 움직인다 — 기간 하나로 표현 안 됨
filter{evaltype, formula, eval_formula, conditions[{macro, operator, value, formulaid}]}
lld_macro_paths[] · overrides[] · preprocessing[] · parameters[]
flags("1"=LLD) · discover · uuid · templateid(0=상속 아님) · master_itemid
+ 아이템 계열 전 필드(type · snmp_oid · authtype · url · posts · timeout · history …)
```

⚠️ **LLD 규칙은 아이템이다.** 폼은 아이템 편집 폼 + 필터/매크로경로/오버라이드다.

### 디스커버리 액션 — 1건(`Auto discovery. Linux servers.`, 기본 샘플, **비활성**)

```
filter.conditions  conditiontype 10(상태=Up) · 12(수신값~Linux) · 8(**서비스 종류**=Zabbix agent 9)
                   🔴 2026-08-18 정정 — 8을 "검사"로 잘못 읽었다. 8은 서비스 종류이고 검사는 19다.
                      "Zabbix agent"가 서비스 종류·검사 종류 양쪽에서 9이고 이 규칙의 dcheckid까지
                      9여서 값만 보고는 구분되지 않았다(Zabbix UI에서 "서비스 종류 같음"으로 확정).
                      → 이 액션은 규칙을 좁히는 조건이 없으므로 **전역**이다.
operations         operationtype 6(템플릿 연결) · 4(호스트그룹 추가)
```

## 6. 착수 순서

1. ~~실측~~ ✅ 완료 (§5)
2. **BE 계약** — `engine-api/zabbix/{discovery,lld}` 인터페이스 + `engine-zabbix` 구현
3. **BE 관리** — `zabbixadmin` 컨트롤러·서비스·DTO + 테스트, `features/zabbix-ops/discovery/contract_discovery.md` 산출
4. **FE LLD** — `DiscoveryPlaceholderTab` → `DiscoveryManagementTab`
5. **FE 네트워크** — 신규 페이지·라우트·메뉴 + `dataSources.ts`에 모듈 1줄

## 6. 별건으로 뺀 것

🔴 **`ARCHIVED`에서 `zabbixadmin` 조회가 실시간으로 나간다** — `LiveQueryGuard`는 엔진 포트
데코레이터 3종에만 쓰이고 `zabbixadmin/`에는 사용처가 0건이다. 즉 아이템·템플릿·트리거 관리 화면이
이미 실시간 차단을 우회하고 있다. **디스커버리와 무관한 기존 결함**이라 별도로 처리한다.
(출처: Codex 검수 C-6 — `review_discovery-design.md`)
