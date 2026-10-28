# APM 심층 진단 설계 검수

- 날짜: 2026-10-28
- 대상: [설계 초안 v0.2](devdesign_apm-deep-diagnostics.md)
- 범위: 문서 독자 검증·현재 코드 경계 대조·정적 문서 검사. 제품 구현·부하 시험·마이그레이션 실행은 하지 않았다.
- 방법: 대화 맥락이 없는 독립 독자가 문서만 읽고 6개 질문에 답한 뒤 모순·누락을 검토했다. 작성자가 수정하고 같은 독자가 변경 사항을 재검토했다.

## 독자 질문과 이해 결과

| 질문 | 이해 결과 |
|---|---|
| 첫 MVP와 후속 단계는? | R0 실증 후 M1a 문맥 연결+M1b 획득 계측. JFR·로그/DBM·프로파일링은 후속임을 구분 |
| request·instance·process는 어떻게 구분하는가? | 요청 직접 증거와 instance 시간 정황을 구분. M1 metric으로 재시작별 JVM 귀속을 보장할 수 없음을 이해 |
| Hikari 측정값의 의미와 누락 처리? | getConnection 전체 경과이며 순수 큐 대기가 아님. summary 미수신은 0이 아님을 이해 |
| 기존 분석·수집 비용은 어떻게 보호하는가? | 진단 span 분석 제외, 조회 LIMIT 전 필터, JVM 전송 상한 및 공유 queue의 미검증 위험을 구분 |
| API·권한·부분 실패·과거 자료 계약은? | SERVER 선택, 자료별 상태, runtime 실패 격리, 과거 identity null, archive 존재 비추정 이해 |
| 완료를 입증하려면 무엇을 시험하는가? | R0 지원 조합·전송·비용과 T1~T20(T13a/b 포함), 계약 승격 필요. 기존 185건 통과와 신규 기능 검증을 혼동하지 않음 |

## 발견 사항과 반영

| 항목 | 수정 |
|---|---|
| 요약 카운터와 완전성 미정의 | attempts 불변식, producer retained와 실제 수신 수, 미종료/임계 미만/유실 상태표, union 하한 추가 |
| 진단 span이 기존 수집 예산 잠식 | JVM별 rate·byte 상한, 묶음 예산 확보, 공유 queue 유실 실증 게이트. 일반 조회에서 diagnostic 제외 후 5,000 LIMIT 적용 |
| 누적 시간·SQL/HTTP 응답 빠짐 | total/max·expected/received·belowThreshold·unfinished·operations 필드 추가 |
| 중첩 SERVER의 작업 귀속 불명확 | 가장 가까운 SERVER 조상+같은 서비스, 부모 누락 시 부분 처리, BE 분류 책임 고정 |
| pool 압박 규칙의 AND/집계 불명확 | 동일 instance·pool·버킷 평균값 AND, null/분모≤0 제외. 특정 poolUid와 자동 연결 금지 |
| API 실패/자료 상태가 갈림 | admission과 자료 timeout 분리, nullability·선택 전 형태·archive 비추정 명시 |
| 기능 OFF가 계측/조회 모두 의미 | collection/query flag 분리. T13a/b로 저장 증거 조회 가능과 API 차단을 구분 |
| DIRECT/correlationScope 용어 혼용 | basis=MEASURED·scope로 통일 |

재검수에서 남은 두 문장도 수정했다. ‘상세 구간 0건’을 ‘획득 0회’로 표시하지 않고 유효 summary.attempts=0일 때만 0회로 설명한다. collection OFF와 query OFF의 시험 기대도 별도로 기록했다.

독립 독자가 수정된 두 위치까지 다시 읽고 기존 8개 지적이 설계 초안 수준에서 모두 해소됐으며 재검수 범위에 잔여 모순이 없음을 확인했다.

## 확인과 잔여 과제

- JSON 예시 구문 및 카운터 식을 확인했다. 예시는 자료 배열을 축약한 shape이며 운영 응답 픽스처가 아니다.
- 로컬 상대 링크의 대상 존재를 확인했다.
- BE·FE·Java 확장 제품 worktree에 이번 작업의 변경을 만들지 않았다.
- R0 미검증: 정확한 Hikari/Agent hook·classloader resource 공유·async 귀속·tail 지연/드롭·query plan·전송 비용·지원표. 수치는 초안 한도이며 실측 지원 사양이 아니다.
- API enum·최종 설정 key·OpenAPI/FE fixture는 구현 착수 시 계약 문서로 승격한다. M2~M4 중앙 전송·원문 접근 계약은 별도 과제다.
- 판정: **설계 검토용 초안으로 제공 가능. 구현 완료나 실운영 지원 판정은 아님.**
