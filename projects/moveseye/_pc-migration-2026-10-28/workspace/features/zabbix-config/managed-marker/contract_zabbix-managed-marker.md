# API 계약 — Zabbix 관리 화면 "MovesEye 관리(프리셋)" 표시 (zabbix-managed-marker)

- **이슈**: ZM-78 (브랜치 ZM-78, 워크트리 `C:\worktrees\zm-78-be`) · **작성일** 2026-10-12 (보강 2026-10-12: `presetName` 추가, 호스트 연결 템플릿·연결/해제 응답에 확장 — §2-B)
- **요구**: "우리가 디폴트로 생성하는 템플릿·템플릿 그룹·아이템 — 표시 좀 해줘야 해. 구분이 안 가"
- **성격**: **응답 필드 추가만(additive)**. 경로·요청·상태코드·기존 필드 무변경. 쓰기는 막지 않는다(차단 여부는 사용자 결정 대기).
- **관련 계약**: 엔드포인트 본문은 [features/zabbix-config/item-template-mgmt/contract_item-template-mgmt.md](../item-template-mgmt/contract_item-template-mgmt.md)(아이템·템플릿·템플릿 그룹), [features/zabbix-config/trigger-mgmt/contract_trigger-mgmt.md](../trigger-mgmt/contract_trigger-mgmt.md)(트리거), LLD는 `ZabbixLldManageController`. 이 파일은 그 위에 얹히는 **공통 필드 하나**의 정본이다.
- **설계 근거**: `features/premium/gpu-monitoring/devdesign_gpu-collection-paths.md` §15(프리셋 템플릿 식별 = 템플릿 태그), §15.3(관리 화면 경고)

---

## 1. 공통 타입 `MovesEyeManagedDto` (필드명 `moveseyeManaged`)

일반 구성물이면 **`null`**(값 없음). FE는 `null`과 키 생략을 같은 의미로 다룬다.

```ts
type MovesEyeManaged = {
  kind: 'PRESET';                       // 현재 PRESET 하나(확장 여지)
  presetId: string | null;              // 'gpu-dcgm-http' 등. 템플릿 그룹 마커는 null
  presetName: string | null;            // 카탈로그 표시명(예: 'MovesEye GPU by DCGM (HTTP)'). 고객이 Zabbix에서 바꾼 이름이 아님. 모르는 presetId·그룹은 null
  version: string | null;               // 설치된 템플릿의 moveseye_preset_version 태그 값. 태그 없으면 null
  latestVersion: string | null;         // 이 제품이 배포하는 최신 버전(카탈로그). 모르는 presetId·그룹은 null
  status: 'CURRENT' | 'OUTDATED' | 'TAG_MISSING' | 'UNKNOWN' | null;  // 그룹 마커는 null
  basis: 'TAG' | 'NAME' | 'CONTAINS_PRESET';
} | null;
```

| status | 뜻 | FE 표시 제안 |
|---|---|---|
| `CURRENT` | 태그 있음, 버전 = 제품 최신(또는 그 이상) | "MovesEye 프리셋" 배지 |
| `OUTDATED` | 태그 있음, 버전이 제품보다 낮음 **또는 버전 태그 없음** | 배지 + "갱신 필요"(경고색) |
| `TAG_MISSING` | 태그는 없는데 **기술명(host)**이 프리셋과 같음 — 수동 가져오기·태그 삭제 | 배지 + "식별 태그 없음" |
| `UNKNOWN` | `moveseye_preset` 태그 값이 이 제품 카탈로그에 없음(더 새 제품의 프리셋 등) | 배지(버전 비교 불가) |
| `null` | 템플릿 그룹 마커 | 그룹 배지만 |

| basis | 대상 | 뜻 |
|---|---|---|
| `TAG` | 템플릿·아이템·트리거·LLD | 원본 템플릿에 `moveseye_preset` 태그 |
| `NAME` | 템플릿 계열 | 태그 없이 기술명 일치(= status `TAG_MISSING`) |
| `NAME` | 템플릿 그룹 | 그룹 이름이 정확히 `MovesEye presets` |
| `CONTAINS_PRESET` | 템플릿 그룹 | 이름은 다르지만 프리셋 템플릿을 1개 이상 포함 |

---

## 2. 필드가 추가된 엔드포인트

| 엔드포인트 | DTO | 판정 대상 |
|---|---|---|
| `GET /zabbix-manage/templates` (목록) | `ManagedTemplateDto.moveseyeManaged` | 그 템플릿 자체 |
| `GET /zabbix-manage/templates/{templateid}` (상세) | `ManagedTemplateDetailDto.moveseyeManaged` | 〃 |
| `POST /zabbix-manage/templates`, `PUT /zabbix-manage/templates/{id}` 응답 | `ManagedTemplateDto` | 〃 |
| `GET /zabbix-manage/template-groups/list` (관리 목록) | `ManagedTemplateGroupDto.moveseyeManaged` | 그룹 이름 / 프리셋 포함 여부 |
| `GET /zabbix-manage/template-groups/{groupid}`, POST·PUT 응답 | `ManagedTemplateGroupDto` | 〃 |
| `GET /zabbix-manage/items?hostid=` · `?templateid=` (목록) | `ManagedItemDto.moveseyeManaged` | 아래 §3 |
| `GET /zabbix-manage/items/{itemid}` (상세), POST·PUT 응답 | `ManagedItemDto` | 〃 |
| `GET /zabbix-manage/triggers?hostid=` · `?templateid=` (목록) | `ManagedTriggerDto.moveseyeManaged` | 〃 |
| `GET /zabbix-manage/discovery-rules?hostid=` · `?templateid=` (목록) | `ManagedLldRuleDto.moveseyeManaged` | 〃 |

### 2-B. 호스트 쪽 템플릿 연결 (보강)

| 엔드포인트 | DTO | 비고 |
|---|---|---|
| `GET /hosts/manage` (목록) · `GET /hosts/manage/{hostid}` · `POST`/`PUT /hosts/manage[/{hostid}]` 응답 | `ManagedHostDto.templates[].moveseyeManaged` (`TemplateRefDto`) | 호스트 템플릿 탭·편집 폼에서 **해제 전 경고**용. 목록은 페이지의 연결 템플릿 id 전체(중복 제거)를 **한 번에** 판정 |
| `GET /hosts/manage/templates` (연결 후보 검색) | `TemplateRefDto.moveseyeManaged` | 연결 시 "프리셋" 표시 |
| `GET /zabbix-manage/templates/{templateid}` 상세의 `parentTemplates[]` | `TemplateRefDto.moveseyeManaged` | 부모 템플릿이 프리셋이면 |
| `POST /zabbix-manage/templates/{templateid}/link` · `/unlink` 응답 | `TemplateLinkResDto.moveseyeManaged` | 그 템플릿의 마커 |

`TemplateRefDto`는 `{ templateid, name, moveseyeManaged }`가 됐다(기존 2필드 그대로). 호스트 해제는 `PUT /hosts/manage/{hostid}`의
`templateIds`/`clearTemplateIds`로 하므로, FE는 **해제 대상 중 `moveseyeManaged != null`이 있으면** 확인 모달을 띄운다.

**바뀌지 않은 것**: 트리거 상세(`ManagedTriggerDetailDto`)·LLD 규칙 상세(`ManagedLldRuleDetailDto`)·렌즈(`/items/lens`, `/triggers/lens`)·
`GET /zabbix-manage/template-groups`(select용 `TemplateGroupRefDto`)·템플릿 DTO의 `groups[]` 원소. 필요하면 FE 요청사항으로 올릴 것.

## 3. 아이템·트리거·LLD 판정 규칙

1. **디스커버리 생성물**(flags=4): 자기를 만든 LLD 규칙의 원본 템플릿이 프리셋이면 마커. GPU 지표(아이템·트리거) 대부분이 이 경로다.
2. **상속본**(templateid≠0): 부모 체인을 끝까지 따라간 **원본 템플릿**이 프리셋이면 마커(중첩 템플릿 2단 이상도 원본까지).
3. **그 외(로컬)**: 소속 컨테이너가 프리셋 템플릿이면 마커 — 즉 템플릿 스코프(`?templateid=` 프리셋)에선 그 템플릿의 아이템 전부.
4. 호스트에 직접 만든 아이템·트리거는 항상 `null`.

마커는 **원본 템플릿의** 태그·버전을 그대로 싣는다(아이템 자체의 버전 개념 없음).

## 4. 예시

```jsonc
// GET /zabbix-manage/templates → data.items[]
{ "templateid": "10761", "name": "MovesEye GPU by DCGM HTTP", "displayName": "MovesEye GPU by DCGM (HTTP)",
  "description": "...", "itemCount": 2, "triggerCount": 0, "linkedHostCount": 1,
  "groups": [{ "groupid": "50", "name": "MovesEye presets" }],
  "moveseyeManaged": { "kind": "PRESET", "presetId": "gpu-dcgm-http", "presetName": "MovesEye GPU by DCGM (HTTP)",
                       "version": "1.0", "latestVersion": "1.0", "status": "CURRENT", "basis": "TAG" } }
{ "templateid": "10001", "name": "Linux by Zabbix agent", ..., "moveseyeManaged": null }

// GET /zabbix-manage/template-groups/list → data.items[]
{ "groupid": "50", "name": "MovesEye presets", "templateCount": 3,
  "moveseyeManaged": { "kind": "PRESET", "presetId": null, "presetName": null, "version": null, "latestVersion": null,
                       "status": null, "basis": "NAME" } }

// GET /zabbix-manage/items?hostid=10760 → data.items[] (GPU 디스커버리 아이템)
{ "itemid": "70123", "hostid": "10760", "name": "GPU 0: Utilization", "flags": "4", "templateid": "0", ...,
  "moveseyeManaged": { "kind": "PRESET", "presetId": "gpu-dcgm-http", "presetName": "MovesEye GPU by DCGM (HTTP)",
                       "version": "1.0", "latestVersion": "1.0", "status": "CURRENT", "basis": "TAG" } }

// GET /hosts/manage/10760 → data.templates[]
[ { "templateid": "10761", "name": "MovesEye GPU by DCGM (HTTP)",
    "moveseyeManaged": { "kind": "PRESET", "presetId": "gpu-dcgm-http", "presetName": "MovesEye GPU by DCGM (HTTP)",
                         "version": "1.0", "latestVersion": "1.0", "status": "CURRENT", "basis": "TAG" } },
  { "templateid": "10001", "name": "Linux by Zabbix agent", "moveseyeManaged": null } ]
```

## 5. 비용·실패 시맨틱 (QA 참고)

- 프리셋 판정 색인(전역 1개, Redis `zabbixadmin:preset-index:v1`, TTL 60초) 적재 = `template.get` **2회**(태그 Exists 필터 + 카탈로그 기술명 필터). 목록 크기와 무관.
- 행 판정의 체인 역추적은 **깊이당 1콜 배치**(+디스커버리 생성물이 있으면 `item.get`/`trigger.get` 1회 + `discoveryrule.get` 깊이당 1회). **프리셋이 하나도 설치돼 있지 않으면 추가 콜 0회.**
- 판정 실패(Zabbix 오류 등)는 **마커만 빠지고 목록은 정상 응답**(fail-soft).
- 우리 화면에서 템플릿 수정·삭제 시 색인 캐시를 비운다. Zabbix UI에서 직접 바꾼 태그는 최대 60초 뒤 반영.

## 6. 쓰기 경고 (FE 몫)

BE는 막지 않는다. FE가 `moveseyeManaged != null`인 행의 **수정·삭제·비활성** 버튼에서 확인 모달을 띄운다
(문구 예: "MovesEye가 배포·관리하는 프리셋입니다. 수정하면 제품 업데이트 시 덮어써지거나 GPU 화면이 동작하지 않을 수 있습니다").
차단(409 등)으로 갈지는 **사용자 결정 사항**.

## 🔄 FE 요청사항

(없음 — 필요 시 여기에)
