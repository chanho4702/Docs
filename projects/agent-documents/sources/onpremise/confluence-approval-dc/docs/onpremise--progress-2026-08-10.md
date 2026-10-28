# Confluence Approval DC 진행 기록 — 2026-08-10

## 기준

이 문서는 코드와 빌드·실행 로그로 확인한 상태만 기록한다. 화면에 아직 연결되지 않았거나 운영 데이터로 인수 검증하지 않은 기능은 완료로 표시하지 않는다.

## 구현 및 검증 완료

### 승인 domain

- `PENDING`, `APPROVED`, `REJECTED`, `EXPIRED` 상태 전이
- 최소 승인 인원 검증과 승인자 자격 검증
- 승인·반려·만료의 append-only 감사 이벤트 (`REQUESTED`, `APPROVED`, `REJECTED`, `EXPIRED`)
- 반려 사유 기록
- 페이지 content version 변경 및 마감일에 따른 만료 규칙
- 동일 대상의 revision 계산 및 진행 중 요청 충돌 방지
- 새 승인 요청의 요청자 snapshot 저장 (`requesterKey`)

검증: `approval-domain` 테스트 17건 성공.

### Confluence 9 adapter 및 화면

- Active Objects 저장: 요청(`APR_REQ`), 승인자 결정(`APR_APV`), 감사 이벤트(`APR_EVT`)
- 페이지 metadata banner 승인 패널
- 승인자 사용자 검색·선택 UI
- 승인, 반려 사유 입력, 현재 승인자별 결정 및 감사 타임라인 표시
- 요청·결정·조회 시 서버 측 페이지 권한 및 현재 로그인 사용자 검증
- 페이지 승인 요청 중복 시 `409 Conflict` 반환
- 승인 업무함 servlet 및 전역/Space sidebar 바로가기 `✓ 승인 업무함`
- 관리자 전용 설정 페이지와 서버 권한 검증
- Flow 저장(`APR_FLOW`, `APR_FLOW_P`), 사용자 선택, 목록 조회
- 페이지 승인 요청에서 활성 Flow 선택 및 서버 저장 정책 재적용
- `PageUpdateEvent` listener를 통한 페이지 편집 자동 만료 연결
- `GET /approvals/mine/requested` 내 요청 조회 API

검증: C9 Maven package 성공, Quick Reload 후 `kr.dmove.confluence.approval` 활성화 확인. 관리자 설정 화면 렌더링, 사용자 검색, 페이지 패널 Flow 선택 UI를 브라우저에서 확인.

## 진행 중 / 화면 연결 필요

- 승인 업무함을 `내 승인 대기`, `내 요청`, `내가 처리한 건` 탭으로 분리하고 새 내 요청 API 연결
- 요청자, 요청 시각, 마감일, Flow 이름, 감사 이력을 inbox·상세 화면에 표시
- Flow 편집, 비활성화, 삭제 UI와 서버 API
- Flow 및 직접 요청에서 Confluence 그룹 선택·구성원 snapshot
- 앱 전역 설정: 기본 마감일, 상태 표시명, 반려 사유 필수 여부, 승인자 편집 권한
- 콘텐츠 영역 macro의 실제 승인 요청·상태·타임라인 연동
- deadline scheduler 및 마감 임박 처리
- in-app/email 알림과 재시도 가능한 outbox
- Confluence 10 adapter 동등 구현 및 호환성 검증

## 아직 인수 검증하지 않은 경로

- 실제 테스트 페이지 편집 후 `EXPIRED` 전이와 감사 이벤트 저장
- 새 Flow를 생성한 뒤 페이지 승인 요청에 적용했을 때 최소 인원·기본 마감일이 반영되는지
- 일반 계정의 관리자 설정·Flow REST 접근이 `403`인지
- 새 요청의 `requesterKey` 저장 및 `/mine/requested` 응답

## 최근 주의사항

- C9 실행은 JDK 21로 Maven을 실행해야 한다. Java 17은 enforcer가 차단한다.
- C9 서버 실행 중 C10 artifact를 빌드하면 Quick Reload가 C10 JAR을 집어들 수 있으므로 C10 빌드는 분리한다.
- domain 변경 뒤 C9 배포 시 nested `approval-domain` JAR 포함 여부를 확인한다. 필요하면 dependency copy 후 `confluence:jar`를 실행한다.
- Confluence 서버 재기동은 필요하지 않으며 C9 plugin JAR Quick Reload로 반영한다.
