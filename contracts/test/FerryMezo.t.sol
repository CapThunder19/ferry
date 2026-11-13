// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FerryFixture} from "./FerryFixture.sol";
import {FerryMezo} from "../contracts/mezo/FerryMezo.sol";
import {FerryTypes} from "../contracts/libraries/FerryTypes.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract FerryMezoTest is FerryFixture {
    bytes32 constant ID = keccak256("intent-1");
    uint256 constant COLL = 0.05 ether; // 0.05 BTC
    uint256 constant DEBT = 2_016e18; // MUSD

    function _intent() internal view returns (FerryTypes.MigrationIntent memory i) {
        i.user = user;
        i.mezoCollateral = COLL;
        i.mezoDebtAmount = DEBT;
    }

    function test_mezoLeg_happyPath() public {
        FerryMezo.MezoLeg memory leg = mezoLeg(ID, _intent());
        vm.prank(solver);
        uint64 seq = ferryMezo.executeMezoLeg{value: COLL}(leg);

        assertEq(seq, 0);
        assertEq(troveManager.getTroveStatus(user), 1, "trove active in user's name");
        assertEq(troveManager.getTroveColl(user), COLL);
        assertEq(troveManager.getTroveDebt(user), DEBT + DEBT / 1000 + 200e18);
        assertEq(musd.balanceOf(solver), DEBT, "solver received the minted MUSD");
        assertEq(musd.balanceOf(address(ferryMezo)), 0);
        assertEq(address(ferryMezo).balance, 0);
        assertTrue(ferryMezo.executed(ID));

        FerryTypes.MezoProof memory p = FerryTypes.decodeProof(mezoWormhole.lastPayload());
        assertEq(p.version, 1);
        assertEq(p.intentId, ID);
        assertEq(p.user, user);
        assertEq(p.troveColl, COLL);
        assertEq(p.troveDebt, DEBT + DEBT / 1000 + 200e18);
        assertEq(p.solver, solver);
        assertEq(mezoWormhole.lastSender(), address(ferryMezo));
    }

    function test_mezoLeg_paysWormholeFee() public {
        mezoWormhole.setMessageFee(0.001 ether);
        FerryMezo.MezoLeg memory leg = mezoLeg(ID, _intent());
        vm.prank(solver);
        vm.expectRevert(abi.encodeWithSelector(FerryMezo.WrongValue.selector, COLL + 0.001 ether, COLL));
        ferryMezo.executeMezoLeg{value: COLL}(leg);
        vm.prank(solver);
        ferryMezo.executeMezoLeg{value: COLL + 0.001 ether}(leg);
        assertEq(address(mezoWormhole).balance, 0.001 ether);
    }

    function test_mezoLeg_revertsOnSecondExecution() public {
        FerryMezo.MezoLeg memory leg = mezoLeg(ID, _intent());
        vm.prank(solver);
        ferryMezo.executeMezoLeg{value: COLL}(leg);
        vm.prank(solver);
        vm.expectRevert(FerryMezo.AlreadyExecuted.selector);
        ferryMezo.executeMezoLeg{value: COLL}(leg);
    }

    function test_mezoLeg_revertsWhenUserHasTrove() public {
        troveManager.open(user, 1 ether, 3_000e18);
        FerryMezo.MezoLeg memory leg = mezoLeg(ID, _intent());
        vm.prank(solver);
        vm.expectRevert(FerryMezo.TroveAlreadyActive.selector);
        ferryMezo.executeMezoLeg{value: COLL}(leg);
    }

    function test_mezoLeg_revertsOnWrongCollateralForSignature() public {
        FerryMezo.MezoLeg memory leg = mezoLeg(ID, _intent());
        leg.mezoCollateral = COLL - 1; // solver tries to underfund the trove
        vm.prank(solver);
        vm.expectRevert("BorrowerOperationsSignatures: Invalid signature");
        ferryMezo.executeMezoLeg{value: COLL - 1}(leg);
        assertFalse(ferryMezo.executed(ID), "state rolled back");
    }

    function test_mezoLeg_revertsBelowMinDebt() public {
        FerryTypes.MigrationIntent memory i = _intent();
        i.mezoDebtAmount = 1_000e18;
        FerryMezo.MezoLeg memory leg = mezoLeg(ID, i);
        vm.prank(solver);
        vm.expectRevert("BorrowerOps: Trove's net debt must be greater than minimum");
        ferryMezo.executeMezoLeg{value: COLL}(leg);
    }

    function test_ping_onlyOwner() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(this)));
        ferryMezo.ping(bytes32("x"));
        vm.prank(owner);
        ferryMezo.ping(bytes32("x"));
        (uint8 version, bytes32 tag) = abi.decode(mezoWormhole.lastPayload(), (uint8, bytes32));
        assertEq(version, 0);
        assertEq(tag, bytes32("x"));
    }

    function test_rescue() public {
        musd.mint(address(ferryMezo), 5e18);
        vm.deal(address(ferryMezo), 1 ether);
        address to = makeAddr("to");
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(this)));
        ferryMezo.rescue(address(musd), to, 5e18);
        vm.startPrank(owner);
        ferryMezo.rescue(address(musd), to, 5e18);
        ferryMezo.rescue(address(0), to, 1 ether);
        vm.expectRevert(FerryMezo.ZeroAddress.selector);
        ferryMezo.rescue(address(0), address(0), 0);
        vm.stopPrank();
        assertEq(musd.balanceOf(to), 5e18);
        assertEq(to.balance, 1 ether);
    }
}
