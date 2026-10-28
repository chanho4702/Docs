# Marketplace 제출 준비표 — 내부용

기준: 2026-10-20. 문서 준비와 출시 준비는 별개다. 실제 코드를 기준으로 정리했으며 공개 제출하지 않았다.

| 항목 | 상태 |
| --- | --- |
| 한·영 문서 | 언어별 16개, 현재 진입점에 맞춰 정리 |
| 등록 문구 | 태그라인·요약·상세·하이라이트 3개·캡션·릴리스 문구 준비 |
| 실제 캡처 | 한국어 개발 환경 3장. 영문 UI 촬영·출시용 개인정보 검수·규격 편집 미완료 |
| 상세 화면 | 승인 완료 이력에 오류 배너 동시 표시 사례 발견. 원인 미확정, 출시 전 확인 필요 |
| 상태 변경 승인 | 서버·manifest 구현 있음. 기능 스위치와 프로젝트 규칙 UI 미연결. 출시 홍보에서 제외 |
| 타임시트·직접 인증 | 현재 신규 메뉴에 미노출. 기간 제출 URL도 허용 화면에 없음 |
| production | 이번 작업에서 배포·설치하지 않음. 코드와 배포본 동일성 미확정 |
| 법적·지원 정보 | 공개 Privacy Policy·EULA·지원 URL·응답 정책을 조직 확정본으로 연결해야 함 |
| 가격·출시 버전 | 담당자가 확정할 항목. package.json의 0.0.1을 출시 버전으로 단정하지 않음 |
| Workforce | 개발 연결 화면 확인. production 도메인·호환 배포·장애 처리 실측은 별도 |

## 제출 전 남은 작업

- [ ] 승인 상세 오류 원인 확인 및 정상 상세·작성·승인 흐름 실계정 검증
- [ ] 출시 후보를 고정하고 한·영 UI 및 이미지 규격 촬영 완료
- [ ] Marketplace·문서·지원·Privacy Policy·EULA 공개 URL 연결 및 익명 접근 확인
- [ ] production 라이선스 활성·비활성·평가판과 설치/업그레이드 검증
- [ ] 권한 없는 사용자·다른 팀·숨김 설명·내보내기 범위의 심사 증빙
- [ ] 통제 해제 후 잔여 0과 제거 절차 확인
- [ ] 연동을 출시 범위에 포함할 경우 production 채널·egress·상대 버전 확인
- [ ] 담당자의 실제 운영 방침으로 Privacy & Security 응답 확정

개인정보 설명을 법적 Privacy Policy로 대신하지 않는다. 데이터 지역 고정, ISO/SOC 인증, 24시간 지원, Runs on Atlassian, 모든 외부 변경의 사전 차단은 확인 없이 주장하지 않는다.

## 공식 요건 확인

2026-10-20 공식 안내를 조회했다. 태그라인 130자, 상세 1,000자, 하이라이트 제목 50자·설명/캡션 220자를 기준으로 문구를 검증한다. 대표 화면은 1840×900 또는 920×450, 잘라낸 이미지는 580×330이다. 현재 저장된 원본 캡처가 이 규격을 충족한다고 표시하지 않는다. [이미지·문구 규격](https://developer.atlassian.com/platform/marketplace/building-your-presence-on-marketplace/)

유료 리스팅에는 라이선스 연동과 제출 자료가 필요하며 공개 문서·지원·보안 응답을 실제 운영 정보와 맞춰야 한다. [리스팅 작성](https://developer.atlassian.com/platform/marketplace/creating-a-marketplace-listing/) · [심사 지침](https://developer.atlassian.com/platform/marketplace/app-approval-guidelines/)

[문서 묶음](cloudjira--README.md) · [코드 근거](cloudjira--CODE-EVIDENCE.md) · [상세 오류 증빙](evidence/ko-detail-error-live.jpg)
