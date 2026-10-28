# API 계약 — 디스크 상세 (Disk Detail)

BE: Spring 단일(`moveseye-be-spring`). 호스트 그룹 상세 화면에서 호스트 선택 시 그 호스트의
마운트(파일시스템)별 디스크 상세 현재값을 조회한다.

생성일 2026-06-24 / 작성 be-engineer

---

## 1. 엔드포인트 (확정: 옵션 a — 개별 호스트)

`GET /host/{id}/disk/detail`

- 기존 disk 모듈 컨벤션(`/host/{id}/disk/summary`, `/host/{id}/disk/line-charts`)과 1:1 정합.
- `{id}` = Zabbix host id (path).
- 요청 바디/쿼리 없음.
- 인증/권한/envelope/x-visitor-id: 다른 host 메트릭 EP와 동일.
  - `@SecurityRequirement("bearer")` (JWT), `@VisitorIdCheck` (x-visitor-id 헤더 필요),
    `@CurrentUser`로 authToken 사용.
  - 권한 거부는 **HTTP 200 + body code 403** (원본/Spring 보존 규약), 401만 실제 상태코드.
  - 응답 envelope: `ApiResult.success(data)` → `{ "data": <payload>, "code": 200, "message": ... }`
    (다른 EP와 동일 형태).

### 호스트 목록(드롭다운) 제공 방식 — 신규 EP 없음, 기존 재사용
FE는 그룹 상세에서 이미 쓰는 호스트 목록 EP로 드롭다운을 채운다:

- `GET /hosts/{groupid}/top-hosts` → `PaginationResponseDto<HostStatusDto>`
  - 각 항목: `hostid`(String), `name`(String) … (그 외 status/health 필드).
  - 드롭다운: `hostid`(value) + `name`(label) 사용.
- 호스트를 고르면 그 hostid로 `GET /host/{hostid}/disk/detail` 호출.

---

## 2. 응답 shape

```jsonc
// ApiResult.data
{
  "hostid": "10084",
  "hostName": "web-prod-01",
  "filesystems": [
    {
      "fsname": "/",
      "fstype": "xfs",
      "bytes":  { "used": 14377070592, "free": 15398293504, "total": 29775364096,
                  "pused": 48.285121, "pfree": 51.714879 },
      "inodes": { "used": 105560, "free": 14465960, "total": 14571520,
                  "pused": 0.724427, "pfree": 99.275573 }
    },
    {
      "fsname": "C:",
      "fstype": "NTFS",
      "bytes":  { "used": 351046651904, "free": 147152773120, "total": 498199425024,
                  "pused": 70.463078, "pfree": 29.536922 }
      // inodes 없음 — Windows 호스트는 inode 미보고 → 필드 자체가 생략(null)
    }
  ]
}
```

### 필드 타입 (BE 직렬화 기준)
- `hostid`: string. `{id}` 그대로 carry.
- `hostName`: string \| null. Zabbix host.get name(없으면 host). 조회 실패 시 null(graceful).
- `filesystems`: FilesystemDetail[].
  - `fsname`: string \| null. 마운트/파일시스템명 (`/`, `/data`, `C:` 등).
  - `fstype`: string \| null. (`xfs`, `ext4`, `NTFS` …).
  - `bytes`: DiskBytes (항상 존재 — bytes 없는 항목은 제외됨).
    - `used` / `free` / `total`: number (long, **Byte 원값**).
    - `pused` / `pfree`: number (double, **%**).
  - `inodes`: DiskInodes \| **생략(null)**. Windows 등 inode 미보고 호스트는 키 자체가 없음.
    - `used` / `free` / `total`: number (long).
    - `pused` / `pfree`: number (double, %).

> ⚠️ `inodes`는 `@JsonInclude(NON_NULL)`이라 **있는 호스트만 키가 나타난다**. FE는 옵셔널 처리 필수.
> Windows 호스트는 inodes 컬럼/표시를 숨기거나 "-"로.

---

## 3. 단위 (중요)
- `bytes.used/free/total` = **진짜 Byte 원값**. FE는 `formatBytes`(IEC 1024)로 표시.
  - ⚠️ 디스크 용량은 byte가 맞다(net.if 트래픽 bps 함정과 무관 — disk는 formatBytes 정상).
- `pused/pfree` = % 숫자(이미 백분율). FE에서 곱하기/나누기 없이 그대로 표시(소수 2자리 등 반올림은 FE 재량).
- inode `used/free/total` = 개수(정수). FE는 천단위 콤마 정도.

---

## 4. Zabbix item 실측 (dev `dmove.co.kr`)
- item.get: `search.key_ = "vfs.fs.dependent["` (부분일치) → 호스트의 마운트별 항목.
- ⚠️ 부분일치라 `vfs.fs.dependent[/,readonly]`(value_type 3) 등도 함께 잡힌다.
  **`key_`가 `,data]`로 끝나는 항목만**(value_type 4 = text) 사용 → BE에서 필터링함.
- 사용 item 키 형태: `vfs.fs.dependent[<mount>,data]`
  - 예: `vfs.fs.dependent[/,data]`, `vfs.fs.dependent[/data,data]`, `vfs.fs.dependent[C:,data]`
  - 한 호스트에 마운트마다 1개(예: hostid 10696 → `/`, `/boot`, `/app`, `/data` 4개).
- **lastvalue = JSON 문자열**. 이 master item의 lastvalue를 직접 파싱(개별 dependent .size[...] item을 읽지 않음).

### lastvalue 실측 샘플 (Linux, hostid 10695, `vfs.fs.dependent[/,data]`)
```json
{"fsname":"/","options":"rw,relatime","bytes":{"used":6956261376,"free":89383649280,"total":100748972032,"pused":7.2205395755853061,"pfree":92.7794604244147},"fstype":"ext4","inodes":{"used":39662,"free":6202738,"total":6242400,"pused":0.635364603357683,"pfree":99.364635396642313}}
```
### lastvalue 실측 샘플 (Windows, hostid 10698, `vfs.fs.dependent[C:,data]`)
```json
{"fsname":"C:","fslabel":"Windows 11","bytes":{"used":351046651904,"free":147152773120,"total":498199425024,"pused":70.463078,"pfree":29.536922},"fsdrivetype":"fixed","fstype":"NTFS"}
```
- ⚠️ **Windows에는 `inodes` 블록이 없다**(대신 `fslabel`/`fsdrivetype` 존재 — 응답에는 미노출).
- 많은 item이 lastvalue가 **빈 문자열**(호스트 오프라인/미수집) → 해당 마운트 스킵.

---

## 5. 빈/오류 처리 (graceful)
- 디스크 상세 item이 없는 호스트 → `filesystems: []`.
- lastvalue 빈 문자열/null인 item → 해당 마운트 스킵.
- JSON 파싱 실패 → 해당 마운트 스킵(warn 로그).
- `bytes` 블록 누락 item → 스킵(의미 없음).
- inode 블록 없음 → `inodes` 생략(정상 케이스, Windows).
- 개별 숫자 필드 누락 → 0(`asLong(0)`/`asDouble(0)`).
- hostName 조회 실패 → `hostName: null`(나머지는 정상 반환).

---

## 6. FE 타입 제안 (TS)
```ts
export interface DiskBytes {
  used: number;   // Byte 원값
  free: number;
  total: number;
  pused: number;  // %
  pfree: number;  // %
}
export interface DiskInodes {
  used: number;
  free: number;
  total: number;
  pused: number;  // %
  pfree: number;  // %
}
export interface FilesystemDetail {
  fsname: string | null;
  fstype: string | null;
  bytes: DiskBytes;
  inodes?: DiskInodes;   // ⚠️ Windows는 없음(옵셔널)
}
export interface DiskDetailRes {
  hostid: string;
  hostName: string | null;
  filesystems: FilesystemDetail[];
}
```
- 호출: `GET /host/{hostid}/disk/detail`. useDmoveQuery 사용 시 payload(=data) 직접 수신.
- 표 구성 제안(마운트별 행): 마운트(fsname) / 타입(fstype) / 사용(formatBytes(bytes.used)) /
  여유(formatBytes(bytes.free)) / 전체(formatBytes(bytes.total)) / 사용률(bytes.pused%) /
  inode 사용률(inodes?.pused, 없으면 "-").
- 드롭다운 소스: `GET /hosts/{groupid}/top-hosts` → `data.list[].{hostid,name}`.

---

## 7. 변경 파일
- `common/constants/ZabbixItemKey.java` — `VFS_FS_DEPENDENT_DATA_SEARCH`, `VFS_FS_DEPENDENT_DATA_SUFFIX` 추가.
  - (2026-06-24 폴백) `VFS_FS_SIZE_SEARCH`(="vfs.fs.size[") + `VFS_FS_SIZE_SUB_{TOTAL,USED,FREE,PUSED,PFREE}` 추가.
- `host/disk/dto/DiskBytesDto.java` (신규)
- `host/disk/dto/DiskInodesDto.java` (신규)
- `host/disk/dto/FilesystemDetailDto.java` (신규)
- `host/disk/dto/DiskDetailResDto.java` (신규)
- `host/disk/DiskService.java` — `getDetail()` + JSON 파싱 추가, ZabbixHostService/ObjectMapper 주입.
- `host/disk/DiskController.java` — `GET /{id}/disk/detail` 추가.
- `test/.../host/disk/DiskDetailServiceTest.java` (신규, 6 케이스).

## 8. 검증
- `JAVA_HOME=jdk-17 gradlew build` BUILD SUCCESSFUL (전체 테스트 포함).
- 단위 테스트: happy(linux+inodes) / windows(inodes=null) / empty(item 없음) / 빈 lastvalue 스킵 /
  non-data key 무시 / malformed·bytes 누락 스킵.
- 폴백 테스트(아래 §9): size 합성 / dependent 우선 / 둘 다 없음 → [] / 부분 서브키 / total·used 부재 스킵 / 빈 lastvalue 스킵.

---

## 9. vfs.fs.size 폴백 (현황 정합) — 2026-06-24 추가

진단 `diag_disk-detail-mismatch.md` 확정: group 2에서 디스크 **차트엔 나오지만 디스크 상세 표는
`filesystems:[]`** 인 호스트 4대(10.220.0.52/.70/.92/.93)가 있다. 원인은 데이터 소스 비대칭 —
차트는 `vfs.fs.size[<mount>,pused]`(trend) 소스, 상세는 `vfs.fs.dependent[<mount>,data]` master
JSON 소스인데 이들이 **다른 호스트군에 붙어** group 2에 둘 다 성립하는 호스트가 0대.
이 화면은 **현재 디스크 현황**(시계열 아님) 표시가 목적이므로, 상세 표가 "디스크 데이터가 있는 모든
호스트"를 커버하도록 size 계열 폴백을 추가했다. **응답 shape/DTO/경로/권한 무변경 — 기존 FE 그대로 소비.**

### 9.1 폴백 트리거 조건
1. **1순위(무변경)**: `vfs.fs.dependent[<mount>,data]` master lastvalue(JSON) 파싱(§4 기존 경로).
2. **그 결과 filesystems가 비면**(dependent[,data] item 자체가 0개이거나 전부 빈/파싱불가) →
   `vfs.fs.size[<mount>,*]` 현재값으로 합성하는 폴백을 탄다.
3. dependent 결과가 1건이라도 있으면 폴백은 **타지 않는다**(기존 우선, 회귀 없음).
4. dependent도 size도 없으면 기존 graceful 규약대로 `filesystems:[]`(§5 보존).

### 9.2 size 서브키 → bytes 매핑
조회: `item.get search.key_="vfs.fs.size["`. key `vfs.fs.size[<mount>,<sub>]`에서 mount/sub 파싱
(정규식 `vfs\.fs\.size\[([^,]+),(.+)]`), 마운트별로 그룹핑.

| size 서브키 | value_type | 단위 | → bytes 필드 |
|---|---|---|---|
| `[<mount>,total]` | 3 (uint) | **Byte 원값** | `bytes.total` |
| `[<mount>,used]` | 3 (uint) | **Byte 원값** | `bytes.used` |
| `[<mount>,free]` | 3 (uint) | **Byte 원값** | `bytes.free` |
| `[<mount>,pused]` | 0 (float) | **%** | `bytes.pused` |
| `[<mount>,pfree]` | 0 (float) | **%** | `bytes.pfree` |

- lastvalue가 빈 문자열/null/숫자파싱 불가인 서브키는 **스킵**.
- **누락 보정**: `free`가 없고 total·used가 있으면 `free = total - used`. `pused`가 없고 total>0·used가
  있으면 `pused = used/total*100`. `pfree`가 없고 pused가 있으면 `pfree = 100 - pused`.
- **마운트 스킵 규칙**: `total`·`used` **둘 다 없으면** bytes를 의미있게 채울 수 없으므로 그 마운트 스킵.
  보정 불가한 개별 필드는 0(기존 graceful 규약).

### 9.3 폴백 FilesystemDetail의 inode/fstype 부재
- `inodes`: **null** — size 계열엔 inode 정보 없음. `@JsonInclude(NON_NULL)`이라 **JSON 키 자체 생략**
  (FE 옵셔널 처리 이미 됨, §6 `inodes?`).
- `fstype`: **null** — size 계열엔 타입 없음. FE는 null/"-" 처리.
- `fsname`: 마운트명(키에서 파싱, 예 `/`, `/boot`).

### 9.4 단위 (재확인)
- `total/used/free` = **Byte 원값**(FE `formatBytes` IEC 1024 정상). dependent 경로와 동일 단위.
- `pused/pfree` = 이미 % 숫자. 디스크는 byte가 맞다(net.if 트래픽 bps 함정과 무관).

### 9.5 dev Zabbix 실측 — .70(hostid 10652) vfs.fs.size[ 키 구성 (2026-06-24)
```
vfs.fs.size[/,pused]      vt=0 %  last=48.5
vfs.fs.size[/,total]      vt=3 B  last=66930339840
vfs.fs.size[/,used]       vt=3 B  last=31010394112
vfs.fs.size[/boot,pused]  vt=0 %  last=72.8
vfs.fs.size[/boot,total]  vt=3 B  last=480591872
vfs.fs.size[/boot,used]   vt=3 B  last=327634944
```
→ 마운트당 **total/used/pused 3종만**(free/pfree 부재) → free=total-used, pfree=100-pused 보정으로 합성.
.52/.92/.93(10635/10638/10647)도 동일하게 6키(마운트 2개×3종) 구성.
