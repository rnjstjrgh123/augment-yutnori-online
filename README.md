# 증강 윷놀이 온라인

Node.js 18+ / Express / Socket.IO 기반 멀티플레이 윷놀이입니다.

## 실행 방법
1. ZIP 압축을 풉니다.
2. 프로젝트 폴더에서 `npm install`을 실행합니다.
3. `npm test`로 핵심 흐름과 파일 일치 여부, JavaScript 문법을 검사합니다.
4. `npm start`로 서버를 실행합니다.
5. 브라우저에서 `http://localhost:3000`에 접속합니다. 다른 기기에서 접속하려면 같은 네트워크의 PC IP 주소와 포트를 사용하세요.

## 증강 선택 흐름
1. 방장이 게임 시작을 누르면 서버가 `augment` 단계로 전환됩니다.
2. 서버가 실제로 제공하는 파일은 `public/index.html`입니다. 이 파일은 루트 `index.html`과 동일하게 유지됩니다.
3. 증강 선택 화면에서 네 가지 증강 중 하나를 선택하고 확정합니다.
4. 한 명만 선택한 상태에서는 선택 화면이 유지되며, 다른 플레이어는 자신의 증강을 선택할 수 있습니다.
5. 모든 참가자가 확정하면 서버가 `playing` 단계로 바꾸고 말판을 표시합니다.

## 포함된 증강
- **행운의 윷 (`fortune`)**: 윷·모 확률 증가
- **포획왕 (`capturer`)**: 상대 말을 잡으면 추가 던지기 기회
- **수호 부적 (`guardian`)**: 첫 포획 1회 방어
- **질주 (`swift`)**: 첫 출발 이동에 한 칸 추가

## 테스트
- `npm test`: 실제 Express가 제공하는 파일과 루트 HTML이 같은지, 증강 모달/카드/이벤트/서버 단계 전환 및 JavaScript 문법을 확인합니다.
- `python augment_visibility_test.py`: Playwright와 Chromium이 설치되어 있을 때 가짜 Socket.IO 이벤트로 증강 모달의 표시 동작을 검사합니다.
- `python browser_test.py`, `python debug_test.py`, `python responsive_test.py`: 기존 브라우저 기반 회귀 점검 스크립트입니다. Playwright와 Chromium이 필요합니다.

브라우저 기반 테스트는 가짜 Socket.IO 이벤트를 사용하는 화면 회귀 검사이며, 실제 배포 서버나 인터넷 멀티플레이를 검증하는 테스트는 아닙니다.

## Render에 배포
1. 저장소에 `package.json`, `package-lock.json`, `server.js`, `public/index.html`을 포함한 프로젝트 파일을 올립니다.
2. Render Web Service의 Build Command를 `npm install`, Start Command를 `npm start`로 설정합니다.
3. 변경사항을 커밋/푸시한 뒤 Render 배포 로그에서 정상 시작 여부를 확인합니다.

주의: ZIP을 만드는 것만으로 GitHub 저장소나 Render 사이트가 자동으로 변경되지는 않습니다. 수정한 파일을 저장소에 올리고 새 배포를 해야 온라인 사이트에 반영됩니다.
