# API 계약 — 그룹 호스트별 현재 디스크 요약 (disk-current)

> BE: Spring(`moveseye-be-spring`) 단일. 산출: be-engineer. 소비: fe-engineer(막대차트 + 리포트 디스크 막대), integration-qa.
> 목적: 디스크 "현황 막대차트(호스트별)"와 "마운트 상세표"가 **같은 현재값 소스**에서 나오게 해 정합 보장.

---

## 엔드포인트

| 항목 | 값 |
|---|---|
| 메서드/경로 | `GET /hosts/{groupid}/disk/current` |
| 컨트롤러 | `HostController` (`@RequestMapping("/hosts")`, 그룹 단위 EP 모음 — top-hosts/resource-trend와 동일 위치) |
| 인증 | Bearer JWT (`@SecurityRequirement(name="bearer")`) |
| Visitor | `@VisitorIdCheck` (클래스 레벨, x-visitor-id 헤더 필요 — 기존 그룹 EP 공통) |
| 권한 | 별도 `@Roles` 없음 (top-hosts/resource-trend와 동일, 그룹 조회 권한 거부는 Zabbix 토큰 의존) |
| 권한 거부 동작 | 기존 규약 보존: **HTTP 200 + body `code:403`** (401만 실제 상태코드) |
| 요청 파라미터 | path `groupid`(string) 1개. **쿼리/바디 없음** |

### Path
- `groupid` (string, required): Zabbix host group id.

---

## 응답 envelope (ApiResult)

```jsonc
{
  "status": "success",        // "success" | "error"
  "code": 200,
  "message": "OK",            // success(data,msg) 호출 시에만. 현재는 미설정 → 생략될 수 있음
  "data": [ /* DiskCurrentResDto[] */ ],
  "syncTime": "..."           // 전역 인터셉터가 성공 응답에 주입(있을 수 있음)
}
```
> ⚠️ FE는 axios 인터셉터/useDmoveQuery가 envelope를 벗겨 `data`(배열)를 직접 소비한다(메모리 [[fe-usedmovequery-unwrap]]).

## 응답 data: `DiskCurrentResDto[]` (배열, 그룹 호스트 1개 = 원소 1개)

```jsonc
{
  "hostid": "10652",          // string — Zabbix host id
  "hostName": "10.220.0.70",  // string — 호스트 표시이름(name, 없으면 host)
  "usedBytes": 31337928704,   // number(long) | null — 전체 마운트 합산 사용량(Byte 원값)
  "totalBytes": 67410931712,  // number(long) | null — 전체 마운트 합산 용량(Byte 원값)
  "pused": 46.49,             // number(double) | null — 전체 가중 사용률 %(소수2자리). 데이터 없으면 null
  "filesystemCount": 2        // number(int) — 집계에 쓰인 마운트 수(0이면 데이터 없음)
}
```

### 필드 상세

| 필드 | 타입 | null 가능 | 설명 |
|---|---|---|---|
| `hostid` | string | 아니오 | Zabbix host id |
| `hostName` | string | (이론상 null 가능) | 호스트 name, 없으면 host. getRaw output에 name 포함 |
| `usedBytes` | number(long) | **예** | 호스트 전체 마운트 합산 사용량(Byte 원값). 디스크 데이터 없으면 null |
| `totalBytes` | number(long) | **예** | 합산 용량(Byte 원값). 데이터 없으면 null |
| `pused` | number(double) | **예** | `round(usedBytes/totalBytes*100, 2)`. **totalBytes=0 또는 데이터 없으면 null** |
| `filesystemCount` | number(int) | 아니오 | 집계 마운트 수. **0이면 데이터 없는 호스트** |

### 단위 / 계산 규칙
- `usedBytes`/`totalBytes` = **Byte 원값**. FE는 `formatBytes`(IEC 1024) 사용. (트래픽 bps 함정 무관 — 디스크는 byte 정상.)
- `pused` = **용량 가중** 전체 사용률(총사용/총용량*100). 마운트 단순평균 아님. 소수 2자리 반올림.
  - 예: `/`(90/100B), `/tiny`(0/1B) → pused = 90/101*100 = **89.11** (단순평균 45% 아님).
- `totalBytes > 0` 일 때만 pused 산출, 아니면 `null`.

### 빈/없음 처리
- **디스크 데이터 없는 호스트도 배열에 포함**: `usedBytes=null, totalBytes=null, pused=null, filesystemCount=0`.
  → FE는 막대에서 제외하거나 "데이터 없음" 표기.
- **빈 그룹(호스트 0)** → `data: []`.
- 호스트 목록은 **그룹의 호스트 전체**(Zabbix `host.get` groupids 기준).

---

## 정합 보장 (핵심 — 막대 ↔ 상세표 일치)

- 각 호스트 요약은 `GET /host/{id}/disk/detail`(`DiskService.getDetail`)이 쓰는 것과 **동일한 현재값 filesystems**에서 합산된다.
  - 소스 선택: **dependent[`vfs.fs.dependent[<mount>,data]`] 우선**, 없으면 **size 폴백(`vfs.fs.size[<mount>,*]`)**.
  - 공용 코어: `DiskService.buildFilesystems(dependentDataItems, sizeItemsSupplier)` — detail/current가 모두 이 메서드를 거친다.
- 따라서 같은 호스트에 대해:
  - `/disk/current`의 `usedBytes` == `/disk/detail`의 `filesystems[].bytes.used` **합**
  - `totalBytes` == `filesystems[].bytes.total` 합
  - `filesystemCount` == `filesystems.length`
- FE 적용: 호스트 막대 클릭 → detail 마운트 표를 펼쳐도 값이 어긋나지 않는다.

## 성능
- 그룹 호스트 N개여도 Zabbix `item.get`은 **dependent 1회 + size 1회 = 총 2회**(`hostids`에 그룹 호스트 전체 일괄)로 끝낸다. 호스트별 N번 호출 안 함. 메모리에서 hostid 기준 그룹핑 후 호스트별 집계.
- 토큰은 `@CurrentUser`의 authToken(기존 그룹 EP와 동일 경로).

---

## FE 타입 제안 (TypeScript)

```ts
// services/disk.api.ts 또는 types/disk.ts
export interface DiskCurrentItem {
  hostid: string;
  hostName: string;
  usedBytes: number | null;   // Byte 원값 → formatBytes(IEC 1024)
  totalBytes: number | null;
  pused: number | null;       // % (소수 2자리). null이면 '데이터 없음'
  filesystemCount: number;    // 0이면 데이터 없는 호스트
}

export type DiskCurrentResponse = DiskCurrentItem[];

// 호출 (useDmoveQuery가 envelope 언랩 → payload 배열 직접 수신)
// GET /hosts/${groupid}/disk/current
```

막대차트 표시 가이드:
- `pused === null || filesystemCount === 0` 호스트는 막대에서 제외하거나 회색 "데이터 없음".
- 막대 값 = `pused`(%), 툴팁에 `formatBytes(usedBytes)` / `formatBytes(totalBytes)`.

---

## 변경 파일

| 파일 | 변경 |
|---|---|
| `host/disk/dto/DiskCurrentResDto.java` | 신규 응답 DTO |
| `host/disk/DiskService.java` | `getGroupCurrent()` 신규, 공용 코어 `buildFilesystems()` 추출(detail 리팩터, 외부 계약 무변경), `buildFromSizeItems(items)` 시그니처 변경(내부), `groupByHost()`/`summarize()` 추가 |
| `host/HostController.java` | `GET /{groupid}/disk/current` 핸들러 추가(+ DiskService 주입) |
| `test/.../DiskCurrentServiceTest.java` | 신규 테스트 7케이스 |

## 회귀 안전
- `GET /host/{id}/disk/detail` 동작/shape **무변경**(공용 로직 추출만, DiskDetailServiceTest 12케이스 통과).
- `JAVA_HOME=jdk-17 gradlew build` 전체 통과.
