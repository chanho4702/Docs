---
title: ADR-0002 역할 권한의 BE 강제와 사용자 세대 기반 세션 회수
doc_type: decision
audience: [기술 리더, 개발자, 운영자]
status: current
decision_status: accepted
owner: MovesEye 팀
baseline: 2026-09-17
source_of_truth: 이 ADR · 기능 문서 features/권한-강제와-세션-회수.md
reviewed_at: 2026-09-17
review_cycle: event-driven
deployment_scope: source
---

# ADR-0002 역할 권한의 BE 강제와 사용자 세대 기반 세션 회수

## 상태

`accepted` — 2026-09-17 사용자 결정. 구현은 세 레포의 `ZM-157` 브랜치에 커밋됐다(BE `a2709d6`, FE `06e1c8f`, AI `1e8d2c1`). 미병합·미배포·런타임 미검증이다.

## 맥락

사용자 원칙은 "로그인한 사용자는 역할 편집 화면에서 지정한 권한 안에서만 작업한다"이다. 실제 구현은 이 원칙을 지키지 못했다.

- FE는 메뉴와 라우트만 숨겼고, BE는 역할 권한 중 APM·AWS 두 칸만 확인했다. 주소 직접 호출과 AI 어시스턴트·MCP 툴은 역할에서 끈 기능을 그대로 실행했다.
- 자체 DB에 호스트 id로 저장된 데이터(호스트 공용 차트, 이벤트 통계)는 Zabbix의 사용자별 필터를 거치지 않아, 사용자가 볼 수 없는 호스트의 데이터에 닿았다.
- Zabbix 미연동 비관리자가 시스템 토큰으로 Zabbix를 호출했다.
- refresh 토큰 폐기가 없어 비밀번호 변경·비활성화 뒤에도 다른 기기와 MCP 토큰이 유효했다.
- 자격 증명 경로(로그인·비밀번호 변경·OTP)가 서로 경합할 때 폐기된 세션이 살아남는 순서가 있었다.
- 시드 admin 계정의 초기 이메일이 누구나 열람할 수 있는 메일함이었다.
- FE의 관리자 판정 기준이 세 가지로 섞여 BE와 어긋났다.

제약은 네 가지였다. 기존 응답 계약(권한 거부 = HTTP 200 + body `code: 403`)을 유지해야 하고, 홈·사이드바처럼 여러 화면이 함께 쓰는 부팅 경로를 깨뜨리면 안 되며(2026-06-10 장애 전례), 다른 브랜치(ZM-151의 V60)와 Flyway 병합 순서가 얽혀 있었고, AI 서버는 단일 인스턴스 전제였다.

## 결정

1. **역할 권한은 BE가 최종 판정하고, FE는 같은 기준으로 표시한다.** 모니터링·이벤트 API에 `DmovePermissionChecker`(`requireView`·`requireEdit`·`requireAnyView`·`requireAnyEdit`)를 적용한다. 관리자는 BE·FE 모두 `userRole ∈ {ADMIN, SUPER_ADMIN}` 하나로 판정하고, Zabbix 역할은 쓰지 않는다. FE는 역할·권한을 브라우저에 저장하지 않고 이번 세션의 서버 응답만 쓴다.
2. **여러 화면이 함께 쓰는 API(공유 EP)에는 권한 칸을 적용하지 않는다.** 홈·전역 검색·알림 벨·SSE·`/hosts/server`·`/hosts/detail`·`/event/problems`·부팅 API가 해당한다. 이 API들의 데이터 범위는 Zabbix 사용자 토큰에 맡긴다.
3. **Zabbix 미연동 비관리자는 401이 아니라 200 + 403(`FORBIDDEN`)으로 거부한다.** 거부 시점은 요청 진입(`CallerContexts.from`)이 아니라 실제 Zabbix 토큰을 해석하는 시점이다.
4. **refresh 폐기는 사용자 세대와 로그인 계열로 하고, 발급·회전·세션 복원을 Redis Lua로 원자 처리한다.** 세대를 올리면 그 사용자의 전 기기가 무효가 되고, 로그아웃은 그 계열만 무효로 한다. 계열이 없는 기존 토큰은 거부한다.
5. **계정 경로는 사용자 행 잠금(`FOR UPDATE`)으로 직렬화한다.** 로그인은 잠금 대기를 5초로 제한하고, 넘으면 `FAILED_TO_ACQUIRE_LOCK`을 준다. OTP 전환은 같은 잠금 아래 조건부 UPDATE로 한다.
6. **시드 데이터 교정은 반복 마이그레이션(`R__clear_seed_admin_public_mailbox.sql`)으로 한다.** 시드 값 그대로인 행만 고치고 멱등이다.
7. **호스트 공용 차트(위젯) 쓰기는 `edit` 권한이 필요하다.** 기본 역할에서 `edit`은 관리자만 켜져 있으므로 일반 사용자의 차트 편집이 막힌다. 2026-09-17 사용자가 "그대로 진행"으로 결정했다.

부수 결정: 호스트 공용 차트는 기능 권한 뒤에 대상 호스트 가시성을 추가로 확인한다. 지리 맵 좌표 편집은 관리자 전용으로 한다. MCP 토큰은 요청마다 DB로 계정을 재확인한다. MCP의 파괴 작업은 기본 차단하고, 위험도는 입력으로 판정한다.

## 고려한 대안

| 대안 | 장점 | 비용·위험 | 판단 |
|---|---|---|---|
| FE 메뉴 숨김만 유지 | 변경 없음 | 주소 직접 호출·AI 툴·MCP로 우회된다 | 기각 |
| 공유 EP에도 권한 칸 적용 | 원칙에 더 가깝다 | 사이드바·홈이 통째로 깨진다(06-10 전례) | 기각, 적용 방식은 후속 과제 |
| 미연동 비관리자를 `CallerContexts.from()`에서 즉시 거부 | 구현이 단순하다 | Zabbix를 곁가지로만 부르는 자체 화면(자산 상세·홈 요약·자산 대시보드)이 통째로 깨진다 | 기각 |
| 미연동 비관리자를 HTTP 401로 거부 | 의미가 명확해 보인다 | FE가 재인증을 시도한 뒤 로그아웃시킨다 | 기각 |
| refresh 폐기를 "폐기 기준 시각"과 비교 | 기존 토큰 저장 구조를 바꾸지 않는다 | 검사와 발급이 분리되어 경합 시 폐기 뒤 새 토큰이 살아남는다. 같은 밀리초 경계를 구분하지 못한다. 1차 검수에서 결함 판정 | 1차 구현 후 폐기 |
| 계열 없는 기존 토큰 허용(호환) | 배포 후 재로그인이 없다 | 로그아웃과 회전의 경합을 막을 수단이 없다 | 기각, 전원 1회 재로그인 감수 |
| 시드 교정을 버전 마이그레이션 `V61`로 | 일반적인 방식이다 | `outOfOrder=false`라 ZM-151의 V60과 병합 순서에 따라 validate 실패로 기동이 멈춘다 | 기각 |
| V10 시드 파일 직접 수정 | 새 파일이 없다 | 적용된 설치본에서 checksum 불일치로 기동이 멈춘다 | 기각 |
| 차트 쓰기를 `view`로 허용 | 일반 사용자 편집이 유지된다 | 차트는 호스트 공용이라 조회 권한만으로 다른 사람의 화면을 바꾼다 | 기각(사용자 결정) |
| 판정기가 역할 권한을 요청 간 캐시 | DB 조회가 줄어든다 | 역할 변경이 캐시 만료까지 반영되지 않는다 | 기각, 요청 단위 캐시만 |
| MCP 쓰기에 서버 측 확인 게이트 | 사람 확인을 서버가 보장한다 | BE 토큰 발급 구조 변경이 필요하다 | 범위 밖, 파괴 작업만 기본 차단 |
| AI V7 호환안(구 4열 제약 유지·부분 유니크 인덱스) | 무중단 병행 배포 | 새 코드의 사용자별 행이 구 제약에 걸리고, 구버전의 `ON CONFLICT`가 부분 인덱스를 추론하지 못한다 | 기각, 정지 후 교체 배포 |
| 관리자 사용자 수정의 "수정하면 활성" 동작 제거 | 그룹 비활성 상태가 보존된다 | 현재 비활성 사용자를 되살리는 유일한 경로다 | 유지, 본인 경로만 차단. 상태 전용 API는 후속 |

## 결과

- 긍정적 영향:
  - 역할 편집 화면의 모니터링·이벤트 칸이 API·AI 툴·MCP에서도 같은 효과를 낸다.
  - 비밀번호 변경·재설정·비활성화·삭제가 다른 기기와 MCP 토큰에 즉시 반영된다.
  - 관리자 판정 기준이 BE·FE에서 하나가 됐다.
  - Zabbix 미연동 계정의 거부가 로그아웃으로 번지지 않는다.
- 감수한 비용:
  - 배포 직후 모든 사용자가 한 번 다시 로그인한다(access 토큰 만료, 기본 30분 안).
  - 기본 역할의 일반 사용자는 호스트 상세 차트를 추가·편집·삭제·재배치할 수 없다. 역할에서 서버 또는 네트워크 모니터링 `edit`을 켜야 한다.
  - 같은 사용자의 자격 증명 변경이 오래 걸리면 로그인이 최대 5초 기다린 뒤 실패할 수 있다.
  - MCP 요청마다 사용자 PK 조회가 1회 추가된다.
  - 공유 EP는 여전히 역할 칸으로 막히지 않는다.
  - Redis Lua가 여러 키를 한 번에 다뤄 단일 Redis(비클러스터)를 전제한다.
- 코드·운영·문서 영향:
  - BE: `DmovePermissionKey`(신규)·`DmovePermissionChecker`·컨트롤러 13개·`HostVisibilityChecker`(신규)·`RefreshTokenService`·`RedisRefreshTokenStore`(신규)·`UserService`·`McpAccessInterceptor`·`CallerContexts`·`ZabbixClient`·R__ 마이그레이션
  - FE: `utils/permissions.ts`·`routes/pageAccess.ts`·`utils/session.ts`·`utils/sessionEpoch.ts`·`useAuth`·진입점 5곳·차트·지리 맵
  - AI: `McpServerConfig`·`AiTool.effectiveTier`·`ConfirmCard`·`V7__ai_insight_owner.sql`
  - 운영: 배포 공지, AI 정지 후 교체 배포, 신규 Redis 키
  - 문서: [기능 문서](../%EA%B8%B0%EB%8A%A5/solutions--%EA%B6%8C%ED%95%9C-%EA%B0%95%EC%A0%9C%EC%99%80-%EC%84%B8%EC%85%98-%ED%9A%8C%EC%88%98.md), [관리자 가이드](../%EA%B0%80%EC%9D%B4%EB%93%9C/solutions--%EA%B4%80%EB%A6%AC%EC%9E%90-%EA%B0%80%EC%9D%B4%EB%93%9C.md), [로컬·검증 Runbook](../%EC%9A%B4%EC%98%81/solutions--%EC%9A%B4%EC%98%81%EC%9E%90-%EB%9F%B0%EB%B6%81.md), [릴리스 노트](../%EB%A6%B4%EB%A6%AC%EC%8A%A4/solutions--%EB%A6%B4%EB%A6%AC%EC%8A%A4-%EB%85%B8%ED%8A%B8.md)
- 재검토 조건:
  - 공유 EP의 권한 칸 적용 방식이 정해질 때
  - Redis Cluster 또는 AI 서버 다중 인스턴스로 전환할 때
  - 사용자·역할 감사 로그나 MCP 서버 측 확인 게이트를 도입할 때
  - 런타임 검증에서 재로그인·잠금 대기의 사용자 영향이 예상보다 클 때

## 근거

- 코드/측정/PoC:
  - BE `a2709d6`, FE `06e1c8f`, AI `1e8d2c1`(브랜치 `ZM-157`)
  - 단위 테스트: BE 3,283건·engine-zabbix 126건, FE 관련 750/753건, AI 165건 통과
  - Redis Lua 로컬 격리 키 수동 실측, 통계 SQL·R__·`FOR UPDATE` 대기 dev DB 읽기 전용·ROLLBACK 실측
  - 런타임 미검증
- 관련 문서:
  - 계약서 `C:/solutions/_workspace/contract_zm-157-permission-enforcement.md`
  - 검수 기록 `C:/solutions/_workspace/reviews/review_zm-157-permission.md`("2. 의도", 1~5차 검수)
  - 최종 보고 `C:/solutions/_workspace/reports/zm-157_permission-fix.md`
- Obsidian 경험 노트: 없음(작성 시점 기준)

## 변경 이력

| 날짜 | 변경 |
|---|---|
| 2026-09-17 | 최초 채택. 결정 7항과 버린 대안 기록 |
