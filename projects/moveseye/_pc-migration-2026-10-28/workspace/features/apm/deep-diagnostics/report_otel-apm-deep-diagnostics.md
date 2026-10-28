# APM 심층 진단 Java 확장 R0/M1b 구현·검증

- 작업: Codex / 2026-10-28
- 범위: `C:/worktrees/apm-deep-otel` 독립 worktree. 원본 확장·공유 Collector·BE·FE·DB는 변경·재기동하지 않음.
- 기준: `devdesign_apm-deep-diagnostics.md` v0.2 §6·§7·§12.
- 상태: 확장 0.3.0 구현, 최종 Gradle 테스트 및 최종 JAR의 실제 기능 왕복 완료. **R0 기능 실증은 통과했으나 운영 지원 게이트는 미통과**.

## 구현

- SDK resource customizer에서 시작별 `moveseye.process.run_id` UUID 생성. 기존 전용 ActiveRequest Meter가 SDK 최종 resource를 복사하는 경로 유지.
- 독립 `HTTP_SERVER` OperationListener·OTel Context token. ActiveRequest OFF에서도 별도 수집 가능.
- `InstrumentationModule` + 모듈별 `ISOLATED` non-inlined advice. HikariDataSource public `getConnection()`·`getConnection(String,String)`만 계측, 내부 HikariPool/외부 wrapper에 중복 hook 없음.
- `System.nanoTime()` 경과 측정 및 공통 epoch 기준점 변환. request 종료·TTL 이후 token 쓰기 차단.
- 임계 10ms 이상 중 진입 순서 앞 16구간. async 역순 완료도 앞 순서를 보존. 나머지 완료 시도는 누적/최대/생략 건수에 반영.
- `attempts = retained + below_threshold + detail_dropped + unfinished`를 원자 snapshot으로 유지. overflow는 모순된 summary를 내보내지 않고 폐기.
- sampled trace의 실제 SERVER를 부모로 INTERNAL/UNSET 구간 + 0-duration summary. 고객 예외·return을 수정하지 않음.
- 동시 token 10,000 / TTL 10분 / pool weak registry 1,024개 / JVM 200 spans/s·burst400·추정256KiB/s. 최종 SDK resource 문자열 길이와 정형 span 크기를 예산에 포함하며 전체 묶음 예산 실패 시 summary 포함 생략.
- 민감 문자열을 진단 속성으로 만들지 않음. poolUid는 JVM 내 무작위 UUID. SQL/URL/사용자명/비밀번호/예외 메시지 없음.

## 생산자 계약

설계 §7 그대로이며 모든 숫자는 OTLP intValue(Long), 모든 숫자 attr에 `moveseye.diag.` 접두사를 적용한다.

| 항목 | 값 |
|---|---|
| resource | `moveseye.process.run_id` UUID |
| 공통 | `moveseye.diag.version=1`, `moveseye.diag.request_span_id` = parent SERVER spanId |
| 구간 | name `moveseye.pool.acquire`, kind INTERNAL, status UNSET, kind attr POOL_ACQUIRE |
| 구간 attrs | `pool_uid`, `outcome=SUCCESS/TIMEOUT/ERROR`, 선택 `related_span_id` |
| summary | name `moveseye.diagnostics.summary`, INTERNAL/UNSET, kind attr REQUEST_SUMMARY |
| summary 숫자 | `attempts/acquire_total_ns/acquire_max_ns/retained/below_threshold/detail_dropped/unfinished/threshold_ns` |
| summary 범위 | `coverage=SUPPORTED_HOOKS_ONLY`, `extension_version` |

설정 접두사는 `moveseye.diagnostics.`이며 `enabled=false`, `max-active=10000`,
`token-ttl-millis=600000`, `threshold-millis=10`, `spans-per-second=200`, `burst-spans=400`,
`bytes-per-second=262144`가 기본값이다. TTL·수량·전송 한도는 낮출 수만 있다.
README에 설치/해제·한계·시험 스크립트를 기록했다.

## 실제 고정 조합

| 구성 | 실물 확인 |
|---|---|
| OS | Windows 개발 머신 |
| JDK | Oracle JDK 17.0.12+8-LTS-286 |
| Agent | `C:/solutions/_tools/otel/opentelemetry-javaagent-2.31.1.jar` |
| Collector | `otelcol-contrib version 0.159.0` |
| Spring Boot / Tomcat | 3.3.5 / 10.1.31 |
| HikariCP / H2 | 5.1.0 / 2.3.232 (fixture pin) |

공식 근거: [Agent 2.31.1 InstrumentationModule](https://github.com/open-telemetry/opentelemetry-java-instrumentation/blob/v2.31.1/javaagent-extension-api/src/main/java/io/opentelemetry/javaagent/extension/instrumentation/InstrumentationModule.java),
[Hikari 5.1.0 public 획득 경로](https://github.com/brettwooldridge/HikariCP/blob/HikariCP-5.1.0/src/main/java/com/zaxxer/hikari/HikariDataSource.java),
[Collector 0.159.0 redaction 설정](https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/v0.159.0/processor/redactionprocessor/config.go).

## 검증 기록

1. `compileJava :testapp:dependencies --configuration runtimeClasspath`: 통과. 실제 pin 의존성 확인.
2. `:test :jar`: 기존+신규 **31개 통과**, 경합 benchmark 1개 skip. 단위 테스트 XML은 `build/test-results/test/`.
3. `:testapp:bootJar`: offline은 H2 JAR 미캐시 때문에 실패, online 재실행 성공.
4. classloader·strict exporter 수정 뒤 `:test :jar :testapp:bootJar`: 32개 통과, benchmark 1개 skip. 당시 산출물은 뒤이은 R0에서 hook 설정 문제를 추가 발견했으므로 최종 산출물로 사용하지 않는다.
5. `scripts/compile-diagnostics-r0.py`: javac heap128MiB로 독립 `build/r0-manual/moveseye-otel-extension-0.3.0-r0.jar` 생성. SHA-256 `08b1cfd0000f23350aa68d4e2cd03cb2ea64ccfccf1852c45c72dc6172070d55`. 이 임시 JAR의 source hash 목록은 `build/r0-manual/manifest.json`이다.
6. 최종 소스 `:test :jar :testapp:bootJar --offline --no-daemon --max-workers=1` 빌드 성공(3분 20초). **34개 통과, 선택형 benchmark 1개 skip**. Gradle JVM heap512MiB, 테스트 JVM heap256MiB. 최종 JAR는 `C:/worktrees/apm-deep-otel/build/libs/moveseye-otel-extension-0.3.0.jar`, SHA-256 `947021710a764d0a95e5150aff827d5cb5cc9b2439fbbc29d19f6d905c7f5ada`이다. 아래 초기 R0 JAR와 구별하며 최종 소스에는 cross-trace/중복 callback 격리, 최종 resource 크기 추정, budget 시간 역행 방어를 포함한다.

다음 표의 경로는 `C:/worktrees/apm-deep-otel/build/diagnostics-r0/` 하위다. 모두 공유 포트가 아닌
14318/13301로 시험했고 각 실행의 `command.json`, `responses.json`, `traces.jsonl`, `metrics.jsonl`,
`analysis.json`을 보존했다. HTTP 응답은 성공·timeout·오류·overload·async 모두 fixture의 원래 결과를 유지했다.

| 조건 | 실제 결과 | 증거 폴더 |
|---|---|---|
| ON + ActiveRequest ON | 46 spans = 일반15 + summary12 + interval19, failures0 | `on-active-20261028-153754` |
| 앞16·임계·카운터 | slow attempts40 = retained16 + below20 + dropped4 | 위 ON의 `analysis.json` |
| 종료·async | async attempts2, unfinished attempts2 = below1 + unfinished1, late callback2가 종료된 token에만 귀속 | 위 ON |
| run 공통성 | 자동 trace·기본 metric·전용 ActiveRequest Meter 모두 `bf4051bd-0c48-4a18-9ba9-b0960cf9137e` | 위 ON trace/metric resource |
| OFF | 일반14 spans, 진단0. run resource는 계속 보강 | `off-20261028-154209` |
| head sampler OFF | trace0·진단0, metric은 유지. 버린 trace를 되살리지 않음 | `head-drop-20261028-154553` |
| TTL100ms | expired7, late27, failures0. slow/timeout/delay summary 없음 | `ttl-20261028-154803` |
| rate1/s·burst17 | 묶음1 생략, 일반14 spans 유지, 실패0 | `budget-20261028-155118` |
| bytes1024/s | 묶음11 전부 생략, 진단0·일반14 spans·앱 응답 유지 | `byte-budget-20261028-155531` |
| 재시작 | 위 실행마다 run UUID가 달라짐, 각 실행 내부 trace/metric은 동일 | 각 `analysis.json` |

위 표는 임시 R0 JAR의 결과다. ON은 unfinished fixture까지 실행했고 초기 OFF는 이를 제외했으므로 위 두 실행의 일반 span 수 차이를 계측 유실로 해석하면 안 된다.

최종 Gradle JAR는 동일한 10개 HTTP 입력(unfinished 포함), 같은 고정 Agent/Collector/JDK 조합으로 다시 실행했다. ActiveRequest는 두 실행 모두 OFF였다.

| 최종 JAR 조건 | 실제 결과 | 증거 폴더 |
|---|---|---|
| 수집 ON, ActiveRequest OFF | 일반15 + summary12 + interval19 = 총46. failures0, suppressed0, late2 | `on-20261028-161421` |
| 수집 설정 생략(기본 OFF) | 일반15, 진단0. HTTP 응답 본문 모두 동일 | `off-20261028-161542` |
| bytes1024/s | 일반15 유지, 진단0, summary 포함 묶음12개 생략, failures0 | `byte-budget-20261028-161704` |
| rate1/s·burst17 | 일반15 + summary11 + interval3, 묶음1개 생략, failures0 | `budget-20261028-161813` |

최종 ON의 slow attempts40 = retained16 + below20 + dropped4, async2, unfinished2 = below1 + unfinished1을 확인했다. 일반 span 개수는 ON/OFF 모두15로 유지됐으며 이 소형 시나리오에서 일반 계측 손실은 관찰되지 않았다. ON run UUID `98aeb235-2176-4eb3-a10a-735900dad5f2`가 trace/metric에 공통이고, OFF 재시작에서는 `4c5acce3-82c0-4203-87fd-7dc3a54a0007`로 바뀌었다. 각 실행의 `command.json`은 최종 JAR 경로를 기록한다.

## R0에서 발견하고 수정한 문제

1. **Agent hook과 classloader**: 단위 테스트/컴파일은 통과했지만 첫 실제 JVM에서 Hikari attempts가 0이었다.
   2.31.1은 `inline=false`만으로 indy를 켜지 않아 injecting 경로를 사용했다. 해당 모듈에만
   `ExperimentalInstrumentationModule.HelperClassStrategy.ISOLATED`를 지정하고, indy loader의 부모
   `ExtensionClassLoader`에서 HTTP listener와 같은 runtime singleton을 MethodHandle로 1회 바인딩했다.
   후속 실제 40시도·timeout·async 검증으로 닫았다. Agent 전체 indy 옵션은 변경하지 않았다.
   [pinned Installer의 useIndy](https://github.com/open-telemetry/opentelemetry-java-instrumentation/blob/v2.31.1/javaagent-tooling/src/main/java/io/opentelemetry/javaagent/tooling/instrumentation/InstrumentationModuleInstaller.java) 참조.
2. **Agent 자동 thread 속성**: 전역 processor가 진단 span에도 `thread.id/thread.name`을 추가했다.
   진단 instrumentation scope만 exporter에서 정형 attrs 허용 목록으로 제한하고 events/links를 제거했다.
   일반 span은 그대로 전달하며 단위 테스트와 실제 OTLP에서 진단 attrs가 `moveseye.diag.*`만 남음을 확인했다.
3. **Collector ID 훼손**: 기존 카드번호 redaction은 숫자16자리 request/related span ID를 `****`, 숫자 UUID
   poolUid 및 resource run UUID를 `****-****`로 만들었다. trace 전용 redaction에 4개 exact key 예외를 두기 전에
   span/resource 위치별 비허용 키 삭제 및 string/hex/UUID 검사를 수행했다. 원래 위치의 유효 ID·run을 보존하며
   card/email은 여전히 마스킹되고 logs의 동명 진단 키도 원문 우회되지 않음을 실제 0.159.0에서 확인했다.
   증거: `redaction-original-20261028-152135`, `redaction-fixed-20261028-152154`.
   BE 담당자에게 정확한 YAML·입력·결과를 전달했고 해당 담당자가 격리 BE worktree 템플릿에 반영했다.

`verify-diagnostics-tail.py`의 별도 Collector 시험은 배포와 같은 decision_wait=10s 및 error/slow/normal
정책 구조(시험 normal=0%)로 12.1205618초 뒤 SERVER·구간·summary를 보냈다. 먼저 ERROR로 보존된 trace는
early-client+late-server+interval+summary 4개를 받았고, 처음 탈락한 trace는 늦은 summary까지 모두 폐기했다.
summary 없음은 0회나 정상이라는 증거가 아님을 실제 transport 경계에서도 확인했다.

빌드 JVM 512MiB/max-workers1, 시험 JVM heap256MiB로 제한했다. 공유 머신의 여유 RAM이 약2GiB까지
줄고 다른 세션 작업이 실행 중이므로 이번 응답지연·heap 수치는 기능 확인용이다.

최종 ON/OFF 1회씩의 `/poc/runtime?gc=true` 관측값은 다음과 같다. 워밍업·반복·독립 부하 통제가 없으므로 overhead나 p95 통과 판정에 사용하지 않는다.

| 관측값 | ON | OFF |
|---|---:|---:|
| GC 후 heap used bytes | 30,973,408 | 30,798,688 |
| GC 횟수 / 누적 GC ms | 36 / 300 | 36 / 273 |
| slow 40회 획득 요청 응답 ms | 656 | 641 |
| timeout 요청 응답 ms | 282 | 297 |
| Collector trace JSON 파일 bytes | 72,421 | 43,448 |

파일 크기는 resource/일반 span을 포함한 Collector JSON 표현이며 wire bytes가 아니다. CPU와 p95는 측정하지 않았다.
최종 소스 hash와 JAR hash·테스트 집계는 `build/diagnostics-r0/final-gradle-manifest.json`에 보존했다.
최종 JAR 검증 뒤 소유한 시험 JVM/Collector를 모두 종료했고 13301/14318 listener가 없음을 확인했다.
README에는 설치·기본 OFF·활성화·진단만 해제·확장 전체 해제 및 지원 한계를 반영했다. commit/merge/push는 하지 않았다.

## 운영 지원 전 남은 게이트

- 3회 이상 동일 부하 OFF/ON, 30분 부하, 8시간 안정성, CPU/p95/live heap 목표 검증 미실행.
- 실제 고객 workload의 SDK queue/Collector tail 결정·late/drop·일반 span 유실 증가 여부 미확정.
- WebFlux·가상 스레드·다른 Hikari/Agent/OS 조합은 미검증.
- 실제 시스템 시계 변경은 주입하지 않았다. 구간 길이는 monotonic으로 계산하지만 epoch 시간은 JVM 초기 공통 anchor를 사용하므로 장시간 실행 중 시스템 시계 조정 후 일반 SERVER 시각과의 정렬은 추가 검증이 필요하다.
- M2/JFR, 원격제어, DBM 상관은 범위 밖.

**기능 smoke가 통과해도 위 게이트를 수행한 것으로 보고하지 않는다.**
