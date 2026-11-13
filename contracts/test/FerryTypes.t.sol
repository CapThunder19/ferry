// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {FerryTypes} from "../contracts/libraries/FerryTypes.sol";

contract FerryTypesTest is Test {
    function test_typehashMatchesStruct() public pure {
        assertEq(
            FerryTypes.MIGRATION_INTENT_TYPEHASH,
            keccak256(
                "MigrationIntent(address user,address collateralAsset,uint256 collateralAmount,address debtAsset,uint256 maxDebtRepay,uint256 mezoCollateral,uint256 mezoDebtAmount,uint256 solverFeeBps,uint256 nonce,uint256 deadline)"
            )
        );
    }

    function testFuzz_proofRoundTrip(bytes32 id, address u, uint256 coll, uint256 debt, address s) public pure {
        FerryTypes.MezoProof memory p = FerryTypes.MezoProof(FerryTypes.PROOF_VERSION, id, u, coll, debt, s);
        FerryTypes.MezoProof memory q = FerryTypes.decodeProof(FerryTypes.encodeProof(p));
        assertEq(q.version, p.version);
        assertEq(q.intentId, id);
        assertEq(q.user, u);
        assertEq(q.troveColl, coll);
        assertEq(q.troveDebt, debt);
        assertEq(q.solver, s);
    }

    function testFuzz_hashIntentChangesWithEveryField(uint256 a, uint256 b) public pure {
        vm.assume(a != b);
        FerryTypes.MigrationIntent memory i;
        i.nonce = a;
        bytes32 h1 = FerryTypes.hashIntent(i);
        i.nonce = b;
        assertTrue(h1 != FerryTypes.hashIntent(i));
        i.nonce = a;
        i.mezoDebtAmount = 1;
        assertTrue(h1 != FerryTypes.hashIntent(i));
    }
}
