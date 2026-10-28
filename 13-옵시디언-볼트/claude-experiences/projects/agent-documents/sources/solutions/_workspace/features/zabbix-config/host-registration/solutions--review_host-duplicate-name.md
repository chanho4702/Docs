# 검수 요청 — ZM-166 호스트 등록 중복 이름 안내 + 목록 검색을 기술명·표시명 양쪽으로

- 요청: Claude · 2026-09-22 · 사용자 "호스트 등록할 때 장애가 발생했는데 실제로는 10.220.0.82 이게 없지만 저런 API 오류가 떴고 저런 오류는 프론트에 서빙 되어야 하는데 안 됐음"
- 검수 대상: **ZM-166**. BE `moveseye-be-spring` master 커밋 **`631d420`**(3파일) · FE `moveseyee_fe` master 커밋 **`2ac4cd5`**(7파일). 미푸시.
- 🔴 양쪽 master 작업 트리에 **다른 세션의 APM 미커밋 변경**(BE `premium/apm/**` 6파일, FE `application-monitoring/**`·`apmInFlight.ts` 등)이 섞여 있다. 이 작업의 파일만 선별 커밋했다.

## 원인 (실측)
1. **호스트는 실제로 있었다.** dmove.co.kr Zabbix `host.get filter host=10.220.0.82` → hostid 10696, 표시명 `zabbix-server`, 그룹 Linux servers·Discovered hosts. 네트워크 디스커버리가 IP를 기술명으로 만들고 표시명만 바뀐 상태. Zabbix `host.create` 중복 판정은 **기술명(host)** 기준.
2. **목록 검색이 표시명만 봤다.** `HostManageService.list`의 `search: {name: keyword}` → "10.220.0.82"로 검색하면 "zabbix-server"가 안 잡혀 화면에서는 "없는 호스트"로 보였다.
3. **오류는 BE가 정상 전달했고 FE가 덮었다.** BE는 HTTP 200 + `code:400` + Zabbix 원문(`ZabbixClient.java:198`). FE `HostFormDrawer.handleError`는 403·`HOST_INVALID_NAME`만 구분하고 나머지는 "요청 처리에 실패했습니다"로 일괄 치환 → 사용자가 원인을 못 보고 5회 반복.

## 변경
| 층 | 파일 | 내용 |
|---|---|---|
| BE | `engine-api/.../ErrorCode.java` | `HOST_DUPLICATE_NAME` 추가 |
| BE | `host/manage/HostManageService.java` | ① `create`/`update` 직전 `ensureUniqueNames` — `host.get filter host`(+표시명이 있으면 `filter name`) 선검사, 수정 시 자기 hostid 제외. 걸리면 `ApiError(HOST_DUPLICATE_NAME, data=DuplicateHostDto{field, hostid, host, name})`. ② 선검사 뒤 Zabbix가 그래도 "already exists"로 거부하면(경합·템플릿 이름 충돌) `mapDuplicateError`로 같은 코드로 매핑(field는 "visible name" 포함 여부로 판별, 나머지 null). 그 외 Zabbix 에러는 원문 그대로 전파. ③ `list` keyword를 `search {host, name}` + `searchByAny=true`로. 🔴 `searchByAny`는 `filter`까지 OR로 묶으므로 keyword가 있을 때 `status`는 서버 filter에서 빼고 Java에서 거른다(`groupids`/`templateids`는 search/filter가 아니라 영향 없음) |
| BE | `HostManageServiceTest.java` | 기존 `getRaw` 스텁을 `byHostids()`(hostids 있는 호출만)로 좁히고 setUp에 중복 선검사 기본 "없음" lenient 스텁. 신규 7건: 기술명 중복·표시명 중복·경합 매핑·타 에러 통과·수정 시 자기 자신 제외·타 호스트 이름으로 변경 거부·list 검색 파라미터. **29/29 통과**(격리 워크트리) |
| FE | `constants/host-manage.ts` · `types/host-manage.ts` | `HOST_ERROR_CODE.DUPLICATE_NAME` · `THostDuplicateInfo` |
| FE | `services/host-manage.api.ts` | `HostManageApiError`에 `data` 보존 + `detail` getter(ErrorCode 상수만 온 메시지는 제외, 원인 문장만 통과) |
| FE | `HostFormDrawer.tsx` | `HOST_DUPLICATE_NAME` → 해당 입력란(host/name) 필드 에러 "같은 호스트 이름이 이미 등록되어 있습니다: 10.220.0.82 (zabbix-server)…" + `scrollToField`. 그 외 업무 오류는 `action_failed (BE 원인 문장)` 형태로 토스트 |
| FE | `kr.json`·`en.json` | `validation_host_duplicate[_with]`·`validation_name_duplicate[_with]` 4키, 검색 placeholder "호스트 이름 또는 표시 이름으로 검색" |
| FE | `__tests__/HostFormDrawer.test.tsx` | 중복 필드 에러·상세 메시지 토스트 2건 추가. **8/8 통과**, HostTab 포함 23/23 |

## 실측 (워크트리 BE :3002, dev 프로필, admin 로그인)
| 호출 | 결과 |
|---|---|
| `GET /hosts/manage?keyword=10.220.0.82` | 10759(`10.220.0.82_test`)·**10696(`10.220.0.82` / zabbix-server)** 2건 |
| 같은 keyword + `status=0` / `status=1` | 2건 / 0건 (Java 후처리 동작) |
| `keyword=zabbix-server`(표시명) | 10696 1건 |
| `POST /hosts/manage host=10.220.0.82` | `errorCode=HOST_DUPLICATE_NAME`, data `{field:"host", hostid:"10696", host:"10.220.0.82", name:"zabbix-server"}` |
| `POST host=hostdup-probe-zz name=zabbix-server` | `HOST_DUPLICATE_NAME`, `field:"name"` |

브라우저 화면(필드 에러 표시)은 jest로만 확인, 실브라우저 미확인.

## 검수 포인트
- `searchByAny` 때문에 status 필터를 Java로 옮긴 판단 — 대안(두 번 호출해 합치기)보다 단순하다고 봤다.
- 선검사 2회(host·name)가 등록마다 `host.get` 1~2회 추가. count 모드가 아닌 output 3열이라 비용 미미.
- `mapDuplicateError`의 문자열 매칭("already exists")은 Zabbix 영어 메시지에 의존 — 선검사가 1차 방어라 폴백 용도.
- 기타 Zabbix 원문을 토스트에 붙이는 방향이 "원문 노출 방지" 주석의 원래 의도와 상충하는지 — 사용자 요청("오류가 프론트에 서빙 되어야")에 따라 붙이는 쪽으로 결정.
