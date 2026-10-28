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
