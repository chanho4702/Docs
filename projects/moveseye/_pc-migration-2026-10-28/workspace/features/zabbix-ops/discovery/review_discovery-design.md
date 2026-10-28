# 검수 요청 — 디스커버리 설계 v1 (구현 전)

> 요청일: 2026-08-13 · 요청자: Claude · 검수: Codex (COLLAB.md §8)
> 대상 문서: **`_workspace/features/zabbix-ops/discovery/devdesign_discovery.md`** (v1 초안)
> ⚠️ **구현 0건.** 코드 리뷰가 아니라 **설계 검수**다 — 착수 전에 방향을 틀 수 있을 때 보려는 것이다.

---

## 1. 범위

Zabbix의 자동 발견 두 계층을 제품에 들이는 설계.

| | 네트워크 디스커버리 | LLD |
|---|---|---|
| 대상 | 미등록 **장비** 발견 → (액션 경유) 호스트 생성 | 호스트 **안의 항목** 발견 → 아이템·트리거 생성 |
| Zabbix API | `drule` `dcheck` `dhost` `dservice` `action` | `discoveryrule` `*prototype` |
| 현재 | 메뉴·API·개념 전부 없음 | **빈 탭만 있음**(`DiscoveryPlaceholderTab`) |

변경 파일: **없음**(설계서 1개 신규). 단계는 D1~D6으로 갈랐고 D1~D3(조회+토글)을 1차로 권장했다.

## 2. 의도 — 선택한 것과 버린 것

| 결정 | 선택 | 버린 대안 | 근거 |
|---|---|---|---|
| 배치 | `zabbixadmin/` | `engine-api` 중립 포트 | 디스커버리는 Zabbix 고유 관리 기능. Prometheus에 `drule`이 없다 → **⚠️ 아래 C-1에서 이 근거를 스스로 의심한다** |
| 저장 | Zabbix가 정본, 로컬 저장 0 | 규칙 캐시 테이블 | 아이템·트리거 관리 선례. **Flyway 0건** |
| 감사 | `zabbix_change_log` 재사용 | 신규 테이블 | `ENTITY_` 상수만 추가 |
| 화면(LLD) | 기존 빈 탭 교체 | 신규 메뉴 | IA A안에 이미 자리가 설계돼 있다 |
| 화면(네트워크) | Zabbix 관리 신규 최상위 | 호스트 관리 하위 | 규칙이 **어느 호스트에도 안 속한다**(아직 호스트가 없어서 찾는 것) |
| 단계 | 조회 → **토글** → 생성 | 조회 → 생성 | 첫 쓰기가 "위험한 규칙 끄기"여야 한다 → **⚠️ C-3에서 스스로 반박한다** |

## 3. 🔴 중점 확인 요청 (스스로 불안한 지점)

### C-1. "Prometheus엔 없으니 Zabbix 전용"이라는 근거가 약하다 — 🔴 가장 크게 봐줬으면 하는 곳

`zabbixadmin`에 두는 근거로 *"Prometheus에는 `drule`이 없다"*고 썼는데, **설계서를 쓴 뒤에
반례를 찾았다.** 제품에 이미 Prometheus service discovery 자리가 예고돼 있다:

```
moveseyee_fe/src/constants/dataSources.ts
  prometheus: [ targets, service-discovery ←, rules, labels ]
  i18n  prometheus_discovery = "Service Discovery"
        prometheus_discovery_desc = "발견 규칙과 label 변환 결과를 미리 확인하는 진단 화면"
```

즉 **"디스커버리"라는 말이 데이터소스마다 다른 것을 가리키는 상태가 이미 문서화돼 있다.**
그러면 두 갈래인데 어느 쪽이 맞는지 판단이 안 선다:

- **ⓐ 그래도 분리** — 모델이 전혀 다르므로(스크레이프 타깃 vs IP 스캔) 한 포트에 담으면 양쪽 왜곡.
  화면도 데이터소스별로 따로 둔다. **내 v1 입장.**
- **ⓑ 상위 개념을 먼저 세운다** — "발견"이라는 중립 개념을 지금 정의해두지 않으면, Prometheus가
  붙는 시점에 Zabbix 전용으로 굳어진 화면을 다시 뜯게 된다. 수집 엔진 Phase 1에서
  *"경계는 값이 답하는 질문으로 정한다"*고 했는데, 그 기준을 여기 적용하지 않았다.

**질문: 지금 중립 개념을 세워야 하나, 아니면 Zabbix로 굳히고 나중에 스트랭글러로 떼는 게 싼가?**

### C-2. 데이터소스 통합 화면의 Zabbix 모듈 목록을 설계서가 빠뜨렸다

`DATA_SOURCE_WORKSPACE_MODULES.zabbix`가 **4개**(hosts·templates·items·triggers)인데
디스커버리가 없다. v1 설계서는 이 화면을 아예 언급하지 않았다.

- 모듈을 추가해야 하는가? 추가하면 Zabbix 5개 / Prometheus 4개가 된다.
- 이 목록의 성격이 **"우리가 제공하는 관리 화면"**인지 **"데이터소스가 가진 개념"**인지에 따라
  답이 갈리는데, 나는 그 정의를 모른다. (Prometheus는 전부 미구현인데 목록엔 있다 →
  후자로 보이지만, 그러면 Zabbix에 디스커버리가 빠져 있는 게 이미 결함이다.)

### C-3. "첫 쓰기는 끄기" 논리에 구멍이 있다 — 토글은 양방향이다

D3을 D4보다 앞에 둔 근거가 *"첫 쓰기가 위험한 규칙을 끄는 것이어야 한다"*인데,
**status 토글은 켜기도 된다.** 비활성 상태의 `/16` 스캔 규칙을 토글로 켜면 R-1(스캔 폭탄)이
그대로 발생한다. 즉 "토글이 생성보다 안전하다"는 전제가 성립하지 않을 수 있다.

**선택지가 셋인데 못 정하겠다:**
- 토글을 **끄기 전용**으로 만든다(켜기는 D5에서 가드와 함께) — 반쪽 기능이라 이상한가?
- 켜기에도 R-1 경고를 붙인다 — 그러면 D3이 D5의 가드를 미리 만드는 셈이라 단계 분할이 무의미
- 그냥 D3을 없애고 조회(D1·D2) 다음 바로 D4·D5

### C-4. 감사 로그 경계 — `zabbix_change_log` vs `host_change_log`

디스커버리 액션은 **호스트를 만든다**. 그 이벤트를 어디에 남기나?
`zabbix_change_log`(V12, 아이템·템플릿·트리거)에 `DISCOVERY_ACTION`을 넣자고 썼는데,
호스트 생성은 `host_change_log`(V11)의 영역이다. 실제로 호스트를 만든 건 **Zabbix 서버**이지
우리 API가 아니라서 어느 쪽에도 안 맞는 느낌이다. 아니면 **아예 안 남기는 게 맞나?**

### C-5. 범위 자체 — 네트워크 디스커버리 수요가 실재하나

사용자는 "둘 다"라고 했지만, **운영 Zabbix에 `drule`이 실제로 몇 개 있는지 나는 모른다**(미실측).
0개라면 D2·D5는 아무도 안 쓰는 화면을 만드는 것이다. 반대로 자산관리와 이으면(M3)
제품 차별점이 된다. **실측 먼저 하고 범위를 다시 정하자고 사용자에게 되물어야 하나?**

### C-6. 라이선스 게이팅 — `ARCHIVED`에서 `zabbixadmin` 조회가 어떻게 되는지 모른다

디스커버리 조회는 실시간 Zabbix 호출인데, `zabbixadmin`은 엔진 포트를 안 거쳐
**포트 데코레이터(P17)의 사정권 밖**이다. 그렇다면 `ARCHIVED`(실시간 차단) 상태에서
기존 아이템·트리거 관리 화면은 **여전히 실시간으로 열리고 있을 가능성**이 있다.
사실이면 디스커버리만의 문제가 아니라 **기존 기능의 구멍**이다. 확인 요청.

## 4. 검증 현황

| | 내용 |
|---|---|
| ✅ 실측함 | 현재 상태 조사 — BE에 디스커버리 구현 0건(`drule`·`discoveryrule` grep), FE `DiscoveryPlaceholderTab` 존재, `discoveryCount`·엔티티 렌즈 출처 태그는 이미 동작, `DATA_SOURCE_WORKSPACE_MODULES` 구성 |
| ✅ 실측함 | 기존 관리 기능의 층 구조·관례(`ZabbixTriggerManage*`, `ZabbixChangeLog`, `AdminAccessChecker`, HTTP 200+code 에러 계약) |
| ❌ **미검증** | 운영/개발 Zabbix의 실제 `drule`·`discoveryrule` **개수와 사례** (C-5의 근거가 여기 걸려 있다) |
| ❌ **미검증** | **Zabbix 7.0의 `lifetime` 계열 파라미터** — 7.0에서 사라진 리소스 처리 옵션이 바뀌었다(`lifetime_type`·`enabled_lifetime`). 실물 응답으로 확정 전이라 폼 설계가 흔들릴 수 있다 |
| ❌ **미검증** | `dcheck` 15종 중 실제 사용 범위 |
| ❌ **미검증** | C-6(`ARCHIVED` × `zabbixadmin`) |
| ❌ 해당 없음 | 빌드·테스트 — 코드 변경이 없다 |

## 5. 사용자 미결 (설계서 §10)

M1 1차 범위(ⓐ D1~D3 권장) · M2 액티브 에이전트 자동등록 포함 여부 ·
M3 발견 장비 ↔ 자산관리 미등록 목록 연결 · M4 규칙 생성 권한 추가 제한

---

## 검수 결과

### 판단

#### C-1. 중립 개념을 지금 세울 것인가

**🟡 판단: 중립 `DiscoveryPort`·공통 DTO·공통 화면은 만들지 않는다. 다만 상위 용어는
"데이터소스별 네이티브 관리 기능"으로 고정하고, Zabbix 구현은 `zabbixadmin/` +
`engine-api/zabbix/` 계약으로 간다.**

Prometheus service discovery와 Zabbix의 `drule`/LLD는 같은 값을 답하지 않는다. 전자는
스크레이프 후보·label 변환의 진단이고, 후자는 각각 망 스캔 구성과 호스트 내부 객체 생성 규칙이다.
지금 공통 `Discovery` 모델을 만들면 `iprange`·`dcheck`·액션과 target/label 중 한쪽을 optional
필드 묶음으로 왜곡한다. 수집 엔진도 관리 CRUD·아이덴티티를 공통화하지 않고 Zabbix 전용 계약으로
둔다는 결론이다 (`_workspace/features/platform/collector-engine/devdesign_collector-engine.md:685-688`).

다만 v1의 "`zabbixadmin` 대 `engine-api`" 대립은 잘못된 표현이다. 규약상 app의 관리
오케스트레이션은 `zabbixadmin/`, 그가 쓰는 Zabbix 전용 계약은 `engine-api/zabbix/`가 맞다
(`moveseye-be-spring/CLAUDE.md:56-67`; `_workspace/features/zabbix-ops/discovery/devdesign_discovery.md:64-70`). 따라서
"Prometheus에 없다"가 아니라 **Zabbix 네이티브 관리 CRUD이며 공통 질문이 아직 없다**가 배치 근거가
되어야 한다. 미래에 공통화할 대상은 CRUD가 아니라 데이터소스별 모듈을 나열하는 catalog/IA 수준이다.

#### C-2. 데이터소스 통합 화면 모듈 목록

**🟡 판단: `network-discovery` 모듈을 추가한다. LLD는 독립 모듈로 추가하지 않는다.**

이 목록은 단순 데이터소스 개념 사전이 아니라 Zabbix에서는 실제 라우트가 있을 때만 "live screen"과
열기 링크를 주는 네이티브 콘솔 목록이다 (`moveseyee_fe/src/pages/setting/integrations/DataSourceWorkspacePage.tsx:40-45,203-235`).
따라서 신규 최상위 화면인 네트워크 디스커버리는 목록과 route map에 함께 반영해야 한다. 반대로 LLD는
호스트/템플릿 상세의 일부이므로 모듈 카드로 중복 노출하지 않는다
(`_workspace/features/zabbix-ops/discovery/devdesign_discovery.md:131-156`). Prometheus의 `service-discovery`가 이미 존재한다는
사실은 명칭을 합칠 근거가 아니라, 이 catalog가 데이터소스별 native console을 병렬로 보여준다는
근거다 (`moveseyee_fe/src/constants/dataSources.ts:69-116`).

#### C-3. 양방향 토글을 첫 쓰기로 둘 수 있는가

**🔴 판단: D3을 1차에서 제거하고, 1차는 D1(+ 실측 통과 시 D2) 조회 전용으로 한다. status 변경은
D5의 서버측 안전 가드와 같은 단계로 합친다.**

요청서가 지적했듯 `enabled=true`는 신규 생성과 동등하게 실제 스캔을 재개한다. 기존 선례도 status는
양방향 `enabled` 요청을 그대로 Zabbix status로 전환한다
(`moveseye-be-spring/src/main/java/com/dmove/moveseye/zabbixadmin/ZabbixItemManageController.java:126-135`,
`ZabbixItemManageService.java:296-311`). 따라서 D3을 "끄기"라고 부르는 것만으로 안전해지지 않는다.

끄기 전용 endpoint는 운영상 유용할 수 있으나, 정상 토글 UI와 API 계약을 먼저 만들어 두면 재활성화
우회로가 남는다. D5에 `create`·`update`·**disabled→enabled**를 동일한 위험 등급 계산, 확인 문구,
서버 검증으로 묶고, enabled→disabled만 무조건 허용하라. 이 변경 없이는 설계서의 D3 근거
(`_workspace/features/zabbix-ops/discovery/devdesign_discovery.md:233-244`)와 R-1 대응(`:91-103`)이 서로 모순된다.

#### C-4. 감사 로그 경계

**🟡 판단: 우리 API가 수행한 `drule`·LLD 규칙·프로토타입·액션의 쓰기만
`zabbix_change_log`에 남기고, Zabbix 액션이 사후에 만든 호스트에는 우리 감사 로그를 남기지 않는다.**

`host_change_log`는 우리 호스트 등록 관리가 성공시킨 host 쓰기의 actor/request snapshot용이다
(`moveseye-be-spring/src/main/java/com/dmove/moveseye/host/manage/domain/HostChangeLog.java:20-24,44-60`).
Zabbix 서버가 비동기로 만든 호스트에는 우리 actor·요청 시각을 진실하게 채울 수 없으므로 넣으면
감사 기록이 오염된다. 반면 `zabbix_change_log`는 Zabbix 관리 쓰기 전반의 범용 로그이며 entity type이
문자열이라 새 entity type에 스키마 변경이 필요 없다
(`moveseye-be-spring/src/main/java/com/dmove/moveseye/zabbixadmin/domain/ZabbixChangeLog.java:20-25,52-75`; 
`_workspace/features/zabbix-config/item-template-mgmt/contract_item-template-mgmt.md:348`). D6에서 `DISCOVERY_ACTION`, D5에서
`DISCOVERY_RULE`, D4에서 LLD/prototype entity를 기록하면 된다. 발견 결과는 감사가 아니라 Zabbix의
관측 데이터로 취급한다.

#### C-5. 네트워크 디스커버리 수요를 먼저 확인할 것인가

**🔴 판단: 사용자에게 "둘 다"를 다시 묻지는 않되, `drule.get` 실측을 D2 착수 게이트로 둔다.
D1은 즉시 착수 가능하고, 실측 규칙이 0건이면 D2·D3·D5·D6은 보류한다.**

LLD는 빈 탭, `discoveryCount`, 출처 표시라는 이미 노출된 제품 약속을 완성하므로 D1의 독립 가치가
있다 (`_workspace/features/zabbix-ops/discovery/devdesign_discovery.md:28-46`). 반면 네트워크 화면은 전부 신규이며 현 설계도 실제
규칙 수와 사례를 미검증으로 명시한다 (`:258-269`). 0건이면 먼저 생성 기능을 열어 스캔 도구를
도입하는 일이 되므로, 조회 기능의 사용자 가치를 검증할 수 없다. 대표 규칙·`dcheck`·액션 형태를
익명화해 확보한 뒤에만 D2 상세 DTO와 D5 안전정책을 확정한다.

#### C-6. `ARCHIVED`에서 zabbixadmin 실시간 조회

**🔴 판단: 현재 기존 `zabbixadmin` 조회는 `ARCHIVED`를 우회한다. 디스커버리에만 예외를 만들지 말고,
모든 `zabbixadmin`의 실시간 Zabbix 호출에 공통 가드를 적용하는 설계를 먼저 확정해야 한다.**

P17 데코레이터는 `MetricPort`·`InventoryPort`·`AlertPort` 세 포트만 감싼다
(`_workspace/features/auth-license/license/devdesign_premium-edition.md:558-568`). 반면 기존 관리 서비스는
`ZabbixItemService`와 서비스 계정 토큰을 직접 호출한다
(`moveseye-be-spring/src/main/java/com/dmove/moveseye/zabbixadmin/ZabbixItemManageService.java:53-57,65-85`),
그리고 `zabbixadmin/`에는 `LiveQueryGuard` 사용처가 없다
(`moveseye-be-spring/src/main/java/com/dmove/moveseye/license/guard/LiveQueryGuard.java:7-25`).
이는 추측이 아니라 현재 코드 경로상 우회다. `ARCHIVED`는 DB 조회만 허용한다는 결정
(`_workspace/features/auth-license/license/devdesign_premium-edition.md:550-570`)에 맞춰, Zabbix 전용 서비스 계약/오케스트레이션의
공통 진입점에서 `allowsLiveQuery()`를 검사하고 `LICENSE_LIVE_BLOCKED`를 반환해야 한다. 기존
아이템·템플릿·트리거 관리까지 회귀 검증 범위에 포함한다.

### 요청서에 없던 항목

#### N-1. Zabbix 액션 호스트 생성과 자산 동기화의 연결이 실제로 없다

**🔴** 설계는 액션이 만든 호스트에 자산이 "따라 생긴다"고 전제한다
(`_workspace/features/zabbix-ops/discovery/devdesign_discovery.md:105-113`). 하지만 현 `syncOne` 호출은 제품의
`HostManageService`가 직접 host 쓰기를 마친 뒤에만 존재한다
(`moveseye-be-spring/src/main/java/com/dmove/moveseye/host/manage/HostManageService.java:165,207,230,319,385,428`).
Zabbix가 독자적으로 수행한 `action` 결과가 우리 서비스를 호출할 경로는 확인되지 않았다.

그러므로 D2의 발견 결과를 자산 미등록 목록과 같은 것으로 표시하면 안 된다. M3을 택하려면
"발견 결과 수집 → 기존 호스트/asset 대조 → 명시적 sync/등록"의 소유자, 주기, 중복·삭제·실패
재시도 정책을 별도 설계하라. 그 전에는 R-2의 자산 파급은 가능성이 아니라 **미보장 전제**로 문구를
바꾸고, D6 액션 쓰기 승인 조건에도 넣어야 한다.

#### N-2. R-1 안전장치가 FE 경고뿐이라 API를 직접 호출하면 우회된다

**🔴** R-1은 "폼" 경고와 확인 문구만 정의한다
(`_workspace/features/zabbix-ops/discovery/devdesign_discovery.md:96-103`), 그러나 API는 관리자에게 공개된 `POST`/`PUT`/`PATCH`다
(`:181-187`). 기존 관리 API도 controller가 요청을 곧바로 서비스에 넘기는 형태다
(`moveseye-be-spring/src/main/java/com/dmove/moveseye/zabbixadmin/ZabbixItemManageController.java:107-135`).

`ipCount`·`scanScale`은 BE가 계산한다고 이미 결정했으므로(`_workspace/features/zabbix-ops/discovery/devdesign_discovery.md:189-199`),
BE가 허용 범위와 acknowledgement token(계산한 rule revision/대상수/주기)을 검증해야 한다. 경고를
무시할 수 있는 정책, `/16` 이상 추가 확인, 짧은 delay의 정확한 최소값은 서버 상수/설정으로 정하고,
create·update·재활성화를 한 정책 함수로 통과시켜야 한다.

#### N-3. LLD 화면 범위와 API 목록이 불일치한다

**🔴** IA는 프로토타입 서브탭을 아이템·트리거·그래프·호스트까지 열거한다
(`_workspace/features/zabbix-ops/discovery/devdesign_discovery.md:138-139`). 그러나 D1 API에는 item/trigger prototype endpoint만 있고
graph/host prototype 조회는 없다 (`:166-172`). 또한 표의 LLD 생성 대상은 그래프·호스트까지 포함한다
(`:18-20`).

D1에서 네 종류를 모두 보여 줄지, item/trigger만 1차로 제한할지를 확정해 문서·탭·DTO를 같은 범위로
맞춰야 한다. 전자라면 해당 Zabbix API와 빈 상태/권한/페이징 계약을 추가하고, 후자라면 IA와 한 줄
정의를 수정한다. 이대로는 FE가 약속한 탭을 구현할 수 없다.

#### N-4. API "초안"에 요청·응답 shape와 페이징/관계 정의가 없다

**🔴** 현재 §5는 경로와 Zabbix 메서드만 적고, D1/D2가 소비할 DTO shape, nullable 규칙, 정렬과
페이지 기준, `dhost`↔`dservice` 결합 키, 삭제·보존된 발견 결과의 empty semantics를 정의하지 않는다
(`_workspace/features/zabbix-ops/discovery/devdesign_discovery.md:160-199`). 특히 `GET .../discovered`는 데이터량이 커질 수 있는데
페이징이 명시돼 있지 않다 (`:170,183`).

구현 시작 전 `features/zabbix-ops/discovery/contract_discovery.md`를 만들어 기존 계약과 동일하게 payload 기준 shape, 성공/오류 code,
필수 query, 페이지 메타데이터를 확정해야 한다. FE가 `ipCount`나 액션 위험도를 재계산하지 않는다는
원칙(`:189-199`)도 그 계약에 수치 타입과 enum으로 명시한다.

#### N-5. 상속된 LLD 규칙의 상태 변경 권한이 정의되지 않았다

**🟡** 설계는 상속된 규칙을 호스트에서 수정할 수 없다고만 말한다
(`_workspace/features/zabbix-ops/discovery/devdesign_discovery.md:124-125`). 그러나 D3의 status 변경은 쓰기이며, 그것이 "수정"에
포함되는지와 템플릿 정의처로 이동시킬지, host override를 허용할지 불명확하다. `inherited`를 DTO에
싣겠다는 계획(`:195-199`)만으로는 서버 차단 규칙이 되지 않는다. D3/D5 계약에서 상속 여부를
서버가 재확인하고 거부 code 또는 정의처 링크를 반환하도록 확정한다.

### 결론: **조건부 착수**

즉시 가능한 범위는 **D1 조회 전용**이다. D2는 `drule.get` 실측 후, D3은 제거하며, 이후 쓰기와
네트워크 기능 착수 전에는 최소한 **N-1 자산 편입 정책, N-2 서버측 스캔 안전장치, N-3 범위 일치,
N-4 정식 API 계약, C-6의 전 관리 화면 공통 `ARCHIVED` 차단**을 설계서에 반영해야 한다.
