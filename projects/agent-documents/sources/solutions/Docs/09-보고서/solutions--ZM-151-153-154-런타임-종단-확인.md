# ZM-151 · 153 · 154 런타임 종단 확인

- 실시 2026-09-28 09:20~09:56(KST) · 실시자 functional-qa(Claude) · 코드 수정 0 · 설정 쓰기 0
- 대상 런타임: BE :3000 = IntelliJ 기동 Spring dev(master `build/classes`, BE HEAD `3f731d5` — 151·153 `0c3d9e6`/`3741f37`, 154 `b2c564a` 포함), DB = 도커 `dmove-postgres-test`(:5433/dmove), FE :5173 Vite dev(FE HEAD `105c8bf` — 151·153 `3212e4c`, 154 `39ece8e` 포함)
- 기대 동작 출처: `reports/zm-151_cloud-snapshot-storage.md` · `zm-153_cloud-snapshot-config-cadence.md` · `zm-154_apm-data-export.md` · `zm-154_apm-data-export-fe.md` · `contract_apm-data-export.md`

## 0. 결론 먼저

| 항목 | 판정 | 한 줄 |
|---|---|---|
| ZM-151 V64 적용 | ✅ 통과 | `flyway_schema_history` rank 65, `64 cloud vpc snapshot dedup`, success=t (2026-09-22 09:40) |
| ZM-151 VPC 구간 적재(런타임) | ✅ 통과 | V64 이후 새 행 **17개뿐**(VPC 17개 × 1). 오늘 첫 회차(09:24:13)에 **새 행 0 · `last_seen_at`만 전진** |
| ZM-151 인스턴스 스냅샷 회차 보존 | ✅ 통과 | 3,477행 = 3,477회차(회차당 1행), 오늘 7회차도 각각 1행씩 추가 — 중복 제거 안 됨 |
| ZM-151 `collectionRegions` 읽기(API) | ⛔ 미실시 | 전용 계정 부재(401). DB상 키 **없음** = "전체" → 실제로 17개 리전 전부 수집됨(정합) |
| ZM-153 구성 주기 기본 30분(런타임) | ✅ 통과 | 옵션 `{}`(미설정) 상태에서 09:29~09:49 5회차는 인스턴스만, VPC 구성은 09:24·09:54 30분 간격 2회만 — §2-3 |
| ZM-153 스케줄러 설정·목록 API | ⛔ 미실시 | 전용 계정 부재(401). DB `scheduler_setting.cloud_snapshot` 존재·`options={}` 확인 |
| ZM-154 계획/다운로드 3종·형식 오류 | ⛔ 미실시 | 전용 계정 부재. 두 EP가 **런타임 OpenAPI에 등록**돼 있고 미인증은 HTTP 401 JSON으로 거절됨만 확인 |
| FE 화면 4곳 | ⛔ 미실시(렌더) | 전용 계정 부재. 대상 모듈 9개는 Vite 변환 200(컴파일 오류 없음)만 확인 |

**결함 0건.** 로그인이 필요한 확인(ZM-154 전부, 설정 API, 화면)은 검증 전용 계정이 없어 하지 못했다 — §6.

---

## 1. 사전 확인 — 전용 계정 탐색

| 탐색 위치 | 결과 |
|---|---|
| `C:\solutions\_tools`(`headless-shot/cdp-shot.mjs`, `run_be_3000_dev*.ps1`, `otel/`) | admin 예시만(`"username":"admin","password":"..."`) |
| `C:\solutions\_workspace\_tools` | 폴더 없음 |
| `_workspace/**/*.md|*.ps1` 에서 qa/mcp/test/임시/전용 계정 | 과거 임시 계정(`zm157mcp` 등)은 **전부 "검증 후 삭제"로 기록**. 현재 쓸 수 있는 자격증명 없음 |

→ 지시대로 admin 로그인·계정 생성은 하지 않았고, 로그인 없이 되는 확인(DB 읽기·미인증 응답·OpenAPI·Vite 변환)만 했다.

## 2. ZM-151 · ZM-153 — 클라우드 스냅샷

### 2-1. Flyway
```
docker exec dmove-postgres-test psql -U postgres -d dmove -c "select installed_rank,version,description,success,installed_on from flyway_schema_history where version::int>=60 order by installed_rank"
```
| rank | version | description | success | installed_on |
|---|---|---|---|---|
| 65 | 64 | cloud vpc snapshot dedup | t | 2026-09-22 09:40:23 |

(60~67 모두 success=t. rank 62 결번은 기존 이력 — 이번 대상 아님)

### 2-2. `cloud_vpc_snapshot` 스키마·행 형태
- 컬럼 `last_seen_at timestamp NULL 허용` · `content_hash varchar(64) NULL 허용` 존재 — 보고서 §2-2(NULL 허용) 그대로
- 인덱스 `idx_cloud_vpc_snapshot_latest (region, vpc_id, run_at DESC)` 존재

| 지표 | 값 | 판정 |
|---|---|---|
| 전체 행 | 53,363 | 전환기 옛 행 보존(보고서 §6 "전환기"와 일치, 보존 30일 정리 대기) |
| 옛 행(`content_hash` NULL) 중 `last_seen_at = run_at` | 53,346 / 53,346 | V64 채우기 정상 |
| V64 이후 적재 행(`content_hash` 있음) | **17** (지문 17종, VPC 17개, 리전 17곳에 1개씩) | ✅ 5분마다 행이 늘지 않는다 |
| 그 17행의 `run_at` | 전부 2026-09-22 09:46:19 (V64 직후 첫 회차 — 옛 행에 지문이 없어 1회성 새 구간, 보고서 §6 "첫 회차"와 일치) | ✅ |

### 2-3. 오늘 회차 실측 (BE 09:18 기동, 배치 초기 지연 5분)

| 시각(KST) | 인스턴스 스냅샷 | VPC 스냅샷 | 해석 |
|---|---|---|---|
| 09:24:13 | +1행 (`i-06ac…`, ap-northeast-1, running) | 새 행 **0**, 17행의 `last_seen_at` → 09:24:13 | 마지막 관측(09-23 15:40)에서 30분 경과 → 구성 차례. 지문 동일 → 끝만 전진 ✅ |
| 09:29:28 | +1행 | 변화 없음(`last_seen_at` 09:24:13 유지), 새 행 0 | 30분 안 → **구성 미룸** ✅ (ZM-153) |
| 09:34:32 · 09:39:35 · 09:44:38 · 09:49:42 | 각 +1행 | 변화 없음(끝 09:24:13 유지) | 경과 25분29초+여유 1분 < 30분 → 계속 미룸 ✅ |
| 09:54:45 | +1행 | 새 행 **0**, 17행 `last_seen_at` → 09:54:45 (17행 모두 같은 값) | 경과 30분32초 → 구성 재수집, 지문 동일 → 끝만 전진 ✅ |

재현:
```
docker exec dmove-postgres-test psql -U postgres -d dmove -c "select run_at from cloud_instance_snapshot where run_at>'2026-09-28' order by 1" \
  -c "select max(last_seen_at), count(*) filter (where run_at>'2026-09-28') new_rows, count(*) from cloud_vpc_snapshot"
```

과거 이력에서도 같은 패턴: 09-23 15:40:08에 VPC 끝 전진 → 15:45·15:50·15:55·16:00·16:05 인스턴스 회차에는 VPC 미갱신(BE 16:05 이후 정지).

### 2-4. `cloud_instance_snapshot` — 회차별 행 보존
| 지표 | 값 |
|---|---|
| 전체 행 / 서로 다른 `run_at` | 3,477 / 3,477 (오늘 7회 포함, 09:55 기준) |
| 시간당 회차 수(09-22~09-23) | 10~13회/시간, 회차당 1행 |

→ 인스턴스 1대가 상태 변화 없이도 **회차마다 1행** — 보고서 §2-1("건드리지 않았다")대로 중복 제거 안 됨 ✅. 스키마에도 `last_seen_at`/`content_hash` 없음.

### 2-5. 수집 범위(`collectionRegions`)·구성 주기 설정값
| 확인 | 방법 | 결과 |
|---|---|---|
| `GET /settings/cloud-infra` | curl(미인증, `x-visitor-id` 포함) | HTTP 401 `{"status":"error","code":401,"message":"INVALID_TOKEN"}` → **본문 확인 미실시** |
| 런타임 DTO에 필드 존재 | `GET /v3/api-docs` → `CloudInfraInfoDto` | `username,password,type,costExplorerEnabled,fleetMetricsEnabled,collectionRegions` ✅ |
| 저장값 | DB `setting`(type=CLOUD) 키 목록만 조회(비밀값 미출력) | `{type,password,username,paidFeatures}` — `collectionRegions` **없음** |
| 키 없음 = 전체 | §2-2 | 17개 리전 VPC 모두 끝 전진 → "애매하면 전체" 규칙(보고서 §4)과 일치 ✅ |
| `GET /settings/schedulers` | curl(미인증) | HTTP 401 → 목록·카탈로그 응답 확인 미실시 |
| 스케줄러 저장값 | DB `scheduler_setting` | `cloud_snapshot` enabled=t, interval 5분, `options={}` → BE `CloudSnapshotCadence.DEFAULT_MINUTES=30` 적용(§2-3 실측과 일치). FE 기본 사본 `CLOUD_SNAPSHOT_CONFIG_INTERVAL_DEFAULT=30` 동일 |

**ZM-153 판정**: 인스턴스는 5분(실측 간격 5분 3~15초)마다 7회 모두 적재, VPC 구성은 09:24:13 → 09:54:45 **30분 간격으로 2회만** 수집. 옵션 미설정 시 기본 30분 · 1분 여유 규칙이 런타임에서 그대로 동작한다.

## 3. ZM-154 — APM 내보내기

| 요청 | 응답 요지 | 판정 |
|---|---|---|
| `GET /v3/api-docs` | `GET /apm/exports/{dataset}`·`GET /apm/exports/{dataset}/plan` 등록, 파라미터 `dataset,from,to,step,service,q,format,gzip,rawText`(계약 §2와 동일). `ApmExportPlanDto` 필드 23개가 계약 §3과 동일 | ✅ 실행 중 JVM에 코드 탑재 |
| `GET /apm/exports/red-series/plan?from=…&to=…`(미인증) | HTTP 401 JSON `INVALID_TOKEN` | ✅ 계약 §5.2 "401 = 실제 HTTP 401" |
| `GET /apm/exports/red-series?from=…&to=…`(미인증) | HTTP 401 JSON | ✅ 파일 본문 안 나감 |
| `…/plan?from=abc`, `/apm/exports/bogus/plan`(미인증) | HTTP 401 — 인증이 검증보다 먼저 | 참고(정상 순서). `APM_EXPORT_INVALID` 자체는 **미확인** |
| 계획·다운로드 3종 · Content-Type/Disposition · 첫 행 · 행 수 · `APM_EXPORT_INVALID` · 미래 `to` | — | ⛔ 전용 계정 부재로 미실시 |

참고(다음 확인자를 위한 데이터 존재 여부): `apm_service` 4개, `apm_error_group` 30개(마지막 발생 09-23 16:05), 오늘 파티션 `apm_metric_1m_p20260928`·`apm_span_p20260928` 존재 → 로그인만 되면 3종 모두 0행이 아닌 파일로 확인 가능.

## 4. FE 화면

| 확인 | 결과 |
|---|---|
| `GET :5173/sign-in` | 200 |
| Vite 변환(컴파일) — `pages/setting/CloudInfraInfo.tsx` · `scheduler/SchedulerManagement.tsx` · `SchedulerEditModal.tsx` · `schedulerConfigInterval.ts` · `shared/components/ApmExportButton.tsx` · `ApmExportModal.tsx` · `ApmServiceOverviewTab.tsx` · `ApmServiceTransactionsTab.tsx` · `ApmErrorExplorer.tsx` | 9개 전부 200. 개요·트랜잭션·에러 탐색기 3곳이 `ApmExportButton`을 import, 스케줄러 표가 `formatConfigIntervalTag` 사용 |
| 번역 키 | kr/en 모두 `collection_*`·`config_interval_*`(8)·`apm.export` 블록 존재 |
| 실제 렌더·버튼 클릭·파일 저장 | ⛔ 전용 계정 부재로 미실시 |

## 5. 결함 목록

| # | 심각도 | 내용 | 재현 | 출처 |
|---|---|---|---|---|
| — | — | 이번 범위(로그인 없이 볼 수 있는 부분)에서 결함 없음 | — | — |

관찰(결함 아님): 스냅샷 배치 성공은 `scheduler_run_log`에 남지 않는다(성공 기록 정책 off). 그래서 `vpcs=deferred(every 30m)` 요약 문구는 DB로는 볼 수 없고, 스케줄러 화면 "로그"에서도 성공 회차는 안 보일 수 있다 — 미룸 판정은 위처럼 행 시각으로만 확인 가능. 필요하면 `cloud_snapshot` 성공 기록을 켜는 것을 검토.

## 6. 미실시 항목과 이유

| 항목 | 이유 | 해소 방법 |
|---|---|---|
| `GET /settings/cloud-infra` 본문의 `collectionRegions` | 전용 계정 부재(admin 로그인 금지 지시) | 관리자 역할 임시 계정 1개 발급 후 재실시 |
| `GET /settings/schedulers` 목록·카탈로그 이름 | 동일 | 동일 |
| ZM-154 계획/다운로드 3종, 헤더·첫 행·행 수, `APM_EXPORT_INVALID`, 미래 `to` | 동일(APM view 권한 필요) | APM view 권한 계정 |
| ZM-154 브라우저 다운로드(개요/트랜잭션/에러) | 동일 | 동일 + 헤드리스 CDP(`_tools/headless-shot`) |
| FE 화면 4곳 렌더 | 동일 | 동일 |
| VPC 상세 이력 API(`vpcHistory` 구간→계단선 응답) | 동일(요청 범위 밖이기도 함) | 동일 |
| 설정 쓰기(리전 범위 저장·주기 변경) | 지시로 금지 | — |
