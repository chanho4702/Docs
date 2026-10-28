# 워크로그 거버넌스·외부 연동 요구사항 분석

> 작성일: 2026-09-29 · 기준 소스: `develop` (RFC-204 진행 중)
> 성격: **고객 요구사항 분석 + 아키텍처 옵션 검토**. 구현 결정 전이다.
> 「실측」은 이 세션에서 코드·사이트·공식 문서로 직접 확인한 것, 「미검증」은 아직 확인하지 못한 것.
> 관련 문서: `_workspace/api-exposure/API_EXPOSURE.md`(apiRoute 실측, 2026-09-16), `_workspace/competitive-analysis/`

---

## 0. 결론 요약

| 질문 | 답 |
|------|-----|
| 요구사항 A(API 연동)는 지금 되는가 | **부분**. 워크로그·프로젝트 매핑은 Jira REST로 이미 조회 가능. 앱 산출 지표(진척률·비용)는 `core:apiRoute` 필요. OData는 Forge에서 불가 |
| 요구사항 B(승인·마감·감사)는 지금 되는가 | **네 항목 모두 없음** |
| 전부 수용하려면 외부 백엔드가 필요한가 | **아니다.** 워크로그 미러를 Forge SQL에 쌓으면 감사·승인 기록·마감 감지까지 Forge 안에서 된다. 외부 백엔드가 필요한 건 OData·대용량 배치뿐 |
| 잠금(Lock)의 사전 차단은 되는가 | **어떤 구조든 안 된다.** Jira에 워크로그 쓰기 검증 훅이 없다. 고객이 Jira 권한 스킴에서 편집 권한을 회수해야 한다 |
| 권장 경로 | **1단계 미러형(Forge 내부)** → 잠금 강제가 계약 조건이 될 때만 원본형 전환 |
| 신규 프로젝트 기간 | 개발 12~16주, 검수 포함 약 4개월 (1인 + AI 보조, 미러형 + REST) |

---

## 1. 고객 요구사항 원문

**A. API/연동**
- API 키 발급 및 외부 연동(REST/OData)이 가능한가 — Tempo-SAP처럼 매출 진행률 추적용 연계

**B. 워크로그 거버넌스**
- B-1 워크로그 제출·승인(PM이 팀원 시간을 검토·승인) 워크플로우
- B-2 월/기간 마감(타임시트 Lock)
- B-3 워크로그 수정 시 이전 값이 보존되는 변경 이력(감사로그)
- B-4 삭제된 워크로그의 이력

---

## 2. 현재 상태 (실측)

| 요구 | 현재 코드 | Jira가 기본 제공하는 것 | 난이도 |
|------|-----------|--------------------------|--------|
| A. API 키·외부 연동 | 없음. `core:apiRoute` 조사만 완료(9-16), manifest 미커밋 | 워크로그·`moves_RMS_projectId` 커스텀 필드는 Jira REST/JQL로 조회 가능 | 중 |
| B-1 승인 워크플로우 | 없음 | 없음 | 상 |
| B-2 기간 마감 | 없음 | 없음 | 상 |
| B-3 수정 이력 | 없음 | 부분 — 이슈 changelog에 시간값 변화만. 날짜·코멘트 변경, 이전 값 전체는 없음 | 중 |
| B-4 삭제 이력 | 없음 | 부분 — `/rest/api/3/worklog/deleted`가 삭제된 id·시각만 반환. 본문 소실 | 중 |

확인 방법: `src/`·`static/ui/src` 전역 grep(`approv`, `lock`, `audit`, `worklog.*histor`) — 히트 없음. `src/rdb/schema/ddl/worklog.js`는 주석 처리된 스케치만 있음.

**구조적 전제.** 워크로그는 Jira 이슈에 저장되고, 우리 앱은 프론트에서 `requestJira`를 사용자 권한으로 호출해 쓰고 지운다(`requestJira.js`의 `addWorklog`/`updateWorklog`/`deleteWorklog`). 사용자는 우리 앱을 거치지 않고 Jira 화면에서 직접 고칠 수 있다. → **우리 화면만 막는 소프트 통제는 우회된다.**

---

## 3. 항목별 분석

### 3.1 A. API/연동

- **워크로그와 프로젝트 매핑은 지금도 외부에서 가져갈 수 있다.** SAP가 Jira API 토큰으로 워크로그를 긁어가고 `moves_RMS_projectId`로 우리 프로젝트에 묶으면 1차 연동이 된다.
- **앱 산출 값(진척률·비용·MM)은 노출 경로가 없다.** `core:apiRoute`가 필요하며 9-16 실측 제약은 다음과 같다.
  - 모듈 사용만으로 메이저 버전 상승 + 고객사 관리자 승인
  - 커스텀 스코프는 환경별 선등록·삭제 불가·20개 상한
  - 권한 가드·PermissionMap·라이선스 검사가 **통째로 우회**되는 별개 진입점 → 판정 로직을 공용 함수로 분리해야 함
  - 호출자 accountId 수신 여부 **미검증**(3LO 연동 생성 1단계 남음)
  - Runs on Atlassian 배지는 **유지**(실측)
- **OData는 Forge에서 제공 불가.** `$metadata`·`$filter` 파서를 25초 함수 안에서 표준 준수로 만드는 건 무리. 외부 서버가 있어야 한다.
- 대안: 워크로그 CSV 추출(RFC-190)을 "수동 연동"으로 제시.

### 3.2 B-1 승인 워크플로우

- 워크로그별 상태(제출·승인·반려), 제출 단위(주/월), PM 검토 화면, 반려 사유, 알림, 권한 키가 전부 신규.
- **"승인 기록"인지 "승인 후 수정 차단"인지** 요구 수준을 먼저 갈라야 한다. 후자는 B-2와 같은 벽에 부딪힌다.

### 3.3 B-2 기간 마감

- Jira에 워크로그 잠금 기능이 없고, Forge에 워크로그 쓰기 사전 검증 훅이 없다(워크플로우 validator는 트랜지션 전용).
- 가능한 방식 두 가지:
  1. **Jira 권한 스킴**에서 "자기 워크로그 편집·삭제" 회수 + 우리 앱이 대신 쓰기. 우리 앱도 asUser로 쓰므로 asApp 쓰기로 바꿔야 하고, asApp 지양 방침과 충돌.
  2. **워크로그 이벤트 트리거**(`avi:jira:created|updated|deleted:worklog`)로 마감 기간 변경을 감지해 되돌리거나 경고. **"잠금"이 아니라 "감시 후 복구"**라고 정확히 설명해야 한다.
- 2번이 현실적. 1번은 고객이 권한 스킴 변경을 수용해야 하므로 도입 조건으로 명시.

### 3.4 B-3·B-4 수정·삭제 이력

- 이전 값을 보존하려면 **워크로그 미러 테이블**이 필요하다. 이벤트에는 변경 후 값만 오므로 이전 값은 우리 마지막 스냅샷에서 가져온다.
- 삭제 이벤트에 본문이 안 실려도 미러가 있으면 삭제 기록이 남는다 → B-3·B-4는 한 묶음.
- 놓친 이벤트는 Jira `worklog/updated`·`worklog/deleted`(since 타임스탬프) 조회로 주기 보정. 이 두 API가 정확히 이 용도다. 구독 스윕(`SubscriptionSweeper`)과 같은 구조라 재사용.
- 삭제 이벤트 페이로드에 워크로그 본문이 실리는지는 **미검증**(배포 검증 대상).

---

## 4. 아키텍처 옵션

### 4.1 옵션 비교

| | ① 미러형 (Forge 내부) | ② 원본형 (Forge 내부) | ③ 외부 백엔드 (Java + Postgres) |
|---|---|---|---|
| 워크로그 원본 | Jira | 우리 DB(Forge SQL), Jira는 투영 | 우리 DB(Postgres), Jira는 투영 |
| B-3·B-4 감사 | ○ | ○ | ○ |
| B-1 승인 기록 | ○ | ○ | ○ |
| B-1 승인 후 차단 / B-2 잠금 | 감지·복구만 | 우리 화면 강제 + Jira 우회는 감지·복구 | 좌동 |
| A REST | apiRoute | apiRoute | apiRoute 게이트웨이 또는 자체 |
| OData | × | × | ○ |
| Runs on Atlassian 배지 | 유지 | 유지 | **상실** |
| 기존 화면 개조 | 없음 | 전 분석 화면이 우리 DB를 읽도록 개조 | 좌동 + 인프라 |
| 저장 상한 | Forge SQL 1GiB | 1GiB | 무제한 |
| 실행 제한 | 25초/600초 | 25초/600초 | 없음 |

### 4.2 용량 산정 (미러형이 Forge SQL 안에서 되는 근거)

| 가정 | 수치 |
|------|------|
| 워크로그 1건 + 이력 1건 | 약 300바이트 |
| 200명 × 하루 5건 × 240일 | 연 24만 건 |
| 연간 적재량(수정 이력 포함 2배) | 약 150MB |
| Forge SQL 상한 | 1GiB |

수년치 수용 가능. 종료 프로젝트 아카이빙(저장소 모니터링 후속)을 붙이면 더 여유. 단 인력 분석 때 Forge SQL 적재를 배제했던 결정(`project_resource_analysis_perf`)의 이유를 다시 확인할 것.

### 4.3 동기화 설계 핵심 (①·② 공통)

- 수집: Forge 워크로그 이벤트 트리거 3종 → 미러 upsert + 이력 append.
- 보정: 시간별 스케줄로 `worklog/updated`·`worklog/deleted` since 조회 → 누락 흡수.
- Jira에 계속 써야 한다. Jira 시간 추적 필드, 다른 앱, Jira 기본 리포트가 Jira 워크로그를 본다.
- 원본형이면 충돌 규칙 단일화: "우리 DB가 이기고 Jira 편집은 되돌린다". 사용자가 되돌림을 겪으므로 고객에게 권한 스킴 회수를 권고.
- 입력 화면은 내 워크로그 페이지의 `WorklogModal`이 이미 있어 신규 부담이 적다.

### 4.4 판단

- **전부 수용하면 외부 백엔드가 맞다**는 결론은 정확히는 "워크로그를 우리가 소유하는 구조로 가야 한다"이며, 소유 자체는 Forge SQL로도 된다. 외부 백엔드를 강제하는 건 **OData와 대용량 배치**뿐이다.
- 권장: **① 미러형으로 시작** → 잠금 강제가 실제 계약 조건이 될 때 ②로 전환. 미러 테이블과 보정 스윕은 ②의 기반이 되므로 버리는 작업이 없다.
- ③은 이 고객 하나의 OData 요구로 갈 일이 아니다. 필요하면 **메인 앱은 유지하고 연동 전용 앱을 별도로** 두는 게 낫다(배지는 앱 단위).

---

## 5. 신규 프로젝트 기간 추정

전제: 개발자 1명 + AI 보조, 범위 = ① 미러형 + REST(apiRoute). OData·잠금 사전 차단 제외.

| 순서 | 모듈 | 기간 | 비고 |
|------|------|------|------|
| 0 | 기술 검증 스파이크 | 1주 | 워크로그 이벤트 페이로드·누락률, apiRoute 호출자 신원. 결과로 뒤 일정이 흔들림 |
| 1 | 워크로그 미러 + 감사 로그 (B-3·B-4) | 2~3주 | 테이블, 트리거 3종, 보정 스윕, 이력 화면 |
| 2 | 기간 마감 (B-2) | 2주 | 마감 설정, 변경 감지·되돌리기·알림, 우리 화면 입력 차단 |
| 3 | 승인 워크플로우 (B-1) | 3~4주 | 제출 단위·상태 모델·PM 검토 화면·반려·알림·권한 키 |
| 4 | REST API (A) | 2~3주 | 판정 로직 공용 함수 분리, 엔드포인트 3~4종, 키 발급 가이드, 메이저 버전 승인 절차 |
| 5 | 안정화·E2E·문서·고객 검수 | 2~3주 | 지금까지 E2E를 거의 안 했으므로 크게 잡음 |
| | **합계** | **12~16주** | 검수 포함 약 4개월. 2명이면 1·2·4 병렬로 10주 안팎 |

근거: 구독(RFC-171) 설계 3판→dev 배포 약 1주, 팀 관리(RFC-147) P0~P3 약 1주. 둘 다 E2E·고객 검수 없음.

일정을 흔드는 것:
- 이벤트 누락이 심하면 보정 스윕 비중 증가 → 1이 +1주
- apiRoute가 호출자 신원을 안 주면 자체 키 발급·검증 계층 추가 → 4가 +1~2주
- 승인이 "수정 차단"까지 요구되면 ② 원본형 → 3이 두 배 + 기존 분석 화면 개조

계약 문구에 넣을 것:
- OData 미포함, REST 제공
- Jira 화면 직접 편집 차단은 고객 Jira 권한 스킴 변경이 선결 조건
- 메이저 버전 승인은 고객 Jira 관리자 작업

---

## 6. 마켓플레이스 심사 기준 (공식 문서 확인, 2026-09-29)

### 6.1 신규 앱 최초 심사 (공통)

- 일반 영업일 10~15일, Forge 앱 1주 목표. 파트너 등급 Silver 이상은 빠름.
- 제출 시 필수 기재: 요청 API 스코프 각각의 필요 이유 / 외부 호스트 목록과 전송 데이터·이유.
- 보안 요구사항은 **무료 앱 포함 모든 클라우드 앱** 적용. Runs on Atlassian 면제 항목은 문서에 명시 없음.
- 최초 승인 뒤 일반 버전 업데이트는 재심사 없음. 재심사는 결제 모델 변경·앱 타입 추가 때만. (9-16 실측과 일치)
- 보안 요구사항은 매년 4월 개정, 10월 말 발효. 현재 기준 2026-02-19 개정판.

### 6.2 Forge 내부에 머무는 경우 (①·②)

- 추가 부담은 스코프 정당화뿐(워크로그 쓰기·워크로그 이벤트·apiRoute 커스텀 스코프).
- TLS·보안 헤더·쿠키·인증서는 Atlassian 호스팅이라 우리 몫 없음. 남는 건 입력 검증, 취약 라이브러리 배제, Node 지원 버전, 보안 담당자 등록.
- Runs on Atlassian은 심사가 아니라 `forge eligibility` 자동 판정. 외부 도메인·remotes·동적 웹트리거만 없으면 됨. apiRoute·Forge SQL·제품 트리거·스케줄 트리거는 제한 대상 아님.

### 6.3 외부 백엔드로 나가는 경우 (③)

- "데이터를 외부로 보내는 Forge 앱" 분류 → FIT 검증, 테넌트 격리, 파라미터화 SQL, 외부 저장 데이터 디스크 암호화, 자체 도메인 TLS 1.2+ 및 1년 이상 HSTS, 보안 헤더, 비밀키 관리가 전부 우리 책임.
- 외부 통신 권한 추가·변경 = 메이저 버전 + 고객 관리자 승인, 그 시점에 배지 자동 상실.
- **심사보다 운영 규정이 무겁다.** 크리티컬 취약점 10일 내 수정, 미이행 시 30일 유예 → 검색 숨김 → 앱 정지 → 파트너 계약 해지. Ecoscanner 취약점 공개 대상.

### 6.4 프로그램 변화

- Cloud Fortified는 2026 3분기부터 신규 접수 중단, **Atlassian Enterprise Certified**로 대체. 선택이지만 엔터프라이즈 영업엔 목표로 삼을 것.
- 파트너 검증: 신규 파트너는 등록 전 완료 필수, 기존은 6개월.
- 18개월 무업데이트 앱은 검토 대상.

---

## 7. 외부 백엔드를 택할 경우의 설계 메모 (③ 전용)

### 7.1 멀티테넌트

- 설치 1건 = 테넌트 1개. 마켓플레이스 보안 요구사항에 "테넌트 격리"가 명시 항목.
- 테넌트 식별은 **반드시 FIT에서**(`app.installationId`, `context.cloudId`). 요청 body 값은 신뢰 금지(apiRoute 조사의 사칭 리스크와 동일).
- 권장: 스키마 공유 + 전 테이블 `tenant_id` + **Postgres RLS**. 요청마다 `SET LOCAL app.tenant_id`, RLS가 필터 강제 → 서비스 코드에서 WHERE를 빠뜨려도 남의 데이터가 안 나간다(권한 감사에서 밟은 "형제 경로 우회"를 DB 층에서 차단).
- 스키마별·DB별 분리는 수백 테넌트에서 마이그레이션·커넥션 풀 관리 부담. 물리 분리는 계약 조건인 고객만 별도 인스턴스.
- 데이터 레지던시는 별도 축. 최소 US·EU 리전 배포를 처음부터 전제(manifest remotes 리전별 주소). 나중에 붙이면 데이터 이전이 따라온다.

### 7.2 검색엔진(엘라스틱) — 보류

- 워크로그 검색 조건은 테넌트·프로젝트·사용자·기간·이슈 키 필터 + 코멘트 텍스트 정도. Postgres로 충분.
  - 복합 인덱스 `(tenant_id, project_id, work_date)`, `(tenant_id, account_id, work_date)`
  - 코멘트는 `pg_trgm` GIN. 한글은 Postgres 기본 형태소 사전이 없어 tsvector보다 trgm이 맞다.
- 규모: 테넌트당 연 수십만, 전체 수천만 건 → 단일 인스턴스 범위.
- 엘라스틱을 넣으면 End User Data 저장소가 하나 더 생겨 암호화·격리·백업 두 배 + 이중 쓰기 정합성. 이슈 텍스트는 Jira에 남아 JQL로 찾으면 된다.
- 집계가 느려지면 답은 검색엔진이 아니라 집계 테이블·파티셔닝.

### 7.3 인증 — Atlassian 인증 체계로 통일 가능 (공식 문서 확인)

**들어오는 요청: Forge Invocation Token(FIT)**
- Forge가 백엔드를 부를 때 모든 요청 `authorization` 헤더에 Atlassian 서명 JWT.
- 필터: JWKS로 서명 검증, `aud` = 앱 ID, `iss` = `forge/invocation-token`, 만료 확인. 자체 로그인·세션 불필요.
- JWKS: `https://forge.cdn.prod.atlassian-dev.net/.well-known/jwks.json`

| 클레임 | 용도 |
|--------|------|
| `app.installationId` | 설치 단위. 멀티테넌트 키 |
| `context.cloudId` | Jira 사이트 |
| `principal` | 호출 사용자 accountId. UI 모듈만. 스케줄·이벤트 트리거엔 없음 |
| `app.module.type/key` | 트리거 vs 화면 구분 |
| `app.apiBaseUrl` | 이 테넌트의 Jira API 주소 |

**나가는 호출: Jira API**
- manifest `remotes.auth`에 `appSystemToken: true`, `appUserToken: true` → 헤더로 토큰 동봉.
  - `x-forge-oauth-system`: asApp 역할. 최소 2시간.
  - `x-forge-oauth-user`: asUser 역할. 최대 4시간. 스케줄 트리거엔 없음.
- OAuth 클라이언트 등록·리프레시·자격증명 저장 불필요. 토큰은 파싱·로그 금지. asUser 기본·asApp 예외 원칙 그대로 유지.

**직접 호출 차단**: 유효한 FIT 없으면 401. Forge 프론트·함수·트리거를 거친 요청만 서명 토큰을 가진다.

**FIT의 한계**: Forge가 호출을 시작할 때만 생긴다. 외부 시스템(SAP)이 직접 부르는 경로에는 쓸 수 없다.

### 7.4 외부 시스템용 API 인증 3안

| | 방법 | 장점 | 단점 |
|---|---|---|---|
| 1 (기본) | `core:apiRoute` 게이트웨이 → Forge 함수가 FIT 달고 백엔드 호출 | Atlassian 인증 체계 유지, 권한·라이선스 판정 공용 함수 하나 | 25초 상한 → 조회형 API로 한정, 페이징 강제. 관리자가 설치본마다 앱 REST API 활성화. 호출자 accountId 미검증 |
| 2 | Atlassian OAuth 2.0(3LO)을 백엔드가 직접 수용 | Forge 없이 Atlassian 신원 | 대화형 로그인 전제라 시스템 연동엔 어색, 리프레시 토큰 보관, 권한 판정 이중 구현 |
| 3 | 자체 API 키 | 시스템 연동 단순 | 인증·인가·키 관리·보안 요구사항 전부 우리 몫 |

- "앱이 떠 있을 때만 라우팅되는 것 아니냐"에 대한 답: 서버리스라 상시 구동 개념이 없다. 외부 호출이 들어올 때마다 Atlassian 게이트웨이가 Forge 함수를 깨운다.
- 대량 추출은 API가 아니라 스케줄 배치가 파일을 밀어주는 방식.

### 7.5 고객 데이터 암호화 — "우리도 못 보게" 요구

| 수준 | 방식 | 고객이 얻는 것 | 한계 |
|------|------|----------------|------|
| 1 | 저장 암호화 + 우리 키 | 마켓플레이스 최소치 | 운영자가 마음먹으면 본다 |
| **2 (추천)** | **고객 키(BYOK) + 봉투 암호화**. 테넌트별 데이터 키를 고객 KMS 키로 감쌈 | 키 사용 로그로 감사, 키 끊으면 즉시 읽기 불가(킬 스위치), 백업 유출돼도 안 열림 | 처리 중 메모리엔 평문. "DB 열어봐도 못 본다"이지 "서비스 코드가 못 본다"는 아님 |
| 3 | 종단간 암호화(Forge 프론트에서만 복호화) | 우리가 정말 못 본다 | 서버 집계·검색·승인 판정·리포트 전부 불가 → 외부 백엔드 둔 이유 소멸. 이 요구는 "Runs on Atlassian으로 남아 달라"와 같은 말 |

수준과 별개로 반드시 할 것:
- **급여는 외부로 보내지 않는다.** Forge 저장소(Atlassian 안, 고객 레지던시)에 두고 외부 백엔드엔 워크로그 시간만. 비용 계산은 Forge 쪽에서 시간 × 단가.
- 사용자 식별자는 테넌트별 해시로 가명화, 이름·아바타는 화면에서 Jira로 채움.
- 코멘트는 검색이 필요 없으면 컬럼 암호화(검색과 맞바꿈).
- Java면 Tink로 컬럼 봉투 암호화, 고객 KMS는 표준 SDK. UCM의 암호화 블록 경험 재사용 여지.

---

## 8. 미검증 항목 (착수 전 스파이크)

| 항목 | 확인 방법 | 영향 |
|------|-----------|------|
| 워크로그 삭제 이벤트에 본문이 실리는지 | dev 환경에 트리거 배포 후 삭제 | 미러 없이도 B-4 가능 여부 |
| 워크로그 이벤트 누락률 | 대량 생성·수정 후 미러와 대조 | 보정 스윕 비중 |
| apiRoute 핸들러가 호출자 accountId를 받는지 | 3LO 연동 생성 후 프로브 호출(`src/apiProbe/`, `moves-rms` v5.1.0 배포 완료) | 외부 API 인증 1안 성립 여부 |
| 인력 분석에서 Forge SQL 적재를 배제한 이유 | `project_resource_analysis_perf` 메모·당시 문서 | 미러형 저장 방식 |

---

## 9. 공식 문서 링크

**심사·등록**
- 앱 승인 가이드라인: https://developer.atlassian.com/platform/marketplace/app-approval-guidelines/
- Forge 앱 등록 절차: https://developer.atlassian.com/platform/marketplace/listing-forge-apps/
- 리스팅 만들기: https://developer.atlassian.com/platform/marketplace/creating-a-marketplace-listing/
- 변경 이력: https://developer.atlassian.com/platform/marketplace/changelog/

**보안 요구사항**
- 본문(2026-02-19 개정): https://developer.atlassian.com/platform/marketplace/security-requirements/
- FAQ: https://developer.atlassian.com/platform/marketplace/security-requirements-faq/
- 추가 설명: https://developer.atlassian.com/platform/marketplace/security-requirements-more-info/
- 보안 가이드라인(권고): https://developer.atlassian.com/platform/marketplace/app-security-guidelines/
- 집행 정책: https://developer.atlassian.com/platform/marketplace/marketplace-security-enforcement-policy/
- 보안 버그 수정 정책: https://developer.atlassian.com/platform/marketplace/security-bugfix-policy/

**Runs on Atlassian**
- 프로그램·자격: https://developer.atlassian.com/platform/marketplace/runs-on-atlassian/
- Forge에서 자격 유지(`forge eligibility`): https://developer.atlassian.com/platform/forge/runs-on-atlassian-apps/

**인증 프로그램**
- Atlassian Enterprise Certified: https://developer.atlassian.com/platform/marketplace/atlassian-enterprise-certified-program/
- Cloud Fortified(종료 예정): https://developer.atlassian.com/platform/marketplace/cloud-fortified-apps-program-approval-process/
- 프로그램·기능 목록: https://developer.atlassian.com/platform/marketplace/programs-and-features/

**외부 백엔드**
- Forge Remote 기본(FIT·토큰 헤더): https://developer.atlassian.com/platform/forge/remote/essentials/
- Forge 개발자 약관: https://developer.atlassian.com/platform/forge/developer-terms/

**고객용**
- Marketplace App Trust: https://www.atlassian.com/trust/marketplace
