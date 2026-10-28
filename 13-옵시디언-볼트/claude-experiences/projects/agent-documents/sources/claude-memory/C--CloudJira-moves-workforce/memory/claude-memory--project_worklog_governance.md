---
name: project-worklog-governance
description: "워크로그 거버넌스·외부 연동 요구 5건(API/OData·승인·마감·수정/삭제 이력) 분석 완료(2026-09-29), 구현 결정 전. 권장 미러형(Forge 내부), 외부 백엔드는 OData·대용량 배치에만 필요"
metadata:
  node_type: memory
  type: project
  originSessionId: d0dab64f-fde5-4da7-a1a9-72056eacd9ed
  modified: 2026-09-29T02:24:09.547Z
---

고객 요구 5건 분석 문서: `_workspace/worklog-governance/WORKLOG_GOVERNANCE_ANALYSIS.md` (2026-09-29). 옵시디언: `projects/moves-workforce/2026-09-29-worklog-governance-analysis.md`, `topics/forge/forge-marketplace-review-and-remote.md`.

**결론:** A(API)는 부분(워크로그·매핑은 Jira REST로 이미 가능, 앱 지표는 apiRoute, OData 불가). B(승인·마감·수정/삭제 이력)는 넷 다 없음. **잠금 사전 차단은 어떤 구조든 불가**(Jira 워크로그 쓰기 검증 훅 없음 → 고객이 권한 스킴 회수). 전부 수용해도 워크로그 미러를 Forge SQL에 쌓으면(200명 연 150MB) Forge 안에서 됨. 외부 백엔드(Java+Postgres)를 강제하는 건 OData·대용량 배치뿐.

**권장 경로:** 미러형(Jira 원본 + 복사본·이력, 이벤트 트리거 3종 + `worklog/updated|deleted` 보정 스윕) → 잠금 강제가 계약 조건일 때만 원본형. 기간 12~16주(1인+AI, 미러형+REST).

**미검증 스파이크:** 워크로그 삭제 이벤트에 본문 실리는지 / 이벤트 누락률 / apiRoute 호출자 accountId / 인력 분석 때 Forge SQL 적재 배제 이유.

**외부 백엔드 결정 시:** 테넌트 키는 FIT `app.installationId`(body 불신), RLS, 엘라스틱 보류(pg_trgm), BYOK 봉투 암호화, 급여는 외부 비전송. 심사보다 운영 규정(크리티컬 10일·30일 유예)이 진짜 비용.

관련: [[project-api-exposure]] · [[feedback-no-asapp]] · [[project-competitive-analysis]] · [[reference-forge-storage-limits]]

**외부 백엔드 설계 v1.1 (2026-09-30):** `_workspace/worklog-governance/EXTERNAL_BACKEND_DESIGN.md`. 사용자 지시로 "워크로그 원본을 우리 DB에" 전제, Java 21 + PG16 멀티테넌트, 조회 성능 중점. Codex 검토(stdin 방식) 반드시 수정 14건 반영. 핵심 결정: 파티션 PK에 work_date 포함 + 비파티션 locator / 롤업은 dirty-key 절대 재계산(+= delta 금지) / **Jira 쓰기는 Forge 스케줄이 토큰 들고 백엔드 /dispatch를 부르는 pull 모델**(외부 워커는 Forge 토큰을 못 얻음) / approval_subject(사용자×기간) 분리 / RLS는 NULLIF(current_setting(...,true)) + tenant_directory bootstrap / 내부 user_id 도입 / Redis·replica·pg_trgm·BYOK는 측정 후 보류. 고객 요구 보고서: `CUSTOMER_REQUIREMENTS_REPORT.md`.

**v2.1 (2026-09-30, Codex 2차 반영):** 사용자 추가 요구 = Jira 동기화(Tempo 동일)·이전 요구 전부·프론트 현행 차용·**SaaS/자체 호스팅 2모드**·이미지 첨부. 핵심: 2모드는 마켓플레이스 앱 하나 + Forge **고객 관리형 원격지**(`remotes.configurable`, Preview, `configurable.enabled`는 프로덕션 후 제거 불가, 레지던시 비대상) / 토큰은 `api-user`·`sync` 엔드포인트에만 동봉(설정 URL 탈취 방어) + 핸드셰이크·installation 바인딩·recovery token / 첨부는 우리 S3 원본, 표시는 서명 GET→blob, **Jira 이슈 첨부 미러는 opt-in 보류**, 코멘트 표식 금지 / 프론트는 `invoke` import 139파일 codemod, 응답 `{success:true,...result}` 스프레드 유지, cutover unit(mutation+query+invalidation) 단위 전환·폴백 금지 / 퇴사는 `account_active=false` 관측 시만, 스캔 부재≠퇴사 / PM 메일 채널은 미확정(Jira에 일반 메일 API 없음, issue/notify는 이슈 귀속) / SAP 사번은 `external_identity` 별도 암호화 테이블. §12 착수 전 검증 20건, 첫째는 endpoint.auth 단위 토큰 제어 실측.

**결정(2026-09-30):** 배포 2모드(우리 호스팅 + 고객 환경 호스팅) **확정**. 남은 결정: 잠금=탐지 후 복구 수용 / 지연 반영 작성자=앱 계정 수용 / PM 메일 채널 / SAP 명세. 다음 작업: §12-1 endpoint.auth 단위 토큰 제어 실측(공개 HTTPS 수신 서버 필요).

**가시성 잠금 실측 (2026-10-08) — "잠금 사전 차단 불가" 결론 뒤집힘.** 앱(asApp)이 워크로그에 `visibility: {type:'role', value:'atlassian-addons-project-access'}`를 PUT하면 사람은 관리자 포함 전원이 조회·수정·삭제·해제 불가(PUT/DELETE 문서 조건에 "역할 구성원" 명시). 실측: 비구성원 PUT/POST는 400(`구성원이 아닙니다`), 앱 역할은 **시스템 역할**이라 관리자도 명단 편집 400, 그룹 가시성은 기본 설정에서 `GROUP_VISIBILITY_SETTING_NOT_ENABLED`, 팀 관리형 역할명은 `Administrator`(단수), 전역 `/role`에 같은 이름 3개라 `/project/{key}/role`로 id 잡을 것, 무료 플랜은 역할 명단 편집 불가. **미실측**: 잠긴 뒤 작성자 404 여부·`timespent` 합계 포함 여부(앱 자격 필요). 구현=`asApp` PUT 한 줄 + 읽기 경로 전부 asApp 전환(CollabWorklogFetcher는 잠금 역할 통과) + 앱 제거 전 전체 해제. 문서 `_workspace/worklog-governance/WORKLOG_VISIBILITY_LOCK.md`. **사고**: tom-chkim-dev WORK-16 워크로그 22578(Callie) 삭제됨, `moves-rms` env에 임시 웹트리거 포함 7.0.0 배포됨(원복 재배포 필요). 웹트리거 모듈 추가도 메이저 버전(RoA 신호).
