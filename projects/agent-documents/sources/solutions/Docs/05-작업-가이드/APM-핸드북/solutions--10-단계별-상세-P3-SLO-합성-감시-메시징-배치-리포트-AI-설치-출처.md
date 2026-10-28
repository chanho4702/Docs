# §6 단계별 상세 — P3 SLO·합성 감시·메시징/배치·리포트·AI·설치 출처

> **MovesEye APM 종합 안내서** 분책 10/18 · 원본 절 **§6.5** · 마지막 갱신 **2026-09-14**(원본 `apm-handbook.md` 2026-09-14 작성분을 내용 수정 없이 옮김, 분책 2026-09-14).
>
> **이 문서를 읽으면 알게 되는 것**
> 1. P3 — SLO·합성 감시·메시징/배치·리포트·홈 위젯·AI 툴 11·설치 가이드 출처를 무엇/어떻게/왜/조건/함정으로
> 2. 왜 SLO 번 알람을 끌 때 −1을 미는가·왜 리포트 id를 갈랐나
> 3. `post_type` 부재·`httpStepId`·배치 잡 15분 경계 등 실측이 뒤집은 P3 가정
>
> **전제 문서** — 이전 [09-permissions.md](solutions--09-%EB%8B%A8%EA%B3%84%EB%B3%84-%EC%83%81%EC%84%B8-%EA%B6%8C%ED%95%9C-%EC%98%B5%EC%85%98-%EC%A0%84%ED%99%98-%28DMOVE-%EA%B6%8C%ED%95%9C-applicationMonitoring-apm%29.md) · 다음 [11-p4-rum-k8s.md](solutions--11-%EB%8B%A8%EA%B3%84%EB%B3%84-%EC%83%81%EC%84%B8-P4-RUM%28%EB%B8%8C%EB%9D%BC%EC%9A%B0%EC%A0%80%29-K8s-%EC%BB%A8%ED%85%8D%EC%8A%A4%ED%8A%B8.md) · 목차 [00-index.md](solutions--00-MovesEye-APM-%EC%A2%85%ED%95%A9-%EC%95%88%EB%82%B4%EC%84%9C-%EB%AA%A9%EC%B0%A8-%EC%9D%BD%EB%8A%94-%EC%88%9C%EC%84%9C-%EC%9A%A9%EC%96%B4-%EC%9A%94%EC%95%BD%ED%8C%90-%EC%A0%84%EC%B2%B4-%EC%A7%80%EB%8F%84.md). 용어는 [14-glossary.md](solutions--14-%EB%B6%80%EB%A1%9D-A.-%EC%9A%A9%EC%96%B4-%EC%82%AC%EC%A0%84%28%EC%A0%84%EC%B2%B4%29.md), 출처 전체는 [17-sources.md](solutions--17-%EB%B6%80%EB%A1%9D-D.-%EC%B6%9C%EC%B2%98-%EB%AA%A9%EB%A1%9D-%EC%99%B8%EB%B6%80-%EA%B3%B5%EC%8B%9D-%EB%AC%B8%EC%84%9C-%EB%82%B4%EB%B6%80-%EC%A0%95%EB%B3%B8.md).
> **표기**: 🔴 = 어기면 데이터가 조용히 틀리는 규칙 · ⚠️ = 알고 있어야 하는 한계 · ✅ = 실측으로 확인된 것.

### 6.5 P3 — SLO·합성 감시·메시징/배치·리포트·AI·설치 출처

| | |
|---|---|
| **무엇을** | **SLO**(AVAILABILITY/LATENCY, 7·30일, 에러 버짓·번 레이트 4창·일 스냅샷·캘린더·번 알람) · **합성 감시**(Zabbix `httptest` CRUD·바인딩·24h 가용성·60분 p95·30일 캘린더·실패 사유 분류·감시 위치) · **메시징**(큐/토픽 5분·소비 지연) · **배치 잡**(`job.name` 규약·실행 이력·간트) · **리포트**(주간/월간 스냅샷, 리포트 관리 편입) · **홈 위젯 3** · **AI 툴 11**(`apm_list_services`·`service_status`·`slow_endpoints`·`error_groups`·`trace_lookup`·`service_map`·`deployments`·`collector_status`·`slo_status`·`synthetics`·`jobs`) + screens.json 16화면 + '/' 명령 5 · **설치 가이드 출처** `references[]` 31건 |
| **어떻게** | SLO 롤링 창을 **세 조각**(시작 경계 촘촘한 단 + 롤업 본문 + **워터마크가 정하는** 꼬리)으로 읽고 `measuredFrom/To`를 응답에 실음 · 스냅샷 `finalized`(50분치 진행분이 하루로 굳던 사고)·과거 되계산 없음(`staleDefinition`) · 번 알람 push 값 규약 `>0`(발화, 긴 창 값) / `0`(쟀고 정상) / `−1`(측정 불가) · 합성: `web.test.fail`은 **실패 단계 번호**(0=성공), `web.test.time`은 **초**, 결과 축은 `(hostId, 시나리오)`, 이력은 커서 페이징(상한 10만이 최신을 자른다), 최신 상태는 `lastvalue` · 메시징·배치는 별도 잡이 아니라 **트레이스 롤업 5·6단계** · 리포트는 `ManagedReportSource` SPI로 STANDARD 코드 무수정 편입, 행 키 `(type, id)` |
| **왜 −1인가** | 전에는 측정 불가일 때 아무것도 안 밀었다 → 아이템의 마지막 양수가 남아 트리거가 참인 채 유지, **"수집이 끊겼다"가 "계속 타는 중"으로**. 0을 밀면 가장 나쁜 순간에 조용해진다. 그래서 셋째 값. **끌 때도 −1을 먼저 민다**(D3): 고아 정리가 트리거를 `status=1`로 내리면 다시 평가되지 않아 열린 Problem이 영원히 남았다 — 값이 먼저 들어가야 아직 살아 있는 트리거가 회복 이벤트를 만든다. 공유 아이템엔 −1을 밀지 않고 트리거별 `event.acknowledge(close)`(다른 규칙의 거짓 복구 방지) |
| **왜 리포트 id를 갈랐나** | `host_group_report`와 `apm_report_snapshot`은 시퀀스가 달라 **1번이 양쪽에 있다**. `/reports/{id}`는 서버가 "1번"을 결정할 수 없어 불가 → 상세는 `/admin/reports/apm/{id}`, 삭제 본문은 `ids`/`apmIds` 배열 둘. 한 배열에 섞으면 사용자가 고르지 않은 리포트가 지워진다. 편입 자체는 A1이 실제로 빨갛게 떠서 의존을 SPI로 뒤집었다 |
| **조건·전제** | 배치 화면은 **고객이 코드를 넣어야** 채워진다(OTel에 잡 시그널이 없다 — 루트 스팬·`kind=INTERNAL`·`job.name` 속성, `UNSET`은 실패 아님). 메시징은 `messaging.system` 없으면 메시징 스팬이 아니다. 합성 감시 정본은 우리 DB가 아니라 Zabbix(창이 history 보존에 잘림, `orphaned` 가능). SLO 캘린더 상한 400일이되 백필은 5m 보존 30일 안쪽만. 리포트 권한은 관리자 축 |
| **함정·교훈** | `post_type` 없음·RAW/FORM 반대([2.3절](solutions--02-%EB%B0%B0%EA%B2%BD%EC%A7%80%EC%8B%9D-%EC%9D%B4-%EC%A0%9C%ED%92%88%EC%9D%B4-%EC%84%9C-%EC%9E%88%EB%8A%94-%EB%95%85.md)) · `httpStepId` 빠지면 단계가 오류 없이 지워졌다 새로 생겨 **이력이 사라진다** → 서버가 이름으로 되붙이고 새 단계는 `isNew:true` 필수 · 프록시 칸이 없는 이유: Zabbix 7.0 `httptest`엔 프록시 필드가 없다(호스트를 감시하는 쪽이 실행) · 배치 잡 누락 경계는 "하루"가 아니라 **15분**이었다(끝난 뒤 도착하니 시작 버킷이 창 밖 → V54 완료 시각 경로) · `job.*`가 속성 허용목록에 없어 `apm_job_run`이 영원히 비던 상태 · 리포트 `createdAt`이 KST에 `Z`(NestJS 1:1 보존물, 두 계열 함께 UTC로) · 가용성 헤드라인 단순 평균 56.63%(요청 0건 서비스 0%) → 요청 가중 · 필수 파라미터 누락이 500(전역 핸들러 공백) · AI 툴 반올림이 `0.04→0.0`으로 작은 이상을 정상으로(단위별 자릿수·BigDecimal) |

**더 보기**: SLO 정의·번 알람·`-1` = `contract_apm-p3.md` §1.4·§1.5·§1.8(`reviews/review_apm-p3-w1_codex.md` 🔴1~🔴6) · D3 끌 때 `-1` = `verification/e2e_apm-p3-qa.md` §7.1 · 합성 = `contract_apm-p3.md` §3.0·§3.4·§7.1(`reviews/review_apm-p3-w2_codex.md` #1~#10) · `httpStepId`·`isNew` = `verification/e2e_apm-p3-qa.md` D9 · 메시징·배치 규약 = `contract_apm-p3.md` §4.4·§5.3·§5.4(V54) · 리포트 id·SPI = §8.0·§8.1·`report/ManagedReportSource` · 가용성 가중·`createdAt` = `verification/e2e_apm-p3-qa.md` D2·D4 · 500 = D1 · AI 반올림 = `contract_apm-p3-ai.md` §0 #3(코덱스 #12·QA A8) · 툴 11·화면 16 = `contract_apm-p3-ai.md` §1·§4 · 출처 카탈로그 = `contract_apm-read-api.md` §8.8 · 코드 `slo/ApmSloCalculator`·`synthetic/ApmSyntheticZabbixMapper`·`job/ApmJobConventions`·`alert/bridge/ZabbixAlertBridge#pushUnmeasurable`.
**출처**: Google SRE Workbook — Alerting on SLOs https://sre.google/workbook/alerting-on-slos/ · Zabbix `httptest` 객체 https://www.zabbix.com/documentation/7.0/en/manual/api/reference/httptest/object · 웹 모니터링 아이템(`web.test.*`) https://www.zabbix.com/documentation/7.0/en/manual/web_monitoring/items · `CHttpTest.php`·`defines.inc.php` https://raw.githubusercontent.com/zabbix/zabbix/release/7.0/ui/include/classes/api/services/CHttpTest.php · https://raw.githubusercontent.com/zabbix/zabbix/release/7.0/ui/include/defines.inc.php .

---

## 보강 — 이 단계와 관련된 §4·§5·§8 조각(사본)

> 🔁 **보강(사본)** — 아래는 §4.2(단계 표)·§4.3(데이터 모델)·§5(데이터의 길)·§8.2(QA 수치)에서 이 단계에 해당하는 조각을 **그대로 복사**한 것이다(각 파일이 혼자 읽히게). 정본은 [04-overview.md](solutions--04-%EB%AC%B4%EC%97%87%EC%9D%84-%EB%A7%8C%EB%93%A4%EC%97%88%EB%82%98-%EB%A9%94%EB%89%B4-14-%EB%8B%A8%EA%B3%84-P1-P5-%EB%8D%B0%EC%9D%B4%ED%84%B0-%EB%AA%A8%EB%8D%B8.md) §4.2·§4.3 · [06-data-path.md](solutions--06-%EC%96%B4%EB%96%BB%EA%B2%8C-%EB%8D%B0%EC%9D%B4%ED%84%B0%EA%B0%80-%EC%A7%80%EB%82%98%EA%B0%80%EB%8A%94-%EA%B8%B8.md) §5 · [13-verification.md](solutions--13-%EA%B2%80%EC%A6%9D-%ED%98%84%ED%99%A9%EA%B3%BC-%EB%82%A8%EC%9D%80-%EA%B2%83-%EB%B0%A9%EB%B2%95%EB%A1%A0-QA-%EC%88%98%EC%B9%98-%EB%AF%B8%EA%B2%80%EC%A6%9D-%EC%97%B4%EB%A6%B0-%EA%B2%B0%EC%A0%95-%EC%A0%95%EB%B3%B8-%EB%B6%88%EC%9D%BC%EC%B9%98-14.md) §8.2이며, 어긋나면 정본이 맞다.

**보강 A — §4.2 단계 표에서 P3 행 (정본 04-overview.md §4.2)**

| 단계 | 날짜(커밋) | 무엇 | 핵심 수치 | 검증 |
|---|---|---|---|---|
| **P3 운영 심화** | 09-07~08 (BE `e386e61`→`05e830d`, FE `8da4251`→`fd87470`, AI `533d4c0`→`84ad916`) | SLO(V51·V53) · 홈 위젯 3 · AI 툴 11 · 합성 감시(V52, `zabbix/httptest` 계약) · 메시징/배치(V54·V56) · 리포트(V55, SPI 편입) · 설치 가이드 출처 31 | 번 알람 OR·값 규약 `>0/0/-1` · 배치 규약 `job.name` | 코덱스 3회전(🔴 15) · P3 QA PASS 74/FAIL 3·결함 23 → 2회차 전건 PASS·신규 6 |

**보강 B — §4.3 데이터 모델에서 V51~V56 (정본 04-overview.md §4.3)**

| 마이그레이션 | 표 | 무엇을 담나 |
|---|---|---|
| **V51** `apm_slo` | `apm_slo`·`apm_slo_snapshot` | SLO 정의(`def_version`) / 일 스냅샷(`finalized`·당시 정의·good double) |
| **V52** | `apm_synthetic_binding`·`apm_messaging_5m`·`apm_job_run` | 서비스↔웹 시나리오 연결 1줄 / 큐·토픽 5분(오퍼레이션·`lag_*`) / 배치 실행 이력(`UNIQUE(trace_id, span_id)`) |
| V53 | `apm_zbx_cleanup` + SLO 검수 반영 | 지운 규칙의 Zabbix 객체 정리 큐(행 삭제 전 id 옮겨 적기) |
| V54 | `apm_span` 부분 인덱스(루트 INTERNAL) | 완료 시각으로 잡을 줍는 경로(15분 창 밖 배치 누락 해소) |
| **V55** | `apm_report_snapshot` | 주간/월간 APM 리포트(기간당 1행, 본문 `services[]`) |
| V56 | `apm_job_run.service_id` SET NULL | 서비스를 지워도 배치 이력은 남는다 |

**보강 C — §5.2 트레이스 롤업의 메시징·배치 단계 (정본 06-data-path.md §5.2)**

```
                                                          5분마다 apm_trace_rollup (워터마크 하나·트랜잭션 하나·LAG 3분·lookback 2버킷)
                                                          ① 엣지(CLIENT/PRODUCER → SERVICE/QUEUE/DB/HTTP) ② 예외 그룹(시간대 재계산-대입) ③ DB 쿼리 그룹(apm_sql_norm)
                                                          ④ 외부 의존 ⑤ 메시징 5m(발행 짝 검증·소비 지연) ⑥ 배치 잡(job.name 규약·완료 시각 경로)
```

**보강 D — §4.5.4 SLO 화면 행 · §4.5.6 리포트 관리 APM 행·홈 위젯 3종 (정본 05-menus-and-tabs.md)**

| 화면 · 경로 | 어떤 질문에 답하나 | 무엇이 보이나 | 데이터는 어디서 | 언제 여나 | 함정 |
|---|---|---|---|---|---|
| **SLO** `/slo` → `/slo/:sloUid` (`apm.view`, 쓰기 `edit`) | "약속(30일 99.9%)을 지키고 있나 · 예산이 얼마나 남았나 · 지금 얼마나 빨리 태우나" | 목록: SLO 표(서비스·SLI 종류 가용성/지연·목표·창 7/30일·현재 SLI·남은 버짓(음수 가능)·번 레이트·상태 OK/WARN/BREACH/UNKNOWN·`Zabbix 미반영` 배지)·생성/수정 Drawer(번 알람 스위치·임계·상한 안내) · 상세: 에러 버짓 게이지(바늘 0~100, 숫자는 사실)·번다운(단조 감소)·SLI 추이(오르내림)·30일 캘린더(빈 칸 = 못 잰 날, 테두리 = 미확정/옛 기준)·번 알람 설정 | `apm_slo`·`apm_slo_snapshot`·1m/5m/1h 3조각 `GET /apm/slos*` | 운영 회의 · "이 속도면 오늘 안에 예산이 끝난다"(WARN이 OR인 이유) · 배포 승인 근거 | `—`는 0%가 아니라 못 잼(UNKNOWN 회색) · 표(롤링 창)와 캘린더(자정 날짜)는 정확히 같지 않다 · 정의를 바꿔도 과거는 되계산 안 함(`staleDefinition`) · 삭제는 스냅샷 400일치까지 지운다(잠시 안 보려면 '사용' 끄기) · 가용성 SLI(요청 가중)와 서비스 화면 `availability24hPct`(5분 칸)는 다른 질문 |

| 화면 | 어떤 질문에 답하나 | 무엇이 보이나 | 데이터는 어디서 | 언제 여나 | 함정 |
|---|---|---|---|---|---|
| **설정 › 리포트 관리** `/setting/report-management` → APM 행 `/setting/report-management/apm?id=` (관리자 축) | "지난주/지난달 성적이 어땠나 — 서비스별로 굳힌 값으로" | 목록에 호스트 그룹 리포트와 **한 표에 섞여**('종류' 열·필터) · APM 본문: 요약 카드(기간 합계 + 직전 기간 대비 증감, 단위 %·%p·절대 차·건수)·서비스 행 펼침(RED·가용성·배포·알람·SLO 성적·상위 예외 5)·각주(`availabilityUnweightedServices`·월간 가용성 1시간 단위 등)·PDF/이미지 저장 · 개요의 "지난주 리포트" 버튼 | `apm_report_snapshot`(월 10:10·1일 10:40 배치, catch-up 3, lazy 백필) `GET /admin/reports?type=`·`/admin/reports/apm/{id}` | 주간 보고 · 월간 SLA 정리 | 열 때마다 다시 계산하지 않는다('계산 시각'이 기준) · `—`는 0이 아니라 못 잼 · 행 키는 `(type, id)` — 두 계열의 id가 겹친다 · 보존 설정은 두 계열 공용 · `apm.view`만으론 못 본다(관리자) · lazy 백필은 **지금 남은 원재료**로 만든다(오래된 기간은 얇다) |
| **홈 위젯 `apm_status`**(6×8) | "홈에서 한눈에 — 서비스 상태 분포와 오류 Top" | 상태 도넛 + 오류율 Top 목록 | `GET /home/widgets/apm-status`(30초 공용 캐시, 창 60분 서버 제공) | 홈 대시보드 편집 › 카탈로그(`apm.view` 있을 때만 노출) | 기본 세트에 없다(수집기 없는 설치본에 빈 카드 방지) · 창 `windowMinutes`는 서버 값 |
| **홈 위젯 `apm_slow_services`**(4×8) | "지금 어느 **서비스**로 들어가 봐야 하나" | p95 느린 서비스 Top | `/home/widgets/apm-slow-services` | 〃 | 엔드포인트가 아니라 **서비스** 축(엔드포인트는 서비스마다 route 표를 읽어야 해 폴링 예산 밖) |
| **홈 위젯 `apm_alerts`**(6×10) | "터진 것과 곧 터질 것" | 최근 발화 알람 + `sloRisks`(WARN 상태 SLO) | `/home/widgets/apm-alerts` | 〃 | 못 재는 서비스는 제외(`null`은 빈 카드가 아니라 제외) |

**보강 E — §8.2 QA 수치에서 P3 행 (정본 13-verification.md §8.2)**

| 단계 | 결과 | 남은 것 |
|---|---|---|
| P3 QA(09-07, 2회차 09-08) | PASS 74/FAIL 3·결함 23 → 2회차 재검증 전건 PASS, 신규 6(MED 1: D10 트리거 이름) | D10·D3d 런타임 재현·`PROXY_GROUP`·`truncated:true`·실 메시징/배치 스팬 0건·실 LLM 대화 |

---

## 더 보기 — 내부 정본(이 문서에서 근거로 인용한 것)

경로는 `C:\solutions\_workspace\` 기준, 코드는 각 레포 `src/main/java/com/dmove/moveseye/` 기준. 절별 정확한 위치(§·#·클래스)는 본문 각 절 끝의 **더 보기** 줄에 있고, 아래는 그것을 문서 단위로 모은 것이다.

- 문서·코드 경로: `contract_apm-p3.md` · `reviews/review_apm-p3-w1_codex.md` · `verification/e2e_apm-p3-qa.md` · `reviews/review_apm-p3-w2_codex.md` · `report/ManagedReportSource` · `contract_apm-p3-ai.md` · `contract_apm-read-api.md` · `slo/ApmSloCalculator` · `synthetic/ApmSyntheticZabbixMapper` · `job/ApmJobConventions` · `alert/bridge/ZabbixAlertBridge#pushUnmeasurable`
- 클래스·식별자: `-1` · `httpStepId` · `isNew` · `createdAt`
- 관련 분책: 이전 [09-permissions.md](solutions--09-%EB%8B%A8%EA%B3%84%EB%B3%84-%EC%83%81%EC%84%B8-%EA%B6%8C%ED%95%9C-%EC%98%B5%EC%85%98-%EC%A0%84%ED%99%98-%28DMOVE-%EA%B6%8C%ED%95%9C-applicationMonitoring-apm%29.md) · 다음 [11-p4-rum-k8s.md](solutions--11-%EB%8B%A8%EA%B3%84%EB%B3%84-%EC%83%81%EC%84%B8-P4-RUM%28%EB%B8%8C%EB%9D%BC%EC%9A%B0%EC%A0%80%29-K8s-%EC%BB%A8%ED%85%8D%EC%8A%A4%ED%8A%B8.md) · 목차 [00-index.md](solutions--00-MovesEye-APM-%EC%A2%85%ED%95%A9-%EC%95%88%EB%82%B4%EC%84%9C-%EB%AA%A9%EC%B0%A8-%EC%9D%BD%EB%8A%94-%EC%88%9C%EC%84%9C-%EC%9A%A9%EC%96%B4-%EC%9A%94%EC%95%BD%ED%8C%90-%EC%A0%84%EC%B2%B4-%EC%A7%80%EB%8F%84.md) · 용어 [14-glossary.md](solutions--14-%EB%B6%80%EB%A1%9D-A.-%EC%9A%A9%EC%96%B4-%EC%82%AC%EC%A0%84%28%EC%A0%84%EC%B2%B4%29.md) · 출처 전체 [17-sources.md](solutions--17-%EB%B6%80%EB%A1%9D-D.-%EC%B6%9C%EC%B2%98-%EB%AA%A9%EB%A1%9D-%EC%99%B8%EB%B6%80-%EA%B3%B5%EC%8B%9D-%EB%AC%B8%EC%84%9C-%EB%82%B4%EB%B6%80-%EC%A0%95%EB%B3%B8.md)

## 출처 — 외부 공식 문서(이 문서에 쓰인 것만)

| 주제 | URL |
|---|---|
| Google SRE Workbook — Alerting on SLOs(멀티윈도우 번 레이트) | https://sre.google/workbook/alerting-on-slos/ |
| Zabbix `httptest` 객체 · 웹 모니터링 아이템 | https://www.zabbix.com/documentation/7.0/en/manual/api/reference/httptest/object · https://www.zabbix.com/documentation/7.0/en/manual/web_monitoring/items |
| Zabbix 소스 정본(`CHttpTest.php`·`defines.inc.php`) | https://raw.githubusercontent.com/zabbix/zabbix/release/7.0/ui/include/classes/api/services/CHttpTest.php · https://raw.githubusercontent.com/zabbix/zabbix/release/7.0/ui/include/defines.inc.php |

전체 목록과 "확신이 낮아 상위 페이지로 적은 것"은 [17-sources.md](solutions--17-%EB%B6%80%EB%A1%9D-D.-%EC%B6%9C%EC%B2%98-%EB%AA%A9%EB%A1%9D-%EC%99%B8%EB%B6%80-%EA%B3%B5%EC%8B%9D-%EB%AC%B8%EC%84%9C-%EB%82%B4%EB%B6%80-%EC%A0%95%EB%B3%B8.md) D.1.

