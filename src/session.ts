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

export type Mobber = { readonly name: string; readonly color: string };

const PALETTE = [
  "#e74c3c",
  "#3498db",
  "#2ecc71",
  "#f39c12",
  "#9b59b6",
  "#1abc9c",
  "#e67e22",
  "#e91e63",
];

export type SessionState = {
  id: string;

  mobbers: Mobber[];
  currentMobberIndex: number;

  phase: Phase;
  timer: TimerState;
  duration: Duration;
  breakDuration: Duration;
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
    breakDuration: {
      minutes: 5,
      seconds: 0,
    },
    rotationsBeforeBreak: 1,
    rotationCount: 0,
  };
}

export function configureSession(
  session: SessionState,
  config: {
    workMinutes: number;
    breakMinutes: number;
    rotationsBeforeBreak: number;
  },
): SessionState {
  return {
    ...session,
    duration: {
      minutes: config.workMinutes,
      seconds: 0,
    },
    breakDuration: {
      minutes: config.breakMinutes,
      seconds: 0,
    },
    timer: {
      ...session.timer,
      minutes: config.workMinutes,
      seconds: 0,
    },
    rotationsBeforeBreak: config.rotationsBeforeBreak,
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

export function setTimer(
  session: SessionState,
  minutes: number,
  seconds: number,
): SessionState {
  return {
    ...session,
    timer: {
      minutes,
      seconds,
      isRunning: false,
    },
  };
}

export function addMobber(session: SessionState, name: string): SessionState {
  const color = PALETTE[session.mobbers.length % PALETTE.length];
  const newMobber: Mobber = { name, color };

  return {
    ...session,
    mobbers: [...session.mobbers, newMobber],
  };
}

export function renameMobber(
  session: SessionState,
  oldName: string,
  newName: string,
): SessionState {
  return {
    ...session,
    mobbers: session.mobbers.map((m) =>
      m.name === oldName ? { ...m, name: newName } : m,
    ),
  };
}

export function removeMobber(
  session: SessionState,
  name: string,
): SessionState {
  return {
    ...session,
    mobbers: session.mobbers.filter((m) => m.name !== name),
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
          ...session.breakDuration,
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

  // Handle break phase expiration - return to work and rotate to next driver
  if (session.phase === "shortBreak") {
    const rotated =
      session.mobbers.length > 0 ? rotateMobber(session) : session;
    return {
      ...rotated,
      phase: "work",
      timer: { ...session.duration, isRunning: false },
    };
  }

  return session;
}

export function skipPhase(session: SessionState): SessionState {
  // Set timer to 0:0 and trigger expiration logic
  const expired = {
    ...session,
    timer: {
      ...session.timer,
      minutes: 0,
      seconds: 0,
    },
  };
  return handleTimerExpired(expired);
}
