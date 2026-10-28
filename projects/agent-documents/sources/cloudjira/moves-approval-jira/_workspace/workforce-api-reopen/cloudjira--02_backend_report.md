# 백엔드 결과

- 기존 guardedDefine 네 개를 registrar와 `{admin:true}` PermissionMap에 복구했다.
- manifest backend egress에 https://api.atlassian.com을 추가했다. SQL·scope·Service 변경 없음.
- 응답은 `{success:true,content:...}`이며 상태 content는 configured/baseUrl/configuredBy/updatedAt/source/automaticTokenRefresh, 팀 content는 configured/source/teams/page/fetchedAt/configuredBy/approvalAuthorityChanged다. 미연결은 teams:[], page:null이다. 토큰은 반환하지 않는다.
- `npm test -- --runInBand --runTestsByPath test/permission/permissionMap.contract.test.js src/resolver/workforce/__test__/WorkforceOrganizationApiService.test.js`: 2 suites / 25 tests 통과.
- 전체 검증·빌드·배포는 루트 담당이다.
