# 요구사항 — Moves Workforce Docs 연동 「문서」 탭 (2026-09-29)

## 배경
Confluence 문서↔이슈 연결·분류·관리는 별도 Forge 앱 **Moves Workforce Docs**(`C:\CloudJira\moves-workforce-docs`)가 맡는다.
Workforce는 그 결과를 프로젝트 상세에서 **읽기 전용**으로 보여 주고, 관리 화면으로 보내는 버튼만 둔다.

## 설계 정본
`C:\CloudJira\moves-workforce-docs\docs\DESIGN.md` — 이 기능에 해당하는 절은 §4(이슈 프로퍼티 계약), §5(이동), §6(설치 감지), §8(문서 탭).
설계 단계는 끝났으므로 architect·backend 단계는 실행하지 않는다.

## 영향 범위
- 프론트 전용. resolver·`PermissionMap`·DB·manifest 변경 **없음**. Workforce 스코프 추가 **없음**.
- i18n: `locales/kr/*.json`, `locales/en/*.json` 추가 후 `npm run merge`.

## 확정 사항
1. 프로젝트 상세 최상위 탭 `documents` 추가. lazy 로드, `CommonTab` Suspense 경계 아래.
2. Workforce Docs가 설치된 사이트에서만 탭이 보인다(§6). 판정 불가·호출 실패는 숨김.
3. 탭 내용은 문서 기준으로 묶은 읽기 전용 표(제목·분류·스페이스·연결 이슈). 제목은 새 창.
4. 「문서 관리 열기」 버튼은 Workforce Docs 앱 id·환경 id 상수가 채워져 있을 때만 보인다(현재는 미등록이라 비어 있다).
5. 프로퍼티 읽기는 전용 유틸 한 곳만 거친다. 쿼리 키는 `utils/queryKey/` 팩토리.

## 하지 않는 것
- Workforce에서 문서 연결·해제·분류 변경
- Confluence 호출
- 간트·이슈 목록의 문서 아이콘(후속)
