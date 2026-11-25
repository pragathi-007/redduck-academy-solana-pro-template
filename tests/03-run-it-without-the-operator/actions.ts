import { BN } from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  Ed25519Program,
  Keypair,
  PublicKey,
  SYSVAR_INSTRUCTIONS_PUBKEY,
} from "@solana/web3.js";

import { sendIxs } from "../helpers";
import { RewardsFixture } from "./fixture";

export const accrue = async (
  env: RewardsFixture,
  owner: PublicKey,
  amount: BN,
) => {
  const ix = await env.program.methods
    .accrue(amount)
    .accountsPartial({ admin: env.payer.publicKey, owner })
    .instruction();
  await sendIxs(env.context, [env.payer], ix);
};

export const claim = async (
  env: RewardsFixture,
  caller: Keypair,
  owner: PublicKey,
  ownerTokens: PublicKey,
  callerTokens: PublicKey,
) => {
  const ix = await env.program.methods
    .claim()
    .accountsPartial({
      caller: caller.publicKey,
      user: env.userAccount(owner),
      mint: env.mint,
      userTokens: ownerTokens,
      callerTokens,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction();
  await sendIxs(env.context, [caller], ix);
};

export const setPrice = async (
  env: RewardsFixture,
  price: BN,
  publishTime?: BN,
  oracleSigner: Keypair = env.oracle,
  submitter: Keypair = env.stranger,
) => {
  const clock = await env.context.banksClient.getClock();
  const timestamp = publishTime ?? new BN(clock.unixTimestamp.toString());

  const message = Buffer.alloc(16);
  price.toArrayLike(Buffer, "le", 8).copy(message, 0);
  timestamp.toArrayLike(Buffer, "le", 8).copy(message, 8);

  const ed25519Ix = Ed25519Program.createInstructionWithPrivateKey({
    privateKey: oracleSigner.secretKey,
    message,
  });

  const setPriceIx = await env.program.methods
    .setPrice()
    .accountsPartial({
      instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
    })
    .instruction();

  await sendIxs(env.context, [submitter], ed25519Ix, setPriceIx);
};

export const buy = async (
  env: RewardsFixture,
  buyer: Keypair,
  buyerTokens: PublicKey,
  lamports: BN,
) => {
  const ix = await env.program.methods
    .buy(lamports)
    .accountsPartial({
      buyer: buyer.publicKey,
      mint: env.mint,
      buyerTokens,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction();
  await sendIxs(env.context, [buyer], ix);
};