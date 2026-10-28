---
name: device-classification-feature
description: "2026-07-22 기기분류(device_type) 고정 enum → DB 관리형(설정>기기분류 관리 CRUD) 풀스택 전환(미커밋). 신규 device_classification 테이블 V13, /settings/device-classifications CRUD+usage+reorder, 3중 폴백 레지스트리. FE ~20 사용처를 useDeviceClassifications 훅으로 동적화. 교훈: 호스트 태그가 진실·테이블은 메타만(삭제해도 데이터 파괴0), 쓰기는 화이트리스트/읽기는 미지코드→미분류 폴백"
metadata: 
  node_type: memory
  type: project
  originSessionId: 6c5f188f-27ea-4a1a-aee6-b9f557b1edd0
  modified: 2026-07-22T07:41:53.136Z
---

2026-07-22 기기분류(device_type)를 **고정 enum → 우리 DB 관리형**으로 전환. 설정>기기분류 관리 화면에서 CRUD. **미커밋.** 사용자 요구="기기분류를 설정 하위에서 목록화, 시스템 내 컨트롤 가능하게".

## 데이터/정합 모델
- 신규 `device_classification` 테이블(**Flyway V13**, 멱등 CREATE + 6종 seed). code(unique·불변·태그값)/name/name_en/color(AntD preset)/sort_order/is_system/active/timestamps.
- **호스트 태그가 진실, 테이블은 code의 메타(라벨/색/노출)만** 관리. device_type은 여전히 Zabbix 태그로 code 저장. → 분류 삭제/비활성해도 호스트 태그 잔존(**데이터 파괴 0**, 재등록으로 복구).
- 정합 원칙: **"쓰기는 화이트리스트(active code만), 읽기는 관대(미지 code→notClassified 폴백)"**. `DeviceTypeResolver`가 validCodes를 레지스트리에서 주입받아 파라미터화.
- seed 6종(현행 FE와 1:1, 배포 직후 시각변화 0): server/서버/Server/blue/10, network/네트워크/geekblue/20, security/보안/volcano/30, database/데이터베이스/purple/40, hardware/하드웨어/gold/50, **notClassified/분류되지 않음(i18n not_classified 렌더값)/default/60**. 전부 is_system=true.

## BE
- `/settings/device-classifications` GET(전 인증사용자, 라벨/색 필요)/POST/PUT/DELETE + `GET /{id}/usage`(삭제 전 affectedHosts 카운트) + reorder. 변경계는 `AdminAccessChecker.requireAdmin`(HTTP200+body403). 
- `DeviceClassificationRegistry`(캐시 60s + CRUD evict, **빈테이블/조회실패 시 정적 6종 폴백**). `PATCH /hosts/manage/device-type` 검증을 이 레지스트리 active code 화이트리스트로 교체(계약 shape 불변).
- 보호: is_system → code변경·삭제 금지, 라벨/색/순서만 수정. notClassified 삭제 금지. ErrorCode DEVICE_CLASSIFICATION_{NOT_FOUND,DUPLICATE_CODE,SYSTEM_PROTECTED,INVALID_CODE}.

## FE
- 소비처가 이미 상수 3개(HOST_DEVICE_TYPE_OPTIONS/DEVICE_TYPE_COLOR/DEVICE_TYPE_LABEL_KEY)로 수렴 → `hooks/useDeviceClassifications`(options/colorOf/labelOf, **빈응답/에러 시 정적 6종 폴백**)로 ~20파일 저비용 대체(host-management/asset/host-group/모달/types). EDeviceType enum·정적상수는 폴백 존치.
- `pages/setting/device-classification/`(관리 화면 + ClassificationFormModal), 설정 메뉴 등록. 삭제 전 usage 경고.
- 계약: `_workspace/features/zabbix-config/classification-tags/contract_device-classification.md`, 설계: `design_device-classification.md`.

## 검증
- BE build+test 그린. FE tsc/lint/build 그린, jest 600통과. **런타임 검증됨**(브라우저): 화면 로드·수정모달 데이터 로드·BE CRUD 전경로(생성/수정/삭제/usage/system보호 server삭제400) 정상.
- ⚠️ **런타임 검증 시 스테일 BE 교훈**: 처음 "수정 안됨"은 떠있던 BE가 구빌드(EP없음)→화면은 폴백6종·쓰기 실패였음. **BE 재빌드+재기동으로 V13 적용→해결**. 신규 BE 기능은 실행 중 BE에 자동 반영 안 됨(재기동 필수).

관련: [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--propagation-lens-feature|propagation-lens-feature]], [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--host-classification-tags-feature|host-classification-tags-feature]], [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--zabbix-config-drilldown-restructure|zabbix-config-drilldown-restructure]], [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--fe-dmovetable-loading-spinner|fe-dmovetable-loading-spinner]]


## 인덱스 상세 이관 (2026-09-02)

인덱스 압축으로 옮겨온 요약 — 본문과 중복될 수 있으며 본문이 우선.

기기분류 DB 관리형 전환 — 2026-07-22 기기분류(device_type) 고정enum→DB관리형(설정>기기분류 관리 CRUD) 풀스택(미커밋). device_classification 테이블 V13, /settings/device-classifications CRUD+usage+reorder, 3중폴백 레지스트리, FE ~20사용처 useDeviceClassifications 훅 동적화. 교훈: 호스트태그가 진실·테이블은 메타만(삭제해도 파괴0), 쓰기 화이트리스트/읽기 미지코드→미분류폴백. 런타임검증됨(BE 재기동으로 V13적용)
