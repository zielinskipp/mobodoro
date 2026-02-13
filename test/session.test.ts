import { describe, it, expect, createExpect } from "vitest";
import {
  makeSession,
  tick,
  startTimer,
  pauseTimer,
  resetTimer,
  addMobber,
  removeMobber,
  rotateMobber,
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

  it("should reset the timer to initial state", () => {
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
});

describe("Mob management", () => {
  it("should add a mobber to the session", () => {
    const session = makeSession();

    const withMobber = addMobber(session, "Alice");

    expect(withMobber.mobbers).toEqual(["Alice"]);
  });

  it("should remove a mobber from the session", () => {
    const session = makeSession();
    const withMobbers = addMobber(addMobber(session, "Alice"), "Bob");

    const withoutAlice = removeMobber(withMobbers, "Alice");

    expect(withoutAlice.mobbers).toEqual(["Bob"]);
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
