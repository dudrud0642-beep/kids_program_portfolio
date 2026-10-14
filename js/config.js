// 배포 설정 — 화면에 그대로 공개돼도 되는 값만 넣는다
// kakaoJsKey: 카카오톡 공유용 JavaScript 키
//   1) developers.kakao.com → 내 애플리케이션 → 앱 만들기
//   2) 앱 키 → "JavaScript 키"를 복사해 아래에 넣기
//   3) 플랫폼 → Web → 사이트 도메인에 배포 주소(예: https://아이디.github.io) 등록
//   키가 비어 있거나 내 컴퓨터 파일로 열면 카카오톡 항목은 공유 메뉴에 나오지 않는다
window.MOA_CONFIG = Object.assign({ kakaoJsKey: '' }, window.MOA_CONFIG);
