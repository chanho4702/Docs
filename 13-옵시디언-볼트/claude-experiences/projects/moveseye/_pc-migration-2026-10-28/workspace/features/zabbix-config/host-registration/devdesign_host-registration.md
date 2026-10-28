# MovesEye 개발 설계 — 호스트 등록 관리 (Host Registration Management)

> 목표: 자빅스 원본 UI로 가야만 했던 "관제 대상 등록·변경"을 DMOVE 안에서 끝낸다.
> 자빅스 UX pain point(그룹 선등록 강제, agent Hostname 불일치 무통보, Unlink and clear 데이터 삭제 함정)를 등록 플로우에서 구조적으로 해소한다.

작성: 2026-07-16 · 상태: **설계 확정 대기 → 구현은 fullstack-feature 파이프라인**

---

## 0. 확정 방향 (2026-07-16 사용자 결정)

| 항목 | 결정 |
|------|------|
| 1차 범위 | **코어 등록** — 그룹 CRUD + 호스트 생성/수정(이름·표시명·그룹·인터페이스·프록시·템플릿 연결·상태). 매크로·태그·인벤토리 편집은 2차 |
| 권한 | **관리자 전용** (FE `adminOnly` 라우트 + BE `AdminAccessChecker.requireAdmin`) |
| 메뉴 | **설정 > 호스트 등록 관리** (`/setting/host-management`) |
| 삭제 정책 | **비활성화 + 영구 삭제 모두 제공.** 비활성화(status)는 일반 확인, 영구 삭제(host.delete)는 호스트명 타이핑 이중확인 + "수집 데이터 영구 삭제" 강경고 |

### 아키텍처 대원칙
- **자빅스가 정본(source of truth), 로컬 저장 없음.** 호스트 데이터는 매번 `host.get`으로 읽는다. Assets의 스냅샷 모델과 달리 이 화면은 관리 화면이므로 실시간 조회.
- **첫 자빅스 쓰기 기능 확장.** 쓰기 토큰은 기존 관례대로 `getSuperAdminToken()`(user/usergroup/role/hostgroup write와 동일 패턴). 사용자별 자빅스 권한 위임은 하지 않는다.
- **감사 추적은 우리 DB에.** 쓰기 액션마다 `host_change_log`(V9)에 who/what/when 기록. actor는 기존 공용 `ActorResolver` 재사용.

---

## 1. 개념 모델 · 기존 자산과의 관계

```
[설정 > 호스트 등록 관리]  ← 신규 (관리/쓰기 관점)
   ├─ 호스트 탭: host.get 실시간 목록 + 생성/수정/상태변경/삭제
   └─ 그룹 탭:   기존 /users/host-groups CRUD 재사용 (BE 신규 0)

[모니터링 > 호스트 그룹]     — 조회/분석 관점 (기존, 변경 없음)
[사용자·역할 > 호스트 그룹]   — 권한 매핑 관점 (기존, 변경 없음; API만 공유)
[자산 관리]                  — 등록 성공 시 단건 동기화로 자산 자동 생성 (linked_hostid 연결)
```

- 그룹 쓰기 경로는 BE에 **이미 완비**: `ZabbixHostGroupServiceImpl`(hostgroup.create/update/delete/massadd/massupdate) + `HostGroupService`(Zabbix 생성 → 로컬 `HostGroup` 저장, 실패 시 Zabbix 롤백, 삭제 시 고아 호스트 방지) + `UserController /users/host-groups`. **재사용하고 새로 만들지 않는다.**
- 신설이 필요한 것: `host.create/update/delete`, `template.get`, `proxy.get` (셋 다 현재 코드에 전무).

---

## 2. 자빅스 API 매핑 (Zabbix 7.0 기준)

| 동작 | 메서드 | 핵심 파라미터 | 비고 |
|------|--------|--------------|------|
| 호스트 목록 | `host.get` | `selectHostGroups, selectInterfaces, selectParentTemplates, output(+status, monitored_by, proxyid)` | 읽기, 기존 `getRaw` 재사용 |
| 호스트 생성 | `host.create` | `host, name, groups[], interfaces[], templates[], monitored_by, proxyid, status` | **신설** |
| 호스트 수정 | `host.update` | 위 + `templates_clear[]`(unlink and clear 시) | **신설**. 템플릿 제거는 `templates`(unlink만) vs `templates_clear`(데이터 삭제) 구분 |
| 상태 변경 | `host.update` | `status: 0(활성)/1(비활성)` | 수정과 동일 EP, 별도 액션으로 노출 |
| 호스트 삭제 | `host.delete` | `[hostid]` | **신설**, 강경고 대상 |
| 템플릿 검색 | `template.get` | `search{name}, output[templateid,name]` | **신설**, 읽기 |
| 프록시 목록 | `proxy.get` | `output[proxyid,name]` | **신설**, 읽기 |

⚠️ **구현 시 검증 필수**: Zabbix 7.0에서 프록시 지정은 `monitored_by`(0=server/1=proxy/2=proxy group) + `proxyid` 조합(6.x의 `proxy_hostid` 아님). 인터페이스는 `{type:1(agent), main:1, useip, ip, dns, port:"10050"}` 형태. dev 자빅스(7.0)에 실호출로 파라미터명 확인 후 DTO 확정.

### 인터페이스 1차 범위
Agent(type 1) 인터페이스 1개만 폼으로 받는다(useip/ip/dns/port). SNMP·IPMI·JMX 인터페이스는 2차(폼 복잡도 대비 사용 빈도 낮음).

---

## 3. 저장 모델 — Flyway `V9__host_change_log.sql`

호스트 데이터는 저장하지 않는다. 감사 로그 테이블 1개만 신설.

```sql
CREATE TABLE host_change_log (
    id          BIGSERIAL PRIMARY KEY,
    zabbix_hostid VARCHAR(32),          -- delete 후에도 식별 가능하도록 값 보존
    host_name   VARCHAR(255) NOT NULL,
    action      VARCHAR(16)  NOT NULL,  -- CREATE / UPDATE / ENABLE / DISABLE / DELETE
    payload     JSONB,                  -- 요청 스냅샷(변경 내용). 비밀값 없음
    actor       VARCHAR(128),           -- ActorResolver 결과
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_host_change_log_hostid ON host_change_log (zabbix_hostid);
CREATE INDEX idx_host_change_log_created ON host_change_log (created_at DESC);
```

- 기록 시점: 자빅스 쓰기 **성공 후** insert(실패해도 본 동작은 성공 처리, 로그만 warn — 감사 로그가 기능을 막지 않는다).
- 1차 화면 노출은 없음(테이블만 적재). 이력 조회 UI는 2차.

---

## 4. API 계약 — `host/manage` (신규 7개, 그룹은 기존 재사용)

기존 `HostController`(`/hosts`)에 리터럴 서브패스로 추가한다. Spring은 리터럴 경로(`/hosts/manage/**`)를 패턴(`/hosts/{groupid}`)보다 우선 매칭하므로 충돌 없음(livecheck 선례와 동일 검증을 QA에 포함).

| # | 메서드/경로 | 요청 | 응답 | 권한 |
|---|------------|------|------|------|
| 1 | `GET /hosts/manage` | `keyword, groupids[], status, limit, offset` | `PagedListDto<ManagedHostDto>` — hostid, host, name, status, groups[], interfaces[], templates[], proxy{proxyid,name}, agentAvailable | admin |
| 2 | `POST /hosts/manage` | `HostCreateReqDto` — host, name?, groupIds[], **newGroupNames[]?**, interface{useip,ip,dns,port}, templateIds[], monitoredBy, proxyId?, status | `ManagedHostDto` | admin |
| 3 | `PUT /hosts/manage/{hostid}` | `HostUpdateReqDto` — POST와 동일 + `clearTemplateIds[]?` | `ManagedHostDto` | admin |
| 4 | `PATCH /hosts/manage/{hostid}/status` | `{ enabled: boolean }` | `{ hostid, status }` | admin |
| 5 | `DELETE /hosts/manage/{hostid}` | `{ confirmName: string }` — 서버에서도 호스트명 일치 검증(이중확인의 서버측 방어) | `{ hostid }` | admin |
| 6 | `GET /hosts/manage/templates` | `keyword, limit` | `[{ templateid, name }]` | admin |
| 7 | `GET /hosts/manage/proxies` | — | `[{ proxyid, name }]` | admin |

- **그룹 즉석 생성**: `newGroupNames[]`가 있으면 BE가 기존 `HostGroupService.create`를 먼저 호출(로컬 엔티티 일관성 유지)한 뒤 생성된 groupId를 합쳐 `host.create`. host.create 실패 시 신규 그룹은 롤백하지 않고 남긴다(무해, 재시도 시 재사용) — 응답 에러 메시지에 명시.
- 라이브체크는 **기존 `GET /hosts/{hostid}/livecheck` 재사용** (신규 없음). FE가 등록 성공 직후 호출.
- 자산 연동: POST 성공 시 `AssetSyncService`에 **단건 동기화 `syncOne(hostid)` 신설** 호출 → 자산 자동 생성(스냅샷 모델 유지: "쓰기 직후 해당 건 스냅샷 갱신" 규칙). DELETE 성공 시 연결 자산은 건드리지 않음(스냅샷 보존, 다음 전체 동기화 정책을 따름).

### BE 구조 (moveseye-be-spring)

```
zabbix/
  ZabbixHostService(+Impl)        — createHost/updateHost/deleteHost 메서드 추가 (기존 get/getRaw 옆)
  ZabbixTemplateService(+Impl)    — 신규: template.get
  ZabbixProxyService(+Impl)       — 신규: proxy.get
host/manage/
  HostManageController            — 위 7개 EP (기존 HostController와 분리된 신규 컨트롤러, @RequestMapping("/hosts/manage"))
  HostManageService               — 오케스트레이션(그룹 즉석생성 → host.create → 감사로그 → syncOne)
  dto/ (HostCreateReqDto, HostUpdateReqDto, ManagedHostDto, …)
  domain/HostChangeLog (+Repository)
asset/
  AssetSyncService.syncOne(hostid) — 신규 메서드 (기존 sync 로직에서 hostids 필터 분기)
```

- 쓰기 토큰: `ZabbixUserServiceImpl.getSuperAdminToken()` — 기존 write 관례 그대로.
- 권한: 컨트롤러 각 메서드 첫 줄 `AdminAccessChecker.requireAdmin(currentUser)` (**`@Roles`/roleid 가드 금지** — 순수 admin roleid=null 함정, AssetController 패턴 준수).
- Zabbix JSON-RPC 본문은 문자열 직렬화(`ZabbixClient` 기존 규칙) 준수.
- 테스트: 서비스 단위(MockBean ZabbixClient) + 컨트롤러 권한(비admin 403) + confirmName 불일치 거부.

---

## 5. FE 설계 (moveseyee_fe)

### 5.1 라우트·메뉴
- `PATH_SETTING.hostManagement = "/setting/host-management"` — `adminOnly` (ReportManagement와 동일 가드).
- SideNav: 설정 그룹에 "호스트 등록 관리"(i18n `host_management`) — isSuperRole 조건 노출.

### 5.2 페이지 구조 — `pages/setting/host-management/`

```
HostManagementPage        — Tabs: [호스트] [호스트 그룹]
  ├─ HostTab              — DmoveTable 목록 + 상단 [호스트 등록] 버튼
  │    컬럼: 호스트명(visible name 병기) / 그룹 / IP:Port / 프록시 / 템플릿 수 / 상태(활성 스위치) / Agent 가용성 / 액션(수정·삭제)
  │    필터: keyword 검색, 그룹 select, 상태 select
  ├─ HostFormDrawer       — 생성/수정 공용 (Drawer, 섹션형 단일 폼)
  │    ① 기본: Host name(+ agent conf Hostname 일치 안내문구), Visible name
  │    ② 그룹: 멀티 select — 검색 결과 없으면 "'{입력값}' 새 그룹으로 생성" 옵션 (즉석 생성 → newGroupNames)
  │    ③ 인터페이스: Agent 1개 — useip 토글, IP/DNS, Port(기본 10050)
  │    ④ 템플릿: 검색형 멀티 select (GET templates, debounce)
  │        수정 시 기존 템플릿 제거 → 항목별 "Unlink / Unlink and clear" 선택,
  │        clear 선택 시 인라인 경고("이 템플릿의 아이템·수집 데이터가 호스트에서 영구 삭제됩니다")
  │    ⑤ 모니터링: monitored_by(서버/프록시 라디오) + 프록시 select (GET proxies)
  │    ⑥ 상태: 활성/비활성
  ├─ HostCreateResultStep — 등록 성공 → Drawer 내 결과 화면: livecheck 자동 호출,
  │        ping/agent 상태 표시. agent UNAVAILABLE이면 "Host name과 zabbix_agent.conf의
  │        Hostname 일치 여부, 프록시 설정을 확인하세요" 트러블슈팅 안내 (차별점 기능)
  ├─ HostDeleteModal      — 강경고 + 호스트명 타이핑 이중확인 → DELETE(confirmName)
  └─ HostGroupTab         — 그룹 목록/생성/이름수정/삭제 — 기존 /users/host-groups API 재사용
       (신규 쿼리 키로 분리 — 레거시 화면과 캐시 충돌 방지 규칙 준수)
```

### 5.3 데이터 레이어
- `services/host-manage.api.ts` — BASE `/api/v1/hosts/manage` (§4의 7개). 그룹은 기존 user-roles 서비스 함수 재사용하되 **쿼리 키는 `HOST_MANAGE_QUERY_KEY.*`로 신설**.
- `types/host-manage.ts` — 계약 DTO 미러링. `useDmoveQuery` 언랩 규칙(payload 직수신) 준수.
- 뮤테이션 성공 시 invalidate: 목록 + (그룹 변경 시) 그룹 목록. 상태 스위치는 낙관적 업데이트 없이 재조회(안전 우선).

### 5.4 테스트
- HostTab 렌더/빈 목록/로딩, HostFormDrawer 필수값 검증(그룹 필수·IP 형식), 템플릿 clear 경고 노출, 삭제 모달 confirmName 불일치 시 버튼 비활성. mock 패턴은 FE CLAUDE.md 표준.

---

## 6. 구현 단계 (fullstack-feature 파이프라인)

1. **BE (be-engineer)** — V9 마이그레이션 → Zabbix 어댑터 3종(host write/template/proxy) → HostManageService/Controller → syncOne → 단위 테스트. **착수 직전 dev 자빅스에 host.create 파라미터(monitored_by/proxyid, interfaces) 실호출 검증.**
2. **계약 산출** — `features/zabbix-config/host-registration/contract_host-registration.md` (springdoc `/v3/api-docs` 기준).
3. **FE (fe-engineer)** — 라우트/메뉴 → 서비스/타입/훅 → 화면 5종 → 테스트.
4. **integration-qa** — DTO↔타입 대조, 경로 매칭(`/hosts/manage` vs `/hosts/{groupid}`) 확인.
5. **functional-qa** — E2E: 그룹 즉석생성 포함 등록 → livecheck 결과 → 수정(unlink/clear 분기) → 비활성화 → 삭제(이중확인) → 자산 목록에 신규 자산 자동 생성 확인. ⚠️ dev 자빅스에 실제 쓰기 발생 — 테스트 호스트는 `dmove-qa-` prefix로 생성 후 삭제까지 E2E에 포함. 스크린샷 최소화 규칙 준수.

---

## 7. 2차 로드맵 (기록만)

- 매크로 편집(임계치 값 수정 — 별도 기능 "임계치 관리"로 승격 예정), 태그·인벤토리 편집
- SNMP/IPMI/JMX 인터페이스, 다중 인터페이스
- 프록시 자동 추천(네트워크 대역→프록시 매핑 규칙 설정화 — 넥센 mahok/cp/yp 규칙의 일반화)
- 변경 이력(host_change_log) 조회 UI
- 그룹 벌크 이동(hostgroup.massadd/massupdate 활용), 호스트 복제(clone)
- Maintenance(알림 중지) 관리 — 3순위 기능으로 별도 설계

## 8. 미확정 → 구현 중 확인 항목

1. Zabbix 7.0 `host.create` 정확한 프록시 파라미터명(`monitored_by`+`proxyid`) — dev 실호출로 확정 (§2 ⚠️).
2. dev 자빅스 super admin 토큰의 쓰기 권한 실효성(정책상 read-only 계정일 가능성) — BE 착수 시 최우선 확인.
3. `host.get` 목록에서 proxy 이름 join 방식(`selectProxy` 지원 여부 vs proxy.get 별도 매핑).
