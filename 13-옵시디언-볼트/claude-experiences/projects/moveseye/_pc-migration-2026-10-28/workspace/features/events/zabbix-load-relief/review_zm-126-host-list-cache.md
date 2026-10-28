# 검수 요청 — ZM-126 호스트 목록·가시성 집합 Redis 단기 캐시

- 커밋: `592f437` (브랜치 `ZM-123`, 워크트리 `C:/worktrees/zm-123-be`)
- 에픽: ZM-123 무브스아이 성능 향상
- 작성: 2026-09-03

## 범위·의도

접속자 수 = Zabbix 부하 배수였던 목록 경로에 짧은 캐시를 깐다. 홈 요약·추이 화면이 이미 쓰는
`RedisClientService` 패턴 복사.

- **서버 목록**(`GET /hosts/server`): Zabbix 4콜(host.get×2·item.get·problem.get) 결과를
  `ServersSnapshot`으로 30초 캐시. 키 = `HOST_LIST:server:{principal}:{groupids|all}` — 권한 축(사용자)과
  Zabbix 질의를 바꾸는 필터(그룹)만 키에 넣고, 키워드/상태/정렬/페이징은 캐시 뒤 앱에서.
  기본(이름) 정렬은 스냅샷 ASC 고정 + DESC는 뒤집기(키 폭발 방지).
- **그룹 목록**(`GET /hosts/hostgroups`): listGroups+전 그룹 host.get 결과를 사용자별 30초 캐시.
- **가시 호스트 집합**(ZM-125가 신설한 권한 스코핑 콜): 사용자별 60초 캐시 —
  이게 없으면 벨(60초 폴링)마다 인벤토리 1콜이 그대로 나가 사본 전환 이득의 절반이 샌다.
- 캐시에 실리는 DTO 3종(`ServerMonitoringDto`·`HostGroupItemDto`·`StatusProblemCountDto`)에
  `@Jacksonized` — @Builder 클래스는 이게 없으면 역직렬화가 깨져 **캐시가 조용히 항상 미스**가 된다.
  round-trip 테스트로 고정.

## 불안한 지점 (여기를 봐 달라)

1. **DESC 재현의 동등성**: 스냅샷 ASC + `Collections.reverse`가 기존 fetchHosts의
   `comparator.reversed()`와 항상 같은 순서인가 (동명 호스트 시 안정 정렬 차이 여부).
2. **권한 캐시 60초**: Zabbix에서 권한을 회수해도 최대 60초는 이전 가시성으로 목록·벨이 서빙된다 —
   수용으로 판단했는데(로그인 세션 축과 유사) 반박 여지.
3. **@Jacksonized 부작용**: 세 DTO는 API 응답에도 쓰인다 — 직렬화(출력) 형태가 변하지 않는지
   (@Jacksonized는 역직렬화 빌더 지정이라 출력 불변으로 알고 있음).
4. 스냅샷 안의 상태/사용률이 30초 정지 — 목록 화면 특성상 수용(상세 화면은 캐시 없음).
5. `getServers`의 기존 "hosts 비면 조기 반환" 분기를 통합 경로로 흡수 — 빈 결과의 응답 shape가
   기존과 동일한지(emptyCounts vs 집계 0).

## 검증 / 미검증

- ✅ BE 전체 테스트 그린(2m38s). 신규: 캐시 히트 시 Zabbix 무호출·미스 시 TTL 30초 저장·Jackson round-trip
  (서버·그룹 각각), 기존 정렬/필터 테스트는 미스 경로로 통과.
- ❌ 실 Redis round-trip(직렬화 실패로 항상 미스가 되는 시나리오)은 단위 round-trip 테스트로 대체 —
  런타임 실측은 ZM-123 병합 후.
