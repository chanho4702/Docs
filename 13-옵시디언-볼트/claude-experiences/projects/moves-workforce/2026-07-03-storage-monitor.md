---
tags: [project, moves-workforce, forge-sql, storage, monitoring, backoffice]
created: 2026-07-06
updated: 2026-07-06
---

# 2026-07-03 — 저장공간 관리 (DB 사용량 모니터링, RFC-151)

> Forge SQL 1 GiB 한도 도달 시 **앱이 정지되는 사고를 예방**하기 위한 관리자용 사용량 모니터링 페이지(`/backoffice/storage`). 2026-07-01 설계 → 07-02 v1 구현·검증(워크트리 RFC-151) → 07-03 프로젝트별 사용량 확장까지 **커밋 완료**(706eb8e, 8e86962). 산출물: `_workspace/storage-monitor/`. 한도 수치(공식 문서): Forge SQL **1 GiB/프로덕션 설치당**(누적형·정지 위험 핵심)·200테이블, KVS는 값 240 KiB·엔티티 20종(용량 누적형 아님).

---

## 스코프 결정 (v1 = 현재 사용량 + 경고만)

| 포함(v1) | 제외(후속) |
|---------|-----------|
| information_schema 실사용량 조회 | 증가 추이 스냅샷 / "n일 후 한도 도달" 투영 |
| 총 사용량 게이지(사용/1 GiB, %) + 80/90% 경고 | 종료 프로젝트 아카이빙 / 엑셀 추출 |
| 테이블별 상세(크기 내림차순·행수) | KVS 용량 상세(집계 API 부재 → 전량 스캔 비용, 의도적 제외) |
| (07-03 확장) 프로젝트별 사용량 근사 | — |

응답은 후속 필드(`history`, `kvs` 등)를 최상위에 추가하기 쉬운 **단일 객체 + `content` 래핑**으로 설계 — 계약 변경 없이 확장 가능.

## 구조

- **백엔드**: `src/resolver/storage/` 4계층(Controller/Service/Repository/Query) + `storageConstants.js`. `getStorageUsage` → `{ content: { limitBytes, totalBytes, totalRows, usedPercent, tables[], generatedAt } }`.
- **조회 원리**: `information_schema.tables`에서 `data_length+index_length`·`table_rows` 합산(`WHERE table_schema = DATABASE()`). 신규 테이블/DDL **0** — 읽기 전용 기능.
- **프론트**: `backoffice/page/storage/` — StoragePage + UsageGauge(커스텀 막대) + TableList(CommonTable) + `useStorageUsage`(쿼리키 `backofficeKeys.storageUsage()`). bytes 포맷 유틸 `utils/format/formatBytes.js`(이진 1024) 신규.
- **권한**: `STORAGE_MONITORING` 페이지 키 — 시드 Admin true / Member false, 미등록 fallback false. 이후 [[2026-07-06-permission-hardening]]에서 서버 가드까지 씌워짐.

## 핵심 설계 결정

1. **한도는 상수 + env 오버라이드** — Forge 런타임엔 환경 타입(dev/staging/prod) 감지 공식 API가 없다 → `DEFAULT_LIMIT_BYTES=1 GiB` 기본에 `forge variables set STORAGE_LIMIT_BYTES`로 환경별 오버라이드(dev 128 MiB 등). 환경 감지 대신 주입.
2. **임계치(80/90%)는 프론트 단일 정의** — 색상/배지는 프레젠테이션 관심사. 서버 응답에 임계치를 넣지 않아 서버-클라 이중 정의 drift 원천 차단. `usedPercent`는 100 초과 가능(한도 초과) → 게이지 폭만 clamp, 숫자는 원값 표기.
3. **`QueryBuilder` 부적합 판단** — 기존 조립기는 앱 테이블 SELECT 전용이라 information_schema + 표현식 컬럼에 안 맞음 → `CommonQuery.executeQuery` 재사용 + SQL은 `StorageQuery` 상수로 격리.
4. **TiDB 통계는 추정치** — `data_length`/`table_rows`는 ANALYZE 이전 stale/0 가능. 모니터링 근사 용도로 수용하고 UI에 "추정치" 고지(InfoTip).

## 07-03 확장 — 프로젝트별 사용량 근사 (8e86962)

아카이빙 후속 대비 "어느 프로젝트가 용량을 먹는가"를 근사 산정:
- project-scope 테이블들(project/projectusers/project_dashboard/portfolio_project_snapshot/gantt_folder/gantt_folder_issue)의 **프로젝트별 행수 × 해당 테이블 평균 행 크기**로 배분. `StorageProjectList` 컴포넌트 + Sidebar 진입점 추가.
- 함정 2개를 DDL 실측으로 회피: ① `project_id`는 BINARY(16) → `BIN_TO_UUID()`로 문자열화해야 집계 키가 맞는다. ② 실제 테이블명은 `projectusers`·`portfolio_project_snapshot`(직관적 이름 `project_users`/`portfolio_snapshot` 아님) — information_schema의 table_name과 정확히 일치해야 평균 행 크기 매칭이 된다.

## 검증 (03_verify_report, 07-02)

- 8/8 통과·실패 0: 경계면 shape 글자 단위 일치, 계산 정합(Σ·round·clamp), 권한 3면(시드/fallback/프론트) 일치, i18n 누락 0, jest 91/91 + 스토리지 단독 7/7, 프론트 빌드 성공.
- **미검증 P0 1건**: Forge SQL(TiDB)에서 `information_schema.tables`+`DATABASE()` 조회가 실제 허용되는지 — forge tunnel 실측 미수행, 배포 검증으로 갈음. 불가여도 SqlError→SectionMessage로 graceful degrade(크래시 아님)이나 **기능 성립 자체는 배포 후 확인 필요**.
- 알려진 한계(수용): 기존 설치는 시드 멱등(`if existing continue`) 때문에 `STORAGE_MONITORING`이 권한 응답에 없음 → 프론트 fallback `{read:true}` → Member에게도 노출 가능. 읽기 전용·저민감이라 (A) 수용 확정, 엄격 차단은 시드 머지 마이그레이션 별도 태스크.

## 교훈

- **용량 모니터링은 신규 테이블 없이 가능** — information_schema만으로 성립. "모니터링 기능 = 스냅샷 테이블부터"라는 반사 설계를 피했다(추이는 후속에 확장 훅만).
- **관리형 DB(TiDB)의 시스템 뷰 접근은 코드리뷰로 확정 불가** — 런타임 실측(P0)을 검증 항목으로 명시하고, 실측 전엔 "미검증"으로 정직하게 분류.
- 프로젝트별 배분 같은 근사 지표는 **실제 DDL 기준 테이블명/키 타입 실측**이 선행되어야 한다(직관 이름 가정은 silent 0 매칭으로 이어짐).

## 열린 항목

- 배포 후 information_schema 실측(P0) + 환경별 `STORAGE_LIMIT_BYTES` 주입 여부 결정.
- 후속 확장: 추이 스냅샷/투영, 종료 프로젝트 아카이빙·엑셀 추출(설계 착수 시점의 원 목표 2단계), 기존 설치 시드 머지.
