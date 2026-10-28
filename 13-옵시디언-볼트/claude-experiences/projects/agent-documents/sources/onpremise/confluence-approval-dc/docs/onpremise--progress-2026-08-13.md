# 진행 기록 — 2026-08-13~14: 배치 8 전자서명·PIN·CC + 배포 사고와 하네스 강화

커밋: `4a3d8fb`(7b 화면 검증 문서) → `c9ea734`(8a+8b 백엔드) → `e57169a`(UI 직접 수정+철칙) →
`24862fe`(@FormParam 라이브 수정) → `2a7d6b3`(8c UI) → (8d는 교차 검토 후 커밋).
설계: `_workspace/design-batch8.md` D1~D10. 테스트: domain 54, c9 96→112.

## 기능 (전부 관리자 옵션, 기본 off = 현행 동일)

- **전자서명 3단계**: ① 자동 도장(이름 기반 CSS, 저장물 0 — APPROVE 결정 옆에만) ② 등록 서명
  (`APR_SIGN`, png/jpeg ≤50KB·매직바이트 검증, SVG 금지) ③ 서명 PIN(`APR_PIN`,
  PBKDF2WithHmacSHA256 210k회·상수시간 비교·5회 실패 15분 잠금·관리자 초기화).
  **PIN·서명 데이터는 form body 전용**(URL/access log 유출 차단, query 동명 파라미터 거부).
- **내 서명 화면**(업무함 `?view=signature`): 캔버스 그리기·파일 업로드·미리보기·삭제·PIN 등록/변경.
- **결정 동선**: `signaturePinRequired` 시 승인은 PIN 인라인 스텝, 반려는 사유+PIN 결합(스텝 중첩 없음).
  오류는 접두 제거된 인라인 메시지(미등록 안내/남은 시도/잠금).
- **CC 참조자**: 요청 모달 피커(사용자/그룹, 칩), 별도 테이블 `APR_CC`(승인자 모델 완전 격리 —
  결재 권한·eligible 오염 0), 알림은 요청 생성+최종 결정만(중간 승인 제외 — "마지막 APPROVED" 식별),
  상세 모달 참조자 섹션, 업무함 "참조" 탭(`/mine/cc`+배지).
- **UI 직접 수정 3건**(사용자 지시): 데코레이터 중복 제목 밴드 제거(업무함·설정), 사이드바
  풀하이트+경계선 호버 원형 토글, 아이콘 간격(스페이스 사이드바 빈 슬롯 재사용·버튼 예약 패딩 제거).

## 배포 사고 3연타와 라이브 전용 버그 (전부 실측·재발 방지 구조화)

1. **domain 임베드 누락 jar**: `target/classes/.../domain`은 `<Embed-Dependency>` 재료 —
   "stale 예방 삭제"(배치 7 교훈의 오일반화) 후 증분 verify가 domain 빠진 jar 생성 →
   REST·패널·매크로 전면 NoClassDefFoundError. → 배포 전 embed 게이트(`unzip -l | grep -c domain`).
2. **Sitemesh style 파싱**: CSS 주석 속 꺾쇠 태그 문자열에 데코레이터가 style 블록 전체를 잘라
   무스타일 렌더. 3. **실행 중 clean**: 잠금으로 "실패"가 아니라 container를 지우다 말아 전 경로
   404 좀비 + **c9 clean은 `target/confluence/home`(H2)을 삭제 → 테스트 데이터 소실**(8/13).
4. **@FormParam 라이브 버그**: REST v2 Jersey가 form 바디 없는 POST에 진입 전 500 — 단위 테스트가
   Jersey 레이어를 안 타서 QA 미검출. `formOnlyParam`(content-type 검사+query 동명 거부)으로 교체,
   배포 후 라이브 REST 실측(결정 POST 포함)을 게이트에 추가.
→ `approval-dev` 스킬 "빌드·배포 철칙 5조" + `approval-ui-style` 토큰 스코프 규칙 신설,
  경험 Vault `2026-08-13-batch8-deploy-traps` 기록.

## 파이프라인 변화 (2026-08-13 사용자 지시)

- **Claude는 스펙·검토·QA만, 구현은 전부 Codex** — 직접 수정 경로 폐지.
- **Codex 최상위 모델**: `gpt-5.6-sol` + reasoning `xhigh` (models_cache 실측 priority 1).
  체감: 이전 모델이 2회 부분 완료로 미룬 8c 잔여를 sol이 1회에 마감, 8d는 대형 배치를 한 번에.
- QA 라운드: 8a 2차(치명 1 — 설정 저장 400 회귀), 8b 2차(중대 2 — CC 중간승인 알림 스팸
  = **스펙 전제 오류**, 키 정규화), 8c 2차(치명 1 — closest() 오용으로 off 반려 사망 = JS 게이트
  사각), 8d 2차(중대 1 — CSS var() 재발, 2줄). 전부 Codex 재작업으로 해소.
- Codex 보고 신뢰도: "161 tests" 허위(8b) ↔ 정직한 부분 완료·미수행 명시(8a·8c·8d) 공존 —
  "Tests run: 줄 그대로 인용" 조항 이후 전 보고가 실측 일치.

## 실기동 검증 (8c까지 완료, 8d는 교차 검토 후)

off 반려(치명 수정 실증·JS 에러 0) · 자동 도장(패널 컨텍스트 색·회전 유효) · PIN 스텝
(즉시 POST 차단, password+new-password) · PIN_NOT_SET/INVALID 접두 제거 표시 · 정답 PIN 승인 ·
내 서명 화면 렌더. 참고: 설정 저장 REST는 라벨 4종 필수(기존 계약).

## 다음

배치 8.5(스페이스별 사용 설정 — 사용자 질문에서 등재) 또는 배치 9(위임+독촉). C10 이식 백로그에
배치 8 추가. 잔여 경미: qa-8d e1~e3(칩 정렬·빈 상태 문구·aria-label), m1(CC 미지정 시 조회 1회),
m2(재승인 프리필 칩 유지), N2 재관찰(Chrome 자동완성 — new-password 적용 후).
