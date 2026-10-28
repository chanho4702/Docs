# BE 풀스캔 감사 확정 4건 수정 (Spring 정본) — 계약 노트

- 일자: 2026-07-01
- 대상: `moveseye-be-spring` (BE 정본, :3000 서빙 중). Nest·FE 미변경.
- 기준: **API 계약 1:1 보존** (계약 기준 = Nest 원본 `moveseye-be`). #4만 의도적 예외(기능 결함 수정).
- 근거: `_workspace/features/infra/fullscan-and-metric-refactor/scan_host-core.md`, `_workspace/features/infra/fullscan-and-metric-refactor/scan_runtime-verify.md`.
- 검증: `gradlew build -x test` (BUILD SUCCESSFUL) + `gradlew test` (전체 그린, 신규 8케이스 포함).

---

## #1 [Critical] response-time/summary 배열 래핑 복원

- 파일: `src/main/java/com/dmove/moveseye/host/responsetime/ResponseTimeController.java` (getSummary)
- 전(shape): `data` = **단일 객체** `{responseTime:{max,avg}, packageLoss:{max,avg}}`
  - `ApiResult<ResponseTimeSummaryResDto>` + `.success(result)`
- 후(shape): `data` = **배열 1원소** `[{responseTime:{max,avg}, packageLoss:{max,avg}}]`
  - `ApiResult<List<ResponseTimeSummaryResDto>>` + `.success(List.of(result))`
- Nest 근거: `response-time.controller.ts:46` `.success([result])` — 컨트롤러에서 배열 래핑.
- FE 영향 해소: `ResponseTLDetail.tsx`가 `tlData.map()`으로 소비 → 객체 반환 시 `tlData.map is not a function` 라이브 크래시(현재 실장애)였음.
- ⚠️ **line-charts(getLineCharts)는 이미 정합이라 미변경.**
- 테스트: `ResponseTimeControllerTest` — data 가 List size 1 인지 assert.

## #2 [High] session/history {data,type} 시리즈 래핑 복원

- 파일: `SessionController.java` (getNetworkSessionHistories) + 신규 DTO `host/network/dto/SessionHistorySeriesDto.java`
- 전(shape): `data` = **평면 포인트 배열** `[{timestamp, value}, ...]`
  - `ApiResult<List<HistoryPointDto>>` 평면 반환
- 후(shape): `data` = **시리즈 엔벨로프 1원소** `[{ data:[{timestamp,value},...], type:"" }]`
  - `ApiResult<List<SessionHistorySeriesDto>>`, `List.of(new SessionHistorySeriesDto(result, ""))`
  - `SessionHistorySeriesDto = record(List<HistoryPointDto> data, String type)` — Nest `HistoryResponseDto{data,type}` 필드명/순서 1:1.
- Nest 근거: `session.controller.ts:77-78` `const responseData = [{ data: result, type: '' }]; .success(responseData)`.
- FE 영향 해소: `hooks/chart/useSessionsChart.ts`가 각 원소의 `item.data`/`item.type` 참조 → 평면 반환 시 `item.data` undefined 로 차트 공란.
- 테스트: `SessionControllerTest` — data 가 `[{data:[...], type:""}]` 시리즈 1원소인지 assert.

## #3 [Medium] 디스크 line-charts dependent.size 폴백 추가

- 파일: `DiskService.java` (getLineChart + 신규 헬퍼 `toDependentKey`), `common/constants/ZabbixItemKey.java` (프리픽스 상수 추가)
- 전: 사용률/inode 추이를 `vfs.fs.size[{partition},pused]` / `vfs.fs.inode[{partition},pfree]` **정확일치**로만 조회 → dependent-only 호스트(예 10695/10696, detail엔 pused 값 있음)에서 line-charts **0포인트**.
- 후: 정확키 결과가 비면 **동일 mount/sub 의 dependent 계열**로 재조회 후 사용.
  - `vfs.fs.size[...]` → `vfs.fs.dependent.size[...]`, `vfs.fs.inode[...]` → `vfs.fs.dependent.inode[...]`
  - FE 게이지/파이가 매칭하는 `vfs.fs.dependent.size[/,pused]` 계열과 일치.
- 계약: 응답 shape 불변(`{type,data,yAxisIndex}`) — dependent-only 호스트의 빈 데이터만 채워짐. 계약 회귀 없음.
- 재사용: `getDetail`/`getGroupCurrent`가 쓰는 dependent 접근 사상을 line-charts 경로에 일반화(중복 구현 아님). 값 변환은 기존 FLOAT/UNSIGNED 분기 그대로(pused=% 무변환, total/used=bytesToMB).
- 테스트: `DiskLineChartFallbackTest` — 폴백 조회 발동 + 두 계열 모두 부재 시 빈 데이터.

## #4 [Medium] 인터페이스 total 산출 정정 — ⚠️ 1:1 보존 예외 (기능 결함 수정)

- 파일: `InterfaceService.java` (getInterfaceStatusSummary + 신규 헬퍼 `countDiscoveredInterfaces`, ObjectMapper 주입)
- ⚠️ **Nest 원본도 동일 버그**(`interface.service.ts:50,57`). 이 건은 계약 1:1 보존이 아니라 **의도적으로 다르게** 고침.
- 결함:
  - (a) `total`을 `net.if.discovery.lastvalue`(LLD JSON 배열)로 계산 → `Number()`/`parseLong`이 NaN/0 → 정상 `ifNumber` 무시.
  - (b) 폴백 `total=up+down+adminDown`에서 admin-down(IFADMINSTATUS=2) 인터페이스가 oper-down(IFOPERSTATUS=2)과 **이중 계수** → 과대.
- 수정:
  - (a) discovery LLD 를 **JSON 배열 길이**로 카운트(레거시 `{"data":[...]}` 도 지원), 파싱 불가 시 **ifNumber 우선** 사용.
  - (b) 최종 폴백 total 을 `up + down`(oper 상태=인터페이스당 1개)으로 변경 → adminDown 이중 계수 제거. `up/down/adminDown` 필드 자체는 불변(보고용).
- 계약(shape): `{total, up, down, adminDown}` 필드 불변. `total` **값**만 정확해짐(과대 → 정정).
- 테스트: `InterfaceServiceTest` — (a) discovery 배열 길이 사용, ifNumber 폴백 / (b) adminDown 이중계수 배제(과거 3 → 2) / empty.

---

## 변경 파일 목록

수정:
- `host/responsetime/ResponseTimeController.java`
- `host/network/SessionController.java`
- `host/disk/DiskService.java`
- `host/hostinterface/InterfaceService.java`
- `common/constants/ZabbixItemKey.java`

신규:
- `host/network/dto/SessionHistorySeriesDto.java`
- `test/.../host/responsetime/ResponseTimeControllerTest.java`
- `test/.../host/network/SessionControllerTest.java`
- `test/.../host/hostinterface/InterfaceServiceTest.java`
- `test/.../host/disk/DiskLineChartFallbackTest.java`

## 검증 결과
- `gradlew build -x test`: BUILD SUCCESSFUL
- `gradlew test`: 전체 그린 (신규 8케이스: ResponseTime 1 + Session 1 + Interface 4 + DiskLineChart 2, 기존 회귀 없음)
