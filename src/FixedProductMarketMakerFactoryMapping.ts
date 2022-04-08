import { BigInt, log, BigDecimal } from '@graphprotocol/graph-ts';

import { FixedProductMarketMakerCreation } from '../generated/FixedProductMarketMakerFactory/FixedProductMarketMakerFactory';
import { FixedProductMarketMaker, Condition, Season } from '../generated/schema';
import { FixedProductMarketMaker as FixedProductMarketMakerTemplate } from '../generated/templates';
import { timestampToDay } from './utils/time';
import { bigZero } from './utils/constants';
import { getCollateralDetails } from './utils/collateralTokens';

/**
 * Initialise all variables of fpmm which start at zero
 * @param fpmm A half initialised FixedProductMarketMaker
 * @returns FixedProductMarketMaker with remaining variables set
 */
function initialiseFPMM(
  fpmm: FixedProductMarketMaker,
  event: FixedProductMarketMakerCreation,
): FixedProductMarketMaker {
  /* eslint-disable no-param-reassign */

  fpmm.totalSupply = bigZero;
  let outcomeTokenAmounts = new Array<BigInt>(fpmm.outcomeSlotCount);
  let outcomeTokenPrices = new Array<BigDecimal>(fpmm.outcomeSlotCount);
  for (let i = 0; i < outcomeTokenAmounts.length; i += 1) {
    outcomeTokenAmounts[i] = bigZero;
    outcomeTokenPrices[i] = bigZero.toBigDecimal();
  }
  fpmm.outcomeTokenAmounts = outcomeTokenAmounts;
  // Market maker starts with no tokens so results in zero prices
  fpmm.outcomeTokenPrices = outcomeTokenPrices;

  fpmm.lastActiveDay = timestampToDay(event.block.timestamp);
  fpmm.collateralVolume = bigZero;
  fpmm.scaledCollateralVolume = bigZero.toBigDecimal();
  fpmm.collateralBuyVolume = bigZero;
  fpmm.scaledCollateralBuyVolume = bigZero.toBigDecimal();
  fpmm.collateralSellVolume = bigZero;
  fpmm.scaledCollateralSellVolume = bigZero.toBigDecimal();
  fpmm.liquidityParameter = bigZero;
  fpmm.scaledLiquidityParameter = bigZero.toBigDecimal();
  fpmm.feeVolume = bigZero;
  fpmm.scaledFeeVolume = bigZero.toBigDecimal();

  fpmm.tradesQuantity = bigZero;
  fpmm.buysQuantity = bigZero;
  fpmm.sellsQuantity = bigZero;
  fpmm.liquidityAddQuantity = bigZero;
  fpmm.liquidityRemoveQuantity = bigZero;

  return fpmm;
}

export function handleFixedProductMarketMakerCreation(
  event: FixedProductMarketMakerCreation,
): void {
  let address = event.params.newFactory;
  let addressHexString = address.toHexString();
  let conditionalTokensAddress = event.params.conditionalTokens.toHexString();

  // if (
  //   conditionalTokensAddress !=
  //   '0x8948f754273C75a25e100E42EA4B639472B02CE4'
  // ) {
  //   log.info('cannot index market maker {}: using conditional tokens {}', [
  //     addressHexString,
  //     conditionalTokensAddress,
  //   ]);
  //   return;
  // }


  log.info('FPMM {}: conditional tokens {}', [addressHexString, conditionalTokensAddress]);

  let fixedProductMarketMaker = new FixedProductMarketMaker(addressHexString);

  fixedProductMarketMaker.creator = event.params.creator;
  fixedProductMarketMaker.creationTimestamp = event.block.timestamp;
  fixedProductMarketMaker.creationTransactionHash = event.transaction.hash;

  getCollateralDetails(event.params.collateralToken);
  fixedProductMarketMaker.collateralToken = event.params.collateralToken.toHexString();
  fixedProductMarketMaker.fee = event.params.fee;

  fixedProductMarketMaker.outcomeSlotCount = 2;

  fixedProductMarketMaker = initialiseFPMM(fixedProductMarketMaker, event);
  fixedProductMarketMaker.season = event.address.toHexString();
  fixedProductMarketMaker.save();

  let season = Season.load(event.address.toHexString());
  if (season == null) {
    log.info(
      "Creating a brand new season: {}" ,
      [event.address.toHexString()]
    );
    season = new Season(event.address.toHexString());
    season.save();
  }

  FixedProductMarketMakerTemplate.create(address);
}
