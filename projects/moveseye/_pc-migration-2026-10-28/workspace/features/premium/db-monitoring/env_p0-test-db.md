# P0 시험 DB 환경 — 로컬 Docker (Q9 로컬 대안)

- 작성: 2026-10-23 · 결정: Q9 "신규 VM 1대 승인 요청(대안: 로컬 PC)" 중 **로컬 PC(Docker Desktop) 대안으로 시작**. 개발 PC에 이미 dev PG(`dmove-postgres-dev74`, 5434)·test PG(`dmove-postgres-test`, 5433)가 Docker로 돌고 있어 같은 방식이다. 🔴 시험 서버 10.220.0.13은 쓰지 않는다.
- 한계: R2 부하(5,000 세션)·R4 용량(7일 적재)·R8 HA(2노드)는 개발 PC에서 **참고치**만 나온다 — 시험 하드웨어 기준(Q20 선행분)은 별도 VM이 생기면 그때 고정. R1(최소 권한)·R3(마스킹)·R11 코어 경계·R9/R10 로직 검증은 로컬로 충분.
- 비밀번호 취급(정확히): 스크립트가 `python secrets`로 3종(슈퍼유저·mon·nomon)을 생성해 **① 세션 스크래치패드 파일**(`dbm_pg16_secret.txt`·`dbm_pg16_mon_secret.txt`·`dbm_pg16_nomon_secret.txt`)에 쓰고, ② 슈퍼유저 비밀번호는 `POSTGRES_PASSWORD`로 넘겨 **Docker 컨테이너 환경 설정에도 남는다**(`docker inspect`로 보인다), ③ 역할 비밀번호는 `psql` 세션에만 흘러간다. 이 문서·저장소·커밋·로그에는 평문 비밀번호를 쓰지 않는다. 컨테이너를 지우면 ②도 사라진다.

## 1. 현재 올라가 있는 것

| 이름 | 이미지 | 포트 | 용도 | 비고 |
|---|---|---|---|---|
| `dbm-test-pg16` | `postgres:16`(16.15) | **5436** | R1-PG·R3·WS-3 PG 어댑터 실측 | `shared_preload_libraries=pg_stat_statements`, `track_io_timing=on`, `pg_stat_statements.track=top`, `track_activity_query_size=4096`. **`pg_stat_statements.max`는 기본 5000**(권고 10000 미만 → 검사기가 Q RECOMMENDED를 내는 것을 그대로 확인하려고 두었다) |

> 55432는 Windows Hyper-V 예약 포트 범위(55354~55453)라 바인드가 거부된다 — `netsh interface ipv4 show excludedportrange protocol=tcp`로 확인하고 5436을 썼다.

DB `appdb`, 역할:

| 역할 | 권한 | 기대 capability(§4.2) |
|---|---|---|
| `moveseye_mon` | `LOGIN` + `GRANT pg_monitor` + `CONNECT` | S·L·C OK, Q OK/RECOMMENDED, P UNSUPPORTED → 필수 충족 |
| `moveseye_nomon` | `LOGIN` + `CONNECT`만 | S MISSING·Q MISSING·C RECOMMENDED·L OK → 필수 미충족 |

## 2. 재현 절차 (실제 스크립트는 세션 스크래치패드 `dbm_pg16_up.sh` — 저장소 밖, 아래는 그 전체 흐름)

```bash
#!/usr/bin/env bash
set -euo pipefail
SP="$(dirname "$0")"
# 1) 비밀번호 생성·로드 — 슈퍼유저는 파일이 있으면 재사용(재실행 시 컨테이너 비밀번호와 일치해야 하므로)
PW_FILE="$SP/dbm_pg16_secret.txt"
[ -f "$PW_FILE" ] || python -c "import secrets; print(secrets.token_urlsafe(18))" > "$PW_FILE"
SUPER_PW="$(tr -d '\r\n' < "$PW_FILE")"
MON_PW="$(python -c "import secrets; print(secrets.token_urlsafe(18))")";   printf '%s\n' "$MON_PW"   > "$SP/dbm_pg16_mon_secret.txt"
NOMON_PW="$(python -c "import secrets; print(secrets.token_urlsafe(18))")"; printf '%s\n' "$NOMON_PW" > "$SP/dbm_pg16_nomon_secret.txt"
# 2) 컨테이너 — 있으면 start, 없으면 run
if docker ps -a --format '{{.Names}}' | grep -qx dbm-test-pg16; then docker start dbm-test-pg16 >/dev/null; else
docker run -d --name dbm-test-pg16 -p 5436:5432 \
  -e POSTGRES_PASSWORD="$SUPER_PW" -e POSTGRES_DB=appdb postgres:16 \
  -c shared_preload_libraries=pg_stat_statements -c track_io_timing=on \
  -c pg_stat_statements.track=top -c track_activity_query_size=4096 >/dev/null; fi
# 3) 준비 대기
for i in $(seq 1 40); do docker exec dbm-test-pg16 pg_isready -U postgres -d appdb >/dev/null 2>&1 && break; sleep 1; done
# 4) 확장·역할·표본 데이터 (역할 비밀번호는 매 실행 ALTER로 갱신)
docker exec -i dbm-test-pg16 psql -v ON_ERROR_STOP=1 -U postgres -d appdb <<SQL
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='moveseye_mon')   THEN CREATE ROLE moveseye_mon   LOGIN PASSWORD '$MON_PW';   ELSE ALTER ROLE moveseye_mon   PASSWORD '$MON_PW';   END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='moveseye_nomon') THEN CREATE ROLE moveseye_nomon LOGIN PASSWORD '$NOMON_PW'; ELSE ALTER ROLE moveseye_nomon PASSWORD '$NOMON_PW'; END IF;
END \$\$;
GRANT pg_monitor TO moveseye_mon;
GRANT CONNECT ON DATABASE appdb TO moveseye_mon, moveseye_nomon;
CREATE TABLE IF NOT EXISTS t_demo(id int primary key, v text);
INSERT INTO t_demo VALUES (1,'a'),(2,'b') ON CONFLICT DO NOTHING;
SELECT count(*) FROM t_demo WHERE v = 'a';   -- pg_stat_statements에 행이 생기게
SQL
```

## 3. 실측 테스트 돌리기

`PgCapabilityCheckerLiveIT`(환경변수 없으면 skip):

```bash
export DBM_IT_PG_HOST=localhost DBM_IT_PG_PORT=5436 DBM_IT_PG_DB=appdb DBM_IT_PG_TLS=DISABLED
export DBM_IT_PG_MON_USER=moveseye_mon DBM_IT_PG_MON_PASSWORD='…'
export DBM_IT_PG_NOMON_USER=moveseye_nomon DBM_IT_PG_NOMON_PASSWORD='…'
./gradlew.bat :dbm-collector-core:test --tests 'com.dmove.moveseye.premium.dbm.collector.core.adapter.pg.*'   # LiveIT + 환경 게이트 함께
# 2026-10-26부터 코어는 Gradle 모듈 dbm-collector-core — 루트 `:test`에는 이 테스트가 없다(모듈 태스크로 지정할 것)
```

J1 PG 구현 IT(`DbmJ1PgStoreIT` — 우리 PG, V90 `dbm_*`): 도커 `dmove-postgres-test`(5433)에 `moveseye_it`를 매번 새로 만들어 V1~V90 전량 Flyway 뒤 돈다(`IntegrationTestSupport`). 대상 PG(5436)와는 무관하다.

```bash
./gradlew.bat :test --tests 'com.dmove.moveseye.premium.dbm.*' -Dit.db.required=true   # app ArchUnit 3 + IT 7
# 🔴 `:test`의 콜론을 빼고 `test --tests …`로 돌리면 engine-api·engine-zabbix의 test 태스크에도 같은 필터가 걸려
#    "No tests found for given includes"로 빌드가 실패한다(2026-10-26 실측). 서브모듈 테스트 전체는 `:dbm-collector-core:test`처럼 태스크 경로로.
```

`DBM_IT_PG_TLS=DISABLED`는 컨테이너에 TLS가 없어서다 — 운영 기본은 `VERIFY_FULL`이며, 테스트는 평문 서버에 `VERIFY_FULL`로 붙으면 `TLS/08004`로 분류되는 것까지 확인한다.

**실측·게이트 모드**: `DBM_IT_PG_REQUIRED=true`를 함께 주면 `PgLiveEnvironmentGateTest`가 위 변수 누락을 **skip이 아니라 실패**로 만든다(P0 실측·출시 게이트 실행용). 게이트는 별도 클래스라 **`--tests`에 `adapter.pg.*`처럼 함께 포함**해야 동작한다(LiveIT 한 클래스만 고르면 게이트가 실행되지 않는다). 변수가 없으면 LiveIT는 조용히 건너뛴다 — 그 결과를 "통과"로 읽지 말 것.

## 4. 결과 (2026-10-23, PG 16.15)

| 항목 | 결과 |
|---|---|
| `moveseye_mon` 접속 | ok, 27ms, `PostgreSQL 16.15 (Debian 16.15-1.pgdg13+2)` |
| `moveseye_mon` capability | S OK · L OK · **Q RECOMMENDED**(`pg_stat_statements.max=5000`) · C OK · P UNSUPPORTED · 필수 충족 · notes `pg_monitor=usage` |
| `moveseye_nomon` capability | S MISSING("pg_monitor … NOINHERIT 확인") · L OK · Q MISSING · C RECOMMENDED(복제 지연 비어 있을 수 있음) · P UNSUPPORTED · **필수 미충족** · notes `pg_monitor=none` |
| 실패 분류 | 비밀번호 오류 `AUTH/28P01` · 없는 DB `DATABASE_NOT_FOUND/3D000` · 닫힌 포트(1) `NETWORK/08001` · 평문 서버에 verify-full `TLS/08004` |

소견: ① 권고 미충족이 실제 기본 설치에서 바로 나온다 — 등록 마법사 4단계 문구("적으면 dealloc으로 Top SQL 누락")가 첫 고객에게 보일 가능성이 높으니 지원표·가이드에 `pg_stat_statements.max=10000` 권고를 명시. ② 권한 없는 계정도 접속·L은 되므로 "접속 성공 ≠ 설정 완료" UX(§4.2)가 필수라는 전제가 실측으로 확인됐다.

## 5. 다음 환경(미착수)

MySQL 8.0(이미지 있음)·MariaDB 10.11·SQL Server 2022 Dev·Oracle XE 21c — 각 어댑터 Phase(P1b·P2) 직전에 같은 방식으로 추가. R9 버전별(2016·2019)은 Docker 이미지가 없어 VM 게이트.

## 6. 정리

```bash
docker rm -f dbm-test-pg16      # 데이터 포함 삭제(볼륨 미사용)
```
