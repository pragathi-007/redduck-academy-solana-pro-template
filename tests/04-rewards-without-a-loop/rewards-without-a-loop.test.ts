import { assert } from "chai";
import { oneToken, tokenBalance } from "../helpers";
import { PoolFixture, setupPool } from "./fixture";
import { addRewards, claim, stake, unstake } from "./actions";

describe("04-rewards-without-a-loop", () => {
  let env: PoolFixture;

  beforeEach(async () => {
    env = await setupPool();
  });

  it("splits a reward between three stakers in proportion to their stake", async () => {
    const [a, b, c] = env.stakers;
    await stake(env, a, oneToken().muln(100));
    await stake(env, b, oneToken().muln(300));
    await stake(env, c, oneToken().muln(600));

    const before = await Promise.all(
      env.stakers.map((s) => tokenBalance(env.context, s.tokens))
    );

    await addRewards(env, oneToken().muln(100));
    await claim(env, a);
    await claim(env, b);
    await claim(env, c);

    const after = await Promise.all(
      env.stakers.map((s) => tokenBalance(env.context, s.tokens))
    );

    assert.equal((after[0] - before[0]).toString(), oneToken().muln(10).toString());
    assert.equal((after[1] - before[1]).toString(), oneToken().muln(30).toString());
    assert.equal((after[2] - before[2]).toString(), oneToken().muln(60).toString());
  });

  it("handles rewards between actions, different claim orders, deposit not altering prior owed rewards, and an untouched staker claiming last", async () => {
    const [a, b, c] = env.stakers;
    await stake(env, a, oneToken().muln(200));
    await stake(env, b, oneToken().muln(200));
    await stake(env, c, oneToken().muln(100));

    const beforeA = await tokenBalance(env.context, a.tokens);
    const beforeB = await tokenBalance(env.context, b.tokens);
    const beforeC = await tokenBalance(env.context, c.tokens);

    // Reward 1: 100 across total 500 -> a=40, b=40, c=20 (c untouched)
    await addRewards(env, oneToken().muln(100));

    // a deposits 300 more (total becomes 800); must not alter the 40 owed to a before deposit
    await stake(env, a, oneToken().muln(300));

    // Reward 2: 200 across total 800 (a=500 -> 125, b=200 -> 50, c=100 -> 25; c untouched)
    await addRewards(env, oneToken().muln(200));

    // Active stakers claim in reverse order: b first, then a (c still untouched)
    await claim(env, b);
    await claim(env, a);

    // b unstakes 100 (total becomes 700), Reward 3 arrives: 140 (a=500 -> 100, b=100 -> 20, c=100 -> 20)
    await unstake(env, b, oneToken().muln(100));
    await addRewards(env, oneToken().muln(140));

    // a and b claim again; c has NEVER claimed or modified stake until this final claim
    await claim(env, a);
    await claim(env, b);
    await claim(env, c);

    const afterA = await tokenBalance(env.context, a.tokens);
    const afterB = await tokenBalance(env.context, b.tokens);
    const afterC = await tokenBalance(env.context, c.tokens);

    assert.equal((afterA - beforeA).toString(), oneToken().muln(265).toString());
    assert.equal((afterB - beforeB).toString(), oneToken().muln(210).toString());
    assert.equal((afterC - beforeC).toString(), oneToken().muln(65).toString());
  });

  it("handles zero-reward claim cleanly", async () => {
    const [a] = env.stakers;
    await stake(env, a, oneToken().muln(100));

    const before = await tokenBalance(env.context, a.tokens);
    await claim(env, a);
    const after = await tokenBalance(env.context, a.tokens);

    assert.equal((after - before).toString(), "0");
  });

  it("handles rewards added when total stake is zero without failing", async () => {
    const [a] = env.stakers;
    await addRewards(env, oneToken().muln(50));

    await stake(env, a, oneToken().muln(100));
    const before = await tokenBalance(env.context, a.tokens);
    await claim(env, a);
    const after = await tokenBalance(env.context, a.tokens);

    assert.equal((after - before).toString(), "0");
  });

  it("preserves earned rewards after full withdrawal and allows claiming afterward", async () => {
    const [a, b] = env.stakers;
    await stake(env, a, oneToken().muln(100));
    await stake(env, b, oneToken().muln(300));

    await addRewards(env, oneToken().muln(100));

    const beforeA = await tokenBalance(env.context, a.tokens);
    await unstake(env, a, oneToken().muln(100));
    const afterUnstakeA = await tokenBalance(env.context, a.tokens);
    assert.equal((afterUnstakeA - beforeA).toString(), oneToken().muln(100).toString());

    await addRewards(env, oneToken().muln(100));

    await claim(env, a);
    const afterClaimA = await tokenBalance(env.context, a.tokens);
    assert.equal((afterClaimA - beforeA).toString(), oneToken().muln(125).toString());
  });
});
