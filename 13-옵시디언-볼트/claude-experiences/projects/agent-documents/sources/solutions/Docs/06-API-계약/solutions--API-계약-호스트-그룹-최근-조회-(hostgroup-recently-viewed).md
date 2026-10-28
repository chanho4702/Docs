# API 계약: 호스트 그룹 최근 조회 (hostgroup recently-viewed)

작성: be-engineer / 날짜: 2026-06-19
대상 모듈: `moveseye-be` host 모듈 (기존 server/network/EC2 recently-viewed 인프라 확장)

---

## 1. 추가/변경된 enum 값

`RecentlyViewedRefType` (`src/database/models/recently-viewed.entity.ts`)

| 기존 | 추가 |
|------|------|
| `SERVER`, `EC2S`, `NETWORK` | **`HOSTGROUP`** |

- **FE가 보내야 할 정확한 문자열: `"HOSTGROUP"`** (대문자 고정).
- DB-level PostgreSQL enum 타입(`recently_viewed_ref_type_enum`)이므로 마이그레이션으로 값 추가함 (아래 5번).

---

## 2. mark-view 엔드포인트 (변경 없음 — HOSTGROUP 그대로 동작)

| 항목 | 값 |
|------|----|
| 메서드/경로 | `GET /api/v1/host/mark-view/:hostid` (실제 prefix는 컨트롤러 `@Controller` 기준; FE 기존 호출 경로 유지) |
| path param | `:hostid` — **호스트 그룹의 경우 groupid를 그대로 넣는다** (string) |
| query | `refType` (enum, 필수) = `"HOSTGROUP"`, `region` (string, optional) |
| region 사용 여부 | **HOSTGROUP은 region 불필요.** 보내도 무방하나 DB에 region 컬럼이 없어 저장되지 않음(기존 SERVER/NETWORK와 동일하게 무시됨). FE는 HOSTGROUP에서 region을 보내지 않는 것을 권장. |
| 응답 | `ApiResult<boolean>` → `data: true` |

- 서비스 `markViewHost(userId, hostId, refType, region?)`는 refType enum을 그대로 저장하므로 HOSTGROUP 코드 변경 없이 정상 기록됨.

---

## 3. recently-viewed 엔드포인트 (HOSTGROUP 분기 추가)

| 항목 | 값 |
|------|----|
| 메서드/경로 | `GET /api/v1/host/recently-viewed` (FE 기존 호출 경로 유지) |
| query.refType | `"HOSTGROUP"` (enum, 필수) |
| query.excludeId | string, **필수** (현재 보고 있는 그룹 자신을 제외; 없으면 `''` 처리). HOSTGROUP에서는 현재 groupid를 넣는다. |
| query.limit | number (BasePageDto) |
| query.offset | number (BasePageDto) |

### 응답 래퍼 깊이
```
ApiResult<PaginationResponseDto<item>>
└ data
  ├ items: item[]
  └ total: number
```
- 축약: `res.data.items`, `res.data.total`.
- (참고: FE는 axios 인터셉터 + useDmoveQuery가 2겹 언랩하므로 소비 시점에서 payload(`{ items, total }`)를 직접 수신. data.data 형태 아님.)

### 응답 item의 정확한 필드 (HOSTGROUP)
| 필드 | 타입 | 값 |
|------|------|----|
| `hostid` | string | **groupid를 담는다** (FE가 링크 id로 사용하는 필드명 통일을 위해 groupid를 hostid 키에 매핑) |
| `name` | string | 호스트 그룹명 (Zabbix hostgroup.get의 name) |
| `createdAt` | string (ISO8601) | 최근 조회 시각 (`MAX(created_at)`를 ISO 문자열로) |

- **`region` 없음** (HOSTGROUP item에는 region 필드를 포함하지 않음).
- **`host` 없음** (SERVER/NETWORK item에는 `host` 필드가 있으나 HOSTGROUP에는 없음).

### 참고: 다른 refType의 item shape (회귀 기준, 변경 없음)
- SERVER / NETWORK: `{ hostid, name, host, createdAt }`
- EC2S: `{ hostid(=instanceId), name(=instanceName), region }` (createdAt 없음 — 기존 동작 그대로)

---

## 4. 호스트 그룹 상세 링크 id

- **링크 id = `item.hostid` (= Zabbix groupid)**.
- FE는 호스트 그룹 상세로 이동할 때 `item.hostid`를 groupid로 사용한다.

---

## 5. 마이그레이션

- 파일: `src/database/migrations/1750300000000-AddHostgroupToRecentlyViewedEnum.ts`
- 내용: `ALTER TYPE "recently_viewed_ref_type_enum" ADD VALUE IF NOT EXISTS 'HOSTGROUP';` (PG 12+, 멱등)
- down: enum 타입 재생성으로 HOSTGROUP 제거 + HOSTGROUP 행은 NETWORK로 강등.
- **배포 시 마이그레이션 실행 필수** (synchronize 비활성).

---

## 6. 구현 상세 (BE 내부)

- `listRecentlyViewedHosts`: refType === HOSTGROUP일 때
  - `zabbixHostService.get`(host.get) **호출 건너뜀** (불필요/오류 방지 가드).
  - ref_id(groupid) 목록을 `ZabbixHostGroupService.getZabbixHostGroupList(authToken, undefined, groupIds)`로 조회 → groupid→name 매핑.
  - groupid 숫자 형태만 필터(빈 문자열/비숫자 제외).
- 변경 파일:
  - `src/database/models/recently-viewed.entity.ts` (enum)
  - `src/host/host.service.ts` (HOSTGROUP 분기)
  - `src/host/host.service.spec.ts` (테스트)
  - `src/database/migrations/1750300000000-AddHostgroupToRecentlyViewedEnum.ts` (신규)

---

## 7. 회귀 주의사항

1. **응답 item에 host/region 필드 유무가 refType별로 다름.** FE는 HOSTGROUP에서 `host`, `region`을 참조하지 말 것 (undefined). hostid, name, createdAt만 신뢰.
2. **host.get 호출 위치 이동:** 기존 코드는 refType 무관하게 항상 host.get을 호출했으나, 이제 HOSTGROUP은 host.get을 건너뛴다. SERVER/NETWORK/EC2 경로는 동일하게 host.get을 거침(EC2는 결과를 사용하진 않지만 호출은 유지 — 기존 동작 보존).
3. **excludeId는 쿼리 단계에서 제외**(ref_id != excludeId). HOSTGROUP도 동일.
4. **마이그레이션 미실행 시** HOSTGROUP 저장이 enum 제약 위반으로 실패하므로 배포 순서 주의.
5. enum 추가가 mark-viewed DTO(`@IsEnum(RecentlyViewedRefType)`)에 자동 반영됨 — HOSTGROUP이 유효값이 됨.

---

## 8. FE 핵심 요약 (가장 중요)

- refType 문자열: **`"HOSTGROUP"`**
- recently-viewed 응답 item: **`{ hostid: string(=groupid), name: string, createdAt: string }`** — region/host 없음.
- 상세 링크 id: `item.hostid` (groupid).
- mark-view 시 `:hostid`에 groupid, query refType=`HOSTGROUP`, region 생략.
