import { assert } from "chai";
import { BN } from "@coral-xyz/anchor";
import {
  Ed25519Program,
  LAMPORTS_PER_SOL,
  SYSVAR_INSTRUCTIONS_PUBKEY,
} from "@solana/web3.js";

import { oneToken, sendIxs, toBN, tokenBalance } from "../helpers";
import { RewardsFixture, setupRewards } from "./fixture";
import { accrue, buy, claim } from "./actions";

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

  it("constructs and verifies an oracle-signed price update and completes a buy without the operator", async () => {
    const price = toBN(LAMPORTS_PER_SOL / 100); // 0.01 SOL per whole token
    const clock = await env.context.banksClient.getClock();
    const publishTime = new BN(clock.unixTimestamp.toString());

    // Build the 16-byte oracle payload (price: u64 LE || publish_time: i64 LE)
    const message = Buffer.alloc(16);
    price.toArrayLike(Buffer, "le", 8).copy(message, 0);
    publishTime.toArrayLike(Buffer, "le", 8).copy(message, 8);

    // Sign with the off-chain oracle keypair via the Ed25519 native program
    const ed25519Ix = Ed25519Program.createInstructionWithPrivateKey({
      privateKey: env.oracle.secretKey,
      message,
    });

    const setPriceIx = await env.program.methods
      .setPrice()
      .accountsPartial({
        instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
      })
      .instruction();

    // Stranger submits both instructions without any bot/operator signature
    await sendIxs(env.context, [env.stranger], ed25519Ix, setPriceIx);

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

  it("rejects stale or wrong-oracle signed price updates", async () => {
    const price = toBN(LAMPORTS_PER_SOL / 100);
    const clock = await env.context.banksClient.getClock();
    const staleTime = new BN(clock.unixTimestamp.toString()).subn(120);

    const staleMessage = Buffer.alloc(16);
    price.toArrayLike(Buffer, "le", 8).copy(staleMessage, 0);
    staleTime.toArrayLike(Buffer, "le", 8).copy(staleMessage, 8);

    const staleEd25519Ix = Ed25519Program.createInstructionWithPrivateKey({
      privateKey: env.oracle.secretKey,
      message: staleMessage,
    });
    const staleSetPriceIx = await env.program.methods
      .setPrice()
      .accountsPartial({
        instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
      })
      .instruction();

    let staleFailed = false;
    try {
      await sendIxs(
        env.context,
        [env.stranger],
        staleEd25519Ix,
        staleSetPriceIx,
      );
    } catch {
      staleFailed = true;
    }
    assert.isTrue(staleFailed, "stale signed price update should fail");

    const freshTime = new BN(clock.unixTimestamp.toString());
    const validMessage = Buffer.alloc(16);
    price.toArrayLike(Buffer, "le", 8).copy(validMessage, 0);
    freshTime.toArrayLike(Buffer, "le", 8).copy(validMessage, 8);

    const wrongOracleIx = Ed25519Program.createInstructionWithPrivateKey({
      privateKey: env.stranger.secretKey,
      message: validMessage,
    });
    const wrongOracleSetPriceIx = await env.program.methods
      .setPrice()
      .accountsPartial({
        instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
      })
      .instruction();

    let wrongOracleFailed = false;
    try {
      await sendIxs(
        env.context,
        [env.stranger],
        wrongOracleIx,
        wrongOracleSetPriceIx,
      );
    } catch {
      wrongOracleFailed = true;
    }
    assert.isTrue(wrongOracleFailed, "non-oracle signer should fail");
  });
});
