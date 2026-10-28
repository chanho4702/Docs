# 프론트 결과

- 설정 > 워크포스 연동에서 명시적 ON일 때 기존 API 연결 화면을 표시한다. 기존 서명 기반 팀 화면은 변경하지 않았다.
- 한국어·영어 제목에 임시 표시, 미연결 문구의 부정확한 “위 목록” 참조를 제거했다.
- 재활성화하는 컴포넌트의 캐시 삭제·무효화 prefix를 workforceKeys 팩토리로 제공해 저장소 규칙에 맞췄다.
- `npm run merge`: 통과.
- 대상 UI 테스트(WorkforceLinkSettings, WorkforceOrganizationApiSection, WorkforceTeamsSection): 3 suites / 22 tests 통과. ON 상태 조회, OFF/미확인 미호출, 미연결 팀 미호출, 기존 페이지 조회·서명 팀 독립성을 검증했다.
- 빌드·전체 검증은 루트 담당이다.
