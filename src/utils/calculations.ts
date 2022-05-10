import { CashSeriesType, ValueType } from "../types";
import { convertIntoListOfCurrencies } from "./convert";
import { get, clone, set } from 'lodash';
import { subtract, isNegative, add, round } from 'mathjs'

// const addMultiAmounts = (multiAmount1, multiAMount2) => {

// }

/** IMPACTS
 *  based on: https://app.nuclino.com/mnml/Finance-App/Series-Impacts-01bb8e6b-6d92-4a67-95e2-58ea3a4ebac3
 */
export async function impactCashByValue (previousSeries: any, value: ValueType, listOfCurrencies: string[]) {
    // amount
    const newAmount = await convertIntoListOfCurrencies(value.amount, value.currency, listOfCurrencies, value.date);
    // income and spending
    const newIncome = clone(previousSeries.income);
    const newSpending = clone(previousSeries.spending);
    listOfCurrencies.forEach(ccy => {
        const previousAmount = get(previousSeries, `amount.${ccy}`);
        const currentAmount = get(newAmount, ccy);
        const diff = subtract(currentAmount,previousAmount);
        if (isNegative(diff)) {
            const val = round(add(get(newSpending, ccy), diff), 2).toString();
            set(newSpending, ccy, val.toString());
        } else {
            const val = round(add(get(newIncome, ccy), diff), 2).toString();
            set(newIncome, ccy, val.toString());
        }
    })
    const res: CashSeriesType = {
        amount: newAmount,
        income: newIncome,
        spending: newSpending,
        date: value.date,
        createdFrom: 'value'
    };
    return res;
}

// export const impactCashByTransaction = (previousSeries, transaction) => {
    
// }

// export const impactInvestmentByValue = (previousSeries, value) => {
    
// }

// export const impactInvestmentByTransaction = (previousSeries, transaction) => {
    
// }