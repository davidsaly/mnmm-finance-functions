export interface AmountType {
    EUR: string,
    USD: string,
}

export interface ValueType {
    date: string,
    amount: string,
    created: string,
    currency: string,
    createdFrom: string
}

export interface DataType {
    after: ValueType,
    params: {
        userId: string,
        portfolioId: string,
        accountId: string,
        valueId: string,
    }
}

export interface CashSeriesType {
    date: string,
    income: {},
    spending: {},
    amount: {},
    createdFrom: string,
}