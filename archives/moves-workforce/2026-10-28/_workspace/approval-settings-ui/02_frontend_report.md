# 승인 설정 UI 개선

## 변경

- 기본 DynamicTable 대신 앱 공용 CommonTable을 사용한다. 열 폭 조절·공용 여백·스켈레톤·빈 상태를 공유한다.
- 11개 열을 정보별로 묶어 편집자 8개, 읽기 전용 6개 열로 정리했다. 이슈 키/제목, 담당자/팀장, Jira 일정/계획 MD, 작성 기간, 요청 방식/마감, 상태/마지막 저장 정보를 보존했다.
- Atlaskit Textfield·Select·Checkbox로 검색·상태·선택 UI를 통일했다. 검색 초기화, 선택 해제, 현재 필터에 보이는 행 선택, 행별 명시적인 수정 버튼을 제공한다.
- 검색 대상이 불러온 목록이라는 안내와 표시 건수를 추가했다. 필터 밖 선택은 유지하며 선택 건수는 전체 선택 집합을 반영한다.
- 단건 수정과 일괄 모달의 제목·대상을 구분한다. 작성 기간과 승인 정책을 나누고 Select·DatePicker·Textfield로 입력한다. 0일의 의미, 입력 오류, 변경 건수, 진행 상태, 항목별 결과를 보여준다.
- 승인 정책 의미와 서버 계약을 유지한다. 미지원 capability에는 wa를 보내지 않으며 잠금 정책은 유지한다. 이전부터 UI에서 제거된 결재선용 미사용 화면 변수만 정리했다.
- 색상은 Atlassian 토큰, 간격은 기존 8/16px 기준을 사용한다. 최소 표 폭 1040px, 내부 가로 스크롤을 적용했다.

## 계약

- 목록: listIssueApprovalSettings 성공 응답의 최상위 items, canEdit, nextCursor와 행 setting/wa/capabilities를 그대로 소비한다. 훅과 query key 변경 없음.
- 쓰기: saveIssueApprovalSettings({projectId, items})와 approvalBulk의 expectedRev·keep·window·wa payload 생성 및 50건 배치를 유지한다.
- 저장 후 issueApprovalKeys.scope(projectId) prefix 무효화(exact:false)를 유지한다.
- 설정: getSettingData 최상위 hourRate, 성공 플래그 제거 후 settingKeys.detail 캐시 shape 유지.
- locales/kr·en/issueApprovalSetting.json 수정 후 build prebuild의 merge로 생성물을 갱신했다.

## 시각 검증

실제 수정 컴포넌트를 로컬 webpack 미리보기로 렌더하고 Chrome에서 목록·단건 모달을 확인했다. 테스트 데이터와 Forge bridge 응답만 대체했다. 확인 중 Checkbox의 isLabelHidden 미지원으로 라벨이 노출된 것을 발견해 label 대신 aria-label로 수정했다. 일시적으로 브라우저 연결이 끊겼으나 새 미리보기 탭에서 최종 목록을 재촬영해 라벨 제거와 표 배치를 확인했다. 좁은 뷰포트 실측은 미검증이다. 실제 Jira 설치 환경에는 배포하지 않았다.

검증 결과는 03_verify_report.md에 기록한다.
