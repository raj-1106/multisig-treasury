import { Interface } from 'ethers';

export function encodeERC20Transfer(to: string, amount: string): string {
    const erc20Interface = new Interface([
        "function transfer(address to, uint256 amount) returns (bool)"
    ]);
    return erc20Interface.encodeFunctionData("transfer", [to, amount]);
}

export function encodeERC20Approve(spender: string, amount: string): string {
    const erc20Interface = new Interface([
        "function approve(address spender, uint256 amount) returns (bool)"
    ]);
    return erc20Interface.encodeFunctionData("approve", [spender, amount]);
}
