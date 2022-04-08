import { BigInt, log } from "@graphprotocol/graph-ts";

import {
  UserPlayerTourHolding,
  UserPlayerHolding,
  Account,
} from "../../generated/schema";
import { TRADE_TYPE_BUY } from "./constants";

export function updateUserPlayerTourHoldings(
  id: string,
  questionId: string,
  userId: string,
  tradeAmount: BigInt,
  tokensTraded: BigInt,
  txnType: string,
  fpmmId: string,
  outcomeIndex: BigInt,
  factory: string
): void {
  let userPlayerTourHoldingObj = UserPlayerTourHolding.load(id);
  if (userPlayerTourHoldingObj == null) {
    let userPlayerHoldingObj = UserPlayerHolding.load(userId + "-" + fpmmId);
    if (userPlayerHoldingObj == null) {
      let userPlayerHoldingObj = new UserPlayerHolding(userId + "-" + fpmmId);
      userPlayerHoldingObj.userId = userId;
      userPlayerHoldingObj.questionId = questionId;
      userPlayerHoldingObj.playerTokens = tokensTraded;
      userPlayerHoldingObj.save();
    } else {
      userPlayerHoldingObj.playerTokens = userPlayerHoldingObj.playerTokens.plus(
        tokensTraded
      );
      userPlayerHoldingObj.save();
    }

    let newUserPlayerTourHoldingObj = new UserPlayerTourHolding(id);
    newUserPlayerTourHoldingObj.questionId = questionId;
    newUserPlayerTourHoldingObj.userId = userId;
    newUserPlayerTourHoldingObj.investmentAmount = tradeAmount;
    newUserPlayerTourHoldingObj.tokens = tokensTraded;
    newUserPlayerTourHoldingObj.userPlayerHolding = userId + "-" + fpmmId;
    newUserPlayerTourHoldingObj.fpmmId = fpmmId;
    newUserPlayerTourHoldingObj.season = factory;
    newUserPlayerTourHoldingObj.outcomeIndex = outcomeIndex;
    newUserPlayerTourHoldingObj.player = fpmmId;
    newUserPlayerTourHoldingObj.save();

    return;
  }
  if (txnType === TRADE_TYPE_BUY) {
    let userPlayerHoldingObj = UserPlayerHolding.load(userId + "-" + fpmmId);
    if (userPlayerHoldingObj != null) {
      userPlayerHoldingObj.playerTokens = userPlayerHoldingObj.playerTokens.plus(
        tokensTraded
      );
      userPlayerHoldingObj.save();
    }

    userPlayerTourHoldingObj.tokens = userPlayerTourHoldingObj.tokens.plus(
      tokensTraded
    );
    userPlayerTourHoldingObj.investmentAmount = userPlayerTourHoldingObj.investmentAmount.plus(
      tradeAmount
    );
    userPlayerTourHoldingObj.save();
    return;
  }
  if (userPlayerTourHoldingObj.tokens.minus(tokensTraded) > new BigInt(0)) {
    let userPlayerHoldingObj = UserPlayerHolding.load(userId + "-" + fpmmId);
    if (userPlayerHoldingObj != null) {
      userPlayerHoldingObj.playerTokens = userPlayerHoldingObj.playerTokens.minus(
        tokensTraded
      );
      userPlayerHoldingObj.save();
    }

    userPlayerTourHoldingObj.investmentAmount = userPlayerTourHoldingObj.investmentAmount.minus(
      tradeAmount
    );
    userPlayerTourHoldingObj.tokens = userPlayerTourHoldingObj.tokens.minus(
      tokensTraded
    );
    userPlayerTourHoldingObj.save();
    return;
  }
  log.error("Negative value found for sell transaction id : {} ", [id]);
}

export function updateInvestmentAmountOnBuy(
  id: string,
  tradeAmount: BigInt,
  feeAmount: BigInt
): void {
  let accountDetails = Account.load(id);
  if (accountDetails == null) {
    log.error("User not found with walletId {}", [id]);
    return;
  }
  let tradeAmountMinusFees = tradeAmount.minus(feeAmount);
  accountDetails.investmentAmount = accountDetails.investmentAmount.plus(
    tradeAmountMinusFees
  );
  accountDetails.save();
}

export function updateInvestmentAmountOnSell(
  id: string,
  tradeAmount: BigInt,
  feeAmount: BigInt
): void {
  let accountDetails = Account.load(id);
  if (accountDetails == null) {
    log.error("User not found with walletId {}", [id]);
    return;
  }
  let tradeAmountPlusFees = tradeAmount.plus(feeAmount);
  accountDetails.investmentAmount = accountDetails.investmentAmount.minus(
    tradeAmountPlusFees
  );
  accountDetails.save();
}
