# 승인 설정 화면의 공용 UI 정합성

- 사용자 피드백: 연동 모드 승인 설정 탭의 UI/UX가 다른 프로젝트 화면과 크게 달랐다.
- 대응: DynamicTable 직접 사용과 기본 HTML 입력을 CommonTable·Atlaskit Select/Textfield/Checkbox/DatePicker로 바꾸고, 11개 열을 정보별로 묶었다. 단건 수정과 일괄 적용 대상·변경 건수·결과를 구분했다.
- 교훈: 공용 테이블은 여백 외에도 스켈레톤·빈 상태·폭 고정·리사이즈 계약을 제공한다. 개별 표 스타일을 추가하기 전에 이를 재사용해야 한다. 페이지 일부만 로드한 상태의 검색/전체 선택은 ‘불러온 목록’ 범위를 명시한다.
- 실화면 확인에서 설치된 Atlaskit Checkbox가 isLabelHidden을 지원하지 않는 것을 발견했다. 라벨 없이 aria-label로 이름을 제공하면 좁은 선택 열을 유지한다.
- 실제 컴포넌트 로컬 미리보기와 샘플 응답으로 확인했으며 Jira 배포 검증과 구분한다. 상세 실행 증거: C:/CloudJira/moves-workforce/_workspace/approval-settings-ui/.
