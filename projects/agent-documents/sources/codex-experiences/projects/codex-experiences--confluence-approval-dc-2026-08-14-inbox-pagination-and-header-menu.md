# Confluence Approval DC 업무함 페이징과 헤더 진입점

## 대량 데이터 처리

업무함은 `offset`, `limit`, `q`를 받아 서버에서 페이지 단위로 조회한다. 페이지 제목 검색도 같은 서버 쿼리에 포함하므로 브라우저에 전체 승인 목록을 미리 적재하지 않는다.

Flow 사용자 선택 목록도 `/users/page`에서 최대 50건으로 제한하고 `hasMore` 기반 이전/다음 페이지를 제공한다. 검색어가 바뀌면 첫 페이지부터 다시 조회한다.

## 전역 헤더 메뉴

`system.navigation`에 `approval-header-menu` web-section을 등록하고, 그 하위에 승인 업무함, 내 서명, 승인 설정 web-item을 배치했다. 각 화면의 servlet은 기존 권한 검증을 계속 수행하므로 메뉴 노출 여부와 별개로 서버 권한을 우회할 수 없다.

## 검증

`mvn -pl approval-confluence9 -am package`가 성공했고, approval-domain 54개와 approval-confluence9 112개 테스트가 통과했다. 실제 Confluence 상단 헤더의 표시 형태는 설치한 C9 인스턴스에서 마지막으로 확인한다.
