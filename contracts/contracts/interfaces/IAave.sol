// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal Aave V3 interfaces used by Ferry (from aave-v3-core / aave-v3-origin).

struct ReserveConfigurationMap {
    uint256 data;
}

/// @dev Layout returned by `IPool.getReserveData` (ReserveDataLegacy on v3.2+, identical ABI to v3.0/3.1).
struct ReserveData {
    ReserveConfigurationMap configuration;
    uint128 liquidityIndex;
    uint128 currentLiquidityRate;
    uint128 variableBorrowIndex;
    uint128 currentVariableBorrowRate;
    uint128 currentStableBorrowRate;
    uint40 lastUpdateTimestamp;
    uint16 id;
    address aTokenAddress;
    address stableDebtTokenAddress;
    address variableDebtTokenAddress;
    address interestRateStrategyAddress;
    uint128 accruedToTreasury;
    uint128 unbacked;
    uint128 isolationModeTotalDebt;
}

interface IAavePool {
    function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external;
    function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf)
        external;
    function repay(address asset, uint256 amount, uint256 interestRateMode, address onBehalfOf)
        external
        returns (uint256);
    function withdraw(address asset, uint256 amount, address to) external returns (uint256);
    function getReserveData(address asset) external view returns (ReserveData memory);
    function getReservesList() external view returns (address[] memory);
    function getUserAccountData(address user)
        external
        view
        returns (
            uint256 totalCollateralBase,
            uint256 totalDebtBase,
            uint256 availableBorrowsBase,
            uint256 currentLiquidationThreshold,
            uint256 ltv,
            uint256 healthFactor
        );
    function ADDRESSES_PROVIDER() external view returns (address);
}

interface IPoolAddressesProvider {
    function getPriceOracle() external view returns (address);
}

interface IAaveOracle {
    /// @return price in the base currency unit (USD, 8 decimals on Aave V3)
    function getAssetPrice(address asset) external view returns (uint256);
}

/// @notice aToken: ERC-20 + EIP-2612 permit.
interface IAToken {
    function balanceOf(address account) external view returns (uint256);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
        external;
    function nonces(address owner) external view returns (uint256);
    function UNDERLYING_ASSET_ADDRESS() external view returns (address);
}
