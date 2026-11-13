// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Test-only mocks of Aave V3, Wormhole and Mezo MUSD. Never deployed to a live network.

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ReserveData} from "../interfaces/IAave.sol";
import {IWormhole} from "../interfaces/IWormhole.sol";

contract MockERC20 is ERC20Permit {
    uint8 private immutable _decimals;

    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) ERC20Permit(name_) {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external {
        _burn(from, amount);
    }
}

/// @notice aToken: ERC-20 + permit, minted/burned by the pool.
contract MockAToken is MockERC20 {
    address public immutable pool;
    address public immutable UNDERLYING_ASSET_ADDRESS;

    constructor(address pool_, address underlying, uint8 decimals_) MockERC20("Aave Mock aToken", "aMOCK", decimals_) {
        pool = pool_;
        UNDERLYING_ASSET_ADDRESS = underlying;
    }
}

contract MockOracle {
    mapping(address => uint256) public getAssetPrice;

    function setPrice(address asset, uint256 price) external {
        getAssetPrice[asset] = price;
    }
}

/// @notice Minimal Aave V3 pool: 1 aToken = 1 underlying, variable debt tracked by a MockERC20 debt token.
contract MockAavePool {
    struct Reserve {
        MockAToken aToken;
        MockERC20 debtToken;
    }

    mapping(address => Reserve) public reserves;
    address[] public reserveList;
    MockOracle public immutable oracle;

    constructor() {
        oracle = new MockOracle();
    }

    function addReserve(address asset, uint256 price) external {
        uint8 dec = MockERC20(asset).decimals();
        reserves[asset] = Reserve(new MockAToken(address(this), asset, dec), new MockERC20("Variable Debt", "vDebt", dec));
        reserveList.push(asset);
        oracle.setPrice(asset, price);
    }

    function aToken(address asset) external view returns (MockAToken) {
        return reserves[asset].aToken;
    }

    function debtToken(address asset) external view returns (MockERC20) {
        return reserves[asset].debtToken;
    }

    function supply(address asset, uint256 amount, address onBehalfOf, uint16) external {
        MockERC20(asset).transferFrom(msg.sender, address(this), amount);
        reserves[asset].aToken.mint(onBehalfOf, amount);
    }

    function borrow(address asset, uint256 amount, uint256, uint16, address onBehalfOf) external {
        require(msg.sender == onBehalfOf, "mock: borrow on behalf");
        reserves[asset].debtToken.mint(onBehalfOf, amount);
        MockERC20(asset).mint(onBehalfOf, amount);
    }

    /// @notice Test helper: simulate interest accrual.
    function accrue(address asset, address user, uint256 amount) external {
        reserves[asset].debtToken.mint(user, amount);
    }

    function repay(address asset, uint256 amount, uint256, address onBehalfOf) external returns (uint256) {
        require(amount != type(uint256).max || msg.sender == onBehalfOf, "NO_EXPLICIT_AMOUNT_TO_REPAY_ON_BEHALF");
        uint256 debt = reserves[asset].debtToken.balanceOf(onBehalfOf);
        uint256 paid = amount > debt ? debt : amount;
        MockERC20(asset).transferFrom(msg.sender, address(this), paid);
        reserves[asset].debtToken.burn(onBehalfOf, paid);
        return paid;
    }

    function withdraw(address asset, uint256 amount, address to) external returns (uint256) {
        MockAToken a = reserves[asset].aToken;
        if (amount == type(uint256).max) amount = a.balanceOf(msg.sender);
        a.burn(msg.sender, amount);
        MockERC20(asset).transfer(to, amount);
        return amount;
    }

    function getReserveData(address asset) external view returns (ReserveData memory d) {
        d.aTokenAddress = address(reserves[asset].aToken);
        d.variableDebtTokenAddress = address(reserves[asset].debtToken);
        d.currentVariableBorrowRate = 5e25; // 5%
    }

    function getReservesList() external view returns (address[] memory) {
        return reserveList;
    }

    function getUserAccountData(address user)
        external
        view
        returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 a, uint256 b, uint256 c, uint256 hf)
    {
        for (uint256 i; i < reserveList.length; i++) {
            address asset = reserveList[i];
            uint256 unit = 10 ** MockERC20(asset).decimals();
            uint256 price = oracle.getAssetPrice(asset);
            totalCollateralBase += reserves[asset].aToken.balanceOf(user) * price / unit;
            totalDebtBase += reserves[asset].debtToken.balanceOf(user) * price / unit;
        }
    }

    function ADDRESSES_PROVIDER() external view returns (address) {
        return address(this);
    }

    function getPriceOracle() external view returns (address) {
        return address(oracle);
    }
}

/// @notice Wormhole core mock. "VAAs" are abi.encode(chainId, emitter, sequence, payload, valid).
contract MockWormhole {
    uint16 public immutable chainId;
    uint256 public messageFee;
    uint64 public nextSequence;
    bytes public lastPayload;
    address public lastSender;

    constructor(uint16 chainId_) {
        chainId = chainId_;
    }

    function setMessageFee(uint256 fee) external {
        messageFee = fee;
    }

    function publishMessage(uint32, bytes memory payload, uint8) external payable returns (uint64 sequence) {
        require(msg.value == messageFee, "mock: wrong fee");
        lastPayload = payload;
        lastSender = msg.sender;
        sequence = nextSequence++;
    }

    function encodeVaa(uint16 emitterChain, address emitter, uint64 sequence, bytes memory payload, bool valid)
        external
        pure
        returns (bytes memory)
    {
        return abi.encode(emitterChain, bytes32(uint256(uint160(emitter))), sequence, payload, valid);
    }

    function parseAndVerifyVM(bytes calldata encodedVM)
        external
        pure
        returns (IWormhole.VM memory vm, bool valid, string memory reason)
    {
        (vm.emitterChainId, vm.emitterAddress, vm.sequence, vm.payload, valid) =
            abi.decode(encodedVM, (uint16, bytes32, uint64, bytes, bool));
        vm.hash = keccak256(abi.encode(vm.emitterChainId, vm.emitterAddress, vm.sequence, vm.payload));
        reason = valid ? "" : "mock: invalid signatures";
    }
}

contract MockTroveManager {
    mapping(address => uint8) public status;
    mapping(address => uint256) public getTroveColl;
    mapping(address => uint256) public getTroveDebt;

    function getTroveStatus(address borrower) external view returns (uint8) {
        return status[borrower];
    }

    function open(address borrower, uint256 coll, uint256 debt) external {
        require(status[borrower] != 1, "BorrowerOps: Trove is active");
        status[borrower] = 1;
        getTroveColl[borrower] = coll;
        getTroveDebt[borrower] = debt;
    }
}

/// @notice Mirrors Mezo's BorrowerOperationsSignatures OpenTrove signature scheme and trove debt maths.
contract MockBorrowerOperationsSignatures is EIP712 {
    bytes32 public constant OPEN_TROVE_TYPEHASH = keccak256(
        "OpenTrove(uint256 assetAmount,uint256 debtAmount,address borrower,address recipient,uint256 nonce,uint256 deadline)"
    );
    uint256 public constant GAS_COMP = 200e18;
    uint256 public constant MIN_NET_DEBT = 1800e18;

    MockTroveManager public immutable troveManager;
    MockERC20 public immutable musd;
    mapping(address => uint256) public getNonce;

    constructor(MockTroveManager tm, MockERC20 musd_) EIP712("BorrowerOperationsSignatures", "1") {
        troveManager = tm;
        musd = musd_;
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    function openTroveWithSignature(
        uint256 debtAmount,
        address,
        address,
        address borrower,
        address recipient,
        bytes memory signature,
        uint256 deadline
    ) external payable {
        require(block.timestamp <= deadline, "Signature expired");
        bytes32 digest = _hashTypedDataV4(
            keccak256(
                abi.encodePacked(
                    OPEN_TROVE_TYPEHASH,
                    abi.encode(msg.value, debtAmount, borrower, recipient),
                    getNonce[borrower],
                    deadline
                )
            )
        );
        require(ECDSA.recover(digest, signature) == borrower, "BorrowerOperationsSignatures: Invalid signature");
        getNonce[borrower]++;

        uint256 fee = debtAmount / 1000;
        require(debtAmount + fee >= MIN_NET_DEBT, "BorrowerOps: Trove's net debt must be greater than minimum");
        troveManager.open(borrower, msg.value, debtAmount + fee + GAS_COMP);
        musd.mint(recipient, debtAmount);
    }
}
