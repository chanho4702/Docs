---
name: asset-cost-design
description: "2026-07-30 자산관리>비용 탭 설계 확정(구현 전) — 감가상각 엔진이 핵심, HW 우선·Cloud(AWS CE) 후순위"
metadata: 
  node_type: memory
  type: project
  originSessionId: db67148d-cb28-4782-95c7-ed8b55168626
  modified: 2026-07-31T01:30:19.834Z
---

2026-07-30 Confluence 기획(ZM/37190828047 `01-1. Cost`)을 받아 **자산 관리 > 비용 탭** 설계 확정. 구현 전. 설계서 `_workspace/devdesign_asset-cost.md`.

**목적 규정(사용자 언명)**: "우리가 관리하는 자산 데이터를 **비용 측면에서 관리**" — 범용 FinOps가 아니다. 무게중심은 자산의 비용 생애주기(취득→상각→유지보수→만료→교체), AWS 청구 분석은 부차. "관리"는 쓰기를 포함 → 조회 전용 화면이면 목적 미달.

**확정 11건**: ①정액법+정률법 둘 다 ②기기유형별 기본값+자산별 예외 ③한국 세무 기준(잔존가 0·기본 잔존가액 0원·월할) ④계산값 정본·수동은 오버라이드 ⑤월별 배분 계산(스냅샷 테이블 없음) ⑥예산 설정화면 신설+priority 자동산정 ⑦`/asset/cost` 3탭+드릴다운(메뉴 변경 없음) ⑧HW 우선·Cloud는 껍데기 먼저 ⑨**소급 재계산 = 항상 현재 파라미터 기준**(전진법·스냅샷 미채택, 화면 명시+변경 경고) ⑩**인라인 편집+미입력 큐 M1 필수** ⑪HW 모집단=excluded만 빼고 전 자산(platform으로 안 거름).

**M1 종료(2026-07-31, 미커밋)** — 일괄 업로드(`GET /costs/hw/template` raw CSV + `POST /costs/hw/bulk-upload` multipart·**행 단위 커밋**)와 만료일 입력 경로(`cost_data.expiry_date`, 수동→inventory 폴백) 추가로 데이터 0% 문제 해소. 최종 BE 712 / FE 755 tests. 델타 QA: 정적 HIGH0/MED1(수정), 런타임 **HIGH0·MED0**, 이전 발견 6/6 수정 확인. 🎯 업로드 실증: KPI 0원→₩1,139,583, 미입력 큐 74→68, 행별 손계산 8건 전건 일치. 🔴 핵심 계약="템플릿 출력을 손대지 않고 재업로드하면 전건 성공"(75/75 실증) — 초안은 무효 원문을 프리필해 그 행이 영영 실패하는 구조였음. 잔여 LOW: non-multipart 요청 500(전역 핸들러 공백), CSV cp949 변형 미검증(Excel로 열어 저장 시 발생 — **배포 전 1회 확인 권고**).

**M1 구현 1차(2026-07-30)** — BE 696 tests green / FE 733 passed. `cost/` 수직 패키지(계산엔진·검증기·우선순위), V17, EP 4개(목록·상각스케줄·PATCH편집·미입력큐), FE `/asset/cost` 3탭(HW만 내용)+인라인편집+미입력큐+드릴다운, 자산폼 개선, 기기분류 상각 기본값+소급경고. QA: 정적 HIGH0/MED4(전건수정), 런타임 HIGH0/MED2(전건수정)/PASS38. 산출물 `_workspace/features/assets/asset-cost/contract_asset-cost.md`·`qa_asset-cost.md`·`e2e_asset-cost.md`.

**🔴 실측 결과(2026-07-30 런타임) — 최악 확인**: 자산 74건(excluded 1) **전부 취득가액 0%**(`cost_data`가 75건 전부 `{}`), inventory `date_hw_purchase`/`install`/`expiry` **키 자체가 DB에 0건**. → 상각 계산 0건, KPI 전부 0, 미입력 큐 74건. **인벤토리 자동 채움은 기대 불가**(폴백 2·3단계 미발동). ⚠️ 취득가액만 채워도 큐가 안 비워짐(`acquisition_date_missing`이 74건 전부에 붙음). ⚠️ 만료일은 입력 경로가 아예 없어(비용 PATCH 화이트리스트 밖) 만료·교체 지표는 死지표. **대응 미결정**: 엑셀 일괄 업로드 M1 추가 / 손입력 후 M2 진행 / 취득일 폴백을 정상 인정(큐 판정에서 제외) 3안 사용자 대기 중.

**⚠️ 실 dev DB(5432)에 Flyway V14~V17 적용됨**(V13→V17, QA 기동 시). 추가 전용·멱등. QA 테스트 데이터는 원복 완료, 단 `POST /assets/sync`로 자산 1건(`test-chkim`, id 79) 신규 미러됨(실 Zabbix 존재 호스트라 정상, soft delete뿐이라 미원복).

**설계 중 드러난 사실(코드 실사)**:
- 🔴 `cost_data` 값은 **전부 문자열** — 폼이 평문 `<Input>`(AssetFormModal.tsx:697), BE는 `Map<String,Object>` 무검증 저장(Asset.java:127). 숫자 정규화·InputNumber 교체가 M1 필수
- 🔴 `date_hw_purchase`/`install`/`expiry`는 **코드 전체 grep 0건** — 표시도 입력도 안 됨. 단 `AssetZabbixData.inventory`는 `Map<String,String>`으로 값 있는 표준키 전부 스냅샷하므로 Zabbix에 값이 있으면 데이터는 이미 들어와 있음. custom 자산은 입력 경로 자체가 없음
- 🔴 **AWS `GetCostAndUsageWithResources`는 최근 14일만** → 리소스 단위 "전월 대비"는 원천적으로 불가. 월 비교=서비스/계정 grain, 리소스=14일 추이로 grain 2개 분리. Cost Explorer는 **요청당 $0.01** → 일 1회 배치+DB 캐시, 화면은 AWS 직접 호출 금지
- 기획서의 `platform=hw|cloud` 축은 본제품이 폐기(기기유형 대체) → 표시용 파생만 되살림. `cloud_data` 비어있는지로 판정하면 위험(자유입력 10필드라 한 칸만 실수로 채워도 cloud로 넘어감) → `resource_id` 존재로 좁힘

**교훈**: 설계 초안에서 "이미 있다"의 정도를 과대평가했다 — 컬럼이 존재하는 것과 값이 채워지고 입력 경로가 있는 것은 다르다. fable 5 검토가 이걸 잡았다. 그리고 "stateless 결정적 계산이라 스냅샷 불필요"는 반쪽 — 파라미터가 바뀌면 과거가 소급 재작성된다는 걸 정책으로 다뤄야 한다.

관련: [[assets-core-devdesign]] [[device-classification-feature]] [[aws-cred-single-source]]


## 인덱스 상세 이관 (2026-09-02)

인덱스 압축으로 옮겨온 요약 — 본문과 중복될 수 있으며 본문이 우선.

자산 비용 탭 설계 — 2026-07-30 자산관리>비용 탭 설계 확정(구현 전, 설계서 _workspace/devdesign_asset-cost.md). 목적=자산을 비용 렌즈로 **관리**(조회 전용 아님). **정액법+정률법 감가상각 엔진이 본체**, 한국 세무 기준(잔존가0·기본잔존가액0(08-05 비망가액 폐기)·월할), 기기유형별 기본값+자산별 예외, 소급재계산=현재 파라미터 기준(스냅샷 미채택), HW모집단=excluded만 제외, 인라인편집+미입력큐 M1필수. 🔴cost_data 값이 전부 문자열(폼이 평문Input) 🔴date_hw_* 코드 grep 0건(inventory 맵엔 실릴 수 있음, custom은 입력경로 없음) 🔴AWS CE는 리소스단위 14일 제약+요청당 $0.01. ⚠️착수전 dev DB 취득가액·취득일 실측 미실시. 교훈: 컬럼 존재 ≠ 값 존재 ≠ 입력경로 존재
