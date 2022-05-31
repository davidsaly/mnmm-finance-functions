import { CashSeriesType, ValueType, TransactionType, InvestmentSeriesType } from "../types";
import { convertIntoListOfCurrencies } from "./convert";
import { get, cloneDeep, set } from 'lodash';
import { subtract, isNegative, isPositive, add, round, divide, multiply, sum } from 'mathjs';
import { differenceInCalendarDays, formatISO, parseISO } from 'date-fns'
import { findPreviousSeries, getAccountsForPortfolio } from "./dataCalls";
import { initialInvestmentSeries } from "./utils";

// const addMultiAmounts = (multiAmount1, multiAMount2) => {

// }

/** IMPACTS
 *  based on: https://app.nuclino.com/mnml/Finance-App/Series-Impacts-01bb8e6b-6d92-4a67-95e2-58ea3a4ebac3
 */
export async function impactCashByValue(previousSeries: any, value: ValueType, listOfCurrencies: string[]) {
    // amount
    const newAmount = await convertIntoListOfCurrencies(value.amount, value.currency, listOfCurrencies, value.date);
    // income and spending
    const newIncome = cloneDeep(previousSeries.income);
    const newSpending = cloneDeep(previousSeries.spending);
    listOfCurrencies.forEach(ccy => {
        const previousAmount = get(previousSeries, `amount.${ccy}`);
        const currentAmount = get(newAmount, ccy);
        const diff = subtract(currentAmount, previousAmount);
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
        createdFrom: 'value',
        created: value.created,
        // valueRef: 'ref', TODO
    };
    return res;
}

export async function impactCashByTransaction(previousSeries: any, transaction: TransactionType, listOfCurrencies: string[], initial: boolean) {
    // amount
    const txAmount = await convertIntoListOfCurrencies(transaction.amount, transaction.currency, listOfCurrencies, transaction.date);
    // income and spending
    const newAmount = cloneDeep(previousSeries.amount);
    const newIncome = cloneDeep(previousSeries.income);
    const newSpending = cloneDeep(previousSeries.spending);
    listOfCurrencies.forEach(ccy => {
        const impact = get(txAmount, ccy);
        const val = round(add(get(newAmount, ccy), impact), 2).toString();
        set(newAmount, ccy, val.toString());
        if (transaction.type !== 'Transfer') {
            if (isNegative(impact)) {
                const val = round(add(get(newSpending, ccy), impact), 2).toString();
                set(newSpending, ccy, val.toString());
            } else {
                const val = round(add(get(newIncome, ccy), impact), 2).toString();
                set(newIncome, ccy, val.toString());
            }
        }
    })
    const res: CashSeriesType = {
        amount: newAmount,
        income: newIncome,
        spending: newSpending,
        date: transaction.date,
        createdFrom: initial ? 'initial' : 'transaction',
        created: transaction.created,
        // transactionRef: 'ref', TODO
    };
    return res;
}

export async function impactInvestmentByValue(previousPerf: any, previousSeries: any,
    transactionSeriesList: any, value: any,
    listOfCurrencies: string[], amount: any) {
    // inflows and outflows not impacted
    // performance calculation
    const newSeries: InvestmentSeriesType = {
        amount,
        inflows: {
            index: previousSeries.inflows.index,
            transfer: previousSeries.inflows.transfer,
        },
        outflows: {
            index: previousSeries.outflows.index,
            transfer: previousSeries.inflows.transfer,
        },
        date: value.date,
        createdFrom: 'value',
        created: value.created,
        // valueRef: 'ref', TODO
    };
    let newPerformance: any;
    newPerformance = calculatePerformance(previousPerf.date, previousPerf, newSeries, transactionSeriesList, listOfCurrencies);
    set(newSeries, 'performance', newPerformance);
    return newSeries;
}

export async function impactInvestmentByTransaction(previousSeries: any, transaction: TransactionType | ValueType, listOfCurrencies: string[], initial: boolean) {
    // amount
    const txAmount = await convertIntoListOfCurrencies(transaction.amount, transaction.currency, listOfCurrencies, transaction.date);
    // income and spending
    const newAmount = cloneDeep(previousSeries.amount);
    const newInflows = cloneDeep(previousSeries.inflows);
    const newOutflows = cloneDeep(previousSeries.outflows);
    const newPerformance = cloneDeep(previousSeries.performance);

    listOfCurrencies.forEach(ccy => {
        const impact = get(txAmount, ccy);
        const amount = round(add(get(newAmount, ccy), impact), 2).toString();
        set(newAmount, ccy, amount);
        const inflowsImpact = isPositive(impact) ? impact : '0';
        const outflowsImpact = isNegative(impact) ? impact : '0';
        const inflowsTransferImpact = get(transaction, 'type') === 'Transfer' ? inflowsImpact : '0';
        const outflowsTransferImpact = get(transaction, 'type') === 'Transfer' ? outflowsImpact : '0';

        set(newInflows, `index.${ccy}`, round(add(get(newInflows, `index.${ccy}`), inflowsImpact), 2).toString());
        set(newInflows, `discrete.${ccy}`, round(inflowsImpact, 2).toString());
        set(newInflows, `transfer.${ccy}`, round(add(get(newInflows, `transfer.${ccy}`), inflowsTransferImpact), 2).toString());
        set(newOutflows, `index.${ccy}`, round(add(get(newOutflows, `index.${ccy}`), outflowsImpact), 2).toString());
        set(newOutflows, `discrete.${ccy}`, round(outflowsImpact, 2).toString());
        set(newOutflows, `transfer.${ccy}`, round(add(get(newOutflows, `transfer.${ccy}`), outflowsTransferImpact), 2).toString());
    })

    const res: InvestmentSeriesType = {
        amount: newAmount,
        inflows: newInflows,
        outflows: newOutflows,
        date: transaction.date,
        createdFrom: initial ? 'initial' : 'transaction',
        created: transaction.created,
        performance: newPerformance,
        // transactionRef: 'ref', TODO
    };
    return res;
}

/**
 * (PL_2 - PL_1)/(Value_1 + time weighted sum of TX flows between t1 and t2) 
 * PL = Value - (Inflows - Outflows)
 */
const calculatePerformance = (previousPerfDate: any, previousSeries: any, thisSeries: any, transactionSeries: any, listOfCurrencies: string[]) => {
    console.log('calculating performance for series');
    const res: any = {};
    listOfCurrencies.forEach((ccy: any) => {
        const Performance_1 = get(previousSeries, `performance.${ccy}`);
        const Value_1 = get(previousSeries, `amount.${ccy}`);
        const Inflows_1 = get(previousSeries, `inflows.index.${ccy}`);
        const Outflows_1 = get(previousSeries, `outflows.index.${ccy}`);
        const Value_2 = get(thisSeries, `amount.${ccy}`);
        const Inflows_2 = get(thisSeries, `inflows.index.${ccy}`);
        const Outflows_2 = get(thisSeries, `outflows.index.${ccy}`);
        const PL_1 = subtract(Value_1, subtract(Inflows_1, Outflows_1));
        const PL_2 = subtract(Value_2, subtract(Inflows_2, Outflows_2));
        const Date_1 = previousPerfDate;
        const Date_2 = thisSeries.date;
        const sumOfFlows = timeWeightedSumOfFlows(Date_1, Date_2, transactionSeries, ccy);
        const performance = divide(subtract(PL_2, PL_1), add(Value_1, sumOfFlows));
        const index = multiply(Performance_1, add(1, performance));
        res[ccy] = round(index, 3).toString();
    });
    return res;
}

const timeWeightedSumOfFlows = (date1: any, date2: any, transactionSeries: any, currency: string) => {
    if (transactionSeries.length) {
        const totalDayDiff = differenceInCalendarDays(parseISO(date2), parseISO(date1));
        const weightedFlows = transactionSeries.map((s: any) => {
            const tx = s.data();
            const inflow = get(tx, `inflows.discrete.${currency}`);
            const outflow = get(tx, `outflows.discrete.${currency}`);
            const flow = inflow === '0' ? outflow : inflow;
            const daysUntilTransaction = differenceInCalendarDays(parseISO(tx.date), parseISO(date1));
            let timeWeight;
            if (totalDayDiff === 0) {
                timeWeight = 0.5;
            } else {
                timeWeight = subtract(1, divide(daysUntilTransaction, totalDayDiff));
            }
            return multiply(flow, timeWeight);
        });
        const sumOfFlows = sum(weightedFlows);
        return sumOfFlows;
    } else {
        return '0';
    }
}

export const aggregateCashSeries = (date: string, accountSeries: CashSeriesType[], listOfCurrencies: string[]) => {
    const zeros = {};
    listOfCurrencies.forEach(ccy => {
        set(zeros, `${ccy}`, '0');
    })
    const newSeries: CashSeriesType = {
        date,
        amount: cloneDeep(zeros),
        income: cloneDeep(zeros),
        spending: cloneDeep(zeros),
        created: formatISO(new Date(), { format: 'basic' }),
    }
    accountSeries.forEach(acc => {
        listOfCurrencies.forEach(ccy => {
            const amountToAdd = get(acc, `amount.${ccy}`);
            const incomeToAdd = get(acc, `income.${ccy}`);
            const spendingToAdd = get(acc, `spending.${ccy}`);
            set(newSeries, `amount.${ccy}`, add(amountToAdd, get(newSeries, `amount.${ccy}`)));
            set(newSeries, `income.${ccy}`, add(incomeToAdd, get(newSeries, `income.${ccy}`)));
            set(newSeries, `spending.${ccy}`, add(spendingToAdd, get(newSeries, `spending.${ccy}`)));
        })
    })
    console.log('New Cash Series', newSeries);
    return newSeries;
}

export const aggregateInvestmentSeries = (date: string, accountSeries: InvestmentSeriesType[], listOfCurrencies: string[]) => {
    const newSeries = initialInvestmentSeries(listOfCurrencies, date, formatISO(new Date(), { format: 'basic' }), 'value')
    accountSeries.forEach(acc => {
        listOfCurrencies.forEach(ccy => {
            const amountToAdd = get(acc, `amount.${ccy}`);
            const inflowsIndexToAdd = get(acc, `inflows.index.${ccy}`);
            const inflowsTransferToAdd = get(acc, `inflows.transfer.${ccy}`);
            const outflowsIndexToAdd = get(acc, `outflows.index.${ccy}`);
            const outflowsTransferToAdd = get(acc, `outflows.transfer.${ccy}`);
            set(newSeries, `amount.${ccy}`, add(amountToAdd, get(newSeries, `amount.${ccy}`)));
            set(newSeries, `inflows.index.${ccy}`, add(inflowsIndexToAdd, get(newSeries, `inflows.index.${ccy}`)))
            set(newSeries, `inflows.transfer.${ccy}`, add(inflowsTransferToAdd, get(newSeries, `inflows.transfer.${ccy}`)))
            set(newSeries, `outflows.index.${ccy}`, add(outflowsIndexToAdd, get(newSeries, `outflows.index.${ccy}`)))
            set(newSeries, `inflows.transfer.${ccy}`, add(outflowsTransferToAdd, get(newSeries, `inflows.transfer.${ccy}`)))
        })
    })
    console.log('New Investment Series', newSeries);
    return newSeries;
}

export const createAccountsAggregation = async (userId: string, portfolioId: string, date: string, listOfCurrencies: string[], pfType: string) => {
    // find all most recent account series
    const accounts = await getAccountsForPortfolio(userId, portfolioId);
    const series: any[] = [];
    for (let index = 0; index < accounts.length; index++) {
        const previousSeries = await findPreviousSeries({
            date,
            userId,
            pfId: portfolioId,
            accountId: accounts[index].id,
            dateEquality: '<='
        });
        if (previousSeries?.length) {
            series.push(previousSeries[0].data());
        }
    }
    let aggregate: InvestmentSeriesType | CashSeriesType;
    if (pfType === 'performing') {
        aggregate = aggregateInvestmentSeries(date, series, listOfCurrencies);
    } else {
        aggregate = aggregateCashSeries(date, series, listOfCurrencies);
    }
    return aggregate;
}