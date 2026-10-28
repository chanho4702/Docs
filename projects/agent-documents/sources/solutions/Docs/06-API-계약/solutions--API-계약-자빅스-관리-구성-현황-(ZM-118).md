# API 계약 — 자빅스 관리 > 구성 현황 (ZM-118)

> 산출 2026-08-26 · BE `C:\worktrees\zm-118-be`(브랜치 ZM-118) · 설계 [devdesign_zabbix-config-overview.md](../02-%EC%84%A4%EA%B3%84/solutions--MovesEye-%EA%B0%9C%EB%B0%9C-%EC%84%A4%EA%B3%84-%EC%9E%90%EB%B9%85%EC%8A%A4-%EA%B4%80%EB%A6%AC-%EA%B5%AC%EC%84%B1-%ED%98%84%ED%99%A9-%EB%8C%80%EC%8B%9C%EB%B3%B4%EB%93%9C-%EB%8F%84%EB%A9%94%EC%9D%B8-KPI.md)
> **실 Zabbix 응답으로 검증된 계약**(dev 프로필, BE :3002). 아래 예시 값은 전부 실측이다.

## 0. 공통

- 경로 접두사 `/zabbix-manage/overview` · 전부 **GET, read-only, 관리자 전용**(`x-visitor-id` 헤더 필수)
- 공통 쿼리: `refresh=true`(캐시 무시). 통합·호스트만 `groupId=`(Zabbix 호스트그룹 ID) 추가
- 모든 응답 최상위에 `collectedAt`(`yyyy-MM-ddTHH:mm:ss.SSSZ`)과 `degraded: string[]`
- 🔴 **`degraded`가 계약의 핵심**: Zabbix 콜 하나가 죽거나 규모 상한에 걸리면 **200을 유지한 채** 그 섹션만 비고 코드가 실린다. FE는 해당 카드에만 "불러오지 못했습니다"를 띄우고 나머지는 정상 렌더한다.

- 🔴 **라벨은 BE가 만들지 않는다.** `BucketDto.code`는 코드(우리 분류 코드 또는 Zabbix 원본 번호)이고 번역은 FE `configuration_overview.*` 몫이다. 고유명이 필요한 축만 `NamedBucketDto{id,name,count}`이며, 상위 N 뒤의 "기타" 칸은 **`id`·`name`이 둘 다 null**이다.

```ts
type TBucket = { code: string; count: number };
type TNamedBucket = { id: string | null; name: string | null; count: number };
```

### 0.1 degraded 코드 목록

| 코드 | 언제 | 그때 비는 것 |
|---|---|---|
| `itemCounts` | 아이템 count 콜이 하나라도 실패 | 수집 기준 카드(상태·수집 상태·출처)와 정의 위치 |
| `itemDefinitionScan` | 정의 전건 스캔 실패 또는 규모 상한 초과 | 타입·값 유형·수집 주기 |
| `triggerCounts` | 트리거 count 콜 실패 | 트리거 대시보드 전 카드 |
| `actionCounts` | 액션 count 콜 실패 | 이벤트 소스별 액션 |
| `mediaTypes` · `scripts` · `maintenances` | 해당 목록 조회 실패 | 배달 경로·미디어 종류 / 요약 수치 |
| `hostGroups` · `proxyNames` | 그룹·프록시 이름 조회 실패 | 그룹 목록(스코프 선택지)·프록시 이름 |
| `hosts` · `templates` · `items` · `triggers` · `alerts` · `coverage` · `changes` | 통합 EP에서 그 도메인 집계 자체가 실패 | 그 도메인에서 온 모든 칸 |

> 🔴 **통합 EP는 하위 도메인의 degraded를 자기 degraded에 합쳐서 준다.** 즉 `/overview`만 봐도 무엇이 비었는지 알 수 있다.
> 🔴 **count 실패를 0으로 채우지 않는다.** 채우면 Zabbix 일시 오류가 "아이템 0개"로 조용히 나간다 — 실제로 `countOutput`을 빠뜨렸을 때 모든 수가 0으로 보인 적이 있다.
## 1. `GET /zabbix-manage/overview` — 통합

```jsonc
{
  "collectedAt": "2026-08-26T14:05:07.238Z",
  "degraded": [],
  "counts": { "hosts": 76, "hostsEnabled": 74, "hostGroups": 30, "templates": 347, "templatesInUse": 39,
              "itemsDefined": 7891, "itemsCollecting": 11834, "triggersDefined": 3009, "triggersLive": 3662,
              "actions": 17, "actionsEnabled": 8, "mediaTypes": 46, "mediaTypesUsed": 8, "agentOk": 9 },
  "usage": [ { "domain": "templates", "total": 347, "inUse": 39 },
             { "domain": "mediaTypes", "total": 46, "inUse": 8 },
             { "domain": "actions", "total": 17, "inUse": 8 },
             { "domain": "scripts", "total": 6, "inUse": 1 },
             { "domain": "items", "total": 11834, "inUse": 8266 } ],
  "hostConnectivity": [ {"code":"agentOk","count":9}, {"code":"agentDown","count":44},
                        {"code":"agentUnknown","count":11}, {"code":"noInterface","count":10},
                        {"code":"disabled","count":2} ],
  "pipeline": [ {"code":"total","count":76}, {"code":"enabled","count":74},
                {"code":"withTemplate","count":72}, {"code":"withItem","count":72},
                {"code":"withTrigger","count":69} ],
  "topHostGroups": [ {"id":"2","name":"Linux servers","count":40}, … ],
  "monitoredBy": [ {"code":"server","count":9}, {"code":"proxy","count":67}, {"code":"proxyGroup","count":0} ],
  "proxies": [ {"id":"1","name":"ZabbixProxyDemo","count":67} ],
  "recentChanges": [ {"date":"2026-08-18","entityType":"ACTION","count":4}, … ],
  "queue": [ {"code":"noTemplate","count":2}, {"code":"collectingNothing","count":1},
             {"code":"noTrigger","count":4}, {"code":"agentUnreachable","count":44},
             {"code":"unclassifiedHost","count":61}, {"code":"noInterface","count":10},
             {"code":"unusedTemplate","count":308}, {"code":"idleMediaType","count":4},
             {"code":"noMaintenance","count":1} ]
}
```

**FE가 알아야 할 것**
- `usage[].inUse`의 "쓰인다"는 도메인마다 정의가 다르다: 템플릿=호스트에 연결됨 · 미디어=액션이 참조함 · 액션=활성 · 스크립트=액션이 참조함 · **아이템=값이 정상 수집됨(state=0)**. 카드 부제에 이 정의를 적는다.
- `pipeline`은 **누적 교집합**이라 항상 단조감소한다(퍼널로 그려도 안전). 앞 단계를 통과한 호스트만 다음 단계에 센다.
- `queue`의 `noMaintenance`는 건수가 아니라 **플래그**다(0 또는 1) — "점검 기간이 하나도 없음".
- `hostGroups`는 **Zabbix 원본 그룹 수**(30)다. 우리 DB `host_group` 테이블(7행)과 다른 수이므로 나란히 놓지 않는다.

## 2. `GET /zabbix-manage/overview/hosts`

`summary`: `total 76 · enabled 74 · disabled 2 · agentOk 9 · agentDown 44 · agentUnknown 11 · noInterface 10 · unclassified 61 · groupCount 30 · itemTotal 11834 · triggerTotal 3662`

| 필드 | 타입 | 실측 |
|---|---|---|
| `connectivity` | `TBucket[]` | agentOk/agentDown/agentUnknown/noInterface/disabled — **합 = 76(배타 5분류)** |
| `pipeline` | `TBucket[]` | 통합과 동일 |
| `groupConnectivity` | `{groupId,name,total,connectivity:TBucket[]}[]` | 상위 10 그룹. Linux servers 40 = ok 6 / down 31 / unknown 2 / disabled 1 |
| `interfaceTypes` | `TBucket[]` | agent 61 · noInterface 10 · snmp 3 · jmx 2 (호스트가 여러 타입을 가지면 각각 1회씩) |
| `deviceTypes` | `TBucket[]` | notClassified 61 · server 14 · network 1 |
| `templateLinkCounts` | `TBucket[]` | `0` 2 · `1` 51 · `2` 17 · `3plus` 6 |
| `monitoredBy` / `proxies` | `TBucket[]` / `TNamedBucket[]` | server 9 · proxy 67 · proxyGroup 0 / ZabbixProxyDemo 67. 🔴 화면은 **proxyGroup도 그려야 한다** — 그 호스트는 `proxyid`가 없어 `proxies`에 안 들어가므로 빼면 합이 총계와 어긋난다 |
| `topItemHosts` / `topTriggerHosts` | `TNamedBucket[]` | 상위 10 + 기타 칸 |
| `groups` | `TNamedBucket[]` | **Zabbix 호스트그룹 전체 30개**(이름순, count=호스트 수). count 0이면 빈 그룹 8개. 🔴 그룹 스코프 선택지는 이 목록을 쓴다 — 우리 DB `host_group`(7행)을 쓰면 고를 수 없는 그룹이 생긴다 |

🔴 **`agentUnknown`에는 SNMP/JMX 전용 호스트가 포함된다**(agent 인터페이스가 없어 상태를 알 수 없다). 툴팁에 명시할 것 — 안 쓰면 "SNMP 장비가 왜 미확인이냐"는 문의가 온다.

## 3. `GET /zabbix-manage/overview/templates`

`summary`: `total 347 · inUse 39 · unused 308 · groupCount 17 · itemTotal 7862 · triggerTotal 2991`

- `byGroup: TNamedBucket[]` — Network devices 120 · Applications 90 · Cloud 38 … + 기타 칸
- `topLinked: TNamedBucket[]` — 연결 호스트 수 상위 10 (최대 32)
- `topScale: {templateId,name,itemCount,triggerCount,linkedHostCount}[]` — 아이템+트리거 합 상위 10
- `unusedSamples: TNamedBucket[]` — **표본 최대 20건**(count는 항상 0). 전체 수는 `summary.unused`

## 4. `GET /zabbix-manage/overview/items`

🔴 **모집단이 둘이다. 화면 섹션 헤더에 어느 쪽인지 반드시 적는다.**

| 모집단 | 정의 | 실측 | 어떤 축이 이걸 쓰나 |
|---|---|---:|---|
| **정의** | `inherited:false, flags:0` — 아이템 렌즈 목록과 **같은 수** | 7,891 | `types` · `valueTypes` · `definedIn` · `delayBuckets` |
| **수집** | `templated:false` — 호스트에 실재(상속 사본·LLD 포함) | 11,834 | `status` · `state` · `origin` |

`summary`: `definitionTotal 7891 · collectingTotal 11834 · enabled 11793 · disabled 41 · normal 8266 · unsupported 3568 · discovered 9020`

- `types: TBucket[]` — code는 **Zabbix item type 번호**. 상위 10 + `others` 한 칸. 실측: `18`(의존) 3243 · `20`(SNMP) 2383 · `0`(agent) 559 · `3` 402 · `5` 283 …
- `valueTypes: TBucket[]` — `0` 2857 · `1` 1397 · `2` 163 · `3` 2476 · `4` 995 · **`5` 3**(🔴 Zabbix 7.0의 binary — FE 라벨 맵에 빠뜨리면 "5"가 그대로 보인다)
- `definedIn: TBucket[]` — template 7862 · host 29 (**합 = definitionTotal**)
- `origin: TBucket[]` — inherited 2785 · direct 29 · discovered 9020 (**합 = collectingTotal**)
- `delayBuckets: TBucket[]` — 고정 9칸 순서 `lt1m·eq1m·1to5m·5to10m·10mto1h·gt1h·nonCollecting·macro·unknown`. 실측 eq1m 2793 · nonCollecting 3420 · macro 52
  - 🔴 규모가 `app.overview.item-scan-cap`(기본 100,000)을 넘으면 **`types`·`valueTypes`·`delayBuckets`가 빈 배열**이 되고 `degraded`에 `itemDefinitionScan`이 실린다. 나머지 집계는 정상.

## 5. `GET /zabbix-manage/overview/triggers`

`summary`: `definitionTotal 3009 · liveTotal 3662 · enabled 3640 · disabled 22 · problem 313 · discovered 2983 · itemsPerTrigger 3.2`

- `severity: TBucket[]` — code는 Zabbix priority `0`~`5`. 실측 0:3 · 1:633 · 2:1115 · 3:732 · 4:467 · 5:59 (**합 = definitionTotal**)
- `definedIn` template 2991 · host 18 / `origin` inherited 661 · direct 18 · discovered 2983 (**합 = liveTotal**) / `value` ok 3349 · problem 313
- `itemsPerTrigger`는 **`number | null`** — 트리거가 0이면 null이고 화면은 "—"로 그린다(0.0으로 그리면 "완벽하다"로 읽힌다)

## 6. `GET /zabbix-manage/overview/alerts`

`summary`: `actions 17 · actionsEnabled 8 · mediaTypes 46 · mediaTypesEnabled 11 · mediaTypesUsed 8 · mediaTypesIdle 4 · scripts 6 · scriptsUsed 1 · maintenances 0 · maintenancesActive 0`

- `actionsBySource: {eventsource:0..4, enabled, disabled}[]` — 실측 0:6/5 · 1:2/1 · 2:0/0 · 3:0/3 · 4:0/0
- `delivery: TBucket[]` — `registered` 46 → `enabled` 11 → `used` 8 (3단 퍼널)
- `mediaTypeKinds: TBucket[]` — code는 Zabbix mediatype type. `4`(웹훅) 36 · `0`(이메일) 7 · `1`(스크립트) 2 · `2`(SMS) 1
- `mediaTypesIdle` = 켜져 있는데 어떤 액션도 참조하지 않는 것(4개). 작업 큐 항목

## 7. 성능 실측 (dev, 호스트 76 / 아이템 11.8천)

| EP | 캐시 미스 | 캐시 히트 | TTL |
|---|---:|---:|---:|
| `/overview` | 1.6s | 0.24s | 각 도메인 TTL을 따름 |
| `/overview/hosts` | 0.63s | — | 60s |
| `/overview/templates` | 0.16s | — | 300s |
| `/overview/items` | 0.75s | — | 300s |
| `/overview/triggers` | 0.31s | — | 300s |
| `/overview/alerts` | 0.53s | — | 300s |

## 8. 🔴 구현 중 실측으로 잡은 함정 (되돌리지 말 것)

1. **`countRaw`는 `countOutput`을 넣어 주지 않는다.** 호출자가 `params.countOutput = true`를 넣어야 한다. 빠뜨리면 Zabbix가 목록을 돌려주고 파서가 0으로 읽어 **에러 없이 모든 수가 0**이 된다(응답도 10초로 느려진다 → 처음 실측에서 실제로 그랬다).
2. **파이프라인은 누적 교집합이어야 한다.** 단계별 독립 판정이면 `withTemplate 72 < withItem 73`처럼 뒤 단계가 커져 퍼널이 깨진다(실측에서 실제로 나왔다).
3. **연결 상태는 배타 분류로 만들어야 합이 총계와 맞는다.** `available`을 그대로 세면 인터페이스 없는 호스트(10)와 agent 없는 SNMP 호스트(5)가 이중 계산되거나 누락된다.
4. **`definedInHost`와 출처의 `direct`는 같은 집합**이다(호스트에 있고 · 상속 아니고 · LLD 아님). 콜을 두 번 하지 않는다.
5. **호스트그룹이 두 벌이다.** Zabbix 원본 30개 vs 우리 DB `host_group` 7행. 이 화면은 Zabbix 원본이 정본.
