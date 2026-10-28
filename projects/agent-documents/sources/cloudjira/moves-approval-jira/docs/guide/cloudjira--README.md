# Moves Approval for Jira — Marketplace 문서 묶음

2026-10-20 현재 작업 트리의 실행 코드와 실제 개발 사이트 화면을 기준으로 정리했다. 공개 게시·Marketplace 제출은 하지 않았다.

- [한국어 문서](ko/cloudjira--00-index.md) · [English documentation](en/cloudjira--00-index.md)
- [한국어 등록 문구](ko/cloudjira--15-listing-copy.md) · [English listing copy](en/cloudjira--15-listing-copy.md)
- [한국어 캡처 설명](ko/cloudjira--14-screenshots.md) · [English screenshot captions](en/cloudjira--14-screenshots.md)
- [코드 근거표](cloudjira--CODE-EVIDENCE.md) · [제출 준비표](cloudjira--MARKETPLACE-SUBMISSION.md) · [촬영 현황](cloudjira--SCREENSHOT-PLAN.md)
- [기계 판독용 등록 문구](LISTING-COPY.json)

고객 안내 00~12, 심사 절차 13, 실제 캡처 갤러리 14, 등록 문구 15가 언어별로 대응한다. 원본 Markdown을 수정한 후 `node scripts/package-marketplace-docs.cjs`로 읽기용 HTML과 링크·글자 수 검증 결과를 갱신한다.

현재 공개 기능 설명은 **워크로그 건별 승인** 중심이다. 타임시트·일반 이슈·필드 변경과 상태 변경 승인은 코드 잔존 여부가 아니라 현재 진입점 완성 여부를 기준으로 구분했다. 특히 상태 변경은 서버 코드와 manifest가 있지만 설정·프로젝트 UI가 연결되지 않았다.

캡처 3장은 실제 개발 사이트의 한국어 화면이며 영문 가이드에도 한국어 화면임을 표시했다. 오류가 있는 상세 캡처는 `evidence/`에 별도 보관했다. 공개 전 이름·시험 데이터·사이트 정보와 출시 버전 일치를 검토해야 한다.
