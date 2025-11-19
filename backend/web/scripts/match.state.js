(() => {
  const createInitialState = () => ({
    matchId: null,
    game: null,
    moves: [],
    ws: null,
    currentUser: null,
    lastStateTimestamp: null,
    clockTimer: null,
    autoJoinAttempted: false,
    loginPromptShown: false,
    selectedSquare: null,
    availableTargets: new Set(),
    legalMovesByFrom: new Map(),
    pendingMove: false,
    autoCancelDeadline: null,
    autoCancelTimerId: null,
    timeoutAutoRequested: false,
    wsRetryCount: 0,
    wsReconnectTimerId: null,
  });

  const state = createInitialState();
  Object.seal(state);

  const setState = (updates, context = 'setState') => {
    if (!updates || typeof updates !== 'object') {
      console.warn('[match] setState called without object payload', { updates, context });
      return state;
    }
    Object.entries(updates).forEach(([key, value]) => {
      if (!(key in state)) {
        console.error(`[match] setState: unknown key "${key}"`, { context, updates });
        return;
      }
      state[key] = value;
    });
    return state;
  };

  const isAssigned = (value) => value !== null && value !== undefined;

  const haveBothPlayersJoined = (game = state.game) => {
    if (!game) return false;
    const { white_id: whiteId, black_id: blackId } = game;
    return isAssigned(whiteId) && isAssigned(blackId);
  };

  const getCurrentUserRole = () => {
    if (!state.currentUser || !state.game) return null;
    if (state.currentUser.id === state.game.white_id) return 'white';
    if (state.currentUser.id === state.game.black_id) return 'black';
    return null;
  };

  window.MatchState = {
    state,
    setState,
    haveBothPlayersJoined,
    getCurrentUserRole,
  };
})();

