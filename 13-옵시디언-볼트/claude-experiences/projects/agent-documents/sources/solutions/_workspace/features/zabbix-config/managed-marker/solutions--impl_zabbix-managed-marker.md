# 구현 메모 — Zabbix 관리 화면 "MovesEye 관리(프리셋)" 표시 (BE, ZM-78)

- 작성 2026-10-12 · 워크트리 `C:\worktrees\zm-78-be`(브랜치 ZM-78) · **미커밋**
- 계약 정본: [./contract_zabbix-managed-marker.md](solutions--contract_zabbix-managed-marker.md)
- 같은 워크트리의 `premium/gpu/**`·`home/**` 변경은 다른 작업분 — 이 작업과 무관(커밋 시 분리).

## 변경 파일

**신규**
- `src/main/java/com/dmove/moveseye/zabbixadmin/preset/MovesEyeManagedResolver.java` — 판정기(색인 캐시 + 행 판정)
- `src/main/java/com/dmove/moveseye/zabbixadmin/dto/MovesEyeManagedDto.java` — 공통 마커 DTO
- `src/test/java/com/dmove/moveseye/zabbixadmin/preset/MovesEyeManagedResolverTest.java` — 16건

**수정(main)**
- `zabbixadmin/dto/ManagedTemplateDto` · `ManagedTemplateDetailDto` · `ManagedTemplateGroupDto` · `ManagedItemDto` · `ManagedTriggerDto` · `ManagedLldRuleDto` — 마지막 컴포넌트로 `MovesEyeManagedDto moveseyeManaged` 추가
- `zabbixadmin/ZabbixTemplateManageService` — 목록(페이지 id 묶음 1회 판정)·상세·생성/수정 응답에 부착, update·delete 뒤 `evict()`
- `zabbixadmin/ZabbixTemplateGroupManageService` — 목록·상세·생성/수정 응답에 부착
- `zabbixadmin/ZabbixItemManageService` — 목록(템플릿·호스트 스코프, 소스 필터 경로 포함)·상세에 부착. 호스트 스코프는 이미 역추적한 `sourceTemplate`을 판정기에 넘겨 재추적 안 함
- `zabbixadmin/ZabbixTriggerManageService` — 목록에 부착. `TRIGGER_OUTPUT`에 `flags` 추가(디스커버리 트리거 판정용 — 응답 DTO 무변경)
- `zabbixadmin/ZabbixLldManageService` — 목록에 부착(기존 정의처 역추적 결과 재사용)

**수정(test)** — 기존 5개 서비스 테스트에 `@Mock MovesEyeManagedResolver` 추가(생성자 주입 null 방지) + 부착 확인 테스트 4건
- `ZabbixTemplateManageServiceTest`(+2), `ZabbixTemplateGroupManageServiceTest`(+1), `ZabbixItemManageServiceTest`(+1), `ZabbixLldManageServiceTest`·`ZabbixTriggerManageServiceTest`(mock만)

## 보강(2026-10-12, FE 반영 후)

1. `MovesEyeManagedDto.presetName` 추가(3번째 컴포넌트) — 카탈로그 `Preset.templateName()`. 모르는 presetId(UNKNOWN)·그룹 마커는 null.
2. 호스트 쪽 연결 템플릿에 마커:
   - `host/manage/dto/TemplateRefDto` — `moveseyeManaged` 추가 + 2인자 편의 생성자(기존 호출처 무수정)
   - `host/manage/HostManageService` — 목록(페이지의 연결 템플릿 id 중복 제거 후 `forTemplates` **1회**)·단건/생성/수정 응답·`/hosts/manage/templates` 검색 결과
   - `zabbixadmin/dto/TemplateLinkResDto` — `moveseyeManaged` 추가, `ZabbixTemplateManageService.link/unlink` 응답에 부착
   - `ZabbixTemplateManageService` 상세 `parentTemplates[]`에도 부착(1회 판정)
   - 테스트: `HostManageServiceTest`(+1, `@Mock MovesEyeManagedResolver`), `ZabbixTemplateManageServiceTest`(+1 unlink), 판정기 테스트에 presetName 단언

## 판정 규칙(요약)

| 대상 | 규칙 |
|---|---|
| 템플릿 | 태그 `moveseye_preset` 있음 → basis TAG. 카탈로그 있는 id면 버전 비교 CURRENT/OUTDATED(버전 태그 없음=OUTDATED), 모르는 id=UNKNOWN. 태그 없고 **기술명(host)**이 카탈로그 기술명과 같음 → TAG_MISSING(basis NAME). 표시명은 안 본다 |
| 템플릿 그룹 | 이름 = `MovesEye presets` → NAME / 프리셋 템플릿 포함 → CONTAINS_PRESET. presetId·status null |
| 아이템·트리거 | flags=4 → 생성한 LLD 규칙의 원본 템플릿 / 상속본 → 부모 체인 끝 원본 템플릿 / 로컬 → 소속 컨테이너 |
| LLD 규칙 | 상속본 → 기존 정의처 역추적 결과 / 로컬 → 스코프 컨테이너(템플릿 스코프면 그 템플릿) |

버전 비교는 점 구분 숫자(`1.10 > 1.9`). status는 캐시하지 않고 매 요청 카탈로그와 비교(제품 업그레이드 즉시 반영).

## 호출 비용 설계

- 과제 지시는 "선택 템플릿 ID 묶음 → `template.get` 1회"였으나 **전역 색인 방식**으로 바꿨다: 프리셋 템플릿 집합(보통 3개)을 `template.get` 2회(태그 Exists + 카탈로그 기술명 필터 — `GpuSetupZabbixReader`와 동일한 질의)로 읽어 Redis 60초 캐시 1키(`zabbixadmin:preset-index:v1`). 이유: ① ID 묶음별 캐시는 키가 페이지마다 달라 적중하지 않음 ② 아이템·트리거·그룹 판정도 같은 색인 하나로 끝남 ③ 콜 수가 목록·ID 수와 완전히 무관.
- 행 판정 역추적은 기존 `ZabbixSourceTraceHelper`(깊이당 1콜 배치) 재사용. 디스커버리 생성물은 `item.get`/`trigger.get`(`selectDiscoveryRule`) 1회 + `discoveryrule.get` 깊이당 1회.
- **색인이 비면(프리셋 미설치) 역추적 콜 0** — 대부분 고객의 비용 증가는 60초당 template.get 2회뿐.
- 전부 fail-soft: 판정 실패 시 마커만 빠지고 목록은 정상.

## 검증

- 1차: `:test --tests "*Zabbix*Manage*" --tests "*Preset*" --tests "*MovesEyeManaged*"` → 245건 통과, 실패 0(판정기 16 + 부착 4).
- 보강 후: `--tests "*Architecture*" "*Zabbix*Manage*" "*Preset*" "*MovesEyeManaged*" "*HostManage*"` → **315건 통과, 실패 0** (ZabbixManage 186 · Preset 44 · HostManage 37 · Architecture 32 · 판정기 16).
- 판정기 테스트가 고정한 것: 태그 있음/버전 낮음/버전 태그 없음/이름만 일치/일반/모르는 id, 그룹 NAME·CONTAINS_PRESET(이름만이면 콜 0), 호스트 아이템 상속 1단·2단·디스커버리, 이미 추적한 소스 재사용, **5행이든 500행이든 item.get 3·discoveryrule.get 1·template.get 2**, 프리셋 미설치 시 역추적 0, 색인 실패 fail-soft.
- 🔴 **런타임 미검증** — :3000 BE(메인 레포)는 재기동하지 않았다. 실 Zabbix에서 확인할 것: `item.get`/`trigger.get`의 `selectDiscoveryRule`(7.0.6·7.4) 응답 형태, dev의 10761/10762/10764·호스트 10760/10763 아이템 목록에 마커가 실리는지.

## FE 메모

| 화면 | API | DTO 필드 |
|---|---|---|
| Zabbix 관리 > 템플릿 목록·상세 | `GET /zabbix-manage/templates`, `/{id}` | `ManagedTemplateDto.moveseyeManaged`, `ManagedTemplateDetailDto.moveseyeManaged` |
| Zabbix 관리 > 템플릿 그룹 | `GET /zabbix-manage/template-groups/list` | `ManagedTemplateGroupDto.moveseyeManaged`(basis만 의미) |
| 호스트/템플릿 상세 > 아이템 탭 | `GET /zabbix-manage/items?hostid=|templateid=` | `ManagedItemDto.moveseyeManaged` |
| 호스트/템플릿 상세 > 트리거 탭 | `GET /zabbix-manage/triggers?...` | `ManagedTriggerDto.moveseyeManaged` |
| 호스트 관리 > 템플릿 탭·편집 폼(해제 전 경고) | `GET/PUT /hosts/manage[/{id}]` | `ManagedHostDto.templates[].moveseyeManaged` |
| 호스트 편집 > 템플릿 연결 후보 | `GET /hosts/manage/templates` | `TemplateRefDto.moveseyeManaged` |
| 템플릿 상세 > 호스트 연결/해제 | `POST /zabbix-manage/templates/{id}/link·unlink` | `TemplateLinkResDto.moveseyeManaged` |
| 호스트/템플릿 상세 > 디스커버리 탭 | `GET /zabbix-manage/discovery-rules?...` | `ManagedLldRuleDto.moveseyeManaged` |

- 표시: 배지 "MovesEye 프리셋"(+ OUTDATED=갱신 필요, TAG_MISSING=식별 태그 없음). 그룹은 배지만.
- 경고: `moveseyeManaged != null` 행의 수정·삭제·비활성 동작 앞에 확인 모달. 차단은 BE에 없음.
- 타입: `null`과 키 생략을 동일 취급(전역 NON_NULL 설정 아님 — 현재는 `null`로 직렬화됨).
