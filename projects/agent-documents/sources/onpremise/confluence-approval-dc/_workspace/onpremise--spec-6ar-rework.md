# 배치 6a 재작업: QA FAIL 13건

워킹트리(커밋 2b894ed 이후)에 배치 6a가 적용되어 있다. 그 위에서 결함만 고친다.

**시작 전에 반드시 읽어라:**
1. `_workspace/qa-6a.md` — 결함 13건과 재작업 지시 (1차 기준)
2. `_workspace/design-batch6.md` **§D** — 영역 본문 추출 스캐너·정규화·해시의 확정 설계
   (치명 1번의 해법이 여기 있다. 네 정규식 구현을 버리고 이 설계로 교체하라)

## 필수 수정 (우선순위)

### 1. 치명: regionBodies를 설계 §D의 깊이 인식 스캐너로 교체
- 자기닫힘 매크로(`<ac:structured-macro .../>` — children/toc/anchor 등)가 영역 본문에 있어도
  approval-region의 본문 경계를 정확히 잡아야 한다. 정규식 non-greedy 매칭 금지.
- 정규화·해시도 §D 확정안으로: 태그 사이 공백 제거 + 공백 런 축약 + 신원 속성(ac:macro-id,
  ac:local-id, ac:schema-version) 제거 + 빈 요소 표기 정규화. 엔티티/CDATA/대소문자는 불변.
  해시 값에 `v1:` 접두사 — 접두사 불일치는 unknown으로 보고 페이지 버전 폴백.
- 단위 테스트 보강: **자기닫힘 매크로 포함 영역**, 중첩 매크로, 다중 영역, key 미지정/중복,
  공백 변형 동일 해시, 신원 속성 변형 동일 해시, 내용 변경 상이 해시, v0(접두사 없음) 해시 폴백.
- 리스너의 "영역 부재 → 자동 취소" 분기는 스캐너 교체 후에만 안전하다 — 취소 전에 접두사/추출
  성공 여부를 확인하는 가드가 설계에 있으면 그대로 반영.

### 2. 치명: c9 테스트 RED — ApprovalRegionMacroSettingsCacheTest 기대값
- CANCELLED 라벨 추가로 PluginSettings.get 호출이 13→14가 된 것은 의도된 변화다.
  테스트의 기대값을 14로 갱신하고, 왜 늘었는지 주석 한 줄.

### 3. 치명: updateSettings의 cancelledLabel 필수화가 기존 호출자를 깨뜨림
- `cancelledLabel` 파라미터를 **선택(optional)** 으로 바꾼다: blank/미전달이면 기존 저장값(없으면
  기본 "회수")을 유지. 설정 화면 JS의 파라미터 추가는 6b에서 한다 — 백엔드가 구버전 호출자를
  깨뜨리면 안 된다. 관련 테스트(ApprovalRestResourceSettingsTest) 갱신.

### 4. 치명: REQUESTED 이메일 "반려 사유: {메모}" 중복
- EmailNotificationChannel/EmailNotificationMessage에서 reason 슬롯을 **이벤트 타입으로 분기**:
  REJECTED 이벤트의 reason만 "반려 사유" 자리로, REQUESTED의 reason(=요청 메모)은 "요청 메모"
  자리로만. 삭제했던 가드 주석("만료 사유는 반려 사유 자리에 넣지 않는다")을 타입 분기 설명으로
  복원·확장하라. 테스트로 고정 (REQUESTED 메일 본문에 "반려 사유" 문자열 부재).

### 5. 주의·경미 9건
qa-6a.md의 주의 4·경미 5를 각 지시대로 적용.

## 완료 기준 (자가 검증·보고 — 반드시 수행)
- **mvn 전체 테스트 green을 직접 실행·확인** (환경: `C:\Onpremise\.toolchains\apache-maven-3.9.16\bin\mvn.cmd`,
  JAVA_HOME=`C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot`. PATH에 mvn이 없다는 이유로 건너뛰지 말 것.
  주의: approval-confluence9/target/classes에 이전 잔재가 있으면 지우고 빌드).
- 자기닫힘 매크로 시나리오의 단위 테스트가 실제로 존재하고 통과.
- git diff --check 통과.

## 코드 스타일
개별 import, statement 한 줄, 중괄호, 압축 금지, 지시 외 변경 금지, 주석 한국어.
