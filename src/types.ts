export interface AmountType {
    EUR: string,
    USD: string,
}

export interface ValueType {
    date: string,
    amount: string,
    created: any,
    currency: string,
    previousRef?: string,
    nextRef?: string,
    ordering?: string,
    orderingRef?: string,
}

export interface TransactionType {
    date: string,
    amount: string,
    created: any,
    currency: string,
    flow: string,
    type: string,
    previousRef?: string,
    nextRef?: string,
    ordering?: string,
    orderingRef?: string,
}

export interface ValueDataType {
    type: 'ValueDataType'
    after: ValueType,
    params: {
        userId: string,
        portfolioId: string,
        accountId: string,
        valueId: string,
    }
}

export interface TransactionDataType {
    type: 'TransactionDataType',
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
    createdFromRef?: string,
    created: any,
    nextRef?: string,
    previousRef?: string,
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
    createdFromRef?: string,
    created: any,
    nextRef?: string,
    previousRef?: string,
}