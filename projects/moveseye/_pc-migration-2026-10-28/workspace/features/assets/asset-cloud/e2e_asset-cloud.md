# E2E 런타임 검증 — 자산 관리 × 클라우드 통합 (ZM-119)

> 실행 2026-08-26 18:25~18:52 · Claude(functional-qa) · **런타임 행위 검증만**(정적 대조는 integration-qa 별도)
> 환경: BE `C:\worktrees\zm-119-be` → **:3001**(재기동/종료하지 않음) · FE `C:\worktrees\zm-119-fe` → **:5174**(내가 기동, 종료함)
> 계약 [features/assets/asset-cloud/contract_asset-cloud.md](contract_asset-cloud.md) v1.1 · 설계 [features/assets/asset-cloud/devdesign_asset-cloud.md](devdesign_asset-cloud.md)
> 브라우저: **Chrome MCP 미연결**(extension not connected) → 헤드리스 Chrome + CDP 직결로 대체(`scratchpad/cdp.mjs`, 별도 user-data-dir).
> 스크린샷 1장(시각 판정 항목만): `scratchpad/kpi_lg_1200.png`

## 결과 요약

| | 건수 |
|---|---|
| **PASS** | **12 시나리오 전부**(A1~A6 · B7~B12) |
| **FAIL / 결함** | **4건** — MEDIUM 2 · LOW 2 (아래 D1~D4) |
| 관찰·정보 | 6건 (N1~N6) |
| 선재(범위 밖) | 3건 (P1~P3) |

계약 §6의 실측 샘플과 값 수준에서 **전부 일치**했다. 신규 EP·필터·거부 코드·`clearFields`·대시보드 신규 필드는
계약대로 동작한다. 계약 §7이 "❌ 미검증"으로 남겨 둔 **`clearFields` 런타임**과 **경합 수정 런타임**을 이번에 닫았다.

---

## D — 결함

### 🔴 D1 (MEDIUM · fe-engineer, 부수적으로 be-engineer) 동기화 모달에서 소스를 **둘 다 해제해도** 실행되고, Zabbix 전량 동기화가 조용히 돈다

**재현**
1. `/asset/list` → `동기화` 버튼 → 모달(Zabbix ✔ / AWS(EC2) ☐ 기본)
2. Zabbix 체크박스를 **해제** → 두 체크박스 모두 `checked=false`
3. `동기화 실행` 버튼 상태 확인 → **`ENABLED`**(비활성화되지 않는다)
4. 클릭

**기대**: 대상이 없으므로 버튼이 비활성이거나, 실행해도 아무 소스도 돌지 않는다.
**실제**: 토스트 **`"추가 0건 · 갱신 76건"`** — Zabbix 자산 76건이 전부 갱신됐다.

**BE 쪽 원인 확인**(직접 왕복):
```
POST /assets/sync {"mode":"add_update","sources":[]}
→ {"added":0,"updated":76,"skipped":0,"total":76,"cloud":null}
```
계약 §2.2의 "`sources` **미지정** = `["zabbix"]`"는 이 필드를 모르는 **레거시 호출**을 위한 규칙인데,
BE가 **`sources: []`(명시적 빈 배열)를 "미지정"과 같게** 취급한다. 화면에서 사용자가 **의도적으로 모두 해제한 것**과
"이 필드를 모르는 호출"은 뜻이 반대다.

**영향**: 사용자가 "아무것도 고르지 않았다"고 믿는 상태에서 76건이 갱신된다(zabbix `updated_at` 전부 이동 →
자산 목록의 "최근 변경" 축이 흔들린다). 실제 실행에서 재현 100%.

**권고**: FE는 선택 0개면 `동기화 실행`을 disabled로. BE는 `sources: []`를 미지정과 구분(빈 배열 = 아무것도 안 함,
또는 400)하는 편이 안전하다 — 지금은 FE 한쪽만 고쳐도 API 직접 호출자에게 같은 함정이 남는다.

---

### 🟠 D2 (MEDIUM · fe-engineer) cloud 자산 상세가 **감가상각 화면으로 가는 진입점**을 그대로 열어 둔다 — 다 채우고 저장에서만 거부된다

**재현**
1. `/asset/list/176`(cloud 자산 `ec2-tokyo`) → "비용 정보" 필드 그룹 렌더 + **`비용 상세 보기` 링크 → `/asset/cost/hw/176`**
2. 그 화면이 정상 렌더됨: `상각 불가` / `상각을 계산할 수 없습니다` / **`비용 정보 수정` 버튼**
3. `비용 정보 수정` 클릭 → HW 상각 폼이 **전 필드 편집 가능**하게 열림(구매 비용·취득일·상각방법·내용연수·잔존 가치·유지보수·리스…)
4. `구매 비용 = 1000000` 입력 → `저장`

**기대**(설계 의도): 애초에 폼을 열지 않는다. `AssetCostSection.tsx`에 이 원칙이 주석으로 박혀 있다 —
*"cloud 자산은 상각 폼을 아예 그리지 않는다 … 폼을 열어 두면 사용자가 채우고 BE가 거부한다"*.
**실제**: 저장 시점에야 거부된다.
```
토스트: "클라우드(AWS) 자산은 감가상각 대상이 아니라 비용 정보를 저장할 수 없습니다.
        사용량 기준 월 추정 비용은 비용 > 클라우드 탭에서 확인하세요."
(BE: PATCH /costs/hw/176 → HTTP 200 + body {code:400, errorCode:"ASSET_COST_NOT_APPLICABLE"})
```

**평가**: 에러 처리 자체는 **정확하고 문구도 좋다**(저장 후 `costData`는 `{}` 그대로 — 잔여 없음). 결함은
**막았어야 할 원칙을 한쪽 폼(AssetFormModal)에만 적용하고 다른 경로(`/asset/cost/hw/{id}` 및 그 편집 모달,
그리고 상세의 "비용 정보" 그룹 + 링크)에는 적용하지 않은 것**이다. 계약 §3-12(HW 모집단에서 cloud 제외)와
화면이 어긋난다 — 모집단에 없는 자산의 상각 상세 화면이 존재한다.

**권고**: cloud 자산이면 (a) 상세의 "비용 정보" 그룹·`비용 상세 보기` 링크를 숨기고, (b) `/asset/cost/hw/{id}`가
cloud 자산이면 Cloud 탭으로 안내하거나 `비용 정보 수정`을 감춘다.

---

### 🟡 D3 (LOW · fe-engineer) Cloud 탭 **콘솔 에러 0 미달** — `<a>` 안에 `<a>`

시나리오 8의 "콘솔 에러 0" 기준 미달. `/asset/cost?tab=cloud` 진입 시 매번 2건:

```
In HTML, <a> cannot be a descendant of <a>. This will cause a hydration error.
  … <CloudBillingCompare summary={undefined}>
      <CloudBillingCard chartHeight={140} showDetailLink={false}>
        <LinkWithRef to="/setting/cloud-infra-info">  <a href="/setting/cloud-infra-info">
          … <Typography component="a">  <a class="ant-typography">
<a> cannot contain a nested <a>.
```

**출처**: `moveseyee_fe/src/pages/cloud-infra-monitoring/components/CloudBillingCard.tsx:73-75`
```tsx
<Link to={PATH_SETTING.cloudInfraInfo}>
  <Typography.Link>{t("cloud_cost.open_settings")}</Typography.Link>
</Link>
```
**선재 여부**: 이 73-75줄은 ZM-119 diff에 없다(선재). 다만 ① 이번에 그 컴포넌트를 Cloud 탭에 얹으면서 새 화면에
에러가 따라 들어왔고, ② **새로 추가한 110-112줄이 같은 안티패턴을 반복**한다(`showDetailLink` 블록 —
EC2 개요·홈 위젯에서 같은 에러를 낸다). 고칠 김에 둘 다 `<Typography.Link>` 대신 `<Link className=…>` 한 겹으로.

같은 페이지에 뜨는 `A props object containing a "key" prop is being spread into JSX`는 **P2 참조**(전 화면 공통, 범위 밖).

---

### 🟡 D4 (LOW · fe-engineer) cloud 자산 편집 폼의 배지가 "**Zabbix** 동기화 값 (읽기전용)"

`/asset/list/176` → `편집` 모달:
```
HW / 위치 / 네트워크   [Zabbix 동기화 값 (읽기전용)]     ← cloud 자산인데 Zabbix라고 적힌다
클라우드 리소스        [AWS 동기화 값 (읽기전용)]        ← 이쪽은 정확
```
`snapshotReadOnly = (isZabbix && !zabbixWriteOn) || isCloudAsset` 으로 **읽기전용 판정은 cloud도 포함**시켰는데
배지 문구는 Zabbix 고정이다. 이 자산은 Zabbix에 없다(`zabbixHostid: null`) — 사용자가 "Zabbix가 채운 값"으로 읽는다.

---

## N — 관찰 / 정보 (결함 미만, 판단 필요)

| # | 내용 | 주체 |
|---|---|---|
| **N1** | **날짜형 cloud 값이 원문 ISO 문자열 그대로 노출.** 상세: `가동 시작일 = 2025-04-14T05:34:26Z`, `최초 관측 = 2026-08-26T08:24:28.053023300`. 계약 §5-11의 BE 표기 수정(`…053Z`)이 반영돼도 **FE가 raw로 그리므로** 화면은 여전히 ISO 문자열이다. 다른 칸(활동 이력)은 `YYYY-MM-DD HH:mm:ss`로 포맷된다 — 같은 화면에 두 표기가 섞인다 | fe |
| **N2** | **시간 단가가 2자리로 반올림**된다. 편집 폼의 월 추정 카드: `시간 단가 $0.02`(실제 `hourlyUsd: 0.0152`). 단가는 소수 4자리가 필요하다 — $0.02는 30% 부풀린 값이다(총액은 정확하므로 표시만의 문제) | fe |
| **N3** | AWS만 선택해 실행해도 토스트 앞머리에 **Zabbix 구간이 붙는다**: `"추가 0건 · 갱신 0건 · AWS 추가 0건 · 갱신 0건 · 사라짐 0건"`. 계약 §2.2대로 최상위 4필드는 Zabbix 값이라 0이 맞지만, 안 돌린 구간을 "0건"으로 적으면 "돌았는데 0건"으로 읽힌다. 같은 모달에서 Zabbix 미선택 시 `모드`·`호스트그룹` 입력이 계속 보이는 것도 같은 계열 | fe |
| **N4** | **1200px(lg)에서 7번째 KPI 카드가 혼자 2행에 남는다.** 7장 전부 `lg={4}`(24÷4=6) → 6+1. 레이아웃은 깨지지 않으나 2행의 5/6이 빈다. 스크린샷 `scratchpad/kpi_lg_1200.png` | fe(판단) |
| **N5** | `clearFields` 활동 이력의 `cloudData` 항목이 **jsonb 전문 before/after(각 ~700자)** 를 그대로 싣는다. 실제 변화는 `link_basis` 키 하나인데 이력 화면이 JSON 두 덩어리를 렌더하게 된다 | be |
| **N6** | 링크 직후에도 `linkedHostName`이 `null`. `PATCH {"linkedHostid":"10697"}` → `linkedHostid:"10697"`, `coverage:"monitored"`인데 `linkedHostName:null`. 화면에서 "연결 Host: -"로 보인다 | be |

---

## P — 선재 / 범위 밖 (ZM-119 결함 아님, 오진 방지용 기록)

| # | 내용 |
|---|---|
| **P1** | `updatedAt`·`createdAt`·활동 이력 `createdAt`이 **KST 벽시계에 `Z`가 붙어** 내려온다. 화면은 이를 UTC로 읽어 **+9h**로 표시한다 — 18:30:31에 한 수정이 이력에 `2026-08-27 03:30:31`로 찍힌다. `lastSyncedAt`만 진짜 UTC. **전 자산 공통**(zabbix 자산도 `lastSyncedAt 09:29:24.261Z` vs `updatedAt 18:29:24.666Z`)이라 ZM-119 밖 |
| **P2** | `A props object containing a "key" prop is being spread into JSX` 콘솔 에러 — `/asset/list`·HW 탭·자산 대시보드 등 **모든 화면**에서 난다(Ant/rc 내부). Cloud 탭에서만 나는 게 아니다 |
| **P3** | 1200px에서 KRW KPI 값이 카드 폭을 넘어 **잘린다**(`₩389,706,08…`, `₩147,592,98…`, `₩1,847,900,`). 기존 6장도 같은 `lg={4}`라 클라우드 카드 추가와 무관 |

---

## E — 환경 제약 (검증 방법 변경)

| # | 내용 |
|---|---|
| **E1** | 🔴 **:3001에서 `cloud_snapshot` 5분 배치가 부팅(18:12) 이후 한 번도 돌지 않았다.** 매 회차 `Scheduler 'cloud_snapshot' skipped — 다른 인스턴스가 실행 중`(SchedulerManager.java:153, V21 분산 lease). :3000·:3002가 **같은 dev DB(5433)** 를 보고 있어 lease를 쥔다(`netstat`로 3포트 LISTENING 확인). **ZM-119 결함 아님** — 3인스턴스 공유 dev 환경의 산물. 시나리오 A6은 아래처럼 대체 검증했다 |
| **E2** | Chrome MCP extension 미연결 → 헤드리스 Chrome(`--remote-debugging-port=9333`, 전용 user-data-dir) + 직접 CDP로 검증. DOM/콘솔/네트워크/스크린샷 전부 가능했다 |
| **E3** | curl 세션이 브라우저 세션과 서로를 무효화한다(같은 계정, `x-visitor-id` 다름 — `INVALID_TOKEN` 반복). API 구간과 화면 구간을 분리하고 매 호출 전 재로그인해 회피 |

---

## 시나리오별 상세

### A1. `GET /cloud-infras/status` · `GET /costs/cloud` — ✅ PASS

```
GET /cloud-infras/status
→ {"state":"ready","source":"SETTING","settingPresent":true,
   "paidFeatures":{"costExplorer":false,"fleetMetrics":false}}
```
```
GET /costs/cloud
→ collection {state:"ok", reason:null, failedRegionCount:0}
  summary {estimatedMtdUsd:1.12, projectedMonthUsd:11.86, wasteMonthlyUsd:0.00,
           basis:"ON_DEMAND", instanceCount:1, assetLinkedCount:1, assetUnlinkedCount:0,
           billedMtdUsd:null, billingState:"disabled", diffPct:null}
  instances[0] {instanceId:"i-06ac35f551a92b5b1", name:"ec2-tokyo", region:"ap-northeast-1",
                instanceType:"t2.micro", os:"Linux", state:"running", runningHours:31.08,
                hourlyUsd:0.0152000000, computeMtdUsd:0.47, ebsGb:8, ebsMonthlyUsd:0.77,
                projectedMonthUsd:11.86,
                assetId:176, assetName:"ec2-tokyo", owner:null, lifecycle:"active", assetExcluded:false}
  waste[] · filterOptions {regions:["ap-northeast-1"], states:["running"], owners:[]}
```
- `summary` 필드 12개 전부 존재, `billingState:"disabled"`(옵트인 꺼짐) ✅
- `instances[0]`의 자산 조인 4필드 + `assetExcluded` ✅
- `hourlyUsd`가 `0.0152000000`(BigDecimal 후행 0). 계약 §6.1 표기는 `0.0152` — 값은 같다(파싱 무해). 표시는 N2 참조

**필터 실측 — 표만 좁히고 요약·후보값은 모집단 유지(계약 §1 🔴):**

| 요청 | `instances` | `summary.instanceCount` | `summary.estimatedMtdUsd` | `filterOptions.regions` |
|---|---:|---:|---:|---|
| (없음) | 1 | 1 | 1.12 | `["ap-northeast-1"]` |
| `?assetLinked=false` | **0** | **1** | **1.12** | **`["ap-northeast-1"]`** |
| `?assetLinked=true` | 1 | 1 | 1.12 | `["ap-northeast-1"]` |
| `?region=ap-northeast-1` | 1 | 1 | 1.12 | `["ap-northeast-1"]` |
| `?region=us-east-1` | 0 | 1 | 1.12 | `["ap-northeast-1"]` |
| `?resourceId=i-06ac…b5b1` | 1 | 1 | 1.12 | `["ap-northeast-1"]` |
| `?state=stopped` | 0 | 1 | 1.12 | `["ap-northeast-1"]` |
| `?owner=nobody` | 0 | 1 | 1.12 | `["ap-northeast-1"]` |
| `?source=bogus`(미지 파라미터) | 1 | 1 | 1.12 | `["ap-northeast-1"]` |

### A2. `POST /assets/sync` — ✅ PASS (경합 수정 런타임 확인 = 계약 §7의 ❌ 항목 닫음)

| 요청 | 응답 | 판정 |
|---|---|---|
| `{"mode":"add_update","sources":["cloud"]}` 1회차 (18:29:05) | `added:0 updated:0 skipped:0 total:0`, `cloud:{added:0,updated:0,missing:0,skipped:0,reason:null,failedRegions:[]}` | ✅ `reason` **null** |
| 같은 요청 2회차 (18:29:15, 연속) | 동일 | ✅ `reason` **null** — 초판의 첫 호출 `AWS_UNAVAILABLE`이 재현되지 않는다(경합 수정 유효) |
| `sources:["zabbix","cloud"]` | `updated:76 total:76` + `cloud{…reason:null}` | ✅ 두 섹션 모두 |
| `{"mode":"add_only"}`(sources 생략, 레거시) | `skipped:76 total:76`, **`cloud:null`** | ✅ 계약대로 |
| `sources:[" CLOUD "]`(대소문자·공백) | `cloud{…reason:null}` | ✅ 정규화됨 |
| `sources:["bogus"]` | `cloud:null`, zabbix도 0 | ✅ 조용히 무시 |
| `sources:[]`(빈 배열) | `updated:76`, `cloud:null` | ⚠️ **D1** |

이후 총 8회차(수동 6 + 화면 2)를 돌렸고 **전 회차 `added=0 updated=0 missing=0 skipped=0 reason=null`** — dirty check 유지.

### A3. 자산 목록·상세 — ✅ PASS

`GET /assets?source=cloud` → `total: 1`
```json
{"id":176,"source":"cloud","name":"ec2-tokyo","deviceType":"server","resourceType":"ec2",
 "location":null,"region":"ap-northeast-1","cloudResourceId":"i-06ac35f551a92b5b1",
 "coverage":"unmonitored","lifecycleStatus":"active","deploymentStatus":"deployed"}
```
`GET /assets/176` → `cloudData` 19키가 계약 §6.3과 **완전 일치**(`account`·`arn`·`link_basis` 키 없음),
`cloudResourceId:"i-06ac35f551a92b5b1"` ✅
- `first_seen_at: "2026-08-26T08:24:28.053023300"` — 계약 §5-11대로 **기존 자산은 옛 표기 유지**(수정은 신규 생성분부터). 화면 영향은 N1

### A4. `PATCH /assets/{id}` — ✅ PASS

**(a) `{"ownerName":"qa-temp"}`** → 200, `owner:"qa-temp"`, 이력 `{field:"ownerName", before:null, after:"qa-temp"}` ✅

**(b) 거부 — 전부 HTTP 200 + 바디 `code:400` + `errorCode`(레포 관례 확인)**

| 요청 | HTTP | errorCode |
|---|---|---|
| `{"costData":{"acquisitionCost":"1000"}}` | **200** | `ASSET_COST_NOT_APPLICABLE` |
| `{"cloudData":{"region":"x"}}` | **200** | `ASSET_CLOUD_READ_ONLY` |
| `{"name":"hacked"}` | **200** | `ASSET_CLOUD_READ_ONLY` |
| `{"resourceType":"rds"}` | **200** | `ASSET_CLOUD_READ_ONLY` |
| `{"inventoryMode":"manual"}` | **200** | `ASSET_CLOUD_READ_ONLY` |

**(c) `{"clearFields":["bogus"]}`** → HTTP 200 + `ASSET_INVALID_CLEAR_FIELD` ✅ / `{"clearFields":[]}` → 정상 200 ✅

**(d) `clearFields` 런타임 — 계약 §7의 ❌ 미검증 항목을 닫았다**

*d-1. 이미 미연결 상태(사전 GET: `linkedHostid=null`)에서 동봉*
```
PATCH /assets/176 {"notes":"qa","clearFields":["linkedHostid"]}
→ 200 · notes:"qa" · linkedHostid:null · coverage:"unmonitored" · link_basis: 없음
   이력 338: [{field:"notes", before:null, after:"qa"}]   ← linkedHostid 항목 없음
```
✅ 다른 필드는 반영, 해제는 **no-op**(빈 이력 없음 — 계약 §3-G "이미 미연결").

*d-2. 실제 연결 후 해제(기능 자체를 확인하려고 추가 수행)*
```
PATCH {"linkedHostid":"10697"}  → coverage: unmonitored → "monitored" (즉시 재파생)
                                  /assets/dashboard: cloudLinked 0→1, cloudUnlinked 1→0
PATCH {"notes":"qa-cleared","clearFields":["linkedHostid"]}
→ 200 · notes:"qa-cleared" · linkedHostid:null · coverage:"unmonitored"
       · cloud_data.link_basis = "manual_cleared"   ✅
   이력 340 = 4항목 한 번에: notes / linkedHostid(10697→null) / coverage(monitored→unmonitored) / cloudData
   /assets/dashboard: cloudLinked 1→0, cloudUnlinked 0→1 ✅
```
✅ **다른 편집과 한 요청에 실어도 둘 다 반영**되고, `manual_cleared` 표식이 심긴다.
⚠️ **원복 불가 잔여**: `cloud_data.link_basis = "manual_cleared"`가 자산 176에 남는다(아래 "환경 잔여" 참조).

### A5. HW 모집단 제외 · 대시보드 2종 — ✅ PASS

| 항목 | 실제 | 계약 §6 |
|---|---|---|
| `PATCH /costs/hw/176 {"acquisitionCost":1000}` | HTTP 200 + `ASSET_COST_NOT_APPLICABLE` | §3-13 ✅ |
| `GET /costs/hw` | `total: 79`, items에 176 **없음** | §6.5 (79) ✅ |
| `GET /costs/hw/incomplete` | `total: 11`, 176 **없음** | §3-12 ✅ |
| `GET /costs/dashboard` → `cloud` | `{projectedMonthUsd:11.86, estimatedMtdUsd:1.12, instanceCount:1, billedMtdUsd:null, state:"ok"}` | §6.5 ✅ |
| `GET /costs/dashboard` → `kpi.totalAssetCount` | **79** (cloud 미포함) | §3-12 ✅ |
| `GET /assets/dashboard` → `kpi` | `total:80, zabbixCount:78, customCount:1, cloudCount:1` | §6.4 ✅ (78+1+1=80) |
| → `bySourceCoverage` | `{zabbixMonitored:75, zabbixUnmonitored:3, customLinked:0, customUnlinked:1, cloudLinked:0, cloudUnlinked:1}` **합=80** | §6.4 ✅ |
| → `acquisitionUnknownCount` | **11** (불변) · `byAcquisitionYear` 2025 구간 **6** | §3-10 ✅ |
| → `tagCounts` | `unclassified:62, classification_tag_mismatch:29, owner_missing:12, host_unlinked:2, host_disabled:3, inventory_disabled:33, inventory_sparse:33, cost_missing:11, expired:12` | §6.4와 **전 항목 일치** ✅ (품질 태그 미적용 §3-11 실증) |

### A6. dirty check(§3-3) — ✅ PASS (배치는 E1로 관찰 불가 → 수동 동기화로 대체)

- 기준 시각: 자산 176 생성 `2026-08-26T17:24:33.331Z`(그대로 `createdAt = updatedAt`)
- 동기화 **8회차** 실행 후에도 `updatedAt`은 내 PATCH 시각(`18:43:09.548Z`)에 멈춰 있고, **동기화가 만든 활동 이력은 0건**
  (마지막 활동 id 341 = 내 PATCH, `actorType: user`. `system` 이력은 최초 `created` 335 하나뿐)
- `lastSyncedAt`만 회차마다 전진: `09:29:34.850Z → 09:47:54.091Z → 09:49:53 → 09:51:23.242Z` — 벌크 UPDATE가 `updated_at`을 흔들지 않는다 ✅
- 🔴 **5분 `cloud_snapshot` 배치 경유 확인은 못 했다** — E1 참조

---

### B7. 내비게이션 — ✅ PASS

- 사이드바 `모니터링 > 클라우드 인프라 모니터링` 하위: **`AWS 클라우드 개요` · `EC2 목록` · `VPC 그룹 목록` 3개뿐** — **"비용" 없음** ✅
  (전체 메뉴 링크 덤프에 `/cloud-infra-monitoring/cost` 부재 확인)
- `/cloud-infra-monitoring/cost` 직접 진입 → **`/asset/cost?tab=cloud`** 로 리다이렉트 ✅
- 글로벌 검색(Ctrl K)에 "클라우드 비용" 입력 → `자산 관리 › 클라우드 비용` 항목 노출 → 클릭 → `/asset/cost?tab=cloud`, 활성 탭 `클라우드 비용` ✅

### B8. Cloud 탭 — ✅ PASS (콘솔 에러만 D3)

요약 4카드가 API와 **값 일치**:
```
이번 달 추정 (진행분) $1.12   |  월말 예상 $11.86  |  월 낭비 추정 $0.00
자산 등록 커버리지 1 / 1 건 · 미등록 0대
```
- 온디맨드 고지 문구 렌더 ✅ (`추정 비용은 온디맨드 요금 × 실제 가동시간(5분 수집) 기준입니다. 예약 인스턴스·Savings Plans 할인과 데이터 전송비는 반영되지 않으며…`)
- 인스턴스 표 1행이 API와 일치: `ec2-tokyo | ec2-tokyo(active) | - | ap-northeast-1 | t2.micro | running | 31.08 | $0.47 | $0.77 (8GiB) | $11.86`
- 자산 링크 `<a href="/asset/list/176">ec2-tokyo</a>` ✅
- 실청구 카드 **잠금** 상태: `실청구액 연동(유료)이 꺼져 있습니다. 설정 > 클라우드 인프라에서 예상 비용을 확인하고 켤 수 있습니다.` + `설정 열기 →`(`/setting/cloud-infra-info`) ✅
- **"대조 한 줄"은 렌더되지 않는다 — 설계대로다.** `CloudBillingCompare.tsx:26` `comparable = billingState==="ok" && billedMtdUsd != null`.
  옵트인이 꺼져 있으니 대조 줄을 그리면 "차이 100%"라는 없는 사실을 만든다(코드 주석의 명시 판단). ✅ **결함 아님**
- 필터 4종 URL 반영 + 새로고침 유지:
  - 리전 선택 → `/asset/cost?tab=cloud&region=ap-northeast-1`, 표 1행 유지
  - 자산 등록 여부 `미등록` → `…&assetLinked=unlinked`, **표 0행 · 요약 4카드 불변(1.12 / 11.86 / 1 / 1)** + 안내 한 줄 등장:
    `요약 카드는 필터와 무관하게 전체 인스턴스 기준입니다. 아래 표만 필터가 적용됩니다.` ✅ (계약 §1 🔴과 일치)
  - 그 URL로 **새 로드** → 셀렉트 값(`ap-northeast-1`, `미등록`)·활성 탭(`클라우드 비용`)·표 0행 전부 복원 ✅
- 콘솔 에러: **D3**(nested `<a>` 2건) + P2(전 화면 공통 1건)

### B9. 자산 목록 배지 · 상세 · 편집 폼 — ✅ PASS (D2·D4·N1·N2 동반)

**목록** `/asset/list?source=cloud`:
```
[AWS](orange tag) ec2-tokyo | 서버 | - | ap-northeast-1 | - | 모니터링 안됨 | 사용중 | 배포됨
헤더: 이름 · 기기 유형 · 호스트 그룹 · 위치 · 소유자 · 커버리지 · 라이프사이클 · 배포
```
`위치` 칸에 **리전**이 들어간다(자산 `location`은 null) ✅

**상세** `/asset/list/176`:
- `AWS 식별 정보`: **`AWS 계정 ID = 미수집`**, **`ARN = 미수집`**(툴팁 동반) — "-"가 아니다 ✅ (계약 §5-3)
- `인스턴스 사양·상태` 6필드 / `클라우드 네트워크` 7필드 / `AWS 동기화 이력` 렌더 ✅
- ⚠️ `비용 정보` 그룹이 그대로 렌더되고 `비용 상세 보기`가 있다 → **D2**
- ⚠️ 날짜가 raw ISO → **N1**

**편집 폼**(`편집` 버튼):
- `클라우드 리소스` 섹션에 **`AWS 동기화 값 (읽기전용)` 배지** + 설명:
  `AWS에서 동기화된 자산입니다. 계정·리전·인스턴스 정보는 5분마다 AWS 값으로 갱신되므로 읽기전용입니다. 담당자·메모·기기분류·생애주기는 편집해도 동기화가 덮어쓰지 않습니다.` ✅
- **disabled 판정 실측**(41개 폼 필드 전수):
  - `DISABLED`: 이름 · 리소스/HW · 배포 · HW 정보 7 · HW 생애주기 3 · 위치 8 · 네트워크 3 · **AWS 계정 ID · 리전 · 리소스 ID · ARN · 리소스 상태 · VPC ID · 서브넷 ID · 보안 그룹 ID · 프라이빗 IP · 인터넷 노출** ✅
  - `enabled`: **비고 · 소유자 · 기기 유형 · Host ID · 라이프사이클** ✅ (계약 §3-G 편집 가능 목록과 일치)
- `비용 정보` → **감가상각 폼 대신 월 추정 카드** ✅
  `클라우드 자산은 감가상각 대상이 아닙니다. 사용량 기준 월 추정 비용으로 관리합니다.`
  `가동시간(h) 31.08 | 시간 단가 $0.02 | 컴퓨트 (MTD) $0.47 | EBS (월) $0.77 (8GiB) | 월 예상 $11.86` + `클라우드 비용 전체 보기 →`
  (시간 단가 반올림은 N2)
- **연결 해제 버튼 미노출** ✅ — 자산 176은 `linkedHostid: null`이고 `canUnlink = isEdit && !!asset?.linkedHostid`.
  모달 버튼 목록: `속성 추가 · 취소 · 저장`(해제 버튼 없음). 계약 §3-G "이미 미연결 = no-op"과 화면이 일치

### B10. 동기화 모달 — ✅ PASS (D1 동반)

```
동기화 대상:  ☑ Zabbix   ☐ AWS(EC2)      ← AWS 체크박스 disabled=false (status=ready라 활성) ✅
모드: 신규 추가 + 기존 갱신 / 신규만 추가
호스트그룹: 전체 호스트그룹
```
AWS만 체크(Zabbix 해제) → `동기화 실행` → 약 10초 후 토스트:
```
추가 0건 · 갱신 0건 · AWS 추가 0건 · 갱신 0건 · 사라짐 0건       ← cloud 섹션 포함 ✅ (앞머리는 N3)
```
둘 다 해제한 경우는 **D1**.

### B11. 대시보드 2종 — ✅ PASS

**자산 대시보드** `/asset/dashboard`:
- KPI `관리 자산 80건` / `Zabbix 78 · MovesEye 1 · AWS 1 · 제외 0` ✅
- `출처 × 모니터링` **6구간**: `Zabbix·모니터링 75 / Zabbix·호스트 비활성 3 / MovesEye·호스트 연결 0 / MovesEye·연결 없음 1 / **AWS·감시 중 0** / **AWS·감시 안 함 1**` ✅
- 딥링크: `AWS · 감시 안 함` 클릭 → **`/asset/list?source=cloud&coverage=unmonitored&offset=0&limit=10`** ✅
  (`AWS · 감시 중`은 `source=cloud`만 — 코드상 확인)

**비용 대시보드** `/asset/cost?tab=dashboard`:
- `현재 조건에 해당하는 **79건** 기준입니다` — cloud 제외 ✅
- KPI 7장 중 마지막이 신규 카드:
  ```
  클라우드 월 추정(USD)  $11.86
  인스턴스 1대 · 실청구 MTD 미연동
  ```
  링크 `<a href="/asset/cost?tab=cloud">` ✅ · KRW 카드와 **합산하지 않고 나란히**(계약 §2.3 통화 합산 금지) ✅
- **1200px 스크린샷**: `scratchpad/kpi_lg_1200.png` — 1행 6장 + 2행에 클라우드 카드 1장(N4). 페이지 가로 스크롤 없음(`scrollWidth 1185 = clientWidth 1185`)

### B12. 모바일 375px Cloud 탭 — ✅ PASS

```
document.documentElement.scrollWidth = 375
document.documentElement.clientWidth = 375   ← 페이지 가로 스크롤 없음 ✅
body.scrollWidth = 375
```
넓은 인스턴스 표(1073px)는 **자기 컨테이너 안에서만** 스크롤한다(`.ant-table-body` `scrollWidth 1073 / clientWidth 295`, `overflow-x: auto`) — 올바른 패턴 ✅

---

## 환경 잔여 (원복 상태)

자산 176(`ec2-tokyo`, `i-06ac35f551a92b5b1`)에 대해 **제외(DELETE)·실 AWS 쓰기는 하지 않았다.**

| 항목 | 원값 | 현재 | 비고 |
|---|---|---|---|
| `ownerName` | `null` | `""` | ⚠️ **완전 원복 불가** — `null`은 "미변경"이고 `clearFields`는 `linkedHostid`만 허용(N/A: 계약 §3-G). `""`도 `owner_missing`으로 집계되어 **동작상 동일**(대시보드 `owner_missing: 12` 불변 확인) |
| `notes` | `null` | `""` | 같은 이유 |
| `linkedHostid` | `null` | `null` | ✅ 원복 |
| `cloud_data.link_basis` | (키 없음) | **`"manual_cleared"`** | ⚠️ **원복 불가**(사전 고지된 항목). 이 EC2는 Zabbix 후보가 0건이라 실질 영향 없음. `INSTANCE_ID_EXACT` 매치가 생기면 표식은 자동으로 풀린다 |
| `costData` · `excluded` · `lifecycleStatus` · `deviceType` | `{}` / false / active / server | 동일 | ✅ 무변경(거부된 저장 시도도 잔여 없음) |
| 활동 이력 | 335(created) | 341까지 (QA PATCH 6건 추가) | 삭제 불가 |

zabbix 자산 76건은 `sources` 실험으로 `updated_at`이 이동했다(값 변경 없음, `add_update` 정상 경로).

## 정리

- FE **:5174 종료 완료**(내가 띄운 것만). BE **:3001·:3000·:3002 무접촉**.
- 헤드리스 Chrome(9333) 종료, 임시 프로파일은 scratchpad.
- 재현 스크립트·응답 덤프·스크린샷은 전부 scratchpad(`cdp.mjs`, `q.sh`, `c*.json`, `o*.txt`, `kpi_lg_1200.png`).

---

# 재검증(2차) — QA 결함·코덱스 검수 반영분 (2026-08-26 19:30~19:45)

> BE `:3001` 최종 코드·V37 적용 상태(무접촉) · FE `:5174` 재기동(격리 worktree) · 코드 수정 없음
> 지정된 **8항목만** 검증. 브라우저는 1차와 동일하게 헤드리스 Chrome + CDP(포트 9334, 전용 프로파일).
> 스크린샷 1장: `scratchpad/kpi_lg_1200_r2.png`

## 결과: **8항목 전부 PASS**

| # | 항목 | 결과 |
|---|---|---|
| 1 | `/cloud-infra-monitoring/cost` 리다이렉트(쿼리 보존·tab 덮어쓰기) | ✅ PASS |
| 2 | 동기화 소스 0개 차단(UI+API) | ✅ PASS — **D1 해소** |
| 3 | `/asset/cost/hw/{cloud}` 상각 화면 미렌더 + `depreciation` 호출 0건 | ✅ PASS — **D2 해소** |
| 4 | 완성도 KPI 부제·`completenessExcludedCount` · `cloudLinked` 딥링크 | ✅ PASS |
| 5 | Cloud 탭 실패 UI 3분기 | ✅ PASS |
| 6 | 낙관적 잠금 순차 200 / 충돌 재현 시도 | ✅ PASS (충돌은 **재현 못 함** — 아래) |
| 7 | 1200px KPI 7카드 한 줄 · `launch_time` 포맷 · 미수집 4칸 | ✅ PASS (⚠️ R2 동반) |
| 8 | 콘솔 에러 0(중첩 `<a>` 소멸) | ✅ PASS — **D3 해소** |

1차에서 올린 결함 **D1·D2·D3 전부 해소 확인**. D4(배지 문구)는 이번 8항목 범위 밖이라 미확인.

---

## 1. `/cloud-infra-monitoring/cost` 리다이렉트 — ✅ PASS

```
입력: /cloud-infra-monitoring/cost?region=ap-northeast-1&tab=hw
착지: /asset/cost?region=ap-northeast-1&tab=cloud
```
- **쿼리 보존**: `region=ap-northeast-1` 그대로 이월 ✅
- **tab 덮어쓰기**: 입력의 `tab=hw`가 `tab=cloud`로 교체됨 ✅ (활성 탭 DOM `클라우드 비용`)
- **필터 셀렉트에 실제로 반영**: `["ap-northeast-1", "상태", "소유자", "자산 등록 여부"]` ✅
- **미구성 게이트 카드에 걸리지 않음** ✅ — 정상 Cloud 탭이 렌더되고 요약 4카드·표 1행이 표시된다
  ```
  이번 달 추정 (진행분) $1.15 | 월말 예상 $11.86 | 월 낭비 추정 $0.00 | 자산 등록 커버리지 1 / 1 건
  ```
- 부수 확인: 표 헤더 첫 칸이 `instance` → **`인스턴스`** 로 번역됐다(1차 미번역 지점)

> ℹ️ 진입 직후 8초 시점에는 요약 카드·표가 비어 있다가 12초 근처에 채워진다(AWS `Describe*` 팬아웃 왕복).
> 스피너는 정상 표시되고 최종 상태는 정확 — **결함 아님**. 자동 검증 시 대기 시간을 12초 이상 잡을 것.

## 2. 동기화 소스 0개 차단 — ✅ PASS (**D1 해소**)

**UI** (`/asset/list` → `동기화`)

| 상태 | `동기화 실행` | 모달 문구 |
|---|---|---|
| 기본 (Zabbix ✔ / AWS ☐) | ENABLED | — |
| **둘 다 해제** | **DISABLED** | **`동기화할 대상을 하나 이상 선택하세요.`** ✅ |
| AWS만 ✔ | ENABLED | 경고 문구 사라짐 ✅ |

AWS만 선택해 실행 → 토스트에 cloud 섹션 포함:
```
추가 0건 · 갱신 0건 · AWS 추가 0건 · 갱신 0건 · 사라짐 0건
```
1차의 "두 소스 해제 후 실행 → Zabbix 76건 갱신"은 **재현 불가**(버튼이 눌리지 않는다).

**API 직접** — 레포 관례대로 **HTTP 200 + 바디 `code:400` + `errorCode`**

| 요청 | HTTP | 바디 |
|---|---|---|
| `{"mode":"add_update","sources":[]}` | **200** | `{"status":"error","code":400,"errorCode":"ASSET_SYNC_NO_SOURCE"}` ✅ |
| `{"mode":"add_update","sources":["gcp"]}` | **200** | `{"status":"error","code":400,"errorCode":"ASSET_INVALID_SYNC_SOURCE"}` ✅ |
| `{"mode":"add_only"}` (sources 생략, 레거시) | 200 | `{"added":0,"updated":0,"skipped":76,"total":76,"cloud":null}` ✅ **하위호환 유지** |

🔴 핵심: **"미지정"(레거시 = zabbix)과 "빈 배열"(명시적 0개 = 거부)이 이제 갈린다.** 1차 D1의 근본 원인이 닫혔고,
`["gcp"]` 같은 미지 소스도 1차의 "조용히 무시" 대신 명시적 거부로 바뀌었다.

## 3. `/asset/cost/hw/176` — 상각 화면 미렌더 + 호출 0건 — ✅ PASS (**D2 해소**)

`/asset/cost/hw/176` 직접 진입(주소창 입력) 후 13초 대기:

**렌더 내용 전부**
```
176
클라우드 자산은 상각 대상이 아닙니다. 사용량 기준 월 추정 비용은 비용 > 클라우드 탭에서 확인하세요.
[클라우드 비용 전체 보기 →]  [자산 상세로]
```
- 1차에 있던 `상각 파라미터` 표 · `장부가액 추이` · `연차별 상각 스케줄` · **`비용 정보 수정` 버튼 전부 사라짐** ✅
- 버튼 목록 = `클라우드 비용 전체 보기 → · 자산 상세로` (편집 진입점 없음) ✅
- 링크 `/asset/cost?tab=cloud` ✅

**네트워크 실측**(CDP `Network.requestWillBeSent` 전수 수집, 진입 직전 초기화)
```
필터 "/costs/hw/176"     → count 0   ✅
필터 "depreciation"       → count 0   ✅
:3001로 나간 요청 전부(6 + preflight 6):
  GET /features · GET /cloud-infras/status · GET /event/bells · GET /settings/device-classifications
  GET /assets/176 · GET /users/me/permissions
```
🔴 **`GET /assets/176` 하나로 source를 판정한 뒤 상각 API를 아예 부르지 않는다** — 지시대로 "자산 상세 판정 후 미호출".

**자산 상세(176)의 "비용 정보" 링크**
```
1차: 비용 상세 보기 → /asset/cost/hw/176
2차: 클라우드 비용 전체 보기 → /asset/cost?tab=cloud     ✅
```
상세 페이지 전체 링크 중 `cost` 계열은 `/asset/cost`(브레드크럼)와 `/asset/cost?tab=cloud` 둘뿐 —
**`/asset/cost/hw/176`으로 가는 경로가 화면에서 사라졌다.**

> ℹ️ 관찰(범위 밖): "비용 정보" **필드 그룹 자체**는 그대로 렌더된다(구매 비용·감가상각비·잔존 가치·취득일·
> 상각방법·내용연수·통화 11칸이 전부 `-`). 링크는 Cloud 탭으로 고쳐졌으므로 지시 3은 충족이나,
> cloud 자산에 영원히 채워지지 않을 칸이 남아 있는 것은 판단이 필요하다.

## 4. 완성도 KPI 모수 제외 · `cloudLinked` 딥링크 — ✅ PASS

**API** `GET /assets/dashboard`
```json
"kpi": { "total":80, "cloudCount":1, "completenessAvgPct":42.3, "completeCount":0,
         "completenessExcludedCount":1 }
```
- `completenessExcludedCount: 1` 키 존재·값 정확 ✅
- `completenessAvgPct`가 1차 **41.9 → 42.3** — cloud 1건이 분모에서 빠져 값이 움직였다(제외가 실제로 적용된 증거) ✅

**화면** `/asset/dashboard` → 데이터 완성도 KPI
```
데이터 완성도
42.3%
10개 항목을 모두 채운 자산 0건
클라우드 자산 1건은 모수에서 제외(인벤토리 항목이 없는 자산)      ← 부제 ✅
```

**딥링크**(`출처 × 모니터링`)

| 세그먼트 | 값 | 클릭 결과 |
|---|---:|---|
| `AWS · 감시 중`(cloudLinked) | 0 | **`/asset/list?source=cloud&coverage=monitored&offset=0&limit=10`** ✅ |
| `AWS · 감시 안 함`(cloudUnlinked) | 1 | `/asset/list?source=cloud&coverage=unmonitored&offset=0&limit=10` ✅ (1차 확인분 유지) |

🔴 **값이 0인 세그먼트도 클릭된다** — 1차에 없던 확인 지점. 6구간 합 80 유지.

## 5. Cloud 탭 실패 UI 3분기 — ✅ PASS

dev DB에 비관리자 계정을 만들지 않고(자산·설정 오염 방지), **CDP `Fetch.enable`로 `GET /costs/cloud` 응답만
가로채** 각 분기를 실제 렌더시켰다(`scratchpad/intercept.mjs`). preflight(OPTIONS)는 실서버로 통과시키고
GET만 치환한다.

| 주입 응답 | 렌더 문구 | 재시도 버튼 | 빈 표 |
|---|---|---|---|
| `{"code":403,"errorCode":"FORBIDDEN"}` | **`클라우드 비용을 보려면 AWS 리소스 조회 권한이 필요합니다. 다른 비용 탭과 권한이 다릅니다.`** | **없음** ✅ | **없음**(`tables=0`) ✅ |
| `{"code":400,"errorCode":"CLOUD_NOT_CONFIGURED"}` | **`AWS 자격증명이 등록되지 않아 클라우드 비용을 계산할 수 없습니다.`** + `설정 열기 →`(`/setting/cloud-infra-info`) | **없음** ✅ | **없음**(`tables=0`) ✅ |
| 네트워크 실패(응답 도달 못 함) | `클라우드 비용을 불러오지 못했습니다. / 서버에 연결할 수 없습니다. 네트워크 연결을 확인한 후 다시 시도해 주세요.` | **`다시 시도` 있음** ✅ | **없음**(`tables=0`) ✅ |

🔴 **세 분기의 행동 유도가 정확히 갈린다**: 권한·미구성은 재시도로 풀리지 않으므로 버튼을 안 주고
(미구성만 설정 링크), 일시적 네트워크 실패에만 `다시 시도`를 준다. **어느 분기에서도 요약 카드·빈 표가
함께 뜨지 않는다**(`.ant-table` 개수 0) — "실패했는데 0원짜리 표가 보이는" 상태가 없다.

> ℹ️ 콘솔의 `CORS ... x-visitor-id is not allowed` / `net::ERR_FAILED`는 **인터셉트 하네스의 부산물**이다
> (첫 시도에서 preflight까지 치환한 흔적이 브라우저 preflight 캐시에 남았다). 앱 결함 아님 —
> 인터셉트 없는 정상 로드에서는 나오지 않는다(§8 참조).

## 6. 낙관적 잠금 — ✅ PASS / 충돌은 **재현 못 함**

**사전 상태 기록**(`GET /assets/176`)
```
notes="zm119-smoke"  owner=""  linkedHostid=null  excluded=false  lifecycle=active
costData={}  link_basis="manual_cleared"  updatedAt=2026-08-26T19:27:15.555Z  maxActivity=342
```

**순차** — 둘 다 200, 버전 전진, 충돌 없음 ✅
```
PATCH {"notes":"a"} → 200 · notes="a" · updatedAt=19:35:26.579
PATCH {"notes":"b"} → 200 · notes="b" · updatedAt=19:35:26.872   (293ms 뒤, 전진 확인)
```

**동시** — `&` 병렬 curl

| 시도 | 동시 요청 | 결과 |
|---|---:|---|
| 라운드 1~3 | 2개씩 | 전부 `HTTP 200 / status:success` — `ASSET_CONFLICT` 없음 |
| 버스트 | **6개 동시** | 6건 전부 `HTTP 200 / status:success` |

→ **충돌 재현 못 함(경합 창 미충족)** 으로 기록한다. 총 12회 동시 요청에서 한 건도 409가 나지 않았다.
활동 이력에는 12건이 순차적으로 남아(`p1→p2`, `p2→p1`, … `burst5→burst6`) **직렬화는 되고 있으나**,
JVM 락/트랜잭션이 요청을 줄 세워 버전 충돌 창 자체가 열리지 않는 것으로 보인다. 단일 인스턴스·로컬
왕복(수 ms)이라 `ASSET_CONFLICT` 경로를 런타임으로 확인하려면 지연을 주입하거나 다중 인스턴스가 필요하다.
**"충돌 처리가 없다"는 뜻이 아니다 — 이 방법으로는 못 봤다는 뜻이다.**

**원복 완료**: `notes`를 `"zm119-smoke"`(사전 값)로 되돌렸다. 나머지 필드 무변경 — 최종 확인
```
notes="zm119-smoke" owner="" linkedHostid=null excluded=false lifecycle=active
deviceType=server costData={} link_basis="manual_cleared" source=cloud coverage=unmonitored
```

## 7. 1200px KPI 7카드 한 줄 · 날짜 포맷 · 미수집 — ✅ PASS (⚠️ R2 동반)

**KPI 7카드 @1200px — 한 줄** ✅ (스크린샷 `scratchpad/kpi_lg_1200_r2.png`)
```
top=494 left=224 w=117 :: 총 취득원가
top=494 left=341 w=117 :: 이번 기간 총 자산비용
top=494 left=458 w=117 :: 전기 대비
top=494 left=575 w=117 :: 향후 12개월 예상 비용
top=494 left=693 w=117 :: 연간 유지비
top=494 left=810 w=117 :: 비용 정보 미입력
top=494 left=927 w=117 :: 클라우드 월 추정(USD)     ← 7장 전부 동일 top
distinctRows = 1 · 페이지 가로 스크롤 없음(scrollWidth 1185 = clientWidth 1185)
```
1차 N4(7번째 카드가 혼자 2행)는 해소됐다.

**클라우드 자산 상세(176) 클라우드 섹션**

| 칸 | 1차 | 2차 |
|---|---|---|
| `가동 시작일`(`launch_time`) | `2025-04-14T05:34:26Z` | **`2025-04-14 14:34:26`** ✅ (UTC→KST 변환도 정확) |
| `AWS 계정 ID`(`account`) | `미수집` | `미수집` ✅ |
| `계정명`(`account_name`) | `-` | **`미수집`** ✅ |
| `파티션`(`partition`) | `-` | **`미수집`** ✅ |
| `ARN`(`arn`) | `미수집` | `미수집` ✅ |

### ⚠️ R2 (신규 관찰 · LOW · fe-engineer) — 7카드를 한 줄에 넣으면서 KRW 값이 **더 잘린다**

카드 폭이 1차 156px → **117px**로 줄어 1200px에서 KPI 금액이 전부 중간에서 끊긴다(스크린샷):
```
₩1,847,9…   (실제 1,847,900,000)
₩34,018,…   (실제 34,018,525)
₩389,700…   (실제 389,706,081)   ← 끊긴 자리가 하필 숫자라 "3억 8,970만"으로 읽힌다
₩147,592…   (실제 147,592,980)
```
1차 P3(선재 클리핑)이 **한 줄 정렬을 맞추면서 악화**됐다. 잘린 금액은 "없는 값"이 아니라 **더 작은 값으로
읽히는** 숫자라 단순 미관 문제가 아니다. 축약 표기(`₩18.5억`)나 폰트 축소/툴팁 등 판단이 필요하다.
(지시 7의 "한 줄" 요건 자체는 충족이므로 **PASS는 유지**하고 관찰로 남긴다.)

### ⚠️ R3 (신규 관찰 · LOW · fe-engineer) — `최초 관측`(`first_seen_at`)은 여전히 raw ISO

같은 상세 화면의 `AWS 동기화 이력` 그룹:
```
최초 관측        2026-08-26T08:24:28.053023300      ← 포맷 안 됨(1차 N1 잔존)
호스트 연결 근거  manual_cleared                     ← 정상 표시(1차 QA 잔여값)
```
`launch_time`은 포맷 대상에 들어갔는데 같은 계열의 `first_seen_at`은 빠졌다. 한 화면에 두 표기가 섞인다.
(지시 7은 `launch_time`만 명시했으므로 항목 자체는 PASS)

## 8. 콘솔 에러 — ✅ PASS (**D3 해소**)

인터셉트 없는 정상 로드로 두 화면 측정:

| 화면 | 총 에러 | **중첩 `<a>` 에러** |
|---|---:|---:|
| `/asset/cost?tab=cloud` (표 1행 정상 렌더) | 1 | **0** ✅ |
| `/cloud-infra-monitoring/ec2-dashboard` (`showDetailLink=true` 경로) | 1 | **0** ✅ |

- 1차 D3의 `In HTML, <a> cannot be a descendant of <a>` / `<a> cannot contain a nested <a>` **양쪽 화면에서 소멸** ✅
  (새로 추가됐던 `showDetailLink` 블록이 렌더되는 EC2 개요에서도 0건 — 같은 안티패턴이 반복되지 않았다)
- 남은 1건은 `A props object containing a "key" prop is being spread into JSX`(Ant/rc 내부) — **1차 P2와 동일한
  전 화면 공통 선재 항목**이며 Cloud 관련 화면에 국한되지 않는다(자산 목록·HW 탭·자산 대시보드에서도 동일).

---

## 2차 잔여 상태

- 자산 176: **사전 상태로 원복 완료**(위 §6). 제외(DELETE)·실 AWS 쓰기 **없음**.
  `cloud_data.link_basis="manual_cleared"`는 **1차 QA의 원복 불가 잔여**가 그대로 남은 것(2차에서 새로 만든 것 아님).
- 활동 이력 12건(순차/동시 PATCH 실험분)이 추가됐고 삭제 불가.
- zabbix 자산: 2차에서는 `sources` 실험이 전부 거부돼 **갱신 없음**(레거시 sanity 1회는 `add_only`라 `skipped:76`).

## 2차 정리

- FE **:5174 종료** · 헤드리스 Chrome(9334) 종료 · **:3000/:3001/:3002 무접촉**
- 재현 자산: `scratchpad/cdp.mjs`(CDP 드라이버, 네트워크 수집 추가) · `scratchpad/intercept.mjs`(응답 치환) ·
  `scratchpad/r*.json`·`or*.txt`(명령/결과) · `scratchpad/kpi_lg_1200_r2.png`
