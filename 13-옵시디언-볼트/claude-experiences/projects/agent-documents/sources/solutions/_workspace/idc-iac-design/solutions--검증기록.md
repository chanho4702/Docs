# 산출물 검증 기록

작성일: 2026-10-27

## 범위

이 기록은 문서·도식 파일의 검증이다. 실제 서버, VPN, 방화벽, OpenTofu, Ansible의 운영 검증은 수행하지 않았다.

## 도식

| 항목 | 네트워크 | 운영 흐름 |
|---|---|---|
| diagram_type | architecture | architecture |
| HTML | network.html | operations.html |
| showcase validation | 9/9, 오류 0, 경고 0 | 9/9, 오류 0, 경고 0 |
| browser_evidence | passed | passed |
| PNG visual_review | passed | passed |
| schema 수정 횟수 | 0 | 1 |

- 브라우저 측정: 1440×900, 1600×1000, 1920×1080, 2048×1320. overflow 및 가독성 자동 검사 통과.
- 실제 이미지 확인: 큰 화면 light, 작은 화면 dark, 최종 PNG 두 장의 글자·연결선·잘림 확인.
- network 초기 sandbox Chrome 실행은 실패했으나 동일 HTML을 로컬 실행 권한으로 재검증해 통과했다.
- HTML은 보조 뷰어다. 운영 흐름 HTML에는 하단 여백이 있어 Confluence에는 UI와 불필요한 여백을 제외한 PNG를 사용한다.
- PNG는 검증한 HTML의 브라우저 캡처에서 도식 영역을 추출하고 한국어 제목·주석을 추가한 것이다.
- 고정 HTML 뷰어 UI와 lang은 영어 fallback이며, 본문·PNG 설명은 한국어다.

## SHA-256

network specification:
ab3bbcda5aff9c1c10dbdd3ebb3e4ea83e2b88f3421a15421b5b4b8fdf8d3100

network HTML:
8766f8d5b7e8fb6f02b4cf542b98f8ef5c3dcaffbf2250b4a9f875e1166a1583

operations specification:
182cc3126e170c049a43843a7eca0b29a961b7ccb002487b7aab8ca97284ace5

operations HTML:
feedaef2174b1f85342cb5327cb842c020dbb45d68d39ac3c2a3d54988e190f4

자동 브라우저 검사 원본: network.visual-check.json, operations.visual-check.json.
