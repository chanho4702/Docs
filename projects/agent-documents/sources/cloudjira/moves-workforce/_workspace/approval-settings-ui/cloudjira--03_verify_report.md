# 승인 설정 UI 검증

## 통과

- 프론트 전체: `CI=true npm.cmd test -- --runInBand --silent`, 종료 코드 0. 172 suites / 2,764 tests / snapshot 1개 통과. `frontend-tests.log`.
- 최종 Checkbox 접근성 보정 후 영향 테스트: `npm.cmd test -- --runInBand --silent src/pages/projectDetail/issue/IssueApprovalSettingTable.test.jsx src/pages/projectDetail/issue/IssueApprovalBulkModal.test.jsx src/pages/projectDetail/issue/approvalBulk.test.js`, 종료 코드 0. 3 suites / 16 tests. `target-tests-final.log`.
- 최종 CI 빌드: `CI=true npm.cmd run build`, 종료 코드 0. `build-final.log`. gzip 496,983 bytes / 예산 950,000 bytes. prebuild merge 완료.
- kr/en 기능 번역 각각 96개 키, 누락 없음.
- 백엔드는 이번 수정에 포함되지 않았다. 같은 백엔드 소스 상태의 앞선 전체 테스트 187 suites / 2,616 tests 통과 증거를 재사용했다.
- 실제 컴포넌트 로컬 Chrome 미리보기: 목록, 단건 모달, 최종 선택 열의 숨김 라벨과 정보 그룹 배치 확인.

## 검증 경계

- 서버 응답·쓰기 계약·query key는 유지한다. canEdit=false에서 선택/수정 미노출, 지원 행만 wa 전송, 저장 뒤 목록 갱신, 충돌/부분 실패 결과 표시를 기존 및 수정 테스트에서 확인했다.
- 보이는 행 선택 시 필터 밖 선택 유지, 전체 선택 해제, 행 수정 대상 한정 테스트를 추가했다.
- 최초 Forge lint는 진행 중인 build가 출력 디렉토리를 정리한 시점과 겹쳐 index.html 없음으로 실패했다. 빌드 완료 후 재실행하며 이 최초 결과는 제품 소스 결함으로 분류하지 않는다.
- 빌드 완료 후 `pwd; forge.cmd lint` 재실행은 장시간 결과가 없어 중단했다. 최종 Forge lint는 미검증이며 통과로 보고하지 않는다. 최초 실행의 PermissionLinter `Unknown product` 경고도 남아 있다.
- 좁은 뷰포트·다크 테마 실제 렌더, 실제 Jira 설치에서 저장 E2E는 미검증. 승인 정책과 권한의 기존 브랜치 리뷰 결함은 이번 UI 개선 범위에 포함하지 않았다.
- 커밋·푸시·배포 없음. 사용자 기존 변경 보존.
