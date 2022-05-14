export interface AmountType {
    EUR: string,
    USD: string,
}

export interface ValueType {
    date: string,
    amount: string,
    created: string,
    currency: string,
}

export interface TransactionType {
    date: string,
    amount: string,
    created: string,
    currency: string,
    flow: string,
    type: string,
}

export interface ValueDataType {
    after: ValueType,
    params: {
        userId: string,
        portfolioId: string,
        accountId: string,
        valueId: string,
    }
}

export interface TransactionDataType {
    after: TransactionType,
    params: {
        userId: string,
        portfolioId: string,
        accountId: string,
        transactionId: string,
    }
}
export interface CashSeriesType {
    date: string,
    income: {},
    spending: {},
    amount: {},
    createdFrom?: string,
    created: string,
}
export interface InvestmentSeriesType {
    date: string,
    inflows: {
        index: {},
        discrete?: {},
        transfer: {},
    },
    outflows: {
        index: {},
        discrete?: {},
        transfer: {},
    },
    amount: {},
    performance?: {},
    createdFrom?: string,
    created: string,
}