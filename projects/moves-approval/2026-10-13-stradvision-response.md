---
type: project
project: moves-approval
tags: [customer, stradvision, tempo, workforce, approval, codex-review, requirements]
created: 2026-10-13
updated: 2026-10-13
---

# 스트라드비전 요구사항 대응 문서 — 두 앱(워크포스+어프로벌) 기준 재판정 (2026-10-13)

> 문서: `C:\CloudJira\moves-approval-jira\_workspace\stradvision-2026-10-13\STRADVISION_RESPONSE.md`(2판) · 코덱스 검토 `codex-review.md`
> 관련: [[2026-09-29-worklog-governance-analysis]] · [[2026-10-02-jira-approval-design]] · [[jira-worklog-visibility-lock]] · [[codex-exec-operations]]

## 무엇을 했나

미팅 기록(SAP 연동·사용자 관리·워크로그 락킹/승인·이력 감사·기타 5건)이 **워크포스 단독 기준**으로 "미지원·구조상 불가"라고 판정한 것을, 어프로벌 앱을 포함해 다시 판정했다. Explore 에이전트 2개(리포별 구현 현황 조사) → 문서 초판 → 코덱스 독립 검토(sol/medium, 읽기 전용, 두 리포 열람, stdin 으로 문서 전달) → 지적 25건 중 코드 대조 8건 직접 확인 후 2판.

## 결론

- 핵심(락킹·승인·이력)은 어프로벌에 **코드 구현 완료**. 미완료는 플랫폼 실측 관문(G_ROLE·G_BLOCK·G_PRESERVE·G_AGG·G_RECOVER), 워크포스 쪽 연동 구현(`rms.org` 명부 게시·`RFC-220` 미병합·prd 키), 운영 준비.
- 고객에게 숨기면 안 되는 수용 기준 8항: Preview 의존 2건(timeTrackingProvider·apiRoute), 제공자 사이트당 하나(Tempo 배타), 잠금 범위(확정분 수정·삭제만 차단, 새 입력·마감만 된 기록·원래 제한 공개 기록은 사후 감지), FLAG 는 인증 비차단(정산 제외 자동 아님), 이력은 수집 이후 관측분, 원가 "인증분만"은 문서 없는 범위에 `legacySeconds`, preUninstall 은 보조 수단, 내보내기 ≠ 백업.

## 코덱스가 잡은 것 (혼자 썼으면 고객에게 그대로 나갔을 것)

- "구현 끝, 실측만 남음" → 코드 구현 / 플랫폼 검증 / 연동 / 운영 준비를 **섞지 말 것**.
- FLAG 는 `FOREIGN_BLOCKS_CERTIFICATION=false` 라 인증을 막지 않는다 → "다른 경로 입력은 정산 제외" 약속 불가.
- 워크포스 원가는 인증 문서 없으면 원본 그대로(`legacySeconds`) → "인증분만" 아님.
- Phase B 숨김 대상은 APPROVED/CERTIFIED/MISMATCH 만 — "마감 기간 기존 기록 차단"은 범위 과장.
- `preUninstall` 은 45초 예산 보조 수단, 실패해도 제거 진행.
- static webtrigger 는 고정 응답만 → SAP pull API 대안이 아니고, 추가는 minor.
- Forge SQL 한도는 환경별(prod 1GiB / stg 256MiB / dev 128MiB), 앱 환경 변수는 표시 기준만.
- 보존 표 오류(통제 이력 선택지, 설정 변경은 자동 정리), 프로퍼티 잘림(`wt`) 은 원가 누락 위험(UNKNOWN 제외).
- Atlassian Teams 는 Forge 접근 불가(문서) → Jira 그룹·역할과 같은 범위로 제시 금지.
- 레지던시는 플랫폼 지원, 미확인은 리전·PINNED. 제거 시 저장소는 soft delete 후 보존.

## 교훈

- **고객 미팅 기록의 "불가" 판정은 어느 앱 기준인지 먼저 묻는다.** 번들 제품이면 다른 앱의 모듈 목록(manifest)을 훑은 뒤 재판정.
- **"구현됨"과 "제공 가능"은 다른 열이다.** 문서 요약표에 "지금 제공 가능 / 미완료"를 분리하고, 계약 문구는 "수용 기준" 절로 따로 뽑는다(워크포스 v2.1 교훈 재확인).
- 코덱스 설계 검토는 **코드 기본값(플래그·상한·선택지)과 문서 약속의 불일치**를 잘 잡는다. 지적은 받아쓰지 말고 파일:라인을 직접 열어 확인 — 이번엔 8/8 맞았다.
- 사용자가 중간에 "md 파일로"라고 하면 Claude Doc 은 버리고 리포 `_workspace/<고객>-<날짜>/` 에 둔다. 코덱스 검토 의뢰서는 문서 본문을 stdin 에 포함(`-` 프롬프트)하고 `-o` 로 결과 파일을 받는다.

## 후속: 보고 자료화 — 그림 9장 + PPT 31장 (2026-10-13 오후)

사용자 요구 "가능하다/어떻게 구현/했다를 보고하는 자료 — 공식 문서 링크·구현 방법·아키텍처·플로우차트·그림, PPT 도". 참고 PPT `Moves_Workforce_Dmove_제품소개_v2.1.pptx` 의 원본 빌드 스크립트(`moves-workforce/_workspace/product-intro-ppt/build.js`)에서 디자인 토큰·헬퍼(content/section/card/table/points)를 그대로 가져와 30분 안에 같은 룩으로 맞췄다.

- **그림 파이프라인**: 손으로 쓴 SVG(작은 DSL: box/arrow/group/diamond) → `sharp`(density 192) → PNG. Windows 에서 `Noto Sans KR`/`Malgun Gothic` 한글 렌더링 OK. matplotlib·graphviz·mermaid-cli 없이 됨. 글자 폭은 한글 ≈ 1em 로 계산해 상자 폭을 잡는다.
- **PPT QA**: LibreOffice 없음 → **PowerPoint COM**(`$pres.Slides.Item(i).Export(png,"PNG",1600,900)`)으로 슬라이드 PNG 내보내기. `thumbnail.py` 는 soffice 의존이라 Windows 에서 실패(`socket.AF_UNIX`). 첫 렌더에서 제목 2줄 넘침 5장·표/카드 푸터 겹침 2장·표지 라벨 잘림 — 긴 한글 제목은 26pt 에서 약 30자가 한계.
- **pptxgenjs/sharp 는 전역에 없음** → 스크래치 폴더에 `npm install pptxgenjs sharp react react-dom react-icons`. 한글 파일명 경로는 `PYTHONUTF8=1` 없이 python zipfile 이 못 연다(markitdown 도).
- 공식 문서 URL 40개는 `curl -I` 로 일괄 확인 후 표로. 404 였던 것: `storage-reference/sql-limits`, `manifest-reference/app-licensing`.
- 사용자 추가 요구 "전체적인 아키텍처" = 두 앱 역할도가 아니라 **5계층 시스템도**(브라우저 → Forge 함수 → 저장소 → Jira 데이터 → 테넌트 밖). 둘 다 넣었다.
