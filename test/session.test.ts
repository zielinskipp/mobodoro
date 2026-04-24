import { describe, it, expect, createExpect } from "vitest";
import {
  makeSession,
  tick,
  startTimer,
  pauseTimer,
  resetTimer,
  setTimer,
  addMobber,
  removeMobber,
  renameMobber,
  rotateMobber,
  handleTimerExpired,
  configureSession,
  skipPhase,
  type Mobber,
} from "../src/session";

describe("Session management", () => {
  it("should create a new session", () => {
    const session = makeSession();

    expect(session.id).toBeDefined();
    expect(session.mobbers).toEqual([]);
    expect(session.phase).toBe("work");

    expect(session.timer.minutes).toBe(25);
    expect(session.timer.seconds).toBe(0);
    expect(session.timer.isRunning).toBe(false);

    expect(session.duration.minutes).toBe(25);
    expect(session.duration.seconds).toBe(0);
    expect(session.rotationsBeforeBreak).toBe(1);
    expect(session.rotationCount).toBe(0);
  });

  it("should configure session with custom durations when paused", () => {
    const session = makeSession();

    const configured = configureSession(session, {
      workMinutes: 10,
      breakMinutes: 3,
      rotationsBeforeBreak: 3,
    });

    expect(configured.duration.minutes).toBe(10);
    expect(configured.timer.minutes).toBe(10);
    expect(configured.rotationsBeforeBreak).toBe(3);
  });
});

describe("Ticking timer", () => {
  it("should decrement seconds when timer is running", () => {
    const session = makeSession();
    const running = {
      ...session,
      timer: { ...session.timer, isRunning: true },
    };

    const ticked = tick(running);

    expect(ticked.timer.minutes).toBe(24);
    expect(ticked.timer.seconds).toBe(59);
  });

  it("should decrement seconds without affecting minutes", () => {
    const session = makeSession();
    const running = {
      ...session,
      timer: { ...session.timer, seconds: 30, isRunning: true },
    };

    const ticked = tick(running);

    expect(ticked.timer.minutes).toBe(25);
    expect(ticked.timer.seconds).toBe(29);
  });

  it("should not change timer when not running", () => {
    const session = makeSession();
    const notRunning = {
      ...session,
      timer: { ...session.timer, seconds: 30, isRunning: false },
    };

    const ticked = tick(notRunning);

    expect(ticked.timer.seconds).toBe(30);
    expect(ticked.timer.minutes).toBe(25);
  });
});

describe("Timer controls", () => {
  it("should start the timer", () => {
    const session = makeSession();

    const started = startTimer(session);

    expect(started.timer.isRunning).toBe(true);
  });

  it("should pause the timer", () => {
    const session = makeSession();
    const running = {
      ...session,
      timer: { ...session.timer, isRunning: true },
    };

    const paused = pauseTimer(running);

    expect(paused.timer.isRunning).toBe(false);
  });

  it("should reset the timer to configured work duration", () => {
    const session = makeSession();
    const modified = {
      ...session,
      timer: { minutes: 10, seconds: 0, isRunning: true },
    };

    const reset = resetTimer(modified);

    expect(reset.timer.minutes).toBe(25);
    expect(reset.timer.seconds).toBe(0);
    expect(reset.timer.isRunning).toBe(false);
  });

  it("should reset to custom work duration when configured", () => {
    const session = configureSession(makeSession(), {
      workMinutes: 45,
      breakMinutes: 5,
      rotationsBeforeBreak: 1,
    });
    const running = {
      ...session,
      timer: { minutes: 10, seconds: 0, isRunning: true },
    };

    const reset = resetTimer(running);

    expect(reset.timer.minutes).toBe(45);
    expect(reset.timer.seconds).toBe(0);
    expect(reset.timer.isRunning).toBe(false);
  });

  it("should reset to break duration when in break phase", () => {
    const session = configureSession(makeSession(), {
      workMinutes: 25,
      breakMinutes: 10,
      rotationsBeforeBreak: 1,
    });
    const onBreak = {
      ...session,
      phase: "shortBreak" as const,
      timer: { minutes: 2, seconds: 0, isRunning: true },
    };

    const reset = resetTimer(onBreak);

    expect(reset.timer.minutes).toBe(10);
    expect(reset.timer.seconds).toBe(0);
    expect(reset.timer.isRunning).toBe(false);
  });

  it("should set timer to specific time", () => {
    const session = makeSession();

    const withCustomTime = setTimer(session, 0, 1);

    expect(withCustomTime.timer.minutes).toBe(0);
    expect(withCustomTime.timer.seconds).toBe(1);
    expect(withCustomTime.timer.isRunning).toBe(false);
  });

  it("should stop timer when setting custom time", () => {
    const session = makeSession();
    const running = startTimer(session);

    const withCustomTime = setTimer(running, 5, 30);

    expect(withCustomTime.timer.minutes).toBe(5);
    expect(withCustomTime.timer.seconds).toBe(30);
    expect(withCustomTime.timer.isRunning).toBe(false);
  });
});

describe("Mob management", () => {
  it("should add a mobber to the session", () => {
    const session = makeSession();

    const withMobber = addMobber(session, "Alice");

    expect(withMobber.mobbers).toEqual<Mobber[]>([
      { name: "Alice", color: "#e74c3c" },
    ]);
  });

  it("should remove a mobber from the session", () => {
    const session = makeSession();
    const withMobbers = addMobber(addMobber(session, "Alice"), "Bob");

    const withoutAlice = removeMobber(withMobbers, "Alice");

    expect(withoutAlice.mobbers).toEqual<Mobber[]>([
      { name: "Bob", color: "#3498db" },
    ]);
  });

  it("should start with first mobber as current", () => {
    const session = makeSession();
    expect(session.currentMobberIndex).toBe(0);
  });

  it("shoud rotate to next mobber", () => {
    const session = makeSession();
    const withMobbers = addMobber(addMobber(session, "Alice"), "Bob");

    const nextMobber = rotateMobber(withMobbers);

    expect(nextMobber.currentMobberIndex).toBe(1);
  });

  it("should wrap around to first mobber after last", () => {
    const session = makeSession();
    const withMobbers = addMobber(addMobber(session, "Alice"), "Bob");
    const rotatedOnce = rotateMobber(withMobbers);
    const rotatedTwice = rotateMobber(rotatedOnce);

    expect(rotatedTwice.currentMobberIndex).toBe(0);
  });
});

describe("Phase transitions", () => {
  it("should do nothing if timer not expired", () => {
    const session = makeSession();
    const notExpired = {
      ...session,
      timer: { ...session.timer, minutes: 0, seconds: 1, isRunning: true },
    };

    const afterTick = handleTimerExpired(notExpired);
    expect(afterTick).toEqual(notExpired);
  });

  it("should stay in work phase if rotations before break not reached", () => {
    const session = makeSession();
    const withMobodoroConfig = {
      ...session,
      timer: {
        ...session.timer,
        minutes: 0,
        seconds: 0,
      },
      rotationsBeforeBreak: 2,
      rotationCount: 0,
    };
    const withMobbers = addMobber(
      addMobber(withMobodoroConfig, "Alice"),
      "Bob",
    );

    const rotatedAfterSessionExpired = handleTimerExpired(withMobbers);

    expect(rotatedAfterSessionExpired.phase).toBe("work");
    expect(rotatedAfterSessionExpired.rotationCount).toBe(1);
    expect(rotatedAfterSessionExpired.currentMobberIndex).toBe(1);
    expect(rotatedAfterSessionExpired.timer.minutes).toBe(25);
    expect(rotatedAfterSessionExpired.timer.seconds).toBe(0);
  });

  it("should transition to short break after required rotations", () => {
    const session = makeSession();
    const withMobodoroConfig = {
      ...session,
      timer: {
        ...session.timer,
        minutes: 0,
        seconds: 0,
      },
      rotationsBeforeBreak: 1,
      rotationCount: 0,
    };
    const withMobbers = addMobber(
      addMobber(withMobodoroConfig, "Alice"),
      "Bob",
    );

    const afterSessionExpired = handleTimerExpired(withMobbers);

    expect(afterSessionExpired.phase).toBe("shortBreak");
    expect(afterSessionExpired.rotationCount).toBe(0);
    expect(afterSessionExpired.currentMobberIndex).toBe(0);
    expect(afterSessionExpired.timer.minutes).toBe(5);
    expect(afterSessionExpired.timer.seconds).toBe(0);
  });

  it("should return to work phase when break expires", () => {
    const session = makeSession();
    const onBreak = {
      ...session,
      phase: "shortBreak" as const,
      timer: {
        minutes: 0,
        seconds: 0,
        isRunning: false,
      },
      duration: {
        minutes: 7,
        seconds: 0,
      },
    };

    const backToWork = handleTimerExpired(onBreak);

    expect(backToWork.phase).toBe("work");
    expect(backToWork.timer.minutes).toBe(7);
    expect(backToWork.timer.seconds).toBe(0);
    expect(backToWork.timer.isRunning).toBe(false);
  });

  it("should rotate to next mobber when break expires and work resumes", () => {
    const session = makeSession();
    const withMobbers = addMobber(addMobber(session, "Alice"), "Bob");
    const onBreak = {
      ...withMobbers,
      phase: "shortBreak" as const,
      currentMobberIndex: 0,
      timer: { minutes: 0, seconds: 0, isRunning: false },
    };

    const backToWork = handleTimerExpired(onBreak);

    expect(backToWork.phase).toBe("work");
    expect(backToWork.currentMobberIndex).toBe(1);
  });

  it("should skip phase and transition immediately", () => {
    const session = makeSession();
    const withMobbers = addMobber(addMobber(session, "Alice"), "Bob");
    const configured = configureSession(withMobbers, {
      workMinutes: 10,
      breakMinutes: 3,
      rotationsBeforeBreak: 1,
    });

    // Skip work phase - should go to break
    const afterSkip = skipPhase(configured);

    expect(afterSkip.phase).toBe("shortBreak");
    expect(afterSkip.timer.minutes).toBe(3); // break duration
    expect(afterSkip.timer.seconds).toBe(0);
    expect(afterSkip.rotationCount).toBe(0);
  });

  it("should skip break phase and return to work", () => {
    const session = makeSession();
    const onBreak = {
      ...session,
      phase: "shortBreak" as const,
      timer: { minutes: 5, seconds: 30, isRunning: false },
    };

    const afterSkip = skipPhase(onBreak);

    expect(afterSkip.phase).toBe("work");
    expect(afterSkip.timer.minutes).toBe(25); // work duration
    expect(afterSkip.timer.seconds).toBe(0);
  });
});

describe("Mobber colours", () => {
  it("should assign the first palette colour to the first mobber added", () => {
    const session = makeSession();

    const withMobber = addMobber(session, "Alice");

    expect(withMobber.mobbers[0]).toEqual<Mobber>({
      name: "Alice",
      color: "#e74c3c",
    });
  });

  it("should assign the second palette colour to the second mobber added", () => {
    const session = makeSession();
    const withTwo = addMobber(addMobber(session, "Alice"), "Bob");

    expect(withTwo.mobbers[1]).toEqual<Mobber>({
      name: "Bob",
      color: "#3498db",
    });
  });

  it("should cycle back to the first colour when the palette is exhausted", () => {
    const PALETTE_SIZE = 8;
    let session = makeSession();
    for (let i = 0; i < PALETTE_SIZE; i++) {
      session = addMobber(session, `Person${i}`);
    }

    const withExtraMobber = addMobber(session, "Extra");

    expect(withExtraMobber.mobbers[PALETTE_SIZE].color).toBe("#e74c3c");
  });

  it("should free a colour slot when a mobber is removed so the next addition reuses it", () => {
    const session = makeSession();
    const withTwo = addMobber(addMobber(session, "Alice"), "Bob");
    const withoutAlice = removeMobber(withTwo, "Alice");

    const withCharlie = addMobber(withoutAlice, "Charlie");

    // Bob is the only remaining mobber (index 0) — Charlie takes next slot (index 1)
    expect(withCharlie.mobbers.find((m) => m.name === "Charlie")?.color).toBe(
      "#3498db",
    );
  });
});

describe("renameMobber", () => {
  it("should rename the matching mobber and preserve their colour", () => {
    const session = addMobber(addMobber(makeSession(), "Alice"), "Bob");
    const aliceColor = session.mobbers[0].color;

    const renamed = renameMobber(session, "Alice", "Alicia");

    expect(renamed.mobbers[0].name).toBe("Alicia");
    expect(renamed.mobbers[0].color).toBe(aliceColor);
  });

  it("should leave other mobbers unchanged", () => {
    const session = addMobber(addMobber(makeSession(), "Alice"), "Bob");

    const renamed = renameMobber(session, "Alice", "Alicia");

    expect(renamed.mobbers[1].name).toBe("Bob");
  });

  it("should do nothing if the name is not found", () => {
    const session = addMobber(makeSession(), "Alice");

    const result = renameMobber(session, "Nobody", "NewName");

    expect(result.mobbers).toEqual(session.mobbers);
  });
});
