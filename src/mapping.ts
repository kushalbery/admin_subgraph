import { BigInt } from "@graphprotocol/graph-ts"
import {
  FPMM,
  Approval,
  FPMMBuy,
  FPMMCreated,
  FPMMFundingAdded,
  FPMMFundingRemoved,
  FPMMSell,
  Transfer
} from "../generated/FPMM/FPMM"
import { ExampleEntity, CreatedFPMM } from "../generated/schema"

export function handleApproval(event: Approval): void {
  // Entities can be loaded from the store using a string ID; this ID
  // needs to be unique across all entities of the same type
  let entity = ExampleEntity.load(event.transaction.from.toHex())

  // Entities only exist after they have been saved to the store;
  // `null` checks allow to create entities on demand
  if (!entity) {
    entity = new ExampleEntity(event.transaction.from.toHex())

    // Entity fields can be set using simple assignments
    entity.count = BigInt.fromI32(0)
  }

  // BigInt and BigDecimal math are supported
  entity.count = entity.count + BigInt.fromI32(1)

  // Entity fields can be set based on event parameters
  entity.owner = event.params.owner
  entity.spender = event.params.spender

  // Entities can be written to the store with `.save()`
  entity.save()

  // Note: If a handler doesn't require existing field values, it is faster
  // _not_ to load the entity from the store. Instead, create it fresh with
  // `new Entity(...)`, set the fields that should be updated and save the
  // entity back to the store. Fields that were not set or unset remain
  // unchanged, allowing for partial updates to be applied.

  // It is also possible to access smart contracts from mappings. For
  // example, the contract that has emitted the event can be connected to
  // with:
  //
  // let contract = Contract.bind(event.address)
  //
  // The following functions can then be called on this contract to access
  // state variables and other data:
  //
  // - contract.allowance(...)
  // - contract.approve(...)
  // - contract.balanceOf(...)
  // - contract.calcBuyAmount(...)
  // - contract.calcSellAmount(...)
  // - contract.collectedFees(...)
  // - contract.decimals(...)
  // - contract.decreaseAllowance(...)
  // - contract.feesWithdrawableBy(...)
  // - contract.generateBasicPartition(...)
  // - contract.getFee(...)
  // - contract.getPoolBalances(...)
  // - contract.getPositionIds(...)
  // - contract.getPrices(...)
  // - contract.increaseAllowance(...)
  // - contract.isOwner(...)
  // - contract.name(...)
  // - contract.onERC1155BatchReceived(...)
  // - contract.onERC1155Received(...)
  // - contract.supportsInterface(...)
  // - contract.symbol(...)
  // - contract.totalSupply(...)
  // - contract.transfer(...)
  // - contract.transferFrom(...)
}

export function handleFPMMBuy(event: FPMMBuy): void {}

export function handleFPMMCreated(event: FPMMCreated): void {
  let entity = CreatedFPMM.load(event.transaction.from.toHex())

  // Entities only exist after they have been saved to the store;
  // `null` checks allow to create entities on demand
  if (!entity) {
    entity = new CreatedFPMM(event.transaction.from.toHex())
  }

  // Entity fields can be set based on event parameters
  entity.creator = event.params.creator
  entity.tokenName = event.params.tokenName
  entity.tokenSymbol = event.params.tokenSymbol

  // Entities can be written to the store with `.save()`
  entity.save()
}

export function handleFPMMFundingAdded(event: FPMMFundingAdded): void {}

export function handleFPMMFundingRemoved(event: FPMMFundingRemoved): void {}

export function handleFPMMSell(event: FPMMSell): void {}

export function handleTransfer(event: Transfer): void {}
