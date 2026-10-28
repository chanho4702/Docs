# 교차 검토 요청: 배치 6a (회수·요청 메모·영역 해시)

너는 이 저장소의 **독립 리뷰어**다. 코드를 수정하지 마라 — 발견만 보고하라.

## 대상
`git diff 2b894ed..1d79ffb` (배치 6a: CANCELLED 상태, 요청 메모, 영역 본문 해시).
맥락 문서: `_workspace/design-batch6.md` §D(영역 해시 설계), `_workspace/qa-6a3.md`(QA 최종 판정).

## 관점 (QA가 이미 3라운드를 돌았으니, QA가 놓치기 쉬운 것에 집중하라)
1. **동시성**: 리스너의 취소/만료와 REST의 승인/반려가 같은 요청에 동시에 닿을 때 락 규율이
   지켜지는가. cancel 경로의 withRequestLock 사용과 리스너의 요청별 처리 순서.
2. **도메인 불변식**: CANCELLED 추가가 기존 exhaustive switch, 상태 필터, 지표 계산, C10 어댑터
   컴파일(공유 domain 모듈!)에 미치는 파급. 특히 approval-confluence10이 domain을 공유하므로
   C10 쪽 switch/valueOf가 깨지는지 확인하라.
3. **스캐너 성능·안전성**: 큰 storage format(수백 KB)에서 regionHashes의 복잡도, 정규식 백트래킹
   위험(normalizeEmptyElements의 중첩 수량자), 악의적 입력에 대한 ReDoS 가능성.
4. **API 호환**: create의 requestMessage/regionHash/fromRequestId 파라미터 추가가 기존 호출자
   (approval.js, C10 JS)와 충돌하지 않는가.
5. 그 밖에 네가 보기에 위험한 것 무엇이든.

## 보고 형식
`_workspace/codex-review-6a.md` 파일로 작성:
- 발견별: 심각도(치명/중대/경미) / 파일:라인 / 근거 / 권장 수정
- 마지막에 "리뷰 범위에서 문제없음을 확인한 항목" 목록
수정 금지. 보고서 파일 작성만.
