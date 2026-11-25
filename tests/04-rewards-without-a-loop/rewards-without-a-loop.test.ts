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

  it("handles rewards between actions, different claim orders, deposit not altering prior owed rewards, and late claimer", async () => {
    const [a, b, c] = env.stakers;
    await stake(env, a, oneToken().muln(200));
    await stake(env, b, oneToken().muln(200));

    const beforeA = await tokenBalance(env.context, a.tokens);
    const beforeB = await tokenBalance(env.context, b.tokens);
    const beforeC = await tokenBalance(env.context, c.tokens);

    await addRewards(env, oneToken().muln(100));
    await stake(env, a, oneToken().muln(400));
    await addRewards(env, oneToken().muln(200));

    await claim(env, b);
    await claim(env, a);

    await stake(env, c, oneToken().muln(200));
    await addRewards(env, oneToken().muln(100));

    await claim(env, c);
    await claim(env, a);
    await claim(env, b);

    const afterA = await tokenBalance(env.context, a.tokens);
    const afterB = await tokenBalance(env.context, b.tokens);
    const afterC = await tokenBalance(env.context, c.tokens);

    assert.equal((afterA - beforeA).toString(), oneToken().muln(260).toString());
    assert.equal((afterB - beforeB).toString(), oneToken().muln(120).toString());
    assert.equal((afterC - beforeC).toString(), oneToken().muln(20).toString());
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
