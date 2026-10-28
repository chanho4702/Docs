# QA — Zabbix 관리 화면 "MovesEye 관리(프리셋)" 표시 + 쓰기 경고 (FE, ZM-78)

- 작성 2026-10-12 · 워크트리 `C:\worktrees\zm-78-fe`(브랜치 ZM-78, 기준 master `c24ef50`) · **미커밋**
- 계약 [./contract_zabbix-managed-marker.md](contract_zabbix-managed-marker.md) · BE 메모 [./impl_zabbix-managed-marker.md](impl_zabbix-managed-marker.md)
- 결정(사용자 2026-10-12): 편집·삭제는 **경고만**, 막지 않는다.

## 1. 공용 부품 (신규)

| 파일 | 역할 |
|---|---|
| `src/components/MovesEyeManaged/MovesEyeManagedTag.tsx` | "MovesEye 관리" 배지 + 툴팁(프리셋 ID·설치 버전·상태 문구 / 그룹은 basis 문구). null·undefined면 렌더 없음. 색은 `usePalette()` — 기본 `BRAND.primarySoftStrong`/`primaryActive`, OUTDATED만 `HEALTH_SOFT.warning`/`HEALTH_TEXT.warning` + 라벨 "· 갱신 필요"(색 단독 금지 규칙) |
| `src/components/MovesEyeManaged/movesEyeManagedGuard.tsx` | `isMovesEyeManaged`·`countMovesEyeManaged`·`guardMovesEyeManagedWrite`(프리셋이면 `Modal.confirm`, 아니면 즉시 진행)·`MovesEyeManagedDeleteAlert`(기존 삭제 모달 안에 덧붙이는 경고 문단) |
| `src/types/zabbix-item-template.ts` | `TMovesEyeManaged`·상수 3종(kind/status/basis)·`TWithMovesEyeManaged`(`moveseyeManaged?: … \| null`) |
| `src/__tests__/fixtures/zabbixManagedMarkerContractSample.ts` | 계약 §4 예시 + status 4종·그룹 basis 2종 픽스처(`typecheck:contract` 게이트 대상) |
| i18n `moveseye_managed.*` (kr/en 각 22키) | 배지·툴팁·확인·삭제 경고·편집 배너 |

## 2. 화면별 적용

| 화면 | 배지 | 경고(막지 않음) |
|---|---|---|
| 템플릿 목록 `TemplateList` | 이름 열 | 일괄 삭제 → `TemplateDeleteModal`에 경고 문단(프리셋 개수) |
| 템플릿 상세 `TemplateDetailPage` | 탭 줄 오른쪽(`tabBarExtraContent`) — 모든 서브탭에서 보임 | — |
| 템플릿 상세 > 정보 `TemplateInfoTab` | (상단 배지로 대체) | 수정 저장(`TemplateFormDrawer`) 확인 모달 · 삭제 모달 경고 문단 · **호스트 연결 해제** 확인 모달 |
| 템플릿 수정 드로어 | 제목 옆(수정 시) | 저장 직전 확인 |
| 템플릿 그룹 목록 `TemplateGroupList` | 이름 열 | 수정(`TemplateGroupFormModal`) 확인(그룹 문구) · 삭제(단건/일괄) 모달에 그룹 경고 문단 |
| 템플릿 그룹 상세 드로어 | 제목 + 포함 템플릿 이름 열 | — |
| 아이템 탭(호스트·템플릿 공용 `ItemManagementTab`) | 이름 열 | **끄기**(상태 토글 off) 확인 · 켜기는 그대로 · 삭제 모달 경고 문단 |
| 아이템 수정 드로어 `ItemFormDrawer` | 제목 옆(수정 시) | 저장 직전 확인 |
| 트리거 탭 `TriggerManagementTab` | 이름 열 | 끄기 확인 · 삭제 모달 경고 문단 |
| 트리거 수정 드로어 | 제목 옆(수정 시) | 저장 직전 확인 |
| 디스커버리(LLD) 탭 `DiscoveryManagementTab` | 이름 열 | 끄기 확인 · 삭제 모달(`DiscoveryDeleteModal`, LLD) 경고 문단 |
| LLD 수정 드로어 `LldRuleFormDrawer` | 제목 옆 | 저장 직전 확인 |
| LLD 상세 드로어 `LldRuleDetailDrawer` | 제목 옆 | 상단 상시 경고 배너(프로토타입 편집은 개별 확인 대신 배너) |

- 기존 삭제 모달이 있는 곳은 **새 모달을 띄우지 않고** 경고 문단만 덧붙였다(모달 중복 없음). 일반 항목만 고르면 모달은 기존과 동일.
- 호스트 스코프의 프리셋 아이템·트리거·LLD는 대부분 **상속본**이라 수정·삭제가 원래 비활성 → 그 화면에서 실질 경고 지점은 끄기 토글뿐이다.
- "MovesEye 관리만 보기" 토글은 **넣지 않았다** — 다섯 목록 모두 서버 페이징이라 클라이언트 필터는 현재 페이지만 거른다(오해 소지).

## 3. 계약 대조

| 계약 항목 | FE | 결과 |
|---|---|---|
| 필드명 `moveseyeManaged`, 객체 6필드 이름·nullable | `TMovesEyeManaged` | 일치(BE `MovesEyeManagedDto.java` 직접 대조) |
| null/키 생략 동일 취급 | `moveseyeManaged?: … \| null`, 판정은 `!!row?.moveseyeManaged` | 일치 |
| 부착 DTO: 템플릿 목록·상세·생성/수정, 그룹 목록·상세, 아이템 목록·상세, 트리거 목록, LLD 목록 | `TManagedTemplate`·`TManagedTemplateDetail`·`TManagedTemplateGroup`·`TManagedItem`·`TManagedTrigger`·`TManagedLldRule` | 일치 |
| 미부착: 트리거 상세·LLD 상세·렌즈·select용 그룹·`groups[]` 원소 | 손대지 않음. 수정 드로어는 **목록 행** 마커를 사용 | 일치 |
| 그룹 마커 status null → basis로 설명 | 툴팁 `group_basis_name` / `group_basis_contains` | 일치 |
| §6 쓰기 경고는 FE 몫, 차단 없음 | 확인 후 그대로 호출 | 일치 |

- 계약 문서(`null로 직렬화`)와 BE DTO 주석(`null → JSON 생략`)이 서로 다르게 적혀 있으나 FE는 양쪽 모두 처리하므로 영향 없음.
- 템플릿 상세 → 수정 드로어 어댑터(`TemplateInfoTab.templateForChildren`)에 `moveseyeManaged`를 넘기도록 보강(빠뜨리면 상세에서 수정할 때 경고가 안 뜸).

## 4. 검증 수치

| 항목 | 결과 |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| `npm run typecheck:contract` | exit 0(신규 픽스처 포함) |
| ESLint(변경·신규 .ts/.tsx 전부) | 경고·오류 0 |
| 신규 `MovesEyeManaged.test.tsx` | 13/13 — 배지 null·CURRENT·OUTDATED(버전 보간)·TAG_MISSING·UNKNOWN·그룹 NAME/CONTAINS_PRESET, 가드 일반=즉시·프리셋 계속=호출·취소=미호출, 개수·삭제 경고 |
| 신규 `MovesEyeManagedDeleteModals.test.tsx` | 4/4 — 템플릿 일괄 삭제에 프리셋 섞임 → 경고(1개)+전체 ID 삭제 호출, 일반만이면 경고 없음, LLD 삭제 경고, 네트워크 디스커버리 경고 없음 |
| 기존 스위트 보강 | `ItemManagementTab` +4(배지 행별, 끄기 계속=API·취소=미호출, 일반 켜기 즉시), `ItemFormDrawer` +3(일반 저장 즉시, 프리셋 계속=update·취소=미호출), `TemplateList` +1(OUTDATED 배지·null 없음) |
| 관련 스위트(Template*·Trigger*·Discovery*·Lld*·MovesEyeManaged*) | 96건 중 95 통과, 실패 1 = `TriggerFormDrawer` create 오류 토스트(master 기존 실패, 이 작업과 무관한 생성 경로) |
| 전체 jest | 아래 §6 |

## 5. 미검증 / 남은 것

- 🔴 **브라우저 런타임 미검증** — :3000 BE에 이 필드가 아직 없다(BE 미재기동). 실 응답으로 배지 위치·툴팁·다크모드 색 대비는 화면에서 확인 필요.
- 툴팁의 "프리셋 이름"은 **presetId**(예: `gpu-dcgm-http`)로 표시한다 — 계약에 표시명 필드가 없다. 사람이 읽는 이름이 필요하면 BE에 `presetName` 추가 요청(계약 `🔄 FE 요청사항`) 필요.
- 호스트 상세 쪽 "템플릿 연결/해제"(호스트 폼의 템플릿 선택)는 경고 없음 — 그 응답(`TTemplateRef`)에는 마커가 없다(계약 범위 밖).
- LLD 프로토타입 개별 저장·삭제는 확인 모달 대신 상세 드로어 상단 상시 배너로만 안내.
- 일반 구성물 경로는 기존 테스트 전부 그대로 통과(동작 무변경).

## 6. 전체 jest

`npx jest` 1회: **312 스위트 중 306 통과 · 4,103건 중 4,094 통과 · 실패 9**.
- 8건 = master 기존 실패(apmHelpContent 3 · apmRoutes 3 · AiAssistantPage 1 · TriggerFormDrawer 1).
- 1건 + 스위트 1 = `gpuRoutes`(i18n `gpu.*` 키 누락)·`GpuDetailPage`(스위트 로드 실패) — 같은 워크트리에서 **다른 에이전트가 GPU 파일(`types/gpu.ts`·`services/gpu.api.ts`·`constants/queryKey.ts`)을 편집 중**인 상태에서 돌아간 것. 이 작업은 GPU 경로를 건드리지 않았다. GPU 작업이 끝난 뒤 재확인 필요.
- 이 작업이 추가·수정한 테스트는 전부 통과.

## 7. 보강 (2026-10-12, 계약 §2-B·`presetName`)

| 항목 | 변경 |
|---|---|
| `presetName` | `TMovesEyeManaged.presetName: string \| null` 추가. 툴팁 첫 줄(굵게) = 프리셋 이름 → 없으면 presetId(모르는 프리셋 등) |
| 타입 | `types/host-manage.ts`·`types/zabbix-item-template.ts`의 `TTemplateRef`, `TTemplateLinkRes`에 `moveseyeManaged?`(공용 `TWithMovesEyeManaged`) |
| 호스트 수정 `HostFormDrawer` | 기존 연결 템플릿 중 **프리셋이 빠지는 저장**이면 `guardMovesEyeManagedWrite`(unlink 문구) 확인 → 계속 시 `PUT /hosts/manage/{id}` 그대로, 취소 시 미호출. 프리셋 아닌 해제·해제 없는 저장은 기존대로 바로 저장. 템플릿 선택 칩·해제 대상 목록에 배지(검색 결과에 마커가 없어도 원본 마커 유지) |
| 호스트 목록 `HostTab`·호스트 정보 `HostInfoTab` | 연결 템플릿 칩 옆 배지 |
| 템플릿 정보 `TemplateInfoTab` | 부모 템플릿(`parentTemplates[]`) 칩 옆 배지 |
| 픽스처 | 마커 전부에 `presetName`, 호스트 템플릿 참조·link 응답 샘플 추가 |
| i18n | 변경 없음(기존 `moveseye_managed.*` 재사용) |

검증: `tsc` 0 오류 · `typecheck:contract` 0 오류 · 변경 파일 ESLint 0 · 관련 jest(Host*·MovesEyeManaged*·Template*·Item*·Trigger*·Discovery*·Lld*) **193건 중 192 통과**, 실패 1 = `TriggerFormDrawer` master 기존 실패.
신규 테스트: `HostFormDrawer` +4(프리셋 칩 배지, 프리셋 해제 계속=PUT·취소=미호출, 일반 템플릿 해제는 경고 없이 저장), `MovesEyeManaged` 툴팁 이름 우선 검증 1건 보강.
미검증: 브라우저 런타임(BE 보강분 미기동), 템플릿 상세 정보 탭의 호스트 해제는 기존 §2대로 템플릿 자신의 마커로 경고(변경 없음).
