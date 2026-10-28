---
type: topic
tags: [forge, marketplace, security, privacy, checklist]
created: 2026-10-20
updated: 2026-10-22
---

# Forge 유료 앱 Marketplace 출시 전 감사 체크리스트

[[2026-10-20-marketplace-prelaunch-audit]] 에서 실제로 걸린 것 위주. [[forge-licensing]] · [[forge-marketplace-review-and-remote]] 와 함께 본다.

## 멀티테넌트
- **모듈 전역 변수에 테넌트 데이터 금지.** warm runtime 이 다른 사이트 invocation 에 재사용된다(Forge nodejs-runtime 문서의 요건). 캐시는 `getAppContext().invocationId`(요청 단위) 또는 `installationAri`(설치 단위)를 키로 가둔다. 실패한 promise 를 캐시에 남기지 말 것(reset).
- grep: `^let |^const .* = new Map\(\)|= null;$` 를 모듈 최상위에서 훑는다.

## 개인정보
- accountId 를 저장하면 **`privacy.reportPersonalData`**(scope `report:personal-data`)로 주기 보고(기본 7일 이내, 호출당 90건) + `closed` 응답 계정의 개인 데이터 삭제. 그룹 키 같은 비계정 값은 빼고 보낸다. 실패는 던지지 말고 커서를 남겨 다음 주기에.
- 감사 기록 속 accountId 는 남겨도 된다(조직의 기록) — 무엇을 지우고 무엇을 남기는지 문서에 명시.
- egress(Sentry 등)를 넣으면 개인정보 문서의 "외부 전송 없음" 을 고친다. Sentry: `sendDefaultPii:false`, user·extra·breadcrumb·request 제거, console 수집 끔, **서버 쪽 IP 저장 차단은 프로젝트 설정**.
- egress category `analytics` + `inScopeEUD:false` 면 Runs on Atlassian 자격 유지.

## 라이선스
- manifest `app.licensing.enabled` 가 없으면 가드가 다 있어도 무료 앱. 계약 테스트로 고정.
- 차단은 명시적 INACTIVE 만. 트리거·스윕은 막지 말고 **알림 생성만** 막는다.
- **미결제여도 보여야 할 것**을 먼저 정한다(고객 콘텐츠, 상태 표시). 예외 resolver 는 한 곳(목록)에 두고 계약 테스트로 개수를 고정.

## 응답·번들
- production 실패 응답에 SQL/외부 API 원문을 싣지 않는다(업무 오류 코드만).
- CRA 빌드는 기본으로 source map 을 만든다 → `.env.production` 에 `GENERATE_SOURCEMAP=false`.

## 권한 — "화면이 숨기는 것은 권한이 아니다"
- 화면 플래그(`canResubmit` 등)의 조건을 서버가 다시 확인하는가.
- `SELF` 가드 resolver 가 남의 id 를 인자로 받아 조회하지 않는가.
- 실패 카운터·한도는 read-modify-write 가 아니라 원자 증가(`SET n = n + 1 WHERE …`)로, **비교 전에** 센다. 잠금이 카운터를 0 으로 되돌리면 센 뒤 다시 읽을 때 **잠금 시각도** 확인한다(동시 시도가 리셋된 값을 본다).
- 권한 축 하나를 풀 때(예: 소유자만 → 아무 관리자) 같은 경로의 다른 검사(열람 재검사 등)가 새 막힘이 되지 않는지 본다.
- 문서를 고치는 부작용(결재란 삽입 등)은 **모든 권한 검사 뒤에**.
- 위임·대리 같은 확장 범위가 의도한 화면(탭)에만 적용되는가.

## 데이터 수명
- 대상이 사라진 기록(삭제된 페이지)이 정리·내보내기에서 영원히 빠지지 않는가. asUser 로 안 보이는 것 ≠ 존재하지 않음 — asApp 존재 판정을 쓰면 사용자 텍스트는 가린다.
- 관리자 여럿일 때 "보이는 버튼"과 "실제 권한"이 같은가.

## 제출
- Privacy & Security 탭 질문 목록: developer.atlassian.com/platform/marketplace/security-privacy-tab/ (bug bounty·egress·scope 목록은 Atlassian 자동 기입).
- egress·scope·sql 변경은 major upgrade → `forge deploy --approve MAJOR_VERSION_RULE`, `forge install --upgrade`.
