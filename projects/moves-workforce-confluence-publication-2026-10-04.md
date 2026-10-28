# Moves Workforce Confluence 고객 가이드 게시

- 2026-10-04 기존 MW 페이지를 보존하고 한·영 21주제, 42페이지 본문을 실제 게시했다. Marketplace Jira·Confluence 심사 안내 2페이지도 갱신했다.
- 공개 REST 조회에서 제목, H2, 렌더링된 링크의 대상 ID를 비교해 42/42 통과했다. Update 클릭 성공만으로 본문 게시를 판단하지 않는다.
- Confluence 편집 영역은 실제 DOM의 `#ak-editor-textarea.ProseMirror`를 확인해 사용했다. AX 상위 영역 클릭은 편집기 포커스를 보장하지 않았다. 입력 후 H2와 게시 후 제목·H2를 검증했다.
- 공식 Browser runtime의 browser ID는 kernel 초기화에 따라 달라진다. 프로필 이름과 extensionInstanceId를 함께 확인한다. 이전 claimed tab이 Debugger unattached로 실패하면 공식 새 탭으로 복구할 수 있었다.
- 파일 chooser는 작동했지만 ChatGPT 확장의 파일 URL 접근 설정 때문에 업로드가 거부됐다. 클립보드 JPEG도 실제 이미지로 들어가지 않았다. 사용자 요청으로 한·영 20페이지의 36곳에 이미지 삽입 위치, JPG 파일명, 화면 설명을 대신 게시하고 공개 본문에서 파일명을 검증했다.
- 원본 Markdown은 실제 이미지 링크를 유지하고 브라우저 게시용 HTML만 위치 표시로 변환한다. 이미지 첨부 이후 이 HTML로 전체 본문을 덮으면 그림이 사라지므로 다시 쓰지 않는다.
- multi-product 심사는 같은 사이트의 Confluence 검색과 Jira 프로젝트·작업 연결 기능을 설명해야 한다. 기존 '타사 연동 없음' 문구는 manifest와 Sentry 설정에 맞춰 정정했다. 문서 게시 완료와 제품 역할별 실계정·저장·배포 버전 검증은 구분한다.
- [[moves-workforce-bilingual-guide-captures-2026-10-04]]
