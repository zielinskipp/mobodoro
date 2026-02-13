export type TimerState = {
  minutes: number;
  seconds: number;
  isRunning: boolean;
};

export type Duration = {
  minutes: number;
  seconds: number;
};
export type Phase = "work" | "shortBreak" | "longBreak";

export type SessionState = {
  id: string;

  mobbers: string[];
  currentMobberIndex: number;

  phase: Phase;
  timer: TimerState;
  duration: Duration;
  rotationsBeforeBreak: number;
  rotationCount: number;
};

export function makeSession(): SessionState {
  return {
    id: crypto.randomUUID(),
    mobbers: [],
    currentMobberIndex: 0,
    phase: "work",
    timer: {
      minutes: 25,
      seconds: 0,
      isRunning: false,
    },
    duration: {
      minutes: 25,
      seconds: 0,
    },
    rotationsBeforeBreak: 1,
    rotationCount: 0,
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
      minutes: session.timer.minutes - 1,
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

export function addMobber(session: SessionState, mobber: string): SessionState {
  return {
    ...session,
    mobbers: [...session.mobbers, mobber],
  };
}

export function removeMobber(
  session: SessionState,
  mobber: string,
): SessionState {
  return {
    ...session,
    mobbers: session.mobbers.filter((m) => m !== mobber),
  };
}

export function rotateMobber(session: SessionState): SessionState {
  return {
    ...session,
    currentMobberIndex:
      (session.currentMobberIndex + 1) % session.mobbers.length,
  };
}

export function handleTimerExpired(session: SessionState): SessionState {
  if (session.timer.minutes !== 0 || session.timer.seconds !== 0) {
    return session;
  }

  // Handle work phase expiration
  if (session.phase === "work") {
    const nextRotationCount = session.rotationCount + 1;

    // Check if we've hit the rotation limit - time for a break
    if (nextRotationCount >= session.rotationsBeforeBreak) {
      return {
        ...session,
        phase: "shortBreak",
        timer: {
          minutes: 5,
          seconds: 0,
          isRunning: false,
        },
        rotationCount: 0,
      };
    }

    // Continue working - rotate mobber and increment count
    const rotated = rotateMobber(session);
    return {
      ...rotated,
      phase: "work",
      timer: { ...session.duration, isRunning: false },
      rotationCount: nextRotationCount,
    };
  }

  // Handle break phase expiration - return to work
  if (session.phase === "shortBreak") {
    return {
      ...session,
      phase: "work",
      timer: { ...session.duration, isRunning: false },
    };
  }

  return session;
}
