// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {IBorrowerOperationsSignatures, ITroveManager} from "../interfaces/IMezo.sol";
import {IWormhole} from "../interfaces/IWormhole.sol";
import {FerryTypes} from "../libraries/FerryTypes.sol";

/// @title FerryMezo (Mezo testnet)
/// @notice Opens a MUSD trove in the user's own name using the user's `OpenTrove` signature, pays the freshly
///         minted MUSD to the solver who fronted the BTC, and proves the result to Sepolia via Wormhole.
/// @dev The user signs Mezo's OpenTrove with `recipient = address(this)`, so whichever solver executes receives
///      the MUSD. Front-running the solver with the same signature only costs the front-runner: WBTC on Sepolia is
///      always released to the solver recorded in the escrow (the one that repaid Aave).
contract FerryMezo is Ownable2Step, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    IBorrowerOperationsSignatures public immutable borrowerOperationsSignatures;
    ITroveManager public immutable troveManager;
    IERC20 public immutable musd;
    IWormhole public immutable wormhole;
    uint8 public immutable consistencyLevel;

    /// @notice intentId => already executed (one Mezo leg per intent).
    mapping(bytes32 => bool) public executed;
    /// @notice intentId => Wormhole payload of the executed leg, kept so it can be re-published if the guardians
    ///         miss the original observation. FerryEscrow only releases a Pending escrow once, so copies are harmless.
    mapping(bytes32 => bytes) public proofs;

    event MezoLegExecuted(
        bytes32 indexed intentId,
        address indexed user,
        address indexed solver,
        uint256 troveColl,
        uint256 troveDebt,
        uint64 sequence
    );
    event Ping(bytes32 tag, uint64 sequence);
    event Republished(bytes32 indexed intentId, uint64 sequence);

    error AlreadyExecuted();
    error UnknownIntent();
    error WrongValue(uint256 expected, uint256 got);
    error TroveAlreadyActive();
    error TroveNotOpened();
    error UnexpectedCollateral(uint256 expected, uint256 got);
    error UnexpectedMUSD(uint256 expected, uint256 got);
    error ZeroAddress();

    constructor(
        IBorrowerOperationsSignatures _bos,
        ITroveManager _troveManager,
        IERC20 _musd,
        IWormhole _wormhole,
        uint8 _consistencyLevel,
        address _owner
    ) Ownable(_owner) {
        if (
            address(_bos) == address(0) || address(_troveManager) == address(0) || address(_musd) == address(0)
                || address(_wormhole) == address(0)
        ) revert ZeroAddress();
        borrowerOperationsSignatures = _bos;
        troveManager = _troveManager;
        musd = _musd;
        wormhole = _wormhole;
        consistencyLevel = _consistencyLevel;
    }

    /// @notice Inputs of a Mezo leg. `mezoSignature` is the user's OpenTrove signature with
    ///         assetAmount = mezoCollateral, debtAmount = mezoDebtAmount, recipient = this contract.
    struct MezoLeg {
        bytes32 intentId;
        address user;
        uint256 mezoCollateral;
        uint256 mezoDebtAmount;
        address upperHint;
        address lowerHint;
        bytes mezoSignature;
        uint256 deadline;
    }

    /// @notice Executes the Mezo leg. `msg.value` must equal `mezoCollateral + wormhole.messageFee()`.
    /// @return sequence Wormhole sequence of the published proof.
    function executeMezoLeg(MezoLeg calldata leg) external payable nonReentrant returns (uint64 sequence) {
        uint256 fee = wormhole.messageFee();
        if (msg.value != leg.mezoCollateral + fee) revert WrongValue(leg.mezoCollateral + fee, msg.value);
        if (executed[leg.intentId]) revert AlreadyExecuted();
        if (troveManager.getTroveStatus(leg.user) == ITroveManager.Status.active) revert TroveAlreadyActive();
        executed[leg.intentId] = true;

        uint256 received = _openTrove(leg);
        (uint256 troveColl, uint256 troveDebt) = _readTrove(leg.user, leg.mezoCollateral);

        musd.safeTransfer(msg.sender, received);

        bytes memory payload = FerryTypes.encodeProof(
            FerryTypes.MezoProof({
                version: FerryTypes.PROOF_VERSION,
                intentId: leg.intentId,
                user: leg.user,
                troveColl: troveColl,
                troveDebt: troveDebt,
                solver: msg.sender
            })
        );
        proofs[leg.intentId] = payload;
        sequence = wormhole.publishMessage{value: fee}(0, payload, consistencyLevel);
        emit MezoLegExecuted(leg.intentId, leg.user, msg.sender, troveColl, troveDebt, sequence);
    }

    /// @notice Anyone can re-emit the stored proof of an executed leg (e.g. a guardian outage dropped the first one).
    function republish(bytes32 intentId) external payable nonReentrant returns (uint64 sequence) {
        bytes memory payload = proofs[intentId];
        if (payload.length == 0) revert UnknownIntent();
        uint256 fee = wormhole.messageFee();
        if (msg.value != fee) revert WrongValue(fee, msg.value);
        sequence = wormhole.publishMessage{value: fee}(0, payload, consistencyLevel);
        emit Republished(intentId, sequence);
    }

    function _openTrove(MezoLeg calldata leg) internal returns (uint256 received) {
        uint256 balanceBefore = musd.balanceOf(address(this));
        borrowerOperationsSignatures.openTroveWithSignature{value: leg.mezoCollateral}(
            leg.mezoDebtAmount, leg.upperHint, leg.lowerHint, leg.user, address(this), leg.mezoSignature, leg.deadline
        );
        received = musd.balanceOf(address(this)) - balanceBefore;
        if (received != leg.mezoDebtAmount) revert UnexpectedMUSD(leg.mezoDebtAmount, received);
    }

    /// @dev The trove must be active, in the user's name, with exactly the collateral we sent.
    function _readTrove(address user, uint256 expectedColl) internal view returns (uint256 coll, uint256 debt) {
        if (troveManager.getTroveStatus(user) != ITroveManager.Status.active) revert TroveNotOpened();
        coll = troveManager.getTroveColl(user);
        if (coll != expectedColl) revert UnexpectedCollateral(expectedColl, coll);
        debt = troveManager.getTroveDebt(user);
    }

    /// @notice Publishes a version-0 test message (M2 bridge check). FerryEscrow rejects version 0.
    function ping(bytes32 tag) external payable onlyOwner returns (uint64 sequence) {
        sequence = wormhole.publishMessage{value: msg.value}(0, abi.encode(FerryTypes.PING_VERSION, tag), consistencyLevel);
        emit Ping(tag, sequence);
    }

    /// @notice Recovers tokens or BTC sent here outside a normal Mezo leg (e.g. someone used a user's signature
    ///         directly against BorrowerOperationsSignatures). FerryMezo holds no balance between transactions.
    function rescue(address token, address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        if (token == address(0)) {
            (bool ok,) = to.call{value: amount}("");
            require(ok, "BTC transfer failed");
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }
}
