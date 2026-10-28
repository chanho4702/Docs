# P5.1 수신 회귀 fixture

## R-P5b 난수 배치

`rp5b-v4-random-g1000.json.gz`는 R-P5b의 `raw_v4fat.ndjson` **9번째 줄**을 바꾸지 않고 gzip level 9, mtime 0으로 재압축한 파일이다. 생성 fixture이며 실제 고객 정보는 없다.

- 원본 위치: `%LOCALAPPDATA%/Temp/claude/C--solutions/73f0e76e-73ad-4f5f-b22e-ed7729545a96/scratchpad/rp5b/raw_v4fat.ndjson`
- 근거: `_workspace/verification/r-p5b_apm-live-yaml-correctness.md` §6.2, v4.1 정본 §2.3.0.
- 난수 속성, resource 그룹 1,000개, 그룹당 1스팬, 총 1,000스팬.
- 해제 후 **1,402,019 B**, 원문 SHA-256 `8c9705031fe51cb48a1bd2ae9bdddc3ad7021bbb88d14616263441b9a106e312`.
- 실측 문서의 Collector 회선 gzip은 **572.4 KiB**다. 캡처는 해제 후 원문만 보존했으므로 회선 바이트 자체를 복원한 것은 아니다. 이 파일은 Python gzip으로 재압축한 **590,363 B(576.5 KiB)**이며 압축기 차이를 포함한다.
- 기대 결과: HTTP 200, `partialSuccess.rejectedSpans=0`, 파싱 수용 카운터 1,000. 구 상한 512 KiB는 이 정상 배치를 거절한다.
