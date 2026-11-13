// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {FerryFixture} from "./FerryFixture.sol";
import {FerryEscrow} from "../contracts/ethereum/FerryEscrow.sol";
import {FerryTypes} from "../contracts/libraries/FerryTypes.sol";

/// @notice Drives random sequences of migrations, completions and refunds against one escrow.
contract EscrowHandler is FerryFixture {
    bytes32[] public pendingIds;
    mapping(bytes32 => FerryTypes.MigrationIntent) internal intents;
    mapping(bytes32 => uint256) internal pks;
    uint256 public ghostPending; // sum of collateral of Pending escrows
    uint256 public ghostReleased; // sum paid out (solver + user)
    uint256 public ghostIn; // sum escrowed ever
    uint256 internal nextPk = 1000;

    constructor() {
        setUp();
    }

    function migrate(uint256 wbtcAmount, uint256 debtUsd) external {
        wbtcAmount = bound(wbtcAmount, 0.04e8, 5e8);
        // debt between $1,850 and 60% LTV
        uint256 maxDebt = wbtcAmount * 60_000 * 60 / 100 / 100; // USDC 6 dec from 8 dec WBTC
        debtUsd = bound(debtUsd, 1_850e6, maxDebt < 1_850e6 ? 1_850e6 : maxDebt);
        userPk = nextPk++;
        user = vm.addr(userPk);
        openAavePosition(user, wbtcAmount, debtUsd);

        FerryTypes.MigrationIntent memory i = makeIntent(wbtcAmount, debtUsd);
        bytes32 id = runEthLeg(i);
        intents[id] = i;
        pks[id] = userPk;
        pendingIds.push(id);
        ghostPending += wbtcAmount;
        ghostIn += wbtcAmount;
    }

    function complete(uint256 index) external {
        if (pendingIds.length == 0) return;
        index = bound(index, 0, pendingIds.length - 1);
        bytes32 id = pendingIds[index];
        userPk = pks[id];
        user = vm.addr(userPk);
        bytes memory vaa = runMezoLeg(id, intents[id]);
        uint256 amount = escrow.getEscrow(id).collateralAmount;
        escrow.finalize(vaa);
        _remove(index);
        ghostPending -= amount;
        ghostReleased += amount;
    }

    function refund(uint256 index, uint256 btcPrice) external {
        if (pendingIds.length == 0) return;
        index = bound(index, 0, pendingIds.length - 1);
        bytes32 id = pendingIds[index];
        FerryEscrow.Escrow memory e = escrow.getEscrow(id);
        pool.oracle().setPrice(address(wbtc), bound(btcPrice, 10_000e8, 200_000e8));
        vm.warp(block.timestamp + TIMEOUT);
        uint256 userBefore = wbtc.balanceOf(e.user);
        uint256 solverBefore = wbtc.balanceOf(solver);
        escrow.refund(id);
        uint256 paid = wbtc.balanceOf(e.user) - userBefore + wbtc.balanceOf(solver) - solverBefore;
        require(paid == e.collateralAmount, "refund must pay out exactly the escrow");
        _remove(index);
        ghostPending -= e.collateralAmount;
        ghostReleased += e.collateralAmount;
    }

    function escrowAddr() external view returns (address) {
        return address(escrow);
    }

    function wbtcAddr() external view returns (address) {
        return address(wbtc);
    }

    function pendingCount() external view returns (uint256) {
        return pendingIds.length;
    }

    function _remove(uint256 index) internal {
        pendingIds[index] = pendingIds[pendingIds.length - 1];
        pendingIds.pop();
    }
}

contract FerryEscrowInvariantTest is StdInvariant, Test {
    EscrowHandler internal handler;

    function setUp() public {
        handler = new EscrowHandler();
        bytes4[] memory selectors = new bytes4[](3);
        selectors[0] = EscrowHandler.migrate.selector;
        selectors[1] = EscrowHandler.complete.selector;
        selectors[2] = EscrowHandler.refund.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
        targetContract(address(handler));
    }

    /// Guards against a vacuous invariant run: the handler's actions must actually succeed.
    function test_handlerActionsWork() public {
        handler.migrate(1e8, 20_000e6);
        handler.migrate(0.5e8, 5_000e6);
        handler.migrate(0.05e8, 1_900e6);
        assertEq(handler.pendingCount(), 3);
        handler.complete(0);
        handler.refund(0, 65_000e8);
        assertEq(handler.pendingCount(), 1);
        assertEq(handler.ghostIn(), 1.55e8);
        invariant_escrowBalanceEqualsPending();
        invariant_conservation();
    }

    /// The escrow's WBTC always equals the sum of Pending escrows.
    function invariant_escrowBalanceEqualsPending() public view {
        FerryEscrow escrow = FerryEscrow(handlerEscrow());
        address wbtc = handlerWbtc();
        uint256 bal = IERC20Like(wbtc).balanceOf(address(escrow));
        assertEq(bal, handler.ghostPending());
        assertEq(escrow.totalEscrowed(wbtc), handler.ghostPending());
    }

    /// Nothing is created or lost: in = pending + released.
    function invariant_conservation() public view {
        assertEq(handler.ghostIn(), handler.ghostPending() + handler.ghostReleased());
    }

    function handlerEscrow() internal view returns (address) {
        return address(HandlerView(address(handler)).escrowAddr());
    }

    function handlerWbtc() internal view returns (address) {
        return HandlerView(address(handler)).wbtcAddr();
    }
}

interface IERC20Like {
    function balanceOf(address) external view returns (uint256);
}

interface HandlerView {
    function escrowAddr() external view returns (address);
    function wbtcAddr() external view returns (address);
}
