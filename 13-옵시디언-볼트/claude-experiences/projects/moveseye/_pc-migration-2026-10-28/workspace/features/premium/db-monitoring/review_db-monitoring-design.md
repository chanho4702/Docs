# 검수 요청: DB 모니터링 설계 v1 — 설계 문서 검수

- 요청일: 2026-10-19
- 요청자: Claude (SOLO-CLAUDE, COLLAB.md §8)
- 성격: **코드 없음 — 설계 문서 1편 + 근거 자료 2편의 검수.** 구현 0.
- 대상 파일
  - `_workspace/features/premium/db-monitoring/devdesign_db-monitoring.md` v1 — 수집 경로 결정·엔진별 소스/권한/라이선스·폴러 아키텍처·데이터 모델·알람·화면·Phase·미결 Q·코덱스 제안 대조(§14)
  - `_workspace/_archive/features/premium/db-monitoring/proposal_db-monitoring_codex.md` — 코덱스(gpt-6.1-sol/high) 독립 제안(검수 대상 아님, 대조 자료)
  - `_workspace/features/premium/db-monitoring/research_db-monitoring-2026-10-19.md` — 시장 조사 기록 3편(검수 대상 아님, 근거)
- 코덱스 검수 결과 파일: `review_db-monitoring-design_codex.md`(이 요청과 같은 디렉터리, `codex exec -s read-only -m gpt-6.1-sol high`)

## 범위 (무엇을 정했나)

1. **심층 데이터(세션·Top SQL·락·플랜)는 BE 내장 JDBC 폴러(에이전트리스)** 가 수집. DB 서버 설치 0. Zabbix는 호스트 OS 지표 상관·DB 호스트 발견·알람 배달만. OTel receiver는 P5 선택 프로필.
2. 엔진 GA 4종(Oracle·SQL Server·MySQL/MariaDB·PostgreSQL) + Tibero P5. Oracle은 V$만(Diagnostics Pack 객체 호출 금지).
3. 세션 샘플 기본 5초(1초 조건부), 카운터 15초, SQL 누적 60초, 락 10초, 플랜 on-demand.
4. 저장 `dbm_*` PG 파티션: 세션 raw 48h / 1m 30일 / 1h 180일. 50 인스턴스 ≈70~100GB.
5. 알람 = 우리 규칙 → outbox → 배달 어댑터(1차 Zabbix `history.push`, APM 브리지를 `premium/common/`으로 승격).
6. 과거 시점 재생·기간 비교·플랜 변경 감지·APM 상관을 범위에 포함. Kill·자동 조치·추천은 비범위.
7. Phase P0(실측)~P4(GA) 225~295 사람-일, P5 확장 95.

## 의도 (버린 대안)

- **OTel receiver를 1차로**(조사 에이전트 B의 추천) 버림: events 시그널이 development(속성 개명 이력), Oracle alpha, 국산 DB receiver 부재 → JDBC 경로가 어차피 필요하고 정규화 계층은 우리 것이 된다. 코덱스 독립 제안도 같은 결론.
- **Zabbix 공식 템플릿을 카운터 소스로**(프리미엄 설계 §5.9 전제·코덱스 제안) 버림: 폴러가 같은 접속으로 C도 받으면 이중 저장·두 소스 정합 문제가 없고 템플릿 미설치 고객도 동작.
- **1초 샘플 기본**(코덱스·MaxGauge) 버림: 50 인스턴스×활성 20에서 일 8,640만 행 — 설치형 PG 예산 초과. 5초 기본(WhaTap 일반과 동일) + 1초 조건부.
- agent2 `custom.query`(Zabbix JSON 아이템)·agent2 커스텀 Go 플러그인 버림: 문자열 아이템·배포 책임.
- 비밀번호 저장 방식 신설(코덱스) 버림: 기존 `SettingSecretCodec`(AES-256-GCM) 재사용.

## 중점 확인 요청 (스스로 불안한 지점)

1. 🔴 **`EXPIRED` 구간에 폴러를 계속 돌린다**(§9) — 프리미엄 설계 P17은 "만료 30일은 실시간 유지"지만 `SchedulerJob.requiresActiveLicense` 원칙은 "수집 소스로 나가는 배치는 만료되면 멈춘다"다. 두 원칙이 충돌하는지, 어느 쪽을 따라야 하는지.
2. 🔴 **카운터를 폴러가 수집**(Zabbix 템플릿 비사용) — 고객이 이미 Zabbix DB 템플릿을 운용 중이면 "같은 값이 두 곳" 또는 "우리 화면이 Zabbix 트리거와 다른 값"이 생길 수 있다. 이중 저장 회피가 맞는 선택인지.
3. 🔴 **용량 어림의 바이트 가정**(세션 raw 300B/행)은 미검증이다. APM 1m 실측은 686B/행이었다(인덱스 절반). 48h raw가 10GB가 아니라 25GB면 보존 기본값을 바꿔야 한다.
4. **`ZabbixAlertBridge` 승격 현실성** — APM 전용 의존(apm_alert_rule·service_uid 키·ApmSetting)이 얼마나 박혀 있는지 보지 않고 "일반화"라고 썼다.
5. **SQL 토크나이저 자체 구현**(§5.5) — 파서 없이 리터럴만 떼는 접근이 Oracle q-quote·PG dollar-quote·MSSQL 괄호 식별자·주석 중첩을 다 커버하는지. 실패 시 "해시만 저장"으로 안전하지만 Top SQL 텍스트가 비는 비율이 높으면 기능 가치가 떨어진다.
6. **다중 BE 노드 lease·페일오버 후 boot_epoch·수천 세션 인스턴스**를 §5에 한 줄씩만 적었다 — 빠진 설계가 있는지.
7. **Phase 어림** — P1에 어댑터 2종+FE 7메뉴 기본형이 과한지.

## 검증 현황

- 통과(실측·문서 확인): Zabbix 공식 DB 템플릿 7종 전부 집계치만(README 전수) · Zabbix Oracle 템플릿의 ASH 조회(YAML 원문) · OTel receiver events 존재와 안정성 등급(README) · Oracle Diagnostics Pack 범위(19c Licensing Information) · 저장소 사실(부록 A: Feature enum·FE 스텁·Flyway V81·APM 수신기의 UNKNOWN_SERVICE 폐기·SettingSecretCodec·SchedulerJob 계약).
- **검증 못 한 것**: 최소 권한 계정으로 타인 세션·SQL 조회 성립(R1) · 샘플링 부하(R2) · 정규화 fixture(R3) · 용량(R4) · 6.0 배달(R5) · ojdbc 재배포 조항(R6) · Tibero V$ 호환 · CUBRID JDBC 통로. 전부 P0 실측 항목으로 §11에 등재.
- 다른 세션·에이전트 커밋 없음(문서만, 미커밋).

## 검수 결과

코덱스 결과: `review_db-monitoring-design_codex.md`(gpt-6.1-sol/high, 2026-10-19). 🔴 11 · 🟡 4 · §14 공정성 7 · 빠진 질문 12 · Q 보정 11. **전건 v1.1에 반영.**

| # | 심각도 | 지적 | 반영 | 위치 |
|---|---|---|---|---|
| 1 | 🔴 | `EXPIRED` 폴러 지속이 `requiresActiveLicense`·`canWrite()`·`LicenseStatus` 원칙과 충돌 | [x] 만료부터 폴러 정지, 롤업·정리만 계속. 만료 후 조회·내보내기는 Q13(커널 개정 필요) | §5.1·§9·D10 |
| 2 | 🔴 | 엔진 정규화 텍스트 신뢰·플랜 predicate만 처리 → 마스킹 보증 깨짐 | [x] 저장 직전 방언별 검사 통일(실패=폐기), 플랜 구조 파싱(cost·rows 보존), 바인드 노출 소스 금지 목록, fixture 확대, 큐·로그·번들 동일 정책 | §5.5·D6 |
| 3 | 🔴 | endpoint·물리 노드·namespace·SQL native 식별 미분리, zbx_hostid 단일 컬럼 | [x] `dbm_target/endpoint/node/namespace` 4층, `dbm_query_native`↔`dimension` 다대일, `dbm_zbx_link(datasource,hostid,role)` | §6.1·D8 |
| 4 | 🔴 | lease·델타 복구 실패 계약 부재 | [x] DB 시간 원자 획득·fencing token·소유권 상실 쓰기 거부·`dbm_delta_checkpoint`·첫 관측=기준값+partial·seq 범위 `(target,kind)` UNIQUE | §5.2·§5.4 |
| 5 | 🔴 | `at=` 시차·파티션 키·인덱스 계약 부재 | [x] kind별 최대 시차·`observedAt/ageMs/batchId`·비원자 스냅샷 명시·`observed_at` 파티션 키(PK 포함)·인덱스 5종 | §8.3·§6.1 |
| 6 | 🔴 | 락 24h vs 세션 48h, 차원 TTL 역전, drill-down 문구 불일치 | [x] 락 48h 동일 창, 차원 ID 유지+텍스트 TTL 분리, 사용자 사전 180일, "대기→SQL→사용자"로 통일 | §6.1·§8.2·§8.3·D12 |
| 7 | 🔴 | 용량 70~100GB 과소(1h 롤업·batch·락·플랜 누락), 686B 상한 표현 | [x] 전 테이블군 재산정 ≈115~145GB, 예산 150~200GB+WAL 별도, 686B 상한 문구 삭제, 파티션 DROP 보존 흔들림 명시 | §6.2 |
| 8 | 🔴 | 디스크 예산 자동 단축이 장애 증거 삭제·롤업 미완 raw 삭제 위험 | [x] 정책 범위 내만·`min_guaranteed_days`·롤업 완료 가드·사건 구간 보호·파일시스템 잔여 병행·수집 제한 순서·감사·실제 조회 가능 기간 표시 | §6.3 |
| 9 | 🔴 | `ZabbixAlertBridge` 1,700행 APM 결합, `apm_db_query_group`에 endpoint 없음 | [x] 트래퍼 전송기만 추출(중립 DTO)+APM 회귀 별도 산정, `dbm_apm_endpoint_obs` APM 롤업 신설, 1차는 시간 상관으로 표기 | §7.2·§8.4·D9·Q21 |
| 10 | 🔴 | 세션 상한·coverage·AAS 왜곡 | [x] 품질 3축(time/row/text), 결정적 우선순위(blocker→대기→활성), total/stored 분리, AAS는 활성만, `__other__` 총량 보존 | §5.3·§5.7 |
| 11 | 🔴 | TLS·타임아웃·레인 분리·인증 실패·드라이버 업로드 통제 없음 | [x] 엔진별 TLS 검증 기본 ON, connect/socket/query 타임아웃·취소 실패 시 연결 폐기, fast/slow 2레인, `AUTH_FAILED` 분리·재시도 중단, 드라이버 허용 클래스·sha256·재시작 적용 | §5.1·§4.3·§7.1 |
| 12 | 🟡 | 1초 조건(세션 평균 50)이 불충분, "항상 놓친다" 문구 | [x] 전체 적재 예산(행/초·디스크·지연) 또는 30분 진단 프로필, 문구 "포착될 수도·누락될 수도" | §5.3·D4 |
| 13 | 🟡 | OTel 검증 없이 P5 확정 | [x] R7(PG receiver 비교) 신설, Q11은 R7 뒤 확정 | §3.5·§11 |
| 14 | 🟡 | "SchedulerJob은 분 단위"는 사실과 다름(`interval_seconds`) | [x] 근거를 대상별 주기·레인 격리로 정정, 폴러 상태·중지의 스케줄러 표 연결 명시 | §5.2 |
| 15 | 🟡 | 공수 낙관·P1 과적 | [x] P1a/P1b 분리, GA 270~355(불확실성 포함), 코덱스와 기능 포함 비교표 | §0.1·§12 |
| 16 | 공정성 | 카운터·원격형·OTel·Codec·6.0·공수 판정 과장 | [x] §14 전면 보정(원격형="GA 토폴로지 축소" Q12, Codec="키 운영 추가", 6.0="기능 차이") | §14 |
| 17 | B | 빠진 고객 질문 12 | [x] §5.8 운영 계약 신설(HA·큐 내구성·failover 식별·5,000세션·TZ·charset·알람 폭주·자격증명 수명·감사·열람 범위·Hang·백업/로그/파라미터 범위) | §5.8 |
| 18 | F | 빠진 Q 10 | [x] Q12~Q21 추가, Q1·3·5·7·8·9·10·11 추천 보정 | §13 |
| 19 | 🟢 | Oracle 팩 경계 — `DISPLAY_CURSOR`는 추가 grant·`DISPLAY_AWR` 금지·`V$TRANSACTION`·포괄 문구 삭제 | [x] 객체별 허용목록·금지 목록·자동 테스트, grant에 `V_$TRANSACTION` 추가 | §4·§4.1·D5 |

반영하지 않은 항목: 없음. 다음 = 사용자 Q1~Q21 확정 → v2 착수본 → P0.

---

# 검수 요청 2: 설계 v1.2 — Datadog DBM 대조 반영 델타 (2026-10-22)

- 성격: 문서만. 구현 0. 대상 `devdesign_db-monitoring.md` **v1.2**(v1.1 대비 델타) + `research_datadog-dbm-2026-10-22.md`(조사 기록, §4 격차 표·정정 이력).
- 선행: 코덱스 1차 협의 `_archive/…/consult_datadog-gap_codex.md`(gpt-6.1-sol/high) — G1~G38 판정·G39~G49 추가·사실 정정·Q22~Q30·공수. **그 판정은 전부 v1.2에 반영**(§15 반영표). 이번 2차는 "반영이 판정대로 됐나 + 반영하면서 새로 생긴 모순"만 본다.

## 범위(v1.2 델타)
D13(GA 플랜 = Oracle·MSSQL 캐시만) · D14(전용 객체 생성 없음 문구, 선택 패키지 철회) · D15(PG 서버 Q 1회 + namespace 선택·예산) · D16(`maxDbTargets`) · §4 엔진 표 전면 보강(client 구조·toplevel·MariaDB 표·MSSQL 프로시저/system_health/AG·Oracle 객체별 추가·RAC unresolved) · §4.4 플랜 지원표 · §4.5 namespace 순회 · §4.6 클러스터 membership · §5.3 샘플 의미 한계 · §5.4 extra 키·`__other__`·toplevel·quota·MSSQL user·포화 관측 · §5.5 토크나이저 부산물·G20 문구 · §5.8 3행 · §6.1 테이블 7개 · §6.2 +5~8GB · §7.1 규칙 3개 · §8 API/메뉴 · §9 상한 · §11 R9·R10·보강 · §12 WBS·공수 299~405 · §13 Q22~Q30·Q3·Q4 보정 · §15 반영표 · 부록 B.

## 중점 확인 요청
1. **D13과 §4 PG/MySQL P 열·§8.1 `/explain` 삭제·§4.4 지원표**가 서로 모순 없이 "GA 미지원"으로 일관되나. 화면(§8.2)에서 PG·MySQL 사용자가 보게 될 안내 문구가 과장 없이 쓰였나.
2. **D15·§4.5**: "서버 Q 1회"가 `pg_stat_statements` 확장 설치 DB 1개 접속으로 성립하는 조건(권한·`pg_read_all_stats`·다른 DB 텍스트 가시성)을 빠뜨리지 않았나. namespace 예산 숫자(10 DB·3s·10분당 20s·접속 1)가 §5.1 2레인·타임아웃 계약과 충돌하지 않나.
3. **§5.4 차원 quota 기본값**(dimension 20,000·native 50,000·plan 5,000·checkpoint 10,000)이 §6.2 용량과 §5.4 Top N 스캔 상한 500과 정합하나. `__overflow__`와 `__other__`의 의미 충돌은 없나.
4. **§6.1 `dbm_deadlock_event` UNIQUE 키**(`source_session, event_ts, content_hash`)가 ring_buffer 재읽기 중복 제거에 충분한가. `event_file` 경로는 어떤 권한·경로 접근이 필요한지(우리는 JDBC만 — 파일 읽기 함수 `sys.fn_xe_file_target_read_file`이 `VIEW SERVER STATE`로 되는지).
5. **§4.6 membership 근거**(PG system_identifier·MySQL Source_UUID·MSSQL group_id·Oracle DBID/DB_UNIQUE_NAME)가 각각 "같은 클러스터"를 뜻하는지, 오병합 가능 케이스.
6. **D16·§9**: 기존 키 누락=제한 없음 해석이 라이선스 커널 원칙(만료·Feature 거부)과 충돌하지 않나. 발급기 4파일 사본 규칙에서 `LicenseClaims`만 바뀌는 게 맞나.
7. **공수 299~405**가 §12 WBS 추가 항목(WS-23~25, R9·R10)과 산술적으로 맞나.
8. 부록 B 카탈로그에 §4.1 호출 금지 객체·팩 객체가 섞이지 않았나(Oracle 행).

## 검증 현황
- 통과: Datadog 문서 전수 열람(2026-10-22)·RAC 페이지·MariaDB 제약 페이지 원문 재확인·코덱스 1차 판정 전건 반영(§15).
- 검증 못 한 것: 전부 문서 — 권한·플랜·system_health·RAC 조인·namespace 예산은 P0 R1·R2·R9·R10 실측 항목.
- 다른 세션 커밋 없음(문서만, 미커밋).

## 검수 결과(2차)
코덱스(gpt-6.1-sol/high, 2026-10-22): `_archive/…/review_db-monitoring-v1.2_codex.md`. 판정 "v2 착수본 보류 — 🔴 잔존 9건(C1~C9), P0 실측 준비에는 사용 가능". **전건 반영(같은 날).**

| # | 심각도 | 지적 | 반영 | 위치 |
|---|---|---|---|---|
| C1 | 🔴 | §5.5에 `EXPLAIN 승인+예산` 잔존(D13과 충돌), R1 권한 시험이 운영 재계획으로 읽힘 | [x] GA 재계획 없음으로 통일, R1은 격리 P0 fixture·capability UNSUPPORTED | §5.5·§11 |
| C2 | 🔴 | G32 완료 표시했지만 §5.1에 레인별 노드 검증 없음 | [x] 모든 접속 노드 식별·배치 `node_id`·노드 불일치 조인 금지·읽기 분산 endpoint GA 미지원 | §5.1 |
| C3 | 🔴 | 불완전 TopN 점유율에 `≥` 표기 — 성립 안 함 | [x] NULL + `observedShare` 별도 명칭 | §5.4·§8.2 |
| C4 | 🔴 | quota가 참조 수명·델타 정확성과 안 연결 | [x] 참조 ID 보존·admission 제한·overflow는 native별 차분 뒤 합산·바이트 예산 256MB | §5.4·§6.1 |
| C5 | 🔴 | `toplevel`이 native/checkpoint 키에 없음 | [x] PG 키 `(dbid,userid,queryid,toplevel)` | §5.4·§6.1 |
| C6 | 🔴 | membership scope(AG·DB·채널)와 합산 범위 불일치 | [x] `dbm_cluster_member.scope_kind/ref`, metric별 scope·중복 제거 키·대표값 규칙, AG 밖 지표 제외 | §4.6·§6.1 |
| C7 | 🔴 | +5~8GB가 10×500 proc 매분 가정과 안 맞음(21.6GB) | [x] proc 저장 조건(Δcalls>0·Top 200/분)·object_stat 롤업·dimension 텍스트 상한 → 잠정 130~175GB, 운영 180~230GB 재검토 | §6.2 |
| C8 | 🔴 | 프로시저 통계에 캐시 수명 식별 없음 | [x] checkpoint 키에 `plan_handle,cached_time`, 캐시 변경 시 baseline | §5.4·§6.1 |
| C9 | 🔴 | `V$LOCKED_OBJECT` 객체명 약속 vs 닫힌 허용목록 | [x] 프로필별 허용목록(BASE/CDB/DG/ASM/RM/ACTUAL_PLAN/OBJECT_NAME=`DBA_OBJECTS`), 미허용 시 object ID만 | §4.1 |
| B2 | 🟡 | 서버 Q 1회 권한 조건(`pg_read_all_stats`·확장 DB ACL) | [x] R1 보강 | §11 |
| B4 | 🟡 | 데드락 중복 제거 키·`event_file` 서버 측 함수·offset은 버퍼 위치 | [x] `dbm_deadlock_event` 키·파일 checkpoint 규칙 | §6.1 |
| B6 | 🟡 | 상한 누락=무제한은 용량 판정에만, 상태·Feature 게이트 우회 금지 | [x] Q22 문구는 그대로, §9 D16 적용 범위는 커널 통과 뒤 | §9 |
| B7 | 🟡 | §12 P0 20~30 vs §0.1 22~34, 라이선스 WS 미추적 | [x] P0 22~34·R1~R10, WS-26 | §12 |
| 🟡 | 🟡 | 메뉴 Phase 노출/기능 구분 · 주석 전체 보존 삭제 · `scope_version`·50 cols 테이블당 · DEADLOCK capability 조건·통합 · §1.4 승인 항목 한정 · 사용자 문맥 분리 · capability 상태 UNSUPPORTED/RECOMMENDED · 조사 집계 정정(🔴11·🟡19·🟢8) · 조사 §1.3·§1.5·§2.1·§2.3 잔존 표현 | [x] 전건 | §8.2·§5.5·§4.5·§7.1·§1.4·§5.4·§4.2·조사 |

반영하지 않은 항목: 없음. 다음 = 사용자 Q1~Q30 확정(v2 필수: Q22·Q26·Q27·Q3/Q29·Q12·Q13) → v2 착수본 → P0 R1~R10.

---

# 검수 요청 3: 설계 v1.3 — §16 인사이트 카탈로그·운영 환경 계약 (2026-10-22)

- 성격: 문서만. 구현 0. 대상 `devdesign_db-monitoring.md` **v1.3**(v1.2 대비 델타 = §16 신설 + 머리 변경 이력·§0 포인터·§10 포인터·Q31). 조사 기록 변경 없음.
- 선행: 2차 검수 C1~C9 전건 반영(위 "검수 결과(2차)"). 이번 3차는 **§16이 본문(§3~§12)이 보증하는 범위를 넘어 약속하는 곳이 있는지**가 전부다. v1.2 본문 자체의 재검수는 요청하지 않는다(1차·2차에서 끝남).
- 배경: 사용자 질문 4건("Zabbix로 수집하는 것과 그 외 할 수 있는 것" / "고객 환경 종속성·OTel이 또 필요한가" / "Redis 같은 건 안 되나" / "이 설계가 어떤 인사이트를 주나")에 구두로 답한 내용을 설계 계약으로 고정했다. **새 결정·수치·Phase 변경은 없다**는 것이 작성자의 주장이며, 그 주장이 맞는지를 본다.

## 범위(v1.3 델타)
§16.1 인사이트 카탈로그 I1~I19(5묶음: 실시간·사후·평시·알람·데이터 신뢰; 열 = 질문·답·데이터·화면·엔진·Phase·명시 한계) · §16.2 수집 경로 역할 분담 표(Zabbix 템플릿/호스트 지표/발견·배달, J1, J2, O1, APM) · §16.3 고객 환경 종속성 매트릭스 13행 · §16.4 비범위 저장소(Redis·MongoDB·ClickHouse·범주 밖) 근거·재개 기준 · §16.5 보증하지 않는 것 10개 문구 규칙 · Q31.

## 중점 확인 요청
1. **I1~I19 각 행의 "데이터·화면·엔진·Phase" 열이 본문과 일치하나.** 특히 (a) Phase 열의 "PG 기준 + 엔진 어댑터 도착 Phase의 늦은 쪽" 규칙이 §12 WBS와 맞는지 (b) I8 "API·계약 P1a(WS-6) · UX P3(WS-16)" (c) I9 인시던트 목록 P1a vs §8.2 "잠금·트랜잭션 P3 노출(P1a는 상세 탭)" (d) I12 "추이는 4종, 플랜은 Oracle·MSSQL" (e) I15 지연 카운터 Phase (f) I17 Oracle "P3 범위 미정" — 본문 어디에도 Oracle 객체 통계 소스가 없는 게 사실인지.
2. **I10 데드락 건수 소스에 Oracle `enqueue deadlocks`(`V$SYSSTAT`)를 넣었다** — §7.1 `DEADLOCK` 규칙은 PG·InnoDB·MSSQL 카운터만 들고 있다. §7.1·부록 B에 Oracle 소스를 추가해야 하나, I10에서 빼야 하나. `V$SYSSTAT`는 §4 허용목록 안인지.
3. **§16.2 "DB 모니터링에 OTel은 필수가 아니다"** 문장이 §3.3(O1 유예는 R7 실측 뒤 확정, 🟡2)·§3.5와 충돌하지 않나. "필수 아님"과 "보조 경로 유예 미확정"을 한 문서에서 같이 말해도 되는지, 문구 제안.
4. **§16.3 종속성 매트릭스**에 본문에 없는 약속이 섞였나 — 예: "평문 접속 경고 표시", "관리형 DB 비밀번호+TLS 접속은 동일", "미인증 버전은 capability에 표시", "표준 프로필 기본값(가명화 OFF·원문 OFF)". 각각 본문 근거가 있는지, 없으면 Q로 보낼지 삭제할지.
5. **§16.4 Redis·MongoDB 근거의 사실성** — `SLOWLOG` 기본 128건 링, `system.profile` DB별·기본 OFF, Zabbix 공식 템플릿 이름(`Redis by Zabbix agent 2`, `MongoDB node/cluster by Zabbix agent 2`)이 C만 수집하는지. 틀린 것은 "미확인"으로 바꿀 문장 제안. Q31 추천("Redis 종결, MongoDB P5 후보 등록만")이 §10·§12 P5와 모순 없는지.
6. **§16.5 문구 규칙 10개**가 본문 조항(D13·D14·원칙 1·5·§5.3·§5.4·§5.8·§8.4·Q3/Q29·Q19·Q23·Q26)을 **그대로** 옮겼는지, 강화·완화된 곳이 있는지(예: 3번 "곧 지원이라 쓰지 않는다"는 본문에 없는 새 규칙인가).
7. **I3·I19의 PG 상태 표기**: `pg_stat_statements` 미설치는 `MISSING`(설정 누락), PG 플랜은 `UNSUPPORTED`(GA 정책) — §4.2 정의와 맞는지. I19 예시 문구 "미지원 — 확장 미설치(재시작 필요)"가 두 상태를 섞어 쓰진 않았는지(섞였으면 고칠 문장).
8. **빠진 인사이트**: 본문이 이미 보증하는데 §16.1에 없는 것(예: `LONG_TX` 장기 트랜잭션 목록, `CONN_PCT`, Zabbix 카운터 개요 모드, 증거 묶음 내보내기 `/evidence-bundle`, 리포트·위젯, 감사 `dbm_audit`)이 있으면 추가 행 제안. 반대로 본문에 없는데 §16에만 있는 것은 전부 지적.

## 검증 현황
- 통과: §16 각 행은 본문 절 번호·테이블명·WS 번호를 인용하며 작성(작성자 자체 대조). 삽입 직후 Phase 규칙·평문 차단·디스크 정책·프로필 기본값 4곳을 본문 기준으로 자체 수정.
- 검증 못 한 것: Redis·MongoDB·ClickHouse 사실은 작성자 기억 기반(원문 재확인 안 함 — 1차 협의 교훈 "요약 인용 금지"에 비추어 5번에서 확인 요청).
- 다른 세션 커밋 없음(문서만, 미커밋).

## 검수 결과(3차)
코덱스(gpt-6.1-sol/high, 2026-10-22, 첫 실행은 세션 종료로 중단 → 재실행): `_archive/…/review_db-monitoring-v1.3_codex.md`. 판정 "🔴 §16을 기준표로 확정하면 안 됨 — '재배열'이라 했지만 새 지원 약속·기본값·라이선스 제한·확장 우선순위·견적이 섞임. 주요 🔴 10건(R1~R10)". **전건 같은 날 반영.** I1·I2·I4·I6·I8·I13·I14·I15·I18 "일치"(권고 문구만 보강), I8·I9 Phase·I14 캐시 수명·I15 scope·I3 `observedShare`는 2차 반영 유지 확인.

| # | 심각도 | 지적 | 반영 | 위치 |
|---|---|---|---|---|
| R1 | 🔴 | I19 예시가 설정 누락(`MISSING`)을 "미지원"으로 써 §4.2와 충돌 | [x] PG Q `MISSING — 설정 누락…재시작 여부 확인` / PG P `UNSUPPORTED — GA 정책상 미지원` 두 문구로 분리, "capability 6상태를 모든 응답에" 약속 삭제(§8.1 `status·quality`와 §4.2 capability는 다른 계약) | I19·§16.5-9 |
| R2 | 🔴 | I10 Oracle `enqueue deadlocks` 건수 **제공 확정** — `V$SYSSTAT`는 허용목록 안이지만 §7.1·§5.8·부록 B에 채택 계약 없음. PG/MySQL 카운터까지 P2로 묶은 축소 | [x] Oracle은 "소스 후보, 채택 미확정(채택 시 §7.1·부록 B 보강 필요)". Phase 분리: PG 카운터 P1a·MySQL 카운터+공통 알람 P1b·MSSQL 카운터·그래프 P2 조건부 | I10 |
| R3 | 🔴 | I16 ③ 승인 태그 귀속에 `APM` Feature 조건 — §9는 APM 상관 **화면만** 두 Feature | [x] ③ 태그 수집·귀속 = `DB_MONITORING` 범위, APM 서비스 연결 화면만 두 Feature | I16 |
| R4 | 🔴 | §16.3 관리형 DB "비밀번호+TLS 동일" 포괄 보증·"IAM/토큰" 일괄 비범위·"Q16 열 추가" 새 산출물 | [x] "IAM 인증 비범위(§10). 서비스별 접속·권한·확장·기능 가용성은 별도 인증 전 미확정", 인증표 확장은 Q16 보강(신규)으로 표시 | §16.3 |
| R5 | 🔴 | "표준 프로필 가명화 OFF"는 새 기본값(Q7은 금융 ON 추천만) | [x] 삭제 → "원문은 opt-in 전 OFF(§5.5 도출), 가명화 기본값은 Q7 확정에 따름(표준 기본값 본문 미정)" | §16.3 |
| R6 | 🔴 | 도입부 "아래를 전부 사전 점검 결과로" — 보안정책·디스크·관리형 인증까지 자동 점검 약속 | [x] "자동 점검 가능한 접속·권한·엔진 설정은 결과로, 나머지는 준비 항목·지원표·운영 안내로" | §16.3 도입 |
| R7 | 🔴 | Redis "템플릿으로 종결", MongoDB "Tibero 다음·P5·조사 10일", C·Q 전용 어댑터·별도 레인, Q14 편입 — §10·§12에 없는 새 우선순위·견적·구현 방향 | [x] §16.4 전면 재작성: "비범위 유지, 확인된 사실 / 재개 기준은 **신규 미결 제안(Q31)**, 후보 순서·Phase·공수 미정, 기존 P5·공수 불포함". Redis `INFO`에 `commandstats·latencystats` 있음·slowlog 128은 7.4 설정 예제·Zabbix 템플릿은 slowlog **건수**·MongoDB 템플릿 2개 이름·`locks/globalLock`는 L 보증 아님·ClickHouse 미조사·"별도 기능으로" → "결정 안 함". Q31·변경 이력·§16 성격 문구도 "재배열 + 신규 제안 Q31 포함"으로 정정 | §16.4·Q31·머리 |
| R8 | 🔴 | §16.5-1 "미사용 인덱스 후보"는 Q23(관측 사용 통계만)보다 넓음 | [x] "관측 데이터(인덱스 사용 통계·scan 횟수·구간·리셋·누락)만, 미사용 판정·제거 후보 추천 없음" — I17도 동일 | §16.5·I17 |
| R9 | 🔴 | I7 "카운터 15s" — 부록 B의 tablespace 10m·PG 크기 5m·namespace 1h 예외 누락 | [x] "기본 15s, 크기·tablespace·namespace 통계는 부록 B 개별 주기" | I7 |
| R10 | 🔴 | I12 tracked SQL이 P1a로 읽힘(WS-17 P3) + "계획 바뀐 날 느려졌으면 통계·인덕스 쪽" 원인 보증 | [x] "일반 Q 추이 = 어댑터 도착, tracked SQL·플랜 변경·회귀 P3", "동시 발생을 보여주며 원인은 확정하지 않는다" | I12 |
| A | 🟡 | I3 단건 장기형 구분 보증·`toplevel` 조건 누락 / I5 범례 표시(UI 계약 없음)·원인 판정 / I8 "그대로" / I9 30일 이후 보증 / I11 reset 구간 분리 표시(UI 계약 없음) / I13 "관측된 시점" / I17 PG OID 해석·relation 집계 P1a 누락·Oracle "딕셔너리 뷰 없음" 과장 / Phase 공통 문구 | [x] 전건 — 공통 각주(관측된 것·마스킹·원인 미확정) 신설, Phase 문구를 코덱스 안으로 교체 | §16.1 |
| B3 | 🟢→문구 | "OTel 필수 아님"은 양립하나 보편 보증처럼 읽힘, APM 에이전트 비교는 미입증 | [x] "BE→DB 직접 접속·권한·설정이 갖춰진 J1 환경에서는 OTel Collector 추가 불필요. O1 지원 엔진·동등성·시기는 R7·Q11로" — APM 비교 삭제, R7 통과 엔진만 동등 프로필 명시 | §16.2 |
| B8 | 🟡 | 빠진 인사이트 9건 | [x] **I20~I28** 추가(장기 트랜잭션·연결 여유·Zabbix 카운터 모드·증거 묶음·리포트·감사·백업/Job·호스트별 Rows/Query·진단 프로필) — 전부 본문 근거·Phase 인용, 새 기능 없음 | §16.1 F |
| C-1 | 🟡 | §16.2 Zabbix 템플릿 "C만" 일반화·6.0 예외·J1 "전부" | [x] "기존 조사 대상 7종, 집계 중심 + 상태·설정·발견", `history.push` 7.0+·6.0 Q5, "엔진별 지원 범위" | §16.2 |
| C-2 | 🟡 | 네트워크 "→ J2 또는 O1" 즉시 우회처럼 / Oracle "팩 무관" / Q16 인증표 완성형 / jar 업로드=지원 / TLS 두 화면·Q7 차단 / 인증 P5 확정형 / "보존 자동 단축 아님"(§6.3보다 강함)·130~175GB / DB 설치 없음 | [x] 전건 완화(§5.1 TLS 기본 ON·다운그레이드 금지·disabled 배지만, §6.3 "동의한 정책 범위 안 자동 조정", 잠정 논리 합계·운영 180~230 별도) | §16.3 |
| C-4 | 🟡 | §16.5 도입 "그대로", 2번 편향·외삽, 4번 조건, 7번 영구 제한, 8번 절대 금지 | [x] 전건 완화. 3번 "곧 지원 금지"는 편집 지침(기능 변경 아님)으로 유지 | §16.5 |

반영하지 않은 항목: 없음. 작성자 주장 정정: "기존 GA 확정 범위·공수 합계 변경 없음. §16 = 기존 계약 재배열 + 비범위 저장소 신규 미결 제안 Q31. 별도 승인 없는 지원·기본값·일정·견적은 제품 계약으로 쓰지 않음". 다음 = 사용자 Q1~Q31 확정 → v2 착수본 → P0 R1~R10.

---

# 검수 요청 4: 설계 v2.0 착수본 — 사용자 확정 6건 반영 + 원격 수집기(J2) GA 편입 (2026-10-22)

- 성격: 문서만. 구현 0. 대상 `devdesign_db-monitoring.md` **v2.0**(v1.3 대비 델타). 조사 기록 변경 없음.
- 선행: 1차 협의·2차·3차 검수 전건 반영. 사용자가 **Q22·Q26·Q27·Q3(+Q29)·Q12·Q13을 "추천대로" 확정**하고 "v2 착수본"을 지시했다.
- 작성자 해석(검수 대상): Q12 추천은 "망분리 금융이 1차 타깃이면 GA 포함"이라는 **조건부**였다 → 그 전제(망분리 금융 1차 타깃)를 채택해 **J2를 GA(P3b)로 편입**했다. Q3 추천도 "금융 Oracle을 GA 대상으로 삼으면 RAC P2 필요"라는 조건부 → 같은 전제로 **RAC P2 포함**. Q13 추천은 "별도 결정 세션" → **GA는 현 커널 그대로**(만료 시 조회 차단)로 두고 허용 검토는 비차단.

## 범위(v2.0 델타)
머리(제목·상태·변경 이력 v2.0) · §0 **D17~D22** · §0.1 Phase(P3b 25~35·GA **324~440**·P5 70) · §3.3 J2 채택 · **§3.6 원격 실행형 수집기 설계(신설, 표 14행)** · §4.5 D19 확정 표기 · §6.1 `dbm_collector`·`dbm_collector_target`·`source=COLLECTOR` · §7.1 `LICENSE_LIMIT`·`COLLECTOR_DOWN` · §8.1 `/dbm/collectors` GA·`/dbm/license/usage`·`/dbm/ingest/v1/*` · §8.5 토폴로지·RAC 문구 · §9 D17·D22 확정 문단 · §11 R10 확정·**R11 신설** · §12 P3b WS-27·P5·공수 문단 · §13 확정 7건 ✅ 표기·**Q32·Q33 신설**·잔여 Q 목록 · §16.2 J2 행·§16.3 네트워크 행 · **§17 착수 계획(신설: P0 체크리스트·코드 골격·첫 스프린트·DoD·리스크 5·잔여 Q 기한)**.

## 중점 확인 요청
1. **D21 J2 설계(§3.6)가 기존 계약과 모순 없나** — 특히 (a) lease 소유자를 `collector_id`로 바꾸면 §5.2 fencing·§5.8 "BE 2대 중 1대 죽으면" 계약이 어떻게 되는지(J1 대상과 J2 대상의 인계 규칙 분리가 명시됐나) (b) 마스킹을 수집기에서 하고 BE가 재검사하면 §5.5 "적용 범위 전부 같은 정책"과 디스크 큐 원문 차단이 양쪽에서 성립하나 (c) 자격증명 "수집기 공개키 재암호화 전달"이 §5.6 키 운영(enc:v2·key ID·교체)과 충돌하지 않나 (d) `observed_at` 수집기 시각+보정과 §5.8 UTC·`db_clock_offset_ms` 계약의 축 분리가 맞나.
2. **공수 324~440**: J2 25~35는 코덱스 1차 어림(원격형 포함 GA 215~315)에서 가져왔다. 그 어림이 "코어 공유 전제"였는지, §17.2의 `collector/core` 경계·P1a DoD "교체 가능 증명"이 그 전제를 충족하는지. P1a 공수(58~76)에 경계 설계 비용이 들어 있나.
3. **D17 하향 갱신 "기존 활성 유지+신규 거부"**가 라이선스 커널 원칙(만료·Feature 거부는 즉시)과 다른 정책인데, 설계서 한 줄 예외(원칙 8)로 읽히지 않는지. `LICENSE_LIMIT` 알람·`/dbm/license/usage`가 발급기 4파일 사본 규칙에 영향 있나(`LicenseClaims`만 변경이 맞나).
4. **D20 RAC P2 포함**: 시험 환경이 "단일 인스턴스 2개"인데 P2 DoD(§17.4)에 RAC를 넣은 것이 "RAC 완전 지원 선언 금지"(D20·Q29)와 충돌하지 않나. 지원표 문구 제안.
5. **D22**: "GA는 현 커널 그대로"가 §9·D10·§16.3 라이선스 행과 일관하나. 수집기(J2)가 `LICENSE_EXPIRED`를 config pull로 받는 흐름이 §3.6에 빠진 곳 없나.
6. **§17 착수 계획**이 본문과 어긋난 곳 — P0 순서(R1~R11)·완료 기준 숫자(§11과 동일한지)·DoD의 "50 대상(J1 30 + J2 20)"·첫 스프린트가 §12 WS 번호와 맞는지·Flyway V90 재확인 절차. §17.6 잔여 Q 기한에 빠진 Q.
7. **§16(인사이트 카탈로그)에 v2 반영 누락** — J2 추가로 §16.3 "DB 서버 설치" 행·§16.2 표·I6(STALE에 `COLLECTOR_DOWN`)·§16.5가 바뀌어야 하는 곳.
8. **Q32·Q33 추천**(JDK 번들·BE 저장+재암호화)의 근거가 충분한가, 금융 고객 관점에서 Q33 기본값이 거꾸로여야 하지 않나.

## 검증 현황
- 통과: 사용자 확정 6건을 §13에 ✅로 표기, D17~D22에 확정 내용·근거 기록, 공수 산술(299~405 + 25~35 = 324~440) 확인, P5에서 원격형 제거(95~105 → 70).
- 검증 못 한 것: J2 설계는 **문서만**(코어 모듈 분리 가능성은 R11 실측 항목). "망분리 금융 1차 타깃" 전제는 사용자의 "추천대로"에서 작성자가 도출한 해석.
- 다른 세션 커밋 없음(문서만, 미커밋).

## 검수 결과(4차)
코덱스(gpt-6.1-sol/high, 2026-10-22): `_archive/…/review_db-monitoring-v2.0_codex.md`. 판정 "**P0 실측 출발 문서로는 조건부 사용 가능, P1a 구현 기준 승인은 보류** — 🔴 7건(V4-1~V4-7). 사용자 결정 큰 방향(D17~D22)은 타당하게 반영됐으나 J2 제어·보안·복구 계약과 §17 종료 기준이 닫히지 않음". **같은 날 v2.1로 전건 반영.** 작성자 해석 판정: D17·D18·D19·D22 수용, D20·D21 범위 채택은 수용하되 "망분리 금융 1차 타깃"은 **설계 선택과 고객 사실의 출처를 구별**해 기록(반영).

| # | 심각도 | 지적 | 반영 | 위치 |
|---|---|---|---|---|
| V4-1 | 🔴 | J2 소유권·lease 갱신·고립 시 정지·토큰 폐기·라이선스 거부의 **제어 계약 부재**(config pull 30s가 lease 30s/10s를 대신 못함, fencing은 적재 차단일 뿐 폴링 정지 보장 아님, 같은 `collector_id` 복제 프로세스 구별 없음) | [x] §3.6 "실행 모델·소유권"(J1 자동 인계 vs J2 수동 교체, `(owner_kind, owner_id, assignment_generation)`, `run_id`) · "lease API"(BE API가 PG 원자 처리, 실행 허가 `lease_until`, 갱신 실패·만료 시 신규 tick 중단, 고립 수집기는 허가 만료로 정지) · "설정 전파·허가"(`config_version`·`policy_version`·ACK·304는 허가 갱신 아님·구조화 거부 사유) · D22 J2 문구 · 🧪 시험 가정 표기 | §3.6·D22 |
| V4-2 | 🔴 | "원문 비전송" vs `keep_raw_sql` 충돌, "플랜 파싱은 BE"면 미보호 플랜 XML 전송 가능, 로그·진단 번들·수신 로그 검사 지점 미지정 | [x] §3.6 "전송 전 보호·원문": SQL·플랜·데드락 XML 민감 필드 제거 뒤에만 큐·전송, BE는 보호된 구조의 검증·저장·비교, 파싱 실패는 해시만, `policy_version` 실어 정책 변경 뒤 옛 배치 재검사/폐기, 로그·번들·수신 로그에 원문·바인드·자격증명·토큰 금지(R3 검사 지점). **Q34 신설**(J2 `keep_raw_sql` — 결정 전 비활성). §16.5-13 | §3.6·Q34·§16.5 |
| V4-3 | 🔴 | 수집기 키·자격증명 수명주기 미정(공개키 소유 증명·봉투 버전·대상 귀속·교체 ACK·폐기), Q33 기본값 근거 부족 | [x] §3.6 "자격증명·키 수명주기": 키 4종 구별, 봉투 형식 `env:v1:<collector_key_id>:<target_uid>:<credential_version>:`, BE 마스터 키 미배포, 교체 = 저장 성공→전달→적용 ACK→폐기 시점, 실패 시 이전 유지, 감사. Q33 추천을 "고객 확인 뒤 P1a 전 결정"으로 완화 | §3.6·Q33 |
| V4-4 | 🔴 | J2 `observed_at`(수집기 시각+보정) vs §5.8 "BE 수신 시각 기준" 충돌, RTT·보정 오차·유효기간·DB offset 기준 시계 불명 | [x] §3.6 "시간": `observed_at`=실제 채집 시각(UTC), `received_at` 구별, §5.8 문구는 J1 한정으로 정정, 원시 시각·보정값·보정 버전 보존·재전송 불변, RTT/2·표본 5 중앙값·유효 5분·±2s 밖 `clock_uncertain`, `db_clock_offset_ms` 기준 = 수집 주체 시계 | §3.6 |
| V4-5 | 🔴 | checkpoint·큐·ACK·epoch·멱등 키·늦은 배치 복구 계약 부재(전송 키 vs 저장 키의 epoch 유일 범위, 큐·checkpoint 원자성, ACK 후 삭제, 최종 포화, 백프레셔, 보존 창 밖 배치) | [x] §3.6 "멱등·ACK·checkpoint"(epoch는 BE가 소유권 부여 시 발급·대상 단위 전역 유일, 데이터+영수증 같은 트랜잭션, `IDEMPOTENCY_CONFLICT`, ACK 뒤 삭제, 로컬 durable checkpoint·fsync 단위) · "큐·복구·백프레셔"(포화 순서·손실 메타 세그먼트·카운터만 포화 시 정책·배치 크기/압축/동시성·지수 백오프·`EXPIRED_WINDOW`) · "늦은 데이터"(롤업 재계산, 과거 데이터로 알람 재개 금지) · `dbm_ingest_receipt`·`dbm_collector_job` 테이블 | §3.6 |
| V4-6 | 🔴 | §17 P0 종료 기준이 R1~R4+R11 패키징만 필수(R5~R10 미완료로 P1a 가능), R3 큐·로그·번들 원문 0 누락, R8·R11 정량 기준·R9 버전별·R11 공수 미배정, 순서가 직렬로 읽힘 | [x] §17.1 전면 재작성: 의존 관계 순서, R열 기준 = §11과 동일(R1 상태표 일치·R3 검사 지점·R2 락/우선순위·R4 WAL/APM/DROP·R5~R7 §11 항목·R8 RTO≤30s/이중 0/급증 0·R9 2016/2019/2022·R10 모의≠인증·R11 수치) · **P0 종료 = R1~R11 각각 판정표+차단 게이트, 미실시≠통과** · 공통 계약 시험본 고정 단계 추가 · §0.1/§12 P0에 R11 3~5(J2 증분에서) 명시 | §17.1·§0.1·§12 |
| V4-7 | 🔴 | 모의 RAC 시험·일부 엔진 J2 시험이 GA 인증으로 이어지는 게이트 부족 | [x] D20 "모의 시험≠RAC 인증, 지원표 미인증·PoC" · §17.4 P2 RAC 3단 분리(구현/모의/실 인증) · P3b 엔진별 J2 인증표(미시험 엔진 미인증) · P4 J2 30 대상 인증 workload·J1/J2 동등성 별도 · OS별 설치/업데이트/롤백 | D20·§17.4 |
| A | 🟡 | D16·D13·D15·§4·§4.4·§5.5·§5.8·§9·§10·§16.3·§16.5·WS-26에 확정 Q의 "미결·대기" 표현 잔존 · D21 WS-27 "P3" vs "P3b" · D21 "망분리 금융 1차 타깃" 단정 | [x] 전건 "→ D1x 확정"으로 정정, P3b 통일, "조건부 추천의 포함안을 채택, 고객 사실은 별도 확인" | 다수 |
| B2 | 🟡 | 25~35가 코덱스 1차 "독립 산출"처럼 읽힘, R11 추가에 P0 공수 불변 | [x] D21 "동일 코어 재사용 가정의 기존 계획상 증분, P0 종료 때 재확정", P0 "+R11 3~5(J2 증분 안)" | D21·§0.1·§12 |
| B3 | 🟢 | D17은 원칙 8 위반 아님. 보강: 값 의미(0·음수·누락)·교체-활성화 원자성·재활성화/J1↔J2 계산·회복·중복 억제·subject/Zabbix 키 | [x] D17 전부 추가(설치본 단위 `dbm.license_limit`, §7.2 키 규칙 예외 명시) | D17 |
| B7 | 🟡 | §16.3 "설치가 없다" · I6 J2 원인 · §16.5 J2 항목 | [x] §16.3 J1/J2 설치 문구, I6 `STALE` 원인·`COLLECTOR_DOWN` 묶음, §16.5 11~13 | §16 |
| B8 | 🟡 | Q32 ≈60MB·OS 3계열·JDK 17+는 검증 전, Q33 금융 전제 기본값 근거 부족 | [x] Q32 "재배포 조건 확인된 배포판·버전·OS/아키텍처별 R11 검증 뒤 확정", Q33 "고객 확인 뒤 P1a 전" | Q32·Q33 |
| D | 🟡 | §17.3 첫 스프린트 범위 불명·§17.4 P1b "8종/11종"·P1a DoD에 lease·baseline·quota·namespace·하향/동시 활성화 누락·P4 HA J1 한정·§17.6 기한(Q7·Q8·Q10·Q19·Q30·Q33 앞당김, Q14/23/24/25 "P3 전", Q20 선행분) | [x] §17.3 완료/이월 표, §17.4 전면 보강, §0.1 P1b "공통 규칙 11종", §17.6 재배정 | §17 |

반영하지 않은 항목: 없음. **다음**: ZM-172 워크트리에서 P0 코드 항목(R3 토크나이저·코어 경계 인터페이스·`maxDbTargets` 클레임·PG 접속/권한 검사 도구) 착수 → Q9 VM 확보 → R1~R11 판정표 → 공통 계약 확정(🧪 해소) → 코덱스 P0 종료 검수.

---

# 검수 요청 5: ZM-172 첫 코드 커밋 — 코드 검수 (2026-10-22)

- 성격: **코드**. BE `C:\worktrees\zm-172-be` 커밋 `38119b6`(ZM-172; 검수 시작 시점 해시 84ca94c를 `[FEAT]` 태그로 amend, 내용 동일) · 발급기 `C:\worktrees\zm-172-license` 커밋 `047f30c`(원래 62fdab3). FE 변경 없음.
- 범위: `premium/dbm/collector/core/{spi 6종, masking 토크나이저, jdbc 접속 분류, capability, adapter/pg}` · `premium/dbm/api`(`/dbm/targets/test-connection`·`/check-capabilities`) · `DbmCoreArchitectureTest` · 라이선스 `maxDbTargets`(BE 검증기·발급기 폼/CLI·양쪽 ContractTest) · `ErrorCode` DBM_* 4종.
- 중점: A 토크나이저가 리터럴을 새게 하는 입력(방언별 추적) · B fixture 보강 · C 코어 경계·spi 시그니처 vs §3.6 · D SQLSTATE 분류표·드라이버 속성 이름 · E PG 검사 SQL의 무권한 계정 안전성·PG17 · F 컨트롤러 규약·임시 관리자 게이트·비밀번호 String · G maxDbTargets 형식 오류 동작(java-jwt `asInt`) · H 패키지 규칙(`api/` 레이어 폴더).
- 검증 현황: 발급기 전체 테스트 통과 · BE `license.*`+`premium.dbm.*` 58건 통과 · BE 전체 2,230건 실패 0(Gradle 실행기 1g 힙 OOM으로 중단 — build.gradle에 기록된 기존 한계). 실 DB 접속 검사(R1)는 시험 환경 없어 미실행.

## 검수 결과(5차)
코덱스(gpt-6.1-sol/high, 2026-10-22): `_archive/…/review_zm172-code1_codex.md`. 판정 "**그대로 통과 불가** — 실제 SQL 리터럴 누출·PG 권한 오판정·TLS 기본값 위반·라이선스 형식 검증 우회. 작업 이력으로 남기는 건 가능, 후속 수집·저장의 기반으로 승인 불가. 🔴 17건·🟡 15건·🟢 3건". 코덱스는 소스를 메모리 실행·JDBC mock·pgjdbc 42.7.4·java-jwt 4.4.0 로컬 검사·공식 소스 대조로 재현했고, 기존 fixture 35개는 전부 일치했다. **🔴 전건 + 🟡 대부분을 같은 날 2차 커밋으로 반영.**

| # | 심각도 | 지적 | 반영 | 위치 |
|---|---|---|---|---|
| 1 | 🔴 | 유니코드 달러 태그(`$😀$…$😀$`·결합 문자) 안 문자열 누출 — `Character.isLetterOrDigit`가 PG lexer 범위(모든 비ASCII)보다 좁음 | [x] 달러 태그 전용 문자 규칙(`[A-Za-z_\u0080+][…0-9]*`) | `SqlLiteralMasker.dollar` |
| 2 | 🔴 | `0b101010`→`?b101010`, PG16 `1_234`·`0o777` 일부 잔존 | [x] `0x/0b/0o`+밑줄 끝까지 소비, 숫자 뒤 식별자 문자는 MySQL=식별자·그 외=`AMBIGUOUS_TOKEN` 폐기 | `number()` |
| 3 | 🔴 | PG `standard_conforming_strings=off`·MySQL `NO_BACKSLASH_ESCAPES`에서 누출 | [x] `Options(backslashEscapesInPlainStrings)` 도입(방언 기본값 + 어댑터가 실제 설정 전달), fixture 2건. 설정 못 읽은 대상은 텍스트 미저장(설계 §5.5 추가) | `Options` |
| 4 | 🔴 | 잘린 `q'`가 `StringIndexOutOfBounds` — FAILED 계약 위반 | [x] `qQuote()` 진입 경계 검사 | `qQuote()` |
| 5 | 🔴 | marginalia `[^,]*`가 값 뒤 일반 주석(`secret password=abcd`)까지 태그로 저장 | [x] 값 = `[^,\s'=]+`, 키 경계 lookbehind, 혼용 형식 둘 다 추출 | 정규식 |
| 6 | 🔴 | `WITH update AS (…) SELECT`를 UPDATE로, PG `BEGIN`을 PROCEDURE로 분류 | [x] 직전 의미 문자 `)`인 깊이 0 DML만 후보, `BEGIN/DECLARE/DO` 방언별 | `commandType()`·`SqlCommandType` |
| 7 | 🔴 | `pg_has_role(...)::text`는 `"true"`인데 `"t"` 비교 → 정상 계정도 S·Q MISSING | [x] `bool()`이 t/true/on/1 전부 인식, `::text` 제거 | `PgCapabilityChecker` |
| 8 | 🔴 | `MEMBER`는 NOINHERIT 계정도 참 — 실제 사용 가능 권한이 아님 | [x] `pg_has_role(…, 'USAGE')`, hidden count는 양성 증거로만 | 〃 |
| 9 | 🔴 | `SHOW track_activity_query_size`='1kB' → parseLong 0 → 권고 누락 | [x] `pg_settings.setting/unit` 읽고 단위(B·kB·8kB·MB…) 환산, 파싱 실패=-1 | `Setting.bytes()` |
| 10 | 🔴 | `track=none`·`compute_query_id=off`인데 Q OK | [x] 둘 다 MISSING + 활성화 안내 | 〃 |
| 11 | 🔴 | 확장 뷰 조회 실패를 전부 "권한 없음"으로 안내(55000 미로드 가림) | [x] SQLSTATE 42501/55000/42P01 분기, 그 외 ERROR | 〃 |
| 12 | 🔴 | TLS 기본 REQUIRE(검증 없음) — §5.1은 검증 ON | [x] 기본 `VERIFY_FULL`, REQUIRE·DISABLED는 명시적 선택 | `ConnectionSpec.DEFAULT_TLS` |
| 13 | 🔴 | DB 이름에 `?sslmode=disable&…` 주입 → pgjdbc가 URL 속성 우선 적용 | [x] host·database 허용 문자 정규식(생성 단계 거부) + URL 인코딩, 속성은 Properties만 | `ConnectionSpec`·`jdbcUrl` |
| 14 | 🔴 | 08004 SSL 거부→NETWORK, `SQLTimeoutException`→OTHER, 타임아웃 문구 ConnectException→NETWORK, nextException 인증→OTHER | [x] 원인 체인+nextException 전부 순회(순환·32 상한) 뒤 우선순위(AUTH>DB없음>TLS>TIMEOUT>불가>DRIVER>NETWORK) | `classify`·`chain` |
| 15 | 🔴 | java-jwt `asInt()`는 문자열·boolean·배열에 null(=무제한 통과), 1.5→1, 4294967296→0 | [x] `isMissing()`만 누락 허용, `isNull()`·비정수·범위 밖 전부 INVALID_CLAIM(`as(Object.class)` 타입 검사), 테스트 9형 | `LicenseKeyVerifier.parseMaxDbTargets` |
| 16 | 🔴 | 발급기가 공란·옵션 생략으로 상한 없는 신규 키 발급 — D17 "신규 명시 필수" 위반 | [x] `Request` compact 생성자: DB_MONITORING 보유 키(PREMIUM 기본·추가 기능)는 null 거부, 미보유 키는 값 버림. 웹 서버측 검증·CLI `--db-targets` 필수·대화형 재입력 루프 | 발급기 |
| 17 | 🔴 | `BatchWriter.Batch`에 node·원시 시각·보정·fencing·세대 메타 없음 | [x] `Meta` 레코드(nodeId·observed/raw·offset/version·uncertain·fencingToken·generation) + rows 불변 복사 + `maskingFailed` 품질 축 | `BatchWriter` |
| 18 | 🟡 | `123abc`·`t.123abc` 식별자 훼손 | [x] MySQL 숫자 시작 식별자·`.` 한정자 처리 | `number()` |
| 19 | 🟡 | 태그 키 경계·디코드 실패 원문 저장·형식 혼용 무시·서로게이트 절단 | [x] lookbehind·실패 폐기(`�` 포함)·혼용 둘 다·코드 포인트 상한 | 정규식·`put/decode` |
| 20 | 🟡 | ArchUnit blacklist 허점(Jackson·JUL·`startsWith` 오탐) | [x] allowlist(`java..`·`javax..`·core)로 전환 + 마스킹 외부 직접 호출 금지 규칙 | `DbmCoreArchitectureTest` |
| 21 | 🟡 | `Map<String,Object>` rows·가변성 | [△] 불변 복사·Javadoc에 "보호된 값만, typed row는 WS-2" — typed schema는 P1a WS-2 | `BatchWriter` |
| 22 | 🟡 | 큐 append와 checkpoint 전진의 원자성 미표현 | [△] Javadoc에 커밋 경계 규칙(J2 `DurableQueue.append(batch, checkpoint)`·J1 단일 트랜잭션) — 구현은 WS-2 | `CheckpointStore` |
| 23 | 🟡 | Denial+설정 공존 가능·generation 없음·clock 개별 호출 | [x] `Snapshot` 생성자 불변식·`assignmentGeneration`·`CollectorClock.capture()` 스냅샷 | `ConfigSource`·`CollectorClock` |
| 24 | 🟡 | preload 조회 실패가 Q ERROR·PG17 checkpointer·검사 안 한 뷰를 "가능"으로 | [x] `settingValueOrNull`·17+ `pg_stat_checkpointer`·문구 "수집 시 재확인" | `PgCapabilityChecker` |
| 25 | 🟡 | S·C·L 필수 정책이 설계에 명시 안 됨, 빈 items에 `requiredSatisfied()==true` | [x] 설계 §4.2에 "필수 S·C·L / 권고 Q·P" 명시, 빈 리포트는 false | 설계·`CapabilityReport` |
| 26·27 | 🟡 | 비밀번호 삭제 보장 과장·`toString`만으로 부족 | [x] Javadoc 정정(char[] zeroize만), `@JsonProperty(WRITE_ONLY)`·Swagger password·검증 실패 경로 wipe·운영 가이드 "요청 본문 로깅 금지" | `JdbcConnector`·`DbmConnectionRequest` |
| 28 | 🟡 | 미사용 `DBM_AUTH_FAILED/CONNECTION_FAILED`, "400/503이면 분기 불가" 오기 | [x] 두 enum 삭제, 응답 모델("도구 실행 완료+대상 실패"=success/ok=false) Javadoc·계약서 고정 예정 | `ErrorCode`·`DbmErrors` |
| 29 | 🟡 | 임시 admin 게이트 종료 조건 | [x] Javadoc "WS-1 권한 좌표 같은 변경에서 교체" — 코드는 그대로 | 컨트롤러 |
| 30·31 | 🟡 | `api/` 레이어 폴더·"engine-api 무수정" 문구 | [x] 설계 §17.2 문구 정정(무수정 범위=엔진 포트·계약, `common/exception` 공용 enum 예외), `api/`는 설계 골격상 예외로 유지 | 설계 |
| 32 | 🟡 | MSSQL VERIFY_CA≈FULL·Oracle TCPS 미구현 | [x] 주석 명시, 두 엔진 `available=false` 유지 | `JdbcConnector` |
| 33~35 | 🟢 | 컨트롤러 경계·payload 생성자·스냅샷 컬럼 없음은 결함 아님 | — | — |

반영 못 한 것(후속): #21 typed row schema·#22 durable 큐 커밋 경계 구현 → P1a WS-2. R3 "큐·로그·번들 원문 0"·메모리/파일 구현만의 코어 구동 증명은 아직 실행 경로가 없어 P1a DoD로 남는다(코덱스 종합 판정과 동일).

검증(2026-10-22 저녁): BE `license.*` 111건 + `premium.dbm.*` 87건(ArchUnit 2건 포함) 통과, 발급기 테스트 통과. 반영 중 생긴 회귀 1건을 테스트가 잡았다 — 식별자 소비를 `identifierRun()`으로 뽑으면서 첫 글자 무조건 전진이 빠져 `:id` 바인드에서 스캐너가 멈췄다(85분 무한 루프). 첫 글자 전진 복구 + 주 루프에 "전진 없음 → `AMBIGUOUS_TOKEN` 폐기" 가드 추가. 테스트 보호망 `RESIDUE`는 MySQL 숫자 시작 식별자(`123abc`·`1e`)를 통과시키고 `1e5`·`0x1F`는 계속 잡도록 조정. → 2차 커밋 BE `94c9115`·발급기 `16cfa81`.

---

# 검수 요청(6차) — WS-2 코어 폴러 프레임 + 공통 계약 시험본 (2026-10-23)

## 범위(미커밋 작업 트리, `94c9115` 위)
- 코어 `collector/core/runtime/`(`CollectorRuntime` 스레드 없는 `tick(Lane)`·`EngineAdapter`·`ConnectionProvider`·`Lane`·상태/리포트) · `collector/core/local/`(InMemory lease/writer/checkpoint·`FileCheckpointStore`·`StaticConfigSource`·`MapSecretResolver`·`ManualClock`) · `ConfigSource.TargetConfig.endpoint` 추가.
- 테스트: `CollectorRuntimeTest` 9건(P1a DoD 구동 증명 — 메모리/파일 구현만), `InMemoryLeaseClientTest`, `FileCheckpointStoreTest`, `PgCapabilityCheckerLiveIT`(실 PG 16.15 통과).
- 문서: `contract_db-monitoring.md`(P0 시험본 🧪) · `env_p0-test-db.md`(Q9 로컬 Docker 결정·R1-PG 실측) · 설계 v2.3 §17.7 P0 진행 판정표.

## 중점 확인 요청
A 런타임 정확성(lease 순서·seq 소비·checkpoint 조건·동시 레인·접속 수명·예외 경로·observedAt 시점) · B `InMemoryLeaseClient` ↔ §5.2 PG 문장 의미(같은 소유자 재획득 token 증가 여부, `runId` 부재) · C `FileCheckpointStore`(Windows 원자 교체·파일명 충돌·prefix 오탐) · D 계약 시험본의 설계·코드 불일치(§1.3 매핑·Denial 어휘·EXPIRED_WINDOW 수락·Jackson 직렬화에 끼는 메서드) · E LiveIT 단언 vs §4.2 표 · F 코어 경계(`local/` 위치) · G DoD 증명의 빈 시나리오.

## 검증 현황
BE `premium.dbm.*` 103건 통과(LiveIT 3건 포함, 환경변수 게이트). 코덱스 원문: `_archive/features/premium/db-monitoring/review_zm172-code2_codex.md`.

## 검수 결과(6차) — 판정 "커밋 보류", 🔴 18 · 🟡 17 · 🟢 12 → 전건 반영(2026-10-23)

| # | 심각도 | 지적(요약) | 반영 | 위치 |
|---|---|---|---|---|
| 1 | 🔴 | 배치 저장과 checkpoint 저장 분리 → 이중 집계 | [x] `BatchWriter.write(batch, checkpoint)` 한 커밋. 코어는 `CheckpointStore.save` 호출 안 함. 테스트 `ackLostAfterCommitDoesNotDoubleCount`(커밋 뒤 ACK 유실 → 서버 합 150 = 실제 150) | spi·`CollectorRuntime`·`InMemoryBatchWriter` |
| 2 | 🔴 | 재시작·인계 뒤 baseline 규칙이 §5.4와 다름 | [x] `CollectContext.continuity`(= 같은 `pollerRunId` 또는 `Options.resumeAcrossRuns`) — J1 기본 baseline/partial, J2 durableQueue만 이어 쓰기. 설계 §5.4 개정 | `EngineAdapter`·§5.4 |
| 3 | 🔴 | fast/slow 레인이 같은 잠금으로 서로 블로킹 | [x] 잠금은 lease 확보·seq 예약·결과 반영에만. 접속·SQL·writer는 잠금 밖. `lanesDoNotBlockEachOther`(실제 스레드) | `CollectorRuntime` |
| 4 | 🔴 | 만료 후 차단·인계와 쓰기의 원자성 미증명(`now` 고정·`currentToken` 반납 뒤 반환·token 조회↔저장 사이 인계) | [x] 쓰기 직전 lease 재검증(token·유효기간), `currentToken`은 유효 lease만, writer는 `commitIfHeld`(lease 서버 임계 구역) 안에서 저장. `takeoverDuringCollectIsFencedAtWriter` | `InMemoryLeaseClient`·`InMemoryBatchWriter` |
| 5 | 🔴 | AUTH 재시도 중단 없음·백오프 없음 | [x] AUTH → 대상 정지(자격증명 버전 변경·`resume`으로 해제), 그 외 접속 실패 5s→60s 지수 백오프 | `CollectorRuntime` |
| 6 | 🔴 | release 실패 시 상태 소실 → 같은 epoch seq 0 | [x] 반납 성공 뒤에만 상태 제거, 실패면 보존(`RELEASE_FAILED`)·재시도. `dropping` 플래그로 동시 재생성 차단 | `CollectorRuntime.drop` |
| 7 | 🔴 | "PG 문장과 같은 의미" 주장 거짓 | [x] **설계 §5.2를 고쳤다**(B 판정 채택: 규칙 7개, `lease_run_id`·`lease_epoch`, `<=` 만료, SET 증가+RETURNING). Javadoc 정정 | §5.2·`InMemoryLeaseClient` |
| 8 | 🔴 | REJECTED "계속"이 설계 중단 정책과 반대 | [x] `WriteResult.Reason` 구조화 — VERSION_MISMATCH·SCHEMA_INVALID 정지(`halt`), FEATURE/LICENSE/TOKEN 거부(`denial`), 사유 없음만 계속 | spi·런타임·계약 §1.3 |
| 9 | 🔴 | TOKEN·LICENSE를 배치 응답에서 배제한 계약 오류 | [x] 배치 응답 envelope 거부 정의, 런타임도 처리 | 계약 §1.3·§3 |
| 10 | 🔴 | IDEMPOTENCY_CONFLICT 누락·모든 CONFLICT를 fencing 취급 | [x] 사유 분리 — 소유권 CONFLICT는 lease 버림, IDEMPOTENCY는 그 대상 격리(수동 재개) | spi·런타임 |
| 11 | 🔴 | 같은 키·다른 payload도 DUPLICATE | [x] payload hash 보관, 다르면 IDEMPOTENCY_CONFLICT | `InMemoryBatchWriter` |
| 12 | 🔴 | 파일 checkpoint fsync 없음·원자 이동 미지원 시 조용한 저하 | [x] `FileChannel.force(true)` + 원자 교체, 미지원이면 예외 | `FileCheckpointStore` |
| 13 | 🔴 | 부분 파일이 정상으로 읽힘 | [x] `count`+CRC32 검증, 기준값 키 누락은 어댑터가 baseline(Javadoc 의무) | `FileCheckpointStore`·`EngineAdapter` |
| 14 | 🔴 | observedAt이 tick 시작 시각 | [x] kind마다 채집 시작 경계에서 capture, 어댑터 override 가능. `observedAtIsCollectBoundary` | 런타임·계약 §1.2 |
| 15 | 🔴 | 품질 record에 status·elapsed 없음 | [x] `BatchQuality.status(OK/PARTIAL/FAILED/SKIPPED)`·`elapsedMs`, 계약에 "P1a 부분 모델" 명시 | spi·계약 §1.4 |
| 16 | 🔴 | 관리 API 규약을 J2 API에 적용·jobs 채널 불일치 | [x] 계약 §0.1/§0.2 분리, jobs는 config 응답으로만, Job schema 추가 | 계약 |
| 17 | 🔴 | 큐 포화 최종 폐기 규칙 누락 | [x] 계약 §1.8 — 카운터·락만 남아도 포화하면 가장 오래된 카운터부터 + 손실 메타 | 계약 |
| 18 | 🔴 | EXPIRED_WINDOW 30일 고정 근거 불일치 | [x] 계약 §1.8·§6에 **미결**로 명시(kind·목적별 창, §3.6↔§6.1 충돌 해소 뒤 구현) | 계약 |
| 19~28 | 🟡 | lastError 분리·monotonic 시계·풀 이월 명시·close 주석·정책 스냅샷 전달·checkpoint native별(WS-3)·null 검증·파일명 충돌·load 상태·TickReport 집계 | [x] `lastCollectError`/`lastWriteError`, `CollectorClock.monotonicMs()`+`ManualClock.jumpWall`, `CollectContext.policy`, null Collected/quality 거부, 해시 파일명, `LoadState`, TickReport 10축(DUPLICATE는 실패 아님). 풀·native별 checkpoint는 이월로 명시 | 전반 |
| 29 | 🟡 | 시험표가 테스트보다 넓음·LONG_TTL 우회 | [x] LONG_TTL 제거(fast tick 갱신), 11개 시나리오 추가(20건), 계약 §4에 "증명 범위/실측 아닌 것" 명시 | `CollectorRuntimeTest` |
| 30·32 | 🟡 | LiveIT nomon 전체 단언 없음·spec wipe 누락 | [x] 예상표 전체 단언·`open()` helper wipe | `PgCapabilityCheckerLiveIT` |
| 31 | 🟡 | required 실행 모드 없음 | [x] `PgLiveEnvironmentGateTest`(`DBM_IT_PG_REQUIRED=true`면 환경 누락 = 실패) | 테스트 |
| 33 | 🟡 | 비밀번호 위치 설명 부정확·스크립트 발췌 | [x] 스크래치패드·Docker env·psql 범위 명시, 전체 절차 수록 | `env_p0-test-db.md` |
| 34·35 | 🟡 | 버전·🧪 표시·enum 소속·AUTH 문구·seq 범위 | [x] v2.3, [설계]/[구현]/🧪 3분류, `ConnectionTestResult.FailureKind`, 실제 `messageFor` 문구, seq "대상·epoch 전체" 통일(설계 §5.4 정정) | 계약·§5.4 |
| 36~47 | 🟢 | seq 소비·동시 레인 seq·ACK 집합·예외 경로·D22 큐 보존·EXPIRED 수락·Jackson 직렬화·allowlist·clear prefix·URL 인코딩·nomon L OK·전진 가드 | 유지 | — |

검증: BE `premium.dbm.*` **116건 통과**(런타임 20·lease 3·파일 2·LiveIT 3·게이트 1·마스커 71·커넥터 6·PG 검사기 8·ArchUnit 2). 7차 재검수 요청 → `review_zm172-code3_codex.md`.

## 검수 결과(7차, 재검수) — 판정 "커밋 보류" 유지, 6차 🔴 중 해소 6·부분 10·새 결함 2 / 새 지적 🔴 N1~N8 · 🟡 N9~N16 → 전건 반영(2026-10-23)

| # | 심각도 | 지적(요약) | 반영 | 위치 |
|---|---|---|---|---|
| N1 | 🔴 | 메모리 writer가 `seen`·`accepted` 변경 뒤 `checkpoints.save()` 실패 → 부분 커밋 | [x] checkpoint 저장을 **먼저**, 성공 뒤 publish(메모리 publish는 실패 불가). `checkpointSaveFailureRollsBackBatch`(합 150) | `InMemoryBatchWriter.commit` |
| N2 | 🔴 | `Objects.hash` 32비트로 payload 동일성(`"Aa"`/`"BB"` 충돌) | [x] 정규화 직렬화(rows 키 정렬·quality·policyVersion) SHA-256. `payloadDigestIsCollisionResistant` | `InMemoryBatchWriter.payloadDigest` |
| N3 | 🔴 | 갱신 실패로 `lease=null` 뒤 drop이 서버 lease를 반납 않고 상태 제거 → 같은 epoch seq 0 재사용 | [x] `ownership`(마지막 소유권 참조) 분리 — drop은 ownership을 반납, 실패면 상태 보존. `lostExecutionLeaseStillReleasesOwnership` | `CollectorRuntime.TargetState/drop` |
| N4 | 🔴 | writer 거부가 다음 tick에서 자동 해제 | [x] `denialFromWriter`+`denialConfigVersion` — 서버가 새 configVersion을 내리거나 `clearDenial()` 전까지 유지, 그 tick의 report도 denied. `writerDenialPersistsUntilNewConfigVersion` | 런타임·계약 §1.3 |
| N5 | 🔴 | AUTH 인지 뒤 정지 게시 전 다른 레인이 접속 | [x] 분류 즉시 잠금 안에서 `suspended` 게시 → 그 뒤 FAILED 배치. 접속 직전 재확인(정지·세대·lease) 추가 | `processTarget` |
| N6 | 🔴 | 정지 뒤 진행 중 tick이 새 대상 lease 생성 | [x] 실행 세대 `generation` — halt·denial마다 +1, tick 루프·prepare·접속 직전·쓰기에서 검사 | 런타임 |
| N7 | 🔴 | tick 시작 wall/mono를 모든 대상에 재사용 → 만료 lease로 폴링 | [x] 대상마다 `prepare`에서 현재 시각, 접속 직전 lease 유효성 재확인. `staleTickTimeIsNotReusedAcrossTargets` | `prepare` |
| N8 | 🔴 | 사유 없는 REJECTED "계속" | [x] `WriteResult` 생성자 불변식 — REJECTED·CONFLICT 사유 필수·status별 허용 집합. 계약 §1.3 행 "존재하지 않는다" | spi |
| N9 | 🟡 | observedAt override가 raw·offset과 불일치 | [x] override 제거(`Collected` 4필드), DB 보고 시각은 행 안에 | `EngineAdapter` |
| N10 | 🟡 | writer 연속 실패 백오프가 접속 성공으로 리셋 | [x] `connectFailures`/`writeFailures` 분리. `writerBackoffEscalatesIndependentlyOfConnect` | 런타임 |
| N11 | 🟡 | 초기 백오프 overflow·정지 중 만료 lease leased=true | [x] sentinel 검사, `leased = lease != null && validAt(now)`. `statusValuesAreSane` | `status()` |
| N12 | 🟡 | Policy의 Set 가변 | [x] compact 생성자 `Set.copyOf` | `ConfigSource.Policy` |
| N13 | 🟡 | 문서 REQUIRED 명령이 게이트 클래스를 제외 | [x] 명령을 `adapter.pg.*`로, 주의 문구 | `env_p0-test-db.md` |
| N14 | 🟡 | 반환 모델 불변식(FAILED+checkpoint·행 null 값·WriteResult 조합) | [x] `Collected` 생성자(FAILED/SKIPPED는 checkpoint 금지, 행 값 null은 NPE→COLLECT_FAILED), `WriteResult` 불변식 | spi·adapter |
| N15 | 🟡 | 늦은 옛 쓰기 결과가 새 lease를 덮음 | [x] 결과 반영 시 예약 당시 token과 현재 비교(`sameLease`) — 다르면 진단만 | `write` |
| N16 | 🟡 | halt 중 release 실패 재시도 없음 | [x] halt tick도 `releaseAll()`로 미반납 정리 | `tick` |
| 6차 잔여 | 🟡 | #3 secret 조회 잠금 안·#16 Job result schema·#17 LOCK 포화 fallback·#18 설계 §3.6 옛 문구·#22 closeFailures 미노출·#34 설계 상태 v2.2·AUTH 수동 재개 문구 | [x] `tryAutoResume` 잠금 밖, Job kind별 params/result 표, 락 fallback, §3.6 두 행 미결 표시, `TargetStatus.closeFailures`, 상태 문구 v2.3, AUTH 자동 재개 조건(버전 증가) | 런타임·계약·설계 |
| 6차 잔여(이월) | 🟡 | #12 디렉터리 fsync·crash 시험 · #21 풀 · #24 native별 checkpoint · #27 LoadState 소비자 · #29 미단언 시나리오 | [△] 계약 §4 "단언하지 않는 것"·§1.9 "지금은 모델만"으로 범위 명시. 구현은 WS-2 이월(풀·큐·상태 EP)·WS-3(native 키) | 계약 |

검증: BE `premium.dbm.*` **123건**(런타임 27). 같은 코드가 두 번 연속 반려(6차·7차)돼 **8차 재검수는 사용자 결정 뒤**에 돈다(검수 반복 멈춤 규칙).

---

# 검수 요청 8차 — 코어 Gradle 모듈 분리 + 7차 반영 재검수 (2026-10-26)

사용자 결정(10-26): "별도 패키지로 구성" → 코어를 Gradle 모듈로 분리하고, **상위 모델(`gpt-6-astra` high — 이 작업에 한해 사용자 지정)**로 검수·테스트 뒤 3차 커밋.

## 범위(미커밋 작업 트리, `94c9115` 위)
- **모듈 분리**(코드 로직 변경 없음): `premium.dbm.collector.core` 36 파일 + 테스트 9 → `moveseye-be-spring/dbm-collector-core/`(`git mv`, 패키지명 유지). `build.gradle.kts`(프로덕션 의존 0 · test만 JUnit·AssertJ·Mockito·ArchUnit·pgjdbc), `settings.gradle.kts` include, 루트 `build.gradle.kts` `implementation(project(":dbm-collector-core"))`, `Dockerfile` COPY 2줄, 모듈 `README.md`·`CLAUDE.md`, 루트 README/CLAUDE/AGENTS 모듈 표.
- **ArchUnit 이원화**: 모듈 `DbmCoreArchitectureTest` 3규칙(모듈 = 코어 패키지만 · allowlist `java..`·`javax..`·core · `Thread`/`Executors`/`ExecutorService`/`ScheduledExecutorService`/`ThreadPoolExecutor`/`ForkJoinPool`/`Timer` 의존 금지) / app `DbmCoreArchitectureTest` 2규칙(`premium.dbm` 밖→코어 `masking..` 금지 · `local..` 시험 구현 금지).
- 7차 N1~N16 반영분(코드)은 7차 표 그대로.

## 중점 확인 요청
1. N1~N16 반영 판정 — 특히 N1 "둘 다 아님" 두 경로 구분, N3 `ownership` 반납 경로 전수, N4 거부 유지의 수동 해제 루프, N5~N7 세대·시각·재검증 지점, N8 사유 집합 ↔ 계약 §1.3 1:1.
2. 모듈 분리 — main 그래프 오염(platform BOM이 test 한정인지), app ArchUnit의 import 범위, 스레드 규칙이 정당한 사용(`Thread.currentThread().interrupt()`)을 막는지, Dockerfile/bootJar/파이프라인, **패키지 접두 `com.dmove.moveseye.premium`이 J2 단독 jar에 남는 문제**(지금 바꿀지 P3b), P3b→P0 앞당긴 결정의 부작용(J1 PG 구현 위치 `premium.dbm.collector.j1`).
3. 새 결함은 "지금 코드에서 재현 가능한 것"만 🔴. 🔴마다 **이월 가능 여부** 표시(검수 반복 멈춤 규칙 — 이번에도 보류면 범위 축소 논의).

## 검증 현황
- 모듈 `:dbm-collector-core:test` **124건**(런타임 27·ArchUnit 3·LiveIT 실 PG 16.15 포함) 통과, app `premium.dbm.*` 2건 통과, `compileJava`·`compileTestJava`·`bootJar` 성공(`BOOT-INF/lib/dbm-collector-core-0.0.1.jar` 134KB 포함, app classes에 코어 0건).
- 실행: `codex exec --skip-git-repo-check -s read-only -m gpt-6-astra -c model_reasoning_effort='"high"' -c windows.sandbox='"unelevated"'`, 원문 `_archive/features/premium/db-monitoring/review_zm172-code4_codex.md`.

## 검수 결과(8차, gpt-6-astra high) — 판정 "커밋 보류"(모듈 분리는 타당, 런타임 🔴 4) → 전건 반영(2026-10-26)

원문 `_archive/features/premium/db-monitoring/review_zm172-code4_codex.md`. 7차 N1~N16은 해소 9·부분 6(N4·N5·N6·N7·N8·N15)·새 결함 1(N2). 모듈 분리 점검 13항목 전부 OK 또는 🟡(main 오염·패키징·의존 방향 결함 없음). 코덱스 권고는 "모듈 이동만 3차 커밋, runtime/local은 안정화 커밋 분리"였으나 🔴 4건이 모두 `local`·SPI 지연 훅만으로 재현·수정 가능해 같은 날 반영했다.

| # | 심각도 | 지적 | 반영 | 위치 |
|---|---|---|---|---|
| V8-1 | 🔴 | SHA-256 **이전 직렬화**가 충돌 — `1`과 `"1"`, `"a\u001fy=b"`와 `{x:a,y:b}`가 같은 입력 | [x] 모든 조각을 타입 태그+길이 접두로(`enc`), 행 수·키 수 접두. `payloadDigestPreservesTypesAndBoundaries` | `InMemoryBatchWriter.payloadDigest` |
| V8-2 | 🔴 | 느린 레인의 옛 config 응답(c1)이 다른 레인이 세운 writer 거부(c2)를 "버전 다름"으로 삭제 | [x] 설정 적용·거부 전이를 `control` 잠금 안에서 **실행 세대 검증 뒤**에만. setDenial/halt/clearDenial/clearHalt도 같은 잠금. `staleConfigSnapshotDoesNotClearNewerDenial`(실제 스레드) | `tick` |
| V8-3 | 🔴 | 접속 후·다음 kind 시작 전 실행 허가 미확인 — ACK 대기 중 만료·정지돼도 다음 SQL 시작 | [x] `permitted(st, p, gen, c)` 헬퍼를 접속 직전 + **kind마다 채집 시작 직전** 호출. `expiredLeaseDuringAckDoesNotStartNextKind`(skipped 1·fenced 0) | `processTarget` |
| V8-4 | 🔴 | 옛 자격증명 조회(v1)가 v2 재개·재실패 뒤 돌아와 `1 != 2`로 정지 해제 | [x] 조회 전 `suspendSeq`·실패 버전 캡처 → 같은 정지 + **버전 증가**일 때만 재개. 접속 시도한 최댓 버전(`credentialVersionSeen`)보다 옛 버전의 늦은 AUTH 실패는 정지 안 만듦. `resume()`도 세대 증가. `staleCredentialLookupDoesNotResumeNewerAuthFailure`(실제 스레드) | `tryAutoResume`·`processTarget` |
| V8-5 | 🟡 | `sameLease`가 CONFLICT 분기만 보호 — 옛 RETRY_LATER가 새 lease에 백오프, 옛 ACK가 실패 횟수 리셋 | [x] ACK 계열의 `writeFailures` 리셋·RETRY_LATER의 백오프·CONFLICT의 `lastWriteError`를 `sameLease`로 가드(통계는 유지). 결정적 재현 테스트는 없음 → 계약 §4 "단언하지 않는 것"에 명시, WS-2 | `write` |
| V8-6 | 🟡 | 모듈 ArchUnit이 `importPackages(core)`로 미리 걸러 "코어 밖 클래스 혼입"을 못 잡음 | [x] 코어 클래스의 code source 경로로 **main 출력 전체** import, `contain(CollectorRuntime)` 단언 | 모듈 `DbmCoreArchitectureTest` |
| V8-7 | 🟡 | 스레드 규칙이 "의존 금지"라 `Thread.currentThread().interrupt()`도 막고, 비동기 생성 API는 일부만 | [x] Thread 생성자 호출·`Executors.*`·`CompletableFuture.*Async`·실행기/타이머 타입 보유만 금지(interrupt 복원 허용). Javadoc의 "안 쓰는 의존도 막힘" 과장 삭제 | 같은 파일 |
| V8-8 | 🟡 | 계약·Javadoc이 코드와 어긋남 — CONFLICT `(없음)` 허용, EXPIRED 필수 표기, observedAt "어댑터가 주면 그 값", `acknowledged()`=둘 다 durable | [x] §1.2 observedAt(어댑터 덮기 불가), §1.3 CONFLICT 사유 필수·EXPIRED 선택·sameLease 조건, `BatchWriter.write` Javadoc 결과별 durable 의미, §4 미단언 목록 갱신, app `package-info` "P3b 물리 분리" → 모듈 완료 + `j1/` 자리 | 계약·spi·app |
| 문서 | 🟡 | 테스트 표시명 "어댑터가 더 정확한 시각을 주면 그 값"(N9 뒤 잔존) | [x] 수정 | `observedAtIsCollectBoundary` |
| 이월(코덱스 표) | — | J1 PG writer/lease(WS-2 — **✅ 2026-10-26 `collector.j1` PgLeaseClient·PgBatchWriter·PgCheckpointStore + V90, `DbmJ1PgStoreIT` 7건, 4차 커밋 `b0b3893`, 9차 검수 대상**) · 늦은 결과 전체 정책(WS-2) · config/credential 버전 증가 보장(WS-1·WS-2) · 상태 EP·경보·**CI 테스트 단계**(현재 파이프라인은 `bootJar -x test`만 — 분리로 생긴 회귀 아님) · typed rows·native checkpoint(WS-2·WS-3) · 큐 crash 원자성(P3b R11) · J2 패키징·패키지 접두(P3b, 지금 rename 근거 없음) | [△] 설계 §17.3·계약 §4·§6에 기재 | — |

검증(2026-10-26): 모듈 `:dbm-collector-core:test` **128건**(런타임 31·ArchUnit 3·LiveIT 실 PG 16.15) · app `premium.dbm.*` 2건 · `compileJava` 통과. 새 테스트 4건은 수정 전 코드에 대해 실행하지 않았다(수정 전 실패 여부는 코드 추적으로만 확인). **9차 재검수는 사용자 결정 뒤**(검수 반복 멈춤 규칙 — 6·7·8차 연속 보류). 커밋 구조는 사용자가 (A) 전체 3차 커밋을 선택 → BE 워크트리 `ed3b665`(58 files, +3738/-187, 미푸시). 코덱스가 (B)를 권한 근거(미해결 🔴)가 전건 반영으로 사라졌다는 판단.

---

# 검수 요청 9차 — J1 PG lease·writer·checkpoint + V90 + 보존 v2.5·V91 + **폴러 구동(6차)·PG 어댑터(7차)·typed 파티션 표 V92(8차)** (2026-10-26~28, **실행 2026-10-28 사용자 지시**)

6·7·8차 연속 보류라 검수 반복 멈춤 규칙에 따라 자동으로 돌리지 않는다. 범위가 **새 코드(J1 PG 구현)** 로 바뀌었으므로 사용자가 지시하면 이 절로 요청한다. 모델은 기본 `gpt-6.1-sol` high(8차 astra 지정은 모듈 분리 검수 한정).

## 범위(커밋 `b0b3893` + 5차 `3f1f1d5`(보존 v2.5) + 6차 `32c72f5`(WS-2 잔여) + **7차 `10cbb08`(PG 어댑터) + 8차 `6e255e3`(typed 표 V92)**, master `5d677e3` 위 8커밋 중 뒤 5개)
- `src/main/resources/db/migration/V90__dbm_core.sql` — 표 7개(`dbm_target`·`dbm_endpoint`·`dbm_credential`·`dbm_capability`·`dbm_sample_batch`·🧪`dbm_sample_row`·`dbm_delta_checkpoint`), 머리 주석에 lease 규칙·범위.
- `premium.dbm.collector.j1`: `PgLeaseClient`(획득·갱신·반납 UPDATE 한 문장, `FREE` 식을 WHERE·SET CASE가 공유), `PgBatchWriter`(REQUIRES_NEW, `FOR SHARE` 소유권 검증 → `ON CONFLICT DO NOTHING RETURNING` → digest 비교 → 행 jsonb → `PgCheckpointStore.save`), `PgCheckpointStore`(UPSERT, nativeKey null→'').
- 코어 `spi.BatchPayloadDigest`(InMemoryBatchWriter에서 이동), app `DbmCoreArchitectureTest`(`ProductionClasses.get()`, spi 구현은 j1 패키지 규칙).
- `DbmJ1PgStoreIT` 7건.
- **v2.5 보존(2026-10-27)**: `premium.common.partition.DailyPartitionService`·`PartitionDropGuard`(APM `ApmPartitionService`에서 추출 — APM은 표 목록·`ApmMetricPartitionGuard`만 남은 껍데기, 공개 API·`DropResult`·`TableRetention` 불변) · `premium.common.retention.RetentionOptions`(0 이하→기본값 WARN 1회)·`SchedulerOptionsReader`(60초 캐시·장애 폴백·`authoritative()`)·`RetentionStepRunner`(단계 격리·끝에 던짐) · APM `ApmRetentionDays.opt`·`ApmRetentionPolicy`·`ApmRetentionJob`이 공통으로 위임 · DBM `premium.dbm.retention.{DbmRetentionDays,DbmRetentionService,DbmRetentionJob}` + `V91__dbm_retention_job.sql` · ArchUnit: `DbmCoreArchitectureTest`(+2: dbm↛apm·common↛기능), `ApmArchiveGateArchTest`(DROP 문자열 위치를 `DailyPartitionService.java`로, 공통 `dropExpired` 호출처 = 껍데기만).
- 설계 `devdesign_db-monitoring.md` v2.5: §6.1 보존 계단(원본 2일·1m 7일·5m 30일·1h 400일·사건·차원 400일, min/max/sample_count)·§6.2 재산정·**§6.3 디스크 예산 정책 삭제 → 보존·정리 메커니즘**·D23·Q18 종결·Q35.
- **WS-2 잔여 — J1 구동 조립(2026-10-27, 6차)**: `premium.dbm.collector.DbmPollerManager`(`SmartLifecycle`, fast/slow 레인 `ScheduledExecutorService` 각 1 — `scheduleWithFixedDelay`, 레인별 `ReentrantLock.tryLock`으로 수동 tick과 겹침 차단, stop → `runtime.shutdown()` lease 반납, 거부/halt 전이 로그, 예외 60s 1회) · `DbmPollerProperties`(`app.dbm.poller.*`) · `DbmPollerStatus` · `collector.j1.PgConfigSource`(BE 대상 + lateral 접속점 1개, 30s 캐시, `configVersion`=행 SHA-256 16자, 라이선스 매 호출 → `LICENSE_EXPIRED`/`FEATURE_DENIED` 거부 스냅샷, 조회 실패 시 이전 스냅샷 유지, 정책=프로퍼티 해시) · `collector.j1.CodecSecretResolver`(캐시 없음, 복호화 실패 null+WARN 버전마다 1회) · `api.DbmPollerController`(`GET /dbm/poller/status`, 관리자)·`DbmPollerStatusResponse` · `application.yml`/`application-it.yml`(`auto-run=false`) · ArchUnit +1(`CollectorRuntime` 조립은 `DbmPollerManager`만) · IT 12건(`DbmPollerManagerIT` 5·`PgConfigSourceIT` 4·`CodecSecretResolverIT` 3).

- **7차 PG 어댑터(코어 모듈 `adapter/pg/`, 2026-10-27)**: `PgServerInfo`·`PgSqlText`(텍스트 보호 한 지점)·`DeltaWindow`·`PgSessionCollector`·`PgLockCollector`·`PgCounterCollector`·`PgQueryStatCollector`(버전 분기 12/13/14/17, Top N·`__other__`·checkpoint 키 `dbid:userid:queryid:t|f|<약어>`)·`PgEngineAdapter`, app `DbmAdapterConfig`. 테스트 `DeltaWindowTest`·`PgCollectorSqlTest`·`PgEngineAdapterLiveIT`(실 PG16)·`DbmPollerManagerIT.realTargetCollects`(end-to-end).
- **8차 typed 파티션 표(2026-10-27)**: `V92__dbm_typed_tables.sql`(차원 3·사실 4, 사실 표 FK 없음, `dbm_sample_row` 제거, `dbm_retention` 옵션 키 4개 병합)·`store.DbmPartitionService`·`j1.PgTypedRowStore`(행 키→열 매핑 한 지점, 차원 UPSERT `unnest`)·`PgBatchWriter`(파티션 보장 tx 밖→typed 저장 tx 안)·`DbmRetentionDays/Service/Job`(6단계). 테스트 `PgTypedRowStoreIT`·`DbmRetentionJobIT`·`DbmJ1PgStoreIT`·`DbmRetentionDaysTest`.
- 중점 E(어댑터 E1~E6)·F(typed F1~F9)·G(횡단 G1~G4)는 프롬프트 원문(`_archive/.../review_zm172-code5_codex.md` 머리 + 스크래치 `codex_prompt_zm172_code5.md`)에 있다.
## 중점 확인 요청
1. **lease UPDATE 한 문장의 정확성** — 규칙 1(비어 있음·같은 run 복귀 포함 token/epoch +1)·2(유효+같은 run은 연장만)·3(다른 run 거부)·4(갱신 불변)·5(반납 일치 시만)가 `WHERE`/`SET CASE`/`RETURNING` 조합에서 전부 성립하는지. `now()`가 문장 안에서 단일 값인지, `lease_until <= now()` 경계(반납 직후 같은 ms 재획득), `owner_kind='BE'` 조건의 위치.
2. **writer 원자 경계** — `FOR SHARE`가 인계 UPDATE(acquire)를 커밋까지 막는지(acquire는 행 UPDATE → `FOR SHARE`와 충돌하는가), READ COMMITTED에서 `ON CONFLICT DO NOTHING` + 후속 digest SELECT가 동시 삽입(다른 레인·다른 노드) 모든 순서에서 DUPLICATE/IDEMPOTENCY_CONFLICT를 올바르게 내는지, `setRollbackOnly` 뒤 반환값이 `TransactionTemplate.execute`에서 예외 없이 나오는지, checkpoint UPSERT가 다른 kind·같은 대상의 동시 쓰기와 교착하지 않는지(잠금 순서: dbm_target FOR SHARE → batch INSERT → row → checkpoint, 전 writer 동일).
3. **계약 §1.3 매핑 누락** — 토큰 숫자 아님·대상 없음·`owner_kind` COLLECTOR 등을 `STALE_LEASE`/`TARGET_UNASSIGNED`/`GENERATION_MISMATCH` 중 어디로 보내는 게 런타임 행동(lease 버림 vs 격리)과 맞는지. `EXPIRED_WINDOW`·`REJECTED`를 writer가 내지 않는 결정의 공백.
4. **스키마** — timestamptz 선택(기존 표는 timestamp 다수), `dbm_sample_batch` 보존 정리 부재(WS-10 전까지 무한 증가), `dbm_sample_row` 임시 표가 설계 §6.1에 없는 것(🧪 표기로 충분한가), FK CASCADE(대상 삭제 시 배치·checkpoint 일괄 삭제)의 적절성, CHECK 제약 누락(engine·tls_mode는 코드 enum에 위임).
5. **IT 공백** — 동시성(두 스레드 같은 키 INSERT·acquire 경합)은 단언하지 않았다. 실제 2노드 RTO 실측 아님. `ttlIsHonoured`가 `Thread.sleep` 기반(불안정 가능성).
6. **APM 회귀(v2.5 추출)** — `ApmPartitionService` 껍데기가 원본과 **같은 JDBC 호출·같은 DDL 문자열·같은 로그**를 내는지(`ApmPartitionDropGuardTest`가 바이트 비교하지만 메트릭 게이트 경로 `ensurePartition`의 트랜잭션 경계가 바뀌지 않았는지 — 원본은 `dropTx` 하나를 게이트 경로와 판정 DROP이 공유했고, 지금은 `setTransactionManager` 한 세터가 공통 구현체와 `guardTx`에 같은 관리자를 넣는다). `ApmRetentionPolicy`가 `SchedulerOptionsReader` 위에서 `configured`·캐시·`authoritativeDays` 예외 의미를 유지하는지. `ApmRetentionJob`의 요약 문자열·예외 메시지 형식이 `RetentionStepRunner`에서 한 글자도 바뀌지 않았는지(스케줄러 실행 이력 화면이 읽는다).
7. **DBM 보존 설계 판단** — 디스크 예산·최소 보장·자동 완화·사건 보호를 전부 빼고 "일수 정책 + 설치 가이드 + 공용 디스크 가드 백로그"로 간 결정의 공백(우리 PG가 차면 MovesEye 전체가 선다 — 이것을 백로그로 둔 게 맞나). `dbm_delta_checkpoint` 30일 삭제가 되돌아온 대상의 첫 델타를 한 번 건너뛰게 하는 것의 적절성. `deleteExpiredSampleBatches`의 `limit` 서브쿼리 DELETE가 CASCADE row 삭제와 함께 5,000건 묶음에서 잠금·시간이 감당되는지(50대상 5초면 하루 86만 배치·수천만 행).
8. **J1 구동 조립(6차)** — ① `PgConfigSource`가 라이선스를 매 호출 보고 대상은 30s 캐시하는 두 겹 구조에서, 거부→재허용 전이 중 코어의 `denialFromWriter`/`denialConfigVersion`(N4) 로직과 어긋나는 경로가 있는지(설정 출처 거부는 `configVersion`을 유지한 채 돌려준다). ② 조회 실패 시 이전 스냅샷 유지가 "대상이 진짜 삭제된 뒤 우리 PG가 순단"인 경우 lease를 늦게 반납하는 것의 허용 범위. ③ `DbmPollerManager.stop()`이 `shutdownNow` → `awaitTermination 5s` → `runtime.shutdown()` 순서인데, tick 도중 interrupt된 레인 스레드가 writer 트랜잭션 안이면 `REQUIRES_NEW` 롤백 뒤 lease 반납이 그 대상의 `ownership` 참조로 되는지(코어 N3). ④ `scheduleWithFixedDelay` 단일 스레드 + `tryLock` 조합에서 수동 `tick()`(운영 EP 예정)이 스케줄 tick을 영구히 굶길 수 있는지. ⑤ `CodecSecretResolver`가 평문 `String`을 거치는 것(Codec API 한계)을 지금 받아들일지, Codec에 `char[]` 경로를 더할지. ⑥ `assignmentGeneration=0` 스냅샷이 J2 계약 §1.6 의미와 충돌하는지(J1은 대상별 세대를 lease가 검증). ⑦ 어댑터 없음 → 5s마다 FAILED 배치(행 0)가 WS-3 전 설치본에서 쌓이는 것을 코어 설계(§5.8)대로 두는 게 맞나, 어댑터 없는 엔진의 대상은 `ConfigSource`가 걸러야 하나.
9. 새 결함은 "지금 코드에서 재현 가능한 것"만 🔴. 🔴마다 이월 가능 여부 표시.

## 검증 현황
- 코어 `:dbm-collector-core:test` 128건(LiveIT 실 PG 16.15 포함) · app `:test --tests 'com.dmove.moveseye.premium.dbm.*'` **42건**(ArchUnit 6 + J1 IT 7 + 보존 IT 4 + 단위 3 + **WS-2 잔여 IT 12**(폴러 관리자 5·ConfigSource 4·SecretResolver 3), 도커 5433 `moveseye_it` V1~**V91** 전량 Flyway, 2026-10-27 42/42 통과 + `LicenseArchitectureTest` 10) · APM 회귀 `premium.apm.core.batch.*` + `LicenseArchitectureTest` 포함 **141건 통과**(2026-10-27) · `premium.apm.*` 전체 **3,009건 중 1건 실패**(`ApmStuckRequestLedgerIT` "idle in transaction 0" 시간 단언 — 12분 전체 실행 부하에서만, **단독 재실행 통과**, 파티션·보존 코드와 무관·마지막 변경 ZM-122 10-21) → 추출 회귀 아님으로 판정 · `compileJava`·`compileTestJava` 성공.
- **실행(2026-10-28)**: `cd /c/worktrees/zm-172-be && codex exec --skip-git-repo-check -s read-only -m gpt-6.1-sol -c model_reasoning_effort='"high"' -c windows.sandbox='"unelevated"' --add-dir C:\solutions\_workspace -o _archive/features/premium/db-monitoring/review_zm172-code5_codex.md - < codex_prompt_zm172_code5.md` — 8커밋(HEAD `6e255e3`) 대상. 코덱스가 읽은 XML: DBM 40 + 아카이브 게이트 7 + 라이선스 10 + 코어 140(요청서의 46은 세션 중 묶음 실행 수와 XML 보존 수의 차이 — Gradle이 test마다 XML을 지운다).

## 검수 결과(9차, gpt-6.1-sol high, 2026-10-28) — 판정 "WS-1 커밋에 앞서 수정 필요 🔴 9(N1~N9)", 🟡 7(N10~N16) · 원문 `_archive/features/premium/db-monitoring/review_zm172-code5_codex.md`

이번은 커밋된 코드 검수라 "커밋 보류"가 아니라 **"WS-1 전 수정 🔴 / WS-1·WS-10과 함께 🟡 / 참고"** 로 냈다. 큰 구조(PG lease → 보호된 어댑터 출력 → 배치·typed 행·checkpoint 동일 커밋)는 타당, APM 공통 추출 회귀 없음(로거 이름·예외 cause 계층은 바뀜 — "바이트 동일"은 과장이라 정정). **6·7·8·9차 연속 보류 — 검수 반복 멈춤 규칙에 따라 N1~N9 반영은 사용자 결정 뒤.** 아래 "내 판단" 열은 Claude의 자체 재확인(2026-10-28).

| # | 🔴 지적(코덱스) | 내 판단 | 비용 |
|---|---|---|---|
| N1 | lease·writer가 `now()`(문장 시작 시각)로 만료를 판정 — 행 잠금을 TTL 넘게 기다린 뒤에도 옛 시각으로 통과 | **맞지만 발생 조건이 병리적**(writer가 `FOR SHARE`를 30s 이상 쥔 상태). `clock_timestamp()` 치환만으로는 잠금 선행이 보장되지 않는다는 코덱스 지적도 맞다 → 잠금 뒤 재판정 CTE 설계 필요. **이월 권고(계약에 전제 명시)** | 중 |
| N2 | `stop()` 뒤 진행 중 tick이 새 대상 처리를 시작할 수 있다 — `runtime.shutdown()`은 `releaseAll()`만, 세대(`generation`)를 올리지 않는다 | **맞다**(코어 `shutdown()` 확인). 종료 시 세대 +1 + `closed` 플래그로 신규 tick 거부 → 코어 모듈 수정 + 테스트 | 소 |
| N3 | 전역 `dbm_query_dimension` UPSERT 배열에 정렬 없음 → 두 노드 역순 fingerprint로 교착(APM 1m 데드락과 같은 구조) | **맞다**(`LinkedHashMap` 선접기만). fingerprint·(kind,value)·native_key 정렬 후 배열 생성 | 소 |
| N4 | Top SQL 기본 집합에 nested(`toplevel=false`) 문장 섞임 — 식별에만 쓰고 필터 안 함 | **맞다**. `track=top`(PG 기본)이면 영향 없고 `track=all`에서만. 14+ SQL에 `WHERE s.toplevel` + 13 이하 "중첩 미분리" 품질 표기 | 소 |
| N5 | eviction이 있어도 `otherComplete=true` 가능 — 사라진 native·dealloc 증가를 완전성에 반영 안 함(dealloc 값은 typed 저장에서 버림) | **맞다**. checkpoint에 `__dealloc` 보관 → 증가 또는 previous native 소실 시 `otherComplete=false` | 소~중 |
| N6 | `dbm_metric_1m` PK에 node 없음·Q는 최초 node_id만 남기고 합산 → 접속점 전환 분의 두 노드 값이 섞임 | **맞다, 설계 결정 필요**(노드 스코프 집계 vs 논리 대상 집계). V93 PK 변경 + writer | 중(V93) |
| N7 | C의 `intervalMs`를 버려 증가량의 관측 기간 복원 불가(`count`는 관측 수) | **맞다**. `dbm_metric_1m`에 `interval_ms` 합 열(V93) + writer | 소(V93) |
| N8 | `ensurePartitions`가 "writer tx 밖"이지만 호출자에 Spring tx가 있으면 그 tx에 참여 → REQUIRES_NEW writer와 자기 대기 | **맞다(호출자가 생기면)**. 폴러 스레드엔 바깥 tx가 없어 지금은 미발생. `PROPAGATION_NOT_SUPPORTED`로 감싸면 끝 | 소 |
| N9 | 보존 옵션 `dimensionIdleDays`를 짧게 저장하면 참조 중 차원 ID가 삭제됨(기본 400일의 안전성을 모든 설정의 안전성으로 간주) | **맞다**. `dbm_dimension_text`·`dbm_query_native` DELETE에 `NOT EXISTS`(세션·Q 사실 참조) 조건 | 소 |

🟡: N10 typed 표가 `rawHash`·`sqlOmitted`·`maskingFailure`·태그·Q dealloc을 버린다(계약 §1.1 "1:1 매핑" 정정 필요) · N11 `ON CONFLICT DO NOTHING`으로 버린 행도 `row_count`에 셈 · N12 다른 TZ가 만든 같은 이름 파티션을 범위 확인 없이 신뢰 · N13 enc:v2를 HEAD Codec이 평문으로 취급 + `DECRYPT_FAILED` CHECK 없음(**WS-1 작업 트리의 `DbmSecretCodec`이 v2 해석·평문 거부를 넣었다 — 코덱스는 HEAD만 봤다**) · N14 `evict()`가 진행 중 load의 옛 스냅샷 재게시를 막지 못함 · N15 일반 native 행도 두 번째 UPSERT부터 `scan_capped=false` 등으로 채워져 "플래그는 `__other__`만" 계약이 깨짐 · N16 배치 만료 인덱스 없음·C reset은 감소 휴리스틱뿐.

정정 받은 것: Q checkpoint는 8,000행이 아니라 **큰 jsonb 한 행**(비용은 직렬화·TOAST·WAL) · 1m UPSERT는 단일 slow 레인+lease로 직렬화돼 APM 동시 수신과 같은 조건은 아니다(전역 차원만 🔴) · `FOR SHARE`가 인계 UPDATE를 막는 것은 맞다 · `old || defaults || old` 병합은 기존 키 우선이 맞다 · 파티션 DROP 경계 `day < today - days`는 보수적(오늘 DROP 없음).

WS-1 선행 계약(§9 표): enabled admission(클레임 존재 ≠ admission 구현) · owner 전환은 generation+lease 만료 한 tx · credential_version은 저장 tx에서 DB 값 기준 증가(읽고 +1 금지) · evict는 commit 뒤 · 대상 삭제 뒤 writer는 대상 없음으로 거부됨(확인) · 접속점 수정이 통계 연속성 단절인지 결정 · 대상별 실행 격리(워커·풀)는 WS-1 완료 조건.

### 9차 반영(2026-10-28, 사용자 결정 A)
🔴 N2·N3·N4·N5·N8·N9 반영(안정화 커밋) — 각 지적의 재현을 테스트로: `CollectorRuntimeTest.shutdownBlocksLaterTicksUntilReopen`(N2) · `PgTypedRowStoreIT.reverseOrderDimensionUpsertsDoNotDeadlock`(N3, 두 tx 역순 15회) · `PgCollectorSqlTest` 14+ `AND s.toplevel`(N4) · `PgCollectorSqlTest.otherCompletenessAssessment`(N5) · `PgTypedRowStoreIT.partitionDdlRunsOutsideCallerTransaction`(N8, 바깥 tx 안 writer) · `DbmRetentionJobIT.keepsReferencedDimensions`(N9). 이월: N1(계약 §1.10 전제), N6·N7(WS-10 V93). 🟡 N13은 WS-1 `DbmSecretCodec`이 닫음, 나머지 🟡는 WS-10·WS-4로.
