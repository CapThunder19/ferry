// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FerryFixture} from "./FerryFixture.sol";
import {FerryEscrow} from "../contracts/ethereum/FerryEscrow.sol";
import {FerryTypes} from "../contracts/libraries/FerryTypes.sol";
import {IAavePool} from "../contracts/interfaces/IAave.sol";
import {IWormhole} from "../contracts/interfaces/IWormhole.sol";

contract FerryEscrowTest is FerryFixture {
    uint256 constant WBTC_AMOUNT = 0.05e8; // 0.05 WBTC = $3,000 at $60k
    uint256 constant DEBT = 2_000e6; // 2,000 USDC
    uint256 constant MAX_REPAY = 2_010e6;

    function setUp() public override {
        super.setUp();
        openAavePosition(user, WBTC_AMOUNT, DEBT);
    }

    // ------------------------------------------------------------ executeEthLeg

    function test_ethLeg_happyPath() public {
        FerryTypes.MigrationIntent memory i = makeIntent(WBTC_AMOUNT, MAX_REPAY);
        uint256 solverUsdcBefore = usdc.balanceOf(solver);
        bytes32 id = runEthLeg(i);

        assertEq(id, escrow.intentId(i));
        assertEq(pool.debtToken(address(usdc)).balanceOf(user), 0, "aave debt closed");
        assertEq(aWbtc().balanceOf(user), 0, "aTokens moved");
        assertEq(wbtc.balanceOf(address(escrow)), WBTC_AMOUNT, "WBTC escrowed");
        assertEq(solverUsdcBefore - usdc.balanceOf(solver), DEBT, "solver paid exact debt");
        assertEq(escrow.totalEscrowed(address(wbtc)), WBTC_AMOUNT);
        assertEq(escrow.nonces(user), 1);

        FerryEscrow.Escrow memory e = escrow.getEscrow(id);
        assertEq(e.user, user);
        assertEq(e.solver, solver);
        assertEq(e.collateralAmount, WBTC_AMOUNT);
        assertEq(e.debtRepaid, DEBT);
        assertEq(uint8(e.status), uint8(FerryEscrow.Status.Pending));
    }

    function test_ethLeg_debtGrewButWithinMax() public {
        pool.accrue(address(usdc), user, 5e6);
        bytes32 id = runEthLeg(makeIntent(WBTC_AMOUNT, MAX_REPAY));
        assertEq(escrow.getEscrow(id).debtRepaid, DEBT + 5e6);
        assertEq(pool.debtToken(address(usdc)).balanceOf(user), 0);
    }

    function test_ethLeg_revertsWhenDebtExceedsMax() public {
        pool.accrue(address(usdc), user, 20e6);
        FerryTypes.MigrationIntent memory i = makeIntent(WBTC_AMOUNT, MAX_REPAY);
        bytes memory sig = signIntent(userPk, i);
        FerryEscrow.Permit memory p = permitFor(userPk, WBTC_AMOUNT);
        vm.prank(solver);
        vm.expectRevert(abi.encodeWithSelector(FerryEscrow.DebtTooHigh.selector, DEBT + 20e6, MAX_REPAY));
        escrow.executeEthLeg(i, sig, p);
    }

    function test_ethLeg_revertsWhenPositionNotFullyClosed() public {
        // user also owes USDT: repaying USDC alone leaves debt
        vm.prank(user);
        pool.borrow(address(usdt), 100e6, 2, 0, user);
        FerryTypes.MigrationIntent memory i = makeIntent(WBTC_AMOUNT, MAX_REPAY);
        bytes memory sig = signIntent(userPk, i);
        FerryEscrow.Permit memory p = permitFor(userPk, WBTC_AMOUNT);
        vm.prank(solver);
        vm.expectRevert(abi.encodeWithSelector(FerryEscrow.PositionNotClosed.selector, 100e8));
        escrow.executeEthLeg(i, sig, p);
    }

    function test_ethLeg_revertsOnBadSignature() public {
        FerryTypes.MigrationIntent memory i = makeIntent(WBTC_AMOUNT, MAX_REPAY);
        bytes memory sig = signIntent(0xBAD, i);
        FerryEscrow.Permit memory p = permitFor(userPk, WBTC_AMOUNT);
        vm.prank(solver);
        vm.expectRevert(FerryEscrow.BadSignature.selector);
        escrow.executeEthLeg(i, sig, p);
    }

    function test_ethLeg_revertsOnTamperedIntent() public {
        FerryTypes.MigrationIntent memory i = makeIntent(WBTC_AMOUNT, MAX_REPAY);
        bytes memory sig = signIntent(userPk, i);
        i.mezoCollateral -= 1; // solver tries to give the user less BTC on Mezo
        FerryEscrow.Permit memory p = permitFor(userPk, WBTC_AMOUNT);
        vm.prank(solver);
        vm.expectRevert(FerryEscrow.BadSignature.selector);
        escrow.executeEthLeg(i, sig, p);
    }

    function test_ethLeg_revertsWhenExpired() public {
        FerryTypes.MigrationIntent memory i = makeIntent(WBTC_AMOUNT, MAX_REPAY);
        bytes memory sig = signIntent(userPk, i);
        FerryEscrow.Permit memory p = permitFor(userPk, WBTC_AMOUNT);
        vm.warp(i.deadline + 1);
        vm.prank(solver);
        vm.expectRevert(FerryEscrow.Expired.selector);
        escrow.executeEthLeg(i, sig, p);
    }

    function test_ethLeg_revertsOnReplay() public {
        FerryTypes.MigrationIntent memory i = makeIntent(WBTC_AMOUNT, MAX_REPAY);
        bytes memory sig = signIntent(userPk, i);
        FerryEscrow.Permit memory p = permitFor(userPk, WBTC_AMOUNT * 2);
        vm.prank(solver);
        escrow.executeEthLeg(i, sig, p);

        openAavePosition(user, WBTC_AMOUNT, DEBT); // even with a fresh position the old intent is dead
        vm.prank(solver);
        vm.expectRevert(abi.encodeWithSelector(FerryEscrow.BadNonce.selector, 1, 0));
        escrow.executeEthLeg(i, sig, p);
    }

    function test_ethLeg_revertsWhenFeeTooHigh() public {
        FerryTypes.MigrationIntent memory i = makeIntent(WBTC_AMOUNT, MAX_REPAY);
        i.solverFeeBps = 501;
        bytes memory sig = signIntent(userPk, i);
        FerryEscrow.Permit memory p = permitFor(userPk, WBTC_AMOUNT);
        vm.prank(solver);
        vm.expectRevert(FerryEscrow.FeeTooHigh.selector);
        escrow.executeEthLeg(i, sig, p);
    }

    function test_ethLeg_revertsWithoutPermit() public {
        FerryTypes.MigrationIntent memory i = makeIntent(WBTC_AMOUNT, MAX_REPAY);
        bytes memory sig = signIntent(userPk, i);
        FerryEscrow.Permit memory p = permitFor(userPk, WBTC_AMOUNT - 1); // too small
        vm.prank(solver);
        vm.expectRevert(FerryEscrow.PermitInsufficient.selector);
        escrow.executeEthLeg(i, sig, p);
    }

    function test_ethLeg_toleratesFrontRunPermit() public {
        FerryTypes.MigrationIntent memory i = makeIntent(WBTC_AMOUNT, MAX_REPAY);
        bytes memory sig = signIntent(userPk, i);
        FerryEscrow.Permit memory p = permitFor(userPk, WBTC_AMOUNT);
        // attacker submits the permit first; the nonce is consumed but the allowance is in place
        aWbtc().permit(user, address(escrow), p.value, p.deadline, p.v, p.r, p.s);
        vm.prank(solver);
        escrow.executeEthLeg(i, sig, p);
        assertEq(wbtc.balanceOf(address(escrow)), WBTC_AMOUNT);
    }

    function test_ethLeg_revertsWhenCollateralBelowIntent() public {
        FerryTypes.MigrationIntent memory i = makeIntent(WBTC_AMOUNT + 1, MAX_REPAY);
        bytes memory sig = signIntent(userPk, i);
        FerryEscrow.Permit memory p = permitFor(userPk, WBTC_AMOUNT * 2);
        vm.prank(solver);
        vm.expectRevert(abi.encodeWithSelector(FerryEscrow.CollateralTooLow.selector, WBTC_AMOUNT, WBTC_AMOUNT + 1));
        escrow.executeEthLeg(i, sig, p);
    }

    function test_ethLeg_revertsWithNoDebt() public {
        vm.startPrank(user);
        usdc.approve(address(pool), DEBT);
        pool.repay(address(usdc), DEBT, 2, user);
        vm.stopPrank();
        FerryTypes.MigrationIntent memory i = makeIntent(WBTC_AMOUNT, MAX_REPAY);
        bytes memory sig = signIntent(userPk, i);
        FerryEscrow.Permit memory p = permitFor(userPk, WBTC_AMOUNT);
        vm.prank(solver);
        vm.expectRevert(FerryEscrow.NoDebt.selector);
        escrow.executeEthLeg(i, sig, p);
    }

    // ------------------------------------------------------------ finalize

    function test_finalize_happyPath() public {
        FerryTypes.MigrationIntent memory i = makeIntent(WBTC_AMOUNT, MAX_REPAY);
        bytes32 id = runEthLeg(i);
        bytes memory vaa = runMezoLeg(id, i);

        escrow.finalize(vaa); // permissionless
        assertEq(wbtc.balanceOf(solver), WBTC_AMOUNT, "solver got WBTC");
        assertEq(wbtc.balanceOf(address(escrow)), 0);
        assertEq(escrow.totalEscrowed(address(wbtc)), 0);
        assertEq(uint8(escrow.getEscrow(id).status), uint8(FerryEscrow.Status.Completed));
    }

    function test_finalize_revertsOnVaaReplay() public {
        FerryTypes.MigrationIntent memory i = makeIntent(WBTC_AMOUNT, MAX_REPAY);
        bytes32 id = runEthLeg(i);
        bytes memory vaa = runMezoLeg(id, i);
        escrow.finalize(vaa);
        vm.expectRevert(FerryEscrow.VaaAlreadyConsumed.selector);
        escrow.finalize(vaa);
    }

    function test_finalize_revertsOnInvalidVaa() public {
        FerryTypes.MigrationIntent memory i = makeIntent(WBTC_AMOUNT, MAX_REPAY);
        bytes32 id = runEthLeg(i);
        runMezoLeg(id, i);
        bytes memory vaa = sepoliaWormhole.encodeVaa(MEZO_WH_CHAIN, address(ferryMezo), 0, mezoWormhole.lastPayload(), false);
        vm.expectRevert(abi.encodeWithSelector(FerryEscrow.InvalidVaa.selector, "mock: invalid signatures"));
        escrow.finalize(vaa);
    }

    function test_finalize_revertsOnWrongEmitterAddress() public {
        FerryTypes.MigrationIntent memory i = makeIntent(WBTC_AMOUNT, MAX_REPAY);
        bytes32 id = runEthLeg(i);
        runMezoLeg(id, i);
        bytes memory vaa = sepoliaWormhole.encodeVaa(MEZO_WH_CHAIN, makeAddr("impostor"), 0, mezoWormhole.lastPayload(), true);
        vm.expectRevert(FerryEscrow.WrongEmitter.selector);
        escrow.finalize(vaa);
    }

    function test_finalize_revertsOnWrongEmitterChain() public {
        FerryTypes.MigrationIntent memory i = makeIntent(WBTC_AMOUNT, MAX_REPAY);
        bytes32 id = runEthLeg(i);
        runMezoLeg(id, i);
        bytes memory vaa = sepoliaWormhole.encodeVaa(2, address(ferryMezo), 0, mezoWormhole.lastPayload(), true);
        vm.expectRevert(FerryEscrow.WrongEmitter.selector);
        escrow.finalize(vaa);
    }

    function _forgedVaa(bytes32 id, address u, uint256 coll, uint256 debt) internal view returns (bytes memory) {
        bytes memory payload = FerryTypes.encodeProof(FerryTypes.MezoProof(FerryTypes.PROOF_VERSION, id, u, coll, debt, solver));
        return sepoliaWormhole.encodeVaa(MEZO_WH_CHAIN, address(ferryMezo), 7, payload, true);
    }

    function test_finalize_revertsOnWrongPayload() public {
        FerryTypes.MigrationIntent memory i = makeIntent(WBTC_AMOUNT, MAX_REPAY);
        bytes32 id = runEthLeg(i);
        uint256 goodDebt = i.mezoDebtAmount + i.mezoDebtAmount / 1000 + 200e18;

        bytes memory vaa = _forgedVaa(id, makeAddr("other"), i.mezoCollateral, goodDebt);
        vm.expectRevert(FerryEscrow.ProofMismatch.selector); // wrong user
        escrow.finalize(vaa);

        vaa = _forgedVaa(id, user, i.mezoCollateral - 1, goodDebt);
        vm.expectRevert(FerryEscrow.ProofMismatch.selector); // less BTC than promised
        escrow.finalize(vaa);

        vaa = _forgedVaa(id, user, i.mezoCollateral, i.mezoDebtAmount);
        vm.expectRevert(FerryEscrow.ProofMismatch.selector); // debt too low (no gas comp)
        escrow.finalize(vaa);

        vaa = _forgedVaa(id, user, i.mezoCollateral, goodDebt * 2);
        vm.expectRevert(FerryEscrow.ProofMismatch.selector); // debt far above what the user authorised
        escrow.finalize(vaa);

        vaa = _forgedVaa(bytes32(uint256(1)), user, i.mezoCollateral, goodDebt);
        vm.expectRevert(FerryEscrow.NotPending.selector); // unknown intent
        escrow.finalize(vaa);

        escrow.finalize(_forgedVaa(id, user, i.mezoCollateral, goodDebt)); // and the correct one passes
    }

    function test_finalize_rejectsPingVersion() public {
        vm.deal(owner, 1 ether);
        vm.prank(owner);
        uint64 seq = ferryMezo.ping(keccak256("hello"));
        bytes memory vaa = sepoliaWormhole.encodeVaa(MEZO_WH_CHAIN, address(ferryMezo), seq, mezoWormhole.lastPayload(), true);
        vm.expectRevert(FerryEscrow.WrongVersion.selector);
        escrow.finalize(vaa);
    }

    function test_finalize_afterRefundReverts() public {
        FerryTypes.MigrationIntent memory i = makeIntent(WBTC_AMOUNT, MAX_REPAY);
        bytes32 id = runEthLeg(i);
        bytes memory vaa = runMezoLeg(id, i);
        vm.warp(block.timestamp + TIMEOUT);
        escrow.refund(id);
        vm.expectRevert(FerryEscrow.NotPending.selector);
        escrow.finalize(vaa);
    }

    // ------------------------------------------------------------ refund

    function test_refund_tooEarly() public {
        bytes32 id = runEthLeg(makeIntent(WBTC_AMOUNT, MAX_REPAY));
        vm.warp(block.timestamp + TIMEOUT - 1);
        vm.expectRevert(abi.encodeWithSelector(FerryEscrow.TooEarly.selector, block.timestamp + 1));
        escrow.refund(id);
    }

    function test_refund_splitsByOracleValue() public {
        bytes32 id = runEthLeg(makeIntent(WBTC_AMOUNT, MAX_REPAY));
        vm.warp(block.timestamp + TIMEOUT);
        escrow.refund(id);
        // solver repaid $2,000 → 2,000 / 60,000 BTC = 0.03333333 WBTC (rounded down); user keeps the rest
        assertEq(wbtc.balanceOf(solver), 3_333_333);
        assertEq(wbtc.balanceOf(user), WBTC_AMOUNT - 3_333_333);
        assertEq(uint8(escrow.getEscrow(id).status), uint8(FerryEscrow.Status.Refunded));
        vm.expectRevert(FerryEscrow.NotPending.selector);
        escrow.refund(id);
    }

    function test_refund_underwaterGivesSolverEverythingCapped() public {
        bytes32 id = runEthLeg(makeIntent(WBTC_AMOUNT, MAX_REPAY));
        pool.oracle().setPrice(address(wbtc), 30_000e8); // BTC halves: collateral worth $1,500 < $2,000 repaid
        vm.warp(block.timestamp + TIMEOUT);
        escrow.refund(id);
        assertEq(wbtc.balanceOf(solver), WBTC_AMOUNT);
        assertEq(wbtc.balanceOf(user), 0);
    }

    /// User never loses equity: the solver's share is never worth more than what it repaid, and nothing is lost.
    function testFuzz_refundMaths(uint256 debtRepaid, uint256 debtPrice, uint256 collPrice, uint256 collateral) public view {
        debtRepaid = bound(debtRepaid, 0, 1e15); // up to 1B USDC (6 dec)
        debtPrice = bound(debtPrice, 0.5e8, 2e8);
        collPrice = bound(collPrice, 1e8, 1_000_000e8);
        collateral = bound(collateral, 0, 1e12); // up to 10,000 WBTC
        uint256 share = escrow.computeSolverShare(debtRepaid, debtPrice, 6, collPrice, 8, collateral);
        assertLe(share, collateral);
        // value(share) <= value(debtRepaid)   (both in 1e8 USD * 1e14 to avoid rounding)
        assertLe(share * collPrice * 1e6, debtRepaid * debtPrice * 1e8);
        // and the solver is short by less than one satoshi's worth (unless capped)
        if (share < collateral) assertGt((share + 1) * collPrice * 1e6, debtRepaid * debtPrice * 1e8);
    }

    function test_proofMatches_bounds() public view {
        FerryEscrow.Escrow memory e;
        e.user = user;
        e.mezoCollateral = 1 ether;
        e.mezoDebtAmount = 2_000e18;
        FerryTypes.MezoProof memory p = FerryTypes.MezoProof(1, bytes32(0), user, 1 ether, 2_200e18, solver);
        assertTrue(escrow.proofMatches(e, p)); // no fee (recovery mode / fee-exempt)
        p.troveDebt = 2_220e18; // +1% fee: max allowed
        assertTrue(escrow.proofMatches(e, p));
        p.troveDebt = 2_220e18 + 1;
        assertFalse(escrow.proofMatches(e, p));
    }

    function test_constructor_rejectsZeroAddresses() public {
        vm.expectRevert(FerryEscrow.ZeroAddress.selector);
        new FerryEscrow(IAavePool(address(0)), IWormhole(address(sepoliaWormhole)), MEZO_WH_CHAIN, address(ferryMezo), 1);
        vm.expectRevert(FerryEscrow.ZeroAddress.selector);
        new FerryEscrow(IAavePool(address(pool)), IWormhole(address(sepoliaWormhole)), MEZO_WH_CHAIN, address(0), 1);
    }
}
