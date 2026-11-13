// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal Mezo MUSD interfaces (from github.com/mezo-org/musd, solidity/contracts).

interface IBorrowerOperationsSignatures {
    /// EIP-712 domain: name "BorrowerOperationsSignatures", version "1", verifyingContract = this proxy.
    /// Signed type: OpenTrove(uint256 assetAmount,uint256 debtAmount,address borrower,address recipient,uint256 nonce,uint256 deadline)
    /// where assetAmount == msg.value.
    function openTroveWithSignature(
        uint256 _debtAmount,
        address _upperHint,
        address _lowerHint,
        address _borrower,
        address _recipient,
        bytes memory _signature,
        uint256 _deadline
    ) external payable;

    function addCollWithSignature(
        address _upperHint,
        address _lowerHint,
        address _borrower,
        bytes memory _signature,
        uint256 _deadline
    ) external payable;

    function withdrawMUSDWithSignature(
        uint256 _amount,
        address _upperHint,
        address _lowerHint,
        address _borrower,
        address _recipient,
        bytes memory _signature,
        uint256 _deadline
    ) external;

    function getNonce(address user) external view returns (uint256);
}

interface IBorrowerOperations {
    function minNetDebt() external view returns (uint256);
    function borrowingRate() external view returns (uint256);
    function getBorrowingFee(uint256 _debt) external view returns (uint256);
    function MUSD_GAS_COMPENSATION() external view returns (uint256);
}

interface ITroveManager {
    enum Status {
        nonExistent,
        active,
        closedByOwner,
        closedByLiquidation,
        closedByRedemption
    }

    function getTroveStatus(address _borrower) external view returns (Status);
    function getTroveColl(address _borrower) external view returns (uint256);
    function getTroveDebt(address _borrower) external view returns (uint256);
    function getTrovePrincipal(address _borrower) external view returns (uint256);
    function getTroveInterestRate(address _borrower) external view returns (uint16);
    function getTroveMaxBorrowingCapacity(address _borrower) external view returns (uint256);
    function getCurrentICR(address _borrower, uint256 _price) external view returns (uint256);
    function getTCR(uint256 _price) external view returns (uint256);
    function checkRecoveryMode(uint256 _price) external view returns (bool);
}

interface IPriceFeed {
    function fetchPrice() external view returns (uint256);
}

interface IHintHelpers {
    function getApproxHint(uint256 _CR, uint256 _numTrials, uint256 _inputRandomSeed)
        external
        view
        returns (address hintAddress, uint256 diff, uint256 latestRandomSeed);
    function computeNominalCR(uint256 _coll, uint256 _debt) external pure returns (uint256);
}

interface ISortedTroves {
    function findInsertPosition(uint256 _NICR, address _prevId, address _nextId)
        external
        view
        returns (address, address);
    function getSize() external view returns (uint256);
}

interface IInterestRateManager {
    /// @return rate in basis points (100 = 1%)
    function interestRate() external view returns (uint16);
}
