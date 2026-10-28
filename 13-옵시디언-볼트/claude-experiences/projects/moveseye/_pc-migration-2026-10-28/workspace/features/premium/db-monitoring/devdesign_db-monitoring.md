# DB 모니터링(Database Monitoring) — 설계서 v2.3 착수본 (에이전트리스 JDBC 폴러 + 원격 실행형 수집기 · 유료 PREMIUM · Datadog DBM 대조 반영 · 인사이트 카탈로그)

- 작성: 2026-10-19 (v1 초안 → v1.1 코덱스 검수 반영) → 2026-10-22 v1.2 Datadog DBM 전수 대조(G1~G49) + 코덱스 협의 반영 → v1.3 §16 인사이트 카탈로그(코덱스 3차 반영) → **2026-10-22 v2.0 착수본 — 사용자 확정 Q22·Q26·Q27·Q3/Q29·Q12·Q13(추천대로) → D17~D22, 원격 실행형 수집기(J2) GA 편입 §3.6, §17 착수 계획**
- 상태: 🟢 **v2.3 착수본(P0 착수 — 로컬 PG16 R1 실측·계약 시험본·코어 폴러 프레임, 코덱스 6·7차 반영, **코어 Gradle 모듈 `dbm-collector-core` 분리·J1 PG lease/writer/checkpoint + Flyway V90 2026-10-26 · **v2.5 보존 계단=APM/Zabbix 공통 구현체(`premium.common`)·`dbm_retention` V91 2026-10-27** · **v2.6 WS-2 잔여 — J1 구동 조립(`DbmPollerManager`·`PgConfigSource`·`CodecSecretResolver`·`GET /dbm/poller/status`) 2026-10-27** · **v2.7 WS-3 1단계 PG 어댑터(`adapter/pg/PgEngineAdapter` S·L·C·Q, 실 PG16 end-to-end) 2026-10-27** · **v2.8 WS-3 2단계 typed 파티션 표 V92(`DbmPartitionService`·`PgTypedRowStore`, `dbm_sample_row` 제거, 보존 키 6개) 2026-10-27**) — P0 실측(R1~R11) 진행 중(§17.7 판정표)(조건부: §3.6의 🧪 표시 항목은 P0 시험 가정이며 P1a 공통 모델 확정 전까지 운영 계약이 아님).** 구현은 ZM-172 워크트리에서 P0 항목부터(§17.1). v2 필수 미결은 전부 확정, 남은 Q는 §17.6 기한. 코덱스 4차 검수(🔴 V4-1~V4-7) 반영 완료 — **P1a 구현 기준으로 쓰려면 V4-1~V4-5 공통 계약(소유권·배치·보안·시간)을 P0 안에서 닫고 코덱스 P0 종료 검수를 통과해야 한다**(`review_db-monitoring-design.md` "검수 결과(4차)").
- 근거 자료(고치지 않는 기록):
  - `./research_datadog-dbm-2026-10-22.md` — **Datadog DBM 화면·수집·운영 수치 전수 + 격차 표 G1~G38**(코덱스 협의로 G39~G49·정정 이력 추가). 반영표 **§15**
  - `../../../_archive/features/premium/db-monitoring/consult_datadog-gap_codex.md` — 코덱스(gpt-6.1-sol/high) 격차 판정·심층(G6·G7·G15·G23·G24·G26)·새 Q·공수
  - `./research_db-monitoring-2026-10-19.md` — Part A 상용 제품 8종 · Part B Zabbix 템플릿/OTel receiver/엔진별 뷰·권한 · Part C 국내 시장
  - `proposal_db-monitoring_codex.md` — 코덱스(gpt-6.1-sol/high) 독립 제안. 대조 **§14**
  - `./review_db-monitoring-design.md` + `_codex.md` — 검수 요청·결과. 반영 표는 요청서 하단
  - `./report_zm172-progress_2026-10-26.md` — **진행 보고(끝난 것/안 끝난 것/구조/검증법)** — "끝났나?"에 답하는 문서, 커밋마다 갱신
- 대상: `moveseye-be-spring`(폴러·저장·API) + `moveseyee_fe`(화면) + 배포 산출물(엔진별 최소 권한 SQL·보안 심사 문서)
- 관련: `devdesign_premium-edition.md` §5.9(대체됨)·P10·P17, `devdesign_apm.md` §2.4·§4.5, `devdesign_gpu-collection-paths.md`, `devdesign_apm-retention-policy.md`

| 버전 | 변경 | 사유 |
|---|---|---|
| v1 | 초안. JDBC 폴러 1차·Zabbix 상관/발견·OTel P5·엔진 4종 GA·메뉴 7·Phase P0~P4 | 사용자 지시 |
| v1.1 | 🔴 ①만료 시 폴러 정지(기존 커널 원칙 준수) ②마스킹을 엔진 정규화 텍스트에도 재검사·플랜 구조 파싱 ③식별 모델 분리(target/endpoint/node/namespace, fingerprint↔native 다대일, Zabbix 링크 테이블) ④lease·델타 checkpoint 실패 계약 ⑤`at=` 시차 계약·파티션 키·인덱스 ⑥보존 정합(락 48h·차원 TTL 분리) ⑦용량 전체 재산정(≈115~145GB, 예산 150~200GB) ⑧디스크 예산 자동 단축 금지→정책 내 동작 ⑨브리지 추출 범위·APM endpoint 관측 모델 신설 ⑩품질 축 3개·AAS 정의·상한 우선순위 ⑪TLS·타임아웃·2레인·인증 실패 분류·드라이버 업로드 통제 / 🟡 1초 조건=전체 예산·OTel P0 비교(R7)·SchedulerJob 근거 정정·공수 270~385 / §5.8 운영 계약 신설 / Q12~Q21 추가 / §14 공정성 보정 | 코덱스 검수(`review_db-monitoring-design_codex.md`) |
| **v1.2** | **Datadog DBM 대조** — 🔴 D13 **GA 자동 플랜 = Oracle·SQL Server 캐시 플랜만**(PG·MySQL 재계획은 GA 제외 → Q26; PG `EXPLAIN`도 문장 권한 검사·MySQL도 실행 권한 동일) · D14 **전용 DB 객체(함수·뷰·프로시저·XE 세션) 생성 없음** 문구 확정, "선택 패키지(승인 항목 3)" 제안 철회 · D15 **PG 수집 범위 분리**(Q 통계는 서버 전체 1회, namespace 작업은 선택 DB 기본 ≤10·예산) · D16 라이선스 상한 `maxDbTargets` 별도 클레임(Q22) / **GA 추가**: MSSQL 프로시저 통계(P2) · 기존 `system_health` 데드락 읽기(P2, 조건부) · 설정 스냅샷 승인 키(P1b) · Q `__other__` 총량(분모 조건) · MySQL 오류 카운터 · `LONG_QUERY` 규칙 · client IP·포트 구조화 · 알람 기준 정렬 · 클러스터 membership 최소 모델(P2) · MariaDB 별도 지원표 · Oracle 허용목록 객체별 추가(`V$ASM_DISKGROUP_STAT` 등) / **P3**: 스키마·인덱스 스냅샷(선택 DB·completeness) · 승인 키 SQL 주석 태그·서비스 귀속 · AG 이력·복제 토폴로지 화면 · Agent Jobs·백업 age · 진단 preset·Rows/Query 호스트 비교 / 정정: RAC `GV$`·system_health 권한(2022+)·PG DB별 접속·Oracle 플랜 통계 / Q22~Q30 / 공수 **299~405** / §15 반영표·부록 B 카운터 카탈로그 | `research_datadog-dbm-2026-10-22.md` + 코덱스 협의(`consult_datadog-gap_codex.md`) |
| **v1.3** | **§16 신설 — 인사이트 카탈로그 I1~I19**(질문 → 데이터 등급·테이블 → 화면 → 엔진 가용성 → Phase → 명시 한계) · **§16.2 수집 경로 역할 분담 한 표**(Zabbix 템플릿=집계치만, 폴러=C·S·Q·P·L, OTel은 DB 모니터링에 필수 아님) · **§16.3 고객 환경 종속성 매트릭스**(누가 준비·우리가 하는 것·미충족 시) · **§16.4 비범위 저장소 근거·재개 기준**(Redis=Zabbix 템플릿으로 충분·MongoDB=Tibero 다음 후보·ClickHouse) · **§16.5 보증하지 않는 것 10개 문구 규칙** · §0 포인터 · §10 포인터 · **Q31**(비범위 저장소 재개 — **신규 미결 제안**). **기존 GA 확정 범위·공수 합계 변경 없음.** 코덱스 3차 검수(🔴 R1~R10: I19 상태 혼용·I10 Oracle 데드락 확정·I16 태그 APM 제한·관리형 DB 포괄 약속·표준 프로필 가명화 OFF 신설·사전 점검 전부·Redis 종결/MongoDB 순서·견적·미사용 인덱스 후보·카운터 전부 15s·tracked SQL P1a) **전건 같은 날 반영** + I20~I28 보강 + 행별 완화 전건 | 사용자 질문 4건(설계 방식·Zabbix 외 경로 / 고객 환경 종속성·OTel 필요 여부 / Redis 등 다른 저장소 / 제공 인사이트)에 답한 내용을 설계 계약으로 고정. 3차 검수 `review_db-monitoring-v1.3_codex.md` |
| **v2.0 착수본** | **사용자 확정 6건(추천대로)** → **D17** Q22 `maxDbTargets` 별도 클레임(누락=제한 없음은 용량 판정에만·하향 갱신은 신규 활성화 거부+경고) · **D18** Q26 GA 플랜 Oracle·MSSQL 캐시 한정 확정(PG/MySQL 재계획 프로필은 고객 요구 뒤 별도 설계, GA 비범위) · **D19** Q27 PG namespace 기본 10 DB·대상 전체 300 tables·접속 1·DB당 3s·10분당 20s 확정, 전 DB 자동 활성화 금지, 50 DB는 규모 프로필 인증 뒤 · **D20** Q3/Q29 CDB/PDB P2 + **RAC P2 포함**(노드별 대상+membership+`BLOCKING_INSTANCE/SESSION`·unresolved 허용, "완전 지원" 선언은 R10 뒤) · **D21** Q12 **원격 실행형 수집기(J2) GA 편입**(망분리 금융 1차 타깃 전제) — §3.6 신설, P3 WS-27, GA 공수 **324~440** · **D22** Q13 만료 정책 = 폴러 정지 확정 + **GA는 현 커널 그대로(만료 시 `/dbm/**` 조회 차단)**, 과거 조회 허용은 별도 결정 세션(비차단) / §17 착수 계획(P0 체크리스트·시험 환경·코드 골격·첫 스프린트·DoD) / Q32·Q33(수집기 배포 형태·자격증명 보관) 신설 / §13 확정 표기 | 사용자 지시 "Q22 Q26 Q27 Q3 Q12 Q13 추천대로 확정하고 v2 착수본 써" |
| **v2.1** | **코덱스 4차 검수 🔴 V4-1~V4-7 반영** — §3.6 J2 표 전면 보강(실행 허가·설정 전파·lease API·멱등/ACK/checkpoint·키 수명주기·전송 전 보호·시간 축·수신 실패 분류·백프레셔·늦은 데이터·원격 작업·로그 보호, 🧪 = P0 시험 가정) · D17 적용 조건·값 의미·subject · D20 "모의 시험≠RAC 인증, 지원표 미인증·PoC" · D21 전제 출처 구별·외부 의존 5종 · D22 J2 허가 만료 정지 · **Q34**(J2 `keep_raw_sql`) 신설 · §17.1 P0 종료 = R1~R11 각각 판정표+차단 게이트(미실시≠통과), R별 기준을 §11과 동일하게 · §17.4 DoD(P1a 공통 계약·P2 RAC 3단 분리·P3b 엔진별·P4 HA J1 한정) · §17.6 기한 앞당김(Q7·Q8·Q10·Q19·Q30·Q33 → P1a 전) · 확정 Q의 잔존 "미결" 표현 정리(D16·D13·D15·§4·§4.4·§5.5·§5.8·§9·§10·§16.3·§16.5·WS-26) · §0.1/§12 P0 R11·P1b 11종·P4 원격 항목 · §16.3 J1/J2 설치 문구·I6 J2 원인·§16.5 11~13 | 코덱스 4차 `review_db-monitoring-v2.0_codex.md` — "P0 조건부 가능, P1a 기준은 공통 계약 닫은 뒤" |
| **v2.2** | **ZM-172 첫 코드 커밋의 코드 검수(5차) 반영** — §4.2 필수(S·C·L)/권고(Q·P) 등급 명시 · §5.5 서버 문자열 설정 옵션·모호 숫자 폐기 · §17.2 `engine-api` 무수정 범위 정정(`common/exception` 공용 enum 예외) · D17 발급기 "DB_MONITORING 보유 키는 상한 필수, 미보유 키는 미탑재, 무제한 신규 키 없음" | 코덱스 5차 `review_zm172-code1_codex.md`(🔴17·🟡15) — 코드 2차 커밋과 함께 |
| **v2.3** | **P0 착수 — Q9 로컬 Docker PG 16(5436) 결정·R1-PG 실측·§17.1 순서 2 계약 시험본(`contract_db-monitoring.md`)·WS-2 코어 폴러 프레임** — §17.7 P0 진행 판정표 신설(R1-PG 통과·R3 fixture 71건·R11 코어 경계 메모리/파일 구동 증명 통과, 나머지 미실시 명시). 코어 `runtime/`(스레드 없는 `tick(Lane)`·lease 10s 갱신·epoch/seq 소비 규칙·CONFLICT 즉시 중단·RETRY_LATER checkpoint 비전진·FAILED 배치)·`local/`(InMemory lease/writer/checkpoint·`FileCheckpointStore` 원자 교체·ManualClock). lease 규칙 보강: **비어 있는 lease는 누가 가져가든 새 epoch**(같은 run이 TTL을 넘겨 돌아와도), 같은 epoch 재획득은 seq 유지. `ConfigSource.TargetConfig`에 `endpoint{host,port,database,tls}` 추가. R1 소견: 기본 설치 `pg_stat_statements.max=5000`은 권고 미충족(RECOMMENDED)으로 바로 보인다 → 지원표에 10000 권고 명시 **코덱스 6차(코드·계약) 🔴18·🟡17 반영**: 배치+checkpoint 한 commit(`BatchWriter.write(batch, checkpoint)`), 레인 격리(잠금은 lease·seq 예약만), §5.2 lease 정본 개정(규칙 7개·`lease_run_id`·`lease_epoch`·SQL 표기), §5.4 연속성 옵션·seq 범위 정정, 구조화된 거부 사유(`WriteResult.Reason`)와 중단 범위(격리·정지·거부), AUTH 정지·지수 백오프, observed_at=채집 시작 경계, 품질 `status`·`elapsedMs`, 파일 checkpoint fsync·CRC·LoadState, 시계 2종(wall/monotonic). 계약 시험본 §0 관리/J2 분리·§1.3 사유표·§3 jobs=config·EXPIRED 창 미결 명시 **코덱스 7차(재검수) N1~N16 반영**: 메모리 writer checkpoint 선저장(둘 다 아님), payload SHA-256, 소유권 참조(`ownership`) 분리 반납, writer 거부 유지(새 configVersion까지), AUTH 즉시 정지 게시·접속 직전 재검증, 실행 세대(`generation`), 대상별 현재 시각, REJECTED/CONFLICT 사유 필수(생성자 불변식), 쓰기/접속 백오프 분리, 관측 시각 override 제거, Policy 불변 복사, 늦은 결과의 lease 덮기 차단, halt 중 미반납 정리 **코어 모듈 분리(2026-10-26, 사용자 결정)**: `premium.dbm.collector.core` 패키지(36 파일) → Gradle 모듈 `dbm-collector-core`(**프로덕션 의존 0** — Spring·JPA·PG 드라이버 import는 컴파일 실패, app은 compile 의존, bootJar `BOOT-INF/lib`에 포함, Dockerfile COPY 2줄). ArchUnit을 둘로: 모듈 3규칙(코어 패키지만·allowlist `java..`·`javax..`·core·스레드/실행기 생성 금지) + app 2규칙(masking·`local` 시험 구현 직접 사용 금지). §3.6 "P3b 물리 분리"는 P0 완료로 정정, WS-27 ①은 "J2 패키징이 모듈 jar 소비"로 축소. 모듈 테스트 124건·app 2건 통과. 코드 로직 변경 없음. **코덱스 8차(gpt-6-astra, 사용자 지정) 🔴 V8-1~V8-4·🟡 V8-5~V8-8 반영**: writer payload **정규 직렬화**(타입 태그+길이 접두 — 해시 전 문자열 충돌 차단), 설정 스냅샷 적용을 **실행 세대 검증과 한 잠금(`control`)**으로(옛 응답이 새 거부를 못 지움), **kind마다 채집 시작 직전 허가 재확인**(`permitted` — ACK 대기 중 만료·정지면 다음 SQL 안 보냄), AUTH 자동 재개는 **정지 세대 일치 + 버전 증가**일 때만(옛 버전 늦은 실패는 정지 안 만듦), 늦은 결과는 `sameLease`일 때만 실패 횟수·백오프 변경, 모듈 ArchUnit은 main 출력 **전체** import + 실행기 규칙을 "생성·팩터리·*Async·실행기 타입"으로 정밀화(interrupt 복원 허용), 계약 §1.2/§1.3/§4·BatchWriter Javadoc(ACK별 durable 의미) 정렬. 테스트 128건 | 2026-10-23 · 10-26 |
| **v2.4** | **WS-2 J1 PG 구현 + Flyway V90(2026-10-26)** — `premium.dbm.collector.j1`: `PgLeaseClient`(§5.2 규칙 1~5를 UPDATE 한 문장·DB `now()`로)·`PgBatchWriter`(대상 행 `FOR SHARE` 소유권 검증 → `ON CONFLICT DO NOTHING RETURNING` 멱등 INSERT → 행 jsonb → checkpoint UPSERT, **한 트랜잭션 REQUIRES_NEW**)·`PgCheckpointStore`. V90 표 7개(`dbm_target`·`dbm_endpoint`·`dbm_credential`·`dbm_capability`·`dbm_sample_batch`·🧪`dbm_sample_row`·`dbm_delta_checkpoint`), 시각은 timestamptz. payload 다이제스트는 코어 `spi.BatchPayloadDigest`로 공용화(J1·J2·메모리 writer 같은 함수). `DbmJ1PgStoreIT` 7건(실 PG, V1~V90 전량 Flyway). ZM-172를 master `5d677e3`에 rebase(충돌 없음), app ArchUnit을 `ProductionClasses.get()`으로 + "spi 구현은 j1 패키지" 규칙 | 사용자 "진행해" — 3차 커밋 뒤 다음 단계 |
| **v2.5** | **보존 규칙 재정의 + APM 공통 구현체 추출(2026-10-27)** — 사용자 결정 "APM·Zabbix와 같은 계단으로 뭉치고 기본 보관 일수를 정한다": §6.1 보존 열 전면 재정의(세션·락 원본 **2일** → 1m **7일** → **5m 30일(계단 신설)** → 1h 추세 **400일** → 사건·알람·감사·차원 **400일**), 추세 표 열 구성 count·sum·min·max·sample_count(APM `apm_metric_1h`·Zabbix trends 격) · §6.2 재산정(50대상 ≈85~90GB, 10대상 ≈20GB) · **§6.3 디스크 예산 정책 삭제**(상한 GB·최소 보장 일수·수집 자동 완화·사건 구간 파티션 보호 — "APM에 없고 자동 단축을 안 하면 코덱스 🔴8 지적 자체가 사라진다"; 대체 = 사용량 표시·설치 가이드 디스크 감시·공용 디스크 가드 백로그·P3 증거 내보내기) → §6.3은 **보존·정리 메커니즘** 절로 · D23 · Q18 종결·Q35 신설 · WS-10 범위 축소 · 코드: APM `ApmPartitionService`·`ApmRetentionPolicy`·`ApmRetentionJob`의 구현체를 `premium.common.partition.DailyPartitionService`·`common.retention.{RetentionOptions,SchedulerOptionsReader,RetentionStepRunner}`로 추출(APM은 껍데기, 공개 API·테스트 불변) + DBM `premium.dbm.retention.{DbmRetentionDays,DbmRetentionService,DbmRetentionJob}` + **V91 `dbm_retention` 시드**(V90 표 DELETE: 배치 7일·checkpoint 30일 — `dbm_sample_batch` 무한 증가 리스크 해소) + ArchUnit(dbm↛apm·common↛기능·공통 DROP 호출처 고정) | 사용자 질문 "보관 규칙도 정의했음?"→"APM·다른 서비스 정책과 동일하게"→"디스크 예산 넷은 냉정히 필요한가"→"보관 의무가 있으니 추세로 뭉치고 기본 일수"→"공통 구현체 두고 확장해서 DBM도" (2026-10-26~27) |
| **v2.6** | **WS-2 잔여 — J1 구동 조립(2026-10-27)**: `premium.dbm.collector.DbmPollerManager`(노드 1개, fast/slow 레인 스레드 각 1, `SmartLifecycle` — 종료 시 lease 반납, 레인별 tick 통계, 거부/halt 전이 로그·예외 60s 1회) · `collector.j1.PgConfigSource`(`dbm_target`+`dbm_endpoint` owner_kind=BE를 30s 캐시, `configVersion`=행 내용 SHA-256 16자, **라이선스는 매 호출** — FULL 아님 `LICENSE_EXPIRED`·기능 없음 `FEATURE_DENIED` 거부 스냅샷(D22), 조회 실패 시 이전 스냅샷 유지, 정책은 `DbmPollerProperties` 기본값 해시 버전) · `collector.j1.CodecSecretResolver`(캐시 없음 — 버전 증가가 다음 접속에 보여야 AUTH_FAILED 자동 재개 성립, 복호화 실패 null+WARN 1회) · `DbmPollerProperties`(`app.dbm.poller.enabled/auto-run/fast-tick-ms 1000/slow-tick-ms 2000/config-ttl-ms 30000/approved-tag-keys/max-sql-text-chars 4096/keep-raw-sql`) · `GET /dbm/poller/status`(계약 §1.9) · ArchUnit "`CollectorRuntime` 조립은 `DbmPollerManager`만". §5.1 모델 중 **대상별 워커·Hikari ×2 풀은 아직**(tick마다 접속 1개, WS-1) · §5.2 ① `scheduler_setting(dbm_poller)` 행은 WS-4로(`SchedulerManager`가 bean 없는 행에 기동 WARN) · 디스크 큐는 J2(P3b)로 확정(J1은 우리 PG가 죽으면 lease도 30s 안에 끊겨 버퍼가 할 일이 없다). IT 12건(실 PG, 라이선스 비활성→거부·전부 반납·재허용 새 epoch 포함) | 사용자 "ㅇㅇ ㄱㄱ" — 5차 커밋 뒤 WS-2 잔여 착수 |
| **v2.7** | **WS-3 1단계 — PG 어댑터(2026-10-27)**: 코어 `adapter/pg/PgEngineAdapter`(PG 12+, J1·J2 공유) — S `PgSessionCollector`(§5.3: idle 제외·idle blocker 포함·상한 1,000 결정적 우선순위·`pg_blocking_pids`·client 구조화·세션 키 `pid+backendStartMs`), L `PgLockCollector`(대기 락 → waiter→blocker 간선, 관계 이름은 접속 DB oid만), C `PgCounterCollector`(부록 B 최소 가족: `pg_stat_database` 합·bgwriter/checkpointer(17)·WAL(14+)·archiver 누적 차분 + 세션 상태별·락·max_connections 게이지, 메트릭 `pg.<뷰>.<열>`), Q `PgQueryStatCollector`(§5.4: 서버 1회 스캔 500 → native `(dbid,userid,queryid,toplevel)` 차분 → Top 50 + `__other__`(otherComplete·scanCapped·excludedNatives·dealloc), 리셋 두 겹 — native 단위 제외 / `stats_reset`·절반 이상 감소는 전역 baseline). 텍스트 보호는 `PgSqlText` 한 지점(마스킹·절단·`<insufficient privilege>`·설정 미확인 시 해시만). **S↔Q 연결 키 = `query_id`(14+)**, fingerprint 아님(Q 텍스트는 `$n` 정규화라 S와 다름). 노드 = `inet_server_addr:port`, boot epoch = `pg_postmaster_start_time`. 앱 `DbmAdapterConfig` 빈. 검증: 코어 LiveIT 4(실 PG16 — 다른 접속 SQL이 세션 행, advisory lock 간선+idle blocker, C·Q baseline→델타)·단위 8, 앱 `DbmPollerManagerIT.realTargetCollects` **한 tick에 4 kind 적재**(J1 end-to-end 첫 성공). 행은 아직 `dbm_sample_row` jsonb — typed 표·파티션·롤업은 WS-3 2단계 | 사용자 "계속 진행" |
| **v2.8** | **WS-3 2단계 — typed 파티션 표(2026-10-27)**: V92 `dbm_typed_tables` — 차원 `dbm_query_dimension`(fingerprint UNIQUE·텍스트 400일 뒤 NULL)·`dbm_dimension_text`(USER/DB/CLIENT_ADDR/CLIENT_HOST/APPLICATION, 대상 스코프)·`dbm_query_native`(`(dbid,userid,queryid,toplevel)`·`__other__`) + 사실 `dbm_session_sample`(PK observed_at·batch_id·pid, query_dim_id·query_id·차원 id·blocker_pids[])·`dbm_lock_edge`·`dbm_metric_1m`(count·sum·min·max, 쓰기 시 분 UPSERT)·`dbm_query_stat_1m`(PK bucket·target·native, µs 합, `__other__` 행만 완전성 플래그) 일 RANGE 파티션 · 🧪`dbm_sample_row` DROP · `dbm_retention` options에 `sessionRawDays 2·metric1mDays 7·queryStat1mDays 7·dimensionIdleDays 400`(기존 값 보존). 코드: `premium.dbm.store.DbmPartitionService`(공통 껍데기, 표 4개, writer 그날 보장 + 잡 선생성 D+2, DROP은 잡만 — 아카이브 게이트 ArchUnit 등재)·`collector.j1.PgTypedRowStore`(행 키→열 한 곳, 배열 unnest UPSERT, writer 트랜잭션 안)·`DbmRetentionJob` 단계 6개. §6.1 보존 계단의 원본 2일·1m 7일·차원 400일이 **실제로 지워진다**(IT). 사실 표 FK 없음(대상 삭제 CASCADE 폭주 방지), 파티션 날짜 = JVM TZ(pgjdbc 세션 TZ 일치 — 노드 TZ 통일 전제). 5m/1h 표·롤업·`dbm_activity_1m`·DROP 워터마크 가드는 WS-10 | 사용자 "ㅇㅇ ㄱㄱ" |
| **v2.9** | **WS-1 — 대상 관리 API(2026-10-28, 10차 `5490711`)**: `premium.dbm.target.DbmTargetAdminService`(V90 표에 쓰는 유일한 관리 경로 — 등록 `enabled=false`·수정·삭제·자격증명 저장(`credential_version` DB 값 기준 +1, `credential_status=OK`)·저장된 자격증명 권한 검사(`dbm_capability` UPSERT)·**활성화 admission(D17)**: 자격증명 → 상한 사전 판정 → 접속·권한 검사(잠금 밖) → 필수 S·C·L → `pg_advisory_xact_lock` 안 재판정 → `enabled=true`; 거부는 성공 응답 `activated=false`+`reason`) · `store.DbmSecretCodec`(**`enc:v2:<keyId>:` 형식 도입** — 키 ID = 키 SHA-256 앞 8 hex, v1 읽음, 평문 거부; `CodecSecretResolver`가 이것을 쓴다) · `LicenseStatus.maxDbTargets`(커널 record에 필드 추가, 용량 판정에만) · `api.DbmTargetAdminController`(`/dbm/targets` CRUD·`/{uid}/credential`·`/{uid}/check-capabilities`·`/{uid}/activate`·`/{uid}/deactivate`·`/dbm/license/usage`, 관리자 한정 유지) · `ErrorCode` `DBM_NOT_FOUND`·`DBM_CONFLICT`. 저장마다 `PgConfigSource.evict()`(이 노드 즉시·다른 노드 ≤30s). 미포함: `DBM_ADMIN` 역할 좌표(WS-4, 역할 JSON 백필·FE 키와 함께)·`dbm_audit`·폴러 전용 풀·Zabbix 발견. IT 14건(MockMvc 9 + admission 5, 실 PG16 활성화 end-to-end 포함) + 코덱 단위 5 | 사용자 "ㅇㅇ ㄱㄱ 작업 착수" — 코덱스 9차 검수(🔴 N1~N9)와 병행, 반영은 결정 뒤 |
| **v2.10** | **안정화(2026-10-28, 9차 `03e2d97`, 코덱스 9차 🔴 반영)**: N2 `CollectorRuntime.shutdown()`이 세대 +1·`closed`로 새 tick 차단, `reopen()`(폴러 `start()`가 부름) · N3 `PgTypedRowStore` 차원 UPSERT 배열을 키 정렬(`TreeMap`), 카운터 1m 행도 metric 순 · N4 PG14+ Top SQL 스캔을 `toplevel=true`만(`__other__.nestedSeparated`) · N5 `__dealloc` checkpoint·사라진 native·dealloc 증가 → `otherComplete=false`(`assess`, `vanishedNatives`·`deallocDelta`) · N8 `PgBatchWriter` 파티션 보장을 `PROPAGATION_NOT_SUPPORTED`로(바깥 tx suspend) · N9 차원 DELETE에 사실 표 `NOT EXISTS`. 이월: N1(`now()` 잠금 대기 — 계약 §1.5 전제), N6·N7(V93, WS-10). 테스트 코어 142 + 앱 DBM 62 + ArchUnit 17. | 사용자 "A"(안정화 먼저 → WS-1 커밋) |

---

## 0. 한눈에 보기

**한 줄 요약**: DB 서버에 **아무것도 설치하지 않고**, MovesEye BE 안의 JDBC 폴러가 모니터링 전용 읽기 계정으로 DB에 접속해 **활성 세션(5초)·대기 이벤트·Top SQL·락 트리·실행계획·인스턴스 카운터**를 수집한다. 데이터는 우리 PostgreSQL에 저장하고, **과거 시점 재생**(상세 2일·분 집계 30일·시간 추세 400일)으로 "그때 누가 무엇을 기다렸나"에 답한다. 호스트 OS 지표는 기존 Zabbix 호스트와 연결해 같은 타임라인에 겹치고, 느린 APM 트랜잭션에서 DB 부하로 내려간다. **고객이 묻는 질문별로 "무엇을 어느 Phase에 어떤 한계로 답하나"는 §16(인사이트 카탈로그 I1~I19)**, 고객 환경이 갖춰야 할 것은 §16.3.

```
[고객 DB들]                        [MovesEye BE — premium/dbm/]                              [화면]
Oracle (V$만, 팩 객체 금지) ─┐     JDBC 폴러: 대상별 워커, fast 레인(세션 5s·락 10s)         DB 개요 · 인스턴스 상세
SQL Server (DMV)           ┼─TLS─► ├ slow 레인(카운터 15s·SQL 누적 60s·플랜 on-demand)        SQL 분석 · 성능 분석(과거 시점)
MySQL/MariaDB (P_S)        │        ├ 정규화·마스킹(저장 직전 재검사)·델타 checkpoint·lease     잠금 · 알람 · 관리(/setting)
PostgreSQL (pg_stat_*)     │        └ 배치 writer → PG dbm_* (파티션·1m/1h 롤업)
Tibero (V$ 변형, 확장)    ─┘                 └─► 알람 규칙 → outbox → 배달 어댑터(Zabbix 트래퍼 전송기)
                                            ▲                              ▲
[기존 Zabbix 호스트] ── 호스트 OS 지표·DB 템플릿 호스트 발견 ───┘   [APM] 서비스↔endpoint 관측 ── 시간 상관
```

**핵심 결정 12 (v1.1 보정 포함)**

| # | 결정 | 한 줄 근거 | § |
|---|---|---|---|
| D1 | 심층 데이터(세션·SQL·락·플랜)는 **BE 내장 JDBC 폴러**. DB 서버 설치 0 | Zabbix 템플릿은 전 엔진 집계치만(Part B) · 국내 1차 질문 "DB 서버에 뭘 깔아야 하나"(Part C §6) · 국산 DB 전부 JDBC 보유 | §3 |
| D2 | 카운터(C)도 폴러가 수집. Zabbix는 **호스트 OS 지표 상관·DB 호스트 발견·알람 배달**. 폴러 미등록 호스트엔 **"Zabbix 카운터 개요 모드"**(C만, P3 선택) | 이중 저장 회피 + 기존 Zabbix 템플릿 고객의 가치 보존(코덱스 공정성 1) | §3.4 |
| D3 | OTel Collector DB receiver는 **P0에서 PG receiver 비교 실측(R7) 후** 프로필 시기 확정. 기본 운영 경로는 JDBC 하나 | events `development`·Oracle alpha·국산 DB 없음 — 그러나 **검증 없이 유예 확정은 안 함**(🟡2) | §3.5 |
| D4 | 세션 샘플 기본 **5초**. 1초는 **전체 적재 예산(행/초·디스크·수집 지연)** 안에서만, 또는 30분 한정 진단 프로필 | 세션 평균 50 조건은 불충분(50인스턴스×50×1s=일 2.2억 행, 🟡1) | §5.3 |
| D5 | Oracle 기본 패키지는 **객체별 허용목록**(`V$SESSION`·`V$SQLSTATS`·`V$SQL_PLAN`·`V$SYSMETRIC`·`V$TRANSACTION`·…). ASH·`DBA_HIST_*`·AWR·`V$SQL_MONITOR`·`DISPLAY_AWR` 호출 금지. "V$면 안전" 같은 포괄 문구 쓰지 않음 | 팩 미사용은 **실제 호출 기능**으로 판단(코덱스 🟢) | §4.1 |
| D6 | SQL 텍스트는 **엔진 정규화 여부와 무관하게 저장 직전 방언별 검사**를 통과해야 저장. 실패=텍스트 폐기(해시만). 플랜은 **구조 파싱**(cost·rows 보존, 상수 제거). 바인드 노출 경로(`PEEKED_BINDS` 등) 금지 목록 | 엔진 정규화는 그룹핑 기능이지 보안 경계가 아님(🔴2) | §5.5 |
| D7 | 비밀번호는 기존 `SettingSecretCodec`(AES-256-GCM) **암호화 구현 재사용 + 키 운영(교체·백업·복호화 실패 진단) 추가 설계** | 현 Codec엔 key ID·복수 키 복호화가 없음(공정성 5) | §5.6 |
| D8 | 식별 모델 **4층 분리**: 논리 대상 UUID(`dbm_target`) / 접속 endpoint / 관측 물리 노드(`boot_epoch`) / DB·PDB namespace. SQL은 표시용 fingerprint ↔ 엔진 native id(dbid·userid 문맥 포함) **다대일**. Zabbix 링크는 `(datasource_id, hostid, role)` 별도 테이블 | VIP 전환·PDB·`search_path`로 인스턴스 수명≠통계 수명(🔴3) | §6.1 |
| D9 | 알람 = 규칙 → `dbm_alert_event` → outbox → 배달 어댑터. 1차 어댑터는 APM 브리지에서 **Zabbix 트래퍼 전송기(`history.push`·객체 소유·드리프트·캐시 대기)만 추출**한 중립 컴포넌트. APM 규칙 관리는 그대로 | 브리지 1,700행이 APM 규칙·binding에 결합(🔴9) | §7 |
| D10 | `Feature.DB_MONITORING` 단독. **만료(`EXPIRED`)부터 폴러 정지**, 롤업·정리만 계속. `/dbm/**` 조회는 기존 커널(`LicenseStatus`)이 거부 — 만료 후 과거 조회·내보내기 허용 여부는 Q13 → **D22 확정(GA는 차단 유지, 허용 검토는 별도 세션)** | `SchedulerJob.requiresActiveLicense` 원칙·P17 `allowsLiveQuery`는 Zabbix 값 **조회** 권한(🔴1) | §9 |
| D11 | 자동 조치 없음(Kill·인덱스·SQL 변경 1차 제외). 고객 SQL 재실행 없음 — **GA에서 `EXPLAIN` 재계획도 수행하지 않음**(v1.2: D13으로 대체, 캐시 플랜만 읽음) | 권한 심사 통과가 영업 속도 | §10 |
| D12 | 과거 시점 재생 필수: **상세(세션·락) 48h 동일 창**, 1m 7일·5m 30일 집계는 **대기→SQL→사용자**까지(세션 복원 아님) | 보존 창 정합(🔴6) | §8.3 |
| **D13** 🆕 | **GA 자동 실행계획 = Oracle(`V$SQL_PLAN`)·SQL Server(`dm_exec_query_plan`) 캐시 플랜만.** PostgreSQL·MySQL/MariaDB의 재계획(`EXPLAIN`) 수집은 GA 제외 — 별도 "DB 변경 프로필"(SECURITY DEFINER 함수/프로시저 또는 업무 테이블 읽기 권한)로 — Q26 → **D18 확정(GA 제외, 후속 설계·일정 미정)** | PG `EXPLAIN`(ANALYZE 없이)도 `ExecCheckPermissions`로 그 문장이 요구하는 테이블 권한을 검사한다(PG17 소스, 코덱스 확인) · MySQL `EXPLAIN`은 문장 실행 권한과 동일 · 임의 SQL을 받는 권한 상승 함수는 "모니터링 읽기 계정" 이상을 위임 · 캐시 플랜도 그 실행의 actual rows를 보장하지 않음(estimated/actual 구분) | §4·§4.4 |
| **D14** 🆕 | GA 전제 문구: **"MovesEye 전용 함수·뷰·프로시저·XE 세션을 고객 DB에 만들지 않는다."** ("DB 측 객체 0개"라고 쓰지 않음 — `pg_stat_statements` 확장·P_S consumer 설정은 고객 측 전제다.) 전용 XE 세션(완료/에러, 데드락), consumer 자동 토글 프로시저는 GA 비범위(**Q26·Q28**) | Datadog은 세 엔진에서 전용 객체(PG 함수 2·MySQL 프로시저 2·Oracle `dd_session` 뷰·MSSQL XE 0~3)를 요구한다. 우리는 1차 제안 "선택 패키지 = 승인 항목 3번째"를 **철회**(별도 승인 경로를 만드는 제품 결정이고 기본 OFF로 심사·취약점 책임이 줄지 않음 — 코덱스) | §1.4·§4 |
| **D15** 🆕 | **PG 수집 범위 분리**: Q 통계·대표 텍스트는 확장이 설치된 **한 DB 접속으로 서버 전체** 조회. DB별 접속은 relation·인덱스·스키마·OID 해석·relation 크기(**namespace 작업**)에만. 발견≠수집 — 기본 수집 DB **≤10**(초과는 규모 프로필 — Q27 → **D19 확정**), 대상당 namespace 접속 1(총 3), DB당 예산·순회 총예산·cursor 이어가기 | 1차 안의 "DB마다 접속" 전제는 오류(`pg_stat_statements` 문서). 50 DB 직렬 순회는 장애 시 분 단위로 늘어남 | §4.5·§5.8 |
| **D16** 🆕 | 라이선스 상한은 **`maxDbTargets` 별도 클레임**(활성 논리 대상 단위: PG 인스턴스=1·CDB+PDB=1·RAC 노드별·primary/standby 각각·DOWN/AUTH_FAILED도 계산·후보/비활성 미계산). `maxHosts` 의미 불변. 상업 entitlement와 기술 admission(연결·행/초·디스크)은 혼합 금지. 채택·호환 정책은 Q22 → **D17 확정** | Datadog은 식별자당 과금. 현 `LicenseClaims.MAX_HOSTS`는 자리만 있고 강제·표시 없음 | §9 |
| **D17** v2 | **Q22 확정**: `maxDbTargets` 클레임 **채택**. 신규 발급 키는 명시 필수(발급기 입력 필수 항목). **기존 키에 클레임이 없으면 "제한 없음"으로 읽되, 그 해석은 대상 수 용량 판정에만 적용**(상태·Feature·만료 게이트는 커널 그대로 — B6). **하향 갱신**(새 키의 상한 < 현재 활성 수): 기존 활성 대상은 **유지**(운영 중단 금지), `OVER_LIMIT` 경고 배너+알람 `LICENSE_LIMIT`, **신규 활성화만 거부**. 초과 처리: 활성화 요청 시 원자적 검사(HA 동시 요청 포함)·거부 이유 응답·관리 화면 허용/사용 수. **(v2.1) 적용 조건: 현재 라이선스 상태와 `DB_MONITORING` Feature가 수집을 허용할 때만** — 상태·Feature·만료 게이트가 먼저고 "기존 활성 유지"는 그 뒤의 용량 판정이다. `OVER_LIMIT`는 DBM 용량 상태이며 `LicenseStatus`를 바꾸지 않는다. 값 의미: **클레임 누락**(기존 키)=제한 없음 · `0`=활성화 전부 거부 · 음수·명시적 null·비정수(문자열·소수·boolean·배열)·int 범위 초과=키 거부(`INVALID_CLAIM`; java-jwt `asInt()`는 이것들을 null/절삭으로 통과시키므로 원시 JSON 타입을 검사 — 코덱스 5차 #15). **발급기(v2.2)**: DB_MONITORING을 보유하는 키(PREMIUM 기본·추가 기능)는 신규 발급 시 상한 **입력 필수**(무제한 신규 키 없음), 미보유 키에는 클레임을 싣지 않음(#16). 재활성화는 활성 수에 다시 셈, J1↔J2 이동은 ±0. 라이선스 교체와 활성화 요청은 같은 PG 잠금 안에서 직렬화. 상한 복귀 시 배너·알람 자동 회복, 거부 이벤트는 대상×시간 창으로 중복 억제. `LICENSE_LIMIT` subject는 **설치본 단위**(Zabbix 키 `dbm.license_limit`, `target_uid` 없음 — §7.2 키 규칙의 예외로 명시) | 사용자 확정(추천대로). 코덱스 4차 B3·A-D17 반영. 발급기·BE 4파일 사본 규칙: `LicenseClaims`만 변경, enum 3개 불변, 양쪽 `LicenseContractTest` 갱신 | §9·WS-26 |
| **D18** v2 | **Q26 확정**: GA 자동 플랜 = Oracle·SQL Server 캐시 플랜 **한정**(D13 확정). PG·MySQL/MariaDB 재계획 "DB 변경 프로필"(SECURITY DEFINER 함수 또는 업무 테이블 읽기 권한)은 **GA 비범위, 고객 요구가 확인된 뒤 별도 설계** — 이 문서에 자리만 남기지 않는다(비범위 §10). 화면·지원표·마법사 문구는 §16.5-3 | 사용자 확정 | §4.4·§10 |
| **D19** v2 | **Q27 확정**: PG namespace 기본 **10 DB** · 대상 전체 **300 tables** · 테이블당 50 cols · namespace 접속 **1** · DB당 **3s** · 순회 총예산 **10분당 20s** · 전역 동시 namespace 작업 수 제한. **전 DB 자동 활성화 금지**(신규 DB는 후보로만). 50 DB는 **규모 프로필**(상한·접속·예산 별도 세트)을 P4에서 인증한 뒤 | 사용자 확정. 숫자는 R4 실측으로 조정 가능(계약은 "기본값+관리자 조정+상한"의 구조) | §4.5·§5.8 |
| **D20** v2 | **Q3/Q29 확정**: CDB/PDB **P2**. **RAC P2 포함** — 방식은 **노드별 대상**(`V$`만) + 클러스터 membership(§4.6, Oracle `DB_UNIQUE_NAME` 동일) + 원격 blocker `BLOCKING_INSTANCE/SESSION` 표기 + 조인 실패 `unresolved`. **`GV$` 불필요·"RAC 완전 지원" 선언은 R10 결과 전 금지**, GA 지원표 문구는 "RAC: 노드별 수집, 노드 간 blocker는 해석 가능한 범위에서 연결(unresolved 가능)". 제한적 `GV$` 보강은 R10에서 **오조인 0·unresolved 사유 분류·추가 권한·조회 비용**을 함께 보고 판단. **(v2.1) 독립 인스턴스 2개·fixture 시험은 조인 로직 검증이며 RAC 인증이 아니다 — 실제 RAC 검증 완료 전 지원표는 "RAC: 미인증·PoC 대상", 인증된 버전·구성만 등재** | 사용자의 "추천대로"에 따라 조건부 추천의 포함안을 v2 범위로 채택(금융 Oracle이 실제 GA 타깃인지는 별도 확인 — 설계 선택과 고객 사실의 출처를 구별). 시험 환경 부재가 리스크 → Q9 VM에 독립 인스턴스 2개(조인 로직만), 실 RAC는 고객 PoC·P2/P4 게이트 | §4·§4.6·R10 |
| **D21** v2 | **Q12 확정**: GA 지원 토폴로지 = **BE→DB 직접 접속(J1) + 원격 실행형 수집기(J2)**. J2 = J1과 **같은 수집 코어**를 별도 프로세스(systemd/Windows 서비스)로 포장, 수집기→BE **단방향 HTTPS**(pull 설정·push 배치), 전용 토큰, 마스킹은 **수집기에서 저장 직전 검사**(원문이 망을 건너지 않음). 설계 §3.6, 공수 **+25~35**(**P3b** WS-27 + P0 R11·P4 검증 포함 — 동일 코어 재사용을 가정한 기존 계획상 증분 추정이며 P0 종료 때 R11·P3b·P4 분해 뒤 재확정), **GA 324~440**. **(v2.1) J1과 J2의 실행 위치·제어·복구 차이는 §3.6에 명시하며, 공유 코어의 외부 의존은 writer 외에 lease·checkpoint·설정·비밀정보·시간 인터페이스로 분리한다** | 사용자의 "추천대로"에 따라 조건부 추천("망분리 금융이 1차 타깃이면 GA 포함")의 포함안을 v2 범위로 채택. 망분리 금융의 실제 고객 우선순위·보안 요구는 별도 확인(Q33·Q34). 코덱스 1차 제안·공정성 3 수용 | §3.6·§12 |
| **D22** v2 | **Q13 확정**: 만료(`EXPIRED`)부터 **폴러·수집기 정지 확정**(D10). **GA는 현 커널 그대로** — `EXPIRED`에서 `Feature.DB_MONITORING` 거부 → `/dbm/**` 조회·내보내기도 차단, 롤업·정리만 계속. **만료 후 과거 조회·내보내기 허용**은 프리미엄 설계 P10·P17·`LicenseStatus` 개정이 필요한 **별도 결정 세션**(이 문서에서 결정하지 않음, GA 비차단). **(v2.1) J2**: 기존 Feature 거부 응답을 수집기 프로토콜의 구조화 사유(`LICENSE_EXPIRED` 등)로 매핑하되 그 응답은 자격증명·실행 설정을 담지 않는다. 수집기는 **유효기간이 있는 실행 허가**(lease, §3.6)로 돌며 갱신에 실패하면 허가 만료 시 폴링을 중단한다 — 통신 불가 상태에서도 허가 만료 뒤 DB 폴링을 계속하지 않는다. 토큰 폐기는 BE의 수신·설정 발급을 즉시 차단하고, 원격 중단의 최대 지연은 허가 유효기간으로 한정 | 사용자 확정(추천대로). 커널 원칙을 설계서 한 줄로 예외 처리하지 않음(원칙 8). 코덱스 4차 B5 | §9·§3.6 |
| **D23** v2.5 | **보존은 APM·Zabbix와 같은 계단·같은 메커니즘**: 원본(세션·락 샘플) 2일 → 1m 7일 → 5m 30일 → 1h 추세 400일(min·max·sample_count 포함) → 사건·알람·감사·차원 400일. 정본은 `dbm_retention` 잡 options 한 곳, 시계열은 일 파티션 DROP, 비파티션은 DELETE, 롤업 끝난 파티션만 DROP. **디스크 예산·최소 보장 일수·수집 자동 완화·사건 구간 보호는 두지 않는다**(자동 단축이 없으니 🔴8이 성립하지 않음). 구현체는 `premium.common`(APM에서 추출), 도메인은 표 목록·일수·단계만 얹는다 | 보관 의무(1년) 충족 + 운영자가 APM·Zabbix에서 이미 아는 모델 + 사본 2벌 사고 방지 | §6.1·§6.3 |

### 0.1 Phase 어림 (상세 §12) — 검수 반영: 불확실성 20~30% 포함

| Phase | 한 줄 | 어림(사람-일) |
|---|---|---|
| **P0** 실측·계약 | R1~R10(권한·부하·마스킹 fixture·용량·6.0 배달·드라이버·**OTel PG receiver 비교**·**Oracle 최소 권한 병행**·system_health 유실/권한·RAC 원격 blocker 조인·**R11 원격 수집기 패키징·코어 경계**) | 22~34 (+R11 3~5는 J2 증분 25~35 안에서 배정 — P0 종료 때 재확정) |
| **P1a** 공통 기반 + PostgreSQL 조사 흐름 | 등록·자격증명·capability·폴러 프레임(레인·lease·checkpoint·writer·파티션)·PG 어댑터(**서버 Q 1회 + namespace 선택·예산**)·Q `__other__`·cardinality quota·client 구조·개요·상세·SQL 표·락 트리·관리 마법사 | 58~76 |
| **P1b** MySQL/MariaDB + 알람 공용화 | MySQL·MariaDB 어댑터(락 분기·**MariaDB 별도 지원표**)·오류 카운터·**설정 스냅샷(승인 키)**·Zabbix 트래퍼 전송기 추출·**공통 규칙 11종**(`LONG_QUERY`·`DEADLOCK` 포함, §7.1 GA)·알람 기준 정렬·보존 탭 | 37~49 |
| **P2** Oracle + SQL Server | V$ 허용목록 패키지(객체별 추가·`_STAT`)·CDB/PDB·RAC 노드별+unresolved·DMV·**프로시저 통계**·**system_health 데드락(조건부)**·AG 상태/queue·플랜 뷰어(캐시 플랜, estimated/actual)·클러스터 membership·권한 검사 리포트 | 85~111 |
| **P3** 사후 분석·상관 | 과거 시점 재생 UX·기간 비교·플랜 변경·APM endpoint 관측 모델·**스키마·인덱스 스냅샷(선택 DB)**·**승인 키 주석 태그·서비스 귀속**·AG 이력·Agent Jobs/백업 age·진단 preset·Rows/Query 호스트 비교·리포트·위젯·(선택) Zabbix 카운터 개요 모드 | 58~84 |
| **P3b** 원격 실행형 수집기(J2) 🆕 v2 | WS-27: 수집 코어 모듈 `dbm-collector-core` jar 소비(**분리는 P0에서 완료, 2026-10-26**)·수집기 런타임(systemd/Windows 서비스·설정 pull·배치 push·디스크 큐·로컬 마스킹)·BE 수신 API `/dbm/ingest/v1`·`dbm_collector` 등록/토큰/하트비트/버전 호환·관리 "수집기" 탭·설치 가이드 | 25~35 |
| **P4** 출시 검증 | 50 인스턴스 복합 부하·APM 동시 부하·HA 인계·장애 복구·폐쇄망 설치·보안 심사 패키지·**확장 지원표(엔진×버전×플랜·데드락·MariaDB)**·50 DB namespace·이벤트 유실·**원격 수집기 망 조건·큐·토큰 회전·업데이트 검증**·**RAC 지원표 문구** | 39~51 |
| **GA 합계** | 엔진 4종 인증(토폴로지 = **BE→DB 직접 접속 J1 + 원격 실행형 수집기 J2**, D21) | **324~440** (v1.3 299~405 + J2 25~35. `maxDbTargets` 강제·RAC 노드별 수집 포함, 임의 SQL·권한 상승 패키지·XE·로그 플랜·PG/MySQL 재계획 제외) |
| P5 확장 | Tibero(40) · OTel 프로필(20, R7 결과) · CUBRID 조사(10) · Oracle ASH 프로필 검토 · (Q31) 비범위 저장소 미정 | 70 |

---

## 1. 배경·목적

### 1.1 as-is
- `Feature.DB_MONITORING`(PREMIUM 기본 포함), FE 라우트 `/database-monitoring`·사이드 메뉴·자물쇠·i18n 키 전부 존재. 내용물은 `Empty "준비 중"` 스텁.
- BE `premium/dbm/` 없음. Flyway 최신 **V89**(2026-10-22 기준, 10-19엔 V81) → DB 모니터링은 **V90~**(착수 직전 재확인 — APM 작업이 계속 번호를 쓴다).
- 프리미엄 설계서 §5.9 전제 "Zabbix agent2 공식 템플릿 활용"은 **본 문서가 대체**(포인터 반영 완료).

### 1.2 왜 그 전제로는 유료 기능이 성립하지 않나
Zabbix 공식 DB 템플릿 7종 전부가 인스턴스 **집계치만** 제공한다(연결 수·캐시 히트·복제 지연·락 **건수**·슬로우 쿼리 **건수**). 세션 목록·Top SQL·락 트리·실행계획은 어느 템플릿에도 없다(Part B §A README 전수). 유료 제품의 공통 분모(Part A §2-1, Part C §7)가 정확히 그 넷이다.

**Zabbix 공식 Oracle 템플릿 2종(agent2·ODBC)은 `V$ACTIVE_SESSION_HISTORY`를 조회**한다(README "Diagnostics Pack 필요" 명시). 이 템플릿을 쓰는 SE2·팩 미보유 고객에게 안내가 필요하다(§8.5).

### 1.3 한 줄 정의
> **고객 DB 인스턴스가 지금 무엇을 기다리고 있는지, 어느 SQL이 시간을 먹는지, 누가 누구를 막고 있는지를 DB 서버에 아무것도 설치하지 않고 보여주고, 장애가 지난 뒤에도 그 시점으로 돌아가 같은 질문에 답한다.**

### 1.4 원칙
1. **에이전트리스 기본.** **엔진 전제가 이미 구성된 환경**에서 고객 승인 항목은 ① 모니터링 전용 읽기 계정 ② BE→DB 포트 둘. 그 둘을 **보안 심사 문서 한 장**으로 제출. (PG `pg_stat_statements` 미구성·MySQL P_S OFF 환경은 설정·재시작 승인이 **추가**된다 — 가리지 않고 사전 점검 결과로 보여준다.) **MovesEye 전용 함수·뷰·프로시저·XE 세션은 고객 DB에 만들지 않는다**(D14). 단 엔진 자체의 전제(PG `pg_stat_statements` 확장·`shared_preload_libraries`, MySQL `performance_schema`·consumer)는 고객 DBA가 설정하며 우리는 감지·안내만 한다 — "DB 측 객체 0개"라고 쓰지 않는다.
2. **엔진별 최소 권한 SQL 스크립트가 산출물.** 포괄 권한 비요구, 기능별 추가 권한은 분리 표시.
3. **Oracle 유료 팩 비사용은 실제 호출 객체 목록으로 보증.** "조회 가능한지 시험" 호출도 금지.
4. **값 0과 수집 실패를 구분.** 시간 관측률·행 잘림·텍스트 잘림을 **세 축**으로 저장·표시.
5. **샘플은 실행 이력이 아니다.** 5초 미만 실행은 "포착될 수도 있지만 누락될 수 있다". 짧은 고빈도 SQL은 누적 통계(Q)로.
6. **설치형 제약**: 새 DB 없음, 도커 없음, 보존은 **일수 정책만**(디스크 예산·자동 단축 없음 — v2.5 §6.3·D23).
7. **수집층 중립(P2-1)**: DBM 어휘는 `premium/dbm/`에만. `engine-api` 무수정.
8. **기존 라이선스 커널 원칙을 설계서 한 문장으로 예외 처리하지 않는다**(🔴1 교훈).

---

## 2. 시장 조사 → 요구 기능 체크리스트
(v1과 동일. 원문 `./research_db-monitoring-2026-10-19.md`)

### 2.1 공통 분모(Table stakes)
| # | 기능 | 해외 8종 | 국내 3종 | 본 설계 |
|---|---|---|---|---|
| T1 | 인스턴스 헬스 + 호스트 지표 상관 | 전부 | 전부(부가 에이전트) | ✅ 폴러 C + Zabbix 호스트 링크(에이전트 추가 없음) |
| T2 | Top SQL(정규화·fingerprint) | 전부 | 전부 | ✅ §5.4 |
| T3 | 활성 세션 + 블로킹 트리 | 전부 | 전부 | ✅ §5.3 |
| T4 | Wait event/class 분석 | 전부 | 전부 | ✅ |
| T5 | 실행계획 | 전부 | 전부 | ✅ 종류 구분(예상/캐시) |
| T6 | 복제·스토리지·연결·접속 실패 알림 | 전부 | 전부 | ✅ §7 |
| T7 | 과거 시점 재생·기간 비교 | 전부 | 전부 | ✅ 상세 48h + 집계 30일/180일 |
| T8 | 다중·이기종 통합 뷰 | 전부 | 전부 | ✅ |
| T9 | 최소 권한 명시·전송 암호화·설치형 | — | 필수 | ✅ §4·§5.6·§5.8 |
| T10 | 일/주/월 리포트 | 일부 | 전부 | ✅ P3 |

### 2.2 차별 후보
플랜 변경 감지(P3) · **APM↔DB 단일 제품 상관**(P3, 시간 상관부터) · 호스트 OS 지표 오버레이(P1a) · 보안 심사 패키지(P4) · Kill(Q6 제외) · 추천(비범위) · ML 이상탐지(백로그) · Deadlock graph(MSSQL, **기존 `system_health` 읽기로 P2 조건부** — v1.2) · 설정 스냅샷(P1b) · MSSQL 프로시저 통계(P2) · 스키마·인덱스 스냅샷(P3).

### 2.3 지원 엔진 우선순위
공공 2024: Oracle 62.5% · MSSQL 14.4% · CUBRID 10.6% · Tibero 9.1% · MariaDB 3.5%. 금융 계정계 Oracle, 채널·정보계 PostgreSQL·Tibero 이탈. → **GA 4종: Oracle · SQL Server · MySQL/MariaDB · PostgreSQL.** Tibero P5 1순위, CUBRID 조사, Altibase/Goldilocks 요청 시. **GA 지원 버전·에디션 시험표는 Q16으로 확정**(XE·Developer만으로 전 범위 인증 불가 — 코덱스 Q9). MariaDB는 MySQL과 **별도 지원표**(G45).

### 2.4 Datadog DBM과의 위치 (v1.2, 상세 §15)
Datadog이 보여주는 10가지(지금 무엇이 도나 · 어느 SQL이 시간을 먹나 · 왜 가끔 느린가 · 누가 누구를 막나 · 인스턴스 헬스 · 스키마 변화 · 설정 변화 · 어느 서비스 때문인가 · 무엇을 고쳐야 하나 · 운영 이벤트) 중 **1~5·7은 GA**(3의 플랜은 Oracle·MSSQL만), 6·8은 P3, 9(추천)는 비범위, 10은 부분(MSSQL Agent Jobs P3, XE 완료/에러 비범위). 수집 모델의 차이: Datadog은 DB 호스트 옆 Agent + 전용 DB 객체(함수·뷰·XE), 우리는 BE 내장 폴러 + **전용 객체 없음**(D14) — 그 대가로 PG·MySQL 재계획 플랜을 GA에서 뺀다(D13).

---

## 3. 수집 경로 전수 → 결정

### 3.1 데이터 등급 5종
| 기호 | 데이터 | 답하는 질문 |
|---|---|---|
| **C** | 인스턴스 카운터 | 연결·처리량·캐시·스토리지·복제가 나쁜가 |
| **S** | 세션 스냅샷 | 그 시각에 누가 무엇을 실행/대기했나 |
| **Q** | SQL 누적 통계 | 어느 SQL이 시간·CPU·읽기를 먹었나 |
| **P** | 실행계획 | 어떤 접근 경로였나(예상/캐시/실행 구분) |
| **L** | 블로킹 관계 | 누가 누구를 막았고 영향 범위는 |

### 3.2 경로 전수
(v1 표와 동일 — Z1 agent2 템플릿 · Z2 ODBC 템플릿 · Z3 custom.query/odbc.get · O1 OTel 전용 receiver · O2 OTel sqlquery · **J1 BE 내장 JDBC** · J2 원격 실행형 · Z4 agent2 커스텀 플러그인 · E1 기존 도구 · E2 exporter/로그. 커버리지: Z1·Z2는 C만+건수, O1은 PG·MySQL·MSSQL·Oracle에서 S·Q·P 일부, J1·J2는 전부.)

### 3.3 결정과 근거

| 결정 | 채택 | 기각/보류와 이유 |
|---|---|---|
| **심층(S·Q·P·L) 운영 경로** | **J1 BE 내장 JDBC 폴러** | O1: receiver events(`query_sample`·`top_query`·`query_plan`·Oracle `session.wait_sample`)가 실재한다 — "카운터뿐"이 아니다. 그러나 (a) events 시그널 `development`(v0.128 키 개명·v0.129 `server.address` 제거) (b) oracledb metrics alpha (c) 국산 DB receiver 부재 → JDBC 정규화 계층이 어차피 필요. **단 유예는 R7 비교 실측 뒤에 확정**(🟡2) |
| | | Z3: Zabbix 문자열 아이템 → 히스토리 폭증·검색 불가·`.sql` 배포·Instant Client. 기각 |
| | | Z4: 개발 책임 동일 + 배포·서명·규약 책임 추가. 기각 |
| | **+ J2 원격 실행형 수집기(v2, D21 — GA)** | J2: J1과 같은 코어의 systemd/Windows 서비스 포장. GA에서 빼면 "BE→DB 직접 접속 불가 고객"이 도입 불가 — GA 토폴로지 축소(공정성 3). **Q12 확정: GA 포함**(망분리 금융 1차 타깃 전제). 설계 §3.6 |
| **카운터(C)** | **J1 폴러**(기본) | Zabbix 템플릿 복제 안 함(이중 저장). 단 **폴러 미등록·Zabbix DB 템플릿만 있는 호스트엔 "Zabbix 카운터 개요 모드"(C만) 제공**을 P3 선택 항목으로 보존(Q14). 참고: 폴러가 같은 연결을 써도 동적 성능 뷰들이 하나의 일관된 스냅샷이 되는 것은 아니다 — 카운터·세션·락은 각각 `observed_at`을 가진다(§8.3) |
| **호스트 OS 지표** | 기존 Zabbix 호스트 링크 | DB 전용 툴의 부가 에이전트(WhaTap XOS)를 대체 |
| **고객 기존 도구(E1)** | 비범위 | 공개 API 있는 경우만 고객별 확장 |

### 3.4 Zabbix의 역할 — 상관·발견·(선택)카운터 개요
- **발견**: `template.get`으로 DB 템플릿 링크 호스트, `device_classification=database` 호스트를 "미등록 DB 인스턴스 후보"로 제안. 매크로(`{$PG.HOST}`·`{$ORACLE.PORT}` 등)로 endpoint 추정값 채움.
- **상관**: `dbm_zbx_link(target_uid, datasource_id, hostid, role=OS_HOST|DB_HOST)`로 호스트 CPU·메모리·디스크·네트워크를 DB 타임라인에 오버레이. 기존 host 포트 읽기만.
- **Zabbix 카운터 개요 모드**(P3 선택, Q14): 폴러 미등록 호스트의 DB 템플릿 아이템(연결·QPS·캐시·복제)을 개요 카드에 "Zabbix 카운터만 · 세션/SQL 미지원" 배지로 표시. capability C만.
- **알람 배달**: §7. **Oracle 템플릿 ASH 경고 배지**: §8.5.

### 3.5 OTel receiver 프로필 (시기 = R7 결과로 확정, 기본 P5)
BE→DB 접속 불가 + Collector→DB 가능 고객용 보조 경로. 조건: Collector 버전 핀(`otelcol-contrib 0.159.x`), **R7 비교 실측**(PG receiver의 query_sample/top_query/query_plan 실제 출력·마스킹·원문이 Collector 큐/로그에 남는지·기능 완전성·망 접근 조건) 통과 엔진만 "동등 프로필". 수신은 APM과 **분리된** `/dbm/otlp/v1/{metrics,logs}` + 전용 토큰(APM 수신기는 `service.name` 없는 리소스를 `UNKNOWN_SERVICE`로 폐기하고 일반 로그를 저장하지 않는다 — 실측). yaml 생성기는 `# K8S_RECEIVERS` 치환 패턴 재사용, 비밀번호는 `${env:…}`. 적재는 같은 `dbm_*` 스키마, `dbm_sample_batch.source='OTEL'`.

### 3.6 원격 실행형 수집기(J2) — GA 토폴로지 2 (v2, D21)

**언제 쓰나**: BE가 있는 관리망에서 DB망으로 직접 접속이 막힌 고객(망분리·DMZ·클라우드 VPC 분리). 수집기는 **DB에 접속할 수 있는 망**(DB와 같은 서브넷 또는 허용된 점프 구간)의 고객 서버 1대에 설치되고, **BE로만 아웃바운드 HTTPS**를 연다. DB 서버에는 여전히 아무것도 설치하지 않는다(D1·D14 불변).

**(v2.1) 읽는 법**: 아래 표에서 **🧪**는 P0 R8/R11 **시험 가정**이다 — 수치·방식은 시험 결과로 P1a 공통 모델 확정 때 고정하며, 그 전엔 운영 계약으로 쓰지 않는다. 🧪 없는 행은 설계 계약이다. 실제 자격증명 전달·원문/플랜 전송을 포함한 시험은 **해당 보호 경계(보안 행)를 먼저 정한 뒤** 수행한다. 코덱스 4차(V4-1~V4-5) 반영.

| 항목 | 계약 |
|---|---|
| **코어 공유** | 폴러 프레임(레인·checkpoint·writer)·엔진 어댑터·정규화·마스킹 검사기·플랜/데드락 XML 보호·품질 판정을 **Gradle 모듈 `dbm-collector-core`**로 분리 — **P0에서 물리 분리 완료(2026-10-26, 당초 P3b 예정 → 파일 36개일 때 옮기는 비용이 가장 싸고 경계를 리뷰 규칙이 아니라 의존 그래프가 강제하도록 사용자 결정)**. 모듈의 프로덕션 의존은 JDK만(컴파일이 1차 방어) + ArchUnit allowlist(2차). J1의 spi PG 구현은 app `premium.dbm.collector.j1`(WS-2), J2 런타임은 P3b 별도 모듈이 이 jar를 그대로 소비. **코어의 외부 의존은 인터페이스 6종으로만**: `BatchWriter`(J1 PG 직접 / J2 HTTPS push) · `LeaseClient`(J1 PG / J2 BE API) · `CheckpointStore`(J1 PG / J2 로컬 durable) · `ConfigSource`(J1 DB 설정 / J2 config pull) · `SecretResolver`(J1 Codec / J2 로컬 키스토어) + `Clock`. 코어는 PG·BE 빈·JPA·Spring에 직접 의존하지 않으며, **메모리/파일 구현만으로 코어가 구동되는 테스트**가 P1a DoD(§17.4). 어댑터 코드는 한 벌 |
| **실행 모델·소유권(V4-1)** | **J1**: BE 노드 사이 자동 인계(§5.2, 수집 RTO ≤30s). **J2**: 할당된 수집기만 실행, **자동 대기 수집기 인계 없음**(수동 교체). 대상의 소유자는 `(owner_kind J1\|J2, owner_id, assignment_generation)` 하나 — J1↔J2 전환·수집기 교체는 **assignment_generation 증가 + fencing token 변경**. 같은 `collector_id`의 복제 프로세스 2개는 **실행 식별자 `run_id`**(프로세스 시작마다 생성)로 구별하고 lease는 `(collector_id, run_id)`에 발급 — 다른 `run_id`의 lease 요청은 거부(재등록·교체 절차로만 이전) |
| **lease API(V4-1)** 🧪 | J2 lease 획득·갱신은 **BE API가 PG에서 원자적으로 처리**: `POST /dbm/ingest/v1/lease`(대상 묶음 단위, TTL 30s·갱신 10s — config pull 30s와 **별도 계약**). 응답 = 유효기간이 있는 **실행 허가**(`lease_until`, fencing token, assignment_generation). 수집기는 갱신 실패 또는 허가 만료 시 **신규 tick을 중단**하고 진행 중 tick 결과는 큐에 남긴다(허가 만료 뒤 전송분은 BE가 옛 token으로 거부·`STALE_LEASE`). 고립(BE 불가)된 옛 수집기는 허가 만료로 DB 폴링을 멈춘다 — fencing은 적재 차단이고 폴링 정지는 허가 만료가 보장한다 |
| **설정 전파·허가(V4-1)** 🧪 | `GET /dbm/ingest/v1/config` 30s·ETag. 응답에 `config_version`·`policy_version`(마스킹·승인 키·`keep_raw_sql`·대상 활성 여부)·`assignment_generation`. 수집기는 적용 뒤 **ACK**(`applied_config_version`)를 heartbeat에 싣고, BE는 최대 전파 지연(2×pull)을 넘기면 `CONFIG_STALE` 표시. `304 Not Modified`는 설정만 유지하며 **실행 허가 갱신은 lease API가 한다**(304가 허가를 늘리지 않는다). 라이선스 거부는 config 응답의 **구조화 사유**(`LICENSE_EXPIRED`·`FEATURE_DENIED`)로 전달되고 그 응답에는 자격증명·실행 설정이 없다(D22) |
| **방향·채널** | **수집기 → BE 단방향**(인바운드 없음). ① config pull ② `POST /dbm/ingest/v1/batches`(push) ③ `POST /dbm/ingest/v1/heartbeat`(10s, 버전·`run_id`·큐 바이트·대상별 마지막 성공·applied versions) ④ lease ⑤ **원격 작업**(아래). APM OTLP 수신기와 **분리된 경로·토큰**(§3.5와 같은 원칙) |
| **멱등·ACK·checkpoint(V4-5)** 🧪 | 전송 키 `(collector_id, target_uid, kind, epoch, seq)` → 저장 키 `(target_uid, kind, epoch, seq)`. **`epoch`는 대상 단위 전역 유일**: BE가 소유권 부여 시 `epoch` 시작값을 발급하고(assignment_generation과 함께), 수집기는 그 범위 안에서만 `seq`를 올린다 → J1↔J2 전환 뒤 충돌 없음. BE는 데이터 저장과 **수신 영수증**(`dbm_ingest_receipt(collector_id, target_uid, kind, epoch, seq, payload_hash)`)을 같은 트랜잭션에 커밋하고, 같은 키·다른 payload_hash는 `IDEMPOTENCY_CONFLICT` 오류. ACK는 영수증 커밋 뒤 응답. 수집기는 **ACK 받은 배치만 큐에서 삭제**. 누적값 차분(Q·카운터)의 checkpoint는 **수집기 로컬 durable**(`CheckpointStore`)이며 큐 기록과 checkpoint 전진을 **한 fsync 단위**로 처리(둘 중 하나만 남으면 재시작 시 baseline/partial로 복구, §5.4 규칙 동일) |
| **큐·복구·백프레셔(V4-5)** 🧪 | 디스크 큐(기본 256MB, append-only 세그먼트 + 인덱스)는 수집기 로컬. 포화 정책: 세션 샘플 → 활동 집계 순으로 폐기, **카운터·락·checkpoint는 유지**, 폐기량·구간은 **별도 손실 메타 세그먼트**(큐와 독립 상한 1MB)에 기록해 복구 후 `DROPPED_LOCAL`로 전송. 카운터·락만으로도 포화하면 **가장 오래된 카운터부터**, 락만 남아도 포화하면 **가장 오래된 락부터** 폐기 — 마지막 fallback은 "가장 오래된 세그먼트"이며 어떤 kind도 상한을 넘겨 보존하지 않는다(손실 메타 기록, v2.3·코덱스 7차 #17). "보존 창 밖" 예시(세션 raw 48h)는 **kind별 수락 창 미결**(계약 §1.8·§6)에 따른다. 배치: 최대 5,000행 또는 압축 전 4MB·gzip·flush 1s·동시 전송 2·단일 항목 상한(SQL 8KB·플랜 256KB)·잘못된 payload는 격리 세그먼트. 재시도: 429/5xx/네트워크는 지수 백오프(1s→60s, jitter)·대상 간 라운드로빈 공정성. **보존 창을 지난 배치**(세션 raw 48h 밖 등)는 BE가 `EXPIRED_WINDOW`로 수락 거부(ACK는 반환 → 큐 삭제, 손실 메타에 기록) |
| **수신 인증·오류 분류(V4-1·V4-5)** | BE 수신 실패 사유를 구조화: `TOKEN_INVALID`·`TOKEN_REVOKED`(재시도 중단·운영 개입) / `TARGET_UNASSIGNED`·`STALE_LEASE`·`GENERATION_MISMATCH`(설정 재조회 뒤 중단) / `LICENSE_EXPIRED`·`FEATURE_DENIED`(중단·큐 보존) / `VERSION_MISMATCH`·`SCHEMA_INVALID`(중단·알람) / `RATE_LIMITED`·`BE_BUSY`(백오프). **DB 계정 `AUTH_FAILED`(§5.1)와 다른 축** — 화면·알람에서 섞지 않음 |
| **인증·토큰** | 등록: 관리 화면이 **1회용 enrollment 코드**(10분, 1회 소비, 발급자·시각 감사) 발급 → 수집기가 코드 + **자기 공개키**를 제출 → BE가 `collector_id`·전용 토큰 발급(코드·공개키 결합, `DBM_ADMIN`만 발급 가능). 토큰 회전: 새 토큰 발급 뒤 **중첩 유효기간 10분**(두 토큰 모두 수락) → 수집기 적용 ACK → 옛 토큰 폐기. 폐기: BE 수신·설정·lease 발급 즉시 차단, 원격 중단 최대 지연 = lease TTL(D22). TLS 필수(BE 인증서 pin 옵션) |
| **자격증명·키 수명주기(V4-3)** | 네 가지 키를 구별: ① BE 저장 키(`enc:v2:<keyId>`, §5.6 — **수집기에 배포하지 않음**) ② **전달 봉투**(수집기 공개키로 봉인, `env:v1:<collector_key_id>:<target_uid>:<credential_version>:` — 버전·수신 키 ID·대상 귀속·자격증명 버전 포함, 무결성 태그) ③ 수집기 로컬 키스토어(개인키, OS 서비스 계정만 접근, 키 손실 = 재등록) ④ API 토큰. 교체: BE 저장 성공(`credential_version++`) → config로 새 봉투 전달 → 수집기 풀 재생성 성공 ACK → BE가 "적용됨" 표시·옛 자격증명 폐기 시점 기록; 실패 시 수집기는 이전 버전 유지 + `CREDENTIAL_APPLY_FAILED`. 공개키 등록·교체·폐기와 적용 ACK는 `dbm_audit`. **GA 기본 보관 방식(중앙 전달 vs 로컬 입력)은 Q33 — P1a 자격증명 모델 확정 전까지 결정** |
| **전송 전 보호·원문(V4-2)** | 수집기는 **SQL 텍스트·플랜 XML/JSON·데드락 XML의 민감 필드를 제거한 뒤에만** 디스크 큐와 전송 배치에 기록한다(§5.5 검사기·플랜 구조 파서·데드락 마스킹 전부 코어 안). BE의 플랜 처리는 **이미 보호된 구조의 검증·저장·비교**이며 원본 민감정보 제거를 BE까지 미루지 않는다(BE 재검사는 이중 방어). 구조 파싱 실패 시 플랜은 **해시만** 전송. 배치에 `policy_version`을 실어, 정책 강화(마스킹·승인 키·`keep_raw_sql` OFF·대상 비활성) 뒤 큐에 남은 옛 정책 배치는 BE가 **재검사 후 수락 또는 폐기**(세션 텍스트는 재검사 가능, 원문 보존 배치는 폐기). **J2에서 `keep_raw_sql`은 Q34** — 결정 전 기본은 **J2 비활성(원문 비전송 유지, 관리 화면에 이유 표시)**. 수집기·BE의 예외 로그·JDBC 예외·HTTP 요청/응답 로그·서비스 시작 오류·진단 번들·BE 수신 로그에 **SQL 원문·바인드·자격증명·토큰을 기록하지 않는다**(R3 검사 지점에 포함) |
| **시간(V4-4)** | `observed_at` = **실제 채집 시각(UTC)**, `received_at`과 구별(§5.8 "BE가 수신 시각 기준"은 **J1에만** 해당 — v2.1 정정). J2는 배치에 수집기 원시 시각·적용 보정값(`collector_clock_offset_ms`)·보정 버전을 보존하고 **재전송 시 `observed_at`을 바꾸지 않는다**. 보정값은 heartbeat 왕복(RTT/2 보정, 표본 5개 중앙값)으로 산출·유효기간 5분, 신뢰 범위(±2s) 밖이면 배치 품질 `clock_uncertain`. `db_clock_offset_ms`의 기준 시계는 **수집 주체의 시계**(J1=BE, J2=수집기)이며 수집기 보정과 중복 적용하지 않는다. 세션 경과는 DB 보고값 우선(§5.8) |
| **버전 호환** | **제품 minor와 wire schema 버전을 구별**: `wire_version`(수신 API·배치 schema)은 하위 호환 범위를 BE가 공표하고, 수집기 제품 버전은 BE와 **마이너 동일**이어야 lease 발급(불일치 `VERSION_MISMATCH` — heartbeat는 계속 받아 진단). BE 업그레이드 절차: 수집기 정지 → BE → 수집기 교체(큐 세그먼트 schema는 wire_version 호환 범위 내 유지, 범위 밖이면 큐 폐기+손실 메타). 자동 업데이트 비범위 |
| **원격 작업(V4 보강)** 🧪 | outbound-only에서 BE가 지시하는 일회성 작업(접속 테스트·capability 검사·on-demand 캐시 플랜 회수·자격증명 적용·대상 재개)은 **작업 큐 모델**: config 응답에 `jobs[]`(`job_id`·대상·종류·TTL·멱등 키), 수집기가 실행 뒤 `POST /dbm/ingest/v1/jobs/{job_id}/result`. 취소는 TTL 만료 또는 다음 config에서 제거. 등록 마법사의 "접속 테스트"는 J2 대상이면 **비동기 결과 대기 UI**(상태 polling) |
| **대상 수 상한·인증 프로필** 🧪 | 수집기 1대 기본 **≤30 대상**(Datadog Agent 권고 참고 — 초기 시험값, MovesEye 인증값 아님). P4에서 **인증 프로필**(엔진 혼합·세션 수·간격·namespace·플랜 크기·TLS·CPU/heap·망 조건 고정)로 상한 확정, 초과 할당은 관리 화면이 거부+이유 |
| **늦은 데이터·상태(V4-5)** | 재전송 배치의 과거 버킷 반영 기한 = 해당 롤업 보존 창 안이면 반영(🧪 **미결** — 1m 창은 kind별로 다르다: 활동 1m 30일·metric/Q 1m 7일(§6.1), "raw는 만료됐지만 롤업 반영은 가능한 배치"의 처리 포함. 계약 §1.8·§6에서 P0 종료 때 확정, 코덱스 6차 #18·7차 #18) + 영향 버킷 롤업 재계산 큐, 밖이면 `EXPIRED_WINDOW`. **과거 데이터로 현재 알람을 다시 열지 않는다**(규칙 평가는 `received_at` 기준 최신 창만). 수집기 장애(`COLLECTOR_DOWN`)·수신 거부·라이선스 중단은 대상 DB `DOWN`과 다른 상태로 표시, 대상별 `STALE`은 수집기 단위로 묶어 중복 억제 |
| **배포·운영 동등성** | 단일 실행 jar + 서비스 유닛(systemd·Windows 서비스), JDBC 드라이버 4종 번들 + 고객 jar(허용 클래스·SHA-256, **수집기 재시작 후 적용** — §4.3 "BE 재시작" 규칙의 J2 대응), DB TLS trust store·BE TLS 신뢰·프록시 설정은 수집기 설정 파일. 폐기 시 로컬 키스토어·큐·checkpoint 삭제 절차. JDK 번들·지원 OS는 **Q32**(R11에서 재배포 조건이 확인된 배포판·버전·OS/아키텍처별 검증 뒤 확정). 폐쇄망: 오프라인 패키지 + 체크섬 |
| **관리** | `/dbm/collectors`(등록 코드 발급·공개키·토큰 회전/폐기·대상 할당·상태·버전·`run_id`·큐 바이트·applied versions·작업 상태·감사) — v1의 P5 항목을 **GA(P3b)** 로. 관리 화면 "수집기" 탭. `dbm_collector`·`dbm_collector_target`·`dbm_ingest_receipt`·`dbm_collector_job` 테이블(§6.1) |
| **라이선스** | 수집기 수는 상한 없음. 대상 수는 `maxDbTargets`에 J1·J2 합산(D16·D17). 실제 수집 허가·만료·수신 차단은 lease·config·수신 분류 행 + §9(D22) |
| **비범위** | 수집기 자체 HA(활성-대기) · 자동 업데이트 · 수집기에서 알람 평가·롤업(평가·롤업·**보호된 플랜의 의미 처리·비교**는 BE) · 수집기 ↔ Zabbix 직접 통신 · J2 원문 전송(Q34 결정 전) |
| **실측 R11**(P0) | 통과 기준은 §11 R11과 동일(멱등 중복 0·회전 중단 <10s·30 대상 CPU 1코어 미만·heap 상한 명시). 시험표: 코어 경계(메모리/파일 구현으로 구동)·패키징(jar+systemd·Windows)·재시작 시점별 crash(큐 기록 중·ACK 직전·checkpoint 전진 중)·키/설정 변경 중 배치·라이선스 단절·시간 오차 ±2s 주입·큐 256MB 소진·토큰 회전/폐기 구별·프록시/인증서 망 조건 |

---

## 4. 엔진별 데이터 소스·권한·라이선스

공통 주기: **세션 5s(1~10s) · 락 10s · 카운터 15s · SQL 누적 60s · 플랜 on-demand(예산)**. 오버헤드는 상대 위험 — R2가 측정.

| 엔진 | C | S | Q | P | L | 최소 권한(제품 스크립트) | 조건·미지원 | 주의 |
|---|---|---|---|---|---|---|---|---|
| **PostgreSQL 12+** | `pg_stat_database`(sessions 14+·deadlocks·conflicts)·`pg_stat_bgwriter`/`checkpointer`(17+)·`pg_stat_replication`·`pg_replication_slots`·`pg_stat_wal`(14+)·`pg_stat_io`(16+)·`pg_stat_archiver`·`pg_stat_subscription`·`pg_locks` 모드별 건수·`pg_database_size`(대형 DB OFF 옵션). 전체 목록 부록 B | `pg_stat_activity`(state·wait_event_type/event·query·query_id 14+·backend_xid·xact_start·**client_addr·client_port·client_hostname·application_name**) | `pg_stat_statements`(`queryid`+`dbid`+`userid`+**`toplevel`(14+)** 문맥 보존, **한 DB 접속으로 서버 전체** — D15) | **GA 미지원(캐시 플랜 없음).** 재계획 `EXPLAIN`은 문장 권한이 필요해 GA 제외 확정(D18; 후속 "DB 변경 프로필"은 고객 요구 뒤) | `pg_blocking_pids(pid)` | `GRANT pg_monitor` + `CONNECT`(+namespace 작업 DB마다 `CONNECT`) | `pg_stat_statements` 없으면 Q "미지원"(재시작 고지). 권고 설정 검사(RECOMMENDED): `track_activity_query_size` 4096·`pg_stat_statements.track`(`ALL`이면 중첩 중복 → `toplevel` 기본 집합)·`.max` 10000·`track_io_timing`·PG15 역할 `INHERIT` | `pg_locks` 빈번 조회 금지(10s). namespace 순회 §4.5 |
| **MySQL 8.0 / MariaDB 10.5+** | `SHOW GLOBAL STATUS`·InnoDB status·`SHOW REPLICA STATUS`·`innodb.deadlocks` | `performance_schema.threads`+`events_statements_current`(없으면 processlist; `PROCESSLIST_HOST`=host:port) | `events_statements_summary_by_digest`(`SCHEMA_NAME`+`DIGEST` 문맥, extra: `SUM_ERRORS·SUM_WARNINGS·SUM_LOCK_TIME·SUM_ROWS_EXAMINED/SENT/AFFECTED·SUM_CREATED_TMP_DISK_TABLES·SUM_NO_INDEX_USED·SUM_NO_GOOD_INDEX_USED·SUM_SELECT_SCAN·SUM_SORT_MERGE_PASSES`; 포화 감지 = digest 행 수/`performance_schema_digests_size`) | **GA 미지원**(D18 확정) | MySQL 8 `data_locks`+`data_lock_waits` / MariaDB `INNODB_TRX`+`INNODB_LOCK_WAITS`(**어댑터 분기**) | `SELECT ON performance_schema.*`, `PROCESS`, `REPLICATION CLIENT`(MariaDB `SLAVE MONITOR`); 계정 스크립트 예시 `MAX_USER_CONNECTIONS 5`(권장 예시, 필수 아님) | P_S OFF면 S·Q 저하 모드. consumer는 고객 DBA가 관리, 우리는 감지·안내만(D14). **MariaDB는 별도 지원표**(P_S 기본 OFF·5.7식 락 컬럼·데드락 카운트 미갱신·미지원 필드는 `unavailable`, 0 금지 — G45) | digest 길이 4096 권고 |
| **SQL Server 2016+** | `dm_os_performance_counters`·`dm_os_wait_stats`·`dm_io_virtual_file_stats`·`dm_db_file_space_usage`(tempdb)·**AG `dm_hadr_availability_replica_states`·`dm_hadr_database_replica_states`(sync state·log send/redo queue·lag)**·`dm_os_schedulers` | `dm_exec_requests`+`dm_exec_sessions`+`dm_exec_connections`(**client_net_address·client_tcp_port·host_name·program_name**)+`dm_exec_sql_text`(`blocking_session_id`·wait·cpu·`query_hash`) | `dm_exec_query_stats`+`dm_exec_sql_text`(`query_hash`+`dbid`; 플랜 캐시 evict → 리셋 감지; 🔴 **실행 user 없음** — Q에 사용자 축 약속 금지, G41) + **`dm_exec_procedure_stats`(프로시저 통계, P2)** | `dm_exec_query_plan(plan_handle)` 캐시 XML(예산) — **GA 플랜 지원 엔진** | `blocking_session_id`(음수 -2~-5)+`dm_tran_locks` + **기존 `system_health` XE의 `xml_deadlock_report`(P2 조건부: `event_file` 우선·ring_buffer, 중복 제거·유실 표시, 전용 세션 생성 없음)** | `VIEW SERVER STATE`(≤2019)/**`VIEW SERVER PERFORMANCE STATE`(2022+, `dm_xe_session_targets` 포함)**, `VIEW ANY DEFINITION`, `CONNECT ANY DATABASE`; Agent Jobs·백업 age는 msdb 객체별 SELECT(P3 선택) | Query Store P3 선택. Azure SQL DB는 `system_health` 없음 → 데드락 미지원(Q28) | 수집 SQL `READ UNCOMMITTED`·짧은 배치; 병렬 task 중복 집계 금지 |
| **Oracle 12c+ (SE2·EE)** | `V$SYSMETRIC`·`V$SYSSTAT`·`V$RESOURCE_LIMIT`·`DBA_TABLESPACE_USAGE_METRICS`·`V$OSSTAT` + v1.2 객체별 추가(capability 분리): `V$PGASTAT`·`V$SGAINFO`·`V$PROCESS`(메모리) · `V$CON_SYSMETRIC`·`V$PDBS`·`V$CONTAINERS`(CDB) · `V$DATAGUARD_STATS`·`V$DATAGUARD_CONFIG`(DG) · **`V$ASM_DISKGROUP_STAT`**(ASM; `V$ASM_DISKGROUP`은 disk discovery라 금지) · `V$RSRCMGRMETRIC`(RM) · `V$PARAMETER`(설정 스냅샷) | `V$SESSION`(status·event·wait_class·sql_id·blocking_session·**blocking_instance·blocking_session_status**·seconds_in_wait·**module·action·client_identifier·machine·port·program**) + **`V$TRANSACTION`**(LONG_TX) | `V$SQLSTATS`(SQL_ID+PLAN_HASH_VALUE; 리터럴 SQL은 우리 검사) | `V$SQL_PLAN`(캐시, 예산) — **GA 플랜 지원 엔진**. actual rows는 `V$SQL_PLAN_STATISTICS_ALL`(옵션 grant)이고 `STATISTICS_LEVEL=ALL` 또는 `GATHER_PLAN_STATISTICS` 힌트 때만 채워짐 → estimated/actual 구분. `DBMS_XPLAN.DISPLAY_CURSOR` 기본 OFF, `DISPLAY_AWR` 등 팩 함수 **호출 금지** | `V$SESSION.blocking_session`+`V$LOCK`+`V$LOCKED_OBJECT`(객체명) | `CREATE SESSION` + **객체별 `GRANT SELECT ON V_$SESSION, V_$TRANSACTION, V_$SQLSTATS, V_$SQL_PLAN, V_$SYSMETRIC, V_$SYSSTAT, V_$LOCK, V_$LOCKED_OBJECT, V_$RESOURCE_LIMIT, V_$OSSTAT, V_$INSTANCE, V_$DATABASE, V_$PARAMETER, V_$PGASTAT, V_$SGAINFO, V_$PROCESS, DBA_TABLESPACE_USAGE_METRICS`** + capability별(`V_$CON_SYSMETRIC, V_$PDBS, V_$CONTAINERS` / `V_$DATAGUARD_STATS, V_$DATAGUARD_CONFIG` / `V_$ASM_DISKGROUP_STAT` / `V_$RSRCMGRMETRIC`) (+actual rows 옵션 `V_$SQL, V_$SQL_PLAN_STATISTICS_ALL`). `SELECT ANY DICTIONARY`·`SELECT_CATALOG_ROLE`은 대안으로만 병기 | 🔴 호출 금지 목록(§4.1). CDB는 `C##` 공통 유저+`CONTAINER_DATA`(P2). **RAC = 노드별 대상 + 클러스터 membership(§4.6) + 원격 blocker는 `BLOCKING_INSTANCE/SESSION`으로 표기, 조인 실패 시 unresolved — `GV$` 불필요 선언 금지(Q3·Q29)** | 1초마다 `V$SQL` 전체 스캔 금지 |
| **Tibero 6/7**(P5) | `V$SYSSTAT`·`V$SYSTEM_EVENT` 변형 | `V$SESSION`·`V$WAITER_SESSION` | `V$SQLSTATS`·`V$SQL` | 버전별 | `V$LOCK` | 미확정 | Oracle 어댑터 구조 공유, SQL·상태 판정 별도. TAC 별도 | 무수정 호환 보장 불가 |
| CUBRID(조사) | broker·`SHOW` | `SHOW TRANSACTION TABLES` | 통로 불명 | `plandump`(OS) | `lockdb`(OS) | 미확정 | JDBC만으로 S·L·Q 다 못 얻을 가능성 | 백로그 |

### 4.1 Oracle 라이선스 경계 — 객체 기준
- 허용목록은 **프로필별로 나눈다**(C9): `BASE`(세션·SQL·락·sysmetric·tablespace·메모리·파라미터) / `CDB`(`V_$CON_SYSMETRIC·V_$PDBS·V_$CONTAINERS`) / `DG` / `ASM`(`V_$ASM_DISKGROUP_STAT`) / `RM` / `ACTUAL_PLAN`(`V_$SQL·V_$SQL_PLAN_STATISTICS_ALL`) / **`OBJECT_NAME`(`DBA_OBJECTS` 또는 CDB `CDB_OBJECTS` — `V$LOCKED_OBJECT`·`V$SQL_PLAN.OBJECT#`의 ID→이름 해석; 미허용이면 object ID만 표시)**. **각 실행 경로가 실제 호출하는 객체 ⊂ 활성화된 프로필의 허용목록**이어야 하며, 코드 리뷰 체크리스트에 "Oracle SQL 파일의 FROM 절 객체 ⊂ 프로필 허용목록" 자동 테스트를 둔다. 프로필은 `dbm_capability`로 노출.
- **호출 금지**: `V$ACTIVE_SESSION_HISTORY`·`X$ASH`·`DBA_HIST_*`(예외 6종 포함 전부 — 보수적으로)·`DBMS_WORKLOAD_REPOSITORY`·`V$SQL_MONITOR`·`V$SQL_PLAN_MONITOR`·`DBMS_XPLAN.DISPLAY_AWR`·`DBMS_SQLTUNE.*`·`DBMS_ADDM.*`.
- 문구 규칙: "V$ 뷰는 안전하다" 또는 "제한 뷰를 조회하면 항상 사용 통계에 기록된다" 같은 포괄 문장은 문서·화면에 쓰지 않는다. **"기본 패키지는 다음 객체만 호출합니다: …"** 로 쓴다.
- `ORACLE_DIAGNOSTICS`(팩 보유 고객 ASH 읽기)는 Q4(v1 제외).

### 4.2 권한 검사 리포트
등록 시 기능별 검사 SQL → `dbm_capability` 행(C/S/Q/P/L × **OK / MISSING(권한·설정 누락) / DISABLED(관리자 OFF) / UNSUPPORTED(GA 정책상 미지원 — 예: PG·MySQL P, Azure SQL DB 데드락, MariaDB 미지원 필드) / RECOMMENDED(권고 설정 미충족, 기능은 동작) / ERROR** + detail). 권한 누락과 정책 미지원은 다른 상태다. **(v2.2) 필수/권고 등급**: **S·C·L 필수** — 셋 중 하나라도 OK/RECOMMENDED가 아니면 대상 활성화 불가(등록·저장은 되되 "시작" 거부, 이유 표시) · **Q·P 권고** — 누락이면 탭 OFF+안내만, 활성화는 진행. 빈 리포트는 미충족으로 본다(코덱스 5차 #25). 화면은 이 행으로 탭 on/off. "접속 성공≠설정 완료". PDF/MD 내보내기(P4, 보안팀 제출용).

### 4.3 JDBC 드라이버 (R6)
| 엔진 | 드라이버 | 라이선스 | 번들 |
|---|---|---|---|
| PostgreSQL | `org.postgresql:postgresql` | BSD-2 | 있음 |
| Oracle | `com.oracle.database.jdbc:ojdbc11` | Oracle Free Use Terms(재배포 허용 조항 R6 확인) | 번들 |
| SQL Server | `com.microsoft.sqlserver:mssql-jdbc` | MIT | 번들 |
| MySQL/MariaDB | `org.mariadb.jdbc:mariadb-java-client` | LGPL-2.1 | 번들(Connector/J GPL 회피) |
| Tibero·CUBRID·Altibase | 고객 제공 jar | 재배포 불가 | **고객 업로드 로더** — `DBM_ADMIN`만, **허용 드라이버 클래스명 목록**, SHA-256 기록, 설치 이력 테이블, 적용은 **BE 재시작 후**(런타임 클래스로딩 금지 — 서버 코드 실행 경로이므로, 🔴11) |

### 4.4 실행계획 지원표 (D13, v1.2)
| 엔진 | GA | 종류 | 한계(화면·문서에 명시) | GA 밖 |
|---|---|---|---|---|
| Oracle | ✅ | `V$SQL_PLAN` 캐시(`PLAN_HASH_VALUE`별) | estimated rows만 기본; actual은 `STATISTICS_LEVEL=ALL`/`GATHER_PLAN_STATISTICS`일 때 `V$SQL_PLAN_STATISTICS_ALL`(옵션 grant) | `DISPLAY_CURSOR`(추가 grant), AWR 계열 금지 |
| SQL Server | ✅ | `dm_exec_query_plan` 캐시 XML(`query_plan_hash`별) | 캐시 evict 후 미회수, 파라미터 값 노드 제거(§5.5), 실제 row 통계 없음(Query Store P3) | 전용 XE 완료 이벤트(Q28) |
| PostgreSQL | ✖ | — | 캐시 플랜 없음. `EXPLAIN`은 문장 권한 필요 → 모니터링 계정으로 불가 | DB 변경 프로필(D18: GA 제외 확정 — 고객 요구 확인 뒤 별도 설계, 일정 미정): SECURITY DEFINER 함수 또는 업무 테이블 읽기 권한. `auto_explain` 로그 import 후속 검토 |
| MySQL/MariaDB | ✖ | — | `EXPLAIN`은 실행 권한 동일. MariaDB JSON은 `cost_info` 등 필드 누락 | DB 변경 프로필(D18: GA 제외 확정 — 고객 요구 확인 뒤 별도 설계, 일정 미정) |
플랜 쿠터(GA 엔진): 쿼리당 시간당 최대 N회 회수(기본 60)·플랜당 저장 15/h(Datadog 기본값을 출발점으로, R2에서 조정).

### 4.5 PostgreSQL namespace 순회 계약 (D15, v1.2)
- **서버 범위 1회**(fast/slow 레인): `pg_stat_activity`·`pg_stat_database`·복제·WAL·`pg_stat_statements`(확장 설치 DB 1개에 접속).
- **namespace 작업**(DB별 접속 필요): `pg_stat_user_tables/indexes`·`pg_statio_*`·`pg_stat_user_functions`·테이블/컬럼/인덱스/FK 정의·OID→이름 해석·relation 크기. P1a에는 **OID 이름 해석·DB별 relation 집계 최소**만, 스키마 스냅샷은 P3.
- 발견≠수집: `pg_database`(`datallowconn`, 템플릿·시스템 제외) + 실제 `CONNECT` 검사 → **후보 목록**. 관리자가 선택(기본 상한 **10 DB** — **D19로 확정**, 초과는 규모 프로필을 P4에서 인증한 뒤). 신규 DB는 후보로만 추가(전 DB 자동 활성화 금지).
- 예산: 대상당 namespace 접속 **1개**(fast·slow와 별도, 총 3), DB당 쿼리 예산(기본 3s), 순회 총예산(기본 10분당 20s), 전역 동시 namespace 작업 수 제한. 초과 시 cursor를 다음 주기로 이어가고 DB별 `last_success_at`·`PARTIAL` 표시. C/S/Q/L 기한이 항상 우선.
- 상한: `300 tables`는 **대상 전체 기준**, `50 columns`는 **테이블당**. 잘림은 completeness로 표시하고 변경(DROP)으로 해석하지 않음(G46). 삭제 확정은 같은 `scope_version`의 완전한 두 snapshot 사이에서만(§6.1).

### 4.6 클러스터 membership 최소 모델 (G12·G47, P2)
`dbm_cluster` + `dbm_cluster_member`(§6.1, **scope 포함**). 엔진별 근거는 **후보 증거**일 뿐 동일 운영 클러스터를 단독 보장하지 않는다(C6): PG `pg_control_system().system_identifier`는 같은 base backup 계통(현재 복제 관계는 `pg_stat_replication`/`pg_stat_wal_receiver`로 확인) · MySQL `SHOW REPLICA STATUS.Source_UUID`는 **채널별** 관계(`server_uuid`는 노드 식별자) · MSSQL AG는 `group_id` + DB replica `group_database_id`·`replica_id`(인스턴스 전체가 아니라 AG·DB 범위) · Oracle `V$DATABASE.DBID`+`DB_UNIQUE_NAME`(RAC 노드 = 같은 DB_UNIQUE_NAME, DG 멤버 = 다른 이름). membership 확정 = 현재 관계 관측 + 관리자 `confirmed` + 유효기간. **합산 규칙은 metric 카탈로그(부록 B)에 metric별로**: `scope`(instance/namespace/replica/AG) · 집계 대상 행 · 중복 제거 키(같은 replica 상태를 두 노드에서 관측하면 1건) · 가산(calls·rows·bytes) / 가중 평균(latency = Σtime/Σcalls) / 비율은 분자·분모 재집계 / 공유 스토리지·복제 지연은 합산 금지(대표값 선택 규칙: primary 관측값). **AG 밖 DB·인스턴스 공통 지표는 AG 합계에 넣지 않는다.** 개요 "클러스터로 묶기" 토글.

---

## 5. 수집기 아키텍처 — `premium/dbm/collector/`

### 5.1 실행 모델
```
DbmPollerManager (상주, 노드마다 1개)
 ├ 대상별 DbmTargetWorker
 │   ├ HikariDataSource ×2 레인: fast(max 1)·slow(max 1) — 서로 블로킹 안 함
 │   ├ fast 레인: SessionSampler(5s) · LockSampler(10s)     — tick 예산 2s(쿼리 타임아웃 포함)
 │   ├ slow 레인: CounterSampler(15s) · QueryStatsSampler(60s) · PlanFetcher(on-demand) — 예산 10s
 │   └ 정규화·마스킹(저장 직전 재검사) → BatchWriter 큐
 ├ 전용 ThreadPool(대상 수 × 2 + 여유, 이름 dbm-poller-*) — HTTP 스레드·PG 메인 풀과 분리
 ├ BatchWriter: 디스크 백업 큐(용량 상한) → JDBC batch INSERT(JPA 미사용) → dbm_* 파티션, (target, kind, epoch, seq) 멱등
 └ Lease(§5.2) · DeltaCheckpoint(§5.4) · Quality(§5.7)
```
- **지연 정책**: 목표 주기를 넘긴 tick은 건너뛴다(겹침·몰아치기 금지). `dbm_sample_batch.status=SKIPPED`.
- **타임아웃 계약**(🔴11): 엔진별 `connectTimeout`·`socketTimeout`·`queryTimeout`을 분리 설정. `Statement.cancel()` 실패 시 **연결 폐기·재생성**. Hikari `connectionTimeout`은 획득 예산일 뿐이다.
- **격리**: 대상 장애는 그 워커만 백오프(5s→60s 지수). **인증 실패(PG 28000·ORA-01017·MSSQL 18456·MySQL 1045)는 DOWN과 분리** → 재시도 중단(계정 잠김 악화 방지), `AUTH_FAILED` 알람, **자격증명 교체(`credential_version` 증가)로 자동 재개 또는 관리자 수동 재개**(v2.3 — 버전을 올리지 않는 비밀번호 변경은 재개를 만들지 않으므로 저장 경로가 버전 증가를 보장한다).
- **라이선스**: `AccessMode.FULL`이 아니면(=`EXPIRED`부터) **폴러 전체 정지**. 롤업·정리는 계속(§9). **코드(2026-10-27)**: 스케줄러가 아니라 설정 출처 `PgConfigSource`가 판정한다 — FULL 아님 → `LICENSE_EXPIRED`, FULL인데 `DB_MONITORING` 없음 → `FEATURE_DENIED` **거부 스냅샷**(D22) → 코어가 lease 전부 반납·대상 DB 접속 없음, 재허용 시 새 epoch. J2도 같은 envelope로 멈춘다(§3.6).
- **설정 전파**: `dbm_target.updated_at` 30s 폴링으로 워커 재구성. **코드**: `PgConfigSource` 30s 캐시(`app.dbm.poller.config-ttl-ms`) + 저장 경로의 `evict()`(즉시). 버전은 행 내용 해시(삭제도 보이고 노드 간 같은 값). **저장 경로(2026-10-28)**: `target.DbmTargetAdminService` — 등록·수정·삭제·자격증명·활성화 전환마다 commit 뒤 `evict()`. 다른 노드는 TTL 전파라 "전 노드 즉시"가 아니다(코덱스 9차 N14: 진행 중 load의 옛 스냅샷 재게시는 미해결).
- **코드 현황(2026-10-27, WS-2 잔여)**: 위 그림 중 `DbmPollerManager`(노드 1개, fast/slow 레인 스레드 각 1 — `scheduleWithFixedDelay`, `SmartLifecycle` 종료 시 lease 반납) ✅ · `BatchWriter`·lease·checkpoint ✅(J1 PG) · **대상별 워커·Hikari ×2 풀·디스크 백업 큐는 아직** — 지금은 tick마다 대상 접속 1개를 열고 닫는다(`ConnectionProvider.jdbc()`, 전용 풀은 WS-1 이월). 디스크 큐는 J2(P3b)의 장치로 확정 — J1 writer는 로컬 PG이고 우리 PG가 죽으면 lease도 30s 안에 끊겨 버퍼가 할 일이 없다. 어댑터는 `EngineAdapter` 빈 전부(WS-3 전까지 비어 있어 활성 대상은 `ADAPTER_MISSING` FAILED 배치).
- **namespace 접속**(D15, v1.2): PG 대상은 fast·slow 외 **namespace 레인 1개**(대상당 접속 최대 3). 생성·종료는 순회 단위, 취소 실패 시 연결 폐기, 전역 동시 namespace 작업 수 제한(`dbm_setting.namespace_concurrency`, 기본 4). DB당 총 경과 예산(연결·TLS·인증·조회·결과 전송 포함, 기본 3s)·10분당 20s.
- **레인별 노드 검증**(G32·C2, v1.2): fast·slow·namespace의 **모든 접속은 연결 시와 재연결 후 물리 노드 식별(`instance_name`·`boot_epoch`)을 확인**해 배치에 `node_id`를 기록한다. 관측 노드가 다른 배치끼리는 세션·통계·플랜을 **조인하지 않는다**(각각 저장, 화면에 노드 불일치 배지). endpoint 종류를 구분: **단일 노드 failover endpoint(VIP·리스너)는 GA 지원**, **읽기 분산 endpoint(접속마다 다른 노드)는 별도 인증 전 GA 미지원**으로 등록 시 거부·안내. "VIP 지원"을 Datadog 대비 우위로 쓰지 않는다.
- **TLS**(🔴11): 엔진별 기본 **검증 ON** — PG `sslmode=verify-full`(없으면 `require`로 경고), MSSQL `encrypt=true;trustServerCertificate=false`, MariaDB `sslMode=VERIFY_CA|VERIFY_FULL`, Oracle TCPS(JKS 트러스트스토어). 신뢰 CA는 `dbm_setting.trust_store`(업로드) 또는 JVM 기본. 검증 실패는 접속 실패로 처리하고 **다운그레이드 자동 전환 금지**(관리자가 명시적으로 `tls=disabled` 선택 시 배지).

### 5.2 lease — 다중 BE 노드 계약 (🔴4)
- **(v2.3 개정, 코덱스 6차 #7·B)** lease 열 `dbm_target.lease_owner, lease_run_id, lease_token bigint, lease_epoch bigint, lease_until` — assignment generation(`owner_kind·owner_id·assignment_generation`, §3.6 소유권)과 **구별**한다. 획득·갱신은 **DB 시각 기준의 짧은 원자적 트랜잭션**(UPDATE 한 문장, `SET`에서 증가시키고 저장된 값을 `RETURNING` — "`RETURNING lease_token+1`" 같은 표기는 저장 증가를 보장하지 않으므로 쓰지 않는다). TTL **30s**, 갱신 10s. (기존 `SchedulerLeaseService`는 30분 배치 잠금이라 쓰지 않는다.) 규칙:
  1. 비어 있거나 `lease_until <= db_now`인 lease의 신규 획득은 **같은 (owner, run_id)가 돌아온 경우를 포함하여** `lease_token+1`·`lease_epoch+1`(새 소유 구간). 그 사이 다른 노드가 가져갔다 놓았을 수 있어 이전 epoch의 seq를 이어 쓰면 안 된다.
  2. **유효한** lease를 동일 `(owner, run_id)`가 재요청하면 만료만 연장하고 token·epoch는 유지한다(갱신과 같다). 정상 재요청마다 token을 바꾸면 진행 중·큐에 있는 정상 배치를 불필요하게 fencing하고 seq 연속성이 흔들린다.
  3. 다른 실행 식별자(`run_id`)의 유효 lease 요청은 거부한다 — 같은 owner의 복제 프로세스도. J2는 할당된 collector·등록된 실행 식별자의 이전 절차를 별도로 검증하며, TTL 만료를 수집기 자동 교체 허가로 해석하지 않는다(§3.6).
  4. 갱신은 현재 owner·run·token·generation이 일치하고 만료 전인 경우만 허용하며 token·epoch는 변경하지 않는다. 런타임은 갱신 응답의 epoch·token이 바뀌어 오면 프로토콜 위반으로 보고 lease를 버린다.
  5. 반납은 현재 lease와 일치할 때만 만료 처리한다. 소유자 이력은 남겨도 되지만 반납된 lease는 실행·쓰기 허가로 쓸 수 없다.
  6. **writer는 현재 소유권(token·generation)·허가 유효성 검증과 배치 저장을 같은 원자적 경계에서 수행한다**(PG 트랜잭션). token을 먼저 읽고 별도 INSERT를 하는 writer는 그 사이의 인계를 놓친다. **J1의 델타 checkpoint 변경도 같은 commit에 포함한다**(§5.4).
  7. 동일 epoch를 재개하는 런타임은 seq를 보존한다. seq 이력을 잃은 실행이 동일 epoch의 seq 0부터 다시 쓰는 것은 허용하지 않는다 — 반납 실패로 소유권이 불확실하면 상태(epoch·seq)를 지우지 않고 다음 tick에 재시도한다.
  코드: 코어 `collector/core/local/InMemoryLeaseClient`가 이 규칙의 메모리 재현(`InMemoryLeaseClientTest`); **PG 구현 `premium.dbm.collector.j1.PgLeaseClient`(2026-10-26)** — 획득·갱신·반납이 각각 UPDATE 한 문장(`WHERE`에서 판정, `SET` CASE로 token·epoch 증가, `RETURNING`), 시각 비교는 전부 DB `now()`. `DbmJ1PgStoreIT.leaseRules`가 규칙 1~5를 실 PG에서 단언. writer 쪽 원자 경계(규칙 6)는 `PgBatchWriter`가 `dbm_target` 행을 `FOR SHARE`로 잡아 인계 UPDATE가 커밋을 기다리게 한다.
- **fencing**: 모든 적재 배치는 `lease_token`·`assignment_generation`을 들고 가며 writer가 `dbm_target`의 현재 값과 **같은 트랜잭션 안에서** 비교해 불일치면 **거부**(`CONFLICT`+`STALE_LEASE`/`GENERATION_MISMATCH`, 소유권 상실 후 쓰기 차단). 코어는 CONFLICT를 받으면 그 대상의 lease를 버리고 남은 kind를 중단한다. **같은 키·다른 payload**는 fencing이 아니라 `IDEMPOTENCY_CONFLICT`(그 대상 격리·수동 재개·알람) — 구조화된 사유로 구별한다(§3.6 수신 오류 분류, 코덱스 6차 #10).
- 수집 RTO: 노드 사망 후 ≤30s 내 다른 노드가 인계(Q15 확정값). 인계 구간은 `coverage` 공백으로 남는다.
- 왜 `SchedulerJob`이 아닌가(🟡3 정정): `SchedulerManager`는 `interval_seconds`를 처리하므로 초 단위가 불가능한 것은 아니다. 상주 루프를 택하는 이유는 **대상별 독립 주기·지연 건너뛰기·fast/slow 레인 격리**다. 대신 기존 스케줄러의 관측·라이선스 차단을 우회하는 별도 실행 체계가 생기므로 ① `scheduler_setting(dbm_poller)`로 on/off·전역 배수 노출(`SCHEDULER_JOB_CATALOG` 등재) — **WS-4로 이월**(`SchedulerManager`가 job bean 없는 행마다 기동 WARN을 내므로 "상주 잡" 표현을 함께 넣을 때; 지금 노드 on/off는 `app.dbm.poller.enabled`) ② 폴러 상태(레인별 tick·실패·마지막 tick, 대상별 lease·epoch·seq·정지)를 `GET /dbm/poller/status`(**✅ 2026-10-27**, 노드 단위 — 다중 노드 합산은 WS-1 대상 목록 EP)와 관리 콘솔 스케줄러 표 행에 표시 ③ 중지 명령은 같은 설정 행으로. 롤업(`dbm_rollup`)·정리(`dbm_cleanup`)는 정상 `SchedulerJob`(`requiresActiveLicense=false`).

### 5.3 세션 샘플링 정책
| 항목 | 정책 |
|---|---|
| 대상 | **활성·대기 세션** + 장기 트랜잭션 + **idle blocker**. 순수 idle은 카운트만 |
| 세션 키 | `(target_uid, node_boot_epoch, native_session_id, serial/login_time)` |
| 5s 조회 열 | 상태·wait class/event·sql native id·블로커·경과·user·**client(address·port·hostname·application/program — 구조화, 소스에 없으면 NULL, 가명화는 보안 프로필 Q7)**·db name(전부 surrogate)·엔진 원생 문맥(Oracle `module/action/client_identifier`, MSSQL `program_name`, PG `application_name`). SQL 텍스트는 캐시 miss 시만 보강(slow 레인) |
| 의미 한계(G42·G43) | 주기 샘플은 **긴 실행을 더 자주 포착**하고 상한 우선순위(blocker→대기→활성)는 **진단용 편향**을 더한다. 샘플 경과값의 p90/p99는 "완료 실행 지연 p90"이 아니라 **"관측 시점 경과 분포"** — API·화면 명칭을 `observedElapsedP90`처럼 구분하고 workload 분포로 외삽하지 않는다 |
| 간격 | 기본 5s, 대상별 1~10s. **1s 허용 조건 = 전체 적재 예산**: `Σ(활성 세션/간격)` ≤ 설정값(기본 2,000행/초)·디스크 예산 내·수집 지연 <1s·대상 DB 영향 R2 기준. 또는 **30분 한정 진단 프로필**(자동 복귀) |
| 반환 상한 1,000행 | **결정적 우선순위**: ① blocker(누군가를 막는 세션) ② 대기 중 ③ 활성(경과 내림차순). `total_rows`(DB가 보고한 전체)와 `stored_rows`를 **분리 저장**. 잘림은 품질 축 `row_truncated` |
| AAS | **실제 활성 상태만** 분자(idle blocker·장기 트랜잭션은 조사 자료로 저장하되 제외). 시간 가중 → `dbm_activity_1m`(wait_class × query × user). 그룹 상한(50) 초과분은 `__other__`로 **총량 보존**, SQL 분해만 불완전 표시 |
| 의미 | 샘플은 실행 이력이 아니다 — 화면 각주 "5초 미만 실행은 포착될 수도, 누락될 수도 있습니다" |

### 5.4 Top SQL(Q) — 델타·checkpoint (🔴4)
- `dbm_delta_checkpoint(target_uid, kind, node_boot_epoch, native_key, last_values jsonb, observed_at, poller_run_id)` — 델타 기준값을 **PG에 보관**. BE 재시작·노드 인계 후 첫 관측은 **기준값으로만 저장**하고 해당 분을 `partial`로 표시(누적 전체를 증가량으로 적재하는 사고 차단). **(v2.3)** 코어는 어댑터에 `continuity`를 알린다 = 저장된 기준값이 **이 실행**(`poller_run_id` 일치)의 것이거나 런타임 옵션 `resumeAcrossRuns`가 켜진 구성. J1은 옵션 off(여기 규칙 그대로), J2는 **큐 append와 checkpoint 전진이 한 durable commit임이 증명된 구성에서만** on해 재시작 뒤 이어 쓴다(R11). **checkpoint 전진은 배치 저장과 한 commit**이다(§5.2 규칙 6, 코덱스 5차 #22·6차 #1) — 분리되면 "배치는 저장, checkpoint는 옛값"에서 다음 관측이 겹치는 델타를 새 seq로 보내 서버 멱등이 거르지 못한다(이중 집계).
- 리셋 판정: 카운터 감소 **또는** `node_boot_epoch`/DB 시작 시각 변화 **또는** 기준값 없음 → 새 통계 구간(`reset_seq++`). 감소만 보면 재시작 뒤 값이 이미 커진 경우를 놓친다.
- Top N은 **차분 후 정렬**. 스캔 상한(500)에 걸리면 "전체 Top SQL" 표현 금지. **장기(1h) Top N 압축으로 누락되는 SQL이 있음을 화면에 명시**(Q19).
- 지표: calls·total_ms·avg(=Δtotal/Δcalls)·cpu·rows·lreads·preads·엔진별 extra. 엔진마다 CPU·elapsed·wait 정의가 달라 **공통 화면엔 비교 가능한 값만**, 원 단위·출처 보존.
- **extra 키 고정(G17·G18)** — `dbm_query_stat.extra jsonb`의 키는 엔진별 상수 목록이며 각 키에 **누적(차분)/게이지(last)/min·max(차분 금지)** 유형을 붙인다. MySQL: `errors·warnings·lock_time·rows_examined·rows_sent·rows_affected·tmp_disk_tables·tmp_tables·no_index_used·no_good_index_used·select_scan·select_full_join·sort_merge_passes·sort_rows`(전부 누적; MariaDB 미지원 키는 `unavailable`, 0 금지). MSSQL: `worker_time·logical_reads·logical_writes·physical_reads·spills·clr_time`(누적) · `memory_grant·used_memory_grant·ideal_memory_grant·dop·used_threads·reserved_threads`(**total/last/min/max 열 구분** — `total_*`만 차분, `last_*`는 게이지). PG: `shared_blks_hit/read/dirtied/written·local_*·temp_*·blk_read_time·blk_write_time·wal_records/bytes(13+)`(누적). Oracle: `cpu_time·buffer_gets·disk_reads·direct_writes·rows_processed·parse_calls·fetches·user_io_wait_time·concurrency_wait_time·application_wait_time·cluster_wait_time`(누적).
- **`__other__` 행(G8·C3)**: 1m 버킷마다 `Σ전체 − ΣTopN`을 `__other__` native 행으로 저장 — 단 **"전체"는 같은 관측·델타 집합에서 나온 Σ만**(스캔 상한·eviction·첫 관측 partial이 있으면 `other_complete=false`). `other_complete=false`면 **전체 대비 점유율은 NULL**(상·하한으로도 해석 금지 — 미관측 SQL 시간이 얼마든 더 있을 수 있다). 필요하면 **"관측 집합 내 점유율"**을 별도 명칭(`observedShare`)으로만 표시. `__other__`(알려진 합계)와 `__overflow__`(식별 손실)는 다른 뜻.
- **PG `toplevel`(G48·C5)**: `pg_stat_statements.track=ALL`이면 상위 호출과 내부 SQL 시간이 중첩된다. **PG native·checkpoint 식별 키 = `(dbid, userid, queryid, toplevel)`**(확장 뷰의 실제 행 구분 기준). **Q 총량·점유율의 기본 집합 = toplevel=true**, 중첩 SQL은 드릴다운에서만. `toplevel`이 없는 13 이하에서 `track=all`이면 "중첩 구분 불가" 표시 + 전체 점유율 완전성 주장 금지, `track=top` 권고(RECOMMENDED).
- **차원 quota(G25·C4)**: 샘플(S)의 정규화 쿼리 종류는 Top N과 무관하게 무제한으로 늘 수 있다 → `dbm_query_dimension`·`dbm_query_native`·`dbm_plan`·`dbm_delta_checkpoint`에 **대상당 행 수 상한**(기본 dimension 20,000·native 50,000·plan 5,000·checkpoint 10,000) **+ 바이트 예산**(텍스트·플랜·checkpoint jsonb 합, 기본 대상당 256MB). 규칙: ① **참조 중인 ID는 재사용·삭제하지 않는다** ② 정리는 참조 끊긴 항목 LRU만 ③ 참조 중 항목만으로 quota가 차면 **신규 식별 admission을 제한**(새 SQL은 `__overflow__` 차원으로 집계, `dimension_overflow` 품질 축) ④ **`__overflow__`는 native별 차분 뒤 합산**한 결과만 담는다 — 서로 다른 native의 누적값을 한 키로 합친 뒤 차분하지 않는다(구성 변화가 가짜 델타·리셋을 만듦) ⑤ checkpoint가 없는 native는 baseline/partial 처리. 스캔 상한 500은 회당 조회 상한일 뿐 이 quota와 무관.
- **Q의 사용자 문맥(G41)**: 엔진마다 뜻이 다르므로 한 축으로 합치지 않는다 — PG `execution_user`(userid) · MySQL `schema`(default schema, 사용자 아님) · Oracle `parsing_schema`(PARSING_SCHEMA_NAME) · **MSSQL 없음**(`dm_exec_query_stats`에 실행 user 없음 → NULL). 화면 "사용자별 SQL" 축은 S(세션 `user`)에서만.
- **MSSQL 프로시저 통계(G3·C8)**: `dm_exec_procedure_stats`는 **캐시된 플랜별 행**(`plan_handle`·`cached_time`). checkpoint 키 = `(node, dbid, object_id, plan_handle, cached_time)`, 캐시 수명이 바뀌면 baseline 재설정(감소 감지만으론 재컴파일 뒤 이미 커진 값을 놓침). 표시용 프로시저 단위 합계는 native(플랜)별 차분 뒤 합산.
- **소스 포화·리셋 관측(G34)**: `pg_stat_statements` dealloc 수·`performance_schema_digests_size` 대비 digest 행 수·MSSQL 플랜 캐시 evict 수·Oracle `V$SQLSTATS` 상한을 `dbm_capability.detail`과 Q 품질 축 `source_visibility`로 표시. digest 자동 TRUNCATE·리셋 호출은 하지 않는다.
- 식별: `dbm_query_native(target_uid, engine_native_id, context{dbid,userid,schema})` ↔ `dbm_query_dimension(fingerprint, algo_ver, normalized_text)` **다대일**. 플랜도 native 쪽에 붙는다.
- `seq`는 **대상·epoch 전체에서 증가하며 kind별로는 불연속일 수 있다**(v2.3 정정 — 코어가 대상당 카운터 하나를 쓴다; 수신기는 kind별 연속 seq를 요구하지 않는다). 쓰기 시도마다 소비(결과가 RETRY_LATER여도). `UNIQUE(target_uid, kind, epoch, seq)`.

### 5.5 SQL 텍스트·바인드·플랜 보호 (🔴2)
| 데이터 | 정책 |
|---|---|
| SQL 텍스트 | **모든 텍스트가 저장 직전 방언별 검사기를 통과**해야 저장 — 엔진 정규화 텍스트(PG `$1`·MySQL `?`)도 예외 없음(PG 문서: 정규화 가능한 쿼리에도 상수가 남는 경우가 있다). 검사기 = 토크나이저(문자열·숫자·q-quote·dollar-quote·주석 중첩·escape·괄호 식별자·바이너리/16진 리터럴·잘린 SQL 인식) → 리터럴 `?` 치환. 실패/불확실 = **텍스트 폐기, 해시+`masking_failed`만**. **(v2.2) 서버 문자열 설정에 따라 끝이 달라지는 입력**(PG `standard_conforming_strings`·MySQL `sql_mode NO_BACKSLASH_ESCAPES`)은 capability 검사에서 읽어 토크나이저 옵션으로 넘긴다 — 설정을 읽지 못한 대상은 S·Q 텍스트를 저장하지 않는다(해시만). 숫자 뒤 식별자 문자(`5abc`·`1e`·`0xG`)는 MySQL(숫자 시작 식별자 문법) 외에는 폐기(코덱스 5차 #2·#3) |
| 바인드 값 | 수집 안 함. **금지 소스 목록**: Oracle `V$SQL_BIND_CAPTURE`·`V$SQL_PLAN.OTHER_XML`의 `peeked_binds`, MSSQL 플랜 XML `ParameterList/@ParameterCompiledValue`·`ParameterRuntimeValue`, PG `pg_stat_activity.query` 안의 리터럴(검사기), MySQL `QUERY_SAMPLE_TEXT`(digest만 사용). `keep_raw_sql` opt-in이라도 **PG extended protocol·prepared statement의 바인드 값은 SQL 텍스트와 분리돼 현 소스에 없다**(복원 기대 금지, G20) |
| 토크나이저 부산물(G19) | P1a: **명령 유형**(SELECT/INSERT/UPDATE/DELETE/DDL/기타)과 **승인된 키의 주석 태그**(`/*key='val'*/` sqlcommenter/marginalia 형식, 키 허용목록 `dbm_setting.tag_keys`, 값 길이·cardinality 상한)만 추출. **주석 전체는 보존하지 않는다.** P3는 승인 태그 활용(서비스 귀속)과 **제한된 객체 연결**(FROM/JOIN 직접 참조 테이블명)까지, **완전 lineage(CTE·alias·동적 SQL·뷰 전개)는 별도 과제**. fingerprint 계산 전에 주석 제거(태그가 달라도 같은 SQL) |
| 플랜 | **구조 파싱**(XML/JSON/행) → 공통 트리로 변환하며 **허용 필드 보존**(operation·object·cost·cardinality·bytes·access/filter predicate의 **마스킹된** 식) **민감 필드 제거**(파라미터 값·peeked binds·리터럴). 숫자를 뭉개서 cost·rows를 훼손하지 않는다 |
| 사용자명·client host·program | 저장(필터 축). **보안 프로필**로 가명화 선택(Q7) — 가명화 키 변경 시 과거 필터 연속성은 끊어짐을 고지 |
| 원문 보존 | `dbm_setting.keep_raw_sql`(APM 키와 별개) opt-in·감사·배너·`DBM_RAW_SQL_VIEW` 권한. 복원 불가 |
| 적용 범위 | 디스크 백업 큐·예외 로그·진단 번들·내보내기 **전부 같은 정책**(큐에 원문이 남는 경로 차단) |
| 재실행 | 고객 SQL 재실행 없음. **GA는 고객 SQL의 `EXPLAIN` 재계획도 수행하지 않는다**(D13 — 캐시 플랜만 읽음). 후속 프로필은 D18에 따라 고객 요구 확인 뒤 별도 설계(일정 미정). `EXPLAIN ANALYZE`는 영구 금지 |
| fixture(R3) | 200건 + **잘린 SQL·주석·DDL·중첩 문자열·비정상 인코딩·한글 식별자**. "잔존 0"은 fixture 통과를 뜻하며 보증이 아님 — 문구 주의 |

### 5.6 자격증명·키 운영 (D7)
- 저장: `SettingSecretCodec`(AES-256-GCM, `enc:v1:`, 설치본별 `CREDENTIAL_ENCRYPTION_KEY`) 재사용. API 응답에 비밀번호 미포함, 연결 테스트는 임시 접속. **저장 형식(2026-10-28)**: `store.DbmSecretCodec` — `enc:v2:<keyId>:<payload>`(keyId = 키 SHA-256 앞 8 hex; 알고리즘·키는 Codec 그대로, v1도 읽음, **접두어 없는 평문은 거부**). 쓰는 곳은 `DbmTargetAdminService.saveCredential`/`create`만, 읽는 곳은 `CodecSecretResolver`·활성화 검사. **복호화(2026-10-27)**: `collector.j1.CodecSecretResolver` — 접속 직전 `dbm_credential` 1행 조회·복호화, **캐시 없음**(버전 증가가 다음 접속에 바로 보여야 AUTH_FAILED 자동 재개가 성립), 실패는 예외 대신 null(`SECRET_UNAVAILABLE`) + WARN 버전마다 1회(암호문·평문 미기록).
- **키 운영(추가 설계, P1a)**: `enc:v2:<keyId>:` 형식으로 **key ID 도입**(Codec 확장, v1 형식 계속 읽음) · 복수 키 복호화(교체 중) · 교체 절차(`dbm`·`setting` 전 행 재암호화 배치 + 감사) · 복호화 실패 진단(`dbm_target.credential_status=DECRYPT_FAILED`) · PG 덤프와 키 파일 백업 권한 분리 가이드.
- 자격증명 수명(§5.8): 변경 이력 테이블, 교체 시 풀 재생성·실패 시 롤백.
- Oracle Wallet·Kerberos·MSSQL 통합 인증·외부 비밀관리(Vault) 연동: **Q8 — 일괄 비범위 아님**, 고객군별 최소 구성 결정.

### 5.7 품질 판정 — 세 축 (🔴10)
`dbm_sample_batch`: `status(OK|PARTIAL|FAILED|SKIPPED)` · `time_coverage`(성공 tick/기대 tick) · `row_truncated`(total_rows vs stored_rows) · `text_truncated`(엔진 길이 상한에 걸린 SQL 수) · `elapsed_ms` · `error_code`. 조회 응답은 셋을 **각각** 반환하고 `last_success_at`·`observedAt`·`ageMs`·`batchId`를 동반. 행 잘림이 있는 tick은 time_coverage엔 성공으로 세되 AAS 차트에 해칭.

### 5.8 운영 계약 — 고객이 물을 질문 (검수 B 전건)
| 질문 | 계약 |
|---|---|
| BE 2대 중 1대가 죽으면 | lease TTL 30s → ≤30s 인계(Q15), 공백은 coverage로 표시, 중복 적재는 fencing으로 차단 |
| 저장 PG가 멈추면 | 노드별 **디스크 백업 큐**(기본 256MB·바이트 상한, 초과 시 오래된 세션 샘플부터 폐기, 카운터·락은 유지) → 복구 후 재적재(멱등). 폐기량은 `dbm_sample_batch`에 `DROPPED_LOCAL` 로 남김 |
| VIP 전환·AG 승격·PG failover 후 같은 DB인가 | 논리 대상(`dbm_target`)은 유지, **관측 노드(`dbm_node`)가 바뀌고 `boot_epoch`가 새로 열림** → 델타 기준 재설정·역할(primary/replica) 변경 이벤트 기록 |
| 5,000 세션에서 어떤 1,000개를 보존하나 | §5.3 결정적 우선순위 + total/stored 분리 + `row_truncated`. R2에 5,000 세션 부하 포함 |
| 시간대 | 모든 `observed_at`은 **UTC**(BE가 수신 시각 기준), DB 서버 TZ·clock skew는 `dbm_node.db_clock_offset_ms`로 측정(접속 시 `SELECT now()` 비교)해 세션 경과 시간은 **DB 보고 경과값(monotonic)** 우선. FE는 브라우저 TZ 표시 |
| 한글 SQL·계정·객체명 | JDBC 연결 charset 명시(UTF-8), 길이 상한은 **문자 단위**, 마스킹 fixture에 한글·깨진 인코딩 포함, 깨짐 감지 시 `text_encoding_suspect` |
| 접속 실패 알람 폭주 | `DOWN`은 대상별 1건(상태 기반), **상위 원인 억제**: 같은 Zabbix 호스트 다운·BE 네트워크 전체 실패 시 개별 DOWN 억제 · 유지보수 창(기존 Zabbix maintenance 연동) · 재통지 간격·연속 회복 N회 후 복구 |
| 계정 비밀번호 만료·잠김·교체 | 인증 실패 분류(§5.1) → `AUTH_FAILED` 알람·재시도 중단 · 교체 이력(`dbm_credential_history`) · 교체 시 풀 재생성·실패 시 롤백 |
| 누가 원문·플랜을 보거나 반출했나 | `dbm_audit`(조회·내보내기·권한 변경·보존 변경·keep_raw_sql 토글·드라이버 설치) 180일 |
| 운영자가 모든 DB의 SQL을 볼 수 있나 | 권한 3종(§9) + **대상 그룹 스코프**(`DBM_VIEW`에 target group 바인딩, Q17) |
| DB Hang이면 | JDBC 타임아웃 → `FAILED` 배치, 화면은 **마지막 관측 시각 + "수집 불가(타임아웃)"**. 메모리 직접 접근 방식(MaxGauge SGA)과 달리 Hang 중 내부 상태는 못 본다 — 문서에 한계 명시 |
| 백업 지연·DB 오류 로그·파라미터 변경 | GA 범위표: 백업 age(MSSQL `msdb`·PG 없음·Oracle `V$RMAN_BACKUP_JOB_DETAILS`는 권한 추가) **P3 선택**, 오류 로그 **비범위**(파일), **설정 스냅샷은 P1b**(G1: `pg_settings`/`global_variables`/`sys.configurations`/`V$PARAMETER`, 600s, **승인 키 목록만**(경로·접속정보·확장 설정 등 민감 키 제외), 인스턴스 설정과 DB·세션별 설정 구분), 변경 diff 알람(`SETTING_CHANGE`) **P3** |
| PG 인스턴스에 DB가 50개면 | Q 통계는 1회(서버 전체). namespace 작업은 선택 DB(기본 ≤10)만, DB당 3s·10분당 20s 예산, 초과분은 다음 주기 cursor + `PARTIAL`. 50 DB 전부는 규모 프로필(D19) P4 인증 뒤 |
| 데드락을 전부 보나(MSSQL) | 기존 `system_health`에서 읽으므로 **ring_buffer 유실·재시작·XML 잘림이 있을 수 있다** — 건수는 `pg_stat_database.deadlocks`/`innodb.deadlocks`/MSSQL `locks.deadlocks` 카운터가 정본, 그래프는 "포착된 것". 전용 세션은 Q28 |

---

## 6. 데이터 모델 — PG `dbm_*` (Flyway V90~ — **V90 `dbm_core` 작성 2026-10-26**: 아래 표 중 `dbm_target`·`dbm_endpoint`·`dbm_credential`·`dbm_capability`·`dbm_sample_batch`·`dbm_delta_checkpoint` + 🧪 `dbm_sample_row`(보호된 행 jsonb 임시 보관 — WS-3 typed 표가 생기면 이전·제거). 나머지는 WS별 번호. 시각 열은 전부 timestamptz(UTC epoch ms 왕복 정확), lease 판정은 DB `now()`)

### 6.1 테이블 골자 (🔴3·🔴5·🔴6 반영)
| 테이블 | 핵심 | 보존 |
|---|---|---|
| `dbm_target` | **논리 대상** `target_uid uuid` · engine · display_name · poll profile · lease(owner/token/until) · enabled · credential_status | 수명 |
| `dbm_endpoint` | target × (host·port·service/db·tls 설정·priority) — VIP/리스너/AG 리스너 등 접속점 | 수명 |
| `dbm_node` | target × 관측 물리 노드(`instance_name`·`host_name`·`version`·`edition`·`boot_epoch`·`role`·`db_clock_offset_ms`·first/last_seen) | 수명 |
| `dbm_namespace` | target × DB/PDB/schema 네임스페이스(이름·oid/dbid·first/last_seen) | 수명 |
| `dbm_credential` / `dbm_credential_history` | target → `password_enc`(enc:v2:keyId) · username · auth_kind · 변경 이력 | 수명 / 400일 |
| `dbm_capability` | target × grade → status·detail·checked_at (+이력) | 현재+로그 |
| `dbm_zbx_link` | target × `(datasource_id, hostid, role OS_HOST\|DB_HOST)` · confirmed | 수명 |
| `dbm_apm_endpoint_obs`(P3) | APM 서비스 × `(server.address, port, namespace)` 관측(5m, 호출 수·p95) — **APM 쪽 신설 롤업**(§8.4) | 30일 |
| `dbm_apm_link` | target ↔ apm_service · match 근거 · confirmed | 수명 |
| `dbm_sample_batch` | target · kind · `node_id` · `epoch` · `seq` · **`observed_at`(UTC)** · received_at · status · time_coverage · row_truncated(total/stored) · text_truncated · elapsed_ms · lease_token · source. `UNIQUE(target_uid, kind, epoch, seq)` | **7일**(✅ `dbm_retention` V91, DELETE 5,000건씩) · 일 집계 180일(P1b) |
| `dbm_delta_checkpoint` | target × kind × node_boot_epoch × native_key → last_values jsonb · observed_at · poller_run_id | 현재 |
| `dbm_session_sample` | **`observed_at`(파티션 키, PK 포함)** · batch_id · target_uid · session_key · state · wait_id · query_native_id · blocker_session_key · elapsed_ms(DB 보고) · user_id · client_id · program_id · namespace_id | **2일**(일 파티션 DROP; "48h 이상, 파티션 경계까지") |
| `dbm_lock_edge` | observed_at(파티션) · target · waiter_key · blocker_key · object_id · mode · wait_ms | **2일**(세션과 동일 창 — 🔴6) |
| `dbm_lock_incident` | target · root_blocker · first/last_seen · max_depth · victims · status | 400일 |
| `dbm_activity_1m` / `_5m` / `_1h` | target × bucket × wait_class × query_dim × user → active_seconds 합·sample_count·**동시 활성 min/max**·coverage(`__other__` 포함) | **7일 / 30일 / 400일**(v2.5 계단) |
| `dbm_query_dimension` | `fingerprint`·algo_ver·normalized_text(≤8KB, **별도 TTL**)·first/last_seen | **참조가 남는 동안 ID 유지**, 텍스트는 **마지막 관측 후 400일**(추세와 같은 창 — 이름 없는 Top SQL 추세 방지, v2.5) 후 NULL |
| `dbm_query_native` | target × engine_native_id × context(엔진별: PG `dbid,userid,queryid,toplevel` / MySQL `schema,digest` / MSSQL `dbid,query_hash` / Oracle `sql_id,plan_hash,parsing_schema`) → query_dim_id · plan 현재. **참조 중 ID 불변**(§5.4 quota) | 참조 수명 |
| `dbm_query_stat_1m` / `_5m` / `_1h` | target × bucket × query_native → calls·total_ms·cpu_ms·rows·lreads·preads·extra·reset_seq·truncated + **호출당 지연 min/max** | **7일(대상당 Top 50/분) / 30일(Top 100) / 400일(Top 200/시)** — 1h 표 크기를 Top N이 결정(500이면 50대상 70GB) |
| `dbm_plan` | query_native × plan_hash × kind(ESTIMATED/CACHED) → masked_plan jsonb · observed_at · is_current | 마지막 관측 후 30일 |
| `dbm_wait_dimension` | engine × native_wait → common_class | 수명 |
| `dbm_dimension_text` | user·**client(address·port·hostname)**·program/application·**tag(승인 키=값)**(target 스코프) · last_seen · **TTL 마지막 관측 후 400일 기본**(추세와 같은 창; 개인정보 관점에서 짧게 줄이는 관리 옵션 — Q35) · 대상당 상한(§5.4 quota) | 400일(옵션) |
| `dbm_metric_1m` / `_5m` / `_1h` | target × metric(허용목록 상수) × bucket → **count·sum·min·max**(APM `apm_metric_*` 열 구성) | **7일 / 30일 / 400일** |
| `dbm_setting_snapshot`(**P1b**, G1) | target × namespace? × 승인 키 → value·observed_at·hash. 변경 시만 새 행(diff는 P3) | 400일 |
| `dbm_proc_stat_1m` / `_1h`(P2, G3·C8) | MSSQL target × bucket × 프로시저 `(dbid, object_id)` 표시 단위(native = 캐시 플랜 `plan_handle,cached_time`, checkpoint는 native) → calls·total_ms·worker_ms·lreads·lwrites·preads·spills·reset_seq. **저장 조건: 그 분에 실행이 있었던(Δcalls>0) 프로시저만, 1m은 대상당 Top 200/분**(C7 용량). 프로시저↔내부 SQL 관계는 S에서만(완전 복원 약속 없음) | 7일 / 180일(1h Top 500/일) |
| `dbm_deadlock_event`(P2 조건부, G6·C-B4) | target × `(node_id, source_kind·source_lifetime, event_ts_utc, normalized_content_hash)` UNIQUE → victim·participants(세션·마스킹 SQL·리소스)·masked_xml·completeness. 소스 = `system_health` `event_file`(서버 측 `sys.fn_xe_file_target_read_file`, 경로는 DB 서버 로컬) 우선, 없으면 ring_buffer. **파일 순회 checkpoint 별도**(`file_name, file_offset` — offset은 버퍼 위치라 한 offset 안의 여러 이벤트를 전부 처리한 뒤에만 전진). 재조회·저장 멱등. 알람 `DEADLOCK`은 카운터 증가와 신규 이벤트를 **같은 사건 창(5분)에서 1건으로 통합** | 180일 |
| `dbm_cluster` / `dbm_cluster_member`(P2, G12·C6) | `dbm_cluster(cluster_uid, engine, kind, name, confirmed)` · `dbm_cluster_member(cluster_uid, target_uid, **scope_kind, scope_ref**(namespace/replica/replication_channel/AG database), role, evidence, valid_from/to)`. 발견 식별자는 **후보 근거**로만 저장, 확정은 현재 복제 관계 관측 + 관리자 확인 + 관측 유효기간. 합산은 scope가 일치하는 metric만(§4.6) | 수명 |
| `dbm_schema_snapshot` / `dbm_schema_object`(P3, G2·G46) | target × namespace × snapshot(`snapshot_version`·`scope_version`·completeness) → 테이블·컬럼·인덱스·FK 정의 해시. **삭제 확정은 같은 `scope_version`의 완전한 두 snapshot 사이에서만**; 권한·선택 DB·cap 변경 시 `scope_version` 증가 | 스냅샷 90일 |
| `dbm_object_stat_1h`(P3, G4) | target × namespace × relation/index → seq_scan·idx_scan·n_live/dead_tup·size·last_vacuum·user_seeks/scans(MSSQL)·관측 구간·리셋 | 180일 |
| `dbm_alert_rule` · `dbm_alert_event` · `dbm_alert_outbox` | §7 | 이벤트 400일(해소 후) |
| `dbm_audit` | actor·action·target·detail | 400일 |
| `dbm_driver` | 업로드 jar: 파일명·sha256·class·installed_by·at·active | 수명 |
| `dbm_collector` / `dbm_collector_target`(v2, D21) | `dbm_collector(collector_id uuid, name, token_hash, pubkey, version, status, last_heartbeat_at, clock_offset_ms, queue_bytes, enrolled_by/at, revoked_at)` · `dbm_collector_target(collector_id, target_uid, assigned_at)` — 대상은 J1(BE) 또는 J2(수집기 1개) 중 **한 소유자**. `dbm_sample_batch.source`에 `COLLECTOR` 추가 + `collector_id` | 수명 |
| `dbm_setting` | keep_raw_sql·ingest_budget_rows_s·trust_store·tag_keys·… — **보존 일수는 여기 아니라 `dbm_retention` 잡 `options`**(APM `apm_retention` 패턴, v2.5 D23). ~~session_raw_retention_h·disk_budget_gb·min_guaranteed_days~~ 삭제 | — |

**보존 계단·추세 표 열 구성(v2.5, D23)** — Zabbix history→trends·APM 1m→5m→1h와 같은 모양:

| 계단 | 표 | 기본 보존 | 열 구성 |
|---|---|---|---|
| 원본 | `dbm_session_sample`·`dbm_lock_edge` | **2일** | 행 그대로(재생 전용) |
| 1분 | `dbm_activity_1m`·`dbm_query_stat_1m`(Top 50/분)·`dbm_metric_1m` | **7일** | 합·sample_count |
| 5분(신설) | `_5m` 셋 | **30일** | 합·sample_count·**min·max** |
| 추세 1시간 | `_1h` 셋(Top SQL은 Top 200/시) | **400일** | 합·sample_count·**min·max** — 평균만 남기면 1년 뒤 "그날 피크"에 답을 못 한다(Zabbix trends는 min·avg·max·num, APM은 +히스토그램) |
| 사건·이력 | `dbm_lock_incident`·`dbm_alert_event`·`dbm_audit`·`dbm_credential_history`·`dbm_setting_snapshot` | **400일** | 보관 의무(1년)의 핵심 |
| 차원 | `dbm_query_dimension` 텍스트·`dbm_dimension_text` | 마지막 관측 후 **400일**(Q35) | 추세와 같은 창이어야 이름 있는 추세가 된다 |
| 배치 메타 | `dbm_sample_batch`(🧪`dbm_sample_row`는 V92에서 제거) | **7일** ✅ V91 | DELETE(비파티션) |

**구현 현황(v2.8, 2026-10-27)**: 원본 2일(`dbm_session_sample`·`dbm_lock_edge`)·1분 7일(`dbm_metric_1m`·`dbm_query_stat_1m`)·차원 400일(텍스트 NULL·text/native DELETE)은 **V92 + `dbm_retention` 단계로 실제 동작**(`DbmRetentionJobIT`). 5m 30일·1h 400일·`dbm_activity_1m`은 WS-10(V93~). 사실 표는 FK 없이 파티션 DROP만, 차원 표는 target FK CASCADE + `last_seen` 정리.

롤업 SQL은 APM과 같이 `sum(count)·sum(sum)·min(min)·max(max)` — 어느 계단에서도 정보가 더 깎이지 않는다. Top SQL의 지연 분포(히스토그램)는 소스가 `pg_stat_statements` 누적치(평균만)라 PG에선 채울 수 없다 — 열은 두고 엔진이 주면 채운다. 보존 일수의 **정본은 `dbm_retention` 잡 options 한 곳**(`DbmRetentionDays`)이며 WS-3에서 표가 생길 때 키를 함께 더한다(표 없는 키를 미리 두면 유령 설정).

**파티션·인덱스(🔴5)**: 파티션 테이블의 PK/UNIQUE는 파티션 키(`observed_at`/`bucket`)를 포함(PG 제약). 최소 인덱스: batch `(target_uid, kind, observed_at DESC)` · 세션 `(observed_at, target_uid, batch_id)`+`(target_uid, session_key, observed_at)` · 락 `(target_uid, observed_at, waiter_key)` · SQL 추이 `(target_uid, query_native_id, bucket)` · activity `(target_uid, bucket)`. 파티션 관리는 APM `ApmPartitionService` **패턴** 재사용(허용 테이블·정리 대상이 APM에 묶여 있어 **클래스 직접 재사용 불가** — DBM용 서비스 신설).

### 6.2 용량 어림 — 전체 재산정 (🔴7, 50 대상, R4가 실측)
300B/행은 **미검증 가정**이다(APM 686B는 스키마가 달라 상한 근거가 아님).

| 테이블군 | 가정 | 저장(인덱스 포함 가정) |
|---|---|---|
| 세션 raw 5s | 활성 20 × 50 × 17,280/일 = 1,728만 행/일 × 300B | 5.2GB/일 → 48h **10.4GB**(파티션 경계 여유 +1일 → 최대 15.6GB) |
| 락 edge 48h | 장애 시 급증, 평시 소량 | ≤2GB |
| activity_1m 30일 | 그룹 상한 50 → 360만 행/일 × 250B | **27GB** |
| activity_1h 180일 | 50 × 100 × 24 × 180 × 250B | **5.4GB** |
| query_stat_1m 7일 | 200/분 → 1,440만/일 × 300B | **30GB** |
| query_stat_1h 180일 | 밀집(500/h) 50 × 500 × 24 × 180 × 300B | **32GB** |
| metric_1m 7일 / 1h 180일 | 60개 | 4.5GB / 1.9GB |
| batch·checkpoint·plan·dimension·native·outbox·audit | SQL 변화율·장애 빈도 의존, **§5.4 차원 quota로 상한** | ≈5~10GB(quota) |
| **v1.2 추가(C7 재산식, 300B/행은 검산용 가정)** proc_stat 1m 7일: MSSQL 10대 × **활성 Top 200/분**(Δcalls>0만) × 1,440 × 7 × 300B ≈ **6GB**; 1h 180일: 10 × 500 × 24 × 180 × 300B ≈ **6.5GB** | 저장 조건 없이 10×500 전부 매분이면 15GB+6.5GB — 그래서 Top 200·활성 조건을 둠 | ≈12.5GB |
| setting_snapshot(변경 시만, 승인 키 ≤300) · deadlock_event(평시 소량) · cluster · (P3) schema_snapshot(대상 전체 300 tables·테이블당 50 cols, 90일)·object_stat_1h(300 × 24 × 180 × 50 × 250B ≈ 16GB → **1h는 변경 시만 또는 6h 롤업**으로 ≈3~4GB) | 각각 소량이지만 합산 | ≈+5~7GB |
| dimension 텍스트(§5.4 quota) | 20,000 × 50 × 최대 8KB = **논리 8.2GB 상한**(평균은 훨씬 작음, 압축률 미확인) | 바이트 예산 256MB/대상으로 상한 |
| **DBM 논리 합계(잠정 — 해당 workload에서 R4 통과 전 값)** | | **≈130~175GB** → 운영 예산 **180~230GB** 재검토(Q18·Q20) |
| 운영 예산 | 인덱스 과소 가정·파티션 경계·재집계 여유 | **150~200GB** 요건 + **WAL·백업은 별도** + APM 109GB 합산 |

→ 설치 요건 문서에 "규모별 하드웨어 프로필"(Q20: 10/50/200 대상)을 둔다. 1일 파티션 DROP이면 보존량은 48h가 아니라 48~72h 범위에서 흔들린다.

**v2.5 재산정(D23 계단 적용, 같은 300B/행 가정)** — 위 표에서 무게는 5초 원본이 아니라 **1분 집계를 30일·7일 들고 있던 것과 Top SQL 매분 200개**였다:

| 데이터(50 대상) | v2.4 | v2.5 | 손잡이 |
|---|---|---|---|
| 세션·락 원본 | 10~16GB(48h) | 10~16GB(2일) | 변동 없음 — 전체의 10% 선 |
| 활동 1m / 5m / 1h | 27GB(30일) + 5.4GB(180일) | 6GB(7일) + 5GB(30일) + 12GB(400일) | 1m을 7일로, 5m 신설 |
| Top SQL 1m / 5m / 1h | 30GB(200/분·7일) + 32GB(500/일·180일) | 8GB(50/분) + 6GB(100) + 29GB(200/시·400일) | Top N 축소가 가장 큰 손잡이 |
| 카운터 1m / 5m / 1h | 4.5 + 1.9GB | 4.5 + 1.5 + 4.2GB | — |
| 사건·차원·배치·checkpoint | 5~10GB | 8~12GB(400일) | quota로 상한 |
| **합계** | **≈130~175GB** | **≈85~95GB** | 10 대상이면 **≈20GB**(APM 한 벌보다 작음) |

### 6.3 보존·정리 메커니즘 (v2.5 — APM 공통 구현체 확장; 구 "디스크 예산 정책 🔴8"은 삭제)

**원칙(D23)**: APM·Zabbix와 **같은 메커니즘, 일수만 DBM 성격에 맞게**. 운영자가 이미 아는 모델이고, 구현체를 하나만 두면 사본 2벌 사고("만든 다음 날 지우는")가 없다.

| 요소 | 구현 | 상태 |
|---|---|---|
| 보존 일수의 정본 | `scheduler_setting` 잡 `dbm_retention`의 `options` 1행(APM `apm_retention`과 같은 구조). 해석 record `DbmRetentionDays`(0 이하 → 기본값 + WARN 1회), 잡과 조회 EP가 **같은 함수**로 읽는다 | ✅ V91 시드 `{"sampleBatchDays":7,"checkpointIdleDays":30}`, 매일 02:00 |
| 정리 잡 | `DbmRetentionJob`(`SchedulerJob`, `requiresActiveLicense=false` — D10 "만료돼도 정리는 계속") → `DbmRetentionService` 단계들. 단계 실패 격리·끝에 던짐은 공통 `RetentionStepRunner` | ✅ V90 표(`dbm_sample_batch`+CASCADE row 7일 DELETE 5,000건씩 · `dbm_delta_checkpoint` 30일) |
| 시계열 파티션 | 공통 `premium.common.partition.DailyPartitionService`(일 RANGE 파티션 생성·만료 DROP·판정 DROP, APM `ApmPartitionService`에서 추출 — APM은 표 목록·메트릭 게이트만 남은 껍데기) 위에 **`DbmPartitionService` 껍데기**(표 목록만 DBM) | WS-3 typed 표와 함께 |
| 롤업 1m→5m→1h | APM `ApmRollupService`의 워터마크·닫힘 지연(LAG)·`sum/sum/min/max` 집계 패턴. APM 롤업은 히스토그램·dirty 마커 등 APM 전용 결합이 커 **구현체를 공유하지 않고 패턴을 따른다**(공통화는 DBM 롤업이 생긴 뒤 둘을 보고 결정) | WS-3/WS-10 |
| 롤업 끝난 파티션만 DROP | 공통 `PartitionDropGuard`("워터마크 ≥ 파티션 끝") — APM `PartitionDropGuard`·`ApmMetricRetentionGate`와 같은 모양 | WS-10 |
| 조회 화면 "어디까지 남아 있나" | 공통 `SchedulerOptionsReader`(60초 캐시, 장애 시 기본값·`configured=false`) 위에 `DbmRetentionPolicy`, 응답 `oldestAvailableMs`(APM 패턴) | WS-4 |
| 보존 설정 화면 | 리포트 관리 APM 보존 탭 **복제** + 현재 DBM 사용량 GB(읽기 전용, `pg_total_relation_size` 합) | WS-10 |
| FE 스케줄러 카탈로그 | `SCHEDULER_JOB_CATALOG`에 `dbm_retention` 라벨(없으면 job_key가 그대로 보임 — 동작엔 무관) | WS-4 |
| ArchUnit | `premium.dbm` ↛ `premium.apm`, `premium.common` ↛ 기능 패키지, main 소스의 파티션 DROP 문장은 `DailyPartitionService`에만·공통 `dropExpired` 호출처는 도메인 껍데기만(`ApmArchiveGateArchTest` 확장) | ✅ |

**v2.4까지 있던 네 장치를 두지 않는 이유(2026-10-27 결정)**:
- **디스크 예산 상한(GB)** — 고객은 GB를 산정하지 못하고 "일수"와 "GB" 두 손잡이가 충돌하면 어느 쪽이 이기는지 설명해야 한다. APM이 일수만으로 운영 중. → 대체: 보존 탭의 **사용량 GB 표시(읽기 전용)**.
- **최소 보장 일수** — 자동 단축이 없으면 존재 이유가 없다.
- **부족 시 수집 간격 자동 늘리기** — 모니터링 도구가 디스크 때문에 스스로 눈을 감는다. 장애 뒤 "왜 그 시간대 샘플이 듬성한가" 문의를 만든다. 간격은 대상별 1~10s 옵션으로 관리자가 손으로 바꾼다.
- **사건 구간 파티션 보호** — 일 파티션 단위라 사건 하나에 5GB 하루치를 7일 더 들고 있어야 하고 DROP 가드와 얽힌다. 진짜 요구("장애 증거를 남기고 싶다")는 **P3 증거 묶음 내보내기**가 답.
- 코덱스 v1.1 🔴8("자동 단축 금지 → 정책 범위 안 동작")은 **자동 단축을 아예 하지 않으므로** 성립 조건이 사라진다.

**남는 진짜 위험 — 우리 PG 디스크 꽉 참**: DBM만 멈추는 게 아니라 로그인·Zabbix 조회까지 MovesEye 전체가 선다. DBM은 5초 샘플이라 APM보다 적재 속도가 빠르다. 이것은 DBM 정책이 아니라 "우리 PG 서버 디스크 감시" 한 건이며 APM도 없다 →
1. **GA**: 설치 가이드에 "MovesEye 서버 디스크를 Zabbix로 감시하라"(고객은 이미 Zabbix를 갖고 있다) + 규모별 디스크 프로필(§6.2 v2.5·Q20).
2. **백로그(APM과 공용)**: 파일시스템 잔여 공간 < N GB면 DBM·APM 적재를 멈추고 배너 — 정책 엔진이 아니라 체크 한 개. `premium.common`에 둔다.

### 6.4 정확성
평균 `Σtotal/Σcalls` · AAS `active_seconds/coverage_seconds` · 멱등 `(target, kind, epoch, seq)` · 응답 `complete|partial|unsupported` + 세 품질 축 + `observedAt/ageMs/batchId`.

---

## 7. 알람

### 7.1 규칙 종류
| kind | 조건 | 등급 |
|---|---|---|
| `DOWN` | 접속 실패 N회 연속(인증 실패 제외) | HIGH |
| `AUTH_FAILED` | 인증 실패 분류 | HIGH(운영) |
| `CONN_PCT` | 연결/상한 > x% | WARN |
| `BLOCKING` | 체인 깊이≥d 또는 피해≥v가 t초 지속 | HIGH |
| `LONG_TX` | 트랜잭션 경과 > t초(Oracle `V$TRANSACTION`·PG `xact_start`·MSSQL `dm_tran_active_transactions`·MySQL `INNODB_TRX`) | WARN |
| `LONG_QUERY` 🆕(G30) | **현재 실행 중인 문장**의 경과 > t초(기본 30s; PG `query_start`+state active·MSSQL `dm_exec_requests.start_time`·Oracle `sql_exec_start`·MySQL `events_statements_current.TIMER_START`). idle 세션 제외, 실행 식별이 바뀌면 회복 | WARN |
| `DEADLOCK` 🆕(G6) | 데드락 카운터 증가 — **인증된 카운터 소스가 있는 엔진·버전에서만 활성**(MariaDB는 `innodb.deadlocks` 미갱신 가능 → R1에서 소스 확인, 미지원은 `unavailable`) / MSSQL은 `dbm_deadlock_event` 신규. 카운터·이벤트는 같은 5분 창에서 1건으로 통합 | WARN |
| `SETTING_CHANGE`(P3) | 승인 키 값 변경 | INFO |
| `AAS` | 활성 세션 평균 > CPU×k(5분) | WARN |
| `REPL_LAG` | 지연 > s초/bytes | HIGH |
| `STORAGE_PCT` | tablespace/파일 > x% | WARN/HIGH |
| `STALE` | 수집 공백 > n분 | WARN |
| `QUERY_REGRESSION`(P3) | tracked SQL avg 기준선 ×k | WARN |
| `PLAN_CHANGE`(P3) | plan_hash 변경 | INFO |
| `LICENSE_LIMIT`(v2, D17) | 활성 대상 수 > `maxDbTargets`(하향 갱신) 또는 활성화 거부 발생 | WARN(운영) |
| `COLLECTOR_DOWN`(v2, D21) | 원격 수집기 heartbeat 공백 > n분 또는 `VERSION_MISMATCH` — 할당 대상은 `STALE`로 묶어 1건 | HIGH(운영) |
억제: 상위 원인(호스트 다운·BE 네트워크)·유지보수 창·재통지 간격·연속 회복 N회(§5.8).

### 7.2 배달 (🔴9 반영)
- 평가(1m) → `dbm_alert_event` → `dbm_alert_outbox`(순서 보장·중복 억제 키 `(rule_uid, state, opened_at)`) → `DbmAlertDeliveryAdapter`.
- **추출 범위**: `ZabbixAlertBridge`(≈1,700행, APM 규칙·binding·cleanup·collector scope 결합)에서 **Zabbix 트래퍼 전송기만** `premium/common/zbxtrapper/`로 뽑는다 — 가상 호스트 보장·트래퍼 아이템 생성·`history.push`·설정 캐시 10s 대기·항목 단위 응답 검사·소유 태그·드리프트 감지·삭제 재생성. 입력은 중립 DTO `TrapperSignal(hostName, itemKey, itemName, value, tags)`. APM은 이 전송기를 호출하도록 **리팩터**(규칙·binding 관리는 APM에 남음) — **별도 작업 항목 + APM 회귀 테스트**(공수 P1b 포함, 소유권·회귀 책임은 Q21).
- DBM 아이템 키 `dbm.<kind>[<target_uid>]`, 호스트 "MovesEye DBM".
- **Zabbix 6.0**: `history.push` 없음 → 이메일 폴백 + "Zabbix 배달 불가" 명시 vs `zabbix_sender` 호출 — **Q5(명시적 기능 차이)**, 종료 기준에 자동 복구·순서·채널 도달 포함.
- 액션·미디어는 만들지 않음.

---

## 8. API·화면

### 8.1 API `/dbm/**` (`@RequiresFeature(DB_MONITORING)`)
| 그룹 | 요지 |
|---|---|
| 대상 | ✅(2026-10-28) `GET/POST /dbm/targets` · `GET/PUT/DELETE /dbm/targets/{uid}` · `PUT /dbm/targets/{uid}/credential` · `POST /dbm/targets/{uid}/check-capabilities`(저장된 자격증명) · `POST /dbm/targets/{uid}/activate`(admission)·`/deactivate` · `GET /dbm/license/usage` · ✅ `POST /dbm/targets/test-connection`·`/check-capabilities`(본문) · ✅ `GET /dbm/poller/status` · `GET /dbm/targets/discover-candidates`(WS-5) |
| 실시간/과거 | `GET /dbm/targets/{uid}/sessions?at=` · `/locks/tree?at=` · `/waits/timeline?from&to&bucket` · `/metrics?names&from&to` — **`at` 계약 §8.3** |
| SQL | `/top-queries?from&to&orderBy&limit`(응답에 `__other__`·`otherComplete`) · `GET /dbm/queries/{nativeId}`(추이·세션·플랜·호출 서비스·**호스트별 Rows/Query 비교** P3) · `/plans/{planId}`(마스킹 구조 플랜 JSON, estimated/actual 표기) · **`/procedures`**(MSSQL, P2). `POST .../explain`은 **삭제**(D13 — GA 재계획 없음) |
| 운영 | **`/settings-snapshot`**(P1b) · **`/deadlocks`**(P2 조건부) · **`/clusters`**(P2) · `/replication`(P2) · `/schema`(P3) · `/object-stats`(P3) |
| 분석 | `/compare?a=&b=` · `/lock-incidents` · `/activity/breakdown?by=wait_class\|sql\|user` · `/evidence-bundle?from&to`(P3) |
| 상관 | `/host-metrics`(Zabbix 링크) · `/apm-services` · APM 측 `GET /apm/services/{uid}/db-targets`(둘 다 보유 시) |
| 알람 | `/dbm/alert-rules` · `/dbm/alert-events` · `/dbm/alert-delivery/status` |
| 관리 | `/dbm/settings` · `/dbm/retention` · `/dbm/drivers` · `/dbm/credentials/{uid}/rotate` · `/dbm/audit` · **`/dbm/collectors`(P3b, D21)** · `/dbm/license/usage`(허용/사용 대상 수, D17) |
| 수집기 수신(J2) | **`/dbm/ingest/v1/config`(pull) · `/dbm/ingest/v1/batches`(push, 멱등) · `/dbm/ingest/v1/heartbeat`** — 전용 토큰, APM 수신기와 분리(§3.6) |
응답 공통: `{ data, status: complete|partial|unsupported, quality: {timeCoverage, rowTruncated, textTruncated, sourceVisibility, dimensionOverflow}, observedAt, ageMs, batchId, lastSuccessAt }`. 외부 연동 키는 `fingerprint`(+`algoVer`·engine) — Datadog `query_signature`와 **다른 값**임을 문서화(G38). 샘플 기반 분포 지표는 `observedElapsedP90`처럼 명명(G42).

### 8.2 메뉴 (`/database-monitoring/**`, 관리 `/setting/database-monitoring/**`) — 1차 노출 4개(Q10)
| 메뉴 | 내용 | Phase(최초 노출; 괄호는 내부 기능 제공 Phase) |
|---|---|---|
| **1. DB 개요** | 대상 카드/표: 엔진·버전·역할·상태·AAS 스파크라인·블로킹·복제·스토리지·품질 3축·capability 배지·(선택) Zabbix 카운터 모드 배지 · **정렬/필터: 활성 알람 수·최고 심각도·블로킹 영향(G44, 상세와 같은 이벤트 집합)** · **클러스터로 묶기 토글(P2)** | P1a (알람 정렬 P1b · 클러스터 P2) |
| **2. 인스턴스 상세** | 공통 시간 선택기(실시간/과거) · AAS by wait class(호스트 CPU 오버레이) · 활성 세션 표(세션 드로어, client address·port·application·태그) · **락 트리(상세 안의 탭)** · 카운터 · 노드/endpoint 탭 · **설정 탭(P1b)** · **프로시저 탭(MSSQL, P2)** · **데드락 탭(MSSQL 조건부, P2)** · **복제/AG 탭(P2 상태·queue, P3 이력)** · 스키마·객체 통계 탭(P3) | P1a (설정 P1b · 프로시저/데드락/복제 P2 · 스키마 P3) |
| **3. SQL 분석** | Top SQL(정렬·기간·`truncated`·`__other__`/`observedShare`) · SQL 상세(추이·대기 분해·세션·**캐시 플랜(Oracle·MSSQL만, PG·MySQL은 "GA 미지원" 안내)**·플랜 변경·호출 서비스·블로커 영향 지표(G29, 시간 가중)) · tracked SQL · **호스트별 Rows/Query 비교(P3)** | P1a(표) (캐시 플랜 P2 · 플랜 변경·호출 서비스·Rows/Query P3) |
| **4. 알람** | 이벤트·원인 링크·복구·배달 상태 | P1b |
| 5. 성능 분석(과거 시점) | 타임 슬라이더(48h 상세 재생) · 1m 집계 30일 drill-down **대기→SQL→사용자** · 기간 비교 | P3 완성 시 노출 |
| 6. 잠금·트랜잭션 | 인시던트 목록·트리 재생·장기 트랜잭션·(MSSQL) deadlock | P3 노출(P1a는 상세 탭) |
| 7. 관리(/setting) | 등록 마법사(엔진→endpoint→접속/TLS→**권한 검사(필수/권고 등급 분리)**→**PG namespace 선택(기본 ≤10)**→기능 미리보기(엔진별 지원표: 플랜·데드락·MariaDB)→보존 예산→시작) · 자격증명/교체 · 드라이버 · 보존/디스크 정책 · 마스킹·**승인 태그 키**·**설정 스냅샷 승인 키** · 보안 프로필 · Zabbix/APM 링크 · 감사 · 폴러 상태 · **라이선스 대상 상한 사용량(Q22)** | P1a |
FE 갱신 3~5s. `ResizableDrawer`. 락 트리는 네트워크 맵의 React Flow 재사용 우선.

### 8.3 `at=` 재생 계약 (🔴5)
- `at` 이하 **가장 최근 batch**를 kind별로 선택. **kind별 최대 허용 시차**: 세션 2×간격, 락 2×간격, 카운터 2×간격 — 초과 시 해당 패널은 "해당 시점 자료 없음"(마지막 값으로 무제한 연장 금지).
- 응답마다 `observedAt·ageMs·batchId`. 세션·락·카운터는 **원자적 스냅샷이 아니다** — 화면에 각 패널의 observedAt 표시.
- raw 창(48h, 세션·락 동일) 밖은 1m 집계만: drill-down은 대기→SQL→사용자까지, 개별 세션 복원 불가 안내(§8.2 문구 통일).
- 재생 컨트롤: ◀ 간격 ▶ · 1m 점프 · 인시던트 북마크.

### 8.4 APM 상관 (🔴9)
- 현 APM 모델엔 endpoint가 없다(`apm_db_query_group`은 `(service_id, fingerprint)`, `db.client.operation.duration` 허용 차원에 `server.address`만·port·namespace 없음). 따라서 **APM 쪽에 `dbm_apm_endpoint_obs`(서비스 × server.address × port × namespace, 5m 호출 수·p95) 롤업을 신설**(스팬 속성 허용목록엔 이미 `server.address`·`server.port`·`db.namespace` 존재) — P3 WS, APM 계약서(`contract_dbm-apm-link.md`)로 명시.
- 1차 표시는 **"서비스 전체 지연 vs 이 DB의 부하" 시간 상관**이며 "이 DB에 대한 서비스 p95"로 표기하지 않는다. endpoint 관측 모델이 생기면 endpoint별 p95로 승격.
- 매칭은 추정(DNS alias·VIP·NAT) → 관리자 확인 `confirmed`. 실행 단위 연결(`traceparent` 전파)은 P5+.
- 두 Feature 모두 보유 시 노출.

### 8.5 문서·고객 안내
인앱 설치 가이드(`ApmGuideText` 패턴: 계정 SQL 복사·권한 검사 해설·포트·TLS·pg_stat_statements 재시작 고지·**Oracle 기본 패키지 호출 객체 목록**·**원격 수집기 설치(enrollment 코드·서비스 등록·오프라인 패키지)**) · **보안 심사 패키지**(P4: 권한·통신(J1 직접/J2 수집기 아웃바운드)·수집 SQL 전문·비수집 범위·보존·열람 권한·감사) · Zabbix Oracle 템플릿 ASH 안내 · `준비-중인-모니터링.md` 정정 · **GA 지원 토폴로지 표**(D21: J1 직접 접속 / J2 원격 수집기)·**버전·에디션 인증표**(Q16)·**RAC 문구**(D20: "노드별 수집, 노드 간 blocker는 unresolved 가능").

---

## 9. 라이선스·권한 (🔴1 반영)
- `@RequiresFeature(DB_MONITORING)` — `/dbm/**` 전부.
- **폴러는 `AccessMode.FULL`에서만 돈다. `EXPIRED`(만료 30일)부터 정지.** 근거: `SchedulerJob.requiresActiveLicense` 원칙("수집 소스로 나가는 배치는 만료되면 멈춘다")과 `SchedulerManager.canWrite()`; P17의 `allowsLiveQuery()`는 **Zabbix가 이미 수집한 값을 조회**할 권한이고 고객 DB를 계속 폴링해 적재할 근거가 아니다. 롤업·정리는 계속(`requiresActiveLicense=false`).
- 현 커널(`LicenseStatus`)은 만료 상태에서 `Feature.DB_MONITORING` 자체를 거부 → `/dbm/**` 조회도 차단된다. **만료 후 과거 조회·내보내기 허용 여부는 Q13 → D22로 "GA는 현 커널 유지(차단)"로 확정**(허용하려면 프리미엄 설계 P10·P17·Feature 정책을 함께 개정 — 별도 결정 세션, 이 문서 한 줄로 처리하지 않음).
- APM 상관 화면만 `DB_MONITORING ∧ APM`.
- 역할: `DBM_VIEW`(+**대상 그룹 스코프**, Q17) / `DBM_RAW_SQL_VIEW` / `DBM_ADMIN`(등록·자격증명·드라이버·마스킹·보존). 전 변경은 `dbm_audit`.
- **대상 상한(D16 → D17 확정)**: 클레임 `maxDbTargets` 채택. **코드(2026-10-28)**: `LicenseStatus.maxDbTargets`(null=제한 없음) → `DbmTargetAdminService.activate` admission(사전 판정 → 접속·권한 검사 → `pg_advisory_xact_lock(hashtext('dbm_target_admission'))` 안 재판정·`enabled=true`), `GET /dbm/license/usage`(`maxDbTargets·unlimited·activeTargets·overLimit`). 하향 갱신은 `overLimit=true`·기존 활성 유지·신규 거부. `LICENSE_LIMIT` 알람·배너는 WS-4/P1b. 신규 발급 키는 명시 필수(발급기 입력 항목·검증). **기존 키 누락 = "제한 없음"(용량 판정에만 — 상태·Feature·만료 게이트는 커널 그대로)**. 활성화 시 원자적 검사(HA 동시 요청 포함, PG advisory lock 또는 단일 UPDATE 조건), 초과 시 활성화 거부+이유. **하향 갱신**: 기존 활성 대상 유지 + `OVER_LIMIT` 배너·알람 `LICENSE_LIMIT`(§7.1 추가) + 신규 활성화 거부. 상태 API `/dbm/license/usage`·관리 화면에 허용/사용 수. 발급기·BE 계약 4파일 사본 규칙 유지(변경은 `LicenseClaims`에만, enum 3개 불변) + 양쪽 `LicenseContractTest`에 `maxDbTargets` 케이스(명시·누락·0·하향).
- **만료 정책(D22 확정, Q13)**: `EXPIRED`부터 J1 폴러·J2 수집기 정지(수집기는 config pull에서 `LICENSE_EXPIRED` 수신 → 중단·큐 보존). `/dbm/**` 조회·내보내기는 현 커널이 차단 — **GA에서 바꾸지 않는다.** 허용 검토는 별도 결정 세션(P10·P17·`LicenseStatus` 개정 범위).

---

## 10. 비범위·유예
Kill·자동 조치(Q6) · 추천(Recommendations·스키마 추천) · ML 이상탐지 · Oracle ASH 프로필(Q4) · MongoDB/Redis/ClickHouse · CUBRID/Altibase/Goldilocks(조사·로더만) · 슬로우 로그 파일 · DB 오류 로그 파일 · PG `auto_explain` 로그 플랜 · E1 · 관리형 클라우드 DB 인증(IAM) · 실행 단위 APM 연결 · **(v1.2) PG/MySQL 재계획 플랜 수집·전용 XE 세션(완료/에러·데드락)·consumer 자동 토글·임의 사용자 SQL 메트릭 — GA 비범위, Q25·Q28(Q26은 D18로 GA 제외 확정)**. (v1.3) 비범위 저장소(Redis·MongoDB·ClickHouse)의 **근거와 재개 기준은 §16.4**, Q31.

---

## 11. 리스크·착수 전 실측 (P0)

| # | 실측 | 통과 기준 | 막히면 |
|---|---|---|---|
| **R1** 최소 권한 | 엔진 4종 §4 스크립트로 C/S/Q/L 조회, 타인 세션·SQL 가시성, capability 정확 보고. **Oracle은 P0부터 병행**(코덱스 Q1) | 전 등급 OK/MISSING 정확 | 스크립트 보정 |
| **R2** 부하 | 저/고부하·세션 500·**5,000**에서 5s/1s 폴링 시 DB CPU·p95·락 영향·수집 지연·상한 우선순위 동작 | 5s에서 CPU +1% 미만·tick 2s 내 | 1s 조건 강화 |
| **R3** 마스킹 fixture | 200건+잘린 SQL·주석·DDL·중첩 문자열·비정상 인코딩·한글 → 리터럴 잔존 0, 실패는 해시만, **큐·로그·번들에 원문 0** | 통과 | 토크나이저 보강/JSqlParser 병행 |
| **R4** 용량·질의 | 50 대상 7일 합성 적재 → bytes/row·WAL·롤업 시간·`at=` 질의 p95·APM 동시 부하·파티션 DROP 가드 | 과거 세션 질의 <1s | 보존 기본값 조정 |
| **R5** 배달 | 7.0 `history.push` 전송기 추출 후 APM 회귀 + 6.0 폴백 UX | 기존 계약 유지 | Q5 |
| **R6** 드라이버 | ojdbc Free Use Terms 재배포·mariadb LGPL·고객 jar 로더(재시작 적용·허용 클래스) | 법무 1줄 + 로딩 | ojdbc 고객 업로드 전환 |
| **R7** OTel PG receiver 비교(🟡2) | 0.159.x `postgresqlreceiver` query_sample/top_query/query_plan 실제 출력·마스킹·Collector 큐/로그 원문 잔존·망 조건·기능 완전성 vs JDBC | 비교표 | Q11 확정 |
| **R8** HA·복구 | 2노드 lease 인계 시간·fencing·PG 정지 중 큐·재시작 후 checkpoint 첫 관측 partial 처리·failover 후 boot_epoch | RTO ≤30s, 이중 적재 0, 가짜 급증 0 | Q15 |
| **R9** 🆕 MSSQL system_health 데드락 | 2016·2019·2022 자체 호스팅에서 `event_file`/ring_buffer 읽기·2022 `VIEW SERVER PERFORMANCE STATE`·유실/중복 제거·XML 마스킹 | 포착률 보고(보장값 아님), 중복 0 | Q28 |
| **R10** 🆕 RAC 원격 blocker | 노드별 대상 2개로 `BLOCKING_INSTANCE/SESSION` 조인(INSTANCE_NUMBER→노드, SERIAL#, 시차) | 조인 성공·unresolved 분류 정확 | Q3·Q29 → **D20 확정**: P2 포함, 조인 실패율로 `GV$` 보강 여부 판단 |
| **R11** 🆕 v2 원격 수집기(J2) | 코어 모듈 분리 가능성(현 폴러 프레임 설계에서 writer 경계 확인)·단일 jar+서비스 패키징·30 대상 CPU/메모리·큐 256MB 소진·BE 재시작 중 재전송 멱등·토큰 회전 중단 시간·프록시/인증서 망 조건 | 멱등 중복 0·회전 중단 <10s·30 대상 CPU 1코어 미만 | 대상/수집기 상한 하향·Q32 |
| R1 보강 | PG `EXPLAIN` 권한 검증은 **격리된 P0 fixture에서만**(운영 capability는 GA 정책상 P=UNSUPPORTED로 보고하고 고객 SQL을 재계획하지 않음) · MariaDB 지원표·데드락 카운터 소스 검증 · 설정 스냅샷 승인 키 민감정보 0 · `pg_read_all_stats`(pg_monitor 포함) + 확장 DB CONNECT·schema USAGE·객체 SELECT ACL 제한 환경에서 서버 Q 조회 성립 | | |
| R2 보강 | **Agent(BE) CPU와 DB 쿼리 CPU 분리 측정**(Datadog 벤치는 c5.xlarge/db.m5.large·PG 샘플 10s — 우리 5s 보증 근거 아님) | | |
| R4 보강 | proc_stat·setting_snapshot·deadlock_event·(P3) schema·object_stat 세 테이블군 추가, 50 "대상"의 workload·namespace·객체 수 고정 | | |
| 🔴 환경 | 상용 DB 시험 환경 없음 — Oracle XE 21c·SQL Server 2022 Dev·MySQL 8·MariaDB 10.11을 별도 VM/로컬에(시험 서버 10.220.0.13 금지). **XE·Dev는 출발점이지 전 버전·에디션 인증이 아님** → Q16 시험표 | | Q9 |

기타: Tibero 무수정 호환 불가 · MariaDB 락 분기 · MSSQL 모니터링 쿼리 tempdb 데드락 · PG `pg_locks` 경합 · 폴러가 메인 PG 풀 고갈(전용 풀·writer로 차단) · 트래퍼 전송기 추출 시 APM 회귀.

---

## 12. 구현 단계 (WBS 요지)

| Phase | 워크스트림 | 어림 |
|---|---|---|
| **P0** | R1~**R11** + 시험 환경 + **공통 계약 시험본(§3.6 🧪)** + 이벤트/스키마 확정 + 지원 버전표 초안 + R별 판정표·게이트 | 22~34 (+R11 3~5, J2 증분에서) |
| **P1a** | WS-1 대상·endpoint·node·자격증명(enc:v2 키 운영)·capability(필수/권고 분리)·드라이버 로더 · WS-2 폴러 프레임(2레인+**namespace 접속**·lease·checkpoint·writer·디스크 큐·파티션 서비스·**차원 quota**) · WS-3 PG 어댑터(**서버 Q 1회·`toplevel`·`__other__`·namespace 선택·예산**) · WS-4 FE 개요·상세(락 트리 탭)·SQL 표·관리 마법사 · WS-5 Zabbix 발견·호스트 링크 · WS-6 품질 축(+sourceVisibility·dimensionOverflow)·`at=` 계약·**client 구조·명령 유형·승인 태그 추출** · **WS-26 라이선스 `maxDbTargets` 최소 강제**(발급기 입력·서명 클레임·BE `LicenseClaims` 검증·원자적 활성화 admission·상태 API·관리 화면 허용/사용 수·하향 갱신·실제 발급 키 종단 검증 — D17 확정, 기존 추정 안에 포함; 계약 사본 중 변경은 `LicenseClaims`만이지만 발급기 UI·검증·BE admission·API·테스트는 함께 변경) | 58~76 |
| **P1b** | WS-7 MySQL/MariaDB 어댑터(락 분기·**MariaDB 별도 지원표**·오류 카운터) · WS-8 Zabbix 트래퍼 전송기 추출+APM 회귀 · WS-9 규칙(`LONG_QUERY`·`DEADLOCK` 포함)·억제·outbox · WS-10 보존 탭·롤업(1m→5m→1h)·정리 — **APM 공통 구현체 확장**(§6.3 v2.5·D23, 디스크 정책 없음, `dbm_retention` 잡·V91은 ✅) · WS-11 알람 메뉴·**개요 알람 기준 정렬** · **WS-25 설정 스냅샷(승인 키)** | 37~49 |
| **P2** | WS-12 Oracle(허용목록 패키지·객체별 추가·`_STAT`·객체 자동 테스트·CDB/PDB·RAC 노드별+unresolved) · WS-13 SQL Server(DMV·**프로시저 통계**·**system_health 데드락 조건부**·AG 상태/queue·Q user 미가용) · WS-14 캐시 플랜 구조 파서·뷰어(estimated/actual) · WS-15 권한 검사 리포트 내보내기 · **WS-23 클러스터 membership·합산 규칙** | 85~111 |
| **P3** | WS-16 과거 시점 재생 UX·기간 비교 · WS-17 플랜 변경·tracked SQL·QUERY_REGRESSION · WS-18 APM endpoint 관측 롤업(APM 계약)+상관 화면+**승인 키 주석 태그·서비스 귀속** · WS-19 리포트·위젯·**진단 preset** · WS-20 설정 diff 알람·Agent Jobs·백업 age(선택) · WS-21 Zabbix 카운터 개요 모드(Q14) · WS-22 증거 묶음 내보내기 · **WS-24 스키마·인덱스 스냅샷(선택 DB·completeness)·객체 통계·Rows/Query 호스트 비교** | 58~84 |
| **P3b** 🆕 v2 | **WS-27 원격 실행형 수집기(J2, D21·§3.6)**: ① `dbm-collector-core` 모듈 jar 소비(**분리는 P0 완료 2026-10-26** — 어댑터·레인·checkpoint·마스킹·품질 전부 코어, J1/J2 분기는 spi 구현만) ② 수집기 런타임(단일 jar·systemd/Windows 서비스·config pull 30s·배치 push 멱등·heartbeat 10s·디스크 큐 256MB·로컬 키스토어) ③ BE 수신 `/dbm/ingest/v1/{config,batches,heartbeat}`·토큰·enrollment 코드·버전 호환 검사·수신 배치 재검사 ④ `dbm_collector`·`dbm_collector_target`·lease 소유자 `collector_id`·fencing ⑤ 관리 "수집기" 탭·`/dbm/collectors`·알람 `COLLECTOR_DOWN` ⑥ 설치 가이드(온라인·오프라인 패키지) | 25~35 |
| **P4** | 50 대상 복합 부하·APM 동시 부하·HA 인계·장애 복구·폐쇄망 설치 문서·보안 심사 패키지·**확장 지원표(엔진×버전×플랜·데드락·MariaDB)·50 DB namespace·이벤트 유실·**원격 수집기 망 조건·큐·토큰 회전/폐기·업데이트/롤백·J2 30 대상 인증 workload·J1/J2 동등성·RAC 인증 상태**(WS-27 구현 비용과 P4 검증 비용의 경계: 구현은 P3b, 인증은 P4)** | 39~51 |
| **P5** | Tibero(40) · OTel 프로필(R7, 20) · CUBRID 조사(10) · ASH 프로필 검토 — 원격 실행형은 **v2에서 GA(P3b)로 편입** | 70 |

**기능 포함 비교(공정성 7)**: 코덱스 GA(215~315)엔 원격형 포함·플랜 비교/APM 상관/리포트 제외. 본 GA v1.1(270~355)는 원격형 제외·플랜 비교/APM 상관/리포트 포함. 총합이 비슷해도 **범위가 다르다** — Q12 결정이 GA 공수를 +25~35 바꾼다. **v1.2(299~405)** = v1.1 + Datadog 대조 순증 29~50(코덱스 어림: P0 +2~4·P1a +3~6·P1b +2~4·P2 +10~16·P3 +8~14·P4 +4~6; `maxDbTargets` 최소 강제 포함, 임의 SQL·권한 상승 패키지·XE·로그 플랜·완전 lineage 제외 — 전부 넣으면 +20~40 추가). **v2.0(324~440)** = v1.3 + **J2 25~35**(코덱스 1차 어림 그대로 — 코어 공유 전제. P1a WS-2에서 writer 인터페이스 경계를 먼저 잡지 않으면 P3b에서 어댑터 재작업이 생겨 상한을 넘는다 → §17 DoD에 포함).

---

## 13. 미결 (사용자 확정 대기)

| Q | 질문 | 추천 |
|---|---|---|
| **Q1** | 엔진 구현 순서 | **A: PG로 공통 기반 → MySQL/MariaDB → Oracle·MSSQL.** 단 Oracle 최소 권한·SQL 검증은 **P0부터 병행** |
| **Q2** | 세션 샘플 기본 간격 | **5s 기본**, 1s는 전체 적재 예산 안에서 또는 30분 진단 프로필 |
| **Q3** ✅ **확정 10-22 → D20** (CDB/PDB P2 + RAC P2 노드별·unresolved 허용) | Oracle RAC(노드 식별·교차 노드 blocker)·CDB/PDB를 P2에 넣나 | **CDB/PDB P2.** RAC는 금융 Oracle을 GA 대상으로 삼으면 **P2 필요**(코덱스) — 시험 환경 부재가 걸림. v1.2: 방식은 **노드별 대상 + 클러스터 membership(§4.6) + `BLOCKING_INSTANCE/SESSION` 표기, 조인 실패는 unresolved**(Datadog도 노드별 `V$` + 필요 시 `GV$`). 넣지 않으면 GA 지원표에 "RAC 미지원" 명기. 세부는 Q29 |
| **Q4** | Oracle ASH 읽기 프로필 | v1 제외. v1.2: Datadog도 `active_session_history: false` 옵션(라이선스 경고)으로 둔다 → P5 `ORACLE_DIAGNOSTICS` 프로필은 기본 프로필과 **허용목록·권한·설정을 분리**하고 기본 경로 호출 0건 유지(체크박스만으로 불충분) |
| **Q5** | Zabbix 6.0 배달 — 이메일 폴백만 vs `zabbix_sender` | 6.0 고객의 통지 요구로 결정. 폴백만이면 **"6.0은 Zabbix 알림 미지원" 기능 차이로 명시** |
| **Q6** | 세션 Kill | 1차 제외 |
| **Q7** | 사용자명·client host 가명화 | **보안 프로필**(표준/금융)로 선택, 금융 프로필 기본 ON |
| **Q8** | 인증 방식 — 비밀번호 외 Oracle Wallet·Kerberos·MSSQL 통합 인증·외부 비밀관리 | 일괄 비범위 아님. **GA는 비밀번호+TLS, Wallet/통합 인증은 고객군 확인 후 P5 후보** |
| **Q9** | 시험 환경 설치 위치 | 신규 VM 1대 승인 요청(로컬 PC 대안) |
| **Q10** | 1차 메뉴 노출 | **4개**(개요·상세·SQL·알람). 잠금은 상세 탭, 성능 분석은 P3 완성 시 |
| **Q11** | OTel 프로필 시기 | **R7 결과로 확정**(기본 P5) |
| **Q12** ✅ **확정 10-22 → D21** (J2 GA 포함, §3.6, +25~35) | **GA 지원 토폴로지** — BE→DB 직접 접속만 vs 원격 실행형 폴러 포함 | 타깃 고객 망 구조로 결정. 망분리 금융이 1차 타깃이면 **GA 포함(+25~35일)** |
| **Q13** ✅ **확정 10-22 → D22** (GA는 현 커널 — 만료 시 조회 차단, 허용 검토는 별도 세션) | **만료 후 정책** — 폴러 정지는 확정. 과거 조회·내보내기를 `EXPIRED` 30일간 허용할지 | 허용 시 프리미엄 설계 P10·P17·`LicenseStatus` 개정 필요 → **별도 결정 세션** |
| **Q14** 🆕 | Zabbix 카운터 개요 모드(폴러 미등록 호스트, C만) | P3 선택 포함 |
| **Q15** 🆕 | HA 목표 — 수집 RTO(30s)·PG 정지 시 허용 손실(디스크 큐 256MB) | 추천값 그대로, R8로 검증 |
| **Q16** 🆕 | 지원 버전·에디션 인증 표(Oracle 12c/19c/21c×SE2/EE, MSSQL 2016~2022, MySQL 8.0/8.4, MariaDB 10.5~11, PG 12~17) | P0에서 표 확정, XE·Dev로 가능한 범위부터 |
| **Q17** 🆕 | 인스턴스(대상 그룹)별 열람 권한 범위 | `DBM_VIEW`에 그룹 바인딩 포함 |
| **Q18** | ~~보장 보존·자동 조정 동의~~ → **v2.5 종결(D23)**: 계단 기본값은 APM/Zabbix와 같은 원본 2일·1m 7일·5m 30일·1h 400일·사건 400일, 자동 조정 없음(§6.3). 남은 하위 결정은 Q35 | ✅ 확정 |
| **Q19** 🆕 | 장기 Top N 압축(1h Top 200/시, v2.5)의 누락을 어떻게 표시하나 | "상위 N만 보존" 배지 + 누락 추정 비율 |
| **Q20** 🆕 | 규모별 하드웨어 프로필(10/50/200 대상) 문서화 | P4 산출물 |
| **Q21** 🆕 | 공통화한 Zabbix 트래퍼 전송기의 소유권·APM 회귀 책임 | `premium/common/` 소유 = DBM 작업자, APM 회귀 테스트 통과가 머지 조건 |
| **Q22** ✅ **확정 10-22 → D17** (별도 클레임, 누락=제한 없음은 용량 판정만, 하향=유지+경고+신규 거부) | DBM 상한을 `maxDbTargets` 클레임으로 서명하나? 활성 대상 계산 단위(D16), 기존 키 누락·무제한 표현·하향 갱신·초과 처리 정책 | **별도 클레임 채택**, 신규 발급 명시, 기존 키는 호환(누락=제한 없음). 발급기·BE 동반 변경 |
| **Q23** v1.2 | "미사용 인덱스" 판정 대신 관측 구간·리셋·누락을 동반한 **인덱스 사용 통계(데이터)** 만 제공하나 | P3 관측값만. 제거 판단은 비범위 |
| **Q24** v1.2 | 배포 중인 OTel Java Agent(APM 확장)의 sqlcommenter(`otel.instrumentation.jdbc.experimental.sqlcommenter.enabled`, 기본 false) 지원 버전·전파 키·prepared/statement cache·Oracle baseline·프록시 영향을 어떤 조합으로 인증하나 | 기능 존재는 확인됨. **서비스명만 넣는 정적 주석**(트레이스 ID는 텍스트를 유일하게 만들어 캐시·통계 그룹핑을 깨뜨림) POC 뒤 선택 |
| **Q25** v1.2 | 사용자 정의 메트릭 — 승인된 **고정 SQL 템플릿**만 vs 임의 읽기 SQL | 1단계 템플릿만. 임의 SQL은 보류(가드 목록은 코덱스 협의 G26 참조: 승인·hash 고정·별도 최소 역할·단일 SELECT·객체 허용목록·timeout 1~2s·≥60s·행/바이트 상한·실패 자동 중지) |
| **Q26** ✅ **확정 10-22 → D18** (한정 확정, PG/MySQL 프로필은 고객 요구 뒤 별도 설계) | GA 자동 플랜을 Oracle·MSSQL 캐시에 한정(D13)하고 PG/MySQL 재계획은 별도 "DB 변경 프로필"(SECURITY DEFINER 함수/프로시저 또는 업무 읽기 권한)로 남기나 | **한정 권고.** 엔진별 차이를 지원표·화면에 명시. 프로필은 고객 요구 확인 뒤 설계 |
| **Q27** ✅ **확정 10-22 → D19** (10 DB·300 tables·접속 1·3s·10분당 20s, 전 DB 자동 활성화 금지) | PG namespace 기본 선택 수·테이블 cap·연결 수·순회 예산과 50 DB 인증 조건 | 기본 10 DB·대상 전체 300 tables·접속 1·DB당 3s·10분당 20s부터 검증. 전 DB 자동 활성화 금지 |
| **Q28** v1.2 | 기본 `system_health`가 없는 환경(Azure SQL DB)·전용 XE가 필요한 기능(완료/에러 이벤트, 데드락 전용 세션)을 미지원으로 두나, 고객 생성 XE를 별도 지원하나 | GA는 자체 호스팅 `system_health` 읽기만. 관리형·전용 XE는 별도 인증 |
| **Q29** ✅ **확정 10-22 → D20** (unresolved 허용, `GV$` 보강은 R10 조인 실패율로) | RAC 노드별 `V$` 수집에서 unresolved 원격 blocker를 허용하나, 제한적 `GV$` 보강까지 인증하나 | Q3의 하위 검증 항목. **`V$`만으로 완전 지원 선언 금지**, R10 결과로 |
| **Q30** v1.2 | 클러스터 membership·지표별 합산·샘플 기반 분포 지표의 정확도 계약을 API 계약에 포함하나 | 포함(§4.6 합산 규칙·§5.3 명명 규칙) |
| **Q31** v1.3 🆕(신규 제안) | 비범위 저장소(Redis·MongoDB·ClickHouse, §16.4) 재개 여부·우선순위·수집 등급·구현 경로·견적 — Redis를 Zabbix 템플릿(+Q14 편입 여부)으로 두나, MongoDB를 P5 확장 후보에 올리나 | **현재 비범위 유지**(§10·§12 P5 변경 없음). 재개는 고객 요구 + 별도 조사 뒤 결정 — 후보 순서·Phase·조사 공수는 **미정**(코덱스 3차: 기존 P5 어림에 넣지 말고 신규 제안으로 다룰 것). 고객 요구 없이 착수 안 함 |
| **Q32** v2 🆕 | 원격 수집기(J2) 배포 형태 — JDK 번들(≈60MB 증가, 고객 JDK 의존 0) vs 고객 JDK 17+ 요구 · 지원 OS(RHEL 8/9·Ubuntu 22/24·Windows Server 2019/2022) · 오프라인 패키지 형식 | **JDK 번들 권고**(폐쇄망 설치 단순화·버전 호환 검사 단순), OS 3계열 GA. P0 R11에서 패키징 실측 뒤 확정 — **P1a 전까지 결정** |
| **Q33** v2 🆕 | J2 자격증명 보관 — BE 저장 후 수집기 공개키 봉투로 전달(§3.6) vs 수집기 로컬 입력(BE에 DB 비밀번호 없음, 교체도 수집기에서) | 중앙 보관은 교체·감사 집중의 운영 장점, 로컬 보관은 일부 금융 보안 정책 요구 — **어느 쪽도 고객 확인 없이 기본값으로 확정할 근거 부족**(코덱스 4차). **P0에서 고객 보안 요구를 확인하고 P1a 자격증명 모델 확정 전까지 GA 기본 구성 결정.** 로컬 입력 미지원이면 그 고객 제약을 지원표에 명시. 후속 UI 세부만 P3b 전 |
| **Q34** v2.1 🆕 | J2에서 `keep_raw_sql`(원문 보존 opt-in)을 **금지**하나, 별도 승인된 원문 전송(암호화 채널·`DBM_RAW_SQL_VIEW`·감사)을 허용하나 | **결정 전 기본 = J2 비활성**(§3.6 "원문이 망을 건너지 않는다" 유지, 관리 화면에 이유 표시). 허용하려면 전송 경로·보존 위치·열람 권한·정책 변경 시 큐 처리를 추가 설계 — **P1a 보호 계약 전까지 결정** |
| **Q35** v2.5 🆕 | 사용자명·클라이언트 주소 차원 텍스트(`dbm_dimension_text`)를 추세와 같은 **400일** 두나(이름 있는 추세) — 개인정보 관점에서 180일로 짧게 두나 | **기본 400일 + 관리 옵션으로 단축 허용**(설계 기본값으로 반영, 결정 대기 표시) — **P1a 전** |

**잔여 Q(v2 착수를 막지 않음)**: Q1(엔진 순서 — 추천 A대로 P0 진행)·Q2·Q4~Q11·Q14~Q21·Q23~Q25·Q28·Q30·Q31·Q32·Q33. 각 Q의 "결정 기한"은 §17.6.

---

## 14. 코덱스 독립 제안 대조 (v1.1 — 검수 공정성 지적 반영)

| 항목 | 코덱스 | 본 설계 | 판정 |
|---|---|---|---|
| 데이터 등급 C/S/Q/P/L | 제안 | 채택 | ✅ |
| 카운터(C) 소스 | Zabbix 템플릿을 카운터 담당(소스별 책임 분리) | 기본 C는 폴러. **Zabbix 카운터 개요 모드(C만) 보존**(Q14) | ✅ 보정 — v1은 제안 의도를 좁혔음. 폴러 동일 연결이 일관 스냅샷을 만들지는 않는다는 지적 수용(§8.3) |
| 세션 1s | 1s 기본 → 검수에서 **철회**, 5s 동의 | 5s 기본, **1s 조건은 전체 예산**으로 수정 | ✅ "설치형 PG 예산 밖"은 보편 사실이 아니라 고객별 — 금지 아닌 인증 프로필 |
| 원격 실행형(J2) | GA 포함 | **GA 토폴로지 축소**임을 인정, Q12로 사용자 결정 | ⚠️ 시기 차이가 아니라 **지원 범위 차이** |
| OTel 선행 실험 | P0에서 receiver 출력·마스킹·플랜 확인 | **R7 신설**, Q11은 R7 뒤 확정 | ✅ v1은 검증 없이 유예를 확정했음 |
| Codec 재사용 | 새 AES+key ID 제안 | 암호화 구현 재사용 + **키 운영(key ID·교체·복호화 실패 진단) 추가 설계** | ✅ "이미 같은 방식"은 과장이었음 |
| 6.0 `zabbix_sender` | 제공 | Q5 — **명시적 기능 차이**로 남김 | ⏸ |
| Oracle TUNING 제외·ASH 유예 | 별도 과제 | 동일 | ✅ |
| outbox+어댑터·UUID·surrogate·파티션 DROP·JPA 미사용·차분 후 정렬·품질 응답·마법사·EXPLAIN 금지 | 제안 | 채택(+검수로 계약 구체화: lease·checkpoint·`at=`·3축) | ✅ |
| 식별 모델 4층 | 제안 | v1은 압축했음 → **v1.1 채택** | ✅ 🔴3 |
| Phase 어림 | GA 215~315(원격형 포함, 플랜비교/APM/리포트 제외) | GA 270~355(반대) | ⚠️ 범위가 달라 총합 비교 무의미 — §12 포함 비교표 |
| "틀리기 쉬운 11가지" | — | 본문 대응 조항 + 검수에서 드러난 5개 추가 결함(🔴1·3·4·5·6) 반영 | ✅ "전 항목 대응" 과장 철회 |

---

## 15. Datadog DBM 대조 반영표 (v1.2, 2026-10-22)

조사 `research_datadog-dbm-2026-10-22.md` §4(G1~G38) + 코덱스 협의(G39~G49, 사실 정정). 판정 열은 코덱스, 반영 열은 본 설계.

| G | 항목 | 코덱스 | 반영 | 위치 |
|---|---|---|---|---|
| G1 | 설정 스냅샷 | 🟡 P1b, 승인 키만 | [x] P1b `dbm_setting_snapshot`, 승인 키, 인스턴스/DB/세션 구분, diff 알람 P3 | §5.8·§6.1·§7.1 |
| G2 | 스키마 추적 | 🟡 P3 축소 | [x] P3 WS-24 선택 DB·테이블·컬럼·인덱스·FK·제한 통계, 잘림≠변경 | §4.5·§6.1 |
| G3 | MSSQL 프로시저 통계 | 🟢 P2 | [x] `dm_exec_procedure_stats`·`dbm_proc_stat_1m/1h`, 내부 SQL 복원 약속 없음 | §4·§6.1 |
| G4 | 인덱스 사용·추천 | 🟡 P3·Q | [x] 데이터만(P3 `dbm_object_stat_1h`), 제거 판단 비범위 Q23 | §13 |
| G5 | 쿼리 완료/에러 XE·MySQL errors | 🟡 | [x] MySQL `SUM_ERRORS` P1b. MSSQL XE GA 제외(Q28). `attention`≠타임아웃 | §4·§5.4 |
| G6 | 데드락 system_health | 🔴 조건부 | [x] P2 조건부: `event_file`/ring_buffer, 2022 권한, 중복 제거·유실 표시, Azure SQL DB 미지원, R9 | §4·§5.8·§6.1·§11 |
| G7 | PG/MySQL EXPLAIN | 🔴 Q·비범위 | [x] **D13** GA 플랜 = Oracle·MSSQL 캐시만, PG/MySQL은 Q26. §4.4 지원표 | §0·§4.4 |
| G8 | Q `__other__` | 🔴 분모 조건 | [x] 같은 관측 집합일 때만 complete, 아니면 "≥" | §5.4 |
| G9 | 통계 10s vs 60s | 🟡 | [x] 60s 유지, 근거는 부하·churn(버킷 논리 아님) | §4 |
| G10 | SQL 주석 태그·Oracle MODULE/ACTION | 🟡 | [x] Oracle 원생 열 P2, 승인 키 태그 추출 P1a 토크나이저→P3 귀속, Q24 POC | §4·§5.5·§13 |
| G11 | Calling services | 🟡 P3 | [x] 검증된 태그만 서비스 귀속, program/client는 별 축 | §8.4 |
| G12 | 클러스터 그룹핑 | 🔴 membership 모델 | [x] §4.6 `dbm_cluster(_member)` 엔진별 근거 | §4.6 |
| G13 | AG/복제 뷰 | 🟡 P2·P3 | [x] P2 상태·queue(`dm_hadr_*`), P3 이력 화면 | §4·§8.2 |
| G14 | Agent Jobs | 🟢 P3 | [x] msdb 객체별 SELECT | §5.8 |
| G15 | Oracle 추가 뷰·RAC | 🔴 | [x] 객체별 capability 분리, `V$ASM_DISKGROUP_STAT`, RAC `GV$` 오류 정정, Q29·R10 | §4·§13 |
| G16 | 카운터 카탈로그 | 🟡 구현 계약 | [x] 부록 B(가족·소스·주기), 개수 목표 금지, R4 재산정 | 부록 B |
| G17·G18 | MySQL·MSSQL extra | 🟢/🟡 | [x] 키 고정 + 누적/게이지/min·max 유형 | §5.4 |
| G19 | 토크나이저 부산물 | 🔴 축소 | [x] P1a 명령 유형+승인 태그만, lineage P3 | §5.5 |
| G20 | 원문 opt-in 문구 | 🟡 | [x] "바인드 값은 텍스트와 분리돼 현 소스에 없다" | §5.5 |
| G21 | 활동 상한 | 🟡 유지 | [x] 1,000 유지, R2·R4 뒤 결정 | §5.3 |
| G22 | 오버헤드 벤치 | 🟡 | [x] Agent CPU/DB CPU 분리, 조건 명시(R2) | §11 |
| G23 | PG DB별 접속 | 🔴 오류 정정 | [x] **D15** 서버 Q 1회·namespace 예산·기본 10 DB, §4.5, Q27 | §4.5 |
| G24 | 라이선스 상한 | 🟡 | [x] **D16** `maxDbTargets`, Q22 | §9 |
| G25 | 샘플 cardinality | 🔴 | [x] 차원 quota(dimension/native/plan/checkpoint)·`__overflow__` | §5.4 |
| G26 | custom_queries | 🔴 Q | [x] Q25 템플릿만, 가드 목록은 협의 원문 | §13 |
| G27 | 보존 | 🟢 | 유지 | — |
| G28 | Oracle 플랜 통계 | 🟡 | [x] `GATHER_PLAN_STATISTICS` 추가, estimated/actual | §4·§4.4 |
| G29 | 블로커 영향 | 🟡 | [x] 시간 가중, 직접/root 구분 | §8.2 |
| G30 | LONG_QUERY | 🟢 | [x] 규칙 추가(현재 실행 기준, idle 제외) | §7.1 |
| G31 | 회귀·플랜 변경 | 🟢 | 유지(사건 분리) | — |
| G32 | VIP vs 직접 접속 | 🔴 | [x] "우위" 문구 삭제, failover endpoint vs 읽기 분산 구분, 레인별 노드 검증은 §5.1 boot_epoch | §5.1 |
| G33 | 권고 설정 | 🟡 | [x] capability 필수/권고 분리, 연결 상한은 예시 | §4 |
| G34 | 포화·리셋 관측 | 🟢 | [x] `source_visibility`, 자동 TRUNCATE 금지 | §5.4 |
| G35 | ASH 옵션 | 🟡 | [x] Q4 보강(프로필 분리) | §13 |
| G36 | consumer 토글 | 🔴 비범위 | [x] D14, 감지·안내만 | §0·§4 |
| G37 | `DBA_FEATURE_USAGE_STATISTICS` | 🟢 비채택 | 유지 | — |
| G38 | API 키 | 🟡 | [x] `fingerprint`≠`query_signature` 명시 | §8.1 |
| G39 | 호스트별 Rows/Query | 🟡 P3 | [x] SQL 상세 P3 | §8.2 |
| G40 | client IP·포트 구조 | 🔴 GA | [x] address·port·hostname·application 분리, NULL 허용 | §5.3·§6.1 |
| G41 | MSSQL Q user 부재 | 🔴 P2 | [x] userid NULL, 사용자 축은 S만 | §4·§5.4 |
| G42 | 샘플 백분위 의미 | 🔴 | [x] `observedElapsedP90` 명명 | §5.3·§8.1 |
| G43 | 샘플링 편향 | 🔴 | [x] 진단용 편향 명시, 외삽 금지 | §5.3 |
| G44 | 알람 정렬 | 🟡 P1b | [x] 개요 정렬/필터 | §8.2 |
| G45 | MariaDB 별도 표 | 🔴 P1b | [x] 지원표·unavailable 처리 | §4 |
| G46 | 부분 스냅샷 변경 감지 | 🔴 P3 | [x] completeness·scope version, 잘림≠DROP | §4.5·§6.1 |
| G47 | 클러스터 합산 규칙 | 🔴 | [x] §4.6 지표별 규칙 | §4.6 |
| G48 | PG toplevel 중복 | 🔴 GA | [x] 기본 집합 toplevel=true | §5.4 |
| G49 | 진단 preset | 🟡 P3 | [x] WS-19 | §12 |
| 철회 | "선택 패키지 = 승인 항목 3" | 🔴 | [x] D14로 대체 | §0 |

**코덱스 2차 검수(v1.2 델타, `review_db-monitoring-v1.2_codex.md`) — 🔴 C1~C9 전건 반영(같은 날)**: C1 §5.5 EXPLAIN 잔존 삭제·R1 격리 fixture · C2 §5.1 레인별 노드 검증·읽기 분산 endpoint GA 미지원 · C3 `__other__` 불완전 시 NULL·`observedShare` · C4 quota 참조 보존·admission·overflow 차분 금지·바이트 예산 · C5 PG 키에 `toplevel` · C6 membership scope·metric scope 규칙 · C7 용량 재산식(proc Top 200·활성 조건, object_stat 롤업, 잠정 130~175GB) · C8 프로시저 checkpoint에 `plan_handle,cached_time` · C9 Oracle 프로필별 허용목록 + `OBJECT_NAME` capability. 🟡: §12 P0 22~34·WS-26 라이선스 · §8.2 Phase 열(노출/기능) · §5.5 주석 전체 보존 삭제 · §4.5 `scope_version`·50 cols 테이블당 · §7.1 DEADLOCK capability 조건·통합 · §1.4 승인 항목 한정 · §5.4 사용자 문맥 분리 · §4.2 UNSUPPORTED/RECOMMENDED 상태 · 조사 §5 집계 정정. **반영 못 한 것: 없음.** 코덱스 종합 판정 "P0 실측 준비에는 사용 가능, v2 착수본은 C1~C9 해소 조건" → 해소했으므로 **다음 = 사용자 Q 확정**(Q22·Q26·Q27 등 v2 필수 Q).

---

## 16. 제공 인사이트 카탈로그·운영 환경 계약 (v1.3, 2026-10-22)

**성격**: **기존 GA 확정 범위와 공수 합계는 변경하지 않았다.** §3~§12에 흩어진 계약을 **"고객이 묻는 질문" 축**으로 재배열한 것이 기본이고, 여기에 **비범위 저장소 재개에 관한 신규 미결 제안 Q31**(§16.4)이 하나 들어 있다. 인사이트마다 데이터 등급(§3.1 C/S/Q/P/L)·저장 테이블(§6.1)·화면(§8.2)·엔진 가용성(§4)·Phase(§12)·**명시 한계**를 붙인다. 목적은 영업·고객 문서·화면 문구가 **설계가 보증하는 것 이상을 약속하지 않게 하는 기준표**다. 본문과 §16이 어긋나면 **본문이 정본**이고 §16을 고친다. **별도 승인되지 않은 지원·기본값·일정·견적은 §16에 있어도 제품 계약으로 쓰지 않는다**(코덱스 3차 검수 R1~R10 반영, `review_db-monitoring-design.md` "검수 결과(3차)").

### 16.1 인사이트 카탈로그 — "어떤 질문에 답하나" (I1~I28)

Phase 열은 **데이터·API·화면별로 구분**해 적는다. 실제 제공 시점은 **그 기능의 WBS Phase(§12)와 엔진 어댑터 도착 Phase(PG P1a · MySQL/MariaDB P1b · Oracle·SQL Server P2) 중 늦은 시점**이며, 별도 인증·capability 조건을 충족한 대상에서만 켜진다. 메뉴 최초 노출과 내부 기능 완성 시점은 §8.2를 따른다. 엔진 열의 "4종" = PostgreSQL·MySQL/MariaDB·SQL Server·Oracle(GA), capability `OK`인 대상에 한함. **공통 각주**: 표시되는 SQL·사용자·client는 **관측된 것**이며 텍스트 가용성·마스킹·잘림 한계는 §5.3·§5.5를 따른다(소스에 없는 필드는 NULL, 보존 못 한 텍스트는 해시만). 어느 행도 **원인을 확정하지 않는다** — 동시 관측을 나란히 보여줄 뿐이다.

**A. 장애가 나고 있는 지금(실시간)**

| # | 질문 | 답 | 데이터 | 화면 | 엔진 | Phase | 명시 한계 |
|---|---|---|---|---|---|---|---|
| I1 | DB가 지금 바쁜 이유가 CPU·I/O·락 중 무엇인가 | 활성 세션 수(AAS)를 **wait class별**로 쌓은 시계열. 락 비중이 크면 "SQL이 아니라 blocker를 찾아라" | S → `dbm_activity_1m`(wait_class, 시간 가중) | 상세 "AAS by wait class" | 4종(`dbm_wait_dimension` 공통 class 매핑) | P1a | 분자는 **실제 활성 상태만**(§5.3). 5s 샘플의 시간 가중값 — "실행 건수"가 아니다. 행 잘림 tick은 해칭 |
| I2 | 누가 누구를 막고 있나 | **root blocker** 1개 + 피해 세션 수·체인 깊이. blocker의 사용자·client 주소·프로그램·실행 중(또는 마지막) SQL. 트랜잭션만 열어둔 **idle blocker** 포함 | S·L → `dbm_session_sample`·`dbm_lock_edge`(48h)·`dbm_lock_incident` | 상세 "락 트리" 탭 · 세션 드로어 | 4종(MySQL 8 `data_locks` / MariaDB `INNODB_LOCK_WAITS` 분기) | P1a(인시던트 메뉴·재생 P3) | 세션 5s·락 10s 주기 — 그보다 짧은 블로킹은 누락 가능. RAC 원격 blocker는 `unresolved` 가능(Q29). MySQL P_S OFF면 processlist 저하 모드(blocker SQL 축소) |
| I3 | 어느 SQL이 지금 시간을 먹나 | 지난 1분 **델타** Top SQL: total_ms·calls·avg·rows·reads(+엔진 extra) + `__other__`. calls 증가와 평균 시간 변화를 나란히 비교 | Q → `dbm_query_stat_1m` | SQL 분석 Top SQL | 4종(PG는 `pg_stat_statements` 전제, MySQL은 P_S) | P1a | 스캔 상한 500 → "전체 Top SQL" 표현 금지. `other_complete=false`면 점유율 NULL(`observedShare`만, §5.4). **MSSQL Q에는 실행 user 없음**(G41). 첫 관측·인계 직후 분은 `partial`. **개별 장기 실행은 S 샘플(I4)로 확인** — Q는 실행 전체 이력을 보증하지 않는다. **PG 총량·점유율 기본 집합은 `toplevel=true`**, 구분 불가 버전(≤13·`track=all`)은 완전성 제한 표시(§5.4) |
| I4 | 지금 실행 중인 세션 하나하나는 무엇을 하나 | 활성 세션 표: 상태·대기 이벤트·경과·SQL·사용자·client(주소·포트·호스트명)·프로그램·DB | S → `dbm_session_sample` + `dbm_dimension_text` | 상세 "활성 세션"·세션 드로어 | 4종 | P1a | **5초 미만 실행은 포착될 수도, 누락될 수도**(원칙 5). 1,000행 상한은 blocker→대기→활성 우선순위, `total_rows`/`stored_rows` 분리. 가명화 ON이면 사용자·client는 가명(Q7) |
| I5 | DB 문제인가 서버 문제인가 | DB 부하(AAS)와 Zabbix 호스트 CPU·메모리·디스크·네트워크를 **같은 시간축에서 비교** | Zabbix 호스트 포트 읽기(`dbm_zbx_link`, role `OS_HOST`) | 상세 AAS 차트 오버레이 | Zabbix 호스트가 연결·확인된 대상만 | P1a | 호스트 미연결이면 "오버레이 없음"(추정 매칭은 관리자 확인 전까지 미표시). **두 관측의 동시성만으로 원인을 확정하지 않는다.** Zabbix 아이템 주기와 5s 샘플의 해상도가 다르다(범례 표시 등 UI 계약은 본문에 없음 — P1a WS-4 상세 설계 때 결정) |
| I6 | DB가 응답이 없나, 계정 문제인가, 수집이 멈췄나 | `DOWN`(접속 실패) / `AUTH_FAILED`(인증 분류) / `STALE`(수집 공백) 세 **대상·알람 진단 상태** 분리(배치의 `OK/PARTIAL/FAILED/SKIPPED`와는 다른 축) + 마지막 관측 시각 | `dbm_sample_batch.status`·`dbm_target.credential_status`·`dbm_capability` | 개요 카드 · 알람 | 4종 | P1a(알람 P1b · J2 원인 P3b) | **Hang 중 내부 상태는 못 본다** — "마지막 관측 시각 + 수집 불가(타임아웃)"(§5.8). 상위 원인 억제: 같은 Zabbix 호스트 다운이면 개별 DOWN은 묶임. **J2 대상의 `STALE`에는 수집기 heartbeat 공백·버전 불일치·수신 인증 실패·lease 만료 등 원인을 연결**하고 수집기 장애는 `COLLECTOR_DOWN` 1건으로 묶어 대상별 DOWN·STALE 중복 억제(§3.6) |
| I7 | 연결·캐시·복제·스토리지가 한도에 가까운가 | 카운터(**기본 15s**, 크기·tablespace·namespace 통계 등은 부록 B의 개별 주기 — 5m·10m·1h): 연결/상한·캐시 히트·복제 지연·tablespace/파일/tempdb 사용률·메모리 | C → `dbm_metric_1m`/`_1h` | 상세 "카운터" · 개요 | 4종(부록 B 가족, capability별) | P1a(어댑터 도착 순) | 엔진마다 가족·단위가 다름 — **공통 화면엔 비교 가능한 값만**, 원 단위·출처 보존. 연결 여유는 `CONN_PCT`(I18). 폴러 미등록 호스트의 Zabbix 템플릿 값은 Q14 카운터 개요 모드(P3 선택, I22) |

**B. 장애가 끝난 뒤(사후)**

| # | 질문 | 답 | 데이터 | 화면 | 엔진 | Phase | 명시 한계 |
|---|---|---|---|---|---|---|---|
| I8 | 새벽 3시 그때 무슨 일이 있었나 | **48h 안**: 타임 슬라이더를 그 시각으로 돌려 당시 **관측된** 세션 목록·락 트리를 재생. **48h 밖~30일**: 1m 집계로 대기 → SQL → 사용자까지 drill-down. 180일은 1h | S·L raw 48h / `dbm_activity_1m` 30일 / `_1h` 180일 | 성능 분석(과거 시점) · `at=` API(§8.3) | 4종 | API·계약 P1a(WS-6) · UX P3(WS-16) | 세션·락·카운터는 **원자 스냅샷이 아님**(패널별 `observedAt`). kind별 허용 시차(2×간격) 초과 패널은 "해당 시점 자료 없음". **48h 밖은 개별 세션 복원 불가**(D12) |
| I9 | 락 사고의 전말 | 블로킹 인시던트 1건 = 시작·끝·최대 깊이·피해 세션 수·root blocker(사용자·client·SQL) | L → `dbm_lock_incident`(30일) + 48h 안이면 트리 재생 | 잠금·트랜잭션 메뉴 · 상세 탭 | 4종 | P1a(상세 락 트리 탭만) · P3(인시던트 목록·메뉴 노출·재생, WS-16) | 인시던트 경계는 10s 샘플 기준(짧은 체인은 1건으로 안 잡힐 수 있음). **인시던트 기록은 30일 보존**, 트리 재생은 세션·락 raw 48h 안에서만. 30일 이후 남는 활동 집계(`dbm_activity_1h`)는 인시던트 상세 복원이 아니다 |
| I10 | 데드락이 났나, 누가 희생자였나 | **건수**는 인증된 카운터 소스가 있는 엔진·버전(§7.1): PG `pg_stat_database.deadlocks` · MySQL `innodb.deadlocks` · MSSQL `locks.deadlocks`. **Oracle은 소스 후보(`V$SYSSTAT` "enqueue deadlocks", 허용목록 안)만 있고 제품 카운터·알람 채택은 미확정**(채택하려면 §7.1·부록 B에 metric 식별·단위·리셋·인증 조건 추가). **희생자·참가자·리소스 그래프는 인증된 자체 호스팅 SQL Server의 기존 `system_health`를 읽을 수 있을 때만** | C + `dbm_deadlock_event`(180일) | 상세 "데드락" 탭(MSSQL) · 알람 `DEADLOCK` | 건수 PG·MySQL(MariaDB는 R1에서 소스 확인, 미지원은 `unavailable`)·MSSQL · 그래프 MSSQL | 카운터 PG P1a · MySQL/MariaDB 카운터+공통 알람 P1b · MSSQL 카운터·그래프 P2(조건부, R9) | ring_buffer 유실·재시작·XML 잘림 → 그래프는 **"포착된 것"**, 건수가 정본. Azure SQL DB 미지원(Q28). PG·MySQL·Oracle의 데드락 상세는 로그 파일이라 비범위(§10) |
| I11 | 어제와 오늘(배포 전후)이 다른가 | 두 기간의 Top SQL·대기 분포를 나란히 비교 | Q·활성 1m/1h | `/compare?a=&b=` · 성능 분석 | 4종 | P3(WS-16) | 비교 기간이 1h 롤업(Top 500/일)이면 "상위 N만 보존" 배지(Q19). 리셋·기준값 재설정 구간은 §5.4의 품질·통계 구간(`reset_seq`) 조건을 따른다(비교 화면에서의 표시 방식은 본문 미정 — WS-16에서 결정) |

**C. 평시·변경 전후**

| # | 질문 | 답 | 데이터 | 화면 | 엔진 | Phase | 명시 한계 |
|---|---|---|---|---|---|---|---|
| I12 | 특정 SQL이 느려진 게 데이터 때문인가 계획 때문인가 | SQL의 avg·calls 추이와 **plan_hash 변경 시점**을 같은 축에 표시 + 캐시 플랜 뷰(estimated/actual 표기). **계획 변경과 지연 변화의 동시 발생을 보여주며 원인은 확정하지 않는다** | Q·P → `dbm_query_stat_1h`·`dbm_plan` | SQL 상세 · 알람 `PLAN_CHANGE`·`QUERY_REGRESSION` | **추이는 4종**(PG `queryid`·MySQL digest·MSSQL `query_hash`·Oracle `sql_id`). **플랜·플랜 변경은 Oracle·SQL Server만**(§4.4) — PG·MySQL은 "GA 미지원" 안내 | 일반 Q 추이 = 어댑터 도착 Phase · 플랜 뷰 P2(WS-14) · **tracked SQL·플랜 변경·회귀 알람 P3(WS-17)** | actual rows는 Oracle `STATISTICS_LEVEL=ALL`/`GATHER_PLAN_STATISTICS`일 때만, MSSQL은 없음(Query Store P3 선택). 플랜 캐시 evict 뒤 미회수. 회귀 판정 기준선 ×k는 **알림이지 원인 판정이 아님** |
| I13 | 설정이 언제 바뀌었나 | 승인 키 스냅샷(600s), 값 변경이 **관측된 시점**마다 새 행(600s 사이의 변경·정확한 변경 시각은 보증 안 함) | `dbm_setting_snapshot`(180일) | 상세 "설정" 탭 · 알람 `SETTING_CHANGE` | 4종(`pg_settings`·`global_variables`·`sys.configurations`·`V$PARAMETER`) | P1b(WS-25) · diff 알람 P3(WS-20) | **승인 키만**(경로·접속정보·확장 설정 등 민감 키 제외). **"누가" 바꿨는지는 엔진 소스에 없어 제공 안 함**. 인스턴스 설정과 DB·세션별 설정은 구분 |
| I14 | 어느 프로시저가 무거운가 | 프로시저별 calls·CPU(worker)·reads·writes·spills + 그 시각 세션에서 보이던 내부 SQL | `dbm_proc_stat_1m`/`_1h` | 상세 "프로시저" 탭 · `/procedures` | **SQL Server만** | P2(WS-13) | 캐시 플랜(`plan_handle,cached_time`) 단위 차분 뒤 합산. 1m 저장은 Δcalls>0·**대상당** Top 200/분. **프로시저↔내부 SQL 완전 복원 약속 없음**(S에서 보이는 만큼) |
| I15 | 복제·가용성이 멀쩡한가 | 복제 지연(PG lag bytes/sec·MySQL seconds_behind·MSSQL AG sync state/log send·redo queue·Oracle DG lag), 역할(primary/replica) 변경 이벤트, **클러스터로 묶어 보기** | C + `dbm_node.role`·`boot_epoch` + `dbm_cluster(_member)` | 상세 "복제/AG" 탭 · 개요 "클러스터로 묶기" 토글 · 알람 `REPL_LAG` | 4종(capability별: DG 프로필·AG DMV·`SHOW REPLICA STATUS`·`pg_stat_replication`) | 지연 카운터 P1a~P2(어댑터 도착 순) · 알람 `REPL_LAG` P1b(WS-9) · 탭·클러스터 P2(WS-13·23) · 이력 P3 | 합산은 scope가 일치하는 metric만(§4.6) — 복제 지연·공유 스토리지는 합산 금지(대표값=primary). membership은 관리자 `confirmed` 전까지 **후보**. AG 밖 DB 지표는 AG 합계에 안 들어감 |
| I16 | 어느 애플리케이션·서비스가 이 DB를 아프게 하나 | ① 세션의 client 주소·프로그램·`application_name`/`module`/`program_name`별 분해 ② APM 보유 시 "서비스 전체 지연 vs 이 DB 부하" **시간 상관** ③ 승인 키 SQL 주석 태그(sqlcommenter/marginalia)로 서비스 귀속 | ① S 차원 ② `dbm_apm_endpoint_obs`·`dbm_apm_link` ③ `dbm_dimension_text.tag` | ① 상세 세션 분해 ② APM 상관 화면(둘 다 보유 시) ③ SQL 상세 "호출 서비스" | ① 4종 ② `DB_MONITORING ∧ APM`(§9는 **APM 상관 화면만** 두 Feature 조건) ③ **태그 수집·귀속은 `DB_MONITORING` 범위**, APM 서비스와 연결하는 화면만 두 Feature | ① P1a ② ③ P3(WS-18) | ②의 1차 표시는 **시간 상관**이며 "이 DB에 대한 서비스 p95"가 아님 — endpoint 관측 모델 이후 표시는 §8.4를 따른다. ③은 애플리케이션이 주석을 넣어야 함(Q24 — 트레이스 ID 금지, 서비스명 정적 태그). client 가명화 ON이면 ①은 가명 축 |
| I17 | 테이블·인덱스는 어떤 상태인가 | 스키마 스냅샷(정의 변경 시점), 객체 통계(seq/idx scan·dead tuple·크기·인덱스 사용 통계·관측 구간·리셋) | `dbm_schema_snapshot/_object`·`dbm_object_stat_1h`(+P1a: PG OID 이름 해석·relation 최소 집계, §4.5) | 상세 "스키마·객체 통계" 탭 | PG·MySQL·MSSQL(선택 DB·상한 300 tables/50 cols). **Oracle 스키마·객체 통계의 소스·권한·범위는 본문 미확정**(`OBJECT_NAME` 프로필 `DBA_OBJECTS`는 이름 해석만, `DBA_TABLESPACE_USAGE_METRICS`는 공간만 보증) | PG OID 해석·relation 최소 집계 P1a · 스키마 스냅샷·확장 객체 통계 P3(WS-24) | **관측 데이터만**(인덱스 사용 통계·scan 횟수·관측 구간·리셋·누락) — 미사용 판정·생성·제거 추천 없음(Q23). 상한 밖은 completeness 표시, DROP으로 해석 금지(G46) |

**D. 사람이 보기 전에 알려주는 것**

| # | 질문 | 답 | 데이터 | 화면 | 엔진 | Phase | 명시 한계 |
|---|---|---|---|---|---|---|---|
| I18 | 사람이 보기 전에 알려주나 | GA 규칙 11종(`DOWN·AUTH_FAILED·CONN_PCT·BLOCKING·LONG_TX·LONG_QUERY·DEADLOCK·AAS·REPL_LAG·STORAGE_PCT·STALE`) + P3 3종(`SETTING_CHANGE·QUERY_REGRESSION·PLAN_CHANGE`). **기존 Zabbix 알림 채널로 배달**(`history.push`) | §7 → `dbm_alert_event`·outbox | 알람 메뉴 · Zabbix 액션 | 4종 — 개별 규칙은 필요한 소스·capability를 충족한 대상에서만 활성(`DEADLOCK`·`REPL_LAG` 등) | 공통 규칙 11종 P1b(WS-9·11) · P3 3종(WS-17·20) — 둘 다 GA 범위. 실제 대상 제공은 어댑터·capability 충족 이후 | Zabbix **6.0은 `history.push` 없음**(Q5). 액션·미디어는 만들지 않음 — 고객 Zabbix 액션이 울린다. 억제(상위 원인·유지보수 창·재통지 간격)는 §5.8 |

**E. 데이터 신뢰**

| # | 질문 | 답 | 데이터 | 화면 | 엔진 | Phase | 명시 한계 |
|---|---|---|---|---|---|---|---|
| I19 | 이 숫자가 0인가, 못 가져온 것인가 | 품질 3축(`time_coverage`·`row_truncated`·`text_truncated`) + `sourceVisibility`·`dimensionOverflow`, capability 6상태(`OK/MISSING/DISABLED/UNSUPPORTED/RECOMMENDED/ERROR`) | `dbm_sample_batch`·`dbm_capability` | 조회 응답의 `status`·`quality`·관측 메타(§8.1) + 기능별 가용성·이유는 `dbm_capability`(§4.2, 개요 배지·탭 on/off) — 두 계약은 다름(capability 6상태를 모든 응답에 싣는 약속은 없음) | 4종 | P1a(WS-6) | **`MISSING`(권한·설정 누락 — 갖추면 동작)과 `UNSUPPORTED`(GA 정책상 미지원)는 다른 문구.** 예: PG `pg_stat_statements` 미설치 → Top SQL은 "0건"이 아니라 **`MISSING — pg_stat_statements 설정 누락. 필요한 설정과 재시작 여부를 확인하세요.`** / PG 실행계획 → **`UNSUPPORTED — GA 정책상 미지원`** |

**F. 그 밖에 본문이 이미 보증하는 것**(3차 검수 보강 — 새 기능 아님)

| # | 질문 | 답 | 데이터 | 화면 | 엔진 | Phase | 명시 한계 |
|---|---|---|---|---|---|---|---|
| I20 | 실행은 끝났는데 트랜잭션을 오래 열어 둔 세션이 있나 | 장기 트랜잭션 목록(세션·경과·사용자·client) + 알람 `LONG_TX`. idle-in-transaction은 조사 자료로 저장, AAS 분자엔 미포함 | S → `dbm_session_sample`(§5.3) | 상세 세션 표 · 잠금·트랜잭션 메뉴 · 알람 | 4종(`V$TRANSACTION`·`xact_start`·`dm_tran_active_transactions`·`INNODB_TRX`) | 수집 = 어댑터 도착 · 알람 P1b · 독립 메뉴 P3 | 샘플 기반 — 샘플 사이에 열고 닫힌 트랜잭션은 안 보임 |
| I21 | 연결 한도가 얼마나 남았나 | 연결 수/상한 비율 + 알람 `CONN_PCT` | C(부록 B) | 개요·상세 카운터 · 알람 | 4종 | 카운터 = 어댑터 도착 · 알람 P1b | 풀러 측 연결(폴러 자신 포함)도 셈 |
| I22 | 폴러를 등록하지 않은 DB 호스트도 볼 수 있나 | Zabbix DB 템플릿 값만으로 개요 카드(C만, "세션/SQL 미지원" 배지) | Zabbix 호스트 포트 읽기 | 개요 | Zabbix 템플릿이 붙은 기존 조사 대상 엔진 | **P3 선택(Q14, WS-21)** | 세션·SQL·락·플랜 없음. 새 저장소(Redis 등) 편입을 뜻하지 않음 |
| I23 | 사고 구간을 보안정책에 맞춰 내보낼 수 있나 | 증거 묶음 `/evidence-bundle?from&to`(마스킹·권한 적용) | §5.5 정책 적용 범위 | SQL 분석·성능 분석 | 4종 | P3(WS-22) | 원문은 `keep_raw_sql`+`DBM_RAW_SQL_VIEW`일 때만, 반출은 `dbm_audit` 기록 |
| I24 | 정기적으로 공유할 리포트·위젯이 있나 | DB 리포트·홈 위젯 | 1m/1h 집계 | 리포트·위젯 | 4종 | P3(WS-19) | 보고서 항목·자동 배달 일정은 본문 미정 |
| I25 | 누가 조회·반출·설정을 바꿨나 | `dbm_audit`(조회·내보내기·권한·보존·`keep_raw_sql`·드라이버) 180일 | `dbm_audit` | 관리 "감사" · `/dbm/audit` | — | 관리 메뉴 P1a(감사 항목별 최초 Phase는 본문에 일괄 명시 없음) | DB 쪽 "누가 설정을 바꿨나"(I13)와 다름 — 이건 MovesEye 사용자 감사 |
| I26 | 백업이 오래됐거나 Agent Job에 문제가 있나 | 백업 age(MSSQL `msdb`·Oracle `V$RMAN_BACKUP_JOB_DETAILS` 권한 추가·PG 없음)·Agent Jobs | 부록 B·§5.8 | 상세 탭 | MSSQL·Oracle(추가 권한) | **P3 선택(WS-20)** | 엔진·추가 권한 조건. 오류 로그 파일은 비범위 |
| I27 | 같은 SQL인데 호스트별 Rows/Query가 다른가 | 호스트(노드)별 Rows/Query 비교 | Q | SQL 상세 | 4종 | P3(WS-24) | 차이 관측이며 원인 자동 판정 아님 |
| I28 | 집중 진단을 어떻게 하나 | ① 30분 한정 1s 진단 프로필(자동 복귀, 예산 조건, §5.3) ② 진단 preset(P3) | S | 관리·상세 | 4종 | ① P1a(예산 조건) ② P3(WS-19) | ①과 ②는 다른 기능. preset 세부 동작은 본문 미정 |

### 16.2 수집 경로 역할 분담 — 한 표

| 경로 | 주는 것 | 안 주는 것 | 설계 위치 |
|---|---|---|---|
| Zabbix 공식 DB 템플릿(agent2·ODBC) | **기존 조사 대상 DB 템플릿 7종(§1.2)**은 집계 지표 중심: 연결·캐시 히트·복제 지연·락/슬로우 **건수** + 상태·설정·발견 항목 | 세션 목록·Top SQL·락 트리·플랜 같은 **심층 조사 기능**(7종 전수, §1.2). 다른 저장소 템플릿(Redis·MongoDB)으로 일반화하지 않는다 | 폴러 등록 대상엔 **중복 저장 안 함**(D2). 폴러 미등록 호스트엔 "카운터 개요 모드"(P3 선택, Q14). Oracle 템플릿은 ASH 경고 배지(§8.5) |
| Zabbix 호스트 지표 | OS CPU·메모리·디스크·네트워크 | — | I5 오버레이. 기존 host 포트 **읽기만**(§3.4) |
| Zabbix 발견·배달 | DB 템플릿 호스트·`device_classification=database`를 **등록 후보**로 제안, `history.push` 지원 버전(7.0+)에서 알람 배달 | 세션·SQL 수집. **6.0은 `history.push` 없음**(Q5 기능 차이) | §3.4·§7.2 |
| **BE 내장 JDBC 폴러(J1)** | **C·S·Q·P·L 중 엔진별 지원 범위**(§4 표 — PG·MySQL P는 GA 미지원) | DB 서버 설치 0. 단 **BE→DB 포트**가 열려야 함 | **기본 운영 경로 — 본 설계의 본체**(D1) |
| **원격 실행형 수집기(J2)** | J1과 같은 코어(엔진별 지원 범위 동일). BE→DB 직접 접속이 막힌 망(망분리)에서 고객 서버 1대에 설치, BE로 아웃바운드 HTTPS만 | DB 서버 설치는 여전히 0. 수집기 자체 HA·자동 업데이트 없음 | **GA(D21, §3.6, P3b)** |
| OTel Collector DB receiver(O1) | 보조 경로. Collector→DB만 열린 환경에서 S·Q·P 일부 — **R7 비교를 통과한 엔진만 "동등 프로필"**(§3.5) | 운영 기본 경로 아님. 국산 DB receiver 없음. events 시그널 `development` | **BE→DB 직접 접속과 필요한 DB 권한·설정이 갖춰진 J1 환경에서는 DB 모니터링을 위해 OTel Collector를 추가할 필요가 없다.** O1 보조 경로의 지원 엔진·동등성·제공 시기는 R7 결과와 Q11로 확정(기본 P5) |
| APM(`Feature.APM`) | 서비스 지연·DB 호출 fingerprint | DB 내부 상태 | I16 ② 시간 상관(둘 다 보유 시, §8.4) |

### 16.3 고객 환경 종속성 매트릭스 — 누가 무엇을 준비하나

**J1은 별도 MovesEye 수집 프로세스를 설치하지 않는다. J2는 고객 수집 서버 1대에 서비스를 설치하되, 대상 DB 서버에는 MovesEye 프로세스를 설치하지 않는다**(수집 서버 운영 요건은 §3.6 배포 행·Q32). "에이전트리스"는 **DB 서버에 설치가 없다**는 뜻이지 **전제가 없다**는 뜻이 아니다. **자동 점검이 가능한 접속·권한·엔진 설정**은 등록 마법사(§8.2 7번)와 권한 검사 리포트(§4.2)가 결과로 보여주고(가리지 않는다 — 원칙 1), **나머지(고객 보안정책·운영 디스크·관리형 서비스 인증 등)는 고객 준비 항목·지원표·운영 안내로 제공**한다.

| 종속성 | 누가 준비 | 우리가 하는 것 | 미충족이면 |
|---|---|---|---|
| **BE → DB 네트워크**(포트·방화벽·DNS) | 고객 네트워크 | 접속 테스트(`test-connection`)·타임아웃/인증 실패 분류(§5.1) | J1 경로 불가 → **원격 실행형 수집기 J2**(GA, D21 — 수집기를 둘 고객 서버와 수집기→BE HTTPS 아웃바운드가 필요). O1은 R7·Q11 확정 뒤 보조 대안 |
| **모니터링 전용 읽기 계정·권한** | 고객 DBA(제품 스크립트 실행) | 엔진별 최소 권한 스크립트(§4 "최소 권한" 열)·권한 검사 리포트(필수/권고 등급·PDF 내보내기 P4) | 필수 누락 `MISSING` → 해당 탭 OFF, 이유 표시. `RECOMMENDED`(권고 미충족)는 기능 동작, 안내만 |
| **엔진 전제 설정** — PG `pg_stat_statements`(`shared_preload_libraries` — 설정 변경에 재시작이 수반되는지 안내) · MySQL `performance_schema`=ON·consumer · MSSQL 기본 `system_health` 세션 존재 · Oracle 기본 경로는 **활성 프로필의 명시적 허용목록 안에서만 호출**(§4.1) | 고객 DBA | **감지·안내만**(D14). 전용 함수·뷰·프로시저·XE 세션 생성 없음. 재시작이 수반되는 항목은 마법사에서 **사전 고지** | PG: Q(Top SQL) `MISSING`(설정 누락 — 갖추면 동작; GA 정책 미지원인 P의 `UNSUPPORTED`와 다른 상태) · MySQL: S·Q 저하 모드(processlist) · MSSQL: 데드락 그래프 미지원 |
| **엔진·버전·에디션** | 고객 환경 | **Q16 인증 계획**(후보: Oracle 12c/19c/21c×SE2/EE, MSSQL 2016~2022, MySQL 8.0/8.4, MariaDB 10.5~11, PG 12~17) — 실제 인증 범위는 P0 결과표로 확정 | 미인증 버전·에디션의 동작은 보장 안 함. **미인증을 capability에 어떤 status로 표시할지는 Q16에서 함께 결정**(새 enum 상태를 암묵적으로 만들지 않음). MariaDB는 별도 지원표(G45) |
| **JDBC 드라이버** | 4종은 번들(§4.3) · Tibero·CUBRID·Altibase는 **고객 jar** | 업로드 로더(`DBM_ADMIN`·허용 클래스·SHA-256·**BE 재시작 후 적용**) | 확장 엔진 등록 불가. **고객 jar 업로드만으로 그 엔진이 지원되는 것은 아니다** — 어댑터(P5)·R6·지원표 조건을 별도로 충족해야 함 |
| **관리형 DB**(RDS·Aurora·Azure Database·Cloud SQL 등) | 고객 콘솔(파라미터 그룹·접근 경로) | **IAM 인증은 현재 비범위**(§10). **관리형 서비스별 비밀번호/TLS 접속·권한·확장·기능 가용성은 별도 인증 전 미확정** — 포괄 지원을 약속하지 않음 | Azure SQL DB는 `system_health` 없음 → 데드락 미지원(Q28). 관리형별 인증표를 만들지는 Q16 보강으로(신규 산출물) |
| **TLS·인증서** | 고객 | trust store(`dbm_setting.trust_store`)·접속별 TLS 설정(`dbm_endpoint`). **TLS 검증 기본 ON, 실패 시 자동 다운그레이드 금지**(§5.1) | 관리자가 명시적으로 `tls=disabled`를 선택한 대상은 **배지**(§5.1). 경고 위치·차단 정책의 추가 계약은 본문에 없음 |
| **인증 방식** | 고객 | **GA는 비밀번호+TLS**. Oracle Wallet·Kerberos·MSSQL 통합 인증·외부 비밀관리는 Q8에서 고객군·최소 구성 확인 | 등록 불가. **P5 제공은 미확정** |
| **시간·문자셋** | — | 전부 UTC 저장·`db_clock_offset_ms` 측정·연결 charset UTF-8 명시(§5.8) | 경과 시간은 DB 보고값(monotonic) 우선 |
| **MovesEye 저장 PG 디스크** | 고객 운영 | 보존 일수 정책(§6.3 v2.5 — APM과 같은 계단, **자동 조정 없음**) + 규모별 디스크 프로필(§6.2·Q20) + 설치 가이드 "MovesEye 서버 디스크를 Zabbix로 감시" | 디스크가 차면 DBM만 아니라 MovesEye 전체(PG 공유)가 선다 — 공용 디스크 가드는 백로그(§6.3) |
| **라이선스** | 발급 | `maxDbTargets`(D17 확정) 원자적 admission — 상태·Feature·만료 게이트가 먼저 | 활성화 거부 + 이유, 하향 시 기존 유지+`OVER_LIMIT`. `EXPIRED`부터 J1 폴러·J2 수집기 정지(D10·D22) |
| **개인정보·원문 정책** | 고객 보안팀 | 보안 프로필(표준/금융, Q7 가명화)·`keep_raw_sql` opt-in·`DBM_RAW_SQL_VIEW` | **원문은 opt-in 전 OFF**(§5.5에서 도출). **가명화 기본값은 Q7 확정에 따름**(Q7 추천: 금융 프로필 기본 ON; 표준 프로필 기본값은 본문 미정) |
| **DB 서버 설치** | — | **MovesEye 수집 에이전트·전용 객체 설치는 없음.** 엔진 자체 확장·설정 전제는 위 "엔진 전제 설정" 행 | — |

### 16.4 비범위 저장소 — 근거와 재개 기준 (Q31)

**이 절은 §10 비범위를 바꾸지 않는다.** 아래 "확인된 사실"은 2026-10-22 코덱스 3차 검수가 공식 문서로 재확인한 범위이고, "재개 기준"은 **신규 미결 제안(Q31)**이다 — 재개 여부·우선순위·수집 등급·구현 경로·견적은 고객 요구와 별도 조사 뒤 Q31에서 결정하며, 본문에 확정된 P5 항목이나 기존 공수에 포함하지 않는다.

| 저장소 | 지금 | 확인된 사실 | 재개 기준(Q31 제안) |
|---|---|---|---|
| **Redis** | **비범위 유지**(§10). 기존 Zabbix 공식 템플릿 `Redis by Zabbix agent 2`로 주요 집계 지표·상태·설정을 볼 수 있다 | 세션·SQL·락 개념이 없어 본 설계의 S·L·P 모델이 그대로 대응되지 않는다. `INFO`는 메모리·히트율·연결·키스페이스·복제·persistence 외에 **`commandstats`·`latencystats`(명령별 통계)**도 포함하는 주요 집계 소스다(모든 진단 데이터나 Zabbix 수집 범위를 뜻하진 않음). `SLOWLOG GET`은 개별 느린 명령 실행 기록의 목록(Redis 7.4 기본 설정 예제 `slowlog-max-len 128`, 고객 설정에 따라 다름), `CLIENT LIST`는 순간 목록. Zabbix 템플릿은 slowlog **건수**를 수집하며 개별 기록·client 목록을 제공하지는 않는다 | 추가 요구(느린 명령 기록 보존·명령별 통계 추이 등) 충족 여부는 별도 판단. 재개 시 **수집 등급·클라이언트·실행 구조를 조사**한다(조사 전 C·Q로 한정하지 않음). Q14 카운터 개요 모드에 Redis 템플릿 호스트를 편입할지도 미확정 |
| **MongoDB** | **비범위 유지**(§10) | `currentOp`(활성 작업)·`system.profile`(프로파일 이벤트 — **기본 OFF인 profiler를 활성화한 DB별 capped collection**)·`serverStatus`·`$collStats`(집계) 소스가 있다. **`locks`/`globalLock`는 락 횟수·대기 시간·큐 크기 집계이며 blocker↔waiter 관계(L)를 보증하지 않는다.** `system.profile`도 기존 Q 누적 통계와 같은 계약이 아니다. JDBC가 아니고 BSON 셰이프 정규화·마스킹은 §5.5 토크나이저와 다르다. Zabbix 공식 템플릿은 `MongoDB node by Zabbix agent 2`·`MongoDB cluster by Zabbix agent 2` 두 개(노드·DB·복제·클러스터의 집계 지표와 상태 중심) | **후보 순서·Phase·조사 공수 미정**(새 제안 — §12 P5에 없음, Q1 순서와 별개). 확장 조사 시 검토 항목: 드라이버 라이선스(R6 취지)·profiler 활성 전제·BSON 정규화·마스킹·소스 가용성 검증(R3 취지)·기존 S/Q/L 모델 대응·완전성 |
| **ClickHouse** | **비범위 유지**(§10) | 관측 소스 후보 `system.processes`(실행 중 쿼리)·`system.query_log`(설정 전제)는 존재하나, MovesEye의 수집·정규화·권한·완전성은 **미조사**. 국내 수요 미확인 | 고객 요구 시 조사 |
| Elasticsearch·Kafka·RabbitMQ 등 | **본 설계의 범위 밖** | DB 모니터링이 아니라 미들웨어 모니터링 — 질문(세션·SQL·락)이 다르다 | **별도 기능 제공 여부는 결정하지 않았다** |

### 16.5 보증하지 않는 것 — 문서·화면 문구 규칙

고객 안내·화면 각주·영업 자료는 아래를 **본문의 범위·조건·미결 상태를 유지한 채** 쓴다. 완화 표현("대부분"·"거의 모든")으로 바꾸지 않고, 본문보다 강한 보증으로도 바꾸지 않는다.

1. **추천 없음** — 인덱스 생성·제거, SQL 재작성, 파라미터 값 제안은 하지 않는다. **관측 데이터**(인덱스 사용 통계·scan 횟수, 관측 구간·리셋·누락 동반)는 제공하되 **미사용 판정·제거 후보 추천은 제공하지 않는다**(Q23·§10).
2. **샘플은 실행 이력이 아니다** — "5초 미만 실행은 포착될 수도, 누락될 수도 있습니다." 짧은 고빈도 SQL은 Top SQL 누적 통계로 본다(원칙 5). **관측 분포에는 샘플링 편향(긴 실행 과대표집·상한 우선순위)이 있으며 전체 실행 지연 분포로 외삽하지 않는다** — 분포 지표는 `observedElapsedP90`처럼 "관측 시점 경과"로 명명(G42·§5.3).
3. **PostgreSQL·MySQL/MariaDB 실행계획은 GA 미지원** — 등록 마법사 "기능 미리보기"와 SQL 상세 둘 다에 같은 문구(D13·§4.4). **D18로 GA 제외가 확정됐고 후속 재계획 프로필의 지원 일정은 정하지 않았다 — 일정을 약속하지 않는다**(편집 지침 — 기능·Phase 변경 아님).
4. **데드락 그래프는 "포착된 것"** — 건수는 카운터가 정본. 그래프는 **인증된 자체 호스팅 SQL Server의 기존 `system_health`를 읽을 수 있을 때**(권한·R9·capability 조건)만(§5.8·I10).
5. **Hang 중 내부 상태는 못 본다** — "마지막 관측 시각 + 수집 불가(타임아웃)"(§5.8).
6. **RAC 원격 blocker는 unresolved로 표시될 수 있다** — `GV$` 불필요 선언 금지(Q3·Q29).
7. **APM 상관의 1차 표시는 서비스 전체 지연과 DB 부하의 시간 상관이다** — "이 DB에 대한 서비스 p95"로 쓰지 않는다. endpoint 관측 모델 이후의 표시는 §8.4를 따른다(영구 제한이 아님).
8. **스캔 상한·소스 불완전성·장기 압축 누락이 있는 경우 "전체 Top SQL"이라 표현하지 않는다** — `other_complete=false`의 전체 대비 점유율은 NULL, `observedShare`는 별도 명칭으로만(§5.4·Q19).
9. **0과 미수집을 구분한다** — 조회 응답은 §8.1의 `status`·`quality`·관측 메타데이터를 제공하고, 기능별 가용성·이유는 §4.2 capability로 표시한다(두 계약은 다름). `UNSUPPORTED`(GA 정책)와 `MISSING`(권한·설정 누락)은 다른 문구.
10. **"DB 측 객체 0개"라고 쓰지 않는다** — "MovesEye 전용 함수·뷰·프로시저·XE 세션을 만들지 않는다"로 쓰고, 엔진 전제(`pg_stat_statements`·P_S)는 고객 설정임을 같이 적는다(D14·원칙 1).
11. **(v2.1) 원격 수집기는 자동 HA가 없다** — 수집기 장애는 `COLLECTOR_DOWN`으로 알리고 **수동 교체**한다. "수집기 이중화"를 약속하지 않는다(§3.6 비범위).
12. **(v2.1) 지연 재전송 데이터는 실시간 관측과 구별한다** — 복구 뒤 들어온 배치는 과거 버킷에 반영되지만 **현재 알람을 다시 열지 않으며**, 보존 창을 지난 배치는 반영되지 않는다(§3.6 늦은 데이터).
13. **(v2.1) 원격 수집기에서는 SQL 원문이 망을 건너지 않는다** — `keep_raw_sql`은 J2에서 비활성(Q34 결정 전), 화면에 이유를 표시한다. 플랜·데드락 XML도 민감 필드 제거 뒤에만 전송된다.

---

## 17. 착수 계획 (v2.0, 2026-10-22)

v2 필수 미결(Q22·Q26·Q27·Q3/Q29·Q12·Q13)이 확정돼 **P0 실측을 시작할 수 있다.** 이 절은 "무엇부터, 어디서, 무엇이 나오면 다음 단계로"를 적는다. 공수는 §0.1·§12, 계약은 본문이 정본.

### 17.1 P0 실측 체크리스트 (22~34 사람-일 + R11)

| 순서 | 항목 | 환경 | 산출물 | 완료 기준 |
|---|---|---|---|---|
순서는 **의존 관계**다(번호는 직렬 순서가 아님): 환경 확보 → 최소 권한·마스킹(코드만 가능한 것은 환경 전에) → **공통 제어·배치 계약 시험본 고정**(§3.6 🧪 항목을 시험 가정으로 문서화) → R8/R11 → 결과 통합 → DDL·지원표·공수 확정. **통과 기준은 §11 R열과 동일**하며 여기서 축소하지 않는다.

| 순서 | 항목 | 환경 | 산출물 | 완료 기준(§11과 동일) |
|---|---|---|---|---|
| 0 | **시험 환경 확보**(Q9) + **시험 하드웨어 기준 고정**(Q20 선행분) | 신규 VM 1대 승인 요청(대안: 로컬 PC). Oracle XE 21c·SQL Server **2016·2019·2022** Dev(R9 버전별 — 2022만 가능하면 미실시 버전은 게이트로)·MySQL 8.0·MariaDB 10.11·PG 16(dev PG와 분리). **시험 서버 10.220.0.13 사용 금지** | 환경 목록·접속 정보(마스킹)·설치 스크립트·하드웨어 사양 | 엔진 접속 성공, 모니터링 계정 생성. 실 RAC는 확보 불가 전제 → 게이트(아래 R10) |
| 1 | **R1 최소 권한**(Oracle P0 병행) | 위 VM | 엔진별 권한 스크립트 v0(§4 "최소 권한" 열)·capability 검사 SQL·결과표 | **4계열 + MySQL/MariaDB 별도 프로필의 예상 capability 상태표와 일치**(모든 등급 OK를 요구하지 않음 — `MISSING`·`UNSUPPORTED`도 예상대로). PG `EXPLAIN` 권한은 **격리 fixture에서만** |
| 1' | **R3 마스킹 fixture**(환경 불필요 — ZM-172 첫 코드) | 로컬 | 200건 fixture(4방언·한글·잘린 SQL·주석·DDL·바이너리 리터럴·비정상 인코딩)·토크나이저(코어 모듈 안) | 리터럴 잔존 0(fixture 기준), 실패는 해시만, **J1·J2 큐·전송·예외 로그·진단 번들에 원문 0**(검사 지점 목록 산출) |
| 2 | **공통 계약 시험본 고정** | — | §3.6 🧪 항목(lease API·config/허가·멱등 키·epoch 범위·checkpoint·큐·시간 보정·수신 오류 분류)의 **시험용 schema·수치 표** + `contract_db-monitoring.md` 초안(배치 식별·시간·오류·소유권 필드 포함) | R8·R11이 이 표를 입력으로 쓸 수 있음. 운영 계약 확정은 P0 종료 때 |
| 3 | **R2 부하** | VM(합성 부하 500·**5,000** 세션) | 5s/1s 폴링의 DB CPU·p95·수집 지연·**락 영향·상한 우선순위 동작**(BE CPU와 DB 쿼리 CPU 분리) | 5s에서 DB CPU +1% 미만·tick 2s 내 |
| 4 | **R4 용량** | dev PG 별도 스키마 | 50 대상 7일 합성 적재·bytes/row·**WAL·롤업 시간·`at=` p95·APM 동시 부하·파티션 DROP 가드**·J2 영수증/손실 메타 비용 | 과거 세션 질의 <1s, §6.2 산식 보정 |
| 5 | **R9 system_health** | VM 2016·2019·2022 | `event_file`/ring_buffer 읽기·2022 `VIEW SERVER PERFORMANCE STATE`·유실/중복 제거·XML 마스킹 | 포착률 보고(보장값 아님)·중복 0. **미실시 버전은 지원표 확정 게이트** |
| 5' | **R10 RAC 조인(모의)** | 독립 인스턴스 2개 | `BLOCKING_INSTANCE/SESSION` 조인 로직·unresolved 사유 분류 | 조인 성공·unresolved 분류 정확. **이 결과는 RAC 인증이 아님** — 지원표 "미인증·PoC 대상", 실 RAC 확보 기한은 P2/P4 게이트 |
| 6 | **R8 HA**(J1) | 2노드 | lease 인계 시간·fencing·PG 정지 중 큐·재시작 후 checkpoint 첫 관측 partial·failover 후 boot_epoch | **RTO ≤30s, 이중 적재 0, 가짜 급증 0**. J2 고립·수동 교체는 R11에서 별도 |
| 6' | **R11 원격 수집기**(신규) | 로컬+VM | 코어 경계(메모리/파일 구현으로 구동)·단일 jar+systemd·Windows 패키징·재시작 시점별 crash·키/설정 변경 중 배치·라이선스 단절·시간 오차 ±2s·큐 256MB 소진·토큰 회전/폐기·프록시/인증서 | **멱등 중복 0·회전 중단 <10s·30 대상 CPU 1코어 미만·heap 상한 명시**. Q32 결정 입력 |
| 7 | **R5 배달**·**R6 드라이버**·**R7 OTel 비교** | dev Zabbix 7.0 / 법무 / Collector 0.159.x | R5: 전송기 추출 후 APM 회귀·6.0 폴백 UX(자동 복구·순서·채널 도달) / R6: 배포물 목록(ojdbc·mariadb·J2 런타임 번들)·적용 조건·로딩 결과 / R7: §11 비교 항목(출력·마스킹·큐/로그 원문·망·완전성) 전부 | R5 기존 계약 유지·Q5 결정 / R6 법무 1줄+로딩 성공 / R7 비교표 → Q11 |
| 8 | **결과 통합** — 지원 버전표(Q16 결과표)·`dbm_*` DDL 초안(Flyway 번호는 생성 직전 최신 재확인, `V90__`은 예시)·§3.6 🧪 → 계약 확정·공수 재확정(R11·P3b·P4 분해) | — | 인증표·DDL·v2.2 설계 개정·`contract_db-monitoring.md` | 코덱스 P0 종료 검수 🔴 0 |

**P0 종료 기준(v2.1)**: **R1~R11 각각에 대해 "통과 근거" 또는 "명시적 차단·후속 게이트"를 기록한 판정표**가 있어야 종료한다. 미실시·실패·조건부 통과를 구별하고, **미실시 항목을 통과로 처리하지 않는다**. 그 결과가 필요한 구현·지원 선언(RAC·MSSQL 2016/2019 데드락·J2 OS별·J1/J2 동등성)은 게이트 해소 전 진행하지 않는다. 추가 필수: 공통 계약 확정(§3.6 🧪 해소)·DDL 초안·인증표·공수 재확정·코덱스 P0 검수 🔴 0. 하나라도 막히면 §11 "막히면" 열대로 설계를 고쳐 **v2.x**로 올린다(P1a로 넘어가지 않음).

### 17.2 코드 골격 (P1a 첫 주)

```
moveseye-be-spring/
  src/main/java/.../premium/dbm/
    target/        dbm_target·endpoint·node·namespace·credential(enc:v2 키 운영)·capability·zbx_link
    collector/     ✅ 레인 스케줄러 DbmPollerManager(fast/slow 스레드 각 1, SmartLifecycle)·DbmPollerProperties(app.dbm.poller.*)·DbmPollerStatus (2026-10-27). namespace 레인·전용 풀은 이월, 디스크 큐는 J2
      j1/          ✅ core.spi의 J1 구현 — PgLeaseClient·PgBatchWriter(배치+행+checkpoint 한 트랜잭션)·PgCheckpointStore(10-26) · PgConfigSource(30s 캐시+라이선스 거부)·CodecSecretResolver(10-27)
    retention/     ✅ DbmRetentionDays·DbmRetentionService·DbmRetentionJob(2026-10-27) — `dbm_retention`(V91 키 2 + V92 키 4, 단계 6: 선생성·배치·checkpoint·원본 DROP·1m DROP·차원) · 공통 `premium/common/{partition,retention}` 확장. WS-10: 5m/1h DROP·롤업 워터마크 가드
      core/        ← **Gradle 모듈 `dbm-collector-core`로 분리됨(2026-10-26)** — 패키지명은 유지, 소스는 `moveseye-be-spring/dbm-collector-core/src/`(어댑터·정규화·마스킹·품질·runtime·local). 🔴 프로덕션 의존 0 — BE 빈·JPA·Spring을 import하면 컴파일 실패
    adapter/       pg/ ✅ PgEngineAdapter·PgSessionCollector·PgLockCollector·PgCounterCollector·PgQueryStatCollector·PgSqlText·DeltaWindow·PgServerInfo(10-27, 코어 모듈 안) · mysql/ mssql/ oracle/ (P1b·P2 — 각: 세션·락·카운터·Q·플랜 + 버전 분기 + capability 검사)
    store/         ✅ DbmPartitionService(2026-10-27, 공통 DailyPartitionService 껍데기 — 표 4개) · 행 저장은 collector/j1/PgTypedRowStore(writer 트랜잭션 안) · 롤업 1m→5m→1h(WS-10)
    quality/       time_coverage·row/text_truncated·source_visibility·dimension_overflow
    alert/         규칙 평가·outbox·DbmAlertDeliveryAdapter
    api/           /dbm/** 컨트롤러·DTO·`@RequiresFeature(DB_MONITORING)` — ✅ 도구 EP 2개 · DbmPollerController(GET /dbm/poller/status, 10-27)
    ingest/        (P3b) /dbm/ingest/v1 — 수집기 수신·토큰·버전 검사·재검사
  premium/common/partition/    ✅ DailyPartitionService·PartitionDropGuard(2026-10-27, ApmPartitionService에서 추출 — APM은 껍데기)
  premium/common/retention/    ✅ RetentionOptions·SchedulerOptionsReader·RetentionStepRunner(ApmRetentionDays/Policy/Job에서 추출)
  premium/common/zbxtrapper/   (P1b) ZabbixAlertBridge에서 추출한 트래퍼 전송기(APM 리팩터 동반)
  db/migration/V90__dbm_core.sql · V91__dbm_retention_job.sql · V92__dbm_typed_tables.sql …  (착수 직전 최신 번호 재확인 — APM이 계속 번호를 쓴다)
moveseyee_fe/src/pages/database-monitoring/  개요·상세·SQL·알람 + /setting/database-monitoring 마법사·수집기 탭
moveseye-license-issuer/  LicenseClaims.MAX_DB_TARGETS 추가(BE 사본 동일) + 양쪽 LicenseContractTest
```

규칙: `engine-api`의 **수집 포트·계약(`engine/`·`zabbix/`) 무수정**(원칙 7 — 단 `common/exception/ErrorCode`는 모듈 가이드가 "이동된 app 공용 커널"로 두는 공용 오류 enum이라 GPU·APM 선례대로 DBM 코드를 추가한다, 코덱스 5차 #31) · 폴러 전용 커넥션 풀(메인 PG 풀 고갈 차단) · 모든 SQL은 파일로 두고 **Oracle SQL FROM 절 객체 ⊂ 프로필 허용목록** 자동 테스트(§4.1) · 마스킹 검사기는 `collector/core`에 두어 J1·J2가 같은 코드.

### 17.3 첫 스프린트 범위 (P1a 앞 2주)

**목표**: PG 대상 1개의 **등록 → 수집 → 보호 → 적재 → 조회 최소 흐름** + 라이선스 admission. **공통 식별·시간·소유권·정책 버전 계약을 먼저 고정**(P0 2번 산출물)하고, 각 WS의 이번 스프린트 완료 범위와 이월 범위를 아래 표로 구별한다(첫 스프린트 완료 ≠ P1a 완료).

| WS | 이번 스프린트 | 이월(P1a 안) |
|---|---|---|
| WS-1 | ✅(2026-10-28, 미커밋) 대상·endpoint·자격증명(`enc:v2` 키 ID 형식)·capability 저장·활성화 admission(D17)·라이선스 사용량 EP | 키 교체 배치·복호화 실패 진단(`DECRYPT_FAILED` CHECK)·드라이버 로더·`DBM_ADMIN` 좌표(WS-4)·폴러 전용 풀·대상별 워커 |
| WS-2 | ✅ 폴러 프레임: fast/slow 2레인·PG lease·PG checkpoint·`BatchWriter`/`LeaseClient`/`CheckpointStore`/`ConfigSource`/`SecretResolver`/`Clock` 인터페이스 + **메모리/파일 구현 테스트**(10-23~26) · **DB `ConfigSource`·Codec `SecretResolver`·레인 스케줄러·`GET /dbm/poller/status`(10-27)** | namespace 레인·파티션 서비스·차원 quota 전체(이번엔 quota 상한 상수와 `__overflow__` 자리만)·폴러 전용 풀(WS-1)·`dbm_poller` 스위치 행(WS-4). 디스크 큐는 J2(P3b)로 |
| WS-3 | ✅ **1단계(10-27)** PG 세션 5s·락 10s·카운터 15s(최소 가족)·`pg_stat_statements` 서버 1회·`toplevel`·`__other__`(완전성 조건 포함) — `adapter/pg` · ✅ **2단계(10-27)** typed 파티션 표 V92·`DbmPartitionService`·`PgTypedRowStore` writer 라우팅·보존 키 4개·`dbm_sample_row` 제거 | namespace 10 DB 예산·relation 집계·설정 스냅샷·DB별 카운터 태그 |
| WS-6 | 품질 3축·`at=` 계약·client 구조화·**명령 유형·승인 태그 추출**(첫 적재부터 지켜야 할 보안·식별 계약은 제외하지 않음) | `sourceVisibility`·`dimensionOverflow` 세부 |
| WS-26 | `maxDbTargets` 클레임(발급기+BE 4파일 사본·ContractTest)·admission(원자적·하향·동시 활성화)·`/dbm/license/usage`·배너 | 외부 알람 배달(`LICENSE_LIMIT`은 P1b 평가기) |
| WS-4(FE) | WS-3 뒤 개요·상세(AAS by wait class·활성 세션·락 트리 탭)·SQL 표 — 계약은 `contract_db-monitoring.md`(J2 대비 배치 식별·시간·오류·소유권 필드 포함) 먼저 | 관리 마법사 전체 |
| WS-5 | — | Zabbix 발견·호스트 링크(P1a 후반) |

### 17.4 Phase별 종료 기준(DoD)

| Phase | DoD |
|---|---|
| P0 | §17.1 종료 기준 |
| P1a | PG 대상 1개 등록→5s 세션·락 트리·Top SQL·카운터·`at=` 재생(API) 동작 · 품질 3축 응답 · 마스킹 검사기 fixture 통과(큐·로그 원문 0 포함) · **코어가 메모리/파일 구현(`BatchWriter`·`LeaseClient`·`CheckpointStore`·`ConfigSource`·`SecretResolver`)만으로 구동됨을 테스트로 증명**(writer만이 아니라 lease·checkpoint 분리 증명 — P3b 전제) · lease 경계·재시작 baseline/partial·quota 상한·`__other__` 완전성·namespace 예산(10 DB·300 tables·50 cols·cursor·`PARTIAL`) 검증 · `maxDbTargets` 발급→거부 종단 + **하향 갱신·HA 동시 활성화** 검증(배너·거부·상태 API는 P1a, 외부 알람 배달은 P1b) · 공통 계약(§3.6 🧪 해소본) 반영 · 코덱스 검수 🔴 0 |
| P1b | MySQL·MariaDB 대상(P_S OFF 저하 모드 포함) · **공통 알람 규칙 11종**(§7.1 GA 11종) Zabbix 7.0 배달 + APM 회귀 통과 · `LICENSE_LIMIT`·`COLLECTOR_DOWN`은 kind별 Phase 목록으로(`LICENSE_LIMIT` P1b 평가기, `COLLECTOR_DOWN` P3b) · 설정 스냅샷 · 보존 탭 |
| P2 | Oracle(XE·허용목록 자동 테스트·CDB/PDB)·**RAC 3단 분리: ① 노드별 수집+unresolved 구현 완료 ② 모의 조인 시험 완료(독립 인스턴스 2개) ③ 실 RAC 인증 — P2 DoD는 ①②까지, ③ 전에는 지원표 "미인증·PoC 대상"** · MSSQL(프로시저·system_health 조건부 — 시험한 버전만·AG)·캐시 플랜 뷰어 · 클러스터 membership · 권한 검사 리포트 내보내기 |
| P3 | 과거 시점 재생 UX·기간 비교·플랜 변경·APM endpoint 롤업(APM 계약서)·스키마 스냅샷·태그 귀속·리포트 |
| P3b | 수집기 1대로 **PG·MySQL/MariaDB·Oracle·MSSQL** 대상 수집 → BE 적재가 J1과 동일 결과(엔진별 인증표 — 플랜·데드락 XML 보호·드라이버·TLS 포함; 미시험 엔진은 J2 지원표에 미인증) · 큐 소진·복구 멱등·crash 시점별 복구 · 토큰 회전/폐기 · lease 허가 만료 정지 · `VERSION_MISMATCH` 차단 · 원격 작업(접속 테스트·capability) · **Q32 지원 OS/아키텍처별** 서비스 설치·재시작·업데이트/롤백 각 1회 성공(오프라인 포함) |
| P4 | 50 대상(J1 30 + J2 20) 복합 부하 7일(저장·복합 부하 검증) + **J2 30 대상 상한은 별도 인증 workload** + **J1/J2 결과 동등성 별도 판정** · HA: **J1 수집 자동 인계 ≤30s**(J2 수동 교체·BE 수신 API 장애 복구는 별도 기준) · 폐쇄망 설치 문서 · 보안 심사 패키지(J1 직접/J2 아웃바운드) · 지원표(엔진×버전×플랜·데드락·MariaDB·RAC 인증 상태·토폴로지·OS) · §16 문구 규칙 화면 전수 |

### 17.5 리스크 상위 5 (착수 시점)

1. **시험 환경**(Q9) — VM 없이는 R1·R2·R9·R10이 로컬 PC에 몰린다. 첫 주에 승인 요청.
2. **코어 모듈 경계**(D21) — P1a에서 BE 의존이 섞이면 P3b가 재작업이 된다. DoD에 "교체 가능 증명" 포함.
3. **RAC 실 환경 부재**(D20) — 단일 인스턴스 2개로 조인 로직만 검증. 실 RAC는 고객 PoC에서, 지원표 문구는 보수적으로.
4. **트래퍼 전송기 추출의 APM 회귀**(Q21) — P1b 머지 조건에 APM 회귀 테스트.
5. **Flyway 번호 충돌** — APM 작업이 V90대를 선점할 수 있다. 착수 직전 재확인, 번호는 PR 머지 순서로.

### 17.6 잔여 Q 결정 기한

| 기한 | Q |
|---|---|
| **P0 시작 전** | Q9(환경 — 실측보다 먼저; R9 버전별 환경·실 RAC 확보는 별도 기한 P2/P4 게이트)·Q20 선행분(R2·R4·R11 비교용 **시험 하드웨어 기준** — 최종 규모 프로필은 P4) |
| P0 중 | Q16(시험 전 후보표 → P0 종료 결과표; 실 RAC·J2 토폴로지·OS별 인증 기한 추가)·Q11(R7 뒤)·Q32(R11 뒤 — OS 전체 지원은 패키징·운영 검증으로)·Q2(R2 뒤 5s 확정) |
| **P1a 전** | Q1(엔진 순서 — 추천 A로 진행)·Q15(HA 목표)·Q17(그룹 스코프)·~~Q18~~(v2.5 종결)·**Q35(차원 텍스트 400일)**·**Q7(보안 프로필 기본값 — 사용자·client가 P1a부터 저장·노출)**·**Q8 전반(GA 기본 인증 방식·자격증명 schema; Wallet·통합 인증 확장 판단은 P2 전)**·**Q10(메뉴 노출 — 첫 화면·라우트에 사용)**·**Q30 전반(관측 분포 명명·품질·API 공통 계약; 클러스터 합산 세부는 P2 전)**·**Q19 전반(Top N 손실 표시 API 계약; 장기 압축 구현은 P1b 롤업 전)**·**Q33(기본 보관 방식·모델)**·**Q34(J2 원문 정책)** |
| P1b 전 | Q5(6.0 배달)·Q21(트래퍼 소유권)·Q19 후반(장기 압축) |
| P2 전 | Q4(ASH 프로필 — 기본 제외 유지)·Q8 후반(확장 인증)·Q28(XE·관리형)·Q30 후반(클러스터 합산) |
| **P3 전** | Q14(Zabbix 카운터 모드)·Q23·Q24·Q25 |
| P3b 전 | Q33 후속 UI 세부·Q32 OS별 결과 반영 |
| P4 전 | Q6(Kill — 제외 유지)·Q20 최종(규모별 하드웨어 프로필) |
| 결정 불필요 | Q31(비범위 저장소 — 고객 요구 시). Q4·Q6·Q31은 현 제외 상태 유지가 착수를 막지 않으며, 이후 결정으로 GA 범위에 조용히 편입하지 않도록 설계 개정 절차를 거친다 |


### 17.7 P0 진행 판정표 (v2.3, 2026-10-23 — §17.1 종료 기준의 현재 상태)

통과/미실시/조건부를 구별한다. **미실시는 통과가 아니다.** 환경은 `env_p0-test-db.md`(Q9 로컬 Docker 결정).

| R | 상태 | 근거 | 남은 것·게이트 |
|---|---|---|---|
| 0 환경(Q9) | **조건부** | 로컬 Docker `postgres:16`(16.15) 5436, 계정 2종(`pg_monitor` 유/무). dev PG(5434)와 분리 | MySQL·MariaDB·MSSQL 2022·Oracle XE는 어댑터 Phase 직전 추가. R9 2016/2019·실 RAC·시험 하드웨어 기준(Q20)은 VM 게이트 |
| R1 최소 권한 | **PG 통과** | `PgCapabilityCheckerLiveIT`(예상표 전체 단언): `moveseye_mon` S·L·C OK·Q RECOMMENDED(max 5000)·P UNSUPPORTED·필수 충족 / `moveseye_nomon` S·Q MISSING·L OK·C RECOMMENDED·P UNSUPPORTED·필수 미충족 / 실패 분류 AUTH·DATABASE_NOT_FOUND·NETWORK·TLS 실측 일치. `DBM_IT_PG_REQUIRED=true`면 환경 누락은 실패 | MySQL/MariaDB·MSSQL·Oracle 미실시. PG `EXPLAIN` 격리 fixture 미실시(P 미지원이라 P1a 비필수) |
| R3 마스킹 fixture | **조건부** | 4방언 71건(`SqlLiteralMaskerTest`) 리터럴 잔존 0·sentinel 누출 0·실패는 해시만. 검사 지점은 코어 안 | 200건 목표 미달(한글·잘린 SQL·바이너리·비정상 인코딩 보강) · "큐·로그·번들 원문 0" 검사 지점 목록은 큐·로그가 생기는 WS-2 이월분 뒤 |
| 2 공통 계약 시험본 | **초안 완료** | `contract_db-monitoring.md` §1(식별·시간·소유권·정책·수치 표 🧪)·§2(도구 EP 실측 응답)·§3(J2 수신 API 🧪)·§6(해소 체크리스트) | 코덱스 검수 뒤 R8·R11 입력으로 사용 |
| R2 부하 | 미실시 | — | 합성 부하 500·5,000 세션 — 개발 PC는 참고치, 기준 수치는 VM |
| R4 용량 | 미실시 | — | dev PG 별도 스키마, Flyway V90 DDL 초안 뒤 |
| R9 system_health | 미실시 | — | MSSQL 2022 Dev 컨테이너(P2 직전), 2016/2019는 VM 게이트 |
| R10 RAC 모의 | 미실시 | — | 독립 인스턴스 2개(P2) |
| R8 HA(J1) | **PG lease·writer 구현 완료(IT), RTO 실측 미실시** | `fencingOnTakeover`·`takeoverDuringCollectIsFencedAtWriter`·`transientRenewFailureKeepsSeq`: TTL 만료 뒤 인계·채집 중 인계·갱신 일시 실패 — 메모리 lease에서; **`DbmJ1PgStoreIT`(2026-10-26, 실 PG)**: 규칙 1~5(같은 run 재획득 연장·다른 run 거부·만료 뒤 인계 token/epoch+1·옛 lease 갱신/반납 무효)·writer fencing(STALE_LEASE·GENERATION_MISMATCH·TARGET_UNASSIGNED, 인계 뒤 옛 lease 배치 거부)·checkpoint 실패 시 배치 롤백(원자성)·멱등(DUPLICATE/IDEMPOTENCY_CONFLICT). RTO ≤30s 실측 아님 | 2노드 BE 실제 RTO 측정(레인 스케줄러·ConfigSource 뒤) |
| R11 원격 수집기 | **코어 경계·제어 규칙 통과**(로직), 나머지 미실시 | `CollectorRuntimeTest` 31건(계약 시험본 §4 표 — 단언하지 않는 것도 §4에 명시): 커밋 뒤 ACK 유실에도 이중 집계 0, 채집 중 인계는 writer 원자 검증에서 거부, FAST/SLOW 동시 tick 비블로킹, AUTH 정지·백오프, J1 재시작 baseline / J2(durableQueue) 이어 쓰기, 파일 checkpoint 손상 판정 — **Spring·PG·네트워크 없이 구동**, 코어는 **프로덕션 의존 0인 Gradle 모듈 `dbm-collector-core`**로 분리돼 경계를 빌드가 강제(모듈 테스트 128건, bootJar 포함 확인, 2026-10-26; 코덱스 8차 V8-1~V8-4 — 정규 직렬화·옛 설정 응답·kind별 허가 재확인·옛 자격증명 조회 — 반영·직접 단언). 이것은 인터페이스 교체·규칙 증명이며 RTO·큐·PG 트랜잭션 실측은 아님 | 디스크 큐·손실 메타·토큰 회전·패키징·시간 오차 주입·crash 시점별 — P3b 범위, 큐는 WS-2 이월 |
| R5·R6·R7 | 미실시 | — | R6 드라이버 법무는 P1b 전, R5 트래퍼는 P1b, R7 OTel은 P5 판단 |
| 8 결과 통합 | **DDL 2차 완료** | V90 `dbm_core`(표 7개) · V91 `dbm_retention` 시드 · **V92 `dbm_typed_tables`(2026-10-27, 차원 3 + 일 파티션 4, `dbm_sample_row` 제거, 빈 DB V1~V92 전량 적용 IT 확인)** | 5m/1h 롤업 표(WS-10)·알람·수집기 표(WS별)·지원표·공수 재확정 |

---

## 부록 B. 카운터(C) 카탈로그 — 가족·소스·주기 (v1.2, G16; 구현 계약은 P1a에서 열별 단위·버전·집계 확정)

| 엔진 | 가족 | 소스 | 주기 | 비고 |
|---|---|---|---|---|
| PG | 연결·세션(count·max·by state, 14+ sessions/killed/abandoned) · 트랜잭션(commit/rollback·idle-in-tx age) · 튜플(rows returned/fetched/inserted/updated/deleted) · 캐시(blks_hit/read·temp) · 데드락·conflicts | `pg_stat_database`·`pg_stat_activity` 집계 | 15s | DB별 태그 |
| PG | bgwriter/checkpointer(10) · WAL(bytes·fpi·sync_time, 14+) · archiver · io(16+ `pg_stat_io` reads/writes/evictions/fsync) · slru | `pg_stat_bgwriter`·`pg_stat_checkpointer`(17+)·`pg_stat_wal`·`pg_stat_archiver`·`pg_stat_io` | 15s | 버전 분기 |
| PG | 복제(primary: sent/write/flush/replay lag bytes·sec, slots: active·xmin age·spill, standby: wal_receiver·recovery) · 논리 구독 | `pg_stat_replication`·`pg_replication_slots`·`pg_stat_wal_receiver`·`pg_stat_subscription` | 15s | 역할별 |
| PG | 락(모드별 건수·대기) · 크기(DB size — 대형 OFF 옵션) · 설정 스냅샷 | `pg_locks`·`pg_database_size`·`pg_settings` | 10s·5m·10m | |
| PG(namespace) | relation(seq/idx scan·live/dead tup·vacuum age·size·bloat 추정) · 인덱스 사용 · 함수 | `pg_stat_user_tables/indexes`·`pg_statio_*`·`pg_stat_user_functions` | 1h | P1a 최소·P3 확장, 상한 300 |
| MySQL/MariaDB | 성능(queries·questions·slow·threads·connections·aborted·tmp tables·handler·select_*·sort_*) · 네트(bytes) · InnoDB(buffer pool·row lock time/waits·deadlocks·log·checkpoint age·pending IO) · 복제(seconds_behind·IO/SQL thread·GTID) · binlog · Galera(선택) | `SHOW GLOBAL STATUS`·`information_schema.INNODB_METRICS`·`SHOW REPLICA STATUS`·`SHOW ENGINE INNODB STATUS`(파싱 최소) | 15s | MariaDB 미지원 키 `unavailable` |
| MySQL(namespace) | 스키마/테이블 크기(무거움, OFF 기본) · 인덱스 통계(`innodb_index_stats`, 상한 1000) | `information_schema.TABLES`·`mysql.innodb_index_stats` | 1h | 추가 권한 |
| SQL Server | stats(batch req·compilations·connections·lock waits·deadlocks) · buffer(PLE·cache hit·lazy writes·checkpoint pages) · memory(target/total·grants pending) · wait stats(delta, 카테고리 매핑) · scheduler/task(runnable·pending IO) · tempdb 공간 · 파일 IO(stall·bytes) · DB 상태·크기·로그 사용률 · 백업 age(P3 msdb) | `dm_os_performance_counters`·`dm_os_wait_stats`·`dm_os_schedulers`·`dm_db_file_space_usage`·`dm_io_virtual_file_stats`·`sys.databases`·`dm_os_sys_memory` | 15s | 병렬 task 중복 금지 |
| SQL Server | AG(replica role·sync state·log send/redo queue·lag) · FCI(선택) · Agent Jobs(P3) · 인덱스 사용(P3) | `dm_hadr_*`·`dm_os_cluster_nodes`·msdb·`dm_db_index_usage_stats` | 15s / 5m | capability별 |
| Oracle | sysmetric(Average Active Sessions·DB Time/CPU per sec·Executions·User Calls·Logons·Hard Parse·Buffer/Library Cache Hit·Redo·Physical Reads/Writes·Network·Response Time) · sysstat 선택 · 세션/프로세스/리소스 한도 · OS(load·CPU util·memory) · 메모리(PGA/SGA) · 테이블스페이스 사용률 · PDB별 sysmetric(CDB) · DG lag · ASM diskgroup(_STAT) · RM CPU wait | `V$SYSMETRIC`·`V$SYSSTAT`·`V$RESOURCE_LIMIT`·`V$OSSTAT`·`V$PGASTAT`·`V$SGAINFO`·`V$PROCESS`·`DBA_TABLESPACE_USAGE_METRICS`·`V$CON_SYSMETRIC`·`V$DATAGUARD_STATS`·`V$ASM_DISKGROUP_STAT`·`V$RSRCMGRMETRIC` | 15s(테이블스페이스 10m) | 전부 §4 허용목록 안, 팩 객체 0 |
공통: 카운터 수를 목표로 늘리지 않는다. 각 열은 `(engine, name, source, version_min, unit, kind: counter|gauge, agg: delta|last|max)`를 가진 상수 카탈로그로 코드화하고 R4 용량에 반영한다.

---

## 부록 A. 참조한 저장소 사실 (2026-10-19 실측 · 코덱스 재확인)
- `Feature.java`: `GPU_MONITORING, DB_MONITORING, APM`; `Edition.PREMIUM` 셋 포함. `LicenseStatus`는 만료 상태에서 Feature 거부.
- FE: `routes.ts`·`routes.tsx`(`FeatureGate feature="DB_MONITORING"`)·`license.ts`·`SideNav`·`navSearchEntries`. 스텁 `pages/database-monitoring/DatabaseMonitoring.tsx`.
- BE: Flyway 최신 `V81__apm_custom_metric_rule.sql`. `premium/apm/` 16 패키지. `premium/dbm/` 없음.
- APM 수신: `ApmRegistrarServiceResolver` → `UNKNOWN_SERVICE` 폐기; `ApmOtlpLogSignalHandler`는 수집기 자기 로그·액티브 요청만 저장.
- APM DB 호출: `apm_db_query_group(service_id, fingerprint, db_system, query_norm)` — endpoint 없음(`ApmTraceRollupService`도 그 축만). 스팬 속성 허용목록엔 `server.address`·`server.port`·`db.namespace` 있음.
- 알람 브리지: `ZabbixAlertBridge.java` ≈1,700행, `ApmAlertKind`·규칙/binding Repository·cleanup·collector scope 결합.
- 자격증명: `SettingSecretCodec` AES-256-GCM `enc:v1:`; key ID·복수 키 없음.
- 스케줄러: `SchedulerJob{jobKey, run, requiresActiveLicense=true}`, `SchedulerManager` `interval_seconds` 처리·`canWrite()` 차단, `SchedulerLeaseService` 30분 TTL.
- 파티션: `ApmPartitionService`(허용 테이블 APM 고정)·`PartitionDropGuard` 존재 — 패턴 재사용.
- yaml `# K8S_RECEIVERS` 치환·FE `ApmGuideText` 존재.
- `device_classification` seed `database`(V13). JDBC 의존 `org.postgresql:postgresql`만.
- (v1.2) `LicenseClaims.MAX_HOSTS`는 자리만(프리미엄 설계 §7.1 M3 "1차 강제 안 함"), `LicenseStatusResponseDto`에 노출 없음 → `maxDbTargets`는 새 클레임(코덱스 확인).
