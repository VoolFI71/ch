(() => {
  const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8'];
  const FILE_TO_INDEX = Object.fromEntries(FILES.map((f, idx) => [f, idx]));

  const KNIGHT_DELTAS = [
    [1, 2],
    [2, 1],
    [2, -1],
    [1, -2],
    [-1, -2],
    [-2, -1],
    [-2, 1],
    [-1, 2],
  ];

  const KING_DELTAS = [
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
    [0, -1],
    [1, -1],
  ];

  const BISHOP_DELTAS = [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];

  const ROOK_DELTAS = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  const QUEEN_DELTAS = [...BISHOP_DELTAS, ...ROOK_DELTAS];

  const PROMOTION_PIECES = ['q', 'r', 'b', 'n'];

  const EMPTY = '';

  function squareToCoords(square) {
    if (!square || square.length !== 2) return null;
    const fileIdx = FILE_TO_INDEX[square[0]];
    const rankIdx = 8 - parseInt(square[1], 10);
    if (Number.isNaN(rankIdx) || fileIdx === undefined) return null;
    return { file: fileIdx, rank: rankIdx };
  }

  function coordsToSquare(file, rank) {
    if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
    return `${FILES[file]}${8 - rank}`;
  }

  function parseFen(fen) {
    const [placement, active, castling, enPassant] = fen.split(' ');
    const rows = placement.split('/');
    const board = rows.map((row) => {
      const expanded = [];
      for (const char of row) {
        if (Number.isInteger(Number.parseInt(char, 10))) {
          const empties = Number.parseInt(char, 10);
          for (let i = 0; i < empties; i += 1) {
            expanded.push(EMPTY);
          }
        } else {
          expanded.push(char);
        }
      }
      return expanded;
    });
    return {
      board,
      activeColor: active === 'w' ? 'white' : 'black',
      castlingRights: castling || '-',
      enPassant: enPassant && enPassant !== '-' ? enPassant : null,
    };
  }

  function pieceColor(piece) {
    if (!piece) return null;
    return piece === piece.toUpperCase() ? 'white' : 'black';
  }

  function inBounds(file, rank) {
    return file >= 0 && file < 8 && rank >= 0 && rank < 8;
  }

  function addMove(fromSquare, toSquare, promotion, moves, movesByFrom) {
    let uci = `${fromSquare}${toSquare}`;
    if (promotion) uci += promotion;
    const normalized = uci.toLowerCase();
    moves.add(normalized);
    if (!movesByFrom.has(fromSquare)) {
      movesByFrom.set(fromSquare, new Set());
    }
    movesByFrom.get(fromSquare).add(normalized);
  }

  function generateSlidingMoves(board, startFile, startRank, color, deltas, moves, movesByFrom) {
    const fromSquare = coordsToSquare(startFile, startRank);
    for (const [df, dr] of deltas) {
      let file = startFile + df;
      let rank = startRank + dr;
      while (inBounds(file, rank)) {
        const target = board[rank][file];
        if (target === EMPTY) {
          addMove(fromSquare, coordsToSquare(file, rank), null, moves, movesByFrom);
        } else {
          if (pieceColor(target) !== color) {
            addMove(fromSquare, coordsToSquare(file, rank), null, moves, movesByFrom);
          }
          break;
        }
        file += df;
        rank += dr;
      }
    }
  }

  function generateKnightMoves(board, startFile, startRank, color, moves, movesByFrom) {
    const fromSquare = coordsToSquare(startFile, startRank);
    for (const [df, dr] of KNIGHT_DELTAS) {
      const file = startFile + df;
      const rank = startRank + dr;
      if (!inBounds(file, rank)) continue;
      const target = board[rank][file];
      if (target === EMPTY || pieceColor(target) !== color) {
        addMove(fromSquare, coordsToSquare(file, rank), null, moves, movesByFrom);
      }
    }
  }

  function generateKingMoves(board, startFile, startRank, color, castlingRights, moves, movesByFrom) {
    const fromSquare = coordsToSquare(startFile, startRank);
    for (const [df, dr] of KING_DELTAS) {
      const file = startFile + df;
      const rank = startRank + dr;
      if (!inBounds(file, rank)) continue;
      const target = board[rank][file];
      if (target === EMPTY || pieceColor(target) !== color) {
        addMove(fromSquare, coordsToSquare(file, rank), null, moves, movesByFrom);
      }
    }

    // Castling (basic empty-square check, backend will enforce legality under attack)
    if (color === 'white' && board[7][4] === 'K') {
      if (castlingRights.includes('K') && board[7][5] === EMPTY && board[7][6] === EMPTY) {
        addMove('e1', 'g1', null, moves, movesByFrom);
      }
      if (
        castlingRights.includes('Q') &&
        board[7][3] === EMPTY &&
        board[7][2] === EMPTY &&
        board[7][1] === EMPTY
      ) {
        addMove('e1', 'c1', null, moves, movesByFrom);
      }
    } else if (color === 'black' && board[0][4] === 'k') {
      if (castlingRights.includes('k') && board[0][5] === EMPTY && board[0][6] === EMPTY) {
        addMove('e8', 'g8', null, moves, movesByFrom);
      }
      if (
        castlingRights.includes('q') &&
        board[0][3] === EMPTY &&
        board[0][2] === EMPTY &&
        board[0][1] === EMPTY
      ) {
        addMove('e8', 'c8', null, moves, movesByFrom);
      }
    }
  }

  function generatePawnMoves(board, startFile, startRank, color, enPassant, moves, movesByFrom) {
    const direction = color === 'white' ? -1 : 1;
    const startRankHome = color === 'white' ? 6 : 1;
    const promotionRank = color === 'white' ? 0 : 7;
    const fromSquare = coordsToSquare(startFile, startRank);

    const oneForwardRank = startRank + direction;
    if (inBounds(startFile, oneForwardRank) && board[oneForwardRank][startFile] === EMPTY) {
      const toSquare = coordsToSquare(startFile, oneForwardRank);
      if (oneForwardRank === promotionRank) {
        for (const piece of PROMOTION_PIECES) {
          addMove(fromSquare, toSquare, piece, moves, movesByFrom);
        }
      } else {
        addMove(fromSquare, toSquare, null, moves, movesByFrom);
        const twoForwardRank = startRank + direction * 2;
        if (
          startRank === startRankHome &&
          inBounds(startFile, twoForwardRank) &&
          board[twoForwardRank][startFile] === EMPTY
        ) {
          addMove(fromSquare, coordsToSquare(startFile, twoForwardRank), null, moves, movesByFrom);
        }
      }
    }

    for (const df of [-1, 1]) {
      const file = startFile + df;
      const rank = startRank + direction;
      if (!inBounds(file, rank)) continue;
      const target = board[rank][file];
      const targetColor = pieceColor(target);
      const toSquare = coordsToSquare(file, rank);
      if (target !== EMPTY && targetColor && targetColor !== color) {
        if (rank === promotionRank) {
          for (const piece of PROMOTION_PIECES) {
            addMove(fromSquare, toSquare, piece, moves, movesByFrom);
          }
        } else {
          addMove(fromSquare, toSquare, null, moves, movesByFrom);
        }
      } else if (enPassant) {
        const enPassantCoords = squareToCoords(enPassant);
        if (
          enPassantCoords &&
          enPassantCoords.file === file &&
          enPassantCoords.rank === rank &&
          board[startRank][file] !== EMPTY &&
          pieceColor(board[startRank][file]) !== color
        ) {
          addMove(fromSquare, toSquare, null, moves, movesByFrom);
        }
      }
    }
  }

  function generateMoves(fen, color) {
    const { board, castlingRights, enPassant } = parseFen(fen);
    const moves = new Set();
    const movesByFrom = new Map();

    for (let rank = 0; rank < 8; rank += 1) {
      for (let file = 0; file < 8; file += 1) {
        const piece = board[rank][file];
        if (!piece) continue;
        if (pieceColor(piece) !== color) continue;
        const lower = piece.toLowerCase();
        switch (lower) {
          case 'p':
            generatePawnMoves(board, file, rank, color, enPassant, moves, movesByFrom);
            break;
          case 'n':
            generateKnightMoves(board, file, rank, color, moves, movesByFrom);
            break;
          case 'b':
            generateSlidingMoves(board, file, rank, color, BISHOP_DELTAS, moves, movesByFrom);
            break;
          case 'r':
            generateSlidingMoves(board, file, rank, color, ROOK_DELTAS, moves, movesByFrom);
            break;
          case 'q':
            generateSlidingMoves(board, file, rank, color, QUEEN_DELTAS, moves, movesByFrom);
            break;
          case 'k':
            generateKingMoves(board, file, rank, color, castlingRights, moves, movesByFrom);
            break;
          default:
            break;
        }
      }
    }

    return { moves, movesByFrom };
  }

  function isMoveAllowed(fen, color, uci) {
    if (!fen || !uci) return false;
    const normalized = uci.toLowerCase();
    const { moves } = generateMoves(fen, color);
    return moves.has(normalized);
  }

  function getMovesForSquare(fen, color, square) {
    if (!fen || !square) return [];
    const { movesByFrom } = generateMoves(fen, color);
    const entries = movesByFrom.get(square.toLowerCase());
    if (!entries) return [];
    return Array.from(entries.values());
  }

  window.ChessMoveUtils = {
    generateMoves,
    isMoveAllowed,
    getMovesForSquare,
    parseFen,
  };
})();

