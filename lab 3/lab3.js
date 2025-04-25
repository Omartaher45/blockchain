"use strict";

// required npm install blind-signatures
const blindSignatures = require("blind-signatures");

const { Coin, COIN_RIS_LENGTH, IDENT_STR, BANK_STR } = require("./coin.js");
const utils = require("./utils.js");

// Details about the bank's key.
const BANK_KEY = blindSignatures.keyGeneration({ b: 2048 });
const N = BANK_KEY.keyPair.n.toString();
const E = BANK_KEY.keyPair.e.toString();

/**
 * Function signing the coin on behalf of the bank.
 * 
 * @param blindedCoinHash - the blinded hash of the coin.
 * 
 * @returns the signature of the bank for this coin.
 */
function signCoin(blindedCoinHash) {
  return blindSignatures.sign({
    blinded: blindedCoinHash,
    key: BANK_KEY,
  });
}

/**
 * Parses a string representing a coin, and returns the left/right identity string hashes.
 *
 * @param {string} s - string representation of a coin.
 * 
 * @returns {[[string]]} - two arrays of strings of hashes, commiting the owner's identity.
 */
function parseCoin(s) {
  let [cnst, amt, guid, leftHashes, rightHashes] = s.split("-");
  if (cnst !== BANK_STR) {
    throw new Error(Invalid identity string: ${cnst} received, but ${BANK_STR} expected);
  }
  let lh = leftHashes.split(",");
  let rh = rightHashes.split(",");
  return [lh, rh];
}

/**
 * Procedure for a merchant accepting a token. The merchant randomly selects
 * the left or right halves of the identity string.
 * 
 * @param {Coin} coin - the coin that a purchaser wants to use.
 * 
 * @returns {[String]} - an array of strings, each holding half of the user's identity.
 */
function acceptCoin(coin) {
  // 1) Verify that the signature is valid.
  const verified = blindSignatures.verify({
    unblinded: coin.signature,
    message: coin.hashed,
    key: {
      n: BigInt(coin.n),
      e: BigInt(coin.e),
    },
  });

  if (!verified) {
    throw new Error("Invalid coin signature.");
  }

  // 2) Gather the elements of the RIS, verifying the hashes.
  const [leftHashes, rightHashes] = parseCoin(coin.toString());

  // Randomly choose left or right identity strings
  const useLeft = Math.random() < 0.5;
  const selectedHalf = useLeft ? coin.identityLeft : coin.identityRight;
  const selectedHashes = useLeft ? leftHashes : rightHashes;

  // Verify that the selected RIS matches the expected hashes
  for (let i = 0; i < selectedHalf.length; i++) {
    const hashCheck = utils.hash(selectedHalf[i]);
    if (hashCheck !== selectedHashes[i]) {
      throw new Error(RIS hash mismatch at index ${i});
    }
  }

  // 3) Return the RIS
  return selectedHalf;
}

/**
 * If a token has been double-spent, determine who is the cheater
 * and print the result to the screen.
 * 
 * If the coin purchaser double-spent their coin, their anonymity
 * will be broken, and their identity will be revealed.
 * 
 * @param guid - Globally unique identifier for coin.
 * @param ris1 - Identity string reported by first merchant.
 * @param ris2 - Identity string reported by second merchant.
 */
function determineCheater(guid, ris1, ris2) {
  if (ris1.length !== ris2.length) {
    throw new Error("RIS arrays length mismatch");
  }

  for (let i = 0; i < ris1.length; i++) {
    if (ris1[i] !== ris2[i]) {
      const xorResult = utils.xorStrings(ris1[i], ris2[i]);

      if (xorResult.startsWith(IDENT_STR)) {
        const userId = xorResult.slice(IDENT_STR.length);
        console.log(Double spending detected for coin ${guid}. Cheater ID: ${userId});
        return;
      } else {
        console.log(Merchant appears to be cheating for coin ${guid});
        return;
      }
    }
  }

  console.log(RIS values are identical for coin ${guid} — Merchant is the cheater.);
}

// Create a coin by Alice
let coin = new Coin("alice", 20, N, E);

// Sign the blinded hash of the coin
coin.signature = signCoin(coin.blinded);

// Unblind the coin to get the valid signature
coin.unblind();

// Merchant 1 accepts the coin.
let ris1 = acceptCoin(coin);

// Merchant 2 accepts the same coin (double spending).
let ris2 = acceptCoin(coin);

// The bank realizes there is an issue and detects the cheater.
determineCheater(coin.guid, ris1, ris2);

console.log();

// Test with same RIS to simulate merchant cheating
determineCheater(coin.guid, ris1, ris1);