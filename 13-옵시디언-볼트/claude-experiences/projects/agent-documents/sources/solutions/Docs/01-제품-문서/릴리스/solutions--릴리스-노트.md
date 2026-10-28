---
title: MovesEye 릴리스 노트
doc_type: release
audience: [사용자, 운영자, 개발자]
status: draft
owner: MovesEye 팀
baseline: 2026-08-05 documentation baseline
source_of_truth: 배포 commit + Flyway + QA evidence
reviewed_at: 2026-08-05
review_cycle: per-release
deployment_scope: none; template baseline only
---

# MovesEye 릴리스 노트

실제 배포 단위가 확정되기 전까지 이 파일은 형식 정본이며 `draft`다. 작업 완료일과 배포일을 혼동하지 않는다.

## Unreleased

### Added

- MovesEye 문서 정본과 Obsidian MOC 구조를 도입했다.
- 제품 개요, 빠른 시작, 사용자 가이드, 아키텍처, 데이터 모델, 로컬·검증 Runbook, 용어집을 최초 작성했다.

### Changed

- 문서의 사실 원천을 OpenAPI·Flyway·FE route·engine module dependency로 명시했다.

### Known limitations

- Application·Database·GPU Monitoring은 route 존재만으로 current 기능으로 보지 않는다.
- Prometheus adapter는 collector engine Phase 1 이후 보류 상태다.
- 환경별 실제 배포·백업·복구 Runbook은 별도 검증이 필요하다.

## 미배포 (소스 기준선)

배포 단위에 아직 들어가지 않은 커밋이다. 배포 버전이 정해지면 해당 버전 절로 옮기고 배포 환경·시각·런타임 QA 증거를 채운다.

### ZM-157 — 역할 권한 BE 강제와 세션·토큰 회수 (2026-09-17 커밋)

기준:
- BE commit: `a2709d6` (브랜치 `ZM-157`, 기준 master `200c936`) — 미푸시·미병합
- FE commit: `06e1c8f` (브랜치 `ZM-157`, 기준 master `3b096c4`) — 미푸시·미병합
- AI commit: `1e8d2c1` (브랜치 `ZM-157`, 기준 main `8f0994f`) — 미푸시·미병합
- latest Flyway: BE는 버전 번호 추가 없음(반복 마이그레이션 `R__clear_seed_admin_public_mailbox.sql`만 추가). AI는 `V7__ai_insight_owner.sql`
- 배포 환경: 없음(`deployment_scope: source`)
- QA evidence: BE 루트 `*Test` 3,283건·`:engine-zabbix:test` 126건 통과(이후 수정분 인증·사용자 132건 재실행 통과), FE 관련 jest 753건 중 750건 통과(실패 3건은 기존 결함), AI 전체 165건 통과, Codex 정적 검수 5회. **BE 통합 테스트·런타임 검증 미실행**

#### Changed

- 역할 편집 화면의 모니터링(호스트 그룹·서버·네트워크)·이벤트 권한을 서버가 모든 요청에서 확인한다. 주소 직접 호출, AI 어시스턴트, 연결된 앱(MCP)에도 같은 권한이 적용된다.
- 호스트 상세 사용자 정의 차트의 추가·편집·삭제·배치 변경에 서버 또는 네트워크 모니터링 **편집 권한**이 필요하다. 기본 역할의 일반 사용자는 편집할 수 없다(2026-09-17 결정).
- 지리 맵 호스트 좌표 편집은 관리자 전용이다.
- 관리자 판정을 MovesEye 사용자 유형(ADMIN·SUPER_ADMIN) 하나로 통일했다. Zabbix 역할은 관리자 메뉴를 열지 않는다.
- 역할·권한을 브라우저에 저장하지 않는다. 새로고침 직후 메뉴는 서버 응답 뒤에 나타난다.
- 로그아웃 없이 다른 계정으로 로그인하면 이전 계정의 화면 데이터·AI 대화가 지워진다.
- 이벤트 통계는 비관리자에게 자기가 볼 수 있는 범위의 숫자만 보여 준다.
- 연결된 앱(MCP)에서 삭제 등급 작업은 기본 차단된다. AI 확인 카드는 대상 표·등급·입력을 기록에도 남기고, 한 요청에 5장까지다.
- 알람 인텔리전스 요약 캐시를 사용자별로 분리했다.

#### Security

- 권한 검사가 빠져 있던 모니터링·이벤트 API, 본인 프로필 수정, 이메일 변경, Zabbix 미연동 계정의 Zabbix 호출, 지리 맵 좌표 편집, 호스트 공용 차트의 대상 호스트 검사를 보완했다. 상세는 내부 문서 [권한 강제와 세션 회수](../%EA%B8%B0%EB%8A%A5/solutions--%EA%B6%8C%ED%95%9C-%EA%B0%95%EC%A0%9C%EC%99%80-%EC%84%B8%EC%85%98-%ED%9A%8C%EC%88%98.md)에 있다.
- 비밀번호 변경·재설정·비활성화·삭제 시 그 사용자의 모든 기기 로그인을 끝낸다. 본인 비밀번호 변경은 현재 기기만 재발급한다.
- 연결된 앱(MCP) 토큰은 요청마다 계정 상태·사용자 유형·MCP 권한을 다시 확인한다.
- 로그인·자격 증명 변경·인증 코드 처리를 사용자 단위로 직렬화했다.
- 기본 `admin` 계정의 초기 이메일을 제거한다.

#### Migration / Operator action

- 🔴 **배포 직후 모든 사용자가 한 번 다시 로그인한다**(최대 30분 안). 사전 공지가 필요하다.
- 🔴 **AI 서버는 구버전 프로세스를 모두 내린 뒤 교체 배포한다.** V7은 병행 실행과 코드만 되돌리는 롤백을 지원하지 않는다.
- BE 반복 마이그레이션이 기본 `admin` 행의 이메일이 초기 시드값 그대로일 때만 이메일을 비우고 미사용 인증 코드를 무효화한다. 관리자는 배포 후 실제 이메일을 등록한다.
- 새 Redis 키(`REFRESH_GEN:*`, `REFRESH_FAMILY_REVOKED:*`, `REFRESH_CONSUMED:*`, `REFRESH_SESSION_FAMILY:*`)가 생긴다. `REFRESH_GEN:*`은 만료가 없고 지우면 안 된다.
- 새 AI 설정: `AI_MCP_ALLOW_DESTRUCTIVE`(기본 `false`), `AI_MCP_MAX_DESTRUCTIVE_TARGETS`(기본 1). dev의 `AI_DEV_TOOLS_ENDPOINT` 기본값이 `false`로 바뀌었다.
- 병합 주의: BE는 master가 기준 커밋 이후 진행돼 리베이스가 필요하고, ZM-159와 충돌이 예상된다. ZM-151(V60)과는 순서 무관하다.
- 절차: [로컬·검증 Runbook §11](../%EC%9A%B4%EC%98%81/solutions--%EC%9A%B4%EC%98%81%EC%9E%90-%EB%9F%B0%EB%B6%81.md)

#### Known limitations

- 여러 화면이 함께 쓰는 API(홈·전역 검색·알림 벨·일부 목록)에는 역할 칸을 적용하지 않았다. 데이터 범위는 Zabbix 권한에 따른다.
- 일반 사용자는 마이 페이지에서 비밀번호를 저장할 수 없다(기존 제약, 후속 과제).
- 로그인 화면은 `FAILED_TO_ACQUIRE_LOCK`을 별도 안내하지 않는다(후속 과제).
- 역할 편집 화면에 사용처 없는 칸이 그대로 표시된다.
- 사용자·역할 변경 감사 로그가 없다.
- 세션 처리 Lua는 단일 Redis를 전제로 하며 Redis Cluster는 검증하지 않았다.

## 릴리스 작성 형식

```markdown
## [version] - YYYY-MM-DD

기준:
- BE commit:
- FE commit:
- latest Flyway:
- 배포 환경:
- QA evidence:

### Added
### Changed
### Fixed
### Security
### Migration / Operator action
### Known limitations
```

사용자 영향, 운영자 조치, schema·env 변경을 분리해 쓴다. commit 목록을 그대로 붙이지 않는다.

## 변경 이력

| 날짜 | 변경 |
|---|---|
| 2026-09-17 | "미배포 (소스 기준선)" 절 신설, ZM-157 항목 추가 |
