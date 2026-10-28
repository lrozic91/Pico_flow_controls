// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title PFC Ledger (demo)
/// @notice Simulates Pico Flow Controls' service business on a public ZKsync testnet:
///         order -> service on site -> eLBC alarm -> invoice -> payment.
///         Only ids, amounts and document fingerprints (hashes) go on chain;
///         the documents themselves stay in the company's systems.
/// @dev Demo only. On a private Prividium chain, access to these functions would
///      come from Prividium roles instead of the `roles` mapping.
contract PFCLedger {
    enum Role { None, PFC, Technician, Customer, Auditor }
    enum Status { None, Ordered, Serviced, Invoiced, Paid }

    struct Order {
        bytes32 station;
        address customer;
        uint64 amountCents;
        Status status;
    }

    address public immutable owner;
    mapping(address => Role) public roles;
    mapping(uint256 => Order) public orders;
    uint256 public orderCount;

    event RoleSet(address indexed who, Role role);
    event OrderCreated(uint256 indexed id, bytes32 indexed station, address indexed customer, bytes32 doc);
    event ServiceLogged(uint256 indexed id, bytes32 indexed station, address technician, bytes32 doc);
    event AlarmLogged(bytes32 indexed station, uint8 code, bytes32 doc);
    event InvoiceIssued(uint256 indexed id, uint64 amountCents, bytes32 doc);
    event PaymentConfirmed(uint256 indexed id, address customer);

    modifier only(Role r) {
        require(msg.sender == owner || roles[msg.sender] == r, "role");
        _;
    }

    constructor() {
        owner = msg.sender;
        roles[msg.sender] = Role.PFC;
        emit RoleSet(msg.sender, Role.PFC);
    }

    function setRole(address who, Role r) external {
        require(msg.sender == owner, "owner");
        roles[who] = r;
        emit RoleSet(who, r);
    }

    function createOrder(bytes32 station, address customer, bytes32 doc) external only(Role.PFC) returns (uint256 id) {
        id = ++orderCount;
        orders[id] = Order(station, customer, 0, Status.Ordered);
        emit OrderCreated(id, station, customer, doc);
    }

    function logService(uint256 id, bytes32 doc) external only(Role.Technician) {
        Order storage o = orders[id];
        require(o.status == Status.Ordered, "status");
        o.status = Status.Serviced;
        emit ServiceLogged(id, o.station, msg.sender, doc);
    }

    function logAlarm(bytes32 station, uint8 code, bytes32 doc) external only(Role.Technician) {
        emit AlarmLogged(station, code, doc);
    }

    function issueInvoice(uint256 id, uint64 amountCents, bytes32 doc) external only(Role.PFC) {
        Order storage o = orders[id];
        require(o.status == Status.Serviced, "status");
        o.status = Status.Invoiced;
        o.amountCents = amountCents;
        emit InvoiceIssued(id, amountCents, doc);
    }

    function confirmPayment(uint256 id) external {
        Order storage o = orders[id];
        require(o.status == Status.Invoiced && msg.sender == o.customer, "customer");
        o.status = Status.Paid;
        emit PaymentConfirmed(id, msg.sender);
    }
}
