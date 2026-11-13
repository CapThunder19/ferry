// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title FerryTypes
/// @notice Shared structs, EIP-712 typehash and the Wormhole payload codec used by FerryEscrow (Sepolia)
///         and FerryMezo (Mezo testnet).
library FerryTypes {
    /// @notice What the user signs on Sepolia (EIP-712, domain = FerryEscrow).
    struct MigrationIntent {
        address user;
        address collateralAsset; // WBTC on Sepolia
        uint256 collateralAmount; // minimum WBTC (8 dec) that must be moved; v1 moves the full aToken balance
        address debtAsset; // USDC or USDT on Sepolia
        uint256 maxDebtRepay; // max debt (debt asset decimals) the solver may repay on Aave
        uint256 mezoCollateral; // BTC (18 dec) the trove must receive
        uint256 mezoDebtAmount; // MUSD debtAmount the user authorises on Mezo
        uint256 solverFeeBps; // informational + capped on chain
        uint256 nonce;
        uint256 deadline;
    }

    bytes32 internal constant MIGRATION_INTENT_TYPEHASH = keccak256(
        "MigrationIntent(address user,address collateralAsset,uint256 collateralAmount,address debtAsset,uint256 maxDebtRepay,uint256 mezoCollateral,uint256 mezoDebtAmount,uint256 solverFeeBps,uint256 nonce,uint256 deadline)"
    );

    /// @notice Payload version for a completed Mezo leg. Version 0 is reserved for test pings (M2).
    uint8 internal constant PROOF_VERSION = 1;
    uint8 internal constant PING_VERSION = 0;

    /// @notice What FerryMezo proves to FerryEscrow through Wormhole.
    struct MezoProof {
        uint8 version;
        bytes32 intentId;
        address user;
        uint256 troveColl;
        uint256 troveDebt;
        address solver;
    }

    function hashIntent(MigrationIntent memory i) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                MIGRATION_INTENT_TYPEHASH,
                i.user,
                i.collateralAsset,
                i.collateralAmount,
                i.debtAsset,
                i.maxDebtRepay,
                i.mezoCollateral,
                i.mezoDebtAmount,
                i.solverFeeBps,
                i.nonce,
                i.deadline
            )
        );
    }

    function encodeProof(MezoProof memory p) internal pure returns (bytes memory) {
        return abi.encode(p.version, p.intentId, p.user, p.troveColl, p.troveDebt, p.solver);
    }

    /// @notice Reads only the leading version word, so payloads of other versions (e.g. pings) fail cleanly.
    function payloadVersion(bytes memory payload) internal pure returns (uint8) {
        if (payload.length < 32) return type(uint8).max;
        return uint8(abi.decode(payload, (uint256)));
    }

    function decodeProof(bytes memory payload) internal pure returns (MezoProof memory p) {
        (p.version, p.intentId, p.user, p.troveColl, p.troveDebt, p.solver) =
            abi.decode(payload, (uint8, bytes32, address, uint256, uint256, address));
    }

    function toBytes32(address a) internal pure returns (bytes32) {
        return bytes32(uint256(uint160(a)));
    }
}
