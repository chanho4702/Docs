# 워크포스 연동 채널 재설계 — property → webtrigger(앱 간) + apiRoute(외부)

2026-10-19 사용자 요청: "어프로벌이랑 워크포스간 통신은 프로퍼티로 안하고 apiRoute 열어서 rest api 방식으로 할거야, 지금 프로퍼티 방식으로 되어있는거 다 걷어주고 재설계하자"
스파이크 실측 후 확정: **"앱간 통신은 웹트리거, 외부 서비스 통신은 apiRoute"**, 첫 연결은 **연결 코드 붙여넣기(페어링)**.

## 확정 결정 (사용자)

| # | 결정 | 근거 |
|---|---|---|
| D1 | approval ↔ workforce 통신은 **webtrigger + Ed25519 서명**. entity property 기반 교환(rms.*·movesApproval.*·approval.ctl 등)은 **전부 제거** | 사용자 요청 |
| D2 | 외부 서비스(SAP·사내 서버 등) → 우리 앱 은 **apiRoute + 3LO**. 기존 guarded handler 재사용(권한 판정을 UI 와 동일하게) | 사용자 결정 |
| D3 | 첫 연결은 연결 코드 붙여넣기(한쪽 관리자가 상대 앱이 보여 준 서명된 코드를 붙여넣으면, 받은 URL 로 자기 코드를 회신해 양방향 완성). property 를 발견용으로도 쓰지 않는다 | 사용자 결정 |
| D4 | **Runs on Atlassian 자격 포기**를 수용한다(두 앱 모두). 스파이크 caller 실측 `App is egressing data`, dynamic webtrigger 도 실격 사유. 현재 approval 4.8.0·workforce 4.9.0 은 자격 있음 | 사용자 결정 2026-10-19 |
| D6 | **webtrigger 작업은 그 호출을 일으킨 사람의 컨텍스트로 처리한다.** 앱 간 호출은 사람이 상대 앱 화면에서 작업할 때 발생하므로, 보내는 앱이 resolver 컨텍스트의 `principal.accountId`(행위자)를 서명 봉투에 넣고, 받는 앱은 그 사람 기준으로 권한·범위를 판정한다(사람 컨텍스트 없는 시스템 작업과 구분). 제약: webtrigger 핸들러에선 `asUser()` 불가(실측 principal null) → 받는 쪽 Jira 권한 확인은 asApp + accountId 지정 권한 조회(예: permissions/check)·우리 DB 규칙으로, 보내는 쪽은 보내기 전에 asUser 로 1차 확인 | 사용자 2026-10-19 |
| D5 | 커밋 안 된 "워크포스 조직 조회 API 연결"(승인 앱이 워크포스 apiRoute 를 3LO 토큰으로 호출: `WorkforceOrganizationApiController`, KVS secret, egress `api.atlassian.com`, 설정 UI)은 앱 간 통신을 apiRoute 로 하는 경로 → webtrigger 로 대체하고 철거 | 사용자 확인 |

## 실측 근거 (C:\CloudJira\spikes\app-channel\RESULTS.md, GUIDE.md)

- caller 백엔드(principal null) → callee **dynamic webtrigger 200, 120~396ms**, Node `crypto` Ed25519 서명·검증 OK, 변조 감지, 200KB 본문 OK, 재배포 후 URL 유지, `webTrigger.getUrl(key)` = CLI URL.
- webtrigger 받는 쪽 context: `principal: null`, `installContext` 사이트 ARI만. egress 주소는 development `*.hello.atlassian-dev.net`(production 도메인 미측정).
- apiRoute: 토큰 없으면 401. 3LO + 동의 URL `sns={appId}.{envId}` 필요(없으면 custom scope 누락 403). Forge 백엔드에서도 200(1.7~1.9s). handler context `principal.accountId` = 토큰 발급자, `installContext`, `installation{ari,contexts}`. refresh token 회전 강제.
- 기존 검토: `_workspace/app-channel/WEBTRIGGER_VS_APIROUTE.md`, `WEBTRIGGER_APIROUTE_QNA.md`(property 유지 권고였으나 D4 로 기각; 보안 체크리스트·custom scope 20개 한도·메이저 업그레이드 등은 유효), `docs/worklog-approval/API_INTEGRATION.md`(이전 apiRoute 구현 기록 — `WorklogReadApi` 의 guarded handler 재사용 패턴).

## 범위

- 두 리포: `C:\CloudJira\moves-approval-jira`(승인 앱), `C:\CloudJira\moves-workforce`(워크포스). 설계서는 양쪽을 모두 다룬다.
- 현재 property 로 오가는 **모든 정보 흐름의 목록**(누가 게시·누가 읽음·트리거·주기·크기·신선도 요구)을 만들고, 각각을 webtrigger 호출(push/pull)로 대응시킨다. 대응 없는 흐름은 삭제 근거를 적는다.
- 페어링·키 교환·회전·해제, 요청 봉투(서명 대상, 재전송 방지, 사이트 대조, 작업 허용 목록), 실패·재시도·멱등, 상대 앱 장애 시 동작(단독 모드 폴백), 유휴 SQL 예산.
- 철거 순서와 이행(migration) 계획: 두 리포 배포 순서, 혼합 버전 구간, 기존 property 데이터 정리(삭제 여부·시점), SQL 마이그레이션 필요 여부(major upgrade).
- 외부용 apiRoute: 노출 범위(1차 대상 API), custom scope, 고객 설치 가이드 연결.
- 불변식 8(asUser 기본)·9(엔티티 프로퍼티 불신) 문구를 새 채널에 맞게 고칠 안.

## 완료 기준 (이번 단계 = 설계)

`_workspace/workforce-channel-rest/01_architect_design.md` — 정보 흐름 대응표, webtrigger 계약 표(작업명·방향·요청·응답·오류 코드·멱등 키), 페어링 시퀀스, 보안 봉투 명세, 철거 파일 목록(두 리포), 단계별 이행 계획, 플랫폼 미검증 목록, 열린 질문(제품 결정은 사용자에게).

## 범위 밖

- 이번 단계에서 코드 변경·배포·커밋 없음.
- 워크로그 visibility 통제(B 단계)는 Jira 워크로그 속성이므로 채널 문제가 아니다 — 유지.

## 설계 열린 질문 답 (사용자 2026-10-19)

| # | 답 |
|---|---|
| Q1 | **한 번에 전환**(이중 운행 없음, 새 버전에서 재페어링) |
| Q2 | 질문 없이 추천안 채택 — 각 앱이 자기 게시분 삭제, 못 지우는 것은 검증 코드 삭제로 무효화 |
| Q3 | **막기**(fail-close) — 확인 불가 표시, 연동 이슈 쓰기 거부, 기존 잠금 유지, 자동 단독 전환 없음 |
| Q4 | **이번엔 외부 API 없음** — apiRoute·custom scope 추가 안 함(D2 는 후속 과제로 보류) |
| Q5 | 질문 없이 추천안 채택 — 워크포스 `/v1/organization/teams` apiRoute 는 외부 공개 API 로 유지, 승인 앱 쪽 호출자만 철거 |
| Q6 | **양쪽 모두** 연결 코드 생성 가능 |

## 추가 요구 (사용자 2026-10-19)

- **검증 보고서 두 개를 실제 데이터 기반으로**:
  1. **webtrigger 보안 검증 보고서** — 실제 두 앱(development)을 tom-chkim-dev 에 배포·페어링한 뒤 공격 시나리오(위조 서명·본문 변조·재전송·다른 사이트·만료 iat·사칭 행위자·미허용 작업·URL 유출·STALE_LINK·해제 후 호출)를 실제로 보내 응답·상태 변화·감사 기록을 근거로 "보안상 문제 없음"을 증명하는 형태. 배포 시점은 **프론트·경계면 검증·코덱스 검수 통과 후**(사용자 선택).
  2. **apiRoute 검증 보고서** — 워크포스에 **사용자 조회 샘플 API**(GET /v1/organization/users) 를 열고, 여는 방법(scope 등록·배포·App REST API 활성화)·등록 방법(OAuth 앱·scope·sns·동의)·호출 결과 전 과정을 캡처. scope 는 기존 `read:organization:custom` 하나로 teams·users 공용(리더 결정, 미등록 상태라 설명만 수정).
- Q4(외부 API 없음)는 승인 앱 기준 유지. 워크포스 샘플 API 는 이 요구로 추가.
