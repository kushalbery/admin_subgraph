import { BigInt, log } from "@graphprotocol/graph-ts";

import {
  FixedProductMarketMaker,
  FpmmFundingAddition,
  FpmmFundingRemoval,
  Transaction,
  CreatedFPMM,
  Condition,
  Player,
  TradePrice,
  Account,
  PlayerVolume,
  PlayerVolumeByTransaction,
} from "../generated/schema";
import {
  FPMMFundingAdded,
  FPMMFundingRemoved,
  FPMMBuy,
  FPMMSell,
  Transfer,
  FPMMCreated,
  LongShortCurrentPrice,
} from "../generated/templates/FixedProductMarketMaker/FixedProductMarketMaker";
import { nthRoot } from "./utils/nth-root";
import {
  updateVolumes,
  updateLiquidityFields,
  updateFeeFields,
  calculatePrices,
  loadPoolMembership,
} from "./utils/fpmm-utils";
import {
  updateMarketPositionFromLiquidityAdded,
  updateMarketPositionFromLiquidityRemoved,
  updateMarketPositionFromTrade,
} from "./utils/market-positions-utils";
import {
  AddressZero,
  bigOne,
  bigZero,
  TRADE_TYPE_BUY,
  TRADE_TYPE_SELL,
} from "./utils/constants";
import { getCollateralScale } from "./utils/collateralTokens";
import { updateGlobalVolume } from "./utils/global-utils";
import { increment, max } from "./utils/maths";
import {
  incrementAccountTrades,
  markAccountAsSeen,
  requireAccount,
  updateUserVolume,
} from "./utils/account-utils";
import {
  updateUserPlayerTourHoldings,
  updateInvestmentAmountOnBuy,
  updateInvestmentAmountOnSell,
} from "./utils/userHoldings-util";

function recordBuy(event: FPMMBuy, netTradeAmount: BigInt): void {
  let buy = new Transaction(event.transaction.hash.toHexString());
  buy.type = TRADE_TYPE_BUY;
  buy.timestamp = event.block.timestamp;
  buy.market = event.address.toHexString();
  buy.user = event.params.buyer.toHexString();
  buy.tradeAmount = event.params.investmentAmount;
  buy.feeAmount = event.params.feeAmount;
  buy.netTradeAmount = netTradeAmount;
  buy.outcomeIndex = event.params.outcomeIndex;
  buy.outcomeTokensAmount = event.params.outcomeTokensBought;
  buy.save();
}

function recordSell(event: FPMMSell, netTradeAmount: BigInt): void {
  let sell = new Transaction(event.transaction.hash.toHexString());
  sell.type = TRADE_TYPE_SELL;
  sell.timestamp = event.block.timestamp;
  sell.market = event.address.toHexString();
  sell.user = event.params.seller.toHexString();
  sell.tradeAmount = event.params.returnAmount;
  sell.feeAmount = event.params.feeAmount;
  sell.netTradeAmount = netTradeAmount;
  sell.outcomeIndex = event.params.outcomeIndex;
  sell.outcomeTokensAmount = event.params.outcomeTokensSold;
  sell.save();
}

function recordFundingAddition(event: FPMMFundingAdded): void {
  let fpmmFundingAdded = new FpmmFundingAddition(
    event.transaction.hash.toHexString()
  );
  fpmmFundingAdded.timestamp = event.block.timestamp;
  fpmmFundingAdded.fpmm = event.address.toHexString();
  fpmmFundingAdded.funder = event.params.funder.toHexString();
  let amountsAdded = event.params.amountsAdded;
  fpmmFundingAdded.amountsAdded = amountsAdded;

  // The amounts of outcome token are limited by the cheapest outcome.
  // This will have the full balance added to the market maker
  // therefore this is the amount of collateral that the user has split.
  let addedFunds = max(amountsAdded);

  let amountsRefunded = new Array<BigInt>(amountsAdded.length);
  for (
    let outcomeIndex = 0;
    outcomeIndex < amountsAdded.length;
    outcomeIndex += 1
  ) {
    // Event emits the number of outcome tokens added to the market maker
    // Subtract this from the amount of collateral added to get the amount refunded to funder
    amountsRefunded[outcomeIndex] = addedFunds.minus(
      amountsAdded[outcomeIndex]
    );
  }
  fpmmFundingAdded.amountsRefunded = amountsRefunded;
  fpmmFundingAdded.sharesMinted = event.params.sharesMinted;
  fpmmFundingAdded.save();
}

function recordFundingRemoval(event: FPMMFundingRemoved): void {
  let fpmmFundingRemoved = new FpmmFundingRemoval(
    event.transaction.hash.toHexString()
  );
  fpmmFundingRemoved.timestamp = event.block.timestamp;
  fpmmFundingRemoved.fpmm = event.address.toHexString();
  fpmmFundingRemoved.funder = event.params.funder.toHexString();
  fpmmFundingRemoved.amountsRemoved = event.params.amountsRemoved;
  fpmmFundingRemoved.collateralRemoved =
    event.params.collateralRemovedFromFeePool;
  fpmmFundingRemoved.sharesBurnt = event.params.sharesBurnt;
  fpmmFundingRemoved.save();
}

export function handleFundingAdded(event: FPMMFundingAdded): void {
  let fpmmAddress = event.address.toHexString();
  let fpmm = FixedProductMarketMaker.load(fpmmAddress);
  if (fpmm == null) {
    log.error(
      "cannot add funding: FixedProductMarketMaker instance for {} not found",
      [fpmmAddress]
    );
    return;
  }

  let oldAmounts = fpmm.outcomeTokenAmounts;
  let amountsAdded = event.params.amountsAdded;
  let newAmounts = new Array<BigInt>(oldAmounts.length);
  let amountsProduct = bigOne;
  for (let i = 0; i < newAmounts.length; i += 1) {
    newAmounts[i] = oldAmounts[i].plus(amountsAdded[i]);
    amountsProduct = amountsProduct.times(newAmounts[i]);
  }
  fpmm.outcomeTokenAmounts = newAmounts;
  let liquidityParameter = nthRoot(amountsProduct, newAmounts.length);
  let collateralScale = getCollateralScale(fpmm.collateralToken);
  updateLiquidityFields(
    fpmm as FixedProductMarketMaker,
    liquidityParameter,
    collateralScale.toBigDecimal()
  );

  fpmm.totalSupply = fpmm.totalSupply.plus(event.params.sharesMinted);
  if (fpmm.totalSupply.equals(event.params.sharesMinted)) {
    // The market maker previously had zero liquidity
    // We then need to update with the initial prices.
    fpmm.outcomeTokenPrices = calculatePrices(newAmounts);
  }

  fpmm.liquidityAddQuantity = increment(fpmm.liquidityAddQuantity);
  fpmm.save();
  markAccountAsSeen(event.params.funder.toHexString(), event.block.timestamp);
  recordFundingAddition(event);
  updateMarketPositionFromLiquidityAdded(event);
}

export function handleFundingRemoved(event: FPMMFundingRemoved): void {
  let fpmmAddress = event.address.toHexString();
  let fpmm = FixedProductMarketMaker.load(fpmmAddress);
  if (fpmm == null) {
    log.error(
      "cannot remove funding: FixedProductMarketMaker instance for {} not found",
      [fpmmAddress]
    );
    return;
  }

  let oldAmounts = fpmm.outcomeTokenAmounts;
  let amountsRemoved = event.params.amountsRemoved;
  let newAmounts = new Array<BigInt>(oldAmounts.length);
  let amountsProduct = bigOne;
  for (let i = 0; i < newAmounts.length; i += 1) {
    newAmounts[i] = oldAmounts[i].minus(amountsRemoved[i]);
    amountsProduct = amountsProduct.times(newAmounts[i]);
  }
  fpmm.outcomeTokenAmounts = newAmounts;

  let liquidityParameter = nthRoot(amountsProduct, newAmounts.length);
  let collateralScale = getCollateralScale(fpmm.collateralToken);
  updateLiquidityFields(
    fpmm as FixedProductMarketMaker,
    liquidityParameter,
    collateralScale.toBigDecimal()
  );

  fpmm.totalSupply = fpmm.totalSupply.minus(event.params.sharesBurnt);
  if (fpmm.totalSupply.equals(bigZero)) {
    // All liquidity has been removed and so prices need to be zeroed out.
    fpmm.outcomeTokenPrices = calculatePrices(newAmounts);
  }

  fpmm.liquidityRemoveQuantity = increment(fpmm.liquidityRemoveQuantity);
  fpmm.save();
  markAccountAsSeen(event.params.funder.toHexString(), event.block.timestamp);
  recordFundingRemoval(event);
  updateMarketPositionFromLiquidityRemoved(event);
}

export function handleBuy(event: FPMMBuy): void {
  let fpmmAddress = event.address.toHexString();
  let fpmm = FixedProductMarketMaker.load(fpmmAddress);
  if (fpmm == null) {
    log.error("cannot buy: FixedProductMarketMaker instance for {} not found", [
      fpmmAddress,
    ]);
    return;
  }

  let oldAmounts = fpmm.outcomeTokenAmounts;
  let investmentAmountMinusFees = event.params.netInvestmentAmount;

  let outcomeIndex = event.params.outcomeIndex.toI32();

  let newAmounts = new Array<BigInt>(oldAmounts.length);
  let amountsProduct = bigOne;
  for (let i = 0; i < newAmounts.length; i += 1) {
    if (i == outcomeIndex) {
      newAmounts[i] = oldAmounts[i]
        .plus(investmentAmountMinusFees)
        .minus(event.params.outcomeTokensBought);
    } else {
      newAmounts[i] = oldAmounts[i].plus(investmentAmountMinusFees);
    }
    amountsProduct = amountsProduct.times(newAmounts[i]);
  }
  fpmm.outcomeTokenAmounts = newAmounts;
  fpmm.outcomeTokenPrices = calculatePrices(newAmounts);
  let liquidityParameter = nthRoot(amountsProduct, newAmounts.length);
  let collateralScale = getCollateralScale(fpmm.collateralToken);
  let collateralScaleDec = collateralScale.toBigDecimal();
  updateLiquidityFields(
    fpmm as FixedProductMarketMaker,
    liquidityParameter,
    collateralScaleDec
  );

  updateVolumes(
    fpmm as FixedProductMarketMaker,
    event.block.timestamp,
    event.params.investmentAmount,
    collateralScaleDec,
    TRADE_TYPE_BUY
  );
  updateFeeFields(
    fpmm as FixedProductMarketMaker,
    event.params.feeAmount,
    collateralScaleDec
  );

  fpmm.tradesQuantity = increment(fpmm.tradesQuantity);
  fpmm.buysQuantity = increment(fpmm.buysQuantity);
  fpmm.save();

  updateUserVolume(
    event.params.buyer.toHexString(),
    event.params.investmentAmount,
    collateralScaleDec,
    event.block.timestamp
  );
  updatePlayerVolume(
    event.block.timestamp,
    event.params.questionId.toHexString(),
    event.params.totalTradeVolume,
    event.transaction.hash.toHexString()
  );
  markAccountAsSeen(event.params.buyer.toHexString(), event.block.timestamp);
  incrementAccountTrades(
    event.params.buyer.toHexString(),
    event.block.timestamp
  );
  recordBuy(event, investmentAmountMinusFees);
  let pnlId = event.params.buyer
    .toHexString()
    .concat("-")
    .concat(event.address.toHexString())
    .concat("-")
    .concat(event.params.outcomeIndex.toString());

  updateUserPlayerTourHoldings(
    pnlId,
    event.params.questionId.toHexString(),
    event.params.buyer.toHexString(),
    investmentAmountMinusFees,
    event.params.outcomeTokensBought,
    TRADE_TYPE_BUY,
    event.address.toHexString(),
    event.params.outcomeIndex
  );
  updateInvestmentAmountOnBuy(
    event.params.buyer.toHexString(),
    event.params.investmentAmount,
    event.params.feeAmount
  );
  updateGlobalVolume(
    event.params.investmentAmount,
    event.params.feeAmount,
    collateralScaleDec,
    TRADE_TYPE_BUY
  );
  updateMarketPositionFromTrade(event);
}

export function handleSell(event: FPMMSell): void {
  let fpmmAddress = event.address.toHexString();
  let fpmm = FixedProductMarketMaker.load(fpmmAddress);
  if (fpmm == null) {
    log.error(
      "cannot sell: FixedProductMarketMaker instance for {} not found",
      [fpmmAddress]
    );
    return;
  }

  let oldAmounts = fpmm.outcomeTokenAmounts;
  let returnAmountPlusFees = event.params.netReturnAmount;

  let outcomeIndex = event.params.outcomeIndex.toI32();
  let newAmounts = new Array<BigInt>(oldAmounts.length);
  let amountsProduct = bigOne;
  for (let i = 0; i < newAmounts.length; i += 1) {
    if (i == outcomeIndex) {
      newAmounts[i] = oldAmounts[i]
        .minus(returnAmountPlusFees)
        .plus(event.params.outcomeTokensSold);
    } else {
      newAmounts[i] = oldAmounts[i].minus(returnAmountPlusFees);
    }
    amountsProduct = amountsProduct.times(newAmounts[i]);
  }
  fpmm.outcomeTokenAmounts = newAmounts;
  fpmm.outcomeTokenPrices = calculatePrices(newAmounts);
  let liquidityParameter = nthRoot(amountsProduct, newAmounts.length);
  let collateralScale = getCollateralScale(fpmm.collateralToken);
  let collateralScaleDec = collateralScale.toBigDecimal();
  updateLiquidityFields(
    fpmm as FixedProductMarketMaker,
    liquidityParameter,
    collateralScaleDec
  );

  updateVolumes(
    fpmm as FixedProductMarketMaker,
    event.block.timestamp,
    event.params.returnAmount,
    collateralScaleDec,
    TRADE_TYPE_SELL
  );
  updateFeeFields(
    fpmm as FixedProductMarketMaker,
    event.params.feeAmount,
    collateralScaleDec
  );

  fpmm.tradesQuantity = increment(fpmm.tradesQuantity);
  fpmm.sellsQuantity = increment(fpmm.sellsQuantity);
  fpmm.save();

  updateUserVolume(
    event.params.seller.toHexString(),
    event.params.returnAmount,
    collateralScaleDec,
    event.block.timestamp
  );
  updatePlayerVolume(
    event.block.timestamp,
    event.params.questionId.toHexString(),
    event.params.totalTradeVolume,
    event.transaction.hash.toHexString()
  );
  markAccountAsSeen(event.params.seller.toHexString(), event.block.timestamp);
  incrementAccountTrades(
    event.params.seller.toHexString(),
    event.block.timestamp
  );
  recordSell(event, returnAmountPlusFees);
  let pnlId = event.params.seller
    .toHexString()
    .concat("-")
    .concat(event.address.toHexString())
    .concat("-")
    .concat(event.params.outcomeIndex.toString());
  updateInvestmentAmountOnSell(
    event.params.seller.toHexString(),
    event.params.returnAmount,
    event.params.feeAmount
  );
  updateUserPlayerTourHoldings(
    pnlId,
    event.params.questionId.toHexString(),
    event.params.seller.toHexString(),
    returnAmountPlusFees,
    event.params.outcomeTokensSold,
    TRADE_TYPE_SELL,
    event.address.toHexString(),
    event.params.outcomeIndex
  );
  updateGlobalVolume(
    event.params.returnAmount,
    event.params.feeAmount,
    collateralScaleDec,
    TRADE_TYPE_SELL
  );
  updateMarketPositionFromTrade(event);
}

export function handlePoolShareTransfer(event: Transfer): void {
  let fpmmAddress = event.address.toHexString();
  let fromAddress = event.params.from.toHexString();
  let toAddress = event.params.to.toHexString();
  let sharesAmount = event.params.value;

  requireAccount(fromAddress, event.block.timestamp);
  requireAccount(toAddress, event.block.timestamp);

  if (fromAddress != AddressZero) {
    let fromMembership = loadPoolMembership(fpmmAddress, fromAddress);
    fromMembership.amount = fromMembership.amount.minus(sharesAmount);
    fromMembership.save();
  }

  if (toAddress != AddressZero) {
    let toMembership = loadPoolMembership(fpmmAddress, toAddress);
    toMembership.amount = toMembership.amount.plus(sharesAmount);
    toMembership.save();
  }
}

export function handleFPMMCreated(event: FPMMCreated): void {
  log.info("Reached FPMM", []);
  let address = event.address;
  let addressHexString = address.toHexString();
  let entity = CreatedFPMM.load(address.toHex());
  log.info("$$$$$$$$$$$$$$$$$$addressHexString$$$$$$$$$$$$$$ {}", [
    addressHexString,
  ]);

  // Entities only exist after they have been saved to the store;
  // `null` checks allow to create entities on demand
  log.info("checking if statement FPMM", []);
  if (!entity) {
    entity = new CreatedFPMM(event.address.toHex());
    log.info("Inside if condition FPMM", []);
  }

  let conditionIds = event.params.conditionIds;
  let outcomeTokenCount = 1;

  let conditionIdStr = conditionIds.toHexString();

  let condition = Condition.load(conditionIdStr);
  if (condition == null) {
    log.error("failed to create market maker {}: condition {} not prepared", [
      addressHexString,
      conditionIdStr,
    ]);
    return;
  }

  outcomeTokenCount *= condition.outcomeSlotCount;
  condition.fixedProductMarketMakers = condition.fixedProductMarketMakers.concat(
    [addressHexString]
  );
  condition.save();

  // Entity fields can be set based on event parameters
  entity.creator = event.params.creator;
  entity.tokenName = event.params.tokenName;
  entity.tokenSymbol = event.params.tokenSymbol;

  // Entities can be written to the store with `.save()`
  log.info("About to save FPMM", []);
  entity.save();
}

export function handleCurrentPrice(event: LongShortCurrentPrice): void {
  let data = event.params.timestamp.toString();
  let fpmmAddress = event.address.toHexString();
  let fpmm = FixedProductMarketMaker.load(fpmmAddress);
  if (fpmm == null) {
    log.error(
      "cannot update current price: FixedProductMarketMaker instance for {} not found",
      [fpmmAddress]
    );
    return;
  }

  let playerAddress = event.address.toHexString();
  let player = Player.load(playerAddress);
  if (player == null) {
    log.info("Creating new player", []);
    player = new Player(playerAddress);
  }
  player.currentLongTokenPrice = event.params.currentlongprice;
  player.currentShortTokenPrice = event.params.currentshortprice;
  player.timestamp = event.params.timestamp;
  player.questionId = event.params.questionId;
  player.save();

  let tradePrice = new TradePrice(event.transaction.hash.toHexString());
  tradePrice.longTokenPrice = event.params.currentlongprice;
  tradePrice.shortTokenPrice = event.params.currentshortprice;
  tradePrice.timestamp = event.params.timestamp;
  tradePrice.questionId = event.params.questionId;
  tradePrice.fpmm = event.address.toHexString();
  tradePrice.player = event.address.toHexString();
  tradePrice.save();
}
