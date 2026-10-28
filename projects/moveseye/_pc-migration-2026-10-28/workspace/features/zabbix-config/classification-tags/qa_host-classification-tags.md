# QA — 호스트 분류(device_type) + 태그 CRUD 경계면 정적 검증

- 검증자: integration-qa, 2026-07-20 (앱 미기동, 정적 코드/타입 대조만)
- 계약: `_workspace/features/zabbix-config/classification-tags/contract_host-classification-tags.md`
- BE: `moveseye-be-spring` `com.dmove.moveseye.host.manage.*` + `common.util.DeviceTypeResolver`
- FE: `moveseyee_fe/src` (types/constants/services/hooks/pages)

## 요약표

| # | 항목 | 결과 | 심각도 |
|---|------|------|--------|
| 1 | 응답 shape (ManagedHostDto.tags/deviceType ↔ TManagedHost) | PASS | — |
| 2 | 요청 shape (HostCreateReqDto.tags/deviceType ↔ THostCreateReq/buildPayload) | PASS | — |
| 3 | bulk EP 경로/req·res 키(hostIds/deviceType, success/failed[].hostid/reason) | PASS | — |
| 4 | 에러 규약(INVALID_DEVICE_TYPE/HOST_IDS_REQUIRED HTTP200+code400 ↔ throw 분기) | PASS | — |
| 5 | 언랩 깊이(payload 직접, data.data 과다 언랩 없음) | PASS | — |
| 6 | enum/상수 정합(6종 문자열, notClassified camelCase) | PASS | — |
| 7 | 계약 갭(목록 deviceType 필터 = FE 클라이언트 사이드) | FAIL(문서만) | MEDIUM(doc) |

HIGH 없음. 런타임 shape 깨짐 0건.

---

## 항목별 상세

### 1. 응답 shape — PASS
- BE `ManagedHostDto`(record) 필드: `hostid,host,name,status,monitoredBy,proxy,agentAvailable,groups,interfaces,templates,tags,deviceType`.
  FE `TManagedHost`(types/host-manage.ts:59) 필드 1:1 일치. 필드명 오타·순서 무관·타입 일치.
- `tags`: BE `List<HostTagDto{tag,value}>` ↔ FE `THostTag[]{tag,value}`. 키명 일치.
- **tags 빈 목록 시 `[]` 보장**: `HostManageService.toManagedHost`(:516) → `asList(h.get("tags"))`가 null이면 `List.of()` 반환 → `.stream().map().toList()` → `[]`. null 미반환 확정. PASS.
- **deviceType 항상 non-null 6종**: `DeviceTypeResolver.resolve`(:34)는 어떤 입력이든 유효 6종 또는 `notClassified` 반환(null 경로 없음). `resolveFromZabbixTags`(:50)도 tags==null→`notClassified`. FE `deviceType: EDeviceType`(non-null 타입 가정) 안전. PASS.
- Lombok is-접두 함정 없음: `agentAvailable`은 `String`(boolean 아님) → JSON 키 변형 없음.

### 2. 요청 shape — PASS
- BE `HostCreateReqDto.tags`(`List<HostTagDto>`)/`deviceType`(String) ↔ FE `THostCreateReq.tags?/deviceType?`. `HostUpdateReqDto`는 상속 + `clearTemplateIds` → FE `THostUpdateReq = THostCreateReq & {clearTemplateIds?}`. 일치.
- **device_type을 tags에서 제외하고 deviceType 필드로만 전송**: `HostFormDrawer.buildPayload`(:251-254) — tags를 `.filter(tag.trim() !== DEVICE_TYPE_TAG_KEY)`로 device_type 제거 후, `deviceType: values.deviceType ?? NOT_CLASSIFIED`(:256) 별도 전송. BE `applyTags`(:337)가 device_type 태그를 서버측에서도 제거 후 재조립 → 이중 방어 일치. PASS.
- **tags 항상 배열 전송 → PUT null(미변경) 경로 미진입**: buildPayload는 `(values.tags ?? [])`로 항상 배열 산출(:251). PUT은 항상 전체 교체(round-trip)로 진입. edit 프리필(:202-204)이 `host.tags`에서 device_type만 빼고 채워 round-trip 소스 성립. PASS.
- deviceType도 항상 전송(:256) → PUT에서 tags 동반 전송이라 device_type 반영 경로 정상(계약 §0 "tags==null이면 deviceType 미반영" 함정 회피). PASS.

### 3. bulk EP — PASS
- 경로: FE `${baseUrl}/device-type` = `hosts/manage/device-type`, method **PATCH**(services/host-manage.api.ts:110-118). BE `@RequestMapping("/hosts/manage")` + `@PatchMapping("/device-type")`(Controller:117). 리터럴 경로라 `/{hostid}` 패턴과 무충돌. 일치.
- req 키: FE `THostDeviceTypeBulkReq{hostIds, deviceType?}` ↔ BE `HostDeviceTypeBulkReqDto{hostIds, deviceType}`(@Getter/@Setter → JSON `hostIds`/`deviceType`). 일치.
- res 키: FE `{success:string[], failed:{hostid,reason}[]}` ↔ BE record `HostDeviceTypeBulkResDto(success, failed)` + `FailedItem(hostid, reason)`. **`hostid` 소문자 양쪽 일치**(fe-engineer 지목 함정 — 통과). 소비처 `HostTab.handleBulkApply`(:231) `res.failed.map(f => f.hostid)` 정상. PASS.

### 4. 에러 규약 — PASS
- ErrorCode 존재 확인: `INVALID_DEVICE_TYPE`(:120), `HOST_IDS_REQUIRED`(:121), `HOST_NOT_FOUND`(:78) — 계약 §4 일치.
- 선검증(전체 실패): `setDeviceTypeBulk`(:258-264) `validateDeviceType` 실패 → `INVALID_DEVICE_TYPE`, `ids.isEmpty()` → `HOST_IDS_REQUIRED`. HTTP200+code400로 나감(403→200 보존 규약 동일 계열).
- FE 분기: `unwrapEnvelope`(host-manage.api.ts:48)는 `status==="error"` 또는 `code !== 200`이면 `HostManageApiError` throw → `useSetDeviceTypeBulk` onError. 검증실패(throw)와 부분실패(`failed[]`, onSuccess)가 코드상 분리 소비됨(HostTab:214 onSuccess는 `res.failed` 요약, :236 onError는 403/일반 토스트). PASS.
- 부분 실패 사유: BE `FailedItem.reason` = `ErrorCode.getCode()` 문자열(:274) 또는 `e.getMessage()`(:290). FE `reason: string`. 타입 일치.

### 5. 언랩 깊이 — PASS
- axios 인터셉터(axiosInstance.ts:85) `return response.data ?? response` → **1겹**(HTTP→envelope `{status,code,data}`).
- 조회: `useDmoveQuery`(useDmoveQuery.ts:26) `envelope?.data` 반환 → **2겹째** → 소비자 payload 직접. `getHostList`는 `unwrapEnvelope` 미사용이 정상(useDmoveQuery가 벗김). `data.data` 과다 언랩 없음.
- 변경성: service `.then(unwrapEnvelope)`가 `envelope.data` 반환(:56) → useMutation 소비자 payload 직접. `setDeviceTypeBulk`(:111) → `{success,failed}` 직접 수신, HostTab `res.success/res.failed` 접근(과다 언랩 없음). PASS.

### 6. enum/상수 정합 — PASS
- BE `DeviceTypeResolver.DEVICE_TYPES` = `server, network, security, database, hardware, notClassified`(:18-19).
- FE `EDeviceType`(enums/host-monitoring.ts:135) 값 = `server/network/notClassified/security/database/hardware`(순서만 상이, 집합 동일).
- FE `HOST_DEVICE_TYPE_OPTIONS` = `ASSET_DEVICE_TYPE_OPTIONS`(constants/asset.ts:71) value = `server,network,security,database,hardware,notClassified`.
- **문자열 정확 일치**(camelCase `notClassified` 포함). BE resolve는 tag 값을 lowercase 후 매칭하나 반환은 항상 6종 정본 문자열이라 FE와 어긋나지 않음. PASS.

### 7. 계약 갭 — FAIL(문서만, MEDIUM-doc)
- **fe-engineer 보고 사실 확인**: 목록 `deviceType` 필터는 FE 클라이언트 사이드가 맞다.
  - BE `ManagedHostListReqDto`에 `deviceType`/`device_type` 파라미터 **없음**(keyword/groupids/status/limit/offset만). `HostManageService.list`(:82-90)도 device_type 필터 미적용.
  - FE `HostTab`(:117-141) 코드 주석으로 "BE 목록 EP는 device_type 서버 필터 미지원 → 현재 로드된 페이지 항목을 클라이언트 필터링"을 명시하고 `visibleItems`로 클라 필터.
- **계약서 반영 상태**: `features/zabbix-config/classification-tags/contract_host-classification-tags.md`는 응답에 `deviceType` 추가만 기술하고, **목록 필터가 BE 미지원(클라 사이드)이라는 사실을 명시하지 않음**. 신규 EP는 bulk(PATCH)만 다룸.
- 판정: 런타임 shape 버그 아님(코드는 정합). 다만 계약서에 갭이 있어 후속 오해 소지. → **계약서에 "목록 deviceType 필터는 BE 미지원, FE 클라이언트 필터(현재 페이지 한정)" 1줄 명시 권고**.
- 파생 알림(참고, 본 정적 QA 범위 밖 — functional-qa 이관): 서버 페이지네이션 + 클라 필터 조합이라 분류 필터 시 "현재 페이지 내"만 걸러져 실제 전수보다 적게 보일 수 있음(FE 주석에 이미 인지됨). 시각/행위 검증은 functional-qa.

---

## HIGH 이슈 / 책임 주체
- **없음.** 즉시 수정 대상 shape 버그 0건. BE/FE 모두 계약과 정합.

## 계약 갭 처리 권고
- 책임: be-engineer(계약서 산출자). `features/zabbix-config/classification-tags/contract_host-classification-tags.md` §5에 목록 deviceType 필터의 클라이언트 사이드 처리 사실을 1줄 추가 권고. 코드 변경 불요(문서만).
