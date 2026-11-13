// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IWormhole} from "../interfaces/IWormhole.sol";

/// @title VaaVerifier (Sepolia, M2 only)
/// @notice Small contract that proves a VAA emitted by FerryMezo on Mezo testnet verifies against the Sepolia
///         Wormhole core. Not used by the production flow (FerryEscrow does the same checks in `finalize`).
contract VaaVerifier {
    IWormhole public immutable wormhole;
    uint16 public immutable expectedChainId;
    bytes32 public immutable expectedEmitter;

    event VaaVerified(uint16 emitterChainId, bytes32 emitterAddress, uint64 sequence, bytes32 hash, bytes payload);

    error InvalidVaa(string reason);
    error WrongEmitter();

    constructor(IWormhole _wormhole, uint16 _expectedChainId, address _expectedEmitter) {
        wormhole = _wormhole;
        expectedChainId = _expectedChainId;
        expectedEmitter = bytes32(uint256(uint160(_expectedEmitter)));
    }

    function verify(bytes calldata encodedVaa) external returns (bytes memory payload) {
        (IWormhole.VM memory vm, bool valid, string memory reason) = wormhole.parseAndVerifyVM(encodedVaa);
        if (!valid) revert InvalidVaa(reason);
        if (vm.emitterChainId != expectedChainId || vm.emitterAddress != expectedEmitter) revert WrongEmitter();
        emit VaaVerified(vm.emitterChainId, vm.emitterAddress, vm.sequence, vm.hash, vm.payload);
        return vm.payload;
    }
}
