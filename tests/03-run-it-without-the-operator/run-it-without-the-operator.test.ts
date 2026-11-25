import { assert } from "chai";
import { BN } from "@coral-xyz/anchor";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

import { oneToken, toBN, tokenBalance } from "../helpers";
import { RewardsFixture, setupRewards } from "./fixture";
import { accrue, buy, claim, setPrice } from "./actions";

describe("03-run-it-without-the-operator", () => {
  let env: RewardsFixture;

  beforeEach(async () => {
    env = await setupRewards();
  });

  it("lets a stranger claim rewards for a user, takes a bounded fee, and blocks double claims", async () => {
    const reward = oneToken().muln(100);
    await accrue(env, env.user.publicKey, reward);

    // Stranger (not admin, not bot) triggers the claim on behalf of user
    await claim(
      env,
      env.stranger,
      env.user.publicKey,
      env.userTokens,
      env.strangerTokens,
    );

    // 1% of 100 tokens = 1 token, capped at MAX_CALLER_FEE = 1_000_000 base units
    const expectedFee = new BN(1_000_000);
    const expectedUserPayout = reward.sub(expectedFee);

    assert.equal(
      (await tokenBalance(env.context, env.userTokens)).toString(),
      expectedUserPayout.toString(),
    );
    assert.equal(
      (await tokenBalance(env.context, env.strangerTokens)).toString(),
      expectedFee.toString(),
    );

    // Second claim must fail because user.pending was zeroed out
    let failed = false;
    try {
      await claim(
        env,
        env.stranger,
        env.user.publicKey,
        env.userTokens,
        env.strangerTokens,
      );
    } catch {
      failed = true;
    }
    assert.isTrue(failed, "double claim should fail");
  });

  it("updates price via oracle Ed25519 signature and completes a buy without the bot", async () => {
    // Stranger submits an oracle-signed price (0.01 SOL per token) without the bot signing
    await setPrice(env, toBN(LAMPORTS_PER_SOL / 100));

    await buy(
      env,
      env.stranger,
      env.strangerTokens,
      toBN(LAMPORTS_PER_SOL / 10),
    );

    assert.equal(
      (await tokenBalance(env.context, env.strangerTokens)).toString(),
      oneToken().muln(10).toString(),
    );
  });

  it("rejects stale or wrong-oracle price updates", async () => {
    const clock = await env.context.banksClient.getClock();
    const staleTime = new BN(clock.unixTimestamp.toString()).subn(120);

    let staleFailed = false;
    try {
      await setPrice(env, toBN(LAMPORTS_PER_SOL / 100), staleTime);
    } catch {
      staleFailed = true;
    }
    assert.isTrue(staleFailed, "stale price update should fail");

    let wrongOracleFailed = false;
    try {
      await setPrice(
        env,
        toBN(LAMPORTS_PER_SOL / 100),
        undefined,
        env.stranger,
      );
    } catch {
      wrongOracleFailed = true;
    }
    assert.isTrue(wrongOracleFailed, "non-oracle signer should fail");
  });
});