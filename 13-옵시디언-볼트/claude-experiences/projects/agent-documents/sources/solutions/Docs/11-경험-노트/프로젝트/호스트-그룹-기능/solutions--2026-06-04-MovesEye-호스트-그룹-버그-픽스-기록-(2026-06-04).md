---
type: project
tags: [project, moveseye, host-group, bugfix, fullstack, nestjs, react]
created: 2026-06-04
updated: 2026-06-04
status: done
---

# MovesEye — 호스트 그룹 버그 픽스 기록 (2026-06-04)

> [[projects/moveseye/host-group-feature/2026-06-04-host-group-audit|진단]]에서 확정한 버그 4건 수정. 디렉터리 개요는 [[projects/moveseye/host-group-feature/README|README]].
> 검증: 양쪽 `tsc --noEmit` 통과(수정 파일 관련 에러 0). 런타임 동작 테스트는 미실시.

## 수정 내역

| # | 파일 | 변경 |
|---|------|------|
| B1 | `moveseye-be/.../host.service.ts` `getCategory` | `async`/`await` 제거 → 동기 함수. `getDeviceTypeFromTags() || notClassified`로 undefined 방어. (호출부 `getHostItems`가 await 없이 부르던 게 원인 → 이제 `category`가 실제 string) |
| B2 | `moveseyee_fe/.../HostGroupDetail.tsx` | 테이블 `total={data?.total ?? 0}` → `total={dataType?.total ?? 0}`. 요약 응답이 아니라 device-type 집계 응답에서 total을 읽도록 정정 |
| B3 | `host.service.ts` (목록 L268·상세 L350) + `get-hosts.dto.ts` | 초기 `statusCounts` camelCase 객체 제거 → `Record<string,{totalEvents,uniqueHostCount}>` (대문자 키만 채워짐, FE `TStatusCounts`와 일치). `HostGroupDetailDto.statusCounts` DTO 타입도 실제 shape으로 교체 |
| B4 | `HostGroupServiceCard.tsx` | `extra`의 빈 `<Link to="">`에 `onClick`으로 `stopPropagation()+preventDefault()` 추가 → +버튼 클릭이 카드의 그룹상세 네비게이션을 트리거하던 충돌 제거 |

## 픽스 중 발견·정정한 사실

- **B4 부분 오진**: 진단서엔 "내부 server/network 버튼에 stopPropagation 없음"이라 적었으나, `MonitoringInfoBtn`의 `handleClick`이 이미 `e.stopPropagation()` 호출 중. 실제 충돌원은 **빈 Link뿐**이었음.
- **B3의 근본**: 응답 DTO `HostGroupDetailDto.statusCounts`가 **처음부터** camelCase number 구조로 선언돼 실제 런타임 값(대문자 키 → `{totalEvents,uniqueHostCount}`)과 불일치했음. 서비스 초기 객체만 고치면 DTO와 타입 충돌(TS2740)이 나서, DTO까지 함께 정정해야 완결.
- **L590 `getHostGroupDetailProblems`는 제외**: 동일해 보이는 camelCase `statusCounts`지만, 여기는 `status.toLowerCase()`로 **camelCase 키를 실제 사용**하는 별개 로직이라 손대지 않음.

## 남은 권장 작업
- P1 목록 N+1/캐싱, C1~C4 분류·안전도 일관화, T1 FE 타입 보강 → [[projects/moveseye/host-group-feature/2026-06-04-host-group-audit|2026-06-04-host-group-audit]] 참고.
- 회귀 테스트(`host.service.spec.ts`) 보강 권장: `getCategory` 동기 반환, statusCounts 대문자 키 형태.
