---
date: 2026-10-22
project: moveseye
tags: [moveseye, premium, db-monitoring, datadog, codex, design-review, jdbc]
---

# Datadog DBM 전수 대조로 DB 모니터링 설계 v1.2 — "기능은 따라가되 설치·권한 모델은 따라가지 않는다"

사용자: "Datadog Database Monitoring 문서 보면서 DB 모니터링 설계하고, 무엇을 볼 수 있는지 알려주고, 과정 중에 코덱스랑 협의".

## 한 일
1. Datadog DBM 문서 전수(개요·Query Metrics·Samples·Databases·Schemas·Recommendations·APM 연동·가이드 7종·엔진별 setup/troubleshooting·integrations-core `conf.yaml.example`·`metadata.csv`) → `_workspace/features/premium/db-monitoring/research_datadog-dbm-2026-10-22.md`(화면·수집 주기·권한·메트릭 전수 + 격차 표 G1~G38).
2. **코덱스 1차 협의**(gpt-6.1-sol/high, 읽기 전용): 격차 표 전건 판정 + 심층 6건(PG EXPLAIN 권한·system_health·Oracle 뷰/RAC·PG DB별 접속·라이선스 상한·custom_queries) + 놓친 격차 G39~G49 + 사실 오류 표 + Q22~Q30 + 공수.
3. 설계서 **v1.2**(D13~D16·§4.4~4.6·§15 반영표·부록 B·Q22~Q30·Phase 299~405) → **코덱스 2차 검수**(델타 정합).

## 핵심 발견
- **PG `EXPLAIN`(ANALYZE 없이)도 실행기 `ExecCheckPermissions`를 거친다** — 모니터링 계정(`pg_monitor`)으로는 타인 업무 테이블 SELECT의 EXPLAIN이 안 된다. MySQL `EXPLAIN`도 실행 권한과 동일. Datadog이 SECURITY DEFINER 함수를 요구하는 이유가 이것. → GA 플랜은 **Oracle·MSSQL 캐시 플랜만**(D13).
- Datadog은 세 엔진에서 **전용 DB 객체**(PG 함수 2·MySQL 프로시저 2·Oracle `dd_session` x$ 뷰·MSSQL XE 세션)를 만든다. 우리는 안 만든다(D14). "선택 패키지로 승인 항목 3번째"라는 내 1차 안은 코덱스가 "별도 승인 경로를 만드는 제품 결정, 기본 OFF로 심사 책임이 줄지 않음"으로 반대 → 철회.
- **PG `pg_stat_statements`는 한 DB 접속으로 서버 전체** 통계·텍스트를 본다. DB별 접속은 relation·스키마 작업만 → namespace 순회 계약(기본 ≤10 DB·예산) 분리(D15).
- 내 사실 인용 오류 4건: "Datadog RAC는 GV$ 안 쓴다"(원문: 노드별 V$ + 필요 시 GV$) · "system_health는 VIEW SERVER STATE만"(2022+는 PERFORMANCE STATE) · "2012·2014 데드락 불가"(Datadog SQL의 `AT TIME ZONE` 제약) · "Oracle actual rows는 STATISTICS_LEVEL=ALL만"(`GATHER_PLAN_STATISTICS`도).
- Datadog 운영 수치(참고값): Top 200/10s·샘플 1s(Oracle 10s)·플랜 60/h/query·15/h/plan·설정 600s·스키마 300 tables/50 cols·오버헤드 CPU ~1%(Oracle 0.2%)·보존 15개월/15일·식별자당 과금·Agent당 ≤30 인스턴스.

## 교훈
- **타사 문서를 설계 근거로 쓸 때는 요약(WebFetch 응답)이 아니라 원문 문장을 다시 확인한다.** 요약 단계에서 "only when necessary"가 "안 쓴다"로 바뀌었다. 코덱스가 네 건을 잡지 않았으면 Q3 추천이 틀린 근거 위에 섰다.
- 격차 표의 비용 판정 "낮음"은 권한·플랫폼 분기·중복 제거·유실 표시를 세어 보기 전엔 쓰지 말 것 — 코덱스가 절반을 "중"으로 올렸다.
- 협의는 **내 1차 안을 먼저 적고 코덱스가 반대할 자유를 주는 형식**이 효과적이었다. 반대 2건(선택 패키지·SECURITY DEFINER)이 설계 방향을 바꿨다.
- 조사 기록 머리에 "v1.2에 반영"이라고 미래 작업을 완료형으로 쓰면 검수자가 혼동한다 — "협의 뒤 작성"으로 고쳤다.

## 다음
사용자 Q1~Q30 확정(핵심: Q12 원격 실행형·Q13 만료 후 조회·**Q22 maxDbTargets**·**Q26 PG/MySQL 플랜 프로필**·Q27 namespace 상한·Q3/Q29 RAC) → P0 R1~R10. 코덱스 2차 검수 잔존 🔴 반영.

관련: [[2026-10-19-db-monitoring-design]] · [[프리미엄-GPU-DB-모니터링]] · [[2026-08-06-license-kernel-design]]

## 추가(같은 날 오후) — v1.3 §16 인사이트 카탈로그 + 코덱스 3차 검수
사용자가 "Zabbix로 수집하는 것과 그 외" / "고객 종속성, OTel 또 필요한가" / "Redis는 안 되나" / "어떤 인사이트를 주나"를 묻고 구두 답변 뒤 "설계서 작성하고 코덱스 검수 받게 해" → 설계서 **§16**(인사이트 카탈로그 I1~I19 → 검수 뒤 I28까지 · 수집 경로 역할 표 · 고객 환경 종속성 매트릭스 · 비범위 저장소 근거 · 보증하지 않는 것 10개 · Q31) 신설, 코덱스 3차 검수(`review_db-monitoring-v1.3_codex.md`).

- **3차 판정 🔴 10건(R1~R10)**: "새 결정 없음·재배열만"이라 썼지만 **표준 프로필 가명화 OFF(새 기본값)·관리형 DB 포괄 지원·Oracle 데드락 카운터 확정·태그 귀속에 APM 조건·MongoDB "Tibero 다음·10일"(새 견적)·"카운터 전부 15s"·"사전 점검 전부"·"미사용 인덕스 후보"(Q23 초과)·tracked SQL P1a(실은 P3)·`MISSING`/`UNSUPPORTED` 혼용**. 전건 같은 날 반영, §16 성격 문구를 "재배열 + 신규 미결 제안 Q31 포함"으로 정정.
- **교훈 3**: 구두 설명(비유·추천·기본값·견적)을 설계서로 옮기면 그 자체가 새 계약이 된다 — 행마다 본문 근거 절을 붙이고, "확인된 사실"과 "제품 판단"을 다른 열에 둘 것. 코덱스가 Redis `INFO commandstats`·Zabbix 템플릿 slowlog **건수**·MongoDB `locks`≠L 같은 사실 과장도 공식 문서로 잡았다.
- **운영 교훈**: 코덱스 백그라운드 실행 중 세션이 끝나면 `-o` 결과 파일이 안 생긴다. `codex_run*.log`에 중간 판정이 남으니 재실행 전에 읽고 먼저 반영(I9·I15 Phase 2건을 그렇게 고침).

## 추가(같은 날 저녁) — v2.0→v2.1 착수본, 코덱스 4차, ZM-172 첫 코드
- 사용자가 Q22·Q26·Q27·Q3(+Q29)·Q12·Q13을 "추천대로" 확정 → **D17~D22**. 조건부 추천("망분리 금융이 1차 타깃이면")의 포함안을 채택해 **원격 실행형 수집기(J2)를 GA에 편입**(§3.6 신설, GA 324~440). 코덱스 4차가 "설계 선택과 확인된 고객 사실의 출처를 구별하라"고 짚어 D20·D21 근거 문구를 고쳤다.
- **코덕스 4차 🔴 7건(V4-1~7)**은 전부 J2 제어·보안·복구 계약의 공백(lease API·소유권 세대·`run_id`·전송 전 보호·키 4종 수명주기·`observed_at` vs 수신 시각·epoch 전역 유일·ACK 뒤 큐 삭제·P0 종료 게이트·RAC "모의≠인증")이었다. §3.6을 표 20행으로 보강하고 **🧪 = P0 시험 가정** 표기를 도입 — "운영 계약"과 "시험 가정"을 한 표 안에서 구별하는 방법.
- **ZM-172 워크트리**(`C:\worktrees\zm-172-{be,fe,license}`)에서 P0 코드 중 계약 미확정에 영향 없는 것만: `maxDbTargets` 클레임(양쪽 ContractTest), `collector/core` spi 6종 + ArchUnit(코어는 Spring·JPA·PG·다른 moveseye 금지), 4방언 마스킹 토크나이저(39 fixture, 잔존 검사 정규식 이중화), PG 접속 분류·권한 검사, `/dbm/targets/test-connection`·`/check-capabilities`. Flyway·엔티티는 공통 계약 🧪 해소 뒤.
- 교훈 4: **코덱스 결과를 코드 착수 전에 읽는 순서가 맞았다** — 4차가 "P1a 기준 승인 보류"라 한 덕에 Flyway·엔티티를 미루고 계약 무관한 조각(토크나이저·spi·클레임)부터 썼다. 테스트의 "잔존 검사" 정규식도 바인드(`:1`)를 리터럴로 오판해 한 번 고쳤다 — 보호망도 fixture다.

## 추가(10-23) — 5차 반영 커밋, P0 착수: 로컬 PG16·R1 실측·계약 시험본·코어 폴러 프레임
- 코덱스 5차 🔴17·🟡15 반영을 2차 커밋(BE `94c9115`·발급기 `16cfa81`)으로. 반영 중 **토크나이저 리팩터 회귀**(식별자 소비를 메서드로 뽑으면서 첫 글자 무조건 전진이 빠져 `:id`에서 85분 무한 루프) — 주 루프에 "전진 없음 → 폐기" 가드를 넣었다. 교훈 5: **스캐너 리팩터는 '모든 분기가 i를 전진시킨다'를 가드로 강제**하고, 테스트 타임아웃(JUnit `@Timeout` 또는 Gradle `timeout`)을 토크나이저 테스트에 둔다.
- Q9 시험 환경: 사용자 VM 승인을 기다리지 않고 **개발 PC Docker(이미 dev/test PG가 Docker)**에 `postgres:16`(5436)을 올렸다. 55432는 Windows Hyper-V 예약 포트라 바인드 거부 — `netsh interface ipv4 show excludedportrange`로 확인. 비밀번호는 스크래치패드에만.
- R1-PG 실측(`PgCapabilityCheckerLiveIT`, 환경변수 게이트): 권한 있는 계정 S·L·C OK, **Q RECOMMENDED**(기본 `pg_stat_statements.max=5000`), 권한 없는 계정은 접속·L은 되지만 S·Q MISSING → "접속 성공 ≠ 설정 완료" UX 전제가 실측으로 확인. 실패 분류 AUTH/28P01·3D000·08001·TLS 08004 전부 일치.
- §17.1 순서 2 **계약 시험본** `contract_db-monitoring.md` — 코드 record를 wire 필드 정본으로 삼고 🧪(시험 가정)와 계약을 행마다 구별. WS-2 **코어 폴러 프레임**(`CollectorRuntime`): 스레드 없이 `tick(Lane)`만 — J1/J2가 같은 바이트코드. 메모리/파일 구현 9 시나리오로 P1a DoD 증명.
- 교훈 6: **lease 재획득과 seq** — 같은 epoch를 재획득했는데 seq를 0으로 되돌리면 서버 멱등이 DUPLICATE로 버려 "조용히 아무것도 안 쓰는" 상태가 된다. 테스트가 60s 간격 tick(TTL 30s 초과)으로 그걸 잡았다. 규칙을 "비어 있는 lease는 누가 가져가든 새 epoch, 같은 epoch 재획득은 seq 유지"로 고정.
- 다음(10-26 갱신): 3차 커밋 `ed3b665` 완료(모듈 분리+8차 반영) → Flyway V90(`dbm_target`·endpoint·credential·capability·sample_batch·delta_checkpoint) + J1 PG lease/writer 구현(WS-1/WS-2 이월) → WS-3 PG 세션·락·카운터·Q 어댑터 → master rebase(`5599fa8`).
- (저녁) **코덱스 6차 "커밋 보류"(🔴18)** — 핵심은 ① 배치 저장과 checkpoint 저장이 분리돼 "커밋 뒤 ACK 유실 → 옛 기준값으로 겹치는 델타를 새 seq로 재전송 → 서버 멱등이 못 거름"(100+150=250 vs 실제 150) ② 레인이 한 잠금을 공유해 slow Q가 fast 세션을 막음 ③ 재시작 뒤 이어 쓰기가 §5.4 baseline 규칙과 다름 ④ 계약 시험본의 거부 사유·중단 정책 충돌. 전건 반영: `BatchWriter.write(batch, checkpoint)`로 **원자성을 시그니처로 강제**, 3단계 잠금(prepare→잠금 밖 채집→쓰기 직전 재검증), `continuity`+`resumeAcrossRuns`, `WriteResult.Reason` 구조화, AUTH 정지·백오프, wall/monotonic 분리. 설계 §5.2 lease 정본을 코덱스 B 판정대로 개정. 테스트 20건(실제 스레드 동시 레인 포함) 116건 통과, 7차 재검수 요청.
- 교훈 7: **5차에서 "Javadoc에 원자성 경계를 적는다"로 넘긴 #22가 6차 🔴#1로 돌아왔다.** 설계가 요구하는 불변식(원자 커밋·fencing과 저장의 동일 경계)은 문서가 아니라 **인터페이스 시그니처와 테스트(커밋 뒤 예외 주입)**로 강제해야 다음 구현자(J1 PG writer·J2 큐)가 어길 수 없다.

## 추가(10-26) — 코어를 Gradle 모듈 `dbm-collector-core`로 분리, 8차 검수는 상위 모델

- 사용자 질문 흐름: "수집기는 어떤 거냐, 별도 모듈이냐" → "Zabbix에 저장하냐"(아니오, 우리 PG `dbm_*`) → "오픈소스 베이스냐"(아니오, JDBC 드라이버만 외부·Datadog/PMM은 참고) → "JDBC 꽂아서 확인하는 거지? APM 트레이스와 차이는?"(APM=앱 쪽 "무엇이 느렸나", DBM=DB 쪽 "왜 느렸나"·비계측 세션까지) → **"별도 패키지로 구성해야 할 것 같은데" → 동의·실행**.
- 설계는 "P3b에서 물리 분리"였지만 지금이 가장 싼 시점(외부 import 0, 소비자 3파일, 미커밋). 패키지명 유지·`git mv`·프로덕션 의존 0 모듈·Dockerfile COPY·ArchUnit 이원화(모듈 3규칙/app 2규칙). 모듈 124건·bootJar 포함 확인.
- 검수는 사용자가 "상위 모델"을 지정 → `gpt-6-astra` high(이 작업 한정). 결과 `review_zm172-code4_codex.md`: **보류** — 모듈 분리는 전 항목 OK, 런타임 🔴 4(해시 전 직렬화 충돌·옛 설정 응답이 새 거부 삭제·ACK 대기 중 만료 뒤 다음 SQL 시작·옛 자격증명 조회가 새 AUTH 정지 해제). 전건 반영, 테스트 4건 추가(128).
- 교훈 10: 6~8차 🔴의 공통 패턴은 **"잠금 밖에서 읽은 값을 잠금 안 상태에 적용"** — 설정·자격증명·writer 응답 모두. 읽기 전 세대(generation·suspendSeq·token)를 캡처해 적용 시 비교하는 것이 정답이고, 한 곳에 넣었으면 같은 모양의 다른 곳(config, secret, ack)에도 바로 넣어야 다음 회차에 같은 지적을 안 받는다. 교훈 11: "해시를 SHA-256으로" 지적은 해시 **입력**이 단사인지까지 닫아야 해소다.
- 교훈 8: **"나중에 분리"는 비용이 늘기만 한다** — 의존이 0인 순간에 모듈로 떼면 경계가 리뷰 규칙(ArchUnit)에서 컴파일로 올라간다. 교훈 9: 모듈 분리 뒤 **문서의 실행 명령**(`:test` → `:dbm-collector-core:test`)을 같은 커밋에 고치지 않으면 LiveIT가 조용히 사라진다.

## 추가(10-26 저녁) — rebase + J1 PG 구현 + V90

- 3차 커밋 뒤 사용자 "진행해" → ZM-172를 master에 rebase(충돌 0, 겹친 파일 3개가 전부 다른 hunk) → `premium.dbm.collector.j1`에 PG lease/writer/checkpoint, Flyway V90 `dbm_core`(표 7개), 실 PG IT 7건.
- 설계 선택: lease는 **UPDATE 한 문장**(판정·증가·RETURNING, DB 시계), writer는 **대상 행 `FOR SHARE`**로 소유권 검증과 INSERT를 한 트랜잭션에(인계 UPDATE가 커밋을 기다림, 같은 대상의 두 레인은 서로 안 막음), 멱등은 `ON CONFLICT DO NOTHING RETURNING` 뒤 digest 비교(예외로 트랜잭션 안 깸).
- 교훈 12: 모노레포 루트에서 `gradlew test --tests 필터`는 **모든 서브프로젝트의 test**에 필터를 걸어 매치 없는 모듈이 "No tests found"로 실패한다 — `:test`로 루트만 지정. 교훈 13: 메모리 시험 구현에 있던 "계약 함수"(payload digest)는 app이 그 패키지를 못 쓰게 막아 둔 순간 spi로 올라와야 한다 — 금지 규칙이 설계 누락을 드러냈다.

## 추가(10-27) — 보존 규칙 v2.5: APM/Zabbix 계단 + 공통 구현체 추출

- 사용자 질문 연쇄 "보관 규칙 정의했음?" → "APM·다른 서비스와 동일하게?" → "디스크 예산 넷(상한 GB·최소 보장·수집 자동 완화·사건 보호) 냉정히 필요한가?" → "보관 의무 있으니 추세로 뭉치고 기본 일수" → "공통 구현체 두고 확장". 결정: 원본 2일 → 1m 7일 → 5m 30일(신설) → 1h 400일(min·max·sample_count) → 사건·차원 400일. **§6.3 디스크 예산 정책 삭제** — 자동 단축을 안 하면 코덱스 🔴8 지적의 성립 조건이 사라진다. 남는 진짜 위험은 "우리 PG 디스크 꽉 참 = MovesEye 전체 정지"인데 이건 DBM 정책이 아니라 서버 디스크 감시 한 건(설치 가이드 + 공용 가드 백로그).
- 용량 어림을 다시 뜯어보니 무게는 5초 원본(10%)이 아니라 **1분 집계 30일 + Top SQL 매분 200개**였다 → 계단·Top N 조정으로 50대상 130~175GB → 85~95GB.
- 코드: APM `ApmPartitionService`·`ApmRetentionPolicy`·`ApmRetentionJob`·`ApmRetentionDays`의 구현체를 `premium.common.{partition,retention}`으로 추출하고 APM은 표 목록·메트릭 게이트만 남은 껍데기로(공개 API·테스트 불변, 141건 통과). DBM은 `DbmRetentionDays/Service/Job` + V91 `dbm_retention`(배치 7일·checkpoint 30일 DELETE)만 얹음.
- 교훈 14: **"APM과 같이"라는 결정은 값이 아니라 메커니즘에 먼저 적용**하라 — 정본 위치(잡 options)·삭제 방식(파티션 DROP/DELETE)·실패 격리·조회 경계(`oldestAvailableMs`)가 같아야 운영자가 한 모델로 이해한다. 값(며칠)은 데이터 성격대로 달라도 된다.
- 교훈 15: 보존 장치를 더할 때 "그 장치가 없으면 어떤 사고가 나나"를 먼저 묻는다 — 자동 단축이 없으면 최소 보장 일수·사건 보호는 존재 이유가 없었다. 검수 지적(🔴8)에 장치를 더해 답하는 대신 **지적의 전제를 없애는** 쪽이 단순했다.
- 교훈 16: 공통 추출 시 ArchUnit의 "문자열 위치" 규칙(`DROP TABLE`은 한 파일에만)이 **javadoc 문구까지 잡는다**(main 소스 regex). 설명 주석에 금지 문자열을 쓰지 말 것 — 첫 실행에서 그걸로 1건 실패.

## 추가(10-27 오후) — WS-2 잔여: J1 폴러가 돈다(스케줄러·ConfigSource·SecretResolver·상태 EP)

- 5차 커밋(`75ace5e`) 승인 뒤 "ㅇㅇ ㄱㄱ"로 WS-2 잔여 착수. `DbmPollerManager`(fast/slow 레인 스레드, `SmartLifecycle` 종료 시 lease 반납) · `PgConfigSource`(BE 대상 30s 캐시 + **라이선스는 매 호출 → 거부 스냅샷**) · `CodecSecretResolver`(캐시 없음) · `GET /dbm/poller/status`. 실 PG IT 12건 — 라이선스 `active=false`로 바꾸면 다음 tick에 lease 전부 반납, 되돌리면 새 epoch로 재개까지 단언. DBM 42건 통과, 6차 커밋 `5e33e0e`(미푸시).
- 결정: 라이선스 차단은 **스케줄러가 아니라 설정 출처**에서(J2와 같은 거부 envelope, 전이 로직이 코어 한 곳). `scheduler_setting(dbm_poller)` 스위치 행은 심지 않음 — `SchedulerManager`가 bean 없는 행마다 기동 WARN을 내서 "상주 잡" 표현과 함께 WS-4로. 디스크 큐는 J1에 불필요(우리 PG가 죽으면 lease도 30s 안에 끊긴다) → J2(P3b)의 것으로 확정.
- 교훈 17: **"스레드 두 개 + tick()"처럼 로직이 코어에 다 있을 때는 자동 실행을 IT 프로필에서 끄고(`auto-run=false`) tick을 직접 부른다** — 스레드가 끼면 lease를 누가 잡았는지 비결정이 되고 다른 IT의 표에 FAILED 배치가 끼어든다. APM `zbx-command.auto-run`과 같은 패턴.
- 교훈 18: 테스트 JVM이 `insufficient memory for the Java Runtime Environment`(native malloc)로 죽고 Java 프로세스는 작다면 **다른 프로세스가 커밋을 다 썼다** — 이번엔 다른 Claude 세션의 폭주 `grep -o … {0,2500}`이 42GB. `Get-Process | Sort WS` 한 번이 Gradle 설정을 뒤지는 것보다 빠르다.

## 추가(10-27 저녁) — WS-3 1단계: PostgreSQL 어댑터, J1이 실 PG를 처음 끝까지 긁었다

- 코어 `adapter/pg/`에 S·L·C·Q 수집기 + `PgSqlText`(텍스트 보호 한 지점) + `DeltaWindow`(순수 차분). 실 PG16(5436) LiveIT 4건 — 다른 접속이 실행 중인 SQL이 세션 행으로(리터럴 `?`), advisory lock 대기가 waiter→blocker 간선과 idle blocker 행으로, 카운터·Top SQL은 baseline→델타. 앱 IT `realTargetCollects`: 한 tick에 4 kind가 우리 PG `dbm_sample_batch`까지 — 7차 커밋 `b576f18`.
- 교훈 19: **`pg_stat_statements`의 텍스트는 `$n` 정규화**다. 마스커는 바인드 마커를 자리표시자로 보존하므로 같은 SQL의 세션(`?`)·Top SQL(`$n`) fingerprint가 다르다 — S↔Q 연결 키는 `query_id`(14+)이고 fingerprint로 조인하려 들면 영원히 안 맞는다. LiveIT 첫 실행에서 기대값 `?`가 틀려 드러났다.
- 교훈 20: PG 누적 통계(`pg_stat_database`)는 비동기 flush(~1s). "직전 커밋이 다음 관측 델타에 보인다"는 단언은 flaky — 델타 메커니즘은 순수 테스트(`DeltaWindowTest`)로, 실 PG는 baseline→행 전이와 모양만.
- 교훈 21: Q 리셋 판정은 두 겹이어야 한다 — dealloc 뒤 재등록된 native 하나의 감소에 전체를 baseline으로 떨구면 `pg_stat_statements.max`가 작은 서버(기본 5000)에서 Top SQL이 60초마다 비어 버린다. native 단위 제외 + 전역 리셋(stats_reset·절반 이상 감소)으로 가른다.

## 추가(10-27 밤) — WS-3 2단계: typed 파티션 표, 임시 jsonb 표 제거

- V92 — 차원 3표(fingerprint·사용자/DB/client/app·native) + 사실 4표 일 파티션(세션 2일·락 2일·카운터 1m 7일·Top SQL 1m 7일). `DbmPartitionService`는 공통 `DailyPartitionService` 껍데기(표 목록만), 행 매핑은 `PgTypedRowStore` 한 곳. `dbm_retention` 단계 6개로 §6.1 계단의 원본·1m·차원이 실제로 지워진다. 8차 커밋 `a0d28d6`. DBM 46 + ArchUnit 17 통과.
- 교훈 22: **사실 표에 FK를 두지 않으면 테스트 격리도 달라진다** — `delete from dbm_target`이 더는 사실 행을 지우지 않아 전역 `count(*)` 단언이 다른 IT의 행에 깨졌다. 사실 표는 대상 스코프 count 또는 BeforeEach 비우기. 설계 선택(대상 삭제 CASCADE 폭주 방지)의 대가를 테스트가 먼저 알려준다.
- 교훈 23: `Map.of()`(불변 맵)에 `get(null)`은 NPE — 행에서 없는 키를 lookup 키로 쓰기 전 null 가드. 어댑터 행은 "없는 값은 키 생략"이라 어디서든 null 키가 올 수 있다.
- 교훈 24: 1m 집계는 **쓰기 시점 UPSERT**(count+1·sum+·min·max)로 끝내고 롤업 잡은 5m/1h만 — 15초 관측 4개를 분 버킷 한 행에 접는 데 잡이 필요 없고, 잡이 죽어도 1m은 항상 최신이다.

## 추가(10-28) — WS-1 대상 관리 API + 코덱스 9차(8커밋 전체) 🔴 9

- 사용자 "ㅇㅇ ㄱㄱ 작업 착수하고 지금까지의 작업 코덱스 검수 받아" → WS-1 구현과 9차 검수를 병행. WS-1: `DbmTargetAdminService`(등록·수정·삭제·자격증명·저장된 자격증명 권한 검사·활성화 admission·라이선스 사용량), `DbmSecretCodec`(`enc:v2:<keyId>:`), `LicenseStatus.maxDbTargets`, 컨트롤러 10 EP. 110 테스트 통과(실 PG16 활성화 end-to-end). 미커밋 — 9차 검수가 "WS-1 전 🔴 9 수정"을 냈고 4연속 보류라 멈춤 규칙 적용, 사용자 결정 대기.
- 9차(gpt-6.1-sol high, 커밋된 코드 대상이라 판정 어휘를 "WS-1 전 수정/함께/참고"로 바꿔 요청): 🔴 N1 lease `now()`가 잠금 대기 뒤에도 문장 시작 시각 · N2 `stop()` 뒤 진행 중 tick이 새 대상을 처리(세대 미무효화) · N3 전역 fingerprint UPSERT 정렬 없음(APM 1m 데드락과 같은 구조) · N4 Top SQL에 nested 문장 섞임 · N5 eviction 때 `otherComplete=true` · N6 1m 표에 노드 식별 없음 · N7 C `intervalMs` 유실 · N8 파티션 보장이 외부 tx에 참여 · N9 짧은 `dimensionIdleDays`로 참조 중 차원 삭제. 정정 받은 것: Q checkpoint는 8,000행이 아니라 jsonb 한 행 · 1m UPSERT는 단일 레인+lease로 직렬화돼 전역 차원만 교착 후보.
- 교훈 25: **"커밋된 코드" 검수는 판정 어휘를 바꿔 요청해야 한다** — "커밋 보류"는 의미가 없으니 "다음 커밋 전 수정 / 함께 / 참고"로. 그래도 연속 보류 규칙은 그대로 적용된다(6·7·8·9차).
- 교훈 26: **JWT 토큰에는 username이 없다**(`id`·`userid`·`userRole`·`roleid`만) — `@CurrentUser`의 `getUsername()`은 MockMvc IT에서 null. 감사 행위자는 `userid`(Zabbix 연결 계정) 또는 `user#<id>`.
- 교훈 27: record 생성자에 필드를 더할 때 `grep "new LicenseStatus("`는 멀티라인 호출(`new com.…LicenseStatus(\n`)을 놓친다 — 6곳으로 보였지만 10곳. 컴파일 오류로 찾는 게 빠르다.
- 교훈 28: 전역 UPSERT(대상 스코프 밖 표)는 lease가 보호하지 않는다 — fingerprint 차원처럼 두 노드가 같은 행을 만질 수 있는 표는 배열 입력을 **키 정렬** 뒤 보내야 교착이 없다(APM 1m 데드락과 같은 교훈을 다른 자리에서 다시 맞을 뻔함).
- 사용자 결정 A(안정화 먼저) → 9차 `b6f622f`(N2·N3·N4·N5·N8·N9 + 재현 테스트 6) → 10차 `b8c528c`(WS-1). N1은 계약 §1.10 전제로, N6·N7은 WS-10 V93으로. 코어 142·앱 113 통과.
- 교훈 29: 연속 보류 때 "전부/일부/안 함"을 비용 묶음으로 나눠 제시하면 결정이 빠르다 — 지적 9건을 "소 5·중 1·스키마 2·이월 1"로 묶자 한 글자("A")로 끝났다.
- 10-28 시간순 작업 이력(커밋 10·검수 9·결정 6)은 [[2026-10-28-db-monitoring-worklog]]로 분리.
- 10-28 ZM-172 10커밋을 master `df1b39f` 위로 rebase 뒤 ff 병합(HEAD `b8c528c`, 미푸시). 충돌은 `application-it.yml` 한 곳(양쪽 추가 블록, 둘 다 유지). 해시는 재부여됨 — 이력은 [[2026-10-28-db-monitoring-worklog]].
