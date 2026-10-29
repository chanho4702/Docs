---
name: disk-detail-item-family-fallback
description: "디스크 차트(vfs.fs.size[,pused])와 디스크 상세(vfs.fs.dependent[,data])가 다른 Zabbix 아이템 계열이라 호스트 커버리지 불일치 → DiskService.getDetail에 size 폴백 추가"
metadata: 
  node_type: memory
  type: project
  originSessionId: 4b350b4a-53b9-408a-80f2-f7decf82ec02
---

호스트 그룹 "리소스 추이" 탭의 **디스크 차트**와 **디스크 상세 표**는 서로 다른 Zabbix 아이템 계열을 쓴다:
- 디스크 차트(시계열): `vfs.fs.size[<mount>,pused]` 등 숫자형 + trend.
- 디스크 상세(현황): `vfs.fs.dependent[<mount>,data]` **text 마스터(value_type 4)**의 lastvalue JSON 파싱 (`DiskService.getDetail()`).

dev(dmove.co.kr) group 2(40대)에서 두 계열이 **다른 호스트군에 붙어** 있어 겹치는 호스트가 0대였다: 차트O/상세X = 4대(10.220.0.52/.70/.92/.93, dependent 아이템 0개), 상세O/차트X = 2대(test_1 10695, zabbix-server 10696). → 차트엔 나오는데 상세 표는 빈 정합성 버그.

**dependent로 차트 통일은 불가**: `[,data]`는 text라 trend가 없어 시계열 차트를 못 그린다(dependent 계열 숫자 아이템은 `[,readonly]` 플래그뿐). 통일하면 차트가 4대→0대로 사라짐.

⚠️ **정정(2026-06-25) — `vfs.fs.dependent.size[<mount>,pused]` 계열은 실재한다**: 위 "dependent 숫자 아이템은 readonly 플래그뿐"은 **검색 누락에서 온 오판**. 이전 진단들이 `search.key_='vfs.fs.dependent['`(대괄호 포함)로만 조회했는데, Zabbix search는 substring 매칭이라 **`vfs.fs.dependent.size[`는 `vfs.fs.dependent[`를 부분문자열로 포함하지 않아 통째로 누락**됐다. `search.key_='vfs.fs.dependent'`(대괄호 없이)로 다시 조회하면 group2에 `vfs.fs.dependent.size[<mount>,pused]`(float %, **trend 보유**)·`.size[,used/total]`(uint B)·`.inode[]`(%)가 나온다. 즉 dependent 계열에도 **사용률·사용량 숫자 시계열 아이템이 있다**(차트/게이지 가능). 단 호스트 분포는 여전히 상호 배타적: size pused trend=4대(10635/38/47/52) ↔ dependent.size pused trend=2대(10695/zabbix-server 10696). 실값 예: zabbix-server `/`=58.95%, `/app`=0.96%. 진단 산출물 `_workspace/diag_disk-dependent-size.cjs`+`.result.json`.

**FE 템플릿 반영(2026-06-25)**: `moveseyee_fe/src/constants/dashboard-templates.ts`의 server-basic 게이지(`widget_disk_util`)·파이(`widget_disk_usage`) 위젯 `itemKeyPrefixes`에 `vfs.fs.dependent.size` 계열을 OR로 추가. 두 prefix는 겹치지 않고(`vfs.fs.size[`≠`vfs.fs.dependent.size[`) 호스트도 배타적이라 중복 매칭 없음. 게이지 커버리지 trend 기준 4대→6대(dependent-only 호스트도 표출). 런타임 검증: zabbix-server(10696) 게이지 58.96% 정상, 무회귀 10652 48.6% 유지.

**BE 사용률 처리도 dependent 보강(2026-06-25)**: Spring BE는 디스크 **상세/현황**(`DiskService`)만 dependent[,data] 1순위였고 **사용률 추이·리포트·그룹상세 표는 `vfs.fs.size`만** 봐 dependent-only 호스트를 누락하던 비대칭이 있었다(추이·리포트 trend 2대 누락, 그룹상세 HostUsage diskUsage는 dependent-only 7대 전부 0.0% 오표시). 수정: `MetricUtils.isDiskPusedKey` 정규식 `^vfs\.fs\.(dependent\.)?size\[[^\]]*,pused\]$`로 확장(A·B 필터), `HostService.resourceMetricItemKeys(disk)`·`ReportService` search 키목록에 신설상수 `ZabbixItemKey.VFS_FS_DEPENDENT_SIZE` OR 추가(⚠️ search는 substring이라 정규식만 고치면 후보 조회 단계에서 못 잡음 — 키목록도 필수), `HostService.getHostItems`는 `vfs.fs.size[/,pused]` 우선·`vfs.fs.dependent.size[/,pused]` 폴백(상수 `VFS_FS_DEPENDENT_SIZE_FS_PUSED`). 응답 shape 무변경, size 호스트 무회귀. 전후 재검증: 10696 추이 포함·diskUsage 0→58.96%, 10652 불변. C 폴백은 루트(/) 단일(HostUsage 계약상 루트 % 단일 필드). 산출물 `_workspace/be_disk-dependent-coverage.md`.

**해결(2026-06-24)**: 화면 목적이 "현재 현황"이므로 `DiskService.getDetail()`에 폴백 추가 — dependent 결과가 비면 `vfs.fs.size[<mount>,used/total/pused]` 현재값으로 filesystems 합성(`free=total-used`, `pfree=100-pused` 보정). inode/fstype은 size 계열에 없어 null(FE "-"). 응답 shape 무변경. dependent는 1순위 유지(회귀 없음).

**Why:** 디스크 상세/차트 정합 작업 시 "왜 차트엔 있는데 표는 비나"를 다시 진단하지 않기 위함. 두 계열의 비대칭은 코드 버그가 아니라 Zabbix 템플릿 구조에서 옴.

**How to apply:** 디스크 관련 화면을 만질 때 size 계열(차트)과 dependent 계열(상세)의 커버리지가 다를 수 있음을 전제. 디스크 용량은 byte 원값+formatBytes(IEC 1024)가 맞다([[fe-traffic-bps-not-bytes]]의 bps 함정과 무관). 진단 산출물 `_workspace/diag_disk-detail-mismatch.md`, 계약 `_workspace/features/infra/host-checks/contract_disk-detail.md` §9.

**확장(2026-06-24) — 추이/현황 분리 + 정합 보장**: 디스크 차트(시계열, size trend)와 디스크 "현황"을 명확히 분리. 현황은 막대차트+상세표를 **동일 현재값 소스**에서 산출해 정합 보장.
- 신규 BE `GET /hosts/{groupid}/disk/current`(Spring) — 그룹 호스트별 현재 디스크 요약(usedBytes/totalBytes/pused(용량가중)/filesystemCount). `DiskService.getGroupCurrent()`. `getDetail()`과 **공용 코어 `buildFilesystems()`**를 공유 → current의 합 == detail 마운트 합(정합 구조적 보장). item.get은 그룹당 dependent 1 + size 1 = 2회(N번 호출 안 함). 계약 `_workspace/features/infra/host-checks/contract_disk-current.md`.
- FE 공용 컴포넌트 `HostGroupDiskCurrentChart`(호스트별 pused 막대, null/fsCount0 제외, 내림차순) — 리소스추이 탭(기간추이 시계열 + 현황 막대+상세표)·리포트 탭(평균/최대/최소 표 유지 + 현황 막대) 양쪽 재사용.
- 별도 "디스크 상세" 탭은 제거됨(리소스추이로 통합). 자동선택은 추이 시리즈 hostNames→hostid 매핑으로 데이터 보유 호스트 우선.
- 검증: group2 40대 current↔detail 합산 불일치 0건(런타임).

⚠️ **런타임 주의**: `GET /host/{id}/disk/detail`은 **Spring 전용**(Nest 미보유). FE가 아직 :3000 Nest에 연결돼 있으면([[be-dual-maintenance]]) 이 엔드포인트·폴백이 동작하려면 :3000을 Spring이 서빙해야 한다.


## 인덱스 상세 이관 (2026-09-02)

인덱스 압축으로 옮겨온 요약 — 본문과 중복될 수 있으며 본문이 우선.

디스크 상세 아이템 계열 폴백 — 디스크 차트(vfs.fs.size)와 상세(vfs.fs.dependent[,data] text마스터)가 다른 아이템 계열·호스트 겹침 0 → 차트엔 있는데 상세 빈 버그. DiskService.getDetail에 size 폴백(2026-06-24). 리소스추이 탭 디스크 차트 하단에 상세 표 추가. /disk/detail은 Spring 전용. 2026-06-25 vfs.fs.dependent.size[,pused] 계열 실재 확인(이전 검색 누락) → FE 게이지/파이·BE 추이/리포트/그룹표에 dependent 보강
