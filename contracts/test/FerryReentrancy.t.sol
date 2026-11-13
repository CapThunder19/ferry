// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FerryFixture} from "./FerryFixture.sol";
import {FerryEscrow} from "../contracts/ethereum/FerryEscrow.sol";
import {FerryTypes} from "../contracts/libraries/FerryTypes.sol";
import {MockERC20} from "../contracts/mocks/Mocks.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

/// @notice Collateral token that calls back into a target on every transfer once armed.
contract ReentrantToken is MockERC20 {
    address public target;
    bytes public data;
    bool public attempted;
    bytes public revertData;

    constructor() MockERC20("Evil BTC", "EVIL", 8) {}

    function arm(address target_, bytes calldata data_) external {
        target = target_;
        data = data_;
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (target != address(0) && !attempted) {
            attempted = true;
            (bool ok, bytes memory ret) = target.call(data);
            if (!ok) revertData = ret;
            else revertData = hex"00";
        }
    }
}

contract FerryReentrancyTest is FerryFixture {
    ReentrantToken internal evil;

    function setUp() public override {
        super.setUp();
        evil = new ReentrantToken();
        pool.addReserve(address(evil), 60_000e8);
        evil.mint(user, 0.05e8);
        vm.startPrank(user);
        evil.approve(address(pool), 0.05e8);
        pool.supply(address(evil), 0.05e8, user, 0);
        pool.borrow(address(usdc), 2_000e6, 2, 0, user);
        vm.stopPrank();
    }

    function _intent() internal view returns (FerryTypes.MigrationIntent memory i) {
        i = makeIntent(0.05e8, 2_010e6);
        i.collateralAsset = address(evil);
    }

    function _runEthLeg(FerryTypes.MigrationIntent memory i) internal returns (bytes32) {
        bytes memory sig = signIntent(userPk, i);
        FerryEscrow.Permit memory p =
            signPermit(userPk, address(pool.aToken(address(evil))), address(escrow), 1e8, block.timestamp + 1 hours);
        vm.prank(solver);
        return escrow.executeEthLeg(i, sig, p);
    }

    function test_finalizeCannotBeReentered() public {
        FerryTypes.MigrationIntent memory i = _intent();
        bytes32 id = _runEthLeg(i);
        bytes memory vaa = runMezoLeg(id, i);

        evil.arm(address(escrow), abi.encodeCall(FerryEscrow.finalize, (vaa)));
        escrow.finalize(vaa);

        assertTrue(evil.attempted());
        assertEq(evil.revertData(), abi.encodeWithSelector(ReentrancyGuardTransient.ReentrancyGuardReentrantCall.selector));
        assertEq(evil.balanceOf(solver), 0.05e8, "paid exactly once");
        assertEq(evil.balanceOf(address(escrow)), 0);
    }

    function test_refundCannotBeReentered() public {
        bytes32 id = _runEthLeg(_intent());
        vm.warp(block.timestamp + TIMEOUT);

        evil.arm(address(escrow), abi.encodeCall(FerryEscrow.refund, (id)));
        escrow.refund(id);

        assertTrue(evil.attempted());
        assertEq(evil.revertData(), abi.encodeWithSelector(ReentrancyGuardTransient.ReentrancyGuardReentrantCall.selector));
        assertEq(evil.balanceOf(solver) + evil.balanceOf(user), 0.05e8, "paid exactly once");
    }
}
