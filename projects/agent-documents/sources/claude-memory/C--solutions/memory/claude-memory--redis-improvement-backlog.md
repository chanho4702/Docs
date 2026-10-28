---
name: redis-improvement-backlog
description: "moveseye-be-spring Redis 활용 개선 — 09-23 후보 1(스탬피드 방어)+4(공통 캐시 헬퍼) ✅ 완료 #ZM-168 — master ff 병합(66f916e·e82b2da, 미푸시), 워크트리 정리, 가이드 _workspace/guides/guide_redis-cache.md. 2·3번(멀티 인스턴스용)은 설치형 특성상 보류 유지"
metadata: 
  node_type: memory
  type: project
  originSessionId: da79ce82-aa1e-4b61-b389-8c9157fc38a2
  modified: 2026-09-23T00:51:12.970Z
---

2026-09-19 조사 → **2026-09-23 구현**(사용자 지시 "레디스 강화 + 공통화 ㄱㄱ"). 브랜치 `redis-cache-common`, 워크트리 `C:/worktrees/redis-cache`(master `74c4025` 기준), ✅ **master ff 병합 완료(09-23)**: 커밋 `66f916e`(구현)·`e82b2da`(코덱스 검수 반영), master `2339a2d` 위 리베이스(다른 세션 ZM-122 커밋 4개와 겹침 0). 병합본 컴파일+관련 277건 통과. 워크트리·브랜치 제거. 이어서 **패키지 집결 커밋 `dc68dbe`**(RedisClientService·RedisCache+테스트 4 → `common/redis`, import 45파일; SingleFlightExecutor는 `common/concurrent` 유지, 도메인 어댑터 RedisRefreshTokenStore·RedisZabbixSessionStore는 포트 옆 유지). **미푸시**. 사용 가이드 `_workspace/guides/guide_redis-cache.md`. 코덱스(gpt-5.6-sol high) 조건부 승인 → 🟡3·🟢2 전부 반영(reload 별도 flight 키·`SingleFlightExecutor.run(key,supplier,timeout)` 합류 30초 제한·실 JSON 왕복 테스트·sleep 제거·호출처 테스트 2개). Jira ZM-168 설명에 요약 기재. 검수 인계서 `_workspace/features/platform/redis-cache/review_redis-cache-common.md`. 

## 한 것
- `common/redis/RedisCache` 신설: `getOrLoad(key, type, ttl, loader)` / `reload` / `evict`. 실패 격리(Redis 장애=미스)·역직렬화 실패 시 키 삭제·**스탬피드 방어**(기존 인메모리 `SingleFlightExecutor` 재사용, 리더 double-check)·null 미저장·로더 예외 전파.
- 호출처 6곳 교체(홈 요약·시스템 상태·자산 라이브·구성 현황·이벤트 가시 호스트·태그 필터 가드) — 복붙 readCache/writeCache 제거(-179/+114). 테스트: `RedisCacheTest` 10건 신설(동시 미스 8건→로더 1회 포함) + 호출처 테스트 4개는 `@Mock RedisCache` + `RedisCacheStubs.passthrough`. 대상 79건 통과, 전체 `:test` 4104건 중 내 변경 관련 실패 0.
- BE `CLAUDE.md` §3 주의사항 14번(새 캐시는 RedisCache로) 추가.

## 결정
- 분산 락(`acquireLock`) 방식은 안 씀 — 09-19 결정(설치형 1벌, 다중 인스턴스 없음)대로 JVM 내 single-flight로 충분하고 락은 비리더 폴링·Redis 왕복이 늘어남. HA 요구가 실제로 나오면 `RedisCache` 안에서만 확장(호출처 무수정).
- Spring Cache(`@Cacheable`) 미도입 — 사용자 스코프 키·null 미저장·refresh 조건이 SpEL로 흩어짐. 명시적 헬퍼가 기존 관례와 맞음.
- `ProblemTagFilterGuard` 저장 표현 `"1"/"0"`→Boolean. 업그레이드 직후 옛 값은 파싱 실패→헬퍼가 지우고 재감지(자가 복구).

**Why:** 홈·구성 현황처럼 요청 1건이 Zabbix 여러 콜을 부르는 캐시는 TTL 만료 순간 탭 N개가 동시에 미스 나면 N×M콜이 그대로 나갔다. 인스턴스 1대에서도 유효한 문제라 후보 1은 살아 있었고, 5곳이 같은 코드를 복붙하고 있어 공통화와 같이 처리하는 게 자연스러웠다.
**How to apply:** 새 Redis 읽기-통과 캐시는 무조건 `RedisCache.getOrLoad`. 키에 principal 축 넣는 건 호출처 책임. 🔴 `ApmSchemaIT`가 master에서 이미 실패 중(V65가 apm_setting 9번째 행 시드, 테스트는 8 고정) — 이 작업과 무관, ZM-122 쪽에서 한 줄 수정 필요. 남은 일: 푸시(사용자)·런타임 실측(BE 재기동 필요, 요청 시). 🔴 Git Bash에서 `cmd //c gradlew.bat`는 파일을 못 찾아 exit 1만 낸다(컴파일이 안 돈 것) — BE 빌드는 PowerShell 도구로. 🔴 전체 `:test`의 IT는 도커 `moveseye_it` DB를 워크트리끼리 공유하므로 다른 세션이 IT를 돌리는 동안엔 `FlywayMigrationSmokeIT`(마이그레이션 수 불일치)·`ApmSchemaIT`(중복 키)가 가짜로 깨진다 — 단독 재실행으로 판별.

관련: [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--zabbix-load-relief|zabbix-load-relief]] [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--scale-5000-hosts-audit|scale-5000-hosts-audit]] [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--zm136-chart-incremental-doc-todo|zm136-chart-incremental-doc-todo]] [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--architecture-onprem-scaleout-audit|architecture-onprem-scaleout-audit]] [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--codex-review-handoff|codex-review-handoff]] [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--commit-requires-approval|commit-requires-approval]]
