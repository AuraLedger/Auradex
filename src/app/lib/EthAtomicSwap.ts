export class EthAtomicSwap {
    static ContractABI = [
        {
            "constant": true,
            "inputs": [
                {
                    "name": "_hashedSecret",
                    "type": "bytes20"
                }
            ],
            "name": "getRefundTime",
            "outputs": [
                {
                    "name": "",
                    "type": "uint256"
                }
            ],
            "payable": false,
            "stateMutability": "view",
            "type": "function"
        },
        {
            "constant": false,
            "inputs": [
                {
                    "name": "_refundTime",
                    "type": "uint256"
                },
                {
                    "name": "_hashedSecret",
                    "type": "bytes20"
                },
                {
                    "name": "_initiator",
                    "type": "address"
                }
            ],
            "name": "participate",
            "outputs": [],
            "payable": true,
            "stateMutability": "payable",
            "type": "function"
        },
        {
            "constant": true,
            "inputs": [
                {
                    "name": "_hashedSecret",
                    "type": "bytes20"
                }
            ],
            "name": "getValue",
            "outputs": [
                {
                    "name": "",
                    "type": "uint256"
                }
            ],
            "payable": false,
            "stateMutability": "view",
            "type": "function"
        },
        {
            "constant": false,
            "inputs": [
                {
                    "name": "_hashedSecret",
                    "type": "bytes20"
                }
            ],
            "name": "refund",
            "outputs": [],
            "payable": false,
            "stateMutability": "nonpayable",
            "type": "function"
        },
        {
            "constant": true,
            "inputs": [
                {
                    "name": "_hashedSecret",
                    "type": "bytes20"
                }
            ],
            "name": "getInitTimestamp",
            "outputs": [
                {
                    "name": "",
                    "type": "uint256"
                }
            ],
            "payable": false,
            "stateMutability": "view",
            "type": "function"
        },
        {
            "constant": true,
            "inputs": [
                {
                    "name": "_hashedSecret",
                    "type": "bytes20"
                }
            ],
            "name": "getSecret",
            "outputs": [
                {
                    "name": "",
                    "type": "bytes32"
                }
            ],
            "payable": false,
            "stateMutability": "view",
            "type": "function"
        },
        {
            "constant": false,
            "inputs": [
                {
                    "name": "_secret",
                    "type": "bytes32"
                },
                {
                    "name": "_hashedSecret",
                    "type": "bytes20"
                }
            ],
            "name": "redeem",
            "outputs": [],
            "payable": false,
            "stateMutability": "nonpayable",
            "type": "function"
        },
        {
            "constant": true,
            "inputs": [
                {
                    "name": "_hashedSecret",
                    "type": "bytes20"
                }
            ],
            "name": "getEmptied",
            "outputs": [
                {
                    "name": "",
                    "type": "bool"
                }
            ],
            "payable": false,
            "stateMutability": "view",
            "type": "function"
        },
        {
            "constant": true,
            "inputs": [
                {
                    "name": "_hashedSecret",
                    "type": "bytes20"
                }
            ],
            "name": "getParticipant",
            "outputs": [
                {
                    "name": "",
                    "type": "address"
                }
            ],
            "payable": false,
            "stateMutability": "view",
            "type": "function"
        },
        {
            "constant": true,
            "inputs": [
                {
                    "name": "_hashedSecret",
                    "type": "bytes20"
                }
            ],
            "name": "getInitiator",
            "outputs": [
                {
                    "name": "",
                    "type": "address"
                }
            ],
            "payable": false,
            "stateMutability": "view",
            "type": "function"
        },
        {
            "constant": false,
            "inputs": [
                {
                    "name": "_refundTime",
                    "type": "uint256"
                },
                {
                    "name": "_hashedSecret",
                    "type": "bytes20"
                },
                {
                    "name": "_participant",
                    "type": "address"
                }
            ],
            "name": "initiate",
            "outputs": [],
            "payable": true,
            "stateMutability": "payable",
            "type": "function"
        },
        {
            "constant": true,
            "inputs": [
                {
                    "name": "_hashedSecret",
                    "type": "bytes20"
                }
            ],
            "name": "getState",
            "outputs": [
                {
                    "name": "",
                    "type": "uint8"
                }
            ],
            "payable": false,
            "stateMutability": "view",
            "type": "function"
        },
        {
            "constant": true,
            "inputs": [
                {
                    "name": "",
                    "type": "bytes20"
                }
            ],
            "name": "swaps",
            "outputs": [
                {
                    "name": "initTimestamp",
                    "type": "uint256"
                },
                {
                    "name": "refundTime",
                    "type": "uint256"
                },
                {
                    "name": "hashedSecret",
                    "type": "bytes20"
                },
                {
                    "name": "secret",
                    "type": "bytes32"
                },
                {
                    "name": "initiator",
                    "type": "address"
                },
                {
                    "name": "participant",
                    "type": "address"
                },
                {
                    "name": "value",
                    "type": "uint256"
                },
                {
                    "name": "emptied",
                    "type": "bool"
                },
                {
                    "name": "state",
                    "type": "uint8"
                }
            ],
            "payable": false,
            "stateMutability": "view",
            "type": "function"
        },
        {
            "inputs": [],
            "payable": false,
            "stateMutability": "nonpayable",
            "type": "constructor"
        },
        {
            "anonymous": false,
            "inputs": [
                {
                    "indexed": false,
                    "name": "_refundTime",
                    "type": "uint256"
                }
            ],
            "name": "Refunded",
            "type": "event"
        },
        {
            "anonymous": false,
            "inputs": [
                {
                    "indexed": false,
                    "name": "_redeemTime",
                    "type": "uint256"
                }
            ],
            "name": "Redeemed",
            "type": "event"
        },
        {
            "anonymous": false,
            "inputs": [
                {
                    "indexed": false,
                    "name": "_initiator",
                    "type": "address"
                },
                {
                    "indexed": false,
                    "name": "_participator",
                    "type": "address"
                },
                {
                    "indexed": false,
                    "name": "_hashedSecret",
                    "type": "bytes20"
                },
                {
                    "indexed": false,
                    "name": "_value",
                    "type": "uint256"
                }
            ],
            "name": "Participated",
            "type": "event"
        },
        {
            "anonymous": false,
            "inputs": [
                {
                    "indexed": false,
                    "name": "_initTimestamp",
                    "type": "uint256"
                },
                {
                    "indexed": false,
                    "name": "_refundTime",
                    "type": "uint256"
                },
                {
                    "indexed": false,
                    "name": "_hashedSecret",
                    "type": "bytes20"
                },
                {
                    "indexed": false,
                    "name": "_participant",
                    "type": "address"
                },
                {
                    "indexed": false,
                    "name": "_initiator",
                    "type": "address"
                },
                {
                    "indexed": false,
                    "name": "_funds",
                    "type": "uint256"
                }
            ],
            "name": "Initiated",
            "type": "event"
        }
    ];
}

