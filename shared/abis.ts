import { parseAbi } from "viem";

export const aavePoolAbi = parseAbi([
  "function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)",
  "function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf)",
  "function repay(address asset, uint256 amount, uint256 interestRateMode, address onBehalfOf) returns (uint256)",
  "function withdraw(address asset, uint256 amount, address to) returns (uint256)",
  "function getReservesList() view returns (address[])",
  "function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)",
  "function getReserveData(address asset) view returns (((uint256 data) configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, uint128 variableBorrowIndex, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt))",
  "function ADDRESSES_PROVIDER() view returns (address)",
]);

export const aaveAddressesProviderAbi = parseAbi(["function getPriceOracle() view returns (address)"]);
export const aaveOracleAbi = parseAbi(["function getAssetPrice(address asset) view returns (uint256)"]);

export const erc20Abi = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function nonces(address owner) view returns (uint256)",
  "function DOMAIN_SEPARATOR() view returns (bytes32)",
  "function eip712Domain() view returns (bytes1 fields, string name, string version, uint256 chainId, address verifyingContract, bytes32 salt, uint256[] extensions)",
]);

export const aaveFaucetAbi = parseAbi(["function mint(address token, address to, uint256 amount) returns (uint256)"]);

export const borrowerOperationsSignaturesAbi = parseAbi([
  "function openTroveWithSignature(uint256 _debtAmount, address _upperHint, address _lowerHint, address _borrower, address _recipient, bytes _signature, uint256 _deadline) payable",
  "function getNonce(address user) view returns (uint256)",
  "function eip712Domain() view returns (bytes1 fields, string name, string version, uint256 chainId, address verifyingContract, bytes32 salt, uint256[] extensions)",
]);

export const borrowerOperationsAbi = parseAbi([
  "function minNetDebt() view returns (uint256)",
  "function borrowingRate() view returns (uint256)",
  "function getBorrowingFee(uint256 _debt) view returns (uint256)",
  "function MUSD_GAS_COMPENSATION() view returns (uint256)",
]);

export const troveManagerAbi = parseAbi([
  "function getTroveStatus(address) view returns (uint8)",
  "function getTroveColl(address) view returns (uint256)",
  "function getTroveDebt(address) view returns (uint256)",
  "function getTrovePrincipal(address) view returns (uint256)",
  "function getTroveInterestRate(address) view returns (uint16)",
  "function getTroveMaxBorrowingCapacity(address) view returns (uint256)",
  "function getCurrentICR(address, uint256) view returns (uint256)",
  "function getTCR(uint256) view returns (uint256)",
  "function checkRecoveryMode(uint256) view returns (bool)",
]);

export const priceFeedAbi = parseAbi(["function fetchPrice() view returns (uint256)"]);
export const interestRateManagerAbi = parseAbi(["function interestRate() view returns (uint16)"]);
export const hintHelpersAbi = parseAbi([
  "function getApproxHint(uint256 _CR, uint256 _numTrials, uint256 _inputRandomSeed) view returns (address hintAddress, uint256 diff, uint256 latestRandomSeed)",
  "function computeNominalCR(uint256 _coll, uint256 _debt) pure returns (uint256)",
]);
export const sortedTrovesAbi = parseAbi([
  "function findInsertPosition(uint256 _NICR, address _prevId, address _nextId) view returns (address, address)",
  "function getSize() view returns (uint256)",
]);

export const wormholeAbi = parseAbi([
  "function chainId() view returns (uint16)",
  "function messageFee() view returns (uint256)",
]);
export const wormholeTransceiverAbi = parseAbi(["function wormhole() view returns (address)"]);
