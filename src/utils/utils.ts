import { InvestmentSeriesType, CashSeriesType } from "../types";
import { set, cloneDeep } from 'lodash';

export const initialInvestmentSeries = (listOfCurrencies: string[], date: string, dateCreated: string, createdFrom: string, amount?: any) => {
    const zeros = {};
    const hundreds = {};
    listOfCurrencies.forEach(ccy => {
        set(zeros, `${ccy}`, '0');
        set(hundreds, `${ccy}`, '100');
    })
    const zeroSeries: InvestmentSeriesType = {
        date, // does not really matter
        amount: amount || cloneDeep(zeros),
        inflows: {
            index: cloneDeep(zeros),
            transfer: cloneDeep(zeros),
        },
        outflows: {
            index: cloneDeep(zeros),
            transfer: cloneDeep(zeros),
        },
        created: dateCreated,
        performance: cloneDeep(hundreds),
        createdFrom,
    }
    return zeroSeries;
}

export const initialCashSeries = (listOfCurrencies: string[], date: string, dateCreated: string, createdFrom: string, amount?: any) => {
    const zeros = {};
    listOfCurrencies.forEach(ccy => {
        set(zeros, `${ccy}`, '0');
    })
    const zeroSeries: CashSeriesType = {
        date,
        amount: amount || cloneDeep(zeros),
        income: cloneDeep(zeros),
        spending: cloneDeep(zeros),
        createdFrom,
        created: dateCreated,
    }
    return zeroSeries
}