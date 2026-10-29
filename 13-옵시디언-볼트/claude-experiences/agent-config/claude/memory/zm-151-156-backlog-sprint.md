---
name: zm-151-156-backlog-sprint
description: "백로그 6건(ZM-151~156) 전부 종료 — 151~154·156 푸시 완료, 155는 10-19 master 병합(BE a9080eb V81·FE 258d747, 미푸시). 기능 문서 6종 moveseye-docs/features 작성 완료(10-19). 남은 것: 런타임 실측(재기동+임시 계정). 🔴155 상한은 DB 자리 원장·칸 정렬 서버 TZ·\"일단 하자\" 오독 교훈"
metadata: 
  node_type: memory
  type: project
  originSessionId: d71735bd-2e35-4d22-bdcc-f58ce828438f
  modified: 2026-10-19T00:00:00.000Z
---

2026-09-16 사용자 지시: 백로그 6건을 **ZM-151~156**으로 발급, "무거운 건 하네스, 작업별 문서 만들어 보고". 보고서는 `_workspace/reports/zm-15x_*.md`. 커밋은 전부 **승인 대기**([[commit-requires-approval]]).

| 이슈 | 내용 | 상태 | 위치 |
|---|---|---|---|
| ZM-151 | 클라우드 스냅샷 적재량(VPC 구간 적재 **V64** + 수집 리전 범위) | ✅ **BE master 병합(09-21)** `0c3d9e6`·`3741f37` | FE `3212e4c`는 이미 master, 워크트리 제거 |
| ZM-152 | 화면 자기설명(빈 값 이유·보존 안내·지표 뜻) | ✅ **FE 커밋 `2c58efb`(09-22, 28파일)** — master 빌드 깨짐 해소 | FE master 작업 트리. 🔴 ZM-122 커밋이 `ApmServiceListPage`·로케일 hunk를 먼저 가져가 **master가 미추적 4파일을 import → 새 체크아웃 빌드 실패** |
| ZM-153 | 스냅샷 구성 정보 수집 주기 분리(기본 30분) | ✅ 151과 같은 커밋으로 병합(09-21) | FE master |
| ZM-154 | APM 데이터 기간 지정 내보내기 | ✅ **BE `b2c564a` + FE `39ece8e` master 병합(09-22)**. 마이그레이션 없음. FE는 F1~F5·F7~F9(F6 제외). ✅ 09-22 BE EP curl 실측 통과(재기동 없이 — 실행 중 :3000이 병합본 포함). 🔍 코덱스 검수 필수 4건 반영 완료 — FE `9735c02`(창 끝 열 때 고정·세션 전환/닫힌 모달 폐기·StrictMode 결함, v4 승인) · BE `83cc85f`(형식 오류 `APM_EXPORT_INVALID` 통일·실패 경로 테스트 13건, v2 승인) master 병합(09-22, 미푸시). 후속: 보존 경계 재승격(BE plan token)·AbortController·계획 EP 형식 오류 테스트 단언 | 워크트리 제거. 설계 `features/apm/data-export/devdesign_apm-data-export.md`, 계약 `features/apm/data-export/contract_apm-data-export.md`, 보고 `reports/zm-154_apm-data-export{,-fe}.md`. 인덱스 `planning/sprint-zm-151-156/README_zm-151-156.md`(09-22 갱신) |
| ZM-155 | 메트릭 허용목록 확장 | **설계서만**(설계 선행) | `features/apm/metric-allowlist/devdesign_apm-metric-allowlist-extension.md` |
| ZM-156 | APM 콜드 아카이브 | **설계서만**(설계 선행, I7 자빅스 아카이빙과 기반 공유) | `features/apm/cold-archive/devdesign_apm-cold-archive.md` |

🔴 **착수 중 뒤집힌 전제(재발 주의)**
- **`cloud_instance_snapshot`은 중복 제거 금지** — 추정 비용 가동시간 = running 행 수 × 5분, 플릿 추이 = 회차별 대수. 걷으면 비용이 조용히 0. 부풀어 있던 건 VPC(23MB, 서로 다른 구성 18개/29,665행)뿐.
- **V60 `last_seen_at`은 NULL 허용 + `COALESCE(last_seen_at, run_at)`** — NOT NULL이면 롤백 이미지·다른 워크트리 BE(옛 코드)의 INSERT가 5분마다 실패. 실데이터 리허설로 옛 형태 INSERT 성공 확인.
- **수정 쿼리(@Modifying)는 리포지토리 메서드에 `@Transactional`** — `collect()`에 트랜잭션이 없다. 빼면 IT가 `Executing an update/delete query`로 실패(검출력 실증함). 목 테스트는 못 잡는다.
- **`normalizeQueueDir`에는 절대경로·`..` 검사가 없다** — 백로그에 "같은 규칙 재사용"이라 잘못 적었다가 설계 에이전트가 잡음. 두 백로그 문서 정정함.
- **실행 중 IntelliJ BE가 master `build/classes`를 공유** → BE 컴파일·테스트는 반드시 격리 워크트리에서(`:test --tests`로 루트 모듈만).
- **액티브 요청 스위치는 환경변수 아닌 `-D` 시스템 프로퍼티만 동작**(대조 실험) — 설치 가이드 수정은 master BE 작업 트리에 미커밋.

🔴 **공유 IT DB 충돌**: IT는 도커 5433의 `moveseye_it`을 매번 drop&create — 다른 워크트리(p5 등)가 동시에 IT를 돌리면 중복 키·컬럼 없음·시드 개수 불일치로 **가짜 실패**가 난다(154 회귀 9건). 실패 시 `Get-CimInstance`로 다른 worker를 확인하고 단독 재실행할 것.
🔴 **원문 노출 틈(154가 발견, 확인함)**: `ApmRawTextPolicy`가 "지금 keep_raw_sql=false면 저장값은 마스킹됨"을 가정 → 켰다 끈 설치본은 보존 기간 동안 비관리자에게 원문이 보인다. 별도 이슈 권고.
✅ **SLO 사이드바**: 사용자 결정 **사이드바 유지**(⚙ 진입점도 유지) → 테스트 수정 FE `2e1ae38`, 설계서 S1 행 기록. [[verify-all-nav-entry-points]]

**커밋(09-16, 미푸시)**: FE `3212e4c`(#ZM-151 #ZM-153 설정 화면, 번역은 hunk 선별) · BE 브랜치 ZM-151 `53a34bc`(151+153 **합침** — 사용자 결정, **master 미병합**) · BE master `9ad1fd5`(#ZM-122 설치 가이드 스위치). 미커밋: 152(FE 트리, 번역 파일에 152 hunk만 남음)·154(zm-154-be). 155·156은 **설계 질문 먼저 풀고 착수**(사용자 결정).

**남은 결정(보고서에 있음)**: 151+153 커밋을 둘로 나눌지 합칠지(같은 파일) · 번역 파일은 151·152·153이 함께 고쳐 부분 선택 필요 · V60 번호가 p5-live와 충돌 가능 · 155/156 미결 질문(공통 감사 로그 선행·보관 의무 고객 실재·BE docker run에 볼륨 없음).

**09-21 정리(사용자 "ZM-122 오래 걸릴 것 같으니 알아서, 코드 안 무너지게")**
- ZM-151: master 위 rebase(충돌 0) → `V60`→`V64` 재번호(master가 V60~V63 사용, 어느 DB에도 V60 미적용 확인) → 관련 146건 + BE 전체 4,248건(IT 포함) 통과 → master ff 병합. IT에서 V60→V64 순서 적용 확인.
- 🔴 Docker 꺼지면 IT가 **조용히 skip**(시간 0) — `IT_DB_URL=jdbc:postgresql://localhost:5432/` + `:cleanTest`. 로컬 PG는 한국어 로캘이라 `ApmSchemaIT` 1건이 영문 "partition" 비교로 실패(동작 정상).
- 🔴 `--tests` 필터를 루트에서 주면 `engine-zabbix`가 "No tests found"로 BUILD FAILED — 앱만이면 `:test`.
- FE master에 원래 있던 실패 발견·수정(`1954534`): `apmServiceMapGraph.test.ts`가 v2(`abf3359`)에서 지운 `apmMapEdgeWidth`를 부름 → `apmMapFlowStep` 기준으로 재작성. 테스트 폴더는 tsc 대상이 아니라 타입체크로는 안 걸린다.

관련: [[cloud-snapshot-region-fanout]] · [[apm-comprehension-backlog]] · [[aws-zero-cost-charting]] · [[apm-implementation-progress]]

**09-28 "남은 작업 진행해"(+ "코덱스 검수도 받아야 한다")** — 4 갈래를 에이전트 병렬로 처리 → 사용자 승인("ㅇㅇ 커밋 해") 후 **전부 커밋·master ff 병합(미푸시)**: BE `43570e6`(152)·`213d875`(154), FE `01b7b28`(154)·`e7e9e8f`(152). 워크트리·브랜치 정리 완료. 병합본 FE tsc·contract 0, BE 컴파일 성공. 정본 표·커밋 제안·병합 순서는 `_workspace/planning/sprint-zm-151-156/README_zm-151-156.md` 맨 위 "2026-09-28 후속" 절.
- 워크트리: BE `C:\worktrees\zm-152-be`(70파일, 코덱스 v2 승인) · `zm-154-be-followup`(21파일, v3 승인) / FE `zm-154-fe-followup`(23파일, v3 승인) · `zm-152-fe`(44파일, v4 승인). 병합 순서 **FE 154 → 152**(7파일 겹침, dry-run 충돌 0). master가 오늘 다른 세션 커밋으로 이동했으나 겹침 파일 apply --check 통과.
- 🔴 코덱스는 **처음부터** `-c windows.sandbox='"unelevated"'`(승격 샌드박스 오류 3건 동시 재발). 검수 왕복 평균 2~3회 — 지적 반영 시 "권장"도 전부 반영하는 게 재검수 횟수를 줄였다.
- 🔴 사용자 결정 대신 내가 정한 것: ZM-152 FE R3 서버 보존 경계 여유 **5분**(프리셋 정렬 오차 흡수, 코덱스 타당 판정). 인스턴스 7일 프리셋 §6-2는 그대로 미결.
- 🔴 검증 전용 계정이 없어 154 실호출·화면 미실시 — admin 로그인은 사용자 세션을 끊으므로 하지 않았다([[no-be-restart-without-ask]]). 임시 계정 하나면 끝난다.
- master 기존 실패: FE `apmHelpContent.test.ts` 2건(ZM-122 `7db36a2`가 키 추가 후 테스트 미갱신) — 이번 작업 무관, 별도 수정.
- 원문 노출 틈 이슈 초안 `_workspace/features/apm/backlog/issue_apm-raw-text-exposure.md`(수정은 `ApmRawTextPolicy.viewFor` 한 줄, 마스킹 멱등) — 티켓 번호 사용자 발급 대기.

**10-13 ZM-155 결정: 보류** — 사용자 "꼭 필요한 작업임?" → 요청 고객 없음·기본 허용목록이 표준 지표를 덮음·요청 시 `ApmMetricAllowlist` 상수 표 한 줄+배포가 더 쌈이라 보류. 코드로 재확인: 규칙 테이블·API·화면·새 폐기 사유 전부 없음(설계서만). 대신 수집기 상태 폐기 표 `NOT_ALLOWLISTED`에 "화면에서 추가 불가 → 제품 팀에 요청" 힌트 + 런타임 `not_ingestible` 문구에 요청 안내(FE 워크트리 `C:\worktrees\zm-155-hold-fe`, 브랜치 `ZM-155-hold` → 10-13 승인 후 FE master ff `821344b`, 미푸시, 워크트리 정리). 다시 꺼낼 신호: 같은 요청 고객 2곳+ 또는 잦은 변경 요청. 🔴 다른 세션이 FE·BE를 병행 작업 중이라 워크트리 격리 필수.

**10-13 정정: ZM-155 보류 → 구현 착수.** 🔴 사용자 "일단 하자"를 작은 안내 수정으로 좁혀 읽은 오독 — 사용자가 "155 하자했잖아"로 바로잡음. 교훈: "일단 하자"는 직전에 내가 제안한 **큰 안**(기능 구현)을 가리킨 것이고, 좁게 읽을 때는 되물어야 했다. 결정(설계서 §8 ✅): Q1 (b) 이름만·Q2 L5=50·Q3 같은 테이블·Q4 히스토그램 제외·Q5 직접 입력 없음·Q6 해당 없음·Q7 로그 감사·Q8 yaml extra 자동 포함·Q9 TTL 30초. 범위 S2+S3+S4(S1 후보 관측·S5 실측 생략). 🔴 Flyway **V81**(다른 세션 브랜치 V76~V80 점유 — 병합 때 재확인). FE 힌트 `821344b`는 완료 시 "이 화면에서 받기"로 교체.

**10-19 ZM-155 종료** — 사용자 승인 후 커밋·master ff 병합 BE `a9080eb`(V81 `apm_custom_metric_rule` + admission 원장)·FE `258d747`, 워크트리·브랜치 정리, 병합본 BE 컴파일·FE tsc·contract 0. 코덱스 BE 5회(v1 10건→승인)·FE 5회(v1 5건→승인) 왕복. 🔴 핵심 설계 변화: 상한은 JVM 캐시가 아니라 DB 자리 원장(PG advisory lock, 서비스 ID 정렬 순서)이 정본·캐시는 60초 힌트, 설정 조회 실패 60초 지속 시 fail-closed, 자동 정지 대신 WARN, 종류(kind)는 서비스×이름 자리에 고정, 칸 정렬은 서버 TZ 기준이라 FE는 응답 ts로만 판정. 남은 것: 푸시·BE 재기동 후 런타임 실측(받기→규칙 탭→서비스 탭→yaml)·기능 문서·dev DB V81 적용. 이로써 ZM-151~156 전부 종료.

**10-19 문서 정리("문서 정리해줘")** — 155 기능 문서 `moveseye-docs/features/APM-커스텀-지표-허용목록.md` 작성(다른 5종과 같은 틀, status review·소스 기준·런타임 미실시 명시) + `features/README.md` 행 추가 → 151~156 **기능 문서 6종 전부 있음**. `planning/sprint-zm-151-156/summary_zm-151-156_쉬운-요약.md` 155 절을 구현 기준으로 교체, `README_zm-151-156.md` 남은 일·결정 표의 155·156 행 ✅ 처리. 🔴 moveseye-docs 작업 트리에 다른 세션의 한글 파일명 rename 다수가 미커밋 상태 — 내 변경(features 2파일)은 커밋하지 않았다(승인 대기, 다른 세션과 겹치지 않게 features/만 건드림). 남은 것: 푸시 · BE 재기동 후 런타임 실측(152·154 v2·155·156 — 임시 계정 필요) · dev DB V81.

**10-21 ZM-155 후속 검수 → 다음 작업에 편입(사용자 지시)** — `_workspace/features/apm/metric-allowlist/review_zm-155-followup-20261020.md`(코덱스, 구현 무변경 분석). 순서 R1→R2→R3→운영: **R1(높음)** COUNTER의 count=`Math.round(sum)`이라 증가량 0·0.2가 FE `!point.count`에서 null(정상 수신이 화면에서 사라짐) — 내장 HTTP 지표 공통 count 의미는 건드리지 말고 nullable sum/관측 여부로 판정. **R2(높음)** 자리 7일 만료 뒤 같은 이름을 다른 kind로 보내면 조회가 현재 kind로 과거 롤업 전체를 재해석 — 자리 만료와 kind 수명 분리. **R3(중간)** unit 미보존(1m UPSERT에 unit 없음)이라 s·ms 혼합 합산, 응답·차트에도 단위 없음. 아쉬운 점: overflow count 의미, `regenerationRequired`가 적용 완료를 추적 못 함, Gate 844줄 분리. 🔴 알람 단위 8 커밋 뒤, 6c 앞에 착수.
- **10-21 R1~R3 구현 완료·코덱스 4차 승인(1~3차 반려)** — 워크트리 BE `C:\worktrees\zm-155-followup-be`·FE `…-fe`(브랜치 `ZM-155-followup`, master 기준), **Flyway V82**(admission.unit, 사용자 결정), 단위 불일치는 거부(`CUSTOM_UNIT_MISMATCH`, 사용자 결정). 🔴 교훈: 자리(상한) 만료 ≠ 종류·단위 수명(원장 행은 세대 끝날 때만 삭제), 제약 ≠ 저장 허가, 단위는 자르지 말고 거부, 기존 자리 호환성은 "맞는 포인트 하나라도"(첫 단위만 보면 혼합 배치에서 막힘). 이월: 5m·1h 롤업 조회 불변 IT.
- **10-28 ZM-155 런타임 실측 통과**(dev :3000) — 받기·거부 코드·조회(R1 observed·R3 단위 거부)·재등록 새 세대·설정/가이드 패턴·끄기/켜기 전부 계약대로. 기록은 계약서 §11. 🔴 시험 서비스 삭제는 숨김(PUT hidden=true) 뒤에만 된다. 미실측: L5 접힘·L8 경고·다중 노드.
