# DB 모니터링(Database Monitoring) — 설계서 v1.1 (에이전트리스 JDBC 폴러 · 유료 PREMIUM 범위 · 코덱스 검수 반영)

- 작성: 2026-10-19 (v1 초안 → **v1.1 코덱스 검수 🔴11·🟡4·공정성 7·빠진 질문 12 전건 반영**, 같은 날)
- 상태: 🟡 **v1.1 — 사용자 미결 Q1~Q21 확정 대기 → 착수본(v2).** 구현 0.
- 근거 자료(고치지 않는 기록):
  - `./research_db-monitoring-2026-10-19.md` — Part A 상용 제품 8종 · Part B Zabbix 템플릿/OTel receiver/엔진별 뷰·권한 · Part C 국내 시장
  - `proposal_db-monitoring_codex.md` — 코덱스(gpt-6.1-sol/high) 독립 제안. 대조 **§14**
  - `./review_db-monitoring-design.md` + `_codex.md` — 검수 요청·결과. 반영 표는 요청서 하단
- 대상: `moveseye-be-spring`(폴러·저장·API) + `moveseyee_fe`(화면) + 배포 산출물(엔진별 최소 권한 SQL·보안 심사 문서)
- 관련: `devdesign_premium-edition.md` §5.9(대체됨)·P10·P17, `devdesign_apm.md` §2.4·§4.5, `devdesign_gpu-collection-paths.md`, `devdesign_apm-retention-policy.md`

| 버전 | 변경 | 사유 |
|---|---|---|
| v1 | 초안. JDBC 폴러 1차·Zabbix 상관/발견·OTel P5·엔진 4종 GA·메뉴 7·Phase P0~P4 | 사용자 지시 |
| **v1.1** | 🔴 ①만료 시 폴러 정지(기존 커널 원칙 준수) ②마스킹을 엔진 정규화 텍스트에도 재검사·플랜 구조 파싱 ③식별 모델 분리(target/endpoint/node/namespace, fingerprint↔native 다대일, Zabbix 링크 테이블) ④lease·델타 checkpoint 실패 계약 ⑤`at=` 시차 계약·파티션 키·인덱스 ⑥보존 정합(락 48h·차원 TTL 분리) ⑦용량 전체 재산정(≈115~145GB, 예산 150~200GB) ⑧디스크 예산 자동 단축 금지→정책 내 동작 ⑨브리지 추출 범위·APM endpoint 관측 모델 신설 ⑩품질 축 3개·AAS 정의·상한 우선순위 ⑪TLS·타임아웃·2레인·인증 실패 분류·드라이버 업로드 통제 / 🟡 1초 조건=전체 예산·OTel P0 비교(R7)·SchedulerJob 근거 정정·공수 270~385 / §5.8 운영 계약 신설 / Q12~Q21 추가 / §14 공정성 보정 | 코덱스 검수(`review_db-monitoring-design_codex.md`) |

---

## 0. 한눈에 보기

**한 줄 요약**: DB 서버에 **아무것도 설치하지 않고**, MovesEye BE 안의 JDBC 폴러가 모니터링 전용 읽기 계정으로 DB에 접속해 **활성 세션(5초)·대기 이벤트·Top SQL·락 트리·실행계획·인스턴스 카운터**를 수집한다. 데이터는 우리 PostgreSQL에 저장하고, **과거 시점 재생**(상세 48h·집계 30일)으로 "그때 누가 무엇을 기다렸나"에 답한다. 호스트 OS 지표는 기존 Zabbix 호스트와 연결해 같은 타임라인에 겹치고, 느린 APM 트랜잭션에서 DB 부하로 내려간다.

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
| D10 | `Feature.DB_MONITORING` 단독. **만료(`EXPIRED`)부터 폴러 정지**, 롤업·정리만 계속. `/dbm/**` 조회는 기존 커널(`LicenseStatus`)이 거부 — 만료 후 과거 조회·내보내기 허용 여부는 **Q13** | `SchedulerJob.requiresActiveLicense` 원칙·P17 `allowsLiveQuery`는 Zabbix 값 **조회** 권한(🔴1) | §9 |
| D11 | 자동 조치 없음(Kill·인덱스·SQL 변경 1차 제외). `EXPLAIN`(예상 플랜)도 승인·예산 하에서만 | 권한 심사 통과가 영업 속도 | §10 |
| D12 | 과거 시점 재생 필수: **상세(세션·락) 48h 동일 창**, 1m 집계 30일은 **대기→SQL→사용자**까지(세션 복원 아님) | 보존 창 정합(🔴6) | §8.3 |

### 0.1 Phase 어림 (상세 §12) — 검수 반영: 불확실성 20~30% 포함

| Phase | 한 줄 | 어림(사람-일) |
|---|---|---|
| **P0** 실측·계약 | R1~R8(권한·부하·마스킹 fixture·용량·6.0 배달·드라이버·**OTel PG receiver 비교**·**Oracle 최소 권한 병행**) | 20~30 |
| **P1a** 공통 기반 + PostgreSQL 조사 흐름 | 등록·자격증명·capability·폴러 프레임(레인·lease·checkpoint·writer·파티션)·PG 어댑터·개요·상세·SQL 표·락 트리·관리 마법사 | 55~70 |
| **P1b** MySQL/MariaDB + 알람 공용화 | MySQL·MariaDB 어댑터(락 분기)·Zabbix 트래퍼 전송기 추출·규칙 7종·보존 탭 | 35~45 |
| **P2** Oracle + SQL Server | V$ 허용목록 패키지·CDB/PDB·DMV·AG·플랜 뷰어·권한 검사 리포트 | 75~95 |
| **P3** 사후 분석·상관 | 과거 시점 재생 UX·기간 비교·플랜 변경·APM endpoint 관측 모델·리포트·위젯·(선택) Zabbix 카운터 개요 모드 | 50~70 |
| **P4** 출시 검증 | 50 인스턴스 복합 부하·APM 동시 부하·HA 인계·장애 복구·폐쇄망 설치·보안 심사 패키지 | 35~45 |
| **GA 합계** | 엔진 4종 인증(토폴로지 = BE→DB 직접 접속) | **270~355** (코덱스 추정 270~385와 겹침) |
| P5 확장 | 원격 실행형 폴러(25~35, **GA 토폴로지 축소의 대가** — Q12) · Tibero(40) · OTel 프로필(20) · CUBRID 조사(10) · Oracle ASH 프로필 검토 | 95~105 |

---

## 1. 배경·목적

### 1.1 as-is
- `Feature.DB_MONITORING`(PREMIUM 기본 포함), FE 라우트 `/database-monitoring`·사이드 메뉴·자물쇠·i18n 키 전부 존재. 내용물은 `Empty "준비 중"` 스텁.
- BE `premium/dbm/` 없음. Flyway 최신 **V81** → DB 모니터링은 **V82~**(착수 직전 재확인).
- 프리미엄 설계서 §5.9 전제 "Zabbix agent2 공식 템플릿 활용"은 **본 문서가 대체**(포인터 반영 완료).

### 1.2 왜 그 전제로는 유료 기능이 성립하지 않나
Zabbix 공식 DB 템플릿 7종 전부가 인스턴스 **집계치만** 제공한다(연결 수·캐시 히트·복제 지연·락 **건수**·슬로우 쿼리 **건수**). 세션 목록·Top SQL·락 트리·실행계획은 어느 템플릿에도 없다(Part B §A README 전수). 유료 제품의 공통 분모(Part A §2-1, Part C §7)가 정확히 그 넷이다.

**Zabbix 공식 Oracle 템플릿 2종(agent2·ODBC)은 `V$ACTIVE_SESSION_HISTORY`를 조회**한다(README "Diagnostics Pack 필요" 명시). 이 템플릿을 쓰는 SE2·팩 미보유 고객에게 안내가 필요하다(§8.5).

### 1.3 한 줄 정의
> **고객 DB 인스턴스가 지금 무엇을 기다리고 있는지, 어느 SQL이 시간을 먹는지, 누가 누구를 막고 있는지를 DB 서버에 아무것도 설치하지 않고 보여주고, 장애가 지난 뒤에도 그 시점으로 돌아가 같은 질문에 답한다.**

### 1.4 원칙
1. **에이전트리스 기본.** 고객 승인 항목은 ① 모니터링 전용 읽기 계정 ② BE→DB 포트 둘. 그 둘을 **보안 심사 문서 한 장**으로 제출.
2. **엔진별 최소 권한 SQL 스크립트가 산출물.** 포괄 권한 비요구, 기능별 추가 권한은 분리 표시.
3. **Oracle 유료 팩 비사용은 실제 호출 객체 목록으로 보증.** "조회 가능한지 시험" 호출도 금지.
4. **값 0과 수집 실패를 구분.** 시간 관측률·행 잘림·텍스트 잘림을 **세 축**으로 저장·표시.
5. **샘플은 실행 이력이 아니다.** 5초 미만 실행은 "포착될 수도 있지만 누락될 수 있다". 짧은 고빈도 SQL은 누적 통계(Q)로.
6. **설치형 제약**: 새 DB 없음, 도커 없음, 고객이 선택한 보존 정책 안에서만 자동 조정.
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
플랜 변경 감지(P3) · **APM↔DB 단일 제품 상관**(P3, 시간 상관부터) · 호스트 OS 지표 오버레이(P1a) · 보안 심사 패키지(P4) · Kill(Q6 제외) · 추천(비범위) · ML 이상탐지(백로그) · Deadlock graph(MSSQL XE, P3 후보).

### 2.3 지원 엔진 우선순위
공공 2024: Oracle 62.5% · MSSQL 14.4% · CUBRID 10.6% · Tibero 9.1% · MariaDB 3.5%. 금융 계정계 Oracle, 채널·정보계 PostgreSQL·Tibero 이탈. → **GA 4종: Oracle · SQL Server · MySQL/MariaDB · PostgreSQL.** Tibero P5 1순위, CUBRID 조사, Altibase/Goldilocks 요청 시. **GA 지원 버전·에디션 시험표는 Q16으로 확정**(XE·Developer만으로 전 범위 인증 불가 — 코덱스 Q9).

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
| | | J2: J1과 같은 코어의 systemd/Windows 서비스 포장. **GA에서 빼면 "BE→DB 직접 접속 불가 고객"이 도입 불가 — GA 토폴로지 축소다(공정성 3). Q12로 결정** |
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

---

## 4. 엔진별 데이터 소스·권한·라이선스

공통 주기: **세션 5s(1~10s) · 락 10s · 카운터 15s · SQL 누적 60s · 플랜 on-demand(예산)**. 오버헤드는 상대 위험 — R2가 측정.

| 엔진 | C | S | Q | P | L | 최소 권한(제품 스크립트) | 조건·미지원 | 주의 |
|---|---|---|---|---|---|---|---|---|
| **PostgreSQL 12+** | `pg_stat_database`·`pg_stat_bgwriter`·`pg_stat_replication`·`pg_database_size`(대형 DB OFF 옵션) | `pg_stat_activity`(state·wait_event_type/event·query·query_id 14+·backend_xid·xact_start) | `pg_stat_statements`(`queryid`+`dbid`+`userid` 문맥 보존) | **예상 플랜만**: 승인 시 `EXPLAIN`(ANALYZE 금지), 기본 OFF | `pg_blocking_pids(pid)` | `GRANT pg_monitor` + `CONNECT` | `pg_stat_statements` 없으면 Q "미지원"(재시작 고지). `track_activity_query_size` 1024→4096 권고 | `pg_locks` 빈번 조회 금지(10s) |
| **MySQL 8.0 / MariaDB 10.5+** | `SHOW GLOBAL STATUS`·InnoDB status·`SHOW REPLICA STATUS` | `performance_schema.threads`+`events_statements_current`(없으면 processlist) | `events_statements_summary_by_digest`(`SCHEMA_NAME`+`DIGEST` 문맥) | `EXPLAIN FORMAT=JSON` 승인 시(8.0+) | MySQL 8 `data_locks`+`data_lock_waits` / MariaDB `INNODB_TRX`+`INNODB_LOCK_WAITS`(**어댑터 분기**) | `SELECT ON performance_schema.*`, `PROCESS`, `REPLICATION CLIENT`(MariaDB `SLAVE MONITOR`) | P_S OFF면 S·Q 저하 모드. consumer는 우리가 UPDATE하지 않음(가이드만) | digest 길이 4096 권고 |
| **SQL Server 2016+** | `dm_os_performance_counters`·`dm_os_wait_stats`·파일·AG | `dm_exec_requests`+`dm_exec_sessions`+`dm_exec_connections`+`dm_exec_sql_text`(`blocking_session_id`·wait·cpu·`query_hash`) | `dm_exec_query_stats`+`dm_exec_sql_text`(`query_hash`+`dbid`; 플랜 캐시 evict → 리셋 감지) | `dm_exec_query_plan(plan_handle)` 캐시 XML(예산) | `blocking_session_id`(음수 -2~-5)+`dm_tran_locks` | `VIEW SERVER STATE`(≤2019)/**`VIEW SERVER PERFORMANCE STATE`(2022+)**, `VIEW ANY DEFINITION`, `CONNECT ANY DATABASE` | Query Store P3 선택 | 수집 SQL `READ UNCOMMITTED`·짧은 배치; 병렬 task 중복 집계 금지 |
| **Oracle 12c+ (SE2·EE)** | `V$SYSMETRIC`·`V$SYSSTAT`·`V$RESOURCE_LIMIT`·`DBA_TABLESPACE_USAGE_METRICS`·`V$OSSTAT` | `V$SESSION`(status·event·wait_class·sql_id·blocking_session·seconds_in_wait) + **`V$TRANSACTION`**(LONG_TX, 코덱스 지적) | `V$SQLSTATS`(SQL_ID+PLAN_HASH_VALUE; 리터럴 SQL은 우리 검사) | `V$SQL_PLAN`(캐시, 예산). `DBMS_XPLAN.DISPLAY_CURSOR`는 **`V$SQL`·`V$SQL_PLAN_STATISTICS_ALL` 추가 grant 필요**라 기본 OFF, `DISPLAY_AWR` 등 같은 패키지의 팩 함수는 **호출 금지** | `V$SESSION.blocking_session`+`V$LOCK` | `CREATE SESSION` + **객체별 `GRANT SELECT ON V_$SESSION, V_$TRANSACTION, V_$SQLSTATS, V_$SQL_PLAN, V_$SYSMETRIC, V_$SYSSTAT, V_$LOCK, V_$RESOURCE_LIMIT, V_$OSSTAT, V_$INSTANCE, V_$DATABASE, DBA_TABLESPACE_USAGE_METRICS`** (+플랜 옵션 시 `V_$SQL, V_$SQL_PLAN_STATISTICS_ALL`). `SELECT ANY DICTIONARY`·`SELECT_CATALOG_ROLE`은 대안으로만 병기 | 🔴 호출 금지 목록(§4.1). CDB는 `C##` 공통 유저+`CONTAINER_DATA`(P2). **RAC `GV$`·노드 식별·교차 노드 blocker는 Q3**(금융 Oracle GA면 필요 — 코덱스) | 1초마다 `V$SQL` 전체 스캔 금지 |
| **Tibero 6/7**(P5) | `V$SYSSTAT`·`V$SYSTEM_EVENT` 변형 | `V$SESSION`·`V$WAITER_SESSION` | `V$SQLSTATS`·`V$SQL` | 버전별 | `V$LOCK` | 미확정 | Oracle 어댑터 구조 공유, SQL·상태 판정 별도. TAC 별도 | 무수정 호환 보장 불가 |
| CUBRID(조사) | broker·`SHOW` | `SHOW TRANSACTION TABLES` | 통로 불명 | `plandump`(OS) | `lockdb`(OS) | 미확정 | JDBC만으로 S·L·Q 다 못 얻을 가능성 | 백로그 |

### 4.1 Oracle 라이선스 경계 — 객체 기준
- **기본 패키지(`ORACLE_BASE`)가 호출하는 객체 = 위 grant 목록 전부, 그 외 0건.** 코드 리뷰 체크리스트에 "Oracle SQL 파일의 FROM 절 객체 ⊂ 허용목록" 자동 테스트를 둔다.
- **호출 금지**: `V$ACTIVE_SESSION_HISTORY`·`X$ASH`·`DBA_HIST_*`(예외 6종 포함 전부 — 보수적으로)·`DBMS_WORKLOAD_REPOSITORY`·`V$SQL_MONITOR`·`V$SQL_PLAN_MONITOR`·`DBMS_XPLAN.DISPLAY_AWR`·`DBMS_SQLTUNE.*`·`DBMS_ADDM.*`.
- 문구 규칙: "V$ 뷰는 안전하다" 또는 "제한 뷰를 조회하면 항상 사용 통계에 기록된다" 같은 포괄 문장은 문서·화면에 쓰지 않는다. **"기본 패키지는 다음 객체만 호출합니다: …"** 로 쓴다.
- `ORACLE_DIAGNOSTICS`(팩 보유 고객 ASH 읽기)는 Q4(v1 제외).

### 4.2 권한 검사 리포트
등록 시 기능별 검사 SQL → `dbm_capability` 행(C/S/Q/P/L × OK/MISSING/DISABLED/ERROR + detail). 화면은 이 행으로 탭 on/off. "접속 성공≠설정 완료". PDF/MD 내보내기(P4, 보안팀 제출용).

### 4.3 JDBC 드라이버 (R6)
| 엔진 | 드라이버 | 라이선스 | 번들 |
|---|---|---|---|
| PostgreSQL | `org.postgresql:postgresql` | BSD-2 | 있음 |
| Oracle | `com.oracle.database.jdbc:ojdbc11` | Oracle Free Use Terms(재배포 허용 조항 R6 확인) | 번들 |
| SQL Server | `com.microsoft.sqlserver:mssql-jdbc` | MIT | 번들 |
| MySQL/MariaDB | `org.mariadb.jdbc:mariadb-java-client` | LGPL-2.1 | 번들(Connector/J GPL 회피) |
| Tibero·CUBRID·Altibase | 고객 제공 jar | 재배포 불가 | **고객 업로드 로더** — `DBM_ADMIN`만, **허용 드라이버 클래스명 목록**, SHA-256 기록, 설치 이력 테이블, 적용은 **BE 재시작 후**(런타임 클래스로딩 금지 — 서버 코드 실행 경로이므로, 🔴11) |

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
- **격리**: 대상 장애는 그 워커만 백오프(5s→60s 지수). **인증 실패(PG 28000·ORA-01017·MSSQL 18456·MySQL 1045)는 DOWN과 분리** → 재시도 중단(계정 잠김 악화 방지), `AUTH_FAILED` 알람, 관리자가 자격증명 갱신 후 수동 재개.
- **라이선스**: `AccessMode.FULL`이 아니면(=`EXPIRED`부터) **폴러 전체 정지**. 롤업·정리는 계속(§9).
- **설정 전파**: `dbm_target.updated_at` 30s 폴링으로 워커 재구성.
- **TLS**(🔴11): 엔진별 기본 **검증 ON** — PG `sslmode=verify-full`(없으면 `require`로 경고), MSSQL `encrypt=true;trustServerCertificate=false`, MariaDB `sslMode=VERIFY_CA|VERIFY_FULL`, Oracle TCPS(JKS 트러스트스토어). 신뢰 CA는 `dbm_setting.trust_store`(업로드) 또는 JVM 기본. 검증 실패는 접속 실패로 처리하고 **다운그레이드 자동 전환 금지**(관리자가 명시적으로 `tls=disabled` 선택 시 배지).

### 5.2 lease — 다중 BE 노드 계약 (🔴4)
- `dbm_target.lease_owner, lease_token bigint, lease_until` — **DB 시간(`now()`) 기준** 원자적 획득: `UPDATE … WHERE lease_until < now() OR lease_owner = :me RETURNING lease_token+1`. TTL **30s**, 갱신 10s마다. (기존 `SchedulerLeaseService`는 30분 배치 잠금이라 쓰지 않는다.)
- **fencing**: 모든 적재 배치는 `lease_token`을 들고 가며 writer가 `dbm_target.lease_token`과 비교해 불일치면 **거부**(소유권 상실 후 쓰기 차단).
- 수집 RTO: 노드 사망 후 ≤30s 내 다른 노드가 인계(Q15 확정값). 인계 구간은 `coverage` 공백으로 남는다.
- 왜 `SchedulerJob`이 아닌가(🟡3 정정): `SchedulerManager`는 `interval_seconds`를 처리하므로 초 단위가 불가능한 것은 아니다. 상주 루프를 택하는 이유는 **대상별 독립 주기·지연 건너뛰기·fast/slow 레인 격리**다. 대신 기존 스케줄러의 관측·라이선스 차단을 우회하는 별도 실행 체계가 생기므로 ① `scheduler_setting(dbm_poller)`로 on/off·전역 배수 노출(`SCHEDULER_JOB_CATALOG` 등재) ② 폴러 상태(워커 수·실패·마지막 tick)를 `GET /dbm/poller/status`와 관리 콘솔 스케줄러 표 행에 표시 ③ 중지 명령은 같은 설정 행으로. 롤업(`dbm_rollup`)·정리(`dbm_cleanup`)는 정상 `SchedulerJob`(`requiresActiveLicense=false`).

### 5.3 세션 샘플링 정책
| 항목 | 정책 |
|---|---|
| 대상 | **활성·대기 세션** + 장기 트랜잭션 + **idle blocker**. 순수 idle은 카운트만 |
| 세션 키 | `(target_uid, node_boot_epoch, native_session_id, serial/login_time)` |
| 5s 조회 열 | 상태·wait class/event·sql native id·블로커·경과·user·client host·program·db name(전부 surrogate). SQL 텍스트는 캐시 miss 시만 보강(slow 레인) |
| 간격 | 기본 5s, 대상별 1~10s. **1s 허용 조건 = 전체 적재 예산**: `Σ(활성 세션/간격)` ≤ 설정값(기본 2,000행/초)·디스크 예산 내·수집 지연 <1s·대상 DB 영향 R2 기준. 또는 **30분 한정 진단 프로필**(자동 복귀) |
| 반환 상한 1,000행 | **결정적 우선순위**: ① blocker(누군가를 막는 세션) ② 대기 중 ③ 활성(경과 내림차순). `total_rows`(DB가 보고한 전체)와 `stored_rows`를 **분리 저장**. 잘림은 품질 축 `row_truncated` |
| AAS | **실제 활성 상태만** 분자(idle blocker·장기 트랜잭션은 조사 자료로 저장하되 제외). 시간 가중 → `dbm_activity_1m`(wait_class × query × user). 그룹 상한(50) 초과분은 `__other__`로 **총량 보존**, SQL 분해만 불완전 표시 |
| 의미 | 샘플은 실행 이력이 아니다 — 화면 각주 "5초 미만 실행은 포착될 수도, 누락될 수도 있습니다" |

### 5.4 Top SQL(Q) — 델타·checkpoint (🔴4)
- `dbm_delta_checkpoint(target_uid, kind, node_boot_epoch, native_key, last_values jsonb, observed_at, poller_run_id)` — 델타 기준값을 **PG에 보관**. BE 재시작·노드 인계 후 첫 관측은 **기준값으로만 저장**하고 해당 분을 `partial`로 표시(누적 전체를 증가량으로 적재하는 사고 차단).
- 리셋 판정: 카운터 감소 **또는** `node_boot_epoch`/DB 시작 시각 변화 **또는** 기준값 없음 → 새 통계 구간(`reset_seq++`). 감소만 보면 재시작 뒤 값이 이미 커진 경우를 놓친다.
- Top N은 **차분 후 정렬**. 스캔 상한(500)에 걸리면 "전체 Top SQL" 표현 금지. **장기(1h) Top N 압축으로 누락되는 SQL이 있음을 화면에 명시**(Q19).
- 지표: calls·total_ms·avg(=Δtotal/Δcalls)·cpu·rows·lreads·preads·엔진별 extra. 엔진마다 CPU·elapsed·wait 정의가 달라 **공통 화면엔 비교 가능한 값만**, 원 단위·출처 보존.
- 식별: `dbm_query_native(target_uid, engine_native_id, context{dbid,userid,schema})` ↔ `dbm_query_dimension(fingerprint, algo_ver, normalized_text)` **다대일**. 플랜도 native 쪽에 붙는다.
- `seq` 범위 = `(target_uid, kind)`. `UNIQUE(target_uid, kind, epoch, seq)`.

### 5.5 SQL 텍스트·바인드·플랜 보호 (🔴2)
| 데이터 | 정책 |
|---|---|
| SQL 텍스트 | **모든 텍스트가 저장 직전 방언별 검사기를 통과**해야 저장 — 엔진 정규화 텍스트(PG `$1`·MySQL `?`)도 예외 없음(PG 문서: 정규화 가능한 쿼리에도 상수가 남는 경우가 있다). 검사기 = 토크나이저(문자열·숫자·q-quote·dollar-quote·주석 중첩·escape·괄호 식별자·바이너리/16진 리터럴·잘린 SQL 인식) → 리터럴 `?` 치환. 실패/불확실 = **텍스트 폐기, 해시+`masking_failed`만** |
| 바인드 값 | 수집 안 함. **금지 소스 목록**: Oracle `V$SQL_BIND_CAPTURE`·`V$SQL_PLAN.OTHER_XML`의 `peeked_binds`, MSSQL 플랜 XML `ParameterList/@ParameterCompiledValue`·`ParameterRuntimeValue`, PG `pg_stat_activity.query` 안의 리터럴(검사기), MySQL `QUERY_SAMPLE_TEXT`(digest만 사용) |
| 플랜 | **구조 파싱**(XML/JSON/행) → 공통 트리로 변환하며 **허용 필드 보존**(operation·object·cost·cardinality·bytes·access/filter predicate의 **마스킹된** 식) **민감 필드 제거**(파라미터 값·peeked binds·리터럴). 숫자를 뭉개서 cost·rows를 훼손하지 않는다 |
| 사용자명·client host·program | 저장(필터 축). **보안 프로필**로 가명화 선택(Q7) — 가명화 키 변경 시 과거 필터 연속성은 끊어짐을 고지 |
| 원문 보존 | `dbm_setting.keep_raw_sql`(APM 키와 별개) opt-in·감사·배너·`DBM_RAW_SQL_VIEW` 권한. 복원 불가 |
| 적용 범위 | 디스크 백업 큐·예외 로그·진단 번들·내보내기 **전부 같은 정책**(큐에 원문이 남는 경로 차단) |
| 재실행 | 고객 SQL 재실행 없음. `EXPLAIN`(예상)은 승인+예산, `EXPLAIN ANALYZE` 영구 금지 |
| fixture(R3) | 200건 + **잘린 SQL·주석·DDL·중첩 문자열·비정상 인코딩·한글 식별자**. "잔존 0"은 fixture 통과를 뜻하며 보증이 아님 — 문구 주의 |

### 5.6 자격증명·키 운영 (D7)
- 저장: `SettingSecretCodec`(AES-256-GCM, `enc:v1:`, 설치본별 `CREDENTIAL_ENCRYPTION_KEY`) 재사용. API 응답에 비밀번호 미포함, 연결 테스트는 임시 접속.
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
| 백업 지연·DB 오류 로그·파라미터 변경 | GA 범위표: 백업 age(MSSQL `msdb`·PG 없음·Oracle `V$RMAN_BACKUP_JOB_DETAILS`는 권한 추가) **P3 선택**, 오류 로그 **비범위**(파일), 파라미터 스냅샷·변경 감지(`SHOW`/`pg_settings`/`V$PARAMETER`/`sys.configurations`) **P3** |

---

## 6. 데이터 모델 — PG `dbm_*` (Flyway V82~)

### 6.1 테이블 골자 (🔴3·🔴5·🔴6 반영)
| 테이블 | 핵심 | 보존 |
|---|---|---|
| `dbm_target` | **논리 대상** `target_uid uuid` · engine · display_name · poll profile · lease(owner/token/until) · enabled · credential_status | 수명 |
| `dbm_endpoint` | target × (host·port·service/db·tls 설정·priority) — VIP/리스너/AG 리스너 등 접속점 | 수명 |
| `dbm_node` | target × 관측 물리 노드(`instance_name`·`host_name`·`version`·`edition`·`boot_epoch`·`role`·`db_clock_offset_ms`·first/last_seen) | 수명 |
| `dbm_namespace` | target × DB/PDB/schema 네임스페이스(이름·oid/dbid·first/last_seen) | 수명 |
| `dbm_credential` / `dbm_credential_history` | target → `password_enc`(enc:v2:keyId) · username · auth_kind · 변경 이력 | 수명 / 180일 |
| `dbm_capability` | target × grade → status·detail·checked_at (+이력) | 현재+로그 |
| `dbm_zbx_link` | target × `(datasource_id, hostid, role OS_HOST\|DB_HOST)` · confirmed | 수명 |
| `dbm_apm_endpoint_obs`(P3) | APM 서비스 × `(server.address, port, namespace)` 관측(5m, 호출 수·p95) — **APM 쪽 신설 롤업**(§8.4) | 30일 |
| `dbm_apm_link` | target ↔ apm_service · match 근거 · confirmed | 수명 |
| `dbm_sample_batch` | target · kind · `node_id` · `epoch` · `seq` · **`observed_at`(UTC)** · received_at · status · time_coverage · row_truncated(total/stored) · text_truncated · elapsed_ms · lease_token · source. `UNIQUE(target_uid, kind, epoch, seq)` | 상세 7일 · 일 집계 180일 |
| `dbm_delta_checkpoint` | target × kind × node_boot_epoch × native_key → last_values jsonb · observed_at · poller_run_id | 현재 |
| `dbm_session_sample` | **`observed_at`(파티션 키, PK 포함)** · batch_id · target_uid · session_key · state · wait_id · query_native_id · blocker_session_key · elapsed_ms(DB 보고) · user_id · client_id · program_id · namespace_id | **raw 48h**(일 파티션; 보존은 "48h 이상, 파티션 경계까지") |
| `dbm_lock_edge` | observed_at(파티션) · target · waiter_key · blocker_key · object_id · mode · wait_ms | **48h**(세션과 동일 창 — 🔴6) |
| `dbm_lock_incident` | target · root_blocker · first/last_seen · max_depth · victims · status | 30일 |
| `dbm_activity_1m` / `_1h` | target × bucket × wait_class × query_dim × user → active_seconds·sample_count·coverage(`__other__` 포함) | 30일 / 180일 |
| `dbm_query_dimension` | `fingerprint`·algo_ver·normalized_text(≤8KB, **별도 TTL**)·first/last_seen | **참조가 남는 동안 ID 유지**, 텍스트는 `text_retention_days`(기본 60) 후 NULL 가능(Q18) |
| `dbm_query_native` | target × engine_native_id × context(dbid/userid/schema) → query_dim_id · plan 현재 | 참조 수명 |
| `dbm_query_stat_1m` / `_1h` | target × bucket × query_native → calls·total_ms·cpu_ms·rows·lreads·preads·extra·reset_seq·truncated | 7일 / 180일(1h는 Top 500/일) |
| `dbm_plan` | query_native × plan_hash × kind(ESTIMATED/CACHED) → masked_plan jsonb · observed_at · is_current | 마지막 관측 후 30일 |
| `dbm_wait_dimension` | engine × native_wait → common_class | 수명 |
| `dbm_dimension_text` | user·client·program(target 스코프) · last_seen · **TTL 180일**(개인정보 장기 보존 방지) | 180일 |
| `dbm_metric_1m` / `_1h` | target × metric(허용목록 상수) × bucket → value | 7일 / 180일 |
| `dbm_param_snapshot`(P3) | target × 파라미터 스냅샷 해시·diff | 180일 |
| `dbm_alert_rule` · `dbm_alert_event` · `dbm_alert_outbox` | §7 | 이벤트 180일 |
| `dbm_audit` | actor·action·target·detail | 180일 |
| `dbm_driver` | 업로드 jar: 파일명·sha256·class·installed_by·at·active | 수명 |
| `dbm_setting` | keep_raw_sql·session_raw_retention_h(≥48)·disk_budget_gb·min_guaranteed_days·ingest_budget_rows_s·trust_store·… | — |

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
| batch·checkpoint·plan·dimension·native·outbox·audit | SQL 변화율·장애 빈도 의존 | ≈5~10GB(quota) |
| **DBM 논리 합계(중간 가정)** | | **≈115~145GB** |
| 운영 예산 | 인덱스 과소 가정·파티션 경계·재집계 여유 | **150~200GB** 요건 + **WAL·백업은 별도** + APM 109GB 합산 |

→ 설치 요건 문서에 "규모별 하드웨어 프로필"(Q20: 10/50/200 대상)을 둔다. 1일 파티션 DROP이면 보존량은 48h가 아니라 48~72h 범위에서 흔들린다.

### 6.3 디스크 예산 정책 (🔴8)
- **자동 단축은 관리자가 사전 선택한 정책 범위 안에서만**: `min_guaranteed_days`(세션 raw 기본 2일·집계 기본 30일) 아래로는 **절대 자동 삭제 안 함**. 그 아래에서 부족하면 **수집 제한**(세션 간격 ↑ → 그룹 상한 ↓ → 신규 SQL 차원 중단) 순서로 **명시적 손실** + 배너 + 감사.
- raw 파티션 DROP 전 **롤업 완료 확인**(`dbm_rollup_state` 워터마크 ≥ 파티션 끝) — APM `PartitionDropGuard` 패턴.
- **사건 구간 보호**: 열린 `dbm_lock_incident`·HIGH 알람 구간이 포함된 파티션은 보호 기간(기본 7일) 동안 DROP 제외(별도 "증거 묶음" 내보내기 P3).
- 예산 판단은 **DBM 논리 크기 + 파일시스템 잔여 공간 둘 다**(APM과 PG 공유).
- 화면에 "실제 조회 가능한 기간"을 보존 설정값과 분리 표시.

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
| `LONG_TX` | 트랜잭션 경과 > t초(Oracle `V$TRANSACTION`) | WARN |
| `AAS` | 활성 세션 평균 > CPU×k(5분) | WARN |
| `REPL_LAG` | 지연 > s초/bytes | HIGH |
| `STORAGE_PCT` | tablespace/파일 > x% | WARN/HIGH |
| `STALE` | 수집 공백 > n분 | WARN |
| `QUERY_REGRESSION`(P3) | tracked SQL avg 기준선 ×k | WARN |
| `PLAN_CHANGE`(P3) | plan_hash 변경 | INFO |
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
| 대상 | `GET /dbm/targets` · `POST /dbm/targets` · `POST /dbm/targets/test-connection` · `POST /dbm/targets/{uid}/check-capabilities` · `GET /dbm/targets/discover-candidates` · `GET /dbm/poller/status` |
| 실시간/과거 | `GET /dbm/targets/{uid}/sessions?at=` · `/locks/tree?at=` · `/waits/timeline?from&to&bucket` · `/metrics?names&from&to` — **`at` 계약 §8.3** |
| SQL | `/top-queries?from&to&orderBy&limit` · `GET /dbm/queries/{nativeId}`(추이·세션·플랜·호출 서비스) · `/plans/{planId}` · `POST .../explain`(승인 대상만) |
| 분석 | `/compare?a=&b=` · `/lock-incidents` · `/activity/breakdown?by=wait_class\|sql\|user` · `/evidence-bundle?from&to`(P3) |
| 상관 | `/host-metrics`(Zabbix 링크) · `/apm-services` · APM 측 `GET /apm/services/{uid}/db-targets`(둘 다 보유 시) |
| 알람 | `/dbm/alert-rules` · `/dbm/alert-events` · `/dbm/alert-delivery/status` |
| 관리 | `/dbm/settings` · `/dbm/retention` · `/dbm/drivers` · `/dbm/credentials/{uid}/rotate` · `/dbm/audit` · `/dbm/collectors`(P5) |
응답 공통: `{ data, status: complete|partial|unsupported, quality: {timeCoverage, rowTruncated, textTruncated}, observedAt, ageMs, batchId, lastSuccessAt }`.

### 8.2 메뉴 (`/database-monitoring/**`, 관리 `/setting/database-monitoring/**`) — 1차 노출 4개(Q10)
| 메뉴 | 내용 | Phase |
|---|---|---|
| **1. DB 개요** | 대상 카드/표: 엔진·버전·역할·상태·AAS 스파크라인·블로킹·복제·스토리지·품질 3축·capability 배지·(선택) Zabbix 카운터 모드 배지 | P1a |
| **2. 인스턴스 상세** | 공통 시간 선택기(실시간/과거) · AAS by wait class(호스트 CPU 오버레이) · 활성 세션 표(세션 드로어) · **락 트리(상세 안의 탭)** · 카운터 · 노드/endpoint 탭 | P1a |
| **3. SQL 분석** | Top SQL(정렬·기간·`truncated` 표시) · SQL 상세(추이·대기 분해·세션·플랜·플랜 변경·호출 서비스) · tracked SQL | P1a(표)·P3 |
| **4. 알람** | 이벤트·원인 링크·복구·배달 상태 | P1b |
| 5. 성능 분석(과거 시점) | 타임 슬라이더(48h 상세 재생) · 1m 집계 30일 drill-down **대기→SQL→사용자** · 기간 비교 | P3 완성 시 노출 |
| 6. 잠금·트랜잭션 | 인시던트 목록·트리 재생·장기 트랜잭션·(MSSQL) deadlock | P3 노출(P1a는 상세 탭) |
| 7. 관리(/setting) | 등록 마법사(엔진→endpoint→접속/TLS→**권한 검사**→기능 미리보기→보존 예산→시작) · 자격증명/교체 · 드라이버 · 보존/디스크 정책 · 마스킹 · 보안 프로필 · Zabbix/APM 링크 · 감사 · 폴러 상태 | P1a |
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
인앱 설치 가이드(`ApmGuideText` 패턴: 계정 SQL 복사·권한 검사 해설·포트·TLS·pg_stat_statements 재시작 고지·**Oracle 기본 패키지 호출 객체 목록**) · **보안 심사 패키지**(P4: 권한·통신·수집 SQL 전문·비수집 범위·보존·열람 권한·감사) · Zabbix Oracle 템플릿 ASH 안내 · `준비-중인-모니터링.md` 정정 · **GA 지원 토폴로지·버전·에디션 표**(Q12·Q16).

---

## 9. 라이선스·권한 (🔴1 반영)
- `@RequiresFeature(DB_MONITORING)` — `/dbm/**` 전부.
- **폴러는 `AccessMode.FULL`에서만 돈다. `EXPIRED`(만료 30일)부터 정지.** 근거: `SchedulerJob.requiresActiveLicense` 원칙("수집 소스로 나가는 배치는 만료되면 멈춘다")과 `SchedulerManager.canWrite()`; P17의 `allowsLiveQuery()`는 **Zabbix가 이미 수집한 값을 조회**할 권한이고 고객 DB를 계속 폴링해 적재할 근거가 아니다. 롤업·정리는 계속(`requiresActiveLicense=false`).
- 현 커널(`LicenseStatus`)은 만료 상태에서 `Feature.DB_MONITORING` 자체를 거부 → `/dbm/**` 조회도 차단된다. **만료 후 과거 조회·내보내기를 허용할지는 Q13**(허용하려면 프리미엄 설계 P10·P17·Feature 정책을 함께 개정 — 이 문서 한 줄로 처리하지 않음).
- APM 상관 화면만 `DB_MONITORING ∧ APM`.
- 역할: `DBM_VIEW`(+**대상 그룹 스코프**, Q17) / `DBM_RAW_SQL_VIEW` / `DBM_ADMIN`(등록·자격증명·드라이버·마스킹·보존). 전 변경은 `dbm_audit`.

---

## 10. 비범위·유예
Kill·자동 조치(Q6) · 추천 · ML 이상탐지 · Oracle ASH 프로필(Q4) · MongoDB/Redis/ClickHouse · CUBRID/Altibase/Goldilocks(조사·로더만) · 슬로우 로그 파일 · DB 오류 로그 파일 · E1 · 관리형 클라우드 DB 인증(IAM) · 실행 단위 APM 연결.

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
| 🔴 환경 | 상용 DB 시험 환경 없음 — Oracle XE 21c·SQL Server 2022 Dev·MySQL 8·MariaDB 10.11을 별도 VM/로컬에(시험 서버 10.220.0.13 금지). **XE·Dev는 출발점이지 전 버전·에디션 인증이 아님** → Q16 시험표 | | Q9 |

기타: Tibero 무수정 호환 불가 · MariaDB 락 분기 · MSSQL 모니터링 쿼리 tempdb 데드락 · PG `pg_locks` 경합 · 폴러가 메인 PG 풀 고갈(전용 풀·writer로 차단) · 트래퍼 전송기 추출 시 APM 회귀.

---

## 12. 구현 단계 (WBS 요지)

| Phase | 워크스트림 | 어림 |
|---|---|---|
| **P0** | R1~R8 + 시험 환경 + 이벤트/스키마 확정 + 지원 버전표 초안 | 20~30 |
| **P1a** | WS-1 대상·endpoint·node·자격증명(enc:v2 키 운영)·capability·드라이버 로더 · WS-2 폴러 프레임(2레인·lease·checkpoint·writer·디스크 큐·파티션 서비스) · WS-3 PG 어댑터 · WS-4 FE 개요·상세(락 트리 탭)·SQL 표·관리 마법사 · WS-5 Zabbix 발견·호스트 링크 · WS-6 품질 3축·`at=` 계약 | 55~70 |
| **P1b** | WS-7 MySQL/MariaDB 어댑터(락 분기) · WS-8 Zabbix 트래퍼 전송기 추출+APM 회귀 · WS-9 규칙·억제·outbox · WS-10 보존/디스크 정책 탭·롤업·정리 · WS-11 알람 메뉴 | 35~45 |
| **P2** | WS-12 Oracle(허용목록 패키지·객체 자동 테스트·CDB/PDB·RAC는 Q3) · WS-13 SQL Server(DMV·AG) · WS-14 플랜 구조 파서·뷰어 · WS-15 권한 검사 리포트 내보내기 | 75~95 |
| **P3** | WS-16 과거 시점 재생 UX·기간 비교 · WS-17 플랜 변경·tracked SQL·QUERY_REGRESSION · WS-18 APM endpoint 관측 롤업(APM 계약)+상관 화면 · WS-19 리포트·위젯 · WS-20 파라미터 스냅샷·백업 age(선택) · WS-21 Zabbix 카운터 개요 모드(Q14) · WS-22 증거 묶음 내보내기 | 50~70 |
| **P4** | 50 대상 복합 부하·APM 동시 부하·HA 인계·장애 복구·폐쇄망 설치 문서·보안 심사 패키지·지원표 | 35~45 |
| **P5** | 원격 실행형(Q12에 따라 GA 편입 가능) · Tibero · OTel 프로필(R7) · CUBRID 조사 · ASH 프로필 검토 | 95~105 |

**기능 포함 비교(공정성 7)**: 코덱스 GA(215~315)엔 원격형 포함·플랜 비교/APM 상관/리포트 제외. 본 GA(270~355)는 원격형 제외·플랜 비교/APM 상관/리포트 포함. 총합이 비슷해도 **범위가 다르다** — Q12 결정이 GA 공수를 +25~35 바꾼다.

---

## 13. 미결 (사용자 확정 대기)

| Q | 질문 | 추천 |
|---|---|---|
| **Q1** | 엔진 구현 순서 | **A: PG로 공통 기반 → MySQL/MariaDB → Oracle·MSSQL.** 단 Oracle 최소 권한·SQL 검증은 **P0부터 병행** |
| **Q2** | 세션 샘플 기본 간격 | **5s 기본**, 1s는 전체 적재 예산 안에서 또는 30분 진단 프로필 |
| **Q3** | Oracle RAC(`GV$`·노드 식별·교차 노드 blocker)·CDB/PDB를 P2에 넣나 | **CDB/PDB P2.** RAC는 금융 Oracle을 GA 대상으로 삼으면 **P2 필요**(코덱스) — 시험 환경 부재가 걸림. 넣지 않으면 GA 지원표에 "RAC 미지원" 명기 |
| **Q4** | Oracle ASH 읽기 프로필 | v1 제외 |
| **Q5** | Zabbix 6.0 배달 — 이메일 폴백만 vs `zabbix_sender` | 6.0 고객의 통지 요구로 결정. 폴백만이면 **"6.0은 Zabbix 알림 미지원" 기능 차이로 명시** |
| **Q6** | 세션 Kill | 1차 제외 |
| **Q7** | 사용자명·client host 가명화 | **보안 프로필**(표준/금융)로 선택, 금융 프로필 기본 ON |
| **Q8** | 인증 방식 — 비밀번호 외 Oracle Wallet·Kerberos·MSSQL 통합 인증·외부 비밀관리 | 일괄 비범위 아님. **GA는 비밀번호+TLS, Wallet/통합 인증은 고객군 확인 후 P5 후보** |
| **Q9** | 시험 환경 설치 위치 | 신규 VM 1대 승인 요청(로컬 PC 대안) |
| **Q10** | 1차 메뉴 노출 | **4개**(개요·상세·SQL·알람). 잠금은 상세 탭, 성능 분석은 P3 완성 시 |
| **Q11** | OTel 프로필 시기 | **R7 결과로 확정**(기본 P5) |
| **Q12** 🆕 | **GA 지원 토폴로지** — BE→DB 직접 접속만 vs 원격 실행형 폴러 포함 | 타깃 고객 망 구조로 결정. 망분리 금융이 1차 타깃이면 **GA 포함(+25~35일)** |
| **Q13** 🆕 | **만료 후 정책** — 폴러 정지는 확정. 과거 조회·내보내기를 `EXPIRED` 30일간 허용할지 | 허용 시 프리미엄 설계 P10·P17·`LicenseStatus` 개정 필요 → **별도 결정 세션** |
| **Q14** 🆕 | Zabbix 카운터 개요 모드(폴러 미등록 호스트, C만) | P3 선택 포함 |
| **Q15** 🆕 | HA 목표 — 수집 RTO(30s)·PG 정지 시 허용 손실(디스크 큐 256MB) | 추천값 그대로, R8로 검증 |
| **Q16** 🆕 | 지원 버전·에디션 인증 표(Oracle 12c/19c/21c×SE2/EE, MSSQL 2016~2022, MySQL 8.0/8.4, MariaDB 10.5~11, PG 12~17) | P0에서 표 확정, XE·Dev로 가능한 범위부터 |
| **Q17** 🆕 | 인스턴스(대상 그룹)별 열람 권한 범위 | `DBM_VIEW`에 그룹 바인딩 포함 |
| **Q18** 🆕 | 보장 보존·자동 조정 동의 — `min_guaranteed_days`(raw 2일·집계 30일)·SQL 텍스트 TTL 60일·사용자 사전 180일 | 추천값 |
| **Q19** 🆕 | 장기 Top N 압축(1h Top 500/일)의 누락을 어떻게 표시하나 | "상위 N만 보존" 배지 + 누락 추정 비율 |
| **Q20** 🆕 | 규모별 하드웨어 프로필(10/50/200 대상) 문서화 | P4 산출물 |
| **Q21** 🆕 | 공통화한 Zabbix 트래퍼 전송기의 소유권·APM 회귀 책임 | `premium/common/` 소유 = DBM 작업자, APM 회귀 테스트 통과가 머지 조건 |

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
