// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {FerryEscrow} from "../contracts/ethereum/FerryEscrow.sol";
import {FerryMezo} from "../contracts/mezo/FerryMezo.sol";
import {FerryTypes} from "../contracts/libraries/FerryTypes.sol";
import {IAavePool} from "../contracts/interfaces/IAave.sol";
import {IWormhole} from "../contracts/interfaces/IWormhole.sol";
import {IBorrowerOperationsSignatures, ITroveManager} from "../contracts/interfaces/IMezo.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {
    MockERC20,
    MockAToken,
    MockAavePool,
    MockWormhole,
    MockTroveManager,
    MockBorrowerOperationsSignatures
} from "../contracts/mocks/Mocks.sol";

/// @notice Shared setup: a mocked Sepolia (Aave + Wormhole) and Mezo (MUSD + Wormhole) side by side.
abstract contract FerryFixture is Test {
    uint16 internal constant MEZO_WH_CHAIN = 50;
    uint16 internal constant SEPOLIA_WH_CHAIN = 10002;
    uint256 internal constant TIMEOUT = 6 hours;

    // Sepolia side
    MockAavePool internal pool;
    MockERC20 internal wbtc;
    MockERC20 internal usdc;
    MockERC20 internal usdt;
    MockWormhole internal sepoliaWormhole;
    FerryEscrow internal escrow;

    // Mezo side
    MockWormhole internal mezoWormhole;
    MockTroveManager internal troveManager;
    MockERC20 internal musd;
    MockBorrowerOperationsSignatures internal bos;
    FerryMezo internal ferryMezo;

    uint256 internal userPk = 0xA11CE;
    address internal user;
    address internal solver = makeAddr("solver");
    address internal owner = makeAddr("owner");

    function setUp() public virtual {
        user = vm.addr(userPk);
        vm.warp(1_800_000_000);

        // Mezo
        mezoWormhole = new MockWormhole(MEZO_WH_CHAIN);
        troveManager = new MockTroveManager();
        musd = new MockERC20("Mezo USD", "MUSD", 18);
        bos = new MockBorrowerOperationsSignatures(troveManager, musd);
        ferryMezo = new FerryMezo(
            IBorrowerOperationsSignatures(address(bos)),
            ITroveManager(address(troveManager)),
            IERC20(address(musd)),
            IWormhole(address(mezoWormhole)),
            1,
            owner
        );

        // Sepolia
        pool = new MockAavePool();
        wbtc = new MockERC20("Wrapped BTC", "WBTC", 8);
        usdc = new MockERC20("USD Coin", "USDC", 6);
        usdt = new MockERC20("Tether", "USDT", 6);
        pool.addReserve(address(wbtc), 60_000e8);
        pool.addReserve(address(usdc), 1e8);
        pool.addReserve(address(usdt), 1e8);
        sepoliaWormhole = new MockWormhole(SEPOLIA_WH_CHAIN);
        escrow = new FerryEscrow(
            IAavePool(address(pool)), IWormhole(address(sepoliaWormhole)), MEZO_WH_CHAIN, address(ferryMezo), TIMEOUT
        );

        vm.deal(solver, 100 ether);
        usdc.mint(solver, 10_000_000e6);
        vm.prank(solver);
        usdc.approve(address(escrow), type(uint256).max);
    }

    // ------------------------------------------------------------ Aave position

    function openAavePosition(address who, uint256 wbtcAmount, uint256 usdcDebt) internal {
        wbtc.mint(who, wbtcAmount);
        vm.startPrank(who);
        wbtc.approve(address(pool), wbtcAmount);
        pool.supply(address(wbtc), wbtcAmount, who, 0);
        pool.borrow(address(usdc), usdcDebt, 2, 0, who);
        vm.stopPrank();
    }

    // ------------------------------------------------------------ intents

    function makeIntent(uint256 wbtcAmount, uint256 maxDebtRepay)
        internal
        view
        returns (FerryTypes.MigrationIntent memory i)
    {
        i = FerryTypes.MigrationIntent({
            user: user,
            collateralAsset: address(wbtc),
            collateralAmount: wbtcAmount,
            debtAsset: address(usdc),
            maxDebtRepay: maxDebtRepay,
            mezoCollateral: wbtcAmount * 1e10,
            mezoDebtAmount: maxDebtRepay * 1e12 * 10_030 / 10_000,
            solverFeeBps: 30,
            nonce: escrow.nonces(user),
            deadline: block.timestamp + 1 hours
        });
    }

    function signIntent(uint256 pk, FerryTypes.MigrationIntent memory i) internal view returns (bytes memory) {
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", escrow.domainSeparator(), FerryTypes.hashIntent(i)));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function signPermit(uint256 pk, address token, address spender, uint256 value, uint256 deadline)
        internal
        view
        returns (FerryEscrow.Permit memory p)
    {
        address holder = vm.addr(pk);
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"),
                holder,
                spender,
                value,
                MockERC20(token).nonces(holder),
                deadline
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", MockERC20(token).DOMAIN_SEPARATOR(), structHash));
        (p.v, p.r, p.s) = vm.sign(pk, digest);
        p.value = value;
        p.deadline = deadline;
    }

    function aWbtc() internal view returns (MockAToken) {
        return pool.aToken(address(wbtc));
    }

    function permitFor(uint256 pk, uint256 value) internal view returns (FerryEscrow.Permit memory) {
        return signPermit(pk, address(aWbtc()), address(escrow), value, block.timestamp + 1 hours);
    }

    function runEthLeg(FerryTypes.MigrationIntent memory i) internal returns (bytes32 id) {
        bytes memory sig = signIntent(userPk, i);
        FerryEscrow.Permit memory p = permitFor(userPk, i.collateralAmount * 2);
        vm.prank(solver);
        id = escrow.executeEthLeg(i, sig, p);
    }

    // ------------------------------------------------------------ Mezo

    function signOpenTrove(uint256 pk, uint256 coll, uint256 debt, address recipient, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        address borrower = vm.addr(pk);
        bytes32 structHash = keccak256(
            abi.encodePacked(
                bos.OPEN_TROVE_TYPEHASH(), abi.encode(coll, debt, borrower, recipient), bos.getNonce(borrower), deadline
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", bos.domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function mezoLeg(bytes32 id, FerryTypes.MigrationIntent memory i) internal view returns (FerryMezo.MezoLeg memory) {
        uint256 deadline = block.timestamp + 1 hours;
        return FerryMezo.MezoLeg({
            intentId: id,
            user: i.user,
            mezoCollateral: i.mezoCollateral,
            mezoDebtAmount: i.mezoDebtAmount,
            upperHint: address(0),
            lowerHint: address(0),
            mezoSignature: signOpenTrove(userPk, i.mezoCollateral, i.mezoDebtAmount, address(ferryMezo), deadline),
            deadline: deadline
        });
    }

    function runMezoLeg(bytes32 id, FerryTypes.MigrationIntent memory i) internal returns (bytes memory vaa) {
        FerryMezo.MezoLeg memory leg = mezoLeg(id, i);
        vm.prank(solver);
        uint64 seq = ferryMezo.executeMezoLeg{value: i.mezoCollateral}(leg);
        vaa = sepoliaWormhole.encodeVaa(MEZO_WH_CHAIN, address(ferryMezo), seq, mezoWormhole.lastPayload(), true);
    }
}
