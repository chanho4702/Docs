---
tags: [moveseye, apm, ux, worktree, codex]
updated: 2026-10-01
---

# APM UX 개선 — 다른 세션과 분리한 구현

[[2026-10-01-apm-ux-review]] 이후 사용자가 “다른 세션이랑 안 겹치게 수정”을 명시적으로 승인했다. 공용 COLLAB 상태는 바꾸지 않고, 사용자 요청 범위의 FE 개선만 별도 worktree에서 구현했다.

- 원본: `C:/solutions/moveseyee_fe`, master `c4eaf55`. 작업 전후 clean, 원본 수정·병합·push 없음.
- 구현: `C:/solutions/_workspace/apm-ux-fix-20261001/moveseyee_fe`, 브랜치 `codex/apm-ux-20261001`, 커밋 `675b5ee`.
- 기존 BE :3000·FE :5173 재기동 없음. 전용 미리보기는 `http://localhost:5179/application-monitoring/overview`.
- 작업 폴더 위 `preview.config.ts`의 개발 프록시로 기존 BE에 연결. 공유 CORS 설정은 변경하지 않았다. 재실행: worktree에서 PowerShell `$env:VITE_API_URL='http://localhost:5179/api'` 후 `node node_modules/vite/bin/vite.js --config ../preview.config.ts --port 5179 --strictPort`.

수정:

1. 트레이스 새로고침이 활성 목록·산점도까지 갱신. 상대 창은 현재 분 경계로 이동, 사용자 지정 절대 창은 유지. 서비스 상세와 RUM에도 활성 조회 새로고침 적용.
2. 데스크톱·모바일 APM 메뉴 이동 시 preset/from/to/env/refresh만 유지. 탭·페이지 번호·개별 검색 필터는 전파하지 않음. APM 메뉴명·부모명 줄바꿈/들여쓰기 개선.
3. 서비스·엔드포인트 오류 순위에서 0% 제외. 관측된 값이 모두 0이면 오류 없음, 미관측이면 데이터 없음, 로딩/실패는 별도 유지.
4. 개요의 미구현 단계 카드 3개와 로그 단계 탭 제거. 과거 로그 탭 URL은 개요 표시. 서비스 메타 헤더 압축.
5. 설정·배포·합성 탭처럼 시간 선택을 적용하지 않는 화면에서 시간 선택기 숨김. 합성 상세 가용성은 선택 기간 라벨로 정정.
6. RUM 네 조회가 모두 관측 없음으로 확정된 경우만 단일 안내·기간 확대·권한별 설정 링크 제공. 일부 오류·로딩·검색 결과 0건을 수집 없음으로 덮지 않음.
7. X-View 수집 슬롯·샘플 비율은 펼침 상세로 이동, 경고·지연·표시 건수는 유지. SLO의 내부 계약 문구 정리. 한국어/영어 번역 동시 수정.

검증: 기존/변경 APM 8개 스위트 190건, 신규 주요 로직 3개 스위트 18건 통과(중복 스위트 포함). RUM 신규 경계 사례 4건 별도 재검증 통과. TypeScript 검사·Vite 프로덕션 빌드 통과. Chromium 1366×768에서 메뉴 이동, 상대/절대 기간 트레이스 새로고침 실제 API 요청, 상세·설정·RUM·X-View·합성 상세 검증. 기록과 PNG는 worktree 부모 폴더에 보관.

범위: 저장된 사용자 위젯 배치·BE API·데이터·알림 정책은 수정하지 않았다. 전체 화면 재설계가 아니라 평가에서 확인된 우선 결함과 가독성 개선이다.

교훈: APM 상대 기간은 분 경계에 정렬되므로 같은 분에 누른 새로고침은 창 변경 없이 재조회해야 한다. Ant Design 중첩 메뉴는 부모를 펼치기 전 자식 링크 DOM 자체가 없을 수 있다. i18n JSON은 같은 이름의 중첩 키가 반복되므로 단순 문자열 검색으로 넣지 말고 실제 JSON 경로를 검증해야 한다.

관련: [[moveseye]] · [[2026-09-07-lld-review]]
