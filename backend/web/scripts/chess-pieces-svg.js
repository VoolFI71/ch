// SVG компоненты для шахматных фигур
// Используются вместо Unicode символов для более профессионального вида

const ChessPiecesSVG = {
  // Белые фигуры
  K: `<svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg">
    <g fill="#fff" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M 22.5,11.63 L 22.5,6" stroke-linejoin="miter"/>
      <path d="M 20,8 L 25,8" stroke-linejoin="miter"/>
      <path d="M 22.5,25 C 22.5,25 27,17.5 25.5,14.5 C 25.5,14.5 24.5,12 22.5,12 C 20.5,12 19.5,14.5 19.5,14.5 C 18,17.5 22.5,25 22.5,25" fill="#fff" stroke-linecap="butt" stroke-linejoin="miter"/>
      <path d="M 12.5,37 C 18,40.5 27,40.5 32.5,37 L 32.5,30 C 32.5,30 41.5,25.5 38.5,19.5 C 34.5,13 25,16 22.5,23.5 L 22.5,27 L 22.5,23.5 C 20,16 10.5,13 6.5,19.5 C 3.5,25.5 12.5,30 12.5,30 L 12.5,37 z" fill="#fff"/>
      <path d="M 12.5,30 C 18,27 27,27 32.5,30" fill="none"/>
      <path d="M 12.5,33.5 C 18,30.5 27,30.5 32.5,33.5" fill="none"/>
      <path d="M 12.5,37 C 18,34 27,34 32.5,37" fill="none"/>
    </g>
  </svg>`,
  
  Q: `<svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg">
    <g fill="#fff" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M 9,26 C 17.5,24.5 30,24.5 36,26 L 38.5,13.5 L 31,25 L 30.7,10.9 L 25.5,24.5 L 22.5,10 L 19.5,24.5 L 14.3,10.9 L 14,25 L 6.5,13.5 L 9,26 z"/>
      <path d="M 9,26 C 9,28 10.5,28 11.5,30 C 12.5,31.5 12.5,31 12,33.5 C 10.5,34.5 11,36 11,36 C 9.5,37.5 11,38.5 11,38.5 C 17.5,39.5 27.5,39.5 34,38.5 C 34,38.5 35.5,37.5 34,36 C 34,36 34.5,34.5 33,33.5 C 32.5,31 32.5,31.5 33.5,30 C 34.5,28 36,28 36,26 C 30,24.5 15,24.5 9,26 z"/>
      <path d="M 11.5,30 C 15,29 30,29 33.5,30" fill="none"/>
      <path d="M 12,33.5 C 18,32.5 27,32.5 33,33.5" fill="none"/>
      <g fill="#fff" stroke="none">
        <circle cx="6" cy="12" r="2"/>
        <circle cx="14" cy="9" r="2"/>
        <circle cx="22.5" cy="8" r="2"/>
        <circle cx="31" cy="9" r="2"/>
        <circle cx="39" cy="12" r="2"/>
      </g>
    </g>
  </svg>`,
  
  R: `<svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg">
    <g fill="#fff" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M 9,39 L 36,39 L 36,36 L 9,36 L 9,39 z" stroke-linecap="butt"/>
      <path d="M 12,36 L 12,32 L 33,32 L 33,36 L 12,36 z" stroke-linecap="butt"/>
      <path d="M 11,14 L 11,9 L 15,9 L 15,11 L 20,11 L 20,9 L 25,9 L 25,11 L 30,11 L 30,9 L 34,9 L 34,14" stroke-linecap="butt"/>
      <path d="M 34,14 L 31,17 L 14,17 L 11,14"/>
      <path d="M 31,17 L 31,29.5 L 14,29.5 L 14,17" stroke-linecap="butt" stroke-linejoin="miter"/>
      <path d="M 31,29.5 L 32.5,32 L 12.5,32 L 14,29.5"/>
      <path d="M 11,14 L 34,14" fill="none"/>
    </g>
  </svg>`,
  
  B: `<svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg">
    <g fill="#fff" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M 9,36 C 12.39,35.03 19.11,36.43 22.5,34 C 25.89,36.43 32.61,35.03 36,36 C 36,36 37.65,36.54 39,38 C 38.32,38.97 37.35,38.99 36,38.5 C 32.61,37.53 25.89,38.96 22.5,37.5 C 19.11,38.96 12.39,37.53 9,38.5 C 7.65,38.99 6.68,38.97 6,38 C 7.35,36.54 9,36 9,36 z"/>
      <path d="M 15,32 C 17.5,34.5 27.5,34.5 30,32 C 30.5,30.5 30,30 30,30 C 30,27.5 27.5,26 27.5,26 C 33,24.5 33.5,14.5 22.5,10.5 C 11.5,14.5 12,24.5 17.5,26 C 17.5,26 15,27.5 15,30 C 15,30 14.5,30.5 15,32 z"/>
      <path d="M 25 8 A 2.5 2.5 0 1 1 20,8 A 2.5 2.5 0 1 1 25 8 z"/>
      <path d="M 17.5,26 L 27.5,26 M 15,30 L 30,30 M 22.5,15.5 L 22.5,20.5 M 20,18 L 25,18" fill="none" stroke-linejoin="miter"/>
    </g>
  </svg>`,
  
  N: `<svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg">
    <g fill="#fff" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M 22,10 C 32.5,11 38.5,18 38,39 L 15,39 C 15,30 25,32.5 23,18" fill="#fff"/>
      <path d="M 24,18 C 24.38,20.91 18.45,25.37 16,27 C 13,29 13.18,31.34 11,31 C 9.958,30.06 12.41,27.96 11,28 C 10,28 11.19,29.23 10,30 C 9,30 5.997,31 6,26 C 6,24 12,14 12,14 C 12,14 13.89,12.1 14,10.5 C 13.27,9.506 13.5,8.5 13.5,7.5 C 14.5,6.5 16.5,10 16.5,10 L 18.5,10 C 18.5,10 19.28,8.008 21,7 C 22,7 22,10 22,10" fill="#fff"/>
      <path d="M 9.5 25.5 A 0.5 0.5 0 1 1 8.5,25.5 A 0.5 0.5 0 1 1 9.5 25.5 z" fill="#000"/>
      <path d="M 15 15.5 A 0.5 1.5 0 1 1 14,15.5 A 0.5 1.5 0 1 1 15 15.5 z" transform="matrix(0.866,0.5,-0.5,0.866,9.693,-5.173)" fill="#000"/>
    </g>
  </svg>`,
  
  P: `<svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg">
    <g fill="#fff" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="22.5" cy="12" r="4.5"/>
      <path d="M 18,16.5 C 18,16.5 18,24 18,24 C 18,27 21,28 22.5,28 C 24,28 27,27 27,24 C 27,24 27,16.5 27,16.5" stroke-linecap="butt"/>
      <path d="M 18,24 C 18,24 14,26 14,30 C 14,34 16,36 16,36 L 29,36 C 29,36 31,34 31,30 C 31,26 27,24 27,24" stroke-linecap="butt"/>
      <path d="M 14,36 L 31,36" stroke-linecap="butt"/>
      <path d="M 13,37 L 32,37" stroke-linecap="butt"/>
    </g>
  </svg>`,
  
  // Чёрные фигуры
  k: `<svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg">
    <g fill="#000" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M 22.5,11.63 L 22.5,6" stroke-linejoin="miter"/>
      <path d="M 20,8 L 25,8" stroke-linejoin="miter"/>
      <path d="M 22.5,25 C 22.5,25 27,17.5 25.5,14.5 C 25.5,14.5 24.5,12 22.5,12 C 20.5,12 19.5,14.5 19.5,14.5 C 18,17.5 22.5,25 22.5,25" fill="#000" stroke-linecap="butt" stroke-linejoin="miter"/>
      <path d="M 12.5,37 C 18,40.5 27,40.5 32.5,37 L 32.5,30 C 32.5,30 41.5,25.5 38.5,19.5 C 34.5,13 25,16 22.5,23.5 L 22.5,27 L 22.5,23.5 C 20,16 10.5,13 6.5,19.5 C 3.5,25.5 12.5,30 12.5,30 L 12.5,37 z" fill="#000"/>
      <path d="M 12.5,30 C 18,27 27,27 32.5,30" fill="none"/>
      <path d="M 12.5,33.5 C 18,30.5 27,30.5 32.5,33.5" fill="none"/>
      <path d="M 12.5,37 C 18,34 27,34 32.5,37" fill="none"/>
    </g>
  </svg>`,
  
  q: `<svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg">
    <g fill="#000" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M 9,26 C 17.5,24.5 30,24.5 36,26 L 38.5,13.5 L 31,25 L 30.7,10.9 L 25.5,24.5 L 22.5,10 L 19.5,24.5 L 14.3,10.9 L 14,25 L 6.5,13.5 L 9,26 z"/>
      <path d="M 9,26 C 9,28 10.5,28 11.5,30 C 12.5,31.5 12.5,31 12,33.5 C 10.5,34.5 11,36 11,36 C 9.5,37.5 11,38.5 11,38.5 C 17.5,39.5 27.5,39.5 34,38.5 C 34,38.5 35.5,37.5 34,36 C 34,36 34.5,34.5 33,33.5 C 32.5,31 32.5,31.5 33.5,30 C 34.5,28 36,28 36,26 C 30,24.5 15,24.5 9,26 z"/>
      <path d="M 11.5,30 C 15,29 30,29 33.5,30" fill="none"/>
      <path d="M 12,33.5 C 18,32.5 27,32.5 33,33.5" fill="none"/>
      <g fill="#000" stroke="none">
        <circle cx="6" cy="12" r="2"/>
        <circle cx="14" cy="9" r="2"/>
        <circle cx="22.5" cy="8" r="2"/>
        <circle cx="31" cy="9" r="2"/>
        <circle cx="39" cy="12" r="2"/>
      </g>
    </g>
  </svg>`,
  
  r: `<svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg">
    <g fill="#000" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M 9,39 L 36,39 L 36,36 L 9,36 L 9,39 z" stroke-linecap="butt"/>
      <path d="M 12,36 L 12,32 L 33,32 L 33,36 L 12,36 z" stroke-linecap="butt"/>
      <path d="M 11,14 L 11,9 L 15,9 L 15,11 L 20,11 L 20,9 L 25,9 L 25,11 L 30,11 L 30,9 L 34,9 L 34,14" stroke-linecap="butt"/>
      <path d="M 34,14 L 31,17 L 14,17 L 11,14"/>
      <path d="M 31,17 L 31,29.5 L 14,29.5 L 14,17" stroke-linecap="butt" stroke-linejoin="miter"/>
      <path d="M 31,29.5 L 32.5,32 L 12.5,32 L 14,29.5"/>
      <path d="M 11,14 L 34,14" fill="none"/>
    </g>
  </svg>`,
  
  b: `<svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg">
    <g fill="#000" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M 9,36 C 12.39,35.03 19.11,36.43 22.5,34 C 25.89,36.43 32.61,35.03 36,36 C 36,36 37.65,36.54 39,38 C 38.32,38.97 37.35,38.99 36,38.5 C 32.61,37.53 25.89,38.96 22.5,37.5 C 19.11,38.96 12.39,37.53 9,38.5 C 7.65,38.99 6.68,38.97 6,38 C 7.35,36.54 9,36 9,36 z"/>
      <path d="M 15,32 C 17.5,34.5 27.5,34.5 30,32 C 30.5,30.5 30,30 30,30 C 30,27.5 27.5,26 27.5,26 C 33,24.5 33.5,14.5 22.5,10.5 C 11.5,14.5 12,24.5 17.5,26 C 17.5,26 15,27.5 15,30 C 15,30 14.5,30.5 15,32 z"/>
      <path d="M 25 8 A 2.5 2.5 0 1 1 20,8 A 2.5 2.5 0 1 1 25 8 z"/>
      <path d="M 17.5,26 L 27.5,26 M 15,30 L 30,30 M 22.5,15.5 L 22.5,20.5 M 20,18 L 25,18" fill="none" stroke-linejoin="miter"/>
    </g>
  </svg>`,
  
  n: `<svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg">
    <g fill="#000" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M 22,10 C 32.5,11 38.5,18 38,39 L 15,39 C 15,30 25,32.5 23,18" fill="#000"/>
      <path d="M 24,18 C 24.38,20.91 18.45,25.37 16,27 C 13,29 13.18,31.34 11,31 C 9.958,30.06 12.41,27.96 11,28 C 10,28 11.19,29.23 10,30 C 9,30 5.997,31 6,26 C 6,24 12,14 12,14 C 12,14 13.89,12.1 14,10.5 C 13.27,9.506 13.5,8.5 13.5,7.5 C 14.5,6.5 16.5,10 16.5,10 L 18.5,10 C 18.5,10 19.28,8.008 21,7 C 22,7 22,10 22,10" fill="#000"/>
      <path d="M 9.5 25.5 A 0.5 0.5 0 1 1 8.5,25.5 A 0.5 0.5 0 1 1 9.5 25.5 z" fill="#fff"/>
      <path d="M 15 15.5 A 0.5 1.5 0 1 1 14,15.5 A 0.5 1.5 0 1 1 15 15.5 z" transform="matrix(0.866,0.5,-0.5,0.866,9.693,-5.173)" fill="#fff"/>
    </g>
  </svg>`,
  
  p: `<svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg">
    <g fill="#000" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="22.5" cy="12" r="4.5"/>
      <path d="M 18,16.5 C 18,16.5 18,24 18,24 C 18,27 21,28 22.5,28 C 24,28 27,27 27,24 C 27,24 27,16.5 27,16.5" stroke-linecap="butt"/>
      <path d="M 18,24 C 18,24 14,26 14,30 C 14,34 16,36 16,36 L 29,36 C 29,36 31,34 31,30 C 31,26 27,24 27,24" stroke-linecap="butt"/>
      <path d="M 14,36 L 31,36" stroke-linecap="butt"/>
      <path d="M 13,37 L 32,37" stroke-linecap="butt"/>
    </g>
  </svg>`,
};

// Функция для получения SVG фигуры
function getPieceSVG(piece) {
  return ChessPiecesSVG[piece] || '';
}

// Экспорт для использования в других скриптах
if (typeof window !== 'undefined') {
  window.ChessPiecesSVG = ChessPiecesSVG;
  window.getPieceSVG = getPieceSVG;
}

