---
name: premium-license-design
description: 2026-08-06 라이선스 설계 v4 확정(미결 M1~M9 전건 결정, 구현 착수본). 설계서 _workspace/devdesign_premium-edition.md
metadata:
  node_type: memory
  type: project
  originSessionId: 84c09b01-fb70-4426-8200-de981850aac4
  modified: 2026-08-06T04:06:36.395Z
---

STANDARD/PREMIUM 2티어 라이선스. 설계서 `_workspace/devdesign_premium-edition.md` **v4(2026-08-06)** — 미결 전건 확정, **구현은 아직 0**(BE에 `license/`·`premium/` 0건, ArchUnit 0건, FE 0건 — 08-06 실측).

**v3까지 확정(2026-07-29)**: 라이선스 **필수** 2티어 · 기간제+영구 · **갱신은 등록일부터**(이월 없음) · **만료=잠금 아니라 읽기전용** · 판정=`editionDefaults ∪ features` 합집합 · 키=RS256 JWT(**exp 대신 durationDays**)+jti 재사용 방지 · 게이팅 2레이어(전역 화이트리스트 `@LicenseExempt` + `@RequiresFeature`) · 에러는 **HTTP 200+바디 code**(402/403).

**v4에서 새로 정한 것(2026-08-06 세션)**:
- M1 유예 **30일** / M2 미보유 메뉴 **노출+자물쇠** / M3 maxHosts **강제·표시 모두 없음**(클레임 자리만 존치) / M4 **TRIAL 타입 삭제**(체험=기간제+`graceDays=0`) / M5 등록기한 **7일** / M6 **해당 없음(설치 고객 부재 → v3 최대 리스크 소멸)** / M7 이월 없음 / M9 ack 차단
- 🔴 **M8 = 단계적 차단(신설 P17)**: 읽기전용이 2구간 — `EXPIRED`(30일, 실시간 유지) → `ARCHIVED`(DB 조회만, 영구). 근거는 실측 — **엔진 포트 참조 20개 클래스가 host/cpu·memory·disk·network·home·event 등 모니터링 화면 전부**라, 실시간을 유지하면 만료 고객이 제품 본체를 계속 쓰고 차단하면 화면이 텅 빈다. `AccessMode`는 3단 유지하고 **`allowsLiveQuery()` 축만 추가**. 구현은 **엔진 포트 데코레이터 3종(@Primary)** — 소비 20개 클래스 무수정(P4 "if 흩뿌리지 않는다" 준수)
- **P2-1 수집층 중립**: `MetricDomain.GPU`·Zabbix 카탈로그는 `engine-api`/`engine-zabbix`에 두고 `premium/`엔 컨트롤러·서비스만. Capability≠Feature를 계층에 옮긴 것 (안 정했으면 1단계 GPU에서 A1이 바로 깨졌음)
- **P18 인터셉터 순서**: `Roles → VisitorId → AccessMode → Feature`. 라이선스를 앞에 두면 토큰 만료가 401 대신 LICENSE_REQUIRED로 나가 **FE single-flight refresh가 잠금 화면으로 오인**
- 활성 키 **1개**(부분 유니크 인덱스) · 발급 도구 = **대화형 .bat + Java CLI → `.lic` 파일**(검증과 같은 코드로 서명해야 "발급됐는데 제품이 거부" 방지) · 등록은 **파일 업로드+붙여넣기 둘 다**
- **dev 우회 스위치 안 만든다** — 프로파일 오설정이 운영 라이선스를 통째로 무력화하는 경로. 대신 dev용 PERPETUAL/PREMIUM 키 발급·등록

**재실측 drift(v3 전제가 깨진 것)**: Flyway **V16→V20**(V19까지 사용중) · `SchedulerJob`이 `jobKey()`/`String run(SchedulerSetting)`로 변경 · GET 106/쓰기 73 → **114/75**(컨트롤러 33) · 배치 6개·인터셉터 2종·에러 계약은 그대로.

착수 범위 = **0단계 커널 풀스택(BE+FE)**. 완료 판정 19개 항목은 설계서 §6.

관련: [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--collector-engine-direction|collector-engine-direction]] [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--be-package-structure|be-package-structure]] [[topics/backend/session-auth-hardening|session-auth-hardening]] [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--device-classification-feature|device-classification-feature]]


## 인덱스 상세 이관 (2026-09-02)

인덱스 압축으로 옮겨온 요약 — 본문과 중복될 수 있으며 본문이 우선.

프리미엄 라이선스 설계 — **2026-08-06 v4 확정(미결 M1~M9 전건, 구현 착수본·구현은 0)**. 라이선스 **필수**·기간제+영구·**갱신은 등록일부터**·판정=editionDefaults∪features·키=RS256 JWT(**exp 대신 durationDays**)+jti 재사용 방지·에러는 200+바디code. 🔴**M8=단계적 차단**: 읽기전용 2구간 EXPIRED(30일 실시간 유지)→ARCHIVED(DB만) — 엔진포트 20개 클래스가 모니터링 화면 전부라 유지도 차단도 곤란해서 나온 답, `allowsLiveQuery()`+포트 데코레이터로 구현. 🔴P2-1 수집층 중립(GPU enum은 premium 밖) 🔴P18 라이선스는 인증 **뒤**(앞에 두면 401 refresh가 잠금화면으로 오인). TRIAL 삭제·maxHosts 미사용·등록기한 7일·유예 30일·**M6 소멸(설치고객 없음)**·dev 우회스위치 금지. drift: V16→**V20**, GET 114/쓰기 75, SchedulerJob 시그니처 변경. 설계서 _workspace/devdesign_premium-edition.md
