// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IAavePool, IAToken, IAaveOracle, IPoolAddressesProvider} from "../interfaces/IAave.sol";
import {IWormhole} from "../interfaces/IWormhole.sol";
import {FerryTypes} from "../libraries/FerryTypes.sol";

/// @title FerryEscrow (Ethereum Sepolia)
/// @notice Ethereum leg of a Ferry migration. A solver repays the user's Aave debt, the user's aTokens are pulled
///         with a permit and withdrawn to WBTC, and the WBTC is held here until a Wormhole VAA from FerryMezo proves
///         the user's Mezo trove was opened. If that never happens, `refund` splits the WBTC after a timeout:
///         the solver gets exactly the value it repaid, the user keeps all remaining equity.
/// @dev No owner, no upgrades, no admin functions. All configuration is immutable.
contract FerryEscrow is EIP712, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    enum Status {
        None,
        Pending,
        Completed,
        Refunded
    }

    struct Escrow {
        address user;
        address solver;
        address collateralAsset;
        address debtAsset;
        uint256 collateralAmount; // WBTC held for this intent
        uint256 debtRepaid; // debt asset units the solver repaid on Aave
        uint256 mezoCollateral;
        uint256 mezoDebtAmount;
        uint64 startedAt;
        Status status;
    }

    struct Permit {
        uint256 value;
        uint256 deadline;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    /// @notice Max solver fee a user can sign (5%).
    uint256 public constant MAX_SOLVER_FEE_BPS = 500;
    /// @notice Upper bound for Mezo's borrowing fee when sanity-checking the trove debt (1%; live rate is 0.1%).
    uint256 public constant MAX_MEZO_FEE_BPS = 100;
    /// @notice Mezo's MUSD gas compensation added to every trove's debt.
    uint256 public constant MUSD_GAS_COMPENSATION = 200e18;
    uint256 private constant VARIABLE_RATE_MODE = 2;

    IAavePool public immutable pool;
    IWormhole public immutable wormhole;
    uint16 public immutable mezoWormholeChainId;
    bytes32 public immutable ferryMezoEmitter;
    uint256 public immutable timeout;

    mapping(bytes32 => Escrow) internal _escrows;
    mapping(address => uint256) public nonces;
    mapping(bytes32 => bool) public consumedVaas;
    /// @notice Sum of collateral held for Pending escrows, per asset (invariant: <= balance).
    mapping(address => uint256) public totalEscrowed;

    event EthLegExecuted(
        bytes32 indexed intentId,
        address indexed user,
        address indexed solver,
        uint256 collateralAmount,
        uint256 debtRepaid
    );
    event Finalized(bytes32 indexed intentId, address indexed solver, uint256 collateralAmount, bytes32 vaaHash);
    event Refunded(bytes32 indexed intentId, uint256 toSolver, uint256 toUser);

    error Expired();
    error BadNonce(uint256 expected, uint256 got);
    error BadSignature();
    error FeeTooHigh();
    error AlreadyExists();
    error DebtTooHigh(uint256 debt, uint256 maxDebtRepay);
    error NoDebt();
    error PositionNotClosed(uint256 remainingDebtBase);
    error CollateralTooLow(uint256 got, uint256 minimum);
    error PermitInsufficient();
    error InvalidVaa(string reason);
    error WrongEmitter();
    error VaaAlreadyConsumed();
    error WrongVersion();
    error NotPending();
    error ProofMismatch();
    error TooEarly(uint256 refundableAt);
    error ZeroAddress();

    constructor(
        IAavePool _pool,
        IWormhole _wormhole,
        uint16 _mezoWormholeChainId,
        address _ferryMezo,
        uint256 _timeout
    ) EIP712("FerryEscrow", "1") {
        if (address(_pool) == address(0) || address(_wormhole) == address(0) || _ferryMezo == address(0)) {
            revert ZeroAddress();
        }
        pool = _pool;
        wormhole = _wormhole;
        mezoWormholeChainId = _mezoWormholeChainId;
        ferryMezoEmitter = FerryTypes.toBytes32(_ferryMezo);
        timeout = _timeout;
    }

    // ---------------------------------------------------------------- views

    /// @notice intentId = EIP-712 digest of the intent under this contract's domain.
    function intentId(FerryTypes.MigrationIntent calldata intent) public view returns (bytes32) {
        return _hashTypedDataV4(FerryTypes.hashIntent(intent));
    }

    function getEscrow(bytes32 id) external view returns (Escrow memory) {
        return _escrows[id];
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    // ---------------------------------------------------------------- Ethereum leg

    /// @notice Called by the solver. Repays the user's whole variable debt in `debtAsset` on their behalf, moves the
    ///         user's collateral aTokens here with their permit, withdraws the underlying and escrows it.
    function executeEthLeg(
        FerryTypes.MigrationIntent calldata intent,
        bytes calldata intentSignature,
        Permit calldata aTokenPermit
    ) external nonReentrant returns (bytes32 id) {
        if (block.timestamp > intent.deadline) revert Expired();
        if (intent.solverFeeBps > MAX_SOLVER_FEE_BPS) revert FeeTooHigh();
        if (intent.nonce != nonces[intent.user]) revert BadNonce(nonces[intent.user], intent.nonce);

        id = intentId(intent);
        if (!SignatureChecker.isValidSignatureNow(intent.user, id, intentSignature)) revert BadSignature();
        if (_escrows[id].status != Status.None) revert AlreadyExists();
        nonces[intent.user]++;

        uint256 repaid = _repayDebt(intent.user, intent.debtAsset, intent.maxDebtRepay);
        uint256 withdrawn = _pullCollateral(intent.user, intent.collateralAsset, aTokenPermit);
        if (withdrawn < intent.collateralAmount) revert CollateralTooLow(withdrawn, intent.collateralAmount);

        _escrows[id] = Escrow({
            user: intent.user,
            solver: msg.sender,
            collateralAsset: intent.collateralAsset,
            debtAsset: intent.debtAsset,
            collateralAmount: withdrawn,
            debtRepaid: repaid,
            mezoCollateral: intent.mezoCollateral,
            mezoDebtAmount: intent.mezoDebtAmount,
            startedAt: uint64(block.timestamp),
            status: Status.Pending
        });
        totalEscrowed[intent.collateralAsset] += withdrawn;

        emit EthLegExecuted(id, intent.user, msg.sender, withdrawn, repaid);
    }

    /// @dev Repays the user's exact current variable debt with the solver's funds. Aave forbids
    ///      `type(uint256).max` when repaying on behalf of someone else, and debt only grows between blocks,
    ///      so reading the balance inside the same transaction is exact.
    function _repayDebt(address user, address debtAsset, uint256 maxDebtRepay) internal returns (uint256 repaid) {
        address debtToken = pool.getReserveData(debtAsset).variableDebtTokenAddress;
        uint256 debt = IERC20(debtToken).balanceOf(user);
        if (debt == 0) revert NoDebt();
        if (debt > maxDebtRepay) revert DebtTooHigh(debt, maxDebtRepay);

        IERC20(debtAsset).safeTransferFrom(msg.sender, address(this), debt);
        IERC20(debtAsset).forceApprove(address(pool), debt);
        repaid = pool.repay(debtAsset, debt, VARIABLE_RATE_MODE, user);

        (, uint256 remainingDebtBase,,,,) = pool.getUserAccountData(user);
        if (remainingDebtBase != 0) revert PositionNotClosed(remainingDebtBase);
    }

    /// @dev Moves all of the user's collateral aTokens here (permit; a front-run permit is tolerated as long as the
    ///      allowance is in place) and withdraws the underlying.
    function _pullCollateral(address user, address collateralAsset, Permit calldata p)
        internal
        returns (uint256 withdrawn)
    {
        IAToken aToken = IAToken(pool.getReserveData(collateralAsset).aTokenAddress);
        uint256 aBalance = aToken.balanceOf(user);
        try aToken.permit(user, address(this), p.value, p.deadline, p.v, p.r, p.s) {} catch {}
        if (IERC20(address(aToken)).allowance(user, address(this)) < aBalance) revert PermitInsufficient();
        IERC20(address(aToken)).safeTransferFrom(user, address(this), aBalance);

        uint256 balanceBefore = IERC20(collateralAsset).balanceOf(address(this));
        pool.withdraw(collateralAsset, type(uint256).max, address(this));
        withdrawn = IERC20(collateralAsset).balanceOf(address(this)) - balanceBefore;
    }

    // ---------------------------------------------------------------- happy path

    /// @notice Anyone can submit FerryMezo's signed VAA. Releases the escrowed WBTC to the solver that repaid Aave.
    function finalize(bytes calldata encodedVaa) external nonReentrant {
        (IWormhole.VM memory vm, bool valid, string memory reason) = wormhole.parseAndVerifyVM(encodedVaa);
        if (!valid) revert InvalidVaa(reason);
        if (vm.emitterChainId != mezoWormholeChainId || vm.emitterAddress != ferryMezoEmitter) revert WrongEmitter();
        if (consumedVaas[vm.hash]) revert VaaAlreadyConsumed();
        consumedVaas[vm.hash] = true;

        if (FerryTypes.payloadVersion(vm.payload) != FerryTypes.PROOF_VERSION) revert WrongVersion();
        FerryTypes.MezoProof memory proof = FerryTypes.decodeProof(vm.payload);

        Escrow storage e = _escrows[proof.intentId];
        if (e.status != Status.Pending) revert NotPending();
        if (!proofMatches(e, proof)) revert ProofMismatch();

        e.status = Status.Completed;
        totalEscrowed[e.collateralAsset] -= e.collateralAmount;
        IERC20(e.collateralAsset).safeTransfer(e.solver, e.collateralAmount);

        emit Finalized(proof.intentId, e.solver, e.collateralAmount, vm.hash);
    }

    /// @notice Trove must be the user's, hold at least the promised BTC, and carry the authorised debt plus Mezo's
    ///         borrowing fee (bounded) and gas compensation.
    function proofMatches(Escrow memory e, FerryTypes.MezoProof memory p) public pure returns (bool) {
        uint256 minDebt = e.mezoDebtAmount + MUSD_GAS_COMPENSATION;
        uint256 maxDebt = minDebt + Math.mulDiv(e.mezoDebtAmount, MAX_MEZO_FEE_BPS, 10_000, Math.Rounding.Ceil);
        return p.user == e.user && p.troveColl >= e.mezoCollateral && p.troveDebt >= minDebt && p.troveDebt <= maxDebt;
    }

    // ---------------------------------------------------------------- timeout path

    function refundableAt(bytes32 id) public view returns (uint256) {
        return uint256(_escrows[id].startedAt) + timeout;
    }

    /// @notice After the timeout anyone can refund: the solver gets WBTC worth exactly what it repaid (Aave oracle,
    ///         rounded down), the user gets everything else.
    function refund(bytes32 id) external nonReentrant {
        Escrow storage e = _escrows[id];
        if (e.status != Status.Pending) revert NotPending();
        uint256 at = refundableAt(id);
        if (block.timestamp < at) revert TooEarly(at);

        (uint256 toSolver, uint256 toUser) = refundSplit(e.collateralAsset, e.debtAsset, e.collateralAmount, e.debtRepaid);
        e.status = Status.Refunded;
        totalEscrowed[e.collateralAsset] -= e.collateralAmount;

        IERC20 coll = IERC20(e.collateralAsset);
        if (toSolver > 0) coll.safeTransfer(e.solver, toSolver);
        if (toUser > 0) coll.safeTransfer(e.user, toUser);
        emit Refunded(id, toSolver, toUser);
    }

    function refundSplit(address collateralAsset, address debtAsset, uint256 collateralAmount, uint256 debtRepaid)
        public
        view
        returns (uint256 toSolver, uint256 toUser)
    {
        IAaveOracle oracle = IAaveOracle(IPoolAddressesProvider(pool.ADDRESSES_PROVIDER()).getPriceOracle());
        toSolver = computeSolverShare(
            debtRepaid,
            oracle.getAssetPrice(debtAsset),
            IERC20Metadata(debtAsset).decimals(),
            oracle.getAssetPrice(collateralAsset),
            IERC20Metadata(collateralAsset).decimals(),
            collateralAmount
        );
        toUser = collateralAmount - toSolver;
    }

    /// @notice Collateral worth `debtRepaid`, rounded down (in the user's favour), capped at the escrowed amount.
    function computeSolverShare(
        uint256 debtRepaid,
        uint256 debtPrice,
        uint8 debtDecimals,
        uint256 collPrice,
        uint8 collDecimals,
        uint256 collateralAmount
    ) public pure returns (uint256) {
        if (collPrice == 0) return 0;
        // single rounding step: debtRepaid * debtPrice * 10^collDec / (collPrice * 10^debtDec)
        uint256 share = Math.mulDiv(debtRepaid, debtPrice * 10 ** collDecimals, collPrice * 10 ** debtDecimals);
        return share > collateralAmount ? collateralAmount : share;
    }
}
