# 요구사항 — Forge 라이선스 enforcement

Atlassian Marketplace 유료 앱 라이선스 enforcement. 미라이선스(유료앱 비활성) 설치에서:
1. 프론트: 메인 앱 대신 가이드 페이지(LicenseGuidePage) 노출
2. 백엔드 resolver: 공통 래퍼(responseWrapper)에서 차단
3. 백그라운드(트리거/큐): License API 확인 후 비싼 작업 skip

판정 규칙: `license.active === false` 일 때만 차단. `undefined`/`null`(무료·미등록·개발·조회실패)은 통과(로컬 개발 보호).

상세 설계·결정은 리포지토리 루트 `라이선스_정책_구현.md` 참조.

## 검증 단계로 진입한 배경
구현은 하네스 밖에서 수동 완료(미커밋). 본 하네스는 Phase 5 통합 검증만 수행:
- 경계면 교차 비교(backend 응답 shape ↔ frontend invoke 소비)
- 백엔드 jest + 프론트 빌드 회귀 확인
- 정책 점검: 메모리 "No asApp"(Jira API asApp 지양, 배치도 asApp 우회) 대비 LicenseGuard.js의 asApp 사용이 정당한지 평가
