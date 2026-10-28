# QA — 완전 컨테이너 드릴다운(A안) BE↔FE 경계면 정적 검증

- 검증자: integration-qa, 2026-07-21 · 정적 대조만(런타임 기동 없음 — functional-qa 담당)
- 대상: 설계 `design_drilldown-restructure.md`(§1~§8, 확정 A~F) + 계약 `features/zabbix-config/host-registration/contract_host-registration.md` §1-1
- 결과: **PASS 6 / 불일치(HIGH·MEDIUM) 0 / LOW·INFO 3**
- 방법: BE 컨트롤러·DTO(record/@Schema) ↔ FE api·hook·types·컴포넌트 필드 1:1 교차 대조

---

## 1. 호스트 단건 EP 소비 — PASS

| 항목 | 기대(BE) | 실제(FE) | 판정 |
|------|----------|----------|------|
| 경로·메서드 | `GET /hosts/manage/{hostid}` (`HostManageController.getOne` L88-94) | `getHostDetail`=`API.get(hosts/manage/{hostid})` (host-manage.api.ts L72-74) | PASS |
| 래퍼 | `ApiResult<ManagedHostDto>` | 인터셉터(1겹)+useDmoveQuery(2겹) → payload 직접 수신, `data.data` 미접근 | PASS |
| 응답 shape | ManagedHostDto: hostid/host/name/status/monitoredBy/proxy/agentAvailable/groups/interfaces/templates/**tags**/**deviceType** (ManagedHostDto.java L11-27) | TManagedHost 동일 12필드(host-manage.ts L59-72), proxy `TProxyRef\|null`, agentAvailable `string\|null`, tags `THostTag[]`, deviceType `EDeviceType` | PASS |
| tags/deviceType 채움 | getOne→fetchOne→`toManagedHost` 공용 매퍼(`selectTags:extend`, L506·529-533·546-547) — 목록과 동일 매핑 | HostInfoTab이 host.tags(round-trip 소스)·host.deviceType 소비 | PASS(폼 태그 round-trip 데이터 손실 위험 없음) |
| HOST_NOT_FOUND | HTTP200 + body `code:400`(data 없음) | 인터셉터가 envelope 반환→useDmoveQuery `envelope.data`=undefined → HostDetailPage `!host` → `detail_not_found` Empty + 목록 버튼(L69-79) | PASS |
| 인증 | adminOnly + `@VisitorIdCheck`/AdminAccessChecker | routes.tsx `PageWrapper adminOnly`(L508-509) + axiosInstance x-visitor-id/쿠키 | PASS |
| 경로 우선순위 | 리터럴 `/templates`·`/proxies`·`/device-type`가 `/{hostid}`보다 우선 | FE는 각 리터럴 별도 함수 호출 | PASS |

## 2. 엔티티 탭 props 주입 — PASS

- ItemManagementTab/TriggerManagementTab: URL 소비 폐기 → `scope/targetId/targetName(/targetTech)` **props 수신**(설계 §2). HostDetailPage L96-115, TemplateDetailPage L96-114에서 주입.
- 목록 요청 분기: `hostid = isHostScope ? targetId : undefined`, `templateid = isHostScope ? undefined : targetId` (ItemManagementTab L82-89, TriggerManagementTab L80-89) ↔ BE `ManagedItemListReqDto`/`ManagedTriggerListReqDto`(hostid/templateid/search/status[/severity]/limit/offset) **필드명 완전 일치**.
- 필터 URL 유지: keyword→search, status/severity→Number, offset/limit는 `useQueryParams`의 `params`에서 계속 URL로 관리. queryKey에 `${scope}:${stringParams}` 솔트 → host/template 상세 간 캐시 충돌 없음.

## 3. 인터페이스 데이터 주입 — PASS

- 흐름: 단건 EP `host.interfaces` → HostDetailPage `hostInterfaces={host.interfaces}`(L101) → ItemManagementTab → ItemFormDrawer(호스트 스코프만, L335).
- `HostInterfaceDto`(interfaceid/type/main/useip/ip/dns/port/available) ↔ `THostInterface` 8필드 일치. HostInfoTab 인터페이스 표도 동일 필드 소비(useip==="1", main==="1", available getAgentTag).
- interfaceId 매핑 회귀 없음: ItemFormDrawer는 `INTERFACE_REQUIRED_ITEM_TYPES` && 호스트 스코프일 때만 `interfaceId` 전송(L248-250) — B안 검증분 무변경. 템플릿 스코프는 hostInterfaces 미주입 → BE 인터페이스 미설정과 정합.

## 4. 템플릿 link/unlink 이관 무결성(§C 승격) — PASS

- link: `linkHosts({templateid, body:{hostIds}})` → `POST /zabbix-manage/templates/{id}/link`(api L184-192) ↔ BE `TemplateLinkReqDto.hostIds`(@NotEmpty) 일치.
- unlink: `{hostIds:[hostid], clear: clearOnUnlink}` → `.../unlink`(L195-203) ↔ BE `clear`(기본 false, link에선 무시) 일치. clear 옵션 체크박스·부분실패(`ZabbixManageApiError.message` 노출) 보존.
- 메타 수정(TemplateFormDrawer)·삭제(TemplateDeleteModal, 성공→목록 navigate) 이관 완료. jumpToItemTab은 서브탭 전환(?tab=item)으로 대체.
- `TManagedTemplateDetail`(templateid/name/displayName/description/itemCount/groups/**linkedHosts**/**parentTemplates**) ↔ `ManagedTemplateDetailDto` 8필드 일치. `TLinkedHostRef`(hostid/name) ↔ `LinkedHostRefDto` 일치.
- 구 `TemplateDetailDrawer.tsx` 삭제 확인(glob 부재).

## 5. redirect 매핑(§F 공용 함수) — PASS(LOW 1건)

- 3계보(configuration/item-template/trigger) 전부 `LegacyZabbixConfigRedirect`→`mapLegacyConfigUrl` 단일 경로 통과(routes.tsx L522-543).
- 정규화: ITEM_TEMPLATE(`templateId`→scope=template&targetId, tab 미지정→item), TRIGGER(tab=trigger), CONFIGURATION(무변환) — 설계 §7-2 일치.
- 산출: 엔티티탭(item/trigger/discovery)+targetId → `{host|template}-management/{targetId}?tab=<동일값>` + keyword/status/severity/offset/limit 보존; targetId 없으면 컨테이너 목록; lifecycle(template/template-group) → 템플릿 목록(keyword/groupids/offset/limit) 또는 `templateDetailId` → 상세 info 승격. 설계 §7-2 표 전 행 일치.
- **LOW-1**: 순수 bare `/item-template-management`(templateId·tab 모두 없음)는 정규화에서 scope 미부여 → 기본 entity 탭(item)+targetId 없음 경로를 타 **호스트 목록(`?tab=host`)** 으로 착지(구 화면은 템플릿 목록이었음). B안 미커밋·외부 북마크 없음 전제라 영향 미미. → fe-engineer, LOW.

## 6. 상속 읽기전용 규칙 — PASS

- 아이템: `isInherited = item.templateid !== "0"`(ITEM_LOCAL_TEMPLATEID) → 수정/삭제/체크박스 비활성 + status 토글 허용(L102-103, 246-249, 265-276). BE `ManagedItemDto.templateid`(String, "0"=로컬) 존재.
- 트리거: `trigger.inherited=true` → 수정/삭제/토글/체크박스 전부 차단(L134-138, 231, 246-255, 293). BE `ManagedTriggerDto.inherited`=**Boolean 래퍼**(is- 접두 함정 없음, 필드명 `inherited`→JSON 키 `inherited`) ↔ FE `inherited: boolean` 일치.
- 두 컨테이너(host/template) 상세가 **동일 컴포넌트** 재사용 → 규칙 일관 적용.

---

## LOW·INFO 요약

| # | 심각도 | 내용 | 수정주체 |
|---|--------|------|----------|
| LOW-1 | LOW | bare `/item-template-management`(파라미터 전무) redirect가 템플릿 목록이 아닌 호스트 목록으로 착지 | fe-engineer |
| INFO-1 | INFO | 호스트 상세에서 HOST_NOT_FOUND와 403(권한거부)이 동일 `detail_not_found` Empty로 수렴 — 라우트가 adminOnly라 403은 실질 도달 불가, 무해 | — |
| INFO-2 | INFO | `INTERFACE_REQUIRED_ITEM_TYPES`=BE resolveInterfaceId 대상 집합 동일성은 본 패스에서 BE 소스 직접 재확인 안 함(ItemFormDrawer B안 무변경분 신뢰) | — |

## 계약/경로 정합(부가 확인) — 전부 일치
- BE 컨트롤러 매핑 ↔ FE 서비스 URL: items(`/zabbix-manage/items` +/keys +/{itemid} +/status), templates(`/templates{/{id}}{/link}{/unlink}`), triggers(`/zabbix-manage/triggers` +/{id} +/status), hosts-manage(list/{hostid}/templates/proxies/device-type/status) 전건 경로·메서드 일치.
- 상태·가용성·type·useip·main·templateid 값의 문자열("0"/"1"/"2") 규약 FE 타입에 반영됨.
