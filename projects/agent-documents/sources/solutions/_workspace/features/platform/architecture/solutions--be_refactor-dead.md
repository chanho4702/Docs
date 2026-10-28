# BE 죽은/도달불가 엔드포인트 정리 — be_refactor-dead

일자: 2026-07-01
대상 BE: `C:\solutions\moveseye-be-spring` (Spring, 정본)
범위: 감사가 지목한 `getProblemActionLogList` (`GET /event/problems/action-log`)

## 판정: 제거 대상 없음 (정본에 애초에 부재 — no-op)

### 근거
1. **Spring 정본에 해당 핸들러가 존재하지 않는다.**
   - `EventController.java`(현 라인 84 = `getEventProblemInfo`, `GET /event/problems/{id}`)에는 action-log 매핑이 없다.
   - Spring 리포지토리 전체 grep(`action-log|ActionLogList|getProblemActionLog`) → 0건.
   - 감사 근거였던 "`{id}` PathVariable이 `action-log`를 흡수 → 도달 불가"는, 흡수될 대상 핸들러 자체가 없으므로 **무의미**(NestJS→Spring 변환 시 미포팅됨).
2. **Nest 원본에도 부재.** `C:\solutions\moveseye-be\src` 전체 grep → 0건. 즉 이 EP는 어느 BE에도 구현된 적이 없다(FE에만 dangling 서비스 함수가 남아 있음).
3. 따라서 BE 측 제거할 핸들러 메서드/전용 서비스 메서드/DTO가 **없다**.

### 함께 제거한 서비스/DTO
없음(제거 대상 자체가 부재).

## 참고: FE 잔재 (이번 작업 범위 밖 — 미변경)
- `moveseyee_fe\src\services\event.api.ts:72` `getProblemActionLogList` → `GET /event/problems/action-log` 호출하는 **dead 서비스 함수** 존재.
  - 어느 컴포넌트에서도 호출되지 않음(참조는 export 목록뿐; `ProblemActionOverview.tsx`의 `getActionLogList`는 동명이인 로컬 함수로 무관).
  - 관련: `queryKey.ts:114 ACTION_LOG_LIST`, `types/alert.ts:44 TActionLog`.
- **미변경 사유**: 본 작업 지시의 상위 제약 "FE·Nest는 만지지 말 것"을 준수. FE 정리는 별도 티켓 권장(BE에 대응 EP가 없어 항상 실패하는 죽은 함수).

## 존치(건드리지 않음) — 감사 기타 항목
- admin 컨트롤러 dead(roleid=null 403): 문서화된 의도적 거동(CLAUDE.md #2) → 미변경.
- `/assets`·`/server-locations` 미구현: 별도 결정으로 존치 → 미변경.

## 빌드/테스트
- Spring 소스 **변경 0건** → 컴파일/테스트 영향 없음(회귀 불가). 기존 그린 베이스라인 유지.
- (변경이 없어 `gradlew build/test` 재실행은 사전 베이스라인 재확인 이상의 의미가 없음.)

## 변경 파일
없음.
