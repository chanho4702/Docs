# ZM-151 ~ ZM-156 진행 현황

- 작성 2026-09-16 · **갱신 2026-10-19** · 출처 백로그 [`./tasks_backlog-2026-09-16.md`](tasks_backlog-2026-09-16.md) (I1~I6 → ZM-151~156)

## 2026-09-28 후속 — "남은 일" 처리 결과 (✅ **전부 커밋·master ff 병합 완료, 미푸시** — 사용자 승인 후 BE `43570e6`(152)·`213d875`(154), FE `01b7b28`(154)·`e7e9e8f`(152). 워크트리·브랜치 정리됨. 병합본 검증: FE tsc·typecheck:contract 0, BE compileJava·compileTestJava 성공)

| 갈래 | 워크트리 / 브랜치 | 변경 | 테스트 | 코덱스 | 문서 |
|---|---|---|---|---|---|
| **ZM-152 BE 요청 8건** | `C:\worktrees\zm-152-be` / `ZM-152-be` (master `3f731d5` 기준) | 70파일(마이그레이션 없음, 새 EP 2: `GET /apm/settings/retention`·`GET /apm/ingest/drops/by-service`) | 단위 4,188 / APM IT 포함 2,098/2,100(실패 2=`ApmCollectorLiveRuntimeTest` Windows 파일 잠금 플레이크, 단독 통과) | v1 필수4·권장2 → 전건 반영 → **v2 승인** | 계약 [`../../features/apm/self-explain/contract_zm-152-self-explain-be.md`](../../features/apm/self-explain/contract_zm-152-self-explain-be.md) · 보고 [zm-152_be-self-explain](../../features/apm/self-explain/zm-152_be-self-explain.md) · 인계 [`../../features/apm/self-explain/review_zm-152-be-self-explain.md`](../../features/apm/self-explain/review_zm-152-be-self-explain.md) |
| **ZM-152 FE 연동** | `C:\worktrees\zm-152-fe` / `ZM-152-fe` (master `105c8bf` 기준) | 44파일(신규 3: `ApmRetentionContext`·`ApmServiceDropsLine`·훅 테스트) | 26스위트 599/601(실패 2=master 기존 `apmHelpContent.test.ts`, 아래) | v1 필수5·권장5 → v2 잔여3 → v3 잔여1 → **v4 승인** | 보고 [zm-152_fe-contract-integration](../../features/apm/self-explain/zm-152_fe-contract-integration.md) · 인계 [`../../features/apm/self-explain/review_zm-152-fe-contract-integration.md`](../../features/apm/self-explain/review_zm-152-fe-contract-integration.md) |
| **ZM-154 BE 후속** (`q`·`method` 필터, planToken, R4) | `C:\worktrees\zm-154-be-followup` / `ZM-154-followup-be` | 21파일(신규 5: `ApmExportPlanToken`·`ApmEndpointFilter`·테스트) | 단위 95 / 전체 회귀 IT 포함 2,100 / export IT 15 | v1 필수4·권장3 → v2 잔여2 → **v3 승인** | 계약 v2 절 [`../../features/apm/data-export/contract_apm-data-export.md`](../../features/apm/data-export/contract_apm-data-export.md) · 보고 [zm-154_be-followup](../../features/apm/data-export/zm-154_be-followup.md) · 인계 [`../../features/apm/data-export/review_zm-154-be-followup.md`](../../features/apm/data-export/review_zm-154-be-followup.md) |
| **ZM-154 FE 후속** (F6 개요 전체 서비스, AbortController, v2 연동, 보존 결손 헤더) | `C:\worktrees\zm-154-fe-followup` / `ZM-154-followup-fe` | 23파일(신규 5: `linkCallerSignal`·`apiBaseUrl`·테스트) | 9스위트 178/178 | v1 필수1·권장4 → v2 잔여1 → **v3 승인** | 보고 [zm-154_fe-followup](../../features/apm/data-export/zm-154_fe-followup.md) · 인계 [`../../features/apm/data-export/review_zm-154-fe-followup.md`](../../features/apm/data-export/review_zm-154-fe-followup.md) |
| **151·153·154 런타임 확인** | 실행 중 :3000(오늘 09:18 master 빌드) | 코드 수정 0 | 151·153 **통과**(DB 실측: V64 적용, VPC dedup·인스턴스 회차행 보존, 구성 주기 30분 동작) · 154·화면 4곳 **미실시**(검증 전용 계정 부재, admin 로그인은 사용자 세션을 끊어 보류) | — | [zm-151-154_runtime-check](zm-151-154_runtime-check.md) |
| **원문 노출 틈** | — | 이슈 초안만 | — | — | [`../../features/apm/backlog/issue_apm-raw-text-exposure.md`](../../features/apm/backlog/issue_apm-raw-text-exposure.md) (티켓 번호 미발급 — 사용자) |

🔴 **병합 순서·충돌**: 오늘 다른 세션이 BE master에 `fbcee63`·`ad57ea5`, FE master에 `7fa65a6`를 올렸다. 겹치는 파일(BE `ApmMetric1mStore.java` 1, FE `types/apm.ts`)은 `git apply --check`로 현재 master 위에 깨끗이 적용됨을 확인. FE 두 워크트리는 7파일이 겹치나 **154 FE → 152 FE 순서**로 얹으면 충돌 없음(dry-run 확인). 두 BE 워크트리는 서로 겹치지 않는다.
🔴 **master 기존 실패**: FE `apmHelpContent.test.ts` 2건 — ZM-122 `7db36a2`가 `alert_stuck_table` 도움말 키를 붙이고 테스트 키 목록은 갱신하지 않음(이번 작업 무관, 별도 수정 필요).
🔴 **코덱스 실행 함정**: 승격 샌드박스 오류(`setup refresh had errors`)가 3건 동시 재발 → 검수는 처음부터 `-c windows.sandbox='"unelevated"'`를 붙인다(메모리 반영).

**커밋(승인 후 실행, 선별 add) — 아래 메시지 그대로**
- BE `zm-152-be`: `#ZM-152 [FEAT] 화면 자기설명 BE 8건 — 런타임 부재 사유·액티브 요청 관측·유효 보존 EP·보존 경계·서비스별 폐기 요약(메모리)·요청0건/수신없음·SLO UNKNOWN 사유·인스턴스 지표 가능 + 코덱스 반영(보존 정규화·min 경계·SLO 보존 우선·카운터 동시성) -2026-09-28`
- FE `zm-152-fe`: `#ZM-152 [FEAT] 화면 자기설명 BE 연동 — 런타임 부재 사유·액티브 요청 관측·유효 보존 일수(Provider·서버 시각 오프셋)·보존 경계(서버값 우선, 5분 여유)·서비스별 폐기 요약·수신 없음·SLO UNKNOWN 사유·인스턴스 지표 가능 -2026-09-28`
- BE `zm-154-be-followup`: `#ZM-154 [FEAT] APM 내보내기 후속 — 엔드포인트 q·method 필터(트랜잭션 표와 같은 ApmEndpointFilter), 계획 고정 토큰 planToken(HMAC·JWT_SECRET 파생·30분, 보존 경계 재승격 차단), 보존 결손 헤더·CSV 표지, 감사 로그 이스케이프, R4 -2026-09-28`
- FE `zm-154-fe-followup`: `#ZM-154 [FEAT] 내보내기 FE 후속 — APM 개요 전체 서비스 RED(해상도 우선·거절 사유), 취소 시 요청 중단(AbortController·인터셉터 signal 연결), v2 연동(트랜잭션 필터 q·method, planToken·INVALID 재계획, 보존 결손 헤더 경고, v1 서버 필터 차단) -2026-09-28`

**아직 남은 일**: 푸시(사용자) · 병합본으로 BE 재기동 후 152·154 런타임 실측(재기동은 명시 요청 시) · 154 런타임 실호출·브라우저(임시 계정 필요) · 원문 노출 틈 티켓 발급 · 155·156 설계 결정(아래 표 그대로) · ZM-152 계약서 `🔄 FE 요청사항` R-FE1(표본 값 정정)·R-FE2(슬롯→메트릭 이름) · `apmHelpContent.test.ts` master 실패.

---
- **구현 4건(151·152·153·154)은 전부 BE·FE master에 반영됐다(미푸시).** 임시 워크트리(`zm-151-be`·`zm-154-be`·FE 154)는 모두 정리됐고 양쪽 master 작업 트리는 깨끗하다(09-22 확인).
- **커밋 현황(전부 미푸시)**
  - BE master: `0c3d9e6` #ZM-151 #ZM-153(합침, 사용자 결정) → `3741f37` #ZM-151 마이그레이션 **V60→V64** 재번호 → `b2c564a` #ZM-154 BE. 그 사이 `9ad1fd5` #ZM-122 설치 가이드 액티브 요청 스위치(백로그 B0)
  - FE master: `3212e4c` #ZM-151 #ZM-153 설정 화면 · `2e1ae38` #ZM-122 SLO 사이드바 테스트 · `2c58efb` #ZM-152 · `1954534` #ZM-122 서비스 맵 옛 테스트 교체 · `39ece8e` #ZM-154 FE
- 🔴 **런타임 종단 확인**: 154 BE EP는 09-22 curl 실측 통과(실행 중 :3000이 병합본을 이미 포함 — 재기동 없음, FE 보고 §4.1). 151·153은 아직 — 실행 중 BE가 `0c3d9e6` 이후 기동됐으니 같은 방식으로 볼 수 있다(VPC 구간 조회·정리, 구성 수집 주기). 154 브라우저 `saveAs` 저장·비관리자 원문 체크 미노출은 미확인.
- 🔍 **코덱스 검수(09-22 사용자 지시, sol high)**: 요청서 [`../../features/apm/data-export/review_zm-154-apm-data-export.md`](../../features/apm/data-export/review_zm-154-apm-data-export.md)(하단에 결과 요약·반영 상태) — 원문 `review_zm-154-apm-data-export-{be,fe}_codex.md`. **판정: 양쪽 "수정 후 재검수"** — 🔴 BE R1=FE R2 미래 `to` 재절단으로 계획↔파일 불일치 · BE R2 타입 불일치가 `INVALID_DATA` · BE R3 실패 경로 테스트 · FE R1 다운로드 중 계정 전환 시 이전 계정 파일 저장. 반영은 사용자 결정 대기.

| 이슈 | 제목 | 상태 | 보고서 |
|---|---|---|---|
| **ZM-151** | 클라우드 스냅샷 적재량 정리 — 중복 제거 + 리전 범위 | ✅ BE·FE master 반영(09-21) | [zm-151](../../features/cloud/snapshot/zm-151_cloud-snapshot-storage.md) |
| **ZM-152** | 화면이 스스로 설명하게 — 빈 값 이유·보존 안내·지표 뜻 | ✅ FE master 반영(09-21) · BE 요청 8건은 별도 과제 | [zm-152](../../features/apm/self-explain/zm-152_screen-self-explaining.md) |
| **ZM-153** | 클라우드 스냅샷 자원별 수집 주기 분리 | ✅ 151과 한 커밋으로 반영(09-21) | [zm-153](../../features/cloud/snapshot/zm-153_cloud-snapshot-config-cadence.md) |
| **ZM-154** | APM 데이터 기간 지정 내보내기 | ✅ BE `b2c564a` + FE `39ece8e` master 반영(09-22) · F6(개요 전체 서비스)은 지시로 제외 · **코덱스 검수 반영 커밋** FE `9735c02`·BE `83cc85f`(09-22, 양쪽 승인) | BE [zm-154](../../features/apm/data-export/zm-154_apm-data-export.md) · FE [zm-154-fe](../../features/apm/data-export/zm-154_apm-data-export-fe.md) · 검수 [review](../../features/apm/data-export/review_zm-154-apm-data-export.md) |
| **ZM-155** | 메트릭 허용목록 확장 수단 | ✅ **2026-10-13 결정(이름만·상한 50·같은 테이블) → BE·FE 구현, 코덱스 BE 5회·FE 5회 승인 → 2026-10-19 사용자 승인 후 master ff 병합 BE `a9080eb`(V81)·FE `258d747`(미푸시).** 런타임 미실측 · 기능 문서 `moveseye-docs/features/APM-커스텀-지표-허용목록.md`(10-19) | 설계 [zm-155](../../features/apm/metric-allowlist/zm-155_apm-metric-allowlist-extension.md) · BE [zm-155_be-metric-allowlist](../../features/apm/metric-allowlist/zm-155_be-metric-allowlist.md) · FE [zm-155_fe-metric-allowlist](../../features/apm/metric-allowlist/zm-155_fe-metric-allowlist.md) · 계약 [`../../features/apm/metric-allowlist/contract_apm-metric-allowlist.md`](../../features/apm/metric-allowlist/contract_apm-metric-allowlist.md) · 인계 [`../../features/apm/metric-allowlist/review_zm-155-be-metric-allowlist.md`](../../features/apm/metric-allowlist/review_zm-155-be-metric-allowlist.md)·[`review_zm-155-fe-metric-allowlist.md`](../../features/apm/metric-allowlist/review_zm-155-fe-metric-allowlist.md) |
| **ZM-156** | APM 콜드 아카이브 | ✅ **2026-10-01 결정 7개 확정 → BE(S1~S3+S5 옵트인, V69)·FE(S4) 구현, 코덱스 BE v5·FE v3 승인 → 2026-10-02 사용자 승인 후 master ff 병합 BE `3637c77`·FE `2ed84f7`(미푸시), 워크트리 정리. 병합본 BE 컴파일·FE tsc·contract 0** | 설계 [zm-156](../../features/apm/cold-archive/zm-156_apm-cold-archive.md) · BE [zm-156_be-cold-archive](../../features/apm/cold-archive/zm-156_be-cold-archive.md) · FE [zm-156_fe-cold-archive](../../features/apm/cold-archive/zm-156_fe-cold-archive.md) · 계약 [`../../features/apm/cold-archive/contract_apm-cold-archive.md`](../../features/apm/cold-archive/contract_apm-cold-archive.md) · 인계 [`../../features/apm/cold-archive/review_zm-156-be-cold-archive.md`](../../features/apm/cold-archive/review_zm-156-be-cold-archive.md)·[`review_zm-156-fe-cold-archive.md`](../../features/apm/cold-archive/review_zm-156-fe-cold-archive.md) |

## 작업 위치 (현재)

| 레포 | 위치 | 비고 |
|---|---|---|
| BE | `C:/solutions/moveseye-be-spring` master (`baed6ee` 이후) | 151·153·154 병합 완료. 임시 워크트리 제거 |
| FE | `C:/solutions/moveseyee_fe` master (`39ece8e`) | 151·152·153·154 병합 완료 |

🔴 **작업 당시 BE를 워크트리로 나눈 이유**(재발 시 참고): IntelliJ BE(:3000)가 master의 `build/classes`를 공유해서 돈다. master에서 빌드하면 실행 중인 JVM이 깨진다.

## 커밋 전에 풀어야 했던 것 — 전부 해소

| # | 항목 | 결과 |
|---|---|---|
| 1 | 151·153 커밋 방식 | **합침**(사용자 결정) → `0c3d9e6` |
| 2 | 번역 파일 두 개를 세 이슈가 함께 고쳤다 | hunk 선별로 151·153 먼저, 152는 `2c58efb`에 |
| 3 | 마이그레이션 V60(151)이 master·`p5-live`와 충돌 | master가 V60~V63을 먼저 써서 **V64로 재번호**(`3741f37`), 어느 DB에도 V60 미적용 확인 |
| 4 | 설치 가이드 이슈 번호 | ZM-122로 커밋(`9ad1fd5`) |
| 5 | 🔴 ZM-122 커밋이 152의 파일 일부를 먼저 가져가 master가 미추적 모듈을 import(새 체크아웃 빌드 실패) | `2c58efb`가 그 모듈까지 담아 해소 |
| 6 | FE master에 원래 있던 실패(`apmServiceMapGraph.test.ts`가 지워진 `apmMapEdgeWidth` 참조) | `1954534`로 재작성. 테스트 폴더는 tsc 대상이 아니라 타입체크로는 안 걸린다 |

## 남은 일

| # | 항목 | 관련 |
|---|---|---|
| 1 | 🔴 병합 BE로 재기동 후 런타임 종단 확인(위 목록) — 10-19 기준 152·154 v2·155·156도 미실측(재기동 + 임시 계정 필요) | 151~156 |
| 2 | 푸시(사용자 직접) | 전체 |
| 3 | ~~ZM-152 BE 요청 8건~~ ✅ 09-28 `43570e6` | 152 |
| 4 | ~~ZM-154 F6 · 엔드포인트 필터~~ ✅ 09-28 후속 `213d875`·`01b7b28` | 154 |
| 5 | 원문 노출 틈 별도 이슈 발급(아래) | 154 발견 |
| 6 | ~~155·156 설계 질문 답 → 착수~~ ✅ 156 10-01 결정→10-02 병합 · 155 10-13 결정→10-19 병합 | 155·156 |

## 사용자 결정이 필요한 것

> ZM-155·156은 **설계 질문을 먼저 풀고 착수**(사용자 결정 09-16). → ✅ 156은 10-01(설계 §10), 155는 10-13(설계 §8)에 전부 답해 착수·종료. 아래 표의 155·156 행은 이력.

| 결정 | 누가 기다리나 |
|---|---|
| ~~**공통 감사 로그를 먼저 만들지**~~ ✅ 선행 안 함 — 둘 다 로그 기반(`[APM-ARCHIVE]`·`[APM-ALLOWLIST]`) | 155·156 |
| ~~보관 **의무**가 있는 고객이 실재하나~~ ✅ 없음 전제(A안) — 1m·스팬 옵트인, `maxHoldDays=7` | 156 |
| 🔴 BE `docker run`에 볼륨(`-v`)이 없다 — ✅ 파이프라인·설치 가이드 반영(10-02). **실서버 마운트 작업은 사람 몫(미확인)** | 156 |
| ~~커스텀 지표 상한 기본값~~ ✅ 서비스당 **50**(규칙 20, 이름만이라 1차는 닿지 않음) | 155 |
| 7일 프리셋을 고르면 인스턴스 탭 안내가 항상 뜬다 — FE 프리셋을 늦출지 BE 판정에 여유를 둘지 | 152 |
| 구성 수집 주기 기본값 30분이 적당한가(보안 노출 발견이 최대 30분 늦어진다) | 153 |

## SLO 사이드바 — 해결(사용자 결정: 사이드바 유지)

사이드바 추가(`3a09b33`)는 SLO가 ⚙ 설정 메뉴에 이미 있다는 걸 놓친 판단에서 나왔지만, 사용자가 **사이드바에 두기로** 정했다. 메뉴 테스트를 8개 노출로 고쳤고(`2e1ae38`), ⚙ 진입점도 유지한다. 설계서 `devdesign_apm-screens-wbs.md` S1 행에 기록.

## 🔴 별도 이슈로 올릴 것 — 원문 노출 틈(ZM-154 조사에서 발견, 확인함)

`ApmRawTextPolicy`는 "원문 SQL 보존이 **지금** 꺼져 있으면 저장된 값도 이미 마스킹돼 있다"고 가정하고 비관리자에게 저장값을 그대로 준다. 그런데 **켰다가 끈** 설치본에는 켜져 있던 동안 쌓인 원문 스택·SQL이 보존 기간(에러 그룹 90일·스팬 7일) 동안 남아 있어, **비관리자 화면에 원문이 보인다.** 내보내기(154)는 항상 마스킹으로 피했다. 화면도 "항상 마스킹"으로 바꾸는 것을 권고(마스킹은 멱등이라 부담이 작다).

## 참고 — 공유 IT DB 충돌

ZM-154 회귀에서 IT 9건이 실패했으나, 다른 워크트리(`p5`)가 같은 시각에 IT를 돌려 `moveseye_it` DB가 겹친 탓이었다. 단독 재실행에서 전부 통과. 워크트리마다 IT DB 이름을 가르는 게 근본 해결이다.

## 착수 중 뒤집힌 전제

| 전제(백로그) | 실제 | 결과 |
|---|---|---|
| 인스턴스·VPC 스냅샷 둘 다 중복 제거 | 인스턴스는 **회차당 한 행이 비용 계산 근거** | VPC만 바꿨다 |
| `queueDir` 정규화 규칙 재사용(절대 경로·`..` 금지) | 그 함수에 **그런 검사가 없다** | 백로그 두 곳 정정, 156은 새 경로 규칙 |
| 액티브 요청 스위치를 환경변수로 | 환경변수로는 **안 켜진다**(대조 실험) | 실행 명령의 `-D`로 |
