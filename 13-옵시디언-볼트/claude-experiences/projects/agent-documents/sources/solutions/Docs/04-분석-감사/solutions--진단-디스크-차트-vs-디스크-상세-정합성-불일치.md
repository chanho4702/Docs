# 진단 — 디스크 차트 vs 디스크 상세 정합성 불일치

생성일 2026-06-24 / integration-qa / **코드 수정 없음, 원인 규명 전용**

## 증상
호스트 그룹 상세 "리소스 추이" 탭, metric=Disk 차트에는 `10.220.0.70`(group 2)이 나오는데,
같은 탭 하단 "디스크 상세" 표에서 그 호스트를 드롭다운으로 고르면 `filesystems: []`(빈 표).

## 결론 (한 줄)
**차트와 상세가 서로 다른 Zabbix item 계열을 쓰고, 두 계열은 호스트군이 상호 배타적이다.**
`10.220.0.70`은 차트 소스인 `vfs.fs.size[<mount>,pused]`(trend 보유)는 있지만,
상세 소스인 `vfs.fs.dependent[<mount>,data]` master item이 **아예 0개**라 표가 빈다.
→ `reasonCode = NO_DEPENDENT_DATA_ITEM` (lastvalue 빈값이 아니라 item 자체 부재).

## 1) 대상 호스트
- `10.220.0.70` → **hostid = 10652** (group 2, Linux servers). 출처: `e2e_rtdisk_api_probe.json` top-hosts.

## 2) hostid 10652 두 item 부류 실측 (dmove.co.kr item.get, 2026-06-24)

### A. 차트 소스 `vfs.fs.size[...]` — 존재함, 정상 수집, trend 보유
| key_ | value_type | lastvalue | lastclock age | trend 30d |
|------|-----------|-----------|--------------|-----------|
| `vfs.fs.size[/,pused]` | 0(float) | 48.5 | 0.0h | **있음** |
| `vfs.fs.size[/boot,pused]` | 0(float) | 72.8 | 0.0h | **있음** |
| `vfs.fs.size[/,total]` | 3 | 66930339840 | 0.0h | 없음 |
| `vfs.fs.size[/,used]` | 3 | 31004798976 | 0.0h | 없음 |
| `vfs.fs.size[/boot,total]` | 3 | 480591872 | 0.0h | 없음 |
| `vfs.fs.size[/boot,used]` | 3 | 327634944 | 0.0h | 없음 |

→ `,pused` 2개가 trend 보유 → **차트 정상 표출**(증상과 일치).

### B. 상세 소스 `vfs.fs.dependent[...]` — **검색 결과 빈 배열 []**
- `item.get search.key_="vfs.fs.dependent["` 결과: **0건**.
- `,data]`로 끝나는 master item: **0개**.
- 즉 lastvalue가 빈 문자열인 것도 아니고, item 자체가 호스트에 **없다**.

→ `DiskService.getDetail()`은 dependent data item을 못 찾아 `filesystems: []` 반환(계약 §5 graceful 빈처리).

## 3) 확정된 원인 분류
세 후보 중:
- (X) "dependent[,data] 있는데 lastvalue 빈 문자열"
- (O) **"dependent[,data] item 자체가 없음"** ← 이것
- (X) "size는 trend 있는데 dependent는 신규 미수집"

`10.220.0.70`(10652)은 디스크 모니터링 템플릿이 **size[mount,pused/used/total] 방식**만 붙어 있고,
JSON 마스터 아이템(`vfs.fs.dependent[mount,data]`)을 만드는 신형 템플릿이 **미적용**.
상세 표는 후자만 파싱하므로 빈다.

## 4) group 2 확산 집계 (40 hosts)

호스트별 교차표 (관심 호스트만):

| hostid | name | size pused+trend (차트) | dependent data nonEmpty (상세) | 차트 | 상세 |
|--------|------|------|------|------|------|
| 10635 | 10.220.0.52 | 2 | 0 | O | X |
| 10638 | 10.220.0.92 | 2 | 0 | O | X |
| 10647 | 10.220.0.93 | 2 | 0 | O | X |
| 10652 | **10.220.0.70** | 2 | 0 | **O** | **X** |
| 10639 | 10.220.0.210 | 0 | 0 (item 2개 있으나 빈값) | X | X |
| 10676 | gab-ubu-ans_2 | 0 | 0 (item 2개 빈값) | X | X |
| 10703 | 10.220.0.10 | 0 | 0 (item 3개 빈값) | X | X |
| 10714 | MIKE | 0 | 0 (item 2개 빈값) | X | X |
| 10737 | 10.220.0.61 | 0 | 0 (item 3개 빈값) | X | X |
| 10695 | 10.220.0.92_test_1 | 0 | 2 | X | O |
| 10696 | zabbix-server | 0 | 4 | X | O |

### 교차 합계
- **both (차트 O + 상세 O): 0대** ← 핵심. 두 소스가 동시에 성립하는 호스트가 group 2에 한 대도 없음.
- **chartOnly (차트 O, 상세 X): 4대** → 10.220.0.52 / .92 / .93 / **.70** = 증상 호스트 전부.
- **detailOnly (상세 O, 차트 X): 2대** → 10695 / 10696. (반대 방향 불일치: 표엔 있는데 차트엔 없음)
- dependent item은 있으나 lastvalue 빈값(상세 빈): 5대(10639/10676/10703/10714/10737).

→ "차트엔 나오지만 상세는 빈" 호스트 = **group 2에서 4대** (10.220.0.70 포함).
이건 단일 호스트 이상치가 아니라 **데이터 소스 분리에서 오는 구조적 불일치**.

## 5) 레이어 제언 (수정은 하지 않음)
근본 원인은 **데이터(Zabbix 템플릿) 비대칭**: pused 차트용 item군과 dependent-data 상세용 item군이
다른 호스트 집합에 붙어 있음. 코드는 각자 자기 소스에서 graceful하게 동작 중(버그 아님).

정합을 맞추려는 경우 선택지:
1. **Zabbix 레이어(권장 정합)**: 차트에 나오는 호스트(size pused 보유)에도 dependent-data 마스터
   아이템을 붙이는 템플릿 통일. → 데이터 정합이 근본 해결.
2. **BE 레이어(폴백 합성)**: `DiskService.getDetail()`에서 dependent[,data]가 없으면
   `vfs.fs.size[<mount>,used/total/pused]` 개별 item lastvalue로 filesystems를 합성.
   - 단 inode/fstype/fslabel은 size 계열에 없어 부분 정보(bytes만)만 채워짐.
3. **FE/UX 레이어**: 차트엔 있지만 상세 데이터 없는 호스트는 표에 "이 호스트는 상세 디스크 수집
   미구성" 안내를 노출해 빈 표를 오인하지 않게. (정합 아님, 혼란 방지)

선택은 제품 결정. 단 **현재 코드는 계약대로 동작**하며 추가 코드 버그는 발견되지 않음.

## 추가: dependent 통일 가능성 (feasibility + coverage cost)

질문: "디스크 차트·상세를 `vfs.fs.dependent[,data]` 계열로 통일"이 기술적으로 가능한가? 코스트는?
2026-06-24 item.get/trend.get 실측.

### 확인 1 — dependent 계열로 시계열 차트를 그릴 수 있나? → **불가**
dependent 보유 호스트 2대의 `vfs.fs.dependent[` 전체 item value_type 분류:

| hostid | name | dependent item 총수 | text(vt4) | uint(vt3) | 숫자 item 키 | data master 키 |
|--------|------|------|------|------|------|------|
| 10695 | 10.220.0.92_test_1 | 4 | 2 | 2 | `[/,readonly]`, `[/boot,readonly]` | `[/,data]`, `[/boot,data]` (text) |
| 10696 | zabbix-server | 8 | 4 | 4 | `[mount,readonly]` ×4 | `[mount,data]` ×4 (text) |

- **마스터 `[mount,data]`는 전부 value_type 4 (text)** → trend 없음 → 차트 불가(텍스트 JSON 덩어리).
- dependent 계열의 **유일한 숫자(uint) item은 `[mount,readonly]`** — 0/1 플래그(읽기전용 여부)이며 lastvalue=0.
  trend는 보유하나 이건 **디스크 사용량이 아니라 readonly 플래그**라 디스크 차트 소스로 무의미.
- **`vfs.fs.dependent.size[<mount>,pused]` / `[,used]` 같은 숫자 dependent 사용량 item은 존재하지 않음.**
  → dependent 계열로는 사용량 시계열 차트를 그릴 수 있는 숫자 item이 없다.

> 결론(확인1): dependent 계열은 **text 마스터 + readonly uint**뿐. 디스크 사용량을 담은
> 숫자형 trend item이 없으므로 **dependent로 차트 통일은 불가**. 사용량은 오직 `[,data]` JSON text
> 안에만 있고 그건 trend.get 대상이 아님(차트 못 그림).

### 확인 2 — dependent로 통일 시 group2 차트 커버리지 변화
| 항목 | 호스트 수 |
|------|------|
| 현재 차트 (`vfs.fs.size[<mount>,pused]` trend) | **4대** (10.220.0.52/.92/.93/.70) |
| dependent 숫자 item 존재(readonly 포함, trend 무관) | 7대 |
| dependent 숫자 item + trend (readonly 기준, 사용량 아님) | 2대 (10695, 10696) |
| **사용량 차트 가능한 dependent 숫자 item** | **0대** (해당 item 부재) |

가정상 "dependent readonly trend라도 차트 게이트로 친다" 해도:
- **통일 시 사라지는 호스트: 4대** — 10.220.0.52 / 10.220.0.92 / 10.220.0.93 / **10.220.0.70**(증상 호스트 전부).
  dependent 계열 item이 0개라 차트에서 탈락.
- **통일 시 새로 들어오는 호스트: 2대** — 10695(test_1), 10696(zabbix-server). 단 readonly 플래그 기반이라 무의미한 차트.

→ dependent로 통일하면 group2 사용량 차트 커버리지는 **4대 → 0대(사용량 기준)** /
   **4대 → 2대(readonly 플래그라도 그릴 경우, 무의미)**. .52/.70/.92/.93이 전부 사라지는 명백한 손해.

### 최종 한 줄
**dependent로 차트 통일 = 불가.** 사용량 데이터는 `[mount,data]` text 마스터 안에만 있고(vt4, trend 없음),
숫자형은 `[mount,readonly]` 플래그뿐이라 시계열 차트를 그릴 수 없다. 무리 전환 시 group2 차트 커버리지가
**현재 4대 → 0대(사용량 기준)**로 떨어지고 .52/.70/.92/.93이 모두 사라진다.
→ 통일은 **반대 방향(상세를 size 계열로 합성, 본문 §5 선택지 2)**으로 가야 하며, dependent 통일은 기술적으로 막힘.

## 산출물/스크립트
- `diag_disk-detail-mismatch.cjs` + `.result.json` — 대상 host 두 item 비교 + group2 확산.
- `diag_disk-detail-mismatch2.cjs` — host별 차트/상세 교차표(both=0 확정).
- `diag_disk-dependent-feasibility.cjs` + `.result.json` — dependent 차트 feasibility + 통일 커버리지 코스트.
