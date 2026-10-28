# Forge 앱 마켓플레이스 심사 기준과 외부 백엔드(Forge Remote) 인증

> 2026-09-29 · 공식 문서 확인(개발자 문서 2026-02-19 보안 요구사항 개정판 기준). 사례: [[2026-09-29-worklog-governance-analysis]].
> 관련: [[forge-app-rest-api]] · [[forge-licensing]] · [[moves-workforce]]

## 심사는 언제 빡세지나

**Forge 안에 머물면 신규 앱도 지금 앱과 같다.** 외부 백엔드로 나가는 순간 갈린다.

| | Forge 내부(배지 유지) | 외부 백엔드(배지 상실) |
|---|---|---|
| 최초 심사 | 영업일 10~15일, Forge 1주 목표. 스코프별 이유 기재 | 좌동 + 외부 호스트·전송 데이터·이유 기재 |
| 보안 요구사항 | 전 앱 공통(무료 포함). TLS·헤더·쿠키는 Atlassian이 처리 | "데이터를 외부로 보내는 Forge 앱" 분류: FIT 검증, 테넌트 격리, 파라미터화 SQL, 디스크 암호화, 자체 도메인 TLS 1.2+·HSTS 1년, 비밀키 관리 전부 우리 몫 |
| 버전 업데이트 | 수동 재심사 없음(결제 모델·앱 타입 변경만) | 외부 통신 권한 추가 = 메이저 버전 + 고객 관리자 승인, 그 시점에 배지 자동 상실 |
| 운영 규정 | 동일 | **진짜 비용**: 크리티컬 취약점 10일 내 수정, 미이행 30일 유예 → 검색 숨김 → 앱 정지 → 계약 해지. Ecoscanner 대상 |

- Runs on Atlassian은 심사가 아니라 `forge eligibility` 자동 판정. 외부 도메인·remotes·동적 웹트리거만 없으면 된다. apiRoute·Forge SQL·제품/스케줄 트리거는 무관.
- Cloud Fortified는 2026 3분기부터 **Atlassian Enterprise Certified**로 대체(선택). 파트너 검증은 신규는 등록 전 필수. 18개월 무업데이트는 검토 대상.

## Forge Remote 인증 — 자체 로그인 없이 Atlassian 체계로 끝난다

**들어오는 요청 = FIT(Forge Invocation Token).** 모든 요청 `authorization`에 Atlassian 서명 JWT. 필터는 JWKS(`https://forge.cdn.prod.atlassian-dev.net/.well-known/jwks.json`)로 서명, `aud`=앱 ID, `iss`=`forge/invocation-token`, 만료만 본다.
- 테넌트 키: `app.installationId` / `context.cloudId`. **body의 테넌트·사용자 값은 절대 신뢰 금지.**
- `principal`(호출 사용자)은 UI 모듈 호출에만 있다. 스케줄·이벤트 트리거엔 없다.

**나가는 Jira 호출.** manifest `remotes.auth`에 `appSystemToken`/`appUserToken`을 켜면 헤더로 토큰이 온다. `x-forge-oauth-system`=asApp(최소 2h), `x-forge-oauth-user`=asUser(최대 4h, 스케줄엔 없음). OAuth 등록·리프레시·자격증명 저장이 전부 불필요. 토큰은 파싱·로그 금지.

**FIT의 한계.** Forge가 호출을 시작할 때만 생긴다. 외부 시스템(SAP 등)이 백엔드를 직접 부르는 경로엔 없다. 선택지:
1. `core:apiRoute` 게이트웨이 → Forge 함수가 FIT 달고 백엔드 호출. 인증 체계 하나 유지. 25초 상한이라 조회형만. 호출자 accountId 수신은 미검증([[forge-app-rest-api]]).
2. Atlassian OAuth 2.0(3LO)을 백엔드가 직접 수용. 대화형 로그인 전제, 권한 판정 이중 구현.
3. 자체 API 키. 인증·인가·키 관리·보안 요구사항 전부 우리 몫.

"앱이 떠 있을 때만 라우팅되는 것 아니냐" → 서버리스라 상시 구동 개념이 없다. 외부 호출마다 게이트웨이가 함수를 깨운다. 대량 추출은 API 말고 배치가 파일을 민다.

## 멀티테넌트·검색·암호화 요약

- 스키마 공유 + `tenant_id` + Postgres RLS(`SET LOCAL app.tenant_id`). 스키마별·DB별 분리는 수백 테넌트에서 운영 지옥. 레지던시는 별도 축이라 US·EU 리전을 처음부터.
- 엘라스틱은 넣지 말 것. 복합 인덱스 + `pg_trgm`. 집계가 느리면 답은 집계 테이블·파티셔닝.
- "우리도 못 보게" = BYOK + 봉투 암호화(고객 KMS 키로 테넌트 데이터 키를 감쌈). 키 사용 로그·킬 스위치는 되지만 처리 중 평문은 있다. 종단간 암호화는 서버 계산 전부 포기 = 외부 백엔드 이유 소멸.

## 링크

- 승인 가이드 https://developer.atlassian.com/platform/marketplace/app-approval-guidelines/
- 보안 요구사항 https://developer.atlassian.com/platform/marketplace/security-requirements/ · FAQ https://developer.atlassian.com/platform/marketplace/security-requirements-faq/
- 집행 정책 https://developer.atlassian.com/platform/marketplace/marketplace-security-enforcement-policy/
- Runs on Atlassian https://developer.atlassian.com/platform/marketplace/runs-on-atlassian/ · Forge 자격 https://developer.atlassian.com/platform/forge/runs-on-atlassian-apps/
- Enterprise Certified https://developer.atlassian.com/platform/marketplace/atlassian-enterprise-certified-program/
- Forge Remote essentials https://developer.atlassian.com/platform/forge/remote/essentials/
