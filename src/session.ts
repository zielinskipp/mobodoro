
export type TimerState = {
  minutes: number;
  seconds: number;
  isRunning: boolean;
};

export type SessionState = {
  id: string;
  mobbers: string[];
  timer: TimerState;
};

export function makeSession(): SessionState {
  return {
    id: crypto.randomUUID(),
    mobbers: [],
    timer: {
      minutes: 25,
      seconds: 0,
      isRunning: false,
    },
  };
}

export function tick(session: SessionState): SessionState {
  if (!session.timer.isRunning) {
    return session;
  }

  if (session.timer.seconds > 0) {
    return {
      ...session,
      timer: {
        ...session.timer,
        seconds: session.timer.seconds - 1,
      },
    };
  }
  return {
    ...session,
    timer: {
      ...session.timer,
      minutes: session.timer.minutes - 1 ,
      seconds: 59,
    },
  };
}

export function startTimer(session: SessionState): SessionState {
  return {
    ...session,
    timer: {
      ...session.timer,
      isRunning: true,
    },
  };
}

export function pauseTimer(session: SessionState): SessionState {
  return {
    ...session,
    timer: {
      ...session.timer,
      isRunning: false,
    },
  };
}

export function resetTimer(session: SessionState): SessionState {
  return {
    ...session,
    timer: {
      minutes: 25,
      seconds: 0,
      isRunning: false,
    },
  };
}