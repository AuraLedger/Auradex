interface BaseInfo {
    success: boolean;
    confirmations: number;
    recipient: string;
    value: BigNumber;
    hashedSecret: string;
}

export interface SwapInfo extends BaseInfo {
    timestamp: number;
    refundTime: number;
    spent: boolean;
}

export interface RedeemInfo extends BaseInfo {
    secret: string;
}

export interface RefundInfo extends BaseInfo { }
