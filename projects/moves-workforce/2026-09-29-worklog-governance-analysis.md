# 워크로그 거버넌스·외부 연동 요구사항 분석 (2026-09-29)

> 상태: **분석·옵션 검토만**. 구현 결정 전. 전체 문서는 리포 `_workspace/worklog-governance/WORKLOG_GOVERNANCE_ANALYSIS.md`.
> 관련: [[moves-workforce]] · [[forge-app-rest-api]] · [[forge-marketplace-review-and-remote]] · [[2026-08-31-competitive-analysis-v2]]

## 무엇을 물었나

고객 요구 5건. A) API 키·REST/OData 연동(Tempo-SAP식), B-1) 워크로그 제출·승인, B-2) 기간 마감(Lock), B-3) 수정 이력(이전 값 보존), B-4) 삭제 이력.

## 결론

- **A는 부분, B는 넷 다 없음.** 워크로그·프로젝트 매핑은 Jira REST로 이미 조회 가능. 앱 산출 지표는 `core:apiRoute` 필요. OData는 Forge 불가.
- **워크로그가 Jira 안에 있다는 구조가 B 전체 난이도를 결정한다.** 사용자는 우리 앱을 안 거치고 Jira에서 직접 고칠 수 있어 소프트 통제는 우회된다.
- **잠금의 사전 차단은 어떤 구조든 불가.** Jira에 워크로그 쓰기 검증 훅이 없다. 고객이 Jira 권한 스킴에서 편집 권한을 회수해야 한다. 우리는 이벤트 트리거로 "감시 후 복구"까지.
- **전부 수용해도 외부 백엔드가 필수는 아니다.** 워크로그 미러를 Forge SQL에 쌓으면(200명 기준 연 150MB, 1GiB 안) 감사·승인 기록·마감 감지가 Forge 안에서 된다. 외부 백엔드를 강제하는 건 OData와 대용량 배치뿐.
- 권장: **미러형(Jira 원본 + 우리 복사본·이력)으로 시작** → 잠금 강제가 계약 조건이 될 때만 원본형(우리 DB 원본, Jira 투영) 전환. 미러·보정 스윕은 원본형 기반이라 버리는 작업 없음.
- 기간: 1인 + AI, 미러형 + REST 기준 개발 12~16주, 검수 포함 약 4개월. 스파이크 1주(이벤트 페이로드·누락률·apiRoute 호출자 신원) 결과로 흔들림.

## 외부 백엔드(Java + Postgres)로 갈 때의 판단

- 멀티테넌트 필수(설치 1건 = 테넌트). 테넌트 키는 **FIT의 `app.installationId`**, body 값 신뢰 금지. 스키마 공유 + `tenant_id` + Postgres RLS로 WHERE 누락을 DB 층에서 차단.
- 엘라스틱은 보류. 워크로그 검색은 복합 인덱스 + `pg_trgm`(한글은 tsvector보다 trgm)로 충분. 검색엔진은 End User Data 저장소 하나 더 = 암호화·격리·백업 두 배.
- 인증은 Atlassian 체계로 통일 가능: 들어오는 요청은 FIT(JWKS 검증), 나가는 Jira 호출은 `x-forge-oauth-system`/`x-forge-oauth-user` 헤더. 단 **FIT는 Forge가 호출을 시작할 때만 생기므로** 외부 시스템 직접 호출은 apiRoute 게이트웨이(기본)·3LO·자체 키 중 선택.
- "우리도 못 보게" 요구는 **고객 키(BYOK) + 봉투 암호화**가 답. 처리 중 평문은 존재한다고 정직하게 말할 것. 급여는 애초에 외부로 안 보내고 Forge 저장소에 둔다. 종단간 암호화 요구는 사실상 "Runs on Atlassian으로 남아 달라"와 같은 말.

## 교훈

- **"외부 백엔드가 필요하다"는 결론은 대개 "누가 데이터를 소유하느냐"의 결론이다.** 소유권 문제를 먼저 갈라야 인프라 결정이 따라온다. 이번엔 소유권을 가져와도 Forge SQL로 되는 걸 뒤늦게 확인했다.
- 요구사항을 받으면 **"기록"인지 "강제"인지**를 먼저 묻는다. 승인·잠금은 이 둘의 비용이 몇 배 차이다.
- 심사보다 **운영 규정**이 진짜 비용이다(크리티컬 취약점 10일, 30일 유예 후 숨김·정지). 배지를 잃는 순간 이게 우리 몫이 된다.

## 후속: 외부 백엔드 원본형 설계 v1.1 (2026-09-30)

사용자 지시 "백엔드 밖으로 빼고 워크로그 우리한테 쌓는다, Java+Postgres 멀티테넌트, 조회 성능 최적화"로 설계서 작성 → Codex 검토(stdin으로 설계서 전달, 파일 읽기 없이) → v1.1. 리포 `_workspace/worklog-governance/EXTERNAL_BACKEND_DESIGN.md`.

Codex가 잡아낸 것 중 혼자 썼으면 그대로 구현했을 결함:
- **파티션 테이블 PK는 파티션 키를 포함해야 한다.** `PK(tenant_id, worklog_id)` + `PARTITION BY RANGE(work_date)`는 PG에서 생성 자체가 안 된다. → PK에 work_date, 전역 유일성은 비파티션 locator 테이블.
- **롤업 `+= delta`는 at-least-once 소비와 결합하면 중복 집계.** → dirty-key 절대 재계산(결과가 멱등).
- **외부 워커는 Forge 토큰을 스스로 못 얻는다.** outbox 워커가 Jira를 쓴다는 전제가 성립 안 함. → Forge 스케줄 함수가 시스템 토큰을 들고 백엔드 `/dispatch`를 부르는 pull 모델. 화면 작성은 요청 안에서 사용자 토큰으로 동기 투영(작성자 보존).
- `INCLUDE(seconds)` 커버링 인덱스와 HOT 업데이트는 양립 불가.
- 팀×기간 한 행으로는 사용자별 제출·반려 표현 불가 → `approval_subject`.
- RLS `current_setting('x')`는 설정 없으면 **오류**, `NULLIF(current_setting('x', true), '')`로 0행 fail-close. 그리고 installation→tenant 매핑은 RLS 밖 디렉터리가 필요(닭·달걀).

교훈: **설계 검토는 "구현하면 안 되는 것"을 잡는 데 Codex가 강하다.** 특히 DB 제약(파티션 PK, UNIQUE NULLS, EXCLUDE)과 멱등성. 설계서를 stdin으로 넘기면 샌드박스 오류와 무관하게 검토된다.

## 후속 2: v2.1 — 배포 2모드·첨부·프론트 차용 (2026-09-30, Codex 2차)

추가 요구(Jira 동기화·SaaS/자체 호스팅 2모드·이미지 첨부·프론트 현행 차용)를 v2.0으로 넣고 Codex 2차 검토 → v2.1.

**공식 문서에서 찾은 열쇠**: Forge **고객 관리형 원격지**(`remotes.configurable` + `permissions.external.configurable.enabled`, Preview). 관리자가 `permissions.remote.set()`으로 설치 단위 백엔드 URL을 지정 → 마켓플레이스 앱 하나로 SaaS·자체 호스팅 둘 다. 단 `configurable.enabled`는 프로덕션 배포 후 제거 불가, 설정된 원격지는 Runs on Atlassian·레지던시 비대상.

Codex 2차가 잡은 구조적 위험 3개:
- **설정 가능한 URL에 Jira 토큰을 보내는 신뢰 경계.** 관리자 동의 모달은 고지이지 방어가 아니다 → 토큰 없는 `api` / 사용자 토큰 `api-user` / 시스템 토큰 `sync` 엔드포인트 분리 + 핸드셰이크·installation 바인딩·recovery token(재설치 시 cloudId 일치로 자동 병합하면 테넌트 탈취).
- **Jira 이슈 첨부 미러를 기본 표시 경로로 삼은 것.** 가용성·권한이 Jira 첨부 상태에 종속, 이슈 첨부 목록 오염, 코멘트 표식이 동기화 hash를 깨뜨림 → 우리 S3 원본 + 서명 GET→blob 표시, 미러는 opt-in 보류.
- **resolver 한 줄씩 전환하면 같은 화면의 원본이 갈라진다** → cutover unit(mutation + 읽는 query 전부 + invalidation) 단위, 런타임 폴백 금지.

그 외: 퇴사는 `active=false` 관측 시만(스캔 부재≠퇴사), Jira엔 일반 메일 API가 없어 "PM 메일"은 채널 미확정, SAP 사번은 별도 암호화 테이블, `attachment_count` 같은 비정규화 카운트는 초기에 두지 않기, 401도 JSON 본문(invokeRemote 계약).

교훈: **"설계됨"이라고 쓰기 전에 본질적 제한을 수용 기준으로 따로 올려라.** 잠금=탐지 후 복구, 지연 반영 작성자=앱 계정, 자체 호스팅=레지던시 보증 없음. 괄호 안에 숨기면 계약 때 터진다.
